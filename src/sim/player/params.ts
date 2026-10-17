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
  wallKickFrames: number;
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

  glide: boolean;
  glideFall: number;
  glideCatchRate: number;
  glideCatchMin: number;
  glideSinkAccel: number;
  glideMinVy: number;
  glideMaxRun: number;
  glideAccel: number;
  glideDecel: number;
  glideTurn: number;
  glideCarriedDropPx: number;

  /** The live tuning (the slash's geometry is read from it by `slashBox`). */
  tuning: Tuning;
  /** Combo steps 1-3 (index 0-2). */
  steps: readonly SlashStep[];
  attackBuffer: number;
  comboWindow: number;
  recoilDecay: number;
  recoilUp: number;
  lungeFrames: number;
  hangVy: number;
  hangKeep: number;
  pogoSpeed: number;
  pogo: boolean;

  dropThroughFrames: number;
  footstepPx: number;
  hardLandFallPx: number;

  ceilingRate: number;

  hpMax: number;
  hurtVx: number;
  hurtVy: number;
  staggerFrames: number;
  steerFrames: number;
  hurtDecel: number;
  invulnFrames: number;
  fadeFrames: number;
  reformInvulnFrames: number;
  safeFrames: number;
  safeEnemyPx: number;
}

/** One combo step's numbers, frames rounded. */
export interface SlashStep {
  startup: number;
  active: number;
  duration: number;
  cooldown: number;
  power: number;
  hitstopBonus: number;
  knockback: number;
  recoil: number;
  recoilFoe: number;
  hitstopFoe: number;
  lunge: number;
  hangFrames: number;
}

function slashStep(s: Tuning['slash1']): SlashStep {
  return {
    startup: Math.max(0, Math.round(s.startupFrames)),
    active: Math.max(1, Math.round(s.activeFrames)),
    duration: Math.max(1, Math.round(s.durationFrames)),
    cooldown: Math.max(1, Math.round(s.cooldownFrames)),
    power: s.power,
    hitstopBonus: Math.max(0, Math.round(s.hitstopBonus)),
    knockback: s.knockback,
    recoil: s.recoil,
    recoilFoe: s.recoilFoe,
    hitstopFoe: Math.max(0, Math.round(s.hitstopFoe)),
    lunge: s.lunge,
    hangFrames: Math.max(0, Math.round(s.hangFrames)),
  };
}

export function resolveParams(t: Tuning): MoveParams {
  const a = t.assists;
  const j = t.jump;
  const r = t.run;
  const s = t.assist;
  const w = t.wall;
  const d = t.dash;
  const gl = t.glide;
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
    wallKickFrames: Math.max(0, Math.round(w.kickFrames)),
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

    glide: a.glide,
    glideFall: gl.fallSpeed,
    glideCatchRate: gl.catchRate,
    glideCatchMin: gl.catchMin,
    glideSinkAccel: gl.sinkAccel,
    glideMinVy: gl.minVy,
    glideMaxRun: r.maxSpeed * gl.speedMult,
    glideAccel: gl.accel,
    glideDecel: gl.decel,
    glideTurn: gl.turn,
    glideCarriedDropPx: gl.carriedDropPx,

    tuning: t,
    steps: [slashStep(t.slash1), slashStep(t.slash2), slashStep(t.slash3)],
    attackBuffer: Math.max(1, Math.round(t.attack.bufferFrames)),
    comboWindow: Math.max(0, Math.round(t.attack.comboWindowFrames)),
    recoilDecay: t.attack.recoilDecay,
    recoilUp: t.attack.recoilUp,
    lungeFrames: Math.max(1, Math.round(t.attack.lungeFrames)),
    hangVy: t.attack.hangVy,
    hangKeep: t.attack.hangKeep,
    pogoSpeed: t.attack.pogoSpeed,
    pogo: a.pogo,

    dropThroughFrames: t.misc.dropThroughFrames,
    footstepPx: t.misc.footstepPx,
    hardLandFallPx: t.misc.hardLandFallPx,

    ceilingRate: Math.max(0, Math.min(1, t.ceiling.rate)),

    hpMax: Math.max(1, Math.round(t.health.max)),
    hurtVx: t.health.hurtVx,
    hurtVy: t.health.hurtVy,
    staggerFrames: Math.max(0, Math.round(t.health.staggerFrames)),
    steerFrames: Math.max(0, Math.round(t.health.steerFrames)),
    hurtDecel: t.health.hurtDecel,
    invulnFrames: Math.max(0, Math.round(t.health.invulnFrames)),
    fadeFrames: Math.max(1, Math.round(t.health.fadeFrames)),
    reformInvulnFrames: Math.max(0, Math.round(t.health.reformInvulnFrames)),
    safeFrames: Math.max(1, Math.round(t.health.safeFrames)),
    safeEnemyPx: t.health.safeEnemyPx,
  };
}
