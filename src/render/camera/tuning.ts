/**
 * Camera constants. Distances in world px, times in 60 Hz sim frames.
 */
export const cameraTuning = {
  /** Feet sit at this fraction of the view height (when the scene bounds allow). */
  anchorY: 0.72,
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
  /**
   * Fast-fall follow: past this fall speed, once the feet are `fallBelow` px under the line the view
   * rests on (so not when coming down from a jump), the camera leads below the feet.
   */
  fallFollowVy: 12,
  fallBelow: 48,
  fallLookahead: 128,
  smoothYFall: 9,
  /**
   * The kick when a slash lands (render-side, `kick.ts`): the view jumps this many world px against
   * the cut (a cut, the finisher), `vertical` x that for up / down cuts, and returns on a critically
   * damped spring of `omega` rad/s (35 = home, to within 5%, in about 8 frames). The blow that kills
   * an enemy kicks `kill` x as far.
   */
  kick: { power1: 3.5, power2: 7, vertical: 0.8, omega: 35, kill: 1.4 },
  /**
   * Headroom: the view may rise above the scene top, to this far above the scene's canopy ceiling
   * (`scene.ceilingY`, the highest her box can go), so she keeps sky over her head on the summit and
   * at the top of a jump there. The layer tree's coverage grows by the same amount (`viewTop`).
   */
  headroom: 120,
  /**
   * Landing band: a landing only moves the vertical target when the new ground is more than `landUp`
   * above or `landDown` below the line the view rests on, so a chain of hops between islands of
   * about the same height does not bob the view. Once she has stayed on the ground for
   * `settleFrames` the view settles on her feet anyway.
   */
  landUp: 136,
  landDown: 64,
  settleFrames: 40,
  /**
   * Wing glide: the look-ahead grows by `extraX` in the direction of travel and the lead average
   * quickens to `leadFrames`; the view's target also leads `lookDown` px BELOW her feet (about 150 on screen once the spring's lag
   * at her sink rate is taken off) (she is sinking:
   * the landing has to be on screen), following on `smoothY`. `easeIn` / `easeOut` are the frames the
   * glide share takes to come and go; on landing the view eases back on the usual springs.
   */
  glide: { extraX: 300, leadFrames: 26, lookDown: 240, smoothY: 18, easeIn: 22, easeOut: 40 },
  /**
   * Standing at a lantern or the heart: once she has stood still for `frames`, within `reachX` /
   * `reachY` of one (its foot), the view eases `share` of the way from her to it (at most `maxX`) and
   * up by `lift`, so both are comfortably in frame. `ease` = frames of the ease (then the springs).
   */
  rest: { frames: 24, reachX: 260, reachY: 150, share: 0.5, maxX: 130, lift: 56, ease: 30 },
  /**
   * Fade and re-form (render-side, `reform.ts`). On `reform` the view glides from where she fell to
   * where she re-forms: `secMin`..`secMax` seconds by distance (`minDist`..`panCap` px); beyond
   * `panCap` the glide starts that far from its end (the rest is a cut under the dip). A soft dark
   * dip covers it: it comes on over the last `dipIn` s of the fade, holds for `dipHold` of the glide
   * and lifts by its end. `dip` / `dipCut` = how dark (0..1 of the overlay; `dipCut` when part of the
   * way is cut). Under `minDist` there is no dip, only a `secNear` ease. A restart dips from
   * `restartDip` and lifts over `restartSec`.
   */
  reform: {
    minDist: 200,
    panCap: 2400,
    secMin: 0.6,
    secMax: 0.9,
    secNear: 0.45,
    dipIn: 0.3,
    dipRise: 0.1,
    dipHold: 0.3,
    dip: 0.8,
    dipCut: 1,
    restartDip: 0.9,
    restartSec: 0.5,
  },
};
export type CameraTuning = typeof cameraTuning;
