'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  CommandType, CHRONO_SHIFT_COST, CHRONO_SCOUT_COST,
  EPOCH_ANCHOR_ACTIVATE_COST, EPOCH_ANCHOR_SET_COST,
  TEMPORAL_ECHO_COST, TIMELINE_FORK_COST, PHASE_SURGE_COST,
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
  canMerge?: boolean;        // same-type friendly units within merge range

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

  /** Command type to highlight for tutorial guidance. */
  tutorialHighlightType?: string;
  /** Unit type to highlight in the train picker for tutorial guidance. */
  tutorialHighlightUnitType?: string;

  onSelect(type: CommandType): void;
  onEpochAnchorAction(action: 'set' | 'activate'): void;
  onTrainSelect?(unitType: UnitType): void;
  onClose(): void;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const TRAY_HEIGHT = 120; // 64px dead zone + ~48px single-row command tray
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
    unitType, canAttack = false, canGather = false, canBuild = false, canChronoShift = false, canMerge = false,
    canTrain = false, canTimelineFork = false, timelineForkDisabledReason,
    canChronoScout = false, chronoScoutDisabledReason,
    mode = 'command', trainStructureLabel, feedback,
    tutorialHighlightType,
    tutorialHighlightUnitType,
    onSelect, onEpochAnchorAction, onTrainSelect, onClose,
  } = props;

  const isUnitContext = position.kind === 'unit';

  // ── Disabled action tap feedback ──────────────────────────────────────────
  const [disabledFeedback, setDisabledFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showDisabledFeedback = (reason: string) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setDisabledFeedback(reason);
    feedbackTimerRef.current = setTimeout(() => setDisabledFeedback(null), 2000);
  };

  useEffect(() => {
    return () => { if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current); };
  }, []);

  // ── Positioning ─────────────────────────────────────────────────────────────
  const posStyle: React.CSSProperties = isUnitContext
    ? {
        bottom: TRAY_HEIGHT + 8,
        left: PANEL_WIDTH + 8,
        top: undefined,
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
    {
      type: 'phase_surge',
      label: 'Surge',
      cost: `${PHASE_SURGE_COST}TE`,
      enabled: unitType !== 'drone' && playerTE >= PHASE_SURGE_COST,
      disabledReason: unitType === 'drone'
        ? 'Drones cannot surge'
        : playerTE < PHASE_SURGE_COST ? `Need ${PHASE_SURGE_COST} TE`
        : undefined,
    },
    {
      type: 'merge',
      label: 'Merge',
      enabled: canMerge,
      disabledReason: !canMerge ? 'No same-type units in range' : undefined,
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
        zIndex: 200,
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

      {mode === 'command' && entries.map((entry) => {
        const isTutorial = tutorialHighlightType === entry.type;
        return (
          <div
            key={entry.label}
            onClick={() => {
              if (!entry.enabled && entry.disabledReason) {
                showDisabledFeedback(entry.disabledReason);
              }
            }}
          >
          <button
            role="menuitem"
            disabled={!entry.enabled}
            title={entry.disabledReason}
            onClick={() => entry.enabled && (entry.onClick ? entry.onClick() : onSelect(entry.type))}
            className={`flex w-full items-center justify-between px-3 py-2${isTutorial ? ' tutorial-highlight' : ''}`}
            style={{ ...(entry.enabled ? BTN_ENABLED : BTN_DISABLED), position: isTutorial ? 'relative' as const : undefined }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            <span>{entry.label}</span>
            {entry.cost && (
              <span style={{ color: entry.enabled ? '#fbbf24' : '#334155', fontSize: '0.6rem', marginLeft: 16 }}>
                {entry.cost}
              </span>
            )}
            {isTutorial && (
              <span className="tutorial-tooltip" style={{ top: -20, left: 4 }}>
                {entry.type === 'gather' ? 'SELECT GATHER' : entry.type === 'train' ? 'SELECT TRAIN' : entry.type === 'temporal' ? 'USE TEMPORAL ECHO' : entry.type === 'research' ? 'START RESEARCH' : 'SELECT BUILD'}
              </span>
            )}
          </button>
          </div>
        );
      })}

      {mode === 'train' && TRAINABLE_UNIT_TYPES.map((unitType) => {
        const def = UNIT_DEFS[unitType];
        const tierLocked = def.techTierRequired > playerTechTier;
        const needsWarFoundry = def.producedAt === 'war_foundry' && !hasWarFoundry;
        const ccOk = playerCC >= def.costCC;
        const fxOk = playerFX >= def.costFX;
        const isEnabled = !tierLocked && !needsWarFoundry && ccOk && fxOk;
        const costLabel = def.costFX > 0 ? `${def.costCC}CC ${def.costFX}FX` : `${def.costCC}CC`;
        const disabledLabel = tierLocked ? `T${def.techTierRequired}` : needsWarFoundry ? 'War Foundry' : !ccOk ? 'no CC' : !fxOk ? 'no FX' : undefined;
        const isTutorial = tutorialHighlightUnitType === unitType;

        return (
          <button
            key={unitType}
            role="menuitem"
            disabled={!isEnabled}
            onClick={() => isEnabled && onTrainSelect?.(unitType)}
            className={`flex w-full items-center justify-between px-3 py-2${isTutorial ? ' tutorial-highlight' : ''}`}
            style={{ ...(isEnabled ? BTN_ENABLED : BTN_DISABLED), position: isTutorial ? 'relative' as const : undefined }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            <span>{def.label}</span>
            <span style={{ color: isEnabled ? '#fbbf24' : '#334155', fontSize: '0.6rem', marginLeft: 16 }}>
              {disabledLabel ?? costLabel}
            </span>
            {isTutorial && <span className="tutorial-tooltip" style={{ top: -20, left: 4 }}>TRAIN THIS UNIT</span>}
          </button>
        );
      })}

      {(mode === 'train' || feedback || disabledFeedback) && (
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
          {disabledFeedback && (
            <div style={{ color: '#fbbf24', fontSize: '0.65rem' }} data-testid="disabled-feedback">
              {disabledFeedback}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
