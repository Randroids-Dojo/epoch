import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, resetIdSeq, newId } from '@/engine/state';
import { Structure } from '@/engine/structures';
import { Unit } from '@/engine/units';
import { getPlayerTrainEligibility, getTrainFailureReason } from '@/components/shared/trainFlow';

beforeEach(() => resetIdSeq());

describe('trainFlow helpers', () => {
  it('returns a usable barracks and no failure reason when train is valid', () => {
    const state = createInitialState(7);
    const barracks: Structure = {
      id: newId('s'),
      owner: 'player',
      type: 'barracks',
      hex: { q: -8, r: 0 },
      hp: 40,
      buildProgress: 0,
      assignedDroneId: null,
    };
    state.structures.set(barracks.id, barracks);

    const eligibility = getPlayerTrainEligibility(state);
    expect(eligibility).toHaveLength(1);
    expect(eligibility[0].hasSpawnSpace).toBe(true);
    expect(getTrainFailureReason(state, 'drone')).toBeNull();
  });

  it('returns missing barracks feedback when no completed barracks exist', () => {
    const state = createInitialState(7);

    expect(getPlayerTrainEligibility(state)).toHaveLength(0);
    expect(getTrainFailureReason(state, 'drone')).toBe('Train requires a completed Barracks.');
  });

  it('returns insufficient CC feedback before command commit', () => {
    const state = createInitialState(7);
    state.players.player.resources.cc = 0;

    const barracks: Structure = {
      id: newId('s'),
      owner: 'player',
      type: 'barracks',
      hex: { q: -8, r: 0 },
      hp: 40,
      buildProgress: 0,
      assignedDroneId: null,
    };
    state.structures.set(barracks.id, barracks);

    expect(getTrainFailureReason(state, 'arc_ranger')).toBe('Not enough CC for Arc Ranger.');
  });

  it('returns spawn blocked feedback when barracks and neighbors are occupied', () => {
    const state = createInitialState(7);
    const barracks: Structure = {
      id: newId('s'),
      owner: 'player',
      type: 'barracks',
      hex: { q: -8, r: 0 },
      hp: 40,
      buildProgress: 0,
      assignedDroneId: null,
    };
    state.structures.set(barracks.id, barracks);

    const blockers: Array<{ q: number; r: number }> = [
      { q: -8, r: 0 },
      { q: -7, r: 0 },
      { q: -7, r: -1 },
      { q: -8, r: -1 },
      { q: -9, r: 0 },
      { q: -9, r: 1 },
      { q: -8, r: 1 },
    ];

    for (const hex of blockers) {
      const blocker: Unit = {
        id: newId('u'),
        owner: 'player',
        type: 'drone',
        hex,
        hp: 15,
        isDefending: false,
        assignedExtractorId: null,
      };
      state.units.set(blocker.id, blocker);
    }

    const eligibility = getPlayerTrainEligibility(state);
    expect(eligibility[0].hasSpawnSpace).toBe(false);
    expect(getTrainFailureReason(state, 'pulse_sentry')).toBe('Train failed: barracks spawn is blocked.');
  });
});
