import { z } from 'zod';
import ambienceJson from '../../content/audio/ambience.json';
import humsJson from '../../content/audio/hums.json';
import mixJson from '../../content/audio/mix.json';
import musicJson from '../../content/audio/music.json';
import sfxJson from '../../content/audio/sfx.json';
import { NOISE_COLOURS } from './noise';
import { ZZFX_DEFAULTS, type ZzfxParams } from './zzfx';

/** Zod schemas for content/audio/*.json. Everything audio-tunable lives in those files. */

export const BUSES = ['music', 'sfx', 'ambience', 'ui'] as const;
export type BusName = (typeof BUSES)[number];

const num = z.number().finite();
const pos = num.positive();
const nonneg = num.nonnegative();
const colour = z.enum(NOISE_COLOURS);
const filterType = z.enum(['lowpass', 'highpass', 'bandpass']);

const zzfxKeys = Object.keys(ZZFX_DEFAULTS) as (keyof ZzfxParams)[];
const ZzfxLayerSchema = z
  .object(
    Object.fromEntries(zzfxKeys.map((k) => [k, num.optional()])) as Record<
      keyof ZzfxParams,
      z.ZodOptional<typeof num>
    >,
  )
  .strict();

export const DuckNameSchema = z.enum(['light', 'heavy']);
export type DuckName = z.infer<typeof DuckNameSchema>;

export const SoundDefSchema = z
  .object({
    bus: z.enum(BUSES).default('sfx'),
    layers: z.array(ZzfxLayerSchema).min(1),
    /** ± semitones of random pitch per play. */
    pitchVar: nonneg.max(12).default(0.5),
    /** ± dB of random volume per play. */
    volVarDb: nonneg.max(12).default(1.5),
    /** Minimum seconds between two plays of this sound. */
    cooldown: nonneg.default(0.025),
    maxVoices: z.int().positive().default(4),
    duck: DuckNameSchema.optional(),
    /** Send level (0..1) into the room reverb: the tail of big hits. */
    reverb: nonneg.max(1).default(0),
  })
  .strict();
export type SoundDef = z.infer<typeof SoundDefSchema>;

const FilterSchema = z.object({ type: filterType, freq: pos, q: pos }).strict();

export const LoopDefSchema = z
  .object({ bus: z.enum(BUSES).default('sfx'), colour, filter: FilterSchema, gain: nonneg })
  .strict();
export type LoopDef = z.infer<typeof LoopDefSchema>;

export const SfxFileSchema = z
  .object({
    '//': z.string().optional(),
    sounds: z.record(z.string(), SoundDefSchema),
    loops: z.record(z.string(), LoopDefSchema),
    events: z
      .object({
        simple: z.record(z.string(), z.string()),
        /** `hit` by the sim's hit class (combat-spec §2: light/medium/heavy/counter distinct). */
        hit: z.object({ default: z.string(), byClass: z.record(z.string(), z.string()) }).strict(),
        /** `whiff` by move (a Seize whiff is a hand closing on air). */
        whiff: z.object({ default: z.string(), byMove: z.record(z.string(), z.string()) }).strict(),
        /** Enemy `telegraph` by the attack's `cue.audio` name (content/enemies/*.json). */
        telegraph: z.object({ default: z.string(), byCue: z.record(z.string(), z.string()) }).strict(),
        /** The Auctioneer's `lotMarked` gavel knock by Cadence beat. */
        lotMarked: z.object({ default: z.string(), byBeat: z.record(z.string(), z.string()) }).strict(),
        jump: z.object({ default: z.string(), byKind: z.record(z.string(), z.string()) }).strict(),
        land: z
          .object({
            soft: z.string(),
            hard: z.string(),
            /** Impact vy (px/f) that plays at full volume (the sim decides soft vs hard). */
            refVyPxPerFrame: pos,
            minVolume: nonneg.max(1),
          })
          .strict(),
        wallSlide: z.object({ loop: z.string(), refSpeedPxPerFrame: pos, minGain: nonneg.max(1) }).strict(),
        /** seizeTake: the rip out of the owner, then the pop in the sack `popDelay` s later. */
        seizeRip: z.object({ rip: z.string(), pop: z.string(), popDelay: nonneg }).strict().optional(),
        /** poundage: `ticks` coin ticks `gap` s apart rising `stepSemis`, after `delay` s, then the till. */
        coinShower: z
          .object({
            tick: z.string(),
            till: z.string(),
            ticks: z.int().positive(),
            gap: nonneg,
            delay: nonneg,
            stepSemis: num,
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((f, ctx) => {
    const e = f.events;
    const soundRefs = [
      ...Object.values(f.events.simple),
      e.hit.default,
      ...Object.values(e.hit.byClass),
      e.whiff.default,
      ...Object.values(e.whiff.byMove),
      e.telegraph.default,
      ...Object.values(e.telegraph.byCue),
      e.lotMarked.default,
      ...Object.values(e.lotMarked.byBeat),
      f.events.jump.default,
      ...Object.values(f.events.jump.byKind),
      f.events.land.soft,
      f.events.land.hard,
      ...(e.seizeRip ? [e.seizeRip.rip, e.seizeRip.pop] : []),
      ...(e.coinShower ? [e.coinShower.tick, e.coinShower.till] : []),
    ];
    for (const s of soundRefs) {
      if (!(s in f.sounds))
        ctx.addIssue({ code: 'custom', message: `events reference unknown sound "${s}"` });
    }
    if (!(f.events.wallSlide.loop in f.loops)) {
      ctx.addIssue({ code: 'custom', message: `events reference unknown loop "${f.events.wallSlide.loop}"` });
    }
  });
export type SfxFile = z.infer<typeof SfxFileSchema>;

const DuckSchema = z
  .object({ depthDb: nonneg, attackSecs: nonneg, holdSecs: nonneg, releaseSecs: pos })
  .strict();
export type DuckParams = z.infer<typeof DuckSchema>;

export const MixFileSchema = z
  .object({
    '//': z.string().optional(),
    buses: z.object({ master: nonneg, music: nonneg, sfx: nonneg, ambience: nonneg, ui: nonneg }).strict(),
    duck: z.object({ light: DuckSchema, heavy: DuckSchema }).strict(),
    muffle: z.object({ none: pos, pause: pos, underwater: pos, tauSecs: pos }).strict(),
    spatial: z
      .object({
        panWidthPx: pos,
        panMax: nonneg.max(1),
        refDistPx: pos,
        rolloff: nonneg,
        fadeStartPx: pos,
        maxDistPx: pos,
      })
      .strict()
      .refine((s) => s.maxDistPx > s.fadeStartPx, 'maxDistPx must exceed fadeStartPx'),
    reverb: z.object({ seconds: pos, decay: pos, returnGain: nonneg }).strict(),
    limiter: z
      .object({
        thresholdDb: num.max(0),
        kneeDb: nonneg,
        ratio: num.min(1),
        attackSecs: nonneg,
        releaseSecs: nonneg,
      })
      .strict(),
    maxVoices: z.int().positive(),
    noiseSeconds: pos,
    lookaheadSecs: pos,
  })
  .strict();
export type MixFile = z.infer<typeof MixFileSchema>;
export type MuffleKind = 'none' | 'pause' | 'underwater';

const HumColourSchema = z
  .object({
    noiseGain: nonneg,
    filter: FilterSchema,
    tone: z
      .object({
        wave: z.enum(['sine', 'triangle', 'sawtooth', 'square']),
        freq: pos,
        gain: nonneg,
        vibratoHz: nonneg,
        vibratoCents: nonneg,
      })
      .strict(),
    wobble: z.object({ hz: nonneg, depth: nonneg.max(1) }).strict(),
    whoosh: z.object({ fromHz: pos, toHz: pos }).strict(),
    land: z.string(),
    seizable: z.boolean(),
  })
  .strict();
export type HumColourDef = z.infer<typeof HumColourSchema>;

export const HumsFileSchema = z
  .object({
    '//': z.string().optional(),
    colours: z.object(
      Object.fromEntries(NOISE_COLOURS.map((c) => [c, HumColourSchema])) as Record<
        (typeof NOISE_COLOURS)[number],
        typeof HumColourSchema
      >,
    ),
    baseGain: nonneg,
    fadeInSecs: nonneg,
    seize: z
      .object({
        sound: z.string(),
        refuseSound: z.string(),
        dropRatio: pos.max(1),
        dropSecs: pos,
        gateAtSecs: nonneg,
        gateSecs: pos,
        reverbSend: nonneg,
        carryGainDb: num,
        carryLowpassHz: pos,
        carryFadeSecs: pos,
      })
      .strict(),
    levy: z.object({ flightSecs: pos, whooshGain: nonneg, rehum: z.boolean(), rehumFadeSecs: pos }).strict(),
  })
  .strict();
export type HumsFile = z.infer<typeof HumsFileSchema>;

const BedSchema = z
  .object({
    gain: nonneg,
    rumble: z
      .object({ colour, gain: nonneg, lowpassHz: pos, lfoHz: nonneg, lfoDepth: nonneg.max(1) })
      .strict(),
    murmur: z
      .object({
        colour,
        gain: nonneg,
        formantsHz: z.array(pos).min(1),
        q: pos,
        lfoHz: nonneg,
        lfoDepth: nonneg.max(1),
      })
      .strict(),
    hiss: z.object({ colour, gain: nonneg, highpassHz: pos }).strict(),
    clank: z
      .object({
        sound: z.string(),
        everySecs: pos,
        jitterSecs: nonneg,
        gain: nonneg,
        panSpread: nonneg.max(1),
        lowpassHz: pos,
      })
      .strict()
      .refine((c) => c.jitterSecs < c.everySecs, 'clank jitterSecs must be < everySecs'),
  })
  .strict();
export type BedDef = z.infer<typeof BedSchema>;

export const AmbienceFileSchema = z
  .object({
    '//': z.string().optional(),
    fadeSecs: pos,
    default: BedSchema,
    rooms: z.record(z.string(), BedSchema),
  })
  .strict();
export type AmbienceFile = z.infer<typeof AmbienceFileSchema>;

const InstrumentSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('tone'),
      wave: z.enum(['sine', 'triangle', 'sawtooth', 'square']),
      octave: z.int().min(-4).max(4),
      attackSecs: nonneg,
      releaseSecs: pos,
      lowpassHz: pos,
      detuneCents: nonneg.default(0),
      gain: nonneg,
    })
    .strict(),
  z
    .object({ kind: z.literal('noise'), attackSecs: nonneg, releaseSecs: pos, highpassHz: pos, gain: nonneg })
    .strict(),
  z.object({ kind: z.literal('kick'), startHz: pos, endHz: pos, releaseSecs: pos, gain: nonneg }).strict(),
]);
export type InstrumentDef = z.infer<typeof InstrumentSchema>;

/** One sequencer step: null = rest, otherwise semitone offsets (drums use [0]). */
export type PatternStep = number[] | null;

const TOKEN = /^(\.|x|-?\d+(\+-?\d+)*)$/;

/** Parses a pattern string ('.', 'x', '0', '0+3+7', '-2'...) into steps. Throws on bad tokens. */
export function parsePattern(src: string): PatternStep[] {
  const tokens = src.trim().split(/\s+/);
  return tokens.map((t) => {
    if (!TOKEN.test(t)) throw new Error(`bad pattern token "${t}"`);
    if (t === '.') return null;
    if (t === 'x') return [0];
    return t.split('+').map(Number);
  });
}

const TrackSchema = z
  .object({ instrument: z.string(), pattern: z.string() })
  .strict()
  .transform((t, ctx) => {
    try {
      return { instrument: t.instrument, steps: parsePattern(t.pattern) };
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: String(e) });
      return z.NEVER;
    }
  });

export const LAYERS = ['sparse', 'full'] as const;
export type LayerName = (typeof LAYERS)[number];

export const MusicFileSchema = z
  .object({
    '//': z.string().optional(),
    bpm: pos.max(400),
    beatsPerBar: z.int().positive(),
    stepsPerBeat: z.int().positive(),
    rootMidi: z.int().min(0).max(127),
    crossfadeBeats: nonneg,
    minLeadSecs: nonneg,
    autoStart: z.boolean(),
    startLayer: z.enum(LAYERS),
    instruments: z.record(z.string(), InstrumentSchema),
    layers: z.object({ sparse: z.array(TrackSchema), full: z.array(TrackSchema) }).strict(),
  })
  .strict()
  .superRefine((m, ctx) => {
    const bar = m.beatsPerBar * m.stepsPerBeat;
    for (const name of LAYERS) {
      for (const t of m.layers[name]) {
        if (!(t.instrument in m.instruments)) {
          ctx.addIssue({ code: 'custom', message: `${name}: unknown instrument "${t.instrument}"` });
        }
        if (t.steps.length % bar !== 0) {
          ctx.addIssue({
            code: 'custom',
            message: `${name}/${t.instrument}: pattern has ${t.steps.length} steps, not a multiple of ${bar}`,
          });
        }
      }
    }
  });
export type MusicFile = z.infer<typeof MusicFileSchema>;

export interface AudioData {
  sfx: SfxFile;
  mix: MixFile;
  hums: HumsFile;
  ambience: AmbienceFile;
  music: MusicFile;
}

/** Parses and cross-checks all audio content. Throws a readable error on bad data. */
export function parseAudioData(raw: {
  sfx: unknown;
  mix: unknown;
  hums: unknown;
  ambience: unknown;
  music: unknown;
}): AudioData {
  const sfx = SfxFileSchema.parse(raw.sfx);
  const hums = HumsFileSchema.parse(raw.hums);
  const ambience = AmbienceFileSchema.parse(raw.ambience);
  const refs = [
    hums.seize.sound,
    hums.seize.refuseSound,
    ...Object.values(hums.colours).map((c) => c.land),
    ambience.default.clank.sound,
    ...Object.values(ambience.rooms).map((r) => r.clank.sound),
  ];
  for (const s of refs) if (!(s in sfx.sounds)) throw new Error(`audio data references unknown sound "${s}"`);
  return { sfx, mix: MixFileSchema.parse(raw.mix), hums, ambience, music: MusicFileSchema.parse(raw.music) };
}

let cached: AudioData | undefined;

/** The validated content/audio data (parsed once). */
export function audioData(): AudioData {
  cached ??= parseAudioData({
    sfx: sfxJson,
    mix: mixJson,
    hums: humsJson,
    ambience: ambienceJson,
    music: musicJson,
  });
  return cached;
}

/** Bed params for a room (falls back to `default`). */
/** The bed for a room: exact id, else its family (`gym-05` -> `gym`), else `default`. */
export function bedFor(data: AmbienceFile, roomId: string): BedDef {
  return data.rooms[roomId] ?? data.rooms[roomId.replace(/-.*$/, '')] ?? data.default;
}
