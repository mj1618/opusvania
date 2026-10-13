// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Wick's skeleton and animation.
 *
 * Poses are authored in the "forward frame" (f = toward the facing, u = up, relative to the feet
 * centre of the collision box) and projected through a continuous turn factor `d` (+1 right ..
 * -1 left, a spring). Everything asymmetric is an offset times `d`; everything with body (limbs,
 * torso, hat, hood) keeps its own width, so a turn-around is a quick turn through the camera and
 * nothing mirrors in one frame. The far arm always carries the glaive (the swap happens while the
 * two arms coincide at d = 0).
 *
 * Animation = pose generators (idle, run, air, wall, dash, skid), each continuous in time,
 * cross-faded by smoothed weights, then springs on top: lean from acceleration, landing crouch,
 * squash and stretch, both hands on their own springs (drag and overshoot), and the glaive's
 * angle on an under-damped angular spring in screen space so the weapon follows through on every
 * change of pose and sweeps overhead on a turn-around. The double jump is a forward tuck
 * somersault: the pose snaps into a ball, every solved joint turns once about the body centre on
 * an eased curve, and it snaps out into the fall.
 *
 * The run is a bounding lope: phase advances with distance, each foot is down for a fifth of the
 * cycle (linear in phase, so planted feet do not slide) and the body floats between footfalls.
 */
import type { SimEvent } from '../../../sim/events';
import type { PlayerView } from '../../contract';
import {
  approach,
  bell,
  clamp,
  easeOutCubic,
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

// --- Joints (x, y pairs in Frame.j), world px. Side 0 = near (camera side), 1 = far.
export const J_PELVIS = 0;
export const J_NECK = 1;
export const J_HEAD = 2;
export const J_SH = 3; // +side
export const J_EL = 5;
export const J_HAND = 7;
export const J_HIP = 9;
export const J_KNEE = 11;
export const J_ANK = 13;
export const J_TOE = 15;
export const J_HEEL = 17;
/** Glaive: butt, blade tip, and where the lantern hangs. */
export const J_BUTT = 19;
export const J_TIP = 20;
export const J_HOOK = 21;
export const J_ORIGIN = 22;
export const J_CENTRE = 23;
/** Middle of the spine (the torso is two segments). */
export const J_CHEST = 24;
export const J_COUNT = 25;

// --- Scalars (Frame.s).
export const S_D = 0;
/** Head turn factor and how much of the face is toward the camera. */
export const S_DH = 1;
export const S_CZH = 2;
/** Spine lean in the forward frame; head and hat rotations on screen (radians clockwise). */
export const S_LEAN = 3;
export const S_HEADROT = 4;
export const S_HATROT = 5;
export const S_EYE = 6;
export const S_GROUND = 7;
/** Glaive: screen angle of the shaft (butt -> blade), which side the hook is on, grip distance. */
export const S_GANG = 8;
export const S_HS = 9;
export const S_GRIP = 10;
export const S_FLARE = 11;
export const S_LOOKY = 12;
/** 0..1: how much of the double-jump somersault is in play (tuck weight / spin speed). */
export const S_TWIRL = 13;
/** 0..1: how tightly the body is tucked into the somersault's ball. */
export const S_BALL = 14;
export const S_COUNT = 15;

// --- Pose channels.
const PF = 0; // pelvis forward
const PU = 1; // pelvis height above the feet
const LEAN = 2; // spine lean forward, rad
const HT = 3; // head pitch on top of the stabilised head (+ = nose down)
const HAT = 4; // hat tilt forward over the eyes
const AF = 5; // near foot ball: forward, up, pitch (heel lift)
const AU = 6;
const AP = 7;
const BF = 8; // far foot
const BU = 9;
const BP = 10;
const NHF = 11; // free (near) hand relative to its shoulder: forward, up
const NHU = 12;
const NB = 13; // free elbow: -1 points back/down, +1 forward/up
const GHF = 14; // glaive (far) hand relative to its shoulder
const GHU = 15;
const GA = 16; // glaive direction butt -> blade, forward-frame degrees (0 fwd, 90 up, 180 back)
const GRIP = 17; // hand's distance from the butt
const TW = 18; // shoulder twist (+ = near shoulder forward)
const FLARE = 19; // cloth opening 0..1
const EYE = 20;
const LOOKY = 21;
const HYAW = 22; // head turn as a fraction of the body's (lower = toward the camera)
const TL = 23; // torso length delta (breath)
const CURL = 24; // upper spine leans this much more than the lower (rad): a curled or arched back
const NP = 25;

type Pose = Float32Array;

function pose(v: Record<number, number>): Pose {
  const p = new Float32Array(NP);
  p[EYE] = 1;
  p[HYAW] = 1;
  p[NB] = -1;
  p[GRIP] = 36;
  p[HAT] = 0.16;
  for (const k of Object.keys(v)) p[Number(k)] = v[Number(k)]!;
  return p;
}

export const BODY = {
  thigh: 17,
  shin: 18,
  foot: 7.2,
  upperArm: 10.5,
  foreArm: 10.5,
  torso: 20,
  glaive: 84,
  /** Hook position along the shaft and its reach to the side. */
  hookAt: 63.5,
  hookOut: 6,
  sinHeadYaw: 0.8,
} as const;

/** Run cycle length in world px (two footfalls). */
export const CYCLE = 216;
/** Fraction of the cycle a foot is planted. */
export const STANCE = 0.21;
const CONTACT_F = 19.5;
const SPAN = CYCLE * (1 - STANCE);

/** Just off the ground: stretched long, legs trailing from the push, free hand leading. */
const RISE = pose({
  [PF]: -1,
  [PU]: 37.8,
  [LEAN]: 0.17,
  [HT]: -0.1,
  [HAT]: 0.1,
  [AF]: 4,
  [AU]: 3.5,
  [AP]: 1.05,
  [BF]: -10,
  [BU]: 0,
  [BP]: 1.4,
  [NHF]: 9,
  [NHU]: -3,
  [NB]: -1,
  [GHF]: -4,
  [GHU]: -7,
  [GA]: 146,
  [TW]: 0.14,
  [FLARE]: 0.05,
  [LOOKY]: -0.3,
});
/** The top of the arc: gathered, knees up, everything floating. */
const TUCK = pose({
  [PF]: 0,
  [PU]: 35.2,
  [LEAN]: 0.08,
  [HT]: 0.02,
  [HAT]: 0.16,
  [AF]: 10.5,
  [AU]: 17.5,
  [AP]: 0.4,
  [BF]: -4,
  [BU]: 11.5,
  [BP]: 1.0,
  [NHF]: -2,
  [NHU]: -11,
  [NB]: -0.9,
  [GHF]: -5,
  [GHU]: -4,
  [GA]: 130,
  [TW]: 0.02,
  [FLARE]: 0.5,
});
const FALL = pose({
  [PF]: -1,
  [PU]: 37,
  [LEAN]: -0.02,
  [HT]: 0.14,
  [HAT]: 0.2,
  [AF]: 7.5,
  [AU]: 6,
  [AP]: 0.6,
  [BF]: -7,
  [BU]: 3,
  [BP]: 0.95,
  [NHF]: -12.5,
  [NHU]: 2,
  [NB]: 0.2,
  [GHF]: -9,
  [GHU]: 1,
  [GA]: 118,
  [FLARE]: 1,
  [LOOKY]: 0.4,
});
/** Somersault duration, seconds, and its beats as fractions: snap in, rigid spin, snap out. */
const SPIN_T = 0.42;
const SPIN_IN = 0.17;
const SPIN_OUT = 0.74;
/**
 * The double jump's tuck, a compact ball centred on the pivot (the box centre, 40 px above the
 * feet): thighs against the chest, shins folded back with the heels under the hips, spine curled
 * and chin down, the free hand clasping the shins, and the glaive held at its middle through the
 * ball's centre so its ends and the lantern each sweep one clean circle. Every body part sits
 * inside a circle of about 34 px.
 */
const SOMER = pose({
  [PF]: -8,
  [PU]: 33,
  [LEAN]: 0.62,
  [CURL]: 0.55,
  [HT]: 0.78,
  [HAT]: 0.62,
  [AF]: -0.6,
  [AU]: 20.9,
  [AP]: 0.9,
  [BF]: -2.8,
  [BU]: 22,
  [BP]: 1.0,
  [NHF]: 2.3,
  [NHU]: -12.9,
  [NB]: -1,
  [GHF]: -3,
  [GHU]: -5.5,
  [GA]: 227,
  [GRIP]: 42,
  [TW]: 0,
  [FLARE]: 0,
  [EYE]: 0.85,
  [LOOKY]: 0.3,
  [TL]: -3,
});
/**
 * The somersault's angle 0..1: the integral of a trapezoid of angular velocity (ease in over the
 * snap-in, constant through the spin, ease out over the snap-out). Driven directly, no spring, so
 * it ends exactly upright with no wobble.
 */
function spinAngle(t: number): number {
  const a = SPIN_IN;
  const b = 1 - SPIN_OUT;
  const area = 1 - a / 2 - b / 2;
  let x: number;
  if (t <= 0) x = 0;
  else if (t < a) x = (t * t) / (2 * a);
  else if (t < 1 - b) x = a / 2 + (t - a);
  else if (t < 1) {
    const u = t - (1 - b);
    x = a / 2 + (1 - b - a) + u - (u * u) / (2 * b);
  } else x = area;
  return x / area;
}
/** The tuck amount: 0 -> 1 fast, held through the spin, 1 -> 0 fast with a little overshoot (< 0). */
function spinTuck(t: number): number {
  if (t < SPIN_IN) return easeOutCubic(t / SPIN_IN);
  if (t < SPIN_OUT) return 1;
  const u = sat((t - SPIN_OUT) / (1 - SPIN_OUT)) ** 1.3;
  const c = 1.4;
  const back = 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;
  return 1 - back;
}
const WALL = pose({
  [PF]: 3.5,
  [PU]: 31,
  [LEAN]: 0.1,
  [HT]: 0.12,
  [HAT]: 0.1,
  [AF]: 17.6,
  [AU]: 18,
  [AP]: -1.15,
  [BF]: 17.6,
  [BU]: 5,
  [BP]: -1.25,
  [NHF]: 10.5,
  [NHU]: 9,
  [NB]: -1,
  [GHF]: -13,
  [GHU]: -5,
  [GA]: 118,
  [GRIP]: 34,
  [TW]: 0.1,
  [FLARE]: 0.6,
  [LOOKY]: 0.4,
  [HYAW]: 0.55,
});
const DASH = pose({
  [PF]: -8,
  [PU]: 30,
  [LEAN]: 1.02,
  [HT]: -0.5,
  [HAT]: 0.3,
  [AF]: -37,
  [AU]: 24,
  [AP]: 1.45,
  [BF]: -41,
  [BU]: 30,
  [BP]: 1.5,
  [NHF]: -17,
  [NHU]: -5,
  [NB]: -0.4,
  [GHF]: -11,
  [GHU]: -9,
  [GA]: 181,
  [GRIP]: 32,
  [TW]: 0.2,
  [EYE]: 0.8,
});
const SKID = pose({
  [PF]: 2,
  [PU]: 28,
  [LEAN]: 0.3,
  [HT]: -0.12,
  [HAT]: 0.14,
  [AF]: 15,
  [AU]: 0,
  [AP]: 0,
  [BF]: -17,
  [BU]: 0,
  [BP]: 0.45,
  [NHF]: 5,
  [NHU]: -13,
  [NB]: -1,
  [GHF]: -4,
  [GHU]: -14,
  [GA]: 146,
  [TW]: 0.2,
  [FLARE]: 0.3,
});

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

/** A soft wave: a sine with its extremes held a little longer and a touch of asymmetry. */
function wave(x: number): number {
  const a = TAU * x;
  return Math.sin(a) + 0.14 * Math.sin(3 * a) + 0.06 * Math.sin(2 * a + 0.9);
}

function wrapPi(a: number): number {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  else if (x < -Math.PI) x += TAU;
  return x;
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
  /** Forward-frame spine lean actually used (pose + springs), for the cloth. */
  lean = 0;
  wDash = 0;
  wWall = 0;
  wRun = 0;
  wAir = 0;
  /** Run phase 0..1 (0 = near foot contact). */
  phase = 0.3;

  private readonly yaw = new Spring(1, 26, 0.85);
  private readonly headYaw = new Spring(1, 34, 0.8);
  private readonly leanS = new Spring(0, 12, 0.6);
  private readonly crouch = new Spring(0, 17, 0.62);
  private readonly squash = new Spring(0, 22, 0.6);
  private readonly velS = new Spring(0, 30, 0.9);
  private readonly lookS = new Spring(1, 4.5, 1);
  private readonly headLag = new Spring(0, 13, 0.55);
  private readonly hatLag = new Spring(0, 10, 0.4);
  // Hands follow their pose targets through springs: drag, overshoot, settle.
  private readonly nhf = new Spring(0, 19, 0.52);
  private readonly nhu = new Spring(0, 19, 0.52);
  private readonly ghf = new Spring(0, 24, 0.7);
  private readonly ghu = new Spring(0, 24, 0.7);
  private readonly gAng = new Spring(0, 15, 0.5);
  private readonly hsS = new Spring(1, 22, 1);
  private readonly gripS = new Spring(36, 22, 0.9);
  private wIdle = 1;
  private wSkid = 0;
  private lastCx = 0;
  private lastCy = 0;
  private lastVx = 0;
  private lastVy = 0;
  /** The somersault as a forward lean in the facing frame (radians), for the cloth. */
  flip = 0;
  /** Set by the owner before `update`: px of clear air under the feet (Infinity if unknown). */
  groundDist = Number.POSITIVE_INFINITY;
  /** -1..1: how much of the ball is in play, signed + for a forward somersault (for the cloth). */
  spin = 0;
  private spinT = 1;
  private spinDir = 1;
  private spinning = false;
  /** Somersault angle on screen (radians) and tuck amount; both decay quickly if it is cut short. */
  private phi = 0;
  private phi0 = 0;
  private tuck = 0;
  private blinkHold = 0;
  private vdx = 0;
  private vdy = -1;
  private fresh = true;
  private readonly out: Pose = new Float32Array(NP);
  private readonly tmp: Pose = new Float32Array(NP);
  private readonly tmp2: Pose = new Float32Array(NP);
  private readonly tmp3: Pose = new Float32Array(NP);
  private readonly legOut = { f: 0, u: 0, p: 0 };

  update(dt: number, clock: number, p: PlayerView, events: readonly SimEvent[]): void {
    const sig = this.sig;
    sig.spawned = this.fresh;
    this.fresh = false;
    sig.doubleJump = false;
    sig.jumped = false;
    sig.landed = 0;
    sig.landHard = false;
    sig.skid = false;
    sig.dashStart = false;
    sig.wallJump = false;

    const facingNow = p.motion === 'wallSlide' && p.wallDir !== 0 ? p.wallDir : p.facing;
    for (const e of events) {
      switch (e.type) {
        case 'spawn':
          sig.spawned = true;
          break;
        case 'jump':
          sig.jumped = true;
          // The somersault is a clean ball: no stretch kick on the double jump.
          this.squash.v += e.kind === 'double' ? 0.5 : 2.6;
          this.gAng.v -= 2.2 * facingNow;
          this.hatLag.v += 1.2;
          if (e.kind === 'double') {
            sig.doubleJump = true;
            // A forward somersault in the direction of travel.
            this.phi0 = wrapPi(this.phi);
            this.spinT = 0;
            this.spinning = true;
            this.spinDir = Math.abs(p.vx) > 1 ? Math.sign(p.vx) : facingNow;
          } else if (e.kind === 'wall') {
            sig.wallJump = true;
            this.squash.v += 1;
          }
          break;
        case 'land': {
          sig.landed = e.vy;
          sig.landHard = e.hard;
          const k = clamp(e.vy / 21, 0.15, 1);
          this.squash.v -= 0.6 + 3.2 * k;
          // Absorb through the legs: deeper and slower the harder the landing.
          this.crouch.omega = e.hard ? 11.5 : 15 - 2 * k;
          this.crouch.zeta = e.hard ? 0.72 : 0.62;
          this.crouch.v += e.hard ? 285 : 50 + 190 * k;
          this.gAng.v += (1 + 3.5 * k) * facingNow;
          this.hatLag.v -= 1 + 2.5 * k;
          this.headLag.v += 0.6 + 2 * k;
          this.nhu.v -= 30 + 90 * k;
          this.ghu.v -= 20 + 60 * k;
          break;
        }
        case 'dashStart':
          sig.dashStart = true;
          this.squash.v -= 1.6;
          break;
        case 'dashEnd':
          this.gAng.v -= 1.6 * facingNow;
          break;
        case 'skid':
          sig.skid = true;
          break;
        case 'headBump':
          this.squash.v -= 3;
          this.hatLag.v -= 2;
          break;
        case 'wallSlideStart':
          this.crouch.v += 50;
          this.headLag.v += 1;
          break;
        default:
          break;
      }
    }
    if (Math.abs(p.cx - this.lastCx) > 160 || Math.abs(p.feetY - this.lastCy) > 160) sig.spawned = true;

    const dirT = facingNow;
    const out = this.out;
    if (sig.spawned) {
      this.yaw.snap(dirT);
      this.headYaw.snap(dirT);
      this.lookS.snap(1);
      this.leanS.snap(0);
      this.crouch.snap(0);
      this.squash.snap(0);
      this.velS.snap(0);
      this.headLag.snap(0);
      this.hatLag.snap(0);
      this.hsS.snap(1);
      this.wIdle = 1;
      this.wRun = this.wAir = this.wWall = this.wDash = this.wSkid = 0;
      this.spinT = 1;
      this.spinning = false;
      this.phi = 0;
      this.tuck = 0;
      this.lastCx = p.cx;
      this.lastVx = p.vx;
      this.lastVy = p.vy;
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
    const runT = ground ? smoothstep(0.3, 5.5, speed) : 0;
    if (ground && this.wRun < 0.04 && runT > 0 && this.wAir < 0.2) this.phase = 0.3;
    this.wDash += ((dash ? 1 : 0) - this.wDash) * approach(dash ? 34 : 11, dt);
    this.wWall += ((wall ? 1 : 0) - this.wWall) * approach(wall ? 14 : 20, dt);
    this.wAir += ((air ? 1 : 0) - this.wAir) * approach(air ? 24 : 24, dt);
    this.wSkid += ((skid ? 1 : 0) - this.wSkid) * approach(skid ? 26 : 13, dt);
    this.wRun += (runT - this.wRun) * approach(runT > this.wRun ? 16 : 10, dt);
    this.wIdle += ((ground ? 1 - runT : 0) - this.wIdle) * approach(11, dt);

    // --- Run phase: by distance, signed by the facing so moving backwards runs it backwards.
    if (p.grounded && !dash) {
      this.phase += (dx * sgn) / CYCLE;
      this.phase -= Math.floor(this.phase);
    }

    // --- Blend the poses.
    out.fill(0);
    let wSum = 0;
    const add = (src: Pose, w: number): void => {
      if (w <= 1e-4) return;
      for (let i = 0; i < NP; i++) out[i]! += src[i]! * w;
      wSum += w;
    };
    if (this.wIdle > 1e-4) add(this.idlePose(clock), this.wIdle);
    if (this.wRun > 1e-4) add(this.runPose(this.phase, clock), this.wRun);
    if (this.wAir > 1e-4) add(this.airPose(p, clock, sgn), this.wAir);
    add(WALL, this.wWall);
    add(DASH, this.wDash);
    add(SKID, this.wSkid);
    if (wSum < 1e-3) add(this.idlePose(clock), 1);
    for (let i = 0; i < NP; i++) out[i]! /= wSum;

    // --- Springs layered on top.
    const step60 = Math.max(dt * 60, 0.25);
    const ax = (p.vx - this.lastVx) / step60;
    const ay = (p.vy - this.lastVy) / step60;
    this.lastVx = p.vx;
    this.lastVy = p.vy;
    const leanTarget = p.grounded
      ? clamp(ax * sgn * 0.085, -0.3, 0.3)
      : clamp(ax * sgn * 0.03 + (p.inputX * sgn - (p.vx * sgn) / 9.6) * 0.03, -0.14, 0.14);
    const leanExtra = this.leanS.step(dash ? 0 : leanTarget, dt);
    const crouch = clamp(this.crouch.step(0, dt), -2.5, 16);
    const sq = clamp(this.squash.step(0, dt), -0.15, 0.13);
    // The head and hat settle a beat after the body.
    const headLag = this.headLag.step(clamp(ay * 0.02, -0.12, 0.12), dt);
    const hatLag = this.hatLag.step(0, dt);
    out[PU]! -= crouch;
    out[LEAN]! += leanExtra + crouch * 0.01;
    out[CURL]! += crouch * 0.016;
    out[HT]! += headLag * 0.5 - leanExtra * 0.45 + crouch * 0.012;
    out[HAT]! += clamp(hatLag * 0.09, -0.14, 0.2);
    out[NHU]! -= crouch * 0.25;
    out[GHU]! -= crouch * 0.2;
    out[FLARE]! += sat(crouch * 0.06);

    // A slow blink now and then; eyes narrow briefly on a hard landing.
    let blink = bell(pulse(clock, 5.3, 0.22, 5, 0.9));
    if (sig.landHard) this.blinkHold = 0.2;
    this.blinkHold = Math.max(0, this.blinkHold - dt);
    if (this.blinkHold > 0) blink = Math.max(blink, sat(this.blinkHold / 0.07) * 0.8);

    // --- Double jump: a forward tuck somersault in three beats: snap into a ball, spin it
    // rigidly once about the body centre, snap out into the fall. Angle and tuck are curves of
    // the move's own clock; a whole turn is the identity, so the angle is exactly 0 at the end.
    if (this.spinning) {
      if (p.grounded || dash || wall) {
        // Cut short: go upright by the shortest way (the decay below).
        this.spinning = false;
        this.phi = wrapPi(this.phi);
      } else {
        this.spinT = Math.min(1, this.spinT + dt / SPIN_T);
        const t = this.spinT;
        const e = spinAngle(t);
        this.tuck = spinTuck(t);
        this.phi = this.phi0 * (1 - e) + TAU * e * this.spinDir;
        if (t >= 1) {
          this.spinning = false;
          this.phi = 0;
          this.tuck = 0;
        }
      }
    }
    if (!this.spinning) {
      const k = approach(26, dt);
      this.phi -= this.phi * k;
      this.tuck -= this.tuck * k;
      if (Math.abs(this.phi) < 1e-3) this.phi = 0;
      if (Math.abs(this.tuck) < 1e-3) this.tuck = 0;
    }
    const phi = this.phi;
    const tuckW = this.tuck;
    // In the ball nothing lags: springs on the hands and the glaive are overridden by the pose.
    const rigid = sat(tuckW);
    if (tuckW !== 0) for (let i = 0; i < NP; i++) out[i] = lerp(out[i]!, SOMER[i]!, tuckW);
    this.flip = phi * sgn;
    this.spin = rigid * this.spinDir * sgn;

    // --- Solve the skeleton.
    const j = this.frame.j;
    const s = this.frame.s;
    const look = this.lookS.step(out[HYAW]!, dt);
    const dh = clamp(this.headYaw.step(dirT, dt) * look, -1, 1);
    const czh = Math.sqrt(Math.max(0, 1 - (dh * BODY.sinHeadYaw) ** 2));
    const ox = p.cx;
    const oy = p.feetY;
    // Two-segment spine: the lower half carries the hips, the upper half the shoulders. `CURL`
    // bends it and the twist bows it the other way each stride, so the torso is never a block.
    const tw = out[TW]!;
    const leanLo = out[LEAN]! - out[CURL]! * 0.5 + tw * 0.13;
    const lean = out[LEAN]! + out[CURL]! * 0.5 - tw * 0.13;
    this.lean = lean;
    const headAng = lean * 0.4 + out[HT]!;
    const sl = Math.sin(lean);
    const cl = Math.cos(lean);
    const half = (BODY.torso + out[TL]!) / 2;

    const pelX = ox + (out[PF]! - tw * 1.1) * d;
    const pelY = oy - out[PU]!;
    const chestX = pelX + Math.sin(leanLo) * d * half;
    const chestY = pelY - Math.cos(leanLo) * half;
    const neckX = chestX + sl * d * half;
    const neckY = chestY - cl * half;
    set(j, J_CHEST, chestX, chestY);
    // Head centre: a little forward of and above the neck, in a frame leaning less than the spine.
    const ha = lean * 0.45;
    const sha = Math.sin(ha);
    const cha = Math.cos(ha);
    const headX = neckX + (1.6 * cha + 9.6 * sha) * d;
    const headY = neckY + 1.6 * sha - 9.6 * cha;
    set(j, J_PELVIS, pelX, pelY);
    set(j, J_NECK, neckX, neckY);
    set(j, J_HEAD, headX, headY);
    set(j, J_ORIGIN, ox, oy);
    set(j, J_CENTRE, ox, oy - 40);

    const bendLeg = clamp(-d * 1.8, -1, 1);
    // Shoulders in the torso frame (x forward, y down from the neck).
    const shF = [2.2 + tw * 3.4, 0.5 - tw * 3.4];
    const shD = [4.4, 4];
    const hipF = [1.6 - tw * 1.2, -1.6 + tw * 1.2];

    // Hand targets through their springs.
    if (sig.spawned) {
      this.nhf.snap(out[NHF]!);
      this.nhu.snap(out[NHU]!);
      this.ghf.snap(out[GHF]!);
      this.ghu.snap(out[GHU]!);
      this.gripS.snap(out[GRIP]!);
    }
    if (rigid > 0) {
      for (const [sp, ch] of [
        [this.nhf, NHF],
        [this.nhu, NHU],
        [this.ghf, GHF],
        [this.ghu, GHU],
        [this.gripS, GRIP],
      ] as const) {
        sp.x = lerp(sp.x, out[ch]!, rigid);
        sp.v *= 1 - rigid;
      }
    }
    const nhf = this.nhf.step(out[NHF]!, dt);
    const nhu = this.nhu.step(out[NHU]!, dt);
    const ghf = this.ghf.step(out[GHF]!, dt);
    const ghu = this.ghu.step(out[GHU]!, dt);

    // Mid-turn the body faces the camera: hips, shoulders and feet open sideways instead of
    // collapsing onto one line. (A fixed screen side per limb, so it is continuous through d = 0.)
    const open = 1 - d * d;
    for (let side = 0; side < 2; side++) {
      const lat = (side === 0 ? -1 : 1) * open;
      const hx = pelX + hipF[side]! * d + lat * 3;
      const hy = pelY;
      set(j, J_HIP + side, hx, hy);
      const bf = out[side === 0 ? AF : BF]!;
      const bu = out[side === 0 ? AU : BU]!;
      const bp = out[side === 0 ? AP : BP]!;
      const ballX = ox + bf * d + lat * 3.4;
      const ballY = oy - bu;
      const cp = Math.cos(bp);
      const sp = Math.sin(bp);
      // The ankle sits behind and above the ball as the heel lifts.
      const ankX = ballX - cp * BODY.foot * 0.62 * d + sp * 1.6 * d;
      const ankY = ballY - sp * BODY.foot * 0.62 - cp * 1.6;
      ik2(hx, hy, ankX, ankY, BODY.thigh, BODY.shin, bendLeg, 0.14);
      set(j, J_KNEE + side, ikOut.x, ikOut.y);
      const ex = ikOut.ex;
      const ey = ikOut.ey;
      set(j, J_ANK + side, ex, ey);
      // Toe and heel hang off the solved ankle, so the foot never detaches from a stretched leg.
      const bx = ex + (cp * BODY.foot * 0.62 - sp * 1.6) * d;
      const by = ey + sp * BODY.foot * 0.62 + cp * 1.6;
      set(j, J_TOE + side, bx + cp * BODY.foot * 0.38 * d, by + sp * BODY.foot * 0.38 - 0.3);
      set(j, J_HEEL + side, ex - (cp * 1.6 + sp * 1.2) * d, ey - sp * 1.6 + cp * 1.4);

      const sx = neckX + (shF[side]! * cl - shD[side]! * sl) * d + lat * 5;
      const sy = neckY + shF[side]! * sl + shD[side]! * cl;
      set(j, J_SH + side, sx, sy);
      const hf = side === 0 ? nhf : ghf;
      const hu = side === 0 ? nhu : ghu;
      const nb = side === 0 ? out[NB]! : -1;
      ik2(sx, sy, sx + hf * d, sy - hu, BODY.upperArm, BODY.foreArm, clamp(-nb * d * 1.8, -1, 1), 0.08);
      set(j, J_EL + side, ikOut.x, ikOut.y);
      set(j, J_HAND + side, ikOut.ex, ikOut.ey);
    }

    // --- The glaive: an angular spring in screen space (the somersault turns it with the body).
    const ga = (out[GA]! * Math.PI) / 180;
    const gTarget = Math.atan2(-Math.sin(ga), Math.cos(ga) * dirT);
    if (sig.spawned) this.gAng.snap(gTarget);
    // Chase along the shortest arc; on the ground that arc is the one over the head.
    const g = this.gAng;
    g.omega = 15 + 14 * this.wDash;
    g.zeta = 0.5 + 0.3 * this.wDash;
    const gNear = g.x + wrapPi(gTarget - g.x);
    if (rigid > 0) {
      g.x = lerp(g.x, gNear, rigid);
      g.v *= 1 - rigid;
    }
    g.step(gNear, dt);
    const theta = g.x;
    const grip = this.gripS.step(out[GRIP]!, dt);
    const cg = Math.cos(theta);
    const sg = Math.sin(theta);
    const handX = j[(J_HAND + 1) * 2]!;
    const handY = j[(J_HAND + 1) * 2 + 1]!;
    const buttX = handX - cg * grip;
    const buttY = handY - sg * grip;
    set(j, J_BUTT, buttX, buttY);
    set(j, J_TIP, buttX + cg * BODY.glaive, buttY + sg * BODY.glaive);
    // The hook hangs on the lower / forward side of the shaft; the hand rolls the shaft to keep it so.
    const perpX = -sg;
    const perpY = cg;
    if (rigid < 0.05 && Math.abs(phi) < 0.3)
      this.hsS.step(clamp((perpY + 0.2 * perpX * dirT) * 5, -1, 1), dt);
    const hs = clamp(this.hsS.x, -1, 1);
    set(
      j,
      J_HOOK,
      buttX + cg * BODY.hookAt + perpX * BODY.hookOut * hs,
      buttY + sg * BODY.hookAt + perpY * BODY.hookOut * hs,
    );

    // --- Whole-body squash and stretch (subtle), volume-preserving.
    const gT = p.grounded ? 1 : 0;
    s[S_GROUND]! += (gT - s[S_GROUND]!) * approach(gT ? 30 : 18, dt);
    const gr = s[S_GROUND]!;
    const v = Math.hypot(p.vx, p.vy);
    if (v > 0.5) {
      const k = approach(18, dt);
      this.vdx += (p.vx / v - this.vdx) * k;
      this.vdy += (p.vy / v - this.vdy) * k;
    }
    const stretchT = dash ? (p.freeze > 0 ? -0.05 : 0.1) : (1 - gr) * smoothstep(8, 22, v) * 0.05;
    const st = 1 + this.velS.step(stretchT, dt);
    const vl = Math.hypot(this.vdx, this.vdy) || 1;
    const ux = this.vdx / vl;
    const uy = this.vdy / vl;
    const sy = 1 + sq;
    const sx = 1 / sy;
    const pivX = ox;
    const pivY = oy - 40 * (1 - gr);
    const cX = ox;
    const cY = oy - 40;
    const inv = 1 / st;
    for (let q = 0; q <= J_BUTT; q++) {
      const i = q === J_BUTT ? J_CHEST : q;
      const x = pivX + (j[i * 2]! - pivX) * sx;
      const y = pivY + (j[i * 2 + 1]! - pivY) * sy;
      const rx = x - cX;
      const ry = y - cY;
      const along = rx * ux + ry * uy;
      const across = -rx * uy + ry * ux;
      j[i * 2] = cX + ux * along * st - uy * across * inv;
      j[i * 2 + 1] = cY + uy * along * st + ux * across * inv;
    }
    // The glaive is rigid: carry it with the squashed hand instead of squashing it.
    const mdx = j[(J_HAND + 1) * 2]! - handX;
    const mdy = j[(J_HAND + 1) * 2 + 1]! - handY;
    for (let i = J_BUTT; i <= J_HOOK; i++) {
      j[i * 2]! += mdx;
      j[i * 2 + 1]! += mdy;
    }

    // --- The somersault: everything turns about the body centre.
    if (Math.abs(phi) > 1e-4) {
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      for (let q = 0; q <= J_HOOK + 1; q++) {
        const i = q === J_HOOK + 1 ? J_CHEST : q;
        const rx = j[i * 2]! - cX;
        const ry = j[i * 2 + 1]! - cY;
        j[i * 2] = cX + rx * cp - ry * sp;
        j[i * 2 + 1] = cY + rx * sp + ry * cp;
      }
    }

    s[S_D] = d;
    s[S_DH] = dh;
    s[S_CZH] = czh;
    s[S_LEAN] = lean + this.flip;
    s[S_HEADROT] = headAng * dh + phi;
    s[S_HATROT] = (headAng + out[HAT]!) * dh + phi;
    s[S_EYE] = Math.min(1, out[EYE]!) * (1 - blink);
    s[S_GANG] = theta + phi;
    s[S_HS] = hs;
    s[S_GRIP] = grip;
    s[S_FLARE] = Math.max(0, out[FLARE]!);
    s[S_LOOKY] = out[LOOKY]!;
    s[S_TWIRL] = this.spinning ? Math.max(rigid, 0.6) : rigid;
    s[S_BALL] = rigid;
  }

  /** At ease: weight on the back hip, glaive upright in a loose grip, slow breath, small drifts. */
  private idlePose(clock: number): Pose {
    const o = this.tmp;
    o.fill(0);
    const br = Math.sin(clock * TAU * 0.21);
    const breath = br + 0.18 * Math.sin(clock * TAU * 0.42 + 0.8);
    const breathLate = Math.sin(clock * TAU * 0.21 - 0.9);
    const shift = noise1(clock * 0.16, 3);
    const drift = noise1(clock * 0.37, 9);
    const drift2 = noise1(clock * 0.27, 17);
    const glance = pulse(clock, 8.5, 3.6, 11, 0.7);
    const gl = glance > 0 ? smoothstep(0, 0.22, glance) * (1 - smoothstep(0.72, 1, glance)) : 0;
    // Now and then he settles his weight and lets the glaive tip a little.
    const settle = pulse(clock, 6.7, 2.4, 23, 0.8);
    const se = settle > 0 ? smoothstep(0, 0.3, settle) * (1 - smoothstep(0.55, 1, settle)) : 0;
    // Quiet beats: a hand goes up to settle the hat brim; a look up at the lantern.
    const hatP = pulse(clock, 12.3, 2.5, 31, 0.75);
    const he = hatP > 0 ? smoothstep(0, 0.3, hatP) * (1 - smoothstep(0.64, 1, hatP)) : 0;
    const tip = hatP > 0 ? smoothstep(0.3, 0.44, hatP) * (1 - smoothstep(0.5, 0.66, hatP)) : 0;
    o[PF] = -3.6 + shift * 1.5 - se * 1.2;
    o[PU] = 34.5 + breath * 0.6 - Math.abs(shift) * 0.4 - se * 0.7;
    o[LEAN] = 0.0 + shift * 0.02 + breath * 0.007 + se * 0.02;
    o[TL] = breath * 0.9;
    o[HT] = -0.02 + breathLate * 0.014 - gl * 0.15 + se * 0.04 + tip * 0.05;
    o[HAT] = 0.19 + drift2 * 0.02 - gl * 0.06 + tip * 0.11 - he * 0.03;
    o[CURL] = 0.05 + breath * 0.02 + se * 0.03;
    o[AF] = 13;
    o[AU] = 0;
    o[AP] = 0.03;
    o[BF] = -2.5;
    o[BU] = 0;
    o[BP] = 0;
    o[NHF] = lerp(1.6 + drift * 1.3 - shift * 0.6, 9.5, he);
    o[NHU] = lerp(-19 + breathLate * 0.45, 13.2 - tip * 1.4, he);
    o[NB] = -1;
    o[GHF] = 13.5 + shift * 0.9 + drift2 * 0.6 - se * 1.5;
    o[GHU] = -8.5 + breathLate * 0.7 - se * 1.6;
    o[GA] = 81 + drift * 2.2 + shift * 1.6 + se * 7;
    o[GRIP] = 35 - se * 5;
    o[TW] = shift * 0.05;
    o[FLARE] = 0;
    o[EYE] = 1;
    o[LOOKY] = 0.05 - gl * 0.8;
    o[HYAW] = 1 - gl * 0.3;
    return o;
  }

  /** One leg of the lope at phase `ph` (0 = this foot's contact). */
  private leg(ph: number): void {
    const o = this.legOut;
    const f = ph - Math.floor(ph);
    const F1 = CONTACT_F - CYCLE * STANCE;
    if (f < STANCE) {
      // A light touch on the ball of the foot, rolling to the toe.
      const t = f / STANCE;
      o.f = CONTACT_F - CYCLE * f;
      o.p = t < 0.3 ? lerp(0.16, 0.07, smoothstep(0, 0.3, t)) : lerp(0.07, 1.12, ((t - 0.3) / 0.7) ** 1.7);
      // The toe is the last thing on the ground: the ball lifts as the heel rolls up.
      o.u = Math.max(0, Math.sin(o.p)) * BODY.foot * 0.36;
    } else {
      // A long floating swing: the foot trails with loose toes, folds through late, reaches softly.
      const t = (f - STANCE) / (1 - STANCE);
      o.f = hermite(F1, -SPAN * 0.42, CONTACT_F, -SPAN * 0.5, t);
      const lift = Math.sin(Math.PI * t ** 0.78) ** 1.25;
      o.u = 15.5 * lift * (1 - 0.42 * t) + 1.2 * Math.sin(Math.PI * t) + 2.3 * (1 - t) ** 3 + 0.4 * t ** 4;
      if (t < 0.22) o.p = lerp(1.12, 1.5, smoothstep(0, 0.22, t));
      else if (t < 0.66) o.p = lerp(1.5, 0.35, smoothstep(0.22, 0.66, t));
      else if (t < 0.9) o.p = lerp(0.35, -0.12, smoothstep(0.66, 0.9, t));
      else o.p = lerp(-0.12, 0.16, smoothstep(0.9, 1, t));
    }
  }

  /** An unhurried bounding lope. Nothing shares a phase. */
  private runPose(ph: number, clock: number): Pose {
    const o = this.tmp2;
    o.fill(0);
    this.leg(ph);
    o[AF] = this.legOut.f;
    o[AU] = this.legOut.u;
    o[AP] = this.legOut.p;
    this.leg(ph + 0.5);
    o[BF] = this.legOut.f;
    o[BU] = this.legOut.u;
    o[BP] = this.legOut.p;
    // The body rides a ballistic arc between footfalls: lowest mid-stance, lingering at the top.
    const top = STANCE / 2 + 0.25;
    const hop = Math.cos(2 * TAU * (ph - top));
    const arc = hop - 0.32 * (1 - hop * hop);
    o[PF] = -1.2 + 0.9 * wave(2 * (ph - 0.16));
    o[PU] = 31.9 + 2.5 * arc;
    o[LEAN] = 0.115 + 0.03 * wave(2 * (ph - 0.3));
    o[TL] = 0.3 * wave(2 * (ph - 0.42));
    o[HT] = -0.04 + 0.014 * wave(2 * (ph - 0.55));
    o[HAT] = 0.11 + 0.02 * wave(2 * (ph - 0.68));
    // Free arm: loose and trailing. Upper arm, then forearm a beat later, as angles from straight down.
    const ua = -0.86 - 0.19 * wave(ph + 0.19) + 0.04 * noise1(clock * 0.9, 4);
    const fa = ua + 0.32 - 0.26 * wave(ph + 0.05) + 0.07 * wave(2 * (ph - 0.2));
    o[NHF] = Math.sin(ua) * BODY.upperArm + Math.sin(fa) * BODY.foreArm;
    o[NHU] = -(Math.cos(ua) * BODY.upperArm + Math.cos(fa) * BODY.foreArm) - 0.9 * arc;
    o[NB] = -1;
    // Glaive low at the side, angled back; it rides the bounce a beat late.
    const late = wave(2 * (ph - top - 0.14) + 0.25);
    o[GHF] = 8.6 + 0.8 * wave(ph - 0.33);
    o[GHU] = 0.4 + 0.9 * late;
    o[GA] = 153 + 2.6 * wave(2 * (ph - 0.62)) + 0.8 * noise1(clock * 1.3, 6);
    o[GRIP] = 27;
    o[CURL] = 0.07 + 0.05 * wave(2 * (ph - 0.47));
    o[TW] = 0.42 * wave(ph + 0.22);
    o[FLARE] = 0.1;
    o[EYE] = 1;
    o[LOOKY] = 0;
    o[HYAW] = 1;
    return o;
  }

  private airPose(p: PlayerView, clock: number, sgn: number): Pose {
    const o = this.tmp3;
    const r = smoothstep(-3.5, -19, p.vy);
    const fl = smoothstep(1.5, 12, p.vy);
    const tk = Math.max(0, 1 - r - fl);
    for (let i = 0; i < NP; i++) o[i] = RISE[i]! * r + TUCK[i]! * tk + FALL[i]! * fl;
    const vf = clamp((p.vx * sgn) / 9.6, -1.4, 1.4);
    o[LEAN]! += 0.1 * vf;
    o[PF]! += 1.5 * vf;
    // Slow independent drifts so a long fall is never a frozen pose.
    const a = noise1(clock * 1.1, 31);
    const b = noise1(clock * 0.9, 37);
    o[AF]! += a * 1.2;
    o[BF]! -= b * 1.4;
    o[BU]! += a * 0.8;
    o[NHU]! += b * 1.2 * (0.4 + fl);
    o[NHF]! += a * 0.8;
    o[GA]! += b * 2.5;
    // Anticipate the ground: in the last frames of a fall the legs reach for it, heel first, the
    // glaive lifts upright and the free arm opens for balance.
    const ttg = this.groundDist / Math.max(p.vy, 1);
    const reach = smoothstep(2, 6, p.vy) * smoothstep(8, 2.5, ttg);
    if (reach > 0) {
      o[PU] = lerp(o[PU]!, 35.6, reach);
      o[LEAN] = lerp(o[LEAN]!, 0.07, reach);
      o[AF] = lerp(o[AF]!, 10.5, reach);
      o[AU] = lerp(o[AU]!, 2.6, reach);
      o[AP] = lerp(o[AP]!, -0.12, reach);
      o[BF] = lerp(o[BF]!, -6.5, reach);
      o[BU] = lerp(o[BU]!, 2.2, reach);
      o[BP] = lerp(o[BP]!, 0.3, reach);
      o[NHF] = lerp(o[NHF]!, -9, reach);
      o[NHU] = lerp(o[NHU]!, -5, reach);
      o[GHF] = lerp(o[GHF]!, 6, reach);
      o[GHU] = lerp(o[GHU]!, -3, reach);
      o[GA] = lerp(o[GA]!, 98, reach);
      o[HT] = lerp(o[HT]!, 0.2, reach);
    }
    return o;
  }
}

function set(j: Float32Array, i: number, x: number, y: number): void {
  j[i * 2] = x;
  j[i * 2 + 1] = y;
}
