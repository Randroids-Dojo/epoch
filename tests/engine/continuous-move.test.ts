import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, resetIdSeq, GameState, newId } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
import { Unit, UNIT_DEFS } from '@/engine/units';
import { hexEqual } from '@/engine/hex';
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
    attackTargetHex: null,
    moveTargetHex: null,
    ...partial,
  };
  state.units.set(unit.id, unit);
  return unit;
}

describe('Continuous unit movement', () => {
  it('auto-populates move order when unit has not reached destination', () => {
    const s = createInitialState(1);
    // Pulse sentry speed = 3, target is 6 hexes away — needs 2 epochs.
    const unit = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: -8, r: 0 },
    });
    const farTarget = { q: -2, r: 0 };
    queueCommand(s, 'player', 0, { type: 'move', unitId: unit.id, targetHex: farTarget });
    resolveEpoch(s);

    // Unit should have moved but not reached the target.
    expect(hexEqual(unit.hex, farTarget)).toBe(false);
    // moveTargetHex should be set.
    expect(unit.moveTargetHex).toEqual(farTarget);
    // A move order should be auto-populated for next epoch.
    const order = s.players.player.unitOrders.get(unit.id);
    expect(order).toBeDefined();
    expect(order!.type).toBe('move');
    expect(s.players.player.defaultOrderUnitIds.has(unit.id)).toBe(true);
  });

  it('clears moveTargetHex when unit reaches destination', () => {
    const s = createInitialState(1);
    // Pulse sentry speed = 3, target is 2 hexes away — arrives in 1 epoch.
    const unit = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: -8, r: 0 },
    });
    const nearTarget = { q: -6, r: 0 };
    queueCommand(s, 'player', 0, { type: 'move', unitId: unit.id, targetHex: nearTarget });
    resolveEpoch(s);

    // Unit should have arrived.
    expect(hexEqual(unit.hex, nearTarget)).toBe(true);
    // moveTargetHex should be cleared.
    expect(unit.moveTargetHex).toBeNull();
    // No auto-populated order.
    expect(s.players.player.unitOrders.has(unit.id)).toBe(false);
  });

  it('clears moveTargetHex when unit takes damage', () => {
    const s = createInitialState(1);
    // Unit with a pre-set persistent move target, no explicit order this epoch.
    const unit = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: -5, r: 0 },
      moveTargetHex: { q: 0, r: 0 },
    });
    // Enemy arc_ranger adjacent (range 3), attacks the unit's hex directly.
    const enemy = addUnit(s, {
      owner: 'ai', type: 'arc_ranger',
      hex: { q: -3, r: 0 },
    });

    // Only queue enemy attack — no order for our unit so moveTargetHex persists
    // through stepDefend. The auto-populated move order from stepPostResolution
    // hasn't run yet (this is the current epoch). But we need the unit to stay
    // at its hex so the attack hits. So don't queue any order for the player unit.
    queueCommand(s, 'ai', 0, { type: 'attack', unitId: enemy.id, targetHex: unit.hex });
    resolveEpoch(s);

    // Unit was hit, so moveTargetHex should be cleared.
    const u = s.units.get(unit.id);
    expect(u).toBeDefined();
    expect(u!.hp).toBeLessThan(UNIT_DEFS.pulse_sentry.maxHp);
    expect(u!.moveTargetHex).toBeNull();
  });

  it('clears moveTargetHex when a non-move order is given', () => {
    const s = createInitialState(1);
    const unit = addUnit(s, {
      owner: 'player', type: 'arc_ranger',
      hex: { q: -8, r: 0 },
      moveTargetHex: { q: 0, r: 0 }, // pre-set persistent move target
    });

    // Give a defend order instead of move.
    queueCommand(s, 'player', 0, { type: 'defend', unitId: unit.id });
    resolveEpoch(s);

    expect(unit.moveTargetHex).toBeNull();
  });

  it('movement persists across multiple epochs until arrival', () => {
    const s = createInitialState(1);
    // Chrono titan: speed 1. Target 3 hexes away — needs 3 epochs.
    const unit = addUnit(s, {
      owner: 'player', type: 'chrono_titan',
      hex: { q: -8, r: 0 },
    });
    const farTarget = { q: -5, r: 0 };

    queueCommand(s, 'player', 0, { type: 'move', unitId: unit.id, targetHex: farTarget });

    // Epoch 1
    resolveEpoch(s);
    expect(hexEqual(unit.hex, farTarget)).toBe(false);
    expect(unit.moveTargetHex).toEqual(farTarget);
    const order1 = s.players.player.unitOrders.get(unit.id);
    expect(order1).toBeDefined();
    expect(order1!.type).toBe('move');

    // Epoch 2
    s.phase = 'planning';
    resolveEpoch(s);
    expect(hexEqual(unit.hex, farTarget)).toBe(false);
    expect(unit.moveTargetHex).toEqual(farTarget);

    // Epoch 3
    s.phase = 'planning';
    resolveEpoch(s);
    expect(hexEqual(unit.hex, farTarget)).toBe(true);
    expect(unit.moveTargetHex).toBeNull();
    // No auto-populated order since it arrived.
    expect(s.players.player.unitOrders.has(unit.id)).toBe(false);
  });

  it('continues moving even when path is partially blocked', () => {
    const s = createInitialState(1);
    // Chrono titan speed 1 heading to a distant target.
    const unit = addUnit(s, {
      owner: 'player', type: 'chrono_titan',
      hex: { q: -8, r: 0 },
    });
    const target = { q: -5, r: 0 };

    // Place a blocker one hex ahead on the direct path.
    addUnit(s, {
      owner: 'ai', type: 'drone',
      hex: { q: -7, r: 0 }, hp: 100,
    });

    queueCommand(s, 'player', 0, { type: 'move', unitId: unit.id, targetHex: target });
    resolveEpoch(s);

    // Unit should have moved (possibly via an alternate route) or stayed.
    // Either way, moveTargetHex should persist because it hasn't arrived.
    expect(unit.moveTargetHex).toEqual(target);
    const order = s.players.player.unitOrders.get(unit.id);
    expect(order).toBeDefined();
    expect(order!.type).toBe('move');
  });
});
