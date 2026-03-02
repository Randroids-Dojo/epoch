import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, findNexus, findUnitAt, resetIdSeq } from '@/engine/state';
import { UNIT_DEFS } from '@/engine/units';
import { STRUCTURE_DEFS } from '@/engine/structures';
import { MAX_COMMAND_SLOTS } from '@/engine/commands';

beforeEach(() => resetIdSeq());

describe('createInitialState', () => {
  it('creates state in planning phase at epoch 1', () => {
    const s = createInitialState(1);
    expect(s.phase).toBe('planning');
    expect(s.epoch).toBe(1);
    expect(s.winner).toBeNull();
  });

  it('both players start with correct resources', () => {
    const s = createInitialState(1);
    for (const pid of ['player', 'ai'] as const) {
      const r = s.players[pid].resources;
      expect(r.cc).toBe(10);
      expect(r.fx).toBe(0);
      expect(r.te).toBe(3);
    }
  });

  it('both players have 5 empty command slots', () => {
    const s = createInitialState(1);
    for (const pid of ['player', 'ai'] as const) {
      expect(s.players[pid].commandSlots).toBe(MAX_COMMAND_SLOTS);
      expect(s.players[pid].commands).toHaveLength(MAX_COMMAND_SLOTS);
      expect(s.players[pid].commands.every(c => c === null)).toBe(true);
    }
  });

  it('each player has a Command Nexus on their start hex', () => {
    const s = createInitialState(1);
    const playerNexus = findNexus(s, 'player');
    const aiNexus     = findNexus(s, 'ai');
    expect(playerNexus).toBeDefined();
    expect(aiNexus).toBeDefined();
    expect(playerNexus!.hex).toEqual(s.map.playerStart);
    expect(aiNexus!.hex).toEqual(s.map.aiStart);
    expect(playerNexus!.hp).toBe(STRUCTURE_DEFS.command_nexus.maxHp);
    expect(playerNexus!.buildProgress).toBe(0);
  });

  it('each player starts with one Drone', () => {
    const s = createInitialState(1);
    const playerDrones = [...s.units.values()].filter(
      u => u.owner === 'player' && u.type === 'drone',
    );
    const aiDrones = [...s.units.values()].filter(
      u => u.owner === 'ai' && u.type === 'drone',
    );
    expect(playerDrones).toHaveLength(1);
    expect(aiDrones).toHaveLength(1);
    expect(playerDrones[0].hp).toBe(UNIT_DEFS.drone.maxHp);
  });

  it('total units = 2, total structures = 2 at game start', () => {
    const s = createInitialState(1);
    expect(s.units.size).toBe(2);
    expect(s.structures.size).toBe(2);
  });

  it('generates a deterministic map from seed', () => {
    const s1 = createInitialState(42);
    resetIdSeq();
    const s2 = createInitialState(42);
    expect(s1.map.seed).toBe(s2.map.seed);
    expect(s1.map.cells.size).toBe(s2.map.cells.size);
  });
});

describe('findUnitAt', () => {
  it('finds a unit by hex', () => {
    const s = createInitialState(1);
    const drone = [...s.units.values()].find(u => u.owner === 'player')!;
    const found = findUnitAt(s, drone.hex);
    expect(found).toBeDefined();
    expect(found!.id).toBe(drone.id);
  });

  it('filters by owner', () => {
    const s    = createInitialState(1);
    const drone = [...s.units.values()].find(u => u.owner === 'player')!;
    expect(findUnitAt(s, drone.hex, 'player')).toBeDefined();
    expect(findUnitAt(s, drone.hex, 'ai')).toBeUndefined();
  });
});
