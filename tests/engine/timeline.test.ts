import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordEpoch,
  replayEpochCommands,
  encodeTimeline,
  decodeTimeline,
  TimelineRecording,
  EpochRecord,
} from '@/engine/timeline';
import { makeState } from './helpers';
import { GameState } from '@/engine/state';
import { MoveCommand, TrainCommand, DefendCommand } from '@/engine/commands';

/** Encode a raw object as an uncompressed timeline string (for testing validation). */
function encodeRaw(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'r' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('timeline recording', () => {
  let state: GameState;
  let playerDroneId: string;
  let aiDroneId: string;

  beforeEach(() => {
    state = makeState(42);
    // Find player and AI drones
    for (const [id, unit] of state.units) {
      if (unit.owner === 'player' && unit.type === 'drone') playerDroneId = id;
      if (unit.owner === 'ai' && unit.type === 'drone') aiDroneId = id;
    }
  });

  describe('recordEpoch', () => {
    it('captures empty commands when nothing is queued', () => {
      const record = recordEpoch(state, 'player');
      expect(record.unitOrders).toHaveLength(0);
      expect(record.globalCommands).toEqual([null, null]);
    });

    it('captures unit orders', () => {
      const moveCmd: MoveCommand = { type: 'move', unitId: playerDroneId, targetHex: { q: 3, r: 0 } };
      state.players.player.unitOrders.set(playerDroneId, moveCmd);

      const record = recordEpoch(state, 'player');
      expect(record.unitOrders).toHaveLength(1);
      expect(record.unitOrders[0][0]).toBe(playerDroneId);
      expect(record.unitOrders[0][1]).toEqual(moveCmd);
    });

    it('captures global commands', () => {
      const trainCmd: TrainCommand = { type: 'train', structureId: 's1', unitType: 'pulse_sentry' };
      state.players.player.globalCommands[0] = trainCmd;

      const record = recordEpoch(state, 'player');
      expect(record.globalCommands[0]).toEqual(trainCmd);
    });

    it('records AI commands independently', () => {
      const moveCmd: MoveCommand = { type: 'move', unitId: aiDroneId, targetHex: { q: 1, r: 1 } };
      state.players.ai.unitOrders.set(aiDroneId, moveCmd);

      const record = recordEpoch(state, 'ai');
      expect(record.unitOrders).toHaveLength(1);
      expect(record.unitOrders[0][0]).toBe(aiDroneId);
    });
  });

  describe('replayEpochCommands', () => {
    it('applies recorded commands to AI player', () => {
      const moveCmd: MoveCommand = { type: 'move', unitId: aiDroneId, targetHex: { q: 5, r: 0 } };
      const record: EpochRecord = {
        unitOrders: [[aiDroneId, moveCmd]],
        globalCommands: [null],
      };

      replayEpochCommands(state, record);
      expect(state.players.ai.unitOrders.get(aiDroneId)).toEqual(moveCmd);
    });

    it('skips commands for units that no longer exist', () => {
      const moveCmd: MoveCommand = { type: 'move', unitId: 'dead_unit_99', targetHex: { q: 5, r: 0 } };
      const record: EpochRecord = {
        unitOrders: [['dead_unit_99', moveCmd]],
        globalCommands: [null],
      };

      replayEpochCommands(state, record);
      expect(state.players.ai.unitOrders.size).toBe(0);
    });

    it('skips commands for units owned by the player (not AI)', () => {
      const moveCmd: MoveCommand = { type: 'move', unitId: playerDroneId, targetHex: { q: 5, r: 0 } };
      const record: EpochRecord = {
        unitOrders: [[playerDroneId, moveCmd]],
        globalCommands: [null],
      };

      replayEpochCommands(state, record);
      expect(state.players.ai.unitOrders.size).toBe(0);
    });

    it('pads global commands to match slot count', () => {
      const record: EpochRecord = {
        unitOrders: [],
        globalCommands: [], // empty recording
      };

      replayEpochCommands(state, record);
      // AI should have commandSlots entries, all null
      expect(state.players.ai.globalCommands).toHaveLength(state.players.ai.commandSlots);
      expect(state.players.ai.globalCommands.every(c => c === null)).toBe(true);
    });

    it('truncates global commands if recording has more slots than AI', () => {
      const trainCmd: TrainCommand = { type: 'train', structureId: 's1', unitType: 'pulse_sentry' };
      const record: EpochRecord = {
        unitOrders: [],
        globalCommands: [trainCmd, trainCmd, trainCmd, trainCmd, trainCmd], // 5 commands
      };

      // AI at default difficulty has limited slots
      replayEpochCommands(state, record);
      expect(state.players.ai.globalCommands).toHaveLength(state.players.ai.commandSlots);
    });

    it('clears previous unit orders before applying new ones', () => {
      // Set up a pre-existing order
      const defendCmd: DefendCommand = { type: 'defend', unitId: aiDroneId };
      state.players.ai.unitOrders.set(aiDroneId, defendCmd);

      // Replay with no unit orders
      const record: EpochRecord = {
        unitOrders: [],
        globalCommands: [null],
      };

      replayEpochCommands(state, record);
      expect(state.players.ai.unitOrders.size).toBe(0);
    });
  });
});

describe('timeline encoding/decoding', () => {
  const sampleRecording: TimelineRecording = {
    v: 1,
    seed: 42,
    name: 'TestPlayer',
    difficulty: 'adept',
    epochs: [
      {
        unitOrders: [['u1', { type: 'move', unitId: 'u1', targetHex: { q: 3, r: 0 } }]],
        globalCommands: [null, null],
      },
      {
        unitOrders: [['u1', { type: 'defend', unitId: 'u1' }]],
        globalCommands: [
          { type: 'train', structureId: 's1', unitType: 'pulse_sentry' },
          null,
        ],
      },
    ],
  };

  it('roundtrips a recording through encode/decode', async () => {
    const encoded = await encodeTimeline(sampleRecording);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = await decodeTimeline(encoded);
    expect(decoded).toEqual(sampleRecording);
  });

  it('handles an empty epochs array', async () => {
    const empty: TimelineRecording = { v: 1, seed: 99, name: '', difficulty: 'novice', epochs: [] };
    const encoded = await encodeTimeline(empty);
    const decoded = await decodeTimeline(encoded);
    expect(decoded).toEqual(empty);
  });

  it('returns null for invalid encoded strings', async () => {
    expect(await decodeTimeline('')).toBeNull();
    expect(await decodeTimeline('x')).toBeNull();
    expect(await decodeTimeline('rAAAA')).toBeNull(); // not valid JSON
  });

  it('returns null for wrong version', async () => {
    expect(await decodeTimeline(encodeRaw({ v: 99, seed: 42, name: 'bad', difficulty: 'adept', epochs: [] }))).toBeNull();
  });

  it('produces a URL-safe string (no +, /, or =)', async () => {
    const encoded = await encodeTimeline(sampleRecording);
    // Skip first character (prefix)
    const payload = encoded.slice(1);
    expect(payload).not.toMatch(/[+/=]/);
  });

  it('encodes a realistic game in under 8KB', async () => {
    // Simulate a 15-epoch game with varied commands
    const epochs: TimelineRecording['epochs'] = [];
    for (let i = 0; i < 15; i++) {
      epochs.push({
        unitOrders: [
          [`u${i}`, { type: 'move', unitId: `u${i}`, targetHex: { q: i, r: -i } }],
          [`u${i + 1}`, { type: 'attack', unitId: `u${i + 1}`, targetHex: { q: i + 2, r: 0 } }],
          [`u${i + 2}`, { type: 'defend', unitId: `u${i + 2}` }],
        ],
        globalCommands: [
          { type: 'train', structureId: `s${i}`, unitType: 'pulse_sentry' },
          null,
          i % 3 === 0 ? { type: 'temporal', ability: 'echo', teCost: 2 } : null,
        ],
      });
    }
    const recording: TimelineRecording = { v: 1, seed: 12345, name: 'Commander X', difficulty: 'commander', epochs };
    const encoded = await encodeTimeline(recording);
    expect(encoded.length).toBeLessThan(8192);
  });

  it('preserves difficulty field through roundtrip', async () => {
    const rec: TimelineRecording = { v: 1, seed: 1, name: 'X', difficulty: 'epoch_master', epochs: [] };
    const decoded = await decodeTimeline(await encodeTimeline(rec));
    expect(decoded?.difficulty).toBe('epoch_master');
  });

  it('backfills difficulty to adept for legacy recordings', async () => {
    // Legacy recording without difficulty field
    const legacy = { v: 1, seed: 42, name: 'old', epochs: [] };
    const decoded = await decodeTimeline(encodeRaw(legacy));
    expect(decoded).not.toBeNull();
    expect(decoded!.difficulty).toBe('adept');
  });
});

describe('timeline validation (malformed payloads)', () => {
  it('rejects payload with invalid unit command type', async () => {
    const bad = {
      v: 1, seed: 42, name: 'hacker', difficulty: 'adept',
      epochs: [{
        unitOrders: [['u1', { type: 'exec_shell', unitId: 'u1' }]],
        globalCommands: [null],
      }],
    };
    expect(await decodeTimeline(encodeRaw(bad))).toBeNull();
  });

  it('rejects payload with invalid global command type', async () => {
    const bad = {
      v: 1, seed: 42, name: 'hacker', difficulty: 'adept',
      epochs: [{
        unitOrders: [],
        globalCommands: [{ type: 'drop_table' }],
      }],
    };
    expect(await decodeTimeline(encodeRaw(bad))).toBeNull();
  });

  it('rejects payload where unitOrders entry is not a 2-element array', async () => {
    const bad = {
      v: 1, seed: 42, name: 'hacker', difficulty: 'adept',
      epochs: [{
        unitOrders: [['u1']], // missing command
        globalCommands: [null],
      }],
    };
    expect(await decodeTimeline(encodeRaw(bad))).toBeNull();
  });

  it('rejects payload where unitOrders entry has non-string ID', async () => {
    const bad = {
      v: 1, seed: 42, name: 'hacker', difficulty: 'adept',
      epochs: [{
        unitOrders: [[123, { type: 'move', unitId: 'u1', targetHex: { q: 0, r: 0 } }]],
        globalCommands: [null],
      }],
    };
    expect(await decodeTimeline(encodeRaw(bad))).toBeNull();
  });

  it('rejects payload where epoch is not an object', async () => {
    const bad = { v: 1, seed: 42, name: 'hacker', difficulty: 'adept', epochs: ['not an object'] };
    expect(await decodeTimeline(encodeRaw(bad))).toBeNull();
  });

  it('rejects payload where unitOrders is not an array', async () => {
    const bad = {
      v: 1, seed: 42, name: 'hacker', difficulty: 'adept',
      epochs: [{ unitOrders: 'oops', globalCommands: [null] }],
    };
    expect(await decodeTimeline(encodeRaw(bad))).toBeNull();
  });

  it('rejects payload with invalid difficulty', async () => {
    const bad = { v: 1, seed: 42, name: 'hacker', difficulty: 'godmode', epochs: [] };
    expect(await decodeTimeline(encodeRaw(bad))).toBeNull();
  });

  it('rejects payload where name is not a string', async () => {
    const bad = { v: 1, seed: 42, name: 123, difficulty: 'adept', epochs: [] };
    expect(await decodeTimeline(encodeRaw(bad))).toBeNull();
  });

  it('rejects payload where seed is not a number', async () => {
    const bad = { v: 1, seed: 'abc', name: 'x', difficulty: 'adept', epochs: [] };
    expect(await decodeTimeline(encodeRaw(bad))).toBeNull();
  });

  it('accepts payload with all valid command types', async () => {
    const good = {
      v: 1, seed: 42, name: 'ok', difficulty: 'adept',
      epochs: [{
        unitOrders: [
          ['u1', { type: 'move', unitId: 'u1', targetHex: { q: 0, r: 0 } }],
          ['u2', { type: 'attack', unitId: 'u2', targetHex: { q: 1, r: 0 } }],
          ['u3', { type: 'defend', unitId: 'u3' }],
          ['u4', { type: 'gather', unitId: 'u4', targetHex: { q: 2, r: 0 } }],
          ['u5', { type: 'build', unitId: 'u5', targetHex: { q: 3, r: 0 }, structureType: 'barracks' }],
          ['u6', { type: 'chrono_shift', unitId: 'u6' }],
          ['u7', { type: 'phase_surge', unitId: 'u7', targetHex: { q: 4, r: 0 } }],
          ['u8', { type: 'merge', unitId: 'u8', targetUnitIds: ['u9'] }],
        ],
        globalCommands: [
          { type: 'train', structureId: 's1', unitType: 'pulse_sentry' },
          { type: 'research' },
          { type: 'temporal', ability: 'echo', teCost: 2 },
          { type: 'epoch_anchor', action: 'set' },
          { type: 'timeline_fork' },
          { type: 'chrono_scout' },
          null,
        ],
      }],
    };
    const result = await decodeTimeline(encodeRaw(good));
    expect(result).not.toBeNull();
    expect(result!.epochs[0].unitOrders).toHaveLength(8);
    expect(result!.epochs[0].globalCommands).toHaveLength(7);
  });
});
