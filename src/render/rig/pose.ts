import type { Colour } from '../../sim/events';
import { moveDef, moveTotal } from '../../sim/player/moves';
import type { MoveState, PlayerState } from '../../sim/state';
import { ANIM, BODY } from './look';
import {
  add,
  clamp,
  clamp01,
  easeInOutQuad,
  easeOutBack,
  easeOutCubic,
  easeOutQuad,
  hash01,
  hump,
  lerp,
  lerpV,
  quad,
  smooth,
  upDir,
  type V2,
  v,
} from './math';

/**
 * A pose in rig space (origin = feet centre, +x = facing, +y = down). Hands and feet are IK
 * targets; everything is a plain number so poses blend with `mixPose`.
 */
export interface Pose {
  hip: V2;
  /** Torso angle from vertical, + = leaning forward. */
  lean: number;
  /** Head angle relative to the torso, + = chin down / forward. */
  head: number;
  footF: V2;
  footB: V2;
  /** F = lead (far) glove, B = rear (near) glove. */
  handF: V2;
  handB: V2;
  /** Arm length multipliers (strike smear stretch). */
  reachF: number;
  reachB: number;
  /** Elbow side for the IK (+1 = below/behind the reach line). */
  elbowF: number;
  elbowB: number;
  /** Whole-body rotation about the body centre (flips, lying down), and a drop after it. */
  spin: number;
  drop: number;
  sx: number;
  sy: number;
  /** 1 open, 0 shut, negative = screwed shut (hurt). */
  eye: number;
  /** The cap lifting off her head (px). */
  capLift: number;
}

/** Event-driven animation memory, stepped once per sim step by KidRig. */
export interface RigMem {
  frame: number;
  /** Frames since each event (large = long ago). */
  landT: number;
  landK: number;
  jumpT: number;
  wallJumpT: number;
  djT: number;
  pogoT: number;
  hurtT: number;
  riseT: number;
  flexT: number;
  spillT: number;
  turnT: number;
  tickT: number;
  idleT: number;
  /** Distance run on the ground (px), the stride clock. */
  runDist: number;
  /** Colour of the sound in her throwing hand (levy wind-up). */
  levyColour: Colour | null;
  /** The move's outcome was a take (the yank). */
  took: boolean;
}

export const LONG_AGO = 1e6;

export function newMem(): RigMem {
  return {
    frame: 0,
    landT: LONG_AGO,
    landK: 0,
    jumpT: LONG_AGO,
    wallJumpT: LONG_AGO,
    djT: LONG_AGO,
    pogoT: LONG_AGO,
    hurtT: LONG_AGO,
    riseT: LONG_AGO,
    flexT: LONG_AGO,
    spillT: LONG_AGO,
    turnT: LONG_AGO,
    tickT: LONG_AGO,
    idleT: 0,
    runDist: 0,
    levyColour: null,
    took: false,
  };
}

export interface PoseCtx {
  p: PlayerState;
  mem: RigMem;
  maxRun: number;
  maxFall: number;
}

// --- helpers ---

/** Shoulder (rig space) for a hip and lean: where arm targets are measured from. */
export function shoulderOf(hip: V2, lean: number): V2 {
  return add(hip, scale2(upDir(lean), BODY.shoulderAt));
}

function scale2(a: V2, k: number): V2 {
  return { x: a.x * k, y: a.y * k };
}

function base(): Pose {
  return {
    hip: v(0, BODY.hipY),
    lean: 0.1,
    head: 0,
    footF: v(9, 0),
    footB: v(-9, 0),
    handF: v(17, -50),
    handB: v(10, -46),
    reachF: 1,
    reachB: 1,
    elbowF: 1,
    elbowB: 1,
    spin: 0,
    drop: 0,
    sx: 1,
    sy: 1,
    eye: 1,
    capLift: 0,
  };
}

export function mixPose(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    hip: lerpV(a.hip, b.hip, t),
    lean: lerp(a.lean, b.lean, t),
    head: lerp(a.head, b.head, t),
    footF: lerpV(a.footF, b.footF, t),
    footB: lerpV(a.footB, b.footB, t),
    handF: lerpV(a.handF, b.handF, t),
    handB: lerpV(a.handB, b.handB, t),
    reachF: lerp(a.reachF, b.reachF, t),
    reachB: lerp(a.reachB, b.reachB, t),
    elbowF: lerp(a.elbowF, b.elbowF, t),
    elbowB: lerp(a.elbowB, b.elbowB, t),
    spin: lerp(a.spin, b.spin, t),
    drop: lerp(a.drop, b.drop, t),
    sx: lerp(a.sx, b.sx, t),
    sy: lerp(a.sy, b.sy, t),
    eye: lerp(a.eye, b.eye, t),
    capLift: lerp(a.capLift, b.capLift, t),
  };
}

/**
 * Drawn pose chases the target with overlap: the hips lead, hands and head trail (rates per
 * step). `snap` (a strike's hot frames) makes the hands exact so the glove matches the hitbox.
 */
export function followPose(cur: Pose, target: Pose, rate: number, snap: boolean): Pose {
  const hand = snap ? 1 : Math.min(1, rate * 1.05);
  const body = snap ? Math.min(1, rate * 1.4) : rate;
  const head = rate * 0.75;
  const feet = Math.min(1, rate * 1.6);
  return {
    hip: lerpV(cur.hip, target.hip, body),
    lean: lerp(cur.lean, target.lean, body),
    head: lerp(cur.head, target.head, head),
    footF: lerpV(cur.footF, target.footF, feet),
    footB: lerpV(cur.footB, target.footB, feet),
    handF: lerpV(cur.handF, target.handF, hand),
    handB: lerpV(cur.handB, target.handB, hand),
    reachF: lerp(cur.reachF, target.reachF, hand),
    reachB: lerp(cur.reachB, target.reachB, hand),
    elbowF: lerp(cur.elbowF, target.elbowF, hand),
    elbowB: lerp(cur.elbowB, target.elbowB, hand),
    // Spins and drops are keyed exactly (a flip must finish on time and never unwind).
    spin: target.spin,
    drop: target.drop,
    sx: target.sx,
    sy: target.sy,
    eye: target.eye,
    capLift: lerp(cur.capLift, target.capLift, 0.5),
  };
}

// --- locomotion ---

function idle(ctx: PoseCtx): Pose {
  const f = ctx.mem.frame;
  const P = ANIM.idleBounce;
  const ph = (f / P) * Math.PI * 2;
  const b = (1 - Math.cos(ph)) / 2;
  const bLag = (1 - Math.cos(ph - 0.9)) / 2;
  const bLag2 = (1 - Math.cos(ph - 1.4)) / 2;
  const pose = base();
  pose.hip = v(1, BODY.hipY + 2 - 2.5 * b);
  pose.lean = 0.12 + 0.02 * Math.sin(ph - 0.5);
  pose.footF = v(11, 0);
  pose.footB = v(-11, -1.5 * b);
  pose.handF = v(17, -51 - 2 * bLag);
  pose.handB = v(10, -47 - 2 * bLag2);
  pose.head = 0.06 * Math.sin(ph - 1.2);
  // Fidget after standing still a while: thumb to the nose, a sniff, a shoulder roll.
  const it = ctx.mem.idleT - ANIM.idleFidgetAfter;
  if (it > 0) {
    const cyc = ANIM.idleFidgetAfter + ANIM.idleFidgetLen;
    const ft = it % cyc;
    if (ft < ANIM.idleFidgetLen) {
      const t = ft / ANIM.idleFidgetLen;
      const k = hump(t);
      const flick = t > 0.25 && t < 0.75 ? Math.abs(Math.sin(t * 28)) : 0;
      pose.handB = lerpV(pose.handB, v(11 + 2 * flick, -66), smooth(k * 1.6));
      pose.head = lerp(pose.head, -0.18 + 0.1 * flick, k);
      pose.eye = 1 - 0.6 * k;
    }
  }
  return pose;
}

function run(ctx: PoseCtx, s: number): Pose {
  const m = ctx.mem;
  const stride = lerp(ANIM.strideWalk, ANIM.strideRun, s);
  const ph = (m.runDist / stride) * Math.PI * 2;
  const A = 8 + 14 * s;
  const lift = 6 + 11 * s;
  const foot = (th: number): V2 => {
    const c = Math.cos(th);
    const sn = Math.sin(th);
    // Stance (sin >= 0): planted, sliding back. Swing: up, with the heel kicking high behind.
    const y = sn < 0 ? lift * sn - 9 * s * Math.max(0, -c) * -sn : 0;
    return v(A * c + 3 * s, y);
  };
  const pose = base();
  pose.footF = foot(ph);
  pose.footB = foot(ph + Math.PI);
  pose.hip = v(3 * s, BODY.hipY + 1 + s * (3 * Math.abs(Math.sin(ph)) - 2));
  pose.lean = 0.1 + ANIM.runLeanMax * s;
  const sh = shoulderOf(pose.hip, pose.lean);
  // Fighter's jog: gloves stay up, pumping short and opposite the legs.
  const pump = Math.cos(ph);
  pose.handF = add(sh, v(12 - 8 * s * pump, 5 + 3 * s * Math.sin(ph)));
  pose.handB = add(sh, v(6 + 8 * s * pump, 9 - 3 * s * Math.sin(ph)));
  pose.head = -0.12 * s + 0.04 * Math.sin(ph * 2);
  return pose;
}

function skid(): Pose {
  const pose = base();
  pose.hip = v(-4, BODY.hipY + 5);
  pose.lean = -0.28;
  pose.footF = v(15, 0);
  pose.footB = v(-4, 0);
  pose.handF = v(20, -62);
  pose.handB = v(-4, -64);
  pose.head = 0.15;
  return pose;
}

function air(ctx: PoseCtx): Pose {
  const { p, mem } = ctx;
  const rise = base();
  rise.hip = v(0, BODY.hipY - 2);
  rise.lean = 0.14;
  rise.footF = v(9, -15);
  rise.footB = v(-7, -2);
  rise.handF = v(18, -64);
  rise.handB = v(6, -52);
  rise.head = -0.12;
  const apex = base();
  apex.hip = v(0, BODY.hipY - 3);
  apex.lean = 0.04;
  apex.footF = v(8, -16);
  apex.footB = v(-3, -13);
  apex.handF = v(15, -55);
  apex.handB = v(6, -51);
  apex.head = 0.05;
  const fall = base();
  fall.hip = v(0, BODY.hipY - 3);
  fall.lean = -0.06;
  fall.footF = v(7, 0);
  fall.footB = v(-8, -5);
  fall.handF = v(19, -66);
  fall.handB = v(-9, -64);
  fall.head = 0.12;
  let pose: Pose;
  const k = clamp01((p.vy + 5) / 12);
  if (k < 0.5) pose = mixPose(rise, apex, smooth(k * 2));
  else pose = mixPose(apex, fall, smooth((k - 0.5) * 2));
  // Fast fall: legs straight, arms up, a small stretch.
  const ff = clamp01((p.vy - ctx.maxFall * 0.8) / (ctx.maxFall * 0.6));
  if (ff > 0) {
    const dive = base();
    dive.hip = v(0, BODY.hipY - 4);
    dive.lean = -0.02;
    dive.footF = v(4, 2);
    dive.footB = v(-5, 1);
    dive.handF = v(12, -80);
    dive.handB = v(-6, -78);
    dive.head = 0.2;
    dive.sy = 1.06;
    dive.sx = 0.94;
    pose = mixPose(pose, dive, ff);
  }
  // Take-off: the push leg stays extended for a few frames (stretch before the tuck).
  if (mem.jumpT < 6) {
    const t = mem.jumpT / 6;
    const push = { ...pose, footB: v(-4, 3), footF: v(6, -6), hip: v(0, BODY.hipY - 4) };
    pose = mixPose(push, pose, easeOutQuad(t));
  }
  return pose;
}

function wallSlide(ctx: PoseCtx): Pose {
  const f = ctx.mem.frame;
  const pose = base();
  // Facing is away from the wall, so the wall is behind her (x = -20).
  const shake = Math.sin(f * 1.7) * 0.8;
  pose.hip = v(-4, BODY.hipY - 1);
  pose.lean = -0.1;
  pose.handB = v(-19, -63 + shake);
  pose.elbowB = -1;
  pose.handF = v(14, -54);
  pose.footB = v(-17, -12);
  pose.footF = v(5, -1);
  pose.head = 0.14;
  pose.eye = 0.75;
  return pose;
}

function wallJump(ctx: PoseCtx, air0: Pose): Pose {
  const t = ctx.mem.wallJumpT / ANIM.wallJumpFrames;
  const push = base();
  push.hip = v(2, BODY.hipY - 3);
  push.lean = 0.42;
  push.footB = v(-15, -1);
  push.footF = v(-5, -11);
  push.handF = v(28, -66);
  push.handB = v(-10, -52);
  push.head = -0.15;
  push.sx = 1.06;
  push.sy = 0.96;
  return mixPose(push, air0, easeInOutQuad(clamp01(t)));
}

function dash(ctx: PoseCtx): Pose {
  const p = ctx.p;
  const pose = base();
  if (p.freeze > 0 && p.dashTimer > 0) {
    // The coil before the Slip fires: sink and lean back.
    pose.hip = v(-3, BODY.hipY + 5);
    pose.lean = -0.18;
    pose.handF = v(14, -52);
    pose.handB = v(8, -48);
    pose.footF = v(9, 0);
    pose.footB = v(-11, 0);
    pose.head = 0.2;
    pose.eye = 0.5;
    return pose;
  }
  pose.hip = v(2, BODY.hipY + 6);
  pose.lean = 0.7;
  pose.head = 0.2;
  pose.handF = v(24, -44);
  pose.handB = v(16, -40);
  pose.footF = v(13, p.grounded ? 0 : -6);
  pose.footB = v(-24, p.grounded ? -3 : -9);
  pose.eye = 0.45;
  pose.sx = 1.08;
  pose.sy = 0.94;
  return pose;
}

function flip(ctx: PoseCtx, air0: Pose): Pose {
  const t = ctx.mem.djT / ANIM.djFrames;
  const tuck = base();
  tuck.hip = v(0, BODY.hipY - 6);
  tuck.lean = 0.25;
  tuck.footF = v(8, -22);
  tuck.footB = v(0, -19);
  tuck.handF = v(14, -36);
  tuck.handB = v(9, -33);
  tuck.head = 0.35;
  tuck.eye = 0.2;
  const out = t < 0.7 ? tuck : mixPose(tuck, air0, smooth((t - 0.7) / 0.3));
  out.spin = Math.PI * 2 * easeInOutQuad(clamp01(t / 0.85));
  if (out.spin >= Math.PI * 2 - 1e-3) out.spin = 0;
  return out;
}

function pogo(ctx: PoseCtx, air0: Pose): Pose {
  const t = ctx.mem.pogoT / ANIM.pogoFrames;
  const up = base();
  up.hip = v(0, BODY.hipY - 5);
  up.lean = 0.05;
  up.footF = v(8, -18);
  up.footB = v(-4, -15);
  up.handF = v(12, -80);
  up.handB = v(-2, -58);
  up.head = -0.25;
  return mixPose(up, air0, smooth(t));
}

// --- moves (timing from content/moves.json, so the glove matches the hitbox frames) ---

export interface MovePhase {
  stage: 'startup' | 'active' | 'recovery';
  /** 0..1 within the stage. */
  t: number;
  /** 1-based frame within the stage. */
  n: number;
  /** Stage length. */
  len: number;
}

export function movePhase(m: MoveState): MovePhase {
  const d = moveDef(m.id);
  const S = d.startup;
  const A = d.spawnFrame !== undefined ? 1 : d.active;
  const R = Math.max(1, moveTotal(m) - S - A);
  const f = m.frame;
  if (f <= S) return { stage: 'startup', t: f / Math.max(1, S), n: f, len: S };
  if (f <= S + A) return { stage: 'active', t: (f - S) / Math.max(1, A), n: f - S, len: A };
  return { stage: 'recovery', t: (f - S - A) / R, n: f - S - A, len: R };
}

/** 1 at full extension, easing back through recovery (hold 2 frames, then a springy return). */
function recoverK(ph: MovePhase, hold = 2): number {
  if (ph.stage !== 'recovery') return 1;
  const u = clamp01((ph.n - hold) / Math.max(1, ph.len - hold));
  return 1 - easeOutBack(u, 1.4);
}

function jab(g: Pose, ph: MovePhase, reach: V2): Pose {
  const p = { ...g };
  const sh = shoulderOf(g.hip, g.lean);
  if (ph.stage === 'startup') {
    const t = easeOutQuad(ph.t);
    p.lean = lerp(g.lean, 0.02, t);
    p.hip = add(g.hip, v(-1.5 * t, 1 * t));
    p.handF = lerpV(g.handF, add(sh, v(7, -3)), t);
    return p;
  }
  const k = recoverK(ph);
  p.lean = lerp(g.lean, 0.26, k);
  p.hip = add(g.hip, v(6 * k, 1.5 * k));
  p.footF = add(g.footF, v(5 * k, 0));
  p.handF = lerpV(g.handF, reach, k);
  p.reachF = lerp(1, ANIM.armStretch, ph.stage === 'active' ? 1 : k * k);
  p.elbowF = lerp(1, 0.2, k);
  p.handB = add(g.handB, v(-2 * k, -4 * k));
  p.head = g.head + 0.1 * k;
  return p;
}

function cross(g: Pose, ph: MovePhase, reach: V2): Pose {
  const p = { ...g };
  const sh = shoulderOf(g.hip, g.lean);
  if (ph.stage === 'startup') {
    const t = easeOutQuad(ph.t);
    p.lean = lerp(g.lean, -0.14, t);
    p.hip = add(g.hip, v(-4 * t, 2 * t));
    p.handB = lerpV(g.handB, add(sh, v(-6, 3)), t);
    p.handF = lerpV(g.handF, add(sh, v(12, -8)), t);
    p.footB = add(g.footB, v(-2 * t, 0));
    return p;
  }
  const k = recoverK(ph, 3);
  p.lean = lerp(g.lean, 0.42, k);
  p.hip = add(g.hip, v(9 * k, 2 * k));
  p.footF = add(g.footF, v(7 * k, 0));
  p.footB = add(g.footB, v(3 * k, -4 * k));
  p.handB = lerpV(g.handB, reach, k);
  p.reachB = lerp(1, ANIM.armStretch, ph.stage === 'active' ? 1 : k * k);
  p.elbowB = lerp(1, 0.2, k);
  p.handF = lerpV(g.handF, add(sh, v(10, -10)), k);
  p.head = g.head + 0.14 * k;
  p.sx = 1 + 0.06 * k;
  return p;
}

function uppercut(g: Pose, ph: MovePhase, reach: V2): Pose {
  const p = { ...g };
  if (ph.stage === 'startup') {
    // Dip: sink into the knees, glove dropped low and cocked.
    const t = easeOutQuad(ph.t);
    p.hip = add(g.hip, v(2 * t, 8 * t));
    p.lean = lerp(g.lean, 0.3, t);
    p.head = lerp(g.head, 0.25, t);
    p.handB = lerpV(g.handB, v(8, -28), t);
    p.handF = lerpV(g.handF, v(15, -50), t);
    p.sx = 1 + 0.06 * t;
    p.sy = 1 - 0.06 * t;
    return p;
  }
  const k = recoverK(ph);
  const low = v(14, -30);
  const out = v(24, -64);
  const u = ph.stage === 'active' ? clamp01(ph.n / 2) : 1;
  p.handB = lerpV(g.handB, quad(low, out, reach, easeOutCubic(u)), k);
  p.reachB = lerp(1, ANIM.armStretch, ph.stage === 'active' ? 1 : k * k);
  p.elbowB = 1;
  p.hip = add(g.hip, v(3 * k, -7 * k));
  p.lean = lerp(g.lean, -0.14, k);
  p.head = lerp(g.head, -0.35, k);
  p.footF = add(g.footF, v(0, -3 * k));
  p.footB = add(g.footB, v(2 * k, -2 * k));
  p.handF = lerpV(g.handF, v(12, -46), k);
  p.sx = 1 - 0.05 * k;
  p.sy = 1 + 0.07 * k;
  return p;
}

function overhand(g: Pose, ph: MovePhase, reach: V2): Pose {
  const p = { ...g };
  if (ph.stage === 'startup') {
    const t = easeOutQuad(ph.t);
    p.handF = lerpV(g.handF, v(-6, -84), t);
    p.elbowF = -1;
    p.lean = lerp(g.lean, -0.25, t);
    p.head = lerp(g.head, -0.1, t);
    p.footF = v(8, -14);
    p.footB = v(-6, -10);
    return p;
  }
  const k = recoverK(ph);
  const top = v(-6, -84);
  const mid = v(34, -44);
  const u = ph.stage === 'active' ? clamp01(ph.n / 2) : 1;
  p.handF = lerpV(g.handF, quad(top, mid, reach, easeOutCubic(u)), k);
  p.reachF = lerp(1, ANIM.armStretch, ph.stage === 'active' ? 1 : k * k);
  p.elbowF = lerp(-1, 1, u);
  p.lean = lerp(g.lean, 0.6, k);
  p.head = lerp(g.head, 0.35, k);
  p.hip = add(g.hip, v(0, -4 * k));
  p.footF = lerpV(g.footF, v(10, -20), k);
  p.footB = lerpV(g.footB, v(-6, -17), k);
  p.handB = lerpV(g.handB, v(4, -46), k);
  return p;
}

function seize(g: Pose, ph: MovePhase, m: MoveState, took: boolean): Pose {
  const p = { ...g };
  const dirT: Record<string, V2> = { fwd: v(34, -48), up: v(8, -96), down: v(10, 4) };
  const target = dirT[m.dir] ?? v(34, -48);
  let k: number;
  if (ph.stage === 'startup') k = easeOutCubic(ph.t);
  else if (ph.stage === 'active') k = 1;
  else if (took) k = Math.max(0, 1 - ph.n / 3);
  else k = ph.n <= 3 ? 1 : Math.max(0, 1 - (ph.n - 3) / 5);
  p.handF = lerpV(g.handF, target, k);
  p.reachF = lerp(1, 1.35, k);
  p.elbowF = lerp(1, 0.3, k);
  p.lean = lerp(g.lean, m.dir === 'up' ? -0.05 : 0.32, k);
  p.hip = add(g.hip, v(5 * k, 0));
  p.handB = lerpV(g.handB, v(-6, -52), k);
  p.head = g.head + (m.dir === 'up' ? -0.3 : m.dir === 'down' ? 0.35 : 0.08) * k;
  if (took && ph.stage === 'recovery') {
    // The yank: she hauls the sound in and rocks back on her heels.
    const y = hump(clamp01(ph.n / ph.len));
    p.lean = lerp(p.lean, -0.3, y);
    p.hip = add(p.hip, v(-5 * y, 1 * y));
    p.handB = lerpV(p.handB, v(-2, -66), y);
    p.head = p.head - 0.2 * y;
    p.eye = 1 - 0.5 * y;
  }
  return p;
}

function levy(g: Pose, ph: MovePhase, m: MoveState): Pose {
  const p = { ...g };
  const sh = shoulderOf(g.hip, g.lean);
  const back = add(sh, v(-15, -9));
  const rel: Record<string, V2> = { fwd: v(34, -56), up: v(8, -96), down: v(18, -2) };
  const fol: Record<string, V2> = { fwd: v(20, -30), up: v(20, -72), down: v(6, 2) };
  const r = rel[m.dir] ?? v(34, -56);
  const fo = fol[m.dir] ?? v(20, -30);
  if (ph.stage === 'startup') {
    // Reach over the shoulder into the sack.
    const t = easeOutQuad(ph.t);
    p.handB = lerpV(g.handB, back, t);
    p.elbowB = lerp(1, -1, t);
    p.lean = lerp(g.lean, -0.2, t);
    p.hip = add(g.hip, v(-3 * t, 1 * t));
    p.handF = lerpV(g.handF, v(20, -60), t);
    p.head = g.head - 0.1 * t;
    return p;
  }
  if (ph.stage === 'active') {
    p.handB = r;
    p.reachB = 1.3;
    p.lean = m.dir === 'up' ? -0.12 : 0.4;
    p.hip = add(g.hip, v(6, 1));
    p.handF = v(4, -50);
    p.head = g.head + (m.dir === 'up' ? -0.3 : 0.15);
    return p;
  }
  // Follow-through, then home.
  const t = ph.t;
  const ft = clamp01(t * 2.2);
  const home = clamp01((t - 0.45) / 0.55);
  p.handB = lerpV(lerpV(r, fo, easeOutQuad(ft)), g.handB, smooth(home));
  p.reachB = lerp(1.3, 1, ft);
  p.lean = lerp(m.dir === 'up' ? -0.12 : 0.4, g.lean, smooth(home));
  p.hip = add(g.hip, v(6 * (1 - smooth(home)), 1 * (1 - smooth(home))));
  p.handF = lerpV(v(4, -50), g.handF, smooth(home));
  return p;
}

function swallow(g: Pose, ctx: PoseCtx): Pose {
  const p = { ...g };
  const f = ctx.mem.frame;
  const gulp = Math.max(0, Math.sin(f * 0.5));
  p.handF = v(15, -64 + gulp);
  p.handB = v(10, -61 + gulp);
  p.lean = -0.08;
  p.head = -0.42 + 0.08 * gulp;
  p.hip = add(g.hip, v(0, 2 + gulp));
  p.eye = 0.2;
  return p;
}

// --- reactions ---

function hurt(g: Pose, ctx: PoseCtx): Pose {
  const t = ctx.mem.hurtT / ANIM.hurtFrames;
  const k = 1 - easeOutCubic(clamp01(t));
  const p = { ...g };
  p.lean = lerp(g.lean, -0.5, k);
  p.head = lerp(g.head, -0.45, k);
  p.hip = add(g.hip, v(-5 * k, 2 * k));
  p.handF = lerpV(g.handF, v(18, -74), k);
  p.handB = lerpV(g.handB, v(-15, -68), k);
  p.footF = lerpV(g.footF, v(12, ctx.p.grounded ? -8 : -12), k);
  p.eye = ctx.mem.hurtT < 10 ? -1 : g.eye;
  p.capLift = 5 * k;
  return p;
}

/** Down for the Count: flat on her back, gloves flopped, twitching on each beat. */
function lying(ctx: PoseCtx): Pose {
  const p = base();
  const tw = ctx.mem.tickT < 8 ? hump(ctx.mem.tickT / 8) : 0;
  p.hip = v(0, BODY.hipY);
  p.lean = 0;
  p.head = -0.25;
  p.footF = v(12, -8);
  p.footB = v(-1, 0);
  p.handF = v(18, -54 - 8 * tw);
  p.handB = v(-2, -80);
  p.elbowB = 1;
  p.spin = -Math.PI / 2;
  p.drop = 27;
  p.eye = -1;
  return p;
}

/** Beat the Count: spring up, then both gloves in the air (the champ is back). */
function rising(ctx: PoseCtx, g: Pose): Pose {
  const t = ctx.mem.riseT;
  const up = clamp01(t / 10);
  const lie = lying(ctx);
  const champ = { ...g };
  const b = Math.abs(Math.sin(t * 0.35)) * (1 - clamp01((t - 20) / 24));
  champ.handF = v(12, -86 - 3 * b);
  champ.handB = v(-8, -84 - 3 * b);
  champ.elbowB = -1;
  champ.hip = add(g.hip, v(0, -2 * b));
  champ.lean = 0;
  champ.head = -0.2;
  champ.eye = 0.35;
  if (up < 1) {
    const r = mixPose(lie, champ, easeOutBack(up, 1.2));
    r.spin = lerp(-Math.PI / 2, 0, easeOutBack(up, 1.2));
    r.drop = lerp(27, 0, up);
    return r;
  }
  return mixPose(champ, g, smooth((t - 30) / (ANIM.riseFrames - 30)));
}

function flex(ctx: PoseCtx, g: Pose): Pose {
  const t = ctx.mem.flexT / ANIM.flexFrames;
  const k = hump(clamp01(t * 1.2));
  const p = { ...g };
  p.handF = lerpV(g.handF, v(14, -74), k);
  p.handB = lerpV(g.handB, v(-12, -72), k);
  p.elbowF = lerp(g.elbowF, 1, k);
  p.elbowB = lerp(g.elbowB, 1, k);
  p.lean = lerp(g.lean, -0.05, k);
  p.head = lerp(g.head, -0.15, k);
  p.eye = lerp(1, 0.3, k);
  p.sx = 1 + 0.06 * k;
  return p;
}

function spill(ctx: PoseCtx, g: Pose): Pose {
  const t = ctx.mem.spillT / 24;
  const k = hump(clamp01(t));
  const p = { ...g };
  p.lean = lerp(g.lean, 0.5, k);
  p.head = lerp(g.head, 0.45, k);
  p.handB = lerpV(g.handB, v(12, -58), k);
  p.hip = add(g.hip, v(0, 4 * k));
  p.eye = 1 - k;
  return p;
}

/** Blink: two shut frames every few seconds, keyed to the frame (deterministic). */
function blink(frame: number): number {
  const period = 200;
  const cyc = Math.floor(frame / period);
  const at = Math.floor(hash01(cyc + 17) * (period - 12));
  const f = frame % period;
  return f >= at && f < at + 4 ? 0.1 : 1;
}

// --- the state machine ---

export interface PoseResult {
  pose: Pose;
  /** Hands must be exact this frame (a strike's hot frames). */
  snap: boolean;
  rate: number;
}

/**
 * The target pose for a player state (pure). `reach` gives the rig-space point a strike's glove
 * aims at (the far end of its hitbox), so the arm is honest to the collision data.
 */
export function targetPose(ctx: PoseCtx, reach: (m: MoveState) => V2): PoseResult {
  const { p, mem } = ctx;
  let rate: number = ANIM.follow;
  let snap = false;
  if (p.down) return { pose: lying(ctx), snap: true, rate: 1 };

  // Locomotion layer.
  let pose: Pose;
  if (p.state === 'dash') {
    pose = dash(ctx);
    rate = 0.7;
  } else if (p.state === 'wallSlide') pose = wallSlide(ctx);
  else if (p.grounded) {
    const s = clamp01(Math.abs(p.vx) / ctx.maxRun);
    if (p.skid) pose = skid();
    else pose = mixPose(idle(ctx), run(ctx, s), smooth(s / 0.3));
  } else {
    const a = air(ctx);
    if (mem.djT < ANIM.djFrames) {
      pose = flip(ctx, a);
      rate = 1;
    } else if (mem.pogoT < ANIM.pogoFrames) pose = pogo(ctx, a);
    else if (mem.wallJumpT < ANIM.wallJumpFrames) pose = wallJump(ctx, a);
    else pose = a;
  }

  // Landing: knees soak up the impact (the juice squash stacks on top).
  if (p.grounded && mem.landT < ANIM.landFrames && p.state !== 'dash') {
    const k = mem.landK * (1 - easeOutQuad(mem.landT / ANIM.landFrames));
    pose = { ...pose };
    pose.hip = add(pose.hip, v(1, 10 * k));
    pose.lean += 0.22 * k;
    pose.handF = add(pose.handF, v(2, 7 * k));
    pose.handB = add(pose.handB, v(2, 8 * k));
    pose.head += 0.15 * k;
    pose.footF = add(pose.footF, v(2 * k, 0));
    pose.footB = add(pose.footB, v(-3 * k, 0));
  }

  // Action layer (timing from move frame data).
  const m = p.move;
  if (m) {
    const d = moveDef(m.id);
    const ph = movePhase(m);
    rate = ANIM.followMove;
    const hot = ph.stage === 'active' || (ph.stage === 'recovery' && ph.n <= 2);
    if (d.kind === 'strike') {
      snap = hot;
      const r = reach(m);
      if (m.id === 'jab') pose = jab(pose, ph, r);
      else if (m.id === 'cross') pose = cross(pose, ph, r);
      else if (m.id === 'uppercut') pose = uppercut(pose, ph, r);
      else if (m.id === 'overhand') pose = overhand(pose, ph, r);
      else pose = jab(pose, ph, r);
    } else if (d.kind === 'seize') {
      snap = ph.stage === 'active';
      pose = seize(pose, ph, m, mem.took);
    } else if (d.kind === 'levy') {
      snap = ph.stage !== 'startup' && ph.n <= 2;
      pose = levy(pose, ph, m);
    } else if (d.kind === 'swallow') pose = swallow(pose, ctx);
  }

  if (mem.riseT < ANIM.riseFrames) pose = rising(ctx, pose);
  if (mem.flexT < ANIM.flexFrames && !m) pose = flex(ctx, pose);
  if (mem.spillT < 24) pose = spill(ctx, pose);
  if (mem.hurtT < ANIM.hurtFrames) pose = hurt(pose, ctx);

  // Turning on the spot: a quick squeeze sells the flip.
  if (mem.turnT < ANIM.turnFrames && p.grounded) {
    const k = 1 - mem.turnT / ANIM.turnFrames;
    pose = { ...pose, sx: pose.sx * (1 - 0.18 * k) };
  }
  if (pose.eye > 0) pose = { ...pose, eye: Math.min(pose.eye, blink(mem.frame)) };
  return { pose, snap, rate: clamp(rate, 0, 1) };
}
