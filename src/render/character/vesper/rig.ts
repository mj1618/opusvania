// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Vesper's skeleton and animation.
 *
 * Same 2.5D idea as the hooded rig (poses authored in a forward frame: f forward, u up, a small
 * sideways s; projected through a continuous turn factor `d`, +1 right .. -1 left, so a
 * turn-around passes through the camera), tuned for a relaxed, floating mover:
 *
 *   - the run is a bounding lope: a long cycle (RUN_CYCLE px, a footfall every half of it), a short
 *     planted stance and a long float between footfalls; phase advances with distance, the stance
 *     is linear in phase, so planted feet do not slide;
 *   - nothing is driven straight from the blended pose except pelvis and feet: the spine lean, the
 *     head and the hip twist each follow through their own spring (so they trail the pelvis by
 *     different amounts), and the hands are dragged through world-space springs (they lag, swing
 *     past and settle on every start, stop, jump and landing);
 *   - springs on top: lean from acceleration, landing crouch, squash and stretch.
 */
import type { SimEvent } from '../../../sim/events';
import type { PlayerView } from '../../contract';
import {
  approach,
  bell,
  clamp,
  hermite,
  ik2,
  ikOut,
  lerp,
  noise1,
  pulse,
  Spring,
  sat,
  smoothstep,
  TAU,
} from '../hooded/math';

// --- Joints (x, y pairs in Frame.j), world px.
export const J_HIP = 0;
export const J_CHEST = 1;
export const J_NECK = 2;
export const J_HEAD = 3;
export const J_SH_A = 4;
export const J_SH_B = 5;
export const J_EL_A = 6;
export const J_EL_B = 7;
export const J_HAND_A = 8;
export const J_HAND_B = 9;
export const J_HIP_A = 10;
export const J_HIP_B = 11;
export const J_KNEE_A = 12;
export const J_KNEE_B = 13;
export const J_ANK_A = 14;
export const J_ANK_B = 15;
export const J_TOE_A = 16;
export const J_TOE_B = 17;
/** Where the antennae leave the brow (side A, side B). */
export const J_BROW_A = 18;
export const J_BROW_B = 19;
/** Base of the neck: the ruff, and the reference point of the wing roots. */
export const J_COLLAR = 20;
export const J_CENTRE = 21;
export const J_ORIGIN = 22;
export const J_COUNT = 23;

// --- Scalars (Frame.s).
export const S_D = 0;
export const S_CZ = 1;
export const S_DH = 2;
export const S_CZH = 3;
/** Head rotation on screen, radians (clockwise positive). */
export const S_HEADROT = 4;
export const S_EYE = 5;
export const S_LOOKY = 6;
/** 1 on the ground .. 0 in the air (smoothed). */
export const S_GROUND = 7;
/** Spine angles on screen (already multiplied by d). */
export const S_LEAN = 8;
export const S_UPPER = 9;
/** Gaze: forward (+) / back (-) in the head's frame, -1..1. */
export const S_LOOKX = 10;
/** Eye size multiplier (wide on take-off). */
export const S_WIDE = 11;
/** Somersault angle on screen, radians clockwise. */
export const S_SPIN = 12;
export const S_COUNT = 13;

// --- Pose channels.
const PF = 0; // pelvis forward
const PU = 1; // pelvis height above the ground point
const LEAN = 2; // spine lean forward, rad
const CURL = 3; // extra lean of the upper spine
const HT = 4; // head pitch on top of the stabilised head, rad (+ = nose down)
const AF = 5; // foot A ball: forward, up, pitch (heel lift, rad)
const AU = 6;
const AP = 7;
const BF = 8;
const BU = 9;
const BP = 10;
const HAF = 11; // hand A relative to its shoulder: forward, up
const HAU = 12;
const HBF = 13;
const HBU = 14;
const TW = 15; // hip twist, rad (shoulders counter-twist)
const EYE = 16; // eye openness
const LOOKY = 17; // gaze up (-) / down (+)
const HYAW = 18; // head turn as a fraction of the body's (lower = more toward the camera)
const NP = 19;

type Pose = Float32Array;

function pose(v: number[]): Pose {
  const p = new Float32Array(NP);
  p.set(v);
  return p;
}

// --- Proportions (world px).
export const BODY = {
  thigh: 15.5,
  shin: 16,
  foot: 5.2,
  upperArm: 8.4,
  foreArm: 8.8,
  spine: 13,
  neck: 4.5,
  headUp: 10.8,
  hipHalf: 2.9,
  shoulderHalf: 4.2,
  footHalf: 2.8,
  headW: 12.4,
  headH: 11.4,
  /** sin of the body's resting 3/4 angle. */
  sinYaw: 0.906,
  /** ... and of the head's (turned a little more toward the camera). */
  sinHeadYaw: 0.66,
} as const;

/** Run cycle in world px: a footfall every 128 px. */
export const RUN_CYCLE = 256;
/** Fraction of the cycle a foot is planted: the rest is float. */
const STANCE = 0.16;
const CONTACT_F = 18;

// Channel order: PF PU LEAN CURL HT | AF AU AP | BF BU BP | HAF HAU HBF HBU | TW EYE LOOKY HYAW
const RISE = pose([
  0, 32.5, 0.1, -0.08, -0.14, 3, 9, 0.9, -6, -1.5, 1.35, -3, -14, -7, -11, 0.1, 1, -0.25, 1,
]);
const APEXP = pose([0, 31, 0.04, 0.08, 0, 6, 12, 0.5, -1, 8, 0.9, -6, -10.5, 4, -10, 0.05, 1, 0, 1]);
const FALL = pose([-1, 33, -0.1, 0.02, 0.14, 5, 2, 0.5, -5, 6, 1.0, -9, -7, 8, -8, 0, 1, 0.4, 1]);
/**
 * The somersault's ball: pelvis back and high, spine curled right over, knees at the chest, heels
 * under the hips, hands clasped on the shins, chin down. Everything sits inside a circle about
 * the box centre (the pivot), so the spin is a steady round shape.
 */
const TUCK = pose([
  -14, 37, 1.0, 0.75, 2.0, -8.5, 22.5, 1.3, -10, 23.5, 1.35, -3.5, -13, -2, -12, 0, 0.85, 0.3, 1,
]);
/** Snapping out: a touch past the fall pose. Body long and open, legs reaching, arms wide. */
const OPEN = pose([0, 33.5, -0.12, -0.16, -0.14, 5, -2, 0.7, -5, -1, 1.1, -12, 1, 10, 0, 0, 1, 0.2, 1]);
/** Somersault duration, seconds. */
export const SPIN_T = 0.48;
/** Fractions of it over which the angular velocity eases in and out (quintic, so no corners). */
const SPIN_IN = 0.3;
const SPIN_OUT = 0.4;

function quintic(x: number): number {
  const t = sat(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
/** Integral of `quintic` from 0 to x (x in 0..1). */
function quinticArea(x: number): number {
  const t = sat(x);
  const t4 = t * t * t * t;
  return t4 * (t * t - 3 * t + 2.5);
}

/**
 * The somersault's angle 0..1 at progress u. Angular velocity rises on a quintic ease, holds,
 * and falls on a quintic ease to exactly zero at one whole turn: velocity AND acceleration are
 * continuous everywhere, so nothing reads as a snap. A curve, not a spring.
 */
function spinCurve(u: number): number {
  const a = SPIN_IN;
  const b = SPIN_OUT;
  const total = a / 2 + (1 - a - b) + b / 2;
  const x = sat(u);
  let area: number;
  if (x < a) area = a * quinticArea(x / a);
  else if (x < 1 - b) area = a / 2 + (x - a);
  else area = a / 2 + (1 - a - b) + b * (0.5 - quinticArea((1 - x) / b));
  return area / total;
}
/** Tuck amount at progress u: folds while already turning, unfolds while still turning. */
function tuckCurve(u: number): number {
  return quintic(u / 0.34) * (1 - quintic((u - 0.52) / 0.46));
}
const WALL = pose([
  3.5, 27, 0.14, 0.08, 0.12, 18.6, 15.5, -1.15, 18.6, 4, -1.2, 11.5, 9.5, 9, -3.5, 0.2, 1, 0.3, 0.5,
]);
const DASH = pose([-12, 31, 1.2, 0.06, -0.1, -36, 27, 1.45, -34, 33, 1.5, -14, -1, -13, 2.5, 0, 0.72, 0, 1]);
const SKID = pose([5, 24.5, 0.42, 0.1, -0.12, 10, 0, 0, -16, 0, 0.5, 5, -11, -9, -8, 0.2, 0.95, 0, 1]);

export interface Frame {
  j: Float32Array;
  s: Float32Array;
}

export function newFrame(): Frame {
  return { j: new Float32Array(J_COUNT * 2), s: new Float32Array(S_COUNT) };
}

/** What the rig tells its owner happened this frame (for particles and light). */
export interface RigSignals {
  spawned: boolean;
  doubleJump: boolean;
  jumped: boolean;
  landed: number;
  landHard: boolean;
  skid: boolean;
  dashStart: boolean;
  wallJump: boolean;
  /** The somersault opens out (the moment for the wings' burst). */
  opened: boolean;
}

/** A point dragged behind its target: lags, swings past, settles. */
class Drag2 {
  private readonly sx: Spring;
  private readonly sy: Spring;
  ox = 0;
  oy = 0;
  constructor(
    omega: number,
    zeta: number,
    private readonly gain: number,
    private readonly max: number,
  ) {
    this.sx = new Spring(0, omega, zeta);
    this.sy = new Spring(0, omega, zeta);
  }
  snap(x: number, y: number): void {
    this.sx.snap(x);
    this.sy.snap(y);
    this.ox = this.oy = 0;
  }
  step(x: number, y: number, dt: number): void {
    let ox = (this.sx.step(x, dt) - x) * this.gain;
    let oy = (this.sy.step(y, dt) - y) * this.gain;
    const k = 1 / (1 + Math.hypot(ox, oy) / this.max);
    ox *= k;
    oy *= k;
    this.ox = ox;
    this.oy = oy;
  }
}

export class Rig {
  readonly frame = newFrame();
  readonly sig: RigSignals = {
    spawned: true,
    doubleJump: false,
    jumped: false,
    landed: 0,
    landHard: false,
    skid: false,
    dashStart: false,
    wallJump: false,
    opened: false,
  };
  /** Forward-frame spine lean and head angle actually used (pose + springs), for the chains. */
  lean = 0;
  upper = 0;
  headAng = 0;
  /** Weights other systems read. */
  wIdle = 1;
  wDash = 0;
  wWall = 0;
  wRun = 0;
  wAir = 0;
  wSkid = 0;
  /** Air sub-blend: rising, composed at the apex, falling. */
  airRise = 0;
  airApex = 0;
  airFall = 0;
  /** Somersault: screen angle (rad, clockwise +), tuck weight 0..1, and the opening-out envelope 0..1. */
  spinPhi = 0;
  spinW = 0;
  openK = 0;
  /** Lingers after the opening (decays over ~0.5 s): the wings stay half spread through the rise. */
  openHold = 0;
  spinning = false;
  /** 0..1 of the top run speed, smoothed. */
  speedK = 0;
  /** Run phase 0..1. */
  phase = 0.3;
  /** Landing crouch in px (for cloth that should billow). */
  crouchPx = 0;

  private readonly yaw = new Spring(1, 26, 0.78);
  private readonly headYaw = new Spring(1, 40, 0.85);
  private readonly accS = new Spring(0, 13, 0.55);
  private readonly leanS = new Spring(0, 19, 0.68);
  private readonly curlS = new Spring(0, 15, 0.62);
  private readonly headS = new Spring(0, 12.5, 0.58);
  private readonly twS = new Spring(0, 24, 0.7);
  private readonly crouch = new Spring(0, 17, 0.52);
  private readonly squash = new Spring(0, 22, 0.55);
  private readonly velS = new Spring(0, 30, 0.9);
  private readonly lookS = new Spring(1, 4.5, 1);
  private readonly handA = new Drag2(19, 0.5, 0.3, 5.5);
  private readonly handB = new Drag2(16, 0.46, 0.3, 5.5);
  private spinA = 0;
  private spinVel = 0;
  private spinTarget = 0;
  private wasFree = false;
  private antic = 0;
  private readonly spinS = new Spring(0, 20, 1);
  private spinT = 0;
  private spinDir = 1;
  private spinFree = false;
  private openT = 1;
  private readonly gazeX = new Spring(0, 26, 0.85);
  private readonly gazeY = new Spring(0, 14, 0.9);
  private readonly wide = new Spring(1, 22, 0.5);
  private lastCx = 0;
  private lastCy = 0;
  private lastVx = 0;
  private blinkHold = 0;
  private vdx = 0;
  private vdy = -1;
  private readonly out: Pose = new Float32Array(NP);
  private readonly tmp: Pose = new Float32Array(NP);
  private readonly tmp2: Pose = new Float32Array(NP);
  private readonly tmp3: Pose = new Float32Array(NP);
  private readonly legOut = { f: 0, u: 0, p: 0 };

  update(dt: number, clock: number, p: PlayerView, events: readonly SimEvent[]): void {
    const sig = this.sig;
    sig.spawned = false;
    sig.doubleJump = false;
    sig.jumped = false;
    sig.landed = 0;
    sig.landHard = false;
    sig.skid = false;
    sig.dashStart = false;
    sig.wallJump = false;
    sig.opened = false;
    let startSpin = false;

    for (const e of events) {
      switch (e.type) {
        case 'spawn':
          sig.spawned = true;
          break;
        case 'jump':
          sig.jumped = true;
          this.squash.v += 3.2;
          if (e.kind === 'double') {
            sig.doubleJump = true;
            startSpin = true;
          } else if (e.kind === 'wall') {
            sig.wallJump = true;
            this.squash.v += 1;
          }
          break;
        case 'land':
          sig.landed = e.vy;
          sig.landHard = e.hard;
          this.squash.v -= clamp(e.vy * 0.16, 0.5, 3.6);
          this.crouch.v += clamp(e.vy * 11, 26, 230);
          break;
        case 'dashStart':
          sig.dashStart = true;
          this.squash.v -= 1.6;
          break;
        case 'skid':
          sig.skid = true;
          break;
        case 'headBump':
          this.squash.v -= 3;
          break;
        case 'wallSlideStart':
          this.crouch.v += 36;
          break;
        default:
          break;
      }
    }
    if (Math.abs(p.cx - this.lastCx) > 160 || Math.abs(p.feetY - this.lastCy) > 160) sig.spawned = true;

    const dirT = p.motion === 'wallSlide' && p.wallDir !== 0 ? p.wallDir : p.facing;
    const spawned = sig.spawned;
    if (spawned) {
      this.yaw.snap(dirT);
      this.headYaw.snap(dirT);
      this.lookS.snap(1);
      this.accS.snap(0);
      this.crouch.snap(0);
      this.squash.snap(0);
      this.velS.snap(0);
      this.wIdle = 1;
      this.wRun = this.wAir = this.wWall = this.wDash = this.wSkid = 0;
      this.spinA = 0;
      this.spinning = false;
      this.spinW = 0;
      this.spinPhi = 0;
      this.openT = 1;
      this.openK = 0;
      this.openHold = 0;
      this.gazeX.snap(0);
      this.gazeY.snap(0);
      this.wide.snap(1);
      startSpin = false;
      this.speedK = 0;
      this.lastCx = p.cx;
      this.lastVx = p.vx;
      this.phase = 0.3;
      this.frame.s[S_GROUND] = p.grounded ? 1 : 0;
    }
    const dx = p.cx - this.lastCx;
    this.lastCx = p.cx;
    this.lastCy = p.feetY;

    // --- Turn.
    const d = clamp(this.yaw.step(dirT, dt), -1, 1);
    const sgn = d >= 0 ? 1 : -1;

    // --- Pose weights.
    const speed = Math.abs(p.vx);
    const dash = p.motion === 'dash';
    const wall = p.motion === 'wallSlide';
    const air = !p.grounded && !dash && !wall;
    const skid = p.motion === 'skid';
    const ground = p.grounded && !dash && !skid;
    const runT = ground ? smoothstep(0.3, 5, speed) : 0;
    if (ground && this.wRun < 0.04 && runT > 0 && this.wAir < 0.2) this.phase = 0.26;
    this.wDash += ((dash ? 1 : 0) - this.wDash) * approach(dash ? 34 : 11, dt);
    this.wWall += ((wall ? 1 : 0) - this.wWall) * approach(wall ? 14 : 20, dt);
    this.wAir += ((air ? 1 : 0) - this.wAir) * approach(air ? 24 : 26, dt);
    this.wSkid += ((skid ? 1 : 0) - this.wSkid) * approach(skid ? 26 : 13, dt);
    this.wRun += (runT - this.wRun) * approach(runT > this.wRun ? 18 : 10, dt);
    this.wIdle += ((ground ? 1 - runT : 0) - this.wIdle) * approach(11, dt);
    this.speedK += (sat(speed / 9.6) - this.speedK) * approach(9, dt);

    // --- Run phase: by distance, signed by the facing so moving backwards runs it backwards.
    if (p.grounded && !dash) {
      this.phase += (dx * sgn) / RUN_CYCLE;
      this.phase -= Math.floor(this.phase);
    }

    // --- Blend the poses.
    const out = this.out;
    out.fill(0);
    let wSum = 0;
    const add = (src: Pose, w: number): void => {
      if (w <= 1e-4) return;
      for (let i = 0; i < NP; i++) out[i]! += src[i]! * w;
      wSum += w;
    };
    if (this.wIdle > 1e-4) add(this.idlePose(clock), this.wIdle);
    if (this.wRun > 1e-4) add(this.runPose(this.phase), this.wRun);
    if (this.wAir > 1e-4) add(this.airPose(p, clock, sgn), this.wAir);
    add(WALL, this.wWall);
    add(DASH, this.wDash);
    add(SKID, this.wSkid);
    if (wSum < 1e-3) add(this.idlePose(clock), 1);
    for (let i = 0; i < NP; i++) out[i]! /= wSum;

    // --- Double jump: snap into a ball, one clean turn, snap out.
    if (startSpin) {
      this.spinning = true;
      this.spinFree = false;
      this.spinT = 0;
      this.spinA = 0;
      this.wasFree = false;
      this.spinDir = Math.abs(p.vx) > 1.5 ? (p.vx > 0 ? 1 : -1) : sgn;
      this.openT = 1;
    }
    if (this.spinning) {
      if (p.grounded || dash || wall) this.spinFree = true;
      if (this.spinFree) {
        // Cut short: carry the turn's own momentum into a critically damped settle on the nearest
        // upright (no kink in angular velocity), and let go of the tuck.
        if (!this.wasFree) {
          this.spinS.x = this.spinA;
          this.spinS.v = this.spinVel;
          this.spinTarget = this.spinA + this.spinVel * 0.06 > Math.PI ? TAU : 0;
        }
        const a0 = this.spinA;
        this.spinA = this.spinS.step(this.spinTarget, dt);
        if (dt > 0) this.spinVel = (this.spinA - a0) / dt;
        this.spinW += (0 - this.spinW) * approach(20, dt);
        if (
          Math.abs(this.spinA - this.spinTarget) < 0.004 &&
          Math.abs(this.spinS.v) < 0.1 &&
          this.spinW < 0.01
        )
          this.spinning = false;
      } else {
        const u0 = this.spinT / SPIN_T;
        this.spinT += dt;
        const u = this.spinT / SPIN_T;
        const a0 = this.spinA;
        this.spinA = TAU * spinCurve(u);
        if (dt > 0) this.spinVel = (this.spinA - a0) / dt;
        this.spinW = tuckCurve(u);
        // Anticipation: the arms lift and the body lengthens for a moment, flowing into the fold.
        this.antic = bell(u / 0.3);
        if (u0 < 0.62 && u >= 0.62) {
          sig.opened = true;
          this.openT = 0;
        }
        if (u >= 1) this.spinning = false;
      }
      this.wasFree = this.spinFree;
      if (!this.spinning) {
        this.spinA = 0;
        this.spinW = 0;
        this.spinVel = 0;
        this.antic = 0;
      }
      this.spinW = sat(this.spinW);
      this.spinPhi = this.spinA * this.spinDir;
    }
    if (this.spinW > 1e-4) {
      const w = this.spinW;
      for (let i = 0; i < NP; i++) out[i] = lerp(out[i]!, TUCK[i]!, w);
    }
    if (this.antic > 1e-3) {
      const k = this.antic * (1 - this.spinW);
      out[HAU]! += 9 * k;
      out[HBU]! += 8 * k;
      out[HAF]! += 3 * k;
      out[PU]! += 1.5 * k;
      out[CURL]! -= 0.12 * k;
    }
    if (this.openT < 1) {
      // Opening out overshoots the fall pose a little, then settles into it.
      this.openT = Math.min(1, this.openT + (dt / 0.42) * (p.grounded || dash || wall ? 4 : 1));
      this.openK = quintic(this.openT / 0.4) * (1 - quintic((this.openT - 0.4) / 0.6));
      const w = this.openK * (1 - this.spinW) * 0.9;
      for (let i = 0; i < NP; i++) out[i] = lerp(out[i]!, OPEN[i]!, w);
    } else this.openK = 0;
    if (sig.opened) this.openHold = 1;
    this.openHold *= Math.exp(-(p.grounded || dash || wall ? 14 : 2.2) * dt);

    // --- Springs layered on top.
    const ax = (p.vx - this.lastVx) / Math.max(dt * 60, 0.25);
    this.lastVx = p.vx;
    const accT = p.grounded ? clamp(ax * sgn * 0.07, -0.3, 0.3) : clamp(ax * sgn * 0.03, -0.14, 0.14);
    const accLean = this.accS.step(dash ? 0 : accT, dt);
    const crouch = clamp(this.crouch.step(0, dt), -2.2, 10);
    this.crouchPx = crouch;
    const sq = clamp(this.squash.step(0, dt), -0.14, 0.13) * (1 - this.spinW);
    out[PU]! -= crouch;
    out[LEAN]! += accLean + crouch * 0.012;
    out[HT]! += crouch * 0.02 - accLean * 0.45;

    // Follow-through down the spine: each part chases the pose through its own spring.
    if (spawned) {
      this.leanS.snap(out[LEAN]!);
      this.curlS.snap(out[CURL]!);
      this.headS.snap(out[HT]!);
      this.twS.snap(out[TW]!);
    }
    // In the ball (and snapping out of it) the pose is taken straight: no part may lag out of it.
    const direct = Math.max(this.spinW, this.openK * 0.7);
    const lean = lerp(this.leanS.step(out[LEAN]!, dt), out[LEAN]!, direct);
    const curl = lerp(this.curlS.step(out[CURL]!, dt), out[CURL]!, direct);
    const ht = lerp(this.headS.step(out[HT]!, dt), out[HT]!, direct);
    const tw = this.twS.step(out[TW]!, dt);

    // A slow blink now and then; eyes close briefly on a hard landing.
    let blink = Math.max(bell(pulse(clock, 4.7, 0.34, 5, 0.9)), bell(pulse(clock, 11.3, 0.3, 9, 0.6)));
    if (sig.landHard) this.blinkHold = 0.16;
    this.blinkHold = Math.max(0, this.blinkHold - dt);
    if (this.blinkHold > 0) blink = Math.max(blink, 0.7 * sat(this.blinkHold / 0.07));

    // --- Solve the skeleton.
    const j = this.frame.j;
    const s = this.frame.s;
    const cz = Math.sqrt(Math.max(0, 1 - (d * BODY.sinYaw) ** 2));
    const look = this.lookS.step(out[HYAW]!, dt);
    const dh = clamp(this.headYaw.step(dirT, dt) * look, -1, 1);
    const czh = Math.sqrt(Math.max(0, 1 - (dh * BODY.sinHeadYaw) ** 2));
    const ox = p.cx;
    const oy = p.feetY;
    const upper = lean + curl;
    const headAng = upper * 0.3 + ht;
    this.lean = lean;
    this.upper = upper;
    this.headAng = headAng;

    const sl = Math.sin(lean);
    const cl = Math.cos(lean);
    const su = Math.sin(upper);
    const cu = Math.cos(upper);
    const sh = Math.sin(headAng);
    const ch = Math.cos(headAng);

    const hipX = ox + out[PF]! * d;
    const hipY = oy - out[PU]!;
    const chestX = hipX + sl * d * BODY.spine;
    const chestY = hipY - cl * BODY.spine;
    const neckX = chestX + su * d * BODY.neck;
    const neckY = chestY - cu * BODY.neck;
    const headX = neckX + su * d * 1.5 + sh * dh * BODY.headUp;
    const headY = neckY - cu * 1.5 - ch * BODY.headUp;
    set(j, J_HIP, hipX, hipY);
    set(j, J_CHEST, chestX, chestY);
    set(j, J_NECK, neckX, neckY);
    set(j, J_HEAD, headX, headY);
    set(j, J_COLLAR, chestX + su * d * 3.4, chestY - cu * 3.4);
    set(j, J_ORIGIN, ox, oy);
    set(j, J_CENTRE, ox, oy - 40);
    // Antenna roots on the brow: head-local forward 2.6, up 7.6, one each side.
    const bx = headX + (ch * 2.6 + sh * 9.2) * dh;
    const by = headY + sh * 2.6 - ch * 9.2;
    set(j, J_BROW_A, bx - czh * 2.6, by);
    set(j, J_BROW_B, bx + czh * 2.6, by - 0.4);

    // Hips and shoulders: sideways offsets seen through the turn, with twist.
    const latHip = cz * Math.cos(tw) - d * BODY.sinYaw * Math.sin(tw);
    const latSh = cz * Math.cos(-tw * 0.8) - d * BODY.sinYaw * Math.sin(-tw * 0.8);
    const shX = chestX + su * d * 2.6;
    const shY = chestY - cu * 2.6;
    const bendLeg = clamp(-d * 1.7, -1, 1);
    const bendArm = clamp(d * 1.7, -1, 1);
    for (let side = 0; side < 2; side++) {
      const sd = side === 0 ? 1 : -1;
      const hx = hipX - sd * latHip * BODY.hipHalf;
      const hy = hipY + 1;
      set(j, J_HIP_A + side, hx, hy);
      const bf = out[side === 0 ? AF : BF]!;
      const bu = out[side === 0 ? AU : BU]!;
      const bp = out[side === 0 ? AP : BP]!;
      const ballX = ox + bf * d - sd * cz * BODY.footHalf;
      const ballY = oy - bu;
      // The ankle sits behind and above the ball as the heel lifts.
      const ankX = ballX - Math.cos(bp) * BODY.foot * 0.72 * d;
      const ankY = ballY - Math.sin(bp) * BODY.foot * 0.72 - 1.5;
      ik2(hx, hy, ankX, ankY, BODY.thigh, BODY.shin, bendLeg, 0.24);
      set(j, J_KNEE_A + side, ikOut.x, ikOut.y);
      set(j, J_ANK_A + side, ikOut.ex, ikOut.ey);
      // The toe rolls about the planted ball, so a planted foot stays put whatever the leg does.
      set(j, J_TOE_A + side, ballX + Math.cos(bp) * 2.1 * d, ballY + Math.sin(bp) * 2.1 - 0.5);

      const sx = shX - sd * latSh * BODY.shoulderHalf;
      const sy = shY;
      set(j, J_SH_A + side, sx, sy);
      const hf = out[side === 0 ? HAF : HBF]!;
      const hu = out[side === 0 ? HAU : HBU]!;
      // Hands are dragged: the pose says where, the drag says how late. Not on the wall (they grip).
      const drag = side === 0 ? this.handA : this.handB;
      // On a wall the hands go to the wall's face itself, wherever the shoulders are.
      const tx = lerp(sx + hf * d, ox + d * (p.w / 2 - 1.4), this.wWall);
      const ty = sy - hu;
      if (spawned) drag.snap(tx, ty);
      drag.step(tx, ty, dt);
      const free = (1 - this.wWall) * (1 - this.spinW);
      ik2(sx, sy, tx + drag.ox * free, ty + drag.oy * free, BODY.upperArm, BODY.foreArm, bendArm, 0.12);
      set(j, J_EL_A + side, ikOut.x, ikOut.y);
      set(j, J_HAND_A + side, ikOut.ex, ikOut.ey);
    }

    // --- Whole-body squash and stretch (subtle), volume-preserving.
    const gT = p.grounded ? 1 : 0;
    s[S_GROUND]! += (gT - s[S_GROUND]!) * approach(gT ? 30 : 18, dt);
    const g = s[S_GROUND]!;
    const v = Math.hypot(p.vx, p.vy);
    if (v > 0.5) {
      const k = approach(18, dt);
      this.vdx += (p.vx / v - this.vdx) * k;
      this.vdy += (p.vy / v - this.vdy) * k;
    }
    const stretchT = dash ? (p.freeze > 0 ? -0.05 : 0.1) : (1 - g) * smoothstep(8, 22, v) * 0.07;
    const st = 1 + this.velS.step(stretchT, dt) * (1 - this.spinW);
    const vl = Math.hypot(this.vdx, this.vdy) || 1;
    const ux = this.vdx / vl;
    const uy = this.vdy / vl;
    const sy = 1 + sq;
    const sx = 1 / sy;
    const pivX = ox;
    const pivY = oy - 40 * (1 - g);
    const cX = ox;
    const cY = oy - 40;
    const inv = 1 / st;
    for (let i = 0; i < J_COUNT; i++) {
      if (i === J_ORIGIN) continue;
      const x = pivX + (j[i * 2]! - pivX) * sx;
      const y = pivY + (j[i * 2 + 1]! - pivY) * sy;
      const rx = x - cX;
      const ry = y - cY;
      const along = rx * ux + ry * uy;
      const across = -rx * uy + ry * ux;
      j[i * 2] = cX + ux * along * st - uy * across * inv;
      j[i * 2 + 1] = cY + uy * along * st + ux * across * inv;
    }

    // The somersault turns the whole solved figure about the box centre.
    const phi = this.spinPhi;
    if (phi !== 0) {
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      for (let i = 0; i < J_COUNT; i++) {
        if (i === J_ORIGIN || i === J_CENTRE) continue;
        const rx = j[i * 2]! - cX;
        const ry = j[i * 2 + 1]! - cY;
        j[i * 2] = cX + rx * cp - ry * sp;
        j[i * 2 + 1] = cY + rx * sp + ry * cp;
      }
    }

    // --- Eyes: they look where she is going, widen on take-off, dart a little at rest.
    if (sig.jumped) this.wide.v += 2.6;
    const slot = Math.floor(clock / 2.3);
    const dart = this.wIdle * (noise1(slot * 1.7, 61) * 0.7);
    const dartY = this.wIdle * (noise1(slot * 1.3, 67) * 0.35);
    const gx = this.gazeX.step(clamp((p.vx * sgn) / 9.6, -1, 1) * 0.55 + dart, dt);
    const gy = this.gazeY.step(p.grounded ? dartY : clamp(p.vy / 14, -1, 1) * 0.85, dt);
    const wideK = this.wide.step(1, dt);

    s[S_D] = d;
    s[S_CZ] = cz;
    s[S_DH] = dh;
    s[S_CZH] = czh;
    s[S_HEADROT] = headAng * dh + phi;
    s[S_EYE] = Math.min(1, out[EYE]!) * (1 - blink);
    s[S_LOOKY] = out[LOOKY]! * 0.5 + gy;
    s[S_LOOKX] = gx;
    s[S_WIDE] = clamp(wideK, 0.85, 1.25);
    s[S_LEAN] = lean * d + phi;
    s[S_UPPER] = upper * d + phi;
  }

  /** At ease: weight on the back hip, slow uneven breath, small drifts that never line up. */
  private idlePose(clock: number): Pose {
    const o = this.tmp;
    // Breath: quicker in than out.
    const bp = clock * 0.21;
    const breath = Math.sin(TAU * (bp + 0.06 * Math.sin(TAU * bp)));
    const shift = noise1(clock * 0.13, 3);
    const sway = noise1(clock * 0.31, 17);
    const nod = noise1(clock * 0.19, 29);
    const glance = pulse(clock, 8.3, 3.4, 11, 0.8);
    const gl = glance > 0 ? smoothstep(0, 0.22, glance) * (1 - smoothstep(0.72, 1, glance)) : 0;
    o[PF] = -1.4 + shift * 1.5;
    o[PU] = 30.1 + breath * 0.55 - Math.abs(shift) * 0.5;
    o[LEAN] = -0.03 + breath * 0.012 + sway * 0.025 - shift * 0.02;
    o[CURL] = 0.05 - breath * 0.035;
    o[HT] = -0.04 + nod * 0.07 + gl * 0.05 - breath * 0.012;
    o[AF] = 6.2;
    o[AU] = 0;
    o[AP] = 0;
    o[BF] = -3.4;
    o[BU] = 0;
    o[BP] = 0;
    o[HAF] = 2.2 + sway * 1.1;
    o[HAU] = -14.6 + breath * 0.5;
    o[HBF] = -1.8 - sway * 0.9;
    o[HBU] = -14.9 + breath * 0.22 + nod * 0.3;
    o[TW] = 0.1 + shift * 0.1;
    o[EYE] = 0.82;
    o[LOOKY] = 0.05 + nod * 0.15;
    o[HYAW] = 1 - gl * 0.75;
    return o;
  }

  /** One leg of the lope at phase `ph` (0 = this foot's contact). */
  private leg(ph: number): void {
    const o = this.legOut;
    const f = ph - Math.floor(ph);
    const F1 = CONTACT_F - RUN_CYCLE * STANCE;
    if (f < STANCE) {
      const t = f / STANCE;
      o.f = CONTACT_F - RUN_CYCLE * f;
      // Lands on the ball with the toe a touch up, rolls, peels the heel late.
      o.p = t < 0.18 ? lerp(-0.16, 0, t / 0.18) : t < 0.5 ? 0 : 1.1 * ((t - 0.5) / 0.5) ** 1.5;
      o.u = Math.max(0, -Math.sin(o.p)) * BODY.foot * 0.7;
    } else {
      const t = (f - STANCE) / (1 - STANCE);
      const span = RUN_CYCLE * (1 - STANCE);
      // Leaves with the ground's speed, hangs back, swings through late and reaches.
      o.f = hermite(F1, -span * 0.34, CONTACT_F, -span * 0.5, t);
      const lift = Math.sin(Math.PI * t ** 0.62);
      o.u = 17 * lift ** 1.25 * (1 - 0.35 * smoothstep(0.45, 0.9, t)) + 2.2 * Math.sin(Math.PI * t);
      if (t < 0.16) o.p = lerp(1.1, 1.55, smoothstep(0, 0.16, t));
      else if (t < 0.62) o.p = lerp(1.55, 0.35, smoothstep(0.16, 0.62, t));
      else if (t < 0.9) o.p = lerp(0.35, -0.34, smoothstep(0.62, 0.9, t));
      else o.p = lerp(-0.34, -0.16, smoothstep(0.9, 1, t));
      o.u += Math.max(0, -Math.sin(o.p)) * BODY.foot * 0.7 * smoothstep(0.86, 1, t);
    }
  }

  /** A light bounding lope: upright, floating between footfalls, arms loose and low behind. */
  private runPose(ph: number): Pose {
    const o = this.tmp2;
    const k = this.speedK;
    this.leg(ph);
    o[AF] = this.legOut.f;
    o[AU] = this.legOut.u;
    o[AP] = this.legOut.p;
    this.leg(ph + 0.5);
    o[BF] = this.legOut.f;
    o[BU] = this.legOut.u;
    o[BP] = this.legOut.p;
    // Body height: lowest just after mid-stance, a long soft top in the float.
    const x = 2 * (ph - STANCE * 0.5 - 0.02);
    const c1 = Math.cos(TAU * x);
    const c2 = Math.cos(2 * TAU * x);
    const rise = 0.5 - 0.5 * c1 + 0.14 * (0.5 - 0.5 * c2);
    o[PF] = 1.2 + 0.9 * Math.sin(TAU * (x - 0.12));
    o[PU] = 28.6 + 9.2 * rise ** 0.72;
    o[LEAN] = 0.05 + 0.09 * k - 0.03 * c1;
    o[CURL] = 0.05 + 0.02 * Math.cos(TAU * (x - 0.2));
    // The head stays level: it gives back what the spine leans.
    o[HT] = -0.04 - 0.04 * k + 0.012 * Math.cos(TAU * (x - 0.3));
    // Arms: low, behind the hips, open; a small lazy swing against the legs.
    const a = Math.sin(TAU * (ph - 0.07));
    const b = Math.sin(TAU * (ph - 0.16));
    o[HAF] = -7.5 + 4.2 * a;
    o[HAU] = -13.4 + 1.4 * a * a + 0.8 * rise;
    o[HBF] = -8 - 3.6 * b;
    o[HBU] = -13 + 1.2 * b * b + 0.8 * rise;
    o[TW] = 0.2 * Math.sin(TAU * (ph + 0.2));
    o[EYE] = 1;
    o[LOOKY] = 0;
    o[HYAW] = 1;
    return o;
  }

  private airPose(p: PlayerView, clock: number, sgn: number): Pose {
    const o = this.tmp3;
    const r = smoothstep(-2.5, -11, p.vy);
    const fl = smoothstep(2, 12, p.vy);
    const tk = Math.max(0, 1 - r - fl);
    this.airRise = r;
    this.airApex = tk;
    this.airFall = fl;
    for (let i = 0; i < NP; i++) o[i] = RISE[i]! * r + APEXP[i]! * tk + FALL[i]! * fl;
    const vf = clamp((p.vx * sgn) / 9.6, -1.4, 1.4);
    const steer = clamp(p.inputX * sgn, -1, 1);
    o[LEAN]! += 0.1 * vf + 0.05 * steer;
    o[PF]! += 1.5 * vf;
    // Slow uneven drift in the limbs so a long fall is alive.
    const k1 = noise1(clock * 1.3, 41);
    const k2 = noise1(clock * 1.1, 43);
    o[AF]! += k1 * 1.2;
    o[BF]! -= k2 * 1.2;
    o[AU]! += k2 * 0.8 * fl;
    o[HAU]! += k1 * 1.1 * fl;
    o[HBU]! += k2 * 1.1 * fl;
    o[HAF]! += k2 * 0.8;
    return o;
  }
}

function set(j: Float32Array, i: number, x: number, y: number): void {
  j[i * 2] = x;
  j[i * 2 + 1] = y;
}
