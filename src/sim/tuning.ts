/**
 * Every gameplay number lives here. The Tweakpane panel (backquote key) edits the live `tuning`
 * object; write values you like back into this file ("Copy JSON" in the panel).
 *
 * Units: the sim works per frame at the fixed 60 Hz step. Distances are sim px (the logical view
 * is 1920x1080 sim px, 64 px = one "tile"), velocities px/f (x60 = px/s), accelerations px/f²,
 * durations frames.
 *
 * Layout:
 *  - `shape` is the jump shape; `jump.gravity/jumpSpeed/doubleJumpSpeed` are derived from it with
 *    `derive()` (Pittman, discrete form). Change the shape, then call `applyShape(t)`.
 *  - `assists` are on/off toggles. When one is off, its parameter is treated as 0/false by
 *    `resolveParams` (src/sim/player/params.ts), so the controller code path is identical.
 */

export const SHAPE = { jumpHeightPx: 272, apexFrames: 24, doubleJumpHeightPx: 192 };
export type JumpShape = typeof SHAPE;

/** Launch speed that reaches height h under gravity g with our integrator. */
export function speedForHeight(g: number, h: number): number {
  return (g * (-1 + Math.sqrt(1 + (8 * h) / g))) / 2;
}

/** Exact discrete jump constants for a shape: apex H after T frames with semi-implicit Euler. */
export function derive(s: JumpShape = SHAPE) {
  const g = (2 * s.jumpHeightPx) / (s.apexFrames * (s.apexFrames + 1));
  return {
    gravity: g,
    jumpSpeed: g * s.apexFrames,
    doubleJumpSpeed: speedForHeight(g, s.doubleJumpHeightPx),
  };
}

const D = derive(SHAPE);

export const defaultTuning = {
  /** The player's collision box in sim px (the drawn character is a little taller: ears). */
  body: {
    width: 40,
    height: 80,
  },
  shape: { ...SHAPE },
  jump: {
    /** G_UP, px/f² (derived from shape). */
    gravity: D.gravity,
    /** JUMP_V, px/f (derived). */
    jumpSpeed: D.jumpSpeed,
    /** DJ_V (derived from shape.doubleJumpHeightPx). */
    doubleJumpSpeed: D.doubleJumpSpeed,
    /** Gravity multiplier while falling (vy >= 0). */
    fallMult: 1.6,
    /** Gravity multiplier after releasing jump while rising (releaseMode 'gravity'). */
    releaseMult: 4,
    /** 'gravity': release multiplies gravity. 'zero': release sets vy = 0 (Hollow Knight). */
    releaseMode: 'gravity' as 'gravity' | 'zero',
    /** Frames the launch speed is held while jump is held (Celeste VarJumpTime / HK JUMP_STEPS). */
    sustainFrames: 0,
    /** releaseMode 'zero': earliest frame after the jump that a release can stop the rise. */
    minJumpFrames: 0,
    /** Apex hang: gravity x apexHangMult while |vy| < apexHangVy and jump is held. */
    apexHangVy: 3,
    apexHangMult: 0.5,
    /** Double jumps per airtime (refilled on ground and wall jump). */
    doubleJumps: 1,
    /** Horizontal boost added in the input direction on a ground jump. */
    hBoost: 0,
    /** MAX_FALL, px/f (1280 px/s). */
    maxFall: 64 / 3,
    /** Max fall with Down held (fast fall), and how fast vy returns to maxFall after release. */
    fastFallMax: 32,
    fastFallAccel: 2 / 3,
  },
  run: {
    maxSpeed: 9.6,
    groundAccel: 3.2,
    groundDecel: 3.2,
    groundTurn: 4.8,
    airAccel: 2.4,
    airDecel: 1.2,
    airTurn: 2.4,
    /** Deceleration toward maxSpeed when faster than it and holding that way (momentum carry). */
    overspeedDecelGround: 1.6,
    overspeedDecelAir: 0.4,
  },
  assist: {
    coyoteFrames: 6,
    jumpBufferFrames: 6,
    /** How long a buffered press can still become a double jump. */
    doubleJumpBufferFrames: 6,
    /** Corner corrections, px: head bump, ledge pop-up, dash. */
    headCorrectPx: 20,
    ledgePopPx: 16,
    dashCorrectPx: 24,
    wallRetainFrames: 4,
  },
  wall: {
    /** Slide speed cap: starts at slideStartMax and rises by slideRamp per frame of sliding up to
     * slideMax, so a quick touch-and-jump is calm but a long slide gets out of the way. */
    slideMax: 6.5,
    slideStartMax: 2.5,
    slideRamp: 0.25,
    slideDecel: 1.5,
    /** Frames of holding away from the wall before a slide detaches. */
    stickFrames: 5,
    jumpVx: 13.44,
    /** Frames the wall-jump vx is forced (only when a direction was held on the jump frame). */
    forceFrames: 8,
    /** Wall-jump grace: a wall within this many px counts. */
    checkPx: 20,
  },
  dash: {
    speed: 24,
    frames: 12,
    /** Freeze frames at dash start, counting the press frame. */
    freezeFrames: 2,
    endVx: 9.6,
    /** vx of a dash-jump cancel. */
    jumpVx: 12,
    cooldownFrames: 24,
    bufferFrames: 6,
    airDashes: 1,
  },
  /** Collectibles (src/sim/pickups.ts). Distances are from the pickup to the nearest point of the body box. */
  pickups: {
    /** A glint within this many px of the body wakes and is hers. */
    wakePx: 84,
    /** Frames from waking to being absorbed (render: a beat of notice, then the flight). */
    flightFrames: 14,
    /** Great glints want a closer approach and take a longer, ceremonial pickup. */
    greatWakePx: 56,
    greatFrames: 46,
    greatValue: 5,
    /** Pickups woken together are absorbed at least this many frames apart, nearest first. */
    staggerFrames: 3,
    /** A pickup this soon after the last one continues the combo. */
    comboFrames: 50,
  },
  misc: {
    dropThroughFrames: 10,
    /** Grounded distance between `step` (footstep) events. */
    footstepPx: 96,
    /** A landing is "hard" past this fall height or at max fall speed. */
    hardLandFallPx: 320,
  },
  assists: {
    coyote: true,
    jumpBuffer: true,
    variableJump: true,
    apexHang: true,
    fastFall: true,
    headCorrect: true,
    ledgePop: true,
    dashCorrect: true,
    wallSpeedRetain: true,
    wallSlide: true,
    wallJumpGrace: true,
    wallJumpForce: true,
    landingPreference: true,
    dashJumpCancel: true,
    wallJumpRefill: true,
  },
};

export type Tuning = typeof defaultTuning;

export function cloneTuning(t: Tuning): Tuning {
  return JSON.parse(JSON.stringify(t)) as Tuning;
}

/** The live tuning object. The debug panel mutates it; the sim only reads it. */
export const tuning: Tuning = cloneTuning(defaultTuning);

/** Copies every value of `src` into `target` in place (keeps object identity for live references). */
export function assignTuning(target: Tuning, src: Tuning): void {
  const t = target as unknown as Record<string, Record<string, unknown>>;
  const s = src as unknown as Record<string, Record<string, unknown>>;
  for (const group of Object.keys(s)) Object.assign(t[group] ?? {}, JSON.parse(JSON.stringify(s[group])));
}

/** Re-derives the jump constants from `t.shape` (after a shape edit). */
export function applyShape(t: Tuning): void {
  Object.assign(t.jump, derive(t.shape));
}
