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

/**
 * The lamps' hums (Hz): the forest is in just intonation; the firefly's false lights sit 38 cents sharp of
 * its notes (a wick over A4, a lantern over D4, a great lamp over D3), each beating against itself
 * (`LAMP_BEAT` Hz between its two tones). Steady, exact, a little wrong: regular is the enemy.
 */
const SHARP = 2 ** (38 / 1200);
export const LAMP_HZ = {
  wick: PITCH.A4 * SHARP,
  lantern: PITCH.D4 * SHARP,
  great: PITCH.D3 * SHARP,
} as const;
export const LAMP_BEAT = { wick: 1.3, lantern: 0.9, great: 0.6 } as const;

/**
 * Each room's night-wood bed (memory/audio.md): dB offsets for the canopy roar and the leaf hiss, the hiss
 * band's centre (Hz), how often drips fall (x the mean rate; 0 none), whether the far owl calls there,
 * and `zones` (the test grove's blue / amber / violet stands). Up in the branches it is airy; on the
 * floor quieter; in the hollows and roots the wind is far above and the drips near.
 */
export interface RoomBed {
  wind: number;
  leaves: number;
  hissHz: number;
  drips: number;
  voice: boolean;
  zones?: boolean;
  /** The Canopy (2026-10-31): far insects (calls a second, 0 none), the earth's rumble (dB offset; absent = none),
   * and an echo after each drip (0..1: the well's cold shaft). */
  insects?: number;
  earth?: number;
  echo?: number;
}
export const BEDS: Record<string, RoomBed> = {
  default: { wind: -4, leaves: -3, hissHz: 3000, drips: 0.6, voice: false },
  'test-grove': { wind: 0, leaves: 0, hissHz: 3000, drips: 1, voice: true, zones: true },
  'wood-hatch': { wind: 0, leaves: 2, hissHz: 3400, drips: 0.6, voice: true },
  'wood-chase': { wind: 1, leaves: 1, hissHz: 3100, drips: 0.5, voice: false },
  'wood-wicks': { wind: -3, leaves: -2, hissHz: 2800, drips: 1, voice: true },
  'wood-burrow': { wind: -7, leaves: -6, hissHz: 2400, drips: 1.3, voice: false },
  'wood-glade': { wind: -4, leaves: -1, hissHz: 3600, drips: 0.5, voice: true },
  'wood-glidewalk': { wind: 2, leaves: 0, hissHz: 3200, drips: 0.4, voice: true },
  'wood-hollow': { wind: -8, leaves: -8, hissHz: 2200, drips: 1.6, voice: false },
  'wood-hawkers': { wind: -2, leaves: 0, hissHz: 3000, drips: 0.8, voice: true },
  'wood-silk': { wind: -5, leaves: -4, hissHz: 2600, drips: 0.9, voice: false },
  'wood-well': { wind: -9, leaves: -9, hissHz: 2000, drips: 2, voice: false },
  'wood-rootshaft': { wind: -10, leaves: -10, hissHz: 2000, drips: 1.8, voice: false },
  'wood-rootroad': { wind: -11, leaves: -12, hissHz: 1800, drips: 1.5, voice: false },
  'wood-canopy': { wind: 3, leaves: 3, hissHz: 3800, drips: 0.3, voice: true },
  // Lanternroot: the crown under the open moon (airy, the far voice); inside the trunk the wind is a hush far off
  // and the lamps' hum carries; the drowned roots are still air and water dripping; the cache, close and dry.
  'lr-night': { wind: 2, leaves: 1, hissHz: 3500, drips: 0.3, voice: true },
  'lr-hall': { wind: -12, leaves: -14, hissHz: 2200, drips: 0.5, voice: false },
  'lr-roots': { wind: -18, leaves: -20, hissHz: 1800, drips: 2.4, voice: false },
  'lr-cache': { wind: -16, leaves: -18, hissHz: 2000, drips: 0.2, voice: false },
  // The Canopy (canopy-moments.md §5: airy in the hatch, crown and gap; hushed in the well and the den; no owl
  // underground). Up in the night canopy: wind, leaves, far insects. Inside the giant and the roots: the wind far
  // above, drips near, a few ground insects. The well: cold drips with an echo. The den: the earth's own rumble.
  'cn-hatch': { wind: 1, leaves: 3, hissHz: 3600, drips: 0.4, voice: true, insects: 0.35 },
  'cn-hub': { wind: -1, leaves: 1, hissHz: 3200, drips: 0.6, voice: true, insects: 0.5 },
  'cn-trunk': { wind: -10, leaves: -11, hissHz: 2200, drips: 1.4, voice: false, insects: 0.1 },
  'cn-well': { wind: -12, leaves: -13, hissHz: 2000, drips: 2.6, voice: false, echo: 1 },
  'cn-limbs': { wind: 2, leaves: 2, hissHz: 3500, drips: 0.4, voice: true, insects: 0.3 },
  'cn-rot': { wind: -9, leaves: -10, hissHz: 2300, drips: 1.2, voice: false, insects: 0.12 },
  'cn-crawl': { wind: -11, leaves: -12, hissHz: 2100, drips: 1.3, voice: false, insects: 0.08 },
  'cn-webs': { wind: -14, leaves: -16, hissHz: 2000, drips: 0.5, voice: false },
  'cn-elder': { wind: -10, leaves: -11, hissHz: 2200, drips: 1.8, voice: false, echo: 0.5 },
  'cn-fork': { wind: 0, leaves: 1, hissHz: 3300, drips: 0.5, voice: true, insects: 0.4 },
  'cn-cellar': { wind: -13, leaves: -14, hissHz: 2000, drips: 1.5, voice: false, earth: -10 },
  'cn-galleries': {
    wind: -12,
    leaves: -13,
    hissHz: 2100,
    drips: 1.1,
    voice: false,
    insects: 0.1,
    earth: -12,
  },
  'cn-larder': { wind: -13, leaves: -14, hissHz: 2000, drips: 1, voice: false, earth: -9 },
  'cn-grove': { wind: -2, leaves: 0, hissHz: 3000, drips: 0.8, voice: true, insects: 0.6 },
  'cn-spire': { wind: 1, leaves: 1, hissHz: 3400, drips: 0.4, voice: true, insects: 0.25 },
  'cn-nook': { wind: -12, leaves: -13, hissHz: 2100, drips: 1, voice: false, insects: 0.15 },
  'cn-hollowroot': { wind: -13, leaves: -14, hissHz: 1900, drips: 1.7, voice: false, echo: 0.4, earth: -12 },
  'cn-bower': { wind: 1, leaves: 2, hissHz: 3500, drips: 0.3, voice: true, insects: 0.4 },
  'cn-crown': { wind: 3, leaves: 3, hissHz: 3800, drips: 0.2, voice: true, insects: 0.2 },
  'cn-attic': { wind: 0, leaves: 1, hissHz: 3400, drips: 0.5, voice: false, insects: 0.2 },
  'cn-gap': { wind: 3, leaves: 2, hissHz: 3700, drips: 0.3, voice: true, insects: 0.25 },
  'cn-sky': { wind: 4, leaves: 2, hissHz: 3900, drips: 0.2, voice: true },
  'cn-tunnel': { wind: -12, leaves: -13, hissHz: 2100, drips: 1.2, voice: false, insects: 0.08, earth: -11 },
  'cn-burrow': { wind: -14, leaves: -15, hissHz: 2000, drips: 1, voice: false, earth: -8 },
  'cn-den': { wind: -16, leaves: -18, hissHz: 1900, drips: 0.9, voice: false, earth: -5, echo: 0.5 },
  'cn-out': { wind: 3, leaves: 2, hissHz: 3700, drips: 0.3, voice: true, insects: 0.3 },
  'cn-ledge': { wind: -9, leaves: -9, hissHz: 2400, drips: 1, voice: false, insects: 0.15 },
};
export const bedOf = (room: string): RoomBed => BEDS[room] ?? (BEDS.default as RoomBed);

export const AUDIO = {
  /**
   * Master gain (dB) into the glue compressor and limiter (graph.ts). Round 13: a whole playthrough at -16 LUFS
   * integrated (it was -24.4 at 8.5 with no glue: too quiet on a phone), true peaks under -1 dBTP.
   */
  master: 20,
  /** Bus volumes (dB): Tweakpane and `__game.audio.volume(bus, v)`. */
  bus: { world: 0, hero: 0, combat: 0, lantern: 0, creatures: 0, score: 0 },
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
    roarDb: [-51, -43] as [number, number],
    /** Leaf hiss: band centre by zone [blue, amber, violet], level at rest / full sway (dB). */
    hissHz: [3600, 2400, 3000] as [number, number, number],
    hissQ: 0.55,
    hissDb: [-58, -47] as [number, number],
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
    /** The far voice: seconds between calls (min, max), level (dB). */
    voiceGapS: [21, 46] as [number, number],
    voiceDb: -33,
    /** The pool laps: level (dB) at it, falling off over this distance (px). */
    poolDb: -44,
    poolPx: 900,
    /** Root steam under the light well (amber) and the glassy air of the violet stand (dB). */
    steamDb: -56,
    glassDb: -58,
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
    /** A step: on wood a tick, on earth and moss a soft pad. */
    tickDb: -42,
    padDb: -40,
    /** The wings opening (every glide; the catch adds weight out of a fall) and folding (let go in the air). */
    openDb: -29,
    foldDb: -34,
    /** The push off a wall (with its wingbeat). */
    kickDb: -27,
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
    lampTrim: -6,
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
    /** Calm: breaths every `calmS[0]` s at first slowing to `calmS[1]` (9 s), fading out with the gift. */
    calmDb: -32,
    calmS: [2.4, 9] as [number, number],
    /** A lampwing's glass letting go as it takes the glint. */
    glassDb: -31,
    /** A lantern / lamp taking a glint toward its price; the heart's deeper one. */
    bowlDb: -32,
    heartDb: -26,
    /** Becoming aware of her: a burrback's in-breath, a lampwing's hum swelling. */
    sniffDb: -33,
    humDb: -33,
    /** Rest paid in glints: one small falling note per glint, this far apart (s). */
    noteDb: -31,
    noteGapS: 0.13,
    /** Round 3: asleep, a breath about every `sleepS` s, heard within `sleepPx` of her; noticing: her chord
     * catching (at seen level 1, +2 dB a level); losing her: a long settling out-breath. */
    sleepDb: -37,
    sleepS: 3.6,
    sleepPx: 420,
    catchDb: -36,
    loseDb: -34,
    /** The chord of what she carries (RMS dB) at seen level 1 and at 4; gone at 0. */
    chordDb: [-50, -41] as [number, number],
  },
  /**
   * The thorn blade and what it meets (bus `combat`): peaks (dB). Combat is the loud family, so the
   * blows read through everything; the swish is her own and quieter than what it hits.
   */
  combat: {
    /** The swish per combo step (finisher fuller), and the cents an up / down cut shifts it. */
    slashDb: [-25, -25, -22] as [number, number, number],
    dirCents: { up: 150, down: -200 },
    /** A blow on a creature: the crack (meat), the tick (pitch) by combo step, and the weights. */
    crackDb: -20,
    tickDb: -24,
    tickCents: [0, 204, -498] as [number, number, number],
    weightDb: { light: -3, medium: 0, heavy: 3 },
    weightCents: { light: 150, medium: 0, heavy: -300 },
    /** A kill: the crunch, its tail (a beat later). A big creature's crack of shell. */
    crunchDb: -18,
    tailDb: -28,
    tailS: 0.06,
    crackShellDb: -20,
    /** The blade glancing off a braced shell or a seed-case. */
    clangDb: -21,
    /** A side cut off a braced shell rings this much louder than a clang (the Canopy r19: a shield struck). */
    shieldDb: 4,
    /** Her hurt (the mix low-passes for the stagger: `muffleHz`). */
    hurtDb: -18,
    muffleHz: 650,
    /** A pogo bounce, a cut into wood, a bounce cap, silk parting. */
    pogoDb: -24,
    thockDb: -22,
    bounceDb: -22,
    silkDb: -27,
    /** A cut on a flame that does not put it out: the tick a fifth up, softer. */
    flameCents: 702,
    flameDb: -25,
  },
  /**
   * The lamps (bus `lantern`, memory/lures.md): the hum near a burning flame (RMS dB at the core, heard out
   * to `litScale` x its pull radius), the swarm's flutter on it, the held fling's swell, the launch, the
   * snuff, the freed moths (one chime per moth up to `chimes`, `chimeGapS` apart, rising up the chord).
   */
  lamp: {
    humDb: -40,
    reachScale: 1.6,
    /** The hum's low-pass far off .. at the core (Hz): it opens as she nears. */
    humLp: [380, 2600] as [number, number],
    flutterDb: -48,
    /** The fling's held moment: the swell (RMS dB) and how much it ducks the world (0..1). */
    aimDb: -36,
    slowDb: -26,
    launchDb: -20,
    snuffDb: -20,
    rushDb: -27,
    chimeDb: -27,
    chimes: 6,
    chimeGapS: 0.11,
    /** Beating free (the old catch): her wing on each press. */
    beatDb: -26,
    /**
     * A trap's release (the Canopy r11, route-play.ts `release`): the cage's bars breaking (peak), the swell under the
     * stream, one chime per count tick (at most `chimes`, the great cage `chimesGreat`, each 0.35 dB under the last),
     * the wings' rush this much over a lamp's.
     */
    release: { breakDb: -19, swellDb: -31, chimeDb: -26, chimes: 16, chimesGreat: 28, rushUp: 3 },
  },
  /**
   * Lanternroot (route-lr.ts, bake-lr.ts): her light (bus `hero`), the moonwicks and moss (`lantern`), the gust
   * (`hero`), the cap and the signs (`world`). Peaks (dB). `glowCents`: the glow chime climbs the forest's chord
   * by how full she is; `bellCents` per ring of the cap; `signPx`: a sign is heard flashing within this many px.
   */
  lr: {
    glowDb: -30,
    glowBellDb: -24,
    glowCents: [0, 204, 498, 702, 906, 1200, 1404, 1698] as readonly number[],
    kindleDb: -20,
    refuseDb: -32,
    gutterDb: -34,
    coldDb: -30,
    fanDb: -28,
    mossDb: -30,
    gustDb: -22,
    gustHitDb: -30,
    bellDb: -22,
    bellDullDb: -26,
    bellAnswerDb: -18,
    bellCents: [0, 204, 498, 702, 906, 1200] as readonly number[],
    signDb: -34,
    signPx: 640,
    mendDb: -28,
    mendLandDb: -22,
  },
  /**
   * The Gloamweaver (bus `creatures`): its tells, moves and the fight's heartbeat. The fight is the loudest stretch
   * of Lanternroot: these sit above the creatures' levels. Heartbeat every n frames per phase.
   */
  gloam: {
    hissDb: -15,
    rearDb: -16,
    slamDb: -12,
    rumbleDb: -17,
    diveDb: -15,
    silkDb: -19,
    pulseDb: -15,
    pulseRise: 1.5,
    pulseEvery: [54, 46, 38] as readonly number[],
  },
  /** Creatures' tells and moves (bus `creatures`): peaks (dB). */
  creatures: {
    creakDb: -24,
    rumbleDb: -26,
    buzzDb: -26,
    diveDb: -24,
    silkDb: -28,
    dropDb: -25,
    rearDb: -20,
    slamDb: -18,
    wallDb: -22,
    skitterDb: -42,
    /** Ants are heard within this many px of her; a skitter about this often per second while near. */
    skitterPx: 520,
    skitterRate: 2.2,
  },
  /**
   * The score (score.ts, its own bus and hall; memory/audio.md "The score"): note peaks by instrument (dB before the
   * master), its own voice pool, beats in sim frames (the boss's bar is the Keeper's swing, ~4 s), the hall send.
   */
  score: {
    db: {
      felt: -26,
      harp: -24,
      strings: -29,
      trem: -31,
      marc: -28,
      celesta: -31,
      glass: -32,
      drum: -26,
      colLegno: -33,
    },
    /** Seconds a note takes to die once its `dur` is up (a damper, a bow lifting). */
    release: {
      felt: 0.35,
      harp: 0.6,
      strings: 0.5,
      trem: 0.25,
      marc: 0.3,
      celesta: 0.4,
      glass: 0.6,
      drum: 0.3,
      colLegno: 0.05,
    },
    maxVoices: 32,
    beat: 56,
    bossBeat: 60,
    hall: 0.55,
    /** A glade's piece of the theme at most this often (s). */
    gladeGapS: 45,
    /**
     * After the boss's last hit: the ring held this many frames, then this many of silence (the first `tailFrames`
     * of it the den tailing away into it), then its breath, and the world back over `returnFrames`.
     */
    lastRingFrames: 22,
    silenceFrames: 150,
    tailFrames: 48,
    returnFrames: 50,
    /** The Keeper's P2 in its shadow: the world's low-pass and the score's (Hz); open (20 kHz) when it sees her. */
    darkHz: 950,
    darkScoreHz: 1700,
    /** Its light finding her stabs the score at most once in this many frames. */
    stabGap: 90,
    /** The chase (moment 4): frames per beat; her harp joins when the firefly leads her by less than this (px). */
    chaseBeat: 24,
    chaseClosePx: 520,
    /** The duet (moment 3): frames per beat (3/4), and how far the bed drops under it (dB). */
    duetBeat: 42,
    duetDuckDb: -22,
    duetDb: -5,
    /**
     * Round 14. The column (the great cage let go: the motif carried home) and the escape's drive: frames per beat
     * (150 bpm, a 16th = 0.1 s). The escape's high cluster comes in when the front is nearer than this under her (px).
     */
    columnBeat: 24,
    escapeBeat: 24,
    /** (r15: the front keeps 240 under her and creeps to 200 while she lingers: the scream is for the creep.) */
    escapeNearPx: 222,
    /**
     * Round 15. The escape's climb (the chimney, the front on) changes phrase as the earth rises (`escape.rise`) past
     * these. The quiet moments: the bed (dB) by why, and what a find's music waits for (the sit, the column).
     */
    climbRise: [0.3, 0.62] as [number, number],
    quietBedDb: { column: -8, sit: -12, vista: -6 } as Record<string, number>,
  },
  /** The Canopy's world (route-canopy.ts): levels (dB peaks; layers RMS). */
  canopy: {
    insectDb: -44,
    trickleDb: -38,
    trickleRate: 0.12,
    echoDb: -10,
    echoS: 0.42,
    earthDb: -44,
    /** The firefly: its call (three short, one long), blinks while it flies, a kindle, a hang's clinks. */
    callDb: -30,
    blinkDb: -36,
    blinkEvery: 48,
    kindleDb: -28,
    clinkDb: -32,
    gateDb: -22,
    groanDb: -26,
    /** A lampwing's hum and a hawker's wings, heard within these px (RMS dB at the creature). */
    lampwingDb: -42,
    hawkerDb: -40,
    flyerPx: 700,
    /** A burrback hunting her huffs every ~`huffS` s (it has a mouth). */
    huffDb: -34,
    huffS: 1.8,
    /** The hatch: the swarm passing overhead (RMS dB) before the breakout, at it, and its tail (s). */
    riverDb: [-46, -35] as [number, number],
    riverTailS: 8,
    /** The valley's false lights far below, heard from the promise lip (RMS dB, from this x in cn-hatch). */
    valleyDb: -50,
    valleyFromX: 2900,
    /** Freed moths roosting: a soft flutter now and then within this many px. */
    roostDb: -40,
    roostPx: 700,
    /** The trap being set (moment 5): each moth caught a flutter and a tick (peaks at the start; +4 / +5 dB by the
     * end), and the far stream's wings while it fills (RMS dB). */
    fillWingDb: -40,
    fillTickDb: -36,
    streamDb: -48,
    /** The kin's wings opening as it sits by her (moment 3). */
    kinWingDb: -30,
    /**
     * Round 14. The Keeper: its roar on P1's rage beat, its sweep's tell (claws raked, a hiss). The escape: a root
     * snapping over a rock's tell, the grit trickling to its drop, its fall and landing, a checkpoint's chime, her wings
     * caught back (a chase's or the escape's return), the collapse front (RMS dB at its nearest; near within
     * `collapseNearPx` of her feet, gone quiet `collapseFarPx` further).
     */
    roarDb: -14,
    sweepTellDb: -16,
    rootSnapDb: -20,
    rockTrickleDb: -27,
    rockFallDb: -24,
    rockLandDb: -17,
    checkpointDb: -27,
    /** r20: her shade taken back (every glint she left where she faded): a rising four-note scale, then a breath. */
    shadeDb: -25,
    /** ...and lost (a second fade before she took it back): one low note, falling. */
    shadeLostDb: -30,
    backWingDb: -30,
    collapseDb: -27,
    collapseNearPx: 170,
    collapseFarPx: 330,
    /**
     * Round 15. The escape before the front: the roof coming down behind her (the collapse voice far and dull, RMS
     * dB). The slam's wave: the crack opening at its feet, each stretch of a front running (peaks; every `waveEvery`
     * frames per front, dropping `waveFallDb` over `waveFadePx` run). The chase: the air thickening at a hook, the
     * pull onto its flame. The sit: the torn wing's try. Quiet moments: the release's count chimes under the column.
     */
    behindDb: -36,
    fissureDb: -15,
    waveDb: -21,
    waveEvery: 3,
    waveFallDb: 9,
    waveFadePx: 1400,
    catchAirDb: -34,
    hookPullDb: -21,
    kinTryDb: -29,
    quietChimeDb: -6,
  },
  /** Held moments (the fling's aim, a story hold, a fade): the world bed ducks by up to this (dB). */
  duckDb: -10,
  /** World sounds fall off with distance from the camera: half level at this many px. */
  halfPx: 900,
};

export type AudioTuning = typeof AUDIO;
export type BusId = keyof typeof AUDIO.bus;
