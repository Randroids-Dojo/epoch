import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, resetIdSeq, GameState } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
import { STRUCTURE_DEFS } from '@/engine/structures';
import { UNIT_DEFS } from '@/engine/units';

let labCounter = 0;

beforeEach(() => {
  resetIdSeq();
  labCounter = 0;
});

function buildState(): GameState {
  return createInitialState(42);
}

/** Give the player a completed Tech Lab at the given hex. */
function addTechLab(state: GameState, q: number, r: number): void {
  const id = `s_lab_${labCounter++}`;
  (state.structures as Map<string, unknown>).set(id, {
    id,
    owner: 'player',
    type: 'tech_lab',
    hex: { q, r },
    hp: STRUCTURE_DEFS.tech_lab.maxHp,
    buildProgress: 0,
    assignedDroneId: null,
  });
}

/** Queue a command for the player. Unit commands go to unitOrders; globals to first free slot. */
function queue(state: GameState, cmd: { type: string; unitId?: string; [k: string]: unknown }): void {
  const unitTypes = ['move', 'attack', 'gather', 'defend', 'build', 'chrono_shift'];
  if (unitTypes.includes(cmd.type)) {
    if (!cmd.unitId) {
      // Auto-assign the player drone for drone commands (build/gather).
      const drone = [...state.units.values()].find(u => u.owner === 'player' && u.type === 'drone');
      if (drone) cmd = { ...cmd, unitId: drone.id };
    }
    state.players.player.unitOrders.set(cmd.unitId as string, cmd as never);
  } else {
    const i = state.players.player.globalCommands.findIndex((c) => c === null);
    if (i >= 0) state.players.player.globalCommands[i] = cmd as never;
    else state.players.player.globalCommands.push(cmd as never);
  }
}

describe('Tech Tree — Research command', () => {
  it('fails if no Tech Lab', () => {
    const state = buildState();
    queue(state, { type: 'research' });
    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('no completed Tech Lab'))).toBe(true);
    expect(state.players.player.techTier).toBe(0);
    expect(state.players.player.researchEpochsLeft).toBe(0);
  });

  it('starts research with a Tech Lab present', () => {
    const state = buildState();
    addTechLab(state, -7, 0);
    queue(state, { type: 'research' });
    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('began researching Tech Tier 1'))).toBe(true);
    // researchEpochsLeft starts at 3, then ticks to 2 in the same resolution
    expect(state.players.player.researchEpochsLeft).toBe(2);
    expect(state.players.player.techTier).toBe(0);
  });

  it('completes research after 3 epochs and upgrades tier', () => {
    const state = buildState();
    addTechLab(state, -7, 0);

    // Epoch 1: queue Research → researchEpochsLeft goes 3→2
    queue(state, { type: 'research' });
    resolveEpoch(state);
    state.phase = 'planning';
    expect(state.players.player.researchEpochsLeft).toBe(2);

    // Epoch 2: tick 2→1
    resolveEpoch(state);
    state.phase = 'planning';
    expect(state.players.player.researchEpochsLeft).toBe(1);

    // Epoch 3: tick 1→0, tier upgrades
    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('Tech Tier 1'))).toBe(true);
    expect(state.players.player.techTier).toBe(1);
    expect(state.players.player.researchEpochsLeft).toBe(0);
    expect(state.players.player.commandSlots).toBe(3); // global slots at Tier 1
  });

  it('cannot start research while already researching', () => {
    const state = buildState();
    addTechLab(state, -7, 0);
    queue(state, { type: 'research' });
    resolveEpoch(state);
    state.phase = 'planning';

    // Try to research again
    queue(state, { type: 'research' });
    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('already researching'))).toBe(true);
  });

  it('cannot research beyond tier 3', () => {
    const state = buildState();
    addTechLab(state, -7, 0);
    state.players.player.techTier = 3;
    queue(state, { type: 'research' });
    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('already at max Tech Tier'))).toBe(true);
    expect(state.players.player.techTier).toBe(3);
  });
});

describe('Tech Tree — global slot upgrades', () => {
  it('player starts with 2 global slots', () => {
    const state = buildState();
    expect(state.players.player.commandSlots).toBe(2);
    expect(state.players.player.globalCommands.length).toBe(2);
  });

  it('global slots increase to 3 after Tier 1 research completes', () => {
    const state = buildState();
    addTechLab(state, -7, 0);
    queue(state, { type: 'research' });
    // 3 epochs to complete
    resolveEpoch(state); state.phase = 'planning';
    resolveEpoch(state); state.phase = 'planning';
    resolveEpoch(state);
    expect(state.players.player.commandSlots).toBe(3);
    expect(state.players.player.globalCommands.length).toBe(3);
  });
});

describe('Tech Tree — unit gating', () => {
  it('cannot train phase_walker at Tier 0', () => {
    const state = buildState();
    // Add barracks
    (state.structures as Map<string, unknown>).set('s_barracks', {
      id: 's_barracks',
      owner: 'player',
      type: 'barracks',
      hex: { q: -8, r: 0 },
      hp: 40,
      buildProgress: 0,
      assignedDroneId: null,
    });
    state.players.player.resources.cc = 20;
    state.players.player.resources.fx = 10;
    queue(state, { type: 'train', structureId: 's_barracks', unitType: 'phase_walker' });
    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('requires Tech Tier'))).toBe(true);
    // No new phase_walker unit should exist
    const units = [...state.units.values()];
    expect(units.some((u) => u.type === 'phase_walker')).toBe(false);
  });

  it('can train phase_walker at Tier 1 with enough FX', () => {
    const state = buildState();
    (state.structures as Map<string, unknown>).set('s_barracks', {
      id: 's_barracks',
      owner: 'player',
      type: 'barracks',
      hex: { q: -8, r: 0 },
      hp: 40,
      buildProgress: 0,
      assignedDroneId: null,
    });
    state.players.player.techTier = 1;
    state.players.player.resources.cc = 20;
    state.players.player.resources.fx = 5;
    queue(state, { type: 'train', structureId: 's_barracks', unitType: 'phase_walker' });
    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('Phase Walker'))).toBe(true);
    const units = [...state.units.values()];
    expect(units.some((u) => u.type === 'phase_walker')).toBe(true);
    expect(state.players.player.resources.fx).toBe(4); // 5 - 1 FX cost
  });

  it('cannot train phase_walker without enough FX', () => {
    const state = buildState();
    (state.structures as Map<string, unknown>).set('s_barracks', {
      id: 's_barracks',
      owner: 'player',
      type: 'barracks',
      hex: { q: -8, r: 0 },
      hp: 40,
      buildProgress: 0,
      assignedDroneId: null,
    });
    state.players.player.techTier = 1;
    state.players.player.resources.cc = 20;
    state.players.player.resources.fx = 0; // Not enough FX
    queue(state, { type: 'train', structureId: 's_barracks', unitType: 'phase_walker' });
    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('insufficient FX'))).toBe(true);
    const units = [...state.units.values()];
    expect(units.some((u) => u.type === 'phase_walker')).toBe(false);
  });
});

describe('Tech Tree — structure gating', () => {
  it('cannot build flux_conduit at Tier 0', () => {
    const state = buildState();
    // Add a flux vent next to player start for adjacency
    const ventHex = { q: -8, r: 1 };
    const ventCell = state.map.cells.get(`${ventHex.q},${ventHex.r}`);
    if (ventCell) ventCell.terrain = 'flux_vent';

    state.players.player.resources.cc = 20;
    queue(state, { type: 'build', targetHex: { q: -7, r: 1 }, structureType: 'flux_conduit' });
    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('requires Tech Tier 1'))).toBe(true);
    const structs = [...state.structures.values()];
    expect(structs.some((s) => s.type === 'flux_conduit')).toBe(false);
  });

  it('can build flux_conduit at Tier 1 adjacent to flux vent', () => {
    const state = buildState();
    // Place a flux vent
    const ventHex = { q: -8, r: 1 };
    const ventCell = state.map.cells.get(`${ventHex.q},${ventHex.r}`);
    if (!ventCell) return; // skip if off map

    ventCell.terrain = 'flux_vent';
    ventCell.fog = 'visible';

    state.players.player.techTier = 1;
    state.players.player.resources.cc = 20;

    // Build on adjacent hex
    const buildHex = { q: -7, r: 1 };
    const buildCell = state.map.cells.get(`${buildHex.q},${buildHex.r}`);
    if (buildCell) buildCell.fog = 'visible';

    queue(state, { type: 'build', targetHex: buildHex, structureType: 'flux_conduit' });
    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('Flux Conduit'))).toBe(true);
  });

  it('cannot build flux_conduit away from flux vent', () => {
    const state = buildState();
    state.players.player.techTier = 1;
    state.players.player.resources.cc = 20;
    // No flux vent nearby; build on a random open hex
    queue(state, { type: 'build', targetHex: { q: -5, r: -3 }, structureType: 'flux_conduit' });
    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('must be on or adjacent to a Flux Vent'))).toBe(true);
  });
});

describe('Flux Conduit — FX harvesting', () => {
  it('staffed flux conduit yields FX each epoch', () => {
    const state = buildState();
    // Place a completed Flux Conduit
    const conduitHex = { q: -7, r: 0 };
    (state.structures as Map<string, unknown>).set('s_conduit', {
      id: 's_conduit',
      owner: 'player',
      type: 'flux_conduit',
      hex: conduitHex,
      hp: 25,
      buildProgress: 0,
      assignedDroneId: null,
    });

    // Get the player drone and assign it via gather command
    const playerDrone = [...state.units.values()].find(
      (u) => u.owner === 'player' && u.type === 'drone',
    )!;
    playerDrone.hex = conduitHex; // Place drone on conduit

    queue(state, {
      type: 'gather',
      unitId: playerDrone.id,
      targetHex: conduitHex,
    });

    const initialFX = state.players.player.resources.fx;
    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('Flux Conduit yields'))).toBe(true);
    expect(state.players.player.resources.fx).toBe(initialFX + 2);
  });
});

describe('UnitDef — new unit specs', () => {
  it('phase_walker has correct stats', () => {
    const def = UNIT_DEFS.phase_walker;
    expect(def.costCC).toBe(6);
    expect(def.costFX).toBe(1);
    expect(def.techTierRequired).toBe(1);
    expect(def.maxHp).toBe(30);
    expect(def.speed).toBe(3);
  });

  it('temporal_warden has correct stats', () => {
    const def = UNIT_DEFS.temporal_warden;
    expect(def.costCC).toBe(5);
    expect(def.costFX).toBe(2);
    expect(def.techTierRequired).toBe(1);
    expect(def.maxHp).toBe(35);
    expect(def.visionRadius).toBe(4);
  });
});
