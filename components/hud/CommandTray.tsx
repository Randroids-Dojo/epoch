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

const TYPE_CODE: Record<string, string> = {
  train:          'TR',
  research:       'RS',
  temporal:       'TM',
  chrono_shift:   'SH',
  epoch_anchor:   'AN',
  timeline_fork:  'FK',
  chrono_scout:   'SC',
};

function cmdLabel(cmd: GlobalCommand): string {
  switch (cmd.type) {
    case 'train':        return `${cmd.unitType}@${cmd.structureId.slice(-3)}`;
    case 'research':     return 'TECH';
    case 'temporal':     return 'ECHO';
    case 'epoch_anchor': return cmd.action === 'set' ? 'ANCHOR' : 'RECALL';
    case 'timeline_fork': return 'FORK';
    case 'chrono_scout': return 'SCOUT';
  }
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
      className="absolute right-0 bottom-0 flex flex-col items-end gap-1.5 font-mono"
      style={{ zIndex: 30, padding: '8px 8px', pointerEvents: 'auto' }}
    >
      {/* Command slots — horizontal row */}
      <div className="flex items-center" style={{ gap: slot.gap }}>
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
                  : '1px solid #2a2535',
                boxShadow: isSelected
                  ? '0 0 8px rgba(230,57,70,0.35), inset 0 0 8px rgba(230,57,70,0.08)'
                  : undefined,
                background: isSelected
                  ? 'rgba(230,57,70,0.06)'
                  : 'rgba(22,20,28,0.6)',
                animation: !cmd && !isSelected && !lockedIn ? 'pulse-border 2.5s ease-in-out infinite' : undefined,
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.2s ease',
                fontFamily: 'inherit',
              }}
            >
              {cmd ? (
                <>
                  <span
                    className="absolute left-1 top-0.5"
                    style={{ color: '#2a2535', fontSize: '0.6rem' }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex flex-col items-center gap-0.5">
                    <span style={{ color: '#e63946', fontWeight: 700 }}>
                      {TYPE_CODE[cmd.type] ?? cmd.type.slice(0, 2).toUpperCase()}
                    </span>
                    <span style={{ color: '#64748b', fontSize: '0.6rem' }}>
                      {cmdLabel(cmd)}
                    </span>
                  </div>
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
                  <span style={{ color: '#2a2535', fontSize: '1.1rem' }}>+</span>
                  {isTutorial && <span className="tutorial-tooltip" style={{ top: -24, left: -4 }}>CLICK TO ADD ORDER</span>}
                </>
              )}
            </button>
          );
        })}
      </div>

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
