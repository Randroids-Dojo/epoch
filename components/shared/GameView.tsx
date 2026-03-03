'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameState, createInitialState, findNexus } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
import { Hex, hexKey, hexToPixel } from '@/engine/hex';
import { BASE_HEX_SIZE } from '@/renderer/drawHex';
import { Command, TEMPORAL_ECHO_COST } from '@/engine/commands';
import { getFirstEligibleUnit, computeEligibleHexes, TargetingCommandType } from '@/engine/targeting';
import { generateAICommands } from '@/engine/ai';
import { PlayerId } from '@/engine/player';
import { COLORS, GAME_CONSTANTS, MOBILE_BREAKPOINT_PX, SLOT_LAYOUT } from '@/lib/constants';
import { InteractionMode } from '@/lib/types';
import {
  ExecutionAnimation, UnitSnapshot, StructSnapshot,
  buildAnimationTimeline, TOTAL_DURATION,
  PHASE_MOVE, PHASE_ATTACK, PHASE_BUILD,
  categorizeLogEntry,
} from '@/renderer/animation';
import { audioEngine } from '@/audio/engine';
import GameCanvas from './GameCanvas';
import { CameraSnapshot } from './GameCanvas';
import PlanningBar from '../hud/PlanningBar';
import CommandTray from '../hud/CommandTray';
import CommandPicker from '../hud/CommandPicker';
import ExecutionOverlay from '../hud/ExecutionOverlay';
import Minimap from '../hud/Minimap';

const PLANNING_DURATION = GAME_CONSTANTS.PLANNING_PHASE_DURATION_MS / 1000;

export default function GameView() {
  const [gameState, setGameState]   = useState<GameState>(() => createInitialState(42));
  const [mode, setMode]             = useState<InteractionMode>({ kind: 'idle' });
  const [timeLeft, setTimeLeft]     = useState(PLANNING_DURATION);
  const [lockInFlash, setLockInFlash] = useState(false);
  const [animElapsed, setAnimElapsed] = useState(0);
  const [isMobile, setIsMobile] = useState(false); // default desktop; corrected after mount
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraSnapshot | null>(null);
  const [centerRequest, setCenterRequest] = useState<{ nonce: number; worldX: number; worldY: number } | null>(null);
  const centerNonceRef = useRef(0);

  // Stable refs so callbacks always see the latest values.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const modeRef = useRef<InteractionMode>(mode);
  modeRef.current = mode;

  const timeLeftRef = useRef(timeLeft);
  timeLeftRef.current = timeLeft;

  const lockedIn = gameState.players.player.lockedIn;
  const playerNexusHp = useMemo(() => findNexus(gameState, 'player')?.hp ?? 0, [gameState]);

  // ── Execution animation ref ───────────────────────────────────────────────
  const animationRef = useRef<ExecutionAnimation | null>(null);

  // ── finishExecution (stable ref for use in effects) ───────────────────────
  const finishExecutionRef = useRef<() => void>(() => {});

  const finishExecution = useCallback(() => {
    animationRef.current = null;
    setAnimElapsed(0);
    setMode({ kind: 'idle' });
    setTimeLeft(PLANNING_DURATION);

    const s = gameStateRef.current;
    if (s.phase !== 'over') {
      s.phase = 'planning';
      setGameState({ ...s });
    }
  }, []);

  finishExecutionRef.current = finishExecution;

  // ── Audio ─────────────────────────────────────────────────────────────────
  // Track which execution-phase sounds have fired for the current animation.
  const execSoundsRef = useRef({ move: false, attack: false, build: false });

  // Init AudioContext on first user interaction (browser policy requirement).
  useEffect(() => {
    const init = () => audioEngine.init();
    window.addEventListener('click', init, { once: true });
    window.addEventListener('touchstart', init, { once: true });
    return () => {
      window.removeEventListener('click', init);
      window.removeEventListener('touchstart', init);
    };
  }, []);

  // Update ambient drone based on game state.
  useEffect(() => {
    if (gameState.phase === 'execution') {
      audioEngine.setAmbient('execution');
    } else if (playerNexusHp > 0 && playerNexusHp < 50) {
      audioEngine.setAmbient('late');
    } else if (timeLeft <= 10 && !lockedIn && gameState.phase === 'planning') {
      audioEngine.setAmbient('tense');
    } else {
      audioEngine.setAmbient('planning');
    }
  }, [gameState.phase, playerNexusHp, timeLeft, lockedIn]);

  // Timer warning and critical sounds.
  useEffect(() => {
    if (gameState.phase !== 'planning' || lockedIn) return;
    if (timeLeft === 5) audioEngine.playTimerWarning();
    if (timeLeft >= 1 && timeLeft <= 3) audioEngine.playTimerCritical(timeLeft);
  }, [timeLeft, gameState.phase, lockedIn]);

  // Execution-phase sounds — fire once per animation phase.
  useEffect(() => {
    const anim = animationRef.current;
    if (!anim) return;
    const sounds = execSoundsRef.current;

    if (animElapsed >= PHASE_MOVE.start && !sounds.move) {
      sounds.move = true;
      let moves = 0;
      for (const u of anim.units.values()) {
        if (u.fromPixel.x !== u.toPixel.x || u.fromPixel.y !== u.toPixel.y) moves++;
      }
      for (let i = 0; i < Math.min(moves, 3); i++) {
        setTimeout(() => audioEngine.playMoveTick(), i * 180);
      }
    }

    if (animElapsed >= PHASE_ATTACK.start && !sounds.attack) {
      sounds.attack = true;
      const hasAttack = anim.eventLog.some((e) => categorizeLogEntry(e) === 'attack');
      let hasDamage = false;
      for (const u of anim.units.values()) {
        if (u.newHp < u.oldHp) { hasDamage = true; break; }
      }
      const hasDestroy = anim.destroyedUnits.length > 0;
      if (hasAttack) audioEngine.playMeleeAttack();
      if (hasDamage) setTimeout(() => audioEngine.playDamageTaken(), 100);
      if (hasDestroy) setTimeout(() => audioEngine.playUnitDestroyed(), 200);
    }

    if (animElapsed >= PHASE_BUILD.start && !sounds.build) {
      sounds.build = true;
      let hasBuilt = false;
      for (const s of anim.structures.values()) {
        if (s.wasBuilt) { hasBuilt = true; break; }
      }
      const hasGather = anim.eventLog.some((e) => e.includes('yields'));
      if (hasBuilt) audioEngine.playStructureCompleted();
      if (hasGather) setTimeout(() => audioEngine.playResourceGathered(), 80);
    }
  }, [animElapsed]);

  // ── Viewport tracking for responsive layout ───────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX);
    check(); // sync after hydration
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const slotDims = isMobile ? SLOT_LAYOUT.MOBILE : SLOT_LAYOUT.DESKTOP;

  // ── Dev-only test hook ────────────────────────────────────────────────────
  useEffect(() => {
    (window as Window & { __triggerGameOver?: (winner: PlayerId) => void }).__triggerGameOver =
      (winner: PlayerId) => {
        animationRef.current = null;
        setGameState((s) => ({ ...s, phase: 'over', winner }));
      };
  }, []);

  // ── handleResolve ─────────────────────────────────────────────────────────
  const handleResolveRef = useRef<() => void>(() => {});

  const handleResolve = useCallback(() => {
    const state = gameStateRef.current;
    if (state.phase !== 'planning') return;

    // Generate AI commands before resolution.
    generateAICommands(state);

    // Snapshot unit and structure state before resolution.
    const unitSnaps = new Map<string, UnitSnapshot>();
    for (const [id, u] of state.units) {
      unitSnaps.set(id, { hex: { ...u.hex }, hp: u.hp, owner: u.owner });
    }
    const structSnaps = new Map<string, StructSnapshot>();
    for (const [id, s] of state.structures) {
      structSnaps.set(id, { hex: { ...s.hex }, hp: s.hp, owner: s.owner });
    }

    // Run resolution instantly.
    resolveEpoch(state);

    // Build animation timeline from diff.
    const anim = buildAnimationTimeline(unitSnaps, structSnaps, state);
    animationRef.current = anim;

    // Reset per-animation sound flags and fire transition sound.
    execSoundsRef.current = { move: false, attack: false, build: false };
    audioEngine.playEpochTransition();

    setMode({ kind: 'idle' });
    setGameState({ ...state });
  }, []);

  handleResolveRef.current = handleResolve;

  // ── Animation tick — drives overlay updates and completion ────────────────
  useEffect(() => {
    if (!animationRef.current) return;

    let rafId: number;
    const tick = () => {
      const anim = animationRef.current;
      if (!anim) return;

      const elapsed = (performance.now() - anim.startedAt) / 1000;
      setAnimElapsed(elapsed);

      if (elapsed >= TOTAL_DURATION) {
        finishExecutionRef.current();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [gameState.phase]); // re-run when phase changes to execution

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (lockedIn || gameState.phase !== 'planning') return;

    const id = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [lockedIn, gameState.phase]);

  // Trigger resolution when the timer reaches zero.
  useEffect(() => {
    if (timeLeft === 0 && gameState.phase === 'planning' && !lockedIn) {
      handleResolveRef.current();
    }
  }, [timeLeft, gameState.phase, lockedIn]);

  // ── Play Again ────────────────────────────────────────────────────────────
  const handlePlayAgain = useCallback(() => {
    setGameState(createInitialState(Date.now()));
    setMode({ kind: 'idle' });
    setTimeLeft(PLANNING_DURATION);
  }, []);

  const queueRecenter = useCallback((worldX: number, worldY: number) => {
    centerNonceRef.current += 1;
    setCenterRequest({ nonce: centerNonceRef.current, worldX, worldY });
  }, []);

  const handleSnapHome = useCallback(() => {
    const home = gameStateRef.current.map.playerStart;
    const wp = hexToPixel(home, BASE_HEX_SIZE);
    queueRecenter(wp.x, wp.y);
  }, [queueRecenter]);

  // ── Lock-in ───────────────────────────────────────────────────────────────
  const handleLockIn = useCallback(() => {
    const state = gameStateRef.current;
    if (state.players.player.lockedIn) return;
    const earlyBonus = timeLeftRef.current > 0;
    state.players.player.lockedIn = true;
    setGameState({ ...state });
    setLockInFlash(true);
    setTimeout(() => setLockInFlash(false), 500);
    audioEngine.playLockIn(earlyBonus);
    // Brief delay so the LOCKED state renders before resolution.
    setTimeout(() => handleResolveRef.current(), 800);
  }, []);

  // ── Skip execution ──────────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    finishExecutionRef.current();
  }, []);

  // ── Slot interaction ──────────────────────────────────────────────────────
  const handleSlotClick = useCallback((i: number) => {
    const m     = modeRef.current;
    const state = gameStateRef.current;
    const cmd   = state.players.player.commands[i];

    if (m.kind === 'slot_selected' && m.slotIndex === i) {
      setMode({ kind: 'picker_open', slotIndex: i });
      return;
    }

    if (cmd !== null) {
      setMode({ kind: 'slot_selected', slotIndex: i });
    } else {
      setMode({ kind: 'picker_open', slotIndex: i });
    }
  }, []);

  const handleSlotClear = useCallback((i: number) => {
    const state = gameStateRef.current;
    const newCommands = [...state.players.player.commands];
    newCommands[i] = null;
    state.players.player.commands = newCommands;
    setGameState({ ...state });
    setMode({ kind: 'idle' });
    audioEngine.playClearSlot();
  }, []);

  // ── Command picker selection ──────────────────────────────────────────────
  const handleCommandPick = useCallback((type: Command['type']) => {
    const m     = modeRef.current;
    if (m.kind !== 'picker_open') return;
    const { slotIndex } = m;
    const state = gameStateRef.current;

    if (type === 'temporal') {
      const newCmd: Command = { type: 'temporal', ability: 'echo', teCost: TEMPORAL_ECHO_COST };
      const newCommands = [...state.players.player.commands];
      newCommands[slotIndex] = newCmd;
      state.players.player.commands = newCommands;
      setGameState({ ...state });
      setMode({ kind: 'idle' });
      audioEngine.playTemporalEcho();
      return;
    }

    if (type === 'defend') {
      const unit = getFirstEligibleUnit(state, 'defend');
      if (!unit) { setMode({ kind: 'idle' }); return; }
      const newCmd: Command = { type: 'defend', unitId: unit.id };
      const newCommands = [...state.players.player.commands];
      newCommands[slotIndex] = newCmd;
      state.players.player.commands = newCommands;
      setGameState({ ...state });
      setMode({ kind: 'idle' });
      audioEngine.playFillSlot(slotIndex);
      return;
    }

    if (type === 'move' || type === 'attack' || type === 'gather') {
      const cmdType = type as TargetingCommandType;
      const unit    = getFirstEligibleUnit(state, cmdType);
      if (!unit) { setMode({ kind: 'idle' }); return; }
      const eligibleKeys = computeEligibleHexes(state, cmdType);
      setMode({
        kind: 'targeting',
        slotIndex,
        commandType: cmdType,
        eligibleKeys,
        subjectUnitId: unit.id,
      });
      return;
    }

    setMode({ kind: 'idle' });
  }, []);

  // ── Hex click from canvas ─────────────────────────────────────────────────
  const handleHexClick = useCallback((hex: Hex) => {
    const m = modeRef.current;
    if (m.kind !== 'targeting') return;

    const key   = hexKey(hex);
    const state = gameStateRef.current;

    if (!m.eligibleKeys.has(key)) {
      setMode({ kind: 'idle' });
      return;
    }

    const { slotIndex, commandType, subjectUnitId } = m;
    let newCmd: Command;

    if (commandType === 'move') {
      newCmd = { type: 'move',   unitId: subjectUnitId, targetHex: hex };
    } else if (commandType === 'attack') {
      newCmd = { type: 'attack', unitId: subjectUnitId, targetHex: hex };
    } else {
      newCmd = { type: 'gather', unitId: subjectUnitId, targetHex: hex };
    }

    const newCommands = [...state.players.player.commands];
    newCommands[slotIndex] = newCmd;
    state.players.player.commands = newCommands;
    setGameState({ ...state });
    setMode({ kind: 'idle' });
    audioEngine.playFillSlot(slotIndex);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const m = modeRef.current;
      const state = gameStateRef.current;

      // During execution: Space or Escape → skip.
      if (animationRef.current !== null) {
        if (e.key === ' ' || e.key === 'Escape') {
          e.preventDefault();
          finishExecutionRef.current();
          return;
        }
        return; // Ignore other keys during execution.
      }

      // Planning phase shortcuts.
      if (state.phase !== 'planning') return;

      // 1–5: select slot.
      if (e.key >= '1' && e.key <= '5') {
        const idx = parseInt(e.key, 10) - 1;
        const cmd = state.players.player.commands[idx];
        if (cmd !== null) {
          setMode({ kind: 'slot_selected', slotIndex: idx });
        } else {
          setMode({ kind: 'picker_open', slotIndex: idx });
        }
        return;
      }

      // Escape: return to idle.
      if (e.key === 'Escape') {
        setMode({ kind: 'idle' });
        return;
      }

      // Delete / Backspace: clear selected slot.
      if ((e.key === 'Delete' || e.key === 'Backspace') && m.kind === 'slot_selected') {
        handleSlotClear(m.slotIndex);
        return;
      }

      // Space: lock in (when idle and in planning).
      if (e.key === ' ' && m.kind === 'idle') {
        e.preventDefault();
        handleLockIn();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSlotClear, handleLockIn]);

  const isExecuting = animationRef.current !== null;

  // Show previous epoch AI commands as echo overlay when player has Echo queued.
  const hasEcho = gameState.players.player.commands.some((c) => c?.type === 'temporal');
  const echoCommands = hasEcho ? gameState.prevEpochCommands.ai : null;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {gameState.phase !== 'over' && (
        <PlanningBar
          epoch={gameState.epoch}
          resources={gameState.players.player.resources}
          timeLeft={timeLeft}
          lockedIn={lockedIn}
        />
      )}

      {/* Canvas area fills remaining space */}
      <div className="relative min-h-0 flex-1">
        <GameCanvas
          gameState={gameState}
          mode={mode}
          animation={animationRef.current}
          echoCommands={echoCommands}
          onHexClick={handleHexClick}
          onCameraChange={setCameraSnapshot}
          centerRequest={centerRequest}
        />

        <Minimap
          gameState={gameState}
          cameraSnapshot={cameraSnapshot}
          isMobile={isMobile}
          onRecenter={queueRecenter}
          onSnapHome={handleSnapHome}
        />

        {/* Command picker floats above the tray */}
        {mode.kind === 'picker_open' && !isExecuting && (
          <CommandPicker
            slotIndex={mode.slotIndex}
            left={Math.min(
              mode.slotIndex * (slotDims.width + slotDims.gap) + 16,
              window.innerWidth - 148,
            )}
            playerTE={gameState.players.player.resources.te}
            onSelect={handleCommandPick}
            onClose={() => setMode({ kind: 'idle' })}
          />
        )}

        {/* Execution overlay */}
        {isExecuting && animationRef.current && (
          <ExecutionOverlay
            animation={animationRef.current}
            elapsed={animElapsed}
            onSkip={handleSkip}
          />
        )}

        {/* Game-over overlay */}
        {gameState.phase === 'over' && (
          <div
            data-testid="game-over-overlay"
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: 'rgba(10,14,26,0.85)' }}
          >
            <div
              data-testid="game-over-result"
              className="font-mono text-2xl font-bold tracking-widest uppercase"
              style={{ color: gameState.winner === 'player' ? COLORS.CYAN : COLORS.CORAL }}
            >
              {gameState.winner === 'player' ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div className="mt-2 text-sm" style={{ color: '#475569' }}>
              Epoch {gameState.epoch}
            </div>
            <button
              data-testid="play-again-btn"
              className="mt-6 font-mono text-sm tracking-widest uppercase px-6 py-2 border"
              style={{ color: '#94a3b8', borderColor: '#334155' }}
              onClick={handlePlayAgain}
            >
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* Show tray only during planning phase */}
      {gameState.phase === 'planning' && !isExecuting && (
        <CommandTray
          commands={gameState.players.player.commands}
          selectedSlot={
            mode.kind === 'slot_selected' || mode.kind === 'picker_open'
              ? mode.slotIndex
              : null
          }
          lockedIn={lockedIn}
          lockInFlash={lockInFlash}
          isMobile={isMobile}
          onSlotClick={handleSlotClick}
          onSlotClear={handleSlotClear}
          onLockIn={handleLockIn}
        />
      )}
    </div>
  );
}
