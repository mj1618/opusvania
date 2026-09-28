/**
 * The deterministic render clock. Every time-based render effect (flicker, grain, particle drift,
 * smoke) reads this, never performance.now() or Date, so clips and screenshot tests reproduce
 * exactly: time is the sim frame plus the interpolation alpha.
 */
export interface RenderClock {
  /** Sim frame (GameState.frame). */
  frame: number;
  /** Interpolation between the previous and current sim state, 0..1. */
  alpha: number;
  /** frame - 1 + alpha: continuous time in sim frames. */
  t: number;
  /** Sim frames since the current room was built. */
  roomFrame: number;
}

export function makeClock(frame: number, alpha: number, roomFrame: number): RenderClock {
  return { frame, alpha, t: frame - 1 + alpha, roomFrame };
}
