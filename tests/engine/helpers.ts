import { GameState, createInitialState, AIDifficulty } from '@/engine/state';
import { PlayerId } from '@/engine/player';
import { Command, UnitCommand, GlobalCommand } from '@/engine/commands';

export function makeState(seed = 42): GameState {
  return createInitialState(seed);
}

export function makeStateWithDifficulty(difficulty: AIDifficulty, seed = 42): GameState {
  return createInitialState(seed, difficulty);
}

/** Returns true if the command is a unit-level order (has a unitId). */
function isUnitCommand(cmd: Command): cmd is UnitCommand {
  return (
    cmd.type === 'move' || cmd.type === 'attack' || cmd.type === 'gather' ||
    cmd.type === 'defend' || cmd.type === 'build' || cmd.type === 'chrono_shift'
  );
}

/**
 * Queue a command for a player.
 * - Unit commands (move, attack, gather, defend, build, chrono_shift) go into unitOrders.
 * - Global commands (train, research, temporal, etc.) go into globalCommands[slot].
 *
 * For unit commands, `slot` is ignored (the unitId is the key).
 * Tests may need to ensure globalCommands has enough slots before calling this.
 */
export function queueCommand(
  state: GameState,
  owner: PlayerId,
  slot: number,
  cmd: Command,
): void {
  if (isUnitCommand(cmd)) {
    state.players[owner].unitOrders.set(cmd.unitId, cmd);
  } else {
    // Expand globalCommands if needed (for tests that push many global commands).
    while (state.players[owner].globalCommands.length <= slot) {
      state.players[owner].globalCommands.push(null);
    }
    state.players[owner].globalCommands[slot] = cmd as GlobalCommand;
  }
}

/** Directly assign a unit order (convenience wrapper). */
export function queueUnitOrder(state: GameState, owner: PlayerId, cmd: UnitCommand): void {
  state.players[owner].unitOrders.set(cmd.unitId, cmd);
}

/** Directly assign a global command to a slot (convenience wrapper). */
export function queueGlobalCommand(
  state: GameState,
  owner: PlayerId,
  slot: number,
  cmd: GlobalCommand,
): void {
  while (state.players[owner].globalCommands.length <= slot) {
    state.players[owner].globalCommands.push(null);
  }
  state.players[owner].globalCommands[slot] = cmd;
}
