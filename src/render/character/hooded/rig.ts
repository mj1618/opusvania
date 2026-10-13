// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Ember's skeleton and animation.
 *
 * The body is a 2.5D rig: poses are authored in the character's "forward frame" (f = toward the
 * facing direction, u = up, plus a small sideways offset s for the left/right shoulder, hip, ear)
 * and projected to the screen through a continuous turn factor `d` (+1 facing right .. -1 facing
 * left). Mid-turn `d` passes through 0: forward offsets collapse, sideways ones open up, so a
 * turn-around is a real quick turn through the camera, never a mirror flip.
 *
 * Animation = a handful of pose generators (idle, run, air, wall, dash, skid), each continuous in
 * time, cross-faded by smoothed weights, plus springs layered on top (lean from acceleration,
 * landing crouch, squash and stretch, the double-jump spin). Feet are solved with 2-bone IK
 * against targets given relative to the ground point under the body; the run cycle's phase
 * advances with distance travelled and its stance is linear in phase, so planted feet do not slide.
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
} from './math';

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
/** Where the hood's crest leaves the head. */
export const J_CREST = 18;
/** Where the mantle hangs from (base of the neck). */
export const J_COLLAR = 19;
/** The ember: the clasp at the throat. */
export const J_CLASP = 20;
export const J_CENTRE = 21;
export const J_ORIGIN = 22;
export const J_COUNT = 23;

// --- Scalars (Frame.s).
/** Body turn factor -1..1 and its sideways visibility 0..1. */
export const S_D = 0;
export const S_CZ = 1;
/** Head turn factor and sideways visibility. */
export const S_DH = 2;
export const S_CZH = 3;
/** Head rotation on screen, radians (clockwise positive). */
export const S_HEADROT = 4;
/** Eye openness (1 normal, 0 shut). */
export const S_EYE = 5;
export const S_LOOKY = 6;
/** Mantle flare 0..1+ (opens like a wing). */
export const S_FLARE = 7;
/** 1 on the ground .. 0 in the air (smoothed). */
export const S_GROUND = 8;
/** Ember brightness multiplier. */
export const S_EMBER = 9;
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
const CREST = 16; // crest lift, rad (+ = raised, - = pressed back)
const FLARE = 17; // mantle flare
const EYE = 18; // eye openness
const LOOKY = 19; // gaze up (-) / down (+)
const HYAW = 20; // head turn as a fraction of the body's (lower = more toward the camera)
const NP = 21;

type Pose = Float32Array;

function pose(v: number[]): Pose {
  const p = new Float32Array(NP);
  p.set(v);
  return p;
}

// --- Proportions (world px).
export const BODY = {
  thigh: 16,
  shin: 16.5,
  foot: 6.5,
  upperArm: 8.2,
  foreArm: 8.6,
  spine: 13,
  neck: 6,
  headUp: 11,
  hipHalf: 3.2,
  shoulderHalf: 4.6,
  footHalf: 3,
  headW: 12.6,
  headH: 12.4,
  /** sin of the body's resting 3/4 angle (65 degrees off the camera axis). */
  sinYaw: 0.906,
  /** ... and of the head's (turned a little more toward the camera). */
  sinHeadYaw: 0.7,
} as const;

/** Run cycle length in world px: one footfall every 96 px, matching the sim's `step` event. */
const CYCLE = 192;
/** Fraction of the cycle a foot is planted. */
const STANCE = 0.26;
const CONTACT_F = 19;

// Channel order: PF PU LEAN CURL HT | AF AU AP | BF BU BP | HAF HAU HBF HBU | TW CREST FLARE EYE LOOKY HYAW
const RISE = pose([
  0, 33, 0.08, -0.05, -0.12, 4, 8, 1.0, -5, -1, 1.3, -4, -13, -6, -12, 0.1, 0, 0.2, 1, -0.2, 1,
]);
const TUCK = pose([
  0, 31.5, 0.06, 0.1, 0.02, 5, 11, 0.6, -2, 7, 0.9, -5, -11, 3, -11, 0.05, 0.1, 0.55, 1, 0, 1,
]);
const FALL = pose([
  -1, 33.5, -0.06, 0.04, 0.14, 4, 1, 0.6, -5, 4.5, 1.0, -9, -3, 7, -2, 0, 0.25, 1, 1, 0.4, 1,
]);
/** The double-jump beat: arms spread, mantle thrown open. */
const OPEN = pose([0, 32, 0, -0.1, -0.1, 3, 6, 1.1, -4, 2, 1.2, -11, 2, 10, 3, 0, 0.2, 1.5, 1, -0.2, 1]);
const WALL = pose([
  2.5, 27.5, 0.16, 0.1, 0.16, 18.5, 15, -1.15, 18.5, 4.5, -1.2, 12, 10, -4, -11, 0.2, 0.3, 0.7, 1, 0.4, 0.45,
]);
const DASH = pose([
  -12, 32, 1.18, 0.1, -0.06, -37, 28, 1.45, -36, 33, 1.5, -13, -2, -12, 1, 0, -0.3, 0.1, 0.8, 0, 1,
]);
const SKID = pose([4, 24, 0.45, 0.12, -0.15, 9, 0, 0, -17, 0, 0.5, 3, -12, -8, -9, 0.2, 0, 0.3, 0.95, 0, 1]);

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
  landed: number;
  landHard: boolean;
  skid: boolean;
  dashStart: boolean;
  wallJump: boolean;
}

export class Rig {
  readonly frame = newFrame();
  readonly sig: RigSignals = {
    spawned: true,
    doubleJump: false,
    landed: 0,
    landHard: false,
    skid: false,
    dashStart: false,
    wallJump: false,
  };
  /** Crest lift from the blended pose (radians). */
  crestLift = 0;
  /** Forward-frame spine lean and head angle actually used (pose + springs), for the chains. */
  lean = 0;
  upper = 0;
  headAng = 0;
  /** Weights other systems read. */
  wDash = 0;
  wWall = 0;
  wRun = 0;
  wAir = 0;

  private readonly yaw = new Spring(1, 30, 0.8);
  private readonly headYaw = new Spring(1, 44, 0.85);
  private readonly leanS = new Spring(0, 14, 0.62);
  private readonly crouch = new Spring(0, 19, 0.72);
  private readonly squash = new Spring(0, 22, 0.6);
  private readonly velS = new Spring(0, 30, 0.9);
  private readonly lookS = new Spring(1, 4.5, 1);
  private wIdle = 1;
  private wSkid = 0;
  private phase = 0.3;
  private lastCx = 0;
  private lastCy = 0;
  private lastVx = 0;
  private openT = 1;
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
          this.squash.v += 3;
          if (e.kind === 'double') {
            sig.doubleJump = true;
            this.openT = 0;
          } else if (e.kind === 'wall') {
            sig.wallJump = true;
            this.squash.v += 1;
          }
          break;
        case 'land':
          sig.landed = e.vy;
          sig.landHard = e.hard;
          this.squash.v -= clamp(e.vy * 0.2, 0.6, 4.5);
          this.crouch.v += clamp(e.vy * 12, 30, 260);
          break;
        case 'dashStart':
          sig.dashStart = true;
          this.squash.v -= 1.8;
          break;
        case 'skid':
          sig.skid = true;
          break;
        case 'headBump':
          this.squash.v -= 3;
          break;
        case 'wallSlideStart':
          this.crouch.v += 40;
          break;
        default:
          break;
      }
    }
    if (Math.abs(p.cx - this.lastCx) > 160 || Math.abs(p.feetY - this.lastCy) > 160) sig.spawned = true;

    const dirT = p.motion === 'wallSlide' && p.wallDir !== 0 ? p.wallDir : p.facing;
    if (sig.spawned) {
      this.yaw.snap(dirT);
      this.headYaw.snap(dirT);
      this.lookS.snap(1);
      this.leanS.snap(0);
      this.crouch.snap(0);
      this.squash.snap(0);
      this.velS.snap(0);
      this.wIdle = 1;
      this.wRun = this.wAir = this.wWall = this.wDash = this.wSkid = 0;
      this.openT = 1;
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
    const runT = ground ? smoothstep(0.4, 4.5, speed) : 0;
    if (ground && this.wRun < 0.04 && runT > 0 && this.wAir < 0.2) this.phase = 0.3;
    this.wDash += ((dash ? 1 : 0) - this.wDash) * approach(dash ? 38 : 13, dt);
    this.wWall += ((wall ? 1 : 0) - this.wWall) * approach(wall ? 16 : 22, dt);
    this.wAir += ((air ? 1 : 0) - this.wAir) * approach(air ? 26 : 28, dt);
    this.wSkid += ((skid ? 1 : 0) - this.wSkid) * approach(skid ? 30 : 16, dt);
    this.wRun += (runT - this.wRun) * approach(runT > this.wRun ? 22 : 13, dt);
    this.wIdle += ((ground ? 1 - runT : 0) - this.wIdle) * approach(13, dt);

    // --- Run phase: by distance, signed by the facing so moving backwards runs it backwards.
    if (p.grounded && !dash) {
      this.phase += (dx * sgn) / CYCLE;
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

    // --- Springs layered on top.
    const ax = (p.vx - this.lastVx) / Math.max(dt * 60, 0.25);
    this.lastVx = p.vx;
    const leanTarget = p.grounded
      ? clamp(ax * sgn * 0.075, -0.34, 0.34)
      : clamp(ax * sgn * 0.025, -0.12, 0.12);
    const leanExtra = this.leanS.step(dash ? 0 : leanTarget, dt);
    const crouch = clamp(this.crouch.step(0, dt), -2, 10);
    const sq = clamp(this.squash.step(0, dt), -0.16, 0.14);
    out[PU]! -= crouch;
    out[LEAN]! += leanExtra + crouch * 0.014;
    out[HT]! -= leanExtra * 0.5 - crouch * 0.022;
    out[HAU]! -= crouch * 0.2;
    out[HBU]! -= crouch * 0.2;
    out[FLARE]! += sat(crouch * 0.07);

    // A slow blink now and then; eyes close briefly on a hard landing.
    let blink = bell(pulse(clock, 5.9, 0.3, 5, 0.85));
    if (sig.landHard) this.blinkHold = 0.2;
    this.blinkHold = Math.max(0, this.blinkHold - dt);
    if (this.blinkHold > 0) blink = Math.max(blink, sat(this.blinkHold / 0.07));

    // --- Double jump: the mantle is thrown open, then gathers again.
    if (this.openT < 1) {
      this.openT = Math.min(1, this.openT + (dt / 0.5) * (p.grounded || dash || wall ? 3 : 1));
      const w = smoothstep(0, 0.14, this.openT) * (1 - smoothstep(0.3, 1, this.openT)) * 0.9;
      for (let i = 0; i < NP; i++) out[i] = lerp(out[i]!, OPEN[i]!, w);
    }

    // --- Solve the skeleton.
    const j = this.frame.j;
    const s = this.frame.s;
    const cz = Math.sqrt(Math.max(0, 1 - (d * BODY.sinYaw) ** 2));
    const look = this.lookS.step(out[HYAW]!, dt);
    const dh = clamp(this.headYaw.step(dirT, dt) * look, -1, 1);
    const czh = Math.sqrt(Math.max(0, 1 - (dh * BODY.sinHeadYaw) ** 2));
    const ox = p.cx;
    const oy = p.feetY;
    const lean = out[LEAN]!;
    const upper = lean + out[CURL]!;
    const headAng = upper * 0.35 + out[HT]!;
    this.lean = lean;
    this.upper = upper;
    this.headAng = headAng;
    this.crestLift = out[CREST]!;

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
    const headX = neckX + su * d * 2 + sh * dh * BODY.headUp;
    const headY = neckY - cu * 2 - ch * BODY.headUp;
    const collarX = chestX + su * d * 4.4;
    const collarY = chestY - cu * 4.4;
    set(j, J_HIP, hipX, hipY);
    set(j, J_CHEST, chestX, chestY);
    set(j, J_NECK, neckX, neckY);
    set(j, J_HEAD, headX, headY);
    set(j, J_COLLAR, collarX, collarY);
    set(j, J_CLASP, collarX + cu * d * 4.2 + su * d * 0.5, collarY + su * 4.2 - cu * 0.5 + 1.6);
    set(j, J_CREST, headX + (ch * -4.4 + sh * -1) * dh, headY + sh * -4.4 - ch * -1);
    set(j, J_ORIGIN, ox, oy);
    set(j, J_CENTRE, ox, oy - 40);

    // Hips and shoulders: sideways offsets seen through the turn, with twist.
    const tw = out[TW]!;
    const latHip = cz * Math.cos(tw) - d * BODY.sinYaw * Math.sin(tw);
    const latSh = cz * Math.cos(-tw * 0.8) - d * BODY.sinYaw * Math.sin(-tw * 0.8);
    const shX = chestX + su * d * 3.4;
    const shY = chestY - cu * 3.4;
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
      set(j, J_TOE_A + side, ballX + Math.cos(bp) * 1.9 * d, ballY + Math.sin(bp) * 1.9 - 0.5);

      const sx = shX - sd * latSh * BODY.shoulderHalf;
      const sy = shY;
      set(j, J_SH_A + side, sx, sy);
      const hf = out[side === 0 ? HAF : HBF]!;
      const hu = out[side === 0 ? HAU : HBU]!;
      ik2(sx, sy, sx + hf * d, sy - hu, BODY.upperArm, BODY.foreArm, bendArm, 0.15);
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
    const stretchT = dash ? (p.freeze > 0 ? -0.05 : 0.12) : (1 - g) * smoothstep(8, 22, v) * 0.06;
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
    s[S_FLARE] = Math.max(0, out[FLARE]!);
    s[S_EMBER] = 1 + this.wDash * 0.35;
  }

  /** Stillness: breathing, the faintest shift of weight, and now and then a slow look aside. */
  private idlePose(clock: number): Pose {
    const o = this.tmp;
    const breath = Math.sin(clock * TAU * 0.22);
    const shift = noise1(clock * 0.11, 3);
    const glance = pulse(clock, 9.5, 4, 11, 0.75);
    const gl = glance > 0 ? smoothstep(0, 0.25, glance) * (1 - smoothstep(0.7, 1, glance)) : 0;
    o[PF] = shift * 0.5;
    o[PU] = 31.3 + breath * 0.3;
    o[LEAN] = 0.04 + breath * 0.008;
    o[CURL] = 0.08 - breath * 0.018;
    o[HT] = 0.05 + breath * 0.008 + gl * 0.03;
    o[AF] = 7;
    o[AU] = 0;
    o[AP] = 0;
    o[BF] = -2.6;
    o[BU] = 0;
    o[BP] = 0;
    o[HAF] = 0.8;
    o[HAU] = -15.6 + breath * 0.25;
    o[HBF] = -1;
    o[HBU] = -15.4 + breath * 0.25;
    o[TW] = shift * 0.04;
    o[CREST] = 0.02 * breath;
    o[FLARE] = 0.03 + breath * 0.02;
    o[EYE] = 1;
    o[LOOKY] = 0.1;
    o[HYAW] = 1 - gl * 0.7;
    return o;
  }

  /** One leg of the run cycle at phase `ph` (0 = this foot's contact). */
  private leg(ph: number): void {
    const o = this.legOut;
    const f = ph - Math.floor(ph);
    const F1 = CONTACT_F - CYCLE * STANCE;
    if (f < STANCE) {
      const t = f / STANCE;
      o.f = CONTACT_F - CYCLE * f;
      o.p = t < 0.15 ? lerp(-0.2, 0, t / 0.15) : t < 0.45 ? 0 : 1.15 * ((t - 0.45) / 0.55) ** 1.6;
      o.u = Math.max(0, -Math.sin(o.p)) * BODY.foot * 0.7;
    } else {
      const t = (f - STANCE) / (1 - STANCE);
      const span = CYCLE * (1 - STANCE);
      o.f = hermite(F1, -span * 0.42, CONTACT_F, -span * 0.62, t);
      o.u = 12.5 * Math.sin(Math.PI * t ** 0.8) ** 1.2;
      if (t < 0.2) o.p = lerp(1.15, 1.5, smoothstep(0, 0.2, t));
      else if (t < 0.6) o.p = lerp(1.5, 0.3, smoothstep(0.2, 0.6, t));
      else if (t < 0.88) o.p = lerp(0.3, -0.4, smoothstep(0.6, 0.88, t));
      else o.p = lerp(-0.4, -0.2, smoothstep(0.88, 1, t));
      o.u += Math.max(0, -Math.sin(o.p)) * BODY.foot * 0.7 * smoothstep(0.85, 1, t);
    }
  }

  /** Purposeful and low: leaning in, arms held back under the mantle. */
  private runPose(ph: number): Pose {
    const o = this.tmp2;
    this.leg(ph);
    o[AF] = this.legOut.f;
    o[AU] = this.legOut.u;
    o[AP] = this.legOut.p;
    this.leg(ph + 0.5);
    o[BF] = this.legOut.f;
    o[BU] = this.legOut.u;
    o[BP] = this.legOut.p;
    const c2 = Math.cos(2 * TAU * (ph - 0.11));
    o[PF] = 1.5 + 0.6 * Math.sin(2 * TAU * (ph - 0.2));
    o[PU] = 26 - 1.8 * c2;
    o[LEAN] = 0.38 + 0.025 * c2;
    o[CURL] = 0.08;
    o[HT] = -0.13 + 0.025 * Math.cos(2 * TAU * (ph - 0.17));
    // Arms trail behind and swing only a little, opposite the legs.
    const a = -Math.cos(TAU * (ph - 0.95));
    o[HAF] = -5 + 4.5 * a;
    o[HAU] = -11.5 + 1.5 * a * a;
    o[HBF] = -5 - 4.5 * a;
    o[HBU] = -11.5 + 1.5 * a * a;
    o[TW] = 0.26 * Math.cos(TAU * (ph - 0.95));
    o[CREST] = -0.35;
    o[FLARE] = 0.12;
    o[EYE] = 1;
    o[LOOKY] = 0;
    o[HYAW] = 1;
    return o;
  }

  private airPose(p: PlayerView, clock: number, sgn: number): Pose {
    const o = this.tmp3;
    const r = smoothstep(-3, -11, p.vy);
    const fl = smoothstep(2, 12, p.vy);
    const tk = Math.max(0, 1 - r - fl);
    for (let i = 0; i < NP; i++) o[i] = RISE[i]! * r + TUCK[i]! * tk + FALL[i]! * fl;
    const vf = clamp((p.vx * sgn) / 9.6, -1.4, 1.4);
    o[LEAN]! += 0.12 * vf;
    o[PF]! += 1.5 * vf;
    // The slightest drift in the limbs so a long fall is not a frozen pose.
    const k = Math.sin(clock * 3.1);
    o[AF]! += k * 0.7;
    o[BF]! -= k * 0.7;
    o[HAU]! += Math.sin(clock * 2.3) * 0.6 * fl;
    o[HBU]! += Math.cos(clock * 2.7) * 0.6 * fl;
    return o;
  }
}

function set(j: Float32Array, i: number, x: number, y: number): void {
  j[i * 2] = x;
  j[i * 2 + 1] = y;
}
