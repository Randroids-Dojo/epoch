'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameMap, HexCell } from '@/engine/map';
import { GameState } from '@/engine/state';
import { Hex, hexKey, hexToPixel, pixelToHex } from '@/engine/hex';
import { Camera, DEFAULT_ZOOM, zoomToward, canvasToWorld } from '@/renderer/camera';
import { BASE_HEX_SIZE, drawBackground, drawHexCell } from '@/renderer/drawHex';
import { drawUnits, drawStructures, drawTargetingOverlay, drawAnimatedUnits, drawAnimatedStructures, drawDestroyedEntities, drawEchoOverlay } from '@/renderer/drawEntities';
import { InteractionMode } from '@/lib/types';
import { ExecutionAnimation } from '@/renderer/animation';
import { Command } from '@/engine/commands';

const ZOOM_STEP       = 1.15;
const PAN_SPEED       = 20; // CSS px per keypress
const MOUSE_TAP_PX    = 4;
const TOUCH_TAP_PX    = 8;

interface GameCanvasProps {
  gameState: GameState;
  mode: InteractionMode;
  animation: ExecutionAnimation | null;
  echoCommands: Command[] | null;
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
  echoCommands,
  onHexClick,
  onCameraChange,
  centerRequest,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef    = useRef<Camera>({ x: 0, y: 0, zoom: DEFAULT_ZOOM });
  const mapRef    = useRef<GameMap | null>(null);
  const frameRef  = useRef<number>(0);
  const dprRef    = useRef(1);

  // Keep mapRef in sync with the current game state map.
  mapRef.current = gameState.map;

  // Selected hex key — kept in a ref for the render loop, in state for the info panel.
  const selectedRef = useRef<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<HexCell | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Keep mode accessible in render without re-creating the callback.
  const modeRef = useRef<InteractionMode>(mode);
  modeRef.current = mode;

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

    const cam  = camRef.current;
    const dpr  = dprRef.current;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const gs   = gameStateRef.current;
    const m    = modeRef.current;

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
      drawTargetingOverlay(ctx, map.cells, m.eligibleKeys, cam);
    }

    // ── Structures + units ───────────────────────────────────────────────────
    const anim = animationRef.current;
    if (anim) {
      const elapsed = (performance.now() - anim.startedAt) / 1000;
      drawAnimatedStructures(ctx, anim, cam, elapsed);
      drawDestroyedEntities(ctx, anim, cam, elapsed);
      drawAnimatedUnits(ctx, anim, cam, elapsed);
    } else {
      drawStructures(ctx, gs.structures, cam);
      drawUnits(ctx, gs.units, cam);
    }

    // ── Temporal Echo overlay (planning phase only) ───────────────────────────
    const echo = echoCommandsRef.current;
    if (echo && echo.length > 0 && !anim) {
      drawEchoOverlay(ctx, echo, cam, performance.now());
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
      const next = key === selectedRef.current ? null : key;
      selectedRef.current = next;
      setSelectedCell(next ? (map.cells.get(next) ?? null) : null);
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
      {mode.kind === 'idle' && selectedCell && (
        <div
          className="pointer-events-none absolute bottom-4 left-4 rounded border border-slate-700 px-3 py-2 font-mono text-xs"
          style={{ background: 'rgba(10,14,26,0.90)', color: '#94a3b8' }}
        >
          <div className="mb-1" style={{ color: '#00e5ff' }}>
            Hex ({selectedCell.hex.q}, {selectedCell.hex.r})
          </div>
          <div>Terrain: {selectedCell.terrain.replace('_', ' ')}</div>
          <div>Fog: {selectedCell.fog}</div>
        </div>
      )}

      {/* Controls hint — hidden on small screens and during execution */}
      {!animation && <div
        className="pointer-events-none absolute left-4 top-4 hidden rounded border border-slate-700 px-3 py-2 font-mono text-xs sm:block"
        style={{ background: 'rgba(10,14,26,0.85)', color: '#475569' }}
      >
        <div>Drag / WASD — pan</div>
        <div>Scroll / pinch / ± — zoom</div>
        <div>Home — snap to base</div>
        {mode.kind === 'idle' && <div>Click hex — inspect</div>}
        {mode.kind === 'targeting' && <div style={{ color: '#00d4ff' }}>Tap target hex</div>}
      </div>}
    </div>
  );
}
