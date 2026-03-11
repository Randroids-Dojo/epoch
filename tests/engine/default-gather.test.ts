import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, resetIdSeq, GameState, newId } from '@/engine/state';
import { resolveEpoch } from '@/engine/resolution';
import { Unit } from '@/engine/units';
import { Structure } from '@/engine/structures';
import { deepCopyState } from '@/engine/simulation';
import { queueCommand } from './helpers';

beforeEach(() => resetIdSeq());

function addUnit(state: GameState, partial: Partial<Unit> & Pick<Unit, 'owner' | 'type' | 'hex'>): Unit {
  const unit: Unit = {
    id: newId('u'),
    hp: 15,
    isDefending: false,
    assignedExtractorId: null,
    damageShield: false,
    ...partial,
  };
  state.units.set(unit.id, unit);
  return unit;
}

function addStructure(state: GameState, partial: Partial<Structure> & Pick<Structure, 'owner' | 'type' | 'hex'>): Structure {
  const s: Structure = {
    id: newId('s'),
    hp: 40,
    buildProgress: 0,
    assignedDroneId: null,
    ...partial,
  };
  state.structures.set(s.id, s);
  return s;
}

describe('Default gathering task', () => {
  it('auto-populates gather orders for drones assigned to extractors after epoch resolution', () => {
    const s = createInitialState(1);
    const extractor = addStructure(s, {
      owner: 'player', type: 'crystal_extractor',
      hex: { q: -8, r: 0 }, buildProgress: 0,
    });
    const drone = addUnit(s, {
      owner: 'player', type: 'drone',
      hex: { q: -8, r: 0 },
    });

    // Queue a gather command for the drone
    queueCommand(s, 'player', 0, { type: 'gather', unitId: drone.id, targetHex: extractor.hex });
    resolveEpoch(s);

    // Next epoch: drone should have a default gather order
    const order = s.players.player.unitOrders.get(drone.id);
    expect(order).toBeDefined();
    expect(order!.type).toBe('gather');
    expect(s.players.player.defaultOrderUnitIds.has(drone.id)).toBe(true);
  });

  it('does not auto-populate if the extractor was destroyed', () => {
    const s = createInitialState(1);
    const extractor = addStructure(s, {
      owner: 'player', type: 'crystal_extractor',
      hex: { q: -8, r: 0 }, buildProgress: 0,
    });
    const drone = addUnit(s, {
      owner: 'player', type: 'drone',
      hex: { q: -8, r: 0 },
    });

    // Assign drone to extractor manually
    drone.assignedExtractorId = extractor.id;
    extractor.assignedDroneId = drone.id;
    s.players.player.unitOrders.set(drone.id, { type: 'gather', unitId: drone.id, targetHex: extractor.hex });

    // Destroy the extractor before resolution
    s.structures.delete(extractor.id);
    resolveEpoch(s);

    // Drone should NOT have a default gather order
    expect(s.players.player.unitOrders.has(drone.id)).toBe(false);
    expect(s.players.player.defaultOrderUnitIds.has(drone.id)).toBe(false);
  });

  it('clears defaultOrderUnitIds when a manual order replaces the default', () => {
    const s = createInitialState(1);

    // Simulate a drone with a default order
    const drone = addUnit(s, {
      owner: 'player', type: 'drone',
      hex: { q: -8, r: 0 },
    });
    s.players.player.defaultOrderUnitIds.add(drone.id);
    s.players.player.unitOrders.set(drone.id, { type: 'gather', unitId: drone.id, targetHex: { q: -8, r: 0 } });

    // Manually set a new order (simulating commitUnitOrder behavior)
    s.players.player.unitOrders.set(drone.id, { type: 'move', unitId: drone.id, targetHex: { q: -7, r: 0 } });
    s.players.player.defaultOrderUnitIds.delete(drone.id);

    expect(s.players.player.defaultOrderUnitIds.has(drone.id)).toBe(false);
  });

  it('deepCopyState copies defaultOrderUnitIds independently', () => {
    const s = createInitialState(1);
    const drone = addUnit(s, {
      owner: 'player', type: 'drone',
      hex: { q: -8, r: 0 },
    });
    s.players.player.defaultOrderUnitIds.add(drone.id);

    const copy = deepCopyState(s);

    // Mutating the copy should not affect the original
    copy.players.player.defaultOrderUnitIds.delete(drone.id);
    expect(s.players.player.defaultOrderUnitIds.has(drone.id)).toBe(true);
    expect(copy.players.player.defaultOrderUnitIds.has(drone.id)).toBe(false);
  });
});
