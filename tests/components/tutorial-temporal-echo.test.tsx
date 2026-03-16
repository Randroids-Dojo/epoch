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
  it('highlights the Echo button when tutorialHighlightType=temporal', () => {
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

  it('shows "USE TEMPORAL ECHO" tooltip', () => {
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

  it('highlights the first empty command slot for echo_select_slot', () => {
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

  it('highlights the lock-in button for echo_lock_in', () => {
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

describe('Tutorial — Research phase', () => {
  it('highlights the Research button when tutorialHighlightType=research', () => {
    render(
      <CommandPicker
        {...globalPickerProps}
        hasCompletedTechLab={true}
        tutorialHighlightType="research"
      />,
    );
    const researchBtn = screen.getByRole('menuitem', { name: /Research/ });
    expect(researchBtn).not.toBeDisabled();
    expect(researchBtn.className).toContain('tutorial-highlight');
  });

  it('shows "START RESEARCH" tooltip', () => {
    render(
      <CommandPicker
        {...globalPickerProps}
        hasCompletedTechLab={true}
        tutorialHighlightType="research"
      />,
    );
    expect(screen.getByText('START RESEARCH')).toBeInTheDocument();
  });

  it('highlights the first empty slot for research_select_slot', () => {
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
});
