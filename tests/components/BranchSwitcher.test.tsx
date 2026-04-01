import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BranchSwitcher from '@/components/hud/BranchSwitcher';
import type { BranchSummary } from '@/engine/timelineBranching';

const makeBranches = (): BranchSummary[] => [
  { id: 'br1', name: 'Original', epochRange: 'Epochs 1–5', status: 'playing', isActive: false },
  { id: 'br2', name: 'Fork 2 from Epoch 3', epochRange: 'Epochs 3–4', status: 'victory', isActive: true },
  { id: 'br3', name: 'Fork 3 from Epoch 2', epochRange: 'Epoch 2', status: 'defeat', isActive: false },
];

describe('BranchSwitcher', () => {
  it('renders all branches', () => {
    render(
      <BranchSwitcher
        branches={makeBranches()}
        activeBranchId="br2"
        onSwitch={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('branch-item-br1')).toBeTruthy();
    expect(screen.getByTestId('branch-item-br2')).toBeTruthy();
    expect(screen.getByTestId('branch-item-br3')).toBeTruthy();
  });

  it('calls onSwitch with correct ID when clicking inactive branch', () => {
    const onSwitch = vi.fn();
    render(
      <BranchSwitcher
        branches={makeBranches()}
        activeBranchId="br2"
        onSwitch={onSwitch}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('branch-item-br1'));
    expect(onSwitch).toHaveBeenCalledWith('br1');
  });

  it('does not call onSwitch when clicking active branch', () => {
    const onSwitch = vi.fn();
    render(
      <BranchSwitcher
        branches={makeBranches()}
        activeBranchId="br2"
        onSwitch={onSwitch}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('branch-item-br2'));
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('calls onClose when clicking close button', () => {
    const onClose = vi.fn();
    render(
      <BranchSwitcher
        branches={makeBranches()}
        activeBranchId="br2"
        onSwitch={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId('branch-switcher-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when clicking overlay backdrop', () => {
    const onClose = vi.fn();
    render(
      <BranchSwitcher
        branches={makeBranches()}
        activeBranchId="br2"
        onSwitch={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId('branch-switcher-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close when clicking inside the panel', () => {
    const onClose = vi.fn();
    render(
      <BranchSwitcher
        branches={makeBranches()}
        activeBranchId="br2"
        onSwitch={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId('branch-switcher'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
