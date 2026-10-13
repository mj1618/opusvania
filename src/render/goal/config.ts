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
    /** Seconds the price stays; stars fade in one after another this far apart. */
    hold: 1.9,
    fadeOut: 0.55,
    step: 0.035,
    /** The arc of stars over the lantern: radius px, degrees between two stars, widest span. */
    radius: 64,
    pitch: 12.5,
    span: 150,
    /** Height of the arc's centre above the foot. */
    lift: 72,
    star: 5.2,
  },
  heart: {
    light: { radius: 380, color: 0xffa858, intensity: 0.62 },
    /** How far the bud stands open: awake, and in full bloom at the ending. */
    awake: 0.5,
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
    wave: { speed: 2300, width: 340, height: 640, gain: 0.24, reach: 5200 },
    /** Motes that drift toward it across the view when it wakes: how many, seconds. */
    drift: 34,
    driftSeconds: 3.4,
  },
  ending: {
    /** Light climbing the hollow tree and spreading under the canopy: brightness of each. */
    column: 0.3,
    canopy: 0.13,
    /** How many of the glints she still carries lift out of her (at most). */
    fireflies: 40,
  },
  camera: {
    /** Wake: the view leans this far (px, at most) toward the heart, for `seconds`. */
    nudge: 54,
    seconds: 1.9,
    /** Ending: zoom gained, drift up px, share of the way toward the heart, over `frames` sim frames. */
    zoom: 0.045,
    rise: 30,
    toward: 0.06,
    frames: 215,
  },
};

export const MAX_QUADS = 420;
