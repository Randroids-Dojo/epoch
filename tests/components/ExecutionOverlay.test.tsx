import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ExecutionOverlay from '@/components/hud/ExecutionOverlay';
import { ExecutionAnimation } from '@/renderer/animation';

function makeAnimation(overrides?: Partial<ExecutionAnimation>): ExecutionAnimation {
  return {
    units: new Map(),
    structures: new Map(),
    destroyedUnits: [],
    destroyedStructures: [],
    eventLog: [
      'player pulse_sentry is defending',
      'player drone → (1,0)',
      'player arc_ranger attacks ai drone for 8',
      'player began building Crystal Extractor',
    ],
    startedAt: 0,
    ...overrides,
  };
}

describe('ExecutionOverlay', () => {
  it('renders the skip button', () => {
    render(<ExecutionOverlay animation={makeAnimation()} elapsed={0} onSkip={() => {}} />);
    expect(screen.getByTestId('skip-btn')).toBeVisible();
  });

  it('renders the phase label', () => {
    render(<ExecutionOverlay animation={makeAnimation()} elapsed={0} onSkip={() => {}} />);
    expect(screen.getByTestId('phase-label')).toHaveTextContent('DEFENDING');
  });

  it('shows MOVEMENT label during move phase', () => {
    render(<ExecutionOverlay animation={makeAnimation()} elapsed={1.0} onSkip={() => {}} />);
    expect(screen.getByTestId('phase-label')).toHaveTextContent('MOVEMENT');
  });

  it('shows COMBAT label during attack phase', () => {
    render(<ExecutionOverlay animation={makeAnimation()} elapsed={2.5} onSkip={() => {}} />);
    expect(screen.getByTestId('phase-label')).toHaveTextContent('COMBAT');
  });

  it('shows log entries for current and previous phases', () => {
    render(<ExecutionOverlay animation={makeAnimation()} elapsed={1.0} onSkip={() => {}} />);
    const entries = screen.getAllByTestId('log-entry');
    // During move phase: defend + move entries visible.
    expect(entries.length).toBe(2);
  });

  it('calls onSkip when skip button is clicked', () => {
    const onSkip = vi.fn();
    render(<ExecutionOverlay animation={makeAnimation()} elapsed={0} onSkip={onSkip} />);
    fireEvent.click(screen.getByTestId('skip-btn'));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('renders with empty event log', () => {
    render(<ExecutionOverlay animation={makeAnimation({ eventLog: [] })} elapsed={0} onSkip={() => {}} />);
    expect(screen.queryAllByTestId('log-entry')).toHaveLength(0);
  });
});
