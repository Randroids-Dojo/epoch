import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, resetIdSeq, GameState, newId, findNexus } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
import { generateAICommands } from '@/engine/ai';
import { Unit, UNIT_DEFS } from '@/engine/units';

beforeEach(() => resetIdSeq());

function addUnit(state: GameState, partial: Partial<Unit> & Pick<Unit, 'owner' | 'type' | 'hex'>): Unit {
  const def = UNIT_DEFS[partial.type];
  const unit: Unit = {
    id: newId('u'),
    hp: def.maxHp,
    isDefending: false,
    assignedExtractorId: null,
    damageShield: false,
    mergeCount: 0,
    bonusMaxHp: 0,
    bonusAttack: 0,
    attackTargetHex: null, moveTargetHex: null, pendingBuild: null,
    ...partial,
  };
  state.units.set(unit.id, unit);
  return unit;
}

describe('Screenshot repro: freeze when attacking enemy base', () => {
  it('completes resolution with units attack-moving toward enemy nexus', () => {
    const s = createInitialState(1);
    // Reproduce screenshot: units with attack orders targeting hexes near enemy base
    const sentry1 = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: 9, r: -2 } });
    const ranger1 = addUnit(s, { owner: 'player', type: 'arc_ranger', hex: { q: 8, r: -1 } });
    const ranger2 = addUnit(s, { owner: 'player', type: 'arc_ranger', hex: { q: 9, r: 2 } });
    const sentry2 = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: 8, r: 1 } });
    const drone1 = addUnit(s, { owner: 'player', type: 'drone', hex: { q: -8, r: 2 } });
    const drone2 = addUnit(s, { owner: 'player', type: 'drone', hex: { q: 1, r: -1 } });
    const drone3 = addUnit(s, { owner: 'player', type: 'drone', hex: { q: 1, r: -1 } }); // duplicate hex, tests edge case

    // Attack commands targeting the nexus and nearby hexes
    s.players.player.unitOrders.set(sentry1.id, { type: 'attack', unitId: sentry1.id, targetHex: { q: 9, r: -2 } });
    s.players.player.unitOrders.set(ranger1.id, { type: 'attack', unitId: ranger1.id, targetHex: { q: 8, r: -1 } });
    s.players.player.unitOrders.set(ranger2.id, { type: 'attack', unitId: ranger2.id, targetHex: { q: 9, r: 2 } });
    s.players.player.unitOrders.set(sentry2.id, { type: 'attack', unitId: sentry2.id, targetHex: { q: 8, r: 1 } });
    s.players.player.unitOrders.set(drone1.id, { type: 'gather', unitId: drone1.id, targetHex: { q: -8, r: 2 } });
    s.players.player.unitOrders.set(drone2.id, { type: 'move', unitId: drone2.id, targetHex: { q: 1, r: -1 } });
    s.players.player.unitOrders.set(drone3.id, { type: 'move', unitId: drone3.id, targetHex: { q: 11, r: -1 } });

    s.players.player.lockedIn = true;
    
    // Generate AI commands (this is what happens before resolution)
    generateAICommands(s);
    
    const start = performance.now();
    const log = resolveEpoch(s);
    const elapsed = performance.now() - start;
    
    console.log("Resolution took:", elapsed, "ms");
    console.log("Phase:", s.phase, "Winner:", s.winner);
    console.log("Log entries:", log.length);
    
    expect(elapsed).toBeLessThan(1000); // Should complete in <1 second
    expect(s.phase).toBeDefined();
  });
  
  it('resolves without freeze when AI nexus has low HP', () => {
    const s = createInitialState(1);
    const aiNexus = findNexus(s, 'ai')!;
    aiNexus.hp = 10; // Low HP, about to be destroyed
    
    // Place attackers directly adjacent to nexus
    const sentry = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: aiNexus.hex.q - 1, r: aiNexus.hex.r } });
    const ranger = addUnit(s, { owner: 'player', type: 'arc_ranger', hex: { q: aiNexus.hex.q - 2, r: aiNexus.hex.r } });
    
    s.players.player.unitOrders.set(sentry.id, { type: 'attack', unitId: sentry.id, targetHex: aiNexus.hex });
    s.players.player.unitOrders.set(ranger.id, { type: 'attack', unitId: ranger.id, targetHex: aiNexus.hex });
    
    s.players.player.lockedIn = true;
    generateAICommands(s);
    
    const start = performance.now();
    resolveEpoch(s);
    const elapsed = performance.now() - start;
    
    console.log("Resolution took:", elapsed, "ms, phase:", s.phase, "winner:", s.winner);
    
    expect(elapsed).toBeLessThan(1000);
    expect(s.winner).toBe('player');
    expect(s.phase).toBe('over');
  });
});
