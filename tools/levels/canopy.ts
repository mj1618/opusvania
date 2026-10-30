/**
 * The Canopy v2 (docs/design/levels/first-area.md; review round 1: docs/design/levels/reviews/canopy-r1.md). Writes
 * content/worlds/canopy-rooms.json and content/worlds/canopy.json:
 *   npx tsx tools/levels/canopy.ts && npx biome format --write content/worlds/canopy*.json
 * Edit this file, never the JSON.
 *
 * v2 is **mass with rooms carved out** (the references' maps are black mass with beige carved into it): every room
 * starts solid and its caves are carved (`air`), then `fill()` cuts what is left into `root` / `ground` rects that
 * the wood kit paints as bulk (src/render/scene/lib/pf-mass.ts). Limbs (`limb`) and trees (`tree`) stand in the
 * carved air as before. Exits come from one link table (`LINKS`): each link names two placed rooms and the shared
 * opening, and both mirrors are written from it with equal spans (the Downwood generator's way).
 *
 * The area (world px; one screen = 1920 x 1080); `*` = on the critical path:
 *   * hatch (the opening, wood-hatch as it is) -> * hub (the Crossing: landing, save, seed door with 3 sockets)
 *   west: * trunk (down inside a fallen giant, seed 1) -> * well (the Elder's shaft: claws at the bottom; the
 *         ambush hollow at the top, woken by the claws) -> * limbs (the upper way back to the hub's high limb)
 *         rot (the rot hall, a second way down) > crawl (moonDrop), elder (moonDrop)
 *   east: * fork (the open fork) -> * grove (behind a claw climb: the arena-pit, seed 2) -> * spire (the hawker's
 *         face) > cellar (moonDrop), hollowroot (a moth-stone), nook (a moth-stone)
 *   high: * bower (arrival, the kin climb) -> * crown (glide, the moon) ; * gap (the vista: the far limb, seed 3,
 *         the drop into the hub) > attic (long breath), sky (night eyes)
 *   deep: * tunnel (under the seed door: the root tunnel) -> * den (the old burrback's closed arena) -> * out (the
 *         reveal) > burrow (a moth-stone), ledge (a hoard behind a real wall)
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

/** Every room's world rect. */
export const PLACE: Record<string, Box> = {
  'cn-hatch': { x: 0, y: 0, w: 7424, h: 2816 },
  'cn-hub': { x: 4352, y: 2816, w: 4480, h: 2048 },
  'cn-limbs': { x: 1152, y: 2816, w: 3200, h: 1152 },
  'cn-trunk': { x: 1152, y: 3968, w: 3200, h: 1920 },
  'cn-well': { x: -768, y: 2816, w: 1920, h: 4224 },
  'cn-rot': { x: 1152, y: 5888, w: 2688, h: 1152 },
  'cn-crawl': { x: 1792, y: 7040, w: 1792, h: 1024 },
  'cn-elder': { x: -1920, y: 5888, w: 1152, h: 1152 },
  'cn-fork': { x: 8832, y: 2816, w: 3200, h: 1408 },
  'cn-cellar': { x: 9600, y: 4224, w: 1920, h: 896 },
  'cn-grove': { x: 12032, y: 2816, w: 3840, h: 1920 },
  'cn-hollowroot': { x: 14400, y: 4736, w: 1472, h: 1152 },
  'cn-spire': { x: 15872, y: 2560, w: 1664, h: 2176 },
  'cn-nook': { x: 17536, y: 3200, w: 1920, h: 1152 },
  'cn-bower': { x: 12800, y: 896, w: 4736, h: 1664 },
  'cn-crown': { x: 12800, y: -1024, w: 2560, h: 1920 },
  'cn-attic': { x: 16000, y: 0, w: 1536, h: 896 },
  'cn-gap': { x: 8448, y: 512, w: 4352, h: 2304 },
  'cn-sky': { x: 10880, y: -512, w: 1920, h: 1024 },
  'cn-tunnel': { x: 5888, y: 4864, w: 3712, h: 2176 },
  'cn-burrow': { x: 7040, y: 7040, w: 1920, h: 1024 },
  'cn-den': { x: 9600, y: 5888, w: 2880, h: 1536 },
  'cn-out': { x: 12480, y: 4736, w: 1920, h: 2688 },
  'cn-ledge': { x: 14400, y: 5888, w: 1920, h: 1536 },
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
  // The hatch's drop (wood-hatch's own exit: 6144-7424 on its floor) into the Crossing.
  { a: 'cn-hatch', b: 'cn-hub', at: 6144, span: 1280, one: 'a', ida: 'drop', idb: 'hatch' },
  // The Crossing's ways: the fallen giant (low west), the upper limbs (high west), the fork (east), the seed door.
  { a: 'cn-hub', b: 'cn-trunk', at: 4352 },
  { a: 'cn-hub', b: 'cn-limbs', at: 3392 },
  { a: 'cn-hub', b: 'cn-fork', at: 4096 },
  { a: 'cn-hub', b: 'cn-tunnel', at: 6592, ida: 'door', idb: 'hub' },
  { a: 'cn-gap', b: 'cn-hub', at: 8512, one: 'a' },
  // West.
  { a: 'cn-trunk', b: 'cn-well', at: 5632 },
  { a: 'cn-trunk', b: 'cn-rot', at: 2496, span: 192, one: 'a' },
  { a: 'cn-limbs', b: 'cn-well', at: 3584 },
  { a: 'cn-rot', b: 'cn-well', at: 6976 },
  { a: 'cn-rot', b: 'cn-crawl', at: 2048, span: 192 },
  { a: 'cn-elder', b: 'cn-well', at: 6528 },
  // East.
  { a: 'cn-fork', b: 'cn-grove', at: 3392 },
  { a: 'cn-fork', b: 'cn-cellar', at: 9984, span: 192 },
  { a: 'cn-gap', b: 'cn-fork', at: 11008, one: 'a' },
  { a: 'cn-grove', b: 'cn-spire', at: 4288 },
  { a: 'cn-grove', b: 'cn-hollowroot', at: 14592, span: 192 },
  { a: 'cn-spire', b: 'cn-nook', at: 3840 },
  // High.
  { a: 'cn-bower', b: 'cn-spire', at: 16448, span: 384 },
  { a: 'cn-crown', b: 'cn-bower', at: 13824 },
  { a: 'cn-attic', b: 'cn-bower', at: 17152, span: 192 },
  { a: 'cn-gap', b: 'cn-bower', at: 1856 },
  { a: 'cn-sky', b: 'cn-gap', at: 11392, span: 192 },
  // Deep.
  { a: 'cn-tunnel', b: 'cn-den', at: 6720 },
  { a: 'cn-tunnel', b: 'cn-burrow', at: 7488, span: 192 },
  { a: 'cn-den', b: 'cn-out', at: 7168 },
  { a: 'cn-out', b: 'cn-ledge', at: 6336 },
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

// ---------------------------------------------------------------------------------------------------------------
// A wood room: carved out of mass, with limbs and trees in the air.

type Mood = 'cool' | 'warm' | 'deep';

class Wood extends RoomBuilder {
  private n = 0;
  readonly W: number;
  readonly H: number;
  /** The carved air (x, y, w, h), before `fill`. */
  private readonly caves: Box[] = [];
  private filled = false;
  readonly ex: Map<string, Exit>;

  constructor(
    id: string,
    title: string,
    spawn: [number, number],
    seed: number,
    o: {
      art?: Json;
      mood?: Mood;
      /** `ground` = packed earth (the den), `root` = the wood's heartwood and roots. */
      mass?: 'root' | 'ground';
      /** The whole room has a back wall (inside the wood or the earth: no sky). */
      back?: boolean;
    } = {},
  ) {
    const P = PLACE[id] as Box;
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
        ...(o.art ?? {}),
      },
    });
    this.W = P.w;
    this.H = P.h;
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

  /** A block of mass standing in the air (a pillar, a burl, a hump), painted as the room's bulk. */
  mass(x: number, y: number, w: number, h: number, kick?: boolean | 'east' | 'west'): this {
    return this.solid(x, y, w, h, this.massTag, kick);
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
   * from `parent` (a tree, another limb, or '' for the mass it sinks into) at its `grows` root end.
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
      from: [root, top + 20],
      grows: o.grows,
      end: o.end,
      y0: top + Math.min(0, tilt) - 40,
      y1: top + Math.max(0, tilt) + 40,
    });
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

  /** Lifts any glint that ended up inside a solid clear of it; returns the data. */
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

  place(id: string, x: number, y: number, note?: string): this {
    return this.mark('places', note ? { id, x, y, note } : { id, x, y });
  }

  /** What hides a secret space; `opens`: what lifts it for good (a bark id, a hollow id). */
  cover(id: string, x: number, y: number, w: number, h: number, opens?: string): this {
    return this.mark('covers', opens ? { id, x, y, w, h, opens } : { id, x, y, w, h });
  }

  landmark(id: string, kind: string, x: number, y: number): this {
    return this.mark('landmarks', { id, kind, x, y });
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

  /** A dangler tied under the underside at `under`. */
  dangler(id: string, x: number, under: number, facing: 1 | -1, more: Json = {}): this {
    return this.enemy({ id, kind: 'dangler', x, y: under + 8, facing, senses: 'always', ...more });
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

  shotStops(stops: Array<[string, number, number]>): this {
    return this.set('shots', {
      wide: stops.map(([name, x, y]) => ({ name, x, y })),
      closeup: { ground: [stops[0]?.[1] ?? 0, stops[0]?.[2] ?? 0] },
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The hatching branch: wood-hatch's layout as it is (the opening is quiet in every reference); its drop leads into
// the Crossing.

function hatch(): Json {
  const src = JSON.parse(readFileSync('content/rooms/wood-hatch.json', 'utf8')) as Json;
  return { ...src, id: 'cn-hatch', title: 'The hatching branch', abilities: [] };
}

// ---------------------------------------------------------------------------------------------------------------
// The Crossing (hub, 4480 x 2048): she falls from the hatch onto the Fork, the save under her. From the landing
// she sees the seed door in the root floor 384 px below (three sockets; a lamp on the lampoak lights for each seed
// held), the high west limb broken off over a sheer face (claws: "up there, later"), the low west mouth into the
// fallen giant and the east limb to the fork. Quiet (Dirtmouth): no creature; Tatter keeps the door. Open over the
// roots: one of the area's three vistas.

function hub(): Json {
  const r = new Wood('cn-hub', 'The Crossing', [2000, 1152], 7101, { mood: 'warm', art: { anchorY: 1100 } });
  r.air(896, 0, 3904, 1536);
  r.air(3904, 0, 4480, 1280);
  r.air(0, 0, 896, 576);
  // The low west mouth under the high block (to the fallen giant).
  r.air(0, 1280, 896, 1536);
  // The seed door's shaft under the gate.
  r.air(2240, 1600, 2496, 2048);
  r.gate('seed-door', 2240, 1536, 256, 64, 'seeds:3');
  r.back(0, 1280, 896, 1536);
  r.back(0, 1536, 4480, 2048);
  r.back(3904, 1280, 4480, 1536);
  // Secret: a root cellar under a rotten floor panel near the door (the Crossing's moth-stone).
  r.bark('cache-floor', 3456, 1536, 192, 64, true);
  r.air(3264, 1600, 3904, 1760);
  // Secret: a hollow in the east root bank behind a wall of rotten heartwood.
  r.air(3968, 1344, 4416, 1536);
  r.bark('bank-wall', 3904, 1344, 64, 192);
  r.fill();
  r.tree('lampoak', 2560, 288, -500, 1536, false);
  r.limb('fork-w', 1152, 2560, 1152, { parent: 'lampoak', grows: 'west', end: 'snap', flat: [[1792, 2240]] });
  r.limb('fork-e', 2848, 3712, 1216, { parent: 'lampoak', grows: 'east', end: 'knee' });
  r.limb('e1', 3712, 3904, 1280, { parent: 'fork-e', grows: 'east', end: 'trunk', h: 64, calm: true });
  r.oneWay(2610, 1344, 192, 'branch');
  r.oneWay(1120, 1344, 192, 'branch');
  r.patch('p-crossing', 2000, 1152);
  // (Her feet high in the frame here: from the landing the seed door in the root floor is in view.)
  r.set('camera', { anchorY: 0.4 });
  // A lamp on the lampoak for each seed held: the hub changes on every return.
  r.lamp('socket-1', 2640, 860, { after: 'seeds:1' });
  r.lamp('socket-2', 2780, 760, { after: 'seeds:2' });
  r.lamp('socket-3', 2700, 640, { after: 'seeds:3' });
  r.stone('stone-heart', 3400, 1760, 'cn-heart');
  r.hoard('cache-', 3600, 1640, 240, 80, 6);
  r.cover('cache-cover', 3200, 1536, 768, 288, 'cache-floor');
  r.add('pickups', { id: 'bank-great', kind: 'great', x: 4300, y: 1460 });
  r.hoard('bank-', 4040, 1420, 200, 70, 5);
  r.cover('bank-cover', 3968, 1280, 512, 320, 'bank-wall');
  r.arc('gap-', 2480, 2900, 1180, 120, 5);
  r.glints('fork-', [
    [1400, 1110],
    [1520, 1100],
    [1640, 1110],
  ]);
  r.set('marks', { ...(r.data.marks as Json), tatter: { x: 1660, y: 1152, facing: 1, want: [2368, 1536] } });
  r.landmark('seed-door', 'goal', 2368, 1536);
  r.place('mid', 2000, 1152);
  r.place('roots', 1700, 1536);
  r.place('high', 600, 576);
  r.shotStops([
    ['landing', 2000, 1152],
    ['door', 2400, 1536],
    ['west', 1000, 1536],
    ['high', 700, 576],
    ['east', 3800, 1280],
  ]);
  r.route('mid', 'roots');
  r.route('roots', 'mid');
  r.route('roots', 'trunk');
  r.route('trunk', 'roots');
  r.route('mid', 'fork');
  r.route('fork', 'mid');
  r.route('mid', 'p-crossing');
  r.route('hatch', 'mid', { oneWay: true });
  r.route('gap', 'mid', { oneWay: true });
  r.route('high', 'limbs');
  r.route('limbs', 'high');
  r.route('high', 'roots', { oneWay: true });
  r.route('roots', 'high', { needs: ['wallJump'] });
  r.route('roots', 'stone-heart');
  r.route('roots', 'door', { flags: ['seeds:3'] });
  r.route('door', 'roots', { needs: ['wallJump'] });
  return r.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// West. The fallen giant (trunk): down inside a hollow trunk in three tiers (each drop too high to climb back),
// thorns, a lampwing over them, seed 1 in an alcove up in its roof; a rotten panel in the second tier drops to the
// rot hall. The well: the Elder's shaft, the claws at the bottom (far and low), the climb back up the shaft into the
// ambush hollow (a burrback pair and a lampwing, woken by the claws), out by the claw face. The upper limbs: the way
// home along the giant's back to the Crossing's high limb (the first loop).

function trunk(): Json {
  const r = new Wood('cn-trunk', 'The fallen giant', [2900, 384], 7202, {
    back: true,
    mood: 'deep',
    art: { anchorY: 900 },
  });
  r.air(2560, 128, 3200, 384);
  // Tier 1: the hall inside the giant; the seed's alcove up in its roof over two root steps.
  r.air(1536, 192, 2624, 704);
  r.air(1600, 64, 1792, 320);
  // Tier 2, under a low roof; a rotten panel in its floor over the drop to the rot hall.
  r.air(512, 576, 1536, 1024);
  r.bark('rot-panel', 1344, 1024, 192, 64, true);
  r.air(1344, 1088, 1536, 1920);
  // The drop to tier 3, and tier 3 out west to the well.
  r.air(512, 1024, 640, 1216);
  r.air(0, 1216, 832, 1664);
  r.fill();
  r.mass(1856, 512, 192, 192);
  r.mass(1600, 320, 192, 384);
  r.add('moonseeds', { id: 'seed-giant', x: 1696, y: 230 });
  r.thorns('thorn-t1', 2112, 704, 160);
  r.thorns('thorn-t2', 896, 1024, 192);
  r.thornsUnder('thorn-roof', 1056, 576, 224);
  r.thorns('thorn-t3', 224, 1664, 192);
  r.juvenile('juv-t1', 2380, 704, -1, 180);
  r.flyer('lampwing', 'wing-t2', 1000, 800, -1, { radius: 220 });
  r.lamp('wick-t2', 1240, 720);
  r.burrback('burr-t2', 780, 1024, 1, 100, { fenced: true });
  r.dangler('dang-t1', 1960, 192, -1);
  r.arc('t2-', 860, 1140, 990, 90, 4);
  r.arc('t3-', 180, 470, 1630, 80, 4);
  r.glints('t1-', [
    [2450, 660],
    [2300, 660],
  ]);
  r.pod('pod-t1', 1950, 512);
  r.cover('rot-shaft', 1280, 1088, 320, 832, 'rot-panel');
  r.place('top', 2900, 384);
  r.place('t1', 2200, 704);
  r.place('t2', 1200, 1024);
  r.place('t3', 600, 1664);
  r.shotStops([
    ['entry', 2900, 384],
    ['seed', 1900, 704],
    ['thorns', 1000, 1024],
    ['low', 500, 1664],
  ]);
  r.route('hub', 'top');
  r.route('top', 'hub');
  r.route('top', 't1', { oneWay: true });
  r.route('t1', 'seed-giant');
  r.route('t1', 't2', { oneWay: true });
  r.route('t2', 't3', { oneWay: true });
  r.route('t2', 'rot');
  r.route('t3', 'well');
  r.route('well', 't3');
  return r.finish();
}

function well(): Json {
  const r = new Wood('cn-well', "The Elder's well", [960, 4160], 7203, {
    back: true,
    art: { anchorY: 2400 },
  });
  // The shaft up the Elder to its floor, far and low (the claws), the rot hall's way in at its foot.
  r.air(704, 1408, 1216, 4160);
  r.air(1216, 3904, 1920, 4160);
  // The west wall's notch: a rotten plug, the Elder's root room behind it.
  r.air(128, 3456, 704, 3712);
  r.bark('elder-plug', 64, 3456, 64, 256);
  r.air(704, 1152, 960, 1408);
  // The giant's mouth on the east wall.
  r.air(1216, 2560, 1920, 2816);
  // The ambush hollow and its way out (the claw face east, the limbs beyond).
  r.air(192, 384, 1728, 1152);
  r.air(1728, 448, 1920, 768);
  r.fill();
  r.mass(704, 2496, 96, 32);
  r.mass(1120, 1856, 96, 32);
  r.add('glades', { id: 'glade-claws', x: 990, y: 3936, w: 216, h: 224, ability: 'wallJump' });
  r.patch('p-well', 820, 4160);
  r.add('pickups', { id: 'claw-prize', kind: 'great', x: 1160, y: 3000 });
  r.add('thorns', { id: 'thorn-w1', x: 704, y: 2900, w: 28, h: 256 });
  r.add('thorns', { id: 'thorn-w2', x: 1188, y: 2000, w: 28, h: 224 });
  r.thorns('thorn-floor', 1500, 4160, 160);
  // The ambush: woken by the claws.
  r.burrback('burr-am-1', 1150, 1152, 1, 160, { wakes: 'wallJump', fenced: true });
  r.burrback('burr-am-2', 1560, 1152, -1, 140, { wakes: 'wallJump', fenced: true });
  r.flyer('lampwing', 'wing-am', 900, 700, 1, { radius: 260, wakes: 'wallJump' });
  r.juvenile('juv-am', 420, 1152, 1, 160, { wakes: 'wallJump' });
  r.glints('shaft-', [
    [960, 3300],
    [960, 2700],
    [960, 2300],
    [960, 1900],
  ]);
  r.cover('elder-cover', 0, 3392, 128, 384, 'elder-plug');
  r.place('bottom', 900, 4160);
  r.place('mouth', 1600, 2816);
  r.place('hollow', 500, 1152);
  r.place('top', 1850, 768);
  r.shotStops([
    ['bottom', 900, 4160],
    ['shaft', 960, 3000],
    ['mouth', 1500, 2816],
    ['hollow', 1300, 1152],
  ]);
  r.route('trunk', 'mouth');
  r.route('mouth', 'trunk');
  r.route('mouth', 'bottom', { oneWay: true });
  r.route('rot', 'bottom');
  r.route('bottom', 'rot');
  r.route('bottom', 'glade-claws');
  r.route('bottom', 'p-well');
  r.route('bottom', 'elder', { needs: ['wallJump'] });
  r.route('elder', 'bottom');
  r.route('bottom', 'hollow', { needs: ['wallJump'] });
  r.route('hollow', 'bottom');
  r.route('bottom', 'mouth', { needs: ['wallJump'] });
  r.route('hollow', 'top', { needs: ['wallJump'] });
  r.route('top', 'hollow');
  r.route('top', 'limbs');
  r.route('limbs', 'top');
  return r.finish();
}

function limbs(): Json {
  const r = new Wood('cn-limbs', 'The upper limbs', [200, 768], 7204, { back: true, art: { anchorY: 640 } });
  r.air(0, 256, 3200, 1024);
  r.air(2368, 0, 2944, 256);
  // Secret: a niche up in the roof over the second limb (its shelf at 320, the hole beside it).
  r.air(1728, 128, 2240, 320);
  r.fill();
  r.mass(0, 768, 384, 256);
  r.mass(1408, 256, 320, 128);
  r.mass(1856, 320, 384, 64);
  r.mass(2880, 576, 320, 448);
  r.limb('l1', 384, 1088, 768, { grows: 'east', end: 'snap' });
  r.limb('l2', 1408, 2176, 576, { grows: 'east', end: 'snap', h: 80, calm: true });
  // The chimney: a stump and a tall trunk; she kicks up the trunk's west face (claws) and drops onto the last limb.
  r.tree('stump', 2240, 96, 704, 1024, true);
  r.tree('tall', 2560, 128, 320, 1024, true, 'west');
  r.limb('l3', 2688, 2880, 448, { parent: 'tall', grows: 'east', end: 'burl', h: 80, calm: true });
  r.thorns('thorn-g1', 1110, 1024, 260);
  r.thorns('thorn-g2', 2336, 1024, 224);
  r.thorns('thorn-g3', 520, 1024, 200);
  r.flyer('lampwing', 'wing-g1', 1280, 520, -1, { radius: 220 });
  r.dangler('dang-l2', 1560, 384, 1);
  r.stone('stone-west', 2000, 320, 'cn-west');
  r.hoard('niche-', 2060, 190, 160, 60, 4);
  r.cover('niche-cover', 1664, 64, 640, 256);
  r.arc('g1-', 1040, 1520, 720, 140, 5);
  r.arc('ch-', 2180, 2560, 600, 120, 4);
  r.place('west', 200, 768);
  r.place('east', 3000, 576);
  r.shotStops([
    ['west', 400, 768],
    ['gap', 1300, 576],
    ['chimney', 2400, 704],
    ['east', 3000, 576],
  ]);
  r.route('well', 'west');
  r.route('west', 'well');
  r.route('west', 'east', { needs: ['wallJump'] });
  r.route('east', 'west');
  r.route('east', 'hub');
  r.route('hub', 'east');
  r.route('west', 'stone-west');
  return r.finish();
}

function rot(): Json {
  const r = new Wood('cn-rot', 'The rot hall', [1440, 1088], 7205, {
    back: true,
    mood: 'deep',
    art: { anchorY: 800 },
  });
  r.air(1344, 0, 1536, 576);
  r.air(0, 576, 2560, 1088);
  r.bark('rot-wall', 640, 832, 64, 256);
  r.bark('crawl-panel', 896, 1088, 192, 64, true);
  r.bark('rot-cache', 2176, 832, 64, 256);
  r.fill();
  r.burrback('burr-rot', 1800, 1088, -1, 220, { fenced: true });
  r.dangler('dang-rot', 760, 576, 1);
  r.lamp('wick-rot', 1300, 760);
  r.thorns('thorn-r1', 1600, 1088, 128);
  r.thornsUnder('thorn-r2', 1080, 576, 200);
  r.thornsUnder('thorn-r3', 1900, 576, 180);
  r.hoard('cache-', 2280, 940, 220, 100, 8);
  r.add('pickups', { id: 'cache-great', kind: 'great', x: 2460, y: 1020 });
  r.cover('cache-cover', 2240, 512, 448, 576, 'rot-cache');
  r.pod('pod-rot', 1200, 1088);
  r.glints('hall-', [
    [400, 1040],
    [300, 1040],
  ]);
  r.place('hall', 1440, 1088);
  r.place('west', 300, 1088);
  r.shotStops([
    ['hall', 1440, 1088],
    ['wall', 800, 1088],
    ['cache', 2000, 1088],
  ]);
  r.route('trunk', 'hall', { oneWay: true });
  r.route('hall', 'west');
  r.route('west', 'hall');
  r.route('west', 'well');
  r.route('well', 'west');
  r.route('hall', 'crawl');
  r.route('crawl', 'hall');
  return r.finish();
}

function crawl(): Json {
  const r = new Wood('cn-crawl', 'The crawlspace', [352, 160], 7206, {
    back: true,
    mood: 'deep',
    art: { anchorY: 400 },
  });
  r.air(192, 0, 512, 160);
  r.air(448, 64, 1216, 160);
  r.air(1216, 0, 1664, 352);
  r.fill();
  r.hollow('drop-crawl', 1500, 352, 'moonDrop');
  r.hoard('crawl-', 640, 100, 480, 40, 6);
  r.mass(1216, 160, 192, 32);
  r.place('in', 352, 160);
  r.shotStops([
    ['in', 352, 160],
    ['hollow', 1450, 352],
  ]);
  r.route('rot', 'in');
  r.route('in', 'rot');
  r.route('in', 'drop-crawl');
  return r.finish();
}

function elder(): Json {
  const r = new Wood('cn-elder', "The Elder's root room", [1000, 640], 7207, {
    back: true,
    mood: 'deep',
    art: { anchorY: 600 },
  });
  r.air(704, 384, 1152, 640);
  r.air(128, 256, 896, 896);
  r.fill();
  r.mass(448, 768, 256, 128);
  r.hollow('drop-elder', 300, 896, 'moonDrop');
  r.hoard('elder-', 520, 700, 140, 50, 4);
  r.place('in', 1000, 640);
  r.shotStops([
    ['in', 900, 640],
    ['hollow', 400, 896],
  ]);
  r.route('well', 'in');
  r.route('in', 'well');
  r.route('in', 'drop-elder');
  return r.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// East. The fork: open over the roots, two juveniles, a root knoll; a rotten panel in its floor over the cellar; a
// moth-stone up in the west wall; at its east end a pit and the claw face up to the Grove (the Grove is the reward
// for the claws). The Grove: a closed arena-pit in tiers, lamplit, at grove density, the seed on the Grovemother's
// crown (a claw climb), caps to climb back, a rotten panel in the pit floor over a pocket. The Spire: the climb up
// the Spire's face with a hawker on it, a hollow in the trunk on the way.

function fork(): Json {
  const r = new Wood('cn-fork', 'The east fork', [400, 1280], 7301, { art: { anchorY: 900 } });
  r.air(768, 448, 2880, 1280);
  r.air(1920, 0, 2880, 448);
  r.air(0, 1024, 768, 1280);
  r.back(0, 576, 768, 1280);
  r.back(1152, 1280, 1344, 1408);
  // The moth-stone's pocket up in the west wall, its mouth over a limb.
  r.air(192, 576, 768, 896);
  r.air(2560, 1280, 2880, 1344);
  r.air(2880, 320, 3200, 576);
  r.bark('cellar-panel', 1152, 1280, 192, 64, true);
  r.fill();
  r.mass(1664, 1088, 384, 192);
  r.limb('ledge', 768, 1216, 1088, { grows: 'east', end: 'tip', h: 80 });
  r.thorns('thorn-pit', 2560, 1344, 320);
  r.juvenile('juv-w', 960, 1280, 1, 180);
  r.juvenile('juv-e', 2300, 1280, -1, 220);
  r.stone('stone-east', 400, 896, 'cn-east');
  r.hoard('stone-', 520, 820, 160, 60, 4);
  r.cover('stone-cover', 128, 512, 640, 448);
  r.arc('knoll-', 1500, 1700, 1100, 120, 4);
  r.arc('pit-', 2500, 2900, 1150, 160, 5);
  r.pod('pod-knoll', 1856, 1088);
  r.place('mid', 1000, 1280);
  r.place('top', 3050, 576);
  r.shotStops([
    ['entry', 400, 1280],
    ['knoll', 1700, 1280],
    ['face', 2500, 1280],
  ]);
  r.route('hub', 'mid');
  r.route('mid', 'hub');
  r.route('gap', 'mid', { oneWay: true });
  r.route('mid', 'cellar');
  r.route('cellar', 'mid');
  r.route('mid', 'stone-east');
  r.route('mid', 'top', { needs: ['wallJump'] });
  r.route('top', 'mid');
  r.route('top', 'grove');
  r.route('grove', 'top');
  return r.finish();
}

function cellar(): Json {
  const r = new Wood('cn-cellar', 'The root cellar', [480, 128], 7302, {
    back: true,
    mood: 'deep',
    art: { anchorY: 500 },
  });
  r.air(320, 0, 640, 128);
  r.air(640, 0, 1792, 480);
  r.fill();
  r.mass(640, 288, 192, 192);
  r.mass(1536, 288, 256, 192);
  r.hollow('drop-cellar', 1660, 288, 'moonDrop');
  r.juvenile('juv-cellar', 1200, 480, 1, 200);
  r.thorns('thorn-c1', 900, 480, 128);
  r.hoard('cellar-', 1000, 340, 300, 60, 5);
  r.place('in', 480, 128);
  r.shotStops([
    ['in', 500, 128],
    ['floor', 1200, 480],
  ]);
  r.route('fork', 'in');
  r.route('in', 'fork');
  r.route('in', 'drop-cellar');
  return r.finish();
}

function grove(): Json {
  const r = new Wood('cn-grove', 'The Lamp Grove', [300, 576], 7303, {
    mood: 'warm',
    art: { anchorY: 1100, moon: { x: 1500, y: -400, r: 60 }, afterglow: { x: 900, y: 900, strength: 0.25 } },
  });
  r.air(0, 320, 704, 576);
  r.air(0, 192, 3840, 320);
  r.air(704, 192, 3200, 800);
  r.air(1088, 192, 3200, 1024);
  r.air(1472, 192, 3200, 1600);
  r.air(3200, 192, 3840, 1472);
  r.bark('pit-panel', 2560, 1600, 192, 64, true);
  r.back(2560, 1600, 2752, 1920);
  r.air(2560, 1664, 2752, 1920);
  r.cap('cap-w', 1536, 1536, 128, 'big');
  r.cap('cap-e', 3008, 1536, 128, 'mid');
  r.fill();
  r.tree('mother', 2208, 192, 704, 1600, true, true);
  r.limb('crown-w', 1792, 2016, 704, { grows: 'west', end: 'snap', h: 80, flat: [[1792, 2016]] });
  r.limb('crown-e', 2592, 2848, 704, { grows: 'east', end: 'snap', h: 80, flat: [[2592, 2848]] });
  r.add('moonseeds', { id: 'seed-grove', x: 2760, y: 640 });
  r.hollow('keen-hollow', 1900, 704, 'keenBlade');
  r.lamp('wick-a', 1760, 1180);
  r.lamp('wick-b', 2900, 1120);
  r.lamp('wick-c', 3500, 900);
  r.juvenile('juv-w2', 900, 800, 1, 150);
  r.burrback('burr-pit-w', 1900, 1600, 1, 260);
  r.burrback('burr-pit-e', 2950, 1600, -1, 200, { fenced: true });
  r.flyer('lampwing', 'wing-a', 1700, 900, 1, { radius: 220 });
  r.flyer('lampwing', 'wing-b', 3300, 1000, -1, { radius: 220 });
  r.dangler('dang-crown', 2650, 192, -1);
  r.flyer('hawker', 'hawk-e', 3600, 700, -1, { radius: 260 });
  r.thorns('thorn-p1', 2420, 1600, 140);
  r.thorns('thorn-e1', 3300, 1472, 160);
  r.thornsUnder('thorn-roof', 1400, 192, 256);
  r.arc('w-', 640, 1180, 720, 120, 5);
  r.arc('mother-', 1700, 2208, 680, 180, 6);
  r.glints('pit-', [
    [1700, 1560],
    [2000, 1555],
    [2400, 1560],
    [2860, 1555],
    [3150, 1560],
  ]);
  r.pod('pod-w2', 1000, 800);
  r.pod('pod-crown', 2660, 704);
  r.pod('pod-e', 3700, 1472);
  r.pod('pod-hang', 2000, 192, 1200, 'hang');
  r.cover('pit-shaft', 2496, 1664, 320, 256, 'pit-panel');
  r.place('mid', 300, 576);
  r.place('pit', 2000, 1600);
  r.place('east', 3600, 1472);
  r.place('crown', 2400, 704);
  r.shotStops([
    ['entry', 400, 576],
    ['tiers', 1100, 1024],
    ['pit', 2200, 1600],
    ['crown', 2400, 704],
    ['east', 3500, 1472],
  ]);
  r.route('fork', 'mid');
  r.route('mid', 'fork');
  r.route('mid', 'pit', { oneWay: true });
  r.route('pit', 'mid');
  r.route('pit', 'east');
  r.route('east', 'pit');
  r.route('east', 'spire');
  r.route('spire', 'east');
  r.route('pit', 'crown', { needs: ['wallJump'] });
  r.route('crown', 'pit');
  r.route('crown', 'seed-grove');
  r.route('crown', 'keen-hollow');
  r.route('pit', 'hollowroot');
  r.route('hollowroot', 'pit', { needs: ['wallJump'] });
  return r.finish();
}

function hollowroot(): Json {
  const r = new Wood('cn-hollowroot', 'The hollow root', [600, 832], 7304, {
    back: true,
    mood: 'deep',
    art: { anchorY: 600 },
  });
  r.air(192, 0, 384, 832);
  r.air(384, 448, 1344, 832);
  r.fill();
  r.hollow('wings-hollow', 1150, 832, 'quickWings');
  r.hoard('root-', 600, 720, 360, 80, 8);
  r.add('pickups', { id: 'root-great', kind: 'great', x: 1250, y: 700 });
  r.thorns('thorn-h1', 800, 832, 96);
  r.place('in', 600, 832);
  r.shotStops([['in', 700, 832]]);
  r.route('grove', 'in');
  r.route('in', 'grove', { needs: ['wallJump'] });
  r.route('in', 'wings-hollow');
  return r.finish();
}

function spire(): Json {
  const r = new Wood('cn-spire', 'The Spire', [200, 1728], 7305, { back: true, art: { anchorY: 1100 } });
  // A chimney up the Spire's heart, thorns on alternate faces (she changes wall twice), the hawker in it.
  r.air(0, 1472, 576, 1728);
  r.air(576, 0, 960, 1728);
  // A hollow through the Spire's trunk (to the nook), its mouth in the east face she climbs.
  r.air(960, 1024, 1664, 1280);
  r.fill();
  r.add('thorns', { id: 'thorn-s1', x: 576, y: 1300, w: 28, h: 300 });
  r.add('thorns', { id: 'thorn-s2', x: 932, y: 560, w: 28, h: 300 });
  r.flyer('hawker', 'hawk-spire', 768, 820, -1, { radius: 300 });
  r.cover('nook-cover', 960, 960, 704, 384);
  r.glints('climb-', [
    [700, 1200],
    [820, 900],
    [700, 560],
  ]);
  r.place('base', 200, 1728);
  r.place('top', 768, 200);
  r.shotStops([
    ['base', 400, 1728],
    ['climb', 760, 1100],
    ['neck', 760, 448],
  ]);
  r.route('grove', 'base');
  r.route('base', 'grove');
  r.route('base', 'top', { needs: ['wallJump'] });
  r.route('top', 'base');
  r.route('top', 'bower');
  r.route('bower', 'top');
  r.route('base', 'nook', { needs: ['wallJump'] });
  r.route('nook', 'base');
  return r.finish();
}

function nook(): Json {
  const r = new Wood('cn-nook', 'The Spire nook', [200, 640], 7306, {
    back: true,
    mood: 'deep',
    art: { anchorY: 600 },
  });
  r.air(0, 384, 1024, 640);
  r.air(768, 128, 1664, 896);
  r.fill();
  r.mass(1024, 640, 256, 256);
  r.stone('stone-high', 1400, 896, 'cn-high');
  r.hoard('nook-', 900, 300, 600, 120, 8);
  r.place('in', 200, 640);
  r.shotStops([['in', 600, 640]]);
  r.route('spire', 'in');
  r.route('in', 'spire');
  r.route('in', 'stone-high');
  return r.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// High. The bower: she comes up out of the Spire into a leafy hall roofed in heartwood; west, the kin column's
// claw face (a thorn band on its lower third, a hawker on it) up to the crown; a hollow in the column. The crown:
// the one cold-white moon room, a dead end with the glide. The gap: the vista. A glide from the bower's shelf over
// the wide gap to the far limb (seed 3), whose end drops into the Crossing (the second loop); a fall lands in the
// gap's floor (claw back up, or drop to the fork). A roost on the glide line, its shaft up to the sky room.

function bower(): Json {
  const r = new Wood('cn-bower', 'The bower', [4250, 1536], 7401, { art: { anchorY: 1100 } });
  r.back(2560, 0, 4736, 1664);
  // The arrival hall under its roof, the middle, the kin column's west side (the way to the gap).
  r.air(1536, 384, 4544, 1536);
  r.air(4352, 0, 4544, 384);
  r.air(0, 256, 1280, 960);
  r.air(1024, 0, 1536, 256);
  r.air(1536, 0, 1856, 384);
  // The kin: a broken tree standing up through the hall (its faces the claw climb, its top the way to the crown).
  r.air(1280, 256, 1536, 1536);
  // Secret: a root hollow under the west ledge, through a rotten panel in its floor.
  r.bark('kin-panel', 448, 960, 192, 64, true);
  r.air(320, 1024, 960, 1216);
  r.fill();
  r.tree('kin', 1280, 256, 256, 1536, true, true);
  r.limb('upper', 2752, 3392, 896, { grows: 'east', end: 'snap', h: 80, calm: true });
  r.limb('kin-ledge', 1536, 2112, 1088, { parent: 'mass', grows: 'east', end: 'snap' });
  r.add('thorns', { id: 'thorn-kin', x: 1536, y: 1200, w: 28, h: 250 });
  r.thorns('thorn-b1', 2300, 1536, 192);
  r.thornsUnder('thorn-roof', 2600, 384, 200);
  r.flyer('hawker', 'hawk-kin', 1800, 700, -1, { radius: 280 });
  r.dangler('dang-arrive', 3100, r.top(3100, 896) + 80, 1);
  r.burrback('burr-bower', 2900, 1536, -1, 240, { fenced: true });
  r.hoard('kin-', 520, 1110, 320, 70, 6);
  r.add('pickups', { id: 'kin-great', kind: 'great', x: 860, y: 1170 });
  r.cover('kin-cover', 256, 1024, 768, 256, 'kin-panel');
  r.cover('attic-cover', 4288, 0, 256, 384);
  r.arc('hall-', 3100, 3500, 1500, 100, 4);
  r.arc('ledge-', 1600, 2000, 1050, 80, 4);
  r.pod('pod-upper', 3000, 896);
  r.place('arrive', 4250, 1536);
  r.place('top', 1400, 256);
  r.place('west', 600, 960);
  r.place('kin-hollow', 700, 1216);
  r.shotStops([
    ['arrive', 4250, 1536],
    ['hall', 2700, 1536],
    ['kin', 1800, 1088],
    ['top', 1400, 256],
    ['west', 500, 960],
  ]);
  r.route('spire', 'arrive');
  r.route('arrive', 'spire');
  r.route('arrive', 'top', { needs: ['wallJump'] });
  r.route('top', 'arrive');
  r.route('top', 'crown');
  r.route('crown', 'top');
  r.route('top', 'west');
  r.route('west', 'top', { needs: ['wallJump'] });
  r.route('west', 'gap');
  r.route('west', 'kin-hollow');
  r.route('kin-hollow', 'west');
  r.route('gap', 'west');
  r.route('arrive', 'attic', { needs: ['wallJump'] });
  r.route('attic', 'arrive');
  return r.finish();
}

function crown(): Json {
  const r = new Wood('cn-crown', 'The moon crown', [1150, 1792], 7402, {
    art: { anchorY: 1100, moon: { x: 1300, y: 620, r: 230 }, afterglow: { x: 1400, y: 900, strength: 0.2 } },
  });
  r.air(0, 0, 2560, 1792);
  r.fill();
  r.limb('c1', 1408, 1856, 1600, { grows: 'east', end: 'tip' });
  r.limb('c2', 1856, 2240, 1408, { grows: 'west', end: 'tip' });
  r.limb('c3', 1472, 1856, 1216, { grows: 'east', end: 'tip' });
  r.limb('c4', 1856, 2496, 1024, { grows: 'west', end: 'snap', flat: [[1950, 2300]] });
  r.add('glades', { id: 'glade-glide', x: 1980, y: 800, w: 400, h: 224, ability: 'glide' });
  r.patch('p-crown', 800, 1792);
  r.flyer('lampwing', 'wing-crown', 2100, 700, -1, { radius: 220 });
  r.arc('climb-', 1500, 1950, 1350, 100, 4);
  r.landmark('crown', 'landmark', 2200, 1024);
  r.place('in', 1300, 1792);
  r.shotStops([
    ['in', 1300, 1792],
    ['glade', 2100, 1024],
  ]);
  r.route('bower', 'in');
  r.route('in', 'bower');
  r.route('in', 'glade-glide');
  r.route('in', 'p-crown');
  return r.finish();
}

function attic(): Json {
  const r = new Wood('cn-attic', 'The attic', [1000, 832], 7403, { back: true, art: { anchorY: 500 } });
  r.air(256, 320, 1536, 832);
  r.fill();
  r.hollow('breath-hollow', 600, 832, 'longBreath');
  r.hoard('attic-', 800, 600, 300, 120, 6);
  r.place('in', 1000, 832);
  r.shotStops([['in', 900, 832]]);
  r.route('bower', 'in');
  r.route('in', 'bower');
  r.route('in', 'breath-hollow');
  return r.finish();
}

function gap(): Json {
  const r = new Wood('cn-gap', 'The gap', [4100, 1344], 7404, {
    art: { anchorY: 1300, moon: { x: 700, y: 260, r: 110 } },
  });
  r.air(0, 0, 4352, 1088);
  r.air(2256, 1088, 3456, 2240);
  r.air(0, 1088, 2256, 1856);
  r.back(2880, 1024, 3200, 1280);
  r.back(64, 1856, 320, 2304);
  r.air(3456, 1088, 4352, 1344);
  r.air(64, 1856, 320, 2304);
  r.fill();
  r.noClaws(2256, 1856, 2240);
  // The roost: a hanging root clump on the glide line, a shelf inside it, its shaft up to the sky room.
  r.mass(2880, 0, 64, 1280);
  r.mass(3136, 0, 64, 1024);
  r.mass(2944, 1216, 192, 64);
  r.claws(2944, 0, 1216, 'east');
  r.claws(3136, 0, 1024, 'west');
  r.add('moonseeds', { id: 'seed-far', x: 1300, y: 1790 });
  r.thorns('thorn-floor-1', 2300, 2240, 192);
  r.thorns('thorn-floor-2', 3000, 2240, 256);
  r.flyer('hawker', 'hawk-far', 1500, 1500, 1, { radius: 260 });
  r.flyer('lampwing', 'wing-gap', 2500, 1300, -1, { radius: 240 });
  r.hoard('roost-', 2970, 1140, 140, 60, 3);
  r.cover('roost-cover', 2880, 0, 320, 1280);
  r.arc('glide-', 2300, 3350, 1480, 80, 7);
  r.pod('pod-far', 1100, 1856);
  r.place('shelf', 4000, 1344);
  r.place('far', 1200, 1856);
  r.place('floor', 3200, 2240);
  r.shotStops([
    ['shelf', 3900, 1344],
    ['gap', 2700, 1500],
    ['far', 1300, 1856],
    ['floor', 3000, 2240],
  ]);
  r.route('bower', 'shelf');
  r.route('shelf', 'bower');
  r.route('shelf', 'far', { needs: ['glide'], oneWay: true });
  r.route('far', 'seed-far');
  r.route('far', 'hub', { oneWay: true });
  r.route('shelf', 'floor', { oneWay: true });
  r.route('floor', 'shelf', { needs: ['wallJump'] });
  r.route('floor', 'fork', { oneWay: true });
  r.route('shelf', 'sky', { needs: ['wallJump'] });
  r.route('sky', 'shelf');
  return r.finish();
}

function sky(): Json {
  const r = new Wood('cn-sky', 'Over the gap', [600, 960], 7405, { back: true, art: { anchorY: 600 } });
  r.air(320, 384, 1600, 960);
  r.fill();
  r.mass(704, 960, 64, 64);
  r.hollow('eyes-hollow', 1300, 960, 'nightEyes');
  r.add('pickups', { id: 'sky-great', kind: 'great', x: 1450, y: 860 });
  r.hoard('sky-', 400, 700, 240, 100, 6);
  r.place('in', 900, 960);
  r.shotStops([['in', 900, 960]]);
  r.route('gap', 'in');
  r.route('in', 'gap');
  r.route('in', 'eyes-hollow');
  return r.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// Deep. The root tunnel under the seed door: the drop, three screens of tunnel with root humps, a burrback pair in
// the pit between the humps with a dangler over them, a rotten panel over the burrow. The den: a save balcony over
// a closed arena, the old burrback, its gate. The way out: a climb up a root chimney to the first real vista, the
// next area's door in view.

function tunnel(): Json {
  const r = new Wood('cn-tunnel', 'The root tunnel', [830, 1856], 7501, {
    back: true,
    mood: 'deep',
    mass: 'ground',
    art: { anchorY: 1500, moon: { x: 1420, y: -600, r: 40 }, afterglow: { x: 900, y: 900, strength: 0 } },
  });
  r.air(704, 0, 960, 1280);
  r.air(320, 1280, 3712, 1856);
  r.bark('burrow-panel', 1600, 1856, 192, 64, true);
  r.air(1600, 1920, 1792, 2176);
  r.fill();
  // Root curtains hang either side of the door's shaft down to 256 over the floor: the claws' way back up.
  r.mass(448, 1280, 256, 320);
  r.mass(960, 1280, 128, 320);
  r.mass(1280, 1664, 224, 192);
  r.mass(2560, 1600, 320, 256);
  r.burrback('burr-tu-1', 1950, 1856, 1, 220, { fenced: true });
  r.burrback('burr-tu-2', 2380, 1856, -1, 160, { fenced: true });
  r.dangler('dang-tu', 2180, 1280, 1);
  r.lamp('wick-tu', 2180, 1460);
  r.lamp('wick-tu2', 3300, 1500);
  r.juvenile('juv-tu', 3300, 1856, -1, 240);
  r.thorns('thorn-u1', 2880, 1856, 160);
  r.thornsUnder('thorn-u2', 2900, 1280, 256);
  r.thorns('thorn-u3', 480, 1856, 160);
  r.hoard('burrow-', 1620, 1980, 150, 60, 3);
  r.cover('burrow-cover', 1536, 1920, 320, 256, 'burrow-panel');
  r.arc('hump-', 1220, 1580, 1600, 100, 5);
  r.arc('hump2-', 2500, 2940, 1560, 120, 5);
  r.landmark('tracks', 'tracks', 2000, 1856);
  r.place('land', 830, 1280);
  r.place('floor', 1000, 1856);
  r.place('east', 3500, 1856);
  r.shotStops([
    ['land', 830, 1856],
    ['humps', 1500, 1856],
    ['pair', 2200, 1856],
    ['east', 3400, 1856],
  ]);
  r.route('hub', 'floor', { oneWay: true });
  r.route('floor', 'hub', { needs: ['wallJump'] });
  r.route('floor', 'east');
  r.route('east', 'floor');
  r.route('east', 'den');
  r.route('den', 'east');
  r.route('floor', 'burrow');
  r.route('burrow', 'floor', { needs: ['wallJump'] });
  return r.finish();
}

function burrow(): Json {
  const r = new Wood('cn-burrow', 'The burrow', [544, 800], 7502, {
    back: true,
    mood: 'deep',
    mass: 'ground',
    art: { anchorY: 500, moon: { x: 1420, y: -600, r: 40 }, afterglow: { x: 900, y: 900, strength: 0 } },
  });
  r.air(448, 0, 640, 448);
  r.air(256, 448, 1664, 800);
  r.fill();
  r.mass(256, 448, 192, 192);
  r.mass(640, 448, 192, 192);
  r.stone('stone-deep', 1300, 800, 'cn-deep');
  r.add('pickups', { id: 'burrow-great', kind: 'great', x: 1500, y: 700 });
  r.hoard('deep-', 800, 640, 360, 100, 8);
  r.place('in', 544, 800);
  r.shotStops([['in', 800, 800]]);
  r.route('tunnel', 'in');
  r.route('in', 'tunnel', { needs: ['wallJump'] });
  r.route('in', 'stone-deep');
  return r.finish();
}

function den(): Json {
  const r = new Wood('cn-den', 'The burrow under the roots', [300, 832], 7503, {
    back: true,
    mood: 'deep',
    mass: 'ground',
    art: { anchorY: 900, moon: { x: 1420, y: -600, r: 40 }, afterglow: { x: 900, y: 900, strength: 0 } },
  });
  r.air(0, 576, 640, 832);
  r.air(640, 448, 2560, 1280);
  r.air(2560, 1024, 2880, 1280);
  r.gate('root-gate', 2560, 1024, 128, 256, 'cn-den-down');
  r.fill();
  r.mass(2368, 1024, 192, 32);
  // The balcony's face refuses the claws: down in the arena, the fight is the way on.
  r.noClaws(640, 832, 1280);
  r.patch('p-den', 300, 832);
  r.lamp('wick-den', 380, 680);
  r.lamp('wick-arena', 1600, 640);
  r.enemy({
    id: 'old-burr',
    kind: 'oldBurrback',
    x: 1700,
    y: 1280,
    facing: -1,
    radius: 900,
    sets: 'cn-den-down',
  });
  r.set('camera', {
    headroom: 0,
    zones: [{ id: 'arena', x: 640, y: 448, w: 1920, h: 832, lock: true }],
  });
  r.landmark('arena', 'arena', 1600, 1280);
  r.place('balcony', 300, 832);
  r.place('floor', 1600, 1280);
  r.place('door', 2780, 1280);
  r.shotStops([
    ['balcony', 400, 832],
    ['floor', 1600, 1280],
    ['gate', 2300, 1280],
  ]);
  r.route('tunnel', 'balcony');
  r.route('balcony', 'tunnel');
  r.route('balcony', 'p-den');
  r.route('balcony', 'floor', { oneWay: true });
  // (The gate opens on the old burrback's death: an enemy's `sets` the world check cannot see, so no flag here.)
  r.route('floor', 'door');
  r.route('door', 'out');
  r.route('out', 'door');
  return r.finish();
}

function out(): Json {
  const r = new Wood('cn-out', 'The way on', [300, 2432], 7504, {
    art: { anchorY: 900, moon: { x: 1500, y: 420, r: 150 }, afterglow: { x: 1200, y: 760, strength: 1 } },
  });
  r.air(0, 2048, 1024, 2432);
  r.air(640, 896, 1024, 2048);
  r.air(0, 0, 1920, 896);
  r.back(0, 896, 1920, 2688);
  // The ledge: a side tunnel off the chimney behind a rotten wall.
  r.air(1024, 1344, 1920, 1600);
  r.bark('ledge-wall', 1280, 1344, 64, 256);
  r.gate('next-door', 1792, 640, 128, 256, 'cn-next');
  r.fill();
  r.patch('p-out', 400, 896);
  r.add('triggers', { id: 'way-on', x: 1500, y: 600, w: 160, h: 296, sets: 'cn-area-end' });
  r.landmark('vista', 'vista', 1300, 896);
  r.cover('ledge-cover', 1344, 1280, 576, 384, 'ledge-wall');
  r.arc('chimney-', 700, 960, 1500, 60, 3);
  r.place('in', 300, 2432);
  r.place('top', 600, 896);
  r.shotStops([
    ['in', 400, 2432],
    ['chimney', 830, 1500],
    ['top', 900, 896],
  ]);
  r.route('den', 'in');
  r.route('in', 'den');
  r.route('in', 'top', { needs: ['wallJump'] });
  r.route('top', 'in');
  r.route('top', 'p-out');
  r.route('top', 'way-on');
  r.route('in', 'ledge', { needs: ['wallJump'] });
  r.route('ledge', 'in');
  return r.finish();
}

function ledge(): Json {
  const r = new Wood('cn-ledge', 'The root ledge', [200, 448], 7505, {
    back: true,
    mood: 'deep',
    art: { anchorY: 700 },
  });
  r.air(0, 192, 768, 448);
  r.air(512, 192, 1664, 832);
  r.fill();
  r.mass(768, 640, 256, 192);
  r.burrback('burr-ledge', 1300, 832, -1, 100, { fenced: true });
  r.add('pickups', { id: 'ledge-great', kind: 'great', x: 1540, y: 760 });
  r.hoard('ledge-', 1150, 640, 300, 100, 10);
  r.place('in', 200, 448);
  r.shotStops([['in', 500, 448]]);
  r.route('out', 'in');
  r.route('in', 'out');
  return r.finish();
}

const AREAS = [
  { id: 'cn-heart', rooms: ['cn-hatch', 'cn-hub'] },
  { id: 'cn-west', rooms: ['cn-limbs', 'cn-trunk', 'cn-well', 'cn-rot', 'cn-crawl', 'cn-elder'] },
  { id: 'cn-east', rooms: ['cn-fork', 'cn-cellar', 'cn-grove', 'cn-hollowroot', 'cn-spire', 'cn-nook'] },
  { id: 'cn-high', rooms: ['cn-bower', 'cn-crown', 'cn-attic', 'cn-gap', 'cn-sky'] },
  { id: 'cn-deep', rooms: ['cn-tunnel', 'cn-burrow', 'cn-den', 'cn-out', 'cn-ledge'] },
];

export function buildCanopy(): { rooms: Json[]; world: Json } {
  const rooms = [
    hatch(),
    hub(),
    trunk(),
    well(),
    limbs(),
    rot(),
    crawl(),
    elder(),
    fork(),
    cellar(),
    grove(),
    hollowroot(),
    spire(),
    nook(),
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
