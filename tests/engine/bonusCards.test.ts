import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldOfferBonusCard,
  drawBonusCard,
  applyBonusCard,
  BONUS_CARDS,
} from '@/engine/bonusCards';
import { createInitialState, resetIdSeq, GameState } from '@/engine/state';

describe('shouldOfferBonusCard', () => {
  it('returns false for epochs before 4', () => {
    expect(shouldOfferBonusCard(1)).toBe(false);
    expect(shouldOfferBonusCard(2)).toBe(false);
    expect(shouldOfferBonusCard(3)).toBe(false);
  });

  it('returns true for epoch 4', () => {
    expect(shouldOfferBonusCard(4)).toBe(true);
  });

  it('returns true every 4 epochs', () => {
    expect(shouldOfferBonusCard(8)).toBe(true);
    expect(shouldOfferBonusCard(12)).toBe(true);
    expect(shouldOfferBonusCard(16)).toBe(true);
  });

  it('returns false for non-interval epochs', () => {
    expect(shouldOfferBonusCard(5)).toBe(false);
    expect(shouldOfferBonusCard(6)).toBe(false);
    expect(shouldOfferBonusCard(7)).toBe(false);
    expect(shouldOfferBonusCard(9)).toBe(false);
  });
});

describe('drawBonusCard', () => {
  it('returns a valid card definition', () => {
    const pending = drawBonusCard(4);
    expect(pending.epoch).toBe(4);
    expect(pending.card.id).toBeDefined();
    expect(BONUS_CARDS[pending.card.id]).toBeDefined();
  });

  it('returns different cards for different epochs', () => {
    const card4 = drawBonusCard(4);
    const card8 = drawBonusCard(8);
    // Different epochs should pick different cards (they cycle)
    expect(card4.card.id).not.toBe(card8.card.id);
  });
});

describe('applyBonusCard', () => {
  let state: GameState;

  beforeEach(() => {
    resetIdSeq();
    state = createInitialState(42);
  });

  it('temporal_surge left gives +2 TE', () => {
    const before = state.players.player.resources.te;
    const msg = applyBonusCard(state, 'temporal_surge', 'left');
    expect(state.players.player.resources.te).toBe(before + 2);
    expect(msg).toContain('Temporal Energy');
  });

  it('temporal_surge right gives +1 command slot', () => {
    const before = state.players.player.commandSlots;
    const msg = applyBonusCard(state, 'temporal_surge', 'right');
    expect(state.players.player.commandSlots).toBe(before + 1);
    expect(state.players.player.globalCommands.length).toBe(before + 1);
    expect(msg).toContain('Command Slot');
  });

  it('crystal_windfall left gives +8 CC', () => {
    const before = state.players.player.resources.cc;
    applyBonusCard(state, 'crystal_windfall', 'left');
    expect(state.players.player.resources.cc).toBe(before + 8);
  });

  it('crystal_windfall right gives +4 FX', () => {
    const before = state.players.player.resources.fx;
    applyBonusCard(state, 'crystal_windfall', 'right');
    expect(state.players.player.resources.fx).toBe(before + 4);
  });

  it('drone_swarm left spawns drones', () => {
    const beforeCount = [...state.units.values()].filter(
      (u) => u.owner === 'player' && u.type === 'drone',
    ).length;
    applyBonusCard(state, 'drone_swarm', 'left');
    const afterCount = [...state.units.values()].filter(
      (u) => u.owner === 'player' && u.type === 'drone',
    ).length;
    expect(afterCount).toBe(beforeCount + 2);
  });

  it('drone_swarm right buffs drone HP', () => {
    const drone = [...state.units.values()].find(
      (u) => u.owner === 'player' && u.type === 'drone',
    )!;
    const hpBefore = drone.hp;
    applyBonusCard(state, 'drone_swarm', 'right');
    expect(drone.hp).toBe(hpBefore + 5);
    expect(drone.bonusMaxHp).toBe(5);
  });

  it('phase_rift left gives all player units a damage shield', () => {
    applyBonusCard(state, 'phase_rift', 'left');
    for (const u of state.units.values()) {
      if (u.owner === 'player') {
        expect(u.damageShield).toBe(true);
      }
    }
  });

  it('chrono_harvest right gives +5 CC, +2 FX, +1 TE', () => {
    const r = state.players.player.resources;
    const cc = r.cc, fx = r.fx, te = r.te;
    applyBonusCard(state, 'chrono_harvest', 'right');
    expect(r.cc).toBe(cc + 5);
    expect(r.fx).toBe(fx + 2);
    expect(r.te).toBe(te + 1);
  });
});
