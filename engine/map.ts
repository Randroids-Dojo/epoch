import { Hex, hexKey, hexesInRange } from './hex';
import { TerrainType } from './terrain';

export type FogState = 'unexplored' | 'explored' | 'visible';

export interface HexCell {
  readonly hex: Hex;
  terrain: TerrainType;
  fog: FogState;
}

export interface GameMap {
  readonly cols: number;
  readonly rows: number;
  readonly cells: Map<string, HexCell>;
  readonly playerStart: Hex;
  readonly aiStart: Hex;
  readonly seed: number;
}

/** Deterministic linear congruential PRNG. */
function makePrng(seed: number) {
  let s = seed >>> 0;
  return (): number => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Generate a procedural, 180°-rotationally-symmetric hex map.
 *
 * Grid: axial coords with q ∈ [-halfCols, halfCols) and r ∈ [-halfRows, halfRows).
 * Mirror symmetry: hex (q,r) mirrors to (-q,-r) around the map center.
 */
export function generateMap(seed: number = Date.now()): GameMap {
  const cols = 24;
  const rows = 20;
  const rng = makePrng(seed);
  const cells = new Map<string, HexCell>();

  const halfCols = cols / 2;
  const halfRows = rows / 2;

  for (let r = -halfRows; r < halfRows; r++) {
    for (let q = -halfCols; q < halfCols; q++) {
      const hex: Hex = { q, r };
      cells.set(hexKey(hex), { hex, terrain: 'open', fog: 'unexplored' });
    }
  }

  // Starting positions — symmetric around (0,0).
  const playerStart: Hex = { q: -9, r: 0 };
  const aiStart: Hex = { q: 9, r: 0 };

  /** Set terrain on a hex AND its rotational mirror. */
  const setMirror = (h: Hex, terrain: TerrainType) => {
    const c1 = cells.get(hexKey(h));
    const c2 = cells.get(hexKey({ q: -h.q, r: -h.r }));
    if (c1) c1.terrain = terrain;
    if (c2) c2.terrain = terrain;
  };

  // 2 Crystal Nodes near each base (mirrored).
  const nearBaseOffsets: Array<[number, number]> = [
    [2, -1],
    [1, 2],
  ];
  for (const [dq, dr] of nearBaseOffsets) {
    setMirror({ q: playerStart.q + dq, r: playerStart.r + dr }, 'crystal_node');
  }

  // 2–3 contested Crystal Nodes near the center (mirrored).
  const numContested = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < numContested; i++) {
    const q = Math.floor(rng() * 7) - 3;
    const r = Math.floor(rng() * 7) - 3;
    setMirror({ q, r }, 'crystal_node');
  }

  // Void Rift clusters, avoiding the starting hexes.
  const numRiftClusters = 2 + Math.floor(rng() * 3);
  const protectedKeys = new Set([hexKey(playerStart), hexKey(aiStart)]);
  for (let i = 0; i < numRiftClusters; i++) {
    const q = Math.floor(rng() * 14) - 7;
    const r = Math.floor(rng() * (rows - 4)) - halfRows + 2;
    const h: Hex = { q, r };
    if (protectedKeys.has(hexKey(h))) continue;
    setMirror(h, 'void_rift');
    // Extend to a small cluster (0–2 adjacent hexes).
    const clusterSize = Math.floor(rng() * 3);
    const offsets: Array<[number, number]> = [[1, 0], [0, 1], [-1, 1]];
    for (let j = 0; j < clusterSize; j++) {
      const [dq, dr] = offsets[j];
      const neighbor: Hex = { q: h.q + dq, r: h.r + dr };
      if (!protectedKeys.has(hexKey(neighbor))) {
        setMirror(neighbor, 'void_rift');
      }
    }
  }

  // Initial fog: Command Nexus (at playerStart) reveals 3-hex radius.
  for (const h of hexesInRange(playerStart, 3)) {
    const cell = cells.get(hexKey(h));
    if (cell) cell.fog = 'visible';
  }

  return { cols, rows, cells, playerStart, aiStart, seed };
}

/**
 * Recompute fog of war given vision sources (friendly units/structures).
 * Previously-visible cells become 'explored'; new in-range cells become 'visible'.
 */
export function computeFog(
  map: GameMap,
  visionSources: Array<{ hex: Hex; radius: number }>,
): void {
  for (const cell of map.cells.values()) {
    if (cell.fog === 'visible') cell.fog = 'explored';
  }
  for (const { hex, radius } of visionSources) {
    for (const h of hexesInRange(hex, radius)) {
      const cell = map.cells.get(hexKey(h));
      if (cell) cell.fog = 'visible';
    }
  }
}
