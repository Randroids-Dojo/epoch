import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, findNexus, resetIdSeq, GameState } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
import { Unit } from '@/engine/units';
import { Structure } from '@/engine/structures';
import { newId } from '@/engine/state';
import { queueCommand } from './helpers';

beforeEach(() => resetIdSeq());

// ── Helpers ───────────────────────────────────────────────────────────────────

function addUnit(state: GameState, partial: Partial<Unit> & Pick<Unit, 'owner' | 'type' | 'hex'>): Unit {
  const unit: Unit = {
    id:                  newId('u'),
    hp:                  50,
    isDefending:         false,
    assignedExtractorId: null,
    ...partial,
  };
  state.units.set(unit.id, unit);
  return unit;
}

function addStructure(state: GameState, partial: Partial<Structure> & Pick<Structure, 'owner' | 'type' | 'hex'>): Structure {
  const s: Structure = {
    id:              newId('s'),
    hp:              40,
    buildProgress:   0,
    assignedDroneId: null,
    ...partial,
  };
  state.structures.set(s.id, s);
  return s;
}

// ── Step 1: Defend ────────────────────────────────────────────────────────────

describe('Defend step', () => {
  it('sets isDefending on the target unit', () => {
    const s = createInitialState(1);
    const sentry = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: -8, r: 0 }, hp: 40,
    });
    queueCommand(s, 'player', 0, { type: 'defend', unitId: sentry.id });

    resolveEpoch(s);
    // isDefending is cleared at the START of the next epoch's defend step,
    // so it remains true until then.
    expect(s.units.get(sentry.id)?.isDefending).toBe(true);
  });

  it('defending unit takes half damage (rounded up)', () => {
    const s = createInitialState(1);
    // Place an enemy Pulse Sentry adjacent to player's Pulse Sentry
    const playerSentry = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: 0, r: 0 }, hp: 40,
    });
    const aiSentry = addUnit(s, {
      owner: 'ai', type: 'pulse_sentry',
      hex: { q: 1, r: 0 }, hp: 40,
    });

    // Player defends; AI attacks
    queueCommand(s, 'player', 0, { type: 'defend', unitId: playerSentry.id });
    queueCommand(s, 'ai',     0, { type: 'attack', unitId: aiSentry.id, targetHex: { q: 0, r: 0 } });

    resolveEpoch(s);

    // AI Pulse Sentry deals 12 dmg. Halved (defending) = 6, rounded up = 6.
    const survivor = s.units.get(playerSentry.id);
    expect(survivor).toBeDefined();
    expect(survivor!.hp).toBe(40 - 6);
  });
});

// ── Step 3: Move ─────────────────────────────────────────────────────────────

describe('Move step', () => {
  it('moves a unit up to its speed toward target', () => {
    const s = createInitialState(1);
    const sentry = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: -8, r: 0 }, hp: 40,
    });
    // Target 4 hexes east; speed = 2, should end up 2 steps east
    const target = { q: -4, r: 0 };
    queueCommand(s, 'player', 0, { type: 'move', unitId: sentry.id, targetHex: target });

    resolveEpoch(s);

    const moved = s.units.get(sentry.id);
    expect(moved).toBeDefined();
    // Should have moved exactly 2 steps eastward
    const dist = Math.abs(moved!.hex.q - (-8));
    expect(dist).toBeLessThanOrEqual(2);
    expect(dist).toBeGreaterThan(0);
  });

  it('does not move into impassable void_rift terrain', () => {
    const s = createInitialState(1);
    const sentry = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: 0, r: 0 }, hp: 40,
    });
    // Place void_rift in all 6 neighbors
    for (const nb of [
      { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 },
      { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 },
    ]) {
      const cell = s.map.cells.get(`${nb.q},${nb.r}`);
      if (cell) cell.terrain = 'void_rift';
    }
    queueCommand(s, 'player', 0, { type: 'move', unitId: sentry.id, targetHex: { q: 5, r: 0 } });

    resolveEpoch(s);

    const stayed = s.units.get(sentry.id);
    expect(stayed!.hex).toEqual({ q: 0, r: 0 });
  });

  it('stops when path to target is already reached', () => {
    const s = createInitialState(1);
    const sentry = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: 0, r: 0 }, hp: 40,
    });
    queueCommand(s, 'player', 0, {
      type: 'move', unitId: sentry.id, targetHex: { q: 0, r: 0 },
    });

    resolveEpoch(s);

    expect(s.units.get(sentry.id)!.hex).toEqual({ q: 0, r: 0 });
  });
});

// ── Step 4: Attack ────────────────────────────────────────────────────────────

describe('Attack step', () => {
  it('deals damage to an adjacent enemy unit (melee)', () => {
    const s = createInitialState(1);
    const attacker = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: 0, r: 0 }, hp: 40,
    });
    const target = addUnit(s, {
      owner: 'ai', type: 'pulse_sentry',
      hex: { q: 1, r: 0 }, hp: 40,
    });
    queueCommand(s, 'player', 0, {
      type: 'attack', unitId: attacker.id, targetHex: { q: 1, r: 0 },
    });

    resolveEpoch(s);

    expect(s.units.get(target.id)!.hp).toBe(40 - 12);
  });

  it('removes a unit when HP drops to 0', () => {
    const s = createInitialState(1);
    const attacker = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: 0, r: 0 }, hp: 40,
    });
    const fragile = addUnit(s, {
      owner: 'ai', type: 'drone',
      hex: { q: 1, r: 0 }, hp: 3, // exactly lethal
    });
    queueCommand(s, 'player', 0, {
      type: 'attack', unitId: attacker.id, targetHex: { q: 1, r: 0 },
    });

    resolveEpoch(s);

    expect(s.units.has(fragile.id)).toBe(false);
  });

  it('ranged unit can attack from 3 hexes away', () => {
    const s = createInitialState(1);
    const ranger = addUnit(s, {
      owner: 'player', type: 'arc_ranger',
      hex: { q: 0, r: 0 }, hp: 25,
    });
    const target = addUnit(s, {
      owner: 'ai', type: 'pulse_sentry',
      hex: { q: 3, r: 0 }, hp: 40,
    });
    queueCommand(s, 'player', 0, {
      type: 'attack', unitId: ranger.id, targetHex: { q: 3, r: 0 },
    });

    resolveEpoch(s);

    expect(s.units.get(target.id)!.hp).toBe(40 - 8);
  });

  it('attack out of range deals no damage', () => {
    const s = createInitialState(1);
    const sentry = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: 0, r: 0 }, hp: 40,
    });
    const farTarget = addUnit(s, {
      owner: 'ai', type: 'pulse_sentry',
      hex: { q: 5, r: 0 }, hp: 40,
    });
    queueCommand(s, 'player', 0, {
      type: 'attack', unitId: sentry.id, targetHex: { q: 5, r: 0 },
    });

    resolveEpoch(s);

    expect(s.units.get(farTarget.id)!.hp).toBe(40);
  });

  it('simultaneous attacks: both units take damage in the same epoch', () => {
    const s = createInitialState(1);
    const a = addUnit(s, { owner: 'player', type: 'pulse_sentry', hex: { q: 0, r: 0 }, hp: 40 });
    const b = addUnit(s, { owner: 'ai',     type: 'pulse_sentry', hex: { q: 1, r: 0 }, hp: 40 });

    queueCommand(s, 'player', 0, { type: 'attack', unitId: a.id, targetHex: { q: 1, r: 0 } });
    queueCommand(s, 'ai',     0, { type: 'attack', unitId: b.id, targetHex: { q: 0, r: 0 } });

    resolveEpoch(s);

    expect(s.units.get(a.id)!.hp).toBe(40 - 12);
    expect(s.units.get(b.id)!.hp).toBe(40 - 12);
  });

  it('attacks damage enemy structures (including Command Nexus)', () => {
    const s = createInitialState(1);
    const nexus = findNexus(s, 'ai')!;
    const initialHp = nexus.hp;

    // Place a player sentry adjacent to the AI nexus
    const sentry = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: nexus.hex.q - 1, r: nexus.hex.r }, hp: 40,
    });
    queueCommand(s, 'player', 0, {
      type: 'attack', unitId: sentry.id, targetHex: nexus.hex,
    });

    resolveEpoch(s);

    expect(s.structures.get(nexus.id)!.hp).toBe(initialHp - 12);
  });
});

// ── Step 5: Build ─────────────────────────────────────────────────────────────

describe('Build step', () => {
  it('places a structure with correct build progress', () => {
    const s = createInitialState(1);
    s.players.player.resources.cc = 10;
    // (-8, 0) is occupied by the player drone; use (-8, -1) instead
    const target = { q: -8, r: -1 };

    queueCommand(s, 'player', 0, {
      type: 'build', targetHex: target, structureType: 'barracks',
    });

    resolveEpoch(s);

    const barracks = [...s.structures.values()].find(
      st => st.type === 'barracks' && st.owner === 'player',
    );
    expect(barracks).toBeDefined();
    // Placed this epoch with buildEpochs=1; tick runs BEFORE new builds are added,
    // so it won't complete until the next epoch's tick.
    expect(barracks!.buildProgress).toBe(1);
  });

  it('deducts CC when building', () => {
    const s = createInitialState(1);
    s.players.player.resources.cc = 10;
    queueCommand(s, 'player', 0, {
      type: 'build', targetHex: { q: -8, r: -1 }, structureType: 'barracks',
    });

    resolveEpoch(s);

    // Barracks costs 5 CC
    expect(s.players.player.resources.cc).toBe(5); // 10 - 5
  });

  it('fails to build when insufficient CC', () => {
    const s = createInitialState(1);
    s.players.player.resources.cc = 2; // not enough for barracks (5 CC)
    queueCommand(s, 'player', 0, {
      type: 'build', targetHex: { q: -8, r: 0 }, structureType: 'barracks',
    });

    resolveEpoch(s);

    const barracks = [...s.structures.values()].find(st => st.type === 'barracks');
    expect(barracks).toBeUndefined();
    expect(s.players.player.resources.cc).toBe(2); // unchanged
  });
});

// ── Step 7: Gather ────────────────────────────────────────────────────────────

describe('Gather step', () => {
  it('staffed Crystal Extractor yields CC each epoch', () => {
    const s = createInitialState(1);
    s.players.player.resources.cc = 0;

    // Place a completed Crystal Extractor and a Drone at the same hex
    const extractorHex = { q: -6, r: 0 };
    addStructure(s, {
      owner: 'player', type: 'crystal_extractor',
      hex: extractorHex, buildProgress: 0,
    });
    const drone = [...s.units.values()].find(u => u.owner === 'player')!;
    drone.hex = extractorHex; // move drone onto the extractor

    queueCommand(s, 'player', 0, {
      type: 'gather', unitId: drone.id, targetHex: extractorHex,
    });

    resolveEpoch(s);

    expect(s.players.player.resources.cc).toBe(3); // +3 from extractor
  });

  it('does not yield from incomplete extractor', () => {
    const s = createInitialState(1);
    s.players.player.resources.cc = 0;

    const extractorHex = { q: -6, r: 0 };
    addStructure(s, {
      owner: 'player', type: 'crystal_extractor',
      hex: extractorHex, buildProgress: 2, // 2 → ticks to 1 (still under construction)
    });
    const drone = [...s.units.values()].find(u => u.owner === 'player')!;
    drone.hex = extractorHex;

    queueCommand(s, 'player', 0, {
      type: 'gather', unitId: drone.id, targetHex: extractorHex,
    });

    resolveEpoch(s);

    expect(s.players.player.resources.cc).toBe(0);
  });
});

// ── Step 8: Train ─────────────────────────────────────────────────────────────

describe('Train step', () => {
  it('spawns a unit at a complete Barracks', () => {
    const s = createInitialState(1);
    s.players.player.resources.cc = 20;

    const barracks = addStructure(s, {
      owner: 'player', type: 'barracks',
      hex: { q: -7, r: 0 }, buildProgress: 0,
    });
    queueCommand(s, 'player', 0, {
      type: 'train', structureId: barracks.id, unitType: 'pulse_sentry',
    });

    const unitsBefore = s.units.size;
    resolveEpoch(s);

    expect(s.units.size).toBe(unitsBefore + 1);
    const spawned = [...s.units.values()].find(
      u => u.type === 'pulse_sentry' && u.owner === 'player',
    );
    expect(spawned).toBeDefined();
  });

  it('deducts CC when training', () => {
    const s = createInitialState(1);
    s.players.player.resources.cc = 20;

    const barracks = addStructure(s, {
      owner: 'player', type: 'barracks',
      hex: { q: -7, r: 0 }, buildProgress: 0,
    });
    queueCommand(s, 'player', 0, {
      type: 'train', structureId: barracks.id, unitType: 'pulse_sentry',
    });

    resolveEpoch(s);

    // Pulse Sentry costs 4 CC
    expect(s.players.player.resources.cc).toBe(20 - 4);
  });

  it('fails to train when insufficient CC', () => {
    const s = createInitialState(1);
    s.players.player.resources.cc = 1;

    const barracks = addStructure(s, {
      owner: 'player', type: 'barracks',
      hex: { q: -7, r: 0 }, buildProgress: 0,
    });
    queueCommand(s, 'player', 0, {
      type: 'train', structureId: barracks.id, unitType: 'pulse_sentry',
    });

    const unitsBefore = s.units.size;
    resolveEpoch(s);

    expect(s.units.size).toBe(unitsBefore);
  });
});

// ── Win condition ─────────────────────────────────────────────────────────────

describe('Win conditions', () => {
  it('player wins when AI Command Nexus is destroyed', () => {
    const s = createInitialState(1);
    const aiNexus = findNexus(s, 'ai')!;

    // One-shot the AI nexus: set its HP to 1 and attack with a powerful unit
    aiNexus.hp = 1;
    const sentry = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: aiNexus.hex.q - 1, r: aiNexus.hex.r }, hp: 40,
    });
    queueCommand(s, 'player', 0, {
      type: 'attack', unitId: sentry.id, targetHex: aiNexus.hex,
    });

    resolveEpoch(s);

    expect(s.winner).toBe('player');
    expect(s.phase).toBe('over');
  });

  it('AI wins when player Command Nexus is destroyed', () => {
    const s = createInitialState(1);
    const playerNexus = findNexus(s, 'player')!;

    playerNexus.hp = 1;
    const aiSentry = addUnit(s, {
      owner: 'ai', type: 'pulse_sentry',
      hex: { q: playerNexus.hex.q + 1, r: playerNexus.hex.r }, hp: 40,
    });
    queueCommand(s, 'ai', 0, {
      type: 'attack', unitId: aiSentry.id, targetHex: playerNexus.hex,
    });

    resolveEpoch(s);

    expect(s.winner).toBe('ai');
    expect(s.phase).toBe('over');
  });

  it('AI wins on mutual Nexus destruction (simultaneous)', () => {
    const s = createInitialState(1);
    const playerNexus = findNexus(s, 'player')!;
    const aiNexus = findNexus(s, 'ai')!;

    // Set both nexuses to 1 HP.
    playerNexus.hp = 1;
    aiNexus.hp = 1;

    // Player attacks AI nexus; AI attacks player nexus — both die in same epoch.
    const playerSentry = addUnit(s, {
      owner: 'player', type: 'pulse_sentry',
      hex: { q: aiNexus.hex.q - 1, r: aiNexus.hex.r }, hp: 40,
    });
    const aiSentry = addUnit(s, {
      owner: 'ai', type: 'pulse_sentry',
      hex: { q: playerNexus.hex.q + 1, r: playerNexus.hex.r }, hp: 40,
    });
    queueCommand(s, 'player', 0, { type: 'attack', unitId: playerSentry.id, targetHex: aiNexus.hex });
    queueCommand(s, 'ai', 0, { type: 'attack', unitId: aiSentry.id, targetHex: playerNexus.hex });

    resolveEpoch(s);

    // Per spec: mutual destruction treats as player defeat.
    expect(s.winner).toBe('ai');
    expect(s.phase).toBe('over');
  });

  it('advances epoch and transitions to planning if no winner', () => {
    const s = createInitialState(1);
    resolveEpoch(s);
    expect(s.winner).toBeNull();
    expect(s.epoch).toBe(2);
    expect(s.phase).toBe('transition');
  });
});

// ── Post-resolution ───────────────────────────────────────────────────────────

describe('Post-resolution', () => {
  it('TE regenerates by 1 each epoch (capped at 10)', () => {
    const s = createInitialState(1);
    s.players.player.resources.te = 9;
    resolveEpoch(s);
    expect(s.players.player.resources.te).toBe(10);
  });

  it('TE does not exceed the cap of 10', () => {
    const s = createInitialState(1);
    s.players.player.resources.te = 10;
    resolveEpoch(s);
    expect(s.players.player.resources.te).toBe(10);
  });

  it('commands are cleared after epoch resolution', () => {
    const s = createInitialState(1);
    const drone = [...s.units.values()].find(u => u.owner === 'player')!;
    queueCommand(s, 'player', 0, { type: 'defend', unitId: drone.id });
    resolveEpoch(s);
    expect(s.players.player.commands.every(c => c === null)).toBe(true);
  });
});
