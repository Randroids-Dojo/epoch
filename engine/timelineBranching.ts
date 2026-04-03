/**
 * Timeline Branching — Mid-game rewind and fork.
 *
 * Composes shared EpochEntry (from timeline.ts) with full GameState snapshots
 * to enable rewinding to any past epoch and forking into an alternate timeline.
 * All branches are preserved and can be revisited freely.
 *
 * Delegates recording to captureEpochEntry() and deep-copying to deepCopyState().
 */

import { EpochEntry, captureEpochEntry } from './timeline';
import { GameState, newId } from './state';
import { PlayerId } from './player';
import { deepCopyState } from './simulation';

// ── Types ────────────────────────────────────────────────────────────────────

/** Full snapshot: what happened + what the world looked like. */
export interface BranchSnapshot {
  /** Delegates to shared EpochEntry for command recording. */
  entry: EpochEntry;
  /** Deep copy of the game state at the start of this epoch's planning phase. */
  state: GameState;
}

/** A single timeline branch in the branch tree. */
export interface TimelineBranch {
  id: string;
  name: string;
  parentBranchId: string | null;
  /** The epoch number where this branch forked from its parent. */
  branchEpoch: number;
  /** One snapshot per completed epoch in this branch. */
  snapshots: BranchSnapshot[];
  /** The current (tip) state of this branch — live or final. */
  currentState: GameState;
  isComplete: boolean;
  winner: PlayerId | null;
}

/** Lightweight summary for the branch switcher UI. */
export interface BranchSummary {
  id: string;
  name: string;
  /** e.g. "Epochs 1–7" */
  epochRange: string;
  status: 'active' | 'paused' | 'victory' | 'defeat';
  isActive: boolean;
}

/** Manages the full tree of timeline branches. */
export interface BranchManager {
  branches: Map<string, TimelineBranch>;
  activeBranchId: string;
  nextBranchNum: number;
}

// ── Creation ─────────────────────────────────────────────────────────────────

/** Create a BranchManager with one "Original" branch. */
export function createBranchManager(initialState: GameState): BranchManager {
  const id = newId('br');
  const branch: TimelineBranch = {
    id,
    name: 'Original',
    parentBranchId: null,
    branchEpoch: 1,
    snapshots: [],
    currentState: deepCopyState(initialState),
    isComplete: false,
    winner: null,
  };

  const branches = new Map<string, TimelineBranch>();
  branches.set(id, branch);

  return {
    branches,
    activeBranchId: id,
    nextBranchNum: 2,
  };
}

// ── Recording ────────────────────────────────────────────────────────────────

/**
 * Record a snapshot before epoch resolution.
 * Delegates to captureEpochEntry() for command recording and deepCopyState()
 * for state snapshotting.
 */
export function recordBranchSnapshot(mgr: BranchManager, state: GameState): void {
  const branch = mgr.branches.get(mgr.activeBranchId);
  if (!branch) throw new Error(`Active branch ${mgr.activeBranchId} not found`);

  branch.snapshots.push({
    entry: captureEpochEntry(state),
    state: deepCopyState(state),
  });
}

/** Update the active branch's tip state after resolution. */
export function updateBranchTip(mgr: BranchManager, state: GameState): void {
  const branch = mgr.branches.get(mgr.activeBranchId);
  if (!branch) throw new Error(`Active branch ${mgr.activeBranchId} not found`);

  branch.currentState = deepCopyState(state);
}

/** Mark the active branch as complete with the given winner. */
export function finalizeBranch(mgr: BranchManager, winner: PlayerId): void {
  const branch = mgr.branches.get(mgr.activeBranchId);
  if (!branch) throw new Error(`Active branch ${mgr.activeBranchId} not found`);

  branch.isComplete = true;
  branch.winner = winner;
}

// ── Branching ────────────────────────────────────────────────────────────────

/**
 * Fork a new branch from the given epoch index of the active branch.
 * The new branch becomes active. Returns the new branch.
 *
 * @param epochIndex 0-based index into the active branch's snapshots array.
 */
export function forkFromEpoch(mgr: BranchManager, epochIndex: number): TimelineBranch {
  const parent = mgr.branches.get(mgr.activeBranchId);
  if (!parent) throw new Error(`Active branch ${mgr.activeBranchId} not found`);

  const snapshot = parent.snapshots[epochIndex];
  if (!snapshot) throw new Error(`No snapshot at index ${epochIndex}`);

  const id = newId('br');
  const branchNum = mgr.nextBranchNum++;
  const branch: TimelineBranch = {
    id,
    name: `Fork ${branchNum} from Epoch ${snapshot.entry.epoch}`,
    parentBranchId: parent.id,
    branchEpoch: snapshot.entry.epoch,
    // Carry over snapshots up to (but not including) the fork point.
    // Snapshot states were deep-copied at recording time, so sharing references is safe.
    snapshots: parent.snapshots.slice(0, epochIndex),
    currentState: deepCopyState(snapshot.state),
    isComplete: false,
    winner: null,
  };

  mgr.branches.set(id, branch);
  mgr.activeBranchId = id;

  return branch;
}

/**
 * Switch to a different branch. Returns the branch for state restoration.
 */
export function switchBranch(mgr: BranchManager, branchId: string): TimelineBranch {
  const branch = mgr.branches.get(branchId);
  if (!branch) throw new Error(`Branch ${branchId} not found`);

  mgr.activeBranchId = branchId;
  return branch;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** Get the currently active branch. */
export function getActiveBranch(mgr: BranchManager): TimelineBranch {
  const branch = mgr.branches.get(mgr.activeBranchId);
  if (!branch) throw new Error(`Active branch ${mgr.activeBranchId} not found`);
  return branch;
}

/** Get lightweight summaries of all branches for the UI. */
export function getBranchSummaries(mgr: BranchManager): BranchSummary[] {
  const summaries: BranchSummary[] = [];

  for (const [id, branch] of mgr.branches) {
    const firstEpoch = branch.branchEpoch;
    const tipEpoch = branch.currentState.epoch;

    let status: BranchSummary['status'];
    if (branch.isComplete) {
      status = branch.winner === 'player' ? 'victory' : 'defeat';
    } else if (id === mgr.activeBranchId) {
      status = 'active';
    } else {
      status = 'paused';
    }

    summaries.push({
      id,
      name: branch.name,
      epochRange: tipEpoch > firstEpoch
        ? `Epochs ${firstEpoch}–${tipEpoch}`
        : `Epoch ${tipEpoch}`,
      status,
      isActive: id === mgr.activeBranchId,
    });
  }

  return summaries;
}
