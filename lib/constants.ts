export const COLORS = {
  // ── Obsidian & Crimson palette ──────────────────────────────────────────
  NAVY: '#0b0a0f',         // deep obsidian black
  NAVY_LIGHT: '#151319',   // slightly lighter obsidian
  CYAN: '#e63946',         // player crimson red
  CYAN_DIM: '#a8232e',     // dimmed crimson
  CORAL: '#ff6b6b',        // AI coral (enemy units)
  GOLD: '#ffd700',
  MAGENTA: '#ff00ff',
  ICE: '#ffe0e0',          // light blush (was ice blue)
  ICE_DIM: '#d4a0a0',      // dim blush
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
