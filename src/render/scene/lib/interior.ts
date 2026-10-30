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
import { BRANCH, strand } from './pf-branch';
import { exposedSides, type MassRect } from './pf-mass';
import type { Paint } from './pf-paint';
import { blob, chaikin, clamp, hash1, lerp, range, ribbon, rngFor, wander, wobble } from './pf-shape';

export const INTERIOR = {
  /** The deep back's parallax (between the mid layer's 0.68 and the playfield). */
  deepParallax: 0.86,
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

export type BackMat = 'root' | 'earth' | 'grain' | 'leaf';

/** The five insides of the wood (canopy review r3 #4: twenty rooms, two looks). */
export type Look = 'heartwood' | 'shaft' | 'nest' | 'canopy' | 'den';

/** Each look's near-back material. */
const MAT: Record<Look, BackMat> = {
  heartwood: 'grain',
  shaft: 'root',
  nest: 'earth',
  canopy: 'leaf',
  den: 'earth',
};

/** The Canopy's rooms whose look the heuristics in `lookOf` would get wrong (a room's `art.look` wins over this). */
const ROOM_LOOKS: Record<string, Look> = {
  'cn-hub': 'heartwood',
  'cn-elder': 'shaft',
  'cn-nook': 'nest',
  'cn-hollowroot': 'nest',
  'cn-tunnel': 'den',
  'cn-burrow': 'den',
  'cn-ledge': 'den',
};

/**
 * A wood room's look: its `art.look`, else (a room the table above names) that, else from what is in it: ants make a
 * nest, the burrbacks' earth a den, a shaft twice as tall as wide a moonlit shaft, a deep mood the giant's heartwood,
 * anything else the canopy.
 */
export function lookOf(room: Room): Look {
  const set = (room.art as { look?: Look } | undefined)?.look;
  if (set) return set;
  const named = ROOM_LOOKS[room.id];
  if (named) return named;
  const kinds = new Set((room.enemies ?? []).map((e) => e.kind as string));
  if (kinds.has('carrier')) return 'nest';
  if (kinds.has('oldBurrback') || room.solids.some((s) => s.tag === 'ground')) return 'den';
  if (room.height >= room.width * 1.7) return 'shaft';
  if ((room.art?.moods ?? []).some((m) => m.mood === 'deep')) return 'heartwood';
  return 'canopy';
}

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
 * Tones per look. (Round 3's warm tone, a saturated moss green, painted the hub's hollow, the seed shaft and the
 * Grove's back as flat mint polygons under the lamps' wash: the warm variants here stay dark and grey-green.)
 */
const TONES: Record<Look | 'canopyWarm' | 'heartwoodWarm', Tone> = {
  heartwood: {
    deep: 0x2a2228,
    deepLit: 0x4c3c3a,
    fog: 0x4a4c5c,
    near: 0x2e2426,
    nearLit: 0x8a6a52,
    grain: 0x140e12,
    root: 0x3a2c24,
    rootLit: 0xa88866,
  },
  heartwoodWarm: {
    deep: 0x262420,
    deepLit: 0x463e34,
    fog: 0x46504c,
    near: 0x2a2622,
    nearLit: 0x84705a,
    grain: 0x12100e,
    root: 0x342c24,
    rootLit: 0x9c8a6a,
  },
  shaft: {
    deep: 0x2c4260,
    deepLit: 0x5a789e,
    fog: 0x8eaacc,
    near: 0x1a2c42,
    nearLit: 0x8aaed0,
    grain: 0x101c2c,
    root: 0x1a2838,
    rootLit: 0x9ab8d8,
  },
  nest: {
    deep: 0x2c2a32,
    deepLit: 0x4c4650,
    fog: 0x4a5a68,
    near: 0x36303a,
    nearLit: 0x8c7c6c,
    grain: 0x15131a,
    root: 0x3a3028,
    rootLit: 0x9a8a70,
  },
  canopy: {
    deep: 0x1c303e,
    deepLit: 0x30505e,
    fog: 0x4e7084,
    near: 0x162632,
    nearLit: 0x5a7c88,
    grain: 0x0c161e,
    root: 0x14202a,
    rootLit: 0x6a8890,
  },
  canopyWarm: {
    deep: 0x1a2a2e,
    deepLit: 0x2e4644,
    fog: 0x46605e,
    near: 0x16242a,
    nearLit: 0x5c7870,
    grain: 0x0c1618,
    root: 0x142024,
    rootLit: 0x688478,
  },
  den: {
    deep: 0x262838,
    deepLit: 0x3e3a50,
    fog: 0x3a5a70,
    near: 0x342a30,
    nearLit: 0x86705a,
    grain: 0x16121a,
    root: 0x3a2c24,
    rootLit: 0xa88866,
  },
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BackEdges {
  /** True where that edge of the back meets open air inside the room (not the room's edge, not mass). */
  w: boolean;
  e: boolean;
  n: boolean;
  s: boolean;
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

/** Which edges of `b` lie in open air (sampled: more than a third of the edge outside any mass). */
function freeEdges(b: Rect, room: Room, masses: readonly MassRect[]): BackEdges {
  const open = (pts: Array<[number, number]>): boolean =>
    pts.filter(([x, y]) => !inSolid(masses, x, y)).length > pts.length / 3;
  const along = (a: number, c: number, n: number): number[] =>
    Array.from({ length: n }, (_, i) => lerp(a, c, (i + 0.5) / n));
  const n = 16;
  return {
    w: b.x > 1 && open(along(b.y, b.y + b.h, n).map((y) => [b.x - 4, y])),
    e: b.x + b.w < room.width - 1 && open(along(b.y, b.y + b.h, n).map((y) => [b.x + b.w + 4, y])),
    n: b.y > 1 && open(along(b.x, b.x + b.w, n).map((x) => [x, b.y - 4])),
    s: b.y + b.h < room.height - 1 && open(along(b.x, b.x + b.w, n).map((x) => [x, b.y + b.h + 4])),
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
  // (A cover's hollow is closed all round: no torn edge, the wood's own walls bound it.)
  const edges = backs.map((b, i) =>
    i < marked.length ? freeEdges(b, room, masses) : { w: false, e: false, n: false, s: false },
  );
  const lights: Glow[] = [];
  const I = INTERIOR;
  const add = (g: Omit<Glow, 'seed'>): void => {
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
  if (e.w) k = Math.min(k, (x - b.x) / INTERIOR.tear);
  if (e.e) k = Math.min(k, (b.x + b.w - x) / INTERIOR.tear);
  if (e.n) k = Math.min(k, (y - b.y) / INTERIOR.tear);
  if (e.s) k = Math.min(k, (b.y + b.h - y) / INTERIOR.tear);
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
  const n = Math.round((b.w * b.h) / 160000);
  for (let k = 0; k < n; k++) {
    const cx = b.x + range(r, -0.05, 1.05) * b.w;
    const cy = b.y + range(r, -0.05, 1.05) * b.h;
    const kx = tornK(b, e, clamp(cx, b.x, b.x + b.w), clamp(cy, b.y, b.y + b.h));
    if (kx < range(r, 0, 0.6)) continue;
    const rx = range(r, 300, 800) * (0.6 + 0.4 * kx);
    const ry = range(r, 30, 80);
    p.solid(
      chaikin(blob(cx, cy, rx, ry, seed + k * 3, 0.25, 22), 2),
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
      p.tint(strand(line, range(r, 2, 5), 0.2), T.grain, 0.5);
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
    p.solid(strand(line, range(r, 8, 16), 0.08), T.grain, B.backH, { bark: 0.2 }, 0.85);
    p.tint(
      strand(
        line.map((v, j) => (j % 2 ? v + 7 : v)),
        2.5,
        0.08,
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
  for (let x = b.x + range(r, 0, 200); x < b.x + b.w; x += range(r, 220, 460)) {
    const w = range(r, 40, 110);
    const kx = tornK(b, e, x, b.y + b.h / 2);
    if (kx < 0.15) continue;
    const yTop = b.y - 30 + (e.n ? range(r, 0.2, 1) * INTERIOR.tear : 0);
    const yBot = b.y + b.h + 30 - (e.s ? range(r, 0.3, 1) * INTERIOR.tear : 0);
    const line: number[] = [];
    for (let t = 0; t <= 12; t++) line.push(x + range(r, -8, 8), lerp(yTop, yBot, t / 12));
    const wl = wander(line, 30, seed + Math.round(x), 300);
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
    if (plan.look === 'shaft' || plan.look === 'canopy') {
      // Broad grain down the wood, a step lit and a step dark., a step lit and a step dark.
      for (let x = b.x; x < b.x + b.w; x += range(r, 60, 180)) {
        const w = range(r, 30, 120);
        const line: number[] = [];
        for (let t = 0; t <= 10; t++) line.push(x + range(r, -4, 4), lerp(b.y, b.y + b.h, t / 10));
        const wl = wander(line, 40, seed + i * 3 + Math.round(x), 400);
        g.poly(ribbon(wl, () => w)).fill({
          color: r() < 0.5 ? T.deepLit : T.grain,
          alpha: range(r, 0.18, 0.4),
        });
      }
    } else if (plan.look === 'heartwood') {
      // Inside the fallen giant: the grain runs along it (across the screen), split by long dark cracks.
      for (let y = b.y; y < b.y + b.h; y += range(r, 26, 90)) {
        const line: number[] = [];
        for (let x = b.x; x <= b.x + b.w; x += 60)
          line.push(x, y + 30 * wobble(x, seed + Math.round(y), 900) + 10 * wobble(x, seed + 7, 140));
        g.poly(strand(line, range(r, 8, 30), 0.02)).fill({
          color: r() < 0.45 ? T.deepLit : T.grain,
          alpha: range(r, 0.16, 0.34),
        });
      }
      for (let k = 0; k < Math.max(2, Math.round((b.w * b.h) / 900000)); k++) {
        const x0 = b.x + range(r, -0.1, 0.8) * b.w;
        const y0 = b.y + range(r, 0.1, 0.9) * b.h;
        const len = range(r, 500, 1600);
        const line: number[] = [];
        for (let t = 0; t <= 16; t++)
          line.push(x0 + (len * t) / 16, y0 + 18 * wobble(x0 + t * 100, seed + k, 300));
        g.poly(strand(line, range(r, 6, 14), 0.05)).fill({ color: T.grain, alpha: 0.75 });
        g.poly(
          strand(
            line.map((v, j) => (j % 2 ? v - 8 : v)),
            2.5,
            0.05,
          ),
        ).fill({ color: T.deepLit, alpha: 0.5 });
      }
      // Growth rings where the giant split: great soft ellipses.
      for (let k = 0; k < Math.max(1, Math.round((b.w * b.h) / 2400000)); k++) {
        const cx = b.x + range(r, 0.15, 0.85) * b.w;
        const cy = b.y + range(r, 0.2, 0.8) * b.h;
        for (let q = 0; q < 5; q++) {
          const rx = 180 + q * 70;
          const ring = blob(cx, cy, rx, rx * 1.5, seed + k * 7 + q, 0.12, 30);
          ring.push(ring[0] as number, ring[1] as number, ring[2] as number, ring[3] as number);
          g.poly(strand(ring, 10 + q * 3, 0.05)).fill({ color: q % 2 ? T.deepLit : T.grain, alpha: 0.28 });
        }
      }
    } else {
      // Strata: long soft bands across the earth.
      for (let y = b.y; y < b.y + b.h; y += range(r, 50, 140)) {
        const line: number[] = [];
        for (let x = b.x; x <= b.x + b.w; x += 80)
          line.push(x, y + 24 * wobble(x, seed + Math.round(y), 600));
        g.poly(strand(line, range(r, 14, 46), 0.02)).fill({
          color: r() < 0.5 ? T.deepLit : T.grain,
          alpha: range(r, 0.2, 0.4),
        });
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
      for (let k = 0; k < Math.round((b0.w * b0.h) / 400000); k++) {
        const cx = b0.x + range(r, 0, 1) * b0.w;
        const cy = b0.y + range(r, 0, 1) * b0.h;
        for (let q = 0; q < 14; q++)
          g.poly(
            leaf(cx + range(r, -60, 60), cy + range(r, -30, 50), range(r, 10, 22), range(r, 0.8, 2.4)),
          ).fill({ color: r() < 0.5 ? T.deepLit : T.grain, alpha: 0.4 });
      }
    } else if (plan.look === 'shaft') {
      // The cold beam's haze down the middle of the shaft.
      const mx = b0.x + b0.w * 0.5;
      for (let k = 0; k < 6; k++) {
        const w = b0.w * (0.12 + k * 0.08);
        g.rect(mx - w / 2, b.y, w, b.h).fill({ color: T.fog, alpha: 0.05 });
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
    // The fog between the planes: soft bands, thicker low, so the deep reads as far.
    const fogY = b0.y + b0.h * 0.62;
    for (let k = 0; k < 9; k++) {
      const h = b0.h * (0.12 + k * 0.07);
      g.rect(b.x, fogY - h / 2, b.w, h).fill({ color: T.fog, alpha: 0.03 });
    }
    for (let k = 0; k < 5; k++) {
      const h = 120 + k * 120;
      g.rect(b.x, b0.y + b0.h - h, b.w, h + pad).fill({ color: T.fog, alpha: 0.035 });
    }
  });
}

/** The deep back's mask: each back, its free edges torn and drawn in (playfield coords). */
export function backMask(plan: InteriorPlan, seed: number): number[][] {
  return plan.backs.map((b, i) => {
    const e = plan.edges[i] as BackEdges;
    const pts: number[] = [];
    const st = 20;
    // A free edge is drawn well in, behind the near back's torn fibres (they stand against the open air beyond it), and
    // wavers so no ruled line shows between them.
    const bite = (k: number, on: boolean) =>
      on ? INTERIOR.tear * 0.75 + 120 * wobble(k * st, seed + i * 13, 140) : -40;
    for (let x = b.x; x < b.x + b.w; x += st) pts.push(x, b.y + bite(Math.round(x / st), e.n));
    for (let y = b.y; y < b.y + b.h; y += st) pts.push(b.x + b.w - bite(Math.round(y / st) + 500, e.e), y);
    for (let x = b.x + b.w; x > b.x; x -= st) pts.push(x, b.y + b.h - bite(Math.round(x / st) + 900, e.s));
    for (let y = b.y + b.h; y > b.y; y -= st) pts.push(b.x + bite(Math.round(y / st) + 1300, e.w), y);
    return chaikin(pts, 2);
  });
}
