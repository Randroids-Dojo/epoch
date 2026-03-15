import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, resetIdSeq, GameState, newId, findNexus } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
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

describe('Nexus destroy does not freeze', () => {
  it('resolveEpoch completes when AI nexus is destroyed by attack', () => {
    const s = createInitialState(1);
    const aiNexus = findNexus(s, 'ai')!;
    expect(aiNexus).toBeDefined();

    // Set nexus to low HP so it will be destroyed
    aiNexus.hp = 5;

    // Add player attackers near the nexus
    const a1 = addUnit(s, { owner: 'player', type: 'arc_ranger', hex: { q: aiNexus.hex.q - 2, r: aiNexus.hex.r } });
    const a2 = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: aiNexus.hex.q - 1, r: aiNexus.hex.r } });

    // Queue attack commands
    s.players.player.unitOrders.set(a1.id, { type: 'attack', unitId: a1.id, targetHex: aiNexus.hex });
    s.players.player.unitOrders.set(a2.id, { type: 'attack', unitId: a2.id, targetHex: aiNexus.hex });

    resolveEpoch(s);

    expect(s.phase).toBe('over');
    expect(s.winner).toBe('player');
    expect(findNexus(s, 'ai')).toBeUndefined();
  });

  it('resolveEpoch completes when multiple units attack-move toward AI nexus', () => {
    const s = createInitialState(1);
    const aiNexus = findNexus(s, 'ai')!;
    aiNexus.hp = 5;

    // Add attackers far from the nexus (attack-move scenario)
    const a1 = addUnit(s, { owner: 'player', type: 'arc_ranger', hex: { q: aiNexus.hex.q - 6, r: aiNexus.hex.r } });
    const a2 = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: aiNexus.hex.q - 5, r: aiNexus.hex.r } });

    s.players.player.unitOrders.set(a1.id, { type: 'attack', unitId: a1.id, targetHex: aiNexus.hex });
    s.players.player.unitOrders.set(a2.id, { type: 'attack', unitId: a2.id, targetHex: aiNexus.hex });

    // Should not hang/freeze
    resolveEpoch(s);

    // Units may or may not have reached the nexus depending on distance/speed,
    // but resolution should always complete.
    expect(s.phase).toBeDefined();
  });

  it('post-resolution handles destroyed nexus without errors', () => {
    const s = createInitialState(1);
    const aiNexus = findNexus(s, 'ai')!;
    aiNexus.hp = 1; // will die from any hit

    // Attacker in range
    const a1 = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: aiNexus.hex.q - 1, r: aiNexus.hex.r } });
    s.players.player.unitOrders.set(a1.id, { type: 'attack', unitId: a1.id, targetHex: aiNexus.hex });

    resolveEpoch(s);

    expect(s.winner).toBe('player');
    expect(s.phase).toBe('over');

    // The attacker should have its attackTargetHex cleared since nexus is destroyed
    // and it's within range of the target hex.
    expect(a1.attackTargetHex).toBeNull();
  });
});
