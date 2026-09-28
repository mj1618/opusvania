import { z } from 'zod';
import { defaultTuning } from '../tuning';
import { ROOM_FILES } from './content';

/**
 * Rooms: ASCII-in-JSON (movement-spec §6.1). The LDtk importer (Phase 3) must emit the same
 * `RoomData`. Legend:
 *   `#` solid   `.` air   `=` one-way   `^ v < >` spikes (point direction)   `o` pogo orb
 *   `P` spawn   `R` respawn marker   `G` goal   `g` optional goal
 *   any character listed in `doors` is a door (enter with Up); it is also a spawn of that name.
 * Rooms smaller than the minimum size are padded with solid; outside the room is solid.
 */
export const Tile = {
  empty: 0,
  solid: 1,
  oneWay: 2,
  /** Spikes by the direction they point: up = floor spike, down = ceiling, left/right = on walls. */
  spikeUp: 3,
  spikeDown: 4,
  spikeLeft: 5,
  spikeRight: 6,
  orb: 7,
} as const;
export type TileType = (typeof Tile)[keyof typeof Tile];

const TILE_CHARS: Record<string, TileType> = {
  '#': Tile.solid,
  '.': Tile.empty,
  '=': Tile.oneWay,
  '^': Tile.spikeUp,
  v: Tile.spikeDown,
  '<': Tile.spikeLeft,
  '>': Tile.spikeRight,
  o: Tile.orb,
  P: Tile.empty,
  R: Tile.empty,
  G: Tile.empty,
  g: Tile.empty,
};

const Abilities = z.object({
  wallJump: z.boolean(),
  dash: z.boolean(),
  doubleJump: z.boolean(),
  pogo: z.boolean(),
});
export type Abilities = z.infer<typeof Abilities>;
export type AbilityName = keyof Abilities;
export const ABILITY_NAMES: AbilityName[] = ['wallJump', 'dash', 'doubleJump', 'pogo'];
export const ALL_ABILITIES: Abilities = { wallJump: true, dash: true, doubleJump: true, pogo: true };
export const NO_ABILITIES: Abilities = { wallJump: false, dash: false, doubleJump: false, pogo: false };

const CameraZone = z.object({
  /** [tx, ty, tw, th] in tiles (sketch coordinates, before padding). */
  rect: z.tuple([
    z.number().int(),
    z.number().int(),
    z.number().int().positive(),
    z.number().int().positive(),
  ]),
  mode: z.enum(['lock', 'clampX', 'clampY', 'bounds']),
  /** lock/clampX/clampY: view centre in tiles (defaults to the rect centre). */
  value: z.tuple([z.number(), z.number()]).optional(),
});
export type CameraZoneDef = z.infer<typeof CameraZone>;

const Claim = z.object({
  with: z.array(z.string()),
  without: z.array(z.string()).default([]),
});

export const RoomFileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().default(''),
    abilities: Abilities,
    rows: z.array(z.string().min(1)).min(1),
    cameraZones: z.array(CameraZone).default([]),
    /** Door characters: `{ "1": { "to": "gym-01", "spawn": "P" } }`. Enter by pressing Up. */
    doors: z
      .record(z.string().length(1), z.object({ to: z.string(), spawn: z.string().optional() }))
      .default({}),
    /** Where touching `G` leads (room id). Without it, G only marks the room complete. */
    next: z.string().optional(),
    claims: z
      .object({ G: Claim.nullable().optional(), g: Claim.nullable().optional() })
      .passthrough()
      .default({}),
    notes: z.string().default(''),
  })
  .superRefine((r, ctx) => {
    const w = r.rows[0]?.length ?? 0;
    r.rows.forEach((row, i) => {
      if (row.length !== w)
        ctx.addIssue({ code: 'custom', message: `row ${i} has length ${row.length}, not ${w}` });
      for (const ch of row) {
        if (!(ch in TILE_CHARS) && !(ch in r.doors))
          ctx.addIssue({ code: 'custom', message: `row ${i}: unknown tile character "${ch}"` });
      }
    });
    for (const ch of Object.keys(r.doors))
      if (ch in TILE_CHARS)
        ctx.addIssue({ code: 'custom', message: `door char "${ch}" clashes with a tile` });
    if (r.rows.filter((row) => row.includes('P')).length !== 1 || r.rows.join('').split('P').length !== 2)
      ctx.addIssue({ code: 'custom', message: 'room needs exactly one P (spawn)' });
  });
export type RoomFile = z.input<typeof RoomFileSchema>;

export interface Spawn {
  /** Tile column/row of the marker (after padding). The player stands on the floor of this tile. */
  tx: number;
  ty: number;
}

export type EntityKind = 'goal' | 'optionalGoal' | 'respawn' | 'door';
export interface Entity {
  kind: EntityKind;
  tx: number;
  ty: number;
  char: string;
  /** Doors: target room and spawn. */
  to?: string;
  spawn?: string;
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
  f.rows.forEach((row, sy) => {
    for (let sx = 0; sx < sw; sx++) {
      const ch = row[sx] ?? '#';
      const tx = sx + padX;
      const ty = sy + padY;
      const door = f.doors[ch];
      tiles[ty * width + tx] = door ? Tile.empty : (TILE_CHARS[ch] ?? Tile.solid);
      if (ch === 'P') spawns.default = { tx, ty };
      else if (ch === 'R') entities.push({ kind: 'respawn', tx, ty, char: ch });
      else if (ch === 'G') entities.push({ kind: 'goal', tx, ty, char: ch });
      else if (ch === 'g') entities.push({ kind: 'optionalGoal', tx, ty, char: ch });
      else if (door) {
        entities.push({ kind: 'door', tx, ty, char: ch, to: door.to, spawn: door.spawn });
        spawns[ch] = { tx, ty };
      }
    }
  });
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
