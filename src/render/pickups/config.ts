/**
 * Look knobs for the glints (world-space collectibles) and what happens when one is gathered.
 * Gameplay numbers (reach, timing, value) are in src/sim/tuning.ts `pickups`; this is only how it
 * looks. Sizes are world px, times seconds. Live: `__pickups.cfg.glint.halo = 0.3; __game.render()`.
 */
export const GLINTS = {
  glint: {
    /** Half-size of the quad a glint is drawn in; its shader works in px inside it. */
    quad: 52,
    /** Idle bob (x, y) in px and how fast. */
    bobX: 1.6,
    bobY: 3.2,
    bobRate: 1.25,
    /** Brightens by this much as the hero comes near (before it wakes), inside `nearPx`. */
    nearGain: 0.4,
    nearPx: 240,
  },
  great: {
    quad: 128,
    /** Light centre above the bud's base, px. */
    seat: 15,
    /** Sway of the whole bud in the wind, radians per unit of wind(). */
    sway: 0.07,
  },
  flight: {
    /** The last part of the wake-to-collect time is the flight itself; before it the glint notices. */
    seconds: 0.15,
    greatSeconds: 0.3,
    /** How far it backs away from her first (anticipation), px. */
    recoil: 13,
    greatRecoil: 22,
    /** Sideways bulge of the path as a share of the distance, and its cap in px. */
    curve: 0.3,
    curveMax: 52,
    /** Trail: samples kept, and half-width at the head in px. */
    trail: 12,
    trailWidth: 3.2,
    greatTrailWidth: 8.5,
  },
  absorb: {
    sparks: 5,
    comboSparks: 4,
    greatSparks: 26,
    /** Spark speed range px/s, drag per second, upward drift px/s². */
    speedMin: 70,
    speedMax: 230,
    drag: 5.5,
    lift: 46,
    /** How much of the hero's own velocity the burst inherits, so it stays round her. */
    carry: 0.72,
    flare: 40,
    greatFlare: 120,
    greatRing: 210,
  },
  /** Up to this many great glints near the view also register as point lights (post + plants). */
  lights: { max: 2, radius: 210, color: 0xffb25a, intensity: 0.26, reachPx: 1500 },
};

export const MAX_QUADS = 640;
