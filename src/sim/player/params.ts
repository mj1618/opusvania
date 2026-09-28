import { derive, type MovementProfile, type Tuning } from '../tuning';

/**
 * The flat, per-frame parameter set the controller reads. Built from the live tuning, the
 * player's movement profile and the assist toggles, so the controller never branches on "is this
 * assist on": a disabled assist just shows up here as 0 / false (spec §3.1).
 *
 * Profile pipeline (MovementProfile in tuning.ts): base tuning -> `shape` re-derives the jump
 * constants -> `set` replaces values -> `scale` multiplies them -> assists applied.
 */
export interface MoveParams {
  tileSize: number;
  gravity: number;
  jumpSpeed: number;
  doubleJumpSpeed: number;
  pogoSpeed: number;
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

  pogoActiveFrames: number;
  pogoProbeW: number;
  pogoProbeH: number;
  orbSize: number;

  spikeDepthPx: number;
  spikeInsetPx: number;
  deathFreezeFrames: number;

  dropThroughFrames: number;
  footstepPx: number;
  hardLandFallPx: number;
  transitionFrames: number;
  goalBeatFrames: number;
  doorTriggerTiles: number;
  /** Combat rooms (the seize kit): hazards cost Chin and respawn at the last safe ground. */
  hazardDmg: number;
  hazardRespawnFrames: number;
  hazardIframes: number;
}

type Groups = Record<string, Record<string, unknown>>;

/** Applies a profile to a tuning, returning a new object that shares untouched groups. */
export function applyProfile(t: Tuning, profile: MovementProfile): Tuning {
  const out = { ...t } as unknown as Groups;
  const touch = (group: string): Record<string, unknown> => {
    const src = (t as unknown as Groups)[group];
    if (!src) throw new Error(`Profile references unknown tuning group "${group}"`);
    if (out[group] === src) out[group] = { ...src };
    return out[group] as Record<string, unknown>;
  };
  if (profile.shape) {
    const shape = { ...t.shape, ...profile.shape };
    Object.assign(touch('shape'), shape);
    Object.assign(touch('jump'), derive(shape));
  }
  for (const [path, v] of Object.entries(profile.set ?? {})) {
    const [g = '', k = ''] = path.split('.');
    const grp = touch(g);
    if (!(k in grp)) throw new Error(`Profile sets unknown tuning path "${path}"`);
    grp[k] = v;
  }
  for (const [path, m] of Object.entries(profile.scale ?? {})) {
    const [g = '', k = ''] = path.split('.');
    const grp = touch(g);
    const cur = grp[k];
    if (typeof cur !== 'number') throw new Error(`Profile scales non-numeric tuning path "${path}"`);
    grp[k] = cur * m;
  }
  return out as unknown as Tuning;
}

/** The base profile name: no overrides. */
export const BASE_PROFILE = 'base';

export function resolveTuning(t: Tuning, profile: string): Tuning {
  if (profile === BASE_PROFILE) return t;
  const p = t.profiles[profile];
  if (!p) throw new Error(`Unknown movement profile "${profile}". Known: base, ${Object.keys(t.profiles)}`);
  return applyProfile(t, p);
}

export function resolveParams(base: Tuning, profile: string): MoveParams {
  const t = resolveTuning(base, profile);
  const a = t.assists;
  const j = t.jump;
  const r = t.run;
  const s = t.assist;
  const w = t.wall;
  const d = t.dash;
  return {
    tileSize: t.world.tileSize,
    gravity: j.gravity,
    jumpSpeed: j.jumpSpeed,
    doubleJumpSpeed: j.doubleJumpSpeed,
    pogoSpeed: j.pogoSpeed,
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

    pogoActiveFrames: t.pogo.activeFrames,
    pogoProbeW: t.pogo.probeW,
    pogoProbeH: t.pogo.probeH,
    orbSize: t.pogo.orbSize,

    spikeDepthPx: t.hazard.spikeDepthPx,
    spikeInsetPx: t.hazard.spikeInsetPx,
    deathFreezeFrames: t.hazard.deathFreezeFrames,

    dropThroughFrames: t.misc.dropThroughFrames,
    footstepPx: t.misc.footstepPx,
    hardLandFallPx: t.misc.hardLandFallPx,
    transitionFrames: t.world.transitionFrames,
    goalBeatFrames: t.world.goalBeatFrames,
    doorTriggerTiles: t.world.doorTriggerTiles,
    hazardDmg: t.kid.hazardDmg,
    hazardRespawnFrames: t.kid.hazardRespawnFrames,
    hazardIframes: t.kid.iframes,
  };
}
