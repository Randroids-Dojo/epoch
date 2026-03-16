import { GAME_CONSTANTS } from './constants'
import type { TargetingCommandType, GatherTarget, MergeTarget } from '../engine/targeting'
import type { StructureType } from '../engine/structures'

// ── Interaction Mode (Planning Phase UI) ──────────────────────────────────────

export type InteractionMode =
  | { kind: 'idle' }

  /** Unit command picker is open for this unit (from panel card or canvas click). */
  | { kind: 'unit_picker_open'; unitId: string }

  /** Global command picker is open for this slot in the tray. */
  | { kind: 'global_picker_open'; slotIndex: number }

  | {
      kind: 'targeting';
      unitId: string;
      commandType: TargetingCommandType;
      eligibleKeys: Set<string>;
      /** Subset of eligibleKeys reachable within a single epoch (move only). */
      immediateKeys?: Set<string>;
    }

  /** Drone selected; waiting for player to choose which structure to build. */
  | { kind: 'build_select'; unitId: string }

  | {
      kind: 'build_targeting';
      unitId: string;
      structureType: Exclude<StructureType, 'command_nexus'>;
      eligibleKeys: Set<string>;
    }

  /** Drone selected gather; showing list of harvestable structures in range. */
  | {
      kind: 'gather_picker';
      unitId: string;
      targets: GatherTarget[];
    }

  | {
      kind: 'train_picker';
      slotIndex: number;
      structureId: string;
      structureHex: { q: number; r: number };
      failureFeedback: string | null;
    }

  /** Merge picker: selecting which same-type units to merge into the selected unit. */
  | {
      kind: 'merge_picker';
      unitId: string;
      targets: MergeTarget[];
    }

// ── Tutorial Steps ───────────────────────────────────────────────────────────

/** Steps for the opening tutorial. null = tutorial complete/inactive. */
export type TutorialStep =
  // Phase 1 — Epoch 1: build a barracks
  | 'select_drone'
  | 'select_build'
  | 'select_barracks'
  | 'select_hex'
  | 'lock_in'
  // Phase 2 — Epoch 2: build a crystal extractor (barracks still constructing)
  | 'extractor_select_drone'
  | 'extractor_select_build'
  | 'extractor_select_extractor'
  | 'extractor_select_hex'
  // Phase 2b — same epoch: train a Pulse Sentry (only if barracks is done + affordable)
  | 'extractor_train_select_slot'
  | 'extractor_train_select_train'
  | 'extractor_train_select_sentry'
  | 'extractor_lock_in'
  // Wait steps — tutorial pauses during execution animation, resumes on next planning phase
  | 'wait_for_train_epoch'
  | 'wait_for_gather_epoch'
  // Phase 3 — Epoch 3: barracks done, extractor still building → train a Pulse Sentry
  | 'train_select_slot'
  | 'train_select_train'
  | 'train_select_sentry'
  | 'train_lock_in'
  // Phase 4 — Epoch 4: extractor done → gather
  | 'gather_select_drone'
  | 'gather_select_gather'
  | 'gather_select_target'
  | 'gather_lock_in'
  // Phase 5 — Epoch 5: use Temporal Echo to reveal enemy's previous moves
  | 'wait_for_echo_epoch'
  | 'echo_select_slot'
  | 'echo_select_echo'
  | 'echo_lock_in'
  // Phase 6 — build a Tech Lab (unlocks research)
  | 'wait_for_techlab_epoch'
  | 'techlab_select_drone'
  | 'techlab_select_build'
  | 'techlab_select_techlab'
  | 'techlab_select_hex'
  | 'techlab_lock_in'
  // Phase 7 — research Tier 1 (unlocks Flux Conduit)
  | 'wait_for_research_epoch'
  | 'research_select_slot'
  | 'research_select_research'
  | 'research_lock_in'
  // Wait for research to complete (3 epochs, auto-advances each planning phase)
  | 'wait_for_research_complete'
  // Phase 8 — build a Flux Conduit on a flux vent
  | 'flux_select_drone'
  | 'flux_select_build'
  | 'flux_select_conduit'
  | 'flux_select_hex'
  | 'flux_lock_in'
  // Phase 9 — use Phase Surge on a combat unit (requires TE)
  | 'wait_for_surge_epoch'
  | 'surge_select_unit'
  | 'surge_select_surge'
  | 'surge_select_target'
  | 'surge_lock_in'
  // Phase 10 — use Chrono Shift on a unit with 2-epoch history (requires Tech Tier 1 + TE)
  | 'wait_for_shift_epoch'
  | 'shift_select_unit'
  | 'shift_select_shift'
  | 'shift_lock_in'
  // Phase 11 — use Epoch Anchor set (requires Tech Tier 3 + 5 TE)
  | 'wait_for_anchor_epoch'
  | 'anchor_select_slot'
  | 'anchor_select_set'
  | 'anchor_lock_in'
  // Phase 12 — use Epoch Anchor activate (recall, requires 3 TE after set)
  | 'wait_for_recall_epoch'
  | 'recall_select_slot'
  | 'recall_select_activate'
  | 'recall_lock_in'
  | null;

export type Phase = 'planning' | 'temporal' | 'execution'

export interface PlayerResources {
  temporalEnergy: number
  gold: number
  actions: number
}

export interface PlayerState {
  id: string
  name: string
  resources: PlayerResources
  units: unknown[]
  territory: unknown[]
}

export interface GameState {
  phase: Phase
  turn: number
  epoch: number
  players: PlayerState[]
  activePlayerId: string | null
  grid: unknown[][]
  history: unknown[]
}

export function createInitialGameState(): GameState {
  return {
    phase: 'planning',
    turn: 1,
    epoch: 1,
    players: [],
    activePlayerId: null,
    grid: Array.from({ length: GAME_CONSTANTS.GRID_ROWS }, () =>
      Array.from({ length: GAME_CONSTANTS.GRID_COLS }, () => null)
    ),
    history: [],
  }
}
