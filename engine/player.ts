/** The two participants in a match. */
export type PlayerId = 'player' | 'ai';

export const PLAYER_IDS: readonly PlayerId[] = ['player', 'ai'];

export function opponent(id: PlayerId): PlayerId {
  return id === 'player' ? 'ai' : 'player';
}
