import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, newId, resetIdSeq, GameState } from '@/engine/state';
import { resolveEpoch, computeMergeBonus } from '@/engine/resolution';
import { Unit, UNIT_DEFS, effectiveMaxHp, effectiveAttack } from '@/engine/units';
import { computeUnitMergeTargets } from '@/engine/targeting';
import { queueCommand } from './helpers';

beforeEach(() => resetIdSeq());

// ── Helpers ───────────────────────────────────────────────────────────────────

function addUnit(state: GameState, partial: Partial<Unit> & Pick<Unit, 'owner' | 'type' | 'hex'>): Unit {
  const unit: Unit = {
    id:                  newId('u'),
    hp:                  UNIT_DEFS[partial.type].maxHp,
    isDefending:         false,
    assignedExtractorId: null,
    damageShield:        false,
    mergeCount:          0,
    bonusMaxHp:          0,
    bonusAttack:         0,
    attackTargetHex:     null,
    ...partial,
  };
  state.units.set(unit.id, unit);
  return unit;
}

// ── computeMergeBonus ─────────────────────────────────────────────────────────

describe('computeMergeBonus', () => {
  it('first merge gives 50% of base stat (floored, min 1)', () => {
    // base 40, mergeCount 0 → floor(40 * 0.5/1) = 20
    expect(computeMergeBonus(40, 0)).toBe(20);
  });

  it('second merge gives 25% of base stat', () => {
    // base 40, mergeCount 1 → floor(40 * 0.5/2) = 10
    expect(computeMergeBonus(40, 1)).toBe(10);
  });

  it('third merge gives ~16% of base stat', () => {
    // base 40, mergeCount 2 → floor(40 * 0.5/3) = floor(6.67) = 6
    expect(computeMergeBonus(40, 2)).toBe(6);
  });

  it('minimum bonus is 1', () => {
    // Very small base stat at high merge count
    expect(computeMergeBonus(1, 10)).toBe(1);
  });
});

// ── computeUnitMergeTargets ───────────────────────────────────────────────────

describe('computeUnitMergeTargets', () => {
  it('finds same-type friendly units within MERGE_RANGE', () => {
    const s = createInitialState(1);
    const sentry1 = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: 0, r: 0 } });
    const sentry2 = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: 1, r: 0 } });

    const targets = computeUnitMergeTargets(s, sentry1);
    expect(targets).toHaveLength(1);
    expect(targets[0].unitId).toBe(sentry2.id);
  });

  it('excludes units of different type', () => {
    const s = createInitialState(1);
    const sentry = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: 0, r: 0 } });
    addUnit(s, { owner: 'player', type: 'arc_ranger', hex: { q: 1, r: 0 } });

    const targets = computeUnitMergeTargets(s, sentry);
    expect(targets).toHaveLength(0);
  });

  it('excludes enemy units', () => {
    const s = createInitialState(1);
    const sentry = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: 0, r: 0 } });
    addUnit(s, { owner: 'ai', type: 'pulse_sentry', hex: { q: 1, r: 0 } });

    const targets = computeUnitMergeTargets(s, sentry);
    expect(targets).toHaveLength(0);
  });

  it('excludes units beyond MERGE_RANGE', () => {
    const s = createInitialState(1);
    const sentry = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: 0, r: 0 } });
    // Distance 3 is beyond MERGE_RANGE (2)
    addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: 3, r: 0 } });

    const targets = computeUnitMergeTargets(s, sentry);
    expect(targets).toHaveLength(0);
  });

  it('sorts targets by distance', () => {
    const s = createInitialState(1);
    const sentry = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: 0, r: 0 } });
    const far = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: 2, r: 0 } });
    const near = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: 1, r: 0 } });

    const targets = computeUnitMergeTargets(s, sentry);
    expect(targets).toHaveLength(2);
    expect(targets[0].unitId).toBe(near.id);
    expect(targets[1].unitId).toBe(far.id);
  });
});

// ── stepMerge (via resolveEpoch) ──────────────────────────────────────────────

describe('Merge step', () => {
  it('absorbs a single target and boosts stats', () => {
    const s = createInitialState(1);
    const survivor = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -8, r: 0 } });
    const target = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -7, r: 0 } });

    queueCommand(s, 'player', 0, {
      type: 'merge', unitId: survivor.id, targetUnitIds: [target.id],
    });

    const def = UNIT_DEFS['pulse_sentry'];
    resolveEpoch(s);

    const merged = s.units.get(survivor.id)!;
    expect(merged.mergeCount).toBe(1);
    expect(merged.bonusMaxHp).toBe(computeMergeBonus(def.maxHp, 0));
    expect(merged.bonusAttack).toBe(computeMergeBonus(def.attack, 0));
    expect(merged.hp).toBe(def.maxHp + merged.bonusMaxHp);
    // Target should be deleted
    expect(s.units.has(target.id)).toBe(false);
  });

  it('absorbs multiple targets with diminishing returns', () => {
    const s = createInitialState(1);
    const survivor = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -8, r: 0 } });
    const t1 = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -7, r: 0 } });
    const t2 = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -7, r: 1 } });

    queueCommand(s, 'player', 0, {
      type: 'merge', unitId: survivor.id, targetUnitIds: [t1.id, t2.id],
    });

    const def = UNIT_DEFS['pulse_sentry'];
    resolveEpoch(s);

    const merged = s.units.get(survivor.id)!;
    expect(merged.mergeCount).toBe(2);
    // First absorb: bonus at mergeCount+absorbed=0, second: mergeCount=1,absorbed=1 → 2
    const expectedHpBonus = computeMergeBonus(def.maxHp, 0) + computeMergeBonus(def.maxHp, 2);
    const expectedAtkBonus = computeMergeBonus(def.attack, 0) + computeMergeBonus(def.attack, 2);
    expect(merged.bonusMaxHp).toBe(expectedHpBonus);
    expect(merged.bonusAttack).toBe(expectedAtkBonus);
    expect(s.units.has(t1.id)).toBe(false);
    expect(s.units.has(t2.id)).toBe(false);
  });

  it('previously merged unit gets reduced bonus on next merge', () => {
    const s = createInitialState(1);
    const survivor = addUnit(s, {
      owner: 'player', type: 'pulse_sentry', hex: { q: -8, r: 0 },
      mergeCount: 2, bonusMaxHp: 30, bonusAttack: 10,
    });
    const target = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -7, r: 0 } });

    queueCommand(s, 'player', 0, {
      type: 'merge', unitId: survivor.id, targetUnitIds: [target.id],
    });

    const def = UNIT_DEFS['pulse_sentry'];
    resolveEpoch(s);

    const merged = s.units.get(survivor.id)!;
    expect(merged.mergeCount).toBe(3);
    // Bonus computed at mergeCount 2 (the pre-merge count)
    const expectedNewHp = computeMergeBonus(def.maxHp, 2);
    const expectedNewAtk = computeMergeBonus(def.attack, 2);
    expect(merged.bonusMaxHp).toBe(30 + expectedNewHp);
    expect(merged.bonusAttack).toBe(10 + expectedNewAtk);
  });

  it('does not merge units of different types', () => {
    const s = createInitialState(1);
    const sentry = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -8, r: 0 } });
    const ranger = addUnit(s, { owner: 'player', type: 'arc_ranger', hex: { q: -7, r: 0 } });

    queueCommand(s, 'player', 0, {
      type: 'merge', unitId: sentry.id, targetUnitIds: [ranger.id],
    });

    resolveEpoch(s);

    // Nothing should happen — both units remain
    expect(s.units.has(sentry.id)).toBe(true);
    expect(s.units.has(ranger.id)).toBe(true);
    expect(s.units.get(sentry.id)!.mergeCount).toBe(0);
  });

  it('does not merge enemy units', () => {
    const s = createInitialState(1);
    const mine = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -8, r: 0 } });
    const enemy = addUnit(s, { owner: 'ai', type: 'pulse_sentry', hex: { q: -7, r: 0 } });

    queueCommand(s, 'player', 0, {
      type: 'merge', unitId: mine.id, targetUnitIds: [enemy.id],
    });

    resolveEpoch(s);

    expect(s.units.has(mine.id)).toBe(true);
    expect(s.units.has(enemy.id)).toBe(true);
    expect(s.units.get(mine.id)!.mergeCount).toBe(0);
  });

  it('does not merge units beyond MERGE_RANGE', () => {
    const s = createInitialState(1);
    const sentry = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -8, r: 0 } });
    // Distance 3 is beyond MERGE_RANGE
    const farSentry = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -5, r: 0 } });

    queueCommand(s, 'player', 0, {
      type: 'merge', unitId: sentry.id, targetUnitIds: [farSentry.id],
    });

    resolveEpoch(s);

    expect(s.units.has(sentry.id)).toBe(true);
    expect(s.units.has(farSentry.id)).toBe(true);
    expect(s.units.get(sentry.id)!.mergeCount).toBe(0);
  });

  it('skips already-consumed units (no double merge)', () => {
    const s = createInitialState(1);
    const survivor1 = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -8, r: 0 } });
    const survivor2 = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -7, r: 1 } });
    const shared = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -7, r: 0 } });

    // Both survivors try to merge the same target
    queueCommand(s, 'player', 0, {
      type: 'merge', unitId: survivor1.id, targetUnitIds: [shared.id],
    });
    queueCommand(s, 'player', 0, {
      type: 'merge', unitId: survivor2.id, targetUnitIds: [shared.id],
    });

    resolveEpoch(s);

    // Shared unit consumed by first merger only
    expect(s.units.has(shared.id)).toBe(false);
    // One should have mergeCount 1, the other 0
    const m1 = s.units.get(survivor1.id)!.mergeCount;
    const m2 = s.units.get(survivor2.id)!.mergeCount;
    expect(m1 + m2).toBe(1);
  });

  it('effective stat helpers reflect merge bonuses', () => {
    const s = createInitialState(1);
    const unit = addUnit(s, {
      owner: 'player', type: 'pulse_sentry', hex: { q: 0, r: 0 },
      mergeCount: 1, bonusMaxHp: 20, bonusAttack: 5,
    });

    const def = UNIT_DEFS['pulse_sentry'];
    expect(effectiveMaxHp(unit)).toBe(def.maxHp + 20);
    expect(effectiveAttack(unit)).toBe(def.attack + 5);
  });

  it('cleans up unit orders for consumed units', () => {
    const s = createInitialState(1);
    const survivor = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -8, r: 0 } });
    const target = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: -7, r: 0 } });

    // Give the target a defend order so it has an entry in unitOrders
    queueCommand(s, 'player', 0, {
      type: 'defend', unitId: target.id,
    });
    queueCommand(s, 'player', 0, {
      type: 'merge', unitId: survivor.id, targetUnitIds: [target.id],
    });

    resolveEpoch(s);

    // Target's orders should be cleaned up
    expect(s.players.player.unitOrders.has(target.id)).toBe(false);
  });
});
