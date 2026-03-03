import { describe, it, expect } from 'vitest';
import {
  buildAnimationTimeline,
  getAnimatedUnitPosition,
  getCurrentPhase,
  getPhaseProgress,
  categorizeLogEntry,
  getVisibleLogEntries,
  UnitSnapshot,
  StructSnapshot,
  PHASE_MOVE,
  TOTAL_DURATION,
} from '@/renderer/animation';
import { hexToPixel } from '@/engine/hex';
import { BASE_HEX_SIZE } from '@/renderer/drawHex';
import { createInitialState, GameState } from '@/engine/state';

function makeState(): GameState {
  return createInitialState(42);
}

describe('buildAnimationTimeline', () => {
  it('identifies a unit that moved', () => {
    const state = makeState();
    // Pick first player unit.
    const [uid, unit] = [...state.units.entries()].find(([, u]) => u.owner === 'player')!;
    const oldHex = { ...unit.hex };

    const unitSnaps = new Map<string, UnitSnapshot>();
    unitSnaps.set(uid, { hex: oldHex, hp: unit.hp, owner: 'player', type: unit.type });
    const structSnaps = new Map<string, StructSnapshot>();

    // Simulate move.
    unit.hex = { q: oldHex.q + 1, r: oldHex.r };
    state.eventLog = ['player drone → (1,0)'];

    const anim = buildAnimationTimeline(unitSnaps, structSnaps, state);
    const ua = anim.units.get(uid)!;
    expect(ua).toBeDefined();
    expect(ua.fromPixel).toEqual(hexToPixel(oldHex, BASE_HEX_SIZE));
    expect(ua.toPixel).toEqual(hexToPixel(unit.hex, BASE_HEX_SIZE));
    expect(ua.wasDestroyed).toBe(false);
    expect(ua.wasSpawned).toBe(false);
  });

  it('identifies a destroyed unit', () => {
    const state = makeState();
    const [uid, unit] = [...state.units.entries()].find(([, u]) => u.owner === 'ai')!;

    const unitSnaps = new Map<string, UnitSnapshot>();
    unitSnaps.set(uid, { hex: { ...unit.hex }, hp: unit.hp, owner: 'ai', type: unit.type });
    const structSnaps = new Map<string, StructSnapshot>();

    // Remove unit to simulate destruction.
    state.units.delete(uid);
    state.eventLog = ['ai drone destroyed'];

    const anim = buildAnimationTimeline(unitSnaps, structSnaps, state);
    expect(anim.units.has(uid)).toBe(false);
    expect(anim.destroyedUnits.length).toBeGreaterThan(0);
    const du = anim.destroyedUnits.find((u) => u.unitId === uid)!;
    expect(du.wasDestroyed).toBe(true);
    expect(du.newHp).toBe(-1);
  });

  it('identifies a spawned unit', () => {
    const state = makeState();

    const unitSnaps = new Map<string, UnitSnapshot>(); // empty — no units before
    const structSnaps = new Map<string, StructSnapshot>();
    state.eventLog = ['player trained Pulse Sentry'];

    const anim = buildAnimationTimeline(unitSnaps, structSnaps, state);
    // All current units should be marked as spawned.
    for (const ua of anim.units.values()) {
      expect(ua.wasSpawned).toBe(true);
      expect(ua.fromPixel).toEqual(ua.toPixel);
    }
  });

  it('identifies a damaged structure', () => {
    const state = makeState();
    const [sid, struct] = [...state.structures.entries()].find(([, s]) => s.owner === 'ai')!;

    const structSnaps = new Map<string, StructSnapshot>();
    structSnaps.set(sid, { hex: { ...struct.hex }, hp: struct.hp, owner: 'ai', type: struct.type });
    const unitSnaps = new Map<string, UnitSnapshot>();

    // Simulate damage.
    struct.hp -= 10;
    state.eventLog = [];

    const anim = buildAnimationTimeline(unitSnaps, structSnaps, state);
    const sa = anim.structures.get(sid)!;
    expect(sa.wasDamaged).toBe(true);
    expect(sa.wasDestroyed).toBe(false);
  });

  it('identifies a destroyed structure', () => {
    const state = makeState();
    const [sid, struct] = [...state.structures.entries()].find(([, s]) => s.owner === 'ai')!;

    const structSnaps = new Map<string, StructSnapshot>();
    structSnaps.set(sid, { hex: { ...struct.hex }, hp: struct.hp, owner: 'ai', type: struct.type });
    const unitSnaps = new Map<string, UnitSnapshot>();

    state.structures.delete(sid);
    state.eventLog = [];

    const anim = buildAnimationTimeline(unitSnaps, structSnaps, state);
    expect(anim.structures.has(sid)).toBe(false);
    expect(anim.destroyedStructures.length).toBeGreaterThan(0);
    expect(anim.destroyedStructures[0].wasDestroyed).toBe(true);
  });

  it('identifies a newly built structure', () => {
    const state = makeState();
    const structSnaps = new Map<string, StructSnapshot>(); // empty
    const unitSnaps = new Map<string, UnitSnapshot>();
    state.eventLog = [];

    const anim = buildAnimationTimeline(unitSnaps, structSnaps, state);
    for (const sa of anim.structures.values()) {
      expect(sa.wasBuilt).toBe(true);
    }
  });
});

describe('getAnimatedUnitPosition', () => {
  const from = { x: 0, y: 0 };
  const to = { x: 100, y: 50 };
  const anim = {
    unitId: 'u1', owner: 'player' as const, unitType: 'drone' as const,
    fromPixel: from, toPixel: to,
    oldHp: 10, newHp: 10, maxHp: 15,
    wasDestroyed: false, wasSpawned: false, isDefending: false,
  };

  it('returns fromPixel before move phase', () => {
    const pos = getAnimatedUnitPosition(anim, 0);
    expect(pos).toEqual(from);
  });

  it('returns toPixel after move phase', () => {
    const pos = getAnimatedUnitPosition(anim, PHASE_MOVE.start + PHASE_MOVE.dur);
    expect(pos).toEqual(to);
  });

  it('returns interpolated position during move phase', () => {
    const mid = PHASE_MOVE.start + PHASE_MOVE.dur / 2;
    const pos = getAnimatedUnitPosition(anim, mid);
    // Should be between from and to (not exactly midpoint due to ease-out).
    expect(pos.x).toBeGreaterThan(from.x);
    expect(pos.x).toBeLessThan(to.x);
    expect(pos.y).toBeGreaterThan(from.y);
    expect(pos.y).toBeLessThan(to.y);
  });

  it('ease-out makes progress faster at start', () => {
    const quarter = PHASE_MOVE.start + PHASE_MOVE.dur * 0.25;
    const pos = getAnimatedUnitPosition(anim, quarter);
    // With ease-out, at 25% time we should be past 25% distance.
    expect(pos.x / to.x).toBeGreaterThan(0.25);
  });
});

describe('getCurrentPhase', () => {
  it('returns defend at start', () => {
    expect(getCurrentPhase(0)).toBe('defend');
  });

  it('returns move at 0.5s', () => {
    expect(getCurrentPhase(0.5)).toBe('move');
  });

  it('returns attack at 2.0s', () => {
    expect(getCurrentPhase(2.0)).toBe('attack');
  });

  it('returns build at 3.0s', () => {
    expect(getCurrentPhase(3.0)).toBe('build');
  });

  it('returns null after total duration', () => {
    expect(getCurrentPhase(TOTAL_DURATION)).toBeNull();
  });
});

describe('getPhaseProgress', () => {
  it('returns 0 at phase start', () => {
    expect(getPhaseProgress(PHASE_MOVE.start, PHASE_MOVE)).toBeCloseTo(0);
  });

  it('returns 0.5 at phase midpoint', () => {
    expect(getPhaseProgress(PHASE_MOVE.start + PHASE_MOVE.dur / 2, PHASE_MOVE)).toBeCloseTo(0.5);
  });

  it('returns -1 outside phase', () => {
    expect(getPhaseProgress(0, PHASE_MOVE)).toBe(-1);
  });
});

describe('categorizeLogEntry', () => {
  it('maps defending to defend phase', () => {
    expect(categorizeLogEntry('player pulse_sentry is defending')).toBe('defend');
  });

  it('maps movement arrow to move phase', () => {
    expect(categorizeLogEntry('player drone → (1,0)')).toBe('move');
  });

  it('maps attacks to attack phase', () => {
    expect(categorizeLogEntry('player arc_ranger attacks ai drone for 8')).toBe('attack');
  });

  it('maps destroyed to attack phase', () => {
    expect(categorizeLogEntry('ai drone destroyed')).toBe('attack');
  });

  it('maps build/train/gather to build phase', () => {
    expect(categorizeLogEntry('player began building Crystal Extractor')).toBe('build');
    expect(categorizeLogEntry('player trained Pulse Sentry')).toBe('build');
    expect(categorizeLogEntry('player Crystal Extractor yields +3 CC')).toBe('build');
  });
});

describe('getVisibleLogEntries', () => {
  const log = [
    'player pulse_sentry is defending',
    'player drone → (1,0)',
    'player arc_ranger attacks ai drone for 8',
    'player began building Crystal Extractor',
  ];

  it('shows only defend entries during defend phase', () => {
    const visible = getVisibleLogEntries(log, 0.2);
    expect(visible).toEqual([log[0]]);
  });

  it('shows defend + move entries during move phase', () => {
    const visible = getVisibleLogEntries(log, 1.0);
    expect(visible).toEqual([log[0], log[1]]);
  });

  it('shows all entries after animation', () => {
    const visible = getVisibleLogEntries(log, TOTAL_DURATION + 1);
    expect(visible).toEqual(log);
  });
});
