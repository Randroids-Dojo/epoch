/**
 * Cinematic action-sequence camera choreography.
 *
 * Builds an ordered list of "beats" — points of interest the camera should
 * zoom to during execution animation. The existing phase-based animation
 * timing is preserved; the camera simply pans/zooms to highlight individual
 * events within each phase, giving a sequential "spotlight" feel.
 *
 * Pure TS (no React).
 */

import {
  ExecutionAnimation,
  AnimPhase,
  PHASE_DEFEND,
  PHASE_MOVE,
  PHASE_ATTACK,
  PHASE_BUILD,
  TOTAL_DURATION,
} from './animation';

// ── Beat type ─────────────────────────────────────────────────────────────

export interface ActionBeat {
  /** World-pixel X to center on. */
  worldX: number;
  /** World-pixel Y to center on. */
  worldY: number;
  /** Target zoom level (higher = closer). */
  zoom: number;
  /** Seconds from animation start when this beat begins. */
  startTime: number;
  /** How long this beat holds focus (seconds). */
  holdTime: number;
  /** Human-readable label for the event (shown in overlay). */
  label: string;
  /** Which animation phase this beat belongs to. */
  phase: AnimPhase;
}

// ── Transition timing ─────────────────────────────────────────────────────

/** Seconds reserved for the camera to travel between beats. */
const TRANSITION_TIME = 0.35;

/** Minimum hold time per beat. */
const MIN_HOLD = 0.4;

/** Zoom level for close-up action beats. */
const ACTION_ZOOM = 2.2;

/** Zoom level for movement tracking (slightly wider). */
const MOVE_ZOOM = 1.8;

/** Zoom level for the wide establishing shot at the very end. */
const OUTRO_ZOOM = 1.0;

// ── Helpers ───────────────────────────────────────────────────────────────

function centroid(points: { x: number; y: number }[]): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const p of points) { sx += p.x; sy += p.y; }
  return { x: sx / points.length, y: sy / points.length };
}

/** Group nearby world positions into clusters (simple grid bucketing). */
function clusterPositions(
  items: { x: number; y: number; weight: number; label: string }[],
  bucketSize: number = 120,
): { x: number; y: number; weight: number; label: string }[] {
  const buckets = new Map<string, { items: typeof items; totalWeight: number }>();

  for (const item of items) {
    const bx = Math.round(item.x / bucketSize);
    const by = Math.round(item.y / bucketSize);
    const key = `${bx},${by}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { items: [], totalWeight: 0 }; buckets.set(key, bucket); }
    bucket.items.push(item);
    bucket.totalWeight += item.weight;
  }

  const clusters: { x: number; y: number; weight: number; label: string }[] = [];
  for (const bucket of buckets.values()) {
    const c = centroid(bucket.items);
    // Pick the label from the heaviest item in the cluster.
    const best = bucket.items.reduce((a, b) => a.weight >= b.weight ? a : b);
    const label = bucket.items.length > 1
      ? `${best.label} (+${bucket.items.length - 1} more)`
      : best.label;
    clusters.push({ x: c.x, y: c.y, weight: bucket.totalWeight, label });
  }

  // Sort by weight descending so the most interesting cluster comes first.
  clusters.sort((a, b) => b.weight - a.weight);
  return clusters;
}

/** Distribute N beats evenly within a phase, respecting transition time. */
function distributeBeats(
  clusters: { x: number; y: number; label: string }[],
  phase: AnimPhase,
  phaseStart: number,
  phaseDur: number,
  zoom: number,
  maxBeats: number = 4,
): ActionBeat[] {
  const items = clusters.slice(0, maxBeats);
  if (items.length === 0) return [];

  // Total available = phaseDur. Each beat needs TRANSITION_TIME + holdTime.
  const totalTransitions = items.length * TRANSITION_TIME;
  const holdBudget = Math.max(0, phaseDur - totalTransitions);
  const holdPerBeat = Math.max(MIN_HOLD, holdBudget / items.length);

  const beats: ActionBeat[] = [];
  let t = phaseStart;

  for (const item of items) {
    beats.push({
      worldX: item.x,
      worldY: item.y,
      zoom,
      startTime: t + TRANSITION_TIME,
      holdTime: holdPerBeat,
      label: item.label,
      phase,
    });
    t += TRANSITION_TIME + holdPerBeat;
  }

  return beats;
}

// ── Unit type display names ───────────────────────────────────────────────

const UNIT_NAMES: Record<string, string> = {
  drone: 'Drone',
  pulse_sentry: 'Pulse Sentry',
  arc_ranger: 'Arc Ranger',
  phase_walker: 'Phase Walker',
  temporal_warden: 'Temporal Warden',
  void_striker: 'Void Striker',
  flux_weaver: 'Flux Weaver',
  chrono_titan: 'Chrono Titan',
};

const STRUCT_NAMES: Record<string, string> = {
  command_nexus: 'Command Nexus',
  crystal_extractor: 'Crystal Extractor',
  barracks: 'Barracks',
  tech_lab: 'Tech Lab',
  watchtower: 'Watchtower',
  flux_conduit: 'Flux Conduit',
  war_foundry: 'War Foundry',
  shield_pylon: 'Shield Pylon',
  chrono_spire: 'Chrono Spire',
};

function unitName(type: string): string {
  return UNIT_NAMES[type] ?? type;
}

function structName(type: string): string {
  return STRUCT_NAMES[type] ?? type;
}

// ── Sequence builder ──────────────────────────────────────────────────────

export function buildActionSequence(anim: ExecutionAnimation): ActionBeat[] {
  const beats: ActionBeat[] = [];

  // ── 1. DEFEND phase ─────────────────────────────────────────────────────
  const defenders: { x: number; y: number; weight: number; label: string }[] = [];
  for (const u of anim.units.values()) {
    if (u.isDefending) {
      defenders.push({
        x: u.fromPixel.x, y: u.fromPixel.y,
        weight: 2,
        label: `${unitName(u.unitType)} defends`,
      });
    }
  }
  // Also show merge events during defend phase.
  for (const u of anim.mergedUnits) {
    if (u.mergeSurvivorPixel) {
      defenders.push({
        x: u.mergeSurvivorPixel.x, y: u.mergeSurvivorPixel.y,
        weight: 3,
        label: `${unitName(u.unitType)} merges`,
      });
    }
  }
  if (defenders.length > 0) {
    const clusters = clusterPositions(defenders);
    beats.push(...distributeBeats(clusters, 'defend', PHASE_DEFEND.start, PHASE_DEFEND.dur, ACTION_ZOOM, 2));
  }

  // ── 2. MOVE phase ──────────────────────────────────────────────────────
  const movers: { x: number; y: number; weight: number; label: string }[] = [];
  for (const u of anim.units.values()) {
    const dx = u.toPixel.x - u.fromPixel.x;
    const dy = u.toPixel.y - u.fromPixel.y;
    if (dx * dx + dy * dy > 1) {
      // Use midpoint of movement as focus point.
      movers.push({
        x: (u.fromPixel.x + u.toPixel.x) / 2,
        y: (u.fromPixel.y + u.toPixel.y) / 2,
        weight: u.owner === 'player' ? 3 : 1,
        label: `${unitName(u.unitType)} moves`,
      });
    }
  }
  if (movers.length > 0) {
    const clusters = clusterPositions(movers);
    beats.push(...distributeBeats(clusters, 'move', PHASE_MOVE.start, PHASE_MOVE.dur, MOVE_ZOOM, 4));
  }

  // ── 3. ATTACK phase ────────────────────────────────────────────────────
  const combatPoints: { x: number; y: number; weight: number; label: string }[] = [];

  // Units that took damage.
  for (const u of anim.units.values()) {
    if (u.newHp < u.oldHp) {
      combatPoints.push({
        x: u.toPixel.x, y: u.toPixel.y,
        weight: 3,
        label: `${unitName(u.unitType)} takes damage`,
      });
    }
  }

  // Destroyed units (high weight — dramatic!).
  for (const u of anim.destroyedUnits) {
    combatPoints.push({
      x: u.fromPixel.x, y: u.fromPixel.y,
      weight: 5,
      label: `${unitName(u.unitType)} destroyed!`,
    });
  }

  // Damaged structures.
  for (const s of anim.structures.values()) {
    if (s.wasDamaged) {
      combatPoints.push({
        x: s.pixel.x, y: s.pixel.y,
        weight: 4,
        label: `${structName(s.structureType)} under attack!`,
      });
    }
  }

  // Destroyed structures.
  for (const s of anim.destroyedStructures) {
    combatPoints.push({
      x: s.pixel.x, y: s.pixel.y,
      weight: 6,
      label: `${structName(s.structureType)} destroyed!`,
    });
  }

  if (combatPoints.length > 0) {
    const clusters = clusterPositions(combatPoints);
    beats.push(...distributeBeats(clusters, 'attack', PHASE_ATTACK.start, PHASE_ATTACK.dur, ACTION_ZOOM, 4));
  }

  // ── 4. BUILD phase ─────────────────────────────────────────────────────
  const buildPoints: { x: number; y: number; weight: number; label: string }[] = [];

  // Newly completed structures.
  for (const s of anim.structures.values()) {
    if (s.wasBuilt) {
      buildPoints.push({
        x: s.pixel.x, y: s.pixel.y,
        weight: 3,
        label: `${structName(s.structureType)} completed`,
      });
    }
  }

  // Spawned units.
  for (const u of anim.units.values()) {
    if (u.wasSpawned) {
      buildPoints.push({
        x: u.toPixel.x, y: u.toPixel.y,
        weight: 2,
        label: `${unitName(u.unitType)} trained`,
      });
    }
  }

  if (buildPoints.length > 0) {
    const clusters = clusterPositions(buildPoints);
    beats.push(...distributeBeats(clusters, 'build', PHASE_BUILD.start, PHASE_BUILD.dur, ACTION_ZOOM, 3));
  }

  return beats;
}

// ── Camera target interpolation ───────────────────────────────────────────

export interface CameraTarget {
  worldX: number;
  worldY: number;
  zoom: number;
  /** The label of the currently active beat (empty string if transitioning). */
  label: string;
  /** 0-1 progress through the current beat's hold time. */
  beatProgress: number;
}

/** Ease-in-out cubic for smooth camera transitions. */
function easeInOut(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Given the action beats and current elapsed time, returns where the camera
 * should be pointing. Returns null if there are no beats (camera should stay
 * where user left it).
 */
export function getSequenceCameraTarget(
  beats: ActionBeat[],
  elapsed: number,
): CameraTarget | null {
  if (beats.length === 0) return null;

  // Find which beat we're in or transitioning toward.
  // Before the first beat: ease toward it.
  // After the last beat: hold or zoom out.

  const first = beats[0];
  const last = beats[beats.length - 1];
  const lastEnd = last.startTime + last.holdTime;

  // Before first beat starts: transition from wherever we are toward first beat.
  if (elapsed < first.startTime) {
    const t = Math.max(0, elapsed / Math.max(first.startTime, 0.01));
    return {
      worldX: first.worldX,
      worldY: first.worldY,
      zoom: 1.0 + (first.zoom - 1.0) * easeInOut(t),
      label: '',
      beatProgress: 0,
    };
  }

  // After last beat: zoom out toward OUTRO.
  if (elapsed >= lastEnd) {
    const outroStart = lastEnd;
    const outroDur = Math.min(0.6, TOTAL_DURATION - lastEnd);
    if (outroDur <= 0) {
      return {
        worldX: last.worldX,
        worldY: last.worldY,
        zoom: OUTRO_ZOOM,
        label: '',
        beatProgress: 1,
      };
    }
    const t = Math.min(1, (elapsed - outroStart) / outroDur);
    return {
      worldX: last.worldX,
      worldY: last.worldY,
      zoom: last.zoom + (OUTRO_ZOOM - last.zoom) * easeInOut(t),
      label: '',
      beatProgress: 1,
    };
  }

  // Find active beat or transition.
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const beatEnd = beat.startTime + beat.holdTime;

    // Currently within this beat's hold window.
    if (elapsed >= beat.startTime && elapsed < beatEnd) {
      return {
        worldX: beat.worldX,
        worldY: beat.worldY,
        zoom: beat.zoom,
        label: beat.label,
        beatProgress: (elapsed - beat.startTime) / beat.holdTime,
      };
    }

    // In the transition gap between this beat and the next.
    if (i < beats.length - 1) {
      const next = beats[i + 1];
      if (elapsed >= beatEnd && elapsed < next.startTime) {
        const transT = (elapsed - beatEnd) / Math.max(next.startTime - beatEnd, 0.01);
        const e = easeInOut(Math.min(1, transT));
        return {
          worldX: beat.worldX + (next.worldX - beat.worldX) * e,
          worldY: beat.worldY + (next.worldY - beat.worldY) * e,
          zoom: beat.zoom + (next.zoom - beat.zoom) * e,
          label: '',
          beatProgress: 0,
        };
      }
    }
  }

  // Fallback (shouldn't reach here).
  return {
    worldX: last.worldX,
    worldY: last.worldY,
    zoom: last.zoom,
    label: '',
    beatProgress: 1,
  };
}
