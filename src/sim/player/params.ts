import type { Tuning } from '../tuning';

/**
 * The flat, per-frame parameter set the controller reads. Built from the live tuning and the
 * assist toggles, so the controller never branches on "is this assist on": a disabled assist just
 * shows up here as 0 / false.
 */
export interface MoveParams {
  gravity: number;
  jumpSpeed: number;
  doubleJumpSpeed: number;
  fallMult: number;
  releaseMult: number;
  releaseZero: boolean;
  sustainFrames: number;
  minJumpFrames: number;
  apexHangVy: number;
  apexHangMult: number;
  hBoost: number;
  doubleJumps: number;
  maxFall: number;
  fastFallMax: number;
  fastFallAccel: number;
  variableJump: boolean;

  maxRun: number;
  groundAccel: number;
  groundDecel: number;
  groundTurn: number;
  airAccel: number;
  airDecel: number;
  airTurn: number;
  overspeedDecelGround: number;
  overspeedDecelAir: number;

  coyoteFrames: number;
  jumpBufferFrames: number;
  doubleJumpBufferFrames: number;
  headCorrectPx: number;
  ledgePopPx: number;
  dashCorrectPx: number;
  wallRetainFrames: number;
  landingPreference: boolean;

  wallSlide: boolean;
  slideMax: number;
  slideStartMax: number;
  slideRamp: number;
  slideDecel: number;
  stickFrames: number;
  wallJumpVx: number;
  wallForceFrames: number;
  wallCheckPx: number;
  wallJumpRefill: boolean;

  dashSpeed: number;
  dashFrames: number;
  dashFreezeFrames: number;
  dashEndVx: number;
  dashJumpVx: number;
  dashJumpCancel: boolean;
  dashCooldownFrames: number;
  dashBufferFrames: number;
  airDashes: number;

  dropThroughFrames: number;
  footstepPx: number;
  hardLandFallPx: number;
}

export function resolveParams(t: Tuning): MoveParams {
  const a = t.assists;
  const j = t.jump;
  const r = t.run;
  const s = t.assist;
  const w = t.wall;
  const d = t.dash;
  return {
    gravity: j.gravity,
    jumpSpeed: j.jumpSpeed,
    doubleJumpSpeed: j.doubleJumpSpeed,
    fallMult: j.fallMult,
    releaseMult: j.releaseMult,
    releaseZero: j.releaseMode === 'zero',
    sustainFrames: j.sustainFrames,
    minJumpFrames: j.minJumpFrames,
    apexHangVy: a.apexHang ? j.apexHangVy : 0,
    apexHangMult: a.apexHang ? j.apexHangMult : 1,
    hBoost: j.hBoost,
    doubleJumps: j.doubleJumps,
    maxFall: j.maxFall,
    fastFallMax: a.fastFall ? j.fastFallMax : j.maxFall,
    fastFallAccel: j.fastFallAccel,
    variableJump: a.variableJump,

    maxRun: r.maxSpeed,
    groundAccel: r.groundAccel,
    groundDecel: r.groundDecel,
    groundTurn: r.groundTurn,
    airAccel: r.airAccel,
    airDecel: r.airDecel,
    airTurn: r.airTurn,
    overspeedDecelGround: r.overspeedDecelGround,
    overspeedDecelAir: r.overspeedDecelAir,

    coyoteFrames: a.coyote ? s.coyoteFrames : 0,
    // A press is always usable on the frame it happens; "off" means no extra frames.
    jumpBufferFrames: a.jumpBuffer ? Math.max(1, s.jumpBufferFrames) : 1,
    doubleJumpBufferFrames: a.jumpBuffer ? Math.max(1, s.doubleJumpBufferFrames) : 1,
    headCorrectPx: a.headCorrect ? s.headCorrectPx : 0,
    ledgePopPx: a.ledgePop ? s.ledgePopPx : 0,
    dashCorrectPx: a.dashCorrect ? s.dashCorrectPx : 0,
    wallRetainFrames: a.wallSpeedRetain ? s.wallRetainFrames : 0,
    landingPreference: a.landingPreference,

    wallSlide: a.wallSlide,
    slideMax: w.slideMax,
    slideStartMax: w.slideStartMax,
    slideRamp: w.slideRamp,
    slideDecel: w.slideDecel,
    stickFrames: w.stickFrames,
    wallJumpVx: w.jumpVx,
    wallForceFrames: a.wallJumpForce ? w.forceFrames : 0,
    // Without grace the wall must be touching (1 px probe).
    wallCheckPx: a.wallJumpGrace ? Math.max(1, w.checkPx) : 1,
    wallJumpRefill: a.wallJumpRefill,

    dashSpeed: d.speed,
    dashFrames: d.frames,
    dashFreezeFrames: d.freezeFrames,
    dashEndVx: d.endVx,
    dashJumpVx: d.jumpVx,
    dashJumpCancel: a.dashJumpCancel,
    dashCooldownFrames: d.cooldownFrames,
    dashBufferFrames: Math.max(1, d.bufferFrames),
    airDashes: d.airDashes,

    dropThroughFrames: t.misc.dropThroughFrames,
    footstepPx: t.misc.footstepPx,
    hardLandFallPx: t.misc.hardLandFallPx,
  };
}
