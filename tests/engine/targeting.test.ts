import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, resetIdSeq } from '@/engine/state';
import { computeEligibleBuildHexes, computeEligibleHexes, getFirstEligibleUnit } from '@/engine/targeting';
import { hexKey } from '@/engine/hex';
import { TERRAIN } from '@/engine/terrain';

beforeEach(() => resetIdSeq());

describe('getFirstEligibleUnit', () => {
  it('returns undefined when no player units exist', () => {
    const state = createInitialState(1);
    state.units.clear();
    expect(getFirstEligibleUnit(state, 'move')).toBeUndefined();
  });

  it('returns a player unit for move', () => {
    const state = createInitialState(1);
    const unit = getFirstEligibleUnit(state, 'move');
    expect(unit).toBeDefined();
    expect(unit!.owner).toBe('player');
  });

  it('returns undefined for attack when only drones (range=0) exist', () => {
    const state = createInitialState(1);
    // Drones have range=0, so not eligible for attack
    const unit = getFirstEligibleUnit(state, 'attack');
    expect(unit).toBeUndefined();
  });

  it('returns a drone for gather', () => {
    const state = createInitialState(1);
    const unit = getFirstEligibleUnit(state, 'gather');
    expect(unit).toBeDefined();
    expect(unit!.type).toBe('drone');
  });

  it('returns a player unit for defend', () => {
    const state = createInitialState(1);
    const unit = getFirstEligibleUnit(state, 'defend');
    expect(unit).toBeDefined();
    expect(unit!.owner).toBe('player');
  });
});

describe('computeEligibleHexes', () => {
  it('defend always returns empty set', () => {
    const state = createInitialState(1);
    const result = computeEligibleHexes(state, 'defend');
    expect(result.size).toBe(0);
  });

  it('move: returns passable visible/explored hexes excluding own unit positions', () => {
    const state = createInitialState(1);
    const result = computeEligibleHexes(state, 'move');
    // All returned hexes must be passable and not occupied by player
    for (const key of result) {
      const cell = state.map.cells.get(key)!;
      expect(cell.fog).not.toBe('unexplored');
      // No player unit on these hexes
      for (const unit of state.units.values()) {
        if (unit.owner === 'player') {
          expect(hexKey(unit.hex)).not.toBe(key);
        }
      }
    }
    expect(result.size).toBeGreaterThan(0);
  });

  it('attack: returns only visible hexes with enemy unit or structure', () => {
    const state = createInitialState(1);
    const result = computeEligibleHexes(state, 'attack');
    // All returned hexes must be visible
    for (const key of result) {
      const cell = state.map.cells.get(key)!;
      expect(cell.fog).toBe('visible');
    }
    // AI units/structures that are visible should be included
    const aiKeys = new Set<string>();
    for (const unit of state.units.values()) {
      if (unit.owner === 'ai') {
        const cell = state.map.cells.get(hexKey(unit.hex));
        if (cell?.fog === 'visible') aiKeys.add(hexKey(unit.hex));
      }
    }
    for (const s of state.structures.values()) {
      if (s.owner === 'ai') {
        const cell = state.map.cells.get(hexKey(s.hex));
        if (cell?.fog === 'visible') aiKeys.add(hexKey(s.hex));
      }
    }
    for (const key of aiKeys) {
      expect(result.has(key)).toBe(true);
    }
  });

  it('gather: returns visible hexes with crystal_node terrain', () => {
    const state = createInitialState(1);
    const result = computeEligibleHexes(state, 'gather');
    for (const key of result) {
      const cell = state.map.cells.get(key)!;
      expect(cell.terrain).toBe('crystal_node');
      expect(cell.fog).toBe('visible');
    }
  });



  it('build: returns passable explored/visible unoccupied hexes', () => {
    const state = createInitialState(1);
    const result = computeEligibleBuildHexes(state);

    for (const key of result) {
      const cell = state.map.cells.get(key)!;
      expect(cell.fog).not.toBe('unexplored');
      expect(TERRAIN[cell.terrain].passable).toBe(true);

      for (const unit of state.units.values()) {
        expect(hexKey(unit.hex)).not.toBe(key);
      }
      for (const structure of state.structures.values()) {
        expect(hexKey(structure.hex)).not.toBe(key);
      }
    }

    expect(result.size).toBeGreaterThan(0);
  });

  it('returns empty set when no eligible unit could be found (defend type)', () => {
    const state = createInitialState(1);
    const result = computeEligibleHexes(state, 'defend');
    expect(result.size).toBe(0);
  });
});
