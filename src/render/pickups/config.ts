/**
 * Look knobs for the glints (world-space collectibles) and what happens when one is gathered.
 * Gameplay numbers (reach, timing, value) are in src/sim/tuning.ts `pickups`; this is only how it
 * looks. Sizes are world px, times seconds. Live: `__pickups.cfg.glint.nearGain = 0; __game.render()`.
 * The shapes and brightness of the lights themselves are in the shader (batch.ts).
 */
export const GLINTS = {
  /** Overall brightness of everything the batch draws. */
  gain: 1,
  glint: {
    /** Half-size of the quad a glint is drawn in; its shader works in px inside it. */
    quad: 40,
    /** Idle bob (x, y) in px and how fast. */
    bobX: 1.6,
    bobY: 3.2,
    bobRate: 1.25,
    /** Brightens by this much as the hero comes near (before it wakes), inside `nearPx`. */
    nearGain: 0.4,
    nearPx: 240,
  },
  great: {
    quad: 96,
    /** Light centre above the bud's base, px. */
    seat: 13,
    /** Sway of the whole bud in the wind, radians per unit of wind(). */
    sway: 0.07,
    /** The corolla of light that unfolds in the ceremony: petals, their length px, brightness. */
    petals: 6,
    petalLength: 46,
    petalGain: 0.34,
    /** How far the light lifts out of the bud before it leaves, px. */
    lift: 30,
  },
  flight: {
    /**
     * The last part of the wake-to-collect time is the flight; before it the glint notices. The
     * flight itself lags (it barely moves for the first third) and then slingshots in.
     */
    seconds: 0.22,
    greatSeconds: 0.34,
    /** Exponent of the catch-up: higher = hangs back longer, arrives faster. */
    lag: 2.5,
    /** How far it backs away from her first (anticipation), px. */
    recoil: 12,
    greatRecoil: 10,
    /** Sideways swing of the path as a share of the distance, and its cap in px. */
    curve: 0.34,
    curveMax: 58,
    /** Trail: samples kept (max 20), half-width at the head in px, samples dropped per second once absorbed. */
    trail: 11,
    trailWidth: 2.6,
    greatTrailWidth: 6,
    trailFade: 110,
  },
  absorb: {
    sparks: 5,
    comboSparks: 4,
    greatSparks: 18,
    /** Spark speed range px/s, drag per second, upward drift px/s². */
    speedMin: 60,
    speedMax: 200,
    drag: 5.5,
    lift: 46,
    /** How much of the hero's own velocity the burst inherits, so it stays round her. */
    carry: 0.72,
    flare: 34,
    greatFlare: 96,
  },
  /** The wave of light a great glint sends along the ground: reach px, seconds, height px, brightness. */
  wave: { reach: 300, seconds: 0.85, height: 15, length: 74, gain: 0.5 },
  /** Up to this many great glints near the view also register as point lights (post + plants). */
  lights: { max: 2, radius: 190, color: 0xffb25a, intensity: 0.22, reachPx: 1500 },
};

export const MAX_QUADS = 640;
