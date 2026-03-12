'use client';

import React, { useState } from 'react';
import type { MergeTarget } from '@/engine/targeting';
import { UNIT_DEFS } from '@/engine/units';

interface MergeTargetPickerProps {
  targets: MergeTarget[];
  onConfirm(selectedIds: string[]): void;
  onClose(): void;
}

export default function MergeTargetPicker({
  targets,
  onConfirm,
  onClose,
}: MergeTargetPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleUnit = (unitId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    onConfirm([...selected]);
  };

  return (
    <div
      className="font-mono text-xs"
      style={{
        zIndex: 100,
        background: '#0d0c14',
        border: '1px solid #2a2535',
        borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        minWidth: 200,
        overflow: 'hidden',
      }}
      role="dialog"
      aria-label="Choose merge targets"
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
        <span>SELECT UNITS TO MERGE</span>
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
          No same-type units in range
        </div>
      ) : (
        targets.map((t) => {
          const isSelected = selected.has(t.unitId);
          const def = UNIT_DEFS[t.unitType];
          const hpPct = Math.max(0, Math.min(1, t.hp / t.maxHp));
          const hpColor = hpPct > 0.6 ? '#22c55e' : hpPct > 0.3 ? '#fbbf24' : '#ef4444';

          return (
            <button
              key={t.unitId}
              type="button"
              onClick={() => toggleUnit(t.unitId)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
              style={{
                background: isSelected ? 'rgba(230,57,70,0.12)' : 'transparent',
                border: 'none',
                borderLeft: isSelected ? '2px solid #e63946' : '2px solid transparent',
                color: '#e2e8f0',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                transition: 'background 0.12s ease',
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(230,57,70,0.06)'; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 12, height: 12, borderRadius: 2,
                  border: isSelected ? '2px solid #e63946' : '2px solid #475569',
                  background: isSelected ? '#e63946' : 'transparent',
                  display: 'inline-block', flexShrink: 0,
                }} />
                <span>
                  {def.label}
                  {t.mergeCount > 0 && (
                    <span style={{ color: '#fbbf24', fontSize: '0.55rem', marginLeft: 3 }}>{t.mergeCount + 1}x</span>
                  )}
                </span>
                <span style={{ color: '#64748b', fontSize: '0.6rem' }}>
                  ({t.hex.q},{t.hex.r})
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* Mini HP bar */}
                <span style={{
                  width: 30, height: 3, background: '#1e1a28', borderRadius: 2,
                  overflow: 'hidden', display: 'inline-block',
                }}>
                  <span style={{ width: `${hpPct * 100}%`, height: '100%', background: hpColor, display: 'block', borderRadius: 2 }} />
                </span>
                <span style={{ color: '#fbbf24', fontSize: '0.6rem' }}>
                  {t.distance === 0 ? 'here' : `${t.distance}hex`}
                </span>
              </span>
            </button>
          );
        })
      )}

      {/* Confirm button */}
      {targets.length > 0 && (
        <div className="px-3 py-2" style={{ borderTop: '1px solid #1e1a28' }}>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
            style={{
              width: '100%',
              padding: '6px 8px',
              background: selected.size > 0 ? 'rgba(230,57,70,0.15)' : 'transparent',
              border: selected.size > 0 ? '1px solid #e63946' : '1px solid #2a2535',
              borderRadius: 4,
              color: selected.size > 0 ? '#e63946' : '#2a2535',
              cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              transition: 'all 0.15s ease',
            }}
          >
            MERGE {selected.size > 0 ? `(${selected.size} unit${selected.size > 1 ? 's' : ''})` : ''}
          </button>
        </div>
      )}
    </div>
  );
}
