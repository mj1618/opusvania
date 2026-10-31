/**
 * Sealed air (the Canopy v9, `marks.sealed`): space carved out of a deep mass that she can never reach. The sim sees
 * air; the map, the measures and the bots see rock. Render paints it as a hollow INSIDE the wood (canopy r9b):
 *
 *   1. `withSealedMass(room)`: every painter sees the sealed rects as mass (appended to the solids with the room's
 *      mass tag), so the faces round them get no walk band, flora, rim, claw moss or glow, the deep backs are not
 *      drawn there (the parallax backs drew displaced ruled rectangles and, in the hub, open sky with mountains) and
 *      the mass's core runs through.
 *   2. `paintSealed(p, room, ...)` (baked with the masses, pf-branch.ts) cuts pockets back into that mass (r10, review
 *      r9 #5: one recess the shape of the rects, lined with knobs, read as windows, cabinets and picture frames):
 *      `hollowCavities` makes 1-4 irregular pockets per rect, inset 80-200 px from the mass, slanted wood bridges
 *      between them, the core near-black round them. Each: a far wall with grain along its long axis, a shadow
 *      under its ceiling, a haze and a dim glow low in it, a broken lit edge where its floor faces up and a broken
 *      dark seam under its ceiling (short runs, gaps: no frame), the look's growth off its ceiling and a few dull
 *      cushions low (never the walk's lit band: nothing in a hollow may read as a ledge); 2-5 roots a hollow cross
 *      the lips at angles from inside the wood.
 *
 * Pure: no Pixi beyond the Paint it is handed; seeded, so the bake is reproducible.
 */
import type { Room } from '../../../scene/room';
import { gradeLookOf, type Look } from './looks';
import type { Paint } from './pf-paint';
import { blob, chaikin, clamp, lerp, noise1, range, ribbon, rngFor, wander } from './pf-shape';
import { GROWTH, paintUnderWrap, type TopFamily, topFamilyOf } from './top-growth';

export interface SealedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The look of a hollow (tuning; see the header). */
export const SEALED = {
  /** A pocket's inset from the group's edges where the mass is (less where the group goes on), px. */
  cavityInset: [80, 200] as readonly number[],
  /** One pocket per this many px of a rect's long side (1-4), and the wood bridges between them, px thick. */
  cavityEvery: 700,
  bridge: [60, 160] as readonly number[],
  /** How far a pocket's long sides wave in, px (a 0.4 superellipse edge over 500 px is straight to the eye). */
  cavityWave: 34,
  /** A group whose largest rect is under this in both sides is left as wood (a 64 px hole reads as a dot). */
  minSide: 150,
  /** Relief heights: the hollow's far wall, its grain, the roots crossing it, the lips. */
  hBack: 0.05,
  hGrain: 0.12,
  hRoot: 0.34,
  hLip: 0.46,
  /** The far wall's value: this share of the way from the mass's body to its lift (then multiplied by the bake). */
  backLift: 0.55,
  /** The shadow under the ceiling lip: its depth range, px, and alpha per step (5 steps). */
  shade: [70, 150] as readonly number[],
  shadeA: 0.2,
  /** One root across per this many px of the hollow's long side (1-4), their width range, px. */
  rootEvery: 700,
  rootW: [14, 38] as readonly number[],
  /** One glow per this many px of the long side (at least one in a hollow over `minSide`). */
  glowEvery: 1100,
} as const;

/**
 * A hollow's colours per grade look (`night` = a room open to the sky): its far wall, the grain's ribbons and the
 * gaps between them, the roots across and their lit top, the dim glow. Albedo: the bake takes a covered interior
 * down to about a third and the key light barely reaches a plane painted this low, so these sit 3-4x over the
 * luma they come out at (~20-35, between the core's 3-8 and the air's 40-70).
 */
export const HOLLOW: Record<
  Look | 'night',
  { back: number; grain: number; gap: number; root: number; rootLit: number; glow: number }
> = {
  night: {
    back: 0x3a5872,
    grain: 0x263e56,
    gap: 0x0e1a26,
    root: 0x1a2a3a,
    rootLit: 0x7092b0,
    glow: 0x9fd8f0,
  },
  heartwood: {
    back: 0x6e4c32,
    grain: 0x4c3422,
    gap: 0x1a100a,
    root: 0x3a2616,
    rootLit: 0xa47c54,
    glow: 0xffb766,
  },
  shaft: {
    back: 0x32606e,
    grain: 0x20424e,
    gap: 0x0a1a20,
    root: 0x163038,
    rootLit: 0x70a6b6,
    glow: 0xa8e8ff,
  },
  canopy: {
    back: 0x34544e,
    grain: 0x223a38,
    gap: 0x0a1614,
    root: 0x182a28,
    rootLit: 0x70a08c,
    glow: 0x9fe6c8,
  },
  den: { back: 0x5e4a3a, grain: 0x403024, gap: 0x140e0a, root: 0x2e2018, rootLit: 0x9e7e62, glow: 0xc7a8ff },
  nest: { back: 0x6e5a36, grain: 0x4c3c22, gap: 0x18120a, root: 0x362a16, rootLit: 0xac9462, glow: 0xffd38a },
};

export function sealedOf(room: { marks?: unknown }): SealedRect[] {
  return ((room.marks as { sealed?: SealedRect[] } | undefined)?.sealed ?? []) as SealedRect[];
}

type Solidish = { x: number; y: number; w: number; h: number; tag: string };
const CONVERTED = new WeakMap<object, object>();
const IS_CONVERTED = new WeakSet<object>();

/**
 * The room as the painters see it: its sealed rects are mass (appended after the real solids, so the indices the
 * kit and the sim's per-solid state use are unchanged). Cached per room; the same object back when there is none.
 */
export function withSealedMass<T extends { solids: readonly Solidish[]; marks?: unknown }>(room: T): T {
  if (IS_CONVERTED.has(room)) return room;
  const sealed = sealedOf(room);
  if (!sealed.length) return room;
  const hit = CONVERTED.get(room);
  if (hit) return hit as T;
  const counts = new Map<string, number>();
  for (const s of room.solids)
    if (s.tag === 'root' || s.tag === 'ground') counts.set(s.tag, (counts.get(s.tag) ?? 0) + 1);
  const tag = (counts.get('ground') ?? 0) > (counts.get('root') ?? 0) ? 'ground' : 'root';
  const out = {
    ...room,
    solids: [...room.solids, ...sealed.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h, tag }))],
  } as T;
  CONVERTED.set(room, out);
  IS_CONVERTED.add(out);
  return out;
}

/** True when (x, y) is inside a sealed rect (pad px grown). */
export function inSealed(room: { marks?: unknown }, x: number, y: number, pad = 0): boolean {
  return sealedOf(room).some(
    (s) => x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad,
  );
}

/** Rects that touch or overlap, as groups (one hollow each). */
export function sealedGroups(rects: readonly SealedRect[]): SealedRect[][] {
  const parent = rects.map((_, i) => i);
  const find = (i: number): number => {
    let j = i;
    while (parent[j] !== j) j = parent[j] as number;
    return j;
  };
  const touch = (a: SealedRect, b: SealedRect) =>
    a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      if (touch(rects[i] as SealedRect, rects[j] as SealedRect)) parent[find(i)] = find(j);
  const groups = new Map<number, SealedRect[]>();
  rects.forEach((r, i) => {
    const k = find(i);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  });
  return [...groups.values()];
}

/**
 * The edges of a group's union: runs of a rect's side that face the mass (no other rect of the group beyond them).
 * `side` is where the mass is: n = the ceiling (mass above), s = the floor, w / e = a wall on that side.
 */
export interface SealedEdge {
  side: 'n' | 's' | 'w' | 'e';
  /** The edge's coordinate (y for n / s, x for w / e) and its run along the other axis. */
  v: number;
  a: number;
  b: number;
}

export function sealedEdges(group: readonly SealedRect[]): SealedEdge[] {
  const inGroup = (x: number, y: number) =>
    group.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
  const out: SealedEdge[] = [];
  const step = 8;
  for (const r of group) {
    const sides: Array<[SealedEdge['side'], number, number, number, (u: number) => [number, number]]> = [
      ['n', r.y, r.x, r.x + r.w, (u) => [u, r.y - 2]],
      ['s', r.y + r.h, r.x, r.x + r.w, (u) => [u, r.y + r.h + 2]],
      ['w', r.x, r.y, r.y + r.h, (u) => [r.x - 2, u]],
      ['e', r.x + r.w, r.y, r.y + r.h, (u) => [r.x + r.w + 2, u]],
    ];
    for (const [side, v, a, b, out1] of sides) {
      let start: number | null = null;
      for (let u = a; u <= b; u += step) {
        const uu = Math.min(u + step / 2, b - 1);
        const [x, y] = out1(uu);
        const free = !inGroup(x, y);
        if (free && start === null) start = u;
        if ((!free || u + step > b) && start !== null) {
          const end = free ? b : u;
          if (end - start >= 16) out.push({ side, v, a: start, b: end });
          start = null;
        }
      }
    }
  }
  return out;
}

const mix = (a: number, b: number, t: number): number => {
  const ch = (s: number) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export interface HollowTone {
  body: number;
  deep: number;
  vein: number;
  veinLit: number;
  lift: number;
  plate: number;
  /** The near-black the mass sinks to round the hollow (pf-mass.ts `massCore`). */
  core: number;
}

/** Paints every sealed hollow of the room into the bake (over the masses, under the limbs). */
export function paintSealed(p: Paint, room: Room, T: HollowTone, seed: number): void {
  const rects = sealedOf(room);
  if (!rects.length) return;
  const look = gradeLookOf(room) ?? 'night';
  const fam = topFamilyOf(room);
  sealedGroups(rects).forEach((group, gi) => {
    const big = group.some((r) => Math.min(r.w, r.h) >= SEALED.minSide);
    if (!big) return;
    paintHollow(p, group, T, look, fam, seed + gi * 977);
  });
}

/** A cavity in a hollow (pure: the test checks its outline). */
export interface Cavity {
  /** Its outline, closed, world px. */
  pts: number[];
  cx: number;
  cy: number;
  /** Half its box, px. */
  rx: number;
  ry: number;
}

/**
 * A sealed group's cavities (review r9 #5: the hollows read as windows, cabinets and picture frames): each rect of at
 * least `minSide` becomes 1-4 irregular pockets along its long axis, inset 80-200 px (by noise) from the group's outer
 * edges and less from a side another rect of the group shares, with slanted wood bridges 60-160 px between them.
 * Outlines are noisy superellipses (no straight run, no corner).
 */
export function hollowCavities(group: readonly SealedRect[], seed: number): Cavity[] {
  const S = SEALED;
  const out: Cavity[] = [];
  const shared = (g: SealedRect, side: 'n' | 's' | 'w' | 'e') =>
    group.some(
      (o) =>
        o !== g &&
        (side === 'n'
          ? o.y + o.h === g.y && o.x < g.x + g.w && o.x + o.w > g.x
          : side === 's'
            ? o.y === g.y + g.h && o.x < g.x + g.w && o.x + o.w > g.x
            : side === 'w'
              ? o.x + o.w === g.x && o.y < g.y + g.h && o.y + o.h > g.y
              : o.x === g.x + g.w && o.y < g.y + g.h && o.y + o.h > g.y),
    );
  group.forEach((g, gi) => {
    if (Math.min(g.w, g.h) < S.minSide) return;
    const r = rngFor(seed, gi, g.x, g.y, 77);
    const horiz = g.w >= g.h;
    const across = horiz ? g.h : g.w;
    // The inset from each side: deep from the mass, shallow where the group goes on.
    const inset = (side: 'n' | 's' | 'w' | 'e') => {
      const deep = range(r, S.cavityInset[0] as number, S.cavityInset[1] as number);
      const k = shared(g, side) ? 0.35 : 1;
      return Math.min(deep * k, across * 0.3);
    };
    const x0 = g.x + inset('w');
    const x1 = g.x + g.w - inset('e');
    const y0 = g.y + inset('n');
    const y1 = g.y + g.h - inset('s');
    if (x1 - x0 < 60 || y1 - y0 < 60) return;
    const along0 = horiz ? x0 : y0;
    const along1 = horiz ? x1 : y1;
    const len = along1 - along0;
    const n = clamp(Math.round(len / S.cavityEvery), 1, 4);
    // The bridges: thickness and slant (shear of the ends).
    const cuts: Array<{ at: number; half: number }> = [];
    for (let k = 1; k < n; k++)
      cuts.push({
        at: along0 + (len * k) / n + range(r, -0.12, 0.12) * (len / n),
        half: range(r, S.bridge[0] as number, S.bridge[1] as number) / 2,
      });
    for (let k = 0; k < n; k++) {
      const a0 =
        k === 0 ? along0 : (cuts[k - 1] as { at: number; half: number }).at + (cuts[k - 1]?.half ?? 0);
      const a1 = k === n - 1 ? along1 : (cuts[k] as { at: number; half: number }).at - (cuts[k]?.half ?? 0);
      if (a1 - a0 < 60) continue;
      const bx0 = horiz ? a0 : x0;
      const bx1 = horiz ? a1 : x1;
      const by0 = horiz ? y0 : a0;
      const by1 = horiz ? y1 : a1;
      const cx = (bx0 + bx1) / 2;
      const cy = (by0 + by1) / 2;
      const rx = (bx1 - bx0) / 2;
      const ry = (by1 - by0) / 2;
      const shear = range(r, -0.45, 0.45);
      const pw = range(r, 2.3, 3.0);
      const sd = seed + gi * 131 + k * 17;
      const period = range(r, 20, 30);
      const phase = range(r, 0, 6.3);
      const N = 56;
      const pts: number[] = [];
      for (let i = 0; i < N; i++) {
        const t = (i / N) * Math.PI * 2;
        const c = Math.cos(t);
        const sn = Math.sin(t);
        // A superellipse (fills the box better than an ellipse, no straight side), lumpy by periodic noise.
        let ux = Math.sign(c) * Math.abs(c) ** (2 / pw);
        let uy = Math.sign(sn) * Math.abs(sn) ** (2 / pw);
        const lump =
          1 -
          0.16 * (0.5 + 0.5 * noise2(Math.cos(t) * 1.4, Math.sin(t) * 1.4, sd)) -
          0.07 * (0.5 + 0.5 * noise2(Math.cos(t) * 3.1, Math.sin(t) * 3.1, sd + 9));
        ux *= lump;
        uy *= lump;
        // The ends slant (the bridges cross at an angle): shear along the long axis by the place across it.
        const end = horiz ? Math.abs(ux) ** 3 : Math.abs(uy) ** 3;
        let px = cx + ux * rx;
        let py = cy + uy * ry;
        if (horiz) px += shear * uy * ry * end;
        else py += shear * ux * rx * end;
        // The long sides wave (a long gentle curve still reads as a ruled edge): in and out by up to `cavityWave`.
        const wave = S.cavityWave * Math.min(1, Math.max(0.8, Math.min(rx, ry) / 120));
        const along = horiz ? px : py;
        const w =
          wave *
          (0.5 + 0.4 * Math.sin(along / period + phase) + 0.2 * noise1(along / 90, sd + 3)) *
          (uy < 0 || ux < 0 ? 1 : 0.8);
        if (horiz) py -= uy ** 2 * Math.sign(uy) * w;
        else px -= ux ** 2 * Math.sign(ux) * w;
        pts.push(px, py);
      }
      out.push({ pts: chaikin(pts, 1), cx, cy, rx, ry });
    }
  });
  return out;
}

/** 2-D periodic-ish value noise from the 1-D one (a circle sampled in noise space). */
function noise2(x: number, y: number, seed: number): number {
  return noise1(x * 1.7 + y * 0.6 + 11.3, seed) * 0.6 + noise1(y * 2.3 - x * 0.4 + 3.7, seed + 13) * 0.4;
}

/** Where a horizontal (or vertical) line at `v` crosses a closed outline: [min, max] along it, or null. */
function spanAt(pts: readonly number[], v: number, horiz: boolean): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[i * 2] as number;
    const ay = pts[i * 2 + 1] as number;
    const bx = pts[j * 2] as number;
    const by = pts[j * 2 + 1] as number;
    const [a, b, pa, pb] = horiz ? [ay, by, ax, bx] : [ax, bx, ay, by];
    if ((a <= v && b > v) || (b <= v && a > v)) {
      const u = pa + ((v - a) / (b - a)) * (pb - pa);
      lo = Math.min(lo, u);
      hi = Math.max(hi, u);
    }
  }
  return lo < hi ? [lo, hi] : null;
}

/** The outline grown (or shrunk) by `d` px from its centre (cheap: the cavities are star-shaped round it). */
function grow(c: Cavity, d: number): number[] {
  return c.pts.map((v, j) => {
    const o = j % 2 ? c.cy : c.cx;
    const r = j % 2 ? c.ry : c.rx;
    return o + (v - o) * (1 + d / Math.max(r, 1));
  });
}

/** The part of an outline above (`top`) or below its centre, as an open line from west to east. */
function arcOf(c: Cavity, top: boolean): number[] {
  const n = c.pts.length / 2;
  const pick: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const x = c.pts[i * 2] as number;
    const y = c.pts[i * 2 + 1] as number;
    if (top ? y < c.cy - c.ry * 0.2 : y > c.cy + c.ry * 0.2) pick.push([x, y]);
  }
  pick.sort((a, b) => a[0] - b[0]);
  return pick.flat();
}

/** y of an open west-to-east line at x (linear between its points). */
function yOn(line: readonly number[], x: number): number {
  const n = line.length / 2;
  if (n === 0) return 0;
  if (x <= (line[0] as number)) return line[1] as number;
  for (let i = 1; i < n; i++) {
    const bx = line[i * 2] as number;
    if (x <= bx) {
      const ax = line[i * 2 - 2] as number;
      const t = bx > ax ? (x - ax) / (bx - ax) : 0;
      return lerp(line[i * 2 - 1] as number, line[i * 2 + 1] as number, t);
    }
  }
  return line[line.length - 1] as number;
}

function paintHollow(
  p: Paint,
  group: readonly SealedRect[],
  T: HollowTone,
  look: Look | 'night',
  fam: TopFamily,
  seed: number,
): void {
  const S = SEALED;
  const r = rngFor(seed, group.length, 5);
  const C = HOLLOW[look];
  const cavities = hollowCavities(group, seed);
  const G = GROWTH[fam];

  cavities.forEach((cv, ci) => {
    const sd = seed + ci * 389;
    const horiz = cv.rx >= cv.ry;
    // 1. The mass sinks to its near-black core round the pocket (no lit band: a frame), then the far wall.
    p.tint(grow(cv, 40), T.core, 0.5);
    p.tint(grow(cv, 16), T.core, 0.6);
    p.solid(cv.pts, C.back, S.hBack, { bark: 0.15 });

    // 2. Grain along the long axis inside the pocket: fibres of uneven length and width, breaking off.
    const across = horiz ? cv.ry * 2 : cv.rx * 2;
    let c = range(r, 8, 30);
    let k = 0;
    while (c < across - 8) {
      const v = (horiz ? cv.cy - cv.ry : cv.cx - cv.rx) + c;
      const span = spanAt(cv.pts, v, horiz);
      if (span) {
        let al0 = span[0] - range(r, 0, 60);
        while (al0 < span[1]) {
          const len = range(r, 0.25, 0.8) * Math.max(span[1] - span[0], 200);
          const a1 = Math.min(al0 + len, span[1] - 10);
          const s0 = Math.max(al0, span[0] + 10);
          if (a1 - s0 > 40) {
            const nn = Math.max(4, Math.round((a1 - s0) / 50));
            const line: number[] = [];
            const slope = range(r, -0.06, 0.06);
            for (let i = 0; i <= nn; i++) {
              const al = s0 + ((a1 - s0) * i) / nn;
              line.push(horiz ? al : v + slope * (al - s0), horiz ? v + slope * (al - s0) : al);
            }
            const wd = range(r, 6, 30);
            p.solid(
              ribbon(wander(line, 12, sd + k * 13, 90), (t) => wd * Math.sin(t * Math.PI) ** 0.5),
              r() < 0.5 ? C.grain : mix(C.grain, C.back, 0.55),
              S.hGrain,
              { bark: 0.35, alpha: 0.7 },
              range(r, 0.25, 0.5),
            );
          }
          al0 += len + range(r, 40, 220);
          k++;
        }
      }
      c += range(r, 22, 64);
    }

    // 3. The shadow under the ceiling (the wood overhangs the pocket), lighter down the sides; a haze low in it.
    const topArc = arcOf(cv, true);
    for (let q = 1; q <= 5; q++) {
      const d = (range(r, S.shade[0] as number, S.shade[1] as number) * q) / 5;
      const band: number[] = [...topArc];
      for (let i = topArc.length / 2 - 1; i >= 0; i--)
        band.push(topArc[i * 2] as number, Math.min((topArc[i * 2 + 1] as number) + d, cv.cy + cv.ry * 0.6));
      if (band.length >= 6) p.tint(band, C.gap, S.shadeA);
    }
    for (let q = 3; q >= 1; q--)
      p.tint(
        chaikin(
          blob(
            cv.cx,
            cv.cy + cv.ry * 0.25,
            cv.rx * (0.3 + q * 0.15),
            cv.ry * (0.25 + q * 0.12),
            sd + q,
            0.3,
            14,
          ),
          1,
        ),
        mix(C.back, C.glow, 0.35),
        0.08,
      );

    // 4. A dim glow low in the pocket with a clutch of caps at its heart.
    const gx = cv.cx + range(r, -0.4, 0.4) * cv.rx;
    const gy = cv.cy + cv.ry * range(r, 0.35, 0.6);
    for (let q = 4; q >= 1; q--) {
      const rad = Math.min(20 * q + range(r, 0, 10), cv.ry * 0.9);
      p.tint(blob(gx, gy, rad * 1.3, rad, sd + q, 0.2, 14), C.glow, 0.03 + 0.02 * (4 - q));
    }
    for (let q = 0, m = 3 + Math.floor(r() * 4); q < m; q++)
      p.tint(
        blob(
          gx + range(r, -24, 24),
          gy + range(r, -10, 12),
          range(r, 2.5, 5),
          range(r, 2, 4),
          sd + q * 3,
          0.1,
          8,
        ),
        mix(C.glow, 0xffffff, 0.4),
        0.9,
      );

    // 5. The lip: no knobs, no band. A broken lit edge where the floor of the pocket faces up, a dark seam under
    // the ceiling, both in short runs with gaps.
    const botArc = arcOf(cv, false);
    const runs = (line: number[], f: (seg: number[]) => void) => {
      const n = line.length / 2;
      let i = Math.floor(r() * 3);
      while (i < n - 2) {
        const m = 3 + Math.floor(r() * 6);
        const seg = line.slice(i * 2, Math.min(n, i + m) * 2);
        if (seg.length >= 6) f(seg);
        i += m + 2 + Math.floor(r() * 5);
      }
    };
    runs(botArc, (seg) =>
      p.tint(
        ribbon(
          seg.map((v, j) => (j % 2 ? v - 3 : v)),
          (t) => 4 * Math.sin(t * Math.PI),
        ),
        C.rootLit,
        0.32,
      ),
    );
    runs(topArc, (seg) =>
      p.tint(
        ribbon(
          seg.map((v, j) => (j % 2 ? v + 4 : v)),
          (t) => 7 * Math.sin(t * Math.PI),
        ),
        C.gap,
        0.6,
      ),
    );

    // 6. Growth: the look's beards and strands off the ceiling (the middle of its arc), sparse dull cushions low.
    if (topArc.length >= 8) {
      const ax = (topArc[0] as number) + cv.rx * 0.25;
      const bx = (topArc[topArc.length - 2] as number) - cv.rx * 0.25;
      if (bx - ax > 80)
        paintUnderWrap(p, ax, bx, (x) => yOn(topArc, x) - 2, S.hLip + 0.05, sd, fam, false, false);
    }
    if (botArc.length >= 8) {
      const rr = rngFor(sd, 13);
      let u = (botArc[0] as number) + cv.rx * 0.3;
      const end = (botArc[botArc.length - 2] as number) - cv.rx * 0.3;
      while (u < end) {
        const run = range(rr, 40, 160);
        for (let x = u; x < Math.min(u + run, end); x += range(rr, 12, 26)) {
          const y = yOn(botArc, x);
          const rad = range(rr, 5, 12);
          p.solid(
            blob(x, y - rad * 0.3, rad * 1.2, rad * 0.7, sd + x, 0.25, 10),
            rr() < 0.6 ? G.deep : G.body,
            S.hLip + 0.06,
            { moss: G.moss * 0.5 },
          );
        }
        u += run + range(rr, 80, 260);
      }
    }
  });

  // 7. Roots across the lips at angles (2-5 a hollow): from inside the wood, over the rim, across part of a pocket
  // and back into the wood or hanging off; they break the outline so it never reads as a frame.
  const nRoots = clamp(Math.round(cavities.length * 1.5 + r() * 2), 2, 5);
  for (let k = 0; k < nRoots && cavities.length; k++) {
    const cv = cavities[k % cavities.length] as Cavity;
    const n = cv.pts.length / 2;
    const i0 = Math.floor(r() * n);
    const i1 = (i0 + Math.floor(n * range(r, 0.3, 0.55))) % n;
    let ax = cv.pts[i0 * 2] as number;
    let ay = cv.pts[i0 * 2 + 1] as number;
    let bx = cv.pts[i1 * 2] as number;
    let by = cv.pts[i1 * 2 + 1] as number;
    // Not along an axis (a level or plumb root reads as a bar): skew the far end.
    if (Math.abs(bx - ax) < 0.3 * Math.abs(by - ay)) bx += (r() < 0.5 ? -1 : 1) * cv.rx * 0.5;
    if (Math.abs(by - ay) < 0.3 * Math.abs(bx - ax)) by += (by > cv.cy ? -1 : 1) * cv.ry * 0.6;
    // Both ends run on into the wood.
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    ax -= (dx / L) * range(r, 30, 70);
    ay -= (dy / L) * range(r, 30, 70);
    const hangs = r() < 0.35;
    if (!hangs) {
      bx += (dx / L) * range(r, 30, 70);
      by += (dy / L) * range(r, 30, 70);
    } else {
      bx = ax + dx * range(r, 0.45, 0.7);
      by = ay + dy * range(r, 0.45, 0.7) + 30;
    }
    const sag = range(r, 15, 60);
    const line: number[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      line.push(lerp(ax, bx, t), lerp(ay, by, t) + Math.sin(t * Math.PI) * sag);
    }
    const wl = wander(line, 14, seed + k * 41, 80);
    const wd = range(r, S.rootW[0] as number, S.rootW[1] as number) * 0.8;
    p.solid(
      ribbon(wl, (t) => wd * (hangs ? 1 - 0.85 * t : 0.8 + 0.3 * Math.sin(t * Math.PI))),
      C.root,
      S.hRoot,
      { bark: 0.7 },
    );
    p.tint(
      ribbon(
        wl.map((v, j) => (j % 2 ? v - wd * 0.25 : v)),
        (t) => wd * 0.2 * (hangs ? 1 - t : 1),
      ),
      C.rootLit,
      0.45,
    );
  }
}
