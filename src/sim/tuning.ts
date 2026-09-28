/**
 * Every gameplay number lives here. The Tweakpane panel (backquote key) edits this object live;
 * write the values you like back into this file (the panel has a "Copy JSON" button).
 *
 * Units: pixels at the 1920x1080 reference resolution, seconds, px/s, px/s². Frame counts are
 * named `*Frames` and assume the fixed 60Hz step.
 *
 * NOTE: this is the Phase 0 placeholder controller. The real movement controller (Phase 1)
 * replaces the `player` and `jump` groups.
 */
export const defaultTuning = {
  world: {
    /** Tile edge in px (64px tiles at 1080p, see PLAN §3.1). */
    tileSize: 64,
  },
  player: {
    width: 40,
    height: 88,
    runSpeed: 600,
    groundAccel: 8000,
    groundDecel: 9000,
    airAccel: 6000,
    airDecel: 3000,
  },
  jump: {
    gravity: 5400,
    maxFallSpeed: 1400,
    jumpSpeed: 1500,
    /** Upward velocity is multiplied by this when jump is released early (variable jump height). */
    releaseCut: 0.45,
    coyoteFrames: 6,
    bufferFrames: 6,
  },
  fx: {
    /** Number of dust variants the sim picks from with the seeded RNG when landing. */
    landDustVariants: 3,
  },
};

export type Tuning = typeof defaultTuning;

/** The live tuning object. The debug panel mutates it; the sim only reads it. */
export const tuning: Tuning = cloneTuning(defaultTuning);

export function cloneTuning(t: Tuning): Tuning {
  return JSON.parse(JSON.stringify(t)) as Tuning;
}
