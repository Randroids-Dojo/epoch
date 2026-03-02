import { Camera } from './camera';
import { BASE_HEX_SIZE } from './drawHex';
import { hexToPixel } from '../engine/hex';
import { Unit } from '../engine/units';
import { Structure } from '../engine/structures';
import { HexCell } from '../engine/map';
import { TERRAIN } from '../engine/terrain';

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
