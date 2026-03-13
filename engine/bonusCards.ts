import { GameState, newId } from './state';
import { UNIT_DEFS } from './units';
import { hexKey } from './hex';
import { isComplete } from './structures';

// ── Types ────────────────────────────────────────────────────────────────────

export type BonusCardId =
  | 'temporal_surge'
  | 'crystal_windfall'
  | 'drone_swarm'
  | 'phase_rift'
  | 'chrono_harvest';

export type SwipeDirection = 'left' | 'right';

export interface BonusCardOption {
  label: string;
  description: string;
}

export interface BonusCardDef {
  id: BonusCardId;
  title: string;
  /** Short flavour text shown on the card. */
  flavour: string;
  /** ASCII art lines rendered on the card face. */
  art: string[];
  left: BonusCardOption;
  right: BonusCardOption;
}

/** A card that has been drawn and is waiting for the player to swipe. */
export interface PendingBonusCard {
  card: BonusCardDef;
  epoch: number;
}

// ── Card Definitions ─────────────────────────────────────────────────────────

export const BONUS_CARDS: Record<BonusCardId, BonusCardDef> = {
  temporal_surge: {
    id: 'temporal_surge',
    title: 'TEMPORAL SURGE',
    flavour: 'The timeline crackles with latent energy...',
    art: [
      '    .  *  .    ',
      '  ~  / | \\  ~ ',
      ' ~ / --|-- \\ ~ ',
      '  ~  \\ | /  ~ ',
      '    *  .  *    ',
    ],
    left: {
      label: '+1 TE PER EPOCH',
      description: 'Permanent chrono regen boost',
    },
    right: {
      label: '+1 COMMAND SLOT',
      description: 'Expand your tactical reach',
    },
  },

  crystal_windfall: {
    id: 'crystal_windfall',
    title: 'CRYSTAL WINDFALL',
    flavour: 'A vein of chrono crystals erupts from the rift...',
    art: [
      '      /\\      ',
      '    /    \\    ',
      '   / /\\ /\\ \\  ',
      '  / /  V  \\ \\ ',
      ' /____________\\',
    ],
    left: {
      label: '+8 CHRONO CRYSTALS',
      description: 'Raw materials for expansion',
    },
    right: {
      label: '+4 FLUX',
      description: 'Advanced resources unlocked',
    },
  },

  drone_swarm: {
    id: 'drone_swarm',
    title: 'DRONE SWARM',
    flavour: 'Dormant drones stir in the wreckage...',
    art: [
      '  [o]   [o]   ',
      '   |  X  |    ',
      '  [o]   [o]   ',
      '   |  X  |    ',
      '  [o]   [o]   ',
    ],
    left: {
      label: '+2 FREE DRONES',
      description: 'Instant worker reinforcements',
    },
    right: {
      label: 'FORTIFY DRONES +5 HP',
      description: 'Harden all drones for survival',
    },
  },

  phase_rift: {
    id: 'phase_rift',
    title: 'PHASE RIFT',
    flavour: 'Reality shimmers and bends...',
    art: [
      '  >>>===<<<   ',
      ' >>  |||  <<  ',
      '>>   |||   << ',
      ' >>  |||  <<  ',
      '  >>>===<<<   ',
    ],
    left: {
      label: 'SHIELDS UP',
      description: 'All units gain a damage shield',
    },
    right: {
      label: '+3 UNIT HP',
      description: 'Reinforce all combat units',
    },
  },

  chrono_harvest: {
    id: 'chrono_harvest',
    title: 'CHRONO HARVEST',
    flavour: 'Time folds, accelerating all processes...',
    art: [
      '   ___===___  ',
      '  |  CLOCK  | ',
      '  |  12:00  | ',
      '  |  >>>>>>  |',
      '  |_________|',
    ],
    left: {
      label: 'RUSH BUILD',
      description: 'All structures finish instantly',
    },
    right: {
      label: '+5 CC, +2 FX, +1 TE',
      description: 'A balanced resource infusion',
    },
  },
};

// ── Interval Logic ───────────────────────────────────────────────────────────

/** Bonus cards appear every BONUS_INTERVAL epochs, starting at epoch START_EPOCH. */
const BONUS_INTERVAL = 4;
const START_EPOCH = 4;

/** Returns true if a bonus card should be offered after completing the given epoch. */
export function shouldOfferBonusCard(completedEpoch: number): boolean {
  return completedEpoch >= START_EPOCH && completedEpoch % BONUS_INTERVAL === 0;
}

/** Fixed card rotation order. drone_swarm first since it's a good early-game bonus. */
const CARD_SEQUENCE: BonusCardId[] = [
  'drone_swarm',
  'crystal_windfall',
  'temporal_surge',
  'phase_rift',
  'chrono_harvest',
];

/** Pick a bonus card for the given epoch. Cycles through CARD_SEQUENCE in order. */
export function drawBonusCard(completedEpoch: number): PendingBonusCard {
  // Bonus card index: epoch 4 → 0, epoch 8 → 1, epoch 12 → 2, ...
  const bonusIndex = (completedEpoch / BONUS_INTERVAL) - 1;
  const id = CARD_SEQUENCE[bonusIndex % CARD_SEQUENCE.length];
  return { card: BONUS_CARDS[id], epoch: completedEpoch };
}

// ── Apply Bonus ──────────────────────────────────────────────────────────────

/** Mutates `state` to apply the chosen bonus to the human player. */
export function applyBonusCard(
  state: GameState,
  cardId: BonusCardId,
  direction: SwipeDirection,
): string {
  const player = state.players.player;

  switch (cardId) {
    case 'temporal_surge': {
      if (direction === 'left') {
        player.bonusTeRegen += 1;
        return '+1 TE per epoch (permanent)';
      }
      player.commandSlots += 1;
      player.globalCommands = [...player.globalCommands, null];
      return '+1 Command Slot';
    }

    case 'crystal_windfall': {
      if (direction === 'left') {
        player.resources.cc += 8;
        return '+8 Chrono Crystals';
      }
      player.resources.fx += 4;
      return '+4 Flux';
    }

    case 'drone_swarm': {
      if (direction === 'left') {
        // Spawn 2 drones near the player start hex.
        const startHex = state.map.playerStart;
        const droneDef = UNIT_DEFS.drone;
        let spawned = 0;
        // Try adjacent hexes, fall back to start.
        const candidates = [
          { q: startHex.q + 1, r: startHex.r },
          { q: startHex.q - 1, r: startHex.r },
          { q: startHex.q, r: startHex.r + 1 },
          { q: startHex.q, r: startHex.r - 1 },
          startHex,
        ];
        for (const hex of candidates) {
          if (spawned >= 2) break;
          if (!state.map.cells.has(hexKey(hex))) continue;
          const id = newId('u');
          state.units.set(id, {
            id,
            owner: 'player',
            type: 'drone',
            hex,
            hp: droneDef.maxHp,
            isDefending: false,
            assignedExtractorId: null,
            damageShield: false,
            mergeCount: 0,
            bonusMaxHp: 0,
            bonusAttack: 0,
          });
          spawned++;
        }
        return `+${spawned} Drones spawned`;
      }
      // Fortify all player drones.
      for (const u of state.units.values()) {
        if (u.owner === 'player' && u.type === 'drone') {
          u.hp += 5;
          u.bonusMaxHp += 5;
        }
      }
      return 'All drones +5 HP';
    }

    case 'phase_rift': {
      if (direction === 'left') {
        // Give all player units a damage shield.
        for (const u of state.units.values()) {
          if (u.owner === 'player') {
            u.damageShield = true;
          }
        }
        return 'All units shielded';
      }
      // +3 HP to all combat (non-drone) units.
      let buffed = 0;
      for (const u of state.units.values()) {
        if (u.owner === 'player' && u.type !== 'drone') {
          u.hp += 3;
          u.bonusMaxHp += 3;
          buffed++;
        }
      }
      return `+3 HP to ${buffed} unit${buffed !== 1 ? 's' : ''}`;
    }

    case 'chrono_harvest': {
      if (direction === 'left') {
        // Instant-finish all player structures under construction.
        let rushed = 0;
        for (const s of state.structures.values()) {
          if (s.owner === 'player' && !isComplete(s)) {
            s.buildProgress = 0;
            rushed++;
          }
        }
        return rushed > 0 ? `${rushed} structure${rushed !== 1 ? 's' : ''} completed` : 'No structures to rush';
      }
      player.resources.cc += 5;
      player.resources.fx += 2;
      player.resources.te += 1;
      return '+5 CC, +2 FX, +1 TE';
    }
  }
}
