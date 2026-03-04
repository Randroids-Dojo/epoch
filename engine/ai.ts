/**
 * Adept AI — Expander archetype (GDD §9.1–9.5).
 *
 * Pure TS, no React. Called once per epoch before resolveEpoch() to populate
 * state.players.ai.commands with up to 5 commands.
 *
 * Priority order:
 *   1. Gather  — assign idle drones to completed extractors
 *   2. Build extractor — on crystal nodes near AI presence
 *   3. Build barracks — if none exists
 *   4. Train — drones for economy, combat units when stable
 *   5. Attack — opportunistic, visible targets in range
 *   6. Move — expand toward crystal nodes / map center
 *   7. Defend — units near nexus when threats visible
 *
 * Respects fog of war: AI only sees hexes within its units'/structures' vision.
 */

import { GameState, findUnitAt, findStructureAt, findNexus } from './state';
import { Hex, hexKey, hexDistance, hexEqual, hexesInRange, hexNeighbors } from './hex';
import { Command } from './commands';
import { Unit, UNIT_DEFS, UnitType } from './units';
import { Structure, STRUCTURE_DEFS, isComplete, isHarvestable } from './structures';
import { TERRAIN } from './terrain';
import { PlayerId } from './player';

// ── AI Visibility ───────────────────────────────────────────────────────────

/** Returns the set of hex keys currently visible to the given player. */
export function computeVisibility(state: GameState, owner: PlayerId): Set<string> {
  const visible = new Set<string>();

  for (const unit of state.units.values()) {
    if (unit.owner !== owner) continue;
    const radius = UNIT_DEFS[unit.type].visionRadius;
    for (const h of hexesInRange(unit.hex, radius)) {
      const key = hexKey(h);
      if (state.map.cells.has(key)) visible.add(key);
    }
  }

  for (const s of state.structures.values()) {
    if (s.owner !== owner || !isComplete(s)) continue;
    const def = STRUCTURE_DEFS[s.type];
    if (def.visionRadius <= 0) continue;
    for (const h of hexesInRange(s.hex, def.visionRadius)) {
      const key = hexKey(h);
      if (state.map.cells.has(key)) visible.add(key);
    }
  }

  return visible;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getUnits(state: GameState, owner: PlayerId): Unit[] {
  return [...state.units.values()].filter((u) => u.owner === owner);
}

function getStructures(state: GameState, owner: PlayerId): Structure[] {
  return [...state.structures.values()].filter((s) => s.owner === owner);
}

/** Find an empty, passable hex adjacent to `center` (or center itself). */
function findEmptyPassableHex(state: GameState, center: Hex): Hex | null {
  const candidates = [center, ...hexNeighbors(center)];
  for (const h of candidates) {
    const key = hexKey(h);
    const cell = state.map.cells.get(key);
    if (!cell || !TERRAIN[cell.terrain].passable) continue;
    if (findUnitAt(state, h) !== undefined) continue;
    if (findStructureAt(state, h) !== undefined) continue;
    return h;
  }
  return null;
}

/** Find crystal_node hexes within `maxDist` of any AI unit/structure. */
function findNearbyCrystalNodes(
  state: GameState,
  owner: PlayerId,
  maxDist: number,
): Hex[] {
  const nodes: Hex[] = [];
  const seen = new Set<string>();

  const sources: Hex[] = [];
  for (const u of state.units.values()) {
    if (u.owner === owner) sources.push(u.hex);
  }
  for (const s of state.structures.values()) {
    if (s.owner === owner) sources.push(s.hex);
  }

  for (const [key, cell] of state.map.cells) {
    if (cell.terrain !== 'crystal_node') continue;
    if (seen.has(key)) continue;
    for (const src of sources) {
      if (hexDistance(src, cell.hex) <= maxDist) {
        nodes.push(cell.hex);
        seen.add(key);
        break;
      }
    }
  }

  return nodes;
}

/** Find the nearest crystal node to a given hex. */
function findNearestCrystalNode(state: GameState, from: Hex): Hex | null {
  let best: Hex | null = null;
  let bestDist = Infinity;

  for (const cell of state.map.cells.values()) {
    if (cell.terrain !== 'crystal_node') continue;
    const d = hexDistance(from, cell.hex);
    if (d < bestDist) {
      bestDist = d;
      best = cell.hex;
    }
  }

  return best;
}

// ── Command generation ──────────────────────────────────────────────────────

/** Fill state.players.ai.commands with up to commandSlots commands. */
export function generateAICommands(state: GameState): void {
  const ai = state.players.ai;
  const commands: Array<Command | null> = Array(ai.commandSlots).fill(null);
  let slot = 0;
  let budget = state.players.ai.resources.cc;

  const aiUnits = getUnits(state, 'ai');
  const aiStructures = getStructures(state, 'ai');
  const visibility = computeVisibility(state, 'ai');

  // Track which units already have a command this epoch.
  const assignedUnits = new Set<string>();
  // Track hexes where we're planning to build this epoch.
  const plannedBuilds = new Set<string>();

  // ── 1. Gather: assign idle drones to completed, unstaffed extractors ────

  const completedExtractors = aiStructures.filter(
    (s) => isHarvestable(s) && isComplete(s) && !s.assignedDroneId,
  );
  const idleDrones = aiUnits.filter(
    (u) => u.type === 'drone' && !u.assignedExtractorId && !assignedUnits.has(u.id),
  );

  for (const extractor of completedExtractors) {
    if (slot >= ai.commandSlots) break;
    const drone = idleDrones.shift();
    if (!drone) break;

    commands[slot++] = { type: 'gather', unitId: drone.id, targetHex: extractor.hex };
    assignedUnits.add(drone.id);
  }

  // ── 2. Build Extractor on nearby crystal nodes ──────────────────────────

  const crystalNodes = findNearbyCrystalNodes(state, 'ai', 6);
  const extractorCost = STRUCTURE_DEFS.crystal_extractor.costCC;

  for (const nodeHex of crystalNodes) {
    if (slot >= ai.commandSlots) break;
    if (budget < extractorCost) break;

    // Skip if there's already an extractor here (any owner).
    if (findStructureAt(state, nodeHex) !== undefined) continue;
    if (plannedBuilds.has(hexKey(nodeHex))) continue;

    // Build on the crystal node hex itself, or adjacent if occupied.
    const buildHex = findEmptyPassableHex(state, nodeHex);
    if (!buildHex) continue;

    // Prefer building on the crystal node itself for thematic reasons,
    // but the engine allows building on any passable hex.
    commands[slot++] = { type: 'build', targetHex: buildHex, structureType: 'crystal_extractor' };
    budget -= extractorCost;
    plannedBuilds.add(hexKey(buildHex));
  }

  // ── 3. Build Barracks and Tech Lab if absent ────────────────────────────

  const nexusForBuilding = findNexus(state, 'ai');
  if (nexusForBuilding) {
    for (const structureType of ['barracks', 'tech_lab'] as const) {
      if (slot >= ai.commandSlots) break;
      const cost = STRUCTURE_DEFS[structureType].costCC;
      if (budget < cost) continue;
      if (aiStructures.some((s) => s.type === structureType)) continue;
      const buildHex = findEmptyPassableHex(state, nexusForBuilding.hex);
      if (!buildHex || plannedBuilds.has(hexKey(buildHex))) continue;
      commands[slot++] = { type: 'build', targetHex: buildHex, structureType };
      budget -= cost;
      plannedBuilds.add(hexKey(buildHex));
    }
  }

  // ── 4. Train units ──────────────────────────────────────────────────────

  const barracks = aiStructures.find((s) => s.type === 'barracks' && isComplete(s));

  if (barracks && slot < ai.commandSlots) {
    // Count how many extractors need drones.
    const unstaffedExtractors = aiStructures.filter(
      (s) =>
        s.type === 'crystal_extractor' &&
        isComplete(s) &&
        !s.assignedDroneId,
    ).length;
    // Subtract drones we just assigned via gather commands.
    const dronesAvailable = aiUnits.filter(
      (u) => u.type === 'drone' && !assignedUnits.has(u.id) && !u.assignedExtractorId,
    ).length;
    const needMoreDrones = unstaffedExtractors > dronesAvailable;

    let trainType: UnitType;
    let trainCost: number;

    if (needMoreDrones) {
      trainType = 'drone';
      trainCost = UNIT_DEFS.drone.costCC;
    } else if (budget >= UNIT_DEFS.arc_ranger.costCC) {
      trainType = 'arc_ranger';
      trainCost = UNIT_DEFS.arc_ranger.costCC;
    } else if (budget >= UNIT_DEFS.pulse_sentry.costCC) {
      trainType = 'pulse_sentry';
      trainCost = UNIT_DEFS.pulse_sentry.costCC;
    } else {
      trainType = 'drone';
      trainCost = UNIT_DEFS.drone.costCC;
    }

    if (budget >= trainCost) {
      commands[slot++] = { type: 'train', structureId: barracks.id, unitType: trainType };
      budget -= trainCost;
    }
  }

  // ── 5. Attack visible enemies ───────────────────────────────────────────

  // Precompute enemy entity positions so the inner loop uses O(1) lookups
  // instead of scanning all units/structures per visible hex.
  const enemyUnitByHex = new Map<string, Unit>();
  const enemyStructByHex = new Map<string, Structure>();
  for (const u of state.units.values()) {
    if (u.owner === 'player') enemyUnitByHex.set(hexKey(u.hex), u);
  }
  for (const s of state.structures.values()) {
    if (s.owner === 'player') enemyStructByHex.set(hexKey(s.hex), s);
  }

  const combatUnits = aiUnits.filter(
    (u) => UNIT_DEFS[u.type].range > 0 && !assignedUnits.has(u.id),
  );

  for (const unit of combatUnits) {
    if (slot >= ai.commandSlots) break;

    const def = UNIT_DEFS[unit.type];
    let bestTarget: Hex | null = null;
    let bestDist = Infinity;

    // Look for enemy units/structures within vision that are in attack range.
    for (const vKey of visibility) {
      const enemyUnit = enemyUnitByHex.get(vKey);
      if (enemyUnit) {
        const d = hexDistance(unit.hex, enemyUnit.hex);
        if (d <= def.range && d < bestDist) {
          bestDist = d;
          bestTarget = enemyUnit.hex;
        }
      }
      const enemyStruct = enemyStructByHex.get(vKey);
      if (enemyStruct) {
        const d = hexDistance(unit.hex, enemyStruct.hex);
        if (d <= def.range && d < bestDist) {
          bestDist = d;
          bestTarget = enemyStruct.hex;
        }
      }
    }

    if (bestTarget) {
      commands[slot++] = { type: 'attack', unitId: unit.id, targetHex: bestTarget };
      assignedUnits.add(unit.id);
    }
  }

  // ── 6. Move idle units ─────────────────────────────────────────────────

  for (const unit of aiUnits) {
    if (slot >= ai.commandSlots) break;
    if (assignedUnits.has(unit.id)) continue;

    let targetHex: Hex | null = null;

    if (unit.type === 'drone') {
      // Move drones toward nearest crystal node.
      targetHex = findNearestCrystalNode(state, unit.hex);
    } else {
      // Move combat units toward map center (0,0) as expansion vector.
      // If already near center, move toward the player's side.
      const dist = hexDistance(unit.hex, { q: 0, r: 0 });
      if (dist <= 3) {
        // Push toward player start area.
        targetHex = state.map.playerStart;
      } else {
        targetHex = { q: 0, r: 0 };
      }
    }

    if (targetHex && !hexEqual(unit.hex, targetHex)) {
      commands[slot++] = { type: 'move', unitId: unit.id, targetHex };
      assignedUnits.add(unit.id);
    }
  }

  // ── 7. Defend units near nexus if threats nearby ────────────────────────

  const nexus = findNexus(state, 'ai');
  if (nexus && slot < ai.commandSlots) {
    // Check for visible player units near nexus.
    const threatNearby = [...visibility].some((vKey) => {
      const enemy = enemyUnitByHex.get(vKey);
      return enemy && hexDistance(enemy.hex, nexus.hex) <= 4;
    });

    if (threatNearby) {
      // Find an unassigned unit near nexus to defend.
      for (const unit of aiUnits) {
        if (slot >= ai.commandSlots) break;
        if (assignedUnits.has(unit.id)) continue;
        if (hexDistance(unit.hex, nexus.hex) <= 3) {
          commands[slot++] = { type: 'defend', unitId: unit.id };
          assignedUnits.add(unit.id);
        }
      }
    }
  }

  // ── Research: start research when Tech Lab is ready and not already researching ──
  if (
    slot < ai.commandSlots &&
    ai.techTier < 3 &&
    ai.researchEpochsLeft === 0 &&
    aiStructures.some((s) => s.type === 'tech_lab' && isComplete(s))
  ) {
    commands[slot++] = { type: 'research' };
  }

  state.players.ai.commands = commands;
}
