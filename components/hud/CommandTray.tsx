'use client';

import { GlobalCommand } from '@/engine/commands';
import { SLOT_LAYOUT } from '@/lib/constants';

interface CommandTrayProps {
  globalCommands: Array<GlobalCommand | null>;
  selectedGlobalSlot: number | null;
  lockedIn: boolean;
  lockInFlash: boolean;
  isMobile?: boolean;
  /** When true (fork preview active), changes lock-in button to "CONFIRM FORK". */
  forkMode?: boolean;
  /** Highlight the lock-in button for tutorial guidance. */
  tutorialHighlightLockIn?: boolean;
  /** Highlight the first empty slot for tutorial guidance. */
  tutorialHighlightSlot?: boolean;
  onSlotClick(i: number): void;
  onSlotClear(i: number): void;
  onLockIn(): void;
}

/** Compact icon per unit type (matches canvas shapes) */
const UNIT_ICON: Record<string, string> = {
  drone:           '●',
  pulse_sentry:    '▦',
  arc_ranger:      '◆',
  phase_walker:    '▲',
  temporal_warden: '⬡',
  void_striker:    '⬢',
  flux_weaver:     '✶',
  chrono_titan:    '◉',
};

/** Compact icon per global command type */
const CMD_ICON: Record<string, string> = {
  train:          '⚙',
  research:       '⬆',
  temporal:       '⏳',
  chrono_shift:   '↯',
  epoch_anchor:   '⚓',
  timeline_fork:  '⑂',
  chrono_scout:   '👁',
};

function cmdIcon(cmd: GlobalCommand): string {
  if (cmd.type === 'train') return UNIT_ICON[cmd.unitType] ?? '?';
  return CMD_ICON[cmd.type] ?? '?';
}

export default function CommandTray({
  globalCommands,
  selectedGlobalSlot,
  lockedIn,
  lockInFlash,
  isMobile = false,
  forkMode = false,
  tutorialHighlightLockIn = false,
  tutorialHighlightSlot = false,
  onSlotClick,
  onSlotClear,
  onLockIn,
}: CommandTrayProps) {
  const slot = isMobile ? SLOT_LAYOUT.MOBILE : SLOT_LAYOUT.DESKTOP;
  const firstEmptySlot = tutorialHighlightSlot ? globalCommands.findIndex((c) => c === null) : -1;

  return (
    <div
      className="absolute right-0 flex items-center font-mono"
      style={{ bottom: 64, zIndex: 30, padding: '0 8px', gap: slot.gap, pointerEvents: 'auto' }}
    >
      {/* Command slots + Lock button — single horizontal row */}
      {globalCommands.map((cmd, i) => {
          const isSelected = selectedGlobalSlot === i;
          const isTutorial = i === firstEmptySlot;
          return (
            <button
              key={i}
              data-testid={`command-slot-${i}`}
              type="button"
              disabled={lockedIn}
              onClick={() => onSlotClick(i)}
              className={`relative flex items-center justify-center rounded text-xs select-none${isTutorial ? ' tutorial-highlight' : ''}`}
              style={{
                width: slot.width,
                height: slot.height,
                cursor: lockedIn ? 'not-allowed' : 'pointer',
                opacity: lockedIn ? 0.5 : 1,
                border: isSelected
                  ? '1.5px solid #e63946'
                  : '1px solid #475569',
                boxShadow: isSelected
                  ? '0 0 8px rgba(230,57,70,0.35), inset 0 0 8px rgba(230,57,70,0.08)'
                  : undefined,
                background: isSelected
                  ? 'rgba(230,57,70,0.12)'
                  : 'rgba(11,10,15,0.92)',
                animation: !cmd && !isSelected && !lockedIn ? 'pulse-border 2.5s ease-in-out infinite' : undefined,
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.2s ease',
                fontFamily: 'inherit',
              }}
            >
              {cmd ? (
                <>
                  <span
                    className="absolute left-0.5 top-0"
                    style={{ color: '#475569', fontSize: '0.5rem', lineHeight: 1 }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: '1.2rem', lineHeight: 1 }} aria-label={cmd.type}>
                    {cmdIcon(cmd)}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="absolute right-0 top-0 flex items-center justify-center"
                    style={{
                      width: 14, height: 14,
                      background: 'transparent',
                      border: 'none',
                      color: '#475569',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
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
                    style={{ color: '#475569', fontSize: '0.6rem' }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '1.1rem' }}>+</span>
                  {isTutorial && <span className="tutorial-tooltip" style={{ top: -24, left: -4 }}>CLICK TO ADD ORDER</span>}
                </>
              )}
            </button>
          );
        })}

      {/* Lock-In button */}
      <button
        data-testid="lock-in-btn"
        disabled={lockedIn}
        onClick={onLockIn}
        className={`shrink-0 rounded px-3 py-2 text-xs font-bold tracking-widest uppercase${tutorialHighlightLockIn ? ' tutorial-highlight' : ''}`}
        style={{
          background: lockedIn
            ? 'rgba(30,41,59,0.5)'
            : lockInFlash
              ? 'rgba(230,57,70,0.3)'
              : 'rgba(230,57,70,0.12)',
          border: `1px solid ${lockedIn ? '#2a2535' : '#e63946'}`,
          color: lockedIn ? '#2a2535' : '#e63946',
          cursor: lockedIn ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s ease, border-color 0.2s ease',
          minWidth: isMobile ? 72 : 100,
          position: tutorialHighlightLockIn ? 'relative' as const : undefined,
        }}
      >
        {tutorialHighlightLockIn && <span className="tutorial-tooltip" style={{ top: -24, right: 0 }}>LOCK IN YOUR ORDERS</span>}
        {lockedIn
          ? (isMobile ? 'LOCKED' : 'LOCKED IN')
          : forkMode
            ? (isMobile ? 'CONFIRM' : 'CONFIRM FORK')
            : (isMobile ? 'LOCK' : 'LOCK IN +TE')}
      </button>
    </div>
  );
}
