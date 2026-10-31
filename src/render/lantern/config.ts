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
    /** Its point light's strength: the floor and walls in its reach turn silver. */
    lightK: 1.5,
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

/**
 * Rooms whose lamps are their picture (render only, by room id): the housing's size, the light's reach and the moths
 * round it, against the kind's. The Grove is the first area's peak (canopy review r2 #7): its three wicks are big and
 * warm, their swarms visible from the entry.
 */
export const ROOM_LAMPS: Record<string, { size: number; light: number; moths: number }> = {
  'cn-grove': { size: 1.9, light: 1.9, moths: 2.2 },
};

/**
 * Trap lamps (the Canopy r10, review r9 #2: `Lure.trap`, cut out for good, their moths freed and counted) against the
 * firefly's springboards (relight, no moths): told apart at a glance.
 */
export const TRAP = {
  /** Its moth cloud against a plain lamp's (ROOM_LAMPS x this), and a springboard's few stragglers. */
  cloud: 2.4,
  springCloud: 0.3,
  /** The cage: bars round it, its half-width and half-height in lamp sizes, colours. */
  bars: 9,
  cageW: 1.25,
  cageH: 1.45,
  /** Ripped down onto the floor (the Keeper's P3): turned onto its flank this far (rad). */
  flank: 1.35,
  bar: 0xffc878,
  glow: 0xffa850,
  /** Dead moths on the ground under it, and their pale-brown wings. */
  fallen: 8,
  dead: 0xa89880,
  /** A snuff: moths drawn bursting out, seconds each flies with her (a range) before it streams to the moon. */
  freedDrawn: 36,
  follow: [2.2, 4.6] as readonly [number, number],
  freedGlow: 0xcfe0ff,
  /**
   * A cage drawn larger in a room (the Canopy r16: the hub's first cage hangs at her head, the verb's first instance,
   * and reads as a thing to reach for, not a lamp in the scenery).
   */
  roomSize: { 'cn-hub': 1.35 } as Record<string, number>,
  /** A knocked cage's swing (px each way: a cut, the Lamp by it), its rate (rad/s) and how fast it settles (1/s). */
  joltCut: 22,
  joltRefuse: 14,
  joltRate: 11,
  joltDamp: 2.6,
};
