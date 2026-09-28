/**
 * The level model the world tools work on, and its text form, the ROOM SHEET
 * (docs/research/level-toolchain.md §2.4). One table (`ENTITY_SPECS`, `BRUSH_FIELDS`,
 * `LEVEL_FIELDS`) defines every brush, entity and level field: the LDtk defs (defs.ts), the
 * LDtk <-> model conversion (level.ts) and the sheet's Zod schema are all generated from it.
 *
 * Coordinates are TILES relative to the room's top-left; `at` is the room's world position in
 * tiles. Entities are `[x, y]` (a point = one tile) or `[x, y, w, h]` (a rect).
 */
import { z } from 'zod';
import { SLOPE_SHAPES } from '../../src/sim/world/room-schema';
import type { FieldKind } from './ldtk';

// ---------------------------------------------------------------------------------------------
// Collision values (IntGrid). Same numbers as the sim's `Tile` (src/sim/world/rooms.ts).
// 8..15 are reserved for slope tiles (level-toolchain §3.3). Paint uses 16 for "force air".

export const BASE_TILE_NAMES = [
  'solid',
  'oneWay',
  'spikeUp',
  'spikeDown',
  'spikeLeft',
  'spikeRight',
  'orb',
] as const;
/**
 * Floor slopes (the sim's SLOPE_SHAPES, same order): IntGrid values SLOPE_VALUE0 + i. They skip
 * PAINT_AIR (16) so an old Paint layer never reads as a slope.
 */
export const SLOPE_TILE_NAMES = [
  'slopeR4a',
  'slopeR4b',
  'slopeR4c',
  'slopeR4d',
  'slopeR2a',
  'slopeR2b',
  'slopeR1',
  'slopeL4a',
  'slopeL4b',
  'slopeL4c',
  'slopeL4d',
  'slopeL2a',
  'slopeL2b',
  'slopeL1',
] as const;
if (SLOPE_TILE_NAMES.some((n, i) => SLOPE_SHAPES[i]?.name !== n))
  throw new Error('SLOPE_TILE_NAMES must match the sim SLOPE_SHAPES order');
export const SLOPE_VALUE0 = 17;
export const TILE_NAMES = [...BASE_TILE_NAMES, ...SLOPE_TILE_NAMES] as const;
export type TileName = (typeof TILE_NAMES)[number];
export const tileValue = (t: TileName): number => {
  const b = (BASE_TILE_NAMES as readonly string[]).indexOf(t);
  return b >= 0 ? b + 1 : SLOPE_VALUE0 + (SLOPE_TILE_NAMES as readonly string[]).indexOf(t);
};
export const tileName = (v: number): TileName | undefined =>
  v >= SLOPE_VALUE0 ? SLOPE_TILE_NAMES[v - SLOPE_VALUE0] : BASE_TILE_NAMES[v - 1];
export const isSlopeValue = (v: number): boolean =>
  v >= SLOPE_VALUE0 && v < SLOPE_VALUE0 + SLOPE_TILE_NAMES.length;
/** The sim slope shape of an IntGrid value (undefined for non-slopes). */
export const slopeOfValue = (v: number) => (isSlopeValue(v) ? SLOPE_SHAPES[v - SLOPE_VALUE0] : undefined);
export const TILE_CHAR: Record<number, string> = {
  0: '.',
  1: '#',
  2: '=',
  3: '^',
  4: 'v',
  5: '<',
  6: '>',
  7: 'o',
  ...Object.fromEntries(SLOPE_SHAPES.map((s, i) => [SLOPE_VALUE0 + i, s.char])),
};
export const PAINT_AIR = 16;
/** Slope grades a ramp/curve brush may use (sheet form). */
export const GRADES = ['1:4', '1:2', '1:1'] as const;
export type Grade = (typeof GRADES)[number];
/** LDtk enum ids for the grades (identifiers can't contain ':'); '' = stairs (ramp) / default (curve). */
const GRADE_IDS = { '': 'none', '1:4': 'g1_4', '1:2': 'g1_2', '1:1': 'g1_1' } as const;
export const gradeToId = (g: Grade | ''): string => GRADE_IDS[g];
export const gradeFromId = (id: unknown): Grade | '' =>
  (Object.entries(GRADE_IDS).find(([, v]) => v === id)?.[0] as Grade | '' | undefined) ?? '';
export const PAINT_NAMES = [...TILE_NAMES, 'air'] as const;
export type PaintName = (typeof PAINT_NAMES)[number];
export const paintValue = (p: PaintName): number => (p === 'air' ? PAINT_AIR : tileValue(p));
export const paintName = (v: number): PaintName | undefined => (v === PAINT_AIR ? 'air' : tileName(v));

// ---------------------------------------------------------------------------------------------
// Enums (LDtk local enums; ids must be identifiers).

export const ENUMS = {
  Tile: TILE_NAMES,
  Op: ['add', 'carve'],
  Ability: ['wallJump', 'dash', 'doubleJump', 'pogo', 'seize', 'levy'],
  Colour: ['brown', 'pink', 'violet', 'white'],
  Enemy: ['auctioneer', 'barker', 'clerk', 'grinder', 'gull', 'runner', 'thiefgull'],
  CameraMode: ['lock', 'clampX', 'clampY', 'bounds', 'open', 'vista', 'frame'],
  Beacon: ['bell', 'board', 'scale', 'glow'],
  PromptKey: ['left', 'right', 'up', 'down', 'jump', 'dash', 'attack', 'seize', 'levy', 'special'],
  Hold: ['sealed', 'reach'],
  OpensOn: ['plate', 'clear'],
  PressedBy: ['slab', 'heavy'],
  Hazard: ['death', 'pip'],
  Grade: ['none', 'g1_4', 'g1_2', 'g1_1'],
  BreakBy: ['weight', 'strike', 'slab'],
} as const satisfies Record<string, readonly string[]>;
export type EnumName = keyof typeof ENUMS;

export interface FieldSpec {
  name: string;
  kind: FieldKind;
  array?: boolean;
  /** Nullable in LDtk; omitted from the sheet when null. */
  optional?: boolean;
  /** Value used when the sheet omits the field (and omitted again when equal on export). */
  def?: unknown;
  doc?: string;
}

const f = (name: string, kind: FieldKind, extra: Omit<FieldSpec, 'name' | 'kind'> = {}): FieldSpec => ({
  name,
  kind,
  ...extra,
});
const opt = (name: string, kind: FieldKind, doc?: string): FieldSpec => ({ name, kind, optional: true, doc });
const list = (name: string, kind: FieldKind, doc?: string): FieldSpec => ({
  name,
  kind,
  array: true,
  def: [],
  doc,
});
const CHAR = opt(
  'char',
  'String',
  'Pin the RoomFile character (ports, and doors other rooms refer to). Default: allocated.',
);

// ---------------------------------------------------------------------------------------------
// Brushes: shape primitives on the `Brushes` layer, applied in list order (CSG) by bake.ts.

export const SHAPES = [
  'fill',
  'rect',
  'blob',
  'tunnel',
  'shaft',
  'arch',
  'ledges',
  'poly',
  'ramp',
  'stamp',
  'curve',
] as const;
export type Shape = (typeof SHAPES)[number];
/** Shapes whose geometry is the entity's own rectangle (resizable in LDtk). */
export const RECT_SHAPES: readonly Shape[] = ['rect', 'blob', 'shaft', 'arch'];
/** Shapes whose geometry is the `pts` field (drawn as a path in LDtk). */
export const PATH_SHAPES: readonly Shape[] = ['tunnel', 'ledges', 'poly', 'ramp', 'curve'];

export const BRUSH_DOCS: Record<Shape, string> = {
  fill: 'Whole room. Usually the first brush (start from solid, then carve).',
  rect: 'Axis-aligned rectangle.',
  blob: 'Ellipse inscribed in the rect; `rough` tiles of seeded boundary noise. Organic chambers.',
  tunnel: 'Capsule along the `pts` polyline, `width` tiles across; `rough` wobbles the width. Caves.',
  shaft: 'A rect (vertical shaft); same raster as rect, named for intent.',
  arch: 'Upper half-ellipse of the rect (a vault or doorway top); `thick` > 0 = only a band that thick.',
  ledges: 'A platform `width` tiles long starting at each point (its top row), `thick` rows deep.',
  poly: 'Filled polygon through `pts` (tile-centre sampling).',
  ramp: 'Staircase under the line pts[0] -> pts[1], down to the lower end; with `grade` (1:4, 1:2, 1:1) a floor slope whose surface runs corner pts[0] -> corner pts[1].',
  curve:
    'Floor surface through the corner points `pts`, quantised to flat/1:4/1:2/1:1 slope tiles (`grade` = steepest allowed, default 1:2), solid under it.',
  stamp: 'Pastes content/stamps/<name>.json (ASCII; space = keep) at the entity; `flipX` mirrors.',
};

export const BRUSH_FIELDS: FieldSpec[] = [
  f('op', 'Enum:Op', { def: 'add', doc: 'add = write `tile`; carve = air.' }),
  f('tile', 'Enum:Tile', { def: 'solid' }),
  list('pts', 'Point', 'Path points (tunnel, ledges, poly, ramp), in tiles.'),
  f('width', 'Int', { def: 0, doc: 'Tunnel diameter / ledge length, tiles.' }),
  f('thick', 'Int', { def: 0, doc: 'Arch band / ledge depth, tiles (0 = default).' }),
  f('rough', 'Int', { def: 0, doc: 'Boundary noise amplitude, tiles.' }),
  f('seed', 'Int', { def: 0 }),
  f('grade', 'Enum:Grade', { def: 'none', doc: 'ramp: slope grade (none = stairs); curve: steepest grade.' }),
  opt('name', 'String', 'Stamp name.'),
  f('flipX', 'Bool', { def: false }),
  opt('tag', 'String', 'Free label (critical path, keep...).'),
];

export interface Brush {
  shape: Shape;
  op: 'add' | 'carve';
  tile: TileName;
  /** Rect shapes and stamps: [x, y, w, h] (stamps: w/h = stamp size). */
  rect?: [number, number, number, number];
  pts: [number, number][];
  width: number;
  thick: number;
  rough: number;
  seed: number;
  name?: string;
  flipX: boolean;
  tag?: string;
  /** LDtk grade id: none | g1_4 | g1_2 | g1_1 (sheet: omitted | "1:4" | "1:2" | "1:1"). */
  grade?: string;
}

// ---------------------------------------------------------------------------------------------
// Gameplay entities (`Entities` layer). `rect: true` = resizable (a tile rect), else one tile.

export const ENTITY_KINDS = [
  'spawn',
  'respawn',
  'goal',
  'corner',
  'door',
  'source',
  'plate',
  'gate',
  'enemy',
  'pickup',
  'rest',
  'prompt',
  'camera',
  'lock',
  'landmark',
  'weight',
  'breakable',
  'reveal',
  'light',
  'bark',
  'line',
  'waypoint',
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export interface EntitySpec {
  kind: EntityKind;
  rect: boolean;
  color: string;
  toc?: boolean;
  doc: string;
  fields: FieldSpec[];
}

export const ENTITY_SPECS: Record<EntityKind, EntitySpec> = {
  spawn: {
    kind: 'spawn',
    rect: false,
    color: '#3CE070',
    doc: 'Default spawn (P). Exactly one per room.',
    fields: [],
  },
  respawn: { kind: 'respawn', rect: false, color: '#9CE0A0', doc: 'Respawn marker (R).', fields: [] },
  goal: {
    kind: 'goal',
    rect: false,
    color: '#FFE040',
    doc: 'Goal (G), or optional goal (g). G leads to the level field `next`.',
    fields: [f('optional', 'Bool', { def: false })],
  },
  corner: {
    kind: 'corner',
    rect: false,
    color: '#E0A040',
    toc: true,
    doc: 'A Corner stool (+).',
    fields: [],
  },
  door: {
    kind: 'door',
    rect: false,
    color: '#40D0FF',
    toc: true,
    doc: 'Up-press door. `to` = room id; `toDoor` = a door name in that room (LDtk rooms) or its door char (ASCII rooms); omitted = its default spawn.',
    fields: [
      f('name', 'String', { doc: 'Unique in the room; other doors refer to it.' }),
      f('to', 'String'),
      opt('toDoor', 'String'),
      CHAR,
    ],
  },
  source: {
    kind: 'source',
    rect: true,
    color: '#C07418',
    doc: 'Humming object (rect = the source).',
    fields: [
      f('sound', 'String'),
      f('colour', 'Enum:Colour'),
      f('locked', 'Bool', { def: false }),
      opt('name', 'String', 'Link name: weights hang on it, lights run off it, reveals wait on it.'),
      f('solid', 'Bool', { def: true, doc: 'Solid while armed; false = hums but is not a platform.' }),
      CHAR,
    ],
  },
  plate: {
    kind: 'plate',
    rect: true,
    color: '#A0A0B0',
    doc: 'Pressure plate (solid tiles).',
    fields: [list('pressedBy', 'Enum:PressedBy'), CHAR],
  },
  gate: {
    kind: 'gate',
    rect: true,
    color: '#8080FF',
    toc: true,
    doc: 'Gate: solid until a plate is pressed or the room is clear.',
    fields: [
      f('opensOn', 'Enum:OpensOn', { def: 'plate' }),
      list('requires', 'Enum:Ability'),
      opt('hold', 'Enum:Hold'),
      list('moves', 'String'),
      CHAR,
    ],
  },
  enemy: {
    kind: 'enemy',
    rect: false,
    color: '#FF4040',
    doc: 'Enemy spawn (feet on this tile floor).',
    fields: [f('type', 'Enum:Enemy'), opt('route', 'String', 'Waypoint route it flies (thief gulls).'), CHAR],
  },
  pickup: {
    kind: 'pickup',
    rect: false,
    color: '#FF80FF',
    toc: true,
    doc: 'Ability pickup (progression).',
    fields: [list('grants', 'Enum:Ability'), opt('id', 'String'), CHAR],
  },
  rest: {
    kind: 'rest',
    rect: false,
    color: '#FFFFFF',
    toc: true,
    doc: 'Rest bench (progression).',
    fields: [opt('name', 'String'), CHAR],
  },
  prompt: {
    kind: 'prompt',
    rect: false,
    color: '#C0C0C0',
    doc: 'In-world key glyph (render-only).',
    fields: [list('keys', 'Enum:PromptKey'), opt('until', 'String'), opt('near', 'Float')],
  },
  camera: {
    kind: 'camera',
    rect: true,
    color: '#60A0FF',
    doc: 'Camera zone (memory/camera.md). `value` = view centre (tiles) for lock/clampX/clampY, bias point for frame; default = rect centre. `open` (zoom 0.9) and `vista` (0.8) hold a zoom while inside; `shot` (two corner points) declares a framed shot played on entry.',
    fields: [
      f('mode', 'Enum:CameraMode', { def: 'bounds' }),
      opt('value', 'Point'),
      opt('zoom', 'Float', 'Zoom held inside (0.75-1.1). Default: open 0.9, vista 0.8, else 1.0.'),
      opt('weight', 'Float', 'frame: pull toward `value`, 0-1 (default 0.5).'),
      list('shot', 'Point', 'Declared shot: two opposite corner tiles of the rect to frame on entry.'),
      opt('shotZoom', 'Float', 'Shot zoom (default: fit the shot rect, 0.75-1.1).'),
      opt('hold', 'Int', 'Shot hold, frames (default 90).'),
      f('repeat', 'Bool', { def: false, doc: 'Replay the shot on every entry (default: once).' }),
    ],
  },
  lock: {
    kind: 'lock',
    rect: true,
    color: '#FF8040',
    toc: true,
    doc: 'Progression lock: the rect (or `target`) should need `requires`.',
    fields: [
      f('name', 'String'),
      list('requires', 'Enum:Ability'),
      opt('target', 'String', 'Bot target instead of the rect (e.g. G).'),
      opt('from', 'String'),
      opt('prelude', 'String'),
      list('moves', 'String'),
      f('hold', 'Enum:Hold', { def: 'reach' }),
      f('teachGate', 'Bool', { def: false }),
      opt('region', 'String'),
      opt('note', 'Multilines'),
    ],
  },
  landmark: {
    kind: 'landmark',
    rect: true,
    color: '#FFD700',
    toc: true,
    doc: "A named landmark (level-toolchain §4.3): world map, toc, and with `beacon` a silhouette drawn in every nearby room's backdrop at its true world position (parallax `depth`, default 0.42).",
    fields: [
      f('name', 'String'),
      opt('note', 'Multilines'),
      opt('beacon', 'Enum:Beacon', 'Draw a beacon silhouette of this kind in nearby rooms.'),
      opt('depth', 'Float', 'Beacon parallax factor, 0.05-0.95 (default 0.42).'),
    ],
  },
  weight: {
    kind: 'weight',
    rect: true,
    color: '#B08840',
    doc: 'Hanging weight (the brass balls): solid; falls when source `on` is seized, smashes breakables, rests as solid.',
    fields: [f('on', 'String', { doc: 'Name of the source it hangs from.' })],
  },
  breakable: {
    kind: 'breakable',
    rect: true,
    color: '#A06040',
    toc: true,
    doc: 'Solid until broken by `by` (weight = a falling weight, strike = Kid hits it, slab = a brown slab lands on it). Its tiles compile to air.',
    fields: [opt('name', 'String'), list('by', 'Enum:BreakBy', 'Default: weight + strike.')],
  },
  reveal: {
    kind: 'reveal',
    rect: true,
    color: '#806050',
    doc: 'Solid only after the named breakable broke (or named source was seized): debris stairs.',
    fields: [f('after', 'String')],
  },
  light: {
    kind: 'light',
    rect: true,
    color: '#FFE070',
    doc: 'A light the render draws; dark while its `source` is seized (sim event `power`).',
    fields: [opt('source', 'String'), opt('radius', 'Float'), opt('colour', 'String')],
  },
  bark: {
    kind: 'bark',
    rect: true,
    color: '#F0F0A0',
    doc: 'Kid entering the rect emits `bark {text, speaker}` (speaker "board" emits `boardLine`). `text` = a short text id.',
    fields: [f('text', 'String'), f('speaker', 'String', { def: '' }), f('once', 'Bool', { def: true })],
  },
  line: {
    kind: 'line',
    rect: true,
    color: '#E0C0FF',
    toc: true,
    doc: 'A district line (Registry threshold): touching it resets the carry (sounds ribbon home).',
    fields: [opt('name', 'String')],
  },
  waypoint: {
    kind: 'waypoint',
    rect: false,
    color: '#80FF80',
    doc: 'A point on an ordered route: thief gull flights, staged bot searches in big rooms.',
    fields: [f('route', 'String'), f('order', 'Int', { def: 0 })],
  },
};

export interface Ent {
  kind: EntityKind;
  /** Tiles. Point entities have w = h = 1. */
  rect: [number, number, number, number];
  props: Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------
// Level fields.

export const LEVEL_FIELDS: FieldSpec[] = [
  f('name', 'String', { def: '' }),
  list('abilities', 'Enum:Ability', 'Abilities granted on entry (gym semantics, as RoomFile).'),
  f('hazard', 'Enum:Hazard', { def: 'death' }),
  f('spawnGrace', 'Int', { def: 0 }),
  opt('next', 'String', 'Where G leads.'),
  f('draft', 'Bool', {
    def: false,
    doc: 'Draft rooms load in the game but are not in the progression graph.',
  }),
  opt(
    'district',
    'String',
    'Carry district (north star §3.4): rooms of one district share the bag, levied objects and ghosts.',
  ),
  opt('claims', 'Multilines', 'RoomFile `claims` as JSON.'),
  opt('notes', 'Multilines'),
];

export interface LevelModel {
  id: string;
  /** World position, tiles. */
  at: [number, number];
  /** Size, tiles. */
  size: [number, number];
  fields: Record<string, unknown>;
  brushes: Brush[];
  entities: Ent[];
  /** Paint overrides, row-major, 0 = none (tile values, PAINT_AIR = air). */
  paint: Uint8Array;
  /** Baked collision as stored (row-major tile values). */
  collision: Uint8Array;
}

// ---------------------------------------------------------------------------------------------
// The room sheet (text form).

const Int = z.number().int();
const Pt = z.tuple([Int, Int]);
const RectT = z.tuple([Int, Int, Int.positive(), Int.positive()]);
const Op = z.enum(['add', 'carve']);
const BrushOpts = z.strictObject({
  tile: z.enum(TILE_NAMES).optional(),
  rough: Int.nonnegative().optional(),
  seed: Int.optional(),
  thick: Int.nonnegative().optional(),
  flipX: z.boolean().optional(),
  tag: z.string().optional(),
  grade: z.enum(GRADES).optional(),
});
type BrushOptsT = z.infer<typeof BrushOpts>;
const SPIKE_DIRS = { up: 'spikeUp', down: 'spikeDown', left: 'spikeLeft', right: 'spikeRight' } as const;

export const BrushTuple = z.union([
  z.tuple([z.literal('fill')], z.unknown()),
  z.tuple([z.enum(['rect', 'blob', 'shaft', 'arch']), Op, RectT], BrushOpts),
  z.tuple([z.enum(['tunnel', 'ledges']), Op, z.array(Pt).min(1), Int.positive()], BrushOpts),
  z.tuple([z.literal('poly'), Op, z.array(Pt).min(3)], BrushOpts),
  z.tuple([z.literal('ramp'), Op, Pt, Pt], BrushOpts),
  z.tuple([z.literal('curve'), Op, z.array(Pt).min(2)], BrushOpts),
  z.tuple([z.literal('stamp'), z.string().min(1), Pt], BrushOpts),
  z.tuple([z.literal('oneway'), Pt, Int.positive()], BrushOpts),
  z.tuple([z.literal('spikes'), z.enum(['up', 'down', 'left', 'right']), RectT], BrushOpts),
]);

export const EntTuple = z.union([
  z.tuple([z.enum(ENTITY_KINDS), Pt]),
  z.tuple([z.enum(ENTITY_KINDS), Pt, z.record(z.string(), z.unknown())]),
  z.tuple([z.enum(ENTITY_KINDS), RectT]),
  z.tuple([z.enum(ENTITY_KINDS), RectT, z.record(z.string(), z.unknown())]),
]);

export const SheetSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'room ids are kebab-case: <region>-<room>'),
  at: Pt,
  size: z.tuple([Int.positive(), Int.positive()]),
  name: z.string().optional(),
  abilities: z.array(z.enum(ENUMS.Ability)).optional(),
  hazard: z.enum(ENUMS.Hazard).optional(),
  spawnGrace: Int.nonnegative().optional(),
  next: z.string().optional(),
  draft: z.boolean().optional(),
  district: z.string().optional(),
  claims: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
  brushes: z.array(BrushTuple),
  entities: z.array(EntTuple).default([]),
  paint: z.array(z.tuple([Int, Int, Int.positive(), Int.positive(), z.enum(PAINT_NAMES)])).default([]),
});
export type Sheet = z.input<typeof SheetSchema>;

/** Zod for one entity's props, from its field specs (sheet form: Points are [x, y]). */
function propSchema(spec: EntitySpec) {
  const shape: Record<string, z.ZodType> = {};
  for (const fs of spec.fields) {
    let t: z.ZodType;
    if (fs.kind === 'Int') t = Int;
    else if (fs.kind === 'Float') t = z.number();
    else if (fs.kind === 'Bool') t = z.boolean();
    else if (fs.kind === 'Point') t = Pt;
    else if (fs.kind.startsWith('Enum:'))
      t = z.enum(ENUMS[fs.kind.slice(5) as EnumName] as unknown as readonly [string, ...string[]]);
    else t = z.string();
    if (fs.name === 'char') t = z.string().length(1);
    if (fs.array) t = z.array(t);
    const required = !fs.optional && fs.def === undefined;
    shape[fs.name] = required ? t : t.optional();
  }
  return z.strictObject(shape);
}
const PROP_SCHEMAS = Object.fromEntries(
  ENTITY_KINDS.map((k) => [k, propSchema(ENTITY_SPECS[k])]),
) as unknown as Record<EntityKind, z.ZodType<Record<string, unknown>>>;

export function brushFromTuple(t: z.infer<typeof BrushTuple>): Brush {
  const b: Brush = {
    shape: 'fill',
    op: 'add',
    tile: 'solid',
    pts: [],
    width: 0,
    thick: 0,
    rough: 0,
    seed: 0,
    flipX: false,
  };
  const opts = (o: unknown) => {
    const x = (o ?? {}) as BrushOptsT;
    if (x.tile) b.tile = x.tile;
    if (x.rough !== undefined) b.rough = x.rough;
    if (x.seed !== undefined) b.seed = x.seed;
    if (x.thick !== undefined) b.thick = x.thick;
    if (x.flipX !== undefined) b.flipX = x.flipX;
    if (x.tag !== undefined) b.tag = x.tag;
    if (x.grade !== undefined) b.grade = gradeToId(x.grade);
  };
  const [head] = t;
  if (head === 'fill') {
    const [, a, o] = t as unknown[];
    if (typeof a === 'string') b.tile = z.enum(TILE_NAMES).parse(a);
    opts(typeof a === 'object' ? BrushOpts.parse(a) : o === undefined ? undefined : BrushOpts.parse(o));
  } else if (head === 'rect' || head === 'blob' || head === 'shaft' || head === 'arch') {
    const [shape, op, rect, o] = t as [Shape, 'add' | 'carve', Brush['rect'], unknown];
    Object.assign(b, { shape, op, rect });
    opts(o);
  } else if (head === 'tunnel' || head === 'ledges') {
    const [shape, op, pts, width, o] = t as [Shape, 'add' | 'carve', [number, number][], number, unknown];
    Object.assign(b, { shape, op, pts, width });
    opts(o);
  } else if (head === 'poly') {
    const [, op, pts, o] = t as [Shape, 'add' | 'carve', [number, number][], unknown];
    Object.assign(b, { shape: 'poly', op, pts });
    opts(o);
  } else if (head === 'ramp') {
    const [, op, a, c, o] = t as [Shape, 'add' | 'carve', [number, number], [number, number], unknown];
    Object.assign(b, { shape: 'ramp', op, pts: [a, c] });
    opts(o);
  } else if (head === 'curve') {
    const [, op, pts, o] = t as [Shape, 'add' | 'carve', [number, number][], unknown];
    Object.assign(b, { shape: 'curve', op, pts });
    opts(o);
  } else if (head === 'stamp') {
    const [, name, at, o] = t as [Shape, string, [number, number], unknown];
    Object.assign(b, { shape: 'stamp', name, rect: [at[0], at[1], 1, 1] });
    opts(o);
  } else if (head === 'oneway') {
    const [, at, w, o] = t as ['oneway', [number, number], number, unknown];
    Object.assign(b, { shape: 'rect', rect: [at[0], at[1], w, 1] });
    opts(o);
    b.tile = 'oneWay';
  } else if (head === 'spikes') {
    const [, dir, rect, o] = t as ['spikes', keyof typeof SPIKE_DIRS, Brush['rect'], unknown];
    Object.assign(b, { shape: 'rect', rect });
    opts(o);
    b.tile = SPIKE_DIRS[dir];
  }
  return b;
}

export function brushToTuple(b: Brush): unknown[] {
  const o: Record<string, unknown> = {};
  if (b.rough) o.rough = b.rough;
  if (b.seed) o.seed = b.seed;
  if (b.thick) o.thick = b.thick;
  if (b.flipX) o.flipX = true;
  if (b.tag) o.tag = b.tag;
  if (b.grade && b.grade !== 'none') o.grade = gradeFromId(b.grade);
  const withTile = () => (b.tile !== 'solid' ? { tile: b.tile, ...o } : o);
  const tail = (x: Record<string, unknown>) => (Object.keys(x).length ? [x] : []);
  switch (b.shape) {
    case 'fill':
      return ['fill', ...(b.tile === 'solid' ? [] : [b.tile]), ...tail(o)];
    case 'rect': {
      const r = b.rect as [number, number, number, number];
      if (b.op === 'add' && b.tile === 'oneWay' && r[3] === 1)
        return ['oneway', [r[0], r[1]], r[2], ...tail(o)];
      const dir = Object.entries(SPIKE_DIRS).find(([, v]) => v === b.tile)?.[0];
      if (b.op === 'add' && dir) return ['spikes', dir, r, ...tail(o)];
      return ['rect', b.op, r, ...tail(b.op === 'add' ? withTile() : o)];
    }
    case 'blob':
    case 'shaft':
    case 'arch':
      return [b.shape, b.op, b.rect, ...tail(b.op === 'add' ? withTile() : o)];
    case 'tunnel':
    case 'ledges':
      return [b.shape, b.op, b.pts, b.width, ...tail(b.op === 'add' ? withTile() : o)];
    case 'poly':
      return ['poly', b.op, b.pts, ...tail(b.op === 'add' ? withTile() : o)];
    case 'ramp':
      return ['ramp', b.op, b.pts[0], b.pts[1], ...tail(b.op === 'add' ? withTile() : o)];
    case 'curve':
      return ['curve', b.op, b.pts, ...tail(o)];
    case 'stamp': {
      const r = b.rect as [number, number, number, number];
      return ['stamp', b.name, [r[0], r[1]], ...tail(o)];
    }
  }
}

/** Sheet props -> full props (defaults filled). Throws with the entity index on bad props. */
export function entFromTuple(t: z.infer<typeof EntTuple>, i: number): Ent {
  const [kind, pos, props] = t as [EntityKind, number[], Record<string, unknown> | undefined];
  const spec = ENTITY_SPECS[kind];
  const rect: Ent['rect'] =
    pos.length === 4 ? (pos as Ent['rect']) : [pos[0] as number, pos[1] as number, 1, 1];
  if (!spec.rect && (rect[2] !== 1 || rect[3] !== 1))
    throw new Error(`entities[${i}] ${kind} is a point entity: give [x, y]`);
  const parsed = PROP_SCHEMAS[kind].safeParse(props ?? {});
  if (!parsed.success)
    throw new Error(
      `entities[${i}] ${kind}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`,
    );
  const full: Record<string, unknown> = {};
  for (const fs of spec.fields) {
    const v = parsed.data[fs.name];
    if (v !== undefined) full[fs.name] = v;
    else if (fs.def !== undefined) full[fs.name] = structuredClone(fs.def);
  }
  return { kind, rect, props: full };
}

export function entToTuple(e: Ent): unknown[] {
  const spec = ENTITY_SPECS[e.kind];
  const props: Record<string, unknown> = {};
  for (const fs of spec.fields) {
    const v = e.props[fs.name];
    if (v === undefined || v === null) continue;
    if (fs.def !== undefined && JSON.stringify(v) === JSON.stringify(fs.def)) continue;
    props[fs.name] = v;
  }
  const pos = spec.rect ? e.rect : [e.rect[0], e.rect[1]];
  return Object.keys(props).length ? [e.kind, pos, props] : [e.kind, pos];
}

/** Parses a sheet into a model. Collision is left empty (bake fills it). */
export function sheetToModel(input: unknown): LevelModel {
  const s = SheetSchema.parse(input);
  const [w, h] = s.size;
  const paint = new Uint8Array(w * h);
  for (const [x, y, pw, ph, name] of s.paint)
    for (let ty = y; ty < y + ph; ty++)
      for (let tx = x; tx < x + pw; tx++)
        if (tx >= 0 && ty >= 0 && tx < w && ty < h) paint[ty * w + tx] = paintValue(name);
  const fields: Record<string, unknown> = {};
  for (const fs of LEVEL_FIELDS) {
    const v = (s as Record<string, unknown>)[fs.name];
    if (v !== undefined) fields[fs.name] = fs.name === 'claims' ? JSON.stringify(v) : v;
    else if (fs.def !== undefined) fields[fs.name] = structuredClone(fs.def);
  }
  return {
    id: s.id,
    at: s.at,
    size: s.size,
    fields,
    brushes: s.brushes.map(brushFromTuple),
    entities: s.entities.map(entFromTuple),
    paint,
    collision: new Uint8Array(w * h),
  };
}

/** Greedy row-major rectangle cover of equal non-zero values (paint export, ports). */
export function rectCover(
  grid: ArrayLike<number>,
  w: number,
  h: number,
  skip = 0,
): [number, number, number, number, number][] {
  const done = new Uint8Array(w * h);
  const out: [number, number, number, number, number][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = grid[y * w + x] as number;
      if (v === skip || done[y * w + x]) continue;
      let rw = 1;
      while (x + rw < w && grid[y * w + x + rw] === v && !done[y * w + x + rw]) rw++;
      let rh = 1;
      grow: while (y + rh < h) {
        for (let i = 0; i < rw; i++)
          if (grid[(y + rh) * w + x + i] !== v || done[(y + rh) * w + x + i]) break grow;
        rh++;
      }
      for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) done[yy * w + xx] = 1;
      out.push([x, y, rw, rh, v]);
    }
  return out;
}

/** Model -> canonical sheet object (stable key order; defaults omitted). */
export function modelToSheet(m: LevelModel): Record<string, unknown> {
  const out: Record<string, unknown> = { id: m.id, at: m.at, size: m.size };
  for (const fs of LEVEL_FIELDS) {
    const v = m.fields[fs.name];
    if (v === undefined || v === null) continue;
    if (fs.def !== undefined && JSON.stringify(v) === JSON.stringify(fs.def)) continue;
    out[fs.name] = fs.name === 'claims' ? JSON.parse(String(v)) : v;
  }
  out.brushes = m.brushes.map(brushToTuple);
  out.entities = m.entities.map(entToTuple);
  const paint = rectCover(m.paint, m.size[0], m.size[1]).map(([x, y, w, h, v]) => [x, y, w, h, paintName(v)]);
  if (paint.length) out.paint = paint;
  return out;
}

/** Sheet JSON with one brush / entity / paint rect per line (what agents read and diff). */
export function formatSheet(sheet: Record<string, unknown>): string {
  const lines: string[] = ['{'];
  const entries = Object.entries(sheet);
  entries.forEach(([k, v], i) => {
    const comma = i < entries.length - 1 ? ',' : '';
    if (Array.isArray(v) && (k === 'brushes' || k === 'entities' || k === 'paint')) {
      if (v.length === 0) lines.push(`  ${JSON.stringify(k)}: []${comma}`);
      else {
        lines.push(`  ${JSON.stringify(k)}: [`);
        v.forEach((x, j) => {
          lines.push(`    ${JSON.stringify(x)}${j < v.length - 1 ? ',' : ''}`);
        });
        lines.push(`  ]${comma}`);
      }
    } else lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${comma}`);
  });
  lines.push('}');
  return `${lines.join('\n')}\n`;
}
