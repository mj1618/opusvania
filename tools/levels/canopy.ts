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
  'cn-well': { x: -3200, y: 1792, w: 2560, h: 4992 },
  'cn-limbs': { x: -640, y: 1792, w: 3200, h: 1536 },
  'cn-hub': { x: 2560, y: 1792, w: 4480, h: 2304 },
  'cn-fork': { x: 7040, y: 1792, w: 3200, h: 1920 },
  'cn-grove': { x: 10240, y: 1792, w: 3840, h: 1920 },
  'cn-spire': { x: 14080, y: 1792, w: 2560, h: 1920 },
  'cn-nook': { x: 16640, y: 1792, w: 2560, h: 1440 },
  'cn-hollowroot': { x: 16640, y: 3232, w: 2560, h: 1440 },
  // Under it.
  'cn-trunk': { x: -640, y: 3328, w: 3200, h: 1920 },
  'cn-tunnel': { x: 2560, y: 4096, w: 4480, h: 2176 },
  'cn-cellar': { x: 7040, y: 3712, w: 3200, h: 1920 },
  'cn-galleries': { x: 10240, y: 3712, w: 3840, h: 1920 },
  'cn-larder': { x: 14080, y: 3712, w: 2560, h: 1920 },
  'cn-rot': { x: -640, y: 5248, w: 3200, h: 1536 },
  'cn-den': { x: 7040, y: 5632, w: 3840, h: 1536 },
  'cn-out': { x: 10880, y: 5632, w: 3840, h: 2432 },
  'cn-burrow': { x: 2560, y: 6272, w: 3200, h: 1440 },
  'cn-crawl': { x: -640, y: 6784, w: 3200, h: 1440 },
  'cn-webs': { x: -3200, y: 6784, w: 2560, h: 1440 },
  'cn-elder': { x: -5760, y: 5568, w: 2560, h: 2656 },
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
  { a: 'cn-hub', b: 'cn-fork', at: 3136 },
  { a: 'cn-hub', b: 'cn-tunnel', at: 4352, ida: 'door', idb: 'hub' },
  { a: 'cn-gap', b: 'cn-hub', at: 6528, span: 384, one: 'a' },
  // West, and the rot branch.
  { a: 'cn-trunk', b: 'cn-well', at: 4992 },
  { a: 'cn-trunk', b: 'cn-rot', at: 448, span: 192, one: 'a' },
  { a: 'cn-limbs', b: 'cn-well', at: 2560 },
  { a: 'cn-rot', b: 'cn-well', at: 6720 },
  { a: 'cn-rot', b: 'cn-crawl', at: 256, span: 192 },
  { a: 'cn-crawl', b: 'cn-webs', at: 8064 },
  { a: 'cn-webs', b: 'cn-elder', at: 8064 },
  { a: 'cn-elder', b: 'cn-well', at: 6720 },
  // East, and the cellar branch.
  { a: 'cn-fork', b: 'cn-grove', at: 2368 },
  { a: 'cn-fork', b: 'cn-cellar', at: 7424, span: 192 },
  { a: 'cn-gap', b: 'cn-fork', at: 9344, one: 'a' },
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
  { a: 'cn-tunnel', b: 'cn-den', at: 6144 },
  { a: 'cn-tunnel', b: 'cn-cellar', at: 5504 },
  { a: 'cn-tunnel', b: 'cn-burrow', at: 3328, span: 192 },
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
    if (o.back) this.back(0, 0, P.w, P.h).set('camera', { headroom: 0 });
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
      const ok = b.floor
        ? [y + 8, y + h - 8].every((yy) => this.solidAt(x - 8, yy, b) && this.solidAt(x + w + 8, yy, b))
        : [x + 8, x + w - 8].every((xx) => this.solidAt(xx, y - 8, b) && this.solidAt(xx, y + h + 8, b));
      if (!ok)
        throw new Error(`${this.data.id}: rotten bark "${b.id}" does not fill its opening (air beside it)`);
    }
    return this.data;
  }

  /** Rotten bark (its own solid: carved first). A wall stands on `floor`; `floor: true` makes a floor panel. */
  bark(id: string, x: number, y: number, w: number, h: number, floor = false): this {
    this.air(x, y, x + w, y + h);
    return this.add('bark', floor ? { id, x, y, w, h, floor: true } : { id, x, y, w, h });
  }

  /** A gate (its own solid: carved first). */
  gate(id: string, x: number, y: number, w: number, h: number, flag: string): this {
    this.air(x, y, x + w, y + h);
    return this.add('gates', { id, x, y, w, h, flag, kick: false });
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
    return super.pod(id, x, mount === 'sit' ? this.top(x, top, 1) : top, regrow, mount, hp);
  }

  hollow(id: string, x: number, floor: number, upgrade: string): this {
    return this.add('hollows', { id, x: x - 80, y: floor - 112, w: 160, h: 112, upgrade });
  }

  stone(id: string, x: number, floor: number, area: string): this {
    return this.add('mothStones', { id, x, y: floor, area });
  }

  patch(id: string, x: number, floor: number): this {
    return this.add('patches', { id, x, y: this.top(x, floor) });
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
  const solids = (src.solids as Json[])
    .filter((s) => !((s.x as number) >= CUT0 && (s.x as number) < CUT1))
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
        x0: sx(s.x0 as number),
        x1: sx(s.x1 as number),
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
  return {
    ...src,
    id: 'cn-hatch',
    title: 'The hatching branch',
    abilities: [],
    width: P.w,
    height: H,
    exits,
    // (A fall off the branch is caught and set back on it, as in wood-hatch; the room is no deeper than that.)
    catches: [{ id: 'below', x: 224, y: H - 192, w: drop.from - 224, h: 192 }],
    solids,
    marks,
    shots: {
      ...shots,
      wide: (shots.wide as Json[])
        .filter((s) => !((s.x as number) > CUT0 && (s.x as number) < CUT1))
        .map((s) => ({ ...s, x: sx(s.x as number) })),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The Crossing (hub, 4480 x 2304): she falls from the hatch onto the lampoak's west limb over the save, east of the
// hall's middle. From the landing she sees the seed door in the root floor below (three sockets; a lamp on the
// lampoak lights for each seed held), the high west block (a sheer face: claws, "up there, later"), and the root
// floor stepping down west to the fallen giant's mouth, lit by a lamp under the block (the way on, drawn by light
// and the floor's fall, not a sign). East, a root bank with a hollow behind rotten heartwood (the heart's
// moth-stone), and the limb on to the fork. Quiet (Dirtmouth): no creature; Tatter keeps the door.

function hub(): Json {
  const r = new Wood('cn-hub', 'The Crossing', [2640, 1152], 7101, {
    mood: 'warm',
    art: { anchorY: 1100, moon: { x: 3000, y: 330, r: 96 }, afterglow: { x: 2900, y: 700, strength: 0.5 } },
  });
  // The hall over the root floor, open to the sky; the bank east; over the high block and its limb's mouth.
  r.hole(1024, 0, 3712, 1600);
  r.hole(3712, 0, 4480, 1344);
  r.hole(0, 0, 1024, 576);
  // The root floor steps down west into the giant's mouth under the high block (its roof bitten).
  r.cave(1024, 1600, 1408, 1792, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(0, 1664, 1024, 1920, { ceil: 96, w: 0, e: 0, corner: 0 });
  // The seed door and its shaft into the root tunnel.
  r.gate('seed-door', 1792, 1600, 256, 64, 'seeds:3');
  r.hole(1792, 1664, 2048, 2304);
  // Secret: a hollow in the east root bank behind a wall of rotten heartwood (the heart's moth-stone).
  r.cave(3776, 1408, 4352, 1600, { ceil: 0, w: 0, e: 64, corner: 0 });
  r.bark('bank-wall', 3712, 1408, 64, 192);
  r.back(0, 1600, 4480, 2304);
  r.back(3712, 1344, 4480, 1600);
  r.fill();
  r.tree('lampoak', 2880, 288, -500, 1600, false);
  r.limb('land', 2240, 2880, 1152, { parent: 'lampoak', grows: 'west', end: 'snap', flat: [[2496, 2816]] });
  r.limb('east', 3168, 3712, 1280, { parent: 'lampoak', grows: 'east', end: 'knee', calm: true });
  r.oneWay(2368, 1376, 192, 'branch');
  r.patch('p-crossing', 2640, 1152);
  r.set('camera', { anchorY: 0.4 });
  // A lamp on the lampoak for each seed held: the hub changes on every return.
  r.lamp('socket-1', 2960, 860, { after: 'seeds:1' });
  r.lamp('socket-2', 3100, 760, { after: 'seeds:2' });
  r.lamp('socket-3', 3020, 640, { after: 'seeds:3' });
  // The way west: a lamp in the giant's mouth (warm light under the block, seen from the landing's west end).
  r.lamp('wick-mouth', 520, 1790);
  r.stone('stone-heart', 4200, 1600, 'cn-heart');
  r.great('bank-great', 4000, 1540);
  r.hoard('bank-', 3820, 1500, 160, 60, 3);
  r.cover('bank-cover', 3712, 1344, 768, 320, 'bank-wall');
  r.set('marks', { ...(r.data.marks as Json), tatter: { x: 2300, y: 1152, facing: -1, want: [1920, 1600] } });
  r.landmark('seed-door', 'goal', 1920, 1600);
  r.landmark('mouth', 'way', 400, 1920);
  r.place('land', 2640, 1152);
  r.place('floor', 2400, 1600);
  r.place('mouth', 300, 1920);
  r.place('high', 500, 576);
  r.place('east', 4200, 1344);
  r.shotStops([
    ['landing', 2640, 1152],
    ['door', 1920, 1600],
    ['west', 900, 1792],
    ['high', 600, 576],
    ['east', 3900, 1344],
  ]);
  r.route('hatch', 'land', { oneWay: true });
  r.route('gap', 'east', { oneWay: true });
  r.route('land', 'floor');
  r.route('land', 'p-crossing');
  r.route('floor', 'mouth');
  r.route('mouth', 'trunk');
  r.route('floor', 'east');
  r.route('east', 'fork');
  r.route('floor', 'high', { needs: [C] });
  r.route('high', 'floor', { oneWay: true });
  r.route('high', 'limbs');
  r.route('floor', 'stone-heart');
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

function trunk(): Json {
  const r = new Wood('cn-trunk', 'The fallen giant', [2900, 384], 7202, { back: true, mood: 'deep' });
  r.cave(2560, 128, 3200, 384, { ceil: 64, w: 0, e: 0, corner: 0 });
  // Tier 1: the hall inside the giant; the seed's alcove up in its roof.
  r.cave(1536, 192, 2624, 704, { ceil: 128, w: 0, e: 0, skip: [[1600, 1984]] });
  r.hole(1728, 64, 1920, 192);
  // The hall's west end: a low corridor shut by rotten heartwood (the wall that teaches breaking).
  r.hole(1280, 512, 1536, 704);
  r.bark('giant-wall', 1408, 512, 64, 192);
  // The drop to tier 2; tier 2 under a low roof (thorns under it), the rot panel where she lands.
  r.hole(1088, 512, 1280, 1024);
  r.hole(448, 768, 1088, 1024);
  r.bark('rot-panel', 1088, 1024, 192, 64, true);
  r.hole(1088, 1088, 1280, 1920);
  // The drop to tier 3, and tier 3 out west to the well.
  r.hole(448, 1024, 640, 1216);
  r.cave(0, 1216, 1024, 1664, { ceil: 96, w: 0, e: 0 });
  r.fill();
  // Root burls up to the alcove (tapered, not pillars).
  r.burl(1920, 704, 256, 192, 2);
  r.burl(1664, 704, 256, 384, 2);
  r.add('moonseeds', { id: 'seed-giant', x: 1824, y: 220 });
  r.thorns('thorn-t2', 768, 1024, 192);
  r.thornsUnder('thorn-roof', 960, 768, 128);
  r.thorns('thorn-t3', 256, 1664, 192);
  r.juvenile('juv-t1', 2480, 704, -1, 140);
  r.flyer('lampwing', 'wing-t2', 760, 900, -1, { radius: 200 });
  r.cover('rot-shaft', 1024, 1088, 320, 832, 'rot-panel');
  r.landmark('giant-wall', 'teach', 1440, 704);
  r.place('top', 2900, 384);
  r.place('t1', 2300, 704);
  r.place('t2', 800, 1024);
  r.place('t3', 600, 1664);
  r.shotStops([
    ['entry', 2900, 384],
    ['seed', 1900, 704],
    ['wall', 1500, 704],
    ['thorns', 800, 1024],
    ['low', 500, 1664],
  ]);
  r.route('hub', 'top');
  r.route('top', 't1', { oneWay: true });
  r.route('t1', 'top', { needs: [C], oneWay: true });
  r.route('t1', 'seed-giant');
  r.route('t1', 't2', { oneWay: true });
  r.route('t2', 't1', { needs: [C], oneWay: true });
  r.route('t2', 'rot', { oneWay: true });
  r.route('t2', 't3', { oneWay: true });
  r.route('t3', 't2', { needs: [C], oneWay: true });
  r.route('t3', 'well');
  return r.finish();
}

function well(): Json {
  const r = new Wood('cn-well', "The Elder's well", [1600, 4928], 7203, {
    back: true,
    art: { anchorY: 2600 },
  });
  // The shaft up the Elder (a claw climb: straight faces).
  r.hole(1024, 1152, 1536, 4928);
  // The bottom: the claws, far and low; out east to the rot hall.
  r.cave(1536, 4608, 2560, 4928, { ceil: 64, w: 0, e: 0, corner: 0 });
  // The Elder's notch off the shaft's foot, its rotten plug in the west wall.
  r.cave(128, 4672, 1024, 4928, { ceil: 64, w: 0, e: 0, corner: 0 });
  r.bark('elder-plug', 64, 4672, 64, 256);
  // The giant's mouth on the east wall, a landing above it: rests for a climber who changes wall; the west face
  // runs clean from the notch to the hollow (one wall is enough).
  r.cave(1536, 2944, 2560, 3200, { ceil: 64, w: 0, e: 0, corner: 0 });
  r.hole(1536, 1856, 1792, 2240);
  // The ambush hollow: two tiers, a shelf under its roof; out east to the limbs.
  r.cave(256, 448, 2304, 1152, { ceil: 128, w: 64, e: 0 });
  r.hole(2304, 512, 2560, 768);
  r.fill();
  r.mass(1600, 960, 704, 192);
  r.mass(1792, 704, 384, 48);
  // A root across the shaft's mouth: she climbs through it from below, and the hollow's floor is whole.
  r.oneWay(1024, 1152, 512, 'branch');
  r.add('glades', { id: 'glade-claws', x: 1360, y: 4704, w: 216, h: 224, ability: C });
  r.patch('p-well', 1900, 4928);
  r.great('claw-prize', 1090, 3900);
  // Thorns on the east face between its rests: the long west face is the climb.
  r.thornsUp('thorn-w2', 1508, 2600, 240);
  r.thornsUp('thorn-w3', 1508, 1400, 250);
  // The ambush: woken by the claws.
  r.burrback('burr-am-1', 640, 1152, 1, 300, { wakes: C, fenced: true });
  r.burrback('burr-am-2', 1960, 960, -1, 250, { wakes: C, fenced: true });
  r.flyer('lampwing', 'wing-am', 1300, 700, 1, { radius: 260, wakes: C });
  r.cover('elder-cover', 0, 4608, 128, 384, 'elder-plug');
  r.place('bottom', 1700, 4928);
  r.place('mouth', 2200, 3200);
  r.place('mid', 1650, 2240);
  r.place('notch', 500, 4928);
  r.place('hollow', 600, 1152);
  r.place('top', 2400, 768);
  r.shotStops([
    ['bottom', 1600, 4928],
    ['shaft', 1280, 3600],
    ['mouth', 2000, 3200],
    ['landing', 1500, 2240],
    ['hollow', 1300, 1152],
  ]);
  r.route('trunk', 'mouth');
  r.route('mouth', 'bottom', { oneWay: true });
  r.route('rot', 'bottom');
  r.route('bottom', 'glade-claws');
  r.route('bottom', 'p-well');
  r.route('bottom', 'notch');
  r.route('notch', 'elder');
  r.route('bottom', 'mouth', { needs: [C], oneWay: true });
  r.route('bottom', 'hollow', { needs: [C], oneWay: true });
  r.route('mouth', 'mid', { needs: [C] });
  r.route('mid', 'hollow', { needs: [C] });
  r.route('hollow', 'top');
  r.route('top', 'limbs');
  return r.finish();
}

function limbs(): Json {
  const r = new Wood('cn-limbs', 'The upper limbs', [200, 768], 7204, { back: true, art: { anchorY: 800 } });
  r.cave(384, 256, 2880, 1280, { ceil: 128, w: 0, e: 0, skip: [[1344, 2944]] });
  r.hole(0, 512, 384, 768);
  r.cave(2880, 256, 3200, 576, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.hole(2368, 64, 2944, 256);
  // Secret: a niche up in the roof over the second limb (its shelf at 320, an overhang hides it).
  r.hole(1728, 128, 2240, 256);
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
  r.thorns('thorn-g1', 1056, 1280, 448);
  r.thorns('thorn-g3', 480, 1280, 320);
  r.flyer('lampwing', 'wing-g1', 1280, 520, -1, { radius: 220 });
  r.stone('stone-west', 2100, 320, 'cn-west');
  r.hoard('niche-', 1900, 200, 200, 60, 3);
  r.cover('niche-cover', 1664, 64, 640, 320);
  r.place('west', 200, 768);
  r.place('east', 3000, 576);
  r.shotStops([
    ['west', 400, 768],
    ['gap', 1280, 768],
    ['chimney', 2400, 704],
    ['east', 3000, 576],
  ]);
  r.route('well', 'west');
  r.route('west', 'east', { needs: [C] });
  r.route('east', 'hub');
  r.route('west', 'stone-west');
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
  // West: a low corridor to the well, shut by rotten heartwood; east: the cache behind another.
  r.hole(0, 1216, 640, 1472);
  r.bark('rot-wall', 448, 1216, 64, 256);
  r.hole(2240, 1216, 2368, 1472);
  r.bark('rot-cache', 2304, 1216, 64, 256);
  r.cave(2368, 1088, 3008, 1472, { ceil: 64, w: 0, e: 64, corner: 64 });
  r.bark('crawl-panel', 896, 1472, 192, 64, true);
  r.fill();
  r.burrback('burr-rot', 1900, 1472, -1, 260, { fenced: true });
  r.thorns('thorn-r1', 2000, 1472, 128);
  r.thornsUnder('thorn-r2', 1440, 1088, 320);
  r.hoard('cache-', 2560, 1320, 240, 100, 5);
  r.great('cache-great', 2860, 1420);
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
  // A niche in the roof of the middle run (a hoard behind the mass's face).
  r.hole(1856, 384, 2112, 512);
  r.fill();
  r.juvenile('juv-c2', 1100, 864, 1, 260);
  r.hoard('crawl-', 1900, 430, 160, 50, 4);
  r.cover('crawl-cover', 1792, 320, 384, 256);
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
  // A niche up in the roof's east corner.
  r.hole(1856, 128, 2112, 320);
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
  r.hoard('webs-', 1880, 180, 200, 60, 3);
  r.great('webs-great', 1984, 290);
  r.cover('webs-cover', 1792, 64, 384, 320);
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
  r.fill();
  r.hollow('drop-elder', 500, 512, 'moonDrop');
  r.hoard('elder-', 300, 400, 160, 60, 4);
  r.place('in', 2300, 2496);
  r.place('top', 700, 512);
  r.place('plug', 2400, 1152);
  r.shotStops([
    ['in', 2200, 2496],
    ['climb', 960, 1500],
    ['top', 700, 512],
  ]);
  r.route('webs', 'in');
  r.route('in', 'top', { needs: [C] });
  r.route('top', 'in', { oneWay: true });
  r.route('top', 'drop-elder');
  r.route('top', 'plug', { oneWay: true });
  r.route('plug', 'in', { oneWay: true });
  r.route('plug', 'well');
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
    art: { anchorY: 900, moon: { x: 2700, y: 640, r: 110 }, afterglow: { x: 2600, y: 800, strength: 0.4 } },
  });
  r.hole(896, 0, 2816, 1344);
  r.cave(0, 1088, 896, 1344, { ceil: 64, w: 0, e: 0, corner: 0 });
  r.cave(2816, 320, 3200, 576, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.back(0, 1088, 896, 1344);
  // The moth-stone's pocket up in the west wall, its mouth over a limb.
  r.cave(192, 640, 896, 896, { ceil: 64, w: 64, e: 0, corner: 64 });
  // Secret: a rotten panel in the floor over stairs that go down west under it to the cellar.
  r.bark('cellar-panel', 1792, 1344, 192, 64, true);
  r.hole(1344, 1408, 1984, 1536);
  r.hole(832, 1536, 1472, 1728);
  r.hole(320, 1664, 960, 1856);
  r.back(320, 1408, 1984, 1920);
  r.fill();
  r.noClaws(896, 0, 1088);
  r.noClaws(2816, 0, 320);
  r.limb('perch', 896, 1344, 1088, { grows: 'east', end: 'tip', h: 80 });
  r.burl(1408, 1344, 384, 192, 2);
  // The glide shelf: from the face's top she glides west over the fork (no claws on it: a pocket for wings only).
  r.mass(1792, 768, 256, 48, false);
  r.thorns('thorn-pit', 2560, 1344, 256);
  r.juvenile('juv-e', 2350, 1344, -1, 200);
  r.stone('stone-east', 400, 896, 'cn-east');
  r.hoard('stone-', 600, 820, 160, 60, 3);
  r.cover('stone-cover', 128, 576, 768, 384);
  r.great('shelf-great', 1920, 720);
  r.hoard('shelf-', 1830, 700, 180, 40, 3);
  r.cover('cellar-cover', 256, 1408, 1792, 512, 'cellar-panel');
  r.place('mid', 1000, 1344);
  r.place('top', 3000, 576);
  r.place('shelf', 1920, 768);
  r.place('stairs', 600, 1856);
  r.shotStops([
    ['entry', 400, 1344],
    ['knoll', 1600, 1344],
    ['face', 2500, 1344],
    ['top', 2900, 576],
  ]);
  r.route('hub', 'mid');
  r.route('gap', 'mid', { oneWay: true });
  r.route('mid', 'stairs');
  r.route('stairs', 'cellar');
  r.route('mid', 'stone-east');
  r.route('mid', 'top', { needs: [C] });
  r.route('top', 'mid', { oneWay: true });
  r.route('top', 'grove');
  r.route('top', 'shelf', { needs: [G], oneWay: true });
  r.route('shelf', 'mid', { oneWay: true });
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
  r.fill();
  r.shortcut('trap', 1024, 320, 192, 64, 's');
  r.burl(2240, 704, 320, 128, 2);
  r.ants('ant-c', 1900, 2900, 704, 2);
  r.thorns('thorn-c1', 500, 1792, 128);
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
  r.fill();
  // A stair of burls down into the nest (steps of 176: no claws needed back up).
  r.burl(1280, 1408, 512, 704, 4);
  r.ants('ant-g', 1900, 2600, 1408, 3);
  r.juvenile('juv-g', 2300, 1408, -1, 260);
  r.hoard('nest-', 3100, 1300, 300, 80, 5);
  r.great('nest-great', 3450, 1360);
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
  return r.finish();
}

function larder(): Json {
  const r = new Wood('cn-larder', 'The larder', [200, 640], 7307, { back: true, mood: 'deep' });
  r.cave(0, 384, 896, 640, { ceil: 64, w: 0, e: 0, corner: 0 });
  r.cave(640, 704, 2304, 1536, { ceil: 128, w: 64, e: 64, corner: 128 });
  r.hole(768, 640, 896, 704);
  r.fill();
  r.burl(1280, 1536, 384, 192, 2);
  r.burrback('burr-larder', 1880, 1536, -1, 300, { fenced: true });
  r.ants('ant-l', 900, 1800, 1536, 2);
  r.hollow('drop-larder', 2150, 1536, 'moonDrop');
  r.hoard('larder-', 1100, 1360, 240, 80, 4);
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
      [1344, 1728],
      [1952, 2560],
      [2560, 3008],
    ],
  });
  r.hole(704, 192, 3200, 800);
  r.hole(1088, 192, 3200, 1024);
  r.hole(1472, 192, 3200, 1600);
  r.hole(3200, 192, 3840, 1472);
  // Secret: a pocket in the pit's west wall behind rotten heartwood (was a floor panel: r2 #6).
  r.hole(1088, 1408, 1408, 1600);
  r.bark('pit-wall', 1408, 1408, 64, 192);
  r.cap('cap-w', 1536, 1536, 128, 'big');
  r.cap('cap-e', 3008, 1536, 128, 'mid');
  r.back(704, 800, 3200, 1600);
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
  r.lamp('wick-a', 1760, 1180);
  r.lamp('wick-b', 2800, 1120);
  r.lamp('wick-c', 3500, 900);
  r.burrback('burr-pit-w', 1800, 1600, 1, 260);
  r.burrback('burr-pit-e', 2850, 1600, -1, 200, { fenced: true });
  r.flyer('lampwing', 'wing-a', 1700, 900, 1, { radius: 220 });
  r.flyer('hawker', 'hawk-e', 3600, 700, -1, { radius: 260 });
  r.thorns('thorn-p1', 2560, 1600, 140);
  r.thorns('thorn-e1', 3300, 1472, 160);
  r.thornsUnder('thorn-roof', 1400, 192, 256);
  r.hoard('pit-', 1180, 1500, 180, 80, 4);
  r.great('pit-great', 1150, 1560);
  r.cover('pit-cover', 1024, 1344, 448, 320, 'pit-wall');
  r.pod('pod-crown', 2800, 704);
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
  return r.finish();
}

function spire(): Json {
  const r = new Wood('cn-spire', 'The Spire', [300, 1472], 7305, { back: true });
  r.cave(0, 1216, 640, 1472, { ceil: 64, w: 0, e: 0, corner: 0 });
  // The chimney up the Spire's heart: 640 wide, room to dodge the hawker that crosses it on its lamp's rhythm.
  r.hole(640, 0, 1280, 1472);
  // A passage through the Spire's trunk to the nook, its mouth in the east face she climbs.
  r.cave(1280, 640, 2560, 896, { ceil: 64, w: 0, e: 0, corner: 0 });
  // The foot: steps down east to a rotten wall, the hollow root behind it.
  r.hole(1280, 1216, 1600, 1472);
  r.hole(1472, 1408, 1856, 1664);
  r.cave(1728, 1600, 2560, 1856, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.bark('hollow-wall', 2240, 1600, 64, 256);
  r.fill();
  // Two legs: up the east face to the nook's mouth, then across to the west face (thorns on the east above).
  r.thornsUp('thorn-s2', 1252, 300, 300);
  r.lamp('wick-spire', 960, 760);
  r.flyer('hawker', 'hawk-spire', 960, 600, -1, { orbit: 'wick-spire', period: 210, radius: 300 });
  r.cover('nook-cover', 1280, 576, 1280, 384);
  r.cover('hollow-cover', 2240, 1536, 320, 384, 'hollow-wall');
  r.place('base', 300, 1472);
  r.place('foot', 1900, 1856);
  r.place('top', 960, 200);
  r.shotStops([
    ['base', 400, 1472],
    ['climb', 960, 1000],
    ['neck', 960, 400],
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
  r.stone('stone-high', 1500, 832, 'cn-high');
  r.hoard('nook-', 1800, 1100, 200, 80, 4);
  r.place('in', 200, 896);
  r.shotStops([
    ['in', 600, 896],
    ['burl', 1500, 1216],
  ]);
  r.route('spire', 'in');
  r.route('in', 'stone-high');
  r.route('stone-high', 'in', { needs: [C] });
  return r.finish();
}

function hollowroot(): Json {
  const r = new Wood('cn-hollowroot', 'The hollow root', [200, 416], 7304, { back: true, mood: 'deep' });
  r.cave(0, 160, 896, 416, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.cave(640, 416, 2304, 1216, { ceil: 96, w: 64, e: 64, corner: 128 });
  r.fill();
  r.hollow('wings-hollow', 1950, 1216, 'quickWings');
  r.hoard('root-', 1100, 1100, 300, 80, 5);
  r.great('root-great', 2150, 1150);
  r.thorns('thorn-h1', 1500, 1216, 160);
  r.place('in', 200, 416);
  r.shotStops([
    ['in', 500, 416],
    ['floor', 1500, 1216],
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
  r.hole(1024, 64, 1280, 256);
  r.hole(1280, 0, 1536, 256);
  r.hole(1536, 0, 1856, 384);
  r.cave(1536, 384, 4608, 1408, { ceil: 0, w: 0, e: 0, corner: 0 });
  r.hole(3968, 1408, 4608, 1664);
  r.fill();
  r.tree('kin', 1280, 256, 256, 1664, true, true);
  r.limb('kin-ledge', 1728, 2240, 1152, { parent: 'kin', grows: 'east', end: 'snap', from: [1536, 1100] });
  r.limb('upper', 2752, 3392, 1024, { grows: 'east', end: 'snap', h: 80, calm: true });
  r.limb('over', 4192, 4384, 1152, { grows: 'east', end: 'tip', h: 64, calm: true });
  r.thornsUp('thorn-kin', 1536, 1150, 258);
  r.thorns('thorn-b1', 2400, 1408, 192);
  r.flyer('hawker', 'hawk-kin', 1800, 760, -1, { radius: 280 });
  r.lamp('wick-hall', 3300, 860);
  r.flyer('hawker', 'hawk-hall', 3300, 660, -1, { orbit: 'wick-hall', period: 240, radius: 300 });
  r.hoard('kin-', 300, 860, 220, 70, 4);
  r.great('kin-great', 200, 920);
  r.cover('kin-cover', 64, 704, 640, 320, 'kin-wall');
  r.place('arrive', 3800, 1408);
  r.place('top', 1408, 256);
  r.place('west', 400, 704);
  r.place('pit', 760, 960);
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
  r.route('arrive', 'attic', { needs: [C] });
  r.route('attic', 'arrive', { oneWay: true });
  return r.finish();
}

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
  r.flyer('lampwing', 'wing-crown', 2100, 700, -1, { radius: 220 });
  r.landmark('crown', 'landmark', 2200, 1024);
  r.place('in', 1400, 1792);
  r.shotStops([
    ['in', 1400, 1792],
    ['glade', 2100, 1024],
  ]);
  r.route('bower', 'in');
  r.route('in', 'glade-glide');
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
  r.hoard('attic-', 1380, 1060, 200, 80, 4);
  r.place('in', 200, 1184);
  r.shotStops([
    ['in', 500, 1184],
    ['nest', 1400, 1184],
  ]);
  r.route('bower', 'in');
  r.route('in', 'breath-hollow');
  return r.finish();
}

function gap(): Json {
  const r = new Wood('cn-gap', 'The gap', [4100, 1344], 7404, {
    art: { anchorY: 1300, moon: { x: 700, y: 260, r: 110 } },
  });
  r.hole(0, 0, 4352, 1088);
  r.cave(2256, 1088, 3456, 2240, { ceil: 0, w: 0, e: 64, corner: 0 });
  r.hole(0, 1088, 2256, 1856);
  r.hole(3456, 1088, 4352, 1344);
  r.hole(128, 1856, 512, 2304);
  r.back(128, 1856, 512, 2304);
  r.fill();
  r.noClaws(2256, 1856, 2240);
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
  r.thorns('thorn-floor-1', 2300, 2240, 192);
  r.thorns('thorn-floor-2', 3264, 2240, 192);
  r.flyer('hawker', 'hawk-far', 1500, 1500, 1, { radius: 260 });
  r.hoard('roost-', 3000, 1150, 100, 50, 3);
  r.cover('roost-cover', 2752, 0, 576, 1280);
  r.arc('glide-', 2300, 3350, 1480, 80, 5);
  r.place('shelf', 4000, 1344);
  r.place('far', 1200, 1856);
  r.place('floor', 2600, 2240);
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
  r.hollow('eyes-hollow', 2050, 960, 'nightEyes');
  r.great('sky-great', 450, 900);
  r.hoard('sky-', 500, 760, 200, 80, 4);
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

function tunnel(): Json {
  const r = new Wood('cn-tunnel', 'The root tunnel', [1920, 1856], 7501, {
    back: true,
    mood: 'deep',
    mass: 'ground',
  });
  r.hole(1792, 0, 2048, 1280);
  r.cave(256, 1280, 2304, 1856, { ceil: 128, w: 64, e: 0, corner: 64, skip: [[1472, 2368]] });
  r.cave(2304, 1088, 3712, 1856, { ceil: 96, w: 0, e: 0, corner: 0 });
  r.hole(2688, 1856, 3712, 2048);
  r.cave(3712, 1088, 4480, 1856, { ceil: 96, w: 0, e: 0, corner: 0 });
  r.hole(4096, 1792, 4480, 2048);
  r.bark('burrow-panel', 768, 1856, 192, 64, true);
  r.hole(768, 1920, 960, 2176);
  r.fill();
  // Root curtains either side of the door's shaft, down to 224 over the floor (plumb on the shaft's side).
  r.hang(1536, 1280, 256, 352, 3, 'r');
  r.hang(2048, 1280, 192, 352, 3, 'l');
  // The hump, the pit (thorns all along its floor), the block under the shortcut.
  r.burl(2304, 1856, 384, 256, 2);
  r.mass(4288, 1408, 192, 384);
  r.shortcut('sc-cellar', 4416, 1152, 64, 256, 'w');
  r.thorns('thorn-pit', 2688, 2048, 1024);
  r.thorns('thorn-u3', 400, 1856, 160);
  r.burrback('burr-tu-1', 1100, 1856, 1, 220, { fenced: true });
  r.burrback('burr-tu-2', 1450, 1856, -1, 160, { fenced: true });
  r.hoard('burrow-', 860, 2020, 100, 60, 3);
  r.cover('burrow-cover', 704, 1920, 320, 256, 'burrow-panel');
  r.landmark('tracks', 'tracks', 3000, 1856);
  r.place('land', 1920, 1856);
  r.place('floor', 1000, 1856);
  r.place('hump', 2496, 1600);
  r.place('east', 3900, 1856);
  r.place('low', 4300, 2048);
  r.place('ledge', 4350, 1408);
  r.shotStops([
    ['land', 1920, 1856],
    ['pair', 1200, 1856],
    ['pit', 3100, 1700],
    ['east', 4000, 1856],
  ]);
  r.route('hub', 'land', { oneWay: true });
  r.route('land', 'hub', { needs: [C], oneWay: true });
  r.route('land', 'floor');
  r.route('floor', 'burrow');
  r.route('land', 'hump');
  r.route('hump', 'east', { needs: [G], oneWay: true });
  r.route('east', 'low');
  r.route('low', 'den');
  r.route('low', 'ledge', { needs: [C] });
  r.route('ledge', 'cellar', { door: 'sc-cellar' });
  return r.finish();
}

function burrow(): Json {
  const r = new Wood('cn-burrow', 'The burrow', [860, 1216], 7502, {
    back: true,
    mood: 'deep',
    mass: 'ground',
  });
  r.hole(768, 0, 960, 512);
  r.cave(256, 448, 2944, 1216, { ceil: 128, w: 64, e: 64, corner: 128, skip: [[704, 1024]] });
  r.fill();
  // A burl under the shaft: the claws' way back up (no lamp here: her own light only).
  r.burl(704, 1216, 320, 576, 3);
  r.burl(1792, 1216, 512, 256, 2);
  r.stone('stone-deep', 2600, 1216, 'cn-deep');
  r.great('burrow-great', 2750, 1150);
  r.hoard('deep-', 2200, 1060, 200, 80, 4);
  r.place('in', 860, 1216);
  r.shotStops([
    ['in', 900, 1216],
    ['stone', 2400, 1216],
  ]);
  r.route('tunnel', 'in');
  r.route('in', 'tunnel', { needs: [C] });
  r.route('in', 'stone-deep');
  return r.finish();
}

function den(): Json {
  const r = new Wood('cn-den', 'The burrow under the roots', [300, 512], 7503, {
    back: true,
    mood: 'deep',
    mass: 'ground',
  });
  r.cave(0, 256, 640, 512, { ceil: 64, w: 0, e: 0, corner: 0 });
  // The arena: 2688 wide (a 21:9 view sees wall to wall), 896 tall, its roof bitten.
  r.cave(576, 448, 3264, 1344, { ceil: 96, w: 0, e: 0, corner: 128, skip: [[2816, 3136]] });
  r.gate('root-gate', 3264, 1088, 128, 256, 'cn-den-down');
  r.hole(3392, 1088, 3840, 1344);
  r.fill();
  // The balcony's face refuses the claws: down in the arena, the fight is the way on.
  r.noClaws(576, 512, 1344);
  // Escape ledges 192 px over the floor (its ram pulls up at a ledge's mouth), and the taproot by the gate.
  r.oneWay(1024, 1152, 256, 'branch');
  r.oneWay(2240, 1152, 256, 'branch');
  r.mass(2944, 448, 96, 808, false);
  r.patch('p-den', 300, 512);
  r.lamp('wick-den', 380, 380);
  r.enemy({
    id: 'old-burr',
    kind: 'oldBurrback',
    x: 1700,
    y: 1344,
    facing: -1,
    radius: 1300,
    sets: 'cn-den-down',
    taproot: [2944, 3040],
  });
  r.set('camera', {
    headroom: 0,
    zones: [{ id: 'arena', x: 448, y: 320, w: 2944, h: 1152, lock: true }],
  });
  r.landmark('arena', 'arena', 1900, 1344);
  r.landmark('root-gate', 'gate', 3328, 1344);
  r.place('balcony', 300, 512);
  r.place('floor', 1700, 1344);
  r.place('door', 3700, 1344);
  r.shotStops([
    ['balcony', 400, 512],
    ['floor', 1700, 1344],
    ['taproot', 2800, 1344],
    ['gate', 3400, 1344],
  ]);
  r.route('tunnel', 'balcony');
  r.route('balcony', 'p-den');
  r.route('balcony', 'floor', { oneWay: true });
  // (The gate opens on the old burrback's death: an enemy's `sets` the world check cannot see, so no flag here.)
  r.route('floor', 'door');
  r.route('door', 'out');
  return r.finish();
}

function out(): Json {
  const r = new Wood('cn-out', 'The way on', [300, 1344], 7504, {
    art: { anchorY: 1000, moon: { x: 2700, y: 760, r: 200 }, afterglow: { x: 2600, y: 900, strength: 1 } },
  });
  r.cave(0, 1088, 1280, 1344, { ceil: 64, w: 0, e: 0, corner: 0 });
  // The root chimney up to the top (thorns on alternate faces), the cliff's lip at 1792.
  r.hole(768, 640, 1280, 1344);
  r.hole(0, 0, 1792, 640);
  // The valley: the cliff falls 1600 px to a thorn bed; across it the next area's door on its ledge.
  r.hole(1792, 0, 3840, 2240);
  // Secret: a rotten wall at the chimney's foot, a passage and a shaft behind it down to the ledge's way.
  r.hole(1280, 1088, 1728, 1344);
  r.bark('ledge-wall', 1280, 1088, 64, 256);
  r.hole(1472, 1344, 1728, 2304);
  r.hole(0, 2048, 1728, 2304);
  r.gate('next-door', 3520, 832, 128, 256, 'cn-next');
  r.back(0, 640, 1792, 2432);
  r.fill();
  r.mass(3136, 1088, 704, 1152, false);
  r.noClaws(1792, 640, 2240);
  // The way back from the door: up the door-oak's east face, west along its high limb, a drop onto the clifftop.
  r.tree('door-oak', 3712, 128, 160, 1088, true, 'west');
  r.limb('return', 2048, 3552, 192, {
    parent: 'door-oak',
    grows: 'west',
    end: 'snap',
    h: 80,
    from: [3712, 220],
  });
  r.limbNoClaws(2048, 3552, 192);
  r.thorns('thorn-valley', 1792, 2240, 1344);
  r.mass(768, 1216, 128, 128);
  r.thornsUp('thorn-o1', 1252, 700, 300);
  r.patch('p-out', 420, 640);
  r.lamp('wick-door', 3280, 900);
  r.add('triggers', { id: 'way-on', x: 3328, y: 800, w: 160, h: 288, sets: 'cn-area-end' });
  r.landmark('vista', 'vista', 1700, 640);
  r.landmark('valley', 'valley', 1792, 640, 2048, 1600);
  r.landmark('mountain', 'mountain', 2900, 420);
  r.landmark('next-door', 'arch', 3584, 1088);
  r.cover('ledge-cover', 1280, 1024, 512, 384, 'ledge-wall');
  r.cover('ledge-cover-2', 0, 1344, 1792, 1024, 'ledge-wall');
  r.place('in', 300, 1344);
  r.place('foot', 900, 1344);
  r.place('top', 1500, 640);
  r.place('low', 700, 2304);
  r.place('door', 3400, 1088);
  r.shotStops([
    ['in', 400, 1344],
    ['chimney', 1000, 1000],
    ['top', 1300, 640],
    ['valley', 2500, 1000],
    ['door', 3400, 1088],
  ]);
  r.route('den', 'in');
  r.route('in', 'foot');
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
  r.great('ledge-great', 450, 1080);
  r.hoard('ledge-', 600, 980, 240, 80, 5);
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
