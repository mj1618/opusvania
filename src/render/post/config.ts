/**
 * Every knob of the post stage. The object is live: change a value (from the Tweakpane "post"
 * folder, or `__game`-side code) and the next frame uses it. Colours are 0xRRGGBB.
 */
export const POST = {
  /** Master switch: false = the scene goes to the screen untouched. */
  enabled: true,
  /** Multisample the scene texture: 'auto' = only below ~2 device px per logical px. */
  msaa: 'auto' as 'auto' | 'on' | 'off',
  /** Debug: the frame shows the hero matte (white = her) instead of the picture. Capture tools use it to find her pixels. 2 = the soft matte the separation uses. */
  debugMatte: false as boolean | 2,

  bloom: {
    /** Brightness (max channel, 0..1) where things start to glow, and the soft knee around it. */
    threshold: 0.58,
    knee: 0.3,
    /** How much of the blurred glow is added back. */
    intensity: 0.7,
    /** 0..1: how much each wider blur level carries. Higher = wider, softer halo. */
    spread: 0.68,
    /** Tap distance multiplier of the upsample tent (1 = normal). */
    radius: 1.15,
    /** Saturation of the glow, so cyan plants bleed cyan and the ember bleeds orange, not white. */
    saturation: 1.35,
    /** Extra glow for saturated light: cyan plants and the ember bloom harder than pale sky and fog. */
    colorBoost: 1.3,
    /**
     * Light wrap: dark pixels beside a bright opening glow at the edge like backlit leaves. `wrap` on
     * the ground route, `wrapHigh` with the camera at the top of the scene (the canopy route).
     */
    wrap: 1.2,
    wrapHigh: 3.2,
    /** 0..1: how much less bloom lands on pixels that are already bright and pale (sky, lit fog). */
    paleCut: 0.8,
  },

  lights: {
    /**
     * Gain on surfaces: at the heart of a light a surface's own colour is multiplied by 1 + gain
     * (hue and shading kept).
     */
    gain: 0.38,
    /** Strength left where the surroundings are bright already (the light well). */
    inBrightPlaces: 0.3,
    /** A small floor added before the gain, so near-black soil still shows the pool. */
    warm: 0.004,
    /** How much of the light's own colour tints the surface (0 = none, 1 = fully). */
    tint: 0.22,
    /** Chroma raised with the gain: lit foliage gets richer, not paler. */
    chroma: 0.12,
    /** No colour channel of a lit surface goes above this (keeps hue; nothing clips to white). */
    channelCap: 0.62,
    /** Glints: extra light on spots that are already bright (wet moss, water highlights). */
    glint: 0.08,
    /** The glow hanging in the air around a light, and how far it reaches (x the light's radius). */
    haze: 0.006,
    hazeReach: 1.9,
    /** Falloff exponent on the smooth window (higher = tighter core). */
    falloff: 1.25,
    /**
     * Lights land on the playfield (the mask in lib/fx-mask.ts). This much still reaches
     * everything else on screen (0 = background untouched, 1 = no masking).
     */
    background: 0.1,
    /** How much silhouette edges facing the light gain and edges facing away lose. */
    direction: 0.55,
    /** Lit surfaces approach this luminance and never pass it (moss and grass must not go white). */
    cap: 0.43,
    /**
     * The hero matte (lib/fx-mask.ts): how much of the light and halo is kept off the hero's own
     * pixels (1 = all), and how much of the bloom.
     */
    heroProtect: 1,
    heroBloomCut: 1,
    /** How much of the hero's own brightness is kept OUT of the bloom (1 = she never glows). */
    heroBloomSource: 0.8,
    /** Every light's radius is scaled by this (the skins register a modest reach). */
    reach: 1.15,
    /**
     * The lights of the goal (registry ids below): the things she lights are THE lights of their
     * place. They are never dropped when more than MAX_LIGHTS are in range (the hero's ember and
     * these go first, the rest by distance from the view centre), their strength is multiplied by
     * `goalBoost`, under them the lit-surface caps rise by `goalCap` (x at the heart of the light)
     * and surfaces take more of the light's own colour (`goalTint`),
     * the hero pocket lets go (`goalPocket`: 1 = no darkening beside a lit lantern), and sparks are
     * allowed at their core even beside the hero (the flame is a true highlight).
     */
    goalIds: ['lantern0', 'lantern1', 'lantern2', 'lanternSwell', 'heart'] as readonly string[],
    goalBoost: 1.8,
    goalCap: 0.22,
    goalPocket: 0.9,
    /** Extra tint toward the light's colour under them (pale rock goes amber, not chalk: 2.4 / 0.45 / 0 blew the boulder by the first lantern to cream). */
    goalTint: 0.4,
  },

  /**
   * The pocket around the hero (found through the 'ember' light): the surroundings within `radius`
   * px get darker and greyer, the `inner` px on the hero itself are left alone. Strength per zone
   * is in ZONE_GRADE.
   */
  hero: {
    radius: 360,
    inner: 62,
    /** Flat darkening at the heart of the pocket (0.18 = 18%). */
    darken: 0.18,
    desaturate: 0.3,
    /**
     * Whatever is brighter than `ceiling` (0..1 luminance) behind the hero is pulled this far back
     * toward it, so the surround stays under ~110/255 even in front of bright sky.
     */
    ceiling: 0.36,
    pull: 0.88,
  },

  /**
   * Separation by value BEHIND the hero, not light on her (the owner rejects halos, rims and any
   * brightening of her). Within ~20 px of her outline (the hero matte, blurred), on the background
   * side only, values are pushed away from her own dark value (`pivot`, 0..1 luminance of the
   * finished picture, her body is ~0.115): from `pivot` to `pivot + width` the background gains up
   * to `lift` and takes the cool grey `tint` (a breath of mist), from `pivot` down to
   * `pivot - width` it loses up to `darken` of its value. Above `liftEnd` nothing is lifted: mist
   * and sky behind her need no help, and lifting them is what showed as a halo. 0 / 0 = off.
   */
  separation: {
    pivot: 0.11,
    width: 0.06,
    lift: 0.08,
    darken: 0.65,
    /** The lift fades out between these luminances: a background this light needs no help. */
    liftEnd: [0.2, 0.33] as const,
    /** Colour of the lift per zone [left, centre, right] and how grey the background goes under it. */
    tint: [0x9fc4e8, 0xb9d6c0, 0x9db4ee] as const,
    desaturate: 0.5,
    /** 0..1: how much of the widest blur level the feather carries (1 = ~25 px, 0 = ~8 px). */
    spread: 0.6,
    /** Gain on the blurred matte before it is clamped to 1: higher = the full push holds farther out from her edge. */
    gain: 4,
  },

  grade: {
    exposure: 1.04,
    /** Lift of the mid-tones only (0 = none): blacks and highlights are left where they are. */
    midLift: 0,
    /** Highlights roll off smoothly above this instead of clipping. */
    shoulder: 0.74,
    /** S-curve strength around the pivot (0 = none). */
    contrast: 0.16,
    pivot: 0.36,
    saturation: 1.1,
    /**
     * The toe: everything darker than `toe` (0..1 luminance) is pushed down by a power curve
     * (out = toe * (l / toe)^(1 + toeDepth)); above it nothing moves. This is what turns the
     * dark-grey shelf into near-black without touching mid-tones (per zone in ZONE_GRADE).
     */
    toe: 0.2,
    toeDepth: 0.8,
    /**
     * Points of light: how far the core of a SMALL very bright thing (glint, firefly, glow-plant
     * core; found by comparing it with the blurred glow around it) goes toward its own hue at
     * full value mixed `sparkWhite` toward white. Areas of light are not touched.
     */
    spark: 0.9,
    sparkWhite: 0.7,
    /** Split toning: shadows are lifted toward `shadowTint`, highlights multiplied toward `highlightTint`. */
    shadowTint: 0x0c2450,
    shadowLift: 0.2,
    highlightTint: 0xffe2b8,
    highlightWarmth: 0.42,
  },

  vignette: {
    /** Distance from the centre (in view heights) where darkening starts / is complete. */
    inner: 0.38,
    outer: 1.02,
    strength: 0.62,
    /** The corners also go cooler. */
    tint: 0x6f9bd0,
    tintAmount: 0.3,
    /**
     * Small lights are spared: a pixel of the scene whose brightest channel is above `lightFrom`
     * (fully by + 0.25) AND well above the brightness of the ~30 px around it takes this much less
     * of the vignette. Areas (mist, sky) still close the frame; a glint 30 px from the edge keeps
     * its value (it lost half).
     */
    lightKeep: 0.85,
    lightFrom: 0.25,
  },

  /** Grain amplitude (0..1 of full scale). Also dithers away banding in the dark gradients. */
  grain: 0.016,
  /**
   * Red/blue split toward the frame corners, as a fraction of the view height (try 0.0007). Off by
   * default: it costs two more full-resolution taps for something nobody notices.
   */
  chroma: 0,
};

export type PostConfig = typeof POST;

/**
 * The grade follows the scene's three moods (lib/fx-zones.ts), blended by the camera's x:
 * [left glade, light well, right stand]. `amount` scales how far each zone departs from POST.grade
 * (0 = one grade everywhere).
 */
export const ZONE_GRADE = {
  amount: 1,
  /**
   * The value plan: a dark moonlit glade with cyan accents, a bright warm light well, a dark
   * violet-emerald stand. Exposure, and an S-curve whose pivot sits high in the dark zones so the
   * milky mid-tones of the fog drop while glows and sky stay up.
   */
  exposure: [1.3, 1.12, 1.4] as const,
  contrast: [0.36, 0.28, 0.36] as const,
  pivot: [0.4, 0.36, 0.4] as const,
  /** Shadows: moonlit blue, the default teal-indigo, violet dusk. */
  shadowTint: [0x081f52, 0x0e2a12, 0x24164f] as const,
  shadowLift: [0.2, 0.16, 0.24] as const,
  /** Highlights: cool white, warm gold, rose. */
  highlightTint: [0xe4f3ff, 0xffe2b8, 0xffdcea] as const,
  highlightWarmth: [0.3, 0.6, 0.4] as const,
  saturation: [1.16, 1.08, 1.16] as const,
  toeDepth: [0.8, 0.8, 0.8] as const,
  /**
   * Darks and mid-tones only (highlights keep `saturation`): their saturation, and a tint they
   * are leaned toward at constant luminance: blue-teal, green (the amber stays in the openings,
   * which are highlights), indigo-violet.
   */
  richSaturation: [1.5, 1.45, 1.38] as const,
  richTint: [0xd8f0ff, 0xd0ffd4, 0xd6d4ff] as const,
  vignetteTint: [0x5f93dc, 0x6f9bd0, 0x8a84d8] as const,
  /** Multiplier on POST.hero.darken: the pocket matters most where the place glows most. */
  heroPocket: [1.2, 1.7, 1.1] as const,
};

/** Bloom targets, widest first. Fixed in logical units so the look does not depend on window size. */
export const BLOOM_LEVELS: ReadonlyArray<readonly [number, number]> = [
  [960, 540],
  [480, 270],
  [240, 135],
  [120, 68],
  [60, 34],
  [30, 17],
];

/** The light accumulation target (lights are smooth: a small target is plenty). */
export const LIGHT_TARGET: readonly [number, number] = [480, 270];

/** Most lights drawn at once (the ember and the goal's lights first, then the nearest to the view centre). */
export const MAX_LIGHTS = 12;

/** How many of the goal's lights the composite knows by position (three lanterns can never share a screen with the swell and the heart). */
export const GOAL_LIGHTS = 4;
