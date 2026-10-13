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
/** 0..1: folded into the somersault's ball (everything drawn a little smaller). */
export const S_BALL = 13;
export const S_COUNT = 14;

/** Glide tuning (render only; the sim's numbers are in tuning.glide). */
export const GLIDE = {
  /** Top glide speed px/frame, for normalising. */
  topVx: 10.56,
  /** Wing-plane tilt per px/frame of speed, and per px/frame² of acceleration (rad). */
  bankVx: 0.009,
  bankAx: 0.2,
  /** The body's pendulum under the wings: kick (rad/s) = swing0 + swingVy x caught fall speed. */
  swing0: 0.5,
  swingVy: 0.25,
  /** Catch spring kick = catch0 + catchVy x caught fall speed; deceleration of `catchDecel` px/f² holds it at 1. */
  catch0: 4.6,
  catchVy: 0.36,
  catchDecel: 4.2,
  /** The slow wing beat of a steady glide: one every `beatEvery` seconds, lasting `beatLen`. */
  beatEvery: 3.4,
  beatLen: 1.0,
  /** Landing reach starts with this much clear air under the feet, px. */
  reachPx: 78,
} as const;

/**
 * The thorn slash, render side (the sim owns the timing: memory/combat.md). Three strokes that make
 * one phrase, per direction. Times are sim frames from the press; angles are forward-frame degrees
 * (0 = ahead, 90 = up, 180 = behind).
 *
 * The blade's point travels on an ellipse about her chest: `reach` px along the major axis, which
 * is turned `tilt` degrees from straight ahead, and `sq` x that across it (a swing seen partly edge
 * on). The same ellipse places her hand, turns the blade and lays the trail, and it is sized to the
 * sim's hit area for that step (`slashBox`), so what is drawn is what hits.
 */
export interface Stroke {
  /** Blade angle where the cut starts and ends, and how far it carries on past the end. */
  a0: number;
  a1: number;
  over: number;
  tilt: number;
  sq: number;
  reach: number;
  /**
   * Frames: the gather before the cut, the cut itself, when the blade starts home, how long home
   * takes. `hold` is short so a lone tap sheathes promptly; the sim allows the next cut from frame
   * 17 / 19 / 27, by when the blade is on its way down in front and the body (which lets go over
   * `home`) is still partly in the follow-through, so a chained cut flows out of it. The press frame is drawn at frame 1 and the sim's first possible hit at `startup + 1`:
   * `wind` = the sim's startup, so the press frame shows the gathered pose and a hit (and its
   * hitstop) catches the blade one frame into the cut, about two thirds of the way round.
   */
  wind: number;
  cut: number;
  hold: number;
  home: number;
  /** How hard the cut front-loads its speed (1 = even, 2.2 = most of the arc in the first frames). */
  ease: number;
  /** Whole turns of her body about its own upright axis through the stroke (the finisher's pirouette). */
  turn?: number;
  /** Degrees the blade eases back from the follow-through while it is held (the guard relaxing). */
  relax: number;
  /** Fraction of the cut from which its trail shows (before that the blade is behind or beside her). */
  show: number;
  /** Trail thickness at its widest, as a fraction of the reach. */
  thick: number;
  /** Body at the end of the gather and at the end of the cut: see the K_ channels. */
  w: readonly number[];
  f: readonly number[];
}

// Body channels of a stroke key.
const K_TW = 0; // hip twist (+ = sword shoulder back)
const K_LEAN = 1;
const K_CURL = 2;
const K_PF = 3; // pelvis forward, px
const K_PU = 4; // pelvis up, px
const K_HT = 5; // head pitch
const K_OF = 6; // off-hand forward / up, px
const K_OU = 7;
const K_FA = 8; // front foot forward (ground), px
const K_FB = 9; // back foot forward (ground), px
const K_ROT = 10; // whole-body roll in the air, rad (+ = forward)
const K_WING = 11; // wings: -1 folded close .. 1 flared .. more = thrown wide
const K_LIFT = 12; // rise through the middle of the cut, px
const K_LEGS = 13; // air: legs trail back, px
const K_HOP = 14; // a hop through the cut: pelvis and both feet leave the ground, px (render only)
const NK = 15;

// Three silhouettes: cut 1 ends HIGH (tall on the toes, chest open, head back after the blade, the
// off-arm thrown down behind); cut 2 ends LOW and LONG (a deep reaching lunge, spine laid forward,
// the off-arm thrown up behind); the finisher gathers small and low, hops, and lands wide.
//              TW    LEAN   CURL   PF   PU    HT    OF   OU  FA  FB  ROT   WING LIFT LEGS HOP
const CUT1_W = [0.6, 0.32, 0.22, -2, -4.5, 0.18, 4, -1, 0, 0, 0.1, -0.7, 0, 0, 0];
const CUT1_F = [-0.8, -0.12, -0.26, 5, 2.4, -0.36, -10, -5, 9, -3, -0.22, 1.3, 2, 4, 0];
const CUT2_W = [-0.7, -0.06, -0.2, 4, 2.6, -0.3, -8, -2, 9, -3, -0.14, 0.4, 0, 4, 0];
const CUT2_F = [0.78, 0.58, 0.1, 9, -8, -0.34, -9, 10, 14, -5, 0.22, 0.95, 0, 7, 0];
const FIN_W = [0.9, -0.22, -0.14, -6, -7, -0.1, 9, 6, 3, -2, -0.28, -1, 0, -3, 0];
const FIN_F = [-0.95, 0.5, 0.2, 10, -7.5, -0.2, -11, 6, 14, -4, 0.36, 1.5, 0, 9, 13];
// The pirouette: she coils away from the target (showing her back), whips round with the blade
// trailing on a low wide ring that climbs in front of her, hops through it and lands wide and low.
const SPIN_W = [0.5, -0.1, 0.18, -3, -6, 0.1, -7, 3, 2, -2, -0.12, -0.9, 0, -3, 0];
const SPIN_F = [-0.9, 0.3, -0.12, 9, -8.5, -0.3, -12, 2, 15, -5, 0.2, 1.6, 0, 9, 14];
const UP1_W = [0.4, -0.08, -0.06, 0, -1.5, -0.2, 3, -3, 0, 0, -0.1, -0.3, 0, 0, 0];
const UP1_F = [-0.4, 0.06, -0.1, 0, 2.6, -0.26, -4, -5, 0, 0, 0.1, 0.7, 4, 3, 0];
const UP2_W = [-0.4, 0.08, 0, 0, 1.5, -0.2, -4, -4, 0, 0, 0.1, 0.3, 0, 3, 0];
const UP2_F = [0.4, -0.12, -0.14, 0, 2.4, -0.32, 3, -5, 0, 0, -0.12, 0.7, 3.5, 4, 0];
const UP3_W = [0.7, -0.16, 0.1, 0, -6, -0.1, 5, -2, 0, 0, -0.2, -1, 0, -3, 0];
const UP3_F = [-0.7, 0.1, -0.16, 0, 2, -0.3, -6, -8, 0, 0, 0.2, 1.5, 3, 8, 11];
const DOWN_W = [0.2, 0.1, 0.1, 0, 1, 0.1, -4, 4, 0, 0, 0, -0.3, 0, 0, 0];
const DOWN_F = [-0.3, 0.18, 0.16, 0, 0, 0.2, -6, 7, 0, 0, 0.18, 0.9, 0, 0, 0];

export const STROKES: { fwd: readonly Stroke[]; up: readonly Stroke[]; down: readonly Stroke[] } = {
  fwd: [
    // 1: the draw cut. Straight out of the sheath, rising from low to high in front of her.
    {
      a0: -104,
      a1: 70,
      over: 14,
      tilt: 16,
      sq: 0.52,
      reach: 110,
      wind: 1,
      cut: 3.6,
      hold: 12,
      home: 9,
      ease: 3,
      relax: 16,
      show: 0.34,
      thick: 0.4,
      w: CUT1_W,
      f: CUT1_F,
    },
    // 2: the return. A flat backhand out of the first cut's follow-through, lower and tighter.
    {
      a0: 128,
      a1: -64,
      over: 14,
      tilt: -7,
      sq: 0.3,
      reach: 110,
      wind: 1,
      cut: 3.6,
      hold: 13,
      home: 9,
      ease: 3,
      relax: 10,
      show: 0.3,
      thick: 0.34,
      w: CUT2_W,
      f: CUT2_F,
    },
    // 3: the finisher. A full turn: the blade comes round low on her near side and climbs through.
    {
      a0: -196,
      a1: 38,
      over: 12,
      tilt: 12,
      sq: 0.44,
      reach: 135,
      wind: 3,
      cut: 3.4,
      hold: 22,
      home: 12,
      ease: 3,
      turn: 1,
      relax: 14,
      show: 0.5,
      thick: 0.44,
      w: SPIN_W,
      f: SPIN_F,
    },
  ],
  // Up: 1 comes up behind her and over to the front; 2 goes back over (and stops high); 3 gathers
  // low behind and cleaves over the top again, bigger. None ends with the blade parked behind her.
  up: [
    {
      a0: 172,
      a1: 24,
      over: 10,
      tilt: 90,
      sq: 0.42,
      reach: 124,
      wind: 1,
      cut: 3.6,
      hold: 12,
      home: 9,
      ease: 3,
      relax: 8,
      show: 0.05,
      thick: 0.36,
      w: UP1_W,
      f: UP1_F,
    },
    {
      a0: 14,
      a1: 124,
      over: 8,
      tilt: 90,
      sq: 0.42,
      reach: 124,
      wind: 1,
      cut: 3.6,
      hold: 13,
      home: 9,
      ease: 3,
      relax: 16,
      show: 0.04,
      thick: 0.34,
      w: UP2_W,
      f: UP2_F,
    },
    {
      a0: 192,
      a1: 22,
      over: 12,
      tilt: 90,
      sq: 0.43,
      reach: 144,
      wind: 3,
      cut: 3.4,
      hold: 22,
      home: 12,
      ease: 3,
      relax: 8,
      show: 0.1,
      thick: 0.46,
      w: UP3_W,
      f: UP3_F,
    },
  ],
  // The dive cut: from ahead, down under her feet and through. Always the same blow (the pogo's rhythm).
  down: [
    {
      a0: -8,
      a1: -168,
      over: 10,
      tilt: -90,
      sq: 0.42,
      reach: 120,
      wind: 1,
      cut: 3.6,
      hold: 12,
      home: 9,
      ease: 3,
      relax: 10,
      show: 0.04,
      thick: 0.36,
      w: DOWN_W,
      f: DOWN_F,
    },
  ],
};
/** Being hurt, fading and re-forming (render side; the sim's numbers are in tuning.health). Seconds. */
export const HURT = {
  /** The recoil pose is held this long (the sim's stagger is 12 frames), then let go over `out`. */
  hold: 0.2,
  out: 0.28,
  /** The pose pops this far past itself on the first frame and settles in ~3. */
  pop: 0.4,
  /** Her tones flip (dark plum <-> pale lilac) for this long: two frames. No glow, no white. */
  invert: 0.034,
  /** How long the wings stay blown inside-out by the blow. */
  blow: 0.2,
  /** Her last light: the dissolve starts this long after the blow and takes `fadeLen`. */
  fadeAt: 0.12,
  fadeLen: 0.45,
  /** Re-forming: dust gathers, then she is whole again by the end of this. */
  reform: 0.6,
  /** While she cannot be hurt she pulses: depth of the alpha dip, pulses per second. */
  flickerDepth: 0.36,
  flickerHz: 4.5,
} as const;

/** The finisher before the pirouette (kept for comparison: `Rig.finisherTurn = false`): gathered behind her, a cleave over the top. */
const FIN_CLEAVE: Stroke = {
  a0: 168,
  a1: -34,
  over: 13,
  tilt: 8,
  sq: 0.6,
  reach: 135,
  wind: 3,
  cut: 3.4,
  hold: 22,
  home: 12,
  ease: 3,
  relax: 6,
  show: 0.4,
  thick: 0.44,
  w: FIN_W,
  f: FIN_F,
};
/**
 * The snap of a cut. The blade overshoots the end of the arc by the stroke's `over` at full speed,
 * springs back `back` x that (plus the stroke's `relax`) and rings out: `settle` frames (decay),
 * `ring` rad per frame. The body's end-of-cut key overshoots by `body` and settles with it. In the
 * smear frames the sword arm is drawn `arm` longer.
 */
export const SNAP = { settle: 3.2, ring: 0.55, back: 0.55, body: 0.28, arm: 0.42 } as const;

/** Where the blade points when it is home: back and down along the sheath. Hand reach from the shoulder, px. */
export const SHEATH_ANG = -152;
const HAND_WIND = 10.5;
const HAND_CUT = 16.8;
const DEG = Math.PI / 180;

/** The stroke for a slash direction and combo step (a down slash is always the one blow). */
export function strokeFor(dir: SlashDir, step: number, turn = false): Stroke {
  const list = STROKES[dir];
  if (dir === 'fwd' && step === 3 && !turn) return FIN_CLEAVE;
  return list[Math.min(list.length, Math.max(1, step)) - 1]!;
}

const mapOut = { f: 0, u: 0 };
/** A point of the stroke's ellipse at blade angle `deg`, forward frame, unit major axis. */
function strokeMap(st: Stroke, deg: number, tiltAdd: number): void {
  const tl = (st.tilt + tiltAdd) * DEG;
  const a = deg * DEG - st.tilt * DEG;
  const c = Math.cos(a);
  const sn = Math.sin(a) * st.sq;
  mapOut.f = c * Math.cos(tl) - sn * Math.sin(tl);
  mapOut.u = c * Math.sin(tl) + sn * Math.cos(tl);
}
function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
export type SlashDir = 'fwd' | 'up' | 'down';

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
const CONTACT_F = 21;

// Channel order: PF PU LEAN CURL HT | AF AU AP | BF BU BP | HAF HAU HBF HBU | TW EYE LOOKY HYAW
const RISE = pose([
  0, 32.5, 0.1, -0.08, -0.14, 3, 9, 0.9, -6, -1.5, 1.35, -3, -14, -7, -11, 0.1, 1, -0.25, 1,
]);
const APEXP = pose([0, 31, 0.04, 0.08, 0, 6, 12, 0.5, -1, 8, 0.9, -6, -10.5, 4, -10, 0.05, 1, 0, 1]);
const FALL = pose([-1, 33, -0.1, 0.02, 0.14, 5, 2, 0.5, -5, 6, 1.0, -9, -7, 8, -8, 0, 1, 0.4, 1]);
/**
 * The somersault's ball. A moth folds far tighter than a person: spine curled into a C, head ducked
 * down onto the knees, shins folded hard against the thighs with the feet under her tail, arms
 * wrapped round the shins. The wings close over it as the shell.
 */
const TUCK = pose([-6, 30, 0.4, 1.3, 2.1, 0, 22, 1.5, -1.5, 23, 1.55, 3, -15, 1, -14, 0, 0.8, 0.3, 1]);
/** Snapping out: a touch past the fall pose. Body long and open, legs reaching, arms wide. */
const OPEN = pose([0, 33.5, -0.12, -0.16, -0.14, 5, -2, 0.7, -5, -1, 1.1, -12, 1, 10, 0, 0, 1, 0.2, 1]);
/**
 * The somersault is driven by angular momentum, as a real one is: she leaves the jump with a fixed
 * L, and her spin rate is L / I, where the moment of inertia I follows how tightly she is folded.
 * Slow while long, whipping round as she pulls into the ball, slowing by itself as she kicks out.
 */
export const SOMERSAULT = {
  /** Seconds for one, two, three and four turns. */
  time: [0.48, 0.56, 0.58, 0.6],
  /** Fraction of the move by which she is fully tucked, and at which the kick-out begins. */
  tuckIn: [0.3, 0.24, 0.2, 0.17],
  kickOut: [0.58, 0.68, 0.72, 0.75],
  /** Moment of inertia stretched out, relative to the ball (measured from the rig's own joints: see the test). */
  inertiaOpen: 3.85,
  /** Extra inertia of the wings as they flare at the kick-out: an air brake. */
  inertiaFlare: 5,
  /**
   * Landing in the ball: it rolls on at least `rollMin` rad and at most `rollMax` to an upright,
   * on a critically damped brake of at least `rollOmega` rad/s; the ball sits `rollDrop` px lower (on the ground).
   */
  rollMin: 1.1,
  rollMax: 6.9,
  rollOmega: 30,
  rollDrop: 17,
  /** In the ball every length shrinks by this much: barely (the owner saw her get smaller at 12%). */
  shrink: 0.03,
} as const;

/** Most turns a somersault can have. */
export const MAX_TURNS = 4;
function turnIndex(n: number): number {
  return Math.min(MAX_TURNS, Math.max(1, Math.round(n))) - 1;
}
/** Peak spin rate of an `n`-turn somersault, rad/s. */
export function spinPeak(n: number): number {
  return (TAU * (turnIndex(n) + 1)) / (SPIN_MEAN[turnIndex(n)]! * spinTime(n));
}
/** Tuck 0..1 at progress u for a move of `n` turns. */
function tuckAt(n: number, u: number): number {
  const k = turnIndex(n);
  const a = SOMERSAULT.tuckIn[k]!;
  const b = SOMERSAULT.kickOut[k]!;
  return quintic(u / a) * (1 - quintic((u - b) / (1 - b)));
}
/** Moment of inertia (ball = 1) at progress u. */
function inertiaAt(n: number, u: number): number {
  const w = tuckAt(n, u);
  const b = SOMERSAULT.kickOut[turnIndex(n)]!;
  const flare = quintic((u - b - 0.08) / (1 - b - 0.08));
  return 1 + (SOMERSAULT.inertiaOpen - 1) * (1 - w) * (1 - w) + SOMERSAULT.inertiaFlare * flare;
}
/** Angular momentum 0..1: thrown in over the first frames (the wing beat of the jump), spent at the very end. */
function momentumAt(u: number): number {
  return quintic(u / 0.1) * (1 - quintic((u - 0.9) / 0.1));
}
const SPIN_N = 128;
/** Mean of L / I over the move, per turn count: scales the angular speed so the total is whole turns. */
const SPIN_MEAN: number[] = [];
/** Cumulative angle 0..1 over the move, for one turn and for two: the integral of L / I, normalised. */
const SPIN_TABLE = [1, 2, 3, 4].map((n) => {
  const t = new Float32Array(SPIN_N + 1);
  let acc = 0;
  for (let i = 1; i <= SPIN_N; i++) {
    const u = (i - 0.5) / SPIN_N;
    acc += momentumAt(u) / inertiaAt(n, u);
    t[i] = acc;
  }
  for (let i = 1; i <= SPIN_N; i++) t[i]! /= acc;
  SPIN_MEAN.push(acc / SPIN_N);
  return t;
});
/** Fraction of the whole rotation done at progress u. */
function spinAt(n: number, u: number): number {
  const t = SPIN_TABLE[turnIndex(n)]!;
  const x = sat(u) * SPIN_N;
  const i = Math.min(SPIN_N - 1, Math.floor(x));
  return t[i]! + (t[i + 1]! - t[i]!) * (x - i);
}
/** Somersault duration for `n` turns, seconds. */
export function spinTime(n: number): number {
  return SOMERSAULT.time[turnIndex(n)]!;
}

function quintic(x: number): number {
  const t = sat(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
/**
 * The glide: hanging at ease under the wings. Chest open, chin level, legs together and trailing
 * with soft knees and pointed toes, arms loose and a little out behind.
 */
const GLIDEP = pose([
  0, 31.5, 0.16, -0.14, -0.1, -7.5, 3.2, 1.25, -11.5, 5.4, 1.4, -8.5, -8.5, -10.5, -6.5, 0.06, 1, 0.1, 1,
]);
/** The up-slash: long through the body, chest open, chin up, off-hand low and back for balance. */
const UPCUT = pose([0, 34, -0.1, -0.2, -0.32, 2.5, 0.5, 1.1, -2.5, 2, 1.3, 0, 0, -7, -15, 0, 1, -0.5, 1]);
/** The down-slash (air): knees up out of the way, curled over the blade, off-hand thrown back and up. */
const DOWNCUT = pose([-2, 34, 0.34, 0.3, 0.42, 7, 15, 0.9, -3, 18, 1.2, 0, 0, -10.5, -2, 0, 1, 0.7, 1]);
const WALL = pose([
  3.5, 27, 0.14, 0.08, 0.12, 18.6, 15.5, -1.15, 18.6, 4, -1.2, 11.5, 9.5, 9, -3.5, 0.2, 1, 0.3, 0.5,
]);
const DASH = pose([-12, 31, 1.2, 0.06, -0.1, -36, 27, 1.45, -34, 33, 1.5, -14, -1, -13, 2.5, 0, 0.72, 0, 1]);
const SKID = pose([5, 24.5, 0.42, 0.1, -0.12, 10, 0, 0, -16, 0, 0.5, 5, -11, -9, -8, 0.2, 0.95, 0, 1]);

/** Point masses for the centre of mass: joint, weight. */
const MASS = [
  J_HIP,
  3,
  J_CHEST,
  3,
  J_HEAD,
  3.2,
  J_KNEE_A,
  1,
  J_KNEE_B,
  1,
  J_ANK_A,
  0.7,
  J_ANK_B,
  0.7,
  J_HAND_A,
  0.4,
  J_HAND_B,
  0.4,
  J_EL_A,
  0.3,
  J_EL_B,
  0.3,
];

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
  /** A glint was absorbed this frame: strength 0..1; `great` for the big ones. */
  pickup: number;
  great: boolean;
  /** Combo index of the glint taken this frame (0 = first of a run), -1 if none. */
  combo: number;
  /** The glide's wing beat reaches its down-stroke. */
  beat: boolean;
  /** A slash connected this frame. */
  slashHit: boolean;
  /** She was hurt this frame; her last light went out; she re-formed. */
  hurt: boolean;
  fade: boolean;
  reform: boolean;
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
    pickup: 0,
    great: false,
    combo: -1,
    beat: false,
    slashHit: false,
    hurt: false,
    fade: false,
    reform: false,
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
  /** Turns per somersault: 1 or 2 (the owner flips it live with T). */
  static turns = 3;
  /** The finisher as a pirouette. Off: tried and judged worse than the cleave with a hop at game size (memory/character-vesper.md). */
  static finisherTurn = false;
  /** The model's moment of inertia (ball = 1) and angular speed (rad/s) this frame, and the ball's measured radius. */
  spinI: number = SOMERSAULT.inertiaOpen;
  spinOmega = 0;
  /** Moment of inertia of the posed joints about their centre of mass (px², unit masses): a check on the model. */
  jointI = 0;
  private spinN = 1;
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
  /** Glide: weight of the body's pose 0..1. */
  wGlide = 0;
  /** How far the wings are spread into the glide shape 0..1 (leads the pose in, lingers on a landing). */
  soar = 0;
  /** The catch: + = the wings billow past the glide shape; one soft overshoot the other way. */
  catchK = 0;
  /** Wing-plane tilt on screen, rad, clockwise + (the right-hand wing dips). */
  bank = 0;
  /** The body's pendulum under the wings on screen, rad, clockwise + (feet swing left). */
  swing = 0;
  /** Touch-down out of a glide: 1 at the landing, decays; the wings stay up and flare. */
  flare = 0;
  /** Stooping: wings swept up tight (after Down ended a glide, or any fast fall). */
  dive = 0;
  private diving = false;
  /** Set by the owner before `update`: px of clear air under the feet (Infinity if unknown). */
  groundDist = Number.POSITIVE_INFINITY;
  /** The glide's slow wing beat: < 0 the wings lift (anticipation), > 0 the down-stroke (0..1). */
  beat = 0;
  /** 0..1: reaching for the ground at the end of a glide. */
  reach = 0;
  /** Slash: 0..1 the thorn is in her hand; 0..1 it is on its way back into the sheath. */
  slashW = 0;
  slashHome = 0;
  /** The blade in the forward frame: direction (rad) and length 0..1 (it shortens seen end on). */
  slashAng = SHEATH_ANG * DEG;
  slashLen = 1;
  /** ... and on screen (y down), with the facing and the body's roll in it. */
  bladeX = -1;
  bladeY = 0;
  /** Seconds since the slash began (stands still in hitstop), its stroke, direction and combo step. */
  slashT = 9;
  stroke: Stroke = STROKES.fwd[0]!;
  slashDir: SlashDir = 'fwd';
  slashStep = 1;
  /** Progress of the cut itself 0..1 (-1 while gathering; 1 once it is through), and 1 on its first frame. */
  cutQ = -1;
  cutStart = false;
  /** What the wings read: flare (-1 folded close .. 1.5 thrown wide), the shoulders' twist, the air hang. */
  slashWing = 0;
  slashTwist = 0;
  hangK = 0;
  /** The whole body's roll on screen through an air cut, rad clockwise. */
  slashRoll = 0;
  /** Extra tilt of this slash's ellipse, degrees (under spread wings she cuts lower). */
  slashTilt = 0;
  /** Seconds since the last hit (hitstop, flash, recoil). */
  hitT = 9;
  /** Where the last hit landed (the target's centre), world px, and how heavy it was. */
  hitX = 0;
  hitY = 0;
  hitPower = 1;
  /** The side the slash goes to (it keeps it whatever she does). */
  slashFacing = 1;
  /**
   * Which arm holds the thorn: 0 = side A, 1 = side B. Always the arm toward the camera when the
   * slash starts (the near arm reads; the far one is hidden behind her), and the lead foot with it.
   */
  swordSide = 0;
  private slashOn = false;
  private gripIn = 0;
  private fromAng = SHEATH_ANG * DEG;
  private fromLen = 1;
  private fromHand = HAND_WIND;
  private handR = HAND_WIND;
  /** Px from the sword shoulder to the hand right now (before foreshortening), arm stretch included. */
  get handNow(): number {
    return this.handR * (1 + SNAP.arm * sat((this.smear1 - this.smear0) * 2.2) * this.slashW);
  }
  private readonly kFrom = new Float32Array(NK);
  private readonly kNow = new Float32Array(NK);
  /** How far the lunge has carried her past her back foot, px (it drags, then comes up). */
  private lungeBack = 0;
  /**
   * Hurt: 0..1 the recoil (flung along the knockback, wings flared; held through the stagger).
   * `fadeK` 0..1: dissolved to dust (her last light went out). `reformK` 1..0: gathering again.
   */
  hurtK = 0;
  hurtDir = 1;
  fadeK = 0;
  reformK = 0;
  private hurtT = 9;
  private fading = false;
  private fadeT = 0;
  private reformT = 9;
  private hurtRoll = 0;
  hurtBlow = 0;
  /** 1 while her tones are flipped by a blow (two frames), else 0. */
  get hurtInvert(): number {
    return this.hurtT < HURT.invert && !this.fading ? 1 : 0;
  }
  /** 0..1: how much of the stroke's body key is in play; px she is off the ground in the finisher's hop. */
  slashBody = 0;
  slashHop = 0;
  /**
   * Smear frames: the fractions of the cut the blade crossed in the frame being drawn (equal = no
   * smear). The blade is drawn as one long tapered shape over that part of the arc.
   */
  smear0 = 0;
  smear1 = 0;
  private pogo = 0;
  private lastBeatU = 0;
  private soarOut = 8;
  private readonly catchS = new Spring(0, 13, 0.5);
  private readonly swingS = new Spring(0, 7.6, 0.3);
  private readonly bankS = new Spring(0, 8.5, 0.75);
  private readonly gAxS = new Spring(0, 12, 1);
  private lastVy = 0;
  private lastStep = 0;
  /** Delight from a pickup: decays in ~0.4 s. Lifts the head and chest; the wings read it too. */
  joy = 0;
  /** A great glint: the wings open wide once, hold a breath, and fold (0..1 envelope). */
  flourish = 0;
  private flourishT = 9;
  private spinVel = 0;
  private spinTarget = 0;
  private wasFree = false;
  private antic = 0;
  private readonly spinS = new Spring(0, 20, 1);
  private spinT = 0;
  private spinDir = 1;
  private spinFree = false;
  private rolling = false;
  private rollK = 0;
  /** Screen spin rate (rad/s, clockwise +) and the point she is turning about: for the motion-blur rings. */
  spinRate = 0;
  spinCx = 0;
  spinCy = 0;
  /** A slash began in the somersault: she kicks out of the ball at once and unfolds into the cut. */
  private spinCut = false;
  /** Pirouette progress in turns (0 = none). */
  turnF = 0;
  /** What is left of the somersault's turn while she cuts out of it, rad on screen: the blade turns with her. */
  private spinResid = 0;
  private openT = 1;
  private readonly gazeX = new Spring(0, 26, 0.85);
  private readonly gazeY = new Spring(0, 14, 0.9);
  private readonly wide = new Spring(1, 22, 0.5);
  private speedNow = 0;
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
    sig.pickup = 0;
    sig.great = false;
    sig.combo = -1;
    sig.beat = false;
    sig.slashHit = false;
    sig.hurt = false;
    sig.fade = false;
    sig.reform = false;
    let startSpin = false;
    let glideKick = 0;

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
        case 'glideStart': {
          // The wings snap open and catch the air: how hard depends on the fall they have to stop.
          const vy = clamp(e.vy, 0, 26);
          this.catchS.v += GLIDE.catch0 + GLIDE.catchVy * vy;
          glideKick = GLIDE.swing0 + GLIDE.swingVy * vy;
          this.diving = false;
          break;
        }
        case 'glideEnd':
          // How the wings leave the glide: a slow fold on release, a snap into the dart...
          this.soarOut =
            e.reason === 'dash' ? 34 : e.reason === 'wall' ? 7 : e.reason === 'fastfall' ? 17 : 6.5;
          if (e.reason === 'land') this.flare = 1;
          if (e.reason === 'fastfall') this.diving = true;
          break;
        case 'dashStart':
          sig.dashStart = true;
          this.squash.v -= 1.6;
          break;
        case 'skid':
          sig.skid = true;
          break;
        case 'slash':
          this.slash(e.dir, e.step, e.facing, p);
          break;
        case 'slashEnd':
          // A dash cuts it dead: the blade is simply home (the dash pose takes the arms).
          if (e.reason === 'dash' || e.reason === 'hurt') this.slashOn = false;
          break;
        case 'slashHit':
          this.hitT = 0;
          this.hitX = e.x;
          this.hitY = e.y;
          this.hitPower = e.power;
          sig.slashHit = true;
          if (e.pogo) this.pogo = 1;
          this.squash.v += e.pogo ? 2.4 : -1.2;
          break;
        case 'headBump':
          this.squash.v -= 3;
          break;
        case 'pickup': {
          // A small delighted lift; calmer when she is gathering many in a row.
          const k = e.kind === 'great' ? 1 : 0.7 / (1 + e.combo * 0.5);
          this.joy = Math.max(this.joy, k);
          sig.combo = Math.max(sig.combo, e.combo);
          // The first of a run puts a tiny skip in her stride.
          if (e.combo === 0 && e.kind !== 'great' && p.grounded) this.crouch.v -= 34;
          this.wide.v += 2.2 * k;
          if (e.kind === 'great') {
            sig.great = true;
            this.flourishT = 0;
          }
          sig.pickup = Math.max(sig.pickup, k);
          break;
        }
        case 'hurt':
          // Thrown back: `dir` is the way she flies.
          this.hurtT = 0;
          this.hurtDir = e.dir >= 0 ? 1 : -1;
          this.slashOn = false;
          this.squash.v -= 2.2;
          this.wide.v -= 2;
          sig.hurt = true;
          break;
        case 'fade':
          this.fading = true;
          this.fadeT = 0;
          sig.fade = true;
          break;
        case 'reform':
          this.fading = false;
          this.reformT = 0;
          this.hurtT = 9;
          sig.reform = true;
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
      this.wGlide = 0;
      this.soar = 0;
      this.flare = 0;
      this.flourishT = 9;
      this.flourish = 0;
      this.slashT = 9;
      this.slashW = 0;
      this.slashOn = false;
      this.gripIn = 0;
      this.lungeBack = 0;
      this.kNow.fill(0);
      this.hitT = 9;
      this.hurtT = 9;
      if (!sig.reform) {
        this.fading = false;
        this.reformT = 9;
      }
      this.reach = 0;
      this.beat = 0;
      this.dive = 0;
      this.diving = false;
      this.catchS.snap(0);
      this.swingS.snap(0);
      this.bankS.snap(0);
      this.gAxS.snap(0);
      this.lastVy = p.vy;
      glideKick = 0;
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

    // --- Turn. Under the wings she comes round slowly: the head first, then the body, in about
    // the time her drift takes to reverse.
    this.yaw.omega = lerp(26, 8.2, this.wGlide);
    this.yaw.zeta = lerp(0.78, 0.95, this.wGlide);
    this.headYaw.omega = lerp(40, 15, this.wGlide);
    const d0 = clamp(this.yaw.step(dirT, dt), -1, 1);
    const sgn = d0 >= 0 ? 1 : -1;
    // The pirouette: her whole body turns about its upright axis through the finisher. The body
    // leads (half a turn in the gather: she coils away and shows her back), the blade trails it.
    let turnF = 0;
    {
      const sk = this.stroke;
      if (this.slashOn && sk.turn && this.wWall < 0.5 && this.soar < 0.5) {
        const sf = (this.slashT + (p.hitstop <= 0 || sig.slashHit ? dt : 0)) * 60;
        const u = sat((sf - sk.wind) / sk.cut);
        turnF =
          sf < sk.wind
            ? 0.5 * smoothstep(0, 1, sf / sk.wind) ** 1.3
            : 0.5 + 0.5 * (1 - (1 - u) ** sk.ease) ** 0.8;
        turnF *= sk.turn;
      }
    }
    this.turnF = turnF;
    const theta = TAU * turnF;
    const d = d0 * Math.cos(theta);
    // Sideways offsets (which shoulder, hip and foot is on which side) swap for the far half of the turn.
    const tf = turnF - Math.floor(turnF);
    const latSign =
      turnF <= 0 || turnF >= 1
        ? 1
        : tf < 0.75
          ? clamp((0.5 - tf) * 10, -1, 1)
          : lerp(-1, 1, smoothstep(0.75, 1, tf));

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
    this.wRun += (runT - this.wRun) * approach(runT > this.wRun ? 18 : 17, dt);
    this.wIdle += ((ground ? 1 - runT : 0) - this.wIdle) * approach(17, dt);
    this.speedK += (sat(speed / 9.6) - this.speedK) * approach(9, dt);
    this.speedNow = sat(speed / 9.6);

    // --- Run phase: by distance, signed by the facing so moving backwards runs it backwards.
    if (p.grounded && !dash) {
      this.phase += (dx * sgn) / RUN_CYCLE;
      this.phase -= Math.floor(this.phase);
    }

    const g0 = this.frame.s[S_GROUND]!;

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

    // A ground turn-around is a pivot: both feet stay down while she swivels through the camera.
    if (p.grounded) {
      const pivot = sat(1.25 * (1 - Math.abs(d))) * (1 - this.wDash);
      out[AU]! *= 1 - 0.92 * pivot;
      out[BU]! *= 1 - 0.92 * pivot;
      out[AP]! *= 1 - 0.7 * pivot;
      out[BP]! *= 1 - 0.7 * pivot;
      out[PU]! -= 1.6 * pivot;
      // Each footfall of the lope gives a little at the knee.
      const st = Math.floor(this.phase * 2);
      if (st !== this.lastStep && this.wRun > 0.6) this.crouch.v += 9;
      this.lastStep = st;
    }

    // --- Double jump: snap into a ball, one clean turn, snap out.
    if (startSpin) {
      this.spinning = true;
      this.spinFree = false;
      this.spinT = 0;
      this.spinA = 0;
      this.wasFree = false;
      this.spinDir = Math.abs(p.vx) > 1.5 ? (p.vx > 0 ? 1 : -1) : sgn;
      this.spinCut = false;
      this.spinN = turnIndex(Rig.turns) + 1;
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
          // A dash must be level almost at once; a landing can take a moment longer.
          this.spinS.omega = dash || this.spinCut ? 46 : 26;
          this.spinTarget = Math.round((this.spinA + this.spinVel * 0.06) / TAU) * TAU;
          // Landing in the ball: it hits the ground and rolls out. On to the next upright that is
          // at least a little way round, braking just hard enough to stop there without rocking back.
          this.rolling = p.grounded && !dash && !this.spinCut && this.spinW > 0.5;
          if (this.rolling) {
            let rem = Math.ceil((this.spinA + SOMERSAULT.rollMin) / TAU) * TAU - this.spinA;
            if (rem > SOMERSAULT.rollMax) rem -= TAU;
            this.spinTarget = this.spinA + rem;
            this.spinS.omega = Math.max(SOMERSAULT.rollOmega, this.spinVel / Math.max(rem, 0.2));
          }
          if (this.spinCut) {
            // The kick-out comes now: the wings are thrown wide as she opens into the cut.
            sig.opened = true;
            this.openT = 0;
          }
        }
        const a0 = this.spinA;
        this.spinA = this.spinS.step(this.spinTarget, dt);
        if (dt > 0) this.spinVel = (this.spinA - a0) / dt;
        // Rolling out she stays a ball until she is nearly round, then unrolls into the landing crouch.
        const left = Math.abs(this.spinTarget - this.spinA);
        const tuckT = this.rolling && p.grounded ? 0.92 * smoothstep(0.35, 1.5, left) : 0;
        this.spinW += (tuckT - this.spinW) * approach(this.spinCut ? 42 : tuckT > this.spinW ? 30 : 20, dt);
        if (
          Math.abs(this.spinA - this.spinTarget) < 0.004 &&
          Math.abs(this.spinS.v) < 0.1 &&
          this.spinW < 0.01
        )
          this.spinning = false;
      } else {
        const n = this.spinN;
        const T = spinTime(n);
        const u0 = this.spinT / T;
        this.spinT += dt;
        const u = this.spinT / T;
        const a0 = this.spinA;
        this.spinA = TAU * n * spinAt(n, u);
        if (dt > 0) this.spinVel = (this.spinA - a0) / dt;
        this.spinW = tuckAt(n, u);
        this.spinI = inertiaAt(n, u);
        this.spinOmega = (TAU * n * momentumAt(u)) / (this.spinI * SPIN_MEAN[n - 1]! * T);
        // Initiation: the chest drives over and the arms are thrown down the way she will turn.
        this.antic = bell(u / (SOMERSAULT.tuckIn[n - 1]! * 0.9));
        const ko = SOMERSAULT.kickOut[n - 1]! + 0.06;
        if (u0 < ko && u >= ko) {
          sig.opened = true;
          this.openT = 0;
        }
        if (u >= 1) this.spinning = false;
      }
      this.wasFree = this.spinFree;
      if (!this.spinFree || !p.grounded) this.rolling = false;
      this.spinResid =
        this.spinning && this.spinFree && this.spinCut ? (this.spinA - this.spinTarget) * this.spinDir : 0;
      if (!this.spinning) {
        this.rolling = false;
        this.spinA = 0;
        this.spinW = 0;
        this.spinVel = 0;
        this.spinOmega = 0;
        this.spinI = SOMERSAULT.inertiaOpen;
        this.antic = 0;
      }
      this.spinW = sat(this.spinW);
      this.spinPhi = this.spinA * this.spinDir;
    }
    this.spinRate = this.spinning ? this.spinVel * this.spinDir : 0;
    this.rollK += ((this.rolling ? 1 : 0) - this.rollK) * approach(this.rolling ? 34 : 16, dt);
    if (this.spinW > 1e-4) {
      const w = this.spinW;
      for (let i = 0; i < NP; i++) out[i] = lerp(out[i]!, TUCK[i]!, w);
    }
    if (this.antic > 1e-3) {
      const k = this.antic * (1 - this.spinW);
      out[HAU]! += 4 * k;
      out[HBU]! += 3 * k;
      out[HAF]! += 8 * k;
      out[HBF]! += 7 * k;
      out[LEAN]! += 0.3 * k;
      out[CURL]! += 0.2 * k;
      out[HT]! += 0.25 * k;
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

    // --- Glide: the wings catch the air, the body swings under them, then it is all serene.
    const glide = p.motion === 'glide';
    const fps = Math.max(dt * 60, 0.25);
    const ax = (p.vx - this.lastVx) / fps;
    // The sim sheds fall speed over ~11 frames: while it does, the wings stay billowed.
    const decel = glide ? clamp((this.lastVy - p.vy) / fps, 0, 6) : 0;
    this.lastVy = p.vy;
    this.wGlide += ((glide ? 1 : 0) - this.wGlide) * approach(glide ? 13 : p.grounded || dash ? 30 : 8, dt);
    this.flare *= Math.exp(-(p.grounded ? 6.5 : 12) * dt);
    const spreadT = glide || this.flare > 0.5 ? 1 : 0;
    this.soar += (spreadT - this.soar) * approach(spreadT ? 25 : this.flare > 0.05 ? 11 : this.soarOut, dt);
    // A great glint opens them the same way for a moment, wherever she is.
    this.flourishT += dt;
    const fu = this.flourishT / 0.85;
    this.flourish = fu < 1 && !dash && !wall ? quintic(fu / 0.22) * (1 - quintic((fu - 0.5) / 0.5)) : 0;
    this.soar = Math.max(this.soar, 0.86 * this.flourish * (1 - this.spinW));
    this.catchK = this.catchS.step(sat(decel / GLIDE.catchDecel), dt);
    // Banking: the wing plane tips toward where she is going and leans into a turn.
    const gax = this.gAxS.step(glide ? clamp(ax, -1.2, 1.2) : 0, dt);
    this.bank = this.bankS.step(glide ? GLIDE.bankVx * p.vx + GLIDE.bankAx * gax : 0, dt);
    // The pendulum: thrown forward by the catch, then it trails her acceleration.
    this.swingS.v -= glideKick * sgn;
    this.swing = this.swingS.step(glide ? 0.26 * gax : 0, dt) * sat(this.wGlide * 1.4 + this.soar);
    // Stooping after a glide is cut with Down, or any fall past the normal top speed.
    if (this.diving && (p.grounded || glide || dash || wall || p.vy < 6)) this.diving = false;
    const diveT = air && !glide ? Math.max(this.diving ? 1 : 0, smoothstep(22.5, 28, p.vy)) : 0;
    this.dive += (diveT - this.dive) * approach(diveT > this.dive ? 16 : 9, dt);
    // Every few seconds of steady glide: one slow, deliberate beat. The wings lift a little, then
    // press down; she rises a hair on the stroke.
    const bu = pulse(clock, GLIDE.beatEvery, GLIDE.beatLen, 121, 1);
    const steady = glide
      ? sat(this.soar * 2 - 1) * sat(1 - 2.5 * Math.abs(this.catchK)) * (1 - this.reach)
      : 0;
    const bx1 = (bu - 0.17) / 0.11;
    const bx2 = (bu - 0.47) / 0.15;
    this.beat = bu > 0 ? (Math.exp(-bx2 * bx2) - 0.5 * Math.exp(-bx1 * bx1)) * steady : 0;
    if (bu >= 0.33 && this.lastBeatU < 0.33 && this.lastBeatU > 0 && steady > 0.6) sig.beat = true;
    this.lastBeatU = bu;
    // The ground is coming: the legs reach down for it and the wings brake.
    const reachT = glide && p.vy > 0 ? smoothstep(GLIDE.reachPx, 16, this.groundDist) : 0;
    this.reach += (reachT - this.reach) * approach(reachT > this.reach ? 14 : 22, dt);
    if (this.wGlide > 1e-3) {
      const w = this.wGlide;
      for (let i = 0; i < NP; i++) out[i] = lerp(out[i]!, GLIDEP[i]!, w);
      const bl = Math.max(0, this.beat);
      const rc = this.reach;
      out[PU]! += (4 * bl + 1.2 * rc) * w;
      out[CURL]! += (-0.05 * bl - 0.06 * rc) * w;
      out[HAU]! += (-1.5 * bl + 2.5 * rc) * w;
      out[HBU]! += (-1.2 * bl + 2 * rc) * w;
      // Reaching: legs come under her, long, toes down, one a little ahead.
      out[AF]! += 11.5 * rc * w;
      out[BF]! += 10.5 * rc * w;
      out[AU]! += -5.6 * rc * w;
      out[BU]! += -6.6 * rc * w;
      out[AP]! += -0.75 * rc * w;
      out[BP]! += -0.7 * rc * w;
      out[LEAN]! += -0.1 * rc * w;
      const vf = clamp((p.vx * sgn) / GLIDE.topVx, -1.2, 1.2);
      const ck = this.catchK;
      // Never frozen: three slow drifts that do not line up.
      const n1 = noise1(clock * 0.53, 71);
      const n2 = noise1(clock * 0.87, 73);
      const n3 = noise1(clock * 0.31, 79);
      out[LEAN]! += (0.11 * vf + 0.03 * n3) * w;
      out[CURL]! += (-0.05 * ck + 0.02 * n1) * w;
      out[HT]! += (-0.05 * vf + 0.1 * Math.max(0, ck) + 0.03 * n2) * w;
      // The catch: legs are thrown straight down and the arms fly up; then they trail again.
      out[PU]! += 1.4 * ck * w;
      out[AF]! += (5.5 * ck + 1.3 * n1) * w;
      out[BF]! += (7.5 * ck - 1.1 * n2) * w;
      out[AU]! += (-3.2 * ck + 0.7 * n2) * w;
      out[BU]! += (-5 * ck + 0.6 * n1) * w;
      out[AP]! += -0.3 * ck * w;
      out[BP]! += -0.35 * ck * w;
      out[HAU]! += (5.5 * ck + 0.9 * n3) * w;
      out[HBU]! += (4.5 * ck - 0.8 * n1) * w;
      out[HAF]! += (-2 * ck + 0.8 * n2 - 1.6 * vf) * w;
      out[HBF]! += (-1.5 * ck - 1.4 * vf) * w;
      out[LOOKY]! += -0.25 * w;
    }
    if (this.dive > 1e-3) {
      // A stoop: body long and head-first-ish, arms pinned back.
      const w = this.dive * (1 - this.wGlide);
      out[LEAN]! += 0.2 * w;
      out[HT]! += 0.16 * w;
      out[HAF]! += -3 * w;
      out[HBF]! += -3 * w;
      out[HAU]! += 3.5 * w;
      out[HBU]! += 3 * w;
      out[AU]! += 2.5 * w;
      out[BU]! += 1.5 * w;
    }

    // --- The thorn slash.
    this.hitT += dt;
    // The sim holds her for the hitstop: the cut holds with her.
    // (The frame the blow lands still moves: the hold catches the blade in the cut, not before it.)
    const slashAdv = p.hitstop <= 0 || sig.slashHit;
    if (slashAdv) this.slashT += dt;
    let slashRot = 0;
    const sk = this.stroke;
    const sf = this.slashT * 60;
    const kn = this.kNow;
    this.cutStart = false;
    const cut0 = this.cutQ;
    if (this.slashOn && sf < sk.hold + sk.home) {
      const ew = smoothstep(0, 1, sf / sk.wind);
      const u = sat((sf - sk.wind) / sk.cut);
      // The cut is fastest as it starts and eases out into the follow-through.
      const sw = 1 - (1 - u) ** sk.ease;
      const after = Math.max(0, sf - sk.wind - sk.cut);
      const dirn = sk.a1 > sk.a0 ? 1 : -1;
      const rest = Math.max(1, sk.hold - sk.wind - sk.cut);
      // The blade carries past the end of the cut at speed (the overshoot), then springs back and
      // settles into the held follow-through: the stop is what sells the blow.
      const ring = after > 0 ? Math.exp(-after / SNAP.settle) * Math.cos(after * SNAP.ring) : 1;
      const over = after > 0 ? ring : sw ** 4;
      const deg =
        sk.a0 +
        (sk.a1 - sk.a0) * sw +
        dirn * (sk.over * over - (after > 0 ? (sk.over * SNAP.back + sk.relax) * (1 - ring) : 0));
      strokeMap(sk, deg, this.slashTilt);
      let ang = Math.atan2(mapOut.u, mapOut.f);
      let len = Math.hypot(mapOut.u, mapOut.f);
      let hand = lerp(HAND_WIND, HAND_CUT, smoothstep(0, 0.55, sw)) - 1.6 * sat(after / 7);
      if (sf < sk.wind) {
        // The gather: from wherever the blade was (the sheath, the last cut's follow-through).
        ang = this.fromAng + wrapPi(ang - this.fromAng) * ew;
        len = lerp(this.fromLen, len, ew);
        hand = lerp(this.fromHand, hand, ew);
      }
      this.cutQ = sf >= sk.wind ? sw : -1;
      // Smear frames: the part of the arc the blade crossed in the frame being drawn (held in hitstop).
      if (slashAdv && dt > 0) {
        const fast = this.cutQ >= 0 && sf < sk.wind + sk.cut + 0.6 && this.cutQ - Math.max(0, cut0) > 0.4;
        this.smear0 = fast ? Math.max(0, cut0) : 0;
        this.smear1 = fast ? this.cutQ : 0;
      }
      if (this.cutQ >= 0 && cut0 < 0) {
        this.cutStart = true;
        // Running, the stride gives under the cut (the feet keep their plants: no sliding).
        if (p.grounded && this.wRun > 0.5 && sk.f[K_HOP] === 0) this.crouch.v += 30;
      }
      // The cut is done and no other followed: the blade turns home to the sheath, the hand to the hilt.
      const home = quintic((sf - sk.hold) / sk.home);
      if (home > 0) {
        // From in front of her it goes down and round (a turn of the wrist), never back over her head.
        let da = wrapPi(SHEATH_ANG * DEG - ang);
        const a = wrapPi(ang);
        if (da > 0 && a > SHEATH_ANG * DEG && a < 1.75) da -= TAU;
        ang += da * home;
        len = lerp(len, 1, home);
      }
      this.slashHome = home;
      this.slashAng = ang;
      this.slashLen = len;
      this.handR = hand;
      this.gripIn = Math.min(1, this.gripIn + (dt * 60) / 1.5);
      this.slashW = Math.min(this.gripIn, 1 - quintic((sf - sk.hold - sk.home * 0.72) / (sk.home * 0.28)));
      // The body: gather key -> end-of-cut key, easing off through the hold and gone as the blade goes home.
      // The body lets go more slowly than the blade: a chained cut still finds her in the follow-through.
      const rel = 1 - 0.35 * smoothstep(0.15, 1, after / rest);
      const bw = 1 - quintic((sf - sk.hold) / sk.home);
      for (let i = 0; i < NK; i++) {
        const v =
          sf < sk.wind
            ? lerp(this.kFrom[i]!, sk.w[i]!, ew)
            : lerp(sk.w[i]!, sk.f[i]! * rel * (1 + SNAP.body * over), sw);
        kn[i] = v * bw;
      }
      kn[K_LIFT] =
        sk.f[K_LIFT]! * Math.sin(Math.PI * sat((sf - sk.wind * 0.5) / (sk.cut + sk.wind * 0.5 + 1.5)));
      // The hop: off the ground as the cut starts, down again a few frames after it (the sim never
      // left the ground: she must be standing again well before the stroke is over).
      kn[K_HOP] = sk.f[K_HOP]! * Math.sin(Math.PI * sat((sf - sk.wind * 0.75) / (sk.cut + 3))) ** 0.8;
      this.slashBody = Math.min(this.gripIn, bw);
      // Up and down are whole poses under the stroke. On the ground the feet stay where they are.
      if (this.slashDir !== 'fwd') {
        const src = this.slashDir === 'up' ? UPCUT : DOWNCUT;
        const feet = p.grounded ? 0 : 1;
        const pw = Math.min(this.gripIn, bw) * 0.92;
        for (let i = 0; i < NP; i++) {
          if (i === EYE || i === HYAW || i === PF) continue;
          const isFoot = i >= AF && i <= BP;
          out[i] = lerp(out[i]!, src[i]!, pw * (isFoot || i === PU ? feet : 1));
        }
      }
    } else {
      this.slashOn = false;
      this.slashW = 0;
      this.slashHome = 0;
      this.gripIn = 0;
      this.cutQ = -1;
      this.smear0 = this.smear1 = 0;
      this.slashAng = SHEATH_ANG * DEG;
      this.slashLen = 1;
      this.handR = HAND_WIND;
      for (let i = 0; i < NK; i++) kn[i]! *= Math.exp(-20 * dt);
      this.slashBody = 0;
    }
    {
      // On a wall she clings with the other hand and both feet and twists out to cut away from it.
      const onWall = this.wWall * this.slashW * (this.slashDir === 'fwd' ? 1 : 0);
      const fw = 1 - this.wWall;
      // Under spread wings the body only answers a little: the wings hold her.
      const gl = 1 - 0.5 * this.soar;
      const gk = p.grounded ? 1 : 0.45;
      const airK = 1 - g0;
      const sB = this.swordSide === 1;
      const mir = sB ? -1 : 1;
      const OHF = sB ? HAF : HBF;
      const OHU = sB ? HAU : HBU;
      const LF = sB ? BF : AF;
      const LU = sB ? BU : AU;
      const TF = sB ? AF : BF;
      const TP = sB ? AP : BP;
      out[TW]! += kn[K_TW]! * fw * mir;
      out[LEAN]! += kn[K_LEAN]! * fw * gl;
      out[CURL]! += kn[K_CURL]! * fw * gl;
      out[PF]! += kn[K_PF]! * fw * gk;
      // Running, the stride answers the cut: she sinks into it and the trailing leg (whichever is
      // off the ground: a planted foot is never moved) is thrown long behind her.
      const acc = this.slashOn ? bell(sat(sf / (sk.wind + sk.cut + 5))) * this.wRun * g0 * fw : 0;
      if (acc > 1e-3) {
        const rearA = out[AF]! < out[BF]!;
        const RF = rearA ? AF : BF;
        const RU = rearA ? AU : BU;
        const off = sat(out[RU]! / 3);
        out[RF]! -= 9 * acc * off;
        out[RU]! += 3 * acc * off;
        out[rearA ? AP : BP]! += 0.4 * acc * off;
        out[PU]! -= 2.4 * acc;
        out[LEAN]! += 0.1 * acc;
      }
      const hop = kn[K_HOP]! * g0 * fw;
      out[PU]! += (kn[K_PU]! + kn[K_LIFT]!) * fw * gk + hop;
      out[HT]! += kn[K_HT]! * fw;
      out[OHF]! += kn[K_OF]! * fw;
      out[OHU]! += kn[K_OU]! * fw;
      // Feet: standing, the front foot steps in with the lunge and the back foot is left behind for
      // a moment before it is drawn up. Running, the stride carries on under the cut.
      const stand = g0 * (1 - this.wRun) * (1 - this.wSkid) * fw;
      if (p.grounded && p.lungeX !== 0) this.lungeBack += dx * sgn;
      this.lungeBack *= Math.exp(-(this.slashOn && sf < 9 ? 5 : 16) * dt);
      const back = clamp(this.lungeBack, -4, 14);
      out[LF]! += kn[K_FA]! * stand;
      out[LU]! +=
        Math.abs(sk.f[K_FA]! - sk.w[K_FA]!) *
        0.42 *
        bell(sat(sf / (sk.wind + sk.cut))) *
        stand *
        (this.slashOn ? 1 : 0);
      out[TF]! += (kn[K_FB]! - back) * stand;
      out[TP]! += sat(back / 10) * 0.7 * stand;
      // The hop takes both feet up (the lead knee higher), whatever the legs were doing.
      out[LU]! += hop * 1.25;
      out[sB ? AU : BU]! += hop * 0.85;
      out[TF]! -= hop * 0.35 * stand;
      this.slashHop = hop;
      // In the air the legs trail behind the cut.
      out[AF]! -= kn[K_LEGS]! * airK * gl;
      out[BF]! -= kn[K_LEGS]! * 1.3 * airK * gl;
      out[AU]! -= kn[K_LEGS]! * 0.3 * airK * gl;
      slashRot = kn[K_ROT]! * airK * fw * gl;
      out[LEAN]! -= 0.34 * onWall;
      out[CURL]! -= 0.22 * onWall;
      out[PF]! -= 3.5 * onWall;
      out[TW]! -= 0.5 * onWall * mir;
      out[HT]! -= 0.12 * onWall;
      out[HYAW] = lerp(out[HYAW]!, -0.8, onWall);
      // An up cut in the air is one long vertical line: wings swept down and back, legs together.
      const upAir = this.slashDir === 'up' ? airK * this.slashBody : 0;
      this.slashWing = lerp(kn[K_WING]!, -1.1, upAir);
      this.slashTwist = kn[K_TW]! * mir;
      // The air hang: the wings lift to hold her for those frames.
      this.hangK += ((p.hang > 0 ? 1 : 0) - this.hangK) * approach(p.hang > 0 ? 40 : 9, dt);
    }
    // A down-slash that lands: the legs snap long under her, then spring up into a tuck.
    if (this.pogo > 0) {
      this.pogo = Math.max(0, this.pogo - dt / 0.3);
      const q = 1 - this.pogo;
      const ext = bell(q / 0.45);
      const tk = bell((q - 0.3) / 0.7);
      out[AU]! += -9 * ext + 7 * tk;
      out[BU]! += -11 * ext + 8 * tk;
      out[AF]! += -4 * ext;
      out[BF]! += -3 * ext;
      out[LEAN]! -= 0.2 * ext;
    }

    // --- Springs layered on top.
    this.lastVx = p.vx;
    const accT = p.grounded ? clamp(ax * sgn * 0.07, -0.3, 0.3) : clamp(ax * sgn * 0.03, -0.14, 0.14);
    const accLean = this.accS.step(dash ? 0 : accT, dt);
    const crouch = clamp(this.crouch.step(0, dt), -2.2, 10);
    this.crouchPx = crouch;
    const sq = clamp(this.squash.step(0, dt), -0.14, 0.13) * (1 - this.spinW);
    out[PU]! -= crouch;
    out[LEAN]! += accLean + crouch * 0.012;
    out[HT]! += crouch * 0.02 - accLean * 0.45;

    // --- Hurt: a sharp recoil. Her hips are thrown along the knockback; head, arms and legs trail it.
    this.hurtT += dt;
    if (this.fading) this.fadeT += dt;
    this.reformT += dt;
    const hk = this.fading
      ? 1
      : this.hurtT < HURT.hold + HURT.out
        ? sat(this.hurtT / 0.017) *
          (1 + HURT.pop * Math.exp(-this.hurtT / 0.05)) *
          (1 - quintic((this.hurtT - HURT.hold) / HURT.out))
        : 0;
    this.hurtK = hk;
    this.fadeK = this.fading ? smoothstep(HURT.fadeAt, HURT.fadeAt + HURT.fadeLen, this.fadeT) : 0;
    this.reformK = this.reformT < HURT.reform ? 1 - smoothstep(0.12, 1, this.reformT / HURT.reform) : 0;
    this.hurtRoll = 0;
    if (hk > 1e-3) {
      const kf = this.hurtDir * sgn;
      const up = 1 - g0;
      // On the ground: knocked back on her heels. In the air: flung spine-first, folded round the
      // blow like a jackknife, with hands and feet trailing toward what hit her.
      out[LEAN]! -= (0.44 + 0.5 * up) * kf * hk;
      out[CURL]! += (0.26 + 0.5 * up) * hk;
      out[HT]! += (0.3 + 0.25 * up) * hk;
      out[PF]! += 3 * kf * hk;
      out[PU]! += 3 * up * hk;
      out[HAF]! -= (9 + 5 * up) * kf * hk;
      out[HBF]! -= (7.5 + 5 * up) * kf * hk;
      out[HAU]! += (6 + 5 * up) * hk;
      out[HBU]! += (4.5 + 6 * up) * hk;
      out[AF]! -= 15 * kf * hk * up;
      out[BF]! -= 12 * kf * hk * up;
      out[AU]! += 13 * hk * up;
      out[BU]! += 9 * hk * up;
      out[AP]! -= 0.5 * hk * up;
      out[BP]! -= 0.5 * hk * up;
      out[EYE]! *= 1 - 0.7 * hk;
      // On screen, clockwise +: the feet lead the way she is thrown.
      this.hurtRoll = -(0.12 + 0.36 * up) * this.hurtDir * hk;
    }
    // The wings are blown inside-out for a beat: they stream toward the blow, ahead of her.
    this.hurtBlow = this.hurtT < HURT.blow ? Math.sin(Math.PI * sat(this.hurtT / HURT.blow)) ** 0.6 : 0;
    // Re-forming she is curled small and unfolds as the dust comes together.
    if (this.reformK > 1e-3) {
      const w = this.reformK * 0.75;
      for (let i = 0; i < NP; i++) {
        if (i === AF || i === AU || i === BF || i === BU || i === PF || i === HYAW) continue;
        out[i] = lerp(out[i]!, i === PU ? 22 : TUCK[i]!, w);
      }
      this.slashWing = Math.min(this.slashWing, -1.1 * this.reformK);
    }
    this.joy *= Math.exp(-5.5 * dt);
    out[HT]! -= 0.22 * this.joy;
    out[CURL]! -= 0.1 * this.joy;
    out[PU]! += 1.3 * this.joy;
    // Arms open a little with the great flourish.
    out[HAU]! += 4 * this.flourish;
    out[HBU]! += 3.5 * this.flourish;
    out[HAF]! -= 2 * this.flourish;

    // Follow-through down the spine: each part chases the pose through its own spring.
    if (spawned) {
      this.leanS.snap(out[LEAN]!);
      this.curlS.snap(out[CURL]!);
      this.headS.snap(out[HT]!);
      this.twS.snap(out[TW]!);
    }
    // In the ball (and snapping out of it) the pose is taken straight: no part may lag out of it.
    // A cut is quicker than the spine's springs: half of it goes straight through.
    const direct = Math.max(this.spinW, this.openK * 0.7, 0.5 * this.slashBody);
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
    const czAbs = Math.sqrt(Math.max(0, 1 - (d * BODY.sinYaw) ** 2));
    const cz = czAbs * latSign;
    const look = this.lookS.step(out[HYAW]!, dt);
    // Cutting away from a wall she looks over her shoulder at the blade.
    const headDir = this.wWall > 0.5 && this.slashW > 0.2 ? this.slashFacing * 0.7 : dirT;
    // The head spots: it stays on the target as the body starts round, then whips past it and arrives first.
    const headTurn = Math.cos(TAU * smoothstep(0.22, 0.8, turnF));
    const dh = clamp(this.headYaw.step(headDir, dt) * look * (turnF > 0 && turnF < 1 ? headTurn : 1), -1, 1);
    const armBend = lerp(clamp(d * 1.7, -1, 1), this.slashFacing, this.slashW);
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
      let free = (1 - this.wWall) * (1 - this.spinW);
      let hx2 = tx;
      let hy2 = ty;
      if (side === this.swordSide && this.slashW > 0) {
        // The sword hand rides the cut exactly: no lag.
        const sw = this.slashW;
        const hr = this.handR * (0.5 + 0.5 * this.slashLen);
        hx2 = lerp(tx, sx + Math.cos(this.slashAng) * hr * this.slashFacing, sw);
        hy2 = lerp(ty, sy - Math.sin(this.slashAng) * hr, sw);
        // Going home, the hand drops to the hilt at her hip.
        const hm = this.slashHome * sw;
        hx2 = lerp(hx2, hipX + 3 * d, hm);
        hy2 = lerp(hy2, hipY - 3, hm);
        free *= 1 - sw;
      }
      ik2(
        sx,
        sy,
        hx2 + drag.ox * free,
        hy2 + drag.oy * free,
        BODY.upperArm,
        BODY.foreArm,
        side === this.swordSide ? armBend : bendArm,
        0.12,
      );
      // Smear frames: the sword arm is drawn long along the cut.
      const stretch =
        side === this.swordSide ? 1 + SNAP.arm * sat((this.smear1 - this.smear0) * 2.2) * this.slashW : 1;
      set(j, J_EL_A + side, sx + (ikOut.x - sx) * stretch, sy + (ikOut.y - sy) * stretch);
      set(j, J_HAND_A + side, sx + (ikOut.ex - sx) * stretch, sy + (ikOut.ey - sy) * stretch);
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

    // Under the wings she is a pendulum hung from the collar; the head stays nearly level. The
    // bank rolls her a little with the wing plane.
    this.slashRoll = slashRot * this.slashFacing;
    const sw = this.swing + this.bank * 0.35 * this.wGlide + this.slashRoll + this.hurtRoll;
    {
      const bx = Math.cos(this.slashAng) * this.slashFacing;
      const by = -Math.sin(this.slashAng);
      const cr = Math.cos(this.slashRoll + this.spinResid);
      const sr = Math.sin(this.slashRoll + this.spinResid);
      this.bladeX = bx * cr - by * sr;
      this.bladeY = bx * sr + by * cr;
    }
    if (Math.abs(sw) > 1e-4) {
      const px = j[J_COLLAR * 2]!;
      const py = j[J_COLLAR * 2 + 1]!;
      const cs = Math.cos(sw);
      const ss = Math.sin(sw);
      const ch2 = Math.cos(sw * 0.3);
      const sh2 = Math.sin(sw * 0.3);
      for (let i = 0; i < J_COUNT; i++) {
        if (i === J_ORIGIN || i === J_CENTRE || i === J_COLLAR) continue;
        const headish = i === J_HEAD || i === J_NECK || i === J_BROW_A || i === J_BROW_B;
        const c = headish ? ch2 : cs;
        const sn = headish ? sh2 : ss;
        const rx = j[i * 2]! - px;
        const ry = j[i * 2 + 1]! - py;
        j[i * 2] = px + rx * c - ry * sn;
        j[i * 2 + 1] = py + rx * sn + ry * c;
      }
    }

    // Her centre of mass, and her moment of inertia about it (unit masses; a check on the model).
    let mx = 0;
    let my = 0;
    let mw = 0;
    for (let i = 0; i < MASS.length; i += 2) {
      const k = MASS[i]!;
      const w = MASS[i + 1]!;
      mx += j[k * 2]! * w;
      my += j[k * 2 + 1]! * w;
      mw += w;
    }
    mx /= mw;
    my /= mw;
    let ji = 0;
    for (let i = 0; i < MASS.length; i += 2) {
      const k = MASS[i]!;
      ji += MASS[i + 1]! * ((j[k * 2]! - mx) ** 2 + (j[k * 2 + 1]! - my) ** 2);
    }
    this.jointI = ji / mw;

    // The somersault turns the whole solved figure about that centre, and the centre itself rides
    // the sim's arc (the box centre): the ball spins in place and the limbs fold INTO it.
    const phi = this.spinPhi;
    const ball = this.spinW;
    s[S_BALL] = ball;
    if (phi !== 0 || ball > 1e-4) {
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const sc = 1 - SOMERSAULT.shrink * ball;
      const tx = lerp(mx, cX, ball);
      // A ball rolling on the ground sits on it (the box centre is 40 px up; the ball is ~21 px in radius).
      const ty = lerp(my, cY + SOMERSAULT.rollDrop * this.rollK, ball);
      this.spinCx = tx;
      this.spinCy = ty;
      for (let i = 0; i < J_COUNT; i++) {
        if (i === J_ORIGIN || i === J_CENTRE) continue;
        const rx = (j[i * 2]! - mx) * sc;
        const ry = (j[i * 2 + 1]! - my) * sc;
        j[i * 2] = tx + rx * cp - ry * sp;
        j[i * 2 + 1] = ty + rx * sp + ry * cp;
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
    s[S_CZ] = czAbs;
    s[S_DH] = dh;
    s[S_CZH] = czh;
    s[S_HEADROT] = headAng * dh + phi + sw * 0.3;
    s[S_EYE] = Math.min(1, out[EYE]!) * (1 - blink);
    s[S_LOOKY] = out[LOOKY]! * 0.5 + gy;
    s[S_LOOKX] = gx;
    s[S_WIDE] = clamp(wideK, 0.85, 1.25);
    s[S_LEAN] = lean * d + phi + sw;
    s[S_UPPER] = upper * d + phi + sw;
  }

  /**
   * A slash begins (the sim's `slash` event). The stroke is the combo step's; it starts from
   * wherever the blade and the body are now, so a chained cut grows out of the last one's
   * follow-through and a first cut comes straight from the sheath.
   */
  private slash(dir: SlashDir, step: number, facing: number, p: PlayerView): void {
    const f = facing >= 0 ? 1 : -1;
    // The near arm: the body faces the wall on a wall slide, the slash's side otherwise.
    const side = (p.motion === 'wallSlide' && p.wallDir !== 0 ? p.wallDir : f) >= 0 ? 0 : 1;
    const held = this.slashOn && this.slashW > 0.5 && f === this.slashFacing && side === this.swordSide;
    this.swordSide = side;
    this.fromAng = held ? this.slashAng : SHEATH_ANG * DEG;
    this.fromLen = held ? this.slashLen : 1;
    this.fromHand = held ? this.handR : HAND_WIND;
    if (!held) this.gripIn = 0;
    this.kFrom.set(this.kNow);
    this.stroke = strokeFor(dir, step, Rig.finisherTurn);
    if (this.spinning && !this.spinFree) {
      this.spinFree = true;
      this.spinCut = true;
    }
    this.slashDir = dir;
    this.slashStep = step;
    this.slashFacing = f;
    this.slashT = 0;
    this.slashOn = true;
    this.cutQ = -1;
    // Under spread wings a forward cut goes lower: beneath and ahead of her.
    this.slashTilt = dir === 'fwd' ? -16 * this.soar : 0;
  }

  /**
   * Where the blade's point is at fraction `q` of the current stroke's cut: a unit-major-axis
   * offset from her chest on screen (x right, y down), facing and body roll included. Scale by
   * `stroke.reach` for the edge of the hit area. The trail is laid from this.
   */
  strokeAt(q: number, out: { x: number; y: number }): void {
    this.strokeAtRoll(q, this.slashRoll + this.spinResid, out);
  }

  /** How far the blade's frame is turned on screen right now (air roll + what is left of a somersault), rad. */
  get bladeRoll(): number {
    return this.slashRoll + this.spinResid;
  }

  /**
   * `strokeAt` in a frame turned `roll` rad instead of the live one. The mark of a cut is laid in
   * the frame the cut STARTED in (`bladeRoll` then): out of a somersault the residual turn changes
   * by the frame, and a mark laid in the live frame comes out bent.
   */
  strokeAtRoll(q: number, roll: number, out: { x: number; y: number }): void {
    const st = this.stroke;
    strokeMap(st, st.a0 + (st.a1 - st.a0) * q, this.slashTilt);
    const bx = mapOut.f * this.slashFacing;
    const by = -mapOut.u;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    out.x = bx * cr - by * sr;
    out.y = bx * sr + by * cr;
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
    o[PF] = 0.6 + shift * 0.9;
    o[PU] = 32.1 + breath * 0.4 - Math.abs(shift) * 0.35;
    o[LEAN] = 0.015 + breath * 0.012 + sway * 0.02 - shift * 0.015;
    o[CURL] = -0.03 - breath * 0.035;
    o[HT] = -0.04 + nod * 0.07 + gl * 0.05 - breath * 0.012;
    o[AF] = 6.2;
    o[AU] = 0.1;
    o[AP] = 0.08;
    o[BF] = 3.2;
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
      o.f = hermite(F1, -span * 0.46, CONTACT_F, -span * 0.5, t);
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
    // The bound belongs to speed: starting, stopping and turning she steps low instead of hopping.
    const fl = 0.3 + 0.7 * smoothstep(0.35, 0.95, Math.min(k, this.speedNow));
    o[AU]! *= 0.45 + 0.55 * fl;
    o[BU]! *= 0.45 + 0.55 * fl;
    o[PU] = 28.2 + 11.6 * rise ** 0.66 * fl;
    o[LEAN] = 0.08 + 0.17 * k - 0.03 * c1;
    o[CURL] = 0.05 + 0.02 * Math.cos(TAU * (x - 0.2));
    // The head stays level: it gives back what the spine leans.
    o[HT] = -0.06 - 0.1 * k + 0.012 * Math.cos(TAU * (x - 0.3));
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
