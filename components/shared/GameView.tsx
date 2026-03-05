'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameState, createInitialState, findNexus, getOldestSnapshot, AIDifficulty } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
import { Hex, hexKey, hexToPixel } from '@/engine/hex';
import { BASE_HEX_SIZE } from '@/renderer/drawHex';
import { Command, EpochAnchorCommand, TEMPORAL_ECHO_COST, TrainCommand } from '@/engine/commands';
import {
  getFirstEligibleUnit,
  computeEligibleHexes,
  computeEligibleBuildHexes,
  TargetingCommandType,
  BuildStructureType,
} from '@/engine/targeting';
import { generateAICommands } from '@/engine/ai';
import { isComplete } from '@/engine/structures';
import { PlayerId } from '@/engine/player';
import { COLORS, GAME_CONSTANTS, MOBILE_BREAKPOINT_PX, SLOT_LAYOUT } from '@/lib/constants';
import { InteractionMode } from '@/lib/types';
import { Unit, UnitType, UNIT_DEFS } from '@/engine/units';
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
import ExecutionOverlay from '../hud/ExecutionOverlay';
import Minimap from '../hud/Minimap';

const PLANNING_DURATION = GAME_CONSTANTS.PLANNING_PHASE_DURATION_MS / 1000;
const BASE_BUILD_OPTIONS: BuildStructureType[] = ['crystal_extractor', 'barracks', 'tech_lab', 'watchtower'];
const TIER1_BUILD_OPTIONS: BuildStructureType[] = [...BASE_BUILD_OPTIONS, 'flux_conduit', 'shield_pylon'];
const TIER2_BUILD_OPTIONS: BuildStructureType[] = [...TIER1_BUILD_OPTIONS, 'war_foundry', 'chrono_spire'];


const DIFFICULTY_OPTIONS: { value: AIDifficulty; label: string; desc: string }[] = [
  { value: 'novice',       label: 'Novice',       desc: '4 command slots · Expander archetype · No temporal abilities' },
  { value: 'adept',        label: 'Adept',         desc: '5 command slots · Expander archetype · Adapts mildly' },
  { value: 'commander',    label: 'Commander',     desc: '5 command slots · Blended archetypes · Uses Chrono Shift' },
  { value: 'epoch_master', label: 'Epoch Master',  desc: '6 command slots · Full archetype blend · All abilities' },
];

export default function GameView() {
  const [showSetup, setShowSetup]   = useState(true);
  const [difficulty, setDifficulty] = useState<AIDifficulty>('adept');
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

  useEffect(() => {
    const testMutator = (window as Window & {
      __EPOCH_TEST_MUTATOR__?: (state: GameState) => void;
    }).__EPOCH_TEST_MUTATOR__;

    if (!testMutator) return;

    const patchedState = createInitialState(42);
    testMutator(patchedState);
    setGameState({ ...patchedState });
    setMode({ kind: 'idle' });
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
  const buildOptions = playerTechTier >= 2 ? TIER2_BUILD_OPTIONS : playerTechTier >= 1 ? TIER1_BUILD_OPTIONS : BASE_BUILD_OPTIONS;
  const canChronoShift = useMemo(
    () => getFirstEligibleUnit(gameState, 'chrono_shift') !== undefined,
    [gameState],
  );
  const canMove = useMemo(
    () => getFirstEligibleUnit(gameState, 'move') !== undefined,
    [gameState],
  );
  const canAttack = useMemo(
    () => getFirstEligibleUnit(gameState, 'attack') !== undefined,
    [gameState],
  );
  const canGather = useMemo(() => {
    if (getFirstEligibleUnit(gameState, 'gather') === undefined) return false;
    for (const s of gameState.structures.values()) {
      if (s.owner === 'player' && isComplete(s) && (s.type === 'crystal_extractor' || s.type === 'flux_conduit')) return true;
    }
    return false;
  }, [gameState]);
  const canDefend = useMemo(
    () => getFirstEligibleUnit(gameState, 'defend') !== undefined,
    [gameState],
  );
  const canBuild = useMemo(() => {
    const cc = gameState.players.player.resources.cc;
    return cc >= 3; // cheapest structures (Crystal Extractor, Watchtower) cost 3 CC
  }, [gameState]);
  const canTrain = useMemo(
    () => getPlayerTrainEligibility(gameState).length > 0,
    [gameState],
  );
  const hasEpochAnchor = gameState.players.player.epochAnchor !== null;
  const instabilityTier = gameState.players.player.instabilityTier;
  const instabilityEpochsLeft = gameState.players.player.instabilityEpochsLeft;

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

  // ── Test hooks used by Playwright specs ────────────────────────────────────
  useEffect(() => {
    type W = Window & {
      __triggerGameOver?: (winner: PlayerId) => void;
      __getEligibleTargets?: (type: string) => Array<{ q: number; r: number }>;
      __getGameSnapshot?: () => {
        phase: string; epoch: number; winner: string | null;
        resources: { cc: number; fx: number; te: number };
        playerStart: { q: number; r: number };
        aiStart: { q: number; r: number };
        playerStructureTypes: string[];
      };
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
      return {
        phase: s.phase,
        epoch: s.epoch,
        winner: s.winner,
        resources: { ...s.players.player.resources },
        playerStart: { q: s.map.playerStart.q, r: s.map.playerStart.r },
        aiStart: { q: s.map.aiStart.q, r: s.map.aiStart.r },
        playerStructureTypes: [...s.structures.values()]
          .filter(st => st.owner === 'player')
          .map(st => st.type),
      };
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
      unitSnaps.set(id, { hex: { ...u.hex }, hp: u.hp, owner: u.owner, type: u.type });
    }
    const structSnaps = new Map<string, StructSnapshot>();
    for (const [id, s] of state.structures) {
      structSnaps.set(id, { hex: { ...s.hex }, hp: s.hp, owner: s.owner, type: s.type });
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
    if (lockedIn || gameState.phase !== 'planning' || showSetup) return;

    const id = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [lockedIn, gameState.phase, showSetup]);

  // Trigger resolution when the timer reaches zero.
  useEffect(() => {
    if (timeLeft === 0 && gameState.phase === 'planning' && !lockedIn && !showSetup) {
      handleResolveRef.current();
    }
  }, [timeLeft, gameState.phase, lockedIn, showSetup]);

  // ── Play Again ────────────────────────────────────────────────────────────
  const handlePlayAgain = useCallback(() => {
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

    const commitCmd = (cmd: Command, audio: () => void) => {
      const newCommands = [...state.players.player.commands];
      newCommands[slotIndex] = cmd;
      state.players.player.commands = newCommands;
      setGameState({ ...state });
      setMode({ kind: 'idle' });
      audio();
    };

    if (type === 'temporal') {
      commitCmd({ type: 'temporal', ability: 'echo', teCost: TEMPORAL_ECHO_COST }, () => audioEngine.playTemporalEcho());
      return;
    }

    if (type === 'research') {
      commitCmd({ type: 'research' }, () => audioEngine.playFillSlot(slotIndex));
      return;
    }

    if (type === 'defend') {
      const unit = getFirstEligibleUnit(state, 'defend');
      if (!unit) { setMode({ kind: 'idle' }); return; }
      commitCmd({ type: 'defend', unitId: unit.id }, () => audioEngine.playFillSlot(slotIndex));
      return;
    }

    if (type === 'build') {
      setMode({ kind: 'build_select', slotIndex });
      return;
    }

    if (type === 'move' || type === 'attack' || type === 'gather' || type === 'chrono_shift') {
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

      // Prefer a structure with spawn space; prefer Barracks for reliability.
      const withSpawn = eligible.find((e) => e.hasSpawnSpace && e.structureType === 'barracks')
        ?? eligible.find((e) => e.hasSpawnSpace)
        ?? eligible[0];
      const selectedStructure = state.structures.get(withSpawn.structureId);
      if (!selectedStructure) {
        setMode({ kind: 'idle' });
        return;
      }

      const minTrainCost = UNIT_DEFS.drone.costCC; // Drone is always the cheapest
      const lowResourceFeedback = state.players.player.resources.cc < minTrainCost
        ? 'Not enough CC to train any unit.'
        : null;

      setMode({
        kind: 'train_picker',
        slotIndex,
        structureId: selectedStructure.id,
        structureHex: selectedStructure.hex,
        failureFeedback: withSpawn.hasSpawnSpace ? lowResourceFeedback : 'Train failed: spawn is blocked.',
      });
      return;
    }

    setMode({ kind: 'idle' });
  }, []);

  const handleEpochAnchorAction = useCallback((action: 'set' | 'activate') => {
    const m = modeRef.current;
    if (m.kind !== 'picker_open') return;
    const { slotIndex } = m;
    const state = gameStateRef.current;
    const cmd: EpochAnchorCommand = { type: 'epoch_anchor', action };
    const newCommands = [...state.players.player.commands];
    newCommands[slotIndex] = cmd;
    state.players.player.commands = newCommands;
    setGameState({ ...state });
    setMode({ kind: 'idle' });
    audioEngine.playFillSlot(slotIndex);
  }, []);

  const handleBuildStructureSelect = useCallback((structureType: BuildStructureType) => {
    const m = modeRef.current;
    if (m.kind !== 'build_select') return;

    const eligibleKeys = computeEligibleBuildHexes(gameStateRef.current);
    setMode({
      kind: 'build_targeting',
      slotIndex: m.slotIndex,
      structureType,
      eligibleKeys,
    });
  }, []);

  const handleTrainPick = useCallback((unitType: UnitType) => {
    const m = modeRef.current;
    if (m.kind !== 'train_picker') return;

    const state = gameStateRef.current;
    const failureFeedback = getTrainFailureReason(state, unitType);
    if (failureFeedback) {
      setMode({ ...m, failureFeedback });
      return;
    }

    // Auto-select the correct production building for this unit type.
    const unitDef = UNIT_DEFS[unitType];
    const eligible = getPlayerTrainEligibility(state);
    const matchingBuilding = eligible.find((e) => e.structureType === unitDef.producedAt && e.hasSpawnSpace)
      ?? eligible.find((e) => e.structureType === unitDef.producedAt);
    const structureId = matchingBuilding?.structureId ?? m.structureId;

    const newCmd: TrainCommand = {
      type: 'train',
      structureId,
      unitType,
    };

    const newCommands = [...state.players.player.commands];
    newCommands[m.slotIndex] = newCmd;
    state.players.player.commands = newCommands;
    setGameState({ ...state });
    setMode({ kind: 'idle' });
    audioEngine.playFillSlot(m.slotIndex);
  }, []);

  // ── Hex click from canvas ─────────────────────────────────────────────────
  const handleHexClick = useCallback((hex: Hex) => {
    const m = modeRef.current;
    if (m.kind !== 'targeting' && m.kind !== 'build_targeting') return;

    const key   = hexKey(hex);
    const state = gameStateRef.current;

    if (!m.eligibleKeys.has(key)) {
      setMode({ kind: 'idle' });
      return;
    }

    const { slotIndex } = m;
    let newCmd: Command;

    if (m.kind === 'targeting') {
      const { commandType, subjectUnitId } = m;
      if (commandType === 'move') {
        newCmd = { type: 'move', unitId: subjectUnitId, targetHex: hex };
      } else if (commandType === 'attack') {
        newCmd = { type: 'attack', unitId: subjectUnitId, targetHex: hex };
      } else if (commandType === 'chrono_shift') {
        // Find the specific player unit at this hex that has a 2-epoch snapshot.
        // findUnitAt would return the wrong unit if two player units share a hex.
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
        newCmd = { type: 'gather', unitId: subjectUnitId, targetHex: hex };
      }
    } else {
      newCmd = { type: 'build', structureType: m.structureType, targetHex: hex };
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
        {(mode.kind === 'picker_open' || mode.kind === 'train_picker') && !isExecuting && (
          <CommandPicker
            slotIndex={mode.slotIndex}
            left={Math.min(
              mode.slotIndex * (slotDims.width + slotDims.gap) + 16,
              window.innerWidth - 168,
            )}
            playerTE={gameState.players.player.resources.te}
            playerCC={gameState.players.player.resources.cc}
            playerFX={gameState.players.player.resources.fx}
            playerTechTier={playerTechTier}
            researchEpochsLeft={researchEpochsLeft}
            hasCompletedTechLab={hasCompletedTechLab}
            canChronoShift={canChronoShift}
            hasWarFoundry={hasWarFoundry}
            hasEpochAnchor={hasEpochAnchor}
            canMove={canMove}
            canAttack={canAttack}
            canGather={canGather}
            canDefend={canDefend}
            canBuild={canBuild}
            canTrain={canTrain}
            mode={mode.kind === 'train_picker' ? 'train' : 'command'}
            trainStructureLabel={
              mode.kind === 'train_picker' && mode.structureId
                ? (() => {
                    const s = gameState.structures.get(mode.structureId);
                    const label = s?.type === 'war_foundry' ? 'War Foundry' : 'Barracks';
                    return `${label} (${mode.structureHex.q},${mode.structureHex.r})`;
                  })()
                : undefined
            }
            feedback={mode.kind === 'train_picker' ? mode.failureFeedback : null}
            onSelect={handleCommandPick}
            onEpochAnchorAction={handleEpochAnchorAction}
            onTrainSelect={handleTrainPick}
            onClose={() => setMode({ kind: 'idle' })}
          />
        )}


        {mode.kind === 'build_select' && !isExecuting && (
          <div
            role="dialog"
            aria-label="Build structure picker"
            className="absolute font-mono text-xs"
            style={{
              bottom: 84,
              left: Math.min(mode.slotIndex * (slotDims.width + slotDims.gap) + 16, window.innerWidth - 188),
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
            {buildOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                data-testid={`build-option-${opt}`}
                onClick={() => handleBuildStructureSelect(opt)}
                className="block w-full px-3 py-2 text-left"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#e2e8f0',
                }}
              >
                {opt.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())}
              </button>
            ))}
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

      {/* Show tray only during planning phase */}
      {gameState.phase === 'planning' && !isExecuting && (
        <CommandTray
          commands={gameState.players.player.commands}
          selectedSlot={
            mode.kind === 'slot_selected' || mode.kind === 'picker_open' || mode.kind === 'build_select' || mode.kind === 'build_targeting' || mode.kind === 'train_picker'
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
