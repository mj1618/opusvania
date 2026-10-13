/**
 * Camera constants. Distances in world px, times in 60 Hz sim frames.
 */
export const cameraTuning = {
  /** Feet sit at this fraction of the view height (when the scene bounds allow). */
  anchorY: 0.6,
  /**
   * Look-ahead: the view leads the player by up to lookaheadX in the direction of SUSTAINED
   * travel. The lead follows a slow average of vx / leadFullSpeed (leadFrames time constant), so
   * quick left-right reversals average out and the camera barely moves.
   */
  lookaheadX: 170,
  leadFullSpeed: 7,
  leadFrames: 55,
  /** Critically damped follow: roughly the frames taken to close most of the distance. */
  smoothX: 16,
  smoothXDash: 10,
  /** Vertical dead zone: the target only moves on landing, wall slide, or when the feet leave
   * this window (fractions of the view height). */
  winTop: 0.25,
  winBot: 0.78,
  smoothY: 22,
  /** Fast-fall follow: past this fall speed the camera leads below the feet. */
  fallFollowVy: 12,
  fallLookahead: 128,
  smoothYFall: 9,
};
export type CameraTuning = typeof cameraTuning;
