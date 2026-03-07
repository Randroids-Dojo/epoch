import { GAME_CONSTANTS } from './constants'
import type { TargetingCommandType } from '../engine/targeting'
import type { StructureType } from '../engine/structures'

// ── Interaction Mode (Planning Phase UI) ──────────────────────────────────────

export type InteractionMode =
  | { kind: 'idle' }

  /** Unit command picker is open for this unit (from panel card or canvas click). */
  | { kind: 'unit_picker_open'; unitId: string }

  /** Global command picker is open for this slot in the tray. */
  | { kind: 'global_picker_open'; slotIndex: number }

  | {
      kind: 'targeting';
      unitId: string;
      commandType: TargetingCommandType;
      eligibleKeys: Set<string>;
    }

  /** Drone selected; waiting for player to choose which structure to build. */
  | { kind: 'build_select'; unitId: string }

  | {
      kind: 'build_targeting';
      unitId: string;
      structureType: Exclude<StructureType, 'command_nexus'>;
      eligibleKeys: Set<string>;
    }

  | {
      kind: 'train_picker';
      slotIndex: number;
      structureId: string;
      structureHex: { q: number; r: number };
      failureFeedback: string | null;
    }


export type Phase = 'planning' | 'temporal' | 'execution'

export interface PlayerResources {
  temporalEnergy: number
  gold: number
  actions: number
}

export interface PlayerState {
  id: string
  name: string
  resources: PlayerResources
  units: unknown[]
  territory: unknown[]
}

export interface GameState {
  phase: Phase
  turn: number
  epoch: number
  players: PlayerState[]
  activePlayerId: string | null
  grid: unknown[][]
  history: unknown[]
}

export function createInitialGameState(): GameState {
  return {
    phase: 'planning',
    turn: 1,
    epoch: 1,
    players: [],
    activePlayerId: null,
    grid: Array.from({ length: GAME_CONSTANTS.GRID_ROWS }, () =>
      Array.from({ length: GAME_CONSTANTS.GRID_COLS }, () => null)
    ),
    history: [],
  }
}
