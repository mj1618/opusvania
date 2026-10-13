import type { InputFrame } from './input';

/**
 * The whole sim state: plain JSON (finite numbers, strings, booleans, null), so it can be cloned,
 * hashed and compared. The scene is static and lives outside it.
 */

/** Controller state machine. */
export type PlayerMode = 'normal' | 'wallSlide' | 'dash';

/**
 * What the body is doing, for animation: derived at the end of every step from mode, ground
 * contact, velocity and input. `dash` includes the freeze frames at its start.
 */
export type Motion = 'idle' | 'run' | 'skid' | 'rise' | 'fall' | 'wallSlide' | 'dash';

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
  /** Highest point (smallest y) of the current airtime. */
  airTopY: number;

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
}

export interface GameState {
  version: 6;
  /** Sim steps taken. The sim's only clock. */
  frame: number;
  seed: number;
  /** Seeded RNG state (src/sim/rng.ts). */
  rng: number;
  prevInput: InputFrame;
  player: PlayerState;
}

export function cloneState(s: GameState): GameState {
  return { ...s, player: { ...s.player } };
}
