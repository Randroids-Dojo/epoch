'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameMap, HexCell } from '@/engine/map';
import { GameState, findUnitAt, findStructureAt } from '@/engine/state';
import { STRUCTURE_DEFS } from '@/engine/structures';
import { Hex, hexKey, hexToPixel, pixelToHex } from '@/engine/hex';
import { Camera, DEFAULT_ZOOM, zoomToward, canvasToWorld, lerpCamera } from '@/renderer/camera';
import { ActionBeat, getSequenceCameraTarget } from '@/renderer/actionSequence';
import { BASE_HEX_SIZE, drawBackground, drawHexCell } from '@/renderer/drawHex';
import { drawUnits, drawStructures, drawTargetingOverlay, drawRangeBorders, drawCommandArrows, drawAnimatedUnits, drawAnimatedStructures, drawDestroyedEntities, drawMergeAnimations, drawEchoOverlay, drawTimelineForkOverlay, drawChronoScoutOverlay, drawParticles, EchoRevealState, getEchoRevealCamera, drawEchoRevealMist } from '@/renderer/drawEntities';
import { TimelineForkResult, ChronoScoutResult } from '@/engine/simulation';
import { InteractionMode } from '@/lib/types';
import { ExecutionAnimation, getAnimatedUnitPosition } from '@/renderer/animation';
import { Command, PHASE_SURGE_SPEED_BONUS } from '@/engine/commands';
import { UNIT_DEFS } from '@/engine/units';

const ZOOM_STEP       = 1.15;
const PAN_SPEED       = 20; // CSS px per keypress
const MOUSE_TAP_PX    = 4;
const TOUCH_TAP_PX    = 8;

interface GameCanvasProps {
  gameState: GameState;
  mode: InteractionMode;
  animation: ExecutionAnimation | null;
  /** Cinematic camera beats for the execution animation. */
  actionBeats: ActionBeat[] | null;
  echoCommands: Command[] | null;
  echoReveal?: EchoRevealState | null;
  onEchoRevealDone?: () => void;
  timelineForkResult?: TimelineForkResult | null;
  chronoScoutResult?: ChronoScoutResult | null;
  onHexClick(hex: Hex): void;
  onCameraChange?: (snapshot: CameraSnapshot) => void;
  centerRequest?: CameraCenterRequest | null;
}

export interface CameraSnapshot {
  camera: Camera;
  viewportWorld: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  canvasSize: {
    width: number;
    height: number;
  };
}

export interface CameraCenterRequest {
  nonce: number;
  worldX: number;
  worldY: number;
}

function HexInfoPanel({ gameState, cell }: { gameState: GameState; cell: HexCell }) {
  const unit = findUnitAt(gameState, cell.hex);
  const structure = findStructureAt(gameState, cell.hex);
  const title = structure
    ? STRUCTURE_DEFS[structure.type].label
    : unit
      ? UNIT_DEFS[unit.type].label
      : `Hex (${cell.hex.q}, ${cell.hex.r})`;

  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded border border-slate-700 px-3 py-2 font-mono text-xs text-center"
      style={{ bottom: 128, background: 'rgba(11,10,15,0.92)', color: '#94a3b8', zIndex: 20 }}
    >
      <div className="mb-1" style={{ color: '#e63946' }}>{title}</div>
      {structure && <div>{structure.owner === 'player' ? 'Friendly' : 'Enemy'}</div>}
      {unit && !structure && <div>{unit.owner === 'player' ? 'Friendly' : 'Enemy'} unit</div>}
      <div>{cell.terrain.replace('_', ' ')}</div>
    </div>
  );
}

function getInitialCamera(map: GameMap, cssW: number, cssH: number): Camera {
  const { x: wx, y: wy } = hexToPixel(map.playerStart, BASE_HEX_SIZE);
  return {
    x: cssW / 2 - wx * DEFAULT_ZOOM,
    y: cssH / 2 - wy * DEFAULT_ZOOM,
    zoom: DEFAULT_ZOOM,
  };
}

export default function GameCanvas({
  gameState,
  mode,
  animation,
  actionBeats,
  echoCommands,
  echoReveal,
  onEchoRevealDone,
  timelineForkResult,
  chronoScoutResult,
  onHexClick,
  onCameraChange,
  centerRequest,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef    = useRef<Camera>({ x: 0, y: 0, zoom: DEFAULT_ZOOM });
  const mapRef    = useRef<GameMap | null>(null);
  const frameRef  = useRef<number>(0);
  const dprRef    = useRef(1);
  const lastFrameTimeRef = useRef(0);

  // ── Cinematic camera state ────────────────────────────────────────────────
  /** User camera saved when cinematic sequence starts, restored on end. */
  const savedCamRef = useRef<Camera | null>(null);
  const actionBeatsRef = useRef<ActionBeat[] | null>(null);
  actionBeatsRef.current = actionBeats;

  // Keep mapRef in sync with the current game state map.
  mapRef.current = gameState.map;

  // Selected hex key — kept in a ref for the render loop, in state for the info panel.
  const selectedRef = useRef<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<HexCell | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Clear selection when execution starts (animation becomes non-null).
  useEffect(() => {
    if (animation) {
      selectedRef.current = null;
      setSelectedCell(null);
    }
  }, [animation]);

  // Keep mode accessible in render without re-creating the callback.
  const modeRef = useRef<InteractionMode>(mode);
  modeRef.current = mode;

  // Guard against touch → synthetic mouse double-tap.
  const lastTouchTapTime = useRef(0);

  // ── Pan state ──────────────────────────────────────────────────────────────
  const dragging  = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  // ── Pinch state ────────────────────────────────────────────────────────────
  const pinchDist = useRef<number | null>(null);

  // Keep a stable ref to the latest onHexClick so we don't recreate render.
  const onHexClickRef = useRef(onHexClick);
  onHexClickRef.current = onHexClick;

  // Keep refs to the latest gameState and animation for the render loop.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const animationRef = useRef<ExecutionAnimation | null>(animation);
  animationRef.current = animation;

  const echoCommandsRef = useRef<Command[] | null>(echoCommands);
  echoCommandsRef.current = echoCommands;

  const echoRevealRef = useRef<EchoRevealState | null>(echoReveal ?? null);
  echoRevealRef.current = echoReveal ?? null;

  const onEchoRevealDoneRef = useRef(onEchoRevealDone);
  onEchoRevealDoneRef.current = onEchoRevealDone;

  /** User camera saved when echo reveal starts, restored when it ends. */
  const echoRevealSavedCamRef = useRef<Camera | null>(null);

  const timelineForkResultRef = useRef<TimelineForkResult | null>(timelineForkResult ?? null);
  timelineForkResultRef.current = timelineForkResult ?? null;

  const chronoScoutResultRef = useRef<ChronoScoutResult | null>(chronoScoutResult ?? null);
  chronoScoutResultRef.current = chronoScoutResult ?? null;

  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;

  const lastCameraSnapshotRef = useRef<CameraSnapshot | null>(null);

  // ── Render loop ────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const map    = mapRef.current;
    if (!canvas || !map) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cam  = camRef.current;
    const dpr  = dprRef.current;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const gs   = gameStateRef.current;
    const m    = modeRef.current;

    // ── Cinematic camera drive during execution ───────────────────────────
    const aBeats = actionBeatsRef.current;
    const curAnim = animationRef.current;
    if (curAnim && aBeats && aBeats.length > 0) {
      // Save user camera on first frame of animation.
      if (!savedCamRef.current) {
        savedCamRef.current = { ...cam };
      }

      const elapsed = (performance.now() - curAnim.startedAt) / 1000;
      const target = getSequenceCameraTarget(aBeats, elapsed);

      if (target) {
        // Build target camera: center the target world position on screen.
        const targetCam: Camera = {
          x: cssW / 2 - target.worldX * target.zoom,
          y: cssH / 2 - target.worldY * target.zoom,
          zoom: target.zoom,
        };

        // Smooth lerp toward target (chasing spring feel).
        cam = lerpCamera(cam, targetCam, 0.12);
        camRef.current = cam;
      }
    } else if (savedCamRef.current) {
      // Animation ended — smoothly return to user camera.
      const saved = savedCamRef.current;
      const dist = Math.abs(cam.x - saved.x) + Math.abs(cam.y - saved.y) + Math.abs(cam.zoom - saved.zoom) * 100;
      if (dist < 1) {
        // Close enough — snap and clear.
        camRef.current = saved;
        cam = saved;
        savedCamRef.current = null;
      } else {
        cam = lerpCamera(cam, saved, 0.1);
        camRef.current = cam;
      }
    }

    // ── Echo reveal cinematic camera drive ────────────────────────────────
    let echoRevealT = -1; // <0 means not active
    const reveal = echoRevealRef.current;
    if (reveal) {
      if (!echoRevealSavedCamRef.current) {
        echoRevealSavedCamRef.current = { ...cam };
      }
      const result = getEchoRevealCamera(reveal, cssW, cssH, echoRevealSavedCamRef.current);
      echoRevealT = result.t;
      if (result.done) {
        echoRevealSavedCamRef.current = null;
        onEchoRevealDoneRef.current?.();
      } else {
        cam = result.cam;
        camRef.current = cam;
      }
    } else if (echoRevealSavedCamRef.current) {
      echoRevealSavedCamRef.current = null;
    }

    // Reset transform every frame so DPR scaling is idempotent.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(ctx, cssW, cssH);

    const hexSize = BASE_HEX_SIZE * cam.zoom;
    const pad     = hexSize * 2;

    for (const cell of map.cells.values()) {
      const wp           = hexToPixel(cell.hex, BASE_HEX_SIZE);
      const sx = cam.x + wp.x * cam.zoom;
      const sy = cam.y + wp.y * cam.zoom;
      // Cull off-screen hexes.
      if (sx < -pad || sx > cssW + pad || sy < -pad || sy > cssH + pad) continue;
      const key = hexKey(cell.hex);
      drawHexCell(ctx, cell, cam, sx, sy, selectedRef.current === key);
    }

    // ── Targeting overlay ────────────────────────────────────────────────────
    if (m.kind === 'targeting' || m.kind === 'build_targeting') {
      const immediateKeys = (m.kind === 'targeting' && m.immediateKeys) ? m.immediateKeys : undefined;
      drawTargetingOverlay(ctx, map.cells, m.eligibleKeys, cam, immediateKeys);

      // Draw range borders on the real board matching the HexTargetPicker area.
      const targetUnit = gs.units.get(m.unitId);
      if (targetUnit) {
        let radius: number;
        if (m.kind === 'targeting') {
          if (m.commandType === 'attack') {
            // Attack-move: no range border — the unit can target any hex.
            radius = 0;
          } else if (m.commandType === 'phase_surge') {
            radius = UNIT_DEFS[targetUnit.type].speed + PHASE_SURGE_SPEED_BONUS;
          } else {
            radius = UNIT_DEFS[targetUnit.type].speed;
          }
        } else {
          radius = UNIT_DEFS[targetUnit.type].speed;
        }
        drawRangeBorders(ctx, targetUnit.hex, radius, m.eligibleKeys, cam);
      }
    }

    // ── Structures + units ───────────────────────────────────────────────────
    const anim = animationRef.current;
    if (anim) {
      const elapsed = (performance.now() - anim.startedAt) / 1000;
      drawAnimatedStructures(ctx, anim, cam, elapsed);
      drawDestroyedEntities(ctx, anim, cam, elapsed);
      drawMergeAnimations(ctx, anim, cam, elapsed);
      drawAnimatedUnits(ctx, anim, cam, elapsed);
    } else {
      drawStructures(ctx, gs.structures, cam);
      const activeUnitId = ('unitId' in m) ? m.unitId : null;
      drawUnits(ctx, gs.units, cam, activeUnitId);
    }

    // ── Particle effects (gather sparks, weapon impacts, explosions) ─────────
    const now = performance.now();
    const dt = lastFrameTimeRef.current ? Math.min(0.05, (now - lastFrameTimeRef.current) / 1000) : 0.016;
    lastFrameTimeRef.current = now;
    drawParticles(ctx, dt);

    // ── Command arrows ────────────────────────────────────────────────────────
    {
      const player = gs.players.player;
      if (anim) {
        // Build animated positions so path lines start from the unit's current
        // interpolated position, not its static hex.
        const elapsed = (performance.now() - anim.startedAt) / 1000;
        const animPositions = new Map<string, { x: number; y: number }>();
        for (const [uid, ua] of anim.units) {
          animPositions.set(uid, getAnimatedUnitPosition(ua, elapsed));
        }
        drawCommandArrows(ctx, gs.units, player.unitOrders, player.defaultOrderUnitIds, cam, true, animPositions);
      } else {
        drawCommandArrows(ctx, gs.units, player.unitOrders, player.defaultOrderUnitIds, cam);
      }
    }

    // ── Temporal Echo overlay (planning phase only) ───────────────────────────
    const echo = echoCommandsRef.current;
    if (echo && echo.length > 0 && !anim) {
      drawEchoOverlay(ctx, echo, cam, performance.now());
    }

    // ── Echo reveal mist overlay (during cinematic) ─────────────────────────
    if (echoRevealT >= 0 && echoRevealT < 1) {
      drawEchoRevealMist(ctx, cssW, cssH, echoRevealT);
    }

    // ── Timeline Fork ghost overlay (planning phase only) ─────────────────────
    const forkResult = timelineForkResultRef.current;
    if (forkResult && forkResult.forEpoch === gs.epoch && !anim) {
      drawTimelineForkOverlay(ctx, forkResult, gs.units, cam, performance.now());
    }

    // ── Chrono Scout prediction overlay (planning phase only) ─────────────────
    const scoutResult = chronoScoutResultRef.current;
    if (scoutResult && scoutResult.forEpoch === gs.epoch && !anim) {
      drawChronoScoutOverlay(ctx, scoutResult, cam, performance.now());
    }

    const topLeft = canvasToWorld(0, 0, cam);
    const bottomRight = canvasToWorld(cssW, cssH, cam);
    const snapshot: CameraSnapshot = {
      camera: { ...cam },
      viewportWorld: {
        left: topLeft.x,
        top: topLeft.y,
        right: bottomRight.x,
        bottom: bottomRight.y,
      },
      canvasSize: {
        width: cssW,
        height: cssH,
      },
    };

    const prev = lastCameraSnapshotRef.current;
    const changed = !prev
      || Math.abs(prev.camera.x - snapshot.camera.x) > 0.5
      || Math.abs(prev.camera.y - snapshot.camera.y) > 0.5
      || Math.abs(prev.camera.zoom - snapshot.camera.zoom) > 0.001
      || prev.canvasSize.width !== snapshot.canvasSize.width
      || prev.canvasSize.height !== snapshot.canvasSize.height;
    if (changed) {
      lastCameraSnapshotRef.current = snapshot;
      onCameraChangeRef.current?.(snapshot);
    }
  }, []);

  // ── Animation frame loop ───────────────────────────────────────────────────
  useEffect(() => {
    const loop = () => {
      render();
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [render]);

  // ── Initialise ResizeObserver (map now comes from props) ───────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      canvas.width  = Math.floor(width  * dpr);
      canvas.height = Math.floor(height * dpr);
      // Centre on player start once we know the canvas size.
      const map = mapRef.current;
      if (map) camRef.current = getInitialCamera(map, width, height);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!centerRequest) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cam = camRef.current;
    camRef.current = {
      ...cam,
      x: canvas.clientWidth / 2 - centerRequest.worldX * cam.zoom,
      y: canvas.clientHeight / 2 - centerRequest.worldY * cam.zoom,
    };
  }, [centerRequest]);

  // ── Shared hex-tap handler (mouse click and touch tap) ─────────────────────
  const fireHexTap = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect        = canvas.getBoundingClientRect();
    const { x: wx, y: wy } = canvasToWorld(
      clientX - rect.left, clientY - rect.top, camRef.current,
    );
    const hex = pixelToHex(wx, wy, BASE_HEX_SIZE);
    const key = hexKey(hex);
    const map = mapRef.current;
    if (map?.cells.has(key)) {
      // Only toggle hex selection in idle mode — targeting taps are actions, not selections.
      if (modeRef.current.kind === 'idle') {
        const next = key === selectedRef.current ? null : key;
        selectedRef.current = next;
        setSelectedCell(next ? (map.cells.get(next) ?? null) : null);
      }
    }
    onHexClickRef.current(hex);
  }, []);

  // ── Mouse events ───────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    dragging.current = true;
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX, y: e.clientY,
      camX: camRef.current.x, camY: camRef.current.y,
    };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    camRef.current = {
      ...camRef.current,
      x: dragStart.current.camX + (e.clientX - dragStart.current.x),
      y: dragStart.current.camY + (e.clientY - dragStart.current.y),
    };
  }, []);

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    dragging.current = false;
    setIsDragging(false);
    // Skip synthetic mouse events that follow a touch tap (prevents double-fire toggle).
    if (Date.now() - lastTouchTapTime.current < 500) return;
    if (Math.abs(dx) < MOUSE_TAP_PX && Math.abs(dy) < MOUSE_TAP_PX) {
      fireHexTap(e.clientX, e.clientY);
    }
  }, [fireHexTap]);

  // ── Scroll-wheel zoom (non-passive so we can preventDefault) ──────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect   = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      camRef.current = zoomToward(
        camRef.current, factor,
        e.clientX - rect.left, e.clientY - rect.top,
      );
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, []);

  // ── Touch events (non-passive for preventDefault on touchmove) ────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        dragging.current = true;
        setIsDragging(true);
        dragStart.current = {
          x: e.touches[0].clientX, y: e.touches[0].clientY,
          camX: camRef.current.x,  camY: camRef.current.y,
        };
        pinchDist.current = null;
      } else if (e.touches.length === 2) {
        dragging.current = false;
        setIsDragging(false);
        pinchDist.current = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && dragging.current) {
        camRef.current = {
          ...camRef.current,
          x: dragStart.current.camX + (e.touches[0].clientX - dragStart.current.x),
          y: dragStart.current.camY + (e.touches[0].clientY - dragStart.current.y),
        };
      } else if (e.touches.length === 2 && pinchDist.current !== null) {
        const newDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const factor = newDist / pinchDist.current;
        const rect   = canvas.getBoundingClientRect();
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        camRef.current = zoomToward(camRef.current, factor, mx, my);
        pinchDist.current = newDist;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (dragging.current && e.changedTouches.length === 1) {
        const t  = e.changedTouches[0];
        const dx = t.clientX - dragStart.current.x;
        const dy = t.clientY - dragStart.current.y;
        if (Math.abs(dx) < TOUCH_TAP_PX && Math.abs(dy) < TOUCH_TAP_PX) {
          lastTouchTapTime.current = Date.now();
          fireHexTap(t.clientX, t.clientY);
        }
      }
      dragging.current  = false;
      setIsDragging(false);
      pinchDist.current = null;
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
    };
  }, [fireHexTap]);

  // ── Keyboard pan / zoom ────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const canvas = canvasRef.current;
      const midX   = canvas ? canvas.clientWidth  / 2 : 0;
      const midY   = canvas ? canvas.clientHeight / 2 : 0;

      switch (e.key) {
        case 'w': case 'ArrowUp':
          camRef.current = { ...camRef.current, y: camRef.current.y + PAN_SPEED };
          break;
        case 's': case 'ArrowDown':
          camRef.current = { ...camRef.current, y: camRef.current.y - PAN_SPEED };
          break;
        case 'a': case 'ArrowLeft':
          camRef.current = { ...camRef.current, x: camRef.current.x + PAN_SPEED };
          break;
        case 'd': case 'ArrowRight':
          camRef.current = { ...camRef.current, x: camRef.current.x - PAN_SPEED };
          break;
        case '+': case '=':
          camRef.current = zoomToward(camRef.current, ZOOM_STEP, midX, midY);
          break;
        case '-':
          camRef.current = zoomToward(camRef.current, 1 / ZOOM_STEP, midX, midY);
          break;
        case 'Home':
          if (mapRef.current && canvas) {
            camRef.current = getInitialCamera(
              mapRef.current, canvas.clientWidth, canvas.clientHeight,
            );
          }
          break;
        default:
          return; // don't call preventDefault for unhandled keys
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isTargeting = mode.kind === 'targeting';
  const cursor = isTargeting ? 'crosshair' : isDragging ? 'grabbing' : 'grab';

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        data-testid="game-canvas"
        className="block h-full w-full"
        style={{ cursor, touchAction: 'none' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { dragging.current = false; setIsDragging(false); }}
      />

      {/* Hex info panel — only in idle mode */}
      {mode.kind === 'idle' && !animation && selectedCell && <HexInfoPanel gameState={gameState} cell={selectedCell} />}

      {/* Controls hint — offset right of UnitActionPanel (180px wide) to avoid overlap */}
      {!animation && <div
        className="pointer-events-none absolute top-4 hidden rounded border border-slate-700 px-3 py-2 font-mono text-xs sm:block"
        style={{ left: 196, background: 'rgba(11,10,15,0.88)', color: '#4a4555' }}
      >
        <div>Drag / WASD — pan</div>
        <div>Scroll / pinch / ± — zoom</div>
        <div>Home — snap to base</div>
        {mode.kind === 'idle' && <div>Click hex — inspect</div>}
        {mode.kind === 'targeting' && <div style={{ color: '#e63946' }}>Tap target hex</div>}
      </div>}
    </div>
  );
}
