import { GameState } from '@/engine/state';
import { PlayerId } from '@/engine/player';
import { Command } from '@/engine/commands';

export function queueCommand(
  state: GameState,
  owner: PlayerId,
  slot: number,
  cmd: Command,
): void {
  state.players[owner].commands[slot] = cmd;
}
