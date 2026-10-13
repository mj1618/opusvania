import type { InputFrame } from './input';

/**
 * The whole sim state: plain JSON (finite numbers, strings, booleans, null), so it can be cloned,
 * hashed and compared. The scene is static and lives outside it.
 */

/** Controller state machine. */
export type PlayerMode = 'normal' | 'wallSlide' | 'dash';

/**
 * What the body is doing, for animation: derived at the end of every step from mode, ground
 * contact, velocity and input. `dash` includes the freeze frames at its start. `glide` is the wing
 * glide (mode stays 'normal', `gliding` is true).
 */
export type Motion = 'idle' | 'run' | 'skid' | 'rise' | 'fall' | 'glide' | 'wallSlide' | 'dash';

/** The thorn slash's direction; 'none' when she is not slashing. */
export type AttackDir = 'none' | 'fwd' | 'up' | 'down';

export interface PlayerState {
  // --- Body. (x, y) is the top-left of the collision box, integers. Feet centre = (x + w/2, y + h).
  x: number;
  y: number;
  /** Sub-pixel remainders in [-0.5, 0.5]. */
  rx: number;
  ry: number;
  w: number;
  h: number;
  /** Velocity in px/frame (x60 = px/s). vy > 0 is down. */
  vx: number;
  vy: number;

  // --- What an animator reads.
  facing: -1 | 1;
  mode: PlayerMode;
  /** Frames since `mode` last changed. */
  modeFrames: number;
  motion: Motion;
  /** Frames since `motion` last changed (0 on the frame it changes). */
  motionFrames: number;
  grounded: boolean;
  /** Frames since `grounded` last changed: time on the ground, or time in the air. */
  contactFrames: number;
  /** A solid is touching this side: -1 left, 1 right, 0 none. While wall sliding, the slide side. */
  wallDir: number;
  /** Held horizontal input this step: -1, 0, 1. */
  inputX: number;
  /** Braking against ground momentum. */
  skid: boolean;
  /** Dash direction (valid in mode 'dash') and frames of dash travel left. */
  dashDir: number;
  dashTimer: number;
  /** Freeze frames left (dash start: the body hangs before it moves). */
  freeze: number;
  /** Air dashes and double jumps left this airtime. */
  airDash: number;
  dj: number;
  /**
   * Highest point (smallest y) of the current airtime. A glide carries her, so it restarts the
   * count: after a glide this is where the wings last let go (a glided landing is never `hard`).
   */
  airTopY: number;
  /** Wing glide: wings open, sinking slowly (jump held while falling). `motion` is 'glide'. */
  gliding: boolean;
  /**
   * Thorn slash. `attack` is its direction from the `slash` event until `slashEnd` ('none'
   * otherwise); it and `attackFacing` (the side she faced when it started; a fwd slash goes that
   * way) never change mid-slash, whatever she does. `attackFrames` counts steps since it started
   * (0 on the `slash` frame; it holds during hitstop). `attackActive`: the hit area is live this
   * frame. `attackSeq` numbers the slashes (0 = none yet); `attackHits` = targets this one has hit.
   */
  attack: AttackDir;
  attackFacing: -1 | 1;
  attackFrames: number;
  attackActive: boolean;
  attackSeq: number;
  attackHits: number;
  /**
   * Combo step of the current (or last) slash: 1 the cut, 2 the return cut, 3 the finisher
   * (`attackFinisher`). A down slash is always step 1 and leaves the chain where it was.
   */
  attackStep: number;
  attackFinisher: boolean;
  /**
   * Lunge: extra horizontal px/f on top of `vx` from a forward slash on the ground, fading over a
   * few frames (signed: the slash's side). `hang`: frames left of the air hang of a forward / up
   * slash, while her fall is being held back.
   */
  lungeX: number;
  hang: number;
  /**
   * Hitstop frames left: a slash connected and the sim holds her for a beat (no movement, no
   * timers, `attackFrames` / `motionFrames` stand still; presses are still buffered). The rest of
   * the sim (pickups, pod glints, the frame count) and render time keep running.
   */
  hitstop: number;
  /** Recoil: extra horizontal px/f on top of `vx` (a shove from a slash that hit), fading fast. */
  kickX: number;

  // --- Controller internals (timers, buffers). Renderers should not need these.
  coyote: number;
  jumpBuf: number;
  djBuf: number;
  dashBuf: number;
  forceTimer: number;
  forceDir: number;
  dashCd: number;
  stick: number;
  slideT: number;
  retainVx: number;
  retainTimer: number;
  dropTimer: number;
  dropY: number;
  fromJump: boolean;
  cut: boolean;
  sustain: number;
  sustainV: number;
  framesSinceJump: number;
  stepDist: number;
  /** The current jump hold launched a ground-type jump, from this y (glide: see `carriedDropPx`). */
  carried: boolean;
  launchY: number;
  /** Slash: buffered press, and frames until the next one may start. */
  attackBuf: number;
  attackCd: number;
  /** Combo: the step the chain is on (0 = none), frames left to continue it, hangs used this airtime (bits). */
  comboStep: number;
  comboTimer: number;
  hangUsed: number;
}

/** Collectibles (src/sim/pickups.ts). */
export interface PickupsState {
  /**
   * One entry per `scene.pickups`, same order: 0 = waiting, n > 0 = woken and on its way (it is
   * collected in n more steps), -1 = collected.
   */
  timers: number[];
  /** Value gathered so far (a great glint counts for more than one). */
  count: number;
  /** How many pickups have been collected. */
  taken: number;
  /** Index of the last pickup in the current chain (0 = first), and frames left to extend it. */
  combo: number;
  comboTimer: number;
  /** Frames until the collect queue is free: keeps pickups woken together from landing together. */
  gate: number;
}

/** Lumen pods (src/sim/pods.ts). Every array has one entry per `scene.pods`, same order. */
export interface PodsState {
  /**
   * Hit points left; 0 = burst and open (until the scene restarts). It starts at the pod's `hp`
   * in the scene (default 1), which is its `hpMax`.
   */
  hp: number[];
  /** `attackSeq` of the last slash that hit it (one hit per slash). */
  hitBy: number[];
  /**
   * Glints set loose and still on their way to her, frames until the next one arrives, the gap
   * between them, and how many of the pod's worth have been set loose so far.
   */
  left: number[];
  timer: number[];
  gap: number[];
  paid: number[];
  /** How many pods have burst. */
  burst: number;
}

export interface GameState {
  version: 10;
  /** Sim steps taken. The sim's only clock. */
  frame: number;
  seed: number;
  /** Seeded RNG state (src/sim/rng.ts). */
  rng: number;
  prevInput: InputFrame;
  player: PlayerState;
  pickups: PickupsState;
  pods: PodsState;
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    player: { ...s.player },
    pickups: { ...s.pickups, timers: s.pickups.timers.slice() },
    pods: {
      hp: s.pods.hp.slice(),
      hitBy: s.pods.hitBy.slice(),
      left: s.pods.left.slice(),
      timer: s.pods.timer.slice(),
      gap: s.pods.gap.slice(),
      paid: s.pods.paid.slice(),
      burst: s.pods.burst,
    },
  };
}
