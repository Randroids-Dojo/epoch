import { GAME_CONSTANTS } from './constants'
import type { TargetingCommandType } from '../engine/targeting'
import type { StructureType } from '../engine/structures'

// ── Interaction Mode (Planning Phase UI) ──────────────────────────────────────

export type InteractionMode =
  | { kind: 'idle' }
  | { kind: 'slot_selected'; slotIndex: number }
  | { kind: 'picker_open'; slotIndex: number }
  | {
      kind: 'targeting';
      slotIndex: number;
      commandType: TargetingCommandType;
      eligibleKeys: Set<string>;
      subjectUnitId: string;
    }
  | {
      kind: 'build_select'
      slotIndex: number
    }
  | {
      kind: 'build_targeting'
      slotIndex: number
      structureType: Exclude<StructureType, 'command_nexus'>
      eligibleKeys: Set<string>
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
