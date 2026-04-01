/**
 * Timeline Rivals — Asynchronous Ghost PvP
 *
 * Records a player's commands each epoch, encodes them into a compact string
 * (suitable for a URL query parameter), and replays them as the opponent's
 * commands in a future game on the same seeded map.
 */

import { UnitCommand, GlobalCommand } from './commands';
import { GameState, PlayerState, AIDifficulty } from './state';
import { PlayerId } from './player';

// ── Valid command type values (for untrusted payload validation) ──────────────

const VALID_UNIT_CMD_TYPES = new Set([
  'move', 'attack', 'gather', 'defend', 'build',
  'chrono_shift', 'phase_surge', 'merge',
]);

const VALID_GLOBAL_CMD_TYPES = new Set([
  'train', 'research', 'temporal', 'epoch_anchor',
  'timeline_fork', 'chrono_scout',
]);

const VALID_DIFFICULTIES = new Set<string>([
  'novice', 'adept', 'commander', 'epoch_master',
]);

// ── Types ────────────────────────────────────────────────────────────────────

/** One epoch's worth of commands from a player. */
export interface EpochRecord {
  /** Unit orders: [unitId, command] pairs. */
  unitOrders: Array<[string, UnitCommand]>;
  /** Global command slots (train/research/temporal). */
  globalCommands: Array<GlobalCommand | null>;
}

/** A complete recorded game timeline. */
export interface TimelineRecording {
  /** Schema version for forward-compat. */
  v: 1;
  /** Map seed used for this game. */
  seed: number;
  /** Commands issued each epoch (index 0 = epoch 1). */
  epochs: EpochRecord[];
  /** Display name of the rival. */
  name: string;
  /** AI difficulty used in the original game. */
  difficulty: AIDifficulty;
}

// ── Recording ────────────────────────────────────────────────────────────────

/** Capture the commands a player queued this epoch. Call before resolveEpoch(). */
export function recordEpoch(state: GameState, owner: PlayerId): EpochRecord {
  const player: PlayerState = state.players[owner];
  return {
    unitOrders: Array.from(player.unitOrders.entries()),
    globalCommands: [...player.globalCommands],
  };
}

// ── Replay ───────────────────────────────────────────────────────────────────

/**
 * Apply a recorded epoch's commands to the AI player state.
 * Silently skips commands for units that no longer exist (divergence).
 */
export function replayEpochCommands(state: GameState, record: EpochRecord): void {
  const ai = state.players.ai;
  ai.unitOrders.clear();

  for (const [unitId, cmd] of record.unitOrders) {
    // Skip commands for units that don't exist or aren't owned by AI
    const unit = state.units.get(unitId);
    if (!unit || unit.owner !== 'ai') continue;
    ai.unitOrders.set(unitId, cmd);
  }

  // Apply global commands, truncating or padding to match current slot count.
  const slots = ai.commandSlots;
  ai.globalCommands = Array.from({ length: slots }, (_, i) => {
    const cmd = record.globalCommands[i] ?? null;
    return cmd;
  });
}

// ── Encoding / Decoding ──────────────────────────────────────────────────────

/** Encode a timeline recording to a compact URL-safe string. */
export async function encodeTimeline(recording: TimelineRecording): Promise<string> {
  const json = JSON.stringify(recording);
  const bytes = new TextEncoder().encode(json);

  // Try deflate compression if available
  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('deflate');
      const writer = cs.writable.getWriter();
      const reader = cs.readable.getReader();

      const chunks: Uint8Array[] = [];
      const readAll = (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      })();

      void writer.write(Uint8Array.from(bytes));
      void writer.close();
      await readAll;

      const totalLen = chunks.reduce((s, c) => s + c.length, 0);
      const compressed = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        compressed.set(c, offset);
        offset += c.length;
      }

      return 'z' + uint8ToBase64Url(compressed);
    } catch {
      // Fall through to uncompressed
    }
  }

  // Fallback: uncompressed base64url
  return 'r' + uint8ToBase64Url(bytes);
}

/** Decode a timeline string back to a TimelineRecording. Returns null on failure. */
export async function decodeTimeline(encoded: string): Promise<TimelineRecording | null> {
  if (encoded.length < 2) return null;

  try {
    const prefix = encoded[0];
    const payload = base64UrlToUint8(encoded.slice(1));

    let json: string;

    if (prefix === 'z' && typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      const reader = ds.readable.getReader();

      const chunks: Uint8Array[] = [];
      const readAll = (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      })();

      void writer.write(Uint8Array.from(payload));
      void writer.close();
      await readAll;

      const totalLen = chunks.reduce((s, c) => s + c.length, 0);
      const decompressed = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        decompressed.set(c, offset);
        offset += c.length;
      }
      json = new TextDecoder().decode(decompressed);
    } else if (prefix === 'r') {
      json = new TextDecoder().decode(payload);
    } else {
      return null;
    }

    const parsed = JSON.parse(json);
    if (!validateTimelineShape(parsed)) return null;
    return parsed as TimelineRecording;
  } catch {
    return null;
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

/** Validate the top-level shape and command structure of an untrusted payload. */
function validateTimelineShape(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const rec = obj as Record<string, unknown>;

  if (rec.v !== 1) return false;
  if (typeof rec.seed !== 'number') return false;
  if (typeof rec.name !== 'string') return false;
  if (!Array.isArray(rec.epochs)) return false;

  // Validate difficulty (default to 'adept' for legacy recordings without it)
  if (rec.difficulty !== undefined && !VALID_DIFFICULTIES.has(rec.difficulty as string)) {
    return false;
  }

  // Validate each epoch's commands
  for (const epoch of rec.epochs) {
    if (!epoch || typeof epoch !== 'object') return false;
    if (!Array.isArray(epoch.unitOrders)) return false;
    if (!Array.isArray(epoch.globalCommands)) return false;

    for (const entry of epoch.unitOrders) {
      if (!Array.isArray(entry) || entry.length !== 2) return false;
      if (typeof entry[0] !== 'string') return false;
      const cmd = entry[1];
      if (!cmd || typeof cmd !== 'object' || !VALID_UNIT_CMD_TYPES.has(cmd.type)) return false;
    }

    for (const cmd of epoch.globalCommands) {
      if (cmd === null) continue;
      if (typeof cmd !== 'object' || !VALID_GLOBAL_CMD_TYPES.has(cmd.type)) return false;
    }
  }

  // Backfill difficulty for legacy recordings
  if (rec.difficulty === undefined) {
    rec.difficulty = 'adept';
  }

  return true;
}

// ── Base64url helpers ────────────────────────────────────────────────────────

function uint8ToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
