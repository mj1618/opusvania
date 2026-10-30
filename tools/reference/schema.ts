/**
 * The reference-level schema (docs/design/reference-levels/BRIEF.md): one shape for our areas and the reference
 * games' first areas. World px (ours), origin at the area's top-left, y down.
 */
export type Point = [number, number];

export interface AreaRoom {
  id: string;
  name: string;
  rect: [number, number, number, number];
  screens: number;
  shape: 'pocket' | 'hall' | 'shaft' | 'setpiece' | 'hub' | 'corridor' | string;
  onCriticalPath: boolean;
  exits: Array<{ to: string; side: string; at: number[]; oneWay?: boolean; gate?: string }>;
}

export interface AreaTerrain {
  roomId: string;
  kind: 'solid' | 'oneway' | 'hazard' | 'water' | 'breakable' | 'secretWall' | 'door' | string;
  poly: number[][];
}

export interface AreaThing {
  id: string;
  roomId: string;
  kind:
    | 'pickup-major'
    | 'pickup-minor'
    | 'breakable'
    | 'lever'
    | 'shortcut'
    | 'save'
    | 'npc'
    | 'shop'
    | 'lore'
    | 'boss'
    | 'arena'
    | 'landmark'
    | string;
  at: Point;
  value?: string;
  hidden?: { how: string; needs?: string };
  src?: string;
}

export interface AreaEnemy {
  id: string;
  roomId: string;
  kind: string;
  at: Point;
  hp: number;
  contactDamage: number;
  attack?: string;
  behaviour: string;
  patrol?: number | number[];
  respawns?: boolean;
  difficulty: number;
  src?: string;
}

export interface AreaFile {
  game: string;
  area: string;
  sources: string[];
  units: { native: string; pxPerUnit: number; viewNative: number[]; how: string };
  hero: {
    box: number[];
    run: number;
    jump: number;
    startAbilities: string[];
    abilityOrder: Array<{ ability: string; where?: string; roomId?: string; minuteGuess?: number }>;
    [k: string]: unknown;
  };
  rooms: AreaRoom[];
  terrain: AreaTerrain[];
  things: AreaThing[];
  enemies: AreaEnemy[];
  criticalPath: string[];
  firstPlayMinutes?: { criticalPath?: number; full100?: number };
  [k: string]: unknown;
}
