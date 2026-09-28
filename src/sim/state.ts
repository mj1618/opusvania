import type { InputFrame } from './input';
import type { Body } from './physics/aabb';
import type { Abilities, Spawn } from './world/rooms';

/** Everything the sim needs to continue. Plain JSON: no classes, Maps, typed arrays or functions. */
export interface GameState {
  version: 2;
  /** Sim steps since the state was created. The sim's only clock. */
  frame: number;
  /** Seed the RNG was last seeded with (informational; `rng` is the live RNG state). */
  seed: number;
  rng: number;
  roomId: string;
  /** Input mask consumed on the previous step, for edge detection. */
  prevInput: InputFrame;
  player: PlayerState;
  /** Set while a room transition fades out; the player is frozen until it loads the target. */
  transition: { to: string; spawn?: string; timer: number } | null;
  /** Per-visit room stats (reset when a room loads). */
  roomStats: { deaths: number; goal: boolean; optional: boolean; frames: number };
}

/** Controller states (movement-spec §2.1). POGO is an impulse inside 'normal', not a state. */
export type PlayerMode = 'normal' | 'wallSlide' | 'dash' | 'dead';

export interface PlayerState extends Body {
  /** px/f, +y is down. */
  vx: number;
  vy: number;
  facing: 1 | -1;
  state: PlayerMode;
  /** Ended the last frame standing on ground (solid or one-way). */
  grounded: boolean;
  /** Wall touching on that side (1 px probe): -1, 0 or 1. While sliding, the slide side. */
  wallDir: number;
  /** Ability gates. Rooms grant/deny these on load; the debug API can override. */
  abilities: Abilities;
  /** Movement profile name ('base' or a key of tuning.profiles). */
  profile: string;

  // Timers: N means N more usable frames. Used before they are decremented (spec §2.2).
  coyote: number;
  jumpBuf: number;
  /** Separate window for a buffered press to become a double jump (HK preset queues longer). */
  djBuf: number;
  dashBuf: number;
  /** Wall-jump forced-vx frames left, and the forced direction. */
  forceTimer: number;
  forceDir: number;
  dashCd: number;
  /** Dash frames left (moving frames), and freeze frames left (hitstop-style: nothing moves). */
  dashTimer: number;
  dashDir: number;
  freeze: number;
  /** Frames holding away from the wall while sliding. */
  stick: number;
  /** Wall speed retention (spec §2.4): vx that a wall zeroed, restorable for retainTimer frames. */
  retainVx: number;
  retainTimer: number;
  /** Drop-through: one-ways are ignored while dropTimer > 0 and top <= dropY. */
  dropTimer: number;
  dropY: number;
  pogoTimer: number;
  deathTimer: number;

  // Jump model (spec §2.5).
  /** Rising from a jump that release can cut. */
  fromJump: boolean;
  /** Released early: extra gravity (or vy = 0 in releaseMode 'zero') until the apex. */
  cut: boolean;
  /** Fixed-height bounce (pogo): jump release has no effect until the apex. */
  cutDisabled: boolean;
  /** Preset-only sustain (Celeste VarJumpTime): frames left holding vy at sustainV. */
  sustain: number;
  sustainV: number;
  framesSinceJump: number;

  /** Air dashes and double jumps left this airtime. */
  airDash: number;
  dj: number;

  /** Highest point (min y) since leaving the ground, for land.fallPx. */
  airTopY: number;
  /** Grounded distance since the last footstep event. */
  stepDist: number;
  /** Turning around on the ground (for the skid event's rising edge). */
  skid: boolean;
  /** Last respawn marker touched (null = the room's P). */
  respawn: Spawn | null;
}

/** Deep copy via JSON, which also guarantees the state stays plain JSON. */
export function cloneState(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}
