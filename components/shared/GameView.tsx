'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameState, createInitialState, findNexus, getOldestSnapshot, AIDifficulty } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
import { Hex, hexKey, hexToPixel } from '@/engine/hex';
import { BASE_HEX_SIZE } from '@/renderer/drawHex';
import {
  Command, GlobalCommand, EpochAnchorCommand,
  TEMPORAL_ECHO_COST, TIMELINE_FORK_COST, CHRONO_SCOUT_COST, CHRONO_SHIFT_COST,
  TrainCommand, UnitCommand,
} from '@/engine/commands';
import { runTimelineForkSimulation, computeChronoScout, TimelineForkResult, ChronoScoutResult } from '@/engine/simulation';
import {
  computeEligibleHexes,
  computeEligibleBuildHexes,
  TargetingCommandType,
  BuildStructureType,
} from '@/engine/targeting';
import { generateAICommands } from '@/engine/ai';
import { isComplete, STRUCTURE_DEFS } from '@/engine/structures';
import { PlayerId } from '@/engine/player';
import { COLORS, GAME_CONSTANTS, MOBILE_BREAKPOINT_PX, SLOT_LAYOUT } from '@/lib/constants';
import { InteractionMode } from '@/lib/types';
import { Unit, UNIT_DEFS } from '@/engine/units';
import { findUnitAt } from '@/engine/state';
import { getPlayerTrainEligibility, getTrainFailureReason } from './trainFlow';
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
import UnitActionPanel from '../hud/UnitActionPanel';
import GameStatsPanel from '../hud/GameStatsPanel';
import ExecutionOverlay from '../hud/ExecutionOverlay';
import Minimap from '../hud/Minimap';

const PLANNING_DURATION = GAME_CONSTANTS.PLANNING_PHASE_DURATION_MS / 1000;
const BASE_BUILD_OPTIONS: BuildStructureType[] = ['crystal_extractor', 'barracks', 'tech_lab', 'watchtower'];
const TIER1_BUILD_OPTIONS: BuildStructureType[] = [...BASE_BUILD_OPTIONS, 'flux_conduit', 'shield_pylon'];
const TIER2_BUILD_OPTIONS: BuildStructureType[] = [...TIER1_BUILD_OPTIONS, 'war_foundry', 'chrono_spire'];

const DIFFICULTY_OPTIONS: { value: AIDifficulty; label: string; desc: string }[] = [
  { value: 'novice',       label: 'Novice',       desc: 'Simple economy AI · No temporal abilities' },
  { value: 'adept',        label: 'Adept',         desc: 'Blended strategy · Adapts mildly' },
  { value: 'commander',    label: 'Commander',     desc: 'Mixed archetypes · Uses Chrono Shift' },
  { value: 'epoch_master', label: 'Epoch Master',  desc: 'Full archetype blend · All abilities' },
];

export default function GameView() {
  const [showSetup, setShowSetup]   = useState(true);
  const [difficulty, setDifficulty] = useState<AIDifficulty>('adept');
  const [gameState, setGameState]   = useState<GameState>(() => createInitialState(42));
  const [mode, setMode]             = useState<InteractionMode>({ kind: 'idle' });
  const [timeLeft, setTimeLeft]     = useState(PLANNING_DURATION);
  const [lockInFlash, setLockInFlash] = useState(false);
  const [animElapsed, setAnimElapsed] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraSnapshot | null>(null);
  const [centerRequest, setCenterRequest] = useState<{ nonce: number; worldX: number; worldY: number } | null>(null);
  const centerNonceRef = useRef(0);

  // ── Timeline Fork + Chrono Scout state ────────────────────────────────────
  const [timelineForkResult, setTimelineForkResult] = useState<TimelineForkResult | null>(null);
  const [chronoScoutResult, setChronoScoutResult]   = useState<ChronoScoutResult | null>(null);
  const timelineForkActiveRef = useRef(false);
  const [timelineForkActive, setTimelineForkActive]  = useState(false);

  // Stable refs so callbacks always see the latest values.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const modeRef = useRef<InteractionMode>(mode);
  modeRef.current = mode;

  const timeLeftRef = useRef(timeLeft);
  timeLeftRef.current = timeLeft;

  useEffect(() => {
    const testMutator = (window as Window & {
      __EPOCH_TEST_MUTATOR__?: (state: GameState) => void;
    }).__EPOCH_TEST_MUTATOR__;

    if (!testMutator) return;

    const patchedState = createInitialState(42);
    testMutator(patchedState);
    setGameState({ ...patchedState });
  }, []);

  const lockedIn = gameState.players.player.lockedIn;
  const playerNexusHp = useMemo(() => findNexus(gameState, 'player')?.hp ?? 0, [gameState]);
  const playerTechTier = gameState.players.player.techTier;
  const researchEpochsLeft = gameState.players.player.researchEpochsLeft;

  const hasCompletedTechLab = useMemo(() => {
    for (const s of gameState.structures.values()) {
      if (s.owner === 'player' && s.type === 'tech_lab' && isComplete(s)) return true;
    }
    return false;
  }, [gameState]);

  const hasWarFoundry = useMemo(() => {
    for (const s of gameState.structures.values()) {
      if (s.owner === 'player' && s.type === 'war_foundry' && isComplete(s)) return true;
    }
    return false;
  }, [gameState]);

  const hasChronoSpire = useMemo(() => {
    for (const s of gameState.structures.values()) {
      if (s.owner === 'player' && s.type === 'chrono_spire' && isComplete(s)) return true;
    }
    return false;
  }, [gameState]);

  const canTimelineFork = playerTechTier >= 2 &&
    gameState.players.player.resources.te >= TIMELINE_FORK_COST &&
    !gameState.players.player.timelineForkUsed;

  const timelineForkDisabledReason: string | undefined = gameState.players.player.timelineForkUsed
    ? 'Already used this match'
    : playerTechTier < 2 ? 'Requires Tech Tier 2'
    : gameState.players.player.resources.te < TIMELINE_FORK_COST ? `Need ${TIMELINE_FORK_COST} TE`
    : undefined;

  const canChronoScout = hasChronoSpire && gameState.players.player.resources.te >= CHRONO_SCOUT_COST;

  const canTrain = useMemo(
    () => getPlayerTrainEligibility(gameState).length > 0,
    [gameState],
  );

  const hasEpochAnchor = gameState.players.player.epochAnchor !== null;
  const instabilityTier = gameState.players.player.instabilityTier;
  const instabilityEpochsLeft = gameState.players.player.instabilityEpochsLeft;
  const buildOptions = playerTechTier >= 2 ? TIER2_BUILD_OPTIONS : playerTechTier >= 1 ? TIER1_BUILD_OPTIONS : BASE_BUILD_OPTIONS;

  // ── Execution animation ref ───────────────────────────────────────────────
  const animationRef = useRef<ExecutionAnimation | null>(null);

  // ── finishExecution ───────────────────────────────────────────────────────
  const finishExecutionRef = useRef<() => void>(() => {});

  const finishExecution = useCallback(() => {
    animationRef.current = null;
    setAnimElapsed(0);
    setMode({ kind: 'idle' });
    setTimeLeft(PLANNING_DURATION);
    setTimelineForkResult(null);
    setChronoScoutResult(null);
    timelineForkActiveRef.current = false;
    setTimelineForkActive(false);

    const s = gameStateRef.current;
    if (s.phase !== 'over') {
      s.phase = 'planning';
      setGameState({ ...s });
    }
  }, []);

  finishExecutionRef.current = finishExecution;

  // ── Audio ─────────────────────────────────────────────────────────────────
  const execSoundsRef = useRef({ move: false, attack: false, build: false });

  useEffect(() => {
    const init = () => audioEngine.init();
    window.addEventListener('click', init, { once: true });
    window.addEventListener('touchstart', init, { once: true });
    return () => {
      window.removeEventListener('click', init);
      window.removeEventListener('touchstart', init);
    };
  }, []);

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

  useEffect(() => {
    if (gameState.phase !== 'planning' || lockedIn) return;
    if (timeLeft === 5) audioEngine.playTimerWarning();
    if (timeLeft >= 1 && timeLeft <= 3) audioEngine.playTimerCritical(timeLeft);
  }, [timeLeft, gameState.phase, lockedIn]);

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

  // ── Viewport tracking ─────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const slotDims = isMobile ? SLOT_LAYOUT.MOBILE : SLOT_LAYOUT.DESKTOP;

  // ── Test hooks ────────────────────────────────────────────────────────────
  useEffect(() => {
    type W = Window & {
      __triggerGameOver?: (winner: PlayerId) => void;
      __getEligibleTargets?: (type: string) => Array<{ q: number; r: number }>;
      __getGameSnapshot?: () => unknown;
      __getEventLog?: () => string[];
    };
    const w = window as W;

    w.__triggerGameOver = (winner) => {
      animationRef.current = null;
      setGameState((s) => ({ ...s, phase: 'over', winner }));
    };

    w.__getEligibleTargets = (type) => {
      const s = gameStateRef.current;
      if (type === 'build') {
        return [...computeEligibleBuildHexes(s)].map(key => {
          const h = s.map.cells.get(key)!.hex;
          return { q: h.q, r: h.r };
        });
      }
      if (['move', 'attack', 'gather'].includes(type)) {
        return [...computeEligibleHexes(s, type as TargetingCommandType)].map(key => {
          const h = s.map.cells.get(key)!.hex;
          return { q: h.q, r: h.r };
        });
      }
      return [];
    };

    w.__getGameSnapshot = () => {
      const s = gameStateRef.current;
      const playerUnits = [...s.units.values()].filter(u => u.owner === 'player');
      const aiUnits     = [...s.units.values()].filter(u => u.owner === 'ai');
      const playerStructs = [...s.structures.values()].filter(st => st.owner === 'player');
      const aiStructs     = [...s.structures.values()].filter(st => st.owner === 'ai');
      return {
        phase: s.phase,
        epoch: s.epoch,
        winner: s.winner,
        player: {
          resources: { ...s.players.player.resources },
          techTier: s.players.player.techTier,
          researchLeft: s.players.player.researchEpochsLeft,
          instabilityTier: s.players.player.instabilityTier,
          instabilityLeft: s.players.player.instabilityEpochsLeft,
          hasAnchor: s.players.player.epochAnchor !== null,
          forkUsed: s.players.player.timelineForkUsed,
          units: playerUnits.map(u => ({ type: u.type, hp: u.hp, hex: u.hex })),
          structures: playerStructs.map(st => ({
            type: st.type, hp: st.hp, buildProgress: st.buildProgress,
          })),
        },
        ai: {
          resources: { ...s.players.ai.resources },
          techTier: s.players.ai.techTier,
          researchLeft: s.players.ai.researchEpochsLeft,
          instabilityTier: s.players.ai.instabilityTier,
          units: aiUnits.map(u => ({ type: u.type, hp: u.hp, hex: u.hex })),
          structures: aiStructs.map(st => ({
            type: st.type, hp: st.hp, buildProgress: st.buildProgress,
          })),
        },
        playerStart: { q: s.map.playerStart.q, r: s.map.playerStart.r },
        aiStart: { q: s.map.aiStart.q, r: s.map.aiStart.r },
        // Keep legacy field for smoke test helper
        playerStructureTypes: playerStructs.map(st => st.type),
      };
    };

    w.__getEventLog = () => gameStateRef.current.eventLog;
  }, []);

  // ── handleResolve ─────────────────────────────────────────────────────────
  const handleResolveRef = useRef<() => void>(() => {});

  const handleResolve = useCallback(() => {
    const state = gameStateRef.current;
    if (state.phase !== 'planning') return;

    generateAICommands(state);

    const unitSnaps = new Map<string, UnitSnapshot>();
    for (const [id, u] of state.units) {
      unitSnaps.set(id, { hex: { ...u.hex }, hp: u.hp, owner: u.owner, type: u.type });
    }
    const structSnaps = new Map<string, StructSnapshot>();
    for (const [id, s] of state.structures) {
      structSnaps.set(id, { hex: { ...s.hex }, hp: s.hp, owner: s.owner, type: s.type });
    }

    resolveEpoch(state);

    const anim = buildAnimationTimeline(unitSnaps, structSnaps, state);
    animationRef.current = anim;

    execSoundsRef.current = { move: false, attack: false, build: false };
    audioEngine.playEpochTransition();

    setMode({ kind: 'idle' });
    setGameState({ ...state });
  }, []);

  handleResolveRef.current = handleResolve;

  // ── Animation tick ────────────────────────────────────────────────────────
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
  }, [gameState.phase]);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (lockedIn || gameState.phase !== 'planning' || showSetup) return;

    const id = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [lockedIn, gameState.phase, showSetup]);

  useEffect(() => {
    if (timeLeft === 0 && gameState.phase === 'planning' && !lockedIn && !showSetup) {
      handleResolveRef.current();
    }
  }, [timeLeft, gameState.phase, lockedIn, showSetup]);

  // ── Play Again / Start ────────────────────────────────────────────────────
  const handlePlayAgain = useCallback(() => {
    setGameState(createInitialState(42));
    setShowSetup(true);
    setMode({ kind: 'idle' });
    setTimeLeft(PLANNING_DURATION);
  }, []);

  const handleStartGame = useCallback((diff: AIDifficulty) => {
    setDifficulty(diff);
    setGameState(createInitialState(Date.now(), diff));
    setMode({ kind: 'idle' });
    setTimeLeft(PLANNING_DURATION);
    setShowSetup(false);
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

    // If a Timeline Fork is queued in global commands and preview not yet shown, run it.
    const hasFork = state.players.player.globalCommands.some((c) => c?.type === 'timeline_fork');
    if (hasFork && !timelineForkActiveRef.current) {
      state.players.player.timelineForkUsed = true;
      const result = runTimelineForkSimulation(state);
      setTimelineForkResult(result);
      setGameState({ ...state });
      timelineForkActiveRef.current = true;
      setTimelineForkActive(true);
      audioEngine.playTemporalEcho();
      return;
    }

    timelineForkActiveRef.current = false;
    setTimelineForkActive(false);

    const earlyBonus = timeLeftRef.current > 0;
    state.players.player.lockedIn = true;
    setGameState({ ...state });
    setLockInFlash(true);
    setTimeout(() => setLockInFlash(false), 500);
    audioEngine.playLockIn(earlyBonus);
    setTimeout(() => handleResolveRef.current(), 800);
  }, []);

  // ── Skip execution ────────────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    finishExecutionRef.current();
  }, []);

  // ── Unit order helpers ────────────────────────────────────────────────────
  const commitUnitOrder = useCallback((unitId: string, cmd: UnitCommand) => {
    const state = gameStateRef.current;
    state.players.player.unitOrders.set(unitId, cmd);
    setGameState({ ...state });
    setMode({ kind: 'idle' });
    audioEngine.playFillSlot(0);
  }, []);

  const handleUnitOrderClear = useCallback((unitId: string) => {
    const state = gameStateRef.current;
    if (state.players.player.lockedIn) return;
    state.players.player.unitOrders.delete(unitId);
    // If clearing a chrono_scout unit, clear the scout result
    // (chrono_scout is global, but handle defensively)
    setGameState({ ...state });
    setMode({ kind: 'idle' });
    audioEngine.playClearSlot();
  }, []);

  const handleUnitCardClick = useCallback((unitId: string) => {
    const state = gameStateRef.current;
    if (state.players.player.lockedIn) return;
    setMode({ kind: 'unit_picker_open', unitId });
  }, []);

  // ── Global slot helpers ───────────────────────────────────────────────────
  const handleGlobalSlotClick = useCallback((i: number) => {
    const state = gameStateRef.current;
    if (state.players.player.lockedIn) return;
    setMode({ kind: 'global_picker_open', slotIndex: i });
  }, []);

  const handleGlobalSlotClear = useCallback((i: number) => {
    const state = gameStateRef.current;
    if (state.players.player.lockedIn) return;
    const cmd = state.players.player.globalCommands[i];
    if (cmd?.type === 'chrono_scout') setChronoScoutResult(null);
    if (cmd?.type === 'timeline_fork') {
      timelineForkActiveRef.current = false;
      setTimelineForkActive(false);
      setTimelineForkResult(null);
    }
    const newGlobal = [...state.players.player.globalCommands];
    newGlobal[i] = null;
    state.players.player.globalCommands = newGlobal;
    setGameState({ ...state });
    setMode({ kind: 'idle' });
    audioEngine.playClearSlot();
  }, []);

  const commitGlobalCommand = useCallback((slotIndex: number, cmd: GlobalCommand) => {
    const state = gameStateRef.current;
    const newGlobal = [...state.players.player.globalCommands];
    newGlobal[slotIndex] = cmd;
    state.players.player.globalCommands = newGlobal;
    setGameState({ ...state });
    setMode({ kind: 'idle' });
    audioEngine.playFillSlot(slotIndex);
  }, []);

  // ── Command picker selection ──────────────────────────────────────────────
  const handleCommandPick = useCallback((type: Command['type']) => {
    const m     = modeRef.current;
    const state = gameStateRef.current;

    // ── Unit context ─────────────────────────────────────────────────────────
    if (m.kind === 'unit_picker_open') {
      const { unitId } = m;
      const unit = state.units.get(unitId);
      if (!unit) { setMode({ kind: 'idle' }); return; }

      if (type === 'defend') {
        commitUnitOrder(unitId, { type: 'defend', unitId });
        return;
      }

      if (type === 'chrono_shift') {
        commitUnitOrder(unitId, { type: 'chrono_shift', unitId });
        return;
      }

      if (type === 'build') {
        setMode({ kind: 'build_select', unitId });
        return;
      }

      if (type === 'move' || type === 'attack' || type === 'gather') {
        const cmdType = type as TargetingCommandType;
        const eligibleKeys = computeEligibleHexes(state, cmdType);
        setMode({ kind: 'targeting', unitId, commandType: cmdType, eligibleKeys });
        return;
      }

      setMode({ kind: 'idle' });
      return;
    }

    // ── Global context ───────────────────────────────────────────────────────
    if (m.kind === 'global_picker_open') {
      const { slotIndex } = m;

      if (type === 'temporal') {
        commitGlobalCommand(slotIndex, { type: 'temporal', ability: 'echo', teCost: TEMPORAL_ECHO_COST });
        return;
      }

      if (type === 'timeline_fork') {
        commitGlobalCommand(slotIndex, { type: 'timeline_fork' });
        return;
      }

      if (type === 'chrono_scout') {
        const result = computeChronoScout(state);
        setChronoScoutResult(result);
        commitGlobalCommand(slotIndex, { type: 'chrono_scout' });
        return;
      }

      if (type === 'research') {
        commitGlobalCommand(slotIndex, { type: 'research' });
        return;
      }

      if (type === 'train') {
        const eligible = getPlayerTrainEligibility(state);
        if (eligible.length === 0) {
          setMode({
            kind: 'train_picker',
            slotIndex,
            structureId: '',
            structureHex: { q: 0, r: 0 },
            failureFeedback: 'Train requires a completed Barracks or War Foundry.',
          });
          return;
        }

        const withSpawn = eligible.find((e) => e.hasSpawnSpace && e.structureType === 'barracks')
          ?? eligible.find((e) => e.hasSpawnSpace)
          ?? eligible[0];
        const selectedStructure = state.structures.get(withSpawn.structureId);
        if (!selectedStructure) { setMode({ kind: 'idle' }); return; }

        const minTrainCost = UNIT_DEFS.drone.costCC;
        const lowResourceFeedback = state.players.player.resources.cc < minTrainCost
          ? 'Not enough CC to train any unit.'
          : null;

        setMode({
          kind: 'train_picker',
          slotIndex,
          structureId: selectedStructure.id,
          structureHex: selectedStructure.hex,
          failureFeedback: withSpawn.hasSpawnSpace
            ? lowResourceFeedback
            : `Train failed: ${withSpawn.structureType === 'war_foundry' ? 'war foundry' : 'barracks'} spawn is blocked.`,
        });
        return;
      }

      setMode({ kind: 'idle' });
      return;
    }
  }, [commitUnitOrder, commitGlobalCommand]);

  const handleEpochAnchorAction = useCallback((action: 'set' | 'activate') => {
    const m = modeRef.current;
    if (m.kind !== 'global_picker_open') return;
    const { slotIndex } = m;
    const cmd: EpochAnchorCommand = { type: 'epoch_anchor', action };
    commitGlobalCommand(slotIndex, cmd);
  }, [commitGlobalCommand]);

  const handleBuildStructureSelect = useCallback((structureType: BuildStructureType) => {
    const m = modeRef.current;
    if (m.kind !== 'build_select') return;

    const eligibleKeys = computeEligibleBuildHexes(gameStateRef.current);
    setMode({
      kind: 'build_targeting',
      unitId: m.unitId,
      structureType,
      eligibleKeys,
    });
  }, []);

  const handleTrainPick = useCallback((unitType: import('@/engine/units').UnitType) => {
    const m = modeRef.current;
    if (m.kind !== 'train_picker') return;

    const state = gameStateRef.current;
    const failureFeedback = getTrainFailureReason(state, unitType);
    if (failureFeedback) {
      setMode({ ...m, failureFeedback });
      return;
    }

    const unitDef = UNIT_DEFS[unitType];
    const eligible = getPlayerTrainEligibility(state);
    const matchingBuilding = eligible.find((e) => e.structureType === unitDef.producedAt && e.hasSpawnSpace)
      ?? eligible.find((e) => e.structureType === unitDef.producedAt);
    const structureId = matchingBuilding?.structureId ?? m.structureId;

    const newCmd: TrainCommand = { type: 'train', structureId, unitType };
    commitGlobalCommand(m.slotIndex, newCmd);
  }, [commitGlobalCommand]);

  // ── Hex click from canvas ─────────────────────────────────────────────────
  const handleHexClick = useCallback((hex: Hex) => {
    const m = modeRef.current;
    const state = gameStateRef.current;

    // ── Targeting: commit the chosen hex ──────────────────────────────────
    if (m.kind === 'targeting') {
      const key = hexKey(hex);
      if (!m.eligibleKeys.has(key)) { setMode({ kind: 'idle' }); return; }

      const { unitId, commandType } = m;
      let newCmd: UnitCommand;

      if (commandType === 'move') {
        newCmd = { type: 'move', unitId, targetHex: hex };
      } else if (commandType === 'attack') {
        newCmd = { type: 'attack', unitId, targetHex: hex };
      } else if (commandType === 'chrono_shift') {
        const snap = getOldestSnapshot(state);
        let shiftTarget: Unit | undefined;
        for (const u of state.units.values()) {
          if (u.owner === 'player' && hexKey(u.hex) === key && snap?.has(u.id)) {
            shiftTarget = u; break;
          }
        }
        if (!shiftTarget) { setMode({ kind: 'idle' }); return; }
        newCmd = { type: 'chrono_shift', unitId: shiftTarget.id };
      } else {
        newCmd = { type: 'gather', unitId, targetHex: hex };
      }

      commitUnitOrder(unitId, newCmd);
      return;
    }

    // ── Build targeting: place the structure ──────────────────────────────
    if (m.kind === 'build_targeting') {
      const key = hexKey(hex);
      if (!m.eligibleKeys.has(key)) { setMode({ kind: 'idle' }); return; }
      commitUnitOrder(m.unitId, { type: 'build', unitId: m.unitId, structureType: m.structureType, targetHex: hex });
      return;
    }

    // ── Idle: clicking a player unit opens its picker ─────────────────────
    if (m.kind === 'idle' && state.phase === 'planning' && !lockedIn) {
      const unit = findUnitAt(state, hex, 'player');
      if (unit) {
        setMode({ kind: 'unit_picker_open', unitId: unit.id });
      }
    }
  }, [commitUnitOrder, lockedIn]);

  // ── Escape key closes picker ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (animationRef.current !== null) {
          e.preventDefault();
          finishExecutionRef.current();
        } else {
          setMode({ kind: 'idle' });
        }
      } else if (e.key === ' ' && animationRef.current !== null) {
        e.preventDefault();
        finishExecutionRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const isExecuting = animationRef.current !== null;

  // Echo overlay: show previous AI commands when player has Echo queued.
  const hasEcho = gameState.players.player.globalCommands.some((c) => c?.type === 'temporal');
  const echoCommands = hasEcho ? gameState.prevEpochCommands.ai : null;

  // ── Unit picker props (derived from current mode) ─────────────────────────
  const activeUnitId =
    mode.kind === 'unit_picker_open' ? mode.unitId :
    mode.kind === 'targeting' || mode.kind === 'build_select' || mode.kind === 'build_targeting' ? mode.unitId :
    null;

  const unitForPicker = activeUnitId ? gameState.units.get(activeUnitId) : null;
  const unitPickerProps = unitForPicker ? (() => {
    const def = UNIT_DEFS[unitForPicker.type];
    const canAttack = def.range > 0;
    const canGather = unitForPicker.type === 'drone' && (() => {
      for (const s of gameState.structures.values()) {
        if (s.owner === 'player' && isComplete(s) && (s.type === 'crystal_extractor' || s.type === 'flux_conduit')) return true;
      }
      return false;
    })();
    const canBuild = unitForPicker.type === 'drone' && gameState.players.player.resources.cc >= 3;
    const unitHasChrono = !!(getOldestSnapshot(gameState)?.has(unitForPicker.id));
    const canChronoShift = playerTechTier >= 1 && gameState.players.player.resources.te >= CHRONO_SHIFT_COST && unitHasChrono;
    return { canAttack, canGather, canBuild, canChronoShift, unitType: unitForPicker.type };
  })() : null;

  // Position for unit picker: to the right of the panel, aligned to the card.
  // We use a fixed top offset; the panel scrolls the card into view.
  const unitPickerTop = 8;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {gameState.phase !== 'over' && (
        <PlanningBar
          epoch={gameState.epoch}
          resources={gameState.players.player.resources}
          timeLeft={timeLeft}
          lockedIn={lockedIn}
          techTier={playerTechTier}
          researchEpochsLeft={researchEpochsLeft}
          instabilityTier={instabilityTier}
          instabilityEpochsLeft={instabilityEpochsLeft}
          hasEpochAnchor={hasEpochAnchor}
        />
      )}

      {/* Canvas area fills remaining space */}
      <div className="relative min-h-0 flex-1">
        <GameCanvas
          gameState={gameState}
          mode={mode}
          animation={animationRef.current}
          echoCommands={echoCommands}
          timelineForkResult={timelineForkResult}
          chronoScoutResult={chronoScoutResult}
          onHexClick={handleHexClick}
          onCameraChange={setCameraSnapshot}
          centerRequest={centerRequest}
        />

        {/* Unit action panel — left sidebar */}
        {gameState.phase === 'planning' && !isExecuting && (
          <UnitActionPanel
            gameState={gameState}
            mode={mode}
            lockedIn={lockedIn}
            onUnitClick={handleUnitCardClick}
            onOrderClear={handleUnitOrderClear}
          />
        )}

        {/* Stats panel — right sidebar, desktop only (too wide for mobile viewports) */}
        {!isMobile && <GameStatsPanel gameState={gameState} />}

        <Minimap
          gameState={gameState}
          cameraSnapshot={cameraSnapshot}
          isMobile={isMobile}
          onRecenter={queueRecenter}
          onSnapHome={handleSnapHome}
        />

        {/* Unit command picker */}
        {mode.kind === 'unit_picker_open' && !isExecuting && unitForPicker && unitPickerProps && (
          <CommandPicker
            position={{ kind: 'unit', top: unitPickerTop }}
            playerTE={gameState.players.player.resources.te}
            playerCC={gameState.players.player.resources.cc}
            playerFX={gameState.players.player.resources.fx}
            playerTechTier={playerTechTier}
            researchEpochsLeft={researchEpochsLeft}
            hasCompletedTechLab={hasCompletedTechLab}
            hasWarFoundry={hasWarFoundry}
            hasChronoSpire={hasChronoSpire}
            hasEpochAnchor={hasEpochAnchor}
            unitType={unitPickerProps.unitType}
            canAttack={unitPickerProps.canAttack}
            canGather={unitPickerProps.canGather}
            canBuild={unitPickerProps.canBuild}
            canChronoShift={unitPickerProps.canChronoShift}
            onSelect={handleCommandPick}
            onEpochAnchorAction={handleEpochAnchorAction}
            onClose={() => setMode({ kind: 'idle' })}
          />
        )}

        {/* Global command picker */}
        {mode.kind === 'global_picker_open' && !isExecuting && (
          <CommandPicker
            position={{
              kind: 'global',
              slotIndex: mode.slotIndex,
              left: Math.min(mode.slotIndex * (slotDims.width + slotDims.gap) + 16, window.innerWidth - 168),
            }}
            playerTE={gameState.players.player.resources.te}
            playerCC={gameState.players.player.resources.cc}
            playerFX={gameState.players.player.resources.fx}
            playerTechTier={playerTechTier}
            researchEpochsLeft={researchEpochsLeft}
            hasCompletedTechLab={hasCompletedTechLab}
            hasWarFoundry={hasWarFoundry}
            hasChronoSpire={hasChronoSpire}
            hasEpochAnchor={hasEpochAnchor}
            canTrain={canTrain}
            canTimelineFork={canTimelineFork}
            timelineForkDisabledReason={timelineForkDisabledReason}
            canChronoScout={canChronoScout}
            onSelect={handleCommandPick}
            onEpochAnchorAction={handleEpochAnchorAction}
            onClose={() => setMode({ kind: 'idle' })}
          />
        )}

        {/* Train picker (sub-mode of global) */}
        {mode.kind === 'train_picker' && !isExecuting && (
          <CommandPicker
            position={{
              kind: 'global',
              slotIndex: mode.slotIndex,
              left: Math.min(mode.slotIndex * (slotDims.width + slotDims.gap) + 16, window.innerWidth - 168),
            }}
            playerTE={gameState.players.player.resources.te}
            playerCC={gameState.players.player.resources.cc}
            playerFX={gameState.players.player.resources.fx}
            playerTechTier={playerTechTier}
            researchEpochsLeft={researchEpochsLeft}
            hasCompletedTechLab={hasCompletedTechLab}
            hasWarFoundry={hasWarFoundry}
            hasChronoSpire={hasChronoSpire}
            hasEpochAnchor={hasEpochAnchor}
            mode="train"
            trainStructureLabel={
              mode.structureId
                ? (() => {
                    const s = gameState.structures.get(mode.structureId);
                    const label = s?.type === 'war_foundry' ? 'War Foundry' : 'Barracks';
                    return `${label} (${mode.structureHex.q},${mode.structureHex.r})`;
                  })()
                : undefined
            }
            feedback={mode.failureFeedback}
            onSelect={handleCommandPick}
            onEpochAnchorAction={handleEpochAnchorAction}
            onTrainSelect={handleTrainPick}
            onClose={() => setMode({ kind: 'idle' })}
          />
        )}

        {/* Build structure chooser */}
        {mode.kind === 'build_select' && !isExecuting && (
          <div
            role="dialog"
            aria-label="Build structure picker"
            className="absolute font-mono text-xs"
            style={{
              top: unitPickerTop,
              left: 188,
              zIndex: 100,
              background: '#0d1321',
              border: '1px solid #334155',
              borderRadius: 6,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              minWidth: 180,
              overflow: 'hidden',
            }}
          >
            <div className="px-3 py-1.5" style={{ color: '#475569', borderBottom: '1px solid #1e293b', fontSize: '0.65rem', letterSpacing: '0.1em' }}>
              CHOOSE STRUCTURE
            </div>
            {buildOptions.map((opt) => {
              const sDef = STRUCTURE_DEFS[opt];
              const ccOk = gameState.players.player.resources.cc >= sDef.costCC;
              const fxOk = sDef.costFX === 0 || gameState.players.player.resources.fx >= sDef.costFX;
              const isEnabled = ccOk && fxOk;
              const costLabel = sDef.costFX > 0 ? `${sDef.costCC}CC ${sDef.costFX}FX` : `${sDef.costCC}CC`;
              const disabledLabel = !ccOk ? 'no CC' : !fxOk ? 'no FX' : undefined;
              return (
                <button
                  key={opt}
                  type="button"
                  data-testid={`build-option-${opt}`}
                  disabled={!isEnabled}
                  title={disabledLabel}
                  onClick={() => isEnabled && handleBuildStructureSelect(opt)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: isEnabled ? '#e2e8f0' : '#334155',
                    cursor: isEnabled ? 'pointer' : 'not-allowed',
                  }}
                >
                  <span>{sDef.label}</span>
                  <span style={{ color: isEnabled ? '#fbbf24' : '#334155', fontSize: '0.6rem', marginLeft: 16 }}>
                    {disabledLabel ?? costLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Execution overlay */}
        {isExecuting && animationRef.current && (
          <ExecutionOverlay
            animation={animationRef.current}
            elapsed={animElapsed}
            onSkip={handleSkip}
          />
        )}

        {/* Difficulty picker overlay */}
        {showSetup && (
          <div
            data-testid="difficulty-picker"
            className="absolute inset-0 flex flex-col items-center justify-center gap-6"
            style={{ background: 'rgba(10,14,26,0.92)', zIndex: 50 }}
          >
            <div className="font-mono text-xl font-bold tracking-widest uppercase" style={{ color: COLORS.CYAN }}>
              SELECT DIFFICULTY
            </div>
            <div className="flex flex-col gap-3 w-72">
              {DIFFICULTY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  data-testid={`difficulty-${opt.value}`}
                  className="text-left px-4 py-3 border font-mono transition-colors"
                  style={{
                    color: difficulty === opt.value ? COLORS.CYAN : '#94a3b8',
                    borderColor: difficulty === opt.value ? COLORS.CYAN : '#334155',
                    background: difficulty === opt.value ? 'rgba(0,229,255,0.06)' : 'transparent',
                  }}
                  onClick={() => setDifficulty(opt.value)}
                >
                  <div className="text-sm font-bold tracking-wider">{opt.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>{opt.desc}</div>
                </button>
              ))}
            </div>
            <button
              data-testid="start-game-btn"
              className="mt-2 font-mono text-sm tracking-widest uppercase px-8 py-2 border"
              style={{ color: COLORS.CYAN, borderColor: COLORS.CYAN, background: 'rgba(0,229,255,0.08)' }}
              onClick={() => handleStartGame(difficulty)}
            >
              BEGIN
            </button>
          </div>
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

      {/* Global command tray — shown only during planning */}
      {gameState.phase === 'planning' && !isExecuting && (
        <CommandTray
          globalCommands={gameState.players.player.globalCommands}
          selectedGlobalSlot={
            mode.kind === 'global_picker_open' || mode.kind === 'train_picker'
              ? mode.slotIndex
              : null
          }
          lockedIn={lockedIn}
          lockInFlash={lockInFlash}
          isMobile={isMobile}
          forkMode={timelineForkActive}
          onSlotClick={handleGlobalSlotClick}
          onSlotClear={handleGlobalSlotClear}
          onLockIn={handleLockIn}
        />
      )}
    </div>
  );
}
