// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Tatter's wings (memory/hatch-and-tatter.md, round 4; review 01-round-3 problem 5: "one rigid black blade
 * with a bullseye"): drawn as a moth's wings, not Wing's cape strands. A rounded forewing with a hindwing
 * lobe under it, a dusty fringe, two pale veins and a small soft eye-spot. The torn one is shorter, its
 * trailing edge bitten away in irregular bites with a slit into it, a loose flap hanging from the tear and
 * fluttering in the wind, and most of the hindwing gone; it droops and trembles.
 *
 * Local frame: x along the span (outward, 0 = root, 1 = the apex), y across it (- = the leading edge
 * side). `pose` puts it in the world: root, angle of the span (rad, y down), span (px), and which way
 * the leading edge faces (`lead` -1 = up).
 */
import { wind } from '../scene/lib/look';
import { clamp, hash1, lerp, sat } from './math';
import { type Painter, rgb, type Shade } from './vesper/paint';

/** The forewing's outline, clockwise from the root (x, y): leading edge, rounded apex, termen, inner margin. */
const FORE = [
  0, 0, 0.3, -0.13, 0.62, -0.2, 0.86, -0.2, 0.99, -0.1, 1.02, 0.04, 0.95, 0.2, 0.8, 0.34, 0.6, 0.44, 0.38,
  0.42, 0.18, 0.3, 0.05, 0.14,
];
/** The hindwing lobe under it. */
const HIND = [0.04, 0.12, 0.3, 0.3, 0.52, 0.46, 0.62, 0.62, 0.52, 0.76, 0.32, 0.72, 0.14, 0.52, 0.02, 0.28];

/** A tear: where along the outline (0..1 of its samples), how wide, how deep (fraction toward the centre). */
interface Bite {
  at: number;
  w: number;
  d: number;
}

export interface MothWingLook {
  /** Bites out of the outline; empty = whole. */
  bites: readonly Bite[];
  /** How much of the hindwing is left (0..1). */
  hind: number;
  /** A loose flap hanging from the tear: where along the outline (0..1), its size (fraction of the span), or 0. */
  flapAt: number;
  flap: number;
  /** Ragged fringe amplitude, px (the torn edge is frayed; a whole wing only dusty). */
  fray: number;
  seed: number;
  /** Worn: scales rubbed off, a paler, greyer membrane (0..1). */
  worn: number;
}

export const WHOLE: MothWingLook = { bites: [], hind: 1, flapAt: 0, flap: 0, fray: 0.35, seed: 3, worn: 0 };
export const TORN: MothWingLook = {
  bites: [
    { at: 0.42, w: 0.08, d: 0.55 },
    { at: 0.53, w: 0.03, d: 0.78 },
    { at: 0.64, w: 0.1, d: 0.5 },
    { at: 0.78, w: 0.05, d: 0.36 },
    { at: 0.28, w: 0.05, d: 0.28 },
  ],
  hind: 0.35,
  flapAt: 0.6,
  flap: 0.3,
  fray: 1.3,
  seed: 11,
  worn: 1,
};

const WING_C0 = rgb(0x2a2033);
const WING_C1 = rgb(0x463a52);
const DUST = rgb(0x8c8494);
const VEIN = rgb(0x8e8698);
const SPOT = rgb(0x9a8a70);
const MOON_RIM = rgb(0xeef3ff);
const SPOT_DARK = rgb(0x17111d);

const SH_WING: Shade = { c0: WING_C0, c1: WING_C1, rim: 0.7, cool: 0.2, form: 0.15, band: 0.22, ember: 0 };
const SH_HIND: Shade = {
  c0: WING_C0,
  c1: rgb(0x382e44),
  rim: 0.5,
  cool: 0.2,
  form: 0.1,
  band: 0.25,
  ember: 0,
};
const SH_VEIN: Shade = { c0: VEIN, c1: VEIN, rim: 0, cool: 0, form: 0, band: 0.5, alpha: 0.32 };
const SH_WORN: Shade = {
  c0: rgb(0x3a3044),
  c1: rgb(0x5c5268),
  rim: 0.8,
  cool: 0.2,
  form: 0.15,
  band: 0.22,
  ember: 0,
};
const SH_FLAP: Shade = { c0: WING_C1, c1: WING_C0, rim: 0.6, cool: 0.2, form: 0, band: 0.3, ember: 0 };

export interface WingPose {
  x: number;
  y: number;
  /** Direction of the span on screen (rad, y down). */
  ang: number;
  span: number;
  /** -1: the leading edge is on the up side of the span (as on a moth seen from the side). */
  lead: number;
}

const OUT_X = new Float32Array(96);
const OUT_Y = new Float32Array(96);

/** Samples a closed control polygon (Catmull-Rom) into OUT_X/Y: `per` samples per control point. */
function sample(ctrl: readonly number[], per: number): number {
  const m = ctrl.length / 2;
  let n = 0;
  for (let i = 0; i < m; i++) {
    const i0 = (i + m - 1) % m;
    const i2 = (i + 1) % m;
    const i3 = (i + 2) % m;
    for (let q = 0; q < per; q++) {
      const t = q / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      OUT_X[n] = cr(ctrl[i0 * 2]!, ctrl[i * 2]!, ctrl[i2 * 2]!, ctrl[i3 * 2]!);
      OUT_Y[n] = cr(ctrl[i0 * 2 + 1]!, ctrl[i * 2 + 1]!, ctrl[i2 * 2 + 1]!, ctrl[i3 * 2 + 1]!);
      n++;
    }
  }
  return n;
}

/**
 * Draws one moth wing: the hindwing lobe, the forewing with its tears, the dusty fringe, veins, the
 * eye-spot and a loose flap. `tremble` 0..1 shivers the torn edge; `clock` is render time.
 */
export function drawMothWing(
  p: Painter,
  pose: WingPose,
  look: MothWingLook,
  clock: number,
  tremble: number,
  windX: number,
  /** 0..1: the moon on its edge (the sit, review r13 #4: grey wings on the pale disc did not read): a silver fringe. */
  rimK = 0,
): void {
  const ca = Math.cos(pose.ang);
  const sa = Math.sin(pose.ang);
  const L = pose.span;
  const ly = -pose.lead;
  // Local (x, y) -> world.
  const wx = (x: number, y: number): number => pose.x + (x * ca - y * ly * sa) * L;
  const wy = (x: number, y: number): number => pose.y + (x * sa + y * ly * ca) * L;
  const torn = look.bites.length > 0;
  const shiver = tremble * (0.012 + 0.01 * Math.sin(clock * 23 + look.seed));

  // --- Hindwing (what is left of it).
  if (look.hind > 0.05) {
    const n = sample(HIND, 4);
    const k = look.hind;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
      const x = OUT_X[i]! * (0.5 + 0.5 * k);
      const y = OUT_Y[i]! * k;
      const fr = ((hash1(look.seed * 97 + i) - 0.5) * look.fray * (torn ? 2.2 : 1)) / L;
      p.px[i] = wx(x + fr, y + fr);
      p.py[i] = wy(x + fr, y + fr);
      cx += p.px[i]!;
      cy += p.py[i]!;
    }
    p.shape(n, cx / n, cy / n, SH_HIND, wx(0, 0), wy(0, 0), wx(0.6, 0.6), wy(0.6, 0.6));
  }

  // --- Forewing.
  const n = sample(FORE, 4);
  const cxL = 0.42;
  const cyL = 0.12;
  const lx = new Float32Array(n);
  const lyy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    let k = 1;
    for (const b of look.bites) {
      const d = Math.abs(u - b.at);
      if (d < b.w) k -= b.d * (1 - (d / b.w) ** 2);
    }
    // Frayed: the torn stretch is ragged, the rest only dusty.
    const ragged = torn && u > 0.25 && u < 0.85 ? 1 : 0.35;
    k -= (hash1(look.seed * 131 + i * 7) * look.fray * ragged) / L;
    k = clamp(k, 0.18, 1);
    let x = cxL + (OUT_X[i]! - cxL) * k;
    let y = cyL + (OUT_Y[i]! - cyL) * k;
    // The torn edge trembles.
    if (torn && ragged > 0.5) {
      x += shiver * Math.sin(i * 1.7 + clock * 31);
      y += shiver * Math.cos(i * 2.3 + clock * 27);
    }
    lx[i] = x;
    lyy[i] = y;
    p.px[i] = wx(x, y);
    p.py[i] = wy(x, y);
  }
  // The dusty fringe first (a soft veil just outside the edge), then the wing over it.
  {
    const fx = new Float32Array(n + 1);
    const fy = new Float32Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const j = i % n;
      fx[i] = p.px[j]!;
      fy[i] = p.py[j]!;
    }
    const cx0 = wx(cxL, cyL);
    const cy0 = wy(cxL, cyL);
    for (let i = 0; i <= n; i++) {
      const dx = fx[i]! - cx0;
      const dy = fy[i]! - cy0;
      const d = Math.hypot(dx, dy) || 1;
      const grow = (1.1 + 0.5 * hash1(look.seed * 7 + i)) * (1 + 1.4 * rimK);
      p.px[i] = fx[i]! + (dx / d) * grow;
      p.py[i] = fy[i]! + (dy / d) * grow;
      p.gx[i] = fx[i]! - (dx / d) * 0.6;
      p.gy[i] = fy[i]! - (dy / d) * 0.6;
      p.gc[i * 3] = lerp(DUST[0], MOON_RIM[0], rimK);
      p.gc[i * 3 + 1] = lerp(DUST[1], MOON_RIM[1], rimK);
      p.gc[i * 3 + 2] = lerp(DUST[2], MOON_RIM[2], rimK);
      p.pw[i] = 0.22 + 0.5 * rimK;
    }
    p.sweep(n + 1, false);
    for (let i = 0; i < n; i++) {
      p.px[i] = fx[i]!;
      p.py[i] = fy[i]!;
    }
  }
  p.shape(
    n,
    wx(cxL, cyL),
    wy(cxL, cyL),
    look.worn > 0.5 ? SH_WORN : SH_WING,
    wx(0, 0),
    wy(0, 0),
    wx(1, 0.2),
    wy(1, 0.2),
  );

  // --- Veins: two pale lines from the root toward the termen (stopping short of a bite).
  for (const [tx, ty] of [
    [0.82, 0.02],
    [0.66, 0.3],
  ] as const) {
    const m = 6;
    for (let i = 0; i < m; i++) {
      const u = (i / (m - 1)) * (torn && ty > 0.2 ? 0.62 : 0.92);
      const x = tx * u;
      const y = ty * u + 0.03 * Math.sin(Math.PI * u);
      p.px[i] = wx(x, y);
      p.py[i] = wy(x, y);
      p.pw[i] = lerp(0.42, 0.18, u);
    }
    p.ribbon(m, SH_VEIN, false, false);
  }

  // --- The eye-spot: small and soft (a dusky ring of scales, not a target); on the torn wing it is half bitten away.
  {
    const sx = 0.6;
    const sy = 0.16;
    const r = 0.07 * L * (torn ? 0.8 : 1);
    const x = wx(sx, sy);
    const y = wy(sx, sy);
    p.soft(x, y, r * 1.25, r, SPOT, torn ? 0.22 : 0.32);
    p.soft(x + (torn ? r * 0.4 : 0), y, r * 0.5, r * 0.45, SPOT_DARK, 0.4);
  }

  // --- The loose flap: a scrap of the torn wing hanging from the tear by a corner, fluttering.
  if (look.flap > 0) {
    const i0 = Math.floor(look.flapAt * n) % n;
    const ax = lx[i0]!;
    const ay = lyy[i0]!;
    const flutter =
      0.55 +
      0.35 * Math.sin(clock * 9.3 + look.seed) * (0.6 + 0.4 * Math.sin(clock * 2.1)) +
      0.5 * windX +
      0.3 * tremble * Math.sin(clock * 21);
    const s = look.flap;
    const pts = [
      [0, 0],
      [s * 0.9, s * 0.25],
      [s * 0.55, s * 0.95],
      [s * 0.1, s * 0.55],
    ];
    const c = Math.cos(flutter);
    const sn = Math.sin(flutter);
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const [qx, qy] = pts[i]!;
      const x = ax + qx! * c - qy! * sn;
      const y = ay + qx! * sn + qy! * c;
      p.px[i] = wx(x, y);
      p.py[i] = wy(x, y);
      cx += p.px[i]!;
      cy += p.py[i]!;
    }
    p.shape(pts.length, cx / pts.length, cy / pts.length, SH_FLAP, p.px[0]!, p.py[0]!, p.px[2]!, p.py[2]!);
  }
}

/** The wind at x now, for the flap (-1..1). */
export function flapWind(x: number, clock: number): number {
  return sat(0.5 + 0.5 * wind(x, clock, 0.37)) * 2 - 1;
}
