import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CommandTray from '@/components/hud/CommandTray';
import type { CommandQueue } from '@/engine/commands';

const emptyCommands: CommandQueue = [null, null, null, null, null];

const filledCommands: CommandQueue = [
  { type: 'move', unitId: 'u1', targetHex: { q: 2, r: -1 } },
  null,
  null,
  null,
  null,
];

describe('CommandTray', () => {
  it('renders 5 command slots', () => {
    render(
      <CommandTray
        commands={emptyCommands}
        selectedSlot={null}
        lockedIn={false}
        lockInFlash={false}
        onSlotClick={() => {}}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`command-slot-${i}`)).toBeInTheDocument();
    }
  });

  it('filled slot shows type code and target', () => {
    render(
      <CommandTray
        commands={filledCommands}
        selectedSlot={null}
        lockedIn={false}
        lockInFlash={false}
        onSlotClick={() => {}}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );
    expect(screen.getByText('MV')).toBeInTheDocument();
    expect(screen.getByText('(2,-1)')).toBeInTheDocument();
  });


  it('train command shows unit type and structure hint', () => {
    const trainCommands: CommandQueue = [
      { type: 'train', structureId: 's12345', unitType: 'arc_ranger' },
      null,
      null,
      null,
      null,
    ];

    render(
      <CommandTray
        commands={trainCommands}
        selectedSlot={null}
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
        commands={filledCommands}
        selectedSlot={null}
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
        commands={emptyCommands}
        selectedSlot={null}
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
        commands={emptyCommands}
        selectedSlot={null}
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
        commands={emptyCommands}
        selectedSlot={2}
        lockedIn={false}
        lockInFlash={false}
        onSlotClick={() => {}}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );
    const slot = screen.getByTestId('command-slot-2');
    // Selected slot has cyan border (jsdom converts hex to rgb)
    expect(slot.style.border).toContain('rgb(0, 212, 255)');
  });

  it('clicking a slot calls onSlotClick with correct index', () => {
    const onSlotClick = vi.fn();
    render(
      <CommandTray
        commands={emptyCommands}
        selectedSlot={null}
        lockedIn={false}
        lockInFlash={false}
        onSlotClick={onSlotClick}
        onSlotClear={() => {}}
        onLockIn={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('command-slot-3'));
    expect(onSlotClick).toHaveBeenCalledWith(3);
  });
});
