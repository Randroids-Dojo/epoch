import { GameState, getOldestSnapshot } from './state';
import { Unit, UNIT_DEFS } from './units';
import { Hex, hexKey, hexDistance, hexesInRange } from './hex';
import { TERRAIN } from './terrain';
import { StructureType, isComplete, isHarvestable } from './structures';

export type TargetingCommandType = 'move' | 'attack' | 'gather' | 'defend' | 'chrono_shift' | 'phase_surge';
export type BuildStructureType = Exclude<StructureType, 'command_nexus'>;

/** Returns the first player-owned unit eligible for the given command type. */
export function getFirstEligibleUnit(
  state: GameState,
  type: TargetingCommandType,
): Unit | undefined {
  for (const unit of state.units.values()) {
    if (unit.owner !== 'player') continue;
    if (type === 'attack' && UNIT_DEFS[unit.type].range === 0) continue;
    if (type === 'gather' && unit.type !== 'drone') continue;
    if (type === 'phase_surge' && unit.type === 'drone') continue;
    if (type === 'chrono_shift') {
      // Only units that have a snapshot from 2 epochs ago can be shifted.
      if (!getOldestSnapshot(state)?.has(unit.id)) continue;
    }
    return unit;
  }
  return undefined;
}

/** Returns hex keys that are valid targets for the given command type. */
export function computeEligibleHexes(
  state: GameState,
  type: TargetingCommandType,
): Set<string> {
  const eligible = new Set<string>();
  if (type === 'defend') return eligible;

  // Build lookups only for the types that need them.
  const unitOwnerByHex = new Map<string, string>();
  if (type !== 'gather') {
    for (const unit of state.units.values()) {
      unitOwnerByHex.set(hexKey(unit.hex), unit.owner);
    }
  }
  const structOwnerByHex = new Map<string, string>();
  if (type === 'attack') {
    for (const s of state.structures.values()) {
      structOwnerByHex.set(hexKey(s.hex), s.owner);
    }
  }

  // Gather lookup: only built when needed.
  let harvestableByHex: Set<string> | null = null;
  if (type === 'gather') {
    harvestableByHex = new Set<string>();
    for (const s of state.structures.values()) {
      if (s.owner === 'player' && isHarvestable(s) && isComplete(s)) {
        harvestableByHex.add(hexKey(s.hex));
      }
    }
  }

  // Chrono Shift: eligible hexes are the current hexes of player units that have a 2-epoch snapshot.
  if (type === 'chrono_shift') {
    const oldestSnapshot = getOldestSnapshot(state);
    if (oldestSnapshot) {
      for (const unit of state.units.values()) {
        if (unit.owner === 'player' && oldestSnapshot.has(unit.id)) {
          eligible.add(hexKey(unit.hex));
        }
      }
    }
    return eligible;
  }

  for (const [key, cell] of state.map.cells) {
    if (cell.fog === 'unexplored') continue;

    switch (type) {
      case 'phase_surge':
      case 'move':
        // All passable visible/explored hexes not occupied by own units.
        if (!TERRAIN[cell.terrain].passable) continue;
        if (unitOwnerByHex.get(key) === 'player') continue;
        eligible.add(key);
        break;

      case 'attack':
        // All visible hexes with enemy unit or structure.
        if (cell.fog !== 'visible') continue;
        if (unitOwnerByHex.get(key) === 'ai' || structOwnerByHex.get(key) === 'ai') {
          eligible.add(key);
        }
        break;

      case 'gather':
        // Visible hexes with a completed player-owned extractor or flux conduit.
        if (cell.fog !== 'visible') continue;
        if (harvestableByHex?.has(key)) eligible.add(key);
        break;
    }
  }

  return eligible;
}


/** Returns hex keys that are valid targets for building structures. */
export function computeEligibleBuildHexes(
  state: GameState,
): Set<string> {
  const eligible = new Set<string>();

  const occupied = new Set<string>();
  for (const unit of state.units.values()) occupied.add(hexKey(unit.hex));
  for (const structure of state.structures.values()) occupied.add(hexKey(structure.hex));

  for (const [key, cell] of state.map.cells) {
    if (cell.fog === 'unexplored') continue;
    if (!TERRAIN[cell.terrain].passable) continue;
    if (occupied.has(key)) continue;
    eligible.add(key);
  }

  return eligible;
}

// ── Range-limited targeting for in-panel pickers ─────────────────────────────

/** Eligible hexes within a unit's movement range (speed). */
export function computeUnitMoveTargets(
  state: GameState,
  unit: Unit,
): Set<string> {
  const range = UNIT_DEFS[unit.type].speed;
  const allEligible = computeEligibleHexes(state, 'move');
  const inRange = new Set<string>();
  for (const hex of hexesInRange(unit.hex, range)) {
    const key = hexKey(hex);
    if (allEligible.has(key)) inRange.add(key);
  }
  return inRange;
}

/** Eligible hexes within a unit's attack range (range + speed for movement then attack). */
export function computeUnitAttackTargets(
  state: GameState,
  unit: Unit,
): Set<string> {
  const def = UNIT_DEFS[unit.type];
  const reach = def.speed + def.range;
  const allEligible = computeEligibleHexes(state, 'attack');
  const inRange = new Set<string>();
  for (const hex of hexesInRange(unit.hex, reach)) {
    const key = hexKey(hex);
    if (allEligible.has(key)) inRange.add(key);
  }
  return inRange;
}

/** Eligible build hexes near a drone (within its speed radius). */
export function computeUnitBuildTargets(
  state: GameState,
  unit: Unit,
): Set<string> {
  const range = UNIT_DEFS[unit.type].speed;
  const allEligible = computeEligibleBuildHexes(state);
  const inRange = new Set<string>();
  for (const hex of hexesInRange(unit.hex, range)) {
    const key = hexKey(hex);
    if (allEligible.has(key)) inRange.add(key);
  }
  return inRange;
}

/** Info about a harvestable structure that a drone can gather from. */
export interface GatherTarget {
  structureId: string;
  structureType: StructureType;
  label: string;
  hex: Hex;
  distance: number;
}

/** Returns harvestable structures within a unit's speed range. */
export function computeUnitGatherTargets(
  state: GameState,
  unit: Unit,
): GatherTarget[] {
  const range = UNIT_DEFS[unit.type].speed;
  const targets: GatherTarget[] = [];
  for (const s of state.structures.values()) {
    if (s.owner !== 'player') continue;
    if (!isHarvestable(s) || !isComplete(s)) continue;
    const dist = hexDistance(unit.hex, s.hex);
    if (dist > range) continue;
    targets.push({
      structureId: s.id,
      structureType: s.type,
      label: s.type === 'crystal_extractor' ? 'Crystal Extractor' : 'Flux Conduit',
      hex: s.hex,
      distance: dist,
    });
  }
  targets.sort((a, b) => a.distance - b.distance);
  return targets;
}
