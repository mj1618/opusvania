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
  /** How far the near back's torn edge reaches into it where it meets open air (px). */
  tear: 420,
} as const;

export type BackMat = 'root' | 'earth';

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

const TONES: Record<'cool' | 'warm' | 'deep', Tone> = {
  cool: {
    deep: 0x22384e,
    deepLit: 0x34526e,
    fog: 0x5a80a0,
    near: 0x182a3e,
    nearLit: 0x5a7c9a,
    grain: 0x0e1a28,
    root: 0x14202c,
    rootLit: 0x6a88a0,
  },
  warm: {
    deep: 0x1e3830,
    deepLit: 0x30544a,
    fog: 0x5a8274,
    near: 0x16302a,
    nearLit: 0x5e866e,
    grain: 0x0c1a16,
    root: 0x12201c,
    rootLit: 0x6a8a74,
  },
  deep: {
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
  kind: 'moss' | 'fungus' | 'worm' | 'spore' | 'shaft';
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
  const backs = (room.marks?.backs ?? []) as Rect[];
  if (!backs.length) return null;
  const masses = room.solids.filter(massOf) as MassRect[];
  const cx = backs.reduce((a, b) => a + b.x + b.w / 2, 0) / backs.length;
  const mood = moodAt(room, cx);
  const mat: BackMat = mood === 'deep' || masses.some((m) => m.tag === 'ground') ? 'earth' : 'root';
  const tone = TONES[mood];
  const edges = backs.map((b) => freeEdges(b, room, masses));
  const lights: Glow[] = [];
  const I = INTERIOR;
  const add = (g: Omit<Glow, 'seed'>): void => {
    lights.push({ ...g, seed: seed + lights.length * 31 + Math.round(g.x * 3 + g.y) });
  };
  masses.forEach((r, i) => {
    const sd = exposedSides(r, masses, room.width, room.height);
    // Glow moss on the tops (a cluster now and then along the walk's edge).
    for (const [x0, x1] of sd.top) {
      const len = x1 - x0;
      if (len < 180) continue;
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
          add({
            kind: 'fungus',
            x: fx,
            y,
            s: 18 + 16 * hash1(k + i, seed + 11),
            dir,
            violet: hash1(k * 3 + i, seed + 13) < 0.18,
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
          violet: mat === 'earth' && hash1(k + i, seed + 23) < 0.25,
          len: 0,
        });
      }
    }
  });
  // Moonlight through cracks in a root room's ceiling.
  if (mat === 'root')
    backs.forEach((b, j) => {
      const n = Math.max(1, Math.round(b.w / I.shaftEvery));
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
  return { mat, tone, backs, edges, lights, masses };
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
  });
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
          0x2a6a70,
          B.walkH + 0.24,
          { moss: 1 },
        );
        p.tint(
          chaikin(blob(x - rad * 0.2, l.y - rad * 0.6, rad * 0.7, rad * 0.4, l.seed + k + 9, 0.3, 8), 1),
          0x9fe8e8,
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
    if (plan.mat === 'root') {
      // Broad grain down the heartwood, a step lit and a step dark.
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
      g.rect(b.x, fogY - h / 2, b.w, h).fill({ color: T.fog, alpha: 0.045 });
    }
    for (let k = 0; k < 5; k++) {
      const h = 120 + k * 120;
      g.rect(b.x, b0.y + b0.h - h, b.w, h + pad).fill({ color: T.fog, alpha: 0.05 });
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
