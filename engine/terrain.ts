export type TerrainType =
  | 'open'
  | 'void_rift'
  | 'crystal_node'
  | 'flux_vent'
  | 'ridge'
  | 'energy_field';

export interface TerrainDef {
  readonly label: string;
  readonly passable: boolean;
  /** Movement cost multiplier: 1 = normal, 2 = slow, Infinity = impassable. */
  readonly moveCost: number;
}

export const TERRAIN: Readonly<Record<TerrainType, TerrainDef>> = {
  open:         { label: 'Open Ground',  passable: true,  moveCost: 1        },
  void_rift:    { label: 'Void Rift',    passable: false, moveCost: Infinity },
  crystal_node: { label: 'Crystal Node', passable: true,  moveCost: 1        },
  flux_vent:    { label: 'Flux Vent',    passable: true,  moveCost: 1        },
  ridge:        { label: 'Ridge',        passable: true,  moveCost: 1        },
  energy_field: { label: 'Energy Field', passable: true,  moveCost: 2        },
};
