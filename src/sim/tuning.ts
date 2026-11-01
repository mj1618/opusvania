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

export const defaultTuning = withVariants({
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
    /**
     * With the wings and no double jump left, a press after walking off an edge is a jump only in the
     * first `coyoteFrames` of the coyote window; later in it, held, it is the glide (the walk-off glide she meant: curious
     * first-timer, "pressing jump as I left the edge counted as a jump", into R6's thorn branch). A coyote
     * jump is never `carried`: held, it glides from the apex.
     */
    coyoteFrames: 3,
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
    /**
     * A forward or up cut that meets terrain and nothing else (`slashTerrain`, feel review problem 10):
     * she holds this many frames and is pushed back this many px/f (fading by `recoilDecay`: ~3 px).
     */
    terrainHitstop: 2,
    terrainRecoil: 2,
    /**
     * The throw-cut (area 1 plan r5, item 2): a slash started during a lamp throw's launch
     * (`lures.throwFrames` after beating free) is heavy: `throwCutPower` x its power, `throwCutHitstop` more
     * hitstop on what it hits, `slash.heavy` / `slashHit.heavy` and a `throwCut` event. What it does to each
     * creature is the creature's rule (it may read `player.attackHeavy`).
     */
    throwCutPower: 3,
    throwCutHitstop: 4,
  },
  /** Combo step 1: the quick cut. Frames count from the press. */
  slash1: {
    /** Frames before the hit area is live, and how long it stays live. */
    startupFrames: 1,
    activeFrames: 6,
    /** Length of the whole slash (`slashEnd`), and the soonest the next one can start (press to press). */
    durationFrames: 14,
    cooldownFrames: 18,
    /** Forward: reach ahead of the body centre and height. Up: reach from the body centre and width. */
    fwdReach: 110,
    fwdHeight: 88,
    upReach: 124,
    upWidth: 100,
    /** Weight of a hit (events), extra hitstop frames on top of the target's, knockback for targets (px/f). */
    power: 1,
    hitstopBonus: 0,
    knockback: 7,
    /** Her own shove back on a forward hit, px/f. */
    recoil: 3,
    /** The same against a creature (a pod keeps `recoil`): the push she feels on a hit that counts. */
    recoilFoe: 5,
    /** Extra hitstop on a creature, on top of `enemies.hitstopFrames` (pods use `hitstopBonus`). */
    hitstopFoe: 0,
    /** Forward lunge on the ground, px/f at the start. Air hang, frames. */
    lunge: 3,
    hangFrames: 3,
  },
  /** Combo step 2: the return cut. The same blow; the finisher can follow a little later. */
  slash2: {
    startupFrames: 1,
    activeFrames: 6,
    durationFrames: 14,
    cooldownFrames: 18,
    fwdReach: 110,
    fwdHeight: 88,
    upReach: 124,
    upWidth: 100,
    power: 1,
    hitstopBonus: 0,
    knockback: 7,
    recoil: 3,
    /** The same against a creature (a pod keeps `recoil`): the push she feels on a hit that counts. */
    recoilFoe: 5,
    /** Extra hitstop on a creature, on top of `enemies.hitstopFrames` (pods use `hitstopBonus`). */
    hitstopFoe: 0,
    lunge: 3,
    hangFrames: 3,
  },
  /**
   * Combo step 3. Round 7 (Matt: "the attack feels average"): every cut has the same rhythm (HK's nail: a cut,
   * a cut, a cut, no slow wind-up), the third still the finisher: twice the blow, wider, a harder shove.
   */
  slash3: {
    startupFrames: 1,
    activeFrames: 6,
    durationFrames: 14,
    cooldownFrames: 18,
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
    hangFrames: 3,
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
   * Lures, the story's lamps (src/sim/lures.ts, docs/design/core.md §3, memory/lures.md). Each kind
   * is a row: `radius` = the pull field (px from the flame to her body centre), `pullEdge` /
   * `pullCore` = the pull at the field's edge and at the core, px/f² (gravity is 0.91 rising, 1.45
   * falling), growing with the square of how far in she is; `swirl` = the sideways part as a share of
   * the pull (she spirals in instead of falling straight in); `core` = the catch radius; `hp` = cuts
   * to put it out; `moths` = how many it holds (freed when it goes out).
   */
  lures: {
    kinds: {
      // (Since Matt's play, 2026-10-18, a lamp no longer drags her or catches her: no pull (`pullEdge` /
      // `pullCore` 0) and no core; `fling` = how near her body centre must be to fling off it.)
      wick: {
        radius: 240,
        pullEdge: 0,
        pullCore: 0,
        swirl: 0,
        core: 40,
        hp: 1,
        moths: 5,
        sharp: 1,
        fling: 110,
      },
      lantern: {
        radius: 360,
        pullEdge: 0,
        pullCore: 0,
        swirl: 0,
        core: 52,
        hp: 2,
        moths: 10,
        sharp: 1,
        fling: 140,
      },
      /**
       * A great lamp's ring flame (the Weaver's arena, memory/bosses.md): a wick whose moths feed the
       * heart (0 here: the heart frees them all when it goes out).
       */
      ring: {
        radius: 240,
        pullEdge: 0,
        pullCore: 0,
        swirl: 0,
        core: 40,
        hp: 1,
        moths: 0,
        sharp: 1,
        fling: 110,
      },
      /**
       * A great lamp's heart (wood.md §6: R 700, core 72, pull 0.2 -> 2.3, 3 hits, 60 moths). The boss
       * switches its row by phase (`state.lures.live.row`): `greatWide` is the last phase's bigger reach.
       * Both are faint far out and bite late (`sharp` 4: the depth is k^8; 0.05 px/f² at 320 px, 0.3 at
       * 200, 1.5 at 100): a field this big at a lantern's profile saturated her drift (12 px/f, faster
       * than her run) and no column face could be climbed (memory/bosses.md).
       */
      /**
       * A moonwick (Lanternroot, `moonwick` above): no pull, no moths, never cut out (the blade passes through
       * it); `fling` = its reach as an anchor, and the reach of a kindle. `radius` = its silver light.
       */
      moonwick: {
        radius: 420,
        pullEdge: 0,
        pullCore: 0,
        swirl: 0,
        core: 40,
        hp: 1,
        moths: 0,
        sharp: 1,
        fling: 110,
      },
      /**
       * The Gloam lamp (Lanternroot's mini-boss, src/sim/boss/gloam.ts): the boss runs its `great` lamp on this
       * row. No pull (the player keeps control), no fling, its light the arena's; 60 moths at the defeat.
       */
      gloam: {
        radius: 700,
        pullEdge: 0,
        pullCore: 0,
        swirl: 0,
        core: 72,
        hp: 3,
        moths: 60,
        sharp: 1,
        fling: 0,
      },
      great: {
        radius: 700,
        pullEdge: 0.02,
        pullCore: 2.3,
        swirl: 0.4,
        core: 72,
        hp: 3,
        moths: 60,
        sharp: 4,
        fling: 0,
      },
      greatWide: {
        radius: 1100,
        pullEdge: 0.02,
        pullCore: 2.3,
        swirl: 0.4,
        core: 72,
        hp: 3,
        moths: 60,
        sharp: 4,
        fling: 0,
      },
    },
    /**
     * The pull's sideways push is kept as its own momentum (`player.pullX`), so her steering does not
     * eat it and a pass through a field throws her (a gravity assist): kept this share per frame in
     * the air, never faster than `pullXMax`.
     */
    pullXKeep: 0.97,
    /**
     * The fling (Matt's play, 2026-10-18: "the lamp catch is super annoying"; Ori's Bash): Lamp pressed within a
     * burning flame's `fling` radius snaps the moment. She holds still and the world slows (creatures move one
     * step in `flingSlowEvery`) for up to `flingFrames` while she aims with the stick (8-way; nothing held: out
     * from the flame); released (or at the cap) she is flung along the aim at `flingSpeed` (+ `flingLift` up)
     * with the launch below (`throwFrames`, `launchGravity`: a throw-cut works off it), double jump and air
     * dash back, and the flame goes out behind her (its moths freed, 1 light back). `flingCooldown` frames
     * before the next.
     */
    flingFrames: 36,
    flingSlowEvery: 4,
    flingSpeed: 15,
    flingLift: 5,
    flingCooldown: 8,
    /**
     * A Lamp press in the cooldown after a fling still starts one for this many frames after it while Lamp is held
     * (canopy r9b: the gap's chain brings the next lamp into reach inside the cooldown). Let go, it is dropped.
     */
    flingBufferFrames: 8,
    /**
     * A Lamp key pressed with no flame in reach and held on counts as a press when a flame comes into reach (the
     * Canopy r10, review r9 #1: a first-timer holds Lamp from the jump and the first lamp never answered). Not in a
     * glow room (Lanternroot's Lamp is held to mend there).
     */
    heldPress: true,
    /**
     * The first fling's lesson (`Lure.lesson`, review r9 #1: a running jump had 8 frames in reach, a standing one
     * none): while near that lamp (`lessonPx`), in the air, her fall is capped at `lessonFall` px/f and her speed
     * across at `lessonRun` (eased in over `lessonEase` frames): a slow drift past the flame, until she has flung
     * once (a running jump carried her through the reach in 8 frames).
     */
    lessonFall: 1.25,
    lessonRun: 2.5,
    /** Frames the lesson's caps take to ease in (and out). */
    lessonEase: 6,
    /**
     * ...within this many px of the flame: just past the fling's reach (110), so she slows as she comes into it, never
     * short of it (at 200 a jump slowed 150 px out and bots stalled outside the reach).
     */
    lessonPx: 130,
    /**
     * A trap lamp's cuts (`Lure.trap`, review r9 #2): three, so freeing one is a choice made on purpose (each cut a
     * `lureHit`, the cage cracking), not a graze.
     */
    trapHp: 3,
    /** Landing within this many px of where a fling chain began (on the same ground) is a miss: its embers relight. */
    chainBackPx: 160,
    /**
     * How the pull grows from the edge to the core: 0 = linearly, 1 = with the square (a well that bites
     * late). A row's `sharp` n first raises the depth k to the 2^(n-1)th power (1 = as is, 2 = k², 3 = k⁴).
     */
    curve: 0.3,
    pullXMax: 12,
    /**
     * On the ground the pull is only a sideways drag: `pullX` eases (at `groundDecel` px/f²) toward
     * `groundDrag` x the pull's sideways part, at most `groundMax` px/f, so she can always walk away.
     * The vertical part does nothing there.
     */
    groundDrag: 1.2,
    groundMax: 2.4,
    groundDecel: 0.6,
    /**
     * Gravity you ride, not glue (feel review problem 9). The ground drag acts only while she holds a
     * direction (standing still never drifts her into a core); a gliding body feels `glidePullMult` of
     * the pull; and a core catches her only if she is moving inward (relative to the flame) or has
     * been inside it `catchFrames` frames in a row.
     */
    glidePullMult: 0.45,
    catchFrames: 4,
    /** (Render's greybox ring and old catch pips read these; the catch itself is gone: the fling.) */
    orbitShare: 0.6,
    beats: 3,
    /**
     * A grab's beats (src/sim/grab.ts: its count is `grab.beats`): a press within `beatCd` frames of the
     * last beat waits in a queue of `beatQueue`, so a mash is never lost.
     */
    beatCd: 6,
    beatQueue: 2,
    /** Freed: thrown out at this speed (px/f, plus `freeLift` up), and that lure leaves her alone for `graceFrames`. */
    freeSpeed: 14,
    freeLift: 7,
    /**
     * The throw's direction is exactly the held direction, 8-way (feel review problem 6: the radius bent by
     * the stick, `freeSteer` 0.8, threw her the wrong way in 7 of 34 rhythms); with nothing held, the
     * radius she is at. The orbit stands still while the last beat is due (`beatCd` frames after the one
     * before it), so the arrow she sees is the throw (src/sim/lures.ts `lureThrowAim`).
     */
    graceFrames: 50,
    /**
     * The throw is a launch (director's area 1, "the throw must not depend on holding jump"): for its first
     * `throwFrames` she flies under `launchGravity` x gravity whatever jump does (no apex hang, no wings, no
     * cut), so every throw has the same strength; after it, held jump opens the wings as usual (throw +
     * glide). Every other burning core the throw passes through in those frames gets `graceFrames` too.
     */
    throwFrames: 20,
    launchGravity: 0.5,
    /** While caught, the throw's predicted flight (`player.lureArc`): a point every `arcEvery` frames, up to `arcFrames`. */
    arcEvery: 3,
    arcFrames: 60,
    /**
     * A chase hook with its own `aim` takes a held direction this near it (cosine; 0.7 = one 8-way step, 45°) as its
     * aim (the Canopy r19: the hand's held diagonal at hook-7).
     */
    hookSnapCos: 0.7,
    /** Half the size of the flame's box the blade has to touch. */
    flameRadius: 20,
    /**
     * ...and a trap's cage (the Canopy r11, review r10 #3: the cage is drawn ~90 px wide; three cuts from 47 px off
     * all missed a 20 px flame). A standing up cut reaches a cage 228 px over her feet.
     * (r21: 96 (was 64): ft21e and ft21g never freed the first cage in 6 minutes, "it ignores cut and Lamp": a cut from
     * 124 px off, what a walk up to it gives, missed by a few px, with no answer at all.)
     */
    trapRadius: 96,
    /** A Lamp press this close to a burning cage (her centre to its flame) with no flame in reach: `lureRefuse`. */
    trapRefusePx: 200,
    /** Hitstop when a cut lands on a flame and it holds, and when it goes out (the loudest beat). */
    hitstopFrames: 3,
    snuffHitstop: 9,
    /** ...and when a trap's cage breaks (review r10 #2: the release is the game's verb, it stops for a beat). */
    trapSnuffHitstop: 14,
    /** Health back for each lure put out for good (core.md §5). */
    healOnSnuff: 1,
    /** ...for a trap's cage cut open (its moths freed: the Canopy r20 keeps this the heal on the way). */
    healOnTrap: 1,
    /** ...for a springboard (a `relight` lamp) put out: none (the Canopy r20; it was `healOnSnuff`, 1, every time). */
    healOnRelight: 0,
    /**
     * A swinging lure's defaults (`lure.swing`, src/sim/paths.ts, memory/level-kit.md): `reach` px to each
     * side of its rest point, one swing there and back every `period` frames. Its pull and core go with it.
     */
    swing: { reach: 120, period: 150 },
  },
  /**
   * The level kit (src/sim/kit.ts, memory/level-kit.md).
   * - `thorns`: a touch costs `damage`, she is held `holdFrames` and put back on her last safe ground
   *   with `returnInvuln` frames of safety; safe ground keeps `safeMargin` px from thorns.
   * - `seedCase`: the target's box is `size` px square; a forward / up cut clangs: held `clangHitstop`
   *   (the same as a cut glancing off a braced burrback) and thrown back `clangRecoil` px/f (forward cuts).
   *   A down cut is the pogo (its hitstop stays `enemies.pogoHitstopFrames`: the bounce's rhythm).
   * - `bark`: `hp` cuts to break (one a cut, whatever its power); a cut that holds stops her `hitstop`
   *   (a pogo keeps the pogo's), the one that breaks it `breakHitstop` (nearly a snuff's 9: it is a find).
   */
  kit: {
    thorns: { damage: 1, holdFrames: 30, returnInvuln: 60, safeMargin: 96 },
    /**
     * The firefly's pass (`scene.fireflies`, src/sim/firefly.ts): a lamp of its `relights` burns again when it passes
     * within `relightPx` of the flame.
     */
    firefly: {
      relightPx: 48,
      // --- The Canopy r13, moment 4: the chase (`FireflyPass.chase`, src/sim/firefly.ts). The alarm on sighting her
      // (`alarmFrames`), then it keeps its lead along the path: at most `chaseMax` px/f, easing `chaseEase` of the gap
      // to its goal a frame, `chaseHurry` px/f more while she is under `lead[0]` behind it. Her progress counts while
      // her centre is within `nearPx` of the path. In the nest it flies to the shaft's top at `nestSpeed`, waits there
      // until she is within `callPx` of the nest's mouth (at most `callWait`), calls (`callFrames`), and is gone up the shaft.
      alarmFrames: 36,
      chaseMax: 22,
      chaseEase: 0.09,
      chaseHurry: 7,
      nearPx: 560,
      // (Held `waitAfter` frames where its lead runs out, it waits flashing (`fireflyChase wait`); on once its goal is
      // `goPx` ahead.)
      waitAfter: 20,
      goPx: 40,
      nestSpeed: 9,
      callPx: 560,
      callWait: 1200,
      callFrames: 110,
      // --- Moment 3: the kin sits by her when she stands still this close to it (`scene.sits`; `r`, `frames` there).
      // --- The Canopy r14 (review r13 #5): a fall in the chase puts her back at the last hook she flung off, drifting in
      // its reach for `backHold` frames. Her progress counts only while she is not falling (vy over `fallVy`, out of a
      // fling's aim): a fall past the line never sends it on to the nest.
      backHold: 180,
      fallVy: 2,
      // (A landing within `nestPx` of the path's end is the nest, not a fall.)
      nestPx: 160,
      // (Her nearest point at the firefly's own counts only within `edgePx` of the path there.)
      edgePx: 240,
      // (r15, review r14 #5: put back at a hook she hangs there, falling at most `backFall` px/f, until she presses or
      // `backHold` runs out: at 1.25 she drifted out of its reach in ~1 s.)
      backFall: 0.12,
      // (r15, review r14 #5: a chase's hooks (`Lure.hook`): within `catchPx` of the next one burning, her flight eases
      // over `catchEase` frames to at most `catchRun` across, `catchFall` down and `catchRise` up, gravity thinned by `catchFloat` (a beat to press: at a
      // fling's 15 px/f a hook was in reach ~12 frames, and a 12-frame-late press missed hook-4); a press on one pulls
      // her `hookPull` of the way to its flame a frame while she aims, and she is flung from the flame.)
      catchPx: 140,
      catchEase: 5,
      catchRun: 6,
      catchFall: 3.5,
      catchRise: 7,
      catchFloat: 0.6,
      hookPull: 0.4,
      // (r15: the chase's `rests` (two hooks): there her flight eases to `restRun` / `restFall` / `restRise`, gravity
      // gone: she hangs at the hook, a breath before the next stretch, until she presses.)
      restRun: 1.5,
      restFall: 0.15,
      restRise: 3,
    },
    /**
     * The Canopy r15 (review r14 #3, src/sim/quiet.ts): the kin's sit, beat by beat after `kinSit` (frames each). She
     * walked off more than `leavePx` past the sit's `r` before the lean: it stays. Its answer is hers if she stands
     * within `answerPx` of the sit's spot as the beat begins.
     */
    kinSit: {
      come: 90,
      look: 60,
      open: 50,
      try: 64,
      fail: 36,
      turn: 120,
      answer: 72,
      fold: 48,
      lean: 180,
      leavePx: 200,
      answerPx: 260,
    },
    /**
     * The Canopy r14, moment 7: the full escape (src/sim/escape.ts). A hit holds her `hitFrames`, then back to the last
     * checkpoint (no light lost). A rock falls from rest at `rockSpeed` + `rockAccel` a frame, at most `rockMax` px/f;
     * its box is inset `rockInset` px for the touch. Her feet must be `frontGrace` px into the front to be caught.
     */
    escape: { hitFrames: 30, rockSpeed: 4, rockAccel: 0.9, rockMax: 20, rockInset: 10, frontGrace: 8 },
    /** The longest held story beat a trigger may ask for (`hold`), frames: journey.md's 3 s; the `finale` one, ~10 s. */
    storyHoldMax: 180,
    finaleHoldMax: 600,
    seedCase: { size: 56, clangHitstop: 6, clangRecoil: 8 },
    bark: { hp: 3, hitstop: 4, breakHitstop: 8 },
    /**
     * Bounce caps: landing on one (or a pogo off it) throws her up `tiers[tier]` px (the rise under
     * rising gravity, exact for the integrator); jump held as she meets it throws `heldScale` x as high.
     * The bounce refills like a pogo. A jump of hers rises 272: `small` is a little more, `big` a stair.
     */
    caps: { tiers: { small: 320, mid: 448, big: 640 }, heldScale: 1.2 },
  },
  /**
   * Finds (src/sim/finds.ts, memory/level-kit.md): a moth-stone is touched (`stoneWidth` x `stoneHeight`
   * over its foot); a firefly sign is read by standing still (grounded, no direction, `signFrames`) inside
   * `signWidth` x `signHeight` over its foot.
   */
  finds: { stoneWidth: 96, stoneHeight: 160, signWidth: 200, signHeight: 200, signFrames: 40, seedSize: 72 },
  /**
   * Moonlit hollows' upgrades (src/sim/upgrades.ts; core.md §6), each a number: `quickWings` beats free
   * of a grab in `beats` presses (`grab.beats` without), `keenBlade` grows the flame's hit box by
   * `flameRadiusAdd`, `longBreath` makes the fling's aim `flingMult` x as long (`sharpWings`: no number).
   */
  upgrades: {
    quickWings: { beats: 2 },
    keenBlade: { flameRadiusAdd: 20 },
    longBreath: { flingMult: 2 },
    /** Lanternroot (docs/design/levels/proto-1.md §3): the vault's vessel raises the glow meter's max; Bright Kindle cheapens a kindle. */
    glowVessel: { max: 24 },
    brightKindle: { kindleCost: 3 },
    /** Moon shards (the Canopy, review r3 #9: HK's mask shards): this many make one more light. */
    moonShard: { perLight: 3 },
  },
  /**
   * The light economy (Lanternroot, docs/design/levels/proto-1.md §3, memory/glow.md): glow, the light she
   * carries, in sparks. Only rooms with `glow: true` play it. Hits charge it (`hit` a blade hit on a creature,
   * `kill` more on a kill, `snuff` a warm lamp out by a cut, a fling or a gust, `glint` a glint or pod glint),
   * up to `max` (6 pips of `pip`). **Mend** (Lamp held `tapFrames`, grounded, still, nothing in reach) spends
   * `mendCost` for 1 light when the channel lands at `mendFrames`; **Kindle** spends `kindleCost` (a cold
   * moonwick in reach). A fade leaves all of it where she fell as a glint cluster.
   */
  glow: {
    max: 18,
    pip: 3,
    // (Review r1: one fight buys one kindle, not three. A juvenile's 2 cuts and its kill are 5; glints trickle.)
    hit: 2,
    kill: 1,
    snuff: 3,
    glint: 1,
    mendCost: 6,
    mendFrames: 36,
    kindleCost: 6,
    /** A Lamp press released within this many frames is a tap (Gust); held this long it starts a mend. */
    tapFrames: 12,
  },
  /**
   * Moonwicks (Lanternroot §3 Tool 1): pale glass buds that only take her light. Kindled, one burns `burn`
   * frames (its last `gutter` flicker: a readable clock) and lights `light` px of silver: moonmoss within it is
   * solid, and hawkers and danglers start no strike at her (or at a point) inside it. A burning one is a fling
   * anchor that never embers. A `keep` wick, or a whole `wickSets` set burning on one frame, burns for good.
   */
  moonwick: { burn: 720, gutter: 120, light: 420 },
  /**
   * Gust (Lanternroot §3 Tool 2): Lamp tapped with nothing in reach: a puff from her centre along the held
   * 8-way direction (facing if none), `speed` px/f for `frames` (480 px), a `size` box, stopped by solids;
   * `cooldown` before the next. It snuffs warm lamps (not great ones), fans a burning moonwick (its burn starts
   * over), knocks a hawker out of its tell or dive (stalled `hawkerStall`, open), swings a dangler, shoves
   * beetles (`shove` px/f). Tapped with Down held in the air: a hop (`hopVy`), once an airtime (refilled on
   * landing or a pogo).
   */
  gust: {
    speed: 16,
    frames: 30,
    size: 64,
    cooldown: 30,
    hawkerStall: 60,
    shove: 12,
    swingPx: 200,
    hopVy: -9,
  },
  /**
   * The cap's answer (Lanternroot §5 layer 3, `scene.bells`): a gap of at most `shortMax` frames between two
   * strikes is short, `longMin`..`longMax` long; any other gap starts the count over. It counts only in the
   * dark: no warm lamp burning within `darkPx` (else it chimes dull). The blade strikes at most every 18 f, so a
   * short is 18..`shortMax`. `sign`: the phrase as the signs flash it, onset to onset in frames (render's
   * `phraseLit` reads it): its short and long both fall inside the cap's windows (tests/unit/light.test.ts).
   */
  bells: {
    shortMax: 34,
    longMin: 42,
    longMax: 90,
    darkPx: 1200,
    size: 72,
    sign: { beat: 11, short: 17, long: 42, rest: 132 },
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
    /**
     * Health from moth milestones (core.md §6; area 1 plan r5): +1 light at each of these freed-moth counts
     * (`save.moths`), on top of `max`. The first falls before area 1's boss.
     */
    mothMilestones: [60, 350, 800, 1400, 2100],
    /**
     * A blow lands (chunk-1 feel review, problem 1: "0 freeze: getting hit has no impact"): she and the
     * creature that hit her hold this many frames before the throw (thorns too); on her last light,
     * `fadeHitstop`. Her i-frames and stagger stand still while she is held, so the hold costs nothing.
     */
    hurtHitstop: 8,
    fadeHitstop: 14,
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
    /**
     * Hitstop when a slash hits one, frames (the combo step may add to it). The creature holds for as long. Round 7
     * (Matt: "the attack feels average"): 5, a kill 6 more (it pops), a pogo 3.
     */
    hitstopFrames: 5,
    /** After a blow lands on it, a creature cannot be hit again for this long (blows never mush into one). */
    hitInvulnFrames: 8,
    /**
     * Her screen, half width and height (room px, about the 1920 x 1080 view, a little in): a creature off it
     * when she was caught starts no strike on her until she is free (`EnemyState.catchSeen`, round 4).
     */
    screenHalfW: 900,
    screenHalfH: 500,
    /**
     * Extra hitstop on the killing blow, for her and the body (feel review problem 2): a kill holds 7 on
     * a cut, 10 on the finisher, 5 on a pogo.
     */
    killHitstopBonus: 6,
    /** The same for a down slash (the pogo): short, so the bounce rhythm stays what it was. */
    pogoHitstopFrames: 3,
    /** A down slash under way as she comes down on a shell (her feet this far into its top, at most) is a pogo, never a hurt. */
    stompPx: 24,
    /** A cut that glances off a braced shell: she holds this long and is thrown back at this, px/f (fading by `attack.recoilDecay`). */
    blockHitstopFrames: 6,
    blockRecoil: 8,
    /** How long a dead body stays (for its death animation) before it is removed. */
    deadFrames: 30,
    /** Glints spilled on death reach her like a pod's: the first after this long, then a stagger apart. */
    releaseFrames: 16,
    releaseStagger: 5,
    releaseStaggerBig: 3,
    bigRelease: 6,
    /**
     * An ambush's creatures arrive (`arrive`, review r7 #2: both of the Canopy's spawned on her and hit within 16-40
     * frames): they show this long after the flag (the gates shut first), then travel in from their `arrive` point
     * for `arriveFrames`, harmless and out of reach.
     */
    arriveDelayFrames: 36,
    arriveFrames: 48,
    /** An `arrive` point is taken only this far from her body centre (else the next, else the farthest). */
    arriveClearPx: 400,
  },
  /** The burrback: a small armoured beetle that trundles along its platform. */
  burrback: {
    /** Collision box. */
    width: 52,
    height: 34,
    /** Hit points unless the scene gives it its own (`hp`). Round 7 (Matt): 3, fodder dies in 2-3 cuts. */
    hp: 3,
    /** Walking speed, px/f. */
    speed: 1.6,
    /**
     * It is aware of her (`EnemyState.aware`, `enemyAware`: it lifts its head, nothing else changes)
     * within this of its centre, her body centre, with a clear line, scaled by the light she carries
     * (memory/giving.md: 165 / 220 / 264 / 319 px at levels 1-4; never while she carries nothing).
     */
    noticePx: 220,
    /** Round 3 (giving.md): an unseen burrback sleeps where it stands while she is within this (centres, px). */
    dozePx: 340,
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
    // (Round 7: a pogo barely shoves it, so bounce after bounce stays on its back.)
    knockVertical: 0.25,
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
    /**
     * Winded after a ram (or a blow that broke its brace): open and harmless for `recoverFrames`
     * (about two cuts' worth) the first time, `recoverTiredFrames` every time after (the whole
     * chain: the kill is the finisher), `recoverWallFrames` when a wall stopped the ram (stunned).
     * `strikeCooldown` more and it may brace again. For `rouseFrames` after a cut (and after a
     * ram, past the time it stands winded) the fight is on: it comes round to her and braces
     * again; cut, wherever she stands, having only rammed, if she is inside its range.
     */
    recoverFrames: 30,
    recoverTiredFrames: 66,
    recoverWallFrames: 90,
    strikeCooldown: 12,
    rouseFrames: 300,
    turnOnHitPx: 320,
    /**
     * A ram whose length runs out with a wall within `chargeCarryPx` ahead carries on into it (a wall
     * stun): its weight does not stop a stride short of the bark. In the shaft the ram from the
     * doorway's mouth ended 21-24 px short of trunk B: always `spent`, never `wall` (playtest 6).
     */
    chargeCarryPx: 32,
    /**
     * After its touch or its ram hurt her it does not brace again until a ram could not reach her
     * sooner than `rehitGapFrames` after her safety (`health.invulnFrames`) has run out.
     */
    rehitGapFrames: 10,
    /**
     * The pogo (playtest 6: four bounces killed it, no ram, no risk). A down cut that lands curls it
     * up for `tuckFrames` (and on until it may brace again): a down cut glances off the curled shell
     * and she bounces off it, nothing taken. A braced shell glances a down cut the same way (a bounce
     * over the ram, not a break). Uncurling, it braces at her if she is near, even over it (her feet
     * up to `tuckBraceAbovePx` above its ground); while she is above its ground and near (on a
     * branch over it, dropping onto it) it stays curled. One pogo an exchange.
     */
    tuckFrames: 40,
    tuckBraceAbovePx: 200,
    /**
     * A drop onto it (playtest 6: the blind drop from the summit landed on burr-shaft): while she falls
     * from more than `dropPx` over its top toward its box (her box within `dropClearPx` of its own,
     * sideways), it hurries out from under her at `dropSpeed`, and it does not brace at her until she
     * is down.
     */
    dropPx: 300,
    dropClearPx: 12,
    dropSpeed: 3,
    /** What its touch costs her. */
    contactDamage: 1,
    /** Glints it spills when it dies, and when the finisher killed it (test grove only: in a lamp room a kill pays nothing). */
    value: 4,
    valueFinisher: 6,
    /**
     * The old burrback's moves (memory/creatures.md), off for the plain one. `feintFrames` > 0:
     * after the first brace its shell drops for that long (the feint), then it braces again for
     * `feintBraceFrames` and rams. `pogoShell`: braced, only a pogo lands (forward and up cuts clang
     * from any side; one pogo a brace); otherwise the shell glances everything until a wall stun opens
     * it. `asleep`: it starts asleep and wakes over `wakeFrames` (harmless) once she is down on the
     * ground within `wakePx`. `hunt`: it walks toward her along its ground.
     */
    feintFrames: 0,
    feintBraceFrames: 20,
    pogoShell: false,
    asleep: false,
    wakePx: 0,
    wakeFrames: 60,
    /**
     * A spawn placed `asleep` (the Canopy r18) sleeps again once she has been off its ground for this long: further
     * than 2 x `wakePx` along it, more than `sleepAgainAbovePx` over its feet or `strikeAbovePx` under them.
     */
    sleepAgainFrames: 90,
    sleepAgainAbovePx: 260,
    /**
     * One placed `asleep` is harmless this long after its wake ends (r18, ft18a: it got up under her blade: 45). The
     * Canopy r20: 0, awake it is a threat at once (the wake itself is still harmless, and shoulders her out).
     */
    wakeSafeFrames: 0,
    /**
     * The wake's last `wakeTurnFrames` it turns to her (the Canopy r11, review r10 #10: it rises first, facing the way
     * it slept, then turns, then hunts); 0 = it faces her as it wakes.
     */
    wakeTurnFrames: 0,
    hunt: false,
    /**
     * The old burrback as a first mini-boss (memory/creatures.md, first-timer review r1): it feints only
     * once its hit points are down to `feintFrom` of its most; `openWinded`: winded after any ram its shell
     * is open (every cut lands: `stunned`), not only after a wall; `huntSpeed` = its walk while she is more
     * than `huntFarPx` away (it does not waddle 8 s across its den), and it stops `huntStopPx` short of her;
     * `riseFrames`: open on its back, it gets up (harmless) before it may brace; `domeContact`: its touch is
     * its drawn dome (`domeHeight` of the box, round down to `domeShoulder` of that), not the box's corners.
     */
    feintFrom: 1,
    openWinded: false,
    huntSpeed: 0,
    huntFarPx: 360,
    huntStopPx: 24,
    riseFrames: 0,
    /** Open, it takes at most this many cuts, then gets up (0 = no limit): a fight of a few exchanges. */
    openHits: 0,
    /** Its ram hit her: it stands this long, shut (no opening), then braces again (0 = the winded time). */
    touchRecoverFrames: 0,
    /** Waking or getting up, it pushes her out of its body at this, px/f (0 = no push). */
    risePush: 0,
    /** It never braces at one closer than this (box to box): it backs away first (0 = any distance). */
    strikeMinPx: 0,
    /**
     * The director's beetle hunts landings: she lands in its light on its ground within `landHuntPx`, and it
     * turns to her at once. `noticeFrames` > 0: the first time it sees her it stops and turns to her that long
     * (the juvenile's gentle tell).
     */
    landHuntPx: 420,
    noticeFrames: 0,
    /** A death that is a beat (the old burrback): the killing blow's hold, how long the body lies, a story hold (0 = the shared numbers / none). */
    killHitstopFrames: 0,
    deadFrames: 0,
    deathHoldFrames: 0,
    /**
     * A ram that starts with her up in the air in front of it (she jumped in the tell) passes under the
     * jump: as fast as it must (at most `ramUnderMax` px/f) and `underExtraPx` beyond her (human-like r1:
     * a jump in the tell's first half used to land in the ram).
     */
    ramUnderJump: false,
    /** The first `firstTellRams` rams of a fight (this life) are told `firstTellMult` x as long (0 = none). */
    firstTellRams: 0,
    firstTellMult: 1,
    /** ... and run at `firstRamSpeedMult` x `chargeSpeed` (round 4: "slower first rams"). */
    firstRamSpeedMult: 1,
    /**
     * Round 4 (area1-video-r2 #2, the pit): `lungeOnJump` = a jump of hers in its tell (in front of it, after
     * `lungeAfterFrames` of it, not away from it) sets the ram off at once, under her (any jump in the tell
     * clears it); `bodyHarmless` = only its ram hurts, its body otherwise shoves her out (`risePush`);
     * `landBounce` = coming down on its top bounces her (a pogo with no cut), never a hurt; `touchRestFrames` =
     * after its ram hit her it may not brace again for this long (no ram after ram while she is down).
     */
    lungeOnJump: false,
    lungeAfterFrames: 6,
    bodyHarmless: false,
    landBounce: false,
    touchRestFrames: 0,
    /** After its touch hurt her it is calm (harmless, noticing nothing) this long, walking away (0 = not). */
    touchCalmFrames: 0,
    /** It braces at her under a roof lower than `strikeHeadroomPx` too (its ram pulls up at the roof's mouth). */
    braceUnderRoof: false,
    /**
     * Round 5 (lamp rooms only): `wallFlip` = a ram that meets a wall flips it belly-up, open (stunned,
     * harmless); `stepRamPx` = it rams the face of a step past its range's end at her standing on it (her
     * feet up to this over its floor): R4's adult shows its belly by itself. 0 = never.
     */
    wallFlip: true,
    stepRamPx: 240,
    /**
     * Round 5 (area1-plan-r5 §1): the old burrback as a three-phase boss (`phased`). Phase 2 from `p2At` of
     * its hp, phase 3 from `p3At`.
     * - Anti-camp: she stands on a ledge (feet `campRisePx` over its den floor) `campFrames`: it rears
     *   (`rearFrames`, the tell) and slams: every ledge in `slamReachPx` shakes her off it (a kick of `slamKick`
     *   toward it, a lift of `slamLift`).
     * - Phase 2: a big slam, it curls (`transFrames`; `transRetryFrames` on a retry) and rolls: from `rollSpeed`
     *   px/f, `rollAccel` faster at each wall, at most `rollMax`. Cuts spark off; a pogo on it, her thrown body
     *   or a throw-cut flips it belly-up (as a wall stun); getting up it curls (`recurlFrames`) and rolls on.
     * - Phase 3: no brace, a `p3TellFrames` tell, rams of `p3ChargePx` at `p3ChargeSpeed`, `p3Streak` in a row,
     *   then a `p3RestFrames` rest. A ram into the taproot (`taproot` spawn) stuns it `taprootFrames` (open
     *   `p3OpenHits` cuts); the second lays it belly-up for good (`lastStunFrames`, no limit): her last cut.
     */
    phased: false,
    p2At: 0.6,
    p3At: 0.25,
    campFrames: 180,
    campRisePx: 24,
    rearFrames: 36,
    slamReachPx: 2000,
    slamKick: 22,
    slamLift: 9,
    /** From past the taproot (the strip it cannot reach) the slam throws her back under it, this hard. */
    slamRefugeKick: 42,
    /** After a slam it may not brace for this long (she is finding her feet). */
    slamCalmFrames: 75,
    /**
     * Round 6 (video r4: "the boss never threatens"): a slam told by its rear sends a wave along its den floor
     * each way at `slamWaveSpeed` px/f (to `slamReachPx`): on the floor as a front passes, she loses a pip (jump
     * it). In phases 1 and 3 it rears and slams every `slamEveryRams` rams as well as against camping. 0 = none.
     */
    slamWaveSpeed: 12,
    slamEveryRams: 4,
    transFrames: 90,
    transRetryFrames: 30,
    rollSpeed: 6,
    rollAccel: 1.5,
    rollMax: 13,
    recurlFrames: 24,
    /** Its roll hit her: it stops, curled (harmless), this long before it rolls on. */
    rollRestFrames: 90,
    /** Curled, the ball is a circle this wide at its feet's middle (its touch; render draws it so): she jumps it. */
    rollTouchPx: 64,
    /** After this many wall bounces in one roll it rolls itself dizzy: open briefly (no standoff in phase 2). */
    rollTireBounces: 6,
    // (Round 6, video r4: "phase 3 at real pace".)
    p3TellFrames: 22,
    p3ChargePx: 640,
    p3ChargeSpeed: 16,
    p3Streak: 3,
    p3RestFrames: 70,
    taprootFrames: 300,
    p3OpenHits: 2,
    /** Phases 1-2: a ram that missed her opens it for this many cuts (a wall, a flip: `openHits`). */
    missOpenHits: 2,
    lastStunFrames: 900,
    ramUnderMax: 40,
    underExtraPx: 60,
    // (First-timer r2: the plain one's touch is its drawn dome too.)
    domeContact: true,
    domeHeight: 0.86,
    domeShoulder: 0.58,
  },
  /**
   * The lampwing: a small pale moth-wisp that hovers in the open air and is drawn to her light
   * (rules and the reasons for these numbers: memory/enemies.md). No attack: its touch hurts.
   */
  lampwing: {
    /** Collision box (drawn about 40 px across). */
    width: 36,
    height: 30,
    hp: 3,
    /** Territory: it wanders within this of its home unless the scene gives a `radius`. */
    radius: 120,
    /**
     * Round 4 (giving.md): a lampwing that cannot see her ROOSTS while she is within `roostPx` (centres)
     * and too dark to be seen: it brakes at `roostBrake` and hangs still, no wander, no bob, wings
     * nearly still (`flapRoost` beats a frame). It wakes the step she carries light (then it may notice).
     */
    roostPx: 340,
    roostBrake: 0.05,
    flapRoost: 0.012,
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
    /**
     * The dive (memory/enemies.md). When the tell ends it commits: a swoop along an arc to where
     * her body centre is at that moment (a gliding hero is led: `diveLeadGlide` x where her glide
     * will have carried her), `diveSpeed` px/f on average (slow out, fast through the middle, slow
     * in), never shorter than `diveMinFrames` or longer than `diveMaxFrames`, never further than
     * `diveMaxPx`. The arc bends by `diveBend` (0 = a straight line, 1 = straight down first, then
     * along). At the bottom it hangs for `stallFrames`, open, its touch harmless; then it climbs
     * (`pursue`) at up to `pursueSpeed` to a perch `perchUpPx` above her and `perchSidePx` to its
     * own side, for at most `pursueFrames`, harmless for the first `climbSafeFrames`, and tells
     * again. After `maxDives` it has had enough (`tired`).
     */
    diveSpeed: 5.4,
    diveMinFrames: 20,
    diveMaxFrames: 52,
    diveMaxPx: 340,
    diveBend: 0.75,
    diveLeadGlide: 1,
    /** One on foot is led too, by this share of her run (0: it dives at where she stood). */
    diveLeadRun: 0,
    /**
     * A strike instead of the eased arc (`strikeSpeed` > 0, the hawker): `diveWindupFrames` pulling back
     * `diveBackPx` along the line, then straight at the committed point at `strikeSpeed` px/f (at most
     * `strikeMaxFrames`: a far one is faster). 0 = the lampwing's arc.
     */
    strikeSpeed: 0,
    strikeMaxFrames: 34,
    diveWindupFrames: 0,
    diveBackPx: 0,
    /**
     * It hunts the caught (the director's hawker): a moth held by a flame or a web is seen anywhere in its
     * leash, even from a rest or on its way home, and its strike goes at the orbit's centre. The tell still
     * plays in full; beating free before the strike arrives dodges it.
     */
    huntCaught: false,
    /** Any other blow of it knocks her straight up, never sideways (the crown: never over the rim). */
    straightKnock: false,
    /**
     * On a rhythm (`EnemySpawn.orbit`, area1-plan-r3 §4.3): a pass every `passPeriod` frames, a tell of
     * `passTellFrames`, the swoop through the orbit `passFrames` long between perches `passRadius` to each
     * side and `passHeight` above the flame; one caught there as it passes is struck down at `passKnockDown`.
     */
    passPeriod: 210,
    passTellFrames: 30,
    passFrames: 30,
    passRadius: 260,
    passHeight: 150,
    passKnockDown: 9,
    /**
     * Round 4 (area1-video-r2 #4: "hunts the caught" hit 0 of 9; a mashing player is free in ~0.4 s): after a
     * pass it rests `passRestFrames` on its perch (a catch then is safe: the timing); caught in its orbit any
     * later, it swoops at once, a pass of `snapPassFrames`, crossing the orbit 6 + 10 frames after the catch.
     * 0 = no snatch.
     */
    passRestFrames: 90,
    // (Round 5, area1-plan-r5 §6b: "never starts a dive while she is caught": the snatch is off (0); a pass
    // that strikes her throws her out of the pull, and that lamp leaves her alone `passGraceFrames`.)
    snapPassFrames: 0,
    passGraceFrames: 120,
    /** A blow of a hawker with a `rim` (spawn): free, she is kicked toward it at `rimKick` px/f, lifted `rimLift`. */
    rimKick: 9,
    rimLift: 11,
    /**
     * A blow on a gliding moth throws her on along her glide at `glideKnockVx` px/f, lifted `glideKnockLift` (in
     * place of the knock back or down), so a hit over a pit costs a light and not the crossing: held, her wings open
     * again as the stagger ends (canopy r9b, the tunnel's hawker). 0 = off (the lampwing).
     */
    glideKnockVx: 0,
    glideKnockLift: 0,
    stallFrames: 34,
    perchUpPx: 170,
    perchSidePx: 110,
    climbSafeFrames: 12,
    maxDives: 3,
    /** The climb back to a perch: top speed and acceleration. */
    pursueSpeed: 3.4,
    pursueAccel: 0.22,
    /** The climb lasts at most this long. It gives up when it has not seen her for `lostFrames`, or she is `leashPx` from its home. */
    pursueFrames: 70,
    lostFrames: 90,
    leashPx: 520,
    /**
     * Playtest 6: lamp-sky told every 2 s at one climbing the far cliff and never dived (she came into
     * its leash at the top of each jump and was out of it when the tell ended). For `retellFrames`
     * after a tell or a pursuit she left (`enemyGiveUp` cause `far`) it notices only one at least
     * `retellMarginPx` inside its leash (one who comes right back to it is seen at once).
     */
    retellFrames: 300,
    retellMarginPx: 200,
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
    /** In the dive its wings are folded back (nearly still); stalled it beats slowly. */
    flapDive: 0.03,
    flapStall: 0.07,
    /** Its lamp snuffed (a lamp-guarder, creatures.md §1.2): it leaves the room, up and away at this, harmless; gone after `leaveFrames`. */
    leaveSpeed: 4,
    leaveFrames: 150,
    /** After its touch hurt her it notices nothing for this long (0 = the lampwing: back as soon as it is home). */
    touchCalmFrames: 0,
  },
  /**
   * Senses by lamp light (memory/creatures.md). In a lamp room (`scene.senses: 'lamp'`, every room JSON
   * but the test grove) a sight hunter sees her only while she is lit: her body centre within
   * `litScale` x a burning lure's pull radius (the light reaches a little past the pull). `player.lit`
   * = 0 (dark) .. 1 (at a flame's core). Lit, she counts as `litLevel` of the old wallet levels (2 = the
   * ranges every fight was tuned at).
   */
  senses: {
    litScale: 1.6,
    litLevel: 2,
  },
  /**
   * Grabs are Caught (creatures.md §1.5): a web (and later a toad, a mantis) holds her where she
   * touched it. Presses of jump or the blade beat free (`beats`, queued and spaced as a lure's:
   * `lures.beatCd`, `beatQueue`); the last throws her toward the held direction (up if none) at
   * `freeSpeed` + `freeLift` up, and nothing grabs her for `graceFrames`. A blow frees her too.
   */
  grab: {
    beats: 4,
    freeSpeed: 11,
    freeLift: 7,
    graceFrames: 45,
  },
  /**
   * An orb web (memory/creatures.md): strands as segments. Her box within `strandHalf` of an
   * intact strand is a touch (Caught, `grab`). A slash cuts every strand its box meets; strands no
   * longer joined to an anchor (an end within `anchorPx` of a solid or the room's edge) fall too.
   */
  web: {
    strandHalf: 5,
    anchorPx: 16,
  },
  /**
   * The weaver: an orb-weaver that lives on its web. It senses touches, not cuts: when the web holds
   * her it runs along the strands at `speed` to where she touched, counts `countFrames` (the tell),
   * and bites (`biteFrames`, its touch live, `contactDamage`) if she is still held; else it goes home.
   */
  weaver: {
    width: 56,
    height: 48,
    hp: 4,
    speed: 5,
    countFrames: 24,
    biteFrames: 10,
    /** After a bite or an empty count it waits this long, then goes home along the strands. */
    backDelayFrames: 30,
    homeSpeed: 3,
    hurtFrames: 14,
    hurtSafeFrames: 14,
    contactDamage: 1,
    deadFrames: 40,
    gravity: 0.45,
    maxFall: 9,
    /** Its lamp snuffed: it climbs off up its web and is gone (`leaveSpeed`, at most `leaveFrames`). */
    leaveSpeed: 4,
    leaveFrames: 150,
    value: 0,
    valueFinisher: 0,
  },
  /**
   * The dangler (memory/creatures.md): a small spider on a thread over her path, the Weaver's drop made
   * small. Lit and below it within `noticePx` sideways: the tell (`tellFrames`, its thread shown to where it
   * drops: level with her body, `minDrop` .. `maxDrop` under the tie point, short of the ground), the drop
   * (`dropFrames`, live), one swing toward her (`swingFrames`, `swingPx` out, live), then it hangs open
   * (`hangFrames`, bobbing `bobPx` every `bobFrames`), climbs back (`climbSpeed`) and waits `cooldownFrames`.
   * Its thread cut: it falls (`gravity`, `maxFall`), lies stunned `stunFrames` (open), then leaves.
   */
  dangler: {
    // (Feel review r2: a 30 x 26 box read as a speck at play zoom; she is 40 x 80.)
    width: 44,
    height: 40,
    hp: 2,
    // It hunts the stop (the director's dangler): it tells once she has stood still in its sight (lit, below
    // it, within `noticePx` sideways) for `stopFrames`, moving no faster than `stillVx`. 0 = on sight.
    // (Round 4, area1-video-r2 #8: "danglers barely hit": bots stood still under one 17 frames in a whole run.
    // A slow step counts as a stop now, and so does a landing under it; the tell is shorter.)
    noticePx: 220,
    stopFrames: 6,
    stillVx: 3,
    /** A landing of hers in its sight is a stop too (it tells at once). */
    landStop: true,
    /** After a fall puts her back on safe ground it starts no drop for this long (round 5: none over a return). */
    returnCalmFrames: 120,
    minDrop: 120,
    maxDrop: 640,
    tellFrames: 30,
    dropFrames: 14,
    swingFrames: 48,
    swingPx: 130,
    hangFrames: 60,
    bobPx: 6,
    bobFrames: 30,
    climbSpeed: 4,
    cooldownFrames: 90,
    hurtFrames: 14,
    hurtSafeFrames: 14,
    gravity: 0.6,
    maxFall: 12,
    stunFrames: 90,
    leaveSpeed: 4,
    leaveFrames: 120,
    deadFrames: 40,
    contactDamage: 1,
    value: 0,
    valueFinisher: 0,
  },
  /**
   * The carriers (ants; area1-plan-r5 §2.1, src/sim/enemies/carrier.ts): scavengers on a trail from under a
   * lamp to a crack. `speed` px/f along the trail; `underFrames` in the crack before the next trip; one on
   * the trail ahead of her (`noticePx`, her feet within `trailYPx` of its) tells `noticeFrames` and bites
   * (`biteFrames`, a snap of `biteLunge` px/f), then lets her be `biteCooldownFrames`. 1 hp: one cut.
   */
  carrier: {
    width: 30,
    height: 14,
    hp: 1,
    speed: 1.4,
    underFrames: 120,
    noticePx: 36,
    trailYPx: 16,
    noticeFrames: 18,
    biteFrames: 10,
    biteLunge: 8,
    biteCooldownFrames: 60,
    /**
     * After one bites her, every carrier within `lineCalmPx` lets her be this long (no chained bites). r20: 120 (was
     * 240): past her own safety (78), not a free walk down the line.
     */
    lineCalmFrames: 120,
    lineCalmPx: 600,
    hurtFrames: 10,
    hurtSafeFrames: 0,
    deadFrames: 30,
    contactDamage: 1,
  },
  /**
   * The huntsman (canopy-r22-creatures.md, src/sim/enemies/huntsman.ts, memory/enemies.md "The huntsman"): a wall
   * runner on a bark face. It scuttles its stretch of face (`radius` either side of its spawn) in bursts
   * (`burstSpeed` px/f for `burstFrames`, then a pause), toward her height once it sees her (`noticePx`). She level
   * with it (`levelPx`) and within `reachPx` across the gap, a clear line: the tell (`tellFrames`: it flattens), then
   * the lunge straight across at her (`lungeSpeed`, live for `lungeFrames`; a flat arc, `lungeGravity`), aimed `lead`
   * of her motion ahead. A wall in its flight: it clings there (`clingFrames`) and that face is its home now. None: it
   * drops (`gravity`), lands flipped and lies open (`recoverFrames`), then scrambles back (`runSpeed`) and climbs.
   * Only the lunge hurts. Hit on its wall it scuttles away (`evadePx`); hit in the air it falls and lands open.
   */
  huntsman: {
    width: 44,
    height: 56,
    hp: 3,
    /** Half the stretch of face it keeps to, if the spawn names none (`radius`). */
    radius: 220,
    noticePx: 560,
    burstSpeed: 7,
    /** A burst lasts `burstMin` .. `burstMax` frames; pauses between: wandering, and hunting (she is seen). */
    burstMin: 8,
    burstMax: 18,
    pauseMin: 40,
    pauseMax: 90,
    huntPauseMin: 10,
    huntPauseMax: 22,
    /** It stops a burst within this of her height (it hunts her level). */
    levelPx: 72,
    reachPx: 250,
    tellFrames: 24,
    lungeSpeed: 13,
    lungeFrames: 24,
    lungeGravity: 0.15,
    /**
     * It watches her climb (her vertical speed smoothed by `trackK` a frame): it tells when she is level now or will
     * be `aheadFrames` after the tell, and aims `lead` of that motion over the flight ahead (0 = where she is).
     */
    trackK: 0.12,
    aheadFrames: 12,
    lead: 1,
    /** ... never further ahead of her than this (a slow climber far under it is not "coming level"). */
    aheadMaxPx: 140,
    /** The steepest it springs: up or down this many px for each px across. */
    lungeSlope: 0.8,
    lungeSlopeDown: 0.4,
    /** After a lunge (hit or miss) it tells no sooner than this. */
    cooldownFrames: 70,
    /** After its lunge hurt her: her safety (`health.invulnFrames`) + this before its next lunge can land. */
    rehitGapFrames: 10,
    clingFrames: 26,
    gravity: 0.6,
    maxFall: 13,
    /** Out of the air its flight's sideways speed fades by this a frame. */
    airDrag: 0.94,
    recoverFrames: 80,
    runSpeed: 4,
    /** Scrambling back, it gives up after this long without a wall (it leaves). */
    runFrames: 360,
    climbSpeed: 5,
    evadePx: 120,
    evadeSpeed: 9,
    hurtFrames: 10,
    hurtSafeFrames: 10,
    /** A blow's shove, x the slash's knockback: off the wall (dead, or in the air) it flies along the blow. */
    knock: 1.1,
    knockUp: 5,
    /** Lying open on the ground a blow bats it less (a chain of cuts still reaches it). */
    knockGround: 0.4,
    knockUpGround: 2,
    deadFrames: 150,
    contactDamage: 1,
  },
  /**
   * The Weaver, the wood's boss (docs/design/regions/wood.md §6, memory/bosses.md). One exam a phase:
   * P1 glide among the spokes to snuff the ring flames, P2 read the swing and get off its half, P3 pogo
   * its abdomen, then the heart. Frames at 60 Hz, px, px/f.
   */
  weaverBoss: {
    width: 72,
    height: 56,
    contactDamage: 1,
    hurtFrames: 8,
    hurtSafeFrames: 8,
    deadFrames: 40,
    /** P1: held in the heart's core this long, its eyes counting, then it bites (1, she is thrown out). */
    biteCount: 60,
    biteFrames: 10,
    /** P2: blows to end it (two or three a drop: every drop is seen by a good player). */
    p2Hp: 6,
    /** The thread tell (the arc drawn on the floor band), the drop down the thread, the swing (3/4 of a period). */
    tellFrames: 45,
    dropFrames: 18,
    swingFrames: 60,
    /** The thread from the canopy and the swing's reach each side (L sin 40 deg: the ends rise ~240). */
    threadPx: 1010,
    swingReach: 650,
    /** Hanging winded after a swing (open to every cut); cut its thread and it falls stunned this long. */
    windedFrames: 90,
    stunFrames: 120,
    /** Up its thread to the canopy between drops, and the pause there before the next tell. */
    climbFrames: 50,
    perchFrames: 30,
    fallGravity: 1.2,
    fallMax: 24,
    /** P3: pogos to end it (one a winded window). */
    p3Hp: 3,
    /** Stands facing her, then the lunge tell (rears up, flashes quickening), then the lunge. */
    huntFrames: 24,
    lungeTell: 30,
    /**
     * The lunge runs to where she stands and a body past (`lungeOver`), at least `lungePx`, at most
     * `lungeMax` (wood.md had a flat 240: a player who stood 300 px back was never reached, and P3 was
     * waiting). The band on the floor shows exactly how far it goes.
     */
    lungePx: 240,
    lungeMax: 560,
    lungeOver: 80,
    lungeSpeed: 11,
    lungeWinded: 60,
    /** After a pogo: it rights itself and skitters to the trunk away from her, up it, then drops back. */
    skitterSpeed: 9,
    climbSpeed: 8,
    perchY: 1700,
    dropTell: 30,
    dropLand: 16,
    /** ...plus a frame for every this many px it swings across to her (a long drop takes longer). */
    dropAcross: 60,
    /** Where a drop lands: her x, kept at least this far into the floor from the trunk it climbed. */
    dropNear: 160,
    /** P3 end: it flees up into the canopy; the heart lowers over this long. */
    fleeSpeed: 10,
    lowerFrames: 90,
    /** Cue timelines (frames from the cue set's start; memory/bosses.md). */
    cues: {
      intro: { name: 20, start: 80, nameOut: 170 },
      p1end: { spokesFall: 0, climb: 0, next: 130 },
      p2end: { fall: 0, flare: 40, next: 100 },
      p3end: { flee: 0, lower: 30, next: 130 },
      defeat: { heartOut: 0, burst: 12, sky: 60, curtain: 90, relight: 170, done: 230 },
    },
  },
  /**
   * The Gloamweaver (Lanternroot's mini-boss, src/sim/boss/gloam.ts, memory/bosses.md): an orb-weaver round the
   * Gloam lamp, built on the Weaver's framework.
   * - P1 "the hunt": it hunts on its orb (`orbShare` of the web's radius from the hub, `huntSpeed` px/f round it)
   *   toward the sector over her, never into silver light; shielded (the blade glances). Every `lungeEvery` frames
   *   (the first `lungeFirst` after the lock) it lunges at her off the orb: a tell of `lungeTell` frames aimed at
   *   where she stood, then a straight run at `lungeSpeed` px/f to the floor (its touch hurts), `lungeRest` frames
   *   there and a climb back. A lunge that runs into silver light is dazzled: it falls exposed. A kindle of an
   *   arena wick within `exposePx` of it (or with it cornered) drops it exposed too: it falls (`fallGravity`,
   *   `fallMax`), lies open `openFrames` (at most `exposeCuts` cuts a window), then climbs back (`climbSpeed`).
   *   `p1Hp` cuts (`retryP1Hp` on a retry: one exposure).
   * - P2 "the drops": the Weaver's drops over `drops` (tell, drop, swing, winded), the swing stopping at the edge
   *   of silver light (a burning wick near her is a safe pocket). `p2Hp` cuts.
   * - P3 "the Gloam lamp": it wraps the lamp at the hub. The high pair burning together floods the moon-hole and
   *   it drops exposed; or `throwsToFall` throw-cuts knock it off. On the floor `p3Hp` cuts end it (`p3OpenFrames`
   *   a window, then it climbs back).
   */
  gloam: {
    width: 96,
    height: 64,
    contactDamage: 1,
    hurtFrames: 8,
    hurtSafeFrames: 8,
    deadFrames: 90,
    p1Hp: 8,
    retryP1Hp: 4,
    exposeCuts: 4,
    lungeFirst: 150,
    lungeEvery: 270,
    lungeTell: 40,
    lungeSpeed: 14,
    lungeRest: 40,
    orbShare: 1,
    huntSpeed: 3,
    exposePx: 420,
    fallGravity: 1.2,
    fallMax: 24,
    openFrames: 150,
    climbSpeed: 8,
    p2Hp: 6,
    tellFrames: 45,
    dropFrames: 18,
    swingFrames: 60,
    threadPx: 920,
    swingReach: 520,
    windedFrames: 90,
    stunFrames: 120,
    climbFrames: 50,
    perchFrames: 30,
    p3Hp: 3,
    throwsToFall: 2,
    p3OpenFrames: 300,
    cues: {
      intro: { name: 20, start: 80, nameOut: 170 },
      p1end: { climb: 0, next: 110 },
      p2end: { fall: 0, next: 120 },
      defeat: { lampOut: 0, moths: 20, moonhole: 30, glade: 90, done: 200 },
    },
    /**
     * The boss rush's Gloamweaver (`boss.rush`, docs/design/demos/bossrush.md): no one kindles there, so the rest
     * after a lunge is its window (`rushOpen` frames, at most `rushCuts` cuts), lunges come every `rushEvery`;
     * P3 hunts again, quicker (`rushP3Every`, tell `rushP3Tell`) and its lamp dies with it.
     */
    rushOpen: 70,
    rushCuts: 2,
    rushEvery: 200,
    rushP3Every: 140,
    rushP3Tell: 30,
    rushP3Hp: 6,
  },
  /** The boss rush (docs/design/demos/bossrush.md): what every rush boss shares. */
  /**
   * The Keeper (the Canopy's boss, src/sim/boss/keeper.ts; docs/design/levels/canopy-moments.md moment 6): the old
   * burrback eating from the great cage. Its hit points are the den's spawn's (`hp` 10); P2 from `p2Hp`, P3 from
   * `p3Hp`. Frames at 60 Hz, px.
   */
  keeper: {
    // (r13, review r12 #1: 25 s from the first ram to the kill was a factor 3-6 short of the references. 16 hp (the
    // den's spawn), 6 / 5 / 5 a phase, and each phase gated on its moths or time as well as its hits: P1 ends once
    // `p1Drops` moths have fallen, P2 after `p2MinFrames` (three swings), P3 not before `p3Sweeps` sweeps. At its gate a
    // cut glances (`keeperGlance gate`) and the gating thing is brought forward (`gateSoon`). P2: three swings (the bots
    // took two in 9 s).)
    p2Hp: 10,
    p3Hp: 5,
    p1Drops: 2,
    p2MinFrames: 756,
    p3Sweeps: 3,
    gateSoon: 40,
    // --- The falling moths (P1, P2). One at a time: it leaves the orbit (`dropTell`: a pale flutter), then falls
    // at `fallSpeed` swaying `fallSway` px either side over `fallSwayFrames`, to the floor. The first `dropFirst`
    // after the phase begins, then every `dropEvery` (P2: `dropEveryP2`) once the last is gone.
    dropFirst: 240,
    dropEvery: 420,
    dropEveryP2: 420,
    dropTell: 40,
    fallSpeed: 3,
    fallSway: 40,
    fallSwayFrames: 64,
    /** P2: a moth leaves the swinging cage thrown on along its swing: it lands this share of the swing's offset further out. */
    dropFling: 0.5,
    /** She catches it with her box grown by this (it clings to her). */
    catchPx: 140,
    /** It goes for a moth at this (px/f), stops this close (its centre to the moth's x), and eats it once it is down this low (px over its top). */
    feedSpeed: 4.2,
    feedStopPx: 40,
    eatReachPx: 120,
    eatAbovePx: 40,
    /** Head down over a moth: open this long, for this many cuts. */
    eatFrames: 78,
    eatOpenHits: 2,
    // --- P2, the swinging light: the cage swings from its west root, `swingPeriod` frames a full swing, `swingReach`
    // px either side of its point, rising `swingLift` at the ends. The light: a cone from the cage down, `lightBase`
    // px wide each side at the cage, `lightSpread` px more per px down. Blind, it walks at `seekSpeed` to where it
    // saw her last, sniffs `sniffFrames`; it sees her again the frame the light is on her.
    swingIn: 45,
    swingPeriod: 252,
    swingReach: 560,
    swingLift: 110,
    lightBase: 120,
    lightSpread: 0.42,
    seekSpeed: 2.2,
    seekStopPx: 30,
    sniffFrames: 60,
    // (r13: P2's new move: the light finds her within `lungePx` of it, and it lunges at once: a `lungeTell` frame tell
    // and a `lungeRamPx` ram. Not within `lungeCooldown` of its last.)
    lungePx: 460,
    // (24: a 15-frame person's reaction must still fit in it: 18 was 3 frames to answer.)
    lungeTell: 24,
    lungeRamPx: 380,
    lungeCooldown: 90,
    // --- P3, the fallen cage. The rip: the cage falls `fallFrames` after the cue. The low cloud: it sweeps it every
    // `sweepEvery` (the first `sweepFirst` after P3 begins), within `sweepReachPx` of the cage: a `sweepTell` beat,
    // then `sweepEat` moths eaten, open the whole `sweepTell + sweepOpen` for `p3` open hits. `cageCuts` cuts on the
    // fallen cage free a third each (`cutShare`) of what is in it; then the bars hold until it is beaten.
    cageFallFrames: 24,
    // (r14, first-timer ft14den: "it came straight back with a sweep, no breather": 210 (was 150). r20, Matt "very
    // easy": 150 again, the bot's breather was not a person's.)
    sweepFirst: 150,
    sweepEvery: 330,
    sweepReachPx: 150,
    // (r13: 36 (was 30): its claws now hurt, so the tell is one a person sees coming while at the cage. r14, review r13
    // #2: 42, so a person 15 frames late sees ~27 frames of it; and it is reared, claws up, not open.)
    sweepTell: 42,
    // (r13, review r12 #2: the low cloud halves after two sweeps (was 3 a sweep).)
    sweepEat: 7,
    // (r13: 90 (was 60): out of the claws' way and back in, then two cuts.)
    sweepOpen: 90,
    // (r13: the sweep's claws go through the cloud: `sweepHitPx` each side of the cage, `sweepHitH` over the floor,
    // live `sweepHitFrames` at the end of the tell. One who stands cutting the cage there is hit.)
    sweepHitPx: 170,
    sweepHitH: 150,
    sweepHitFrames: 10,
    cageCuts: 3,
    cutShare: 3,
    // (r13, review r12 #2: the fallen cage lies under its claws, guarded, until its first sweep; a cut on it turns the
    // Keeper on her (`keeperGuard`): it drops what it does and rams at the cage's side after `guardTell` frames, the ram
    // `guardOverPx` past the cage.)
    guardTell: 24,
    guardOverPx: 160,
    // (r13: P3's rams are shorter and come in pairs (the old burrback's are 640 px, three in a row).)
    p3ChargePx: 420,
    p3Streak: 2,
    // (After its pair it stands winded this long, open for two cuts.)
    p3PairRest: 64,
    // --- The ending's collapse (the fallback, round 12: no hazards), frames from the great release.
    // (r13, review r12 #7: the rubble at +150 (was +330: 7 s of waiting before a staircase).)
    // (r14, review r13 #1: the column rises with nothing over it for ~3 s: the groan at +90 (as the held beat ends),
    // the roof gives (the escape's start: `collapse`) at +210.)
    collapseGroan: 90,
    collapseDust: [130, 160, 185],
    collapseRubble: 210,
    collapseSettle: 300,
    // --- The intro: the moth leaves as the firefly does (`introLead` frames before its pass ends).
    introLead: 70,
    // --- r14, review r13 #3: P1's beat before the fast rams: it rears `rageRear` frames, slams (no wave), stands
    // `rageAfter`.
    rageRear: 40,
    rageAfter: 30,
    // --- r14, review r13 #1: the death roll carries the carcass's centre `rollClearPx` from the fallen cage over
    // `rollFrames` (eased out), so the cage is in sight and free to cut.
    rollClearPx: 450,
    rollFrames: 70,
    // --- r15, review r14 #2: the slam's floor wave starts `waveDelay` frames after the slam (`keeperWave`), and in P3
    // it rears only `cageSlamPx` or more from her while she is within `cageNearPx` of the fallen cage (else it rams).
    waveDelay: 12,
    cageSlamPx: 300,
    cageNearPx: 140,
    // --- r15, review r14 #6: the first fast ram after the rage beat is a bridge: told `bridgeTell` x as long, run at
    // `bridgeSpeed` x (`boss.bridge` 1 until it has rammed).
    // (r20: 1 / 1, no bridge: the rage beat itself is the warning.)
    bridgeTell: 1,
    bridgeSpeed: 1,
  },
  bossRush: {
    /** The final blow: she and the boss hold this many frames before the defeat plays on. */
    finalHold: 30,
    /** A Moonstep dash that goes through a blow: no second `bossDodge` within this many frames. */
    dodgeGap: 20,
  },
  /**
   * The Mantis (the boss rush's third boss, src/sim/boss/mantis.ts): a duellist on the floor under the brightest lamp.
   * Lists of three are by phase (P1 the threat, P2 the guard, P3 the frenzy). Every attack has a tell (`bossTell`)
   * and a window after it; its body only hurts in a strike's dash and a dive (`hit*`: its blade's own box).
   */
  mantis: {
    width: 60,
    height: 136,
    /** Its height crouched (the strike's dash, the leap's crouch): she clears it with a jump. */
    crouch: 76,
    contactDamage: 1,
    hurtFrames: 6,
    hurtSafeFrames: 6,
    deadFrames: 240,
    hp: [10, 10, 9],
    /** Stalking between moves: px/f toward the range it likes, frames before the next move. */
    walkSpeed: 3.4,
    backSpeed: 4.2,
    range: 330,
    near: 200,
    stalk: [54, 40, 26],
    /** The strike: a dash along the floor through where she stands and `over` past (at least `min`). */
    strikeTell: [36, 30, 24],
    strikeSpeed: 22,
    strikeOver: 170,
    strikeMin: 380,
    strikeReach: 72,
    strikeRecover: [44, 36, 30],
    /** The leap: a crouch, a rise to over her, a hang (where it will land shown), a dive; stuck after. */
    leapTell: [28, 24, 20],
    leapRise: 30,
    leapHeight: 560,
    leapHang: [22, 18, 16],
    diveSpeed: 26,
    diveBand: 100,
    diveStall: [50, 40, 34],
    /** P3: the dive's landing sends a ripple along the floor each way (jump it). */
    rippleSpeed: 12,
    rippleFrames: 34,
    rippleH: 36,
    /** The guard: forelegs crossed. A cut from the front glances and it ripostes; from above or behind, it breaks. */
    guardFrames: [80, 90, 70],
    ripTell: 12,
    ripLive: 10,
    ripReach: 190,
    ripRecover: 30,
    guardBroken: 100,
    /** The flurry (P2 on): two quick cuts ahead, a step each, when she is near. */
    flurryTell: [26, 22, 18],
    flurryLive: 8,
    flurryGap: 8,
    flurryReach: 160,
    flurryStep: 30,
    flurryRecover: [40, 32, 28],
    /** Crowded: this many blows outside its windows and it hops back out of reach. */
    pressHits: 3,
    hopFrames: 28,
    hopHeight: 150,
    hopDist: 360,
    /** P3: a combo's second move starts this many frames after the first ends. */
    chainGap: 10,
    cues: {
      intro: { name: 20, start: 90, nameOut: 170 },
      p1end: { rear: 0, next: 100 },
      p2end: { rear: 0, next: 100 },
      defeat: { fall: 0, lampOut: 40, done: 220 },
    },
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
    /**
     * A lit wayside lamp's sanctuary is only its own standing spot, and only while she stands in it
     * (her box at the lamp reaches 63 px from its foot): then burrbacks keep `waysidePx` from its
     * foot and lampwings `waysideWingPx` from its centre. As a lantern's (110 / 160, always) a lamp
     * beside a fight stopped the ram and took the brace of one shoved into it: one tell a fight.
     */
    waysidePx: 64,
    waysideWingPx: 90,
    /** It tells her again only after she has been this far from it (sideways). */
    refuseLeavePx: 160,
    /** Kindling calms the creatures within this of the lantern for `calmFrames` (burrbacks stand, lampwings give up). */
    calmPx: 900,
    calmFrames: 120,
    /**
     * A lantern's key (the ember): from the step it wakes to her until `keyCalmFrames` after it has
     * reached her, the creatures within `keyCalmPx` of her (body or home) are calmed: harmless, and
     * a lampwing that has noticed her gives up.
     */
    keyCalmPx: 600,
    keyCalmFrames: 60,
    /** The heart's trigger box: centred on its point, standing up from the ground. */
    heartWidth: 96,
    heartHeight: 96,
    /**
     * The wake is a sequence of its own: standing in the woken heart ends the run only once it has
     * been awake this long. One who is there sooner stands in the waking light first (`heartWait`,
     * then `heartReady`); her input is never taken for it.
     */
    heartWakeFrames: 180,
    /** The woken heart keeps the creatures within this of it (body or home) calm until the run ends (a blow still wakes one). */
    heartCalmPx: 600,
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
   * Giving (src/sim/giving.ts, memory/giving.md): the game plays like giving.
   *
   * SEEN: the creatures notice her by the light she carries (`pickups.count`), not by nearness
   * alone. Empty-handed (level 0) a burrback does not brace at her nor flinch at her, and a
   * lampwing does not see her at all: she slips past at arm's length (its touch still hurts if she
   * walks into it). Carrying, her level is the highest `seenN` she has reached (1-4) and their
   * notice ranges are scaled by `scaleN`: the burrback's brace reach (`burrback.strikePx`), the
   * lampwing's sight (`lampwing.noticePx` or the scene's `sight`). Level 2 (the handful a lantern
   * costs) is the old tuned fight; a hoard is seen from much further. A creature she has CUT knows
   * her (`roused`): that does not depend on what she carries.
   *
   * OFFER (the `offer` action): one glint from her wallet to what is in reach: a creature (it is
   * calmed for `giftCalmFrames`: harmless, it braces at nothing, a lampwing gives up and goes
   * home; a braced or ramming burrback stops and lowers first, standing `giftStandFrames`), a
   * dormant lantern or lamp (a part of its price, kept: `LanternState.given`), or the heart (into
   * the offering, ahead of the ending). The glint flies `offerFlightFrames`, then takes effect.
   *
   * REST = GIVE: a lit light makes her whole for `restCost` glints a light. Below
   * `health.reformHp` it lifts her that far free (a fade is never a better heal than a rest).
   */
  giving: {
    /**
     * Wallet thresholds for the levels 1-4 of being seen. Under `seen1` she is unseen: empty-handed,
     * or one glint (too small a light to find her; the first lantern leaves her one, and she meets
     * burr-path dark: giving round 2, teach the rule by contrast).
     */
    seen1: 2,
    seen2: 6,
    seen3: 15,
    seen4: 45,
    /** Notice range at each level, as a share of the creature's own (level 0 = unseen). */
    scale1: 0.75,
    scale2: 1,
    scale3: 1.2,
    scale4: 1.45,
    /** Offer: reach (her body centre to the nearest point of the target's box), the glint's flight, the gap between offers, a press good for this long. */
    offerReachPx: 150,
    offerFlightFrames: 10,
    offerCooldownFrames: 14,
    offerBufferFrames: 16,
    /** Frames she holds the glint out (the pose; it never locks her movement). */
    offerPoseFrames: 16,
    /**
     * HOLDING offer: after `offerStreamDelayFrames` held, one glint every
     * `offerStreamFrames` into a dormant light or the heart (never a creature: a creature takes one per
     * press). A glint to a light / the heart flies `offerLightFlightFrames` (= the stream's gap: one in
     * flight at a time).
     */
    offerStreamDelayFrames: 16,
    offerStreamFrames: 8,
    offerLightFlightFrames: 8,
    /**
     * A lampwing that is after her (its tell, dive, stall, climb) can be given to as far off as it
     * sees her (its sight x her `scaleN`, never less than `offerReachPx`), and a glint to it lands in
     * `offerWingFlightFrames` (playtest-giving: the dive's touch came before every glint landed).
     */
    offerWingFlightFrames: 3,
    /**
     * What one glint buys a creature: `giftCalmFrames` of calm (`EnemyState.gift` counts them down:
     * the warmth fades), and then on for as long as she stays on its ground (her body centre within
     * `giftStayPx` of its home SIDEWAYS, at any height: the shaft climb above it counts as staying;
     * it holds at 1); it ends once she has left (rule 3: once she warms
     * one, it knows her; a player who slides back down the shaft is not taxed again). A burrback
     * first stands lowered `giftStandFrames`.
     */
    giftStayPx: 520,
    /**
     * Round 4: what the player means. A creature that is aware of her or braced (its tell, its ram)
     * is in reach this far (her body centre to its box), and it comes before any dormant light or the
     * heart (playtest round 3: two presses went into lamp-rise while burr-rise rammed her at 157 px).
     */
    offerAwareReachPx: 200,
    giftCalmFrames: 600,
    giftStandFrames: 60,
    /** Rest at a lit light: glints a light restored (above the free floor of `health.reformHp`). */
    restCost: 1,
    /** A creature stays aware of her (`EnemyState.aware`) this long after it last saw her. */
    awareFrames: 45,
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
  /**
   * Rolling ground (the easy path to slopes): a run of flat rects whose tops differ by a few px.
   * Running on the ground into a ledge at most `stepUp` px high, she rises onto it without losing
   * speed (no jump, no land); when the ground under her drops by at most `snapDown` px she follows it
   * down and stays grounded (no fall, no land, coyote untouched). 0 turns either off.
   */
  ground: {
    stepUp: 20,
    snapDown: 12,
  },
  /** Rooms (docs/design/tech.md §2.3). */
  room: {
    /**
     * Frames she is held after crossing an open room edge (`scene.exits`) before the room restarts
     * (until neighbouring rooms exist). She keeps falling with no input; render fades over them.
     */
    exitFrames: 36,
    /** Frames she is held after falling into a catch zone (`scene.catches`) before she is back on her last safe ground. */
    catchFrames: 18,
    /** Put back after a catch, she stands at least this far in from the end of the top she fell from, px. */
    returnInset: 72,
    /**
     * Put back after a hazard (a fall catch, thorns) or re-formed after a fade: she fades in for this many
     * frames (no input, untouchable), and no button held as she came back is a press until it has been
     * let go and pressed again; its hold still acts (impatient first-timer, 2026-10-17: put back on T3 with jump + right still
     * held, she re-jumped into the same thorn branch, 3 hearts in ~3 s, twice). Celeste / HK do the same.
     */
    returnFadeIn: 18,
    /**
     * And not where her natural next move takes her straight back into thorns (src/sim/return.ts): from the
     * return point she is moved back from the lip `returnProbeStep` px at a time until a jump held toward
     * it (with the glide that follows) meets no thorns within `returnProbeFrames`.
     */
    returnProbeStep: 40,
    returnProbeFrames: 180,
    /**
     * A thorn return inside a shut arena (a gate with `shut` standing; the Canopy r10, review r9 #3: four returns in a
     * row put her back facing the Grove's bed): the end of the top farthest from the bed she hit, at least this far
     * from any thorns.
     */
    arenaThornPx: 160,
    /**
     * Frames the dip lasts when there IS a room on the other side (memory/world.md): she goes on with
     * the input she held as she crossed (her run, her glide), then enters the next room with her
     * momentum. ~0.3 s (tech.md §6: transition visible time <= 0.3 s).
     */
    transitionFrames: 18,
    /** Entering by an edge, her box centre is put at least this far inside it, px (no crossing straight back). */
    entryInset: 24,
    /**
     * Seam hysteresis: after she comes in through an opening, that opening is shut behind her this many frames
     * (an edge is a wall or a floor there; the top is simply not crossed), so turning straight back never
     * swaps rooms twice in a second and a jump that peeks over a seam and falls back never strobes.
     */
    seamLockFrames: 60,
    /** A door's box (`scene.doors`): width and height over its foot, px. Press up standing in it. */
    doorWidth: 96,
    doorHeight: 160,
  },
  /**
   * Moon patches (`scene.patches`, memory/world.md): the box over a patch's foot (width x height px)
   * and the frames she stands in it, grounded and still, before she rests (a press of up rests at once).
   */
  patch: {
    width: 128,
    height: 192,
    restFrames: 30,
    /** Passing through a patch (no stop) makes it her re-form point, no rest (review r7 #4: HK's bench is a stop). */
    markOnPass: true,
  },
  /**
   * The map (memory/world.md): a lure, exit, door, patch or glade counts as seen once it is within
   * `seeX` x `seeY` px of her body centre (about the view), checked every `seeEvery` frames.
   */
  map: {
    seeX: 1000,
    seeY: 600,
    seeEvery: 10,
  },
  /**
   * The hatching (`scene.hatch`, src/sim/hatch.ts): she is shut in her cocoon until `presses`
   * presses of any button or direction (counted from the first frame; it breaks no sooner than
   * `listenFrom`: the picture fades up first), or until
   * `autoFrames` pass. With no input it stirs on its own every `autoStirEvery` frames from `autoStirFrom`.
   */
  hatch: {
    presses: 3,
    // (The Canopy r12, moment 1: black first (`marks.stage.open.black`), then the close frame: the break comes after
    // it, every press still counted. r18: the black is 1 s (was 3: every first-timer read "a black screen, didn't
    // know to press"), her light breathing in it; it listens half a second into the fade-up.)
    listenFrom: 90,
    /** A press made before it listens breaks it this many frames into the close frame (r17: one jump in the black). */
    pressedAfter: 45,
    autoFrames: 720,
    autoStirFrom: 300,
    autoStirEvery: 90,
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
});

/**
 * Creature variants (creatures.md §2: "a new creature is first a variant row"): every number of the
 * base kind, then what the player feels as different. `oldBurrback`: the wood's mini-boss (wood.md
 * §6): bigger, 10 hp, a ram that carries further, a feint (two braces), a shell only a pogo opens
 * while braced, asleep in its den until she lands, ignores the lit rule. `hawker`: the dusk
 * dragonfly, the lampwing's tuned dive on a lamp-guarder that hunts by sight.
 */
function withVariants<T extends { burrback: object; lampwing: object }>(base: T) {
  return {
    ...base,
    oldBurrback: {
      ...(base.burrback as T['burrback']),
      // Feel review r2: twice the size (it was shorter than she is), its dome and ram to match.
      // (Round 6, the den at 1.45 zoom: 1.6x (was 160 x 96) so it reads 2.5x her height; its reach to match.)
      width: 256,
      height: 154,
      hp: 20,
      speed: 2.2,
      noticePx: 2400,
      dozePx: 0,
      strikePx: 370,
      provokedPx: 510,
      // The tell and the ram (first-timer r1, feel r2, human-like r1): a 28 f tell, then 300 px at 16 px/f; a
      // jump started in the tell is passed under (`ramUnderJump`), one started up to ~10 f into the ram clears it.
      windupFrames: 28,
      chargePx: 420,
      chargeSpeed: 16,
      // (First-timer r6: "only the flipped belly takes damage" read late: the windows after a miss are longer.)
      recoverFrames: 100,
      recoverTiredFrames: 100,
      // (Round 4: a ram into a wall lays it open 3 s: baiting it from a ledge is rewarded.)
      recoverWallFrames: 180,
      knockScale: 0.5,
      feintFrames: 18,
      // (Long enough to answer after the feint with a 20-30 frame reaction.)
      feintBraceFrames: 30,
      // Feel review r2 / first-timers: no feint on the first mini-boss (0 = never; the move stays for variants).
      feintFrom: 0,
      openWinded: true,
      huntSpeed: 4.2,
      // (It stops this far off and braces from there: a ram from point blank was unanswerable.)
      huntStopPx: 290,
      openHits: 3,
      touchRecoverFrames: 24,
      risePush: 7,
      strikeMinPx: 220,
      // (Getting up is her cue to step out: long enough to see.)
      riseFrames: 30,
      domeContact: true,
      domeShoulder: 0.62,
      // Explorer r2: "the kill has no moment". A 20-frame hold, the body lies 2.5 s, 1.5 s of story hold.
      killHitstopFrames: 22,
      deadFrames: 150,
      deathHoldFrames: 90,
      ramUnderJump: true,
      // (area1-plan-r3 #8: casual runs faded 8-9 times and gave up; first tries lasted 11-21 s.)
      // (The Canopy r20, Matt "very easy": the first ram only, told 1.25x at 0.8x (was two at 1.5x / 0.6x).)
      firstTellRams: 1,
      firstTellMult: 1.25,
      firstRamSpeedMult: 0.8,
      // (area1-video-r2 #2: casual tries lasted 11-15 s: hit standing, rammed again while down, pinned at the gate.)
      lungeOnJump: true,
      // (Its den's escape ledges (192 px up): its ram pulls up at a ledge's mouth, open: under a ledge she is
      // never pinned, and baiting a ram there is a window.)
      strikeHeadroomPx: 200,
      braceUnderRoof: true,
      bodyHarmless: true,
      landBounce: true,
      // (r20: 60 (was 90): its ram hurts 2 now, so never ram after ram while she is down, but no long rest either.)
      touchRestFrames: 60,
      // (Its den has its own rule for ledges: the slam.)
      stepRamPx: 0,
      // (Round 5: the three-phase boss under the oak. Round 6, video r4 "fights 60-120 s": 20 hp: phase 1 to 12,
      // phase 2 to 5, phase 3 the last 5: a taproot window of 2 cuts, then the last lie.)
      phased: true,
      // (Curled: a ball 120 across.)
      rollTouchPx: 120,
      underExtraPx: 96,
      pogoShell: true,
      asleep: true,
      wakePx: 1400,
      // (The Canopy r11, review r10 #10: a 1.5 s wake on her drop into the arena: it rises for a second, facing the
      // way it slept, then turns to her for half a second, then hunts. Harmless all the while.)
      wakeFrames: 90,
      wakeTurnFrames: 30,
      hunt: true,
      // (The Canopy r20: a big thing's blow, its ram and its slam's wave, costs 2 of her 4.)
      contactDamage: 2,
      value: 0,
      valueFinisher: 0,
    },
    // The juvenile beetle (wood-area1-director.md R4): small, 2 hp, no brace, a gentle tell, then it walks
    // at her (`hunt`, no stop: it walks into her, the crawlid's danger). Two cuts.
    juvenileBurrback: {
      ...(base.burrback as T['burrback']),
      width: 38,
      height: 26,
      hp: 2,
      speed: 1.3,
      strikePx: 0,
      noticePx: 260,
      noticeFrames: 30,
      hunt: true,
      huntStopPx: -1000,
      landHuntPx: 0,
      knockScale: 1.6,
      // (First-timer r4: "the juvenile took 2 health by contact while I was swinging at it". Harmless while
      // staggered by a cut, and after its touch it turns and wanders off, calm, for 2.5 s: one pip a meeting.)
      hurtSafeFrames: 30,
      // (r20: 75 (was 150): one pip a meeting, then it comes back.)
      touchCalmFrames: 75,
      // (The Canopy r18: one placed `asleep` wakes once she is down on its ground this near, over 50 frames, harmless:
      // the giant's, between two arrivals, never meets her on her arrival.)
      wakePx: 200,
      // (r20: 40 (was 50).)
      wakeFrames: 40,
      // (Getting up it shoulders her out of its body, so she is never inside it when it can hurt.)
      risePush: 5,
      domeShoulder: 0.58,
      value: 0,
      valueFinisher: 0,
    },
    hawker: {
      ...(base.lampwing as T['lampwing']),
      // (A 52 x 24 sliver at 480 px over her: now a body she can read and cut.)
      width: 72,
      height: 32,
      radius: 150,
      // It sees her anywhere in its lamp's light that its leash reaches (its home hangs ~440 px over the
      // floor: at 480 a runner crossing the light was never seen).
      noticePx: 620,
      leashPx: 640,
      // Round 1 review: "never dived". Its home hangs ~440 px over the floor at its wick, and a 340 px dive
      // stalled 130 px over her head: the first dive was always a miss. Now the dive reaches the floor,
      // a little faster, and leads a runner by half her run (stopping or turning back dodges it).
      diveMaxPx: 600,
      diveMaxFrames: 72,
      diveSpeed: 6.4,
      diveLeadRun: 1,
      // Canopy r9b (the tunnel's pit: its strike came out of a 6-frame pull-back in a crossing that lasts ~80): it
      // tells for 30 frames (the fairness floor; the lampwing's 36 is a drift on a hunter this fast) and strikes where
      // her glide will be, so a change of line (a check back, a drop and a fresh glide) or a cut answers it; a blow on
      // a glider throws her on her way, a light lost and the crossing kept.
      curiousFrames: 30,
      glideKnockVx: 8,
      glideKnockLift: 5,
      // Feel review r2: the 65-frame dive was a drift. Now 6 frames pulling back, then a 15 px/f strike.
      strikeSpeed: 15,
      strikeMaxFrames: 34,
      diveWindupFrames: 6,
      diveBackPx: 24,
      // (Round 7: off; the lamp's hold becomes a fling's slowed aim, and nothing hunts her in it.)
      huntCaught: false,
      straightKnock: true,
      // (A breather after a hit: one who stood still under it was hit every 4 s and faded in a loop. r20: 90, was 180.)
      touchCalmFrames: 90,
      value: 0,
      valueFinisher: 0,
    },
  };
}

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
