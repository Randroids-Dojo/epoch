import { Hex } from './hex';
import { PlayerId } from './player';

export type StructureType =
  | 'command_nexus'
  | 'crystal_extractor'
  | 'barracks'
  | 'tech_lab'
  | 'watchtower'
  | 'flux_conduit'
  | 'war_foundry'
  | 'shield_pylon'
  | 'chrono_spire';

export interface StructureDef {
  readonly type: StructureType;
  readonly label: string;
  readonly costCC: number;
  /** Flux cost to build. */
  readonly costFX: number;
  /** Minimum tech tier required to build. */
  readonly techTierRequired: number;
  readonly maxHp: number;
  /** Epochs until construction completes. 0 for Command Nexus (pre-built). */
  readonly buildEpochs: number;
  readonly visionRadius: number;
}

export const STRUCTURE_DEFS: Readonly<Record<StructureType, StructureDef>> = {
  command_nexus:     { type: 'command_nexus',     label: 'Command Nexus',     costCC: 0,  costFX: 0, techTierRequired: 0, maxHp: 100, buildEpochs: 0, visionRadius: 3 },
  crystal_extractor: { type: 'crystal_extractor', label: 'Crystal Extractor', costCC: 3,  costFX: 0, techTierRequired: 0, maxHp: 30,  buildEpochs: 1, visionRadius: 0 },
  barracks:          { type: 'barracks',          label: 'Barracks',          costCC: 5,  costFX: 0, techTierRequired: 0, maxHp: 40,  buildEpochs: 1, visionRadius: 0 },
  tech_lab:          { type: 'tech_lab',          label: 'Tech Lab',          costCC: 6,  costFX: 0, techTierRequired: 0, maxHp: 35,  buildEpochs: 1, visionRadius: 0 },
  watchtower:        { type: 'watchtower',        label: 'Watchtower',        costCC: 3,  costFX: 0, techTierRequired: 0, maxHp: 20,  buildEpochs: 1, visionRadius: 4 },
  flux_conduit:      { type: 'flux_conduit',      label: 'Flux Conduit',      costCC: 4,  costFX: 0, techTierRequired: 1, maxHp: 25,  buildEpochs: 1, visionRadius: 0 },
  war_foundry:       { type: 'war_foundry',       label: 'War Foundry',       costCC: 8,  costFX: 3, techTierRequired: 2, maxHp: 50,  buildEpochs: 2, visionRadius: 0 },
  shield_pylon:      { type: 'shield_pylon',      label: 'Shield Pylon',      costCC: 5,  costFX: 2, techTierRequired: 1, maxHp: 25,  buildEpochs: 1, visionRadius: 0 },
  chrono_spire:      { type: 'chrono_spire',      label: 'Chrono Spire',      costCC: 7,  costFX: 4, techTierRequired: 2, maxHp: 30,  buildEpochs: 2, visionRadius: 0 },
};

export interface Structure {
  readonly id: string;
  readonly owner: PlayerId;
  readonly type: StructureType;
  hex: Hex;
  hp: number;
  /** Epochs of construction remaining. 0 = complete and operational. */
  buildProgress: number;
  /** Drone ID staffing this extractor for harvesting, if any. */
  assignedDroneId: string | null;
}

/** Returns true if the structure is fully built and operational. */
export function isComplete(s: Structure): boolean {
  return s.buildProgress === 0;
}

/** Returns true if the structure harvests resources (CC or FX). */
export function isHarvestable(s: Structure): boolean {
  return s.type === 'crystal_extractor' || s.type === 'flux_conduit';
}
