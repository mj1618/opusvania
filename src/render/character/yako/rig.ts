// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Yako's skeleton and animation.
 *
 * Everything is authored in the "forward frame" in design units: x toward the facing direction,
 * y DOWN, origin at the feet centre (the same space the concept was drawn in). A single affine
 * base matrix maps it to the world: scale, the turn (x scale through a spring, so a turn-around is
 * a quick squash-through led by the head), squash and stretch.
 *
 * Animation = pose generators (idle, run, air, wall, dash, skid), each continuous in time,
 * cross-faded by smoothed weights, plus springs on top: lean from acceleration, a landing crouch,
 * squash/stretch, hands that lag on springs, and a "drag" term (low-passed velocity minus
 * velocity) that makes loose parts trail whatever the body does. Feet are 2-bone IK to ball
 * targets; the run phase advances with distance and the stance is linear in phase, so planted feet
 * do not slide.
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

/** World px per design unit. */
export const K = 0.95;
export const THIGH = 17.5;
export const SHIN = 17;
export const UPPER = 11;
export const FORE = 12.5;
/** Head scale inside the body frame. */
export const HEAD = 0.78;
/** The sheathed blade's frame inside the torso frame. */
export const BLADE = { x: -5.5, y: -9, rot: 0.5 } as const;
/** Ball of the foot in the foot's own frame (ankle at the origin, sole down), design units. */
const BALL_X = 5.5;
const BALL_Y = 2.7;

// --- Joints (x, y pairs in Rig.j), forward frame, design units.
export const J_HIP = 0;
export const J_NECK = 1;
export const J_SH_N = 2;
export const J_SH_F = 3;
export const J_EL_N = 4;
export const J_EL_F = 5;
export const J_HA_N = 6;
export const J_HA_F = 7;
export const J_HIP_N = 8;
export const J_HIP_F = 9;
export const J_KN_N = 10;
export const J_KN_F = 11;
export const J_AN_N = 12;
export const J_AN_F = 13;
export const J_TAIL = 14;
export const J_KNOT = 15;
export const J_CHARM = 16;
export const J_COUNT = 17;

// --- Pose channels.
const HX = 0; // hip
const HY = 1;
const LEAN = 2; // torso lean forward, rad
const CURL = 3; // extra bend of the upper spine
const HR = 4; // head rotation (absolute: the head stays level whatever the torso does)
const AX = 5; // near foot: ball x, y, pitch (heel lift, rad)
const AY = 6;
const AP = 7;
const BX = 8; // far foot
const BY = 9;
const BP = 10;
const NHX = 11; // near hand relative to its shoulder
const NHY = 12;
const FHX = 13; // far hand
const FHY = 14;
const NB = 15; // elbow bend: +1 = elbow behind the shoulder-hand line
const FB = 16;
const TW = 17; // shoulder twist (near shoulder forward, far back), design units
const SHY = 18; // shoulder tilt (near down, far up)
const GRIP = 19;
const HILT = 20; // 0..1: the near hand rests on the blade's hilt
const TLIFT = 21; // tail: lift (rad, - = raised back and up) and curl per segment
const TCURL = 22;
const SLIFT = 23; // sash tails lift
const HEM = 24; // jacket skirt: + swept back, - opened
const EARS = 25; // ears laid back, rad
const NP = 26;

type Pose = Float32Array;

function pose(v: number[]): Pose {
  const p = new Float32Array(NP);
  p.set(v);
  return p;
}

/** Run cycle length in world px. Longer than the hooded skin's: a slower, floatier lope. */
export const CYCLE = 240;
/** Somersault duration, seconds. */
export const SPIN_T = 0.42;
const CYCLE_D = CYCLE / K;
/** Fraction of the cycle a foot is planted. */
export const STANCE = 0.17;
const CONTACT = 16.5;
const TOE_OFF = CONTACT - CYCLE_D * STANCE;

// Channel order:
//   HX HY LEAN CURL HR | AX AY AP | BX BY BP | NHX NHY FHX FHY NB FB | TW SHY GRIP HILT | TLIFT TCURL SLIFT HEM EARS
const RISE = pose([
  0, -36.5, 0.1, -0.05, -0.03, 0, -3, 1.05, 9, -13, 0.5, -6, 17, 5, 16, 1, 1, 0, 0, 0.1, 0, -0.75, 0.08, 0.1,
  0.3, 0.3,
]);
const TUCK = pose([
  0, -38, 0.08, 0.07, 0.05, 14, -16.5, 0.5, -13, -7.5, 1.1, 8, 14, -12, 10, 1, 1, 0, 0, 0.12, 0, -0.25, -0.03,
  -0.1, -0.5, 0.18,
]);
const FALL = pose([
  -1, -36.5, -0.07, 0.03, 0.1, 6, -2, 0.45, -8, -9, 0.95, -11, 13, 5, 16, 1, 1, 0, 0, 0.05, 0, -0.5, -0.04,
  -0.3, -0.9, -0.08,
]);
/** The somersault's tuck: knees to the chest, arms wrapped round the shins, chin down. */
const SPIN_TUCK = pose([
  -8, -33, 0.6, 0.55, 1.25, 9, -23, 0.9, 6, -21.5, 1.0, 1, 15, -1, 14, 0.9, 0.9, 0, 0, 0.7, 0, 1.25, 0.42,
  0.5, 0, 0.95,
]);
/** Coming out of it: legs let out long, chest up, arms opening. */
const EXTEND = pose([
  0, -37.5, -0.16, -0.1, -0.06, -3, -1, 1.1, -13, -7, 1.3, -14, 6, 11, 5, 1, 1, 0, 0, 0, 0, -0.8, 0.05, -0.5,
  -1, 0.05,
]);
/** The last of a fall: reaching for the ground with pointed toes, arms lifted behind. */
const REACH = pose([
  -1, -37.5, -0.03, 0.02, 0.12, 5, 0, 0.75, -6, -4, 1.0, -14, 4, 8, 9, 1, 1, 0, 0, 0.05, 0, -0.7, -0.04, -0.4,
  -1, -0.05,
]);
const WALL = pose([
  1.5, -30, -0.04, 0.1, 0.1, 20.4, -9, -1.05, 20.6, -22, -1.15, 19, -14, -6, 13, -0.6, 1, -1, 0.6, 0.6, 0,
  0.15, -0.03, 0.2, -0.3, 0.12,
]);
const DASH = pose([
  -5, -27, 1.22, 0.06, 0.2, -38, -17, 1.45, -40, -23.5, 1.5, -19, 2, -17, 5, 0.4, 0.4, 0, 0, 0.3, 0, -0.65,
  0.2, -0.75, 1, 0.95,
]);
const SKID = pose([
  3, -28.5, 0.34, 0.1, -0.08, 12, 0, 0, -19, 0, 0.35, -9, 12, 11, 10, 1, 1, 0.6, 0, 0.2, 0, -0.3, 0, -0.3,
  -0.4, 0.35,
]);

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
  turned: boolean;
}

/** Piecewise cubic through (t, v) pairs, flat list, t ascending in 0..1; tangents by finite differences. */
function keyed(k: readonly number[], t: number): number {
  const n = k.length >> 1;
  let i = 0;
  while (i < n - 2 && t >= k[(i + 1) * 2]!) i++;
  const t1 = k[i * 2]!;
  const t2 = k[i * 2 + 2]!;
  const p1 = k[i * 2 + 1]!;
  const p2 = k[i * 2 + 3]!;
  const m1 = i > 0 ? (p2 - k[i * 2 - 1]!) / (t2 - k[i * 2 - 2]!) : (p2 - p1) / (t2 - t1);
  const m2 = i < n - 2 ? (k[i * 2 + 5]! - p1) / (k[i * 2 + 4]! - t1) : (p2 - p1) / (t2 - t1);
  const u = sat((t - t1) / (t2 - t1));
  return hermite(p1, m1 * (t2 - t1), p2, m2 * (t2 - t1), u);
}

const SWING_Y: readonly number[] = [0, 0, 0.12, -6.5, 0.28, -12.5, 0.48, -13.5, 0.68, -10.5, 0.86, -5, 1, 0];
const SWING_P: readonly number[] = [
  0, 0.98, 0.14, 1.28, 0.34, 1.12, 0.55, 0.62, 0.76, 0.08, 0.9, -0.2, 1, -0.12,
];

/** Signed x scale for a turn factor: never thinner than a sliver, so the flip is a squash-through. */
function turnScale(d: number): number {
  const a = Math.abs(d);
  const e = 1 - (1 - a) * (1 - a);
  return (d >= 0 ? 1 : -1) * (0.24 + 0.76 * e);
}

export class Rig {
  /** Forward-frame joints, design units. */
  readonly j = new Float32Array(J_COUNT * 2);
  readonly sig: RigSignals = {
    spawned: true,
    doubleJump: false,
    jumped: false,
    landed: 0,
    landHard: false,
    skid: false,
    dashStart: false,
    wallJump: false,
    turned: false,
  };

  // --- The base matrix: forward frame (design units) -> world px.
  ma = K;
  mb = 0;
  mc = 0;
  md = K;
  mtx = 0;
  mty = 0;
  /** Result of `world`. */
  X = 0;
  Y = 0;

  // --- What the drawing and the secondary motion read.
  /** Raw turn factor -1..1 (continuous), the body's signed x scale, and the head's relative to it. */
  yawRaw = 1;
  d = 1;
  headFlip = 1;
  lean = 0;
  curl = 0;
  breath = 0;
  headRot = 0;
  headDy = 0;
  pitchN = 0;
  pitchF = 0;
  grip = 0;
  tw = 0;
  shy = 0;
  hem = 0;
  ears = 0;
  eye = 1;
  tailLift = 0;
  tailCurl = 0;
  sashLift = 0;
  /** Drag in px per frame, forward frame: low-passed velocity minus velocity. */
  dragX = 0;
  dragY = 0;
  /** Forward speed in px/frame (signed by the facing) and how fast the body moves in all. */
  vf = 0;
  speed = 0;
  /** Somersault: screen angle (rad, clockwise +), tuck weight 0..1, whether it is running. */
  spinPhi = 0;
  spinW = 0;
  spinning = false;
  /** Wrist angles (rad): the hands trail the forearms. */
  wristN = 0;
  wristF = 0;
  /** A slip of the wall hand, 0..1. */
  slip = 0;
  wDash = 0;
  wWall = 0;
  wRun = 0;
  wAir = 0;
  wIdle = 1;
  wSkid = 0;
  /** 1 on the ground .. 0 in the air (smoothed). */
  ground = 1;
  /** Run phase 0..1 (0 = the near foot's contact). */
  phase = 0.52;

  private readonly yaw = new Spring(1, 24, 0.86);
  private readonly headYaw = new Spring(1, 44, 0.8);
  private readonly leanS = new Spring(0, 11, 0.6);
  private readonly crouch = new Spring(0, 17, 0.6);
  private readonly squash = new Spring(0, 21, 0.55);
  private readonly velS = new Spring(0, 28, 0.9);
  private readonly lpX = new Spring(0, 9, 1);
  private readonly lpY = new Spring(0, 9, 1);
  private readonly hnx = new Spring(0, 20, 0.52);
  private readonly hny = new Spring(0, 18, 0.5);
  private readonly hfx = new Spring(0, 18.5, 0.54);
  private readonly hfy = new Spring(0, 16.5, 0.5);
  private readonly wrN = new Spring(0, 17, 0.38);
  private readonly wrF = new Spring(0, 15, 0.4);
  private readonly spinS = new Spring(0, 44, 0.74);
  private spinT = 0;
  private spinDir = 1;
  private spinFree = false;
  private lastNhx = 0;
  private lastNhy = 0;
  private lastFhx = 0;
  private lastFhy = 0;
  private readonly headS = new Spring(0, 20, 0.55);
  private readonly headRotS = new Spring(0, 18, 0.7);
  private lastCx = 0;
  private lastFy = 0;
  private lastVx = 0;
  private blinkHold = 0;
  private vdx = 0;
  private vdy = -1;
  private handsFresh = true;
  private readonly out: Pose = new Float32Array(NP);
  private readonly tmp: Pose = new Float32Array(NP);
  private readonly tmp2: Pose = new Float32Array(NP);
  private readonly tmp3: Pose = new Float32Array(NP);
  private legX = 0;
  private legY = 0;
  private legP = 0;
  private tX = 0;
  private tY = 0;

  /** Forward-frame point -> world px, into X/Y. */
  world(x: number, y: number): void {
    this.X = this.ma * x + this.mc * y + this.mtx;
    this.Y = this.mb * x + this.md * y + this.mty;
  }

  /** Joint i in world px, into X/Y. */
  wj(i: number): void {
    this.world(this.j[i * 2]!, this.j[i * 2 + 1]!);
  }

  /** Torso-frame point -> forward frame (lean, spine curl, breath), into tX/tY. */
  private torso(lx: number, ly: number): void {
    const t = -ly / 30;
    const ang = this.lean + this.curl * (t < 0 ? 0 : t > 1.3 ? 1.3 : t);
    const co = Math.cos(ang);
    const si = Math.sin(ang);
    this.tX = this.j[J_HIP * 2]! + lx * co - ly * si;
    this.tY = this.j[J_HIP * 2 + 1]! + lx * si + ly * co;
  }

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
    sig.turned = false;

    let startSpin = false;
    for (const e of events) {
      switch (e.type) {
        case 'spawn':
          sig.spawned = true;
          break;
        case 'jump':
          sig.jumped = true;
          this.squash.v += 2.6;
          if (e.kind === 'double') {
            sig.doubleJump = true;
            startSpin = true;
          } else if (e.kind === 'wall') {
            sig.wallJump = true;
            this.squash.v += 0.8;
            // The legs give as he kicks off the wall.
            this.crouch.v += 75;
          }
          break;
        case 'land':
          sig.landed = e.vy;
          sig.landHard = e.hard;
          this.squash.v -= clamp(e.vy * 0.13, 0.4, 3);
          this.crouch.v += clamp(e.vy * 8.5, 30, 220);
          break;
        case 'dashStart':
          sig.dashStart = true;
          this.squash.v -= 1.4;
          break;
        case 'skid':
          sig.skid = true;
          break;
        case 'turn':
          sig.turned = true;
          break;
        case 'headBump':
          this.squash.v -= 2.4;
          this.crouch.v += 60;
          break;
        case 'wallSlideStart':
          this.crouch.v += 45;
          break;
        default:
          break;
      }
    }
    if (Math.abs(p.cx - this.lastCx) > 160 || Math.abs(p.feetY - this.lastFy) > 160) sig.spawned = true;

    const wall = p.motion === 'wallSlide' && p.wallDir !== 0;
    const dirT = wall ? p.wallDir : p.facing;
    // The head looks where the sim faces: away from the wall in a slide, over the shoulder.
    const headT = p.facing;
    if (sig.spawned) {
      this.yaw.snap(dirT);
      this.headYaw.snap(headT);
      this.leanS.snap(0);
      this.crouch.snap(0);
      this.squash.snap(0);
      this.velS.snap(0);
      this.lpX.snap(p.vx * dirT);
      this.lpY.snap(p.vy);
      this.headS.snap(0);
      this.headRotS.snap(0.04);
      this.handsFresh = true;
      this.wIdle = 1;
      this.wRun = this.wAir = this.wWall = this.wDash = this.wSkid = 0;
      this.spinS.snap(0);
      this.spinning = false;
      this.spinW = 0;
      this.spinPhi = 0;
      this.wrN.snap(0);
      this.wrF.snap(0);
      startSpin = false;
      this.lastCx = p.cx;
      this.lastVx = p.vx;
      this.phase = 0.52;
      this.ground = p.grounded ? 1 : 0;
    }
    const dx = p.cx - this.lastCx;
    this.lastCx = p.cx;
    this.lastFy = p.feetY;

    // --- Turn: the head leads, the body follows through.
    const yawRaw = clamp(this.yaw.step(dirT, dt), -1, 1);
    const headRaw = clamp(this.headYaw.step(headT, dt), -1, 1);
    const d = turnScale(yawRaw);
    const dh = turnScale(headRaw);
    const sgn = d >= 0 ? 1 : -1;
    this.yawRaw = yawRaw;
    this.d = d;
    this.headFlip = dh / d;

    // --- Pose weights.
    const speed = Math.abs(p.vx);
    const dash = p.motion === 'dash';
    const air = !p.grounded && !dash && !wall;
    const skid = p.motion === 'skid';
    const ground = p.grounded && !dash && !skid;
    const runT = ground ? smoothstep(0.3, 5, speed) : 0;
    if (ground && this.wRun < 0.04 && runT > 0 && this.wAir < 0.2) this.phase = 0.52;
    // A dash or a wall takes over at once; everything else eases.
    const cut = dash ? 30 : 0;
    this.wDash += ((dash ? 1 : 0) - this.wDash) * approach(dash ? 34 : 11, dt);
    this.wWall += ((wall ? 1 : 0) - this.wWall) * approach(wall ? 14 : 20, dt);
    this.wAir += ((air ? 1 : 0) - this.wAir) * approach(Math.max(air ? 22 : 24, cut), dt);
    this.wSkid += ((skid ? 1 : 0) - this.wSkid) * approach(Math.max(skid ? 24 : 12, cut), dt);
    this.wRun += (runT - this.wRun) * approach(Math.max(runT > this.wRun ? 16 : 9, cut), dt);
    this.wIdle += ((ground ? 1 - runT : 0) - this.wIdle) * approach(Math.max(10, cut), dt);

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

    // --- Double jump: a forward somersault. The whole rig turns once about the body's middle (the
    // angle is a spring following an eased 0 -> 2pi ramp, so it starts and ends without a pop)
    // while the pose tucks tight, then lets the legs out long as the turn completes.
    if (startSpin) {
      this.spinS.x -= Math.round(this.spinS.x / TAU) * TAU;
      this.spinning = true;
      this.spinFree = false;
      this.spinT = 0;
      this.spinDir = Math.abs(p.vx) > 1.5 ? (p.vx > 0 ? 1 : -1) : sgn;
      this.spinS.omega = 44;
      this.spinS.zeta = 0.74;
    }
    let extend = 0;
    if (this.spinning) {
      if (p.grounded || dash || wall) this.spinFree = true;
      let target: number;
      let tuckT: number;
      if (this.spinFree) {
        // Cut short: finish to the nearest upright, quickly, and let go of the tuck.
        target = this.spinS.x > Math.PI ? TAU : 0;
        this.spinS.omega = 34;
        this.spinS.zeta = 1;
        tuckT = 0;
      } else {
        this.spinT += dt;
        const u = this.spinT / SPIN_T;
        const v = sat(u) ** 0.82;
        target = TAU * v * v * (3 - 2 * v);
        tuckT = smoothstep(0, 0.18, u) * (1 - smoothstep(0.5, 0.86, u));
        extend = smoothstep(0.52, 0.84, u) * (1 - smoothstep(1.1, 1.9, u));
      }
      this.spinW += (tuckT - this.spinW) * approach(tuckT > this.spinW ? 40 : 24, dt);
      const x = this.spinS.step(target, dt);
      this.spinPhi = x * this.spinDir;
      const done = this.spinFree || this.spinT > SPIN_T * 1.9;
      if (done && Math.abs(x - target) < 0.004 && Math.abs(this.spinS.v) < 0.08 && this.spinW < 0.01) {
        this.spinning = false;
        this.spinS.snap(0);
        this.spinPhi = 0;
        this.spinW = 0;
      }
    }
    if (extend > 1e-4) for (let i = 0; i < NP; i++) out[i] = lerp(out[i]!, EXTEND[i]!, extend * 0.85);
    if (this.spinW > 1e-4) for (let i = 0; i < NP; i++) out[i] = lerp(out[i]!, SPIN_TUCK[i]!, this.spinW);

    // --- Springs layered on top.
    const g60 = Math.max(dt * 60, 0.25);
    const ax = (p.vx - this.lastVx) / g60;
    this.lastVx = p.vx;
    const vf = p.vx * sgn;
    this.vf = vf;
    this.speed = Math.hypot(p.vx, p.vy);
    const leanTarget = p.grounded ? clamp(ax * sgn * 0.06, -0.3, 0.3) : clamp(ax * sgn * 0.02, -0.1, 0.1);
    const leanExtra = this.leanS.step(dash ? 0 : leanTarget, dt);
    const crouch = clamp(this.crouch.step(0, dt), -2.5, 11);
    const sq = clamp(this.squash.step(0, dt), -0.13, 0.13);
    // Drag: what the body just did that loose parts have not caught up with yet.
    const dragX = clamp(this.lpX.step(vf, dt) - vf, -7, 7);
    const dragY = clamp(this.lpY.step(p.vy, dt) - p.vy, -7, 7);
    this.dragX = dragX;
    this.dragY = dragY;

    out[HY]! += crouch;
    out[LEAN]! += leanExtra + crouch * 0.012;
    out[CURL]! += crouch * 0.012 - leanExtra * 0.25;
    out[HEM]! -= sat(crouch * 0.1) * 0.8;

    // A slow blink now and then; eyes close briefly on a hard landing.
    let blink = bell(pulse(clock, 5.3, 0.22, 5, 0.85));
    if (sig.landHard) this.blinkHold = 0.2;
    this.blinkHold = Math.max(0, this.blinkHold - dt);
    if (this.blinkHold > 0) blink = Math.max(blink, sat(this.blinkHold / 0.07));
    this.eye = 1 - blink;

    // --- Solve the skeleton (forward frame).
    const j = this.j;
    const gT = p.grounded ? 1 : 0;
    this.ground += (gT - this.ground) * approach(gT ? 30 : 18, dt);
    const g = this.ground;
    this.lean = out[LEAN]!;
    this.curl = out[CURL]!;
    this.breath = this.breathNow * this.wIdle;
    this.grip = out[GRIP]!;
    this.tw = out[TW]!;
    this.shy = out[SHY]!;
    this.hem = out[HEM]!;
    this.ears = out[EARS]!;
    this.tailLift = out[TLIFT]!;
    this.tailCurl = out[TCURL]!;
    this.sashLift = out[SLIFT]!;

    const hipY = Math.min(out[HY]!, -19);
    set(j, J_HIP, out[HX]!, hipY);
    const sy = 1 + 0.012 * this.breath;
    this.torso(1.6, -30.2 * sy);
    // The head rides the neck with a little vertical lag, and stays level.
    this.headDy = this.headS.step(clamp(dragY * 0.22, -1.6, 1.6), dt);
    set(j, J_NECK, this.tX, this.tY + this.headDy);
    this.headRot = this.headRotS.step(out[HR]! + leanExtra * 0.3 + clamp(dragY * 0.012, -0.08, 0.08), dt);
    this.torso(-5.4, -3.4);
    set(j, J_TAIL, this.tX, this.tY);
    this.torso(-8.6, -8.8);
    set(j, J_KNOT, this.tX, this.tY);
    this.torso(5.2, -5.4);
    set(j, J_CHARM, this.tX, this.tY);

    // Legs.
    const airK = 1 - g;
    for (let side = 0; side < 2; side++) {
      this.torso(side === 0 ? -1.2 : 2.6, side === 0 ? -0.5 : -0.8);
      const hx = this.tX;
      const hy = this.tY;
      set(j, J_HIP_N + side, hx, hy);
      let bx = out[side === 0 ? AX : BX]! + dragX * 0.55 * airK * (side === 0 ? 1 : 0.7);
      let by = out[side === 0 ? AY : BY]! + dragY * 0.35 * airK * (side === 0 ? 0.8 : 1);
      const bp = out[side === 0 ? AP : BP]! + dragY * 0.03 * airK;
      if (by > 0) by = 0;
      // Keep the foot from folding into the pelvis.
      const fold = 9 - 5 * this.spinW;
      if (by < hy + fold) by = hy + fold;
      if (this.wWall > 0.5 && bx > 20.8) bx = 20.8;
      const co = Math.cos(bp);
      const si = Math.sin(bp);
      const ankX = bx - (BALL_X * co - BALL_Y * si);
      const ankY = by - (BALL_X * si + BALL_Y * co);
      ik2(hx, hy, ankX, ankY, THIGH, SHIN, -1, 0.14);
      set(j, J_KN_N + side, ikOut.x, ikOut.y);
      set(j, J_AN_N + side, ikOut.ex, ikOut.ey);
      if (side === 0) this.pitchN = bp;
      else this.pitchF = bp;
    }

    // Arms: hand targets relative to the shoulder ride springs, so they lag and overshoot.
    const tw = this.tw;
    const shy = this.shy;
    this.torso(-0.4 + tw, (-24.6 + shy) * sy);
    const nsx = this.tX;
    const nsy = this.tY;
    this.torso(4.6 - tw * 0.64, (-25.2 - shy * 0.78) * sy);
    const fsx = this.tX;
    const fsy = this.tY;
    set(j, J_SH_N, nsx, nsy);
    set(j, J_SH_F, fsx, fsy);
    // The hilt, in the blade's frame inside the torso frame.
    const hc = Math.cos(BLADE.rot);
    const hs = Math.sin(BLADE.rot);
    this.torso(BLADE.x + -5.6 * hc - -2.6 * hs, BLADE.y + -5.6 * hs + -2.6 * hc);
    const hilt = sat(out[HILT]!);
    let ntx = lerp(out[NHX]!, this.tX - nsx, hilt);
    let nty = lerp(out[NHY]!, this.tY - nsy, hilt);
    let ftx = out[FHX]!;
    let fty = out[FHY]!;
    const loose = (1 - this.wWall) * (1 - 0.85 * this.spinW);
    ntx += dragX * 0.9 * loose * (1 - hilt);
    nty += dragY * 0.5 * loose * (1 - hilt);
    ftx += dragX * 0.75 * loose;
    fty += dragY * 0.6 * loose;
    // On the wall the hand slips a little now and then and catches again.
    const sl = this.wWall > 0.5 ? pulse(clock, 0.82, 0.3, 61, 0.8) : 0;
    this.slip = sl > 0 ? Math.sin(Math.PI * sl) ** 2 : 0;
    nty += this.slip * 4.5 * this.wWall;
    if (this.handsFresh) {
      this.handsFresh = false;
      this.hnx.snap(ntx);
      this.hny.snap(nty);
      this.hfx.snap(ftx);
      this.hfy.snap(fty);
    }
    const nhx = this.hnx.step(ntx, dt);
    const nhy = this.hny.step(nty, dt);
    const fhx = this.hfx.step(ftx, dt);
    const fhy = this.hfy.step(fty, dt);
    ik2(nsx, nsy, nsx + nhx, nsy + nhy, UPPER, FORE, clamp(out[NB]!, -1, 1), 0.08);
    set(j, J_EL_N, ikOut.x, ikOut.y);
    set(j, J_HA_N, ikOut.ex, ikOut.ey);
    ik2(fsx, fsy, fsx + fhx, fsy + fhy, UPPER, FORE, clamp(out[FB]!, -1, 1), 0.08);
    set(j, J_EL_F, ikOut.x, ikOut.y);
    set(j, J_HA_F, ikOut.ex, ikOut.ey);
    // Wrists: the hands trail the way the forearm just moved.
    const k60 = 1 / g60;
    const wn = clamp(((nhx - this.lastNhx) * 0.5 - (nhy - this.lastNhy) * 0.35) * k60, -0.75, 0.75);
    const wf = clamp(((fhx - this.lastFhx) * 0.5 - (fhy - this.lastFhy) * 0.35) * k60, -0.75, 0.75);
    this.lastNhx = nhx;
    this.lastNhy = nhy;
    this.lastFhx = fhx;
    this.lastFhy = fhy;
    const firm = 1 - hilt;
    this.wristN = this.wrN.step((0.18 - wn) * firm * (1 - this.wWall), dt);
    this.wristF = this.wrF.step(0.18 - wf, dt);

    // --- The base matrix: turn, squash, stretch along the velocity, scale, place.
    const v = this.speed;
    if (v > 0.5) {
      const k = approach(16, dt);
      this.vdx += (p.vx / v - this.vdx) * k;
      this.vdy += (p.vy / v - this.vdy) * k;
    }
    const stretchT = dash ? (p.freeze > 0 ? -0.06 : 0.1) : (1 - g) * smoothstep(7, 20, v) * 0.07;
    const st = 1 + this.velS.step(stretchT, dt);
    const inv = 1 / st;
    const vl = Math.hypot(this.vdx, this.vdy) || 1;
    const ux = this.vdx / vl;
    const uy = this.vdy / vl;
    const s00 = ux * ux * st + uy * uy * inv;
    const s01 = ux * uy * (st - inv);
    const s11 = uy * uy * st + ux * ux * inv;
    // The somersault turns everything about the same middle.
    const cs = Math.cos(this.spinPhi);
    const sn = Math.sin(this.spinPhi);
    const a00 = cs * s00 - sn * s01;
    const a01 = cs * s01 - sn * s11;
    const a10 = sn * s00 + cs * s01;
    const a11 = sn * s01 + cs * s11;
    // Squash about the feet on the ground, about the middle in the air. A turn stands a touch taller.
    const sqy = (1 + sq) * (1 + 0.05 * (1 - Math.abs(d)));
    const sqx = 1 / (1 + sq);
    const piv = -40 * (1 - g);
    const e = piv * (1 - sqy) + 40;
    this.ma = K * a00 * d * sqx;
    this.mb = K * a10 * d * sqx;
    this.mc = K * a01 * sqy;
    this.md = K * a11 * sqy;
    this.mtx = p.cx + K * a01 * e;
    this.mty = p.feetY + K * (-40 + a11 * e);
  }

  private breathNow = 0;

  /** Stillness: weight on the near hip, a hand on the hilt, slow breath, small drifts that never line up. */
  private idlePose(clock: number): Pose {
    const o = this.tmp;
    const th = clock * TAU * 0.235;
    const breath = Math.sin(th + 0.45 * Math.sin(th));
    const late = Math.sin(th - 0.9 + 0.45 * Math.sin(th - 0.9));
    this.breathNow = breath;
    const shift = noise1(clock * 0.13, 3);
    const shiftLate = noise1(clock * 0.13 - 0.11, 3);
    const nod = noise1(clock * 0.19, 7);
    const glance = pulse(clock, 4.7, 1.9, 11, 0.8);
    const gl = glance > 0 ? smoothstep(0, 0.2, glance) * (1 - smoothstep(0.75, 1, glance)) : 0;
    o[HX] = -2.4 + 0.7 * shift;
    o[HY] = -35.3 + 0.3 * breath + 0.25 * Math.abs(shift);
    o[LEAN] = 0.015 + 0.016 * shiftLate;
    o[CURL] = 0.03 - 0.014 * breath;
    o[HR] = 0.035 + 0.03 * nod + 0.008 * late - 0.11 * gl;
    o[AX] = 1;
    o[AY] = 0;
    o[AP] = 0;
    o[BX] = 15;
    o[BY] = 0;
    o[BP] = 0.1;
    o[NHX] = -6;
    o[NHY] = 14;
    o[FHX] = 2.6 + 0.5 * shiftLate;
    o[FHY] = 20.6 - 0.3 * late;
    o[NB] = -1;
    o[FB] = 0.7;
    o[TW] = -1.4 + 0.3 * shift;
    o[SHY] = 0.9 - 0.25 * breath;
    o[GRIP] = 0.35;
    o[HILT] = 1;
    o[TLIFT] = -0.42 + 0.07 * noise1(clock * 0.3, 13);
    o[TCURL] = 0;
    o[SLIFT] = 0;
    o[HEM] = 0.08 * late;
    o[EARS] = 0;
    return o;
  }

  /** One leg of the lope at phase `ph` (0 = this foot's contact): ball x, y and pitch. */
  private leg(ph: number): void {
    const f = ph - Math.floor(ph);
    if (f < STANCE) {
      const t = f / STANCE;
      this.legX = CONTACT - CYCLE_D * f;
      // Lands on the ball, rolls up onto the toe.
      this.legP = t < 0.18 ? lerp(-0.12, 0.05, t / 0.18) : 0.05 + 0.93 * ((t - 0.18) / 0.82) ** 1.7;
      this.legY = -Math.max(0, -Math.sin(this.legP)) * BALL_X * 0.6;
    } else {
      const t = (f - STANCE) / (1 - STANCE);
      const span = CYCLE_D * (1 - STANCE);
      this.legX = hermite(TOE_OFF, -span * 0.5, CONTACT, -span * 0.7, t);
      this.legY = keyed(SWING_Y, t);
      this.legP = keyed(SWING_P, t);
    }
  }

  /** A light bounding lope: brief toe contacts, long floats, arms loose and low, head level. */
  private runPose(ph: number): Pose {
    const o = this.tmp2;
    this.leg(ph);
    o[AX] = this.legX;
    o[AY] = this.legY;
    o[AP] = this.legP;
    this.leg(ph + 0.5);
    o[BX] = this.legX;
    o[BY] = this.legY;
    o[BP] = this.legP;
    // Two soft arcs per cycle; the power curve makes him linger at the top of each float.
    o[HX] = -2.2 + 0.9 * Math.sin(2 * TAU * (ph - 0.2));
    // The knee gives through each stance, then he floats on a ballistic arc to the next footfall.
    o[HY] = -32 - bob(2 * ph);
    // Hips, chest and head each a beat later than the one below.
    o[LEAN] = 0.2 + 0.03 * Math.cos(2 * TAU * (ph - 0.15));
    o[CURL] = 0.05 + 0.006 * bob(2 * ph - 0.16);
    o[HR] = 0.03 + 0.006 * bob(2 * ph - 0.3);
    // Arms swing a little, opposite the legs, eased at both ends; the hand springs add the lag.
    const an = Math.cos(TAU * (ph - 0.07));
    const sn = an * (1.5 - 0.5 * an * an);
    const af = Math.cos(TAU * (ph - 0.61));
    const sf = af * (1.5 - 0.5 * af * af);
    o[NHX] = -3 - 10.5 * sn;
    o[NHY] = 22.4 - 3.2 * sn * sn + 0.9 * Math.cos(2 * TAU * (ph - 0.42));
    o[FHX] = -1 - 10 * sf;
    o[FHY] = 22 - 3.2 * sf * sf + 0.9 * Math.cos(2 * TAU * (ph - 0.95));
    o[NB] = 0.8;
    o[FB] = 0.8;
    o[TW] = 1.1 * Math.sin(TAU * (ph - 0.02));
    o[SHY] = 0.3 * Math.sin(TAU * (ph - 0.1));
    o[GRIP] = 0.06;
    o[HILT] = 0;
    o[TLIFT] = -1.3 + 0.12 * Math.sin(2 * TAU * (ph - 0.45));
    o[TCURL] = 0.15;
    o[SLIFT] = -0.3;
    o[HEM] = 0.7 + 0.2 * Math.sin(2 * TAU * (ph - 0.5));
    o[EARS] = 0.3;
    return o;
  }

  private airPose(p: PlayerView, clock: number, sgn: number): Pose {
    const o = this.tmp3;
    const r = smoothstep(-2.5, -10, p.vy);
    const fl = smoothstep(2, 11, p.vy);
    const tk = Math.max(0, 1 - r - fl);
    // The fall has two beats: loose at first, then a reach for the ground as it speeds up.
    const rc = smoothstep(9.5, 16.5, p.vy);
    for (let i = 0; i < NP; i++)
      o[i] = RISE[i]! * r + TUCK[i]! * tk + (FALL[i]! + (REACH[i]! - FALL[i]!) * rc) * fl;
    // Air control leans the body.
    const vf = clamp((p.vx * sgn) / 9.6, -1.4, 1.4);
    o[LEAN]! += 0.11 * vf + 0.05 * p.inputX * sgn;
    o[HX]! += 1.5 * vf;
    // The slightest drift in the limbs so a long fall is not a frozen pose.
    const k1 = noise1(clock * 1.3, 31);
    const k2 = noise1(clock * 1.1, 37);
    o[AX]! += k1 * 1.2;
    o[BX]! -= k2 * 1.2;
    o[NHY]! += k2 * 1.2 * fl;
    o[FHY]! += k1 * 1.2 * fl;
    o[FHX]! += k2 * 0.8;
    return o;
  }
}

/**
 * Pelvis rise through one step of the lope (h = 0 at a footfall): a dip while the knee gives in the
 * stance, then a ballistic arc through the float.
 */
function bob(h: number): number {
  const f = h - Math.floor(h);
  const S = 2 * STANCE;
  if (f < S) return -2.3 * Math.sin((Math.PI * f) / S);
  const t = (f - S) / (1 - S);
  return 4.4 * 4 * t * (1 - t);
}

function set(j: Float32Array, i: number, x: number, y: number): void {
  j[i * 2] = x;
  j[i * 2 + 1] = y;
}
