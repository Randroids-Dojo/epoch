import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, resetIdSeq, GameState, newId } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
import { Unit, UNIT_DEFS } from '@/engine/units';
import { Structure } from '@/engine/structures';
import { queueCommand } from './helpers';

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
    attackTargetHex: null, moveTargetHex: null,
    ...partial,
  };
  state.units.set(unit.id, unit);
  return unit;
}

function addStructure(state: GameState, partial: Partial<Structure> & Pick<Structure, 'owner' | 'type' | 'hex'>): Structure {
  const s: Structure = {
    id: newId('s'),
    hp: 40,
    buildProgress: 0,
    assignedDroneId: null,
    ...partial,
  };
  state.structures.set(s.id, s);
  return s;
}

describe('Continuous unit attacks', () => {
  it('auto-populates attack orders for units that attacked a living target', () => {
    const s = createInitialState(1);
    // Place an arc_ranger (range 3) and an enemy unit within range.
    const attacker = addUnit(s, {
      owner: 'player', type: 'arc_ranger',
      hex: { q: -8, r: 0 },
    });
    const enemy = addUnit(s, {
      owner: 'ai', type: 'pulse_sentry',
      hex: { q: -6, r: 0 }, hp: 100, // high HP so it survives
    });

    queueCommand(s, 'player', 0, { type: 'attack', unitId: attacker.id, targetHex: enemy.hex });
    resolveEpoch(s);

    // After resolution, next epoch should have auto-populated attack order.
    const order = s.players.player.unitOrders.get(attacker.id);
    expect(order).toBeDefined();
    expect(order!.type).toBe('attack');
    if (order!.type === 'attack') {
      expect(order!.targetHex).toEqual(enemy.hex);
    }
    expect(s.players.player.defaultOrderUnitIds.has(attacker.id)).toBe(true);
  });

  it('does not auto-populate if the target was destroyed', () => {
    const s = createInitialState(1);
    const attacker = addUnit(s, {
      owner: 'player', type: 'arc_ranger',
      hex: { q: -8, r: 0 },
    });
    // Enemy with very low HP — should die from the attack.
    const enemy = addUnit(s, {
      owner: 'ai', type: 'drone',
      hex: { q: -6, r: 0 }, hp: 1,
    });

    queueCommand(s, 'player', 0, { type: 'attack', unitId: attacker.id, targetHex: enemy.hex });
    resolveEpoch(s);

    // Enemy should be dead.
    expect(s.units.has(enemy.id)).toBe(false);

    // No auto-populated attack order.
    expect(s.players.player.unitOrders.has(attacker.id)).toBe(false);
    expect(attacker.attackTargetHex).toBeNull();
  });

  it('clears attackTargetHex when unit is given a non-attack order', () => {
    const s = createInitialState(1);
    const attacker = addUnit(s, {
      owner: 'player', type: 'arc_ranger',
      hex: { q: -8, r: 0 },
      attackTargetHex: { q: -6, r: 0 },
    });
    // Enemy still alive at target hex.
    addUnit(s, {
      owner: 'ai', type: 'pulse_sentry',
      hex: { q: -6, r: 0 }, hp: 100,
    });

    // Give the attacker a move order instead.
    queueCommand(s, 'player', 0, { type: 'move', unitId: attacker.id, targetHex: { q: -7, r: 0 } });
    resolveEpoch(s);

    // attackTargetHex should be cleared because a non-attack order was given.
    expect(attacker.attackTargetHex).toBeNull();
  });

  it('attack persists across multiple epochs while target lives', () => {
    const s = createInitialState(1);
    const attacker = addUnit(s, {
      owner: 'player', type: 'arc_ranger',
      hex: { q: -8, r: 0 },
    });
    const enemy = addUnit(s, {
      owner: 'ai', type: 'chrono_titan',
      hex: { q: -6, r: 0 }, hp: 200, // very high HP to survive multiple rounds
    });

    // Epoch 1: issue attack.
    queueCommand(s, 'player', 0, { type: 'attack', unitId: attacker.id, targetHex: enemy.hex });
    resolveEpoch(s);

    // Transition to planning for epoch 2.
    s.phase = 'planning';

    // The attack order should have been auto-populated.
    const order1 = s.players.player.unitOrders.get(attacker.id);
    expect(order1).toBeDefined();
    expect(order1!.type).toBe('attack');

    // Epoch 2: resolve again without manually issuing a new command.
    resolveEpoch(s);

    // Should still auto-populate for epoch 3.
    const order2 = s.players.player.unitOrders.get(attacker.id);
    expect(order2).toBeDefined();
    expect(order2!.type).toBe('attack');
  });

  it('auto-populates attack against enemy structures', () => {
    const s = createInitialState(1);
    const attacker = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: -8, r: 0 },
    });
    const enemyStruct = addStructure(s, {
      owner: 'ai', type: 'barracks',
      hex: { q: -7, r: 0 }, hp: 200,
    });

    queueCommand(s, 'player', 0, { type: 'attack', unitId: attacker.id, targetHex: enemyStruct.hex });
    resolveEpoch(s);

    const order = s.players.player.unitOrders.get(attacker.id);
    expect(order).toBeDefined();
    expect(order!.type).toBe('attack');
    if (order!.type === 'attack') {
      expect(order!.targetHex).toEqual(enemyStruct.hex);
    }
  });
});
