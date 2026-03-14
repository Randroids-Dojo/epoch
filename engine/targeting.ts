import { GameState, getOldestSnapshot } from './state';
import { Unit, UNIT_DEFS, UnitType } from './units';
import { Hex, hexKey, hexDistance, hexesInRange, hexNeighbors } from './hex';
import { TERRAIN } from './terrain';
import { PHASE_SURGE_SPEED_BONUS, MERGE_RANGE } from './commands';
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
  // Structures occupy hexes and block movement.
  const structHexes = new Set<string>();
  if (type === 'move' || type === 'phase_surge') {
    for (const s of state.structures.values()) {
      structHexes.add(hexKey(s.hex));
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
    switch (type) {
      case 'phase_surge':
      case 'move':
        // Unexplored hexes are valid move targets — the unit will adapt
        // its path during resolution if the terrain turns out impassable.
        if (cell.fog === 'unexplored') {
          eligible.add(key);
          break;
        }
        // Visible/explored hexes: must be passable, not resource terrain, not occupied.
        if (!TERRAIN[cell.terrain].passable) continue;
        if (cell.terrain === 'crystal_node' || cell.terrain === 'flux_vent') continue;
        if (unitOwnerByHex.get(key) === 'player') continue;
        if (structHexes.has(key)) continue;
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

/** Result of computing move targets, split into immediate (this epoch) and extended (multi-turn). */
export interface MoveTargetResult {
  /** All eligible hexes (both immediate and multi-turn). */
  allKeys: Set<string>;
  /** Hexes reachable within a single epoch (within unit speed). */
  immediateKeys: Set<string>;
}

/** Eligible hexes for movement, split into immediate and multi-turn targets. */
export function computeUnitMoveTargets(
  state: GameState,
  unit: Unit,
): MoveTargetResult {
  const range = UNIT_DEFS[unit.type].speed;
  const allEligible = computeEligibleHexes(state, 'move');
  const immediateKeys = new Set<string>();
  for (const hex of hexesInRange(unit.hex, range)) {
    const key = hexKey(hex);
    if (allEligible.has(key)) immediateKeys.add(key);
  }
  return { allKeys: allEligible, immediateKeys };
}

/** Eligible hexes within a unit's attack range from its current position. */
export function computeUnitAttackTargets(
  state: GameState,
  unit: Unit,
): Set<string> {
  const def = UNIT_DEFS[unit.type];
  const reach = def.range;
  const allEligible = computeEligibleHexes(state, 'attack');
  const inRange = new Set<string>();
  for (const hex of hexesInRange(unit.hex, reach)) {
    const key = hexKey(hex);
    if (allEligible.has(key)) inRange.add(key);
  }
  return inRange;
}

/** Eligible hexes within a unit's phase surge range (speed + bonus). */
export function computeUnitPhaseSurgeTargets(
  state: GameState,
  unit: Unit,
): Set<string> {
  const reach = UNIT_DEFS[unit.type].speed + PHASE_SURGE_SPEED_BONUS;
  const allEligible = computeEligibleHexes(state, 'phase_surge');
  const inRange = new Set<string>();
  for (const hex of hexesInRange(unit.hex, reach)) {
    const key = hexKey(hex);
    if (allEligible.has(key)) inRange.add(key);
  }
  return inRange;
}

/** Eligible build hexes near a drone (within its speed radius), filtered by structure-specific terrain rules. */
export function computeUnitBuildTargets(
  state: GameState,
  unit: Unit,
  structureType?: StructureType,
): Set<string> {
  const range = UNIT_DEFS[unit.type].speed;
  const allEligible = computeEligibleBuildHexes(state);
  const inRange = new Set<string>();
  for (const hex of hexesInRange(unit.hex, range)) {
    const key = hexKey(hex);
    if (!allEligible.has(key)) continue;
    if (structureType && !isValidBuildTerrain(state, hex, structureType)) continue;
    inRange.add(key);
  }
  return inRange;
}

/** Checks structure-specific terrain placement rules. */
function isValidBuildTerrain(
  state: GameState,
  hex: Hex,
  structureType: StructureType,
): boolean {
  const cell = state.map.cells.get(hexKey(hex));
  if (!cell) return false;

  // Crystal Extractor must be on a crystal_node.
  if (structureType === 'crystal_extractor') {
    return cell.terrain === 'crystal_node';
  }

  // Flux Conduit must be on or adjacent to a flux_vent.
  if (structureType === 'flux_conduit') {
    if (cell.terrain === 'flux_vent') return true;
    return hexNeighbors(hex).some((nb) => {
      const nbCell = state.map.cells.get(hexKey(nb));
      return nbCell?.terrain === 'flux_vent';
    });
  }

  // All other structures may NOT be placed on harvesting terrain.
  if (cell.terrain === 'crystal_node' || cell.terrain === 'flux_vent') return false;

  return true;
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

// ── Merge targeting ──────────────────────────────────────────────────────────

/** Info about a friendly same-type unit that can be merged into the selected unit. */
export interface MergeTarget {
  unitId: string;
  unitType: UnitType;
  label: string;
  hex: Hex;
  distance: number;
  hp: number;
  maxHp: number;
  mergeCount: number;
}

/** Returns same-type friendly units within MERGE_RANGE of the given unit. */
export function computeUnitMergeTargets(
  state: GameState,
  unit: Unit,
): MergeTarget[] {
  const targets: MergeTarget[] = [];
  for (const other of state.units.values()) {
    if (other.id === unit.id) continue;
    if (other.owner !== unit.owner) continue;
    if (other.type !== unit.type) continue;
    const dist = hexDistance(unit.hex, other.hex);
    if (dist > MERGE_RANGE) continue;
    targets.push({
      unitId: other.id,
      unitType: other.type,
      label: UNIT_DEFS[other.type].label,
      hex: other.hex,
      distance: dist,
      hp: other.hp,
      maxHp: UNIT_DEFS[other.type].maxHp + other.bonusMaxHp,
      mergeCount: other.mergeCount,
    });
  }
  targets.sort((a, b) => a.distance - b.distance);
  return targets;
}
