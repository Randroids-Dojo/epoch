import { Hex } from './hex';
import { UnitType } from './units';
import { StructureType } from './structures';

// ── Individual command shapes (GDD §3.1 & §5.2) ──────────────────────────────

/** Assign a Drone to harvest from a Crystal Extractor or Flux Conduit. */
export interface GatherCommand {
  readonly type: 'gather';
  readonly unitId: string;
  readonly targetHex: Hex;
}

/** Begin constructing a structure on an empty hex. Requires a Drone. */
export interface BuildCommand {
  readonly type: 'build';
  readonly unitId: string; // the Drone performing the build
  readonly targetHex: Hex;
  readonly structureType: StructureType;
}

/** Produce a unit at a Barracks or War Foundry. */
export interface TrainCommand {
  readonly type: 'train';
  readonly structureId: string;
  readonly unitType: UnitType;
}

/** Move a unit toward a target hex. */
export interface MoveCommand {
  readonly type: 'move';
  readonly unitId: string;
  readonly targetHex: Hex;
}

/**
 * Engage an enemy unit or structure on the target hex.
 * Attack resolves from the unit's position after the Move phase.
 */
export interface AttackCommand {
  readonly type: 'attack';
  readonly unitId: string;
  readonly targetHex: Hex;
}

/** Fortify a unit in place (+50% effective HP this epoch). */
export interface DefendCommand {
  readonly type: 'defend';
  readonly unitId: string;
}

export const TEMPORAL_ECHO_COST = 2;
export const CHRONO_SHIFT_COST = 3;
export const EPOCH_ANCHOR_SET_COST = 5;
export const EPOCH_ANCHOR_ACTIVATE_COST = 3;
export const TIMELINE_FORK_COST = 4;
export const CHRONO_SCOUT_COST = 2;
export const PHASE_SURGE_COST = 2;
export const PHASE_SURGE_SPEED_BONUS = 3;

/** Activate a temporal ability (Temporal Echo). */
export interface TemporalCommand {
  readonly type: 'temporal';
  readonly ability: 'echo';
  readonly teCost: number;
}

/**
 * Rewind a selected unit to its position and HP from 2 epochs ago.
 * The unit gains a damage shield (absorbs all damage this epoch) after shifting.
 * Requires Tech Tier 1. Cost is always CHRONO_SHIFT_COST.
 */
export interface ChronoShiftCommand {
  readonly type: 'chrono_shift';
  readonly unitId: string;
}

/**
 * Epoch Anchor — bookmark or restore all friendly unit positions/HP.
 * 'set': Bookmark current state (costs EPOCH_ANCHOR_SET_COST TE). Requires Tech Tier 3.
 * 'activate': Revert all friendly units to anchored state (costs EPOCH_ANCHOR_ACTIVATE_COST TE).
 */
export interface EpochAnchorCommand {
  readonly type: 'epoch_anchor';
  readonly action: 'set' | 'activate';
}

/** Research the next tech tier at a completed Tech Lab. Takes 3 epochs. */
export interface ResearchCommand {
  readonly type: 'research';
}

/**
 * Timeline Fork — simulate the next execution phase with your current commands
 * and show a ghost overlay of the predicted outcome.
 * Requires Tech Tier 2. One use per match. Cost: TIMELINE_FORK_COST TE.
 */
export interface TimelineForkCommand {
  readonly type: 'timeline_fork';
}

/**
 * Chrono Scout — reveal predicted enemy unit positions for the next epoch.
 * Requires Chrono Spire structure. Cost: CHRONO_SCOUT_COST TE.
 */
export interface ChronoScoutCommand {
  readonly type: 'chrono_scout';
}

/**
 * Phase Surge — move a unit at speed + PHASE_SURGE_SPEED_BONUS this epoch.
 * Functions like Move but faster. Cost: PHASE_SURGE_COST TE.
 */
export interface PhaseSurgeCommand {
  readonly type: 'phase_surge';
  readonly unitId: string;
  readonly targetHex: Hex;
}

// ── Command categories ────────────────────────────────────────────────────────

/** Commands tied to a specific unit (one per unit per epoch). */
export type UnitCommand =
  | MoveCommand
  | AttackCommand
  | GatherCommand
  | DefendCommand
  | BuildCommand
  | ChronoShiftCommand
  | PhaseSurgeCommand;

/** Commands not tied to a specific unit (train, research, temporal abilities). */
export type GlobalCommand =
  | TrainCommand
  | ResearchCommand
  | TemporalCommand
  | EpochAnchorCommand
  | TimelineForkCommand
  | ChronoScoutCommand;

export type Command = UnitCommand | GlobalCommand;
export type CommandType = Command['type'];
