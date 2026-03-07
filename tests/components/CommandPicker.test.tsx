import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CommandPicker from '@/components/hud/CommandPicker';

const unitPickerProps = {
  position: { kind: 'unit' as const, top: 8 },
  playerTE: 10,
  playerCC: 20,
  playerFX: 5,
  playerTechTier: 0,
  researchEpochsLeft: 0,
  hasCompletedTechLab: false,
  hasChronoSpire: false,
  canChronoShift: false,
  hasWarFoundry: false,
  hasEpochAnchor: false,
  canAttack: true,
  canGather: true,
  canBuild: true,
  canTimelineFork: false,
  canChronoScout: false,
  onSelect: vi.fn(),
  onEpochAnchorAction: vi.fn(),
  onTrainSelect: vi.fn(),
  onClose: vi.fn(),
};

const globalPickerProps = {
  position: { kind: 'global' as const, left: 16, slotIndex: 0 },
  playerTE: 10,
  playerCC: 20,
  playerFX: 5,
  playerTechTier: 0,
  researchEpochsLeft: 0,
  hasCompletedTechLab: false,
  hasChronoSpire: false,
  hasWarFoundry: false,
  hasEpochAnchor: false,
  canTrain: true,
  canTimelineFork: false,
  canChronoScout: false,
  onSelect: vi.fn(),
  onEpochAnchorAction: vi.fn(),
  onTrainSelect: vi.fn(),
  onClose: vi.fn(),
};

describe('CommandPicker', () => {
  it('Move is always enabled in unit mode', () => {
    render(<CommandPicker {...unitPickerProps} />);
    const btn = screen.getByRole('menuitem', { name: /Move/ });
    expect(btn).not.toBeDisabled();
  });

  it('Defend is always enabled in unit mode', () => {
    render(<CommandPicker {...unitPickerProps} />);
    const btn = screen.getByRole('menuitem', { name: /Defend/ });
    expect(btn).not.toBeDisabled();
  });

  it('disables Attack when canAttack is false', () => {
    render(<CommandPicker {...unitPickerProps} canAttack={false} />);
    const btn = screen.getByRole('menuitem', { name: /Attack/ });
    expect(btn).toBeDisabled();
  });

  it('disables Gather when canGather is false', () => {
    render(<CommandPicker {...unitPickerProps} canGather={false} />);
    const btn = screen.getByRole('menuitem', { name: /Gather/ });
    expect(btn).toBeDisabled();
  });

  it('disables Build when canBuild is false', () => {
    render(<CommandPicker {...unitPickerProps} canBuild={false} />);
    const btn = screen.getByRole('menuitem', { name: /Build/ });
    expect(btn).toBeDisabled();
  });

  it('disables Train when canTrain is false', () => {
    render(<CommandPicker {...globalPickerProps} canTrain={false} />);
    const btn = screen.getByRole('menuitem', { name: /Train/ });
    expect(btn).toBeDisabled();
  });

  it('all unit actions are enabled when preconditions are met', () => {
    render(<CommandPicker {...unitPickerProps} />);
    for (const label of ['Move', 'Attack', 'Gather', 'Defend', 'Build']) {
      const btn = screen.getByRole('menuitem', { name: new RegExp(label) });
      expect(btn).not.toBeDisabled();
    }
  });

  it('shows disabled reason as title tooltip', () => {
    render(<CommandPicker {...unitPickerProps} canAttack={false} />);
    const btn = screen.getByRole('menuitem', { name: /Attack/ });
    expect(btn).toHaveAttribute('title', 'Unit cannot attack');
  });
});
