/**
 * Every knob and colour of Lanternroot's pieces (render/lantern, memory/lanternroot-art.md). Colours are
 * local colours before post; warm belongs to the firefly's lamps, silver to the moon and her light.
 */
export const LR = {
  lamp: {
    /** Lit paper: the edge (seen at a graze, darkest), the body, the hot middle, the core. */
    paperEdge: 0x8a3412,
    paper: 0xd8742a,
    paperHot: 0xffb458,
    core: 0xfff0c6,
    rib: 0x7a2c0e,
    halo: 0xff9a48,
    ember: 0xc0402a,
    smoke: 0x6a6460,
    husk: 0x3a2a1e,
    lace: 0x8a6a48,
    silk: 0xa89a84,
    moth: 0x4a3a2c,
    mothLit: 0xf2d8a8,
    freed: 0xe8dcc4,
    /** Moths circling each kind of lamp. */
    mothsWick: 7,
    mothsLantern: 12,
    mothsGreat: 26,
    /** Freed moths drawn at most per snuff. */
    freedMax: 40,
    /** Point light reach per kind (px) and colour; at most this many lamp lights at once. */
    light: { wick: 300, lantern: 360, ring: 320, great: 520, greatWide: 520, gloam: 560 } as Record<
      string,
      number
    >,
    lightColor: 0xffa860,
    maxLights: 9,
  },
  wick: {
    glass: 0x5a6878,
    glassLit: 0xc8def4,
    frost: 0xb8c8d8,
    flame: 0xf2f8ff,
    halo: 0xa8c8f4,
    stand: 0x141a20,
    standLit: 0x4a5a6a,
    silk: 0x9aa8b8,
    light: 420,
    lightColor: 0xb4ccf0,
    /** Frames of the gutter (the sim's `moonwick.gutter`, proto-1 §3: the last 2 s flicker). */
    gutterFrames: 120,
  },
  aim: { ring: 0xffe2b0, dot: 0xfff0d0, glow: 0xffc070 },
} as const;

/** A small hash in [0, 1) of a string and an index (no Math.random: shots must repeat). */
export function hash01(s: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
