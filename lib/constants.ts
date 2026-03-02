export const COLORS = {
  NAVY: '#0a0e1a',
  NAVY_LIGHT: '#111827',
  CYAN: '#00d4ff',
  CYAN_DIM: '#0099bb',
  CORAL: '#ff6b6b',
  GOLD: '#ffd700',
  MAGENTA: '#ff00ff',
  ICE: '#e0f7ff',
  ICE_DIM: '#a8d8ea',
} as const

/** Responsive slot dimensions for the command tray. */
export const SLOT_LAYOUT = {
  DESKTOP: { width: 80, height: 52, gap: 8  },
  MOBILE:  { width: 44, height: 48, gap: 4  },
} as const

export const MOBILE_BREAKPOINT_PX = 480

export const GAME_CONSTANTS = {
  GRID_COLS: 12,
  GRID_ROWS: 8,
  HEX_SIZE: 48,
  EPOCH_TURNS: 6,
  TEMPORAL_ENERGY_MAX: 10,
  TEMPORAL_ENERGY_REGEN: 2,
  PLANNING_PHASE_DURATION_MS: 30_000,
  MAX_PLAYERS: 4,
} as const
