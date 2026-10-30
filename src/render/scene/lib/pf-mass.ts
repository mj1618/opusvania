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
  /** The root filling a square inner corner: its reach along the floor / up the wall, px. */
  corner: [38, 64] as readonly number[],
  /** ...only where the wall over the corner stands at least this tall (px). */
  cornerMinWall: 160,
  /** ...and the floor before it runs at least this far (a narrowing stack's short steps get none). */
  cornerMinFloor: 200,
  /** A pillar (both faces free, narrower than this) flares at its foot by up to `flare` px a side. */
  pillarW: 420,
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

/** The body's outline: flush where it meets mass (a hair over, so no seam), lumpy where it faces air. */
function outline(r: MassRect, s: Sides, seed: number): number[] {
  const pts: number[] = [];
  const st = 16;
  const o = 3;
  const bulge = (k: number, sd: number) =>
    lerp(MASS.bulge[0] as number, MASS.bulge[1] as number, hash1(k, sd));
  for (let x = r.x; x < r.x + r.w; x += st) pts.push(x, inSegs(x, s.top) ? r.y : r.y - o);
  for (let y = r.y; y < r.y + r.h; y += st) {
    const k = Math.round(y / st);
    const out = inSegs(y, s.right) ? bulge(k, seed + 1) * clamp((y - r.y) / 40, 0.2, 1) : o;
    pts.push(r.x + r.w + out, y);
  }
  for (let x = r.x + r.w; x > r.x; x -= st) {
    const k = Math.round(x / st);
    let sag = inSegs(x, s.bottom) ? 6 + 16 * hash1(k, seed + 2) + 6 * Math.sin(x / 70 + seed) : o;
    // An underside's outer corner rounds up into the flank.
    const yb = r.y + r.h - 2;
    const dE = r.x + r.w - x;
    const dW = x - r.x;
    if (inSegs(x, s.bottom) && inSegs(yb, s.right) && dE < 34) sag -= (34 - dE) * 0.9;
    if (inSegs(x, s.bottom) && inSegs(yb, s.left) && dW < 34) sag -= (34 - dW) * 0.9;
    pts.push(x, r.y + r.h + sag);
  }
  for (let y = r.y + r.h; y > r.y; y -= st) {
    const k = Math.round(y / st);
    const out = inSegs(y, s.left) ? bulge(k, seed + 3) * clamp((y - r.y) / 40, 0.2, 1) : o;
    pts.push(r.x - out, y);
  }
  return pts;
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

  // 1. The body.
  masses.forEach((r, i) => {
    if (!near(r.x, r.y, r.x + r.w, r.y + r.h)) return;
    const s = sides[i] as Sides;
    p.solid(outline(r, s, seed + i * 7), earth(r) ? MASS.deep : MASS.body, B.walkH - 0.12, { bark: 0.25 });
  });

  // 2. The deep: dim roots wandering through big masses, a knot now and then.
  masses.forEach((r, i) => {
    if (!near(r.x, r.y, r.x + r.w, r.y + r.h)) return;
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
        {
          bark: 0.5,
          alpha: 0.8,
        },
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

  // 3. Sides: columns of bark (or earth) down every exposed face, lit toward the air.
  masses.forEach((r, i) => {
    const s = sides[i] as Sides;
    for (const [dir, segs] of [
      [1, s.right],
      [-1, s.left],
    ] as const) {
      for (const [y0, y1] of segs) {
        const x = dir > 0 ? r.x + r.w : r.x;
        if (!near(x - 200, y0, x + 200, y1)) continue;
        const rr = rngFor(seed, x, y0, 5);
        const th = range(rr, MASS.sideTh[0] as number, MASS.sideTh[1] as number);
        const cx = x - dir * (th * 0.5 - 6);
        // Drawn so the lit flank (the limb's upper side) faces the air: down on an east face, up on a west face.
        // (Under an exposed top the column starts below the top's root, which turns down over the corner.)
        const topped = inSegs(x - dir * 8, s.top) && Math.abs(y0 - r.y) < 2;
        const yTop = topped ? y0 + 46 : y0 - 10;
        const ya = dir > 0 ? yTop : y1 + 10;
        const yb = dir > 0 ? y1 + 10 : yTop;
        // A free-standing pillar flares into its foot (and a face leans a little either way), never a plumb post.
        // (Only a tall one: the steps of a narrowing stack, each flared at its foot, read as a pagoda.)
        const pillar = r.w <= MASS.pillarW && r.h >= MASS.pillarMinH && s.left.length > 0 && s.right.length > 0;
        const yLo = Math.max(ya, yb);
        const flare = (yy: number) => (pillar ? MASS.flare * clamp((yy - (yLo - 200)) / 200, 0, 1) ** 2 : 0);
        const line: number[] = [];
        for (let t = 0; t <= 16; t++) {
          const yy = lerp(ya, yb, t / 16);
          line.push(
            cx + dir * (4 * wobble(yy, seed + i, 90) + 8 * wobble(yy, seed + i + 5, 600) + flare(yy)),
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
          const L = lineLimb(
            line,
            (t) => th * (0.9 + 0.15 * Math.sin(t * Math.PI * 3 + i)),
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
    }
  });

  // 4. Undersides: a root along the ceiling, roots and moss hanging out of it; a hang for the beards.
  masses.forEach((r, i) => {
    const s = sides[i] as Sides;
    for (const [x0, x1] of s.bottom) {
      const y = r.y + r.h;
      if (!near(x0, y - 200, x1, y + 200)) continue;
      const rr = rngFor(seed, x0, y, 7);
      const th = Math.min(range(rr, MASS.underTh[0] as number, MASS.underTh[1] as number), r.h);
      const line: number[] = [];
      for (let x = x0 - 12; x <= x1 + 12; x += 24) line.push(x, y - th * 0.5 + 6 * wobble(x, seed + 11, 140));
      if (earth(r)) {
        p.solid(
          ribbon(line, () => th),
          MASS.soil,
          B.walkH - 0.04,
          { bark: 0.05 },
        );
        stones(p, x0, y - th, x1 - x0, th, seed + 3 * i);
      } else {
        const L = lineLimb(line, () => th, B.walkH - 0.02, seed + i * 5 + x0, 0, 0.7);
        paintLimb(p, L, knotsFor(L, seed + x0, 600));
        fadeInto(p, line, () => th * 1.04, 0, -1, MASS.body);
      }
      // Roots hanging out of the underside, longer in the middle of a span.
      const n = Math.max(1, Math.round((x1 - x0) / 90));
      for (let k = 0; k < n; k++) {
        const x = x0 + range(rr, 10, Math.max(11, x1 - x0 - 10));
        const mid = 1 - Math.abs((x - x0) / Math.max(1, x1 - x0) - 0.5) * 1.4;
        const len = (30 + 150 * rr() ** 2) * clamp(mid, 0.3, 1);
        const line2 = [x, y - 6, x + range(rr, -10, 10), y + len * 0.5, x + range(rr, -22, 22), y + len];
        p.solid(
          ribbon(chaikinLine(line2), (t) => 9 * (1 - t) + 1.5),
          B.barkDark,
          B.walkH - 0.02,
          { bark: 0.5 },
        );
      }
      plan?.hangs.push({ x0: x0 + 20, x1: x1 - 20, y: () => y + 4, deep: false, reach: 180 });
    }
  });

  // 5. Tops: a great root under every exposed top, the walk's moss on it, flush with the collision.
  masses.forEach((r, i) => {
    const s = sides[i] as Sides;
    for (const [x0, x1] of s.top) {
      const y = r.y;
      if (!near(x0, y - 200, x1, y + 200)) continue;
      const rr = rngFor(seed, x0, y, 9);
      // Over the top's ends: a wall rising (another mass, its side over this top) or a free corner (a drop).
      const wallW = masses.some(
        (q) => q !== r && q.x + q.w >= x0 - 1 && q.x < x0 && q.y < y && q.y + q.h >= y,
      );
      const wallE = masses.some(
        (q) => q !== r && q.x <= x1 + 1 && q.x + q.w > x1 && q.y < y && q.y + q.h >= y,
      );
      const freeW = !wallW && x0 <= r.x + 1 && inSegs(y + 8, s.left);
      const freeE = !wallE && x1 >= r.x + r.w - 1 && inSegs(y + 8, s.right);
      const depth = r.h + (inSegs(x0 + 1, s.bottom) ? 0 : 200);
      const th = Math.min(range(rr, MASS.topTh[0] as number, MASS.topTh[1] as number), depth);
      const xa = x0 - (wallW ? 40 : freeW ? MASS.lip : 0);
      const xb = x1 + (wallE ? 40 : freeE ? MASS.lip : 0);
      // The root's thickness swells and pinches; its top stays flush with the collision, rounding over a free end.
      const thAt = (x: number) =>
        th * (0.86 + 0.2 * wobble(x, seed + i + 41, 260) + 0.06 * wobble(x, seed + i, 70));
      const dropAt = (x: number) => {
        const dw = freeW ? clamp((x0 + 30 - x) / 44, 0, 1) : 0;
        const de = freeE ? clamp((x - (x1 - 30)) / 44, 0, 1) : 0;
        return MASS.roundOver * Math.max(dw, de) ** 2;
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
      // Where the floor meets a wall rising from it: a root buttress out of the wall onto the floor, so the corner is
      // never a square box (review r2 #2). Not on earth (the earth's own corner is soft already).
      // (Not under a short step: a stack of narrowing rects with a buttress at every step read as a pagoda.)
      const wallUp = (x: number) =>
        Math.max(
          0,
          ...masses
            .filter((q) => q !== r && x >= q.x - 1 && x <= q.x + q.w + 1 && q.y < y)
            .map((q) => y - q.y),
        );
      if (!earth(r) && x1 - x0 >= MASS.cornerMinFloor) {
        if (wallW && wallUp(x0 - 2) >= MASS.cornerMinWall) cornerRoot(p, x0, y, 1, -1, seed + i * 19 + x0);
        if (wallE && wallUp(x1 + 2) >= MASS.cornerMinWall) cornerRoot(p, x1, y, -1, -1, seed + i * 23 + x1);
      }
    }
  });

  // 5b. A narrow mass hanging from the room's top into open air (the gap's roost, review r2 #9) is a clump of roots,
  // not a slab: strands fanning in from above, twisting down its length, running out past its foot in ragged tips.
  masses.forEach((r, i) => {
    const s = sides[i] as Sides;
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

  // 6. Ceiling corners (an underside meeting a wall going down from it) get the same root, hanging; a pillar's foot
  // flares into the floor it stands on.
  masses.forEach((r, i) => {
    const s = sides[i] as Sides;
    if (earth(r)) return;
    for (const [x0, x1] of s.bottom) {
      const y = r.y + r.h;
      if (!near(x0, y - 200, x1, y + 200)) continue;
      const wallW = masses.some(
        (q) => q !== r && q.x + q.w >= x0 - 1 && q.x < x0 && q.y < y + 4 && q.y + q.h > y + 4,
      );
      const wallE = masses.some(
        (q) => q !== r && q.x <= x1 + 1 && q.x + q.w > x1 && q.y < y + 4 && q.y + q.h > y + 4,
      );
      if (wallW) cornerRoot(p, x0, y, 1, 1, seed + i * 29 + x0);
      if (wallE) cornerRoot(p, x1, y, -1, 1, seed + i * 31 + x1);
    }
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
