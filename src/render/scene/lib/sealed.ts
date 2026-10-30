/**
 * Sealed air (the Canopy v9, `marks.sealed`): space carved out of a deep mass that she can never reach. The sim sees
 * air; the map, the measures and the bots see rock. Render paints it as a hollow INSIDE the wood (canopy r9b):
 *
 *   1. `withSealedMass(room)`: every painter sees the sealed rects as mass (appended to the solids with the room's
 *      mass tag), so the faces round them get no walk band, flora, rim, claw moss or glow, the deep backs are not
 *      drawn there (the parallax backs drew displaced ruled rectangles and, in the hub, open sky with mountains) and
 *      the mass's core runs through.
 *   2. `paintSealed(p, room, ...)` (baked with the masses, pf-branch.ts) cuts the hollow back into that mass: a dark
 *      recess (grain along its long axis, a shadow under its ceiling, light pooling low), roots crossing it, rootlets
 *      hanging, a little dim glow, framed by lobed lips (no straight edge: the lip line wanders 18-70 px in from the
 *      rect) with the look's growth: beards off the ceiling lip, wrap down the side lips, sparse dull cushions on the
 *      floor lip (never the walk's lit band: nothing in a hollow may read as a ledge).
 *
 * Pure: no Pixi beyond the Paint it is handed; seeded, so the bake is reproducible.
 */
import type { Room } from '../../../scene/room';
import { gradeLookOf, type Look } from './looks';
import type { Paint } from './pf-paint';
import { blob, chaikin, clamp, hash1, lerp, range, ribbon, rngFor, wander, wobble } from './pf-shape';
import { GROWTH, paintFaceWrap, paintUnderWrap, type TopFamily, topFamilyOf } from './top-growth';

export interface SealedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The look of a hollow (tuning; see the header). */
export const SEALED = {
  /** The lip line's inset from the rect's edge, px: a base and the lobes' extra, and the lobes' length range. */
  lipBase: [14, 26] as readonly number[],
  lipPeak: [10, 46] as readonly number[],
  lipSwell: [20, 60] as readonly number[],
  /** A lip's knobs: radius range, px. */
  knobR: [22, 46] as readonly number[],
  /** The rounding of the opening's corners, px. */
  fillet: [90, 150] as readonly number[],
  lobeW: [70, 200] as readonly number[],
  /** How far the lip reaches back into the mass behind the edge, px. */
  lipBack: 28,
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

/** The lip line's inset (px into the hollow) along a run [a, b]: lobes over a wandering base. */
function lipInset(a: number, b: number, seed: number): (u: number) => number {
  const r = rngFor(seed, a, b, 911);
  const S = SEALED;
  const base = range(r, S.lipBase[0] as number, S.lipBase[1] as number);
  const lobes: Array<[number, number, number]> = [];
  let u = a - range(r, 0, 60);
  while (u < b + 40) {
    const w = range(r, S.lobeW[0] as number, S.lobeW[1] as number);
    lobes.push([u + w / 2, w / 2, range(r, S.lipPeak[0] as number, S.lipPeak[1] as number)]);
    u += w * range(r, 0.7, 1.05);
  }
  // (A large-scale wander too: lobes alone over a straight base left the opening a rounded rectangle.)
  const swell = range(r, S.lipSwell[0] as number, S.lipSwell[1] as number);
  return (x: number) => {
    let d = base + swell * (0.5 + 0.5 * wobble(x, seed, 320)) + 5 * Math.sin(x / 37 + seed);
    for (const [c, hw, pk] of lobes) {
      const t = (x - c) / hw;
      if (t > -1 && t < 1) d = Math.max(d, base + pk * Math.sqrt(1 - t * t));
    }
    return d;
  };
}

/** A point on an edge's lip line at u, `extra` px further into the hollow. */
function lipPoint(e: SealedEdge, inset: (u: number) => number, u: number, extra = 0): [number, number] {
  const d = inset(u) + extra;
  switch (e.side) {
    case 'n':
      return [u, e.v + d];
    case 's':
      return [u, e.v - d];
    case 'w':
      return [e.v + d, u];
    default:
      return [e.v - d, u];
  }
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
  const back = C.back;
  const edges = sealedEdges(group);
  const insets = edges.map((e, i) => lipInset(e.a, e.b, seed + i * 31 + e.v));

  // 1. The far wall: the hollow's own back, a little lifted from the mass (it is lit only by what gets in).
  for (const g of group) {
    const pad = 6;
    p.solid(
      [
        g.x - pad,
        g.y - pad,
        g.x + g.w + pad,
        g.y - pad,
        g.x + g.w + pad,
        g.y + g.h + pad,
        g.x - pad,
        g.y + g.h + pad,
      ],
      back,
      S.hBack,
      { bark: 0.15 },
    );
  }

  // 2. Its grain along the long axis: wandering ribbons of bark and dark gaps between them.
  for (const g of group) {
    const horiz = g.w >= g.h;
    const across = horiz ? g.h : g.w;
    const along = horiz ? g.w : g.h;
    // (Full-length even ribbons read as planks: fibres of uneven length and width, breaking off, crossing a little.)
    let c = range(r, 10, 40);
    let k = 0;
    while (c < across - 6) {
      let al0 = -20 - range(r, 0, 200);
      while (al0 < along + 20) {
        const len = range(r, 0.25, 0.9) * Math.max(along, 300);
        const wd = range(r, 8, 40);
        const n = Math.max(4, Math.round(len / 50));
        const slope = range(r, -0.08, 0.08);
        const line: number[] = [];
        for (let i = 0; i <= n; i++) {
          const al = al0 + (i / n) * len;
          const ac = c + slope * (al - al0);
          line.push(horiz ? g.x + al : g.x + ac, horiz ? g.y + ac : g.y + al);
        }
        const wl = wander(line, 16, seed + k * 13, 90);
        const col = r() < 0.5 ? C.grain : mix(C.grain, C.back, 0.55);
        p.solid(
          ribbon(wl, (t) => wd * Math.sin(t * Math.PI) ** 0.5),
          col,
          S.hGrain,
          { bark: 0.35, alpha: 0.7 },
          range(r, 0.25, 0.5),
        );
        if (r() < 0.35)
          p.tint(
            ribbon(wander(line, 10, seed + k * 17, 70), (t) => range(r, 2, 4) * Math.sin(t * Math.PI)),
            C.gap,
            0.22,
          );
        al0 += len + range(r, 40, 260);
        k++;
      }
      c += range(r, 22, 70);
    }
  }

  // 3. The shadow under the ceiling lip (the lip overhangs the recess) and along the walls; light pools low.
  edges.forEach((e, i) => {
    const inset = insets[i] as (u: number) => number;
    const depth =
      range(r, S.shade[0] as number, S.shade[1] as number) *
      (e.side === 'n' ? 1 : e.side === 's' ? 0.4 : 0.65);
    for (let k = 1; k <= 5; k++) {
      const d = (depth * k) / 5;
      const pts: number[] = [];
      for (let u = e.a; u <= e.b + 0.1; u += 16) pts.push(...lipPoint(e, inset, Math.min(u, e.b), -8));
      const back2: number[] = [];
      for (let u = e.b; u >= e.a - 0.1; u -= 16) {
        const uu = Math.max(u, e.a);
        back2.push(...lipPoint(e, inset, uu, d * (0.7 + 0.3 * Math.sin(uu / 53 + k))));
      }
      p.tint([...pts, ...back2], C.gap, S.shadeA);
    }
  });
  for (const g of group) {
    if (g.h < 120 || g.w < 120) continue;
    const n = Math.max(1, Math.round(g.w / 500));
    for (let k = 0; k < n; k++) {
      const cx = g.x + ((k + 0.5) / n) * g.w + range(r, -60, 60);
      const rx = Math.min(g.w / n, 520) * 0.5;
      // A haze in the middle depth: the far wall fades into it (farther = paler, art direction).
      for (let q = 3; q >= 1; q--)
        p.tint(
          chaikin(
            blob(
              cx,
              g.y + g.h * 0.6,
              rx * (0.5 + q * 0.2),
              Math.min(g.h * 0.32, 150) * (0.5 + q * 0.2),
              seed + k * 7 + q,
              0.3,
              14,
            ),
            1,
          ),
          mix(C.back, C.glow, 0.35),
          0.09,
        );
    }
  }

  // 4. Roots across: from behind one lip to behind the other, sagging, lit along their top.
  for (const g of group) {
    if (Math.min(g.w, g.h) < S.minSide) continue;
    const horiz = g.w >= g.h;
    const along = horiz ? g.w : g.h;
    const n = clamp(Math.round(along / S.rootEvery), 1, 4);
    for (let k = 0; k < n; k++) {
      const t0 = (k + 0.2 + 0.6 * r()) / n;
      let ax: number;
      let ay: number;
      let bx: number;
      let by: number;
      if (horiz) {
        ax = g.x + t0 * g.w;
        ay = g.y - 30;
        bx = ax + range(r, -1, 1) * Math.max(g.h * 1.4, 220);
        by = g.y + g.h + 30;
      } else {
        ay = g.y + t0 * g.h;
        ax = g.x - 30;
        by = ay + range(r, 0.2, 1) * Math.max(g.w * 1.1, 200) * (r() < 0.5 ? 1 : -0.6);
        bx = g.x + g.w + 30;
      }
      bx = clamp(bx, g.x - 30, g.x + g.w + 30);
      by = clamp(by, g.y - 30, g.y + g.h + 30);
      const sag = range(r, 20, 70);
      const line: number[] = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        line.push(lerp(ax, bx, t), lerp(ay, by, t) + Math.sin(t * Math.PI) * sag);
      }
      const wl = wander(line, 18, seed + k * 41, 80);
      const wd = range(r, S.rootW[0] as number, S.rootW[1] as number);
      p.solid(
        ribbon(wl, (t) => wd * (0.8 + 0.3 * Math.sin(t * Math.PI))),
        C.root,
        S.hRoot,
        { bark: 0.7 },
      );
      p.tint(
        ribbon(
          wl.map((v, j) => (j % 2 ? v - wd * 0.25 : v)),
          () => wd * 0.22,
        ),
        C.rootLit,
        0.55,
      );
      // A thinner root twisting round it now and then.
      if (r() < 0.5) {
        const tw = wander(wl, wd * 0.9, seed + k * 43, 50);
        p.solid(
          ribbon(tw, () => wd * 0.3),
          mix(C.root, C.rootLit, 0.3),
          S.hRoot + 0.04,
          { bark: 0.6 },
          0.9,
        );
      }
    }
  }

  // 5. Rootlets hanging off the ceiling lip into the dark, and the dim glow.
  edges.forEach((e, i) => {
    if (e.side !== 'n') return;
    const inset = insets[i] as (u: number) => number;
    for (let u = e.a + range(r, 30, 120); u < e.b - 30; u += range(r, 70, 200)) {
      const [x, y] = lipPoint(e, inset, u, -4);
      const len = range(r, 40, 150);
      const line: number[] = [];
      for (let k = 0; k <= 8; k++) line.push(x + Math.sin(k * 0.7 + u) * 4 * (k / 8), y + (len * k) / 8);
      p.solid(
        ribbon(wander(line, 6, seed + u, 30), (t) => range(r, 5, 9) * (1 - t * 0.85)),
        C.root,
        S.hRoot,
        {
          bark: 0.5,
        },
      );
    }
  });
  const glow = C.glow;
  for (const g of group) {
    if (Math.min(g.w, g.h) < S.minSide) continue;
    const n = Math.max(1, Math.round(Math.max(g.w, g.h) / S.glowEvery));
    for (let k = 0; k < n; k++) {
      const cx =
        g.x +
        g.w * ((k + 0.3 + 0.4 * hash1(k, seed + 3)) / n) * (g.w >= g.h ? 1 : 0) +
        (g.w < g.h ? g.w * range(r, 0.3, 0.7) : 0);
      const cy =
        g.w >= g.h ? g.y + g.h * range(r, 0.6, 0.8) : g.y + g.h * ((k + 0.3 + 0.4 * hash1(k, seed + 5)) / n);
      for (let q = 4; q >= 1; q--) {
        const rad = 22 * q + range(r, 0, 10);
        p.tint(blob(cx, cy, rad * 1.3, rad, seed + q, 0.2, 14), glow, 0.035 + 0.02 * (4 - q));
      }
      // A clutch of small caps / spores at its heart.
      const m = 3 + Math.floor(r() * 4);
      for (let q = 0; q < m; q++) {
        const dx = range(r, -26, 26);
        const dy = range(r, -12, 14);
        p.tint(
          blob(cx + dx, cy + dy, range(r, 2.5, 5), range(r, 2, 4), seed + q * 3, 0.1, 8),
          mix(glow, 0xffffff, 0.4),
          0.9,
        );
      }
    }
  }

  // 6. The lips: lobed bark over the rect's edge, a dark seam where the recess begins, lit where it faces up.
  // (The lip is the mass's own dark at the rect's edge, its body colour only near the opening and a lit crescent on
  // the lobes: a lighter band all the way out drew a picture frame with a ruled outer edge.)
  const lipBody = mix(T.body, T.lift, 0.3);
  const lipLit = mix(T.lift, C.rootLit, 0.35);
  // Round the opening's corners first (a fillet inside the union's convex corners: nothing spills into the mass).
  for (const g of group) {
    for (const [cx, cy, sx, sy] of [
      [g.x, g.y, 1, 1],
      [g.x + g.w, g.y, -1, 1],
      [g.x, g.y + g.h, 1, -1],
      [g.x + g.w, g.y + g.h, -1, -1],
    ] as const) {
      const others = group.filter((o) => o !== g);
      const covered = others.some(
        (o) =>
          cx + sx * -4 >= o.x &&
          cx + sx * -4 <= o.x + o.w &&
          cy + sy * -4 >= o.y &&
          cy + sy * -4 <= o.y + o.h,
      );
      if (covered) continue;
      const R = Math.min(range(r, S.fillet[0] as number, S.fillet[1] as number), g.w * 0.45, g.h * 0.45);
      const ox = cx + sx * R;
      const oy = cy + sy * R;
      const pts: number[] = [cx - sx * 6, cy - sy * 6, cx + sx * R, cy - sy * 6];
      for (let q = 0; q <= 10; q++) {
        const a = (q / 10) * (Math.PI / 2);
        const wob = 1 + 0.08 * Math.sin(q * 1.7 + cx);
        pts.push(ox - sx * Math.sin(a) * R * wob, oy - sy * Math.cos(a) * R * wob);
      }
      pts.push(cx - sx * 6, cy + sy * R);
      p.solid(pts, lipBody, S.hLip, { bark: 0.4 });
    }
  }
  edges.forEach((e, i) => {
    const inset = insets[i] as (u: number) => number;
    const front: number[] = [];
    const mid: number[] = [];
    const rear: number[] = [];
    for (let u = e.a - 20; u <= e.b + 20.1; u += 8) {
      const uu = Math.min(u, e.b + 20);
      front.push(...lipPoint(e, inset, uu));
      mid.push(...lipPoint(e, (x) => inset(x) * 0.45, uu));
      rear.push(...lipPoint(e, () => -S.lipBack, uu));
    }
    const close = (a: number[], b: number[]): number[] => {
      const poly = [...a];
      for (let k = b.length / 2 - 1; k >= 0; k--) poly.push(b[k * 2] as number, b[k * 2 + 1] as number);
      return poly;
    };
    // The band the knobs grow from, sinking into the core behind them.
    p.solid(close(mid, rear), lipBody, S.hLip, { bark: 0.4 });
    p.tint(close(mid, rear), T.core, 0.5);
    // The knobs (HK's stacked lumps): each its own rounded shape, a contact shadow into the recess under it, a lit
    // crescent toward the light (strongest where the lip faces up, faint under the ceiling).
    const rr = rngFor(seed, i, e.v, 17);
    const litA = e.side === 's' ? 0.75 : e.side === 'n' ? 0.3 : 0.5;
    const inward: [number, number] =
      e.side === 'n' ? [0, 1] : e.side === 's' ? [0, -1] : e.side === 'w' ? [1, 0] : [-1, 0];
    let u = e.a + range(rr, -10, 30);
    while (u < e.b + 10) {
      const R = range(rr, S.knobR[0] as number, S.knobR[1] as number) * (rr() < 0.2 ? 1.5 : 1);
      const [cx, cy] = lipPoint(e, inset, clamp(u, e.a, e.b), -R * 0.75);
      const along =
        e.side === 'n' || e.side === 's' ? [R * range(rr, 1.05, 1.45), R] : [R, R * range(rr, 1.05, 1.45)];
      const sd = seed + Math.round(u) * 3 + i;
      const shape = chaikin(blob(cx, cy, along[0] as number, along[1] as number, sd, 0.22, 14), 1);
      const shadow = chaikin(
        blob(
          cx + inward[0] * 10,
          cy + inward[1] * 10,
          (along[0] as number) * 1.1,
          (along[1] as number) * 1.1,
          sd,
          0.22,
          14,
        ),
        1,
      );
      p.tint(shadow, C.gap, 0.55);
      p.solid(
        shape.map((v, j) => v + (j % 2 ? -5 : 3)),
        lipLit,
        S.hLip + 0.06,
        { bark: 0.3 },
        litA,
      );
      p.solid(
        shape.map((v, j) => v + (j % 2 ? 2 : -1)),
        lipBody,
        S.hLip + 0.06,
        { bark: 0.35 },
      );
      u += R * range(rr, 1.3, 2.1);
    }
  });

  // 7. The growth on the lips (the look's family): beards off the ceiling, wrap down the walls, dull cushions on the
  // floor's lip (no lit band, no flora: nothing in here is a ledge).
  const G = GROWTH[fam];
  edges.forEach((e, i) => {
    const inset = insets[i] as (u: number) => number;
    const sd = seed + i * 57;
    if (e.side === 'n') {
      paintUnderWrap(p, e.a + 30, e.b - 30, (x) => e.v + inset(x), S.hLip + 0.05, sd, fam, false, false);
    } else if (e.side === 'w' || e.side === 'e') {
      const dir = e.side === 'w' ? 1 : -1;
      paintFaceWrap(p, e.a + 30, e.b - 30, dir, (u) => e.v + dir * inset(u), S.hLip + 0.05, sd, fam);
    } else {
      const rr = rngFor(sd, 13);
      let u = e.a + range(rr, 20, 80);
      while (u < e.b - 20) {
        const run = range(rr, 60, 220);
        for (let x = u; x < Math.min(u + run, e.b - 20); x += range(rr, 12, 26)) {
          const y = e.v - inset(x);
          const rad = range(rr, 6, 15);
          p.solid(
            blob(x, y + rad * 0.2, rad * 1.2, rad * 0.8, sd + x, 0.25, 10),
            rr() < 0.6 ? G.deep : G.body,
            S.hLip + 0.06,
            {
              moss: G.moss * 0.6,
            },
          );
        }
        u += run + range(rr, 60, 240);
      }
    }
  });
}
