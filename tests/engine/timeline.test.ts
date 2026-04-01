import { describe, it, expect, beforeEach } from 'vitest';
import {
  captureCommands,
  captureEpochEntry,
  replayCommands,
  EpochRecord,
} from '@/engine/timeline';
import { makeState } from './helpers';
import { GameState } from '@/engine/state';
import { MoveCommand, TrainCommand, DefendCommand } from '@/engine/commands';

describe('captureCommands', () => {
  let state: GameState;
  let playerDroneId: string;
  let aiDroneId: string;

  beforeEach(() => {
    state = makeState(42);
    for (const [id, unit] of state.units) {
      if (unit.owner === 'player' && unit.type === 'drone') playerDroneId = id;
      if (unit.owner === 'ai' && unit.type === 'drone') aiDroneId = id;
    }
  });

  it('captures empty commands when nothing is queued', () => {
    const record = captureCommands(state, 'player');
    expect(record.unitOrders).toHaveLength(0);
    expect(record.globalCommands).toEqual([null, null]);
  });

  it('captures unit orders', () => {
    const moveCmd: MoveCommand = { type: 'move', unitId: playerDroneId, targetHex: { q: 3, r: 0 } };
    state.players.player.unitOrders.set(playerDroneId, moveCmd);

    const record = captureCommands(state, 'player');
    expect(record.unitOrders).toHaveLength(1);
    expect(record.unitOrders[0][0]).toBe(playerDroneId);
    expect(record.unitOrders[0][1]).toEqual(moveCmd);
  });

  it('captures global commands', () => {
    const trainCmd: TrainCommand = { type: 'train', structureId: 's1', unitType: 'pulse_sentry' };
    state.players.player.globalCommands[0] = trainCmd;

    const record = captureCommands(state, 'player');
    expect(record.globalCommands[0]).toEqual(trainCmd);
  });

  it('records AI commands independently', () => {
    const moveCmd: MoveCommand = { type: 'move', unitId: aiDroneId, targetHex: { q: 1, r: 1 } };
    state.players.ai.unitOrders.set(aiDroneId, moveCmd);

    const record = captureCommands(state, 'ai');
    expect(record.unitOrders).toHaveLength(1);
    expect(record.unitOrders[0][0]).toBe(aiDroneId);
  });
});

describe('captureEpochEntry', () => {
  let state: GameState;
  let playerDroneId: string;
  let aiDroneId: string;

  beforeEach(() => {
    state = makeState(42);
    for (const [id, unit] of state.units) {
      if (unit.owner === 'player' && unit.type === 'drone') playerDroneId = id;
      if (unit.owner === 'ai' && unit.type === 'drone') aiDroneId = id;
    }
  });

  it('captures both players at once', () => {
    const moveCmd: MoveCommand = { type: 'move', unitId: playerDroneId, targetHex: { q: 3, r: 0 } };
    state.players.player.unitOrders.set(playerDroneId, moveCmd);

    const aiMove: MoveCommand = { type: 'move', unitId: aiDroneId, targetHex: { q: -3, r: 0 } };
    state.players.ai.unitOrders.set(aiDroneId, aiMove);

    const entry = captureEpochEntry(state);
    expect(entry.epoch).toBe(state.epoch);
    expect(entry.player.unitOrders).toHaveLength(1);
    expect(entry.ai.unitOrders).toHaveLength(1);
    expect(entry.player.unitOrders[0][1]).toEqual(moveCmd);
    expect(entry.ai.unitOrders[0][1]).toEqual(aiMove);
  });

  it('records the current epoch number', () => {
    state.epoch = 5;
    const entry = captureEpochEntry(state);
    expect(entry.epoch).toBe(5);
  });
});

describe('replayCommands', () => {
  let state: GameState;
  let playerDroneId: string;
  let aiDroneId: string;

  beforeEach(() => {
    state = makeState(42);
    for (const [id, unit] of state.units) {
      if (unit.owner === 'player' && unit.type === 'drone') playerDroneId = id;
      if (unit.owner === 'ai' && unit.type === 'drone') aiDroneId = id;
    }
  });

  it('applies recorded commands to AI player', () => {
    const moveCmd: MoveCommand = { type: 'move', unitId: aiDroneId, targetHex: { q: 5, r: 0 } };
    const record: EpochRecord = {
      unitOrders: [[aiDroneId, moveCmd]],
      globalCommands: [null],
    };

    replayCommands(state, 'ai', record);
    expect(state.players.ai.unitOrders.get(aiDroneId)).toEqual(moveCmd);
  });

  it('applies recorded commands to player', () => {
    const moveCmd: MoveCommand = { type: 'move', unitId: playerDroneId, targetHex: { q: 5, r: 0 } };
    const record: EpochRecord = {
      unitOrders: [[playerDroneId, moveCmd]],
      globalCommands: [null],
    };

    replayCommands(state, 'player', record);
    expect(state.players.player.unitOrders.get(playerDroneId)).toEqual(moveCmd);
  });

  it('skips commands for units that no longer exist', () => {
    const moveCmd: MoveCommand = { type: 'move', unitId: 'dead_unit_99', targetHex: { q: 5, r: 0 } };
    const record: EpochRecord = {
      unitOrders: [['dead_unit_99', moveCmd]],
      globalCommands: [null],
    };

    replayCommands(state, 'ai', record);
    expect(state.players.ai.unitOrders.size).toBe(0);
  });

  it('skips commands for units owned by wrong player', () => {
    const moveCmd: MoveCommand = { type: 'move', unitId: playerDroneId, targetHex: { q: 5, r: 0 } };
    const record: EpochRecord = {
      unitOrders: [[playerDroneId, moveCmd]],
      globalCommands: [null],
    };

    replayCommands(state, 'ai', record);
    expect(state.players.ai.unitOrders.size).toBe(0);
  });

  it('pads global commands to match slot count', () => {
    const record: EpochRecord = {
      unitOrders: [],
      globalCommands: [],
    };

    replayCommands(state, 'ai', record);
    expect(state.players.ai.globalCommands).toHaveLength(state.players.ai.commandSlots);
    expect(state.players.ai.globalCommands.every(c => c === null)).toBe(true);
  });

  it('truncates global commands if recording has more slots', () => {
    const trainCmd: TrainCommand = { type: 'train', structureId: 's1', unitType: 'pulse_sentry' };
    const record: EpochRecord = {
      unitOrders: [],
      globalCommands: [trainCmd, trainCmd, trainCmd, trainCmd, trainCmd],
    };

    replayCommands(state, 'ai', record);
    expect(state.players.ai.globalCommands).toHaveLength(state.players.ai.commandSlots);
  });

  it('clears previous unit orders before applying new ones', () => {
    const defendCmd: DefendCommand = { type: 'defend', unitId: aiDroneId };
    state.players.ai.unitOrders.set(aiDroneId, defendCmd);

    const record: EpochRecord = {
      unitOrders: [],
      globalCommands: [null],
    };

    replayCommands(state, 'ai', record);
    expect(state.players.ai.unitOrders.size).toBe(0);
  });
});
