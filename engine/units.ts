import { Hex } from './hex';
import { PlayerId } from './player';

export type UnitType =
  | 'drone'
  | 'pulse_sentry'
  | 'arc_ranger'
  | 'phase_walker'
  | 'temporal_warden';

export interface UnitDef {
  readonly type: UnitType;
  readonly label: string;
  readonly costCC: number;
  /** Flux cost to train. */
  readonly costFX: number;
  /** Minimum tech tier required to train. */
  readonly techTierRequired: number;
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
    costCC: 2, costFX: 0, techTierRequired: 0,
    maxHp: 15, attack: 3, speed: 2, range: 0, visionRadius: 2,
  },
  pulse_sentry: {
    type: 'pulse_sentry', label: 'Pulse Sentry',
    costCC: 4, costFX: 0, techTierRequired: 0,
    maxHp: 40, attack: 12, speed: 2, range: 1, visionRadius: 2,
  },
  arc_ranger: {
    type: 'arc_ranger',   label: 'Arc Ranger',
    costCC: 5, costFX: 0, techTierRequired: 0,
    maxHp: 25, attack: 8, speed: 2, range: 3, visionRadius: 3,
  },
  phase_walker: {
    type: 'phase_walker', label: 'Phase Walker',
    costCC: 6, costFX: 1, techTierRequired: 1,
    maxHp: 30, attack: 10, speed: 3, range: 1, visionRadius: 2,
  },
  temporal_warden: {
    type: 'temporal_warden', label: 'Temporal Warden',
    costCC: 5, costFX: 2, techTierRequired: 1,
    maxHp: 35, attack: 6, speed: 2, range: 2, visionRadius: 4,
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
