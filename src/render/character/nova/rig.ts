// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Nova's skeleton and animation: an acrobat.
 *
 * Same 2.5D idea as the hooded rig (poses authored in a forward frame: f toward the facing, u up,
 * projected through a continuous turn factor `d`), but with its own proportions and acting:
 *   - a bounding lope: ballistic body arc in the float, short soft stance, feet planted by IK;
 *   - springs on the hand targets (always) and the foot targets (in the air), so limbs drag,
 *     overshoot and settle instead of following the pose in lockstep;
 *   - the double jump is a forward somersault: the pose blends into a tight tuck while the whole
 *     solved skeleton is rotated about the body centre by an angle that follows an eased ramp
 *     through a spring (so it starts and ends with zero angular velocity and a little overshoot).
 *     One full turn = the identity, so nothing pops going in or out.
 */
import type { SimEvent } from '../../../sim/events';
import type { PlayerView } from '../../contract';
import {
  approach,
  bell,
  clamp,
  hash1,
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
/** Where the comet tail leaves the head (back of the crown). */
export const J_TAIL = 18;
/** The sash knot (back of the waist). */
export const J_SASH = 19;
/** Front of the waist (the sash band runs from here to the knot). */
export const J_WAIST = 20;
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
/** Somersault activity 0..1 (tuck weight). */
export const S_SPIN = 8;
export const S_COUNT = 9;

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
const EYE = 16;
const LOOKY = 17;
const HYAW = 18; // head turn as a fraction of the body's
const TILT = 19; // pelvis tilt, px: side A's hip rides this much higher (shoulders tilt the other way)
const NP = 20;

type Pose = Float32Array;

function pose(v: number[]): Pose {
  const p = new Float32Array(NP);
  p.set(v);
  return p;
}

/** Proportions (world px): about 84 to the top of the crest, long legs and forearms. */
export const BODY = {
  thigh: 17.5,
  shin: 18,
  foot: 8,
  upperArm: 9.6,
  foreArm: 11,
  spine: 17,
  neck: 4.8,
  headUp: 9,
  hipHalf: 3.2,
  shoulderHalf: 5.6,
  footHalf: 2.8,
  headW: 8.5,
  headH: 9.1,
  sinYaw: 0.906,
  sinHeadYaw: 0.7,
} as const;

/** Run cycle length in world px (two footfalls): long floating strides. */
export const CYCLE = 232;
/** Fraction of the cycle a foot is planted: short, so there is a clear float between footfalls. */
export const STANCE = 0.2;
const CONTACT_F = 20;
/** Somersault duration, seconds. */
export const SPIN_T = 0.42;

// Channel order: PF PU LEAN CURL HT | AF AU AP | BF BU BP | HAF HAU HBF HBU | TW EYE LOOKY HYAW
const RISE = pose([0, 40, 0.12, -0.08, -0.1, 9, 17, 0.9, -11, 1, 1.4, -8, -17, -13, -13, 0.12, 1, -0.2, 1]);
const APEX = pose([0, 39, 0.05, 0.05, 0.02, 10, 15, 0.7, -9, 2, 1.25, 8, -15, -9, -16, 0.06, 1, 0, 1]);
const FALL = pose([-1, 39, -0.07, 0.03, 0.13, 7, 1, 0.4, -5, 4, 0.9, 15, -3, -15, 5, 0, 1, 0.4, 1]);
/** The somersault's tuck: knees to chest, arms wrapped round the shins, chin down. */
const TUCK = pose([
  -14.3, 36, 0.6, 0.9, 1.47, -6.2, 23.6, 0.5, -7.6, 24.6, 0.6, -3.7, -14.2, -2.5, -13.4, 0, 0.9, 0.3, 1,
]);
/** The somersault's opening beat: legs long and a little forward, arms out and up for balance. */
const OPEN = pose([0, 40, -0.04, -0.06, -0.05, 7, 1, 0.45, -1, 2, 0.75, 14, 2, -15, 4, 0, 1, 0.2, 1]);
/** Wall-jump kick-off: a brief arched back-layout. */
const KICK = pose([0, 38, -0.42, -0.25, -0.2, 2, 3, 1.1, -12, 0, 1.4, 4, 14, -10, 12, 0.1, 1, -0.3, 1]);
const WALL = pose([3, 30, 0.1, 0.1, 0.16, 19, 17, -1.15, 19, 5, -1.2, 14, 12, -4, -15, 0.2, 1, 0.4, 0.45]);
const DASH = pose([-12, 33, 1.22, 0.08, -0.1, -44, 29, 1.5, -42, 34, 1.5, -19, -1, -18, 2, 0, 0.85, 0, 1]);
const SKID = pose([4, 26, 0.42, 0.1, -0.15, 10, 0, 0, -20, 0, 0.4, 4, -13, -9, -10, 0.2, 0.95, 0, 1]);

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

function frac(x: number): number {
  return x - Math.floor(x);
}

/** A sine with its peak pushed late or early: eases out of one extreme and into the other unevenly. */
function sway(ph: number, skew: number): number {
  const a = TAU * ph;
  return Math.sin(a + skew * Math.sin(a));
}

/** Stance share of one half cycle (one footfall to the next). */
const SH = STANCE * 2;
const BOB_F = 3.3;
const BOB_S = (4 * BOB_F * SH) / ((1 - SH) * Math.PI);

/**
 * The body's vertical path over the run cycle: a ballistic arc while both feet are off the ground
 * and a short, soft dip through each stance (slopes match where they meet).
 */
function bob(ph: number): number {
  const h = frac(ph * 2);
  if (h < SH) return -BOB_S * Math.sin((Math.PI * h) / SH);
  const t = (h - SH) / (1 - SH);
  return BOB_F * 4 * t * (1 - t);
}

/** Somersault beats as fractions of SPIN_T: snap in until SPIN_IN, rigid spin, snap out from SPIN_OUT. */
export const SPIN_IN = 0.2;
export const SPIN_OUT = 0.72;
const SPIN_VMAX = 1 / (SPIN_IN / 2 + (SPIN_OUT - SPIN_IN) + (1 - SPIN_OUT) / 2);
/** How long the opening pose lingers after the turn is done (in units of SPIN_T). */
const SPIN_TAIL = 1.55;
/** An interrupted somersault rights itself over this long, seconds. */
const SPIN_CUT = 0.13;

/** Fraction of the turn done at progress u: eases in over the snap-in, linear in the spin, eases out to exactly 1. */
export function spinTurn(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < SPIN_IN) return (SPIN_VMAX * u * u) / (2 * SPIN_IN);
  if (u < SPIN_OUT) return SPIN_VMAX * (u - SPIN_IN / 2);
  const r = 1 - u;
  return 1 - (SPIN_VMAX * r * r) / (2 * (1 - SPIN_OUT));
}

/** Tuck amount at progress u: in fast, held through the spin, out fast. */
export function spinTuck(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  if (u < SPIN_IN) return 1 - (1 - u / SPIN_IN) ** 2.4;
  if (u < SPIN_OUT) return 1;
  return (1 - (u - SPIN_OUT) / (1 - SPIN_OUT)) ** 2.2;
}

/** Where a standing foot wants to be, forward of the body (A in front, B behind). */
const IDLE_F = [7.5, -3.2] as const;

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
  wDash = 0;
  wWall = 0;
  wRun = 0;
  wAir = 0;
  /** Somersault: screen angle (radians, clockwise positive), tuck weight, and whether it is running. */
  spinPhi = 0;
  spinW = 0;
  spinning = false;
  /** Angular speed of the somersault, rad/s (absolute). */
  spinVel = 0;

  private readonly yaw = new Spring(1, 26, 0.82);
  private readonly headYaw = new Spring(1, 40, 0.85);
  private readonly leanS = new Spring(0, 12, 0.6);
  private readonly crouch = new Spring(0, 17, 0.66);
  private readonly squash = new Spring(0, 22, 0.6);
  private readonly velS = new Spring(0, 30, 0.9);
  private readonly lookS = new Spring(1, 4.5, 1);
  private readonly driftS = new Spring(0, 9, 0.7);
  /** Hand targets (HAF, HAU, HBF, HBU) and airborne foot targets (AF AU AP BF BU BP) follow through springs. */
  private readonly hand = [
    new Spring(0, 23, 0.56),
    new Spring(-17, 21, 0.52),
    new Spring(0, 19, 0.5),
    new Spring(-17, 18, 0.5),
  ];
  private readonly foot = [
    new Spring(0, 30, 0.62),
    new Spring(0, 30, 0.62),
    new Spring(0, 26, 0.7),
    new Spring(0, 26, 0.58),
    new Spring(0, 27, 0.6),
    new Spring(0, 24, 0.7),
  ];
  private wIdle = 1;
  private wSkid = 0;
  private phase = 0.3;
  private lastCx = 0;
  private lastCy = 0;
  private lastVx = 0;
  private spinT = 0;
  private spinDir = 1;
  private spinFree = false;
  private spinX = 0;
  private cutT = 0;
  private cutX = 0;
  private cutW = 0;
  private hardT = 1;
  /** Standing feet are anchored in the world and step when the body leaves them behind. */
  private readonly anchor = [0, 0];
  private readonly stepFrom = [0, 0];
  private readonly stepT = [1, 1];
  private kickT = 1;
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
            this.kickT = 0;
          }
          break;
        case 'land':
          sig.landed = e.vy;
          sig.landHard = e.hard;
          this.squash.v -= clamp(e.vy * 0.16, 0.5, 3.6);
          this.crouch.v += clamp(e.vy * 13, 30, 250) + (e.hard ? 50 : 0);
          if (e.hard) this.hardT = 0;
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
          this.crouch.v += 45;
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
      this.spinX = 0;
      this.hardT = 1;
      this.stepT[0] = this.stepT[1] = 1;
      this.anchor[0] = p.cx + IDLE_F[0] * dirT;
      this.anchor[1] = p.cx + IDLE_F[1] * dirT;
      this.driftS.snap(0);
      this.spinning = false;
      this.spinW = 0;
      this.spinPhi = 0;
      this.kickT = 1;
      this.wIdle = 1;
      this.wRun = this.wAir = this.wWall = this.wDash = this.wSkid = 0;
      this.lastCx = p.cx;
      this.lastVx = p.vx;
      this.phase = 0.3;
      this.frame.s[S_GROUND] = p.grounded ? 1 : 0;
      startSpin = false;
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
    const runT = ground ? smoothstep(0.4, 5, speed) : 0;
    if (ground && this.wRun < 0.04 && runT > 0 && this.wAir < 0.2) this.phase = 0.3;
    this.wDash += ((dash ? 1 : 0) - this.wDash) * approach(dash ? 34 : 11, dt);
    this.wWall += ((wall ? 1 : 0) - this.wWall) * approach(wall ? 15 : 20, dt);
    this.wAir += ((air ? 1 : 0) - this.wAir) * approach(air ? 24 : 22, dt);
    this.wSkid += ((skid ? 1 : 0) - this.wSkid) * approach(skid ? 26 : 13, dt);
    this.wRun += (runT - this.wRun) * approach(runT > this.wRun ? 18 : 10, dt);
    this.wIdle += ((ground ? 1 - runT : 0) - this.wIdle) * approach(11, dt);

    // --- Run phase: by distance, signed by the facing so moving backwards runs it backwards.
    if (p.grounded && !dash) {
      this.phase += (dx * sgn) / CYCLE;
      this.phase -= Math.floor(this.phase);
    }

    this.idleFeet(dt, p, d);

    // --- Blend the poses.
    const out = this.out;
    out.fill(0);
    let wSum = 0;
    const add = (src: Pose, w: number): void => {
      if (w <= 1e-4) return;
      for (let i = 0; i < NP; i++) out[i]! += src[i]! * w;
      wSum += w;
    };
    if (this.wIdle > 1e-4) add(this.idlePose(clock, p, d), this.wIdle);
    if (this.wRun > 1e-4) add(this.runPose(this.phase), this.wRun);
    if (this.wAir > 1e-4) add(this.airPose(p, clock, sgn), this.wAir);
    add(WALL, this.wWall);
    add(DASH, this.wDash);
    add(SKID, this.wSkid);
    if (wSum < 1e-3) add(this.idlePose(clock, p, d), 1);
    for (let i = 0; i < NP; i++) out[i]! /= wSum;

    // --- Springs layered on top.
    const ax = (p.vx - this.lastVx) / Math.max(dt * 60, 0.25);
    this.lastVx = p.vx;
    const leanTarget = p.grounded ? clamp(ax * sgn * 0.07, -0.3, 0.3) : clamp(ax * sgn * 0.03, -0.14, 0.14);
    const leanExtra = this.leanS.step(dash ? 0 : leanTarget, dt);
    const crouch = clamp(this.crouch.step(0, dt), -2.5, 15);
    const sqRaw = clamp(this.squash.step(0, dt), -0.14, 0.13);
    out[PU]! -= crouch;
    out[PF]! += crouch * 0.12;
    out[LEAN]! += leanExtra + crouch * 0.02;
    out[CURL]! += crouch * 0.012;
    out[HT]! -= leanExtra * 0.5 + crouch * 0.012;
    // Arms sink and spread a little as the legs absorb a landing.
    const cr = Math.max(0, crouch);
    out[HAU]! -= cr * 0.25;
    out[HBU]! -= cr * 0.2;
    out[HAF]! += cr * 0.5;
    out[HBF]! -= cr * 0.35;
    // In the air the arms float against the body's vertical motion (a slow spring: they trail).
    const drift = this.driftS.step(p.grounded ? 0 : clamp(p.vy * 0.28, -3, 5), dt);
    out[HAU]! += drift;
    out[HBU]! += drift * 1.2;

    // A hard landing folds right down: deep through the legs, the near hand to the ground, then up.
    if (this.hardT < 1) {
      this.hardT = Math.min(1, this.hardT + dt / 0.6);
      const t = this.hardT;
      const h =
        smoothstep(0, 0.13, t) * (1 - smoothstep(0.38, 1, t)) * (p.grounded ? 1 : 0) * (1 - 0.75 * this.wRun);
      out[PU] = Math.max(11, out[PU]! - 16 * h);
      out[PF]! += 3 * h;
      out[LEAN]! += 0.5 * h;
      out[CURL]! += 0.16 * h;
      out[HT]! -= 0.42 * h;
      const shU = out[PU]! + BODY.spine * Math.cos(out[LEAN]!) + 3.4 * Math.cos(out[LEAN]! + out[CURL]!);
      out[HAF] = lerp(out[HAF]!, 8, h);
      out[HAU] = lerp(out[HAU]!, -(shU - 1.6), h);
      out[HBF]! -= 6 * h;
      out[HBU]! += 5 * h;
    }

    // A slow blink now and then; eyes close briefly on a hard landing.
    let blink = bell(pulse(clock, 5.3, 0.28, 5, 0.85));
    if (sig.landHard) this.blinkHold = 0.2;
    this.blinkHold = Math.max(0, this.blinkHold - dt);
    if (this.blinkHold > 0) blink = Math.max(blink, sat(this.blinkHold / 0.07));

    // --- Wall-jump kick: a brief arched layout while the body twists round.
    if (this.kickT < 1) {
      this.kickT = Math.min(1, this.kickT + (dt / 0.5) * (air ? 1 : 4));
      const w = smoothstep(0, 0.16, this.kickT) * (1 - smoothstep(0.42, 1, this.kickT));
      for (let i = 0; i < NP; i++) out[i] = lerp(out[i]!, KICK[i]!, w);
    }

    // --- Double jump: the somersault. Three beats on one clock: snap in to a ball, spin it as a
    // rigid shape through exactly one turn, snap out. Angle and tuck are curves of the same clock.
    if (startSpin) {
      this.spinning = true;
      this.spinFree = false;
      this.spinT = 0;
      this.spinDir = Math.abs(p.vx) > 1.5 ? (p.vx > 0 ? 1 : -1) : sgn;
    }
    let openW = 0;
    if (this.spinning) {
      const before = this.spinX;
      if (!this.spinFree && (p.grounded || dash || wall)) {
        this.spinFree = true;
        this.cutT = 0;
        this.cutX = this.spinX;
        this.cutW = this.spinW;
      }
      if (this.spinFree) {
        // Cut short: to the nearest upright by the shortest way, letting go of the tuck.
        this.cutT = Math.min(1, this.cutT + dt / SPIN_CUT);
        const e = this.cutT * this.cutT * (3 - 2 * this.cutT);
        this.spinX = lerp(this.cutX, this.cutX > 0.5 ? 1 : 0, e);
        this.spinW = this.cutW * (1 - e);
        if (this.cutT >= 1) this.spinning = false;
      } else {
        this.spinT += dt;
        const u = this.spinT / SPIN_T;
        this.spinX = spinTurn(u);
        this.spinW = spinTuck(u);
        openW = smoothstep(SPIN_OUT - 0.05, 0.93, u) * (1 - smoothstep(1.04, SPIN_TAIL, u)) * 0.85;
        if (u >= SPIN_TAIL) this.spinning = false;
      }
      this.spinVel = dt > 0 ? (Math.abs(this.spinX - before) * TAU) / dt : 0;
      // A whole turn is the identity.
      if (this.spinX >= 1) this.spinX = 0;
      if (!this.spinning) {
        this.spinX = 0;
        this.spinW = 0;
        this.spinVel = 0;
      }
      this.spinPhi = this.spinX * TAU * this.spinDir;
    }
    if (openW > 1e-4) for (let i = 0; i < NP; i++) out[i] = lerp(out[i]!, OPEN[i]!, openW);
    const tuck = this.spinW;
    if (tuck > 1e-4) for (let i = 0; i < NP; i++) out[i] = lerp(out[i]!, TUCK[i]!, tuck);

    // --- Follow-through: hands always, feet only while they are free.
    const s = this.frame.s;
    const gT = p.grounded ? 1 : 0;
    if (sig.spawned) {
      for (let i = 0; i < 4; i++) this.hand[i]!.snap(out[HAF + i]!);
      for (let i = 0; i < 6; i++) this.foot[i]!.snap(out[AF + i]!);
    }
    s[S_GROUND]! += (gT - s[S_GROUND]!) * approach(gT ? 34 : 18, dt);
    const g = s[S_GROUND]!;
    // In the ball nothing may lag behind: the springs are bypassed by the tuck amount.
    const held = Math.max(tuck, openW);
    const pin = Math.max(this.wDash * 0.6, held);
    for (let i = 0; i < 4; i++) {
      const raw = out[HAF + i]!;
      const v = this.hand[i]!.step(raw, dt);
      out[HAF + i] = lerp(v, raw, pin);
    }
    const free = (1 - g) * (1 - this.wWall) * (1 - this.wDash * 0.5) * (1 - held);
    for (let i = 0; i < 6; i++) {
      const raw = out[AF + i]!;
      const v = this.foot[i]!.step(raw, dt);
      out[AF + i] = lerp(raw, v, free);
    }

    // --- Solve the skeleton.
    const j = this.frame.j;
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
    set(j, J_HIP, hipX, hipY);
    set(j, J_CHEST, chestX, chestY);
    set(j, J_NECK, neckX, neckY);
    set(j, J_HEAD, headX, headY);
    // The tail root: up and back on the crown, in the head's own frame.
    const tf = -6.6;
    const tu = 3;
    set(j, J_TAIL, headX + (ch * tf + sh * tu) * dh, headY + sh * tf - ch * tu);
    // The waist, a little above the hips; knot behind, band end in front.
    const wx = hipX + sl * d * 3.2;
    const wy = hipY - cl * 3.2;
    set(j, J_SASH, wx - cl * d * 3.6, wy - sl * 3.6 + 0.6);
    set(j, J_WAIST, wx + cl * d * 4.2, wy + sl * 4.2 - 1.2);
    set(j, J_ORIGIN, ox, oy);
    set(j, J_CENTRE, ox, oy - 40);

    // Hips and shoulders: sideways offsets seen through the turn, with twist.
    const tw = out[TW]!;
    const tilt = out[TILT]!;
    const latHip = cz * Math.cos(tw) - d * BODY.sinYaw * Math.sin(tw);
    const latSh = cz * Math.cos(-tw * 0.8) - d * BODY.sinYaw * Math.sin(-tw * 0.8);
    const shX = chestX + su * d * 3.4;
    const shY = chestY - cu * 3.4;
    const bendLeg = clamp(-d * 1.7, -1, 1);
    const bendArm = clamp(d * 1.7, -1, 1);
    for (let side = 0; side < 2; side++) {
      const sd = side === 0 ? 1 : -1;
      const hx = hipX - sd * latHip * BODY.hipHalf;
      const hy = hipY + 1 - sd * tilt;
      set(j, J_HIP_A + side, hx, hy);
      const bf = out[side === 0 ? AF : BF]!;
      const bu = out[side === 0 ? AU : BU]!;
      const bp = out[side === 0 ? AP : BP]!;
      const ballX = ox + bf * d - sd * cz * BODY.footHalf;
      const ballY = oy - bu;
      // The ankle sits behind and above the ball as the heel lifts.
      const ankX = ballX - Math.cos(bp) * BODY.foot * 0.72 * d;
      const ankY = ballY - Math.sin(bp) * BODY.foot * 0.72 - 1.6;
      ik2(hx, hy, ankX, ankY, BODY.thigh, BODY.shin, bendLeg, 0.2);
      set(j, J_KNEE_A + side, ikOut.x, ikOut.y);
      set(j, J_ANK_A + side, ikOut.ex, ikOut.ey);
      // The toe rolls about the planted ball, so a planted foot stays put whatever the leg does.
      set(j, J_TOE_A + side, ballX + Math.cos(bp) * 2 * d, ballY + Math.sin(bp) * 2 - 0.5);

      const sx = shX - sd * latSh * BODY.shoulderHalf;
      const sy = shY + sd * tilt * 0.9;
      set(j, J_SH_A + side, sx, sy);
      const hf = out[side === 0 ? HAF : HBF]!;
      const hu = out[side === 0 ? HAU : HBU]!;
      ik2(sx, sy, sx + hf * d, sy - hu, BODY.upperArm, BODY.foreArm, bendArm, 0.12);
      set(j, J_EL_A + side, ikOut.x, ikOut.y);
      set(j, J_HAND_A + side, ikOut.ex, ikOut.ey);
    }

    // --- Whole-body squash and stretch (subtle), volume-preserving.
    const v = Math.hypot(p.vx, p.vy);
    if (v > 0.5) {
      const k = approach(18, dt);
      this.vdx += (p.vx / v - this.vdx) * k;
      this.vdy += (p.vy / v - this.vdy) * k;
    }
    const stretchT =
      (dash ? (p.freeze > 0 ? -0.05 : 0.12) : (1 - g) * smoothstep(8, 22, v) * 0.06) * (1 - tuck);
    const st = 1 + this.velS.step(stretchT, dt);
    const vl = Math.hypot(this.vdx, this.vdy) || 1;
    const ux = this.vdx / vl;
    const uy = this.vdy / vl;
    const sy = 1 + sqRaw * (1 - tuck);
    const sx = 1 / sy;
    const pivX = ox;
    const pivY = oy - 40 * (1 - g);
    const cX = ox;
    const cY = oy - 40;
    const inv = 1 / st;
    const phi = this.spinPhi;
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    for (let i = 0; i < J_COUNT; i++) {
      if (i === J_ORIGIN || i === J_CENTRE) continue;
      const x = pivX + (j[i * 2]! - pivX) * sx;
      const y = pivY + (j[i * 2 + 1]! - pivY) * sy;
      const rx = x - cX;
      const ry = y - cY;
      const along = rx * ux + ry * uy;
      const across = -rx * uy + ry * ux;
      const qx = ux * along * st - uy * across * inv;
      const qy = uy * along * st + ux * across * inv;
      // The somersault: everything turns about the body centre.
      j[i * 2] = cX + qx * cp - qy * sp;
      j[i * 2 + 1] = cY + qx * sp + qy * cp;
    }

    s[S_D] = d;
    s[S_CZ] = cz;
    s[S_DH] = dh;
    s[S_CZH] = czh;
    s[S_HEADROT] = headAng * dh + phi;
    s[S_EYE] = Math.min(1, out[EYE]!) * (1 - blink);
    s[S_LOOKY] = out[LOOKY]!;
    s[S_SPIN] = this.spinW;
  }

  /**
   * Standing feet belong to the ground, not the body: each keeps a world anchor and takes a quick
   * step when the body has drifted (a stop's last slide, a turn on the spot) and left it behind.
   * So blending run <-> idle does not skate.
   */
  private idleFeet(dt: number, p: PlayerView, d: number): void {
    for (let i = 0; i < 2; i++) {
      const ideal = p.cx + IDLE_F[i]! * d;
      if (this.wIdle < 0.03 || !p.grounded) {
        this.anchor[i] = ideal;
        this.stepT[i] = 1;
        continue;
      }
      const off = this.anchor[i]! - ideal;
      if (this.stepT[i]! < 1) {
        const t = Math.min(1, this.stepT[i]! + dt / 0.15);
        this.stepT[i] = t;
        // Aim a little ahead of a body that is still moving, so the step lands where it will be.
        const to = ideal + p.vx * 60 * 0.05 * (1 - t);
        this.anchor[i] = lerp(this.stepFrom[i]!, to, t * t * (3 - 2 * t));
      } else if (Math.abs(off) > 34) {
        this.anchor[i] = ideal;
      } else if (Math.abs(off) > 8 && this.stepT[1 - i]! >= 1) {
        this.stepT[i] = 0;
        this.stepFrom[i] = this.anchor[i]!;
      }
    }
  }

  /**
   * Standing easy: weight settled over the back leg, slow uneven breath, small drifts on unrelated
   * periods, now and then a look aside, a shift of the front foot or an idle roll of the wrist.
   */
  private idlePose(clock: number, p: PlayerView, d: number): Pose {
    const o = this.tmp;
    const bx = clock * TAU * 0.2;
    const breath = Math.sin(bx + 0.45 * Math.sin(bx));
    const breathLate = Math.sin(bx - 0.7 + 0.45 * Math.sin(bx - 0.7));
    const shift = noise1(clock * 0.13, 3);
    const sway2 = noise1(clock * 0.21, 8);
    const glance = pulse(clock, 8.7, 3.6, 11, 0.75);
    const gl = glance > 0 ? smoothstep(0, 0.22, glance) * (1 - smoothstep(0.72, 1, glance)) : 0;
    // The front foot finds a new spot every so often.
    const SLOT = 6.7;
    const slot = Math.floor(clock / SLOT);
    const st = sat((clock - slot * SLOT) / 0.42);
    const footNow = hash1(slot * 13 + 5) * 2 - 1;
    const footWas = hash1((slot - 1) * 13 + 5) * 2 - 1;
    const footF = lerp(footWas, footNow, st * st * (3 - 2 * st));
    const footLift = bell(st) * Math.min(1, Math.abs(footNow - footWas) * 1.5);
    // A slow roll of the near wrist.
    const roll = pulse(clock, 11.3, 2.4, 23, 0.7);
    const ro = roll > 0 ? smoothstep(0, 0.25, roll) * (1 - smoothstep(0.7, 1, roll)) : 0;
    const ra = roll * TAU * 1.4;

    o[PF] = 1.6 + shift * 1.3;
    o[PU] = 37.2 + breath * 0.45 - Math.abs(shift) * 0.6;
    o[LEAN] = 0.03 + breathLate * 0.007 + sway2 * 0.012;
    o[CURL] = 0.06 - breath * 0.03;
    o[HT] = 0.04 + breathLate * 0.008 + gl * 0.03 + noise1(clock * 0.17, 14) * 0.02;
    // Feet stand where they were planted in the world (see idleFeet), seen in the body's frame.
    const dd = (d >= 0 ? 1 : -1) / Math.max(0.4, Math.abs(d));
    const la = bell(this.stepT[0]!);
    const lb = bell(this.stepT[1]!);
    o[AF] = clamp((this.anchor[0]! - p.cx) * dd, -26, 26) + footF * 2.4;
    o[AU] = footLift * 1.7 + la * 3.4;
    o[AP] = footLift * 0.3 + la * 0.5 + 0.06;
    o[BF] = clamp((this.anchor[1]! - p.cx) * dd, -26, 26);
    o[BU] = lb * 3.4;
    o[BP] = lb * 0.5;
    // Contrapposto: the weight-bearing back hip rides high, the shoulders answer the other way.
    o[TILT] = -1.5 - shift * 0.5;
    o[HAF] = -2.6 + sway2 * 0.5 + ro * (3 + 1.6 * Math.cos(ra));
    o[HAU] = -19.4 + breath * 0.3 + ro * (4.5 + 1.6 * Math.sin(ra));
    o[HBF] = 2.2 - sway2 * 0.4;
    o[HBU] = -19.2 + breathLate * 0.3;
    o[TW] = 0.16 + shift * 0.05;
    o[EYE] = 1;
    o[LOOKY] = 0.1;
    o[HYAW] = 1 - gl * 0.7;
    return o;
  }

  /** One leg of the run cycle at phase `ph` (0 = this foot's contact). */
  private leg(ph: number): void {
    const o = this.legOut;
    const f = frac(ph);
    const F1 = CONTACT_F - CYCLE * STANCE;
    if (f < STANCE) {
      const t = f / STANCE;
      o.f = CONTACT_F - CYCLE * f;
      o.p = t < 0.18 ? lerp(-0.16, 0, t / 0.18) : t < 0.42 ? 0 : 1.1 * ((t - 0.42) / 0.58) ** 1.5;
      o.u = Math.max(0, -Math.sin(o.p)) * BODY.foot * 0.7;
    } else {
      const t = (f - STANCE) / (1 - STANCE);
      const span = CYCLE * (1 - STANCE);
      o.f = hermite(F1, -span * 0.4, CONTACT_F, -span * 0.52, t);
      // The heel flicks up behind early, the foot then swings through low and reaches.
      o.u = 15 * Math.sin(Math.PI * t ** 0.72) ** 1.25 + 2.2 * Math.sin(Math.PI * t);
      if (t < 0.2) o.p = lerp(1.1, 1.55, smoothstep(0, 0.2, t));
      else if (t < 0.62) o.p = lerp(1.55, 0.35, smoothstep(0.2, 0.62, t));
      else if (t < 0.9) o.p = lerp(0.35, -0.34, smoothstep(0.62, 0.9, t));
      else o.p = lerp(-0.34, -0.16, smoothstep(0.9, 1, t));
      o.u += Math.max(0, -Math.sin(o.p)) * BODY.foot * 0.7 * smoothstep(0.86, 1, t);
    }
  }

  /**
   * A light bounding lope. The pelvis leads; chest, head and arms follow the same arc a little
   * later each, so the body ripples instead of bouncing as one piece.
   */
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
    const b0 = bob(ph);
    const b1 = bob(ph - 0.045);
    const b2 = bob(ph - 0.09);
    o[PF] = 1 + 0.9 * sway(2 * ph - 0.3, 0.4);
    o[PU] = 31.2 + b0;
    o[LEAN] = 0.25 - 0.014 * b1 + 0.03 * sway(2 * ph - 0.12, 0.3);
    o[CURL] = 0.02 + 0.016 * b1 - 0.035 * sway(2 * ph - 0.2, 0.3);
    // The head rides level: it gives back most of what the spine does, late.
    o[HT] = -0.095 - 0.009 * b2;
    // Arms hang loose and trail; each swings opposite its leg, the far one later and smaller.
    const a = sway(ph - 0.07, 0.35);
    const b = -sway(ph - 0.1, 0.3);
    const aBack = Math.max(0, -a);
    const bBack = Math.max(0, -b);
    o[HAF] = -7.5 + 5.6 * a;
    o[HAU] = -16.4 + 3.6 * aBack * aBack + 0.8 * Math.max(0, a) + 0.25 * b2;
    o[HBF] = -8.5 + 5 * b;
    o[HBU] = -16 + 3.2 * bBack * bBack + 0.7 * Math.max(0, b) + 0.25 * b2;
    o[TW] = -0.3 * sway(ph - 0.04, 0.3);
    // The stance-side hip rides high; the shoulders counter it.
    o[TILT] = 1.5 * sway(ph + 0.15, 0.25);
    o[EYE] = 1;
    o[LOOKY] = 0;
    o[HYAW] = 1;
    return o;
  }

  private airPose(p: PlayerView, clock: number, sgn: number): Pose {
    const o = this.tmp3;
    const r = smoothstep(-2.5, -10, p.vy);
    const fl = smoothstep(2, 12, p.vy);
    const tk = Math.max(0, 1 - r - fl);
    for (let i = 0; i < NP; i++) o[i] = RISE[i]! * r + APEX[i]! * tk + FALL[i]! * fl;
    const vf = clamp((p.vx * sgn) / 9.6, -1.4, 1.4);
    o[LEAN]! += 0.11 * vf;
    o[PF]! += 1.5 * vf;
    // Slow unrelated drifts so a long fall is never a held pose.
    const n1 = noise1(clock * 1.3, 31);
    const n2 = noise1(clock * 1.1, 37);
    const n3 = noise1(clock * 0.9, 41);
    o[AF]! += n1 * 1.6;
    o[BF]! -= n2 * 1.6;
    o[BU]! += n3 * 1.2 * fl;
    o[HAU]! += n2 * 1.6 * (0.4 + fl);
    o[HBU]! += n1 * 1.8 * (0.4 + fl);
    o[HAF]! += n3 * 1.2;
    return o;
  }
}

function set(j: Float32Array, i: number, x: number, y: number): void {
  j[i * 2] = x;
  j[i * 2 + 1] = y;
}
