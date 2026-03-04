import { GameMap, generateMap } from './map';
import { Hex, hexEqual, hexKey } from './hex';
import { PlayerId, PLAYER_IDS } from './player';
import { Unit, UNIT_DEFS } from './units';
import { Structure, STRUCTURE_DEFS } from './structures';
import { Command, CommandQueue, MAX_COMMAND_SLOTS } from './commands';

export type GamePhase = 'planning' | 'execution' | 'transition' | 'over';

export interface Resources {
  cc: number; // Chrono Crystals
  fx: number; // Flux — harvested via Flux Conduit
  te: number; // Temporal Energy
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

// ── Initial state factory ─────────────────────────────────────────────────────

export function createInitialState(seed?: number): GameState {
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
    });
  }

  const emptyQueue = (): CommandQueue => Array<null>(MAX_COMMAND_SLOTS).fill(null);

  return {
    map,
    phase:  'planning',
    epoch:  1,
    winner: null,
    eventLog: [],
    prevEpochCommands: { player: [], ai: [] },
    units,
    structures,
    players: {
      player: {
        id:                 'player',
        resources:          { cc: 10, fx: 0, te: 3 },
        commandSlots:       MAX_COMMAND_SLOTS,
        commands:           emptyQueue(),
        techTier:           0,
        researchEpochsLeft: 0,
        lockedIn:           false,
      },
      ai: {
        id:                 'ai',
        resources:          { cc: 10, fx: 0, te: 3 },
        commandSlots:       MAX_COMMAND_SLOTS,
        commands:           emptyQueue(),
        techTier:           0,
        researchEpochsLeft: 0,
        lockedIn:           false,
      },
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
