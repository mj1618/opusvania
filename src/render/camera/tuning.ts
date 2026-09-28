/**
 * Camera constants (movement-spec §4). Render-side: render may import sim tuning, never the
 * reverse. Distances in world px at the 1080p reference, rates per 60 Hz frame.
 */
export const cameraTuning = {
  /** Feet sit at this fraction of the view height. */
  anchorY: 0.55,
  /** Dual forward focus: look-ahead distance, and how far to move before the focus flips. */
  lookaheadX: 160,
  focusSwitchPx: 48,
  lerpX: 0.1,
  lerpXDash: 0.18,
  /** Platform snapping: the vertical target only moves on landing, wall slide, or outside this window. */
  winTop: 0.25,
  winBot: 0.72,
  lerpY: 0.08,
  /** Fast-fall follow. */
  fallFollowVy: 12,
  fallLookahead: 128,
  lerpYFall: 0.22,
  /** Look up/down: grounded, no x input, holding Up/Down this long. */
  lookDelay: 24,
  lookUp: 224,
  lookDown: 256,
  lookLerp: 0.06,
  /** Trauma shake (Eiserloh): offset = shakeMaxPx * trauma² * noise. */
  shakeMaxPx: 24,
  shakeHz: 18,
  traumaDecay: 0.03,
  traumaHardLand: 0.3,
  traumaDeath: 0.5,
  /** Dash kick: directional impulse, decays by dashKickDecay per frame. */
  dashKickPx: 10,
  dashKickDecay: 0.8,
  zoneLerp: 0.08,
  /** Seed of the render-side shake noise (never the sim RNG). */
  shakeSeed: 7,
};
export type CameraTuning = typeof cameraTuning;
