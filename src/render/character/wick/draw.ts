// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Draws Wick from a solved skeleton frame and the simulated chains, back to front, into the
 * painter (../hooded/paint.ts: one mesh, rim light, feathered edges, additive glows).
 *
 * The look: a dark, graphic figure half made of light. Low sharp kasa hat tipped over a hooded
 * face in shadow with two gold eyes; plum scarf; short indigo coat with split tails; pale wrapped
 * shins, forearms and mitten hands; a slender lantern-glaive whose flame is the one warm light.
 */
import { catmull, clamp, lerp } from '../hooded/math';
import { type Painter, type RGB, rgb, type Shade } from '../hooded/paint';
import {
  BODY,
  type Frame,
  J_ANK,
  J_BUTT,
  J_CENTRE,
  J_EL,
  J_HAND,
  J_HEAD,
  J_HEEL,
  J_HIP,
  J_KNEE,
  J_NECK,
  J_ORIGIN,
  J_PELVIS,
  J_SH,
  J_TIP,
  J_TOE,
  S_BALL,
  S_CZH,
  S_D,
  S_DH,
  S_EYE,
  S_GRIP,
  S_GROUND,
  S_HATROT,
  S_HEADROT,
  S_HS,
  S_LEAN,
  S_LOOKY,
} from './rig';

export interface ChainPts {
  readonly n: number;
  readonly rx: Float32Array;
  readonly ry: Float32Array;
}

export interface SecView {
  scarf: ChainPts;
  tailFar: ChainPts;
  tailNear: ChainPts;
  ribA: ChainPts;
  ribB: ChainPts;
  skirt: ChainPts;
  lantern: ChainPts;
}

/** The flame this frame, for the lantern, the glows and the light. */
export interface Lamp {
  /** Flame base (world px). */
  x: number;
  y: number;
  /** Flame tip relative to the base. */
  tx: number;
  ty: number;
  /** Brightness multiplier (flicker x pulse). */
  k: number;
  /** Slow glow pulse around 1 for the gold threads. */
  pulse: number;
}

function sh(
  c0: number,
  c1: number,
  rim: number,
  cool: number,
  band: number,
  more: Partial<Shade> = {},
): Shade {
  return { c0: rgb(c0), c1: rgb(c1), rim, cool, form: 0.22, band, ...more };
}

// --- Colours. One indigo family, one plum, one pale wrap, one warm light.
const SH_COAT = sh(0x282a62, 0x10173a, 0.85, 0.5, 0.42, { ember: 1.5 });
const SH_SKIRT = sh(0x1a1c48, 0x0b1430, 0.8, 0.5, 0.4, { ember: 1.4 });
const SH_SLEEVE = sh(0x2e2c68, 0x181a48, 0.9, 0.5, 0.5, { ember: 1.5 });
const SH_SLEEVE_FAR = sh(0x15173e, 0x0d1230, 0.4, 0.35, 0.5, { ember: 1.2 });
const SH_LEG = sh(0x1c1e46, 0x0b1228, 0.75, 0.45, 0.5);
const SH_LEG_FAR = sh(0x0e142c, 0x080e1e, 0.3, 0.3, 0.5);
const SH_WRAP = sh(0x5c6076, 0xa39c90, 0.9, 0.4, 0.5, { ember: 1.4, form: 0.3 });
const SH_WRAP_FAR = sh(0x2c3850, 0x505a6c, 0.45, 0.3, 0.5, { ember: 1.2 });
const SH_SKIN = sh(0x8f8e92, 0xb5ab9c, 0.8, 0.3, 0.55, { ember: 1.4 });
const SH_SKIN_FAR = sh(0x48546a, 0x6e7480, 0.5, 0.3, 0.55, { ember: 1.5 });
const SH_TAIL = sh(0x161a44, 0x0a1a2c, 0.75, 0.5, 0.45, { ember: 1.2 });
const SH_TAIL_FAR = sh(0x0c1430, 0x081222, 0.3, 0.3, 0.45);
const SH_SCARF = sh(0x5c304e, 0x2c1d3e, 0.9, 0.45, 0.45, { ember: 1.4 });
const SH_COLLAR = sh(0x6a3a54, 0x2e1e40, 0.9, 0.45, 0.4, { ember: 1.6 });
const SH_SASH = sh(0x5e3450, 0x3a2446, 0.6, 0.3, 0.4);
const SH_RIB_A = sh(0x4a2a50, 0x3a2040, 0.6, 0.4, 0.5);
const SH_RIB_B = sh(0x34203f, 0x2a1a36, 0.4, 0.3, 0.5);
const SH_HOOD = sh(0x12152e, 0x0b0e22, 0.5, 0.45, 0.3);
const SH_FACE = sh(0x202548, 0x191d3c, 0, 0, 0.5, { ember: 0, form: 0 });
const SH_EYE = sh(0xfff0c0, 0xffc860, 0, 0, 0.5, { ember: 0, form: 0 });
const SH_HAT = sh(0x221a22, 0x120f18, 1, 0.55, 0.16, { ember: 1.6, form: 0.3 });
const SH_HAT_LIT = sh(0x7a5236, 0x5a3c2c, 0.9, 0, 0.3, { ember: 1.5, form: 0 });
const SH_HAT_UNDER = sh(0x04060c, 0x04060c, 0, 0, 0.5, { ember: 0, form: 0, alpha: 0.6 });
const SH_WOOD = sh(0x1a1520, 0x40302e, 0.7, 0.4, 0.6, { ember: 1.6 });
const SH_IRON = sh(0x241c26, 0x1c1620, 0.5, 0.4, 0.5, { ember: 1.5 });
const SH_GRIP = sh(0x3a2446, 0x3a2446, 0.4, 0.3, 0.5);
const SH_BLADE = sh(0x4c6a74, 0xe8dcc0, 1, 0.6, 0.45, { ember: 1.6, form: 0.3 });
const SH_GLASS = sh(0xffb060, 0xffa050, 0, 0, 0.5, { ember: 0, form: 0, alpha: 0.3 });
const SH_FLAME = sh(0xffa648, 0xffb85c, 0, 0, 0.5, { ember: 0, form: 0 });
const SH_FLAME_IN = sh(0xfff2cc, 0xfff6dc, 0, 0, 0.5, { ember: 0, form: 0 });
const SH_INK = sh(0x070a1a, 0x070a1a, 0, 0, 0.5, { ember: 0, form: 0, alpha: 0.4 });

const GOLD = rgb(0xffd98a);
const WARM = rgb(0xffb86b);
const WARM_DEEP = rgb(0xff8a3a);
const HOT = rgb(0xfff2d0);
const EYE_GLOW = rgb(0xffb050);
const AURA = rgb(0x6f8cff);
const SHADOW: RGB = [0.01, 0.03, 0.06];

// --- Local frames: (x forward, y down) rotated by a forward-frame angle, mirrored through `d`.
let FX = 0;
let FY = 0;
function loc(ox: number, oy: number, ca: number, sa: number, d: number, x: number, y: number): void {
  FX = ox + (x * ca - y * sa) * d;
  FY = oy + x * sa + y * ca;
}

/** Smooths a chain into px/py with `sub` samples per segment; returns the sample count. */
function chainCurve(p: Painter, c: ChainPts, sub: number): number {
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

/** A pointed streamer of cloth along a chain; `half` are half-widths spread evenly along it. */
function streamer(p: Painter, c: ChainPts, half: readonly number[], shade: Shade, scale = 1): void {
  const n = chainCurve(p, c, 3);
  const m = half.length - 1;
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * m;
    const k = Math.min(m - 1, Math.floor(u));
    p.pw[i] = lerp(half[k]!, half[k + 1]!, u - k) * scale;
  }
  p.ribbon(n, shade, false, false);
}

/** A straight tapered stroke. */
function seg(
  p: Painter,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w0: number,
  w1: number,
  shade: Shade,
  cap0 = false,
  cap1 = false,
): void {
  p.px[0] = x0;
  p.py[0] = y0;
  p.pw[0] = w0;
  p.px[1] = x1;
  p.py[1] = y1;
  p.pw[1] = w1;
  p.ribbon(2, shade, cap0, cap1);
}

/** A limb through three points, rounded at the middle one. `t0..t1` trims it (0 = a, 1 = b, 2 = c). */
function limb(
  p: Painter,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  t0: number,
  t1: number,
  w0: number,
  w1: number,
  w2: number,
  shade: Shade,
  cap0: boolean,
  cap1: boolean,
): void {
  const N = 11;
  for (let i = 0; i < N; i++) {
    const t = lerp(t0, t1, i / (N - 1));
    if (t <= 1) {
      p.px[i] = catmull(ax, ax, bx, cx, t);
      p.py[i] = catmull(ay, ay, by, cy, t);
      p.pw[i] = lerp(w0, w1, t);
    } else {
      p.px[i] = catmull(ax, bx, cx, cx, t - 1);
      p.py[i] = catmull(ay, by, cy, cy, t - 1);
      p.pw[i] = lerp(w1, w2, t - 1);
    }
  }
  p.ribbon(N, shade, cap0, cap1);
}

// --- A small path builder: anchors with optional sharp corners, smoothed like the concept art.
const ax_ = new Float32Array(32);
const ay_ = new Float32Array(32);
const ac_ = new Uint8Array(32);
let an = 0;
function pathStart(): void {
  an = 0;
}
function pt(x: number, y: number, corner = false): void {
  ax_[an] = x;
  ay_[an] = y;
  ac_[an] = corner ? 1 : 0;
  an++;
}
/** Samples the closed outline into px/py and returns the count. */
function pathClosed(p: Painter, sub: number): number {
  let k = 0;
  const n = an;
  for (let i = 0; i < n; i++) {
    const i0 = (i + n - 1) % n;
    const i2 = (i + 1) % n;
    const i3 = (i + 2) % n;
    const x1 = ax_[i]!;
    const y1 = ay_[i]!;
    const x2 = ax_[i2]!;
    const y2 = ay_[i2]!;
    const c1x = ac_[i] ? x1 : x1 + (x2 - ax_[i0]!) / 6;
    const c1y = ac_[i] ? y1 : y1 + (y2 - ay_[i0]!) / 6;
    const c2x = ac_[i2] ? x2 : x2 - (ax_[i3]! - x1) / 6;
    const c2y = ac_[i2] ? y2 : y2 - (ay_[i3]! - y1) / 6;
    const straight = ac_[i] && ac_[i2];
    const m = straight ? 1 : sub;
    for (let q = 0; q < m; q++) {
      const t = q / m;
      const u = 1 - t;
      const b0 = u * u * u;
      const b1 = 3 * u * u * t;
      const b2 = 3 * u * t * t;
      const b3 = t * t * t;
      p.px[k] = b0 * x1 + b1 * c1x + b2 * c2x + b3 * x2;
      p.py[k] = b0 * y1 + b1 * c1y + b2 * c2y + b3 * y2;
      k++;
    }
  }
  return k;
}
function fillPath(p: Painter, shade: Shade, sub = 4): void {
  const n = pathClosed(p, sub);
  let cx = 0;
  let cy = 0;
  let y0 = Number.POSITIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    cx += p.px[i]!;
    cy += p.py[i]!;
    y0 = Math.min(y0, p.py[i]!);
    y1 = Math.max(y1, p.py[i]!);
  }
  cx /= n;
  cy /= n;
  p.shape(n, cx, cy, shade, cx, y0, cx, y1);
}

function leg(p: Painter, j: Float32Array, side: number): void {
  const far = side === 1;
  const hx = j[(J_HIP + side) * 2]!;
  const hy = j[(J_HIP + side) * 2 + 1]!;
  const kx = j[(J_KNEE + side) * 2]!;
  const ky = j[(J_KNEE + side) * 2 + 1]!;
  const ax = j[(J_ANK + side) * 2]!;
  const ay = j[(J_ANK + side) * 2 + 1]!;
  limb(p, hx, hy, kx, ky, ax, ay, 0, 2, 3.5, 2.5, 1.3, far ? SH_LEG_FAR : SH_LEG, true, true);
  // Wrapped shin and foot: the pale material, cooler and darker on the far leg.
  const wrap = far ? SH_WRAP_FAR : SH_WRAP;
  limb(p, hx, hy, kx, ky, ax, ay, 1.4, 2, 2.15, 2.5, 1.45, wrap, false, true);
  const tx = j[(J_TOE + side) * 2]!;
  const ty = j[(J_TOE + side) * 2 + 1]!;
  const lx = j[(J_HEEL + side) * 2]!;
  const ly = j[(J_HEEL + side) * 2 + 1]!;
  p.px[0] = lx;
  p.py[0] = ly;
  p.pw[0] = 1.5;
  p.px[1] = lerp(lx, tx, 0.35);
  p.py[1] = lerp(ly, ty, 0.35) - 0.5;
  p.pw[1] = 1.9;
  p.px[2] = lerp(lx, tx, 0.72);
  p.py[2] = lerp(ly, ty, 0.72) - 0.2;
  p.pw[2] = 1.35;
  p.px[3] = tx;
  p.py[3] = ty;
  p.pw[3] = 0.25;
  p.ribbon(4, wrap, true, false);
  // The top of the wrap: a dark binding line.
  const bx = lerp(kx, ax, 0.4);
  const by = lerp(ky, ay, 0.4);
  const dx = ax - kx;
  const dy = ay - ky;
  const dl = Math.hypot(dx, dy) || 1;
  seg(
    p,
    bx + (dy / dl) * 2.1,
    by - (dx / dl) * 2.1,
    bx - (dy / dl) * 2.1,
    by + (dx / dl) * 2.1,
    0.3,
    0.3,
    SH_INK,
  );
}

function arm(p: Painter, j: Float32Array, side: number, lampPulse: number): void {
  const far = side === 1;
  const sx = j[(J_SH + side) * 2]!;
  const sy = j[(J_SH + side) * 2 + 1]!;
  const ex = j[(J_EL + side) * 2]!;
  const ey = j[(J_EL + side) * 2 + 1]!;
  const hx = j[(J_HAND + side) * 2]!;
  const hy = j[(J_HAND + side) * 2 + 1]!;
  // Cloth-wrapped forearm first, then the short sleeve with its flared cuff over it.
  limb(p, sx, sy, ex, ey, hx, hy, 1.1, 2, 1.9, 1.9, 1.4, far ? SH_WRAP_FAR : SH_WRAP, true, true);
  limb(p, sx, sy, ex, ey, hx, hy, 0, 1.26, 3, 2.75, 3.2, far ? SH_SLEEVE_FAR : SH_SLEEVE, true, false);
  if (!far && !p.ghost) {
    // One glowing thread at the cuff.
    const cx = lerp(ex, hx, 0.3);
    const cy = lerp(ey, hy, 0.3);
    const dx = hx - ex;
    const dy = hy - ey;
    const dl = Math.hypot(dx, dy) || 1;
    p.px[0] = cx + (dy / dl) * 2.4;
    p.py[0] = cy - (dx / dl) * 2.4;
    p.px[1] = cx - (dy / dl) * 2.4;
    p.py[1] = cy + (dx / dl) * 2.4;
    p.pw[0] = p.pw[1] = 0.7;
    p.pc[0] = p.pc[3] = 0.5 * lampPulse;
    p.streak(2, GOLD);
  }
}

/** Mitten hand with a thumb: open and relaxed, or closed around the shaft. */
function hand(p: Painter, j: Float32Array, side: number, d: number, grip: boolean): void {
  const far = side === 1;
  const ex = j[(J_EL + side) * 2]!;
  const ey = j[(J_EL + side) * 2 + 1]!;
  const hx = j[(J_HAND + side) * 2]!;
  const hy = j[(J_HAND + side) * 2 + 1]!;
  const shade = far ? SH_SKIN_FAR : SH_SKIN;
  const a = Math.atan2(hy - ey, hx - ex);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  if (grip) {
    p.ellipse(hx + ca * 0.6, hy + sa * 0.6, 2.7, 2.4, a, shade, 12);
    p.ellipse(hx + ca * 1.2 + sa * 0.6 * d, hy + sa * 1.2 - ca * 0.6 * d, 2.2, 1.1, a + 0.5 * d, shade, 10);
    return;
  }
  // Thumb on the forward/upper side, then the palm and loose fingers.
  p.ellipse(hx + ca * 2.1 + sa * 1.9 * d, hy + sa * 2.1 - ca * 1.9 * d, 1.5, 0.85, a - 0.75 * d, shade, 8);
  p.px[0] = hx - ca * 0.6;
  p.py[0] = hy - sa * 0.6;
  p.pw[0] = 1.5;
  p.px[1] = hx + ca * 1.8;
  p.py[1] = hy + sa * 1.8;
  p.pw[1] = 1.95;
  p.px[2] = hx + ca * 3.9 - sa * 0.3 * d;
  p.py[2] = hy + sa * 3.9 + ca * 0.3 * d;
  p.pw[2] = 1.5;
  p.px[3] = hx + ca * 5.1 - sa * 0.9 * d;
  p.py[3] = hy + sa * 5.1 + ca * 0.9 * d;
  p.pw[3] = 0.8;
  p.ribbon(4, shade, true, true);
}

function glaive(p: Painter, f: Frame): void {
  const { j, s } = f;
  const bx = j[J_BUTT * 2]!;
  const by = j[J_BUTT * 2 + 1]!;
  const L = BODY.glaive;
  const dx = (j[J_TIP * 2]! - bx) / L;
  const dy = (j[J_TIP * 2 + 1]! - by) / L;
  const qx = -dy;
  const qy = dx;
  const hs = s[S_HS]!;
  const hb = hs >= 0 ? Math.max(hs, 0.5) : Math.min(hs, -0.5);
  const grip = s[S_GRIP]!;
  // Shaft.
  const at = [0, L * 0.3, L * 0.6, L - 12];
  const off = [0, 0.25, -0.2, 0];
  const w = [0.6, 0.95, 0.9, 0.75];
  for (let i = 0; i < 4; i++) {
    p.px[i] = bx + dx * at[i]! + qx * off[i]!;
    p.py[i] = by + dy * at[i]! + qy * off[i]!;
    p.pw[i] = w[i]!;
  }
  p.ribbon(4, SH_WOOD, true, false);
  seg(p, bx - dx * 1.4, by - dy * 1.4, bx + dx * 2.4, by + dy * 2.4, 0.3, 1.05, SH_IRON, true, false);
  seg(
    p,
    bx + dx * (grip - 4.5),
    by + dy * (grip - 4.5),
    bx + dx * (grip + 5),
    by + dy * (grip + 5),
    1.15,
    1.1,
    SH_GRIP,
  );
  // Hook for the lantern, just under the blade.
  const hu = [L - 15, L - 15.2, L - 17.5, BODY.hookAt];
  const hv = [0.4, 3.4, 5.6, BODY.hookOut];
  for (let i = 0; i < 4; i++) {
    p.px[i] = bx + dx * hu[i]! + qx * hv[i]! * hs;
    p.py[i] = by + dy * hu[i]! + qy * hv[i]! * hs;
    p.pw[i] = 0.5;
  }
  p.ribbon(4, SH_IRON, false, true);
  // Blade: a slender leaf with a lit edge.
  const S = (u: number, v: number, c = false): void => pt(bx + dx * u + qx * v, by + dy * u + qy * v, c);
  pathStart();
  S(L - 13.5, 0.8, true);
  S(L - 12.6, 1.5 * hb + 0.6, true);
  S(L - 7, 2.0 * hb);
  S(L, 0, true);
  S(L - 6, -1.25 * hb);
  S(L - 12.6, -1.1 * hb - 0.6, true);
  S(L - 13.5, -0.8, true);
  const n = pathClosed(p, 4);
  p.shape(
    n,
    bx + dx * (L - 8),
    by + dy * (L - 8),
    SH_BLADE,
    bx + dx * (L - 14),
    by + dy * (L - 14),
    bx + dx * L,
    by + dy * L,
  );
  seg(p, bx + dx * (L - 16), by + dy * (L - 16), bx + dx * (L - 13), by + dy * (L - 13), 1.25, 1.35, SH_IRON);
}

/** The lantern on its chain, the flame, and the glows around it. */
function lantern(p: Painter, c: ChainPts, lamp: Lamp): void {
  const x0 = c.rx[0]!;
  const y0 = c.ry[0]!;
  const x1 = c.rx[1]!;
  const y1 = c.ry[1]!;
  let ax = c.rx[2]! - x1;
  let ay = c.ry[2]! - y1;
  const al = Math.hypot(ax, ay) || 1;
  ax /= al;
  ay /= al;
  const qx = -ay;
  const qy = ax;
  const ghost = p.ghost !== null;
  if (!ghost) {
    p.glow(lamp.x, lamp.y - 1.5, 62 * (0.9 + 0.1 * lamp.k), WARM_DEEP, 0.16 * lamp.k);
    p.glow(lamp.x, lamp.y - 1.5, 24, WARM, 0.42 * lamp.k);
  }
  seg(p, x0, y0, x1, y1, 0.35, 0.35, SH_IRON);
  const L = (u: number, v: number, w: number, i: number): void => {
    p.px[i] = x1 + ax * u + qx * v;
    p.py[i] = y1 + ay * u + qy * v;
    p.pw[i] = w;
  };
  p.ellipse(x1 + ax * 0.9, y1 + ay * 0.9, 1, 1, 0, SH_IRON, 8);
  // Glass first (translucent), then the frame over it.
  L(3.2, 0, 2.1, 0);
  L(6.4, 0, 2.6, 1);
  L(9.2, 0, 1.9, 2);
  p.ribbon(3, SH_GLASS, false, false);
  if (!ghost) {
    // Spirit flame: a living tongue that leans with the air, taller than its cage.
    for (let pass = 0; pass < 2; pass++) {
      const sc = pass === 0 ? 1 : 0.6;
      const h = pass === 0 ? 1 : 0.62;
      p.px[0] = lamp.x;
      p.py[0] = lamp.y + 1.7 * sc;
      p.pw[0] = 0.5 * sc;
      p.px[1] = lamp.x;
      p.py[1] = lamp.y + 0.3;
      p.pw[1] = 1.9 * sc;
      p.px[2] = lamp.x + lamp.tx * 0.3 * h;
      p.py[2] = lamp.y + lamp.ty * 0.45 * h;
      p.pw[2] = 1.3 * sc;
      p.px[3] = lamp.x + lamp.tx * 0.62 * h;
      p.py[3] = lamp.y + lamp.ty * 0.78 * h;
      p.pw[3] = 0.6 * sc;
      p.px[4] = lamp.x + lamp.tx * h;
      p.py[4] = lamp.y + lamp.ty * h;
      p.pw[4] = 0.05;
      p.ribbon(5, pass === 0 ? SH_FLAME : SH_FLAME_IN, true, false);
    }
  }
  L(1.7, 0, 0.9, 0);
  L(3.3, 0, 3.0, 1);
  p.ribbon(2, SH_IRON, false, false);
  for (const sd of [-1, 1]) {
    L(3.3, 2.1 * sd, 0.24, 0);
    L(6.4, 2.6 * sd, 0.24, 1);
    L(9.2, 1.9 * sd, 0.24, 2);
    p.ribbon(3, SH_IRON, false, false);
  }
  L(9, 0, 2.5, 0);
  L(10.2, 0, 1.6, 1);
  L(11, 0, 0.2, 2);
  p.ribbon(3, SH_IRON, false, false);
  if (!ghost) p.glow(lamp.x, lamp.y - 1.5, 6.5, HOT, 0.75 * lamp.k);
}

function head(p: Painter, f: Frame, lamp: Lamp): void {
  const { j, s } = f;
  const hx = j[J_HEAD * 2]!;
  const hy = j[J_HEAD * 2 + 1]!;
  const rot = s[S_HEADROT]!;
  const dh = s[S_DH]!;
  const czh = s[S_CZH]!;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const H = (x: number, y: number, c = false): void => pt(hx + x * cr - y * sr, hy + x * sr + y * cr, c);
  // Hood: a soft dark blob, a little fuller toward the face.
  pathStart();
  H(-8 + 0.4 * dh, -3);
  H(-1 * dh, -7);
  H(7.2 + 0.6 * dh - 1.3, -5);
  H(8.2 + 0.4 * dh, 0.6);
  H(6.3, 6.4);
  H(0, 8.4);
  H(-6.3, 6.6);
  H(-8.4 + 0.4 * dh, 1.4);
  fillPath(p, SH_HOOD, 4);
  // The face: a paler plane in the hood's shadow. Only the eyes show.
  const fxc = 3.9 * dh;
  const fw = 2.3 + 3.1 * czh;
  p.ellipse(hx + fxc * cr - 0.8 * sr, hy + fxc * sr + 0.8 * cr, fw, 5.3, rot, SH_FACE, 16);
  const open = clamp(s[S_EYE]!, 0, 1);
  const lookY = s[S_LOOKY]!;
  for (let side = 0; side < 2; side++) {
    const sd = side === 0 ? 1 : -1;
    const lx = dh * 5.75 - sd * czh * 2.95;
    const ly = 0.6 + lookY * 0.5;
    // The eye nearer the hood's edge is the far one: narrower in three-quarter view.
    const lead = sd * dh < 0 ? Math.abs(dh) : 0;
    const w = 1.7 * (1 - 0.36 * lead);
    const h = Math.max(0.16, 1.15 * open);
    const ex = hx + lx * cr - ly * sr;
    const ey = hy + lx * sr + ly * cr;
    // Almond with a flat upper lid, the outer corner drawn up a touch: level, unhurried.
    const m = dh >= 0 ? 1 : -1;
    const E = (x: number, y: number, c = false): void => pt(ex + x * cr - y * sr, ey + x * sr + y * cr, c);
    pathStart();
    E(-w * m, 0.15, true);
    E(-w * 0.2 * m, -h * 0.55);
    E(w * m, -h * 0.35, true);
    E(w * 0.3 * m, h * 0.75);
    E(-w * 0.5 * m, h * 0.7);
    const n = pathClosed(p, 3);
    p.shape(n, ex, ey, SH_EYE, ex, ey - h, ex, ey + h);
    p.glow(ex, ey, 5.4, EYE_GLOW, 0.4 * open * lamp.pulse);
  }
}

function hat(p: Painter, f: Frame, lamp: Lamp): void {
  const { j, s } = f;
  const hx = j[J_HEAD * 2]!;
  const hy = j[J_HEAD * 2 + 1]!;
  const rot = s[S_HATROT]!;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const T = (x: number, y: number, c = false): void =>
    pt(hx + x * cr - (y + 1.3) * sr, hy + x * sr + (y + 1.3) * cr, c);
  pathStart();
  T(-21.8, -1.5, true);
  T(-10.5, -7.9);
  T(-1.2, -12.8, true);
  T(1.2, -12.8, true);
  T(10.5, -7.9);
  T(21.8, -1.5, true);
  T(11, -3.7);
  T(0, -4.6);
  T(-11, -3.7);
  const n = pathClosed(p, 4);
  p.shape(n, hx + 7 * sr, hy - 7 * cr, SH_HAT, hx + 13 * sr, hy - 13 * cr, hx + 2 * sr, hy - 2 * cr);
  if (!p.ghost) {
    // Two-tone: the plane facing the lantern takes its light.
    const side = clamp((lamp.x - hx) / 14, -1, 1);
    for (const sd of [-1, 1]) {
      const k = sd * side > 0 ? 0.62 * Math.abs(side) + 0.1 : 0.1;
      SH_HAT_LIT.alpha = k;
      pathStart();
      T(1 * sd, -12.8, true);
      T(10.5 * sd, -7.9);
      T(21.6 * sd, -1.55, true);
      T(11 * sd, -3.75);
      T(4.5 * sd, -4.4, true);
      const m = pathClosed(p, 3);
      p.shape(m, hx + 10 * sd * cr + 6.5 * sr, hy + 10 * sd * sr - 6.5 * cr, SH_HAT_LIT);
    }
    // Underside of the brim.
    const ux = [-20, -10.5, 0, 10.5, 20];
    const uy = [-1.9, -4.4, -5.3, -4.4, -1.9];
    const uw = [0.05, 0.7, 0.9, 0.7, 0.05];
    for (let i = 0; i < 5; i++) {
      p.px[i] = hx + ux[i]! * cr - (uy[i]! + 1.3) * sr;
      p.py[i] = hy + ux[i]! * sr + (uy[i]! + 1.3) * cr;
      p.pw[i] = uw[i]!;
    }
    p.ribbon(5, SH_HAT_UNDER, false, false);
  }
}

/** The whole character. */
export function drawWick(p: Painter, f: Frame, sec: SecView, lamp: Lamp): void {
  const { j, s } = f;
  const d = s[S_D]!;
  const ghost = p.ghost !== null;
  const lean = s[S_LEAN]!;
  const cl = Math.cos(lean);
  const sl = Math.sin(lean);
  const px = j[J_PELVIS * 2]!;
  const py = j[J_PELVIS * 2 + 1]!;
  const nx = j[J_NECK * 2]!;
  const ny = j[J_NECK * 2 + 1]!;

  if (!ghost) {
    const ox = j[J_ORIGIN * 2]!;
    const oy = j[J_ORIGIN * 2 + 1]!;
    p.soft(ox, oy + 1, 24, 4.5, SHADOW, 0.5 * s[S_GROUND]!);
    // A faint cool halo so the dark figure never sinks into a dark background.
    p.glow(j[J_CENTRE * 2]!, j[J_CENTRE * 2 + 1]! - 6, 66, AURA, 0.04);
  }

  // 1. Far arm, the glaive, and the far hand closed around it.
  arm(p, j, 1, lamp.pulse);
  glaive(p, f);
  hand(p, j, 1, d, true);

  // 2. Far leg.
  leg(p, j, 1);

  // 3. Scarf tail and the far coat tail.
  streamer(p, sec.scarf, [2.1, 3, 3.3, 3.3, 3.1, 2.8, 2.3, 1.5, 0.15], SH_SCARF);
  streamer(p, sec.tailFar, [2.4, 3.3, 3.5, 3.1, 2.3, 0.15], SH_TAIL_FAR);

  // 4. Near leg, then the near coat tail over it. (Tucked into the somersault's ball the thigh
  // lies across the chest, so the leg is drawn over the coat instead: see below.)
  const ball = s[S_BALL]!;
  const legOver = ball > 0.5;
  if (!legOver) leg(p, j, 0);
  streamer(p, sec.tailNear, [2.4, 3.4, 3.6, 3.2, 2.4, 0.15], SH_TAIL);

  // 5. Short coat: flared skirt to mid-thigh, fitted chest, sash.
  const spine = (t: number, off0: number, i: number, w: number): void => {
    // The back rounds as the body curls into a ball.
    const off = off0 - ball * 3.6 * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    p.px[i] = px + (nx - px) * t + cl * off * d;
    p.py[i] = py + (ny - py) * t + sl * off;
    p.pw[i] = w;
  };
  const sk = sec.skirt;
  spine(0.3, 0, 0, 5.2);
  spine(0.1, 0, 1, 6.5);
  p.px[2] = sk.rx[1]!;
  p.py[2] = sk.ry[1]!;
  p.pw[2] = 8.3;
  p.px[3] = sk.rx[2]!;
  p.py[3] = sk.ry[2]!;
  p.pw[3] = 9.5;
  p.ribbon(4, SH_SKIRT, false, false);
  // Hem: its edge, the split, and a glowing thread.
  {
    let tx = sk.rx[2]! - sk.rx[1]!;
    let ty = sk.ry[2]! - sk.ry[1]!;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const hx0 = sk.rx[2]! - ty * 9.5;
    const hy0 = sk.ry[2]! + tx * 9.5;
    const hx1 = sk.rx[2]! + ty * 9.5;
    const hy1 = sk.ry[2]! - tx * 9.5;
    seg(p, hx0, hy0, hx1, hy1, 0.5, 0.5, SH_SKIRT, true, true);
    seg(p, px - 0.8 * d, py - 2, sk.rx[2]! + 0.6 * d, sk.ry[2]!, 0.15, 0.8, SH_INK);
    if (!ghost) {
      p.px[0] = hx0 - tx * 0.9;
      p.py[0] = hy0 - ty * 0.9;
      p.px[1] = sk.rx[2]! - tx * 0.9;
      p.py[1] = sk.ry[2]! - ty * 0.9;
      p.px[2] = hx1 - tx * 0.9;
      p.py[2] = hy1 - ty * 0.9;
      p.pw[0] = p.pw[1] = p.pw[2] = 0.65;
      p.pc[0] = p.pc[3] = p.pc[6] = 0.42 * lamp.pulse;
      p.streak(3, GOLD);
    }
  }
  spine(0.22, -0.1, 0, 5.2);
  spine(0.36, 0, 1, 5.9);
  spine(0.54, 0.3, 2, 6.8);
  spine(0.82, 0.3, 3, 6.4);
  spine(0.97, 0, 4, 4.6);
  spine(1.08, -0.2, 5, 3.6);
  // Painted top-down so the gradient runs light chest to dark waist.
  for (let i = 0; i < 3; i++) {
    const k = 5 - i;
    const tx = p.px[i]!;
    const ty = p.py[i]!;
    const tw = p.pw[i]!;
    p.px[i] = p.px[k]!;
    p.py[i] = p.py[k]!;
    p.pw[i] = p.pw[k]!;
    p.px[k] = tx;
    p.py[k] = ty;
    p.pw[k] = tw;
  }
  p.ribbon(6, SH_COAT, false, false);
  // Crossed lapel line.
  loc(nx, ny, cl, sl, d, 1.5, 0.5);
  const l0x = FX;
  const l0y = FY;
  loc(nx, ny, cl, sl, d, 4.6, 7);
  const l1x = FX;
  const l1y = FY;
  loc(nx, ny, cl, sl, d, 5, 14.2);
  p.px[0] = l0x;
  p.py[0] = l0y;
  p.px[1] = l1x;
  p.py[1] = l1y;
  p.px[2] = FX;
  p.py[2] = FY;
  p.pw[0] = 0.15;
  p.pw[1] = 0.3;
  p.pw[2] = 0.2;
  p.ribbon(3, SH_INK, false, false);
  // Sash with a glowing thread.
  spine(0.3, 0, 0, 5.75);
  spine(0.16, 0, 1, 6.1);
  p.ribbon(2, SH_SASH, false, false);
  if (!ghost) {
    const mx = px + (nx - px) * 0.23;
    const my = py + (ny - py) * 0.23;
    p.px[0] = mx - cl * 5.9;
    p.py[0] = my - sl * 5.9 * d;
    p.px[1] = mx + cl * 5.9;
    p.py[1] = my + sl * 5.9 * d;
    p.pw[0] = p.pw[1] = 0.7;
    p.pc[0] = p.pc[3] = 0.5 * lamp.pulse;
    p.streak(2, GOLD);
  }

  if (legOver) leg(p, j, 0);

  // 6. Hat ribbons, then the head: a hooded, shadowed face.
  streamer(p, sec.ribA, [0.7, 1.1, 1.1, 1, 0.8, 0.12], SH_RIB_A);
  streamer(p, sec.ribB, [0.7, 1.05, 1, 0.85, 0.65, 0.12], SH_RIB_B);
  head(p, f, lamp);

  // 7. Scarf wound high around the neck and over the mouth.
  {
    const cxs = [-4.6, -2.2, 0.4, 3, 5.4];
    const cys = [-2.4, -0.9, -0.2, -0.6, -1.6];
    const cws = [3.5, 3.9, 4.1, 4, 3.5];
    // Keep some width through a turn: the collar is a ring, not a card.
    const dw = Math.abs(d) < 0.45 ? (d >= 0 ? 0.45 : -0.45) : d;
    for (let i = 0; i < 5; i++) {
      loc(nx, ny, cl, sl, 1, cxs[i]! * dw, cys[i]!);
      p.px[i] = FX;
      p.py[i] = FY;
      p.pw[i] = cws[i]!;
    }
    p.ribbon(5, SH_COLLAR, true, true);
    for (let i = 0; i < 3; i++) {
      loc(nx, ny, cl, sl, 1, [-5.5, -0.5, 6.5][i]! * dw, [-1.8, 0.5, -1][i]!);
      p.px[i] = FX;
      p.py[i] = FY;
      p.pw[i] = [0.15, 0.32, 0.15][i]!;
    }
    p.ribbon(3, SH_INK, false, false);
  }

  // 8. The hat.
  hat(p, f, lamp);

  // 9. Near arm, free: in front of everything.
  arm(p, j, 0, lamp.pulse);
  hand(p, j, 0, d, false);

  // 10. The lantern and its flame.
  lantern(p, sec.lantern, lamp);
  if (!ghost) {
    // The scarf end smoulders like a wick.
    const sc = sec.scarf;
    const m = sc.n - 1;
    p.glow(sc.rx[m]!, sc.ry[m]!, 3.2, WARM_DEEP, 0.3 * lamp.pulse);
  }
}
