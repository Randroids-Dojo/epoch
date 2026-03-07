import { describe, it, expect } from 'vitest';
import { makeState } from './helpers';
import { runTimelineForkSimulation, computeChronoScout, deepCopyState } from '@/engine/simulation';
import { resolveEpoch } from '@/engine/resolution';

describe('deepCopyState', () => {
  it('produces an independent copy — mutating units in copy does not affect original', () => {
    const state = makeState();
    const copy = deepCopyState(state);
    // Mutate a unit hex in the copy.
    for (const u of copy.units.values()) {
      u.hex = { q: 99, r: 99 };
      break;
    }
    // Original units must be unchanged.
    for (const u of state.units.values()) {
      expect(u.hex.q).not.toBe(99);
    }
  });

  it('shares the map reference (not mutated by resolution)', () => {
    const state = makeState();
    const copy = deepCopyState(state);
    expect(copy.map).toBe(state.map);
  });

  it('can run resolveEpoch on the copy without affecting original', () => {
    const state = makeState();
    const epochBefore = state.epoch;
    const copy = deepCopyState(state);
    resolveEpoch(copy);
    expect(state.epoch).toBe(epochBefore); // original epoch unchanged
    expect(copy.epoch).toBe(epochBefore + 1); // copy advanced
  });
});

describe('runTimelineForkSimulation', () => {
  it('returns a result for the current epoch', () => {
    const state = makeState();
    const result = runTimelineForkSimulation(state);
    expect(result.forEpoch).toBe(state.epoch);
  });

  it('includes all player units in ghostUnitPositions', () => {
    const state = makeState();
    const playerUnitIds = [...state.units.values()]
      .filter((u) => u.owner === 'player')
      .map((u) => u.id);

    const result = runTimelineForkSimulation(state);
    for (const id of playerUnitIds) {
      expect(result.ghostUnitPositions.has(id)).toBe(true);
    }
  });

  it('does not mutate the live game state', () => {
    const state = makeState();
    const epochBefore = state.epoch;
    const unitCountBefore = state.units.size;
    runTimelineForkSimulation(state);
    expect(state.epoch).toBe(epochBefore);
    expect(state.units.size).toBe(unitCountBefore);
  });

  it('strips timeline_fork command from the simulation copy', () => {
    // The fork command should not cause recursion or errors.
    const state = makeState();
    state.players.player.commands[0] = { type: 'timeline_fork' };
    expect(() => runTimelineForkSimulation(state)).not.toThrow();
  });
});

describe('computeChronoScout', () => {
  it('returns a result for the current epoch', () => {
    const state = makeState();
    const result = computeChronoScout(state);
    expect(result.forEpoch).toBe(state.epoch);
  });

  it('includes only AI unit predictions', () => {
    const state = makeState();
    const result = computeChronoScout(state);
    // All predictions should be for AI units (unitType matches AI unit types).
    const aiUnitTypes = new Set(
      [...state.units.values()].filter((u) => u.owner === 'ai').map((u) => u.type),
    );
    for (const pred of result.predictedPositions) {
      expect(aiUnitTypes.has(pred.unitType as never)).toBe(true);
    }
  });

  it('produces deterministic results for the same epoch', () => {
    const state = makeState();
    const r1 = computeChronoScout(state);
    const r2 = computeChronoScout(state);
    expect(r1.predictedPositions.length).toBe(r2.predictedPositions.length);
    for (let i = 0; i < r1.predictedPositions.length; i++) {
      expect(r1.predictedPositions[i].hex).toEqual(r2.predictedPositions[i].hex);
      expect(r1.predictedPositions[i].certainty).toBe(r2.predictedPositions[i].certainty);
    }
  });

  it('certainty is either 1.0 (accurate) or 0.55 (shifted)', () => {
    const state = makeState();
    // Run for several epochs to see both values.
    for (let e = 1; e <= 10; e++) {
      state.epoch = e;
      const result = computeChronoScout(state);
      for (const pred of result.predictedPositions) {
        expect([1.0, 0.55]).toContain(pred.certainty);
      }
    }
  });
});
