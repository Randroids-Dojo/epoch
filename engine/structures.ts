import { Hex } from './hex';
import { PlayerId } from './player';

/** MVP structure types. */
export type StructureType =
  | 'command_nexus'
  | 'crystal_extractor'
  | 'barracks'
  | 'tech_lab'
  | 'watchtower';

export interface StructureDef {
  readonly type: StructureType;
  readonly label: string;
  readonly costCC: number;
  readonly maxHp: number;
  /** Epochs until construction completes. 0 for Command Nexus (pre-built). */
  readonly buildEpochs: number;
  readonly visionRadius: number;
}

export const STRUCTURE_DEFS: Readonly<Record<StructureType, StructureDef>> = {
  command_nexus:     { type: 'command_nexus',     label: 'Command Nexus',     costCC: 0, maxHp: 100, buildEpochs: 0, visionRadius: 3 },
  crystal_extractor: { type: 'crystal_extractor', label: 'Crystal Extractor', costCC: 3, maxHp: 30,  buildEpochs: 1, visionRadius: 0 },
  barracks:          { type: 'barracks',          label: 'Barracks',          costCC: 5, maxHp: 40,  buildEpochs: 1, visionRadius: 0 },
  tech_lab:          { type: 'tech_lab',          label: 'Tech Lab',          costCC: 6, maxHp: 35,  buildEpochs: 1, visionRadius: 0 },
  watchtower:        { type: 'watchtower',        label: 'Watchtower',        costCC: 3, maxHp: 20,  buildEpochs: 1, visionRadius: 4 },
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
