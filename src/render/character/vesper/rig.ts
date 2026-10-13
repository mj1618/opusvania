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
export const S_COUNT = 10;

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
  headUp: 10.2,
  hipHalf: 2.9,
  shoulderHalf: 4.2,
  footHalf: 2.8,
  headW: 11.6,
  headH: 10.8,
  /** sin of the body's resting 3/4 angle. */
  sinYaw: 0.906,
  /** ... and of the head's (turned a little more toward the camera). */
  sinHeadYaw: 0.66,
} as const;

/** Run cycle in world px: a footfall every 128 px. */
export const RUN_CYCLE = 256;
/** Fraction of the cycle a foot is planted: the rest is float. */
const STANCE = 0.18;
const CONTACT_F = 19;

// Channel order: PF PU LEAN CURL HT | AF AU AP | BF BU BP | HAF HAU HBF HBU | TW EYE LOOKY HYAW
const RISE = pose([
  0, 32.5, 0.1, -0.08, -0.14, 3, 9, 0.9, -6, -1.5, 1.35, -3, -14, -7, -11, 0.1, 1, -0.25, 1,
]);
const TUCK = pose([0, 31, 0.04, 0.08, 0, 6, 12, 0.5, -1, 8, 0.9, -6, -10.5, 4, -10, 0.05, 1, 0, 1]);
const FALL = pose([-1, 33, -0.1, 0.02, 0.14, 5, 2, 0.5, -5, 6, 1.0, -9, -7, 8, -8, 0, 1, 0.4, 1]);
/** The double-jump beat: chest open, arms swept wide and back, legs trailing long. */
const OPEN = pose([0, 32, -0.06, -0.2, -0.2, 2, 4, 1.2, -6, 0, 1.35, -12, 3, -9, 5, 0, 1, -0.3, 1]);
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
  /** Double-jump beat progress 0..1 (1 = idle). */
  beat = 1;
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
            this.beat = 0;
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
      this.beat = 1;
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

    // --- Double jump: one open, arched beat, then she gathers again.
    if (this.beat < 1) {
      this.beat = Math.min(1, this.beat + (dt / 0.62) * (p.grounded || dash || wall ? 3 : 1));
      const w = smoothstep(0, 0.16, this.beat) * (1 - smoothstep(0.34, 0.95, this.beat)) * 0.9;
      for (let i = 0; i < NP; i++) out[i] = lerp(out[i]!, OPEN[i]!, w);
    }

    // --- Springs layered on top.
    const ax = (p.vx - this.lastVx) / Math.max(dt * 60, 0.25);
    this.lastVx = p.vx;
    const accT = p.grounded ? clamp(ax * sgn * 0.07, -0.3, 0.3) : clamp(ax * sgn * 0.03, -0.14, 0.14);
    const accLean = this.accS.step(dash ? 0 : accT, dt);
    const crouch = clamp(this.crouch.step(0, dt), -2.2, 10);
    this.crouchPx = crouch;
    const sq = clamp(this.squash.step(0, dt), -0.14, 0.13);
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
    const lean = this.leanS.step(out[LEAN]!, dt);
    const curl = this.curlS.step(out[CURL]!, dt);
    const ht = this.headS.step(out[HT]!, dt);
    const tw = this.twS.step(out[TW]!, dt);

    // A slow blink now and then; eyes close briefly on a hard landing.
    let blink = Math.max(bell(pulse(clock, 4.7, 0.26, 5, 0.9)), bell(pulse(clock, 11.3, 0.22, 9, 0.6)));
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
    const bx = headX + (ch * 2.8 + sh * 8.6) * dh;
    const by = headY + sh * 2.8 - ch * 8.6;
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
      const tx = sx + hf * d;
      const ty = sy - hu;
      if (spawned) drag.snap(tx, ty);
      drag.step(tx, ty, dt);
      const free = 1 - this.wWall;
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
    const st = 1 + this.velS.step(stretchT, dt);
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

    s[S_D] = d;
    s[S_CZ] = cz;
    s[S_DH] = dh;
    s[S_CZH] = czh;
    s[S_HEADROT] = headAng * dh;
    s[S_EYE] = Math.min(1, out[EYE]!) * (1 - blink);
    s[S_LOOKY] = out[LOOKY]!;
    s[S_LEAN] = lean * d;
    s[S_UPPER] = upper * d;
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
    o[EYE] = 1;
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
      o.u = 14.5 * lift ** 1.25 * (1 - 0.35 * smoothstep(0.45, 0.9, t)) + 2.2 * Math.sin(Math.PI * t);
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
    const x = 2 * (ph - STANCE * 0.5 - 0.035);
    const c1 = Math.cos(TAU * x);
    const c2 = Math.cos(2 * TAU * x);
    const rise = 0.5 - 0.5 * c1 + 0.14 * (0.5 - 0.5 * c2);
    o[PF] = 1.2 + 0.9 * Math.sin(TAU * (x - 0.12));
    o[PU] = 27.4 + 4.2 * rise;
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
    for (let i = 0; i < NP; i++) o[i] = RISE[i]! * r + TUCK[i]! * tk + FALL[i]! * fl;
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
