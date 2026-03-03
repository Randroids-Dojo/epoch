'use client';

import { useEffect, useMemo, useRef } from 'react';
import { GameState } from '@/engine/state';
import { hexKey, hexToPixel } from '@/engine/hex';
import { BASE_HEX_SIZE } from '@/renderer/drawHex';
import { CameraSnapshot } from '@/components/shared/GameCanvas';

interface MinimapProps {
  gameState: GameState;
  cameraSnapshot: CameraSnapshot | null;
  isMobile: boolean;
  onRecenter(worldX: number, worldY: number): void;
  onSnapHome(): void;
}

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

const PAD = 8;

function getTerrainColor(terrain: string): string {
  switch (terrain) {
    case 'crystal_node': return '#0d3558';
    case 'void_rift': return '#080d18';
    case 'flux_vent': return '#2c1242';
    case 'ridge': return '#223045';
    case 'energy_field': return '#1a1030';
    default: return '#1b2738';
  }
}

function withFog(base: string, fog: 'unexplored' | 'explored' | 'visible'): string {
  if (fog === 'visible') return base;
  if (fog === 'explored') return '#101827';
  return '#05080f';
}

export default function Minimap({ gameState, cameraSnapshot, isMobile, onRecenter, onSnapHome }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const bounds = useMemo<Bounds>(() => {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const cell of gameState.map.cells.values()) {
      const p = hexToPixel(cell.hex, BASE_HEX_SIZE);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, [gameState.map]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, cssW, cssH);

    const sx = (cssW - PAD * 2) / Math.max(bounds.width, 1);
    const sy = (cssH - PAD * 2) / Math.max(bounds.height, 1);
    const scale = Math.min(sx, sy);

    const worldToMini = (wx: number, wy: number) => ({
      x: PAD + (wx - bounds.minX) * scale,
      y: PAD + (wy - bounds.minY) * scale,
    });

    const cellPx = Math.max(1, Math.min(4, BASE_HEX_SIZE * 0.35 * scale));
    for (const cell of gameState.map.cells.values()) {
      const p = hexToPixel(cell.hex, BASE_HEX_SIZE);
      const m = worldToMini(p.x, p.y);
      ctx.fillStyle = withFog(getTerrainColor(cell.terrain), cell.fog);
      ctx.fillRect(m.x - cellPx / 2, m.y - cellPx / 2, cellPx, cellPx);
    }

    const entityPx = Math.max(2, cellPx + 1);

    for (const s of gameState.structures.values()) {
      const p = hexToPixel(s.hex, BASE_HEX_SIZE);
      const m = worldToMini(p.x, p.y);
      ctx.fillStyle = s.owner === 'player' ? '#00d4ff' : '#ff6b6b';
      ctx.fillRect(m.x - entityPx / 2, m.y - entityPx / 2, entityPx, entityPx);
    }

    for (const u of gameState.units.values()) {
      const cell = gameState.map.cells.get(hexKey(u.hex));
      if (u.owner === 'ai' && cell?.fog === 'unexplored') continue;
      const p = hexToPixel(u.hex, BASE_HEX_SIZE);
      const m = worldToMini(p.x, p.y);
      ctx.beginPath();
      ctx.fillStyle = u.owner === 'player' ? '#67e8f9' : '#fb7185';
      ctx.arc(m.x, m.y, entityPx * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [bounds, gameState]);

  const viewportRect = useMemo(() => {
    if (!cameraSnapshot) return null;
    const cssW = 160;
    const cssH = 120;
    const sx = (cssW - PAD * 2) / Math.max(bounds.width, 1);
    const sy = (cssH - PAD * 2) / Math.max(bounds.height, 1);
    const scale = Math.min(sx, sy);

    return {
      left: PAD + (cameraSnapshot.viewportWorld.left - bounds.minX) * scale,
      top: PAD + (cameraSnapshot.viewportWorld.top - bounds.minY) * scale,
      width: (cameraSnapshot.viewportWorld.right - cameraSnapshot.viewportWorld.left) * scale,
      height: (cameraSnapshot.viewportWorld.bottom - cameraSnapshot.viewportWorld.top) * scale,
    };
  }, [bounds, cameraSnapshot]);

  const handleMiniPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const sx = (rect.width - PAD * 2) / Math.max(bounds.width, 1);
    const sy = (rect.height - PAD * 2) / Math.max(bounds.height, 1);
    const scale = Math.min(sx, sy);

    const worldX = bounds.minX + (x - PAD) / scale;
    const worldY = bounds.minY + (y - PAD) / scale;
    onRecenter(worldX, worldY);
  };

  return (
    <div
      data-testid="minimap"
      className={`absolute z-10 ${isMobile ? 'bottom-16 left-3' : 'right-4 top-4'}`}
    >
      <div className="relative rounded border border-slate-700 bg-slate-950/85 p-2 shadow-lg backdrop-blur-sm">
        <canvas
          ref={canvasRef}
          data-testid="minimap-canvas"
          className="block h-[120px] w-[160px] cursor-pointer touch-none rounded-sm"
          onClick={(e) => handleMiniPointer(e.clientX, e.clientY)}
          onTouchStart={(e) => {
            if (e.touches.length > 0) {
              handleMiniPointer(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
        />
        {viewportRect && (
          <div
            data-testid="minimap-viewport"
            className="pointer-events-none absolute border border-cyan-300/90"
            style={{
              left: `${viewportRect.left + 8}px`,
              top: `${viewportRect.top + 8}px`,
              width: `${Math.max(6, viewportRect.width)}px`,
              height: `${Math.max(6, viewportRect.height)}px`,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.45) inset',
            }}
          />
        )}
        <button
          type="button"
          data-testid="minimap-home"
          className="absolute -top-2 -right-2 rounded-full border border-cyan-400/60 bg-slate-950 px-2 py-1 text-[10px] font-mono text-cyan-200"
          onClick={onSnapHome}
          aria-label="Snap camera to base"
        >
          HOME
        </button>
      </div>
    </div>
  );
}
