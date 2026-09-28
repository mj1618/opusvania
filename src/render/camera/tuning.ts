/**
 * Camera constants (movement-spec §4). Render-side: render may import sim tuning, never the
 * reverse. Distances in world px at the 1080p reference, rates per 60 Hz frame.
 */
export const cameraTuning = {
  /** Feet sit at this fraction of the view height. */
  anchorY: 0.55,
  /** Dual forward focus: look-ahead distance, and how far to move before the focus flips. */
  lookaheadX: 200,
  focusSwitchPx: 48,
  /** lerpX 0.15 leaves a v/lerp = 64 px lag at full run, so the effective lead is ~136 px. */
  lerpX: 0.15,
  /** Horizontal follow speed cap (px/frame): max(panMaxX, |vx| x panMaxVxMult). Keeps focus
   * reversals a pan (the 400 px swing would start at 60 px/f) while dashes still keep up. */
  panMaxX: 24,
  panMaxVxMult: 1.25,
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
  /** L2 playtest: 24 f + lerp 0.06 took ~57 f to be useful; now 90% of the offset at ~30 f. */
  lookDelay: 12,
  lookUp: 224,
  lookDown: 256,
  lookLerp: 0.12,
  /** Trauma shake (Eiserloh): offset = shakeMaxPx * trauma² * noise. */
  shakeMaxPx: 24,
  shakeHz: 18,
  traumaDecay: 0.03,
  /** Trauma² makes anything under ~0.45 invisible (< 5 px); these give ~7 px and ~15 px. */
  traumaHardLand: 0.55,
  traumaDeath: 0.8,
  /** Dash kick: directional impulse, decays by dashKickDecay per frame. */
  dashKickPx: 10,
  dashKickDecay: 0.8,
  /** Zone blend: the offset left by a zone change decays by zoneLerp per frame, but moves the
   * view at most zoneBlendMaxPx per frame (long blends start as a steady pan). */
  zoneLerp: 0.1,
  zoneBlendMaxPx: 32,
  /** Seed of the render-side shake noise (never the sim RNG). */
  shakeSeed: 7,
};
export type CameraTuning = typeof cameraTuning;
