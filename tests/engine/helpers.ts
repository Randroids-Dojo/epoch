import { GameState, createInitialState, AIDifficulty } from '@/engine/state';
import { PlayerId } from '@/engine/player';
import { Command } from '@/engine/commands';

export function makeState(seed = 42): GameState {
  return createInitialState(seed);
}

export function makeStateWithDifficulty(difficulty: AIDifficulty, seed = 42): GameState {
  return createInitialState(seed, difficulty);
}

export function queueCommand(
  state: GameState,
  owner: PlayerId,
  slot: number,
  cmd: Command,
): void {
  state.players[owner].commands[slot] = cmd;
}
