import { GameState } from './state';
import { Unit, UNIT_DEFS } from './units';
import { hexKey } from './hex';
import { TERRAIN } from './terrain';
import { StructureType, isComplete, isHarvestable } from './structures';

export type TargetingCommandType = 'move' | 'attack' | 'gather' | 'defend';
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

  for (const [key, cell] of state.map.cells) {
    if (cell.fog === 'unexplored') continue;

    switch (type) {
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
