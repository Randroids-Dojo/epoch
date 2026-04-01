'use client';

import { COLORS } from '@/lib/constants';
import type { BranchSummary } from '@/engine/timelineBranching';

interface BranchSwitcherProps {
  branches: BranchSummary[];
  activeBranchId: string;
  onSwitch: (branchId: string) => void;
  onClose: () => void;
}

const STATUS_COLORS: Record<BranchSummary['status'], string> = {
  playing: '#64748b',
  victory: '#22c55e',
  defeat: COLORS.CORAL,
};

const STATUS_LABELS: Record<BranchSummary['status'], string> = {
  playing: 'PLAYING',
  victory: 'VICTORY',
  defeat: 'DEFEAT',
};

/**
 * Overlay panel listing all timeline branches.
 * Click a branch to switch to it; click outside or × to close.
 */
export default function BranchSwitcher({
  branches,
  activeBranchId,
  onSwitch,
  onClose,
}: BranchSwitcherProps) {
  return (
    <div
      data-testid="branch-switcher-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 60,
      }}
    >
      <div
        data-testid="branch-switcher"
        onClick={(e) => e.stopPropagation()}
        className="font-mono"
        style={{
          background: '#0f0e17',
          border: '1px solid #1e293b',
          borderRadius: 6,
          padding: '12px 0',
          minWidth: 260,
          maxWidth: 360,
          maxHeight: '60vh',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 12px 8px',
            borderBottom: '1px solid #1e293b',
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: '0.65rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#94a3b8',
            }}
          >
            Timelines
          </span>
          <button
            data-testid="branch-switcher-close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#475569',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: '0 2px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Branch list */}
        {branches.map((branch) => {
          const isActive = branch.id === activeBranchId;
          const statusColor = STATUS_COLORS[branch.status];

          return (
            <button
              key={branch.id}
              data-testid={`branch-item-${branch.id}`}
              onClick={() => !isActive && onSwitch(branch.id)}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                background: isActive ? 'rgba(230,57,70,0.06)' : 'transparent',
                border: 'none',
                borderLeft: isActive ? `2px solid ${COLORS.CYAN}` : '2px solid transparent',
                cursor: isActive ? 'default' : 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                transition: 'background 0.15s',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: isActive ? COLORS.CYAN : '#cbd5e1',
                    letterSpacing: '0.1em',
                  }}
                >
                  {branch.name}
                </span>
                <span
                  style={{
                    fontSize: '0.55rem',
                    color: statusColor,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                  }}
                >
                  {STATUS_LABELS[branch.status]}
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.55rem',
                  color: '#475569',
                  marginTop: 2,
                  letterSpacing: '0.1em',
                }}
              >
                {branch.epochRange}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
