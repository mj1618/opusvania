/**
 * The wood kit's playfield (rooms with `art.kit: 'wood'`): old living limbs high in the trees at night,
 * painted from the room's tree and stretch marks (`marks.trees`, `marks.stretches`) over its rects.
 *
 *   trees      great trunks (`west` is the solid one at the room's edge; others stand in the walk plane
 *              and she passes in front of them); a round collar wraps every limb that grows out of one
 *   stretches  each is ONE limb over a run of rolling rects: its top is a smooth curve through their
 *              tops, its thickness tapers from its root (`from`, `grows`) and swells at joins. Ends:
 *              burl (the next abuts higher), knee (abuts lower), fork (the limb dips into a crotch under
 *              the gap: one tine rises into the next stretch, one goes on down into the mist), snap (a
 *              broken end facing another tree's limb), nub (a blunt outer end), tip (thins into a twiggy
 *              tangle over the canopy she drops into)
 *
 * Nothing floats and nothing props anything up. The far branch is the backdrop's (`marks.farBranch`).
 * Structure, knobs and gotchas: memory/playfield.md, "The wood: the hatching branch".
 */

import type { Room } from '../../../scene/room';
import type { SolidRect } from '../../../sim/scene';
import { mix } from './look';
import type { BakeLook, MistFill } from './pf-bake';
import { paintBacks, paintMasses } from './pf-mass';
import { Paint } from './pf-paint';
import { blob, chaikin, clamp, cubic, lerp, quad, range, rngFor, smoothstep, wobble } from './pf-shape';
import type { TerrainInfo } from './pf-terrain';

export const BRANCH = {
  /** Out of a tree a limb starts at this share of the trunk's width (clamped); out of a fork each tine
   *  keeps `forkShare` of what the parent has left. */
  rootShare: 0.55,
  rootMin: 80,
  rootMax: 122,
  forkShare: 0.82,
  /** Along the cocoon row the limb keeps this share of its thickness (the cocoons hang from a thinner
   *  limb, against the fog), easing back over `cocoonFade` px either side. */
  cocoonThin: 0.7,
  cocoonFade: 200,
  /** Along the row the underside runs this far above the cocoons' hang points (they hang on silk), px. */
  cocoonSilk: 16,
  /** The climb face at the cocoon row: a little moonlight on the mid flank, a fog-light rim underneath. */
  climbLift: 0.14,
  climbRim: 0x3a5470,
  /** A dip fork sags this far under the lower walk line plus the limb's thickness, px. */
  dipBelow: 110,
  /** A dip leaves the parent's underside / joins the child's this far in from the walk's ends, px. */
  dipIn: 150,
  /** A decor tree (no collision) a step behind the walk: its relief, and the haze laid over it. */
  decorH: 0.4,
  decorHaze: 0x14223a,
  decorHazeA: 0.32,
  /** A trunk's collar round a limb's root, px. */
  collar: 46,
  /** A trunk that ends in view: how much it narrows toward its broken top, how far it leans (share of its
   *  width), and how many limbs droop from under the break. */
  trunkTaper: 0.3,
  trunkLean: 0.35,
  droopLimbs: 5,
  /** Swell and pinch along the limb: share of the thickness at ~420 px and ~120 px. */
  swell: 0.2,
  ripple: 0.07,
  /** The base flare into the trunk: extra px of underside and its falloff. */
  flare: 140,
  flareFall: 90,
  /** The painted top: [bias, slow roll, fast roll] px (+ = down) round the flat collision top, and over
   *  the last `endRound` px of a free end it rounds away by up to `endDrop`. */
  roll: [1.8, 2.2, 1.2] as readonly number[],
  /** A slow roll of the painted top over the collision, px (render only), and bark bumps on it. */
  rollBig: 6,
  bumpGap: [160, 420] as readonly number[],
  bumpLift: [3, 6] as readonly number[],
  endRound: 26,
  endDrop: 12,
  /** Moss tufts that break the line: gap between them and how far they rise over it, px. */
  tuftGap: [80, 240] as readonly number[],
  tuftLift: [5, 11] as readonly number[],
  /** The far branch's tip past its rect, px. */
  tipExt: 40,
  /** The burl's belly swells this far below the limb, px; the knee's shoulder radius, px. */
  burlSwell: 26,
  kneeRound: 44,
  /** Lumps on the underside: one every this many px (range), and their depth (px). */
  lumpGap: [180, 520] as readonly number[],
  lumpDepth: [6, 26] as readonly number[],
  /** The canopy tangle at the end: leaf clumps and twisted limbs. */
  canopyClumps: 44,
  /** How deep under the end the tangle reaches (it thins out into the dark below), px. */
  canopyDepth: 760,
  tangleLimbs: 0,
  /** Relief heights: the walk plane and the back plane (barely lit: reads as behind). */
  walkH: 0.56,
  backH: 0.22,
  /** Albedo before the bake (the bake multiplies by light; see WOOD_BAKE). */
  bark: 0x23303c,
  barkLit: 0x5a7282,
  barkDark: 0x0c151e,
  barkDeep: 0x05090f,
  /** Algae-green bark near the moss, grey bark lower down (big soft patches). */
  barkGreen: 0x1d3330,
  barkGrey: 0x2b3640,
  moss: 0x1c2a29,
  mossLit: 0x3a4a48,
  mossDark: 0x0c1617,
  lichen: [0x5f7672, 0x6f7f7a, 0x52686a] as readonly number[],
  silk: 0xb6c0c8,
  /** The mist the dives sink into (`#1f3550` fog of the look target) and how much of it at the bottom. */
  mist: 0x1f3550,
  mistAmount: 0.85,
  /** The canopy the branch ends in; pale torn wood on a snapped end. */
  leafDark: 0x08171a,
  wood: 0x343f45,
} as const;

/**
 * The bake's look for the wood: a cool silver moon from above, broad (the branch is over the
 * canopy, open to the sky) and broken by leaf-shade dapples, no warm anywhere.
 */
export const WOOD_BAKE: BakeLook = {
  key: 'vec3(0.66, 0.8, 0.98)',
  mossKey: 'vec3(0.7, 0.78, 0.82)',
  sun: 'clamp(0.4 + 0.36 * dapple + 0.1 * beam, 0.0, 1.0)',
  zone: 'vec3(0.86, 0.95, 1.06)',
  sky: 'vec3(0.32, 0.5, 0.8)',
  interior: '0.66',
  // The walk's moss keeps the moon on its rim; bark (descending limbs, snaps, twigs) keeps far less, so
  // the brightest wood in the playfield is always the wood she walks on.
  rimScale: ' * mix(0.16, 1.0, moss)',
  chipScale: ' * 0.15',
  keyScale: ' * mix(0.55, 1.0, moss)',
};

/** A painted limb: a centre line, a full width per point, a relief height and what grows on it. */
export interface Limb {
  pts: number[];
  w: number[];
  h: number;
  seed: number;
  /** 0..1: moss along its upper side (walk stretches have their own blanket). */
  moss: number;
  /** 0..1: lichen, knots and furrows. */
  detail: number;
}

/**
 * How a stretch's end meets the world. Root ends: `trunk` (grows out of a tree), `burl` / `under` (out
 * of the stretch it abuts), `crotch` (out of a fork in its parent, rising from below). Far ends: `burl`
 * / `knee` (the next stretch abuts it), `fork` (the limb dips and splits: one tine rises into the next
 * stretch, one goes on down), `snap` (broken), `nub` (a blunt natural end), `tip` (thins into twigs).
 */
export type End = 'trunk' | 'burl' | 'knee' | 'under' | 'crotch' | 'fork' | 'snap' | 'nub' | 'tip';

/** One stretch of the walk (a run of rolling rects) as one limb. */
export interface Stretch {
  id: string;
  /** The first rect (seeds, collision height). */
  s: SolidRect;
  x0: number;
  x1: number;
  /** The collision top at x0. */
  y: number;
  /** The rects' tops, west to east. */
  rects: Array<{ x0: number; x1: number; top: number }>;
  west: End;
  east: End;
  /** +1 grows east (the root is at x0), -1 grows west. */
  grows: 1 | -1;
  parent: string;
  from: [number, number];
  /** Vertical thickness at x (the underside is top + th(x), before lumps). */
  th: (x: number) => number;
  /** The painted underside at x, lumps included. */
  under: (x: number) => number;
  /** The painted bark top at x: a smooth curve through the rolling collision tops. */
  top: (x: number) => number;
  /** Always false now (the far branch is the backdrop's); kept for the growth and rim checks. */
  far: boolean;
  /** Across a gap: the stretch on that side, and how much lower (+) it is. */
  nbW?: Stretch;
  nbE?: Stretch;
  reachW: number;
  reachE: number;
  /** Thickness at the root and at the far end. */
  thRoot: number;
  thEnd: number;
}

/** What the growth and the live rim read. */
export interface BranchPlan {
  stretches: Stretch[];
  /** Twig ends (leaf sprigs grow here): position, direction (radians), size 0..1, back plane. */
  sprigs: Array<{ x: number; y: number; a: number; size: number; deep?: boolean }>;
  /** Undersides things hang from: x range and y(x); `deep` ones are in the back plane. */
  hangs: Array<{ x0: number; x1: number; y: (x: number) => number; deep: boolean; reach: number }>;
  /** Places nothing tall grows or hangs (cocoons' threads, Tatter): x, half width, top y. */
  clear: Array<{ x: number; r: number; y: number }>;
  /** Cocoon hang points (silk pads), from the room's marks. */
  cocoons: Array<{ x: number; y: number }>;
  /** Leaf clumps of the canopy at the end (centre, radii), back to front. */
  clumps: Array<{ x: number; y: number; rx: number; ry: number }>;
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers

/** Unit normal pointing to the left of travel (down for a line going east), at point i. */
function normal(pts: number[], i: number): [number, number] {
  const n = pts.length / 2;
  const a = Math.max(0, i - 1);
  const b = Math.min(n - 1, i + 1);
  const dx = (pts[b * 2] as number) - (pts[a * 2] as number);
  const dy = (pts[b * 2 + 1] as number) - (pts[a * 2 + 1] as number);
  const l = Math.hypot(dx, dy) || 1;
  return [-dy / l, dx / l];
}

/** The polygon of the band v0..v1 of a limb's width (-0.5 top, 0.5 bottom), points i0..i1. */
function band(L: Limb, v0 = -0.5, v1 = 0.5, i0 = 0, i1 = L.pts.length / 2 - 1): number[] {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = i0; i <= i1; i++) {
    const [nx, ny] = normal(L.pts, i);
    const w = L.w[i] as number;
    const x = L.pts[i * 2] as number;
    const y = L.pts[i * 2 + 1] as number;
    a.push(x + nx * v0 * w, y + ny * v0 * w);
    b.push(x + nx * v1 * w, y + ny * v1 * w);
  }
  for (let i = b.length / 2 - 1; i >= 0; i--) a.push(b[i * 2] as number, b[i * 2 + 1] as number);
  return a;
}

/** A line across a limb at relative offset v(i) (-0.5 top .. 0.5 bottom). */
function along(L: Limb, v: (i: number) => number, i0: number, i1: number): number[] {
  const out: number[] = [];
  for (let i = i0; i <= i1; i++) {
    const [nx, ny] = normal(L.pts, i);
    const w = L.w[i] as number;
    out.push((L.pts[i * 2] as number) + nx * v(i) * w, (L.pts[i * 2 + 1] as number) + ny * v(i) * w);
  }
  return out;
}

/** A thin ribbon along a line, `w0` px wide, thinning toward both ends over `taper` of its length. */
export function strand(line: number[], w0: number, taper = 0.3): number[] {
  const n = line.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const k = taper <= 0 ? 1 : Math.min(1, Math.min(t, 1 - t) / taper + 0.15);
    const [nx, ny] = normal(line, i);
    const w = (w0 * k) / 2;
    const x = line[i * 2] as number;
    const y = line[i * 2 + 1] as number;
    left.push(x + nx * w, y + ny * w);
    right.push(x - nx * w, y - ny * w);
  }
  for (let i = n - 1; i >= 0; i--) left.push(right[i * 2] as number, right[i * 2 + 1] as number);
  return left;
}

/** Resamples a polyline to points `step` px apart. */
function resample(line: number[], step: number): number[] {
  const out: number[] = [line[0] as number, line[1] as number];
  let carry = 0;
  for (let i = 2; i < line.length; i += 2) {
    const ax = line[i - 2] as number;
    const ay = line[i - 1] as number;
    const bx = line[i] as number;
    const by = line[i + 1] as number;
    const seg = Math.hypot(bx - ax, by - ay);
    let d = step - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t);
      d += step;
    }
    carry = seg - (d - step);
  }
  const lx = line[line.length - 2] as number;
  const ly = line[line.length - 1] as number;
  if (Math.hypot(lx - (out[out.length - 2] as number), ly - (out[out.length - 1] as number)) > step * 0.3)
    out.push(lx, ly);
  return out;
}

/** The part of a polygon below y0 (Sutherland-Hodgman against one horizontal line). */
function clipBelow(poly: number[], y0: number): number[] {
  const out: number[] = [];
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = poly[i * 2] as number;
    const ay = poly[i * 2 + 1] as number;
    const j = (i + 1) % n;
    const bx = poly[j * 2] as number;
    const by = poly[j * 2 + 1] as number;
    const ina = ay >= y0;
    const inb = by >= y0;
    if (ina) out.push(ax, ay);
    if (ina !== inb) {
      const t = (y0 - ay) / (by - ay);
      out.push(ax + (bx - ax) * t, y0);
    }
  }
  return out;
}

/** The part of a polygon above y0. */
function clipAbove(poly: number[], y0: number): number[] {
  return clipBelow(
    poly.map((v, i) => (i % 2 ? -v : v)),
    -y0,
  ).map((v, i) => (i % 2 ? -v : v));
}

/** A colour laid over the band v0..v1 of a limb, its alpha going a0 -> a1 in soft steps. */
function gradBand(
  p: Paint,
  L: Limb,
  v0: number,
  v1: number,
  col: number,
  a0: number,
  a1: number,
  steps = 6,
): void {
  // Nested bands from the a0 side: each adds a little, so the edge is a ramp, not a line.
  for (let k = 0; k < steps; k++) {
    const t = (k + 1) / steps;
    const lo = a1 >= a0 ? lerp(v0, v1, k / steps) : v0;
    const hi = a1 >= a0 ? v1 : lerp(v1, v0, k / steps);
    const a = Math.abs(a1 - a0) / steps + (k === 0 ? Math.min(a0, a1) : 0);
    p.tint(band(L, lo, hi), col, clamp(a * (1 + t * 0.15), 0, 1));
  }
}

/**
 * A soft swelling in the relief: nested blobs rising from h0 at the rim to h1 in the middle. (One flat
 * bump is a plateau: the bake lights its step as a hard rim and its top as a pale flat.)
 */
function dome(
  p: Paint,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  h0: number,
  h1: number,
  seed: number,
  rot = 0,
  bark = 0.15,
): void {
  const steps = 7;
  for (let k = 0; k < steps; k++) {
    const t = k / (steps - 1);
    const s = 1 - 0.88 * t;
    p.bump(blob(cx, cy, rx * s, ry * s, seed, 0.2, 18, rot), lerp(h0, h1, Math.sin((t * Math.PI) / 2)), {
      bark,
    });
  }
}

/** Shades a joint's polygon like a limb: lit across the top, the belly sinking to dark. */
function shadeJoint(p: Paint, poly: number[], top: number, bottom: number): void {
  const B = BRANCH;
  const h = bottom - top;
  for (let k = 0; k < 4; k++) p.tint(clipAbove(poly, top + h * (0.08 + k * 0.06)), B.barkLit, 0.1);
  for (let k = 0; k < 6; k++)
    p.tint(clipBelow(poly, top + h * (0.45 + k * 0.08)), k < 3 ? B.barkDark : B.barkDeep, 0.2);
}

// ---------------------------------------------------------------------------------------------
// Bark

/**
 * Paints a limb: silhouette, round section (relief high toward the top, so most of it turns down,
 * away from the moon), value bands (a silvered upper flank, a dark belly), soft patches of algae
 * green and grey, a network of furrows that run along it and part round its knots, knots, lichen.
 */
export function paintLimb(p: Paint, L: Limb, knots: Array<{ i: number; v: number; r: number }> = []): void {
  const B = BRANCH;
  const n = L.pts.length / 2;
  if (n < 2) return;
  const r = rngFor(L.seed, n);
  const bark = { bark: 0.12 };
  p.solid(band(L), B.bark, L.h, bark);
  // Round section: the crown of the curve sits a little above the middle. A limb in the back plane
  // keeps its relief low (the bake lights by height: a high crown would put it in the walk plane).
  const rise = L.h < 0.4 ? 0.4 : 1;
  p.bump(band(L, -0.46, 0.32), L.h + 0.05 * rise, bark);
  p.bump(band(L, -0.4, 0.12), L.h + 0.1 * rise, bark);
  p.bump(band(L, -0.34, -0.06), L.h + 0.14 * rise, bark);
  const step =
    n > 1
      ? Math.hypot((L.pts[2] as number) - (L.pts[0] as number), (L.pts[3] as number) - (L.pts[1] as number))
      : 8;
  // Mottling: many faint overlapping blobs, greener up under the moss, greyer on the belly (a big
  // tint would have a hard edge: the bake softens relief, not colour).
  for (let i = Math.floor(r() * 6); i < n; i += Math.max(1, Math.round(range(r, 10, 40) / step))) {
    const up = r() < 0.6;
    const v = up ? range(r, -0.45, -0.1) : range(r, 0.05, 0.4);
    const [nx, ny] = normal(L.pts, i);
    const w = L.w[i] as number;
    const rad = range(r, 0.12, 0.3) * w;
    p.tint(
      blob(
        (L.pts[i * 2] as number) + nx * v * w,
        (L.pts[i * 2 + 1] as number) + ny * v * w,
        rad * 1.8,
        rad,
        L.seed + i,
        0.35,
        12,
        Math.atan2(ny, nx) - Math.PI / 2,
      ),
      up ? B.barkGreen : B.barkGrey,
      range(r, 0.08, 0.2),
    );
  }
  // Values: silvered upper flank, then the belly darkening to the underside, in soft ramps.
  gradBand(p, L, -0.5, -0.18, B.barkLit, 0.5, 0, 5);
  gradBand(p, L, -0.05, 0.5, B.barkDark, 0, 0.55, 6);
  gradBand(p, L, 0.15, 0.5, B.barkDeep, 0, 0.8, 6);

  // Furrows: a network of dashes along the limb that wander, drift across into the next row now and
  // then, and part round the knots.
  const meanW = L.w.reduce((a, b) => a + b, 0) / n;
  const rows = Math.round(clamp(meanW / 9, 3, 16) * L.detail);
  for (let k = 0; k < rows; k++) {
    const v0 = lerp(-0.42, 0.44, (k + 0.5 + (r() - 0.5) * 0.7) / rows);
    const amp = 0.05 + 0.04 * r();
    let i = Math.floor(r() * 8);
    while (i < n - 2) {
      const len = Math.max(2, Math.round(range(r, 16, 120) / step));
      const i1 = Math.min(n - 1, i + len);
      const drift = r() < 0.3 ? range(r, -0.09, 0.09) : 0;
      const ia = i;
      const offset = (q: number): number => {
        let v = v0 + amp * wobble(q * step, L.seed + k * 13, 150) + 0.02 * wobble(q * step, L.seed + k, 31);
        v += drift * ((q - ia) / Math.max(1, i1 - ia));
        for (const kn of knots) {
          const w = L.w[kn.i] as number;
          const d = ((q - kn.i) * step) / (kn.r * 1.8);
          const room = (kn.r * 1.7) / w - Math.abs(v - kn.v);
          if (room > 0) v += Math.sign(v - kn.v || 1) * room * Math.exp(-d * d);
        }
        return clamp(v, -0.47, 0.47);
      };
      const line = along(L, offset, i, i1);
      const w0 = range(r, 1.6, 3.6) * clamp((L.w[i] as number) / 90, 0.5, 1.3);
      // A groove (the bake reads the dip as a crevice) with a lit lip above it (the light is above).
      p.bump(strand(line, w0 * 1.8), L.h + 0.01 * rise, { bark: 0.2, alpha: 0.85 });
      p.tint(strand(line, w0), B.barkDeep, v0 < 0 ? 0.65 : 0.75);
      if (v0 < 0.15 && r() < 0.8) {
        const lip = along(L, (q) => offset(q) - (w0 * 0.9) / (L.w[q] as number), i, i1);
        p.tint(strand(lip, w0 * 0.7), B.barkLit, v0 < -0.1 ? 0.42 : 0.3);
      }
      i = i1 + Math.max(1, Math.round(range(r, 4, 50) / step));
    }
  }

  for (const kn of knots) {
    const [nx, ny] = normal(L.pts, kn.i);
    const w = L.w[kn.i] as number;
    const cx = (L.pts[kn.i * 2] as number) + nx * kn.v * w;
    const cy = (L.pts[kn.i * 2 + 1] as number) + ny * kn.v * w;
    knot(p, cx, cy, kn.r, Math.atan2(ny, nx) - Math.PI / 2, L.h, L.seed + kn.i);
  }

  // Lichen: small pale rosettes in clusters on the upper and middle flank.
  if (L.detail > 0.3) {
    for (let i = Math.floor(r() * 12); i < n; i += Math.max(4, Math.round(range(r, 140, 380) / step))) {
      const v = range(r, -0.32, 0.05);
      const [nx, ny] = normal(L.pts, i);
      const w = L.w[i] as number;
      lichen(
        p,
        (L.pts[i * 2] as number) + nx * v * w,
        (L.pts[i * 2 + 1] as number) + ny * v * w,
        range(r, 5, 13) * Math.min(1, w / 80),
        L.h,
        L.seed + i,
      );
    }
  }

  // Moss along the upper side of limbs nobody walks on: broken cushions, no rim.
  if (L.moss > 0) {
    let i = 0;
    while (i < n - 2) {
      const cover = wobble(i * step, L.seed + 77, 120);
      if (cover < 0.25 - L.moss * 0.6) {
        i += 2;
        continue;
      }
      const len = Math.max(3, Math.round(range(r, 40, 160) / step));
      const i1 = Math.min(n - 1, i + len);
      const th = range(r, 0.08, 0.18) * L.moss;
      p.solid(chaikin(band(L, -0.53, -0.5 + th, i, i1), 1), B.mossDark, L.h + 0.12, { moss: 1 });
      p.tint(chaikin(band(L, -0.53, -0.5 + th * 0.45, i, i1), 1), B.moss, 0.7);
      i = i1 + Math.max(2, Math.round(range(r, 20, 90) / step));
    }
  }
}

/** A knot: a swelling with bark creased round it and a dark socket whose lower lip catches the light. */
export function knot(
  p: Paint,
  cx: number,
  cy: number,
  rad: number,
  rot: number,
  h: number,
  seed: number,
): void {
  const B = BRANCH;
  dome(p, cx, cy, rad * 2, rad * 1.3, h + 0.08, h + 0.2, seed, rot);
  p.tint(blob(cx, cy - rad * 0.55, rad * 1.6, rad * 0.7, seed + 1, 0.25, 18, rot), B.barkLit, 0.25);
  for (let k = 0; k < 2; k++) {
    const rr = rad * (1.5 - k * 0.38);
    const ring = blob(cx, cy, rr * 1.2, rr * 0.82, seed + 3 + k, 0.2, 22, rot);
    ring.push(ring[0] as number, ring[1] as number, ring[2] as number, ring[3] as number);
    p.tint(strand(ring, 1.3 + rad * 0.05, 0.08), B.barkDeep, 0.4);
  }
  p.solid(blob(cx, cy, rad * 0.6, rad * 0.4, seed + 9, 0.3, 14, rot), B.barkDeep, h - 0.06, { bark: 0.1 });
  p.tint(blob(cx, cy + rad * 0.3, rad * 0.46, rad * 0.13, seed + 10, 0.25, 12, rot), B.barkLit, 0.35);
}

export function lichen(p: Paint, cx: number, cy: number, size: number, h: number, seed: number): void {
  const r = rngFor(seed, cx, cy);
  const n = 3 + Math.floor(r() * 6);
  for (let k = 0; k < n; k++) {
    const x = cx + range(r, -size, size);
    const y = cy + range(r, -size, size) * 0.45;
    const rad = range(r, 1.2, 3.4) * (k === 0 ? 1.5 : 1);
    const col = BRANCH.lichen[Math.floor(r() * BRANCH.lichen.length)] as number;
    p.solid(blob(x, y, rad * 1.3, rad, seed + k, 0.35, 9), col, h + 0.16, { bark: 0 }, range(r, 0.4, 0.75));
  }
}

/** A broken-off twig stub: a short tapered cone from (x, y) along `a`. */
function stub(p: Paint, x: number, y: number, a: number, len: number, w0: number, h: number): void {
  const line = [x - Math.cos(a) * 4, y - Math.sin(a) * 4, x + Math.cos(a) * len, y + Math.sin(a) * len];
  const pts = resample(line, 3);
  const n = pts.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const [nx, ny] = normal(pts, i);
    const w = (w0 * (1 - t * 0.6)) / 2;
    left.push((pts[i * 2] as number) + nx * w, (pts[i * 2 + 1] as number) + ny * w);
    right.push((pts[i * 2] as number) - nx * w, (pts[i * 2 + 1] as number) - ny * w);
  }
  for (let i = n - 1; i >= 0; i--) left.push(right[i * 2] as number, right[i * 2 + 1] as number);
  p.solid(left, BRANCH.barkDark, h, { bark: 0.3 });
  // The broken end: a paler splintered face.
  const ex = x + Math.cos(a) * len;
  const ey = y + Math.sin(a) * len;
  p.tint(blob(ex, ey, w0 * 0.32, w0 * 0.22, x + y, 0.3, 9, a), 0x3c4a50, 0.6);
}

// ---------------------------------------------------------------------------------------------
// The plan: the room's stretch and tree marks -> limbs

/** A free west end (nothing joins it there). */
export function freeWest(st: Stretch): boolean {
  return (
    st.west === 'crotch' || st.west === 'fork' || st.west === 'snap' || st.west === 'nub' || st.west === 'tip'
  );
}

/** A free east end (a knee's corner counts: the rim fades over it). */
export function freeEast(st: Stretch): boolean {
  return (
    st.east === 'crotch' ||
    st.east === 'fork' ||
    st.east === 'snap' ||
    st.east === 'nub' ||
    st.east === 'tip' ||
    st.east === 'knee'
  );
}

interface TreeLike {
  id: string;
  x: number;
  w: number;
  top: number;
  bottom: number;
  plane: 'walk' | 'back';
  /** Has collision (the room's edge trunk). Decor trees stand a step BEHIND the walk (see paintTrunk). */
  solid?: boolean;
}

/** The trees: the room's `marks.trees`, or (a room without them) its trunk solids. */
function planTrees(room: Room): TreeLike[] {
  const marks = room.marks?.trees;
  if (marks?.length) return marks.map((t) => ({ ...t }));
  return room.solids
    .filter((s) => s.tag === 'trunk')
    .map((s, i) => ({
      id: `trunk${i}`,
      x: s.x + s.w / 2,
      w: s.w,
      top: s.y,
      bottom: s.y + s.h,
      plane: 'walk' as const,
      solid: true,
    }));
}

function planStretches(room: Room, trees: TreeLike[]): Stretch[] {
  const B = BRANCH;
  const branches = room.solids.filter((s) => s.tag !== 'trunk' && !isMass(s)).sort((a, b) => a.x - b.x);
  // The stretches: the room's marks, or (without them) runs of abutting rects within a step.
  let marks = room.marks?.stretches ?? [];
  if (!marks.length) {
    const runs: SolidRect[][] = [];
    for (const s of branches) {
      const last = runs[runs.length - 1];
      const prev = last?.[last.length - 1];
      if (last && prev && Math.abs(prev.x + prev.w - s.x) < 2 && Math.abs(prev.y - s.y) <= 12) last.push(s);
      else runs.push([s]);
    }
    marks = runs.map((run, i) => {
      const first = run[0] as SolidRect;
      const last = run[run.length - 1] as SolidRect;
      const tree = trees.find((t) => Math.abs(t.x + t.w / 2 - first.x) < 4);
      return {
        id: `R${i}`,
        x0: first.x,
        x1: last.x + last.w,
        parent: tree ? tree.id : '',
        from: [first.x, first.y + 40] as [number, number],
        grows: 'east' as const,
        end: 'tip' as const,
      };
    });
  }
  const out: Stretch[] = [];
  for (const m of marks) {
    const inBand = (s: SolidRect) =>
      (m.y0 === undefined || s.y >= m.y0) && (m.y1 === undefined || s.y < m.y1);
    const rects = branches.filter((s) => s.x >= m.x0 && s.x < m.x1 && inBand(s));
    if (!rects.length) continue;
    const first = rects[0] as SolidRect;
    const last = rects[rects.length - 1] as SolidRect;
    const grows: 1 | -1 = m.grows === 'west' ? -1 : 1;
    const farEnd: End = m.end === 'trunk' ? 'nub' : m.end;
    out.push({
      id: m.id,
      s: first,
      x0: first.x,
      x1: last.x + last.w,
      y: first.y,
      rects: rects.map((s) => ({ x0: s.x, x1: s.x + s.w, top: s.y })),
      west: grows > 0 ? 'trunk' : farEnd,
      east: grows > 0 ? farEnd : 'trunk',
      grows,
      parent: m.parent,
      from: m.from,
      th: () => 0,
      under: () => 0,
      top: () => first.y,
      far: false,
      reachW: 0,
      reachE: 0,
      thRoot: 0,
      thEnd: 0,
    });
  }
  // Root ends: out of a tree, or out of the parent stretch's far end.
  for (const st of out) {
    const parent = out.find((o) => o.id === st.parent);
    if (!parent) continue;
    const pEnd = parent.grows > 0 ? parent.east : parent.west;
    const root: End =
      pEnd === 'burl' ? 'burl' : pEnd === 'knee' ? 'under' : pEnd === 'fork' ? 'crotch' : 'nub';
    if (st.grows > 0) st.west = root;
    else st.east = root;
    // Neighbours across a gap.
    if (pEnd === 'fork' || pEnd === 'snap') {
      if (parent.x1 <= st.x0) {
        parent.nbE = st;
        st.nbW = parent;
        parent.reachE = st.y - (parent.rects[parent.rects.length - 1] as { top: number }).top;
        st.reachW = -parent.reachE;
      }
    }
  }
  for (const st of out) {
    // A snap faces another tree's limb: the next stretch east is its neighbour.
    if (st.east === 'snap' && !st.nbE) {
      const next = out.filter((o) => o.x0 >= st.x1).sort((a, b) => a.x0 - b.x0)[0];
      if (next) {
        st.nbE = next;
        next.nbW = st;
      }
    }
  }
  // Thickness: out of a tree a limb starts at about half the trunk's width; out of a limb, at what the
  // parent has left. Parents first.
  const done = new Set<string>();
  const cocoons = room.marks?.cocoons ?? [];
  const c0 = cocoons.length ? Math.min(...cocoons.map((c) => c.x)) : 0;
  const c1 = cocoons.length ? Math.max(...cocoons.map((c) => c.x)) : -1;
  const row = (x: number): number =>
    c1 < c0 ? 0 : smoothstep(c0 - B.cocoonFade, c0, x) * smoothstep(c1 + B.cocoonFade, c1, x);
  const endShare: Record<string, number> = {
    burl: 0.86,
    knee: 0.86,
    fork: 0.8,
    snap: 0.84,
    nub: 0.6,
    tip: 0.16,
  };
  for (let pass = 0; pass < out.length + 1; pass++) {
    for (const st of out) {
      if (done.has(st.id)) continue;
      const tree = trees.find((t) => t.id === st.parent);
      const parent = out.find((o) => o.id === st.parent);
      if (!tree && parent && !done.has(parent.id)) continue;
      st.thRoot = tree
        ? clamp(tree.w * B.rootShare, B.rootMin, B.rootMax)
        : parent
          ? parent.thEnd * (parent.east === 'fork' || parent.west === 'fork' ? B.forkShare : 0.97)
          : B.rootMin;
      const farEnd = st.grows > 0 ? st.east : st.west;
      st.thEnd = st.thRoot * (endShare[farEnd] ?? 0.8);
      done.add(st.id);
    }
  }
  for (const st of out) {
    const seed = st.s.x * 3 + st.s.y;
    const span = st.x1 - st.x0;
    const hMin = st.s.h * 0.45;
    const rootTree = trees.some((t) => t.id === st.parent);
    const farEnd = st.grows > 0 ? st.east : st.west;
    st.th = (x: number): number => {
      const u = clamp((x - st.x0) / Math.max(1, span), 0, 1);
      const d = st.grows > 0 ? u : 1 - u;
      let t = lerp(st.thRoot, st.thEnd, d ** 0.9) * lerp(1, B.cocoonThin, row(x));
      if (rootTree) t += B.flare * Math.exp(-(d * span) / B.flareFall);
      t *= 1 + B.swell * wobble(x, seed + 5, 420) + B.ripple * wobble(x, seed + 6, 120);
      return Math.max(farEnd === 'tip' ? 12 : hMin, t);
    };
    // The top: a smooth curve through the rects' tops (each rect's middle at its top, eased between),
    // a hair of bark roll on that, rounding away over the last px of a free end.
    const mids = st.rects.map((q) => [(q.x0 + q.x1) / 2, q.top] as [number, number]);
    const curve = (x: number): number => {
      const a = mids[0] as [number, number];
      const z = mids[mids.length - 1] as [number, number];
      if (x <= a[0]) return a[1];
      if (x >= z[0]) return z[1];
      for (let i = 0; i + 1 < mids.length; i++) {
        const p = mids[i] as [number, number];
        const q = mids[i + 1] as [number, number];
        if (x <= q[0]) return lerp(p[1], q[1], smoothstep(p[0], q[0], x));
      }
      return z[1];
    };
    // Only an end she leaves from (or the exit tip) rounds away; a landing lip stays level to the edge
    // (a lip that dropped away made the landing look further than it is).
    const rounds = (e: End): boolean => e === 'tip' || e === 'fork';
    const fe = rounds(st.east);
    const fw = rounds(st.west);
    // Bark bumps: low swellings that break the line where feet won't notice.
    const rb = rngFor(seed, 77);
    const bumps: Array<[number, number, number]> = [];
    for (
      let x = st.x0 + range(rb, 40, 160);
      x < st.x1 - 40;
      x += range(rb, B.bumpGap[0] as number, B.bumpGap[1] as number)
    )
      bumps.push([x, range(rb, 22, 60), range(rb, B.bumpLift[0] as number, B.bumpLift[1] as number)]);
    const ends = (x: number): number => smoothstep(st.x0, st.x0 + 60, x) * smoothstep(st.x1, st.x1 - 60, x);
    st.top = (x: number): number => {
      const [r0, r1, r2] = B.roll as [number, number, number];
      let y = curve(x) + r0 + r1 * wobble(x, seed + 31, 280) + r2 * wobble(x, seed + 32, 64);
      // A slow roll of the painted top over the collision (render only: the moss takes the difference).
      y += B.rollBig * wobble(x, seed + 34, 420) * ends(x);
      for (const [bx, bw, bh] of bumps) {
        const d = (x - bx) / bw;
        if (d > -1 && d < 1) y -= bh * (1 - d * d) ** 2;
      }
      const dE = st.x1 - x;
      const dW = x - st.x0;
      if (fe && dE < B.endRound) y += ((B.endRound - dE) / B.endRound) ** 2 * B.endDrop;
      if (fw && dW < B.endRound) y += ((B.endRound - dW) / B.endRound) ** 2 * B.endDrop;
      return y;
    };
    const r = rngFor(seed, 99);
    const lumps: Array<[number, number, number]> = [];
    for (
      let x = st.x0 + range(r, 60, 260);
      x < st.x1 - 60;
      x += range(r, B.lumpGap[0] as number, B.lumpGap[1] as number)
    ) {
      lumps.push([x, range(r, 60, 150), range(r, B.lumpDepth[0] as number, B.lumpDepth[1] as number)]);
    }
    // Along the cocoon row the underside follows their hang points (a little above them: they hang
    // on silk), so it slopes and wavers with the row instead of running parallel to the walk line.
    const hangs = cocoons.filter((c) => c.x >= st.x0 && c.x <= st.x1).sort((a, b) => a.x - b.x);
    const hangY = (x: number): number => {
      const a = hangs[0] as { x: number; y: number };
      const z = hangs[hangs.length - 1] as { x: number; y: number };
      if (x <= a.x) return a.y;
      if (x >= z.x) return z.y;
      for (let i = 0; i + 1 < hangs.length; i++) {
        const p = hangs[i] as { x: number; y: number };
        const q = hangs[i + 1] as { x: number; y: number };
        if (x <= q.x) return lerp(p.y, q.y, smoothstep(p.x, q.x, x));
      }
      return z.y;
    };
    st.under = (x: number): number => {
      let add = 0;
      for (const [lx, lw, ld] of lumps) {
        const d = (x - lx) / lw;
        add += ld * Math.exp(-d * d * 2.2);
      }
      const top = st.top(clamp(x, st.x0, st.x1));
      const free = top + st.th(x) + add * (0.6 + 0.4 * wobble(x, seed + 8, 90));
      const w = hangs.length ? row(x) : 0;
      if (w <= 0) return free;
      const along = hangY(x) - B.cocoonSilk + 7 * wobble(x, seed + 12, 140) + 3 * wobble(x, seed + 13, 40);
      return lerp(free, Math.max(top + st.s.h * 0.6, along), w);
    };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Painting

/** The limb of one stretch: its top edge is the rolled walk line, its underside `under`, xa..xb. */
function stretchLimb(st: Stretch, xa: number, xb: number, seed: number): Limb {
  const pts: number[] = [];
  const w: number[] = [];
  const step = 6;
  const n = Math.max(2, Math.ceil((xb - xa) / step));
  for (let i = 0; i <= n; i++) {
    const x = xa + ((xb - xa) * i) / n;
    const cx = clamp(x, st.x0, st.x1);
    const top = st.top(cx);
    const th = st.under(cx) - top;
    pts.push(x, top + th / 2);
    w.push(th);
  }
  return { pts, w, h: BRANCH.walkH, seed, moss: 0, detail: 1 };
}

/** A limb along a polyline with a width profile. */
export function lineLimb(
  line: number[],
  wd: (t: number) => number,
  h: number,
  seed: number,
  moss = 0.6,
  detail = 0.8,
): Limb {
  const pts = resample(line, 6);
  const n = pts.length / 2;
  const w: number[] = [];
  for (let i = 0; i < n; i++) w.push(wd(n > 1 ? i / (n - 1) : 0));
  return { pts, w, h, seed, moss, detail };
}

/** Knots placed along a stretch (index along its limb, offset, radius). */
export function knotsFor(L: Limb, seed: number, every: number): Array<{ i: number; v: number; r: number }> {
  const r = rngFor(seed, 41);
  const n = L.pts.length / 2;
  const out: Array<{ i: number; v: number; r: number }> = [];
  for (
    let i = Math.round(range(r, 30, 70));
    i < n - 16;
    i += Math.round(range(r, every * 0.6, every * 1.5) / 6)
  ) {
    const w = L.w[i] as number;
    if (w < 56) continue;
    out.push({ i, v: range(r, -0.05, 0.25), r: range(r, 6, 12) * (w / 100) ** 0.6 });
  }
  return out;
}

/**
 * The moss blanket on a walk top (`topAt` is the rolled bark top): cushions and thin skins, now and
 * then a fat tuft that breaks the line, tongues creeping down the flank, drapes over free ends.
 */
export function mossBlanket(
  p: Paint,
  x0: number,
  x1: number,
  topAt: (x: number) => number,
  seed: number,
  dropL: number,
  dropR: number,
): void {
  const B = BRANCH;
  const r = rngFor(seed, x0, x1);
  const S = 3;
  const Y = (x: number): number => topAt(clamp(x, x0, x1));
  const tufts: Array<[number, number, number]> = [];
  for (
    let x = x0 + range(r, 30, 160);
    x < x1 - 20;
    x += range(r, B.tuftGap[0] as number, B.tuftGap[1] as number)
  )
    tufts.push([x, range(r, 8, 20), range(r, B.tuftLift[0] as number, B.tuftLift[1] as number)]);
  const tuft = (x: number): number => {
    let t = 0;
    for (const [tx, tw, th] of tufts) {
      const d = (x - tx) / tw;
      if (d > -1 && d < 1) t = Math.max(t, th * (1 - d * d) ** 1.3);
    }
    return t;
  };
  const cushion = (x: number): number => ((wobble(x, seed + 21, 70) + 1) * 0.5) ** 1.4;
  const lift = (x: number): number => 1 + 3.2 * cushion(x) + (wobble(x, seed + 9, 8) + 1) * 0.6 + tuft(x);
  const thick = (x: number): number => 7 + 18 * cushion(x) + 5 * wobble(x, seed + 22, 23);
  const endFade = (x: number): number =>
    Math.min(smoothstep(x0 - 6, x0 + 16, x), smoothstep(x1 + 6, x1 - 16, x));
  const top: number[] = [];
  const bot: number[] = [];
  const mid: number[] = [];
  const xa = x0 - dropL * 0.35;
  const xb = x1 + dropR * 0.35;
  for (let x = xa; x <= xb + 0.01; x += S) {
    const e = endFade(x);
    const lx =
      x < x0 ? (x0 - x) / Math.max(1, dropL * 0.35) : x > x1 ? (x - x1) / Math.max(1, dropR * 0.35) : 0;
    const y = Y(x);
    const yt = y - lift(x) * Math.max(e, 0.4) + lx * lx * 14;
    top.push(x, yt);
    bot.push(x, y + thick(x) * (0.5 + 0.5 * e) + lx * 22);
    mid.push(x, yt + Math.min(thick(x) * 0.7, 3 + 5 * cushion(x)));
  }
  const shape = (lower: number[]): number[] => {
    const pts = top.slice();
    for (let i = lower.length / 2 - 1; i >= 0; i--)
      pts.push(lower[i * 2] as number, lower[i * 2 + 1] as number);
    return pts;
  };
  p.solid(shape(bot), B.mossDark, B.walkH + 0.2, { moss: 1 });
  p.solid(shape(mid), B.moss, B.walkH + 0.26, { moss: 1 });
  // Tongues: moss creeping down the flank in uneven runs, longer under the cushions.
  for (let x = x0 + range(r, 4, 40); x < x1 - 4; x += range(r, 18, 110)) {
    const c = cushion(x);
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const tx = x + range(r, -10, 10);
      const l = range(r, 6, 40) * (0.3 + c) * (k ? 0.6 : 1);
      const w0 = range(r, 5, 16) * (k ? 0.6 : 1);
      const yt = Y(tx) + thick(tx) * 0.5;
      const line = quad(tx, yt - 4, tx + range(r, -4, 4), yt + l * 0.5, tx + range(r, -6, 6), yt + l, 6);
      p.solid(strand(line, w0, 0.7), B.mossDark, B.walkH + 0.16, { moss: 1, alpha: 0.9 });
    }
  }
  // Over a free end the moss drapes down round the corner.
  for (const [ex, dir, len] of [
    [x0, -1, dropL],
    [x1, 1, dropR],
  ] as const) {
    if (len <= 0) continue;
    const y = Y(ex);
    for (let k = 0; k < 4; k++) {
      const tx = ex - dir * range(r, -2, 12);
      const l = range(r, 0.5, 1.4) * len;
      const line = quad(
        tx,
        y + 2,
        tx + dir * range(r, 2, 7),
        y + l * 0.5,
        tx + dir * range(r, -2, 5),
        y + l,
        6,
      );
      p.solid(strand(line, range(r, 7, 15), 0.7), B.mossDark, B.walkH + 0.18, { moss: 1, alpha: 0.95 });
    }
  }
  // A crest on the cushions (the live rim lays the moonlight on it).
  let crest: number[] = [];
  const flushCrest = (): void => {
    if (crest.length >= 8) p.solid(strand(crest, 3.6, 0.12), B.mossLit, B.walkH + 0.3, { moss: 1 }, 0.55);
    crest = [];
  };
  for (let i = 0; i < top.length; i += 2) {
    if (cushion(top[i] as number) > 0.12) crest.push(top[i] as number, (top[i + 1] as number) + 1.8);
    else flushCrest();
  }
  flushCrest();
  // Puffs of height so the light finds cushions to model.
  for (let x = x0 + range(r, 3, 12); x < x1 - 3; x += range(r, 6, 18)) {
    const rad = range(r, 2.5, 6.5) * (0.6 + cushion(x));
    p.bump(blob(x, Y(x) - lift(x) * 0.4 + rad * 0.6, rad * 1.4, rad, seed + x, 0.2, 9), B.walkH + 0.34, {
      moss: 1,
      alpha: 0.6,
    });
  }
}

/** Twigs: thin limbs that fork as they go; their ends become leaf sprigs. */
function twig(
  p: Paint,
  plan: BranchPlan,
  x: number,
  y: number,
  a: number,
  len: number,
  w0: number,
  h: number,
  seed: number,
  depth = 0,
): void {
  const r = rngFor(seed, x, y);
  const bend = range(r, -0.5, 0.5);
  const ex = x + Math.cos(a + bend) * len;
  const ey = y + Math.sin(a + bend) * len;
  const cx = x + Math.cos(a) * len * 0.55;
  const cy = y + Math.sin(a) * len * 0.55;
  const pts = resample(quad(x, y, cx, cy, ex, ey, 8), 3);
  const n = pts.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const [nx, ny] = normal(pts, i);
    const w = Math.max(0.6, w0 * (1 - t * 0.75)) / 2;
    left.push((pts[i * 2] as number) + nx * w, (pts[i * 2 + 1] as number) + ny * w);
    right.push((pts[i * 2] as number) - nx * w, (pts[i * 2 + 1] as number) - ny * w);
  }
  for (let i = n - 1; i >= 0; i--) left.push(right[i * 2] as number, right[i * 2 + 1] as number);
  p.solid(left, BRANCH.barkDark, h, { bark: 0.3 });
  plan.sprigs.push({
    x: ex,
    y: ey,
    a: Math.atan2(ey - cy, ex - cx),
    size: clamp(w0 / 7, 0.4, 1),
    deep: h < 0.45,
  });
  if (depth < 2 && len > 26) {
    const k = 1 + Math.floor(r() * 2);
    for (let j = 0; j < k; j++) {
      const t = range(r, 0.35, 0.75);
      const q = Math.min(n - 1, Math.round(t * (n - 1)));
      const side = j % 2 ? 1 : -1;
      twig(
        p,
        plan,
        pts[q * 2] as number,
        pts[q * 2 + 1] as number,
        a + bend * t + side * range(r, 0.4, 0.9),
        len * range(r, 0.35, 0.6),
        w0 * 0.55,
        h,
        seed + j * 31 + 7,
        depth + 1,
      );
    }
  }
}

/**
 * The grain of a knee (the limb kinks down at x1 from top y3 to top y4): grooves that run along the
 * upper stretch, bend down the knee and run on along the lower one, the outer ones hugging the face.
 */
function bendGrain(
  p: Paint,
  x1: number,
  y3: number,
  th3: number,
  y4: number,
  th4: number,
  seed: number,
): void {
  const B = BRANCH;
  const r = rngFor(seed, x1);
  const rows = 7;
  for (let k = 0; k < rows; k++) {
    const o = 0.12 + (0.86 * (k + 0.5 + (r() - 0.5) * 0.5)) / rows;
    const d3 = 10 + o * (th3 - 20);
    const d4 = 10 + o * (th4 - 20);
    const kx = 12 + o * 90;
    const raw = resample(
      cubic(
        x1 - 200 - r() * 60,
        y3 + d3,
        x1 - kx + 10,
        y3 + d3,
        x1 - kx + 4,
        y4 + d4,
        x1 + 90 + r() * 80,
        y4 + d4,
        24,
      ),
      5,
    );
    // Keep inside the bark: above the lower walk line nothing may pass the knee's face.
    const line = raw.map((v, i) =>
      i % 2 === 0 && (raw[i + 1] as number) < y4 + 8 ? Math.min(v, x1 - 8) : v,
    );
    // In dashes: bark breaks.
    const n = line.length / 2;
    let i = Math.floor(r() * 4);
    while (i < n - 2) {
      const i1 = Math.min(n - 1, i + 4 + Math.floor(r() * 18));
      const seg = line.slice(i * 2, i1 * 2 + 2);
      const w0 = range(r, 2.4, 4.2);
      p.bump(strand(seg, w0 * 2), B.walkH + 0.02, { bark: 0.2, alpha: 0.85 });
      p.tint(strand(seg, w0, 0.4), B.barkDeep, 0.4);
      if (o < 0.5)
        p.tint(
          strand(
            seg.map((v, j) => (j % 2 ? v - w0 * 0.9 : v - w0 * 0.4)),
            w0 * 0.7,
            0.4,
          ),
          B.barkLit,
          0.22,
        );
      i = i1 + 1 + Math.floor(r() * 4);
    }
  }
}

/** A limb's root on a trunk: which flank, the limb's top there, its thickness. */
interface Join {
  side: -1 | 1;
  y: number;
  th: number;
}

/**
 * A great trunk: bark ridges, a moonlit right flank, a round collar wrapping every limb that grows out
 * of it (painted after the limbs, so their roots sink into it), the bark ridge folds over each joint,
 * the limb's shadow under it, moss streaks; a broken jagged top if the trunk ends in view.
 */
function paintTrunk(p: Paint, tree: TreeLike, joins: Join[], roomH: number, seed: number): void {
  const B = BRANCH;
  const r = rngFor(seed, 7);
  const back = tree.plane === 'back';
  // A tree without collision stands a step behind the walk: lower relief (the bake lights it less) and
  // a haze laid over it, painted BEFORE the limbs so they read in front of it. First-timers read the
  // crown trunk, drawn over the ends of S4 / S5, as a wall in front of the gap and fell short.
  const decor = !tree.solid;
  const h0 = back ? B.backH : decor ? B.decorH : 0.5;
  // Round, under the limb's top only (above it she walks or falls past): a swelling the limb grows
  // out of, with a small fillet into the limb's top.
  const collar = (side: -1 | 1, y: number): number => {
    let c = 0;
    for (const j of joins) {
      if (j.side !== side) continue;
      const mid = j.y + j.th * 0.52;
      const half = j.th * 0.56;
      const d = (y - mid) / half;
      if (d > -1 && d < 1) c = Math.max(c, B.collar * Math.sqrt(1 - d * d));
      const f = (y - (j.y - 14)) / 14;
      if (f > 0 && f < 1) c = Math.max(c, 14 * f * f);
    }
    return c;
  };
  const y0 = Math.max(-40, tree.top);
  const y1 = Math.min(roomH + 60, tree.bottom + 60);
  const broken = tree.top > -40;
  // A trunk that ends in view tapers toward its broken top and leans a little; others run on up.
  const rise = (y: number): number => (broken ? smoothstep(y1, y0, y) : 0);
  const halfAt = (y: number): number => (tree.w / 2) * (1 - B.trunkTaper * rise(y));
  const lean = (y: number): number => B.trunkLean * tree.w * rise(y) ** 1.4;
  const xr = (y: number): number =>
    tree.x + lean(y) + halfAt(y) + 4 + 8 * wobble(y, seed, 300) + 3 * wobble(y, seed + 3, 60) + collar(1, y);
  const xl = (y: number): number =>
    tree.x +
    lean(y) -
    halfAt(y) -
    4 -
    8 * wobble(y, seed + 40, 300) -
    3 * wobble(y, seed + 43, 60) -
    collar(-1, y);
  // The outline: down the right flank, back up the left, a jagged break across the top if it ends here.
  const poly: number[] = [];
  for (let y = y0; y <= y1; y += 8) poly.push(xr(y), y);
  for (let y = y1; y >= y0; y -= 8) poly.push(xl(y), y);
  const crown: number[] = [];
  if (broken) {
    const n = 11;
    for (let k = 1; k < n; k++) {
      const x = lerp(xl(y0), xr(y0), (k + range(r, -0.3, 0.3)) / n);
      const y = y0 - range(r, -14, 1) * (k % 3 ? 1 : -3) - (k === 4 ? range(r, 30, 60) : 0);
      poly.push(x, y);
      crown.push(x, y);
    }
  }
  p.solid(poly, B.bark, h0, { bark: 1 });
  const strip = (inset: number, w: number): number[] => {
    const pts: number[] = [];
    for (let y = y0; y <= y1; y += 8) pts.push(xr(y) - inset - w, y);
    for (let y = y1; y >= y0; y -= 8) pts.push(xr(y) - inset, y);
    return pts;
  };
  const lstrip = (inset: number, w: number): number[] => {
    const pts: number[] = [];
    for (let y = y0; y <= y1; y += 8) pts.push(xl(y) + inset, y);
    for (let y = y1; y >= y0; y -= 8) pts.push(xl(y) + inset + w, y);
    return pts;
  };
  // Round: the face turns toward the moon on the right, away on the left.
  p.bump(strip(16, Math.min(150, tree.w * 0.7)), h0 + 0.1, { bark: 1 });
  p.bump(strip(36, Math.min(90, tree.w * 0.4)), h0 + 0.18, { bark: 1 });
  p.tint(lstrip(0, tree.w * 0.4), B.barkDark, 0.55);
  p.tint(lstrip(0, tree.w * 0.18), B.barkDeep, 0.45);
  p.tint(strip(0, 10), B.barkDark, 0.4);
  // Bark ridges: long vertical fissures that part round the collars.
  const rows = Math.round(tree.w / 12);
  for (let k = 0; k < rows; k++) {
    const inset = 8 + k * 12 + range(r, -4, 4);
    for (let y = y0 + range(r, 0, 120); y < y1; ) {
      const len = range(r, 50, 300);
      const line: number[] = [];
      for (let yy = y; yy <= y + len; yy += 8) {
        let x = xr(yy) - collar(1, yy) - inset + 5 * wobble(yy, seed + k * 7, 110);
        for (const j of joins) {
          const d = (yy - (j.y + 30)) / 110;
          const near = j.side > 0 ? inset : tree.w - inset;
          if (Math.abs(d) < 2.5 && near < 150) x -= j.side * 30 * Math.exp(-d * d) * (1 - near / 150);
        }
        line.push(x, yy);
      }
      if (line.length >= 6) {
        const w = range(r, 2.4, 5);
        p.bump(strand(line, w * 1.6), h0 - 0.06, { bark: 1, alpha: 0.85 });
        p.tint(strand(line, w), B.barkDeep, 0.6);
      }
      y += len + range(r, 10, 110);
    }
  }
  for (const j of joins) {
    const edge = (y: number): number => (j.side > 0 ? xr(y) - collar(1, y) : xl(y) + collar(-1, y));
    const cx = edge(j.y);
    // The collar's grain wraps round it, parallel to its edge.
    for (let k = 0; k < 6; k++) {
      const inset = 6 + k * 9 + range(r, -2, 2);
      const arc: number[] = [];
      for (let y = j.y + 4; y <= j.y + j.th * 1.08; y += 6) {
        const c = collar(j.side, y);
        arc.push(edge(y) + j.side * (c - inset - (1 - c / B.collar) * k * 4), y);
      }
      if (arc.length >= 6) {
        const w = range(r, 2.4, 4);
        p.bump(strand(arc, w * 2, 0.25), h0 + 0.12, { bark: 0.6, alpha: 0.85 });
        p.tint(strand(arc, w, 0.25), B.barkDeep, 0.45);
      }
    }
    // The branch bark ridge: rough folds running up and back from the top of the joint.
    for (let k = 0; k < 3; k++) {
      const sx = cx - j.side * (4 + k * 10);
      const sy = j.y - 2 - k * 12;
      const len = 34 + k * 14 + range(r, -6, 6);
      const fold = quad(
        sx,
        sy,
        sx - j.side * len * 0.55,
        sy - len * 0.1,
        sx - j.side * len * 0.8,
        sy - len * 0.7,
        10,
      );
      const w = range(r, 4, 7);
      p.bump(strand(fold, w * 2.4, 0.4), h0 + 0.12, { bark: 0.6, alpha: 0.85 });
      p.tint(strand(fold, w, 0.4), B.barkDeep, 0.4);
    }
    // The limb's shadow on the trunk under it.
    const sh: number[] = [];
    for (let y = j.y + j.th * 0.85; y <= j.y + j.th + 560; y += 20) sh.push(edge(y) + j.side * 2, y);
    for (let y = j.y + j.th + 560; y >= j.y + j.th * 0.85; y -= 20)
      sh.push(edge(y) - j.side * (140 + (y - j.y) * 0.12), y);
    p.tint(chaikin(sh, 2), B.barkDeep, 0.6);
  }
  // Moss streaks run down the trunk, and lichen.
  for (let k = 0; k < Math.round(tree.w / 28); k++) {
    const x = range(r, 24, tree.w - 20);
    const ya = range(r, y0 + 40, y0 + (y1 - y0) * 0.72);
    const len = range(r, 80, 360);
    const line: number[] = [];
    for (let y = ya; y <= ya + len; y += 8)
      line.push(xr(y) - collar(1, y) - x + 6 * wobble(y, seed + k, 90), y);
    p.solid(strand(line, range(r, 8, 22), 0.4), B.mossDark, h0 + 0.1, { moss: 1, alpha: 0.85 });
  }
  for (let k = 0; k < 5; k++)
    lichen(
      p,
      xr(y0) - range(r, 20, Math.min(120, tree.w - 20)),
      range(r, y0 + 200, y0 + (y1 - y0) * 0.7),
      14,
      h0 + 0.05,
      seed + k,
    );
  // Deeper down, the trunk sinks into the dark wood (in soft steps, so no edge shows).
  const yd = Math.max(y0, roomH * 0.5);
  for (let k = 0; k < 5; k++) {
    const yk = yd + k * 110;
    if (yk >= y1) break;
    const sk: number[] = [];
    for (let y = yk; y <= y1; y += 20) sk.push(xr(y) + 2, y);
    for (let y = y1; y >= yk; y -= 20) sk.push(xl(y) - 2, y);
    p.tint(sk, B.barkDeep, 0.13);
  }
  if (decor)
    gradBand(
      p,
      { pts: [tree.x, y0, tree.x, y1], w: [tree.w * 1.6, tree.w * 1.6], h: h0, seed, moss: 0, detail: 0 },
      -0.5,
      0.5,
      B.decorHaze,
      B.decorHazeA,
      B.decorHazeA,
      1,
    );
  if (!broken) return;
  // The broken top: dark splintered wood (it must not catch the moon like a lit crown).
  const cap: number[] = [xl(y0 + 60), y0 + 60, ...crown, xr(y0 + 60), y0 + 60];
  p.tint(cap, B.barkDeep, 0.6);
  p.tint(clipAbove(poly, y0 + 26), B.barkDeep, 0.35);
}

/** A broken-topped tree's crown: a few limbs drooping out and down from under the break, leaves on them. */
function droopCrown(p: Paint, plan: BranchPlan, tree: TreeLike, seed: number): void {
  const B = BRANCH;
  const r = rngFor(seed, 81);
  const top = tree.top;
  const cx = tree.x + B.trunkLean * tree.w;
  for (let k = 0; k < B.droopLimbs; k++) {
    const side = k % 2 ? 1 : -1;
    const sy = top + range(r, 60, 260);
    const sx = cx + side * tree.w * 0.28;
    const len = range(r, 160, 300);
    const ex = sx + side * len * range(r, 0.3, 0.5);
    const ey = sy + len * range(r, 0.8, 1);
    // Out a little, then hanging: never arching up (that read as horns).
    const line = cubic(sx, sy, sx + side * len * 0.3, sy + len * 0.05, ex, ey - len * 0.45, ex, ey, 20);
    const w0 = range(r, 12, 20);
    const dl = lineLimb(line, (t) => w0 * (1 - 0.75 * t), B.backH + 0.04, seed + k, 0.3, 0.4);
    paintLimb(p, dl);
    p.tint(band(dl), B.barkDeep, 0.45);
    for (let j = 0; j < 3; j++) {
      const t = range(r, 0.35, 1);
      const q = Math.min(19, Math.round(t * 20));
      twig(
        p,
        plan,
        line[q * 2] as number,
        line[q * 2 + 1] as number,
        Math.PI / 2 + side * range(r, 0.1, 0.8),
        range(r, 50, 100),
        5,
        B.walkH - 0.12,
        seed + k * 7 + j,
      );
    }
    plan.hangs.push({
      x0: Math.min(sx, ex),
      x1: Math.max(sx, ex),
      y: (x) => lerp(sy + 10, ey + 6, clamp((x - sx) / (ex - sx || 1), 0, 1)),
      deep: false,
      reach: 140,
    });
  }
}

/**
 * The dark tangle of canopy the branch ends in: soft dark masses and crossing twisted limbs in the
 * bake, and leaf clumps over them that the growth builds (live, in the wind). Crowns stay well under
 * the last walk line; it fills the drop she falls into.
 */
function paintCanopy(
  p: Paint,
  plan: BranchPlan,
  info: TerrainInfo,
  x0: number,
  x1: number,
  top: number,
  roomH: number,
  seed: number,
): void {
  const B = BRANCH;
  const r = rngFor(seed, 3);
  // Twisted limbs crossing behind the leaves: the tangle's bones.
  for (let k = 0; k < B.tangleLimbs; k++) {
    const sx = range(r, x0, x1);
    const sy = range(r, top + 160, Math.min(roomH, top + B.canopyDepth));
    const len = range(r, 160, 340);
    // Mostly level or drooping: limbs that rise out of the leaves read as tentacles.
    const a = (r() < 0.5 ? Math.PI : 0) + range(r, -0.35, 0.5) * (r() < 0.5 ? 1 : -1);
    const ex = sx + Math.cos(a) * len;
    const ey = sy + Math.abs(Math.sin(a)) * len * 0.5;
    const line = cubic(
      sx,
      sy,
      sx + range(r, -120, 120),
      sy - len * 0.3,
      ex + range(r, -120, 120),
      ey + len * 0.2,
      ex,
      ey,
      18,
    );
    const tl = lineLimb(line, (t) => range(r, 16, 30) * (1 - t * 0.75), B.backH - 0.06, seed + k, 0, 0.3);
    paintLimb(p, tl);
    p.tint(band(tl), B.barkDeep, 0.7);
    plan.sprigs.push({ x: ex, y: ey, a, size: 0.7, deep: true });
  }
  for (let k = 0; k < B.canopyClumps; k++) {
    const cx = range(r, x0, x1);
    const cy =
      range(r, top + 150, Math.min(roomH + 60, top + B.canopyDepth)) + Math.max(0, x0 + 300 - cx) * 0.6;
    const rx = range(r, 70, 170);
    const ry = rx * range(r, 0.5, 0.8);
    p.solid(
      chaikin(blob(cx, cy, rx * 0.5, ry * 0.5, seed + k * 11, 0.6, 22), 1),
      B.leafDark,
      B.backH - 0.06,
      {
        moss: 0.2,
      },
    );
    plan.clumps.push({ x: cx, y: cy, rx, ry });
    plan.hangs.push({ x0: cx - rx * 0.5, x1: cx + rx * 0.5, y: () => cy + ry * 0.7, deep: true, reach: 70 });
  }
  plan.clumps.sort((a, b) => b.y - a.y);
  // Deep in, the tangle sinks into the dark below (no mist: the drop goes to black).
  info.mist.push({
    x: (x0 + x1) / 2,
    y: top + 140,
    rx: (x1 - x0) * 0.6,
    ry: 90,
    amount: 0.35,
    color: B.mist,
    power: 1.2,
    backOnly: 1,
  });
}

/**
 * A snapped end: the limb broke here long ago. A jagged break across it, pale torn wood on the face,
 * splinters and fibres standing out of it, a dark rotten heart.
 */
function snapped(p: Paint, plan: BranchPlan, st: Stretch, dir: 1 | -1, seed: number): void {
  const B = BRANCH;
  const r = rngFor(seed, 23);
  const xe = dir > 0 ? st.x1 : st.x0;
  const top = st.top(xe);
  const bot = st.under(xe);
  const h = bot - top;
  // The break slants: the top fibres (in tension) tore out further than the bottom.
  const lean = -range(r, 0.3, 0.55) * h;
  // (Close to the collision edge: broken wood far past it reads as more floor; the lit lip ends at the edge.)
  const out = range(r, 2, 7);
  const xIn = xe - dir * 70;
  // The jagged break line, top to bottom.
  const brk: number[] = [];
  const nb = 6;
  for (let k = 0; k <= nb; k++) {
    const t = k / nb;
    const jag = (k % 2 ? 1 : -1) * range(r, 6, 16) * Math.sin(Math.PI * t) ** 0.4;
    brk.push(xe + dir * (out + lean * t + jag), lerp(top + 7, bot - 3, t));
  }
  const poly: number[] = [];
  for (let x = xIn; dir > 0 ? x <= xe - 6 : x >= xe + 6; x += dir * 8) poly.push(x, st.top(x));
  poly.push(...brk);
  for (let x = xe; dir > 0 ? x >= xIn : x <= xIn; x -= dir * 8) poly.push(x, st.under(x));
  // Dark broken wood: relief sloping down toward the break (a flat plateau caught the moon as a pale nose).
  p.solid(poly, B.barkDark, B.walkH - 0.08, { bark: 0.12 });
  p.tint(poly, B.barkDeep, 0.45);
  // The face: pale torn wood just inside the break, cracks, a dark heart.
  const face: number[] = [...brk];
  for (let k = nb; k >= 0; k--)
    face.push((brk[k * 2] as number) - dir * range(r, 12, 22), brk[k * 2 + 1] as number);
  p.tint(face, B.wood, 0.35);
  p.tint(blob(xe + dir * (out - 4), lerp(top, bot, 0.55), 6, h * 0.18, seed + 3, 0.4, 12), B.barkDeep, 0.75);
  for (let k = 0; k < 4; k++) {
    const y = lerp(top + 8, bot - 6, range(r, 0, 1));
    p.tint(strand([xe - dir * 16, y, xe + dir * (out - 2), y + range(r, -3, 3)], 1.4, 0.3), B.barkDeep, 0.6);
  }
  // Splinters and fibres standing out of the face (the longest from the top, where the bark tore).
  const ns = 6 + Math.floor(r() * 4);
  for (let k = 0; k < ns; k++) {
    const t = k < 3 ? range(r, 0, 0.2) : range(r, 0.05, 0.95);
    const sy = lerp(top + 6, bot - 4, t);
    const sx = xe + dir * (out + lean * t - 2);
    const len = (k < 3 ? range(r, 34, 64) : range(r, 10, 30)) * (1 - t * 0.6);
    const ang = dir > 0 ? range(r, -0.35, 0.3) : Math.PI + range(r, -0.3, 0.35);
    const w = range(r, 2, 4.6);
    const tip = [
      sx,
      sy,
      sx + Math.cos(ang) * len * 0.5,
      sy + Math.sin(ang) * len * 0.5 + 1,
      sx + Math.cos(ang) * len,
      sy + Math.sin(ang) * len,
    ];
    const pts = resample(tip, 2);
    const nn = pts.length / 2;
    const left: number[] = [];
    const right: number[] = [];
    for (let i = 0; i < nn; i++) {
      const u = i / Math.max(1, nn - 1);
      const [nx, ny] = normal(pts, i);
      const ww = (w * (1 - u)) / 2 + 0.2;
      left.push((pts[i * 2] as number) + nx * ww, (pts[i * 2 + 1] as number) + ny * ww);
      right.push((pts[i * 2] as number) - nx * ww, (pts[i * 2 + 1] as number) - ny * ww);
    }
    for (let i = nn - 1; i >= 0; i--) left.push(right[i * 2] as number, right[i * 2 + 1] as number);
    p.solid(left, mix(B.wood, B.bark, range(r, 0.2, 0.6)), B.walkH - 0.04, { bark: 0.4 });
  }
  // A dead twig stub still on the broken end, and moss creeping toward it.
  twig(
    p,
    plan,
    xe - dir * 30,
    bot - h * 0.25,
    Math.PI / 2 + dir * 0.6,
    range(r, 22, 40),
    4,
    B.walkH - 0.1,
    seed + 5,
  );
}

/** How a fork joins its two stretches (varied along the route: no silhouette twice). */
type ForkKind = 'dip' | 'behind' | 'hang';

/**
 * A fork. Three ways, chosen along the route so no two look alike, none an X and none a limb plunging
 * off the frame:
 *   dip     the limb sags under the gap and rises into the next stretch (one limb going on); a short
 *           tine curls up off the parent's end into twigs
 *   behind  the next stretch grows from behind: a dark back-plane limb leaves the parent's flank and
 *           comes forward into it; the parent's end curls up into a leafy tine
 *   hang    the parent's end droops into a hanging tine; the next stretch grows out of it partway down
 *           and the rest hangs on in twigs and leaves
 */
function fork(
  p: Paint,
  plan: BranchPlan,
  _info: TerrainInfo,
  st: Stretch,
  child: Stretch,
  seed: number,
  kind: ForkKind,
): void {
  const B = BRANCH;
  const r = rngFor(seed, 51);
  const dir = st.grows;
  const xe = dir > 0 ? st.x1 : st.x0;
  const cx0 = dir > 0 ? child.x0 : child.x1;
  const topE = st.top(xe);
  const thE = st.th(xe);
  const cTop = child.top(cx0);
  const cTh = child.th(cx0 + dir * 30);
  const ax = cx0 + dir * 40;
  const ay = child.top(ax) + child.th(ax) / 2;
  // A short tine curling up off the parent's end, fraying into twigs and leaves inside the frame.
  const curl = (len: number, up: number, w: number): void => {
    const sx = xe - dir * 34;
    const sy = topE + thE * 0.45;
    // Out and slightly up, then drooping at the end under its leaves (an upward hook read as a horn).
    const tx = xe + dir * len;
    const ty = topE + thE * 0.2 - up * 0.35;
    const line = cubic(
      sx,
      sy,
      xe + dir * len * 0.4,
      sy - up * 0.6,
      tx - dir * len * 0.2,
      ty - up * 0.3,
      tx,
      ty,
      14,
    );
    paintLimb(
      p,
      lineLimb(line, (t) => Math.max(4, w * (1 - t) ** 1.1), B.walkH - 0.06, seed + 9, 0, 0.5),
    );
    const a = Math.atan2(ty - (ty + up * 0.4), dir * len * 0.1);
    twig(p, plan, tx, ty, a - dir * 0.3, range(r, 30, 52), 5, B.walkH - 0.1, seed + 10);
    twig(p, plan, tx, ty + 4, a + dir * 0.7, range(r, 26, 44), 4, B.walkH - 0.1, seed + 11);
  };
  const swell = (x: number, y: number, w: number): void => {
    p.solid(blob(x, y, w * 0.85, w * 0.7, seed + 5, 0.2, 18), B.bark, B.walkH - 0.02, { bark: 0.12 });
    dome(p, x, y, w * 0.75, w * 0.6, B.walkH + 0.02, B.walkH + 0.1, seed + 6);
    p.tint(blob(x, y + w * 0.35, w * 0.75, w * 0.32, seed + 7, 0.3, 14), B.barkDeep, 0.5);
  };
  if (kind === 'dip') {
    const cx = lerp(xe, cx0, range(r, 0.42, 0.58));
    const cy = Math.max(topE, cTop) + Math.max(thE, cTh) + B.dipBelow;
    // It leaves the parent's UNDERSIDE well before the walk's end and joins the child's belly well
    // after its start, dark, in the back plane, no moss: the walk line visibly ends at both edges of
    // the gap (first-timers read a walk-plane U here as floor and fell through it).
    const sx = xe - dir * B.dipIn;
    const sy = st.under(sx) - thE * 0.3;
    const ex = cx0 + dir * B.dipIn;
    const ey = child.under(ex) - cTh * 0.3;
    const line = [
      ...cubic(sx, sy, sx + dir * 90, sy + 40, cx - dir * 90, cy, cx, cy, 14),
      ...cubic(cx, cy, cx + dir * 90, cy, ex - dir * 90, ey + 40, ex, ey, 14).slice(2),
    ];
    const L = lineLimb(
      line,
      (t) => lerp(thE * 0.62, cTh * 0.66, smoothstep(0, 1, t)) * (1 - 0.18 * Math.sin(Math.PI * t)),
      B.backH + 0.06,
      seed + 1,
      0,
      0.8,
    );
    paintLimb(p, L);
    p.tint(band(L), B.barkDeep, 0.5);
    curl(range(r, 70, 100), range(r, 28, 46), thE * 0.45);
    // Beards along its low part, hung from its real underside.
    const n = L.pts.length / 2;
    const i0 = Math.round(n * 0.3);
    const i1 = Math.round(n * 0.7);
    const xa = L.pts[i0 * 2] as number;
    const xb = L.pts[i1 * 2] as number;
    const under = (x: number): number => {
      let best = 0;
      let bd = Infinity;
      for (let i = i0; i <= i1; i++) {
        const d = Math.abs((L.pts[i * 2] as number) - x);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return (L.pts[best * 2 + 1] as number) + (L.w[best] as number) * 0.4;
    };
    plan.hangs.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), y: under, deep: true, reach: 80 });
  } else if (kind === 'behind') {
    const sx = xe - dir * range(r, 120, 170);
    const sy = topE + thE * 0.6;
    // It comes in under the child's belly, never at its walk height (that read as floor across the gap).
    const bx = cx0 + dir * B.dipIn;
    const by = child.under(bx) - cTh * 0.35;
    const line = cubic(sx, sy, xe + dir * 30, sy + thE * 1.4, bx - dir * 120, by + 90, bx, by, 22);
    const L = lineLimb(
      line,
      (t) => lerp(thE * 0.6, cTh * 0.6, smoothstep(0.2, 1, t)),
      B.backH + 0.06,
      seed + 1,
      0.3,
      0.6,
    );
    paintLimb(p, L);
    const n = L.pts.length / 2;
    p.tint(band(L, -0.5, 0.5, 0, Math.round(n * 0.85)), B.barkDeep, 0.45);
    curl(range(r, 90, 130), range(r, 46, 74), thE * 0.55);
    stub(
      p,
      xe - dir * 70,
      st.under(xe - dir * 70) - 6,
      Math.PI / 2 + dir * 0.4,
      range(r, 16, 26),
      10,
      B.walkH - 0.04,
    );
  } else {
    // Hanging: the end droops; the child grows out of it partway down; the rest hangs on.
    const hx = xe + dir * range(r, 50, 80);
    const hy = Math.max(cTop + cTh + 70, topE + 230);
    const line = cubic(
      xe - dir * 60,
      topE + thE / 2,
      xe + dir * 40,
      topE + thE / 2 + 6,
      hx + dir * 10,
      hy - 140,
      hx,
      hy,
      24,
    );
    const L = lineLimb(line, (t) => thE * lerp(0.95, 0.3, t), B.walkH - 0.04, seed + 1, 0, 0.8);
    paintLimb(p, L);
    const n = L.pts.length / 2;
    // Past the walk's end it is not floor: dark from there on.
    let e0 = n - 1;
    for (let i = 0; i < n; i++)
      if (dir * ((L.pts[i * 2] as number) - xe) > 6) {
        e0 = i;
        break;
      }
    p.tint(band(L, -0.5, 0.5, e0, n - 1), B.barkDeep, 0.35);
    let q = n - 1;
    for (let i = 0; i < n; i++)
      if ((L.pts[i * 2 + 1] as number) >= ay) {
        q = i;
        break;
      }
    const cx = L.pts[q * 2] as number;
    const cy = L.pts[q * 2 + 1] as number;
    const w = L.w[q] as number;
    const tine = cubic(cx, cy, cx + dir * 40, cy - 6, ax - dir * 50, ay + 4, ax, ay, 14);
    paintLimb(
      p,
      lineLimb(tine, (t) => lerp(w * 0.9, cTh, t), B.walkH, seed + 2, 0.4, 0.9),
    );
    swell(cx, cy, Math.max(w, cTh) * 0.7);
    p.tint(band(L, -0.5, 0.5, q, n - 1), B.barkDeep, 0.4);
    for (let k = 0; k < 3; k++)
      twig(
        p,
        plan,
        hx,
        hy,
        Math.PI / 2 + dir * range(r, -0.5, 0.6),
        range(r, 40, 80),
        5,
        B.walkH - 0.1,
        seed + 20 + k,
      );
    plan.hangs.push({
      x0: Math.min(xe, hx) - 10,
      x1: Math.max(xe, hx) + 10,
      y: (x) => lerp(topE + thE, hy, clamp((x - xe) / (hx - xe || 1), 0, 1)),
      deep: false,
      reach: 90,
    });
  }
}

/** The child's end at a fork: its top corner rounds over into the tine that rises into it. */
function crotchEnd(p: Paint, st: Stretch, dir: 1 | -1, _seed: number): void {
  const B = BRANCH;
  const xe = dir < 0 ? st.x0 : st.x1;
  const th0 = st.th(xe - dir * 40);
  const top = st.top(xe);
  const rad = 20;
  const k: number[] = [xe - dir * 120, st.top(xe - dir * 120)];
  // Round the top corner: the arc from the top to the face (center inside the limb).
  for (let k2 = 0; k2 <= 7; k2++) {
    const a = -Math.PI / 2 + (dir * (Math.PI / 2) * k2) / 7;
    k.push(xe - dir * rad + Math.cos(a) * rad, top + rad + Math.sin(a) * rad);
  }
  k.push(
    xe + dir * 2,
    top + th0 * 0.6,
    xe - dir * 14,
    top + th0 + 8,
    xe - dir * 120,
    st.under(xe - dir * 120),
  );
  const poly = chaikin(k, 2);
  p.solid(poly, B.bark, B.walkH, { bark: 0.12 });
  shadeJoint(p, poly, top, top + th0);
}

/** A blunt natural end (a limb's outer end that she lands on): rounded, moss over it, twigs. */
function nub(p: Paint, plan: BranchPlan, st: Stretch, dir: 1 | -1, seed: number): void {
  const B = BRANCH;
  const r = rngFor(seed, 61);
  const xe = dir > 0 ? st.x1 : st.x0;
  const th0 = st.th(xe);
  const top = st.top(xe - dir * 6);
  const tx = xe + dir * 22;
  const line = cubic(
    xe - dir * 50,
    top + th0 / 2,
    xe - dir * 10,
    top + th0 / 2,
    tx - dir * 4,
    top + th0 * 0.42,
    tx,
    top + th0 * 0.5,
    10,
  );
  paintLimb(
    p,
    lineLimb(line, (t) => th0 * (1 - t * t * 0.55), B.walkH, seed + 1, 0, 0.6),
  );
  twig(
    p,
    plan,
    tx,
    top + th0 * 0.35,
    dir > 0 ? -0.5 : Math.PI + 0.5,
    range(r, 40, 64),
    6,
    B.walkH - 0.1,
    seed + 2,
  );
  twig(
    p,
    plan,
    tx - dir * 4,
    top + th0 * 0.75,
    dir > 0 ? 0.6 : Math.PI - 0.6,
    range(r, 26, 44),
    5,
    B.walkH - 0.1,
    seed + 3,
  );
}

/**
 * The end of the walk: the limb thins and frays into a twiggy tangle that runs on into the canopy
 * she drops into.
 */
function tipTangle(
  p: Paint,
  plan: BranchPlan,
  info: TerrainInfo,
  st: Stretch,
  room: Room,
  seed: number,
): void {
  const B = BRANCH;
  const r = rngFor(seed, 71);
  const dir = st.grows;
  const xe = dir > 0 ? st.x1 : st.x0;
  const top = st.top(xe - dir * 4);
  const th0 = st.under(xe) - top;
  const tx = xe + dir * range(r, 90, 130);
  const ty = top + th0 * 0.4 + range(r, 30, 50);
  const line = cubic(
    xe - dir * 60,
    top + th0 / 2,
    xe + dir * 30,
    top + th0 / 2,
    tx - dir * 40,
    ty - 10,
    tx,
    ty,
    16,
  );
  paintLimb(
    p,
    lineLimb(line, (t) => Math.max(4, th0 * (1 - t) ** 1.1), B.walkH, seed + 1, 0.4, 0.6),
  );
  // The fray: twigs fanning out and down from the last of it, more off the underside.
  for (let k = 0; k < 6; k++) {
    const t = range(r, 0.4, 1);
    const q = Math.min(15, Math.round(t * 16));
    const px = line[q * 2] as number;
    const py = line[q * 2 + 1] as number;
    const a = dir > 0 ? range(r, -0.6, 1.2) : Math.PI - range(r, -0.6, 1.2);
    twig(p, plan, px, py, a, range(r, 50, 110), range(r, 4, 7), B.walkH - 0.1, seed + 10 + k);
  }
  // Under and beyond it, the canopy she drops into.
  paintCanopy(p, plan, info, xe - dir * 120, room.width + 120, top + 70, room.height, seed + 3);
}

/** Paints the wood room's playfield. */
/** A solid the wood paints as bulk, not as a limb (pf-mass.ts). */
export function isMass(s: { tag: string }): boolean {
  return s.tag === 'root' || s.tag === 'ground';
}

/** A cover or a rotten wall painted as the mass it sits in, to bake on its own (mass-patches.ts). */
export interface MassPatch {
  key: string;
  rect: { x: number; y: number; w: number; h: number };
  /** Over her (a cover) or behind her (a wall). */
  front: boolean;
  paint: Paint;
}

export function paintBranchTerrain(
  room: Room,
  seed: number,
): { paint: Paint; info: TerrainInfo; plan: BranchPlan; patches: MassPatch[] } {
  const B = BRANCH;
  const p = new Paint(room.width, room.height);
  const trees = planTrees(room);
  const stretches = planStretches(room, trees);
  const info = terrainInfo(room, stretches);
  const plan: BranchPlan = { stretches, sprigs: [], hangs: [], clear: [], cocoons: [], clumps: [] };
  for (const c of room.marks?.cocoons ?? []) {
    plan.cocoons.push({ x: c.x, y: c.y });
    plan.clear.push({ x: c.x, r: 20, y: c.y });
  }
  const tat = room.marks?.tatter;
  if (tat) plan.clear.push({ x: tat.x, r: 60, y: tat.y });
  const cx0 = plan.cocoons.length ? Math.min(...plan.cocoons.map((c) => c.x)) - 120 : 0;
  const cx1 = plan.cocoons.length ? Math.max(...plan.cocoons.map((c) => c.x)) + 120 : -1;
  const busy = (x: number): boolean => (x > cx0 && x < cx1) || (!!tat && Math.abs(x - tat.x) < 140);
  const sdOf = (st: Stretch): number => seed + st.s.x * 7 + st.s.y;
  const childOf = (st: Stretch): Stretch | undefined => stretches.find((o) => o.parent === st.id);

  // 0. The back walls of carved space (pf-mass.ts), behind everything.
  const backs = room.marks?.backs ?? [];
  if (backs.length)
    paintBacks(
      p,
      backs,
      room.solids.some((q) => q.tag === 'ground'),
      seed + 5,
    );

  // 1. Forks (the parent's dip, the lower tine, the crotch, the rising tine) behind the walk.
  const kinds: ForkKind[] = ['dip', 'behind', 'hang'];
  let forks = 0;
  for (const st of stretches) {
    const far = st.grows > 0 ? st.east : st.west;
    const child = childOf(st);
    if (far === 'fork' && child)
      fork(p, plan, info, st, child, sdOf(st) + 3, kinds[forks++ % kinds.length] as ForkKind);
  }

  // 1b. Decor trees (no collision) stand behind the walk: painted first, the limbs over them.
  const joinsOf = (t: TreeLike): Join[] => {
    const joins: Join[] = [];
    for (const st of stretches) {
      if (st.parent !== t.id) continue;
      const side: -1 | 1 = st.grows > 0 ? 1 : -1;
      const x = st.grows > 0 ? st.x0 + 30 : st.x1 - 30;
      joins.push({ side, y: st.top(x), th: st.th(x) });
    }
    return joins;
  };
  for (const t of trees) {
    if (t.solid) continue;
    paintTrunk(p, t, joinsOf(t), room.height, seed + Math.round(t.x));
    if (t.top > -40) droopCrown(p, plan, t, seed + Math.round(t.x) + 3);
  }

  // 1c. The masses (root / ground: the wood's bulk that encloses space, pf-mass.ts), behind the limbs. Their tops
  // join the stretches (rim, growth) after the limbs are painted.
  const massPlan: BranchPlan = { stretches: [], sprigs: [], hangs: [], clear: [], cocoons: [], clumps: [] };
  paintMasses(p, massPlan, room.solids.filter(isMass), room.width, room.height, seed);

  // 2. The stretches. A root in a solid tree runs on into it (the trunk's collar wraps it, step 3); a
  // root in a decor tree sinks into its dark.
  for (const st of stretches) {
    const sd = sdOf(st);
    const r = rngFor(sd, 6);
    const xa = st.west === 'trunk' ? st.x0 - 70 : st.west === 'under' ? st.x0 - 60 : st.x0;
    const xb = st.east === 'trunk' ? st.x1 + 70 : st.east === 'burl' ? st.x1 + 30 : st.x1;
    const L = stretchLimb(st, xa, xb, sd);
    const rootTree = trees.find((t) => t.id === st.parent);
    paintLimb(p, L, knotsFor(L, sd, 640));
    if (rootTree && !rootTree.solid) {
      // The root sinks into the decor tree's dark over the part inside its trunk (no cut end in front).
      const n = L.pts.length / 2;
      const edge = rootTree.x + (st.grows > 0 ? rootTree.w / 2 : -rootTree.w / 2);
      for (let k = 1; k <= 5; k++) {
        const lim = edge - st.grows * (k - 1) * 12;
        let i0 = -1;
        let i1 = -1;
        for (let i = 0; i < n; i++) {
          if (-st.grows * ((L.pts[i * 2] as number) - lim) >= 0) {
            if (i0 < 0) i0 = i;
            i1 = i;
          }
        }
        if (i0 >= 0 && i1 > i0) p.tint(band(L, -0.5, 0.5, i0, i1), B.decorHaze, 0.16);
      }
    }
    // Where she climbs out of her cocoon the face is near-black, like her: a little cool moonlight
    // on the mid flank and a rim of fog-light along the underside, so her silhouette reads on it.
    const n = L.pts.length / 2;
    let i0 = -1;
    let i1 = -1;
    for (let i = 0; i < n; i++) {
      const x = L.pts[i * 2] as number;
      if (x > cx0 && x < cx1) {
        if (i0 < 0) i0 = i;
        i1 = i;
      }
    }
    if (i0 >= 0 && i1 - i0 > 4) {
      p.tint(chaikin(band(L, -0.32, 0.3, i0, i1), 2), B.barkLit, B.climbLift);
      p.tint(chaikin(band(L, -0.2, 0.18, i0 + 3, i1 - 3), 2), B.barkLit, B.climbLift * 0.8);
      p.tint(band(L, 0.4, 0.5, i0, i1), B.climbRim, 0.32);
      p.tint(band(L, 0.45, 0.5, i0, i1), B.climbRim, 0.3);
      for (let i = i0 + 4; i < i1 - 4; i += Math.max(3, Math.round(range(r, 60, 160) / 6))) {
        const [nx, ny] = normal(L.pts, i);
        const w = L.w[i] as number;
        const v = range(r, -0.15, 0.3);
        lichen(
          p,
          (L.pts[i * 2] as number) + nx * v * w,
          (L.pts[i * 2 + 1] as number) + ny * v * w,
          range(r, 4, 9),
          B.walkH,
          sd + i,
        );
      }
    }
    for (let x = st.x0 + range(r, 60, 300); x < st.x1 - 60; x += range(r, 260, 620)) {
      if (busy(x)) continue;
      const a = Math.PI / 2 + range(r, -0.7, 0.5);
      stub(p, x, st.under(x) - 6, a, range(r, 12, 30), range(r, 9, 15), B.walkH - 0.02);
    }
  }

  // 3. Solid trees, wrapping the roots of the limbs that grow out of them.
  for (const t of trees) {
    if (!t.solid) continue;
    paintTrunk(p, t, joinsOf(t), room.height, seed + Math.round(t.x));
    if (t.top > -40) droopCrown(p, plan, t, seed + Math.round(t.x) + 3);
  }

  // 4. The ends and joins over the limbs.
  for (const st of stretches) {
    const sd = sdOf(st);
    for (const dir of [-1, 1] as const) {
      const end = dir > 0 ? st.east : st.west;
      if (end === 'snap') snapped(p, plan, st, dir, sd + 5 + dir);
      else if (end === 'nub') nub(p, plan, st, dir, sd + 9 + dir);
      else if (end === 'crotch') crotchEnd(p, st, dir, sd + 11 + dir);
      else if (end === 'tip') tipTangle(p, plan, info, st, room, sd + 13 + dir);
    }
    if (st.east === 'knee') {
      const next = stretches.find((o) => Math.abs(o.x0 - st.x1) < 2);
      if (next) {
        // The limb kinks down: its end turns over (a wide round shoulder) and runs down into the lower
        // stretch, with a deep S-curve underneath (no inner corner).
        const x1 = st.x1;
        const yA = st.top(x1);
        const yB = next.top(next.x0);
        const thN = next.under(next.x0 + 80) - yB;
        const rad = B.kneeRound;
        const k: number[] = [x1 - 200, st.top(x1 - 200)];
        for (let a = -Math.PI / 2; a <= 0.001; a += Math.PI / 16)
          k.push(x1 - rad + Math.cos(a) * rad, yA + 2 + rad + Math.sin(a) * rad);
        const midY = (yA + yB) / 2;
        k.push(x1 + 16, midY - 4, x1 + 18, midY + 16, x1 + 8, yB - 14, x1 + 14, yB + 2);
        k.push(x1 + 70, next.top(x1 + 70), x1 + 90, yB + thN * 0.6);
        const belly = cubic(
          x1 + 60,
          yB + thN + 4,
          x1 - 110,
          yB + thN + 10,
          x1 - 120,
          st.under(x1 - 260),
          x1 - 280,
          st.under(x1 - 280) - 6,
          14,
        );
        k.push(...belly);
        const poly = chaikin(k, 2);
        p.solid(poly, B.bark, B.walkH, { bark: 0.12 });
        shadeJoint(p, poly, yA, yB + thN);
        dome(p, x1 - 14, midY + 12, 34, 40, B.walkH + 0.05, B.walkH + 0.18, sd + 7);
        bendGrain(p, x1, yA, st.th(x1 - 200), yB, thN, sd + 8);
        p.tint(chaikin(belly.concat([x1 - 220, yB + 10, x1 + 40, yB + 20]), 1), B.barkDeep, 0.5);
      }
    }
    if (st.west === 'burl') {
      // The knot: the limb swells up over the step, a great eye on its face.
      const prev = stretches.find((o) => Math.abs(o.x1 - st.x0) < 2);
      const x0 = st.x0;
      const lowY = prev ? prev.top(prev.x1) : st.top(x0) + 64;
      const hiY = st.top(x0);
      const rad = 22;
      const k: number[] = [x0 + 160, st.top(x0 + 160)];
      for (let a = -Math.PI / 2; a >= -Math.PI - 0.001; a -= Math.PI / 14)
        k.push(x0 + rad + Math.cos(a) * rad, hiY + 2 + rad + Math.sin(a) * rad);
      k.push(x0 - 5, lowY - 22, x0 - 16, lowY - 2, x0 - 50, lowY + 4);
      const underPrev = prev ? prev.under(x0 - 80) : lowY + 90;
      const swell = Math.max(underPrev, st.under(x0 + 40)) + B.burlSwell;
      k.push(x0 - 90, underPrev - 6, x0 + 40, swell, x0 + 200, st.under(x0 + 200));
      const poly = chaikin(k, 2);
      p.solid(poly, B.bark, B.walkH, { bark: 0.12 });
      shadeJoint(p, poly, hiY, swell);
      // (Relief and tints stay inside the polygon: a tint over relief with no solid under it is a
      // translucent ghost.)
      dome(p, x0 + 34, lowY + 34, 48, 52, B.walkH + 0.05, B.walkH + 0.18, sd + 11);
      p.tint(blob(x0 + 40, hiY + 28, 34, 16, sd + 12, 0.3, 16), B.barkLit, 0.18);
      p.tint(blob(x0 + 20, lowY + 64, 70, 30, sd + 13, 0.3, 16), B.barkDeep, 0.45);
      knot(p, x0 + 8, lowY + 26, 16, 0.25, B.walkH, sd + 14);
    }
  }

  // 5. Moss on every walk top; the cocoons' silk pads on the underside.
  for (const st of stretches) {
    const sd = sdOf(st);
    const fw = freeWest(st);
    const fe = freeEast(st);
    const m0 = st.west === 'trunk' ? st.x0 - 8 : st.west === 'snap' ? st.x0 + 3 : st.x0;
    const m1 = st.east === 'trunk' ? st.x1 + 8 : st.east === 'snap' ? st.x1 - 3 : st.x1;
    const drape = (e: End): number =>
      e === 'nub' ? 12 : e === 'fork' || e === 'tip' || e === 'knee' || e === 'crotch' ? 28 : 0;
    mossBlanket(p, m0, m1, st.top, sd + 17, drape(st.west), drape(st.east));
    plan.hangs.push({
      x0: st.x0 + (fw ? 30 : 10),
      x1: st.x1 - (fe ? 30 : 10),
      y: (x) => st.under(x) - 5,
      deep: false,
      reach: 210,
    });
  }
  plan.stretches.push(...massPlan.stretches);
  plan.hangs.push(...massPlan.hangs);
  for (const st of massPlan.stretches)
    info.tops.push({
      x0: st.x0,
      x1: st.x1,
      y: st.y,
      kind: 'branch',
      freeL: freeWest(st),
      freeR: freeEast(st),
    });
  for (const c of plan.cocoons) {
    const st = stretches.find((o) => c.x >= o.x0 && c.x <= o.x1);
    const uy = st ? Math.min(c.y, st.under(c.x)) : c.y;
    p.solid(
      chaikin(blob(c.x, uy - 3, 9, 4, c.x, 0.4, 12), 1),
      mix(B.silk, B.bark, 0.55),
      B.walkH + 0.2,
      { moss: 0.2 },
      0.55,
    );
  }
  // The patches: each cover and rotten wall painted as the masses would be with it solid, masked to it at display.
  const patches: MassPatch[] = [];
  const masses = room.solids.filter(isMass);
  if (masses.length && room.art?.pieces) {
    const tag = masses.some((q) => q.tag === 'ground') ? 'ground' : 'root';
    const one = (key: string, r: { x: number; y: number; w: number; h: number }, front: boolean) => {
      const pp = new Paint(room.width, room.height);
      paintMasses(pp, null, [...masses, { ...r, tag }], room.width, room.height, seed, r);
      patches.push({ key, rect: { x: r.x, y: r.y, w: r.w, h: r.h }, front, paint: pp });
    };
    for (const b of (room as { bark?: Array<{ id: string; x: number; y: number; w: number; h: number }> })
      .bark ?? [])
      one(`bark:${b.id}`, b, false);
    for (const c of room.marks?.covers ?? []) one(`cover:${c.id}`, c, true);
  }
  return { paint: p, info, plan, patches };
}

function terrainInfo(room: Room, stretches: Stretch[]): TerrainInfo {
  const tops = [...room.solids, ...room.oneWays.map((o) => ({ ...o, h: 0 }))];
  const mist: MistFill[] = [];
  return {
    tops: stretches.map((st) => ({
      x0: st.x0,
      x1: st.x1,
      y: st.y,
      kind: 'branch' as const,
      freeL: freeWest(st),
      freeR: freeEast(st),
    })),
    unders: stretches.map((st) => ({ x0: st.x0 + 20, x1: st.x1 - 20, y: st.under, kind: 'branch' as const })),
    faces: [],
    twigs: [],
    ivy: [],
    keepClear: [],
    clearSpots: [],
    covered: [],
    lee: [],
    lanterns: [],
    noGlow: [],
    calm: [],
    hangers: [],
    pockets: [],
    mist,
    pool: null,
    // The highest top over x (the room has no ground: below the branches is the drop).
    groundY: (x: number): number => {
      let y = room.height;
      for (const q of tops) if (x >= q.x && x < q.x + q.w && q.y < y) y = q.y;
      return y;
    },
  };
}
