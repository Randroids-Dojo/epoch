'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { generateMap, GameMap, HexCell } from '@/engine/map';
import { hexKey, hexToPixel, pixelToHex } from '@/engine/hex';
import { Camera, DEFAULT_ZOOM, zoomToward, canvasToWorld } from '@/renderer/camera';
import { BASE_HEX_SIZE, drawBackground, drawHexCell } from '@/renderer/drawHex';

const ZOOM_STEP = 1.15;
const PAN_SPEED = 20; // CSS px per keypress
const INITIAL_MAP_SEED = 42;

function getInitialCamera(map: GameMap, cssW: number, cssH: number): Camera {
  const { x: wx, y: wy } = hexToPixel(map.playerStart, BASE_HEX_SIZE);
  return {
    x: cssW / 2 - wx * DEFAULT_ZOOM,
    y: cssH / 2 - wy * DEFAULT_ZOOM,
    zoom: DEFAULT_ZOOM,
  };
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef    = useRef<Camera>({ x: 0, y: 0, zoom: DEFAULT_ZOOM });
  const mapRef    = useRef<GameMap | null>(null);
  const frameRef  = useRef<number>(0);
  const dprRef    = useRef(1);

  // Selected hex key — kept in a ref for the render loop, in state for the info panel.
  const selectedRef = useRef<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<HexCell | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── Pan state ──────────────────────────────────────────────────────────────
  const dragging  = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  // ── Pinch state ────────────────────────────────────────────────────────────
  const pinchDist = useRef<number | null>(null);

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

  // ── Initialise map + ResizeObserver ────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const map = generateMap(INITIAL_MAP_SEED);
    mapRef.current = map;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      canvas.width  = Math.floor(width  * dpr);
      canvas.height = Math.floor(height * dpr);
      camRef.current = getInitialCamera(map, width, height);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
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

    // Tiny movement → treat as click (hex selection).
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { x: wx, y: wy } = canvasToWorld(
        e.clientX - rect.left, e.clientY - rect.top, camRef.current,
      );
      const hex = pixelToHex(wx, wy, BASE_HEX_SIZE);
      const key = hexKey(hex);
      const map = mapRef.current;
      if (map?.cells.has(key)) {
        const next = key === selectedRef.current ? null : key;
        selectedRef.current = next;
        setSelectedCell(next ? (map.cells.get(next) ?? null) : null);
      }
    }
  }, []);

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

    const onTouchEnd = () => {
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
  }, []);

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

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { dragging.current = false; setIsDragging(false); }}
      />

      {/* Hex info panel */}
      {selectedCell && (
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

      {/* Controls hint */}
      <div
        className="pointer-events-none absolute right-4 top-4 rounded border border-slate-700 px-3 py-2 font-mono text-xs"
        style={{ background: 'rgba(10,14,26,0.85)', color: '#475569' }}
      >
        <div>Drag / WASD — pan</div>
        <div>Scroll / ± — zoom</div>
        <div>Home — snap to base</div>
        <div>Click hex — inspect</div>
      </div>
    </div>
  );
}
