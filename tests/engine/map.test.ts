import { describe, it, expect } from 'vitest';
import { generateMap, computeFog } from '@/engine/map';
import { hexKey, hexDistance } from '@/engine/hex';

describe('generateMap', () => {
  it('creates the correct number of cells (24×20 = 480)', () => {
    const map = generateMap(1);
    expect(map.cells.size).toBe(480);
  });

  it('includes playerStart and aiStart in the cell map', () => {
    const map = generateMap(1);
    expect(map.cells.has(hexKey(map.playerStart))).toBe(true);
    expect(map.cells.has(hexKey(map.aiStart))).toBe(true);
  });

  it('playerStart and aiStart are rotationally symmetric around origin', () => {
    const map = generateMap(1);
    expect(map.playerStart.q + map.aiStart.q).toBe(0);
    expect(map.playerStart.r + map.aiStart.r).toBe(0);
  });

  it('is deterministic — same seed produces identical maps', () => {
    const a = generateMap(999);
    const b = generateMap(999);
    expect(a.cells.size).toBe(b.cells.size);
    for (const [key, cellA] of a.cells) {
      const cellB = b.cells.get(key);
      expect(cellB?.terrain).toBe(cellA.terrain);
    }
  });

  it('different seeds produce different maps', () => {
    const a = generateMap(1);
    const b = generateMap(2);
    let diffCount = 0;
    for (const [key, cellA] of a.cells) {
      if (cellA.terrain !== b.cells.get(key)?.terrain) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(0);
  });

  it('initial fog: cells within 3 hexes of playerStart are visible', () => {
    const map = generateMap(1);
    const { playerStart } = map;
    for (const cell of map.cells.values()) {
      if (hexDistance(cell.hex, playerStart) <= 3) {
        expect(cell.fog).toBe('visible');
      }
    }
  });

  it('initial fog: cells far from playerStart are unexplored', () => {
    const map = generateMap(1);
    const farCells = [...map.cells.values()].filter(
      (c) => hexDistance(c.hex, map.playerStart) > 5,
    );
    expect(farCells.length).toBeGreaterThan(0);
    for (const cell of farCells) {
      // Far cells should not be visible (may be explored in theory but not with a nexus-only start)
      expect(cell.fog).not.toBe('visible');
    }
  });

  it('void_rift hexes are rotationally mirrored', () => {
    const map = generateMap(42);
    const rifts = [...map.cells.values()].filter((c) => c.terrain === 'void_rift');
    for (const rift of rifts) {
      const mirror = map.cells.get(hexKey({ q: -rift.hex.q, r: -rift.hex.r }));
      expect(mirror?.terrain).toBe('void_rift');
    }
  });

  it('crystal_node hexes are rotationally mirrored', () => {
    const map = generateMap(42);
    const nodes = [...map.cells.values()].filter((c) => c.terrain === 'crystal_node');
    for (const node of nodes) {
      const mirror = map.cells.get(hexKey({ q: -node.hex.q, r: -node.hex.r }));
      expect(mirror?.terrain).toBe('crystal_node');
    }
  });
});

describe('computeFog', () => {
  it('transitions visible → explored, then re-marks in-range as visible', () => {
    const map = generateMap(1);
    // Confirm some cells are visible initially (near playerStart)
    const prevVisible = [...map.cells.values()].filter((c) => c.fog === 'visible');
    expect(prevVisible.length).toBeGreaterThan(0);

    // Move "nexus" to aiStart (opposite side of map)
    computeFog(map, [{ hex: map.aiStart, radius: 3 }]);

    // Old visible cells near playerStart should now be explored
    for (const cell of prevVisible) {
      if (hexDistance(cell.hex, map.aiStart) > 3) {
        expect(cell.fog).toBe('explored');
      }
    }

    // Cells near aiStart should now be visible
    for (const cell of map.cells.values()) {
      if (hexDistance(cell.hex, map.aiStart) <= 3) {
        expect(cell.fog).toBe('visible');
      }
    }
  });
});
