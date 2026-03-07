/**
 * Simulation utilities for Timeline Fork and Chrono Scout temporal abilities.
 *
 * Timeline Fork: deep-copies the live game state, runs a full epoch resolution
 * with AI-generated commands, and returns predicted ghost positions for player units.
 *
 * Chrono Scout: scans AI unit positions (bypassing fog) and returns predicted
 * locations with ~75% accuracy — some hexes may be off by 1.
 */

import { Hex, hexKey, hexNeighbors } from './hex';
import { GameState, PlayerState, ChronoSnapshot, AnchorSnapshot } from './state';
import { Unit } from './units';
import { Structure } from './structures';
import { UnitCommand, GlobalCommand } from './commands';
import { resolveEpoch } from './resolution';
import { generateAICommands } from './ai';

// ── Result types ──────────────────────────────────────────────────────────────

export interface TimelineForkResult {
  /** Predicted positions of player units after simulated resolution. */
  ghostUnitPositions: Map<string, { hex: Hex; survived: boolean }>;
  /** Epoch this result was computed for (used to expire the overlay). */
  forEpoch: number;
}

export interface ChronoScoutPrediction {
  hex: Hex;
  unitType: string;
  /** 1.0 = accurate; 0.55 = shifted by 1 hex (uncertain). */
  certainty: number;
}

export interface ChronoScoutResult {
  predictedPositions: ChronoScoutPrediction[];
  forEpoch: number;
}

// ── Deep copy ─────────────────────────────────────────────────────────────────

function copyUnit(u: Unit): Unit {
  return { ...u, hex: { ...u.hex } };
}

function copyStructure(s: Structure): Structure {
  return { ...s, hex: { ...s.hex } };
}

function copyAnchor(a: AnchorSnapshot): AnchorSnapshot {
  return {
    epochsLeft: a.epochsLeft,
    unitSnapshots: new Map(
      [...a.unitSnapshots].map(([k, v]: [string, ChronoSnapshot]) => [k, { ...v, hex: { ...v.hex } }]),
    ),
  };
}

function copyPlayer(p: PlayerState): PlayerState {
  return {
    ...p,
    resources: { ...p.resources },
    unitOrders: new Map(p.unitOrders) as Map<string, UnitCommand>,
    globalCommands: [...p.globalCommands] as Array<GlobalCommand | null>,
    temporalEpochCounts: [...p.temporalEpochCounts],
    epochAnchor: p.epochAnchor ? copyAnchor(p.epochAnchor) : null,
  };
}

/**
 * Shallow-deep copy of GameState sufficient for a single-epoch simulation.
 * The map is shared (not mutated by resolution). Everything else is cloned.
 */
export function deepCopyState(state: GameState): GameState {
  const units = new Map<string, Unit>();
  for (const [id, u] of state.units) units.set(id, copyUnit(u));

  const structures = new Map<string, Structure>();
  for (const [id, s] of state.structures) structures.set(id, copyStructure(s));

  const unitHistory = state.unitHistory.map(
    (snap) => new Map([...snap].map(([k, v]: [string, ChronoSnapshot]) => [k, { ...v, hex: { ...v.hex } }])),
  );

  return {
    map: state.map, // shared — not mutated during resolution
    phase: state.phase,
    epoch: state.epoch,
    winner: state.winner,
    eventLog: [],
    prevEpochCommands: {
      player: [...state.prevEpochCommands.player],
      ai: [...state.prevEpochCommands.ai],
    },
    unitHistory,
    aiConfig: {
      difficulty: state.aiConfig.difficulty,
      archetypeBlend: { ...state.aiConfig.archetypeBlend },
      playerCommandHistory: state.aiConfig.playerCommandHistory.map((h) => ({ ...h })),
    },
    units,
    structures,
    players: {
      player: copyPlayer(state.players.player),
      ai: copyPlayer(state.players.ai),
    },
  };
}

// ── Timeline Fork ─────────────────────────────────────────────────────────────

/**
 * Run a dry-run epoch simulation for Timeline Fork.
 * The fork command itself is stripped from the player's queue on the copy
 * to prevent it from being counted twice.
 * TE is NOT deducted here — resolution handles it in stepTemporal.
 */
export function runTimelineForkSimulation(liveState: GameState): TimelineForkResult {
  const sim = deepCopyState(liveState);

  // Strip the fork command from the simulation copy so resolution doesn't re-process it.
  sim.players.player.globalCommands = sim.players.player.globalCommands.map(
    (c) => (c?.type === 'timeline_fork' ? null : c),
  );

  // AI generates its commands based on the copied state.
  generateAICommands(sim);

  // Run one full epoch of resolution on the copy.
  resolveEpoch(sim);

  // Build ghost map: for each player unit in the live state, record predicted position.
  const ghostUnitPositions = new Map<string, { hex: Hex; survived: boolean }>();
  for (const [id, unit] of liveState.units) {
    if (unit.owner !== 'player') continue;
    const simUnit = sim.units.get(id);
    if (simUnit) {
      ghostUnitPositions.set(id, { hex: simUnit.hex, survived: true });
    } else {
      ghostUnitPositions.set(id, { hex: unit.hex, survived: false });
    }
  }

  return { ghostUnitPositions, forEpoch: liveState.epoch };
}

// ── Chrono Scout ──────────────────────────────────────────────────────────────

/**
 * Compute Chrono Scout prediction: all AI unit positions with ~75% accuracy.
 * 25% of units have their predicted hex shifted by 1 (shown as uncertain clouds).
 * Deterministically seeded per unit per epoch for stable rendering.
 * Does NOT filter by fog — Chrono Scout bypasses fog of war.
 */
export function computeChronoScout(state: GameState): ChronoScoutResult {
  const predictedPositions: ChronoScoutPrediction[] = [];

  for (const unit of state.units.values()) {
    if (unit.owner !== 'ai') continue;

    // Deterministic pseudo-random: epoch × prime + last char of unit id.
    const charCode = unit.id.charCodeAt(unit.id.length - 1);
    const seed = (state.epoch * 31 + charCode) % 100;
    const accurate = seed < 75;

    let predictedHex: Hex = unit.hex;
    let certainty = 1.0;

    if (!accurate) {
      const neighbors = hexNeighbors(unit.hex);
      const nb = neighbors[seed % neighbors.length];
      if (state.map.cells.has(hexKey(nb))) {
        predictedHex = nb;
      }
      certainty = 0.55;
    }

    predictedPositions.push({ hex: predictedHex, unitType: unit.type, certainty });
  }

  return { predictedPositions, forEpoch: state.epoch };
}
