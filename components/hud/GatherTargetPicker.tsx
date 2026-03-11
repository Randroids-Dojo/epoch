'use client';

import React from 'react';
import type { GatherTarget } from '@/engine/targeting';
import type { Hex } from '@/engine/hex';

// ── Props ────────────────────────────────────────────────────────────────────

interface GatherTargetPickerProps {
  targets: GatherTarget[];
  /** Highlight the first target for tutorial guidance. */
  tutorialHighlight?: boolean;
  onSelect(hex: Hex): void;
  onClose(): void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GatherTargetPicker({
  targets,
  tutorialHighlight = false,
  onSelect,
  onClose,
}: GatherTargetPickerProps) {
  return (
    <div
      className="font-mono text-xs"
      style={{
        zIndex: 100,
        background: '#0d1321',
        border: '1px solid #334155',
        borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        minWidth: 180,
        overflow: 'hidden',
      }}
      role="dialog"
      aria-label="Choose gather target"
    >
      <div
        className="px-3 py-1.5"
        style={{
          color: '#475569',
          borderBottom: '1px solid #1e293b',
          fontSize: '0.65rem',
          letterSpacing: '0.1em',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>GATHER TARGET</span>
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

      {targets.length === 0 ? (
        <div className="px-3 py-2" style={{ color: '#f87171', fontSize: '0.6rem' }}>
          No harvestable structures in range
        </div>
      ) : (
        targets.map((t, i) => {
          const isTutorial = tutorialHighlight && i === 0;
          return (
          <button
            key={t.structureId}
            type="button"
            onClick={() => onSelect(t.hex)}
            className={`flex w-full items-center justify-between px-3 py-2 text-left${isTutorial ? ' tutorial-highlight' : ''}`}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              transition: 'background 0.12s ease',
              position: isTutorial ? 'relative' as const : undefined,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span>
              {t.label}
              <span style={{ color: '#64748b', marginLeft: 6, fontSize: '0.6rem' }}>
                ({t.hex.q},{t.hex.r})
              </span>
            </span>
            <span style={{ color: '#fbbf24', fontSize: '0.6rem' }}>
              {t.distance === 0 ? 'here' : `${t.distance}hex`}
            </span>
            {isTutorial && <span className="tutorial-tooltip" style={{ top: -20, left: 4 }}>GATHER HERE</span>}
          </button>
          );
        })
      )}
    </div>
  );
}
