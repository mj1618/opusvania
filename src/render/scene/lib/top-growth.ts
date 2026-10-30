/**
 * What grows on the walk tops, by look (canopy review r7 #6: "one lime moss frosting, the same thickness, on every top
 * in every room"). Silksong's moss is stippled clumps with dark gaps, thick on some edges and absent on others, a
 * different growth per region. Here each look has its own family:
 *
 *   lime    the canopy (and the open rooms painted as canopy): lime moss clumps, cushions on the crest, a few drips
 *   amber   the heartwood: amber lichen in flat rosettes over bare bark
 *   frost   the shaft: pale frost lichen, thin, a feathery fringe under it
 *   fungus  the den: clusters of small grey-violet caps on bare earth crumbs
 *   straw   the nest: dry litter, pale blades and husks
 *
 * A top is covered over 40-85% of its length (`growthRuns`: runs with breaks, a coverage drawn per top), each run
 * 10-60 px thick at its middle and thinning to its ends, built of dots over a dark body with a shadowed underside (not
 * a smooth band). The walkable read is the live rim (pf-rim.ts, `RIM_FAMILY`), a thin lit lip along every top, bare
 * or grown.
 *
 * The painters (pf-branch `mossBlanket`, pf-edge `paintTopBand`) hand over to `paintGrowth` while a family is set
 * (`setTopFamily`, by `paintBranchTerrain` for the room being painted); with none they paint as before.
 */
import type { Room } from '../../../scene/room';
import { type Look, lookOf } from './looks';
import type { Paint } from './pf-paint';
import { blob, chaikin, clamp, lerp, range, rngFor, smoothstep, wobble } from './pf-shape';

export type TopFamily = 'lime' | 'amber' | 'frost' | 'fungus' | 'straw';

/** One family per look (no two looks share one: `tests/unit/wood-moss.test.ts`). */
export const TOP_FAMILY: Record<Look, TopFamily> = {
  canopy: 'lime',
  heartwood: 'amber',
  shaft: 'frost',
  den: 'fungus',
  nest: 'straw',
};

export interface GrowthSpec {
  /** Albedo: the dark body, the mid, the highlights, the brightest caps, the shadow under a clump. */
  deep: number;
  body: number;
  high: number;
  lit: number;
  shadow: number;
  /** Relief moss-ness (1 takes the moon as moss: yellow-green; lichens and caps keep their own hue). */
  moss: number;
  /** A run's thickness at its middle, px (the review's 10-60). */
  th: readonly [number, number];
  /** A covered run's length and the coverage of a top, drawn per top. */
  run: readonly [number, number];
  cover: readonly [number, number];
  /** One dot per this many px² of a run, and their radius range, px. */
  dot: number;
  dotR: readonly [number, number];
  /** How far the crest stands over the walk line, px (her feet and the rim sit on it). */
  rise: number;
}

export const GROWTH: Record<TopFamily, GrowthSpec> = {
  lime: {
    deep: 0x173c26,
    body: 0x34703a,
    high: 0x6ea84a,
    lit: 0x9ccc5e,
    shadow: 0x040a07,
    moss: 1,
    th: [16, 60],
    run: [120, 460],
    cover: [0.5, 0.84],
    dot: 70,
    dotR: [3, 8],
    rise: 8,
  },
  // (Canopy review r8 #10: saturated amber discs read as cheese. Half the chroma, in smears.)
  amber: {
    deep: 0x261d15,
    body: 0x50402d,
    high: 0x7c684e,
    lit: 0xb09c7b,
    shadow: 0x0a0604,
    moss: 0.25,
    th: [10, 34],
    run: [70, 300],
    cover: [0.42, 0.74],
    dot: 55,
    dotR: [2, 5],
    rise: 3,
  },
  frost: {
    deep: 0x2e4256,
    body: 0x667e96,
    high: 0xa8bed2,
    lit: 0xdcebf8,
    shadow: 0x05080d,
    moss: 0.2,
    th: [10, 26],
    run: [90, 320],
    cover: [0.42, 0.7],
    dot: 55,
    dotR: [2, 5],
    rise: 2,
  },
  fungus: {
    deep: 0x1a1614,
    body: 0x332c28,
    high: 0x7c7268,
    lit: 0xd2c6b4,
    shadow: 0x050404,
    moss: 0.15,
    th: [12, 44],
    run: [80, 280],
    cover: [0.4, 0.66],
    dot: 90,
    dotR: [2, 6],
    rise: 9,
  },
  straw: {
    deep: 0x30260f,
    body: 0x6a5a30,
    high: 0xa08c54,
    lit: 0xd2be82,
    shadow: 0x080603,
    moss: 0.2,
    th: [10, 40],
    run: [80, 300],
    cover: [0.45, 0.78],
    dot: 70,
    dotR: [2, 6],
    rise: 4,
  },
};

/** The live rim's lit and shaded colour per family (pf-rim.ts): the thin lip that says "walk here". */
export const RIM_FAMILY: Record<TopFamily, { lit: number; shade: number }> = {
  lime: { lit: 0xa6d884, shade: 0x3e6e4a },
  amber: { lit: 0xe6c27c, shade: 0x6a4c26 },
  frost: { lit: 0xd6eaff, shade: 0x56708a },
  fungus: { lit: 0xc8c2d6, shade: 0x4a4554 },
  straw: { lit: 0xdccc8c, shade: 0x6a5a32 },
};

/** The face moss beside it (the faces she clings to): mid and lit, or none. */
export const FACE_FAMILY: Record<TopFamily, { moss: number; lit: number } | null> = {
  lime: null,
  amber: { moss: 0x594630, lit: 0x9a815f },
  frost: null,
  fungus: { moss: 0x3c3640, lit: 0x8a8296 },
  straw: { moss: 0x5a4c26, lit: 0x9a8650 },
};

export function topFamilyOf(room: Room): TopFamily {
  return TOP_FAMILY[lookOf(room)];
}

/** The family of the room being painted (null: the old band and blanket). */
let current: TopFamily | null = null;
export function setTopFamily(f: TopFamily | null): void {
  current = f;
}
export function topFamily(): TopFamily | null {
  return current;
}

export interface GrowthRun {
  a: number;
  b: number;
  /** Thickness at its middle, px. */
  th: number;
}

/**
 * The covered runs of a top [x0, x1] (pure, deterministic): a coverage drawn in the family's range, split into runs of
 * uneven length with uneven breaks between (the ends of a top start and finish on a break as often as not).
 */
export function growthRuns(x0: number, x1: number, seed: number, fam: TopFamily): GrowthRun[] {
  const G = GROWTH[fam];
  const L = x1 - x0;
  if (L < 16) return [];
  const r = rngFor(seed, x0, x1, 503);
  const c = range(r, G.cover[0], G.cover[1]);
  const meanRun = (G.run[0] + G.run[1]) / 2;
  const n = Math.max(1, Math.round((L * c) / meanRun));
  const runs = Array.from({ length: n }, () => range(r, 0.55, 1.45));
  const gaps = Array.from({ length: n + 1 }, (_, i) => range(r, 0.3, 1.6) * (i === 0 || i === n ? 0.5 : 1));
  const sr = runs.reduce((s, v) => s + v, 0);
  const sg = gaps.reduce((s, v) => s + v, 0);
  const out: GrowthRun[] = [];
  let x = x0;
  for (let i = 0; i < n; i++) {
    x += ((gaps[i] as number) / sg) * L * (1 - c);
    const len = ((runs[i] as number) / sr) * L * c;
    // (A long run is thick, a short one thin: 10-60 px over the area, not one depth everywhere.)
    const k = clamp((len - G.run[0]) / (G.run[1] - G.run[0]), 0, 1);
    const th = lerp(
      G.th[0],
      G.th[1],
      clamp(0.25 + 0.75 * k * range(r, 0.55, 1.15) + range(r, -0.15, 0.15), 0, 1),
    );
    out.push({ a: x, b: x + len, th });
    x += len;
  }
  return out;
}

/** The share of [x0, x1] the runs cover. */
export function growthCover(runs: readonly GrowthRun[], x0: number, x1: number): number {
  return runs.reduce((s, q) => s + (q.b - q.a), 0) / Math.max(1, x1 - x0);
}

const mixc = (c0: number, c1: number, t: number): number => {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(lerp(ch(c0, s), ch(c1, s), clamp(t, 0, 1)));
  return (m(16) << 16) | (m(8) << 8) | m(0);
};

/**
 * Paints the growth of `fam` along a top [x0, x1] whose walk line is `topAt(x)`, at relief height `h`; `dropW` /
 * `dropE` let a run over a free end hang round the corner. Returns the crest (what stands highest over the walk line
 * at x: her feet and the rim follow it).
 */
export function paintGrowth(
  p: Paint,
  x0: number,
  x1: number,
  topAt: (x: number) => number,
  seed: number,
  h: number,
  dropW: number,
  dropE: number,
  fam: TopFamily,
): (x: number) => number {
  const G = GROWTH[fam];
  const runs = growthRuns(x0, x1, seed, fam);
  const r = rngFor(seed, x0, x1, 509);
  const Y = (x: number) => topAt(clamp(x, x0, x1));
  /** Crest bumps: centre, rise, half width. */
  const bumps: Array<[number, number, number]> = [];
  const crestAt = (x: number): number => {
    let t = Y(x);
    for (const [cx, rise, rx] of bumps) {
      const u = (x - cx) / rx;
      if (u > -1 && u < 1) t = Math.min(t, Y(x) - rise * Math.sqrt(1 - u * u));
    }
    return t;
  };
  for (const [ri, run] of runs.entries()) {
    const { a, b, th } = run;
    const len = b - a;
    if (len < 10) continue;
    const sd = seed + ri * 31;
    // The profile: thickest near its middle, thinning to its ends; a run at a free end drapes round the corner.
    const atEnd = (x: number) =>
      (dropW && a <= x0 + 1 ? clamp((x0 + 20 - x) / 20, 0, 1) * dropW : 0) +
      (dropE && b >= x1 - 1 ? clamp((x - (x1 - 20)) / 20, 0, 1) * dropE : 0);
    const thick = (x: number) => {
      const t = clamp((x - a) / len, 0, 1);
      const bell = Math.sin(Math.PI * t) ** 0.45;
      return Math.max(3, th * bell * (0.72 + 0.28 * wobble(x, sd, 37))) + atEnd(x);
    };
    const step = 4;
    const top: number[] = [];
    const low: number[] = [];
    const shadow: number[] = [];
    for (let x = a; x <= b + 0.01; x += step) {
      const y = Y(x);
      const d = thick(x);
      top.push(x, y - 1);
      low.push(x, y + d * 0.8);
      shadow.push(x, y + d + 4 + 3 * wobble(x, sd + 3, 19));
    }
    const fill = (upper: number[], lower: number[]): number[] => {
      const out = upper.slice();
      for (let k = lower.length / 2 - 1; k >= 0; k--)
        out.push(lower[k * 2] as number, lower[k * 2 + 1] as number);
      return out;
    };
    // 1. The shadow it casts on the wood under it, then its dark body.
    p.tint(fill(low, shadow), G.shadow, 0.6);
    p.solid(fill(top, low), G.deep, h + 0.1, { moss: G.moss });
    // 2. The stipple: dots, lighter toward the top, dark gaps left between them.
    const area = len * th * 0.75;
    const n = Math.round(area / G.dot);
    for (let k = 0; k < n; k++) {
      const x = range(r, a + 2, b - 2);
      const d = thick(x);
      const t = r() ** 1.25;
      const y = Y(x) + 1 + t * d * 0.85;
      const rad = range(r, G.dotR[0], G.dotR[1]) * (1 - 0.35 * t);
      const lit = r() < 0.75 - t * 0.6;
      const col = lit ? mixc(G.body, G.high, range(r, 0.2, 1)) : mixc(G.deep, G.body, range(r, 0.2, 0.8));
      p.solid(blob(x, y, rad, rad * range(r, 0.6, 0.9), sd + k, 0.3, 7), col, h + 0.14 + (lit ? 0.04 : 0), {
        moss: G.moss,
      });
    }
    // 3. The family's own pieces.
    if (fam === 'lime') limeCushions(p, G, a, b, Y, thick, h, sd, r, bumps);
    else if (fam === 'amber') amberRosettes(p, G, a, b, Y, thick, h, sd, r, bumps);
    else if (fam === 'frost') frostFringe(p, G, a, b, Y, thick, h, sd, r, bumps);
    else if (fam === 'fungus') fungusCaps(p, G, a, b, Y, thick, h, sd, r, bumps);
    else strawBlades(p, G, a, b, Y, thick, h, sd, r, bumps);
  }
  return crestAt;
}

type Rng = () => number;
type Piece = (
  p: Paint,
  G: GrowthSpec,
  a: number,
  b: number,
  Y: (x: number) => number,
  thick: (x: number) => number,
  h: number,
  sd: number,
  r: Rng,
  bumps: Array<[number, number, number]>,
) => void;

/** Lime: cushions along the crest (each its own size, a lit cap), and now and then a clump of drips under a run. */
const limeCushions: Piece = (p, G, a, b, Y, thick, h, sd, r, bumps) => {
  let x = a + range(r, 4, 24);
  while (x < b - 6) {
    const k = smoothstep(a, a + 30, x) * smoothstep(b, b - 30, x);
    const rx = range(r, 7, 18) * (0.5 + 0.5 * k);
    const ry = rx * range(r, 0.5, 0.75);
    const rise = range(r, 0.2, 1) * G.rise * k;
    const cy = Y(x) - rise + ry;
    bumps.push([x, rise, rx * 0.8]);
    p.solid(chaikin(blob(x, cy, rx, ry, sd + Math.round(x), 0.2, 12), 1), G.body, h + 0.22, { moss: 1 });
    p.solid(
      chaikin(blob(x - rx * 0.1, cy - ry * 0.35, rx * 0.7, ry * 0.45, sd + Math.round(x) + 1, 0.2, 10), 1),
      r() < 0.6 ? G.lit : G.high,
      h + 0.28,
      { moss: 1 },
      range(r, 0.6, 0.95),
    );
    // (Gaps between the cushions: a dark notch reads as a clump of separate tufts, not a band.)
    x += rx * range(r, 1.3, 2.6);
  }
  if (b - a > 140 && r() < 0.7) {
    const nd = 1 + Math.floor(r() * 3);
    for (let k = 0; k < nd; k++) {
      const sx = range(r, a + 30, b - 30);
      const sy = Y(sx) + thick(sx) * 0.75;
      const len = range(r, 18, 64);
      const w0 = range(r, 8, 18);
      const pts: number[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const hw = (w0 / 2) * (1 - t ** 1.8) ** 0.5 * (1 + 0.3 * wobble(sy + t * len, sd + k, 9));
        pts.push(sx - hw, sy + t * len);
      }
      pts.push(sx, sy + len + w0 * 0.25);
      for (let i = 10; i >= 0; i--) {
        const t = i / 10;
        const hw = (w0 / 2) * (1 - t ** 1.8) ** 0.5 * (1 + 0.3 * wobble(sy + t * len, sd + k + 3, 9));
        pts.push(sx + hw, sy + t * len);
      }
      p.solid(pts, mixc(G.deep, G.body, range(r, 0.2, 0.7)), h + 0.08, { moss: 0.9 });
    }
  }
};

/** Amber: flat lichen in irregular smears (not discs: review r8 #10), overlapping, a darker heart, gold specks. */
const amberRosettes: Piece = (p, G, a, b, Y, thick, h, sd, r, bumps) => {
  let x = a + range(r, 2, 14);
  while (x < b - 4) {
    const d = thick(x);
    const rx = range(r, 6, 20);
    const ry = Math.min(d * 0.4, rx * range(r, 0.18, 0.36));
    const cy = Y(x) + range(r, 0.1, 0.6) * d;
    const s = sd + Math.round(x);
    const rot = range(r, -0.25, 0.25);
    p.solid(chaikin(blob(x, cy, rx, ry, s, 0.55, 14, rot), 1), G.high, h + 0.16, { moss: G.moss });
    p.tint(
      chaikin(blob(x + rx * 0.2, cy + ry * 0.1, rx * 0.5, ry * 0.5, s + 1, 0.5, 10, rot), 1),
      G.body,
      0.85,
    );
    if (r() < 0.25) p.tint(blob(x - rx * 0.2, cy - ry * 0.3, 1.8, 1.4, s + 2, 0.2, 6), G.lit, 0.8);
    if (cy - ry < Y(x) + 1) bumps.push([x, Math.min(G.rise, Y(x) + 1 - (cy - ry)), rx * 0.7]);
    x += rx * range(r, 1.2, 3.2);
  }
};

/** Frost: a thin pale crust with bright specks and a feathery fringe of hairs under it. */
const frostFringe: Piece = (p, G, a, b, Y, thick, _h, sd, r, bumps) => {
  for (let x = a + range(r, 2, 10); x < b - 3; x += range(r, 4, 14)) {
    const y = Y(x) + thick(x) * 0.8;
    const len = range(r, 3, 12);
    const lean = range(r, -2, 2);
    p.tint(
      [x - 0.8, y, x + 0.8, y, x + lean + 0.3, y + len, x + lean - 0.3, y + len],
      G.high,
      range(r, 0.5, 0.9),
    );
  }
  for (let k = 0, n = Math.round((b - a) / 18); k < n; k++) {
    const x = range(r, a + 2, b - 2);
    const y = Y(x) + range(r, 0, 0.5) * thick(x);
    p.tint(blob(x, y, 1.6, 1.4, sd + k, 0.2, 6), G.lit, 0.95);
  }
  let x = a + range(r, 10, 40);
  while (x < b - 10) {
    bumps.push([x, range(r, 0.4, 1) * G.rise, range(r, 8, 20)]);
    x += range(r, 30, 90);
  }
};

/** Fungus: clusters of small caps standing on bare earth crumbs, pale tops, dark gills, a stalk now and then. */
const fungusCaps: Piece = (p, G, a, b, Y, _thick, h, sd, r, bumps) => {
  let x = a + range(r, 8, 40);
  while (x < b - 10) {
    const n = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const cx = x + range(r, -14, 14);
      if (cx < a + 4 || cx > b - 4) continue;
      const w = range(r, 9, 24) * (k ? 0.7 : 1);
      const stalk = r() < 0.6 ? range(r, 3, 12) : 0;
      const base = Y(cx) + range(r, 0, 4);
      const cy = base - stalk;
      const capH = w * range(r, 0.45, 0.7);
      const s = sd + Math.round(cx) + k;
      if (stalk)
        p.solid([cx - 1.6, base + 2, cx + 1.6, base + 2, cx + 1.2, cy, cx - 1.2, cy], G.high, h + 0.16, {});
      // The cap: a dome over a flat underside, its gills a dark slot under it.
      const cap: number[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = (i / 10) * Math.PI;
        cap.push(cx - Math.cos(t) * w, cy - Math.sin(t) * capH * (1 + 0.1 * wobble(i, s, 3)));
      }
      cap.push(cx + w * 0.8, cy + 2.5, cx - w * 0.8, cy + 2.5);
      p.solid(cap, G.high, h + 0.22, { moss: G.moss });
      p.tint(chaikin(blob(cx - w * 0.15, cy - capH * 0.6, w * 0.55, capH * 0.3, s, 0.2, 10), 1), G.lit, 0.85);
      p.tint(
        [cx - w * 0.8, cy + 0.5, cx + w * 0.8, cy + 0.5, cx + w * 0.6, cy + 3, cx - w * 0.6, cy + 3],
        G.deep,
        0.9,
      );
      const rise = Math.min(G.rise, base - (cy - capH));
      if (rise > 0) bumps.push([cx, rise, w * 0.8]);
    }
    x += range(r, 80, 200);
  }
};

/** Straw: dry blades leaning, a few seed husks, over the litter. */
const strawBlades: Piece = (p, G, a, b, Y, _thick, h, sd, r, bumps) => {
  for (let x = a + range(r, 2, 8); x < b - 2; x += range(r, 3, 11)) {
    const y = Y(x) + range(r, 0, 3);
    const len = range(r, 6, 20);
    const lean = range(r, -0.9, 0.9) * len * 0.6;
    const w = range(r, 1.2, 2.6);
    p.tint([x - w, y, x + w, y, x + lean, y - len], r() < 0.4 ? G.lit : G.high, range(r, 0.55, 0.95));
  }
  for (let k = 0, n = Math.round((b - a) / 70); k < n; k++) {
    const x = range(r, a + 6, b - 6);
    const y = Y(x) + range(r, 2, 8);
    p.solid(
      blob(x, y, range(r, 3, 6), range(r, 2, 3.5), sd + k, 0.2, 8, range(r, -0.6, 0.6)),
      G.lit,
      h + 0.2,
      {
        moss: G.moss,
      },
    );
  }
  let x = a + range(r, 6, 30);
  while (x < b - 6) {
    bumps.push([x, range(r, 0.4, 1) * G.rise, range(r, 6, 16)]);
    x += range(r, 20, 60);
  }
};

/**
 * The wrap (canopy r9, the r8 compare sheet: Silksong wraps thick moss round every edge, down the sides and under the
 * undersides, with clumps hanging off; ours was a cap on the tops): what grows on a top grows on round its free
 * edges too, in the same family's colours and stipple, thinner on a face than on a walk and hanging in clumps under a
 * ceiling. All of it hugs the painted edge (the lobes, `off`), standing out into the air and a little into the mass;
 * the mass's inside stays near-black.
 *
 *   face   from the face's top down over 35-90% of it (thickest at the top, where it comes round from the walk), then
 *          a patch or two lower; the family's pieces: lime cushions bulging out, amber rosettes, frost hairs, fungus
 *          shelves standing off the bark, straw tufts.
 *   under  a band under the underside over 50-90% of it, and clumps hanging from it: lime moss beards (wide almost to
 *          the end, then round: a point reads as a thorn or an icicle), amber lichen beards (a few thin strands),
 *          frost feathers (short), fungus rootlets with caps on them, straw tufts of dry blades.
 */
export interface WrapSpec {
  /** A face's growth: thickness at its top (px), coverage of the face from the top. */
  faceTh: readonly [number, number];
  faceCover: readonly [number, number];
  /** An underside's band: thickness, coverage. */
  underTh: readonly [number, number];
  underCover: readonly [number, number];
  /** Hanging clumps: spacing, length and width at the root (px). */
  clumpGap: readonly [number, number];
  clumpLen: readonly [number, number];
  clumpW: readonly [number, number];
}

export const WRAP: Record<TopFamily, WrapSpec> = {
  lime: {
    faceTh: [34, 70],
    faceCover: [0.55, 0.92],
    underTh: [20, 44],
    underCover: [0.6, 0.92],
    clumpGap: [50, 170],
    clumpLen: [44, 190],
    clumpW: [24, 52],
  },
  amber: {
    faceTh: [20, 42],
    faceCover: [0.5, 0.85],
    underTh: [12, 26],
    underCover: [0.5, 0.85],
    clumpGap: [70, 200],
    clumpLen: [34, 110],
    clumpW: [12, 26],
  },
  frost: {
    faceTh: [14, 30],
    faceCover: [0.45, 0.8],
    underTh: [10, 22],
    underCover: [0.5, 0.85],
    clumpGap: [60, 180],
    clumpLen: [16, 44],
    clumpW: [14, 30],
  },
  fungus: {
    faceTh: [16, 34],
    faceCover: [0.45, 0.8],
    underTh: [12, 26],
    underCover: [0.45, 0.8],
    clumpGap: [80, 220],
    clumpLen: [44, 130],
    clumpW: [7, 14],
  },
  straw: {
    faceTh: [20, 44],
    faceCover: [0.5, 0.88],
    underTh: [14, 30],
    underCover: [0.5, 0.88],
    clumpGap: [60, 180],
    clumpLen: [30, 110],
    clumpW: [14, 32],
  },
};

/** Covered runs along [a, b]: `first` starts at a (the corner it comes round), the rest spread with breaks. */
function wrapRuns(a: number, b: number, cover: number, first: boolean, r: Rng): Array<[number, number]> {
  const L = b - a;
  const out: Array<[number, number]> = [];
  if (L < 20) return out;
  let left = L * cover;
  let u = first ? a : a + range(r, 0, L * (1 - cover) * 0.5);
  // The first (longest) run, then shorter ones with breaks between.
  let k = 0;
  while (left > 12 && u < b - 12) {
    const len = Math.min(b - u, k === 0 ? left * range(r, 0.55, 0.85) : left * range(r, 0.4, 1));
    out.push([u, u + len]);
    left -= len;
    u += len + range(r, 0.06, 0.25) * L;
    k++;
  }
  return out;
}

/** A face's wrap: x = `off(u)` is the painted edge at height u (air on side `dir`), [a, b] top to bottom. */
export function paintFaceWrap(
  p: Paint,
  a: number,
  b: number,
  dir: number,
  off: (u: number) => number,
  h: number,
  seed: number,
  fam: TopFamily,
): void {
  const G = GROWTH[fam];
  const W = WRAP[fam];
  const r = rngFor(seed, Math.round(a), Math.round(b), 521);
  const L = b - a;
  if (L < 24) return;
  const th0 = range(r, W.faceTh[0], W.faceTh[1]);
  const runs = wrapRuns(a, b, range(r, W.faceCover[0], W.faceCover[1]), true, r);
  for (const [ri, [u0, u1]] of runs.entries()) {
    const len = u1 - u0;
    const sd = seed + ri * 37;
    // Thickest at the top (where it comes round the corner), thinning down; a lower patch is a bell.
    const thick = (u: number) => {
      const t = clamp((u - u0) / len, 0, 1);
      const prof =
        ri === 0 ? (1 - t) ** 0.7 * smoothstep(0, 0.04, t + 0.02) : Math.sin(Math.PI * t) ** 0.6 * 0.7;
      return Math.max(2, th0 * prof * (0.75 + 0.25 * wobble(u, sd, 41)));
    };
    const out: number[] = [];
    const inn: number[] = [];
    for (let u = u0; u <= u1 + 0.01; u += 5) {
      const x = off(u);
      const d = thick(u);
      out.push(x + dir * d * 0.55, u);
      inn.push(x - dir * d * 0.5, u);
    }
    const body = out.slice();
    for (let k = inn.length / 2 - 1; k >= 0; k--) body.push(inn[k * 2] as number, inn[k * 2 + 1] as number);
    p.solid(body, G.deep, h + 0.08, { moss: G.moss });
    // Stipple: lighter toward the outside and the top (the moon from above).
    const n = Math.round((len * th0 * 0.5) / (G.dot * 1.3));
    for (let k = 0; k < n; k++) {
      const u = range(r, u0 + 2, u1 - 2);
      const d = thick(u);
      if (d < 3) continue;
      const t = r();
      const x = off(u) + dir * d * (0.5 - t * 0.9);
      const rad = range(r, G.dotR[0], G.dotR[1]) * Math.min(1, d / 14) * (1 - 0.3 * t);
      const lit = r() < 0.7 - t * 0.5 - 0.3 * ((u - u0) / len);
      const col = lit ? mixc(G.body, G.high, range(r, 0.1, 0.9)) : mixc(G.deep, G.body, range(r, 0.2, 0.8));
      p.solid(blob(x, u, rad, rad * range(r, 0.7, 1), sd + k, 0.3, 7), col, h + 0.12 + (lit ? 0.03 : 0), {
        moss: G.moss,
      });
    }
    facePieces(p, G, fam, u0, u1, dir, off, thick, h, sd, r);
  }
}

function facePieces(
  p: Paint,
  G: GrowthSpec,
  fam: TopFamily,
  u0: number,
  u1: number,
  dir: number,
  off: (u: number) => number,
  thick: (u: number) => number,
  h: number,
  sd: number,
  r: Rng,
): void {
  if (fam === 'lime' || fam === 'straw') {
    // Cushions bulging out past the edge, each its own size, a lit cap on the upper side.
    let u = u0 + range(r, 2, 16);
    while (u < u1 - 6) {
      const d = thick(u);
      const rad = range(r, 0.45, 0.9) * Math.max(6, d);
      if (d > 5) {
        const cx = off(u) + dir * d * range(r, 0.2, 0.55);
        p.solid(chaikin(blob(cx, u, rad, rad * 1.1, sd + Math.round(u), 0.22, 12), 1), G.body, h + 0.18, {
          moss: G.moss,
        });
        if (r() < 0.6)
          p.solid(
            chaikin(
              blob(
                cx + dir * rad * 0.15,
                u - rad * 0.35,
                rad * 0.6,
                rad * 0.5,
                sd + Math.round(u) + 1,
                0.2,
                10,
              ),
              1,
            ),
            fam === 'straw' ? G.high : r() < 0.5 ? G.lit : G.high,
            h + 0.24,
            { moss: G.moss },
            range(r, 0.55, 0.9),
          );
        if (fam === 'straw' && r() < 0.5)
          for (let q = 0; q < 4; q++) {
            const ln = range(r, 8, 22);
            const ang = range(r, 0.2, 1.2);
            p.tint(
              [cx - 1, u, cx + 1, u, cx + dir * Math.sin(ang) * ln, u + Math.cos(ang) * ln],
              G.lit,
              range(r, 0.5, 0.85),
            );
          }
      }
      u += rad * range(r, 1.2, 2.4);
    }
  } else if (fam === 'amber') {
    let u = u0 + range(r, 2, 14);
    while (u < u1 - 4) {
      const d = thick(u);
      const rx = range(r, 6, 16) * Math.min(1, d / 10 + 0.3);
      const cx = off(u) + dir * range(r, -0.3, 0.4) * d;
      const rot = range(r, -0.35, 0.35);
      p.solid(chaikin(blob(cx, u, rx * 0.3, rx, sd + Math.round(u), 0.55, 14, rot), 1), G.high, h + 0.16, {
        moss: G.moss,
      });
      p.tint(
        chaikin(blob(cx, u + rx * 0.2, rx * 0.18, rx * 0.5, sd + Math.round(u) + 1, 0.5, 10, rot), 1),
        G.body,
        0.85,
      );
      u += rx * range(r, 1.4, 3.2);
    }
  } else if (fam === 'frost') {
    // Hairs leaning out and down off the edge, bright specks.
    for (let u = u0 + range(r, 2, 8); u < u1 - 3; u += range(r, 3, 10)) {
      const d = thick(u);
      const x = off(u) + dir * d * 0.4;
      const ln = range(r, 3, 10) * Math.min(1, d / 8 + 0.3);
      const lean = range(r, 0.3, 1);
      p.tint(
        [x, u - 0.8, x, u + 0.8, x + dir * ln * lean, u + ln * (1 - lean * 0.5)],
        G.high,
        range(r, 0.5, 0.85),
      );
      if (r() < 0.2) p.tint(blob(x, u, 1.5, 1.3, sd + Math.round(u), 0.2, 6), G.lit, 0.95);
    }
  } else {
    // Fungus: little shelves standing off the bark in clusters, pale tops, a dark gill line under each.
    let u = u0 + range(r, 10, 50);
    while (u < u1 - 10) {
      const nq = 2 + Math.floor(r() * 3);
      for (let q = 0; q < nq; q++) {
        const cu = u + q * range(r, 7, 13);
        if (cu > u1 - 4) break;
        const w = range(r, 8, 18) * (q ? 0.8 : 1);
        const x = off(cu);
        const tip = x + dir * w;
        const shelf = [
          x - dir * 3,
          cu + 2,
          x - dir * 3,
          cu - w * 0.35,
          tip * 0.6 + x * 0.4,
          cu - w * 0.42,
          tip,
          cu - 1,
          tip - dir * 2,
          cu + 2,
        ];
        p.solid(chaikin(shelf, 1), G.high, h + 0.2, { moss: G.moss });
        p.tint([x, cu + 1, tip - dir * 2, cu + 0.5, tip - dir * 3, cu + 3, x, cu + 3.5], G.deep, 0.9);
        p.tint(
          chaikin(blob(x + dir * w * 0.45, cu - w * 0.25, w * 0.3, w * 0.12, sd + Math.round(cu), 0.2, 8), 1),
          G.lit,
          0.8,
        );
      }
      u += range(r, 70, 180);
    }
  }
}

/** An underside's wrap: y = `off(x)` is the painted underside at x, [a, b] its run. */
export function paintUnderWrap(
  p: Paint,
  a: number,
  b: number,
  off: (x: number) => number,
  h: number,
  seed: number,
  fam: TopFamily,
  /** Its free corners (it comes round them from the faces): thicker there. */
  cornerA: boolean,
  cornerB: boolean,
): void {
  const G = GROWTH[fam];
  const W = WRAP[fam];
  const r = rngFor(seed, Math.round(a), Math.round(b), 541);
  const L = b - a;
  if (L < 24) return;
  const th0 = range(r, W.underTh[0], W.underTh[1]);
  const runs = wrapRuns(a, b, range(r, W.underCover[0], W.underCover[1]), cornerA, r);
  // (A free corner at the far end too: the last run reaches it.)
  if (cornerB && runs.length && (runs[runs.length - 1] as [number, number])[1] < b - 30)
    runs.push([b - Math.min(L * 0.3, range(r, 80, 220)), b]);
  for (const [ri, [x0, x1]] of runs.entries()) {
    const len = x1 - x0;
    if (len < 12) continue;
    const sd = seed + ri * 43;
    const thick = (x: number) => {
      const t = clamp((x - x0) / len, 0, 1);
      const bell = Math.sin(Math.PI * t) ** 0.5;
      const corner =
        (cornerA && x0 <= a + 1 ? (1 - t) ** 2 * 0.8 : 0) + (cornerB && x1 >= b - 1 ? t ** 2 * 0.8 : 0);
      return Math.max(2, th0 * Math.max(bell, corner) * (0.7 + 0.3 * wobble(x, sd, 33)));
    };
    const up: number[] = [];
    const dn: number[] = [];
    for (let x = x0; x <= x1 + 0.01; x += 5) {
      const y = off(x);
      const d = thick(x);
      up.push(x, y - d * 0.4);
      dn.push(x, y + d * 0.6);
    }
    const body = up.slice();
    for (let k = dn.length / 2 - 1; k >= 0; k--) body.push(dn[k * 2] as number, dn[k * 2 + 1] as number);
    p.solid(body, G.deep, h + 0.06, { moss: G.moss });
    // Stipple: an underside is in shadow, so mostly the dark and mid values, a few lit specks at its lower edge.
    const n = Math.round((len * th0 * 0.5) / (G.dot * 1.4));
    for (let k = 0; k < n; k++) {
      const x = range(r, x0 + 2, x1 - 2);
      const d = thick(x);
      if (d < 3) continue;
      const t = r();
      const y = off(x) + d * (0.55 - t * 0.85);
      const rad = range(r, G.dotR[0], G.dotR[1]) * Math.min(1, d / 12) * 0.9;
      const lit = r() < 0.3 - t * 0.2;
      const col = lit ? mixc(G.body, G.high, range(r, 0.1, 0.6)) : mixc(G.deep, G.body, range(r, 0.1, 0.7));
      p.solid(blob(x, y, rad, rad * range(r, 0.7, 1), sd + k, 0.3, 7), col, h + 0.1, { moss: G.moss });
    }
    // The clumps hanging from it.
    let x = x0 + range(r, W.clumpGap[0] * 0.2, W.clumpGap[0]);
    while (x < x1 - 10) {
      const y = off(x) + thick(x) * 0.45;
      const k = clamp(thick(x) / th0, 0.4, 1);
      const len = range(r, W.clumpLen[0], W.clumpLen[1]) * (0.4 + 0.6 * k) * (r() < 0.25 ? 0.5 : 1);
      const w0 = range(r, W.clumpW[0], W.clumpW[1]) * (0.6 + 0.4 * k);
      hangClumpOf(p, G, fam, x, y, len, w0, h, sd + Math.round(x), r);
      x += range(r, W.clumpGap[0], W.clumpGap[1]);
    }
  }
}

/** One clump hanging from (x, y): `len` long, `w0` wide at its root. */
function hangClumpOf(
  p: Paint,
  G: GrowthSpec,
  fam: TopFamily,
  x: number,
  y: number,
  len: number,
  w0: number,
  h: number,
  sd: number,
  r: Rng,
): void {
  if (fam === 'lime' || fam === 'straw') {
    // A beard: wide almost to the end, then round; lumpy flanks; stippled; a lit speck or two on its upper half.
    const sway = range(r, -0.15, 0.15) * len;
    const Lp: number[] = [];
    const Rp: number[] = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const yy = y + t * len;
      const cx = x + sway * t * t;
      const hw = (w0 / 2) * (1 - t ** 3) ** 0.5 * (1 + 0.3 * wobble(yy, sd, 11)) + 1;
      Lp.push(cx - hw, yy);
      Rp.push(cx + hw, yy);
    }
    const shape = [...Lp];
    for (let i = Rp.length / 2 - 1; i >= 0; i--) shape.push(Rp[i * 2] as number, Rp[i * 2 + 1] as number);
    p.solid(chaikin(shape, 1), G.deep, h + 0.04, { moss: G.moss });
    const nd = Math.round((len * w0) / (G.dot * 1.1));
    for (let k = 0; k < nd; k++) {
      const t = r() ** 1.2;
      const hw = (w0 / 2) * (1 - t ** 3) ** 0.5;
      const cx = x + sway * t * t + range(r, -hw, hw) * 0.8;
      const rad = range(r, G.dotR[0], G.dotR[1]) * 0.8 * (1 - 0.4 * t);
      const lit = r() < 0.4 - 0.3 * t;
      p.solid(
        blob(cx, y + t * len, rad, rad, sd + k, 0.3, 7),
        lit ? mixc(G.body, G.high, range(r, 0.2, 0.9)) : mixc(G.deep, G.body, range(r, 0.2, 0.8)),
        h + 0.08,
        { moss: G.moss },
      );
    }
    if (fam === 'straw')
      for (let q = 0; q < 5; q++) {
        const sx = x + range(r, -w0 / 2, w0 / 2);
        const ln = len * range(r, 0.6, 1.15);
        p.tint([sx - 0.9, y, sx + 0.9, y, sx + range(r, -6, 6), y + ln], G.lit, range(r, 0.45, 0.8));
      }
  } else if (fam === 'amber') {
    // Lichen beard: a few thin strands of different lengths from one tuft.
    p.solid(chaikin(blob(x, y + 2, w0 * 0.5, w0 * 0.35, sd, 0.3, 10), 1), G.body, h + 0.06, { moss: G.moss });
    const ns = 3 + Math.floor(r() * 3);
    for (let q = 0; q < ns; q++) {
      const sx = x + range(r, -w0 * 0.4, w0 * 0.4);
      const ln = len * range(r, 0.35, 1);
      const bend = range(r, -6, 6);
      const ww = range(r, 1.4, 2.6);
      p.solid(
        [
          sx - ww,
          y,
          sx + ww,
          y,
          sx + bend + ww * 0.5,
          y + ln * 0.6,
          sx + bend * 1.4 + 0.8,
          y + ln,
          sx + bend * 1.4 - 0.8,
          y + ln,
          sx + bend - ww * 0.5,
          y + ln * 0.6,
        ],
        q % 2 ? G.high : G.body,
        h + 0.07,
        { moss: G.moss },
      );
      p.tint(blob(sx + bend * 1.4, y + ln, ww * 1.1, ww * 1.3, sd + q, 0.2, 6), G.lit, 0.75);
    }
  } else if (fam === 'frost') {
    // Frost feathers: a short pale tuft of fine hairs, splayed, no long points.
    for (let q = 0; q < 9; q++) {
      const sx = x + range(r, -w0 / 2, w0 / 2);
      const ln = len * range(r, 0.4, 1);
      const lean = range(r, -0.5, 0.5);
      p.tint([sx - 0.9, y, sx + 0.9, y, sx + lean * ln, y + ln], q % 3 ? G.high : G.lit, range(r, 0.55, 0.9));
    }
    p.tint(chaikin(blob(x, y + 1, w0 * 0.45, 3, sd, 0.2, 8), 1), G.body, 0.9);
  } else {
    // Fungus: a thin dark rootlet with two or three small caps along it.
    const bend = range(r, -0.25, 0.25) * len;
    const pts = [x - w0 / 2, y, x + w0 / 2, y, x + bend + 1.2, y + len, x + bend - 1.2, y + len];
    p.solid(pts, G.deep, h + 0.04, { bark: 0.4 });
    const nc = 2 + Math.floor(r() * 2);
    for (let q = 0; q < nc; q++) {
      const t = range(r, 0.3, 1);
      const cx = x + bend * t;
      const cy = y + len * t;
      const cw = range(r, 4, 9);
      const side = q % 2 ? 1 : -1;
      const cap = [
        cx,
        cy + 1,
        cx + side * cw,
        cy - cw * 0.2,
        cx + side * cw * 0.8,
        cy - cw * 0.55,
        cx,
        cy - cw * 0.45,
      ];
      p.solid(chaikin(cap, 1), G.high, h + 0.1, { moss: G.moss });
      p.tint(blob(cx + side * cw * 0.45, cy - cw * 0.35, cw * 0.3, cw * 0.15, sd + q, 0.2, 6), G.lit, 0.8);
    }
  }
}
