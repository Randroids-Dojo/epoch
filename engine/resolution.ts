/**
 * Epoch resolution — the 8-step simultaneous execution pipeline (GDD §3.2 & §5.3).
 *
 * Resolution order:
 *   1. Defend    — damage resistance flags set
 *   2. Temporal  — time abilities (Echo, Chrono Shift)
 *   3. Move      — all movement, in map order
 *   4. Attack    — all damage computed simultaneously, then applied (incl. splash)
 *   4.5. Heal    — Flux Weavers auto-heal nearby allies
 *   5. Build     — construction progress ticks
 *   6. Upgrade   — research progress / tech tier advancement
 *   7. Gather    — resource harvesting
 *   8. Train     — new units spawned at Barracks or War Foundry
 *
 * Within each tier, commands are processed in map order:
 * sort by source hex (r ascending, then q ascending).
 */

import {
  hexDistance, hexKey, hexNeighbors, hexEqual, Hex,
} from './hex';
import { TERRAIN } from './terrain';
import {
  GameState, ChronoSnapshot, getOldestSnapshot, findNexus, findUnitAt, findStructureAt, newId,
} from './state';
import {
  AttackCommand, BuildCommand, ChronoShiftCommand, CHRONO_SHIFT_COST,
  Command, DefendCommand, GatherCommand, MoveCommand, ResearchCommand,
  TemporalCommand, TrainCommand,
} from './commands';
import { PlayerId, PLAYER_IDS, opponent } from './player';
import { UNIT_DEFS } from './units';
import { STRUCTURE_DEFS, isComplete, isHarvestable } from './structures';
import { computeFog } from './map';

/** CC per epoch from a staffed Crystal Extractor. */
const EXTRACTOR_YIELD_CC = 3;

/** FX per epoch from a staffed Flux Conduit. */
const FLUX_CONDUIT_YIELD_FX = 2;

/** Command slots granted at each tech tier (index = tier). */
const SLOTS_BY_TIER = [5, 6, 7, 8];

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommandEntry {
  owner: PlayerId;
  command: Command;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collect all non-null commands from both players, tagged with owner. */
function gatherCommands(state: GameState): CommandEntry[] {
  const entries: CommandEntry[] = [];
  for (const pid of PLAYER_IDS) {
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
  let qi = 0;

  while (qi < queue.length) {
    const hex = queue[qi++];
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
      // Temporal Echo effect is surfaced to the UI layer; resolution just logs it.
      log.push(`${owner} used Temporal Echo (-${command.teCost} TE)`);
    }
  }

  const chronoShifts = commands.filter(
    (e): e is { owner: PlayerId; command: ChronoShiftCommand } => e.command.type === 'chrono_shift',
  );

  for (const { owner, command } of chronoShifts) {
    const player = state.players[owner];
    if (player.resources.te < CHRONO_SHIFT_COST) {
      log.push(`${owner} Chrono Shift failed — insufficient TE`);
      continue;
    }

    const unit = state.units.get(command.unitId);
    if (!unit || unit.owner !== owner) {
      log.push(`${owner} Chrono Shift failed — unit not found`);
      continue;
    }

    const snapshot = getOldestSnapshot(state)?.get(command.unitId);
    if (!snapshot) {
      log.push(`${owner} Chrono Shift failed — no history for unit`);
      continue;
    }

    player.resources.te -= CHRONO_SHIFT_COST;
    unit.hex = snapshot.hex;
    unit.hp  = snapshot.hp;
    unit.damageShield = true;
    log.push(`${owner} ${unit.type} Chrono Shifted to (${snapshot.hex.q},${snapshot.hex.r}) (-${CHRONO_SHIFT_COST} TE) [shield active]`);
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

  // Build blocked set once; update it as units move so later movers see vacated hexes.
  // Structures don't block movement.
  const blocked = new Set<string>();
  for (const u of state.units.values()) blocked.add(hexKey(u.hex));

  for (const { owner, command } of moves) {
    const unit = state.units.get(command.unitId);
    if (!unit || unit.owner !== owner) continue;

    const def    = UNIT_DEFS[unit.type];
    const ownKey = hexKey(unit.hex);
    blocked.delete(ownKey); // Allow the unit to leave its current hex.

    const path  = bfsPath(unit.hex, command.targetHex, state, blocked);
    const steps = path.slice(0, def.speed);
    if (steps.length > 0) {
      const dest = steps[steps.length - 1];
      unit.hex = dest;
      blocked.add(hexKey(dest)); // Mark new position occupied for subsequent movers.
      log.push(`${owner} ${unit.type} → (${dest.q},${dest.r})`);
    } else {
      blocked.add(ownKey); // Unit didn't move; restore its hex in the blocked set.
    }
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
    if (def.range === 0) continue; // Drones and Flux Weavers cannot attack.

    const foe = opponent(owner);

    // Find enemy unit at target hex first; else enemy structure.
    const targetUnit   = findUnitAt(state, command.targetHex, foe);
    const targetStruct = targetUnit ? undefined : findStructureAt(state, command.targetHex, foe);

    if (!targetUnit && !targetStruct) continue;
    if (hexDistance(attacker.hex, command.targetHex) > def.range) continue;

    if (targetUnit) {
      const dmg = targetUnit.isDefending
        ? Math.ceil(def.attack * 0.5)
        : def.attack;
      unitDamage.set(targetUnit.id, (unitDamage.get(targetUnit.id) ?? 0) + dmg);
      log.push(`${owner} ${attacker.type} attacks ${foe} ${targetUnit.type} for ${dmg}`);

      // Void Striker splash: 50% damage to all adjacent hexes.
      if (attacker.type === 'void_striker') {
        const splashDmg = Math.ceil(def.attack * 0.5);
        for (const adjHex of hexNeighbors(command.targetHex)) {
          const splashUnit = findUnitAt(state, adjHex, foe);
          if (splashUnit && splashUnit.id !== targetUnit.id) {
            unitDamage.set(splashUnit.id, (unitDamage.get(splashUnit.id) ?? 0) + splashDmg);
            log.push(`${owner} void_striker splash hits ${foe} ${splashUnit.type} for ${splashDmg}`);
          }
        }
      }
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
    if (unit.damageShield) {
      unit.damageShield = false;
      log.push(`${unit.owner} ${unit.type} damage shield absorbed ${dmg} damage`);
      continue;
    }

    // Shield Pylon: 20% damage reduction for units within 2 hexes of a friendly completed pylon.
    const shieldedDmg = hasShieldPylonCoverage(state, unit.hex, unit.owner)
      ? Math.ceil(dmg * 0.8)
      : dmg;

    unit.hp -= shieldedDmg;
    if (unit.hp <= 0) {
      // Chrono Titan on-death: grant damageShield to all nearby friendly units.
      if (unit.type === 'chrono_titan') {
        const titanHex = unit.hex;
        for (const ally of state.units.values()) {
          if (ally.owner === unit.owner && hexDistance(ally.hex, titanHex) <= 2) {
            ally.damageShield = true;
          }
        }
        log.push(`${unit.owner} Chrono Titan on-death: shielded nearby allies`);
      }
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

/** Returns true if there is a completed friendly Shield Pylon within 2 hexes of `hex`. */
function hasShieldPylonCoverage(state: GameState, hex: Hex, owner: PlayerId): boolean {
  for (const s of state.structures.values()) {
    if (s.type === 'shield_pylon' && s.owner === owner && isComplete(s)) {
      if (hexDistance(s.hex, hex) <= 2) return true;
    }
  }
  return false;
}

// ── Step 4.5: Heal ────────────────────────────────────────────────────────────

/** Flux Weavers auto-heal the lowest-HP friendly unit within 2 hexes by 12 HP/epoch. */
function stepHeal(state: GameState, log: string[]): void {
  const FLUX_WEAVER_HEAL = 12;
  const FLUX_WEAVER_RANGE = 2;

  for (const weaver of state.units.values()) {
    if (weaver.type !== 'flux_weaver') continue;

    const def = UNIT_DEFS.flux_weaver;
    // Find the lowest-HP ally within range (excluding self if full HP, but self is valid).
    let bestTarget = null as (typeof weaver) | null;
    let bestHpFrac = 1.0;

    for (const ally of state.units.values()) {
      if (ally.owner !== weaver.owner) continue;
      if (hexDistance(ally.hex, weaver.hex) > FLUX_WEAVER_RANGE) continue;
      const maxHp = UNIT_DEFS[ally.type].maxHp;
      if (ally.hp >= maxHp) continue; // Already at full HP.
      const frac = ally.hp / maxHp;
      if (frac < bestHpFrac) { bestHpFrac = frac; bestTarget = ally; }
    }

    if (!bestTarget) continue;
    const maxHp = UNIT_DEFS[bestTarget.type].maxHp;
    const healed = Math.min(FLUX_WEAVER_HEAL, maxHp - bestTarget.hp);
    bestTarget.hp += healed;
    log.push(`${weaver.owner} flux_weaver heals ${bestTarget.type} for ${healed} HP`);
    void def; // suppress unused warning
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

    // Tech tier check.
    if (def.techTierRequired > player.techTier) {
      log.push(`${owner} Build ${command.structureType} failed — requires Tech Tier ${def.techTierRequired}`);
      continue;
    }
    // CC cost check.
    if (player.resources.cc < def.costCC) {
      log.push(`${owner} Build ${command.structureType} failed — insufficient CC`);
      continue;
    }
    // FX cost check.
    if (player.resources.fx < def.costFX) {
      log.push(`${owner} Build ${command.structureType} failed — insufficient FX`);
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
    // Flux Conduit must be on or adjacent to a Flux Vent.
    if (command.structureType === 'flux_conduit') {
      const onVent = cell.terrain === 'flux_vent';
      const adjToVent = hexNeighbors(command.targetHex).some((nb) => {
        const nbCell = state.map.cells.get(hexKey(nb));
        return nbCell?.terrain === 'flux_vent';
      });
      if (!onVent && !adjToVent) {
        log.push(`${owner} Build flux_conduit failed — must be on or adjacent to a Flux Vent`);
        continue;
      }
    }

    player.resources.cc -= def.costCC;
    player.resources.fx -= def.costFX;
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

// ── Step 6: Upgrade (Tech Tree Research) ─────────────────────────────────────

function stepUpgrade(state: GameState, commands: CommandEntry[], log: string[]): void {
  for (const pid of PLAYER_IDS) {
    const player = state.players[pid];

    // Check for a Research command this epoch.
    const hasResearch = commands.some(
      (e): e is { owner: PlayerId; command: ResearchCommand } =>
        e.owner === pid && e.command.type === 'research',
    );

    if (hasResearch) {
      if (player.techTier >= 3) {
        log.push(`${pid} Research failed — already at max Tech Tier`);
      } else if (player.researchEpochsLeft > 0) {
        log.push(`${pid} Research failed — already researching`);
      } else {
        let hasLab = false;
        for (const s of state.structures.values()) {
          if (s.owner === pid && s.type === 'tech_lab' && isComplete(s)) {
            hasLab = true;
            break;
          }
        }
        if (!hasLab) {
          log.push(`${pid} Research failed — no completed Tech Lab`);
        } else {
          player.researchEpochsLeft = 3;
          log.push(`${pid} began researching Tech Tier ${player.techTier + 1} (3 epochs)`);
        }
      }
    }

    // Tick active research.
    if (player.researchEpochsLeft > 0) {
      player.researchEpochsLeft -= 1;
      if (player.researchEpochsLeft === 0) {
        player.techTier += 1;
        player.commandSlots = SLOTS_BY_TIER[Math.min(player.techTier, SLOTS_BY_TIER.length - 1)];
        log.push(`${pid} reached Tech Tier ${player.techTier} — +1 command slot (now ${player.commandSlots})`);
      }
    }
  }
}

// ── Step 7: Gather ────────────────────────────────────────────────────────────

function stepGather(state: GameState, commands: CommandEntry[], log: string[]): void {
  const gathers = commands.filter(
    (e): e is { owner: PlayerId; command: GatherCommand } => e.command.type === 'gather',
  );

  // Build blocked set once for drone repositioning; reflects post-move unit positions.
  const blocked = new Set<string>();
  for (const u of state.units.values()) blocked.add(hexKey(u.hex));

  // Assign drones to their extractors / flux conduits.
  for (const { owner, command } of gathers) {
    const unit = state.units.get(command.unitId);
    if (!unit || unit.owner !== owner || unit.type !== 'drone') continue;

    // Find a completed Crystal Extractor or Flux Conduit owned by this player at the target hex.
    const building = findStructureAt(state, command.targetHex, owner);
    const extractor = (building && isHarvestable(building) && isComplete(building)) ? building : null;
    if (!extractor) {
      log.push(`${owner} Drone Gather failed — no completed extractor/conduit at target`);
      continue;
    }

    // Move drone to the extractor hex if not already there.
    if (!hexEqual(unit.hex, command.targetHex)) {
      const ownKey = hexKey(unit.hex);
      blocked.delete(ownKey);
      const path  = bfsPath(unit.hex, command.targetHex, state, blocked);
      const steps = path.slice(0, UNIT_DEFS.drone.speed);
      if (steps.length > 0) {
        unit.hex = steps[steps.length - 1];
        blocked.add(hexKey(unit.hex));
      } else {
        blocked.add(ownKey);
      }
    }

    extractor.assignedDroneId = unit.id;
    unit.assignedExtractorId  = extractor.id;
  }

  // Harvest: staffed Crystal Extractors yield CC; staffed Flux Conduits yield FX.
  for (const s of state.structures.values()) {
    if (!isComplete(s) || !s.assignedDroneId) continue;
    if (!isHarvestable(s)) continue;
    const drone = state.units.get(s.assignedDroneId);
    if (!drone || drone.owner !== s.owner) {
      s.assignedDroneId = null;
      continue;
    }
    if (s.type === 'crystal_extractor') {
      state.players[s.owner].resources.cc += EXTRACTOR_YIELD_CC;
      log.push(`${s.owner} Crystal Extractor yields +${EXTRACTOR_YIELD_CC} CC`);
    } else {
      state.players[s.owner].resources.fx += FLUX_CONDUIT_YIELD_FX;
      log.push(`${s.owner} Flux Conduit yields +${FLUX_CONDUIT_YIELD_FX} FX`);
    }
  }
}

// ── Step 8: Train ─────────────────────────────────────────────────────────────

function stepTrain(state: GameState, commands: CommandEntry[], log: string[]): void {
  const trains = commands.filter(
    (e): e is { owner: PlayerId; command: TrainCommand } => e.command.type === 'train',
  );

  for (const { owner, command } of trains) {
    const player    = state.players[owner];
    const building  = state.structures.get(command.structureId);
    const unitDef   = UNIT_DEFS[command.unitType];

    if (!building || building.owner !== owner) continue;
    const validBuilding = building.type === 'barracks' || building.type === 'war_foundry';
    if (!validBuilding) {
      log.push(`${owner} Train failed — structure is not a Barracks or War Foundry`);
      continue;
    }
    if (!isComplete(building)) {
      log.push(`${owner} Train failed — ${building.type} not ready`);
      continue;
    }
    // Validate unit is produced at the correct building type.
    if (unitDef.producedAt !== building.type) {
      log.push(`${owner} Train ${command.unitType} failed — requires ${unitDef.producedAt === 'war_foundry' ? 'War Foundry' : 'Barracks'}`);
      continue;
    }
    // Rename local variable for readability in rest of loop.
    const barracks = building;
    if (unitDef.techTierRequired > player.techTier) {
      log.push(`${owner} Train ${command.unitType} failed — requires Tech Tier ${unitDef.techTierRequired}`);
      continue;
    }
    if (player.resources.cc < unitDef.costCC) {
      log.push(`${owner} Train ${command.unitType} failed — insufficient CC`);
      continue;
    }
    if (player.resources.fx < unitDef.costFX) {
      log.push(`${owner} Train ${command.unitType} failed — insufficient FX`);
      continue;
    }
    // Spawn at the barracks hex (if unoccupied) or an adjacent open hex.
    const spawnHex = findSpawnHex(state, barracks.hex);
    if (!spawnHex) {
      log.push(`${owner} Train ${command.unitType} failed — no spawn space`);
      continue;
    }

    player.resources.cc -= unitDef.costCC;
    player.resources.fx -= unitDef.costFX;
    const id = newId('u');
    state.units.set(id, {
      id,
      owner,
      type:                command.unitType,
      hex:                 spawnHex,
      hp:                  unitDef.maxHp,
      isDefending:         false,
      assignedExtractorId: null,
      damageShield:        false,
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
  // Single pass over all units: snapshot for Chrono Shift, clear damage shields, collect vision.
  const snapshot = new Map<string, ChronoSnapshot>();
  const visionSources: Array<{ hex: Hex; radius: number }> = [];
  for (const unit of state.units.values()) {
    snapshot.set(unit.id, { hex: unit.hex, hp: unit.hp });
    unit.damageShield = false;
    if (unit.owner === 'player') {
      visionSources.push({ hex: unit.hex, radius: UNIT_DEFS[unit.type].visionRadius });
    }
  }

  // Rolling 2-epoch window — push/shift avoids creating a spread+slice each epoch.
  if (state.unitHistory.length >= 2) state.unitHistory.shift();
  state.unitHistory.push(snapshot);

  for (const pid of PLAYER_IDS) {
    const p = state.players[pid];
    // Snapshot commands before clearing — used by Temporal Echo next epoch.
    state.prevEpochCommands[pid] = p.commands.filter((c): c is Command => c !== null);
    // Passive TE regeneration (+1 per epoch, capped at 10).
    p.resources.te = Math.min(p.resources.te + 1, 10);
    // Early lock-in bonus.
    if (p.lockedIn) {
      p.resources.te = Math.min(p.resources.te + 1, 10);
    }
    // Clear commands and lock-in for the new planning phase (size = current commandSlots).
    p.commands = Array(p.commandSlots).fill(null);
    p.lockedIn = false;
  }

  // Recompute fog of war based on unit vision (collected above) + structure vision.
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

  if (!playerNexus) {
    // Also covers mutual destruction — treat as player defeat.
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
  stepHeal(state, log);
  stepBuild(state, commands, log);
  stepUpgrade(state, commands, log);
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
