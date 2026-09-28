import type { z } from 'zod';
import { defaultTuning } from '../tuning';
import { ROOM_FILES } from './content';
import {
  type Abilities,
  type AbilityName,
  type CameraZoneDef,
  type COLOURS,
  type RoomFile,
  RoomFileSchema,
  TILE_CHARS,
  Tile,
  type TileType,
} from './room-schema';

export * from './room-schema';

export interface Spawn {
  /** Tile column/row of the marker (after padding). The player stands on the floor of this tile. */
  tx: number;
  ty: number;
}

export type EntityKind = 'goal' | 'optionalGoal' | 'respawn' | 'door' | 'corner' | 'pickup' | 'rest';
export interface Entity {
  kind: EntityKind;
  tx: number;
  ty: number;
  char: string;
  /** Doors: target room and spawn. */
  to?: string;
  spawn?: string;
  /** Pickups: abilities granted and a stable id. */
  grants?: AbilityName[];
  id?: string;
}

export interface CameraZone {
  /** Pixels, after padding. */
  x: number;
  y: number;
  w: number;
  h: number;
  mode: CameraZoneDef['mode'];
  /** View centre in px for lock/clampX/clampY. */
  cx: number;
  cy: number;
}

export interface RoomSource {
  char: string;
  sound: string;
  colour: (typeof COLOURS)[number];
  locked: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Room {
  id: string;
  name: string;
  /** Size in tiles, after padding. */
  width: number;
  height: number;
  /** Row-major TileType per tile. */
  tiles: Uint8Array;
  spawns: Record<string, Spawn>;
  entities: Entity[];
  abilities: Abilities;
  cameraZones: CameraZone[];
  next?: string;
  hazard: 'death' | 'pip';
  spawnGrace: number;
  /** L3: humming objects (one per connected component of a source char), px rects, scan order. */
  sources: RoomSource[];
  plates: { char: string; tiles: number[]; pressedBy: ('slab' | 'heavy')[] }[];
  gates: { char: string; tiles: number[]; opensOn: 'plate' | 'clear' }[];
  enemySpawns: { type: string; tx: number; ty: number }[];
  /** Tiles of solid padding added on the left/top (sketch tile + pad = room tile). */
  padX: number;
  padY: number;
  file: z.output<typeof RoomFileSchema>;
}

const MIN_W = defaultTuning.world.minRoomW;
const MIN_H = defaultTuning.world.minRoomH;
const TS = defaultTuning.world.tileSize;

export function buildRoom(input: RoomFile): Room {
  const f = RoomFileSchema.parse(input);
  const sw = f.rows[0]?.length ?? 0;
  const sh = f.rows.length;
  const width = Math.max(sw, MIN_W);
  const height = Math.max(sh, MIN_H);
  const padX = Math.floor((width - sw) / 2);
  const padY = Math.ceil((height - sh) / 2);
  const tiles = new Uint8Array(width * height).fill(Tile.solid);
  const spawns: Record<string, Spawn> = {};
  const entities: Entity[] = [];
  const plateTiles: Record<string, number[]> = {};
  const gateTiles: Record<string, number[]> = {};
  const enemySpawns: Room['enemySpawns'] = [];
  const charAt = (tx: number, ty: number): string => f.rows[ty - padY]?.[tx - padX] ?? '#';
  f.rows.forEach((row, sy) => {
    for (let sx = 0; sx < sw; sx++) {
      const ch = row[sx] ?? '#';
      const tx = sx + padX;
      const ty = sy + padY;
      const door = f.doors[ch];
      const pickup = f.pickups[ch];
      const rest = f.rests[ch];
      // Plates are always solid (their pressed state lives in GameState.local); sources, gates
      // and enemy spawns load as empty tiles (their solidity is dynamic, see world/dynamic.ts).
      let tile: TileType = door ? Tile.empty : (TILE_CHARS[ch] ?? Tile.solid);
      if (ch in f.plates) {
        tile = Tile.solid;
        plateTiles[ch] = [...(plateTiles[ch] ?? []), tx, ty];
      } else if (ch in f.gates) {
        tile = Tile.empty;
        gateTiles[ch] = [...(gateTiles[ch] ?? []), tx, ty];
      } else if (ch in f.sources || ch in f.pickups || ch in f.rests) tile = Tile.empty;
      else if (ch in f.enemies) {
        tile = Tile.empty;
        enemySpawns.push({ type: f.enemies[ch] as string, tx, ty });
      }
      tiles[ty * width + tx] = tile;
      if (ch === 'P') spawns.default = { tx, ty };
      else if (ch === 'R') entities.push({ kind: 'respawn', tx, ty, char: ch });
      else if (ch === 'G') entities.push({ kind: 'goal', tx, ty, char: ch });
      else if (ch === 'g') entities.push({ kind: 'optionalGoal', tx, ty, char: ch });
      else if (pickup) {
        const id = pickup.id ?? `${f.id}:${ch}`;
        entities.push({ kind: 'pickup', tx, ty, char: ch, grants: [...pickup.grants], id });
      } else if (rest) entities.push({ kind: 'rest', tx, ty, char: ch, id: rest.name ?? ch });
      else if (ch === '+') {
        entities.push({ kind: 'corner', tx, ty, char: ch });
        spawns.corner = { tx, ty };
      } else if (door) {
        entities.push({ kind: 'door', tx, ty, char: ch, to: door.to, spawn: door.spawn });
        spawns[ch] = { tx, ty };
      }
    }
  });
  // Sources: 4-connected components of each source char, in scan order of their first tile.
  const sources: RoomSource[] = [];
  const seen = new Uint8Array(width * height);
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const ch = charAt(tx, ty);
      const def = f.sources[ch];
      if (!def || seen[ty * width + tx]) continue;
      let x0 = tx;
      let y0 = ty;
      let x1 = tx;
      let y1 = ty;
      const stack = [tx, ty];
      seen[ty * width + tx] = 1;
      while (stack.length > 0) {
        const cy = stack.pop() as number;
        const cx = stack.pop() as number;
        x0 = Math.min(x0, cx);
        y0 = Math.min(y0, cy);
        x1 = Math.max(x1, cx);
        y1 = Math.max(y1, cy);
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ] as const) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (seen[ny * width + nx] || charAt(nx, ny) !== ch) continue;
          seen[ny * width + nx] = 1;
          stack.push(nx, ny);
        }
      }
      sources.push({
        char: ch,
        sound: def.sound,
        colour: def.colour,
        locked: def.locked,
        x: x0 * TS,
        y: y0 * TS,
        w: (x1 - x0 + 1) * TS,
        h: (y1 - y0 + 1) * TS,
      });
    }
  }
  const plates = Object.entries(plateTiles).map(([char, t]) => ({
    char,
    tiles: t,
    pressedBy: f.plates[char]?.pressedBy ?? ['slab', 'heavy'],
  }));
  const gates = Object.entries(gateTiles).map(([char, t]) => ({
    char,
    tiles: t,
    opensOn: f.gates[char]?.opensOn ?? 'plate',
  }));
  const cameraZones = f.cameraZones.map((z): CameraZone => {
    const [zx, zy, zw, zh] = z.rect;
    const x = (zx + padX) * TS;
    const y = (zy + padY) * TS;
    const [vx, vy] = z.value ?? [zx + zw / 2, zy + zh / 2];
    return { x, y, w: zw * TS, h: zh * TS, mode: z.mode, cx: (vx + padX) * TS, cy: (vy + padY) * TS };
  });
  return {
    id: f.id,
    name: f.name,
    width,
    height,
    tiles,
    spawns,
    entities,
    abilities: { ...f.abilities },
    cameraZones,
    next: f.next,
    hazard: f.hazard,
    spawnGrace: f.spawnGrace,
    sources,
    plates,
    gates,
    enemySpawns,
    padX,
    padY,
    file: f,
  };
}

const MIRROR: Record<string, string> = { '<': '>', '>': '<' };

/** Left-right mirror of a room file (for the mirror-symmetry test). */
export function mirrorRoomFile(f: RoomFile, id = `${f.id}~m`): RoomFile {
  const w = f.rows[0]?.length ?? 0;
  return {
    ...f,
    id,
    rows: f.rows.map((r) =>
      [...r]
        .reverse()
        .map((c) => MIRROR[c] ?? c)
        .join(''),
    ),
    cameraZones: (f.cameraZones ?? []).map((z) => ({
      ...z,
      rect: [w - z.rect[0] - z.rect[2], z.rect[1], z.rect[2], z.rect[3]],
      value: z.value ? [w - z.value[0], z.value[1]] : undefined,
    })),
  };
}

const registry = new Map<string, Room>();

/** Adds (or replaces) a room. Tests use this for inline rooms. */
export function registerRoom(room: Room): Room {
  registry.set(room.id, room);
  return room;
}

for (const f of ROOM_FILES) registerRoom(buildRoom(f));

export const ROOMS: ReadonlyMap<string, Room> = registry;

export const DEFAULT_ROOM = 'hub';

/** The gym rooms in play order. */
export const GYM_ROOMS = ROOM_FILES.map((f) => f.id).filter((id) => id.startsWith('gym-'));

export function getRoom(id: string): Room {
  const room = registry.get(id);
  if (!room) throw new Error(`Unknown room "${id}". Known: ${[...registry.keys()].join(', ')}`);
  return room;
}

export function tileAt(room: Room, tx: number, ty: number): number {
  // Outside the room counts as solid so nothing can leave it.
  if (tx < 0 || ty < 0 || tx >= room.width || ty >= room.height) return Tile.solid;
  return room.tiles[ty * room.width + tx] ?? Tile.solid;
}

export function isSolidTile(room: Room, tx: number, ty: number): boolean {
  return tileAt(room, tx, ty) === Tile.solid;
}
