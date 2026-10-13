/**
 * Shape generators for the background forest (sky / far / mid layers). Everything here only adds
 * polygons to a Pixi Graphics; nothing is animated. Shapes are built from noisy ribbons around
 * curves (trunks, roots, branches, vines) and from piles of leaf-shaped polygons (foliage), so
 * no edge is ever a straight line or a perfect ellipse.
 *
 * Conventions: y grows downward. "Toward the light" is the upper right (-KEY_LIGHT.dir).
 */
import type { Graphics } from 'pixi.js';
import { KEY_LIGHT, mix } from './look';

export type Rng = () => number;
export interface Pt {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;
export const rr = (r: Rng, a: number, b: number): number => a + (b - a) * r();
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Unit vector pointing from a surface toward the key light. */
export const TO_LIGHT = { x: -KEY_LIGHT.dirX, y: -KEY_LIGHT.dirY } as const;

/** Smooth 1D value noise in -1..1. */
export function noise1(seed: number): (x: number) => number {
  const h = (i: number): number => {
    const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = h(i);
    return (a + (h(i + 1) - a) * u) * 2 - 1;
  };
}

/** Three octaves of noise1, roughly -1..1. */
export function fbm1(seed: number): (x: number) => number {
  const n = noise1(seed);
  return (x) => (n(x) * 0.57 + n(x * 2.07 + 13.1) * 0.29 + n(x * 4.3 + 71.7) * 0.14) * 1.25;
}

export function quad(p0: Pt, p1: Pt, p2: Pt): (t: number) => Pt {
  return (t) => {
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    return { x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y };
  };
}

function normalAt(center: (t: number) => Pt, t: number): Pt {
  const e = 0.004;
  const a = center(Math.max(0, t - e));
  const b = center(Math.min(1, t + e));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: -dy / l, y: dx / l };
}

/**
 * A closed polygon around a centre line. `half(t, side)` is the half-width on the +normal side
 * (side 1) or the -normal side (side -1); for a line travelling upward +normal is the right.
 */
export function ribbon(
  center: (t: number) => Pt,
  half: (t: number, side: 1 | -1) => number,
  n: number,
  t0 = 0,
  t1 = 1,
): number[] {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const c = center(t);
    const nm = normalAt(center, t);
    const ha = half(t, 1);
    const hb = half(t, -1);
    a.push(c.x + nm.x * ha, c.y + nm.y * ha);
    b.push(c.y - nm.y * hb, c.x - nm.x * hb);
  }
  // b was pushed (y, x) so that reversing the flat array yields (x, y) pairs in reverse order.
  b.reverse();
  return a.concat(b);
}

/** A simple tapered stroke along a curve. */
export function taper(center: (t: number) => Pt, w0: number, w1: number, n = 10): number[] {
  return ribbon(center, (t) => (w0 + (w1 - w0) * t) / 2, n);
}

/** An organic closed blob: an ellipse whose radius wobbles. */
export function blob(cx: number, cy: number, rx: number, ry: number, r: Rng, wobble = 0.2, n = 22): number[] {
  const p1 = r() * TAU;
  const p2 = r() * TAU;
  const p3 = r() * TAU;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k =
      1 + wobble * (Math.sin(a * 2 + p1) * 0.5 + Math.sin(a * 3 + p2) * 0.32 + Math.sin(a * 5 + p3) * 0.22);
    pts.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
  }
  return pts;
}

/** A pointed leaf from its stem end, `len` long toward `ang`. */
export function leafPts(x: number, y: number, ang: number, len: number, wid: number): number[] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const h = wid / 2;
  const out: number[] = [x, y];
  const add = (u: number, v: number): void => {
    out.push(x + (c * u - s * v) * len, y + (s * u + c * v) * len);
  };
  const k = h / len;
  add(0.3, k);
  add(0.66, k * 0.8);
  add(1, 0);
  add(0.66, -k * 0.8);
  add(0.3, -k);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Trunks
// ---------------------------------------------------------------------------------------------

export interface TrunkSpec {
  x: number;
  baseY: number;
  topY: number;
  /** Width a little above the root flare. */
  w: number;
  /** Horizontal shift of the top relative to the base. */
  lean?: number;
  /** Extra half-width at the very base, as a fraction of w. */
  flare?: number;
  /** Height over which the flare dies away, as a fraction of w. */
  flareH?: number;
  /** Width lost by the top, 0..1. */
  taper?: number;
  seed: number;
}

/** A tapered, leaning, root-flared trunk. t runs 0 (base) to 1 (top), u -1 (left) to 1 (right). */
export class Trunk {
  readonly h: number;
  private readonly bend: (x: number) => number;
  private readonly edgeA: (x: number) => number;
  private readonly edgeB: (x: number) => number;
  private readonly lean: number;
  private readonly flare: number;
  private readonly flareH: number;
  private readonly taperK: number;

  constructor(readonly spec: TrunkSpec) {
    this.h = spec.baseY - spec.topY;
    this.bend = fbm1(spec.seed * 1.7 + 3);
    this.edgeA = fbm1(spec.seed * 2.3 + 11);
    this.edgeB = fbm1(spec.seed * 3.1 + 29);
    this.lean = spec.lean ?? 0;
    this.flare = spec.flare ?? 0.55;
    this.flareH = (spec.flareH ?? 0.9) * spec.w;
    this.taperK = spec.taper ?? 0.22;
  }

  center = (t: number): Pt => {
    const s = this.spec;
    return {
      x: s.x + this.lean * t ** 1.35 + this.bend(t * 2.1) * s.w * 0.16 * Math.min(1, t * 3),
      y: s.baseY - this.h * t,
    };
  };

  half = (t: number, side: 1 | -1): number => {
    const s = this.spec;
    const y = t * this.h;
    const base = (s.w / 2) * (1 - this.taperK * t) + s.w * this.flare * Math.exp(-y / this.flareH);
    const e = side === 1 ? this.edgeA : this.edgeB;
    return base * (1 + e(y / (s.w * 0.9)) * 0.1 + e(y / (s.w * 0.23) + 7) * 0.035);
  };

  at(t: number, u: number): Pt {
    const c = this.center(t);
    const nm = normalAt(this.center, t);
    const k = u * this.half(t, u >= 0 ? 1 : -1);
    return { x: c.x + nm.x * k, y: c.y + nm.y * k };
  }

  outline(n = 56): number[] {
    return ribbon(this.center, this.half, n);
  }

  /** The strip between two u fractions (follows the wobbling edges). */
  band(u0: number, u1: number, t0 = 0, t1 = 1, n = 40): number[] {
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      const p = this.at(t, u1);
      const q = this.at(t, u0);
      a.push(p.x, p.y);
      b.push(q.y, q.x);
    }
    b.reverse();
    return a.concat(b);
  }
}

export interface BarkLook {
  base: number;
  lit: number;
  dark: number;
  /** Bark streak count per 100 px of trunk width. */
  streaks: number;
  streakAlpha: number;
  /** Strength of the painted light/shadow bands, 0..1. */
  bands: number;
  /** Long bark grooves per 100 px of trunk width (the detailed layers only). */
  grooves?: number;
}

export function drawTrunk(g: Graphics, tr: Trunk, look: BarkLook, r: Rng): void {
  g.poly(tr.outline()).fill(look.base);
  const b = look.bands;
  if (b > 0) {
    // Many thin washes add up to a soft ramp: a round trunk lit from the upper right.
    for (let k = 0; k < 9; k++)
      g.poly(tr.band(-0.25 + k * 0.125, 1)).fill({ color: look.lit, alpha: 0.06 * b });
    for (let k = 0; k < 7; k++)
      g.poly(tr.band(-1, -0.2 - k * 0.11)).fill({ color: look.dark, alpha: 0.085 * b });
  }
  // Long grooves that follow the trunk's flow, each with a lit ridge beside it.
  const grooves = Math.round((look.grooves ?? 0) * (tr.spec.w / 100));
  for (let i = 0; i < grooves; i++) {
    const u0 = rr(r, -0.9, 0.9);
    const t0 = rr(r, 0, 0.5);
    const len = rr(r, 0.25, 0.75);
    const wd = tr.spec.w * rr(r, 0.008, 0.02);
    const drift = rr(r, -0.1, 0.1);
    const wob = rr(r, 0, 6.28);
    const path =
      (du: number) =>
      (t: number): Pt =>
        tr.at(
          Math.min(1, t0 + len * t),
          Math.max(-0.97, Math.min(0.97, u0 + du + drift * t + Math.sin(t * 9 + wob) * 0.018)),
        );
    const half = (t: number): number => wd * Math.sin(Math.PI * t) ** 0.6 + 0.3;
    g.poly(ribbon(path(0), half, 14)).fill({ color: look.dark, alpha: look.streakAlpha * 1.15 });
    g.poly(ribbon(path(0.035), (t) => half(t) * 0.8, 14)).fill({
      color: look.lit,
      alpha: look.streakAlpha * 0.7,
    });
  }
  const n = Math.round((look.streaks * tr.spec.w) / 100);
  for (let i = 0; i < n; i++) {
    const u0 = rr(r, -0.92, 0.92);
    const t0 = rr(r, 0, 0.85);
    const len = rr(r, 0.06, 0.3);
    const wd = tr.spec.w * rr(r, 0.006, 0.022);
    const drift = rr(r, -0.08, 0.08);
    const light = r() < 0.4 + u0 * 0.3;
    const pts = ribbon(
      (t) => tr.at(Math.min(1, t0 + len * t), Math.max(-0.97, Math.min(0.97, u0 + drift * t))),
      (t) => wd * Math.sin(Math.PI * t) + 0.3,
      8,
    );
    g.poly(pts).fill({ color: light ? look.lit : look.dark, alpha: look.streakAlpha * rr(r, 0.5, 1) });
  }
}

/**
 * Roots spreading from a trunk's base: buttresses that sweep down and along the ground, and
 * (with `arch` > 0) the odd one that bridges the air. They wander, swell into knots, fork and
 * drop rootlets, so none is a clean arc.
 */
export function drawRoots(
  g: Graphics,
  tr: Trunk,
  look: BarkLook,
  r: Rng,
  perSide: number,
  reach = 1.2,
  arch = 0,
  moss?: readonly number[],
): void {
  const s = tr.spec;
  const one = (p0: Pt, p1: Pt, end: Pt, w0: number, dir: 1 | -1, swell: number, depth: number): void => {
    const base = quad(p0, p1, end);
    const wob = fbm1(r() * 1000);
    const knot = fbm1(r() * 1000);
    const len = Math.hypot(end.x - p0.x, end.y - p0.y);
    const amp = Math.min(w0 * 0.55, len * 0.035);
    const c = (t: number): Pt => {
      const p = base(t);
      const k = wob(t * 3.1) * amp * Math.sin(Math.PI * t);
      return { x: p.x + k * 0.4, y: p.y + k };
    };
    const hw = (t: number): number =>
      (w0 / 2) * smooth(-0.02, swell, t) * (1 - 0.93 * t) * (1 + 0.3 * Math.max(0, knot(t * 6.5))) + 1;
    g.poly(ribbon(c, hw, 22)).fill(look.base);
    const up: 1 | -1 = dir === 1 ? -1 : 1;
    if (look.bands > 0) {
      g.poly(ribbon(c, (t, side) => (side === up ? hw(t) * 0.96 : -hw(t) * 0.5), 18, 0.05, 0.95)).fill({
        color: look.lit,
        alpha: 0.22 * look.bands,
      });
      g.poly(ribbon(c, (t, side) => (side === up ? -hw(t) * 0.35 : hw(t) * 0.96), 18, 0.05, 0.95)).fill({
        color: look.dark,
        alpha: 0.3 * look.bands,
      });
    }
    if (depth <= 0) return;
    // A fork, and thin rootlets reaching for the ground.
    if (r() < 0.6) {
      const t = rr(r, 0.35, 0.65);
      const a = c(t);
      const l = len * rr(r, 0.25, 0.5);
      const e = { x: a.x + dir * l * rr(r, 0.5, 1), y: end.y + rr(r, 0, w0 * 0.3) };
      one(a, { x: a.x + dir * l * 0.3, y: (a.y + e.y) / 2 - l * 0.1 }, e, hw(t) * 1.5, dir, 0.15, 0);
    }
    const lets = Math.floor(r() * 4);
    for (let i = 0; i < lets; i++) {
      const t = rr(r, 0.2, 0.9);
      const a = c(t);
      const drop = Math.max(8, end.y - a.y + rr(r, -6, 10));
      if (drop < 14) continue;
      const sw = rr(r, -0.3, 0.3) * drop;
      g.poly(
        taper(
          quad(a, { x: a.x + sw * 0.2, y: a.y + drop * 0.5 }, { x: a.x + sw, y: a.y + drop }),
          hw(t) * 0.5,
          1,
          6,
        ),
      ).fill(look.base);
    }
    if (moss && r() < 0.7) {
      const t = rr(r, 0.2, 0.7);
      const a = c(t);
      mossCurtain(
        g,
        a.x,
        a.y + hw(t) * 0.5,
        w0 * rr(r, 0.6, 1.4),
        w0 * rr(r, 0.8, 2.2),
        r,
        moss,
        Math.max(1.6, w0 / 14),
      );
    }
  };
  for (const dir of [-1, 1] as const) {
    for (let k = 0; k < perSide; k++) {
      const bridge = k === 0 && r() < arch;
      const span = s.w * (bridge ? rr(r, 1.1, 1.9) : rr(r, 0.5, 1.5)) * reach;
      // A bridge that starts high but lands close reads as a fin: keep bridges long and low.
      const h0 = bridge ? Math.min(s.w * rr(r, 0.35, 0.75), span * 0.4) : s.w * rr(r, 0.25, 0.7);
      const t0 = Math.min(0.5, h0 / tr.h);
      // A buttress leaves the trunk tangentially: it starts inside the trunk with no width and
      // runs down along the edge while it swells, then sweeps out along the ground.
      const p0 = tr.at(t0, dir * (bridge ? 0.15 : 0.6));
      const end = { x: s.x + dir * (s.w * 0.55 + span), y: s.baseY + rr(r, 0, s.w * 0.1) };
      const foot = tr.at(t0 * 0.2, dir);
      const p1 = bridge
        ? { x: p0.x + (end.x - p0.x) * rr(r, 0.55, 0.75), y: p0.y - span * rr(r, 0.0, 0.1) }
        : { x: foot.x + dir * span * rr(r, 0.08, 0.2), y: end.y - s.w * rr(r, 0.04, 0.16) };
      const w0 = s.w * (bridge ? rr(r, 0.07, 0.13) : rr(r, 0.12, 0.24));
      one(p0, p1, end, w0, dir, bridge ? 0.3 : 0.7, 1);
    }
  }
}

/** A tapered branch that forks; returns the tips (places to hang foliage). */
export function drawBranch(
  g: Graphics,
  p0: Pt,
  ang: number,
  len: number,
  w: number,
  color: number,
  r: Rng,
  depth = 1,
  tips: Pt[] = [],
): Pt[] {
  const dir = Math.cos(ang) >= 0 ? 1 : -1;
  const a2 = ang - dir * rr(r, 0.15, 0.5);
  const p1 = { x: p0.x + Math.cos(ang) * len * 0.55, y: p0.y + Math.sin(ang) * len * 0.55 + len * 0.08 };
  const p2 = { x: p1.x + Math.cos(a2) * len * 0.5, y: p1.y + Math.sin(a2) * len * 0.5 };
  const c = quad(p0, p1, p2);
  g.poly(taper(c, w, Math.max(1.5, w * 0.18), 10)).fill(color);
  tips.push(p2);
  if (depth > 0) {
    const kids = r() < 0.6 ? 2 : 1;
    for (let i = 0; i < kids; i++) {
      const t = rr(r, 0.35, 0.8);
      drawBranch(
        g,
        c(t),
        a2 + rr(r, -0.9, 0.9),
        len * rr(r, 0.4, 0.65),
        w * (1 - t * 0.7),
        color,
        r,
        depth - 1,
        tips,
      );
    }
  }
  return tips;
}

// ---------------------------------------------------------------------------------------------
// Foliage
// ---------------------------------------------------------------------------------------------

export interface LeafLook {
  /** Deepest interior colour (the core of a mass). */
  core: number;
  dark: number;
  mid: number;
  lit: number;
  /** Rare brightest leaves on the light side. */
  sun: number;
  /** Leaf length in layer px. */
  size: number;
  /** 0..1: how many leaves reach the lit / sun buckets. */
  light: number;
}

/**
 * A mass of leaves, built the way a painter blocks foliage in: a dark core, then a handful of
 * overlapping sub-clumps, each a small round volume of leaf-shaped polygons, the ones facing the
 * key light brighter and drawn last. Leaves point outward and droop.
 */
export function foliageMass(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  r: Rng,
  look: LeafLook,
  density = 1,
  core = true,
): void {
  const m = Math.min(rx, ry);
  if (m < look.size * 3) {
    leafClump(g, cx, cy, rx, ry, r, look, density, 0, core);
    return;
  }
  if (core) g.poly(blob(cx, cy, rx * 0.8, ry * 0.8, r, 0.22)).fill(look.core);
  const n = Math.min(16, 5 + Math.floor((rx * ry) / (look.size * look.size * 55)));
  const subs: Array<{ x: number; y: number; rx: number; ry: number; bias: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    const rad = r() ** 0.6 * 0.82;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const sr = m * rr(r, 0.36, 0.6);
    subs.push({
      x: cx + ca * rx * rad,
      y: cy + sa * ry * rad,
      rx: sr * rr(r, 1, 1.4),
      ry: sr,
      bias: (ca * TO_LIGHT.x + sa * TO_LIGHT.y) * rad * 0.3,
    });
  }
  subs.sort((p, q) => p.bias - q.bias);
  for (const sc of subs) leafClump(g, sc.x, sc.y, sc.rx, sc.ry, r, look, density * 0.8, sc.bias, core);
}

function leafClump(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  r: Rng,
  look: LeafLook,
  density: number,
  bias: number,
  core: boolean,
): void {
  const tone = 0.3 + 0.75 * look.light;
  if (core) {
    g.poly(blob(cx, cy, rx * 0.84, ry * 0.84, r, 0.24, 26)).fill(
      leafRamp(look, clamp01((0.22 + bias) * tone)),
    );
  }
  const n = Math.max(6, Math.round(((density * rx * ry) / (look.size * look.size)) * 5));
  const buckets: number[][][] = Array.from({ length: RAMP }, () => []);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    const rad = r() ** 0.36;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const px = cx + ca * rx * rad;
    const py = cy + sa * ry * rad;
    // Outward, pulled toward straight down (drooping).
    let ang = a + rr(r, -0.8, 0.8);
    ang += Math.sin(Math.PI / 2 - ang) * 0.45;
    const len = look.size * rr(r, 0.6, 1.45);
    // The clump is shaded as one round volume; single leaves only wobble around that.
    const facing = (ca * TO_LIGHT.x + sa * TO_LIGHT.y) * rad;
    let v = (0.5 + 0.42 * facing + bias) * tone + rr(r, -0.09, 0.09);
    if (rad > 0.72 && facing > 0.35) v += 0.2 * look.light * r();
    const bi = Math.max(0, Math.min(RAMP - 1, Math.floor(v * RAMP)));
    (buckets[bi] as number[][]).push(leafPts(px, py, ang, len, len * rr(r, 0.36, 0.56)));
  }
  buckets.forEach((b, i) => {
    if (b.length === 0) return;
    for (const p of b) g.poly(p);
    g.fill(leafRamp(look, i / (RAMP - 1)));
  });
}

const RAMP = 8;

/** The foliage colour ramp: 0 = deep shade, 1 = a leaf in full key light. */
export function leafRamp(look: LeafLook, v: number): number {
  if (v < 0.45) return mix(look.dark, look.mid, v / 0.45);
  if (v < 0.82) return mix(look.mid, look.lit, (v - 0.45) / 0.37);
  return mix(look.lit, look.sun, (v - 0.82) / 0.18);
}

/** A hanging vine from (x, y): a thin drooping stem with small alternating leaves. */
export function vine(
  g: Graphics,
  x: number,
  y: number,
  len: number,
  r: Rng,
  stem: number,
  leafCols: readonly number[],
  leafSize: number,
  thick = 3,
): void {
  const o1 = rr(r, -0.1, 0.1) * len;
  const o2 = o1 + rr(r, -0.08, 0.08) * len;
  const c = quad({ x, y }, { x: x + o1, y: y + len * 0.5 }, { x: x + o2, y: y + len });
  g.poly(taper(c, thick, 0.6, 10)).fill(stem);
  const step = leafSize * 0.8;
  const n = Math.floor(len / step);
  const by: number[][][] = leafCols.map(() => []);
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 0.5);
    const p = c(t);
    const side = i % 2 === 0 ? 1 : -1;
    const l = leafSize * rr(r, 0.6, 1.2) * (1 - t * 0.35);
    const bi = Math.floor(r() * leafCols.length);
    (by[bi] as number[][]).push(leafPts(p.x, p.y, Math.PI / 2 + side * rr(r, 0.45, 1.15), l, l * 0.5));
  }
  by.forEach((b, i) => {
    if (b.length === 0) return;
    for (const p of b) g.poly(p);
    g.fill(leafCols[i] ?? stem);
  });
}

/**
 * Hanging moss: ragged tapering tufts (wide where they cling, wispy at the tip) with a few loose
 * strands, longest in the middle. Reads as drapery, not as a comb.
 */
export function mossCurtain(
  g: Graphics,
  x: number,
  y: number,
  width: number,
  len: number,
  r: Rng,
  cols: readonly number[],
  strand = 2.4,
): void {
  const by: number[][][] = cols.map(() => []);
  const tufts = Math.max(2, Math.round(width / (strand * 5)));
  const tw = (width / tufts) * 0.75;
  for (let i = 0; i < tufts + 3; i++) {
    const loose = i >= tufts;
    const u = rr(r, -1, 1);
    const sx = x + (u * width) / 2;
    const l = len * (1 - u * u * 0.7) * rr(r, 0.25, 1) * (loose ? 1.15 : 1);
    const y0 = y - rr(r, 0, len * 0.12);
    const o = rr(r, -0.1, 0.1) * l;
    const c = quad(
      { x: sx, y: y0 },
      { x: sx + o, y: y0 + l * 0.5 },
      { x: sx + o * rr(r, 0.4, 2), y: y0 + l },
    );
    const w0 = loose ? strand : tw * rr(r, 0.6, 1.3);
    const ph = rr(r, 0, 6.28);
    const half = (t: number): number =>
      loose ? (w0 / 2) * (1 - t * 0.8) : (w0 / 2) * (1 - t) ** 0.8 * (1 + 0.28 * Math.sin(t * 11 + ph)) + 0.4;
    (by[Math.floor(r() * cols.length)] as number[][]).push(ribbon(c, half, loose ? 6 : 10));
  }
  by.forEach((b, i) => {
    if (b.length === 0) return;
    for (const p of b) g.poly(p);
    g.fill(cols[i] ?? 0);
  });
}

/** A fern: fronds fanning from a base, each a curved stem with paired leaflets. */
export function fern(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  r: Rng,
  look: LeafLook,
  fronds = 9,
): void {
  const by: number[][][] = [[], [], [], []];
  for (let f = 0; f < fronds; f++) {
    const ang = -Math.PI / 2 + rr(r, -1.3, 1.3);
    const len = size * rr(r, 0.55, 1.1);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const p0 = { x, y };
    const p1 = { x: x + dx * len * 0.5, y: y + dy * len * 0.62 };
    const p2 = { x: x + dx * len, y: y + dy * len * 0.55 + Math.abs(dx) * len * 0.34 };
    const c = quad(p0, p1, p2);
    const lit = clamp01((dx * TO_LIGHT.x + dy * TO_LIGHT.y) * 0.5 + 0.5 + rr(r, -0.25, 0.25));
    const bi = Math.min(3, Math.floor(lit * (0.3 + look.light * 0.75) * 4));
    const bucket = by[bi] as number[][];
    bucket.push(taper(c, size * 0.022 + 1, 0.6, 8));
    const m = Math.max(6, Math.round(len / (size * 0.075)));
    for (let j = 1; j <= m; j++) {
      const t = 0.1 + (0.9 * j) / (m + 0.3);
      const p = c(t);
      const q = c(Math.min(1, t + 0.02));
      const ta = Math.atan2(q.y - p.y, q.x - p.x);
      const l = len * 0.21 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.75 * (1 - t * 0.45) + 1.5;
      bucket.push(leafPts(p.x, p.y, ta + 1.12, l, l * 0.34));
      bucket.push(leafPts(p.x, p.y, ta - 1.12, l, l * 0.34));
    }
  }
  by.forEach((b, i) => {
    if (b.length === 0) return;
    for (const p of b) g.poly(p);
    g.fill(leafRamp(look, i / 3.4));
  });
}

/** A small mushroom / glow-cap: domed cap on a short curved stem. */
export function mushroom(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  r: Rng,
  cap: number,
  stem: number,
): void {
  const lean = rr(r, -0.3, 0.3) * size;
  const top = { x: x + lean, y: y - size * rr(r, 0.9, 1.6) };
  g.poly(
    taper(quad({ x, y }, { x: x + lean * 0.2, y: (y + top.y) / 2 }, top), size * 0.2, size * 0.14, 6),
  ).fill(stem);
  const rx = size * rr(r, 0.42, 0.62);
  const ry = size * rr(r, 0.3, 0.42);
  const pts: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    pts.push(top.x + Math.cos(a) * rx, top.y + Math.sin(a) * ry + ry * 0.25);
  }
  pts.push(top.x + rx * 0.6, top.y + ry * 0.42, top.x - rx * 0.6, top.y + ry * 0.42);
  g.poly(pts).fill(cap);
}

// ---------------------------------------------------------------------------------------------
// Painted foliage clumps
// ---------------------------------------------------------------------------------------------

/** Where shapes lay down soft painted light (bg-bake's LightMap). */
export interface Lights {
  lit(x: number, y: number, rx: number, ry: number, amount: number): void;
  shade(x: number, y: number, rx: number, ry: number, amount: number): void;
  reset(x: number, y: number, rx: number, ry: number, amount?: number): void;
}

export interface ClumpOpts {
  /** Leaf size multiplier for this clump. */
  leaf?: number;
  /** How strongly the key light reaches it, 0..1.5. */
  light?: number;
  /** Colour accent: autumn leaves or small blossoms on the lit side. */
  accent?: 'amber' | 'blossom' | null;
  accentColor?: number;
  /** Leaf detail, 0..1 (tiers that are mostly hidden need little). */
  detail?: number;
}

/**
 * A foliage clump blocked in the way a painter would: a lumpy dark silhouette of overlapping
 * lobes, a lighter body on each lobe shifted toward the key, soft light and shadow in the light
 * map, and leaf shapes only where they matter: a ragged fringe on the silhouette, a sparse
 * scatter on the lit side, and small bright translucent leaves on the rim that faces the light.
 */
export function clump(
  g: Graphics,
  L: Lights,
  cx: number,
  cy: number,
  r: number,
  look: LeafLook,
  rnd: Rng,
  o: ClumpOpts = {},
): void {
  const ls = look.size * (o.leaf ?? 1);
  const light = (o.light ?? 1) * (0.35 + look.light);
  const detail = o.detail ?? 1;
  const lobes: Array<{ x: number; y: number; r: number; f: number }> = [
    { x: cx, y: cy, r: r * 0.74, f: 0.5 },
  ];
  const n = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    // Mostly over the upper half: a cauliflower top and a ragged, flatter underside.
    const a = -Math.PI * rr(rnd, -0.12, 1.12);
    const d = r * rr(rnd, 0.42, 0.8);
    const f = 0.5 + 0.45 * (Math.cos(a) * TO_LIGHT.x + Math.sin(a) * TO_LIGHT.y);
    lobes.push({
      x: cx + Math.cos(a) * d * 1.2,
      y: cy + Math.sin(a) * d * 0.78,
      r: r * rr(rnd, 0.3, 0.55),
      f,
    });
  }
  for (const l of lobes) g.poly(blob(l.x, l.y, l.r * 1.06, l.r * 0.92, rnd, 0.22, 20));
  g.fill(look.core);
  L.reset(cx, cy, r * 1.3, r * 1.15);
  L.shade(cx - TO_LIGHT.x * r * 0.35, cy - TO_LIGHT.y * r * 0.5, r * 1.2, r * 0.8, 0.7);
  L.lit(cx + TO_LIGHT.x * r * 0.4, cy + TO_LIGHT.y * r * 0.5, r * 1.05, r * 0.8, 0.72 * light);
  lobes.sort((p, q) => p.f - q.f);
  for (const l of lobes) {
    const sx = l.x + TO_LIGHT.x * l.r * 0.2;
    const sy = l.y + TO_LIGHT.y * l.r * 0.2;
    g.poly(blob(sx, sy, l.r * 0.86, l.r * 0.76, rnd, 0.2, 18)).fill(leafRamp(look, 0.12 + 0.3 * l.f));
    L.shade(l.x - TO_LIGHT.x * l.r * 0.55, l.y - TO_LIGHT.y * l.r * 0.6, l.r * 0.8, l.r * 0.65, 0.4);
    const k = (0.04 + 0.34 * l.f) * light;
    L.lit(l.x + TO_LIGHT.x * l.r * 0.45, l.y + TO_LIGHT.y * l.r * 0.5, l.r * 0.8, l.r * 0.6, k);
  }
  const amber = o.accent === 'amber';
  const cols = amber
    ? { ...look, lit: mix(look.lit, o.accentColor ?? 0xd9a04a, 0.7), sun: o.accentColor ?? 0xe8b75a }
    : look;
  const buckets: number[][][] = Array.from({ length: RAMP }, () => []);
  const sunLeaves: number[][] = [];
  const dots: number[] = [];
  const put = (v: number, pts: number[]): void => {
    (buckets[Math.max(0, Math.min(RAMP - 1, Math.floor(v * RAMP)))] as number[][]).push(pts);
  };
  for (const l of lobes) {
    const fringe = Math.round(((TAU * l.r) / ls) * 1.25 * (0.4 + 0.6 * detail));
    for (let i = 0; i < fringe; i++) {
      const a = rnd() * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rad = rr(rnd, 0.8, 1.04);
      const px = l.x + ca * l.r * rad;
      const py = l.y + sa * l.r * 0.9 * rad;
      let ang = a + rr(rnd, -0.7, 0.7);
      ang += Math.sin(Math.PI / 2 - ang) * 0.4;
      const len = ls * rr(rnd, 0.55, 1.7);
      const f = 0.5 + 0.5 * (ca * TO_LIGHT.x + sa * TO_LIGHT.y);
      const wid = len * rr(rnd, 0.36, 0.56);
      const sunny = f > 0.7 && l.f > 0.5 && rnd() < 0.3 * light * detail;
      if (sunny) sunLeaves.push(leafPts(px, py, ang, len * 0.7, wid * 0.7));
      else
        put(
          (0.14 + 0.5 * f * l.f + rr(rnd, -0.07, 0.07)) * (0.6 + 0.5 * light),
          leafPts(px, py, ang, len, wid),
        );
      if (o.accent === 'blossom' && f > 0.45 && rnd() < 0.3)
        dots.push(px + ca * len * 0.3, py + sa * len * 0.3);
    }
    // A sparse scatter inside, thinning out toward the shadow side.
    const inner = Math.round((l.r / ls) ** 2 * 1.1 * detail);
    for (let i = 0; i < inner; i++) {
      const a = rnd() * TAU;
      const rad = Math.sqrt(rnd()) * 0.8;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const f = 0.5 + 0.5 * (ca * TO_LIGHT.x + sa * TO_LIGHT.y) * rad;
      if (rnd() > 0.25 + 0.75 * f * (0.4 + l.f)) continue;
      const len = ls * rr(rnd, 0.45, 1.1);
      put(
        (0.2 + 0.45 * f * (0.5 + l.f) + rr(rnd, -0.06, 0.06)) * (0.6 + 0.5 * light),
        leafPts(l.x + ca * l.r * rad, l.y + sa * l.r * rad * 0.9, a + rr(rnd, -1, 1) + 0.6, len, len * 0.5),
      );
    }
  }
  buckets.forEach((b, i) => {
    if (b.length === 0) return;
    for (const p of b) g.poly(p);
    g.fill(leafRamp(cols, i / (RAMP - 1)));
  });
  if (sunLeaves.length > 0) {
    for (const p of sunLeaves) g.poly(p);
    g.fill({ color: mix(cols.lit, cols.sun, 0.6), alpha: 0.85 });
  }
  if (dots.length > 0) {
    for (let i = 0; i < dots.length; i += 2)
      g.circle(dots[i] ?? 0, dots[i + 1] ?? 0, ls * rr(rnd, 0.14, 0.26));
    g.fill(o.accentColor ?? 0xd9c2ff);
  }
}
