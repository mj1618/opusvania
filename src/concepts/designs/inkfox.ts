/**
 * Sable, the ink fox. A long-legged fox spirit made of living sumi ink: near-black indigo body with
 * brush-wisp edges, a pale porcelain half-mask with one gold eye and one gold brow line, and a
 * tail longer than the body that curls like a brush stroke in water.
 *
 * Everything is built from spline ribbons (a centreline with a width on each side) so limbs taper
 * like brush strokes and the whole figure can be re-posed every frame.
 */
import { BlurFilter, Container, FillGradient, Graphics } from 'pixi.js';
import type { Concept, ConceptInstance, ConceptPose } from '../types';

// Palette: indigo ink darks, one pale material (porcelain), one light accent (warm gold).
const INK_HI = 0x262d5a;
const INK_MID = 0x12152f;
const INK_LO = 0x07091a;
const INK_SHEEN = 0x4a5796;
const INK_BOUNCE = 0x1f6670;
const FAR_HI = 0x18294a;
const FAR_LO = 0x0b1a2c;
const RIM = 0xffcf9a;
const PORCELAIN_HI = 0xfff6e4;
const PORCELAIN = 0xe6dfd0;
const PORCELAIN_LO = 0x93aab2;
const GOLD = 0xffc257;
const GOLD_CORE = 0xfff1c4;

// Key light direction (towards the light): upper right.
const LX = 0.6;
const LY = -0.8;

const TAU = Math.PI * 2;

/** A ribbon sample: centre, half-width on the "up" side (a) and the other side (b), and normal. */
interface N {
  x: number;
  y: number;
  a: number;
  b: number;
  nx: number;
  ny: number;
}

const ZERO: N = { x: 0, y: 0, a: 0, b: 0, nx: 0, ny: -1 };

function nd(x: number, y: number, a: number, b = a): N {
  return { x, y, a, b, nx: 0, ny: -1 };
}

function nth(arr: readonly N[], i: number): N {
  return arr[Math.max(0, Math.min(arr.length - 1, i))] ?? ZERO;
}

function cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3)
  );
}

/** Fill in normals (pointing to the "a" side: up when the ribbon travels right). */
function frame(s: N[]): N[] {
  for (let i = 0; i < s.length; i++) {
    const p = nth(s, i - 1);
    const q = nth(s, i + 1);
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const c = nth(s, i);
    c.nx = dy / d;
    c.ny = -dx / d;
  }
  return s;
}

/** Catmull-Rom resample of a few hand-placed nodes into a dense, smooth ribbon. */
function resample(nodes: readonly N[], step = 1.6): N[] {
  const out: N[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const p0 = nth(nodes, i - 1);
    const p1 = nth(nodes, i);
    const p2 = nth(nodes, i + 1);
    const p3 = nth(nodes, i + 2);
    const k = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      out.push(
        nd(
          cr(p0.x, p1.x, p2.x, p3.x, t),
          cr(p0.y, p1.y, p2.y, p3.y, t),
          Math.max(0, cr(p0.a, p1.a, p2.a, p3.a, t)),
          Math.max(0, cr(p0.b, p1.b, p2.b, p3.b, t)),
        ),
      );
    }
  }
  const last = nth(nodes, nodes.length - 1);
  out.push(nd(last.x, last.y, last.a, last.b));
  return frame(out);
}

/** Outline polygon of a ribbon, with a soft rounded cap at the far end when it has width. */
function ribbon(s: readonly N[]): number[] {
  const pts: number[] = [];
  for (const p of s) pts.push(p.x + p.nx * p.a, p.y + p.ny * p.a);
  const e = nth(s, s.length - 1);
  if (e.a + e.b > 0.2) {
    const tx = -e.ny;
    const ty = e.nx;
    const r = (e.a + e.b) * 0.5;
    for (let k = 1; k <= 5; k++) {
      const phi = Math.PI / 2 - (k * Math.PI) / 6;
      const side = Math.sin(phi) * (phi > 0 ? e.a : e.b);
      const fwd = Math.cos(phi) * r * 0.9;
      pts.push(e.x + e.nx * side + tx * fwd, e.y + e.ny * side + ty * fwd);
    }
  }
  for (let i = s.length - 1; i >= 0; i--) {
    const p = nth(s, i);
    pts.push(p.x - p.nx * p.b, p.y - p.ny * p.b);
  }
  const h = nth(s, 0);
  if (h.a + h.b > 0.2) {
    const r = (h.a + h.b) * 0.5;
    for (let k = 1; k <= 5; k++) {
      const phi = -Math.PI / 2 + (k * Math.PI) / 6;
      const side = Math.sin(phi) * (phi > 0 ? h.a : h.b);
      const fwd = Math.cos(phi) * r * 0.9;
      pts.push(h.x + h.nx * side + h.ny * fwd, h.y + h.ny * side - h.nx * fwd);
    }
  }
  return pts;
}

/** A leaf/blade outline: a smooth upper edge and a smooth lower edge meeting in two sharp tips. */
function blade(
  upper: readonly (readonly [number, number])[],
  lower: readonly (readonly [number, number])[],
): number[] {
  const pts: number[] = [];
  for (const edge of [upper, lower]) {
    if (edge.length === 0) continue;
    const ns = edge.map(([x, y]) => nd(x, y, 0));
    for (const p of resample(ns, 0.8)) pts.push(p.x, p.y);
  }
  return pts;
}

/** Soft highlight along whichever side of a ribbon faces (lx, ly): three stacked translucent bands. */
function litBands(
  g: Graphics,
  s: readonly N[],
  color: number,
  alpha: number,
  lx = LX,
  ly = LY,
  depth = 0.62,
  from = 0,
  to = 1,
): void {
  const i0 = Math.floor(from * (s.length - 1));
  const i1 = Math.ceil(to * (s.length - 1));
  for (const sign of [1, -1]) {
    for (const f of [1, 0.62, 0.3]) {
      const outer: number[] = [];
      const inner: number[] = [];
      let any = false;
      for (let i = i0; i <= i1; i++) {
        const p = nth(s, i);
        const w = sign > 0 ? p.a : p.b;
        const ends = Math.min(1, (i - i0) / 4, (i1 - i) / 4);
        const lit = Math.max(0, (p.nx * lx + p.ny * ly) * sign) * ends;
        if (lit > 0.05) any = true;
        const o = w * 0.97 * sign;
        const n = (w * 0.97 - w * depth * f * lit) * sign;
        outer.push(p.x + p.nx * o, p.y + p.ny * o);
        inner.unshift(p.x + p.nx * n, p.y + p.ny * n);
      }
      if (any) g.poly(outer.concat(inner)).fill({ color, alpha });
    }
  }
}

function smooth(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}

/** Smooth interpolation through (u, value) keys. */
function keyed(keys: readonly (readonly [number, number])[], u: number): number {
  let prev = keys[0] ?? [0, 0];
  for (const k of keys) {
    if (u <= k[0]) {
      const span = k[0] - prev[0] || 1;
      return prev[1] + (k[1] - prev[1]) * smooth((u - prev[0]) / span);
    }
    prev = k;
  }
  return prev[1];
}

interface LegSpec {
  rx: number;
  ry: number;
  toeX: number;
  toeY: number;
  /** Lean of the paw segment: 0 = vertical, positive = the paw trails behind the hock/wrist. */
  phi: number;
  hind: boolean;
}

const FRONT_W = [8.2, 6.8, 4.3, 3.0, 2.0, 1.55, 0.85] as const;
const HIND_W = [12.5, 10.2, 5.8, 3.6, 2.2, 1.65, 0.9] as const;

/** Three-segment digitigrade leg: two-bone IK to the hock/wrist, then the paw segment. */
function solveLeg(l: LegSpec): N[] {
  const l1 = l.hind ? 18 : 15;
  const l2 = l.hind ? 19 : 18;
  const l3 = l.hind ? 16 : 13;
  const bend = l.hind ? 1 : -1;
  const w = l.hind ? HIND_W : FRONT_W;
  let lx = l.toeX + l3 * Math.sin(l.phi);
  let ly = l.toeY - l3 * Math.cos(l.phi);
  let dx = lx - l.rx;
  let dy = ly - l.ry;
  let d = Math.hypot(dx, dy) || 1;
  const max = (l1 + l2) * 0.992;
  const min = Math.abs(l1 - l2) + 2;
  const cl = Math.max(min, Math.min(max, d));
  if (cl !== d) {
    dx = (dx / d) * cl;
    dy = (dy / d) * cl;
    d = cl;
    lx = l.rx + dx;
    ly = l.ry + dy;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  const mx = l.rx + ux * a + uy * h * bend;
  const my = l.ry + uy * a - ux * h * bend;
  const px = -Math.sin(l.phi);
  const py = Math.cos(l.phi);
  const heelX = lx + px * (l3 - 3);
  const heelY = ly + py * (l3 - 3);
  const tipX = heelX + py * 4.4 + px * 2.0;
  const tipY = heelY - px * 4.4 + py * 2.0;
  // The hock juts back a little, the forearm swells behind the elbow: asymmetric widths.
  const back = l.hind ? 1.25 : 1.1;
  return resample(
    [
      nd(l.rx, l.ry, w[0]),
      nd(l.rx + (mx - l.rx) * 0.5, l.ry + (my - l.ry) * 0.5, w[1]),
      nd(mx, my, w[2]),
      nd((mx + lx) * 0.5, (my + ly) * 0.5, w[3] * (l.hind ? 1 : back), w[3] * (l.hind ? back : 1)),
      nd(lx, ly, w[4], w[4] * (l.hind ? 1.3 : 1)),
      nd(heelX, heelY, w[5]),
      nd(tipX, tipY, w[6]),
    ],
    1.4,
  );
}

interface Rig {
  pitch: number;
  spine: N[];
  headX: number;
  headY: number;
  headAng: number;
  legs: [LegSpec, LegSpec, LegSpec, LegSpec]; // near front, far front, near hind, far hind
  tailLen: number;
  tailAng: (u: number) => number;
  /** 0 = standing (wisps rise), 1 = moving fast (wisps sweep back and lengthen). */
  sweep: number;
}

function spineFrom(
  shx: number,
  shy: number,
  hipx: number,
  hipy: number,
  arch: number,
  headX: number,
  headY: number,
  headAng: number,
  breath: number,
): N[] {
  const c = Math.cos(headAng);
  const s = Math.sin(headAng);
  const jx = headX - 8 * c - 1 * s;
  const jy = headY - 8 * s + 1 * c;
  const nbx = shx + 6;
  const nby = shy - 15;
  return [
    nd(hipx - 14, hipy - 2.5 + arch * 2.5, 2.4, 3.2),
    nd(hipx - 3, hipy - 5.5, 7.6, 10.5),
    nd((hipx + shx) * 0.5 - 6, (hipy + shy) * 0.5 - 5 - arch * 5.5, 5.4, 6.4 + breath * 0.3),
    nd(shx - 18, shy - 7.5 - arch * 2.5, 6.6, 12.5 + breath * 0.7),
    nd(shx - 3, shy - 10 - breath * 0.25, 8.2, 17 + breath * 0.6),
    nd(nbx, nby, 7.2, 11.8 + breath * 0.3),
    nd(nbx + (jx - nbx) * 0.55 - 0.5, nby + (jy - nby) * 0.55 - 0.5, 5.8, 7.2),
    nd(jx, jy, 5.2, 5.6),
  ];
}

function solve(pose: ConceptPose, t: number): Rig {
  if (pose === 'run') {
    const p = (t * 1.65) % 1;
    const th = p * TAU;
    const g = -Math.cos(th); // +1 gathered, -1 extended
    const bob = 2.2 * Math.sin(th + 0.6);
    const shx = 25 - 2 * g;
    const shy = -40.5 + bob * 0.6;
    const hipx = -34 + 5 * g;
    const hipy = -43.5 - bob * 0.4 + 1.5 * g;
    const headX = shx + 30;
    const headY = shy - 19 + 1.3 * Math.sin(th + 1);
    const headAng = 0.1 + 0.06 * Math.sin(th + 2);
    const leg = (hind: boolean, off: number): LegSpec => {
      const a = TAU * (p + off);
      const sw = Math.max(0, -Math.sin(a));
      const cx = hind ? hipx + 5 : shx + 6;
      return {
        rx: hind ? hipx : shx,
        ry: hind ? hipy : shy,
        toeX: cx + 30 * Math.cos(a),
        toeY: -(hind ? 13 : 15) * sw,
        phi: hind ? -0.3 + 0.95 * sw : -0.12 + 1.15 * sw,
        hind,
      };
    };
    const legs: Rig['legs'] = [leg(false, 0), leg(false, 0.1), leg(true, 0.52), leg(true, 0.62)];
    legs[1].rx += 3;
    legs[3].rx += 3;
    return {
      pitch: -0.04 + 0.05 * Math.sin(th + 2.2),
      spine: spineFrom(shx, shy, hipx, hipy, g, headX, headY, headAng, 0),
      headX,
      headY,
      headAng,
      legs,
      tailLen: 112,
      tailAng: (u) =>
        Math.PI +
        keyed(
          [
            [0, 0.4],
            [0.35, -0.12],
            [0.7, 0.22],
            [1, 0.55],
          ],
          u,
        ) +
        0.36 * Math.sin(TAU * (p - 1.3 * u)) * (0.2 + 0.8 * u),
      sweep: 1,
    };
  }
  if (pose === 'jump') {
    const shx = 24;
    const shy = -42;
    const hipx = -33;
    const hipy = -44;
    const drift = Math.sin(t * 1.3);
    const headX = shx + 30;
    const headY = shy - 16;
    const headAng = 0.3 + 0.02 * drift;
    return {
      pitch: -0.15 + 0.015 * drift,
      spine: spineFrom(shx, shy, hipx, hipy, 0.75, headX, headY, headAng, 0),
      headX,
      headY,
      headAng,
      legs: [
        { rx: shx, ry: shy, toeX: shx + 6, toeY: shy + 22 + 0.6 * drift, phi: 1.3, hind: false },
        { rx: shx + 3, ry: shy, toeX: shx + 13, toeY: shy + 19, phi: 1.12, hind: false },
        { rx: hipx, ry: hipy, toeX: hipx - 44, toeY: hipy + 15 - 0.6 * drift, phi: 1.25, hind: true },
        { rx: hipx + 3, ry: hipy, toeX: hipx - 40, toeY: hipy + 21, phi: 1.1, hind: true },
      ],
      tailLen: 116,
      tailAng: (u) =>
        Math.PI +
        keyed(
          [
            [0, -0.1],
            [0.4, 0.28],
            [0.75, -0.2],
            [1, -0.62],
          ],
          u,
        ) +
        0.24 * Math.sin(t * 2.3 - u * 5.2) * (0.25 + 0.75 * u),
      sweep: 0.8,
    };
  }
  // Idle: standing alert, head a little lowered, the tail a slow scroll of ink behind.
  const breath = Math.sin(t * 1.5);
  const shx = 22;
  const shy = -43;
  const hipx = -33;
  const hipy = -45.5;
  const look = Math.sin(t * 0.43) * 0.5 + Math.sin(t * 0.27 + 1) * 0.5;
  const headX = 49 + 0.4 * look;
  const headY = -66.5 - 0.5 * Math.sin(t * 1.5 - 0.7) + 0.8 * look;
  const headAng = 0.19 + 0.05 * look;
  return {
    pitch: 0,
    spine: spineFrom(shx, shy, hipx, hipy, 0, headX, headY, headAng, breath),
    headX,
    headY,
    headAng,
    legs: [
      { rx: shx, ry: shy, toeX: 31 + 0.3 * breath, toeY: -9.5 - 0.5 * breath, phi: 0.95, hind: false },
      { rx: shx + 3, ry: shy, toeX: 25, toeY: 0, phi: -0.08, hind: false },
      { rx: hipx, ry: hipy, toeX: -35, toeY: 0, phi: -0.3, hind: true },
      { rx: hipx + 3, ry: hipy, toeX: -22, toeY: 0, phi: -0.22, hind: true },
    ],
    tailLen: 122,
    tailAng: (u) =>
      Math.PI +
      keyed(
        [
          [0, -0.55],
          [0.22, 0.0],
          [0.46, 1.25],
          [0.74, 2.5],
          [1, 4.2],
        ],
        u,
      ) +
      0.2 * Math.sin(t * 0.9 - u * 4.2) * smooth(u * 1.4) +
      0.1 * Math.sin(t * 0.53 - u * 2 + 1) +
      0.45 * Math.sin(t * 0.6 + 0.5) * u * u * u,
    sweep: 0,
  };
}

function tailWidth(u: number): number {
  const body = 7.8 * Math.sin(Math.PI * u ** 0.55) ** 0.85;
  return Math.max(body, 4.2 * (1 - u * 7));
}

/** Integrate a chain of angles into a ribbon. */
function chain(
  x0: number,
  y0: number,
  len: number,
  n: number,
  ang: (u: number) => number,
  width: (u: number) => number,
): N[] {
  const out: N[] = [];
  let x = x0;
  let y = y0;
  const ds = len / n;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push(nd(x, y, Math.max(0, width(u))));
    const a = ang(u);
    x += Math.cos(a) * ds;
    y += Math.sin(a) * ds;
  }
  return frame(out);
}

interface WispSpec {
  /** Position along the spine (0 = tail root, 1 = head). */
  f: number;
  len: number;
  w: number;
  lean: number;
  ph: number;
}

const WISPS: readonly WispSpec[] = [
  { f: 0.07, len: 22, w: 3.0, lean: 0.2, ph: 0.3 },
  { f: 0.27, len: 18, w: 2.6, lean: 0.25, ph: 3.1 },
  { f: 0.5, len: 25, w: 3.2, lean: 0.22, ph: 0.9 },
  { f: 0.68, len: 20, w: 3.0, lean: 0.3, ph: 2.6 },
  { f: 0.83, len: 16, w: 2.6, lean: 0.35, ph: 5.2 },
];

function makeInkGradient(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  hi: number,
  mid: number,
  lo: number,
) {
  return new FillGradient({
    type: 'linear',
    start: { x: x0, y: y0 },
    end: { x: x1, y: y1 },
    textureSpace: 'global',
    colorStops: [
      { offset: 0, color: hi },
      { offset: 0.5, color: mid },
      { offset: 1, color: lo },
    ],
  });
}

type Edge = readonly (readonly [number, number])[];

/** Anchor points written the way an illustrator would list them: "x y, x y, ...". */
function P(src: string): Edge {
  return src.split(',').map((pair) => {
    const [x, y] = pair.trim().split(/\s+/).map(Number);
    return [x ?? 0, y ?? 0] as const;
  });
}

// Head geometry, in head space: origin at the skull pivot, +x to the nose.
const SKULL = P(
  '30 4, 27.5 1.2, 21 -0.6, 13 -2.6, 7 -6.2, -1 -10.2, -9 -9.8, -15 -4.5, -15 3.5, -8 8.2, 4 8, 14 7, 23 6.6, 28.5 6.2, 30 4',
);
const MASK_TOP = P('25 0.6, 18 -2.2, 11.5 -4.6, 6.5 -8.6, 0 -12.3, -8 -12.2, -18.5 -10.2');
const MASK_BOTTOM = P('-18.5 -10.2, -11 -4, -3 0.6, 6 2.4, 16 2.4, 25 0.6');

function buildHead(): { head: Container; eye: Container; glow: Graphics; ear: Graphics } {
  const head = new Container();
  const shape = (g: Graphics, upper: string, lower: string, fill: number | FillGradient, alpha = 1): void => {
    const poly = blade(P(upper), P(lower));
    if (typeof fill === 'number') g.poly(poly).fill({ color: fill, alpha });
    else g.poly(poly).fill(fill);
  };

  // Far ear: cooler and paler, pushed back by atmosphere.
  const farEar = new Graphics();
  shape(
    farEar,
    '2.5 -9, 0.5 -20, -6.5 -31.5',
    '-6.5 -31.5, -6.2 -18, -5 -6',
    makeInkGradient(0, -32, -2, -6, 0x2a4a66, FAR_HI, FAR_LO),
  );
  head.addChild(farEar);

  const skull = new Graphics();
  // Cheek ruff: one brush tick sweeping back from the jaw.
  shape(skull, '-4 1, -13 5, -22.5 11.5', '-22.5 11.5, -11 10.2, 0 7.4', 0x0d1030);
  skull.poly(blade(SKULL, [])).fill(makeInkGradient(12, -12, -4, 9, INK_HI, INK_MID, INK_LO));
  // Cool bounce under the jaw.
  shape(skull, '-8 7.3, 3 7.5, 14 6.3, 26 5.5', '26 5.5, 14 5.2, 3 6, -8 7.3', INK_BOUNCE, 0.6);
  // Warm light catching the top of the bare nose.
  shape(skull, '25.5 0.9, 27.6 1.5, 29.8 3.8', '29.8 3.8, 27.3 2.4, 25.5 1.8', RIM, 0.6);
  head.addChild(skull);

  // Near ear: tall, narrow, swept back. Its own node so it can flick.
  const ear = new Graphics();
  ear.position.set(-7.5, -9);
  shape(
    ear,
    '5 -1.5, 2.4 -13, -7.5 -26.5',
    '-7.5 -26.5, -6.6 -12, -5 2.5',
    makeInkGradient(2, -26, -4, 2, 0x2b3364, INK_MID, INK_LO),
  );
  shape(ear, '4.6 -2.5, 2.2 -13, -7.2 -26', '-7.2 -26, 1.5 -13.2, 3.9 -2.8', RIM, 0.5);
  shape(ear, '1.5 -2, -0.5 -11, -5.6 -20', '-5.6 -20, -3.6 -10, -2.4 -1', 0x04050f, 0.5);
  head.addChild(ear);

  // The porcelain half-mask over brow and upper muzzle. It stops short of the nose.
  const maskPts = blade(MASK_TOP, MASK_BOTTOM);
  const shadow = new Graphics();
  shadow.poly(maskPts).fill({ color: 0x03040c, alpha: 0.65 });
  shadow.position.set(-0.4, 1);
  head.addChild(shadow);
  const mask = new Graphics();
  mask.poly(maskPts).fill(
    new FillGradient({
      type: 'linear',
      start: { x: 12, y: -12 },
      end: { x: -4, y: 4 },
      textureSpace: 'global',
      colorStops: [
        { offset: 0, color: PORCELAIN_HI },
        { offset: 0.5, color: PORCELAIN },
        { offset: 1, color: PORCELAIN_LO },
      ],
    }),
  );
  // Cool shade along the lower edge and pooling toward the back.
  shape(
    mask,
    '-18.5 -10.2, -11 -7, -3 -2.4, 6 0.2, 16 0.9, 25 0.6',
    '25 0.6, 16 2.4, 6 2.4, -3 0.6, -11 -4, -18.5 -10.2',
    0x4f7886,
    0.4,
  );
  // The one painted line: gold, from the brow down the muzzle.
  shape(
    mask,
    '-12 -10.2, -3 -10.5, 4.5 -7.6, 10.5 -3.4, 21 -0.3',
    '21 -0.3, 10.5 -2.3, 4.5 -6.3, -3 -9.3, -12 -10.2',
    0xcf8a24,
  );
  head.addChild(mask);

  // Eye: a dark slanted slit cut in the porcelain, with the gold light burning inside it.
  const eye = new Container();
  eye.position.set(2.6, -3.1);
  const slit = new Graphics();
  shape(slit, '-6.4 -3, -0.6 -2.5, 6.4 2.3', '6.4 2.3, -0.4 1.4, -6.4 -3', 0x120c1e);
  shape(slit, '-4.4 -1.9, -0.4 -1.2, 4.4 1.5', '4.4 1.5, -0.3 0.4, -4.4 -1.9', GOLD);
  shape(slit, '-2.6 -1.1, 0 -0.6, 2.6 0.6', '2.6 0.6, 0 0.05, -2.6 -1.1', GOLD_CORE);
  eye.addChild(slit);
  head.addChild(eye);

  const glow = new Graphics();
  glow.circle(0, 0, 10).fill(
    new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      textureSpace: 'local',
      colorStops: [
        { offset: 0, color: '#ffc25790' },
        { offset: 0.35, color: '#ffb04a38' },
        { offset: 1, color: '#ffb04a00' },
      ],
    }),
  );
  glow.position.set(2.6, -3);
  glow.blendMode = 'add';
  head.addChild(glow);

  return { head, eye, glow, ear };
}

function create(pose: ConceptPose): ConceptInstance {
  const view = new Container();
  const body = new Container();
  view.addChild(body);

  const haloG = new Graphics();
  const blur = new BlurFilter({ strength: 4, quality: 3 });
  haloG.filters = [blur];
  const tailG = new Graphics();
  const farG = new Graphics();
  const wispG = new Graphics();
  const inkG = new Graphics();
  const formG = new Graphics();
  const { head, eye, glow, ear } = buildHead();
  body.addChild(haloG, tailG, farG, wispG, inkG, formG, head);

  const inkGrad = makeInkGradient(30, -95, -25, 2, INK_HI, INK_MID, INK_LO);
  const tailGrad = makeInkGradient(-20, -110, -80, 0, 0x202754, INK_MID, 0x090b1e);
  const farGrad = makeInkGradient(0, -50, 0, 0, FAR_HI, FAR_LO, FAR_LO);

  const PIVOT_X = -5;
  const PIVOT_Y = -46;
  body.pivot.set(PIVOT_X, PIVOT_Y);
  body.position.set(PIVOT_X, PIVOT_Y);

  let laidOut = false;
  let worldScale = 1;
  /**
   * A quadruped with a tail longer than its body is far wider than the gallery's slots, which are
   * sized for upright figures. At the large presentation sizes the fox is drawn smaller and nudged
   * so the three poses do not overlap. At game size (zoom 1) it is true scale, only spaced out.
   */
  function layout(): void {
    const s = view.parent?.scale.x ?? 1;
    let k = 1;
    let ox = 0;
    let oy = 0;
    // Review aid: ?only=inkfox&big=idle|run|jump shows that one pose at the full gallery scale.
    const query = new URLSearchParams(location.search);
    const big = query.get('big');
    const solo = query.has('only');
    if (big && s > 5) {
      view.visible = pose === big;
      ox = pose === 'idle' ? 80 : pose === 'run' ? 10 : -70;
    } else if (s > 5) {
      k = 0.45;
      ox = pose === 'idle' ? -1 : pose === 'run' ? 17 : 12;
      oy = pose === 'jump' ? -25 : 0;
    } else if (s > 4) {
      k = 0.4;
      ox = 4;
    } else if (s > 2.7) {
      k = 0.4;
      ox = 13;
    } else if (s > 2.2) {
      k = 0.45;
      ox = 12;
    } else if (s > 1.5) {
      k = 0.6;
      ox = 8.5;
    } else if (solo) {
      ox = pose === 'idle' ? 55 : pose === 'run' ? 195 : 345;
    } else {
      // The compact card's game-size strip is 320 px wide: room for the idle and, above it, the jump.
      view.visible = pose !== 'run';
      ox = pose === 'idle' ? 38 : -16;
      oy = pose === 'jump' ? -65 : 0;
    }
    view.scale.set(k);
    view.position.set(ox, oy);
    worldScale = s * k;
    blur.strength = Math.min(10, 1.5 * worldScale);
    laidOut = true;
  }

  function update(t: number): void {
    if (!laidOut && view.parent) layout();
    const rig = solve(pose, t);
    body.rotation = rig.pitch;

    haloG.clear();
    tailG.clear();
    farG.clear();
    wispG.clear();
    inkG.clear();
    formG.clear();

    const spine = resample(rig.spine, 1.6);
    const root = nth(rig.spine, 0);

    // --- Tail: one long brush stroke, with strands that split away from it.
    const tail = chain(root.x + 3, root.y, rig.tailLen, 46, rig.tailAng, tailWidth);
    const tailPoly = ribbon(tail);
    haloG.poly(tailPoly).fill({ color: 0x0a0d24, alpha: 0.55 });
    // A paler veil that lags behind the stroke, like ink still spreading in water.
    const lag = solve(pose, t - (0.45 - 0.37 * rig.sweep));
    const veil = chain(
      root.x + 3,
      root.y,
      rig.tailLen * 1.03,
      46,
      lag.tailAng,
      (u) => tailWidth(u) * 1.3 + 2.2 * Math.sin(Math.PI * u) ** 2,
    );
    haloG.poly(ribbon(veil)).fill({ color: 0x1a2258, alpha: 0.5 });
    const strands: N[][] = [];
    const strandSpecs = [
      { u0: 0.2, side: 1, len: 0.3, w: 3.2, ph: 0.4 },
      { u0: 0.47, side: 1, len: 0.27, w: 2.8, ph: 2.2 },
      { u0: 0.66, side: -1, len: 0.2, w: 2.0, ph: 4.0 },
    ];
    for (const sp of strandSpecs) {
      const start = nth(tail, Math.round(sp.u0 * 46));
      const sx = start.x + start.nx * start.a * 0.45 * sp.side;
      const sy = start.y + start.ny * start.a * 0.45 * sp.side;
      strands.push(
        chain(
          sx,
          sy,
          rig.tailLen * sp.len * (1 + 0.35 * rig.sweep),
          18,
          (v) =>
            rig.tailAng(sp.u0 + v * sp.len) -
            sp.side * (0.08 + 1.1 * v - 0.75 * v * v) * (1 - 0.6 * rig.sweep) +
            0.38 * Math.sin(t * 1.25 - v * 4 + sp.ph) * v,
          (v) => sp.w * Math.sin(Math.PI * (0.12 + 0.88 * v) ** 0.7) ** 0.9,
        ),
      );
    }
    for (const s of strands) tailG.poly(ribbon(s)).fill({ color: 0x0c1030, alpha: 0.92 });
    tailG.poly(tailPoly).fill(tailGrad);
    // Dry-brush streaks inside the stroke.
    for (const [off, wd, al] of [
      [0.42, 0.1, 0.5],
      [-0.2, 0.07, 0.4],
      [-0.55, 0.09, 0.35],
    ] as const) {
      const streak: N[] = [];
      for (let i = 4; i <= 40; i++) {
        const p = nth(tail, i);
        const fade = Math.sin((Math.PI * (i - 4)) / 36);
        const wob = off + 0.08 * Math.sin(i * 0.5 + off * 9);
        const s = nd(p.x + p.nx * p.a * wob, p.y + p.ny * p.a * wob, p.a * wd * fade);
        s.nx = p.nx;
        s.ny = p.ny;
        streak.push(s);
      }
      tailG.poly(ribbon(streak)).fill({ color: 0x35407c, alpha: al });
    }
    litBands(tailG, tail, 0x56609a, 0.2, LX, LY, 0.5, 0.04, 0.97);
    litBands(tailG, tail, RIM, 0.2, LX, LY, 0.16, 0.06, 0.95);
    // Flecks of ink letting go of the tip.
    for (let i = 0; i < 5; i++) {
      const life = (t * 0.22 + i / 5) % 1;
      const src = nth(tail, 30 + i * 3);
      const fx = src.x + src.nx * (3 + 12 * life) - 5 * life * (1 - rig.sweep) - 26 * life * rig.sweep;
      const fy = src.y + src.ny * (3 + 12 * life) - 9 * life + 2 * Math.sin(t * 1.3 + i * 2);
      const r = 1.5 * (1 - life) * smooth(life * 5);
      if (r > 0.1) {
        tailG
          .poly(
            blade(
              [
                [fx - r * 2.2, fy + r * 0.6],
                [fx, fy - r],
                [fx + r * 1.6, fy],
              ],
              [
                [fx + r * 1.6, fy],
                [fx, fy + r * 0.8],
                [fx - r * 2.2, fy + r * 0.6],
              ],
            ),
          )
          .fill({ color: 0x0c1030, alpha: 0.85 * (1 - life) });
      }
    }

    // --- Far legs: cooler and a step paler, so the near pair reads on top.
    const legs = rig.legs.map(solveLeg);
    for (const i of [1, 3]) {
      const l = legs[i];
      if (l) farG.poly(ribbon(l)).fill(farGrad);
    }

    // --- Back wisps: the edge of the body coming apart like a wet brush.
    const wave = 1 + 0.25 * rig.sweep;
    for (const w of WISPS) {
      const p = nth(spine, Math.round(w.f * (spine.length - 1)));
      const tx = -p.ny;
      const ty = p.nx;
      const lean = w.lean * (1 - 0.6 * rig.sweep);
      const dx = -tx * Math.cos(lean) + p.nx * Math.sin(lean);
      const dy = -ty * Math.cos(lean) + p.ny * Math.sin(lean);
      const a0 = Math.atan2(dy, dx);
      // When moving, each wisp bends over to trail straight back along the direction of travel.
      let turn = Math.PI - 0.12 - rig.pitch - a0;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn)) * rig.sweep;
      const rx = p.x + p.nx * (p.a - 2.6);
      const ry = p.y + p.ny * (p.a - 2.6);
      const strand = chain(
        rx,
        ry,
        w.len * wave,
        10,
        (v) =>
          a0 +
          turn * Math.min(1, v * 1.6) +
          (0.75 * v * v - 0.15 * v) * (1 - rig.sweep) +
          0.45 * Math.sin(t * (1.6 + 2.4 * rig.sweep) - v * (2.2 + 2.6 * rig.sweep) + w.ph) * v,
        (v) => w.w * Math.sin(Math.PI * (0.3 + 0.7 * v) ** 0.8) ** 0.9,
      );
      wispG.poly(ribbon(strand)).fill({ color: 0x10143a, alpha: 0.95 });
    }
    // Feathers of ink behind the hock and the elbow.
    for (const [li, ji, len] of [
      [2, 0.66, 9],
      [0, 0.42, 7],
    ] as const) {
      const l = legs[li];
      if (!l) continue;
      const p = nth(l, Math.round(ji * (l.length - 1)));
      const a0 = Math.PI + 0.5 * (1 - rig.sweep) + rig.pitch * -1;
      wispG
        .poly(
          ribbon(
            chain(
              p.x,
              p.y,
              len * wave,
              9,
              (v) =>
                a0 + 0.9 * v * v * (1 - 0.5 * rig.sweep) + 0.4 * Math.sin(t * 1.8 - v * 2 + li + ji * 7) * v,
              (v) => 2.1 * (1 - v) ** 0.8,
            ),
          ),
        )
        .fill({ color: 0x10143a, alpha: 0.95 });
    }

    // --- Torso and near legs: warm rim underlay (offset toward the light), then the ink.
    const torsoPoly = ribbon(spine);
    const nearPolys: number[][] = [torsoPoly];
    for (const i of [0, 2]) {
      const l = legs[i];
      if (l) nearPolys.push(ribbon(l));
    }
    haloG.poly(torsoPoly).fill({ color: 0x0a0d24, alpha: 0.5 });
    for (const poly of nearPolys) inkG.poly(poly).fill(inkGrad);

    // --- Form: a soft sheen where surfaces turn to the light, teal bounce underneath.
    litBands(formG, spine, INK_SHEEN, 0.15, LX, LY, 0.6, 0.04, 0.96);
    litBands(formG, spine, INK_BOUNCE, 0.13, -0.25, 0.97, 0.26, 0.1, 0.8);
    litBands(formG, spine, RIM, 0.2, LX, LY, 0.12, 0.03, 0.97);
    for (const i of [0, 2]) {
      const l = legs[i];
      if (!l) continue;
      litBands(formG, l, INK_SHEEN, 0.08, LX, LY, 0.5, 0.15, 0.9);
      litBands(formG, l, RIM, 0.2, LX, LY, 0.14, 0.42, 0.97);
    }

    // --- Head.
    head.position.set(rig.headX, rig.headY);
    head.rotation = rig.headAng;
    const flick = Math.max(0, Math.sin(t * 0.83 + 1.2)) ** 40;
    ear.rotation = -0.03 + 0.03 * Math.sin(t * 1.1) - 0.22 * flick * Math.sin(t * 22);
    const blink = Math.max(0, Math.sin(t * 0.71 + 0.4)) ** 90;
    eye.scale.y = 1 - 0.92 * blink;
    const pulse = 0.82 + 0.18 * Math.sin(t * 1.7);
    glow.alpha = pulse * (1 - blink);
    glow.scale.set(0.92 + 0.1 * pulse);
  }

  update(0);
  return { view, update };
}

const concept: Concept = {
  id: 'inkfox',
  name: 'Sable, the ink fox',
  blurb:
    'A wary, ancient fox spirit of living sumi ink. Four long legs, a porcelain half-mask with one gold eye, and a brush-stroke tail longer than its body. (Shown smaller here: it is as tall as the others but three times as long.)',
  create,
};

export default concept;
