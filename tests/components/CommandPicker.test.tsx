import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CommandPicker from '@/components/hud/CommandPicker';

const defaultProps = {
  slotIndex: 0,
  left: 16,
  playerTE: 10,
  playerCC: 20,
  playerFX: 5,
  playerTechTier: 0,
  researchEpochsLeft: 0,
  hasCompletedTechLab: false,
  canChronoShift: false,
  hasWarFoundry: false,
  hasEpochAnchor: false,
  canMove: true,
  canAttack: true,
  canGather: true,
  canDefend: true,
  canBuild: true,
  canTrain: true,
  canTimelineFork: false,
  canChronoScout: false,
  onSelect: vi.fn(),
  onEpochAnchorAction: vi.fn(),
  onTrainSelect: vi.fn(),
  onClose: vi.fn(),
};

describe('CommandPicker', () => {
  it('disables Move when canMove is false', () => {
    render(<CommandPicker {...defaultProps} canMove={false} />);
    const btn = screen.getByRole('menuitem', { name: /Move/ });
    expect(btn).toBeDisabled();
  });

  it('enables Move when canMove is true', () => {
    render(<CommandPicker {...defaultProps} canMove={true} />);
    const btn = screen.getByRole('menuitem', { name: /Move/ });
    expect(btn).not.toBeDisabled();
  });

  it('disables Attack when canAttack is false', () => {
    render(<CommandPicker {...defaultProps} canAttack={false} />);
    const btn = screen.getByRole('menuitem', { name: /Attack/ });
    expect(btn).toBeDisabled();
  });

  it('disables Gather when canGather is false', () => {
    render(<CommandPicker {...defaultProps} canGather={false} />);
    const btn = screen.getByRole('menuitem', { name: /Gather/ });
    expect(btn).toBeDisabled();
  });

  it('disables Defend when canDefend is false', () => {
    render(<CommandPicker {...defaultProps} canDefend={false} />);
    const btn = screen.getByRole('menuitem', { name: /Defend/ });
    expect(btn).toBeDisabled();
  });

  it('disables Build when canBuild is false', () => {
    render(<CommandPicker {...defaultProps} canBuild={false} />);
    const btn = screen.getByRole('menuitem', { name: /Build/ });
    expect(btn).toBeDisabled();
  });

  it('disables Train when canTrain is false', () => {
    render(<CommandPicker {...defaultProps} canTrain={false} />);
    const btn = screen.getByRole('menuitem', { name: /Train/ });
    expect(btn).toBeDisabled();
  });

  it('all basic actions enabled when preconditions are met', () => {
    render(<CommandPicker {...defaultProps} />);
    for (const label of ['Move', 'Attack', 'Gather', 'Defend', 'Build', 'Train']) {
      const btn = screen.getByRole('menuitem', { name: new RegExp(label) });
      expect(btn).not.toBeDisabled();
    }
  });

  it('shows disabled reason as title tooltip', () => {
    render(<CommandPicker {...defaultProps} canAttack={false} />);
    const btn = screen.getByRole('menuitem', { name: /Attack/ });
    expect(btn).toHaveAttribute('title', 'No combat units');
  });
});
