// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Draws Ember from a solved skeleton frame and the simulated chains, back to front, into the
 * painter. Pure function of its inputs so the same code draws the live body and its dash
 * afterimages (painter.ghost set).
 *
 * The look: a small cloaked wanderer. Near-black indigo mantle and hood, the hood sweeping back
 * into one long crest; a pale bone mask in the hood's shadow with two calm amber eyes; one warm
 * light, the ember clasp at the throat.
 */
import { PALETTE } from '../../scene/lib/look';
import { catmull, clamp, lerp, sat } from './math';
import { type Painter, type RGB, rgb, type Shade } from './paint';
import {
  BODY,
  type Frame,
  J_ANK_A,
  J_CENTRE,
  J_CHEST,
  J_CLASP,
  J_EL_A,
  J_HAND_A,
  J_HEAD,
  J_HIP,
  J_HIP_A,
  J_KNEE_A,
  J_NECK,
  J_ORIGIN,
  J_SH_A,
  J_TOE_A,
  S_CZH,
  S_D,
  S_DH,
  S_EMBER,
  S_EYE,
  S_GROUND,
  S_HEADROT,
  S_LOOKY,
} from './rig';

export interface ChainPts {
  readonly n: number;
  readonly rx: Float32Array;
  readonly ry: Float32Array;
}

export interface SecView {
  crest: ChainPts;
  mantle: ChainPts[];
}

// --- Colours: few and muted. One indigo family, one bone, one warm light.
const CLOTH_TOP = rgb(0x1d2450);
const CLOTH_HEM = rgb(0x0b0e24);
const HOOD_TOP = rgb(0x1f2654);
const HOOD_LOW = rgb(0x0f132c);
const LIMB_TOP = rgb(0x191f46);
const LIMB_LOW = rgb(0x0a0d20);
const BONE = rgb(0xcdc6b8);
const BONE_SHADE = rgb(0x3f3d66);
const EYE_RIM = rgb(0xe85a0c);
const EYE_CORE = rgb(0xffb648);
const EMBER = rgb(PALETTE.ember);
const EMBER_HOT = rgb(0xfff4d6);
const EMBER_DEEP = rgb(0xff7a2a);
const HALO = rgb(0x6f7cff);
const SHADOW: RGB = [0.01, 0.03, 0.06];

function dim(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

const SH_TORSO: Shade = { c0: LIMB_LOW, c1: LIMB_TOP, rim: 0.7, cool: 0.4, form: 0.25, band: 0.5 };
const SH_LIMB: Shade = { c0: LIMB_TOP, c1: LIMB_LOW, rim: 0.9, cool: 0.5, form: 0.3, band: 0.55 };
const SH_LIMB_FAR: Shade = {
  c0: dim(LIMB_TOP, 0.7),
  c1: dim(LIMB_LOW, 0.7),
  rim: 0.4,
  cool: 0.3,
  form: 0.2,
  band: 0.55,
};
const SH_HOOD: Shade = { c0: HOOD_TOP, c1: HOOD_LOW, rim: 1, cool: 0.55, form: 0.3, band: 0.36 };
const SH_CREST: Shade = { c0: HOOD_TOP, c1: CLOTH_HEM, rim: 1, cool: 0.55, form: 0.3, band: 0.5 };
const SH_MASK: Shade = { c0: BONE_SHADE, c1: BONE, rim: 0.5, cool: 0.2, form: 0.1, band: 0.45, ember: 1.2 };
const SH_EYE: Shade = { c0: EYE_RIM, c1: EYE_CORE, rim: 0, cool: 0, form: 0, band: 0.5, ember: 0 };
const SH_CLOTH: Shade = { c0: CLOTH_TOP, c1: CLOTH_HEM, rim: 1, cool: 0.55, form: 0, band: 0.5, ember: 1.3 };
const SH_CLOTH_BACK: Shade = {
  c0: CLOTH_TOP,
  c1: CLOTH_HEM,
  rim: 0.3,
  cool: 0.25,
  form: 0,
  band: 0.5,
  ember: 0.6,
};
const SH_CLASP: Shade = { c0: EMBER_HOT, c1: EMBER, rim: 0, cool: 0, form: 0, band: 0.6, ember: 0 };

/** Smooths a chain into px/py with `sub` samples per segment; returns the sample count. */
function curve(p: Painter, c: ChainPts, sub: number): number {
  const { rx, ry, n } = c;
  let k = 0;
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
  let k = 0;
  for (let q = 0; q <= SUB; q++) {
    const t = q / SUB;
    p.px[k] = catmull(ax, ax, bx, cx, t);
    p.py[k] = catmull(ay, ay, by, cy, t);
    p.pw[k] = lerp(w0, w1, t);
    k++;
  }
  for (let q = 1; q <= SUB; q++) {
    const t = q / SUB;
    p.px[k] = catmull(ax, bx, cx, cx, t);
    p.py[k] = catmull(ay, by, cy, cy, t);
    p.pw[k] = lerp(w1, w2, t);
    k++;
  }
  p.ribbon(k, sh, true, true);
}

function leg(p: Painter, j: Float32Array, side: number, far: boolean): void {
  const sh = far ? SH_LIMB_FAR : SH_LIMB;
  limb(p, j, J_HIP_A + side, J_KNEE_A + side, J_ANK_A + side, 3.3, 2.4, 1.4, sh);
  // Foot: a soft pointed slipper from the heel through the ankle to the toe.
  const ax = j[(J_ANK_A + side) * 2]!;
  const ay = j[(J_ANK_A + side) * 2 + 1]!;
  const tx = j[(J_TOE_A + side) * 2]!;
  const ty = j[(J_TOE_A + side) * 2 + 1]!;
  const dx = tx - ax;
  const dy = ty - ay;
  p.px[0] = ax - dx * 0.22;
  p.py[0] = ay - dy * 0.22;
  p.pw[0] = 1.45;
  p.px[1] = ax + dx * 0.3;
  p.py[1] = ay + dy * 0.3;
  p.pw[1] = 2.1;
  p.px[2] = ax + dx * 0.7;
  p.py[2] = ay + dy * 0.7;
  p.pw[2] = 1.6;
  p.px[3] = tx;
  p.py[3] = ty;
  p.pw[3] = 0.3;
  p.ribbon(4, sh, true, false);
}

function arm(p: Painter, j: Float32Array, side: number, far: boolean): void {
  const sh = far ? SH_LIMB_FAR : SH_LIMB;
  limb(p, j, J_SH_A + side, J_EL_A + side, J_HAND_A + side, 2.3, 1.7, 1.3, sh);
  const hx = j[(J_HAND_A + side) * 2]!;
  const hy = j[(J_HAND_A + side) * 2 + 1]!;
  const ex = j[(J_EL_A + side) * 2]!;
  const ey = j[(J_EL_A + side) * 2 + 1]!;
  const a = Math.atan2(hy - ey, hx - ex);
  p.ellipse(hx + Math.cos(a) * 1.2, hy + Math.sin(a) * 1.2, 2.1, 1.6, a, sh, 10);
}

function torso(p: Painter, j: Float32Array): void {
  const hx = j[J_HIP * 2]!;
  const hy = j[J_HIP * 2 + 1]!;
  const cx = j[J_CHEST * 2]!;
  const cy = j[J_CHEST * 2 + 1]!;
  const nx = j[J_NECK * 2]!;
  const ny = j[J_NECK * 2 + 1]!;
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const u = t * 2;
    if (u <= 1) {
      p.px[i] = catmull(hx, hx, cx, nx, u) + (hx - cx) * 0.15 * (1 - u);
      p.py[i] = catmull(hy, hy, cy, ny, u) + (hy - cy) * 0.15 * (1 - u);
    } else {
      p.px[i] = catmull(hx, cx, nx, nx, u - 1);
      p.py[i] = catmull(hy, cy, ny, ny, u - 1);
    }
    p.pw[i] = lerp(4.8, 5.2, sat(t * 3)) * (1 - 0.55 * sat((t - 0.4) / 0.6) ** 1.3);
  }
  p.ribbon(N, SH_TORSO, true, true);
}

const COLS = 13;
const ROWS = 13;
/** How far each hem column reaches along its last row (1 = the strand's end): a softly worn edge. */
const HEM = [1, 0.84, 0.95, 1.1, 0.86, 0.97, 1.14, 0.9, 0.82, 1.06, 0.88, 0.96, 1];
/** Fold pattern across the cloth, -1..1 per column. */
const FOLD = [0.2, -0.5, 0.35, 0.8, -0.3, -0.75, 0.25, 0.7, -0.2, -0.6, 0.45, 0.1, -0.3];

const sx = new Float32Array(5 * ROWS);
const sy = new Float32Array(5 * ROWS);

/**
 * The mantle: one sheet through the five strands. `back` draws the far half behind the body:
 * darker, shifted a little across, no rim.
 */
function mantle(p: Painter, f: Frame, strands: ChainPts[], back: boolean): void {
  const { j, s } = f;
  const d = s[S_D]!;
  const ns = strands.length;
  // Smooth each strand down its length.
  for (let k = 0; k < ns; k++) {
    const n = curve(p, strands[k]!, 3);
    for (let r = 0; r < ROWS; r++) {
      const i = Math.min(n - 1, r);
      sx[k * ROWS + r] = p.px[i]!;
      sy[k * ROWS + r] = p.py[i]!;
    }
  }
  // Then across the strands, and trim the hem.
  const { gx, gy, gc } = p;
  const offX = back ? d * 3.2 : 0;
  const offY = back ? -0.6 : 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = (c / (COLS - 1)) * (ns - 1);
      const k = Math.min(ns - 2, Math.floor(u));
      const t = u - k;
      const k0 = Math.max(0, k - 1);
      const k3 = Math.min(ns - 1, k + 2);
      const i = r * COLS + c;
      gx[i] =
        catmull(sx[k0 * ROWS + r]!, sx[k * ROWS + r]!, sx[(k + 1) * ROWS + r]!, sx[k3 * ROWS + r]!, t) + offX;
      gy[i] =
        catmull(sy[k0 * ROWS + r]!, sy[k * ROWS + r]!, sy[(k + 1) * ROWS + r]!, sy[k3 * ROWS + r]!, t) + offY;
    }
  }
  const last = (ROWS - 1) * COLS;
  const prev = (ROWS - 2) * COLS;
  for (let c = 0; c < COLS; c++) {
    const h = HEM[c]!;
    gx[last + c] = gx[prev + c]! + (gx[last + c]! - gx[prev + c]!) * h;
    gy[last + c] = gy[prev + c]! + (gy[last + c]! - gy[prev + c]!) * h;
  }
  // Colour: a cool gradient to the hem, soft folds deepening downward, the side toward the key
  // light a little lifted, and the ember's warmth on the cloth near the clasp.
  const ex = j[J_CLASP * 2]!;
  const ey = j[J_CLASP * 2 + 1]!;
  for (let r = 0; r < ROWS; r++) {
    const t = r / (ROWS - 1);
    const x0 = gx[r * COLS]!;
    const x1 = gx[r * COLS + COLS - 1]!;
    const mid = (x0 + x1) * 0.5;
    const half = Math.max(4, Math.abs(x1 - x0) * 0.5);
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const fold = FOLD[c]! * (0.15 + 0.85 * t) * 0.42;
      const lit = clamp((gx[i]! - mid) / half, -1, 1) * 0.28 * (1 - 0.4 * t);
      let k = 1 + fold + lit;
      if (back) k *= 0.55;
      let cr = lerp(CLOTH_TOP[0], CLOTH_HEM[0], t) * k;
      let cg = lerp(CLOTH_TOP[1], CLOTH_HEM[1], t) * k;
      let cb = lerp(CLOTH_TOP[2], CLOTH_HEM[2], t) * k;
      if (!back) {
        const dd = Math.hypot(gx[i]! - ex, gy[i]! - ey);
        const warm = sat(1 - dd / 20) ** 2 * 0.14;
        cr += EMBER_DEEP[0] * warm;
        cg += EMBER_DEEP[1] * warm * 0.8;
        cb += EMBER_DEEP[2] * warm * 0.5;
      }
      gc[i * 3] = cr;
      gc[i * 3 + 1] = cg;
      gc[i * 3 + 2] = cb;
    }
  }
  p.grid(COLS, ROWS, back ? SH_CLOTH_BACK : SH_CLOTH, 2.6);
}

/**
 * The hood's tail: one ribbon that starts as wide as the head at the head's centre and tapers
 * along the crest chain, so hood and crest read as a single drawn-back shape.
 */
function crest(p: Painter, c: ChainPts, hx: number, hy: number): void {
  const n = curve(p, c, 3);
  // Make room for two lead-in samples from the head's centre to the chain's root.
  for (let i = n - 1; i >= 0; i--) {
    p.px[i + 2] = p.px[i]!;
    p.py[i + 2] = p.py[i]!;
  }
  p.px[0] = hx;
  p.py[0] = hy;
  p.px[1] = (hx + p.px[2]!) * 0.5;
  p.py[1] = (hy + p.py[2]!) * 0.5;
  p.pw[0] = 10;
  p.pw[1] = 9;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    p.pw[i + 2] = 7.8 * (1 - t ** 1.7) + 0.1;
  }
  p.ribbon(n + 2, SH_CREST, false, false);
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
  // Hood: a smooth dome drawn back toward the crest, like a held flame.
  const SEG = 32;
  const tipA = -Math.PI / 2 - 0.8 * dh;
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    let da = a - tipA;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const tip = 1 + 0.06 * Math.exp(-(da * da) / 0.4);
    // A slightly narrower jaw than crown.
    const lx = ca * W * (1 - 0.08 * Math.max(0, sa)) * tip;
    const ly = sa * Hh * tip * (sa < 0 ? 1.06 : 1);
    p.px[i] = hx + lx * cr - ly * sr;
    p.py[i] = hy + lx * sr + ly * cr;
  }
  p.shape(SEG, hx, hy, SH_HOOD, hx + sr * Hh, hy - cr * Hh, hx - sr * Hh, hy + cr * Hh);

  // Mask: a plain bone shield, longer at the chin, lying in the hood's shadow at the brow.
  const yaw = dh * BODY.sinHeadYaw;
  const mx = yaw * 3.8;
  const my = 2.1;
  const mw = 5.2 + 3.2 * czh;
  const mh = 8.3;
  const MSEG = 26;
  for (let i = 0; i < MSEG; i++) {
    const a = (i / MSEG) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const lx = mx + ca * mw * (1 - 0.13 * sa);
    const ly = my + sa * mh * (sa > 0 ? 1.04 : 0.9);
    p.px[i] = hx + lx * cr - ly * sr;
    p.py[i] = hy + lx * sr + ly * cr;
  }
  const mcx = hx + mx * cr - my * sr;
  const mcy = hy + mx * sr + my * cr;
  p.shape(MSEG, mcx, mcy, SH_MASK, mcx + sr * mh * 1.1, mcy - cr * mh * 1.1, mcx - sr * 3, mcy + cr * 3);

  // Eyes: two calm almonds, outer corners a little lowered.
  const open = clamp(s[S_EYE]!, 0, 1);
  const lookY = s[S_LOOKY]!;
  const ESEG = 14;
  for (let side = 0; side < 2; side++) {
    const sd = side === 0 ? 1 : -1;
    const near = sd * dh >= 0;
    const lx = yaw * 5.2 - sd * czh * 3.7;
    const ly = 1.6 + lookY * 1.0;
    const w = near ? 2.9 * (0.42 + 0.58 * czh) : 2.7 * (0.08 + 0.92 * czh);
    const h = Math.max(0.3, 1.9 * open);
    const ex = hx + lx * cr - ly * sr;
    const ey = hy + lx * sr + ly * cr;
    const tilt = rot - sd * 0.3 * czh;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    for (let i = 0; i < ESEG; i++) {
      const a = (i / ESEG) * Math.PI * 2;
      const qx = Math.cos(a) * w;
      const sa = Math.sin(a);
      // Heavy upper lid: the top is flatter than the bottom.
      const qy = sa * h * (0.35 + 0.65 * Math.abs(sa)) * (sa < 0 ? 0.7 : 1);
      p.px[i] = ex + qx * ct - qy * st;
      p.py[i] = ey + qx * st + qy * ct;
    }
    if (!p.ghost) p.soft(ex, ey, w * 1.9, h * 2.1, [0.12, 0.1, 0.24], 0.55);
    p.shape(ESEG, ex, ey, SH_EYE, ex - st * h, ey + ct * h, ex + st * h * 0.2, ey - ct * h * 0.2);
    p.glow(ex, ey, 6, EYE_RIM, 0.1 * open);
  }
}

function clasp(p: Painter, f: Frame, clock: number): void {
  const { j, s } = f;
  const x = j[J_CLASP * 2]!;
  const y = j[J_CLASP * 2 + 1]!;
  const k = s[S_EMBER]!;
  const breathe = 0.94 + 0.06 * Math.sin(clock * 1.7);
  p.glow(x, y, 28 * k, EMBER_DEEP, 0.08 * breathe * k);
  p.glow(x, y, 13 * k, EMBER, 0.42 * breathe);
  p.ellipse(x, y, 2.2, 2.5, 0, SH_CLASP, 12);
  p.glow(x, y, 5, EMBER_HOT, 0.6 * breathe);
}

/** The whole character. `clock` only drives the ember's slow breathing. */
export function drawEmber(p: Painter, f: Frame, sec: SecView, clock: number): void {
  const { j, s } = f;
  const d = s[S_D]!;
  // Side A is toward the camera while facing right.
  const near = d >= 0 ? 0 : 1;
  const far = 1 - near;
  const ghost = p.ghost !== null;

  if (!ghost) {
    const ox = j[J_ORIGIN * 2]!;
    const oy = j[J_ORIGIN * 2 + 1]!;
    p.soft(ox, oy + 1, 26, 5, SHADOW, 0.5 * s[S_GROUND]!);
    // A faint cool halo so the dark figure never sinks into a dark background.
    p.glow(j[J_CENTRE * 2]!, j[J_CENTRE * 2 + 1]! - 4, 70, HALO, 0.045);
  }

  mantle(p, f, sec.mantle, true);
  arm(p, j, far, true);
  leg(p, j, far, true);
  torso(p, j);
  leg(p, j, near, false);
  arm(p, j, near, false);
  mantle(p, f, sec.mantle, false);
  if (!ghost) clasp(p, f, clock);
  crest(p, sec.crest, j[J_HEAD * 2]!, j[J_HEAD * 2 + 1]!);
  head(p, f);
}
