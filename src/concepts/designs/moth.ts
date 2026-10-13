/**
 * Vesper, the moth. A slender upright moth-person whose cloak is her folded wings.
 * Everything is rebuilt each frame from a few pose numbers, as sampled outlines, so cloth and
 * antennae can flow. Coordinates: root origin at the feet, +y down, facing +x.
 */
import { Container, FillGradient, Graphics } from 'pixi.js';
import type { Concept, ConceptInstance, ConceptPose } from '../types';

// ---- palette ---------------------------------------------------------------------------------
const C = {
  wingLit: 0x644f6c,
  wingMid: 0x3b2e4a,
  wingDark: 0x1c1832,
  farLit: 0x30284a,
  farDark: 0x12122a,
  body: 0x2a2136,
  bodyDark: 0x110f1c,
  leg: 0x17131f,
  legFar: 0x0e1320,
  faceLit: 0xe6dcd4,
  faceShade: 0xa39bb4,
  crownLit: 0x3d314b,
  crownDark: 0x16121f,
  furLit: 0xa9a3a8,
  furShade: 0x4e4f64,
  eye: 0x120e1b,
  band: 0xc4b2b6,
  spot: 0xb99f7a,
  plume: 0x2c2338,
  barb: 0x93859c,
  rim: 0xffd9a0,
  cool: 0x62b9b2,
  gold: 0xffe3a6,
  ink: 0x0c0a1a,
  tunic: 0x41345a,
  sleeve: 0x5a496f,
  sleeveFar: 0x2c2442,
  cuff: 0xa69fa8,
  cuffFar: 0x625c74,
  hand: 0xd8cecb,
  handFar: 0x8d859c,
  metal: 0xcdb98a,
} as const;

/** Key light direction (towards the light), upper right. */
const KEY = { x: 0.58, y: -0.81 };
/** Cool fill, from the left and slightly below. */
const FILL = { x: -0.94, y: 0.34 };

// ---- small maths ------------------------------------------------------------------------------
type Pts = number[];
const v = (a: readonly number[], i: number): number => a[i] ?? 0;
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const fract = (x: number): number => x - Math.floor(x);
const smooth = (k: number): number => k * k * (3 - 2 * k);
const bump = (u: number, c: number, w: number): number => Math.exp(-(((u - c) / w) ** 2));

/** Top-to-bottom gradient in the shape's own bounds. */
function vertical(stops: [number, number][]): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
  });
}

/** Shadow-side wash: a cool dark coming in from the left, clear by `reach`. */
function sideShade(rgb: string, alpha: number, reach: number): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: `rgba(${rgb},${alpha})` },
      { offset: reach, color: `rgba(${rgb},0)` },
      { offset: 1, color: `rgba(${rgb},0)` },
    ],
  });
}

function radialGlow(inner: string, mid: string): FillGradient {
  return new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: inner },
      { offset: 0.35, color: mid },
      { offset: 1, color: 'rgba(255,214,150,0)' },
    ],
  });
}

/** Append samples of a cubic bezier (excluding its start point) to a flat point list. */
function cubic(out: Pts, p: readonly number[], n = 10): void {
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const m = 1 - k;
    const a = m * m * m;
    const b = 3 * m * m * k;
    const c = 3 * m * k * k;
    const d = k * k * k;
    out.push(
      a * v(p, 0) + b * v(p, 2) + c * v(p, 4) + d * v(p, 6),
      a * v(p, 1) + b * v(p, 3) + c * v(p, 5) + d * v(p, 7),
    );
  }
}

/** A closed shape from cubic segments: [x0, y0, (c1x, c1y, c2x, c2y, x, y)...]. */
function shape(d: readonly number[], n = 10): Pts {
  const out: Pts = [v(d, 0), v(d, 1)];
  let px = v(d, 0);
  let py = v(d, 1);
  for (let i = 2; i + 5 < d.length; i += 6) {
    cubic(out, [px, py, v(d, i), v(d, i + 1), v(d, i + 2), v(d, i + 3), v(d, i + 4), v(d, i + 5)], n);
    px = v(d, i + 4);
    py = v(d, i + 5);
  }
  return out;
}

/** Unit tangent at vertex i of an open (or closed) point list, from neighbours `span` apart. */
function tangent(pts: readonly number[], i: number, span: number, closed: boolean): [number, number] {
  const n = pts.length / 2;
  const a = closed ? (i - span + n) % n : Math.max(0, i - span);
  const b = closed ? (i + span) % n : Math.min(n - 1, i + span);
  const tx = v(pts, b * 2) - v(pts, a * 2);
  const ty = v(pts, b * 2 + 1) - v(pts, a * 2 + 1);
  const l = Math.hypot(tx, ty) || 1;
  return [tx / l, ty / l];
}

/** Thick-thin ribbon around a centre line; `w(s)` is the half width at s in 0..1. */
function ribbon(pts: readonly number[], w: (s: number) => number): Pts {
  const n = pts.length / 2;
  const left: Pts = [];
  const right: Pts = [];
  for (let i = 0; i < n; i++) {
    const [tx, ty] = tangent(pts, i, 1, false);
    const hw = w(i / (n - 1));
    const x = v(pts, i * 2);
    const y = v(pts, i * 2 + 1);
    left.push(x + ty * hw, y - tx * hw);
    right.unshift(x - ty * hw, y + tx * hw);
  }
  return left.concat(right);
}

/**
 * Rim light as a tapered sliver inside a closed outline: thick where the edge faces the light,
 * vanishing where it turns away. Reads as a painted rim rather than an outline.
 */
function rim(
  g: Graphics,
  poly: readonly number[],
  light: { x: number; y: number },
  width: number,
  color: number,
  alpha: number,
  power = 1.6,
): void {
  const n = poly.length / 2;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += v(poly, i * 2) * v(poly, j * 2 + 1) - v(poly, j * 2) * v(poly, i * 2 + 1);
  }
  const sign = area > 0 ? 1 : -1;
  const inten: number[] = [];
  const nx: number[] = [];
  const ny: number[] = [];
  for (let i = 0; i < n; i++) {
    const [tx, ty] = tangent(poly, i, 2, true);
    const ox = ty * sign;
    const oy = -tx * sign;
    nx.push(ox);
    ny.push(oy);
    inten.push(Math.max(0, ox * light.x + oy * light.y) ** power);
  }
  let start = 0;
  while (start < n && v(inten, start) > 0.02) start++;
  if (start === n) start = 0;
  let run: Pts = [];
  let back: Pts = [];
  for (let s = 0; s <= n; s++) {
    const i = (start + s) % n;
    const k = v(inten, i);
    const x = v(poly, i * 2);
    const y = v(poly, i * 2 + 1);
    if (k > 0.02 && s < n) {
      run.push(x, y);
      back.unshift(x - v(nx, i) * width * k, y - v(ny, i) * width * k);
    } else {
      if (run.length > 0) run.push(x, y);
      if (run.length >= 6) g.poly(run.concat(back), true).fill({ color, alpha });
      run = [];
      back = [];
    }
  }
}

function polyline(g: Graphics, pts: readonly number[]): Graphics {
  g.moveTo(v(pts, 0), v(pts, 1));
  for (let i = 2; i < pts.length; i += 2) g.lineTo(v(pts, i), v(pts, i + 1));
  return g;
}

// ---- wing -------------------------------------------------------------------------------------
interface WingSpec {
  /** Root line: u = 0 (leading / back edge) to u = 1 (trailing / front edge). */
  r0x: number;
  r0y: number;
  r1x: number;
  r1y: number;
  /** Edge angles from straight down, positive towards the back. */
  th0: number;
  th1: number;
  len: number;
  /** Length of the trailing edge relative to the leading edge. */
  taper: number;
  /** How much the edges belly outwards. */
  bow0: number;
  bow1: number;
  /** Flutter amplitude (radians) and phase. */
  wave: number;
  phase: number;
  /** 0 = folded cape outline, 1 = fore/hind wing lobes with a notch between. */
  lobe: number;
  speed: number;
}

const SCALLOPS = 5;
const RAG = [1, 0.965, 1.02, 0.95, 1.0, 0.97];

interface Wing {
  outline: Pts;
  at(u: number, f: number): [number, number];
  margin(u: number): number;
}

function buildWing(s: WingSpec, t: number): Wing {
  const at = (u: number, f: number): [number, number] => {
    const th =
      lerp(s.th0, s.th1, u) +
      lerp(s.bow0, s.bow1, u) * Math.sin(Math.PI * Math.min(f, 1)) +
      s.wave * f * Math.sin(t * s.speed - f * 2.6 - u * 1.4 + s.phase) +
      s.wave * 0.4 * f * f * Math.sin(t * s.speed * 1.9 - f * 4.1 + u * 2 + s.phase);
    const shapeR =
      1 - (1 - s.taper) * u ** 1.25 + s.lobe * (0.16 * bump(u, 0.8, 0.16) - 0.13 * bump(u, 0.55, 0.07));
    const r = s.len * shapeR * f;
    return [lerp(s.r0x, s.r1x, u) - Math.sin(th) * r, lerp(s.r0y, s.r1y, u) + Math.cos(th) * r];
  };
  const margin = (u: number): number => {
    const k = Math.min(SCALLOPS - 1, Math.floor(u * SCALLOPS));
    const local = u * SCALLOPS - k;
    const rag = lerp(v(RAG, k), v(RAG, k + 1), local);
    // Rounded lobes between veins, cusps on the veins; one small tear.
    return rag * (0.955 + 0.05 * Math.sin(Math.PI * local) ** 0.7) - 0.035 * bump(u, 0.31, 0.012);
  };
  const outline: Pts = [];
  const E = 14;
  for (let i = 0; i < E; i++) outline.push(...at(0, (i / E) * margin(0)));
  const M = SCALLOPS * 9;
  for (let i = 0; i <= M; i++) outline.push(...at(i / M, margin(i / M)));
  for (let i = E - 1; i >= 0; i--) outline.push(...at(1, (i / E) * margin(1)));
  return { outline, at, margin };
}

// ---- pose -------------------------------------------------------------------------------------
interface Pose {
  hipY: number;
  lean: number;
  head: number;
  antenna: number;
  near: WingSpec;
  far: WingSpec;
  /** Short hindwing that stays draped round the hips. */
  hind: WingSpec;
}

const wing = (
  r0x: number,
  r0y: number,
  r1x: number,
  r1y: number,
  th0: number,
  th1: number,
  len: number,
  taper: number,
  bow0: number,
  bow1: number,
  wave: number,
  phase: number,
  lobe: number,
  speed: number,
): WingSpec => ({ r0x, r0y, r1x, r1y, th0, th1, len, taper, bow0, bow1, wave, phase, lobe, speed });

const POSES: Record<ConceptPose, Pose> = {
  idle: {
    hipY: -27.6,
    lean: -0.035,
    head: -0.05,
    antenna: 0,
    near: wing(-4.6, -31.5, 2.6, -30.5, 0.36, 0.04, 55, 0.8, 0.1, -0.03, 0.035, 0, 0.08, 1.6),
    far: wing(-3, -31.5, 3, -30.5, 0.58, 0.22, 51, 0.8, 0.08, -0.04, 0.04, 1.1, 0.08, 1.6),
    hind: wing(-3, -6, 2.5, -5, 0.42, 0, 15, 0.85, 0.08, -0.03, 0.03, 0.5, 0, 1.6),
  },
  run: {
    hipY: -25.2,
    lean: 0.42,
    head: 0.1,
    antenna: -0.32,
    near: wing(-4, -31, 0.5, -12, 1.34, 0.8, 54, 0.62, 0.1, -0.08, 0.08, 0, 0.6, 8),
    far: wing(-2.5, -32, 1, -20, 1.68, 1.16, 49, 0.66, 0.1, -0.06, 0.09, 1.3, 0.5, 8),
    hind: wing(-3.4, -9, 2.4, -3, 1.0, 0.25, 23, 0.7, 0.1, -0.06, 0.11, 0.6, 0.3, 8),
  },
  jump: {
    hipY: -31,
    lean: 0.14,
    head: -0.06,
    antenna: -0.42,
    near: wing(-2.8, -31.5, -1, -20, 1.84, 0.5, 55, 0.62, 0.1, -0.12, 0.04, 0, 1, 2.4),
    far: wing(-1.5, -32, 0, -24, 2.16, 1.08, 49, 0.66, 0.1, -0.1, 0.045, 0.9, 0.9, 2.4),
    hind: wing(-3.4, -12, 1.4, -2, 1.3, 0.1, 27, 0.68, 0.1, -0.1, 0.05, 0.5, 0.6, 2.4),
  },
};

// ---- limbs ------------------------------------------------------------------------------------
const THIGH = 13.4;
const SHIN = 13.4;
const UPPER_ARM = 10;
const FOREARM = 10;

/** Two-bone IK: the middle joint, bending to the side given by `dir` (+1 / -1). */
function ik(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  l1: number,
  l2: number,
  dir: number,
): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.max(0.01, Math.min(Math.hypot(dx, dy), l1 + l2 - 0.05));
  const base = Math.atan2(dy, dx);
  const a = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  return [ax + Math.cos(base - a * dir) * l1, ay + Math.sin(base - a * dir) * l1];
}

/** Centre line of two straight bones with a small rounded joint. */
function bones(hx: number, hy: number, kx: number, ky: number, ax: number, ay: number): Pts {
  const line: Pts = [];
  for (let i = 0; i <= 5; i++) line.push(lerp(hx, kx, (i / 5) * 0.8), lerp(hy, ky, (i / 5) * 0.8));
  const k0x = lerp(hx, kx, 0.8);
  const k0y = lerp(hy, ky, 0.8);
  const k1x = lerp(kx, ax, 0.2);
  const k1y = lerp(ky, ay, 0.2);
  for (let i = 1; i < 5; i++) {
    const k = i / 5;
    const m = 1 - k;
    line.push(m * m * k0x + 2 * m * k * kx + k * k * k1x, m * m * k0y + 2 * m * k * ky + k * k * k1y);
  }
  for (let i = 0; i <= 5; i++) line.push(lerp(k1x, ax, i / 5), lerp(k1y, ay, i / 5));
  return line;
}

function place(local: readonly number[], x: number, y: number, cs: number, sn: number, flip = 1): Pts {
  const out: Pts = [];
  for (let i = 0; i < local.length; i += 2) {
    const lx = v(local, i);
    const ly = v(local, i + 1) * flip;
    out.push(x + lx * cs - ly * sn, y + lx * sn + ly * cs);
  }
  return out;
}

interface Foot {
  x: number;
  y: number;
  rot: number;
}

const FOOT = [-1.9, 0, -1.7, -1.5, -0.4, -2.5, 1.2, -2.3, 4.2, -1.0, 6.1, -0.25, 5.6, 0];

function drawLeg(g: Graphics, hx: number, hy: number, f: Foot, color: number, lit: boolean): void {
  const cs = Math.cos(f.rot);
  const sn = Math.sin(f.rot);
  const ax = f.x + sn * 1.9;
  const ay = f.y - cs * 1.9;
  const [kx, ky] = ik(hx, hy, ax, ay, THIGH, SHIN, 1);
  const leg = ribbon(
    bones(hx, hy, kx, ky, ax, ay),
    (s) => lerp(1.7, 0.62, s ** 0.75) + 0.18 * bump(s, 0.5, 0.07),
  );
  g.poly(leg, true).fill(color);
  const foot = place(FOOT, f.x, f.y, cs, sn);
  g.poly(foot, true).fill(color);
  if (lit) {
    rim(g, leg, KEY, 0.5, C.rim, 0.4, 1.2);
    rim(g, foot, KEY, 0.5, C.rim, 0.45, 1.4);
    rim(g, leg, FILL, 0.4, C.cool, 0.25, 1.4);
  }
}

/** Hands, x along the forearm. Open: fingers together, thumb apart. Grip: a closed fist. */
const HAND_OPEN = [
  -0.3, -0.85, 1.5, -1.2, 3.1, -1.0, 4.5, -0.35, 4.4, 0.4, 3.0, 0.95, 2.2, 1.0, 2.5, 1.9, 1.9, 2.3, 0.8, 1.3,
  -0.3, 0.85,
];
const HAND_GRIP = [-0.3, -0.85, 1.3, -1.45, 2.7, -1.4, 3.4, -0.5, 3.3, 0.7, 2.3, 1.5, 0.9, 1.5, -0.3, 0.85];

function drawArm(
  g: Graphics,
  sx: number,
  sy: number,
  hx: number,
  hy: number,
  bend: number,
  grip: boolean,
  near: boolean,
): void {
  const [ex, ey] = ik(sx, sy, hx, hy, UPPER_ARM, FOREARM, bend);
  const arm = ribbon(bones(sx, sy, ex, ey, hx, hy), (s) => lerp(1.55, 0.85, s) + 0.12 * bump(s, 0.5, 0.08));
  g.poly(arm, true).fill(near ? C.sleeve : C.sleeveFar);
  const fl = Math.hypot(hx - ex, hy - ey) || 1;
  const cs = (hx - ex) / fl;
  const sn = (hy - ey) / fl;
  // A pale cuff, then the hand: the light value is what makes the arm read at game size.
  const cuff = place([-2.6, -1.0, -0.2, -1.05, -0.2, 1.05, -2.6, 1.0], hx, hy, cs, sn);
  g.poly(cuff, true).fill(near ? C.cuff : C.cuffFar);
  const hand = place(grip ? HAND_GRIP : HAND_OPEN, hx, hy, cs, sn, bend);
  g.poly(hand, true).fill(near ? C.hand : C.handFar);
  if (grip) {
    // Knuckle lines so the fist reads as fingers wrapped round something.
    for (let i = 0; i < 3; i++) {
      const p = place([1.1 + i * 0.75, -1.3, 1.3 + i * 0.75, 0.5], hx, hy, cs, sn, bend);
      g.moveTo(v(p, 0), v(p, 1)).lineTo(v(p, 2), v(p, 3));
    }
    g.stroke({ width: 0.3, color: 0x6c6478, alpha: near ? 0.7 : 0.4, cap: 'round' });
  }
  if (near) {
    rim(g, arm, KEY, 0.6, C.rim, 0.5, 1.3);
    rim(g, arm, FILL, 0.45, C.cool, 0.3, 1.4);
    rim(g, hand, KEY, 0.5, 0xfff6e2, 0.7, 1.3);
  }
}

/** The thorn: a slender needle blade in a dark sheath, hilt up and forward. */
function drawThorn(g: Graphics, x: number, y: number, ang: number): void {
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  const sheath = place([0, -1.0, 9, -0.85, 22, -0.5, 31, 0, 22, 0.5, 9, 0.85, 0, 1.0], x, y, cs, sn);
  g.poly(sheath, true).fill(0x1a1630);
  rim(g, sheath, KEY, 0.5, C.rim, 0.55, 1.2);
  rim(g, sheath, FILL, 0.4, C.cool, 0.3, 1.4);
  g.poly(place([27.5, -0.2, 31, 0, 27.5, 0.2], x, y, cs, sn), true).fill({ color: C.metal, alpha: 0.8 });
  g.poly(place([-7.2, -0.6, 0, -0.75, 0, 0.75, -7.2, 0.6], x, y, cs, sn), true).fill(0x8f889a);
  for (let i = 0; i < 4; i++) {
    const p = place([-1.4 - i * 1.5, -0.7, -2.1 - i * 1.5, 0.7], x, y, cs, sn);
    g.moveTo(v(p, 0), v(p, 1)).lineTo(v(p, 2), v(p, 3));
  }
  g.stroke({ width: 0.3, color: 0x3a3448, alpha: 0.7 });
  // Guard: a small swept crescent. Pommel: a seed.
  const guard = place(
    [-0.4, -3.0, 0.5, -1.6, 0.7, 0, 0.5, 1.6, -0.4, 3.0, -0.5, 1.4, -0.4, 0, -0.5, -1.4],
    x,
    y,
    cs,
    sn,
  );
  g.poly(guard, true).fill(C.metal);
  const pommel = place([-7, -0.6, -8.2, -1.1, -9.6, 0, -8.2, 1.1, -7, 0.6], x, y, cs, sn);
  g.poly(pommel, true).fill(C.metal);
  rim(g, guard, KEY, 0.4, 0xfff6e2, 0.8, 1.2);
  rim(g, pommel, KEY, 0.4, 0xfff6e2, 0.8, 1.2);
}

// ---- fixed shapes (head-local: origin at the base of the skull; body: origin at the hip) ------
const HEAD = shape([
  0.5, -24.5, 6, -24.8, 11, -21.5, 12.2, -15.5, 13, -10.8, 11.6, -4.6, 7.4, -1.6, 3.5, 0.2, -4.6, -0.6, -8.2,
  -5.5, -11.6, -11.5, -8.5, -24, 0.5, -24.5,
]);
/** Stretch a head-local outline back from the profile, so the face takes more of the head. */
function widen(pts: Pts): Pts {
  const out: Pts = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = v(pts, i);
    out.push(x < 9 ? 9 + (x - 9) * 1.2 : x, -11.6 + (v(pts, i + 1) + 11.6) * 1.05);
  }
  return out;
}

/** The face proper: a soft heart of short pale fur set into the darker head fur. */
const FACE = widen(
  shape(
    [
      6.6, -21.4, 9.2, -21.4, 11.4, -19.2, 12.0, -15.4, 12.7, -10.8, 11.5, -5.0, 7.5, -2.0, 4.6, -0.8, 0.6,
      -2.2, -1.4, -5.6, -3.2, -9, -3.4, -14.2, -1.6, -18, 0, -20.4, 3.2, -21.4, 6.6, -21.4,
    ],
    12,
  ),
);
/** Fitted tunic: fuller chest under the collar, drawn in at the waist. */
const TORSO = shape([
  4.4, -32, 8.6, -29.5, 9.8, -23.5, 7.6, -15.5, 6.4, -10.5, 5.4, -5, 4.4, 1.2, 2, 3.2, -2, 3.2, -3.4, 1, -4,
  -6, -6.2, -19, -3.6, -32, -1, -33.5, 2.4, -33.5, 4.4, -32,
]);
/** Fur collar: a slim stole round the neck, a little deeper at the chest. */
const MANTLE = shape(
  [
    -5.6, -32.4, -3, -34.2, 6, -34, 8.8, -31.8, 10.2, -30.2, 9.4, -27.8, 7.6, -26.2, 5.8, -25, 3.4, -25.2, 1,
    -26, -1.4, -26.9, -4, -27.6, -5.6, -28.4, -7.2, -29.3, -7, -31.2, -5.6, -32.4,
  ],
  12,
);

interface AntennaSpec {
  /** Cubic: root, two controls, tip. */
  curve: readonly number[];
  phase: number;
  half: number;
}

/** Near: one long sweep back, tip lifted. Far: shorter and steeper, arcing over the crown. */
const ANT_NEAR: AntennaSpec = { curve: [7.4, -22.6, 4.5, -33.5, -14, -37, -35, -31], phase: 0, half: 1.9 };
const ANT_FAR: AntennaSpec = { curve: [10, -21.2, 12.5, -33, 4, -39.5, -12, -40], phase: 0.9, half: 1.6 };

function antennaLine(a: AntennaSpec, t: number, extra: number, speed: number): Pts {
  const rx = v(a.curve, 0);
  const ry = v(a.curve, 1);
  const raw: Pts = [rx, ry];
  cubic(raw, a.curve, 40);
  const out: Pts = [];
  const n = raw.length / 2;
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    const ang =
      extra * s ** 1.4 +
      0.06 * s * Math.sin(t * speed - s * 2.6 + a.phase) +
      0.03 * s * s * Math.sin(t * speed * 2.3 - s * 5);
    const dx = v(raw, i * 2) - rx;
    const dy = v(raw, i * 2 + 1) - ry;
    out.push(rx + dx * Math.cos(ang) - dy * Math.sin(ang), ry + dx * Math.sin(ang) + dy * Math.cos(ang));
  }
  return out;
}

const plumeWidth = (s: number): number => Math.sin(Math.PI * s ** 0.6) ** 0.8;

function drawAntenna(g: Graphics, line: readonly number[], half: number, near: boolean): void {
  const plume = ribbon(line, (s) => 0.2 + half * plumeWidth(s));
  g.poly(plume, true).fill({ color: near ? C.plume : C.crownDark, alpha: 0.7 });
  // Barbs: fine comb teeth swept towards the tip.
  const n = line.length / 2;
  for (let i = 2; i < n - 1; i++) {
    const s = i / (n - 1);
    const [tx, ty] = tangent(line, i, 1, false);
    const w = (0.2 + half * plumeWidth(s)) * 1.18;
    const x = v(line, i * 2);
    const y = v(line, i * 2 + 1);
    g.moveTo(x, y).lineTo(x + ty * w + tx * w * 0.8, y - tx * w + ty * w * 0.8);
    g.moveTo(x, y).lineTo(x - ty * w + tx * w * 0.8, y + tx * w + ty * w * 0.8);
  }
  g.stroke({ width: 0.3, color: near ? C.barb : 0x5d5070, alpha: near ? 0.7 : 0.8, cap: 'round' });
  const spine = ribbon(line, (s) => lerp(0.8, 0.2, s));
  g.poly(spine, true).fill(near ? C.crownDark : C.bodyDark);
  rim(g, spine, KEY, 0.5, C.rim, near ? 0.6 : 0.35, 1.2);
}

function create(pose: ConceptPose): ConceptInstance {
  const P = POSES[pose];
  const view = new Container();
  const gHalo = new Graphics();
  const gTrail = new Graphics();
  const gLegs = new Graphics();
  const upper = new Container();
  const gFar = new Graphics();
  const gArmFar = new Graphics();
  const gBody = new Graphics();
  const gNear = new Graphics();
  const gWingGlow = new Graphics();
  const gArmNear = new Graphics();
  const gFur = new Graphics();
  const headC = new Container();
  const gHead = new Graphics();
  const gTips = new Graphics();
  const gDust = new Graphics();
  const lights = [gHalo, gTrail, gWingGlow, gTips, gDust];
  for (const g of lights) g.blendMode = 'add';
  headC.addChild(gHead, gTips);
  headC.position.set(2.4, -33);
  upper.addChild(gFar, gArmFar, gBody, gNear, gWingGlow, gArmNear, gFur, headC);
  view.addChild(gHalo, gTrail, gLegs, upper, gDust);

  const wingGrad = vertical([
    [0, C.wingLit],
    [0.4, C.wingMid],
    [1, C.wingDark],
  ]);
  const wingSide = sideShade('14,12,36', 0.5, 0.75);
  const farGrad = vertical([
    [0, C.farLit],
    [1, C.farDark],
  ]);
  const bodyGrad = vertical([
    [0, C.tunic],
    [1, C.bodyDark],
  ]);
  const bodySide = sideShade('10,9,26', 0.6, 0.7);
  const faceGrad = vertical([
    [0, C.faceLit],
    [0.55, 0xcfc5c8],
    [1, C.faceShade],
  ]);
  const faceSide = sideShade('96,88,130', 0.75, 0.6);
  const crownGrad = vertical([
    [0, C.crownLit],
    [1, C.crownDark],
  ]);
  const furGrad = vertical([
    [0, C.furLit],
    [0.5, 0x807d8c],
    [1, C.furShade],
  ]);
  const furSide = sideShade('60,60,92', 0.55, 0.7);
  const irisGrad = vertical([
    [0, 0xfffbe6],
    [1, 0xf6c66e],
  ]);
  const glow = radialGlow('rgba(255,240,200,1)', 'rgba(255,214,150,0.36)');
  const dustGlow = radialGlow('rgba(255,226,170,0.7)', 'rgba(255,206,140,0.16)');
  const haloGlow = radialGlow('rgba(255,228,180,0.2)', 'rgba(255,214,160,0.1)');
  const trailH = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: 'rgba(255,220,160,0)' },
      { offset: 1, color: 'rgba(255,228,170,0.38)' },
    ],
  });
  const trailV = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    textureSpace: 'local',
    colorStops: [
      { offset: 0, color: 'rgba(255,220,160,0)' },
      { offset: 1, color: 'rgba(255,228,170,0.36)' },
    ],
  });

  const drawWing = (g: Graphics, w: Wing, near: boolean, t: number): void => {
    g.poly(w.outline, true).fill(near ? wingGrad : farGrad);
    if (near) g.poly(w.outline, true).fill(wingSide);
    // The folded-under half: one darker plane, giving a single long crease.
    const fold: Pts = [];
    const U = 0.5;
    for (let i = 0; i <= 14; i++) fold.push(...w.at(0, (i / 14) * w.margin(0)));
    for (let i = 1; i <= 24; i++) {
      const u = (i / 24) * U;
      fold.push(...w.at(u, w.margin(u)));
    }
    for (let i = 13; i >= 1; i--) fold.push(...w.at(U, (i / 14) * w.margin(U)));
    g.poly(fold, true).fill({ color: near ? 0x120f26 : 0x0a0c1c, alpha: near ? 0.26 : 0.35 });
    // Veins.
    for (let k = 1; k < SCALLOPS; k++) {
      const u = k / SCALLOPS;
      const vein: Pts = [];
      for (let i = 2; i <= 12; i++) vein.push(...w.at(u, (i / 12) * w.margin(u) * 0.985));
      polyline(g, vein);
    }
    g.stroke({ width: 0.4, color: C.ink, alpha: 0.3, cap: 'round' });
    if (near) {
      // Pale band following the hem; it also glows faintly (see gWingGlow).
      const outer: Pts = [];
      const inner: Pts = [];
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        const m = w.margin(u);
        const fade = Math.sin(Math.PI * u) ** 0.5;
        outer.push(...w.at(u, m * 0.905));
        const p = w.at(u, m * (0.905 - 0.07 * fade));
        inner.unshift(p[0], p[1]);
      }
      const band = outer.concat(inner);
      g.poly(band, true).fill({ color: C.band, alpha: 0.26 });
      const lineAbove: Pts = [];
      for (let i = 2; i <= 38; i++) lineAbove.push(...w.at(i / 40, w.margin(i / 40) * 0.8));
      polyline(g, lineAbove).stroke({ width: 0.5, color: C.ink, alpha: 0.28 });
      const c = w.at(0.4, 0.62);
      const r1 = w.at(0.4, 0.68);
      const r0 = w.at(0.4, 0.56);
      const s1 = w.at(0.47, 0.62);
      const s0 = w.at(0.33, 0.62);
      const ax = (r1[0] - r0[0]) * 0.5;
      const ay = (r1[1] - r0[1]) * 0.5;
      const bx = (s1[0] - s0[0]) * 0.36;
      const by = (s1[1] - s0[1]) * 0.36;
      const ring = (to: Graphics, k: number, color: number, alpha: number): void => {
        const pts: Pts = [];
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          pts.push(
            c[0] + (ax * Math.cos(a) + bx * Math.sin(a)) * k,
            c[1] + (ay * Math.cos(a) + by * Math.sin(a)) * k,
          );
        }
        to.poly(pts, true).fill({ color, alpha });
      };
      ring(g, 1.25, C.ink, 0.3);
      ring(g, 1, 0xd8bd8c, 0.6);
      ring(g, 0.62, 0x100d1e, 0.9);
      ring(g, 0.22, 0xfff0c8, 0.9);
      const hem: Pts = [];
      for (let i = 0; i <= 45; i++) hem.push(...w.at(i / 45, w.margin(i / 45) * 0.985));
      // The breathing light: band, hem and eye-spot.
      const br = 0.5 + 0.5 * Math.sin(t * 1.3);
      gWingGlow.poly(band, true).fill({ color: C.gold, alpha: 0.07 + 0.09 * br });
      polyline(gWingGlow, hem).stroke({ width: 0.7, color: C.gold, alpha: 0.22 + 0.16 * br, join: 'round' });
      const rr = Math.hypot(ax, ay) * (2.6 + 0.5 * br);
      gWingGlow.circle(c[0], c[1], rr).fill({ fill: glow, alpha: 0.3 + 0.25 * br });
      ring(gWingGlow, 1, C.gold, 0.1 + 0.14 * br);
    }
    rim(g, w.outline, KEY, near ? 0.85 : 0.7, C.rim, near ? 0.44 : 0.25, 1.8);
    rim(g, w.outline, FILL, near ? 0.8 : 0.6, C.cool, near ? 0.3 : 0.16, 1.6);
  };

  const update = (t: number): void => {
    // Under the gallery's silhouette filter the light layers would smear the shape: hide them.
    const pf = view.parent?.filters;
    const lit = !(Array.isArray(pf) ? pf.length > 0 : pf);
    for (const g of lights) g.visible = lit;

    const breath = Math.sin(t * 1.55);
    const cycle = fract(t * 2.05);
    let hipX = 0;
    let hipY = P.hipY;
    let lean = P.lean;
    let nearFoot: Foot;
    let farFoot: Foot;
    // Hand targets in the upper body's frame (origin at the hip).
    let nearHand: [number, number];
    let farHand: [number, number];
    let nearGrip = false;
    const farGrip = false;
    let nearBend = -1;
    let farBend = -1;
    // The thorn hangs at the near hip; angle is the direction of the blade.
    const thornX = 4.6;
    const thornY = -7.6;
    let thornAng = 2.16;
    const hilt = (d: number): [number, number] => [
      thornX - Math.cos(thornAng) * d,
      thornY - Math.sin(thornAng) * d,
    ];
    if (pose === 'run') {
      hipX = 1;
      const foot = (ph: number): Foot => {
        if (ph < 0.36) {
          const k = ph / 0.36;
          return {
            x: hipX + lerp(10.5, -11, k),
            y: k > 0.8 ? -(k - 0.8) * 8 : 0,
            rot: lerp(-0.2, 0.1, Math.min(1, k * 3)) + smooth(Math.max(0, (k - 0.65) / 0.35)) * 0.7,
          };
        }
        const k = (ph - 0.36) / 0.64;
        return {
          x: hipX + lerp(-11, 10.5, smooth(k)) - 3 * Math.sin(Math.PI * k) * (1 - k),
          y: -1.6 - 11.5 * Math.sin(Math.PI * k ** 0.75) ** 0.9,
          rot: lerp(1.25, -0.2, smooth(k)),
        };
      };
      nearFoot = foot(cycle);
      farFoot = foot(fract(cycle + 0.5));
      hipY -= 1.5 * Math.abs(Math.sin(cycle * Math.PI * 2 + 0.9));
      lean += 0.025 * Math.sin(cycle * Math.PI * 4 + 0.6);
      thornAng = 2.3 + 0.05 * Math.sin(cycle * Math.PI * 4);
      // One hand steadies the hilt, ready to draw; the other cuts forward for balance.
      nearHand = hilt(3.6);
      nearGrip = true;
      const swing = Math.sin(cycle * Math.PI * 2);
      farHand = [13.5 + swing * 1.5, -21 + swing * 1.2];
      farBend = 1;
    } else if (pose === 'jump') {
      const drift = Math.sin(t * 1.2);
      nearFoot = { x: 10 + drift * 0.4, y: -17 + drift * 0.6, rot: 0.5 };
      farFoot = { x: -10 - drift * 0.5, y: -4, rot: 1.35 };
      hipY += drift * 0.8;
      thornAng = 1.95 + drift * 0.04;
      // Both arms reach ahead for the next hold, one high, one low.
      farHand = [14.5 + drift * 0.5, -24 + drift * 0.6];
      farBend = 1;
      nearHand = [17, -38.5 - drift * 0.6];
      nearBend = 1;
    } else {
      nearFoot = { x: 3.4, y: 0, rot: 0 };
      farFoot = { x: -2.4, y: 0, rot: 0.04 };
      hipY += breath * 0.3;
      thornAng = 2.16 + 0.012 * Math.sin(t * 0.9);
      // One hand rests on the pommel; the other hangs loose and ready.
      nearHand = hilt(7.4);
      nearHand[1] -= 1.2;
      nearGrip = true;
      farHand = [11.2 + 0.3 * Math.sin(t * 0.8), -12.6 + breath * 0.25];
    }

    gLegs.clear();
    drawLeg(gLegs, hipX - 0.8, hipY, farFoot, C.legFar, false);
    drawLeg(gLegs, hipX + 0.8, hipY, nearFoot, C.leg, true);

    upper.position.set(hipX, hipY);
    upper.rotation = lean;
    const cl = Math.cos(lean);
    const sl = Math.sin(lean);
    const toRoot = (p: readonly [number, number]): [number, number] => [
      hipX + p[0] * cl - p[1] * sl,
      hipY + p[0] * sl + p[1] * cl,
    ];

    // Wings / cloak. Breathing lifts them a hair.
    const b = breath * (pose === 'idle' ? 0.014 : 0.004);
    const near = buildWing({ ...P.near, th1: P.near.th1 - b, th0: P.near.th0 + b }, t);
    const far = buildWing({ ...P.far, th1: P.far.th1 - b, th0: P.far.th0 + b }, t);
    gFar.clear();
    gWingGlow.clear();
    drawWing(gFar, far, false, t);
    gArmFar.clear();
    drawArm(gArmFar, 4.2, -29.6, farHand[0], farHand[1], farBend, farGrip, false);
    gBody.clear();
    gBody.poly(TORSO, true).fill(bodyGrad);
    gBody.poly(TORSO, true).fill(bodySide);
    rim(gBody, TORSO, KEY, 0.9, C.rim, 0.5, 1.4);
    // Belt.
    gBody
      .moveTo(-4.2, -7.4)
      .quadraticCurveTo(1, -5.4, 6, -7.6)
      .stroke({ width: 1.3, color: 0x0f0c1c, alpha: 0.9, cap: 'round' });
    gBody
      .moveTo(1, -7.2)
      .quadraticCurveTo(4, -6.8, 6, -8.1)
      .stroke({ width: 0.35, color: C.rim, alpha: 0.5, cap: 'round' });
    drawWing(gBody, buildWing(P.hind, t), false, t);
    gNear.clear();
    drawWing(gNear, near, true, t);
    gArmNear.clear();
    drawThorn(gArmNear, thornX, thornY, thornAng);
    drawArm(gArmNear, 2.6, -29.4, nearHand[0], nearHand[1], nearBend, nearGrip, true);

    // Fur collar: a smooth core with a soft fuzz of short hairs along its edge.
    gFur.clear();
    const fur: Pts = [];
    const fn = MANTLE.length / 2;
    for (let i = 0; i < fn; i++) fur.push(v(MANTLE, i * 2), v(MANTLE, i * 2 + 1) + breath * 0.12);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = pass; i < fn; i += 2) {
        const [tx, ty] = tangent(fur, i, 1, true);
        const facing = ty * KEY.x - tx * KEY.y;
        if (facing > 0.15 !== (pass === 1)) continue;
        const len = 0.35 + 0.45 * Math.abs(Math.sin(i * 2.7));
        const x = v(fur, i * 2) - ty * 0.6;
        const y = v(fur, i * 2 + 1) + tx * 0.6;
        const dx = ty * 0.9 - 0.25;
        const dy = -tx * 0.9 + 0.3;
        gFur.moveTo(x, y).lineTo(x + dx * len, y + dy * len);
      }
      gFur.stroke({ width: 0.9, color: pass === 1 ? 0xaaa4a8 : 0x5e5d72, alpha: 0.8, cap: 'round' });
    }
    gFur.poly(fur, true).fill(furGrad);
    gFur.poly(fur, true).fill(furSide);
    rim(gFur, fur, KEY, 0.8, 0xfff1d6, 0.5, 1.5);
    rim(gFur, fur, FILL, 0.7, C.cool, 0.25, 1.5);

    // Head: chin level or lifted, never bowed.
    headC.rotation = P.head - lean + 0.02 * Math.sin(t * 0.55) + breath * 0.005;
    gHead.clear();
    gTips.clear();
    const speed = pose === 'run' ? 7 : 1.25;
    const farLine = antennaLine(ANT_FAR, t, P.antenna, speed);
    const nearLine = antennaLine(ANT_NEAR, t, P.antenna, speed);
    drawAntenna(gHead, farLine, ANT_FAR.half, false);
    gHead.poly(HEAD, true).fill(crownGrad);
    rim(gHead, HEAD, FILL, 0.8, C.cool, 0.28, 1.5);
    // Face: a soft-edged heart of pale fur. A mid-tone margin and combed hairs blend it into
    // the head fur so it is a face, not a mask.
    const fcx = 5;
    const fcy = -11.6;
    const margin: Pts = [];
    for (let i = 0; i < FACE.length; i += 2) {
      const x = v(FACE, i);
      const y = v(FACE, i + 1);
      const back = x < 9 ? 1 : 0;
      margin.push(fcx + (x - fcx) * (1 + 0.16 * back), fcy + (y - fcy) * (1 + 0.1 * back));
    }
    gHead.poly(margin, true).fill({ color: 0x6f6486, alpha: 0.4 });
    const inner: Pts = [];
    for (let i = 0; i < FACE.length; i += 2) {
      inner.push(lerp(v(FACE, i), v(margin, i), 0.45), lerp(v(FACE, i + 1), v(margin, i + 1), 0.45));
    }
    gHead.poly(inner, true).fill({ color: 0x9a90ac, alpha: 0.5 });
    gHead.poly(FACE, true).fill(faceGrad);
    gHead.poly(FACE, true).fill(faceSide);
    rim(gHead, HEAD, KEY, 0.9, C.rim, 0.6, 1.5);

    // Eyes: large clear almonds, outer corners lifted, lit from within. Slow blink.
    const bt = fract((t + (pose === 'idle' ? 2.4 : 0.9)) / 5.6) * 5.6;
    const open = 1 - Math.max(0, 1 - Math.abs(bt - 0.2) / 0.11) * 0.92;
    const almond = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      up: number,
      down: number,
      fill: number | FillGradient,
    ): void => {
      gHead
        .moveTo(ax, ay)
        .bezierCurveTo(
          lerp(ax, bx, 0.25),
          lerp(ay, by, 0.25) - up,
          lerp(ax, bx, 0.72),
          lerp(ay, by, 0.72) - up,
          bx,
          by,
        )
        .bezierCurveTo(
          lerp(ax, bx, 0.7),
          lerp(ay, by, 0.7) + down,
          lerp(ax, bx, 0.3),
          lerp(ay, by, 0.3) + down,
          ax,
          ay,
        )
        .fill(fill);
    };
    const eye = (ax: number, ay: number, bx: number, by: number, h: number, k: number): void => {
      const cx = lerp(ax, bx, 0.52);
      const cy = lerp(ay, by, 0.52);
      const u = h * open;
      // Dark lid line, heavier on top and carried a little past the outer corner.
      almond(ax - (bx - ax) * 0.12, ay - (by - ay) * 0.12 - 0.25, bx, by, u * 1.14, u * 1.02, C.eye);
      const s = 0.84;
      almond(
        lerp(cx, ax, s),
        lerp(cy, ay, s) + 0.12,
        lerp(cx, bx, s),
        lerp(cy, by, s) + 0.12,
        u * 0.86,
        u * 0.9,
        irisGrad,
      );
      if (open > 0.5) {
        gHead
          .ellipse(cx + 0.5 * k, cy + 0.1, 0.62 * k, 1.25 * k * open)
          .fill({ color: 0x2a1c22, alpha: 0.85 });
        gHead.ellipse(cx + 1.0 * k, cy - 0.75 * k, 0.5 * k, 0.4 * k).fill({ color: 0xffffff, alpha: 0.95 });
      }
      gTips.circle(cx, cy, 5.2 * k * (0.4 + 0.6 * open)).fill({ fill: glow, alpha: 0.42 });
    };
    eye(0.5, -12.6, 8.0, -11.4, 2.5, 1);
    eye(9.6, -11.4, 12.1, -12.3, 2.2, 0.66);
    drawAntenna(gHead, nearLine, ANT_NEAR.half, true);

    // Antenna tips: small bright lanterns with their own halos.
    const pulse = 0.85 + 0.15 * Math.sin(t * 1.9);
    const tips: [Pts, number][] = [
      [farLine, 0.8],
      [nearLine, 1],
    ];
    for (const [line, k] of tips) {
      const x = v(line, line.length - 2);
      const y = v(line, line.length - 1);
      gTips.circle(x, y, 7.5 * k * pulse).fill(glow);
      gTips.circle(x, y, 2.6 * k).fill({ fill: glow, alpha: 0.9 });
      gTips.circle(x, y, 0.95 * k).fill({ color: 0xfffaea, alpha: 1 });
    }

    // Halo: a soft pool of her own light behind the figure.
    gHalo.clear();
    const hc = toRoot([pose === 'jump' ? -8 : -2, -24]);
    gHalo
      .circle(hc[0], hc[1], pose === 'idle' ? 50 : 58)
      .fill({ fill: haloGlow, alpha: 0.85 + 0.15 * breath });

    // Light trails off the wing hem when moving.
    gTrail.clear();
    if (pose !== 'idle') {
      const us = [0.03, 0.3, 0.52, 0.8];
      for (let i = 0; i < us.length; i++) {
        const u = v(us, i);
        const s0 = toRoot(near.at(u, near.margin(u) * 0.98));
        const len = (pose === 'run' ? 26 : 18) * (0.7 + 0.3 * Math.sin(i * 2.3 + 1));
        const line: Pts = [];
        for (let k = 0; k <= 12; k++) {
          const q = k / 12;
          const wv = Math.sin(t * (pose === 'run' ? 6 : 2.2) - q * 4 + i * 1.7) * 1.6 * q;
          if (pose === 'run') line.push(s0[0] - len * q, s0[1] + wv - 2.5 * q);
          else line.push(s0[0] + wv - 4 * q, s0[1] - len * q);
        }
        const body = ribbon(line, (q) => 0.05 + 0.7 * (1 - q) ** 0.8);
        gTrail.poly(body, true).fill(pose === 'run' ? trailH : trailV);
      }
    }

    // Dust: rises and drifts off the hem, denser in motion.
    gDust.clear();
    const N = pose === 'run' ? 20 : pose === 'jump' ? 15 : 11;
    for (let i = 0; i < N; i++) {
      const seed = fract(Math.sin(i * 12.9898 + 4.1) * 43758.5453);
      const seed2 = fract(Math.sin(i * 78.233 + 1.7) * 12543.853);
      const q = fract(t * (0.18 + seed * 0.12) * (pose === 'run' ? 2.2 : 1) + seed2);
      const u = 0.02 + seed * 0.94;
      let [x, y] = toRoot(near.at(u, near.margin(u) * (0.75 + 0.22 * seed2)));
      const wob = Math.sin(q * 7 + i * 2.1);
      if (pose === 'run') {
        x += -52 * q + wob * 1.5;
        y += -9 * q + wob * 2.5;
      } else if (pose === 'jump') {
        x += -7 * q + wob * 2.6;
        y += -30 * q;
      } else {
        x += -7 * q + wob * 3 * q;
        y += -24 * q * (0.6 + 0.4 * seed) + 2 * Math.sin(q * 5 + i);
      }
      const a = Math.sin(Math.PI * q) ** 1.1 * (0.45 + 0.45 * seed2);
      gDust.circle(x, y, 2.0 + seed * 1.4).fill({ fill: dustGlow, alpha: a });
      gDust.circle(x, y, 0.38 + 0.22 * seed).fill({ color: 0xfff0c8, alpha: a });
    }
  };

  update(0);
  return { view, update };
}

const concept: Concept = {
  id: 'moth',
  name: 'Vesper, the moth',
  blurb:
    'A poised night-flier who carries her own light. Her cloak is her wings; two feathered antennae end in small lanterns; her eyes, wing-spot and the dust she sheds all glow the same pale gold. A slender thorn rides at her hip.',
  create,
};

export default concept;
