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
    intensity: 1.05,
    /** 0..1: how much each wider blur level carries. Higher = wider, softer halo. */
    spread: 0.68,
    /** Tap distance multiplier of the upsample tent (1 = normal). */
    radius: 1.15,
    /** Saturation of the glow, so cyan plants bleed cyan and the ember bleeds orange, not white. */
    saturation: 1.35,
    /** Extra glow for saturated light: cyan plants and the ember bloom harder than pale sky and fog. */
    colorBoost: 2.6,
    /** 0..1: how much less bloom lands on pixels that are already bright and pale (sky, lit fog). */
    paleCut: 0.8,
  },

  lights: {
    /** Gain on surfaces: how much a light lifts the colours already there. */
    gain: 2.2,
    /** Strength left where the surroundings are bright already (the light well). */
    inBrightPlaces: 0.45,
    /** A little of the light's own colour added to every surface it reaches. */
    warm: 0.07,
    /** Glints: extra light on spots that are already bright (wet moss, water highlights). */
    glint: 0.35,
    /** The glow hanging in the air around a light, and how far it reaches (x the light's radius). */
    haze: 0.06,
    hazeReach: 1.9,
    /** Falloff exponent on the smooth window (higher = tighter core). */
    falloff: 1.25,
    /**
     * Lights land on the playfield (the mask in lib/fx-mask.ts). This much still reaches
     * everything else on screen (0 = background untouched, 1 = no masking).
     */
    background: 0.1,
    /** Every light's radius is scaled by this (the skins register a modest reach). */
    reach: 1.35,
  },

  grade: {
    exposure: 1.04,
    /** Highlights roll off smoothly above this instead of clipping. */
    shoulder: 0.72,
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
    inner: 0.48,
    outer: 1.08,
    strength: 0.34,
    /** The corners also go cooler. */
    tint: 0x6f9bd0,
    tintAmount: 0.3,
  },

  /** Grain amplitude (0..1 of full scale). Also dithers away banding in the dark gradients. */
  grain: 0.016,
  /** Red/blue split toward the frame corners, as a fraction of the view height. */
  chroma: 0.0007,
};

export type PostConfig = typeof POST;

/**
 * The grade follows the scene's three moods (lib/fx-zones.ts), blended by the camera's x:
 * [left glade, light well, right stand]. `amount` scales how far each zone departs from POST.grade
 * (0 = one grade everywhere).
 */
export const ZONE_GRADE = {
  amount: 1,
  /** Shadows: moonlit blue, the default teal-indigo, violet dusk. */
  shadowTint: [0x0a2f66, 0x0c2450, 0x2a1c5a] as const,
  shadowLift: [0.24, 0.2, 0.25] as const,
  /** Highlights: cool white, warm gold, rose. */
  highlightTint: [0xe4f3ff, 0xffe2b8, 0xffdcea] as const,
  highlightWarmth: [0.3, 0.45, 0.4] as const,
  saturation: [1.12, 1.08, 1.14] as const,
  vignetteTint: [0x5f93dc, 0x6f9bd0, 0x8a84d8] as const,
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
