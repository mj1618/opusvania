// biome-ignore-all lint/style/noNonNullAssertion: typed-array and fixed-table maths; indices are in range by construction
/**
 * The burrback: rig (what the sim state becomes, through springs) and drawing (into the shared
 * enemies painter). A low domed beetle: a heavy dark shell with a lichen fringe along its rim, a
 * row of dim lights on the flank, a small head tucked under the front with two feelers, six legs.
 *
 * Frames of reference:
 *   local   x along the screen (already mirrored by the turn factor `d`), y down, origin at the
 *           feet centre on the ground. `d` runs -1..1: +1 faces right, 0 = seen from behind
 *           mid-turn (it always turns away from the camera, so the head passes behind the shell).
 *   body    local, then squash and rotation about the middle of its height (`setBody`): everything
 *           that is part of the body goes through `bx/by`. Planted feet do not.
 */

import type { EnemyState } from '../../sim/state';
import {
  approach,
  clamp,
  hash1,
  ik2,
  ikOut,
  lerp,
  noise1,
  pulse,
  Spring,
  sat,
  smoothstep,
} from '../character/hooded/math';
import { BURR } from './config';
import { bobAt, foot, footAt, LEG_ROW, LEG_SIDE, rockAt } from './gait';
import type { Painter, RGB, Shade } from './paint';

type V3 = [number, number, number];

function v3(hex: number): V3 {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Colours as floats, read once from the config (`loadColors()` again after editing `BURR.color`). */
const C = {
  shellTop: v3(0),
  shellLow: v3(0),
  sheen: v3(0),
  seam: v3(0),
  legNear: v3(0),
  legFar: v3(0),
  plateIn: v3(0),
  edge: [v3(0), v3(0), v3(0)],
  head: v3(0),
  headLow: v3(0),
  eye: v3(0),
  feeler: v3(0),
  fringeTop: v3(0),
  fringeTip: v3(0),
  crack: v3(0),
  crackEdge: v3(0),
  pop: v3(0),
  shadow: v3(0),
  dust: v3(0),
  mote: v3(0),
  spot: [v3(0), v3(0), v3(0)],
};

export function loadColors(): void {
  const k = BURR.color;
  const set = (o: V3, hex: number): void => {
    const c = v3(hex);
    o[0] = c[0];
    o[1] = c[1];
    o[2] = c[2];
  };
  set(C.shellTop, k.shellTop);
  set(C.shellLow, k.shellLow);
  set(C.sheen, k.sheen);
  set(C.seam, k.seam);
  set(C.legNear, k.legNear);
  set(C.legFar, k.legFar);
  set(C.plateIn, k.plateIn);
  for (let i = 0; i < 3; i++) set(C.edge[i]!, BURR.edgeColor[i]!);
  set(C.head, k.head);
  set(C.headLow, k.headLow);
  set(C.eye, k.eye);
  set(C.feeler, k.feeler);
  set(C.fringeTop, k.fringeTop);
  set(C.fringeTip, k.fringeTip);
  set(C.crack, k.crack);
  set(C.crackEdge, k.crackEdge);
  set(C.pop, k.pop);
  set(C.shadow, k.shadow);
  set(C.dust, k.dust);
  set(C.mote, k.mote);
  for (let i = 0; i < 3; i++) set(C.spot[i]!, BURR.spotColor[i]!);
}
loadColors();

export const COLORS = C;

function ease(t: number): number {
  const u = sat(t);
  return u * u * (3 - 2 * u);
}

/** Everything about one creature that outlives a frame. */
export class BurrRig {
  /** 0..1, fixed per creature: de-syncs pulses and idles. */
  readonly seed: number;
  /** Last sim frame seen, and the feet-centre x / walked distance before and at it. */
  private frame = -1;
  private px = 0;
  private cx = 0;
  private ps = 0;
  private cs = 0;
  /** Drawn feet centre (world px) and its speed (px/s). */
  x = 0;
  y = 0;
  vx = 0;
  private lastX = 0;
  /** Distance that drives the legs: walked px plus the shuffle of a turn. */
  dist = 0;
  private shuffle = 0;
  /** Turn factor of the body and of the head (the head leads). */
  d = 1;
  dHead = 1;
  /** 0 standing .. 1 settled on its belly (.. 1.25 hunkered in a flinch). */
  readonly crouch = new Spring(0, 11, 0.75);
  /** Head pulled in, 0..1. */
  readonly tuck = new Spring(0, 20, 0.7);
  /** Shell rotation, rad (+ = clockwise on screen). */
  readonly rock = new Spring(0, 15, 0.26);
  /** Squash along x (negative = shorter and taller). */
  readonly squash = new Spring(0, 30, 0.34);
  /** What trails: fringe and feelers lag by this many px. */
  readonly lag = new Spring(0, 17, 0.32);
  readonly feel0 = new Spring(0.5, 30, 0.45);
  readonly feel1 = new Spring(0.5, 30, 0.45);
  /** Where the eyes look, screen space (-1..1 each), how wary it is (0..1) and the blink (0..1 shut). */
  lookX = 1;
  lookY = 0.2;
  wary = 0;
  blink = 0;
  /** Blend weights that are eased, 0..1. */
  hurtK = 0;
  teeterK = 0;
  walkK = 1;
  /** The hit this rig last reacted to (sim frame). */
  private hitSeen = -1;
  private lastMode: EnemyState['mode'] = 'walk';
  /** Set for the one update in which a new hit was seen (the renderer throws chips). */
  struck = false;
  /** Death effects already thrown (bit 1: first break, bit 2: second). */
  deadStage = 0;
  /** Dust accumulator (render seconds). */
  dustT = 0;
  /** Sim frames into the current mode, fractional. */
  mf = 0;
  /** Frames since the last hit, fractional (large = never). */
  hitAge = 1e6;

  constructor(index: number) {
    this.seed = hash1(index * 131 + 17);
  }

  /** `hx, hy` = where the hero is (her head), world px; `clock` = render seconds. */
  update(
    e: EnemyState,
    simFrame: number,
    alpha: number,
    dt: number,
    hx: number,
    hy: number,
    clock: number,
  ): void {
    const B = BURR;
    const f = e.facing;
    const nx = e.x + e.w / 2 + e.rx;
    const ns = e.stride + (e.mode === 'walk' ? e.rx * f : 0);
    const fresh = this.frame < 0 || Math.abs(nx - this.cx) > 70 || simFrame < this.frame;
    if (fresh) {
      this.px = this.cx = nx;
      this.ps = this.cs = ns;
      this.frame = simFrame;
      this.d = this.dHead = f;
      this.hitSeen = e.hitFrame;
      this.deadStage = e.mode === 'dead' ? 3 : 0;
      this.crouch.snap(0);
      this.tuck.snap(0);
      this.rock.snap(0);
      this.squash.snap(0);
      this.lag.snap(0);
      this.hurtK = this.teeterK = 0;
      this.shuffle = 0;
    } else if (simFrame !== this.frame) {
      this.px = this.cx;
      this.ps = this.cs;
      this.cx = nx;
      this.cs = ns;
      this.frame = simFrame;
    }
    const a = sat(alpha);
    this.x = this.px + (this.cx - this.px) * a;
    this.y = e.y + e.h;
    this.vx = fresh || dt <= 0 ? 0 : clamp((this.x - this.lastX) / dt, -900, 900);
    this.lastX = this.x;
    this.mf = Math.max(0, e.modeFrames + (e.hitstop > 0 ? 0 : a - 1));
    this.hitAge = e.hitFrame < 0 ? 1e6 : Math.max(0, simFrame - e.hitFrame + a - 1);
    if (e.mode !== 'dead') this.deadStage = 0;

    // --- Turning: the head swings round first, the body pivots after it.
    const lastD = this.d;
    if (e.mode === 'pause' && e.turning) {
      const total = Math.max(1, e.modeFrames + e.timer);
      const t = sat(this.mf / total);
      this.dHead = -f + 2 * f * ease(t / 0.5);
      this.d = -f + 2 * f * ease((t - 0.16) / 0.74);
    } else {
      const k = approach(22, dt);
      this.d += (f - this.d) * k;
      this.dHead += (f - this.dHead) * approach(30, dt);
      if (Math.abs(this.d - f) < 0.002) this.d = f;
      if (Math.abs(this.dHead - f) < 0.002) this.dHead = f;
    }
    this.shuffle += Math.abs(this.d - lastD) * 15;
    this.dist = this.ps + (this.cs - this.ps) * a + this.shuffle;

    // --- A new hit: a sharp squash along the blow and a rock back.
    this.struck = false;
    if (e.hitFrame !== this.hitSeen) {
      this.hitSeen = e.hitFrame;
      if (e.hitFrame >= 0) {
        const pw = 0.75 + 0.25 * Math.max(1, e.hitPower);
        this.squash.x = -B.hit.squash * pw;
        this.squash.v = 0;
        if (e.mode !== 'dead') this.rock.v += (e.hitDir || f) * B.hit.rock * pw;
        this.struck = true;
      }
    }

    // --- Pose targets per mode.
    const mode = e.mode;
    // A flinch starts with a start: one quick flattening before it hunkers.
    if (mode === 'alert' && this.lastMode !== 'alert' && !fresh) this.squash.x = 0.09;
    this.lastMode = mode;
    const resting = mode === 'pause' && !e.turning;
    const turning = mode === 'pause' && e.turning;
    let crouchT = 0;
    let tuckT = 0;
    let leanT = 0;
    if (mode === 'walk') leanT = this.d * B.gait.lean;
    else if (resting) {
      crouchT = 1;
      tuckT = 0.2;
    } else if (turning) crouchT = 0.2;
    else if (mode === 'alert') {
      crouchT = 1 + B.hunker / B.settle;
      tuckT = 0.4;
    } else if (mode === 'hurt') {
      crouchT = 0.15;
      tuckT = 0.75;
      leanT = e.hitDir * 0.1 * sat(Math.abs(e.knockVx) / 6);
    } else tuckT = 1;
    this.crouch.omega = mode === 'alert' ? 36 : mode === 'walk' ? 15 : 10;
    this.crouch.zeta = mode === 'alert' ? 0.55 : 0.8;
    this.crouch.step(crouchT, dt);
    this.tuck.step(tuckT, dt);
    this.rock.step(mode === 'dead' ? 0 : leanT, dt);
    this.squash.step(0, dt);
    this.lag.step(this.vx * B.fringe.lag, dt);
    const skid = mode === 'hurt' && (e.hitstop > 0 || Math.abs(e.knockVx) > 0.5 || e.modeFrames < 9);
    this.hurtK += ((skid ? 1 : 0) - this.hurtK) * approach(skid ? 40 : 9, dt);
    const tee = mode === 'hurt' && e.teeter !== 0;
    this.teeterK += ((tee ? 1 : 0) - this.teeterK) * approach(tee ? 26 : 10, dt);
    // Eyes: ahead and a little down on the walk, wandering at rest, on her when it is wary.
    const watch = mode === 'alert' || mode === 'hurt';
    this.wary += ((watch ? 1 : 0) - this.wary) * approach(watch ? 30 : 2.2, dt);
    let lx = f * 0.75;
    let ly = 0.3;
    if (resting) {
      lx = f * (0.2 + 0.7 * noise1(clock * 0.5 + this.seed * 31, 11));
      ly = 0.25 * noise1(clock * 0.4 + this.seed * 17, 12);
    }
    if (this.wary > 0.02) {
      const dx = hx - this.x;
      const dy = hy - (this.y - 12);
      const dl = Math.hypot(dx, dy) || 1;
      lx += ((dx / dl) * 0.95 - lx) * sat(this.wary * 1.5);
      ly += ((dy / dl) * 0.95 - ly) * sat(this.wary * 1.5);
    }
    const lk = approach(mode === 'alert' ? 40 : 9, dt);
    this.lookX += (lx - this.lookX) * lk;
    this.lookY += (ly - this.lookY) * lk;
    const bp = pulse(clock + this.seed * 9, 3.4, 0.14, 3 + Math.floor(this.seed * 50));
    this.blink = watch ? 0 : bp > 0 ? Math.sin(Math.PI * bp) : 0;
    const walking = mode === 'walk' || turning;
    this.walkK += ((walking ? 1 : 0) - this.walkK) * approach(14, dt);
  }
}

// --- Drawing. Module-level scratch: nothing is allocated per frame.

const NT = 20;
const NB = 6;
const N_OUT = NT + NB;
const LX = new Float32Array(N_OUT);
const LY = new Float32Array(N_OUT);

/** Body transform (local -> world), set per creature by `setBody`. */
let mA = 1;
let mB = 0;
let mC = 0;
let mD = 1;
let mE = 0;
let mF = 0;

function setBody(ox: number, oy: number, sx: number, sy: number, rot: number, pivot: number): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  // world = o + pivot + R * (S * local - pivot)
  mA = c * sx;
  mB = -s * sy;
  mC = s * sx;
  mD = c * sy;
  mE = ox + s * pivot;
  mF = oy + pivot - c * pivot;
}

function bx(x: number, y: number): number {
  return mA * x + mB * y + mE;
}

function by(x: number, y: number): number {
  return mC * x + mD * y + mF;
}

/** A point on the flank: u -1..1 along the length (+ = toward the head), v 0..1 up the dome. */
let sX = 0;
let sY = 0;
function surface(u: number, v: number, d: number, rimH: number): void {
  const sn = sat(v) ** (1 / BURR.ey);
  const w = Math.max(0, 1 - sn * sn) ** (BURR.ex / 2);
  sX = d * (u * BURR.halfLen * w - BURR.shear * sn);
  sY = -rimH - BURR.dome * v;
}

const sh = (
  c0: V3,
  c1: V3,
  rim: number,
  cool: number,
  form: number,
  band: number,
): Shade & { alpha: number } => ({
  c0: c0 as unknown as RGB,
  c1: c1 as unknown as RGB,
  rim,
  cool,
  form,
  band,
  ember: 0,
  alpha: 1,
});

/** Working colours (base colours after the hit tone), and the shades that point at them. */
const W = {
  shellTop: v3(0),
  shellLow: v3(0),
  sheen: v3(0),
  seam: v3(0),
  leg0: v3(0),
  leg1: v3(0),
  head: v3(0),
  headLow: v3(0),
  eye: v3(0),
  feeler: v3(0),
  fringe0: v3(0),
  fringe1: v3(0),
  crack: v3(0),
  spot: v3(0),
};
const SH_SHELL = sh(W.shellTop, W.shellLow, 0.3, 0.28, 0.1, 0.1);
const SH_SHEEN = sh(W.sheen, W.sheen, 0, 0, 0, 0.5);
const SH_HORN = sh(W.shellTop, W.shellTop, 0.3, 0.28, 0.1, 0.3);
const KEY: V3 = [1, 0.85, 0.63];
/**
 * Horn, ridge burrs and tail lip: [angle over the dome from the front (x pi), length, lean toward the head,
 * lean up, bow, half-width at the base].
 */
const SPIKES: readonly (readonly number[])[] = [
  [0.13, 9, 0.5, 0.55, 0.16, 3.4],
  [0.4, 3.6, -0.2, 0.15, 0, 3.3],
  [0.54, 4.6, -0.25, 0.15, 0, 3.6],
  [0.68, 4.4, -0.3, 0.1, 0, 3.5],
  [0.94, 5.5, -0.45, 0.55, -0.1, 3.2],
];
const SH_SEAM = sh(W.seam, W.seam, 0, 0, 0, 0.5);
const SH_LEG = sh(W.leg0, W.leg1, 0.12, 0.2, 0.06, 0.4);
const SH_HEAD = sh(W.head, W.headLow, 0.3, 0.3, 0.1, 0.3);
const SH_EYE = sh(W.eye, W.eye, 0, 0, 0, 0.5);
const SH_FEEL = sh(W.feeler, W.feeler, 0.1, 0.25, 0, 0.5);
const SH_FRINGE = sh(W.fringe0, W.fringe1, 0.25, 0.1, 0.1, 0.5);
const SH_CRACK = sh(W.crack, W.crack, 0, 0, 0, 0.5);
const SH_SPOT = sh(W.spot, W.spot, 0, 0, 0, 0.5);

let toneDark = 0;
let toneLight = 0;
function tone(out: V3, base: V3, k = 1): void {
  const dk = 1 - toneDark * k;
  const li = toneLight * k;
  out[0] = base[0] * dk + (C.pop[0] - base[0] * dk) * li;
  out[1] = base[1] * dk + (C.pop[1] - base[1] * dk) * li;
  out[2] = base[2] * dk + (C.pop[2] - base[2] * dk) * li;
}

/** Cracks in flank coordinates (u, v pairs); the first two show at 2 hp, all of them at 1. */
const CRACKS: readonly (readonly number[])[] = [
  [0.02, 0.99, 0.1, 0.76, -0.02, 0.58, 0.09, 0.4, 0.03, 0.27],
  [0.1, 0.76, 0.24, 0.68, 0.3, 0.56],
  [-0.5, 0.82, -0.42, 0.6, -0.56, 0.44, -0.47, 0.24],
  [0.6, 0.7, 0.52, 0.5, 0.63, 0.33],
];

/** Where the six feet and knees ended up this frame (world px), for dust and debug. */
export const feet = { x: new Float32Array(6), y: new Float32Array(6), down: new Uint8Array(6) };

/**
 * Head, feelers and face. Drawn twice: under the shell (with the feelers), so a turn carries it
 * behind the dome, and again over the shell's brow as the face plate once it has come round.
 */
function drawHead(
  p: Painter,
  rig: BurrRig,
  rimH: number,
  rot: number,
  dead: boolean,
  curl: number,
  front: boolean,
): void {
  const B = BURR;
  const dH = rig.dHead;
  const H = B.head;
  const tuck = sat(rig.tuck.x);
  const aH = Math.abs(dH);
  const headLx = dH * (H.x - H.tuck * tuck);
  const headLy = -(H.y - (B.rim - rimH) * 0.55) - tuck * 1.2;
  const hcx = bx(headLx, headLy);
  const hcy = by(headLx, headLy);
  if (aH > 0.12) {
    if (!front) {
      // Feelers: tap the ground ahead in turn as it walks; idle slowly at rest; back in a flinch.
      const F = B.feeler;
      const rootLx = headLx + dH * H.len * 0.62;
      const rootLy = headLy - H.high * 0.55;
      const rootH = -rootLy;
      const ground = Math.asin(sat(rootH / F.len));
      for (let i = 0; i < 2; i++) {
        const spring = i === 0 ? rig.feel0 : rig.feel1;
        const ang = spring.x;
        const len = F.len * (i === 0 ? 1 : 0.92) * (0.35 + 0.65 * aH);
        const tipLx = rootLx + dH * Math.cos(ang) * len - rig.lag.x * 0.6;
        const tipLy = Math.min(-0.3, rootLy + Math.sin(ang) * len);
        // A bowed stalk: the control point sits above the chord.
        const mxl = (rootLx + tipLx) / 2 + dH * 1.5;
        const myl = (rootLy + tipLy) / 2 - 3.6 - (ground - ang) * 2;
        for (let k = 0; k < 6; k++) {
          const u = k / 5;
          const a0 = (1 - u) * (1 - u);
          const a1 = 2 * u * (1 - u);
          const a2 = u * u;
          const lx = a0 * rootLx + a1 * mxl + a2 * tipLx;
          const ly = a0 * rootLy + a1 * myl + a2 * tipLy;
          p.px[k] = bx(lx, ly);
          p.py[k] = by(lx, ly);
          p.pw[k] = F.w * (1 - 0.55 * u) * (i === 0 ? 1 : 0.85);
        }
        p.ribbon(6, SH_FEEL, false, true);
      }
    }
    SH_HEAD.alpha = 1;
    p.ellipse(
      hcx,
      hcy,
      H.len * (0.45 + 0.55 * aH),
      H.high,
      rot + dH * (0.3 + 0.35 * rig.lookY * rig.wary),
      SH_HEAD,
      14,
    );
    // The face: two small dim glints on the plate that slide toward what it watches (ahead as it
    // walks, at her when it is wary). Wider in a flinch, shut when it dies.
    const open = (dead ? 1 - curl : 1) * (1 - 0.92 * rig.blink);
    if (open > 0.05) {
      const wide = 1 + 0.22 * sat(rig.wary);
      const show = sat(aH * 1.6 - 0.3);
      for (let i = 0; i < 2; i++) {
        const k = i === 0 ? 1 : 0.78;
        const elx = headLx + dH * H.len * (i === 0 ? 0.22 : 0.68);
        const ely = headLy - H.high * (i === 0 ? 0.08 : 0.16);
        // Blank pale eyes: the look is the eyes sliding on the plate, never a pupil (that read as a toy).
        const ex = bx(elx, ely) + rig.lookX * 0.8 - Math.sign(dH) * 0.4;
        const ey = by(elx, ely) + rig.lookY * 0.8;
        const rx = H.eye * k * (0.6 + 0.4 * aH);
        const ry = H.eye * 1.1 * k * wide * open;
        SH_EYE.alpha = show;
        p.ellipse(ex, ey, rx, ry, rot, SH_EYE, 12);
      }
    }
  }
}

/** Draws one burrback. Returns the alpha it was drawn with (0 = nothing). */
export function drawBurrback(
  p: Painter,
  /** The painter in front of the grass fringe: it gets the legs below the shell's rim. */
  pf: Painter,
  rig: BurrRig,
  e: EnemyState,
  clock: number,
  zw: readonly number[],
  /** 0..1: how close the hero's light is. */
  nearK: number,
): number {
  const B = BURR;
  const d = rig.d;
  const ad = Math.abs(d);
  const sd = Math.sqrt(Math.max(0, 1 - d * d));
  const dH = rig.dHead;
  const dead = e.mode === 'dead';
  const t = rig.mf;
  const seed = rig.seed;
  const ph = seed * 40;

  // --- Death timeline: flipped onto its back along the blow, legs curl, then it bursts (the renderer throws the plates).
  let roll = 0;
  let hop = 0;
  let curl = 0;
  let swell = 0;
  let deadK = 0;
  const dir = e.hitDir !== 0 ? e.hitDir : -e.facing;
  if (dead) {
    const D = B.death;
    if (t >= D.burst) return 0;
    const r = sat(t / D.roll);
    roll = dir * Math.PI * (1 - (1 - r) * (1 - r));
    hop = D.hop * Math.sin(Math.PI * r);
    curl = smoothstep(D.curl[0], D.curl[1], t);
    swell = smoothstep(D.burst - 3, D.burst, t);
    deadK = sat(t / 2);
  }

  // --- Tone of a hit: darker through the hold, then a lighter pop that fades. Never white.
  const age = rig.hitAge;
  // The killing blow snaps harder; right beside the hero everything is a step darker (her light lifts it).
  toneDark = B.hit.dark * (1 - smoothstep(1.2, 2.8, age));
  toneLight = B.hit.pop * (dead ? 1.5 : 1) * smoothstep(1.4, 3, age) * (1 - smoothstep(3.2, 5.4, age));
  toneLight = Math.max(toneLight, 0.5 * swell);
  toneDark = Math.max(toneDark, nearK * B.nearHero.dark * (1 - toneLight));
  tone(W.shellTop, C.shellTop);
  tone(W.shellLow, C.shellLow);
  tone(W.sheen, C.sheen);
  tone(W.seam, C.seam, 0.6);
  tone(W.head, C.head);
  tone(W.headLow, C.headLow);
  tone(W.eye, C.eye, 0.3);
  tone(W.feeler, C.feeler);
  tone(W.fringe0, C.fringeTop);
  tone(W.fringe1, C.fringeTip);

  // --- Body frame.
  const g = B.gait;
  const walkK = rig.walkK * (1 - rig.hurtK) * (1 - deadK);
  const crouch = rig.crouch.x;
  const breath = Math.sin(clock * 2.1 + ph) * 0.022 * sat(crouch) * (1 - deadK);
  const rimH = Math.max(2.2, B.rim - B.settle * crouch + bobAt(rig.dist, g) * g.bob * walkK);
  const sq = rig.squash.x;
  const sx = 1 + sq - breath * 0.4 + 0.12 * swell;
  const sy = 1 - sq * 0.85 + breath + 0.1 * swell;
  const rot =
    rig.rock.x +
    rockAt(rig.dist, g) * g.rock * walkK * d +
    roll +
    e.teeter * rig.teeterK * (0.13 + 0.03 * Math.sin(clock * 14 + ph));
  const pivot = -(rimH + B.dome) / 2;
  // The squash is taken on the side away from the blow, so it shunts along it.
  const shunt = -sq * B.halfLen * 0.55 * (e.hitDir || 0);
  const ox = rig.x + shunt;
  const oy = rig.y - hop;
  setBody(ox, oy, sx, sy, rot, pivot);
  const alpha = 1;
  p.alphaK = alpha;
  p.glowK = alpha;

  // --- Contact shadow.
  p.soft(
    rig.x,
    rig.y + 1.5,
    31 * (0.72 + 0.28 * ad),
    5.5,
    C.shadow as unknown as RGB,
    B.shadowAlpha * (1 - 0.5 * sat(hop / 12)),
  );

  // --- Legs: solve all six, draw the far side now and the near side after the head.
  const L = B.leg;
  const scr = clock * 43;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 6; i++) {
      const side = LEG_SIDE[i]!;
      const depth = side * d;
      // Far side first; mid-turn the two sides are apart, so the order does not matter there.
      if (pass === 0 ? depth > 0 : depth <= 0) continue;
      const row = LEG_ROW[i]!;
      const home = L.home[row]!;
      const hipLx = home * L.hipIn * d + side * sd * L.hipZ;
      const hipLy = -(rimH + 1.5);
      const hipX = bx(hipLx, hipLy);
      const hipY = by(hipLx, hipLy);
      // Planted walk.
      footAt(rig.dist, i, g);
      const stand = home * d + side * sd * L.footZ;
      let fx = rig.x + stand + d * foot.along * rig.walkK;
      let fy = rig.y - foot.lift * rig.walkK;
      let down = foot.down || rig.walkK < 0.5;
      // Skidding: legs splayed wide, scrabbling for grip.
      if (rig.hurtK > 0.001) {
        const w = scr + i * 2.3 + ph;
        const sxp = ox + stand * 1.4 + (row === 1 ? side * 4 : 0) + 4 * Math.sin(w);
        const syp = rig.y - Math.max(0, Math.sin(w + 1.2)) * 5.5;
        fx += (sxp - fx) * rig.hurtK;
        fy += (syp - fy) * rig.hurtK;
        down = false;
      }
      // At the brink: the legs over the edge find nothing and paw the air.
      if (rig.teeterK > 0.001 && row !== 1 && home * d * e.teeter > 0) {
        const w = clock * 21 + i * 1.9;
        const txp = hipX + e.teeter * (11 + 5 * Math.sin(w));
        const typ = hipY + 13 + 6 * Math.sin(w * 0.83 + 1);
        fx += (txp - fx) * rig.teeterK;
        fy += (typ - fy) * rig.teeterK;
        down = false;
      }
      // On its back: the legs kick, then curl in over the belly.
      if (deadK > 0) {
        const w = clock * 30 + i * 2.1;
        const kick = (1 - curl) * 3.2;
        const lx = home * d * (1.12 - 0.66 * curl) + side * sd * L.footZ + kick * Math.sin(w);
        const ly = 7.5 - 6.5 * curl + kick * 0.7 * Math.cos(w * 0.8);
        const dx = bx(lx, ly);
        const dy = by(lx, ly);
        fx += (dx - fx) * deadK;
        fy += (dy - fy) * deadK;
        down = false;
      }
      feet.x[i] = fx;
      feet.y[i] = fy;
      feet.down[i] = down ? 1 : 0;
      const kneeDir = row === 0 ? 1 : row === 2 ? -1 : 0.45;
      const bend = -(kneeDir * d + side * sd);
      ik2(hipX, hipY, fx, fy, L.upper, L.lower, clamp(bend, -1, 1), 0.25);
      const kx = ikOut.x;
      const ky = ikOut.y;
      const ex = ikOut.ex;
      const ey = ikOut.ey;
      const near = 0.5 + 0.5 * depth;
      const c0 = W.leg0;
      const c1 = W.leg1;
      for (let k = 0; k < 3; k++) {
        const base = C.legFar[k]! + (C.legNear[k]! - C.legFar[k]!) * near;
        const dk = base * (1 - toneDark);
        const v = dk + (C.pop[k]! - dk) * toneLight;
        c0[k] = v;
        c1[k] = v * 0.86;
      }
      p.px[0] = hipX;
      p.py[0] = hipY;
      p.px[1] = (hipX + kx) / 2;
      p.py[1] = (hipY + ky) / 2;
      p.px[2] = kx;
      p.py[2] = ky;
      p.px[3] = (kx + ex) / 2;
      p.py[3] = (ky + ey) / 2;
      p.px[4] = ex;
      p.py[4] = ey;
      p.pw[0] = L.w[0];
      p.pw[1] = (L.w[0] + L.w[1]) / 2;
      p.pw[2] = L.w[1] * 1.08;
      p.pw[3] = (L.w[1] + L.w[2]) / 2;
      p.pw[4] = L.w[2];
      // The near legs carry a thin pale edge so they read against dark ground.
      SH_LEG.rim = 0.15 + 0.25 * near;
      SH_LEG.cool = 0.15 + 0.2 * near;
      p.ribbon(5, SH_LEG, true, true);
      // Again in front of the grass, from the rim line down: the same geometry, so no join shows.
      // (Not on a body on its back: its legs are in the air, over the shell.)
      if (deadK < 0.3) {
        const clipY = rig.y - rimH + 2;
        let n = 0;
        if (ky >= clipY) {
          if (hipY < clipY) {
            const u = (clipY - hipY) / (ky - hipY);
            pf.px[n] = hipX + (kx - hipX) * u;
            pf.py[n] = clipY;
            pf.pw[n++] = L.w[0] + (L.w[1] - L.w[0]) * u;
          } else {
            pf.px[n] = hipX;
            pf.py[n] = hipY;
            pf.pw[n++] = L.w[0];
          }
          pf.px[n] = kx;
          pf.py[n] = ky;
          pf.pw[n++] = L.w[1] * 1.08;
        } else if (ey > clipY) {
          const u = (clipY - ky) / (ey - ky);
          pf.px[n] = kx + (ex - kx) * u;
          pf.py[n] = clipY;
          pf.pw[n++] = L.w[1] + (L.w[2] - L.w[1]) * u;
        }
        if (n > 0) {
          const k0 = n - 1;
          pf.px[n] = (pf.px[k0]! + ex) / 2;
          pf.py[n] = (pf.py[k0]! + ey) / 2;
          pf.pw[n] = (pf.pw[k0]! + L.w[2]) / 2;
          n++;
          pf.px[n] = ex;
          pf.py[n] = ey;
          pf.pw[n++] = L.w[2];
          // The colour runs hip -> foot along the whole leg; this piece is the lower end of it.
          c0[0] = c0[0]! * 0.93;
          c0[1] = c0[1]! * 0.93;
          c0[2] = c0[2]! * 0.93;
          pf.ribbon(n, SH_LEG, false, true);
        }
      }
    }
    if (pass === 1) break;

    drawHead(p, rig, rimH, rot, dead, curl, false);
  }

  // --- Shell outline in local space: the dome over the top (from screen right to left), then the belly.
  const aEff = lerp(B.halfWide, B.halfLen, ad);
  for (let k = 0; k < NT; k++) {
    const a = (Math.PI * k) / (NT - 1);
    const c = Math.cos(a);
    const sn = Math.sin(a);
    LX[k] = aEff * Math.sign(c) * Math.abs(c) ** B.ex - d * B.shear * sn;
    LY[k] = -rimH - B.dome * sn ** B.ey;
  }
  // A chip out of the front of the crown at 1 hp.
  if (e.hp <= 1 && ad > 0.5) {
    const kc = d > 0 ? 5 : NT - 1 - 5;
    const kn = d > 0 ? 6 : NT - 1 - 6;
    LX[kc] = LX[kc]! - Math.sign(d) * 3.2;
    LY[kc] = LY[kc]! + 3.6;
    LX[kn] = LX[kn]! - Math.sign(d) * 0.6;
    LY[kn] = LY[kn]! + 0.8;
  }
  const sag = 2.6;
  for (let j = 0; j < NB; j++) {
    const u = (j + 1) / (NB + 1);
    LX[NT + j] = -aEff + 2 * aEff * u;
    LY[NT + j] = -rimH + sag * Math.sin(Math.PI * u);
  }
  const ccx = -d * B.shear * 0.4;
  const ccy = -rimH - B.dome * 0.42;
  // The zone's light on the top edge: a thin tinted rim that lifts the dome off the dark ground.
  for (let k = 0; k < 3; k++)
    KEY[k] = C.edge[0]![k]! * zw[0]! + C.edge[1]![k]! * zw[1]! + C.edge[2]![k]! * zw[2]!;
  p.keyColor = KEY as unknown as RGB;
  SH_SHELL.rim = B.rimKey * (1 - toneDark);
  SH_SHELL.cool = B.rimCool;
  SH_HORN.rim = SH_SHELL.rim;

  // --- Signature outline, drawn under the shell so the bases are hidden: a short upturned horn on
  // the brow, a row of blunt burrs along the ridge, a raised lip at the tail.
  const dd = clamp(d * 2.5, -1, 1);
  for (let i = 0; i < SPIKES.length; i++) {
    const sp = SPIKES[i]!;
    const a = Math.PI * sp[0]!;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const rx0 = dd * aEff * Math.sign(c) * Math.abs(c) ** B.ex - d * B.shear * sn;
    const ry0 = -rimH - B.dome * sn ** B.ey;
    let nx = rx0 - ccx;
    let ny = ry0 - ccy;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const len = sp[1]!;
    // Lean: along the body (+ = toward the head) and up.
    const tx = rx0 + nx * len * 0.55 + dd * sp[2]! * len;
    const ty = ry0 + ny * len * 0.55 - sp[3]! * len;
    const b0x = rx0 - nx * 2.2;
    const b0y = ry0 - ny * 2.2;
    p.px[0] = bx(b0x, b0y);
    p.py[0] = by(b0x, b0y);
    const mx = (b0x + tx) / 2 + dd * sp[4]! * len;
    const my = (b0y + ty) / 2 + Math.abs(sp[4]!) * len * 0.5;
    p.px[1] = bx(mx, my);
    p.py[1] = by(mx, my);
    p.px[2] = bx(tx, ty);
    p.py[2] = by(tx, ty);
    p.pw[0] = sp[5]!;
    p.pw[1] = sp[5]! * 0.8;
    p.pw[2] = sp[5]! * 0.5;
    p.ribbon(3, SH_HORN, false, true);
  }
  for (let k = 0; k < N_OUT; k++) {
    p.px[k] = bx(LX[k]!, LY[k]!);
    p.py[k] = by(LX[k]!, LY[k]!);
  }
  const top = -rimH - B.dome;
  p.shape(
    N_OUT,
    bx(ccx, ccy),
    by(ccx, ccy),
    SH_SHELL,
    bx(ccx, top + 5),
    by(ccx, top + 5),
    bx(ccx, -rimH + 1),
    by(ccx, -rimH + 1),
  );

  const whole = 1;
  if (whole > 0.01) {
    // --- Plate seams: two dark lines over the dome, bulging with it.
    SH_SEAM.alpha = 0.85 * whole * smoothstep(0.15, 0.6, ad);
    for (let s = 0; s < 2; s++) {
      const u = s === 0 ? 0.36 : -0.3;
      for (let k = 0; k < 7; k++) {
        const v = 0.03 + (k / 6) * (s === 0 ? 0.8 : 0.9);
        surface(u + (s === 0 ? 0.05 : -0.04) * v, v, d, rimH);
        p.px[k] = bx(sX, sY);
        p.py[k] = by(sX, sY);
        p.pw[k] = 0.55;
      }
      p.ribbon(7, SH_SEAM, false, false);
    }
    // --- Top plane: one crisp lighter band along the crown on the key-light side.
    SH_SHEEN.alpha = 0.9 * whole * (1 - toneDark);
    const a0 = Math.PI * 0.13;
    const a1 = Math.PI * 0.68;
    for (let k = 0; k < 14; k++) {
      const u = k / 13;
      const a = a0 + (a1 - a0) * u;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const lx = aEff * Math.sign(c) * Math.abs(c) ** B.ex - d * B.shear * sn;
      const ly = -rimH - B.dome * sn ** B.ey;
      // Inset toward the middle of the shell.
      const ix = ccx - lx;
      const iy = ccy - ly;
      const il = Math.hypot(ix, iy) || 1;
      const inset = 4.2;
      p.px[k] = bx(lx + (ix / il) * inset, ly + (iy / il) * inset);
      p.py[k] = by(lx + (ix / il) * inset, ly + (iy / il) * inset);
      p.pw[k] = 1.5 * Math.sin(Math.PI * u) ** 1.3;
    }
    p.ribbon(14, SH_SHEEN, false, false);

    // --- Cracks: pale broken edges, one at 2 hp, the rest at 1.
    const flank = smoothstep(0.3, 0.75, ad);
    const nCr = e.hp >= e.hpMax ? 0 : e.hp > 1 ? 2 : CRACKS.length;
    const wide = dead ? 2.4 + 2 * swell : 1;
    if (nCr > 0 && flank > 0.01) {
      W.crack[0] = C.crackEdge[0];
      W.crack[1] = C.crackEdge[1];
      W.crack[2] = C.crackEdge[2];
      SH_CRACK.alpha = whole * flank * (0.75 + 0.25 * sat(1 - age / 14));
      for (let c = 0; c < nCr; c++) {
        const cr = CRACKS[c]!;
        const n = cr.length / 2;
        for (let k = 0; k < n; k++) {
          surface(cr[k * 2]!, cr[k * 2 + 1]!, d, rimH);
          p.px[k] = bx(sX, sY);
          p.py[k] = by(sX, sY);
          p.pw[k] = 0.55 * wide * (1 - 0.6 * (k / (n - 1)));
        }
        p.ribbon(n, SH_CRACK, false, false);
      }
    }

    // --- The row of lights on the flank: small, dim, slowly pulsing. Its only light.
    const S = B.spots;
    if (flank > 0.01) {
      const sc = W.spot;
      for (let k = 0; k < 3; k++)
        sc[k] = 0.82 * C.spot[0]![k]! * zw[0]! + C.spot[1]![k]! * zw[1]! + C.spot[2]![k]! * zw[2]!;
      const alert = e.mode === 'alert' ? sat(t / 3) * sat((e.timer + 4) / 6) : 0;
      for (let i = 0; i < S.at.length; i++) {
        const sp = S.at[i]!;
        let br = 1 - S.pulse * (0.5 + 0.5 * Math.sin(clock * S.rate + ph - i * 0.9));
        br *= 1 + (S.alert - 1) * alert;
        // Hurt badly: they flicker. Dying: they gutter out one after another.
        if (e.hp <= 1 && !dead) br *= 0.55 + 0.45 * (noise1(clock * 13 + i * 7.3, 3 + i) > -0.15 ? 1 : 0.25);
        if (dead) br *= t > 1 + i * 1.8 ? 0 : 1;
        if (toneDark > 0) br *= 1 - toneDark * 0.6;
        if (br <= 0.01) continue;
        surface(sp[0]!, sp[1]!, d, rimH);
        const wx = bx(sX, sY);
        const wy = by(sX, sY);
        const r = sp[2]!;
        SH_SPOT.alpha = S.core * flank * sat(br) * whole;
        p.ellipse(wx, wy, r * (0.5 + 0.5 * ad), r, rot, SH_SPOT, 10);
        p.glow(wx, wy, r * S.halo, sc as unknown as RGB, S.glow * br * flank * whole, r * S.halo, 0, 12);
      }
    }
  }

  // --- Fringe: short soft burr tufts along the rim, trailing what the shell does.
  const Fr = B.fringe;
  const fAlpha = 1;
  if (fAlpha > 0.01) {
    SH_FRINGE.alpha = fAlpha;
    const n = Fr.count;
    for (let i = 0; i < n; i++) {
      const u = -0.96 + (1.92 * i) / (n - 1);
      const h1 = hash1(i * 7 + 3);
      const h2 = hash1(i * 13 + 5);
      const rx = u * aEff * 0.97 + (h1 - 0.5) * 1.6;
      const ry = -rimH + sag * (1 - u * u) * 0.75 - 1.6;
      const len = Fr.len * (0.75 + 0.5 * h2) * (1 - 0.25 * Math.abs(u));
      const sway = Math.sin(clock * 1.7 + i * 1.3 + ph) * 0.35;
      const tx = rx + u * 2.6 - rig.lag.x * (0.7 + 0.6 * h1) + sway;
      const ty = Math.min(-0.2, ry + len);
      const wv = Fr.w * (0.8 + 0.4 * h1);
      p.px[0] = bx(rx, ry - 1.2);
      p.py[0] = by(rx, ry - 1.2);
      p.px[1] = bx((rx + tx) / 2 + u * 0.5, (ry + ty) / 2);
      p.py[1] = by((rx + tx) / 2 + u * 0.5, (ry + ty) / 2);
      p.px[2] = bx(tx, ty);
      p.py[2] = by(tx, ty);
      p.pw[0] = wv;
      p.pw[1] = wv * 0.72;
      p.pw[2] = 0.12;
      p.ribbon(3, SH_FRINGE, true, false);
    }
  }
  // --- The face plate over the brow (fades in as the head comes round; not on a body on its back).
  const faceK = smoothstep(0.4, 0.75, Math.abs(dH)) * (1 - deadK);
  if (faceK > 0.01) {
    p.alphaK = alpha * faceK;
    drawHead(p, rig, rimH, rot, dead, curl, true);
  }
  p.alphaK = 1;
  p.glowK = 1;
  return alpha;
}

/** Feeler targets (angle below the forward horizon, rad), stepped once per frame by the renderer. */
export function stepFeelers(rig: BurrRig, e: EnemyState, clock: number, dt: number): void {
  const B = BURR;
  const F = B.feeler;
  const ph = rig.seed * 40;
  const rootH =
    B.head.y + B.head.high * 0.55 - (B.rim - Math.max(2.2, B.rim - B.settle * rig.crouch.x)) * 0.55;
  const ground = Math.asin(sat(rootH / F.len));
  for (let i = 0; i < 2; i++) {
    const spring = i === 0 ? rig.feel0 : rig.feel1;
    let target: number;
    if (e.mode === 'walk') {
      // One tap per footfall, the two feelers in turn.
      const s = Math.sin((rig.dist / B.gait.cycle) * Math.PI * 2 + i * Math.PI);
      target = ground + 0.12 - F.tap * (0.5 + 0.5 * s);
    } else if (e.mode === 'alert') target = -1.9 + i * 0.2;
    else if (e.mode === 'hurt') target = -1.2 + i * 0.3 + 0.4 * Math.sin(clock * 30 + i * 2);
    else if (e.mode === 'dead') target = 0.9;
    else if (e.turning) target = ground - 0.5 + 0.2 * Math.sin(clock * 9 + i * 2.2);
    else
      target =
        ground -
        0.3 +
        0.22 * noise1(clock * 0.9 + ph + i * 5, 5 + i) +
        0.1 * Math.sin(clock * 1.3 + i * 2 + ph);
    spring.omega = e.mode === 'alert' ? 34 : e.mode === 'walk' ? 30 : 12;
    spring.step(target, dt);
  }
}
