/**
 * Look knobs for the goal: the three moth-lanterns, the heart of the grove and the ending
 * (memory/goal-render.md). Rules and timings that matter to play are in src/sim/tuning.ts `goal`;
 * this is only how it looks. Sizes are world px, times seconds. Live: `__goal.cfg.lantern.light.intensity
 * = 0; __game.render()`.
 */
export const GOAL = {
  lantern: {
    /** The point light a lit lantern registers (post lands it on ground and plants; it lifts a surface's own
     * hue, so at 1 the blue boulder by the first lantern went cream: the colour comes from `pool`). */
    light: { radius: 240, color: 0xffa850, intensity: 0.55 },
    /** The swell of light when it catches: radius from..to px, peak intensity, seconds. */
    swell: { from: 200, to: 600, intensity: 1.5, seconds: 1.25 },
    /** The bead in the glass: quad half-size px, energy lit, how far it breathes, seconds per breath. */
    bead: 6,
    beadGain: 0.85,
    breathe: 0.1,
    breath: 3.4,
    /** The tight halo round a lit glass: half-size px, energy. */
    halo: 28,
    haloGain: 0.22,
    /** The dead ember of a dormant one: energy, and how much stronger when she is near and can pay. */
    ember: 0.2,
    emberNear: 0.5,
    nearPx: 260,
    /**
     * It notices her (playtest 2: a dormant lantern was a small dark hook a running player passed
     * without knowing it was anything). When she comes within `px` carrying any glints the crook
     * bows `bow` rad toward her and the glass swings `glass` rad her way with a start (`kick`), an
     * ember wakes in the bulb (`ember`, more the nearer her wallet is to its price), `tug` of her
     * glints strain `reach` of the way toward it and fall back (every `tugSeconds`), and its price
     * stands round the glass (`refuse`) from `marksPx` away, filled as far as her wallet goes.
     */
    notice: {
      px: 290,
      bow: 0.085,
      glass: 0.34,
      kick: 2.2,
      ember: 0.75,
      halo: 0.2,
      tug: 3,
      tugSize: 0.56,
      reach: 0.62,
      tugSeconds: 1.6,
      marksPx: 330,
    },
    /** The rest point's bead is this much brighter. */
    restGain: 1.18,
    /**
     * It turns its light away from where she stands (playtest 3: kneeling at a ground lantern she
     * covered the bulb she was kindling). Within `turnPx` of it, once she is `turnSlack` px to the
     * glass's side of the foot, the crook swings round its stem (`turnRate` per second: 2 = a full
     * turn in 1 s; the glass is flung by `turnFling` rad/s² as it goes) and the glass hangs on the far side, also
     * mid-channel (she runs into lamp-root's step with the channel already going).
     */
    turnPx: 300,
    turnSlack: 12,
    turnRate: 4.4,
    turnFling: 26,
    /** Glass swing: stiffness, damping, wind sway (rad per unit of wind()). */
    swingK: 46,
    swingC: 3.2,
    sway: 0.1,
    /** Warm light on the surfaces round a lit one (surface.ts): radii px, strength. */
    pool: { rx: 400, ry: 300, gain: 0.85 },
    /** The lift of the mist behind it (additive, behind the playfield): size px, height above the foot, alpha. */
    mist: { color: 0xffa050, width: 1000, height: 560, lift: 120, alpha: 0.2 },
    /** That lift per zone [left, centre, right], by where the lantern stands: less in the dark blue glade. */
    mistZone: [0.65, 1, 1],
    /** Fireflies that gather round it. */
    flies: 6,
    /** A lit lantern wakes the dormant glints within this, px. */
    wakePx: 380,
    /** Motes that rise from a lit glass: per second. */
    motes: 0.55,
    /**
     * Safe ground (the sim's sanctuary: `tuning.goal.sanctuaryPx` along the ground, `lampSanctuaryPx`
     * round the glass): a faint warm breath on the ground out to that reach, no edge, no ring.
     * `ground` = strength of the warmth on the surfaces, `height` its half-height px, `seam` = the
     * low glow lying on the ground line, `breath` seconds, `depth` how far it sinks between breaths;
     * `turn` = the answer at the edge when a creature is turned away there.
     */
    safe: { ground: 0.85, height: 44, seam: 0.16, breath: 5.2, depth: 0.45, turn: 0.5 },
  },
  kindle: {
    /** All of the cost has left her by this share of the channel. */
    by: 0.72,
    /** Seconds a mote takes from her chest into the glass, and how many turns it winds round the stem. */
    flight: 0.34,
    turns: 1.6,
    wind: 6,
    /** The catch: seconds the bead flares, its peak energy, halo half-size px at the peak. */
    flare: 0.6,
    flarePeak: 2.3,
    flareHalo: 58,
    /** The swell that runs along the ground both ways: reach px, seconds, brightness. */
    wave: { reach: 320, seconds: 1.05, height: 13, length: 84, gain: 0.6 },
    /** Motes that rise as it catches. */
    rise: 7,
    /** A broken channel: the glints fall back to her as stars this size (1 = a world glint). */
    backSize: 0.62,
  },
  refuse: {
    /** Seconds the price stays after a refusal when the event gives no `show` (it does: 150 frames; it also
     * stays while she stands there short), and its fade. */
    hold: 4,
    fadeOut: 0.7,
    /** Stars fade in one after another this far apart, s. */
    step: 0.03,
    /** The crown of marks round the glass: radius px, degrees between two marks, widest span; mark half-height px. */
    radius: 58,
    pitch: 23,
    span: 262,
    star: 7.6,
    /** A mark is a small hollow flame: its rim, and what fills it. Warm, never the glints' pale blue. */
    mark: 0xd99a55,
    fill: 0xf09a3a,
  },
  /**
   * A wayside lamp asleep (playtest 3: from the terrace it was a dark hook in the roots): a cold
   * point in the glass (`coreSize` px across at `coreAlpha`) and a breath of cold light behind it
   * (`coldSize`, `coldAlpha`) that the dark crook stands against. Both go as her glints warm it.
   */
  lamp: { cold: 0x5f9fe0, coldCore: 0xbfe2ff, coldSize: 150, coldAlpha: 0.2, coreSize: 20, coreAlpha: 0.7 },
  /**
   * A fade's sting (playtest 3: "a fade without a sting"): the light she re-forms at pays for it.
   * Its bead sinks by `bead` and its light on the place by `light`, stuttering, holds low for `low`
   * s and is back by `back` s; `embers` dull motes fall off her as she stands up. Nothing bright.
   */
  reform: { bead: 0.8, light: 0.6, low: 1.3, back: 3.6, embers: 7 },
  heart: {
    /** Post's point light (it lifts a surface's own hue, so on pale stone it is glare: keep it low). `bloom` = how much more at the ending. */
    light: { radius: 300, color: 0xff9440, intensity: 0.26, bloom: 0.12 },
    /** How far the bud stands open: awake, and in full bloom at the ending. */
    awake: 0.78,
    /** Asleep, the straps part this far once every lantern but the last burns. */
    ajar: 0.2,
    /**
     * Asleep it breathes like a sleeper: `seconds` per breath (in for `inhale` of it, a long out),
     * `swell` = how much wider / taller the bud grows and how far the straps ease apart at the top
     * of a breath, `mote` = brightness of the one dim mote it lets go with each breath out. No light
     * is added: it reads by motion.
     */
    sleep: { seconds: 5.4, inhale: 0.38, swell: [0.035, 0.05, 0.035], mote: 0.42 },
    /** Its warm light on the shrine and the ground once awake (surface.ts): strength, radii px, how white (0 = deep amber). */
    pool: 0.62,
    poolRx: 430,
    poolRy: 360,
    poolWhite: 0.12,
    /**
     * Its glows (tints, alphas; px): cold breath asleep; awake a flower of deep amber, a narrow column
     * up the hollow tree, a little warmth in the mist, a glow on the horizon from afar. All of it deep
     * amber and small: the first version (golden-white flower 230 px at 0.42, pillar 460 px wide,
     * mist 1500 px, all growing by half at the ending) put a peach wash over a third of the frame and
     * turned the shrine stone near-white. The only near-white thing is the core (`core`, 11 px).
     */
    glow: {
      cold: 0x6fb0ff,
      coldAlpha: 0.2,
      gold: 0xff8c2e,
      goldAlpha: 0.3,
      goldSize: 170,
      pillar: 0xf07c26,
      pillarAlpha: 0.1,
      pillarWidth: 230,
      pillarHeight: 1500,
      /** The thread of light inside the column: share of its width, alpha. */
      shaftWidth: 0.26,
      shaftAlpha: 0.13,
      mist: 0xd2661e,
      mistAlpha: 0.075,
      mistWidth: 900,
      mistHeight: 520,
      band: 0xd86a26,
      horizonAlpha: 0.42,
      horizonWidth: 760,
      horizonHeight: 640,
      /** The glow on the horizon per zone [left, centre, right] (by camera x): the dark blue glade
       * takes far less of it, or its settled picture after the wake is washed (mean luma 35 for 28). */
      horizonZone: [0.25, 1, 1],
    },
    bloom: 1,
    open: [26, 5.2],
    /** The core: quad half-size px, energy awake / in bloom. */
    /** At the ending the light lifts this far out of the bud, px. */
    lift: 172,
    core: 11,
    coreGain: 0.85,
    coreBloom: 1.05,
    halo: 42,
    haloGain: 0.2,
    /** Motes rising from the open heart: per second. */
    motes: 2.2,
    /** The wave through the forest when it wakes: px/s, half-width and half-height px, brightness. */
    wave: { speed: 2300, width: 300, height: 600, gain: 0.2, surface: 0.9, reach: 6200 },
    /** Motes that drift toward it across the view when it wakes: how many, seconds. */
    drift: 34,
    driftSeconds: 3.4,
  },
  ending: {
    /**
     * The grove answers, quietly: the column brightens by `pillar`, everything the heart and the
     * lanterns light grows wider by `wide`, a breath of amber under the canopy and along the mist
     * band, `surface` = warmth on every surface in view (surface.ts), `lampMist` = how much more the
     * mist behind each lantern lifts. Darks and violets must stay: measured at the shrine, no more
     * than ~1% of the frame may pass luma 150 (it was 7%).
     */
    pillar: 0.3,
    wide: 0.15,
    canopy: 0.045,
    band: 0.035,
    surface: 0.17,
    surfaceWhite: 0.1,
    lampMist: 0.2,
    /** Fireflies rising across the view: per second. */
    motes: 4,
    /** How many of the glints she still carries lift out of her (at most). */
    fireflies: 40,
  },
  /**
   * Ember-moths that show the way to the nearest dark lantern (guide.ts). They leave a lit lantern
   * (`moths`; a wayside lamp sends `lampMoths`) `first` s after it catches and again every `again` s
   * while she is within `nearPx` of it, and the sleeping heart's dark wick (`heartMoths`, a longer
   * thread: x `heartFar`) when she touches it and while she stays within `heartPx`. Flight:
   * `speed` px/s along the way, weaving `wander` px, stopping every `stopEvery` px to circle
   * (`stopR` px, `stopTurn` rad/s) for `stopSeconds`, or until she is within `waitPx` of it, at
   * most `stopWait` s; the first goes `range[1]` px, the last `range[0]`, then they turn and fade.
   * Small and dim: an ember of `ember` px half-size at `emberGain`, a halo of `halo` px at `haloGain`.
   *
   * `routes`: the ways INTO each lantern, keyed by its id in the scene: polylines of world points
   * [x, y] at about her head height along the walk / climb / glide, ending near the lantern. A moth
   * joins the route passing nearest to where it starts, at that nearest point. FOR THE SIM / LAYOUT
   * OWNER: if a lantern, the shaft, the bluff or the sky line moves, move these points with it (a
   * lantern with no route just gets a straight line).
   */
  guide: {
    moths: 3,
    lampMoths: 2,
    heartMoths: 4,
    heartFar: 1.25,
    first: 1.3,
    again: 6.5,
    nearPx: 300,
    heartPx: 260,
    speed: 150,
    wander: 13,
    stagger: 0.6,
    stopEvery: 230,
    stopSeconds: 1.15,
    stopWait: 2.6,
    stopR: 20,
    stopTurn: 4.2,
    waitPx: 400,
    range: [600, 900],
    fadeIn: 0.5,
    size: 0.86,
    tint: 0xffb878,
    ember: 3.8,
    emberGain: 1.05,
    halo: 15,
    haloGain: 0.24,
    routes: {
      // From the first lantern: over the pool, the branch, the bluff, the leap to the well at trunk
      // A's foot, in at the doorway, up the wall-jump shaft, over trunk A's top to the summit.
      'lantern-crown': [
        [
          [1700, 1130],
          [2176, 940],
          [2528, 890],
          [2880, 990],
          [3160, 1210],
          [3456, 1220],
          [3456, 470],
          [3300, 380],
          [3560, 150],
        ],
      ],
      'lantern-far': [
        // The summit glide: off trunk B's top along the sky line.
        [
          [3740, 110],
          [3900, -115],
          [4150, -300],
          [4400, -235],
          [4610, -140],
          [5000, 35],
          [5200, 125],
          [5420, 330],
        ],
        // From the shrine: east along the rise to the foot of the far cliff and up its face
        // (the `cliff-n` glints), over the lip.
        [
          [5212, 1010],
          [5400, 1020],
          [5440, 900],
          [5440, 500],
          [5500, 390],
        ],
        // On foot from the west: the root, the branch, F6, F7, a hop onto the far ground.
        [
          [4180, 1150],
          [4275, 905],
          [4700, 603],
          [4864, 660],
          [5232, 520],
          [5440, 400],
        ],
      ],
    } as Record<string, number[][][]>,
  },
  camera: {
    /** Wake: the view leans this far (px, at most) toward the heart, for `seconds`. */
    nudge: 150,
    seconds: 2.5,
    /** Ending: zoom gained, drift up px, share of the way toward the heart, over `frames` sim frames. */
    zoom: 0.045,
    rise: 30,
    toward: 0.06,
    frames: 215,
  },
};

export const MAX_QUADS = 420;
