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
    attackTargetHex: null, moveTargetHex: null, pendingBuild: null,
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

  it('does not auto-populate if target destroyed and unit is at target hex', () => {
    const s = createInitialState(1);
    // Place attacker adjacent to enemy so it's in range and already at/near the target.
    const attacker = addUnit(s, {
      owner: 'player', type: 'pulse_sentry', // range 1
      hex: { q: -7, r: 0 },
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

    // Attacker moved to the target hex and no enemies around — should clear.
    expect(attacker.attackTargetHex).toBeNull();
  });

  it('keeps attack-moving toward distant target when enemy destroyed', () => {
    const s = createInitialState(1);
    // Use pulse_sentry (range 1, speed 3) far from target so it's out of range.
    const attacker = addUnit(s, {
      owner: 'player', type: 'pulse_sentry', // range 1, speed 3
      hex: { q: -8, r: 0 },
    });
    // Enemy far away — place another enemy in range for the attack to resolve,
    // but keep the target hex distant.
    const farTargetHex = { q: -3, r: 0 };
    // Manually set an attack command targeting a distant hex.
    queueCommand(s, 'player', 0, { type: 'attack', unitId: attacker.id, targetHex: farTargetHex });
    resolveEpoch(s);

    // Attacker still has the target because it hasn't arrived yet (distance > range).
    expect(attacker.attackTargetHex).toEqual(farTargetHex);
    const order = s.players.player.unitOrders.get(attacker.id);
    expect(order).toBeDefined();
    expect(order!.type).toBe('attack');
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

  it('clears attackTargetHex when unit arrives at target and no enemies around', () => {
    const s = createInitialState(1);
    const attacker = addUnit(s, {
      owner: 'player', type: 'arc_ranger',
      // Place at the target hex already — enemy moved away.
      hex: { q: -6, r: 0 },
      attackTargetHex: { q: -6, r: 0 },
    });
    // No enemy at that hex anymore — they moved away, and no enemies in range.

    // Don't queue any command; the auto-populate logic should detect
    // arrival + no enemies and clear attackTargetHex.
    resolveEpoch(s);

    expect(attacker.attackTargetHex).toBeNull();
    expect(s.players.player.unitOrders.has(attacker.id)).toBe(false);
  });

  it('keeps attack-moving when target moves away but unit is far from target', () => {
    const s = createInitialState(1);
    // Use pulse_sentry (range 1) far from target so distance > range.
    const attacker = addUnit(s, {
      owner: 'player', type: 'pulse_sentry', // range 1
      hex: { q: -8, r: 0 },
      attackTargetHex: { q: -3, r: 0 },
    });
    // No enemy at the target hex — they moved away.
    // But the unit is far from the target (distance 5 > range 1), so it should keep moving.

    resolveEpoch(s);

    // Unit should still have attack target and auto-populated attack order.
    expect(attacker.attackTargetHex).toEqual({ q: -3, r: 0 });
    const order = s.players.player.unitOrders.get(attacker.id);
    expect(order).toBeDefined();
    expect(order!.type).toBe('attack');
  });
});
