/**
 * Axial (cube-derived) hex coordinate system — pointy-top orientation.
 * Invariant: s = -q - r (s is implicit; we only store q and r).
 */
export interface Hex {
  readonly q: number;
  readonly r: number;
}

/** The 6 axial direction vectors for pointy-top hexes (E, NE, NW, W, SW, SE). */
export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Returns all 6 neighbors of a hex. */
export function hexNeighbors(h: Hex): Hex[] {
  return HEX_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

/** Cube-coordinate (Chebyshev) distance between two hexes. */
export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** All hexes whose distance from center is ≤ radius (inclusive). */
export function hexesInRange(center: Hex, radius: number): Hex[] {
  const results: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      results.push({ q: center.q + q, r: center.r + r });
    }
  }
  return results;
}

/** Stable string key for use in Map/Set. */
export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}

/** Parse a hexKey string back to a Hex. */
export function parseHexKey(key: string): Hex {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

/** Pixel center of a pointy-top hex at axial coords (q, r) with given hex size. */
export function hexToPixel(h: Hex, size: number): { x: number; y: number } {
  return {
    x: size * (Math.sqrt(3) * h.q + (Math.sqrt(3) / 2) * h.r),
    y: size * (1.5 * h.r),
  };
}

/** Convert pixel position to nearest hex. */
export function pixelToHex(px: number, py: number, size: number): Hex {
  const q = ((Math.sqrt(3) / 3) * px - (1 / 3) * py) / size;
  const r = ((2 / 3) * py) / size;
  return hexRound({ q, r });
}

/** Round fractional axial coords to the nearest integer hex. */
export function hexRound(frac: { q: number; r: number }): Hex {
  const s = -frac.q - frac.r;
  let rq = Math.round(frac.q);
  let rr = Math.round(frac.r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - frac.q);
  const dr = Math.abs(rr - frac.r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  }
  return { q: rq, r: rr };
}

/**
 * 6 corner pixel positions for a pointy-top hex centered at (cx, cy).
 * Angle offset of -30° gives the correct pointy-top orientation.
 */
export function hexCorners(
  cx: number,
  cy: number,
  size: number,
): Array<[number, number]> {
  return Array.from({ length: 6 }, (_, i) => {
    const angleRad = (Math.PI / 180) * (60 * i - 30);
    return [cx + size * Math.cos(angleRad), cy + size * Math.sin(angleRad)];
  });
}

/** Shallow equality check for two hexes. */
export function hexEqual(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}
