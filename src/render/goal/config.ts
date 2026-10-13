/**
 * Look knobs for the goal: the three moth-lanterns, the heart of the grove and the ending
 * (memory/goal-render.md). Rules and timings that matter to play are in src/sim/tuning.ts `goal`;
 * this is only how it looks. Sizes are world px, times seconds. Live: `__goal.cfg.lantern.light.intensity
 * = 0; __game.render()`.
 */
export const GOAL = {
  lantern: {
    /** The point light a lit lantern registers (post lands it on ground and plants). */
    light: { radius: 240, color: 0xffb060, intensity: 1 },
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
    /** The rest point's bead is this much brighter. */
    restGain: 1.18,
    /** Glass swing: stiffness, damping, wind sway (rad per unit of wind()). */
    swingK: 46,
    swingC: 3.2,
    sway: 0.1,
    /** Warm light on the surfaces round a lit one (surface.ts): radii px, strength. */
    pool: { rx: 400, ry: 300, gain: 1 },
    /** The lift of the mist behind it (additive, behind the playfield): size px, height above the foot, alpha. */
    mist: { color: 0xffa050, width: 1000, height: 560, lift: 120, alpha: 0.2 },
    /** Fireflies that gather round it. */
    flies: 6,
    /** A lit lantern wakes the dormant glints within this, px. */
    wakePx: 380,
    /** Motes that rise from a lit glass: per second. */
    motes: 0.55,
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
  },
  refuse: {
    /** Seconds the price stays after a refusal (it also stays while she stands there short), and its fade. */
    hold: 4,
    fadeOut: 0.7,
    /** Stars fade in one after another this far apart, s. */
    step: 0.03,
    /** The crown of stars round the glass: radius px, degrees between two stars, widest span; star half-height px. */
    radius: 52,
    pitch: 23,
    span: 262,
    star: 7.5,
  },
  heart: {
    light: { radius: 380, color: 0xffa858, intensity: 0.62 },
    /** How far the bud stands open: awake, and in full bloom at the ending. */
    awake: 0.78,
    /** Asleep, the straps part this far once every lantern but the last burns. */
    ajar: 0.2,
    /** Its warm light on the shrine and the ground once awake (surface.ts). */
    pool: 0.85,
    /** Its glows (tints, alphas; px): cold breath asleep; awake a golden-white flower, a pillar up the hollow tree, warm mist, a glow on the horizon from afar. Golden-white on purpose: the hollow tree's own glow behind it is orange-red. */
    glow: {
      cold: 0x6fb0ff,
      coldAlpha: 0.2,
      gold: 0xffeac4,
      goldAlpha: 0.42,
      pillar: 0xffcc80,
      pillarAlpha: 0.17,
      pillarWidth: 460,
      pillarHeight: 1700,
      mist: 0xffb262,
      mistAlpha: 0.16,
      band: 0xff9c50,
      horizonAlpha: 0.6,
    },
    bloom: 1,
    open: [26, 5.2],
    /** The core: quad half-size px, energy awake / in bloom. */
    /** At the ending the light lifts this far out of the bud, px. */
    lift: 172,
    core: 11,
    coreGain: 0.85,
    coreBloom: 1.25,
    halo: 54,
    haloGain: 0.26,
    /** Motes rising from the open heart: per second. */
    motes: 2.2,
    /** The wave through the forest when it wakes: px/s, half-width and half-height px, brightness. */
    wave: { speed: 2300, width: 340, height: 640, gain: 0.28, surface: 1.1, reach: 6200 },
    /** Motes that drift toward it across the view when it wakes: how many, seconds. */
    drift: 34,
    driftSeconds: 3.4,
  },
  ending: {
    /** How much brighter the pillar gets; alpha of the light under the canopy and along the mist band. */
    pillar: 0.45,
    canopy: 0.16,
    band: 0.11,
    /** Warmth on every surface in view (surface.ts). */
    surface: 0.38,
    /** Fireflies rising across the view: per second. */
    motes: 4,
    /** How many of the glints she still carries lift out of her (at most). */
    fireflies: 40,
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
