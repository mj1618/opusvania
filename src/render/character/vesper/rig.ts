// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Vesper's skeleton and animation.
 *
 * Same 2.5D idea as the hooded rig (poses authored in a forward frame: f forward, u up, a small
 * sideways s; projected through a continuous turn factor `d`, +1 right .. -1 left, so a
 * turn-around passes through the camera), tuned for a relaxed, floating mover:
 *
 *   - the run is a bound: a long cycle (RUN_CYCLE px, a footfall every half of it), a short planted
 *     stance and a long float between footfalls with the legs in a split, the torso tipped forward
 *     and the head level; a lighter upright trot at low speed. Phase advances with distance and the
 *     stance is linear in phase, so planted feet do not slide;
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
 * A fall without the glide (the player has not found it, or is not using it): after `after` s of
 * falling her wings start to open by themselves, catch the air and are blown shut again, more
 * insistently until `full` s. Each try opens them `base + beat` of the way to the glide's spread.
 * Once she has glided in this run the tries are quieter (`known`).
 */
export const YEARN = {
  after: 14 / 60,
  full: 27 / 60,
  base: 0.3,
  beat: 0.5,
  /** Tries per second at the start and at full insistence. */
  hz0: 2.1,
  hz1: 3.3,
  known: 0.55,
  /** The first glide of a run: the open is a beat of its own, this long (s). */
  first: 0.75,
} as const;
/**
 * Touching down (playtest 6: "her wings flare open on every landing, larger than she is"). A landing is
 * a small catch of air, never a sail: the cape lifts behind her by how far she fell and settles. A fall
 * of `fall0 .. fall1` px maps to 0..1 (to the power `curve`, so a ledge drop still shows it) of `lift`
 * degrees (upper edge; less toward the hem), peaking `peak` s after the touch (the speed of every drop
 * over ~160 px is the same: max fall). Out of a glide the spread draws in at `fold` /s (it held full for 6 frames and
 * stood 170 px wide on the grass) while the wings stay lifted, and the last `reachFold` of the span is let go
 * as the ground comes (`reach`); a fall's half-open tries shut at `shut` /s.
 * A great glint's wing-opening is `flourishGround` of the air one while she stands.
 */
export const LAND = {
  fall0: 48,
  fall1: 640,
  curve: 0.7,
  lift: 26,
  peak: 0.07,
  fold: 24,
  reachFold: 0.4,
  shut: 34,
  flourishGround: 0.4,
  /** ... raised into a V by this many more degrees (half open and flat they read as a bow tie). */
  flourishRaise: 34,
} as const;
/** The wall kick: the turn away from the bark is quick, the pushing leg is left long behind for this long (s). */
export const KICK = { turn: 0.13, push: 0.2 } as const;

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
  /** Whole turns of her body about its own upright axis through the stroke (a pirouette; no stroke uses it now). */
  turn?: number;
  /** Degrees the blade eases back from the follow-through while it is held (the guard relaxing). */
  relax: number;
  /** Fraction of the cut from which its crescent shows (before that the blade is behind or beside her). */
  show: number;
  /** The crescent's thickness at its belly, as a fraction of ITS reach. */
  thick: number;
  /**
   * The crescent's reach (and the blade point's path) as a fraction of `reach`, the sim's: the mark
   * is about one of her heights, smaller than the area that hits.
   */
  size: number;
  /** Where the crescent's belly sits: > 1 = toward its leading end. */
  skew: number;
  /**
   * The crescent's own arc, blade degrees from its tail end to its leading end, when it is not
   * simply `show`..1 of the cut (the up cuts: the tail comes down to her shoulder line).
   */
  mark?: readonly [number, number];
  /** The cape through the cut: + = whipped down and forward under her (a rising cut), - = thrown up behind. */
  sweep?: number;
  /** The antennae's whip as the cut starts, degrees (+ = laid back). */
  whip?: number;
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

// Three silhouettes, three marks. Cut 1 is a DOWNWARD DIAGONAL: the blade comes from high behind her
// head down to low in front, and she drops into it (hips down, spine curled over the blade, the
// off-arm thrown up behind). Cut 2 is the RETURN, its mirror: from low in front up to high ahead,
// and she rises with it (hips up and through, chest open, the off-hand low behind). The finisher is
// a great RISING cleave: coiled low with the blade dragged behind her for three frames, then up
// from under through the front to over her head, and she leaves the ground with it.
//              TW    LEAN   CURL   PF   PU    HT    OF   OU  FA  FB  ROT   WING LIFT LEGS HOP
const CUT1_W = [0.75, -0.2, -0.22, -3, 3.6, -0.1, 7, 1, 0, 0, -0.16, -0.7, 0, 0, 0];
const CUT1_F = [-0.85, 0.36, 0.3, 6, -11, -0.16, -10, 11, 13, -5, 0.26, 1.25, 0, 7, 0];
const CUT2_W = [-0.6, 0.46, 0.2, 6, -9.5, -0.2, -6, 5, 12, -4, 0.16, -0.2, 0, 5, 0];
const CUT2_F = [0.95, -0.2, -0.36, 15, 1.5, -0.14, -14, -11, 19, -14, -0.28, 0.35, 7, 4, 0];
const FIN_W = [1.1, 0.38, 0.26, -7, -13, 0.16, 6, 4, 4, -6, 0.2, -1.2, 0, -3, 0];
const FIN_F = [-0.95, -0.22, -0.42, 9, 3, -0.3, -13, -13, 10, -10, -0.34, 1.5, 0, 8, 14];
const UP1_W = [0.4, -0.08, -0.06, 0, -2.5, -0.2, 3, -3, 0, 0, -0.1, -0.4, 0, 0, 0];
const UP1_F = [-0.4, 0.04, -0.14, 0, 4.2, -0.26, -4, -7, 0, 0, 0.1, 0.5, 4, 3, 0];
const UP2_W = [-0.4, 0.08, 0, 0, -1.5, -0.2, -4, -4, 0, 0, 0.1, 0.2, 0, 3, 0];
const UP2_F = [0.4, -0.12, -0.16, 0, 4, -0.32, 3, -7, 0, 0, -0.12, 0.5, 3.5, 4, 0];
const UP3_W = [0.8, -0.2, 0.14, 0, -10, 0.06, 5, -2, 0, 0, -0.2, -1.2, 0, -3, 0];
const UP3_F = [-0.7, 0.06, -0.18, 0, 4, -0.3, -6, -9, 0, 0, 0.2, 1.1, 3, 8, 11];
const DOWN_W = [0.3, 0.06, 0.1, 0, 1, 0.1, -4, 4, 0, 0, 0, -0.4, 0, 0, 0];
const DOWN_F = [-0.4, 0.2, 0.16, 0, 0, 0.2, -6, 8, 0, 0, 0.18, 1, 0, 0, 0];

/**
 * Shared timing of every cut, frames. The blade crosses its arc in under two frames (the first
 * active frame shows it most of the way round, the second at the end), so the crescent can stand
 * whole in front of her from the first active frame with the blade at its leading end.
 */
const CUT = { cut: 1.7, ease: 2 } as const;

export const STROKES: { fwd: readonly Stroke[]; up: readonly Stroke[]; down: readonly Stroke[] } = {
  fwd: [
    // 1: the cut, a downward diagonal: from high behind her head to low in front. The ellipse's long
    // axis points down and ahead, so the mark is a "\\" that leans away from her.
    {
      a0: 128,
      a1: -50,
      over: 7,
      tilt: -30,
      sq: 0.6,
      reach: 110,
      wind: 1,
      ...CUT,
      hold: 14,
      home: 7,
      relax: 6,
      show: 0.35,
      thick: 0.13,
      size: 0.8,
      skew: 1.25,
      sweep: -0.25,
      whip: 30,
      w: CUT1_W,
      f: CUT1_F,
    },
    // 2: the return, its mirror: from low in front up to high ahead (the long axis points up and
    // ahead: a "/").
    {
      a0: -66,
      a1: 36,
      over: 9,
      tilt: 30,
      sq: 0.6,
      reach: 110,
      wind: 1,
      ...CUT,
      hold: 15,
      home: 7,
      relax: 5,
      show: 0.03,
      thick: 0.13,
      size: 0.8,
      skew: 1.25,
      sweep: 1,
      whip: -30,
      w: CUT2_W,
      f: CUT2_F,
    },
    // 3: the finisher, a great rising cleave: from low behind her, under and up through the front,
    // to high ahead (a rounder, larger ellipse than the cuts': a tall bracket that stands further
    // out, where a creature shoved back by two cuts is).
    {
      a0: -150,
      a1: 55,
      over: 9,
      tilt: 30,
      sq: 0.7,
      reach: 135,
      wind: 3,
      ...CUT,
      hold: 22,
      home: 12,
      relax: 6,
      show: 0.537,
      thick: 0.15,
      size: 0.78,
      skew: 1.3,
      sweep: 1.2,
      whip: -44,
      w: FIN_W,
      f: FIN_F,
    },
  ],
  // Up: the same crescent arcing overhead. 1 goes back to front, 2 front to back, 3 is 1 larger.
  up: [
    {
      a0: 158,
      a1: 58,
      over: 8,
      tilt: 90,
      sq: 0.5,
      reach: 124,
      wind: 1,
      ...CUT,
      hold: 14,
      home: 7,
      relax: 8,
      show: 0.14,
      thick: 0.12,
      size: 0.72,
      skew: 1.2,
      mark: [172, 50],
      whip: 22,
      w: UP1_W,
      f: UP1_F,
    },
    {
      a0: 20,
      a1: 124,
      over: 6,
      tilt: 90,
      sq: 0.5,
      reach: 124,
      wind: 1,
      ...CUT,
      hold: 15,
      home: 7,
      relax: 14,
      show: 0.13,
      thick: 0.12,
      size: 0.72,
      skew: 1.2,
      mark: [8, 130],
      whip: -18,
      w: UP2_W,
      f: UP2_F,
    },
    {
      a0: 176,
      a1: 58,
      over: 10,
      tilt: 90,
      sq: 0.5,
      reach: 144,
      wind: 3,
      ...CUT,
      hold: 22,
      home: 12,
      relax: 8,
      show: 0.24,
      thick: 0.125,
      size: 0.74,
      skew: 1.3,
      mark: [176, 50],
      whip: 30,
      w: UP3_W,
      f: UP3_F,
    },
  ],
  // Down (the pogo): a short tight arc under her feet, as far under them as a pogo usually lands
  // (a falling down-cut meets its target at the far end of the hit area: 60-80 px under her feet).
  // The blade does not reach it; it is the cut's bow wave. Always the same blow (the pogo's rhythm).
  down: [
    {
      a0: -152,
      a1: -36,
      over: 6,
      tilt: -90,
      sq: 0.45,
      reach: 120,
      wind: 1,
      ...CUT,
      hold: 12,
      home: 9,
      relax: 8,
      show: 0.08,
      thick: 0.11,
      size: 0.9,
      skew: 1.1,
      mark: [-140, -40],
      whip: -20,
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
  pop: 0.55,
  /**
   * She goes DARK, never pale: her tones are drained and dimmed in full for `dim`, back over
   * `dimOut`; her eyes are shut for `shut`.
   */
  dim: 0.035,
  dimOut: 0.085,
  shut: 0.12,
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

/**
 * The snap of a cut. The blade overshoots the end of the arc by the stroke's `over` at full speed,
 * springs back `back` x that (plus the stroke's `relax`) and rings out: `settle` frames (decay),
 * `ring` rad per frame. The body's end-of-cut key overshoots by `body` and settles with it. In the
 * smear frames the sword arm is drawn `arm` longer.
 */
export const SNAP = { settle: 3.2, ring: 0.55, back: 0.55, body: 0.28, arm: 0.42 } as const;

/**
 * A cut that lands on a creature: she digs in against the recoil (hips back and low, shoulders kept
 * over the blow, the front foot left out ahead) for `brace` frames after the hitstop lets go.
 * A cut that glances off a braced shell (`enemyBlock`): the blade is thrown up and back over her
 * shoulder (`ang` degrees, reached in `rise` frames, ringing), she is rocked back onto her heels with
 * the front foot off the ground, held to `hold` frames and let go over `out`.
 */
export const BRACE = { frames: 6 } as const;
export const CLANG = { ang: 142, ring: 16, rise: 2.2, hold: 9, out: 9 } as const;

/** Where the blade points when it is home: back and down along the sheath. Hand reach from the shoulder, px. */
export const SHEATH_ANG = -152;
const HAND_WIND = 10.5;
const HAND_CUT = 16.8;
const DEG = Math.PI / 180;

/** The stroke for a slash direction and combo step (a down slash is always the one blow). */
export function strokeFor(dir: SlashDir, step: number): Stroke {
  const list = STROKES[dir];
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
  neck: 6.5,
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

/** Stopping out of a run: the braking step's reach (px), toe lift (rad), sink (px), lean back (rad), and how fast it lets go (1/s). */
const STOP = { foot: 7, toe: 0.3, sink: 4, lean: 0.16, decay: 7.5 } as const;
/** Run cycle in world px: a footfall every 144 px (a bound of nearly two body heights). */
export const RUN_CYCLE = 288;
/** Fraction of the cycle a foot is planted: the rest is float. */
const STANCE = 0.165;
/** Where the ball of the foot lands ahead of her, px; it leaves the ground `RUN_CYCLE x STANCE` behind that. */
const CONTACT_F = 25;
const TOE_OFF_F = CONTACT_F - RUN_CYCLE * STANCE;
/** Ball of the foot to the toe tip, px (the toe joint is drawn this far ahead of the ball). */
const TOE = 2.1;
/**
 * The swing of one leg, toe-off to contact, as keys: time 0..1, ball forward, ball up, foot pitch
 * (0 = flat, 1.57 = toes straight down, more = toes trailing behind the ankle).
 *
 * The bound (full speed): the leg that pushed off is left long behind her with the toes pointed
 * (the split of the float), folds up under the hip as the other foot lands (the passing pose),
 * reaches far ahead through the next float and comes down and back onto the toes.
 * The trot (low speed: starting, stopping, short taps): the same path, small and close to the ground.
 */
const SWING_BOUND = [
  0,
  TOE_OFF_F,
  0,
  1.15,
  0.22,
  -37,
  15,
  2.35,
  0.5,
  -3,
  19,
  1.75,
  0.78,
  33,
  17,
  0.8,
  1,
  CONTACT_F,
  0,
  0.3,
];
const SWING_TROT = [
  0,
  TOE_OFF_F,
  0,
  1.15,
  0.22,
  -29,
  6,
  1.75,
  0.5,
  -4,
  10,
  1.2,
  0.78,
  25,
  6.5,
  0.45,
  1,
  CONTACT_F,
  0,
  0.3,
];
/** One channel (1 forward, 2 up, 3 pitch) of a swing table at t, with the slopes it leaves and arrives at. */
function swingAt(k: readonly number[], ch: number, t: number, m0: number, m1: number): number {
  const n = k.length / 4;
  let i = 0;
  while (i < n - 2 && t > k[(i + 1) * 4]!) i++;
  const t0 = k[i * 4]!;
  const t1 = k[(i + 1) * 4]!;
  const p0 = k[i * 4 + ch]!;
  const p1 = k[(i + 1) * 4 + ch]!;
  const a = i === 0 ? m0 : (p1 - k[(i - 1) * 4 + ch]!) / (t1 - k[(i - 1) * 4]!);
  const b = i === n - 2 ? m1 : (k[(i + 2) * 4 + ch]! - p0) / (k[(i + 2) * 4]! - t0);
  const dt = t1 - t0;
  return hermite(p0, a * dt, p1, b * dt, (t - t0) / dt);
}

// Channel order: PF PU LEAN CURL HT | AF AU AP | BF BU BP | HAF HAU HBF HBU | TW EYE LOOKY HYAW
// Air: the same long line as the run. Rising she is stretched into the jump (chest open, chin up,
// lead knee lifted, the other leg left long behind with the toes pointed, arms trailing low);
// at the top she opens and floats (legs apart, arms out); falling the legs reach down for the
// ground, toes first, and the arms lift for balance under the raised cape.
const RISE = pose([
  0, 34, 0.2, -0.16, -0.24, 7, 9.5, 1.0, -10.5, -3, 1.7, -7, -11.5, -10.5, -8, 0.14, 1, -0.25, 1,
]);
const APEXP = pose([
  0, 32, 0.06, -0.05, -0.04, 8.5, 11, 0.75, -9, 5.5, 1.5, -9.5, -6.5, 7, -7.5, 0.08, 1, 0, 1,
]);
const FALL = pose([
  -1, 33.5, -0.12, 0.0, 0.16, 4.5, -1.5, 1.2, -5.5, 2.5, 1.38, -10.5, -2.5, 9, -3.5, 0, 1, 0.4, 1,
]);
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
  3.5, 27.6, 0.14, 0.06, 0.12, 18.6, 15.5, -1.15, 18.6, -0.5, -1.25, 11.5, 9.5, 9, -3.5, 0.2, 1, 0.3, 0.5,
]);
const DASH = pose([-12, 31, 1.2, 0.06, -0.1, -36, 27, 1.45, -34, 33, 1.5, -14, -1, -13, 2.5, 0, 0.72, 0, 1]);
const SKID = pose([5, 24.5, 0.42, 0.1, -0.12, 10, 0, 0, -16, 0, 0.5, 5, -11, -9, -8, 0.2, 0.95, 0, 1]);

// --- Acting at the lanterns and the heart (memory/goal.md). Hands here are NEAR hand, then FAR hand.
// Channel order: PF PU LEAN CURL HT | AF AU AP | BF BU BP | near F U, far F U | TW EYE LOOKY HYAW
/** Kindling: a soft half-kneel, the near hand lifted toward the glass, the other on her chest, chin up to it. */
const KINDLE = pose([
  2.4, 23.5, 0.14, 0.1, -0.34, 9.5, 0, 0, -10.5, 0.4, 1.25, 14.5, -4.2, 3.4, -6.4, 0.1, 0.92, -0.4, 1,
]);
/** Resting: sat back on her heels under the lantern, hands in her lap, head bowed. */
const REST = pose([
  -2, 16, 0.08, 0.2, 0.16, -8.5, 1.2, 1.5, -12.5, 1.2, 1.5, 4.6, -10.6, 3.4, -9.8, 0, 0.3, 0.35, 0.85,
]);
/** Standing by a lit lantern: both hands held up to the glass. */
const WARM = pose([
  1.5, 32.3, 0.06, 0.05, -0.1, 7.4, 0.1, 0.2, -1.6, 0, 0, 9.4, 0.6, 8.2, -1.6, 0.04, 0.8, -0.3, 1,
]);
/** Refused: the hand comes back empty and she looks down into it. */
const EMPTY = pose([
  0.6, 32.2, 0.03, 0.22, 0.42, 7.4, 0.1, 0.2, -1.6, 0, 0, 6.2, -5.4, -1.6, -14.6, 0.04, 0.7, 0.7, 0.9,
]);
/** The sleeping heart: a hand laid on the bud, head inclined toward it, eyes nearly shut: listening. */
const LISTEN = pose([
  2.4, 29.5, 0.2, 0.12, 0.2, 7.4, 0.1, 0.2, -3, 0, 0.1, 10.6, -6.6, -2, -14.4, 0.1, 0.32, 0.4, 0.45,
]);
/** The ending: standing tall in the open flower, chest open, face lifted to the carving above. */
const UPLIFT = pose([
  0, 33.8, -0.03, -0.16, -0.46, 3.2, 0, 0, -3.2, 0, 0, 4.2, -16.2, -3.6, -16.4, 0, 1, -0.7, 1.4,
]);
/** The ember comes to her: both hands lifted to meet it, chin up, a little taller. (Hands are aimed at it in `actPose`.) */
const REACH = pose([
  1.2, 33.7, 0.03, -0.1, -0.2, 7.4, 0.1, 0.25, -1.6, 0, 0.1, 9, 2, 6.6, 0, 0.04, 1, -0.4, 1,
]);
/** Settling it at her shoulder: the near hand beside it, the other lowering, her head half turned and her eyes back on it (turned further, her face comes round under the coal and it sits on her eyes). */
const SHOULDER = pose([
  0.6, 32.8, -0.02, -0.05, -0.1, 7.4, 0.1, 0.2, -1.6, 0, 0, -3.6, 3.8, 2.2, -9.6, 0.07, 0.86, -0.25, 0.62,
]);
/** The ember offered up to the summit lantern: standing, both hands lifted toward the glass, eyes on it. (Her arms are 17 px and her head 20: face height, out in front, is as high as her hands go.) */
const GIVE = pose([
  1.8, 33.9, 0.05, -0.13, -0.36, 7.4, 0.1, 0.3, -1.6, 0, 0.16, 11, 10, 9, 7.4, 0.04, 1, -0.6, 1,
]);
/** Waiting in the waking heart: held, tall and open, hands a little away from her sides, eyes on the light. */
const WAIT = pose([
  0.4, 33.5, -0.02, -0.1, -0.15, 6.6, 0.1, 0.15, -1.8, 0, 0, 5.4, -13, -3.6, -14, 0.05, 0.95, -0.35, 1.1,
]);
/** The prologue: a glint held up before her face in the near hand, the other at her chest, eyes on it. */
const HOLD = pose([
  1, 33.2, 0.04, 0.08, 0.16, 7.4, 0.1, 0.2, -1.6, 0, 0.1, 9.2, 3.2, 2.6, -7.8, 0.04, 0.85, 0.45, 0.62,
]);
/** ... and then looking past it, out ahead: chin up, head turned on, the hand lowered a little. */
const PAST = pose([
  1, 33.6, 0.02, -0.04, -0.16, 7.4, 0.1, 0.2, -1.6, 0, 0.1, 8.4, 0.6, 2.6, -7.8, 0.04, 1, -0.25, 1.15,
]);
/** Acting timings (seconds unless said) and amounts. */
export const ACT = {
  /** After the lantern catches she stays down, looking up at it, this long before she rises. */
  catchHold: 0.45,
  /** Refuse: the reach, then the look into the empty hand, then gone. */
  refuse: 1.9,
  /** Idle by a lit lantern: seconds before she turns to it, and how long her hands stay up each time. */
  warmAfter: 2.6,
  warmHands: 6.5,
  warmEvery: 15,
  /** The sleeping heart: how long the hand stays on the bud; it only happens within `touchPx` of its centre. */
  touch: 2.3,
  touchPx: 64,
  /** The waking heart: the look toward it is held this long (it starts `wakeDelay` after the catch). */
  wake: 1.9,
  wakeDelay: 0.55,
  /** The ending: how far she turns toward us (1 = side on, 0 = facing us), when the wings start to unfurl and how long they take, when the one slow wing beat comes and how long it is. */
  endTurn: 0.6,
  /** ... and how far the spread wings are raised above the glide's shape, degrees at the leading edge. */
  endRaise: 13,
  unfurlAt: 0.5,
  unfurl: 2.4,
  beatAt: 2.55,
  beatLen: 1.15,
  /** A dormant lantern or lamp she comes near: her head, eyes and antennae go to it for this long (it works at a run). */
  notice: 1.3,
  /**
   * A lantern catches with the ember hanging near (`showPx`): her head and antennae follow the moths
   * up to it. The look comes in over `showIn` (two times: start, full; she has risen from the kneel
   * and the flight leaves the glass about 1.6 s after the catch, measured), travels from the glass to
   * the ember over `showRise` (the flight is out of the top of the picture ~2.4 s after the catch),
   * and lets go by `show`.
   */
  show: 4.3,
  showIn: [1.15, 1.7],
  showRise: [1.45, 2.5],
  showPx: 900,
  /** Taking the ember: after it is in her hands, when the hand that settles it at her shoulder comes and goes. */
  settle: [0.04, 0.4, 1.05, 1.75],
  /** The summit lantern without the ember: the look into the empty glass (in, full, out), then the head turned to where the ember is (in, full, out, gone). */
  keyGlass: [0.22, 0.95, 1.4],
  keyTurn: [1.05, 1.5, 2.5, 3.1],
  /** With it: both hands lift it up as the coal leaves for the bulb (the goal layer's arc is 0.42 s from the channel's start): in by, held to, down by. She kneels as they come down. */
  give: [0.13, 0.36, 0.62],
  /** ... and stays down this much longer than `catchHold` after that catch. */
  giveHold: 0.3,
  /** Carrying the ember, standing: a glance back at it about every `carryEvery` s, `carryLook` s long. */
  carryEvery: 5.9,
  carryLook: 1.5,
  /** Waiting in the heart: her wings open this far (of the glide's spread) over `waitOpenIn` s; she is "at" the heart within `waitPx` of its centre. */
  waitOpen: 0.2,
  /** ... lifted this many degrees over the glide's shape (at 0.3 and level they lay flat at her hips: a bow tie). */
  waitRaise: 18,
  waitOpenIn: 2.6,
  waitPx: 84,
  /** The offering: her hands stay out this long after the last batch has left them. */
  offerHold: 0.3,
  /** A tier of the grove wakes: the look toward it. */
  grove: 1.5,
} as const;

/**
 * What the scene's goal asks of her this frame (set by the owner before `update`, from the goal
 * state and the scene: the rig itself only sees the player and the events).
 */
export interface Cue {
  /** She stands at a lantern (on its ground, within its reach): the glass's x relative to her centre and its height above her feet, px. */
  lamp: boolean;
  /** ... and its foot's x relative to her centre (the light runs to the foot and up the stem: she faces that). */
  lampFootDx: number;
  lampDx: number;
  lampUp: number;
  lampLit: boolean;
  /** Channel progress 0..1 while she kindles, -1 otherwise. */
  kindle: number;
  /** Rest progress 0..1 while she rests hurt at a lit lantern, -1 otherwise. */
  rest: number;
  /** The heart: its centre relative to her feet centre, px (dy + = below her). */
  heart: boolean;
  heartDx: number;
  heartDy: number;
  /** The ending: control is taken; the hold is over. */
  gathered: boolean;
  ended: boolean;
  /**
   * The ember (the great glint a lantern wants, memory/goal.md): its pickup id ('' = none), whether
   * it still hangs where it hung, and where that is relative to her head (px, dy + = below her).
   */
  emberId: string;
  emberHangs: boolean;
  emberDx: number;
  emberDy: number;
  /** She carries it: it is at her shoulder, its lantern is dark and not being kindled. */
  carry: boolean;
  /** The light she stands at is the one that wants the ember. */
  lampKeyed: boolean;
  /** A channel is running on a light she is not at (she is on its leash): its glass relative to her head, px. */
  away: boolean;
  awayDx: number;
  awayDy: number;
  /** She stands in the woken heart before it is ready for her (`heartWait` .. `heartReady`). */
  heartWait: boolean;
  /**
   * The prologue (render/prologue, through `vesperLink.cine`): 0..1 she holds a glint up to her
   * face (she has no mouth: she can only hold it), and 0..1 she looks past it, out ahead of her.
   */
  hold: number;
  look: number;
  /** 0..1 she shakes out her wings like a cape (the prologue, out of her cocoon). */
  shake: number;
}

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
  /** A slash connected this frame (`blocked`: it glanced off a braced shell; no damage). */
  slashHit: boolean;
  blocked: boolean;
  /** She was hurt this frame; her last light went out; she re-formed. */
  hurt: boolean;
  fade: boolean;
  reform: boolean;
  /** The lantern she was kindling caught this frame. */
  kindled: boolean;
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
    blocked: false,
    hurt: false,
    fade: false,
    reform: false,
    kindled: false,
  };
  /** Set by the owner before `update`: the goal's cues (lanterns, heart, ending). */
  readonly cue: Cue = {
    lamp: false,
    lampFootDx: 0,
    lampDx: 0,
    lampUp: 66,
    lampLit: false,
    kindle: -1,
    rest: -1,
    heart: false,
    heartDx: 0,
    heartDy: 0,
    gathered: false,
    ended: false,
    emberId: '',
    emberHangs: false,
    emberDx: 0,
    emberDy: 0,
    carry: false,
    lampKeyed: false,
    away: false,
    awayDx: 0,
    awayDy: 0,
    heartWait: false,
    hold: 0,
    look: 0,
    shake: 0,
  };
  /** Acting weights 0..1: kindling, sat resting, hands to a lit lantern, the hand on the sleeping heart, the ending. */
  kindleW = 0;
  restW = 0;
  warmW = 0;
  touchW = 0;
  endW = 0;
  /** What the wings read: + = they relax open like a cloak settling, - = they fold round her like a blanket; a shiver 0..1. */
  cloak = 0;
  shiver = 0;
  /** Degrees the spread wings are raised above the glide's shape (the ending). */
  raise = 0;
  /** Degrees added to the antennae's lift: - = they tip forward and up (toward a light), + = they droop. */
  antLift = 0;
  /** ... and radians of bend per segment: - = the tips bow forward over her brow, + = they curl down behind. */
  antCurl = 0;
  /** Her eyes' and lanterns' light: 1 = as usual; dimmer as glints leave her, brighter as a lantern catches and at the ending. */
  eyeLit = 1;
  /** 0..1: the light leaves from her open near hand (else her chest); which hand that is (0 = A, 1 = B). */
  offerK = 0;
  offerSide = 0;
  /** Seconds into the ending's pose (0 until she stands at the heart's centre). */
  endT = 0;
  /** The lantern she has just noticed: seconds since, where its glass is, and that relative to her head now. */
  private noticeT = 9;
  private noticeX = 0;
  private noticeY = 0;
  private noticeDx = 0;
  private noticeDy = 0;
  /** 0..1: how much of the look is in play (the head's turn quickens with it). */
  noticeK = 0;
  /**
   * The ember. 0..1: she carries it (an arm kept in, wings held closer, a glance back at it now and
   * then); read by the wings. And the weights of reaching for it as it comes and of the wait in the heart.
   */
  guard = 0;
  reachW = 0;
  waitW = 0;
  giveW = 0;
  /** The wings' spread the wait in the heart has opened (it is handed on to the ending's unfurl). */
  private waitOpen = 0;
  private waitT = 0;
  private taking = false;
  private takeT = 9;
  private takeLen = 0.9;
  private recvT = 9;
  private showT = 9;
  private showX0 = 0;
  private showY0 = 0;
  private showX1 = 0;
  private showY1 = 0;
  private keyRefT = 9;
  private keyRefX = 0;
  private keyRefY = 0;
  private liftT = 9;
  private wasKindling = false;
  private offerT = 9;
  private readonly groveT = [9, 9, 9];
  private awayW = 0;
  private awayHold = 0;
  private awayX = 0;
  private awayY = 0;
  private catchT = 9;
  private refuseT = 9;
  private healT = 9;
  private touchT = 9;
  private touchArmed = false;
  private wakeT = 9;
  private warmT = 0;
  private seated = false;
  private endOn = false;
  private wakeDir = 0;
  private wakePitch = 0;
  private rested = false;
  /** Where her eyes are held while she acts (forward +, down +) and how firmly 0..1. */
  private gazeAX = 0;
  private gazeAY = 0;
  private gazeW = 0;
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
  /** What the cape and the antennae read through a cut (see `Stroke.sweep`, `Stroke.whip`). */
  slashSweep = 0;
  slashWhip = 0;
  /** 0..1.4: braced against the recoil of a blow that landed. */
  braceK = 0;
  /** Frames since a cut glanced off (stands still in hitstop); 0..1 how far she is thrown back by it. */
  private clangT = 99;
  clangK = 0;
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
  get hurtDim(): number {
    return this.fading ? 0 : 1 - smoothstep(HURT.dim, HURT.dim + HURT.dimOut, this.hurtT);
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
  /**
   * Falling without gliding: 0..1 how insistently the wings try to open, and the phase of the tries
   * (one per unit; each wing reads it a little apart). `firstOpen` 0..1: the first glide of a run opens as a beat.
   */
  yearn = 0;
  yearnPh = 0;
  /** The cape's catch of air on a landing (0..1 envelope, `LAND`), and its strength and clock. */
  landCatch = 0;
  private landAmp = 0;
  private landT = 9;
  firstOpen = 0;
  private fallT = 0;
  private firstT = 9;
  private glided = false;
  /** She has glided in this airtime: letting go was the player's choice, the wings do not ask again until she lands. */
  private glidedAir = false;
  /** Wall kick: seconds since; the wall's wing lift follows `wallSoft` (slower in than `wWall`). */
  private kickT = 9;
  wallSoft = 0;
  /** Set by the owner before `update`: px of clear air to the solid ahead of her at body height (Infinity if none). */
  wallAhead = Number.POSITIVE_INFINITY;
  private catchReach = 0;
  private lastWRun = 0;
  private stepK = 0;
  private pogo = 0;
  private lastBeatU = 0;
  private soarOut = 8;
  private readonly catchS = new Spring(0, 13, 0.5);
  private readonly swingS = new Spring(0, 7.6, 0.3);
  private readonly bankS = new Spring(0, 8.5, 0.75);
  private readonly gAxS = new Spring(0, 12, 1);
  private lastVy = 0;
  private lastStep = 0;
  private stopK = 0;
  /** 0 = the trot .. 1 = the full bound (eased: see `update`). */
  private boundK = 0;
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
    sig.blocked = false;
    sig.hurt = false;
    sig.fade = false;
    sig.reform = false;
    sig.kindled = false;
    let startSpin = false;
    let glideKick = 0;

    for (const e of events) {
      switch (e.type) {
        case 'spawn':
          sig.spawned = true;
          // A new run (not a re-form): she has not shown the glide yet.
          if (!sig.reform) this.glided = false;
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
          this.crouch.v += clamp(e.vy * 11, 26, 230);
          this.landT = 0;
          this.landAmp = sat((e.fallPx - LAND.fall0) / (LAND.fall1 - LAND.fall0)) ** LAND.curve;
          break;
        case 'glideStart': {
          // The wings snap open and catch the air: how hard depends on the fall they have to stop.
          const vy = clamp(e.vy, 0, 26);
          this.catchS.v += GLIDE.catch0 + GLIDE.catchVy * vy;
          glideKick = GLIDE.swing0 + GLIDE.swingVy * vy;
          this.diving = false;
          this.glidedAir = true;
          // The first glide of a run is a beat: the wings snap wide and fill, she is lifted, eyes wide.
          if (!this.glided) {
            this.glided = true;
            this.firstT = 0;
            this.catchS.v += 1.6;
            this.wide.v += 3;
            sig.beat = true;
          }
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
          // A creature pushes back (hitstop 4 or 7; a pod's 2-3 is a nudge).
          if (!e.pogo && e.dir === 'fwd') this.braceK = e.hitstop >= 7 ? 1.4 : e.hitstop >= 4 ? 1 : 0.4;
          break;
        case 'enemyBlock':
          // The cut glanced off a braced shell: the blade is caught in the cut all the same.
          this.hitT = 0;
          this.hitX = e.hitX;
          this.hitY = e.hitY;
          this.hitPower = 0;
          sig.slashHit = true;
          sig.blocked = true;
          this.squash.v -= 1.6;
          this.clangT = 0;
          this.braceK = 0;
          break;
        case 'headBump':
          this.squash.v -= 3;
          break;
        case 'pickup': {
          // The ember is received, not won: no flourish, hardly a lift (the acting below has the gesture).
          const ember = e.id !== '' && e.id === this.cue.emberId;
          // A small delighted lift; calmer when she is gathering many in a row.
          const k = ember ? 0.22 : e.kind === 'great' ? 1 : 0.7 / (1 + e.combo * 0.5);
          this.joy = Math.max(this.joy, k);
          sig.combo = Math.max(sig.combo, e.combo);
          // The first of a run puts a tiny skip in her stride.
          if (e.combo === 0 && e.kind !== 'great' && p.grounded) this.crouch.v -= 34;
          this.wide.v += 2.2 * k;
          if (ember) {
            this.taking = false;
            this.recvT = 0;
          } else if (e.kind === 'great') this.flourishT = 0;
          if (e.kind === 'great') sig.great = true;
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
        case 'lanternNotice':
        case 'lampNotice':
          // A dormant light as she comes near: a look (its glass hangs about head height over the foot).
          this.noticeT = 0;
          this.noticeX = e.x;
          this.noticeY = e.y - 62;
          this.wide.v += 1.5;
          break;
        case 'pickupWake':
          // The ember has let go of its cup and is coming to her.
          if (e.id !== '' && e.id === this.cue.emberId) {
            this.taking = true;
            this.takeT = 0;
            this.takeLen = Math.max(0.2, e.frames / 60);
            this.wide.v += 1.2;
          }
          break;
        case 'lampKindle':
        case 'lanternKindle':
          if (e.away) {
            // It caught behind her (the channel ran on while she walked on): a look back at it, no kneel.
            this.awayHold = 0.85;
            this.wide.v += 1.6;
          } else {
            // It catches: she looks up into it, eyes wide.
            this.catchT = 0;
            this.wide.v += 2.4;
          }
          sig.kindled = true;
          // The moths rise from it to the ember that hangs near: her head goes up with them.
          if (e.type === 'lanternKindle' && this.cue.emberHangs) {
            const ex = p.cx + this.cue.emberDx;
            const ey = p.feetY - 62 + this.cue.emberDy;
            if (Math.hypot(ex - e.x, ey - (e.y - 66)) < ACT.showPx) {
              this.showT = 0;
              this.showX0 = e.x;
              this.showY0 = e.y - 66;
              this.showX1 = ex;
              this.showY1 = ey;
            }
          }
          break;
        case 'lampRefuse':
        case 'lanternRefuse':
          // The summit lantern wants the ember: no empty hand, a look into the glass and then to where it is.
          if (e.type === 'lanternRefuse' && e.key) {
            this.keyRefT = 0;
            this.keyRefX = e.key.x;
            this.keyRefY = e.key.y;
          } else this.refuseT = 0;
          break;
        case 'heartOffer':
          this.offerT = 0;
          break;
        case 'groveWake':
          this.groveT[e.part === 'flowers' ? 0 : e.part === 'paths' ? 1 : 2] = 0;
          break;
        case 'lampRest':
        case 'lanternRest':
          this.healT = 0;
          this.rested = true;
          this.wide.v += 1.2;
          break;
        case 'heartSleep':
          this.touchArmed = true;
          break;
        case 'heartWake':
          this.wakeT = -ACT.wakeDelay;
          this.wakeDir = e.x >= p.cx ? 1 : -1;
          this.wakePitch = clamp(Math.atan2(e.y - p.feetY, Math.abs(e.x - p.cx)) * 0.5, -0.3, 0.3);
          break;
        default:
          break;
      }
    }
    if (Math.abs(p.cx - this.lastCx) > 160 || Math.abs(p.feetY - this.lastCy) > 160) sig.spawned = true;

    let dirT = p.motion === 'wallSlide' && p.wallDir !== 0 ? p.wallDir : p.facing;
    const spawned = sig.spawned;
    if (spawned) {
      this.kindleW = this.restW = this.warmW = this.touchW = this.endW = 0;
      this.catchT = this.refuseT = this.healT = this.touchT = this.wakeT = 9;
      this.yearn = this.firstOpen = this.fallT = this.catchReach = this.stepK = 0;
      this.firstT = this.kickT = 9;
      this.wallSoft = 0;
      this.lastWRun = 0;
      this.warmT = 0;
      this.endT = 0;
      this.seated = false;
      this.endOn = false;
      this.touchArmed = false;
      this.rested = false;
      this.cloak = this.shiver = this.antLift = this.antCurl = 0;
      this.eyeLit = 1;
      this.guard = this.cue.carry ? 1 : 0;
      this.reachW = this.waitW = this.giveW = this.waitOpen = this.waitT = this.awayW = this.awayHold = 0;
      this.taking = false;
      this.takeT = this.recvT = this.showT = this.keyRefT = this.liftT = this.offerT = 9;
      this.groveT.fill(9);
      this.wasKindling = this.cue.kindle >= 0;
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
      this.landT = 9;
      this.landCatch = 0;
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
      this.stopK = 0;
      this.boundK = 0;
      this.lastCx = p.cx;
      this.lastVx = p.vx;
      this.phase = 0.3;
      this.frame.s[S_GROUND] = p.grounded ? 1 : 0;
    }
    const dx = p.cx - this.lastCx;
    this.lastCx = p.cx;
    this.lastCy = p.feetY;

    // --- Acting: what the lanterns and the heart ask of her. Everything here is an overlay on the
    // stand (it scales with `wIdle` and lets go for a slash, a blow or a step), never a taken control.
    const cue = this.cue;
    this.catchT += dt;
    this.refuseT += dt;
    this.healT += dt;
    this.touchT += dt;
    this.wakeT += dt;
    // A teleport does not carry a look with it.
    if (spawned && !events.some((e) => e.type === 'lanternNotice' || e.type === 'lampNotice'))
      this.noticeT = 9;
    this.noticeT += dt;
    this.kickT += dt;
    this.firstT += dt;
    this.noticeDx = this.noticeX - p.cx;
    this.noticeDy = this.noticeY - (p.feetY - 62);
    const calm =
      p.grounded &&
      !this.slashOn &&
      !this.fading &&
      this.reformK <= 0 &&
      this.hurtT > HURT.hold &&
      p.motion !== 'dash' &&
      p.motion !== 'skid';
    const quiet = calm && Math.abs(p.vx) < 0.4;
    // The ember: taking it, carrying it, lifting it to the lantern that wants it.
    this.takeT += dt;
    this.recvT += dt;
    this.showT += dt;
    this.keyRefT += dt;
    this.liftT += dt;
    this.offerT += dt;
    for (let i = 0; i < 3; i++) this.groveT[i]! += dt;
    if (this.taking && this.takeT > this.takeLen + 0.5) this.taking = false;
    {
      const reachT = this.taking ? smoothstep(0.06, 0.45, this.takeT) : 0;
      this.reachW += (reachT - this.reachW) * approach(reachT > this.reachW ? 12 : 5.5, dt);
      this.guard += ((cue.carry ? 1 : 0) - this.guard) * approach(cue.carry ? 2.2 : 4, dt);
      // The channel starts at the lantern that wanted it: the coal leaves her shoulder now.
      const kindling = cue.kindle >= 0;
      if (kindling && !this.wasKindling && cue.lampKeyed && this.guard > 0.3) this.liftT = 0;
      this.wasKindling = kindling;
      // A channel that runs on behind her: where its glass is, and a moment longer once it has caught.
      if (cue.away) {
        this.awayX = p.cx + cue.awayDx;
        this.awayY = p.feetY - 62 + cue.awayDy;
      }
      this.awayHold = Math.max(0, this.awayHold - dt);
      const awayT = cue.away || this.awayHold > 0 ? 1 : 0;
      this.awayW += (awayT - this.awayW) * approach(awayT ? 9 : 3.5, dt);
    }
    // Waiting in the woken heart: held in its light until it is ready for her.
    const waiting =
      cue.heartWait && quiet && cue.heart && Math.abs(cue.heartDx) < ACT.waitPx && p.inputX === 0;
    if (waiting) this.waitT += dt;
    else if (!cue.gathered) this.waitT = 0;
    {
      // (it carries over into the ending: the wings she has opened stay open and the unfurl goes on from there)
      const on = waiting || (cue.gathered && this.waitT > 0 && this.endT < 0.7);
      this.waitW += ((on ? 1 : 0) - this.waitW) * approach(on ? 3 : 2.4, dt);
      const openT = waiting
        ? ACT.waitOpen * smoothstep(0.15, ACT.waitOpenIn, this.waitT)
        : cue.gathered
          ? this.waitOpen
          : 0;
      this.waitOpen += (openT - this.waitOpen) * approach(openT > this.waitOpen ? 5 : 2.2, dt);
    }
    const kindleT =
      calm && (cue.kindle >= 0 || this.catchT < ACT.catchHold + (this.liftT < 1.4 ? ACT.giveHold : 0))
        ? 1
        : 0;
    this.kindleW += (kindleT - this.kindleW) * approach(kindleT > this.kindleW ? 11 : 5, dt);
    // Resting: she sits while the light fills her, and stays sat until the player moves her.
    if (cue.rest >= 0 && quiet) this.seated = true;
    if (!quiet || !cue.lamp || !cue.lampLit || p.inputX !== 0) this.seated = false;
    this.restW += ((this.seated ? 1 : 0) - this.restW) * approach(this.seated ? 5.5 : 6.5, dt);
    // Standing a while by a lit lantern she turns to it and holds her hands up to the glass.
    const company =
      quiet && cue.lamp && cue.lampLit && !this.seated && p.inputX === 0 && kindleT === 0 && this.wIdle > 0.9;
    this.warmT = company ? this.warmT + dt : 0;
    const warmOn = this.warmT > ACT.warmAfter;
    this.warmW += ((warmOn ? 1 : 0) - this.warmW) * approach(warmOn ? 3.2 : 7, dt);
    // The sleeping heart: once she stands by the bud she lays a hand on it.
    if (this.touchArmed && quiet && cue.heart && Math.abs(cue.heartDx) < ACT.touchPx && this.wIdle > 0.7) {
      this.touchArmed = false;
      this.touchT = 0;
    }
    if (!cue.heart || Math.abs(cue.heartDx) > 320) this.touchArmed = false;
    const touchT =
      quiet && this.touchT < ACT.touch
        ? smoothstep(0, 0.4, this.touchT) * (1 - smoothstep(ACT.touch - 0.55, ACT.touch, this.touchT))
        : 0;
    this.touchW += (touchT - this.touchW) * approach(9, dt);
    // The ending: once the sim has walked her to the centre.
    if (cue.gathered && quiet) this.endOn = true;
    if (!cue.gathered) this.endOn = false;
    if (this.endOn) {
      this.endT += dt;
      // A state that is already ended (a jump, a reload into it): no ceremony.
      if (cue.ended && this.endT < ACT.beatAt + ACT.beatLen) this.endT = ACT.beatAt + ACT.beatLen;
    } else this.endT = 0;
    this.endW += ((this.endOn ? 1 : 0) - this.endW) * approach(this.endOn ? 2.2 : 6, dt);
    {
      const lampAt = Math.abs(cue.lampFootDx) > 7 ? cue.lampFootDx : cue.lampDx;
      const lampDir = lampAt > 4 ? 1 : lampAt < -4 ? -1 : 0;
      const toLamp =
        kindleT > 0 ||
        this.seated ||
        warmOn ||
        ((this.refuseT < ACT.refuse - 0.5 || this.keyRefT < ACT.keyTurn[0]) && quiet && cue.lamp);
      if (toLamp && lampDir !== 0) dirT = lampDir;
      // The lantern wanted the ember: she turns from the empty glass to where it is (head first), and back.
      if (this.keyRefT > ACT.keyTurn[0] - 0.1 && this.keyRefT < ACT.keyTurn[2] && quiet && kindleT === 0) {
        const kx = this.keyRefX - p.cx;
        if (Math.abs(kx) > 30) dirT = kx > 0 ? 1 : -1;
      }
      // She turns to the ember as it comes to her, and to the heart while she waits in it.
      if (this.taking && quiet && Math.abs(cue.emberDx) > 6) dirT = cue.emberDx > 0 ? 1 : -1;
      if (waiting && Math.abs(cue.heartDx) > 5) dirT = cue.heartDx > 0 ? 1 : -1;
      if (touchT > 0 && cue.heartDx !== 0) dirT = cue.heartDx > 0 ? 1 : -1;
      // At the ending she turns most of the way to face us, under wings that open to either side.
      if (this.endOn) dirT *= lerp(1, ACT.endTurn, smoothstep(0.1, 1.5, this.endT));
    }

    // --- Turn. Under the wings she comes round slowly: the head first, then the body, in about
    // the time her drift takes to reverse.
    // ... and off a wall kick quickly: she is round and stretched away from the bark within three frames.
    const kickTurn = 1 - smoothstep(0, KICK.turn, this.kickT);
    this.yaw.omega = lerp(lerp(lerp(26, 8.2, this.wGlide), 7, this.endW), 62, kickTurn);
    this.yaw.zeta = lerp(lerp(lerp(0.78, 0.95, this.wGlide), 1, this.endW), 0.9, kickTurn);
    this.headYaw.omega = lerp(lerp(lerp(40, 15, this.wGlide), 9, this.endW), 80, kickTurn);
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
    this.wallSoft += ((wall ? 1 : 0) - this.wallSoft) * approach(wall ? 6.5 : 20, dt);
    this.wAir += ((air ? 1 : 0) - this.wAir) * approach(air ? 24 : 26, dt);
    this.wSkid += ((skid ? 1 : 0) - this.wSkid) * approach(skid ? 26 : 13, dt);
    this.wRun += (runT - this.wRun) * approach(runT > this.wRun ? 18 : 12, dt);
    // The run lets go in finite time: an exponential tail left the feet creeping to the stand for 12 frames.
    if (runT < this.wRun) this.wRun = Math.max(runT, this.wRun - 1.5 * dt);
    this.wIdle += ((ground ? 1 - runT : 0) - this.wIdle) * approach(17, dt);
    // While stand and run trade places (the first step, the last one) the feet are carried, not slid:
    // a low step whose height follows how fast the blend is moving.
    {
      const rate = dt > 0 ? Math.abs(this.wRun - this.lastWRun) / dt : 0;
      this.lastWRun = this.wRun;
      const stepT = ground ? sat(rate / 3.5) * sat(4 * this.wRun * (1 - this.wRun) + 0.25) : 0;
      this.stepK += (stepT - this.stepK) * approach(stepT > this.stepK ? 40 : 30, dt);
    }
    // Coming to rest out of a run: a small braking step (render only; the sim stops in three frames).
    if (ground && this.speedNow > 0.5 && speed / 9.6 < this.speedNow - 0.12 && p.inputX === 0)
      this.stopK = Math.max(this.stopK, this.speedK);
    if (!ground || runT > 0.9) this.stopK *= Math.exp(-30 * dt);
    this.stopK *= Math.exp(-STOP.decay * dt);
    // The sim reaches top speed in three frames and stops in three; the POSE takes its time: the
    // lean follows `speedK`, the stride opens from trot to bound (and closes again) through `boundK`.
    this.speedK += (sat(speed / 9.6) - this.speedK) * approach(sat(speed / 9.6) > this.speedK ? 6.5 : 8, dt);
    this.speedNow = sat(speed / 9.6);
    const boundT = ground || skid ? smoothstep(0.3, 0.92, this.speedK) : this.boundK;
    this.boundK += (boundT - this.boundK) * approach(boundT > this.boundK ? 9 : 12, dt);

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

    // The braking step: the lead foot is set out ahead, toes up, the hips sink and sit back, the
    // arms swing through; then she rises out of it into the stand.
    if (this.stopK > 1e-3) {
      const k = this.stopK * (1 - this.wDash) * (1 - this.wSkid);
      out[AF]! += STOP.foot * k;
      out[AP]! -= STOP.toe * k;
      out[BF]! -= STOP.foot * 0.3 * k;
      out[BP]! += 0.25 * k;
      out[PU]! -= STOP.sink * k;
      out[PF]! -= 2.2 * k;
      out[LEAN]! -= STOP.lean * k;
      out[HT]! += 0.1 * k;
      out[HAF]! += 5 * k;
      out[HBF]! += 6 * k;
      out[HAU]! += 1.5 * k;
      out[HBU]! += 2.5 * k;
    }
    // A ground turn-around is a pivot: both feet stay down while she swivels through the camera.
    if (p.grounded) {
      const pivot = sat(1.25 * (1 - Math.abs(d))) * (1 - this.wDash);
      if (this.stepK > 1e-3) {
        // The foot that has further to go is carried higher.
        out[AU]! += 3.4 * this.stepK;
        out[BU]! += 2.4 * this.stepK;
        out[AP]! += 0.25 * this.stepK;
      }
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

    this.actPose(out, clock, dt, quiet, p);

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
    // Touching down out of a glide the span draws in at once (the lift in wings.ts keeps them up meanwhile).
    // As the ground comes (`reach`, last frame's) the span already starts to draw in: she lands under
    // wings that are closing, not open.
    const spreadT = glide ? 1 - LAND.reachFold * this.reach : 0;
    // The first glide of a run: they snap to the full spread, overshoot upward and settle (`firstOpen`).
    const fo = this.firstT / YEARN.first;
    this.firstOpen = fo < 1 ? quintic(fo / 0.16) * (1 - quintic((fo - 0.3) / 0.7)) : 0;
    this.soar +=
      (spreadT - this.soar) *
      approach(spreadT ? (fo < 0.4 ? 42 : 25) : this.flare > 0.05 ? LAND.fold : this.soarOut, dt);
    this.landT += dt;
    const lu = this.landT / LAND.peak;
    this.landCatch = lu < 8 ? this.landAmp * lu * Math.exp(1 - lu) : 0;
    // A fall she is not gliding: the wings want to open. They half unfurl, catch the air, are blown
    // shut and try again, sooner and wider the longer she falls (the tries themselves are in wings.ts).
    const falling =
      air &&
      !glide &&
      p.vy > 1.5 &&
      !this.spinning &&
      !this.diving &&
      !this.slashOn &&
      !this.fading &&
      this.hurtT > HURT.hold;
    if (p.grounded || wall) this.glidedAir = false;
    this.fallT = falling && !this.glidedAir ? this.fallT + dt : 0;
    const yearnT =
      smoothstep(YEARN.after, YEARN.full, this.fallT) * (this.glided ? YEARN.known : 1) * (1 - this.dive);
    this.yearn +=
      (yearnT - this.yearn) *
      approach(yearnT > this.yearn ? 9 : glide ? 30 : p.grounded ? LAND.shut : 16, dt);
    this.yearnPh += dt * lerp(YEARN.hz0, YEARN.hz1, this.yearn) * (0.9 + 0.2 * noise1(clock * 0.9, 137));
    this.soar = Math.max(this.soar, YEARN.base * this.yearn * (1 - this.spinW));
    // A great glint opens them the same way for a moment, wherever she is.
    this.flourishT += dt;
    const fu = this.flourishT / 0.85;
    this.flourish = fu < 1 && !dash && !wall ? quintic(fu / 0.22) * (1 - quintic((fu - 0.5) / 0.5)) : 0;
    const onGround = this.frame.s[S_GROUND]!;
    this.soar = Math.max(
      this.soar,
      0.86 * this.flourish * (1 - this.spinW) * (1 - (1 - LAND.flourishGround) * onGround),
    );
    // The ending: they unfurl slowly to the full glide spread, standing.
    const unfurl = this.endOn ? quintic((this.endT - ACT.unfurlAt) / ACT.unfurl) : 0;
    this.soar = Math.max(this.soar, unfurl * this.endW, this.waitOpen * (1 - this.spinW));
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
    // ... and the ending has one of its own: a single slow beat as the light settles above her.
    if (this.endOn && !glide) {
      const eu = (this.endT - ACT.beatAt) / ACT.beatLen;
      const e0 = (this.endT - dt - ACT.beatAt) / ACT.beatLen;
      const ex1 = (eu - 0.2) / 0.13;
      const ex2 = (eu - 0.52) / 0.17;
      this.beat = eu > 0 && eu < 1.4 ? 0.5 * (Math.exp(-ex2 * ex2) - 0.5 * Math.exp(-ex1 * ex1)) : 0;
      if (eu >= 0.4 && e0 < 0.4) sig.beat = true;
    }
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
    if (this.yearn > 1e-3 && this.wGlide < 0.99) {
      // Her body answers each try: lifted a hair under the wings as they catch, arms drifting out
      // to feel the air, and after a while a look up over her shoulder at them.
      const w = this.yearn * (1 - this.wGlide);
      const u = this.yearnPh - Math.floor(this.yearnPh);
      const tug = smoothstep(0.05, 0.3, u) * (1 - smoothstep(0.3, 0.8, u));
      out[PU]! += 1.6 * tug * w;
      out[LEAN]! += (0.1 - 0.05 * tug) * w;
      out[CURL]! -= 0.07 * tug * w;
      out[HAU]! += (3.2 + 2 * tug) * w;
      out[HBU]! += (2.6 + 2.4 * tug) * w;
      out[HAF]! -= 2.5 * w;
      out[HBF]! += 1.5 * w;
      out[AU]! += 1.5 * tug * w;
      out[BU]! += 1.1 * tug * w;
      const look =
        smoothstep(0.75, 1, this.yearn) * (0.5 + 0.5 * noise1(clock * 0.45, 139)) * (1 - this.wGlide);
      out[HYAW] = lerp(out[HYAW]!, 0.35, 0.8 * look);
      out[HT]! -= 0.16 * look;
      out[LOOKY]! -= 0.5 * look;
    }
    if (this.firstOpen > 1e-3) {
      const e = this.firstOpen * this.wGlide;
      out[PU]! += 2.6 * e;
      out[CURL]! -= 0.1 * e;
      out[HT]! -= 0.14 * e;
      out[HAU]! += 4.5 * e;
      out[HBU]! += 4 * e;
      out[HAF]! -= 2 * e;
      out[AF]! += 2.5 * e;
      out[BF]! += 3 * e;
      out[LOOKY]! -= 0.3 * e;
    }
    {
      // The wall kick: for a few frames the leg that pushed is left long behind her, toes on the
      // bark, the lead knee drives up and the arms are thrown back; then the rise takes over.
      const turned = sat(d0 * p.facing * 1.6);
      const k = (1 - smoothstep(0.03, KICK.push, this.kickT)) * turned * this.wAir * (1 - this.spinW);
      if (k > 1e-3) {
        out[BF]! -= 8 * k;
        out[BU]! -= 4.5 * k;
        out[BP]! += 0.3 * k;
        out[AU]! += 3.5 * k;
        out[AF]! += 2 * k;
        out[PF]! += 2.5 * k;
        out[LEAN]! += 0.2 * k;
        out[HT]! -= 0.14 * k;
        out[HAF]! -= 5 * k;
        out[HBF]! -= 4 * k;
        out[HAU]! -= 2 * k;
      }
      // A wall coming up ahead: the lead hand and foot reach for the bark before she is on it.
      const closing =
        air && !glide && p.vx * sgn > 2 && this.kickT > 0.12 ? smoothstep(84, 26, this.wallAhead) : 0;
      this.catchReach += (closing - this.catchReach) * approach(closing > this.catchReach ? 16 : 24, dt);
      const c = this.catchReach * (1 - this.spinW) * (1 - this.wWall) * (1 - this.slashW);
      if (c > 1e-3) {
        const nearA2 = d0 >= 0 ? 1 : 0;
        const RF = nearA2 ? HAF : HBF;
        const RU = nearA2 ? HAU : HBU;
        out[RF] = lerp(out[RF]!, 12.5, c);
        out[RU] = lerp(out[RU]!, 5, c);
        out[nearA2 ? HBF : HAF]! += 7 * c;
        out[nearA2 ? HBU : HAU]! += 2.5 * c;
        out[AF] = lerp(out[AF]!, 13, 0.8 * c);
        out[AU] = lerp(out[AU]!, 12, 0.8 * c);
        out[AP] = lerp(out[AP]!, -0.7, 0.8 * c);
        out[LEAN]! -= 0.08 * c;
      }
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
      // The gather is quick in and then held: a three-frame gather shows 0.56, 0.89, 1.
      const ew = 1 - (1 - sat(sf / sk.wind)) ** 2;
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
      // A cut that glanced off: the blade is thrown up and back over her shoulder and rings there.
      if (slashAdv && this.clangT < 90) this.clangT += dt * 60;
      const ct = this.clangT;
      const ck = ct < 90 ? smoothstep(0, CLANG.rise, ct) : 0;
      if (ck > 0) {
        const to = (CLANG.ang + CLANG.ring * Math.exp(-ct / 3.5) * Math.cos(ct * 0.8)) * DEG;
        let da = wrapPi(to - ang);
        // Always up and over, never down through the ground.
        if (da < 0) da += TAU;
        ang += da * ck;
        len = lerp(len, 0.92, ck);
      }
      this.clangK = ck * (1 - quintic((ct - CLANG.hold) / CLANG.out));
      if (this.cutQ >= 0 && cut0 < 0) {
        this.cutStart = true;
        this.slashWhip = sk.whip ?? 0;
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
      this.gripIn = Math.min(1, this.gripIn + dt * 60);
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
        kn[i] = v * bw * (1 - ck);
      }
      this.slashSweep = (sk.sweep ?? 0) * sw * rel * (1 + 0.4 * over) * bw * (1 - ck);
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
      this.slashSweep *= Math.exp(-20 * dt);
      this.clangT = 99;
      this.clangK = 0;
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
      // An up cut on the ground: up on her toes, long through the whole body under the blade.
      const upG = this.slashDir === 'up' ? this.slashBody * g0 * fw * (1 - this.wRun) : 0;
      out[AP]! += 0.5 * upG;
      out[BP]! += 0.62 * upG;
      // A blow that landed on a creature: she digs in against the recoil. Hips back and low, the
      // shoulders kept over the blow, the front foot left out ahead, the back foot skidding.
      if (slashAdv) this.braceK *= Math.exp((-dt * 60) / BRACE.frames);
      const bk = this.braceK * fw * (this.slashOn ? 1 : 0);
      if (bk > 1e-3) {
        out[PF]! -= 5.5 * bk * gk;
        out[PU]! -= 3.4 * bk * g0;
        out[LEAN]! += 0.1 * bk;
        out[CURL]! += 0.14 * bk;
        out[HT]! += 0.1 * bk;
        out[LF]! += 6 * bk * stand;
        out[TF]! -= 7 * bk * stand;
        out[TP]! += 0.45 * bk * stand;
        out[OHF]! -= 5 * bk;
        out[OHU]! -= 2 * bk;
      }
      // A cut that glanced off: rocked back onto her heels, chest thrown open, the front foot
      // jolted off the ground (the half step back), the off-hand flung out ahead for balance.
      const cl = this.clangK * fw;
      if (cl > 1e-3) {
        const pop = 1 + 0.35 * Math.exp(-this.clangT / 2.5);
        out[LEAN]! -= 0.46 * cl * pop * gl;
        out[CURL]! -= 0.24 * cl * gl;
        out[HT]! -= 0.24 * cl;
        out[PF]! -= 6 * cl * gk;
        out[PU]! += 1.5 * cl * g0;
        out[TW]! += 0.55 * cl * mir;
        out[OHF]! += 10 * cl;
        out[OHU]! += 6 * cl;
        const step = bell(sat(this.clangT / (CLANG.hold + 3)));
        out[LF]! -= 5 * cl * stand;
        out[LU]! += 7 * step * cl * stand;
        out[sB ? BP : AP]! -= 0.5 * step * cl * stand;
        out[TF]! -= 9 * cl * stand;
        out[TP]! += 0.3 * cl * stand;
        out[AF]! -= 5 * cl * airK;
        out[BF]! -= 7 * cl * airK;
        out[EYE]! *= 1 - 0.45 * cl * Math.exp(-this.clangT / 3);
      }
      // An up cut in the air is one long vertical line: wings swept down and back, legs together.
      const upAir = this.slashDir === 'up' ? airK * this.slashBody : 0;
      this.slashWing = lerp(lerp(kn[K_WING]!, -1.1, upAir), 1.5, cl);
      this.slashTwist = kn[K_TW]! * mir;
      // The antennae's whip: thrown the other way as the cut starts, gone in a few frames (their
      // own chain does the overshoot). A clang throws them forward over her brow.
      if (slashAdv) this.slashWhip *= Math.exp((-dt * 60) / 3.5);
      if (sig.blocked) this.slashWhip = -40;
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
      out[EYE]! *= this.hurtT < HURT.shut && !this.fading ? 0 : 1 - 0.7 * hk;
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
    this.lookS.omega = lerp(4.5, 12, this.noticeK);
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
    // In the somersault's ball the neck draws in (to the length the ball was shaped with).
    const neckL = BODY.neck - 2 * this.spinW;
    const neckX = chestX + su * d * neckL;
    const neckY = chestY - cu * neckL;
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
      // (If the leg cannot reach its target in the air, the foot stays on the leg: it is never drawn stretched.)
      set(
        j,
        J_TOE_A + side,
        ballX + Math.cos(bp) * TOE * d + (ikOut.ex - ankX),
        ballY + Math.sin(bp) * TOE - 0.5 + (ikOut.ey - ankY),
      );

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
    // Acting: her eyes go to what she is attending to (the glass, her empty hand, the light above).
    const gw = this.gazeW;
    const gx = this.gazeX.step(lerp(clamp((p.vx * sgn) / 9.6, -1, 1) * 0.55 + dart, this.gazeAX, gw), dt);
    const gy = this.gazeY.step(
      lerp(p.grounded ? dartY : clamp(p.vy / 14, -1, 1) * 0.85, this.gazeAY, gw),
      dt,
    );
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
    this.stroke = strokeFor(dir, step);
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
    this.clangT = 99;
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

  /**
   * A point of the current stroke's crescent, `u` 0 (tail) .. 1 (leading end), in the frame turned
   * `roll`: its own arc if the stroke has one (`Stroke.mark`), else `show`..1 of the cut.
   */
  markAtRoll(u: number, roll: number, out: { x: number; y: number }): void {
    const st = this.stroke;
    const m0 = st.mark ? st.mark[0] : st.a0 + (st.a1 - st.a0) * st.show;
    const m1 = st.mark ? st.mark[1] : st.a1;
    strokeMap(st, m0 + (m1 - m0) * u, this.slashTilt);
    const bx = mapOut.f * this.slashFacing;
    const by = -mapOut.u;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    out.x = bx * cr - by * sr;
    out.y = bx * sr + by * cr;
  }

  /** Lerps the pose toward an acting pose (whose hands are near, far: they trade with the turn). */
  private mix(out: Pose, src: Pose, w: number, nearA: number, hands = 1): void {
    if (w <= 1e-4) return;
    for (let i = 0; i < NP; i++) {
      if (i >= HAF && i <= HBU) continue;
      out[i] = lerp(out[i]!, src[i]!, w);
    }
    const hw = w * hands;
    out[HAF] = lerp(out[HAF]!, lerp(src[HBF]!, src[HAF]!, nearA), hw);
    out[HAU] = lerp(out[HAU]!, lerp(src[HBU]!, src[HAU]!, nearA), hw);
    out[HBF] = lerp(out[HBF]!, lerp(src[HAF]!, src[HBF]!, nearA), hw);
    out[HBU] = lerp(out[HBU]!, lerp(src[HAU]!, src[HBU]!, nearA), hw);
  }

  /**
   * Her acting at the lanterns and the heart, laid over the blended pose: kindling, the empty hand,
   * resting, warming her hands, the hand on the sleeping heart, the look toward the waking one, the
   * ending. Sets what the wings, antennae and lights read (`cloak`, `shiver`, `antLift`, `eyeLit`).
   */
  private actPose(out: Pose, clock: number, dt: number, quiet: boolean, p: PlayerView): void {
    const cue = this.cue;
    const nearA = sat(0.5 + 1.6 * this.yaw.x);
    const NF = nearA >= 0.5 ? HAF : HBF;
    const NU = nearA >= 0.5 ? HAU : HBU;
    const FF = nearA >= 0.5 ? HBF : HAF;
    const FU = nearA >= 0.5 ? HBU : HAU;
    const face = this.yaw.x >= 0 ? 1 : -1;
    // Looks that work at a run: on the ground only (in the air and on the bark her head belongs to the jump).
    const onFeet = this.frame.s[S_GROUND]! * (1 - this.wWall) * (1 - sat(this.hurtK));
    const headX = p.cx;
    const headY = p.feetY - 62;
    let quick = 0;
    // Only the stand carries these; a cut or a blow takes her out of them at once.
    const aw = this.wIdle * (1 - this.gripIn) * (1 - sat(this.hurtK));
    let cloak = 0;
    let ant = 0;
    let antC = 0;
    let lit = 1;
    let shiver = 0;
    let gzx = 0;
    let gzy = 0;
    let gzw = 0;

    // --- Kindling: down on one knee, the near hand lifted to the glass; as it catches she looks up.
    // (With the ember she first lifts it to the glass, standing: the kneel comes as her hands come down.)
    const lt = this.liftT;
    const liftK =
      lt < ACT.give[2] ? smoothstep(0, ACT.give[0], lt) * (1 - smoothstep(ACT.give[1], ACT.give[2], lt)) : 0;
    const lw = liftK * aw;
    const kw = this.kindleW * aw * (1 - 0.92 * liftK);
    if (lw > 1e-3) {
      const aim = clamp((cue.lampUp - 50) / 30, -0.6, 1);
      this.mix(out, GIVE, lw, nearA);
      // Her hands follow the coal a little way up as it goes.
      const follow = smoothstep(0.05, ACT.give[1], lt);
      out[HAU]! += (1.6 * aim + 2.2 * follow) * lw;
      out[HBU]! += (1.6 * aim + 1.6 * follow) * lw;
      out[HT]! -= 0.08 * aim * lw;
      cloak += 0.5 * lw;
      ant -= 40 * lw;
      antC -= 0.1 * lw;
      gzx += 0.75 * lw;
      gzy -= 0.75 * lw;
      gzw += lw;
    }
    if (kw > 1e-3) {
      const q = cue.kindle >= 0 ? cue.kindle : 1;
      const ct = this.catchT;
      const up = ct < 1.4 ? smoothstep(0, 0.14, ct) * (1 - smoothstep(0.55, 1.3, ct)) : 0;
      const breath = ct < 1 ? Math.sin(Math.PI * sat(ct / 1)) ** 2 : 0;
      this.mix(out, KINDLE, kw, nearA);
      // The hand rises a little as the light leaves it, toward a glass that hangs high.
      const aim = clamp((cue.lampUp - 50) / 30, -0.6, 1);
      out[NU]! += (1.6 * q + 2.2 * aim + 1.5 * up) * kw;
      out[HT]! -= (0.1 * aim + 0.17 * up) * kw;
      out[CURL]! -= 0.11 * up * kw;
      out[PU]! += 1.8 * up * kw;
      out[LOOKY]! -= 0.35 * up * kw;
      out[EYE] = lerp(out[EYE]!, 1, up * kw);
      cloak += (0.85 + 1.0 * breath) * kw;
      ant -= (44 + 6 * up) * kw;
      antC -= (0.13 + 0.07 * up) * kw;
      // Her own light goes into it: eyes and lanterns dim as the glints leave, and take the flame's light as it catches.
      gzx += 0.75 * kw;
      gzy += (-0.55 - 0.3 * up) * kw;
      gzw += kw;
      if (cue.kindle >= 0) {
        const given = smoothstep(0.08, 0.75, q) * kw;
        lit -= 0.45 * given;
        out[EYE]! -= 0.14 * given;
      }
      lit += 0.4 * Math.exp(-ct / 0.55) * (ct < 3 ? 1 : 0);
    }

    // --- Refused: she reaches, nothing comes; a look into the empty hand, antennae down for a beat.
    // --- The lantern that wants the ember, and she has none: she looks into the empty glass, then
    // her head turns to where the ember is (west of the summit and below it), and comes back.
    const kt = this.keyRefT;
    if (kt < ACT.keyTurn[3]) {
      const KG = ACT.keyGlass;
      const KT = ACT.keyTurn;
      const into = smoothstep(0, KG[0], kt) * (1 - smoothstep(KG[1], KG[2], kt)) * aw * (quiet ? 1 : 0);
      const turn = smoothstep(KT[0], KT[1], kt) * (1 - smoothstep(KT[2], KT[3], kt)) * onFeet;
      if (into > 1e-3) {
        const aim = clamp((cue.lampUp - 50) / 30, -0.6, 1);
        // Up on her toes a little, leaning in to look; the near hand half lifted, and it stops there.
        out[PF]! += 1.4 * into;
        out[PU]! += 0.7 * into;
        out[LEAN]! += 0.08 * into;
        out[HT]! -= (0.17 + 0.1 * aim) * into;
        out[LOOKY]! -= 0.4 * into;
        out[EYE] = lerp(out[EYE]!, 1, into);
        out[NF] = lerp(out[NF]!, 8.4, 0.85 * into);
        out[NU] = lerp(out[NU]!, -4.6, 0.85 * into);
        ant -= 30 * into;
        antC -= 0.1 * into;
        gzx += 0.8 * into;
        gzy -= 0.6 * into;
        gzw += into;
      }
      if (turn > 1e-3) {
        const dx = this.keyRefX - headX;
        const dy = this.keyRefY - headY;
        const side = smoothstep(-80, 40, dx * face);
        // (it is far off: the angle alone would be nearly level, and "down there" has to read)
        let pitch = clamp(Math.atan2(dy, Math.abs(dx) + 50) * 0.8, -0.32, 0.34);
        if (dy > 60) pitch = Math.max(pitch, 0.24);
        const st = turn * aw;
        out[HYAW] = lerp(out[HYAW]!, lerp(-0.3, 1, side), turn);
        out[HT]! += pitch * turn;
        out[LOOKY]! += 2.2 * pitch * turn;
        out[EYE] = lerp(out[EYE]!, 0.92, turn);
        // The hand comes down; her weight settles back off her toes.
        out[PU]! -= 0.9 * st;
        out[CURL]! += 0.05 * st;
        out[LEAN]! -= 0.03 * st;
        ant -= 6 * turn;
        antC += 0.03 * turn;
        cloak -= 0.2 * st;
        gzx += lerp(-0.75, 0.85, side) * turn;
        gzy += 2 * pitch * turn;
        gzw += turn;
        quick = Math.max(quick, turn);
      }
    }

    const rt = this.refuseT;
    if (rt < ACT.refuse && quiet && aw > 1e-3) {
      const reach = smoothstep(0, 0.2, rt) * (1 - smoothstep(0.42, 0.78, rt));
      const look = smoothstep(0.48, 0.85, rt) * (1 - smoothstep(ACT.refuse - 0.6, ACT.refuse, rt));
      out[NF] = lerp(out[NF]!, 9.8, reach * aw);
      out[NU] = lerp(out[NU]!, -0.6, reach * aw);
      out[LEAN]! += 0.06 * reach * aw;
      out[HT]! -= 0.1 * reach * aw;
      out[LOOKY]! -= 0.3 * reach * aw;
      this.mix(out, EMPTY, look * aw, nearA);
      ant += (46 * look - 20 * reach) * aw;
      antC += (0.12 * look - 0.25 * reach) * aw;
      out[PU]! -= 1.2 * look * aw;
      gzx += (0.7 * reach + 0.5 * look) * aw;
      gzy += (-0.5 * reach + 0.9 * look) * aw;
      gzw += Math.max(reach, look) * aw;
      cloak -= 0.35 * look * aw;
      lit -= 0.12 * look * aw;
    }

    // --- Resting: sat on her heels under the lantern, wings round her; the light fills her and she lifts her face to it.
    const rw = this.restW * aw;
    if (this.restW < 0.02) this.rested = false;
    if (rw > 1e-3) {
      const ht = this.rested ? this.healT : 9;
      const h = ht < 1.7 ? smoothstep(0, 0.3, ht) * (1 - smoothstep(1.0, 1.7, ht)) : 0;
      const content = this.rested ? smoothstep(1.0, 2.0, ht) : 0;
      const b = Math.sin(clock * 1.25);
      this.mix(out, REST, rw, nearA);
      out[PU]! += (0.55 * b + 1.6 * h + 0.8 * content) * rw;
      out[CURL]! -= (0.035 * b + 0.2 * h + 0.12 * content) * rw;
      out[HT]! -= (0.5 * h + 0.2 * content) * rw;
      out[LOOKY]! -= (0.85 * h + 0.3 * content) * rw;
      out[EYE] = lerp(out[EYE]!, lerp(0.8, 1, h), Math.max(h, content) * rw);
      cloak -= (1 - 0.6 * h) * rw;
      shiver = ht < 1 ? Math.sin(Math.PI * sat((ht - 0.12) / 0.75)) ** 2 * rw : 0;
      ant += (16 - 44 * h - 14 * content) * rw;
      antC += (0.06 - 0.22 * h - 0.12 * content) * rw;
      gzx += 0.6 * Math.max(h, content) * rw;
      gzy += (0.5 - 1.2 * h - 0.7 * content) * rw;
      gzw += rw;
      lit += 0.3 * h * rw;
    }

    // --- Company: by a lit lantern she turns to it and holds her hands up to its warmth for a while.
    const ww = this.warmW * aw;
    if (ww > 1e-3) {
      const tt = (this.warmT - ACT.warmAfter) % ACT.warmEvery;
      const hands = smoothstep(0, 0.9, tt) * (1 - smoothstep(ACT.warmHands, ACT.warmHands + 1.4, tt));
      this.mix(out, WARM, ww, nearA, hands);
      const aim = clamp((cue.lampUp - 50) / 30, -0.6, 1);
      const rub = Math.sin(clock * 1.9);
      out[HAU]! += (2.2 * aim + 0.5 * rub) * ww * hands;
      out[HBU]! += (2.2 * aim - 0.5 * rub) * ww * hands;
      out[HT]! -= 0.1 * aim * ww;
      ant -= 24 * ww;
      antC -= 0.2 * ww;
      cloak += 0.35 * ww;
      gzx += 0.7 * ww;
      gzy -= 0.5 * ww;
      gzw += ww;
    }

    // --- The sleeping heart: a hand on the bud, her head inclined to it.
    const tw = this.touchW * aw;
    if (tw > 1e-3) {
      this.mix(out, LISTEN, tw, nearA);
      out[NF]! += clamp((Math.abs(cue.heartDx) - 30) * 0.12, -2.5, 2) * tw;
      ant -= 10 * tw;
      antC -= 0.18 * tw;
      cloak += 0.3 * tw;
      gzx += 0.4 * tw;
      gzy += 0.6 * tw;
      gzw += tw;
    }

    // --- The heart wakes somewhere else: her head turns to it and holds (the body is left to the player).
    if (this.wakeT >= 0 && this.wakeT < ACT.wake) {
      const t = this.wakeT;
      const k = smoothstep(0, 0.3, t) * (1 - smoothstep(ACT.wake - 0.65, ACT.wake, t));
      const behind = this.wakeDir * this.yaw.x < 0;
      if (behind) out[HYAW] = lerp(out[HYAW]!, -0.5, k);
      else out[HYAW] = lerp(out[HYAW]!, 1, k);
      out[HT]! += this.wakePitch * k;
      out[LOOKY]! += 2.2 * this.wakePitch * k;
      out[EYE] = lerp(out[EYE]!, 1, k);
      ant -= 30 * k;
      antC -= 0.1 * k;
      gzx += (behind ? -0.6 : 0.8) * k;
      gzy += 2 * this.wakePitch * k;
      gzw += k;
    }

    // --- A dormant lantern or lamp as she comes near: head, eyes and antennae go to it and follow
    // it as she passes (over her shoulder once it is behind), then let go. Works at a run.
    if (this.noticeT < ACT.notice) {
      const t = this.noticeT;
      const far = 1 - smoothstep(330, 430, Math.abs(this.noticeDx));
      const k =
        smoothstep(0, 0.2, t) *
        (1 - smoothstep(ACT.notice - 0.5, ACT.notice, t)) *
        far *
        (1 - sat(this.hurtK)) *
        (1 - Math.max(this.kindleW, this.restW)) *
        // On the ground only: in the air and on the bark her head belongs to the jump.
        this.frame.s[S_GROUND]! *
        (1 - this.wWall);
      // How far ahead of her it is, along the way her body faces.
      const fwd = this.noticeDx * (this.yaw.x >= 0 ? 1 : -1);
      const side = smoothstep(-80, 40, fwd);
      const pitch = clamp(Math.atan2(this.noticeDy, Math.abs(this.noticeDx) + 50) * 0.55, -0.32, 0.3);
      out[HYAW] = lerp(out[HYAW]!, lerp(-0.6, 1, side), k);
      out[HT]! += (pitch - 0.07) * k;
      out[CURL]! -= 0.04 * k;
      out[LOOKY]! += 2.2 * pitch * k;
      out[EYE] = lerp(out[EYE]!, 1, k);
      // (standing, a big lift straightens the antennae into two rods; streaming in the run they can take more)
      ant -= (20 + 18 * this.wRun) * k;
      antC -= (0.05 + 0.08 * this.wRun) * k;
      gzx += lerp(-0.7, 0.85, side) * k;
      gzy += 2 * pitch * k;
      gzw += k;
      quick = Math.max(quick, k);
    }

    // --- A channel runs on behind her (she walked on within its leash), or has just caught there:
    // no kneel away from the light. A look back at it and a hand left out toward it; it works at a run.
    if (this.awayW > 1e-3) {
      const dx = this.awayX - headX;
      const dy = this.awayY - headY;
      const k = this.awayW * onFeet * (1 - Math.max(this.kindleW, this.restW));
      const side = smoothstep(-80, 40, dx * face);
      const pitch = clamp(Math.atan2(dy, Math.abs(dx) + 50) * 0.55, -0.32, 0.3);
      out[HYAW] = lerp(out[HYAW]!, lerp(-0.6, 1, side), k);
      out[HT]! += pitch * k;
      out[LOOKY]! += 2.2 * pitch * k;
      out[EYE] = lerp(out[EYE]!, 1, k);
      // The hand: out ahead toward it standing; at a run the trailing one is left open behind, a little higher.
      const rk = k * (1 - this.gripIn);
      const st = rk * this.wIdle;
      out[NF] = lerp(out[NF]!, lerp(-9.5, 9.4, side), 0.8 * st);
      out[NU] = lerp(out[NU]!, -3.4, 0.8 * st);
      out[NU]! += 4.2 * rk * this.wRun;
      out[NF]! -= 1.6 * rk * this.wRun * (1 - side);
      ant -= (16 + 12 * this.wRun) * k * (2 * side - 1);
      antC -= 0.05 * k;
      gzx += lerp(-0.75, 0.85, side) * k;
      gzy += 2 * pitch * k;
      gzw += k;
      quick = Math.max(quick, k);
    }

    // --- A lantern has caught and the ember hangs near, overhead: the moths rise to it and her head
    // and antennae go up with them, from the glass to the ember, hold a beat, and come back.
    if (this.showT < ACT.show) {
      const t = this.showT;
      const u = smoothstep(ACT.showRise[0], ACT.showRise[1], t);
      const dx = lerp(this.showX0, this.showX1, u) - headX;
      const dy = lerp(this.showY0, this.showY1, u) - headY;
      const far = 1 - smoothstep(700, 1000, Math.abs(this.showX1 - headX));
      const k =
        smoothstep(ACT.showIn[0]!, ACT.showIn[1]!, t) *
        (1 - smoothstep(ACT.show - 0.75, ACT.show, t)) *
        far *
        onFeet *
        (1 - this.restW);
      const side = smoothstep(-80, 40, dx * face);
      // (a chin lifted further than this tips her face out of sight; less of it at a run)
      const pitch = clamp(Math.atan2(dy, Math.abs(dx) + 50) * 0.6, -0.5, 0.3) * (0.6 + 0.4 * this.wIdle);
      const st = k * aw;
      out[HYAW] = lerp(out[HYAW]!, lerp(-0.6, 1, side), k);
      out[HT]! += pitch * k;
      out[LOOKY]! += 2.2 * pitch * k;
      out[EYE] = lerp(out[EYE]!, 1, k);
      // Standing, the look goes through her: chest open, a little taller.
      out[CURL]! += 0.16 * pitch * st;
      out[LEAN]! += 0.05 * pitch * st;
      out[PU]! -= 1.4 * pitch * st;
      // The antennae prick up after them (the lifted chin alone lays them back), one a little later.
      ant -= (40 + 22 * u) * k;
      antC -= 0.07 * k;
      gzx += lerp(-0.7, 0.8, side) * k;
      gzy += 2 * pitch * k;
      gzw += k;
      quick = Math.max(quick, 0.6 * k);
    }

    // --- The ember comes to her: both hands go out to meet it and draw in as it arrives; she
    // receives it, and one hand sees it to her shoulder. A small careful gesture.
    const rw2 = this.reachW * aw;
    if (this.reachW > 1e-3) {
      const u = sat(this.takeT / this.takeLen);
      const k = this.reachW * onFeet;
      const dx = cue.emberDx;
      // (the shoulders are ~13 px under the point `emberDy` is measured from)
      const up = -cue.emberDy - 13;
      const side = smoothstep(-40, 20, dx * face);
      // (it lifts out of its cup and comes down to her from over her brow)
      const over = Math.sin(Math.PI * sat(u * 1.15)) ** 1.5;
      const pitch =
        (clamp(Math.atan2(cue.emberDy, Math.abs(dx) + 40) * 0.5, -0.36, 0.26) - 0.2 * over) * (1 - u * u);
      out[HYAW] = lerp(out[HYAW]!, lerp(-0.4, 1, side), k);
      out[HT]! += (pitch + 0.2 * u * u) * k;
      out[LOOKY]! += (2 * pitch + 0.5 * u * u) * k;
      out[EYE] = lerp(out[EYE]!, 1, k);
      if (rw2 > 1e-3) {
        this.mix(out, REACH, rw2, nearA);
        // Out toward where it hangs, then drawn in to a cup before her collar as it arrives.
        const inK = smoothstep(0.45, 1, u);
        const nf = lerp(clamp(Math.abs(dx) * 0.5 + 4, 6, 11.5), 8, inK);
        const nu = lerp(clamp(up * 0.7 + 2, -3, 10) + 6.5 * over, -3.4, inK);
        out[NF] = lerp(out[NF]!, nf, rw2);
        out[NU] = lerp(out[NU]!, nu, rw2);
        out[FF] = lerp(out[FF]!, nf - 2.6, rw2);
        out[FU] = lerp(out[FU]!, nu - 1.8, rw2);
        out[CURL]! += 0.1 * inK * rw2;
        out[PU]! -= 0.8 * inK * rw2;
        cloak += 0.4 * rw2;
      }
      ant -= 30 * (1 - 0.5 * u) * k;
      antC -= 0.08 * k;
      gzx += lerp(-0.6, 0.8, side) * k;
      gzy += (2 * pitch + 0.6 * u * u) * k;
      gzw += k;
      quick = Math.max(quick, 0.5 * k);
    }
    const SE = ACT.settle;
    const settleK =
      this.recvT < SE[3]
        ? smoothstep(SE[0], SE[1], this.recvT) * (1 - smoothstep(SE[2], SE[3], this.recvT))
        : 0;
    const sw2 = settleK * aw;
    if (sw2 > 1e-3) {
      this.mix(out, SHOULDER, sw2, nearA);
      // The hand opens away from it at the end, slowly.
      out[NU]! -= 1.4 * smoothstep(SE[2] - 0.3, SE[3], this.recvT) * sw2;
      ant += 8 * sw2;
      cloak -= 0.3 * sw2;
      gzx -= 0.8 * sw2;
      gzy -= 0.25 * sw2;
      gzw += sw2;
      lit += 0.12 * Math.exp(-this.recvT / 0.5) * sw2;
    }

    // --- Carrying it: one arm kept in by her, and standing, a glance back at it now and then.
    const gd = this.guard;
    if (gd > 1e-3) {
      const still = gd * aw * (1 - settleK) * (1 - Math.max(this.kindleW, this.restW, this.warmW, liftK));
      // The hanging hand comes up to her ribs; in the run the near arm rides bent at her side, not trailing.
      out[FF] = lerp(out[FF]!, 1.6, 0.8 * still);
      out[FU] = lerp(out[FU]!, -10.8, 0.8 * still);
      const run = gd * this.wRun * (1 - this.gripIn);
      out[NF] = lerp(out[NF]!, -3.2, 0.7 * run);
      out[NU] = lerp(out[NU]!, -8.6, 0.7 * run);
      const gp = pulse(clock, ACT.carryEvery, ACT.carryLook, 151, 0.9);
      const gl = gp > 0 ? smoothstep(0, 0.22, gp) * (1 - smoothstep(0.7, 1, gp)) * still * (1 - sat(gzw)) : 0;
      if (gl > 1e-3) {
        out[HYAW] = lerp(out[HYAW]!, 0.5, gl);
        out[HT]! -= 0.05 * gl;
        out[CURL]! -= 0.02 * gl;
        ant += 7 * gl;
        gzx -= 0.85 * gl;
        gzy -= 0.3 * gl;
        gzw += gl;
      }
    }

    // --- The prologue: out of her cocoon, she shakes her wings out like a cape (vesperLink.cine).
    const sh = Math.min(1, cue.shake) * aw;
    if (sh > 1e-3) {
      shiver = Math.max(shiver, sh);
      cloak += sh * (0.9 + 0.8 * Math.sin(clock * 19));
      ant += 6 * sh * Math.sin(clock * 23);
      out[PU]! += 0.8 * sh * Math.sin(clock * 21);
      out[LEAN]! += 0.04 * sh * Math.sin(clock * 17);
    }

    // --- The prologue: the first glint held up to her face, then a look past it (vesperLink.cine).
    const hw = Math.min(1, cue.hold) * aw;
    if (hw > 1e-3) {
      const b = Math.sin(clock * 1.3);
      this.mix(out, HOLD, hw, nearA);
      out[PU]! += 0.3 * b * hw;
      cloak += 0.25 * hw;
      ant += (6 + 2 * b) * hw;
      lit += 0.08 * hw;
      gzx += 0.35 * hw;
      gzy += 0.55 * hw;
      gzw += hw;
      const pw = Math.min(1, cue.look) * hw;
      if (pw > 1e-3) {
        this.mix(out, PAST, pw, nearA);
        ant -= 10 * pw;
        gzx += 0.8 * pw;
        gzy -= 0.75 * pw;
      }
    }

    // --- Waiting in the woken heart: held in its light, looking into it; wings slowly opening,
    // antennae lifted, one long breath after another. Not frozen.
    const wtw = this.waitW * aw * (1 - this.endW);
    if (wtw > 1e-3) {
      const b = Math.sin(clock * 1.5);
      const b2 = Math.sin(clock * 1.5 - 0.9);
      const deep = smoothstep(0.2, ACT.waitOpenIn, this.waitT);
      this.mix(out, WAIT, wtw, nearA);
      out[PU]! += (0.75 * b + 0.5 * deep) * wtw;
      out[CURL]! -= (0.045 * b2 + 0.04 * deep) * wtw;
      out[HT]! -= (0.025 * b2 + 0.07 * deep) * wtw;
      out[HAU]! += (0.6 * b2 + 1.4 * deep) * wtw;
      out[HBU]! += (0.6 * b2 + 1.2 * deep) * wtw;
      out[NF]! += 1.2 * deep * wtw;
      // Drawn a little toward it.
      out[PF]! += 0.9 * deep * wtw;
      cloak += (0.7 + 0.5 * deep + 0.25 * b2) * wtw;
      ant -= (16 + 14 * deep + 3 * b2) * wtw;
      antC -= (0.05 + 0.06 * deep) * wtw;
      lit += 0.14 * deep * wtw;
      gzx += 0.7 * wtw;
      gzy -= (0.25 + 0.35 * deep) * wtw;
      gzw += wtw;
    }

    // --- The ending: tall in the open flower, face lifted to the light above, breathing.
    const ew = this.endW * aw;
    if (ew > 1e-3) {
      const b = Math.sin(clock * 1.05);
      const bl = Math.max(0, this.beat);
      this.mix(out, UPLIFT, ew, nearA);
      out[PU]! += (0.5 * b + 2 * bl) * ew;
      out[CURL]! -= (0.03 * b + 0.05 * bl) * ew;
      out[HT]! -= (0.02 * b + 0.04 * bl) * ew;
      out[HAU]! += (0.4 * b + 2.5 * bl) * ew;
      out[HBU]! += (0.4 * b + 2.2 * bl) * ew;
      ant -= 26 * smoothstep(0.4, 2.4, this.endT) * ew;
      antC -= 0.14 * smoothstep(0.4, 2.4, this.endT) * ew;
      gzy -= 0.85 * ew;
      gzw += ew;
      lit += 0.32 * smoothstep(0.8, 3.2, this.endT) * ew;
      // The offering: while her glints go into the heart her hands are out, giving, and she watches them go.
      const og = this.giveW * ew;
      if (og > 1e-3) {
        const b3 = Math.sin(clock * 2.1);
        // (she is turned most of the way to us: "forward" is hardly seen, so the arms open to either side)
        out[NF] = lerp(out[NF]!, 15, og);
        out[NU] = lerp(out[NU]!, -1.5 + 0.5 * b3, og);
        out[FF] = lerp(out[FF]!, -13, og);
        out[FU] = lerp(out[FU]!, -2.5 - 0.5 * b3, og);
        out[HT]! += 0.26 * og;
        out[CURL]! += 0.07 * og;
        out[LEAN]! += 0.03 * og;
        gzy += 0.9 * og;
      }
      // A tier of the grove wakes: a look out at it (the flowers at her feet, the paths behind her, the canopy).
      for (let i = 0; i < 3; i++) {
        const t = this.groveT[i]!;
        if (t >= ACT.grove) continue;
        const k = smoothstep(0.05, 0.4, t) * (1 - smoothstep(ACT.grove - 0.6, ACT.grove, t)) * ew;
        // (her head's pitch only shows with the head turned, so each look turns it out of the front view)
        if (i === 0) {
          out[HT]! += 0.8 * k;
          out[HYAW] = lerp(out[HYAW]!, 1.75, k);
          gzx += 0.5 * k;
          gzy += 1.7 * k;
        } else if (i === 1) {
          out[HT]! += 0.5 * k;
          out[HYAW] = lerp(out[HYAW]!, -0.9, k);
          gzx += 0.7 * k;
          gzy += 0.9 * k;
        } else {
          out[HT]! -= 0.3 * k;
          out[HYAW] = lerp(out[HYAW]!, 1.7, k);
          out[CURL]! -= 0.05 * k;
          gzx += 0.4 * k;
          gzy -= 0.6 * k;
        }
        out[EYE] = lerp(out[EYE]!, 1, k);
        ant -= 8 * k;
        quick = Math.max(quick, 0.5 * k);
      }
    }
    {
      const on = this.endOn && this.offerT < ACT.offerHold ? 1 : 0;
      this.giveW += (on - this.giveW) * approach(on ? 4.5 : 2.2, dt);
    }
    this.noticeK = quick;
    this.raise = Math.max(ACT.endRaise * this.endW, ACT.waitRaise * sat(this.waitOpen / ACT.waitOpen));

    this.cloak += (cloak - this.cloak) * approach(7, dt);
    this.antLift += (ant - this.antLift) * approach(8, dt);
    this.antCurl += (antC - this.antCurl) * approach(6, dt);
    this.eyeLit += (lit - this.eyeLit) * approach(10, dt);
    this.shiver = shiver;
    this.gazeW = sat(gzw);
    if (gzw > 1e-3) {
      this.gazeAX = gzx / gzw;
      this.gazeAY = gzy / gzw;
    }
    // The light leaves her open near hand while she kindles and while she gives to the heart, and
    // the ember arrives in it.
    this.offerK = Math.max(kw, rw2, 0.85 * this.giveW * ew, Math.min(1, cue.hold) * aw);
    this.offerSide = nearA >= 0.5 ? 0 : 1;
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
    // Tall and easy: the weight on the back leg (B) with the hips over it, the other foot set
    // forward and apart with its heel just lifted, spine long, chest open, chin level.
    o[PF] = 1.2 + shift * 0.9;
    o[PU] = 33.0 + breath * 0.4 - Math.abs(shift) * 0.35;
    o[LEAN] = 0.0 + breath * 0.012 + sway * 0.02 - shift * 0.015;
    o[CURL] = -0.05 - breath * 0.035;
    o[HT] = -0.05 + nod * 0.07 + gl * 0.05 - breath * 0.012;
    o[AF] = 7.4;
    o[AU] = 0.1;
    o[AP] = 0.2;
    o[BF] = -1.6;
    o[BU] = 0;
    o[BP] = 0;
    // The near hand rests by the thorn's hilt at her hip; the other hangs loose. They trade as she turns.
    const nearA = sat(0.5 + 1.6 * this.yaw.x);
    const hiltF = 5.6 + sway * 0.4;
    const hiltU = -10.6 + breath * 0.35;
    const hangF = -2.2 - sway * 1.0;
    const hangU = -15.0 + breath * 0.25 + nod * 0.3;
    o[HAF] = lerp(hangF, hiltF, nearA);
    o[HAU] = lerp(hangU, hiltU, nearA);
    o[HBF] = lerp(hiltF, hangF, nearA);
    o[HBU] = lerp(hiltU, hangU, nearA);
    o[TW] = 0.1 + shift * 0.1;
    o[EYE] = 0.82;
    o[LOOKY] = 0.05 + nod * 0.15;
    o[HYAW] = 1 - gl * 0.75;
    return o;
  }

  /** One leg of the run at phase `ph` (0 = this foot's contact); `b` 0 = the trot .. 1 = the full bound. */
  private leg(ph: number, b: number): void {
    const o = this.legOut;
    const f = ph - Math.floor(ph);
    if (f < STANCE) {
      const t = f / STANCE;
      o.f = CONTACT_F - RUN_CYCLE * f;
      o.u = 0;
      // Lands on the toes, the heel comes down softly, then peels away again for the push.
      o.p =
        t < 0.3 ? lerp(0.3, 0.06, smoothstep(0, 0.3, t)) : lerp(0.06, 1.15, sat((t - 0.45) / 0.55) ** 1.6);
      // The toe tip is what stays put: the ball rolls up and over it as the heel lifts.
      o.f += TOE * (1 - Math.cos(o.p));
      o.u = TOE * Math.sin(o.p);
    } else {
      const t = (f - STANCE) / (1 - STANCE);
      // It leaves and meets the ground at the ground's own speed.
      const vf = -RUN_CYCLE * (1 - STANCE);
      const f1 = swingAt(SWING_BOUND, 1, t, vf, vf);
      const u1 = swingAt(SWING_BOUND, 2, t, 55, -95);
      const p1 = swingAt(SWING_BOUND, 3, t, 4, -1.5);
      if (b < 0.999) {
        o.f = lerp(swingAt(SWING_TROT, 1, t, vf, vf), f1, b);
        o.u = lerp(swingAt(SWING_TROT, 2, t, 30, -45), u1, b);
        o.p = lerp(swingAt(SWING_TROT, 3, t, 3, -1), p1, b);
      } else {
        o.f = f1;
        o.u = u1;
        o.p = p1;
      }
      o.u = Math.max(0, o.u);
      // ... and the same roll carries on for a moment either side of the stance (no step at toe-off or contact).
      const roll = Math.max(0, 1 - t / 0.1, (t - 0.9) / 0.1);
      o.f += TOE * (1 - Math.cos(o.p)) * roll;
      o.u += TOE * Math.sin(o.p) * roll;
    }
  }

  /**
   * The run. At speed a bound: long and light, the torso tipped well forward with the head level
   * and reaching, a float between footfalls with the legs in a split, arms trailing low behind.
   * At low speed (starting, stopping, short taps) a lighter, more upright trot; the two blend with speed.
   */
  private runPose(ph: number): Pose {
    const o = this.tmp2;
    const k = this.speedK;
    const b = this.boundK;
    this.leg(ph, b);
    o[AF] = this.legOut.f;
    o[AU] = this.legOut.u;
    o[AP] = this.legOut.p;
    this.leg(ph + 0.5, b);
    o[BF] = this.legOut.f;
    o[BU] = this.legOut.u;
    o[BP] = this.legOut.p;
    // Body height: lowest just after mid-stance (the soft give), a long rounded top in the float.
    const x = 2 * (ph - STANCE * 0.5 - 0.02);
    const c1 = Math.cos(TAU * x);
    const s1 = Math.sin(TAU * x);
    const rise = 0.5 - 0.5 * c1 + 0.1 * (0.5 - 0.5 * Math.cos(2 * TAU * x));
    o[PU] = lerp(30.4, 27.8, b) + lerp(3.2, 9.4, b) * rise ** 0.7;
    // The hips sit back a little under the tipped spine, and surge with each push.
    o[PF] = 1 - 2.6 * b + 1.1 * Math.sin(TAU * (x - 0.12));
    // Chest leading: tipped into the run, opening a touch through the float, folding into the landing.
    o[LEAN] = 0.09 + 0.55 * k + 0.045 * b * s1;
    o[CURL] = 0.03 + 0.09 * b + 0.025 * Math.cos(TAU * (x - 0.2));
    // The head stays level and reaches: it gives back what the spine leans, chin a little up.
    o[HT] = -0.05 - 0.25 * k + 0.014 * Math.cos(TAU * (x - 0.3));
    // Arms: trailing low behind the hips, open; a small lazy swing against the legs, never a pump.
    const a = Math.sin(TAU * (ph - 0.07));
    const a2 = Math.sin(TAU * (ph - 0.16));
    // The near arm hangs lower than the far one, so its open hand trails BELOW the streaming cape
    // and reads; the far arm lies along the cape.
    const nearA = sat(0.5 + 1.6 * this.yaw.x);
    const lowF = lerp(-6.5, -12.4, b);
    const lowU = lerp(-13.4, -12, b);
    const highF = lerp(-7, -11.5, b);
    const highU = lerp(-13, -8.8, b);
    o[HAF] = lerp(highF, lowF, nearA) + 2.6 * a;
    o[HAU] = lerp(highU, lowU, nearA) + 1.4 * a * a + 1.2 * rise * b;
    o[HBF] = lerp(lowF, highF, nearA) - 2.6 * a2;
    o[HBU] = lerp(lowU, highU, nearA) + 1.2 * a2 * a2 + 1.2 * rise * b;
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
