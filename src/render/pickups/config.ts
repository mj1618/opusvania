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
    /** Awake (she is near) it is this much brighter than the plain star. */
    nearGain: 0.4,
    /**
     * Dormant by default: far from her a glint sleeps as a small cut star (`K_STAR` in the shader):
     * cool and pale in a dark seat, found by its shape and its temperature, not by brightness (every
     * mote in the air is a warm round dot; as a dim gold mote it could not be told from them, and a
     * line of them led nowhere). It warms and gives way to the gold glint between `wakePx` and
     * `wakeFull` px from her chest, which leans `lean` px her way.
     */
    wakePx: 260,
    wakeFull: 120,
    lean: 4,
    /** The sleeping star: quad half-size px (the star is 0.6 of it tall, 0.37 wide), presence 0..1. */
    star: 21,
    starGain: 1,
    /**
     * Its twinkle is shared along a trail (glints whose ids differ only in their last number): a
     * pulse runs from the first to the last, `twinkleStep` s apart, each `twinkleSeconds` long, then
     * the trail rests `twinkleRest` s. So a line of them reads as a path that leads somewhere.
     */
    twinkleStep: 0.26,
    twinkleSeconds: 0.7,
    twinkleRest: 1.7,
    /**
     * Hierarchy (playtest 3: the spawn frame held 18-20 full stars, more and brighter than the one
     * lantern and its crown). Only the `lead` untaken stars of a trail nearest to her stand at full
     * size and presence, and only within `leadNear` px of her chest; out to `leadFar` they sink to
     * `leadFarLevel`. Every other star of the trail is a seed: `seedScale` of the size at
     * `seedLevel` presence, no rays, a faint swell when the trail's twinkle passes (`seedSwell`),
     * so the line still reads as a line that leads off. Taking one promotes the next (eased at
     * `levelRate` per second).
     */
    lead: 2,
    leadNear: 460,
    leadFar: 820,
    leadFarLevel: 0.44,
    seedLevel: 0.3,
    seedScale: 0.58,
    seedSwell: 0.22,
    levelRate: 2.6,
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
    /** Dormant (she is beyond `wakePx`): its size and brightness; fully awake inside `wakeFull`. */
    dormScale: 0.72,
    dormGain: 0.5,
    wakePx: 340,
    wakeFull: 150,
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
    /** The ribbon's greatest length, px. */
    trailMax: 84,
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
