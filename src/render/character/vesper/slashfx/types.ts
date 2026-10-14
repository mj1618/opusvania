/**
 * What the slash mark is fed: the cut that began (its stroke, step, direction), the blade point's
 * path (`StrokeAt`, from `rig.strokeAtRoll`), how far the cut has got each frame, the sim's
 * hitstop, and where a blow landed. The blade in her hand and the body's snap are the rig's.
 */
export type SlashDir = 'fwd' | 'up' | 'down';

/** A point of the crescent's arc, unit offset from the mark's origin: `u` 0 = its tail end, 1 = its leading end. */
export type StrokeAt = (q: number, out: { x: number; y: number }) => void;

/** A cut begins. */
export interface CutInfo {
  dir: SlashDir;
  /** Combo step 1-3 (a down slash is always 1). */
  step: number;
  /** The finisher: bigger, and it stands one frame longer. */
  heavy: boolean;
  /** The side the slash goes to (-1 / 1). */
  facing: number;
  /** The sim's hit reach for this step, px from the origin: the crescent's outer edge. */
  reach: number;
  /** Fractions of the cut at which the blade's point is on the crescent's tail end and on its leading end. */
  q0: number;
  q1: number;
  /** The crescent's belly as a fraction of the reach. */
  thick: number;
  /** The crescent is let out this much across its aim (up / down: the hit area is narrow). */
  wide: number;
  /** The belly sits this far toward the leading end (1 = the middle; the stroke's own shape). */
  skew: number;
}

/** What the mark gets every frame. Positions are world px; times are render seconds. */
export interface SlashFrame {
  dt: number;
  /** The sim's hitstop holds this frame: the crescent holds with her. */
  held: boolean;
  /** Where the crescent hangs from: a fixed offset from her body, so it moves with her and never drifts. */
  ox: number;
  oy: number;
  /** How far the cut has got, 0..1; -1 when no cut is running. */
  cutQ: number;
  /** Tone scale for the zone she is in (see `View.pale`). */
  pale: number;
  /** World y of the ground under the cut: nothing of the crescent is drawn below it (none if left out). */
  groundY?: number;
}
