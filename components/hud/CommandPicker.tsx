'use client';

import { useEffect, useRef } from 'react';
import { CommandType } from '@/engine/commands';
import { Unit } from '@/engine/units';

interface CommandPickerProps {
  slotIndex: number;
  playerUnits: Unit[];
  onSelect(type: CommandType): void;
  onClose(): void;
}

interface PickerEntry {
  type: CommandType;
  label: string;
  shortcut: string;
  enabled: boolean;
}

const PICKER_ENTRIES: PickerEntry[] = [
  { type: 'move',     label: 'Move',     shortcut: 'M', enabled: true  },
  { type: 'attack',   label: 'Attack',   shortcut: 'A', enabled: true  },
  { type: 'gather',   label: 'Gather',   shortcut: 'G', enabled: true  },
  { type: 'defend',   label: 'Defend',   shortcut: 'D', enabled: true  },
  { type: 'build',    label: 'Build',    shortcut: 'B', enabled: false },
  { type: 'train',    label: 'Train',    shortcut: 'T', enabled: false },
  { type: 'temporal', label: 'Temporal', shortcut: 'E', enabled: false },
];

// Approx height of the command tray in px — picker floats above it.
const TRAY_HEIGHT = 76;

export default function CommandPicker(props: CommandPickerProps) {
  const { slotIndex, onSelect, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Horizontal position: align with the selected slot (each slot is ~80px + 8px gap).
  const slotOffset = slotIndex * (80 + 8) + 16; // 16px = px-4 padding

  return (
    <div
      ref={ref}
      className="absolute font-mono text-xs"
      style={{
        bottom: TRAY_HEIGHT + 8,
        left: slotOffset,
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
        SLOT {slotIndex + 1} — COMMAND
      </div>

      {PICKER_ENTRIES.map((entry) => (
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
          <span style={{ color: '#334155', marginLeft: 16 }}>{entry.shortcut}</span>
        </button>
      ))}
    </div>
  );
}
