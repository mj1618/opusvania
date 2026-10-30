/**
 * The wood's mass edges (canopy review r5 #4: "the masses are drawn inside-out, detail in the slab, a ruler on the
 * edge"). Silksong and Hollow Knight keep the inside of a mass flat dark and put everything on its edge: a chain of
 * rounded lobes, a thick lit moss band on every walk, a fringe of moss and roots under every ceiling. This module is
 * that edge:
 * - `lobeOffset`: the painted edge of a free face or underside as a chain of lobes off the collision line, the same
 *   for the body's outline (pf-mass.ts `outline`) and the lobes painted on it. Claw faces stay within +-12 px (the
 *   cling reads), faces that refuse the claws and undersides go further (undersides hang below the collision only).
 * - `paintFaceLobes` / `paintUnderLobes`: each lobe a rounded knob of bark (or earth) with a dark seam round its inner
 *   side and a lit crescent on its outer arc, moss on the upper part of a face's lobes.
 * - `paintTopBand`: a 30-60 px band of moss under every walk top, lobed along its lower edge.
 * - `paintFringe`: moss drips and roots 60-200 px under every underside, one every 40-120 px.
 * Pure geometry plus `Paint` calls: the shot test (tests/unit/wood-edges.test.ts) walks every edge for straight runs.
 */
import { BRANCH, lineLimb, paintLimb, strand } from './pf-branch';
import type { Paint } from './pf-paint';
import { blob, chaikin, clamp, hash1, lerp, range, rngFor, smoothstep, wobble } from './pf-shape';
import { paintGrowth, topFamily } from './top-growth';

export interface LobeSpec {
  /** Offset of the notch between two lobes, px (+ = out into the air). */
  notch: number;
  /** A lobe's crest offset, px. */
  peak: readonly [number, number];
  /** A lobe's width along the edge, px. */
  w: readonly [number, number];
  /** Notch length between lobes, px. */
  gap: readonly [number, number];
}

export const EDGE = {
  /**
   * A face she clings to (review r5 #4 kept it within +-12 px; canopy r7: at play distance that still read as a ruler):
   * lobes 100-280 px long reaching up to 18 px out, notches up to 24 px in, so her hold reads on the crests and the
   * moss cushions on them.
   */
  claw: { notch: -24, peak: [6, 18], w: [100, 400], gap: [-40, 10] } as LobeSpec,
  /** A face that refuses the claws: bigger lobes, cut deeper and standing further out. */
  loose: { notch: -24, peak: [16, 42], w: [80, 220], gap: [-40, 30] } as LobeSpec,
  /** An underside: lobes hanging below the collision, never above it (she must not seem to bump air). */
  under: { notch: 2, peak: [16, 46], w: [60, 200], gap: [-30, 24] } as LobeSpec,
  /** Over this many px at a run's ends the lobes ease back onto the collision (the corners join the tops). */
  fade: 40,
  /** How deep a lobe's knob reaches into the mass: share of its width, clamped px. */
  knob: [0.42, 34, 96] as readonly number[],
  /** The moss band under a walk top: depth range and its drape lobes' width range, px. */
  band: [44, 84] as readonly number[],
  bandLobe: [40, 130] as readonly number[],
  /** Its albedo (the bake multiplies by the light: the walk's moss must come out the brightest mass value). */
  bandLow: 0x2c643a,
  bandHigh: 0x64a44e,
  /** Its foot's cushions and crest domes: radius ranges, px; the crest rises at most `dome` px over the walk line;
   *  share of foot cushions with a strand of moss hanging off. */
  footR: [16, 40] as readonly number[],
  crestR: [12, 30] as readonly number[],
  dome: 9,
  strand: 0.16,
  /** One stipple puff in the band per this many px² of it. */
  puff: 260,
  /** The fringe under a ceiling: length and spacing, px. */
  fringeLen: [60, 200] as readonly number[],
  fringeGap: [40, 120] as readonly number[],
  /** The inside of a mass further than this from an edge is the darkest plane: its detail at `innerK` contrast. */
  inner: 120,
  innerK: 0.33,
} as const;

export interface Lobe {
  c: number;
  w: number;
  peak: number;
}

const cache = new Map<string, Lobe[]>();

/** The lobes along a run [a, b] (deterministic by seed and the run). */
export function lobesFor(spec: LobeSpec, seed: number, a: number, b: number): Lobe[] {
  const key = `${spec.notch}|${spec.peak[0]}|${seed}|${a}|${b}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = rngFor(seed, Math.round(a), Math.round(b), 401);
  const out: Lobe[] = [];
  const len = b - a;
  if (len < spec.w[0]) {
    out.push({ c: (a + b) / 2, w: Math.max(len, 24), peak: range(r, spec.peak[0], spec.peak[1]) * 0.6 });
  } else {
    let u = a + range(r, -spec.w[0] * 0.4, 0);
    while (u < b) {
      // (Canopy review r7 #8: lobes of one length stacked like pillows. More short than long, a few very long.)
      const w = spec.w[0] + (spec.w[1] - spec.w[0]) * r() ** 1.5;
      out.push({ c: u + w / 2, w, peak: range(r, spec.peak[0], spec.peak[1]) });
      u += w + range(r, spec.gap[0], spec.gap[1]);
    }
  }
  if (cache.size > 4000) cache.clear();
  cache.set(key, out);
  return out;
}

/** A lobe's height over the notch at t in [-1, 1] across it: round, a little flattened at the crest. */
function arc(t: number): number {
  const q = 1 - t * t;
  return q <= 0 ? 0 : Math.sqrt(q) ** 0.8;
}

/** The edge's offset off the collision at u along a run [a, b] (+ = out into the air). */
export function lobeOffset(spec: LobeSpec, lobes: readonly Lobe[], a: number, b: number, u: number): number {
  let best = spec.notch;
  for (const L of lobes) {
    const t = (u - L.c) / (L.w / 2);
    if (t <= -1 || t >= 1) continue;
    best = Math.max(best, spec.notch + (L.peak - spec.notch) * arc(t));
  }
  const f = clamp(Math.min(u - a, b - u) / EDGE.fade, 0, 1);
  return best * smoothstep(0, 1, f);
}

/** The painted edge of a run as a polyline (for the straight-run test and the painters). */
export function edgeLine(
  spec: LobeSpec,
  seed: number,
  run: { key: number; a: number; b: number; dir: number },
  vertical: boolean,
  step = 6,
): number[] {
  const lobes = lobesFor(spec, seed, run.a, run.b);
  const pts: number[] = [];
  for (let u = run.a; u <= run.b + 0.01; u += step) {
    const uu = Math.min(u, run.b);
    const o = lobeOffset(spec, lobes, run.a, run.b, uu);
    if (vertical) pts.push(run.key + run.dir * o, uu);
    else pts.push(uu, run.key + o);
  }
  return pts;
}

export interface EdgeTone {
  body: number;
  deep: number;
  lift: number;
  rim: number;
  rimA: number;
  /** Moss on the upper arc of a face's lobes (0 = none: earth, frost) and its lit caps (0 = none). */
  moss: number;
  mossLit?: number;
}

/**
 * Lobes down a free face at x = `key` (air on side `dir`), from y `a` to `b`: each a rounded knob reaching into the
 * mass, its inner side outlined by a dark seam, its outer arc lit; a crack into the mass at each notch.
 */
export function paintFaceLobes(
  p: Paint,
  spec: LobeSpec,
  seed: number,
  run: { key: number; a: number; b: number; dir: number },
  tone: EdgeTone,
  h: number,
  /** How deep a knob may reach (a narrow post's lobes, each a full knob, read as a string of beads). */
  maxD = 999,
  /** Scale of the lobes' offsets (the outline's own: `edgeModel`). */
  scale = 1,
): void {
  const { key, a, b, dir } = run;
  const lobes = lobesFor(spec, seed, a, b);
  const r = rngFor(seed, key, a, 409);
  const at = (u: number) => key + dir * scale * lobeOffset(spec, lobes, a, b, u);
  for (const L of lobes) {
    const u0 = Math.max(a, L.c - L.w / 2);
    const u1 = Math.min(b, L.c + L.w / 2);
    if (u1 - u0 < 16) continue;
    const D = Math.min(
      maxD,
      clamp(L.w * (EDGE.knob[0] as number), EDGE.knob[1] as number, EDGE.knob[2] as number) *
        range(r, 0.55, 1.3),
    );
    const skew = range(r, -0.35, 0.35);
    const outer: number[] = [];
    const inner: number[] = [];
    const n = Math.max(6, Math.round((u1 - u0) / 6));
    for (let k = 0; k <= n; k++) {
      const u = lerp(u0, u1, k / n);
      const t = (u - L.c) / (L.w / 2);
      outer.push(at(u), u);
      inner.push(key + dir * (spec.notch * scale - D * arc(clamp(t + skew * (1 - t * t), -1, 1)) - 2), u);
    }
    const knob = [...outer];
    for (let k = inner.length / 2 - 1; k >= 0; k--)
      knob.push(inner[k * 2] as number, inner[k * 2 + 1] as number);
    // The knob: a breath lighter than the body (each its own), its relief domed (the bake rounds it). (Canopy r8: at a
    // full step lighter each knob read as a pillow.)
    p.solid(knob, lerp3(tone.body, tone.lift, range(r, 0.04, 0.2)), h - 0.06, { bark: 0.5 });
    // The seam round part of its inner side (the outline the eye reads lobe by lobe; a full ring read as a coin).
    const s0 = Math.floor(range(r, 0, 0.35) * n);
    const s1 = Math.ceil(range(r, 0.6, 1) * n);
    if (maxD >= 40)
      p.tint(strand(inner.slice(s0 * 2, s1 * 2 + 2), range(r, 2.5, 5), 0.35), tone.deep, range(r, 0.5, 0.85));
    // The lit crescent on its outer arc (tapering to the notches), moss on the upper part of a face's lobes.
    const rim = range(r, 8, 18);
    const cres: number[] = [];
    const back: number[] = [];
    for (let k = 0; k <= n; k++) {
      const u = lerp(u0, u1, k / n);
      const t = (u - L.c) / (L.w / 2);
      const x = outer[k * 2] as number;
      cres.push(x, u);
      back.push(x - dir * rim * arc(t) ** 0.7, u);
    }
    for (let k = back.length / 2 - 1; k >= 0; k--)
      cres.push(back[k * 2] as number, back[k * 2 + 1] as number);
    p.tint(cres, tone.rim, tone.rimA);
    if (tone.moss) {
      // (Canopy r7: the references' walls are furred with moss as thick as their walks.) Cushions along the upper
      // 50-85% of the arc, centred on the edge so they swell the silhouette out, a lit cap on each, dimmer than a walk's.
      const top = range(r, 0.75, 1);
      const m: number[] = [];
      const mb: number[] = [];
      for (let k = 0; k <= n * top; k++) {
        const u = lerp(u0, u1, k / n);
        const t = (u - L.c) / (L.w / 2);
        const x = outer[k * 2] as number;
        const w = (rim + 10) * arc(t) ** 0.5 * (1 - k / (n * top + 1)) ** 0.5;
        m.push(x + dir * 3, u);
        mb.push(x - dir * w, u + w * 0.3);
      }
      for (let k = mb.length / 2 - 1; k >= 0; k--) m.push(mb[k * 2] as number, mb[k * 2 + 1] as number);
      p.solid(m, tone.moss, h + 0.1, { moss: 0.9 });
      const span = (u1 - u0) * top;
      // (Evenly sized cushions spaced along a face read as a string of beads: sizes 5-22 px, overlapping.)
      for (let q = 0, nq = Math.max(1, Math.round(span / 20)); q < nq; q++) {
        const u = u0 + span * ((q + range(r, 0, 1)) / nq);
        const x = at(u);
        const cr = range(r, 5, 22) * (0.6 + 0.4 * arc((u - L.c) / (L.w / 2))) * Math.min(1, scale + 0.2);
        const cx = x + dir * range(r, -cr * 0.4, cr * 0.35);
        p.solid(chaikin(blob(cx, u, cr, cr * 1.15, seed + Math.round(u), 0.22, 12), 1), tone.moss, h + 0.14, {
          moss: 1,
        });
        if (tone.mossLit && r() < 0.55)
          p.solid(
            chaikin(
              blob(cx + dir * cr * 0.2, u - cr * 0.3, cr * 0.6, cr * 0.65, seed + Math.round(u) + 1, 0.2, 10),
              1,
            ),
            tone.mossLit,
            h + 0.18,
            { moss: 1 },
            range(r, 0.35, 0.65),
          );
      }
    }
  }
  // Roots crossing the seams (canopy review r7 #8): down a long face, a root or two running in and out of the edge
  // across several lobes, so the knobs read as one wall grown over, not a stack.
  if (b - a >= 400) {
    const nr = 1 + Math.floor(r() * Math.min(3, (b - a) / 400));
    for (let q = 0; q < nr; q++) {
      const len = range(r, 220, Math.min(620, b - a - 40));
      const u0 = range(r, a + 20, b - 20 - len);
      const deep = range(r, 18, 46);
      const ph = range(r, 0, 6.28);
      const line: number[] = [];
      for (let u = u0; u <= u0 + len; u += 10) {
        const t = (u - u0) / len;
        const inn = deep * (0.5 + 0.5 * Math.sin(t * 5 + ph)) + 6;
        line.push(at(u) - dir * inn, u);
      }
      const w0 = range(r, 9, 18);
      p.solid(strand(line, w0, 0.45), tone.deep, h - 0.02, { bark: 0.8 });
      p.tint(
        strand(
          line.map((v, j) => (j % 2 ? v : v + dir * w0 * 0.3)),
          w0 * 0.25,
          0.45,
        ),
        tone.rim,
        tone.rimA * 0.8,
      );
    }
  }
  // (Review r5 #4: within +-12 px a claw face still read as a ruler at play distance.) Overhanging paint off some
  // crests: a moss cushion bulging out past the lobe, or a root stub curling down off it, 10-30 px into the air.
  for (const L of lobes) {
    if (L.c < a + 60 || L.c > b - 60 || r() < 0.45) continue;
    const u = L.c - L.w * range(r, 0.05, 0.3);
    const x0 = at(u);
    if (tone.moss && r() < 0.65) {
      const out = range(r, 10, 26);
      const len = range(r, 30, 70);
      const pts: number[] = [];
      for (let q = 0; q <= 12; q++) {
        const t = q / 12;
        const bulge = out * Math.sin(Math.PI * t) ** 0.7 * (1 + 0.25 * Math.sin(t * 13 + L.c));
        pts.push(x0 + dir * bulge, u - len / 2 + len * t);
      }
      pts.push(x0 - dir * 10, u + len / 2, x0 - dir * 10, u - len / 2);
      p.solid(pts, tone.moss, h + 0.12, { moss: 1 });
    } else {
      const len = range(r, 22, 56);
      const out = range(r, 12, 30);
      p.solid(
        strand(
          [
            x0 - dir * 6,
            u,
            x0 + dir * out * 0.6,
            u + len * 0.25,
            x0 + dir * out,
            u + len * 0.7,
            x0 + dir * out * 0.8,
            u + len,
          ],
          range(r, 6, 11),
          0.5,
        ),
        tone.deep,
        h + 0.02,
        { bark: 0.6 },
      );
    }
  }
  // A crack into the mass at each notch between lobes.
  for (const L of lobes) {
    const u = L.c + L.w / 2;
    if (u <= a + 30 || u >= b - 30) continue;
    const len = range(r, 22, 64);
    const x0 = key + dir * spec.notch;
    p.tint(
      strand(
        [x0 + dir * 2, u, x0 - dir * len * 0.5, u + range(r, -8, 8), x0 - dir * len, u + range(r, -16, 16)],
        5,
        0.2,
      ),
      tone.deep,
      0.8,
    );
  }
}

/**
 * Lobes under a free underside at y = `key` from x `a` to `b`: knobs hanging below it, outlined above by a seam, a dim
 * crescent on their low arc (undersides are in shadow).
 */
export function paintUnderLobes(
  p: Paint,
  spec: LobeSpec,
  seed: number,
  run: { key: number; a: number; b: number },
  tone: EdgeTone,
  h: number,
): void {
  const { key, a, b } = run;
  const lobes = lobesFor(spec, seed, a, b);
  const r = rngFor(seed, key, a, 419);
  for (const L of lobes) {
    const u0 = Math.max(a, L.c - L.w / 2);
    const u1 = Math.min(b, L.c + L.w / 2);
    if (u1 - u0 < 16) continue;
    const D = clamp(L.w * (EDGE.knob[0] as number), EDGE.knob[1] as number, EDGE.knob[2] as number) * 0.8;
    const n = Math.max(6, Math.round((u1 - u0) / 6));
    const outer: number[] = [];
    const inner: number[] = [];
    for (let k = 0; k <= n; k++) {
      const u = lerp(u0, u1, k / n);
      const t = (u - L.c) / (L.w / 2);
      outer.push(u, key + lobeOffset(spec, lobes, a, b, u));
      inner.push(u, key - D * arc(t) + 2);
    }
    const knob = [...outer];
    for (let k = inner.length / 2 - 1; k >= 0; k--)
      knob.push(inner[k * 2] as number, inner[k * 2 + 1] as number);
    p.solid(knob, lerp3(tone.body, tone.lift, 0.18), h - 0.07, { bark: 0.5 });
    p.tint(strand(inner, range(r, 3, 6), 0.25), tone.deep, 0.85);
    const rim = range(r, 5, 11);
    const cres: number[] = [];
    const back: number[] = [];
    for (let k = 0; k <= n; k++) {
      const t = (lerp(u0, u1, k / n) - L.c) / (L.w / 2);
      cres.push(outer[k * 2] as number, outer[k * 2 + 1] as number);
      back.push(outer[k * 2] as number, (outer[k * 2 + 1] as number) - rim * arc(t) ** 0.7);
    }
    for (let k = back.length / 2 - 1; k >= 0; k--)
      cres.push(back[k * 2] as number, back[k * 2 + 1] as number);
    p.tint(cres, tone.rim, tone.rimA * 0.45);
  }
}

/**
 * The moss band under a walk top (y = `y`, x0..x1), canopy r7: Silksong's and HK's rims are a thick bright cushion of
 * moss on near-black ground, its silhouette lobed above and below. Built from cushions, not a polygon with a wavy hem
 * (that read as cake icing with teeth):
 * - a dark body 44-84 px deep under the walk (its depth wandering, running round a free end and down);
 * - a row of low cushions along its foot, each its own size, a dark seam under it, and now and then a strand of moss
 *   hanging from it (24-110 px, rounded tip);
 * - a row of crest cushions along the walk, domes rising at most `EDGE.dome` px over the line, each with a lit cap
 *   and a dark crease between it and its neighbour.
 * The bake lights it (moss relief, the moss key): the walk's moss is the brightest mass value in the room. Returns the
 * crest's painted top at x (the live rim and the growth follow it).
 */
export function paintTopBand(
  p: Paint,
  x0: number,
  x1: number,
  y: number,
  seed: number,
  h: number,
  dropW = 0,
  dropE = 0,
  tint: { color: number; k: number } | null = null,
): (x: number) => number {
  // (Canopy r8, review r7 #6: the room's own growth, by look.)
  const fam = topFamily();
  if (fam) return paintGrowth(p, x0, x1, () => y, seed, h, dropW, dropE, fam);
  const r = rngFor(seed, x0, y, 421);
  /** Each crest dome: centre x, rise over the walk line, half width. */
  const domes: Array<[number, number, number]> = [];
  const crestAt = (x: number): number => {
    let t = y;
    for (const [cx, rise, rx] of domes) {
      const u = (x - cx) / rx;
      if (u > -1 && u < 1) t = Math.min(t, y - rise * Math.sqrt(1 - u * u));
    }
    return t;
  };
  if (x1 - x0 < 24) return crestAt;
  const B = BRANCH;
  const [d0, d1] = EDGE.band as [number, number];
  const col = (c: number) => (tint ? lerp3(c, tint.color, tint.k) : c);
  const deep = col(B.walkDeep);
  const body = col(EDGE.bandLow);
  const high = col(EDGE.bandHigh);
  const lit = col(B.walkLit);
  // (It thins toward a wall it meets: no box corner of moss.)
  const endK = (x: number) => 0.5 + 0.5 * smoothstep(0, 40, Math.min(x - x0, x1 - x));
  const depth = (x: number) => {
    const d = lerp(d0, d1, 0.5 + 0.38 * wobble(x, seed + 1, 210) + 0.12 * wobble(x, seed + 2, 47));
    // (Over a free end the band runs round the corner and down.)
    const ew = dropW ? clamp((x0 + 24 - x) / 24, 0, 1) * dropW : 0;
    const ee = dropE ? clamp((x - (x1 - 24)) / 24, 0, 1) * dropE : 0;
    return (d + ew + ee) * endK(x);
  };
  // 1. The body: opaque (a band at 0.85 let the root's grain through as streaks of glass).
  const top: number[] = [];
  const low: number[] = [];
  for (let x = x0; x <= x1 + 0.01; x += 6) {
    top.push(x, y - 1);
    low.push(x, y + depth(x) * 0.7);
  }
  const shape = top.slice();
  for (let k = low.length / 2 - 1; k >= 0; k--) shape.push(low[k * 2] as number, low[k * 2 + 1] as number);
  p.solid(shape, deep, h + 0.12, { moss: 0.85 });
  // 2. The foot: low cushions, each its own size and a step darker, with a seam under it; strands hang from some.
  let x = x0 + range(r, 0, 20);
  while (x < x1 - 8) {
    const rx = range(r, EDGE.footR[0] as number, EDGE.footR[1] as number) * endK(x);
    const ry = rx * range(r, 0.55, 0.85);
    const cy = y + depth(x) * 0.7 + ry * range(r, -0.2, 0.25);
    const sd = seed + Math.round(x);
    p.solid(chaikin(blob(x, cy, rx, ry, sd, 0.22, 14), 1), lerp3(deep, body, range(r, 0.2, 0.6)), h + 0.1, {
      moss: 1,
    });
    p.tint(
      chaikin(blob(x, cy - ry * 0.25, rx * 0.8, ry * 0.6, sd + 1, 0.2, 12), 1),
      body,
      range(r, 0.4, 0.75),
    );
    if (r() < EDGE.strand) {
      // A clump of hanging moss: 1-3 drips from one root, wide at the root, lumpy flanks, a soft end (a ball on a
      // thin stalk read as a lollipop).
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const len = range(r, 20, 72) * (k ? 0.6 : 1);
        const sx = x + range(r, -rx * 0.5, rx * 0.5);
        const sy = cy + ry * 0.4;
        const w0 = range(r, 10, 22) * (k ? 0.7 : 1);
        const sway = range(r, -0.15, 0.15) * len;
        const L: number[] = [];
        const R: number[] = [];
        // (Wide nearly to the end, then a round end: a point read as a thorn, a green icicle.)
        for (let i = 0; i <= 12; i++) {
          const t = i / 12;
          const yy = sy + t * len;
          const cx = sx + sway * t * t;
          const hw =
            (w0 / 2) *
            (1 - t ** 1.8) ** 0.5 *
            (0.75 + 0.25 * (1 - t)) *
            (1 + 0.3 * wobble(yy, sd + k * 7, 14));
          L.push(cx - hw, yy);
          R.push(cx + hw, yy);
        }
        const drip = [...L];
        drip.push(sx + sway, sy + len + w0 * 0.25);
        for (let i = R.length / 2 - 1; i >= 0; i--) drip.push(R[i * 2] as number, R[i * 2 + 1] as number);
        p.solid(drip, lerp3(deep, body, range(r, 0, 0.5)), h + 0.08, { moss: 0.9 });
        // Its lit flank.
        p.tint(
          strand(
            L.slice(0, 16).map((v, i) => (i % 2 ? v : v + 2.5)),
            Math.max(2, w0 * 0.25),
            0.3,
          ),
          high,
          0.5,
        );
      }
    }
    x += rx * range(r, 1.1, 1.8);
  }
  // 2b. Moss is made of small cushions: a stipple of puffs over the body, lighter toward the top, darker low.
  for (let k = 0, n = Math.round(((x1 - x0) * (d0 + d1) * 0.5) / (EDGE.puff as number)); k < n; k++) {
    const px = range(r, x0 + 6, x1 - 6);
    const t = r() ** 1.3;
    const py = y + 4 + t * depth(px) * 0.75;
    const pr = range(r, 4, 11);
    const light = r() < 0.6 - t * 0.5;
    p.solid(
      blob(px, py, pr, pr * 0.8, seed + k, 0.25, 8),
      light ? lerp3(body, high, range(r, 0.3, 0.9)) : lerp3(deep, body, range(r, 0, 0.4)),
      h + 0.14 + (light ? 0.04 : 0),
      { moss: 1 },
      range(r, 0.5, 0.9),
    );
  }
  // 3. The crest: domes along the walk, each a lit cap over a body, a crease between neighbours.
  x = x0 + range(r, 0, 16);
  while (x < x1 - 6) {
    const rx = range(r, EDGE.crestR[0] as number, EDGE.crestR[1] as number) * endK(x);
    const ry = rx * range(r, 0.5, 0.75);
    const rise = range(r, 0.15, 1) * (EDGE.dome as number) * endK(x);
    const cy = y - rise + ry;
    domes.push([x, rise, rx * 0.8]);
    const sd = seed + Math.round(x) * 3;
    p.solid(chaikin(blob(x, cy, rx, ry, sd, 0.18, 14), 1), high, h + 0.24, { moss: 1 });
    // The cap: the upper half, a little toward the light.
    p.solid(
      chaikin(blob(x - rx * 0.08, cy - ry * 0.35, rx * 0.78, ry * 0.5, sd + 1, 0.2, 12), 1),
      lit,
      h + 0.3,
      { moss: 1 },
      range(r, 0.55, 0.9),
    );
    // The crease where it meets the next one.
    const cx = x + rx * 0.95;
    if (cx < x1 - 10)
      p.tint(strand([cx, y - rise * 0.4, cx + 2, y + ry * 0.8, cx - 2, y + ry * 1.5], 4, 0.4), deep, 0.55);
    x += rx * range(r, 1.0, 1.6);
  }
  return crestAt;
}

/**
 * The fringe under a ceiling (y = `key` + the lobes' offset): moss drips (soft, lumpy, a rounded tip, never a spike)
 * and roots, 60-200 px long, one every 40-120 px, of very uneven length.
 */
export function paintFringe(
  p: Paint,
  spec: LobeSpec,
  seed: number,
  run: { key: number; a: number; b: number },
  h: number,
  earth: boolean,
  frost: boolean,
): void {
  const B = BRANCH;
  const { key, a, b } = run;
  const lobes = lobesFor(spec, seed, a, b);
  const r = rngFor(seed, key, a, 431);
  for (
    let x = a + range(r, 10, 60);
    x < b - 16;
    x += range(r, EDGE.fringeGap[0] as number, EDGE.fringeGap[1] as number)
  ) {
    const y0 = key + lobeOffset(spec, lobes, a, b, x) - 6;
    const len =
      lerp(EDGE.fringeLen[0] as number, EDGE.fringeLen[1] as number, r() ** 1.5) *
      (0.4 + 0.6 * hash1(x, seed));
    const k = r();
    if (earth || k < 0.35) {
      // A root: thin, twisting, tapering.
      const bend = range(r, -0.3, 0.3) * len;
      const line = [
        x,
        y0,
        x + bend * 0.3 + range(r, -6, 6),
        y0 + len * 0.4,
        x + bend * 0.7,
        y0 + len * 0.75,
        x + bend,
        y0 + len,
      ];
      const w0 = range(r, 6, 14);
      if (earth) p.solid(strand(line, w0 * 0.7, 0.5), 0x161a22, h - 0.03, { bark: 0.4 });
      else
        paintLimb(
          p,
          lineLimb(line, (t) => Math.max(1.4, w0 * (1 - t) ** 0.9), h - 0.03, seed + Math.round(x), 0.1, 0.3),
        );
      continue;
    }
    // A moss drip: wide at the root, lumpy flanks, narrowing, a rounded drop at the end.
    const w0 = range(r, 14, 30);
    const sway = range(r, -0.12, 0.12) * len;
    const L: number[] = [];
    const R: number[] = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const yy = y0 + t * len;
      const cx = x + sway * t * t;
      const lump = 1 + 0.28 * wobble(yy, seed + Math.round(x), 18);
      const hw =
        (w0 / 2) * (1 - t) ** 0.85 * lump +
        (t > 0.82 ? 3 * Math.sin(((t - 0.82) / 0.18) * Math.PI) : 0) +
        1.5;
      L.push(cx - hw, yy);
      R.push(cx + hw, yy);
    }
    const shape = [...L];
    for (let i = R.length / 2 - 1; i >= 0; i--) shape.push(R[i * 2] as number, R[i * 2 + 1] as number);
    shape.push(x + sway, y0 + len + 4);
    const col = frost ? 0x2c3e50 : B.mossDark;
    p.solid(shape, col, h + 0.02, { moss: 0.9 });
    // Its lit side (the moon from above catches the upper half).
    p.tint(
      strand(
        L.slice(0, Math.round(L.length * 0.6) & ~1).map((v, i) => (i % 2 ? v : v + 3)),
        Math.max(2, w0 * 0.22),
        0.3,
      ),
      frost ? 0x5a7488 : B.mossLit,
      0.55,
    );
  }
}

/** Distance from (x, y) to the nearest of the given axis-aligned runs. */
export function distToRuns(
  x: number,
  y: number,
  runs: ReadonlyArray<{ key: number; a: number; b: number; vertical: boolean }>,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const q of runs) {
    const along = q.vertical ? y : x;
    const across = q.vertical ? x : y;
    const da = along < q.a ? q.a - along : along > q.b ? along - q.b : 0;
    const d = Math.hypot(da, across - q.key);
    if (d < best) best = d;
  }
  return best;
}

export function lerp3(c0: number, c1: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(lerp(ch(c0, s), ch(c1, s), t));
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
