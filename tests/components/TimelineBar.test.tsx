import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TimelineBar from '@/components/hud/TimelineBar';

describe('TimelineBar', () => {
  const defaultProps = {
    snapshotCount: 3,
    currentEpoch: 4,
    branchName: 'Original',
    branchCount: 1,
    onRewind: vi.fn(),
    onOpenSwitcher: vi.fn(),
  };

  it('renders correct number of epoch dots (snapshots + current)', () => {
    render(<TimelineBar {...defaultProps} />);

    // 3 past epoch dots + 1 current = 4 dots total
    expect(screen.getByTestId('epoch-dot-1')).toBeTruthy();
    expect(screen.getByTestId('epoch-dot-2')).toBeTruthy();
    expect(screen.getByTestId('epoch-dot-3')).toBeTruthy();
    expect(screen.getByTestId('epoch-dot-4')).toBeTruthy(); // current
  });

  it('calls onRewind with correct index when clicking a past epoch dot', () => {
    const onRewind = vi.fn();
    render(<TimelineBar {...defaultProps} onRewind={onRewind} />);

    fireEvent.click(screen.getByTestId('epoch-dot-2'));
    expect(onRewind).toHaveBeenCalledWith(1); // index 1 = epoch 2
  });

  it('displays the branch name', () => {
    render(<TimelineBar {...defaultProps} branchName="Fork from Epoch 3" />);
    expect(screen.getByTestId('branch-name').textContent).toContain('Fork from Epoch 3');
  });

  it('shows branch count when more than 1 branch', () => {
    render(<TimelineBar {...defaultProps} branchCount={3} />);
    expect(screen.getByTestId('branch-name').textContent).toContain('(3)');
  });

  it('does not fire onRewind when disabled', () => {
    const onRewind = vi.fn();
    render(<TimelineBar {...defaultProps} onRewind={onRewind} disabled />);

    fireEvent.click(screen.getByTestId('epoch-dot-1'));
    expect(onRewind).not.toHaveBeenCalled();
  });

  it('calls onOpenSwitcher when clicking branch name', () => {
    const onOpenSwitcher = vi.fn();
    render(<TimelineBar {...defaultProps} branchCount={2} onOpenSwitcher={onOpenSwitcher} />);

    fireEvent.click(screen.getByTestId('branch-name'));
    expect(onOpenSwitcher).toHaveBeenCalled();
  });

  it('renders only current dot when no snapshots exist', () => {
    render(<TimelineBar {...defaultProps} snapshotCount={0} currentEpoch={1} />);

    expect(screen.getByTestId('epoch-dot-1')).toBeTruthy();
    expect(screen.queryByTestId('epoch-dot-2')).toBeNull();
  });

  it('does not show branch count badge when only 1 branch', () => {
    render(<TimelineBar {...defaultProps} branchCount={1} />);
    expect(screen.getByTestId('branch-name').textContent).not.toContain('(');
  });
});
