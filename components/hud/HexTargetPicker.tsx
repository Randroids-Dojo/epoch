'use client';

import React, { useMemo } from 'react';
import { Hex, hexKey, hexesInRange } from '@/engine/hex';

// ── Mini hex layout constants ───────────────────────────────────────────────

const MINI_HEX_SIZE = 14;
const SQRT3 = Math.sqrt(3);

function miniHexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * (SQRT3 * q + (SQRT3 / 2) * r),
    y: size * (1.5 * r),
  };
}

function hexPoints(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
  }).join(' ');
}

// ── Props ────────────────────────────────────────────────────────────────────

interface HexTargetPickerProps {
  /** The unit's current hex position. */
  unitHex: Hex;
  /** Radius of hexes to display (typically unit speed). */
  radius: number;
  /** Set of hex keys that are valid targets (eligible & in range). */
  eligibleKeys: Set<string>;
  /** Subset of eligibleKeys reachable within a single epoch (move only). */
  immediateKeys?: Set<string>;
  /** Header label shown at the top. */
  header: string;
  /** Max width/height constraints for the picker body (enables scrolling). */
  maxWidth?: number;
  maxHeight?: number;
  /** Called when the player picks a target hex. */
  onSelect(hex: Hex): void;
  /** Called to dismiss the picker. */
  onClose(): void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HexTargetPicker({
  unitHex,
  radius,
  eligibleKeys,
  immediateKeys,
  header,
  maxWidth,
  maxHeight,
  onSelect,
  onClose,
}: HexTargetPickerProps) {
  const hexes = useMemo(() => hexesInRange({ q: 0, r: 0 }, radius), [radius]);

  // Compute bounding box of the hex grid.
  const { width, height, offsetX, offsetY } = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const h of hexes) {
      const p = miniHexToPixel(h.q, h.r, MINI_HEX_SIZE);
      minX = Math.min(minX, p.x - MINI_HEX_SIZE);
      maxX = Math.max(maxX, p.x + MINI_HEX_SIZE);
      minY = Math.min(minY, p.y - MINI_HEX_SIZE);
      maxY = Math.max(maxY, p.y + MINI_HEX_SIZE);
    }
    return {
      width: maxX - minX + 4,
      height: maxY - minY + 4,
      offsetX: -minX + 2,
      offsetY: -minY + 2,
    };
  }, [hexes]);

  return (
    <div
      className="font-mono text-xs"
      style={{
        zIndex: 100,
        background: '#0d0c14',
        border: '1px solid #2a2535',
        borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      role="dialog"
      aria-label={header}
    >
      <div
        className="px-3 py-1.5"
        style={{
          color: '#475569',
          borderBottom: '1px solid #1e1a28',
          fontSize: '0.65rem',
          letterSpacing: '0.1em',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{header}</span>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: '#64748b',
            cursor: 'pointer', fontSize: '0.7rem', padding: '0 2px',
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div style={{
        padding: 8,
        overflowX: maxWidth ? 'auto' : undefined,
        overflowY: maxHeight ? 'auto' : undefined,
        maxWidth: maxWidth ? maxWidth - 2 : undefined,   // account for border
        maxHeight: maxHeight ? maxHeight - 34 : undefined, // account for header + border
      }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {hexes.map((h) => {
            const worldHex: Hex = { q: unitHex.q + h.q, r: unitHex.r + h.r };
            const key = hexKey(worldHex);
            const isCenter = h.q === 0 && h.r === 0;
            const isEligible = eligibleKeys.has(key);
            const p = miniHexToPixel(h.q, h.r, MINI_HEX_SIZE);
            const cx = p.x + offsetX;
            const cy = p.y + offsetY;

            let fill = '#2a1520';
            let stroke = '#6b2030';
            let hoverFill = '#e6394630';
            let cursor = 'default';
            let opacity = 0.85;
            const isImmediate = !immediateKeys || immediateKeys.has(key);
            const isBlocked = !isCenter && !isEligible;

            if (isCenter) {
              fill = '#e6394620';
              stroke = '#e63946';
              opacity = 1;
            } else if (isEligible && isImmediate) {
              fill = '#e6394610';
              stroke = '#e6394680';
              cursor = 'pointer';
              opacity = 1;
            } else if (isEligible && !isImmediate) {
              // Multi-turn target: amber tint
              fill = '#f59e0b10';
              stroke = '#f59e0b60';
              hoverFill = '#f59e0b30';
              cursor = 'pointer';
              opacity = 1;
            }

            const xSize = MINI_HEX_SIZE * 0.35;

            return (
              <g key={`${h.q},${h.r}`}>
                <polygon
                  points={hexPoints(cx, cy, MINI_HEX_SIZE - 1)}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={1}
                  opacity={opacity}
                  style={{ cursor, transition: 'fill 0.1s ease' }}
                  onClick={isEligible ? () => onSelect(worldHex) : undefined}
                  onMouseEnter={(e) => {
                    if (isEligible) (e.target as SVGPolygonElement).setAttribute('fill', hoverFill);
                  }}
                  onMouseLeave={(e) => {
                    if (isEligible) (e.target as SVGPolygonElement).setAttribute('fill', fill);
                  }}
                />
                {isBlocked && (
                  <g opacity={0.5}>
                    <line x1={cx - xSize} y1={cy - xSize} x2={cx + xSize} y2={cy + xSize} stroke="#ff4060" strokeWidth={1.5} strokeLinecap="round" />
                    <line x1={cx + xSize} y1={cy - xSize} x2={cx - xSize} y2={cy + xSize} stroke="#ff4060" strokeWidth={1.5} strokeLinecap="round" />
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {eligibleKeys.size === 0 && (
        <div className="px-3 pb-2" style={{ color: '#f87171', fontSize: '0.6rem' }}>
          No valid targets in range
        </div>
      )}
    </div>
  );
}
