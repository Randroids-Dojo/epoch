import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, resetIdSeq } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
import { queueCommand } from './helpers';

beforeEach(() => resetIdSeq());

describe('Temporal Echo — resolution', () => {
  it('deducts 2 TE on successful activation', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 5;
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });

    resolveEpoch(state);

    // 5 - 2 = 3, then +1 regen, capped at 10 → 4
    expect(state.players.player.resources.te).toBe(4);
  });

  it('logs success when TE is sufficient', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 3;
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });

    const log = resolveEpoch(state);

    expect(log.some((l) => l.includes('Temporal Echo') && l.includes('-2'))).toBe(true);
  });

  it('logs failure and does not deduct TE when insufficient', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 1; // below cost of 2
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });

    const log = resolveEpoch(state);

    // TE should only get the passive regen (+1), not be deducted
    // 1 - 0 (failed) + 1 regen = 2
    expect(state.players.player.resources.te).toBe(2);
    expect(log.some((l) => l.includes('failed') && l.includes('TE'))).toBe(true);
  });

  it('does not deduct TE when player has exactly 0', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 0;
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });

    resolveEpoch(state);

    // 0 + 1 regen = 1 (no deduction)
    expect(state.players.player.resources.te).toBe(1);
  });

  it('TE regenerates +1 each epoch regardless of echo usage', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 3;

    resolveEpoch(state); // no commands queued

    // 3 + 1 regen = 4
    expect(state.players.player.resources.te).toBe(4);
  });

  it('TE is capped at 10', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 10;

    resolveEpoch(state);

    expect(state.players.player.resources.te).toBe(10);
  });

  it('deducts TE for each echo when two are queued in the same epoch', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 10;
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    queueCommand(state, 'player', 1, { type: 'temporal', ability: 'echo', teCost: 2 });

    resolveEpoch(state);

    // 10 - 2 - 2 + 1 regen = 7
    expect(state.players.player.resources.te).toBe(7);
  });

  it('applies early lock-in +1 TE bonus on the same epoch as echo', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 3;
    state.players.player.lockedIn = true;
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });

    resolveEpoch(state);

    // 3 - 2 (cost) + 1 (passive regen) + 1 (lock-in bonus) = 3
    expect(state.players.player.resources.te).toBe(3);
  });
});

describe('Chrono Shift — resolution', () => {
  /** Run N epochs with no commands so unitHistory accumulates. Returns state in planning phase. */
  function runIdleEpochs(n: number) {
    const state = createInitialState(1);
    state.players.player.resources.te = 10;
    for (let i = 0; i < n; i++) {
      state.phase = 'planning';
      resolveEpoch(state);
    }
    state.phase = 'planning';
    return state;
  }

  function getPlayerUnit(state: ReturnType<typeof createInitialState>) {
    for (const u of state.units.values()) {
      if (u.owner === 'player') return u;
    }
    return undefined;
  }

  it('unitHistory is empty before any epoch resolves', () => {
    const state = createInitialState(1);
    expect(state.unitHistory).toHaveLength(0);
  });

  it('unitHistory has 1 entry after 1 epoch', () => {
    const state = runIdleEpochs(1);
    expect(state.unitHistory).toHaveLength(1);
  });

  it('unitHistory has at most 2 entries after many epochs', () => {
    const state = runIdleEpochs(5);
    expect(state.unitHistory).toHaveLength(2);
  });

  it('deducts TE on successful shift', () => {
    const state = runIdleEpochs(2);
    state.players.player.resources.te = 8;
    const unit = getPlayerUnit(state)!;

    queueCommand(state, 'player', 0, {
      type: 'chrono_shift',
      unitId: unit.id,
    });

    resolveEpoch(state);

    // 8 - 3 (cost) + 1 regen = 6
    expect(state.players.player.resources.te).toBe(6);
  });

  it('restores unit to 2-epoch-ago position and HP on success', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 10;

    // Epoch 1: idle, snapshots unit at initial hex.
    resolveEpoch(state);
    state.phase = 'planning';

    const unit = getPlayerUnit(state)!;
    const snapHex = { ...unit.hex };
    const snapHp = unit.hp;

    // Epoch 2: mutate unit state so Chrono Shift has something to revert.
    unit.hex = { q: unit.hex.q + 1, r: unit.hex.r };
    unit.hp = Math.max(1, unit.hp - 5);
    resolveEpoch(state);
    state.phase = 'planning';

    // Epoch 3: queue Chrono Shift — should snap back to epoch-1 position.
    queueCommand(state, 'player', 0, {
      type: 'chrono_shift',
      unitId: unit.id,
    });

    resolveEpoch(state);

    const unitAfter = state.units.get(unit.id);
    expect(unitAfter?.hex).toEqual(snapHex);
    expect(unitAfter?.hp).toBe(snapHp);
  });

  it('fails and does not deduct TE when insufficient', () => {
    const state = runIdleEpochs(2);
    state.players.player.resources.te = 1; // below CHRONO_SHIFT_COST
    const unit = getPlayerUnit(state)!;

    queueCommand(state, 'player', 0, {
      type: 'chrono_shift',
      unitId: unit.id,
    });

    const log = resolveEpoch(state);

    expect(log.some((l) => l.includes('Chrono Shift failed'))).toBe(true);
    // TE: 1 (no deduction) + 1 regen = 2
    expect(state.players.player.resources.te).toBe(2);
  });

  it('fails when unit has no 2-epoch history', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 10;
    const unit = getPlayerUnit(state)!;

    queueCommand(state, 'player', 0, {
      type: 'chrono_shift',
      unitId: unit.id,
    });

    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('Chrono Shift failed'))).toBe(true);
  });

  it('damage shield is cleared at end of epoch (no attack)', () => {
    const state = runIdleEpochs(2);
    state.players.player.resources.te = 10;
    const unit = getPlayerUnit(state)!;

    queueCommand(state, 'player', 0, {
      type: 'chrono_shift',
      unitId: unit.id,
    });

    resolveEpoch(state);

    // Post-resolution clears shield when no attack consumed it.
    const unitAfter = state.units.get(unit.id);
    expect(unitAfter?.damageShield).toBe(false);
  });
});

describe('Temporal Echo — prevEpochCommands', () => {
  it('saves this epoch commands to prevEpochCommands after resolution', () => {
    const state = createInitialState(1);
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    queueCommand(state, 'ai', 0, { type: 'temporal', ability: 'echo', teCost: 2 });

    resolveEpoch(state);

    expect(state.prevEpochCommands.player).toHaveLength(1);
    expect(state.prevEpochCommands.player[0]).toMatchObject({ type: 'temporal' });
    expect(state.prevEpochCommands.ai).toHaveLength(1);
  });

  it('prevEpochCommands starts empty', () => {
    const state = createInitialState(1);
    expect(state.prevEpochCommands.player).toHaveLength(0);
    expect(state.prevEpochCommands.ai).toHaveLength(0);
  });

  it('only non-null commands are saved', () => {
    const state = createInitialState(1);
    // slots 0 and 2 filled, rest null
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    queueCommand(state, 'player', 2, { type: 'temporal', ability: 'echo', teCost: 2 });

    resolveEpoch(state);

    expect(state.prevEpochCommands.player).toHaveLength(2);
  });

  it('replaces prevEpochCommands on subsequent epoch', () => {
    const state = createInitialState(1);
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    resolveEpoch(state);
    // resolveEpoch sets phase to 'transition'; reset to 'planning' to run a second epoch.
    state.phase = 'planning';
    resolveEpoch(state);

    expect(state.prevEpochCommands.player).toHaveLength(0);
  });
});
