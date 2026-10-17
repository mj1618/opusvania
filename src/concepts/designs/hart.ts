/**
 * Hart, the antlered warden. A lean dark figure under a shaggy moss mantle, wearing a long pale
 * deer-skull mask crowned with branching, twig-like antlers that carry a few cyan buds.
 * Everything is redrawn each frame from a small pose solve (legs by IK, mantle as swaying strands).
 */
import { Container, FillGradient, Graphics } from 'pixi.js';
import type { Concept, ConceptInstance, ConceptPose } from '../types';

interface P {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;
const DOWN = Math.PI / 2;

const C = {
  bodyDark: 0x13111e,
  bodyMid: 0x231d2c,
  bodyLit: 0x4a3a36,
  farLimb: 0x1a2836,
  hoof: 0x0c0b14,
  rim: 0xffc890,
  bone: 0xefe4c8,
  boneWarm: 0xfff3d6,
  boneShade: 0x8ea6a4,
  boneDeep: 0x55707a,
  socket: 0x070a14,
  antler: 0xb9aa8c,
  antlerBase: 0x4a3b36,
  antlerFar: 0x4f6a6a,
  mossDeep: 0x0f211f,
  mossDark: 0x1b352e,
  mossMid: 0x355443,
  mossLit: 0x56775a,
  lichen: 0x9db49c,
  glow: 0x9ff3ff,
  glowCore: 0xeaffff,
};

function grad(x0: number, y0: number, x1: number, y1: number, stops: [number, number][]): FillGradient {
  const g = new FillGradient({
    type: 'linear',
    start: { x: x0, y: y0 },
    end: { x: x1, y: y1 },
    textureSpace: 'local',
  });
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

// Shared gradients (local texture space: 0..1 across each shape's bounds). Lit side is upper right.
const G = {
  body: grad(1, 0, 0, 1, [
    [0, C.bodyLit],
    [0.35, C.bodyMid],
    [1, C.bodyDark],
  ]),
  leg: grad(1, 0, 0, 0.6, [
    [0, 0x6a5242],
    [0.4, C.bodyMid],
    [1, C.bodyDark],
  ]),
  skull: grad(0.5, 0, 0.5, 1, [
    [0, C.boneWarm],
    [0.5, C.bone],
    [0.85, C.boneShade],
    [1, C.boneDeep],
  ]),
  antler: grad(0.5, 1, 0.6, 0, [
    [0, 0x3d302e],
    [0.5, 0x85765f],
    [1, 0xcfc3a4],
  ]),
  mass: grad(0.9, 0, 0.2, 1, [
    [0, 0x3a5a46],
    [0.55, 0x1f3a31],
    [1, 0x13271f],
  ]),
  strandLow: grad(0.5, 0, 0.5, 1, [
    [0, C.mossDeep],
    [1, 0x2a4a3c],
  ]),
  strandMid: grad(0.5, 0, 0.5, 1, [
    [0, C.mossDark],
    [1, 0x456a56],
  ]),
  strandTop: grad(0.5, 0, 0.5, 1, [
    [0, 0x2f4e3e],
    [0.55, C.mossLit],
    [1, C.lichen],
  ]),
};

const at = <T>(a: readonly T[], i: number): T => a[i] as T;
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth = (k: number): number => k * k * (3 - 2 * k);
const pt = (x: number, y: number): P => ({ x, y });
const polar = (o: P, a: number, l: number): P => ({ x: o.x + Math.cos(a) * l, y: o.y + Math.sin(a) * l });
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Closed Catmull-Rom spline through the points, as beziers. */
function blob(g: Graphics, p: P[], tension = 0.5): void {
  const n = p.length;
  const k = tension / 3;
  g.moveTo(at(p, 0).x, at(p, 0).y);
  for (let i = 0; i < n; i++) {
    const a = at(p, (i + n - 1) % n);
    const b = at(p, i);
    const c = at(p, (i + 1) % n);
    const d = at(p, (i + 2) % n);
    g.bezierCurveTo(
      b.x + (c.x - a.x) * k * 2,
      b.y + (c.y - a.y) * k * 2,
      c.x - (d.x - b.x) * k * 2,
      c.y - (d.y - b.y) * k * 2,
      c.x,
      c.y,
    );
  }
  g.closePath();
}

/** Outline of a tapered limb following a spine with a half-width at each point. */
function ribbonPts(spine: P[], w: number[]): P[] {
  const n = spine.length;
  const left: P[] = [];
  const right: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = at(spine, Math.max(0, i - 1));
    const b = at(spine, Math.min(n - 1, i + 1));
    const c = at(spine, i);
    const wi = at(w, i);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    left.push(pt(c.x + nx * wi, c.y + ny * wi));
    right.push(pt(c.x - nx * wi, c.y - ny * wi));
  }
  if (at(w, n - 1) < 0.2) right.pop();
  return left.concat(right.reverse());
}

function ribbon(g: Graphics, spine: P[], w: number[], tension = 0.5): void {
  blob(g, ribbonPts(spine, w), tension);
}

/** Open smooth curve through points (for rim strokes). */
function curve(g: Graphics, p: P[]): void {
  g.moveTo(at(p, 0).x, at(p, 0).y);
  for (let i = 0; i < p.length - 1; i++) {
    const a = at(p, Math.max(0, i - 1));
    const b = at(p, i);
    const c = at(p, i + 1);
    const d = at(p, Math.min(p.length - 1, i + 2));
    g.bezierCurveTo(
      b.x + (c.x - a.x) / 6,
      b.y + (c.y - a.y) / 6,
      c.x - (d.x - b.x) / 6,
      c.y - (d.y - b.y) / 6,
      c.x,
      c.y,
    );
  }
}

function ik(a: P, c: P, l1: number, l2: number, sign: number): P {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const ang = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  return polar(a, Math.atan2(dy, dx) + ang * sign, l1);
}

interface Leg {
  hip: P;
  knee: P;
  hock: P;
  fet: P;
  tip: P;
}

const THIGH = 13.5;
const SHIN = 14.5;
const CANNON = 12.5;
const HOOF = 4.6;

function solveLeg(hip: P, tip: P, cannonA: number, hoofA: number): Leg {
  const fet = polar(tip, hoofA + Math.PI, HOOF);
  let hock = polar(fet, cannonA + Math.PI, CANNON);
  // Keep the hock within reach of the hip.
  const dx = hock.x - hip.x;
  const dy = hock.y - hip.y;
  const d = Math.hypot(dx, dy);
  const max = THIGH + SHIN - 0.4;
  if (d > max) hock = pt(hip.x + (dx / d) * max, hip.y + (dy / d) * max);
  const knee = ik(hip, hock, THIGH, SHIN, -1);
  return { hip, knee, hock, fet, tip };
}

interface Pose {
  hip: P;
  lean: number;
  neck: number;
  head: number;
  near: Leg;
  far: Leg;
  armNear: [number, number];
  armFar: [number, number];
  /** 0 hanging, 1 streaming behind. */
  flow: number;
  /** 0 hanging, 1 lifted by the fall. */
  lift: number;
  flutter: number;
  breath: number;
}

function runLeg(hip: P, u: number): Leg {
  const stance = 0.42;
  if (u < stance) {
    const s = u / stance;
    const x = lerp(13, -15, s);
    return solveLeg(hip, pt(hip.x + x, 0), lerp(1.2, 2.0, s), lerp(1.0, 1.85, s));
  }
  const s = (u - stance) / (1 - stance);
  const e = smooth(s);
  const x = lerp(-15, 13, e);
  const y = -(Math.sin(Math.PI * s) * 9 + Math.sin(Math.PI * Math.min(1, s * 1.8)) * 5 * (1 - s));
  const cannon = lerp(2.0, 1.2, e) + Math.sin(Math.PI * s) ** 0.8 * 1.0;
  const hoof = lerp(1.85, 1.0, e) + Math.sin(Math.PI * s) * 1.1;
  return solveLeg(hip, pt(hip.x + x, y), cannon, hoof);
}

function solve(pose: ConceptPose, t: number): Pose {
  if (pose === 'run') {
    const ph = (t * 1.45) % 1;
    const bob = Math.cos(ph * TAU * 2);
    const hip = pt(-2, -34 + bob * 1.4);
    const sw = Math.sin(ph * TAU);
    return {
      hip,
      lean: 0.4 + bob * 0.015,
      neck: 0.8,
      head: 0.16 + bob * 0.02,
      near: runLeg(hip, ph),
      far: runLeg(pt(hip.x + 1.5, hip.y), (ph + 0.5) % 1),
      armNear: [DOWN + 0.95 + sw * 0.16, DOWN + 0.8 + sw * 0.22],
      armFar: [DOWN + 0.95 - sw * 0.16, DOWN + 0.8 - sw * 0.22],
      flow: 1,
      lift: 0,
      flutter: 1,
      breath: 0,
    };
  }
  if (pose === 'jump') {
    const s = Math.sin(t * 1.3);
    const hip = pt(-2, -35 + s * 0.8);
    return {
      hip,
      lean: 0.2,
      neck: 0.55,
      head: 0.2 + s * 0.02,
      near: solveLeg(hip, pt(hip.x - 5 + s * 0.6, hip.y + 26.5), 2.25, 2.65),
      far: solveLeg(pt(hip.x + 1.5, hip.y), pt(hip.x - 15, hip.y + 28 - s), 2.12, 2.45),
      armNear: [DOWN + 0.95 + s * 0.05, DOWN + 0.5 + s * 0.06],
      armFar: [DOWN + 0.55, DOWN + 0.05 - s * 0.05],
      flow: 0.35,
      lift: 1,
      flutter: 0.55,
      breath: 0,
    };
  }
  const b = Math.sin(t * 1.25);
  const sway = Math.sin(t * 0.37);
  const hip = pt(-3 + sway * 0.4, -38 + b * 0.25);
  return {
    hip,
    lean: 0.2 + sway * 0.012,
    neck: 0.5,
    head: 0.07 + Math.sin(t * 0.43 + 1) * 0.05,
    near: solveLeg(hip, pt(2, 0), 1.3, 1.1),
    far: solveLeg(pt(hip.x + 1.5, hip.y), pt(-7, 0), 1.42, 1.15),
    armNear: [DOWN + 0.2, DOWN - 0.22 + b * 0.015],
    armFar: [DOWN + 0.05, DOWN - 0.32 - b * 0.015],
    flow: 0,
    lift: 0,
    flutter: 0.12,
    breath: b,
  };
}

function drawLeg(g: Graphics, leg: Leg, far: boolean): void {
  const { hip, knee, hock, fet, tip } = leg;
  const hipTop = pt(hip.x - 1, hip.y - 2.5);
  const spine = [hipTop, pt(lerp(hip.x, knee.x, 0.45) - 0.6, lerp(hip.y, knee.y, 0.45)), knee];
  const shinMid = pt(lerp(knee.x, hock.x, 0.5) + 0.5, lerp(knee.y, hock.y, 0.5));
  const all = [...spine, shinMid, hock, pt(lerp(hock.x, fet.x, 0.55), lerp(hock.y, fet.y, 0.55)), fet];
  ribbon(g, all, [3.8, 4.3, 2.8, 2.4, 1.7, 1.15, 1.25], 0.55);
  g.fill(far ? C.farLimb : G.leg);
  // Cloven hoof: a small dark wedge, split at the toe.
  const dx = (tip.x - fet.x) / HOOF;
  const dy = (tip.y - fet.y) / HOOF;
  const nx = -dy;
  const ny = dx;
  const at = (along: number, side: number): P =>
    pt(fet.x + dx * along + nx * side, fet.y + dy * along + ny * side);
  const hp = [
    at(-0.6, 1.3),
    at(2.4, 2.1),
    at(4.9, 1.3),
    at(3.9, 0.15),
    at(4.7, -1.5),
    at(2.2, -1.9),
    at(-0.6, -1.3),
  ];
  g.poly(hp.flatMap((p) => [p.x, p.y])).fill(far ? 0x0b121c : C.hoof);
  if (!far) {
    // Warm rim down the leading edge of shin and cannon, and a glint on the hoof.
    curve(g, [
      pt(knee.x + 2.4, knee.y - 1.5),
      pt(knee.x + 2.2, knee.y + 1.5),
      pt(shinMid.x + 2.2, shinMid.y),
    ]);
    g.stroke({ width: 0.5, color: C.rim, alpha: 0.38, cap: 'round' });
    curve(g, [
      pt(hock.x + 1.6, hock.y + 1),
      pt(lerp(hock.x, fet.x, 0.5) + 1.2, lerp(hock.y, fet.y, 0.5)),
      at(0, -1.2),
    ]);
    g.stroke({ width: 0.45, color: C.rim, alpha: 0.28, cap: 'round' });
    g.moveTo(at(0.4, -1.5).x, at(0.4, -1.5).y)
      .lineTo(at(3.6, -1.6).x, at(3.6, -1.6).y)
      .stroke({ width: 0.5, color: 0x8fb0b0, alpha: 0.5, cap: 'round' });
  }
}

function drawArm(g: Graphics, sh: P, a: [number, number], far: boolean): void {
  const el = polar(sh, a[0], 11.5);
  const wr = polar(el, a[1], 16);
  const handA = a[1] + 0.12;
  const kn = polar(wr, handA, 2.6);
  ribbon(
    g,
    [
      sh,
      pt(lerp(sh.x, el.x, 0.5), lerp(sh.y, el.y, 0.5)),
      el,
      pt(lerp(el.x, wr.x, 0.5), lerp(el.y, wr.y, 0.5)),
      wr,
      kn,
    ],
    [2.4, 2.0, 1.55, 1.35, 0.95, 1.2],
  );
  g.fill(far ? C.farLimb : G.body);
  // Three long thin fingers.
  for (let i = 0; i < 3; i++) {
    const fa = handA + (i - 1) * 0.3 + 0.08;
    const mid = polar(kn, fa, 2.6);
    const end = polar(mid, fa + 0.35, 2.4 - Math.abs(i - 1) * 0.5);
    ribbon(g, [kn, mid, end], [0.55, 0.42, 0.05]);
    g.fill(far ? C.farLimb : C.bodyMid);
  }
  if (!far) {
    const off = pt(Math.cos(a[1] - DOWN) * 1.1, Math.sin(a[1] - DOWN) * 1.1);
    g.moveTo(el.x + off.x * 1.3, el.y + off.y * 1.3)
      .lineTo(wr.x + off.x * 0.8, wr.y + off.y * 0.8)
      .stroke({ width: 0.45, color: C.rim, alpha: 0.35, cap: 'round' });
  }
}

interface Tine {
  spine: P[];
  w: number;
  bud?: boolean;
  broken?: boolean;
}

// Head-local space: pivot at the back base of the skull, +x forward along the muzzle.
const NEAR_ANTLER: Tine[] = [
  {
    spine: [pt(-1, -15), pt(-6, -21.5), pt(-12.5, -27.5), pt(-16.5, -34.5), pt(-15, -40.5), pt(-10, -44)],
    w: 1.55,
    bud: true,
  },
  { spine: [pt(-3.5, -19), pt(1.5, -24), pt(7, -27.5), pt(10, -32.5)], w: 0.9, bud: true },
  { spine: [pt(-10.5, -25.5), pt(-5.5, -30.5), pt(-2.5, -36), pt(-2, -41)], w: 0.85 },
  { spine: [pt(-15, -31), pt(-20.5, -33.5), pt(-25, -38), pt(-26, -43)], w: 0.85, bud: true },
  { spine: [pt(-16.3, -37.5), pt(-20, -41.5), pt(-20.5, -45.5)], w: 0.6 },
  { spine: [pt(-20.5, -33.6), pt(-24.5, -32.6), pt(-28.5, -34)], w: 0.5 },
  { spine: [pt(5, -26.3), pt(8.2, -24.6), pt(11.8, -24.8)], w: 0.48 },
];
const FAR_ANTLER: Tine[] = [
  { spine: [pt(4, -15.5), pt(4, -23), pt(6.5, -30), pt(8, -35)], w: 1.3, broken: true },
  { spine: [pt(4.3, -21), pt(9.5, -24), pt(14.5, -29), pt(16, -34.5)], w: 0.8, bud: true },
  { spine: [pt(6, -29), pt(2.8, -33.5), pt(2.4, -38)], w: 0.45 },
];

function drawAntler(g: Graphics, tines: Tine[], far: boolean): void {
  for (const tn of tines) {
    const n = tn.spine.length;
    const w = tn.spine.map((_, i) => {
      const k = i / (n - 1);
      return tn.broken ? tn.w * lerp(1, 0.62, k) : Math.max(0.05, tn.w * (1 - k) ** 0.75);
    });
    if (tn.broken) {
      // Snapped beam: a jagged splintered end rather than a taper.
      const pts = ribbonPts(tn.spine, w);
      const end = at(tn.spine, n - 1);
      pts.splice(
        n,
        0,
        pt(end.x - 0.4, end.y - 2.6),
        pt(end.x + 0.3, end.y - 0.4),
        pt(end.x + 1.3, end.y - 1.7),
      );
      blob(g, pts, 0.35);
    } else ribbon(g, tn.spine, w);
    g.fill(far ? C.antlerFar : G.antler);
  }
  if (far) return;
  // Warm rim on the forward (lit) edge of the main beam and brow tine.
  curve(g, [pt(-0.2, -16), pt(-5, -22.2), pt(-11.6, -28.2), pt(-15.4, -34.8), pt(-14, -40)]);
  g.stroke({ width: 0.4, color: 0xfff0cc, alpha: 0.6, cap: 'round' });
  curve(g, [pt(-2.6, -19.6), pt(1.9, -24.6), pt(7, -28)]);
  g.stroke({ width: 0.3, color: 0xfff0cc, alpha: 0.5, cap: 'round' });
}

function drawSkull(g: Graphics): void {
  // Dark throat under the mask, so the bone reads as worn over a face.
  g.moveTo(-6.5, -3)
    .bezierCurveTo(-6, 5.5, 3, 8.5, 11, 3.5)
    .bezierCurveTo(8, 0, 2, -3, -6.5, -3)
    .fill(C.bodyDark);
  // Slender lower jaw, closed, tucked under the muzzle.
  g.moveTo(-3, 1)
    .bezierCurveTo(-3.6, 5, -1, 7.6, 3, 7.4)
    .bezierCurveTo(10, 6.8, 20, 4.6, 29.4, 3.3)
    .bezierCurveTo(30.6, 3, 30.4, 1.6, 29, 1.2)
    .bezierCurveTo(20, 0.6, 10, 1, -3, 1)
    .fill(C.boneShade);
  g.moveTo(-7, 1)
    .bezierCurveTo(-10, -5.5, -8, -14, -1.5, -16.5)
    .bezierCurveTo(3.5, -18.2, 8.5, -16, 11.5, -12.6)
    .bezierCurveTo(15.5, -7.5, 23, -5, 30.4, -3.9)
    .bezierCurveTo(32.8, -3.5, 34.2, -1.6, 33.6, 0)
    .bezierCurveTo(33.2, 1.1, 32, 1.4, 30.6, 1.3)
    .bezierCurveTo(27, 1.2, 23.5, 0.6, 19, 0.8)
    .bezierCurveTo(15.2, 1.1, 13.6, 4.4, 10, 4.8)
    .bezierCurveTo(6.6, 5.1, 4.8, 3, 2, 3.4)
    .bezierCurveTo(-1.4, 4, -4.6, 5, -7, 1)
    .fill(G.skull);
  // Cool shadow at the back of the cranium, where the mantle and antlers shade it.
  g.moveTo(-7, 1)
    .bezierCurveTo(-10, -5.5, -8, -14, -1.5, -16.5)
    .bezierCurveTo(-4.8, -11.5, -5, -4, -1.4, 3.9)
    .bezierCurveTo(-4, 4.4, -5.8, 3, -7, 1)
    .fill({ color: 0x5a7880, alpha: 0.38 });
  // Shadow pooling under the cheekbone.
  g.moveTo(-1, 0.4)
    .bezierCurveTo(3, -0.8, 6.5, 0.2, 9, 1.6)
    .bezierCurveTo(11, 2.6, 13, 1.8, 15.6, 0.9)
    .bezierCurveTo(13.6, 3.9, 11.4, 4.6, 9.8, 4.7)
    .bezierCurveTo(6.6, 4.9, 4.8, 2.9, 2, 3.3)
    .bezierCurveTo(0.6, 3.5, -0.6, 2.6, -1, 0.4)
    .fill({ color: 0x4f6c74, alpha: 0.5 });
  // Orbit: a deep slanted hollow under a heavy brow.
  g.moveTo(1.8, -9.6)
    .bezierCurveTo(2.6, -13, 7.6, -12.6, 9, -9.4)
    .bezierCurveTo(9.6, -7.8, 10.2, -6.8, 10.9, -6)
    .bezierCurveTo(8.4, -4.9, 3, -5, 1.8, -9.6)
    .fill(C.socket);
  g.moveTo(1.2, -10.6)
    .bezierCurveTo(2.6, -14.2, 8.2, -13.8, 9.8, -10)
    .stroke({ width: 0.45, color: 0x7b9494, alpha: 0.5, cap: 'round' });
  // Nasal opening and the seam of the muzzle.
  g.moveTo(24, -3.9)
    .bezierCurveTo(27, -3.5, 30.4, -2.8, 32.4, -1.2)
    .bezierCurveTo(29.4, -1, 26.2, -1.7, 24, -3.9)
    .fill({ color: C.socket, alpha: 0.85 });
  g.moveTo(4.6, -12.8)
    .bezierCurveTo(3.8, -14, 4.2, -15.4, 3, -17.2)
    .stroke({ width: 0.3, color: 0x4a6068, alpha: 0.4, cap: 'round' });
  // Teeth hinted as small notches.
  g.moveTo(11.6, 4.4).lineTo(11.9, 3).moveTo(13.6, 3.4).lineTo(13.9, 2.3).moveTo(15.4, 2.3).lineTo(15.6, 1.4);
  g.stroke({ width: 0.3, color: 0x3a5058, alpha: 0.55 });
  // Warm rim along crown and nasal bridge.
  g.moveTo(-3.5, -15.6)
    .bezierCurveTo(3.5, -18.2, 8.5, -16, 11.5, -12.5)
    .bezierCurveTo(15.5, -7.4, 23, -4.9, 30.4, -3.8)
    .stroke({ width: 0.6, color: 0xfffaf0, alpha: 0.8, cap: 'round' });
}

function drawGlow(g: Graphics, x: number, y: number, r: number, k: number): void {
  for (let i = 7; i >= 1; i--) g.circle(x, y, r * (0.9 + i * 0.75)).fill({ color: C.glow, alpha: 0.035 * k });
  g.circle(x, y, r * 1.35).fill({ color: C.glow, alpha: 0.35 * k });
  g.circle(x, y, r * 0.8).fill({ color: C.glowCore, alpha: Math.min(1, 0.65 + 0.35 * k) });
}

interface Strand {
  u: number;
  len: number;
  w: number;
  ph: number;
  jit: number;
  tone: number;
}

interface Row {
  /** Root line as a quadratic: back, middle, front (mantle-local). */
  a: P;
  m: P;
  b: P;
  /** How far this row is carried by the moving hem (0 at the shoulders, 1 at the hem). */
  depth: number;
  liftK: number;
  flowK: number;
  strands: Strand[];
}

function row(
  n: number,
  seed: number,
  tone: number,
  len0: number,
  len1: number,
  geo: Omit<Row, 'strands'>,
): Row {
  const strands: Strand[] = [];
  for (let i = 0; i < n; i++) {
    const r = hash(seed + i * 3.3);
    const u = (i + 0.2 + r * 0.6) / n;
    const tr = hash(seed + i * 9.7);
    // Lichen catches the light toward the front (lit) side.
    const shift = tr > 0.86 - u * 0.3 ? 1 : tr < 0.25 ? -1 : 0;
    strands.push({
      u,
      len: lerp(len0, len1, u) * (0.7 + hash(seed + i * 7.1) ** 2 * 0.75),
      w: 0.62 * (0.7 + hash(seed + i * 1.7) * 0.6),
      ph: r * TAU,
      jit: (hash(seed + i * 5.9) - 0.5) * 0.3,
      tone: Math.max(0, Math.min(2, tone + shift)),
    });
  }
  return { ...geo, strands };
}

const STRAND_FILL = [G.strandLow, G.strandMid, G.strandTop];

// Back to front: the hem fringe sits behind the mantle mass, the rest overlap like thatch.
const ROWS: Row[] = [
  row(28, 11, 0, 11, 6.5, {
    a: pt(-14.5, 23),
    m: pt(-3, 19.5),
    b: pt(7.5, 12.5),
    depth: 1,
    liftK: 0.35,
    flowK: 0.45,
  }),
  row(26, 29, 0, 11, 7, {
    a: pt(-15.5, 17),
    m: pt(-3, 16),
    b: pt(9, 10),
    depth: 0.75,
    liftK: 0.5,
    flowK: 0.6,
  }),
  row(26, 47, 1, 11, 7.5, {
    a: pt(-15.8, 10),
    m: pt(-3, 11),
    b: pt(9.8, 6),
    depth: 0.5,
    liftK: 0.65,
    flowK: 0.8,
  }),
  row(24, 61, 1, 11, 7.5, {
    a: pt(-14, 3),
    m: pt(-3, 3),
    b: pt(9.5, 2.5),
    depth: 0.25,
    liftK: 0.6,
    flowK: 0.9,
  }),
  row(20, 83, 2, 11, 8, {
    a: pt(-10.5, -2),
    m: pt(-1, -10.5),
    b: pt(9, -0.5),
    depth: 0,
    liftK: 0.4,
    flowK: 1,
  }),
];

function create(pose: ConceptPose): ConceptInstance {
  const view = new Container();
  const back = new Graphics();
  const body = new Graphics();
  const head = new Container();
  const farAntler = new Graphics();
  const skull = new Graphics();
  const nearAntler = new Graphics();
  const wisps = new Graphics();
  const lights = new Graphics();
  lights.blendMode = 'add';
  const cloakG = new Graphics();
  head.addChild(farAntler, wisps, skull, nearAntler, lights);
  head.scale.set(0.86);
  view.addChild(back, body, head, cloakG);

  drawAntler(farAntler, FAR_ANTLER, true);
  drawSkull(skull);
  drawAntler(nearAntler, NEAR_ANTLER, false);

  const buds: P[] = [];
  for (const tn of [...NEAR_ANTLER, ...FAR_ANTLER]) if (tn.bud) buds.push(at(tn.spine, tn.spine.length - 1));
  const wispRoots: [P, number][] = [
    [pt(-23, -36), 8],
    [pt(3, -25.4), 6.5],
    [pt(-4, -32.5), 5],
    [pt(-16.2, -33.5), 6],
  ];

  function strands(g: Graphics, r: Row, M: (x: number, y: number) => P, p: Pose, t: number): void {
    const dx = -(p.flow * 6 + p.lift * 5) * r.depth;
    const dy = -(p.flow * 2 + p.lift * 3.5) * r.depth;
    const a = M(r.a.x + dx, r.a.y + dy);
    const mid = M(r.m.x + dx * 0.5, r.m.y + dy * 0.5);
    const b = M(r.b.x + dx * 0.25, r.b.y + dy * 0.25);
    const speed = lerp(1.5, 8.5, p.flutter);
    const amp = lerp(0.04, 0.11, p.flutter);
    for (const s of r.strands) {
      const u = s.u;
      const iu = 1 - u;
      const root = pt(
        iu * iu * a.x + 2 * iu * u * mid.x + u * u * b.x,
        iu * iu * a.y + 2 * iu * u * mid.y + u * u * b.y,
      );
      let ang =
        DOWN +
        0.04 +
        iu * 0.16 +
        s.jit +
        p.flow * r.flowK * (0.5 + iu * 0.25) +
        p.lift * r.liftK * (0.25 + iu * 0.35);
      const bend = 0.02 + p.flow * r.flowK * 0.17 + p.lift * r.liftK * 0.2;
      const seg = s.len / 4;
      const spine = [root];
      let cur = root;
      for (let i = 1; i <= 4; i++) {
        ang += bend + Math.sin(t * speed - i * 0.8 - root.x * 0.22 + s.ph) * amp * i * 0.6;
        cur = polar(cur, ang, seg);
        spine.push(cur);
      }
      ribbon(g, spine, [s.w, s.w, s.w * 0.85, s.w * 0.55, 0.05]);
      g.fill(at(STRAND_FILL, s.tone));
    }
  }

  function update(t: number): void {
    const p = solve(pose, t);
    const N = pt(p.hip.x + Math.sin(p.lean) * 22, p.hip.y - Math.cos(p.lean) * 22 - p.breath * 0.35);
    const H = pt(N.x + Math.sin(p.neck) * 7.5, N.y - Math.cos(p.neck) * 7.5);
    const cs = Math.cos(p.lean * 0.45);
    const sn = Math.sin(p.lean * 0.45);
    const M = (x: number, y: number): P => pt(N.x + x * cs - y * sn, N.y + x * sn + y * cs);
    const shNear = M(2.5, 4);
    const shFar = M(4, 3.5);

    back.clear();
    drawArm(back, shFar, p.armFar, true);
    drawLeg(back, p.far, true);

    body.clear();
    // Torso: narrow waist, deep chest, long neck into the mask.
    const waist = pt(lerp(p.hip.x, N.x, 0.4) - 0.5, lerp(p.hip.y, N.y, 0.4));
    const chest = pt(lerp(p.hip.x, N.x, 0.8) + 0.8, lerp(p.hip.y, N.y, 0.8));
    ribbon(body, [pt(p.hip.x - 1.5, p.hip.y + 3), p.hip, waist, chest, N, H], [2.4, 4.2, 3.3, 5.2, 3.6, 2.6]);
    body.fill(G.body);
    drawLeg(body, p.near, false);
    drawArm(body, shNear, p.armNear, false);

    head.position.set(H.x, H.y);
    head.rotation = p.head;

    // Mantle: a dark moss mass with three rows of hanging strands.
    const k = p.flow;
    const j = p.lift;
    const hemBack = M(-15 - k * 6 - j * 5, 25 - k * 2 - j * 3.5);
    const under = M(-3 - k * 3 - j * 2.5, 21 - j * 1.7);
    const hemFront = M(8 - k * 1.5 - j * 1.2, 15 - j * 0.9);
    const backMid = M(-15.5 - k * 3 - j * 2.5, 10 - k - j * 1.7);
    const g = cloakG;
    g.clear();
    strands(g, at(ROWS, 0), M, p, t);
    blob(g, [M(7, -1), M(1.5, -7), M(-8, -5.5), backMid, hemBack, under, hemFront, M(10, 6)], 0.5);
    g.fill(G.mass);
    for (let i = 1; i < ROWS.length; i++) strands(g, at(ROWS, i), M, p, t);

    // Lichen wisps hanging from the tines.
    wisps.clear();
    const drag = p.flow * 0.9 + p.lift * 0.5;
    for (let i = 0; i < wispRoots.length; i++) {
      const [r, len] = at(wispRoots, i);
      let ang = DOWN - p.head + drag;
      let cur = r;
      const sp = [r];
      for (let s = 1; s <= 3; s++) {
        ang += drag * 0.15 + Math.sin(t * lerp(1.3, 7, p.flutter) - s * 0.9 + i * 1.7) * 0.09 * s;
        cur = polar(cur, ang, len / 3);
        sp.push(cur);
      }
      ribbon(wisps, sp, [0.5, 0.45, 0.3, 0.05]);
      wisps.fill({ color: 0x5f8a62, alpha: 0.9 });
    }

    // The one light: cyan buds on the tines, and a cold point deep in the orbit.
    lights.clear();
    for (let i = 0; i < buds.length; i++) {
      const pulse = 0.78 + 0.22 * Math.sin(t * 1.1 + i * 1.9);
      drawGlow(lights, at(buds, i).x, at(buds, i).y - 0.3, 0.8, pulse);
    }
    const blinkT = (t + 1.3) % 6.5;
    const blink = blinkT < 0.5 ? Math.abs(Math.cos((blinkT / 0.5) * Math.PI)) : 1;
    const eye = (0.85 + 0.15 * Math.sin(t * 0.9)) * blink;
    lights.circle(5.2, -9, 1.9).fill({ color: C.glow, alpha: 0.07 * eye });
    lights.circle(5.2, -9, 1).fill({ color: C.glow, alpha: 0.22 * eye });
    lights.circle(5.2, -9, 0.42).fill({ color: 0xc8fbff, alpha: eye });
  }

  update(0);
  return { view, update };
}

const hart: Concept = {
  id: 'hart',
  name: 'Hart, the antlered warden',
  blurb:
    'An old, silent guardian under a shaggy moss mantle. Long deer-skull mask in profile, asymmetric branching antlers with one broken beam and a few cyan buds, lean dark body on cloven digitigrade legs.',
  create,
};

export default hart;
