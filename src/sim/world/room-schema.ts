/**
 * Room file schema (the data half of rooms.ts): pure, no room registry, so tools can validate a
 * RoomFile without loading every bundled room (tools/world compiles LDtk to this format).
 */
import { z } from 'zod';

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
  /**
   * Floor slopes (north star §3.2): heightfield tiles that only the feet collide with (two middle
   * columns). R rises to the right, L to the left; `run` tiles make one tile of rise, `k` = which
   * of them (from the low end). Tables in physics/slopes.ts.
   */
  slopeR4a: 8,
  slopeR4b: 9,
  slopeR4c: 10,
  slopeR4d: 11,
  slopeR2a: 12,
  slopeR2b: 13,
  slopeR1: 14,
  slopeL4a: 15,
  slopeL4b: 16,
  slopeL4c: 17,
  slopeL4d: 18,
  slopeL2a: 19,
  slopeL2b: 20,
  slopeL1: 21,
  /**
   * Derived, never authored: a solid tile at a slope's high end. Its top `slopes.shinPx` rows are
   * floor for the feet only, so the body's uphill corner may overlap them (buildRoom marks these).
   */
  shin: 22,
} as const;
export type TileType = (typeof Tile)[keyof typeof Tile];

/** Slope tile shapes by tile value: direction (+1 rises right), tiles per tile of rise, index from the low end. */
export interface SlopeShape {
  tile: number;
  char: string;
  /** Snake-case name used by the level tools (`r4a`, `l1`...). */
  name: string;
  dir: 1 | -1;
  run: 1 | 2 | 4;
  k: number;
}
/** RoomFile characters of the slope tiles (R: circled digits; L: parenthesised; 1:1 = triangles). */
export const SLOPE_SHAPES: readonly SlopeShape[] = [
  { tile: Tile.slopeR4a, char: '①', name: 'slopeR4a', dir: 1, run: 4, k: 0 },
  { tile: Tile.slopeR4b, char: '②', name: 'slopeR4b', dir: 1, run: 4, k: 1 },
  { tile: Tile.slopeR4c, char: '③', name: 'slopeR4c', dir: 1, run: 4, k: 2 },
  { tile: Tile.slopeR4d, char: '④', name: 'slopeR4d', dir: 1, run: 4, k: 3 },
  { tile: Tile.slopeR2a, char: '⑤', name: 'slopeR2a', dir: 1, run: 2, k: 0 },
  { tile: Tile.slopeR2b, char: '⑥', name: 'slopeR2b', dir: 1, run: 2, k: 1 },
  { tile: Tile.slopeR1, char: '◢', name: 'slopeR1', dir: 1, run: 1, k: 0 },
  { tile: Tile.slopeL4a, char: '⑴', name: 'slopeL4a', dir: -1, run: 4, k: 0 },
  { tile: Tile.slopeL4b, char: '⑵', name: 'slopeL4b', dir: -1, run: 4, k: 1 },
  { tile: Tile.slopeL4c, char: '⑶', name: 'slopeL4c', dir: -1, run: 4, k: 2 },
  { tile: Tile.slopeL4d, char: '⑷', name: 'slopeL4d', dir: -1, run: 4, k: 3 },
  { tile: Tile.slopeL2a, char: '⑸', name: 'slopeL2a', dir: -1, run: 2, k: 0 },
  { tile: Tile.slopeL2b, char: '⑹', name: 'slopeL2b', dir: -1, run: 2, k: 1 },
  { tile: Tile.slopeL1, char: '◣', name: 'slopeL1', dir: -1, run: 1, k: 0 },
];
export const SLOPE_FIRST: number = Tile.slopeR4a;
export const SLOPE_LAST: number = Tile.slopeL1;
export function isSlopeTile(t: number): boolean {
  return t >= SLOPE_FIRST && t <= SLOPE_LAST;
}
/** Slope shape for a tile value (undefined for non-slopes). */
export function slopeShape(t: number): SlopeShape | undefined {
  return isSlopeTile(t) ? SLOPE_SHAPES[t - SLOPE_FIRST] : undefined;
}
/** The mirrored slope (R <-> L, same run and k), by tile value. */
export function mirrorSlope(t: number): number {
  const s = slopeShape(t);
  if (!s) return t;
  const m = SLOPE_SHAPES.find((x) => x.dir === -s.dir && x.run === s.run && x.k === s.k);
  return m ? m.tile : t;
}
/** Surface height (px above the tile's bottom edge) at the tile's left (edge 0) or right (edge 1) boundary. */
export function slopeEdgeHeight(t: number, right: boolean, ts: number): number {
  const s = slopeShape(t);
  if (!s) return 0;
  const lo = (s.k * ts) / s.run;
  const hi = ((s.k + 1) * ts) / s.run;
  return s.dir > 0 === right ? hi : lo;
}

export const TILE_CHARS: Record<string, TileType> = {
  '#': Tile.solid,
  '.': Tile.empty,
  '=': Tile.oneWay,
  '^': Tile.spikeUp,
  v: Tile.spikeDown,
  '<': Tile.spikeLeft,
  '>': Tile.spikeRight,
  o: Tile.orb,
  ...Object.fromEntries(SLOPE_SHAPES.map((x) => [x.char, x.tile as TileType])),
  P: Tile.empty,
  R: Tile.empty,
  G: Tile.empty,
  g: Tile.empty,
  '+': Tile.empty,
};

export const Abilities = z.object({
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
  /** Other entities link to it by name (weights hang from it, lights run off it, reveals wait on it). */
  name: z.string().optional(),
  /** Solid while armed (humming walls, planks, hatches). false = hums but is not a platform (a chain, a roar). */
  solid: z.boolean().default(true),
});
/** A rect in sketch tiles (before padding): [x, y, w, h]. */
const TileRect = z.tuple([
  z.number().int(),
  z.number().int(),
  z.number().int().positive(),
  z.number().int().positive(),
]);
export const BREAK_BY = ['weight', 'strike', 'slab'] as const;
/** L6 set pieces (memory/level-authoring.md "L6 proof kit"). */
const WeightDef = z.object({ rect: TileRect, on: z.string() });
const BreakableDef = z.object({
  rect: TileRect,
  name: z.string().optional(),
  by: z.array(z.enum(BREAK_BY)).default(['weight', 'strike']),
});
const RevealDef = z.object({ rect: TileRect, after: z.string() });
const LightDef = z.object({
  rect: TileRect,
  source: z.string().optional(),
  radius: z.number().positive().optional(),
  colour: z.string().optional(),
});
const BarkDef = z.object({
  rect: TileRect,
  text: z.string().min(1),
  speaker: z.string().default(''),
  once: z.boolean().default(true),
});
const LineDef = z.object({ rect: TileRect, name: z.string().optional() });
const WaypointDef = z.object({
  at: z.tuple([z.number().int(), z.number().int()]),
  route: z.string().min(1),
  order: z.number().int().default(0),
});
export type WaypointDef = z.output<typeof WaypointDef>;
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

export const CAMERA_MODES = ['lock', 'clampX', 'clampY', 'bounds', 'open', 'vista', 'frame'] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];

const CameraZone = z.object({
  /** [tx, ty, tw, th] in tiles (sketch coordinates, before padding). */
  rect: z.tuple([
    z.number().int(),
    z.number().int(),
    z.number().int().positive(),
    z.number().int().positive(),
  ]),
  /**
   * lock/clampX/clampY/bounds: framing rules (movement-spec §4). north-star §3.1 adds `open` (free
   * follow, zoom 0.9: big chambers and runs), `vista` (free follow, zoom 0.8: set-piece spaces) and
   * `frame` (bias the view toward `value` by `weight`). Render-only: the sim never reads zones.
   */
  mode: z.enum(CAMERA_MODES),
  /** lock/clampX/clampY: view centre in tiles (defaults to the rect centre); frame: the bias point. */
  value: z.tuple([z.number(), z.number()]).optional(),
  /** Zoom held while inside (0.75-1.1; default: open 0.9, vista 0.8, others 1.0). */
  zoom: z.number().min(0.75).max(1.1).optional(),
  /** frame: 0 = free follow, 1 = centred on `value` (default 0.5). */
  weight: z.number().min(0).max(1).optional(),
  /**
   * Declared shot (north-star §3.1): on entering the zone the camera frames this rect (tiles,
   * [x, y, w, h]) at `zoom` (default: fit the rect), holds `hold` frames with input live, then
   * releases to the zone's own framing. Once per session unless `repeat`.
   */
  shot: z
    .object({
      rect: z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]),
      zoom: z.number().min(0.75).max(1.1).optional(),
      hold: z.number().int().positive().default(90),
      repeat: z.boolean().default(false),
    })
    .optional(),
});
export type CameraZoneDef = z.infer<typeof CameraZone>;

/** Beacon silhouettes (render-only): drawn in every nearby room's backdrop at true world position. */
export const BEACON_KINDS = ['bell', 'board', 'scale', 'glow'] as const;
const Landmark = z.object({
  name: z.string(),
  /** [tx, ty, tw, th], sketch tiles (the landmark's footprint; a beacon's silhouette fills it). */
  rect: z.tuple([
    z.number().int(),
    z.number().int(),
    z.number().int().positive(),
    z.number().int().positive(),
  ]),
  beacon: z.enum(BEACON_KINDS).optional(),
  /** Parallax factor of the beacon's backdrop copy (0 = sky, 1 = playfield; default 0.42). */
  depth: z.number().min(0.05).max(0.95).optional(),
});
export type LandmarkDef = z.infer<typeof Landmark>;

export const EDGE_SIDES = ['n', 's', 'e', 'w'] as const;
export type EdgeSide = (typeof EDGE_SIDES)[number];
const EdgeExit = z.object({
  side: z.enum(EDGE_SIDES),
  /** Span along the edge in tiles (x for n/s, y for e/w), inclusive. */
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  /** Room on the other side. */
  room: z.string(),
  /** That room's origin minus this room's origin, tiles (world layout). */
  offset: z.tuple([z.number().int(), z.number().int()]),
  /** Arrival spawn in `room` (its matching exit's spawn; used by tools). */
  spawn: z.string(),
});
export type EdgeExitDef = z.infer<typeof EdgeExit>;

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
    /**
     * Edge exits (compiled from the LDtk world, memory/level-authoring.md): along the span the room's
     * border is open (2 tiles deep), and when the body's centre crosses it the player moves into
     * `room` at the same world position, keeping velocity and state (a `transitionFrames` fade).
     */
    exits: z.array(EdgeExit).default([]),
    /** The carry rule (north star §3.4): rooms of one district share the bag, levied objects and ghosts. */
    district: z.string().optional(),
    /** Hanging weights (fall when their source is seized, smash breakables, rest as solid). */
    weights: z.array(WeightDef).default([]),
    /** Solid until broken (a falling weight, Kid's strike, a landing slab). */
    breakables: z.array(BreakableDef).default([]),
    /** Solid only after the named breakable broke (or named source was seized): debris stairs. */
    reveals: z.array(RevealDef).default([]),
    /** Lights for the render; dark while their source is seized (`power` events). */
    lights: z.array(LightDef).default([]),
    /** Text barks and Board lines: Kid entering the rect emits `bark` / `boardLine`. */
    barks: z.array(BarkDef).default([]),
    /** District lines: touching one resets the carry (`carryReset`). */
    lines: z.array(LineDef).default([]),
    /** Ordered routes (thief flights; staged bot searches in big rooms). */
    waypoints: z.array(WaypointDef).default([]),
    /** Enemy char -> waypoint route it uses (thief gulls). */
    enemyRoutes: z.record(Char, z.string()).default({}),
    /** Named landmarks (render-only; beacons are drawn in neighbouring rooms' backdrops). */
    landmarks: z.array(Landmark).default([]),
  })
  .superRefine((r, ctx) => {
    const sourceNames = new Set<string>();
    for (const s of Object.values(r.sources))
      if (s.name !== undefined) {
        if (sourceNames.has(s.name))
          ctx.addIssue({ code: 'custom', message: `two sources named "${s.name}"` });
        sourceNames.add(s.name);
      }
    const breakNames = new Set<string>();
    for (const b of r.breakables)
      if (b.name !== undefined) {
        if (breakNames.has(b.name) || sourceNames.has(b.name))
          ctx.addIssue({ code: 'custom', message: `name "${b.name}" is used twice` });
        breakNames.add(b.name);
      }
    for (const w of r.weights)
      if (!sourceNames.has(w.on))
        ctx.addIssue({ code: 'custom', message: `weight hangs on unknown source "${w.on}"` });
    for (const v of r.reveals)
      if (!sourceNames.has(v.after) && !breakNames.has(v.after))
        ctx.addIssue({ code: 'custom', message: `reveal waits on unknown breakable/source "${v.after}"` });
    for (const l of r.lights)
      if (l.source !== undefined && !sourceNames.has(l.source))
        ctx.addIssue({ code: 'custom', message: `light runs off unknown source "${l.source}"` });
    for (const ch of Object.keys(r.enemyRoutes)) {
      if (!(ch in r.enemies))
        ctx.addIssue({ code: 'custom', message: `enemyRoutes: "${ch}" is not an enemy char` });
      const route = r.enemyRoutes[ch];
      if (!r.waypoints.some((w) => w.route === route))
        ctx.addIssue({ code: 'custom', message: `enemyRoutes: no waypoints on route "${route}"` });
    }
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
    const W = r.rows[0]?.length ?? 0;
    const H = r.rows.length;
    for (const x of r.exits) {
      const len = x.side === 'n' || x.side === 's' ? W : H;
      if (x.to < x.from || x.to >= len)
        ctx.addIssue({
          code: 'custom',
          message: `exit ${x.side}${x.from}-${x.to} is outside the edge (0-${len - 1})`,
        });
    }
  });
export type RoomFile = z.input<typeof RoomFileSchema>;
