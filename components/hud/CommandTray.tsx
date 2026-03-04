'use client';

import { Command, CommandQueue } from '@/engine/commands';
import { SLOT_LAYOUT } from '@/lib/constants';

interface CommandTrayProps {
  commands: CommandQueue;
  selectedSlot: number | null;
  lockedIn: boolean;
  lockInFlash: boolean;
  isMobile?: boolean;
  onSlotClick(i: number): void;
  onSlotClear(i: number): void;
  onLockIn(): void;
}

/** Two-letter code shown on a filled command slot. */
const TYPE_CODE: Record<string, string> = {
  move:     'MV',
  attack:   'AT',
  gather:   'GR',
  defend:   'DF',
  build:    'BD',
  train:    'TR',
  temporal: 'TM',
  research: 'RS',
};

/** Short description of the command target. */
function cmdLabel(cmd: Command): string {
  switch (cmd.type) {
    case 'move':
    case 'attack':
    case 'gather':
      return `(${cmd.targetHex.q},${cmd.targetHex.r})`;
    case 'defend':
      return cmd.unitId.slice(-4);
    case 'build':
      return `BD`;
    case 'train':
      return `${cmd.unitType}@${cmd.structureId.slice(-3)}`;
    case 'temporal':
      return 'ECHO';
    case 'research':
      return 'TECH';
  }
}

export default function CommandTray({
  commands,
  selectedSlot,
  lockedIn,
  lockInFlash,
  isMobile = false,
  onSlotClick,
  onSlotClear,
  onLockIn,
}: CommandTrayProps) {
  const slot = isMobile ? SLOT_LAYOUT.MOBILE : SLOT_LAYOUT.DESKTOP;

  return (
    <div
      className="shrink-0 flex items-center px-4 py-3 font-mono"
      style={{ gap: slot.gap, background: 'rgba(10,14,26,0.95)', borderTop: '1px solid #1e293b' }}
    >
      {/* Command slots */}
      {commands.map((cmd, i) => {
        const isSelected = selectedSlot === i;
        return (
          <button
            key={i}
            data-testid={`command-slot-${i}`}
            type="button"
            onClick={() => onSlotClick(i)}
            className="relative flex items-center justify-center rounded text-xs select-none"
            style={{
              width: slot.width,
              height: slot.height,
              cursor: 'pointer',
              border: isSelected
                ? '1.5px solid #00d4ff'
                : '1px solid #334155',
              boxShadow: isSelected
                ? '0 0 8px rgba(0,212,255,0.35), inset 0 0 8px rgba(0,212,255,0.08)'
                : undefined,
              background: isSelected
                ? 'rgba(0,212,255,0.06)'
                : 'rgba(30,41,59,0.5)',
              animation: !cmd && !isSelected ? 'pulse-border 2.5s ease-in-out infinite' : undefined,
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              fontFamily: 'inherit',
            }}
          >
            {cmd ? (
              <>
                {/* Slot index label */}
                <span
                  className="absolute left-1 top-0.5"
                  style={{ color: '#334155', fontSize: '0.6rem' }}
                >
                  {i + 1}
                </span>

                {/* Command type badge */}
                <div className="flex flex-col items-center gap-0.5">
                  <span style={{ color: '#00d4ff', fontWeight: 700 }}>
                    {TYPE_CODE[cmd.type] ?? cmd.type.slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '0.6rem' }}>
                    {cmdLabel(cmd)}
                  </span>
                </div>

                {/* Clear control */}
                <span
                  role="button"
                  tabIndex={0}
                  className="absolute right-0.5 top-0.5 flex items-center justify-center rounded"
                  style={{
                    width: 16, height: 16,
                    background: 'transparent',
                    border: 'none',
                    color: '#475569',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    lineHeight: 1,
                  }}
                  onClick={(e) => { e.stopPropagation(); onSlotClear(i); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onSlotClear(i);
                    }
                  }}
                  aria-label={`Clear slot ${i + 1}`}
                >
                  ×
                </span>
              </>
            ) : (
              <>
                <span
                  className="absolute left-1 top-0.5"
                  style={{ color: '#1e293b', fontSize: '0.6rem' }}
                >
                  {i + 1}
                </span>
                <span style={{ color: '#334155', fontSize: '1.1rem' }}>+</span>
              </>
            )}
          </button>
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Lock-In button */}
      <button
        data-testid="lock-in-btn"
        disabled={lockedIn}
        onClick={onLockIn}
        className="rounded px-3 py-2 text-xs font-bold tracking-widest uppercase"
        style={{
          background: lockedIn
            ? 'rgba(30,41,59,0.5)'
            : lockInFlash
              ? 'rgba(0,212,255,0.3)'
              : 'rgba(0,212,255,0.12)',
          border: `1px solid ${lockedIn ? '#334155' : '#00d4ff'}`,
          color: lockedIn ? '#334155' : '#00d4ff',
          cursor: lockedIn ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s ease, border-color 0.2s ease',
          minWidth: isMobile ? 72 : 100, // narrower lock button on mobile
        }}
      >
        {lockedIn
          ? (isMobile ? 'LOCKED' : 'LOCKED IN')
          : (isMobile ? 'LOCK' : 'LOCK IN +TE')}
      </button>
    </div>
  );
}
