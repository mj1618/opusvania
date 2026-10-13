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
const RAG = [1, 0.955, 1.02, 0.93, 1.0, 0.96];

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
      s.wave * 0.75 * f * f * f * Math.sin(t * s.speed * 1.9 - f * 4.1 + u * 2 + s.phase);
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
    return (
      rag * (0.955 + 0.05 * Math.sin(Math.PI * local) ** 0.7) -
      0.08 * bump(u, 0.31, 0.016) -
      0.05 * bump(u, 0.74, 0.012)
    );
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
    hipY: -28.4,
    lean: -0.03,
    head: -0.07,
    antenna: 0,
    near: wing(-4.6, -31.5, 2.6, -30.5, 0.36, 0.04, 55, 0.8, 0.1, -0.03, 0.035, 0, 0.08, 1.6),
    far: wing(-3, -31.5, 3, -30.5, 0.58, 0.22, 51, 0.8, 0.08, -0.04, 0.04, 1.1, 0.08, 1.27),
    hind: wing(-3, -6, 2.5, -5, 0.42, 0, 15, 0.85, 0.08, -0.03, 0.03, 0.5, 0, 1.6),
  },
  run: {
    hipY: -25.6,
    lean: 0.17,
    head: -0.02,
    antenna: -0.3,
    near: wing(-4, -31, 0, -14, 1.52, 0.94, 54, 0.62, 0.1, -0.08, 0.075, 0, 0.6, 8.5),
    far: wing(-2.5, -32, 1, -21, 1.86, 1.3, 49, 0.66, 0.1, -0.06, 0.085, 1.3, 0.5, 8.5),
    hind: wing(-3.4, -9, 2.4, -3, 1.22, 0.46, 23, 0.7, 0.1, -0.06, 0.11, 0.6, 0.3, 8.5),
  },
  jump: {
    hipY: -31,
    lean: 0.12,
    head: -0.13,
    antenna: -0.42,
    near: wing(-2.8, -31.5, -1, -20, 1.84, 0.5, 55, 0.62, 0.1, -0.12, 0.045, 0, 1, 2.4),
    far: wing(-1.5, -32, 0, -24, 2.16, 1.08, 49, 0.66, 0.1, -0.1, 0.05, 0.9, 0.9, 1.9),
    hind: wing(-3.4, -12, 1.4, -2, 1.3, 0.1, 27, 0.68, 0.1, -0.1, 0.05, 0.5, 0.6, 2.4),
  },
};

// ---- motion helpers ---------------------------------------------------------------------------
const TAU = Math.PI * 2;
/** Run cadence (full cycles per second: two strides). A lope, not a sprint. */
const RUN_HZ = 1.3;
const STANCE = 0.26;

/** Height of the body arc over one stride: brief soft touch at the bottom, long float on top. */
const bob = (c: number): number => 1 - Math.abs(Math.cos(TAU * (c - STANCE / 2))) ** 1.4;

/** Catmull-Rom through evenly spaced keys, k in 0..1. */
function spline(keys: readonly number[], k: number): number {
  const n = keys.length - 1;
  const f = Math.min(n - 1e-6, Math.max(0, k * n));
  const i = Math.floor(f);
  const u = f - i;
  const p0 = v(keys, Math.max(0, i - 1));
  const p1 = v(keys, i);
  const p2 = v(keys, i + 1);
  const p3 = v(keys, Math.min(n, i + 2));
  return (
    0.5 *
    (2 * p1 +
      (p2 - p0) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
      (3 * p1 - p0 - 3 * p2 + p3) * u * u * u)
  );
}

/** A flowing chain from a root: heading a0, bending by `curl` and by wave(s) along its length. */
function strand(
  x: number,
  y: number,
  a0: number,
  len: number,
  curl: number,
  wave: (s: number) => number,
  n = 14,
): Pts {
  const out: Pts = [x, y];
  let px = x;
  let py = y;
  for (let i = 1; i <= n; i++) {
    const s = i / n;
    const a = a0 + curl * s + wave(s);
    px += (Math.cos(a) * len) / n;
    py += (Math.sin(a) * len) / n;
    out.push(px, py);
  }
  return out;
}

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

/** Centre line of two bones with a rounded joint. */
function bones(hx: number, hy: number, kx: number, ky: number, ax: number, ay: number): Pts {
  const line: Pts = [];
  for (let i = 0; i <= 5; i++) line.push(lerp(hx, kx, (i / 5) * 0.72), lerp(hy, ky, (i / 5) * 0.72));
  const k0x = lerp(hx, kx, 0.72);
  const k0y = lerp(hy, ky, 0.72);
  const k1x = lerp(kx, ax, 0.28);
  const k1y = lerp(ky, ay, 0.28);
  for (let i = 1; i < 6; i++) {
    const k = i / 6;
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

/** Hand, x along the forearm: fingers loosely together, thumb apart. `curl` droops the fingers. */
function handShape(curl: number): number[] {
  return [
    -0.3,
    -0.85,
    1.5,
    -1.15,
    3.0,
    -0.95 + curl * 0.5,
    4.3,
    -0.2 + curl * 1.5,
    4.1,
    0.55 + curl * 1.7,
    2.9,
    0.95 + curl * 0.7,
    2.2,
    1.0,
    2.4,
    1.8,
    1.8,
    2.2,
    0.8,
    1.3,
    -0.3,
    0.85,
  ];
}

function drawArm(
  g: Graphics,
  sx: number,
  sy: number,
  hx: number,
  hy: number,
  curl: number,
  near: boolean,
): void {
  const [ex, ey] = ik(sx, sy, hx, hy, UPPER_ARM, FOREARM, -1);
  const arm = ribbon(bones(sx, sy, ex, ey, hx, hy), (s) => lerp(1.5, 0.85, s) + 0.12 * bump(s, 0.5, 0.08));
  g.poly(arm, true).fill(near ? C.sleeve : C.sleeveFar);
  const fl = Math.hypot(hx - ex, hy - ey) || 1;
  const cs = (hx - ex) / fl;
  const sn = (hy - ey) / fl;
  if (near) {
    // A cloth wrap on this forearm only.
    const wrap = place([-6.2, -1.1, -0.2, -1.0, -0.2, 1.0, -6.2, 1.15], hx, hy, cs, sn);
    g.poly(wrap, true).fill(C.cuff);
    for (let i = 0; i < 3; i++) {
      const p = place([-1.6 - i * 1.6, -1.05, -2.5 - i * 1.6, 1.1], hx, hy, cs, sn);
      g.moveTo(v(p, 0), v(p, 1)).lineTo(v(p, 2), v(p, 3));
    }
    g.stroke({ width: 0.3, color: 0x5d566c, alpha: 0.7 });
    const end = strand(
      hx - cs * 5.6 - sn * 0.8,
      hy - sn * 5.6 + cs * 0.8,
      Math.atan2(sn, cs) + 2.2,
      4,
      0.5,
      () => 0,
      5,
    );
    g.poly(
      ribbon(end, (s) => 0.5 * (1 - s) + 0.1),
      true,
    ).fill(C.cuff);
  }
  const hand = place(handShape(curl), hx, hy, cs, sn, -1);
  g.poly(hand, true).fill(near ? C.hand : C.handFar);
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
/** Skull with a soft muzzle: brow, a small nose, a set mouth, a chin. */
const HEAD = shape(
  [
    0.5, -24.5, 6, -24.8, 10.6, -21.8, 11.9, -16.6, 12.2, -14.6, 12.4, -13.4, 12.8, -11.8, 13.1, -10.4, 13.8,
    -9.3, 13.7, -8.3, 13.6, -7.5, 13.0, -7.2, 12.9, -6.4, 12.8, -5.6, 12.9, -5.0, 12.4, -4.2, 11.6, -2.6, 9.4,
    -1.5, 7.2, -1.3, 3.5, 0.2, -4.6, -0.6, -8.2, -5.5, -11.6, -11.5, -8.5, -24, 0.5, -24.5,
  ],
  8,
);
/** Hairline: where the pale face fur gives way to the dark head fur (profile side is HEAD's). */
const HAIRLINE = [
  7.2, -22.4, 2.6, -22.6, -2.6, -19.6, -4.4, -14.4, -5.6, -10.6, -4.2, -6, -1, -3, 1, -1.4, 4, -1, 7.2, -1.3,
];

function buildFace(): Pts {
  // Profile from the brow down to the chin is the first six segments of HEAD after the crown.
  const out: Pts = [];
  for (let i = 0; i < HEAD.length; i += 2) {
    const x = v(HEAD, i);
    const y = v(HEAD, i + 1);
    if (x > 7.1 && y > -22.5 && y < -1.2) out.push(x - 0.15, y);
  }
  const back: Pts = [];
  const h = HAIRLINE;
  let px = v(h, 0);
  let py = v(h, 1);
  const tmp: Pts = [px, py];
  for (let i = 2; i + 5 < h.length; i += 6) {
    cubic(tmp, [px, py, v(h, i), v(h, i + 1), v(h, i + 2), v(h, i + 3), v(h, i + 4), v(h, i + 5)], 12);
    px = v(h, i + 4);
    py = v(h, i + 5);
  }
  for (let i = tmp.length - 2; i >= 0; i -= 2) back.push(v(tmp, i), v(tmp, i + 1));
  return out.concat(back);
}
const FACE = buildFace();

/** Fitted tunic: fuller chest, drawn in at the waist, open at the neck. */
const TORSO = shape([
  4.4, -32, 8.6, -29.5, 9.8, -23.5, 7.6, -15.5, 6.4, -10.5, 5.4, -5, 4.4, 1.2, 2, 3.2, -2, 3.2, -3.4, 1, -4,
  -6, -6.2, -19, -3.6, -32, -1, -33.5, 2.4, -33.5, 4.4, -32,
]);
/** Scarf: a loose wrap, high at the nape and slipping low at the throat. */
const SCARF = shape(
  [
    -5.2, -33, -2.5, -34.2, 4, -33.6, 7, -31.6, 9.4, -30, 10.2, -26.6, 8, -24.4, 5.6, -22.4, 2, -25, -0.4,
    -27.2, -2.6, -29, -4.4, -29.8, -5.6, -30.4, -6.6, -31, -6.4, -32.2, -5.2, -33,
  ],
  12,
);
interface AntennaSpec {
  /** Cubic: root, two controls, tip. */
  curve: readonly number[];
  phase: number;
  half: number;
  /** Own tempo, so the two never move together. */
  tempo: number;
}

/** Near: one long sweep back, tip lifted. Far: shorter and steeper, arcing over the crown. */
const ANT_NEAR: AntennaSpec = {
  curve: [7.4, -22.6, 4.5, -33.5, -14, -37, -35, -31],
  phase: 0,
  half: 1.9,
  tempo: 1,
};
const ANT_FAR: AntennaSpec = {
  curve: [10, -21.2, 12.5, -33, 4, -39.5, -12, -40],
  phase: 2.3,
  half: 1.6,
  tempo: 0.71,
};

function antennaLine(a: AntennaSpec, t: number, extra: number, speed: number, flow: number): Pts {
  const rx = v(a.curve, 0);
  const ry = v(a.curve, 1);
  const raw: Pts = [rx, ry];
  cubic(raw, a.curve, 40);
  const out: Pts = [];
  const n = raw.length / 2;
  const w = t * speed * a.tempo;
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    // A slow sway from the root plus a lazy S-wave travelling out to the tip.
    const ang =
      extra * s ** 1.4 +
      0.06 * s * Math.sin(w - s * 2.2 + a.phase) +
      flow * s * s * Math.sin(w * 1.37 - s * 5.4 + a.phase * 1.7) +
      0.025 * s * Math.sin(w * 0.43 + a.phase * 3);
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

/** Windswept head fur: [x, y, heading, length, half width, curl]. Back of the head, then bangs. */
const LOCKS: readonly (readonly number[])[] = [
  [-5.4, -5.4, 2.9, 7, 2.2, -0.45],
  [-7.4, -11, 3.05, 11, 3.0, -0.55],
  [-6.6, -17, 3.2, 13, 3.2, -0.65],
  [-2.6, -21.6, 3.34, 12, 2.8, -0.7],
  [2.4, -23.2, 3.46, 8, 2.0, -0.6],
];
const BANGS: readonly (readonly number[])[] = [
  [9.4, -22.2, 2.7, 6.4, 1.4, 0.45],
  [6.4, -23.4, 2.6, 7.6, 1.6, 0.6],
  [2.4, -23.2, 2.4, 6.4, 1.5, 0.7],
];
const WISPS: readonly (readonly number[])[] = [
  [-8, -17, 3.22, 16, 0.3, -0.3],
  [-1, -23.4, 3.42, 14, 0.28, -0.45],
  [-8.4, -8, 3.02, 11, 0.26, -0.15],
];

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
  const gScarf = new Graphics();
  const headC = new Container();
  const gHead = new Graphics();
  const gTips = new Graphics();
  const gDust = new Graphics();
  const lights = [gHalo, gTrail, gWingGlow, gTips, gDust];
  for (const g of lights) g.blendMode = 'add';
  headC.addChild(gHead, gTips);
  headC.position.set(2.4, -33);
  upper.addChild(gFar, gArmFar, gBody, gNear, gWingGlow, gArmNear, gScarf, headC);
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
    [0.55, 0xd2c8c8],
    [1, C.faceShade],
  ]);
  const faceSide = sideShade('96,88,130', 0.7, 0.55);
  const crownGrad = vertical([
    [0, C.crownLit],
    [1, C.crownDark],
  ]);
  const scarfGrad = vertical([
    [0, 0xc9c0b8],
    [0.55, 0x9d96a0],
    [1, 0x66637a],
  ]);
  const scarfSide = sideShade('60,60,96', 0.5, 0.7);
  const irisGrad = vertical([
    [0, 0xfff6d6],
    [1, 0xf2bd62],
  ]);
  const glow = radialGlow('rgba(255,240,200,1)', 'rgba(255,214,150,0.36)');
  const dustGlow = radialGlow('rgba(255,226,170,0.7)', 'rgba(255,206,140,0.16)');
  const haloGlow = radialGlow('rgba(255,228,180,0.2)', 'rgba(255,214,160,0.1)');
  const trail = (x1: number, y1: number): FillGradient =>
    new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: x1, y: y1 },
      textureSpace: 'local',
      colorStops: [
        { offset: 0, color: 'rgba(255,220,160,0)' },
        { offset: 1, color: 'rgba(255,228,170,0.36)' },
      ],
    });
  const trailH = trail(1, 0);
  const trailV = trail(0, 1);

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
        outer.push(...w.at(u, Math.min(m * 0.985, 0.905 * m + 0.02)));
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
          const a = (i / 20) * TAU;
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
      for (let i = 0; i <= 60; i++) hem.push(...w.at(i / 60, w.margin(i / 60) * 0.985));
      // The breathing light: band, hem and eye-spot.
      const br = 0.5 + 0.35 * Math.sin(t * 1.3) + 0.15 * Math.sin(t * 0.47 + 1);
      gWingGlow.poly(band, true).fill({ color: C.gold, alpha: 0.07 + 0.09 * br });
      polyline(gWingGlow, hem).stroke({ width: 0.7, color: C.gold, alpha: 0.22 + 0.16 * br, join: 'round' });
      const rr = Math.hypot(ax, ay) * (2.6 + 0.5 * br);
      gWingGlow.circle(c[0], c[1], rr).fill({ fill: glow, alpha: 0.3 + 0.25 * br });
      ring(gWingGlow, 1, C.gold, 0.1 + 0.14 * br);
    }
    rim(g, w.outline, KEY, near ? 0.85 : 0.7, C.rim, near ? 0.44 : 0.25, 1.8);
    rim(g, w.outline, FILL, near ? 0.8 : 0.6, C.cool, near ? 0.3 : 0.16, 1.6);
  };

  /** Run foot path for a phase in 0..1, relative to the hip in x, ground in y. */
  const runFoot = (ph: number, rise: number): Foot => {
    if (ph < STANCE) {
      // Toes brush the ground: land on the ball of the foot and roll off.
      const k = ph / STANCE;
      const rot = lerp(0.24, 0.34, k) + smooth(Math.max(0, (k - 0.45) / 0.55)) * 0.5;
      return { x: lerp(9, -9, k), y: -Math.sin(rot) * 5.4, rot };
    }
    const k = (ph - STANCE) / (1 - STANCE);
    // Trail and fold behind, swing through quickly, then reach and hang before the next touch.
    const e = k < 0.5 ? 0.5 * (2 * k) ** 1.25 : 1 - 0.5 * (2 * (1 - k)) ** 1.5;
    return {
      x: spline([-9, -15.5, -12.5, 2, 12.5, 13.6, 9], e),
      y: spline([-4, -9.5, -14, -12.5, -8, -5, -1.3], e) - rise * 0.8 * Math.sin(Math.PI * k) ** 0.6,
      rot: spline([0.84, 1.45, 1.3, 0.7, 0.2, 0.1, 0.24], e),
    };
  };

  const update = (t: number): void => {
    // Under the gallery's silhouette filter the light layers would smear the shape: hide them.
    const pf = view.parent?.filters;
    const lit = !(Array.isArray(pf) ? pf.length > 0 : pf);
    for (const g of lights) g.visible = lit;

    // Slow drifts at unrelated tempos: nothing in the idle repeats in step.
    const breathAt = (lag: number): number =>
      Math.sin((t - lag) * 1.38) * 0.8 + Math.sin((t - lag) * 0.52 + 1) * 0.2;
    const breath = breathAt(0);
    const sway = 0.6 * Math.sin(t * 0.43) + 0.4 * Math.sin(t * 0.71 + 1.3);
    const drift = 0.6 * Math.sin(t * 0.31 + 2) + 0.4 * Math.sin(t * 0.83);
    const cycle = fract(t * RUN_HZ);
    // Phase-delayed copies of the stride pulse (two per cycle) drive everything downstream.
    const pulse = (lag: number): number => bob(cycle - lag);
    const beat = (lag: number): number => Math.sin(TAU * 2 * (cycle - lag));

    let hipX = 0;
    let hipY = P.hipY;
    let lean = P.lean;
    let nearFoot: Foot;
    let farFoot: Foot;
    // Hand targets in the upper body's frame (origin at the hip).
    let nearHand: [number, number];
    let farHand: [number, number];
    let nearCurl = 0.3;
    let farCurl = 0.3;
    let shoulderY = 0;
    let headTilt = 0;
    let headDrop = 0;
    let wingLift = 0;
    let wingLiftFar = 0;
    const thornX = 4.6;
    const thornY = -7.6;
    let thornAng = 2.16;
    // Scarf tail and hair: heading (upper / head frame), wave size and tempo.
    let tailA = 1.9;
    let tailWave = 0.14;
    let tailSpeed = 1.2;
    let hairSweep = 0;
    let hairWave = 0.07;
    let hairSpeed = 1.1;
    let antFlow = 0.05;
    let antSpeed = 1.15;

    if (pose === 'run') {
      const rise = pulse(0) * 4.4;
      hipY -= rise;
      hipX = 0.6 * beat(0.06);
      nearFoot = runFoot(cycle, rise);
      farFoot = runFoot(fract(cycle + 0.5), rise);
      nearFoot.x += hipX;
      farFoot.x += hipX;
      // Chest follows the hips a moment later; head later still, and stays level.
      lean += 0.03 * beat(0.07);
      shoulderY = 0.5 * beat(0.11);
      headTilt = 0.022 * beat(0.16);
      headDrop = 0.5 * beat(0.14);
      wingLift = 0.07 * beat(0.2) + 0.03 * Math.sin(TAU * (cycle - 0.1));
      wingLiftFar = 0.08 * beat(0.27) - 0.03 * Math.sin(TAU * (cycle - 0.3));
      thornAng = 2.5 + 0.06 * beat(0.25);
      // Arms loose, trailing behind; the wrists lag the elbows, the fingers lag the wrists.
      nearHand = [-8.6 + 1.5 * beat(0.22) + 0.6 * Math.sin(TAU * (cycle - 0.3)), -13.4 + 1.5 * beat(0.34)];
      farHand = [-3.5 + 1.6 * beat(0.4) - 0.7 * Math.sin(TAU * (cycle - 0.05)), -11.6 + 1.3 * beat(0.52)];
      nearCurl = 0.45 + 0.25 * beat(0.45);
      farCurl = 0.45 + 0.25 * beat(0.6);
      tailA = 2.98;
      tailWave = 0.34;
      tailSpeed = TAU * RUN_HZ * 1.5;
      hairSweep = -0.1;
      hairWave = 0.16;
      hairSpeed = TAU * RUN_HZ;
      antFlow = 0.14;
      antSpeed = TAU * RUN_HZ * 0.75;
    } else if (pose === 'jump') {
      // A long floating arc: chest leads, legs trail loosely.
      const f1 = Math.sin(t * 1.1);
      const f2 = Math.sin(t * 0.67 + 1.4);
      hipY += f1 * 1.2;
      lean += 0.025 * Math.sin(t * 1.1 - 0.6);
      nearFoot = { x: -0.5 + f2 * 0.7, y: -5.5 + Math.sin(t * 1.1 - 0.9) * 0.9, rot: 1.0 + 0.08 * f2 };
      farFoot = { x: -9.5 - f2 * 0.6, y: -6 + Math.sin(t * 1.1 - 1.3) * 1.1, rot: 1.3 + 0.08 * f1 };
      shoulderY = 0.4 * Math.sin(t * 1.1 - 0.4);
      headTilt = 0.03 * Math.sin(t * 1.1 - 0.9);
      wingLift = 0.05 * Math.sin(t * 1.1 - 1.2) + 0.02 * f2;
      wingLiftFar = 0.06 * Math.sin(t * 1.1 - 1.7) - 0.02 * f2;
      thornAng = 2.3 + 0.05 * Math.sin(t * 1.1 - 1.5);
      nearHand = [-7 + f2 * 0.8, -15.5 + Math.sin(t * 1.1 - 1.4) * 1.2];
      farHand = [12 + f2 * 0.7, -19.5 + Math.sin(t * 1.1 - 1.0) * 1.2];
      nearCurl = 0.5;
      farCurl = 0.35;
      tailA = 3.75;
      tailWave = 0.22;
      tailSpeed = 2.6;
      hairSweep = 0.25;
      hairWave = 0.1;
      hairSpeed = 2.1;
      antFlow = 0.09;
      antSpeed = 1.9;
    } else {
      // Weight on the back leg, the near leg easy on its toes.
      hipX = -0.6 + sway * 0.45;
      hipY += breath * 0.25;
      lean += -sway * 0.012 + breathAt(0.2) * 0.006;
      nearFoot = { x: 3.4, y: -2.6, rot: 0.5 };
      farFoot = { x: -2.2, y: 0, rot: 0.02 };
      shoulderY = -breathAt(0.25) * 0.45;
      headTilt = 0.03 * drift + 0.012 * breathAt(0.5);
      wingLift = 0.02 * breathAt(0.6) + 0.025 * Math.sin(t * 0.37 + 1) + 0.012 * Math.sin(t * 0.93);
      wingLiftFar = 0.025 * breathAt(0.8) + 0.03 * Math.sin(t * 0.29 + 2.6);
      thornAng = 2.16 + 0.012 * Math.sin(t * 0.9);
      // One hand draped over the pommel, the other loose at her side.
      nearHand = [
        thornX - Math.cos(thornAng) * 8.6 - 0.4,
        thornY - Math.sin(thornAng) * 8.6 - 1.6 + shoulderY * 0.4,
      ];
      nearCurl = 0.75;
      farHand = [9.6 + 0.5 * Math.sin(t * 0.6 + 1), -11.2 + breathAt(0.5) * 0.3];
      farCurl = 0.45 + 0.1 * drift;
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

    // Wings / cloak: they trail the shoulders, each on its own delay.
    const near = buildWing(
      {
        ...P.near,
        th0: P.near.th0 + wingLift,
        th1: P.near.th1 + wingLift * 0.5,
        r0y: P.near.r0y + shoulderY,
      },
      t,
    );
    const far = buildWing(
      {
        ...P.far,
        th0: P.far.th0 + wingLiftFar,
        th1: P.far.th1 + wingLiftFar * 0.6,
        r0y: P.far.r0y + shoulderY,
      },
      t,
    );
    gFar.clear();
    gWingGlow.clear();
    drawWing(gFar, far, false, t);
    gArmFar.clear();
    drawArm(gArmFar, 4.2, -29.6 + shoulderY, farHand[0], farHand[1], farCurl, false);
    gBody.clear();
    gBody.poly(TORSO, true).fill(bodyGrad);
    gBody.poly(TORSO, true).fill(bodySide);
    rim(gBody, TORSO, KEY, 0.9, C.rim, 0.5, 1.4);
    gBody
      .moveTo(-4.2, -7.4)
      .quadraticCurveTo(1, -5.4, 6, -7.6)
      .stroke({ width: 1.3, color: 0x0f0c1c, alpha: 0.9, cap: 'round' });
    gBody
      .moveTo(1, -7.2)
      .quadraticCurveTo(4, -6.8, 6, -8.1)
      .stroke({ width: 0.35, color: C.rim, alpha: 0.5, cap: 'round' });
    drawWing(gBody, buildWing({ ...P.hind, th0: P.hind.th0 + wingLiftFar * 1.2 }, t + 0.4), false, t);
    gNear.clear();
    drawWing(gNear, near, true, t);
    gArmNear.clear();
    drawThorn(gArmNear, thornX, thornY, thornAng);
    drawArm(gArmNear, 2.6, -29.4 + shoulderY, nearHand[0], nearHand[1], nearCurl, true);

    // Scarf: a loose wrap with one long end left to the wind.
    gScarf.clear();
    const tailLine = strand(
      -5.4,
      -31 + shoulderY,
      tailA - lean * (pose === 'idle' ? 1 : 0),
      pose === 'idle' ? 22 : 30,
      pose === 'idle' ? -0.5 : 0.12,
      (s) =>
        tailWave * s * Math.sin(t * tailSpeed - s * 4.2) +
        tailWave * 0.5 * s * s * Math.sin(t * tailSpeed * 1.7 - s * 7 + 1) +
        (pose === 'idle' ? 0.1 * sway * s : 0),
      18,
    );
    const tail = ribbon(
      tailLine,
      (s) => (0.7 + 0.75 * Math.sin(Math.PI * s ** 0.7) ** 0.8) * (1 - s ** 3 * 0.9),
    );
    gScarf.poly(tail, true).fill(0x9d96a0);
    gScarf.poly(tail, true).fill({ color: 0x2c2848, alpha: 0.22 });
    polyline(gScarf, tailLine.slice(4, 30)).stroke({ width: 0.35, color: 0x57526a, alpha: 0.5 });
    rim(gScarf, tail, KEY, 0.6, 0xfff1d6, 0.6, 1.3);
    rim(gScarf, tail, FILL, 0.5, C.cool, 0.25, 1.5);
    const scarf: Pts = [];
    for (let i = 0; i < SCARF.length; i += 2) scarf.push(v(SCARF, i), v(SCARF, i + 1) + shoulderY);
    gScarf.poly(scarf, true).fill(scarfGrad);
    gScarf.poly(scarf, true).fill(scarfSide);
    gScarf
      .moveTo(-5.4, -31.4 + shoulderY)
      .bezierCurveTo(-1, -31.4 + shoulderY, 4.6, -30 + shoulderY, 7.4, -26 + shoulderY)
      .stroke({ width: 0.4, color: 0x57526a, alpha: 0.55, cap: 'round' });
    rim(gScarf, scarf, KEY, 0.7, 0xfff1d6, 0.55, 1.5);
    rim(gScarf, scarf, FILL, 0.6, C.cool, 0.25, 1.5);

    // Head: chin a little up, following the chest late.
    headC.rotation = P.head - lean + headTilt;
    headC.position.set(2.4, -33 + shoulderY * 0.7 + headDrop);
    gHead.clear();
    gTips.clear();
    const farLine = antennaLine(ANT_FAR, t, P.antenna, antSpeed, antFlow);
    const nearLine = antennaLine(ANT_NEAR, t, P.antenna, antSpeed, antFlow);
    drawAntenna(gHead, farLine, ANT_FAR.half, false);

    const lock = (d: readonly number[], i: number, color: number, lightRim: boolean): void => {
      const line = strand(
        v(d, 0),
        v(d, 1),
        v(d, 2) + hairSweep * (v(d, 2) > 2.6 ? 1 : 0.2),
        v(d, 3),
        v(d, 5),
        (s) => hairWave * s * Math.sin(t * hairSpeed * (0.8 + 0.13 * i) - s * 2.4 + i * 1.9),
        8,
      );
      const hw = v(d, 4);
      const body = ribbon(line, (s) => hw * (1 - s ** 1.5) + 0.04);
      gHead.poly(body, true).fill(color);
      if (lightRim) rim(gHead, body, KEY, 0.5, C.rim, 0.5, 1.4);
    };
    for (const [i, d] of LOCKS.entries()) lock(d, i, i % 2 ? C.crownDark : 0x241c30, true);
    for (const [i, d] of WISPS.entries()) lock(d, i + 7, 0x2c2338, false);
    gHead.poly(HEAD, true).fill(crownGrad);
    rim(gHead, HEAD, FILL, 0.8, C.cool, 0.28, 1.5);

    // Face: pale fur with a soft margin into the head fur.
    const fcx = 6;
    const fcy = -11.6;
    const margin: Pts = [];
    for (let i = 0; i < FACE.length; i += 2) {
      const x = v(FACE, i);
      const y = v(FACE, i + 1);
      const back = x < 9 ? 1 : 0;
      margin.push(fcx + (x - fcx) * (1 + 0.12 * back), fcy + (y - fcy) * (1 + 0.05 * back));
    }
    gHead.poly(margin, true).fill({ color: 0x80759a, alpha: 0.5 });
    // Cheek fluff: breaks the jaw line.
    const cheek = [
      [-3.6, -7.4, 2.75, 5.2, 1.9, 0.35],
      [-2, -4.6, 2.6, 3.6, 1.4, 0.35],
    ];
    for (const [i, d] of cheek.entries()) lock(d, i + 12, i === 0 ? 0xa39bb4 : 0xb3aabd, false);
    gHead.poly(FACE, true).fill(faceGrad);
    gHead.poly(FACE, true).fill(faceSide);
    // Form: shadow in the eye socket under the brow, and under the cheek along the jaw.
    gHead
      .moveTo(-0.6, -14.2)
      .bezierCurveTo(2.5, -16.4, 7.5, -15.6, 9.2, -13.2)
      .bezierCurveTo(10.6, -14.6, 12, -14.6, 12.3, -13.6)
      .bezierCurveTo(12, -11.4, 10.4, -10.2, 9.2, -10.6)
      .bezierCurveTo(6, -8.6, 1.4, -9.2, -0.6, -14.2)
      .fill({ color: 0x8f86a8, alpha: 0.13 });
    gHead
      .moveTo(-3.8, -7)
      .bezierCurveTo(0, -3.6, 6, -3, 11.8, -4.4)
      .bezierCurveTo(9.4, -1.2, 5, -0.6, 1, -1.6)
      .bezierCurveTo(-1.6, -2.8, -3.2, -4.8, -3.8, -7)
      .fill({ color: 0x8a80a6, alpha: 0.32 });
    // Nose: a small soft plane and its shadow. Mouth: a short level line, set at the corner.
    gHead
      .moveTo(12.3, -11.2)
      .bezierCurveTo(12.7, -9.8, 13.1, -9, 13.5, -8.5)
      .bezierCurveTo(13.2, -8.6, 12.3, -9.2, 12.3, -11.2)
      .fill({ color: 0xfff4e4, alpha: 0.5 });
    gHead
      .moveTo(13.5, -7.7)
      .bezierCurveTo(13.2, -7.2, 12.2, -7.4, 11.6, -8.2)
      .stroke({ width: 0.5, color: 0x6c6284, alpha: 0.8, cap: 'round' });
    gHead
      .moveTo(12.7, -5.2)
      .bezierCurveTo(11.6, -5.1, 10.6, -5.2, 9.7, -5.6)
      .stroke({ width: 0.45, color: 0x574c6c, alpha: 0.9, cap: 'round' });
    gHead
      .moveTo(9.7, -5.6)
      .lineTo(9.4, -5.1)
      .stroke({ width: 0.4, color: 0x574c6c, alpha: 0.6, cap: 'round' });
    for (const [i, d] of BANGS.entries()) lock(d, i + 16, i === 1 ? 0x2a2136 : C.crownLit, true);
    rim(gHead, HEAD, KEY, 0.9, C.rim, 0.6, 1.5);

    // Eyes: clear gold almonds under an easy upper lid. No liner. Slow, irregular blink.
    const bt = fract((t + (pose === 'idle' ? 2.4 : 0.9)) / 6.3) * 6.3;
    const blink = Math.max(0, 1 - Math.abs(bt - 0.2) / 0.12, 1 - Math.abs(bt - 3.9) / 0.1);
    const ease = 0.15 + 0.03 * drift;
    const eye = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      up: number,
      down: number,
      k: number,
    ): void => {
      const curve = (from: boolean, off: number): void => {
        const [x0, y0, x1, y1] = from ? [ax, ay, bx, by] : [bx, by, ax, ay];
        const a = from ? 0.28 : 0.3;
        const b = from ? 0.72 : 0.7;
        gHead.bezierCurveTo(
          lerp(x0, x1, a),
          lerp(y0, y1, a) + off,
          lerp(x0, x1, b),
          lerp(y0, y1, b) + off,
          x1,
          y1,
        );
      };
      const cx = lerp(ax, bx, 0.52);
      const cy = lerp(ay, by, 0.52);
      gHead.moveTo(ax, ay);
      curve(true, -up);
      curve(false, down);
      gHead.fill(irisGrad);
      gHead.ellipse(cx + 0.55 * k, cy + 0.15, 0.8 * k, 1.05 * k).fill({ color: 0x3a2622, alpha: 0.9 });
      // Upper lid: face-coloured, resting part-way down; it closes for the blink.
      const lid = lerp(-up * (1 - ease * 2), down * 1.05, blink);
      gHead.moveTo(ax - 0.3, ay);
      curve(true, -up * 1.25);
      curve(false, lid);
      gHead.fill(0xdbd1cd);
      gHead.moveTo(bx, by);
      curve(false, lid);
      gHead.stroke({ width: 0.5, color: 0x4a3f5c, alpha: 0.95, cap: 'round' });
      if (blink < 0.5)
        gHead.ellipse(cx + 1.0 * k, cy + 0.05, 0.42 * k, 0.36 * k).fill({ color: 0xffffff, alpha: 0.95 });
      gTips.circle(cx, cy, 4.2 * k * (1 - 0.6 * blink)).fill({ fill: glow, alpha: 0.36 });
    };
    eye(1.2, -12.3, 7.8, -11.3, 2.6, 1.7, 1);
    eye(9.9, -11.3, 12.2, -11.9, 2.2, 1.5, 0.66);
    // Brows: soft tapered marks of darker fur, level and unworried.
    const brow = (x0: number, y0: number, x1: number, y1: number, arch: number, w: number): void => {
      const line: Pts = [];
      for (let i = 0; i <= 8; i++) {
        const k = i / 8;
        line.push(lerp(x0, x1, k), lerp(y0, y1, k) - arch * Math.sin(Math.PI * k) + 0.25 * drift * (k - 0.5));
      }
      gHead
        .poly(
          ribbon(line, (s) => w * (0.35 + 0.65 * Math.sin(Math.PI * s ** 0.8))),
          true,
        )
        .fill({ color: 0x6a5f80, alpha: 0.9 });
    };
    brow(0.4, -15.3, 7.9, -14.5, 0.9, 0.55);
    brow(9.7, -14.4, 12.2, -14.9, 0.4, 0.4);
    drawAntenna(gHead, nearLine, ANT_NEAR.half, true);

    // Antenna tips: small bright lanterns with their own halos.
    const tips: [Pts, number, number][] = [
      [farLine, 0.8, 1.3],
      [nearLine, 1, 0],
    ];
    for (const [line, k, ph] of tips) {
      const x = v(line, line.length - 2);
      const y = v(line, line.length - 1);
      const glimmer = 0.85 + 0.1 * Math.sin(t * 1.9 + ph) + 0.05 * Math.sin(t * 3.1 + ph * 2);
      gTips.circle(x, y, 7.5 * k * glimmer).fill(glow);
      gTips.circle(x, y, 2.6 * k).fill({ fill: glow, alpha: 0.9 });
      gTips.circle(x, y, 0.95 * k).fill({ color: 0xfffaea, alpha: 1 });
    }

    // Halo: a soft pool of her own light behind the figure.
    gHalo.clear();
    const hc = toRoot([pose === 'jump' ? -8 : -2, -24]);
    gHalo
      .circle(hc[0], hc[1], pose === 'idle' ? 50 : 58)
      .fill({ fill: haloGlow, alpha: 0.85 + 0.15 * breathAt(0.4) });

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
          const wv = Math.sin(t * (pose === 'run' ? 5 : 2.2) - q * 4 + i * 1.7) * 1.6 * q;
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
    'A night-flier who carries her own light and is in no hurry. Her cloak is her wings; two feathered antennae end in small lanterns; her eyes, wing-spot and the dust she sheds glow the same pale gold. A loose scarf, windswept fur, a slender thorn at her hip.',
  create,
};

export default concept;
