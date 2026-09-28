/**
 * Every gameplay number lives here (movement-spec §3). The Tweakpane panel (backquote key) edits
 * the live `tuning` object; write values you like back into this file ("Copy JSON" in the panel).
 *
 * Units: the sim works per frame at the fixed 60 Hz step. Distances are px at the 1920x1080
 * reference (64 px tiles), velocities px/f (x60 = px/s), accelerations px/f², durations frames.
 *
 * Layout:
 *  - `shape` is the jump shape; `jump.gravity/jumpSpeed/doubleJumpSpeed/pogoSpeed` are derived
 *    from it with `derive()` (Pittman, discrete form, spec §3.1). Change the shape, then call
 *    `applyShape(t)` (the panel does this).
 *  - `assists` are the A/B toggles. When one is off, its parameter is treated as 0/false by
 *    `resolveParams` (src/sim/player/params.ts), so the controller code path is identical.
 *  - `PRESETS` (`opus`, `celeste`, `hk`) are override sets on top of the defaults (§3.3).
 *  - `profiles` are named movement profiles (weight classes, water...) applied per player at
 *    runtime on top of the live tuning; see src/sim/player/params.ts.
 */

export const SHAPE = { jumpHeightPx: 272, apexFrames: 24, doubleJumpHeightPx: 192, pogoHeightPx: 176 };
export type JumpShape = typeof SHAPE;

/** Launch speed that reaches height h under gravity g with our integrator (spec §3.1). */
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
    pogoSpeed: speedForHeight(g, s.pogoHeightPx),
  };
}

const D = derive(SHAPE);

/**
 * A movement profile: a named override set applied to the live tuning for one player
 * (weight classes next loop: feather / middle / heavy; later water). `shape` re-derives the jump
 * constants from the base shape merged with it; then `set` replaces values; then `scale`
 * multiplies them. Keys are `group.key` tuning paths (e.g. `"jump.fallMult"`).
 */
export interface MovementProfile {
  shape?: Partial<JumpShape>;
  set?: Record<string, number | boolean | string>;
  scale?: Record<string, number>;
}

export const defaultTuning = {
  world: {
    /** Tile edge in px (64 px tiles at 1080p, spec §1.1). */
    tileSize: 64,
    /** Frames the player is frozen while a room transition fades out. */
    transitionFrames: 10,
    /** Minimum room size in tiles; smaller rooms are padded with solid (spec §6.1). */
    minRoomW: 30,
    minRoomH: 17,
  },
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
    /** POGO_V (derived from shape.pogoHeightPx). */
    pogoSpeed: D.pogoSpeed,
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
    /** Double jumps per airtime (refilled on ground, wall jump and pogo). */
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
    /** How long a buffered press can still become a double jump (HK queues these for longer). */
    doubleJumpBufferFrames: 6,
    headCorrectPx: 20,
    ledgePopPx: 16,
    dashCorrectPx: 24,
    wallRetainFrames: 4,
  },
  wall: {
    /** Slide speed cap: starts at slideStartMax and rises by slideRamp per frame of sliding up to
     * slideMax (Celeste's WallSlideStartMax/WallSlideTime), so a quick touch-and-jump is calm but a
     * long slide gets out of the way. L2 playtest: a flat 4 px/f felt glued. */
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
  pogo: {
    activeFrames: 8,
    probeW: 48,
    probeH: 64,
    orbSize: 48,
  },
  hazard: {
    spikeDepthPx: 32,
    spikeInsetPx: 8,
    deathFreezeFrames: 20,
  },
  misc: {
    dropThroughFrames: 10,
    /** Grounded distance between `step` (footstep) events. */
    footstepPx: 96,
    /** A landing is "hard" (big dust, shake, heavy SFX) past this fall height or at max fall speed. */
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
  /**
   * Combat foundations (combat-spec §2, L3 brief §2.3). Hitstop per class in frames; knockback in
   * px/f; everything else in frames unless stated.
   */
  combat: {
    hitstopLight: 4,
    hitstopMedium: 6,
    hitstopHeavy: 10,
    hitstopSeizeTake: 5,
    hitstopCatch: 10,
    hitstopRepossess: 16,
    hitstopHurt: 8,
    hitstopCap: 16,
    actionBufferFrames: 8,
    /** Frames an enemy's voices stay open after it takes a punch. */
    rattledFrames: 30,
    staggerFrames: 36,
    enemyKbLight: 6,
    enemyKbMedium: 10,
    enemyKbHeavy: 14,
    enemyKbSeizeTug: 4,
    /** Enemy knockback decays by this much per frame. */
    enemyKbDecay: 1,
    kidRecoilGroundLight: -4,
    kidRecoilAirLight: -6,
    kidRecoilMedium: -5,
    kidRecoilFrames: 4,
    maxAttackTokens: 2,
    retrieveSpeedMult: 1.25,
    absorbFrames: 8,
    revoiceFrames: 480,
    downFrames: 12,
    countBeats: 10,
    countBeatFrames: 12,
    /** Return to sender damage multiplier (rounded up); it always knocks the owner down. */
    returnMult: 1.5,
    launchVy: -14,
    launchFrames: 30,
    /** Snatch pushes Kid back at this speed (px/f). */
    snatchPushVx: 8,
    /** Enemy physics: gravity (px/f²) and max fall (px/f). */
    enemyGravity: 0.9,
    enemyMaxFall: 20,
    /** Furious rise: telegraphs never drop below this. */
    minTelegraph: 15,
    /** Frames an enemy takes to get up after the Count runs out with HP left. */
    riseFrames: 12,
    /** Chasers stop closing in when this near Kid (px between centres). */
    chaseStopPx: 48,
  },
  /** Kid Tallow's health and hurt reaction (combat-spec §3.1). */
  kid: {
    chin: 5,
    contactDmg: 1,
    iframes: 78,
    hurtLock: 12,
    hurtVx: 10,
    hurtVy: -8,
    /** The Slip (dash) is invulnerable on frames 1..slipIframesTo. */
    slipIframesTo: 10,
  },
  bag: {
    slots: 3,
  },
  /**
   * Levy by colour (combat-spec §1.5; traversal behaviour from the L3 brief). Flight speeds px/f,
   * gravity as a multiple of the base (feather) jump gravity. `dropVy` = straight-down speed of a
   * downward levy; `upVy` = speed of an upward levy; recoil/spring heights in px.
   */
  levy: {
    brownVx: 8,
    brownVy: -10,
    brownUpVy: -16,
    brownDropVy: 24,
    brownGravityMult: 1.2,
    brownDmg: 6,
    brownW: 64,
    brownH: 48,
    brownRecoilPx: 176,
    pinkVx: 6,
    pinkVy: -12,
    pinkUpVy: -18,
    pinkDropVy: 0,
    pinkGravityMult: 1,
    pinkDmg: 2,
    pinkW: 64,
    pinkH: 16,
    /** Kid's spring bounce height (brief §8 #4: 448, not the spec's 240). */
    pinkSpringPx: 448,
    pinkRecoilPx: 128,
    pinkEnemyLaunchVy: -14,
    /** Frames a spring shows compressed after a bounce (render reads it). */
    pinkSquashFrames: 4,
    violetVx: 20,
    violetVy: 0,
    violetUpVy: -20,
    violetDropVy: 20,
    violetGravityMult: 0,
    violetDmg: 3,
    violetW: 32,
    violetH: 16,
    violetRecoilPx: 96,
    /** Fraction of Kid's vx added to a forward levy (0 = the spec: fixed throw speed). */
    inheritVx: 0,
  },
  /** Weight class from brown sounds in the bag (critique A graft). */
  weight: {
    middleAt: 1,
    heavyAt: 2,
    /** Knockback taken per class (heavy ignores it; i-frames still apply). */
    kbFeather: 1.25,
    kbMiddle: 1,
    kbHeavy: 0,
    /** Extra punch damage while heavy; jab recovery change while feather (frames). */
    heavyPunchBonus: 1,
    featherJabRecovery: -2,
  },
  plate: {
    /** A slab presses a plate when it overlaps the plate tiles by at least this much. */
    minOverlapPx: 16,
  },
  /**
   * Movement profiles (see MovementProfile). The L3 weight classes: `feather` is exactly the
   * L2-tuned base (brief §8 #3); `middle` and `heavy` are heavier variants (3.5 and 2.5 tiles).
   */
  profiles: {
    feather: {},
    middle: {
      shape: { jumpHeightPx: 224, apexFrames: 22 },
      scale: { 'jump.fallMult': 1.1, 'run.maxSpeed': 0.95 },
    },
    heavy: {
      shape: { jumpHeightPx: 160, apexFrames: 20 },
      scale: { 'jump.fallMult': 1.3, 'run.maxSpeed': 0.85, 'wall.slideMax': 1.5 },
    },
  } as Record<string, MovementProfile>,
};

export type Tuning = typeof defaultTuning;
export type AssistName = keyof Tuning['assists'];
export const ASSIST_NAMES = Object.keys(defaultTuning.assists) as AssistName[];

/** Groups the tuning panel edits as plain values (profiles are edited as JSON). */
export const VALUE_GROUPS = [
  'world',
  'body',
  'shape',
  'jump',
  'run',
  'assist',
  'wall',
  'dash',
  'pogo',
  'hazard',
  'misc',
  'assists',
  'combat',
  'kid',
  'bag',
  'levy',
  'weight',
  'plate',
] as const;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type TuningOverrides = DeepPartial<Omit<Tuning, 'profiles'>>;

const RUN_INSTANT = 999;

/**
 * Presets for blind A/B (spec §3.3). Celeste and Hollow Knight values are converted to our scale
 * (1 Celeste px = 8 px, 1 HK unit = 64 px, HK 50 Hz -> 60 Hz). Jump speeds for double jump and
 * pogo are re-derived from the preset's gravity by `applyPreset` so the gym heights still hold.
 */
export const PRESETS: Record<'opus' | 'celeste' | 'hk', TuningOverrides> = {
  opus: {},
  celeste: {
    jump: {
      gravity: 2,
      jumpSpeed: 14,
      fallMult: 1,
      releaseMult: 1,
      releaseMode: 'gravity',
      sustainFrames: 12,
      minJumpFrames: 0,
      apexHangVy: 16 / 3,
      apexHangMult: 0.5,
    },
    run: {
      maxSpeed: 12,
      groundAccel: 20 / 9,
      // RunReduce 400 px/s² (stopping with no input); RunAccel 1000 only when accelerating/turning.
      groundDecel: 8 / 9,
      groundTurn: 20 / 9,
      airAccel: (20 / 9) * 0.65,
      airDecel: (8 / 9) * 0.65,
      airTurn: (20 / 9) * 0.65,
      overspeedDecelGround: 8 / 9,
      overspeedDecelAir: (8 / 9) * 0.65,
    },
    assist: {
      coyoteFrames: 6,
      jumpBufferFrames: 5,
      doubleJumpBufferFrames: 5,
      headCorrectPx: 32,
      ledgePopPx: 0,
    },
    // Celeste's slide cap lerps from WallSlideStartMax 20 px/s to MaxFall 160 px/s over
    // WallSlideTime 1.2 s (72 f).
    wall: {
      slideMax: 64 / 3,
      slideStartMax: 8 / 3,
      slideRamp: 56 / 3 / 72,
      jumpVx: 52 / 3,
      forceFrames: 10,
    },
    dash: { speed: 32, frames: 9, freezeFrames: 3, cooldownFrames: 12, endVx: 64 / 3, jumpVx: 104 / 3 },
  },
  hk: {
    // Sustain 9 f gives a 5.56-tile jump with apex at 0.50 s (HK reference: ~5.6 u, 0.52 s); the
    // spec's 12 overshoots to 6.39 tiles (checked by the L2 feel report).
    jump: {
      gravity: 0.8427,
      jumpSpeed: 17.76,
      fallMult: 1,
      releaseMode: 'zero',
      sustainFrames: 9,
      minJumpFrames: 5,
    },
    run: {
      maxSpeed: 8.853,
      groundAccel: RUN_INSTANT,
      groundDecel: RUN_INSTANT,
      groundTurn: RUN_INSTANT,
      airAccel: RUN_INSTANT,
      airDecel: RUN_INSTANT,
      airTurn: RUN_INSTANT,
      overspeedDecelGround: RUN_INSTANT,
      overspeedDecelAir: RUN_INSTANT,
    },
    // HK's LEDGE_BUFFER_STEPS / JUMP_QUEUE_STEPS are 2 steps at 50 Hz = 40 ms = 2.4 frames at
    // 60 Hz; 3 frames keeps the whole 40 ms window (2 frames would be 33 ms).
    assist: {
      coyoteFrames: 3,
      jumpBufferFrames: 3,
      doubleJumpBufferFrames: 12,
      headCorrectPx: 0,
      ledgePopPx: 16,
    },
    // HK slides at a constant WALLSLIDE_SPEED (8 u/s): no ramp.
    wall: { slideMax: 8.53, slideStartMax: 8.53, slideRamp: 0, jumpVx: 17.07, forceFrames: 6 },
    dash: { speed: 21.33, frames: 15, freezeFrames: 0, cooldownFrames: 36, bufferFrames: 12 },
    assists: { apexHang: false },
  },
};
export type PresetName = keyof typeof PRESETS;
export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

/** The live tuning object. The debug panel mutates it; the sim only reads it. */
export const tuning: Tuning = cloneTuning(defaultTuning);

export function cloneTuning(t: Tuning): Tuning {
  return JSON.parse(JSON.stringify(t)) as Tuning;
}

/** Copies every value of `src` into `target` in place (keeps object identity for live references). */
export function assignTuning(target: Tuning, src: Tuning): void {
  const t = target as unknown as Record<string, Record<string, unknown>>;
  const s = src as unknown as Record<string, Record<string, unknown>>;
  for (const group of Object.keys(s)) {
    const from = s[group];
    if (!from) continue;
    const to = t[group] ?? {};
    if (group === 'profiles') for (const k of Object.keys(to)) if (!(k in from)) delete to[k];
    t[group] = Object.assign(to, JSON.parse(JSON.stringify(from)));
  }
}

/** Re-derives the jump constants from `t.shape` (after a shape edit). */
export function applyShape(t: Tuning): void {
  Object.assign(t.jump, derive(t.shape));
}

/** Full tuning for a preset: defaults with the preset's overrides on top. */
export function presetTuning(name: PresetName): Tuning {
  const preset = PRESETS[name];
  if (!preset) throw new Error(`Unknown preset "${name}". Known: ${PRESET_NAMES.join(', ')}`);
  const t = cloneTuning(defaultTuning);
  const tt = t as unknown as Record<string, Record<string, unknown>>;
  for (const [group, values] of Object.entries(preset)) Object.assign(tt[group] ?? {}, values);
  const pj = preset.jump;
  if (pj?.gravity !== undefined) {
    // Keep the gym's double-jump and pogo heights under the preset's gravity.
    t.jump.doubleJumpSpeed = speedForHeight(t.jump.gravity, t.shape.doubleJumpHeightPx);
    t.jump.pogoSpeed = speedForHeight(t.jump.gravity, t.shape.pogoHeightPx);
  }
  return t;
}

/** Writes a preset into the live tuning object in place (keeps profiles). */
export function applyPreset(t: Tuning, name: PresetName): void {
  const p = presetTuning(name);
  p.profiles = JSON.parse(JSON.stringify(t.profiles)) as Tuning['profiles'];
  assignTuning(t, p);
}
