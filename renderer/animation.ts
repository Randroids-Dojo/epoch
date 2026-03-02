/**
 * Execution-phase animation — types, timeline builder, and interpolation.
 *
 * Pure TS (no React). Builds an animation timeline by diffing pre- and
 * post-resolution state, then provides per-frame interpolation helpers.
 */

import { Hex, hexToPixel } from '../engine/hex';
import { GameState } from '../engine/state';
import { PlayerId } from '../engine/player';
import { BASE_HEX_SIZE } from './drawHex';

// ── Snapshot types (captured before resolution) ────────────────────────────

export interface UnitSnapshot {
  hex: Hex;
  hp: number;
  owner: PlayerId;
  isDefending?: boolean;
}

export interface StructSnapshot {
  hex: Hex;
  hp: number;
  owner: PlayerId;
}

// ── Animation data ─────────────────────────────────────────────────────────

export interface UnitAnim {
  unitId: string;
  owner: PlayerId;
  fromPixel: { x: number; y: number };
  toPixel: { x: number; y: number };
  oldHp: number;
  newHp: number; // -1 if destroyed
  wasDestroyed: boolean;
  wasSpawned: boolean;
  isDefending: boolean;
}

export interface StructAnim {
  structureId: string;
  owner: PlayerId;
  pixel: { x: number; y: number };
  oldHp: number;
  newHp: number;
  wasDamaged: boolean;
  wasDestroyed: boolean;
  wasBuilt: boolean;
}

// ── Phase timing ───────────────────────────────────────────────────────────

export type AnimPhase = 'defend' | 'move' | 'attack' | 'build';

export interface PhaseConfig {
  name: AnimPhase;
  start: number; // seconds
  dur: number;   // seconds
}

export const PHASE_DEFEND: PhaseConfig = { name: 'defend', start: 0,   dur: 0.5 };
export const PHASE_MOVE:   PhaseConfig = { name: 'move',   start: 0.5, dur: 1.5 };
export const PHASE_ATTACK: PhaseConfig = { name: 'attack', start: 2.0, dur: 1.0 };
export const PHASE_BUILD:  PhaseConfig = { name: 'build',  start: 3.0, dur: 0.5 };

export const PHASES: readonly PhaseConfig[] = [
  PHASE_DEFEND, PHASE_MOVE, PHASE_ATTACK, PHASE_BUILD,
];

export const TOTAL_DURATION = 3.5;

// ── ExecutionAnimation ─────────────────────────────────────────────────────

export interface ExecutionAnimation {
  units: Map<string, UnitAnim>;
  structures: Map<string, StructAnim>;
  destroyedUnits: UnitAnim[];
  destroyedStructures: StructAnim[];
  eventLog: string[];
  startedAt: number; // performance.now()
}

// ── Timeline builder ───────────────────────────────────────────────────────

export function buildAnimationTimeline(
  unitSnaps: Map<string, UnitSnapshot>,
  structSnaps: Map<string, StructSnapshot>,
  newState: GameState,
): ExecutionAnimation {
  const units = new Map<string, UnitAnim>();
  const destroyedUnits: UnitAnim[] = [];

  // Units that existed before resolution.
  for (const [id, snap] of unitSnaps) {
    const newUnit = newState.units.get(id);
    const fromPixel = hexToPixel(snap.hex, BASE_HEX_SIZE);
    const destroyed = !newUnit;
    const toPixel = destroyed
      ? fromPixel
      : hexToPixel(newUnit.hex, BASE_HEX_SIZE);

    const anim: UnitAnim = {
      unitId: id,
      owner: snap.owner,
      fromPixel,
      toPixel,
      oldHp: snap.hp,
      newHp: destroyed ? -1 : newUnit.hp,
      wasDestroyed: destroyed,
      wasSpawned: false,
      isDefending: destroyed ? false : newUnit.isDefending,
    };

    if (destroyed) {
      destroyedUnits.push(anim);
    } else {
      units.set(id, anim);
    }
  }

  // Newly spawned units (exist after but not before).
  for (const [id, unit] of newState.units) {
    if (unitSnaps.has(id)) continue;
    const pixel = hexToPixel(unit.hex, BASE_HEX_SIZE);
    units.set(id, {
      unitId: id,
      owner: unit.owner,
      fromPixel: pixel,
      toPixel: pixel,
      oldHp: 0,
      newHp: unit.hp,
      wasDestroyed: false,
      wasSpawned: true,
      isDefending: false,
    });
  }

  // Structures.
  const structures = new Map<string, StructAnim>();
  const destroyedStructures: StructAnim[] = [];

  for (const [id, snap] of structSnaps) {
    const newStruct = newState.structures.get(id);
    const pixel = hexToPixel(snap.hex, BASE_HEX_SIZE);
    const destroyed = !newStruct;

    const anim: StructAnim = {
      structureId: id,
      owner: snap.owner,
      pixel,
      oldHp: snap.hp,
      newHp: destroyed ? -1 : newStruct.hp,
      wasDamaged: destroyed || newStruct.hp < snap.hp,
      wasDestroyed: destroyed,
      wasBuilt: false,
    };

    if (destroyed) {
      destroyedStructures.push(anim);
    } else {
      structures.set(id, anim);
    }
  }

  for (const [id, s] of newState.structures) {
    if (structSnaps.has(id)) continue;
    const pixel = hexToPixel(s.hex, BASE_HEX_SIZE);
    structures.set(id, {
      structureId: id,
      owner: s.owner,
      pixel,
      oldHp: 0,
      newHp: s.hp,
      wasDamaged: false,
      wasDestroyed: false,
      wasBuilt: true,
    });
  }

  return {
    units,
    structures,
    destroyedUnits,
    destroyedStructures,
    eventLog: newState.eventLog,
    startedAt: performance.now(),
  };
}

// ── Interpolation helpers ──────────────────────────────────────────────────

/** Ease-out quad: decelerates toward the end. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Returns the world-space pixel position for a unit at the given elapsed time. */
export function getAnimatedUnitPosition(
  anim: UnitAnim,
  elapsed: number,
): { x: number; y: number } {
  if (elapsed < PHASE_MOVE.start) return anim.fromPixel;
  if (elapsed >= PHASE_MOVE.start + PHASE_MOVE.dur) return anim.toPixel;

  const t = (elapsed - PHASE_MOVE.start) / PHASE_MOVE.dur;
  const e = easeOut(Math.max(0, Math.min(1, t)));
  return {
    x: anim.fromPixel.x + (anim.toPixel.x - anim.fromPixel.x) * e,
    y: anim.fromPixel.y + (anim.toPixel.y - anim.fromPixel.y) * e,
  };
}

/** Returns which animation phase is active at the given elapsed seconds, or null if done. */
export function getCurrentPhase(elapsed: number): AnimPhase | null {
  for (const phase of PHASES) {
    if (elapsed >= phase.start && elapsed < phase.start + phase.dur) {
      return phase.name;
    }
  }
  return null;
}

/** Returns 0-1 progress within the current phase, or -1 if not in the given phase. */
export function getPhaseProgress(elapsed: number, phase: PhaseConfig): number {
  if (elapsed < phase.start || elapsed >= phase.start + phase.dur) return -1;
  return (elapsed - phase.start) / phase.dur;
}

// ── Log entry categorisation ───────────────────────────────────────────────

const MOVE_ARROW = '\u2192'; // →

export function categorizeLogEntry(entry: string): AnimPhase {
  if (entry.includes('defending')) return 'defend';
  if (entry.includes(MOVE_ARROW) || entry.includes('→')) return 'move';
  if (entry.includes('attacks') || entry.includes('destroyed')) return 'attack';
  return 'build'; // build, train, gather, temporal
}

/** Returns the log entries that should be visible at the given elapsed time. */
export function getVisibleLogEntries(
  eventLog: string[],
  elapsed: number,
): string[] {
  const currentPhase = getCurrentPhase(elapsed);
  if (currentPhase === null) return eventLog; // show all after animation

  const phaseOrder: AnimPhase[] = ['defend', 'move', 'attack', 'build'];
  const currentIdx = phaseOrder.indexOf(currentPhase);

  return eventLog.filter((entry) => {
    const entryPhase = categorizeLogEntry(entry);
    return phaseOrder.indexOf(entryPhase) <= currentIdx;
  });
}
