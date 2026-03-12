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
  // Phase 3 — Epoch 3: extractor done → gather + train a Pulse Sentry (same turn)
  | 'gather_select_drone'
  | 'gather_select_gather'
  | 'gather_select_target'
  | 'train_select_slot'
  | 'train_select_train'
  | 'train_select_sentry'
  | 'train_lock_in'
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
