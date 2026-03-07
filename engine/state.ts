import { GameMap, generateMap } from './map';
import { Hex, hexEqual, hexKey } from './hex';
import { PlayerId, PLAYER_IDS } from './player';
import { Unit, UNIT_DEFS } from './units';
import { Structure, STRUCTURE_DEFS } from './structures';
import { Command, CommandQueue, MAX_COMMAND_SLOTS } from './commands';

// ── AI Configuration Types ────────────────────────────────────────────────────

export type AIDifficulty = 'novice' | 'adept' | 'commander' | 'epoch_master';
export type AIArchetype = 'expander' | 'aggressor' | 'technologist' | 'fortress';

/** Per-epoch count of player commands by category, for AI adaptation. */
export interface CommandCategoryCount {
  gather: number;
  build: number;
  train: number;
  move: number;
  attack: number;
  temporal: number;
}

export interface AIConfig {
  difficulty: AIDifficulty;
  /** Archetype blend weights (values sum to ~1.0). */
  archetypeBlend: Record<AIArchetype, number>;
  /** Player command category distribution, last 5 epochs (oldest first). */
  playerCommandHistory: CommandCategoryCount[];
}

/** Snapshot of a unit's hex and hp at the end of an epoch (for Chrono Shift). */
export interface ChronoSnapshot {
  hex: Hex;
  hp: number;
}

export type GamePhase = 'planning' | 'execution' | 'transition' | 'over';

export interface Resources {
  cc: number; // Chrono Crystals
  fx: number; // Flux — harvested via Flux Conduit
  te: number; // Temporal Energy
}

/** Snapshot of all a player's units for the Epoch Anchor ability. */
export interface AnchorSnapshot {
  unitSnapshots: Map<string, ChronoSnapshot>;
  /** Remaining epochs before the anchor expires; decremented each epoch, deleted at 0. */
  epochsLeft: number;
}

export interface PlayerState {
  readonly id: PlayerId;
  resources: Resources;
  commandSlots: number;
  commands: CommandQueue;
  /** Current tech tier (0–3). Increases when research completes. */
  techTier: number;
  /** Epochs of research remaining. 0 = not researching. */
  researchEpochsLeft: number;
  /** Whether the player locked in early this epoch (earns +1 TE). */
  lockedIn: boolean;
  /**
   * Rolling count of temporal abilities used in the last 3 epochs.
   * Index 0 = 2 epochs ago, index 1 = 1 epoch ago, index 2 = current epoch.
   */
  temporalEpochCounts: number[];
  /** Temporal Instability tier (0 = none, 1 = minor, 2 = severe). */
  instabilityTier: 0 | 1 | 2;
  /** Epochs remaining for temporal instability debuff. */
  instabilityEpochsLeft: number;
  /** Epoch Anchor bookmark, or null if none is set. */
  epochAnchor: AnchorSnapshot | null;
  /** True once the player has used Timeline Fork this match (one use per match). */
  timelineForkUsed: boolean;
}

export interface GameState {
  readonly map: GameMap;
  phase: GamePhase;
  epoch: number;
  players: Record<PlayerId, PlayerState>;
  units: Map<string, Unit>;
  structures: Map<string, Structure>;
  winner: PlayerId | null;
  /** Human-readable log lines from the last epoch resolution. */
  eventLog: string[];
  /** Commands each player queued in the previous epoch (for Temporal Echo). */
  prevEpochCommands: Record<PlayerId, Command[]>;
  /**
   * Rolling 2-epoch history of unit snapshots for Chrono Shift.
   * Index 0 = oldest (2 epochs ago), index 1 = most recent (1 epoch ago).
   * Empty until the second completed epoch.
   */
  unitHistory: Array<Map<string, ChronoSnapshot>>;
  /**
   * Resource Dominance win condition tracking.
   * Number of consecutive epochs each player has controlled ALL crystal_node hexes.
   */
  crystalNodeStreak: Record<PlayerId, number>;
  /** AI difficulty, archetype blend, and player command history for adaptation. */
  aiConfig: AIConfig;
}

// ── Chrono Shift helpers ──────────────────────────────────────────────────────

/** Returns the 2-epochs-ago snapshot map used by Chrono Shift, or undefined if unavailable. */
export function getOldestSnapshot(state: GameState): Map<string, ChronoSnapshot> | undefined {
  return state.unitHistory[0];
}

// ── ID generator ─────────────────────────────────────────────────────────────

let _idSeq = 1;

export function newId(prefix = 'e'): string {
  return `${prefix}${_idSeq++}`;
}

/** Reset the ID counter — for use in tests only. */
export function resetIdSeq(): void {
  _idSeq = 1;
}

// ── AI config factory ──────────────────────────────────────────────────────────

/** Initial archetype blends by difficulty. */
const INITIAL_BLENDS: Record<AIDifficulty, Record<AIArchetype, number>> = {
  novice:       { expander: 1.00, aggressor: 0.00, technologist: 0.00, fortress: 0.00 },
  adept:        { expander: 1.00, aggressor: 0.00, technologist: 0.00, fortress: 0.00 },
  commander:    { expander: 0.40, aggressor: 0.30, technologist: 0.15, fortress: 0.15 },
  epoch_master: { expander: 0.25, aggressor: 0.25, technologist: 0.25, fortress: 0.25 },
};

function createAIConfig(difficulty: AIDifficulty): AIConfig {
  return {
    difficulty,
    archetypeBlend: { ...INITIAL_BLENDS[difficulty] },
    playerCommandHistory: [],
  };
}

/** Command slots per difficulty level. */
export const DIFFICULTY_SLOTS: Record<AIDifficulty, number> = {
  novice:       4,
  adept:        5,
  commander:    5,
  epoch_master: 6,
};

// ── Initial state factory ─────────────────────────────────────────────────────

export function createInitialState(seed?: number, difficulty: AIDifficulty = 'adept'): GameState {
  const map = generateMap(seed);

  const structures = new Map<string, Structure>();
  const units      = new Map<string, Unit>();

  // ── Starting structures: Command Nexus for each player ────────────────────
  for (const pid of PLAYER_IDS) {
    const startHex = pid === 'player' ? map.playerStart : map.aiStart;
    const nexusDef = STRUCTURE_DEFS.command_nexus;
    const id = newId('s');
    structures.set(id, {
      id,
      owner: pid,
      type:  'command_nexus',
      hex:   startHex,
      hp:    nexusDef.maxHp,
      buildProgress:   0,
      assignedDroneId: null,
    });
  }

  // ── Starting units: 1 Drone per player, 1 hex east of their Nexus ────────
  for (const pid of PLAYER_IDS) {
    const startHex = pid === 'player' ? map.playerStart : map.aiStart;
    const droneHex = { q: startHex.q + 1, r: startHex.r };
    const droneDef = UNIT_DEFS.drone;
    const id = newId('u');
    units.set(id, {
      id,
      owner:               pid,
      type:                'drone',
      hex:                 map.cells.has(hexKey(droneHex)) ? droneHex : startHex,
      hp:                  droneDef.maxHp,
      isDefending:         false,
      assignedExtractorId: null,
      damageShield:        false,
    });
  }

  const playerSlots = MAX_COMMAND_SLOTS;
  const aiSlots = DIFFICULTY_SLOTS[difficulty];

  const makePlayer = (id: PlayerId): PlayerState => {
    const slots = id === 'ai' ? aiSlots : playerSlots;
    return {
    id,
    resources:            { cc: 10, fx: 0, te: 3 },
    commandSlots:         slots,
    commands:             Array<null>(slots).fill(null),
    techTier:             0,
    researchEpochsLeft:   0,
    lockedIn:             false,
    temporalEpochCounts:  [],
    instabilityTier:      0,
    instabilityEpochsLeft: 0,
    epochAnchor:          null,
    timelineForkUsed:     false,
  };
  };

  return {
    map,
    phase:  'planning',
    epoch:  1,
    winner: null,
    eventLog: [],
    prevEpochCommands:  { player: [], ai: [] },
    unitHistory:        [],
    crystalNodeStreak:  { player: 0, ai: 0 },
    aiConfig:           createAIConfig(difficulty),
    units,
    structures,
    players: {
      player: makePlayer('player'),
      ai:     makePlayer('ai'),
    },
  };
}

// ── State queries ─────────────────────────────────────────────────────────────

/** Returns the Command Nexus for the given player, or undefined if destroyed. */
export function findNexus(state: GameState, owner: PlayerId): Structure | undefined {
  for (const s of state.structures.values()) {
    if (s.owner === owner && s.type === 'command_nexus') return s;
  }
  return undefined;
}

/** Returns the first unit of the given owner at the given hex, if any. */
export function findUnitAt(
  state: GameState,
  hex: Hex,
  owner?: PlayerId,
): Unit | undefined {
  for (const u of state.units.values()) {
    if (hexEqual(u.hex, hex)) {
      if (owner === undefined || u.owner === owner) return u;
    }
  }
  return undefined;
}

/** Returns the first structure of the given owner at the given hex, if any. */
export function findStructureAt(
  state: GameState,
  hex: Hex,
  owner?: PlayerId,
): Structure | undefined {
  for (const s of state.structures.values()) {
    if (hexEqual(s.hex, hex)) {
      if (owner === undefined || s.owner === owner) return s;
    }
  }
  return undefined;
}
