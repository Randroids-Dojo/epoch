import { describe, it, expect } from 'vitest';
import { computeVisibility, generateAICommands } from '@/engine/ai';
import { createInitialState, GameState, findNexus, newId } from '@/engine/state';
import { hexKey } from '@/engine/hex';
import { UNIT_DEFS } from '@/engine/units';
import { STRUCTURE_DEFS } from '@/engine/structures';
import { resolveEpoch } from '@/engine/resolution';
import { MAX_COMMAND_SLOTS } from '@/engine/commands';

function makeState(): GameState {
  return createInitialState(42);
}

describe('computeVisibility', () => {
  it('includes hexes around AI units within vision radius', () => {
    const state = makeState();
    const vis = computeVisibility(state, 'ai');

    // AI starts with 1 drone (vision 2) + nexus (vision 3) near aiStart={q:9,r:0}.
    // Nexus at (9,0) should give visibility within 3 hexes.
    expect(vis.has(hexKey({ q: 9, r: 0 }))).toBe(true);
    expect(vis.has(hexKey({ q: 10, r: 0 }))).toBe(true);
    expect(vis.has(hexKey({ q: 8, r: 0 }))).toBe(true);
  });

  it('includes hexes around AI structures with vision radius', () => {
    const state = makeState();
    const vis = computeVisibility(state, 'ai');

    // Nexus at (9,0) has vision radius 3.
    expect(vis.has(hexKey({ q: 6, r: 0 }))).toBe(true); // 3 hexes away
  });

  it('does not include hexes only near player units', () => {
    const state = makeState();
    const vis = computeVisibility(state, 'ai');

    // Player start is at (-9,0) — far from AI.
    expect(vis.has(hexKey({ q: -9, r: 0 }))).toBe(false);
    expect(vis.has(hexKey({ q: -8, r: 0 }))).toBe(false);
  });

  it('does not include hexes outside the map', () => {
    const state = makeState();
    const vis = computeVisibility(state, 'ai');

    // Map goes from q:-12 to q:11 and r:-10 to r:9. Check a far-out hex.
    for (const key of vis) {
      expect(state.map.cells.has(key)).toBe(true);
    }
  });
});

describe('generateAICommands — economy', () => {
  it('assigns idle drone to completed extractor (Gather)', () => {
    const state = makeState();
    const nexus = findNexus(state, 'ai')!;

    // Add a completed crystal extractor near AI base.
    const exId = newId('s');
    const exHex = { q: nexus.hex.q - 2, r: nexus.hex.r + 1 };
    state.structures.set(exId, {
      id: exId,
      owner: 'ai',
      type: 'crystal_extractor',
      hex: exHex,
      hp: STRUCTURE_DEFS.crystal_extractor.maxHp,
      buildProgress: 0,
      assignedDroneId: null,
    });

    generateAICommands(state);
    const cmds = state.players.ai.commands.filter((c) => c !== null);
    const gatherCmd = cmds.find((c) => c.type === 'gather');

    expect(gatherCmd).toBeDefined();
    expect(gatherCmd!.type).toBe('gather');
  });

  it('builds extractor on nearby crystal node when affordable', () => {
    const state = makeState();
    state.players.ai.resources.cc = 10;

    generateAICommands(state);
    const cmds = state.players.ai.commands.filter((c) => c !== null);
    const buildCmd = cmds.find(
      (c) => c.type === 'build' && c.structureType === 'crystal_extractor',
    );

    // The map has crystal nodes near AI start (mirrored from player side).
    // AI should attempt to build an extractor there.
    expect(buildCmd).toBeDefined();
  });

  it('builds barracks when none exists and affordable', () => {
    const state = makeState();
    state.players.ai.resources.cc = 15;

    generateAICommands(state);
    const cmds = state.players.ai.commands.filter((c) => c !== null);
    const barracksCmd = cmds.find(
      (c) => c.type === 'build' && c.structureType === 'barracks',
    );

    expect(barracksCmd).toBeDefined();
  });

  it('trains drone when extractor needs staffing', () => {
    const state = makeState();
    const nexus = findNexus(state, 'ai')!;

    // Add completed barracks.
    const bId = newId('s');
    const bHex = { q: nexus.hex.q - 1, r: nexus.hex.r };
    state.structures.set(bId, {
      id: bId,
      owner: 'ai',
      type: 'barracks',
      hex: bHex,
      hp: STRUCTURE_DEFS.barracks.maxHp,
      buildProgress: 0,
      assignedDroneId: null,
    });

    // Add completed extractor with no assigned drone.
    const exId = newId('s');
    const exHex = { q: nexus.hex.q + 2, r: nexus.hex.r - 1 };
    state.structures.set(exId, {
      id: exId,
      owner: 'ai',
      type: 'crystal_extractor',
      hex: exHex,
      hp: STRUCTURE_DEFS.crystal_extractor.maxHp,
      buildProgress: 0,
      assignedDroneId: null,
    });

    // Assign the existing drone to the extractor so it's "busy".
    const aiDrone = [...state.units.values()].find(
      (u) => u.owner === 'ai' && u.type === 'drone',
    )!;
    aiDrone.assignedExtractorId = exId;
    state.structures.get(exId)!.assignedDroneId = aiDrone.id;

    // Add a second unstaffed extractor.
    const exId2 = newId('s');
    const exHex2 = { q: nexus.hex.q - 2, r: nexus.hex.r + 1 };
    state.structures.set(exId2, {
      id: exId2,
      owner: 'ai',
      type: 'crystal_extractor',
      hex: exHex2,
      hp: STRUCTURE_DEFS.crystal_extractor.maxHp,
      buildProgress: 0,
      assignedDroneId: null,
    });

    state.players.ai.resources.cc = 10;

    generateAICommands(state);
    const cmds = state.players.ai.commands.filter((c) => c !== null);
    const trainCmd = cmds.find(
      (c) => c.type === 'train' && c.unitType === 'drone',
    );

    expect(trainCmd).toBeDefined();
  });
});

describe('generateAICommands — military', () => {
  it('trains combat unit when economy is stable', () => {
    const state = makeState();
    const nexus = findNexus(state, 'ai')!;

    // Add completed barracks.
    const bId = newId('s');
    state.structures.set(bId, {
      id: bId,
      owner: 'ai',
      type: 'barracks',
      hex: { q: nexus.hex.q - 1, r: nexus.hex.r },
      hp: STRUCTURE_DEFS.barracks.maxHp,
      buildProgress: 0,
      assignedDroneId: null,
    });

    // Give AI plenty of CC and no unstaffed extractors.
    state.players.ai.resources.cc = 20;

    generateAICommands(state);
    const cmds = state.players.ai.commands.filter((c) => c !== null);
    const trainCmd = cmds.find(
      (c) => c.type === 'train' && (c.unitType === 'arc_ranger' || c.unitType === 'pulse_sentry'),
    );

    expect(trainCmd).toBeDefined();
  });

  it('attacks visible enemy unit in range', () => {
    const state = makeState();
    const nexus = findNexus(state, 'ai')!;

    // Add an arc_ranger for AI.
    const rangerId = newId('u');
    const rangerHex = { q: nexus.hex.q - 2, r: nexus.hex.r };
    state.units.set(rangerId, {
      id: rangerId,
      owner: 'ai',
      type: 'arc_ranger',
      hex: rangerHex,
      hp: UNIT_DEFS.arc_ranger.maxHp,
      isDefending: false,
      assignedExtractorId: null,
    });

    // Place a player unit within range (3 hexes) and within AI vision.
    const playerUnitId = newId('u');
    const playerHex = { q: rangerHex.q - 2, r: rangerHex.r };
    state.units.set(playerUnitId, {
      id: playerUnitId,
      owner: 'player',
      type: 'drone',
      hex: playerHex,
      hp: UNIT_DEFS.drone.maxHp,
      isDefending: false,
      assignedExtractorId: null,
    });

    generateAICommands(state);
    const cmds = state.players.ai.commands.filter((c) => c !== null);
    const attackCmd = cmds.find(
      (c) => c.type === 'attack' && c.unitId === rangerId,
    );

    expect(attackCmd).toBeDefined();
    if (attackCmd && attackCmd.type === 'attack') {
      expect(attackCmd.targetHex).toEqual(playerHex);
    }
  });

  it('moves combat units toward map center when no target visible', () => {
    const state = makeState();
    const nexus = findNexus(state, 'ai')!;

    // Add a combat unit.
    const sentryId = newId('u');
    state.units.set(sentryId, {
      id: sentryId,
      owner: 'ai',
      type: 'pulse_sentry',
      hex: { q: nexus.hex.q, r: nexus.hex.r + 1 },
      hp: UNIT_DEFS.pulse_sentry.maxHp,
      isDefending: false,
      assignedExtractorId: null,
    });

    generateAICommands(state);
    const cmds = state.players.ai.commands.filter((c) => c !== null);
    const moveCmd = cmds.find(
      (c) => c.type === 'move' && c.unitId === sentryId,
    );

    expect(moveCmd).toBeDefined();
    if (moveCmd && moveCmd.type === 'move') {
      // Should move toward center (0,0).
      expect(moveCmd.targetHex).toEqual({ q: 0, r: 0 });
    }
  });
});

describe('generateAICommands — constraints', () => {
  it('never exceeds 5 command slots', () => {
    const state = makeState();
    state.players.ai.resources.cc = 100;

    // Add lots of units so there are many possible commands.
    for (let i = 0; i < 10; i++) {
      const id = newId('u');
      state.units.set(id, {
        id,
        owner: 'ai',
        type: 'drone',
        hex: { q: 9 - i, r: i % 3 },
        hp: UNIT_DEFS.drone.maxHp,
        isDefending: false,
        assignedExtractorId: null,
      });
    }

    generateAICommands(state);
    const filledSlots = state.players.ai.commands.filter((c) => c !== null).length;
    expect(filledSlots).toBeLessThanOrEqual(MAX_COMMAND_SLOTS);
  });

  it('does not spend more CC than available', () => {
    const state = makeState();
    state.players.ai.resources.cc = 3; // Only enough for 1 extractor.

    generateAICommands(state);
    const cmds = state.players.ai.commands.filter((c) => c !== null);

    // Count total cost of build + train commands.
    let totalCost = 0;
    for (const cmd of cmds) {
      if (cmd.type === 'build') {
        totalCost += STRUCTURE_DEFS[cmd.structureType].costCC;
      } else if (cmd.type === 'train') {
        totalCost += UNIT_DEFS[cmd.unitType].costCC;
      }
    }

    expect(totalCost).toBeLessThanOrEqual(3);
  });

  it('does not attack units outside visibility', () => {
    const state = makeState();

    // Player units are far away at (-9,0) — not in AI vision.
    generateAICommands(state);
    const cmds = state.players.ai.commands.filter((c) => c !== null);
    const attackCmds = cmds.filter((c) => c.type === 'attack');

    expect(attackCmds.length).toBe(0);
  });
});

describe('generateAICommands — integration', () => {
  it('populates state.players.ai.commands', () => {
    const state = makeState();
    generateAICommands(state);

    // Should have at least one command (move the drone at minimum).
    const filledSlots = state.players.ai.commands.filter((c) => c !== null).length;
    expect(filledSlots).toBeGreaterThan(0);
  });

  it('resolveEpoch processes AI commands alongside player', () => {
    const state = makeState();
    generateAICommands(state);
    const log = resolveEpoch(state);

    // The AI drone should have done something (moved, gathered, etc.).
    // Check that the event log contains AI actions.
    const aiEntries = log.filter((e) => e.startsWith('ai'));
    expect(aiEntries.length).toBeGreaterThan(0);
  });

  it('AI units move after resolution', () => {
    const state = makeState();

    generateAICommands(state);
    resolveEpoch(state);

    // After resolution, the AI drone may have moved or been assigned.
    // At minimum, the AI should have issued commands.
    const hadCommands = state.eventLog.some((e) => e.startsWith('ai'));
    // The drone either moved or was assigned to gather.
    expect(hadCommands).toBe(true);
  });
});
