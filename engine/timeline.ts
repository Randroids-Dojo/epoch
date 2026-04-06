/**
 * Timeline — Shared building blocks for epoch recording and replay.
 *
 * Both Timeline Rivals (async ghost PvP) and Timeline Branching (mid-game
 * rewind/fork) delegate to these primitives. Neither feature reimplements
 * command capture — they compose EpochRecord and EpochEntry into their own
 * data structures.
 */

import { UnitCommand, GlobalCommand } from './commands';
import { GameState, PlayerState } from './state';
import { PlayerId } from './player';

// ── Types ────────────────────────────────────────────────────────────────────

/** One player's commands for a single epoch. */
export interface EpochRecord {
  /** Unit orders: [unitId, command] pairs. */
  unitOrders: Array<[string, UnitCommand]>;
  /** Global command slots (train/research/temporal). */
  globalCommands: Array<GlobalCommand | null>;
}

/** Both players' commands for a single epoch — the shared "what happened" unit. */
export interface EpochEntry {
  epoch: number;
  player: EpochRecord;
  ai: EpochRecord;
}

// ── Recording ────────────────────────────────────────────────────────────────

/** Capture one player's commands for the current epoch. Call before resolveEpoch(). */
export function captureCommands(state: GameState, owner: PlayerId): EpochRecord {
  const player: PlayerState = state.players[owner];
  return {
    unitOrders: Array.from(player.unitOrders.entries()),
    globalCommands: [...player.globalCommands],
  };
}

/** Capture both players' commands into a single EpochEntry. */
export function captureEpochEntry(state: GameState): EpochEntry {
  return {
    epoch: state.epoch,
    player: captureCommands(state, 'player'),
    ai: captureCommands(state, 'ai'),
  };
}

// ── Replay ───────────────────────────────────────────────────────────────────

/**
 * Apply recorded commands to a player's state.
 * Silently skips commands for units that no longer exist or belong to another player.
 */
export function replayCommands(state: GameState, owner: PlayerId, record: EpochRecord): void {
  const player = state.players[owner];
  player.unitOrders.clear();

  for (const [unitId, cmd] of record.unitOrders) {
    const unit = state.units.get(unitId);
    if (!unit || unit.owner !== owner) continue;
    player.unitOrders.set(unitId, cmd);
  }

  // Apply global commands, truncating or padding to match current slot count.
  const slots = player.commandSlots;
  player.globalCommands = Array.from({ length: slots }, (_, i) => {
    const cmd = record.globalCommands[i] ?? null;
    return cmd;
  });
}
