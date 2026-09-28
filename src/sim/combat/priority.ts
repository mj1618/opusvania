/**
 * Seize target priority: the ONE place it is defined (L3 audit #3). Every sound-source kind
 * handler (src/sim/sources.ts) returns one of these; the lowest non-zero value in the Seize box
 * wins, then the nearest centre, then the lowest id.
 */
export const SeizePri = {
  /** Not a target at all (nothing seizable home, inert). */
  none: 0,
  /** A Catch: an enemy telegraphing an armed attack, or one of its shots in flight. */
  catch: 1,
  /** An open enemy (recovery, stagger, launched, flinching, rattled by a punch). */
  open: 2,
  /** Down for the Count: a Seize repossesses. */
  downed: 3,
  /** A levied object (take it back). */
  levied: 4,
  /** A humming object. */
  object: 5,
  /** An enemy outside its open windows: 1 damage, whiff recovery, `seizeGuarded`. */
  guarded: 6,
  /** Hums but can't be taken (white static, a lot under the hammer): `seizeRefused`. */
  refused: 7,
} as const;

export type SeizePriority = (typeof SeizePri)[keyof typeof SeizePri];
