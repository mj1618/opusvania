/**
 * Wick, the lantern bearer. A young wanderer under a low, sharp kasa hat with two gold eyes in its
 * shadow, a short coat with split tails, a long scarf, and a slender lantern-glaive whose spirit
 * flame sheds embers and a ribbon of light. Dark, graphic figure; half made of light.
 *
 * Everything is redrawn each frame from a small pose rig (pelvis, lean, feet and hand targets with
 * two-bone IK, glaive, cloth chains), so the same rig can reach for ledges, walls and weapons.
 */
import { Container, FillGradient, Graphics } from 'pixi.js';
import type { Concept, ConceptInstance, ConceptPose } from '../types';

interface Pt {
  x: number;
  y: number;
  /** Corner: no smoothing through this anchor. */
  c?: boolean;
}

const TAU = Math.PI * 2;
const GLAIVE = 84;
const THIGH = 17;
const SHIN = 18;
const UPPER_ARM = 10.5;
const FOREARM = 10.5;

const P = (x: number, y: number, c = false): Pt => ({ x, y, c });
const at = (a: readonly Pt[], i: number): Pt => a[((i % a.length) + a.length) % a.length] as Pt;
const num = (a: readonly number[], i: number): number => a[Math.max(0, Math.min(a.length - 1, i))] as number;
const mix = (a: number, b: number, f: number): number => a + (b - a) * f;
const mixP = (a: Pt, b: Pt, f: number): Pt => P(mix(a.x, b.x, f), mix(a.y, b.y, f));
const add = (a: Pt, x: number, y: number): Pt => P(a.x + x, a.y + y);
const corner = (a: Pt): Pt => P(a.x, a.y, true);
const smooth = (s: number): number => s * s * (3 - 2 * s);

/** Local frame: rotate (x, y) by `ang` and move to `o`. */
function frame(o: Pt, ang: number): (x: number, y: number, c?: boolean) => Pt {
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  return (x, y, c = false) => P(o.x + x * cs - y * sn, o.y + x * sn + y * cs, c);
}

/** Closed outline through anchors (Catmull-Rom as beziers; corner anchors stay sharp). */
function shape(g: Graphics, pts: readonly Pt[]): Graphics {
  const n = pts.length;
  const first = at(pts, 0);
  g.moveTo(first.x, first.y);
  for (let i = 0; i < n; i++) {
    const p0 = at(pts, i - 1);
    const p1 = at(pts, i);
    const p2 = at(pts, i + 1);
    const p3 = at(pts, i + 2);
    const c1x = p1.c ? p1.x : p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.c ? p1.y : p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.c ? p2.x : p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.c ? p2.y : p2.y - (p3.y - p1.y) / 6;
    g.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
  }
  g.closePath();
  return g;
}

/** Open smooth curve through anchors (for strokes). */
function curve(g: Graphics, pts: readonly Pt[]): Graphics {
  const n = pts.length;
  const cl = (i: number): Pt => pts[Math.max(0, Math.min(n - 1, i))] as Pt;
  g.moveTo(cl(0).x, cl(0).y);
  for (let i = 0; i < n - 1; i++) {
    const p0 = cl(i - 1);
    const p1 = cl(i);
    const p2 = cl(i + 1);
    const p3 = cl(i + 2);
    g.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
  return g;
}

/** The two edges of a tapered strip along a spine. */
function strip(spine: readonly Pt[], half: readonly number[]): { a: Pt[]; b: Pt[] } {
  const n = spine.length;
  const a: Pt[] = [];
  const b: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = at(spine, i);
    const q0 = spine[Math.max(0, i - 1)] as Pt;
    const q1 = spine[Math.min(n - 1, i + 1)] as Pt;
    const dx = q1.x - q0.x;
    const dy = q1.y - q0.y;
    const d = Math.hypot(dx, dy) || 1;
    const w = num(half, i);
    a.push(P(p.x - (dy / d) * w, p.y + (dx / d) * w));
    b.push(P(p.x + (dy / d) * w, p.y - (dx / d) * w));
  }
  return { a, b };
}

function ribbon(g: Graphics, spine: readonly Pt[], half: readonly number[]): Graphics {
  const { a, b } = strip(spine, half);
  return shape(g, [...a, ...b.reverse()]);
}

/** Two-bone IK from a to b. Returns the middle joint and the (possibly clamped) end. */
function ik(a: Pt, b: Pt, l1: number, l2: number, bend: number): { mid: Pt; end: Pt } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const raw = Math.hypot(dx, dy) || 1;
  const d = Math.max(Math.abs(l1 - l2) + 0.05, Math.min(raw, l1 + l2 - 0.05));
  const ux = dx / raw;
  const uy = dy / raw;
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, l1 * l1 - along * along)) * bend;
  return {
    mid: P(a.x + ux * along + uy * off, a.y + uy * along - ux * off),
    end: P(a.x + ux * d, a.y + uy * d),
  };
}

/** A cloth chain: each link turns from a0 to a1 with a travelling wave, lagging down its length. */
function chain(
  root: Pt,
  n: number,
  seg: number,
  a0: number,
  a1: number,
  wave: number,
  phase: number,
  lag = 0.8,
): Pt[] {
  const pts: Pt[] = [root];
  let prev = root;
  for (let i = 1; i < n; i++) {
    const f = i / (n - 1);
    const ang = mix(a0, a1, f ** 0.8) + wave * f * Math.sin(phase - i * lag);
    prev = P(prev.x + Math.cos(ang) * seg, prev.y + Math.sin(ang) * seg);
    pts.push(prev);
  }
  return pts;
}

// ---------------------------------------------------------------------------------------------
// Paint

type Stops = readonly (readonly [number, number | string])[];

function lin(x0: number, y0: number, x1: number, y1: number, stops: Stops): FillGradient {
  const g = new FillGradient({
    type: 'linear',
    start: { x: x0, y: y0 },
    end: { x: x1, y: y1 },
    textureSpace: 'local',
  });
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function rad(stops: Stops): FillGradient {
  const g = new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    textureSpace: 'local',
  });
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

const RIM = 0xffc98c;
const GOLD = 0xffd98a;
const INK = 0x070a1a;

const G = {
  coat: lin(0, 0.2, 1, 0.6, [
    [0, 0x0b1a30],
    [0.5, 0x15173c],
    [1, 0x282658],
  ]),
  skirt: lin(0, 0, 1, 0.4, [
    [0, 0x0a1529],
    [0.6, 0x131536],
    [1, 0x23214e],
  ]),
  tail: lin(0, 0, 1, 1, [
    [0, 0x0a1a2c],
    [1, 0x171a44],
  ]),
  sleeve: lin(0, 0, 1, 0.6, [
    [0, 0x14153c],
    [1, 0x2c2a62],
  ]),
  scarf: lin(0, 0.5, 1, 0.5, [
    [0, 0x5a2f4c],
    [0.5, 0x3d2446],
    [1, 0x2c1d3e],
  ]),
  collar: lin(0, 0, 1, 0.4, [
    [0, 0x2a1c3c],
    [0.6, 0x432748],
    [1, 0x6a3a50],
  ]),
  wrapNear: lin(0, 0, 1, 0.5, [
    [0, 0x58607a],
    [1, 0xc9bda8],
  ]),
  wrapFar: lin(0, 0, 1, 0.5, [
    [0, 0x2c3850],
    [1, 0x6c7384],
  ]),
  skin: lin(0, 0, 1, 1, [
    [0, 0x7f8696],
    [1, 0xdcd0ba],
  ]),
  skinFar: lin(0, 0, 1, 1, [
    [0, 0x48546a],
    [1, 0x8f949a],
  ]),
  legNear: lin(0, 0, 1, 0, [
    [0, 0x0a1226],
    [1, 0x1c1e42],
  ]),
  wood: lin(0, 0, 1, 0, [
    [0, 0x14111c],
    [1, 0x3a2a2c],
  ]),
  blade: lin(0, 0, 1, 1, [
    [0, 0x2c4450],
    [0.5, 0x7fa3a8],
    [1, 0xe8dcc0],
  ]),
  aura: rad([
    [0, 'rgba(255,196,128,0.20)'],
    [0.35, 'rgba(230,170,120,0.10)'],
    [0.7, 'rgba(120,170,170,0.04)'],
    [1, 'rgba(120,170,170,0)'],
  ]),
  halo: rad([
    [0, 'rgba(255,214,150,0.62)'],
    [0.12, 'rgba(255,186,112,0.36)'],
    [0.35, 'rgba(255,160,86,0.14)'],
    [0.7, 'rgba(255,140,70,0.035)'],
    [1, 'rgba(255,140,70,0)'],
  ]),
  eye: rad([
    [0, 'rgba(255,214,130,0.85)'],
    [0.35, 'rgba(255,170,80,0.4)'],
    [1, 'rgba(255,150,60,0)'],
  ]),
  core: rad([
    [0, 'rgba(255,246,220,0.95)'],
    [0.4, 'rgba(255,214,140,0.5)'],
    [1, 'rgba(255,170,90,0)'],
  ]),
};

// ---------------------------------------------------------------------------------------------
// Pose rig

interface Rig {
  pelvis: Pt;
  lean: number;
  torso: number;
  headAng: number;
  hatTilt: number;
  ankleN: Pt;
  ankleF: Pt;
  rotN: number;
  rotF: number;
  /** Glaive hand (the far arm) target, world units. */
  hand: Pt;
  /** Free (near) hand target as an offset from its shoulder, and its elbow bend side. */
  freeOff: Pt;
  freeBend: number;
  staffAng: number;
  grip: number;
  hookSide: number;
  swing: number;
  hemF: Pt;
  hemM: Pt;
  hemB: Pt;
  /** Cloth: [a0, a1, wave] for scarf and coat tails, and the shared wave phase. */
  scarf: readonly [number, number, number];
  tails: readonly [number, number, number];
  clothPhase: number;
  /** +1 lantern in front of the body, -1 behind it. */
  lit: number;
  /** Flame lean, ember drift over a lifetime, and the light trail (angle, length, curl). */
  flameWind: number;
  ember: Pt;
  trail: readonly [number, number, number];
  eye: number;
}

/** Duty factor of the lope: each foot is down for under a third of the cycle, so every stride floats. */
const STANCE = 0.32;

function runFoot(phase: number): { p: Pt; rot: number } {
  const u = (((phase / TAU) % 1) + 1) % 1;
  if (u < STANCE) {
    // A light touch on the ball of the foot, rolling to the toe.
    const s = u / STANCE;
    return { p: P(17 - 38 * s, -2 - 2.5 * s * s * s), rot: mix(0.18, 0.85, s * s) };
  }
  // Long floating swing: the foot trails, toes loose, folds through late and reaches softly.
  const s = (u - STANCE) / (1 - STANCE);
  const e = smooth(s ** 1.15);
  const lift = Math.sin(Math.PI * s ** 0.9) ** 1.2 * (1 - 0.3 * s);
  return {
    p: P(-21 + 38 * e, -2 - 2.5 * (1 - s) ** 2 - 13 * lift),
    rot: 0.18 + (0.67 + 0.4 * Math.sin(Math.PI * Math.min(1, s * 2.2))) * (1 - smooth(s)),
  };
}

function solve(pose: ConceptPose, t: number): Rig {
  const blinkT = t % 5.3;
  const eye = blinkT < 0.16 ? Math.max(0.1, 1 - Math.sin((Math.PI * blinkT) / 0.16)) : 1;

  if (pose === 'run') {
    // An unhurried bounding lope. Nothing shares a phase: the chest lags the hips, the head lags
    // the chest, the hands drift behind those, and the cloth runs on its own slower wave.
    const ph = t * 7.4;
    const ox = 6;
    const hop = Math.cos(2 * ph - TAU * 2 * (STANCE / 2));
    const bob = 2.5 * (hop - 0.3 * (1 - hop * hop)); // lingers at the top of the arc
    const bobLag = 2.5 * Math.cos(2 * ph - TAU * STANCE - 0.9);
    const n = runFoot(ph);
    const f = runFoot(ph + Math.PI);
    return {
      pelvis: P(ox, -31 + bob),
      lean: 0.25 + 0.022 * Math.sin(2 * ph - 0.5),
      torso: 20 + 0.3 * Math.sin(2 * ph - 1.1),
      headAng: 0.01 + 0.014 * Math.sin(2 * ph - 1.9),
      hatTilt: 0.16 + 0.022 * Math.sin(2 * ph - 2.6),
      ankleN: add(n.p, ox, 0),
      ankleF: add(f.p, ox - 1, 0),
      rotN: n.rot,
      rotF: f.rot,
      hand: P(ox - 3 + 1.4 * Math.cos(ph - 0.9), -30 + bobLag * 0.55),
      freeOff: P(-7 - 4.2 * Math.cos(ph - 0.8) + 0.6 * Math.sin(t * 2.3), 13 + 1.3 * Math.sin(2 * ph - 2.2)),
      freeBend: -1,
      staffAng: Math.PI + 0.38 + 0.04 * Math.sin(2 * ph - 2.4) + 0.015 * Math.sin(t * 3.1),
      grip: 36,
      hookSide: -1,
      swing: -0.52 + 0.14 * Math.sin(2 * ph - 3.2) + 0.04 * Math.sin(t * 4.3),
      hemF: P(8 + 0.7 * Math.sin(2 * ph - 1.2), 7.2 + 0.8 * Math.cos(2 * ph - 1.2)),
      hemM: P(-2, 7.4),
      hemB: P(-11 + 1.1 * Math.sin(2 * ph - 2.4), 5.4 + 1.2 * Math.cos(2 * ph - 2.4)),
      scarf: [3.02, 3.2, 0.26],
      tails: [2.45, 2.95, 0.3],
      clothPhase: t * 9.1,
      lit: -1,
      flameWind: -2.6 + 0.4 * Math.sin(t * 13) + 0.2 * Math.sin(t * 7.7),
      ember: P(-30, -5),
      trail: [Math.PI + 0.03, 32, 0.3],
      eye,
    };
  }

  if (pose === 'jump') {
    const b = Math.sin(t * 1.7);
    const ox = 2;
    return {
      pelvis: P(ox, -36 + 0.9 * b),
      lean: 0.2 + 0.015 * b,
      torso: 20.5,
      headAng: -0.06,
      hatTilt: 0.1 + 0.02 * Math.sin(t * 2.3),
      ankleN: P(ox + 14.5, -23 + 0.8 * b),
      ankleF: P(ox - 12, -9 + 1.2 * Math.sin(t * 1.7 - 0.6)),
      rotN: 0.35,
      rotF: 1.25,
      hand: P(ox + 16, -46 + 0.9 * b),
      freeOff: P(-14 + 0.8 * Math.sin(t * 1.3 + 1), 1.5 + 1.4 * Math.sin(t * 1.7 - 0.8)),
      freeBend: 1,
      staffAng: -1.02 + 0.02 * Math.sin(t * 1.7 - 0.6),
      grip: 36,
      hookSide: 1,
      swing: -0.3 + 0.1 * Math.sin(t * 2.3 - 1),
      hemF: P(11 + Math.sin(t * 3.1), 2.5 + 1.2 * Math.cos(t * 3.1)),
      hemM: P(0, 6.5),
      hemB: P(-11.5 + 1.2 * Math.sin(t * 3.1 + 2), 1.5 + 1.4 * Math.cos(t * 3.1 + 2)),
      scarf: [3.35, 4.2, 0.2],
      tails: [2.9, 3.9, 0.22],
      clothPhase: t * 5.4,
      lit: 1,
      flameWind: -0.8 + 0.4 * Math.sin(t * 9),
      ember: P(-9, -30),
      trail: [-1.8, 22, -0.6],
      eye,
    };
  }

  const b = Math.sin(t * 1.5);
  const sway = Math.sin(t * 0.55);
  const ox = -8;
  // Now and then the head turns a little toward the lantern.
  const look = smooth(Math.max(0, Math.min(1, Math.sin(t * 0.37 - 1) * 3 - 1.6)));
  return {
    pelvis: P(ox - 1.2 + 0.5 * sway, -35.9 - 0.3 * b - 0.12 * Math.sin(t * 0.83 + 2)),
    lean: 0.035 + 0.012 * sway + 0.006 * Math.sin(t * 0.91),
    torso: 20 + 0.45 * b,
    headAng: -0.03 - 0.12 * look,
    hatTilt: 0.2 + 0.015 * Math.sin(t * 0.4 + 0.4),
    ankleN: P(ox + 7.5, -2.5),
    ankleF: P(ox - 4, -2),
    rotN: 0.16,
    rotF: 0,
    hand: P(ox + 19 + 0.4 * sway, -46 - 0.5 * b),
    freeOff: P(0.8 + 0.6 * Math.sin(t * 0.55 - 0.9), 19.6 - 0.3 * Math.sin(t * 1.5 - 0.7)),
    freeBend: -1,
    staffAng: -Math.PI / 2 + 0.13 + 0.012 * sway,
    grip: 34,
    hookSide: 1,
    swing: 0.12 * Math.sin(t * 1.25 - 0.9) + 0.04 * Math.sin(t * 2.7),
    hemF: P(8.5 + 0.5 * Math.sin(t * 1.1), 8.5),
    hemM: P(1, 6.8),
    hemB: P(-7.5 + 0.7 * Math.sin(t * 1.1 - 0.8), 8),
    scarf: [2.15, 2.8, 0.14],
    tails: [1.8, 2.1, 0.09],
    clothPhase: t * 1.7,
    lit: 1,
    flameWind: 0.5 * Math.sin(t * 2.3) + 0.3 * Math.sin(t * 7.1),
    ember: P(4, -26),
    trail: [0, 0, 0],
    eye,
  };
}

// ---------------------------------------------------------------------------------------------
// Drawing

function drawLeg(
  g: Graphics,
  fx: Graphics,
  hip: Pt,
  target: Pt,
  rot: number,
  near: boolean,
  pulse: number,
): void {
  const { mid: knee, end: ankle } = ik(hip, target, THIGH, SHIN, 1);
  const spine = [hip, mixP(hip, knee, 0.5), knee, mixP(knee, ankle, 0.5), ankle];
  const half = [3.4, 3.1, 2.3, 1.9, 1.25];
  ribbon(g, spine, half).fill(near ? G.legNear : { color: 0x080e1e });
  // Wrapped shin and foot: the pale material, cooler and darker on the far leg.
  const wrap = near ? G.wrapNear : G.wrapFar;
  ribbon(
    g,
    [mixP(knee, ankle, 0.42), mixP(knee, ankle, 0.7), ankle, add(ankle, 0, 0.6)],
    [2, 1.6, 1.25, 1.1],
  ).fill(wrap);
  const F = frame(ankle, rot);
  shape(g, [F(-1.8, 1.9), F(-1.3, -1), F(1.1, -1.1), F(3.8, 0.6), F(6, 2, true), F(1.8, 2.2)]).fill(wrap);
  const sa = Math.atan2(ankle.y - knee.y, ankle.x - knee.x);
  for (const f of [0.55, 0.72, 0.88]) {
    const Wf = frame(mixP(knee, ankle, f), sa);
    g.moveTo(Wf(-0.4, -1.6).x, Wf(-0.4, -1.6).y)
      .lineTo(Wf(0.4, 1.6).x, Wf(0.4, 1.6).y)
      .stroke({ width: 0.3, color: INK, alpha: near ? 0.3 : 0.2 });
  }
  if (near) {
    // Key light down the front of the thigh, and one glowing thread at the top of the wrap.
    const { a, b } = strip(spine, half);
    const front = at(a, 2).x > at(b, 2).x ? a : b;
    ribbon(g, [at(front, 0), at(front, 1), at(front, 2), at(front, 3)], [0.05, 0.3, 0.3, 0.05]).fill({
      color: RIM,
      alpha: 0.4,
    });
    const Wf = frame(mixP(knee, ankle, 0.44), sa);
    fx.moveTo(Wf(0, -1.9).x, Wf(0, -1.9).y)
      .lineTo(Wf(0, 1.9).x, Wf(0, 1.9).y)
      .stroke({ width: 0.55, color: GOLD, alpha: 0.5 * pulse, cap: 'round' });
  }
}

/** Fitted short sleeve, wrapped forearm. Returns the wrist and the forearm angle. */
function drawArm(
  g: Graphics,
  fx: Graphics,
  sh: Pt,
  target: Pt,
  bend: number,
  near: boolean,
  pulse: number,
): { wrist: Pt; ang: number } {
  const { mid: el, end: wr } = ik(sh, target, UPPER_ARM, FOREARM, bend);
  const ang = Math.atan2(wr.y - el.y, wr.x - el.x);
  const cuff = mixP(el, wr, 0.22);
  const { a, b } = strip([sh, mixP(sh, el, 0.5), el, cuff], [3, 2.8, 2.7, 3.2]);
  const a3 = at(a, 3);
  const b3 = at(b, 3);
  shape(g, [...a.slice(0, 3), corner(a3), corner(b3), ...b.slice(0, 3).reverse()]).fill(
    near ? G.sleeve : { color: 0x0c1230 },
  );
  const C = frame(cuff, ang);
  shape(g, [corner(a3), C(1.1, 0), corner(b3), C(-0.8, 0)]).fill(INK);
  // Cloth-wrapped forearm: the pale material again.
  ribbon(g, [mixP(el, wr, 0.16), mixP(el, wr, 0.55), wr], [1.9, 1.7, 1.35]).fill(
    near ? G.wrapNear : G.wrapFar,
  );
  for (const f of [0.45, 0.68, 0.9]) {
    const Wf = frame(mixP(el, wr, f), ang);
    g.moveTo(Wf(-0.5, -1.5).x, Wf(-0.5, -1.5).y)
      .lineTo(Wf(0.5, 1.5).x, Wf(0.5, 1.5).y)
      .stroke({ width: 0.3, color: INK, alpha: near ? 0.3 : 0.22 });
  }
  if (near) {
    const upper = at(a, 1).y < at(b, 1).y ? a : b;
    ribbon(g, [at(upper, 0), at(upper, 1), at(upper, 2), at(upper, 3)], [0.05, 0.36, 0.34, 0.05]).fill({
      color: RIM,
      alpha: 0.7,
    });
    const Wf = frame(mixP(el, wr, 0.3), ang);
    fx.moveTo(Wf(0, -1.8).x, Wf(0, -1.8).y)
      .lineTo(Wf(0, 1.8).x, Wf(0, 1.8).y)
      .stroke({ width: 0.55, color: GOLD, alpha: 0.55 * pulse, cap: 'round' });
  }
  return { wrist: wr, ang };
}

/** Mitten hand with a distinct thumb: open and relaxed, or closed around something. */
function drawHand(g: Graphics, wr: Pt, ang: number, near: boolean, grip: boolean): void {
  const Hd = frame(wr, ang);
  const fill = near ? G.skin : G.skinFar;
  const line = { width: 0.3, color: 0x2a2c44, alpha: near ? 0.55 : 0.45, cap: 'round' } as const;
  if (grip) {
    shape(g, [
      Hd(-0.9, -1.9),
      Hd(2, -2.4),
      Hd(3.8, -1.5),
      Hd(4.1, 0.6),
      Hd(2.9, 2.3),
      Hd(0, 2.2),
      Hd(-1.2, 0.4),
    ]).fill(fill);
    // Fingers curled over, thumb locked across them.
    curve(g, [Hd(2.2, -2.2), Hd(2.6, 0), Hd(2, 2.1)]).stroke(line);
    shape(g, [Hd(0.2, -0.9), Hd(2.6, -1.5), Hd(4.6, -0.5), Hd(3.6, 0.8), Hd(0.8, 0.6)]).fill(fill);
    curve(g, [Hd(0.4, 0.7), Hd(3.4, 0.9), Hd(4.6, -0.3)]).stroke(line);
    return;
  }
  shape(g, [Hd(0.6, -1.3), Hd(2.3, -3.2), Hd(3.5, -2.9), Hd(3.2, -1.1)]).fill(fill);
  shape(g, [
    Hd(-0.7, -1.6),
    Hd(2.4, -1.9),
    Hd(4.6, -1.3),
    Hd(5.2, 0.4),
    Hd(4, 1.8),
    Hd(0.6, 1.8),
    Hd(-1, 0.3),
  ]).fill(fill);
  curve(g, [Hd(1.2, -1.6), Hd(2.6, -1.1), Hd(3.3, -1.8)]).stroke(line);
}

/** A pointed streamer of cloth along a chain. */
function streamer(
  g: Graphics,
  spine: readonly Pt[],
  half: readonly number[],
  fill: FillGradient | number,
  alpha = 1,
): void {
  const { a, b } = strip(spine, half);
  const tip = corner(at(spine, spine.length - 1));
  const s = shape(g, [...a.slice(0, -1), tip, ...b.slice(0, -1).reverse()]);
  if (typeof fill === 'number') s.fill({ color: fill, alpha });
  else s.fill(fill);
}

interface Drawn {
  hang: Pt;
  eyes: readonly [Pt, Pt];
  chest: Pt;
}

function draw(g: Graphics, front: Graphics, fx: Graphics, r: Rig, pulse: number): Drawn {
  g.clear();
  front.clear();
  fx.clear();

  const up = P(Math.sin(r.lean), -Math.cos(r.lean));
  const neck = P(r.pelvis.x + up.x * r.torso, r.pelvis.y + up.y * r.torso);
  const T = frame(neck, r.lean);
  const W = frame(r.pelvis, r.lean * 0.7);
  const hf = add(r.pelvis, r.hemF.x, r.hemF.y);
  const hm = add(r.pelvis, r.hemM.x, r.hemM.y);
  const hb = add(r.pelvis, r.hemB.x, r.hemB.y);
  const frontRim = r.lit > 0 ? 0.85 : 0.4;
  const backRim = r.lit < 0 ? 0.75 : 0;
  const [sA0, sA1, sW] = r.scarf;
  const [tA0, tA1, tW] = r.tails;

  // 1. Far arm, the glaive, and the far hand closed around it.
  const fw = drawArm(g, fx, T(0.5, 4), r.hand, -1, false, pulse);
  const butt = P(r.hand.x - Math.cos(r.staffAng) * r.grip, r.hand.y - Math.sin(r.staffAng) * r.grip);
  const S = frame(butt, r.staffAng); // x along the shaft, y across it
  const hs = r.hookSide;
  const L = GLAIVE;
  ribbon(g, [S(0, 0), S(L * 0.3, 0.25), S(L * 0.6, -0.2), S(L - 12, 0)], [0.45, 0.8, 0.75, 0.65]).fill(
    G.wood,
  );
  shape(g, [S(-1.6, 0, true), S(0.4, 0.9), S(2.4, 0.7), S(2.4, -0.7), S(0.4, -0.9)]).fill(0x2a2430);
  ribbon(g, [S(r.grip - 4.5, 0.1), S(r.grip + 5, 0.1)], [1, 0.95]).fill({ color: 0x3a2446, alpha: 0.95 });
  // Blade: a slender leaf with a lit edge.
  shape(g, [
    S(L - 13.5, 0.8, true),
    S(L - 12.6, 1.5 * hs + 0.6, true),
    S(L - 7, 1.9 * hs),
    S(L, 0, true),
    S(L - 6, -1.2 * hs),
    S(L - 12.6, -1.1 * hs - 0.6, true),
    S(L - 13.5, -0.8, true),
  ]).fill(G.blade);
  curve(g, [S(L - 12.4, 1.5 * hs), S(L - 7, 1.8 * hs), S(L - 0.4, 0.1)]).stroke({
    width: 0.4,
    color: 0xfff0d0,
    alpha: 0.85,
    cap: 'round',
  });
  ribbon(g, [S(L - 16, 0), S(L - 13, 0)], [1.15, 1.25]).fill(0x241c26);
  curve(g, [S(L * 0.55, -0.7 * hs), S(L * 0.75, -0.75 * hs), S(L - 16, -0.7 * hs)]).stroke({
    width: 0.35,
    color: RIM,
    alpha: 0.6,
    cap: 'round',
  });
  // Hook for the lantern, just under the blade.
  const hang = S(L - 20.5, 6 * hs);
  curve(g, [S(L - 15, 0.4 * hs), S(L - 15.2, 3.4 * hs), S(L - 17.5, 5.6 * hs), hang]).stroke({
    width: 0.8,
    color: 0x1e1820,
    cap: 'round',
    join: 'round',
  });
  drawHand(g, fw.wrist, fw.ang, false, true);

  // 2. Far leg.
  drawLeg(g, fx, add(r.pelvis, -1.6, 0), r.ankleF, r.rotF, false, pulse);

  // 3. Scarf tail and the split coat tails, streaming with lag down their length.
  const scarfHalf = [2, 2.9, 3.2, 3.2, 3, 2.7, 2.2, 1.5, 0.2];
  const scarfSpine = chain(T(-4.5, 0.5), 9, 5.4, sA0, sA1, sW, r.clothPhase, 0.7);
  streamer(g, scarfSpine, scarfHalf, G.scarf);
  curve(g, scarfSpine.slice(1, 8)).stroke({ width: 0.45, color: INK, alpha: 0.35, cap: 'round' });
  const scarfEdges = strip(scarfSpine, scarfHalf);
  const scarfTop = at(scarfEdges.a, 4).y < at(scarfEdges.b, 4).y ? scarfEdges.a : scarfEdges.b;
  curve(g, scarfTop.slice(1, 8)).stroke({
    width: 0.4,
    color: RIM,
    alpha: 0.3 + backRim * 0.4,
    cap: 'round',
  });
  // The scarf end smoulders like a wick.
  curve(fx, scarfSpine.slice(6)).stroke({ width: 0.6, color: 0xff9a4a, alpha: 0.4 * pulse, cap: 'round' });
  const tailHalf = [2.4, 3.3, 3.5, 3.1, 2.3, 0.2];
  const tailFar = chain(W(-4.6, -3.2), 6, 4.9, tA0 + 0.16, tA1 + 0.2, tW, r.clothPhase - 0.9);
  const tailNear = chain(W(-3.4, -3), 6, 5.3, tA0 - 0.08, tA1 - 0.06, tW, r.clothPhase - 0.3);
  streamer(g, tailFar, tailHalf, 0x0a1226);

  // 4. Near leg, then the near coat tail over it.
  drawLeg(g, fx, add(r.pelvis, 1.6, 0), r.ankleN, r.rotN, true, pulse);
  streamer(g, tailNear, tailHalf, G.tail);
  curve(g, tailNear.slice(1)).stroke({ width: 0.4, color: INK, alpha: 0.4, cap: 'round' });

  // 5. Short coat: fitted chest, nipped waist, flared skirt to mid-thigh.
  const waistF = W(5, -5.2);
  const waistB = W(-5.2, -5);
  shape(g, [
    corner(waistF),
    mixP(waistF, hf, 0.55),
    corner(hf),
    add(mixP(hf, hm, 0.5), 0, 0.7),
    hm,
    add(mixP(hm, hb, 0.5), 0, 0.6),
    corner(hb),
    mixP(waistB, hb, 0.5),
    corner(waistB),
  ]).fill(G.skirt);
  // Skirt split.
  const split = mixP(waistF, waistB, 0.42);
  ribbon(g, [split, mixP(split, hm, 0.6), add(hm, 0.4, 0)], [0.05, 0.6, 0.9]).fill({
    color: INK,
    alpha: 0.7,
  });
  shape(g, [
    T(3.4, -1.5),
    T(6.6, 3.6),
    T(7, 9.5),
    mixP(T(6.4, 14), waistF, 0.5),
    add(waistF, 0.3, 0.6),
    add(mixP(waistF, waistB, 0.5), 0, 1.4),
    add(waistB, -0.3, 0.6),
    mixP(T(-6.2, 14), waistB, 0.5),
    T(-6.6, 9),
    T(-6.2, 3.6),
    T(-4, -1.5),
  ]).fill(G.coat);
  // Crossed lapel line.
  curve(g, [T(1.5, 0.5), T(4.4, 6.5), mixP(T(5.6, 14), waistF, 0.6)]).stroke({
    width: 0.5,
    color: INK,
    alpha: 0.55,
    cap: 'round',
  });
  // Sash at the waist with a glowing thread.
  const sashSpine = [add(waistB, -0.5, 0.2), add(mixP(waistF, waistB, 0.5), 0, 1), add(waistF, 0.5, 0)];
  ribbon(g, sashSpine, [1.6, 1.75, 1.6]).fill(G.collar);
  curve(fx, sashSpine).stroke({ width: 0.45, color: GOLD, alpha: 0.5 * pulse, cap: 'round' });
  // Glowing thread along the hem.
  const inset = T(0, 12);
  curve(fx, [
    mixP(hf, inset, 0.07),
    mixP(add(mixP(hf, hm, 0.5), 0, 0.7), inset, 0.07),
    mixP(hm, inset, 0.07),
    mixP(add(mixP(hm, hb, 0.5), 0, 0.6), inset, 0.07),
    mixP(hb, inset, 0.07),
  ]).stroke({ width: 0.45, color: GOLD, alpha: 0.42 * pulse, cap: 'round' });
  // Light on form: lantern side strong and warm, the other side left to the cool fill.
  ribbon(g, [T(6.2, 3.2), T(7, 9.5), mixP(T(6.4, 14), waistF, 0.5), waistF], [0.05, 0.42, 0.36, 0.05]).fill({
    color: RIM,
    alpha: frontRim,
  });
  ribbon(g, [add(waistF, 0.3, 1.5), mixP(waistF, hf, 0.55), add(hf, -0.2, -0.4)], [0.05, 0.36, 0.05]).fill({
    color: RIM,
    alpha: frontRim * 0.8,
  });
  if (backRim > 0) {
    ribbon(
      g,
      [T(-5.8, 3.2), T(-6.6, 9), mixP(T(-6.2, 14), waistB, 0.5), waistB],
      [0.05, 0.4, 0.34, 0.05],
    ).fill({ color: RIM, alpha: backRim });
  }

  // 6. Head: a hooded, shadowed face. Only the eyes show.
  const headC = frame(neck, r.lean * 0.45)(1.6, -9.6);
  const H = frame(headC, r.headAng);
  shape(g, [
    H(-8, -3),
    H(-1, -7),
    H(6.5, -5),
    H(8.6, 0.6),
    H(6, 6.4),
    H(0, 8.4),
    H(-6.5, 6.6),
    H(-8.8, 1.4),
  ]).fill(0x0c0f24);
  shape(g, [H(0.6, -4.4), H(6.2, -4.4), H(8.3, 0.4), H(6.2, 5.4), H(1.4, 6), H(-0.2, 1)]).fill(0x1e2344);
  const eyeAt = (x: number, y: number, w: number, h: number): void => {
    const hh = h * r.eye;
    // Almond with a flat upper lid, the outer corner drawn up a touch: level, unhurried.
    shape(g, [
      H(x - w, y + 0.15, true),
      H(x - w * 0.2, y - hh * 0.55),
      H(x + w, y - hh * 0.35, true),
      H(x + w * 0.3, y + hh * 0.75),
      H(x - w * 0.5, y + hh * 0.7),
    ]).fill(0xffd884);
  };
  eyeAt(4, 0.6, 1.5, 1.05);
  eyeAt(7.5, 0.4, 0.95, 0.95);
  const eyes = [H(4, 0.6), H(7.5, 0.4)] as const;

  // 7. Scarf wound high around the neck and over the mouth.
  shape(g, [
    T(7.6, -5.2),
    T(8.4, -0.5),
    T(5.6, 3.4),
    T(-2, 3.9),
    T(-6.8, 1.4),
    T(-7.4, -5.8),
    T(-2.5, -4.4),
    T(3, -3.4),
  ]).fill(G.collar);
  curve(g, [T(-6.4, -2), T(-0.5, 0.2), T(7.6, -1.4)]).stroke({
    width: 0.45,
    color: INK,
    alpha: 0.45,
    cap: 'round',
  });
  ribbon(g, [T(7.4, -5), T(8.4, -0.5), T(6.2, 2.8)], [0.05, 0.38, 0.05]).fill({
    color: RIM,
    alpha: frontRim,
  });

  // 8. Hat ribbons, then the hat: a low, sharp cone tipped forward over the eyes.
  const HT = frame(headC, r.headAng + r.hatTilt);
  const ribA = chain(HT(-9, -3.6), 5, 3.6, sA0 - 0.25, sA1 - 0.1, sW * 1.4, r.clothPhase + 1.2, 0.9);
  const ribB = chain(HT(-7, -3.8), 5, 3, sA0 + 0.05, sA1 + 0.25, sW * 1.4, r.clothPhase + 0.4, 0.9);
  streamer(g, ribA, [0.5, 0.75, 0.7, 0.55, 0.1], 0x3a2040);
  streamer(g, ribB, [0.5, 0.7, 0.6, 0.5, 0.1], 0x2a1a36);
  shape(g, [
    HT(-21.5, -1.6, true),
    HT(-10, -8),
    HT(-1.6, -12.6, true),
    HT(0.8, -12.9, true),
    HT(11, -7.8),
    HT(22, -1.4, true),
    HT(11, -3.6),
    HT(0, -4.6),
    HT(-11, -3.8),
  ]).fill(0x120f18);
  // Two-tone: the plane facing the lantern takes its light.
  if (r.lit > 0) {
    shape(g, [HT(0.8, -12.9, true), HT(11, -7.8), HT(22, -1.4, true), HT(11, -3.6), HT(4, -4.4, true)]).fill({
      color: 0x6a4630,
      alpha: 0.6,
    });
  } else {
    shape(g, [
      HT(-1.6, -12.6, true),
      HT(-10, -8),
      HT(-21.5, -1.6, true),
      HT(-11, -3.8),
      HT(-4, -4.5, true),
    ]).fill({
      color: 0x6a4630,
      alpha: 0.5,
    });
    shape(g, [HT(0.8, -12.9, true), HT(11, -7.8), HT(22, -1.4, true), HT(11, -3.6), HT(5, -4.3, true)]).fill({
      color: 0x3a2c30,
      alpha: 0.5,
    });
  }
  // Underside of the brim, weave rings, and the lit edge.
  ribbon(
    g,
    [HT(-20, -1.9), HT(-10.5, -4.4), HT(0, -5.3), HT(10.5, -4.3), HT(20.5, -1.7)],
    [0.05, 0.7, 0.9, 0.7, 0.05],
  ).fill({ color: 0x04060c, alpha: 0.6 });
  const weave = { width: 0.3, color: 0x7a5c50, alpha: 0.28, cap: 'round' } as const;
  curve(g, [HT(-13, -5.6), HT(0, -7.6), HT(13.5, -5.6)]).stroke(weave);
  curve(g, [HT(-6.5, -9.3), HT(0, -10.2), HT(7.2, -9.2)]).stroke(weave);
  ribbon(g, [HT(1, -12.8), HT(11, -7.9), HT(21.8, -1.5)], [0.05, 0.45, 0.05]).fill({
    color: RIM,
    alpha: frontRim,
  });
  curve(g, [HT(22, -1.4), HT(11, -3.6), HT(1, -4.5)]).stroke({
    width: 0.4,
    color: RIM,
    alpha: frontRim * 0.55,
    cap: 'round',
  });
  if (backRim > 0) {
    ribbon(g, [HT(-1.6, -12.6), HT(-10, -8), HT(-21.3, -1.7)], [0.05, 0.42, 0.05]).fill({
      color: RIM,
      alpha: backRim,
    });
  }

  // 9. Near arm, free: in front of everything.
  const shN = T(2.2, 4.4);
  const nw = drawArm(front, fx, shN, add(shN, r.freeOff.x, r.freeOff.y), r.freeBend, true, pulse);
  drawHand(front, nw.wrist, nw.ang, true, false);

  return { hang, eyes, chest: T(1, 8) };
}

function buildLantern(): Container {
  const c = new Container();
  const g = new Graphics();
  // An open cage: ring, cap, two bars and a dish. The flame lives inside it.
  g.circle(0, 0.9, 0.8).stroke({ width: 0.4, color: 0x2a2028 });
  shape(g, [P(-3, 3.4, true), P(-0.9, 1.8), P(0.9, 1.8), P(3, 3.4, true)]).fill(0x1c1620);
  shape(g, [
    P(-2.1, 3.4, true),
    P(2.1, 3.4, true),
    P(2.6, 6.4),
    P(1.9, 9.2, true),
    P(-1.9, 9.2, true),
    P(-2.6, 6.4),
  ]).fill({ color: 0xffb060, alpha: 0.28 });
  curve(g, [P(-2.1, 3.4), P(-2.6, 6.4), P(-1.9, 9.2)]).stroke({ width: 0.4, color: 0x1c1620 });
  curve(g, [P(2.1, 3.4), P(2.6, 6.4), P(1.9, 9.2)]).stroke({ width: 0.4, color: 0x1c1620 });
  shape(g, [P(-2.5, 9, true), P(2.5, 9, true), P(1.5, 10.3, true), P(0, 11), P(-1.5, 10.3, true)]).fill(
    0x1c1620,
  );
  curve(g, [P(1.1, 2), P(2.9, 3.3)]).stroke({ width: 0.4, color: RIM, alpha: 0.8, cap: 'round' });
  c.addChild(g);
  return c;
}

function glowDisc(r: number, fill: FillGradient): Graphics {
  const g = new Graphics().circle(0, 0, r).fill(fill);
  g.blendMode = 'add';
  return g;
}

function hasFilter(c: Container | null): boolean {
  const f = c?.filters;
  return Array.isArray(f) ? f.length > 0 : !!f;
}

const EMBERS = 9;

const wick: Concept = {
  id: 'wick',
  name: 'Wick, the lantern bearer',
  blurb: 'A young wanderer wreathed in lantern light.',
  create(pose: ConceptPose): ConceptInstance {
    const view = new Container();
    const aura = glowDisc(62, G.aura);
    const back = new Graphics();
    const front = new Graphics();
    const chainG = new Graphics();
    const lantern = buildLantern();
    const flame = new Graphics();
    const fx = new Graphics();
    fx.blendMode = 'add';
    const light = new Graphics();
    light.blendMode = 'add';
    const halo = glowDisc(36, G.halo);
    const core = glowDisc(8, G.core);
    const eyeGlowA = glowDisc(3.6, G.eye);
    const eyeGlowB = glowDisc(2.8, G.eye);
    view.addChild(aura, light, back, front, fx, chainG, lantern, flame, halo, core, eyeGlowA, eyeGlowB);

    const update = (clock: number): void => {
      // Debug: set window.__wickT to freeze every instance at that time (for frame-by-frame review).
      const forced = (globalThis as { __wickT?: number }).__wickT;
      const t = typeof forced === 'number' ? forced : clock;
      const r = solve(pose, t);
      const pulse = 1 + 0.07 * Math.sin(t * 2.1) + 0.035 * Math.sin(t * 5.3 + 1) + 0.02 * Math.sin(t * 13.7);
      const d = draw(back, front, fx, r, pulse);
      const sil = hasFilter(view.parent);

      // Lantern on a short chain: the chain leads, the lantern body lags a little.
      const cl = 3.2;
      const lx = d.hang.x + Math.sin(r.swing) * cl;
      const ly = d.hang.y + Math.cos(r.swing) * cl;
      chainG.clear();
      chainG.moveTo(d.hang.x, d.hang.y).lineTo(lx, ly).stroke({ width: 0.4, color: 0x2a2028, cap: 'round' });
      lantern.position.set(lx, ly);
      lantern.rotation = -r.swing * 0.75;
      const fxp = lx + Math.sin(r.swing * 0.75) * 7.6;
      const fyp = ly + Math.cos(r.swing * 0.75) * 7.6;

      // Spirit flame: a living tongue that leans with the air, taller than its cage.
      const fl = 1 + 0.16 * Math.sin(t * 11.3) + 0.1 * Math.sin(t * 23.1 + 2);
      const w = r.flameWind;
      const tongue = (s: number, h: number): Pt[] => [
        P(fxp - 1.9 * s, fyp + 0.4),
        P(fxp, fyp + 1.9 * s),
        P(fxp + 1.9 * s, fyp + 0.4),
        P(fxp + 1.2 * s + w * 0.35, fyp - h * 0.45),
        P(fxp + w, fyp - h, true),
        P(fxp - 1.2 * s + w * 0.35, fyp - h * 0.45),
      ];
      flame.clear();
      shape(flame, tongue(1, 7.4 * fl)).fill({ color: 0xffa648, alpha: 0.95 });
      shape(flame, tongue(0.62, 4.6 * fl)).fill(0xfff2cc);

      // Light: trail ribbon and embers.
      light.clear();
      const [ta, tl, tc] = r.trail;
      if (tl > 0) {
        const n = 12;
        const spine = chain(P(fxp, fyp - 1), n, tl / (n - 1), ta, ta + tc, 0.22, t * 6, 0.6);
        const half = spine.map((_, i) => 2.3 * (1 - i / (n - 1)) ** 0.7 + 0.05);
        const { a, b } = strip(spine, half);
        for (let i = 0; i < n - 1; i++) {
          const f = i / (n - 1);
          const a0 = at(a, i);
          const a1 = at(a, i + 1);
          const b0 = at(b, i);
          const b1 = at(b, i + 1);
          light
            .poly([a0.x, a0.y, a1.x, a1.y, b1.x, b1.y, b0.x, b0.y])
            .fill({ color: 0xffb060, alpha: 0.42 * (1 - f) ** 1.6 });
        }
        curve(light, spine.slice(0, 8)).stroke({ width: 0.5, color: 0xfff0c8, alpha: 0.35, cap: 'round' });
      }
      const rising = Math.abs(r.ember.y) > Math.abs(r.ember.x);
      for (let k = 0; k < EMBERS; k++) {
        const age = (((t * 0.42 + k / EMBERS + 0.37 * Math.sin(k * 12.9)) % 1) + 1) % 1;
        const wob = Math.sin(k * 7.3 + age * 7 + t * 0.8) * (1.2 + 2.2 * age);
        const ex = fxp + w + r.ember.x * age ** 0.9 + wob * (rising ? 1 : 0.3);
        const ey = fyp - 6 + r.ember.y * age + wob * (rising ? 0.2 : 0.8) - 4 * age * age;
        const fade = (1 - age) ** 1.4 * Math.min(1, age * 8);
        light.circle(ex, ey, 0.35 + 0.55 * (1 - age)).fill({ color: 0xffc070, alpha: 0.9 * fade });
        light.circle(ex, ey, 1.6 * (1 - age * 0.5)).fill({ color: 0xff9040, alpha: 0.16 * fade });
      }

      // Glows. Hidden for the silhouette test, where only the solid shape should show.
      for (const gl of [aura, light, halo, core, eyeGlowA, eyeGlowB, fx]) gl.visible = !sil;
      aura.position.set(mix(d.chest.x, fxp, 0.25), mix(d.chest.y, fyp, 0.25));
      aura.alpha = 0.9 * pulse;
      halo.position.set(fxp, fyp - 1.5);
      halo.scale.set(pulse);
      halo.alpha = 0.92 * pulse;
      core.position.set(fxp, fyp - 1.5);
      core.scale.set(0.95 + (pulse - 1) * 2);
      eyeGlowA.position.set(d.eyes[0].x, d.eyes[0].y);
      eyeGlowB.position.set(d.eyes[1].x, d.eyes[1].y);
      eyeGlowA.alpha = 0.75 * r.eye * pulse;
      eyeGlowB.alpha = 0.75 * r.eye * pulse;
    };
    update(0);
    return { view, update: (t) => update(t) };
  },
};

export default wick;
