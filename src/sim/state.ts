import type { InputFrame } from './input';
import type { Body } from './physics/aabb';

/** Everything the sim needs to continue. Plain JSON: no classes, Maps, typed arrays or functions. */
export interface GameState {
  version: 1;
  /** Sim steps since the state was created. The sim's only clock. */
  frame: number;
  /** Seed the RNG was last seeded with (informational; `rng` is the live RNG state). */
  seed: number;
  rng: number;
  roomId: string;
  /** Input mask consumed on the previous step, for edge detection. */
  prevInput: InputFrame;
  player: PlayerState;
}

export interface PlayerState extends Body {
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  /** Frames left in which a jump is still allowed after leaving the ground. */
  coyote: number;
  /** Frames left in which a buffered jump press is still live. */
  jumpBuffer: number;
  /** True while rising from a jump that can still be cut short by releasing jump. */
  rising: boolean;
}

/** Deep copy via JSON, which also guarantees the state stays plain JSON. */
export function cloneState(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}
