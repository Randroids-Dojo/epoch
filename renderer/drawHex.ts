import { FogState, HexCell } from '../engine/map';
import { TerrainType } from '../engine/terrain';
import { Camera } from './camera';

// ── Obsidian & Crimson palette — paper-diorama cel-shaded aesthetic ──────────
const C = {
  bg:              '#0b0a0f',     // deep obsidian
  hexFill:         '#16141c',     // dark tile
  hexFillVisible:  '#1e1a28',     // visible tile — slightly warmer
  hexBorder:       '#2a2535',     // subtle border
  hexBorderSelect: '#e63946',     // crimson selection
  unexplored:      '#08070c',     // near-black
  exploredOverlay: 'rgba(0,0,0,0.45)',
  crystalNode:        '#ff4d6a',  // rose crystal
  crystalNodeVisible: '#2a0f1a',  // dark rose fill
  voidRift:           '#0a080e',  // void black
  ridge:              '#3d3548',  // slate-purple
  ridgeVisible:       '#1f1a28',  // dark slate
  energyField:        '#1a0c22',  // dark violet
  energyFieldSymbol:  '#9b3aed',  // vivid violet
  fluxVent:           '#ff2255',  // hot pink-red
  fluxVentVisible:    '#1e0815',  // dark crimson
  fog:                '#2a2535',
} as const;

/** Base hex size in world pixels (before camera zoom is applied). */
export const BASE_HEX_SIZE = 28;

// Precomputed cos/sin for pointy-top hex corners (angles: −30°, 30°, 90°, 150°, 210°, 270°).
// Eliminates per-frame trig and Array allocation in the render loop.
const CORNER_COS = Array.from({ length: 6 }, (_, i) => Math.cos((Math.PI / 180) * (60 * i - 30)));
const CORNER_SIN = Array.from({ length: 6 }, (_, i) => Math.sin((Math.PI / 180) * (60 * i - 30)));

/** Trace a closed pointy-top hex outline onto the canvas path (beginPath…closePath). Call stroke()/fill() after. */
export function hexPath(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number): void {
  ctx.beginPath();
  ctx.moveTo(sx + size * CORNER_COS[0], sy + size * CORNER_SIN[0]);
  for (let i = 1; i < 6; i++) {
    ctx.lineTo(sx + size * CORNER_COS[i], sy + size * CORNER_SIN[i]);
  }
  ctx.closePath();
}

/** Draw a single hex cell onto the canvas with paper-diorama cel-shaded style. */
export function drawHexCell(
  ctx: CanvasRenderingContext2D,
  cell: HexCell,
  cam: Camera,
  sx: number,
  sy: number,
  selected = false,
): void {
  const size = BASE_HEX_SIZE * cam.zoom;

  // ── Paper shadow layer (offset down-right for 2.5D diorama feel) ────────
  if (cell.fog !== 'unexplored' && cam.zoom >= 0.4) {
    const shadowOff = Math.max(1, size * 0.06);
    hexPath(ctx, sx + shadowOff, sy + shadowOff, size * 0.97);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
  }

  // ── Hex fill ────────────────────────────────────────────────────────────
  hexPath(ctx, sx, sy, size);

  ctx.fillStyle = getHexFill(cell.terrain, cell.fog);
  ctx.fill();

  // Explored dark overlay
  if (cell.fog === 'explored') {
    ctx.fillStyle = C.exploredOverlay;
    ctx.fill();
  }

  // ── Thick cel-shaded border ─────────────────────────────────────────────
  ctx.strokeStyle = selected ? C.hexBorderSelect : C.hexBorder;
  ctx.lineWidth = selected ? Math.max(2, cam.zoom * 1.5) : Math.max(0.8, cam.zoom * 0.7);
  ctx.stroke();

  // ── Inner bevel highlight (top-left edge gets a subtle bright line) ─────
  if (cell.fog === 'visible' && cam.zoom >= 0.5) {
    ctx.beginPath();
    ctx.moveTo(sx + size * CORNER_COS[0], sy + size * CORNER_SIN[0]);
    ctx.lineTo(sx + size * CORNER_COS[1], sy + size * CORNER_SIN[1]);
    ctx.lineTo(sx + size * CORNER_COS[2], sy + size * CORNER_SIN[2]);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = Math.max(0.5, cam.zoom * 0.5);
    ctx.stroke();
  }

  // ── Terrain symbol (skip for unexplored or when zoomed out too far) ────
  if (cell.fog !== 'unexplored' && cam.zoom >= 0.55) {
    drawTerrainSymbol(ctx, cell.terrain, sx, sy, size, cell.fog === 'explored');
  }
}

function getHexFill(terrain: TerrainType, fog: FogState): string {
  if (fog === 'unexplored') return C.unexplored;
  const visible = fog === 'visible';
  switch (terrain) {
    case 'void_rift':    return C.voidRift;
    case 'crystal_node': return visible ? C.crystalNodeVisible : C.hexFill;
    case 'flux_vent':    return visible ? C.fluxVentVisible : C.hexFill;
    case 'ridge':        return visible ? C.ridgeVisible : C.hexFill;
    case 'energy_field': return visible ? C.energyField : C.hexFill;
    case 'open':
    default:
      return visible ? C.hexFillVisible : C.hexFill;
  }
}

function drawTerrainSymbol(
  ctx: CanvasRenderingContext2D,
  terrain: TerrainType,
  cx: number,
  cy: number,
  size: number,
  desaturated: boolean,
): void {
  const r           = size * 0.32;
  const prevAlpha   = ctx.globalAlpha;
  const prevLW      = ctx.lineWidth;
  ctx.globalAlpha   = desaturated ? 0.4 : 1.0;
  ctx.lineWidth     = Math.max(1.5, size * 0.06);

  switch (terrain) {
    case 'crystal_node': {
      // Crimson crystal diamond with inner glow
      ctx.strokeStyle = C.crystalNode;
      ctx.beginPath();
      ctx.moveTo(cx,         cy - r);
      ctx.lineTo(cx + r * 0.6, cy);
      ctx.lineTo(cx,         cy + r);
      ctx.lineTo(cx - r * 0.6, cy);
      ctx.closePath();
      ctx.stroke();
      // Inner glow dot
      if (!desaturated) {
        ctx.fillStyle = C.crystalNode;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'void_rift': {
      ctx.strokeStyle = '#4a3858';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.6, cy - r * 0.6);
      ctx.lineTo(cx + r * 0.6, cy + r * 0.6);
      ctx.moveTo(cx + r * 0.6, cy - r * 0.6);
      ctx.lineTo(cx - r * 0.6, cy + r * 0.6);
      ctx.stroke();
      break;
    }
    case 'flux_vent': {
      ctx.strokeStyle = C.fluxVent;
      for (let i = -1; i <= 1; i++) {
        const yOff = i * r * 0.4;
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.7, cy + yOff);
        ctx.quadraticCurveTo(cx, cy + yOff - r * 0.2, cx + r * 0.7, cy + yOff);
        ctx.stroke();
      }
      break;
    }
    case 'ridge': {
      ctx.strokeStyle = C.ridge;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy + r * 0.4);
      ctx.lineTo(cx,     cy - r * 0.6);
      ctx.lineTo(cx + r, cy + r * 0.4);
      ctx.stroke();
      break;
    }
    case 'energy_field': {
      ctx.strokeStyle = C.energyFieldSymbol;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.bezierCurveTo(
        cx - r * 0.5, cy - r * 0.5,
        cx + r * 0.5, cy + r * 0.5,
        cx + r, cy,
      );
      ctx.stroke();
      break;
    }
    default:
      break;
  }

  ctx.globalAlpha = prevAlpha;
  ctx.lineWidth   = prevLW;
}

/** Fill the entire canvas with the background color. */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
): void {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
}
