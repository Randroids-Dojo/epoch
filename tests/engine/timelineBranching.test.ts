import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBranchManager,
  recordBranchSnapshot,
  updateBranchTip,
  finalizeBranch,
  forkFromEpoch,
  switchBranch,
  getActiveBranch,
  getBranchSummaries,
  BranchManager,
} from '@/engine/timelineBranching';
import { makeState } from './helpers';
import { GameState } from '@/engine/state';
import { MoveCommand } from '@/engine/commands';

describe('createBranchManager', () => {
  it('creates a manager with one "Original" branch', () => {
    const state = makeState(42);
    const mgr = createBranchManager(state);

    expect(mgr.branches.size).toBe(1);
    const branch = getActiveBranch(mgr);
    expect(branch.name).toBe('Original');
    expect(branch.parentBranchId).toBeNull();
    expect(branch.branchEpoch).toBe(1);
    expect(branch.snapshots).toHaveLength(0);
    expect(branch.isComplete).toBe(false);
    expect(branch.winner).toBeNull();
  });

  it('deep-copies the initial state (mutating original does not affect branch)', () => {
    const state = makeState(42);
    const mgr = createBranchManager(state);

    // Mutate the original state
    state.epoch = 999;

    const branch = getActiveBranch(mgr);
    expect(branch.currentState.epoch).toBe(1);
  });
});

describe('recordBranchSnapshot', () => {
  let state: GameState;
  let mgr: BranchManager;
  let playerDroneId: string;

  beforeEach(() => {
    state = makeState(42);
    mgr = createBranchManager(state);
    for (const [id, unit] of state.units) {
      if (unit.owner === 'player' && unit.type === 'drone') playerDroneId = id;
    }
  });

  it('adds a snapshot to the active branch', () => {
    recordBranchSnapshot(mgr, state);

    const branch = getActiveBranch(mgr);
    expect(branch.snapshots).toHaveLength(1);
    expect(branch.snapshots[0].entry.epoch).toBe(state.epoch);
  });

  it('stores an independent deep copy (mutating original does not affect snapshot)', () => {
    recordBranchSnapshot(mgr, state);

    // Mutate the original state
    for (const u of state.units.values()) {
      u.hex = { q: 99, r: 99 };
      break;
    }

    const branch = getActiveBranch(mgr);
    for (const u of branch.snapshots[0].state.units.values()) {
      expect(u.hex.q).not.toBe(99);
    }
  });

  it('captures player and AI commands via delegation to captureEpochEntry', () => {
    const moveCmd: MoveCommand = { type: 'move', unitId: playerDroneId, targetHex: { q: 3, r: 0 } };
    state.players.player.unitOrders.set(playerDroneId, moveCmd);

    recordBranchSnapshot(mgr, state);

    const branch = getActiveBranch(mgr);
    expect(branch.snapshots[0].entry.player.unitOrders).toHaveLength(1);
    expect(branch.snapshots[0].entry.player.unitOrders[0][1]).toEqual(moveCmd);
  });

  it('accumulates multiple snapshots', () => {
    recordBranchSnapshot(mgr, state);
    state.epoch = 2;
    recordBranchSnapshot(mgr, state);
    state.epoch = 3;
    recordBranchSnapshot(mgr, state);

    const branch = getActiveBranch(mgr);
    expect(branch.snapshots).toHaveLength(3);
    expect(branch.snapshots[0].entry.epoch).toBe(1);
    expect(branch.snapshots[1].entry.epoch).toBe(2);
    expect(branch.snapshots[2].entry.epoch).toBe(3);
  });
});

describe('updateBranchTip', () => {
  it('updates the current state of the active branch', () => {
    const state = makeState(42);
    const mgr = createBranchManager(state);

    state.epoch = 5;
    updateBranchTip(mgr, state);

    const branch = getActiveBranch(mgr);
    expect(branch.currentState.epoch).toBe(5);
  });

  it('deep-copies state (mutating after update does not affect branch)', () => {
    const state = makeState(42);
    const mgr = createBranchManager(state);

    updateBranchTip(mgr, state);
    state.epoch = 999;

    const branch = getActiveBranch(mgr);
    expect(branch.currentState.epoch).toBe(1);
  });
});

describe('finalizeBranch', () => {
  it('marks the active branch as complete with the winner', () => {
    const state = makeState(42);
    const mgr = createBranchManager(state);

    finalizeBranch(mgr, 'player');

    const branch = getActiveBranch(mgr);
    expect(branch.isComplete).toBe(true);
    expect(branch.winner).toBe('player');
  });
});

describe('forkFromEpoch', () => {
  let state: GameState;
  let mgr: BranchManager;

  beforeEach(() => {
    state = makeState(42);
    mgr = createBranchManager(state);

    // Record 3 epochs
    recordBranchSnapshot(mgr, state);
    state.epoch = 2;
    recordBranchSnapshot(mgr, state);
    state.epoch = 3;
    recordBranchSnapshot(mgr, state);
    updateBranchTip(mgr, state);
  });

  it('creates a new branch from the given epoch index', () => {
    const originalId = mgr.activeBranchId;
    const newBranch = forkFromEpoch(mgr, 1); // fork from epoch 2 snapshot

    expect(newBranch.name).toBe('Fork 2 from Epoch 2');
    expect(newBranch.parentBranchId).toBe(originalId);
    expect(newBranch.branchEpoch).toBe(2);
    expect(newBranch.isComplete).toBe(false);
    expect(mgr.activeBranchId).toBe(newBranch.id);
  });

  it('preserves the original branch snapshots', () => {
    const originalId = mgr.activeBranchId;
    forkFromEpoch(mgr, 1);

    const original = mgr.branches.get(originalId)!;
    expect(original.snapshots).toHaveLength(3);
  });

  it('new branch has snapshots up to (not including) fork point', () => {
    const newBranch = forkFromEpoch(mgr, 1);
    // Fork at index 1 → only snapshot at index 0 is copied
    expect(newBranch.snapshots).toHaveLength(1);
    expect(newBranch.snapshots[0].entry.epoch).toBe(1);
  });

  it('new branch currentState is a deep copy of the fork snapshot', () => {
    const newBranch = forkFromEpoch(mgr, 1);

    // Mutate the fork's current state
    newBranch.currentState.epoch = 999;

    // Original snapshot should be unaffected
    const original = mgr.branches.get(newBranch.parentBranchId!)!;
    expect(original.snapshots[1].state.epoch).toBe(2);
  });

  it('sets the new branch as active', () => {
    const newBranch = forkFromEpoch(mgr, 1);
    expect(mgr.activeBranchId).toBe(newBranch.id);
  });

  it('throws for invalid epoch index', () => {
    expect(() => forkFromEpoch(mgr, 99)).toThrow();
  });

  it('creates independent branches when forking same epoch twice', () => {
    const originalId = mgr.activeBranchId;

    // Fork once from epoch 2
    const branch1 = forkFromEpoch(mgr, 1);

    // Switch back to original and fork again
    switchBranch(mgr, originalId);
    const branch2 = forkFromEpoch(mgr, 1);

    expect(branch1.id).not.toBe(branch2.id);
    expect(mgr.branches.size).toBe(3);
  });
});

describe('switchBranch', () => {
  it('changes the active branch', () => {
    const state = makeState(42);
    const mgr = createBranchManager(state);
    recordBranchSnapshot(mgr, state);

    const originalId = mgr.activeBranchId;
    forkFromEpoch(mgr, 0);

    expect(mgr.activeBranchId).not.toBe(originalId);

    const returned = switchBranch(mgr, originalId);
    expect(mgr.activeBranchId).toBe(originalId);
    expect(returned.id).toBe(originalId);
  });

  it('throws for unknown branch', () => {
    const state = makeState(42);
    const mgr = createBranchManager(state);
    expect(() => switchBranch(mgr, 'nonexistent')).toThrow();
  });
});

describe('fork-from-fork (nested branching)', () => {
  it('allows forking from a forked branch', () => {
    const state = makeState(42);
    const mgr = createBranchManager(state);

    // Build 2 epochs on original
    recordBranchSnapshot(mgr, state);
    state.epoch = 2;
    recordBranchSnapshot(mgr, state);
    updateBranchTip(mgr, state);

    // Fork from epoch 1
    const fork1 = forkFromEpoch(mgr, 0);
    expect(fork1.parentBranchId).not.toBeNull();

    // Build 1 epoch on fork
    state.epoch = 2;
    recordBranchSnapshot(mgr, state);
    updateBranchTip(mgr, state);

    // Fork the fork
    const fork2 = forkFromEpoch(mgr, 0);
    expect(fork2.parentBranchId).toBe(fork1.id);
    expect(mgr.branches.size).toBe(3);
  });
});

describe('getBranchSummaries', () => {
  it('returns summaries for all branches', () => {
    const state = makeState(42);
    const mgr = createBranchManager(state);
    recordBranchSnapshot(mgr, state);
    state.epoch = 2;
    recordBranchSnapshot(mgr, state);
    updateBranchTip(mgr, state);

    const originalId = mgr.activeBranchId;
    forkFromEpoch(mgr, 0);

    const summaries = getBranchSummaries(mgr);
    expect(summaries).toHaveLength(2);

    const original = summaries.find(s => s.id === originalId)!;
    expect(original.name).toBe('Original');
    expect(original.status).toBe('playing');
    expect(original.isActive).toBe(false);

    const fork = summaries.find(s => s.id !== originalId)!;
    expect(fork.name).toContain('Fork');
    expect(fork.isActive).toBe(true);
  });

  it('shows victory status for completed branches', () => {
    const state = makeState(42);
    const mgr = createBranchManager(state);

    finalizeBranch(mgr, 'player');

    const summaries = getBranchSummaries(mgr);
    expect(summaries[0].status).toBe('victory');
  });

  it('shows defeat status for AI-won branches', () => {
    const state = makeState(42);
    const mgr = createBranchManager(state);

    finalizeBranch(mgr, 'ai');

    const summaries = getBranchSummaries(mgr);
    expect(summaries[0].status).toBe('defeat');
  });
});
