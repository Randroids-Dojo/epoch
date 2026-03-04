import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, resetIdSeq } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
import { queueCommand } from './helpers';

beforeEach(() => resetIdSeq());

function runPlanningEpoch(state: ReturnType<typeof createInitialState>) {
  state.phase = 'planning';
  return resolveEpoch(state);
}

describe('Paradox Risk — temporal instability', () => {
  it('no instability with 0 temporal abilities', () => {
    const state = createInitialState(1);
    runPlanningEpoch(state);
    expect(state.players.player.instabilityTier).toBe(0);
    expect(state.players.player.instabilityEpochsLeft).toBe(0);
  });

  it('no instability with 1 temporal ability in 1 epoch', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 10;
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    runPlanningEpoch(state);
    expect(state.players.player.instabilityTier).toBe(0);
  });

  it('no instability with 2 temporal abilities in 2 epochs (under threshold)', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 10;

    // Epoch 1: 1 temporal
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    runPlanningEpoch(state);

    // Epoch 2: 1 temporal
    state.players.player.resources.te = 10;
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    runPlanningEpoch(state);

    expect(state.players.player.instabilityTier).toBe(0);
  });

  it('Tier 1 instability: 3+ temporal abilities in 2 consecutive epochs', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 10;
    state.players.player.commandSlots = 8;
    state.players.player.commands = Array(8).fill(null);

    // Epoch 1: 2 temporal abilities
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    queueCommand(state, 'player', 1, { type: 'temporal', ability: 'echo', teCost: 2 });
    runPlanningEpoch(state);

    // Epoch 2: 1 temporal ability (total 2+1=3 in last 2 epochs)
    state.players.player.resources.te = 10;
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    runPlanningEpoch(state);

    expect(state.players.player.instabilityTier).toBe(1);
    expect(state.players.player.instabilityEpochsLeft).toBeGreaterThan(0);
  });

  it('Tier 2 instability: 5+ temporal abilities in 3 consecutive epochs', () => {
    // Use a pattern of 1+1+3 = 5 across 3 epochs.
    // Epoch 1 and 2 each have 1 temporal (last2Sum = 2, below Tier 1 threshold of 3),
    // so no instability triggers yet. Epoch 3 adds 3 more (last3Sum = 5 ≥ 5 → Tier 2
    // check passes before the Tier 1 check, so we land directly on Tier 2).
    const state = createInitialState(1);
    state.players.player.commandSlots = 8;
    state.players.player.commands = Array(8).fill(null);

    // Epoch 1: 1 temporal
    state.players.player.resources.te = 10;
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    runPlanningEpoch(state);
    expect(state.players.player.instabilityTier).toBe(0); // no trigger yet

    // Epoch 2: 1 temporal (counts=[1,1], last2Sum=2 < 3)
    state.players.player.resources.te = 10;
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    runPlanningEpoch(state);
    expect(state.players.player.instabilityTier).toBe(0); // still no trigger

    // Epoch 3: 3 temporals (counts=[1,1,3], last3Sum=5 ≥ 5 → Tier 2)
    state.players.player.resources.te = 10;
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    queueCommand(state, 'player', 1, { type: 'temporal', ability: 'echo', teCost: 2 });
    queueCommand(state, 'player', 2, { type: 'temporal', ability: 'echo', teCost: 2 });
    runPlanningEpoch(state);

    expect(state.players.player.instabilityTier).toBe(2);
  });

  it('instability ticks down over epochs', () => {
    const state = createInitialState(1);
    state.players.player.instabilityTier = 1;
    state.players.player.instabilityEpochsLeft = 3;

    runPlanningEpoch(state);
    expect(state.players.player.instabilityEpochsLeft).toBe(2);

    state.phase = 'planning';
    runPlanningEpoch(state);
    expect(state.players.player.instabilityEpochsLeft).toBe(1);

    state.phase = 'planning';
    runPlanningEpoch(state);
    expect(state.players.player.instabilityEpochsLeft).toBe(0);
    expect(state.players.player.instabilityTier).toBe(0);
  });

  it('instability debuff is active for 2 full gameplay epochs after trigger', () => {
    const state = createInitialState(1);
    state.players.player.resources.te = 10;
    state.players.player.commandSlots = 8;
    state.players.player.commands = Array(8).fill(null);

    // Epoch 1: 2 temporals, Epoch 2: 1 temporal → triggers Tier 1
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    queueCommand(state, 'player', 1, { type: 'temporal', ability: 'echo', teCost: 2 });
    runPlanningEpoch(state);

    state.players.player.resources.te = 10;
    queueCommand(state, 'player', 0, { type: 'temporal', ability: 'echo', teCost: 2 });
    runPlanningEpoch(state);

    // After trigger epoch: tier is set, countdown ticked once (3→2)
    expect(state.players.player.instabilityTier).toBe(1);
    expect(state.players.player.instabilityEpochsLeft).toBe(2);

    // Epoch N+1: debuff still active
    state.phase = 'planning';
    runPlanningEpoch(state);
    expect(state.players.player.instabilityTier).toBe(1);
    expect(state.players.player.instabilityEpochsLeft).toBe(1);

    // Epoch N+2: debuff still active (last epoch with penalty)
    state.phase = 'planning';
    runPlanningEpoch(state);
    expect(state.players.player.instabilityTier).toBe(0); // clears at end of N+2
    expect(state.players.player.instabilityEpochsLeft).toBe(0);
  });

  it('temporalEpochCounts rolling window maintains max 3 entries', () => {
    const state = createInitialState(1);
    for (let i = 0; i < 5; i++) {
      state.phase = 'planning';
      runPlanningEpoch(state);
    }
    expect(state.players.player.temporalEpochCounts.length).toBeLessThanOrEqual(3);
  });
});

describe('Epoch Anchor', () => {
  function getPlayerUnit(state: ReturnType<typeof createInitialState>) {
    for (const u of state.units.values()) {
      if (u.owner === 'player') return u;
    }
    return undefined;
  }

  it('sets an anchor when TE is sufficient and tier is 3', () => {
    const state = createInitialState(1);
    state.players.player.techTier = 3;
    state.players.player.resources.te = 10;
    queueCommand(state, 'player', 0, { type: 'epoch_anchor', action: 'set' });

    const log = resolveEpoch(state);

    expect(state.players.player.epochAnchor).not.toBeNull();
    expect(log.some((l) => l.includes('Epoch Anchor set'))).toBe(true);
  });

  it('deducts 5 TE when setting anchor', () => {
    const state = createInitialState(1);
    state.players.player.techTier = 3;
    state.players.player.resources.te = 7;
    queueCommand(state, 'player', 0, { type: 'epoch_anchor', action: 'set' });

    resolveEpoch(state);

    // 7 - 5 + 1 regen = 3
    expect(state.players.player.resources.te).toBe(3);
  });

  it('fails to set anchor if below tech tier 3', () => {
    const state = createInitialState(1);
    state.players.player.techTier = 2;
    state.players.player.resources.te = 10;
    queueCommand(state, 'player', 0, { type: 'epoch_anchor', action: 'set' });

    const log = resolveEpoch(state);

    expect(state.players.player.epochAnchor).toBeNull();
    expect(log.some((l) => l.includes('Epoch Anchor failed'))).toBe(true);
  });

  it('fails to set anchor with insufficient TE', () => {
    const state = createInitialState(1);
    state.players.player.techTier = 3;
    state.players.player.resources.te = 4; // EPOCH_ANCHOR_SET_COST = 5
    queueCommand(state, 'player', 0, { type: 'epoch_anchor', action: 'set' });

    const log = resolveEpoch(state);

    expect(state.players.player.epochAnchor).toBeNull();
    expect(log.some((l) => l.includes('failed'))).toBe(true);
  });

  it('activating anchor restores unit positions', () => {
    const state = createInitialState(1);
    state.players.player.techTier = 3;
    state.players.player.resources.te = 10;

    // Set anchor
    queueCommand(state, 'player', 0, { type: 'epoch_anchor', action: 'set' });
    resolveEpoch(state);
    state.phase = 'planning';

    const unit = getPlayerUnit(state)!;
    const anchoredHex = { ...unit.hex };

    // Move unit away
    unit.hex = { q: unit.hex.q + 5, r: unit.hex.r };
    unit.hp = Math.max(1, unit.hp - 20);

    // Activate anchor
    state.players.player.resources.te = 5;
    queueCommand(state, 'player', 0, { type: 'epoch_anchor', action: 'activate' });
    const log = resolveEpoch(state);

    const unitAfter = state.units.get(unit.id);
    expect(unitAfter?.hex).toEqual(anchoredHex);
    expect(log.some((l) => l.includes('Epoch Anchor activated'))).toBe(true);
    // Anchor is consumed after activation
    expect(state.players.player.epochAnchor).toBeNull();
  });

  it('activating anchor deducts 3 TE', () => {
    const state = createInitialState(1);
    state.players.player.techTier = 3;
    state.players.player.resources.te = 10;

    // Manually set anchor
    const unit = getPlayerUnit(state)!;
    const snap = new Map([[unit.id, { hex: { ...unit.hex }, hp: unit.hp }]]);
    state.players.player.epochAnchor = { unitSnapshots: snap, epochsLeft: 5 };

    state.players.player.resources.te = 5;
    queueCommand(state, 'player', 0, { type: 'epoch_anchor', action: 'activate' });
    resolveEpoch(state);

    // 5 - 3 + 1 regen = 3
    expect(state.players.player.resources.te).toBe(3);
  });

  it('fails to activate if no anchor set', () => {
    const state = createInitialState(1);
    state.players.player.techTier = 3;
    state.players.player.resources.te = 10;
    queueCommand(state, 'player', 0, { type: 'epoch_anchor', action: 'activate' });

    const log = resolveEpoch(state);
    expect(log.some((l) => l.includes('failed') && l.includes('anchor'))).toBe(true);
  });

  it('anchor expires after 5 epochs', () => {
    const state = createInitialState(1);
    state.players.player.techTier = 3;
    state.players.player.resources.te = 10;

    queueCommand(state, 'player', 0, { type: 'epoch_anchor', action: 'set' });
    resolveEpoch(state);
    expect(state.players.player.epochAnchor).not.toBeNull();

    // Run 5 more idle epochs
    for (let i = 0; i < 5; i++) {
      state.phase = 'planning';
      resolveEpoch(state);
    }
    expect(state.players.player.epochAnchor).toBeNull();
  });
});

describe('Win conditions', () => {
  it('Temporal Singularity: player wins when tech tier reaches 3', () => {
    const state = createInitialState(1);
    state.players.player.techTier = 3;
    // Need a nexus for both players (created by initial state), just force tech tier
    resolveEpoch(state);
    expect(state.winner).toBe('player');
  });

  it('Resource Dominance: player wins when controlling all crystal nodes for 5 epochs', () => {
    const state = createInitialState(1);

    // Place a player structure on every crystal_node hex
    let sId = 1000;
    for (const [, cell] of state.map.cells) {
      if (cell.terrain === 'crystal_node') {
        state.structures.set(`s${sId}`, {
          id: `s${sId}`,
          owner: 'player',
          type: 'crystal_extractor',
          hex: cell.hex,
          hp: 50,
          buildProgress: 0,
          assignedDroneId: null,
        });
        sId++;
      }
    }

    // We need to remove AI structures from crystal nodes to let player control all
    for (const [id, s] of state.structures) {
      if (s.owner === 'ai') {
        const cell = state.map.cells.get(`${s.hex.q},${s.hex.r}`);
        if (cell?.terrain === 'crystal_node') {
          state.structures.delete(id);
        }
      }
    }

    // Player must maintain control for 5 consecutive epochs
    for (let i = 0; i < 5; i++) {
      state.phase = 'planning';
      resolveEpoch(state);
      if (state.winner) break;
    }

    expect(state.winner).toBe('player');
  });

  it('crystalNodeStreak resets when player loses a crystal node', () => {
    const state = createInitialState(1);
    state.crystalNodeStreak.player = 3; // artificially set streak

    resolveEpoch(state);

    // Player controls no crystal nodes at start, so streak should reset to 0
    expect(state.crystalNodeStreak.player).toBe(0);
  });
});
