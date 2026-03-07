'use client';

import { GameState } from '@/engine/state';
import { UNIT_DEFS, UnitType } from '@/engine/units';
import { STRUCTURE_DEFS, StructureType } from '@/engine/structures';
import { PlayerId } from '@/engine/player';

interface GameStatsPanelProps {
  gameState: GameState;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const C = {
  cyan:    '#00d4ff',
  red:     '#ff6b4a',
  gold:    '#fbbf24',
  dim:     '#475569',
  dimmer:  '#334155',
  muted:   '#64748b',
  text:    '#94a3b8',
  bright:  '#e2e8f0',
  green:   '#22c55e',
  orange:  '#f97316',
  purple:  '#a78bfa',
  bg:      'rgba(10,14,26,0.92)',
  border:  '#1e293b',
};

const UNIT_SHORT: Record<UnitType, string> = {
  drone:           'DRN',
  pulse_sentry:    'SNT',
  arc_ranger:      'RNG',
  phase_walker:    'PWK',
  temporal_warden: 'TWD',
  void_striker:    'VST',
  flux_weaver:     'FWV',
  chrono_titan:    'CTN',
};

const STRUCT_SHORT: Record<StructureType, string> = {
  command_nexus:    'NEX',
  crystal_extractor:'EXT',
  barracks:         'BRK',
  tech_lab:         'LAB',
  watchtower:       'WTC',
  flux_conduit:     'FLX',
  war_foundry:      'WRF',
  shield_pylon:     'SHP',
  chrono_spire:     'CSP',
};

const ORDER_BADGE: Record<string, string> = {
  move: 'MV', attack: 'AT', gather: 'GR', defend: 'DF', build: 'BD', chrono_shift: 'SH',
};

function HpBar({ hp, max, color }: { hp: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(1, hp / max));
  const barColor = pct > 0.6 ? C.green : pct > 0.3 ? C.gold : C.red;
  return (
    <div style={{ height: 3, background: C.dimmer, borderRadius: 2, flex: 1, overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: color ?? barColor, borderRadius: 2 }} />
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      color: C.dim, fontSize: '0.6rem', letterSpacing: '0.12em',
      borderBottom: `1px solid ${C.border}`, paddingBottom: 3, marginBottom: 4,
    }}>
      {label}
    </div>
  );
}

function ResourceRow({ cc, fx, te }: { cc: number; fx: number; te: number }) {
  return (
    <div className="flex gap-2" style={{ fontSize: '0.65rem', marginBottom: 4 }}>
      <span><span style={{ color: C.muted }}>CC </span><span style={{ color: C.bright }}>{cc}</span></span>
      <span><span style={{ color: C.muted }}>FX </span><span style={{ color: C.purple }}>{fx}</span></span>
      <span><span style={{ color: C.muted }}>TE </span><span style={{ color: C.gold }}>{te}</span></span>
    </div>
  );
}

function TechRow({ tier, researchLeft }: { tier: number; researchLeft: number }) {
  return (
    <div className="flex items-center gap-2" style={{ fontSize: '0.65rem', marginBottom: 4 }}>
      <span style={{ color: C.cyan }}>T{tier}</span>
      {[0, 1, 2, 3].map(t => (
        <div key={t} style={{
          width: 14, height: 6, borderRadius: 2,
          background: t < tier ? C.cyan : t === tier && researchLeft > 0 ? 'rgba(0,212,255,0.3)' : C.dimmer,
          border: `1px solid ${t <= tier ? C.cyan : C.dimmer}`,
        }} />
      ))}
      {researchLeft > 0 && (
        <span style={{ color: C.muted, fontSize: '0.6rem' }}>{researchLeft}ep</span>
      )}
    </div>
  );
}

// ── Player section ─────────────────────────────────────────────────────────────

function PlayerSection({ gameState, owner }: { gameState: GameState; owner: PlayerId }) {
  const p = gameState.players[owner];
  const isPlayer = owner === 'player';
  const color = isPlayer ? C.cyan : C.red;
  const label = isPlayer ? '── PLAYER ──' : '── AI ──';

  const units = [...gameState.units.values()].filter(u => u.owner === owner);
  const structs = [...gameState.structures.values()].filter(s => s.owner === owner);

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color, fontSize: '0.6rem', letterSpacing: '0.1em', marginBottom: 6, fontWeight: 700 }}>
        {label}
      </div>

      {/* Resources */}
      <ResourceRow cc={p.resources.cc} fx={p.resources.fx} te={p.resources.te} />

      {/* Tech + research */}
      <TechRow tier={p.techTier} researchLeft={p.researchEpochsLeft} />

      {/* Instability + anchor */}
      {(p.instabilityTier > 0 || p.epochAnchor) && (
        <div className="flex gap-2" style={{ fontSize: '0.6rem', marginBottom: 4 }}>
          {p.instabilityTier > 0 && (
            <span style={{ color: C.orange }}>
              ⚡T{p.instabilityTier} {p.instabilityEpochsLeft}ep
            </span>
          )}
          {p.epochAnchor && (
            <span style={{ color: C.gold }}>⚓{p.epochAnchor.epochsLeft}ep</span>
          )}
          {p.timelineForkUsed && (
            <span style={{ color: C.muted }}>FK✓</span>
          )}
        </div>
      )}

      {/* Global commands */}
      {p.globalCommands.some(c => c !== null) && (
        <div style={{ fontSize: '0.6rem', color: C.muted, marginBottom: 4 }}>
          {p.globalCommands.map((cmd, i) => cmd
            ? <span key={i} style={{ marginRight: 4, color: C.gold }}>{cmd.type.slice(0, 4).toUpperCase()}</span>
            : null
          )}
        </div>
      )}

      {/* Units */}
      {units.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          {units.map(u => {
            const def = UNIT_DEFS[u.type];
            const order = isPlayer ? p.unitOrders.get(u.id) : undefined;
            const hpPct = u.hp / def.maxHp;
            const hpColor = hpPct > 0.6 ? C.green : hpPct > 0.3 ? C.gold : C.red;
            return (
              <div key={u.id} className="flex items-center gap-1" style={{ marginBottom: 2 }}>
                <span style={{ color, fontSize: '0.6rem', minWidth: 24 }}>{UNIT_SHORT[u.type]}</span>
                <HpBar hp={u.hp} max={def.maxHp} color={hpColor} />
                <span style={{ color: C.dimmer, fontSize: '0.55rem', minWidth: 22 }}>
                  {u.hp}/{def.maxHp}
                </span>
                {order && (
                  <span style={{ color: C.cyan, fontSize: '0.55rem', minWidth: 16 }}>
                    {ORDER_BADGE[order.type] ?? '??'}
                  </span>
                )}
                {u.damageShield && <span style={{ color: C.purple, fontSize: '0.55rem' }}>SH</span>}
                {u.isDefending  && !order && <span style={{ color: C.muted,  fontSize: '0.55rem' }}>DF</span>}
              </div>
            );
          })}
        </div>
      )}
      {units.length === 0 && (
        <div style={{ color: C.dimmer, fontSize: '0.6rem', marginBottom: 4 }}>no units</div>
      )}

      {/* Structures */}
      {structs.map(s => {
        const def = STRUCTURE_DEFS[s.type];
        const hpPct = s.hp / def.maxHp;
        const hpColor = hpPct > 0.6 ? C.green : hpPct > 0.3 ? C.gold : C.red;
        const isBuilding = s.buildProgress > 0;
        return (
          <div key={s.id} className="flex items-center gap-1" style={{ marginBottom: 2 }}>
            <span style={{ color: isBuilding ? C.muted : color, fontSize: '0.6rem', minWidth: 24 }}>
              {STRUCT_SHORT[s.type]}
            </span>
            <HpBar hp={s.hp} max={def.maxHp} color={hpColor} />
            <span style={{ color: C.dimmer, fontSize: '0.55rem', minWidth: 22 }}>
              {s.hp}/{def.maxHp}
            </span>
            {isBuilding && (
              <span style={{ color: C.muted, fontSize: '0.55rem' }}>🔨{s.buildProgress}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GameStatsPanel({ gameState }: GameStatsPanelProps) {
  const { epoch, phase, eventLog, aiConfig } = gameState;

  const phaseColor = phase === 'planning' ? C.cyan : phase === 'execution' ? C.gold : C.dim;
  const diffLabel = aiConfig.difficulty.toUpperCase().replace('_', ' ');

  // Crystal node counts
  const totalNodes = [...gameState.map.cells.values()].filter(c => c.terrain === 'crystal_node').length;
  const playerNodes = [...gameState.structures.values()].filter(
    s => s.owner === 'player' && s.type === 'crystal_extractor' && s.buildProgress === 0,
  ).length;
  const aiNodes = [...gameState.structures.values()].filter(
    s => s.owner === 'ai' && s.type === 'crystal_extractor' && s.buildProgress === 0,
  ).length;

  return (
    <div
      className="absolute right-0 top-0 bottom-0 overflow-y-auto font-mono"
      style={{
        width: 200,
        zIndex: 30,
        padding: '8px 8px',
        background: 'linear-gradient(to left, rgba(10,14,26,0.92) 0%, rgba(10,14,26,0.72) 80%, transparent 100%)',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* ── Header ── */}
      <div style={{ marginBottom: 8 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 2 }}>
          <span style={{ color: C.bright, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em' }}>
            EPOCH {epoch}
          </span>
          <span style={{ color: phaseColor, fontSize: '0.6rem', letterSpacing: '0.1em' }}>
            {phase.toUpperCase()}
          </span>
        </div>
        <div style={{ color: C.muted, fontSize: '0.6rem', marginBottom: 0 }}>{diffLabel}</div>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 8 }} />

      {/* ── Player + AI ── */}
      <PlayerSection gameState={gameState} owner="player" />
      <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 8 }} />
      <PlayerSection gameState={gameState} owner="ai" />

      {/* ── Map control ── */}
      <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 8 }} />
      <div style={{ marginBottom: 8 }}>
        <SectionHeader label="MAP" />
        <div style={{ fontSize: '0.65rem' }}>
          <div className="flex justify-between" style={{ marginBottom: 2 }}>
            <span style={{ color: C.muted }}>Crystal Nodes</span>
            <span style={{ color: C.text }}>{totalNodes}</span>
          </div>
          <div className="flex justify-between" style={{ marginBottom: 2 }}>
            <span style={{ color: C.cyan }}>Player nodes</span>
            <span style={{ color: C.cyan }}>{playerNodes}</span>
          </div>
          <div className="flex justify-between" style={{ marginBottom: 2 }}>
            <span style={{ color: C.red }}>AI nodes</span>
            <span style={{ color: C.red }}>{aiNodes}</span>
          </div>
        </div>
      </div>

      {/* ── Event log ── */}
      {eventLog.length > 0 && (
        <>
          <div style={{ borderTop: `1px solid ${C.border}`, marginBottom: 8 }} />
          <div>
            <SectionHeader label="LAST EPOCH" />
            {[...eventLog].reverse().slice(0, 12).map((line, i) => {
              const isPlayer = line.startsWith('player');
              const isAI     = line.startsWith('ai');
              const color    = isPlayer ? C.cyan : isAI ? C.red : C.muted;
              return (
                <div key={i} style={{ color, fontSize: '0.58rem', lineHeight: 1.4, marginBottom: 1 }}>
                  › {line}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
