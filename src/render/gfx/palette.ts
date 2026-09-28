/**
 * District palettes for the code-drawn greybox (PLAN §2, §5.1). Tallage's districts are keyed to
 * the four noise colours: brown (heavy, amber furnace haze), pink (rose dusk), violet (cold indigo),
 * white (ash and static). Rooms pick one in content/rooms-dressing; the art bible will replace these.
 *
 * Value structure (atmosphere pillar): sky/fog are mid-dark and hazy, far layers sit close to the
 * fog colour, nearer layers get darker, and the playfield terrain is the darkest mass with the
 * brightest rims, so the playfield has the most contrast and the background recedes.
 */

export interface Palette {
  skyTop: number;
  skyBottom: number;
  /** Low furnace/city glow on the horizon. */
  glow: number;
  /** Atmospheric fog: distant layers blend toward this. */
  fog: number;
  /** Base colour of building silhouettes before fog. */
  silhouette: number;
  /** Solid terrain surface, and the colour it fades to deep inside a mass. */
  terrain: number;
  terrainDeep: number;
  /** Lit top edge and exposed side/bottom faces of terrain. */
  rim: number;
  rimSide: number;
  /** Default lamp light colour, and lit windows in the skyline. */
  lamp: number;
  window: number;
  ambient: { color: number; level: number };
  /** Ambient particle tints. */
  mote: number;
  ember: number;
  soot: number;
  /** Colour grade: tint multiplies (gain), lift adds to shadows. */
  grade: { gain: number; lift: number; saturation: number; contrast: number };
}

export const PALETTES = {
  // Warm amber lamps against cool mauve shadows: the furnace quarter.
  brown: {
    skyTop: 0x0a0910,
    skyBottom: 0x322628,
    glow: 0xc4662e,
    fog: 0x3a3136,
    silhouette: 0x141118,
    terrain: 0x2a2427,
    terrainDeep: 0x100d11,
    rim: 0xeccaa0,
    rimSide: 0x75604f,
    lamp: 0xffa24c,
    window: 0xffb866,
    ambient: { color: 0x9c9ab8, level: 0.62 },
    mote: 0xffd8a8,
    ember: 0xff8a3a,
    soot: 0x0e0b0c,
    grade: { gain: 0xfff4e8, lift: 0x06050a, saturation: 0.92, contrast: 1.08 },
  },
  // Rose lamps against teal-grey shadows.
  pink: {
    skyTop: 0x090a12,
    skyBottom: 0x33202c,
    glow: 0xd05a7e,
    fog: 0x382a36,
    silhouette: 0x140e16,
    terrain: 0x2a2229,
    terrainDeep: 0x0f0b10,
    rim: 0xf4c8d2,
    rimSide: 0x76525f,
    lamp: 0xff84a6,
    window: 0xffa6bc,
    ambient: { color: 0x8eaab4, level: 0.6 },
    mote: 0xffd0dc,
    ember: 0xff6a8a,
    soot: 0x0e090d,
    grade: { gain: 0xfff0f4, lift: 0x04060a, saturation: 0.92, contrast: 1.08 },
  },
  // Cold indigo, lamps a pale violet: the quiet, high ward.
  violet: {
    skyTop: 0x05061a,
    skyBottom: 0x201e46,
    glow: 0x7a5cd8,
    fog: 0x2a2852,
    silhouette: 0x0d0c1e,
    terrain: 0x23213a,
    terrainDeep: 0x0c0c22,
    rim: 0xd0caff,
    rimSide: 0x575384,
    lamp: 0xb49cff,
    window: 0xc4acff,
    ambient: { color: 0x9294c8, level: 0.6 },
    mote: 0xd8d0ff,
    ember: 0xb08aff,
    soot: 0x090916,
    grade: { gain: 0xecf0ff, lift: 0x04040c, saturation: 0.9, contrast: 1.1 },
  },
  // Ash and static: near-monochrome, lamps a faint warm white.
  white: {
    skyTop: 0x090b0e,
    skyBottom: 0x2c3238,
    glow: 0xa0acb4,
    fog: 0x363e44,
    silhouette: 0x111519,
    terrain: 0x272b2f,
    terrainDeep: 0x0f1214,
    rim: 0xeef2f4,
    rimSide: 0x646c72,
    lamp: 0xfff0dc,
    window: 0xe8eef4,
    ambient: { color: 0xa2aab6, level: 0.6 },
    mote: 0xf0f4ff,
    // Embers stay warm even in the ash district: the one warm accent.
    ember: 0xffa060,
    soot: 0x0b0d0f,
    grade: { gain: 0xf6f6fa, lift: 0x040506, saturation: 0.72, contrast: 1.12 },
  },
} satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;
export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];

/**
 * Noise colours for sound-source visuals (humming/ghosted outlines, PLAN §2). Other render code
 * should use these so a brown hum glows the same brown everywhere. `light` is the light it casts.
 */
export const NOISE_COLOURS = {
  brown: { core: 0xd07a3c, glow: 0xa0521e, light: 0xff9a50 },
  pink: { core: 0xff86b0, glow: 0xd04a7c, light: 0xff9ec0 },
  violet: { core: 0xa88aff, glow: 0x6a4ad8, light: 0xb49cff },
  white: { core: 0xf0f4ff, glow: 0x9aa4c0, light: 0xe8f0ff },
} as const;
export type NoiseColour = keyof typeof NOISE_COLOURS;
