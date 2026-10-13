/**
 * Every knob of the post stage. The object is live: change a value (from the Tweakpane "post"
 * folder, or `__game`-side code) and the next frame uses it. Colours are 0xRRGGBB.
 */
export const POST = {
  /** Master switch: false = the scene goes to the screen untouched. */
  enabled: true,
  /** Multisample the scene texture: 'auto' = only below ~2 device px per logical px. */
  msaa: 'auto' as 'auto' | 'on' | 'off',

  bloom: {
    /** Brightness (max channel, 0..1) where things start to glow, and the soft knee around it. */
    threshold: 0.58,
    knee: 0.3,
    /** How much of the blurred glow is added back. */
    intensity: 0.85,
    /** 0..1: how much each wider blur level carries. Higher = wider, softer halo. */
    spread: 0.68,
    /** Tap distance multiplier of the upsample tent (1 = normal). */
    radius: 1.15,
    /** Saturation of the glow, so cyan plants bleed cyan and the ember bleeds orange, not white. */
    saturation: 1.35,
    /** Extra glow for saturated light: cyan plants and the ember bloom harder than pale sky and fog. */
    colorBoost: 2.6,
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
    gain: 1.5,
    /** Strength left where the surroundings are bright already (the light well). */
    inBrightPlaces: 0.3,
    /** A small floor added before the gain, so near-black soil still shows the pool. */
    warm: 0.012,
    /** How much of the light's own colour tints the surface (0 = none, 1 = fully). */
    tint: 0.22,
    /** Chroma raised with the gain: lit foliage gets richer, not paler. */
    chroma: 0.08,
    /** No colour channel of a lit surface goes above this (keeps hue; nothing clips to white). */
    channelCap: 0.8,
    /** Glints: extra light on spots that are already bright (wet moss, water highlights). */
    glint: 0.35,
    /** The glow hanging in the air around a light, and how far it reaches (x the light's radius). */
    haze: 0.04,
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
    cap: 0.55,
    /**
     * The hero matte (lib/fx-mask.ts): how much of the light and halo is kept off the hero's own
     * pixels (1 = all), and how much of the bloom.
     */
    heroProtect: 1,
    heroBloomCut: 0.65,
    /** Every light's radius is scaled by this (the skins register a modest reach). */
    reach: 1.5,
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

  grade: {
    exposure: 1.04,
    /** Highlights roll off smoothly above this instead of clipping. */
    shoulder: 0.74,
    /** S-curve strength around the pivot (0 = none). */
    contrast: 0.16,
    pivot: 0.36,
    saturation: 1.1,
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
  exposure: [1.48, 1.22, 1.72] as const,
  contrast: [0.36, 0.28, 0.36] as const,
  pivot: [0.4, 0.36, 0.4] as const,
  /** Shadows: moonlit blue, the default teal-indigo, violet dusk. */
  shadowTint: [0x081f52, 0x2c2409, 0x24164f] as const,
  shadowLift: [0.2, 0.16, 0.24] as const,
  /** Highlights: cool white, warm gold, rose. */
  highlightTint: [0xe4f3ff, 0xffe2b8, 0xffdcea] as const,
  highlightWarmth: [0.3, 0.6, 0.4] as const,
  saturation: [1.16, 1.08, 1.16] as const,
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

/** Most lights drawn at once (the nearest to the view win). */
export const MAX_LIGHTS = 12;
