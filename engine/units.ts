import { Hex } from './hex';
import { PlayerId } from './player';

/** MVP unit types (Tier 0–1 only). */
export type UnitType = 'drone' | 'pulse_sentry' | 'arc_ranger';

export interface UnitDef {
  readonly type: UnitType;
  readonly label: string;
  readonly costCC: number;
  readonly maxHp: number;
  /** Damage dealt per attack. */
  readonly attack: number;
  /** Hexes moved per epoch. */
  readonly speed: number;
  /** Max attack distance in hexes. 0 = cannot attack. */
  readonly range: number;
  readonly visionRadius: number;
}

export const UNIT_DEFS: Readonly<Record<UnitType, UnitDef>> = {
  drone: {
    type: 'drone',        label: 'Drone',
    costCC: 2,  maxHp: 15,  attack: 3,  speed: 2, range: 0, visionRadius: 2,
  },
  pulse_sentry: {
    type: 'pulse_sentry', label: 'Pulse Sentry',
    costCC: 4,  maxHp: 40,  attack: 12, speed: 2, range: 1, visionRadius: 2,
  },
  arc_ranger: {
    type: 'arc_ranger',   label: 'Arc Ranger',
    costCC: 5,  maxHp: 25,  attack: 8,  speed: 2, range: 3, visionRadius: 3,
  },
};

export interface Unit {
  readonly id: string;
  readonly owner: PlayerId;
  readonly type: UnitType;
  hex: Hex;
  hp: number;
  /** True during the epoch the unit's Defend command resolves (cleared each epoch). */
  isDefending: boolean;
  /** ID of the Crystal Extractor this Drone is assigned to, if any. */
  assignedExtractorId: string | null;
}
