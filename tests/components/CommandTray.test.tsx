import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommandTray from '@/components/hud/CommandTray';
import type { GlobalCommand } from '@/engine/commands';

const emptyCommands: Array<GlobalCommand | null> = [null, null];

const filledCommands: Array<GlobalCommand | null> = [
  { type: 'research' },
  null,
];

describe('CommandTray', () => {
  it('renders 2 global command slots', () => {
    render(
      <CommandTray
        globalCommands={emptyCommands}
        selectedGlobalSlot={null}
        lockedIn={false}
        lockInFlash={false}
        onSlotClick={() => {}}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );
    for (let i = 0; i < 2; i++) {
      expect(screen.getByTestId(`command-slot-${i}`)).toBeInTheDocument();
    }
  });

  it('filled slot shows type code and label', () => {
    render(
      <CommandTray
        globalCommands={filledCommands}
        selectedGlobalSlot={null}
        lockedIn={false}
        lockInFlash={false}
        onSlotClick={() => {}}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );
    expect(screen.getByText('RS')).toBeInTheDocument();
    expect(screen.getByText('TECH')).toBeInTheDocument();
  });


  it('train command shows unit type and structure hint', () => {
    const trainCommands: Array<GlobalCommand | null> = [
      { type: 'train', structureId: 's12345', unitType: 'arc_ranger' },
      null,
    ];

    render(
      <CommandTray
        globalCommands={trainCommands}
        selectedGlobalSlot={null}
        lockedIn={false}
        lockInFlash={false}
        onSlotClick={() => {}}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );

    expect(screen.getByText('TR')).toBeInTheDocument();
    expect(screen.getByText('arc_ranger@345')).toBeInTheDocument();
  });

  it('clicking × calls onSlotClear with the correct index', () => {
    const onSlotClear = vi.fn();
    render(
      <CommandTray
        globalCommands={filledCommands}
        selectedGlobalSlot={null}
        lockedIn={false}
        lockInFlash={false}
        onSlotClick={() => {}}
        onSlotClear={onSlotClear}
        onLockIn={() => {}}
      />,
    );
    const clearBtn = screen.getByRole('button', { name: 'Clear slot 1' });
    fireEvent.click(clearBtn);
    expect(onSlotClear).toHaveBeenCalledWith(0);
  });

  it('lock-in button is disabled when lockedIn=true', () => {
    render(
      <CommandTray
        globalCommands={emptyCommands}
        selectedGlobalSlot={null}
        lockedIn={true}
        lockInFlash={false}
        onSlotClick={() => {}}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );
    const btn = screen.getByTestId('lock-in-btn');
    expect(btn).toBeDisabled();
  });

  it('lock-in button is enabled when not lockedIn', () => {
    render(
      <CommandTray
        globalCommands={emptyCommands}
        selectedGlobalSlot={null}
        lockedIn={false}
        lockInFlash={false}
        onSlotClick={() => {}}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );
    const btn = screen.getByTestId('lock-in-btn');
    expect(btn).not.toBeDisabled();
  });

  it('selected slot has cyan border styling', () => {
    render(
      <CommandTray
        globalCommands={emptyCommands}
        selectedGlobalSlot={1}
        lockedIn={false}
        lockInFlash={false}
        onSlotClick={() => {}}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );
    const slot = screen.getByTestId('command-slot-1');
    // Selected slot has cyan border (jsdom converts hex to rgb)
    expect(slot.style.border).toContain('rgb(0, 212, 255)');
  });

  it('clicking a slot calls onSlotClick with correct index', () => {
    const onSlotClick = vi.fn();
    render(
      <CommandTray
        globalCommands={emptyCommands}
        selectedGlobalSlot={null}
        lockedIn={false}
        lockInFlash={false}
        onSlotClick={onSlotClick}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('command-slot-1'));
    expect(onSlotClick).toHaveBeenCalledWith(1);
  });
});
