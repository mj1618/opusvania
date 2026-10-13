// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Draws Nova from a solved skeleton frame and the simulated chains, back to front, into the
 * shared one-mesh painter.
 *
 * The look: a piece of night sky in the shape of a small acrobat. Indigo-black body with a faint
 * scatter of slow-twinkling star-specks inside it; four thin bands of pale gold light at the
 * wrists and ankles; a smooth head with a moon-sliver across the brow and two calm glowing eyes;
 * a swept-back crest that thins into one long luminous comet tail ending in a star; a short dusk
 * violet sash at the waist.
 */
import { catmull, clamp, lerp, noise1, sat, smoothstep } from '../hooded/math';
import { type Painter, type RGB, rgb, type Shade } from '../hooded/paint';
import { GOLD, GOLD_HOT } from './fx';
import {
  BODY,
  type Frame,
  J_ANK_A,
  J_CENTRE,
  J_CHEST,
  J_EL_A,
  J_HAND_A,
  J_HEAD,
  J_HIP,
  J_HIP_A,
  J_KNEE_A,
  J_NECK,
  J_ORIGIN,
  J_SASH,
  J_SH_A,
  J_TOE_A,
  J_WAIST,
  S_CZH,
  S_D,
  S_DH,
  S_EYE,
  S_GROUND,
  S_HEADROT,
  S_LOOKY,
  S_SPIN,
} from './rig';

export interface ChainPts {
  readonly n: number;
  readonly rx: Float32Array;
  readonly ry: Float32Array;
}

export interface SecView {
  tail: ChainPts;
  sashA: ChainPts;
  sashB: ChainPts;
}

// --- Colours: night indigo, dusk violet, moon pale, and one family of pale gold light.
const NIGHT_TOP = rgb(0x141940);
const NIGHT_LOW = rgb(0x05060f);
const NIGHT_MID = rgb(0x0b0e2a);
const SASH_TOP = rgb(0x4a3470);
const SASH_LOW = rgb(0x21173e);
const MOON = rgb(0xdfe4f4);
const MOON_SHADE = rgb(0x8c93bd);
const EYE_HOT = rgb(0xfff6df);
const EYE_GOLD = rgb(0xffd27a);
const STAR_BLUE = rgb(0xb9c8ff);
const TAIL_MID = rgb(0x5b4a9c);
const TAIL_LIT: RGB = [1, 0.9, 0.68];
const HALO = rgb(0x5f78ff);
const SHADOW: RGB = [0.01, 0.03, 0.06];

function dim(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

const SH_TORSO: Shade = { c0: NIGHT_LOW, c1: NIGHT_TOP, rim: 0.8, cool: 0.6, form: 0.28, band: 0.5 };
const SH_LIMB: Shade = { c0: NIGHT_TOP, c1: NIGHT_LOW, rim: 0.95, cool: 0.65, form: 0.3, band: 0.55 };
const SH_LIMB_FAR: Shade = {
  c0: dim(NIGHT_TOP, 0.72),
  c1: dim(NIGHT_LOW, 0.72),
  rim: 0.4,
  cool: 0.4,
  form: 0.2,
  band: 0.55,
};
const SH_HEAD: Shade = { c0: NIGHT_TOP, c1: NIGHT_MID, rim: 1, cool: 0.65, form: 0.3, band: 0.34 };
const SH_TAIL: Shade = { c0: NIGHT_TOP, c1: TAIL_LIT, rim: 0.6, cool: 0.3, form: 0.1, band: 0.5 };
const SH_SASH: Shade = { c0: SASH_TOP, c1: SASH_LOW, rim: 1, cool: 0.5, form: 0.2, band: 0.5, ember: 0.8 };
const SH_SASH_FAR: Shade = {
  c0: dim(SASH_TOP, 0.75),
  c1: dim(SASH_LOW, 0.75),
  rim: 0.7,
  cool: 0.4,
  form: 0.15,
  band: 0.5,
  ember: 0.6,
};
const SH_MOON: Shade = { c0: MOON, c1: MOON_SHADE, rim: 0.3, cool: 0.1, form: 0.1, band: 0.5 };
const SH_EYE: Shade = { c0: EYE_GOLD, c1: EYE_HOT, rim: 0, cool: 0, form: 0, band: 0.5, ember: 0 };
const SH_BAND: Shade = { c0: GOLD_HOT, c1: GOLD_HOT, rim: 0, cool: 0, form: 0, band: 0.5, ember: 0 };
const SH_BAND_FAR: Shade = {
  c0: dim(GOLD_HOT, 0.78),
  c1: dim(GOLD, 0.78),
  rim: 0,
  cool: 0,
  form: 0,
  band: 0.5,
  ember: 0,
};

/** Smooths a chain into px/py from index `at` with `sub` samples per segment; returns the next free index. */
function curve(p: Painter, c: ChainPts, sub: number, at: number): number {
  const { rx, ry, n } = c;
  let k = at;
  for (let i = 0; i < n - 1; i++) {
    const i0 = i > 0 ? i - 1 : 0;
    const i2 = i + 1;
    const i3 = i + 2 < n ? i + 2 : n - 1;
    for (let q = 0; q < sub; q++) {
      const t = q / sub;
      p.px[k] = catmull(rx[i0]!, rx[i]!, rx[i2]!, rx[i3]!, t);
      p.py[k] = catmull(ry[i0]!, ry[i]!, ry[i2]!, ry[i3]!, t);
      k++;
    }
  }
  p.px[k] = rx[n - 1]!;
  p.py[k] = ry[n - 1]!;
  return k + 1;
}

/** A limb through three joints, rounded at the middle one, with a width at each joint. */
function limb(
  p: Painter,
  j: Float32Array,
  a: number,
  b: number,
  c: number,
  w0: number,
  w1: number,
  w2: number,
  sh: Shade,
): void {
  const ax = j[a * 2]!;
  const ay = j[a * 2 + 1]!;
  const bx = j[b * 2]!;
  const by = j[b * 2 + 1]!;
  const cx = j[c * 2]!;
  const cy = j[c * 2 + 1]!;
  const SUB = 5;
  // How much the joint is rounded off (1 = a smooth bow, 0 = two straight bones).
  const ROUND = 0.4;
  let k = 0;
  for (let q = 0; q <= SUB; q++) {
    const t = q / SUB;
    p.px[k] = lerp(lerp(ax, bx, t), catmull(ax, ax, bx, cx, t), ROUND);
    p.py[k] = lerp(lerp(ay, by, t), catmull(ay, ay, by, cy, t), ROUND);
    // A little muscle on the upper segment.
    p.pw[k] = lerp(w0, w1, t) + 0.35 * Math.sin(Math.PI * t) * (w0 - w1);
    k++;
  }
  for (let q = 1; q <= SUB; q++) {
    const t = q / SUB;
    p.px[k] = lerp(lerp(bx, cx, t), catmull(ax, bx, cx, cx, t), ROUND);
    p.py[k] = lerp(lerp(by, cy, t), catmull(ay, by, cy, cy, t), ROUND);
    p.pw[k] = lerp(w1, w2, t) + 0.3 * Math.sin(Math.PI * t ** 0.7) * (w1 - w2);
    k++;
  }
  p.ribbon(k, sh, true, true);
}

/**
 * A band of light round a limb at `at` (0 = joint a .. 1 = joint b): a short bright bar across
 * the limb with a soft halo.
 */
function band(
  p: Painter,
  j: Float32Array,
  a: number,
  b: number,
  at: number,
  half: number,
  far: boolean,
  glow: number,
): void {
  const ax = j[a * 2]!;
  const ay = j[a * 2 + 1]!;
  const bx = j[b * 2]!;
  const by = j[b * 2 + 1]!;
  let dx = bx - ax;
  let dy = by - ay;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  const x = lerp(ax, bx, at);
  const y = lerp(ay, by, at);
  const k = far ? 0.6 : 1;
  p.glow(x, y, 15, GOLD, 0.085 * k * glow);
  p.glow(x, y, 6.2, GOLD, 0.42 * k * glow);
  p.px[0] = x + dy * half;
  p.py[0] = y - dx * half;
  p.px[1] = x - dy * half;
  p.py[1] = y + dx * half;
  p.pw[0] = 0.95;
  p.pw[1] = 0.95;
  p.ribbon(2, far ? SH_BAND_FAR : SH_BAND, true, true);
  p.glow(x, y, 3, GOLD_HOT, 0.5 * k * glow);
}

function leg(p: Painter, j: Float32Array, side: number, far: boolean, glow: number): void {
  const sh = far ? SH_LIMB_FAR : SH_LIMB;
  limb(p, j, J_HIP_A + side, J_KNEE_A + side, J_ANK_A + side, 4.5, 3.0, 1.9, sh);
  // Foot: a soft pointed slipper from the heel through the ankle to the toe.
  const ax = j[(J_ANK_A + side) * 2]!;
  const ay = j[(J_ANK_A + side) * 2 + 1]!;
  const tx = j[(J_TOE_A + side) * 2]!;
  const ty = j[(J_TOE_A + side) * 2 + 1]!;
  const dx = tx - ax;
  const dy = ty - ay;
  p.px[0] = ax - dx * 0.24;
  p.py[0] = ay - dy * 0.24;
  p.pw[0] = 1.55;
  p.px[1] = ax + dx * 0.3;
  p.py[1] = ay + dy * 0.3;
  p.pw[1] = 2.15;
  p.px[2] = ax + dx * 0.7;
  p.py[2] = ay + dy * 0.7;
  p.pw[2] = 1.6;
  p.px[3] = tx;
  p.py[3] = ty;
  p.pw[3] = 0.3;
  p.ribbon(4, sh, true, false);
  band(p, j, J_KNEE_A + side, J_ANK_A + side, 0.86, 2.5, far, glow);
}

function arm(p: Painter, j: Float32Array, side: number, far: boolean, glow: number): void {
  const sh = far ? SH_LIMB_FAR : SH_LIMB;
  limb(p, j, J_SH_A + side, J_EL_A + side, J_HAND_A + side, 2.8, 2.05, 1.5, sh);
  const hx = j[(J_HAND_A + side) * 2]!;
  const hy = j[(J_HAND_A + side) * 2 + 1]!;
  const ex = j[(J_EL_A + side) * 2]!;
  const ey = j[(J_EL_A + side) * 2 + 1]!;
  const a = Math.atan2(hy - ey, hx - ex);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // A small mitten hand with a thumb: open and relaxed.
  p.ellipse(hx + ca * 1.9, hy + sa * 1.9, 2.5, 1.75, a, sh, 10);
  p.ellipse(hx + ca * 1.2 - sa * 1.5, hy + sa * 1.2 + ca * 1.5, 1.3, 0.8, a + 0.7, sh, 8);
  band(p, j, J_EL_A + side, J_HAND_A + side, 0.9, 2.15, far, glow);
}

function torso(p: Painter, j: Float32Array): void {
  const hx = j[J_HIP * 2]!;
  const hy = j[J_HIP * 2 + 1]!;
  const cx = j[J_CHEST * 2]!;
  const cy = j[J_CHEST * 2 + 1]!;
  const nx = j[J_NECK * 2]!;
  const ny = j[J_NECK * 2 + 1]!;
  const N = 11;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    // 0..0.72 hip to chest, then chest to neck.
    const SPLIT = 0.72;
    if (t <= SPLIT) {
      const u = t / SPLIT;
      p.px[i] = catmull(hx, hx, cx, nx, u) + (hx - cx) * 0.12 * (1 - u);
      p.py[i] = catmull(hy, hy, cy, ny, u) + (hy - cy) * 0.12 * (1 - u);
    } else {
      const u = (t - SPLIT) / (1 - SPLIT);
      p.px[i] = catmull(hx, cx, nx, nx, u);
      p.py[i] = catmull(hy, cy, ny, ny, u);
    }
    // Hips, a narrow waist, the chest, then up into the neck.
    const hips = 4.9 * (1 - smoothstep(0, 0.3, t));
    const waist = 3.7;
    const chest = 2.1 * bellAt(t, 0.62, 0.3);
    const neck = 1 - 0.5 * smoothstep(0.74, 1, t);
    p.pw[i] = (Math.max(hips, waist) + chest) * neck;
  }
  p.ribbon(N, SH_TORSO, true, true);
}

function bellAt(t: number, c: number, w: number): number {
  const u = (t - c) / w;
  return Math.exp(-u * u * 2.2);
}

/** The waist wrap: a slanted band from the front of the waist to the knot at the back. */
function sashBand(p: Painter, j: Float32Array): void {
  const fx = j[J_WAIST * 2]!;
  const fy = j[J_WAIST * 2 + 1]!;
  const kx = j[J_SASH * 2]!;
  const ky = j[J_SASH * 2 + 1]!;
  const N = 5;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    p.px[i] = lerp(fx, kx, t);
    p.py[i] = lerp(fy, ky, t) + Math.sin(Math.PI * t) * 0.9;
    p.pw[i] = lerp(1.5, 2.3, t);
  }
  p.ribbon(N, SH_SASH, true, true);
  p.ellipse(kx, ky, 2.2, 1.9, 0.4, SH_SASH, 10);
}

function sashTail(p: Painter, c: ChainPts, w: number, sh: Shade): void {
  const n = curve(p, c, 3, 0);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    p.pw[i] =
      w * (0.75 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.35))) * (1 - sat((t - 0.72) / 0.28) ** 1.6) +
      0.12;
  }
  p.ribbon(n, sh, false, false);
}

/**
 * The comet tail: one ribbon from the head's centre (as wide as the crest there) thinning along
 * the chain into a thread of light, colour running from night through violet to pale gold, with
 * an additive glow that grows toward the star at its tip.
 */
function tail(p: Painter, c: ChainPts, hx: number, hy: number, clock: number, glow: number): void {
  const n = curve(p, c, 3, 2);
  p.px[0] = hx;
  p.py[0] = hy;
  p.px[1] = (hx + p.px[2]!) * 0.5;
  p.py[1] = (hy + p.py[2]!) * 0.5;
  p.pw[0] = 7.6;
  p.pw[1] = 7.0;
  for (let i = 0; i < 3; i++) setC(p, i, NIGHT_TOP[0], NIGHT_TOP[1], NIGHT_TOP[2]);
  const m = n - 2;
  for (let i = 0; i < m; i++) {
    const t = i / (m - 1);
    const k = i + 2;
    p.pw[k] = lerp(5.6, 0.95, smoothstep(0, 0.42, t) ** 0.75) * (1 - 0.35 * smoothstep(0.7, 1, t));
    const a = smoothstep(0.1, 0.4, t);
    const b = smoothstep(0.32, 0.66, t);
    setC(
      p,
      k,
      lerp(lerp(NIGHT_TOP[0], TAIL_MID[0], a), TAIL_LIT[0], b),
      lerp(lerp(NIGHT_TOP[1], TAIL_MID[1], a), TAIL_LIT[1], b),
      lerp(lerp(NIGHT_TOP[2], TAIL_MID[2], a), TAIL_LIT[2], b),
    );
  }
  p.setCapSample(n - 1);
  p.ribbon(n, SH_TAIL, false, true, true);
  // The light in it.
  for (let i = 0; i < m; i++) {
    const t = i / (m - 1);
    const k = i + 2;
    p.px[i] = p.px[k]!;
    p.py[i] = p.py[k]!;
    p.pw[i] = lerp(2.2, 4.6, t);
    const shimmer = 0.85 + 0.15 * noise1(clock * 2.2 - t * 5, 51);
    p.pc[i * 3] = smoothstep(0.22, 0.75, t) * 0.34 * shimmer * glow;
  }
  p.streak(m, GOLD);
}

function setC(p: Painter, i: number, r: number, g: number, b: number): void {
  p.pc[i * 3] = r;
  p.pc[i * 3 + 1] = g;
  p.pc[i * 3 + 2] = b;
}

/** The star at the tail's tip: a small hot point with four soft rays that slowly turn and breathe. */
export function star(p: Painter, x: number, y: number, clock: number, k: number): void {
  const tw = 0.9 + 0.1 * noise1(clock * 5.5, 61) + 0.06 * Math.sin(clock * 2.1);
  p.glow(x, y, 30 * k, GOLD, 0.11 * tw);
  p.glow(x, y, 12 * k, GOLD, 0.5 * tw);
  const rot = 0.3 + 0.25 * Math.sin(clock * 0.6);
  for (let r = 0; r < 2; r++) {
    const a = rot + (r * Math.PI) / 2;
    const len = (r === 0 ? 8.5 : 5.5) * (0.85 + 0.15 * tw) * k;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i < 5; i++) {
      const u = (i - 2) / 2;
      p.px[i] = x + ca * len * u;
      p.py[i] = y + sa * len * u;
      p.pw[i] = 1.5 * (1 - Math.abs(u)) + 0.25;
      p.pc[i * 3] = (1 - Math.abs(u)) ** 1.5 * 0.9 * tw;
    }
    p.streak(5, GOLD_HOT);
  }
  p.glow(x, y, 3.6 * k, GOLD_HOT, 1.0 * tw);
}

function head(p: Painter, f: Frame): void {
  const { j, s } = f;
  const hx = j[J_HEAD * 2]!;
  const hy = j[J_HEAD * 2 + 1]!;
  const rot = s[S_HEADROT]!;
  const dh = s[S_DH]!;
  const czh = s[S_CZH]!;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const W = BODY.headW;
  const Hh = BODY.headH;
  // A smooth egg, a little narrower at the jaw, drawn back at the crown toward the tail.
  const SEG = 32;
  const tipA = Math.atan2(-3.4, -7.2 * dh);
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    let da = a - tipA;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const tip = 1 + 0.14 * Math.exp(-(da * da) / 0.5);
    const lx = ca * W * (1 - 0.1 * Math.max(0, sa)) * tip;
    const ly = sa * Hh * tip * (sa < 0 ? 1.03 : 1);
    p.px[i] = hx + lx * cr - ly * sr;
    p.py[i] = hy + lx * sr + ly * cr;
  }
  p.shape(SEG, hx, hy, SH_HEAD, hx + sr * Hh, hy - cr * Hh, hx - sr * Hh, hy + cr * Hh);

  const yaw = dh * BODY.sinHeadYaw;
  // The moon-sliver: the lit limb of the head on the side it faces, brow to cheek. It thins to
  // nothing as the head turns through the camera and comes up on the other side.
  const face = dh >= 0 ? 1 : -1;
  const lit = smoothstep(0.08, 0.6, Math.abs(yaw));
  if (lit > 0.01) {
    const MN = 15;
    const mid = -0.42;
    const span = 1.2;
    const rr = 0.8;
    for (let i = 0; i < MN; i++) {
      const t = i / (MN - 1);
      const a = mid + (t - 0.5) * 2 * span;
      const w = 2.5 * lit * Math.sin(Math.PI * t) ** 0.85 + 0.04;
      // The outer edge follows the head's outline; the inner edge is a flatter arc.
      const lx = face * Math.cos(a) * (W * rr - w * 0.55);
      const ly = Math.sin(a) * (Hh * rr - w * 0.55);
      p.px[i] = hx + lx * cr - ly * sr;
      p.py[i] = hy + lx * sr + ly * cr;
      p.pw[i] = w;
    }
    p.ribbon(MN, SH_MOON, false, false);
  }

  // Eyes: two calm almonds of light, outer corners a little lowered.
  const open = clamp(s[S_EYE]!, 0, 1);
  const lookY = s[S_LOOKY]!;
  const ESEG = 14;
  for (let side = 0; side < 2; side++) {
    const sd = side === 0 ? 1 : -1;
    const near = sd * dh >= 0;
    const lx = yaw * 2.0 - sd * czh * 3.4;
    const ly = 1.2 + lookY * 0.9;
    const w = near ? 2.5 * (0.42 + 0.58 * czh) : 2.3 * (0.08 + 0.92 * czh);
    const h = Math.max(0.28, 1.75 * open);
    const ex = hx + lx * cr - ly * sr;
    const ey = hy + lx * sr + ly * cr;
    const tilt = rot - sd * 0.26 * czh;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    for (let i = 0; i < ESEG; i++) {
      const a = (i / ESEG) * Math.PI * 2;
      const qx = Math.cos(a) * w;
      const sa = Math.sin(a);
      // Heavy upper lid: the top is flatter than the bottom.
      const qy = sa * h * (0.35 + 0.65 * Math.abs(sa)) * (sa < 0 ? 0.68 : 1);
      p.px[i] = ex + qx * ct - qy * st;
      p.py[i] = ey + qx * st + qy * ct;
    }
    p.shape(ESEG, ex, ey, SH_EYE, ex - st * h, ey + ct * h, ex + st * h * 0.2, ey - ct * h * 0.2);
    p.glow(ex, ey, 6, EYE_GOLD, 0.11 * open);
    p.glow(ex, ey, 2.2, EYE_HOT, 0.2 * open);
  }
}

/** Star-specks inside the body: [joint a, joint b, along 0..1, across px, seed]. */
const SPECKS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [J_HIP, J_CHEST, 0.2, 1.6, 1],
  [J_HIP, J_CHEST, 0.55, -1.8, 2],
  [J_HIP, J_CHEST, 0.85, 2.4, 3],
  [J_CHEST, J_NECK, 0.3, -1.2, 4],
  [J_HIP_A, J_KNEE_A, 0.3, 0.9, 5],
  [J_HIP_A, J_KNEE_A, 0.72, -0.8, 6],
  [J_KNEE_A, J_ANK_A, 0.4, 0.5, 7],
  [J_HIP_A + 1, J_KNEE_A + 1, 0.5, 0.7, 8],
  [J_KNEE_A + 1, J_ANK_A + 1, 0.3, -0.5, 9],
  [J_SH_A, J_EL_A, 0.5, 0.5, 10],
  [J_EL_A, J_HAND_A, 0.4, -0.3, 11],
  [J_SH_A + 1, J_EL_A + 1, 0.6, -0.4, 12],
  [J_HEAD, J_NECK, -0.55, -5.5, 13],
  [J_HEAD, J_NECK, -0.2, -7.6, 14],
  [J_HEAD, J_NECK, 0.35, -6.2, 15],
  [J_HEAD, J_NECK, -0.7, 1.5, 16],
];

function specks(p: Painter, f: Frame, clock: number): void {
  const { j, s } = f;
  const d = s[S_D]!;
  for (const [a, b, t, off, seed] of SPECKS) {
    const ax = j[a * 2]!;
    const ay = j[a * 2 + 1]!;
    const bx = j[b * 2]!;
    const by = j[b * 2 + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy) || 1;
    const x = ax + dx * t + (-dy / l) * off * d;
    const y = ay + dy * t + (dx / l) * off * Math.abs(d);
    // Each twinkles on its own slow clock; now and then one flares.
    const tw = 0.5 + 0.5 * noise1(clock * (0.5 + (seed % 5) * 0.13), seed * 3);
    const k = 0.25 + 0.75 * tw * tw;
    const big = seed % 4 === 0;
    p.glow(x, y, big ? 2.5 : 1.7, STAR_BLUE, (big ? 0.62 : 0.45) * k);
  }
}

/** A soft wrap round the neck and shoulders, in the sash's violet. */
function cowl(p: Painter, j: Float32Array, d: number): void {
  const cx = j[J_CHEST * 2]!;
  const cy = j[J_CHEST * 2 + 1]!;
  const nx = j[J_NECK * 2]!;
  const ny = j[J_NECK * 2 + 1]!;
  const ux = nx - cx;
  const uy = ny - cy;
  const a = Math.atan2(uy, ux) + Math.PI / 2;
  const x = cx + ux * 0.95;
  const y = cy + uy * 0.95;
  p.ellipse(x - Math.cos(a) * 0.8 * d, y - Math.sin(a) * 0.8 * d, 5.6, 2.9, a + 0.22 * d, SH_SASH, 14);
}

/** The whole character. */
export function drawNova(p: Painter, f: Frame, sec: SecView, clock: number, glow: number): void {
  const { j, s } = f;
  const d = s[S_D]!;
  // Side A is toward the camera while facing right.
  const near = d >= 0 ? 0 : 1;
  const far = 1 - near;
  const ox = j[J_ORIGIN * 2]!;
  const oy = j[J_ORIGIN * 2 + 1]!;
  p.soft(ox, oy + 1, 24, 4.6, SHADOW, 0.5 * s[S_GROUND]!);
  // A cool halo so the dark figure never sinks into a dark background.
  p.glow(j[J_CENTRE * 2]!, j[J_CENTRE * 2 + 1]! - 4, 74, HALO, 0.05 + 0.03 * s[S_SPIN]!);

  arm(p, j, far, true, glow);
  leg(p, j, far, true, glow);
  sashTail(p, sec.sashB, 1.9, SH_SASH_FAR);
  torso(p, j);
  sashTail(p, sec.sashA, 2.3, SH_SASH);
  sashBand(p, j);
  leg(p, j, near, false, glow);
  cowl(p, j, d);
  tail(p, sec.tail, j[J_HEAD * 2]!, j[J_HEAD * 2 + 1]!, clock, glow);
  head(p, f);
  arm(p, j, near, false, glow);
  specks(p, f, clock);
  const n = sec.tail.n;
  star(p, sec.tail.rx[n - 1]!, sec.tail.ry[n - 1]!, clock, 1);
}
