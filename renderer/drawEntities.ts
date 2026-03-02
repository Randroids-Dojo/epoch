import { Camera } from './camera';
import { BASE_HEX_SIZE } from './drawHex';
import { hexToPixel } from '../engine/hex';
import { Unit } from '../engine/units';
import { Structure } from '../engine/structures';
import { HexCell } from '../engine/map';
import { TERRAIN } from '../engine/terrain';
import {
  ExecutionAnimation,
  getAnimatedUnitPosition, getCurrentPhase, getPhaseProgress,
  PHASE_ATTACK, PHASE_BUILD,
} from './animation';

// Precomputed cos/sin for pointy-top hex corners — same constants as drawHex.ts.
const CORNER_COS = Array.from({ length: 6 }, (_, i) => Math.cos((Math.PI / 180) * (60 * i - 30)));
const CORNER_SIN = Array.from({ length: 6 }, (_, i) => Math.sin((Math.PI / 180) * (60 * i - 30)));

/** Draw all units onto the canvas. Player units are cyan; AI units are coral. */
export function drawUnits(
  ctx: CanvasRenderingContext2D,
  units: Map<string, Unit>,
  cam: Camera,
): void {
  const r = BASE_HEX_SIZE * cam.zoom * 0.32;
  const prevAlpha = ctx.globalAlpha;

  for (const unit of units.values()) {
    const wp = hexToPixel(unit.hex, BASE_HEX_SIZE);
    const sx = cam.x + wp.x * cam.zoom;
    const sy = cam.y + wp.y * cam.zoom;

    ctx.globalAlpha = 0.8;
    ctx.fillStyle = unit.owner === 'player' ? '#00d4ff' : '#ff6b6b';
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = prevAlpha;
}

/** Draw all structures onto the canvas as rotated squares (diamonds). */
export function drawStructures(
  ctx: CanvasRenderingContext2D,
  structures: Map<string, Structure>,
  cam: Camera,
): void {
  const r = BASE_HEX_SIZE * cam.zoom * 0.28;
  const prevAlpha = ctx.globalAlpha;

  for (const s of structures.values()) {
    const wp = hexToPixel(s.hex, BASE_HEX_SIZE);
    const sx = cam.x + wp.x * cam.zoom;
    const sy = cam.y + wp.y * cam.zoom;

    ctx.globalAlpha = 0.8;
    ctx.fillStyle = s.owner === 'player' ? '#00d4ff' : '#ff6b6b';
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }

  ctx.globalAlpha = prevAlpha;
}

/**
 * Draw hex targeting overlay.
 * Eligible hexes: bright cyan tint.
 * Non-eligible passable hexes: dark dimming overlay.
 */
export function drawTargetingOverlay(
  ctx: CanvasRenderingContext2D,
  cells: Map<string, HexCell>,
  eligibleKeys: Set<string>,
  cam: Camera,
): void {
  const size = BASE_HEX_SIZE * cam.zoom;

  for (const [key, cell] of cells) {
    if (cell.fog === 'unexplored') continue;

    const isEligible = eligibleKeys.has(key);
    const isPassable = TERRAIN[cell.terrain].passable;

    if (!isEligible && !isPassable) continue;

    const wp = hexToPixel(cell.hex, BASE_HEX_SIZE);
    const sx = cam.x + wp.x * cam.zoom;
    const sy = cam.y + wp.y * cam.zoom;

    ctx.beginPath();
    ctx.moveTo(sx + size * CORNER_COS[0], sy + size * CORNER_SIN[0]);
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(sx + size * CORNER_COS[i], sy + size * CORNER_SIN[i]);
    }
    ctx.closePath();

    ctx.fillStyle = isEligible ? 'rgba(0,212,255,0.18)' : 'rgba(0,0,0,0.30)';
    ctx.fill();
  }
}

// ── Animation draw helpers ─────────────────────────────────────────────────

/** Draw a cyan defend ring around a screen position. */
function drawDefendMarker(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
): void {
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
  ctx.stroke();
}

/** Draw a red damage flash (pulsing circle) at a screen position. */
function drawDamageFlash(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
  intensity: number,
): void {
  ctx.globalAlpha = intensity * 0.6;
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.arc(sx, sy, r + 6, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw an expanding ring for a destroyed entity. */
function drawDeathRing(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
  progress: number,
  color: string,
): void {
  const expandR = r + r * progress * 2;
  ctx.globalAlpha = (1 - progress) * 0.8;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, expandR, 0, Math.PI * 2);
  ctx.stroke();
}

/** Draw a spawn glow effect (expanding cyan circle, fading in). */
function drawSpawnGlow(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
  progress: number,
): void {
  ctx.globalAlpha = progress * 0.5;
  ctx.fillStyle = '#00d4ff';
  ctx.beginPath();
  ctx.arc(sx, sy, r * (0.5 + progress * 0.5), 0, Math.PI * 2);
  ctx.fill();
}

// ── Main animation draw functions ──────────────────────────────────────────

/** Draw units at interpolated positions during the execution animation. */
export function drawAnimatedUnits(
  ctx: CanvasRenderingContext2D,
  animation: ExecutionAnimation,
  cam: Camera,
  elapsed: number,
): void {
  const r = BASE_HEX_SIZE * cam.zoom * 0.32;
  const prevAlpha = ctx.globalAlpha;
  const phase = getCurrentPhase(elapsed);

  for (const anim of animation.units.values()) {
    // Spawned units only appear during build phase.
    if (anim.wasSpawned) {
      const bp = getPhaseProgress(elapsed, PHASE_BUILD);
      if (bp < 0) continue;
      const sx = cam.x + anim.toPixel.x * cam.zoom;
      const sy = cam.y + anim.toPixel.y * cam.zoom;
      drawSpawnGlow(ctx, sx, sy, r, bp);
      ctx.globalAlpha = bp * 0.8;
      ctx.fillStyle = anim.owner === 'player' ? '#00d4ff' : '#ff6b6b';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const worldPos = getAnimatedUnitPosition(anim, elapsed);
    const sx = cam.x + worldPos.x * cam.zoom;
    const sy = cam.y + worldPos.y * cam.zoom;

    // Draw defend marker.
    if (anim.isDefending && phase === 'defend') {
      drawDefendMarker(ctx, sx, sy, r);
    }

    // Draw damage flash during attack phase.
    if (phase === 'attack' && anim.newHp < anim.oldHp && !anim.wasDestroyed) {
      const ap = getPhaseProgress(elapsed, PHASE_ATTACK);
      if (ap >= 0) {
        const pulse = Math.sin(ap * Math.PI * 3); // 3 pulses
        drawDamageFlash(ctx, sx, sy, r, Math.abs(pulse));
      }
    }

    // Draw the unit.
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = anim.owner === 'player' ? '#00d4ff' : '#ff6b6b';
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = prevAlpha;
}

/** Draw structures with damage/build effects during execution animation. */
export function drawAnimatedStructures(
  ctx: CanvasRenderingContext2D,
  animation: ExecutionAnimation,
  cam: Camera,
  elapsed: number,
): void {
  const r = BASE_HEX_SIZE * cam.zoom * 0.28;
  const prevAlpha = ctx.globalAlpha;
  const phase = getCurrentPhase(elapsed);

  for (const anim of animation.structures.values()) {
    const sx = cam.x + anim.pixel.x * cam.zoom;
    const sy = cam.y + anim.pixel.y * cam.zoom;

    // Newly built: fade in during build phase.
    if (anim.wasBuilt) {
      const bp = getPhaseProgress(elapsed, PHASE_BUILD);
      if (bp < 0) continue;
      ctx.globalAlpha = bp * 0.8;
    } else {
      ctx.globalAlpha = 0.8;
    }

    // Damage flash.
    if (phase === 'attack' && anim.wasDamaged && !anim.wasDestroyed) {
      const ap = getPhaseProgress(elapsed, PHASE_ATTACK);
      if (ap >= 0) {
        const pulse = Math.sin(ap * Math.PI * 3);
        drawDamageFlash(ctx, sx, sy, r, Math.abs(pulse));
      }
    }

    ctx.fillStyle = anim.owner === 'player' ? '#00d4ff' : '#ff6b6b';
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }

  ctx.globalAlpha = prevAlpha;
}

/** Draw destroyed entities with death effects during attack phase. */
export function drawDestroyedEntities(
  ctx: CanvasRenderingContext2D,
  animation: ExecutionAnimation,
  cam: Camera,
  elapsed: number,
): void {
  const phase = getCurrentPhase(elapsed);
  if (phase !== 'attack') return;

  const ap = getPhaseProgress(elapsed, PHASE_ATTACK);
  if (ap < 0) return;

  const prevAlpha = ctx.globalAlpha;
  const unitR = BASE_HEX_SIZE * cam.zoom * 0.32;
  const structR = BASE_HEX_SIZE * cam.zoom * 0.28;

  // Destroyed units: fade out + expanding ring.
  for (const anim of animation.destroyedUnits) {
    const sx = cam.x + anim.fromPixel.x * cam.zoom;
    const sy = cam.y + anim.fromPixel.y * cam.zoom;
    const color = anim.owner === 'player' ? '#00d4ff' : '#ff6b6b';

    // Fading unit.
    ctx.globalAlpha = (1 - ap) * 0.8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, unitR, 0, Math.PI * 2);
    ctx.fill();

    // Death ring.
    drawDeathRing(ctx, sx, sy, unitR, ap, color);
  }

  // Destroyed structures: fade out + expanding ring.
  for (const anim of animation.destroyedStructures) {
    const sx = cam.x + anim.pixel.x * cam.zoom;
    const sy = cam.y + anim.pixel.y * cam.zoom;
    const color = anim.owner === 'player' ? '#00d4ff' : '#ff6b6b';

    ctx.globalAlpha = (1 - ap) * 0.8;
    ctx.fillStyle = color;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-structR, -structR, structR * 2, structR * 2);
    ctx.restore();

    drawDeathRing(ctx, sx, sy, structR, ap, color);
  }

  ctx.globalAlpha = prevAlpha;
}
