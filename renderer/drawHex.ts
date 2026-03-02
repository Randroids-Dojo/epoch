import { hexCorners, hexToPixel } from '../engine/hex';
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
  crystalNode:     '#7dd3fc',
  voidRift:        '#0c1220',
  ridge:           '#475569',
  energyField:     '#4c1d95',
  fluxVent:        '#d946ef',
  fog:             '#334155',
} as const;

/** Base hex size in world pixels (before camera zoom is applied). */
export const BASE_HEX_SIZE = 28;

/** Draw a single hex cell onto the canvas. */
export function drawHexCell(
  ctx: CanvasRenderingContext2D,
  cell: HexCell,
  cam: Camera,
  selected = false,
): void {
  const size = BASE_HEX_SIZE * cam.zoom;
  const wp = hexToPixel(cell.hex, BASE_HEX_SIZE);
  const sx = cam.x + wp.x * cam.zoom;
  const sy = cam.y + wp.y * cam.zoom;
  const corners = hexCorners(sx, sy, size);

  // ── Hex fill ──────────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(corners[0][0], corners[0][1]);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i][0], corners[i][1]);
  }
  ctx.closePath();

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
    case 'crystal_node': return visible ? '#0c2d4a' : C.hexFill;
    case 'flux_vent':    return visible ? '#1a0a2e' : C.hexFill;
    case 'ridge':        return visible ? '#1c2535' : C.hexFill;
    case 'energy_field': return visible ? '#110a24' : C.hexFill;
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
  const r = size * 0.32;
  ctx.save();
  ctx.globalAlpha = desaturated ? 0.4 : 1.0;
  ctx.lineWidth = Math.max(1, size * 0.05);

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
      ctx.strokeStyle = '#475569';
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
      ctx.strokeStyle = '#7c3aed';
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

  ctx.restore();
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
