import { GameState } from '@/engine/state';
import { hexKey, hexNeighbors } from '@/engine/hex';
import { isComplete } from '@/engine/structures';
import { TERRAIN } from '@/engine/terrain';
import { findUnitAt } from '@/engine/state';
import { UnitType, UNIT_DEFS } from '@/engine/units';

/** All unit types the player can train (Barracks: Tier 0–1, War Foundry: Tier 2–3). */
export const TRAINABLE_UNIT_TYPES: readonly UnitType[] = [
  'drone',
  'pulse_sentry',
  'arc_ranger',
  'phase_walker',
  'temporal_warden',
  'void_striker',
  'flux_weaver',
  'chrono_titan',
];

export const BARRACKS_UNIT_TYPES: readonly UnitType[] = [
  'drone', 'pulse_sentry', 'arc_ranger', 'phase_walker', 'temporal_warden',
];

export const WAR_FOUNDRY_UNIT_TYPES: readonly UnitType[] = [
  'void_striker', 'flux_weaver', 'chrono_titan',
];

export interface TrainEligibility {
  structureId: string;
  structureType: 'barracks' | 'war_foundry';
  hasSpawnSpace: boolean;
}

export function getPlayerTrainEligibility(state: GameState): TrainEligibility[] {
  const results: TrainEligibility[] = [];

  for (const structure of state.structures.values()) {
    if (structure.owner !== 'player') continue;
    if (structure.type !== 'barracks' && structure.type !== 'war_foundry') continue;
    if (!isComplete(structure)) continue;

    results.push({
      structureId: structure.id,
      structureType: structure.type,
      hasSpawnSpace: findTrainSpawnHex(state, structure.hex) !== null,
    });
  }

  return results;
}

export function findTrainSpawnHex(state: GameState, barracksHex: { q: number; r: number }) {
  const candidates = [barracksHex, ...hexNeighbors(barracksHex)];
  for (const h of candidates) {
    const cell = state.map.cells.get(hexKey(h));
    if (!cell || !TERRAIN[cell.terrain].passable) continue;
    if (findUnitAt(state, h) === undefined) return h;
  }
  return null;
}

export function getTrainFailureReason(state: GameState, unitType: UnitType): string | null {
  const def = UNIT_DEFS[unitType];
  const eligible = getPlayerTrainEligibility(state);

  // Find structures matching the required production building.
  const matchingBuildings = eligible.filter((e) => e.structureType === def.producedAt);
  const buildingLabel = def.producedAt === 'war_foundry' ? 'War Foundry' : 'Barracks';

  if (matchingBuildings.length === 0) {
    return `Train requires a completed ${buildingLabel}.`;
  }

  if (def.techTierRequired > state.players.player.techTier) {
    return `Requires Tech Tier ${def.techTierRequired}.`;
  }

  if (state.players.player.resources.cc < def.costCC) {
    return `Not enough CC for ${def.label}.`;
  }

  if (state.players.player.resources.fx < def.costFX) {
    return `Not enough FX for ${def.label}.`;
  }

  if (!matchingBuildings.some((entry) => entry.hasSpawnSpace)) {
    return `Train failed: ${buildingLabel.toLowerCase()} spawn is blocked.`;
  }

  return null;
}
