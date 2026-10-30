/**
 * The wood's masses (rooms with `art.kit: 'wood'`): solids tagged `root` or `ground` are not limbs but the old
 * wood's bulk, the heartwood and roots a level is carved out of (memory/canopy.md, review r1: "mass with rooms
 * carved out"). A room's masses are painted as ONE body, not rect by rect: each rect's sides are split into the
 * parts that face air (exposed) and the parts that meet another mass (inside the body, never painted as an edge).
 *
 * - The body is the near-black of the wood's deep shadow: what the eye reads as solid.
 * - Every exposed top is a great root running along the floor (the kit's own limb painter: furrows, knots, lichen,
 *   the silvered upper flank) under the walk's moss blanket, flush with the collision; the growth and the live
 *   rim treat it as a stretch (`massStretches`).
 * - Every exposed side is a column of bark (a vertical limb), lumpy, lit on the face; every exposed underside a
 *   root along the ceiling with roots hanging out of it (and a hang for the growth's beards).
 * - Deep inside, a few dim roots and knots so a big mass is never a flat fill.
 * `ground` masses (the den's packed earth) swap the bark for earth: a soil crust with stones and root ends.
 */

import type { Room } from '../../../scene/room';
import {
  BRANCH,
  type BranchPlan,
  knot,
  knotsFor,
  lineLimb,
  mossBlanket,
  paintLimb,
  type Stretch,
  strand,
} from './pf-branch';
import type { Paint } from './pf-paint';
import { blob, chaikin, clamp, hash1, lerp, range, ribbon, rngFor, wander, wobble } from './pf-shape';
import { shelfFor } from './wood-claims';

export const MASS = {
  /** The body: the wood's deep shadow (art direction: teal-indigo, never black). */
  body: 0x060c14,
  deep: 0x03070c,
  /** Dim roots in the deep. */
  vein: 0x0d1822,
  veinLit: 0x1c2a36,
  /** The crust root along a top, a side and an underside: thickness range, px. */
  topTh: [96, 132] as readonly number[],
  sideTh: [72, 104] as readonly number[],
  underTh: [56, 84] as readonly number[],
  /** How far the flanks bulge out of the collision on an exposed side, px. */
  bulge: [3, 12] as readonly number[],
  /** A free top's lip past the face (px) and how far its end rounds down over the corner (no flared capitals). */
  lip: 4,
  roundOver: 24,
  roundTall: 40,
  /** The root filling a square inner corner: its reach along the floor / up the wall, px. */
  corner: [38, 64] as readonly number[],
  /** ...only where the wall over the corner stands at least this tall (px). */
  cornerMinWall: 160,
  /** ...and the floor before it runs at least this far (a narrowing stack's short steps get none). */
  cornerMinFloor: 200,
  /** A pillar (both faces free, narrower than this) flares at its foot by up to `flare` px a side. */
  pillarW: 420,
  /** An underside's free outer corner rounds up into the flank on this radius (px). */
  underRound: 120,
  /** A face that refuses the claws bulges up to this far more (px). */
  looseBulge: 34,
  /** Stacks narrower than this are tapers (burls, hanging clumps), painted as one shape. */
  taperMaxW: 900,
  /** The lift near the playfield (review r3 #10): the shadow family's teal, how far in from a lit edge (px). */
  lift: 0x0f2a36,
  liftReach: 200,
  /** Bark plates on big faces and under tops: their colour and size range (px). */
  plate: 0x10202c,
  plateLen: [140, 300] as readonly number[],
  pillarMinH: 320,
  flare: 22,
  /** Earth (`ground`). */
  soil: 0x161a22,
  soilLit: 0x3a4250,
  stone: 0x2a323c,
} as const;

export interface MassRect {
  x: number;
  y: number;
  w: number;
  h: number;
  tag?: string;
  /** A face that refuses the claws (`false`) may leave the plumb. */
  kick?: boolean | 'east' | 'west';
}

type Seg = [number, number];

/** [a, b] minus the given intervals. */
function minus(a: number, b: number, cut: Seg[]): Seg[] {
  let out: Seg[] = [[a, b]];
  for (const [c, d] of cut) {
    const next: Seg[] = [];
    for (const [x, y] of out) {
      if (d <= x || c >= y) {
        next.push([x, y]);
        continue;
      }
      if (c > x) next.push([x, c]);
      if (d < y) next.push([d, y]);
    }
    out = next;
  }
  return out.filter(([x, y]) => y - x > 2);
}

interface Sides {
  top: Seg[];
  bottom: Seg[];
  left: Seg[];
  right: Seg[];
}

/** The parts of each side of `r` that face air (not another mass, not the room's edge). */
export function exposedSides(r: MassRect, all: readonly MassRect[], W: number, H: number): Sides {
  const others = all.filter((q) => q !== r);
  const xo = (q: MassRect): Seg => [q.x, q.x + q.w];
  const yo = (q: MassRect): Seg => [q.y, q.y + q.h];
  const top =
    r.y <= 0 ? [] : minus(r.x, r.x + r.w, others.filter((q) => q.y < r.y && q.y + q.h >= r.y).map(xo));
  const bottom =
    r.y + r.h >= H
      ? []
      : minus(r.x, r.x + r.w, others.filter((q) => q.y <= r.y + r.h && q.y + q.h > r.y + r.h).map(xo));
  const left =
    r.x <= 0 ? [] : minus(r.y, r.y + r.h, others.filter((q) => q.x < r.x && q.x + q.w >= r.x).map(yo));
  const right =
    r.x + r.w >= W
      ? []
      : minus(r.y, r.y + r.h, others.filter((q) => q.x <= r.x + r.w && q.x + q.w > r.x + r.w).map(yo));
  return { top, bottom, left, right };
}

const inSegs = (v: number, segs: Seg[]) => segs.some(([a, b]) => v >= a - 0.5 && v <= b + 0.5);

/** The lumps of a root mat's underside (px below the collision): never a ruled beam. */
export function matSag(x: number, seed: number): number {
  return 8 + 30 * Math.max(0, wobble(x, seed + 2, 190)) + 12 * wobble(x, seed + 5, 60) ** 2;
}

/**
 * The body's outline: flush where it meets mass (a hair over, so no seam), lumpy where it faces air. An underside is a
 * root mat (lumps hanging); its free outer corners round up into the flank on a wide radius (nothing stands there:
 * review r3 #3, the cabinets). A face that refuses the claws (`kick: false`) leans and bulges more.
 */
function outline(r: MassRect, s: Sides, seed: number): number[] {
  const pts: number[] = [];
  const st = 16;
  const o = 3;
  const loose = r.kick === false;
  const bulge = (y: number, k: number, sd: number) =>
    lerp(MASS.bulge[0] as number, MASS.bulge[1] as number, hash1(k, sd)) +
    (loose ? MASS.looseBulge * Math.max(0, wobble(y, seed + sd, 320)) : 0);
  const yb = r.y + r.h;
  const R = Math.min(MASS.underRound, r.w * 0.35, r.h * 0.45);
  const brC = inSegs(yb - 2, s.right) && inSegs(r.x + r.w - 2, s.bottom);
  const blC = inSegs(yb - 2, s.left) && inSegs(r.x + 2, s.bottom);
  for (let x = r.x; x < r.x + r.w; x += st) pts.push(x, inSegs(x, s.top) ? r.y : r.y - o);
  for (let y = r.y; y < yb; y += st) {
    if (brC && y > yb - R) break;
    const k = Math.round(y / st);
    const out = inSegs(y, s.right) ? bulge(y, k, 1) * clamp((y - r.y) / 40, 0.2, 1) : o;
    pts.push(r.x + r.w + out, y);
  }
  if (brC)
    for (let a = 0; a <= 8; a++) {
      const t = (a / 8) * (Math.PI / 2);
      pts.push(
        r.x + r.w - R + Math.cos(t) * R,
        yb - R + Math.sin(t) * (R + matSag(r.x + r.w - R, seed) * 0.6),
      );
    }
  for (let x = r.x + r.w; x > r.x; x -= st) {
    if (brC && x > r.x + r.w - R) continue;
    if (blC && x < r.x + R) break;
    const sag = inSegs(x, s.bottom) ? matSag(x, seed) * (r.h > 120 ? 1 : 0.4) : o;
    pts.push(x, yb + sag);
  }
  if (blC)
    for (let a = 8; a >= 0; a--) {
      const t = (a / 8) * (Math.PI / 2);
      pts.push(r.x + R - Math.cos(t) * R, yb - R + Math.sin(t) * (R + matSag(r.x + R, seed) * 0.6));
    }
  for (let y = blC ? yb - R : yb; y > r.y; y -= st) {
    const k = Math.round(y / st);
    const out = inSegs(y, s.left) ? bulge(y, k, 3) * clamp((y - r.y) / 40, 0.2, 1) : o;
    pts.push(r.x - out, y);
  }
  return pts;
}

/** The painted silhouette of `r` among `all` (a patch's mask: it shows its lumps and rounded corners, not its rect). */
export function massOutline(
  r: MassRect,
  all: readonly MassRect[],
  W: number,
  H: number,
  seed: number,
): number[] {
  return outline(r, exposedSides(r, all, W, H), seed);
}

/**
 * A taper: rects stacked narrowing up from a floor (the generator's `burl`) or down from a roof (`hang`). Painted as
 * ONE root flare or ONE hanging clump (review r3 #3: two stacked tables read as an altar); the tiers stay collision.
 * `idx` is base first.
 */
interface Taper {
  up: boolean;
  idx: number[];
}

function findTapers(masses: readonly MassRect[], sides: readonly Sides[]): Taper[] {
  const used = new Set<number>();
  const out: Taper[] = [];
  const free = (i: number) => {
    const sd = sides[i] as Sides;
    return sd.left.length > 0 || sd.right.length > 0;
  };
  const next = (b: MassRect, up: boolean): number =>
    masses.findIndex(
      (a) =>
        a !== b &&
        (up ? a.y + a.h === b.y : a.y === b.y + b.h) &&
        a.x >= b.x &&
        a.x + a.w <= b.x + b.w &&
        a.w < b.w &&
        a.w >= 32,
    );
  const order = masses.map((_, i) => i).sort((i, j) => (masses[j] as MassRect).w - (masses[i] as MassRect).w);
  for (const i of order) {
    const b = masses[i] as MassRect;
    const sd = sides[i] as Sides;
    if (used.has(i) || b.w > MASS.taperMaxW || !free(i)) continue;
    for (const up of [true, false]) {
      // A burl stands on something (its foot is not air), a clump hangs from something.
      if (up ? sd.bottom.length > 0 : sd.top.length > 0) continue;
      const chain = [i];
      let j = next(b, up);
      while (j >= 0 && !used.has(j) && free(j)) {
        chain.push(j);
        j = next(masses[j] as MassRect, up);
      }
      if (chain.length < 2) continue;
      const tip = sides[chain[chain.length - 1] as number] as Sides;
      if (up ? !tip.top.length : !tip.bottom.length) continue;
      for (const c of chain) used.add(c);
      out.push({ up, idx: chain });
      break;
    }
  }
  return out;
}

/** Merged runs: (key, a, b) segments with the same key joined where they touch, each with the rect it started on. */
interface Run {
  key: number;
  a: number;
  b: number;
  i: number;
  dir: number;
}

function mergeRuns(list: Run[]): Run[] {
  const sorted = [...list].sort((p, q) => p.dir - q.dir || p.key - q.key || p.a - q.a);
  const out: Run[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && last.dir === r.dir && Math.abs(last.key - r.key) < 0.5 && r.a <= last.b + 1)
      last.b = Math.max(last.b, r.b);
    else out.push({ ...r });
  }
  return out;
}

/** A pseudo-stretch for a mass top (the growth and the live rim read these fields). */
function topStretch(
  id: string,
  x0: number,
  x1: number,
  y: number,
  th: number,
  wallW: boolean,
  wallE: boolean,
): Stretch {
  const s = { tag: 'root', x: x0, y, w: x1 - x0, h: th } as unknown as Stretch['s'];
  return {
    id,
    s,
    x0,
    x1,
    y,
    rects: [{ x0, x1, top: y }],
    west: wallW ? 'trunk' : 'snap',
    east: wallE ? 'trunk' : 'snap',
    grows: 1,
    parent: 'mass',
    from: [x0, y],
    th: () => th,
    under: () => y + th,
    top: () => y,
    far: false,
    reachW: 0,
    reachE: 0,
    thRoot: th,
    thEnd: th,
  };
}

/**
 * Paints the room's masses into `p` and adds their tops to `plan.stretches` (rim, growth) and their undersides to
 * `plan.hangs`. `only`: paint only what touches this rect (a cover's patch; the caller masks the rest).
 */
export function paintMasses(
  p: Paint,
  plan: BranchPlan | null,
  masses: readonly MassRect[],
  W: number,
  H: number,
  seed: number,
  only?: { x: number; y: number; w: number; h: number },
): void {
  const B = BRANCH;
  const near = (x0: number, y0: number, x1: number, y1: number) =>
    !only ||
    (x1 > only.x - 200 && x0 < only.x + only.w + 200 && y1 > only.y - 200 && y0 < only.y + only.h + 200);
  const sides = masses.map((r) => exposedSides(r, masses, W, H));
  const earth = (r: MassRect) => r.tag === 'ground';

  const tapers = findTapers(masses, sides);
  const inTaper = new Set(tapers.flatMap((t) => t.idx));

  // 1. The body (a taper's is its own silhouette, step 1b).
  masses.forEach((r, i) => {
    if (inTaper.has(i) || !near(r.x, r.y, r.x + r.w, r.y + r.h)) return;
    const s = sides[i] as Sides;
    p.solid(outline(r, s, seed + i * 7), earth(r) ? MASS.deep : MASS.body, B.walkH - 0.12, { bark: 0.25 });
  });

  // The merged runs of exposed edge: a face down two stacked rects is one face (no seam where they meet).
  const faceRuns: Run[] = [];
  const underRuns: Run[] = [];
  const topRuns: Run[] = [];
  masses.forEach((r, i) => {
    if (inTaper.has(i)) return;
    const s = sides[i] as Sides;
    for (const [y0, y1] of s.right) faceRuns.push({ key: r.x + r.w, a: y0, b: y1, i, dir: 1 });
    for (const [y0, y1] of s.left) faceRuns.push({ key: r.x, a: y0, b: y1, i, dir: -1 });
    for (const [x0, x1] of s.bottom) underRuns.push({ key: r.y + r.h, a: x0, b: x1, i, dir: 0 });
    for (const [x0, x1] of s.top) topRuns.push({ key: r.y, a: x0, b: x1, i, dir: 0 });
  });
  const faces = mergeRuns(faceRuns);
  const unders = mergeRuns(underRuns);
  const tops = mergeRuns(topRuns);

  // 2. The deep: dim roots wandering through big masses, a knot now and then.
  masses.forEach((r, i) => {
    if (inTaper.has(i) || !near(r.x, r.y, r.x + r.w, r.y + r.h)) return;
    const area = r.w * r.h;
    const n = Math.round(area / 160000);
    const rr = rngFor(seed, r.x, r.y, 3);
    for (let k = 0; k < n; k++) {
      const horiz = r.w > r.h ? rr() < 0.75 : rr() < 0.3;
      const xa = r.x + range(rr, 0, r.w);
      const ya = r.y + range(rr, 0, r.h);
      const len = range(rr, 180, 600);
      const xb = horiz ? xa + len * (rr() < 0.5 ? -1 : 1) : xa + range(rr, -120, 120);
      const yb = horiz ? ya + range(rr, -90, 90) : ya + len * (rr() < 0.5 ? -1 : 1);
      const line: number[] = [];
      for (let t = 0; t <= 12; t++) {
        line.push(
          clamp(lerp(xa, xb, t / 12), r.x + 8, r.x + r.w - 8),
          clamp(lerp(ya, yb, t / 12), r.y + 8, r.y + r.h - 8),
        );
      }
      const wl = wander(line, 24, seed + i * 31 + k, 70);
      const wd = range(rr, 8, 26);
      p.solid(
        ribbon(wl, (t) => wd * (0.35 + Math.sin(t * Math.PI) * 0.65)),
        MASS.vein,
        B.walkH - 0.06,
        { bark: 0.5, alpha: 0.8 },
      );
      p.tint(
        strand(
          wl.map((v, j) => (j % 2 ? v - wd * 0.28 : v)),
          wd * 0.22,
        ),
        MASS.veinLit,
        0.4,
      );
    }
    for (let k = 0; k < Math.round(area / 400000); k++) {
      const cx = r.x + range(rr, 40, Math.max(41, r.w - 40));
      const cy = r.y + range(rr, 40, Math.max(41, r.h - 40));
      knot(p, cx, cy, range(rr, 8, 16), range(rr, -0.6, 0.6), B.walkH - 0.08, seed + k * 13 + i);
    }
  });

  // 2b. Near the playfield the body lifts toward the shadow family's teal and breaks into bark plates (review r3 #3,
  // #10: a 1000 px black plane with a lit edge read as a slab). Clipped to the mass it lies in.
  const inMass = (x: number, y: number) =>
    masses.some((q) => x >= q.x - 2 && x <= q.x + q.w + 2 && y >= q.y - 2 && y <= q.y + q.h + 2);
  const liftBand = (run: Run, side: 'top' | 'face'): void => {
    const len = run.b - run.a;
    if (len < 60) return;
    const r = masses[run.i] as MassRect;
    if (earth(r)) return;
    const rr = rngFor(seed, run.key, run.a, 37);
    const into = side === 'top' ? 1 : -run.dir;
    for (let k = 0; k < 5; k++) {
      const d = MASS.liftReach * ((k + 1) / 5);
      const pts: number[] = [];
      const edge: number[] = [];
      for (let u = run.a; u <= run.b + 0.01; u += 24) {
        const wob = 26 * wobble(u, seed + k * 3 + run.key, 160);
        const dd = clamp(d + wob, 10, MASS.liftReach + 30);
        if (side === 'top') {
          edge.push(u, run.key + 2);
          pts.push(u, run.key + dd);
        } else {
          edge.push(run.key + into * 2, u);
          pts.push(run.key + into * dd, u);
        }
      }
      for (let j = pts.length / 2 - 1; j >= 0; j--) edge.push(pts[j * 2] as number, pts[j * 2 + 1] as number);
      p.tint(edge, MASS.lift, 0.28);
    }
    // Plates: long irregular shells along the edge, a little proud, dark seams between them.
    let u = run.a + range(rr, 10, 80);
    while (u < run.b - 60) {
      const l = Math.min(range(rr, MASS.plateLen[0] as number, MASS.plateLen[1] as number), run.b - 30 - u);
      if (l < 60) break;
      const d0 = range(rr, side === 'top' ? 70 : 40, 120);
      const dep = range(rr, 50, 130);
      const um = u + l / 2;
      const cx = side === 'top' ? um : run.key + into * (d0 + dep / 2);
      const cy = side === 'top' ? run.key + d0 + dep / 2 : um;
      if (inMass(cx, cy)) {
        const shape =
          side === 'top'
            ? chaikin(blob(cx, cy, l / 2, dep / 2, seed + Math.round(u), 0.25, 14), 2)
            : chaikin(blob(cx, cy, dep / 2, l / 2, seed + Math.round(u), 0.25, 14), 2);
        p.solid(shape, MASS.plate, B.walkH - 0.08 + range(rr, 0, 0.05), { bark: 0.7, alpha: 0.7 }, 0.75);
      }
      u += l + range(rr, 14, 40);
    }
  };
  for (const f of faces) if (near(f.key - 240, f.a, f.key + 240, f.b)) liftBand(f, 'face');
  for (const t of tops) if (near(t.a, t.key - 40, t.b, t.key + 240)) liftBand(t, 'top');

  // 1b. Tapers: a burl is one root flare, a hanging clump one bundle of roots (drawn over the bodies around them).
  for (const t of tapers) {
    const ms = t.idx.map((i) => masses[i] as MassRect);
    const b0 = ms[0] as MassRect;
    if (!near(b0.x - 200, b0.y - 600, b0.x + b0.w + 200, b0.y + b0.h + 600)) continue;
    paintTaper(p, plan, masses, sides, t, seed + b0.x * 3 + b0.y);
  }

  // 3. Sides: columns of bark (or earth) down every exposed face, lit toward the air.
  for (const f of faces) {
    const r = masses[f.i] as MassRect;
    const i = f.i;
    const dir = f.dir;
    const x = f.key;
    const y0 = f.a;
    const y1 = f.b;
    if (!near(x - 200, y0, x + 200, y1)) continue;
    const rr = rngFor(seed, x, y0, 5);
    const th = range(rr, MASS.sideTh[0] as number, MASS.sideTh[1] as number);
    const cx = x - dir * (th * 0.5 - 6);
    // Drawn so the lit flank (the limb's upper side) faces the air: down on an east face, up on a west face.
    // (Under an exposed top the column starts below the top's root, which turns down over the corner.)
    const topped = tops.some((t) => Math.abs(t.key - y0) < 2 && x - dir * 8 >= t.a && x - dir * 8 <= t.b);
    const yTop = topped ? y0 + 46 : y0 - 10;
    // (Over a rounded free underside corner the column stops short of it.)
    const s = sides[i] as Sides;
    const roundEnd =
      Math.abs(y1 - (r.y + r.h)) < 2 && inSegs(dir > 0 ? r.x + r.w - 2 : r.x + 2, s.bottom)
        ? Math.min(MASS.underRound, r.w * 0.35, r.h * 0.45)
        : 0;
    const yEnd = y1 + 10 - roundEnd * 0.8;
    const ya = dir > 0 ? yTop : yEnd;
    const yb = dir > 0 ? yEnd : yTop;
    if (Math.abs(yb - ya) < 40) continue;
    const s0 = sides[i] as Sides;
    // A free-standing pillar flares into its foot (and a face leans a little either way), never a plumb post.
    // (Only a tall one: the steps of a narrowing stack, each flared at its foot, read as a pagoda.)
    const pillar = r.w <= MASS.pillarW && r.h >= MASS.pillarMinH && s0.left.length > 0 && s0.right.length > 0;
    const yLo = Math.max(ya, yb);
    const flare = (yy: number) => (pillar ? MASS.flare * clamp((yy - (yLo - 200)) / 200, 0, 1) ** 2 : 0);
    const loose = r.kick === false ? MASS.looseBulge * 0.7 : 0;
    const line: number[] = [];
    for (let t = 0; t <= 16; t++) {
      const yy = lerp(ya, yb, t / 16);
      line.push(
        cx +
          dir *
            (4 * wobble(yy, seed + i, 90) +
              8 * wobble(yy, seed + i + 5, 600) +
              loose * Math.max(0, wobble(yy, seed + i * 7 + 1, 320)) +
              flare(yy)),
        yy,
      );
    }
    if (earth(r)) {
      p.solid(
        ribbon(line, () => th),
        MASS.soil,
        B.walkH,
        { bark: 0.05 },
      );
      p.tint(
        ribbon(
          line.map((v, j) => (j % 2 ? v : v + dir * th * 0.32)),
          () => th * 0.3,
        ),
        MASS.soilLit,
        0.35,
      );
      stones(p, cx - th / 2, Math.min(y0, y1), th, Math.abs(y1 - y0), seed + i);
    } else {
      // The face's width swells and pinches (a column of even width reads as a post).
      const L = lineLimb(
        line,
        (t) => th * (0.75 + 0.3 * Math.sin(t * Math.PI * 3 + i) + 0.15 * wobble(t * 900, seed + i, 200)),
        B.walkH,
        seed + i * 3 + y0,
        0,
        0.8,
      );
      paintLimb(p, L, knotsFor(L, seed + y0, 520));
      // (A face is not a walk: it sinks a step under the tops, the brightest wood she stands on.)
      p.tint(
        ribbon(line, () => th + 4),
        MASS.body,
        0.3,
      );
      fadeInto(p, line, () => th * 1.05, -dir, 0, MASS.body);
      roots(p, line, -dir, th, seed + i * 7 + y0, 'side');
    }
  }

  // 4. Undersides: a root mat (review r3 #3: a beam with brackets read as a joist): no beam, the body's own lumpy
  // underside, clumps of roots of uneven length hanging out of it, a fringe of rootlets.
  for (const u of unders) {
    const r = masses[u.i] as MassRect;
    const i = u.i;
    const y = u.key;
    const x0 = u.a;
    const x1 = u.b;
    if (!near(x0, y - 200, x1, y + 200)) continue;
    const rr = rngFor(seed, x0, y, 7);
    if (earth(r)) {
      const th = Math.min(range(rr, MASS.underTh[0] as number, MASS.underTh[1] as number), r.h);
      const line: number[] = [];
      for (let x = x0 - 12; x <= x1 + 12; x += 24) line.push(x, y - th * 0.5 + 6 * wobble(x, seed + 11, 140));
      p.solid(
        ribbon(line, () => th),
        MASS.soil,
        B.walkH - 0.04,
        { bark: 0.05 },
      );
      stones(p, x0, y - th, x1 - x0, th, seed + 3 * i);
    }
    rootMat(p, x0, x1, y, seed + i * 5 + x0, earth(r));
    plan?.hangs.push({ x0: x0 + 20, x1: x1 - 20, y: () => y + 4, deep: false, reach: 180 });
  }

  // 5. Tops: a great root under every exposed top, the walk's moss on it, flush with the collision.
  for (const tp of tops) {
    const r = masses[tp.i] as MassRect;
    const i = tp.i;
    const s = sides[i] as Sides;
    const x0 = tp.a;
    const x1 = tp.b;
    const y = tp.key;
    if (!near(x0, y - 200, x1, y + 200)) continue;
    const rr = rngFor(seed, x0, y, 9);
    // Over the top's ends: a wall rising (another mass, its side over this top) or a free corner (a drop).
    const wallW = masses.some((q) => q.x + q.w >= x0 - 1 && q.x < x0 && q.y < y && q.y + q.h >= y);
    const wallE = masses.some((q) => q.x <= x1 + 1 && q.x + q.w > x1 && q.y < y && q.y + q.h >= y);
    const edgeW = masses.find((q) => q.y === y && x0 >= q.x - 1 && x0 <= q.x + 1);
    const edgeE = masses.find((q) => q.y === y && x1 >= q.x + q.w - 1 && x1 <= q.x + q.w + 1);
    const freeW = !wallW && !!edgeW && inSegs(y + 8, (sides[masses.indexOf(edgeW)] as Sides).left);
    const freeE = !wallE && !!edgeE && inSegs(y + 8, (sides[masses.indexOf(edgeE)] as Sides).right);
    const depth = r.h + (inSegs(x0 + 1, s.bottom) ? 0 : 200);
    const th = Math.min(range(rr, MASS.topTh[0] as number, MASS.topTh[1] as number), depth);
    const xa = x0 - (wallW ? 40 : freeW ? MASS.lip : 0);
    const xb = x1 + (wallE ? 40 : freeE ? MASS.lip : 0);
    // The root's thickness swells and pinches; its top stays flush with the collision, rounding over a free end.
    const thAt = (x: number) =>
      th * (0.86 + 0.2 * wobble(x, seed + i + 41, 260) + 0.06 * wobble(x, seed + i, 70));
    // (Over a tall sheer face the end rolls down further: a broken trunk's shoulder, not a cube's corner.)
    const tallAt = (ex: number, dir: number) =>
      faces.some((f) => f.dir === dir && Math.abs(f.key - ex) < 1 && f.a <= y + 2 && f.b - y >= 420);
    const rollW = tallAt(x0, -1) ? MASS.roundTall : MASS.roundOver;
    const rollE = tallAt(x1, 1) ? MASS.roundTall : MASS.roundOver;
    const dropAt = (x: number) => {
      const dw = freeW ? clamp((x0 + 30 - x) / 44, 0, 1) : 0;
      const de = freeE ? clamp((x - (x1 - 30)) / 44, 0, 1) : 0;
      return Math.max(rollW * dw ** 2, rollE * de ** 2);
    };
    const line: number[] = [];
    const ws: number[] = [];
    for (let x = xa; x <= xb + 0.01; x += 12) {
      const w = thAt(x);
      line.push(x, y + w * 0.5 + dropAt(x));
      ws.push(w);
    }
    if (earth(r)) {
      p.solid(
        ribbon(line, () => th),
        MASS.soil,
        B.walkH,
        { bark: 0.05 },
      );
      p.tint(
        ribbon(
          line.map((v, j) => (j % 2 ? v - th * 0.32 : v)),
          () => th * 0.3,
        ),
        MASS.soilLit,
        0.3,
      );
      stones(p, x0, y + 10, x1 - x0, th - 10, seed + 5 * i);
    } else {
      const L = lineLimb(line, () => th, B.walkH, seed + i * 11 + x0, 0, 1);
      const n = L.pts.length / 2;
      for (let k = 0; k < n; k++)
        L.w[k] = ws[
          Math.min(ws.length - 1, Math.round((k / Math.max(1, n - 1)) * (ws.length - 1)))
        ] as number;
      paintLimb(p, L, knotsFor(L, seed + x0 + 1, 480));
      fadeInto(p, line, (k) => (ws[Math.min(ws.length - 1, k)] as number) * 1.04, 0, 1, MASS.body);
      roots(p, line, 1, th * 0.8, seed + i * 13 + x0, 'down');
    }
    mossBlanket(
      p,
      x0 - (wallW ? 6 : 0),
      x1 + (wallE ? 6 : 0),
      () => y,
      seed + i * 17 + x0,
      freeW ? 22 : 0,
      freeE ? 22 : 0,
    );
    plan?.stretches.push(topStretch(`mass-${i}-${x0}`, x0, x1, y, th, wallW, wallE));
    // Over a tall sheer face the top's free corner is a broken trunk's: splinters, the bark split down the face
    // (review r3 #3: the hub's high block and the way out's blocks read as cubes).
    if (!earth(r) && x1 - x0 >= 240)
      for (const [free, ex, dir, fr] of [
        [freeW, x0, -1, edgeW],
        [freeE, x1, 1, edgeE],
      ] as const) {
        if (!free || !fr) continue;
        const fs = sides[masses.indexOf(fr)] as Sides;
        const seg = (dir < 0 ? fs.left : fs.right).find(([a]) => Math.abs(a - y) < 2);
        const tall = faces.find(
          (f) => f.dir === dir && Math.abs(f.key - ex) < 1 && f.a <= y + 2 && f.b >= y + 2,
        );
        if (seg && tall && tall.b - tall.a >= 420) brokenTop(p, ex, y, dir, seed + ex * 5 + y);
      }
    // Where the floor meets a wall rising from it: a root buttress out of the wall onto the floor, so the corner is
    // never a square box (review r2 #2). Not on earth (the earth's own corner is soft already).
    // (Not under a short step: a stack of narrowing rects with a buttress at every step read as a pagoda.)
    const wallUp = (x: number) =>
      Math.max(0, ...masses.filter((q) => x >= q.x - 1 && x <= q.x + q.w + 1 && q.y < y).map((q) => y - q.y));
    if (!earth(r) && x1 - x0 >= MASS.cornerMinFloor) {
      if (wallW && wallUp(x0 - 2) >= MASS.cornerMinWall) cornerRoot(p, x0, y, 1, -1, seed + i * 19 + x0);
      if (wallE && wallUp(x1 + 2) >= MASS.cornerMinWall) cornerRoot(p, x1, y, -1, -1, seed + i * 23 + x1);
    }
  }

  // 5b. A narrow mass hanging from the room's top into open air (the gap's roost, review r2 #9) is a clump of roots,
  // not a slab: strands fanning in from above, twisting down its length, running out past its foot in ragged tips.
  masses.forEach((r, i) => {
    const s = sides[i] as Sides;
    if (inTaper.has(i)) return;
    if (earth(r) || r.y > 0 || r.w > MASS.pillarW || !s.bottom.length || !s.left.length || !s.right.length)
      return;
    if (!near(r.x - 300, r.y, r.x + r.w + 300, r.y + r.h + 400)) return;
    const rr = rngFor(seed, r.x, r.h, 83);
    const n = Math.round(r.w / 12) + 5;
    const foot = r.y + r.h;
    for (let k = 0; k < n; k++) {
      const u = n > 1 ? k / (n - 1) : 0.5;
      const xTop = r.x + r.w / 2 + (u - 0.5) * r.w * 2.4;
      const xMid = r.x + r.w / 2 + (u - 0.5) * r.w * 0.9;
      const tipLen = range(rr, 40, 320) * (1 - Math.abs(u - 0.5));
      const xTip = r.x + r.w / 2 + (u - 0.5) * r.w * 1.3 + range(rr, -30, 30);
      const line = chaikinLine([
        xTop,
        -60,
        xMid,
        foot * 0.35,
        xMid + range(rr, -10, 10),
        foot * 0.8,
        xTip,
        foot + tipLen,
      ]);
      const w0 = range(rr, 14, 30);
      paintLimb(
        p,
        lineLimb(
          line,
          (t) => Math.max(2, w0 * (1 - t * 0.85)),
          B.walkH - 0.01,
          seed + k * 13 + r.x,
          0.05,
          0.1,
        ),
      );
    }
  });

  // 6. Ceiling corners (an underside meeting a wall going down from it): the body fills them on a curve, no bracket.
  for (const u of unders) {
    const y = u.key;
    if (!near(u.a, y - 200, u.b, y + 200)) continue;
    const r = masses[u.i] as MassRect;
    if (earth(r)) continue;
    const wallW = masses.some((q) => q.x + q.w >= u.a - 1 && q.x < u.a && q.y < y + 4 && q.y + q.h > y + 4);
    const wallE = masses.some((q) => q.x <= u.b + 1 && q.x + q.w > u.b && q.y < y + 4 && q.y + q.h > y + 4);
    if (wallW) cornerFill(p, u.a, y, 1, seed + u.i * 29 + u.a);
    if (wallE) cornerFill(p, u.b, y, -1, seed + u.i * 31 + u.b);
  }
}

/**
 * A broken trunk's corner at (x, y) (the top she walks to its edge; `dir` = the side the face looks to): a few
 * splinters standing up off the edge (painted, not solid), leaning out; the bark split running down the face from it;
 * moss hanging over the break.
 */
function brokenTop(p: Paint, x: number, y: number, dir: number, seed: number): void {
  const B = BRANCH;
  const r = rngFor(seed, 233);
  // The break: a low torn rim at the very edge (tall spikes read as thorns), a cushion of moss over it.
  const pts: number[] = [x - dir * 90, y + 20, x - dir * 90, y + 2];
  for (let k = 0; k <= 6; k++) {
    const xx = x - dir * 90 * (1 - k / 6);
    pts.push(xx, y - (k % 2 ? range(r, 2, 6) : range(r, 6, 14)) * (k / 6));
  }
  pts.push(x + dir * 6, y + 10, x + dir * 2, y + 40);
  p.solid(pts, B.barkDark, B.walkH - 0.04, { bark: 0.9 });
  p.solid(chaikin(blob(x - dir * 34, y - 2, 46, 11, seed + 3, 0.35, 14), 2), B.mossDark, B.walkH + 0.22, {
    moss: 1,
  });
  // The split: a dark crack down the face, ragged, narrowing.
  const len = range(r, 220, 420);
  const crack: number[] = [];
  for (let t = 0; t <= 10; t++)
    crack.push(x - dir * (26 + 10 * Math.sin(t * 1.7 + seed)), y + 20 + (len * t) / 10);
  p.tint(strand(crack, range(r, 7, 12), 0.1), B.barkDeep, 0.9);
  p.tint(
    strand(
      crack.map((v, j) => (j % 2 ? v : v + dir * 6)),
      2.5,
      0.1,
    ),
    B.barkLit,
    0.35,
  );
  // A curtain of moss and roots hanging over the break and down the face (the corner is never a clean edge).
  for (let k = 0; k < 9; k++) {
    const hx = x - dir * range(r, -4, 70);
    const l = range(r, 60, 320) * (k % 3 ? 0.6 : 1);
    p.solid(
      strand(
        chaikinLine([hx, y + 2, hx + dir * range(r, 6, 14), y + l * 0.5, hx + dir * range(r, 0, 12), y + l]),
        range(r, 6, 13),
        0.7,
      ),
      B.mossDark,
      B.walkH + 0.16,
      { moss: 1, alpha: 0.9 },
    );
  }
}

/** The body filling a ceiling's inner corner on a wide curve (a cave's roof meets its wall soft, never square). */
function cornerFill(p: Paint, x: number, y: number, dir: number, seed: number): void {
  const r = rngFor(seed, 79);
  const R = range(r, 70, 130);
  const fill: number[] = [x, y - 4];
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * (Math.PI / 2);
    fill.push(x + dir * R * (1 - Math.sin(a)), y + R * (1 - Math.cos(a)) * 0.85);
  }
  p.solid(fill, MASS.body, BRANCH.walkH - 0.1, { bark: 0.3 });
}

/**
 * A root mat under a ceiling: clumps of roots fanning out of the lumpy underside, of very uneven length, and a fringe
 * of rootlets between (review r3 #3).
 */
function rootMat(p: Paint, x0: number, x1: number, y: number, seed: number, earth: boolean): void {
  const B = BRANCH;
  const r = rngFor(seed, 211);
  const span = x1 - x0;
  // Clumps.
  for (let x = x0 + range(r, 30, 160); x < x1 - 30; x += range(r, 180, 380)) {
    const mid = 1 - Math.abs((x - x0) / Math.max(1, span) - 0.5) * 1.2;
    const big = clamp(mid, 0.35, 1) * range(r, 0.5, 1.2);
    const n = 3 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const len = (40 + 260 * r() ** 1.6) * big;
      const ax = x + range(r, -34, 34);
      const ex = ax + range(r, -0.45, 0.45) * len;
      const yTop = y + matSag(ax, seed) * 0.5 - 6;
      const line = chaikinLine([
        ax,
        yTop,
        lerp(ax, ex, 0.3) + range(r, -10, 10),
        yTop + len * 0.45,
        ex,
        yTop + len,
      ]);
      const w0 = range(r, 6, 18) * (k === 0 ? 1.4 : 1);
      if (earth) {
        p.solid(strand(line, w0 * 0.6, 0.6), MASS.soil, B.walkH - 0.03, { bark: 0.4 });
      } else {
        paintLimb(
          p,
          lineLimb(
            line,
            (t) => Math.max(1.5, w0 * (1 - t) ** 0.9),
            B.walkH - 0.03,
            seed + k * 7 + Math.round(x),
            0.1,
            0.3,
          ),
        );
      }
    }
    // A clump's knot: where its roots leave the mat.
    p.solid(
      chaikin(
        blob(
          x,
          y + matSag(x, seed) * 0.6,
          range(r, 22, 40),
          range(r, 12, 20),
          seed + Math.round(x),
          0.35,
          12,
        ),
        1,
      ),
      MASS.body,
      B.walkH - 0.05,
      { bark: 0.5 },
    );
  }
  // Rootlets.
  for (let x = x0 + range(r, 4, 20); x < x1 - 4; x += range(r, 14, 46)) {
    const len = range(r, 10, 60);
    const yt = y + matSag(x, seed) - 4;
    p.solid(
      ribbon(
        chaikinLine([x, yt, x + range(r, -5, 5), yt + len * 0.5, x + range(r, -10, 10), yt + len]),
        (t) => Math.max(1.2, 4 * (1 - t)),
      ),
      B.barkDark,
      B.walkH - 0.02,
      { bark: 0.4 },
    );
  }
}

/**
 * A taper painted as one shape (review r3 #3). A burl (`up`): a single swelling flare from the floor narrowing to its
 * top, roots running down its flanks and out onto the floor; its tiers' tops keep a little moss and their stretches.
 * A hanging clump (`down`): one bundle of roots, wide at the roof, narrowing, running out in ragged tips.
 */
function paintTaper(
  p: Paint,
  plan: BranchPlan | null,
  masses: readonly MassRect[],
  sides: readonly Sides[],
  t: Taper,
  seed: number,
): void {
  const B = BRANCH;
  const r = rngFor(seed, 229);
  const ms = t.idx.map((i) => masses[i] as MassRect);
  const base = ms[0] as MassRect;
  const tip = ms[ms.length - 1] as MassRect;
  const up = t.up;
  const yFar = up ? base.y + base.h : base.y;
  const yTip = up ? tip.y : tip.y + tip.h;
  const fl = clamp(base.w * 0.14, 28, 70);
  // The profile on each side, from the far end (floor / roof) to the tip, through the tiers' outer corners and the
  // inner corners between them (chaikin then rounds the stairs into one swelling line).
  const profile = (side: -1 | 1): number[] => {
    const ex = (m: MassRect) => (side < 0 ? m.x : m.x + m.w);
    const pts: number[] = [
      ex(base) + side * fl,
      yFar + (up ? 6 : -6),
      ex(base) + side * fl * 0.3,
      yFar + (up ? -24 : 24),
    ];
    ms.forEach((m, k) => {
      const near = up ? m.y + m.h : m.y;
      const farY = up ? m.y : m.y + m.h;
      if (k > 0) pts.push(ex(m), near);
      pts.push(ex(m), farY);
    });
    return pts;
  };
  const L = profile(-1);
  const R = profile(1);
  const poly: number[] = [...L];
  for (let k = R.length / 2 - 1; k >= 0; k--) poly.push(R[k * 2] as number, R[k * 2 + 1] as number);
  // Close along the floor / roof, a little into it.
  poly.push(base.x + base.w + fl, yFar + (up ? 30 : -30), base.x - fl, yFar + (up ? 30 : -30));
  const body = chaikin(poly, 3);
  p.solid(body, MASS.body, B.walkH - 0.1, { bark: 0.3 });
  p.tint(body, MASS.lift, 0.35);
  // The roots: from the tip down the flanks (or from the roof down to the tip), fanning out as it widens.
  const n = up ? clamp(Math.round(base.w / 54), 4, 10) : clamp(Math.round(base.w / 36), 5, 16);
  const order = Array.from({ length: n }, (_, k) => k).sort(
    (a, b) => Math.abs(a / (n - 1) - 0.5) - Math.abs(b / (n - 1) - 0.5),
  );
  for (const k of order) {
    const u = k / (n - 1);
    // The centre line as points from the far end (floor / roof) to the tip.
    const pts: Array<[number, number]> = [];
    if (up) {
      for (const m of ms) pts.push([lerp(m.x + 16, m.x + m.w - 16, u) + range(r, -8, 8), m.y + m.h * 0.65]);
      pts.push([lerp(tip.x + 18, tip.x + tip.w - 18, u), yTip + 20]);
      // Out onto the floor, beyond the foot.
      pts.unshift([lerp(base.x - fl * 1.3, base.x + base.w + fl * 1.3, u), yFar - 4]);
      pts.unshift([lerp(base.x - fl * 2.4, base.x + base.w + fl * 2.4, u) + range(r, -20, 20), yFar + 10]);
      pts.reverse();
    } else {
      // A clump hangs: its roots run down (never sideways), each kept inside the tiers it passes, and run out past
      // the bottom in ragged tips.
      const x0 = lerp(base.x + 14, base.x + base.w - 14, u) + range(r, -0.45, 0.45) * (base.w / n);
      pts.push([x0, yFar - 50]);
      let x = x0;
      for (const m of ms) {
        x = clamp(x, m.x + 14, m.x + m.w - 14);
        pts.push([x + range(r, -6, 6), m.y + m.h * 0.5]);
      }
      pts.push([x + range(r, -26, 26), yTip + range(r, 30, 220) * (0.4 + 0.6 * (1 - Math.abs(u - 0.5) * 2))]);
    }
    const line = pts.flat();
    const c = chaikinLine(line);
    const outer = Math.abs(u - 0.5) * 2;
    const w0 =
      (up ? base.w / n : Math.min(48, base.w / n)) *
      (up ? range(r, 0.8, 1.2) : range(r, 0.45, 1.5)) *
      (0.8 + 0.4 * outer);
    const width = up
      ? (tt: number) => Math.max(4, w0 * (0.55 + 0.45 * tt) * (tt > 0.85 ? (1 - tt) / 0.15 + 0.2 : 1))
      : (tt: number) => Math.max(2, w0 * (1.1 - tt * 0.95));
    paintLimb(p, lineLimb(c, width, B.walkH + (outer > 0.8 ? 0.02 : -0.02), seed + k * 17, 0.15, 0.7));
  }
  if (up)
    knot(
      p,
      (tip.x + tip.x + tip.w) / 2 + range(r, -20, 20),
      tip.y + tip.h * 0.6,
      range(r, 10, 16),
      0.2,
      B.walkH,
      seed + 5,
    );
  // The tops she stands on: the tip's moss in full, a few tufts on each tier; all join the stretches (rim, growth).
  t.idx.forEach((i) => {
    const m = masses[i] as MassRect;
    const sd = sides[i] as Sides;
    for (const [x0, x1] of sd.top) {
      const full = m === tip && up;
      mossBlanket(p, x0, x1, () => m.y, seed + x0, full ? 22 : 10, full ? 22 : 10);
      plan?.stretches.push(topStretch(`taper-${i}-${x0}`, x0, x1, m.y, 60, false, false));
    }
    if (!up)
      for (const [x0, x1] of sd.bottom)
        plan?.hangs.push({ x0: x0 + 10, x1: x1 - 10, y: () => m.y + m.h + 4, deep: false, reach: 120 });
  });
}

/**
 * A root growing out of a wall into the floor (`vy` -1: the corner is under it) or along a ceiling (`vy` +1), at the
 * corner (x, y), reaching away from the wall (`dir`). Fills the square corner with a curved buttress.
 */
function cornerRoot(p: Paint, x: number, y: number, dir: number, vy: number, seed: number): void {
  const r = rngFor(seed, 77);
  const R = range(r, MASS.corner[0] as number, MASS.corner[1] as number);
  // The fillet itself: the body's dark filling the corner on a curve.
  const fill: number[] = [x, y];
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * (Math.PI / 2);
    fill.push(x + dir * R * (1 - Math.cos(a)) * 0.9, y + vy * R * (1 - Math.sin(a)));
  }
  p.solid(fill, MASS.body, BRANCH.walkH - 0.05, { bark: 0.4 });
  // The root over it: from up the wall, curving out along the floor (or the ceiling) and tapering.
  const line = [
    x - dir * 6,
    y + vy * R * 1.25,
    x + dir * R * 0.12,
    y + vy * R * 0.45,
    x + dir * R * 0.55,
    y + vy * 8,
    x + dir * R * 1.35,
    y + vy * 2,
  ];
  const c = chaikinLine(line);
  const w0 = range(r, 26, 40);
  paintLimb(
    p,
    lineLimb(c, (t) => Math.max(5, w0 * (1 - t) ** 0.9), BRANCH.walkH - 0.01, seed, vy < 0 ? 0.3 : 0, 0.7),
  );
}

/**
 * Sinks the inner side of a crust root into the body (no hard inner edge: a column that reads as a post, a top that
 * reads as a log lying on a box). `line` is the root's centre line, `w(i)` its width at point i, (nx, ny) the unit
 * direction from the centre toward the inside of the mass.
 */
function fadeInto(
  p: Paint,
  line: number[],
  w: (i: number) => number,
  nx: number,
  ny: number,
  color: number,
): void {
  const n = line.length / 2;
  for (let k = 0; k < 6; k++) {
    // A band from the inner edge reaching (k + 1) / 6 of the way to the centre, each a little more opaque.
    const reach = (k + 1) / 6;
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = line[i * 2] as number;
      const y = line[i * 2 + 1] as number;
      const h = w(i) / 2;
      a.push(x + nx * (h + 2), y + ny * (h + 2));
      b.push(x + nx * h * (1 - reach), y + ny * h * (1 - reach));
    }
    for (let i = n - 1; i >= 0; i--) a.push(b[i * 2] as number, b[i * 2 + 1] as number);
    p.tint(a, color, 0.16);
  }
}

/**
 * Roots leaving a crust root into the body: every few hundred px one dives away from the air (`dir` +1 down from a
 * top, +-1 sideways from a face), tapering into the dark.
 */
function roots(p: Paint, line: number[], dir: number, th: number, seed: number, kind: 'down' | 'side'): void {
  const r = rngFor(seed, line.length);
  const n = line.length / 2;
  for (let i = Math.floor(range(r, 4, 20)); i < n - 4; i += Math.max(6, Math.round(range(r, 18, 40)))) {
    const x = line[i * 2] as number;
    const y = line[i * 2 + 1] as number;
    const len = range(r, 70, 220);
    const w0 = range(r, 18, 40);
    const bend = range(r, -0.6, 0.6);
    const pts =
      kind === 'down'
        ? [
            x,
            y + th * 0.25,
            x + bend * len * 0.4,
            y + th * 0.25 + len * 0.5,
            x + bend * len,
            y + th * 0.25 + len,
          ]
        : [
            x + dir * th * 0.25,
            y,
            x + dir * (th * 0.25 + len * 0.5),
            y + bend * len * 0.4,
            x + dir * (th * 0.25 + len),
            y + bend * len,
          ];
    const c = chaikinLine(pts);
    p.solid(
      ribbon(c, (t) => w0 * (1 - t) ** 1.3 + 2),
      BRANCH.barkDark,
      BRANCH.walkH - 0.03,
      { bark: 0.6 },
    );
    p.tint(
      strand(
        c.map((v, j) => (j % 2 ? v - w0 * 0.2 : v)),
        w0 * 0.25,
        0.4,
      ),
      BRANCH.bark,
      0.5,
    );
  }
}

/** A smooth line through three or more points (open). */
function chaikinLine(pts: number[]): number[] {
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

/** Stones and root ends packed in earth. */
function stones(p: Paint, x: number, y: number, w: number, h: number, seed: number): void {
  const r = rngFor(seed, x, y);
  const n = Math.round((w * h) / 5000);
  for (let k = 0; k < n; k++) {
    const cx = x + range(r, 0, w);
    const cy = y + range(r, 0, h);
    const rad = range(r, 4, 14);
    p.solid(chaikin(blob(cx, cy, rad * 1.3, rad, seed + k, 0.3, 10), 1), MASS.stone, BRANCH.walkH + 0.06, {
      bark: 0,
    });
  }
}

/**
 * One-way ledges in the wood (review r3 #2: the den's escape ledges were simulated and never drawn): a thick root
 * shelf, its top flush with the ledge and mossed. Out of the wall beside it (it grows from the face and droops at its
 * free end), or, standing free, a root knot hung from the ceiling over it on twisting strands (wikis of roots that
 * run up into the dark). The tops join the stretches (rim, growth).
 */
export function paintShelves(p: Paint, plan: BranchPlan | null, room: Room, seed: number): void {
  const B = BRANCH;
  room.oneWays.forEach((o, i) => {
    const sh = shelfFor(room, o);
    const rr = rngFor(seed, o.x, o.y, 91);
    const th = range(rr, 54, 70);
    const y = o.y;
    const wallW = sh.wall === 'w';
    const wallE = sh.wall === 'e';
    const xa = sh.x0 - (wallW ? 48 : 10);
    const xb = sh.x1 + (wallE ? 48 : 10);
    // The free end(s) droop a little and taper; the walk itself stays flush.
    const line: number[] = [];
    const ws: number[] = [];
    for (let x = xa; x <= xb + 0.01; x += 10) {
      const freeW = !wallW && x < sh.x0 + 30 ? (sh.x0 + 30 - x) / 40 : 0;
      const freeE = !wallE && x > sh.x1 - 30 ? (x - (sh.x1 - 30)) / 40 : 0;
      const tip = Math.max(freeW, freeE);
      const w = th * (0.92 + 0.12 * wobble(x, seed + i, 90)) * (1 - 0.45 * tip);
      ws.push(w);
      line.push(x, y + w * 0.5 + 14 * tip * tip);
    }
    const L = lineLimb(line, () => th, B.walkH, seed + i * 17 + o.x, 0, 1);
    const n = L.pts.length / 2;
    for (let k = 0; k < n; k++)
      L.w[k] = ws[Math.min(ws.length - 1, Math.round((k / Math.max(1, n - 1)) * (ws.length - 1)))] as number;
    // Hung from the ceiling: twisting strands from the roof down into both ends and the middle (drawn first, behind).
    if (!sh.wall) {
      const top = sh.ceil ?? y - 900;
      // A knot of roots, not a swing: strands of uneven weight that twist round each other, splay out over the
      // roof and wrap the shelf's ends, darkening up into the roof.
      const n = 6;
      for (let s = 0; s < n; s++) {
        const u = (s + 0.5) / n;
        const ax = lerp(sh.x0 + 18, sh.x1 - 18, u) + range(rr, -14, 14);
        const xt = ax + (u - 0.5) * range(rr, 120, 320) + range(rr, -60, 60);
        const raw: number[] = [];
        for (let t = 0; t <= 14; t++) {
          const v = t / 14;
          const twist = Math.sin(v * Math.PI * range(rr, 1.5, 3) + s) * 18 * Math.sin(v * Math.PI);
          raw.push(lerp(xt, ax, v ** 0.8) + twist, lerp(top - 60, y + th * 0.55, v));
        }
        const pts = wander(raw, 14, seed + i * 31 + s, 120);
        const w0 = range(rr, 6, 15) * (s % 3 === 1 ? 1.5 : 1);
        const S = lineLimb(
          pts,
          (t) => w0 * (0.6 + 0.6 * t ** 2),
          B.walkH - 0.06,
          seed + i * 31 + s,
          0.05,
          0.25,
        );
        paintLimb(p, S);
        // (Into the dark of the roof.)
        p.tint(
          ribbon(pts.slice(0, Math.round(pts.length * 0.45) & ~1), () => w0 * 1.6),
          MASS.body,
          0.55,
        );
      }
    }
    paintLimb(p, L, knotsFor(L, seed + o.x, 400));
    // Under it: short roots and moss hanging, a dark belly (it is a ledge in the dark, not a beam).
    for (let x = sh.x0 + range(rr, 10, 30); x < sh.x1 - 10; x += range(rr, 22, 50)) {
      const len = range(rr, 14, 70);
      const yu = y + th - 6;
      p.solid(
        ribbon(
          chaikinLine([x, yu, x + range(rr, -6, 6), yu + len * 0.5, x + range(rr, -12, 12), yu + len]),
          (t) => Math.max(1.5, 6 * (1 - t)),
        ),
        B.barkDark,
        B.walkH - 0.02,
        { bark: 0.4 },
      );
    }
    mossBlanket(
      p,
      sh.x0 - (wallW ? 6 : 0),
      sh.x1 + (wallE ? 6 : 0),
      () => y,
      seed + i * 23 + o.x,
      wallW ? 0 : 18,
      wallE ? 0 : 18,
    );
    plan?.stretches.push(topStretch(`shelf-${i}`, sh.x0, sh.x1, y, th, wallW, wallE));
  });
}
