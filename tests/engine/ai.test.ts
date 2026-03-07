import { describe, it, expect } from 'vitest';
import { computeVisibility, generateAICommands } from '@/engine/ai';
import { findNexus, newId, GameState } from '@/engine/state';
import { hexKey } from '@/engine/hex';
import { UNIT_DEFS } from '@/engine/units';
import { STRUCTURE_DEFS } from '@/engine/structures';
import { resolveEpoch } from '@/engine/resolution';
import { makeState, makeStateWithDifficulty } from './helpers';

function allAICmds(state: GameState) {
  return [
    ...state.players.ai.unitOrders.values(),
    ...state.players.ai.globalCommands.filter((c): c is NonNullable<typeof c> => c !== null),
  ];
}

describe('computeVisibility', () => {
  it('includes hexes around AI units within vision radius', () => {
    const state = makeState();
    const vis = computeVisibility(state, 'ai');

    // AI starts with 1 drone (vision 2) + nexus (vision 3) near aiStart={q:9,r:0}.
    expect(vis.has(hexKey({ q: 9, r: 0 }))).toBe(true);
    expect(vis.has(hexKey({ q: 10, r: 0 }))).toBe(true);
    expect(vis.has(hexKey({ q: 8, r: 0 }))).toBe(true);
  });

  it('includes hexes around AI structures with vision radius', () => {
    const state = makeState();
    const vis = computeVisibility(state, 'ai');
    expect(vis.has(hexKey({ q: 6, r: 0 }))).toBe(true); // 3 hexes away
  });

  it('does not include hexes only near player units', () => {
    const state = makeState();
    const vis = computeVisibility(state, 'ai');
    expect(vis.has(hexKey({ q: -9, r: 0 }))).toBe(false);
    expect(vis.has(hexKey({ q: -8, r: 0 }))).toBe(false);
  });

  it('does not include hexes outside the map', () => {
    const state = makeState();
    const vis = computeVisibility(state, 'ai');
    for (const key of vis) {
      expect(state.map.cells.has(key)).toBe(true);
    }
  });
});

describe('generateAICommands — economy', () => {
  it('assigns idle drone to completed extractor (Gather)', () => {
    const state = makeState();
    const nexus = findNexus(state, 'ai')!;
    const exId = newId('s');
    const exHex = { q: nexus.hex.q - 2, r: nexus.hex.r + 1 };
    state.structures.set(exId, {
      id: exId, owner: 'ai', type: 'crystal_extractor', hex: exHex,
      hp: STRUCTURE_DEFS.crystal_extractor.maxHp, buildProgress: 0, assignedDroneId: null,
    });
    // Barracks must exist — gather is gated on having military production
    const bkId = newId('s');
    state.structures.set(bkId, {
      id: bkId, owner: 'ai', type: 'barracks', hex: { q: nexus.hex.q - 1, r: nexus.hex.r },
      hp: STRUCTURE_DEFS.barracks.maxHp, buildProgress: 0, assignedDroneId: null,
    });

    generateAICommands(state);
    const cmds = allAICmds(state);
    expect(cmds.find((c) => c.type === 'gather')).toBeDefined();
  });

  it('builds extractor on nearby crystal node when affordable', () => {
    const state = makeState();
    state.players.ai.resources.cc = 10;

    generateAICommands(state);
    const cmds = allAICmds(state);
    expect(cmds.find((c) => c.type === 'build' && c.structureType === 'crystal_extractor')).toBeDefined();
  });

  it('builds barracks when none exists and affordable', () => {
    const state = makeState();
    // Use Aggressor blend so barracks (buildMilitary) scores above extractor (buildEconomy)
    state.aiConfig.archetypeBlend = { expander: 0, aggressor: 1, technologist: 0, fortress: 0 };
    state.players.ai.resources.cc = 15;

    generateAICommands(state);
    const cmds = allAICmds(state);
    expect(cmds.find((c) => c.type === 'build' && c.structureType === 'barracks')).toBeDefined();
  });

  it('trains drone when extractor needs staffing', () => {
    const state = makeState();
    const nexus = findNexus(state, 'ai')!;

    const bId = newId('s');
    state.structures.set(bId, {
      id: bId, owner: 'ai', type: 'barracks',
      hex: { q: nexus.hex.q - 1, r: nexus.hex.r },
      hp: STRUCTURE_DEFS.barracks.maxHp, buildProgress: 0, assignedDroneId: null,
    });

    const exId = newId('s');
    const exHex = { q: nexus.hex.q + 2, r: nexus.hex.r - 1 };
    state.structures.set(exId, {
      id: exId, owner: 'ai', type: 'crystal_extractor', hex: exHex,
      hp: STRUCTURE_DEFS.crystal_extractor.maxHp, buildProgress: 0, assignedDroneId: null,
    });

    const aiDrone = [...state.units.values()].find((u) => u.owner === 'ai' && u.type === 'drone')!;
    aiDrone.assignedExtractorId = exId;
    state.structures.get(exId)!.assignedDroneId = aiDrone.id;

    const exId2 = newId('s');
    state.structures.set(exId2, {
      id: exId2, owner: 'ai', type: 'crystal_extractor',
      hex: { q: nexus.hex.q - 2, r: nexus.hex.r + 1 },
      hp: STRUCTURE_DEFS.crystal_extractor.maxHp, buildProgress: 0, assignedDroneId: null,
    });

    state.players.ai.resources.cc = 10;
    generateAICommands(state);
    const cmds = allAICmds(state);
    expect(cmds.find((c) => c.type === 'train' && c.unitType === 'drone')).toBeDefined();
  });
});

describe('generateAICommands — military', () => {
  it('trains combat unit when economy is stable', () => {
    const state = makeState();
    const nexus = findNexus(state, 'ai')!;

    const bId = newId('s');
    state.structures.set(bId, {
      id: bId, owner: 'ai', type: 'barracks',
      hex: { q: nexus.hex.q - 1, r: nexus.hex.r },
      hp: STRUCTURE_DEFS.barracks.maxHp, buildProgress: 0, assignedDroneId: null,
    });

    state.players.ai.resources.cc = 20;
    generateAICommands(state);
    const cmds = allAICmds(state);
    const trainCmd = cmds.find(
      (c) => c.type === 'train' && (c.unitType === 'arc_ranger' || c.unitType === 'pulse_sentry'),
    );
    expect(trainCmd).toBeDefined();
  });

  it('attacks visible enemy unit in range (Aggressor blend)', () => {
    const state = makeState();
    // Use pure Aggressor blend so attack is prioritised over building
    state.aiConfig.archetypeBlend = { expander: 0, aggressor: 1, technologist: 0, fortress: 0 };
    const nexus = findNexus(state, 'ai')!;

    const rangerId = newId('u');
    const rangerHex = { q: nexus.hex.q - 2, r: nexus.hex.r };
    state.units.set(rangerId, {
      id: rangerId, owner: 'ai', type: 'arc_ranger', hex: rangerHex,
      hp: UNIT_DEFS.arc_ranger.maxHp, isDefending: false, assignedExtractorId: null, damageShield: false,
    });

    const pId = newId('u');
    const playerHex = { q: rangerHex.q - 2, r: rangerHex.r };
    state.units.set(pId, {
      id: pId, owner: 'player', type: 'drone', hex: playerHex,
      hp: UNIT_DEFS.drone.maxHp, isDefending: false, assignedExtractorId: null, damageShield: false,
    });

    generateAICommands(state);
    const cmds = allAICmds(state);
    const attackCmd = cmds.find((c) => c.type === 'attack' && c.unitId === rangerId);
    expect(attackCmd).toBeDefined();
    if (attackCmd?.type === 'attack') {
      expect(attackCmd.targetHex).toEqual(playerHex);
    }
  });

  it('moves combat units toward map center when no target visible', () => {
    const state = makeState();
    const nexus = findNexus(state, 'ai')!;

    const sentryId = newId('u');
    state.units.set(sentryId, {
      id: sentryId, owner: 'ai', type: 'pulse_sentry',
      hex: { q: nexus.hex.q, r: nexus.hex.r + 1 },
      hp: UNIT_DEFS.pulse_sentry.maxHp, isDefending: false, assignedExtractorId: null, damageShield: false,
    });

    generateAICommands(state);
    const cmds = allAICmds(state);
    const moveCmd = cmds.find((c) => c.type === 'move' && c.unitId === sentryId);
    expect(moveCmd).toBeDefined();
    if (moveCmd?.type === 'move') {
      expect(moveCmd.targetHex).toEqual({ q: 0, r: 0 });
    }
  });
});

describe('generateAICommands — constraints', () => {
  it('never exceeds commandSlots', () => {
    const state = makeState();
    state.players.ai.resources.cc = 100;

    for (let i = 0; i < 10; i++) {
      const id = newId('u');
      state.units.set(id, {
        id, owner: 'ai', type: 'drone',
        hex: { q: 9 - i, r: i % 3 },
        hp: UNIT_DEFS.drone.maxHp, isDefending: false, assignedExtractorId: null, damageShield: false,
      });
    }

    generateAICommands(state);
    const filledGlobalSlots = state.players.ai.globalCommands.filter((c) => c !== null).length;
    expect(filledGlobalSlots).toBeLessThanOrEqual(state.players.ai.commandSlots);
  });

  it('does not spend more CC than available', () => {
    const state = makeState();
    state.players.ai.resources.cc = 3;

    generateAICommands(state);
    const cmds = [...allAICmds(state)];

    let totalCost = 0;
    for (const cmd of cmds) {
      if (cmd.type === 'build') totalCost += STRUCTURE_DEFS[cmd.structureType].costCC;
      else if (cmd.type === 'train') totalCost += UNIT_DEFS[cmd.unitType].costCC;
    }
    expect(totalCost).toBeLessThanOrEqual(3);
  });

  it('does not attack units outside visibility', () => {
    const state = makeState();
    generateAICommands(state);
    const cmds = allAICmds(state);
    expect(cmds.filter((c) => c.type === 'attack').length).toBe(0);
  });
});

describe('generateAICommands — difficulty slots', () => {
  it('Novice AI uses 1 global command slot', () => {
    const state = makeStateWithDifficulty('novice');
    expect(state.players.ai.commandSlots).toBe(1);
    state.players.ai.resources.cc = 100;
    generateAICommands(state);
    expect(state.players.ai.globalCommands.filter((c) => c !== null).length).toBeLessThanOrEqual(1);
  });

  it('Adept AI uses 2 global command slots', () => {
    const state = makeStateWithDifficulty('adept');
    expect(state.players.ai.commandSlots).toBe(2);
  });

  it('Commander AI uses 2 global command slots', () => {
    const state = makeStateWithDifficulty('commander');
    expect(state.players.ai.commandSlots).toBe(2);
  });

  it('Epoch Master AI uses 3 global command slots', () => {
    const state = makeStateWithDifficulty('epoch_master');
    expect(state.players.ai.commandSlots).toBe(3);
    state.players.ai.resources.cc = 100;
    generateAICommands(state);
    // Global commands should not exceed 3 slots
    expect(state.players.ai.globalCommands.filter((c) => c !== null).length).toBeLessThanOrEqual(3);
  });
});

describe('generateAICommands — archetypes', () => {
  it('Aggressor archetype prioritises training combat units over drones', () => {
    const state = makeStateWithDifficulty('adept');
    // Override blend to pure Aggressor
    state.aiConfig.archetypeBlend = { expander: 0, aggressor: 1, technologist: 0, fortress: 0 };

    const nexus = findNexus(state, 'ai')!;
    state.structures.set(newId('s'), {
      id: newId('s'), owner: 'ai', type: 'barracks',
      hex: { q: nexus.hex.q - 1, r: nexus.hex.r },
      hp: STRUCTURE_DEFS.barracks.maxHp, buildProgress: 0, assignedDroneId: null,
    });
    state.players.ai.resources.cc = 20;

    generateAICommands(state);
    const cmds = allAICmds(state);
    const trainCombat = cmds.find(
      (c) => c.type === 'train' && c.unitType !== 'drone',
    );
    expect(trainCombat).toBeDefined();
  });

  it('Fortress archetype issues defend commands when near nexus', () => {
    const state = makeStateWithDifficulty('adept');
    // Override blend to pure Fortress
    state.aiConfig.archetypeBlend = { expander: 0, aggressor: 0, technologist: 0, fortress: 1 };

    const nexus = findNexus(state, 'ai')!;
    // Add a combat unit near the nexus
    const sentryId = newId('u');
    state.units.set(sentryId, {
      id: sentryId, owner: 'ai', type: 'pulse_sentry',
      hex: { q: nexus.hex.q + 1, r: nexus.hex.r },
      hp: UNIT_DEFS.pulse_sentry.maxHp, isDefending: false, assignedExtractorId: null, damageShield: false,
    });

    generateAICommands(state);
    const cmds = allAICmds(state);
    expect(cmds.find((c) => c.type === 'defend')).toBeDefined();
  });

  it('Technologist archetype builds tech lab early', () => {
    const state = makeStateWithDifficulty('adept');
    state.aiConfig.archetypeBlend = { expander: 0, aggressor: 0, technologist: 1, fortress: 0 };
    state.players.ai.resources.cc = 20;
    // Barracks is a prerequisite for tech lab — add one so the candidate is generated.
    const nexus = findNexus(state, 'ai')!;
    const bkId = newId('s');
    state.structures.set(bkId, {
      id: bkId, owner: 'ai', type: 'barracks', hex: { q: nexus.hex.q - 1, r: nexus.hex.r },
      hp: STRUCTURE_DEFS.barracks.maxHp, buildProgress: 0, assignedDroneId: null,
    });

    generateAICommands(state);
    const cmds = allAICmds(state);
    expect(cmds.find((c) => c.type === 'build' && c.structureType === 'tech_lab')).toBeDefined();
  });
});

describe('generateAICommands — integration', () => {
  it('populates AI unit orders or global commands', () => {
    const state = makeState();
    generateAICommands(state);
    expect(allAICmds(state).length).toBeGreaterThan(0);
  });

  it('resolveEpoch processes AI commands alongside player', () => {
    const state = makeState();
    generateAICommands(state);
    const log = resolveEpoch(state);
    const aiEntries = log.filter((e) => e.startsWith('ai'));
    expect(aiEntries.length).toBeGreaterThan(0);
  });

  it('AI units move after resolution', () => {
    const state = makeState();
    generateAICommands(state);
    resolveEpoch(state);
    expect(state.eventLog.some((e) => e.startsWith('ai'))).toBe(true);
  });

  it('resolution records player command history in aiConfig', () => {
    const state = makeState();
    // Queue a player move command
    const playerDrone = [...state.units.values()].find((u) => u.owner === 'player')!;
    state.players.player.unitOrders.set(playerDrone.id, { type: 'move', unitId: playerDrone.id, targetHex: { q: -8, r: 0 } });
    generateAICommands(state);
    resolveEpoch(state);
    expect(state.aiConfig.playerCommandHistory.length).toBe(1);
    expect(state.aiConfig.playerCommandHistory[0].move).toBe(1);
  });
});
