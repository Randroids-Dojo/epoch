'use client';

import { ExecutionAnimation, getCurrentPhase, getVisibleLogEntries } from '@/renderer/animation';

interface ExecutionOverlayProps {
  animation: ExecutionAnimation;
  elapsed: number;
  onSkip(): void;
}

const PHASE_LABELS: Record<string, string> = {
  defend: 'DEFENDING',
  move: 'MOVEMENT',
  attack: 'COMBAT',
  build: 'PRODUCTION',
};

export default function ExecutionOverlay({
  animation,
  elapsed,
  onSkip,
}: ExecutionOverlayProps) {
  const phase = getCurrentPhase(elapsed);
  const phaseLabel = phase ? PHASE_LABELS[phase] ?? phase.toUpperCase() : 'RESOLVING';
  const visibleEntries = getVisibleLogEntries(animation.eventLog, elapsed);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col font-mono">
      {/* Phase label */}
      <div className="flex justify-center pt-2">
        <div
          data-testid="phase-label"
          className="rounded px-3 py-1 text-xs font-bold tracking-widest uppercase"
          style={{
            background: 'rgba(0,212,255,0.1)',
            border: '1px solid rgba(0,212,255,0.3)',
            color: '#00d4ff',
          }}
        >
          {phaseLabel}
        </div>
      </div>

      {/* Event log — left side */}
      <div
        className="flex-1 overflow-hidden p-4"
        style={{ maxWidth: 320 }}
      >
        <div className="flex flex-col gap-1">
          {visibleEntries.map((entry, i) => (
            <div
              key={i}
              data-testid="log-entry"
              className="rounded px-2 py-0.5 text-xs"
              style={{
                background: 'rgba(10,14,26,0.85)',
                color: '#94a3b8',
                animation: 'fadeIn 0.3s ease forwards',
              }}
            >
              {entry}
            </div>
          ))}
        </div>
      </div>

      {/* Skip button — bottom right */}
      <div className="pointer-events-auto flex justify-end p-4">
        <button
          data-testid="skip-btn"
          onClick={onSkip}
          className="rounded px-4 py-2 text-xs font-bold tracking-widest uppercase"
          style={{
            background: 'rgba(0,212,255,0.12)',
            border: '1px solid #00d4ff',
            color: '#00d4ff',
            cursor: 'pointer',
            minWidth: 80,
          }}
        >
          SKIP
        </button>
      </div>
    </div>
  );
}
