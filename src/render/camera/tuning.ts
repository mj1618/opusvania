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
  /** north-star §3.1: look range about 6 tiles (35% of the view), as in HK (was 224 / 256). */
  lookUp: 376,
  lookDown: 376,
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

  // --- Zoom (north-star §3.1): render-only; the view is VIEW_W / zoom world px wide. ---
  /** Default zoom (HK scale, 13.5 player heights), and the hard limits. */
  zoomDefault: 1,
  zoomMin: 0.75,
  zoomMax: 1.1,
  /** Default zoom of `open` zones (big chambers, flow runs) and `vista` zones (set pieces). */
  zoomOpen: 0.9,
  zoomVista: 0.8,
  /** Rooms with a live enemy never zoom out further than this (the boxing kit needs the scale). */
  zoomEnemyMin: 0.9,
  /** Critically damped spring: omega 0.1 settles a change in ~50 frames (spec: 45-60 f). */
  zoomOmega: 0.1,
  /** Zoom speed cap per frame. */
  zoomMaxRate: 0.012,
  /** Snap to the target when this close (so a settled view renders at an exact scale). */
  zoomSnap: 0.0005,

  // --- Seams (edge exits, level-toolchain §5.5) ---
  /** Near an edge exit the room bound on that side relaxes by (half view + bleedPadPx) minus the
   * player's distance to the exit span, so the view runs on into the neighbour and never re-snaps.
   * Must exceed lookaheadX (and lookUp) or the bound still bites at the seam. */
  bleedPadPx: 420,

  // --- Declared shots ---
  /** A shot counts as framed (its hold starts) when the blend is within this many px and the
   * zoom within shotZoomEps of its target. */
  shotArrivePx: 12,
  shotZoomEps: 0.01,
  /** A shot releases after this many frames even if it never settled (the player walked on). */
  shotMaxFrames: 420,
  /** A shot keeps the player at least this fraction of the view inside its edges. */
  shotPlayerMargin: 0.12,
};
export type CameraTuning = typeof cameraTuning;
