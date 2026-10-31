/**
 * The Canopy v3 (docs/design/levels/first-area.md; reviews: docs/design/levels/reviews/canopy-r1.md, canopy-r2.md).
 * Writes content/worlds/canopy-rooms.json and content/worlds/canopy.json:
 *   npx tsx tools/levels/canopy.ts && npx biome format --write content/worlds/canopy*.json
 *   npx tsx tools/levels/canopy-check.ts          (the world check)
 *   npx tsx tools/solve/canopy.ts [room ...]      (the reach and lock proofs)
 * Edit this file, never the JSON.
 *
 * The rooms are **mass with caves carved out** (the references' maps are black mass with beige carved into it):
 * every room starts solid, its caves are carved (`cave`: a rect with a bitten outline, `air`: a plain rect), then
 * `fill()` cuts what is left into `root` / `ground` rects that the wood kit paints as bulk. Limbs and trees stand in
 * the carved air. Exits come from one link table (`LINKS`): each link names two placed rooms and the shared opening,
 * and both mirrors are written from it with equal spans. v3: every room at least 2560 x 1440 (21:9 and headroom),
 * the world packed without holes between rooms, two side branches of 8-12 screens.
 *
 * The area (world px; one screen = 1920 x 1080); `*` = on the critical path:
 *   * hatch (the opening, ~5 screens) -> * hub (the Crossing: landing, save, seed door, the lit way west)
 *   west: * trunk (down inside a fallen giant: the rotten wall that teaches breaking, seed 1) -> * well (the
 *         Elder's shaft: claws at the bottom, a three-leg climb, the ambush hollow) -> * limbs (back to the hub's
 *         high limb, a jump at the edge over thorns)
 *         the rot branch: rot (a second way down) > crawl (a low winding tunnel) > webs (the weaver's orb web)
 *         > elder (a tall root room, the moonDrop; its plug opens into the well)
 *   east: * fork (claw face to the Grove; a glide-only shelf in its sky) -> * grove (the Grovemother, seed 2)
 *         -> * spire (a wide chimney with a hawker on a lamp's rhythm) > nook (stone), hollowroot (quick wings)
 *         the cellar branch: cellar (a root cellar, ants; a trapdoor and the shortcut from the tunnel) > galleries
 *         (the ants' nest) > larder (the moonDrop)
 *   high: * bower (the kin climb) -> * crown (glide) ; * gap (the vista: glide to the far limb, seed 3, drop to the
 *         hub) > attic (a dangler nest, long breath), sky (a hawker roost, night eyes)
 *   deep: * tunnel (under the seed door: a glide over a thorn pit) -> * den (the old burrback) -> * out (a cliff
 *         over the valley, a glide to the next area's door) > burrow (stone), ledge (a hoard)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { type Json, RoomBuilder } from './lib';

const OUT_ROOMS = 'content/worlds/canopy-rooms.json';
const OUT_WORLD = 'content/worlds/canopy.json';

// ---------------------------------------------------------------------------------------------------------------
// The frame: where each room sits (world px) and the links between them.

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** No room is smaller than this (21:9 at the safe height, plus headroom): review r2 #2. */
const MIN_W = 2560;
const MIN_H = 1440;

/** Every room's world rect. Rows share edges (no holes between rooms inside the area). */
export const PLACE: Record<string, Box> = {
  // High.
  'cn-sky': { x: 8192, y: -1952, w: 2560, h: 1440 },
  'cn-crown': { x: 10752, y: -1792, w: 2560, h: 1920 },
  'cn-gap': { x: 6400, y: -512, w: 4352, h: 2304 },
  'cn-hatch': { x: 0, y: 128, w: 6400, h: 1664 },
  'cn-bower': { x: 10752, y: 128, w: 4736, h: 1664 },
  'cn-attic': { x: 15488, y: 352, w: 2560, h: 1440 },
  // The main band (y 1792).
  'cn-well': { x: -6720, y: 1792, w: 2560, h: 4992 },
  'cn-limbs': { x: -4160, y: 1792, w: 3200, h: 1536 },
  // (Review r5 #9: the hub widened west by 3,520 into a place, the west rooms moved with it.)
  'cn-hub': { x: -960, y: 1792, w: 8000, h: 2304 },
  'cn-fork': { x: 7040, y: 1792, w: 3200, h: 1920 },
  'cn-grove': { x: 10240, y: 1792, w: 3840, h: 1920 },
  'cn-spire': { x: 14080, y: 1792, w: 2560, h: 1920 },
  'cn-nook': { x: 16640, y: 1792, w: 2560, h: 1440 },
  // (r7, review r6 #1: a quiet room, grown down into a deeper hollow with the one find at its foot.)
  'cn-hollowroot': { x: 16640, y: 3232, w: 2560, h: 1920 },
  // Under it.
  'cn-trunk': { x: -4160, y: 3328, w: 3200, h: 1920 },
  // (r7, review r6 #10: the tunnel and the burrow grown west under the hub's west half, 3,520 px (`TX`): the notch
  // the hub's widening left is closed, and the tunnel's west hall is its bramble run.)
  'cn-tunnel': { x: -960, y: 4096, w: 8000, h: 2176 },
  'cn-cellar': { x: 7040, y: 3712, w: 3200, h: 1920 },
  'cn-galleries': { x: 10240, y: 3712, w: 3840, h: 1920 },
  'cn-larder': { x: 14080, y: 3712, w: 2560, h: 1920 },
  'cn-rot': { x: -4160, y: 5248, w: 3200, h: 1536 },
  'cn-den': { x: 7040, y: 5632, w: 3840, h: 1536 },
  'cn-out': { x: 10880, y: 5632, w: 3840, h: 2432 },
  'cn-burrow': { x: -960, y: 6272, w: 6720, h: 1440 },
  'cn-crawl': { x: -4160, y: 6784, w: 3200, h: 1440 },
  'cn-webs': { x: -6720, y: 6784, w: 2560, h: 1440 },
  'cn-elder': { x: -9280, y: 5568, w: 2560, h: 2656 },
  'cn-ledge': { x: 8320, y: 7168, w: 2560, h: 1440 },
};

/**
 * A link: rooms `a` and `b` share an edge; `at` is the opening's floor (world y) on a side edge, or its west end
 * (world x) on a top / bottom edge; `span` its size (side: the height over the floor, default 256; top / bottom: the
 * width, default 256). `one`: the room she only leaves by it (a drop). Exit ids default to the other room's name.
 */
interface Link {
  a: string;
  b: string;
  at: number;
  span?: number;
  one?: 'a' | 'b';
  ida?: string;
  idb?: string;
}

const LINKS: Link[] = [
  // The hatch's drop (the branch's end) into the Crossing, east of its middle: the way on is west.
  { a: 'cn-hatch', b: 'cn-hub', at: 5120, span: 1280, one: 'a', ida: 'drop', idb: 'hatch' },
  // The Crossing: the fallen giant (low west), the upper limbs (high west), the fork (east), the seed door.
  { a: 'cn-hub', b: 'cn-trunk', at: 3712 },
  { a: 'cn-hub', b: 'cn-limbs', at: 2368 },
  // (r6, review r5 #10: a covered vent from the limbs' floor into the chamber behind the hub's high rotten wall.)
  { a: 'cn-limbs', b: 'cn-hub', at: 3264, span: 192, ida: 'vent', idb: 'vent' },
  { a: 'cn-hub', b: 'cn-fork', at: 3136 },
  { a: 'cn-hub', b: 'cn-tunnel', at: 4352, ida: 'door', idb: 'hub' },
  { a: 'cn-gap', b: 'cn-hub', at: 6528, span: 384, one: 'a' },
  // West, and the rot branch.
  { a: 'cn-trunk', b: 'cn-well', at: 4992 },
  { a: 'cn-trunk', b: 'cn-rot', at: -3072, span: 192, one: 'a' },
  { a: 'cn-limbs', b: 'cn-well', at: 2560 },
  { a: 'cn-rot', b: 'cn-well', at: 6720 },
  { a: 'cn-rot', b: 'cn-crawl', at: -3264, span: 192 },
  { a: 'cn-crawl', b: 'cn-webs', at: 8064 },
  { a: 'cn-webs', b: 'cn-elder', at: 8064 },
  { a: 'cn-elder', b: 'cn-well', at: 6720 },
  // East, and the cellar branch.
  { a: 'cn-fork', b: 'cn-grove', at: 2368 },
  { a: 'cn-fork', b: 'cn-cellar', at: 7424, span: 192 },
  // (r7: the drop to the fork at the floor's east end, by the shelf's foot: the floor west of it is the bramble run.)
  { a: 'cn-gap', b: 'cn-fork', at: 9600, one: 'a' },
  { a: 'cn-grove', b: 'cn-spire', at: 3264 },
  { a: 'cn-spire', b: 'cn-nook', at: 2688 },
  { a: 'cn-spire', b: 'cn-hollowroot', at: 3648 },
  { a: 'cn-cellar', b: 'cn-galleries', at: 4416 },
  { a: 'cn-galleries', b: 'cn-larder', at: 4352 },
  // High.
  { a: 'cn-bower', b: 'cn-spire', at: 14720, span: 640 },
  { a: 'cn-crown', b: 'cn-bower', at: 12032 },
  { a: 'cn-attic', b: 'cn-bower', at: 1536 },
  { a: 'cn-gap', b: 'cn-bower', at: 832 },
  { a: 'cn-sky', b: 'cn-gap', at: 9344, span: 192 },
  // Deep.
  // (r10: the den's mouth at the warning's floor, an arch in the tunnel's east wall.)
  { a: 'cn-tunnel', b: 'cn-den', at: 5952 },
  { a: 'cn-tunnel', b: 'cn-cellar', at: 5504 },
  { a: 'cn-tunnel', b: 'cn-burrow', at: 3328, span: 192 },
  // (r8, review r7 #7: the nest's shaft from the tunnel's west hall.)
  { a: 'cn-tunnel', b: 'cn-burrow', at: -384, span: 192, ida: 'nest', idb: 'hall' },
  // (r11, review r10 #1: the den's way out was up through its roof onto the way out's clifftop. r15, review r14 #1: the
  // escape needs the clifftop's chimney under the front, so the way out is low again (v10's): the arena's east wall
  // torn open at the floor by the collapse, a root corridor into the way out's pocket, its shaft, the chimney.)
  { a: 'cn-den', b: 'cn-out', at: 6976 },
  { a: 'cn-out', b: 'cn-ledge', at: 7936 },
];

interface Exit {
  id: string;
  edge: 'n' | 's' | 'e' | 'w';
  from: number;
  to: number;
  oneWay?: boolean;
}

const short = (id: string) => id.replace(/^cn-/, '');

/** Each room's exits, both mirrors of every link, local px. */
function exitsOf(): Map<string, Exit[]> {
  const out = new Map<string, Exit[]>(Object.keys(PLACE).map((k) => [k, []]));
  for (const l of LINKS) {
    const A = PLACE[l.a] as Box;
    const B = PLACE[l.b] as Box;
    const ida = l.ida ?? short(l.b);
    const idb = l.idb ?? short(l.a);
    const push = (room: string, e: Exit) => (out.get(room) as Exit[]).push(e);
    if (A.x + A.w === B.x || B.x + B.w === A.x) {
      const span = l.span ?? 256;
      const [y0, y1] = [l.at - span, l.at];
      for (const [r, R] of [
        [l.a, A],
        [l.b, B],
      ] as const)
        if (y0 < R.y || y1 > R.y + R.h) throw new Error(`link ${l.a}|${l.b}: the opening leaves ${r}`);
      const aWest = A.x < B.x;
      push(l.a, {
        id: ida,
        edge: aWest ? 'e' : 'w',
        from: y0 - A.y,
        to: y1 - A.y,
        oneWay: l.one === 'a' || undefined,
      });
      push(l.b, {
        id: idb,
        edge: aWest ? 'w' : 'e',
        from: y0 - B.y,
        to: y1 - B.y,
        oneWay: l.one === 'b' || undefined,
      });
    } else if (A.y + A.h === B.y || B.y + B.h === A.y) {
      const span = l.span ?? 256;
      const [x0, x1] = [l.at, l.at + span];
      for (const [r, R] of [
        [l.a, A],
        [l.b, B],
      ] as const)
        if (x0 < R.x || x1 > R.x + R.w) throw new Error(`link ${l.a}|${l.b}: the opening leaves ${r}`);
      const aAbove = A.y < B.y;
      push(l.a, {
        id: ida,
        edge: aAbove ? 's' : 'n',
        from: x0 - A.x,
        to: x1 - A.x,
        oneWay: l.one === 'a' || undefined,
      });
      push(l.b, {
        id: idb,
        edge: aAbove ? 'n' : 's',
        from: x0 - B.x,
        to: x1 - B.x,
        oneWay: l.one === 'b' || undefined,
      });
    } else throw new Error(`link ${l.a}|${l.b}: the rooms share no edge`);
  }
  return out;
}

const EXITS = exitsOf();

/** A small deterministic hash (no Math.random in generated content). */
function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// ---------------------------------------------------------------------------------------------------------------
// A wood room: carved out of mass, with limbs and trees in the air.

type Mood = 'cool' | 'warm' | 'deep';

/** The bite options of a cave: `ceil` the deepest bite up into its roof, `w` / `e` into its walls (0: straight),
 * `corner` the cut at its top corners, `skip` x ranges whose roof stays straight (thorns under it, a niche). */
interface Bite {
  ceil?: number;
  w?: number;
  e?: number;
  corner?: number;
  skip?: Array<[number, number]>;
}

class Wood extends RoomBuilder {
  private n = 0;
  readonly W: number;
  readonly H: number;
  /** The carved air (x, y, w, h), before `fill`. */
  private readonly caves: Box[] = [];
  private filled = false;
  readonly ex: Map<string, Exit>;
  private readonly seedN: number;

  constructor(
    id: string,
    title: string,
    spawn: [number, number],
    seed: number,
    o: {
      art?: Json;
      mood?: Mood;
      /** `ground` = packed earth (the deep), `root` = the wood's heartwood and roots. */
      mass?: 'root' | 'ground';
      /** The whole room has a back wall (inside the wood or the earth: no sky). */
      back?: boolean;
    } = {},
  ) {
    const P = PLACE[id] as Box;
    // Enclosed rooms show no moon (it would hang in the heartwood); the open ones place theirs.
    const dark = o.back
      ? { moon: { x: 1420, y: -600, r: 40 }, afterglow: { x: 900, y: 900, strength: 0 } }
      : {};
    super(id, P.w, P.h, spawn, {
      title,
      region: 'wood',
      edgeKick: false,
      senses: 'lamp',
      abilities: [],
      art: {
        kit: 'wood',
        seed,
        pieces: true,
        moon: { x: 1420, y: 190, r: 88 },
        afterglow: { x: 1500, y: 850, strength: 0.4 },
        moods: [{ x: 0, mood: o.mood ?? 'cool' }],
        anchorX: Math.round(P.w / 2),
        anchorY: Math.round(P.h / 2),
        ...dark,
        ...(o.art ?? {}),
      },
    });
    this.W = P.w;
    this.H = P.h;
    this.seedN = seed;
    this.massTag = o.mass ?? 'root';
    this.set('marks', { trees: [], stretches: [], covers: [], landmarks: [], places: [], backs: [] });
    // (A room roofed in mass shows nothing over its top: no sky band above the view's edge.)
    // (Nor can she stand on it or fly out over a wall's top: the top edge is solid but for its exits, `roof`.)
    if (o.back) this.back(0, 0, P.w, P.h).set('camera', { headroom: 0 }).set('roof', true);
    const exits = EXITS.get(id) ?? [];
    this.set('exits', exits);
    this.ex = new Map(exits.map((e) => [e.id, e]));
    // Every opening is carved a little way in (the room's own caves meet it).
    for (const e of exits) {
      const d = 128;
      if (e.edge === 'w') this.air(0, e.from, d, e.to);
      if (e.edge === 'e') this.air(this.W - d, e.from, this.W, e.to);
      if (e.edge === 'n') this.air(e.from, 0, e.to, d);
      if (e.edge === 's') this.air(e.from, this.H - d, e.to, this.H);
    }
  }

  private readonly massTag: 'root' | 'ground';

  /** A back wall over (x0, y0)-(x1, y1): the carved space there is inside the wood, not open to the sky. */
  back(x0: number, y0: number, x1: number, y1: number): this {
    return this.mark('backs', { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }

  /** Carves air from (x0, y0) to (x1, y1). */
  air(x0: number, y0: number, x1: number, y1: number): this {
    if (this.filled) throw new Error(`${this.data.id}: air after fill`);
    this.caves.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    return this;
  }

  /**
   * Carves a cave with a bitten outline (review r2 #2: the caves must not be rectangles): the top corners cut,
   * the roof raised in irregular steps (`ceil` deep at most, every 192-320 px), the walls stepped back (`w` / `e`
   * deep at most, every 256 px). The floor stays flat (walk tops), and so does anything a mechanic needs straight:
   * pass 0 for a claw face or a roof with thorns under it, or `skip` its x range. Bites never come within 64 px of
   * the room's edge.
   */
  cave(x0: number, y0: number, x1: number, y1: number, o: Bite = {}): this {
    const ceil = o.ceil ?? 96;
    const bw = o.w ?? 64;
    const be = o.e ?? 64;
    const c = o.corner ?? 64;
    const cut = c > 0 && x1 - x0 > 4 * c && y1 - y0 > 3 * c ? c : 0;
    if (cut) {
      this.air(x0, y0 + cut, x1, y1);
      this.air(x0 + cut, y0, x1 - cut, y0 + cut);
    } else this.air(x0, y0, x1, y1);
    const s = this.seedN;
    const snap = (v: number) => Math.round(v / 32) * 32;
    if (ceil > 0) {
      const widths = [192, 256, 320, 224, 288];
      const depths = [0, 64, 96, 128, 160, 96, 64, 0, 128, 32];
      let x = x0 + cut + 32;
      let i = 0;
      while (x < x1 - cut - 96) {
        const w = Math.min(widths[hash(s, x0 + i, y0) % widths.length] as number, x1 - cut - 32 - x);
        const d = snap(Math.min(ceil, depths[hash(s, y0 + i, x0 + 7) % depths.length] as number));
        const free = !(o.skip ?? []).some(([a, b]) => x < b && x + w > a);
        if (d > 0 && free && w >= 96 && y0 - d >= 64) this.air(x, y0 - d, x + w, y0);
        x += w;
        i++;
      }
    }
    const wall = (side: 'w' | 'e', deep: number) => {
      if (deep <= 0) return;
      const heights = [192, 256, 224];
      const depths = [0, 32, 64, 96, 64, 0, 32];
      let y = y0 + cut + 32;
      let i = 0;
      while (y + 160 <= y1 - 96) {
        const h = Math.min(
          heights[hash(s, y + i, x0 + (side === 'w' ? 1 : 2)) % heights.length] as number,
          y1 - 96 - y,
        );
        const d = snap(Math.min(deep, depths[hash(s + i, y, x1) % depths.length] as number));
        if (d > 0 && side === 'w' && x0 - d >= 64) this.air(x0 - d, y, x0, y + h);
        if (d > 0 && side === 'e' && x1 + d <= this.W - 64) this.air(x1, y, x1 + d, y + h);
        y += h + 64;
        i++;
      }
    };
    wall('w', bw);
    wall('e', be);
    return this;
  }

  /** A plain cave (no bites): a corridor, a shaft, a claw chimney. */
  hole(x0: number, y0: number, x1: number, y1: number): this {
    return this.cave(x0, y0, x1, y1, { ceil: 0, w: 0, e: 0, corner: 0 });
  }

  /**
   * Sealed air behind the walls (r9, review r8 #2: frames a third to a half deep solid, the slabs inside the camera's
   * bounds): every bit of mass more than `d` px from any carved air or the room's edge is carved out as air she can
   * never reach, with the deep back behind it (`marks.backs`) and listed in `marks.sealed` (the area export counts it
   * as rock: tools/reference/export-area.ts). Walls become shells `d` thick, pillars and boughs with the back behind
   * them. Call before `fill`, after every cave; a sealed rect never comes within `d` of anything she can reach.
   */
  sealDeep(d = 256, cell = 32): this {
    const nx = Math.ceil(this.W / cell);
    const ny = Math.ceil(this.H / cell);
    const open = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const x = (i + 0.5) * cell;
        const y = (j + 0.5) * cell;
        if (this.caves.some((c) => x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h))
          open[j * nx + i] = 1;
      }
    // Distance (cells, Chebyshev) from the nearest open cell or the room's edge.
    const k = Math.ceil(d / cell);
    const deep = (i: number, j: number) => {
      if (i < k || j < k || i >= nx - k || j >= ny - k) return false;
      for (let b = j - k; b <= j + k; b++)
        for (let a = i - k; a <= i + k; a++) if (open[b * nx + a]) return false;
      return true;
    };
    const rows: Array<Array<[number, number]>> = [];
    for (let j = 0; j < ny; j++) {
      const runs: Array<[number, number]> = [];
      for (let i = 0; i < nx; i++) {
        if (!deep(i, j)) continue;
        const last = runs[runs.length - 1];
        if (last && last[1] === i) last[1] = i + 1;
        else runs.push([i, i + 1]);
      }
      rows.push(runs);
    }
    // Rows merged down where a run continues with the same ends.
    let live = new Map<string, Box>();
    const out: Box[] = [];
    for (let j = 0; j < ny; j++) {
      const next = new Map<string, Box>();
      for (const [a, b] of rows[j] ?? []) {
        const key = `${a}:${b}`;
        const was = live.get(key);
        if (was) {
          was.h += cell;
          next.set(key, was);
        } else next.set(key, { x: a * cell, y: j * cell, w: (b - a) * cell, h: cell });
      }
      for (const [key, v] of live) if (!next.has(key)) out.push(v);
      live = next;
    }
    out.push(...live.values());
    const marks = this.data.marks as { backs: Box[]; sealed?: Box[] };
    marks.sealed = [...(marks.sealed ?? []), ...out.filter((b) => b.w >= 2 * cell && b.h >= 2 * cell)];
    for (const b of marks.sealed) {
      this.air(b.x, b.y, b.x + b.w, b.y + b.h);
      this.back(b.x, b.y, b.x + b.w, b.y + b.h);
    }
    return this;
  }

  /** Sealed air placed by hand (as `sealDeep`'s): a hollow behind a wall she can never reach. */
  sealed(x0: number, y0: number, x1: number, y1: number): this {
    const marks = this.data.marks as { sealed?: Box[] };
    marks.sealed = [...(marks.sealed ?? []), { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
    return this.air(x0, y0, x1, y1).back(x0, y0, x1, y1);
  }

  /**
   * Everything not carved becomes mass: the room minus the caves, cut into rects (bands of equal x runs merged
   * down). Call once, after the caves and the pieces that are their own solids (bark, gates, caps).
   */
  fill(): this {
    this.filled = true;
    const xs = new Set<number>([0, this.W]);
    const ys = new Set<number>([0, this.H]);
    for (const c of this.caves) {
      xs.add(Math.max(0, Math.min(this.W, c.x)));
      xs.add(Math.max(0, Math.min(this.W, c.x + c.w)));
      ys.add(Math.max(0, Math.min(this.H, c.y)));
      ys.add(Math.max(0, Math.min(this.H, c.y + c.h)));
    }
    const X = [...xs].sort((a, b) => a - b);
    const Y = [...ys].sort((a, b) => a - b);
    const open = (x: number, y: number) =>
      this.caves.some((c) => x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h);
    // Runs per band, then merged down where a run continues with the same ends.
    let live = new Map<string, Box>();
    const done: Box[] = [];
    for (let j = 0; j + 1 < Y.length; j++) {
      const y0 = Y[j] as number;
      const y1 = Y[j + 1] as number;
      const runs: Array<[number, number]> = [];
      for (let i = 0; i + 1 < X.length; i++) {
        const x0 = X[i] as number;
        const x1 = X[i + 1] as number;
        if (open((x0 + x1) / 2, (y0 + y1) / 2)) continue;
        const last = runs[runs.length - 1];
        if (last && last[1] === x0) last[1] = x1;
        else runs.push([x0, x1]);
      }
      const next = new Map<string, Box>();
      for (const [a, b] of runs) {
        const k = `${a}:${b}`;
        const was = live.get(k);
        if (was) {
          was.h = y1 - was.y;
          next.set(k, was);
        } else next.set(k, { x: a, y: y0, w: b - a, h: y1 - y0 });
      }
      for (const [k, v] of live) if (!next.has(k)) done.push(v);
      live = next;
    }
    done.push(...live.values());
    for (const r of done) this.solid(r.x, r.y, r.w, r.h, this.massTag);
    return this;
  }

  /** A block of mass standing in the air, painted as the room's bulk. */
  mass(x: number, y: number, w: number, h: number, kick?: boolean | 'east' | 'west'): this {
    return this.solid(x, y, w, h, this.massTag, kick);
  }

  /**
   * A root burl on a floor (review r2 #2: no box pillars): `n` tiers narrowing upward, `w` wide at the foot, `h`
   * tall; each tier a step she can stand on.
   */
  burl(x: number, floor: number, w: number, h: number, n = 3): this {
    const s = Math.max(32, Math.round(w / (2 * n) / 32) * 32);
    const th = Math.round(h / n);
    for (let i = 0; i < n; i++) {
      const top = i === n - 1 ? floor - h : floor - (i + 1) * th;
      const bottom = floor - i * th;
      this.mass(x + i * s, top, w - 2 * i * s, bottom - top);
    }
    return this;
  }

  /**
   * A root clump hanging from a roof at `top`: `n` tiers narrowing downward. `keep` = the face that stays plumb
   * (`l` / `r`, a claw face) or `c` (both narrow).
   */
  hang(x: number, top: number, w: number, h: number, n = 3, keep: 'l' | 'r' | 'c' = 'c'): this {
    const s = Math.max(32, Math.round(w / (2 * n) / 32) * 32);
    const th = Math.round(h / n);
    for (let i = 0; i < n; i++) {
      const y = top + i * th;
      const hh = i === n - 1 ? top + h - y : th;
      const cut = keep === 'c' ? 2 * i * s : i * s;
      const xx = keep === 'l' ? x : x + (keep === 'c' ? i * s : i * s);
      this.mass(xx, y, w - cut, hh);
    }
    return this;
  }

  /**
   * Every face takes the claws (as in the references); this keeps them to one side of the mass rects whose edge is at
   * x (the other side refuses).
   */
  claws(x: number, y0: number, y1: number, side: 'east' | 'west'): this {
    let n = 0;
    for (const s of this.data.solids) {
      const edge = side === 'east' ? (s.x as number) + (s.w as number) : (s.x as number);
      if (edge !== x || (s.y as number) >= y1 || (s.y as number) + (s.h as number) <= y0) continue;
      s.kick = side;
      n++;
    }
    if (!n) throw new Error(`${this.data.id}: no face at x ${x} for claws`);
    return this;
  }

  /** A face that refuses the claws (every mass face takes them, as in the references): rects with an edge at x. */
  noClaws(x: number, y0: number, y1: number): this {
    let n = 0;
    for (const s of this.data.solids) {
      const a = s.x as number;
      const b = a + (s.w as number);
      if ((a !== x && b !== x) || (s.y as number) >= y1 || (s.y as number) + (s.h as number) <= y0) continue;
      s.kick = false;
      n++;
    }
    if (!n) throw new Error(`${this.data.id}: no face at x ${x} to refuse the claws`);
    return this;
  }

  /** A tree: `x` its west face, `w` its width, `top`..`bottom`. Solid trees are walls (`kick` for a claw climb). */
  tree(
    id: string,
    x: number,
    w: number,
    top: number,
    bottom: number,
    solid: boolean,
    kick: boolean | 'east' | 'west' = false,
  ): this {
    this.mark('trees', { id, x: x + Math.round(w / 2), w, top, bottom, plane: 'walk', solid });
    if (solid) this.solid(x, Math.max(0, top), w, bottom - Math.max(0, top), 'trunk', kick);
    return this;
  }

  /**
   * A limb from x0 to x1 whose walk top rolls a few px round `top` (steps <= 12: the sim's rolling ground), grown
   * from `parent` (a tree, another limb, or '' for the mass it sinks into) at its `grows` root end; `from` the point
   * the painter grows it from when that is off its solid (a crown limb with room for a claw climb under its root).
   */
  limb(
    id: string,
    x0: number,
    x1: number,
    top: number,
    o: {
      parent?: string;
      grows: 'east' | 'west';
      end: string;
      h?: number;
      tilt?: number;
      skip?: Array<[number, number]>;
      flat?: Array<[number, number]>;
      calm?: boolean;
      from?: [number, number];
    },
  ): this {
    const widths = [64, 96, 80, 112, 48, 128, 80, 96];
    const h = o.h ?? 96;
    const tilt = o.tilt ?? 0;
    let x = x0;
    let k = this.n++ * 3;
    let prev = top;
    const amp = o.calm ? 0.4 : 1;
    while (x < x1) {
      let w = Math.min(widths[k % widths.length] as number, x1 - x);
      for (const [a, b] of o.skip ?? []) {
        if (x < a && x + w > a) w = a - x;
        if (x >= a && x < b) w = Math.min(w, b - x);
      }
      const u = (x - x0) / Math.max(1, x1 - x0);
      const want = Math.round(top + tilt * u + amp * (7 * Math.sin(x / 173 + this.n) + 4 * Math.sin(x / 61)));
      const flat = (o.flat ?? []).find(([a, b]) => x + w > a && x < b);
      const y = flat && x > flat[0] ? prev : Math.max(prev - 12, Math.min(prev + 12, want));
      const skipped = (o.skip ?? []).some(([a, b]) => x >= a && x < b);
      if (!skipped && w > 0) this.solid(x, y, w, h, 'branch');
      prev = y;
      x += w;
      k++;
    }
    const root = o.grows === 'east' ? x0 : x1;
    this.mark('stretches', {
      id,
      x0,
      x1,
      parent: o.parent ?? 'mass',
      from: o.from ?? [root, top + 20],
      grows: o.grows,
      end: o.end,
      y0: top + Math.min(0, tilt) - 40,
      y1: top + Math.max(0, tilt) + 40,
    });
    return this;
  }

  /** A limb's faces refuse the claws (its end must not be a hold up from below): branch rects at `top` in x0..x1. */
  limbNoClaws(x0: number, x1: number, top: number): this {
    for (const q of this.data.solids)
      if (
        q.tag === 'branch' &&
        Math.abs((q.y as number) - top) <= 40 &&
        (q.x as number) >= x0 &&
        (q.x as number) < x1
      )
        q.kick = false;
    return this;
  }

  /** The walk top at x near `near` (the highest solid top within 40 px of it under x), else `near`. */
  top(x: number, near: number, half = 32): number {
    const under = this.data.solids.filter(
      (q) =>
        (q.x as number) < x + half &&
        x - half < (q.x as number) + (q.w as number) &&
        Math.abs((q.y as number) - near) <= 40,
    );
    return under.length ? Math.min(...under.map((q) => q.y as number)) : near;
  }

  /**
   * Level the limb under x for `half` px each side (a creature's spawn wants one top under its whole box), then
   * ease the rects beyond back into the roll. On a mass floor (flat already) it returns the floor's top.
   */
  pad(x: number, near: number, half: number): number {
    const limb = this.data.solids
      .filter((q) => (q.tag as string) === 'branch' && Math.abs((q.y as number) - near) <= 40)
      .sort((a, b) => (a.x as number) - (b.x as number));
    const i0 = limb.findIndex((q) => (q.x as number) <= x && x < (q.x as number) + (q.w as number));
    if (i0 < 0) return this.top(x, near, half);
    const y = limb[i0]?.y as number;
    const inPad = (q: Json) => (q.x as number) < x + half && x - half < (q.x as number) + (q.w as number);
    for (const q of limb) if (inPad(q)) q.y = y;
    const ease = (step: 1 | -1) => {
      let prev: Json | undefined;
      for (let i = i0; i >= 0 && i < limb.length; i += step) {
        const q = limb[i] as Json;
        if (prev) {
          const joined =
            step > 0
              ? Math.abs((prev.x as number) + (prev.w as number) - (q.x as number)) < 2
              : Math.abs((q.x as number) + (q.w as number) - (prev.x as number)) < 2;
          if (!joined) break;
          const py = prev.y as number;
          if (!inPad(q)) q.y = Math.max(py - 12, Math.min(py + 12, q.y as number));
        }
        prev = q;
      }
    };
    ease(1);
    ease(-1);
    return y;
  }

  /** A point inside a solid, a gate or a rotten bark (other than `not`), or outside the room. */
  private solidAt(x: number, y: number, not?: Json): boolean {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return true;
    const inside = (q: Json) =>
      x >= (q.x as number) &&
      x < (q.x as number) + (q.w as number) &&
      y >= (q.y as number) &&
      y < (q.y as number) + (q.h as number);
    const d = this.data as Json;
    return (
      this.data.solids.some(inside) ||
      ((d.gates as Json[] | undefined) ?? []).some(inside) ||
      ((d.bark as Json[] | undefined) ?? []).some((q) => q !== not && inside(q))
    );
  }

  /**
   * Lifts any glint that ended up inside a solid clear of it, and checks every secret wall fills its opening
   * (review r2 #6: the rot cache could be hopped over): a standing rotten wall has solid on top and under it, a
   * floor panel solid either side of it.
   */
  finish(): Json {
    if (!this.filled) this.fill();
    const R = 22;
    const inside = (x: number, y: number) =>
      this.data.solids.some(
        (q) =>
          x + R > (q.x as number) &&
          x - R < (q.x as number) + (q.w as number) &&
          y + R > (q.y as number) &&
          y - R < (q.y as number) + (q.h as number),
      );
    for (const p of this.data.pickups) {
      let guard = 0;
      while (inside(p.x as number, p.y as number) && guard++ < 40) p.y = (p.y as number) - 16;
      if (inside(p.x as number, p.y as number) || (p.y as number) < 32)
        throw new Error(`${this.data.id}: pickup "${p.id}" is inside the mass`);
    }
    for (const b of ((this.data as Json).bark as Json[] | undefined) ?? []) {
      const x = b.x as number;
      const y = b.y as number;
      const w = b.w as number;
      const h = b.h as number;
      const ok =
        b.floor || this.plugs.has(b.id as string)
          ? [y + 8, y + h - 8].every((yy) => this.solidAt(x - 8, yy, b) && this.solidAt(x + w + 8, yy, b))
          : [x + 8, x + w - 8].every((xx) => this.solidAt(xx, y - 8, b) && this.solidAt(xx, y + h + 8, b));
      if (!ok)
        throw new Error(`${this.data.id}: rotten bark "${b.id}" does not fill its opening (air beside it)`);
    }
    // No creature spawns inside a solid, a cap, a gate or rotten bark (v4: the Grove wave's juveniles sat inside the
    // bounce caps, never moved, and the gate on their flag never opened). Walkers stand on their y (feet), the rest
    // hang or fly at it.
    const caps = ((this.data as Json).caps as Json[] | undefined) ?? [];
    const inCap = (x: number, y: number) =>
      caps.some(
        (c) =>
          x >= (c.x as number) &&
          x < (c.x as number) + (c.w as number) &&
          y >= (c.y as number) &&
          y < (c.y as number) + (c.h as number),
      );
    for (const e of this.data.enemies) {
      const x = e.x as number;
      const y = e.y as number;
      const walker = ['burrback', 'juvenileBurrback', 'oldBurrback', 'carrier'].includes(e.kind as string);
      const probes: Array<[number, number]> = walker
        ? [
            [x, y - 8],
            [x - 24, y - 40],
            [x + 24, y - 40],
          ]
        : [[x, y]];
      for (const [px, py] of probes)
        if (this.solidAt(px, py) || inCap(px, py))
          throw new Error(`${this.data.id}: creature "${e.id}" spawns inside a solid at (${px}, ${py})`);
    }
    return this.data;
  }

  /** Rotten plugs (bark across a chimney: solid either side, air over and under; cut from a cling under it). */
  private readonly plugs = new Set<string>();

  /** A rotten plug across a chimney (review r3 #1): a wall panel lying flat, so every cut takes it, an up cut too. */
  plug(id: string, x: number, y: number, w: number, h = 64): this {
    this.plugs.add(id);
    return this.bark(id, x, y, w, h);
  }

  /** Rotten bark (its own solid: carved first). A wall stands on `floor`; `floor: true` makes a floor panel. */
  bark(id: string, x: number, y: number, w: number, h: number, floor = false): this {
    this.air(x, y, x + w, y + h);
    return this.add('bark', floor ? { id, x, y, w, h, floor: true } : { id, x, y, w, h });
  }

  /** A gate (its own solid: carved first); `shut`: an arena's door, open until that flag (src/sim/kit.ts). */
  gate(id: string, x: number, y: number, w: number, h: number, flag: string, shut?: string): this {
    this.air(x, y, x + w, y + h);
    return this.add(
      'gates',
      shut ? { id, x, y, w, h, flag, shut, kick: false } : { id, x, y, w, h, flag, kick: false },
    );
  }

  /** A shortcut: a solid while shut, opened for good from its `opens` side (memory/world.md). */
  shortcut(id: string, x: number, y: number, w: number, h: number, opens: 'n' | 's' | 'e' | 'w'): this {
    return this.add('shortcuts', { id, x, y, w, h, opens });
  }

  /** A bounce cap (its own solid: carved first). */
  cap(id: string, x: number, y: number, w: number, tier: 'small' | 'mid' | 'big'): this {
    this.air(x, y, x + w, y + 64);
    return this.add('caps', { id, x, y, w, h: 64, tier });
  }

  thorns(id: string, x: number, floor: number, w: number, h = 28): this {
    return this.add('thorns', { id, x, y: floor - h, w, h });
  }

  /** Ceiling thorns hanging under a solid's underside at `under`. */
  thornsUnder(id: string, x: number, under: number, w: number, h = 28): this {
    return this.add('thorns', { id, x, y: under, w, h });
  }

  /** Thorns up a claw face (`x` the strip's west edge: the face itself, or the face minus 28). */
  thornsUp(id: string, x: number, y: number, h: number): this {
    return this.add('thorns', { id, x, y, w: 28, h });
  }

  place(id: string, x: number, y: number, note?: string): this {
    return this.mark('places', note ? { id, x, y, note } : { id, x, y });
  }

  /** What hides a secret space; `opens`: what lifts it for good (a bark id, a hollow id). */
  cover(id: string, x: number, y: number, w: number, h: number, opens?: string): this {
    return this.mark('covers', opens ? { id, x, y, w, h, opens } : { id, x, y, w, h });
  }

  landmark(id: string, kind: string, x: number, y: number, w?: number, h?: number): this {
    return this.mark('landmarks', w && h ? { id, kind, x, y, w, h } : { id, kind, x, y });
  }

  burrback(id: string, x: number, top: number, facing: 1 | -1, radius: number, more: Json = {}): this {
    return this.enemy({
      id,
      kind: 'burrback',
      x,
      y: this.pad(x, top, 110),
      facing,
      radius,
      senses: 'always',
      ...more,
    });
  }

  juvenile(id: string, x: number, top: number, facing: 1 | -1, radius: number, more: Json = {}): this {
    return this.enemy({
      id,
      kind: 'juvenileBurrback',
      x,
      y: this.pad(x, top, 80),
      facing,
      radius,
      senses: 'always',
      ...more,
    });
  }

  flyer(
    kind: 'lampwing' | 'hawker',
    id: string,
    x: number,
    y: number,
    facing: 1 | -1,
    more: Json = {},
  ): this {
    return this.enemy({ id, kind, x, y, facing, senses: 'always', ...more });
  }

  /** A dangler tied under the roof near `under` (the lowest underside over x within 320 px above it: a bitten roof). */
  dangler(id: string, x: number, under: number, facing: 1 | -1, more: Json = {}): this {
    const roofs = this.data.solids
      .filter((q) => (q.x as number) <= x && x < (q.x as number) + (q.w as number))
      .map((q) => (q.y as number) + (q.h as number))
      .filter((b) => b <= under + 8 && b >= under - 320);
    const y = roofs.length ? Math.max(...roofs) : under;
    return this.enemy({ id, kind: 'dangler', x, y: y + 8, facing, senses: 'always', ...more });
  }

  /** A line of carriers (ants) on rails along a floor from x0 to the crack at x1, `n` of them. */
  ants(prefix: string, x0: number, x1: number, floor: number, n = 3, more: Json = {}): this {
    const lead = `${prefix}1`;
    this.enemy({
      id: lead,
      kind: 'carrier',
      x: x0,
      y: floor,
      facing: x1 > x0 ? 1 : -1,
      trail: [[x1, floor]],
      ...more,
    });
    for (let i = 1; i < n; i++)
      this.enemy({
        id: `${prefix}${i + 1}`,
        kind: 'carrier',
        x: x0,
        y: floor,
        facing: x1 > x0 ? 1 : -1,
        follow: lead,
        phase: Math.round((i / n) * 100) / 100,
        ...more,
      });
    return this;
  }

  /** A pod sitting on the top under x (a limb's rolling top too), or hanging under the underside at `top`. */
  override pod(
    id: string,
    x: number,
    top: number,
    regrow = 1200,
    mount: 'sit' | 'hang' = 'sit',
    hp?: number,
  ): this {
    // (On a limb's rolling top the rects under its box are levelled: a pod's box wants one top.)
    return super.pod(id, x, mount === 'sit' ? this.pad(x, top, 24) : top, regrow, mount, hp);
  }

  hollow(id: string, x: number, floor: number, upgrade: string): this {
    return this.add('hollows', { id, x: x - 80, y: floor - 112, w: 160, h: 112, upgrade });
  }

  stone(id: string, x: number, floor: number, area: string): this {
    return this.add('mothStones', { id, x, y: floor, area });
  }

  patch(id: string, x: number, floor: number, more: Json = {}): this {
    return this.add('patches', { id, x, y: this.top(x, floor), ...more });
  }

  great(id: string, x: number, y: number): this {
    return this.add('pickups', { id, kind: 'great', x, y });
  }

  shotStops(stops: Array<[string, number, number]>): this {
    return this.set('shots', {
      wide: stops.map(([name, x, y]) => ({ name, x, y })),
      closeup: { ground: [stops[0]?.[1] ?? 0, stops[0]?.[2] ?? 0] },
    });
  }
}

const C = 'wallJump';
const G = 'glide';

// ---------------------------------------------------------------------------------------------------------------
// The hatching branch: wood-hatch's layout, trimmed to ~5 screens (review r2 #8): the room is no deeper than the
// fall catch under the branch, and the stretch between the crown's fork and the droop (x 4096-5120: two limbs)
// is cut, the droop and the branch's end moved west by 1024. The staging marks past the crown are pressed into
// what is left (the swarm's promise gap stays over the crown's fork).

/** The first fling's lamp (r8): over the gap between S5's cut end and S8, on a running jump's rise off the lip. */
const FIRST_WICK: [number, number] = [3700, 660];
/**
 * The safe first flame (r17: every first-timer fell 6-10 times under FIRST_WICK, ~25-30 s, before pressing the Lamp by
 * it): over S3's east half (top ~860), 265 over the limb, where a standing jump on the limb finds it and a miss lands on
 * the limb she jumped from (or the trunk's step east of it: no void under it). Its lesson drift holds her in reach (the
 * HUD shows the Lamp key by it); a fling with nothing held, right or up-right carries her up onto S4 (the crown's limb,
 * the promise's vista) or S5 (the lip). Not over S2 -> S3's gap: its drift would slow a jump and drop her in.
 */
const PATH_WICK: [number, number] = [2640, 590];
/** The promise's widen zone (r12, moment 1): the crown's limb west of the lip (the first fling's frame is the lip's). */
const PROMISE_X: [number, number] = [2816, 3296];

function hatch(): Json {
  const src = JSON.parse(readFileSync('content/rooms/wood-hatch.json', 'utf8')) as Json;
  const P = PLACE['cn-hatch'] as Box;
  const CUT0 = 4096;
  const CUT1 = 5120;
  const D = CUT1 - CUT0;
  const H = P.h;
  const sx = (x: number) => (x >= CUT1 ? x - D : x);
  const mx = (x: number) =>
    x <= 3296 ? x : x >= CUT1 ? x - D : Math.round(3296 + ((x - 3296) * (CUT0 - 3296)) / (CUT1 - 3296));
  // The first fling (r8, review r7 #1: nothing taught the verb, the bots lit 0 lamps): the crown's east limb (S5) is
  // cut back to `S5_END`, so the gap down to the droop's limb (S8, 290 lower) is past any jump; one lamp hangs over it
  // where a running jump off the lip finds it; under it the fall catch sets her back on S5 (and the lamp burns again).
  // Required, safe, a minute in. Flung, it is out for good (the hatch is crossed once).
  const S5_END = 3520;
  /** ...and the droop's limb (S8) starts a rect later, still inside the droop's painted trunk (4128-4298). */
  const S8_START = 4272;
  const solids = (src.solids as Json[])
    .filter((s) => !((s.x as number) >= CUT0 && (s.x as number) < CUT1))
    .filter((s) => !((s.x as number) >= S5_END && (s.x as number) < CUT0 && (s.y as number) < 1000))
    .filter(
      (s) =>
        !(
          sx(s.x as number) >= 4224 &&
          sx(s.x as number) < S8_START &&
          (s.y as number) > 1100 &&
          (s.y as number) < 1250
        ),
    )
    .map((s) => {
      const y = s.y as number;
      return { ...s, x: sx(s.x as number), h: Math.min(s.h as number, H - y) };
    });
  const m = src.marks as Json;
  const pts = (a: Array<[number, number]>) => a.map(([x, y]) => [mx(x), y]);
  const marks: Json = {
    ...m,
    swarm: pts(m.swarm as Array<[number, number]>),
    promise: { ...(m.promise as Json), x1: mx((m.promise as Json).x1 as number) },
    drop: { ...(m.drop as Json), x: sx((m.drop as Json).x as number) },
    camera: (m.camera as Json[]).map((c) => ({
      ...c,
      x: mx(c.x as number),
      y: Math.min(c.y as number, H - 160),
    })),
    trees: (m.trees as Json[]).map((t) => ({
      ...t,
      x: sx(t.x as number),
      bottom: Math.min(t.bottom as number, H),
    })),
    stretches: (m.stretches as Json[])
      .filter((s) => !((s.x0 as number) >= CUT0 && (s.x0 as number) < CUT1))
      .map((s) => ({
        ...s,
        x0: s.id === 'S8' ? S8_START : sx(s.x0 as number),
        x1: s.id === 'S5' ? S5_END : sx(s.x1 as number),
        from: [sx((s.from as number[])[0] as number), (s.from as number[])[1]],
      })),
    farBranch: {
      ...(m.farBranch as Json),
      points: pts((m.farBranch as Json).points as Array<[number, number]>),
    },
  };
  const shots = src.shots as Json;
  const exits = (EXITS.get('cn-hatch') ?? []).map((e) => ({ ...e }));
  const drop = exits.find((e) => e.id === 'drop') as Exit;
  // The first dark edge (review r5 #10: HK's King's Pass teaches "dark edge = room" in minute one): a root clump hung
  // under the branch's end, a hollow in it; she steps off the end and in under the branch. (r7, review r6 #1 / #7: a
  // pod in it, not three glints: the hatch is a quiet room, and the pod is the thing to hit.)
  const POCKET_X = 4736;
  const pocketSolids = [
    { tag: 'root', x: POCKET_X, y: 1320, w: 128, h: 64 },
    { tag: 'root', x: POCKET_X, y: 1384, w: 64, h: 216 },
    { tag: 'root', x: POCKET_X, y: 1600, w: drop.from - POCKET_X, h: 64 },
  ];
  const pocketPod = { id: 'pod-pocket', x: 4960, y: 1600 - 22, mount: 'sit', regrow: 1200, hp: 2 };
  return {
    ...src,
    id: 'cn-hatch',
    title: 'The hatching branch',
    abilities: [],
    // (r12, moment 1: the break sets a flag the kin's try keys on: it jumps after the swarm and falls back.)
    hatch: { ...(src.hatch as Json), sets: 'cn-hatched' },
    // (The level's pieces draw the pocket's cover: r6.)
    art: { ...(src.art as Json), pieces: true },
    width: P.w,
    height: H,
    exits,
    // (A fall off the branch is caught and set back on it, as in wood-hatch; the room is no deeper than that. Not
    // under the branch's end: the pocket.)
    catches: [{ id: 'below', x: 224, y: H - 192, w: POCKET_X - 224, h: 192 }],
    // (The first lamp: `sets` says she has flung once; the camera zone below lets go of the frame then. It burns again
    // 90 frames after it goes out (`relight`, never saved): cut down with the blade it was gone for good, and the
    // hatch with it (the bots' old lamp-cut lines found it: a softlock).)
    lures: [
      {
        id: 'wick-path',
        kind: 'wick',
        x: PATH_WICK[0],
        y: PATH_WICK[1],
        relight: 90,
        lesson: true,
        aim: [1, -1],
        moths: 0,
      },
      {
        id: 'wick-first',
        kind: 'wick',
        x: FIRST_WICK[0],
        y: FIRST_WICK[1],
        sets: 'cn-first-fling',
        relight: 90,
        // (r10, review r9 #1: in its reach her fall slows to a drift until she has flung once.)
        lesson: true,
        // (Let go with no direction held, up-right: across, never down into the gap.)
        aim: [1, -1],
        moths: 0,
      },
    ],
    // The notice (review r7 #1): on S5's east half the view holds the lamp and the limb across the gap (the droop's,
    // S8) in one frame until she has flung. Wordless; render's prompt is the one word (hold the Lamp key).
    camera: {
      ...(src.camera as Json),
      zones: [
        {
          id: 'first-fling',
          x: 3296,
          y: 560,
          w: S5_END - 3296,
          h: 420,
          bounds: { x: 3200, y: 360, w: 2048, h: 1152 },
          until: 'cn-first-fling',
        },
        // (r12, moment 1, the reveal: on the crown's limb before the lip the view widens over the canopy's edge: the
        // river pouring down into the valley's false lights. No lock, no input held: as long as she stands there.)
        { id: 'promise', x: PROMISE_X[0], y: 560, w: PROMISE_X[1] - PROMISE_X[0], h: 420, zoom: 0.85 },
      ],
    },
    // (r13, review r12 #6: the river's tail is keyed to her progress: it leaves the sky when she reaches the promise
    // zone (`cn-promise`, `open.tailFlag`), or 30 s after the break.)
    triggers: [
      ...((src.triggers as Json[] | undefined) ?? []),
      { id: 'promise', x: PROMISE_X[0], y: 560, w: PROMISE_X[1] - PROMISE_X[0], h: 420, sets: 'cn-promise' },
    ],
    solids: [...solids, ...pocketSolids],
    pickups: [...((src.pickups as Json[] | undefined) ?? [])],
    pods: [...((src.pods as Json[] | undefined) ?? []), pocketPod],
    marks: {
      ...marks,
      // (r12, moment 1: the kin tries the air after the swarm as she breaks out, and falls back.)
      tatter: { ...(marks.tatter as Json), tryOn: 'cn-hatched' },
      stage: {
        ...((marks.stage as Json | undefined) ?? {}),
        // (r12, moment 1, render's: 3 s of black, the cocoon close and a widen a press, the title over the moon as the
        // river's tail crosses it, the tail gone from the sky 8 s after the break.)
        open: {
          black: 180,
          zooms: [1.5, 1.25, 1],
          title: 'LAMPFALL',
          titleAfter: 150,
          hatchTail: 1800,
          tailFlag: 'cn-promise',
        },
        // (The valley's false lights, far below the lip: the river breaks into knots round them.)
        lights: { x: 4200, y: 1250, w: 2000, h: 360, count: 9 },
      },
      places: [
        ...((marks.places as Json[] | undefined) ?? []),
        { id: 'pocket', x: 4960, y: 1600 },
        { id: 'first-near', x: 3460, y: 892 },
        { id: 'first-far', x: 4480, y: 1183 },
      ],
      landmarks: [
        ...((marks.landmarks as Json[] | undefined) ?? []),
        { id: 'first-fling', kind: 'teach', x: FIRST_WICK[0], y: FIRST_WICK[1] },
      ],
      covers: [
        ...((marks.covers as Json[] | undefined) ?? []),
        { id: 'pocket-cover', x: POCKET_X, y: 1384, w: drop.from - POCKET_X, h: H - 1384 },
      ],
    },
    shots: {
      ...shots,
      wide: [
        ...(shots.wide as Json[])
          .filter((s) => !((s.x as number) > CUT0 && (s.x as number) < CUT1))
          .map((s) => ({ ...s, x: sx(s.x as number) })),
        { name: 'first-fling', x: 3460, y: 892 },
      ],
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The Crossing (hub, 8000 x 2304; review r5 #9: a crossing became a place). She falls from the hatch onto the
// lampoak's west limb, east of the hall's middle. From the landing she sees the seed door in the root floor below
// (three sockets; a lamp on the lampoak lights for each seed held) and the root floor running west into a moonlit
// clearing: the save and the moth kin at its heart, nothing else (r7, review r6 #10: the quiet place, Dirtmouth;
// a clear spot by the save where a trader could stand, `place:trader`, when Matt says yes to the trade). Past
// the clearing the high west block (a sheer face: claws, "up there, later"; a rotten wall high in it: claws again;
// a shelf off its top only wings reach) and the floor stepping down to the fallen giant's mouth, lit by a lamp under
// the block. East, a root bank with a hollow behind rotten heartwood (the heart's moth-stone), and the limb on to
// the fork. (The old hub's content is east of x 3520, moved with it.)

/** The old hub's content sits this far east in the widened hub. */
const HX = 3520;
/** The three trap lamps (r10, review r9 #2): the hub's, the Grove's west, the den's warning's. */
const HUB_TRAP = 'trap-crossing';
/** The den's great release (the great cage's `sets`): the roof opens, the roosts' moths go on (r12). */
const DEN_FREED = 'cn-den-freed';
/**
 * The hub's cage (r11): under the landing limb, in the drop's frame. (r16, first-timer ft15fix: "cutting it and using
 * the Lamp did nothing", 200 over the floor only an up cut or a jump's cut reached it: it hangs at her head now, 120
 * over the floor, so the cut a player makes walking up to it lands, standing or in the air.)
 */
const HUB_CAGE: [number, number] = [6300, 1480];
const GROVE_TRAP = 'trap-grove';
const WARN_TRAP = 'trap-warn';

function hub(): Json {
  const r = new Wood('cn-hub', 'The Crossing', [2640 + HX, 1152], 7101, {
    mood: 'warm',
    // (r7, review r6 #10: the moon over the clearing's frame from the save, up and right of her. The clearing's sky is
    // open to the room's top; render's backdrop still covers it, a render item.)
    // (r8, review r7 #5: one warm light in the clearing, the kin's (`marks.lights`, `afterglow` low over the save).)
    art: { anchorY: 1100, moon: { x: 1180, y: 200, r: 120 }, afterglow: { x: 2900, y: 700, strength: 0.5 } },
  });
  // The hall over the root floor, open to the sky, the clearing in its west half; the bank east; over the high
  // block and its limb's mouth.
  r.hole(1024, 0, 3712 + HX, 1600);
  r.hole(3712 + HX, 0, 8000, 1344);
  r.hole(0, 0, 1024, 576);
  // The root floor steps down west into the giant's mouth under the high block (its roof bitten).
  r.cave(1024, 1600, 1408, 1792, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(0, 1664, 1024, 1920, { ceil: 96, w: 0, e: 0, corner: 0 });
  // A shown lock (review r5 #9): a rotten wall high in the block's east face, its sill 320 over the clearing's floor
  // (out of a running jump from it: the claws), a chamber behind it in the block (review r5 #10: a pocket the size of
  // a place, 768 x 448).
  r.hole(192, 832, 960, 1280);
  r.bark('high-wall', 960, 1088, 64, 192);
  // (The chamber's west end steps down into a covered vent under the upper limbs' floor: review r5 #10, a hidden
  // route.)
  r.hole(0, 1280, 256, 1472);
  // The seed door and its shaft into the root tunnel.
  r.gate('seed-door', 1792 + HX, 1600, 256, 64, 'seeds:3');
  r.hole(1792 + HX, 1664, 2048 + HX, 2304);
  // Secret (review r3 #8: it needs the claws, so the giant's wall is the first break): a root clump hung over the
  // east limb's end, a hollow in it behind rotten heartwood high on its west face (the heart's moth-stone). She
  // climbs the clump's root face from the limb; each kick throws her out, and she cuts as she swings back in. (r6:
  // the hollow grown to 768 x 448, a pod and a ledge in it, review r5 #10.)
  r.bark('bank-wall', 3456 + HX, 448, 64, 192);
  // The root floor as a bough (r9, review r8 #2: the hub's door and east stops were a third deep solid, the slab under
  // the floor): 256 thick over sealed air with the deep back under it, root posts either side of the seed door's
  // shaft; the east bank the same under its floor. Nothing she can reach opens.
  r.sealed(1664, 1856, 1792 + HX - 192, 2176);
  r.sealed(2048 + HX + 192, 1856, 3712 + HX - 128, 2176);
  r.sealed(3712 + HX + 64, 1600, 8000 - 128, 2176);
  r.sealed(128, 2048, 960, 2176);
  r.back(0, 1600, 8000, 2304);
  r.fill();
  // (r11, review r10 #4 / #6: the clump read as a framed box with a straight band along its top. Its crown steps up in
  // root tiers to a hump under the gap's drop, and its east face runs down to a root foot 192 over the bank's floor: a
  // claw face up it from the floor, lit by a lamp by its shoulder.)
  r.mass(3456 + HX, 416, 896, 32);
  r.mass(3456 + HX + 128, 384, 640, 32);
  r.mass(3456 + HX + 256, 352, 384, 32);
  r.mass(3456 + HX, 640, 64, 448);
  r.mass(3520 + HX, 896, 768, 64);
  r.mass(4288 + HX, 448, 64, 448);
  r.mass(4288 + HX, 896, 64, 256);
  r.oneWay(3904 + HX, 704, 160, 'branch');
  // The glide shelf (a shown lock, review r5 #9): off the high block's top only wings reach it, 1,280 px across the
  // clearing; sheer underneath, no claws on it.
  r.mass(2304, 832, 256, 160, false);
  r.tree('lampoak', 2880 + HX, 288, -500, 1600, false);
  r.limb('land', 2240 + HX, 2880 + HX, 1152, {
    parent: 'lampoak',
    grows: 'west',
    end: 'snap',
    flat: [[2496 + HX, 2816 + HX]],
  });
  // (r16, first-timer ft15fix: "the wall at the right end lets me cling but every kick drops me back": the limb ran
  // into the bank's corner, a roof 227 over the floor under the bank's lip. It stops 288 short now: the bank's west
  // face is a plain 256 step under open sky, a full jump or the claws, and the way east reads from the floor.)
  r.limb('east', 3168 + HX, 3424 + HX, 1280, { parent: 'lampoak', grows: 'east', end: 'knee', calm: true });
  r.oneWay(2368 + HX, 1376, 192, 'branch');
  // The clearing (r7, review r6 #10: stripped; v6 had four knuckles, three pods and a thorn pit here): the root floor,
  // two low swellings, the save and the kin.
  r.burl(1792, 1600, 512, 128, 1);
  r.burl(4544, 1600, 384, 96, 1);
  // The kin's lamp is the map station (r9, review r8 #9: nothing to stop for, the hub crossed three times): resting at
  // the save beside it shows the map of what she has walked, and the moth-stones she has read are hung on the kin's
  // lamp, one more each time she comes back (flags `cn-stone-*`: the hub changes as she goes; render draws them).
  // (r16, first-timer ft15fix: "the campfire looks exactly like a save spot; up, down: nothing". The save was 260 px
  // east of the kin's fire. It is at the fire now, the kin a step past it.)
  r.patch('p-crossing', 2740, 1600, {
    map: true,
    hangs: [
      { stone: 'cn-well:stone-west', flag: 'cn-stone-west' },
      { stone: 'cn-hub:stone-heart', flag: 'cn-stone-heart' },
      { stone: 'cn-grove:stone-east', flag: 'cn-stone-east' },
      { stone: 'cn-nook:stone-high', flag: 'cn-stone-high' },
      { stone: 'cn-burrow:stone-deep', flag: 'cn-stone-deep' },
    ],
  });
  // The clearing as a place (r8, review r7 #5: 55-60% of every hub frame was the slab under the floor, and no moon):
  // over the clearing (the save +- 1,200) the view keeps its bottom 240 under the floor, so the floor sits at ~78%
  // of a 1080 frame (80% at 16:10) and the sky over it, with the moon, fills the rest.
  r.set('camera', {
    anchorY: 0.4,
    zones: [
      {
        id: 'clearing',
        x: 2960 - 1200,
        y: 960,
        w: 2400,
        h: 640,
        bounds: { x: 0, y: 0, w: 8000, h: 1600 + 240 },
        frames: 45,
      },
      // (r11, review r10 #4 / #6: the landing composed. From the drop's landing to the floor under it, until she has
      // first walked off it, the view pulls back to 0.9 over a frame that holds the landing limb, the cage under it with its moths,
      // the kin on the floor below looking up at it, and the sky over the lampoak.)
      {
        id: 'landing',
        x: 5600,
        y: 0,
        w: 1760,
        h: 1600,
        zoom: 0.9,
        bounds: { x: 5200, y: 480, w: 2240, h: 1280 },
        // (Until she first walks off the landing (`cn-hub-left`), not the cage's snuff: ending on the release dropped
        // the view ~250 px in the middle of its ease, render's note.)
        until: 'cn-hub-left',
        frames: 45,
      },
    ],
  });
  // A lamp on the lampoak for each seed held: the hub changes on every return.
  r.lamp('socket-1', 2960 + HX, 860, { after: 'seeds:1' });
  r.lamp('socket-2', 3100 + HX, 760, { after: 'seeds:2' });
  r.lamp('socket-3', 3020 + HX, 640, { after: 'seeds:3' });
  // The way west: a lamp in the giant's mouth (warm light under the block, seen from the clearing's west end).
  r.lamp('wick-mouth', 520, 1790);
  // (r11, review r10 #6: the clump's east face lit, a claw route from the bank's floor to its crown.)
  r.lamp('wick-clump', 7944, 720);
  // The premise (r10, review r9 #2): the first trap lamp, a cage of moths hung over the root floor west of the seed
  // door, the first thing she meets walking west from the drop. Three cuts free it for good; its moths settle on the
  // high block's claw face (the shard chamber's way up, lit), the Grove's over the kin's lamp, the warning's in the
  // lampoak's crown over the drop: the hub changes with each lamp freed (`roosts`, render draws them).
  // (r11, review r10 #3: the cage hangs under the landing limb, in the frame where she lands from the drop (v10's was
  // 1,800 px west, out of it: holding right, the reviewer never saw it). 200 over the floor: a standing up cut reaches
  // it (`lures.trapRadius`), the first cut lets one moth out. Freed, `cn-hub-freed`: the landing's frame lets go.)
  r.lamp(HUB_TRAP, HUB_CAGE[0], HUB_CAGE[1], { trap: true, moths: 30, sets: 'cn-hub-freed' });
  r.set('roosts', [
    // (r12, the ending: once the den's great cage is freed the roosts' moths go on the migration: `leaves`.)
    { id: 'roost-crossing', lure: `cn-hub:${HUB_TRAP}`, x: 1024, y: 1088, w: 128, h: 448, leaves: DEN_FREED },
    {
      id: 'roost-grove',
      lure: `cn-grove:${GROVE_TRAP}`,
      x: 2560,
      y: 1344,
      w: 320,
      h: 192,
      leaves: DEN_FREED,
    },
    { id: 'roost-warn', lure: `cn-tunnel:${WARN_TRAP}`, x: 6144, y: 640, w: 512, h: 320, leaves: DEN_FREED },
  ]);
  r.place('trap', HUB_CAGE[0], 1600);
  // (r11: off the landing either way, the first time: its frame lets go, and the kin goes back to its light.)
  r.add('triggers', { id: 'left-west', x: 5376, y: 0, w: 128, h: 1600, sets: 'cn-hub-left' });
  r.add('triggers', { id: 'left-east', x: 7424, y: 0, w: 128, h: 1344, sets: 'cn-hub-left' });
  // (r11: the clump's crown under the gap's drop, up its lit east face.)
  r.place('clump-top', 7424, 352);
  // (r7, review r6 #7: each pocket pays one thing that matters: the bank the heart's map, the high chamber a moon
  // shard, the wings' shelf a great.)
  r.stone('stone-heart', 3800 + HX, 896, 'cn-heart');
  r.pod('pod-bank', 4100 + HX, 448, 1200, 'hang', 2);
  r.cover('bank-cover', 3456 + HX, 384, 896, 576, 'bank-wall');
  r.hollow('shard-high', 480, 1280, 'moonShard');
  r.cover('high-cover', 0, 768, 1024, 768, 'high-wall');
  r.great('shelf-great', 2432, 790);
  // (Review r6 #7: a trader's spot by the save, the floor clear and flat for 320 px; the trade itself is Matt's call.)
  r.place('trader', 3240, 1600, 'a clear spot for a trader beside the save (review r6 #7)');
  r.set('marks', {
    ...(r.data.marks as Json),
    // (r11, review r10 #4: on her first landing the kin waits under the cage, on the floor below the landing, looking
    // up at the moths: the drop's frame holds the cage, the kin and the sky. Once she has walked off the landing it is
    // back by its light, out of her sight.)
    // (r16: beside the cage, its want at arm's length: it reaches for it, and the player sees a cage that answers.)
    tatter: { x: 6150, y: 1600, facing: 1, want: HUB_CAGE, until: 'cn-hub-left' },
    stage: { tatters: [{ x: 2880, y: 1600, facing: 1, want: [1920 + HX, 1600], when: 'cn-hub-left' }] },
    // (r8: the kin in three places, wordless: here it watches her and turns away; in the bower's chamber it keeps a
    // light; at the way out it waits, after the den.)
    notes: [
      {
        x: 2780,
        y: 1500,
        text: 'the kin (1/3): watches her come into the clearing, turns away as she nears',
      },
    ],
  });
  r.landmark('seed-door', 'goal', 1920 + HX, 1600);
  r.landmark('mouth', 'way', 400, 1920);
  r.landmark('clearing', 'landmark', 2960, 1600);
  // The clearing's one warm light (r8, review r7 #5): the kin's lamp on a root stake beside it, the warmest place
  // since the hatch. Render's (a `light` landmark): a kept flame, not a fling lamp (no false light, nothing to snuff).
  r.landmark('kin-lamp', 'light', 2700, 1600);
  r.place('land', 2640 + HX, 1152);
  r.place('floor', 2400 + HX, 1600);
  r.place('clearing', 2960, 1600);
  r.place('chamber', 600, 1280);
  r.place('mouth', 300, 1920);
  r.place('high', 500, 576);
  r.place('east', 4200 + HX, 1344);
  r.shotStops([
    ['landing', 2640 + HX, 1152],
    ['door', 1920 + HX, 1600],
    ['clearing', 2960, 1600],
    ['shelf', 2200, 1200],
    ['west', 900, 1792],
    ['high', 600, 576],
    ['east', 3900 + HX, 1344],
    ['clump', 3500 + HX, 1280],
  ]);
  r.route('hatch', 'land', { oneWay: true });
  r.route('gap', 'east', { oneWay: true });
  r.route('land', 'floor');
  r.route('floor', 'clearing');
  r.route('clearing', 'p-crossing');
  r.route('clearing', 'mouth');
  r.route('mouth', 'trunk');
  r.route('floor', 'east');
  r.route('east', 'fork');
  r.route('mouth', 'high', { needs: [C] });
  r.route('high', 'mouth', { oneWay: true });
  r.route('high', 'limbs');
  r.route('floor', 'stone-heart', { needs: [C] });
  r.route('clearing', 'chamber', { needs: [C] });
  r.route('chamber', 'shard-high');
  r.route('chamber', 'mouth', { oneWay: true });
  r.route('chamber', 'vent');
  r.route('floor', 'door', { flags: ['seeds:3'] });
  r.route('door', 'floor', { needs: [C] });
  return r.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// West. The fallen giant (trunk): in from the hub's mouth, down inside a hollow trunk in three tiers (each drop too
// high to climb back); the first hall ends on a rotten wall that MUST be cut (King's Pass: every player learns in
// minute two that the wood breaks); seed 1 in an alcove up in its roof over two root burls; a lampwing over the
// thorns under the low roof; a rotten panel drops to the rot hall. The well: the Elder's shaft, the claws at the
// bottom (far and low), the climb back up in three legs (the mouth, a landing, the hollow) with thorns on
// alternate faces and a lampwing in it, into the ambush hollow (woken by the claws). The upper limbs: the way home,
// a jump at its edge over thorns.

/** The trunk's bramble bed in tier 1 (x0, x1) and the fling lamp in the drop's shaft (r7). */
const TRUNK_BED: [number, number] = [1664, 2304];
const TRUNK_WICK: [number, number] = [1184, 800];

function trunk(): Json {
  const r = new Wood('cn-trunk', 'The fallen giant', [3136, 384], 7202, { back: true, mood: 'deep' });
  r.cave(2560, 128, 3200, 384, { ceil: 64, w: 0, e: 0, corner: 0 });
  // Tier 1: the hall inside the giant (its roof bitten).
  r.cave(1536, 192, 2624, 704, { ceil: 128, w: 0, e: 0 });
  // The hall's west end: a low corridor shut by rotten heartwood (the wall that teaches breaking), and behind it a
  // chamber over the drop, the seed in an alcove up in its roof over a root burl (the wall pays at once: the seed
  // is behind it, not before it; orchestrator r4).
  // (r12, first-timer r11: "a full jump bonks the trunk": the root hanging over the wall came down to 512, 16 px over
  // a jump onto the burl west of it; only a short hop got through. The wall is 320 tall now, its top at 384.)
  r.hole(1472, 384, 1536, 704);
  r.bark('giant-wall', 1472, 384, 64, 320);
  r.cave(1088, 320, 1472, 704, { ceil: 0, w: 0, e: 0, corner: 64 });
  r.hole(1152, 160, 1344, 320);
  // The drop to tier 2; tier 2 under a low roof.
  r.hole(1088, 704, 1280, 1024);
  r.hole(448, 768, 1088, 1024);
  // (The roof lifts over tier 2's middle: the hop to the lamp in the drop's shaft is a full jump.)
  r.hole(704, 640, 1024, 768);
  // The rot branch (review r4 #2: it swallowed the no-claws player): a rotten wall high in tier 3's east face, its sill
  // 320 over the floor (out of a jump: the claws first), the shaft behind it down to the rot hall.
  r.bark('rot-door', 1024, 1216, 64, 128);
  r.hole(1088, 1216, 1280, 1920);
  // The drop to tier 3, and tier 3 out west to the well.
  r.hole(448, 1024, 640, 1216);
  r.cave(0, 1216, 1024, 1664, { ceil: 96, w: 0, e: 0, corner: 0 });
  // Tier 1's bramble bed (r7, review r6 #1: v6's three trays in three tiers became one composed run): a shallow pit
  // 640 long between the landing and the giant's wall, under two root knuckles. Over them, or the bed.
  r.hole(TRUNK_BED[0], 704, TRUNK_BED[1], 768);
  // (r9, review r8 #2: the mass more than 256 px from the air is sealed air with the back behind it.)
  r.sealDeep();
  r.fill();
  // A root burl up to the alcove (one swelling, not a pillar).
  r.burl(1344, 704, 128, 96, 1);
  r.add('moonseeds', { id: 'seed-giant', x: 1248, y: 290 });
  // A root column carries the shaft's east face down to 192 over tier 3's floor: with the claws she climbs back up
  // (v3's shaft started 448 over the floor: tier 3 was a pocket the bots wandered for minutes).
  r.mass(640, 1216, 64, 256);
  // (r12, first-timer r11: "that bug pops up right where I land": on the hall's 320 px of floor east of the bed both
  // ends are landings (the drop from the top, the knuckles back east). It walks the top's floor now, seen from the
  // door (260 px off: its 30-frame tell plays before it can reach her), clear of the shaft's lip.)
  r.juvenile('juv-t1', 2830, 384, -1, 70, { fenced: true });
  // A dangler under the low roof (review r3 #7: a new kind on the path, where the lampwing was), over clean floor
  // (r4 bots: a pair over the thorns faded the casual one 29 times).
  r.dangler('dang-t2', 700, 768, 1);
  r.cover('rot-shaft', 1024, 1152, 320, 768, 'rot-door');
  r.landmark('giant-wall', 'teach', 1504, 704);
  // (r16, first-timer ft15fix: the map's arrow down was "behind a column that won't break": the rotten wall over the
  // column reads as rot now, as the giant's wall does, so the arrow leads to a thing to climb to and cut.)
  r.landmark('rot-door', 'teach', 1056, 1344);
  r.place('top', 2900, 384);
  r.place('t1', 2500, 704);
  r.place('t2', 800, 1024);
  r.place('t3', 600, 1664);
  r.shotStops([
    ['entry', 2900, 384],
    ['wall', 1700, 704],
    ['seed', 1300, 512],
    ['thorns', 800, 1024],
    ['low', 500, 1664],
  ]);
  r.route('hub', 'top');
  r.route('top', 't1', { oneWay: true });
  r.route('t1', 'top', { needs: [C], oneWay: true });
  r.route('t1', 'seed-giant');
  r.route('t1', 't2', { oneWay: true });
  r.route('t2', 't1', { needs: [C], oneWay: true });
  r.route('t2', 't3', { oneWay: true });
  r.route('t3', 'rot', { needs: [C], oneWay: true });
  r.route('t3', 't2', { needs: [C], oneWay: true });
  r.route('t3', 'well');
  // The bed and its two knuckles (a run off the top's lip at full speed lands ~190 px out, east of the bed: v5's
  // gotcha, no thorns where a drop lands; a knuckle by the lip was a hop up to the top, the claws' lock); a pod on each.
  r.thorns('thorn-t1', TRUNK_BED[0], 768, TRUNK_BED[1] - TRUNK_BED[0]);
  // (r16, first-timer ft15fix: "the stones are small and the pit punishes every miss", two fades here: the knuckles
  // are 160 wide and 96 over the floor (were 128 and 128), gaps 32 / 96 / 192. The east one ends where v15's did: any
  // nearer the top's lip and a jump off it climbs back to the hall without the claws (the solver's trunk claims).)
  r.oneWay(1696, 608, 160, 'branch');
  r.oneWay(1952, 608, 160, 'branch');
  r.pod('pod-t1', 1776, 608, 1200, 'sit');
  r.pod('pod-t3', 2032, 608, 1200, 'sit');
  // A fling line (review r6 #4): a lamp in the drop's shaft, a jump over tier 2's floor: flung up from it she is back
  // in the wall's chamber (the clawed return, `t2 -> t1`, now has a second way; the hall's way out stays the claws').
  r.lamp('wick-drop', TRUNK_WICK[0], TRUNK_WICK[1]);
  return r.finish();
}

/** The well's chimney (leg 2, r9: its only chimney leg): its west face. */
const CH0 = 1920;
/** The landing's floor (the chimney's top): leg 2 under it, the gallery west of it. */
const LAND = 2432;
/**
 * The gallery (r9, review r8 #1 / #2: the well was three climbing legs and a slab 1,500 px thick beside a 384 px
 * column of air). Leg 3 is a switchback through the hollowed west wall: walk west on the floor (a burrback, the
 * bramble pit that was leg 2's strip), up two root terraces at the west wall, east along a bough (a lampwing over
 * it), up a short stair of roots into the hollow. Two climbing legs between the hub and the limbs, and the frame is
 * a hall, not a wall.
 */
const GALLERY = { x0: 512, x1: CH0, top: 1344, bough: 1856, boughX: [768, 1536] as [number, number] };
/** The bramble pit on the gallery's floor (r9: `thorn-w2` off leg 2's slide line, where a jump is the choice). */
const GALLERY_PIT: [number, number] = [1216, 1472];
/** The stair's way up through the hollow's floor (a root across it at 1,152). */
const STAIR: [number, number] = [1536, 1920];
/** The gallery's lampwing (r9: v8's leg-3b one, over the bough), and the ambush floor's fling lamp (review r6 #4). */
const WING_GALLERY: [number, number] = [1150, 1580];
const WICK_HOLLOW: [number, number] = [1300, 880];

function well(): Json {
  const r = new Wood('cn-well', "The Elder's well", [1600, 4928], 7203, {
    back: true,
    art: { anchorY: 2600 },
  });
  // Leg 1, the first use of the claws: the wide shaft from the bottom up to the giant's mouth (its east face tops
  // out on the mouth's floor; the west face ends under the mouth's roof).
  r.hole(1024, 2944, 1536, 4928);
  // Leg 2 (r9: the one chimney leg): a 384 px chimney up from the mouth's floor, east of leg 1's top (she must stand
  // on the mouth's floor before it: her safe ground), to the landing under its roof.
  r.hole(CH0, 2048, CH0 + 384, 2944);
  // The bottom: the claws, far and low; a corridor east to the rot hall, shut by a root door that opens only from
  // the rot side (review r5 #1: it was an open corridor beside the claws, and every start bot took it).
  r.cave(1536, 4608, 2304, 4928, { ceil: 64, w: 0, e: 0, corner: 0 });
  r.hole(2304, 4672, 2560, 4928);
  // The Elder's notch off the shaft's foot, its rotten plug in the west wall.
  r.cave(128, 4672, 1024, 4928, { ceil: 64, w: 0, e: 0, corner: 0 });
  // The giant's mouth on the east (leg 1's top, the chimney's foot).
  r.cave(1536, 2944, 2560, 3200, { ceil: 0, w: 0, e: 0, corner: 0 });
  // The gallery (r9): the landing opens west into a hall in the old west wall.
  r.hole(GALLERY.x0, GALLERY.top, GALLERY.x1, LAND);
  r.hole(GALLERY_PIT[0], LAND, GALLERY_PIT[1], LAND + 64);
  // The stair's way up through the hollow's floor.
  r.hole(STAIR[0], 1152, STAIR[1], GALLERY.top);
  // The ambush hollow: two tiers, a shelf under its roof; out east to the limbs.
  r.cave(256, 448, 2304, 1152, { ceil: 128, w: 64, e: 0 });
  r.hole(2304, 512, 2560, 768);
  // The walls hollowed (r9, review r8 #2: 40-52% of every well frame was deep solid): behind each leg's faces the
  // mass goes, sealed air with the deep back behind pillars 256-320 thick (the shaft look's ribs and curtains get
  // room to show). Leg faces stay where they were; nothing she can reach opens.
  r.sealed(192, 3072, 768, 4544);
  r.sealed(1856, 3328, 2432, 4480);
  r.sealed(2048, 1280, 2432, 1920);
  r.sealed(64, 1408, 320, 2816);
  r.sealed(640, 2560, 1408, 2816);
  r.fill();
  // (Review r4 #2: the Elder's door opens only from the Elder's side, the end of the rot branch: at the claws the
  // notch is a shut root door, and the one way on is up.)
  r.shortcut('elder-door', 64, 4672, 64, 256, 'w');
  r.shortcut('rot-wall', 2368, 4672, 64, 256, 'e');
  // Leg 1 is the east face (onto the mouth's floor): the west face ends under the mouth's roof, so it refuses the
  // claws (r4 bots: the skilled one kicked under that roof for 90 s).
  r.noClaws(1024, 2944, 4672);
  // A root curtain at the bottom cave's mouth carries the east face down to 128 over the floor (a jump reaches it).
  r.mass(1536, 4608, 64, 192);
  // Two root lips carry the chimney's faces down to 128 over the mouth's floor (a jump at either face holds).
  r.mass(CH0 - 64, 2944, 64, 128);
  r.mass(CH0 + 384, 2944, 64, 128);
  // A root lip at the chimney's top (a branch she climbs up through from leg 2): the landing's floor.
  r.oneWay(CH0, LAND, 384, 'branch');
  // The gallery's switchback: two root terraces at the west wall, the bough east, the stair of roots up through the
  // hollow's floor (a root across its mouth: she jumps up through it, and the hollow's floor is whole).
  r.mass(GALLERY.x0, LAND - 192, 384, 192);
  r.mass(GALLERY.x0, LAND - 384, 192, 192);
  r.mass(GALLERY.boughX[0], GALLERY.bough, GALLERY.boughX[1] - GALLERY.boughX[0], 128);
  r.oneWay(STAIR[0] + 64, GALLERY.bough - 192, 192, 'branch');
  r.oneWay(STAIR[1] - 192, GALLERY.bough - 384, 192, 'branch');
  r.oneWay(STAIR[0] + 32, GALLERY.bough - 544, 192, 'branch');
  r.oneWay(STAIR[0], 1152, STAIR[1] - STAIR[0], 'branch');
  r.thorns('thorn-w2', GALLERY_PIT[0], LAND + 64, GALLERY_PIT[1] - GALLERY_PIT[0]);
  // The way out to the limbs (r9, review r8 #1: the door read as a dark overhang): a root step under the door, so the
  // floor, the step and the door are two plain jumps east of where the stair comes up. The door is lit from the limbs
  // (`door` landmark: render spills their leaf light and moonlight into the hollow through it).
  r.mass(2048, 960, 256, 192);
  // The ambush's prize (r9, review r8 #1: the ambush a choice that pays): a root shelf high on the west wall, a moon
  // shard on it. Only the hollow's lamp reaches it (an up-left fling from over the ambush floor; no face reaches it
  // from the floor), so the prize is on the fight's side.
  r.mass(256, 800, 576, 64);
  r.noClaws(832, 800, 864);
  r.hollow('shard-well', 448, 800, 'moonShard');
  // The bottom is a start, not a fork (review r5 #1: the save, the stone and an open corridor into the rot hall sat
  // beside the claws, and every start bot took the corridor): the claws at the foot of leg 1's face, the rot hall's
  // door shut from this side (`rot-wall` opens from the rot hall), and the one way out is up.
  r.add('glades', { id: 'glade-claws', x: 1360, y: 4704, w: 216, h: 224, ability: C });
  // A warm light up the shaft, seen from the bottom (out of a jump's fling reach from the floor), and the great on
  // the face a little higher: Ori's energy cell beside the Wall Jump tree.
  r.lamp('wick-shaft', 1290, 4180);
  r.great('claw-prize', 1440, 3900);
  // The save and the west moth-stone up on the mouth's floor (the first rest of the climb, and the stone pays for
  // leg 1).
  r.patch('p-well', 1720, 3200);
  r.stone('stone-west', 2440, 3200, 'cn-west');
  // The gallery's two problems (r9): a burrback on the floor west of the bramble pit, and a lampwing over the bough
  // (v8's leg-3b one: one dive a pass). Woken by the claws.
  r.burrback('burr-gallery', 1010, LAND, -1, 110, { fenced: true, wakes: C });
  r.flyer('lampwing', 'wing-gallery', WING_GALLERY[0], WING_GALLERY[1], -1, {
    radius: 160,
    wakes: C,
    dives: 1,
  });
  // The ambush (r7, review r6 #3): woken by a trigger in the hollow's middle, not by the claws, so the arrival up the
  // stair is quiet and the save there is hers first.
  // r8 (review r7 #2): the trigger is where she walks in (x 1,000-1,408), and the ambush arrives: the burrbacks crawl
  // out of a burrow mouth in the west wall (x 300) a beat later and take their ground west of her; the lampwing drops
  // from the roof roots (y 470). Harmless while they come. Until all three are down a fade (or leaving) takes the
  // trigger's flag back: it plays again from its arrival (`rearm`); cleared, it stays clear (`sets`).
  // r9 (review r8 #8): the lampwing's post is the lamp's east side (1,450 x 820), not over her landing: its dive comes
  // in at an angle she can read.
  const ambush = { wakes: 'cn-well-ambush', sets: 'cn-well-clear' };
  r.add('triggers', { id: 'ambush', x: 1000, y: 960, w: 408, h: 192, sets: 'cn-well-ambush', rearm: true });
  r.burrback('burr-am-1', 600, 1152, 1, 300, { ...ambush, fenced: true, arrive: [[300, 1152]] });
  r.burrback('burr-am-2', 860, 1152, 1, 320, { ...ambush, fenced: true, arrive: [[300, 1152]] });
  r.flyer('lampwing', 'wing-am', 1450, 820, -1, { radius: 220, ...ambush, arrive: [[1350, 470]] });
  // A save at the top (review r6 #3), on her way from the stair to the ambush (a pass marks it, r8), 548 px from the
  // nearer burrback's ground.
  r.patch('p-hollow', 1472, 1152);
  // A fling line (review r6 #4): a lamp over the ambush floor, a jump's reach from it: a tool in the fight (the
  // throw-cut, an escape over a ram) and the way up to the prize's shelf.
  r.lamp('wick-hollow', WICK_HOLLOW[0], WICK_HOLLOW[1]);
  // The landing is a save (review r4 #9: a fade in the gallery costs one leg); no creature keeps it.
  r.patch('p-landing', CH0 - 200, LAND);
  r.landmark('door-limbs', 'door', 2432, 768);
  // Frames (r9, review r8 #1 / #8): up the stair the door is in frame at once (a notice: the view kept up and right,
  // the door at its top right), and the ambush floor is fitted while the wave is not cleared.
  r.set('camera', {
    headroom: 0,
    zones: [
      {
        id: 'door-notice',
        x: STAIR[0] - 64,
        y: 960,
        w: 2304 - STAIR[0] + 64,
        h: 240,
        bounds: { x: 640, y: 256, w: 1920, h: 1088 },
        frames: 40,
      },
      {
        id: 'ambush',
        x: 256,
        y: 448,
        w: STAIR[0] - 64 - 256,
        h: 704,
        fit: true,
        bounds: { x: 192, y: 320, w: 2048, h: 896 },
        until: 'cn-well-clear',
      },
    ],
  });
  r.place('bottom', 1700, 4928);
  r.place('mouth', 2200, 3200);
  r.place('mid', CH0 - 160, LAND);
  r.place('terrace', GALLERY.x0 + 96, LAND - 384);
  r.place('gallery', 1200, GALLERY.bough);
  r.place('notch', 500, 4928);
  r.place('hollow', 600, 1152);
  r.place('door', 2176, 960);
  r.place('top', 2400, 768);
  r.shotStops([
    ['bottom', 1600, 4928],
    ['shaft', 1280, 3600],
    ['mouth', 2000, 3200],
    ['chimney', CH0 + 192, 2800],
    ['landing', CH0 - 300, LAND],
    ['gallery', 1100, GALLERY.bough],
    ['terrace', 700, LAND - 192],
    ['stair', 1700, 1472],
    ['hollow', 1300, 1152],
    ['door', 1800, 1152],
  ]);
  r.route('trunk', 'mouth');
  r.route('mouth', 'bottom', { oneWay: true });
  r.route('rot', 'bottom', { door: 'rot-wall' });
  r.route('bottom', 'glade-claws');
  r.route('mouth', 'p-well');
  r.route('mouth', 'stone-west');
  r.route('bottom', 'notch');
  r.route('elder', 'notch', { door: 'elder-door' });
  r.route('bottom', 'mouth', { needs: [C], oneWay: true });
  r.route('mouth', 'mid', { needs: [C] });
  r.route('mid', 'gallery');
  r.route('gallery', 'hollow');
  r.route('hollow', 'p-hollow');
  r.route('hollow', 'ambush');
  r.route('hollow', 'shard-well');
  r.route('hollow', 'door');
  r.route('door', 'top');
  r.route('top', 'limbs');
  // Furniture between the fights (review r5 #3: the exact references' thorns, things to hit and small ledges).
  r.pod('pod-mouth', 2120, 3200, 1200, 'sit');
  r.pod('pod-bottom', 2060, 4928, 1200, 'sit');
  r.pod('pod-hollow', 2176, 960, 1200, 'sit');
  return r.finish();
}

/** The limbs' gap (r12): a root knuckle west of the second limb ([x, top, w]). */
const LIMB_KNUCKLE: [number, number, number] = [1376, 720, 96];

function limbs(): Json {
  const r = new Wood('cn-limbs', 'The upper limbs', [200, 768], 7204, { back: true, art: { anchorY: 800 } });
  r.cave(384, 256, 2880, 1280, { ceil: 128, w: 0, e: 0, skip: [[1344, 2944]] });
  r.hole(0, 512, 384, 768);
  r.cave(2880, 256, 3200, 576, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.hole(2368, 64, 2944, 256);
  // Secret: a niche up in the roof over the second limb (its shelf at 320, an overhang hides it).
  r.hole(1728, 128, 2240, 256);
  // A covered vent under the floor, its mouth between the stump and the tall trunk, east under them into the chamber
  // behind the hub's high rotten wall (review r5 #10: a hidden route, the short way home from a fall off the gap).
  r.hole(2368, 1280, 3200, 1472);
  r.fill();
  r.mass(1408, 256, 320, 128);
  r.mass(1856, 320, 384, 64);
  // The first limb, then the second 384 px on and 192 up: a jump at its edge, thorns under the whole gap.
  r.limb('l1', 384, 1088, 768, { grows: 'east', end: 'snap' });
  r.limb('l2', 1472, 2016, 576, { grows: 'east', end: 'snap', h: 80, calm: true });
  // A stump (it takes the claws: the floor between the thorn beds is no pit; the second limb ends 224 px short of
  // it, out of the kick's reach) and a tall trunk; she kicks up the trunk's west face and drops onto the last limb.
  r.tree('stump', 2240, 96, 704, 1280, true, true);
  r.tree('tall', 2560, 128, 320, 1280, true, 'west');
  r.limb('l3', 2688, 2880, 448, { parent: 'tall', grows: 'east', end: 'burl', h: 80, calm: true });
  // One bramble bed under the gap and the second limb to the stump (r7, review r6 #1: v6's three trays joined, 1,408
  // long): a miss off the limbs costs a return, HK's spike pit; west of it the floor is clean under the first limb.
  r.thorns('thorn-g1', 832, 1280, 2240 - 832);
  // (r8, review r7 #7: the trunk, the well and the limbs ran at 3.4-3.7 a screen one after another; the limbs' lampwing
  // over the bed and its pod went: the way home is the bed and the high line, a breath after the well.)
  // The high line (review r6 #4): two lamps over the bed, the first a jump off the first limb's end, the second a
  // jump off the second limb; flung up from it she is in the niche over the second limb (three glints: the claws
  // reach it too, up the tall trunk's face and along the roof).
  // (r12, first-timer r11: four deaths here, 5-7 thorn hits a bot; "when I grab it and press V I don't go far enough
  // right". The gap was past any jump (384 across, ~200 up), and the fling only crossed aimed up-right. Now: a root
  // knuckle under the second limb's west end (48 up, 288 across: a running jump), up from it onto the limb; and the
  // lamp let go with no direction held flings up-right onto the limb, as the hatch's first lamp does. Held right it
  // lands on the knuckle.)
  // (A root mass, not a one-way: the route's spread counts one-ways, and the limbs sit in its quiet stretch.)
  r.mass(LIMB_KNUCKLE[0], LIMB_KNUCKLE[1], LIMB_KNUCKLE[2], 48);
  r.lamp('wick-limb-1', 1240, 600, { aim: [1, -1] });
  r.lamp('wick-limb-2', 1640, 450);
  r.hoard('niche-', 1920, 220, 240, 40, 2);
  r.cover('niche-cover', 1664, 64, 640, 320);
  r.cover('vent-cover', 2304, 1280, 896, 256);
  r.place('west', 200, 768);
  r.place('east', 3000, 576);
  r.place('floor', 2448, 1280);
  r.place('niche', 2000, 320);
  r.shotStops([
    ['west', 400, 768],
    ['gap', 1280, 768],
    ['chimney', 2400, 704],
    ['east', 3000, 576],
  ]);
  r.route('well', 'west');
  r.route('west', 'east', { needs: [C] });
  r.route('east', 'hub');
  r.route('west', 'floor', { oneWay: true });
  r.route('floor', 'vent');
  r.route('floor', 'east', { needs: [C] });
  return r.finish();
}

// The rot branch (review r2 #5, #10): a second way down from the giant, grown into a small adventure of 10 screens.
// The rot hall (a burrback under its roof; rotten walls floor to roof both sides), the crawlspace (a low tunnel
// winding down and back, juveniles and a dangler in it), the weaver's orb web across the way, the Elder's root room
// (a claw climb up its shaft to the moonDrop; its plug opens into the well: the branch closes into a loop).

function rot(): Json {
  const r = new Wood('cn-rot', 'The rot hall', [1500, 1472], 7205, { back: true, mood: 'deep' });
  r.hole(1088, 0, 1280, 1088);
  r.cave(640, 1088, 2240, 1472, {
    ceil: 96,
    w: 0,
    e: 0,
    skip: [
      [640, 900],
      [1024, 1344],
      [1408, 1792],
    ],
  });
  // West: a low corridor to the well's bottom (its root door, in the well, opens only from this side: review r5
  // #1); east: the cache behind rotten heartwood.
  r.hole(0, 1216, 640, 1472);
  r.hole(2240, 1216, 2368, 1472);
  r.bark('rot-cache', 2304, 1216, 64, 256);
  r.cave(2368, 1088, 3008, 1472, { ceil: 64, w: 0, e: 64, corner: 64 });
  r.bark('crawl-panel', 896, 1472, 192, 64, true);
  // (r9, review r8 #2: the mass more than 256 px from the air is sealed air with the back behind it.)
  r.sealDeep();
  r.fill();
  // (The shaft down from the giant is a one-way drop: its faces refuse the claws, so it never reads as a way up to a
  // panel she cannot open from below; r4 bots kicked up it for minutes.)
  r.noClaws(1088, 0, 1088);
  r.noClaws(1280, 0, 1088);
  // (r7, review r6 #1: the hall's two trays are gone: the burrback under its roof is the one problem.)
  r.burrback('burr-rot', 1900, 1472, -1, 260, { fenced: true });
  // (r7, review r6 #7: the cache pays a glint pile, a pod to break, not a great and one glint.)
  r.pod('pod-cache', 2700, 1472, 1200, 'sit', 3);
  r.cover('cache-cover', 2304, 1024, 768, 512, 'rot-cache');
  r.place('hall', 1500, 1472);
  r.place('west', 300, 1472);
  r.shotStops([
    ['hall', 1500, 1472],
    ['wall', 700, 1472],
    ['cache', 2100, 1472],
  ]);
  r.route('trunk', 'hall', { oneWay: true });
  r.route('hall', 'west');
  r.route('west', 'well');
  r.route('hall', 'crawl');
  return r.finish();
}

function crawl(): Json {
  const r = new Wood('cn-crawl', 'The crawlspace', [960, 160], 7206, { back: true, mood: 'deep' });
  // A low tunnel that winds east along the top, drops, comes back west, drops again and leaves west: every step
  // 224 px or less (she gets back up to the rot hall without the claws).
  r.hole(640, 0, 1408, 160);
  r.cave(1280, 64, 2176, 288, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(2048, 192, 2944, 416, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(2304, 384, 2944, 608, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(1536, 512, 2432, 736, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(640, 640, 1664, 864, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(256, 832, 896, 1056, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(0, 1056, 512, 1280, { ceil: 0, w: 0, e: 0, corner: 0 });
  // (r7, review r6 #1: a quiet room, the winding dark and one juvenile; v6's roof niche and its great are gone.)
  // (r9, review r8 #2: the mass more than 256 px from the air is sealed air with the back behind it.)
  r.sealDeep(192);
  r.fill();
  r.juvenile('juv-c2', 1100, 864, 1, 260);
  r.place('in', 960, 160);
  r.place('out', 200, 1280);
  r.shotStops([
    ['in', 960, 160],
    ['turn', 2600, 608],
    ['low', 1100, 864],
    ['out', 300, 1280],
  ]);
  r.route('rot', 'in');
  r.route('in', 'out');
  r.route('out', 'webs');
  return r.finish();
}

function webs(): Json {
  const r = new Wood('cn-webs', 'The weaver', [2300, 1280], 7208, { back: true, mood: 'deep' });
  r.cave(384, 320, 2176, 1280, { ceil: 128, w: 64, e: 64, corner: 128 });
  r.hole(0, 1024, 384, 1280);
  r.hole(2176, 1024, 2560, 1280);
  r.fill();
  // The orb web across the way, its weaver, its lamp at the hub (snuff it and the silk goes slack).
  r.lamp('wick-webs', 1280, 760);
  r.enemy({
    id: 'web-elder',
    kind: 'web',
    x: 1280,
    y: 760,
    facing: 1,
    guards: 'wick-webs',
    orb: { r: 460, spokes: 12, rings: 4, frame: 640, gaps: [[60, 75]] },
  });
  r.enemy({
    id: 'weaver',
    kind: 'weaver',
    x: 1280,
    y: 760,
    facing: 1,
    web: 'web-elder',
    guards: 'wick-webs',
  });
  // (r7, review r6 #7: the roof niche's great and glint are gone: the web and its weaver are the room.)
  r.place('east', 2300, 1280);
  r.place('west', 200, 1280);
  r.shotStops([
    ['east', 2300, 1280],
    ['web', 1280, 1100],
    ['west', 300, 1280],
  ]);
  r.route('crawl', 'east');
  r.route('east', 'west');
  r.route('west', 'elder');
  return r.finish();
}

/** The Elder's strips ([id, face, y0, y1]). */
const ELDER_THORNS: Array<[string, 'w' | 'e', number, number]> = [
  ['thorn-e1', 'w', 1856, 2040],
  ['thorn-e3', 'e', 648, 800],
];

function elder(): Json {
  const r = new Wood('cn-elder', "The Elder's root room", [2300, 2496], 7207, { back: true, mood: 'deep' });
  r.cave(1152, 2240, 2560, 2496, { ceil: 64, w: 0, e: 0, corner: 0 });
  // The climb: a 384 px chimney, its west face clean from the floor to the gallery (a rest carved into the east
  // wall halfway); the plug's passage across the chimney's top.
  r.hole(768, 128, 1152, 2496);
  r.hole(1152, 1472, 1408, 1856);
  r.cave(256, 192, 768, 512, { ceil: 96, w: 64, e: 0 });
  r.cave(1408, 896, 2560, 1152, { ceil: 64, w: 0, e: 0, corner: 0 });
  r.hole(1152, 896, 1408, 1152);
  // The heartwood plug across the chimney over the passage's mouth (review r3 #1): cut from a cling under it.
  r.plug('elder-heart', 768, 832, 384);
  r.hole(1600, 2496, 1856, 2560);
  // (r9, review r8 #2: the mass more than 256 px from the air is sealed air with the back behind it.)
  r.sealDeep();
  r.fill();
  // Three legs, a rest at each end (review r4 #1: the Elder is the optional hardest, a skill test, not a phase lock):
  // the floor to the rest in the east wall, the rest to the plug's passage, the plug to the gallery. Root lips out of
  // the rest and the passage start the next leg; a strip on one face at a time (tools/levels/climbs.ts).
  // (A root at the floor cave's mouth carries the east face down to 128 over the floor: r8, review r7 #9, at a relaxed
  // kick, 16 frames, a first touch 190 over the floor slid off the face's foot.)
  r.mass(1152, 2240, 64, 128);
  r.oneWay(1024, 1856, 128, 'branch');
  r.oneWay(1024, 1152, 128, 'branch');
  for (const [id, f, y0, y1] of ELDER_THORNS) r.thornsUp(id, f === 'w' ? 768 : 1152 - 28, y0, y1 - y0);
  // A reward off the line (review r5 #2): glints on the thorned east face over its strip, a kick across and back.
  r.glints('risk-e-', [
    [1124, 420],
    [1124, 480],
  ]);
  r.hollow('drop-elder', 500, 512, 'moonShard');
  r.place('in', 2300, 2496);
  r.place('top', 700, 512);
  r.place('plug', 2400, 1152);
  r.shotStops([
    ['in', 2200, 2496],
    ['climb', 960, 1700],
    ['plug', 960, 1000],
    ['top', 700, 512],
  ]);
  r.route('webs', 'in');
  r.route('in', 'top', { needs: [C] });
  r.route('top', 'in', { oneWay: true });
  r.route('top', 'drop-elder');
  r.route('top', 'plug', { oneWay: true });
  r.route('plug', 'in', { oneWay: true });
  r.route('plug', 'well');
  // Furniture between the fights (review r5 #3: the exact references' thorns, things to hit and small ledges).
  r.thorns('thorn-e-floor', 1600, 2560, 256);
  return r.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// East. The fork: open over the roots, two juveniles, a root knoll; a rotten panel over the stairs down to the
// cellar; the east moth-stone in a pocket of the west wall; the claw face up to the Grove (the Grove is the reward
// for the claws); a glide-only shelf in its sky. The Grove: a closed arena-pit in tiers, lamplit, at grove density,
// the Grovemother's trunk through its roof, the seed on her crown (a claw climb), caps to climb back, a rotten wall
// in the pit. The Spire: a wide chimney with a hawker on a lamp's rhythm; the nook and the hollow root off it.

function fork(): Json {
  const r = new Wood('cn-fork', 'The east fork', [400, 1344], 7301, {
    art: { anchorY: 900, moon: { x: 1650, y: 380, r: 110 }, afterglow: { x: 2600, y: 800, strength: 0.4 } },
  });
  r.hole(896, 0, 2816, 1088);
  r.cave(0, 1088, 896, 1344, { ceil: 64, w: 0, e: 0, corner: 0 });
  r.cave(2816, 320, 3200, 576, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.back(0, 1088, 896, 1344);
  // (r8, review r7 #7: the fork is the path's quiet room before the Grove, the face and the lamp: v7's moth-stone
  // pocket (its stone now in the Grove's entry), the glide shelf and its glints are gone.)
  // Secret (review r3 #9: a wall, not a floor panel): a rotten wall in the root knoll's west face, a chamber in the
  // knoll, stairs from its floor down west under the fork to the cellar.
  r.hole(1984, 1088, 2816, 1344);
  r.hole(896, 1088, 1600, 1344);
  r.bark('cellar-panel', 1600, 1152, 64, 192);
  r.hole(1664, 1152, 1984, 1344);
  r.hole(1792, 1344, 1984, 1408);
  r.hole(1344, 1408, 1984, 1536);
  r.hole(832, 1536, 1472, 1728);
  r.hole(320, 1664, 960, 1856);
  r.back(320, 1408, 1984, 1920);
  // The west block as a trunk (r9, review r8 #2: one rectangle a screen tall over the way in): 320 thick at its face,
  // sealed air and the deep back behind it. Nothing she can reach opens.
  r.sealed(64, 128, 576, 960);
  r.fill();
  r.noClaws(896, 0, 1088);
  r.noClaws(2816, 0, 320);
  r.limb('perch', 896, 1344, 1088, { grows: 'east', end: 'tip', h: 80 });
  // (Review r4 #2: thorns at the face's foot read as "not this way"; r7, review r6 #1: v6's tray west of it is gone
  // too. The juvenile on the knoll, and a lamp over the face's top: the way on points at a warm light.)
  // (r8, review r7 #7: the fork's approach is the path's quiet room before the Grove: v7's juvenile on the knoll, the
  // pod at the face's top and the stone pocket's ledge and pod are gone; the face and the lamp over its top remain.)
  // (r7: east in the top's cave, high: flung west off it at 3000 x 440 a clawed player reached the glide shelf.)
  r.lamp('wick-fork', 3120, 400);
  // (r8: two covers, the knoll's chamber behind the panel and the stairs under the floor; v7's one ran over the open
  // way in from the Crossing as well.)
  r.cover('cellar-cover', 1600, 1088, 448, 448, 'cellar-panel');
  r.cover('stairs-cover', 256, 1408, 1792, 512, 'cellar-panel');
  r.place('mid', 1000, 1344);
  r.place('top', 3000, 576);
  r.place('stairs', 600, 1856);
  r.shotStops([
    ['entry', 400, 1344],
    ['knoll', 1400, 1344],
    ['face', 2500, 1344],
    ['top', 2900, 576],
  ]);
  r.route('hub', 'mid');
  r.route('gap', 'mid', { oneWay: true });
  r.route('mid', 'stairs');
  r.route('stairs', 'cellar');
  r.route('mid', 'top', { needs: [C] });
  r.route('top', 'mid', { oneWay: true });
  r.route('top', 'grove');
  return r.finish();
}

// The cellar branch (review r2 #5, #10; the bots' cellar: bait over a thorn bed in a cramped room killed the
// skilled bot 238 times): a root cellar under the fork, tall enough to fight in, the ants' trails across it, no
// thorn under anything she wants; the galleries (the ants' nest, a stair of burls down into it); the larder at the
// end (the moonDrop, up a claw face: a lock seen early). A trapdoor in the cellar's stair opens from below, from the
// low passage the tunnel's shortcut reaches: after the seed door, tunnel -> cellar -> fork is a way home.

function cellar(): Json {
  const r = new Wood('cn-cellar', 'The root cellar', [480, 128], 7302, { back: true, mood: 'deep' });
  r.cave(320, 0, 1024, 128, { ceil: 0, w: 64, e: 0, corner: 0 });
  r.cave(896, 64, 1472, 320, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(1344, 256, 1920, 512, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(1792, 192, 2944, 704, { ceil: 128, w: 0, e: 64 });
  r.hole(2944, 448, 3200, 704);
  // The low passage from the tunnel's shortcut, and its shaft up to the trapdoor in the stair.
  r.cave(0, 1536, 1280, 1792, { ceil: 64, w: 0, e: 64, corner: 0 });
  r.hole(1024, 320, 1216, 1536);
  // (r9, review r8 #2: the mass more than 256 px from the air is sealed air with the back behind it.)
  r.sealDeep();
  r.fill();
  r.shortcut('trap', 1024, 320, 192, 64, 's');
  r.burl(2240, 704, 320, 128, 2);
  // (r7, review r6 #1: a quiet room, one ant on its way to the nest; v6's two trays, knuckle and pod are gone.)
  r.ants('ant-c', 1900, 2900, 704, 1);
  r.place('in', 480, 128);
  r.place('hall', 2300, 704);
  r.place('low', 600, 1792);
  r.shotStops([
    ['in', 500, 128],
    ['stair', 1400, 512],
    ['hall', 2400, 704],
    ['low', 700, 1792],
  ]);
  r.route('fork', 'in');
  r.route('in', 'hall');
  r.route('hall', 'galleries');
  r.route('tunnel', 'low');
  r.route('low', 'in', { needs: [C], door: 'trap' });
  return r.finish();
}

function galleries(): Json {
  const r = new Wood('cn-galleries', 'The galleries', [200, 704], 7306, { back: true, mood: 'deep' });
  r.cave(0, 448, 1536, 704, { ceil: 64, w: 0, e: 0, corner: 0 });
  r.cave(1280, 384, 2688, 1408, { ceil: 128, w: 0, e: 0, corner: 128 });
  r.cave(2688, 384, 3840, 640, { ceil: 64, w: 0, e: 0, corner: 0 });
  // Secret: a low gallery east off the nest's floor, behind rotten heartwood.
  r.hole(2688, 1152, 2816, 1408);
  r.bark('nest-wall', 2752, 1152, 64, 256);
  r.cave(2816, 1088, 3584, 1408, { ceil: 64, w: 0, e: 64, corner: 64 });
  // (r9, review r8 #2: the mass more than 256 px from the air is sealed air with the back behind it.)
  r.sealDeep(192);
  r.fill();
  // A stair of burls down into the nest (steps of 176: no claws needed back up).
  r.burl(1280, 1408, 512, 704, 4);
  r.ants('ant-g', 1900, 2600, 1408, 3);
  r.juvenile('juv-g', 2300, 1408, -1, 260);
  // (r7, review r6 #7: the nest pays a glint pile, not a great.)
  r.hoard('nest-', 3150, 1300, 360, 80, 2);
  r.cover('nest-cover', 2752, 1024, 896, 448, 'nest-wall');
  r.place('west', 200, 704);
  r.place('floor', 2200, 1408);
  r.place('east', 3600, 640);
  r.shotStops([
    ['west', 400, 704],
    ['stair', 1500, 1100],
    ['nest', 2200, 1408],
    ['east', 3400, 640],
  ]);
  r.route('cellar', 'west');
  r.route('west', 'floor');
  r.route('floor', 'east', { needs: [C] });
  r.route('east', 'floor', { oneWay: true });
  r.route('east', 'larder');
  // Furniture between the fights (review r5 #3: the exact references' thorns, things to hit and small ledges).
  r.oneWay(2432, 1152, 128, 'branch');
  r.oneWay(2048, 1024, 160, 'branch');
  // (No knuckle higher: from 896 the east gallery was a jump, the larder's lock without the claws.)
  return r.finish();
}

function larder(): Json {
  const r = new Wood('cn-larder', 'The larder', [200, 640], 7307, { back: true, mood: 'deep' });
  r.cave(0, 384, 896, 640, { ceil: 64, w: 0, e: 0, corner: 0 });
  r.cave(640, 704, 2304, 1536, { ceil: 128, w: 64, e: 64, corner: 128 });
  r.hole(768, 640, 896, 704);
  // (r9, review r8 #2: the mass more than 256 px from the air is sealed air with the back behind it.)
  r.sealDeep();
  r.fill();
  r.burl(1280, 1536, 384, 192, 2);
  // (r12, first-timer ft12: "trapped at the bottom of the larder": the way back up was a claw climb round the corner's
  // overhang that only the explorer found. Three root ledges now, a jump each (~210-230 up), the last under the hole:
  // from it a jump carries over the hole's lip onto the way in's floor.)
  // (Root masses, not one-ways: the room spread counts one-ways and the larder is a quiet room.)
  r.mass(640, 1328, 192, 48);
  r.mass(832, 1112, 160, 48);
  r.mass(768, 880, 160, 48);
  r.burrback('burr-larder', 1880, 1536, -1, 300, { fenced: true });
  r.ants('ant-l', 900, 1800, 1536, 2);
  r.hollow('drop-larder', 2150, 1536, 'moonShard');
  r.place('in', 200, 640);
  r.place('floor', 1800, 1536);
  r.shotStops([
    ['in', 400, 640],
    ['floor', 1600, 1536],
  ]);
  r.route('galleries', 'in');
  r.route('in', 'floor', { oneWay: true });
  r.route('floor', 'in', { needs: [C], oneWay: true });
  r.route('floor', 'drop-larder');
  return r.finish();
}

/** The Grove's arena: its roof (the gates' underside, review r6 #6) and its lamps' height (220 over the pit floor). */
const ARENA_TOP = 1088;
const GROVE_WICK_Y = 1380;

function grove(): Json {
  const r = new Wood('cn-grove', 'The Lamp Grove', [300, 576], 7303, {
    mood: 'warm',
    art: { anchorY: 1100, moon: { x: 1500, y: -400, r: 60 }, afterglow: { x: 2250, y: 1200, strength: 0.6 } },
  });
  r.hole(0, 320, 704, 576);
  r.cave(0, 192, 3840, 320, {
    ceil: 96,
    w: 0,
    e: 0,
    corner: 0,
    skip: [
      [576, 768],
      [1344, 1728],
      [1952, 2560],
      [2560, 3008],
    ],
  });
  r.hole(704, 192, 3200, 800);
  r.hole(1088, 192, 3200, 1024);
  r.hole(1472, 192, 3200, 1600);
  r.hole(3200, 192, 3840, 1472);
  // Secret: a pocket in the pit's west wall behind rotten heartwood (was a floor panel: r2 #6; r6, review r5 #10: a
  // chamber of 768 x 448 with a ledge and a pod).
  r.hole(640, 1152, 1408, 1600);
  r.bark('pit-wall', 1408, 1408, 64, 192);
  // (Floor thorns sit in shallow pits, gaps she jumps: r5's bots walked into every flat bed on the way.)
  r.hole(2560, 1600, 2700, 1664);
  r.hole(3264, 1472, 3584, 1536);
  r.cap('cap-w', 1536, 1536, 128, 'big');
  r.cap('cap-e', 3008, 1536, 128, 'mid');
  r.back(704, 800, 3200, 1600);
  // The way east shut by a root gate until the pit is cleared (review r3 #7: the area's peak as an arena wave).
  r.gate('pit-gate', 3712, 1216, 128, 256, 'cn-grove-clear');
  // The arena (review r5 #5): the west door shuts behind her as she lands in the pit (`shut`) (a fade re-arms it: the
  // door stands open behind her as she re-forms at the entry's save). It stands at the entry corridor's lip, east of
  // the save, roof to floor.
  r.gate('pit-door', 640, 192, 64, 384, 'cn-grove-clear', 'cn-grove-wave');
  // (r7, review r6 #6: the arena is the pit, not the room.) Two root gates lie over the pit's openings and shut with
  // the west door: one west of the Grovemother (to the tiers), one from her east face to the room's east wall (over
  // the east floor and its gate out): she fights in 1,472-3,840 x 1,088-1,600 and cannot climb out to kite above.
  r.gate('arena-w', 1472, ARENA_TOP - 64, 2016 - 1472, 64, 'cn-grove-clear', 'cn-grove-wave');
  r.gate('arena-e', 2496, ARENA_TOP - 64, 3840 - 2496, 64, 'cn-grove-clear', 'cn-grove-wave');
  r.fill();
  // The Grovemother: a 480 px trunk from her root stilts over the pit up through the roof; her crown limbs grow from her (their
  // solids start 160 px off her faces: a claw climb needs room for the kick), the climb on her faces.
  r.tree('mother', 2016, 480, -500, 1344, true, true);
  // (She stands on root stilts over the pit floor: the way under her is 256 tall; the stilts are painted, not solid.)
  r.tree('stilt-w', 2016, 80, 1344, 1600, false);
  r.tree('stilt-e', 2416, 80, 1344, 1600, false);
  r.limb('crown-w', 1376, 1856, 704, {
    parent: 'mother',
    grows: 'west',
    end: 'snap',
    h: 80,
    flat: [[1376, 1856]],
    from: [2016, 640],
  });
  r.limb('crown-e', 2656, 3136, 704, {
    parent: 'mother',
    grows: 'east',
    end: 'snap',
    h: 80,
    flat: [[2656, 3136]],
    from: [2496, 640],
  });
  r.add('moonseeds', { id: 'seed-grove', x: 2960, y: 640 });
  r.hollow('keen-hollow', 1560, 704, 'keenBlade');
  // (r7, review r6 #4 / #6: the pit's two lamps hang 220 over its floor, in a jump's fling reach: the wave is fought
  // with the throw-cut and the fling's escape over a ram.)
  // (r10, review r9 #2: the west lamp is a trap, a cage of moths cut open in the fight or after it; the east one the
  // fling's escape.)
  r.lamp(GROVE_TRAP, 1760, GROVE_WICK_Y, { trap: true, moths: 30 });
  r.lamp('wick-b', 2800, GROVE_WICK_Y);
  r.lamp('wick-c', 3500, 900);
  // The pit as an arena wave in two beats (review r5 #5): landing in the pit shuts the west door (`pit-door`) and
  // wakes beat 1, the two burrbacks (asleep, `wakes`, until then: the trigger starts the fight); when both are dead,
  // beat 2 comes from three sides: the juveniles from the pit's two ends (clear of the caps), the dangler down from
  // the Grovemother's west crown limb, the lampwing from `wick-b`'s light. A root step west of her arch (off the
  // thorn bed: r5 bots were knocked off the old one into it) is the pit's high point (224 over the floor, the rams
  // pass under it). Both doors open as the last of beat 2 dies (src/sim/kit.ts). (v4: the juveniles spawned inside
  // the caps, sealed in, and the gate never opened.)
  // r8 (review r7 #2: beat 1 spawned 50 px from where she drops in and hit her within 40 frames): the only way into
  // the pit before the wave is the drop west of the Grovemother (her trunk walls the east half from the roof to her
  // stilts), so the trigger is that drop's column and fires as she passes the gates' line (they shut over her). Beat
  // 1 arrives from the pit's east floor a beat later (2,800 and 3,240: 780+ px off), to ground under and east of her.
  // Beat 2's juveniles drop from under the gates (480 px over the floor), the far one first if she stands under the
  // near one (`arrive` picks a point 400+ px from her).
  const wave = { wakes: 'cn-grove-wave', sets: 'cn-grove-beat2' };
  const beat2 = { wakes: 'cn-grove-beat2' };
  const clear = { sets: 'cn-grove-clear' };
  r.burrback('burr-pit-w', 2380, 1600, -1, 300, { fenced: true, ...wave, arrive: [[2800, 1600]] });
  r.burrback('burr-pit-e', 2950, 1600, -1, 200, { fenced: true, ...wave, arrive: [[3240, 1600]] });
  // (r8, the v7 video: `juv-wave-w` waited 200 s in its 200 px ground while she stood on the east floor: the beat's
  // walkers range over the pit floor now, so they come to her.)
  r.juvenile('juv-wave-w', 1760, 1600, 1, 500, {
    fenced: true,
    ...beat2,
    ...clear,
    arrive: [
      [1760, 1120],
      [2920, 1120],
    ],
  });
  r.juvenile('juv-wave-e', 2920, 1600, -1, 300, {
    fenced: true,
    ...beat2,
    ...clear,
    arrive: [
      [2920, 1120],
      [1760, 1120],
    ],
  });
  // (r7: the dangler and the lampwing inside the arena's bounds: the dangler under the Grovemother's trunk, over the
  // way beneath her. r8, the coordinator's v7 video: the lampwing hung 350 px over the east floor and never dived at
  // her on the pit floor (out of its sight), and with the gates shut only a fling reached it: the wave stalled. Its
  // home is low over the pit's east floor now, its sight over the floor.)
  r.dangler('dang-wave', 2112, 1344, 1, { ...beat2, ...clear });
  r.flyer('lampwing', 'wing-wave', 2960, 1360, -1, { radius: 120, sight: 360, ...beat2, ...clear });
  r.oneWay(1792, 1376, 192, 'branch');
  // A second root step east of her, over the thorn pit (r7: two high points to fight from), and pods in the pit to
  // refuel on (review r6 #6), and a line of glints over the floor that the lamps' flings and the big cap reach.
  r.oneWay(2560, 1392, 192, 'branch');
  r.pod('pod-step-w', 1888, 1376, 1200, 'sit');
  r.pod('pod-step-e', 2656, 1392, 1200, 'sit');
  r.pod('pod-mother', 2256, 1344, 1200, 'hang');
  r.pod('pod-east', 3680, 1472, 1200, 'sit');
  r.arc('pit-arc-', 1560, 1980, 1180, 40, 3);
  // A camera zone fits the arena while the wave runs (review r6 #6).
  r.set('camera', {
    zones: [
      {
        id: 'arena',
        x: 1472,
        y: ARENA_TOP,
        w: 3840 - 1472,
        h: 1600 - ARENA_TOP,
        fit: true,
        until: 'cn-grove-clear',
      },
    ],
  });
  // (Landing in the pit still marks the way down: proofs and the review video read it.)
  // (r9b: its top 128 under the arena gates' foot: one gliding down through the opening set it with her head still in
  // the gate's rect, and the gate shut on her (the route video stood stuck in it 240 s).)
  r.add('triggers', { id: 'pit-wave', x: 1472, y: 1216, w: 2016 - 1472, h: 384, sets: 'cn-grove-wave' });
  r.flyer('lampwing', 'wing-a', 1700, 900, 1, { radius: 220 });
  r.flyer('hawker', 'hawk-e', 3600, 700, -1, { radius: 260 });
  r.thorns('thorn-p1', 2560, 1664, 140);
  r.thorns('thorn-e1', 3264, 1536, 320);
  r.thornsUnder('thorn-roof', 1400, 192, 256);
  // (r7, review r6 #7: the pit wall's pocket pays a moon shard, not a great and three glints.)
  r.hollow('shard-grove', 1150, 1600, 'moonShard');
  r.oneWay(832, 1408, 160, 'branch');
  r.pod('pod-pit', 912, 1408, 1200, 'sit', 2);
  r.cover('pit-cover', 576, 1088, 896, 576, 'pit-wall');
  r.pod('pod-crown', 2800, 704);
  // A save at the entry (review r5 #5: the last was the hub's, five view widths back across the peak).
  r.patch('p-grove', 420, 576);
  // (r8: the east's moth-stone, out of the fork's quiet approach: at the Grove's door, by its save.)
  r.stone('stone-east', 180, 576, 'cn-east');
  r.route('mid', 'stone-east');
  r.landmark('mother', 'landmark', 2256, 1600);
  r.place('mid', 300, 576);
  r.place('pit', 1800, 1600);
  r.place('east', 3600, 1472);
  r.place('crown', 2900, 704);
  r.place('crown-w', 1500, 704);
  r.shotStops([
    ['entry', 400, 576],
    ['tiers', 1100, 1024],
    ['pit', 2200, 1600],
    ['crown', 2700, 704],
    ['east', 3500, 1472],
  ]);
  r.route('fork', 'mid');
  r.route('mid', 'pit', { oneWay: true });
  r.route('pit', 'mid');
  r.route('pit', 'east');
  r.route('east', 'spire');
  r.route('pit', 'crown', { needs: [C] });
  r.route('pit', 'crown-w', { needs: [C] });
  r.route('crown', 'pit', { oneWay: true });
  r.route('crown-w', 'pit', { oneWay: true });
  r.route('crown', 'seed-grove');
  r.route('crown-w', 'keen-hollow');
  r.route('pit', 'shard-grove');
  // Furniture between the fights (review r5 #3: the exact references' thorns, things to hit and small ledges).
  r.pod('pod-tier', 900, 800, 1200, 'sit');
  return r.finish();
}

function spire(): Json {
  const r = new Wood('cn-spire', 'The Spire', [300, 1472], 7305, { back: true });
  r.cave(0, 1216, 640, 1472, { ceil: 64, w: 0, e: 0, corner: 0 });
  // The chimney up the Spire's heart: 640 wide below (room to dodge the hawker that crosses it on its lamp's rhythm),
  // narrowing to 384 over the nook's passage (a kick across: review r3 #1).
  r.hole(640, 640, 1280, 1472);
  r.hole(896, 0, 1280, 640);
  // A passage through the Spire's trunk to the nook, its mouth in the east face she climbs.
  r.cave(1280, 640, 2560, 896, { ceil: 64, w: 0, e: 0, corner: 0 });
  // The foot: steps down east to a rotten wall, the hollow root behind it.
  r.hole(1280, 1216, 1600, 1472);
  r.hole(1472, 1408, 1856, 1664);
  r.cave(1728, 1600, 2560, 1856, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.bark('hollow-wall', 2240, 1600, 64, 256);
  r.hole(1920, 1856, 2176, 1920);
  // (r9, review r8 #2: the mass more than 256 px from the air is sealed air with the back behind it.)
  r.sealDeep(192);
  r.fill();
  // Two legs: up the east face to the nook's mouth (the rest), then out from under its lip and up the narrow
  // chimney by kicks across, thorns on alternate faces, through the hawker's orbit (measured: E 650, W 430, E 210).
  // (Review r4 #1: the neck is the model; r5 makes it readable: she starts on the east face out from under the lip, the
  // east face is thorned above, so she changes to the clean west face at once.)
  r.thornsUp('thorn-s2', 1188, 235, 185);
  // (Review r3 #1: thorns on the west face under the lamp, so the climb changes wall where the hawker crosses.)
  r.thornsUp('thorn-s1', 640, 800, 200);
  // A root hangs at the foot passage's mouth: the east face reaches 192 over the floor (a late kick still holds).
  r.mass(1280, 1216, 64, 64);
  // (r8, review r7 #9: at a relaxed kick, 16 frames, the neck's first touch slid off the east face's foot, 256 over
  // the nook's mouth.) A root column hangs off the neck's east face in front of the mouth's top, its face 120 px lower
  // (to 760, the mouth still 136 open under it), and a root lip runs out from the mouth's floor past it: from the lip
  // a jump meets the column on the way up.
  r.mass(1216, 576, 64, 184);
  r.oneWay(1088, 896, 192, 'branch');
  r.lamp('wick-spire', 960, 760);
  r.flyer('hawker', 'hawk-spire', 960, 720, -1, { orbit: 'wick-spire', period: 210, radius: 300 });
  r.cover('nook-cover', 1280, 576, 1280, 384);
  r.cover('hollow-cover', 2240, 1536, 320, 384, 'hollow-wall');
  r.place('base', 300, 1472);
  r.place('foot', 1820, 1856);
  // (r8, review r7 #7: the foot's thorn tray went: the Spire is a climb, its hazard the neck's strips.)
  r.place('top', 960, 200);
  r.shotStops([
    ['base', 400, 1472],
    ['climb', 960, 1000],
    ['neck', 1088, 400],
    ['foot', 1900, 1856],
  ]);
  r.route('grove', 'base');
  r.route('base', 'foot');
  r.route('foot', 'base', { needs: [C] });
  r.route('foot', 'hollowroot');
  r.route('base', 'top', { needs: [C] });
  r.route('top', 'base', { oneWay: true });
  r.route('top', 'bower');
  r.route('base', 'nook', { needs: [C] });
  r.route('nook', 'base', { oneWay: true });
  return r.finish();
}

function nook(): Json {
  const r = new Wood('cn-nook', 'The Spire nook', [200, 896], 7308, { back: true, mood: 'deep' });
  r.cave(0, 640, 768, 896, { ceil: 64, w: 0, e: 0, corner: 0 });
  r.cave(512, 320, 2048, 1216, { ceil: 128, w: 64, e: 64, corner: 128 });
  r.fill();
  r.burl(1280, 1216, 448, 384, 2);
  // (r7, review r6 #1 / #7: the high map on its burl and nothing else: no tray, no glints.)
  r.stone('stone-high', 1500, 832, 'cn-high');
  r.place('in', 200, 896);
  r.shotStops([
    ['in', 600, 896],
    ['burl', 1500, 1216],
  ]);
  r.route('spire', 'in');
  r.route('in', 'stone-high');
  r.route('stone-high', 'in', { needs: [C] });
  r.oneWay(1100, 960, 128, 'branch');
  return r.finish();
}

function hollowroot(): Json {
  const r = new Wood('cn-hollowroot', 'The hollow root', [200, 416], 7304, { back: true, mood: 'deep' });
  r.cave(0, 160, 896, 416, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(640, 416, 2304, 1216, { ceil: 96, w: 64, e: 64, corner: 128 });
  // (r7, review r6 #1: a quiet room, grown 480 down: past the hall's floor a dark well drops to the one find, quick
  // wings at its foot; up its faces with the claws.)
  r.hole(1600, 1216, 2240, 1792);
  // (r9, review r8 #2: the mass more than 256 px from the air is sealed air with the back behind it.)
  r.sealDeep();
  r.fill();
  r.hollow('wings-hollow', 1950, 1792, 'quickWings');
  r.place('in', 200, 416);
  r.place('foot', 1700, 1792);
  r.shotStops([
    ['in', 500, 416],
    ['floor', 1500, 1216],
    ['foot', 1900, 1792],
  ]);
  r.route('spire', 'in');
  r.route('in', 'wings-hollow', { oneWay: true });
  r.route('wings-hollow', 'in', { needs: [C] });
  return r.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// High. The bower: she climbs out of the Spire into a hall roofed in heartwood (a hawker on a lamp's rhythm); west,
// the kin (a broken tree) as the climb to the crown: thorns on its lower third (in from a limb above them), thorns
// again in the chimney beside its top (she changes to the far wall); its top the way to the crown and west to the
// gap. The crown: the one cold-white moon room, a dead end with the glide. The gap: the vista; a glide from the
// bower's shelf over the wide gap to the far limb (seed 3), whose end drops into the Crossing (the second loop); a
// fall lands in the gap's floor (claw back up, or drop to the fork). A roost hidden in a hanging root clump on the
// glide line, its shaft up to the sky room (a hawker roost). The attic: a dangler nest.

/** The bower hall's bramble run (x0, x1), in a shallow pit (r7). */
const BOWER_RUN: [number, number] = [2176, 3264];

function bower(): Json {
  const r = new Wood('cn-bower', 'The bower', [3800, 1408], 7401, {
    back: true,
    art: { anchorY: 1100, moon: { x: 3000, y: -500, r: 60 } },
  });
  r.cave(0, 192, 1280, 704, { ceil: 96, w: 0, e: 0, corner: 0, skip: [[1088, 1280]] });
  // Secret: a root hollow under the west floor, behind a rotten wall at the foot of a pit (was a floor panel).
  r.hole(640, 704, 896, 960);
  r.bark('kin-wall', 576, 768, 64, 192);
  r.cave(128, 768, 576, 960, { ceil: 0, w: 64, e: 0, corner: 0 });
  // (r6, review r5 #10: a drop from it into a chamber of 768 x 448 under the west hall, a climb back up.)
  r.hole(128, 960, 320, 1024);
  r.cave(64, 1024, 832, 1472, { ceil: 0, w: 0, e: 0, corner: 64 });
  r.hole(1024, 64, 1280, 256);
  r.hole(1280, 0, 1536, 256);
  r.hole(1536, 0, 1856, 384);
  r.cave(1536, 384, 4608, 1408, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.hole(3968, 1408, 4608, 1664);
  // The hall's bramble run (r7, review r6 #1: v6's two trays became one composed run, 896 long, in a shallow pit),
  // under two root knuckles and the upper limb: over it on the knuckles, or the limb, or round by the kin's foot.
  r.hole(BOWER_RUN[0], 1408, BOWER_RUN[1], 1472);
  r.fill();
  r.tree('kin', 1280, 256, 256, 1664, true, true);
  r.limb('kin-ledge', 1728, 2240, 1152, { parent: 'kin', grows: 'east', end: 'snap', from: [1536, 1100] });
  r.limb('upper', 2752, 3392, 1024, { grows: 'east', end: 'snap', h: 80, calm: true });
  r.limb('over', 4192, 4384, 1152, { grows: 'east', end: 'tip', h: 64, calm: true });
  r.thornsUp('thorn-kin', 1536, 1250, 158);
  r.lamp('wick-hall', 3300, 860);
  r.flyer('hawker', 'hawk-hall', 3300, 660, -1, { orbit: 'wick-hall', period: 240, radius: 300 });
  // A save at the top of the Spire (review r3 #8): the halfway point of the east loop.
  r.patch('p-bower', 3800, 1408);
  // (r7, review r6 #7: the kin's chamber pays a moon shard, not two greats and five glints.)
  r.cover('kin-cover', 64, 704, 640, 320, 'kin-wall');
  r.cover('kin-cover-2', 0, 960, 896, 576, 'kin-wall');
  r.hollow('shard-kin', 600, 1472, 'moonShard');
  // (r8, review r7 #7: the kin chamber's pod went; the chamber pays its moon shard.)
  r.place('arrive', 3800, 1408);
  r.place('top', 1408, 256);
  r.place('west', 400, 704);
  r.place('pit', 760, 960);
  r.place('chamber', 500, 1472);
  // The kin, found again (r8, review r7 #5): in the chamber behind the rotten wall, keeping a light by the shard.
  r.landmark('kin-light', 'light', 220, 1472);
  r.set('marks', {
    ...(r.data.marks as Json),
    tatter: { x: 300, y: 1472, facing: 1 },
    notes: [
      {
        x: 300,
        y: 1380,
        text: 'the kin (2/3): keeps a small light in the chamber; it looks up as she breaks in',
      },
    ],
  });
  r.shotStops([
    ['arrive', 3800, 1408],
    ['hall', 2900, 1408],
    ['kin', 1800, 1152],
    ['top', 1500, 300],
    ['west', 500, 704],
  ]);
  r.route('spire', 'arrive');
  r.route('arrive', 'top', { needs: [C] });
  r.route('top', 'arrive', { oneWay: true });
  r.route('top', 'crown');
  r.route('top', 'west');
  r.route('west', 'top', { needs: [C], oneWay: true });
  r.route('west', 'gap');
  r.route('west', 'pit');
  r.route('west', 'chamber');
  r.route('chamber', 'shard-kin');
  r.route('arrive', 'attic', { needs: [C] });
  r.route('attic', 'arrive', { oneWay: true });
  r.thorns('thorn-b2', BOWER_RUN[0], 1472, BOWER_RUN[1] - BOWER_RUN[0]);
  r.oneWay(2496, 1216, 128, 'branch');
  r.oneWay(2880, 1248, 128, 'branch');
  // (r8, review r7 #7: the knuckle over the save's floor went: the bower thins toward 1.5.)
  return r.finish();
}

/** The crown's sit (r13, moment 3): on the limb c4 under the moon, west of the glade (feet, reach, frames still). */
const CROWN_WINGS = 'cn-crown-wings';
const CROWN_SIT = { x: 2000, y: 1024, r: 160, frames: 120 };

function crown(): Json {
  const r = new Wood('cn-crown', 'The moon crown', [1400, 1792], 7402, {
    art: { anchorY: 1100, moon: { x: 1300, y: 620, r: 230 }, afterglow: { x: 1400, y: 900, strength: 0.2 } },
  });
  r.hole(0, 0, 2560, 1792);
  r.fill();
  r.limb('c1', 1408, 1856, 1600, { grows: 'east', end: 'tip' });
  r.limb('c2', 1856, 2240, 1408, { grows: 'west', end: 'tip' });
  r.limb('c3', 1472, 1856, 1216, { grows: 'east', end: 'tip' });
  r.limb('c4', 1856, 2496, 1024, { grows: 'west', end: 'snap', flat: [[1950, 2300]] });
  r.add('glades', { id: 'glade-glide', x: 1980, y: 800, w: 400, h: 224, ability: G });
  // Moonlight for two (r13, moment 3): the glade's grant is also a flag (a trigger over the same rect), and once she has
  // her wings the kin is at the limb's tip, looking at the moon (it walked: the bower's chamber was its climb). Stand
  // still near it 2 s and it comes to sit by her (`kinSit`): the camera eases out (`crown-sit`), the duet. It has
  // walked on once she is at the gap (`cn-firefly-gap`).
  r.add('triggers', { id: 'glade-wings', x: 1980, y: 800, w: 400, h: 224, sets: CROWN_WINGS });
  r.add('sits', { id: 'kin-sit', ...CROWN_SIT, when: CROWN_WINGS, sets: 'cn-kin-sat' });
  // (r7, review r6 #1: the glide is learned in a calm room: no lampwing, no strip, no pod; the moon and the limbs.)
  r.landmark('crown', 'landmark', 2200, 1024);
  r.place('in', 1400, 1792);
  r.shotStops([
    ['in', 1600, 1600],
    ['glade', 2100, 1024],
  ]);
  r.route('bower', 'in');
  r.route('in', 'glade-glide');
  r.set('marks', {
    ...(r.data.marks as Json),
    tatter: {
      x: CROWN_SIT.x - 96,
      y: CROWN_SIT.y,
      facing: -1,
      when: CROWN_WINGS,
      until: 'cn-firefly-gap',
      sit: CROWN_SIT,
    },
  });
  const sr = CROWN_SIT.r + 200;
  r.set('camera', {
    ...(r.data.camera as Json),
    zones: [
      ...(((r.data.camera as Json | undefined)?.zones as Json[] | undefined) ?? []),
      {
        id: 'crown-sit',
        x: CROWN_SIT.x - sr,
        y: CROWN_SIT.y - sr - 200,
        w: 2 * sr,
        h: sr + 200 + 64,
        // (r14, review r13 #4: 0.85 was the crown's own zoom: nothing moved. On `kinSit` the view pushes in on the pair
        // over ~2 s, leaning toward the moon's edge (render's camera reads `lean`), and eases out when she walks off.)
        zoom: 1.3,
        frames: 120,
        lean: { x: 1700, y: 860, k: 0.5 },
        after: 'cn-kin-sat',
        until: 'cn-firefly-gap',
      },
    ],
  });
  return r.finish();
}

function attic(): Json {
  const r = new Wood('cn-attic', 'The attic', [200, 1184], 7403, { back: true });
  r.cave(0, 928, 768, 1184, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(512, 320, 2304, 1184, { ceil: 0, w: 64, e: 64, corner: 128 });
  r.fill();
  // A dangler nest: four on threads over the floor she must cross.
  r.dangler('dang-a1', 1000, 320, 1);
  r.dangler('dang-a3', 1600, 320, 1);
  r.burl(1100, 1184, 320, 128, 2);
  r.hollow('breath-hollow', 1680, 1184, 'longBreath');
  r.place('in', 200, 1184);
  r.shotStops([
    ['in', 500, 1184],
    ['nest', 1400, 1184],
  ]);
  r.route('bower', 'in');
  r.route('in', 'breath-hollow');
  // Furniture between the fights (review r5 #3: the exact references' thorns, things to hit and small ledges).
  return r.finish();
}

/** The gap's pod garden: root knuckles over the bramble run's east half (r7). */
/** The far limb's east lip, the third lamp (r9), and the hanging root between them (x, its bottom). */
const GAP_LIP = 2256;
const GAP_WICK3: [number, number] = [2800, 1580];
const GAP_ROOT: [number, number] = [2432, 1560];
const GAP_KNUCKLES: Array<[number, number]> = [
  [2816, 2080],
  [3008, 2016],
  [3200, 2080],
  [3328, 2016],
];

/**
 * The chase's hooks (r13, moment 4): dark until the firefly passes (`after` its own flag), then springboards. Up over the
 * shelf (the perch's hook, a jump off the shelf), then a falling S across the upper air down onto the chain's first
 * lamp, whose up-left fling is the roost's mouth.
 */
const GAP_HOOKS: Array<[string, number, number]> = [
  ['hook-1', 4150, 1080],
  ['hook-2', 4150, 760],
  ['hook-3', 4150, 450],
  ['hook-4', 3780, 470],
  ['hook-5', 3460, 680],
  ['hook-6', 3810, 880],
  // (r14, review r13 #5: off hook-6, pressed the moment the chain's lamp came into reach, the up-left fling met the
  // roost's shelf from below and fell: a seventh hook on hook-6's down-left line, off the shelf's lip, whose left fling goes
  // in under the roost's east side.)
  ['hook-7', 3440, 1160],
];
/** The firefly's line: the perch, its hooks, the chain's first lamp, the roost's mouth (the path's end: the nest). */
const GAP_CHASE: Array<[number, number]> = [
  [4150, 1050],
  [4150, 740],
  [4150, 430],
  [3780, 450],
  [3460, 660],
  [3810, 860],
  [3440, 1140],
  [3210, 1140],
];

function gap(): Json {
  const r = new Wood('cn-gap', 'The gap', [4100, 1344], 7404, {
    art: { anchorY: 1300, moon: { x: 700, y: 260, r: 110 } },
  });
  r.hole(0, 0, 4352, 1088);
  r.cave(GAP_LIP, 1088, 3456, 2240, { ceil: 0, w: 0, e: 64, corner: 0 });
  r.hole(0, 1088, GAP_LIP, 1856);
  r.hole(3456, 1088, 4352, 1344);
  r.hole(128, 1856, 512, 2304);
  r.back(128, 1856, 512, 2304);
  r.fill();
  r.noClaws(GAP_LIP, 1856, 2240);
  // The roost: a hanging root clump on the glide line, wide at the top and ragged below; a shelf inside it, its
  // shaft up to the sky room (she glides in under its east side).
  r.mass(2752, 0, 192, 384);
  r.mass(2816, 384, 128, 384);
  r.mass(2880, 768, 64, 512);
  r.mass(3136, 0, 192, 384);
  r.mass(3136, 384, 128, 384);
  r.mass(3136, 768, 64, 256);
  r.mass(2944, 1216, 192, 64);
  r.claws(2944, 0, 1280, 'east');
  r.claws(3136, 0, 1024, 'west');
  r.add('moonseeds', { id: 'seed-far', x: 1300, y: 1790 });
  // The fall is the cost (r7, review r6 #1): one bramble run over the floor, from the west wall to the drop to the
  // fork at its east end (a step off the shelf's west lip falls straight down it).
  r.thorns('thorn-floor', GAP_LIP, 2240, 3200 - GAP_LIP);
  // The roost pays a pile (r7: three glints, not one).
  r.hoard('roost-', 2990, 1150, 120, 50, 2);
  r.cover('roost-cover', 2752, 0, 576, 1280);
  r.arc('glide-', 2300, 3350, 1480, 80, 2);
  // A fling line (review r6 #4): three lamps down from the shelf's lip over the run's east end: flung west off the
  // first she is in the roost's mouth (the pocket); down the chain, the pod garden over the bramble (pods on
  // knuckles, a line to pogo along). None reaches the far limb, the glide's: every lamp 840+ px east of its lip
  // (west of x 3080 at 1580 a chain carried a clawed player over; proven with the lamps lit).
  // (r8, review r7 #1: v7's second lamp sat 140 px east of a down-left fling's line off the first, never in reach:
  // the chain played as two. The review's spot on that line, ~3,120 x 1,560, opens the glide's lock: from any lamp
  // west of ~3,200 at 1,550-1,700 an up-left fling lands a clawed player on the far limb (the lit proofs). So the
  // first lamp hangs lower, just under the shelf's lip (a walk to the lip finds it), and the second sits on its
  // down-left line, 3,250 x 1,460; down off the second, the third.)
  // (r9, review r8 #7: v8's third lamp hung 80 px over the floor, out of every fling's way off the second: the chain
  // played as two. It sits where the down-left and left flings off the second both pass (the band 2,700-2,880 x
  // 1,500-1,740, tools/levels/fling-probe.ts), so a jump off the shelf (the second lamp first) chains too; straight
  // down off the second lands on a knuckle. From anywhere in that band a left or up-left fling carried a clawed player
  // onto the far limb, and a shorter limb is past the glide (a walk-off glide falls 0.45 px a px: the far limb's lip
  // is all it reaches). So a root hangs from the canopy between them, slick, its foot over the glide's line: the
  // flings off the third lamp meet it and fall to the bramble; the glide passes under it.)
  r.hang(GAP_ROOT[0] - 64, 0, 192, GAP_ROOT[1], 3, 'c');
  r.noClaws(GAP_ROOT[0] - 64, 0, 520);
  r.noClaws(GAP_ROOT[0] + 128, 0, 520);
  r.noClaws(GAP_ROOT[0] - 32, 520, 1040);
  r.noClaws(GAP_ROOT[0] + 96, 520, 1040);
  r.noClaws(GAP_ROOT[0], 1040, GAP_ROOT[1]);
  r.noClaws(GAP_ROOT[0] + 64, 1040, GAP_ROOT[1]);
  r.lamp('wick-gap-1', 3400, 1420);
  r.lamp('wick-gap-2', 3250, 1460);
  r.lamp('wick-gap-3', GAP_WICK3[0], GAP_WICK3[1]);
  // The firefly's flight (r13, moment 4: the chase; it replaces r10-r11's pass). Once she has the glide, the firefly is
  // perched in the upper air over the shelf, hanging a light (`hook-1`), its back to her. She lands on the shelf: the
  // alarm, and it bolts: up, then a falling S across the upper air, and every dark hook it passes catches fire
  // (`fireflyKindle`; springboards from then on); down onto the chain's first lamp and into the roost's mouth. It keeps
  // 450-600 px of path ahead of her, never back, never escaping; fallen behind (the glide's low line, a fall), it
  // waits at its next stop flashing. In the nest it waits at the shaft's top for her, calls once up at the sky, and
  // is gone up the shaft. The flag keeps r10's name (the route plan reads it).
  for (const [id, x, y] of GAP_HOOKS)
    r.lamp(id, x, y, { after: `cn-gap-${id}`, relight: SPRING_RELIGHT, moths: 0, hook: true });
  r.set('fireflies', [
    {
      id: 'firefly-gap',
      flag: 'cn-firefly-gap',
      trigger: { x: 3456, y: 1088, w: 704, h: 256 },
      path: GAP_CHASE,
      frames: 360,
      relights: ['wick-gap-1'],
      chase: {
        lead: [450, 600],
        kindles: GAP_HOOKS.map((h) => h[0]),
        // (r14, review r13 #5: it waits for her at every hook, and at the chain's lamp until she has flung off it.)
        waits: [1, 2, 3, 4, 5, 6],
        end: [3040, 120],
        needs: G,
        // (r15, review r14 #5: two breaths in the rush: at the top of the climb and at the S's turn she hangs at the
        // hook until she presses, the firefly flashing on ahead; every hook eases her flight as she reaches it.)
        rests: ['hook-3', 'hook-5'],
      },
      look: { x: 3900, y: 880, zoom: 0.85, from: 0, to: 90 },
    },
  ]);
  // (The chase's frame: the upper air over the shelf, zoomed out while it is on.)
  r.set('camera', {
    ...(r.data.camera as Json),
    zones: [
      ...(((r.data.camera as Json | undefined)?.zones as Json[] | undefined) ?? []),
      {
        id: 'chase',
        x: 3328,
        y: 0,
        w: 1024,
        h: 1344,
        zoom: 0.8,
        bounds: { x: 2752, y: 0, w: 1600, h: 1600 },
        after: 'cn-firefly-gap',
        until: 'cn-firefly-gap-done',
      },
    ],
  });
  r.place('shelf', 4000, 1344);
  r.place('far', 1200, 1856);
  r.place('floor', 2944, 2048);
  r.place('roost', 3040, 1216);
  r.shotStops([
    ['shelf', 3900, 1344],
    ['gap', 2700, 1500],
    ['far', 1300, 1856],
    ['floor', 2800, 2240],
  ]);
  r.route('bower', 'shelf');
  r.route('shelf', 'far', { needs: [G], oneWay: true });
  r.route('far', 'seed-far');
  r.route('far', 'hub', { oneWay: true });
  r.route('shelf', 'floor', { oneWay: true });
  r.route('floor', 'shelf', { needs: [C], oneWay: true });
  r.route('floor', 'fork', { oneWay: true });
  r.route('shelf', 'sky', { needs: [C] });
  // The pod garden (review r6 #1: pods in clusters, not one a hall). (Knuckles on the east of the floor only, low: from
  // one near the west wall a jump reached the far limb, no wings; a pod is a step too, 44 px over its knuckle.)
  for (const [x, y] of GAP_KNUCKLES) {
    r.oneWay(x, y, 128, 'branch');
    r.pod(`pod-garden-${x}`, x + 64, y, 1200, 'sit');
  }
  // (No pods hung under the roost: pogoed off them, a clawed player without wings crossed to the far limb.)
  return r.finish();
}

function sky(): Json {
  const r = new Wood('cn-sky', 'Over the gap', [1248, 960], 7405, { back: true });
  r.hole(1152, 960, 1344, 1440);
  r.cave(256, 320, 2304, 960, { ceil: 128, w: 64, e: 64, corner: 128 });
  r.fill();
  // A hawker roost: two on the lamp's rhythm over the floor.
  r.lamp('wick-sky', 1700, 640);
  r.flyer('hawker', 'hawk-sky1', 1700, 480, -1, { orbit: 'wick-sky', period: 200, radius: 300 });
  // (r7, review r6 #7: night eyes is the roost's find; its great and glints are gone.)
  r.hollow('eyes-hollow', 2050, 960, 'nightEyes');
  r.place('in', 1248, 960);
  r.shotStops([
    ['in', 1248, 960],
    ['roost', 1700, 960],
  ]);
  r.route('gap', 'in');
  r.route('in', 'eyes-hollow');
  return r.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// Deep. The root tunnel under the seed door: the drop between root curtains (the claws' way back up), a burrback
// pair over the burrow panel west, then east a hump and a thorn pit only the glide crosses (glide owners are the
// only ones who reach the door); at the east end the den's mouth low and, up a claw block, the shortcut into the
// cellar (it opens from this side). The den: a save balcony over a closed arena sized for 21:9 (escape ledges 192 px
// up, the taproot by the gate), the old burrback, its gate. The way on: a root chimney up to a cliff over the
// valley, the next area's door on a ledge across it (a glide), the ledge hoard behind a rotten wall down a shaft.

/** The tunnel's (and the burrow's) old content sits this far east in the rooms grown west under the hub (r7). */
const TX = 3520;
/** The tunnel's west hall's bramble run (x0, x1, room-local; review r6 #1: the area's longest composed run). */
const TUNNEL_RUN: [number, number] = [1056, 3072];
/**
 * The pit's west and east ends (r9: 1,024 -> 768 long, the den's warning floor wider; r9b: 960, its west end the
 * hump's plumb east face, the take-off 384 over the far floor) and the glide line's lamp.
 */
// (r10, review r9 #6: the hump and the pit moved 128 west, so the warning's floor is 1,024 flat to the den's mouth.)
const PIT_W = 2432 + 3520;
const PIT_E = 3392 + 3520;
const PIT_WICK: [number, number] = [3352 + 3520, 1560];
/** The pit's hawker's home (r9b: under the roof, over the pit's east half). */
const PIT_HAWK: [number, number] = [6672, 1170];
/** The hump's west foot and its top (r9b: the take-off, 384 over the warning's floor). */
const HUMP: [number, number] = [2144 + 3520, 1472];
/** The den's mouth (r10): an arch in the tunnel's east wall at the warning's floor, its lid a root gate in it. */
const MOUTH_X = 7808;
const LID_X = 7936;
/** The den's warning's floor. */
const WARN_FLOOR = 1856;
/**
 * The warning's cage (r11): hung by the firefly once the warning is cleared, over the root knuckle before the den's
 * mouth (cut standing on it, 1,632). (First hung over the lintel at 7,872: 128 px from the room's edge, the sighting
 * fell in the frame's corner: render's note.)
 */
const WARN_CAGE: [number, number] = [7552, 1420];
/** The knuckles over it (x, top). */
const TUNNEL_KNUCKLES: Array<[number, number]> = [
  [1408, 1664],
  [1664, 1504],
  [1920, 1632],
  [2176, 1504],
  [2432, 1664],
  // (r8: the run grew east to 3,072: a knuckle near its east end, a jump off the floor's lip.)
  [2752, 1696],
];

function tunnel(): Json {
  const r = new Wood('cn-tunnel', 'The root tunnel', [1920 + TX, 1856], 7501, {
    back: true,
    mood: 'deep',
    mass: 'ground',
  });
  r.hole(1792 + TX, 0, 2048 + TX, 1280);
  r.cave(256 + TX, 1280, 2304 + TX, 1856, {
    ceil: 128,
    w: 0,
    e: 0,
    corner: 64,
    skip: [[1472 + TX, 2368 + TX]],
  });
  r.cave(2304 + TX, 1088, 3712 + TX, 1856, { ceil: 96, w: 0, e: 0, corner: 0 });
  r.hole(PIT_W, 1856, PIT_E, 2048);
  // (r9: the pit 768, not 1,024. A glide from the jump's apex (let go, press again) meets the pit's east face ~60 px
  // under the lip and a kick puts her on the floor; a running jump, or a jump held through (the carried glide opens 16
  // px under the hump's top, already falling fast), drops into the pit ~200 short. A lower floor (1,984) let the apex
  // glide land clean but opened the pit to a jump and a kick: the solver's lock leaked.)
  r.cave(3712 + TX, 1088, 4480 + TX, 1856, { ceil: 96, w: 0, e: 0, corner: 0 });
  // (r10, review r9 #6: the den's mouth is an arch in the east wall at the floor, not a drop at its edge; its lid a
  // root gate standing in it until the warning is cleared.)
  r.gate('den-lid', LID_X, 1600, 8000 - LID_X, 256, 'cn-tunnel-clear');
  r.bark('burrow-panel', 768 + TX, 1856, 192, 64, true);
  r.hole(768 + TX, 1920, 960 + TX, 2176);
  // A covered tube in the roof over the pit (review r5 #10: a hidden route, Nine Sols' vents): the way back west for
  // a clawed player, in from a shaft over the east block, out by a drop onto the hump (its faces refuse the claws:
  // the glide still owns the way east).
  r.hole(PIT_W - 128, 768, 4288 + TX, 896);
  r.hole(PIT_W - 128, 896, PIT_W, 1088);
  r.hole(4160 + TX, 896, 4288 + TX, 1088);
  // The west hall (r7, review r6 #1 / #10: the room grown west under the hub's west half, the notch closed): past the
  // burrbacks the floor runs on west into a long low hall, the bramble run (1,664) in a shallow pit across it under
  // three root knuckles and the pods' garden, and at its west end a pile of glints in the open (a dead end pays).
  r.cave(512, 1216, 256 + TX, 1856, { ceil: 96, w: 0, e: 0, corner: 64 });
  r.hole(TUNNEL_RUN[0], 1856, TUNNEL_RUN[1], 1920);
  r.hole(576, 1856, 768, 2176);
  r.fill();
  // Root curtains either side of the door's shaft, down to 224 over the floor (plumb on the shaft's side).
  r.hang(1536 + TX, 1280, 256, 352, 3, 'r');
  // (r10: narrower and shorter: the hump moved under its old east half, and a jump onto its first tier from under the
  // curtain bumped it. The shaft's west curtain still reaches the floor's jump: one face is enough to climb.)
  r.hang(2048 + TX, 1280, 96, 224, 2, 'l');
  // The hump, the pit (thorns all along its floor), the block under the shortcut.
  // (r9b: the hump steps up from the west to a take-off 384 over the far floor, its east face plumb at the pit's lip:
  // the highest ground is where she jumps. Over the old 256 drop a jump held through landed 25 px past the lip. Now a
  // glide from the lip, held through, from the apex or a walk-off, lands well clear, and a jump still falls short of
  // the far face.)
  r.mass(HUMP[0], 1856 - 192, PIT_W - HUMP[0], 192);
  r.mass(HUMP[0] + 96, HUMP[1], PIT_W - HUMP[0] - 96, 1856 - 192 - HUMP[1]);
  // The mouth's lintel (r10): the ledge under the cellar's shortcut, over the arch.
  r.mass(MOUTH_X, 1408, 8000 - MOUTH_X, 192);
  r.noClaws(PIT_W - 128, 768, 1088);
  r.noClaws(PIT_W, 896, 1088);
  // (r9b: the pit's far face is slick: a jump that falls short slides into the thorns, no kick up it.)
  r.noClaws(PIT_E, 1856, 2048);
  r.noClaws(2304 + TX, 1088, 1280);
  r.shortcut('sc-cellar', 4416 + TX, 1152, 64, 256, 'w');
  r.thorns('thorn-pit', PIT_W, 2048, PIT_E - PIT_W);
  r.thorns('thorn-run', TUNNEL_RUN[0], 1920, TUNNEL_RUN[1] - TUNNEL_RUN[0]);
  r.burrback('burr-tu-1', 1100 + TX, 1856, 1, 220, { fenced: true });
  r.burrback('burr-tu-2', 1450 + TX, 1856, -1, 160, { fenced: true });
  // An ant trail across the floor into the burrow's crack (review r3 #7: the cellar branch's ants foreshadowed).
  r.ants('ant-tu', 1700 + TX, 900 + TX, 1856, 2);
  r.hoard('burrow-', 860 + TX, 2020, 100, 60, 2);
  r.cover('burrow-cover', 704 + TX, 1920, 320, 256, 'burrow-panel');
  r.cover('tube-cover', PIT_W - 192, 704, 4288 + TX + 64 - (PIT_W - 192), 448);
  r.hoard('tube-', 3200 + TX, 840, 400, 40, 2);
  r.landmark('tracks', 'tracks', 3000 + TX, 1856);
  // Over the run: three knuckles (low and slow), each with a pod, and two more pods hung from the roof's roots (the
  // garden: pogo along it, high and fast); the pile at the west end.
  for (const [x, y] of TUNNEL_KNUCKLES) {
    r.oneWay(x, y, 128, 'branch');
    r.pod(`pod-run-${x}`, x + 64, y, 1200, 'sit');
  }
  r.hang(1600, 1120, 192, 192, 2, 'c');
  r.hang(2304, 1120, 192, 192, 2, 'c');
  r.pod('pod-root-1', 1696, 1312, 1200, 'hang');
  r.pod('pod-root-2', 2400, 1312, 1200, 'hang');
  r.hoard('pile-', 640, 1760, 320, 80, 3);
  // The second peak (r8, review r7 #7: the Grove was the only one; HK's path has several): the west hall is the
  // tunnel's loud room. Two higher knuckles stagger the garden (low and high lines), an arc of glints over the run
  // that the pogo line and the knuckles' hops reach, the carriers' trail out of the hall's crack at the run's east
  // end, a juvenile keeping the pile, a hawker over the pit. Taken from the middle (the bower, the Spire's foot, the
  // limbs, the branch rooms), not added on top.
  r.ants('ant-hall', 3700, 3150, 1856, 3);
  r.juvenile('juv-pile', 1000, 1856, -1, 120, { fenced: true });
  // The glide is contested (r9, review r8 #4: the hawker held its orbit through the glide and never struck: with no
  // lamp in the pit she crossed it dark, unseen). A lamp on the glide's line, out of a jump's reach from the hump's lip
  // (a jump off it falls past 280 px under the flame), lights her as she glides by, and the hawker orbits it: its
  // strike comes mid-glide, told, with room to cut it or drop under it. Flung off it she only lands on the floor
  // sooner. Three glints on the line (v8: eight), the glide the prize.
  // r9b: it hunts her, not the flame (on its orbit's clock the strike came whenever the clock said, and what she saw
  // of it was a 6-frame pull-back). It hangs under the roof over the pit's east half, out of every glide's line,
  // sees her from a third of the way across (never on the hump: the lip is 640 off), tells for 30 frames and strikes
  // where her glide will be. A check back, a drop and a fresh glide, a cut or a fling off its lamp answers it (the
  // lamp out, it leaves); a blow throws her on along her glide (`glideKnockVx`): a light, not the crossing.
  r.lamp('wick-pit', PIT_WICK[0], PIT_WICK[1]);
  r.flyer('hawker', 'hawk-pit', PIT_HAWK[0], PIT_HAWK[1], -1, {
    guards: 'wick-pit',
    radius: 80,
    sight: 520,
  });
  r.arc('pit-arc-', 2816 + TX, 3328 + TX, 1560, 100, 3);
  // The den's warning (r8, review r7 #7): a gated wave on the east floor where the glide lands. A root lid lies over
  // the drop to the den's mouth until it is cleared.
  // r9 (review r8 #4 / #8: a scuffle on a 384 px knuckle with no frame): the second set piece. The pit is 768 (v8:
  // 1,024; a running jump off the hump still falls 160 short), so the floor is 640 to the lid, 832 with it; landing
  // on it fires the trigger and the view fits the arena (the pit's east half to the lid) until it is cleared. Two
  // beats: the lampwings down from the roof first (from over the pit and down the tube's east shaft), then, both
  // down, a juvenile pair and a burrback up out of the den's mouth under the lid (or down the shaft if she stands by
  // it). Two lamps hang a jump over the floor (a fling is a dodge, a throw-cut). The lid opens when the last falls.
  // r10 (review r9 #6: a scuffle on a bench, the mouth a smear under the frame): the floor is 1,024 flat from the pit's
  // far lip to the lid, no knuckle in it, the den's mouth an arch in the east wall at the floor (the link to the den
  // moved up to it), the frame a set zoom 1.0 over the floor and the mouth. A lamp over each end of the floor: the
  // springboard by the pit's lip, the trap (r10, review r9 #2) by the mouth.
  const warn = { wakes: 'cn-tunnel-wave', sets: 'cn-tunnel-beat2' };
  const warn2 = { wakes: 'cn-tunnel-beat2', sets: 'cn-tunnel-clear' };
  r.add('triggers', {
    id: 'den-warn',
    x: PIT_E,
    y: WARN_FLOOR - 256,
    w: LID_X - PIT_E,
    h: 256,
    sets: 'cn-tunnel-wave',
    rearm: true,
  });
  r.flyer('lampwing', 'wing-warn-1', PIT_E + 260, 1560, 1, {
    radius: 140,
    sight: 360,
    ...warn,
    arrive: [[PIT_E - 300, 1300]],
  });
  r.flyer('lampwing', 'wing-warn-2', LID_X - 220, 1520, -1, {
    radius: 120,
    sight: 360,
    ...warn,
    arrive: [[7744, 1120]],
  });
  // (Beat 2 comes out of the den's mouth, behind the lid.)
  const mouth: Array<[number, number]> = [[7980, WARN_FLOOR]];
  r.juvenile('juv-warn', PIT_E + 300, WARN_FLOOR, 1, 240, { fenced: true, ...warn2, arrive: mouth });
  r.juvenile('juv-warn-2', LID_X - 340, WARN_FLOOR, -1, 200, { fenced: true, ...warn2, arrive: mouth });
  r.burrback('burr-warn', PIT_E + 520, WARN_FLOOR, -1, 300, { fenced: true, ...warn2, arrive: mouth });
  // Root knuckles at the floor's two ends only (its middle flat: a step out of a ram's line by the pit's lip, a perch
  // under the lampwings by the mouth), and a pod on the floor between them (out of the lampwings' ground).
  r.oneWay(PIT_E + 192, WARN_FLOOR - 192, 128, 'branch');
  r.pod('pod-warn', 7300, WARN_FLOOR, 1200, 'sit');
  r.oneWay(LID_X - 448, WARN_FLOOR - 224, 128, 'branch');
  r.lamp('wick-warn-1', PIT_E + 140, WARN_FLOOR - 220);
  // (r11, review r10 #3 / #4: v10's cage hung over the fight's floor, in the up-cut line at a lampwing: the reviewer
  // freed it by accident and never saw it. Now the firefly hangs it once the warning is cleared (the second
  // sighting), over the knuckle before the den's mouth: cut standing on the knuckle, and not there while the fight is
  // on.)
  // (r13, moment 5: hung empty, it fills in front of her from a passing stream over 3 s; can't be cut until it's full;
  // full, the den answers: `denStir`.)
  r.lamp(WARN_TRAP, WARN_CAGE[0], WARN_CAGE[1], {
    trap: true,
    moths: 40,
    after: 'cn-warn-hung',
    fills: { frames: 180 },
  });
  // (The stream it catches, render's: a thin far stream in the tunnel's high air since she came onto the floor.)
  r.set('marks', {
    ...(r.data.marks as Json),
    stage: {
      ...(((r.data.marks as Json).stage as Json | undefined) ?? {}),
      stream: {
        // (Under the tunnel's roof: at first it ran inside the rock, at the top edge of the frame; 330 px lower.)
        points: [
          [6720, 1090],
          [7140, 1230],
          [7560, 1310],
          [8000, 1230],
        ],
        count: 40,
        captured: WARN_TRAP,
      },
    },
  });
  // The firefly's second sighting (r11, review r10 #4: "the cause is shown"): the step beat 2 is down (the lid opens),
  // it comes down out of the tube's east shaft, hangs the cage before the mouth (it lights: `cn-warn-hung`) and holds
  // there a beat, then flees down through the mouth into the den, ahead of her. Her input is held while it comes and
  // hangs the cage (1.5 s); render frames it with her (`look`).
  r.set('fireflies', [
    {
      id: 'firefly-warn',
      onFlag: 'cn-tunnel-clear',
      flag: 'cn-firefly-warn',
      path: [
        [7744, 980],
        [7660, 1200],
        [WARN_CAGE[0], WARN_CAGE[1] - 24],
        [7720, 1620],
        [7900, 1740],
        [7992, 1760],
      ],
      frames: 140,
      hang: { point: 2, frames: 75, sets: 'cn-warn-hung' },
      hold: 90,
      look: { x: 7600, y: 1500, zoom: 1, from: 0, to: 150 },
    },
  ]);
  // A re-form point on the floor (r10, review r9 #3: faded in the warning she came back west of the pit, behind the
  // glide and the hawker): a mark patch at the pit's far lip, marked anywhere on the floor (`area`), never a rest.
  r.patch('p-warn', PIT_E + 128, WARN_FLOOR, {
    mark: true,
    area: { x: PIT_E, y: WARN_FLOOR - 256, w: LID_X - PIT_E, h: 256 },
  });
  // The boss foreshadowed (r10, review r9 #7): shed shells the size of the old burrback's back on the tunnel's floor,
  // claw scrapes four times a burrback's on the hump's face and by the mouth (render draws `shell` / `scrape`). Beat 2
  // starting (`flagSet cn-tunnel-beat2`) is felt: a deep slam from the den (render / audio, 0.3 trauma).
  r.landmark('shell-land', 'shell', 1700 + TX, 1856);
  r.landmark('scrape-hump', 'scrape', HUMP[0] + 140, 1664);
  r.landmark('shell-warn', 'shell', PIT_E + 760, WARN_FLOOR);
  r.landmark('scrape-mouth', 'scrape', MOUTH_X - 24, 1700);
  r.set('camera', {
    ...(r.data.camera as Json),
    zones: [
      {
        id: 'warning',
        x: PIT_E,
        y: 1088,
        w: 8000 - PIT_E,
        h: WARN_FLOOR - 1088,
        // (r9b: a set zoom centred on a small frame in the room's south-east corner: the view asks for more than the
        // room's foot and east edge, and the room's soft edges (the zones' 220 px knee) stop it ~20 px short of both.
        // r10, review r9 #6: zoom 1.1 (0.85 made the fight small; render asked closer than 1.0), the mouth an arch at
        // the floor's east end now: the floor and the mouth fill the frame, the pit's far lip on its left.)
        zoom: 1.1,
        bounds: { x: 8000 - 640, y: 2176 - 640, w: 640, h: 640 },
        until: 'cn-tunnel-clear',
      },
    ],
  });
  // The nest's shaft (r8, review r7 #7: the burrow a place, the hall's lower floor): a hole in the hall's floor west
  // of the run drops into the carriers' nest; the claws climb it back.
  r.place('nest-mouth', 672, 1856);
  r.place('land', 1920 + TX, 1856);
  r.place('floor', 1000 + TX, 1856);
  r.place('hump', PIT_W - 96, HUMP[1]);
  r.place('east', PIT_E + 512, WARN_FLOOR);
  r.place('mouth', 7900, WARN_FLOOR);
  r.place('ledge', 7904, 1408);
  r.place('cage', WARN_CAGE[0], WARN_FLOOR - 224);
  r.place('tube', 3200 + TX, 896);
  r.place('pile', 800, 1856);
  r.shotStops([
    ['land', 1920 + TX, 1856],
    ['pair', 1200 + TX, 1856],
    ['run', 2000, 1700],
    ['pile', 900, 1856],
    ['pit', 3100 + TX, 1700],
    ['east', PIT_E + 512, WARN_FLOOR],
    ['mouth', 7700, WARN_FLOOR],
  ]);
  r.route('hub', 'land', { oneWay: true });
  r.route('land', 'hub', { needs: [C], oneWay: true });
  r.route('land', 'floor');
  r.route('floor', 'burrow');
  r.route('floor', 'pile');
  r.route('pile', 'nest', { oneWay: true });
  r.route('nest', 'pile', { needs: [C], oneWay: true });
  r.route('land', 'hump');
  r.route('hump', 'east', { needs: [G], oneWay: true });
  r.route('east', 'mouth');
  r.route('mouth', 'east');
  r.route('mouth', 'den');
  r.route('east', 'ledge', { needs: [C] });
  r.route('ledge', 'cellar', { door: 'sc-cellar' });
  r.route('ledge', 'tube', { needs: [C] });
  r.route('tube', 'hump', { oneWay: true });
  // Furniture between the fights (review r5 #3: the exact references' thorns, things to hit and small ledges).
  r.oneWay(640 + TX, 1664, 128, 'branch');
  r.oneWay(1024 + TX, 1600, 160, 'branch');
  r.pod('pod-low', 7680, WARN_FLOOR, 1200, 'sit');
  return r.finish();
}

function burrow(): Json {
  // (r7, review r6 #1 / #10: grown west with the tunnel under the hub's west half (`TX`). r8, review r7 #7: its west
  // was solid mass, a closed hole: now the carriers' nest, the tunnel peak's lower floor. A long low gallery from the
  // shaft under the hall's west end (a drop in) east to the old cave, the carriers' trails on its floor into their
  // cracks, a juvenile pair, pods on root knuckles, and the deep's map at the far end: a loop, down the nest's shaft,
  // east, up the burl to the tunnel's floor (the claws).)
  const r = new Wood('cn-burrow', 'The burrow', [860 + TX, 1216], 7502, {
    back: true,
    mood: 'deep',
    mass: 'ground',
  });
  r.hole(768 + TX, 0, 960 + TX, 512);
  r.hole(576, 0, 768, 640);
  r.cave(384, 576, 256 + TX, 1216, { ceil: 96, w: 64, e: 0, corner: 64 });
  r.cave(256 + TX, 448, 2944 + TX, 1216, {
    ceil: 128,
    w: 64,
    e: 64,
    corner: 128,
    skip: [[704 + TX, 1024 + TX]],
  });
  r.fill();
  // A burl under the shaft: the claws' way back up (no lamp here: her own light only).
  r.burl(704 + TX, 1216, 320, 576, 3);
  r.burl(1792 + TX, 1216, 512, 256, 2);
  r.stone('stone-deep', 2600 + TX, 1216, 'cn-deep');
  // The nest.
  r.ants('ant-nest-a', 1100, 2300, 1216, 3);
  r.ants('ant-nest-b', 3300, 2500, 1216, 2);
  r.juvenile('juv-nest-1', 1700, 1216, 1, 160, { fenced: true });
  r.juvenile('juv-nest-2', 2900, 1216, -1, 160, { fenced: true });
  // (Pods hung from the nest's roof, not on knuckles: the wood's floor-mounted ledge families are spent, render's
  // `families.ts`, no family in more than three rooms.)
  r.hang(1344, 576, 192, 160, 2, 'c');
  r.hang(2560, 576, 192, 160, 2, 'c');
  r.pod('pod-nest-1', 1440, 736, 1200, 'hang');
  r.pod('pod-nest-2', 2656, 736, 1200, 'hang');
  r.place('nest', 900, 1216);
  r.place('in', 860 + TX, 1216);
  r.shotStops([
    ['in', 900 + TX, 1216],
    ['nest', 1800, 1216],
    ['stone', 2400 + TX, 1216],
  ]);
  r.route('hall', 'nest', { oneWay: true });
  r.route('nest', 'hall', { needs: [C], oneWay: true });
  r.route('nest', 'in');
  r.route('in', 'nest');
  r.route('tunnel', 'in');
  r.route('in', 'tunnel', { needs: [C] });
  r.route('in', 'stone-deep');
  return r.finish();
}

/** The den's balcony floor (r10: the tunnel's warning floor, world 5,952, through the mouth). */
const DEN_IN = 320;
/** The great cage (r11, review r10 #1): over the arena's middle, between the two shelves, cut from a jump off either. */
const DEN_CAGE: [number, number] = [1856, 760];
/** The arena's east wall (r11: the roof's way out was over it; r15: the breach at its foot). */
const ROOF_X: [number, number] = [3072, 3264];
/** The breach (r15): the collapse tears the arena's east wall open at the floor, a root corridor east to the way out. */
const DEN_BREACH: [number, number, number] = [3264, 3392, 1088];
/** The ending's collapse (r12): the Keeper's flag once the roof gives; the rubble shuts, the taproot falls. */
const DEN_COLLAPSE = 'cn-den-collapse';
/**
 * The full escape (r14, moment 7; review r13 #9: the rubble's clean staircase replaced). When the roof gives, the
 * taproot comes down with the den's east end: a heap of earth and root piled against the east wall to 704
 * (`rubble-heap`, no claws on its face), so the floor no longer reaches the way out. Roots torn from the roof hang as
 * perches (`rubble-1..6`, [x0, x1, top]): up the west side off the shelf, then east under the falling roof to the
 * heap's top, and up through the roof's gate. Rocks fall on her line as she comes (grit first), and the den fills with
 * earth under her as she climbs (src/sim/escape.ts).
 */
// (r14, first-timer ft14den: 160-192 px perches with 192-224 px gaps under a roof 256 over them (a full jump bonks it
// and falls short) cost ~8 falls: 256 wide, 128 apart, 300+ under the roof.)
// (r15, review r14 #1: the escape runs east along the floor and out through the breach now; the two west perches stay,
// the caved den's way back up to the balcony, and a mound of fallen roof lies on the floor run.)
const DEN_PERCHES: Array<[number, number, number]> = [
  [832, 1088, 896],
  [1216, 1472, 768],
];
/** The fallen roof's mound on the floor run (r15): [x0, x1, top]. */
const DEN_MOUND: [number, number, number] = [2496, 2624, 1248];
/** The escape's flag (saved at the passage's end: over for good). */
const DEN_ESCAPED = 'cn-den-escaped';

function den(): Json {
  const r = new Wood('cn-den', 'The burrow under the roots', [300, DEN_IN], 7503, {
    back: true,
    mood: 'deep',
    mass: 'ground',
  });
  // (r10: in at the tunnel's warning floor through the den's mouth: the balcony 192 higher than v9's.)
  r.cave(0, DEN_IN - 256, 640, DEN_IN, { ceil: 0, w: 0, e: 0, corner: 0 });
  // The arena: 2688 wide (a 21:9 view sees wall to wall), 896 tall, its roof bitten.
  r.cave(576, 448, 3264, 1344, { ceil: 96, w: 0, e: 0, corner: 128, skip: [[2816, 3264]] });
  // The balcony's lip into the arena (the bitten corner sealed it off in v3: a softlock found on video).
  r.hole(576, DEN_IN - 256, 832, 512);
  // The way out (r11, review r10 #1: the area ends on its premise): the great cage's root gate in the arena's roof
  // over its east end, shut until the cage is freed (`cn-den-freed`, the cage's `sets`); over it a shaft and a passage
  // east under the den's roof to the clifftop of the way out, the valley vista its first stop (v10: a root gate in
  // the east wall on the old burrback's death, to the foot of the way out's chimney). The arena's east wall runs
  // floor to roof, a claw face up to the gate.
  // (r15, review r14 #1: the roof's gate, its shaft and the passage are gone: the way out is the breach at the east
  // wall's foot (`den-breach`, torn open by the collapse) and a root corridor east to the way out's pocket.)
  r.hole(DEN_BREACH[1], DEN_BREACH[2], 3840, 1344);
  r.gate(
    'den-breach',
    DEN_BREACH[0],
    DEN_BREACH[2],
    DEN_BREACH[1] - DEN_BREACH[0],
    1344 - DEN_BREACH[2],
    DEN_COLLAPSE,
  );
  // (The bitten corner under the old gate is cut back, so the east wall is plumb from the breach to the roof.)
  r.air(ROOF_X[0], 448, ROOF_X[1], 640);
  // (r9, review r8 #2: the mass more than 256 px from the air is sealed air with the back behind it.)
  r.sealDeep();
  r.fill();
  // The sleeping reveal (review r4 #5): the balcony steps down 192 onto a root shoulder over the arena, where the old
  // burrback is seen asleep before she commits; a root ledge halfway down. Every face refuses the claws: down in the
  // arena, the fight is the way on.
  r.mass(576, 704, 256, 640);
  r.oneWay(832, 1024, 256, 'branch');
  r.noClaws(576, 512, 704);
  r.noClaws(832, 704, 1344);
  // Escape shelves 256 px over the floor, 384 wide (review r4 #8), 224 clear underneath: the old burrback's ram pulls
  // up under any roof lower than 200 (v4's at 160 made phase 3 unwinnable mid-arena), and the taproot by the gate.
  // (No claw face under them: a face to the floor would wall the arena; the shelves' own faces take the claws.)
  // (r8, the coordinator's v7 video: under the solid west shelf the old burrback sat in `recover` for 90 s and never
  // slammed her off it, and on the floor under it its ram stopped at the shelf's underside: a free safe spot. The
  // shelves are root one-ways now: no roof for its ram to stop under, a drop through them to escape, and standing on
  // one still counts as camping for its slam.)
  r.oneWay(1152, 1088, 384, 'branch');
  r.oneWay(2176, 1088, 384, 'branch');
  // The taproot (the cage's root, phase 3's wall): a gate since r12, so the ending's collapse can bring it down
  // (`cn-den-collapse`): standing until then, as the mass it was.
  // (In the arena's air already: added as is, no carve after the fill.)
  r.add('gates', { id: 'taproot', x: 2944, y: 448, w: 96, h: 808, flag: DEN_COLLAPSE, kick: false });
  // The escape's rubble (r14, moment 7): solid from the collapse (`shut`), never before (the fight's den is as it was).
  r.add('gates', {
    id: 'rubble-mound',
    x: DEN_MOUND[0],
    y: DEN_MOUND[2],
    w: DEN_MOUND[1] - DEN_MOUND[0],
    h: 1344 - DEN_MOUND[2],
    flag: 'cn-den-rubble-gone',
    shut: DEN_COLLAPSE,
    kick: false,
  });
  for (const [i, [x0, x1, top]] of DEN_PERCHES.entries())
    r.add('gates', {
      id: `rubble-${i + 1}`,
      x: x0,
      y: top,
      w: x1 - x0,
      h: 48,
      flag: 'cn-den-rubble-gone',
      shut: DEN_COLLAPSE,
      kick: false,
    });
  // (r15: the arena's east wall over the breach refuses the claws: no way up it to a roof that has fallen in.)
  r.noClaws(ROOF_X[1], 448, DEN_BREACH[2]);
  // A lamp over the taproot: its third phase plants it there and the lamp goes out (`snuffs`): the den darkens.
  r.lamp('wick-taproot', 2860, 640);
  // The great cage (r11, review r10 #1: "the first boss should be the first big lamp"): 120 moths in a cage three
  // times a trap's size, hung from the roof over the arena's middle, the old burrback asleep under it, its keeper.
  // While it lives the blade glances off the bars (`guard`); down, three cuts from a jump off a shelf free the area's
  // biggest cloud, she stands a beat while it bursts out (`hold`), and the roof's gate opens over the arena's east end
  // (`sets`): moonlight down the shaft, the way out.
  r.lamp('trap-den', DEN_CAGE[0], DEN_CAGE[1], {
    trap: true,
    moths: 120,
    guard: 'cn-den-down',
    sets: 'cn-den-freed',
    hold: 90,
  });
  r.patch('p-den', 300, DEN_IN);
  r.lamp('wick-den', 380, DEN_IN - 132);
  r.enemy({
    id: 'old-burr',
    kind: 'oldBurrback',
    x: 1700,
    y: 1344,
    facing: -1,
    radius: 1300,
    // (r12, the Keeper: 10 cuts, P2 at 7, P3 at 4. r13, review r12 #1: 16, P2 at 10, P3 at 5: tuning.keeper.)
    hp: 16,
    sets: 'cn-den-down',
    taproot: [2944, 3040],
    snuffs: 'wick-taproot',
  });
  // The Keeper (r12, canopy-moments.md moment 6): the old burrback on the boss framework, eating from the great cage
  // (src/sim/boss/keeper.ts). No doors (the balcony is a drop); the lock is her whole box on the arena's floor. The
  // cage falls in P3 to `lowered` (its flame's point, on the floor between the shelves). Its name is never shown.
  r.set('boss', {
    id: 'the-keeper',
    kind: 'keeper',
    name: 'The Keeper',
    arena: { x: 832, y: 1024, w: 3264 - 832, h: 1344 - 1024 },
    lock: [],
    flag: 'cn-den-down',
    met: 'cn-den-met',
    creature: 'old-burr',
    heart: 'trap-den',
    rings: [],
    retryOut: [],
    floor: 1344,
    lowered: { x: DEN_CAGE[0], y: 1344 - 72 },
    collapse: DEN_COLLAPSE,
    fed: 'cn-den-fed',
  });
  // The firefly's third sighting (r11, review r10 #4: it fled into the den from the warning): as she lands on the
  // balcony the first time it is over the arena, circles the great cage it hung (the old burrback asleep under it),
  // and goes up through the roof's gate where the way out will be. No control taken.
  r.set('fireflies', [
    {
      id: 'firefly-den',
      trigger: { x: 0, y: DEN_IN - 256, w: 640, h: 256 },
      flag: 'cn-firefly-den',
      path: [
        [700, 420],
        [1300, 560],
        [DEN_CAGE[0] - 120, DEN_CAGE[1] - 40],
        [DEN_CAGE[0], DEN_CAGE[1] - 120],
        [DEN_CAGE[0] + 120, DEN_CAGE[1] - 40],
        [DEN_CAGE[0] + 100, DEN_CAGE[1] + 90],
        [DEN_CAGE[0] - 100, DEN_CAGE[1] + 90],
        [DEN_CAGE[0] - 120, DEN_CAGE[1] - 40],
        [DEN_CAGE[0], DEN_CAGE[1] - 120],
        [2600, 900],
        [3100, 1180],
        [3330, 1230],
      ],
      frames: 300,
      hang: { point: 3, frames: 40 },
      look: { x: 1500, y: 760, zoom: 0.85, from: 0, to: 200 },
    },
  ]);
  // The full escape (r14, moment 7; r15, review r14 #1: low and east, then the clifftop's chimney): from the roof's
  // giving (`cn-den-collapse`) she runs east along the floor under the falling roof (rocks keyed to her progress, each
  // told by grit first; the fallen roof's mound to hop), through the breach and along the root corridor into the way
  // out (`next`), where its second block (`out-escape`) takes her up the chimney under the rising earth. A hit holds
  // her and puts her back at the last checkpoint, no light lost (src/sim/escape.ts). `path`: the freed cloud's line out
  // ahead of her (render).
  const floorAt = (x0: number, x1: number) => ({ x: x0, y: 1344 - 192, w: x1 - x0, h: 192 });
  r.set('escape', {
    id: 'den-escape',
    after: DEN_COLLAPSE,
    sets: DEN_ESCAPED,
    next: 'cn-out',
    area: { x: 576, y: 448, w: 3840 - 576, h: 1344 - 448 },
    path: [
      [DEN_CAGE[0], 1180],
      [2300, 1160],
      [2900, 1180],
      [3300, 1220],
      [3840, 1220],
    ],
    checkpoints: [
      { id: 'cp-floor', x: 1600, y: 1344, at: floorAt(576, 2368) },
      { id: 'cp-east', x: 2780, y: 1344, at: floorAt(2688, 3264) },
    ],
    rocks: [
      // Behind her as she turns east: the roof over the cage gives (drama).
      { id: 'rock-1', x: 1600, w: 128, y0: 480, y1: 1344, when: floorAt(1984, 2240), tell: 16, cp: 0 },
      // Ahead, by the mound: grit over it first; a runner is past before it lands, a careful one waits and sees it.
      { id: 'rock-2', x: 2400, w: 112, y0: 480, y1: 1344, when: floorAt(1984, 2240), tell: 56, cp: 0 },
      // Ahead, where the taproot stood: told as she is down off the mound (room to stop short of it).
      { id: 'rock-3', x: 3056, w: 128, y0: 560, y1: 1344, when: floorAt(2688, 2816), tell: 48, cp: 1 },
      // In the corridor's mouth as she reaches the breach: a short fall, told long (the low roof shows it).
      { id: 'rock-4', x: 3520, w: 96, y0: 1088, y1: 1344, when: floorAt(3136, 3264), tell: 40, cp: 1 },
      // Behind her: the breach's lintel comes down as she is in the corridor.
      { id: 'rock-5', x: 3200, w: 128, y0: 704, y1: 1344, when: floorAt(3600, 3728), tell: 12, cp: 1 },
    ],
  });
  r.set('camera', {
    headroom: 0,
    // (r11: the arena's lock lets go with the great cage's release, so the view follows her up the roof's shaft and
    // along the passage to the clifftop: locked, the passage was out of frame.)
    // (r14: zones are first-match: the fight's lock lets go at the kill (`cn-den-down`), and `den-end` holds the view
    // in the arena, a little closer, leaning toward the fallen cage (review r13 #1) until the release; then `escape`
    // takes the chimney, the shaft and the passage, wide enough to show the earth rising under her.)
    zones: [
      { id: 'arena', x: 448, y: 320, w: 2944, h: 1152, lock: true, until: 'cn-den-down' },
      {
        id: 'den-end',
        x: 448,
        y: 320,
        w: 2944,
        h: 1152,
        lock: true,
        zoom: 1.1,
        lean: { x: DEN_CAGE[0], y: 1240, k: 0.4 },
        until: 'cn-den-freed',
      },
      // (r15, review r14 #1: at 0.8 she was 30 px tall and the danger far off: 1.0, leaning toward the breach.)
      {
        id: 'escape',
        x: 448,
        y: 0,
        w: 3840 - 448,
        h: 1472,
        zoom: 1,
        bounds: { x: 448, y: 0, w: 3840 - 448, h: 1472 },
        lean: { x: DEN_BREACH[0], y: 1200, k: 0.25 },
        after: DEN_COLLAPSE,
        until: DEN_ESCAPED,
      },
      // (r12, the Keeper's intro: on the balcony the view takes in the arena's floor under the cage, where the sleeper
      // takes the falling moth, until it has (`fed`). It lets go then: the balcony's own frame.)
      {
        id: 'intro',
        x: 0,
        y: 64,
        w: 640,
        h: 256,
        zoom: 0.72,
        bounds: { x: 0, y: 160, w: 2688, h: 1376 },
        until: 'cn-den-fed',
      },
    ],
  });
  r.landmark('arena', 'arena', 1900, 1344);
  r.landmark('breach', 'gate', (DEN_BREACH[0] + DEN_BREACH[1]) / 2, 1216);
  r.place('balcony', 300, DEN_IN);
  r.place('floor', 1700, 1344);
  r.place('shelf-w', 1440, 1088);
  r.place('breach', 3600, 1344);
  r.shotStops([
    ['balcony', 400, DEN_IN],
    ['reveal', 700, 704],
    ['floor', 1700, 1344],
    ['cage', DEN_CAGE[0], 1088],
    ['taproot', 2800, 1344],
    ['breach', 3300, 1344],
    ['corridor', 3600, 1344],
  ]);
  r.route('tunnel', 'balcony');
  r.route('balcony', 'p-den');
  r.route('balcony', 'floor', { oneWay: true });
  // (The breach opens on the collapse, after the great cage's release: flags the world check cannot see.)
  r.route('floor', 'breach');
  r.route('breach', 'floor');
  r.route('breach', 'out');
  r.route('out', 'breach');
  return r.finish();
}

/** The way out's plug (its top) across the chimney between the rests (leg 2 cuts it). */
const OUT_PLUG = 832;
/** The way out's chimney floor (review r5 #2: the exam needs height: the floor dug down to 1856, three legs). */
const OUT_FLOOR = 1856;
/** Rest E (in the east block: leg 1's top, leg 2's start) and rest W (in the west block over the plug: leg 2's top). */
const OUT_REST = 1344;
const OUT_REST_W = 832;
/** The clifftop (raised from 640 in r4: a higher glide to the door). */
const TOP = 384;
/** The chimney's strips ([id, face, y0, y1]): one a leg, on the face she must not take (tools/levels/climbs.ts). */
const OUT_THORNS: Array<[string, 'w' | 'e', number, number]> = [
  ['thorn-o2', 'e', 880, 984],
  ['thorn-o3', 'w', 384, 448],
];

function out(): Json {
  const r = new Wood('cn-out', 'The way on', [300, 1344], 7504, {
    art: { anchorY: 1000, moon: { x: 1450, y: 360, r: 200 }, afterglow: { x: 2600, y: 900, strength: 1 } },
  });
  // (r11, review r10 #1: in from the den's roof onto the clifftop, the valley vista the first thing she sees; the
  // chimney is the way down to the ledge's secret now, and back up.) A pocket off the chimney's foot (v10's way in
  // from the den), down a root shaft and along a low passage to the chimney's floor (the chimney's west face stays
  // whole down to the passage's mouth: a fall off leg 2 meets a face, not an opening).
  r.cave(0, 1088, 640, 1344, { ceil: 64, w: 0, e: 0, corner: 0 });
  r.hole(512, 1216, 704, 1856);
  r.hole(704, 1600, 896, 1856);
  // The root chimney up to the top (review r5 #2: the area's last climb is its exam): 384 wide, 1,472 tall, three
  // legs from three rests: up the east face to rest E; across to the west face, cutting the rotten plug from a
  // cling under it, to rest W; across to the east face and over the top. A strip over each of the two upper rests
  // on the face she must not take, so two changes of wall.
  r.hole(896, TOP, 1280, OUT_FLOOR);
  r.plug('out-plug', 896, OUT_PLUG, 384);
  r.hole(1280, OUT_REST - 384, 1536, OUT_REST);
  r.hole(640, OUT_REST_W - 256, 896, OUT_REST_W);
  r.hole(0, 0, 1792, TOP);
  // The valley: the cliff falls 1600 px to a thorn bed; across it the next area's door on its ledge.
  r.hole(1792, 0, 3840, 2240);
  // Secret: a rotten wall at the chimney's foot, a passage and a shaft behind it down to the ledge's way.
  r.hole(1280, OUT_FLOOR - 192, 1728, OUT_FLOOR);
  r.bark('ledge-wall', 1280, OUT_FLOOR - 192, 64, 192);
  r.hole(1472, OUT_FLOOR, 1728, 2304);
  r.hole(0, 2048, 1728, 2304);
  r.gate('next-door', 3520, 832, 128, 256, 'cn-next');
  r.back(0, TOP, 1792, 2432);
  r.fill();
  r.mass(3136, 1088, 704, 1152, false);
  r.noClaws(1792, TOP, 2240);
  // (The block's chimney face takes the claws; its valley face refuses them.)
  r.claws(1280, TOP, OUT_FLOOR, 'west');
  // (The west block's corner over rest W is thorned and slick: from rest W the way is the east face.)
  r.noClaws(896, TOP, OUT_REST_W - 256);
  // Root lips out from the rests into the chimney: she lands on them, and the next leg starts from their ends.
  r.oneWay(1152, OUT_REST, 128, 'branch');
  r.oneWay(896, OUT_REST_W, 128, 'branch');
  // The way back from the door: up the door-oak's east face, west along its high limb, a drop onto the clifftop.
  r.tree('door-oak', 3712, 128, 0, 1088, true, 'west');
  // (The limb is 336 over the clifftop (raised to 384 in r4): out of a jump's reach from the lip.)
  r.limb('return', 2112, 3552, 48, {
    parent: 'door-oak',
    grows: 'west',
    end: 'snap',
    h: 80,
    from: [3712, 76],
  });
  r.limbNoClaws(2112, 3552, 48);
  r.thorns('thorn-valley', 1792, 2240, 1344);
  for (const [id, f, y0, y1] of OUT_THORNS) r.thornsUp(id, f === 'w' ? 896 : 1280 - 28, y0, y1 - y0);
  r.patch('p-out', 420, TOP);
  r.lamp('wick-door', 3280, 900);
  // The false lights down in the valley (review r3 #5): real lamps on the thorns' far side, out of reach; the moths
  // drift to them. A camera zone pulls back over the glide so the cliff, the valley and the door read at once.
  r.lamp('wick-valley-1', 2240, 2080);
  r.lamp('wick-valley-2', 2620, 2140);
  r.lamp('wick-valley-3', 2960, 2060);
  // (r15, review r14 #1: the escape's chimney at 1.0, the view's centre `below` her so the rising earth is in the
  // frame's lower part; first-match, so before the valley's.)
  r.set('camera', {
    zones: [
      {
        id: 'escape',
        x: 0,
        y: 0,
        w: 1792,
        h: 2304,
        zoom: 1,
        below: 180,
        after: DEN_COLLAPSE,
        until: DEN_ESCAPED,
      },
      { id: 'valley', x: 1792, y: 0, w: 2048, h: 1600, zoom: 0.85 },
    ],
  });
  r.add('triggers', { id: 'way-on', x: 3328, y: 800, w: 160, h: 288, sets: 'cn-area-end' });
  // The ending's view (r11, review r10 #1): out of the den's roof onto the clifftop, the camera takes the valley, the
  // moon and the mountain for 3 s (`marks.stage.vista` on `cn-out-vista`; she keeps control), where every moth she
  // freed streams off toward the moon (render).
  // (r15: she bursts out of the chimney's mouth now, not in from the den's passage at the west end.)
  r.add('triggers', { id: 'out-vista', x: 576, y: 0, w: 1792 - 576, h: TOP, sets: 'cn-out-vista' });
  // (r15, review r14 #10: the vista and the glide after it are quiet: render fades the HUD and holds the prompts.)
  r.set('quiet', [
    { id: 'vista', flag: 'cn-out-vista', frames: 240, air: { x: 1792, y: 0, w: 2048, h: 2240 } },
  ]);
  // The escape's second leg (r15, review r14 #1: 20-30 s, the earth on her heels): in from the den's corridor, down the
  // pocket's root shaft, along the low passage to the chimney's foot, then up it (out-1..3) with the earth rising
  // under her from its foot (`front.start`), 240 px under where she stands or holds a wall. The collapse shakes the
  // rotten plug down as it begins (`breaks`). Rocks told by grit where she will be next, over the rest she climbs to,
  // while she can wait on the one she is on; checkpoints at the pocket, the foot and each rest. It ends on the
  // clifftop: the vista.
  const outPerch = (x0: number, x1: number, y: number) => ({ x: x0, y: y - 192, w: x1 - x0, h: 192 });
  r.set('escape', {
    id: 'out-escape',
    after: DEN_COLLAPSE,
    sets: DEN_ESCAPED,
    area: { x: 0, y: TOP, w: 1792, h: OUT_FLOOR - TOP },
    end: { x: 576, y: 0, w: 1792 - 576, h: TOP },
    breaks: ['out-plug'],
    path: [
      [300, 1240],
      [608, 1280],
      [608, 1760],
      [800, 1780],
      [1088, 1760],
      [1200, 1420],
      [1400, 1280],
      [1088, 1060],
      [768, 760],
      [1088, 620],
      [1088, 330],
      [1400, 250],
      [1792, 250],
    ],
    checkpoints: [
      { id: 'cp-pocket', x: 300, y: 1344, at: outPerch(64, 576, 1344) },
      { id: 'cp-foot', x: 1088, y: OUT_FLOOR, at: outPerch(896, 1280, OUT_FLOOR) },
      { id: 'cp-rest-e', x: 1408, y: OUT_REST, at: outPerch(1152, 1536, OUT_REST) },
      { id: 'cp-rest-w', x: 768, y: OUT_REST_W, at: outPerch(640, 896, OUT_REST_W) },
    ],
    rocks: [
      // Behind her: the pocket's roof comes down the shaft as she is along the passage.
      {
        id: 'rock-o1',
        x: 608,
        w: 112,
        y0: 1120,
        y1: OUT_FLOOR,
        when: outPerch(704, 896, OUT_FLOOR),
        tell: 12,
        cp: 1,
      },
      // Ahead: grit over rest E as she stands at the chimney's foot (wait, see it land, climb).
      {
        id: 'rock-o2',
        x: 1344,
        w: 112,
        y0: 980,
        y1: OUT_REST,
        when: outPerch(896, 1280, OUT_FLOOR),
        tell: 48,
        cp: 1,
      },
      // Ahead: over rest W as she stands on rest E.
      {
        id: 'rock-o3',
        x: 768,
        w: 112,
        y0: 600,
        y1: OUT_REST_W,
        when: outPerch(1152, 1536, OUT_REST),
        tell: 56,
        cp: 2,
      },
      // Behind her: the chimney's wall where the plug was comes down under her as she is on rest W.
      {
        id: 'rock-o4',
        x: 1088,
        w: 128,
        y0: 900,
        y1: OUT_REST,
        when: outPerch(640, 896, OUT_REST_W),
        tell: 10,
        cp: 3,
      },
      // Behind her: the chimney's lip as she tops out.
      {
        id: 'rock-o5',
        x: 944,
        w: 96,
        y0: 392,
        y1: OUT_REST,
        when: { x: 1152, y: TOP, w: 128, h: 192 },
        tell: 8,
        cp: 3,
      },
    ],
    front: {
      x0: 640,
      x1: 1536,
      y0: OUT_FLOOR + 64,
      top: TOP + 64,
      lag: 240,
      near: 200,
      speed: 16,
      creep: 0.6,
      start: outPerch(896, 1280, OUT_FLOOR),
    },
  });

  r.landmark('vista', 'vista', 1700, TOP);
  r.landmark('valley', 'valley', 1792, 640, 2048, 1600);
  r.landmark('mountain', 'mountain', 2900, 420);
  r.landmark('next-door', 'arch', 3584, 1088);
  r.cover('ledge-cover', 1280, OUT_FLOOR - 256, 512, 448, 'ledge-wall');
  r.cover('ledge-cover-2', 0, 1984, 1792, 384, 'ledge-wall');
  r.place('in', 300, 1344);
  r.place('arrive', 200, TOP);
  r.place('foot', 1088, OUT_FLOOR);
  r.place('restE', 1400, OUT_REST);
  r.place('restW', 760, OUT_REST_W);
  r.place('top', 1500, TOP);
  // The kin, at the way out (r8, review r7 #5): after the den, it waits on the cliff top, looking out over the valley.
  r.set('marks', {
    ...(r.data.marks as Json),
    tatter: { x: 1700, y: TOP, facing: 1, when: 'cn-den-down' },
    stage: { vista: { flag: 'cn-out-vista', x: 2300, y: 760, zoom: 0.7, hold: 3 } },
    notes: [
      {
        x: 1700,
        y: TOP - 100,
        text: 'the kin (3/3): waits on the cliff after the den; goes on ahead with her',
      },
    ],
  });
  r.place('low', 700, 2304);
  r.place('door', 3400, 1088);
  r.shotStops([
    ['in', 400, 1344],
    ['foot', 1088, OUT_FLOOR],
    ['rest', 1300, OUT_REST],
    ['chimney', 1088, 1000],
    ['restW', 900, OUT_REST_W],
    ['top', 1300, TOP],
    ['valley', 2500, 1000],
    ['door', 3400, 1088],
  ]);
  r.route('den', 'in');
  r.route('in', 'den');
  r.route('in', 'foot');
  r.route('foot', 'in', { needs: [C] });
  r.route('foot', 'top', { needs: [C] });
  r.route('top', 'foot', { oneWay: true });
  r.route('top', 'p-out');
  r.route('top', 'door', { needs: [G], oneWay: true });
  r.route('door', 'way-on');
  r.route('door', 'top', { needs: [C], oneWay: true });
  r.route('foot', 'low', { oneWay: true });
  r.route('low', 'foot', { needs: [C], oneWay: true });
  r.route('low', 'ledge');
  return r.finish();
}

function ledge(): Json {
  const r = new Wood('cn-ledge', 'The root ledge', [2400, 768], 7505, { back: true, mood: 'deep' });
  r.cave(1792, 512, 2560, 768, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(256, 384, 1920, 1152, { ceil: 96, w: 64, e: 0, corner: 128 });
  r.fill();
  r.burl(1536, 1152, 384, 384, 2);
  r.burrback('burr-ledge', 900, 1152, 1, 300, { fenced: true });
  // (r7, review r6 #7: the dead end after the boss pays a great alone.)
  r.great('ledge-great', 450, 1080);
  r.place('in', 2400, 768);
  r.place('floor', 800, 1152);
  r.shotStops([
    ['in', 2200, 768],
    ['floor', 900, 1152],
  ]);
  r.route('out', 'in');
  r.route('in', 'floor', { oneWay: true });
  r.route('floor', 'in', { oneWay: true });
  return r.finish();
}

const AREAS = [
  { id: 'cn-heart', rooms: ['cn-hatch', 'cn-hub'] },
  { id: 'cn-west', rooms: ['cn-limbs', 'cn-trunk', 'cn-well', 'cn-rot', 'cn-crawl', 'cn-webs', 'cn-elder'] },
  {
    id: 'cn-east',
    rooms: [
      'cn-fork',
      'cn-cellar',
      'cn-galleries',
      'cn-larder',
      'cn-grove',
      'cn-hollowroot',
      'cn-spire',
      'cn-nook',
    ],
  },
  { id: 'cn-high', rooms: ['cn-bower', 'cn-crown', 'cn-attic', 'cn-gap', 'cn-sky'] },
  { id: 'cn-deep', rooms: ['cn-tunnel', 'cn-burrow', 'cn-den', 'cn-out', 'cn-ledge'] },
];

/** A springboard's relight (r10): the firefly's hung lights burn again behind her; the gap's wait for its pass. */
const SPRING_RELIGHT = 240;
const GAP_RELIGHT = 900;

/**
 * Two kinds of lamp (r10, review r9 #2: "what to use and what to free"): every plain lamp she can fling off is a
 * springboard, one of the firefly's hung lights: it holds no trapped moths (`moths` 0) and burns again after it goes
 * out (`relight`, never saved, nothing counted). The traps (`trap`) are cut out for good and free their moths. Not
 * touched: lamps that burn on a flag (`after`, the seed sockets), a boss's (the den's), the valley's (out of reach).
 */
function springboards(rooms: Json[]): void {
  for (const room of rooms) {
    const snuffed = new Set(
      ((room.enemies as Json[] | undefined) ?? []).map((e) => e.snuffs as string | undefined).filter(Boolean),
    );
    for (const l of (room.lures as Json[] | undefined) ?? []) {
      if (l.kind !== 'wick' || l.trap || l.after || l.relight) continue;
      if (snuffed.has(l.id as string) || room.id === 'cn-den') continue;
      if (String(l.id).startsWith('wick-valley')) continue;
      l.relight = room.id === 'cn-gap' ? GAP_RELIGHT : SPRING_RELIGHT;
      l.moths = 0;
    }
  }
}

export function buildCanopy(): { rooms: Json[]; world: Json } {
  for (const [id, p] of Object.entries(PLACE))
    if (p.w < MIN_W || p.h < MIN_H)
      throw new Error(`${id}: ${p.w} x ${p.h} is smaller than ${MIN_W} x ${MIN_H}`);
  const rooms = [
    hatch(),
    hub(),
    trunk(),
    well(),
    limbs(),
    rot(),
    crawl(),
    webs(),
    elder(),
    fork(),
    cellar(),
    galleries(),
    larder(),
    grove(),
    spire(),
    nook(),
    hollowroot(),
    bower(),
    crown(),
    attic(),
    gap(),
    sky(),
    tunnel(),
    burrow(),
    den(),
    out(),
    ledge(),
  ];
  springboards(rooms);
  const ids = new Set(rooms.map((r) => r.id as string));
  const world = {
    start: 'cn-hatch',
    rooms: Object.entries(PLACE)
      .filter(([id]) => ids.has(id))
      .map(([id, p]) => ({ id, x: p.x, y: p.y })),
    tests: [],
    areas: AREAS,
  };
  return { rooms, world };
}

if (process.argv[1]?.endsWith('canopy.ts')) {
  const { rooms, world } = buildCanopy();
  writeFileSync(OUT_ROOMS, `${JSON.stringify(rooms, null, 1)}\n`);
  writeFileSync(OUT_WORLD, `${JSON.stringify(world, null, 2)}\n`);
  console.log(`wrote ${OUT_ROOMS} (${rooms.length} rooms) and ${OUT_WORLD}`);
}
