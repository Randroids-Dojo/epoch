'use client';

import { useEffect, useRef } from 'react';
import { CommandType, TEMPORAL_ECHO_COST } from '@/engine/commands';
import { UnitType, UNIT_DEFS } from '@/engine/units';

interface CommandPickerProps {
  slotIndex: number;
  left: number;
  playerTE: number;
  playerCC: number;
  mode?: 'command' | 'train';
  trainStructureLabel?: string;
  feedback?: string | null;
  onSelect(type: CommandType): void;
  onTrainSelect?(unitType: UnitType): void;
  onClose(): void;
}

interface PickerEntry {
  type: CommandType;
  label: string;
  shortcut: string;
  cost?: string;
  enabled: boolean;
}

const TRAY_HEIGHT = 76;

export default function CommandPicker(props: CommandPickerProps) {
  const {
    slotIndex,
    left,
    playerTE,
    playerCC,
    mode = 'command',
    trainStructureLabel,
    feedback,
    onSelect,
    onTrainSelect,
    onClose,
  } = props;

  const entries: PickerEntry[] = [
    { type: 'move',     label: 'Move',         shortcut: 'M', enabled: true  },
    { type: 'attack',   label: 'Attack',       shortcut: 'A', enabled: true  },
    { type: 'gather',   label: 'Gather',       shortcut: 'G', enabled: true  },
    { type: 'defend',   label: 'Defend',       shortcut: 'D', enabled: true  },
    { type: 'build',    label: 'Build',        shortcut: 'B', enabled: true  },
    { type: 'train',    label: 'Train',        shortcut: 'T', enabled: true  },
    {
      type: 'temporal',
      label: 'Echo',
      shortcut: 'E',
      cost: `${TEMPORAL_ECHO_COST}TE`,
      enabled: playerTE >= TEMPORAL_ECHO_COST,
    },
  ];

  const trainEntries: Array<{ type: UnitType; shortcut: string }> = [
    { type: 'drone', shortcut: 'D' },
    { type: 'pulse_sentry', shortcut: 'P' },
    { type: 'arc_ranger', shortcut: 'R' },
  ];

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute font-mono text-xs"
      style={{
        bottom: TRAY_HEIGHT + 8,
        left,
        zIndex: 100,
        background: '#0d1321',
        border: '1px solid #334155',
        borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        minWidth: 140,
        overflow: 'hidden',
      }}
      role="menu"
      aria-label={`Command picker for slot ${slotIndex + 1}`}
    >
      <div
        className="px-3 py-1.5"
        style={{ color: '#475569', borderBottom: '1px solid #1e293b', fontSize: '0.65rem', letterSpacing: '0.1em' }}
      >
        SLOT {slotIndex + 1} — {mode === 'command' ? 'COMMAND' : 'TRAIN'}
      </div>

      {mode === 'command' && entries.map((entry) => (
        <button
          key={entry.type}
          role="menuitem"
          disabled={!entry.enabled}
          onClick={() => entry.enabled && onSelect(entry.type)}
          className="flex w-full items-center justify-between px-3 py-2"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: entry.enabled ? 'pointer' : 'not-allowed',
            color: entry.enabled ? '#e2e8f0' : '#334155',
            textAlign: 'left',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            transition: 'background 0.12s ease',
          }}
          onMouseEnter={(e) => {
            if (entry.enabled) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,212,255,0.08)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          <span>{entry.label}</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
            {entry.cost && (
              <span style={{ color: entry.enabled ? '#fbbf24' : '#334155', fontSize: '0.6rem' }}>
                {entry.cost}
              </span>
            )}
            <span style={{ color: '#334155' }}>{entry.shortcut}</span>
          </span>
        </button>
      ))}

      {mode === 'train' && trainEntries.map((entry) => {
        const isEnabled = playerCC >= UNIT_DEFS[entry.type].costCC;
        return (
          <button
            key={entry.type}
            role="menuitem"
            disabled={!isEnabled}
            onClick={() => isEnabled && onTrainSelect?.(entry.type)}
            className="flex w-full items-center justify-between px-3 py-2"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isEnabled ? 'pointer' : 'not-allowed',
              color: isEnabled ? '#e2e8f0' : '#334155',
              textAlign: 'left',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              transition: 'background 0.12s ease',
            }}
            onMouseEnter={(e) => {
              if (isEnabled) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,212,255,0.08)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <span>{UNIT_DEFS[entry.type].label}</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
              <span style={{ color: isEnabled ? '#fbbf24' : '#334155', fontSize: '0.6rem' }}>
                {UNIT_DEFS[entry.type].costCC}CC
              </span>
              <span style={{ color: '#334155' }}>{entry.shortcut}</span>
            </span>
          </button>
        );
      })}

      {(mode === 'train' || feedback) && (
        <div className="px-3 py-2" style={{ borderTop: '1px solid #1e293b' }}>
          {mode === 'train' && trainStructureLabel && (
            <div style={{ color: '#64748b', fontSize: '0.65rem' }} data-testid="train-structure-label">
              {trainStructureLabel}
            </div>
          )}
          {feedback && (
            <div style={{ color: '#f87171', fontSize: '0.65rem' }} data-testid="command-feedback">
              {feedback}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
