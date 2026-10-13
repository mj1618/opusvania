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
    groundAccel: 1.6,
    groundDecel: 2,
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
    /**
     * A wall kick rises for at least this many frames however short the press (letting go cannot
     * cut it before then), so a player who taps climbs a shaft, or one wall, as surely as one who holds.
     */
    kickFrames: 24,
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
  /**
   * Wing glide: holding jump while falling opens the wings. The fall is caught (not clamped) and
   * she sinks slowly with a little more reach. Rules: memory/movement-controller.md.
   */
  glide: {
    /** Steady sink speed, px/f (22.5% of maxFall). */
    fallSpeed: 4.8,
    /** The catch: each frame sheds this fraction of the speed above fallSpeed, at least catchMin px/f. */
    catchRate: 0.3,
    catchMin: 0.4,
    /** Acceleration up to fallSpeed when the glide starts slower than it (just after an apex), px/f². */
    sinkAccel: 0.35,
    /** Falling at least this fast before the wings can open, px/f. */
    minVy: 1,
    /** Top horizontal speed while gliding = run.maxSpeed x this. */
    speedMult: 1.1,
    /** Horizontal accel toward the held direction, drift decel with nothing held, and turn-around. */
    accel: 0.6,
    decel: 0.25,
    turn: 0.9,
    /** A hold carried over from a ground jump only glides once she is this far below the launch height. */
    carriedDropPx: 16,
  },
  /**
   * Thorn slash (rules: memory/combat.md): what all three steps of the combo share. The steps'
   * own numbers are in `slash1` / `slash2` / `slash3` below; the hit area is `slashBox` in
   * src/sim/player/attack.ts.
   */
  attack: {
    /** An early press waits this long for the cooldown (it never expires during a dash). */
    bufferFrames: 8,
    /** A slash that starts within this many frames of the last one's cooldown ending is the next step. */
    comboWindowFrames: 14,
    /** Forward: how far behind the body centre the area starts, and how far above centre it sits. */
    fwdBack: 14,
    fwdRaise: 8,
    /** Down slash (always the same, whatever the step): width, and reach from the body centre. */
    downWidth: 100,
    downReach: 120,
    /** Recoil on a hit: the shove back (`slashN.recoil`) fades by this each frame. Up, in the air: vy += recoilUp. */
    recoilDecay: 1,
    recoilUp: 2,
    /** Pogo: a down slash that hits sets vy to minus this (a hop of about 125 px, 17 frames up). */
    pogoSpeed: 15.5,
    /** Lunge (ground, forward): `slashN.lunge` px/f at the start, fading to nothing over this many frames. */
    lungeFrames: 5,
    /** Air hang (forward / up): for `slashN.hangFrames` her fall speed above hangVy is cut to this fraction each frame. */
    hangVy: 1.5,
    hangKeep: 0.5,
  },
  /** Combo step 1: the quick cut. Frames count from the press. */
  slash1: {
    /** Frames before the hit area is live, and how long it stays live. */
    startupFrames: 1,
    activeFrames: 6,
    /** Length of the whole slash (`slashEnd`), and the soonest the next one can start (press to press). */
    durationFrames: 14,
    cooldownFrames: 17,
    /** Forward: reach ahead of the body centre and height. Up: reach from the body centre and width. */
    fwdReach: 110,
    fwdHeight: 88,
    upReach: 124,
    upWidth: 100,
    /** Weight of a hit (events), extra hitstop frames on top of the target's, knockback for targets (px/f). */
    power: 1,
    hitstopBonus: 0,
    knockback: 6,
    /** Her own shove back on a forward hit, px/f. */
    recoil: 3,
    /** The same against a creature (a pod keeps `recoil`): the push she feels on a hit that counts. */
    recoilFoe: 4,
    /** Extra hitstop on a creature, on top of `enemies.hitstopFrames` (pods use `hitstopBonus`). */
    hitstopFoe: 0,
    /** Forward lunge on the ground, px/f at the start. Air hang, frames. */
    lunge: 3,
    hangFrames: 4,
  },
  /** Combo step 2: the return cut. The same blow; the finisher can follow a little later. */
  slash2: {
    startupFrames: 1,
    activeFrames: 6,
    durationFrames: 14,
    cooldownFrames: 19,
    fwdReach: 110,
    fwdHeight: 88,
    upReach: 124,
    upWidth: 100,
    power: 1,
    hitstopBonus: 0,
    knockback: 6,
    recoil: 3,
    /** The same against a creature (a pod keeps `recoil`): the push she feels on a hit that counts. */
    recoilFoe: 4,
    /** Extra hitstop on a creature, on top of `enemies.hitstopFrames` (pods use `hitstopBonus`). */
    hitstopFoe: 0,
    lunge: 3,
    hangFrames: 4,
  },
  /** Combo step 3: the finisher. A longer wind, a bigger and longer blow, a longer recovery. */
  slash3: {
    startupFrames: 3,
    activeFrames: 8,
    durationFrames: 20,
    cooldownFrames: 27,
    fwdReach: 135,
    fwdHeight: 108,
    upReach: 144,
    upWidth: 120,
    power: 2,
    hitstopBonus: 1,
    knockback: 11,
    recoil: 4,
    /** The same against a creature (a pod keeps `recoil`): the push she feels on a hit that counts. */
    recoilFoe: 6,
    /** Extra hitstop on a creature, on top of `enemies.hitstopFrames` (pods use `hitstopBonus`). */
    hitstopFoe: 3,
    lunge: 5.5,
    hangFrames: 6,
  },
  /** Lumen pods (src/sim/pods.ts): breakables that spill glints. A pod's toughness (`hp` 1-3) is scene data. */
  pods: {
    /** Half the size of the pod's box. */
    radius: 22,
    /** Glints a pod is worth in all, by its toughness (1, 2, 3 hp). */
    value1: 3,
    value2: 6,
    value3: 10,
    /** Glints knocked loose by each hit that does not burst it (part of its worth, not extra). */
    hitGlints: 1,
    /** Hitstop when a slash hits one, frames (the combo step may add to it). */
    hitstopFrames: 2,
    /**
     * Glints set loose reach her one at a time: the first this long after the hit, the rest
     * releaseStagger apart, or releaseStaggerBig apart when bigRelease or more go at once.
     */
    releaseFrames: 16,
    releaseStagger: 5,
    releaseStaggerBig: 3,
    bigRelease: 6,
  },
  /**
   * Vesper's health (rules: memory/enemies.md). She has `max` lights; contact with an enemy costs
   * one, knocks her back and makes her untouchable for a while. At none she fades and re-forms at
   * the last safe ground.
   */
  health: {
    max: 4,
    /** Knockback on a hit: px/f away from what hurt her, and up. */
    hurtVx: 7,
    hurtVy: 7,
    /** Frames she is out of control after a hit; held directions count again for the last `steerFrames` of them. */
    staggerFrames: 12,
    steerFrames: 3,
    /** How fast the knockback's vx fades while she is out of control, px/f². */
    hurtDecel: 0.3,
    /** Frames she cannot be hurt again, counted from the hit (the stagger is inside them). */
    invulnFrames: 70,
    /** At no health: frames she lies faded before she re-forms, and her invulnerability after. */
    fadeFrames: 50,
    reformInvulnFrames: 90,
    /** What a fade costs: she re-forms with this much health, and leaves this share of her wallet where she fell. */
    reformHp: 2,
    fadeDrop: 1 / 3,
    /** Safe ground: this many frames in a row on solid ground, at least this far from any living enemy. */
    safeFrames: 30,
    safeEnemyPx: 200,
  },
  /** What every enemy shares (src/sim/enemies.ts). */
  enemies: {
    /** Hitstop when a slash hits one, frames (the combo step may add to it). The creature holds for as long. */
    hitstopFrames: 4,
    /** The same for a down slash (the pogo): short, so the bounce rhythm stays what it was. */
    pogoHitstopFrames: 2,
    /** A cut that glances off a braced shell: she holds this long and is thrown back at this, px/f (fading by `attack.recoilDecay`). */
    blockHitstopFrames: 3,
    blockRecoil: 8,
    /** How long a dead body stays (for its death animation) before it is removed. */
    deadFrames: 30,
    /** Glints spilled on death reach her like a pod's: the first after this long, then a stagger apart. */
    releaseFrames: 16,
    releaseStagger: 5,
    releaseStaggerBig: 3,
    bigRelease: 6,
  },
  /** The burrback: a small armoured beetle that trundles along its platform. */
  burrback: {
    /** Collision box. */
    width: 52,
    height: 34,
    hp: 3,
    /** Walking speed, px/f. */
    speed: 1.6,
    /** Frames it stands still when it turns round at a ledge or a wall. */
    turnPauseFrames: 24,
    /** The same when it shies from a lit lantern's light or from an edge she is under: a longer beat, room for the flinch. */
    turnPauseShyFrames: 36,
    /** Now and then it rests mid-walk: every restEveryMin..Max frames of walking, for restMin..Max frames. */
    restEveryMin: 150,
    restEveryMax: 330,
    restMin: 20,
    restMax: 34,
    /** She lands or slashes within alertPx of it: it flinches for alertFrames, at most once per alertCooldown. */
    alertPx: 160,
    alertFrames: 18,
    alertCooldown: 45,
    /** Stagger after a hit, and how much of it (from the hit) its touch is harmless. */
    hurtFrames: 14,
    hurtSafeFrames: 8,
    /** Knockback (the slash's `knockback`, px/f) fades by this each frame; an up / down cut gives this share sideways. */
    knockDecay: 1,
    knockVertical: 0.5,
    /** A shove may leave this much of it hanging over a ledge, never more: it does not fall. */
    teeterPx: 10,
    /**
     * Lips. Where its ground ends in a drop it turns `lipClear` short of the edge (walls it walks
     * right up to), and it never takes a rest within `restLipClear` of one. While she is below it
     * (her feet more than `waryBelowPx` lower) and within `waryPx` sideways of such an edge, it keeps
     * away from that edge: it will not walk toward it inside `waryReachPx` of it. A platform too
     * short for all that keeps at least `minPatrol` px of walk.
     */
    lipClear: 96,
    restLipClear: 120,
    waryPx: 200,
    waryBelowPx: 24,
    waryReachPx: 320,
    waryStandFrames: 30,
    minPatrol: 48,
    /** Its touch hurt her: it is shoved back at this speed (fading by `knockDecay`), flinches this long, and turns away. */
    touchRecoil: 8.5,
    touchFlinchFrames: 30,
    /** A blow shoves it at the slash's `knockback` x this (px/f, fading by `knockDecay`): 32 px for a cut, 102 for the finisher. */
    knockScale: 1.25,
    /**
     * Its ram (memory/enemies.md). She is in front of it on its ground within `strikePx` (box to
     * box; 0 = it never rams), her feet no more than `strikeAbovePx` above / `strikeBelowPx` below
     * its own: it braces for `windupFrames` (the tell; a forward cut from its front glances off from
     * here to the end of the ram), rams `chargePx` at `chargeSpeed`, then stands spent for
     * `recoverFrames` and will not brace again for `strikeCooldown` after that. Cut from behind, it
     * comes round to her if she is within `turnOnHitPx`.
     */
    strikePx: 130,
    strikeAbovePx: 56,
    strikeBelowPx: 8,
    /**
     * Unprovoked it braces only at one inside its own range (the scene's `radius`): beside its patch
     * she is left alone. Cut (the blow lands), it braces as the stagger ends if she is within
     * `provokedPx`, wherever she stands. The ram itself runs its length, range or no range. Never at
     * one with a solid lower than `strikeHeadroomPx` over the ground she stands on (she could not
     * jump it).
     */
    provokedPx: 150,
    strikeHeadroomPx: 136,
    windupFrames: 26,
    chargeSpeed: 10,
    chargePx: 180,
    recoverFrames: 45,
    strikeCooldown: 150,
    turnOnHitPx: 320,
    /** What its touch costs her. */
    contactDamage: 1,
    /** Glints it spills when it dies, and when the finisher killed it. */
    value: 4,
    valueFinisher: 6,
  },
  /**
   * The lampwing: a small pale moth-wisp that hovers in the open air and is drawn to her light
   * (rules and the reasons for these numbers: memory/enemies.md). No attack: its touch hurts.
   */
  lampwing: {
    /** Collision box (drawn about 40 px across). */
    width: 36,
    height: 30,
    hp: 2,
    /** Territory: it wanders within this of its home unless the scene gives a `radius`. */
    radius: 120,
    /** Hover: drift speed and acceleration, px/f and px/f²; it slows inside `arrivePx` of a wander point. */
    hoverSpeed: 0.7,
    hoverAccel: 0.03,
    arrivePx: 40,
    /** A new wander point every wanderMin..Max frames (or when it gets there). */
    wanderMin: 90,
    wanderMax: 200,
    /** The bob: up to this much vertical speed, px/f, on a cycle of `bobFrames`. */
    bobSpeed: 0.16,
    bobFrames: 84,
    /** It notices her within this (centre to centre) with a clear line; then the tell, `curiousFrames`. */
    noticePx: 260,
    curiousFrames: 36,
    /** Its touch does nothing for this long after it notices her (the start of the tell). */
    noticeSafeFrames: 20,
    /** While curious it brakes and rises at this, px/f. */
    curiousRise: 0.5,
    curiousAccel: 0.06,
    /** Pursuit: top speed and acceleration (soft steering: it arcs and overshoots). */
    pursueSpeed: 2.2,
    pursueAccel: 0.075,
    /** It gives up after this long, when it has not seen her for `lostFrames`, or she is `leashPx` from its home. */
    pursueFrames: 360,
    lostFrames: 90,
    leashPx: 520,
    /** Having given up (or touched her) it hangs for `restFrames`, braking at `restBrake`, then flies home. */
    restFrames: 60,
    restBrake: 0.14,
    returnSpeed: 1.8,
    returnAccel: 0.06,
    /** Home is reached within this many px; it hovers (and can notice) again from there. */
    homePx: 24,
    /** It bounces off her at this speed, px/f, when its touch hurts her. */
    bounceSpeed: 5,
    /**
     * Stagger after a hit, and how much of it (from the hit) its touch is harmless: all of it. A
     * gliding hero cannot stop, so a mid-glide cut has to let her fly on through the tumbling thing:
     * 24 frames + the hitstop is 290 px of glide, more than her reach and its shove together, so a
     * cut that connects always clears the way (at 16 a cut from the end of her reach met it again as
     * it righted itself: playtest 4's `lamp-sky`).
     */
    hurtFrames: 24,
    hurtSafeFrames: 24,
    /** Knockback = the slash's `knockback` x `knockScale`, along the cut, fading `knockDecay` a frame. */
    knockScale: 1.1,
    knockDecay: 0.75,
    /** Dead: it falls (gravity, capped) for at most `deadFrames`; once it lands it lies `landFrames`. */
    deadFrames: 40,
    landFrames: 6,
    gravity: 0.45,
    maxFall: 9,
    /** Two lampwings closer than `sepPx` (centres) push apart, up to `sepAccel` px/f². */
    sepPx: 72,
    sepAccel: 0.3,
    /** It stays `poolClear` px above the water, which stands `poolDepth` over a pool's floor. */
    poolDepth: 50,
    poolClear: 12,
    /** What its touch costs her. */
    contactDamage: 1,
    /** Glints it spills when it dies, and when the finisher killed it. */
    value: 3,
    valueFinisher: 5,
    /** Wing beats per frame: hovering, at full pursuit speed, while curious, while tumbling. */
    flapHover: 0.1,
    flapPursue: 0.17,
    flapCurious: 0.21,
    flapHurt: 0.04,
  },
  /** Collectibles (src/sim/pickups.ts). Distances are from the pickup to the nearest point of the body box. */
  pickups: {
    /** A glint within this many px of the body wakes and is hers. */
    wakePx: 84,
    /** Frames from waking to being absorbed (render: a beat of notice, then the flight). */
    flightFrames: 18,
    /** Great glints want a closer approach and take a longer, ceremonial pickup. */
    greatWakePx: 56,
    greatFrames: 54,
    greatValue: 5,
    /** Pickups woken together are absorbed at least this many frames apart, nearest first. */
    staggerFrames: 4,
    /** A pickup this soon after the last one continues the combo. */
    comboFrames: 50,
    /** Glints she dropped when she faded lie in a cluster: touched (within `wakePx`), the first is back after `dropFrames`, the rest `dropStagger` apart. */
    dropFrames: 18,
    dropStagger: 3,
  },
  /**
   * The goal (src/sim/goal.ts, memory/goal.md): three moth-lanterns to kindle with gathered light,
   * then the heart of the grove wakes.
   */
  goal: {
    /** Glints a lantern takes unless the scene gives it its own `cost`. */
    cost: 12,
    /**
     * A wayside lamp (`scene.lamps`): a lesser lantern, optional. The same rules (stand, channel, lit
     * for good: rest, re-form, sanctuary, calm) but it does not count toward the heart. What it
     * takes unless the scene gives it its own `cost`.
     */
    lampCost: 8,
    /**
     * A dormant lantern or lamp is noticed once per approach: when her body centre first comes
     * within `noticePx` of the centre of its trigger box (`lanternNotice` / `lampNotice`, with what
     * she carries and what it takes), and not again until she has been `noticeLeavePx` away.
     */
    noticePx: 260,
    noticeLeavePx: 420,
    /** A lantern's trigger box: centred on its foot, standing up from the surface. */
    lanternWidth: 48,
    lanternHeight: 64,
    /**
     * She kindles one by being at it this many frames. It starts when she stands in its box; once
     * started it runs on while she stays within `kindleLeashPx` sideways and `kindleLeashUpPx` up or
     * down of the middle of that box, moving or not, jumping, cutting (a player who never stands
     * still lights it too). Leaving that leash or being hurt starts it over.
     */
    channelFrames: 30,
    kindleLeashPx: 260,
    kindleLeashUpPx: 330,
    /**
     * A wayside lamp is optional spending, so it wants intent: its channel only starts once she has
     * stood still at it (no direction held, not cutting) this long. A lantern starts at once.
     */
    lampStillFrames: 20,
    /** Standing at a lit one this long makes her whole again. */
    restFrames: 45,
    /**
     * Too little light: a lantern says so once she has stood still at it (|vx| under `refuseStillVx`)
     * for `refuseFrames` (a run through it says nothing). `refuseShowFrames` rides on the event: how
     * long the price is worth showing.
     */
    refuseFrames: 12,
    refuseStillVx: 0.5,
    refuseShowFrames: 150,
    /**
     * A lit lantern is a sanctuary. Burrbacks on its ground turn round `sanctuaryPx` short of it
     * (box edge to its foot) and one caught inside is harmless until it has walked out; lampwings
     * give up a pursuit `lampSanctuaryPx` from its centre and are harmless inside that.
     */
    sanctuaryPx: 110,
    lampSanctuaryPx: 160,
    /** It tells her again only after she has been this far from it (sideways). */
    refuseLeavePx: 160,
    /** Kindling calms the creatures within this of the lantern for `calmFrames` (burrbacks stand, lampwings give up). */
    calmPx: 900,
    calmFrames: 120,
    /** The heart's trigger box: centred on its point, standing up from the ground. */
    heartWidth: 96,
    heartHeight: 96,
    /** Held at the end, she walks on to within this of the heart's centre and stops there (0 = she stops where she is). */
    heartWalkPx: 12,
    /** Reaching the woken heart takes control for this many frames (`gather` ... `endHold`). */
    holdFrames: 240,
    /**
     * The offering: what she still carries goes into the heart during the hold, from
     * `offerDelayFrames` after `gather`, spread over `offerSpanFrames`. What she gives counts in
     * tiers (`offerTier1..3`) for the grove to answer.
     */
    offerDelayFrames: 45,
    offerSpanFrames: 140,
    offerTier1: 25,
    offerTier2: 50,
    offerTier3: 100,
    /** After `endHold`: false = she stays held until the restart; true = she may walk on (nothing can hurt her). */
    endedControl: false,
  },
  /**
   * The canopy: a soft ceiling at the scene's `ceilingY` (scene data; none if absent), so she never
   * leaves the top of the picture (the camera stops at the scene's top). The top of her box can
   * rise no faster than `rate` x its distance below it, so a jump eases to a stop there: no bump,
   * no event, sideways speed untouched.
   */
  ceiling: {
    rate: 0.5,
  },
  misc: {
    dropThroughFrames: 10,
    /** Grounded distance between `step` (footstep) events. */
    footstepPx: 96,
    /** A landing is "hard" past this fall height (a drop off a ledge is not; max fall speed is reached after 160 px). */
    hardLandFallPx: 420,
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
    glide: true,
    /** A down slash that hits bounces her up and refills the air dash and double jump. */
    pogo: true,
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
