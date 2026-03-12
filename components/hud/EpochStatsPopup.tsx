'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface EpochSideStats {
  unitCount: number;
  droneCount: number;
  totalAttack: number;
  nexusHp: number;
  nexusMaxHp: number;
  crystals: number;
  flux: number;
  techTier: number;
}

export interface EpochStatsSnapshot {
  epoch: number;
  player: EpochSideStats;
  ai: EpochSideStats;
  /** Deltas vs previous epoch (post - pre). */
  playerDelta: {
    units: number;
    drones: number;
    crystals: number;
    flux: number;
  };
}

interface EpochStatsPopupProps {
  stats: EpochStatsSnapshot;
  onDismiss: () => void;
}

/* ── tiny helpers ─────────────────────────────────────────────────────────── */

function formatDelta(value: number, label: string): string {
  if (value > 0) return `+${value} ${label}`;
  if (value < 0) return `${value} ${label}`;
  return '';
}

function HealthBar({ current, max, color }: { current: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div
        style={{
          flex: 1,
          height: 14,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: 4,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums" style={{ color, minWidth: 48, textAlign: 'right' }}>
        {current}/{max}
      </span>
    </div>
  );
}

function AttackBar({ value, maxValue, color, label }: { value: number; maxValue: number; color: string; label: string }) {
  const pct = maxValue > 0 ? Math.min(100, Math.round((value / maxValue) * 100)) : 0;
  return (
    <div className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
      <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: '#94a3b8' }}>
        {label}
      </span>
      <div
        style={{
          width: 40,
          height: 80,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 4,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'flex-end',
        }}
      >
        <div
          style={{
            width: '100%',
            height: `${pct}%`,
            background: color,
            borderRadius: '0 0 4px 4px',
            transition: 'height 0.6s ease',
          }}
        />
      </div>
      <span className="text-sm font-bold font-mono tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

/* ── main component ───────────────────────────────────────────────────────── */

export default function EpochStatsPopup({ stats, onDismiss }: EpochStatsPopupProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, 3000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dismiss]);

  const { player, ai, playerDelta } = stats;

  const deltas = [
    formatDelta(playerDelta.units, 'Units'),
    formatDelta(playerDelta.drones, 'Drones'),
    formatDelta(playerDelta.crystals, 'CC'),
    formatDelta(playerDelta.flux, 'FX'),
  ].filter(Boolean);

  const maxAttack = Math.max(player.totalAttack, ai.totalAttack, 1);

  return (
    <div
      data-testid="epoch-stats-popup"
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(2,6,18,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        animation: 'epoch-popup-in 0.25s ease-out',
      }}
    >
      <div
        className="font-mono"
        style={{
          width: '100%',
          maxWidth: 480,
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center">
          <div
            className="text-lg font-bold tracking-[0.3em] uppercase"
            style={{ color: '#00d4ff', textShadow: '0 0 12px rgba(0,212,255,0.5)' }}
          >
            EPOCH {stats.epoch} COMPLETE
          </div>
          <div className="text-[10px] mt-1" style={{ color: '#475569' }}>
            tap anywhere to dismiss
          </div>
        </div>

        {/* Player changes summary */}
        {deltas.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3">
            {deltas.map((d) => (
              <span
                key={d}
                className="text-xs px-2 py-1 rounded"
                style={{
                  background: 'rgba(0,212,255,0.08)',
                  color: d.startsWith('-') ? '#f87171' : '#34d399',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {d}
              </span>
            ))}
          </div>
        )}

        {/* Resources row */}
        <div className="flex justify-between text-xs" style={{ color: '#94a3b8' }}>
          <div className="flex gap-4">
            <span><span style={{ color: '#7dd3fc' }}>CC</span> <span className="font-bold" style={{ color: '#e2e8f0' }}>{player.crystals}</span></span>
            <span><span style={{ color: '#a78bfa' }}>FX</span> <span className="font-bold" style={{ color: '#e2e8f0' }}>{player.flux}</span></span>
            <span><span style={{ color: '#34d399' }}>T{player.techTier}</span></span>
          </div>
          <div className="flex gap-2 items-center">
            <span style={{ color: '#64748b' }}>{player.unitCount} units</span>
          </div>
        </div>

        {/* Base health comparison */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="text-[10px] uppercase tracking-widest" style={{ color: '#64748b' }}>
            Base Health
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] w-10" style={{ color: '#22c55e' }}>YOU</span>
            <div style={{ flex: 1 }}>
              <HealthBar current={player.nexusHp} max={player.nexusMaxHp} color="#22c55e" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] w-10" style={{ color: '#ef4444' }}>CPU</span>
            <div style={{ flex: 1 }}>
              <HealthBar current={ai.nexusHp} max={ai.nexusMaxHp} color="#ef4444" />
            </div>
          </div>
        </div>

        {/* Attack power comparison — vertical bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <div className="text-[10px] uppercase tracking-widest" style={{ color: '#64748b' }}>
            Total Attack Power
          </div>
          <div style={{ display: 'flex', gap: 32, justifyContent: 'center' }}>
            <AttackBar value={player.totalAttack} maxValue={maxAttack} color="#22c55e" label="YOU" />
            <AttackBar value={ai.totalAttack} maxValue={maxAttack} color="#ef4444" label="CPU" />
          </div>
        </div>

        {/* Auto-close progress */}
        <div
          style={{
            height: 2,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              background: '#00d4ff',
              animation: 'epoch-popup-timer 3s linear forwards',
            }}
          />
        </div>
      </div>

      {/* Keyframe styles */}
      <style>{`
        @keyframes epoch-popup-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes epoch-popup-timer {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
