'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameState, createInitialState } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
import { Hex, hexKey } from '@/engine/hex';
import { Command } from '@/engine/commands';
import { getFirstEligibleUnit, computeEligibleHexes, TargetingCommandType } from '@/engine/targeting';
import { generateAICommands } from '@/engine/ai';
import { InteractionMode } from '@/lib/types';
import {
  ExecutionAnimation, UnitSnapshot, StructSnapshot,
  buildAnimationTimeline, TOTAL_DURATION,
} from '@/renderer/animation';
import GameCanvas from './GameCanvas';
import PlanningBar from '../hud/PlanningBar';
import CommandTray from '../hud/CommandTray';
import CommandPicker from '../hud/CommandPicker';
import ExecutionOverlay from '../hud/ExecutionOverlay';

const PLANNING_DURATION = 30;

export default function GameView() {
  const [gameState, setGameState]   = useState<GameState>(() => createInitialState(42));
  const [mode, setMode]             = useState<InteractionMode>({ kind: 'idle' });
  const [timeLeft, setTimeLeft]     = useState(PLANNING_DURATION);
  const [lockInFlash, setLockInFlash] = useState(false);
  const [animElapsed, setAnimElapsed] = useState(0);

  // Stable refs so callbacks always see the latest values.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const modeRef = useRef<InteractionMode>(mode);
  modeRef.current = mode;

  const lockedIn = gameState.players.player.lockedIn;

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

  // ── Lock-in ───────────────────────────────────────────────────────────────
  const handleLockIn = useCallback(() => {
    const state = gameStateRef.current;
    if (state.players.player.lockedIn) return;
    state.players.player.lockedIn = true;
    setGameState({ ...state });
    setLockInFlash(true);
    setTimeout(() => setLockInFlash(false), 500);
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
  }, []);

  // ── Command picker selection ──────────────────────────────────────────────
  const handleCommandPick = useCallback((type: Command['type']) => {
    const m     = modeRef.current;
    if (m.kind !== 'picker_open') return;
    const { slotIndex } = m;
    const state = gameStateRef.current;

    if (type === 'defend') {
      const unit = getFirstEligibleUnit(state, 'defend');
      if (!unit) { setMode({ kind: 'idle' }); return; }
      const newCmd: Command = { type: 'defend', unitId: unit.id };
      const newCommands = [...state.players.player.commands];
      newCommands[slotIndex] = newCmd;
      state.players.player.commands = newCommands;
      setGameState({ ...state });
      setMode({ kind: 'idle' });
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

  const playerUnits = Array.from(gameState.units.values()).filter(
    (u) => u.owner === 'player',
  );

  const isExecuting = animationRef.current !== null;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <PlanningBar
        epoch={gameState.epoch}
        resources={gameState.players.player.resources}
        timeLeft={timeLeft}
        lockedIn={lockedIn}
      />

      {/* Canvas area fills remaining space */}
      <div className="relative min-h-0 flex-1">
        <GameCanvas
          gameState={gameState}
          mode={mode}
          animation={animationRef.current}
          onHexClick={handleHexClick}
        />

        {/* Command picker floats above the tray */}
        {mode.kind === 'picker_open' && !isExecuting && (
          <CommandPicker
            slotIndex={mode.slotIndex}
            playerUnits={playerUnits}
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
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: 'rgba(10,14,26,0.85)' }}
          >
            <div
              className="font-mono text-2xl font-bold tracking-widest uppercase"
              style={{ color: gameState.winner === 'player' ? '#00d4ff' : '#ff6b6b' }}
            >
              {gameState.winner === 'player' ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div className="mt-2 text-sm" style={{ color: '#475569' }}>
              Epoch {gameState.epoch}
            </div>
          </div>
        )}
      </div>

      {/* Hide tray during execution */}
      {!isExecuting && (
        <CommandTray
          commands={gameState.players.player.commands}
          selectedSlot={
            mode.kind === 'slot_selected' || mode.kind === 'picker_open'
              ? mode.slotIndex
              : null
          }
          lockedIn={lockedIn}
          lockInFlash={lockInFlash}
          onSlotClick={handleSlotClick}
          onSlotClear={handleSlotClear}
          onLockIn={handleLockIn}
        />
      )}
    </div>
  );
}
