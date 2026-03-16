import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CommandPicker from '@/components/hud/CommandPicker';
import CommandTray from '@/components/hud/CommandTray';
import type { GlobalCommand } from '@/engine/commands';

const globalPickerProps = {
  position: { kind: 'global' as const, left: 16, slotIndex: 0 },
  playerTE: 5,
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

const emptyCommands: Array<GlobalCommand | null> = [null, null];

describe('Tutorial — Temporal Echo phase', () => {
  it('echo_select_echo step highlights the Echo button', () => {
    render(
      <CommandPicker
        {...globalPickerProps}
        tutorialHighlightType="temporal"
      />,
    );
    const echoBtn = screen.getByRole('menuitem', { name: /Echo/ });
    expect(echoBtn).not.toBeDisabled();
    expect(echoBtn.className).toContain('tutorial-highlight');
  });

  it('echo_select_echo step shows "USE TEMPORAL ECHO" tooltip', () => {
    render(
      <CommandPicker
        {...globalPickerProps}
        tutorialHighlightType="temporal"
      />,
    );
    expect(screen.getByText('USE TEMPORAL ECHO')).toBeInTheDocument();
  });

  it('Echo is enabled when player has enough TE (≥2)', () => {
    render(<CommandPicker {...globalPickerProps} playerTE={2} />);
    const echoBtn = screen.getByRole('menuitem', { name: /Echo/ });
    expect(echoBtn).not.toBeDisabled();
  });

  it('Echo is disabled when player TE < 2', () => {
    render(<CommandPicker {...globalPickerProps} playerTE={1} />);
    const echoBtn = screen.getByRole('menuitem', { name: /Echo/ });
    expect(echoBtn).toBeDisabled();
  });

  it('echo_select_slot step highlights the first empty command slot', () => {
    render(
      <CommandTray
        globalCommands={emptyCommands}
        selectedGlobalSlot={null}
        lockedIn={false}
        lockInFlash={false}
        tutorialHighlightSlot={true}
        onSlotClick={() => {}}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );
    const slot0 = screen.getByTestId('command-slot-0');
    expect(slot0.className).toContain('tutorial-highlight');
  });

  it('echo_lock_in step highlights the lock-in button', () => {
    render(
      <CommandTray
        globalCommands={emptyCommands}
        selectedGlobalSlot={null}
        lockedIn={false}
        lockInFlash={false}
        tutorialHighlightLockIn={true}
        onSlotClick={() => {}}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );
    const lockBtn = screen.getByTestId('lock-in-btn');
    expect(lockBtn.className).toContain('tutorial-highlight');
  });
});
