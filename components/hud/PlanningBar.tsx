'use client';

import { Resources } from '@/engine/state';

interface PlanningBarProps {
  epoch: number;
  resources: Resources;
  timeLeft: number;
  lockedIn: boolean;
  techTier: number;
  researchEpochsLeft: number;
  instabilityTier?: 0 | 1 | 2;
  instabilityEpochsLeft?: number;
  hasEpochAnchor?: boolean;
}

function timerColor(t: number): string {
  if (t > 15) return '#22c55e';
  if (t > 5)  return '#eab308';
  return '#ef4444';
}

export default function PlanningBar({
  epoch, resources, timeLeft, lockedIn, techTier, researchEpochsLeft,
  instabilityTier = 0, instabilityEpochsLeft = 0, hasEpochAnchor = false,
}: PlanningBarProps) {
  const color = timerColor(timeLeft);
  const pct   = Math.round((timeLeft / 30) * 100);

  const techLabel = techTier >= 3 ? 'T3 MAX' : `T${techTier}`;
  const researchLabel = researchEpochsLeft > 0
    ? `↑${researchEpochsLeft}ep`
    : techTier < 3 ? '···' : null;

  return (
    <div
      className="shrink-0 font-mono text-xs"
      style={{ background: 'rgba(10,14,26,0.95)', borderBottom: '1px solid #1e293b' }}
    >
      {/* Main row */}
      <div className="flex items-center justify-between px-4 py-2">
        {/* Left: epoch label */}
        <div className="flex items-center gap-3">
          <span
            className="font-bold tracking-[0.25em] uppercase"
            style={{ color: '#00d4ff', textShadow: '0 0 8px rgba(0,212,255,0.4)' }}
          >
            EPOCH {epoch}
          </span>
          <span style={{ color: '#334155' }}>|</span>
          <span style={{ color: '#64748b' }}>PLANNING</span>
        </div>

        {/* Centre: resources + tech tier */}
        <div className="flex items-center gap-4" style={{ color: '#94a3b8' }}>
          <span>
            <span style={{ color: '#7dd3fc' }}>CC</span>{' '}
            <span style={{ color: '#e2e8f0' }}>{resources.cc}</span>
          </span>
          <span>
            <span style={{ color: '#a78bfa' }}>FX</span>{' '}
            <span style={{ color: '#e2e8f0' }}>{resources.fx}</span>
          </span>
          <span>
            <span style={{ color: '#fbbf24' }}>TE</span>{' '}
            <span style={{ color: '#e2e8f0' }}>{resources.te}</span>
          </span>
          {hasEpochAnchor && (
            <>
              <span style={{ color: '#334155' }}>|</span>
              <span data-testid="epoch-anchor-indicator" title="Epoch Anchor active" style={{ color: '#a78bfa' }}>
                ⚓
              </span>
            </>
          )}
          {instabilityTier > 0 && (
            <>
              <span style={{ color: '#334155' }}>|</span>
              <span
                data-testid="instability-indicator"
                title={`Temporal Instability T${instabilityTier} — ${instabilityEpochsLeft} ep left`}
                style={{ color: instabilityTier >= 2 ? '#ef4444' : '#f97316' }}
              >
                {instabilityTier >= 2 ? 'UNSTABLE T2' : 'UNSTABLE T1'}
                <span style={{ color: '#94a3b8', marginLeft: 4, fontSize: '0.6rem' }}>
                  {instabilityEpochsLeft}ep
                </span>
              </span>
            </>
          )}
          <span style={{ color: '#334155' }}>|</span>
          <span data-testid="tech-tier">
            <span style={{ color: '#34d399' }}>TECH</span>{' '}
            <span style={{ color: '#e2e8f0' }}>{techLabel}</span>
            {researchLabel && (
              <span
                style={{
                  color: researchEpochsLeft > 0 ? '#fbbf24' : '#334155',
                  marginLeft: 4,
                  fontSize: '0.6rem',
                }}
              >
                {researchLabel}
              </span>
            )}
          </span>
        </div>

        {/* Right: timer */}
        <div className="flex items-center gap-2">
          {lockedIn && (
            <span
              className="rounded px-2 py-0.5 text-xs font-bold tracking-widest uppercase"
              style={{ background: 'rgba(0,212,255,0.12)', color: '#00d4ff', border: '1px solid #00d4ff40' }}
            >
              LOCKED
            </span>
          )}
          <span
            data-testid="timer-value"
            className="tabular-nums"
            style={{
              color,
              fontWeight: 700,
              fontSize: '1rem',
              animation: timeLeft <= 5 ? 'pulse-timer 0.8s ease-in-out infinite' : undefined,
            }}
          >
            {timeLeft}s
          </span>
        </div>
      </div>

      {/* Timer progress bar */}
      <div style={{ height: '2px', background: '#1e293b' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            transition: 'width 0.9s linear, background-color 0.5s ease',
          }}
        />
      </div>
    </div>
  );
}
