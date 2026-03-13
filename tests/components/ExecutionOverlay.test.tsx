import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ExecutionOverlay from '@/components/hud/ExecutionOverlay';

describe('ExecutionOverlay', () => {
  it('renders the skip button', () => {
    render(<ExecutionOverlay elapsed={0} onSkip={() => {}} />);
    expect(screen.getByTestId('skip-btn')).toBeVisible();
  });

  it('renders the phase label', () => {
    render(<ExecutionOverlay elapsed={0} onSkip={() => {}} />);
    expect(screen.getByTestId('phase-label')).toHaveTextContent('DEFENDING');
  });

  it('shows MOVEMENT label during move phase', () => {
    render(<ExecutionOverlay elapsed={2.0} onSkip={() => {}} />);
    expect(screen.getByTestId('phase-label')).toHaveTextContent('MOVEMENT');
  });

  it('shows COMBAT label during attack phase', () => {
    render(<ExecutionOverlay elapsed={5.0} onSkip={() => {}} />);
    expect(screen.getByTestId('phase-label')).toHaveTextContent('COMBAT');
  });

  it('calls onSkip when skip button is clicked', () => {
    const onSkip = vi.fn();
    render(<ExecutionOverlay elapsed={0} onSkip={onSkip} />);
    fireEvent.click(screen.getByTestId('skip-btn'));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
