import { z } from 'zod';
import { defaultTuning } from '../tuning';
import { ROOM_FILES } from './content';

/**
 * Rooms: ASCII-in-JSON (movement-spec §6.1). The LDtk importer (Phase 3) must emit the same
 * `RoomData`. Legend:
 *   `#` solid   `.` air   `=` one-way   `^ v < >` spikes (point direction)   `o` pogo orb
 *   `P` spawn   `R` respawn marker   `G` goal   `g` optional goal
 *   any character listed in `doors` is a door (enter with Up); it is also a spawn of that name.
 *   Progression markers (optional; read by tools/progression, no sim behaviour yet): chars listed
 *   in `pickups` (ability pickups) and `rests` (Rest benches) load as empty tiles.
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
  '+': Tile.empty,
};

const Abilities = z.object({
  wallJump: z.boolean(),
  dash: z.boolean(),
  doubleJump: z.boolean(),
  pogo: z.boolean(),
  /** L3 signature verbs (optional in room files; default off). */
  seize: z.boolean().default(false),
  levy: z.boolean().default(false),
});
export type Abilities = z.output<typeof Abilities>;
export type AbilityName = keyof Abilities;
export const ABILITY_NAMES: AbilityName[] = ['wallJump', 'dash', 'doubleJump', 'pogo', 'seize', 'levy'];
export const ALL_ABILITIES: Abilities = {
  wallJump: true,
  dash: true,
  doubleJump: true,
  pogo: true,
  seize: true,
  levy: true,
};
export const NO_ABILITIES: Abilities = {
  wallJump: false,
  dash: false,
  doubleJump: false,
  pogo: false,
  seize: false,
  levy: false,
};

export const COLOURS = ['brown', 'pink', 'violet', 'white'] as const;
const Char = z.string().length(1);
const SourceDef = z.object({
  sound: z.string(),
  colour: z.enum(COLOURS),
  /** Hums but Kid can't seize it (the Auctioneer's lots, "under the hammer"). */
  locked: z.boolean().default(false),
});
/** Buttons a prompt glyph can show (render-only; drawn in code, no text). */
export const PROMPT_KEYS = [
  'left',
  'right',
  'up',
  'down',
  'jump',
  'dash',
  'attack',
  'seize',
  'levy',
  'special',
] as const;
const Prompt = z.object({
  /** Sketch tile (before padding) the glyph is centred on. */
  at: z.tuple([z.number(), z.number()]),
  /** Keys shown together, e.g. ["up", "seize"] = Up + Seize. */
  keys: z.array(z.enum(PROMPT_KEYS)).min(1),
  /** Hidden once this has happened in the room: `move:seize:up` (a moveStart), or an event type. */
  until: z.string().optional(),
  /** Only shown within this many tiles of Kid (default 6). */
  near: z.number().positive().optional(),
});
export type PromptDef = z.infer<typeof Prompt>;
const PlateDef = z.object({ pressedBy: z.array(z.enum(['slab', 'heavy'])).default(['slab', 'heavy']) });
const AbilityEnum = z.enum(['wallJump', 'dash', 'doubleJump', 'pogo', 'seize', 'levy']);
/**
 * Progression validator: aimed moves a gate is meant to require, as `<move>:<dir>` (a `moveStart`
 * event, e.g. `seize:up`, `levy:down`). The gate audit forbids each in turn (the bot prunes any
 * state where it started) with the room's own kit: the target must stay unreachable.
 */
const MoveKey = z.string().regex(/^[a-z]+:(up|down|fwd)$/);
const GateDef = z.object({
  opensOn: z.enum(['plate', 'clear']),
  /**
   * Progression validator: abilities this gate is meant to require. Each must be necessary:
   * the far side must be unreachable with the full kit minus that ability (gate audit).
   */
  requires: z.array(AbilityEnum).optional(),
  /** world-design §3: `sealed` (a barrier; default for tile gates) or `reach` (height/gap/timing). */
  hold: z.enum(['sealed', 'reach']).optional(),
  moves: z.array(MoveKey).optional(),
});
/** Progression validator: an ability pickup (tile char). Sim support comes with Phase 3 saves. */
const PickupDef = z.object({
  grants: z.array(AbilityEnum).min(1),
  /** Stable id for intended-order annotations (default `<room>:<char>`). */
  id: z.string().optional(),
});
/** Progression validator: a Rest (safe place; softlock checks need a way back to one). */
const RestDef = z.object({ name: z.string().optional() });
/**
 * Progression validator: a geometric lock, i.e. a place that should need `requires` to reach
 * (a spring climb, a dash gap). `target` is a bot target (`G`, `exit:<c>`, `tile:x,y`, `rect:x,y,w,h`
 * in room px); `from` is the spawn the audit starts at (default P).
 */
const LockDef = z.object({
  target: z.string(),
  from: z.string().optional(),
  /**
   * Input DSL played from `from` before the audit's search starts (e.g. solve the room's first
   * puzzle so the bot starts where the gate is taught, with that room state).
   */
  prelude: z.string().optional(),
  requires: z.array(AbilityEnum).min(1),
  moves: z.array(MoveKey).optional(),
  /** world-design §3: `reach` (default for locks) or `sealed`. Reach gates may not share a room with pink (G3). */
  hold: z.enum(['sealed', 'reach']).default('reach'),
  /** world-design G8: only has to hold against the kit at the room's earliest visit. */
  teachGate: z.boolean().default(false),
  /** world-design G7: bounded region (`rect:x,y,w,h`, room px) the audit's bot may not leave, so it can exhaust. */
  region: z.string().optional(),
  note: z.string().optional(),
});
export type LockDef = z.infer<typeof LockDef>;

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
  /** The `with` search is informational (may not be found in budget); `without` still must fail. */
  info: z.boolean().optional(),
  /** Bot budget (child nodes) for this claim's searches. */
  budget: z.number().int().positive().optional(),
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
    /** L3: each connected component of a source char is one sound source (humming object). */
    sources: z.record(Char, SourceDef).default({}),
    /** Plate chars: solid tiles that latch pressed for the visit. */
    plates: z.record(Char, PlateDef).default({}),
    /** Gate chars: solid until they open (on a pressed plate, or when the room is clear). */
    gates: z.record(Char, GateDef).default({}),
    /** Enemy spawn chars -> content/enemies/<id>.json; feet on this tile's floor. */
    enemies: z.record(Char, z.string()).default({}),
    /** In-world button glyphs (render-only teaching; combat L4). */
    prompts: z.array(Prompt).default([]),
    /** Frames enemies wait after the room loads before their first attack (a newcomer's grace, e.g. the Pit). */
    spawnGrace: z.number().int().nonnegative().default(0),
    /** Hazards: `death` (gym: die, respawn at R/P) or `pip` (combat: cost Chin, respawn at the last safe ground). */
    hazard: z.enum(['death', 'pip']).default('death'),
    /** Progression validator (tools/progression; memory/gym-rooms.md). All optional. */
    pickups: z.record(Char, PickupDef).default({}),
    rests: z.record(Char, RestDef).default({}),
    locks: z.record(z.string().min(1), LockDef).default({}),
    notes: z.string().default(''),
  })
  .superRefine((r, ctx) => {
    const w = r.rows[0]?.length ?? 0;
    const specials = new Set([
      ...Object.keys(r.sources),
      ...Object.keys(r.plates),
      ...Object.keys(r.gates),
      ...Object.keys(r.enemies),
      ...Object.keys(r.pickups),
      ...Object.keys(r.rests),
    ]);
    r.rows.forEach((row, i) => {
      if (row.length !== w)
        ctx.addIssue({ code: 'custom', message: `row ${i} has length ${row.length}, not ${w}` });
      for (const ch of row) {
        if (!(ch in TILE_CHARS) && !(ch in r.doors) && !specials.has(ch))
          ctx.addIssue({ code: 'custom', message: `row ${i}: unknown tile character "${ch}"` });
      }
    });
    const seen = new Set<string>();
    for (const [what, map] of [
      ['door', r.doors],
      ['source', r.sources],
      ['plate', r.plates],
      ['gate', r.gates],
      ['enemy', r.enemies],
      ['pickup', r.pickups],
      ['rest', r.rests],
    ] as const) {
      for (const ch of Object.keys(map)) {
        if (ch in TILE_CHARS)
          ctx.addIssue({ code: 'custom', message: `${what} char "${ch}" clashes with a tile` });
        if (seen.has(ch)) ctx.addIssue({ code: 'custom', message: `${what} char "${ch}" is used twice` });
        seen.add(ch);
      }
    }
    if (r.rows.filter((row) => row.includes('P')).length !== 1 || r.rows.join('').split('P').length !== 2)
      ctx.addIssue({ code: 'custom', message: 'room needs exactly one P (spawn)' });
  });
export type RoomFile = z.input<typeof RoomFileSchema>;

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
