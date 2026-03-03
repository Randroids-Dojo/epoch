import { GameState } from '@/engine/state';
import { hexKey, hexNeighbors } from '@/engine/hex';
import { isComplete } from '@/engine/structures';
import { TERRAIN } from '@/engine/terrain';
import { findUnitAt } from '@/engine/state';
import { UnitType, UNIT_DEFS } from '@/engine/units';

export const TRAINABLE_UNIT_TYPES: readonly UnitType[] = ['drone', 'pulse_sentry', 'arc_ranger'];

export interface TrainEligibility {
  structureId: string;
  hasSpawnSpace: boolean;
}

export function getPlayerTrainEligibility(state: GameState): TrainEligibility[] {
  const results: TrainEligibility[] = [];

  for (const structure of state.structures.values()) {
    if (structure.owner !== 'player' || structure.type !== 'barracks' || !isComplete(structure)) continue;

    results.push({
      structureId: structure.id,
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
  const barracks = getPlayerTrainEligibility(state);
  if (barracks.length === 0) return 'Train requires a completed Barracks.';

  if (state.players.player.resources.cc < UNIT_DEFS[unitType].costCC) {
    return `Not enough CC for ${UNIT_DEFS[unitType].label}.`;
  }

  if (!barracks.some((entry) => entry.hasSpawnSpace)) {
    return 'Train failed: barracks spawn is blocked.';
  }

  return null;
}
