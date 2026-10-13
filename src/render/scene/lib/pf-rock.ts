/**
 * Painted stone: rounded, weathered masses for the terrain bake (boulders, set stones, props, the
 * rocks in floating islands). A rock is never a polygon with flat facets: its outline is a lumpy
 * superellipse, its relief is a real dome (nested shells of rising height, so the bake's light
 * turns over it softly), a few shoulders give it soft plane changes, cracks are cut below the
 * surface, moss sits in the hollows and the base is heavy and dark.
 */
import { mix } from './look';
import type { Paint } from './pf-paint';
import { blob, chaikin, clamp, hash1, noise1, range, ribbon, rngFor, wander, wobble } from './pf-shape';

export interface RockMoss {
  dark: number;
  body: number;
  /** 0..1: how much of it. */
  amount: number;
  /** Relief `moss` flag (lower in the back plane so it does not light up). */
  flag?: number;
}

export interface RockOpts {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  seed: number;
  /** Local colour, and the tone of cracks and of the heavy base. */
  color: number;
  dark: number;
  /** Lighter tone for the shoulders that face up (defaults to a small lift of `color`). */
  light?: number;
  /** Relief at the rim and how much it gains to the crown. Keep `h + rise` < 0.35 in the back plane. */
  h: number;
  rise: number;
  /** Points below this y are pressed onto it: a base sunk in the ground. */
  baseY?: number;
  /** Nothing rises above this y: cut flush under a walkable top. */
  topY?: number;
  /** Shoulders beyond this x range are pulled most of the way back in. */
  spanX?: readonly [number, number];
  tilt?: number;
  /** 0..1.5: how lumpy the outline is. */
  rough?: number;
  /** How much flatter and wider the underside is than the top (1 = symmetric). */
  squat?: number;
  /** Superellipse power: 2 = ellipse, 3 = square shoulders. Default 2.5-3.2 by seed. */
  boxy?: number;
  moss?: RockMoss;
  cracks?: number;
  /** 0..1: strength of the dark wash over the lower half. */
  ground?: number;
  alpha?: number;
}

/** The outline of a rock: shoulders rather than an ellipse, lumps at three scales, a heavy base. */
export function rockOutline(o: RockOpts, scale = 1, ox = 0, oy = 0): number[] {
  const n = clamp(Math.round((o.rx + o.ry) / 4.5), 18, 46);
  const rough = o.rough ?? 1;
  const squat = o.squat ?? 0.82;
  const p1 = hash1(o.seed, 1) * 6.283;
  const p2 = hash1(o.seed, 2) * 6.283;
  const p3 = hash1(o.seed, 3) * 6.283;
  const cs = Math.cos(o.tilt ?? 0);
  const sn = Math.sin(o.tilt ?? 0);
  const e = 2 / (o.boxy ?? 2.5 + hash1(o.seed, 4) * 0.7);
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const ux = Math.sign(ca) * Math.abs(ca) ** e;
    const uy = Math.sign(sa) * Math.abs(sa) ** e;
    const k =
      1 +
      rough *
        (0.13 * Math.sin(2 * a + p1) +
          0.09 * Math.sin(3 * a + p2) +
          0.05 * Math.sin(5 * a + p3) +
          0.05 * noise1(i * 0.83, o.seed));
    const px = ux * o.rx * k * (sa > 0 ? 1 + (1 - squat) * 0.4 : 1) * scale;
    const py = uy * o.ry * k * (sa > 0 ? squat : 1) * scale;
    let x = o.cx + ox + px * cs - py * sn;
    let y = o.cy + oy + px * sn + py * cs;
    if (o.baseY !== undefined && y > o.baseY) {
      y = o.baseY;
      x += (x - o.cx) * 0.04;
    }
    if (o.topY !== undefined) y = Math.max(y, o.topY + (scale < 1 ? (1 - scale) * 14 : 0));
    if (o.spanX) {
      if (x < o.spanX[0]) x = o.spanX[0] - (o.spanX[0] - x) * 0.3;
      if (x > o.spanX[1]) x = o.spanX[1] + (x - o.spanX[1]) * 0.3;
    }
    pts.push(x, y);
  }
  return chaikin(pts, 1);
}

/** Height shells over any outline: scales it about (cx, cy) in `layers` steps up to `h + rise`. */
export function dome(
  p: Paint,
  outline: number[],
  cx: number,
  cy: number,
  h: number,
  rise: number,
  layers: number,
  o: { moss?: number; bark?: number; alpha?: number; inner?: number } = {},
): void {
  const inner = o.inner ?? 0.22;
  for (let k = 1; k <= layers; k++) {
    const u = k / layers;
    const s = 1 - (1 - inner) * u ** 1.15;
    const pts: number[] = [];
    for (let i = 0; i < outline.length; i += 2) {
      pts.push(cx + ((outline[i] as number) - cx) * s, cy + ((outline[i + 1] as number) - cy) * s);
    }
    p.bump(pts, h + rise * Math.sin((u * Math.PI) / 2), {
      alpha: o.alpha ?? 1,
      ...(o.moss !== undefined ? { moss: o.moss } : {}),
      ...(o.bark !== undefined ? { bark: o.bark } : {}),
    });
  }
}

/** Paints one rock. Returns its outline. */
export function paintRock(p: Paint, o: RockOpts): number[] {
  const r = rngFor(o.seed, o.cx, 7);
  const alpha = o.alpha ?? 1;
  const light = o.light ?? mix(o.color, 0x9fb6b0, 0.16);
  const size = Math.min(o.rx, o.ry);
  const outline = rockOutline(o);
  const ccx = o.cx - o.rx * 0.06;
  const ccy = o.cy - o.ry * 0.12;
  p.solid(outline, o.color, o.h, {}, alpha);
  // The dome: shells a few px apart so the lit pass sees one smooth turn, not terraces.
  const layers = clamp(Math.round(size / 6), 3, 9);
  dome(p, outline, ccx, ccy, o.h, o.rise, layers);

  // Shoulders: two to four smaller swells that overlap, each a soft change of plane and of tone.
  const nSh = size < 16 ? 1 : size > 44 ? 4 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2.6);
  for (let i = 0; i < nSh; i++) {
    const a = -Math.PI / 2 + range(r, -1.5, 1.5);
    const d = range(r, 0.2, 0.55);
    const sx = o.cx + Math.cos(a) * o.rx * d;
    const sy = o.cy + Math.sin(a) * o.ry * d * 0.9;
    const sub: RockOpts = {
      ...o,
      cx: sx,
      cy: sy,
      rx: o.rx * range(r, 0.34, 0.56),
      ry: o.ry * range(r, 0.3, 0.5),
      seed: o.seed + 11 + i * 7,
      tilt: range(r, -0.5, 0.5),
      rough: 0.8,
    };
    const so = rockOutline(sub);
    const up = Math.sin(a) < -0.3;
    p.tint(so, up ? light : mix(o.color, o.dark, 0.3), up ? 0.42 * alpha : 0.2 * alpha);
    dome(p, so, sx, sy, o.h + o.rise * 0.72, o.rise * 0.5, clamp(Math.round(size / 12), 2, 4), {
      alpha: 0.7,
    });
  }

  // Weather: faint pale streaks down from the crown and a mottling of lichen.
  const nSt = Math.round(o.rx / 18);
  for (let i = 0; i < nSt; i++) {
    const sx = o.cx + range(r, -0.7, 0.7) * o.rx;
    const sy = o.cy - o.ry * range(r, 0.1, 0.6);
    const len = o.ry * range(r, 0.4, 0.9);
    p.tint(
      ribbon(
        wander(
          [sx, sy, sx + range(r, -3, 3), sy + len * 0.5, sx + range(r, -5, 5), sy + len],
          2,
          o.seed + i,
          18,
        ),
        (t) => (1.5 + size * 0.05) * Math.sin(Math.PI * clamp(t, 0.05, 0.95)) + 0.5,
      ),
      r() < 0.5 ? light : o.dark,
      0.22 * alpha,
    );
  }
  for (let i = 0; i < Math.round(size / 9); i++) {
    const a = range(r, 0, 6.283);
    const d = range(r, 0.15, 0.75);
    const lr = range(r, 1.6, 2.4 + size * 0.05);
    p.tint(
      blob(
        o.cx + Math.cos(a) * o.rx * d,
        o.cy + Math.sin(a) * o.ry * d * 0.8,
        lr * 1.3,
        lr,
        o.seed + i,
        0.4,
        9,
      ),
      mix(light, 0xa8b89a, 0.3),
      0.2 * alpha,
    );
  }

  // Cracks, cut below the surface so the bake reads them as crevices.
  const nCr = o.cracks ?? (size > 26 ? 1 + Math.floor(r() * 2) : size > 14 ? 1 : 0);
  for (let i = 0; i < nCr; i++) {
    const a = -Math.PI / 2 + range(r, -1.1, 1.1);
    const x0 = o.cx + Math.cos(a) * o.rx * 0.86;
    const y0 = o.cy + Math.sin(a) * o.ry * 0.86;
    const x1 = x0 + range(r, -0.35, 0.35) * o.rx;
    const y1 = y0 + range(r, 0.5, 1.1) * o.ry;
    const mx = (x0 + x1) / 2 + range(r, -0.16, 0.16) * o.rx;
    const line = wander(
      [x0, y0, mx, (y0 + y1) / 2, (mx + x1) / 2, y0 * 0.25 + y1 * 0.75, x1, y1],
      size * 0.09,
      o.seed + 40 + i,
      9,
    );
    const fine: number[] = [];
    for (let k = 0; k < line.length - 2; k += 2) {
      for (let q = 0; q < 4; q++) {
        const t = q / 4;
        fine.push(
          (line[k] as number) * (1 - t) +
            (line[k + 2] as number) * t +
            wobble(k * 9 + q * 5, o.seed + i, 3) * 1.6,
          (line[k + 1] as number) * (1 - t) + (line[k + 3] as number) * t,
        );
      }
    }
    fine.push(line[line.length - 2] as number, line[line.length - 1] as number);
    const w0 = 1.1 + size * 0.018;
    const shape = ribbon(fine, (t) => w0 * (1 - t) ** 0.6 + 0.35);
    p.tint(shape, o.dark, 0.75 * alpha);
    p.bump(shape, Math.max(0, o.h - 0.1));
    if (o.moss && r() < o.moss.amount) {
      p.solid(
        blob(x0 * 0.8 + o.cx * 0.2, y0 * 0.8 + o.cy * 0.2 + 2, size * 0.16, size * 0.11, o.seed + i, 0.4, 10),
        o.moss.dark,
        o.h + o.rise * 0.8,
        { moss: o.moss.flag ?? 1 },
        0.9 * alpha,
      );
    }
  }

  // Heavy base: the lower half sinks toward the ground tone in three soft steps.
  const ground = o.ground ?? 0.7;
  if (ground > 0) {
    for (let k = 0; k < 3; k++) {
      const yb = o.cy + o.ry * (-0.05 + k * 0.24);
      const band: number[] = [];
      for (let x = o.cx - o.rx * 1.4; x <= o.cx + o.rx * 1.4; x += 9)
        band.push(x, yb + wobble(x, o.seed + 60 + k, 34) * o.ry * 0.14);
      band.push(o.cx + o.rx * 1.4, o.cy + o.ry * 2, o.cx - o.rx * 1.4, o.cy + o.ry * 2);
      p.tint(band, o.dark, 0.24 * ground * alpha);
    }
  }

  // Moss: a cushion over the crown that runs further down one side, pads in the hollows.
  const m = o.moss;
  if (m && m.amount > 0) {
    const flag = m.flag ?? 1;
    const side = r() < 0.5 ? -1 : 1;
    const top: number[] = [];
    const span = 0.3 + 0.5 * m.amount;
    const n = outline.length / 2;
    // The crown points of the outline, from the left shoulder over to the right.
    const crown: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const x = outline[i * 2] as number;
      const y = outline[i * 2 + 1] as number;
      if (y < o.cy - o.ry * 0.1 && Math.abs(x - (o.cx + side * o.rx * 0.2)) < o.rx * span) crown.push([x, y]);
    }
    crown.sort((a, b) => a[0] - b[0]);
    for (const [x, y] of crown) top.push(x, y + 2.5);
    if (top.length >= 6) {
      const th = (t: number): number =>
        (size * 0.13 + 2.5) *
          (0.5 + Math.max(0, wobble(t * 140, o.seed + 80, 30))) *
          Math.sin(Math.PI * t) ** 0.5 +
        size * 0.2 * Math.exp(-(((t - (side > 0 ? 0.85 : 0.15)) / 0.2) ** 2));
      const hm = o.h + o.rise * 0.9;
      p.solid(
        ribbon(top, (t) => th(t) * 1.5 + 1.5),
        m.dark,
        hm,
        { moss: flag },
        alpha,
      );
      p.solid(
        ribbon(
          top.map((v, j) => (j % 2 ? v - 1.5 : v)),
          (t) => th(t) * 0.75 + 0.8,
        ),
        m.body,
        hm + 0.03,
        { moss: flag },
        alpha,
      );
    }
    const pads = Math.round(size * 0.08 * m.amount + r());
    for (let i = 0; i < pads; i++) {
      const a = range(r, 0.3, 2.84);
      const px = o.cx + Math.cos(a) * o.rx * range(r, 0.5, 0.92);
      const py = o.cy + Math.sin(a) * o.ry * range(r, 0.2, 0.7);
      const pr = range(r, 3, 4 + size * 0.14);
      p.solid(
        blob(px, py, pr * 1.5, pr, o.seed + 90 + i, 0.35, 11),
        m.dark,
        o.h + o.rise * 0.6,
        { moss: flag },
        0.85 * alpha,
      );
      p.solid(
        blob(px, py - 1, pr * 0.9, pr * 0.55, o.seed + 91 + i, 0.35, 9),
        m.body,
        o.h + o.rise * 0.65,
        { moss: flag },
        0.8 * alpha,
      );
    }
  }
  return outline;
}

/**
 * Adjusts a rock that is cut flush under a walkable top so the flat cut spans x0..x1: the top is
 * as wide as the collision and the shoulders round away below it.
 */
export function fitUnderTop(o: RockOpts, x0: number, x1: number): RockOpts {
  let fit = { ...o };
  const topY = o.topY ?? o.cy;
  for (let pass = 0; pass < 3; pass++) {
    const { topY: _cut, ...free } = fit;
    const pts = rockOutline(free);
    let a = Infinity;
    let b = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      if ((pts[i + 1] as number) <= topY + 1) {
        a = Math.min(a, pts[i] as number);
        b = Math.max(b, pts[i] as number);
      }
    }
    if (!(b > a)) break;
    const k = (x1 - x0) / (b - a);
    fit = { ...fit, rx: fit.rx * k, cx: fit.cx + ((x0 + x1) / 2 - (a + b) / 2) * k };
  }
  return fit;
}
