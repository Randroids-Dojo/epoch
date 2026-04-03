'use client';

import { COLORS } from '@/lib/constants';

interface TimelineBarProps {
  snapshotCount: number;
  currentEpoch: number;
  branchName: string;
  branchCount: number;
  onRewind: (epochIndex: number) => void;
  onOpenSwitcher: () => void;
  disabled?: boolean;
}

/**
 * Thin bar showing epoch dots for the active timeline branch.
 * Past epochs are clickable (triggers a fork/rewind). Current epoch is highlighted.
 */
export default function TimelineBar({
  snapshotCount,
  currentEpoch,
  branchName,
  branchCount,
  onRewind,
  onOpenSwitcher,
  disabled = false,
}: TimelineBarProps) {
  const dots = [];

  // Past epoch dots (one per snapshot)
  for (let i = 0; i < snapshotCount; i++) {
    const epochNum = i + 1;
    dots.push(
      <button
        key={`past-${i}`}
        data-testid={`epoch-dot-${epochNum}`}
        onClick={() => !disabled && onRewind(i)}
        disabled={disabled}
        title={disabled ? `Epoch ${epochNum}` : `Rewind to Epoch ${epochNum}`}
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          border: `2px solid ${disabled ? '#334155' : COLORS.CYAN}`,
          background: 'transparent',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          transition: 'border-color 0.2s, opacity 0.2s',
          padding: 0,
        }}
        aria-label={`Epoch ${epochNum}`}
      />,
    );
  }

  // Current epoch dot (filled, not clickable)
  dots.push(
    <div
      key="current"
      data-testid={`epoch-dot-${currentEpoch}`}
      title={`Epoch ${currentEpoch} (current)`}
      style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: COLORS.CYAN,
        border: `2px solid ${COLORS.CYAN}`,
        boxShadow: `0 0 6px ${COLORS.CYAN}88`,
      }}
    />,
  );

  return (
    <div
      data-testid="timeline-bar"
      className="shrink-0 font-mono"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        background: 'rgba(11,10,15,0.9)',
        borderBottom: '1px solid #1e1b2e',
        fontSize: '0.65rem',
        letterSpacing: '0.15em',
        color: '#64748b',
        minHeight: 28,
      }}
    >
      {/* Branch name + switcher */}
      <button
        data-testid="branch-name"
        disabled={branchCount <= 1}
        onClick={onOpenSwitcher}
        style={{
          background: 'none',
          border: 'none',
          color: branchCount > 1 ? COLORS.CYAN : '#64748b',
          cursor: branchCount > 1 ? 'pointer' : 'default',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          letterSpacing: 'inherit',
          textTransform: 'uppercase',
          padding: '0 4px',
          whiteSpace: 'nowrap',
        }}
      >
        {branchName}
        {branchCount > 1 && (
          <span style={{ marginLeft: 4, color: '#475569' }}>({branchCount})</span>
        )}
      </button>

      {/* Separator */}
      <div style={{ width: 1, height: 14, background: '#1e293b' }} />

      {/* Epoch dots */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
          flex: 1,
        }}
      >
        {dots}
      </div>
    </div>
  );
}
