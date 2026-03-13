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
  computeUnitMoveTargets,
  computeUnitAttackTargets,
  computeUnitPhaseSurgeTargets,
  computeUnitBuildTargets,
  computeUnitGatherTargets,
  computeUnitMergeTargets,
  TargetingCommandType,
  BuildStructureType,
} from '@/engine/targeting';
import { generateAICommands } from '@/engine/ai';
import { isComplete, STRUCTURE_DEFS } from '@/engine/structures';
import { PlayerId } from '@/engine/player';
import { COLORS, GAME_CONSTANTS, MOBILE_BREAKPOINT_PX, SLOT_LAYOUT } from '@/lib/constants';
import { InteractionMode, TutorialStep } from '@/lib/types';
import { Unit, UNIT_DEFS, effectiveAttack } from '@/engine/units';
import { findUnitAt } from '@/engine/state';
import { getPlayerTrainEligibility, getTrainFailureReason } from './trainFlow';
import {
  ExecutionAnimation, UnitSnapshot, StructSnapshot,
  buildAnimationTimeline, TOTAL_DURATION,
  PHASE_MOVE, PHASE_ATTACK, PHASE_BUILD,
  categorizeLogEntry,
} from '@/renderer/animation';
import { ActionBeat, buildActionSequence } from '@/renderer/actionSequence';
import { audioEngine } from '@/audio/engine';
import GameCanvas from './GameCanvas';
import { CameraSnapshot } from './GameCanvas';
import EpochStatsPopup, { EpochSideStats, EpochStatsSnapshot } from '../hud/EpochStatsPopup';
import BonusCard from '../hud/BonusCard';
import {
  PendingBonusCard, SwipeDirection,
  shouldOfferBonusCard, drawBonusCard, applyBonusCard,
} from '@/engine/bonusCards';
import CommandTray from '../hud/CommandTray';
import CommandPicker from '../hud/CommandPicker';
import UnitActionPanel from '../hud/UnitActionPanel';
import GameStatsPanel from '../hud/GameStatsPanel';
import ExecutionOverlay from '../hud/ExecutionOverlay';
import Minimap from '../hud/Minimap';
import HexTargetPicker from '../hud/HexTargetPicker';
import GatherTargetPicker from '../hud/GatherTargetPicker';
import IntroAnimation from '../animations/IntroAnimation';
import VictoryAnimation from '../animations/VictoryAnimation';
import MergeTargetPicker from '../hud/MergeTargetPicker';
import DifficultyHelpButton from './DifficultyHelpModal';
import { useDifficultyUnlock } from '@/lib/useDifficultyUnlock';
import FeedbackFab from './FeedbackFab';

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

const DIFFICULTY_LABELS = Object.fromEntries(
  DIFFICULTY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<AIDifficulty, string>;

// Module-level code in 'use client' files can still run during SSR prerender,
// so the typeof-window guard is needed here even though call sites are client-only.
function isSkipSetup(): boolean {
  return typeof window !== 'undefined' &&
    !!(window as Window & { __EPOCH_SKIP_SETUP__?: boolean }).__EPOCH_SKIP_SETUP__;
}

function captureAllEpochStats(state: GameState): { player: EpochSideStats; ai: EpochSideStats } {
  const nexusMaxHp = STRUCTURE_DEFS.command_nexus.maxHp;
  const sides: Record<'player' | 'ai', EpochSideStats> = {
    player: { unitCount: 0, droneCount: 0, totalAttack: 0, nexusHp: 0, nexusMaxHp, crystals: 0, flux: 0, techTier: 0 },
    ai:     { unitCount: 0, droneCount: 0, totalAttack: 0, nexusHp: 0, nexusMaxHp, crystals: 0, flux: 0, techTier: 0 },
  };
  for (const u of state.units.values()) {
    const s = sides[u.owner];
    s.unitCount++;
    if (u.type === 'drone') s.droneCount++;
    s.totalAttack += effectiveAttack(u);
  }
  for (const owner of ['player', 'ai'] as const) {
    const s = sides[owner];
    s.nexusHp = findNexus(state, owner)?.hp ?? 0;
    s.crystals = state.players[owner].resources.cc;
    s.flux = state.players[owner].resources.fx;
    s.techTier = state.players[owner].techTier;
  }
  return sides;
}

export default function GameView() {
  const [showSetup, setShowSetup]   = useState(true);
  const { maxUnlocked, isUnlocked, recordVictory } = useDifficultyUnlock();
  const [difficulty, setDifficulty] = useState<AIDifficulty>(() => maxUnlocked);
  const [introPlaying, setIntroPlaying] = useState(true);
  const [gameState, setGameState]   = useState<GameState>(() => createInitialState(42));
  const [mode, setMode]             = useState<InteractionMode>({ kind: 'idle' });
  const [timeLeft, setTimeLeft]     = useState(PLANNING_DURATION);
  const [lockInFlash, setLockInFlash] = useState(false);
  const [animElapsed, setAnimElapsed] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [paused, setPaused]     = useState(false);

  // Track how long the animation was paused so we can adjust startedAt.
  const pausedAtRef = useRef<number | null>(null);
  const [cameraSnapshot, setCameraSnapshot] = useState<CameraSnapshot | null>(null);
  const [centerRequest, setCenterRequest] = useState<{ nonce: number; worldX: number; worldY: number } | null>(null);
  const centerNonceRef = useRef(0);

  // ── Tutorial state ──────────────────────────────────────────────────────
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>('select_drone');

  // ── Timeline Fork + Chrono Scout state ────────────────────────────────────
  const [timelineForkResult, setTimelineForkResult] = useState<TimelineForkResult | null>(null);
  const [chronoScoutResult, setChronoScoutResult]   = useState<ChronoScoutResult | null>(null);
  const timelineForkActiveRef = useRef(false);
  const [timelineForkActive, setTimelineForkActive]  = useState(false);

  // ── Epoch stats popup state ─────────────────────────────────────────────
  const [epochStatsPopup, setEpochStatsPopup] = useState<EpochStatsSnapshot | null>(null);
  const preEpochStatsRef = useRef<{ player: EpochSideStats; ai: EpochSideStats; epoch: number } | null>(null);

  // ── Bonus card state ───────────────────────────────────────────────────
  const [pendingBonusCard, setPendingBonusCard] = useState<PendingBonusCard | null>(null);
  const [bonusAppliedMsg, setBonusAppliedMsg] = useState<string | null>(null);

  const dismissEpochStats = useCallback(() => {
    const popup = epochStatsPopup;
    setEpochStatsPopup(null);
    // After dismissing epoch stats, check if a bonus card should appear.
    if (popup && shouldOfferBonusCard(popup.epoch)) {
      setPendingBonusCard(drawBonusCard(popup.epoch));
    }
  }, [epochStatsPopup]);

  const handleBonusSwipe = useCallback((direction: SwipeDirection) => {
    if (!pendingBonusCard) return;
    const state = gameStateRef.current;
    const msg = applyBonusCard(state, pendingBonusCard.card.id, direction);
    setGameState({ ...state });
    setPendingBonusCard(null);
    setBonusAppliedMsg(msg);
    setTimeout(() => setBonusAppliedMsg(null), 2500);
  }, [pendingBonusCard]);

  // Stable refs so callbacks always see the latest values.
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const modeRef = useRef<InteractionMode>(mode);
  modeRef.current = mode;

  const timeLeftRef = useRef(timeLeft);
  timeLeftRef.current = timeLeft;

  // ── Test: auto-dismiss difficulty picker ──────────────────────────────────
  useEffect(() => {
    if (isSkipSetup()) { setShowSetup(false); setIntroPlaying(false); }
  }, []);

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

  // Structure IDs already committed to a train command in other slots this epoch.
  const committedTrainStructures = useMemo(() => {
    const ids = new Set<string>();
    for (const cmd of gameState.players.player.globalCommands) {
      if (cmd?.type === 'train') ids.add(cmd.structureId);
    }
    return ids;
  }, [gameState]);

  const canTrain = useMemo(
    () => getPlayerTrainEligibility(gameState, committedTrainStructures).length > 0,
    [gameState, committedTrainStructures],
  );

  const hasEpochAnchor = gameState.players.player.epochAnchor !== null;
  const buildOptions = playerTechTier >= 2 ? TIER2_BUILD_OPTIONS : playerTechTier >= 1 ? TIER1_BUILD_OPTIONS : BASE_BUILD_OPTIONS;

  // ── Tutorial auto-advance ─────────────────────────────────────────────────
  const tutorialActive = tutorialStep !== null;

  // Find the first idle drone for tutorial targeting.
  const tutorialDroneId = useMemo(() => {
    if (!tutorialActive) return null;
    for (const u of gameState.units.values()) {
      if (u.owner === 'player' && u.type === 'drone' && !gameState.players.player.unitOrders.has(u.id)) return u.id;
    }
    // Fallback to any player drone.
    for (const u of gameState.units.values()) {
      if (u.owner === 'player' && u.type === 'drone') return u.id;
    }
    return null;
  }, [tutorialActive, gameState]);

  // When lock-in completes, decide the next tutorial phase for the upcoming epoch.
  const prevLockedInRef = useRef(false);
  useEffect(() => {
    if (!tutorialActive) { prevLockedInRef.current = lockedIn; return; }

    // Detect rising edge of lockedIn → true.
    const justLocked = lockedIn && !prevLockedInRef.current;
    prevLockedInRef.current = lockedIn;
    if (!justLocked) return;

    switch (tutorialStep) {
      case 'lock_in':
        // Barracks is building — next epoch build the extractor.
        setTutorialStep('extractor_select_drone');
        break;
      case 'extractor_lock_in':
        // Barracks done, extractor still building — next epoch train a sentry.
        setTutorialStep('train_select_slot');
        break;
      case 'train_lock_in':
        // Sentry training queued — next epoch gather with extractor.
        setTutorialStep('gather_select_drone');
        break;
      case 'gather_lock_in':
        setTutorialStep(null); // tutorial complete
        break;
    }
  }, [tutorialActive, tutorialStep, lockedIn, gameState]);

  // Mode-driven step advancement (runs on mode / gameState changes).
  useEffect(() => {
    if (!tutorialActive) return;

    switch (tutorialStep) {
      // ── Phase 1: build barracks ─────────────────────────────
      case 'select_drone':
        if (mode.kind === 'unit_picker_open') {
          const u = gameState.units.get(mode.unitId);
          if (u?.type === 'drone') setTutorialStep('select_build');
        }
        break;
      case 'select_build':
        if (mode.kind === 'build_select') setTutorialStep('select_barracks');
        break;
      case 'select_barracks':
        if (mode.kind === 'build_targeting' && mode.structureType === 'barracks') {
          setTutorialStep('select_hex');
        }
        break;
      case 'select_hex':
        for (const cmd of gameState.players.player.unitOrders.values()) {
          if (cmd.type === 'build' && cmd.structureType === 'barracks') {
            setTutorialStep('lock_in');
            break;
          }
        }
        break;

      // ── Phase 2: build extractor ────────────────────────────
      case 'extractor_select_drone':
        if (mode.kind === 'unit_picker_open') {
          const u = gameState.units.get(mode.unitId);
          if (u?.type === 'drone') setTutorialStep('extractor_select_build');
        }
        break;
      case 'extractor_select_build':
        if (mode.kind === 'build_select') setTutorialStep('extractor_select_extractor');
        break;
      case 'extractor_select_extractor':
        if (mode.kind === 'build_targeting' && mode.structureType === 'crystal_extractor') {
          setTutorialStep('extractor_select_hex');
        }
        break;
      case 'extractor_select_hex':
        for (const cmd of gameState.players.player.unitOrders.values()) {
          if (cmd.type === 'build' && cmd.structureType === 'crystal_extractor') {
            // Guide to training a sentry if barracks is ready and player can afford it.
            const canTrainSentry =
              getPlayerTrainEligibility(gameState).length > 0 &&
              gameState.players.player.resources.cc >= UNIT_DEFS.pulse_sentry.costCC;
            setTutorialStep(canTrainSentry ? 'extractor_train_select_slot' : 'extractor_lock_in');
            break;
          }
        }
        break;

      // ── Phase 2b: train a sentry after extractor (if affordable) ─
      case 'extractor_train_select_slot':
        if (mode.kind === 'global_picker_open') setTutorialStep('extractor_train_select_train');
        break;
      case 'extractor_train_select_train':
        if (mode.kind === 'train_picker') setTutorialStep('extractor_train_select_sentry');
        break;
      case 'extractor_train_select_sentry': {
        for (const cmd of gameState.players.player.globalCommands) {
          if (cmd?.type === 'train' && cmd.unitType === 'pulse_sentry') {
            setTutorialStep('extractor_lock_in');
            break;
          }
        }
        break;
      }

      // ── Phase 3: train a Pulse Sentry (barracks done) ──────
      case 'train_select_slot':
        if (mode.kind === 'global_picker_open') setTutorialStep('train_select_train');
        break;
      case 'train_select_train':
        if (mode.kind === 'train_picker') setTutorialStep('train_select_sentry');
        break;
      case 'train_select_sentry': {
        for (const cmd of gameState.players.player.globalCommands) {
          if (cmd?.type === 'train' && cmd.unitType === 'pulse_sentry') {
            setTutorialStep('train_lock_in');
            break;
          }
        }
        break;
      }

      // ── Phase 4: gather (extractor done) ───────────────────
      case 'gather_select_drone':
        if (mode.kind === 'unit_picker_open') {
          const u = gameState.units.get(mode.unitId);
          if (u?.type === 'drone') setTutorialStep('gather_select_gather');
        }
        break;
      case 'gather_select_gather':
        if (mode.kind === 'gather_picker') setTutorialStep('gather_select_target');
        break;
      case 'gather_select_target':
        for (const cmd of gameState.players.player.unitOrders.values()) {
          if (cmd.type === 'gather') {
            setTutorialStep('gather_lock_in');
            break;
          }
        }
        break;
    }
  }, [tutorialActive, tutorialStep, mode, gameState]);

  // ── Execution animation ref ───────────────────────────────────────────────
  const animationRef = useRef<ExecutionAnimation | null>(null);
  const [actionBeats, setActionBeats] = useState<ActionBeat[] | null>(null);

  // ── finishExecution ───────────────────────────────────────────────────────
  const finishExecutionRef = useRef<() => void>(() => {});

  const finishExecution = useCallback(() => {
    animationRef.current = null;
    setActionBeats(null);
    setAnimElapsed(0);
    setMode({ kind: 'idle' });
    setTimeLeft(PLANNING_DURATION);
    setTimelineForkResult(null);
    setChronoScoutResult(null);
    timelineForkActiveRef.current = false;
    setTimelineForkActive(false);

    const s = gameStateRef.current;
    if (s.phase !== 'over') {
      // Build epoch stats popup snapshot
      const pre = preEpochStatsRef.current;
      if (pre) {
        const post = captureAllEpochStats(s);
        setEpochStatsPopup({
          epoch: pre.epoch,
          player: post.player,
          ai: post.ai,
          playerDelta: {
            units: post.player.unitCount - pre.player.unitCount,
            drones: post.player.droneCount - pre.player.droneCount,
            crystals: post.player.crystals - pre.player.crystals,
            flux: post.player.flux - pre.player.flux,
          },
        });
        preEpochStatsRef.current = null;
      }

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

    // Capture pre-epoch stats for the popup
    preEpochStatsRef.current = {
      ...captureAllEpochStats(state),
      epoch: state.epoch,
    };

    generateAICommands(state);

    const unitSnaps = new Map<string, UnitSnapshot>();
    for (const [id, u] of state.units) {
      unitSnaps.set(id, { hex: { ...u.hex }, hp: u.hp, owner: u.owner, type: u.type, mergeCount: u.mergeCount, bonusMaxHp: u.bonusMaxHp });
    }
    const structSnaps = new Map<string, StructSnapshot>();
    for (const [id, s] of state.structures) {
      structSnaps.set(id, { hex: { ...s.hex }, hp: s.hp, owner: s.owner, type: s.type });
    }

    resolveEpoch(state);

    const anim = buildAnimationTimeline(unitSnaps, structSnaps, state);
    animationRef.current = anim;
    setActionBeats(buildActionSequence(anim, state.map));

    execSoundsRef.current = { move: false, attack: false, build: false };
    audioEngine.playEpochTransition();

    setMode({ kind: 'idle' });
    setGameState({ ...state });
  }, []);

  handleResolveRef.current = handleResolve;

  // ── Animation tick ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!animationRef.current || paused) return;

    // If resuming from pause, shift startedAt forward by the paused duration.
    if (pausedAtRef.current !== null && animationRef.current) {
      const pauseDuration = performance.now() - pausedAtRef.current;
      animationRef.current.startedAt += pauseDuration;
      pausedAtRef.current = null;
    }

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
  }, [gameState.phase, paused]);

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (lockedIn || gameState.phase !== 'planning' || showSetup || paused || epochStatsPopup || pendingBonusCard) return;

    const id = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [lockedIn, gameState.phase, showSetup, paused, epochStatsPopup, pendingBonusCard]);

  useEffect(() => {
    if (timeLeft === 0 && gameState.phase === 'planning' && !lockedIn && !showSetup && !epochStatsPopup && !pendingBonusCard) {
      handleResolveRef.current();
    }
  }, [timeLeft, gameState.phase, lockedIn, showSetup, epochStatsPopup, pendingBonusCard]);

  // ── Unlock next difficulty on victory ────────────────────────────────────
  useEffect(() => {
    if (gameState.phase === 'over' && gameState.winner === 'player') {
      recordVictory(difficulty);
    }
  }, [gameState.phase, gameState.winner, difficulty, recordVictory]);

  // ── Play Again / Start ────────────────────────────────────────────────────
  const handlePlayAgain = useCallback(() => {
    setGameState(createInitialState(42));
    setMode({ kind: 'idle' });
    setTimeLeft(PLANNING_DURATION);
    setPaused(false);
    if (isSkipSetup()) {
      setShowSetup(false);
      setIntroPlaying(false);
    } else {
      setIntroPlaying(true);
      setShowSetup(true);
    }
  }, []);

  const handleStartGame = useCallback((diff: AIDifficulty) => {
    setDifficulty(diff);
    setGameState(createInitialState(Date.now(), diff));
    setMode({ kind: 'idle' });
    setTimeLeft(PLANNING_DURATION);
    setShowSetup(false);
  }, []);

  const handleIntroComplete = useCallback(() => {
    setIntroPlaying(false);
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
    state.players.player.defaultOrderUnitIds.delete(unitId);
    setGameState({ ...state });
    setMode({ kind: 'idle' });
    audioEngine.playFillSlot(0);
  }, []);

  const handleUnitOrderClear = useCallback((unitId: string) => {
    const state = gameStateRef.current;
    if (state.players.player.lockedIn) return;
    state.players.player.unitOrders.delete(unitId);
    state.players.player.defaultOrderUnitIds.delete(unitId);
    // If clearing a chrono_scout unit, clear the scout result
    // (chrono_scout is global, but handle defensively)
    setGameState({ ...state });
    setMode({ kind: 'idle' });
    audioEngine.playClearSlot();
  }, []);

  const handleUnitCardClick = useCallback((unitId: string) => {
    const state = gameStateRef.current;
    if (state.players.player.lockedIn) return;
    // Block units that are targeted by a merge command.
    for (const cmd of state.players.player.unitOrders.values()) {
      if (cmd.type === 'merge' && cmd.targetUnitIds.includes(unitId)) return;
    }
    setMode({ kind: 'unit_picker_open', unitId });
    // Pan camera to the selected unit so the highlight is visible.
    const unit = state.units.get(unitId);
    if (unit) {
      const wp = hexToPixel(unit.hex, BASE_HEX_SIZE);
      queueRecenter(wp.x, wp.y);
    }
  }, [queueRecenter]);

  // ── Global slot helpers ───────────────────────────────────────────────────
  const handleGlobalSlotClick = useCallback((i: number) => {
    const state = gameStateRef.current;
    if (state.players.player.lockedIn) return;
    if (i >= state.players.player.globalCommands.length) return;
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

      if (type === 'phase_surge') {
        const eligibleKeys = computeUnitPhaseSurgeTargets(state, unit);
        setMode({ kind: 'targeting', unitId, commandType: 'phase_surge', eligibleKeys });
        return;
      }

      if (type === 'gather') {
        const targets = computeUnitGatherTargets(state, unit);
        setMode({ kind: 'gather_picker', unitId, targets });
        return;
      }

      if (type === 'merge') {
        const targets = computeUnitMergeTargets(state, unit);
        setMode({ kind: 'merge_picker', unitId, targets });
        return;
      }

      if (type === 'move') {
        const eligibleKeys = computeUnitMoveTargets(state, unit);
        setMode({ kind: 'targeting', unitId, commandType: 'move', eligibleKeys });
        return;
      }

      if (type === 'attack') {
        const eligibleKeys = computeUnitAttackTargets(state, unit);
        setMode({ kind: 'targeting', unitId, commandType: 'attack', eligibleKeys });
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
        // Exclude structures already committed to train commands in other slots.
        const excludeIds = new Set<string>();
        for (let j = 0; j < state.players.player.globalCommands.length; j++) {
          if (j === slotIndex) continue; // allow re-picking for the current slot
          const cmd = state.players.player.globalCommands[j];
          if (cmd?.type === 'train') excludeIds.add(cmd.structureId);
        }
        const eligible = getPlayerTrainEligibility(state, excludeIds);
        if (eligible.length === 0) {
          setMode({
            kind: 'train_picker',
            slotIndex,
            structureId: '',
            structureHex: { q: 0, r: 0 },
            failureFeedback: 'All production buildings are already assigned.',
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

    const state = gameStateRef.current;
    const unit = state.units.get(m.unitId);
    const eligibleKeys = unit
      ? computeUnitBuildTargets(state, unit, structureType)
      : computeEligibleBuildHexes(state);

    // Exclude hexes already claimed by pending build orders from other drones.
    for (const cmd of state.players.player.unitOrders.values()) {
      if (cmd.type === 'build' && cmd.unitId !== m.unitId) {
        eligibleKeys.delete(hexKey(cmd.targetHex));
      }
    }

    setMode({
      kind: 'build_targeting',
      unitId: m.unitId,
      structureType,
      eligibleKeys,
    });
  }, []);

  const handleGatherSelect = useCallback((hex: Hex) => {
    const m = modeRef.current;
    if (m.kind !== 'gather_picker') return;
    commitUnitOrder(m.unitId, { type: 'gather', unitId: m.unitId, targetHex: hex });
  }, [commitUnitOrder]);

  const handleMergeConfirm = useCallback((selectedIds: string[]) => {
    const m = modeRef.current;
    if (m.kind !== 'merge_picker') return;
    commitUnitOrder(m.unitId, { type: 'merge', unitId: m.unitId, targetUnitIds: selectedIds });
  }, [commitUnitOrder]);

  const handleHexTargetSelect = useCallback((hex: Hex) => {
    const m = modeRef.current;
    if (m.kind === 'targeting') {
      const { unitId, commandType } = m;
      if (commandType === 'move') {
        commitUnitOrder(unitId, { type: 'move', unitId, targetHex: hex });
      } else if (commandType === 'attack') {
        commitUnitOrder(unitId, { type: 'attack', unitId, targetHex: hex });
      } else if (commandType === 'phase_surge') {
        commitUnitOrder(unitId, { type: 'phase_surge', unitId, targetHex: hex });
      }
    } else if (m.kind === 'build_targeting') {
      commitUnitOrder(m.unitId, { type: 'build', unitId: m.unitId, structureType: m.structureType, targetHex: hex });
    }
  }, [commitUnitOrder]);

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
    // Exclude structures committed to train commands in other slots.
    const excludeIds = new Set<string>();
    for (let j = 0; j < state.players.player.globalCommands.length; j++) {
      if (j === m.slotIndex) continue;
      const cmd = state.players.player.globalCommands[j];
      if (cmd?.type === 'train') excludeIds.add(cmd.structureId);
    }
    const eligible = getPlayerTrainEligibility(state, excludeIds);
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
      } else if (commandType === 'phase_surge') {
        newCmd = { type: 'phase_surge', unitId, targetHex: hex };
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
      if (!m.eligibleKeys.has(key)) return; // ignore clicks on ineligible hexes
      commitUnitOrder(m.unitId, { type: 'build', unitId: m.unitId, structureType: m.structureType, targetHex: hex });
      return;
    }

    // ── Idle: clicking a player unit opens its picker ─────────────────────
    if (m.kind === 'idle' && state.phase === 'planning' && !lockedIn) {
      const unit = findUnitAt(state, hex, 'player');
      if (unit) {
        // Block units that are targeted by a merge command.
        let mergeLocked = false;
        for (const cmd of state.players.player.unitOrders.values()) {
          if (cmd.type === 'merge' && cmd.targetUnitIds.includes(unit.id)) { mergeLocked = true; break; }
        }
        if (!mergeLocked) setMode({ kind: 'unit_picker_open', unitId: unit.id });
      }
    }
  }, [commitUnitOrder, lockedIn]);

  // ── Pause toggle ─────────────────────────────────────────────────────────
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      if (next) {
        // Entering pause — close any open menus/pickers and freeze everything.
        setMode({ kind: 'idle' });
        pausedAtRef.current = performance.now();
        audioEngine.suspend();
      } else {
        // Resuming — audio restarts; pausedAtRef is consumed in the anim tick effect.
        audioEngine.resume();
      }
      return next;
    });
  }, []);

  const togglePauseRef = useRef(togglePause);
  togglePauseRef.current = togglePause;

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  const handleLockInRef = useRef(handleLockIn);
  handleLockInRef.current = handleLockIn;
  const handleGlobalSlotClickRef = useRef(handleGlobalSlotClick);
  handleGlobalSlotClickRef.current = handleGlobalSlotClick;
  const showSetupRef = useRef(showSetup);
  showSetupRef.current = showSetup;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Don't allow pause during setup or game-over.
        if (showSetupRef.current) return;
        if (gameStateRef.current.phase === 'over') return;

        // If paused, always unpause.
        if (pausedRef.current) {
          togglePauseRef.current();
          return;
        }

        // If in a sub-mode (picker, targeting), close it first. Otherwise toggle pause.
        if (modeRef.current.kind !== 'idle') {
          setMode({ kind: 'idle' });
        } else {
          togglePauseRef.current();
        }
        return;
      }

      // Block all shortcuts while paused or during setup.
      if (pausedRef.current) return;
      if (showSetupRef.current) return;

      if (e.key === ' ') {
        e.preventDefault();
        if (animationRef.current !== null) {
          finishExecutionRef.current();
        } else {
          handleLockInRef.current();
        }
        return;
      }

      // Number keys 1–9 open the corresponding global slot picker.
      if (e.key >= '1' && e.key <= '9') {
        handleGlobalSlotClickRef.current(parseInt(e.key, 10) - 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const isExecuting = animationRef.current !== null;

  // Planning HUD is visible only during planning when no post-epoch popups are active.
  const showPlanningHud = gameState.phase === 'planning' && !isExecuting && !epochStatsPopup && !pendingBonusCard;

  // Echo overlay: show previous AI commands when player has Echo queued.
  const hasEcho = gameState.players.player.globalCommands.some((c) => c?.type === 'temporal');
  const echoCommands = hasEcho ? gameState.prevEpochCommands.ai : null;

  // ── Unit picker props (derived from current mode) ─────────────────────────
  const activeUnitId =
    mode.kind === 'unit_picker_open' ? mode.unitId :
    mode.kind === 'targeting' || mode.kind === 'build_select' || mode.kind === 'build_targeting' || mode.kind === 'gather_picker' || mode.kind === 'merge_picker' ? mode.unitId :
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
    const canMerge = computeUnitMergeTargets(gameState, unitForPicker).length > 0;
    return { canAttack, canGather, canBuild, canChronoShift, canMerge, unitType: unitForPicker.type };
  })() : null;

  // Position for unit picker: to the right of the panel, above the command tray.
  // Cards now stack from the bottom, so pickers open from the bottom too.
  const unitPickerBottom = 84;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* Epoch stats comparison popup — shown after each epoch resolves */}
      {epochStatsPopup && (
        <EpochStatsPopup
          stats={epochStatsPopup}
          onDismiss={dismissEpochStats}
        />
      )}

      {/* Bonus card — swipe left/right for a reward (every 4 epochs) */}
      {pendingBonusCard && (
        <BonusCard
          card={pendingBonusCard.card}
          onSwipe={handleBonusSwipe}
        />
      )}

      {/* Bonus applied toast */}
      {bonusAppliedMsg && (
        <div
          data-testid="bonus-applied-toast"
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10001,
            background: 'rgba(13,12,20,0.95)',
            border: '1px solid #ffd700',
            borderRadius: 6,
            padding: '8px 18px',
            color: '#ffd700',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textShadow: '0 0 8px rgba(255,215,0,0.4)',
            animation: 'fadeIn 0.3s ease',
            pointerEvents: 'none',
          }}
        >
          BONUS: {bonusAppliedMsg}
        </div>
      )}

      {/* Canvas area fills remaining space */}
      <div className="relative min-h-0 flex-1">
        <GameCanvas
          gameState={gameState}
          mode={mode}
          animation={animationRef.current}
          actionBeats={actionBeats}
          echoCommands={echoCommands}
          timelineForkResult={timelineForkResult}
          chronoScoutResult={chronoScoutResult}
          onHexClick={handleHexClick}
          onCameraChange={setCameraSnapshot}
          centerRequest={centerRequest}
        />

        {/* Unit action panel — left sidebar */}
        {gameState.phase === 'planning' && !isExecuting && !epochStatsPopup && !pendingBonusCard && (
          <UnitActionPanel
            gameState={gameState}
            mode={mode}
            lockedIn={lockedIn}
            tutorialHighlightUnitId={
              tutorialStep === 'select_drone' || tutorialStep === 'extractor_select_drone' || tutorialStep === 'gather_select_drone'
                ? tutorialDroneId : null
            }
            onUnitClick={handleUnitCardClick}
            onOrderClear={handleUnitOrderClear}
          />
        )}

        {/* Stats panel — right sidebar, desktop only */}
        {showPlanningHud && !isMobile && <GameStatsPanel gameState={gameState} />}

        {/* Minimap — visible during planning only */}
        {showPlanningHud && (
          <Minimap
            gameState={gameState}
            cameraSnapshot={cameraSnapshot}
            isMobile={isMobile}
            onRecenter={queueRecenter}
            onSnapHome={handleSnapHome}
          />
        )}

        {/* Unit command picker */}
        {mode.kind === 'unit_picker_open' && !isExecuting && unitForPicker && unitPickerProps && (
          <CommandPicker
            position={{ kind: 'unit', top: unitPickerBottom }}
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
            canMerge={unitPickerProps.canMerge}
            tutorialHighlightType={
              tutorialStep === 'select_build' || tutorialStep === 'extractor_select_build' ? 'build'
              : tutorialStep === 'gather_select_gather' ? 'gather'
              : undefined
            }
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
            tutorialHighlightType={tutorialStep === 'train_select_train' || tutorialStep === 'extractor_train_select_train' ? 'train' : undefined}
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
            tutorialHighlightUnitType={tutorialStep === 'train_select_sentry' || tutorialStep === 'extractor_train_select_sentry' ? 'pulse_sentry' : undefined}
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
              bottom: unitPickerBottom,
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
              const isTutorial =
                (tutorialStep === 'select_barracks' && opt === 'barracks') ||
                (tutorialStep === 'extractor_select_extractor' && opt === 'crystal_extractor');
              return (
                <button
                  key={opt}
                  type="button"
                  data-testid={`build-option-${opt}`}
                  disabled={!isEnabled}
                  title={disabledLabel}
                  onClick={() => isEnabled && handleBuildStructureSelect(opt)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left${isTutorial ? ' tutorial-highlight' : ''}`}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: isEnabled ? '#e2e8f0' : '#334155',
                    cursor: isEnabled ? 'pointer' : 'not-allowed',
                    position: isTutorial ? 'relative' as const : undefined,
                  }}
                >
                  <span>{sDef.label}</span>
                  <span style={{ color: isEnabled ? '#fbbf24' : '#334155', fontSize: '0.6rem', marginLeft: 16 }}>
                    {disabledLabel ?? costLabel}
                  </span>
                  {isTutorial && <span className="tutorial-tooltip" style={{ top: -20, left: 4 }}>BUILD THIS</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Hex target picker for move/attack targeting */}
        {mode.kind === 'targeting' && !isExecuting && unitForPicker && (mode.commandType === 'move' || mode.commandType === 'attack') && (
          <div style={{ position: 'absolute', bottom: unitPickerBottom, left: 188 }}>
            <HexTargetPicker
              unitHex={unitForPicker.hex}
              radius={mode.commandType === 'move'
                ? UNIT_DEFS[unitForPicker.type].speed
                : UNIT_DEFS[unitForPicker.type].speed + UNIT_DEFS[unitForPicker.type].range
              }
              eligibleKeys={mode.eligibleKeys}
              header={mode.commandType === 'move' ? 'MOVE TARGET' : 'ATTACK TARGET'}
              onSelect={handleHexTargetSelect}
              onClose={() => setMode({ kind: 'idle' })}
            />
          </div>
        )}

        {/* Hex target picker for build placement */}
        {mode.kind === 'build_targeting' && !isExecuting && unitForPicker && (
          <div style={{ position: 'absolute', bottom: unitPickerBottom, left: 188 }}>
            <HexTargetPicker
              unitHex={unitForPicker.hex}
              radius={UNIT_DEFS[unitForPicker.type].speed}
              eligibleKeys={mode.eligibleKeys}
              header="BUILD LOCATION"
              onSelect={handleHexTargetSelect}
              onClose={() => setMode({ kind: 'idle' })}
            />
          </div>
        )}

        {/* Gather target list picker */}
        {mode.kind === 'gather_picker' && !isExecuting && (
          <div style={{ position: 'absolute', bottom: unitPickerBottom, left: 188 }}>
            <GatherTargetPicker
              targets={mode.targets}
              tutorialHighlight={tutorialStep === 'gather_select_target'}
              onSelect={handleGatherSelect}
              onClose={() => setMode({ kind: 'idle' })}
            />
          </div>
        )}

        {/* Merge target picker */}
        {mode.kind === 'merge_picker' && !isExecuting && (
          <div style={{ position: 'absolute', bottom: unitPickerBottom, left: 188 }}>
            <MergeTargetPicker
              targets={mode.targets}
              onConfirm={handleMergeConfirm}
              onClose={() => setMode({ kind: 'idle' })}
            />
          </div>
        )}

        {/* Execution overlay */}
        {isExecuting && animationRef.current && (
          <ExecutionOverlay
            animation={animationRef.current}
            elapsed={animElapsed}
            actionBeats={actionBeats}
            onSkip={handleSkip}
            tutorialHighlightSkip={tutorialActive}
          />
        )}

        {/* Pause button — visible during active gameplay */}
        {!showSetup && gameState.phase !== 'over' && !paused && (
          <button
            data-testid="pause-btn"
            aria-label="Pause game"
            onClick={togglePause}
            className="absolute font-mono text-xs tracking-wider uppercase"
            style={{
              top: isMobile ? 32 : 8,
              right: 8,
              zIndex: 40,
              padding: '6px 14px',
              background: 'rgba(10,14,26,0.75)',
              border: '1px solid #334155',
              borderRadius: 4,
              color: '#94a3b8',
              cursor: 'pointer',
            }}
          >
            Pause
          </button>
        )}

        {/* Pause overlay */}
        {paused && (
          <div
            data-testid="pause-overlay"
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ background: 'rgba(10,14,26,0.80)', zIndex: 60 }}
            onClick={togglePause}
          >
            <div
              className="font-mono text-4xl font-bold tracking-widest uppercase"
              style={{ color: COLORS.CYAN }}
            >
              PAUSED
            </div>
            <div className="mt-4 font-mono text-sm" style={{ color: '#64748b' }}>
              {isMobile ? 'Tap to resume' : 'Press Esc or tap to resume'}
            </div>
          </div>
        )}

        {/* Feedback FAB — only visible when paused */}
        {paused && <FeedbackFab />}

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
              {DIFFICULTY_OPTIONS.map((opt) => {
                const locked = !isUnlocked(opt.value);
                return (
                  <button
                    key={opt.value}
                    data-testid={`difficulty-${opt.value}`}
                    disabled={locked}
                    className="text-left px-4 py-3 border font-mono transition-colors"
                    style={{
                      color: locked ? '#334155' : difficulty === opt.value ? COLORS.CYAN : '#94a3b8',
                      borderColor: locked ? '#1e293b' : difficulty === opt.value ? COLORS.CYAN : '#334155',
                      background: locked ? 'transparent' : difficulty === opt.value ? 'rgba(0,229,255,0.06)' : 'transparent',
                      cursor: locked ? 'not-allowed' : 'pointer',
                      opacity: locked ? 0.5 : 1,
                    }}
                    onClick={() => { if (!locked) setDifficulty(opt.value); }}
                  >
                    <div className="text-sm font-bold tracking-wider">
                      {locked ? `[LOCKED] ${opt.label}` : opt.label}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: locked ? '#1e293b' : '#64748b' }}>
                      {locked ? 'Beat the previous difficulty to unlock' : opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3 mt-2">
              <DifficultyHelpButton labels={DIFFICULTY_LABELS} />
              <button
                data-testid="start-game-btn"
                className="font-mono text-sm tracking-widest uppercase px-8 py-2 border"
                style={{ color: COLORS.CYAN, borderColor: COLORS.CYAN, background: 'rgba(0,229,255,0.08)' }}
                onClick={() => handleStartGame(difficulty)}
              >
                BEGIN
              </button>
            </div>
          </div>
        )}

        {/* Intro title card animation */}
        {introPlaying && (
          <IntroAnimation onComplete={handleIntroComplete} />
        )}

        {/* Game-over overlay with victory/defeat animation */}
        {gameState.phase === 'over' && (
          <div data-testid="game-over-overlay">
            <VictoryAnimation
              winner={gameState.winner === 'player' ? 'player' : 'ai'}
              epoch={gameState.epoch}
              onComplete={handlePlayAgain}
            />
            <div data-testid="game-over-result" style={{ display: 'none' }}>
              {gameState.winner === 'player' ? 'VICTORY' : 'DEFEAT'}
            </div>
          </div>
        )}

        {/* Global command tray — bottom-right, aligned with unit cards */}
        {gameState.phase === 'planning' && !isExecuting && !showSetup && !epochStatsPopup && !pendingBonusCard && (
          <CommandTray
            globalCommands={gameState.players.player.globalCommands}
            selectedGlobalSlot={
              mode.kind === 'global_picker_open' || mode.kind === 'train_picker'
                ? mode.slotIndex
                : null
            }
            lockedIn={lockedIn || paused}
            lockInFlash={lockInFlash}
            isMobile={isMobile}
            forkMode={timelineForkActive}
            tutorialHighlightLockIn={
              tutorialStep === 'lock_in' ||
              tutorialStep === 'extractor_lock_in' ||
              tutorialStep === 'train_lock_in' ||
              tutorialStep === 'gather_lock_in'
            }
            tutorialHighlightSlot={tutorialStep === 'train_select_slot' || tutorialStep === 'extractor_train_select_slot'}
            onSlotClick={handleGlobalSlotClick}
            onSlotClear={handleGlobalSlotClear}
            onLockIn={handleLockIn}
          />
        )}
      </div>
    </div>
  );
}
