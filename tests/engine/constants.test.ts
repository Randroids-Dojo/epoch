import { describe, it, expect } from 'vitest'
import { COLORS, GAME_CONSTANTS } from '@/lib/constants'
import { createInitialGameState } from '@/lib/types'

describe('COLORS', () => {
  it('has NAVY color defined', () => {
    expect(COLORS.NAVY).toBe('#0a0e1a')
  })

  it('has CYAN color defined', () => {
    expect(COLORS.CYAN).toBe('#00d4ff')
  })
})

describe('GAME_CONSTANTS', () => {
  it('has valid grid dimensions', () => {
    expect(GAME_CONSTANTS.GRID_COLS).toBe(12)
    expect(GAME_CONSTANTS.GRID_ROWS).toBe(8)
  })

  it('has valid epoch turns', () => {
    expect(GAME_CONSTANTS.EPOCH_TURNS).toBe(6)
  })
})

describe('createInitialGameState', () => {
  it('returns planning phase on turn 1 epoch 1', () => {
    const state = createInitialGameState()
    expect(state.phase).toBe('planning')
    expect(state.turn).toBe(1)
    expect(state.epoch).toBe(1)
  })

  it('creates grid matching GAME_CONSTANTS dimensions', () => {
    const state = createInitialGameState()
    expect(state.grid).toHaveLength(GAME_CONSTANTS.GRID_ROWS)
    expect(state.grid[0]).toHaveLength(GAME_CONSTANTS.GRID_COLS)
  })
})
