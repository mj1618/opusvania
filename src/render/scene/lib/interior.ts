/**
 * The inside of the wood (canopy review r2 #1, #2): what an enclosed wood room (one with `marks.backs`) shows behind
 * the hero, and the living light in it. Pure layout plus painters; the live parts are layers/interior.ts.
 *
 * - **Material per room**: `root` (a wood interior: heartwood, the grain running along the trunk) or `earth` (a `deep`
 *   room, or one carved from `ground`: packed earth with root curtains hanging in it). Tinted by the room's mood:
 *   cool deep teal, warm moss green, deep umber under a teal haze.
 * - **Two planes, a fog between**: the near back (baked with the playfield: fibre bundles or earth clumps with gaps
 *   and torn ends where the back meets open air) and the deep back (its own layer at parallax `INTERIOR.deepParallax`,
 *   lighter and lower in contrast, a fog band across it), masked to the backs so the forest never shows through.
 * - **Light that is not a lamp**, placed from the room's geometry (deterministic): cyan glow moss on mass tops, glow
 *   fungus shelves on faces, glow worms hanging from undersides, moonlight shafts through cracks in a root room's
 *   ceiling, and drifting spores where a screen-sized cell would otherwise have none.
 */
import type { Room } from '../../../scene/room';
import { type Look, lookOf } from './looks';
import { BRANCH, strand } from './pf-branch';
import { exposedSides, type MassRect } from './pf-mass';
import type { Paint } from './pf-paint';
import { blob, chaikin, clamp, hash1, lerp, range, ribbon, rngFor, wander, wobble } from './pf-shape';

export const INTERIOR = {
  /** The deep back's parallax (between the mid layer's 0.68 and the playfield). */
  deepParallax: 0.86,
  /** The mid plane (review r5 #7): its parallax, its value (share of the way from the mass to the fog), and the share
   *  of the back it covers. */
  midParallax: 0.93,
  midValue: 0.45,
  midCover: 0.32,
  /** Spacing of the lights along exposed tops, faces and undersides (px), and the fallback cell. */
  mossEvery: 640,
  fungusEvery: 560,
  wormEvery: 420,
  shaftEvery: 1500,
  cell: { w: 1500, h: 860 },
  /** Light colours: the wood's bioluminescence (art direction) and the moon's cold. */
  cyan: 0x9ff3ff,
  cyanDeep: 0x46c8d8,
  violet: 0xc58bff,
  moon: 0xb8d0f0,
  /** The moonlit shaft's frost moss, the heartwood's sap, the nest's larvae and trails. */
  frost: 0xdcecff,
  sap: 0xff9a40,
  larva: 0xe8f0b0,
  /** How far the near back's torn edge reaches into it where it meets open air (px). */
  tear: 420,
} as const;

/** The den's fungus light from below (review r5 #7). */
const DEN_FUNGUS = 0x5a8a84;

export type BackMat = 'root' | 'earth' | 'grain' | 'leaf' | 'frost';

export { type Look, lookOf };

/** Each look's near-back material. */
const MAT: Record<Look, BackMat> = {
  heartwood: 'grain',
  shaft: 'frost',
  nest: 'earth',
  canopy: 'leaf',
  den: 'earth',
};

export interface Tone {
  /** The deep back: body, its grain lit, the fog band. */
  deep: number;
  deepLit: number;
  fog: number;
  /** The near back: bundles' body, their lit edge, grain. */
  near: number;
  nearLit: number;
  grain: number;
  /** Root curtains (earth). */
  root: number;
  rootLit: number;
}

/**
 * Tones per look. Each look is its own hue as well as its own pattern (review r4 #4: heartwood's grain and the nest's
 * bands were the same purple-grey): heartwood amber-brown, shaft cold white-blue, nest ochre-grey, canopy green-teal,
 * den umber. (Round 3's warm tone, a saturated moss green, painted flat mint polygons under the lamps' wash: the warm
 * variants stay dark.)
 */
const TONES: Record<Look | 'canopyWarm' | 'heartwoodWarm', Tone> = {
  heartwood: {
    deep: 0x3a2a1e,
    deepLit: 0x6c4c32,
    fog: 0x584a3e,
    near: 0x3a2a1e,
    nearLit: 0xbc8c5c,
    grain: 0x1e140d,
    root: 0x4a3424,
    rootLit: 0xc09c70,
  },
  heartwoodWarm: {
    deep: 0x36281c,
    deepLit: 0x664a30,
    fog: 0x56483a,
    near: 0x382a1e,
    nearLit: 0xb08a60,
    grain: 0x1a120c,
    root: 0x443224,
    rootLit: 0xb49470,
  },
  shaft: {
    deep: 0x3a5674,
    deepLit: 0x8eaccc,
    fog: 0xb4cce4,
    near: 0x25394f,
    nearLit: 0xc8def4,
    grain: 0x15243a,
    root: 0x203248,
    rootLit: 0xb0c8e4,
  },
  nest: {
    deep: 0x38362c,
    deepLit: 0x66604a,
    fog: 0x5a5c50,
    near: 0x403a2e,
    nearLit: 0xaaa07a,
    grain: 0x1a1810,
    root: 0x48402e,
    rootLit: 0xb4a87c,
  },
  canopy: {
    deep: 0x1a3638,
    deepLit: 0x325c58,
    fog: 0x426c6c,
    near: 0x132c2c,
    nearLit: 0x5c9488,
    grain: 0x0a1a1a,
    root: 0x12282a,
    rootLit: 0x6a9a8e,
  },
  canopyWarm: {
    deep: 0x18302c,
    deepLit: 0x30544a,
    fog: 0x42645a,
    near: 0x142a26,
    nearLit: 0x5c8070,
    grain: 0x0a1614,
    root: 0x142420,
    rootLit: 0x688878,
  },
  // (Review r5 #7: the den and the heartwood were two browns, the same picture desaturated. The den is cool umber-grey
  // earth lit from below by fungus, dark roots hanging; the heartwood amber lit from above.)
  den: {
    deep: 0x2a2725,
    deepLit: 0x4a5250,
    fog: 0x444a4a,
    near: 0x2a2624,
    nearLit: 0x76807a,
    grain: 0x121010,
    root: 0x1a1716,
    rootLit: 0x5a605c,
  },
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BackEdges {
  /** True where that edge of the back meets open air inside the room (not the room's edge, not mass), anywhere on it. */
  w: boolean;
  e: boolean;
  n: boolean;
  s: boolean;
  /**
   * How open the air past an edge is at a point along it (0..1, smoothed; v = x on n / s, y on w / e): a back's top
   * that is under mass for half its length and open sky for the rest tears only where the sky is (review r4 #6: the
   * fork's ruled seam).
   */
  at?: (side: 'n' | 's' | 'w' | 'e', v: number) => number;
}

export interface Glow {
  kind: 'moss' | 'fungus' | 'worm' | 'spore' | 'shaft' | 'sap' | 'larva' | 'beam' | 'trail';
  x: number;
  y: number;
  /** Size (px): a cluster's radius, a worm's length, a shaft's width. */
  s: number;
  /** The face a fungus grows from (+1 = an east-facing face), a shaft's slant. */
  dir: number;
  violet: boolean;
  /** A shaft's length. */
  len: number;
  seed: number;
}

export interface InteriorPlan {
  look: Look;
  mat: BackMat;
  tone: Tone;
  backs: Rect[];
  edges: BackEdges[];
  lights: Glow[];
  masses: MassRect[];
}

const massOf = (s: { tag: string }): boolean => s.tag === 'root' || s.tag === 'ground';

/** The room's mood at x (the first stop at or before it). */
function moodAt(room: Room, x: number): 'cool' | 'warm' | 'deep' {
  const stops = [...(room.art?.moods ?? [])].sort((a, b) => a.x - b.x);
  let m: 'cool' | 'warm' | 'deep' = 'cool';
  for (const s of stops) if (s.x <= x) m = s.mood;
  return m;
}

function inSolid(masses: readonly MassRect[], x: number, y: number): boolean {
  return masses.some((q) => x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h);
}

function inBacks(backs: readonly Rect[], x: number, y: number, pad = 0): boolean {
  return backs.some((b) => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad);
}

/** Which edges of `b` meet open air, and how open each is along its length. */
function freeEdges(b: Rect, room: Room, masses: readonly MassRect[]): BackEdges {
  const out = (side: 'n' | 's' | 'w' | 'e', v: number): [number, number] =>
    side === 'n'
      ? [v, b.y - 24]
      : side === 's'
        ? [v, b.y + b.h + 24]
        : side === 'w'
          ? [b.x - 24, v]
          : [b.x + b.w + 24, v];
  const raw = (side: 'n' | 's' | 'w' | 'e', v: number): number => {
    const [x, y] = out(side, v);
    if (x <= 1 || y <= 1 || x >= room.width - 1 || y >= room.height - 1) return 0;
    return inSolid(masses, x, y) ? 0 : 1;
  };
  const cache = new Map<string, number>();
  const at = (side: 'n' | 's' | 'w' | 'e', v: number): number => {
    const q = Math.round(v / 20);
    const key = `${side}${q}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let a = 0;
    for (let k = -4; k <= 4; k++) a += raw(side, q * 20 + k * 50);
    const o = clamp((a / 9 - 0.15) / 0.7, 0, 1);
    cache.set(key, o);
    return o;
  };
  const any = (side: 'n' | 's' | 'w' | 'e', a: number, c: number): boolean => {
    const n = 24;
    let open = 0;
    for (let k = 0; k < n; k++) open += raw(side, lerp(a, c, (k + 0.5) / n));
    return open >= 2;
  };
  return {
    w: any('w', b.y, b.y + b.h),
    e: any('e', b.y, b.y + b.h),
    n: any('n', b.x, b.x + b.w),
    s: any('s', b.x, b.x + b.w),
    at,
  };
}

/** The plan for a wood room with backs, or null (no backs: a vista). */
export function interiorPlan(room: Room, seed: number): InteriorPlan | null {
  const marked = (room.marks?.backs ?? []) as Rect[];
  if (!marked.length) return null;
  // A cover's hollow is inside the wood too (review r3 #2: the hub's bank hollow showed open sky, then flat mint):
  // its rect is a back, unless the room's backs already hold it.
  const inMarked = (c: Rect) =>
    marked.some((b) => c.x >= b.x && c.y >= b.y && c.x + c.w <= b.x + b.w && c.y + c.h <= b.y + b.h);
  const covers = ((room.marks?.covers ?? []) as Rect[])
    .filter((c) => !inMarked(c) && c.w > 160 && c.h > 160)
    // (Inset: its paint, which runs a little past a back, stays under the walls round it.)
    .map((c) => ({ x: c.x + 48, y: c.y + 48, w: c.w - 96, h: c.h - 96 }));
  const backs = [...marked, ...covers];
  const masses = room.solids.filter(massOf) as MassRect[];
  const cx = backs.reduce((a, b) => a + b.x + b.w / 2, 0) / backs.length;
  const mood = moodAt(room, cx);
  const look = lookOf(room);
  const mat = MAT[look];
  const warm = mood === 'warm';
  const tone =
    TONES[warm && look === 'canopy' ? 'canopyWarm' : warm && look === 'heartwood' ? 'heartwoodWarm' : look];
  // (A cover's hollow is usually closed all round by the wood's own walls; where its rect runs out into open air (the
  // fork's cellar cover spans the corridor over it) that edge tears like any back's: review r4 #6, the ruled seam.)
  const edges = backs.map((b) => freeEdges(b, room, masses));
  const lights: Glow[] = [];
  const I = INTERIOR;
  // (Review r4 #8: on a claw face no glow grows within 64 px of a thorn strip: the hazard is the brightest thing there.)
  const thorns = ((room as { thorns?: Rect[] }).thorns ?? []) as Rect[];
  const byThorn = (x: number, y: number, s: number): boolean =>
    thorns.some(
      (t) => x > t.x - 64 - s && x < t.x + t.w + 64 + s && y > t.y - 64 - s && y < t.y + t.h + 64 + s,
    );
  const add = (g: Omit<Glow, 'seed'>): void => {
    if (
      (g.kind === 'fungus' || g.kind === 'sap' || g.kind === 'moss' || g.kind === 'worm') &&
      byThorn(g.x, g.y, g.s)
    )
      return;
    lights.push({ ...g, seed: seed + lights.length * 31 + Math.round(g.x * 3 + g.y) });
  };
  masses.forEach((r, i) => {
    const sd = exposedSides(r, masses, room.width, room.height);
    // Glow moss on the tops (a cluster now and then along the walk's edge); in the nest, the ants' lit trails.
    for (const [x0, x1] of sd.top) {
      const len = x1 - x0;
      if (len < 180) continue;
      if (look === 'nest' && len >= 360 && inBacks(backs, (x0 + x1) / 2, r.y, 32))
        add({ kind: 'trail', x: x0 + 40, y: r.y, s: 0, dir: 0, violet: false, len: len - 80 });
      const n = Math.max(1, Math.floor(len / I.mossEvery));
      for (let k = 0; k < n; k++) {
        const x = x0 + ((k + 0.25 + 0.5 * hash1(k + i * 7, seed + 3)) * len) / n;
        if (!inBacks(backs, x, r.y, 32)) continue;
        add({ kind: 'moss', x, y: r.y, s: 26 + 26 * hash1(k, seed + i), dir: 0, violet: false, len: 0 });
      }
    }
    // Glow fungus shelves on the faces.
    for (const [dir, segs] of [
      [1, sd.right],
      [-1, sd.left],
    ] as const) {
      const fx = dir > 0 ? r.x + r.w : r.x;
      for (const [y0, y1] of segs) {
        const len = y1 - y0;
        if (len < 260) continue;
        const n = Math.max(1, Math.floor(len / I.fungusEvery));
        for (let k = 0; k < n; k++) {
          const y = y0 + ((k + 0.3 + 0.4 * hash1(k + i * 5, seed + 9)) * len) / n;
          if (!inBacks(backs, fx, y, 32)) continue;
          // (In the giant's heartwood most of them are sap welling from the wood: amber beads.)
          const sap = look === 'heartwood' && hash1(k * 7 + i, seed + 15) < 0.65;
          add({
            kind: sap ? 'sap' : 'fungus',
            x: fx,
            y,
            s: 18 + 16 * hash1(k + i, seed + 11),
            dir,
            violet: !sap && hash1(k * 3 + i, seed + 13) < (look === 'den' ? 0.35 : 0.18),
            len: 0,
          });
        }
      }
    }
    // Glow worms hanging from the undersides.
    for (const [x0, x1] of sd.bottom) {
      const len = x1 - x0;
      if (len < 220) continue;
      const n = Math.max(1, Math.floor(len / I.wormEvery));
      const y = r.y + r.h;
      for (let k = 0; k < n; k++) {
        const x = x0 + ((k + 0.2 + 0.6 * hash1(k + i * 3, seed + 17)) * len) / n;
        if (!inBacks(backs, x, y, 32)) continue;
        add({
          kind: 'worm',
          x,
          y,
          s: 60 + 160 * hash1(k + i * 11, seed + 19),
          dir: 0,
          violet: (look === 'den' || look === 'nest') && hash1(k + i, seed + 23) < 0.25,
          len: 0,
        });
      }
    }
  });
  // Moonlight: one cold beam down a moonlit shaft (its key light); through cracks in a canopy's or a heartwood's roof.
  backs.forEach((b, j) => {
    if (look === 'shaft') {
      add({
        kind: 'beam',
        x: b.x + b.w * (0.45 + 0.1 * hash1(j, seed + 27)),
        y: b.y - 40,
        s: Math.min(b.w * 0.55, 460),
        dir: -0.04,
        violet: false,
        len: b.h + 80,
      });
      return;
    }
    if (look !== 'canopy' && look !== 'heartwood') return;
    const every = look === 'heartwood' ? I.shaftEvery * 1.8 : I.shaftEvery;
    const n = Math.max(1, Math.round(b.w / every));
    for (let k = 0; k < n; k++) {
      const x = b.x + ((k + 0.3 + 0.4 * hash1(k + j, seed + 29)) * b.w) / n;
      // The crack opens where the ceiling is: the lowest mass bottom over the back's top half at x.
      let y = b.y;
      for (const m of masses)
        if (x > m.x && x < m.x + m.w && m.y + m.h <= b.y + b.h * 0.5) y = Math.max(y, m.y + m.h);
      add({
        kind: 'shaft',
        x,
        y: y - 20,
        s: 110 + 90 * hash1(k, seed + 31),
        dir: -0.22 + 0.1 * hash1(k, seed + 37),
        violet: false,
        len: Math.min(b.y + b.h - y, 1400),
      });
    }
  });
  // The nest's larvae: pale clusters in cells of the back plane, near the walls.
  if (look === 'nest')
    backs.forEach((b, j) => {
      const n = Math.max(2, Math.round((b.w * b.h) / 900000));
      for (let k = 0; k < n; k++) {
        const x = b.x + b.w * (0.08 + 0.84 * hash1(k * 5 + j, seed + 47));
        const y = b.y + b.h * (0.2 + 0.6 * hash1(k * 7 + j, seed + 49));
        if (inSolid(masses, x, y)) continue;
        add({ kind: 'larva', x, y, s: 30 + 24 * hash1(k, seed + 51), dir: 0, violet: false, len: 0 });
      }
    });
  // Every screen-sized cell of air gets something (spores drifting in it) if nothing else lights it.
  for (const b of backs) {
    for (let y = b.y; y < b.y + b.h; y += I.cell.h) {
      for (let x = b.x; x < b.x + b.w; x += I.cell.w) {
        const cw = Math.min(I.cell.w, b.x + b.w - x);
        const ch = Math.min(I.cell.h, b.y + b.h - y);
        if (cw < 500 || ch < 400) continue;
        const lit = lights.some(
          (l) => l.x > x - 200 && l.x < x + cw + 200 && l.y > y - 200 && l.y < y + ch + 200,
        );
        if (lit) continue;
        // The middle of the cell, or the nearest air to it on a coarse search.
        let best: [number, number] | null = null;
        for (let k = 0; k < 25 && !best; k++) {
          const px = x + cw * (0.5 + 0.35 * (hash1(k, seed + 41) - 0.5) * 2 * Math.min(1, k / 4));
          const py = y + ch * (0.5 + 0.35 * (hash1(k, seed + 43) - 0.5) * 2 * Math.min(1, k / 4));
          if (!inSolid(masses, px, py)) best = [px, py];
        }
        if (best) add({ kind: 'spore', x: best[0], y: best[1], s: 160, dir: 0, violet: false, len: 0 });
      }
    }
  }
  return { look, mat, tone, backs, edges, lights, masses };
}

/** How far into the back the torn edge reaches at (x, y): 0 at a free edge, 1 deep inside or along a closed edge. */
function tornK(b: Rect, e: BackEdges, x: number, y: number): number {
  let k = 1;
  const o = (side: 'n' | 's' | 'w' | 'e', v: number) => (e.at ? e.at(side, v) : 1);
  const T = INTERIOR.tear;
  if (e.w) k = Math.min(k, lerp(1, (x - b.x) / T, o('w', y)));
  if (e.e) k = Math.min(k, lerp(1, (b.x + b.w - x) / T, o('e', y)));
  if (e.n) k = Math.min(k, lerp(1, (y - b.y) / T, o('n', x)));
  if (e.s) k = Math.min(k, lerp(1, (b.y + b.h - y) / T, o('s', x)));
  return clamp(k, 0, 1);
}

/**
 * The near back, baked with the playfield (replaces the old board-like grain, review r2 #1):
 * - `root`: bundles of fibre running down the wood (the grain along the trunk), 40-150 px, with dark gaps between
 *   where the deep back shows; each lit on its moon side, grooved, now and then a cross root.
 * - `earth`: clumps of packed earth with stones, and curtains of pale roots hanging from the top.
 * Where a back meets open air its fibres end ragged (no straight seam: the bower, r2 #9).
 */
export function paintNearBacks(p: Paint, plan: InteriorPlan, seed: number): void {
  const B = BRANCH;
  const T = plan.tone;
  plan.backs.forEach((b, i) => {
    const e = plan.edges[i] as BackEdges;
    const r = rngFor(seed, b.x, b.y, 23);
    if (plan.mat === 'root') {
      let x = b.x - 40;
      let k = 0;
      while (x < b.x + b.w + 40) {
        const w = range(r, 46, 150);
        const cx = x + w / 2;
        // How much of the bundle stands here: full inside, torn near a free edge.
        const kx = tornK(b, e, clamp(cx, b.x, b.x + b.w), b.y + b.h / 2);
        const yTop = b.y - 30 + (e.n ? range(r, 0.2, 1) * INTERIOR.tear * (1 - 0.6 * kx) : 0);
        let yBot = b.y + b.h + 30;
        if (e.s) yBot -= range(r, 0.3, 1) * INTERIOR.tear;
        // Near a free side edge, a bundle hangs from the top (or stands from the floor) only part way.
        if (kx < 1 && (e.w || e.e)) {
          const keep = clamp(kx * 1.25 + range(r, -0.25, 0.2), 0.08, 1);
          if (r() < 0.6) yBot = yTop + (yBot - yTop) * keep;
          else if (!e.s) {
            const top2 = yBot - (yBot - yTop) * keep;
            yBot = Math.max(yBot, top2 + 40);
          }
        }
        if (kx > 0.02 || r() < 0.4) {
          const line: number[] = [];
          for (let t = 0; t <= 14; t++) line.push(cx + range(r, -6, 6), lerp(yTop, yBot, t / 14));
          const wl = wander(line, 26, seed + k * 7 + i, 260);
          const tip = (t: number) => (yBot < b.y + b.h ? Math.min(1, (1 - t) * 6) : 1);
          // A bundle is a few fibres twisting round each other (never one smooth post: a post reads as a trunk to
          // climb), each a little apart in value, the moon on the east edges.
          const nf = 3 + Math.floor(r() * 3);
          for (let f = 0; f < nf; f++) {
            const ph = range(r, 0, 6.28);
            const amp = w * range(r, 0.15, 0.4);
            const per = range(r, 260, 620);
            const fw = w * range(r, 0.28, 0.48);
            const fl = wl.map((v, j) => {
              if (j % 2) return v;
              const y = wl[j + 1] as number;
              return v + Math.sin(y / per + ph) * amp;
            });
            const wF = (t: number) =>
              fw * (0.75 + 0.35 * wobble(t * 1200 + f * 91, seed + k + f, 140)) * tip(t);
            const tone = f % 3 === 1 ? T.grain : T.near;
            p.solid(ribbon(fl, wF), tone, B.backH + 0.03 + f * 0.01, { bark: 0.8 }, 0.9);
            p.tint(
              ribbon(
                fl.map((v, j) => (j % 2 ? v : v + fw * 0.3)),
                (t) => wF(t) * 0.25,
              ),
              T.nearLit,
              f % 2 ? 0.3 : 0.18,
            );
          }
        }
        x += w + range(r, 10, 70);
        k++;
      }
      // Cross roots: a few long soft roots slanting across the fibre.
      for (let c = 0; c < Math.max(1, Math.round(b.w / 900)); c++) {
        const y0 = b.y + range(r, 0.15, 0.85) * b.h;
        const xa = b.x + range(r, 0, 0.5) * b.w;
        const xb = xa + range(r, 400, 1100);
        const line: number[] = [];
        for (let t = 0; t <= 12; t++) line.push(lerp(xa, xb, t / 12), y0 + range(r, -60, 60) * (t / 12));
        const wl = wander(line, 30, seed + c * 13 + i, 200);
        const w0 = range(r, 18, 34);
        if (tornK(b, e, xa, y0) < 0.3) continue;
        p.solid(strand(wl, w0, 0.35), T.near, B.backH + 0.08, { bark: 0.6 });
        p.tint(
          strand(
            wl.map((v, j) => (j % 2 ? v - w0 * 0.25 : v)),
            w0 * 0.3,
            0.35,
          ),
          T.nearLit,
          0.4,
        );
      }
    } else if (plan.mat === 'grain') {
      heartwoodNear(p, plan, b, e, seed + i * 7);
    } else if (plan.mat === 'leaf') {
      canopyNear(p, plan, b, e, seed + i * 7);
    } else if (plan.mat === 'frost') {
      shaftNear(p, plan, b, e, seed + i * 7);
    } else {
      // Earth: big soft clumps of packed earth, close in value to the deep back (so none reads as a ledge), with
      // gaps between where the deep and its fog show; stones and short roots in them.
      // (Soft and large, low alpha, no edge light: a mottled wall, never a boulder or a ledge.)
      const n = Math.round((b.w * b.h) / 120000);
      for (let k = 0; k < n; k++) {
        const cx = b.x + range(r, -0.05, 1.05) * b.w;
        const cy = b.y + range(r, -0.05, 1.05) * b.h;
        const kx = tornK(b, e, clamp(cx, b.x, b.x + b.w), clamp(cy, b.y, b.y + b.h));
        if (kx < range(r, 0, 0.6)) continue;
        // (Long low lenses, like strata seen end-on: overlapping round blobs went muddy, like smoke.)
        const rx = range(r, 320, 760) * (0.6 + 0.4 * kx);
        const ry = range(r, 26, 70);
        p.solid(
          chaikin(blob(cx, cy, rx, ry, seed + k * 3, 0.35, 22), 2),
          T.near,
          B.backH + 0.02,
          { bark: 0.1, alpha: 0.4 },
          0.24,
        );
        for (let q = 0; q < 4; q++) {
          if (r() < 0.5) continue;
          const sr = range(r, 5, 12);
          p.solid(
            chaikin(
              blob(
                cx + range(r, -0.6, 0.6) * rx,
                cy + range(r, -0.6, 0.6) * ry,
                sr * 1.3,
                sr,
                seed + k + q,
                0.3,
                10,
              ),
              1,
            ),
            T.deepLit,
            B.backH + 0.06,
            { bark: 0 },
            0.5,
          );
        }
      }
      // Root curtains: pale roots hanging from every ceiling over the back (the undersides of the masses), longer in
      // bunches.
      const ceilings: Array<[number, number, number]> = [];
      for (const m of plan.masses) {
        for (const [x0, x1] of exposedSides(m, plan.masses, 1e9, 1e9).bottom) {
          const y = m.y + m.h;
          if (y > b.y && y < b.y + b.h && x1 > b.x && x0 < b.x + b.w)
            ceilings.push([Math.max(x0, b.x), Math.min(x1, b.x + b.w), y]);
        }
      }
      ceilings.push([b.x, b.x + b.w, b.y]);
      for (const [cx0, cx1, cy] of ceilings)
        for (let x = cx0 + range(r, 0, 40); x < cx1; x += range(r, 16, 60)) {
          const bunch = 0.5 + 0.5 * wobble(x, seed + 51, 300);
          const kx = tornK(b, e, x, cy + 40);
          if (kx < 0.15) continue;
          const len = (30 + 420 * bunch * r() ** 1.5) * (0.4 + 0.6 * kx);
          const line = [x, cy - 10, x + range(r, -12, 12), cy + len * 0.5, x + range(r, -26, 26), cy + len];
          const w0 = range(r, 3, 9);
          p.solid(strand(chaikin2(line), w0, 0.6), T.root, B.backH + 0.12, { bark: 0.5 });
          p.tint(
            strand(
              chaikin2(line).map((v, j) => (j % 2 ? v : v + w0 * 0.25)),
              w0 * 0.35,
              0.6,
            ),
            T.rootLit,
            0.5,
          );
        }
    }
    if (plan.look === 'nest') nestNear(p, plan, b, e, seed + i * 11);
    if (plan.look === 'den') denNear(p, plan, b, e, seed + i * 11);
  });
}

/** The tops of the room's masses that lie in back `b` (where she walks in front of the back). */
function topsIn(plan: InteriorPlan, b: Rect): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (const m of plan.masses)
    for (const [x0, x1] of exposedSides(m, plan.masses, 1e9, 1e9).top)
      if (m.y > b.y && m.y <= b.y + b.h + 4 && x1 > b.x && x0 < b.x + b.w)
        out.push([Math.max(x0, b.x), Math.min(x1, b.x + b.w), m.y]);
  return out;
}

/**
 * The giant's heartwood, near (review r3 #4): long split panels whose grain runs along the trunk, dark splits, knots
 * with sap weeping from them. Low in contrast, no lit top edge (a lit top behind her reads as a ledge).
 */
function heartwoodNear(p: Paint, plan: InteriorPlan, b: Rect, e: BackEdges, seed: number): void {
  const B = BRANCH;
  const T = plan.tone;
  const r = rngFor(seed, 401);
  // (Review r5 #7: along the giant, diagonal, as the deep back's panels: horizontal lenses read as bands.)
  const ang = heartAngle(plan);
  const n = Math.round((b.w * b.h) / 160000);
  for (let k = 0; k < n; k++) {
    const cx = b.x + range(r, -0.05, 1.05) * b.w;
    const cy = b.y + range(r, -0.05, 1.05) * b.h;
    const kx = tornK(b, e, clamp(cx, b.x, b.x + b.w), clamp(cy, b.y, b.y + b.h));
    if (kx < range(r, 0, 0.6)) continue;
    const rx = range(r, 300, 800) * (0.6 + 0.4 * kx);
    const ry = range(r, 30, 80);
    p.solid(
      turn(chaikin(blob(cx, cy, rx, ry, seed + k * 3, 0.25, 22), 2), cx, cy, ang),
      T.near,
      B.backH + 0.02,
      { bark: 0.6, alpha: 0.4 },
      0.3,
    );
    // Grain along it.
    for (let q = 0; q < 3; q++) {
      const y = cy + range(r, -0.6, 0.6) * ry;
      const line: number[] = [];
      for (let t = 0; t <= 10; t++)
        line.push(cx - rx * 0.8 + (rx * 1.6 * t) / 10, y + 6 * wobble(cx + t * 90, seed + q, 200));
      p.tint(turn(strand(line, range(r, 2, 5), 0.2), cx, cy, ang), T.grain, 0.5);
    }
  }
  // Splits: long dark cracks along the grain, a lit lip under each.
  for (let k = 0; k < Math.max(1, Math.round((b.w * b.h) / 1400000)); k++) {
    const x0 = b.x + range(r, 0, 0.7) * b.w;
    const y0 = b.y + range(r, 0.1, 0.8) * b.h;
    if (tornK(b, e, x0, y0) < 0.3) continue;
    const len = range(r, 400, 1100);
    const line: number[] = [];
    for (let t = 0; t <= 14; t++)
      line.push(x0 + (len * t) / 14, y0 + 14 * wobble(x0 + t * 80, seed + k, 260));
    p.solid(turn(strand(line, range(r, 8, 16), 0.08), x0, y0, ang), T.grain, B.backH, { bark: 0.2 }, 0.85);
    p.tint(
      turn(
        strand(
          line.map((v, j) => (j % 2 ? v + 7 : v)),
          2.5,
          0.08,
        ),
        x0,
        y0,
        ang,
      ),
      T.nearLit,
      0.25,
    );
  }
  // Knots weeping sap (the sap's glow is live: layers/interior.ts).
  for (let k = 0; k < Math.max(1, Math.round((b.w * b.h) / 700000)); k++) {
    const x = b.x + range(r, 0.05, 0.95) * b.w;
    const y = b.y + range(r, 0.1, 0.7) * b.h;
    if (tornK(b, e, x, y) < 0.4) continue;
    const rr = range(r, 14, 26);
    for (let q = 0; q < 4; q++) {
      const ring = blob(x, y, rr + q * 9, (rr + q * 9) * 0.6, seed + k + q, 0.15, 18);
      ring.push(ring[0] as number, ring[1] as number, ring[2] as number, ring[3] as number);
      p.tint(strand(ring, 3, 0.05), q % 2 ? T.nearLit : T.grain, 0.4);
    }
    p.solid(chaikin(blob(x, y, rr * 0.6, rr * 0.4, seed + k, 0.3, 10), 1), T.grain, B.backH + 0.06, {
      bark: 0.3,
    });
    const drip = [
      x,
      y + rr * 0.3,
      x + range(r, -4, 4),
      y + rr + 30,
      x + range(r, -6, 6),
      y + rr + range(r, 60, 140),
    ];
    p.tint(strand(chaikin2(drip), 4, 0.4), 0x7a4e26, 0.75);
  }
}

/**
 * Up high, near: bark strips with wide gaps (the air of the deep back shows), leaf-litter mats caught on them and
 * hanging from the ceilings.
 */
function canopyNear(p: Paint, plan: InteriorPlan, b: Rect, e: BackEdges, seed: number): void {
  const B = BRANCH;
  const T = plan.tone;
  const r = rngFor(seed, 409);
  // (Review r5 #7: five or six even posts of one width and lean to a frame read as a fibre forest. Few (at most four a
  // view), widths 3:1 and more, leaning +-8 degrees, a third of them forked, leaf clumps breaking them.)
  for (let x = b.x + range(r, 0, 300); x < b.x + b.w; x += range(r, 480, 900)) {
    const w = range(r, 30, 150);
    const kx = tornK(b, e, x, b.y + b.h / 2);
    if (kx < 0.15) continue;
    const yTop = b.y - 30 + (e.n ? range(r, 0.2, 1) * INTERIOR.tear : 0);
    const yBot = b.y + b.h + 30 - (e.s ? range(r, 0.3, 1) * INTERIOR.tear : 0);
    const lean = Math.tan(range(r, -0.14, 0.14)) * (yBot - yTop);
    const line: number[] = [];
    for (let t = 0; t <= 12; t++)
      line.push(x + lean * (t / 12 - 0.5) + range(r, -8, 8), lerp(yTop, yBot, t / 12));
    const wl = wander(line, 30, seed + Math.round(x), 300);
    if (r() < 0.34) {
      // A fork: a second limb leaving it partway up, leaning away.
      const at = Math.floor(range(r, 3, 8)) * 2;
      const fx = wl[at] as number;
      const fy = wl[at + 1] as number;
      const side = r() < 0.5 ? -1 : 1;
      const fl = range(r, 300, 700);
      const fork = [fx, fy, fx + side * fl * 0.3, fy - fl * 0.45, fx + side * fl * 0.55, fy - fl * 0.9];
      p.solid(
        ribbon(chaikin2(fork), (t) => w * 0.6 * (1 - t * 0.5)),
        T.near,
        B.backH + 0.025,
        { bark: 0.9 },
        0.85,
      );
    }
    for (let q = 0; q < 1 + Math.floor(r() * 2); q++) {
      const at = Math.floor(range(r, 1, 11)) * 2;
      const lx = wl[at] as number;
      const ly = wl[at + 1] as number;
      for (let k = 0; k < 14; k++)
        p.solid(
          leaf(lx + range(r, -70, 70), ly + range(r, -40, 40), range(r, 16, 32), range(r, 0, 6.28)),
          k % 3 ? T.near : T.nearLit,
          B.backH + 0.08,
          { bark: 0, moss: 0.4 },
          k % 3 ? 0.9 : 0.5,
        );
    }
    p.solid(
      ribbon(wl, (t) => w * (0.8 + 0.3 * wobble(t * 900, seed, 160))),
      T.near,
      B.backH + 0.03,
      { bark: 0.9 },
      0.85,
    );
    p.tint(
      ribbon(
        wl.map((v, j) => (j % 2 ? v : v + w * 0.3)),
        () => w * 0.2,
      ),
      T.nearLit,
      0.22,
    );
  }
  // Leaf-litter mats: clumps of fallen leaves caught on the bark and hanging from every ceiling.
  const spots: Array<[number, number]> = [];
  for (const m of plan.masses)
    for (const [x0, x1] of exposedSides(m, plan.masses, 1e9, 1e9).bottom) {
      const y = m.y + m.h;
      if (y > b.y && y < b.y + b.h)
        for (
          let x = Math.max(x0, b.x) + range(r, 40, 200);
          x < Math.min(x1, b.x + b.w);
          x += range(r, 260, 520)
        )
          spots.push([x, y + 20]);
    }
  for (let k = 0; k < Math.round((b.w * b.h) / 500000); k++)
    spots.push([b.x + range(r, 0, 1) * b.w, b.y + range(r, 0.05, 0.6) * b.h]);
  for (const [cx, cy] of spots) {
    if (tornK(b, e, cx, cy) < 0.2) continue;
    const n = 10 + Math.floor(r() * 16);
    for (let q = 0; q < n; q++) {
      const lx = cx + range(r, -50, 50);
      const ly = cy + range(r, -10, 70) * (1 - Math.abs(lx - cx) / 70);
      p.solid(
        leaf(lx, ly, range(r, 14, 30), range(r, 1.0, 2.2)),
        q % 3 ? T.near : T.nearLit,
        B.backH + 0.08,
        { bark: 0, moss: 0.4 },
        q % 3 ? 0.9 : 0.5,
      );
    }
  }
}

/**
 * The moonlit shaft, near (review r4 #4: the blue fibre posts ran through the chimneys and fought the faces she reads):
 * the inside of a hollow trunk, pale and cold. Its grain is fine lines, not posts: long thin strands of dark and frost,
 * broken and staggered, shallow washes of lighter wood, frost lichen in patches, a few knotholes with a lit lower lip.
 * Nothing in it stands proud or reads as a thing to climb.
 */
function shaftNear(p: Paint, plan: InteriorPlan, b: Rect, e: BackEdges, seed: number): void {
  const B = BRANCH;
  const T = plan.tone;
  const r = rngFor(seed, 437);
  // Washes: very soft broad streaks of lighter and darker wood, ragged ends, low alpha (never a post).
  for (let x = b.x + range(r, -60, 60); x < b.x + b.w; x += range(r, 140, 360)) {
    const y0 = b.y + range(r, -0.1, 0.6) * b.h;
    const len = range(r, 0.3, 0.9) * b.h;
    const kx = tornK(b, e, clamp(x, b.x, b.x + b.w), clamp(y0 + len / 2, b.y, b.y + b.h));
    if (kx < 0.2) continue;
    const line: number[] = [];
    for (let t = 0; t <= 10; t++) line.push(x + range(r, -10, 10), y0 + (len * t) / 10);
    const wl = wander(line, 34, seed + Math.round(x), 320);
    const w = range(r, 60, 180);
    p.tint(
      ribbon(wl, (t) => w * Math.sin(Math.PI * t) ** 0.6),
      r() < 0.5 ? T.nearLit : T.grain,
      range(r, 0.05, 0.1),
    );
  }
  // The grain: fine strands in staggered runs.
  for (let x = b.x + range(r, 0, 30); x < b.x + b.w; x += range(r, 18, 70)) {
    let y = b.y + range(r, -200, 200);
    while (y < b.y + b.h) {
      const len = range(r, 160, 900);
      const kx = tornK(b, e, clamp(x, b.x, b.x + b.w), clamp(y + len / 2, b.y, b.y + b.h));
      if (kx > 0.15 && r() < 0.8) {
        const line: number[] = [];
        for (let t = 0; t <= 8; t++) line.push(x + range(r, -3, 3), y + (len * t) / 8);
        const wl = wander(line, 10, seed + Math.round(x + y), 200);
        const lit = r() < 0.3;
        p.tint(
          strand(wl, lit ? range(r, 1.5, 3) : range(r, 2, 5), 0.5),
          lit ? T.nearLit : T.grain,
          lit ? 0.22 : 0.4,
        );
      }
      y += len + range(r, 40, 260);
    }
  }
  // Frost lichen: pale crusts in loose patches.
  for (let k = 0; k < Math.max(3, Math.round((b.w * b.h) / 260000)); k++) {
    const cx = b.x + range(r, 0.02, 0.98) * b.w;
    const cy = b.y + range(r, 0.02, 0.98) * b.h;
    if (tornK(b, e, cx, cy) < 0.3 || inSolid(plan.masses, cx, cy)) continue;
    const rad = range(r, 30, 90);
    for (let q = 0; q < 16; q++) {
      const a = range(r, 0, 6.28);
      const d = rad * Math.sqrt(r());
      const sr = range(r, 2, 6) * (1 - (0.5 * d) / rad);
      p.tint(
        chaikin(
          blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 1.4, sr * 1.3, sr, seed + k * 17 + q, 0.3, 8),
          1,
        ),
        INTERIOR.frost,
        range(r, 0.18, 0.4),
      );
    }
  }
  // Knotholes: dark, tall, a frosted lower lip.
  for (let k = 0; k < Math.max(1, Math.round((b.w * b.h) / 1500000)); k++) {
    const x = b.x + range(r, 0.1, 0.9) * b.w;
    const y = b.y + range(r, 0.1, 0.85) * b.h;
    if (tornK(b, e, x, y) < 0.4 || inSolid(plan.masses, x, y)) continue;
    const rx = range(r, 16, 30);
    const ry = rx * range(r, 1.6, 2.4);
    p.solid(
      chaikin(blob(x, y, rx + 8, ry + 10, seed + k, 0.25, 14), 2),
      T.near,
      B.backH + 0.05,
      { bark: 0.4 },
      0.6,
    );
    p.solid(
      chaikin(blob(x, y + 4, rx, ry, seed + k + 3, 0.25, 14), 2),
      T.grain,
      B.backH + 0.02,
      { bark: 0 },
      0.9,
    );
    const lip: number[] = [];
    for (let t = 0; t <= 8; t++) {
      const a = Math.PI * (0.15 + 0.7 * (t / 8));
      lip.push(x + Math.cos(a) * (rx + 3), y + 4 + Math.sin(a) * (ry + 3));
    }
    p.tint(strand(lip, 3, 0.3), INTERIOR.frost, 0.35);
  }
}

/** The ants' nest, near: tunnel mouths in the back with a lit rim, seed caches piled against the walls. */
function nestNear(p: Paint, plan: InteriorPlan, b: Rect, e: BackEdges, seed: number): void {
  const B = BRANCH;
  const T = plan.tone;
  const r = rngFor(seed, 419);
  for (let k = 0; k < Math.max(2, Math.round((b.w * b.h) / 600000)); k++) {
    const cx = b.x + range(r, 0.05, 0.95) * b.w;
    const cy = b.y + range(r, 0.15, 0.85) * b.h;
    if (tornK(b, e, cx, cy) < 0.4) continue;
    const rx = range(r, 40, 90);
    const ry = rx * range(r, 0.55, 0.8);
    // A mouth that deepens into the dark (rings of shade, no hard hole), its lip a little proud.
    p.solid(
      chaikin(blob(cx, cy, rx + 16, ry + 12, seed + k, 0.35, 16), 2),
      T.near,
      B.backH + 0.05,
      { bark: 0.1 },
      0.6,
    );
    for (let q = 0; q < 4; q++) {
      const f = 1 - q * 0.2;
      p.solid(
        chaikin(blob(cx + q * 3, cy + 4 + q * 3, rx * f, ry * f, seed + k + 5 + q, 0.35, 16), 2),
        T.grain,
        B.backH - 0.04 - q * 0.02,
        { bark: 0 },
        0.35,
      );
    }
    const rim: number[] = [];
    for (let t = 0; t <= 10; t++) {
      const a = Math.PI * (1.1 + 0.8 * (t / 10));
      rim.push(cx + Math.cos(a) * (rx + 4), cy + Math.sin(a) * (ry + 4));
    }
    p.tint(strand(rim, 3, 0.3), T.nearLit, 0.25);
  }
  // Seed caches against the walls on the floors.
  for (const [x0, x1, y] of topsIn(plan, b)) {
    if (x1 - x0 < 300 || r() < 0.4) continue;
    const x = r() < 0.5 ? x0 + range(r, 40, 120) : x1 - range(r, 40, 120);
    for (let q = 0; q < 9; q++) {
      const rad = range(r, 8, 15);
      const sx = x + range(r, -40, 40);
      const sy = y - rad * 0.8 - (q > 5 ? rad * 1.2 : 0);
      p.solid(chaikin(blob(sx, sy, rad * 1.2, rad, seed + q, 0.15, 12), 1), T.root, B.walkH - 0.04, {
        bark: 0.2,
      });
      p.tint(
        chaikin(blob(sx - rad * 0.3, sy - rad * 0.4, rad * 0.5, rad * 0.3, seed + q + 3, 0.2, 8), 1),
        T.rootLit,
        0.6,
      );
    }
  }
}

/** The burrbacks' den, near: shed shells against the walls, the old one's scrapes low on the back. */
function denNear(p: Paint, plan: InteriorPlan, b: Rect, e: BackEdges, seed: number): void {
  const B = BRANCH;
  const T = plan.tone;
  const r = rngFor(seed, 431);
  for (const [x0, x1, y] of topsIn(plan, b)) {
    if (x1 - x0 < 360) continue;
    // A shed shell or two (pale plated domes, cast off and lying on their side).
    for (let q = 0; q < (x1 - x0 > 1400 ? 2 : 1); q++) {
      const x = r() < 0.5 ? x0 + range(r, 60, 260) : x1 - range(r, 60, 260);
      const R = range(r, 30, 56);
      const dome: number[] = [];
      for (let t = 0; t <= 14; t++) {
        const a = Math.PI + (Math.PI * t) / 14;
        dome.push(x + Math.cos(a) * R * 1.3, y + 4 + Math.sin(a) * R);
      }
      p.solid(dome, 0x4a4456, B.backH + 0.2, { bark: 0.1 });
      for (let k = 1; k < 4; k++) {
        const a = Math.PI + (Math.PI * k) / 4;
        p.tint(
          strand([x, y + 4, x + Math.cos(a) * R * 1.3, y + 4 + Math.sin(a) * R], 2.5, 0.3),
          0x1a1620,
          0.7,
        );
      }
      p.tint(chaikin(blob(x - R * 0.3, y - R * 0.6, R * 0.5, R * 0.18, seed + q, 0.2, 10), 1), 0x8a8094, 0.5);
    }
    // Scrapes on the back above the floor.
    for (let x = x0 + range(r, 100, 400); x < x1 - 100; x += range(r, 500, 900)) {
      const yy = y - range(r, 80, 260);
      if (tornK(b, e, x, yy) < 0.3) continue;
      const len = range(r, 90, 170);
      const sl = range(r, -0.6, 0.6);
      for (let q = 0; q < 3; q++) {
        const ox = q * 14;
        const line = [
          x + ox,
          yy + q * 5,
          x + ox + len * sl * 0.5,
          yy + len * 0.5,
          x + ox + len * sl,
          yy + len,
        ];
        p.tint(strand(line, 6, 0.5), T.grain, 0.8);
        p.tint(
          strand(
            line.map((v, j) => (j % 2 ? v : v + 3)),
            2,
            0.5,
          ),
          T.nearLit,
          0.45,
        );
      }
    }
  }
}

/** Points turned by `a` about (cx, cy). */
function turn(pts: number[], cx: number, cy: number, a: number): number[] {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  const out: number[] = [];
  for (let k = 0; k < pts.length; k += 2) {
    const dx = (pts[k] as number) - cx;
    const dy = (pts[k + 1] as number) - cy;
    out.push(cx + dx * c - dy * sn, cy + dx * sn + dy * c);
  }
  return out;
}

/** A leaf: a pointed lens at (x, y), `l` long, turned by `a`. */
function leaf(x: number, y: number, l: number, a: number): number[] {
  const pts: number[] = [];
  const c = Math.cos(a);
  const sn = Math.sin(a);
  for (let k = 0; k <= 12; k++) {
    const t = (k / 12) * Math.PI * 2;
    const u = Math.cos(t) * l * 0.5;
    const v = Math.sin(t) * l * 0.2 * Math.abs(Math.sin(t / 2) + 0.3);
    pts.push(x + u * c - v * sn, y + u * sn + v * c);
  }
  return pts;
}

function chaikin2(pts: number[]): number[] {
  let out = pts;
  for (let k = 0; k < 2; k++) {
    const n = out.length / 2;
    const next: number[] = [out[0] as number, out[1] as number];
    for (let i = 0; i < n - 1; i++) {
      const ax = out[i * 2] as number;
      const ay = out[i * 2 + 1] as number;
      const bx = out[i * 2 + 2] as number;
      const by = out[i * 2 + 3] as number;
      next.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
    }
    next.push(out[out.length - 2] as number, out[out.length - 1] as number);
    out = next;
  }
  return out;
}

/**
 * The glowing growth itself, baked with the playfield (its light is live: layers/interior.ts): moss cushions on the
 * tops, shelf fungi on the faces (pale gills under a dark cap), the worms' threads.
 */
export function paintGlowFlora(p: Paint, plan: InteriorPlan): void {
  const B = BRANCH;
  for (const l of plan.lights) {
    const r = rngFor(l.seed, 61);
    if (l.kind === 'moss') {
      for (let k = 0; k < 7; k++) {
        const x = l.x + range(r, -1, 1) * l.s;
        const rad = range(r, 4, 9);
        p.solid(
          chaikin(blob(x, l.y - rad * 0.35, rad * 1.3, rad * 0.8, l.seed + k, 0.3, 10), 1),
          plan.look === 'shaft' ? 0x4a6a88 : 0x2a6a70,
          B.walkH + 0.24,
          { moss: 1 },
        );
        p.tint(
          chaikin(blob(x - rad * 0.2, l.y - rad * 0.6, rad * 0.7, rad * 0.4, l.seed + k + 9, 0.3, 8), 1),
          plan.look === 'shaft' ? 0xdcecff : 0x9fe8e8,
          0.8,
        );
      }
    } else if (l.kind === 'fungus') {
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const y = l.y + (k - (n - 1) / 2) * l.s * 0.9 + range(r, -6, 6);
        const w = l.s * range(r, 0.7, 1.2);
        const x = l.x + l.dir * w * 0.45;
        // The cap: a half-disc out of the face, the gills a pale band under it.
        const cap: number[] = [];
        for (let a = 0; a <= 10; a++) {
          const t = (a / 10) * Math.PI;
          cap.push(x + l.dir * Math.sin(t) * w * 0.55, y - Math.cos(t) * w * 0.32 - w * 0.08);
        }
        p.solid(cap, l.violet ? 0x2c1a3a : 0x14303a, B.walkH + 0.1, { bark: 0 });
        p.tint(
          ribbon([x, y + w * 0.1, x + l.dir * w * 0.5, y + w * 0.02], () => w * 0.12),
          l.violet ? 0xd8b0ff : 0xb8f6ff,
          0.85,
        );
      }
    } else if (l.kind === 'sap') {
      // Sap welling out of the face in beads, a run of it down the bark.
      for (let k = 0; k < 5; k++) {
        const y = l.y + range(r, -l.s, l.s);
        const x = l.x - l.dir * range(r, 2, 10);
        const rad = range(r, 3, 6);
        p.solid(chaikin(blob(x, y, rad, rad * 1.2, l.seed + k, 0.15, 10), 1), 0x6a3c18, B.walkH + 0.12, {
          bark: 0,
        });
        p.tint(
          chaikin(blob(x - rad * 0.3, y - rad * 0.4, rad * 0.4, rad * 0.4, l.seed + k + 9, 0.1, 8), 1),
          0xffc070,
          0.8,
        );
      }
      p.tint(
        strand(
          [l.x - l.dir * 6, l.y, l.x - l.dir * 7, l.y + l.s * 2, l.x - l.dir * 5, l.y + l.s * 3.5],
          3,
          0.5,
        ),
        0x8a5020,
        0.7,
      );
    } else if (l.kind === 'larva') {
      // A cell in the earth, pale grubs curled in it.
      p.solid(chaikin(blob(l.x, l.y, l.s * 1.2, l.s * 0.8, l.seed, 0.25, 14), 2), 0x15131a, B.backH + 0.02, {
        bark: 0,
      });
      for (let k = 0; k < 4; k++) {
        const x = l.x + range(r, -0.6, 0.6) * l.s;
        const y = l.y + range(r, -0.3, 0.4) * l.s;
        p.solid(chaikin(blob(x, y, 9, 6, l.seed + k, 0.2, 10), 1), 0xd8d8b0, B.backH + 0.1, { bark: 0 }, 0.9);
      }
    } else if (l.kind === 'worm') {
      // (The thread only: the beads are live.)
      const line = [l.x, l.y, l.x + 3, l.y + l.s * 0.5, l.x - 2, l.y + l.s];
      p.tint(strand(chaikin2(line), 1.6, 0.2), 0x6a8a9a, 0.5);
    }
  }
}

/** A band across [x0, x1] centred on y, `h` tall, its edges wavering (no ruled line: the fork's seam, the checker). */
function wavyBand(x0: number, x1: number, y: number, h: number, seed: number, amp = 0.35): number[] {
  const top: number[] = [];
  const bot: number[] = [];
  const st = Math.max(40, (x1 - x0) / 60);
  for (let x = x0; x <= x1 + 0.01; x += st) {
    top.push(x, y - h / 2 + h * amp * wobble(x, seed, 520) + h * 0.15 * wobble(x, seed + 3, 140));
    bot.push(x, y + h / 2 + h * amp * wobble(x, seed + 7, 610) + h * 0.15 * wobble(x, seed + 9, 160));
  }
  for (let k = bot.length / 2 - 1; k >= 0; k--) top.push(bot[k * 2] as number, bot[k * 2 + 1] as number);
  return top;
}

/** A soft gradient as many faint wavering bands: from y0 (alpha 0) to y1 (alpha `a`), or the reverse. */
function softGrad(
  g: { poly(pts: number[]): { fill(o: { color: number; alpha?: number }): unknown } },
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  color: number,
  a: number,
  seed: number,
): void {
  const n = 18;
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  for (let k = 0; k < n; k++) {
    // Each band reaches from the dense end to a step further: their overlaps build the ramp.
    const f = (k + 1) / n;
    const yA = y1 > y0 ? y1 - (y1 - y0) * f : y1;
    const yB = y1 > y0 ? y1 + 60 : y1 + (y0 - y1) * f;
    const yc = (Math.max(lo - 60, yA) + Math.min(hi + 60, yB)) / 2;
    const h = Math.abs(yB - yA);
    g.poly(wavyBand(x0, x1, yc, h, seed + k * 13, 0.12)).fill({ color, alpha: a / n });
  }
}

/** The heartwood's grain angle for a room (radians off the horizontal: the giant lies diagonal across the frame). */
export function heartAngle(plan: InteriorPlan): number {
  const r = rngFor(plan.backs.length, Math.round((plan.backs[0]?.x ?? 0) + (plan.backs[0]?.w ?? 0) * 3), 83);
  return (r() < 0.5 ? -1 : 1) * range(r, 0.22, 0.5);
}

/** The deep back: lighter and softer than the near back, grain and dim roots, a fog band across it (layer coords). */
export function drawDeepBack(
  g: {
    poly(pts: number[]): { fill(o: { color: number; alpha?: number }): unknown };
    rect(x: number, y: number, w: number, h: number): { fill(o: { color: number; alpha?: number }): unknown };
    circle(x: number, y: number, r: number): { fill(o: { color: number; alpha?: number }): unknown };
  },
  plan: InteriorPlan,
  seed: number,
  pad: number,
): void {
  const T = plan.tone;
  plan.backs.forEach((b0, i) => {
    const b = { x: b0.x - pad, y: b0.y - pad, w: b0.w + pad * 2, h: b0.h + pad * 2 };
    const r = rngFor(seed, b0.x, b0.y, 71);
    g.rect(b.x, b.y, b.w, b.h).fill({ color: T.deep });
    // (Review r4 #6: straight vertical grain ribbons crossed by ruled fog rects read as a checker. Nothing here is a
    // ruled band: grain wanders and breaks, fog and light are wavering gradients.)
    if (plan.look === 'shaft') {
      // The hollow trunk's inside: a cold glow down from the moon, darker low; fine broken grain.
      softGrad(g, b.x, b.x + b.w, b0.y - 200, b0.y + b0.h * 0.7, T.fog, 0.32, seed + i * 5);
      softGrad(g, b.x, b.x + b.w, b0.y + b0.h * 0.55, b0.y + b0.h + pad, T.grain, 0.4, seed + i * 5 + 3);
      for (let x = b.x; x < b.x + b.w; x += range(r, 30, 110)) {
        let y = b.y + range(r, 0, 300);
        while (y < b.y + b.h) {
          const len = range(r, 300, 1400);
          const line: number[] = [];
          for (let t = 0; t <= 10; t++) line.push(x + range(r, -3, 3), y + (len * t) / 10);
          const wl = wander(line, 26, seed + Math.round(x + y), 400);
          g.poly(strand(wl, range(r, 3, 14), 0.5)).fill({
            color: r() < 0.4 ? T.deepLit : T.grain,
            alpha: range(r, 0.1, 0.24),
          });
          y += len + range(r, 60, 400);
        }
      }
    } else if (plan.look === 'canopy') {
      // Up in the crowns: dim limbs crossing at angles, leaf mats over them (below: the gaps to the night).
      for (let k = 0; k < Math.max(2, Math.round((b.w * b.h) / 1400000)); k++) {
        const x0 = b.x + range(r, 0, 1) * b.w;
        const y0 = b.y + range(r, 0, 1) * b.h;
        const a = range(r, -1.2, 1.2) + (r() < 0.5 ? Math.PI : 0);
        const len = range(r, 500, 1300);
        const line: number[] = [];
        for (let t = 0; t <= 10; t++)
          line.push(x0 + Math.cos(a) * len * (t / 10), y0 + Math.sin(a) * len * (t / 10));
        const wl = wander(line, 50, seed + k * 7 + i, 300);
        const w0 = range(r, 30, 80);
        g.poly(ribbon(wl, (t) => w0 * (1 - t * 0.7))).fill({ color: T.grain, alpha: range(r, 0.35, 0.55) });
      }
      for (let k = 0; k < Math.round((b.w * b.h) / 220000); k++) {
        const cx = b.x + range(r, 0, 1) * b.w;
        const cy = b.y + range(r, 0, 1) * b.h;
        const rx = range(r, 50, 160);
        const ry = rx * range(r, 0.35, 0.6);
        const lit = r() < 0.45;
        const nl = Math.round(rx / 5);
        for (let q = 0; q < nl; q++) {
          const ang = range(r, 0, 6.28);
          const d = Math.sqrt(r());
          g.poly(
            leaf(
              cx + Math.cos(ang) * rx * d,
              cy + Math.sin(ang) * ry * d,
              range(r, 12, 28),
              range(r, 0.6, 2.6),
            ),
          ).fill({ color: lit && q % 3 ? T.deepLit : T.grain, alpha: range(r, 0.25, 0.55) });
        }
      }
    } else if (plan.look === 'heartwood') {
      // Inside the fallen giant (review r5 #7: full-width horizontal bands and concentric rings read as sepia striped
      // wallpaper and a target): the grain runs along the giant, diagonal to the frame (one lean per room), in broken
      // panels 300-900 px long with dark splits between; light from above through cracks. No rings (a cut end shows
      // them: the fallen burls).
      const ang = heartAngle(plan);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      // Panels, laid in lanes across the grain, staggered along it.
      const diag = Math.hypot(b.w, b.h);
      const cx0 = b.x + b.w / 2;
      const cy0 = b.y + b.h / 2;
      for (let v = -diag / 2; v < diag / 2; v += range(r, 70, 190)) {
        let u = -diag / 2 - range(r, 0, 500);
        const wd = range(r, 50, 170);
        while (u < diag / 2) {
          const len = range(r, 300, 900);
          const pts: number[] = [];
          const lo: number[] = [];
          for (let q = 0; q <= 12; q++) {
            const t = q / 12;
            const uu = u + len * t;
            const half =
              (wd / 2) * Math.sin(Math.PI * t) ** 0.35 * (0.8 + 0.3 * wobble(uu, seed + Math.round(v), 160));
            const px = cx0 + uu * ca - v * sa;
            const py = cy0 + uu * sa + v * ca;
            pts.push(px + half * sa, py - half * ca);
            lo.push(px - half * sa, py + half * ca);
          }
          for (let q = lo.length / 2 - 1; q >= 0; q--) pts.push(lo[q * 2] as number, lo[q * 2 + 1] as number);
          const lit = r() < 0.4;
          g.poly(pts).fill({
            color: lit ? T.deepLit : T.grain,
            alpha: lit ? range(r, 0.14, 0.3) : range(r, 0.18, 0.36),
          });
          // Grain inside the panel, along it.
          for (let q = 0; q < 2; q++) {
            const vv = v + range(r, -0.3, 0.3) * wd;
            const line: number[] = [];
            for (let t = 0; t <= 8; t++) {
              const uu = u + len * (0.1 + 0.8 * (t / 8));
              line.push(cx0 + uu * ca - vv * sa, cy0 + uu * sa + vv * ca + 4 * wobble(uu, seed + q, 90));
            }
            g.poly(strand(line, range(r, 2, 5), 0.3)).fill({ color: T.grain, alpha: 0.3 });
          }
          u += len + range(r, 30, 160);
        }
      }
      // Light from above: a soft glow at the top and a few cracks letting it in, slanting down.
      softGrad(g, b.x, b.x + b.w, b0.y + b0.h * 0.5, b0.y - pad * 0.5, T.deepLit, 0.3, seed + i * 41);
      for (let k = 0; k < Math.max(1, Math.round(b.w / 1400)); k++) {
        const x = b.x + range(r, 0.1, 0.9) * b.w;
        const len = range(r, 300, 900);
        const line: number[] = [];
        for (let t = 0; t <= 10; t++)
          line.push(x + (t / 10) * len * 0.35 + range(r, -6, 6), b0.y - 40 + (t / 10) * len);
        g.poly(strand(line, range(r, 5, 12), 0.6)).fill({ color: T.nearLit, alpha: 0.22 });
      }
    } else {
      // Strata: long soft lenses across the earth, broken, of uneven thickness (few and faint in the den).
      const denK = plan.look === 'den' ? 2.6 : 1;
      for (let y = b.y; y < b.y + b.h; y += range(r, 40, 160) * denK) {
        let x = b.x - range(r, 0, 300);
        while (x < b.x + b.w) {
          const len = range(r, 400, 1800);
          const line: number[] = [];
          for (let xx = x; xx <= x + len; xx += 80)
            line.push(xx, y + 24 * wobble(xx, seed + Math.round(y), 600));
          if (line.length >= 6)
            g.poly(strand(line, range(r, 12, 50), 0.3)).fill({
              color: r() < 0.5 ? T.deepLit : T.grain,
              alpha: range(r, 0.16, 0.36),
            });
          x += len + range(r, 30, 300);
        }
      }
      // Far root curtains, faint.
      for (let x = b.x; x < b.x + b.w; x += range(r, 30, 110)) {
        const len = range(r, 80, 520);
        const line = [
          x,
          b.y + pad - 20,
          x + range(r, -20, 20),
          b.y + pad + len * 0.5,
          x + range(r, -30, 30),
          b.y + pad + len,
        ];
        g.poly(strand(chaikin2(line), range(r, 3, 7), 0.6)).fill({ color: T.rootLit, alpha: 0.16 });
      }
    }
    // What only this place has.
    if (plan.look === 'canopy') {
      // Gaps in the canopy: the night air through them, leaves round their rims, and leaf clusters on the bark.
      for (let k = 0; k < Math.max(2, Math.round(b0.w / 900)); k++) {
        const cx = b0.x + range(r, 0.1, 0.9) * b0.w;
        const cy = b0.y + range(r, 0.05, 0.45) * b0.h;
        // (Ragged and wider than tall: a round one read as a porthole.)
        const rx = range(r, 70, 170);
        const ry = rx * range(r, 0.4, 0.7);
        // (A hole to the night sky, darker than the bark round it: pale blobs read as smoke.)
        g.poly(chaikin(blob(cx, cy, rx, ry, seed + k * 11, 0.4, 18), 2)).fill({
          color: 0x0c1828,
          alpha: 0.7,
        });
        for (let q = 0; q < 6; q++)
          g.circle(cx + (r() - 0.5) * rx, cy + (r() - 0.5) * ry, 1.4 + r()).fill({
            color: 0xcfe0f4,
            alpha: 0.6,
          });
        for (let q = 0; q < 26; q++) {
          const a = (q / 26) * 6.28 + range(r, -0.1, 0.1);
          const lx = cx + Math.cos(a) * rx * range(r, 0.8, 1.15);
          const ly = cy + Math.sin(a) * ry * range(r, 0.8, 1.15);
          g.poly(leaf(lx, ly, range(r, 12, 26), a + range(r, -0.6, 0.6))).fill({
            color: T.grain,
            alpha: 0.85,
          });
        }
      }
    } else if (plan.look === 'shaft') {
      // The cold beam's haze down the middle of the shaft: wavering soft columns (ruled rects made a checker).
      const mx = b0.x + b0.w * 0.5;
      for (let k = 0; k < 8; k++) {
        const w = b0.w * (0.1 + k * 0.07);
        const line: number[] = [];
        for (let t = 0; t <= 12; t++)
          line.push(mx + 30 * wobble(t * 300, seed + k, 900), lerp(b.y, b.y + b.h, t / 12));
        g.poly(ribbon(line, (t) => w * (0.85 + 0.3 * wobble(t * 3000, seed + k * 3, 700)))).fill({
          color: T.fog,
          alpha: 0.035,
        });
      }
    } else if (plan.look === 'nest') {
      // Tunnels and chambers through the earth.
      for (let k = 0; k < Math.max(2, Math.round((b0.w * b0.h) / 700000)); k++) {
        const pts: number[] = [];
        let x = b0.x + range(r, 0, 1) * b0.w;
        let y = b0.y + range(r, 0.1, 0.9) * b0.h;
        let a = range(r, 0, 6.28);
        for (let t = 0; t < 14; t++) {
          pts.push(x, y);
          a += range(r, -0.7, 0.7);
          x += Math.cos(a) * 60;
          y += Math.sin(a) * 36;
        }
        const w = range(r, 26, 44);
        g.poly(strand(pts, w, 0.15)).fill({ color: T.grain, alpha: 0.4 });
        g.poly(
          strand(
            pts.map((v, j) => (j % 2 ? v - w * 0.45 : v)),
            3,
            0.15,
          ),
        ).fill({ color: T.deepLit, alpha: 0.4 });
        g.poly(chaikin(blob(x, y, range(r, 50, 90), range(r, 30, 50), seed + k, 0.3, 14), 2)).fill({
          color: T.grain,
          alpha: 0.6,
        });
      }
    } else if (plan.look === 'den') {
      // Lit from below: the fungus on the floor throws a cold glow up the earth; dark roots hang into it from the roof.
      softGrad(
        g,
        b.x,
        b.x + b.w,
        b0.y + b0.h * 0.35,
        b0.y + b0.h + pad * 0.5,
        DEN_FUNGUS,
        0.34,
        seed + i * 43,
      );
      for (let x = b.x + range(r, 0, 120); x < b.x + b.w; x += range(r, 90, 260)) {
        const len = range(r, 0.15, 0.55) * b0.h;
        const raw: number[] = [];
        for (let t = 0; t <= 10; t++)
          raw.push(
            x + range(r, -8, 8) + Math.sin(t * 0.7 + x) * 20 * (t / 10),
            b.y + pad * 0.3 + (len * t) / 10 - 40,
          );
        const w0 = range(r, 10, 36);
        g.poly(
          ribbon(wander(raw, 20, seed + Math.round(x), 200), (t) => Math.max(2, w0 * (1 - t) ** 0.8)),
        ).fill({
          color: T.grain,
          alpha: range(r, 0.5, 0.8),
        });
      }
      // Scrapes: the old burrback's claws, raked across the earth in threes.
      for (let k = 0; k < Math.max(3, Math.round(b0.w / 500)); k++) {
        const x = b0.x + range(r, 0, 1) * b0.w;
        const y = b0.y + range(r, 0.3, 0.9) * b0.h;
        const len = range(r, 120, 240);
        const sl = range(r, -0.5, 0.5);
        for (let q = 0; q < 3 + (r() < 0.4 ? 1 : 0); q++) {
          const ox = q * 16;
          g.poly(
            strand(
              [x + ox, y + q * 6, x + ox + len * sl * 0.5, y + len * 0.5, x + ox + len * sl, y + len],
              7,
              0.5,
            ),
          ).fill({ color: T.deepLit, alpha: 0.32 });
        }
      }
    }
    // Dim great roots crossing, far off.
    for (let k = 0; k < Math.max(1, Math.round(b.w / 1100)); k++) {
      const x = b.x + range(r, 0, b.w);
      const line: number[] = [];
      for (let t = 0; t <= 10; t++) line.push(x + range(r, -40, 40) * t * 0.2, b.y + (b.h * t) / 10);
      const wl = wander(line, 80, seed + k * 5 + i, 300);
      const w0 = range(r, 50, 110);
      g.poly(ribbon(wl, (t) => w0 * (1 - t * 0.5))).fill({ color: T.grain, alpha: 0.45 });
    }
    // The fog between the planes: a soft wavering swell, thicker low, so the deep reads as far.
    const fogY = b0.y + b0.h * 0.62;
    for (let k = 0; k < 14; k++) {
      const h = b0.h * (0.1 + k * 0.045);
      g.poly(wavyBand(b.x, b.x + b.w, fogY, h, seed + i * 31 + k * 7, 0.18)).fill({
        color: T.fog,
        alpha: 0.02,
      });
    }
    softGrad(g, b.x, b.x + b.w, b0.y + b0.h - 700, b0.y + b0.h + pad, T.fog, 0.16, seed + i * 37);
  });
}

/**
 * How far into back i the deep mask is drawn at a point along an edge (px; negative = out past it, under the mass): a
 * free edge well in, behind the near back's torn fibres (they stand against the open air beyond it), wavering so no
 * ruled line shows; partly open edges only where they are open.
 */
export function backBite(
  plan: InteriorPlan,
  i: number,
  seed: number,
): (side: 'n' | 's' | 'w' | 'e', v: number) => number {
  const e = plan.edges[i] as BackEdges;
  const off: Record<string, number> = { n: 0, e: 500, s: 900, w: 1300 };
  return (side, v) => {
    if (!e[side]) return -40;
    const o = e.at ? e.at(side, v) : 1;
    const k = Math.round(v / 20) + (off[side] as number);
    const deep =
      INTERIOR.tear * 0.75 +
      120 * wobble(k * 20, seed + i * 13, 140) +
      60 * wobble(k * 20, seed + i * 7, 600);
    return lerp(-40, deep, o);
  };
}

/** The deep back's mask: each back, its free edges torn and drawn in (playfield coords). */
export function backMask(plan: InteriorPlan, seed: number): number[][] {
  return plan.backs.map((b, i) => {
    const bite = backBite(plan, i, seed);
    const pts: number[] = [];
    const st = 20;
    for (let x = b.x; x < b.x + b.w; x += st) pts.push(x, b.y + bite('n', x));
    for (let y = b.y; y < b.y + b.h; y += st) pts.push(b.x + b.w - bite('e', y), y);
    for (let x = b.x + b.w; x > b.x; x -= st) pts.push(x, b.y + b.h - bite('s', x));
    for (let y = b.y + b.h; y > b.y; y -= st) pts.push(b.x + bite('w', y), y);
    return chaikin(pts, 2);
  });
}

/**
 * The shade along each free edge of the deep mask, inside it (review r3 #2: the hard edge cut pale shapes out of the
 * night; r4 #6: wide strokes along a jagged outline made angular flaps and fans): bands that follow the bite inward,
 * each a step deeper, so the deep fades into shadow toward the open air. Playfield coords.
 */
export function backEdgeShade(plan: InteriorPlan, seed: number): Array<{ pts: number[]; alpha: number }> {
  const out: Array<{ pts: number[]; alpha: number }> = [];
  const steps = 7;
  const reach = 300;
  plan.backs.forEach((b, i) => {
    const e = plan.edges[i] as BackEdges;
    const bite = backBite(plan, i, seed);
    const st = 20;
    for (const side of ['n', 's', 'w', 'e'] as const) {
      if (!e[side]) continue;
      const horiz = side === 'n' || side === 's';
      const a0 = horiz ? b.x : b.y;
      const a1 = horiz ? b.x + b.w : b.y + b.h;
      for (let k = 0; k < steps; k++) {
        const d = (reach * (k + 1)) / steps;
        const outer: number[] = [];
        const inner: number[] = [];
        for (let v = a0; v <= a1 + 0.01; v += st) {
          const o = e.at ? e.at(side, v) : 1;
          const b0 = bite(side, v) - 8;
          const b1 = b0 + d * o;
          const at = (dd: number): [number, number] =>
            side === 'n'
              ? [v, b.y + dd]
              : side === 's'
                ? [v, b.y + b.h - dd]
                : side === 'w'
                  ? [b.x + dd, v]
                  : [b.x + b.w - dd, v];
          outer.push(...at(b0));
          inner.push(...at(b1));
        }
        for (let j = inner.length / 2 - 1; j >= 0; j--)
          outer.push(inner[j * 2] as number, inner[j * 2 + 1] as number);
        out.push({ pts: outer, alpha: 0.13 });
      }
    }
  });
  return out;
}

/** A colour `t` of the way from c0 to c1. */
function mixC(c0: number, c1: number, t: number): number {
  const ch = (c: number, sh: number) => (c >> sh) & 255;
  const m = (sh: number) => Math.round(lerp(ch(c0, sh), ch(c1, sh), t));
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/**
 * The mid plane (review r5 #7: one flat back behind the play where Silksong has busy mid-value moss lobes behind fog
 * and HK three depths of lit arches): between the playfield and the deep back (parallax `INTERIOR.midParallax`), its
 * value `midValue` of the way from the mass to the fog, covering about `midCover` of the back, in the look's own
 * shapes. Nothing in it has a lit flat top (a background shape must never read as a platform).
 * - shaft: frost-root arches and hanging lichen;
 * - heartwood: split grain panels along the giant and sap-lit knots;
 * - nest: chambers and galleries in silhouette;
 * - canopy: forked branches with leaf clumps;
 * - den: roots hanging from the roof and old shells.
 */
export function drawMidBack(
  g: { poly(pts: number[]): { fill(o: { color: number; alpha?: number }): unknown } },
  plan: InteriorPlan,
  seed: number,
  pad: number,
  massBody: number,
): void {
  const T = plan.tone;
  const col = mixC(massBody, T.fog, INTERIOR.midValue);
  const dark = mixC(massBody, T.fog, INTERIOR.midValue * 0.55);
  const lit = mixC(massBody, T.fog, Math.min(0.85, INTERIOR.midValue + 0.25));
  plan.backs.forEach((b0) => {
    const b = { x: b0.x - pad, y: b0.y - pad, w: b0.w + pad * 2, h: b0.h + pad * 2 };
    const r = rngFor(seed, b0.x, b0.y, 97);
    const area = b.w * b.h;
    let covered = 0;
    const want = area * INTERIOR.midCover;
    const fill = (pts: number[], c: number, a = 0.92, est = 0): void => {
      g.poly(pts).fill({ color: c, alpha: a });
      covered += est;
    };
    let guard = 0;
    if (plan.look === 'heartwood') {
      const ang = heartAngle(plan);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      while (covered < want && guard++ < 400) {
        const cx = b.x + r() * b.w;
        const cy = b.y + r() * b.h;
        const len = range(r, 380, 980);
        const wd = range(r, 90, 240);
        const up: number[] = [];
        const lo: number[] = [];
        for (let q = 0; q <= 14; q++) {
          const t = q / 14;
          const u = (t - 0.5) * len;
          const half = (wd / 2) * Math.sin(Math.PI * t) ** 0.4 * (0.75 + 0.35 * wobble(u, seed + q, 140));
          const px = cx + u * ca;
          const py = cy + u * sa;
          up.push(px + half * sa, py - half * ca);
          lo.push(px - half * sa, py + half * ca);
        }
        const pts = [...up];
        for (let q = lo.length / 2 - 1; q >= 0; q--) pts.push(lo[q * 2] as number, lo[q * 2 + 1] as number);
        fill(pts, r() < 0.3 ? lit : col, 0.9, len * wd * 0.7);
        // A split down its length, dark.
        const sp: number[] = [];
        const off = range(r, -0.25, 0.25) * wd;
        for (let q = 1; q < 10; q++) {
          const u = (q / 10 - 0.5) * len * 0.85;
          sp.push(cx + u * ca - off * sa, cy + u * sa + off * ca + 5 * wobble(u, seed + 5, 80));
        }
        g.poly(strand(sp, range(r, 5, 12), 0.2)).fill({ color: dark, alpha: 0.9 });
        // A sap-lit knot now and then.
        if (r() < 0.35) {
          const kx = cx + range(r, -0.3, 0.3) * len * ca;
          const ky = cy + range(r, -0.3, 0.3) * len * sa;
          g.poly(chaikin(blob(kx, ky, 18, 12, seed + guard, 0.3, 12), 1)).fill({ color: dark, alpha: 0.95 });
          g.poly(chaikin(blob(kx, ky + 2, 7, 5, seed + guard + 1, 0.3, 10), 1)).fill({
            color: INTERIOR.sap,
            alpha: 0.5,
          });
        }
      }
    } else if (plan.look === 'shaft') {
      while (covered < want && guard++ < 400) {
        if (r() < 0.55) {
          // A frost-root arch: a thick root bowing across, its ends running off into the back.
          const x0 = b.x + r() * b.w;
          const y0 = b.y + r() * b.h;
          const span = range(r, 300, 820);
          const rise = span * range(r, 0.25, 0.6);
          const dir = r() < 0.5 ? -1 : 1;
          const line: number[] = [];
          for (let q = 0; q <= 14; q++) {
            const t = q / 14;
            line.push(
              x0 + dir * span * t,
              y0 - rise * Math.sin(Math.PI * t) + 30 * wobble(t * 900, seed + guard, 300),
            );
          }
          const w0 = range(r, 26, 66);
          fill(
            ribbon(line, (t) => w0 * (0.7 + 0.5 * Math.abs(t - 0.5))),
            col,
            0.9,
            span * w0,
          );
          g.poly(
            strand(
              line.map((v, j) => (j % 2 ? v - w0 * 0.32 : v)),
              w0 * 0.2,
              0.3,
            ),
          ).fill({ color: lit, alpha: 0.6 });
        } else {
          // Hanging lichen: a cluster of fine strands from a root above.
          const x = b.x + r() * b.w;
          const y = b.y + r() * b.h * 0.7;
          const n = 6 + Math.floor(r() * 10);
          for (let q = 0; q < n; q++) {
            const len = range(r, 80, 340);
            const xx = x + range(r, -50, 50);
            const line = [xx, y, xx + range(r, -10, 10), y + len * 0.5, xx + range(r, -20, 20), y + len];
            fill(strand(chaikin2(line), range(r, 4, 10), 0.6), q % 3 ? col : lit, 0.85, len * 7);
          }
        }
      }
    } else if (plan.look === 'nest') {
      while (covered < want && guard++ < 400) {
        // A chamber: a rounded mound of packed earth with its mouth dark in it, a gallery running off from it.
        const cx = b.x + r() * b.w;
        const cy = b.y + r() * b.h;
        const rx = range(r, 140, 340);
        const ry = rx * range(r, 0.55, 0.85);
        fill(chaikin(blob(cx, cy, rx, ry, seed + guard, 0.3, 18), 2), col, 0.9, Math.PI * rx * ry * 0.9);
        g.poly(
          chaikin(
            blob(
              cx + range(r, -0.2, 0.2) * rx,
              cy + ry * 0.15,
              rx * 0.42,
              ry * 0.36,
              seed + guard + 3,
              0.3,
              14,
            ),
            2,
          ),
        ).fill({
          color: dark,
          alpha: 0.95,
        });
        const pts: number[] = [];
        let x = cx;
        let y = cy;
        let a = range(r, 0, 6.28);
        for (let t = 0; t < 12; t++) {
          pts.push(x, y);
          a += range(r, -0.6, 0.6);
          x += Math.cos(a) * 70;
          y += Math.sin(a) * 40;
        }
        fill(strand(pts, range(r, 40, 70), 0.15), col, 0.9, 12 * 70 * 55);
        g.poly(strand(pts, range(r, 14, 22), 0.15)).fill({ color: dark, alpha: 0.9 });
      }
    } else if (plan.look === 'canopy') {
      while (covered < want && guard++ < 400) {
        // A branch fork: a limb rising at a slant and splitting, leaf clumps at its tips.
        const x0 = b.x + r() * b.w;
        const y0 = b.y + r() * b.h;
        const a0 = -Math.PI / 2 + range(r, -0.9, 0.9);
        const len = range(r, 300, 700);
        const xm = x0 + Math.cos(a0) * len;
        const ym = y0 + Math.sin(a0) * len;
        const w0 = range(r, 24, 60);
        fill(
          ribbon(
            wander([x0, y0, (x0 + xm) / 2, (y0 + ym) / 2, xm, ym], 20, seed + guard, 200),
            (t) => w0 * (1 - t * 0.35),
          ),
          col,
          0.9,
          len * w0,
        );
        for (const da of [-1, 1]) {
          const a1 = a0 + da * range(r, 0.3, 0.8);
          const l1 = len * range(r, 0.4, 0.8);
          const xe = xm + Math.cos(a1) * l1;
          const ye = ym + Math.sin(a1) * l1;
          fill(
            ribbon([xm, ym, (xm + xe) / 2, (ym + ye) / 2 + 10, xe, ye], (t) => w0 * 0.62 * (1 - t * 0.7)),
            col,
            0.9,
            l1 * w0 * 0.4,
          );
          const rx = range(r, 80, 170);
          for (let q = 0; q < Math.round(rx / 4); q++) {
            const ang = range(r, 0, 6.28);
            const d = Math.sqrt(r());
            g.poly(
              leaf(
                xe + Math.cos(ang) * rx * d,
                ye + Math.sin(ang) * rx * 0.6 * d,
                range(r, 18, 34),
                range(r, 0, 6.28),
              ),
            ).fill({
              color: q % 4 ? col : lit,
              alpha: 0.9,
            });
          }
          covered += rx * rx * 0.9;
        }
      }
    } else {
      // The den: roots hanging from the roof, thick, twisting, tapering, and a few rising from the floor and arching
      // back into it (ribbed shell domes here read as wheels).
      while (covered < want && guard++ < 400) {
        if (r() < 0.75) {
          const x = b.x + r() * b.w;
          const len = range(r, 0.25, 0.7) * b0.h;
          const raw: number[] = [];
          for (let t = 0; t <= 12; t++)
            raw.push(x + Math.sin(t * 0.6 + x) * 30 * (t / 12), b.y + pad - 60 + (len * t) / 12);
          const w0 = range(r, 30, 90);
          fill(
            ribbon(wander(raw, 24, seed + guard, 220), (t) => Math.max(3, w0 * (1 - t) ** 0.7)),
            col,
            0.92,
            len * w0 * 0.55,
          );
          g.poly(
            strand(
              raw.map((v, j) => (j % 2 ? v : v + w0 * 0.22)),
              w0 * 0.16,
              0.4,
            ),
          ).fill({ color: lit, alpha: 0.4 });
        } else {
          const x0 = b.x + r() * b.w;
          const span = range(r, 260, 640);
          const rise = span * range(r, 0.3, 0.7);
          const y0 = b0.y + b0.h + 40;
          const line: number[] = [];
          for (let q = 0; q <= 14; q++) {
            const t = q / 14;
            line.push(
              x0 + span * t,
              y0 - rise * Math.sin(Math.PI * t) ** 0.8 + 20 * wobble(t * 700, seed + guard, 200),
            );
          }
          const w0 = range(r, 30, 70);
          fill(
            ribbon(line, (t) => w0 * (0.75 + 0.5 * Math.abs(t - 0.5))),
            col,
            0.92,
            span * w0,
          );
        }
      }
    }
  });
}
