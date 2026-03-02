import { GAME_CONSTANTS } from './constants'

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
