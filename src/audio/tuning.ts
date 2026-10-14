/**
 * Every level, period and pitch of the sound (docs/audio-direction.md). Levels are dB before the
 * master gain: a one-shot's level is its peak (they are baked to peak 0.9), a continuous layer's is
 * its RMS (voices/util.ts `band` trims each noise bed to unit RMS). Mutable like the sim tuning:
 * Tweakpane edits it live.
 */

/** Home is D, modal; the forest in just intonation (stacked fifths D A E B). */
export const D2 = 73.42;
export const D3 = 146.83;
export const PITCH = {
  D2,
  D3,
  A3: D3 * 1.5,
  E4: D3 * 2.25,
  B4: D3 * 3.375,
  D4: D3 * 2,
  A4: D3 * 3,
  E5: D3 * 4.5,
  B5: D3 * 6.75,
} as const;

/** The Hush's one clock (clock.ts). */
export const HUSH = {
  /** Seconds per beat of the two low tones: one swell, one knock. */
  pulseS: 4.2,
  /** Seconds of one whole breath (in + out). */
  breathS: 18,
  /** Its tone (D2) and how far the second tone sits above (Hz): their beat is the pulse. */
  toneHz: D2,
  /** oo -> aa formants (F1, F2 Hz). */
  oo: [300, 870] as [number, number],
  aa: [700, 1090] as [number, number],
} as const;

export const AUDIO = {
  /** Master gain (dB). The whole mix sits near -20 LUFS integrated with this. */
  master: 10,
  /** Bus volumes (dB): Tweakpane and `__game.audio.volume(bus, v)`. */
  bus: { world: 0, hush: 0, hero: 0, lantern: 0, creatures: 0 },
  /** Seconds the scheduler works ahead of the context clock. */
  lookahead: 0.03,
  /** Continuous layers are re-aimed at most this often (s) and glide there with this time constant. */
  layerEvery: 1 / 30,
  layerTau: 0.06,
  /** At most this many one-shots at once (older, lower priority ones are stolen). */
  maxVoices: 16,
  /** Everything but glass rolls off above this (Hz). */
  rolloff: 9000,

  wind: {
    /** Canopy roar (pink noise in a broad band around this) at no gust / full gust (RMS dB). */
    roarHz: 350,
    roarDb: [-46, -37] as [number, number],
    /** Leaf hiss: band centre by zone [blue, amber, violet], level at rest / full sway (dB). */
    hissHz: [3600, 2400, 3000] as [number, number, number],
    hissQ: 0.55,
    hissDb: [-53, -42] as [number, number],
    /** Where it samples the wave for the hiss on each side: camera x -/+ this (world px, zoom 1). */
    spanPx: 620,
    /** Slow seeded drift laid over the wave so no two gusts match (0..1 depth, period s). */
    driftDepth: 0.35,
    driftS: [11, 17, 29] as [number, number, number],
  },
  forest: {
    /** Mean seconds between drips, and the leaf / bark / pool shares. */
    dripMeanS: 2.6,
    dripMix: [0.5, 0.3, 0.2] as [number, number, number],
    dripDb: -30,
    /** Where drips fall: within this many px of the camera centre sideways. */
    dripSpanPx: 1100,
    /** The far voice: seconds between calls (min, max), level (dB), and the shortest gap from a knock (s). */
    voiceGapS: [21, 46] as [number, number],
    voiceDb: -33,
    voiceClearS: 0.9,
    /** The pool laps: level (dB) at it, falling off over this distance (px). */
    poolDb: -44,
    poolPx: 900,
    /** Root steam under the light well (amber) and the glassy air of the violet stand (dB). */
    steamDb: -56,
    glassDb: -58,
  },
  hush: {
    /** Breath and pulse levels in the Grove: under the soil, felt more than heard (dB). */
    breathDb: -44,
    pulseDb: -40,
    knockDb: -38,
    /** The soil's low-pass (Hz), and what a lit lantern near her pushes it to. */
    soilHz: 420,
    safeHz: 150,
    /** A lit lantern muffles it within this many px of her (full at a third of it). */
    safePx: 640,
    /** How strongly the world's ambience breathes with it here (0 clean forest, 1 overrun). */
    worldDepth: 0.25,
  },
  hero: {
    /** Wingbeat (jump) level and the shortest gap between two (s). */
    wingDb: -21,
    wingGapS: 0.08,
    /** Double jump: the second beat after the first (s), the whoosh under them. */
    flutterS: 0.085,
    whooshDb: -27,
    /** Glide catch: fall speeds (px/f) mapped to nothing .. full, and its level. */
    catchVy: [3, 21] as [number, number],
    catchDb: -22,
    /** Airflow while gliding at full speed (dB), released over this (s). */
    airDb: -38,
    airRelease: 0.35,
    dashDb: -24,
    /** Landing puff: impact speeds (px/f) mapped to faint .. full; the hard thump. */
    dustVy: [6, 22] as [number, number],
    dustDb: -29,
    thumpDb: -22,
    /** A step on wood (on moss: silence). */
    tickDb: -44,
    /** Wall slide: claw grains per second at full slide speed, their level. */
    scrapeRate: 9,
    scrapeDb: -34,
    /** How far her sounds pan at the screen edge (0..1). */
    panWidth: 0.5,
  },
  lantern: {
    /** The dormant bowl rings faintly at the pitch of the light she carries. */
    noticeDb: -33,
    /** The rubbed rim during the channel (top level, dB). */
    rubDb: -34,
    kindleDb: -19,
    restDb: -29,
    refuseDb: -31,
    /** A lit lantern's steady presence when she is near (dB at it, px it reaches). */
    humDb: -48,
    humPx: 520,
    /** Lamps: smaller, higher bowls; their level relative to a lantern's (dB). */
    lampTrim: -4,
  },
  /**
   * Giving (milestone 2, memory/giving.md): carrying light is risky (a creature's in-breath, the chord of
   * what she carries), giving is gentle (glass leaving her, a breath answering). Peaks (dB) unless RMS.
   */
  giving: {
    offerDb: -27,
    /** `offerMiss`: the dry flutter of empty hands (nothing in reach: a little softer still). */
    missDb: -37,
    /** A glint flying back to her (`giftReturn`). */
    returnDb: -32,
    /** A burrback's exhale as the glint reaches it; the long settling breath when it cut off a ram. */
    exhaleDb: -29,
    settleDb: -27,
    /** Calm: breaths every `calmS[0]` s at first slowing to `calmS[1]` (the Hush's 9 s), fading out with the gift. */
    calmDb: -32,
    calmS: [2.4, 9] as [number, number],
    /** A lampwing's glass letting go as it takes the glint. */
    glassDb: -31,
    /** A lantern / lamp taking a glint toward its price; the heart's deeper one. */
    bowlDb: -34,
    heartDb: -26,
    /** Becoming aware of her: a burrback's in-breath, a lampwing's hum swelling. */
    sniffDb: -31,
    humDb: -33,
    /** Rest paid in glints: one small falling note per glint, this far apart (s). */
    noteDb: -31,
    noteGapS: 0.13,
    /** The chord of what she carries (RMS dB) at seen level 1 and at 4; gone at 0. */
    chordDb: [-50, -41] as [number, number],
  },
  /** World sounds fall off with distance from the camera: half level at this many px. */
  halfPx: 900,
};

export type AudioTuning = typeof AUDIO;
export type BusId = keyof typeof AUDIO.bus;
