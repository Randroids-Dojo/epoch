'use client';

import { ExecutionAnimation, getCurrentPhase } from '@/renderer/animation';
import { ActionBeat, getSequenceCameraTarget } from '@/renderer/actionSequence';
import { DEAD_ZONE } from '@/lib/constants';

interface ExecutionOverlayProps {
  animation: ExecutionAnimation;
  elapsed: number;
  actionBeats?: ActionBeat[] | null;
  onSkip(): void;
  tutorialHighlightSkip?: boolean;
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
  actionBeats,
  onSkip,
  tutorialHighlightSkip,
}: ExecutionOverlayProps) {
  const phase = getCurrentPhase(elapsed);
  const phaseLabel = phase ? PHASE_LABELS[phase] ?? phase.toUpperCase() : 'RESOLVING';

  // Current cinematic beat label.
  const beatTarget = actionBeats && actionBeats.length > 0
    ? getSequenceCameraTarget(actionBeats, elapsed)
    : null;
  const beatLabel = beatTarget?.label || '';

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col font-mono">
      {/* Phase label + beat label */}
      <div className="flex flex-col items-center gap-1" style={{ paddingTop: DEAD_ZONE.TOP }}>
        <div
          data-testid="phase-label"
          className="rounded px-3 py-1 text-xs font-bold tracking-widest uppercase"
          style={{
            background: 'rgba(230,57,70,0.1)',
            border: '1px solid rgba(230,57,70,0.3)',
            color: '#e63946',
          }}
        >
          {phaseLabel}
        </div>
        {beatLabel && (
          <div
            data-testid="beat-label"
            className="rounded px-3 py-1 text-xs font-semibold"
            style={{
              background: 'rgba(11,10,15,0.85)',
              border: '1px solid rgba(230,57,70,0.2)',
              color: '#f1faee',
              animation: 'fadeIn 0.25s ease forwards',
            }}
          >
            {beatLabel}
          </div>
        )}
      </div>

      {/* Spacer — pushes skip button to bottom */}
      <div className="flex-1" />

      {/* Skip button — bottom right, raised above dead zone */}
      <div className="pointer-events-auto flex justify-end pr-3" style={{ paddingBottom: DEAD_ZONE.BOTTOM }}>
        <button
          data-testid="skip-btn"
          onClick={onSkip}
          className={`rounded px-4 py-2 text-xs font-bold tracking-widest uppercase${tutorialHighlightSkip ? ' tutorial-highlight' : ''}`}
          style={{
            background: 'rgba(230,57,70,0.12)',
            border: tutorialHighlightSkip ? undefined : '1px solid #e63946',
            color: '#e63946',
            cursor: 'pointer',
            minWidth: 80,
            position: tutorialHighlightSkip ? 'relative' as const : undefined,
          }}
        >
          SKIP
          {tutorialHighlightSkip && <span className="tutorial-tooltip" style={{ top: -28, right: 0 }}>SKIP ANIMATION</span>}
        </button>
      </div>
    </div>
  );
}
