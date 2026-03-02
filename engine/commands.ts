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

/** Activate a temporal ability (MVP: Temporal Echo only). */
export interface TemporalCommand {
  readonly type: 'temporal';
  readonly ability: 'echo';
  /** Cost deducted from TE at resolution time. */
  readonly teCost: number;
}

export type Command =
  | GatherCommand
  | BuildCommand
  | TrainCommand
  | MoveCommand
  | AttackCommand
  | DefendCommand
  | TemporalCommand;

/** A player's command queue for one epoch. Null entries are empty slots. */
export type CommandQueue = Array<Command | null>;

export const MAX_COMMAND_SLOTS = 5;
