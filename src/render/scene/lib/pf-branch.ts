/**
 * The wood kit's playfield (rooms with `art.kit: 'wood'`): one old living branch high in a tree at
 * night, painted from the room's rects. Collision is boxes; the picture is a limb.
 *
 *   trunk    the great bole the branch grows out of: bark ridges, the collar that wraps the limb's
 *            root, the wrinkles over it, moss
 *   branch   each walk rect is a stretch of the same limb. How two stretches meet decides the form:
 *            abutting, higher    the knot: a burl swells up over the step
 *            abutting, lower     a knee: the limb kinks down, a thin fork runs on as twigs
 *            a gap to the next   a fork: the upper prong runs to the rect's end and frays into twigs,
 *                                the main mass dives into the mist below; the next stretch's end is
 *                                the top of another prong rising out of it
 *            nothing after it    the end: the tip frays, the main mass dives into the dark canopy
 *            the room's edge     another tree's branch (the far branch): enters thick, tapers
 *
 * Every stretch's top is its collision top (the moss rim is the path, the live rim in pf-rim.ts lays
 * the moonlight on it); the underside is free, dark and lumpy. Returns the bake's `TerrainInfo` and a
 * `BranchPlan` for the growth (pf-branch-flora.ts) and the rim.
 * Structure, knobs and gotchas: memory/playfield.md, "The wood: the hatching branch".
 */
import type { Room } from '../../../scene/room';
import type { SolidRect } from '../../../sim/scene';
import { mix } from './look';
import type { BakeLook, MistFill } from './pf-bake';
import { Paint } from './pf-paint';
import { blob, chaikin, clamp, cubic, lerp, quad, range, rngFor, smoothstep, wobble } from './pf-shape';
import type { TerrainInfo } from './pf-terrain';

export const BRANCH = {
  /** One limb: thickness (px, vertical) at the trunk and at the end of the route, and how much of it
   *  is left along the cocoon row (the cocoons hang from a thinner limb, against the fog). */
  thickRoot: 122,
  thickEnd: 36,
  cocoonThin: 0.7,
  /** How far either side of the cocoon row the limb eases back to full, px. */
  cocoonFade: 200,
  /** Along the row the underside runs this far above the cocoons' hang points (they hang on silk), px. */
  cocoonSilk: 16,
  /** Swell and pinch along the limb: share of the thickness at ~420 px and ~120 px. */
  swell: 0.2,
  ripple: 0.07,
  /** The base flare into the trunk: extra px of underside and its falloff. */
  flare: 140,
  flareFall: 90,
  /** The painted top: [bias, slow roll, fast roll] px (+ = down) round the flat collision top, and over
   *  the last `endRound` px of a free end it rounds away by up to `endDrop`. */
  roll: [1.8, 3.2, 1.3] as readonly number[],
  endRound: 26,
  endDrop: 12,
  /** Moss tufts that break the line: gap between them and how far they rise over it, px. */
  tuftGap: [80, 240] as readonly number[],
  tuftLift: [5, 11] as readonly number[],
  /** Prong ends: the last `tipRun` px thin to `tipKeep`, then the prong runs `prongExt` px past the rect. */
  tipRun: 320,
  tipKeep: 0.5,
  prongExt: [60, 104] as readonly number[],
  /** Across a gap a prong runs this share of the gap toward the stub on the other side. */
  prongReach: [0.5, 0.66] as readonly number[],
  /** Per-stretch belly: thickness x (a + b sin(pi u)). */
  belly: [0.9, 0.18] as readonly number[],
  /** The far branch's tip past its rect, px. */
  tipExt: 40,
  /** Snapped ends keep this share of the thickness (they broke, they did not taper). */
  stubKeep: 0.86,
  /** A rect within this far east of another's end (and within `joinRise` of its top) continues it. */
  joinGap: 340,
  joinRise: 220,
  /** The end's main mass goes this far down before the mist takes it, px. */
  dive: 640,
  /** The burl's belly swells this far below the limb, px; the knee's shoulder radius, px. */
  burlSwell: 26,
  kneeRound: 44,
  /** Lumps on the underside: one every this many px (range), and their depth (px). */
  lumpGap: [180, 520] as readonly number[],
  lumpDepth: [6, 26] as readonly number[],
  /** The far branch (another tree, a plane back): thickness at its tip and gained to the edge, its
   *  relief (dim: barely lit), the haze laid on it and the mist pool over it. */
  farThin: 34,
  farThick: 52,
  farH: 0.24,
  farHaze: 0x121d2e,
  farFlat: 0x1b2a40,
  farMist: 0.55,
  /** The canopy tangle at the end: leaf clumps and twisted limbs. */
  canopyClumps: 34,
  tangleLimbs: 9,
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
  wood: 0x4b585c,
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

/** How a stretch's end meets the next. */
type End = 'trunk' | 'burl' | 'knee' | 'under' | 'tip' | 'stub' | 'end' | 'edge';

/** One walk rect as a stretch of limb. */
export interface Stretch {
  s: SolidRect;
  x0: number;
  x1: number;
  y: number;
  west: End;
  east: End;
  /** Vertical thickness at x (the underside is y + th(x), before lumps). */
  th: (x: number) => number;
  /** The painted underside at x, lumps included. */
  under: (x: number) => number;
  /** The painted bark top at x: the walk line rolled a few px (moss rises over it). */
  top: (x: number) => number;
  /** Another tree's branch (enters from the room's edge). */
  far: boolean;
  /** Across a gap, how much lower (+) or higher (-) the stretch on that side is. */
  reachW: number;
  reachE: number;
  /** The stretch across the gap on each side (prongs reach toward it). */
  nbW?: Stretch;
  nbE?: Stretch;
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
function strand(line: number[], w0: number, taper = 0.3): number[] {
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
function knot(p: Paint, cx: number, cy: number, rad: number, rot: number, h: number, seed: number): void {
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

function lichen(p: Paint, cx: number, cy: number, size: number, h: number, seed: number): void {
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
// The plan: rects -> stretches

/** A free west end (a gap's prong or snapped stub, or the far branch's tip). */
export function freeWest(st: Stretch): boolean {
  return st.west === 'tip' || st.west === 'stub';
}

/** A free east end (a gap's prong or stub, the end, or a knee's corner). */
export function freeEast(st: Stretch): boolean {
  return st.east === 'tip' || st.east === 'stub' || st.east === 'end' || st.east === 'knee';
}

function planStretches(room: Room): Stretch[] {
  const B = BRANCH;
  const trunks = room.solids.filter((s) => s.tag === 'trunk');
  const trunkX = trunks.length ? Math.max(...trunks.map((t) => t.x + t.w)) : 0;
  const rects = room.solids.filter((s) => s.tag !== 'trunk').sort((a, b) => a.x - b.x);
  const out: Stretch[] = rects.map((s) => ({
    s,
    x0: s.x,
    x1: s.x + s.w,
    y: s.y,
    west: 'tip' as End,
    east: 'end' as End,
    th: () => 0,
    under: () => 0,
    top: () => s.y,
    far: false,
    reachW: 0,
    reachE: 0,
  }));
  for (const st of out) {
    if (trunks.some((t) => Math.abs(t.x + t.w - st.x0) < 2 && st.y >= t.y && st.y < t.y + t.h))
      st.west = 'trunk';
    if (st.x1 >= room.width - 1) {
      st.east = 'edge';
      st.far = st.west !== 'trunk';
    }
  }
  const route = out.filter((o) => !o.far);
  for (const st of route) {
    if (st.east === 'edge') continue;
    const abut = route.find(
      (o) => o !== st && Math.abs(o.x0 - st.x1) < 2 && Math.abs(o.y - st.y) < B.joinRise,
    );
    if (abut) {
      st.east = abut.y < st.y ? 'burl' : 'knee';
      abut.west = abut.y < st.y ? 'burl' : 'under';
      continue;
    }
    const next = route
      .filter(
        (o) =>
          o.x0 > st.x1 && o.x0 - st.x1 < B.joinGap && Math.abs(o.y - st.y) < B.joinRise && o.west === 'tip',
      )
      .sort((a, b) => a.x0 - b.x0)[0];
    if (next) {
      // A break in the limb: the limb thins to a prong reaching across, and goes on beyond from a
      // snapped stub (the way the limb grows: thick behind, thin ahead).
      st.east = 'tip';
      next.west = 'stub';
      st.reachE = next.y - st.y;
      next.reachW = st.y - next.y;
      st.nbE = next;
      next.nbW = st;
    }
  }
  const xEnd = Math.max(trunkX + 1, ...route.map((o) => o.x1));
  const cocoons = room.marks?.cocoons ?? [];
  const c0 = cocoons.length ? Math.min(...cocoons.map((c) => c.x)) : 0;
  const c1 = cocoons.length ? Math.max(...cocoons.map((c) => c.x)) : -1;
  /** 1 along the cocoon row (the limb is thinner there), 0 away from it. */
  const row = (x: number): number =>
    c1 < c0 ? 0 : smoothstep(c0 - B.cocoonFade, c0, x) * smoothstep(c1 + B.cocoonFade, c1, x);
  for (const st of out) {
    const h = st.s.h;
    const seed = st.s.x * 3 + st.s.y;
    const span = st.x1 - st.x0;
    const sag = Math.min(18, span / 70);
    st.th = (x: number): number => {
      const u = clamp((x - st.x0) / Math.max(1, span), 0, 1);
      let t: number;
      if (st.far) t = B.farThin + B.farThick * u ** 1.6;
      else {
        // One limb: thick at the trunk, tapering ~3:1 to the end, thinner along the cocoon row.
        const v = clamp((x - trunkX) / (xEnd - trunkX), 0, 1);
        t = lerp(B.thickRoot, B.thickEnd, v ** 0.65) * lerp(1, B.cocoonThin, row(x));
      }
      const taper = (d: number, keep: number, run: number): number => lerp(keep, 1, smoothstep(0, run, d));
      if (st.east === 'tip' || st.east === 'end') t *= taper(st.x1 - x, B.tipKeep, B.tipRun);
      if (st.west === 'tip') t *= taper(x - st.x0, B.tipKeep, B.tipRun);
      if (st.east === 'stub') t *= taper(st.x1 - x, B.stubKeep, 140);
      if (st.west === 'stub') t *= taper(x - st.x0, B.stubKeep, 140);
      if (st.west === 'trunk') t += B.flare * Math.exp(-Math.max(0, x - st.x0) / B.flareFall);
      // Swell and pinch, and a soft belly in long spans (not under the cocoons).
      t *= 1 + B.swell * wobble(x, seed + 5, 420) + B.ripple * wobble(x, seed + 6, 120);
      t += sag * Math.sin(Math.PI * u) * (1 - row(x));
      // Each stretch swells a little behind its middle: the underside is never parallel to the top.
      if (!st.far && st.west !== 'trunk')
        t *= (B.belly[0] as number) + (B.belly[1] as number) * Math.sin(Math.PI * u ** 0.8) ** 0.8;
      return Math.max(h * 0.42, t);
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
      if (!hangs.length) return 0;
      const first = hangs[0] as { x: number; y: number };
      const last = hangs[hangs.length - 1] as { x: number; y: number };
      if (x <= first.x) return first.y;
      if (x >= last.x) return last.y;
      for (let i = 0; i + 1 < hangs.length; i++) {
        const a = hangs[i] as { x: number; y: number };
        const b = hangs[i + 1] as { x: number; y: number };
        if (x <= b.x) return lerp(a.y, b.y, smoothstep(a.x, b.x, x));
      }
      return last.y;
    };
    st.under = (x: number): number => {
      let add = 0;
      for (const [lx, lw, ld] of lumps) {
        const d = (x - lx) / lw;
        add += ld * Math.exp(-d * d * 2.2);
      }
      const free = st.y + st.th(x) + add * (0.6 + 0.4 * wobble(x, seed + 8, 90));
      const w = hangs.length ? row(x) : 0;
      if (w <= 0) return free;
      const along = hangY(x) - B.cocoonSilk + 7 * wobble(x, seed + 12, 140) + 3 * wobble(x, seed + 13, 40);
      return lerp(free, Math.max(st.y + st.s.h * 0.6, along), w);
    };
    // The painted bark top: the walk line rolled a few px (feet won't notice; the eye does), rounding
    // away over the last px of a free end. Moss cushions rise over it (mossBlanket).
    const fe = freeEast(st) && st.east !== 'knee';
    const fw = freeWest(st);
    st.top = (x: number): number => {
      const [r0, r1, r2] = B.roll as [number, number, number];
      let y = st.y + r0 + r1 * wobble(x, seed + 31, 280) + r2 * wobble(x, seed + 32, 64);
      if (st.far)
        y += 4 * wobble(x, seed + 33, 500) + 10 * Math.sin(Math.PI * clamp((x - st.x0) / span, 0, 1));
      const dE = st.x1 - x;
      const dW = x - st.x0;
      if (fe && dE < B.endRound) y += ((B.endRound - dE) / B.endRound) ** 2 * B.endDrop;
      if (fw && dW < B.endRound) y += ((B.endRound - dW) / B.endRound) ** 2 * B.endDrop;
      return y;
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
function lineLimb(
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
function knotsFor(L: Limb, seed: number, every: number): Array<{ i: number; v: number; r: number }> {
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
function mossBlanket(
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

/** The great bole at the west edge: the limbs' roots first, then the bole wraps them in its collar. */
function paintBole(p: Paint, t: SolidRect, roomH: number, joins: Stretch[], seed: number): void {
  const B = BRANCH;
  const r = rngFor(seed, 7);
  // The collar: where a limb leaves, the bole's flank bulges out round its root.
  // Round, under the walk line only (above it she walks right up to the trunk): a swelling the
  // limb grows out of, with a small fillet into the limb's top.
  const collar = (y: number): number => {
    let c = 0;
    for (const j of joins) {
      const th = j.th(j.x0 + 30);
      const mid = j.y + th * 0.52;
      const half = th * 0.56;
      const d = (y - mid) / half;
      if (d > -1 && d < 1) c = Math.max(c, 46 * Math.sqrt(1 - d * d));
      const f = (y - (j.y - 14)) / 14;
      if (f > 0 && f < 1) c = Math.max(c, 14 * f * f);
    }
    return c;
  };
  const xr = (y: number): number =>
    t.x + t.w + 4 + 8 * wobble(y, seed, 300) + 3 * wobble(y, seed + 3, 60) + collar(y);
  const xl = t.x - 220;
  const y0 = -40;
  const y1 = roomH + 60;
  const edge: number[] = [];
  for (let y = y0; y <= y1; y += 8) edge.push(xr(y), y);
  p.solid([xl, y0, ...edge, xl, y1], B.bark, 0.5, { bark: 1 });
  const strip = (inset: number, w: number): number[] => {
    const pts: number[] = [];
    for (let y = y0; y <= y1; y += 8) pts.push(xr(y) - inset - w, y);
    for (let y = y1; y >= y0; y -= 8) pts.push(xr(y) - inset, y);
    return pts;
  };
  // Round: the face turns toward the moon on the right.
  p.bump(strip(16, 150), 0.6, { bark: 1 });
  p.bump(strip(36, 90), 0.68, { bark: 1 });
  p.tint(strip(70, 200), B.barkDark, 0.55);
  p.tint(strip(0, 10), B.barkDark, 0.4);
  // Bark ridges: long vertical fissures that part round the collar.
  for (let k = 0; k < 18; k++) {
    const inset = 8 + k * 11 + range(r, -4, 4);
    for (let y = y0 + range(r, 0, 120); y < y1; ) {
      const len = range(r, 50, 300);
      const line: number[] = [];
      for (let yy = y; yy <= y + len; yy += 8) {
        let x = xr(yy) - collar(yy) - inset + 5 * wobble(yy, seed + k * 7, 110);
        for (const j of joins) {
          const d = (yy - (j.y + 30)) / 110;
          if (Math.abs(d) < 2.5 && inset < 150) x -= 30 * Math.exp(-d * d) * (1 - inset / 150);
        }
        line.push(x, yy);
      }
      if (line.length >= 6) {
        const w = range(r, 2.4, 5);
        p.bump(strand(line, w * 1.6), 0.44, { bark: 1, alpha: 0.85 });
        p.tint(strand(line, w), B.barkDeep, 0.6);
      }
      y += len + range(r, 10, 110);
    }
  }
  // Over each joint the bark creases in arcs (the branch bark ridge); under it, the limb's shadow.
  for (const j of joins) {
    const cx = t.x + t.w;
    // The collar's grain wraps round it, parallel to its edge.
    const th = j.th(j.x0 + 30);
    for (let k = 0; k < 6; k++) {
      const inset = 6 + k * 9 + range(r, -2, 2);
      const arc: number[] = [];
      for (let y = j.y + 4; y <= j.y + th * 1.08; y += 6)
        arc.push(xr(y) - inset - (1 - collar(y) / 46) * k * 4, y);
      if (arc.length >= 6) {
        const w = range(r, 2.4, 4);
        p.bump(strand(arc, w * 2, 0.25), 0.62, { bark: 0.6, alpha: 0.85 });
        p.tint(strand(arc, w, 0.25), B.barkDeep, 0.45);
      }
    }
    // The branch bark ridge: rough folds running up and back from the top of the joint.
    for (let k = 0; k < 3; k++) {
      const sx = cx - 4 - k * 10;
      const sy = j.y - 2 - k * 12;
      const len = 34 + k * 14 + range(r, -6, 6);
      const fold = quad(sx, sy, sx - len * 0.55, sy - len * 0.1, sx - len * 0.8, sy - len * 0.7, 10);
      const w = range(r, 4, 7);
      p.bump(strand(fold, w * 2.4, 0.4), 0.62, { bark: 0.6, alpha: 0.85 });
      p.tint(strand(fold, w, 0.4), B.barkDeep, 0.4);
      p.tint(
        strand(
          fold.map((v, i) => (i % 2 ? v - w * 0.8 : v + w * 0.4)),
          w * 0.6,
          0.4,
        ),
        B.barkLit,
        0.2,
      );
    }
    const sh: number[] = [];
    for (let y = j.y + th * 0.85; y <= j.y + th + 560; y += 20) sh.push(xr(y) + 2, y);
    for (let y = j.y + th + 560; y >= j.y + th * 0.85; y -= 20) sh.push(xr(y) - 140 - (y - j.y) * 0.12, y);
    p.tint(chaikin(sh, 2), B.barkDeep, 0.6);
  }
  // Moss streaks run down the bole, and lichen.
  for (let k = 0; k < 8; k++) {
    const x = range(r, 24, 150);
    const ya = range(r, 0, roomH * 0.72);
    const len = range(r, 80, 360);
    const line: number[] = [];
    for (let y = ya; y <= ya + len; y += 8) line.push(xr(y) - collar(y) - x + 6 * wobble(y, seed + k, 90), y);
    p.solid(strand(line, range(r, 8, 22), 0.4), B.mossDark, 0.6, { moss: 1, alpha: 0.85 });
  }
  for (let k = 0; k < 5; k++)
    lichen(p, xr(0) - range(r, 20, 120), range(r, 200, roomH * 0.7), 14, 0.55, seed + k);
  // Deeper down, the bole sinks into the dark wood.
  const sink: number[] = [xl, roomH * 0.6];
  for (let y = roomH * 0.6; y <= y1; y += 20) sink.push(xr(y) + 2, y);
  sink.push(xl, y1);
  p.tint(sink, B.barkDeep, 0.4);
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
    const sy = range(r, top + 200, roomH);
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
    const cy = range(r, top + 60, roomH + 60) + Math.max(0, x0 + 300 - cx) * 0.8;
    const rx = range(r, 70, 170);
    const ry = rx * range(r, 0.5, 0.8);
    p.solid(
      chaikin(blob(cx, cy + ry * 0.25, rx * 0.6, ry * 0.55, seed + k * 11, 0.4, 22), 1),
      B.leafDark,
      B.backH - 0.06,
      {
        moss: 0.2,
      },
    );
    plan.clumps.push({ x: cx, y: cy, rx, ry });
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

/** A limb of the main mass going down behind the walk (back plane): darker, the mist takes its low part. */
function dive(
  p: Paint,
  info: TerrainInfo,
  line: number[],
  wd: (t: number) => number,
  seed: number,
  mx: number,
  my: number,
  h: number = BRANCH.backH,
): Limb {
  const B = BRANCH;
  const L = lineLimb(line, (t) => wd(t) * (1 + 0.1 * Math.sin(t * 11 + seed)), h, seed, 0.3, 0.6);
  paintLimb(p, L);
  const n = L.pts.length / 2;
  p.tint(band(L, -0.5, 0.5, Math.round(n * 0.3), n - 1), B.barkDeep, 0.4);
  info.mist.push({
    x: mx,
    y: my,
    rx: 170,
    ry: 150,
    amount: B.mistAmount,
    color: B.mist,
    power: 1.3,
    backOnly: 0.5,
  });
  return L;
}

/**
 * A side limb off the underside, going down and away and ending in mid-air in a hook and a twig fan:
 * it cuts holes of fog out of the void under the walk (never a strut: it touches nothing below).
 */
function subLimb(
  p: Paint,
  plan: BranchPlan,
  info: TerrainInfo,
  x: number,
  y: number,
  th: number,
  dir: 1 | -1,
  len: number,
  seed: number,
): void {
  const B = BRANCH;
  const r = rngFor(seed, x, y);
  const w0 = th * range(r, 0.34, 0.48);
  const sx = x;
  const sy = y - w0 * 0.45;
  const ex = sx + dir * len * range(r, 0.3, 0.45);
  const ey = sy + len * range(r, 0.85, 1);
  // Down and away, easing out a little; it ends in the mist, not in a curl.
  const line = cubic(
    sx,
    sy,
    sx + dir * len * 0.08,
    sy + len * 0.4,
    ex - dir * len * 0.12,
    ey - len * 0.25,
    ex,
    ey,
    24,
  );
  const L = dive(p, info, line, (t) => w0 * (1 - 0.8 * t ** 0.9), seed, ex, ey - len * 0.15, B.backH - 0.04);
  const n = L.pts.length / 2;
  // Twigs fan from its end; one more halfway.
  const tx = L.pts[(n - 1) * 2] as number;
  const ty = L.pts[(n - 1) * 2 + 1] as number;
  const a = Math.atan2(ty - (L.pts[(n - 3) * 2 + 1] as number), tx - (L.pts[(n - 3) * 2] as number));
  twig(p, plan, tx, ty, a - 0.4, range(r, 30, 56), 5, B.backH + 0.02, seed + 1);
  twig(p, plan, tx, ty, a + 0.5, range(r, 26, 46), 4, B.backH + 0.02, seed + 2);
  const q = Math.round(n * 0.45);
  twig(
    p,
    plan,
    L.pts[q * 2] as number,
    L.pts[q * 2 + 1] as number,
    Math.PI / 2 - dir * 0.6,
    range(r, 40, 70),
    6,
    B.backH,
    seed + 3,
  );
  // Beards along its lower half.
  const xa = Math.min(sx, ex);
  const xb = Math.max(sx, ex);
  plan.hangs.push({
    x0: xa + (xb - xa) * 0.2,
    x1: xb,
    y: (xx) => lerp(sy + w0 * 0.4, ey + w0 * 0.2, clamp((xx - sx) / (ex - sx || 1), 0, 1)),
    deep: true,
    reach: 70,
  });
}

/**
 * A free end that reaches across a gap: the limb thins to a prong that runs on past the rect, rising
 * toward the other side when it is higher, drooping when it is lower, and frays into twigs.
 */
function prong(p: Paint, plan: BranchPlan, st: Stretch, dir: 1 | -1, seed: number): void {
  const B = BRANCH;
  const r = rngFor(seed, 17);
  const xe = dir > 0 ? st.x1 : st.x0;
  const nb = dir > 0 ? st.nbE : st.nbW;
  const top = st.top(xe - dir * 4);
  const th0 = st.under(xe) - top;
  let tx: number;
  let ty: number;
  if (nb) {
    // Across the gap toward the stub on the other side: aim at its broken face, never above its
    // top (a thin neck that broke, not a ramp).
    const gapW = dir > 0 ? nb.x0 - st.x1 : st.x0 - nb.x1;
    const ext = gapW * range(r, B.prongReach[0] as number, B.prongReach[1] as number);
    tx = xe + dir * ext;
    const nx = dir > 0 ? nb.x0 : nb.x1;
    const aim = nb.top(nx) + (nb.under(nx) - nb.top(nx)) * 0.55;
    ty = lerp(top + th0 * 0.35, aim, ext / Math.max(1, gapW)) + range(r, 4, 14);
  } else {
    // The end: the prong droops away over the drop.
    const ext = range(r, B.prongExt[0] as number, B.prongExt[1] as number);
    tx = xe + dir * ext;
    ty = top + th0 * 0.25 + range(r, 10, 26);
  }
  const ext = Math.abs(tx - xe);
  const line = cubic(
    xe - dir * 50,
    top + th0 / 2,
    xe + dir * ext * 0.3,
    top + th0 / 2,
    tx - dir * ext * 0.3,
    ty,
    tx,
    ty,
    18,
  );
  paintLimb(
    p,
    lineLimb(line, (t) => Math.max(5, th0 * 0.96 * (1 - t) ** 1.25), B.walkH, seed + 1, 0.5, 0.6),
  );
  const a0 = Math.atan2(ty - (top + th0 / 2), tx - xe);
  twig(p, plan, tx, ty, a0 - 0.35, range(r, 36, 60), 5, B.walkH - 0.08, seed + 2);
  twig(p, plan, tx - dir * 8, ty + 3, a0 + 0.45, range(r, 28, 46), 4, B.walkH - 0.1, seed + 3);
  twig(
    p,
    plan,
    xe + dir * ext * 0.45,
    top + th0 * 0.6,
    Math.PI / 2 - dir * 0.5,
    range(r, 24, 40),
    4,
    B.walkH - 0.12,
    seed + 4,
  );
  plan.hangs.push({
    x0: Math.min(xe, tx) + 10,
    x1: Math.max(xe, tx) - 10,
    y: (x) => lerp(top + th0, ty + 3, clamp((x - xe) / (tx - xe || 1), 0, 1)),
    deep: false,
    reach: 90,
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
  const out = range(r, 10, 20);
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
  p.solid(poly, B.bark, B.walkH, { bark: 0.12 });
  shadeJoint(p, poly, top, bot);
  // The face: pale torn wood just inside the break, cracks, a dark heart.
  const face: number[] = [...brk];
  for (let k = nb; k >= 0; k--)
    face.push((brk[k * 2] as number) - dir * range(r, 12, 22), brk[k * 2 + 1] as number);
  p.tint(face, B.wood, 0.55);
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
    p.solid(left, mix(B.wood, B.bark, range(r, 0, 0.35)), B.walkH + 0.04, { bark: 0.4 });
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

/** Paints the wood room's playfield. */
export function paintBranchTerrain(
  room: Room,
  seed: number,
): { paint: Paint; info: TerrainInfo; plan: BranchPlan } {
  const B = BRANCH;
  const p = new Paint(room.width, room.height);
  const stretches = planStretches(room);
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
  const route = stretches.filter((s) => !s.far);

  // 1. Behind everything: side limbs hooking down into the fog, the end's dive and its canopy.
  for (const st of route) {
    const sd = sdOf(st);
    const r = rngFor(sd, 5);
    const span = st.x1 - st.x0;
    // One side limb in a long stretch, away from the cocoons and Tatter.
    if (span >= 520 && r() < 0.7) {
      for (let tries = 0; tries < 4; tries++) {
        const x = lerp(st.x0, st.x1, range(r, 0.3, 0.6));
        if (busy(x)) continue;
        const dir: 1 | -1 = r() < 0.5 ? -1 : 1;
        subLimb(p, plan, info, x, st.under(x), st.th(x), dir, range(r, 200, 340), sd + 30 + tries);
        break;
      }
    }
    // Under a snapped end the old break sent a limb down: it hooks away beneath the gap.
    if (st.east === 'end') {
      const thA = st.th(st.x1 - B.tipRun);
      const ax = st.x1 - B.tipRun + 10;
      const ay = st.y + thA * 0.6;
      const line = cubic(
        ax,
        ay,
        ax + 170,
        ay + 20,
        st.x1 + 180,
        ay + B.dive * 0.3,
        st.x1 + 260,
        ay + B.dive,
        28,
      );
      dive(p, info, line, (t) => thA * lerp(0.8, 0.36, t), sd + 1, st.x1 + 200, ay + B.dive * 0.75);
      plan.hangs.push({ x0: ax + 40, x1: ax + 160, y: () => ay + thA * 0.45, deep: true, reach: 90 });
      paintCanopy(p, plan, info, st.x1 - 160, room.width + 120, st.y + 90, room.height, sd + 3);
    }
  }

  // 2. The stretches (their root runs under the bole's collar). The far branch is another tree one
  // plane back: thinner, low in the relief (dimly lit), hazed by mist, no moss blanket and no rim.
  for (const st of stretches) {
    const sd = sdOf(st);
    const r = rngFor(sd, 6);
    const xa = st.west === 'trunk' ? st.x0 - 70 : st.west === 'under' ? st.x0 - 60 : st.x0;
    const xb = st.east === 'edge' ? st.x1 + 160 : st.east === 'burl' ? st.x1 + 30 : st.x1;
    const L = stretchLimb(st, xa, xb, sd);
    if (st.far) {
      L.h = B.farH;
      L.moss = 0.55;
      L.detail = 0.6;
      paintLimb(p, L);
      gradBand(p, L, -0.5, 0.5, B.farHaze, 0.45, 0.75, 4);
      info.mist.push({
        x: (st.x0 + st.x1) / 2,
        y: st.y + 30,
        rx: (st.x1 - st.x0) / 2 + 260,
        ry: 110,
        amount: B.farMist,
        color: B.farFlat,
        power: 2,
      });
      plan.hangs.push({ x0: st.x0 + 40, x1: st.x1, y: (x) => st.under(x) - 4, deep: true, reach: 110 });
      continue;
    }
    paintLimb(p, L, knotsFor(L, sd, 640));
    for (let x = st.x0 + range(r, 60, 300); x < st.x1 - 60; x += range(r, 260, 620)) {
      if (busy(x)) continue;
      const a = Math.PI / 2 + range(r, -0.7, 0.5);
      stub(p, x, st.under(x) - 6, a, range(r, 12, 30), range(r, 9, 15), B.walkH - 0.02);
    }
  }

  // 3. The bole (wrapping the roots), then the joints and ends over the stretches.
  for (const t of room.solids)
    if (t.tag === 'trunk')
      paintBole(
        p,
        t,
        room.height,
        stretches.filter((s) => s.west === 'trunk'),
        seed + t.x,
      );

  for (const st of stretches) {
    const sd = sdOf(st);
    const r = rngFor(sd, 7);
    if (st.east === 'tip' || st.east === 'end') prong(p, plan, st, 1, sd + 4);
    if (st.east === 'stub') snapped(p, plan, st, 1, sd + 5);
    if (st.west === 'stub') snapped(p, plan, st, -1, sd + 6);
    if (st.west === 'tip') {
      if (st.far) {
        // Another tree's tip: thin, hazed, twigs (dim).
        const th0 = st.th(st.x0);
        const tx = st.x0 - B.tipExt;
        const line = cubic(
          st.x0 + 40,
          st.y + 2 + th0 / 2,
          st.x0,
          st.y + 2 + th0 / 2,
          tx + 14,
          st.y + th0 * 0.2,
          tx,
          st.y - 4,
          12,
        );
        const tip = lineLimb(line, (t) => th0 * 0.94 * (1 - t * 0.82), B.farH, sd + 16, 0.3, 0.4);
        paintLimb(p, tip);
        p.tint(band(tip), B.farHaze, 0.6);
        twig(
          p,
          plan,
          tx + 3,
          st.y - 2,
          Math.PI + range(r, 0.3, 0.8),
          range(r, 40, 72),
          6,
          B.farH - 0.04,
          sd + 17,
        );
        twig(p, plan, tx + 14, st.y + th0 * 0.2, Math.PI - 0.3, range(r, 30, 52), 4, B.farH - 0.04, sd + 18);
      } else prong(p, plan, st, -1, sd + 7);
    }
    if (st.east === 'knee') {
      const next = stretches.find((o) => Math.abs(o.x0 - st.x1) < 2);
      if (next) {
        // The limb kinks down: its end turns over (a wide round shoulder) and runs down into the lower
        // stretch, with a deep S-curve underneath (no inner corner).
        const x1 = st.x1;
        const thN = next.under(next.x0 + 80) - next.y;
        const rad = B.kneeRound;
        const k: number[] = [x1 - 200, st.top(x1 - 200)];
        for (let a = -Math.PI / 2; a <= 0.001; a += Math.PI / 16)
          k.push(x1 - rad + Math.cos(a) * rad, st.y + 2 + rad + Math.sin(a) * rad);
        const midY = (st.y + next.y) / 2;
        k.push(x1 + 16, midY - 4, x1 + 18, midY + 16, x1 + 8, next.y - 14, x1 + 14, next.y + 2);
        k.push(x1 + 70, next.y + 2, x1 + 90, next.y + thN * 0.6);
        const belly = cubic(
          x1 + 60,
          next.y + thN + 4,
          x1 - 110,
          next.y + thN + 10,
          x1 - 120,
          st.y + st.th(x1 - 260),
          x1 - 280,
          st.y + st.th(x1 - 280) - 6,
          14,
        );
        k.push(...belly);
        const poly = chaikin(k, 2);
        p.solid(poly, B.bark, B.walkH, { bark: 0.12 });
        shadeJoint(p, poly, st.y, next.y + thN);
        dome(p, x1 - 14, midY + 12, 34, 40, B.walkH + 0.05, B.walkH + 0.18, sd + 7);
        knot(p, x1 - 6, midY + 12, 11, Math.PI / 2, B.walkH, sd + 9);
        bendGrain(p, x1, st.y, st.th(x1 - 200), next.y, thN, sd + 8);
        p.tint(chaikin(belly.concat([x1 - 220, next.y + 10, x1 + 40, next.y + 20]), 1), B.barkDeep, 0.5);
        twig(p, plan, x1 - 10, st.y + 10, -0.35, range(r, 130, 170), 12, B.walkH - 0.12, sd + 10);
        subLimb(p, plan, info, x1 - 60, st.under(x1 - 60), st.th(x1 - 60), 1, range(r, 200, 280), sd + 11);
      }
    }
    if (st.west === 'burl') {
      // The knot: the limb swells up over the step, a great eye on its face.
      const prev = stretches.find((o) => Math.abs(o.x1 - st.x0) < 2);
      const lowY = prev ? prev.y : st.y + 64;
      const x0 = st.x0;
      const rad = 22;
      const k: number[] = [x0 + 160, st.top(x0 + 160)];
      for (let a = -Math.PI / 2; a >= -Math.PI - 0.001; a -= Math.PI / 14)
        k.push(x0 + rad + Math.cos(a) * rad, st.y + 2 + rad + Math.sin(a) * rad);
      k.push(x0 - 5, lowY - 22, x0 - 16, lowY - 2, x0 - 50, lowY + 4);
      const underPrev = prev ? prev.under(x0 - 80) : lowY + 90;
      const swell = Math.max(underPrev, st.under(x0 + 40)) + B.burlSwell;
      k.push(x0 - 90, underPrev - 6, x0 + 40, swell, x0 + 200, st.under(x0 + 200));
      const poly = chaikin(k, 2);
      p.solid(poly, B.bark, B.walkH, { bark: 0.12 });
      shadeJoint(p, poly, st.y, swell);
      // (Relief and tints stay inside the polygon: a tint over relief with no solid under it is a
      // translucent ghost.)
      dome(p, x0 + 34, lowY + 34, 48, 52, B.walkH + 0.05, B.walkH + 0.18, sd + 11);
      p.tint(blob(x0 + 40, st.y + 28, 34, 16, sd + 12, 0.3, 16), B.barkLit, 0.18);
      p.tint(blob(x0 + 20, lowY + 64, 70, 30, sd + 13, 0.3, 16), B.barkDeep, 0.45);
      knot(p, x0 + 8, lowY + 26, 16, 0.25, B.walkH, sd + 14);
    }
  }

  // 4. Moss on every walk top (not the far branch); the cocoons' silk pads on the underside.
  for (const st of route) {
    const sd = sdOf(st);
    const fw = freeWest(st);
    const fe = freeEast(st);
    const r = rngFor(sd, 8);
    const m0 = st.west === 'trunk' ? st.x0 - 8 : st.west === 'stub' ? st.x0 + range(r, 10, 24) : st.x0;
    const m1 = st.east === 'stub' ? st.x1 - range(r, 10, 24) : st.x1;
    mossBlanket(p, m0, m1, st.top, sd + 17, st.west === 'tip' ? 26 : 0, fe && st.east !== 'stub' ? 30 : 0);
    plan.hangs.push({
      x0: st.x0 + (fw ? 30 : 10),
      x1: st.x1 - (fe ? 30 : 10),
      y: (x) => st.under(x) - 5,
      deep: false,
      reach: 210,
    });
  }
  for (const c of plan.cocoons) {
    const st = route.find((o) => c.x >= o.x0 && c.x <= o.x1);
    const uy = st ? Math.min(c.y, st.under(c.x)) : c.y;
    p.solid(
      chaikin(blob(c.x, uy - 3, 9, 4, c.x, 0.4, 12), 1),
      mix(B.silk, B.bark, 0.55),
      B.walkH + 0.2,
      { moss: 0.2 },
      0.55,
    );
  }
  return { paint: p, info, plan };
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
