import { Camera, worldToCanvas } from './camera';
import { BASE_HEX_SIZE, hexPath } from './drawHex';
import { Hex, hexToPixel, hexEqual, hexKey, hexesInRange } from '../engine/hex';
import { Unit, UnitType, effectiveMaxHp } from '../engine/units';
import { Structure, StructureType, STRUCTURE_DEFS } from '../engine/structures';
import { HexCell } from '../engine/map';
import { TERRAIN } from '../engine/terrain';
import { Command, UnitCommand } from '../engine/commands';
import { TimelineForkResult, ChronoScoutResult } from '../engine/simulation';
import {
  ExecutionAnimation,
  getAnimatedUnitPosition, getCurrentPhase, getPhaseProgress,
  PHASE_DEFEND, PHASE_MOVE, PHASE_ATTACK, PHASE_BUILD,
} from './animation';

// ── Theme colors ────────────────────────────────────────────────────────────

const PLAYER_COLOR  = '#e63946';   // crimson red
const PLAYER_GLOW   = '#ff4d5e';   // brighter crimson for highlights
const AI_COLOR      = '#8b5cf6';   // violet for AI (distinct from player red)
const AI_GLOW       = '#a78bfa';
const OUTLINE_DARK  = '#1a1520';   // dark outline for cel-shading

function entityColor(owner: string): string {
  return owner === 'player' ? PLAYER_COLOR : AI_COLOR;
}

// ── Particle system ─────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'gather' | 'attack' | 'spark';
}

const particles: Particle[] = [];
const MAX_PARTICLES = 300;

function spawnParticles(
  sx: number, sy: number,
  count: number,
  type: Particle['type'],
  color: string,
  spread: number,
  speed: number,
  life: number,
  size: number,
): void {
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = speed * (0.3 + Math.random() * 0.7);
    particles.push({
      x: sx + (Math.random() - 0.5) * spread,
      y: sy + (Math.random() - 0.5) * spread,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: life * (0.5 + Math.random() * 0.5),
      maxLife: life,
      size: size * (0.6 + Math.random() * 0.8),
      color,
      type,
    });
  }
}

function updateAndDrawParticles(ctx: CanvasRenderingContext2D, dt: number): void {
  const prevAlpha = ctx.globalAlpha;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 15 * dt; // slight upward drift
    p.life -= dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    const alpha = Math.min(1, p.life / p.maxLife);
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = p.color;

    if (p.type === 'spark') {
      // Spark: small bright square rotated 45 degrees
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      const hs = p.size * alpha;
      ctx.fillRect(-hs, -hs, hs * 2, hs * 2);
      ctx.restore();
    } else {
      // Circle particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = prevAlpha;
}

// ── Cel-shaded drawing helpers ──────────────────────────────────────────────

/** Draw a cel-shaded drop shadow beneath a shape. */
function drawEntityShadow(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
): void {
  const off = Math.max(1.5, r * 0.12);
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(sx + off, sy + off + r * 0.3, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a thick cel-shaded outline around a shape (call after filling). */
function celOutline(
  ctx: CanvasRenderingContext2D,
  lineWidth: number,
): void {
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

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

/** Draw an HP bar below an entity — crimson themed. */
function drawHpBar(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  radius: number,
  hp: number, maxHp: number,
): void {
  if (hp <= 0 || maxHp <= 0) return;
  const barW = radius * 2.4;
  const barH = 3;
  const bx = sx - barW / 2;
  const by = sy + radius + 4;
  const frac = Math.max(0, Math.min(1, hp / maxHp));

  // Bar background with outline
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#0b0a0f';
  ctx.fillRect(bx - 0.5, by - 0.5, barW + 1, barH + 1);

  const barColor = frac > 0.5 ? '#22c55e' : frac > 0.25 ? '#eab308' : '#ef4444';
  ctx.fillStyle = barColor;
  ctx.fillRect(bx, by, barW * frac, barH);

  // Thin outline
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(bx - 0.5, by - 0.5, barW + 1, barH + 1);
}

/** Draw a merge count badge above a unit (e.g. "2x", "10x"). */
function drawMergeBadge(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
  mergeCount: number,
): void {
  const label = `${mergeCount + 1}x`;
  const fontSize = Math.max(7, r * 0.7);
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const bx = sx;
  const by = sy - r - 3;

  // Background pill — crimson
  const textWidth = ctx.measureText(label).width;
  const padX = 3;
  const padY = 1;
  const pillW = textWidth + padX * 2;
  const pillH = fontSize + padY * 2;

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  const pillR = pillH / 2;
  ctx.roundRect(bx - pillW / 2, by - pillH, pillW, pillH, pillR);
  ctx.fill();

  // Outline
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Text
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 1;
  ctx.fillText(label, bx, by - padY);
}

// ── Unit shape painters — cel-shaded paper-diorama style ────────────────────

function paintDrone(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  // Paper-cutout circle with layered look
  drawEntityShadow(ctx, sx, sy, r);

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  celOutline(ctx, Math.max(1.5, r * 0.15));

  // Inner highlight crescent (top-left light source)
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(sx - r * 0.2, sy - r * 0.2, r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Center rotor dot
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = OUTLINE_DARK;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

function paintPulseSentry(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  // ── Heavily redesigned sentry: fortified tower with battlements ────────
  drawEntityShadow(ctx, sx, sy, r * 1.1);

  const w = r * 1.4;
  const h = r * 1.8;
  const bx = sx - w / 2;
  const by = sy - h / 2;

  ctx.globalAlpha = 0.85;

  // Main tower body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.rect(bx, by + h * 0.25, w, h * 0.75);
  ctx.fill();

  // Battlements (3 crenellations on top)
  const crenW = w / 5;
  const crenH = h * 0.3;
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(bx + i * crenW * 2 - crenW * 0.5 + w * 0.1, by, crenW, crenH);
  }

  // Thick outline around the whole tower
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = Math.max(1.8, r * 0.13);

  // Draw outline manually for the tower + battlement shape
  ctx.beginPath();
  // Bottom edge
  ctx.moveTo(bx, by + h);
  ctx.lineTo(bx, by + h * 0.25);
  // Up to battlements
  for (let i = 0; i < 3; i++) {
    const cx2 = bx + i * crenW * 2 - crenW * 0.5 + w * 0.1;
    ctx.lineTo(cx2, by + h * 0.25);
    ctx.lineTo(cx2, by);
    ctx.lineTo(cx2 + crenW, by);
    ctx.lineTo(cx2 + crenW, by + h * 0.25);
  }
  ctx.lineTo(bx + w, by + h * 0.25);
  ctx.lineTo(bx + w, by + h);
  ctx.closePath();
  ctx.stroke();

  // Inner window/slit (glowing)
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.6;
  ctx.fillRect(sx - r * 0.12, sy + r * 0.05, r * 0.24, r * 0.45);

  // Vision pulse ring
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 1.5, 0, Math.PI * 2);
  ctx.stroke();
}

function paintArcRanger(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r);

  // Rotated diamond/square
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-r, -r, r * 2, r * 2);
  // Cel outline
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = Math.max(1.5, r * 0.13);
  ctx.strokeRect(-r, -r, r * 2, r * 2);
  ctx.restore();

  // Crosshair lines (sniper scope)
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(sx - r * 0.85, sy);
  ctx.lineTo(sx + r * 0.85, sy);
  ctx.moveTo(sx, sy - r * 0.85);
  ctx.lineTo(sx, sy + r * 0.85);
  ctx.stroke();

  // Bright center dot (scope reticle)
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
}

// Phase Walker: ghostly triangle with dashed phase effect.
function paintPhaseWalker(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r);

  regularPolygon(ctx, sx, sy, r, 3, -Math.PI / 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7; // slightly transparent — phasing!
  ctx.fill();
  celOutline(ctx, Math.max(1.5, r * 0.13));

  // Inner dashed ghost triangle
  ctx.save();
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5;
  regularPolygon(ctx, sx, sy, r * 0.55, 3, -Math.PI / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Phase shimmer (small bright dot)
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.4 + 0.2 * Math.sin(performance.now() / 300);
  ctx.beginPath();
  ctx.arc(sx, sy - r * 0.1, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

// Temporal Warden: hexagon with vision aura ring.
function paintTemporalWarden(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r);

  regularPolygon(ctx, sx, sy, r, 6, 0);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  celOutline(ctx, Math.max(1.5, r * 0.13));

  // Concentric inner ring
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  regularPolygon(ctx, sx, sy, r * 0.55, 6, 0);
  ctx.stroke();

  // Time symbol (hourglass shape inside)
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.moveTo(sx - r * 0.25, sy - r * 0.35);
  ctx.lineTo(sx + r * 0.25, sy - r * 0.35);
  ctx.lineTo(sx - r * 0.25, sy + r * 0.35);
  ctx.lineTo(sx + r * 0.25, sy + r * 0.35);
  ctx.stroke();
}

// Void Striker: octagon (heavy DPS, splash).
function paintVoidStriker(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r * 1.1);

  regularPolygon(ctx, sx, sy, r, 8, Math.PI / 8);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  celOutline(ctx, Math.max(2, r * 0.15));

  // Cross inside to suggest artillery — thicker, more menacing
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(sx - r * 0.5, sy); ctx.lineTo(sx + r * 0.5, sy);
  ctx.moveTo(sx, sy - r * 0.5); ctx.lineTo(sx, sy + r * 0.5);
  ctx.stroke();

  // Danger glow ring
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 1.4, 0, Math.PI * 2);
  ctx.stroke();
}

// Flux Weaver: 6-pointed star (healer).
function paintFluxWeaver(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r);

  // Draw two overlapping triangles to form a star.
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  for (let t = 0; t < 2; t++) {
    regularPolygon(ctx, sx, sy, r, 3, -Math.PI / 2 + t * Math.PI);
    ctx.fill();
    celOutline(ctx, Math.max(1.5, r * 0.12));
  }

  // Healing pulse center (bright core)
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

// Chrono Titan: double-ring circle (massive unit).
function paintChronoTitan(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r * 1.2);

  // Outer ring — thick and bold
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, r * 0.2);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Outer cel outline
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = Math.max(1.5, r * 0.08);
  ctx.beginPath();
  ctx.arc(sx, sy, r + Math.max(1.5, r * 0.1), 0, Math.PI * 2);
  ctx.stroke();

  // Inner filled circle
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
  celOutline(ctx, Math.max(1.5, r * 0.1));

  // Bright center eye
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

function paintUnit(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
  unitType: UnitType, color: string,
): void {
  switch (unitType) {
    case 'drone':           paintDrone(ctx, sx, sy, r, color);           break;
    case 'pulse_sentry':    paintPulseSentry(ctx, sx, sy, r, color);     break;
    case 'arc_ranger':      paintArcRanger(ctx, sx, sy, r, color);       break;
    case 'phase_walker':    paintPhaseWalker(ctx, sx, sy, r, color);     break;
    case 'temporal_warden': paintTemporalWarden(ctx, sx, sy, r, color);  break;
    case 'void_striker':    paintVoidStriker(ctx, sx, sy, r, color);     break;
    case 'flux_weaver':     paintFluxWeaver(ctx, sx, sy, r, color);      break;
    case 'chrono_titan':    paintChronoTitan(ctx, sx, sy, r, color);     break;
  }
}

// ── Structure shape painters — paper-diorama fortress style ─────────────────

function paintCommandNexus(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  // ── Redesigned: multi-layered fortress base with central tower & flag ──
  drawEntityShadow(ctx, sx, sy, r * 1.3);
  ctx.globalAlpha = 0.85;

  // Outer fortress wall (hexagonal)
  regularPolygon(ctx, sx, sy, r * 1.15, 6, -Math.PI / 2);
  ctx.fillStyle = color;
  ctx.fill();
  celOutline(ctx, Math.max(2, r * 0.15));

  // Inner wall layer
  regularPolygon(ctx, sx, sy, r * 0.75, 6, Math.PI / 6);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Central tower (small filled square)
  const tw = r * 0.4;
  ctx.fillStyle = color;
  ctx.fillRect(sx - tw / 2, sy - tw / 2, tw, tw);
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx - tw / 2, sy - tw / 2, tw, tw);

  // Flag/banner on top
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - tw / 2);
  ctx.lineTo(sx, sy - r * 1.05);
  ctx.stroke();

  // Flag triangle
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(sx, sy - r * 1.05);
  ctx.lineTo(sx + r * 0.35, sy - r * 0.85);
  ctx.lineTo(sx, sy - r * 0.65);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Corner turret dots (4 points)
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  const turretAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  for (const a of turretAngles) {
    ctx.beginPath();
    ctx.arc(sx + Math.cos(a) * r * 0.9, sy + Math.sin(a) * r * 0.9, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE_DARK;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function paintCrystalExtractor(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r);

  regularPolygon(ctx, sx, sy, r, 5, -Math.PI / 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  celOutline(ctx, Math.max(1.5, r * 0.13));

  // Crystal diamond inside — glowing
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.PI / 4);
  const ci = r * 0.35;
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.3;
  ctx.fillRect(-ci, -ci, ci * 2, ci * 2);
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.strokeRect(-ci, -ci, ci * 2, ci * 2);
  ctx.restore();
}

function paintBarracks(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r);

  const w = r * 2.1;
  const h = r * 1.6;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(sx - w / 2, sy - h / 2, w, h);

  // Cel outline
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.strokeRect(sx - w / 2, sy - h / 2, w, h);

  // Grid lines (barracks doors)
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
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
  drawEntityShadow(ctx, sx, sy, r);

  // Outer ring
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.15);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Cel outline on outer
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  ctx.arc(sx, sy, r + Math.max(1, r * 0.08), 0, Math.PI * 2);
  ctx.stroke();

  // Inner filled circle
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  celOutline(ctx, Math.max(1, r * 0.1));

  // 3 spokes
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + r * 0.5 * Math.cos(a), sy + r * 0.5 * Math.sin(a));
  }
  ctx.stroke();
}

function paintWatchtower(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r);

  // Upward triangle
  ctx.beginPath();
  ctx.moveTo(sx, sy - r);
  ctx.lineTo(sx + r * 0.866, sy + r * 0.5);
  ctx.lineTo(sx - r * 0.866, sy + r * 0.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  celOutline(ctx, Math.max(1.5, r * 0.13));

  // Eye inside — brighter
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(sx, sy + r * 0.1, r * 0.22, 0, Math.PI * 2);
  ctx.stroke();
  // Pupil
  ctx.fillStyle = '#fff';
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(sx, sy + r * 0.1, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

// Flux Conduit: diamond shape (resource harvester).
function paintFluxConduit(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r);

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.strokeRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);

  // Inner diamond
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-r * 0.45, -r * 0.45, r * 0.9, r * 0.9);
  ctx.restore();
}

// War Foundry: wide rectangle with gear-like notches.
function paintWarFoundry(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r * 1.1);

  const w = r * 2.4;
  const h = r * 1.8;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(sx - w / 2, sy - h / 2, w, h);

  // Cel outline
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = Math.max(2, r * 0.13);
  ctx.strokeRect(sx - w / 2, sy - h / 2, w, h);

  // Gear notches on sides — darker
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  const notchW = r * 0.3;
  const notchH = r * 0.5;
  ctx.fillRect(sx - w / 2 - notchW, sy - notchH / 2, notchW, notchH);
  ctx.fillRect(sx + w / 2, sy - notchH / 2, notchW, notchH);

  // Notch outlines
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - w / 2 - notchW, sy - notchH / 2, notchW, notchH);
  ctx.strokeRect(sx + w / 2, sy - notchH / 2, notchW, notchH);

  // Inner grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx - w * 0.25, sy - h / 2); ctx.lineTo(sx - w * 0.25, sy + h / 2);
  ctx.moveTo(sx + w * 0.25, sy - h / 2); ctx.lineTo(sx + w * 0.25, sy + h / 2);
  ctx.moveTo(sx - w / 2, sy); ctx.lineTo(sx + w / 2, sy);
  ctx.stroke();
}

// Shield Pylon: shield shape (defensive aura).
function paintShieldPylon(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r);

  // Shield outline
  ctx.beginPath();
  ctx.moveTo(sx - r, sy - r * 0.6);
  ctx.lineTo(sx, sy - r);
  ctx.lineTo(sx + r, sy - r * 0.6);
  ctx.lineTo(sx + r, sy + r * 0.2);
  ctx.lineTo(sx, sy + r);
  ctx.lineTo(sx - r, sy + r * 0.2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  celOutline(ctx, Math.max(1.5, r * 0.13));

  // Inner cross highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx, sy - r * 0.6);
  ctx.lineTo(sx, sy + r * 0.5);
  ctx.moveTo(sx - r * 0.5, sy - r * 0.1);
  ctx.lineTo(sx + r * 0.5, sy - r * 0.1);
  ctx.stroke();
}

// Chrono Spire: tall spire with rings (temporal structure).
function paintChronoSpire(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number, color: string,
): void {
  drawEntityShadow(ctx, sx, sy, r);

  // Central pillar
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(sx - r * 0.25, sy - r, r * 0.5, r * 2);
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.strokeRect(sx - r * 0.25, sy - r, r * 0.5, r * 2);

  // Two orbital rings
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 2; i++) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(i * Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Top crystal — now crimson glow
  ctx.fillStyle = '#ff4d5e';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(sx, sy - r, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = OUTLINE_DARK;
  ctx.lineWidth = 1;
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
    case 'flux_conduit':      paintFluxConduit(ctx, sx, sy, r, color);      break;
    case 'war_foundry':       paintWarFoundry(ctx, sx, sy, r, color);       break;
    case 'shield_pylon':      paintShieldPylon(ctx, sx, sy, r, color);      break;
    case 'chrono_spire':      paintChronoSpire(ctx, sx, sy, r, color);      break;
  }
}

// ── Public draw functions ───────────────────────────────────────────────────

/** Draw all units onto the canvas with cel-shaded paper-diorama style. */
export function drawUnits(
  ctx: CanvasRenderingContext2D,
  units: Map<string, Unit>,
  cam: Camera,
  selectedUnitId?: string | null,
  fogCells?: Map<string, HexCell> | null,
): void {
  const r = BASE_HEX_SIZE * cam.zoom * 0.32;
  const prevAlpha = ctx.globalAlpha;

  for (const unit of units.values()) {
    // Hide AI units outside player vision.
    if (unit.owner === 'ai' && fogCells) {
      const cell = fogCells.get(hexKey(unit.hex));
      if (!cell || cell.fog !== 'visible') continue;
    }

    const wp = hexToPixel(unit.hex, BASE_HEX_SIZE);
    const sx = cam.x + wp.x * cam.zoom;
    const sy = cam.y + wp.y * cam.zoom;
    const color = entityColor(unit.owner);

    ctx.globalAlpha = 0.85;
    paintUnit(ctx, sx, sy, r, unit.type, color);
    drawHpBar(ctx, sx, sy, r, unit.hp, effectiveMaxHp(unit));

    // ── Gathering particle effect ─────────────────────────────────────────
    if (unit.type === 'drone' && unit.assignedExtractorId) {
      // Emit swirling gather particles around gathering drones
      if (Math.random() < 0.15) {
        spawnParticles(
          sx, sy, 1, 'gather',
          unit.owner === 'player' ? '#ff4d6a' : '#a78bfa',
          r * 2, 12, 1.2, r * 0.15,
        );
      }
    }

    // Draw merge count badge above unit.
    if (unit.mergeCount > 0) {
      drawMergeBadge(ctx, sx, sy, r, unit.mergeCount);
    }

    // Highlight ring for the selected/active unit — crimson dashed.
    if (unit.id === selectedUnitId) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = PLAYER_GLOW;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(sx, sy, r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.globalAlpha = prevAlpha;
}

/** Draw all structures onto the canvas with cel-shaded style and HP bars. */
export function drawStructures(
  ctx: CanvasRenderingContext2D,
  structures: Map<string, Structure>,
  cam: Camera,
  fogCells?: Map<string, HexCell> | null,
): void {
  const r = BASE_HEX_SIZE * cam.zoom * 0.32;
  const prevAlpha = ctx.globalAlpha;

  for (const s of structures.values()) {
    // Hide AI structures in unexplored fog. Show dimmed in explored.
    if (s.owner === 'ai' && fogCells) {
      const cell = fogCells.get(hexKey(s.hex));
      if (!cell || cell.fog === 'unexplored') continue;
    }

    const wp = hexToPixel(s.hex, BASE_HEX_SIZE);
    const sx = cam.x + wp.x * cam.zoom;
    const sy = cam.y + wp.y * cam.zoom;
    const color = entityColor(s.owner);
    const inFog = s.owner === 'ai' && fogCells && fogCells.get(hexKey(s.hex))?.fog === 'explored';

    ctx.globalAlpha = inFog ? 0.3 : (s.buildProgress > 0 ? 0.45 : 0.85);
    paintStructure(ctx, sx, sy, r, s.type, color);

    if (!inFog && s.buildProgress > 0) {
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

    if (!inFog) {
      ctx.globalAlpha = 0.85;
      drawHpBar(ctx, sx, sy, r, s.hp, STRUCTURE_DEFS[s.type].maxHp);
    }
  }

  ctx.globalAlpha = prevAlpha;
}

/**
 * Draw hex targeting overlay.
 * Immediate-range eligible hexes: crimson tint.
 * Multi-turn eligible hexes (move only): amber tint.
 * Non-eligible passable hexes: dark dimming overlay.
 */
export function drawTargetingOverlay(
  ctx: CanvasRenderingContext2D,
  cells: Map<string, HexCell>,
  eligibleKeys: Set<string>,
  cam: Camera,
  immediateKeys?: Set<string>,
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

    if (isEligible) {
      const isImmediate = !immediateKeys || immediateKeys.has(key);
      // Crimson for single-turn targets, amber for multi-turn
      ctx.fillStyle = isImmediate ? 'rgba(230,57,70,0.22)' : 'rgba(245,158,11,0.15)';
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
    }
    ctx.fill();
  }
}

/**
 * Draw borders on the real board around all hexes in range of a unit,
 * so the player can see which area on the map the HexTargetPicker represents.
 * Eligible hexes get a bright crimson border; other in-range hexes get a dim border.
 */
export function drawRangeBorders(
  ctx: CanvasRenderingContext2D,
  centerHex: Hex,
  radius: number,
  eligibleKeys: Set<string>,
  cam: Camera,
): void {
  const size = BASE_HEX_SIZE * cam.zoom;
  const prevAlpha = ctx.globalAlpha;

  for (const hex of hexesInRange(centerHex, radius)) {
    const key = hexKey(hex);
    const isEligible = eligibleKeys.has(key);
    const wp = hexToPixel(hex, BASE_HEX_SIZE);
    const sx = cam.x + wp.x * cam.zoom;
    const sy = cam.y + wp.y * cam.zoom;

    hexPath(ctx, sx, sy, size);

    if (isEligible) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#e63946';
      ctx.lineWidth = 2;
    } else {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
    }
    ctx.stroke();
  }

  ctx.globalAlpha = prevAlpha;
}

// ── Command arrow colours — crimson themed ──────────────────────────────────

const ARROW_STYLES: Record<string, { color: string; dash: number[] }> = {
  move:        { color: '#e63946', dash: [6, 4] },
  attack:      { color: '#ff2244', dash: [] },
  gather:      { color: '#22c55e', dash: [6, 4] },
  build:       { color: '#fbbf24', dash: [4, 3] },
  phase_surge: { color: '#c084fc', dash: [6, 4] },
};

/** Draw an arrowhead pointing from (fx,fy) -> (tx,ty). */
function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  fx: number, fy: number,
  tx: number, ty: number,
  size: number,
): void {
  const angle = Math.atan2(ty - fy, tx - fx);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(
    tx - size * Math.cos(angle - Math.PI / 6),
    ty - size * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    tx - size * Math.cos(angle + Math.PI / 6),
    ty - size * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw arrows from each unit to its committed order target.
 * For build orders, also draws a ghost of the planned structure.
 */
export function drawCommandArrows(
  ctx: CanvasRenderingContext2D,
  units: Map<string, Unit>,
  unitOrders: Map<string, UnitCommand>,
  defaultOrderUnitIds: Set<string>,
  cam: Camera,
  /** When true, only draw persistent multi-turn paths (pendingBuild / moveTargetHex). */
  persistentOnly = false,
  /** Animated world-space pixel positions for units (used during execution animation). */
  animatedPositions?: Map<string, { x: number; y: number }>,
): void {
  const prevAlpha = ctx.globalAlpha;
  const r = BASE_HEX_SIZE * cam.zoom * 0.32;

  for (const [unitId, cmd] of unitOrders) {
    // Only commands with a targetHex get arrows.
    if (!('targetHex' in cmd)) continue;

    const unit = units.get(unitId);
    if (!unit || unit.owner !== 'player') continue;

    // Skip default (auto-populated) orders — keep the display clean.
    // Exception: show persistent multi-turn paths (moveTargetHex / pendingBuild).
    const isDefault = defaultOrderUnitIds.has(unitId);
    const isPersistent = !!(unit.moveTargetHex || unit.pendingBuild);
    if (isDefault && !isPersistent) continue;
    if (persistentOnly && !isPersistent) continue;

    // When a drone has a pending build, show a yellow build-style arrow to the
    // build target instead of a red move arrow — the move is just the means.
    const hasPendingBuild = unit.pendingBuild && isDefault;
    const effectiveType = hasPendingBuild ? 'build' : cmd.type;
    const effectiveTarget = hasPendingBuild ? unit.pendingBuild!.targetHex : cmd.targetHex;

    if (hexEqual(unit.hex, effectiveTarget)) continue;

    const style = ARROW_STYLES[effectiveType];
    if (!style) continue;
    // Dim persistent multi-turn paths vs explicit orders.
    const lineAlpha = isDefault ? 0.4 : 0.7;

    const fromWp = animatedPositions?.get(unitId) ?? hexToPixel(unit.hex, BASE_HEX_SIZE);
    const toWp   = hexToPixel(effectiveTarget, BASE_HEX_SIZE);
    const fx = cam.x + fromWp.x * cam.zoom;
    const fy = cam.y + fromWp.y * cam.zoom;
    const tx = cam.x + toWp.x * cam.zoom;
    const ty = cam.y + toWp.y * cam.zoom;

    // Shorten arrow so it doesn't overlap source/target centers.
    const dx = tx - fx;
    const dy = ty - fy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) continue;
    const ux = dx / len;
    const uy = dy / len;
    const inset = r + 2;
    const asx = fx + ux * inset;
    const asy = fy + uy * inset;
    const ex = tx - ux * inset;
    const ey = ty - uy * inset;

    // Draw line.
    ctx.globalAlpha = lineAlpha;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 2;
    ctx.setLineDash(style.dash);
    ctx.beginPath();
    ctx.moveTo(asx, asy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw arrowhead.
    ctx.fillStyle = style.color;
    drawArrowhead(ctx, asx, asy, ex, ey, 7 * cam.zoom);

    // Build orders: draw a ghost of the planned structure at the target.
    const buildStructureType: StructureType | null = hasPendingBuild
      ? unit.pendingBuild!.structureType
      : cmd.type === 'build' ? (cmd as { structureType: StructureType }).structureType : null;
    if (effectiveType === 'build' && buildStructureType) {
      ctx.globalAlpha = isDefault ? 0.2 : 0.3;
      paintStructure(ctx, tx, ty, r, buildStructureType, style.color);
      // Dashed ring around the ghost.
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(tx, ty, r + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.globalAlpha = prevAlpha;
}

// ── Animation draw helpers ─────────────────────────────────────────────────

/** Draw a crimson defend ring around a screen position. */
function drawDefendMarker(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
): void {
  ctx.strokeStyle = PLAYER_COLOR;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
  ctx.stroke();

  // Shield icon inside the ring
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = PLAYER_COLOR;
  ctx.beginPath();
  ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw a damage flash with weapon-impact sparks. */
function drawDamageFlash(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
  intensity: number,
): void {
  ctx.globalAlpha = intensity * 0.5;
  ctx.fillStyle = '#ff2244';
  ctx.beginPath();
  ctx.arc(sx, sy, r + 6, 0, Math.PI * 2);
  ctx.fill();

  // Impact sparks — spawn particles on first pulse
  if (intensity > 0.8) {
    spawnParticles(sx, sy, 2, 'spark', '#ff6b4a', r, 30, 0.4, r * 0.12);
  }
}

/** Draw an expanding ring for a destroyed entity with explosion particles. */
function drawDeathRing(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
  progress: number,
  color: string,
): void {
  const expandR = r + r * progress * 2.5;
  ctx.globalAlpha = (1 - progress) * 0.8;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(sx, sy, expandR, 0, Math.PI * 2);
  ctx.stroke();

  // Inner flash
  ctx.globalAlpha = (1 - progress) * 0.2;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(sx, sy, expandR * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Spawn explosion particles on early progress
  if (progress < 0.15 && Math.random() < 0.5) {
    spawnParticles(sx, sy, 4, 'spark', color, r * 0.5, 50, 0.8, r * 0.15);
    spawnParticles(sx, sy, 2, 'attack', '#ff8800', r * 0.3, 25, 0.6, r * 0.1);
  }
}

/** Draw a spawn glow effect (expanding crimson circle, fading in). */
function drawSpawnGlow(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number, r: number,
  progress: number,
): void {
  ctx.globalAlpha = progress * 0.4;
  ctx.fillStyle = PLAYER_COLOR;
  ctx.beginPath();
  ctx.arc(sx, sy, r * (0.5 + progress * 0.5), 0, Math.PI * 2);
  ctx.fill();

  // Outer glow ring
  ctx.globalAlpha = progress * 0.3;
  ctx.strokeStyle = PLAYER_GLOW;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, r * (0.7 + progress * 0.5), 0, Math.PI * 2);
  ctx.stroke();
}

/** Draw weapon attack effect: muzzle flash and projectile trail. */
function drawWeaponEffect(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number,
  progress: number,
  color: string,
  r: number,
): void {
  if (progress < 0 || progress > 1) return;

  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  // Projectile position along the line
  const projT = Math.min(1, progress * 3); // projectile moves 3x faster
  const projX = fromX + dx * projT;
  const projY = fromY + dy * projT;

  // Muzzle flash at source (brief)
  if (progress < 0.2) {
    const flashAlpha = (0.2 - progress) / 0.2;
    ctx.globalAlpha = flashAlpha * 0.7;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(fromX, fromY, r * 0.5 * flashAlpha, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(fromX, fromY, r * 0.35 * flashAlpha, 0, Math.PI * 2);
    ctx.fill();
  }

  // Projectile trail
  if (projT < 1) {
    const trailLen = Math.min(len * 0.3, 15);
    const ux = dx / len;
    const uy = dy / len;

    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(projX, projY);
    ctx.lineTo(projX - ux * trailLen, projY - uy * trailLen);
    ctx.stroke();

    // Bright projectile head
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(projX, projY, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Particle update & draw (called from GameCanvas render loop) ─────────────

/** Update and render all active particles. Call once per frame. */
export function drawParticles(ctx: CanvasRenderingContext2D, dt: number): void {
  updateAndDrawParticles(ctx, dt);
}

// ── Ability VFX (drawn during execution animation) ──────────────────────────

/**
 * Draw Chrono Shift VFX: rewind shimmer around a unit that was time-shifted.
 * Shows a clockwise sweeping arc + temporal particles during the defend phase.
 */
export function drawChronoShiftVFX(
  ctx: CanvasRenderingContext2D,
  animation: ExecutionAnimation,
  cam: Camera,
  elapsed: number,
): void {
  const phase = getCurrentPhase(elapsed);
  if (phase !== 'defend') return;
  const dp = getPhaseProgress(elapsed, PHASE_DEFEND);
  if (dp < 0) return;

  const r = BASE_HEX_SIZE * cam.zoom * 0.32;
  const prevAlpha = ctx.globalAlpha;

  for (const anim of animation.units.values()) {
    if (!anim.wasChronoShifted) continue;

    const sx = cam.x + anim.toPixel.x * cam.zoom;
    const sy = cam.y + anim.toPixel.y * cam.zoom;

    // Clockwise sweep arc (like a clock hand rewinding)
    const sweepAngle = dp * Math.PI * 4; // 2 full sweeps
    ctx.globalAlpha = (1 - dp) * 0.6;
    ctx.strokeStyle = '#60a5fa'; // blue
    ctx.lineWidth = 3 * cam.zoom;
    ctx.beginPath();
    ctx.arc(sx, sy, r + 6 * cam.zoom, -Math.PI / 2, -Math.PI / 2 + sweepAngle);
    ctx.stroke();

    // Inner glow ring
    const ringR = r + 4 * cam.zoom + dp * 8 * cam.zoom;
    ctx.globalAlpha = (1 - dp) * 0.35;
    const grad = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, ringR);
    grad.addColorStop(0, 'rgba(96, 165, 250, 0.0)');
    grad.addColorStop(0.7, 'rgba(96, 165, 250, 0.3)');
    grad.addColorStop(1, 'rgba(96, 165, 250, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
    ctx.fill();

    // Shield icon (small diamond) indicating damage shield
    if (dp > 0.5) {
      const shieldAlpha = Math.min(1, (dp - 0.5) * 4);
      ctx.globalAlpha = shieldAlpha * 0.8;
      ctx.fillStyle = '#93c5fd';
      const ds = r * 0.3;
      ctx.beginPath();
      ctx.moveTo(sx, sy - r - ds * 1.5);
      ctx.lineTo(sx + ds, sy - r - ds * 0.5);
      ctx.lineTo(sx, sy - r + ds * 0.2);
      ctx.lineTo(sx - ds, sy - r - ds * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.globalAlpha = prevAlpha;
}

/**
 * Draw Phase Surge VFX: speed trails behind a surging unit during the move phase.
 * Shows stretched afterimages and motion lines.
 */
export function drawPhaseSurgeVFX(
  ctx: CanvasRenderingContext2D,
  animation: ExecutionAnimation,
  cam: Camera,
  elapsed: number,
): void {
  const phase = getCurrentPhase(elapsed);
  if (phase !== 'move') return;
  const mp = getPhaseProgress(elapsed, PHASE_MOVE);
  if (mp < 0 || mp >= 1) return;

  const r = BASE_HEX_SIZE * cam.zoom * 0.32;
  const prevAlpha = ctx.globalAlpha;

  for (const anim of animation.units.values()) {
    if (!anim.wasPhaseSurged) continue;

    const curPos = getAnimatedUnitPosition(anim, elapsed);
    const sx = cam.x + curPos.x * cam.zoom;
    const sy = cam.y + curPos.y * cam.zoom;

    // Direction of travel
    const dx = anim.toPixel.x - anim.fromPixel.x;
    const dy = anim.toPixel.y - anim.fromPixel.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;

    const ux = dx / len;
    const uy = dy / len;

    // Trailing afterimages (3 ghosts behind the unit)
    const color = entityColor(anim.owner);
    for (let i = 1; i <= 3; i++) {
      const trailDist = i * r * 1.2;
      const tx = sx - ux * trailDist * cam.zoom;
      const ty = sy - uy * trailDist * cam.zoom;
      ctx.globalAlpha = 0.15 * (1 - i / 4);
      paintUnit(ctx, tx, ty, r * (1 - i * 0.1), anim.unitType, color);
    }

    // Speed lines — parallel streaks flanking the unit
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#c084fc'; // purple surge color
    ctx.lineWidth = 1.5 * cam.zoom;
    const perpX = -uy;
    const perpY = ux;

    for (let side = -1; side <= 1; side += 2) {
      for (let j = 0; j < 3; j++) {
        const offset = (r * 0.6 + j * r * 0.4) * side;
        const lineLen = r * (2 + j * 0.5);
        const lx = sx + perpX * offset * cam.zoom;
        const ly = sy + perpY * offset * cam.zoom;
        ctx.globalAlpha = 0.25 * (1 - j / 4);
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx - ux * lineLen * cam.zoom, ly - uy * lineLen * cam.zoom);
        ctx.stroke();
      }
    }
  }

  ctx.globalAlpha = prevAlpha;
}

/**
 * Draw Epoch Anchor Activate VFX: golden flash over all player units at the start
 * of the defend phase, indicating they're being restored to anchored state.
 */
export function drawAnchorActivateVFX(
  ctx: CanvasRenderingContext2D,
  animation: ExecutionAnimation,
  cam: Camera,
  elapsed: number,
  cssW: number,
  cssH: number,
): void {
  if (!animation.anchorActivated) return;

  const phase = getCurrentPhase(elapsed);
  if (phase !== 'defend') return;
  const dp = getPhaseProgress(elapsed, PHASE_DEFEND);
  if (dp < 0) return;

  const prevAlpha = ctx.globalAlpha;
  const r = BASE_HEX_SIZE * cam.zoom * 0.32;

  // Screen-wide golden flash (brief, fading quickly)
  if (dp < 0.3) {
    const flashAlpha = (0.3 - dp) / 0.3 * 0.15;
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, 0, cssW, cssH);
  }

  // Golden ring expanding from each player unit
  for (const anim of animation.units.values()) {
    if (anim.owner !== 'player') continue;

    const sx = cam.x + anim.toPixel.x * cam.zoom;
    const sy = cam.y + anim.toPixel.y * cam.zoom;

    const ringR = r + dp * r * 2;
    ctx.globalAlpha = (1 - dp) * 0.4;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2 * cam.zoom;
    ctx.beginPath();
    ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // Inner golden fill
    ctx.globalAlpha = (1 - dp) * 0.1;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = prevAlpha;
}

// ── Main animation draw functions ──────────────────────────────────────────

/** Draw units at interpolated positions during the execution animation. */
export function drawAnimatedUnits(
  ctx: CanvasRenderingContext2D,
  animation: ExecutionAnimation,
  cam: Camera,
  elapsed: number,
  fogCells?: Map<string, HexCell> | null,
): void {
  const r = BASE_HEX_SIZE * cam.zoom * 0.32;
  const prevAlpha = ctx.globalAlpha;
  const phase = getCurrentPhase(elapsed);

  for (const anim of animation.units.values()) {
    // Hide AI units outside player vision (check both from and to hex).
    if (anim.owner === 'ai' && fogCells) {
      const fromCell = fogCells.get(hexKey(anim.fromHex));
      const toCell = fogCells.get(hexKey(anim.toHex));
      if ((!fromCell || fromCell.fog !== 'visible') && (!toCell || toCell.fog !== 'visible')) continue;
    }

    const color = entityColor(anim.owner);

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

    // Draw damage flash and weapon effects during attack phase.
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

  // ── Weapon effects between attacking and defending units ────────────────
  if (phase === 'attack') {
    const ap = getPhaseProgress(elapsed, PHASE_ATTACK);
    if (ap >= 0) {
      // Find pairs: units that took damage from enemies
      for (const target of animation.units.values()) {
        if (target.newHp >= target.oldHp && !target.wasDestroyed) continue;

        const targetPos = getAnimatedUnitPosition(target, elapsed);
        const tsx = cam.x + targetPos.x * cam.zoom;
        const tsy = cam.y + targetPos.y * cam.zoom;

        // Find nearest enemy unit as attacker source
        let nearestDist = Infinity;
        let attackerSx = tsx;
        let attackerSy = tsy;
        for (const other of animation.units.values()) {
          if (other.owner === target.owner) continue;
          if (other.wasDestroyed || other.wasSpawned) continue;
          const oPos = getAnimatedUnitPosition(other, elapsed);
          const osx = cam.x + oPos.x * cam.zoom;
          const osy = cam.y + oPos.y * cam.zoom;
          const dist = Math.hypot(osx - tsx, osy - tsy);
          if (dist < nearestDist) {
            nearestDist = dist;
            attackerSx = osx;
            attackerSy = osy;
          }
        }

        if (nearestDist < Infinity && nearestDist > r * 2) {
          const attackerColor = target.owner === 'player' ? AI_GLOW : PLAYER_GLOW;
          // Stagger weapon effects using pulse
          const pulse3 = (ap * 3) % 1;
          drawWeaponEffect(ctx, attackerSx, attackerSy, tsx, tsy, pulse3, attackerColor, r);
        }
      }
    }
  }

  ctx.globalAlpha = prevAlpha;
}

/** Draw structures with damage/build effects during execution animation. */
export function drawAnimatedStructures(
  ctx: CanvasRenderingContext2D,
  animation: ExecutionAnimation,
  cam: Camera,
  elapsed: number,
  fogCells?: Map<string, HexCell> | null,
): void {
  const r = BASE_HEX_SIZE * cam.zoom * 0.32;
  const prevAlpha = ctx.globalAlpha;
  const phase = getCurrentPhase(elapsed);

  for (const anim of animation.structures.values()) {
    // Hide AI structures in unexplored fog.
    if (anim.owner === 'ai' && fogCells) {
      const cell = fogCells.get(hexKey(anim.hex));
      if (!cell || cell.fog === 'unexplored') continue;
    }
    const sx = cam.x + anim.pixel.x * cam.zoom;
    const sy = cam.y + anim.pixel.y * cam.zoom;
    const color = entityColor(anim.owner);

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
  fogCells?: Map<string, HexCell> | null,
): void {
  const phase = getCurrentPhase(elapsed);
  if (phase !== 'attack') return;

  const ap = getPhaseProgress(elapsed, PHASE_ATTACK);
  if (ap < 0) return;

  const prevAlpha = ctx.globalAlpha;
  const r = BASE_HEX_SIZE * cam.zoom * 0.32;

  // Destroyed units: fade out + expanding ring + explosion particles.
  for (const anim of animation.destroyedUnits) {
    if (anim.owner === 'ai' && fogCells) {
      const cell = fogCells.get(hexKey(anim.fromHex));
      if (!cell || cell.fog !== 'visible') continue;
    }
    const sx = cam.x + anim.fromPixel.x * cam.zoom;
    const sy = cam.y + anim.fromPixel.y * cam.zoom;
    const color = entityColor(anim.owner);

    ctx.globalAlpha = (1 - ap) * 0.85;
    paintUnit(ctx, sx, sy, r, anim.unitType, color);
    drawDeathRing(ctx, sx, sy, r, ap, color);
  }

  // Destroyed structures: fade out + expanding ring.
  for (const anim of animation.destroyedStructures) {
    if (anim.owner === 'ai' && fogCells) {
      const cell = fogCells.get(hexKey(anim.hex));
      if (!cell || cell.fog === 'unexplored') continue;
    }
    const sx = cam.x + anim.pixel.x * cam.zoom;
    const sy = cam.y + anim.pixel.y * cam.zoom;
    const color = entityColor(anim.owner);

    ctx.globalAlpha = (1 - ap) * 0.85;
    paintStructure(ctx, sx, sy, r, anim.structureType, color);
    drawDeathRing(ctx, sx, sy, r, ap, color);
  }

  ctx.globalAlpha = prevAlpha;
}

/**
 * Draw merge animation: consumed units slide toward the survivor and fade out
 * during the defend phase (0-0.5s).
 */
export function drawMergeAnimations(
  ctx: CanvasRenderingContext2D,
  animation: ExecutionAnimation,
  cam: Camera,
  elapsed: number,
): void {
  if (animation.mergedUnits.length === 0) return;

  const dp = getPhaseProgress(elapsed, PHASE_DEFEND);
  if (dp < 0) return;

  const r = BASE_HEX_SIZE * cam.zoom * 0.32;
  const prevAlpha = ctx.globalAlpha;

  // Ease-out interpolation
  const t = 1 - (1 - dp) * (1 - dp);

  for (const anim of animation.mergedUnits) {
    const color = entityColor(anim.owner);

    // Interpolate from original position toward survivor
    const fx = cam.x + anim.fromPixel.x * cam.zoom;
    const fy = cam.y + anim.fromPixel.y * cam.zoom;
    const tx = cam.x + anim.toPixel.x * cam.zoom;
    const ty = cam.y + anim.toPixel.y * cam.zoom;

    const cx = fx + (tx - fx) * t;
    const cy = fy + (ty - fy) * t;

    // Fade out and shrink as it gets closer
    const scale = 1 - t * 0.6;
    ctx.globalAlpha = (1 - t) * 0.85;
    paintUnit(ctx, cx, cy, r * scale, anim.unitType, color);

    // Trail effect: thin line from original position
    if (t > 0.1) {
      ctx.globalAlpha = (1 - t) * 0.3;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
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
 * Draw Temporal Echo overlays — translucent crimson ghost indicators showing the
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
  const pulse      = 0.45 + 0.3 * Math.sin(timeMs / 700); // 0.45-0.75 oscillation
  const hexR       = BASE_HEX_SIZE * cam.zoom;
  const alphaFill  = pulse * 0.18;
  const alphaLabel = pulse * 0.9;
  const prevAlpha  = ctx.globalAlpha;

  ctx.strokeStyle  = '#e63946';
  ctx.fillStyle    = '#e63946';
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

// ── Echo Reveal: spiral time-travel mist ──────────────────────────────────────

/** Progress of the echo reveal cinematic (0→1). */
export interface EchoRevealState {
  /** World-space center of the echo targets to zoom toward. */
  targetWorldX: number;
  targetWorldY: number;
  /** Timestamp the reveal started (performance.now()). */
  startedAt: number;
  /** Duration of the full reveal in ms. */
  durationMs: number;
}

/** Total echo reveal duration in ms. */
export const ECHO_REVEAL_DURATION_MS = 2400;

/**
 * Draw a spiral time-travel mist effect that radiates outward from screen center.
 * Called each frame during the echo reveal cinematic.
 *
 * t=0: dense swirling mist.  t=0.5: mist at peak during zoom-in.  t=1: mist fades.
 */
export function drawEchoRevealMist(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  t: number,
): void {
  const prevAlpha = ctx.globalAlpha;
  const cx = cssW / 2;
  const cy = cssH / 2;
  const maxR = Math.hypot(cx, cy) * 1.2;

  // Opacity envelope: fade in 0-0.15, hold 0.15-0.7, fade out 0.7-1.0
  const opacity =
    t < 0.15 ? t / 0.15
    : t < 0.7 ? 1
    : 1 - (t - 0.7) / 0.3;

  // Spiral arm count and rotation speed
  const arms = 5;
  const rotation = t * Math.PI * 4; // 2 full rotations over the reveal

  // Draw multiple spiraling mist tendrils
  for (let arm = 0; arm < arms; arm++) {
    const baseAngle = (arm / arms) * Math.PI * 2 + rotation;

    // Each arm is a series of fading circles along a spiral
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const frac = i / steps;
      const r = frac * maxR * (0.3 + t * 0.7);
      const spiralTwist = frac * Math.PI * 2.5;
      const angle = baseAngle + spiralTwist;

      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;

      // Each blob fades with distance and overall opacity
      const distFade = 1 - frac * 0.7;
      const blobAlpha = opacity * distFade * 0.12;
      const blobR = maxR * 0.08 * (1 + frac * 0.5);

      ctx.globalAlpha = blobAlpha;

      // Crimson-tinted radial gradient for each blob
      const grad = ctx.createRadialGradient(x, y, 0, x, y, blobR);
      grad.addColorStop(0, 'rgba(230, 57, 70, 0.6)');
      grad.addColorStop(0.5, 'rgba(180, 40, 55, 0.3)');
      grad.addColorStop(1, 'rgba(120, 20, 40, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, blobR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Central vortex glow — bright swirling core
  {
    const coreAlpha = opacity * 0.25;
    const coreR = maxR * 0.15 * (0.5 + t * 0.5);
    ctx.globalAlpha = coreAlpha;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    grad.addColorStop(0, 'rgba(255, 200, 180, 0.8)');
    grad.addColorStop(0.4, 'rgba(230, 57, 70, 0.4)');
    grad.addColorStop(1, 'rgba(100, 20, 30, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Floating mist wisps — scattered translucent circles drifting outward
  {
    const wispCount = 20;
    for (let i = 0; i < wispCount; i++) {
      // Deterministic positions based on index, animated by t
      const seed = i * 137.508; // golden angle
      const angle = seed + t * Math.PI * 3;
      const drift = (0.2 + (i % 7) / 7) * maxR * (0.1 + t * 0.9);
      const x = cx + Math.cos(angle) * drift;
      const y = cy + Math.sin(angle) * drift;
      const wispR = maxR * 0.03 * (0.5 + (i % 3) * 0.3);
      const wispAlpha = opacity * 0.08 * (1 - drift / maxR);

      if (wispAlpha < 0.005) continue;

      ctx.globalAlpha = wispAlpha;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(230, 57, 70, 0.5)' : 'rgba(200, 60, 80, 0.4)';
      ctx.beginPath();
      ctx.arc(x, y, wispR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = prevAlpha;
}

/**
 * Compute the camera target for the echo reveal cinematic.
 * Returns zoom-out/zoom-in camera params based on progress (0→1).
 */
export function getEchoRevealCamera(
  reveal: EchoRevealState,
  cssW: number,
  cssH: number,
  userCam: Camera,
): { cam: Camera; t: number; done: boolean } {
  const elapsed = performance.now() - reveal.startedAt;
  const t = Math.min(1, elapsed / reveal.durationMs);

  if (t >= 1) {
    return { cam: userCam, t: 1, done: true };
  }

  // Easing: smooth start + end
  const ease = (x: number) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

  // Phase 1 (0–0.35): zoom out from user position
  // Phase 2 (0.35–0.65): hold wide, pan toward echo targets
  // Phase 3 (0.65–1.0): zoom in on echo targets
  const zoomOutTarget = Math.max(0.35, userCam.zoom * 0.45);
  const zoomInTarget = Math.max(0.8, userCam.zoom * 0.9);

  let zoom: number;
  let worldX: number;
  let worldY: number;

  // User camera center in world space
  const userWorldX = (cssW / 2 - userCam.x) / userCam.zoom;
  const userWorldY = (cssH / 2 - userCam.y) / userCam.zoom;

  if (t < 0.35) {
    // Zoom out
    const p = ease(t / 0.35);
    zoom = userCam.zoom + (zoomOutTarget - userCam.zoom) * p;
    worldX = userWorldX + (reveal.targetWorldX - userWorldX) * p * 0.3;
    worldY = userWorldY + (reveal.targetWorldY - userWorldY) * p * 0.3;
  } else if (t < 0.65) {
    // Hold wide, pan to targets
    const p = ease((t - 0.35) / 0.3);
    zoom = zoomOutTarget;
    worldX = userWorldX + (reveal.targetWorldX - userWorldX) * (0.3 + 0.7 * p);
    worldY = userWorldY + (reveal.targetWorldY - userWorldY) * (0.3 + 0.7 * p);
  } else {
    // Zoom in on targets
    const p = ease((t - 0.65) / 0.35);
    zoom = zoomOutTarget + (zoomInTarget - zoomOutTarget) * p;
    worldX = reveal.targetWorldX;
    worldY = reveal.targetWorldY;
  }

  const cam: Camera = {
    x: cssW / 2 - worldX * zoom,
    y: cssH / 2 - worldY * zoom,
    zoom,
  };

  return { cam, t, done: false };
}

// ── Timeline Fork overlay ─────────────────────────────────────────────────────

/**
 * Draw Timeline Fork ghost overlay.
 * Player units are shown as translucent crimson ghosts at their predicted
 * post-resolution positions, with dashed movement lines from their current
 * positions. Destroyed units appear as faded x markers at their current hex.
 */
export function drawTimelineForkOverlay(
  ctx: CanvasRenderingContext2D,
  result: TimelineForkResult,
  units: Map<string, Unit>,
  cam: Camera,
  timeMs: number,
): void {
  const pulse = 0.5 + 0.25 * Math.sin(timeMs / 600);
  const r = BASE_HEX_SIZE * cam.zoom * 0.3;
  const prevAlpha = ctx.globalAlpha;

  for (const [id, ghost] of result.ghostUnitPositions) {
    const unit = units.get(id);
    if (!unit) continue;

    const toWp  = hexToPixel(ghost.hex, BASE_HEX_SIZE);
    const { x: tx, y: ty } = worldToCanvas(toWp.x, toWp.y, cam);

    if (ghost.survived) {
      // Draw movement trail (dashed line from current -> predicted).
      const fromWp = hexToPixel(unit.hex, BASE_HEX_SIZE);
      const { x: fx, y: fy } = worldToCanvas(fromWp.x, fromWp.y, cam);
      if (fx !== tx || fy !== ty) {
        ctx.globalAlpha = pulse * 0.35;
        ctx.strokeStyle = PLAYER_GLOW;
        ctx.lineWidth   = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Ghost unit shape at predicted position.
      ctx.globalAlpha = pulse * 0.5;
      paintUnit(ctx, tx, ty, r, unit.type, PLAYER_GLOW);

      // Outer ghost ring.
      ctx.globalAlpha = pulse * 0.28;
      ctx.strokeStyle = PLAYER_GLOW;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(tx, ty, r + 3 * cam.zoom, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // x marker for units predicted to be destroyed.
      const fromWp = hexToPixel(unit.hex, BASE_HEX_SIZE);
      const { x: fx, y: fy } = worldToCanvas(fromWp.x, fromWp.y, cam);
      const xr = r * 0.7;
      ctx.globalAlpha = pulse * 0.75;
      ctx.strokeStyle = '#ff2244';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(fx - xr, fy - xr); ctx.lineTo(fx + xr, fy + xr);
      ctx.moveTo(fx + xr, fy - xr); ctx.lineTo(fx - xr, fy + xr);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = prevAlpha;
}

// ── Chrono Scout overlay ──────────────────────────────────────────────────────

/**
 * Draw Chrono Scout probability cloud overlay.
 * Renders AI unit predicted positions as amber hexagonal clouds.
 * Opacity reflects certainty: solid (1.0) = high confidence, faded (0.55) = uncertain.
 * Uncertain predictions use a dashed ring.
 */
export function drawChronoScoutOverlay(
  ctx: CanvasRenderingContext2D,
  result: ChronoScoutResult,
  cam: Camera,
  timeMs: number,
): void {
  const pulse = 0.45 + 0.3 * Math.sin(timeMs / 800);
  const hexR  = BASE_HEX_SIZE * cam.zoom;
  const r     = hexR * 0.36;
  const prevAlpha = ctx.globalAlpha;

  const fontSize = Math.max(7, Math.round(hexR * 0.28));
  ctx.font         = `bold ${fontSize}px monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  for (const pred of result.predictedPositions) {
    const wp = hexToPixel(pred.hex, BASE_HEX_SIZE);
    const { x: sx, y: sy } = worldToCanvas(wp.x, wp.y, cam);

    // Probability cloud hex fill.
    hexPath(ctx, sx, sy, hexR * 0.78);
    ctx.fillStyle   = '#fbbf24';
    ctx.globalAlpha = pulse * pred.certainty * 0.13;
    ctx.fill();

    // Outer ring (dashed for uncertain).
    ctx.globalAlpha = pulse * pred.certainty * 0.8;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth   = 1.5;
    if (pred.certainty < 0.8) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(sx, sy, r + 3 * cam.zoom, 0, Math.PI * 2);
    ctx.stroke();
    if (pred.certainty < 0.8) ctx.setLineDash([]);

    // Label: "?" for uncertain, unit type prefix for high-certainty.
    ctx.fillStyle   = '#fbbf24';
    ctx.globalAlpha = pulse * pred.certainty * 0.9;
    const label = pred.certainty < 0.8 ? '?' : pred.unitType.slice(0, 3).toUpperCase();
    ctx.fillText(label, sx, sy);
  }

  ctx.globalAlpha = prevAlpha;
}
