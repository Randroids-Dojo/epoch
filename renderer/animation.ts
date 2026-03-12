/**
 * Execution-phase animation — types, timeline builder, and interpolation.
 *
 * Pure TS (no React). Builds an animation timeline by diffing pre- and
 * post-resolution state, then provides per-frame interpolation helpers.
 */

import { Hex, hexToPixel } from '../engine/hex';
import { GameState } from '../engine/state';
import { PlayerId } from '../engine/player';
import { UnitType, UNIT_DEFS, effectiveMaxHp } from '../engine/units';
import { StructureType, STRUCTURE_DEFS } from '../engine/structures';
import { BASE_HEX_SIZE } from './drawHex';

// ── Snapshot types (captured before resolution) ────────────────────────────

export interface UnitSnapshot {
  hex: Hex;
  hp: number;
  owner: PlayerId;
  type: UnitType;
  isDefending?: boolean;
  mergeCount?: number;
  bonusMaxHp?: number;
}

export interface StructSnapshot {
  hex: Hex;
  hp: number;
  owner: PlayerId;
  type: StructureType;
}

// ── Animation data ─────────────────────────────────────────────────────────

export interface UnitAnim {
  unitId: string;
  owner: PlayerId;
  unitType: UnitType;
  fromPixel: { x: number; y: number };
  toPixel: { x: number; y: number };
  oldHp: number;
  newHp: number; // -1 if destroyed
  maxHp: number;
  wasDestroyed: boolean;
  wasSpawned: boolean;
  isDefending: boolean;
  /** True if this unit was consumed by a merge (animates toward survivor then fades). */
  wasMergeConsumed: boolean;
  /** Pixel position of the merge survivor this unit is being pulled toward. */
  mergeSurvivorPixel?: { x: number; y: number };
  /** Current merge count of the surviving unit (for badge display during anim). */
  mergeCount: number;
}

export interface StructAnim {
  structureId: string;
  owner: PlayerId;
  structureType: StructureType;
  pixel: { x: number; y: number };
  oldHp: number;
  newHp: number;
  maxHp: number;
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

export const PHASE_DEFEND: PhaseConfig = { name: 'defend', start: 0,   dur: 1.0 };
export const PHASE_MOVE:   PhaseConfig = { name: 'move',   start: 1.0, dur: 3.5 };
export const PHASE_ATTACK: PhaseConfig = { name: 'attack', start: 4.5, dur: 2.5 };
export const PHASE_BUILD:  PhaseConfig = { name: 'build',  start: 7.0, dur: 1.5 };

export const PHASES: readonly PhaseConfig[] = [
  PHASE_DEFEND, PHASE_MOVE, PHASE_ATTACK, PHASE_BUILD,
];

export const TOTAL_DURATION = 8.5;

// ── ExecutionAnimation ─────────────────────────────────────────────────────

export interface ExecutionAnimation {
  units: Map<string, UnitAnim>;
  structures: Map<string, StructAnim>;
  destroyedUnits: UnitAnim[];
  destroyedStructures: StructAnim[];
  /** Units consumed by merge — animate pulling toward survivor then fading. */
  mergedUnits: UnitAnim[];
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
  const mergedUnits: UnitAnim[] = [];

  // Detect merge survivors: units whose mergeCount increased.
  // Build a map from (owner, type) → survivor pixel for merge animations.
  const mergeSurvivorPixels = new Map<string, { x: number; y: number }>();
  for (const [id, unit] of newState.units) {
    const snap = unitSnaps.get(id);
    if (snap && (unit.mergeCount > (snap.mergeCount ?? 0))) {
      const key = `${unit.owner}:${unit.type}`;
      mergeSurvivorPixels.set(key, hexToPixel(unit.hex, BASE_HEX_SIZE));
    }
  }

  // Units that existed before resolution.
  for (const [id, snap] of unitSnaps) {
    const newUnit = newState.units.get(id);
    const fromPixel = hexToPixel(snap.hex, BASE_HEX_SIZE);
    const destroyed = !newUnit;
    const toPixel = destroyed
      ? fromPixel
      : hexToPixel(newUnit.hex, BASE_HEX_SIZE);

    // Check if this was merge-consumed (destroyed + a same-type survivor gained mergeCount).
    const mergeKey = `${snap.owner}:${snap.type}`;
    const survivorPixel = destroyed ? mergeSurvivorPixels.get(mergeKey) : undefined;
    const wasMergeConsumed = destroyed && survivorPixel !== undefined;

    const maxHp = destroyed
      ? UNIT_DEFS[snap.type].maxHp + (snap.bonusMaxHp ?? 0)
      : effectiveMaxHp(newUnit);

    const anim: UnitAnim = {
      unitId: id,
      owner: snap.owner,
      unitType: snap.type,
      fromPixel,
      toPixel: wasMergeConsumed ? survivorPixel : toPixel,
      oldHp: snap.hp,
      newHp: destroyed ? -1 : newUnit.hp,
      maxHp,
      wasDestroyed: destroyed && !wasMergeConsumed,
      wasSpawned: false,
      isDefending: destroyed ? false : newUnit.isDefending,
      wasMergeConsumed,
      mergeSurvivorPixel: survivorPixel,
      mergeCount: destroyed ? (snap.mergeCount ?? 0) : newUnit.mergeCount,
    };

    if (wasMergeConsumed) {
      mergedUnits.push(anim);
    } else if (destroyed) {
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
      unitType: unit.type,
      fromPixel: pixel,
      toPixel: pixel,
      oldHp: 0,
      newHp: unit.hp,
      maxHp: effectiveMaxHp(unit),
      wasDestroyed: false,
      wasSpawned: true,
      isDefending: false,
      wasMergeConsumed: false,
      mergeCount: unit.mergeCount,
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
      structureType: snap.type,
      pixel,
      oldHp: snap.hp,
      newHp: destroyed ? -1 : newStruct.hp,
      maxHp: STRUCTURE_DEFS[snap.type].maxHp,
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
      structureType: s.type,
      pixel,
      oldHp: 0,
      newHp: s.hp,
      maxHp: STRUCTURE_DEFS[s.type].maxHp,
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
    mergedUnits,
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
  if (entry.includes('defending') || entry.includes('merged')) return 'defend';
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
