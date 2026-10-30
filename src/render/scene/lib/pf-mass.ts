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

import { ROOMS } from '../../../scene/index';
import type { Room } from '../../../scene/room';
import { gradeLookOf, type Look } from './looks';
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
import {
  distToRuns,
  EDGE,
  type EdgeTone,
  type LobeSpec,
  lerp3,
  lobeOffset,
  lobesFor,
  paintFaceLobes,
  paintFringe,
  paintTopBand,
  paintUnderLobes,
} from './pf-edge';
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
  /** ...a hanging one only this narrow (wider is the roof's own mass), and none with a claw face this tall. */
  hangMaxW: 360,
  /** Faces of masses narrower than this keep a bark column (a root post), not lobes. */
  lobeMinW: 220,
  hangMinH: 160,
  clawTaper: 400,
  /** The lift near the playfield (review r3 #10): the shadow family's teal, how far in from a lit edge (px). */
  lift: 0x0f2a36,
  liftReach: 200,
  /** Bark plates on big faces and under tops: their colour and size range (px). */
  plate: 0x10202c,
  plateLen: [140, 300] as readonly number[],
  pillarMinH: 320,
  flare: 22,
  /** Sub-masses (canopy r7, review r6 #5): one per cell of this size (px), their half width range, the share of the
   *  way from the body to the lift of each of the two values. */
  subCell: [420, 300] as readonly number[],
  subR: [180, 420] as readonly number[],
  subLift: [1.0, 1.7] as readonly number[],
  /** Knuckles deep in a big mass (canopy r7): one per this many px² of it, their half width range, px. */
  knuckleArea: 180000,
  knuckleR: [140, 340] as readonly number[],
  /** Earth (`ground`). */
  soil: 0x161a22,
  soilLit: 0x3a4250,
  stone: 0x2a323c,
} as const;

/**
 * The colour of a room's mass (review r4 #4: five looks in the code, two on the screen, the west darker): the body,
 * its dim roots, the lift near the playfield and its reach, the bark plates, and a wash over the crust (faces and tops)
 * so the bark takes the place's hue. An enclosed room takes its look's (`gradeLookOf`); a room open to the night keeps
 * the wood's teal-black.
 */
export interface MassTone {
  body: number;
  deep: number;
  vein: number;
  veinLit: number;
  lift: number;
  liftReach: number;
  plate: number;
  crust: number;
  crustA: number;
  /** The two sub-mass values (canopy r7, review r6 #5); absent = `MASS.subLift` of the way from the body to the lift. */
  sub?: readonly [number, number];
}

const NIGHT_TONE: MassTone = {
  body: MASS.body,
  deep: MASS.deep,
  vein: 0x0f1c28,
  veinLit: 0x26384a,
  lift: MASS.lift,
  liftReach: 300,
  plate: 0x12263a,
  crust: 0x23303c,
  crustA: 0,
  // (The night's lift is so dark that its sub-masses stayed in the body's luma bin: the hub's under-floor.)
  sub: [0x22404e, 0x2e5468],
};

/** Per look (lifted: review r4 #4 asks the heartwood rooms' mean luma for 20+, and the lift doubled). */
export const MASS_TONES: Record<Look, MassTone> = {
  heartwood: {
    body: 0x1e140e,
    deep: 0x140d09,
    vein: 0x2e1f14,
    veinLit: 0x5a3c24,
    lift: 0x4e3622,
    liftReach: 380,
    plate: 0x342216,
    crust: 0x6a4428,
    crustA: 0.34,
  },
  shaft: {
    body: 0x0e1a2a,
    deep: 0x09121e,
    vein: 0x18283c,
    veinLit: 0x34506c,
    lift: 0x284660,
    liftReach: 320,
    plate: 0x1c3046,
    crust: 0x6a88a8,
    crustA: 0.2,
  },
  nest: {
    body: 0x1a160f,
    deep: 0x100d09,
    vein: 0x282116,
    veinLit: 0x4a3e2a,
    lift: 0x4a3e26,
    liftReach: 400,
    plate: 0x2e2618,
    crust: 0x6a5a38,
    crustA: 0.3,
  },
  canopy: {
    body: 0x0a1816,
    deep: 0x06100e,
    vein: 0x122622,
    veinLit: 0x24443c,
    lift: 0x1a4a40,
    liftReach: 400,
    plate: 0x142e2a,
    crust: 0x2e5a50,
    crustA: 0.26,
  },
  // (Review r5 #7: cool umber-grey earth, not a second brown.)
  den: {
    body: 0x141313,
    deep: 0x0c0b0b,
    vein: 0x221f1e,
    veinLit: 0x3e3c3a,
    lift: 0x363634,
    liftReach: 400,
    plate: 0x252322,
    crust: 0x5e625e,
    crustA: 0.26,
  },
};

/** The mass tone of a room (see `MassTone`). */
export function massTone(room: Room): MassTone {
  const look = gradeLookOf(room);
  return look ? MASS_TONES[look] : NIGHT_TONE;
}

/** The edge painter's colours for the paint in progress (pf-edge.ts). */
function edgeTone(): EdgeTone {
  const night = T === NIGHT_TONE;
  const shaft = T === MASS_TONES.shaft;
  return {
    body: T.body,
    deep: T.deep,
    lift: T.lift,
    rim: night ? BRANCH.barkLit : T.crust,
    rimA: night ? 0.6 : Math.min(0.8, T.crustA * 2.4),
    // (Canopy r7: the walk's moss on the faces too, a step under it; tinted with the place like the walk's band.)
    moss: shaft
      ? 0
      : lerp3(BRANCH.walkDeep, T.crustA > 0 ? lerp3(BRANCH.walkMoss, T.crust, 0.35) : BRANCH.walkMoss, 0.6),
    mossLit: shaft ? 0 : T.crustA > 0 ? lerp3(BRANCH.walkLit, T.crust, 0.35) : BRANCH.walkLit,
  };
}

/** The tone of the paint in progress (set by `paintMasses` / `paintShelves`; they paint synchronously). */
let T: MassTone = NIGHT_TONE;

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
function outline(r: MassRect, s: Sides, seed: number, em?: EdgeModel): number[] {
  const pts: number[] = [];
  const st = 16;
  const fs = 8;
  const o = 3;
  const loose = r.kick === false;
  const bulge = (y: number, k: number, sd: number) =>
    lerp(MASS.bulge[0] as number, MASS.bulge[1] as number, hash1(k, sd)) +
    (loose ? MASS.looseBulge * Math.max(0, wobble(y, seed + sd, 320)) : 0);
  // (Review r5 #4: the free edges are chains of lobes, the same ones the edge painter draws on them.)
  const face = (dir: number, x: number, y: number, k: number, sd: number): number =>
    em ? em.faceAt(dir, x, y) : bulge(y, k, sd) * clamp((y - r.y) / 40, 0.2, 1);
  const under = (x: number): number => (em ? em.underAt(x, r.y + r.h) : matSag(x, seed));
  const yb = r.y + r.h;
  const R = Math.min(MASS.underRound, r.w * 0.35, r.h * 0.45);
  const brC = inSegs(yb - 2, s.right) && inSegs(r.x + r.w - 2, s.bottom);
  const blC = inSegs(yb - 2, s.left) && inSegs(r.x + 2, s.bottom);
  for (let x = r.x; x < r.x + r.w; x += st) pts.push(x, inSegs(x, s.top) ? r.y : r.y - o);
  for (let y = r.y; y < yb; y += fs) {
    if (brC && y > yb - R) break;
    const k = Math.round(y / st);
    const out = inSegs(y, s.right) ? face(1, r.x + r.w, y, k, 1) : o;
    pts.push(r.x + r.w + out, y);
  }
  // (Review r4 #3: a quarter circle at every free underside corner made the cabinets' rounded rects. The corner is a
  // knuckle: uneven radii, lumpy, a lobe pushed out where a root turns.)
  const knuckle = (a: number, sd: number): number =>
    0.82 +
    0.3 * wobble(a * 37, seed + sd, 60) +
    0.22 * Math.max(0, Math.sin((a / 8) * Math.PI)) * hash1(sd, seed);
  const Rx = R * (0.55 + 0.8 * hash1(seed, 11));
  const Ry = R * (0.55 + 0.8 * hash1(seed, 13));
  if (brC)
    for (let a = 0; a <= 8; a++) {
      const t = (a / 8) * (Math.PI / 2);
      const q = knuckle(a, 5);
      pts.push(
        r.x + r.w - R + Math.cos(t) * Rx * q + (R - Rx) * (1 - Math.sin(t)),
        yb - R + Math.sin(t) * (Ry * q + matSag(r.x + r.w - R, seed) * 0.6) + (R - Ry) * Math.cos(t) * 0,
      );
    }
  for (let x = r.x + r.w; x > r.x; x -= fs) {
    if (brC && x > r.x + r.w - R) continue;
    if (blC && x < r.x + R) break;
    // (A narrow post's foot barely sags: a root mat under 64 px turned it into a baluster's knob.)
    const sag = inSegs(x, s.bottom) ? under(x) * (r.h > 120 ? 1 : 0.4) * clamp(r.w / 260, 0.15, 1) : o;
    pts.push(x, yb + sag);
  }
  if (blC)
    for (let a = 8; a >= 0; a--) {
      const t = (a / 8) * (Math.PI / 2);
      const q = knuckle(a, 9);
      pts.push(
        r.x + R - Math.cos(t) * Rx * q - (R - Rx) * (1 - Math.sin(t)),
        yb - R + Math.sin(t) * (Ry * q + matSag(r.x + R, seed) * 0.6),
      );
    }
  for (let y = blC ? yb - R : yb; y > r.y; y -= fs) {
    const k = Math.round(y / st);
    const out = inSegs(y, s.left) ? face(-1, r.x, y, k, 3) : o;
    pts.push(r.x - out, y);
  }
  return pts;
}

/**
 * The free edges of a room's masses (review r5 #4): merged runs of face, underside and top, each face or underside a
 * chain of lobes (pf-edge.ts) that the body's outline and the edge painter share.
 */
export interface EdgeModel {
  faces: Run[];
  unders: Run[];
  tops: Run[];
  spec(run: Run, vertical: boolean): LobeSpec;
  seedOf(run: Run): number;
  faceAt(dir: number, x: number, y: number): number;
  underAt(x: number, y: number): number;
}

export function edgeModel(
  masses: readonly MassRect[],
  sides: readonly Sides[],
  seed: number,
  skip?: Set<number>,
): EdgeModel {
  const faceRuns: Run[] = [];
  const underRuns: Run[] = [];
  const topRuns: Run[] = [];
  masses.forEach((r, i) => {
    if (skip?.has(i)) return;
    const s = sides[i] as Sides;
    for (const [y0, y1] of s.right) faceRuns.push({ key: r.x + r.w, a: y0, b: y1, i, dir: 1 });
    for (const [y0, y1] of s.left) faceRuns.push({ key: r.x, a: y0, b: y1, i, dir: -1 });
    for (const [x0, x1] of s.bottom) underRuns.push({ key: r.y + r.h, a: x0, b: x1, i, dir: 0 });
    for (const [x0, x1] of s.top) topRuns.push({ key: r.y, a: x0, b: x1, i, dir: 0 });
  });
  const faces = mergeRuns(faceRuns);
  const unders = mergeRuns(underRuns);
  const tops = mergeRuns(topRuns);
  const spec = (run: Run, vertical: boolean): LobeSpec =>
    !vertical ? EDGE.under : (masses[run.i] as MassRect).kick === false ? EDGE.loose : EDGE.claw;
  const seedOf = (run: Run) => seed * 7 + Math.round(run.key) * 13 + run.dir * 101 + (run.dir === 0 ? 5 : 0);
  const find = (list: Run[], dir: number, key: number, u: number) =>
    list.find((q) => q.dir === dir && Math.abs(q.key - key) < 0.5 && u >= q.a - 0.5 && u <= q.b + 0.5);
  const at = (q: Run | undefined, vertical: boolean, u: number, dflt: number): number => {
    if (!q) return dflt;
    const sp = spec(q, vertical);
    // (A narrow post's faces lobe less: both faces lobed full read as a string of beads.)
    const m = masses[q.i] as MassRect;
    const k = vertical ? (m.w < MASS.lobeMinW ? 0.5 : clamp(m.w / 240, 0.5, 1)) : 1;
    return k * lobeOffset(sp, lobesFor(sp, seedOf(q), q.a, q.b), q.a, q.b, u);
  };
  return {
    faces,
    unders,
    tops,
    spec,
    seedOf,
    faceAt: (dir, x, y) => at(find(faces, dir, x, y), true, y, 3),
    underAt: (x, y) => at(find(unders, 0, y, x), false, x, 3),
  };
}

/** The painted silhouette of `r` among `all` (a patch's mask: it shows its lumps and rounded corners, not its rect). */
export function massOutline(
  r: MassRect,
  all: readonly MassRect[],
  W: number,
  H: number,
  seed: number,
): number[] {
  const sides = all.map((q) => exposedSides(q, all, W, H));
  const i = all.indexOf(r);
  return outline(r, sides[i] as Sides, seed, edgeModel(all, sides, seed));
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

/** The longest face down a stack of tiers (same x on one side, consecutive tiers) that takes the claws, px. */
function clawRun(ms: readonly MassRect[]): number {
  let best = 0;
  for (const side of [0, 1]) {
    let run = 0;
    let x = Number.NaN;
    for (const m of ms) {
      const mx = side ? m.x + m.w : m.x;
      if (m.kick === false) {
        run = 0;
        x = Number.NaN;
        continue;
      }
      run = Math.abs(mx - x) < 1 ? run + m.h : m.h;
      x = mx;
      best = Math.max(best, run);
    }
  }
  return best;
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
      // (Review r5 #6: a wide clump hanging from a roof is the roof's own mass, lobed with a fringe, not a prop.)
      if (!up && b.w > MASS.hangMaxW) continue;
      // (...and a short one is a lump of the roof: lobes and a fringe.)
      const spanH = chain.reduce((acc, c) => acc + (masses[c] as MassRect).h, 0);
      if (!up && spanH < MASS.hangMinH) continue;
      // (Review r5 #6: a face that takes the claws for over 400 px is a cliff, never a taper: the fork's face was
      // painted as a pleated fan the size of a cliff.)
      if (clawRun(chain.map((c) => masses[c] as MassRect)) > MASS.clawTaper) continue;
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
  /** The painted crest (pf-edge.ts `paintTopBand`): the rim and the growth follow it. */
  crest: (x: number) => number = () => y,
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
    top: crest,
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
  /** Rects that are mass for the edges (a rotten wall, baked on its own) but not painted here. */
  ghosts: readonly MassRect[] = [],
  tone: MassTone = NIGHT_TONE,
  /** The room (its props take their family from the world's spread, `propFamilies`). */
  roomId = '',
): void {
  T = tone;
  const B = BRANCH;
  const near = (x0: number, y0: number, x1: number, y1: number) =>
    !only ||
    (x1 > only.x - 200 && x0 < only.x + only.w + 200 && y1 > only.y - 200 && y0 < only.y + only.h + 200);
  const sides = masses.map((r) => exposedSides(r, [...masses, ...ghosts], W, H));
  const earth = (r: MassRect) => r.tag === 'ground';

  const tapers = findTapers(masses, sides);
  const inTaper = new Set(tapers.flatMap((t) => t.idx));

  // The merged runs of exposed edge: a face down two stacked rects is one face (no seam where they meet); each face
  // and underside a chain of lobes (review r5 #4) shared by the body's outline and the edge painter.
  const em = edgeModel(masses, sides, seed, inTaper);
  const faces = em.faces;
  const unders = em.unders;
  const tops = em.tops;

  // 1. The body (a taper's is its own silhouette, step 1b).
  masses.forEach((r, i) => {
    if (inTaper.has(i) || !near(r.x, r.y, r.x + r.w, r.y + r.h)) return;
    const s = sides[i] as Sides;
    p.solid(outline(r, s, seed + i * 7, em), earth(r) ? T.deep : T.body, B.walkH - 0.12, { bark: 0.25 });
  });

  // (Review r5 #4: the inside of a mass is the darkest plane. Its veins, plates and fissures further than
  // `EDGE.inner` from a free edge keep a third of their contrast.)
  const edgeRuns = [
    ...faces.map((f) => ({ key: f.key, a: f.a, b: f.b, vertical: true })),
    ...unders.map((f) => ({ key: f.key, a: f.a, b: f.b, vertical: false })),
    ...tops.map((f) => ({ key: f.key, a: f.a, b: f.b, vertical: false })),
  ];
  const innerK = (x: number, y: number) => (distToRuns(x, y, edgeRuns) > EDGE.inner ? EDGE.innerK : 1);

  // 1c. Sub-masses (canopy review r6 #5: "no single flat plane over 35% of a frame"; HK's Crossroads stacks its rock at
  // three depths). A big mass is broken into overlapping lobed shapes at two lifted values over the body, each with a
  // dark seam along its upper arc and a lit lip under that, painted large first: the stack reads, the edge stays the
  // brightest thing. Colour only (the bake clips it to the body).
  masses.forEach((r, i) => {
    if (inTaper.has(i) || !near(r.x, r.y, r.x + r.w, r.y + r.h) || Math.min(r.w, r.h) < 200) return;
    const rr = rngFor(seed, r.x, r.y, 67);
    const [cw, ch] = MASS.subCell as [number, number];
    const shapes: Array<[number, number, number, number, number]> = [];
    for (let gy = r.y + ch * 0.3; gy < r.y + r.h; gy += ch)
      for (let gx = r.x + range(rr, 0, cw * 0.5); gx < r.x + r.w; gx += cw * range(rr, 0.7, 1.1)) {
        const rx = range(rr, MASS.subR[0] as number, MASS.subR[1] as number);
        shapes.push([
          gx + range(rr, -cw * 0.3, cw * 0.3),
          gy + range(rr, -ch * 0.3, ch * 0.3),
          rx,
          rx * range(rr, 0.45, 0.8),
          rr() < 0.55 ? 0 : 1,
        ]);
      }
    shapes.sort((a, b) => b[2] - a[2]);
    for (const [k, [cx, cy, rx, ry, tier]] of shapes.entries()) {
      const sd = seed + i * 101 + k * 7;
      const shape = chaikin(blob(cx, cy, rx, ry, sd, 0.35, 16, range(rr, -0.3, 0.3)), 2);
      const col = T.sub ? (T.sub[tier] as number) : lerp3(T.body, T.lift, MASS.subLift[tier] as number);
      p.tint(shape, col, range(rr, 0.85, 1));
      // The seam over its upper arc and the lip under it (only the upper arc: a full ring read as a coin).
      const n = shape.length / 2;
      const arcPts: number[] = [];
      for (let q = 0; q < n; q++) {
        const y = shape[q * 2 + 1] as number;
        if (y < cy - ry * 0.25) arcPts.push(shape[q * 2] as number, y);
      }
      if (arcPts.length >= 8) {
        // (Blob points run round the circle: the upper ones are contiguous but may wrap; sort by x.)
        const pts: Array<[number, number]> = [];
        for (let q = 0; q < arcPts.length; q += 2) pts.push([arcPts[q] as number, arcPts[q + 1] as number]);
        pts.sort((a, b) => a[0] - b[0]);
        const line = pts.flat();
        p.tint(strand(line, range(rr, 6, 12), 0.3), T.deep, 0.85);
        p.tint(
          strand(
            line.map((v, j) => (j % 2 ? v + 8 : v)),
            range(rr, 4, 8),
            0.35,
          ),
          T.veinLit,
          range(rr, 0.3, 0.5),
        );
      }
    }
  });

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
      const kv = innerK((xa + xb) / 2, (ya + yb) / 2);
      p.solid(
        ribbon(wl, (t) => wd * (0.35 + Math.sin(t * Math.PI) * 0.65)),
        T.vein,
        B.walkH - 0.06,
        { bark: 0.5, alpha: 0.8 * kv },
        kv,
      );
      p.tint(
        strand(
          wl.map((v, j) => (j % 2 ? v - wd * 0.28 : v)),
          wd * 0.22,
        ),
        T.veinLit,
        0.4 * kv,
      );
    }
    for (let k = 0; k < Math.round(area / 400000); k++) {
      const cx = r.x + range(rr, 40, Math.max(41, r.w - 40));
      const cy = r.y + range(rr, 40, Math.max(41, r.h - 40));
      if (innerK(cx, cy) < 1) continue;
      knot(p, cx, cy, range(rr, 8, 16), range(rr, -0.6, 0.6), B.walkH - 0.08, seed + k * 13 + i);
    }
    // A big mass is wood, not a plane (review r4 #3, #5: the well's walls, the way out's blocks, the hub's high block
    // read as black cabinets): great bark plates across it and the grain's long fissures, each with a lit lip.
    if (!earth(r) && Math.min(r.w, r.h) >= 260) {
      const vert = r.h >= r.w * 0.8;
      for (let k = 0; k < Math.round(area / 110000); k++) {
        const cx = r.x + range(rr, 0.1, 0.9) * r.w;
        const cy = r.y + range(rr, 0.1, 0.9) * r.h;
        const l = range(rr, 200, 520);
        const d = range(rr, 70, 170);
        const shape = vert
          ? chaikin(blob(cx, cy, d / 2, l / 2, seed + k * 41 + i, 0.3, 16), 2)
          : chaikin(blob(cx, cy, l / 2, d / 2, seed + k * 41 + i, 0.3, 16), 2);
        const kp = innerK(cx, cy);
        p.solid(
          shape,
          rr() < 0.5 ? T.plate : T.vein,
          B.walkH - 0.07,
          { bark: 0.7, alpha: 0.6 * kp },
          range(rr, 0.35, 0.7) * kp,
        );
      }
      for (let k = 0; k < Math.round(area / 90000); k++) {
        const xa = r.x + range(rr, 0.05, 0.95) * r.w;
        const ya = r.y + range(rr, 0.05, 0.95) * r.h;
        const len = range(rr, 260, 1000);
        const ang = (vert ? Math.PI / 2 : 0) + range(rr, -0.3, 0.3);
        const line: number[] = [];
        for (let t = 0; t <= 10; t++)
          line.push(
            clamp(xa + Math.cos(ang) * len * (t / 10 - 0.5), r.x + 20, r.x + r.w - 20),
            clamp(ya + Math.sin(ang) * len * (t / 10 - 0.5), r.y + 20, r.y + r.h - 20),
          );
        const wl = wander(line, 14, seed + k * 53 + i, 160);
        const wd = range(rr, 4, 11);
        const kf = innerK(xa, ya);
        p.solid(strand(wl, wd, 0.3), T.deep, B.walkH - 0.09, { bark: 0.2, alpha: kf }, 0.8 * kf);
        p.tint(
          strand(
            wl.map((v, j) => (j % 2 ? v : v + wd * 0.7)),
            wd * 0.35,
            0.3,
          ),
          T.veinLit,
          0.6 * kf,
        );
      }
    }
  });

  // 2a. (Canopy r7, review r6: the insides were the largest flat planes on screen; HK draws its rock as big shapes.) Deep
  // in a big mass, a few great knuckles of wood or earth: each only its upper arc, a dark seam over a faint lit lip,
  // broken where the arc turns (a closed ring read as a coin). The inside stays the darkest plane.
  masses.forEach((r, i) => {
    if (inTaper.has(i) || !near(r.x, r.y, r.x + r.w, r.y + r.h) || Math.min(r.w, r.h) < 360) return;
    const rr = rngFor(seed, r.x, r.y, 61);
    const n = Math.round((r.w * r.h) / (MASS.knuckleArea as number));
    for (let k = 0; k < n; k++) {
      const rx = range(rr, MASS.knuckleR[0] as number, MASS.knuckleR[1] as number);
      const ry = rx * range(rr, 0.45, 0.75);
      const cx = r.x + range(rr, 0.15, 0.85) * r.w;
      const cy = r.y + range(rr, 0.2, 0.9) * r.h;
      if (innerK(cx, cy) === 1 || innerK(cx - rx, cy) === 1 || innerK(cx + rx, cy) === 1) continue;
      const tilt = range(rr, -0.25, 0.25);
      const a0 = Math.PI * range(rr, 1.05, 1.25);
      const a1 = Math.PI * range(rr, 1.75, 1.95);
      const line: number[] = [];
      for (let q = 0; q <= 16; q++) {
        const a = lerp(a0, a1, q / 16);
        const wob = 1 + 0.08 * wobble(q * 20, seed + k + i, 30);
        const x = Math.cos(a) * rx * wob;
        const y = Math.sin(a) * ry * wob;
        line.push(cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt));
      }
      // Its body a breath lighter under the arc (a shape, not only a line), the seam, the lit lip under it.
      const body: number[] = [];
      for (let q = 0; q <= 16; q++) body.push(line[q * 2] as number, (line[q * 2 + 1] as number) + 8);
      for (let q = 16; q >= 0; q--)
        body.push(
          line[q * 2] as number,
          (line[q * 2 + 1] as number) + ry * range(rr, 0.5, 0.9) * Math.sin((q / 16) * Math.PI) + 8,
        );
      p.tint(chaikin(body, 2), T.lift, range(rr, 0.1, 0.18));
      p.tint(strand(line, range(rr, 5, 9), 0.35), T.deep, 0.9);
      p.tint(
        strand(
          line.map((v, j) => (j % 2 ? v + 6 : v)),
          range(rr, 4, 8),
          0.4,
        ),
        T.veinLit,
        range(rr, 0.4, 0.6),
      );
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
      const d = T.liftReach * ((k + 1) / 5);
      const pts: number[] = [];
      const edge: number[] = [];
      for (let u = run.a; u <= run.b + 0.01; u += 24) {
        // (Its inner edge wanders by a third of the reach and it tapers off at the run's ends: at 400 px a band of
        // even depth ending square read as a lighter box in the mass.)
        const R = T.liftReach;
        const wob =
          R * (0.13 * wobble(u, seed + k * 3 + run.key, 160) + 0.22 * wobble(u, seed + run.key + 11, 520));
        const endK = clamp(Math.min(u - run.a, run.b - u) / Math.min(R, len * 0.5), 0.12, 1) ** 0.6;
        const dd = clamp((d + wob) * endK, 8, R + 30);
        if (side === 'top') {
          edge.push(u, run.key + 2);
          pts.push(u, run.key + dd);
        } else {
          edge.push(run.key + into * 2, u);
          pts.push(run.key + into * dd, u);
        }
      }
      for (let j = pts.length / 2 - 1; j >= 0; j--) edge.push(pts[j * 2] as number, pts[j * 2 + 1] as number);
      p.tint(edge, T.lift, 0.28);
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
        p.solid(shape, T.plate, B.walkH - 0.08 + range(rr, 0, 0.05), { bark: 0.7, alpha: 0.7 }, 0.75);
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
    const y0 = Math.min(...ms.map((m) => m.y));
    const fam = propFamilies().get(propKey(roomId, t.up, b0.x, y0)) ?? (t.up ? 'stump' : 'talon');
    paintTaper(p, plan, masses, sides, t, seed + b0.x * 3 + b0.y, fam);
  }

  // 3a. A narrow post (a root column) keeps a column of bark down each face: lobes on both faces of a post read as a
  // string of beads.
  for (const f of faces) {
    const r = masses[f.i] as MassRect;
    if (r.w >= MASS.lobeMinW) continue;
    const i = f.i;
    const dir = f.dir;
    const x = f.key;
    const y0 = f.a;
    const y1 = f.b;
    if (!near(x - 200, y0, x + 200, y1)) continue;
    const rr = rngFor(seed, x, y0, 5);
    const th = Math.min(range(rr, MASS.sideTh[0] as number, MASS.sideTh[1] as number), r.w * 0.6);
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
        // (By length, not lobes per face: three lobes down a short post turned it into a baluster.)
        (t) => th * (0.86 + 0.14 * wobble(t * Math.abs(yb - ya), seed + i, 260)),
        B.walkH,
        seed + i * 3 + y0,
        0,
        0.8,
      );
      paintLimb(p, L, knotsFor(L, seed + y0, 520));
      // (The place's hue in the bark.)
      if (T.crustA > 0)
        p.tint(
          ribbon(line, () => th + 8),
          T.crust,
          T.crustA,
        );
      // (A face is not a walk: it sinks a step under the tops, the brightest wood she stands on.)
      p.tint(
        ribbon(line, () => th + 4),
        T.body,
        0.3,
      );
      fadeInto(p, line, () => th * 1.05, -dir, 0, T.body);
      roots(p, line, -dir, th, seed + i * 7 + y0, 'side');
    }
  }

  // 3. Sides (review r5 #4: a column of bark down a face read as a plank on a ruled edge): a chain of lobes down every
  // free face, each a knob outlined by a seam with a lit crescent on its arc, moss on a face's upper arcs.
  const et0 = edgeTone();
  for (const f of faces) {
    const r = masses[f.i] as MassRect;
    if (r.w < MASS.lobeMinW || !near(f.key - 200, f.a, f.key + 200, f.b)) continue;
    const et = earth(r)
      ? { ...et0, body: MASS.soil, deep: T.deep, lift: MASS.soilLit, rim: MASS.soilLit, moss: 0 }
      : et0;
    paintFaceLobes(p, em.spec(f, true), em.seedOf(f), f, et, B.walkH, r.w * 0.3, clamp(r.w / 240, 0.5, 1));
    if (earth(r)) stones(p, f.dir > 0 ? f.key - 60 : f.key, f.a, 60, f.b - f.a, seed + f.i);
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
    // (Review r5 #4: lobes hanging off the underside, a fringe of moss drips and roots under them.)
    const et = earth(r) ? { ...et0, body: MASS.soil, lift: MASS.soilLit, rim: MASS.soilLit, moss: 0 } : et0;
    paintUnderLobes(p, em.spec(u, false), em.seedOf(u), u, et, B.walkH);
    rootMat(p, x0, x1, y, seed + i * 5 + x0, earth(r));
    paintFringe(p, em.spec(u, false), em.seedOf(u), u, B.walkH, earth(r), T === MASS_TONES.shaft);
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
    // (Review r5 #4: the great root under a top read as a plank on a ruled line: half as thick now, under the band.)
    const limbK = earth(r) ? 1 : 0.5;
    for (let x = xa; x <= xb + 0.01; x += 12) {
      const w = thAt(x) * limbK;
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
      if (T.crustA > 0)
        p.tint(
          ribbon(line, (t) => (ws[Math.min(ws.length - 1, Math.round(t * (ws.length - 1)))] as number) + 6),
          T.crust,
          T.crustA,
        );
      fadeInto(p, line, (k) => (ws[Math.min(ws.length - 1, k)] as number) * 1.04, 0, 1, T.body);
    }
    // (Canopy r7: the blanket under the band, so the band's crest domes are the walk's silhouette.)
    mossBlanket(
      p,
      x0 - (wallW ? 6 : 0),
      x1 + (wallE ? 6 : 0),
      () => y,
      seed + i * 17 + x0,
      freeW ? 22 : 0,
      freeE ? 22 : 0,
    );
    // (Review r5 #4: a thick lit moss band on every walk, its lower edge draping in lobes.)
    const crest = paintTopBand(
      p,
      x0 - (wallW ? 6 : 0),
      x1 + (wallE ? 6 : 0),
      y,
      seed + i * 19 + x0,
      B.walkH,
      freeW ? 30 : 0,
      freeE ? 30 : 0,
      earth(r) ? { color: MASS.soilLit, k: 0.6 } : T.crustA > 0 ? { color: T.crust, k: 0.35 } : null,
    );
    plan?.stretches.push(topStretch(`mass-${i}-${x0}`, x0, x1, y, th, wallW, wallE, crest));
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
    // (Review r4 #3: a strand every 12 px, fanned evenly from above, read as organ pipes. A few uneven strands
    // twisting round each other, spreading unevenly up into the roof, tips at very different heights.)
    const n = clamp(Math.round(r.w / 40) + 2 + Math.floor(rr() * 3), 4, 9);
    const foot = r.y + r.h;
    for (let k = 0; k < n; k++) {
      const u = range(rr, 0.05, 0.95);
      const xTop = r.x + r.w / 2 + (u - 0.5) * r.w * range(rr, 1.2, 3);
      const xMid = r.x + r.w / 2 + (u - 0.5) * r.w * 0.8;
      const tipLen = range(rr, 20, 380) * (0.4 + rr());
      const xTip = r.x + r.w / 2 + (u - 0.5) * r.w * range(rr, 0.6, 1.6) + range(rr, -40, 40);
      const twist = range(rr, -0.3, 0.3) * r.w;
      const line = chaikinLine([
        xTop,
        -60,
        xMid + twist,
        foot * 0.35,
        xMid - twist + range(rr, -10, 10),
        foot * 0.8,
        xTip,
        foot + tipLen,
      ]);
      const w0 = range(rr, 10, Math.max(14, r.w * 0.38));
      paintLimb(
        p,
        lineLimb(
          line,
          (t) => Math.max(2, w0 * (1 - t * 0.85) * (0.85 + 0.3 * wobble(t * 700, seed + k, 90))),
          B.walkH - 0.01 + (k % 2) * 0.02,
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
  // The break: broad blunt slabs of snapped wood standing off the edge, leaning out, their torn tips pale (thin
  // spikes read as thorns); a cushion of moss in front of them.
  let xx = x - dir * range(r, 70, 170);
  let k = 0;
  // (Review r4 #3: a row of even slabs along the edge read as a cornice of pipes: few, uneven, gaps between.)
  while (dir > 0 ? xx < x - 10 : xx > x + 10) {
    const w = range(r, 14, 52);
    const u = 1 - Math.abs(x - xx) / 150;
    const hi = range(r, 8, 16) + 22 * u * u * (k % 2 ? 0.5 : 1);
    const lean = dir * hi * range(r, 0.15, 0.4);
    const x0 = xx;
    const x1 = xx + dir * w;
    // (Torn, not cut: the top is a ragged run of fibres, the pale only a thin line along the tear.)
    const tear: number[] = [];
    for (let q = 0; q <= 5; q++) {
      const v = q / 5;
      const tx = lerp(x0, x1, v) + lean * (0.6 + 0.4 * v);
      tear.push(tx, y - hi * (0.55 + 0.45 * Math.sin(v * Math.PI)) + (q % 2 ? range(r, 4, 12) : 0));
    }
    p.solid([x0, y + 16, ...tear, x1, y + 16], B.bark, B.walkH - 0.03, { bark: 1 });
    p.tint(strand(tear, 2.2, 0.2), B.barkLit, 0.45);
    xx = x1 + dir * range(r, 6, 46);
    k++;
  }
  p.solid(chaikin(blob(x - dir * 40, y - 2, 60, 12, seed + 3, 0.35, 14), 2), B.mossDark, B.walkH + 0.22, {
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
      B.moss,
      B.walkH + 0.2,
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
  p.solid(fill, T.body, BRANCH.walkH - 0.1, { bark: 0.3 });
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
      T.body,
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
 * A taper painted as one shape (review r3 #3), each its own (review r4 #3: the same pleated cone in seven rooms, the
 * same hemmed curtain in five).
 * - A burl (`up`): a swelling root flare from the floor to its top, by seed: its foot slid aside (a lean, the top kept
 *   on the collision), one flank running long into the floor, its roots at uneven spacing, two or three splitting off
 *   the body and running out across the floor, and a broken top (splinters, not a cap). Its tiers' tops keep a little
 *   moss and their stretches.
 * - A hanging clump (`down`): 3-7 root strands of uneven weight twisting round each other over a dark core, no hem:
 *   the core ends in ragged points and the strands run out past it to tips at very different heights.
 */
function paintTaper(
  p: Paint,
  plan: BranchPlan | null,
  masses: readonly MassRect[],
  sides: readonly Sides[],
  t: Taper,
  seed: number,
  family = 'stump',
): void {
  const B = BRANCH;
  const r = rngFor(seed, 229);
  const ms = t.idx.map((i) => masses[i] as MassRect);
  const base = ms[0] as MassRect;
  const tip = ms[ms.length - 1] as MassRect;
  const up = t.up;
  const yFar = up ? base.y + base.h : base.y;
  const yTip = up ? tip.y : tip.y + tip.h;
  const span = Math.abs(yFar - yTip) || 1;
  // The burl's foot slides aside (lean), the tip stays on the collision; each flank flares its own amount.
  const lean = up ? range(r, -0.08, 0.08) * span : 0;
  const shift = (y: number) => (up ? lean * clamp((y - yTip) / span, 0, 1) ** 1.4 : 0);
  const flW = clamp(base.w * 0.14, 28, 70) * range(r, 0.5, 1.9);
  const flE = clamp(base.w * 0.14, 28, 70) * range(r, 0.5, 1.9);
  const profile = (side: -1 | 1): number[] => {
    const fl = side < 0 ? flW : flE;
    const ex = (m: MassRect) => (side < 0 ? m.x : m.x + m.w);
    const pts: number[] = [
      ex(base) + side * fl + shift(yFar),
      yFar + (up ? 6 : -6),
      ex(base) + side * fl * 0.3 + shift(yFar - 24),
      yFar + (up ? -24 : 24),
    ];
    ms.forEach((m, k) => {
      const near = up ? m.y + m.h : m.y;
      const farY = up ? m.y : m.y + m.h;
      if (k > 0) pts.push(ex(m) + shift(near), near);
      pts.push(ex(m) + shift(farY), farY);
    });
    return pts;
  };
  if (!up) {
    hangClump(p, plan, masses, sides, t, seed, family);
    return;
  }
  if (family === 'knee' || family === 'fungus' || family === 'fallen') {
    burlShape(p, plan, masses, sides, t, seed, family);
    return;
  }
  const L = profile(-1);
  const R = profile(1);
  const poly: number[] = [...L];
  for (let k = R.length / 2 - 1; k >= 0; k--) poly.push(R[k * 2] as number, R[k * 2 + 1] as number);
  poly.push(base.x + base.w + flE + shift(yFar), yFar + 30, base.x - flW + shift(yFar), yFar + 30);
  const body = chaikin(poly, 3);
  p.solid(body, T.body, B.walkH - 0.1, { bark: 0.3 });
  p.tint(body, T.lift, 0.35);
  // Burl knobs swelling out of a flank (never both sides alike).
  for (let k = 0; k < 1 + Math.floor(r() * 3); k++) {
    const side = r() < 0.5 ? -1 : 1;
    const y = lerp(yFar - 30, yTip + 40, range(r, 0.15, 0.7));
    const m = ms.find((mm) => y >= mm.y && y <= mm.y + mm.h) ?? base;
    const x = (side < 0 ? m.x : m.x + m.w) + shift(y);
    const rad = range(r, 16, 30);
    const knob = chaikin(
      blob(x + side * rad * 0.2, y, rad, rad * range(r, 0.7, 1.2), seed + k * 29, 0.3, 14),
      2,
    );
    p.solid(knob, T.body, B.walkH - 0.05, { bark: 0.6 });
    p.tint(knob, T.lift, 0.4);
    knot(p, x + side * rad * 0.15, y, rad * 0.4, range(r, -0.6, 0.6), B.walkH, seed + k * 31);
  }
  // The roots up its flanks, at uneven spacing (40-140 px), each its own weight.
  const us: number[] = [];
  const gapK = family === 'split' ? 1.8 : 1;
  for (let x = range(r, 0, 30); x <= base.w; x += range(r, 40, 140) * gapK) us.push(x / base.w);
  if (us.length < 3) us.splice(0, us.length, 0.1, 0.5, 0.9);
  const order = us
    .map((u, k) => ({ u, k }))
    .sort((a, c) => Math.abs(a.u - 0.5) - Math.abs(c.u - 0.5))
    .map((o) => o.u);
  for (const u of order) {
    const pts: Array<[number, number]> = [];
    // (Each root wraps the body on its way up: its lane at the top is not its lane at the foot, so the roots cross
    // and the flanks never read as even flutes.)
    const uTop = clamp(u + range(r, -0.4, 0.4), 0.02, 0.98);
    ms.forEach((m, mi) => {
      const y = m.y + m.h * range(r, 0.45, 0.8);
      const uu = lerp(u, uTop, (mi + 0.5) / ms.length);
      pts.push([lerp(m.x + 16, m.x + m.w - 16, uu) + range(r, -10, 10) + shift(y), y]);
    });
    pts.push([lerp(tip.x + 18, tip.x + tip.w - 18, uTop) + range(r, -6, 6), yTip + 20]);
    const reach = u < 0.5 ? flW : flE;
    pts.unshift([lerp(base.x - reach * 1.3, base.x + base.w + reach * 1.3, u) + shift(yFar), yFar - 4]);
    pts.unshift([
      lerp(base.x - reach * 2.4, base.x + base.w + reach * 2.4, u) + range(r, -30, 30) + shift(yFar),
      yFar + 10,
    ]);
    pts.reverse();
    const c = chaikinLine(pts.flat());
    const outer = Math.abs(u - 0.5) * 2;
    const w0 = (base.w / us.length) * range(r, 0.6, 1.5) * (0.8 + 0.4 * outer);
    const width = (tt: number) =>
      Math.max(4, w0 * (0.55 + 0.45 * tt) * (tt > 0.85 ? (1 - tt) / 0.15 + 0.2 : 1));
    paintLimb(
      p,
      lineLimb(c, width, B.walkH + (outer > 0.8 ? 0.02 : -0.02), seed + Math.round(u * 997), 0.15, 0.7),
    );
  }
  // Two or three roots splitting off the body low on a flank and running out across the floor.
  const nSplit = 2 + (r() < 0.5 ? 1 : 0);
  for (let k = 0; k < nSplit; k++) {
    const side = k === 0 ? (flW > flE ? -1 : 1) : r() < 0.5 ? -1 : 1;
    const y0 = yFar - range(r, 0.15, 0.5) * Math.min(span, 260);
    const x0 = (side < 0 ? base.x + 10 : base.x + base.w - 10) + shift(y0);
    const out = range(r, 120, 320);
    const line = chaikinLine([
      x0,
      y0,
      x0 + side * out * 0.35,
      y0 + (yFar - y0) * 0.6,
      x0 + side * out * 0.7,
      yFar - 2,
      x0 + side * out,
      yFar + 6,
    ]);
    const w0 = range(r, 16, 30);
    paintLimb(
      p,
      lineLimb(line, (tt) => Math.max(3, w0 * (1 - tt) ** 0.8), B.walkH + 0.01, seed + 31 * k, 0.2, 0.6),
    );
  }
  // A split stump: two crowns standing off the tip's ends, leaning apart, the split running down between them.
  if (family === 'split') {
    const tx = tip.x + shift(yTip);
    for (const side of [-1, 1]) {
      const w = clamp(tip.w * range(r, 0.22, 0.34), 26, 90);
      const x = side < 0 ? tx - 6 : tx + tip.w - w + 6;
      const hi = range(r, 50, 110);
      const lean = side * range(r, 8, 30);
      const crown = chaikin(
        [
          x,
          yTip + 26,
          x + lean * 0.3,
          yTip - hi * 0.6,
          x + w * 0.3 + lean,
          yTip - hi,
          x + w * 0.62 + lean * 0.8,
          yTip - hi * 0.72,
          x + w * 0.8 + lean * 0.5,
          yTip - hi * 0.85,
          x + w + lean * 0.2,
          yTip - hi * 0.4,
          x + w,
          yTip + 26,
        ],
        1,
      );
      p.solid(crown, T.body, B.walkH - 0.04, { bark: 0.8 });
      p.tint(crown, T.lift, 0.4);
      p.tint(
        strand([x + w * 0.3 + lean, yTip - hi, x + w * 0.62 + lean * 0.8, yTip - hi * 0.72], 3, 0.2),
        B.barkLit,
        0.5,
      );
    }
    const cx = tx + tip.w * range(r, 0.4, 0.6);
    const vw = tip.w * range(r, 0.12, 0.2);
    const vy = lerp(yTip, yFar, range(r, 0.35, 0.55));
    p.solid(
      chaikin(
        [
          cx - vw,
          yTip - 4,
          cx - vw * 0.3,
          lerp(yTip, vy, 0.5),
          cx + range(r, -8, 8),
          vy,
          cx + vw * 0.35,
          lerp(yTip, vy, 0.45),
          cx + vw,
          yTip - 4,
        ],
        1,
      ),
      T.deep,
      B.walkH - 0.02,
      { bark: 0.1 },
    );
  }
  // The top: broken off (a few splinters and a torn rim), never a round cap.
  const tx0 = tip.x + shift(yTip);
  const nSp = family === 'split' ? 0 : 2 + Math.floor(r() * 3);
  for (let k = 0; k < nSp; k++) {
    const w = range(r, 10, 26);
    const x = tx0 + range(r, 0.05, 0.95) * Math.max(10, tip.w - w);
    const hi = range(r, 10, 34);
    const lean2 = range(r, -0.5, 0.5) * hi;
    p.solid(
      [
        x,
        yTip + 10,
        x + lean2 * 0.6,
        yTip - hi * 0.7,
        x + w * 0.4 + lean2,
        yTip - hi,
        x + w,
        yTip - hi * 0.5,
        x + w,
        yTip + 10,
      ],
      B.bark,
      B.walkH - 0.03,
      { bark: 1 },
    );
    p.tint(
      strand([x + lean2 * 0.6, yTip - hi * 0.7, x + w * 0.4 + lean2, yTip - hi], 2, 0.2),
      B.barkLit,
      0.45,
    );
  }
  // The tops she stands on: the tip's moss in full, a few tufts on each tier; all join the stretches (rim, growth).
  t.idx.forEach((i) => {
    const m = masses[i] as MassRect;
    const sd = sides[i] as Sides;
    for (const [x0, x1] of sd.top) {
      const full = m === tip;
      mossBlanket(p, x0, x1, () => m.y, seed + x0, full ? 22 : 10, full ? 22 : 10);
      plan?.stretches.push(topStretch(`taper-${i}-${x0}`, x0, x1, m.y, 60, false, false));
    }
  });
}

/** A hanging taper as a clump of strands over a dark ragged core (see `paintTaper`). */
function hangClump(
  p: Paint,
  plan: BranchPlan | null,
  masses: readonly MassRect[],
  sides: readonly Sides[],
  t: Taper,
  seed: number,
  family = 'talon',
): void {
  const B = BRANCH;
  const r = rngFor(seed, 239);
  const ms = t.idx.map((i) => masses[i] as MassRect);
  const base = ms[0] as MassRect;
  const tip = ms[ms.length - 1] as MassRect;
  const yRoof = base.y;
  const yEnd = tip.y + tip.h;
  // The core: the tiers' outline, its bottom torn into points (no hem), a little in from the collision's sides.
  const core: number[] = [base.x - 10, yRoof - 20];
  for (const m of ms) core.push(m.x - 3, m.y + 6, m.x - 3, m.y + m.h - 4);
  const nPts = 3 + Math.floor(r() * 3);
  for (let k = 0; k <= nPts * 2; k++) {
    const u = k / (nPts * 2);
    const x = lerp(tip.x, tip.x + tip.w, u);
    core.push(x, yEnd + (k % 2 ? range(r, 20, 90) : range(r, -14, 6)));
  }
  for (let k = ms.length - 1; k >= 0; k--) {
    const m = ms[k] as MassRect;
    core.push(m.x + m.w + 3, m.y + m.h - 4, m.x + m.w + 3, m.y + 6);
  }
  core.push(base.x + base.w + 10, yRoof - 20);
  p.solid(chaikin(core, 2), T.body, B.walkH - 0.1, { bark: 0.3 });
  if (family !== 'talon') {
    hangFamily(p, ms, yRoof, yEnd, seed, family);
    hangTops(p, plan, masses, sides, t, seed);
    return;
  }
  // 3-7 strands, the widest at most 40% of the clump, twisting across each other, tips at very different heights.
  const n = clamp(Math.round(base.w / 70) + Math.floor(r() * 3), 3, 7);
  const lanes: number[] = [];
  for (let k = 0; k < n; k++) lanes.push(range(r, 0.05, 0.95));
  lanes.sort((a, c) => a - c);
  for (let k = 0; k < n; k++) {
    const u = lanes[k] as number;
    const w0 = Math.min(base.w * 0.4, range(r, 0.12, 0.38) * base.w) * (k % 3 === 1 ? 1 : range(r, 0.5, 0.9));
    const twist = range(r, 0.6, 1.8);
    const amp = range(r, 0.08, 0.22) * base.w;
    const ph = range(r, 0, 6.28);
    const tipY = yEnd + range(r, -40, 220) * (0.5 + r());
    const raw: number[] = [];
    for (let q = 0; q <= 14; q++) {
      const v = q / 14;
      const y = lerp(yRoof - 40, tipY, v);
      // Kept within the tier it passes (its collision), loose only below the core.
      const m = ms.find((mm) => y >= mm.y && y <= mm.y + mm.h) ?? tip;
      let x = lerp(m.x + 10, m.x + m.w - 10, u) + Math.sin(v * Math.PI * twist + ph) * amp * (0.4 + v);
      if (y <= yEnd) x = clamp(x, m.x + w0 * 0.3, m.x + m.w - w0 * 0.3);
      raw.push(x, y);
    }
    const line = wander(raw, 8, seed + k * 19, 90);
    paintLimb(
      p,
      lineLimb(
        line,
        (tt) => Math.max(1.5, w0 * (1 - tt ** 1.6) * (0.85 + 0.25 * wobble(tt * 900, seed + k, 120))),
        B.walkH + (k % 2 ? 0.02 : -0.02),
        seed + k * 17,
        0.1,
        0.6,
      ),
    );
  }
  hangTops(p, plan, masses, sides, t, seed);
}

/** A hanging taper's tops (moss, stretches) and undersides (the growth's beards). */
function hangTops(
  p: Paint,
  plan: BranchPlan | null,
  masses: readonly MassRect[],
  sides: readonly Sides[],
  t: Taper,
  seed: number,
): void {
  t.idx.forEach((i) => {
    const m = masses[i] as MassRect;
    const sd = sides[i] as Sides;
    for (const [x0, x1] of sd.top) {
      mossBlanket(p, x0, x1, () => m.y, seed + x0, 10, 10);
      plan?.stretches.push(topStretch(`taper-${i}-${x0}`, x0, x1, m.y, 60, false, false));
    }
    for (const [x0, x1] of sd.bottom)
      plan?.hangs.push({ x0: x0 + 10, x1: x1 - 10, y: () => m.y + m.h + 4, deep: false, reach: 120 });
  });
}

/**
 * The other hanging families (review r5 #6: the same talon in five rooms):
 * - `beard`: a moss beard, many fine wavy strands, pale at the tips, longest in the middle;
 * - `curtain`: a root curtain, thin roots of very uneven length with gaps between them;
 * - `pod`: a short core with a seed pod hanging on a stalk from its tip, ribbed, lit on one side.
 */
function hangFamily(
  p: Paint,
  ms: readonly MassRect[],
  yRoof: number,
  yEnd: number,
  seed: number,
  family: string,
): void {
  const B = BRANCH;
  const r = rngFor(seed, 241);
  const base = ms[0] as MassRect;
  const tip = ms[ms.length - 1] as MassRect;
  const span = yEnd - yRoof;
  if (family === 'beard') {
    const n = clamp(Math.round(tip.w / 9), 10, 30);
    for (let k = 0; k < n; k++) {
      const u = range(r, 0.02, 0.98);
      const x = lerp(tip.x, tip.x + tip.w, u);
      const mid = 1 - Math.abs(u - 0.5) * 1.4;
      const len = (40 + span * 0.5 * mid + range(r, 0, 120)) * range(r, 0.5, 1.2);
      const y0 = yEnd - range(r, 10, 40);
      const raw: number[] = [];
      for (let q = 0; q <= 10; q++) {
        const v = q / 10;
        raw.push(x + Math.sin(v * 6 + k) * 6 * v + range(r, -2, 2), y0 + v * len);
      }
      const w0 = range(r, 3, 8);
      p.solid(strand(raw, w0, 0.5), B.mossDark, B.walkH, { moss: 0.7 });
      p.tint(
        strand(raw.slice(Math.round(raw.length * 0.55) & ~1), w0 * 0.8, 0.5),
        B.lichen[k % 3] as number,
        0.55,
      );
    }
    return;
  }
  if (family === 'curtain') {
    let x = base.x - range(r, 0, 20);
    while (x < base.x + base.w + 20) {
      // (Gaps: now and then the curtain parts.)
      if (r() < 0.18) {
        x += range(r, 24, 60);
        continue;
      }
      const ms0 = ms.find((m) => x >= m.x && x <= m.x + m.w) ?? tip;
      const len = ms0.y + ms0.h - yRoof + range(r, 20, 220) * r();
      const line = chaikinLine([
        x,
        yRoof - 30,
        x + range(r, -10, 10),
        yRoof + len * 0.5,
        x + range(r, -18, 18),
        yRoof + len,
      ]);
      const w0 = range(r, 6, 16);
      paintLimb(
        p,
        lineLimb(
          line,
          (tt) => Math.max(1.5, w0 * (1 - tt ** 2 * 0.8)),
          B.walkH + (r() < 0.5 ? 0.02 : -0.02),
          seed + Math.round(x),
          0.1,
          0.5,
        ),
      );
      x += range(r, 8, 22);
    }
    return;
  }
  // A seed pod on a stalk from the core's tip.
  const cx = tip.x + tip.w * range(r, 0.35, 0.65);
  const stalk = range(r, 24, 70);
  const pw = clamp(tip.w * range(r, 0.5, 0.8), 40, 90);
  const ph = pw * range(r, 1.4, 1.9);
  const top = yEnd + stalk;
  paintLimb(
    p,
    lineLimb(
      [cx, yEnd - 20, cx + range(r, -6, 6), yEnd + stalk * 0.5, cx, top + 8],
      () => range(r, 7, 11),
      B.walkH,
      seed + 3,
      0.2,
      0.5,
    ),
  );
  const pod: number[] = [];
  for (let q = 0; q <= 24; q++) {
    const a = (q / 24) * Math.PI * 2;
    const yy = Math.cos(a) * -0.5 + 0.5;
    const hw = (pw / 2) * Math.sin(Math.PI * yy) ** 0.8 * (1 - 0.25 * yy);
    pod.push(cx + Math.sin(a) * hw * (Math.sin(a) > 0 ? 1 : 1) * 1, top + yy * ph);
  }
  p.solid(chaikin(pod, 1), lerp3(T.body, T.plate, 0.6), B.walkH + 0.02, { bark: 0.6 });
  // Ribs down it and a lit side.
  for (let k = -2; k <= 2; k++) {
    const line: number[] = [];
    for (let q = 1; q < 10; q++) {
      const yy = q / 10;
      const hw = (pw / 2) * Math.sin(Math.PI * yy) ** 0.8 * (1 - 0.25 * yy);
      line.push(cx + (k / 3) * hw, top + yy * ph);
    }
    p.tint(strand(line, 2.5, 0.3), T.deep, 0.6);
  }
  const lit: number[] = [];
  for (let q = 1; q < 9; q++) {
    const yy = q / 10;
    const hw = (pw / 2) * Math.sin(Math.PI * yy) ** 0.8 * (1 - 0.25 * yy);
    lit.push(cx + hw * 0.78, top + yy * ph);
  }
  p.tint(strand(lit, 5, 0.4), B.barkLit, 0.5);
}

/**
 * The other standing families (review r5 #6: the same leaning stump-cone in seven rooms):
 * - `knee`: a root arching out of the floor, over the tiers and back into the floor: one thick bow, its bark
 *   running along it, a shadowed hollow at its foot;
 * - `fungus`: a rounded knob of old wood crusted with bracket fungi, few roots.
 * The tip's top stays on the collision (the walk) with its moss.
 */
function burlShape(
  p: Paint,
  plan: BranchPlan | null,
  masses: readonly MassRect[],
  sides: readonly Sides[],
  t: Taper,
  seed: number,
  family: string,
): void {
  const B = BRANCH;
  const r = rngFor(seed, 233);
  const ms = t.idx.map((i) => masses[i] as MassRect);
  const base = ms[0] as MassRect;
  const tip = ms[ms.length - 1] as MassRect;
  const yFar = base.y + base.h;
  const yTip = tip.y;
  const span = yFar - yTip;
  // The silhouette: the tiers' outer corners pushed out and rounded.
  const out = family === 'knee' ? range(r, 60, 150) : range(r, 14, 40);
  const L: number[] = [];
  const R: number[] = [];
  ms.forEach((m, k) => {
    const grow =
      family === 'knee'
        ? out * (1 - k / ms.length) ** 1.2
        : out * (0.6 + 0.4 * Math.sin((k / ms.length) * Math.PI));
    L.push(m.x - grow, m.y + m.h, m.x - grow * 0.7, m.y + 4);
    R.push(m.x + m.w + grow, m.y + m.h, m.x + m.w + grow * 0.7, m.y + 4);
  });
  const poly: number[] = [base.x - out * 1.2, yFar + 14];
  for (let k = 0; k < L.length; k += 2) poly.push(L[k] as number, L[k + 1] as number);
  poly.push(tip.x + 4, yTip - 2, tip.x + tip.w - 4, yTip - 2);
  for (let k = R.length - 2; k >= 0; k -= 2) poly.push(R[k] as number, R[k + 1] as number);
  poly.push(base.x + base.w + out * 1.2, yFar + 14);
  const body = chaikin(poly, 3);
  p.solid(body, T.body, B.walkH - 0.1, { bark: 0.3 });
  p.tint(body, T.lift, 0.3);
  if (family === 'knee') {
    // The bow: a thick root along the crest from foot to foot, the hollow under it in shadow.
    const xa = base.x - out * 1.1;
    const xb = base.x + base.w + out * 1.1;
    const crest: number[] = [];
    for (let q = 0; q <= 16; q++) {
      const v = q / 16;
      const x = lerp(xa, xb, v);
      const lift = Math.sin(v * Math.PI) ** 0.6;
      crest.push(x, lerp(yFar + 6, yTip + 34, lift));
    }
    const th = clamp(span * 0.42, 50, 120);
    paintLimb(
      p,
      lineLimb(crest, (tt) => th * (0.8 + 0.35 * Math.abs(tt - 0.5) * 2), B.walkH - 0.02, seed + 5, 0.4, 0.9),
    );
    const hx = (xa + xb) / 2 + range(r, -0.1, 0.1) * (xb - xa);
    const hw = (xb - xa) * range(r, 0.16, 0.24);
    const hh = Math.min(span * 0.32, 90);
    const hollow: number[] = [];
    for (let q = 0; q <= 12; q++) {
      const a = (q / 12) * Math.PI;
      hollow.push(hx - Math.cos(a) * hw, yFar + 4 - Math.sin(a) * hh);
    }
    p.solid(chaikin(hollow, 1), T.deep, B.walkH - 0.12, { bark: 0 });
    // A second, thinner root crossing the bow.
    const line2 = chaikinLine([
      xa + (xb - xa) * 0.25,
      yFar + 4,
      hx,
      yTip + span * 0.45,
      xb - (xb - xa) * 0.1,
      yFar + 6,
    ]);
    paintLimb(
      p,
      lineLimb(line2, (tt) => Math.max(5, 26 * (1 - Math.abs(tt - 0.5))), B.walkH, seed + 9, 0.3, 0.7),
    );
  } else if (family === 'fallen') {
    // A fallen section lying on the mound: its top is the walk, a sawn-looking cut end with rings on one side (the
    // only rings in the wood: a cut end shows them), a torn end on the other.
    const th = clamp(span * 0.55, 56, 120);
    const ext = range(r, 10, 34);
    const xa = tip.x - ext;
    const xb = tip.x + tip.w + ext * range(r, 0.6, 1.4);
    const cy = yTip + th / 2;
    const log: number[] = [];
    for (let x = xa; x <= xb + 0.01; x += 12) log.push(x, cy + 3 * wobble(x, seed + 1, 120));
    paintLimb(
      p,
      lineLimb(log, () => th, B.walkH + 0.01, seed + 11, 0.6, 1),
    );
    const cut = r() < 0.5 ? xa : xb;
    const dir = cut === xa ? -1 : 1;
    const ell = (k: number) => {
      const pts: number[] = [];
      for (let q = 0; q <= 18; q++) {
        const a = (q / 18) * Math.PI * 2;
        pts.push(cut + dir * 4 + Math.cos(a) * th * 0.2 * k, cy + Math.sin(a) * (th / 2) * k);
      }
      return pts;
    };
    p.solid(ell(1), 0x3a3428, B.walkH + 0.03, { bark: 0.1 });
    for (const k of [0.75, 0.5, 0.28])
      p.tint(strand([...ell(k), ...ell(k).slice(0, 2)], 2, 0), 0x1e1a14, 0.7);
    const torn = cut === xa ? xb : xa;
    for (let k = 0; k < 3; k++) {
      const yy = cy + range(r, -0.35, 0.35) * th;
      const len = range(r, 20, 60);
      p.solid(
        strand(
          [torn, yy, torn - dir * len * 0.5, yy + range(r, -6, 6), torn - dir * len, yy + range(r, -10, 10)],
          range(r, 10, 22),
          0.6,
        ),
        B.bark,
        B.walkH + 0.02,
        { bark: 1 },
      );
    }
  } else {
    // Bracket fungi in two or three clusters on the flanks: pale lit caps, dark undersides.
    const nCl = 2 + Math.floor(r() * 2);
    for (let c = 0; c < nCl; c++) {
      const side = c % 2 ? 1 : -1;
      const y0 = lerp(yTip + 30, yFar - 30, range(r, 0.15, 0.85));
      const m = ms.find((mm) => y0 >= mm.y && y0 <= mm.y + mm.h) ?? base;
      const x0 = side < 0 ? m.x - out * 0.6 : m.x + m.w + out * 0.6;
      const nCap = 3 + Math.floor(r() * 4);
      for (let k = 0; k < nCap; k++) {
        const w = range(r, 22, 56) * (1 - k * 0.08);
        const y = y0 + k * range(r, 10, 22) - nCap * 8;
        const x = x0 + side * range(r, -8, 6) + range(r, -10, 10);
        const cap: number[] = [];
        for (let q = 0; q <= 10; q++) {
          const a = (q / 10) * Math.PI;
          cap.push(x + side * Math.sin(a) * w, y - Math.cos(a) * w * 0.28 + (a > Math.PI / 2 ? w * 0.1 : 0));
        }
        p.solid(cap, 0x2a2a24, B.walkH + 0.05, { bark: 0.2 });
        p.tint(strand(cap.slice(0, 12), 4, 0.3), 0x8a8068, 0.75);
        p.tint(strand(cap.slice(10), 3, 0.3), T.deep, 0.7);
      }
    }
    // Moss in patches down the knob, a knot or two.
    for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
      const y = lerp(yTip + 20, yFar - 20, r());
      const m = ms.find((mm) => y >= mm.y && y <= mm.y + mm.h) ?? base;
      knot(
        p,
        lerp(m.x + 20, m.x + m.w - 20, r()),
        y,
        range(r, 8, 16),
        range(r, -0.6, 0.6),
        B.walkH,
        seed + k,
      );
    }
  }
  t.idx.forEach((i) => {
    const m = masses[i] as MassRect;
    const sd = sides[i] as Sides;
    for (const [x0, x1] of sd.top) {
      const full = m === tip;
      if (full) paintTopBand(p, x0, x1, m.y, seed + x0, B.walkH, 18, 18);
      mossBlanket(p, x0, x1, () => m.y, seed + x0, full ? 22 : 10, full ? 22 : 10);
      plan?.stretches.push(topStretch(`taper-${i}-${x0}`, x0, x1, m.y, 60, false, false));
    }
  });
}

/** Burl and hang families (review r5 #6): no family twice in a room, spread evenly over the world's rooms. */
export const BURL_FAMILIES = ['stump', 'split', 'knee', 'fungus', 'fallen'] as const;
export const HANG_FAMILIES = ['talon', 'beard', 'curtain', 'pod'] as const;

export const propKey = (roomId: string, up: boolean, x: number, y: number) =>
  `${roomId}|${up ? 'b' : 'h'}|${x}|${y}`;

let FAMILIES: Map<string, string> | null = null;

/**
 * Which family each taper in the wood's rooms is drawn as: rooms in id order, each taper given the family used in the
 * fewest rooms so far among those not yet in its room (so at most ceil(rooms / 4) rooms share one).
 */
export function propFamilies(): Map<string, string> {
  if (FAMILIES) return FAMILIES;
  const out = new Map<string, string>();
  const rooms = Object.values(ROOMS)
    .filter((q) => q.art?.kit === 'wood')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const count = new Map<string, number>();
  for (const room of rooms) {
    const used = new Set<string>();
    for (const tp of roomTapers(room)) {
      const list: readonly string[] = tp.up ? BURL_FAMILIES : HANG_FAMILIES;
      let best = list[0] as string;
      let bestN = Number.POSITIVE_INFINITY;
      for (const f of list) {
        if (used.has(f)) continue;
        const n = count.get(f) ?? 0;
        if (n < bestN) {
          best = f;
          bestN = n;
        }
      }
      used.add(best);
      count.set(best, (count.get(best) ?? 0) + 1);
      out.set(propKey(room.id, tp.up, tp.x, tp.y), best);
    }
  }
  FAMILIES = out;
  return out;
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
  p.solid(fill, T.body, BRANCH.walkH - 0.05, { bark: 0.4 });
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
  T = massTone(room);
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
    // (Review r5 #6: a ledge out in the open hung on four strands read as a planter on ropes.) Carried by a root from
    // a wall within 256 px, rising under it below the walk (so the walk visibly ends at the ledge's end), or by a
    // knuckle of roots rising from the floor under it; hung only when nothing is near.
    if (!sh.wall && sh.near) {
      const wx = sh.near.x;
      const side = sh.near.side === 'w' ? -1 : 1;
      const ex = side < 0 ? sh.x0 + range(rr, 10, 40) : sh.x1 - range(rr, 10, 40);
      const yw = y + th + range(rr, 70, 180);
      for (let k = 0; k < 2; k++) {
        const line = chaikinLine([
          wx - side * 30,
          yw + k * range(rr, 20, 50),
          lerp(wx, ex, 0.45),
          lerp(yw, y + th, 0.6) + range(rr, 0, 30),
          ex,
          y + th * 0.6,
          ex - side * range(rr, 20, 60),
          y + th * 0.4,
        ]);
        const w0 = k ? range(rr, 14, 22) : range(rr, 30, 46);
        paintLimb(
          p,
          lineLimb(line, (t) => Math.max(6, w0 * (1 - t * 0.5)), B.walkH - 0.04, seed + i * 41 + k, 0.2, 0.7),
        );
      }
    } else if (!sh.wall && sh.floor !== null) {
      const fy = sh.floor;
      const mid = lerp(sh.x0, sh.x1, range(rr, 0.35, 0.65));
      const hgt = fy - (y + th * 0.5);
      // Two or three roots braided up from a flared foot into the ledge's underside, splaying under it.
      // (A root rising straight under the middle read as a table on a stem: it comes up from one side, leaning.)
      const n = 2 + (rr() < 0.5 ? 1 : 0);
      const side = rr() < 0.5 ? -1 : 1;
      const lean = side * range(rr, 0.45, 0.9) * Math.min(hgt, 320);
      for (let k = 0; k < n; k++) {
        const fx = mid + lean + (k - 1) * range(rr, 20, 50);
        const tx = lerp(sh.x0 + 20, sh.x1 - 20, (k + 0.5) / n);
        const tw = range(rr, -0.3, 0.3) * 40;
        const line = chaikinLine([
          fx,
          fy + 10,
          fx - lean * 0.15 + tw,
          fy - hgt * 0.4,
          mid + lean * 0.35 + tw * 0.5,
          fy - hgt * 0.8,
          tx,
          y + th * 0.6,
        ]);
        const w0 = range(rr, 26, 44) * (k === 0 ? 1.2 : 0.85);
        paintLimb(
          p,
          lineLimb(
            line,
            (t) => Math.max(8, w0 * (1.25 - t * 0.6)),
            B.walkH - 0.03 + k * 0.01,
            seed + i * 43 + k,
            0.25,
            0.8,
          ),
        );
      }
      // Its foot: roots splaying onto the floor.
      for (const sd of [-1, 1]) {
        const fm = mid + lean;
        const line = chaikinLine([
          fm,
          fy - 30,
          fm + sd * range(rr, 30, 60),
          fy - 8,
          fm + sd * range(rr, 80, 150),
          fy + 4,
        ]);
        paintLimb(
          p,
          lineLimb(line, (t) => Math.max(4, 22 * (1 - t)), B.walkH - 0.02, seed + i * 47 + sd, 0.3, 0.6),
        );
      }
    } else if (!sh.wall) {
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
          T.body,
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

/**
 * A roost (a wide cover hung from the room's top over open air: the gap's): a hanging nest of roots and old leaves,
 * wider at the top, ragged, thinning down into loose strands and a fringe of dead leaves, dense enough to hide what
 * is in it (review r4 #3: it was a rounded black box, unchanged since round 2).
 */
export function paintRoost(
  p: Paint,
  rect: { x: number; y: number; w: number; h: number },
  seed: number,
  tone: MassTone,
): void {
  T = tone;
  const B = BRANCH;
  const r = rngFor(seed, 251);
  const { x, y, w, h } = rect;
  const cx = x + w / 2;
  const bot = y + h;
  // The core: a ragged pouch, wider than the rect at the top, narrowing, its bottom torn into hanging lobes.
  const half = (t: number) => (w / 2) * (1.25 - 0.5 * t ** 1.3) + 26 * wobble(t * 900, seed + 3, 120);
  const L: number[] = [];
  const R: number[] = [];
  for (let k = 0; k <= 24; k++) {
    const t = k / 24;
    const yy = lerp(y - 40, bot - 30, t);
    L.push(cx - half(t) - 14 * wobble(yy, seed + 5, 60), yy);
    R.push(cx + half(t) + 14 * wobble(yy, seed + 7, 60), yy);
  }
  const lobes: number[] = [];
  const nl = 5 + Math.floor(r() * 4);
  for (let k = 0; k <= nl * 2; k++) {
    const u = k / (nl * 2);
    const xx = lerp(cx - half(1), cx + half(1), u);
    lobes.push(xx, bot - 30 + (k % 2 ? range(r, 40, 150) : range(r, -20, 10)));
  }
  const core = [...L, ...lobes];
  for (let k = R.length / 2 - 1; k >= 0; k--) core.push(R[k * 2] as number, R[k * 2 + 1] as number);
  const body = chaikin(core, 2);
  p.solid(body, T.body, B.walkH - 0.1, { bark: 0.3 });
  p.tint(body, T.lift, 0.3);
  // Roots woven down it: from the roof, twisting, crossing, some running out past the bottom.
  const n = Math.round(w / 26);
  for (let k = 0; k < n; k++) {
    const u0 = k % 3 === 0 ? (k % 2 ? range(r, -0.15, 0.05) : range(r, 0.95, 1.15)) : range(r, -0.1, 1.1);
    const u1 = clamp(u0 + range(r, -0.5, 0.5), 0.05, 0.95);
    const len = h * range(r, 0.4, 1.15);
    const raw: number[] = [];
    for (let q = 0; q <= 12; q++) {
      const t = q / 12;
      const yy = lerp(y - 60, y + len, t);
      const hw = half(clamp((yy - y) / h, 0, 1));
      raw.push(cx + (lerp(u0, u1, t) - 0.5) * 2 * hw * 0.9, yy);
    }
    const line = wander(raw, 16, seed + k * 13, 160);
    const w0 = range(r, 10, 34);
    paintLimb(
      p,
      lineLimb(
        line,
        (t) => Math.max(1.5, w0 * (1 - t * 0.8)),
        B.walkH + (k % 2 ? 0.02 : -0.03),
        seed + k * 7,
        0.1,
        0.4,
      ),
    );
  }
  // Old leaves caught in it: clumps, thickest at the bottom fringe.
  for (let k = 0; k < Math.round((w * h) / 5000); k++) {
    const t = Math.sqrt(r());
    const yy = lerp(y + 40, bot + 60, t);
    const hw = half(clamp((yy - y) / h, 0, 1));
    const lx = cx + range(r, -1, 1) * hw;
    const a = range(r, 1.1, 2.1);
    const l = range(r, 26, 58);
    const pts: number[] = [];
    for (let q = 0; q <= 10; q++) {
      const th = (q / 10) * Math.PI * 2;
      const u = Math.cos(th) * l * 0.5;
      const v = Math.sin(th) * l * 0.2 * Math.abs(Math.sin(th / 2) + 0.3);
      pts.push(lx + u * Math.cos(a) - v * Math.sin(a), yy + u * Math.sin(a) + v * Math.cos(a));
    }
    p.solid(
      pts,
      k % 5 ? (k % 2 ? T.plate : B.bark) : B.barkLit,
      B.walkH + 0.05,
      { bark: 0.2 },
      k % 5 ? 0.9 : 0.22,
    );
  }
}

/**
 * The painted free edges of a room's masses as polylines (review r5 #4's check: no straight run over 300 px along a
 * mass outline): every face and underside the edge painter draws, sampled every `step` px. Tapers (burls, clumps) are
 * their own silhouettes and not included; tops are the walk (flat by design, broken by the moss band and the growth).
 */
export function massEdgeLines(
  room: Room,
  seed = 0,
  step = 8,
): Array<{ kind: 'face' | 'under'; key: number; a: number; b: number; pts: number[] }> {
  const masses: MassRect[] = room.solids.filter((s) => s.tag === 'root' || s.tag === 'ground');
  const sides = masses.map((r) => exposedSides(r, masses, room.width, room.height));
  const tapers = new Set(findTapers(masses, sides).flatMap((t) => t.idx));
  const em = edgeModel(masses, sides, seed, tapers);
  const out: Array<{ kind: 'face' | 'under'; key: number; a: number; b: number; pts: number[] }> = [];
  for (const f of em.faces) {
    const pts: number[] = [];
    for (let u = f.a; u <= f.b; u += step) pts.push(f.key + f.dir * em.faceAt(f.dir, f.key, u), u);
    out.push({ kind: 'face', key: f.key, a: f.a, b: f.b, pts });
  }
  for (const f of em.unders) {
    const pts: number[] = [];
    for (let u = f.a; u <= f.b; u += step) pts.push(u, f.key + em.underAt(u, f.key));
    out.push({ kind: 'under', key: f.key, a: f.a, b: f.b, pts });
  }
  return out;
}

/** The tapers of a room (burls standing up, clumps hanging), for the prop families (`propFamilies`) and tests. */
export function roomTapers(room: Room): Array<{ up: boolean; x: number; y: number; w: number; h: number }> {
  const masses: MassRect[] = room.solids.filter((s) => s.tag === 'root' || s.tag === 'ground');
  const sides = masses.map((r) => exposedSides(r, masses, room.width, room.height));
  return findTapers(masses, sides).map((t) => {
    const ms = t.idx.map((i) => masses[i] as MassRect);
    const y0 = Math.min(...ms.map((m) => m.y));
    const y1 = Math.max(...ms.map((m) => m.y + m.h));
    const b = ms[0] as MassRect;
    return { up: t.up, x: b.x, y: y0, w: b.w, h: y1 - y0 };
  });
}

/**
 * The den's taproot (review r5 #6: a 96 px post with rings): 160-220 px thick, plunging from the roof with a twist,
 * splitting into 3-4 roots where it plants, and a glowing scar on its face where the wick sits. Painted over the
 * column's own mass (the collision stays the column's).
 */
export function paintTaproot(p: Paint, room: Room, seed: number): void {
  const boss = (room.enemies ?? []).find((e) => (e as { taproot?: [number, number] }).taproot);
  const span = (boss as { taproot?: [number, number] } | undefined)?.taproot;
  if (!span) return;
  const [x0, x1] = span;
  const col = room.solids.find((s) => s.x <= x0 + 1 && s.x + s.w >= x1 - 1 && s.h > s.w);
  if (!col) return;
  T = massTone(room);
  const B = BRANCH;
  const r = rngFor(seed, x0, 503);
  const cx = (x0 + x1) / 2;
  const top = col.y - 60;
  const foot = col.y + col.h;
  const len = foot - top;
  const th = clamp(range(r, 160, 220), col.w + 40, 240);
  // The trunk: a twisting line, two strands wound round each other over a dark core.
  const line: number[] = [];
  for (let q = 0; q <= 24; q++) {
    const v = q / 24;
    line.push(cx + 14 * Math.sin(v * 5.2 + 1) + 10 * wobble(v * len, seed + 3, 300), lerp(top, foot - 60, v));
  }
  paintLimb(
    p,
    lineLimb(line, (t) => th * (1 + 0.15 * t), B.walkH - 0.01, seed + 7, 0.2, 1),
  );
  for (let k = 0; k < 3; k++) {
    const ph = k * 2.1 + range(r, 0, 1);
    const w = line.map((v, j) => (j % 2 ? v : v + Math.sin((j / line.length) * 9 + ph) * th * 0.32));
    paintLimb(
      p,
      lineLimb(w, () => th * range(r, 0.22, 0.34), B.walkH + 0.01 + k * 0.01, seed + 11 + k, 0.15, 0.8),
    );
  }
  // The foot: 3-4 roots splitting off and splaying onto the floor.
  const n = 3 + (r() < 0.5 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n - 0.5;
    const out = u * range(r, 260, 420);
    const rl = chaikinLine([
      cx + u * th * 0.6,
      foot - 220,
      cx + u * th * 0.8 + out * 0.3,
      foot - 90,
      cx + out * 0.8,
      foot - 10,
      cx + out,
      foot + 8,
    ]);
    paintLimb(
      p,
      lineLimb(rl, (t) => Math.max(8, th * 0.36 * (1 - t * 0.75)), B.walkH + 0.02, seed + 31 + k, 0.3, 0.8),
    );
  }
  // The scar where the wick sits: a long gash in the bark, pale sap-lit wood inside a dark lip.
  const wick = (room.lamps ?? []).find((l) => l.x >= x0 - 140 && l.x <= x1 + 140);
  const sy = wick ? wick.y : lerp(top, foot, 0.45);
  const gash: number[] = [];
  for (let q = 0; q <= 16; q++) {
    const a = (q / 16) * Math.PI * 2;
    gash.push(cx + Math.sin(a) * th * 0.16 * (1 + 0.3 * Math.sin(a * 3)), sy + Math.cos(a) * 70);
  }
  p.solid(chaikin(gash, 1), 0x0a0605, B.walkH + 0.04, { bark: 0.2 });
  p.tint(
    chaikin(
      gash.map((v, j) => (j % 2 ? sy + (v - sy) * 0.72 : cx + (v - cx) * 0.55)),
      1,
    ),
    0x8a5a30,
    0.85,
  );
  p.tint(
    chaikin(
      gash.map((v, j) => (j % 2 ? sy + (v - sy) * 0.4 : cx + (v - cx) * 0.25)),
      1,
    ),
    0xd8a060,
    0.7,
  );
}
