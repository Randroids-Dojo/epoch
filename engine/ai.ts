/**
 * AI Command Generator — supports Novice/Adept/Commander/Epoch Master difficulties
 * and Expander/Aggressor/Technologist/Fortress archetypes (GDD §9.1–9.5).
 *
 * Pure TS, no React. Called once per epoch before resolveEpoch() to populate
 * state.players.ai.commands.
 *
 * Flow:
 *   1. Adapt archetype blend based on player command history (Commander+)
 *   2. Generate all candidate commands with category tags
 *   3. Score candidates via blended archetype weights
 *   4. Greedily pick top-scored candidates while respecting constraints
 *      (budget, unit assignment, build-hex reservation)
 */

import { GameState, findUnitAt, findStructureAt, findNexus, AIArchetype, getOldestSnapshot } from './state';
import { Hex, hexKey, hexDistance, hexEqual, hexesInRange, hexNeighbors } from './hex';
import { Command, UnitCommand, GlobalCommand } from './commands';
import { Unit, UNIT_DEFS, UnitType } from './units';
import { Structure, StructureType, STRUCTURE_DEFS, isComplete, isHarvestable } from './structures';
import { TERRAIN } from './terrain';
import { PlayerId } from './player';
import { AIDifficulty } from './state';

// ── AI Visibility ─────────────────────────────────────────────────────────────

/** Returns the set of hex keys currently visible to the given player. */
export function computeVisibility(state: GameState, owner: PlayerId): Set<string> {
  const visible = new Set<string>();

  for (const unit of state.units.values()) {
    if (unit.owner !== owner) continue;
    const radius = UNIT_DEFS[unit.type].visionRadius;
    for (const h of hexesInRange(unit.hex, radius)) {
      const key = hexKey(h);
      if (state.map.cells.has(key)) visible.add(key);
    }
  }

  for (const s of state.structures.values()) {
    if (s.owner !== owner || !isComplete(s)) continue;
    const def = STRUCTURE_DEFS[s.type];
    if (def.visionRadius <= 0) continue;
    for (const h of hexesInRange(s.hex, def.visionRadius)) {
      const key = hexKey(h);
      if (state.map.cells.has(key)) visible.add(key);
    }
  }

  return visible;
}

// ── Action Categories & Archetype Weights ─────────────────────────────────────

type ActionCategory =
  | 'gather'
  | 'buildEconomy'
  | 'buildMilitary'
  | 'buildTech'
  | 'buildDefense'
  | 'trainCombat'
  | 'trainDrone'
  | 'research'
  | 'attack'
  | 'moveAggressive'
  | 'moveExpand'
  | 'defend'
  | 'temporal';

const ARCHETYPE_WEIGHTS: Record<AIArchetype, Record<ActionCategory, number>> = {
  expander: {
    gather: 3.0, buildEconomy: 3.0, buildMilitary: 1.0, buildTech: 0.5,
    buildDefense: 0.3, trainCombat: 0.8, trainDrone: 2.0, research: 0.5,
    attack: 0.5, moveAggressive: 0.4, moveExpand: 2.0, defend: 0.5, temporal: 0.3,
  },
  aggressor: {
    gather: 0.5, buildEconomy: 0.4, buildMilitary: 2.0, buildTech: 0.2,
    buildDefense: 0.2, trainCombat: 3.0, trainDrone: 0.3, research: 0.2,
    attack: 3.0, moveAggressive: 2.5, moveExpand: 0.3, defend: 0.3, temporal: 0.4,
  },
  technologist: {
    gather: 1.0, buildEconomy: 0.8, buildMilitary: 0.6, buildTech: 3.0,
    buildDefense: 0.4, trainCombat: 1.0, trainDrone: 0.6, research: 3.0,
    attack: 0.6, moveAggressive: 0.4, moveExpand: 0.5, defend: 0.5, temporal: 3.0,
  },
  fortress: {
    gather: 1.0, buildEconomy: 0.6, buildMilitary: 1.2, buildTech: 0.6,
    buildDefense: 3.0, trainCombat: 1.0, trainDrone: 0.6, research: 0.8,
    attack: 0.3, moveAggressive: 0.2, moveExpand: 0.5, defend: 3.0, temporal: 0.6,
  },
};

function blendedWeight(
  category: ActionCategory,
  blend: Record<AIArchetype, number>,
): number {
  let score = 0;
  for (const arch of Object.keys(ARCHETYPE_WEIGHTS) as AIArchetype[]) {
    score += (blend[arch] ?? 0) * ARCHETYPE_WEIGHTS[arch][category];
  }
  return score;
}

// ── Type guard ────────────────────────────────────────────────────────────────

function isUnitOrderCommand(cmd: Command): cmd is UnitCommand {
  return (
    cmd.type === 'move' || cmd.type === 'attack' || cmd.type === 'gather' ||
    cmd.type === 'defend' || cmd.type === 'build' || cmd.type === 'chrono_shift'
  );
}

// ── Candidate Type ────────────────────────────────────────────────────────────

interface ScoredCandidate {
  command: Command;
  category: ActionCategory;
  /** Higher = more important within its category (tie-break). 0–10 scale. */
  basePriority: number;
  costCC: number;
  costFX: number;
  costTE: number;
  /** Units consumed by this command (prevent double-assignment). */
  unitIds: string[];
  /** Build hex key (prevent double-building on same hex). */
  buildHexKey?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getUnits(state: GameState, owner: PlayerId): Unit[] {
  return [...state.units.values()].filter((u) => u.owner === owner);
}

function getStructures(state: GameState, owner: PlayerId): Structure[] {
  return [...state.structures.values()].filter((s) => s.owner === owner);
}

function findEmptyPassableHex(state: GameState, center: Hex): Hex | null {
  const candidates = [center, ...hexNeighbors(center)];
  for (const h of candidates) {
    const key = hexKey(h);
    const cell = state.map.cells.get(key);
    if (!cell || !TERRAIN[cell.terrain].passable) continue;
    if (findUnitAt(state, h) !== undefined) continue;
    if (findStructureAt(state, h) !== undefined) continue;
    return h;
  }
  return null;
}

function findNearbyCrystalNodes(
  state: GameState,
  owner: PlayerId,
  maxDist: number,
): Hex[] {
  const nodes: Hex[] = [];
  const seen = new Set<string>();
  const sources: Hex[] = [];

  for (const u of state.units.values()) {
    if (u.owner === owner) sources.push(u.hex);
  }
  for (const s of state.structures.values()) {
    if (s.owner === owner) sources.push(s.hex);
  }

  for (const [key, cell] of state.map.cells) {
    if (cell.terrain !== 'crystal_node') continue;
    if (seen.has(key)) continue;
    for (const src of sources) {
      if (hexDistance(src, cell.hex) <= maxDist) {
        nodes.push(cell.hex);
        seen.add(key);
        break;
      }
    }
  }
  return nodes;
}

/** Find the closest idle drone to the given hex for a build assignment. */
function findClosestDrone(drones: Unit[], targetHex: Hex): Unit | null {
  let best: Unit | null = null;
  let bestDist = Infinity;
  for (const d of drones) {
    const dist = hexDistance(d.hex, targetHex);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

function findNearestCrystalNode(state: GameState, from: Hex): Hex | null {
  let best: Hex | null = null;
  let bestDist = Infinity;
  for (const cell of state.map.cells.values()) {
    if (cell.terrain !== 'crystal_node') continue;
    const d = hexDistance(from, cell.hex);
    if (d < bestDist) { bestDist = d; best = cell.hex; }
  }
  return best;
}

// ── Adaptation System (GDD §9.3) ──────────────────────────────────────────────

function shiftBlend(
  blend: Record<AIArchetype, number>,
  toward: AIArchetype,
  amount: number,
): void {
  const others = (Object.keys(blend) as AIArchetype[]).filter((a) => a !== toward);
  const totalOthers = others.reduce((s, a) => s + blend[a], 0);
  if (totalOthers === 0) return;
  const actualShift = Math.min(amount, 1 - blend[toward]);
  for (const a of others) {
    blend[a] -= actualShift * (blend[a] / totalOthers);
  }
  blend[toward] += actualShift;
}

function adaptBlend(state: GameState): void {
  const history = state.aiConfig.playerCommandHistory;
  if (history.length === 0) return;

  let totalGatherBuild = 0;
  let totalAttackMove = 0;
  let totalTemporal = 0;
  let total = 0;

  for (const epoch of history) {
    totalGatherBuild += epoch.gather + epoch.build;
    totalAttackMove += epoch.attack + epoch.move;
    totalTemporal += epoch.temporal;
    total += epoch.gather + epoch.build + epoch.train + epoch.move + epoch.attack + epoch.temporal;
  }
  if (total === 0) return;

  const blend = state.aiConfig.archetypeBlend;
  const SHIFT = 0.1;

  if (totalGatherBuild / total > 0.5) {
    // Player is building economy — punish with Aggressor
    shiftBlend(blend, 'aggressor', SHIFT);
  } else if (totalAttackMove / total > 0.5) {
    // Player is attacking — absorb with Fortress
    shiftBlend(blend, 'fortress', SHIFT);
  } else if (totalTemporal / total > 0.25) {
    // Player is using lots of temporal — outpace with Expander
    shiftBlend(blend, 'expander', SHIFT);
  }
  // Balanced play: no shift
}

// ── Candidate Generation ──────────────────────────────────────────────────────

function generateCandidates(
  state: GameState,
  difficulty: AIDifficulty,
  aiUnits: Unit[],
  aiStructures: Structure[],
  visibility: Set<string>,
): ScoredCandidate[] {
  const ai = state.players.ai;
  const candidates: ScoredCandidate[] = [];
  const nexus = findNexus(state, 'ai');

  // ── Gather ─────────────────────────────────────────────────────────────────
  // Pair each unstaffed extractor with one idle drone (one candidate per pair,
  // not the full cross-product — the greedy picker handles conflict avoidance).
  // Reserve one drone per critical production structure that hasn't been started
  // yet, so gathering doesn't permanently consume the only build-capable unit.
  const CRITICAL_PRODUCTION: StructureType[] = ['barracks'];
  if (ai.techTier >= 2) CRITICAL_PRODUCTION.push('war_foundry');
  // Only reserve a drone for a critical build if the AI can actually afford it.
  // If it's broke, let the drone gather so it can earn enough CC to build later.
  const reservedForBuilds = CRITICAL_PRODUCTION.filter((type) => {
    if (aiStructures.some((s) => s.type === type)) return false; // already exists
    const cost = STRUCTURE_DEFS[type].costCC;
    return ai.resources.cc >= cost; // only reserve if affordable right now
  }).length;

  const completedExtractors = aiStructures.filter(
    (s) => isHarvestable(s) && isComplete(s) && !s.assignedDroneId,
  );
  const idleDrones = aiUnits.filter(
    (u) => u.type === 'drone' && !u.assignedExtractorId,
  );
  {
    const availableDrones = idleDrones.slice(reservedForBuilds);
    for (const extractor of completedExtractors) {
      const drone = availableDrones.shift();
      if (!drone) break;
      candidates.push({
        command: { type: 'gather', unitId: drone.id, targetHex: extractor.hex },
        category: 'gather',
        basePriority: 10,
        costCC: 0, costFX: 0, costTE: 0,
        unitIds: [drone.id],
      });
    }
  }

  // ── Build Economy (Crystal Extractors) ────────────────────────────────────
  // Build candidates require an idle drone. We find the closest one per target.
  // Limit to one extractor until military production is established — otherwise
  // the Expander AI spends every CC on extractors and can never afford a barracks.
  const hasMilitaryProduction = aiStructures.some(
    (s) => s.type === 'barracks' || s.type === 'war_foundry',
  );
  const alreadyHasExtractor = aiStructures.some((s) => s.type === 'crystal_extractor');
  const crystalNodes = findNearbyCrystalNodes(state, 'ai', 6);
  const extractorCost = STRUCTURE_DEFS.crystal_extractor.costCC;

  for (const nodeHex of crystalNodes) {
    if (!hasMilitaryProduction && alreadyHasExtractor) break; // one extractor is enough until barracks
    if (findStructureAt(state, nodeHex) !== undefined) continue;
    const buildHex = findEmptyPassableHex(state, nodeHex);
    if (!buildHex) continue;
    const drone = findClosestDrone(idleDrones, buildHex);
    if (!drone) continue;
    const bk = hexKey(buildHex);
    candidates.push({
      command: { type: 'build', unitId: drone.id, targetHex: buildHex, structureType: 'crystal_extractor' },
      category: 'buildEconomy',
      basePriority: 8,
      costCC: extractorCost, costFX: 0, costTE: 0,
      unitIds: [drone.id],
      buildHexKey: bk,
    });
  }

  if (nexus) {
    // ── Build Military (Barracks) ──────────────────────────────────────────
    if (!aiStructures.some((s) => s.type === 'barracks')) {
      const def = STRUCTURE_DEFS.barracks;
      const bHex = findEmptyPassableHex(state, nexus.hex);
      if (bHex) {
        const drone = findClosestDrone(idleDrones, bHex);
        if (drone) candidates.push({
          command: { type: 'build', unitId: drone.id, targetHex: bHex, structureType: 'barracks' },
          category: 'buildMilitary',
          basePriority: 9,
          costCC: def.costCC, costFX: def.costFX, costTE: 0,
          unitIds: [drone.id],
          buildHexKey: hexKey(bHex),
        });
      }
    }

    // ── Build Tech (Tech Lab + Chrono Spire) ──────────────────────────────
    // Tech lab requires barracks first — no point researching without an army.
    if (aiStructures.some((s) => s.type === 'barracks') && !aiStructures.some((s) => s.type === 'tech_lab')) {
      const def = STRUCTURE_DEFS.tech_lab;
      const bHex = findEmptyPassableHex(state, nexus.hex);
      if (bHex) {
        const drone = findClosestDrone(idleDrones, bHex);
        if (drone) candidates.push({
          command: { type: 'build', unitId: drone.id, targetHex: bHex, structureType: 'tech_lab' },
          category: 'buildTech',
          // Elevated priority so it beats moveExpand (2.0×5=10) even for Expander (0.5×22=11).
          basePriority: 22,
          costCC: def.costCC, costFX: def.costFX, costTE: 0,
          unitIds: [drone.id],
          buildHexKey: hexKey(bHex),
        });
      }
    }
    if (ai.techTier >= 2 && !aiStructures.some((s) => s.type === 'chrono_spire')) {
      const def = STRUCTURE_DEFS.chrono_spire;
      if (def) {
        const bHex = findEmptyPassableHex(state, nexus.hex);
        if (bHex) {
          const drone = findClosestDrone(idleDrones, bHex);
          if (drone) candidates.push({
            command: { type: 'build', unitId: drone.id, targetHex: bHex, structureType: 'chrono_spire' },
            category: 'buildTech',
            basePriority: 7,
            costCC: def.costCC, costFX: def.costFX, costTE: 0,
            unitIds: [drone.id],
            buildHexKey: hexKey(bHex),
          });
        }
      }
    }

    // ── Build Defense (Shield Pylon, War Foundry) ──────────────────────────
    if (ai.techTier >= 1 && !aiStructures.some((s) => s.type === 'shield_pylon')) {
      const def = STRUCTURE_DEFS.shield_pylon;
      const bHex = findEmptyPassableHex(state, nexus.hex);
      if (bHex) {
        const drone = findClosestDrone(idleDrones, bHex);
        if (drone) candidates.push({
          command: { type: 'build', unitId: drone.id, targetHex: bHex, structureType: 'shield_pylon' },
          category: 'buildDefense',
          basePriority: 8,
          costCC: def.costCC, costFX: def.costFX, costTE: 0,
          unitIds: [drone.id],
          buildHexKey: hexKey(bHex),
        });
      }
    }
    if (ai.techTier >= 2 && !aiStructures.some((s) => s.type === 'war_foundry')) {
      const def = STRUCTURE_DEFS.war_foundry;
      const bHex = findEmptyPassableHex(state, nexus.hex);
      if (bHex) {
        const drone = findClosestDrone(idleDrones, bHex);
        if (drone) candidates.push({
          command: { type: 'build', unitId: drone.id, targetHex: bHex, structureType: 'war_foundry' },
          category: 'buildMilitary',
          basePriority: 8,
          costCC: def.costCC, costFX: def.costFX, costTE: 0,
          unitIds: [drone.id],
          buildHexKey: hexKey(bHex),
        });
      }
    }
  }

  // ── Train ─────────────────────────────────────────────────────────────────
  const barracks = aiStructures.find((s) => s.type === 'barracks' && isComplete(s));
  const warFoundry = aiStructures.find((s) => s.type === 'war_foundry' && isComplete(s));

  const unstaffedCount = aiStructures.filter(
    (s) => isHarvestable(s) && isComplete(s) && !s.assignedDroneId,
  ).length;
  const freeDrones = aiUnits.filter(
    (u) => u.type === 'drone' && !u.assignedExtractorId,
  ).length;
  // Also need a drone if critical builds are pending and none are idle —
  // train one extra drone to free the gatherer from double-duty as builder.
  // Cap at one spare: only trigger if total drones ≤ total extractors, preventing
  // a runaway loop where each new drone builds another extractor, needing another drone.
  const criticalBuildPending = nexus !== null && !aiStructures.some((s) => s.type === 'tech_lab');
  const totalDrones = aiUnits.filter((u) => u.type === 'drone').length;
  const allExtractorCount = aiStructures.filter((s) => isHarvestable(s)).length;
  const needDrones =
    unstaffedCount > freeDrones ||
    (criticalBuildPending && idleDrones.length === 0 && totalDrones <= allExtractorCount);

  if (barracks) {
    if (needDrones) {
      const d = UNIT_DEFS.drone;
      candidates.push({
        command: { type: 'train', structureId: barracks.id, unitType: 'drone' },
        category: 'trainDrone',
        basePriority: 10,
        costCC: d.costCC, costFX: d.costFX, costTE: 0,
        unitIds: [],
      });
    } else {
      // Combat units from barracks
      const combatTypes: UnitType[] = ai.techTier >= 1
        ? ['phase_walker', 'arc_ranger', 'pulse_sentry']
        : ['arc_ranger', 'pulse_sentry'];
      for (const ut of combatTypes) {
        const ud = UNIT_DEFS[ut];
        candidates.push({
          command: { type: 'train', structureId: barracks.id, unitType: ut },
          category: 'trainCombat',
          basePriority: ut === 'phase_walker' ? 8 : ut === 'arc_ranger' ? 7 : 6,
          costCC: ud.costCC, costFX: ud.costFX, costTE: 0,
          unitIds: [],
        });
      }
    }
  }

  if (warFoundry && ai.techTier >= 2) {
    const foundryTypes: UnitType[] =
      ai.techTier >= 3
        ? ['chrono_titan', 'void_striker', 'flux_weaver']
        : ['void_striker', 'flux_weaver'];
    for (const ut of foundryTypes) {
      const ud = UNIT_DEFS[ut];
      candidates.push({
        command: { type: 'train', structureId: warFoundry.id, unitType: ut },
        category: 'trainCombat',
        basePriority: ut === 'chrono_titan' ? 9 : ut === 'void_striker' ? 8 : 7,
        costCC: ud.costCC, costFX: ud.costFX, costTE: 0,
        unitIds: [],
      });
    }
  }

  // ── Research ──────────────────────────────────────────────────────────────
  if (
    ai.techTier < 3 &&
    ai.researchEpochsLeft === 0 &&
    aiStructures.some((s) => s.type === 'tech_lab' && isComplete(s))
  ) {
    candidates.push({
      command: { type: 'research' },
      category: 'research',
      basePriority: 9,
      costCC: 0, costFX: 0, costTE: 0,
      unitIds: [],
    });
  }

  // ── Attack ────────────────────────────────────────────────────────────────
  const enemyUnitByHex = new Map<string, Unit>();
  const enemyStructByHex = new Map<string, Structure>();
  for (const u of state.units.values()) {
    if (u.owner === 'player') enemyUnitByHex.set(hexKey(u.hex), u);
  }
  for (const s of state.structures.values()) {
    if (s.owner === 'player') enemyStructByHex.set(hexKey(s.hex), s);
  }

  const combatUnits = aiUnits.filter((u) => UNIT_DEFS[u.type].range > 0);
  for (const unit of combatUnits) {
    const def = UNIT_DEFS[unit.type];
    for (const vKey of visibility) {
      const enemyUnit = enemyUnitByHex.get(vKey);
      if (enemyUnit) {
        const d = hexDistance(unit.hex, enemyUnit.hex);
        if (d <= def.range) {
          candidates.push({
            command: { type: 'attack', unitId: unit.id, targetHex: enemyUnit.hex },
            category: 'attack',
            basePriority: 10 - Math.min(d, 9),
            costCC: 0, costFX: 0, costTE: 0,
            unitIds: [unit.id],
          });
        }
      }
      const enemyStruct = enemyStructByHex.get(vKey);
      if (enemyStruct) {
        const d = hexDistance(unit.hex, enemyStruct.hex);
        if (d <= def.range) {
          // Prefer attacking nexus > other structures
          const priority = enemyStruct.type === 'command_nexus' ? 9 : 7;
          candidates.push({
            command: { type: 'attack', unitId: unit.id, targetHex: enemyStruct.hex },
            category: 'attack',
            basePriority: priority,
            costCC: 0, costFX: 0, costTE: 0,
            unitIds: [unit.id],
          });
        }
      }
    }
  }

  // ── Move — Aggressive (toward player base) ────────────────────────────────
  for (const unit of combatUnits) {
    const dist = hexDistance(unit.hex, { q: 0, r: 0 });
    const target = dist <= 3 ? state.map.playerStart : { q: 0, r: 0 };
    if (!hexEqual(unit.hex, target)) {
      candidates.push({
        command: { type: 'move', unitId: unit.id, targetHex: target },
        category: 'moveAggressive',
        basePriority: 5,
        costCC: 0, costFX: 0, costTE: 0,
        unitIds: [unit.id],
      });
    }
  }

  // ── Move — Expand (toward crystal nodes) ──────────────────────────────────
  for (const unit of aiUnits) {
    if (unit.type !== 'drone') continue;
    const target = findNearestCrystalNode(state, unit.hex);
    if (target && !hexEqual(unit.hex, target)) {
      candidates.push({
        command: { type: 'move', unitId: unit.id, targetHex: target },
        category: 'moveExpand',
        basePriority: 5,
        costCC: 0, costFX: 0, costTE: 0,
        unitIds: [unit.id],
      });
    }
  }

  // ── Defend ────────────────────────────────────────────────────────────────
  if (nexus) {
    const threatNearby = [...visibility].some((vKey) => {
      const enemy = enemyUnitByHex.get(vKey);
      return enemy && hexDistance(enemy.hex, nexus.hex) <= 4;
    });
    if (threatNearby) {
      for (const unit of aiUnits) {
        if (hexDistance(unit.hex, nexus.hex) <= 3) {
          candidates.push({
            command: { type: 'defend', unitId: unit.id },
            category: 'defend',
            basePriority: 9,
            costCC: 0, costFX: 0, costTE: 0,
            unitIds: [unit.id],
          });
        }
      }
    } else {
      // Fortress archetype: add baseline defend candidates even without threat
      for (const unit of aiUnits) {
        if (hexDistance(unit.hex, nexus.hex) <= 2) {
          candidates.push({
            command: { type: 'defend', unitId: unit.id },
            category: 'defend',
            basePriority: 3,
            costCC: 0, costFX: 0, costTE: 0,
            unitIds: [unit.id],
          });
        }
      }
    }
  }

  // ── Temporal (Commander+ only) ─────────────────────────────────────────────
  if (difficulty === 'commander' || difficulty === 'epoch_master') {
    const oldestSnapshot = getOldestSnapshot(state);
    if (oldestSnapshot && ai.resources.te >= 3) {
      // Find damaged AI units that have a 2-epoch snapshot
      for (const unit of aiUnits) {
        if (!oldestSnapshot.has(unit.id)) continue;
        const def = UNIT_DEFS[unit.type];
        const hpRatio = unit.hp / def.maxHp;
        if (hpRatio < 0.6) {
          // Damaged — good candidate for Chrono Shift
          candidates.push({
            command: { type: 'chrono_shift', unitId: unit.id },
            category: 'temporal',
            basePriority: Math.round((1 - hpRatio) * 10),
            costCC: 0, costFX: 0, costTE: 3,
            unitIds: [unit.id],
          });
        }
      }
    }
  }

  return candidates;
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/** Fill state.players.ai.unitOrders and globalCommands for this epoch. */
export function generateAICommands(state: GameState): void {
  const ai = state.players.ai;
  const { difficulty, archetypeBlend } = state.aiConfig;

  // 1. Adapt blend based on player history (Commander+).
  if (difficulty === 'commander' || difficulty === 'epoch_master') {
    adaptBlend(state);
  }

  const aiUnits = getUnits(state, 'ai');
  const aiStructures = getStructures(state, 'ai');
  const visibility = computeVisibility(state, 'ai');

  // 2. Generate all candidates.
  const candidates = generateCandidates(state, difficulty, aiUnits, aiStructures, visibility);

  // 3. Pre-compute blended weight per category.
  const categoryWeight: Partial<Record<ActionCategory, number>> = {};
  for (const cand of candidates) {
    if (!(cand.category in categoryWeight)) {
      categoryWeight[cand.category] = blendedWeight(cand.category, archetypeBlend);
    }
  }
  const scored = candidates.map((c) => ({
    ...c,
    finalScore: (categoryWeight[c.category] ?? 0) * c.basePriority,
  }));

  // 4. Sort descending by finalScore.
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // 5. Greedily pick, routing unit commands to unitOrders and global commands to globalCommands.
  const unitOrders = new Map<string, UnitCommand>();
  const globalCommands: Array<GlobalCommand | null> = Array(ai.commandSlots).fill(null);
  let globalSlot = 0;
  let budgetCC = ai.resources.cc;
  let budgetTE = ai.resources.te;
  const assignedUnits = new Set<string>();
  const plannedBuildHexes = new Set<string>();
  const trainingStructures = new Set<string>();

  for (const cand of scored) {
    // Constraint: budget
    if (cand.costCC > budgetCC) continue;
    if (cand.costTE > budgetTE) continue;
    if (cand.costFX > ai.resources.fx) continue;

    // Constraint: unit already assigned
    if (cand.unitIds.some((id) => assignedUnits.has(id))) continue;

    // Constraint: build hex already planned
    if (cand.buildHexKey && plannedBuildHexes.has(cand.buildHexKey)) continue;

    if (isUnitOrderCommand(cand.command)) {
      // Unit commands go into unitOrders (one per unit, unlimited slots).
      unitOrders.set(cand.command.unitId, cand.command);
    } else {
      // Global commands consume a global slot.
      if (globalSlot >= ai.commandSlots) continue;

      // Constraint: only one train per structure per epoch.
      if (cand.command.type === 'train') {
        const structId = cand.command.structureId;
        if (trainingStructures.has(structId)) continue;
        trainingStructures.add(structId);
      }

      globalCommands[globalSlot++] = cand.command as GlobalCommand;
    }

    budgetCC -= cand.costCC;
    budgetTE -= cand.costTE;
    for (const id of cand.unitIds) assignedUnits.add(id);
    if (cand.buildHexKey) plannedBuildHexes.add(cand.buildHexKey);
  }

  state.players.ai.unitOrders = unitOrders;
  state.players.ai.globalCommands = globalCommands;
}
