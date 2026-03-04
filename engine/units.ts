import { Hex } from './hex';
import { PlayerId } from './player';

export type UnitType =
  | 'drone'
  | 'pulse_sentry'
  | 'arc_ranger'
  | 'phase_walker'
  | 'temporal_warden'
  | 'void_striker'
  | 'flux_weaver'
  | 'chrono_titan';

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
  /** Which structure produces this unit. */
  readonly producedAt: 'barracks' | 'war_foundry';
}

export const UNIT_DEFS: Readonly<Record<UnitType, UnitDef>> = {
  drone: {
    type: 'drone',        label: 'Drone',
    costCC: 2, costFX: 0, techTierRequired: 0,
    maxHp: 15, attack: 3, speed: 2, range: 0, visionRadius: 2,
    producedAt: 'barracks',
  },
  pulse_sentry: {
    type: 'pulse_sentry', label: 'Pulse Sentry',
    costCC: 4, costFX: 0, techTierRequired: 0,
    maxHp: 40, attack: 12, speed: 2, range: 1, visionRadius: 2,
    producedAt: 'barracks',
  },
  arc_ranger: {
    type: 'arc_ranger',   label: 'Arc Ranger',
    costCC: 5, costFX: 0, techTierRequired: 0,
    maxHp: 25, attack: 8, speed: 2, range: 3, visionRadius: 3,
    producedAt: 'barracks',
  },
  phase_walker: {
    type: 'phase_walker', label: 'Phase Walker',
    costCC: 6, costFX: 1, techTierRequired: 1,
    maxHp: 30, attack: 10, speed: 3, range: 1, visionRadius: 2,
    producedAt: 'barracks',
  },
  temporal_warden: {
    type: 'temporal_warden', label: 'Temporal Warden',
    costCC: 5, costFX: 2, techTierRequired: 1,
    maxHp: 35, attack: 6, speed: 2, range: 2, visionRadius: 4,
    producedAt: 'barracks',
  },
  void_striker: {
    type: 'void_striker', label: 'Void Striker',
    costCC: 8, costFX: 3, techTierRequired: 2,
    maxHp: 50, attack: 18, speed: 1, range: 2, visionRadius: 2,
    producedAt: 'war_foundry',
  },
  flux_weaver: {
    type: 'flux_weaver',  label: 'Flux Weaver',
    costCC: 6, costFX: 2, techTierRequired: 2,
    maxHp: 20, attack: 0, speed: 2, range: 3, visionRadius: 2,
    producedAt: 'war_foundry',
  },
  chrono_titan: {
    type: 'chrono_titan', label: 'Chrono Titan',
    costCC: 12, costFX: 5, techTierRequired: 3,
    maxHp: 80, attack: 22, speed: 1, range: 1, visionRadius: 2,
    producedAt: 'war_foundry',
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
  /** True if this unit has a Chrono Shift damage shield (absorbs all damage this epoch). */
  damageShield: boolean;
}
