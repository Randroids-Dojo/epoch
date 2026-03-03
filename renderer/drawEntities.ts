import { Camera, worldToCanvas } from './camera';
import { BASE_HEX_SIZE, hexPath } from './drawHex';
import { hexToPixel } from '../engine/hex';
import { Unit, UnitType, UNIT_DEFS } from '../engine/units';
import { Structure, StructureType, STRUCTURE_DEFS } from '../engine/structures';
import { HexCell } from '../engine/map';
import { TERRAIN } from '../engine/terrain';
import { Command } from '../engine/commands';
import {
  ExecutionAnimation,
  getAnimatedUnitPosition, getCurrentPhase, getPhaseProgress,
  PHASE_ATTACK, PHASE_BUILD,
} from './animation';

// ── Shape helpers ───────────────────────────────────────────────────────────

/** Draw a regular polygon centered at (cx, cy) with given radius and sides. */
function regularPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  sides: number, rotOffset = 0,
): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotOffset + (i / sides) * Math.PI * 2;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

/** Draw an HP bar below an entity. */
function drawHpBar(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  radius: number,
  hp: number, maxHp: number,
): void {
  if (hp <= 0 || maxHp <= 0) return;
  const barW = radius * 2.4;
  const barH = 2.5;
  const bx = sx - barW / 2;
  const by = sy + radius + 3;
  const frac = Math.max(0, Math.min(1, hp / maxHp));

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#0a0e1a';
  ctx.fillRect(bx, by, barW, barH);

  const barColor = frac > 0.5 ? '#22c55e' : frac > 0.25 ? '#eab308' : '#ef4444';
  ctx.fillStyle = barColor;
  ctx.fillRect(bx, by, barW * frac, barH);
}

// ── Unit shape painters ─────────────────────────────────────────────────────

function paintDrone(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  // center dot
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function paintPulseSentry(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillRect(-r, -r, r * 2, r * 2);
  // diagonal cross lines
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-r, -r); ctx.lineTo(r, r);
  ctx.moveTo(r, -r);  ctx.lineTo(-r, r);
  ctx.stroke();
  ctx.restore();
}

function paintArcRanger(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
  // horizontal line through center
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx - r * 0.85, sy);
  ctx.lineTo(sx + r * 0.85, sy);
  ctx.stroke();
}

function paintUnit(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
  unitType: UnitType, color: string,
): void {
  switch (unitType) {
    case 'drone':        paintDrone(ctx, sx, sy, r, color);        break;
    case 'pulse_sentry': paintPulseSentry(ctx, sx, sy, r, color);  break;
    case 'arc_ranger':   paintArcRanger(ctx, sx, sy, r, color);    break;
  }
}

// ── Structure shape painters ────────────────────────────────────────────────

function paintCommandNexus(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  // Triple concentric hexagons
  for (let i = 0; i < 3; i++) {
    const ri = r * (1 - i * 0.28);
    regularPolygon(ctx, sx, sy, ri, 6, -Math.PI / 2);
    if (i === 0) {
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.strokeStyle = i === 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function paintCrystalExtractor(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  regularPolygon(ctx, sx, sy, r, 5, -Math.PI / 2);
  ctx.fillStyle = color;
  ctx.fill();
  // crystal diamond inside
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.PI / 4);
  const ci = r * 0.38;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-ci, -ci, ci * 2, ci * 2);
  ctx.restore();
}

function paintBarracks(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  const w = r * 2.1;
  const h = r * 1.6;
  ctx.fillStyle = color;
  ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
  // grid lines (barracks doors)
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx, sy - h / 2); ctx.lineTo(sx, sy + h / 2);
  ctx.moveTo(sx - w / 2, sy); ctx.lineTo(sx + w / 2, sy);
  ctx.stroke();
}

function paintTechLab(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  // outer ring
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();
  // filled inner circle
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
  // spiral suggestion (3 spokes)
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + r * 0.55 * Math.cos(a), sy + r * 0.55 * Math.sin(a));
  }
  ctx.stroke();
}

function paintWatchtower(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  // upward-pointing triangle
  ctx.beginPath();
  ctx.moveTo(sx, sy - r);
  ctx.lineTo(sx + r * 0.866, sy + r * 0.5);
  ctx.lineTo(sx - r * 0.866, sy + r * 0.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  // eye inside
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sx, sy + r * 0.1, r * 0.25, 0, Math.PI * 2);
  ctx.stroke();
}

function paintStructure(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
  structureType: StructureType, color: string,
): void {
  switch (structureType) {
    case 'command_nexus':     paintCommandNexus(ctx, sx, sy, r, color);     break;
    case 'crystal_extractor': paintCrystalExtractor(ctx, sx, sy, r, color); break;
    case 'barracks':          paintBarracks(ctx, sx, sy, r, color);         break;
    case 'tech_lab':          paintTechLab(ctx, sx, sy, r, color);          break;
    case 'watchtower':        paintWatchtower(ctx, sx, sy, r, color);       break;
  }
}

// ── Public draw functions ───────────────────────────────────────────────────

/** Draw all units onto the canvas with distinct shapes per type and HP bars. */
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
    const color = unit.owner === 'player' ? '#00d4ff' : '#ff6b6b';

    ctx.globalAlpha = 0.85;
    paintUnit(ctx, sx, sy, r, unit.type, color);
    drawHpBar(ctx, sx, sy, r, unit.hp, UNIT_DEFS[unit.type].maxHp);
  }

  ctx.globalAlpha = prevAlpha;
}

/** Draw all structures onto the canvas with distinct shapes per type and HP bars. */
export function drawStructures(
  ctx: CanvasRenderingContext2D,
  structures: Map<string, Structure>,
  cam: Camera,
): void {
  const r = BASE_HEX_SIZE * cam.zoom * 0.32;
  const prevAlpha = ctx.globalAlpha;

  for (const s of structures.values()) {
    const wp = hexToPixel(s.hex, BASE_HEX_SIZE);
    const sx = cam.x + wp.x * cam.zoom;
    const sy = cam.y + wp.y * cam.zoom;
    const color = s.owner === 'player' ? '#00d4ff' : '#ff6b6b';

    ctx.globalAlpha = s.buildProgress > 0 ? 0.45 : 0.85;
    paintStructure(ctx, sx, sy, r, s.type, color);

    if (s.buildProgress > 0) {
      // Dashed outline for structures under construction.
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalAlpha = 0.85;
    drawHpBar(ctx, sx, sy, r, s.hp, STRUCTURE_DEFS[s.type].maxHp);
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

    hexPath(ctx, sx, sy, size);

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
    const color = anim.owner === 'player' ? '#00d4ff' : '#ff6b6b';

    // Spawned units only appear during build phase.
    if (anim.wasSpawned) {
      const bp = getPhaseProgress(elapsed, PHASE_BUILD);
      if (bp < 0) continue;
      const sx = cam.x + anim.toPixel.x * cam.zoom;
      const sy = cam.y + anim.toPixel.y * cam.zoom;
      drawSpawnGlow(ctx, sx, sy, r, bp);
      ctx.globalAlpha = bp * 0.85;
      paintUnit(ctx, sx, sy, r, anim.unitType, color);
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

    ctx.globalAlpha = 0.85;
    paintUnit(ctx, sx, sy, r, anim.unitType, color);

    // Interpolate HP for bar display.
    const displayHp = phase === 'attack'
      ? anim.oldHp + (anim.newHp - anim.oldHp) * Math.max(0, getPhaseProgress(elapsed, PHASE_ATTACK))
      : anim.newHp;
    drawHpBar(ctx, sx, sy, r, displayHp, anim.maxHp);
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
  const r = BASE_HEX_SIZE * cam.zoom * 0.32;
  const prevAlpha = ctx.globalAlpha;
  const phase = getCurrentPhase(elapsed);

  for (const anim of animation.structures.values()) {
    const sx = cam.x + anim.pixel.x * cam.zoom;
    const sy = cam.y + anim.pixel.y * cam.zoom;
    const color = anim.owner === 'player' ? '#00d4ff' : '#ff6b6b';

    // Newly built: fade in during build phase.
    const bp = getPhaseProgress(elapsed, PHASE_BUILD);
    if (anim.wasBuilt) {
      if (bp < 0) continue;
      ctx.globalAlpha = bp * 0.85;
    } else {
      ctx.globalAlpha = 0.85;
    }

    // Damage flash.
    if (phase === 'attack' && anim.wasDamaged && !anim.wasDestroyed) {
      const ap = getPhaseProgress(elapsed, PHASE_ATTACK);
      if (ap >= 0) {
        const pulse = Math.sin(ap * Math.PI * 3);
        drawDamageFlash(ctx, sx, sy, r, Math.abs(pulse));
      }
    }

    ctx.globalAlpha = 0.85;
    paintStructure(ctx, sx, sy, r, anim.structureType, color);

    const displayHp = phase === 'attack'
      ? anim.oldHp + (anim.newHp - anim.oldHp) * Math.max(0, getPhaseProgress(elapsed, PHASE_ATTACK))
      : anim.newHp;
    drawHpBar(ctx, sx, sy, r, displayHp, anim.maxHp);
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
  const r = BASE_HEX_SIZE * cam.zoom * 0.32;

  // Destroyed units: fade out + expanding ring.
  for (const anim of animation.destroyedUnits) {
    const sx = cam.x + anim.fromPixel.x * cam.zoom;
    const sy = cam.y + anim.fromPixel.y * cam.zoom;
    const color = anim.owner === 'player' ? '#00d4ff' : '#ff6b6b';

    ctx.globalAlpha = (1 - ap) * 0.85;
    paintUnit(ctx, sx, sy, r, anim.unitType, color);
    drawDeathRing(ctx, sx, sy, r, ap, color);
  }

  // Destroyed structures: fade out + expanding ring.
  for (const anim of animation.destroyedStructures) {
    const sx = cam.x + anim.pixel.x * cam.zoom;
    const sy = cam.y + anim.pixel.y * cam.zoom;
    const color = anim.owner === 'player' ? '#00d4ff' : '#ff6b6b';

    ctx.globalAlpha = (1 - ap) * 0.85;
    paintStructure(ctx, sx, sy, r, anim.structureType, color);
    drawDeathRing(ctx, sx, sy, r, ap, color);
  }

  ctx.globalAlpha = prevAlpha;
}

const ECHO_LABELS: Partial<Record<Command['type'], string>> = {
  move:   'MVE',
  attack: 'ATK',
  gather: 'GTH',
  build:  'BLD',
};

/**
 * Draw Temporal Echo overlays — translucent gold ghost indicators showing the
 * previous epoch's enemy commands during the planning phase.
 *
 * @param timeMs  Current time in ms (e.g. performance.now()) for pulse animation.
 */
export function drawEchoOverlay(
  ctx: CanvasRenderingContext2D,
  commands: Command[],
  cam: Camera,
  timeMs: number,
): void {
  const pulse      = 0.45 + 0.3 * Math.sin(timeMs / 700); // 0.45–0.75 oscillation
  const hexR       = BASE_HEX_SIZE * cam.zoom;
  const alphaFill  = pulse * 0.18;
  const alphaLabel = pulse * 0.9;
  const prevAlpha  = ctx.globalAlpha;

  ctx.strokeStyle  = '#fbbf24';
  ctx.fillStyle    = '#fbbf24';
  ctx.lineWidth    = 1.5;
  ctx.font         = `bold ${Math.max(8, Math.round(hexR * 0.38))}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  for (const cmd of commands) {
    let targetHex: { q: number; r: number } | null = null;

    if (
      cmd.type === 'move' ||
      cmd.type === 'attack' ||
      cmd.type === 'gather' ||
      cmd.type === 'build'
    ) {
      targetHex = cmd.targetHex;
    }
    if (!targetHex) continue;

    const wp = hexToPixel(targetHex, BASE_HEX_SIZE);
    const { x: sx, y: sy } = worldToCanvas(wp.x, wp.y, cam);

    // Hex outline.
    hexPath(ctx, sx, sy, hexR);
    ctx.globalAlpha = pulse;
    ctx.stroke();

    // Inner fill.
    ctx.globalAlpha = alphaFill;
    ctx.fill();

    // Label.
    const label = ECHO_LABELS[cmd.type];
    if (label) {
      ctx.globalAlpha = alphaLabel;
      ctx.fillText(label, sx, sy);
    }
  }

  ctx.globalAlpha = prevAlpha;
}
