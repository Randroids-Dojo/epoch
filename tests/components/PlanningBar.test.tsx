import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlanningBar from '@/components/hud/PlanningBar';

const baseResources = { cc: 10, fx: 0, te: 3 };

describe('PlanningBar', () => {
  it('renders timer value with data-testid', () => {
    render(
      <PlanningBar epoch={1} resources={baseResources} timeLeft={25} lockedIn={false} />,
    );
    expect(screen.getByTestId('timer-value')).toBeInTheDocument();
    expect(screen.getByTestId('timer-value').textContent).toContain('25');
  });

  it('shows EPOCH label with epoch number', () => {
    render(
      <PlanningBar epoch={3} resources={baseResources} timeLeft={30} lockedIn={false} />,
    );
    expect(screen.getByText(/EPOCH 3/)).toBeInTheDocument();
  });

  it('timer progress bar width is proportional to timeLeft', () => {
    const { container } = render(
      <PlanningBar epoch={1} resources={baseResources} timeLeft={15} lockedIn={false} />,
    );
    const bar = container.querySelector('[style*="width"]') as HTMLElement;
    expect(bar).toBeTruthy();
    // 15/30 = 50%
    expect(bar.style.width).toBe('50%');
  });

  it('timer color is green when timeLeft > 15', () => {
    render(
      <PlanningBar epoch={1} resources={baseResources} timeLeft={20} lockedIn={false} />,
    );
    const timerEl = screen.getByTestId('timer-value');
    expect(timerEl).toHaveStyle({ color: '#22c55e' });
  });

  it('timer color is yellow when 5 < timeLeft <= 15', () => {
    render(
      <PlanningBar epoch={1} resources={baseResources} timeLeft={10} lockedIn={false} />,
    );
    const timerEl = screen.getByTestId('timer-value');
    expect(timerEl).toHaveStyle({ color: '#eab308' });
  });

  it('timer color is red when timeLeft <= 5', () => {
    render(
      <PlanningBar epoch={1} resources={baseResources} timeLeft={3} lockedIn={false} />,
    );
    const timerEl = screen.getByTestId('timer-value');
    expect(timerEl).toHaveStyle({ color: '#ef4444' });
  });

  it('shows LOCKED badge when lockedIn is true', () => {
    render(
      <PlanningBar epoch={1} resources={baseResources} timeLeft={20} lockedIn={true} />,
    );
    expect(screen.getByText('LOCKED')).toBeInTheDocument();
  });

  it('does not show LOCKED badge when not locked in', () => {
    render(
      <PlanningBar epoch={1} resources={baseResources} timeLeft={20} lockedIn={false} />,
    );
    expect(screen.queryByText('LOCKED')).not.toBeInTheDocument();
  });
});
