import { describe, it, expect } from 'vitest';
import {
  hexDistance,
  hexesInRange,
  hexKey,
  parseHexKey,
  hexNeighbors,
  hexToPixel,
  pixelToHex,
  hexRound,
  hexCorners,
  hexEqual,
  HEX_DIRECTIONS,
} from '@/engine/hex';

describe('hexKey / parseHexKey', () => {
  it('encodes and decodes correctly', () => {
    const h = { q: 3, r: -5 };
    expect(parseHexKey(hexKey(h))).toEqual(h);
  });

  it('produces unique keys for different hexes', () => {
    const keys = new Set([
      hexKey({ q: 0, r: 0 }),
      hexKey({ q: 1, r: 0 }),
      hexKey({ q: 0, r: 1 }),
      hexKey({ q: -1, r: 1 }),
    ]);
    expect(keys.size).toBe(4);
  });
});

describe('hexDistance', () => {
  it('returns 0 for the same hex', () => {
    expect(hexDistance({ q: 2, r: -1 }, { q: 2, r: -1 })).toBe(0);
  });

  it('returns 1 for all 6 direct neighbors', () => {
    const origin = { q: 0, r: 0 };
    for (const d of HEX_DIRECTIONS) {
      expect(hexDistance(origin, d)).toBe(1);
    }
  });

  it('returns correct distance for known pairs', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: -2 })).toBe(2);
    expect(hexDistance({ q: -3, r: 2 }, { q: 3, r: -2 })).toBe(6);
  });
});

describe('hexNeighbors', () => {
  it('returns exactly 6 neighbors', () => {
    expect(hexNeighbors({ q: 0, r: 0 })).toHaveLength(6);
  });

  it('each neighbor is at distance 1', () => {
    const h = { q: 2, r: -1 };
    for (const n of hexNeighbors(h)) {
      expect(hexDistance(h, n)).toBe(1);
    }
  });
});

describe('hexesInRange', () => {
  it('radius 0 returns only the center', () => {
    const result = hexesInRange({ q: 1, r: -1 }, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ q: 1, r: -1 });
  });

  it('radius 1 returns 7 hexes', () => {
    expect(hexesInRange({ q: 0, r: 0 }, 1)).toHaveLength(7);
  });

  it('radius 2 returns 19 hexes', () => {
    expect(hexesInRange({ q: 0, r: 0 }, 2)).toHaveLength(19);
  });

  it('radius 3 returns 37 hexes', () => {
    expect(hexesInRange({ q: 0, r: 0 }, 3)).toHaveLength(37);
  });

  it('all returned hexes are within range', () => {
    const center = { q: 2, r: -1 };
    for (const h of hexesInRange(center, 3)) {
      expect(hexDistance(center, h)).toBeLessThanOrEqual(3);
    }
  });
});

describe('hexToPixel / pixelToHex', () => {
  it('roundtrips integer hexes through pixel space', () => {
    const hexes = [
      { q: 0, r: 0 },
      { q: 3, r: -2 },
      { q: -5, r: 4 },
      { q: 1, r: 1 },
    ];
    for (const h of hexes) {
      const { x, y } = hexToPixel(h, 30);
      const result   = pixelToHex(x, y, 30);
      expect(result).toEqual(h);
    }
  });
});

describe('hexRound', () => {
  it('rounds to nearest integer hex', () => {
    expect(hexRound({ q: 0.1, r: 0.1 })).toEqual({ q: 0, r: 0 });
    expect(hexRound({ q: 0.9, r: 0.1 })).toEqual({ q: 1, r: 0 });
  });
});

describe('hexCorners', () => {
  it('returns 6 corners', () => {
    expect(hexCorners(0, 0, 20)).toHaveLength(6);
  });

  it('corners are at the correct distance from the center', () => {
    const size = 20;
    for (const [cx, cy] of hexCorners(0, 0, size)) {
      const dist = Math.hypot(cx, cy);
      expect(dist).toBeCloseTo(size, 5);
    }
  });
});

describe('hexEqual', () => {
  it('returns true for equal hexes', () => {
    expect(hexEqual({ q: 1, r: -1 }, { q: 1, r: -1 })).toBe(true);
  });

  it('returns false for different hexes', () => {
    expect(hexEqual({ q: 1, r: -1 }, { q: 1, r: 0 })).toBe(false);
  });
});
