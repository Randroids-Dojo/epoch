import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, resetIdSeq } from '@/engine/state';
import { generateAICommands } from '@/engine/ai';
import { resolveEpoch } from '@/engine/resolution';
import { UNIT_DEFS } from '@/engine/units';

beforeEach(() => resetIdSeq());

describe('AI builds and trains over multiple epochs', () => {
  it('AI should build structures and train combat units within 13 epochs', () => {
    const state = createInitialState(1, 'adept');

    for (let epoch = 1; epoch <= 13; epoch++) {
      generateAICommands(state);
      state.phase = 'planning';
      state.players.player.lockedIn = true;
      resolveEpoch(state);
    }

    const aiStructures = [...state.structures.values()].filter(s => s.owner === 'ai');
    const hasBarracks = aiStructures.some(s => s.type === 'barracks');
    const combatUnits = [...state.units.values()].filter(
      u => u.owner === 'ai' && u.type !== 'drone'
    );
    const totalAttack = [...state.units.values()]
      .filter(u => u.owner === 'ai')
      .reduce((sum, u) => sum + UNIT_DEFS[u.type].attack, 0);

    expect(hasBarracks).toBe(true);
    expect(combatUnits.length).toBeGreaterThan(0);
    expect(totalAttack).toBeGreaterThan(3);
  });

  it('drones with pendingBuild are not redirected by moveExpand or defend', () => {
    const state = createInitialState(1, 'adept');
    const drone = [...state.units.values()].find(u => u.owner === 'ai' && u.type === 'drone')!;

    // Simulate a pending build on the drone
    drone.pendingBuild = { targetHex: { q: 8, r: -2 }, structureType: 'crystal_extractor' };
    drone.moveTargetHex = { q: 8, r: -2 };

    // Set a default build order (as stepPostResolution would)
    state.players.ai.unitOrders.set(drone.id, {
      type: 'move', unitId: drone.id, targetHex: { q: 8, r: -2 },
    });

    generateAICommands(state);

    const order = state.players.ai.unitOrders.get(drone.id);
    // The move order toward the build site should be preserved
    expect(order).toBeDefined();
    expect(order!.type).toBe('move');
    if (order!.type === 'move') {
      expect(order!.targetHex).toEqual({ q: 8, r: -2 });
    }
  });
});
