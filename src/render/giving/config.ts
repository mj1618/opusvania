/**
 * Knobs for the giving renderer (memory/giving-render.md). Times in seconds, lengths in world px.
 * The sim's numbers (reach, flight frames, calm frames) are `tuning.giving`; nothing here changes play.
 */
export const GIVING = {
  /**
   * The glint in flight (the sim's `giftTimer` of `offerFlightFrames`): a small glint on a soft arc
   * from her near hand, lifted `lift` px plus `liftK` of the distance at its middle; `size` = its
   * energy in the glint shader (the star's arms grow with it), `halo` a flare round it; the trail is
   * the last `trail` of the arc (u), `width` px at the head.
   */
  flight: {
    lift: 10,
    liftK: 0.22,
    size: 0.62,
    halo: 13,
    haloE: 0.32,
    trail: 0.42,
    width: 2.4,
    tailLife: 0.16,
    /** A flight shorter than this many frames (a lampwing after her: 3) is drawn as a bright streak from her hands. */
    streakAt: 8,
  },
  /**
   * It lands: a bloom that swells and dies (`bloom` px, `bloomLife` s, `bloomE`), and `sparks` motes
   * that gather INTO what took it (they start `spread` px round it and are drawn in): received, not
   * burst. A light's glass: the same, smaller.
   */
  land: { bloom: 30, bloomLife: 0.42, bloomE: 0.55, sparks: 7, spread: 26, sparkLife: 0.42 },
  /**
   * A creature given a glint keeps it as a warmth inside for the whole calm (`EnemyState.gift`, 600
   * frames), fading with it: a flare `size` px at `e` (x gift share ^ `pow`), breathing at `rate`
   * rad/s, lifted `lift` px over its box centre (a burrback's shell is the top of its box); and now
   * and then (`every` s) an amber mote leaves it and rises (`rise` px/s, `life` s).
   */
  warm: {
    size: 30,
    e: 0.34,
    pow: 0.7,
    rate: 1.7,
    lift: 6,
    lampLift: 0,
    every: 1.15,
    rise: 22,
    life: 1.6,
    mote: 3.2,
  },
  /** A glint that found nothing to take it: back to her, dull (`heat`), `dur` s on a `lift` px arc. */
  back: { dur: 0.5, lift: 30, e: 0.55, heat: 0.1 },
  /** Rest = give: each glint a rest costs leaves her chest for the glass, `gap` s apart, `dur` s, at most `max` drawn. */
  rest: { dur: 0.55, gap: 0.13, lift: 46, max: 8, e: 0.75 },
  /**
   * Being seen, in the world (memory/giving.md: the light she carries is what finds her): a warm pool
   * on the ground and plants round her (surfaces only, like a lantern's), by her level 0-4: radii and
   * strength. Level 2 (a handful: the look the scene was tuned at) is a breath of it; 4 is a lamp that
   * walks. Eased at `rate` /s. A calmed creature's kept glint warms its own ground: `creature`.
   */
  pool: {
    rx: [0, 110, 170, 270, 380],
    ry: [0, 70, 110, 175, 250],
    e: [0, 0.05, 0.12, 0.5, 0.95],
    lift: 30,
    rate: 2.2,
    creature: { rx: 90, ry: 55, e: 0.3 },
    /** A soft warm halo in the air round her chest from level 3 (size px, energy per level). */
    halo: { size: 70, e: [0, 0, 0, 0.1, 0.22] },
  },
  /**
   * The glints she carries, visible: `n` = round(`k` x sqrt(wallet)) motes (at most `max`, none
   * empty-handed) on a slow tilted orbit round her chest (`r` px, a spread of `spread`), dimmer on
   * the far side, drifting with her (`lag`). So a screenshot shows about how much she has.
   */
  carried: { k: 1.6, max: 11, r: 24, spread: 12, speed: 1.05, size: 4.2, e: 0.75, lift: 18, lag: 9 },
  /**
   * A pour (held V into a lantern, lamp or heart: one glint every `offerStreamFrames` 8): once two have
   * gone within `gap` s of each other it is drawn as one ribbon from her hands to the glass (`ribbon`
   * energy, `width` px) with `beads` glints running down it at `speed` arcs/s (`size`, `bead`), a steady
   * glow at the glass (`glass` px, `glassE`) and at her hands; in at `in` /s, out at `out` /s after the last.
   */
  pour: {
    gap: 0.3,
    ribbon: 0.55,
    width: 2.8,
    beads: 5,
    speed: 2.2,
    size: 5,
    bead: 0.85,
    glass: 26,
    glassE: 0.35,
    hands: 14,
    handsE: 0.3,
    in: 10,
    out: 5,
  },
  /** The offer: a warm light on her face from the glint in her hands before it leaves (`size` px, `e`, `life` s). */
  face: { size: 18, e: 0.42, life: 0.3 },
  /** Empty hands: a few dull specks fall from them (nothing in them). */
  empty: { specks: 3, e: 0.22, fall: 34, life: 0.7 },
} as const;
