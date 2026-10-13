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
      /** A lantern's (not a lamp's) crown is up from this far, so the destination reads across a screen. */
      crownPx: 1000,
    },
    /**
     * Asleep it keeps a cold light, like the wayside lamps but larger (playtest 4: the far lantern
     * was a dark wire on near-black): a breath of cold light behind the crook, which it stands
     * against as a silhouette (`coldSize` px, `coldAlpha`), and a cold point in the glass.
     */
    cold: { coldSize: 300, coldAlpha: 0.3, coreSize: 26, coreAlpha: 0.8 },
    /**
     * The next dark lantern lets cold motes go over the long drop beside it (deeper than `minDrop`
     * px: the shaft under the crown, the far bluff's face), so it is found from below: one every
     * `every` s, `out` s to drift to the lip, then down at `speed` px/s (+ `gravity`), `life` s,
     * `size` px across at `alpha`. At most `n` in the air.
     */
    fall: {
      n: 7,
      every: 0.95,
      out: 1.3,
      speed: 70,
      gravity: 26,
      life: 5.6,
      size: 15,
      alpha: 0.8,
      minDrop: 300,
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
   * The offering (the sim's `heartOffer`, during the ending hold): at most `perStep` glints leave
   * her hand per sim step and wind into the heart's light (`flight` s, `turns` turns of `wind` px,
   * lifting `rise` px on the way). Each tier it reaches (`heartTier`) wakes `lights[tier]` small
   * lights round the shrine, `step` s apart: `bands[tier]` = [nearest, farthest px to either side
   * of the heart, lowest, highest px above its foot]; a bead of `bead` px at `beadGain` with a halo
   * of `halo` px at `haloGain`. Small and precious: nothing here is wider than a glint.
   */
  offer: {
    perStep: 3,
    flight: 0.55,
    turns: 1.2,
    wind: 16,
    rise: 46,
    lights: [5, 6, 8],
    bands: [
      [90, 300, 16, 70],
      [150, 430, 110, 300],
      [200, 620, 240, 520],
    ],
    step: 0.16,
    bead: 5,
    beadGain: 1,
    halo: 20,
    haloGain: 0.24,
  },
  /**
   * Ember-moths that LEAD to the next dark lantern, or to the heart once all burn (guide.ts). One
   * flight of `moths` (the sleeping heart sends `heartMoths`), each an ember (`ember` px half-size at
   * `emberGain`, halo `halo` at `haloGain`) with a comet tail of where it has been (`tailStep` s
   * apart, `tailGain`), wings dimmed to `wing` so the ember is what is seen.
   *
   * When: `first` s after a lantern catches (from its glass), and whenever the next lantern is dark,
   * at least one burns, and she has not come `progress` px nearer to it for `idle` s (from the
   * nearest lit light within `fromPx`, else in from the frame edge). A flight nobody follows for
   * `ignore` s leaves; the next waits `again` s more. At the sleeping heart, as before, while she is
   * within `heartPx` of it.
   *
   * How: the leader keeps `lead[0]`..`lead[1]` px ahead of her along the way (the second at `full`
   * px/s), never less than `leadMin`, never outside the picture (`inset`, `insetTop` under the HUD),
   * running at up to `fast` px/s (`chase` = how hard it closes the gap). Each moth trails `spacing`
   * px behind the one before, weaving `weave` px, on a spring (`spring`, `damp`, at most `top` px/s).
   * She stops: they ring (`ringR` px, `ringTurn` rad/s). She goes back along the way faster than
   * `wrongSpeed` or strays `offPx` from it for `wrong` s: they come and loop round her (`fetchR`,
   * `fetchTurn`) for `fetch` s, then lead again (from a new way if she had left the old one).
   * At the end they sit `perch` px apart on the hook, which glows (`perchHalo`, `perchGain`).
   *
   * `pour`: when the last lantern catches, `n` of them run from its glass down to the heart
   * (`speed` px/s, `stagger` s apart from `first` s, weaving `weave` px).
   *
   * `routes`: the ways INTO each lantern, keyed by its id in the scene (`heart` = into the heart):
   * polylines of world points [x, y] at about her head height along the WALK / CLIMB (never the
   * glide line: playtest 4), ending near the lantern, clear of solids. A flight joins the route
   * passing nearest to her, at that nearest point. FOR THE SIM / LAYOUT OWNER: if a lantern, the
   * shaft, the boughs or the far bluff moves, move these points with it (no route = a straight line).
   */
  guide: {
    moths: 4,
    heartMoths: 4,
    first: 1.3,
    idle: 6,
    progress: 140,
    ignore: 14,
    again: 4,
    fromPx: 760,
    heartPx: 260,
    lead: [250, 450],
    full: 380,
    leadMin: 110,
    inset: 110,
    insetTop: 170,
    fast: 820,
    chase: 3.4,
    spacing: 17,
    weave: 6,
    spring: 70,
    damp: 13,
    top: 980,
    stagger: 0.14,
    ringR: 19,
    ringTurn: 4.6,
    wrongSpeed: 70,
    offPx: 560,
    wrong: 1.6,
    fetch: 1.5,
    fetchR: 58,
    fetchTurn: 5.2,
    perch: 9,
    perchHalo: 54,
    perchGain: 0.3,
    fadeIn: 0.45,
    fadeOut: 0.8,
    size: 1,
    wing: 0.9,
    tint: 0x7a3c22,
    ember: 7,
    emberGain: 1.7,
    halo: 21,
    haloGain: 0.3,
    tailStep: 0.02,
    tailGain: 0.8,
    pour: { n: 10, first: 0.55, stagger: 0.13, speed: 560, weave: 26 },
    /** Seconds after the wake before the flight to the heart leaves the last lantern. */
    pourLead: 2.6,
    routes: {
      // From the first lantern: over the pool, the branch, the bluff, down to the well at trunk
      // A's foot, in at the doorway, up the wall-jump shaft, over trunk A's top to the summit.
      'lantern-crown': [
        [
          [1700, 1130],
          [2176, 940],
          [2528, 890],
          [2880, 1070],
          [3160, 1210],
          [3456, 1220],
          [3456, 470],
          [3470, 300],
          [3540, 130],
          [3640, 120],
        ],
      ],
      'lantern-far': [
        // On foot from the summit: along trunk B's bough, down to the catch branch, down to the
        // floor east of the root, up onto the rise, past the shrine to the foot of the far cliff
        // and up its face (the `cliff-n` glints), over the lip.
        [
          [3740, 120],
          [3890, 130],
          [3990, 370],
          [4140, 390],
          [4250, 820],
          [4560, 840],
          [4720, 1010],
          [5212, 1000],
          [5400, 1010],
          [5436, 900],
          [5436, 790],
          [5450, 668],
        ],
      ],
      // From the far lantern down to the awake heart: off the west lip and down the face.
      heart: [
        [
          [5500, 668],
          [5420, 700],
          [5400, 930],
          [5300, 1010],
        ],
      ],
    } as Record<string, number[][][]>,
  },
  camera: {
    /** Wake: the view leans this far (px, at most) toward the heart, for `seconds`. */
    nudge: 150,
    seconds: 2.5,
    /**
     * The last kindle's picture (lantern + heart in one frame): margins round the two px (`side`,
     * `above` the feet of each, `below`), the most it may pull back (`minZoom`; under that it is
     * only the lean above), seconds in / held / out.
     */
    frame: { side: 230, above: 250, below: 120, minZoom: 0.9, in: 1.1, hold: 2.5, out: 1.4 },
    /**
     * The soft pull after it: while she is within `px` x `py` of the awake heart and it is out of
     * the picture, the view leans (eased, `rate` per s) until the heart is `margin` px inside,
     * keeping her `keep` px from the edges (`keepTop` from the top: her head and the lantern).
     */
    pull: { px: 1000, py: 900, margin: 150, keep: 260, keepTop: 300, rate: 1.3 },
    /** Ending: zoom gained, drift up px, share of the way toward the heart, over `frames` sim frames. */
    zoom: 0.045,
    rise: 30,
    toward: 0.06,
    frames: 215,
  },
};

export const MAX_QUADS = 640;
