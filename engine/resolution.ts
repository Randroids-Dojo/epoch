/**
 * Epoch resolution — the 8-step simultaneous execution pipeline (GDD §3.2 & §5.3).
 *
 * Resolution order:
 *   1. Defend    — damage resistance flags set
 *   2. Temporal  — time abilities (MVP: Echo only)
 *   3. Move      — all movement, in map order
 *   4. Attack    — all damage computed simultaneously, then applied
 *   5. Build     — construction progress ticks
 *   6. Upgrade   — research progress (deferred: no tech tree in MVP)
 *   7. Gather    — resource harvesting
 *   8. Train     — new units spawned
 *
 * Within each tier, commands are processed in map order:
 * sort by source hex (r ascending, then q ascending).
 */

import {
  hexDistance, hexKey, hexNeighbors, hexEqual, Hex,
} from './hex';
import { TERRAIN } from './terrain';
import {
  GameState, findNexus, findUnitAt, findStructureAt, newId,
} from './state';
import {
  AttackCommand, BuildCommand, Command, DefendCommand,
  GatherCommand, MoveCommand, TemporalCommand, TrainCommand,
} from './commands';
import { PlayerId, opponent } from './player';
import { UNIT_DEFS, UnitType } from './units';
import { STRUCTURE_DEFS, isComplete } from './structures';
import { computeFog } from './map';

/** CC per epoch from a staffed Crystal Extractor. */
const EXTRACTOR_YIELD_CC = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommandEntry {
  owner: PlayerId;
  command: Command;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collect all non-null commands from both players, tagged with owner. */
function gatherCommands(state: GameState): CommandEntry[] {
  const entries: CommandEntry[] = [];
  for (const pid of ['player', 'ai'] as PlayerId[]) {
    for (const cmd of state.players[pid].commands) {
      if (cmd !== null) entries.push({ owner: pid, command: cmd });
    }
  }
  return entries;
}

/** Compare two hexes for map order (r asc, then q asc). */
function mapOrder(a: Hex, b: Hex): number {
  return a.r !== b.r ? a.r - b.r : a.q - b.q;
}

/**
 * BFS shortest path from `from` to `to`, treating `blocked` as impassable.
 * Returns the list of hexes to traverse (not including `from`), or [] if unreachable.
 */
function bfsPath(from: Hex, to: Hex, state: GameState, blocked: Set<string>): Hex[] {
  if (hexEqual(from, to)) return [];
  const parent = new Map<string, Hex | null>([[hexKey(from), null]]);
  const queue: Hex[] = [from];

  while (queue.length > 0) {
    const hex = queue.shift()!;
    for (const nb of hexNeighbors(hex)) {
      const key = hexKey(nb);
      if (parent.has(key) || blocked.has(key)) continue;
      const cell = state.map.cells.get(key);
      if (!cell || !TERRAIN[cell.terrain].passable) continue;
      parent.set(key, hex);
      if (hexEqual(nb, to)) {
        // Reconstruct path (excluding from)
        const path: Hex[] = [];
        let cur: Hex = nb;
        while (!hexEqual(cur, from)) {
          path.unshift(cur);
          const p = parent.get(hexKey(cur));
          if (!p) break;
          cur = p;
        }
        return path;
      }
      queue.push(nb);
    }
  }
  return [];
}

// ── Step 1: Defend ────────────────────────────────────────────────────────────

function stepDefend(state: GameState, commands: CommandEntry[], log: string[]): void {
  // Clear defending flags from previous epoch.
  for (const unit of state.units.values()) {
    unit.isDefending = false;
  }

  const defends = commands.filter(
    (e): e is { owner: PlayerId; command: DefendCommand } => e.command.type === 'defend',
  );

  for (const { owner, command } of defends) {
    const unit = state.units.get(command.unitId);
    if (!unit || unit.owner !== owner) continue;
    unit.isDefending = true;
    log.push(`${owner} ${unit.type} is defending`);
  }
}

// ── Step 2: Temporal ─────────────────────────────────────────────────────────

function stepTemporal(state: GameState, commands: CommandEntry[], log: string[]): void {
  const temporals = commands.filter(
    (e): e is { owner: PlayerId; command: TemporalCommand } => e.command.type === 'temporal',
  );

  for (const { owner, command } of temporals) {
    const player = state.players[owner];
    if (player.resources.te < command.teCost) {
      log.push(`${owner} Temporal Echo failed — insufficient TE`);
      continue;
    }
    player.resources.te -= command.teCost;

    if (command.ability === 'echo') {
      // MVP: Temporal Echo effect is surfaced to the UI layer; resolution just logs it.
      log.push(`${owner} used Temporal Echo (-${command.teCost} TE)`);
    }
  }
}

// ── Step 3: Move ─────────────────────────────────────────────────────────────

function stepMove(state: GameState, commands: CommandEntry[], log: string[]): void {
  const moves = commands
    .filter((e): e is { owner: PlayerId; command: MoveCommand } => e.command.type === 'move')
    .sort((a, b) => {
      const ua = state.units.get(a.command.unitId);
      const ub = state.units.get(b.command.unitId);
      if (!ua || !ub) return 0;
      return mapOrder(ua.hex, ub.hex);
    });

  for (const { owner, command } of moves) {
    const unit = state.units.get(command.unitId);
    if (!unit || unit.owner !== owner) continue;

    const def  = UNIT_DEFS[unit.type];
    // Blocked = all other units' current hexes (structures don't block movement).
    const blocked = new Set<string>();
    for (const [id, u] of state.units) {
      if (id !== unit.id) blocked.add(hexKey(u.hex));
    }

    const path  = bfsPath(unit.hex, command.targetHex, state, blocked);
    const steps = path.slice(0, def.speed);
    if (steps.length === 0) continue;

    const dest = steps[steps.length - 1];
    unit.hex = dest;
    log.push(`${owner} ${unit.type} → (${dest.q},${dest.r})`);
  }
}

// ── Step 4: Attack ────────────────────────────────────────────────────────────

function stepAttack(state: GameState, commands: CommandEntry[], log: string[]): void {
  const attacks = commands
    .filter((e): e is { owner: PlayerId; command: AttackCommand } => e.command.type === 'attack')
    .sort((a, b) => {
      const ua = state.units.get(a.command.unitId);
      const ub = state.units.get(b.command.unitId);
      if (!ua || !ub) return 0;
      return mapOrder(ua.hex, ub.hex);
    });

  // Accumulate damage simultaneously, then apply.
  const unitDamage      = new Map<string, number>();
  const structDamage    = new Map<string, number>();

  for (const { owner, command } of attacks) {
    const attacker = state.units.get(command.unitId);
    if (!attacker || attacker.owner !== owner) continue;

    const def = UNIT_DEFS[attacker.type];
    if (def.range === 0) continue; // Drones cannot attack.

    const foe = opponent(owner);

    // Find enemy unit at target hex first; else enemy structure.
    const targetUnit   = findUnitAt(state, command.targetHex, foe);
    const targetStruct = targetUnit ? undefined : findStructureAt(state, command.targetHex, foe);

    if (!targetUnit && !targetStruct) continue;

    const targetHex = targetUnit ? targetUnit.hex : targetStruct!.hex;
    if (hexDistance(attacker.hex, targetHex) > def.range) continue;

    if (targetUnit) {
      const dmg = targetUnit.isDefending
        ? Math.ceil(def.attack * 0.5)
        : def.attack;
      unitDamage.set(targetUnit.id, (unitDamage.get(targetUnit.id) ?? 0) + dmg);
      log.push(`${owner} ${attacker.type} attacks ${foe} ${targetUnit.type} for ${dmg}`);
    } else if (targetStruct) {
      const dmg = def.attack;
      structDamage.set(targetStruct.id, (structDamage.get(targetStruct.id) ?? 0) + dmg);
      log.push(`${owner} ${attacker.type} attacks ${foe} ${targetStruct.type} for ${dmg}`);
    }
  }

  // Apply unit damage.
  for (const [id, dmg] of unitDamage) {
    const unit = state.units.get(id);
    if (!unit) continue;
    unit.hp -= dmg;
    if (unit.hp <= 0) {
      state.units.delete(id);
      log.push(`${unit.owner} ${unit.type} destroyed`);
    }
  }

  // Apply structure damage.
  for (const [id, dmg] of structDamage) {
    const s = state.structures.get(id);
    if (!s) continue;
    s.hp -= dmg;
    if (s.hp <= 0) {
      state.structures.delete(id);
      log.push(`${s.owner} ${s.type} destroyed`);
    }
  }
}

// ── Step 5: Build ─────────────────────────────────────────────────────────────

function stepBuild(state: GameState, commands: CommandEntry[], log: string[]): void {
  // Tick existing under-construction structures.
  for (const s of state.structures.values()) {
    if (s.buildProgress > 0) {
      s.buildProgress -= 1;
      if (s.buildProgress === 0) {
        log.push(`${s.owner} ${s.type} construction complete`);
      }
    }
  }

  // Process new Build commands.
  const builds = commands.filter(
    (e): e is { owner: PlayerId; command: BuildCommand } => e.command.type === 'build',
  );

  for (const { owner, command } of builds) {
    const player = state.players[owner];
    const def    = STRUCTURE_DEFS[command.structureType];

    // Cost check.
    if (player.resources.cc < def.costCC) {
      log.push(`${owner} Build ${command.structureType} failed — insufficient CC`);
      continue;
    }
    // Hex must be empty (no unit, no structure).
    const hexOccupied =
      findUnitAt(state, command.targetHex) !== undefined ||
      findStructureAt(state, command.targetHex) !== undefined;
    if (hexOccupied) {
      log.push(`${owner} Build ${command.structureType} failed — hex occupied`);
      continue;
    }
    // Hex must be on the map and passable.
    const cell = state.map.cells.get(hexKey(command.targetHex));
    if (!cell || !TERRAIN[cell.terrain].passable) {
      log.push(`${owner} Build ${command.structureType} failed — impassable hex`);
      continue;
    }

    player.resources.cc -= def.costCC;
    const id = newId('s');
    state.structures.set(id, {
      id,
      owner,
      type:          command.structureType,
      hex:           command.targetHex,
      hp:            def.maxHp,
      buildProgress: def.buildEpochs,
      assignedDroneId: null,
    });
    log.push(`${owner} began building ${def.label}`);
  }
}

// ── Step 7: Gather ────────────────────────────────────────────────────────────

function stepGather(state: GameState, commands: CommandEntry[], log: string[]): void {
  const gathers = commands.filter(
    (e): e is { owner: PlayerId; command: GatherCommand } => e.command.type === 'gather',
  );

  // Assign drones to their extractors.
  for (const { owner, command } of gathers) {
    const unit = state.units.get(command.unitId);
    if (!unit || unit.owner !== owner || unit.type !== 'drone') continue;

    // Find a completed Crystal Extractor owned by this player at the target hex.
    const extractor = findStructureAt(state, command.targetHex, owner);
    if (!extractor || extractor.type !== 'crystal_extractor' || !isComplete(extractor)) {
      log.push(`${owner} Drone Gather failed — no completed Crystal Extractor at target`);
      continue;
    }

    // Move drone to the extractor hex if not already there.
    if (!hexEqual(unit.hex, command.targetHex)) {
      const blocked = new Set<string>();
      for (const [id, u] of state.units) {
        if (id !== unit.id) blocked.add(hexKey(u.hex));
      }
      const path  = bfsPath(unit.hex, command.targetHex, state, blocked);
      const steps = path.slice(0, UNIT_DEFS.drone.speed);
      if (steps.length > 0) unit.hex = steps[steps.length - 1];
    }

    extractor.assignedDroneId = unit.id;
    unit.assignedExtractorId  = extractor.id;
  }

  // Harvest: each staffed, complete Crystal Extractor yields CC.
  for (const s of state.structures.values()) {
    if (s.type !== 'crystal_extractor' || !isComplete(s) || !s.assignedDroneId) continue;
    const drone = state.units.get(s.assignedDroneId);
    if (!drone || drone.owner !== s.owner) {
      s.assignedDroneId = null;
      continue;
    }
    state.players[s.owner].resources.cc += EXTRACTOR_YIELD_CC;
    log.push(`${s.owner} Crystal Extractor yields +${EXTRACTOR_YIELD_CC} CC`);
  }
}

// ── Step 8: Train ─────────────────────────────────────────────────────────────

function stepTrain(state: GameState, commands: CommandEntry[], log: string[]): void {
  const trains = commands.filter(
    (e): e is { owner: PlayerId; command: TrainCommand } => e.command.type === 'train',
  );

  for (const { owner, command } of trains) {
    const player    = state.players[owner];
    const barracks  = state.structures.get(command.structureId);
    const unitDef   = UNIT_DEFS[command.unitType as UnitType];

    if (!barracks || barracks.owner !== owner) continue;
    if (!isComplete(barracks) || barracks.type !== 'barracks') {
      log.push(`${owner} Train failed — Barracks not ready`);
      continue;
    }
    if (player.resources.cc < unitDef.costCC) {
      log.push(`${owner} Train ${command.unitType} failed — insufficient CC`);
      continue;
    }
    // Spawn at the barracks hex (if unoccupied) or an adjacent open hex.
    const spawnHex = findSpawnHex(state, barracks.hex);
    if (!spawnHex) {
      log.push(`${owner} Train ${command.unitType} failed — no spawn space`);
      continue;
    }

    player.resources.cc -= unitDef.costCC;
    const id = newId('u');
    state.units.set(id, {
      id,
      owner,
      type:                command.unitType as UnitType,
      hex:                 spawnHex,
      hp:                  unitDef.maxHp,
      isDefending:         false,
      assignedExtractorId: null,
    });
    log.push(`${owner} trained ${unitDef.label}`);
  }
}

/** Find the barracks hex or a neighbour that isn't occupied by any unit. */
function findSpawnHex(state: GameState, barracksHex: Hex): Hex | null {
  const candidates = [barracksHex, ...hexNeighbors(barracksHex)];
  for (const h of candidates) {
    const cell = state.map.cells.get(hexKey(h));
    if (!cell || !TERRAIN[cell.terrain].passable) continue;
    if (findUnitAt(state, h) === undefined) return h;
  }
  return null;
}

// ── Post-resolution ───────────────────────────────────────────────────────────

function stepPostResolution(state: GameState): void {
  // Passive TE regeneration (+1 per epoch).
  for (const pid of ['player', 'ai'] as PlayerId[]) {
    const p = state.players[pid];
    p.resources.te = Math.min(p.resources.te + 1, 10); // cap at 10 (MVP)
    // Early lock-in bonus.
    if (p.lockedIn) {
      p.resources.te = Math.min(p.resources.te + 1, 10);
    }
    // Clear commands and lock-in for the new planning phase.
    p.commands  = Array(p.commandSlots).fill(null);
    p.lockedIn  = false;
  }

  // Recompute fog of war based on current unit + structure vision.
  const visionSources: Array<{ hex: Hex; radius: number }> = [];
  for (const unit of state.units.values()) {
    if (unit.owner === 'player') {
      visionSources.push({ hex: unit.hex, radius: UNIT_DEFS[unit.type].visionRadius });
    }
  }
  for (const s of state.structures.values()) {
    if (s.owner === 'player' && isComplete(s)) {
      const def = STRUCTURE_DEFS[s.type];
      if (def.visionRadius > 0) {
        visionSources.push({ hex: s.hex, radius: def.visionRadius });
      }
    }
  }
  computeFog(state.map, visionSources);
}

// ── Win condition check ───────────────────────────────────────────────────────

function checkWinConditions(state: GameState): void {
  // Annihilation: Command Nexus destroyed.
  const playerNexus = findNexus(state, 'player');
  const aiNexus     = findNexus(state, 'ai');

  if (!playerNexus && !aiNexus) {
    // Mutual destruction — treat as player defeat (edge case).
    state.winner = 'ai';
  } else if (!playerNexus) {
    state.winner = 'ai';
  } else if (!aiNexus) {
    state.winner = 'player';
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run one full epoch resolution on `state` (mutates in place).
 * Returns the event log lines for this epoch.
 */
export function resolveEpoch(state: GameState): string[] {
  if (state.phase !== 'planning') return [];

  state.phase = 'execution';
  const log: string[] = [];
  const commands = gatherCommands(state);

  stepDefend(state, commands, log);
  stepTemporal(state, commands, log);
  stepMove(state, commands, log);
  stepAttack(state, commands, log);
  stepBuild(state, commands, log);
  // stepUpgrade — deferred (no tech tree in MVP)
  stepGather(state, commands, log);
  stepTrain(state, commands, log);

  stepPostResolution(state);
  checkWinConditions(state);

  state.eventLog = log;

  if (state.winner !== null) {
    state.phase = 'over';
  } else {
    state.epoch += 1;
    state.phase  = 'transition';
  }

  return log;
}
