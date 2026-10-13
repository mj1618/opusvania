// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Draws Vesper from a solved skeleton frame and the simulated chains, back to front, into the
 * shared one-mesh painter.
 *
 * The look: a slender moth-person. Plum-charcoal wings worn as a cape (pale hem band, one softly
 * luminous eye-spot, scalloped hem); a soft heart-shaped face of pale fur with nothing on it but
 * two large calm gold eyes; dark windswept head fur running into two feathered antennae with
 * lantern tips; a ruff of pale fluff at the neck; slim dark limbs with pale cuffs and feet.
 */
import { catmull, clamp, lerp, sat } from '../hooded/math';
import { mixRGB, type Painter, type RGB, rgb, type Shade } from './paint';
import {
  BODY,
  type Frame,
  J_ANK_A,
  J_CENTRE,
  J_CHEST,
  J_COLLAR,
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
  S_EYE,
  S_GROUND,
  S_HEADROT,
  S_LOOKX,
  S_LOOKY,
  S_UPPER,
  S_WIDE,
} from './rig';

export interface ChainPts {
  readonly n: number;
  readonly rx: Float32Array;
  readonly ry: Float32Array;
}

/** What the drawing needs from the simulation and the skin. */
export interface View {
  wings: readonly [{ strands: readonly ChainPts[] }, { strands: readonly ChainPts[] }];
  antennae: readonly [ChainPts, ChainPts];
  /** 0 folded .. 1 wide open: lobes the hem into fore and hind wing. */
  open: number;
  /** Hair lag in world px (tips trail the head). */
  hairX: number;
  hairY: number;
  /** A second, slower lag for the mane's outer tufts, so the fringe ruffles rather than shifts. */
  hair2X: number;
  hair2Y: number;
  /** Light level of her own glow 0.6..1.6. */
  glow: number;
  /** Somersault tuck 0..1. */
  tuck: number;
  /** Wall-slide weight 0..1 and the wall's side on screen (-1 / 1). */
  wall: number;
  wallDir: number;
}

function dim(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

// --- Colours. Plum-charcoal family, pale ash fur, one light: pale gold.
const WING_TOP = rgb(0x553a6e);
const WING_MID = rgb(0x30204a);
const WING_LOW = rgb(0x150f28);
const BAND = rgb(0xeadccc);
const TUNIC_TOP = rgb(0x34274e);
const TUNIC_LOW = rgb(0x171128);
const SLEEVE = rgb(0x3f3060);
const SLEEVE_LOW = rgb(0x211838);
const LEG_TOP = rgb(0x2b2044);
const LEG_LOW = rgb(0x130e22);
const FUR = rgb(0xd6ced4);
const FUR_SHADE = rgb(0x847c9c);
const FACE_LIT = rgb(0xf6f0ea);
const FACE_SHADE = rgb(0xbab2cc);
const CROWN_TOP = rgb(0x2e2246);
const CROWN_LOW = rgb(0x100b1c);
const HAND = rgb(0xdcd2d0);
const WRAP = rgb(0xbcb4c0);
const METAL = rgb(0xcdb98a);
const EYE_RIM = rgb(0xd9820f);
const GOLD = rgb(0xffdf9c);
const GOLD_HOT = rgb(0xfffaea);
const GOLD_DEEP = rgb(0xe9a04a);
const HALO: RGB = [0.78, 0.72, 0.95];
const HALO_WARM: RGB = [1, 0.9, 0.72];
const SHADOW: RGB = [0.01, 0.03, 0.06];
const SPOT_DARK = rgb(0x120e1e);
const EYE_PATCH: RGB = [0.1, 0.07, 0.15];
const BLUSH: RGB = [0.86, 0.36, 0.46];

const SH_TORSO: Shade = { c0: TUNIC_LOW, c1: TUNIC_TOP, rim: 1, cool: 0.95, form: 0.25, band: 0.5 };
const SH_ARM: Shade = { c0: SLEEVE, c1: SLEEVE_LOW, rim: 1, cool: 0.95, form: 0.3, band: 0.55 };
const SH_ARM_FAR: Shade = {
  c0: dim(SLEEVE, 0.6),
  c1: dim(SLEEVE_LOW, 0.6),
  rim: 0.35,
  cool: 0.3,
  form: 0.2,
  band: 0.55,
};
const SH_LEG: Shade = { c0: LEG_TOP, c1: LEG_LOW, rim: 1, cool: 0.95, form: 0.3, band: 0.6 };
const SH_LEG_FAR: Shade = {
  c0: dim(LEG_TOP, 0.62),
  c1: dim(LEG_LOW, 0.7),
  rim: 0.4,
  cool: 0.5,
  form: 0.2,
  band: 0.6,
};
const SH_HAND: Shade = { c0: HAND, c1: dim(HAND, 0.85), rim: 0.5, cool: 0.2, form: 0.15, band: 0.5 };
const SH_HAND_FAR: Shade = {
  c0: dim(HAND, 0.55),
  c1: dim(HAND, 0.5),
  rim: 0.2,
  cool: 0.2,
  form: 0.1,
  band: 0.5,
};
const SH_WRAP: Shade = { c0: WRAP, c1: dim(WRAP, 0.8), rim: 0.5, cool: 0.2, form: 0.2, band: 0.5 };
const SH_FOOT: Shade = { c0: dim(WRAP, 0.85), c1: FUR, rim: 0.6, cool: 0.3, form: 0.2, band: 0.5 };
const SH_FOOT_FAR: Shade = {
  c0: dim(WRAP, 0.5),
  c1: dim(FUR, 0.5),
  rim: 0.2,
  cool: 0.3,
  form: 0.1,
  band: 0.5,
};
const SH_FUR: Shade = {
  c0: FUR,
  c1: mixRGB(FUR, FUR_SHADE, 0.45),
  rim: 0.6,
  cool: 0.2,
  form: 0.15,
  band: 0.6,
};
const SH_FUR_LOW: Shade = {
  c0: mixRGB(FUR, FUR_SHADE, 0.5),
  c1: FUR_SHADE,
  rim: 0.3,
  cool: 0.3,
  form: 0.1,
  band: 0.6,
};
const SH_RUFF: Shade = { c0: rgb(0xb8b0bc), c1: rgb(0x7c7494), rim: 0.6, cool: 0.25, form: 0.15, band: 0.6 };
const SH_RUFF_LOW: Shade = {
  c0: rgb(0x968ea4),
  c1: rgb(0x625a7a),
  rim: 0.4,
  cool: 0.3,
  form: 0.1,
  band: 0.6,
};
const SH_FACE: Shade = {
  c0: FACE_SHADE,
  c1: FACE_LIT,
  rim: 0.45,
  cool: 0.2,
  form: 0.1,
  band: 0.4,
  ember: 0.8,
};
const SH_CROWN: Shade = { c0: CROWN_TOP, c1: CROWN_LOW, rim: 1, cool: 0.95, form: 0.3, band: 0.36 };
const SH_LOCK: Shade = { c0: CROWN_TOP, c1: CROWN_LOW, rim: 1, cool: 0.95, form: 0.3, band: 0.6 };
const SH_LOCK_SOFT: Shade = {
  c0: mixRGB(CROWN_TOP, FUR_SHADE, 0.75),
  c1: mixRGB(CROWN_LOW, FUR_SHADE, 0.4),
  rim: 0.6,
  cool: 0.4,
  form: 0.2,
  band: 0.7,
};
const SH_EYE: Shade = { c0: rgb(0x5e2c04), c1: rgb(0xb8660c), rim: 0, cool: 0, form: 0, band: 0.5, ember: 0 };
const SH_EYE_CORE: Shade = {
  c0: rgb(0xf2a622),
  c1: rgb(0xffe9a6),
  rim: 0,
  cool: 0,
  form: 0,
  band: 0.5,
  ember: 0,
};
const SH_CATCH: Shade = {
  c0: rgb(0xfffdf2),
  c1: rgb(0xfffdf2),
  rim: 0,
  cool: 0,
  form: 0,
  band: 0.5,
  ember: 0,
};
const SH_WING: Shade = { c0: WING_TOP, c1: WING_LOW, rim: 1, cool: 0.95, form: 0, band: 0.5, ember: 1.2 };
const SH_WING_FAR: Shade = {
  c0: WING_TOP,
  c1: WING_LOW,
  rim: 0.3,
  cool: 0.3,
  form: 0,
  band: 0.5,
  ember: 0.6,
};
const SH_PLUME: Shade = {
  c0: dim(CROWN_TOP, 0.9),
  c1: rgb(0x6f6480),
  rim: 0.8,
  cool: 0.4,
  form: 0.2,
  band: 0.6,
};
const SH_BARB: Shade = {
  c0: rgb(0x6f6480),
  c1: rgb(0xa094aa),
  rim: 0.4,
  cool: 0.2,
  form: 0,
  band: 0.6,
  alpha: 0.85,
};
const SH_SHEATH: Shade = { c0: rgb(0x2a2440), c1: rgb(0x0f0d1c), rim: 1, cool: 0.95, form: 0.2, band: 0.6 };
const SH_METAL: Shade = { c0: METAL, c1: dim(METAL, 0.7), rim: 0.8, cool: 0.2, form: 0.3, band: 0.5 };
const SH_SPOT: Shade = {
  c0: rgb(0xe3c68c),
  c1: rgb(0xb99f7a),
  rim: 0,
  cool: 0,
  form: 0,
  band: 0.5,
  ember: 0,
};
const SH_SPOT_DARK: Shade = { c0: SPOT_DARK, c1: SPOT_DARK, rim: 0, cool: 0, form: 0, band: 0.5, ember: 0 };
const SH_SPOT_FAR: Shade = { ...SH_SPOT, c0: dim(SH_SPOT.c0, 0.42), c1: dim(SH_SPOT.c1, 0.42) };
const SH_SPOT_HOT: Shade = { c0: GOLD_HOT, c1: GOLD, rim: 0, cool: 0, form: 0, band: 0.5, ember: 0 };

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

/** How far a limb's two segments are rounded into one curve (1 = a full bow: reads as a banana). */
const ROUND = 0.35;

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
    p.px[k] = lerp(lerp(ax, bx, t), catmull(ax, ax, bx, cx, t), ROUND);
    p.py[k] = lerp(lerp(ay, by, t), catmull(ay, ay, by, cy, t), ROUND);
    // A little muscle above the joint, slim into it.
    p.pw[k] = lerp(w0, w1, t ** 1.4) + Math.sin(Math.PI * t) * w0 * 0.08;
    k++;
  }
  for (let q = 1; q <= SUB; q++) {
    const t = q / SUB;
    p.px[k] = lerp(lerp(bx, cx, t), catmull(ax, bx, cx, cx, t), ROUND);
    p.py[k] = lerp(lerp(by, cy, t), catmull(ay, by, cy, cy, t), ROUND);
    p.pw[k] = lerp(w1, w2, t) + Math.sin(Math.PI * t) * w1 * 0.12;
    k++;
  }
  p.ribbon(k, sh, true, true);
}

/** A tapered tuft or lock: root (x0, y0) to tip (x1, y1), bowed sideways by `bow` px. */
function tuft(
  p: Painter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  bow: number,
  w: number,
  sh: Shade,
  round = 0.8,
  tip = 0,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * bow;
  const ny = (dx / l) * bow;
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const b = 4 * t * (1 - t);
    p.px[i] = x0 + dx * t + nx * b;
    p.py[i] = y0 + dy * t + ny * b;
    // `round` < 1 keeps the width further along before the tip closes: a lock, not a spike.
    // `tip` > 0 ends the lock in a soft rounded puff instead of a point.
    const taper = (1 - t ** (1 / Math.max(0.2, round))) ** round;
    const puff = 0.55 + 0.45 * Math.sin(Math.PI * (0.25 + 0.6 * t));
    p.pw[i] = w * lerp(taper, puff, tip) * (0.8 + 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.5))) + 0.06;
  }
  p.ribbon(7, sh, true, tip > 0.3);
}

function leg(p: Painter, j: Float32Array, side: number, far: boolean): void {
  limb(p, j, J_HIP_A + side, J_KNEE_A + side, J_ANK_A + side, 3.5, 2.25, 1.25, far ? SH_LEG_FAR : SH_LEG);
  const kx = j[(J_KNEE_A + side) * 2]!;
  const ky = j[(J_KNEE_A + side) * 2 + 1]!;
  const ax = j[(J_ANK_A + side) * 2]!;
  const ay = j[(J_ANK_A + side) * 2 + 1]!;
  const tx = j[(J_TOE_A + side) * 2]!;
  const ty = j[(J_TOE_A + side) * 2 + 1]!;
  const fsh = far ? SH_FOOT_FAR : SH_FOOT;
  // Foot: a small pointed slipper of pale wrap, heel through ankle to toe.
  const dx = tx - ax;
  const dy = ty - ay;
  p.px[0] = ax - dx * 0.2;
  p.py[0] = ay - dy * 0.2;
  p.pw[0] = 1.1;
  p.px[1] = ax + dx * 0.3;
  p.py[1] = ay + dy * 0.3;
  p.pw[1] = 1.5;
  p.px[2] = ax + dx * 0.7;
  p.py[2] = ay + dy * 0.7;
  p.pw[2] = 1.1;
  p.px[3] = tx;
  p.py[3] = ty;
  p.pw[3] = 0.25;
  p.ribbon(4, fsh, true, false);
  // Pale fur cuff up the shin from the ankle.
  const sx = kx - ax;
  const sy = ky - ay;
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    p.px[i] = ax + sx * (-0.03 + 0.34 * t);
    p.py[i] = ay + sy * (-0.03 + 0.34 * t);
    p.pw[i] = lerp(1.35, 1.75, Math.sin(Math.PI * Math.min(1, t * 1.3))) * (t > 0.99 ? 0.7 : 1);
  }
  p.ribbon(4, fsh, true, true);
}

function arm(p: Painter, j: Float32Array, side: number, far: boolean, wrap: boolean, grip: number): void {
  limb(p, j, J_SH_A + side, J_EL_A + side, J_HAND_A + side, 2.15, 1.6, 1.15, far ? SH_ARM_FAR : SH_ARM);
  const hx = j[(J_HAND_A + side) * 2]!;
  const hy = j[(J_HAND_A + side) * 2 + 1]!;
  const ex = j[(J_EL_A + side) * 2]!;
  const ey = j[(J_EL_A + side) * 2 + 1]!;
  if (wrap) {
    // A wrap on the forearm: three pale turns.
    for (let b = 0; b < 3; b++) {
      const t0 = 0.34 + b * 0.19;
      p.px[0] = lerp(ex, hx, t0);
      p.py[0] = lerp(ey, hy, t0);
      p.px[1] = lerp(ex, hx, t0 + 0.11);
      p.py[1] = lerp(ey, hy, t0 + 0.11);
      p.pw[0] = p.pw[1] = 1.5 - b * 0.08;
      p.ribbon(2, far ? SH_HAND_FAR : SH_WRAP, false, false);
    }
  }
  const a0 = Math.atan2(hy - ey, hx - ex);
  // An open hand: palm and a hint of fingers trailing. On a wall it turns flat against the face
  // with the fingers spread up it: a grip.
  let da = -Math.PI / 2 - a0;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  const a = a0 + da * grip;
  const sh = far ? SH_HAND_FAR : SH_HAND;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  p.ellipse(hx + ca * 1.1, hy + sa * 1.1, 1.9 + 0.4 * grip, 1.4 - 0.2 * grip, a, sh, 10);
  tuft(
    p,
    hx + ca * 1.6,
    hy + sa * 1.6,
    hx + Math.cos(a + 0.25) * 4.4,
    hy + Math.sin(a + 0.25) * 4.4,
    0.3,
    0.9,
    sh,
  );
  if (grip > 0.05) {
    const g = grip;
    tuft(
      p,
      hx + ca * 1.4,
      hy + sa * 1.4,
      hx + Math.cos(a - 0.45) * 4.2 * g,
      hy + Math.sin(a - 0.45) * 4.2 * g,
      0.3,
      0.8,
      sh,
    );
    tuft(
      p,
      hx + ca * 1.0,
      hy + sa * 1.0,
      hx + Math.cos(a + 0.95) * 3.4 * g,
      hy + Math.sin(a + 0.95) * 3.4 * g,
      0.3,
      0.8,
      sh,
    );
  }
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
      p.px[i] = catmull(hx, hx, cx, nx, u) + (hx - cx) * 0.2 * (1 - u);
      p.py[i] = catmull(hy, hy, cy, ny, u) + (hy - cy) * 0.2 * (1 - u);
    } else {
      p.px[i] = catmull(hx, cx, nx, nx, u - 1);
      p.py[i] = catmull(hy, cy, ny, ny, u - 1);
    }
    // A short flared tunic skirt, a slim waist, a soft chest, a narrow neck.
    const skirt = 4.6 - 1.1 * sat(t * 4);
    const chest = 3.5 + 1.1 * Math.sin(Math.PI * sat((t - 0.15) / 0.75));
    p.pw[i] = (t < 0.22 ? skirt : chest) * (1 - 0.5 * sat((t - 0.55) / 0.45) ** 1.4);
  }
  p.ribbon(N, SH_TORSO, true, true);
  // Belt: a thin pale-gold line across the waist.
  const bx = lerp(hx, cx, 0.2);
  const by = lerp(hy, cy, 0.2);
  let ux = cx - hx;
  let uy = cy - hy;
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  p.px[0] = bx + uy * 3.5;
  p.py[0] = by - ux * 3.5;
  p.px[1] = bx - uy * 3.5;
  p.py[1] = by + ux * 3.5;
  p.pw[0] = p.pw[1] = 0.65;
  p.ribbon(2, SH_METAL, false, false);
}

/** The thorn: a slender blade sheathed at the hip, pointing back and down. */
function thorn(p: Painter, f: Frame, len: number): void {
  const { j, s } = f;
  const d = s[S_D]!;
  const hx = j[J_HIP * 2]!;
  const hy = j[J_HIP * 2 + 1]!;
  const cx = j[J_CHEST * 2]!;
  const cy = j[J_CHEST * 2 + 1]!;
  let ux = cx - hx;
  let uy = cy - hy;
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul;
  uy /= ul;
  const fx = -uy * d;
  const fy = ux * d;
  // Along the blade: mostly back, a little down, following the hips.
  const ax = -fx * 0.9 - ux * 0.44;
  const ay = -fy * 0.9 - uy * 0.44;
  const ox = hx + ux * 2.2 + fx * 2.5;
  const oy = hy + uy * 2.2 + fy * 2.5;
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    p.px[i] = ox + ax * t * len;
    p.py[i] = oy + ay * t * len;
    p.pw[i] = lerp(1.05, 0.12, t ** 0.8);
  }
  p.ribbon(4, SH_SHEATH, true, false);
  // Hilt and guard.
  p.px[0] = ox - ax * 5.5;
  p.py[0] = oy - ay * 5.5;
  p.px[1] = ox;
  p.py[1] = oy;
  p.pw[0] = 0.55;
  p.pw[1] = 0.7;
  p.ribbon(2, SH_METAL, true, false);
  p.ellipse(ox, oy, 0.75, 1.9, Math.atan2(ay, ax), SH_METAL, 8);
}

const COLS = 13;
const ROWS = 13;
/** Scalloped, slightly tattered hem: how far each column reaches (1 = the strand's end). */
const HEM = [1, 0.965, 1.0, 0.96, 0.92, 0.965, 1.0, 0.96, 0.995, 0.965, 1.0, 0.96, 0.985];
/** Vein / fold pattern across the membrane, -1..1 per column. */
const FOLD = [0.3, -0.35, 0.2, 0.55, -0.6, 0.15, 0.5, -0.45, -0.1, 0.45, -0.5, 0.2, -0.2];

const sx = new Float32Array(5 * ROWS);
const sy = new Float32Array(5 * ROWS);
const colX = new Float32Array(ROWS);
const colY = new Float32Array(ROWS);

function bump(u: number, c: number, w: number): number {
  const x = (u - c) / w;
  return Math.exp(-x * x);
}

/** One wing: a sheet through its five strands. `k` 1 = the near wing, lower = dimmer (far). */
function wing(
  p: Painter,
  strands: readonly ChainPts[],
  open: number,
  k: number,
  glow: number,
  clock: number,
): void {
  const ns = strands.length;
  for (let q = 0; q < ns; q++) {
    const n = curve(p, strands[q]!, 3);
    for (let r = 0; r < ROWS; r++) {
      const i = Math.min(n - 1, r);
      sx[q * ROWS + r] = p.px[i]!;
      sy[q * ROWS + r] = p.py[i]!;
    }
  }
  const { gx, gy, gc } = p;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = (c / (COLS - 1)) * (ns - 1);
      const q = Math.min(ns - 2, Math.floor(u));
      const t = u - q;
      const q0 = Math.max(0, q - 1);
      const q3 = Math.min(ns - 1, q + 2);
      const i = r * COLS + c;
      gx[i] = catmull(sx[q0 * ROWS + r]!, sx[q * ROWS + r]!, sx[(q + 1) * ROWS + r]!, sx[q3 * ROWS + r]!, t);
      gy[i] = catmull(sy[q0 * ROWS + r]!, sy[q * ROWS + r]!, sy[(q + 1) * ROWS + r]!, sy[q3 * ROWS + r]!, t);
    }
  }
  // Each column is re-sampled along its length: scallops always, fore/hind lobes as it opens.
  for (let c = 0; c < COLS; c++) {
    const u = c / (COLS - 1);
    const scale =
      HEM[c]! *
      (1 + open * (0.1 * bump(u, 0.2, 0.2) + 0.07 * bump(u, 0.84, 0.13) - 0.3 * bump(u, 0.57, 0.1)));
    for (let r = 0; r < ROWS; r++) {
      colX[r] = gx[r * COLS + c]!;
      colY[r] = gy[r * COLS + c]!;
    }
    for (let r = 1; r < ROWS; r++) {
      const v = r * scale;
      const r0 = Math.min(ROWS - 2, Math.floor(v));
      const t = v - r0;
      gx[r * COLS + c] = colX[r0]! + (colX[r0 + 1]! - colX[r0]!) * t;
      gy[r * COLS + c] = colY[r0]! + (colY[r0 + 1]! - colY[r0]!) * t;
    }
  }
  // Colour: plum to charcoal down the wing, veins, then the pale band just inside a dark margin.
  for (let r = 0; r < ROWS; r++) {
    const t = r / (ROWS - 1);
    const band = r === ROWS - 2 ? 1 : r === ROWS - 3 ? 0.3 : r === ROWS - 5 ? 0.14 : 0;
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const u = c / (COLS - 1);
      const fold = FOLD[c]! * (0.2 + 0.8 * t) * 0.3;
      // The leading edge catches the light; the inner (trailing) part sits in the body's shadow.
      const lit = (1 - u) * 0.22 * (1 - 0.5 * t) - u * 0.12;
      const sh = (1 + fold + lit) * k;
      let cr: number;
      let cg: number;
      let cb: number;
      if (t < 0.5) {
        const q = t / 0.5;
        cr = lerp(WING_TOP[0], WING_MID[0], q);
        cg = lerp(WING_TOP[1], WING_MID[1], q);
        cb = lerp(WING_TOP[2], WING_MID[2], q);
      } else {
        const q = (t - 0.5) / 0.5;
        cr = lerp(WING_MID[0], WING_LOW[0], q);
        cg = lerp(WING_MID[1], WING_LOW[1], q);
        cb = lerp(WING_MID[2], WING_LOW[2], q);
      }
      cr *= sh;
      cg *= sh;
      cb *= sh;
      if (band > 0) {
        const b = band * (0.82 + 0.18 * glow) * (0.55 + 0.45 * k);
        cr = lerp(cr, BAND[0] * (0.6 + 0.4 * k), b);
        cg = lerp(cg, BAND[1] * (0.6 + 0.4 * k), b);
        cb = lerp(cb, BAND[2] * (0.6 + 0.4 * k), b);
      }
      gc[i * 3] = cr;
      gc[i * 3 + 1] = cg;
      gc[i * 3 + 2] = cb;
    }
  }
  p.grid(COLS, ROWS, k > 0.9 ? SH_WING : SH_WING_FAR, 2.4);

  // --- The eye-spot, painted on the membrane: it foreshortens and travels with the cloth.
  const R = 7;
  const C = 5;
  const i = R * COLS + C;
  const ex = gx[i]!;
  const ey = gy[i]!;
  const acx = gx[i + 1]! - gx[i - 1]!;
  const acy = gy[i + 1]! - gy[i - 1]!;
  const alx = gx[i + COLS]! - gx[i - COLS]!;
  const aly = gy[i + COLS]! - gy[i - COLS]!;
  const across = Math.hypot(acx, acy);
  const along = Math.hypot(alx, aly);
  const ry = clamp(along * 0.62, 1.5, 3.9);
  const rx = clamp(across * 0.6, 0.5, ry);
  const rot = Math.atan2(aly, alx) - Math.PI / 2;
  if (k > 0.9) {
    const pulse = 0.85 + 0.15 * Math.sin(clock * 1.9);
    p.glow(ex, ey, 11, GOLD_DEEP, 0.16 * glow * pulse);
    p.ellipse(ex, ey, rx, ry, rot, SH_SPOT, 14);
    p.ellipse(ex, ey, rx * 0.66, ry * 0.66, rot, SH_SPOT_DARK, 12);
    p.ellipse(ex, ey, rx * 0.3, ry * 0.3, rot, SH_SPOT_HOT, 8);
    p.glow(ex, ey, 4.2, GOLD, 0.5 * glow * pulse);
    // Gold dust caught in the scales: a few fixed points that twinkle on their own time.
    for (let q = 0; q < DUST.length; q += 2) {
      const di = DUST[q]! * COLS + DUST[q + 1]!;
      const tw = Math.sin(clock * (2.1 + q * 0.37) + q * 1.9);
      if (tw > 0.2) p.glow(gx[di]!, gy[di]!, 1.9, GOLD_HOT, (tw - 0.2) * 0.75 * glow);
    }
    // The band is faintly luminous.
    const br = (ROWS - 2) * COLS;
    for (let c = 1; c < COLS; c += 3) p.glow(gx[br + c]!, gy[br + c]!, 6, GOLD_DEEP, 0.1 * glow);
  } else {
    p.ellipse(ex, ey, rx * 0.9, ry * 0.9, rot, SH_SPOT_FAR, 12);
    p.ellipse(ex, ey, rx * 0.58, ry * 0.58, rot, SH_SPOT_DARK, 10);
  }
}
/** (row, column) pairs of the twinkles. */
const DUST = [3, 3, 5, 9, 9, 3, 8, 10, 4, 7, 10, 7];

/** A feathered antenna with its lantern tip. */
function antenna(p: Painter, c: ChainPts, far: boolean, glow: number): void {
  const n = curve(p, c, 3);
  // Keep the centre line: the barbs need it after the shaft is drawn.
  for (let i = 0; i < n; i++) {
    ax_[i] = p.px[i]!;
    ay_[i] = p.py[i]!;
  }
  // The vane first (behind the shaft): a soft feather on the outer side, widest past the middle,
  // with a few nicks so it reads as barbs, not a blade.
  const sh = far ? SH_BARB_FAR : SH_BARB;
  // Outer side of the sweep: from the chord's middle toward the curve's middle.
  const m = n >> 1;
  const outX = ax_[m]! - (ax_[0]! + ax_[n - 1]!) * 0.5;
  const outY = ay_[m]! - (ay_[0]! + ay_[n - 1]!) * 0.5 - 0.01;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const i0 = i > 0 ? i - 1 : 0;
    const i1 = i < n - 1 ? i + 1 : n - 1;
    let tx = ax_[i1]! - ax_[i0]!;
    let ty = ay_[i1]! - ay_[i0]!;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nick = 1 - 0.3 * Math.max(0, Math.sin(i * 2.4 + 0.5)) ** 3;
    const w = (1.15 * Math.sin(Math.PI * sat((t - 0.12) / 0.88) ** 0.75) ** 0.8 + 0.1) * nick;
    const side = -ty * outX + tx * outY >= 0 ? 1 : -1;
    p.px[i] = ax_[i]! + -ty * side * w * 0.75;
    p.py[i] = ay_[i]! + tx * side * w * 0.75;
    p.pw[i] = w;
  }
  p.ribbon(n, sh, false, false);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    p.px[i] = ax_[i]!;
    p.py[i] = ay_[i]!;
    p.pw[i] = lerp(1.05, 0.4, t ** 0.7);
  }
  p.ribbon(n, far ? SH_PLUME_FAR : SH_PLUME, true, true);
  const tx = ax_[n - 1]!;
  const ty = ay_[n - 1]!;
  const k = far ? 0.7 : 1;
  p.glow(tx, ty, 20, GOLD_DEEP, 0.26 * glow * k);
  p.glow(tx, ty, 6, GOLD, 0.6 * glow * k);
  p.ellipse(tx, ty, 1.35, 1.35, 0, SH_SPOT_HOT, 10);
  p.glow(tx, ty, 2.6, GOLD_HOT, 0.9 * glow);
}
const ax_ = new Float32Array(64);
const ay_ = new Float32Array(64);
const SH_BARB_FAR: Shade = { ...SH_BARB, c0: dim(SH_BARB.c0, 0.7), c1: dim(SH_BARB.c1, 0.7) };
const SH_PLUME_FAR: Shade = { ...SH_PLUME, c0: dim(SH_PLUME.c0, 0.7), c1: dim(SH_PLUME.c1, 0.7), rim: 0.4 };

/** The ruff: pale fluff close round the neck. Never long enough to hang. */
const RUFF = [
  // angle from straight down (rad, + = forward), length, width
  -1.9, 5.6, 2.0, -1.3, 6.6, 2.3, -0.7, 7.0, 2.5, -0.1, 6.6, 2.5, 0.5, 6.2, 2.4, 1.1, 5.4, 2.1, 1.7, 4.4, 1.8,
];
function ruff(p: Painter, f: Frame, v: View): void {
  const { j, s } = f;
  const d = s[S_D]!;
  const cx = j[J_COLLAR * 2]!;
  const cy = j[J_COLLAR * 2 + 1]! - 0.6;
  const up = s[S_UPPER]!;
  for (let i = 0; i < RUFF.length; i += 3) {
    const a = RUFF[i]! * d + up;
    const l = RUFF[i + 1]!;
    const w = RUFF[i + 2]!;
    const rx = cx + Math.sin(a) * 1.6;
    const ry = cy + Math.cos(a) * 0.8;
    tuft(
      p,
      rx,
      ry,
      rx + Math.sin(a) * l * 0.8 + v.hairX * 0.25,
      ry + Math.cos(a) * l * 0.66 + v.hairY * 0.25,
      (i % 2 ? 0.6 : -0.6) * d,
      w,
      i % 6 === 0 ? SH_RUFF_LOW : SH_RUFF,
      0.55,
      0.45,
    );
  }
}

/** Mane locks off the back of the head: root (f, u), tip (f, u), bow, width. Forward-frame px. */
const LOCKS = [
  // outer row: dark, long, slow
  -3.5, 8.6, -9.5, 11.0, -1.6, 3.6, 0, -6.2, 5.8, -13.5, 6.4, -2.0, 4.2, 0, -7.6, 2.2, -15.5, 0.6, -2.2, 4.6,
  0, -7.2, -1.8, -14.0, -5.0, -1.8, 4.2, 0, -5.8, -5.2, -10.5, -9.0, -1.2, 3.4, 0,
  // inner row: lighter, shorter, quicker, overlapping the gaps
  -4.8, 7.2, -9.5, 8.6, -1.0, 3.0, 1, -6.8, 4.0, -11.5, 3.6, -1.2, 3.3, 1, -7.2, 0.2, -11.5, -2.2, -1.0, 3.2,
  1, -6.4, -3.6, -9.5, -6.8, -0.8, 2.8, 1,
];

function head(p: Painter, f: Frame, v: View, far: number): void {
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
  const X = (lx: number, ly: number): number => hx + lx * cr - ly * sr;
  const Y = (lx: number, ly: number): number => hy + lx * sr + ly * cr;

  // --- Mane: soft dark locks streaming off the back of the head; tips lag the head.
  for (let i = 0; i < LOCKS.length; i += 7) {
    const inner = LOCKS[i + 6]! > 0.5;
    const k = inner ? 0.7 : 1.1 + 0.15 * ((i / 7) % 2);
    const lx = inner ? v.hairX : v.hair2X;
    const ly = inner ? v.hairY : v.hair2Y;
    tuft(
      p,
      X(LOCKS[i]! * dh, -LOCKS[i + 1]!),
      Y(LOCKS[i]! * dh, -LOCKS[i + 1]!),
      X(LOCKS[i + 2]! * dh, -LOCKS[i + 3]!) + lx * k,
      Y(LOCKS[i + 2]! * dh, -LOCKS[i + 3]!) + ly * k,
      LOCKS[i + 4]! * dh,
      LOCKS[i + 5]!,
      inner ? SH_LOCK_SOFT : SH_LOCK,
      0.5,
      1,
    );
  }

  // --- Crown: the dark fur of the skull, a soft dome.
  const SEG = 30;
  const ccx = -1.1 * dh;
  const ccy = -0.7;
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const lx = ccx + ca * W * (1 - 0.1 * Math.max(0, sa));
    const ly = ccy + sa * Hh * (sa < 0 ? 1.03 : 0.95);
    p.px[i] = X(lx, ly);
    p.py[i] = Y(lx, ly);
  }
  p.shape(SEG, X(ccx, ccy), Y(ccx, ccy), SH_CROWN, hx + sr * Hh, hy - cr * Hh, hx - sr * Hh, hy + cr * Hh);

  // --- A little tuft on top, between the antennae.
  tuft(
    p,
    X(1.4 * dh, -Hh * 0.9),
    Y(1.4 * dh, -Hh * 0.9),
    X(4.2 * dh, -Hh - 5.2) + v.hairX * 0.6,
    Y(4.2 * dh, -Hh - 5.2) + v.hairY * 0.6,
    -1.2 * dh,
    2.2,
    SH_LOCK,
    0.5,
    0.8,
  );
  tuft(
    p,
    X(-0.6 * dh, -Hh * 0.92),
    Y(-0.6 * dh, -Hh * 0.92),
    X(-3.4 * dh, -Hh - 3.8) + v.hairX * 0.6,
    Y(-3.4 * dh, -Hh - 3.8) + v.hairY * 0.6,
    -1.0 * dh,
    2.0,
    SH_LOCK,
    0.5,
    0.8,
  );

  // --- The far antenna leaves the brow behind the face fur.
  antenna(p, v.antennae[far]!, true, v.glow);

  // --- The face: a round, soft heart of pale fur. Full cheeks, barely a chin.
  const yaw = dh * BODY.sinHeadYaw;
  const back = dh >= 0 ? -1 : 1;
  const fcx = yaw * 2.5;
  const fcy = 2.0;
  const fw = 7.9 + 3.1 * czh;
  const fhU = 7.7;
  const fhD = 8.7;
  /** Midpoint between the eyes. */
  const emx = yaw * 5.4;
  // Cheek fluff first, so it pokes out from behind the disc's edge and breaks the outline.
  for (let i = 0; i < CHEEK.length; i += 5) {
    const sd = CHEEK[i]!;
    const rx = fcx + back * sd * CHEEK[i + 1]! * fw;
    const ry = fcy + CHEEK[i + 2]!;
    const a = CHEEK[i + 4]!;
    const l = CHEEK[i + 3]! * (sd > 0 ? 1 : 0.7);
    const tx = rx + back * sd * Math.cos(a) * l;
    const ty = ry + Math.sin(a) * l;
    tuft(
      p,
      X(rx, ry),
      Y(rx, ry),
      X(tx, ty) + v.hairX * 0.35,
      Y(tx, ty) + v.hairY * 0.35,
      0.5 * dh * sd,
      3.0,
      sd > 0 ? SH_FUR_LOW : SH_FUR,
      0.5,
      0.9,
    );
  }
  const FSEG = 36;
  for (let i = 0; i < FSEG; i++) {
    const a = (i / FSEG) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    let lx: number;
    let ly: number;
    if (sa >= 0) {
      lx = ca * fw * (1 - 0.17 * sa ** 2.2);
      ly = sa * fhD;
    } else {
      // The top dips between the eyes (the crown's fur comes down in a soft peak): a heart.
      const cc = (ca * fw - (emx - fcx)) / (fw * 0.34);
      lx = ca * fw * (1 + 0.04 * -sa);
      ly = sa * fhU * (1 - 0.24 * Math.exp(-cc * cc));
    }
    p.px[i] = X(fcx + lx, fcy + ly);
    p.py[i] = Y(fcx + lx, fcy + ly);
  }
  // Shade from the back/low side up to the lit front/top.
  p.shape(
    FSEG,
    X(fcx, fcy),
    Y(fcx, fcy),
    SH_FACE,
    X(fcx + back * fw * 1.2, fcy + fhD * 0.9),
    Y(fcx + back * fw * 1.2, fcy + fhD * 0.9),
    X(fcx - back * fw * 0.4, fcy - fhU * 0.4),
    Y(fcx - back * fw * 0.4, fcy - fhU * 0.4),
  );

  // --- Eyes: big, round, wide-set and low. A dark amber rim, a warm bright core that drifts with
  // the gaze, two catchlights, and a soft lid. Nothing else on the face.
  const open = clamp(s[S_EYE]!, 0, 1);
  const lid = 1 - open;
  const lookY = clamp(s[S_LOOKY]!, -1, 1);
  const lookX = clamp(s[S_LOOKX]!, -1, 1) * (dh >= 0 ? 1 : -1);
  const wide = s[S_WIDE]!;
  const ESEG = 20;
  for (let side = 0; side < 2; side++) {
    const sd = side === 0 ? 1 : -1;
    const near = sd * dh >= 0;
    const lx = emx - sd * czh * 5.0;
    const ly = 3.5;
    const w = (near ? 3.2 * (0.5 + 0.5 * czh) : 3.0 * (0.3 + 0.7 * czh) * 0.88) * (0.6 + 0.4 * wide);
    const R = 3.55 * wide;
    const ex = X(lx, ly);
    const ey = Y(lx, ly);
    const tilt = rot + sd * 0.1 * czh;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    // The lid comes down from the top; the eye never quite shuts to nothing.
    const yTop = -R + lid * 2 * R * 0.93;
    for (let i = 0; i < ESEG; i++) {
      const a = (i / ESEG) * Math.PI * 2;
      const qx = Math.cos(a) * w;
      let qy = Math.sin(a) * R;
      if (qy < yTop) qy = yTop + (qy - yTop) * 0.1;
      p.px[i] = ex + qx * ct - qy * st;
      p.py[i] = ey + qx * st + qy * ct;
    }
    const vis = R - yTop;
    const mcy = (yTop + R) * 0.5;
    const mx = ex - mcy * st;
    const my = ey + mcy * ct;
    p.soft(ex, ey, w * 1.7, R * 1.5, EYE_PATCH, 0.2);
    p.shape(ESEG, mx, my, SH_EYE, ex + st * R, ey - ct * R, ex - st * R, ey + ct * R);
    // Core: the light inside, lower in the eye, following the gaze.
    const cry = Math.min(R * 0.58, vis * 0.4);
    const crx = w * 0.6;
    const cqx = lookX * w * 0.26;
    const cqy = Math.max(R * 0.16 + lookY * R * 0.24, yTop + cry + 0.15);
    const cx = ex + cqx * ct - cqy * st;
    const cy = ey + cqx * st + cqy * ct;
    if (vis > 0.9) {
      p.ellipse(cx, cy, crx, cry, tilt, SH_EYE_CORE, 14);
      p.glow(cx, cy + cry * 0.3, 1.8, GOLD_HOT, 0.12 * v.glow);
      // Catchlights: one large, upper, toward the light; one tiny, lower, opposite. Wet and alive.
      const hqx = cqx * 0.5 + w * 0.3;
      const hqy = cqy - R * 0.5;
      const hr = R * 0.3;
      if (hqy - hr > yTop + 0.1) p.ellipse(ex + hqx, ey + hqy, hr * 0.9, hr, 0, SH_CATCH, 8);
      if (vis > R * 1.1)
        p.ellipse(ex + cqx * 0.5 - w * 0.34, ey + cqy + R * 0.36, R * 0.14, R * 0.14, 0, SH_CATCH, 6);
    }
    p.glow(mx, my, 7.5, EYE_RIM, 0.05 * open * v.glow);
    // A soft warm blush on the cheek below.
    const bx = lx - sd * czh * 1.3;
    p.soft(X(bx, ly + R + 1.5), Y(bx, ly + R + 1.5), 3.1 * (near ? 1 : 0.75), 1.9, BLUSH, 0.34);
  }
}
/** Cheek fluff: side (+1 = back of the head, -1 = front), root x (fraction of the half width), root y, length, angle below the outward axis. */
const CHEEK = [
  1, 0.82, 0.6, 5.0, 0.2, 1, 0.74, 3.8, 5.2, 0.7, 1, 0.5, 6.4, 4.2, 1.1, 1, 0.84, -2.2, 3.8, -0.2, -1, 0.8,
  3.0, 3.6, 0.6, -1, 0.56, 6.2, 3.2, 1.1,
];

/** The whole character, back to front. */
export function drawVesper(p: Painter, f: Frame, v: View, clock: number): void {
  const { j, s } = f;
  const d = s[S_D]!;
  // Side A is toward the camera while facing right.
  const near = d >= 0 ? 0 : 1;
  const far = 1 - near;

  const ox = j[J_ORIGIN * 2]!;
  const oy = j[J_ORIGIN * 2 + 1]!;
  p.soft(ox, oy + 1, 24, 4.5, SHADOW, 0.5 * s[S_GROUND]!);
  // A faint moonlit halo so the dark figure never sinks into a dark background.
  p.glow(j[J_CENTRE * 2]!, j[J_CENTRE * 2 + 1]! - 6, 84, HALO, 0.075 * v.glow);
  // The halo: tight and soft round the head and lantern tips, ~1.7x her height across.
  p.glow(j[J_HEAD * 2]!, j[J_HEAD * 2 + 1]! - 10, 72, HALO_WARM, 0.1 * v.glow);

  wing(p, v.wings[far]!.strands, v.open, 0.52, v.glow, clock);
  arm(p, j, far, true, false, v.wall);
  leg(p, j, far, true);
  thorn(p, f, 21 * (1 - 0.65 * v.tuck));
  torso(p, j);
  leg(p, j, near, false);
  wing(p, v.wings[near]!.strands, v.open, 1, v.glow, clock);
  ruff(p, f, v);
  arm(p, j, near, false, true, v.wall);
  head(p, f, v, far);
  antenna(p, v.antennae[near]!, false, v.glow);
}
