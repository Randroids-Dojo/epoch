import { FogState, HexCell } from '../engine/map';
import { TerrainType } from '../engine/terrain';
import { Camera } from './camera';

// ── Color palette (GDD §11.2) ────────────────────────────────────────────────
const C = {
  bg:              '#0a0e1a',
  hexFill:         '#1e293b',
  hexFillVisible:  '#253347',
  hexBorder:       '#334155',
  hexBorderSelect: '#00e5ff',
  unexplored:      '#070b14',
  exploredOverlay: 'rgba(0,0,0,0.40)',
  crystalNode:        '#7dd3fc',
  crystalNodeVisible: '#0c2d4a',
  voidRift:           '#0c1220',
  ridge:              '#475569',
  ridgeVisible:       '#1c2535',
  energyField:        '#110a24',
  energyFieldSymbol:  '#7c3aed',
  fluxVent:           '#d946ef',
  fluxVentVisible:    '#1a0a2e',
  fog:                '#334155',
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

/** Draw a single hex cell onto the canvas. */
export function drawHexCell(
  ctx: CanvasRenderingContext2D,
  cell: HexCell,
  cam: Camera,
  sx: number,
  sy: number,
  selected = false,
): void {
  const size = BASE_HEX_SIZE * cam.zoom;

  // ── Hex fill ──────────────────────────────────────────────────────────────
  hexPath(ctx, sx, sy, size);

  ctx.fillStyle = getHexFill(cell.terrain, cell.fog);
  ctx.fill();

  // Explored dark overlay
  if (cell.fog === 'explored') {
    ctx.fillStyle = C.exploredOverlay;
    ctx.fill();
  }

  // ── Border ────────────────────────────────────────────────────────────────
  ctx.strokeStyle = selected ? C.hexBorderSelect : C.hexBorder;
  ctx.lineWidth = selected ? Math.max(1.5, cam.zoom) : 0.5;
  ctx.stroke();

  // ── Terrain symbol (skip for unexplored or when zoomed out too far) ───────
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
  ctx.lineWidth     = Math.max(1, size * 0.05);

  switch (terrain) {
    case 'crystal_node': {
      ctx.strokeStyle = C.crystalNode;
      ctx.beginPath();
      ctx.moveTo(cx,         cy - r);
      ctx.lineTo(cx + r * 0.6, cy);
      ctx.lineTo(cx,         cy + r);
      ctx.lineTo(cx - r * 0.6, cy);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'void_rift': {
      ctx.strokeStyle = C.ridge;
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
