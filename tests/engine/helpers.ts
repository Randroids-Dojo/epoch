import { GameState } from '@/engine/state';
import { PlayerId } from '@/engine/player';

export function queueCommand(
  state: GameState,
  owner: PlayerId,
  slot: number,
  cmd: NonNullable<GameState['players']['player']['commands'][number]>,
): void {
  state.players[owner].commands[slot] = cmd;
}
