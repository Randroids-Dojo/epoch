import { Hex } from './hex';
import { UnitType } from './units';
import { StructureType } from './structures';

// ── Individual command shapes (GDD §3.1 & §5.2) ──────────────────────────────

/** Assign a Drone to harvest from a Crystal Extractor. */
export interface GatherCommand {
  readonly type: 'gather';
  readonly unitId: string;
  readonly targetHex: Hex; // hex of the Crystal Extractor
}

/** Begin constructing a structure on an empty hex. */
export interface BuildCommand {
  readonly type: 'build';
  readonly targetHex: Hex;
  readonly structureType: StructureType;
}

/** Produce a unit at a Barracks. */
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

/** Activate a temporal ability (Echo or Chrono Shift). */
export interface TemporalCommand {
  readonly type: 'temporal';
  readonly ability: 'echo';
  /** Cost deducted from TE at resolution time. */
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
 * and show a ghost overlay of the predicted outcome. After viewing, you may
 * revise other commands before confirming lock-in.
 * Requires Tech Tier 2. One use per match. Cost: TIMELINE_FORK_COST TE.
 */
export interface TimelineForkCommand {
  readonly type: 'timeline_fork';
}

/**
 * Chrono Scout — reveal predicted enemy unit positions for the next epoch
 * as probability cloud markers (~75% accuracy; positions may be off by 1 hex).
 * Requires Chrono Spire structure. Cost: CHRONO_SCOUT_COST TE.
 */
export interface ChronoScoutCommand {
  readonly type: 'chrono_scout';
}

export type Command =
  | GatherCommand
  | BuildCommand
  | TrainCommand
  | MoveCommand
  | AttackCommand
  | DefendCommand
  | TemporalCommand
  | ChronoShiftCommand
  | EpochAnchorCommand
  | ResearchCommand
  | TimelineForkCommand
  | ChronoScoutCommand;

export type CommandType = Command['type'];

/** A player's command queue for one epoch. Null entries are empty slots. */
export type CommandQueue = Array<Command | null>;

export const MAX_COMMAND_SLOTS = 5;
