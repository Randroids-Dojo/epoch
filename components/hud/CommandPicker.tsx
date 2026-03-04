'use client';

import React, { useEffect, useRef } from 'react';
import { CommandType, CHRONO_SHIFT_COST, TEMPORAL_ECHO_COST } from '@/engine/commands';
import { UnitType, UNIT_DEFS } from '@/engine/units';
import { TRAINABLE_UNIT_TYPES } from '@/components/shared/trainFlow';

interface CommandPickerProps {
  slotIndex: number;
  left: number;
  playerTE: number;
  playerCC: number;
  playerFX: number;
  playerTechTier: number;
  researchEpochsLeft: number;
  hasCompletedTechLab: boolean;
  /** True if at least one player unit has a 2-epoch snapshot (Chrono Shift target available). */
  canChronoShift: boolean;
  /** True if the player has a completed War Foundry (enables Tier 2-3 unit training). */
  hasWarFoundry: boolean;
  mode?: 'command' | 'train';
  trainStructureLabel?: string;
  feedback?: string | null;
  onSelect(type: CommandType): void;
  onTrainSelect?(unitType: UnitType): void;
  onClose(): void;
}

interface PickerEntry {
  type: CommandType;
  label: string;
  shortcut: string;
  cost?: string;
  enabled: boolean;
  disabledReason?: string;
}

const TRAY_HEIGHT = 76;

const PICKER_BTN_ENABLED: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: '#e2e8f0', textAlign: 'left', fontFamily: 'inherit',
  fontSize: 'inherit', transition: 'background 0.12s ease',
};
const PICKER_BTN_DISABLED: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'not-allowed',
  color: '#334155', textAlign: 'left', fontFamily: 'inherit',
  fontSize: 'inherit', transition: 'background 0.12s ease',
};

function onPickerMouseEnter(e: React.MouseEvent<HTMLButtonElement>) {
  if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(0,212,255,0.08)';
}
function onPickerMouseLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'transparent';
}

export default function CommandPicker(props: CommandPickerProps) {
  const {
    slotIndex,
    left,
    playerTE,
    playerCC,
    playerFX,
    playerTechTier,
    researchEpochsLeft,
    hasCompletedTechLab,
    canChronoShift,
    hasWarFoundry,
    mode = 'command',
    trainStructureLabel,
    feedback,
    onSelect,
    onTrainSelect,
    onClose,
  } = props;

  const researchEnabled =
    hasCompletedTechLab && playerTechTier < 3 && researchEpochsLeft === 0;
  const researchDisabledReason = !hasCompletedTechLab
    ? 'Requires a completed Tech Lab'
    : playerTechTier >= 3
      ? 'Already at max Tech Tier'
      : researchEpochsLeft > 0
        ? `Researching… ${researchEpochsLeft} ep left`
        : undefined;

  const chronoShiftEnabled = playerTechTier >= 1 && playerTE >= CHRONO_SHIFT_COST && canChronoShift;
  const chronoShiftDisabledReason: string | undefined = playerTechTier < 1
    ? 'Requires Tech Tier 1'
    : playerTE < CHRONO_SHIFT_COST
      ? `Need ${CHRONO_SHIFT_COST} TE`
      : !canChronoShift
        ? 'No unit has 2-epoch history'
        : undefined;

  const entries: PickerEntry[] = [
    { type: 'move',     label: 'Move',     shortcut: 'M', enabled: true },
    { type: 'attack',   label: 'Attack',   shortcut: 'A', enabled: true },
    { type: 'gather',   label: 'Gather',   shortcut: 'G', enabled: true },
    { type: 'defend',   label: 'Defend',   shortcut: 'D', enabled: true },
    { type: 'build',    label: 'Build',    shortcut: 'B', enabled: true },
    { type: 'train',    label: 'Train',    shortcut: 'T', enabled: true },
    {
      type: 'temporal',
      label: 'Echo',
      shortcut: 'E',
      cost: `${TEMPORAL_ECHO_COST}TE`,
      enabled: playerTE >= TEMPORAL_ECHO_COST,
    },
    {
      type: 'chrono_shift',
      label: 'Shift',
      shortcut: 'S',
      cost: `${CHRONO_SHIFT_COST}TE`,
      enabled: chronoShiftEnabled,
      disabledReason: chronoShiftDisabledReason,
    },
    {
      type: 'research',
      label: 'Research',
      shortcut: 'R',
      cost: playerTechTier < 3 ? `T${playerTechTier + 1}` : undefined,
      enabled: researchEnabled,
      disabledReason: researchDisabledReason,
    },
  ];

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute font-mono text-xs"
      style={{
        bottom: TRAY_HEIGHT + 8,
        left,
        zIndex: 100,
        background: '#0d1321',
        border: '1px solid #334155',
        borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        minWidth: 160,
        overflow: 'hidden',
      }}
      role="menu"
      aria-label={`Command picker for slot ${slotIndex + 1}`}
    >
      <div
        className="px-3 py-1.5"
        style={{ color: '#475569', borderBottom: '1px solid #1e293b', fontSize: '0.65rem', letterSpacing: '0.1em' }}
      >
        SLOT {slotIndex + 1} — {mode === 'command' ? 'COMMAND' : 'TRAIN'}
      </div>

      {mode === 'command' && entries.map((entry) => (
        <button
          key={entry.type}
          role="menuitem"
          disabled={!entry.enabled}
          title={entry.disabledReason}
          onClick={() => entry.enabled && onSelect(entry.type)}
          className="flex w-full items-center justify-between px-3 py-2"
          style={entry.enabled ? PICKER_BTN_ENABLED : PICKER_BTN_DISABLED}
          onMouseEnter={onPickerMouseEnter}
          onMouseLeave={onPickerMouseLeave}
        >
          <span>{entry.label}</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
            {entry.cost && (
              <span style={{ color: entry.enabled ? '#fbbf24' : '#334155', fontSize: '0.6rem' }}>
                {entry.cost}
              </span>
            )}
            <span style={{ color: '#334155' }}>{entry.shortcut}</span>
          </span>
        </button>
      ))}

      {mode === 'train' && TRAINABLE_UNIT_TYPES.map((unitType) => {
        const def = UNIT_DEFS[unitType];
        const tierLocked = def.techTierRequired > playerTechTier;
        const needsWarFoundry = def.producedAt === 'war_foundry' && !hasWarFoundry;
        const ccAffordable = playerCC >= def.costCC;
        const fxAffordable = playerFX >= def.costFX;
        const isEnabled = !tierLocked && !needsWarFoundry && ccAffordable && fxAffordable;

        const costLabel = def.costFX > 0 ? `${def.costCC}CC ${def.costFX}FX` : `${def.costCC}CC`;
        const disabledLabel = tierLocked
          ? `T${def.techTierRequired}`
          : needsWarFoundry ? 'War Foundry'
          : !ccAffordable ? 'no CC'
          : !fxAffordable ? 'no FX'
          : undefined;

        return (
          <button
            key={unitType}
            role="menuitem"
            disabled={!isEnabled}
            onClick={() => isEnabled && onTrainSelect?.(unitType)}
            className="flex w-full items-center justify-between px-3 py-2"
            style={isEnabled ? PICKER_BTN_ENABLED : PICKER_BTN_DISABLED}
            onMouseEnter={onPickerMouseEnter}
            onMouseLeave={onPickerMouseLeave}
          >
            <span>{def.label}</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
              <span style={{ color: isEnabled ? '#fbbf24' : '#334155', fontSize: '0.6rem' }}>
                {disabledLabel ?? costLabel}
              </span>
            </span>
          </button>
        );
      })}

      {(mode === 'train' || feedback) && (
        <div className="px-3 py-2" style={{ borderTop: '1px solid #1e293b' }}>
          {mode === 'train' && trainStructureLabel && (
            <div style={{ color: '#64748b', fontSize: '0.65rem' }} data-testid="train-structure-label">
              {trainStructureLabel}
            </div>
          )}
          {feedback && (
            <div style={{ color: '#f87171', fontSize: '0.65rem' }} data-testid="command-feedback">
              {feedback}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
