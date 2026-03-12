'use client';

import { useRef, useEffect } from 'react';
import { GameState } from '@/engine/state';
import { Unit, effectiveMaxHp } from '@/engine/units';
import { UnitCommand } from '@/engine/commands';
import { InteractionMode } from '@/lib/types';

interface UnitActionPanelProps {
  gameState: GameState;
  mode: InteractionMode;
  lockedIn: boolean;
  /** Unit ID to highlight for tutorial guidance. */
  tutorialHighlightUnitId?: string | null;
  onUnitClick(unitId: string): void;
  onOrderClear(unitId: string): void;
}

const UNIT_LABEL: Record<string, string> = {
  drone:           'Drone',
  pulse_sentry:    'Sentry',
  arc_ranger:      'Ranger',
  phase_walker:    'Walker',
  temporal_warden: 'Warden',
  void_striker:    'Striker',
  flux_weaver:     'Weaver',
  chrono_titan:    'Titan',
};

const ORDER_BADGE: Record<string, string> = {
  move:         'MV',
  attack:       'AT',
  gather:       'GR',
  defend:       'DF',
  build:        'BD',
  chrono_shift: 'SH',
  phase_surge:  'SG',
  merge:        'MG',
};

function orderLabel(cmd: UnitCommand): string {
  switch (cmd.type) {
    case 'move':
    case 'attack':
    case 'gather':
    case 'phase_surge':
      return `(${cmd.targetHex.q},${cmd.targetHex.r})`;
    case 'build':
      return cmd.structureType.slice(0, 3).toUpperCase();
    case 'defend':
      return 'DEF';
    case 'chrono_shift':
      return 'SHIFT';
    case 'merge':
      return `×${cmd.targetUnitIds.length}`;
  }
}

/** Sort player units: drones first, then by unit ID for stable ordering. */
function sortUnits(units: Unit[], defaultIds: Set<string>): Unit[] {
  return [...units].sort((a, b) => {
    // Default-order units sink to the bottom.
    const aDef = defaultIds.has(a.id) ? 1 : 0;
    const bDef = defaultIds.has(b.id) ? 1 : 0;
    if (aDef !== bDef) return aDef - bDef;
    if (a.type === 'drone' && b.type !== 'drone') return -1;
    if (a.type !== 'drone' && b.type === 'drone') return 1;
    return a.id < b.id ? -1 : 1;
  });
}

/** Derive which unitId is currently "active" (picker open / targeting in progress). */
function getActiveUnitId(mode: InteractionMode): string | null {
  if (
    mode.kind === 'unit_picker_open' ||
    mode.kind === 'targeting' ||
    mode.kind === 'build_select' ||
    mode.kind === 'build_targeting' ||
    mode.kind === 'gather_picker' ||
    mode.kind === 'merge_picker'
  ) {
    return mode.unitId;
  }
  return null;
}

export default function UnitActionPanel({
  gameState,
  mode,
  lockedIn,
  tutorialHighlightUnitId,
  onUnitClick,
  onOrderClear,
}: UnitActionPanelProps) {
  const defaultIds = gameState.players.player.defaultOrderUnitIds;
  const playerUnits = sortUnits(
    [...gameState.units.values()].filter((u) => u.owner === 'player'),
    defaultIds,
  );
  const unitOrders = gameState.players.player.unitOrders;
  const activeUnitId = getActiveUnitId(mode);
  const firstDefaultIdx = playerUnits.findIndex((u) => defaultIds.has(u.id));

  // Scroll active card into view when it changes.
  const panelRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!activeUnitId) return;
    const el = cardRefs.current.get(activeUnitId);
    if (el && panelRef.current) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeUnitId]);

  if (playerUnits.length === 0) return null;

  return (
    <div
      ref={panelRef}
      className="absolute left-0 top-0 bottom-0 overflow-y-auto font-mono"
      style={{
        width: 180,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 6px',
        background: 'transparent',
        pointerEvents: 'auto',
      }}
    >
      {playerUnits.map((unit, idx) => {
        const order = unitOrders.get(unit.id);
        const isDefault = defaultIds.has(unit.id);
        const isActive = activeUnitId === unit.id;
        const isTutorialTarget = tutorialHighlightUnitId === unit.id;
        const effMaxHp = effectiveMaxHp(unit);
        const hpPct = Math.max(0, Math.min(1, unit.hp / effMaxHp));
        const hpColor = hpPct > 0.6 ? '#22c55e' : hpPct > 0.3 ? '#fbbf24' : '#ef4444';
        const mergeBadge = unit.mergeCount > 0
          ? <span style={{ color: '#fbbf24', fontSize: '0.55rem', marginLeft: 2 }}>{unit.mergeCount + 1}x</span>
          : null;

        return (
          <div key={unit.id}>
            {/* Separator before default-task section */}
            {idx === firstDefaultIdx && (
              <div
                data-testid="default-task-separator"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 0',
                  marginBottom: 4,
                }}
              >
                <div style={{ flex: 1, height: 1, background: '#334155' }} />
                <span style={{ color: '#475569', fontSize: '0.55rem', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
                  DEFAULT TASKS
                </span>
                <div style={{ flex: 1, height: 1, background: '#334155' }} />
              </div>
            )}
            <div
              data-testid={order ? (isDefault ? 'unit-card-default' : undefined) : 'unit-card-unassigned'}
              className={isTutorialTarget ? 'tutorial-highlight' : undefined}
              ref={(el) => {
                if (el) cardRefs.current.set(unit.id, el);
                else cardRefs.current.delete(unit.id);
              }}
              onClick={() => !lockedIn && onUnitClick(unit.id)}
              style={{
                borderRadius: 5,
                border: isActive
                  ? '1.5px solid #00d4ff'
                  : order
                    ? isDefault ? '1px solid #1e3a3a' : '1px solid #1e3a4a'
                    : '1px solid #334155',
                background: isActive
                  ? 'rgba(0,212,255,0.08)'
                  : order
                    ? isDefault ? 'rgba(12,20,32,0.6)' : 'rgba(15,25,40,0.7)'
                    : 'rgba(20,32,50,0.85)',
                boxShadow: isActive ? '0 0 8px rgba(0,212,255,0.25)' : undefined,
                cursor: lockedIn ? 'not-allowed' : 'pointer',
                opacity: lockedIn ? 0.5 : isDefault ? 0.7 : 1,
                transition: 'border-color 0.15s ease, background 0.15s ease',
                animation: !order && !isActive && !lockedIn && !isTutorialTarget ? 'pulse-border 2.5s ease-in-out infinite' : undefined,
                overflow: 'hidden',
                flexShrink: 0,
                position: isTutorialTarget ? 'relative' as const : undefined,
              }}
            >
              {isTutorialTarget && (
                <span className="tutorial-tooltip" style={{ top: -22, left: 4 }}>
                  TAP THIS DRONE
                </span>
              )}
              {order ? (
                // ── Compact assigned card ──────────────────────────────────────
                <div
                  className="flex items-center justify-between px-2"
                  style={{ height: 32, gap: 4 }}
                >
                  <span style={{ color: isDefault ? '#64748b' : '#94a3b8', fontSize: '0.65rem', minWidth: 44, fontWeight: 600 }}>
                    {UNIT_LABEL[unit.type] ?? unit.type}
                    {mergeBadge}
                  </span>
                  <span style={{ color: isDefault ? '#0891b2' : '#00d4ff', fontSize: '0.65rem', fontWeight: 700 }}>
                    {ORDER_BADGE[order.type]}
                  </span>
                  <span style={{ color: '#475569', fontSize: '0.6rem', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {orderLabel(order)}
                  </span>
                  {!lockedIn && (
                    <span
                      role="button"
                      aria-label={`Clear order for ${UNIT_LABEL[unit.type]}`}
                      onClick={(e) => { e.stopPropagation(); onOrderClear(unit.id); }}
                      style={{
                        color: '#475569',
                        fontSize: '0.75rem',
                        lineHeight: 1,
                        cursor: 'pointer',
                        padding: '0 2px',
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </span>
                  )}
                </div>
              ) : (
                // ── Full unassigned card ───────────────────────────────────────
                <div className="px-2 py-1.5" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="flex items-center justify-between">
                    <span style={{ color: isActive ? '#00d4ff' : '#cbd5e1', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                      {UNIT_LABEL[unit.type] ?? unit.type}
                      {mergeBadge}
                    </span>
                    <span style={{ color: '#475569', fontSize: '0.6rem' }}>
                      {unit.hp}/{effMaxHp}
                    </span>
                  </div>
                  {/* HP bar */}
                  <div style={{ height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${hpPct * 100}%`, height: '100%', background: hpColor, borderRadius: 2, transition: 'width 0.3s ease' }} />
                  </div>
                  <div style={{ color: '#334155', fontSize: '0.6rem', letterSpacing: '0.08em' }}>
                    {isActive ? 'CHOOSE ACTION…' : 'TAP TO ASSIGN'}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
