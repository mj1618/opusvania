/**
 * Camera constants. Distances in world px, rates per 60 Hz sim frame.
 */
export const cameraTuning = {
  /** Feet sit at this fraction of the view height (when the scene bounds allow). */
  anchorY: 0.6,
  /** Dual forward focus: look-ahead distance, and how far to move before the focus flips. */
  lookaheadX: 200,
  focusSwitchPx: 48,
  /** Fraction of the remaining distance covered per frame. */
  lerpX: 0.1,
  lerpXDash: 0.14,
  /** Horizontal follow speed cap (px/frame): max(panMaxX, |vx| x panMaxVxMult). Keeps focus
   * reversals a pan while dashes still keep up. */
  panMaxX: 18,
  panMaxVxMult: 1.25,
  /** Vertical dead zone: the target only moves on landing, wall slide, or when the feet leave
   * this window (fractions of the view height). */
  winTop: 0.25,
  winBot: 0.78,
  lerpY: 0.07,
  /** Fast-fall follow: past this fall speed the camera leads below the feet. */
  fallFollowVy: 12,
  fallLookahead: 128,
  lerpYFall: 0.2,
};
export type CameraTuning = typeof cameraTuning;
