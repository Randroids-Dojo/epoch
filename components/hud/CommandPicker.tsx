'use client';

import React, { useEffect, useRef } from 'react';
import {
  CommandType, CHRONO_SHIFT_COST, CHRONO_SCOUT_COST,
  EPOCH_ANCHOR_ACTIVATE_COST, EPOCH_ANCHOR_SET_COST,
  TEMPORAL_ECHO_COST, TIMELINE_FORK_COST,
} from '@/engine/commands';
import { UnitType, UNIT_DEFS } from '@/engine/units';
import { TRAINABLE_UNIT_TYPES } from '@/components/shared/trainFlow';

// ── Positioning ───────────────────────────────────────────────────────────────

/** Position the picker to the right of the unit panel. */
export interface UnitPickerPosition {
  kind: 'unit';
  top: number; // pixels from top of canvas area
}

/** Position the picker above a global tray slot. */
export interface GlobalPickerPosition {
  kind: 'global';
  left: number;
  slotIndex: number;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CommandPickerProps {
  position: UnitPickerPosition | GlobalPickerPosition;

  // Player state
  playerTE: number;
  playerCC: number;
  playerFX: number;
  playerTechTier: number;
  researchEpochsLeft: number;
  hasCompletedTechLab: boolean;
  hasWarFoundry: boolean;
  hasEpochAnchor: boolean;
  hasChronoSpire: boolean;

  // Unit-context capabilities (ignored in global mode)
  unitType?: string;
  canAttack?: boolean;       // unit has range > 0
  canGather?: boolean;       // unit is drone + harvestable structure exists
  canBuild?: boolean;        // unit is drone + can afford a structure
  canChronoShift?: boolean;  // unit has 2-epoch snapshot + Tier 1 + enough TE

  // Global-context capabilities (ignored in unit mode)
  canTrain?: boolean;
  canTimelineFork?: boolean;
  timelineForkDisabledReason?: string;
  canChronoScout?: boolean;
  chronoScoutDisabledReason?: string;

  // Train sub-picker
  mode?: 'command' | 'train';
  trainStructureLabel?: string;
  feedback?: string | null;

  onSelect(type: CommandType): void;
  onEpochAnchorAction(action: 'set' | 'activate'): void;
  onTrainSelect?(unitType: UnitType): void;
  onClose(): void;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const TRAY_HEIGHT = 76;
const PANEL_WIDTH = 180;

const BTN_ENABLED: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: '#e2e8f0', textAlign: 'left', fontFamily: 'inherit',
  fontSize: 'inherit', transition: 'background 0.12s ease',
};
const BTN_DISABLED: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'not-allowed',
  color: '#334155', textAlign: 'left', fontFamily: 'inherit',
  fontSize: 'inherit', transition: 'background 0.12s ease',
};

function onMouseEnter(e: React.MouseEvent<HTMLButtonElement>) {
  if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(0,212,255,0.08)';
}
function onMouseLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'transparent';
}

interface PickerEntry {
  type: CommandType;
  label: string;
  cost?: string;
  enabled: boolean;
  disabledReason?: string;
  onClick?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CommandPicker(props: CommandPickerProps) {
  const {
    position,
    playerTE, playerCC, playerFX, playerTechTier,
    researchEpochsLeft, hasCompletedTechLab, hasWarFoundry, hasEpochAnchor, hasChronoSpire,
    unitType, canAttack = false, canGather = false, canBuild = false, canChronoShift = false,
    canTrain = false, canTimelineFork = false, timelineForkDisabledReason,
    canChronoScout = false, chronoScoutDisabledReason,
    mode = 'command', trainStructureLabel, feedback,
    onSelect, onEpochAnchorAction, onTrainSelect, onClose,
  } = props;

  const isUnitContext = position.kind === 'unit';

  // ── Positioning ─────────────────────────────────────────────────────────────
  const posStyle: React.CSSProperties = isUnitContext
    ? {
        top: (position as UnitPickerPosition).top,
        left: PANEL_WIDTH + 8,
        bottom: undefined,
      }
    : {
        bottom: TRAY_HEIGHT + 8,
        left: (position as GlobalPickerPosition).left,
        top: undefined,
      };

  // ── Entry lists ─────────────────────────────────────────────────────────────
  const unitEntries: PickerEntry[] = isUnitContext ? [
    { type: 'move',   label: 'Move',   enabled: true },
    { type: 'attack', label: 'Attack', enabled: canAttack,  disabledReason: canAttack  ? undefined : 'Unit cannot attack' },
    { type: 'gather', label: 'Gather', enabled: canGather,  disabledReason: canGather  ? undefined : 'Requires drone + extractor' },
    { type: 'build',  label: 'Build',  enabled: canBuild,   disabledReason: canBuild   ? undefined : 'Requires drone + CC' },
    { type: 'defend', label: 'Defend', enabled: true },
    {
      type: 'chrono_shift',
      label: 'Chrono Shift',
      cost: `${CHRONO_SHIFT_COST}TE`,
      enabled: canChronoShift,
      disabledReason: !canChronoShift
        ? playerTechTier < 1 ? 'Requires Tech Tier 1'
          : playerTE < CHRONO_SHIFT_COST ? `Need ${CHRONO_SHIFT_COST} TE`
          : 'No 2-epoch history for this unit'
        : undefined,
    },
  ] : [];

  const researchEnabled = hasCompletedTechLab && playerTechTier < 3 && researchEpochsLeft === 0;
  const researchDisabledReason = !hasCompletedTechLab
    ? 'Requires a completed Tech Lab'
    : playerTechTier >= 3
      ? 'Already at max Tech Tier'
      : researchEpochsLeft > 0
        ? `Researching… ${researchEpochsLeft} ep left`
        : undefined;

  const anchorSetEnabled = playerTechTier >= 3 && playerTE >= EPOCH_ANCHOR_SET_COST;
  const anchorActivateEnabled = hasEpochAnchor && playerTE >= EPOCH_ANCHOR_ACTIVATE_COST;

  const globalEntries: PickerEntry[] = !isUnitContext ? [
    { type: 'train',   label: 'Train',   enabled: canTrain,         disabledReason: canTrain ? undefined : 'No production building' },
    { type: 'research', label: 'Research', cost: playerTechTier < 3 ? `T${playerTechTier + 1}` : undefined, enabled: researchEnabled, disabledReason: researchDisabledReason },
    { type: 'temporal', label: 'Echo',    cost: `${TEMPORAL_ECHO_COST}TE`, enabled: playerTE >= TEMPORAL_ECHO_COST },
    {
      type: 'epoch_anchor', label: 'Anchor Set',
      cost: `${EPOCH_ANCHOR_SET_COST}TE`,
      enabled: anchorSetEnabled,
      disabledReason: !anchorSetEnabled ? (playerTechTier < 3 ? 'Requires Tech Tier 3' : `Need ${EPOCH_ANCHOR_SET_COST} TE`) : undefined,
      onClick: () => onEpochAnchorAction('set'),
    },
    {
      type: 'epoch_anchor', label: 'Anchor Recall',
      cost: `${EPOCH_ANCHOR_ACTIVATE_COST}TE`,
      enabled: anchorActivateEnabled,
      disabledReason: !anchorActivateEnabled ? (!hasEpochAnchor ? 'No anchor set' : `Need ${EPOCH_ANCHOR_ACTIVATE_COST} TE`) : undefined,
      onClick: () => onEpochAnchorAction('activate'),
    },
    {
      type: 'timeline_fork', label: 'Fork',
      cost: `${TIMELINE_FORK_COST}TE`,
      enabled: canTimelineFork ?? false,
      disabledReason: timelineForkDisabledReason,
    },
    {
      type: 'chrono_scout', label: 'Scout',
      cost: `${CHRONO_SCOUT_COST}TE`,
      enabled: canChronoScout ?? false,
      disabledReason: chronoScoutDisabledReason ?? (!hasChronoSpire ? 'Requires Chrono Spire' : playerTE < CHRONO_SCOUT_COST ? `Need ${CHRONO_SCOUT_COST} TE` : undefined),
    },
  ] : [];

  const entries = isUnitContext ? unitEntries : globalEntries;

  // ── Header label ────────────────────────────────────────────────────────────
  const headerLabel = isUnitContext
    ? `${unitType ? unitType.replace('_', ' ').toUpperCase() : 'UNIT'} — ACTION`
    : `SLOT ${(position as GlobalPickerPosition).slotIndex + 1} — ${mode === 'train' ? 'TRAIN' : 'ORDER'}`;

  // ── Outside-click + Escape close ────────────────────────────────────────────
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute font-mono text-xs"
      style={{
        ...posStyle,
        zIndex: 100,
        background: '#0d1321',
        border: '1px solid #334155',
        borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        minWidth: 160,
        overflow: 'hidden',
      }}
      role="menu"
      aria-label={headerLabel}
    >
      <div
        className="px-3 py-1.5"
        style={{ color: '#475569', borderBottom: '1px solid #1e293b', fontSize: '0.65rem', letterSpacing: '0.1em' }}
      >
        {headerLabel}
      </div>

      {mode === 'command' && entries.map((entry) => (
        <button
          key={entry.label}
          role="menuitem"
          disabled={!entry.enabled}
          title={entry.disabledReason}
          onClick={() => entry.enabled && (entry.onClick ? entry.onClick() : onSelect(entry.type))}
          className="flex w-full items-center justify-between px-3 py-2"
          style={entry.enabled ? BTN_ENABLED : BTN_DISABLED}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          <span>{entry.label}</span>
          {entry.cost && (
            <span style={{ color: entry.enabled ? '#fbbf24' : '#334155', fontSize: '0.6rem', marginLeft: 16 }}>
              {entry.cost}
            </span>
          )}
        </button>
      ))}

      {mode === 'train' && TRAINABLE_UNIT_TYPES.map((unitType) => {
        const def = UNIT_DEFS[unitType];
        const tierLocked = def.techTierRequired > playerTechTier;
        const needsWarFoundry = def.producedAt === 'war_foundry' && !hasWarFoundry;
        const ccOk = playerCC >= def.costCC;
        const fxOk = playerFX >= def.costFX;
        const isEnabled = !tierLocked && !needsWarFoundry && ccOk && fxOk;
        const costLabel = def.costFX > 0 ? `${def.costCC}CC ${def.costFX}FX` : `${def.costCC}CC`;
        const disabledLabel = tierLocked ? `T${def.techTierRequired}` : needsWarFoundry ? 'War Foundry' : !ccOk ? 'no CC' : !fxOk ? 'no FX' : undefined;

        return (
          <button
            key={unitType}
            role="menuitem"
            disabled={!isEnabled}
            onClick={() => isEnabled && onTrainSelect?.(unitType)}
            className="flex w-full items-center justify-between px-3 py-2"
            style={isEnabled ? BTN_ENABLED : BTN_DISABLED}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            <span>{def.label}</span>
            <span style={{ color: isEnabled ? '#fbbf24' : '#334155', fontSize: '0.6rem', marginLeft: 16 }}>
              {disabledLabel ?? costLabel}
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
