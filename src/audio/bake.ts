/**
 * Every one-shot, noise loop and reverb impulse, rendered to sample arrays in plain JS (dsp.ts) at
 * the context's rate. Plain JS has no 128-frame floor on feedback delays, and baking once means a
 * one-shot costs a buffer source at play time. Each sound has a few seeded variants (4-8 for the
 * frequent ones) so nothing repeats exactly. All peak at 0.9; the levels live in tuning.ts.
 *
 * Rules held here (docs/audio-direction.md §5): her movement is unpitched (air, felt, scale-dust),
 * every tone is inharmonic or detuned with noise in its attack, every envelope starts and ends at
 * zero, nothing but glass goes far above 9 kHz.
 */
import {
  arEnv,
  biquad,
  brown,
  type Mode,
  mixInto,
  modes,
  normalize,
  pink,
  salt,
  seamless,
  shape,
  stream,
  white,
} from './dsp';
import { PITCH } from './tuning';

export const SOUNDS = {
  // Wing: air, felt and scale-dust.
  wing: 6,
  whoosh: 4,
  catch: 4,
  dash: 4,
  dust: 6,
  thump: 4,
  thumpWood: 4,
  splash: 3,
  tick: 4,
  scrape: 8,
  // The forest.
  leaf: 6,
  bark: 5,
  plink: 5,
  voice: 3,
  // The Hush.
  knock: 4,
  // Lanterns (singing bowls) and wayside lamps (smaller, higher, one partial).
  lanternNotice: 2,
  lanternKindle: 1,
  lanternRest: 1,
  lanternRefuse: 2,
  lampNotice: 2,
  lampKindle: 1,
  lampRest: 1,
  lampRefuse: 2,
  // Giving (milestone 2): her offer is glass, a creature's answer is breath (it has a mouth).
  offerTone: 4,
  glintNote: 4,
  flutter: 4,
  giftBowl: 2,
  heartGift: 1,
  exhale: 4,
  settle: 2,
  calmBreath: 4,
  sniff: 4,
  wingHum: 3,
  glassSettle: 3,
  // Giving round 3: a creature asleep, catching her light, losing it.
  sleepBreath: 4,
  catchBreath: 4,
  chordCatch: 3,
} as const;
export type SoundId = keyof typeof SOUNDS;

/**
 * Long bowl sounds have nothing above ~3 kHz: they bake at a quarter of the context's rate (the
 * buffer source resamples them cleanly), which makes the kindle's bloom four times cheaper to bake.
 */
export const SLOW: Partial<Record<SoundId, number>> = {
  lanternNotice: 4,
  lanternKindle: 4,
  lanternRest: 4,
  lampNotice: 4,
  lampKindle: 4,
  lampRest: 4,
  giftBowl: 4,
  heartGift: 4,
};

/** The rate a sound is baked at, for a context running at `sr`. */
export const rateOf = (id: SoundId, sr: number): number => sr / (SLOW[id] ?? 1);

/** Channels per variant per sound; stereo where the recipe places things, mono otherwise. */
export type Bank = Record<SoundId, Float32Array[][]>;

export interface Baked {
  sr: number;
  sounds: Bank;
  /** Seamless stereo noise beds for the continuous layers. */
  loops: { pink: Float32Array[]; brown: Float32Array[] };
  /** The reverb impulse (one convolver: graph.ts sends the far sounds into it darker and later). */
  ir: { room: Float32Array[] };
}

type Recipe = (sr: number, r: () => number, v: number) => Float32Array[];

const len = (sr: number, s: number) => Math.max(1, Math.round(s * sr));
const at = (sr: number, s: number) => Math.round(s * sr);
const exp = (a: number, b: number, k: number) => a * (b / a) ** Math.min(1, Math.max(0, k));

/** Equal-power pan of a mono signal into two new channels. */
function panned(x: Float32Array, pan: number): Float32Array[] {
  const a = ((pan + 1) * Math.PI) / 4;
  const l = new Float32Array(x.length);
  const rr = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    l[i] = (x[i] as number) * Math.cos(a);
    rr[i] = (x[i] as number) * Math.sin(a);
  }
  return [l, rr];
}

/** A soft noise click: the touch that starts every struck thing. */
function click(sr: number, r: () => number, n: number, hz: number, tau: number): Float32Array {
  const x = white(n, r);
  biquad(x, sr, 'lowpass', hz);
  return shape(x, sr, arEnv(0.0006, 0, tau, Math.min(n / sr, tau * 8)));
}

/** A rubbed, noise-excited tone: very narrow band-passed noise with a little of its pure partial. */
function rubbed(
  sr: number,
  r: () => number,
  n: number,
  f: number,
  env: (t: number) => number,
  { breath = 1, pure = 0.55, beat = 0.7 } = {},
): Float32Array {
  const x = pink(n, r);
  biquad(x, sr, 'bandpass', f, 90);
  biquad(x, sr, 'bandpass', f, 90);
  normalize([x], 0.5 * breath);
  // The pure partial and an inharmonic one (bowl ratio 2.76), each with a slow warble.
  modes(x, sr, [{ f, tau: 1e3, amp: pure, beat, ph: r() }], 0, 0.01);
  modes(x, sr, [{ f: f * 2.76, tau: 1e3, amp: pure * 0.12, beat: beat * 1.9, ph: r() }], 0, 0.01);
  return shape(x, sr, env);
}

/** A slow swell: raised-cosine attack, exponential decay, faded to zero at the end. */
const swell = (a: number, tau: number, end: number) => arEnv(a, 0, tau, end);

/** A struck bowl: inharmonic partials in beating pairs, felt mallet (soft attack, dull highs). */
function bowl(
  sr: number,
  r: () => number,
  n: number,
  f: number,
  partials: number,
  decay: number,
): Float32Array {
  const ratios = [1, 2.76, 5.4, 8.93];
  const amps = [1, 0.5, 0.22, 0.09];
  const taus = [5.5, 2.8, 1.3, 0.6];
  const beats = [0.9, 1.7, 2.6, 3.3];
  const list: Mode[] = [];
  for (let k = 0; k < partials; k++)
    list.push({
      f: f * (ratios[k] as number) * (1 + (r() - 0.5) * 0.002),
      tau: (taus[k] as number) * decay,
      amp: amps[k] as number,
      beat: (beats[k] as number) * (0.8 + r() * 0.4),
      ph: r(),
    });
  const x = new Float32Array(n);
  modes(x, sr, list, 0, 0.007);
  mixInto(x, click(sr, r, len(sr, 0.05), 900, 0.006), 0.05);
  return shape(x, sr, arEnv(0.001, 0, 1e3, n / sr));
}

/**
 * A creature's breath (only things with mouths breathe: rule 1): pink noise through two formants
 * gliding from `a` to `b` (F1, F2 Hz), an attack of `att` s, `d` s long, the tail `tail` of it.
 */
function breath(
  sr: number,
  r: () => number,
  d: number,
  att: number,
  a: [number, number],
  b: [number, number],
  tail: number,
): Float32Array {
  const n = len(sr, d);
  const src = pink(n, r);
  const k = (i: number) => Math.min(1, i / sr / (d * 0.8));
  const f1 = biquad(src.slice(), sr, 'bandpass', (i) => exp(a[0], b[0], k(i)), 3);
  const f2 = biquad(src.slice(), sr, 'bandpass', (i) => exp(a[1], b[1], k(i)), 5);
  const air = biquad(src.slice(), sr, 'highpass', 1800);
  normalize([f1]);
  normalize([f2]);
  normalize([air]);
  mixInto(f1, f2, 0.45);
  mixInto(f1, air, 0.12);
  biquad(f1, sr, 'lowpass', 2600);
  const tau = Math.max(0.05, d * tail * 0.4);
  return shape(f1, sr, arEnv(att, d * (1 - tail) - att, tau, d));
}

const RECIPES: Record<SoundId, Recipe> = {
  /** One soft *fff*: noise band-passed from ~1.8 kHz down to ~700 Hz in ~90 ms, a low push under it. */
  wing(sr, r) {
    const n = len(sr, 0.22);
    const sweep = 0.08 + r() * 0.02;
    const f0 = 1650 + r() * 350;
    const f1 = 620 + r() * 160;
    const x = white(n, r);
    biquad(x, sr, 'bandpass', (i) => exp(f0, f1, i / sr / sweep), 1.1);
    biquad(x, sr, 'lowpass', 3000);
    shape(x, sr, arEnv(0.012 + r() * 0.006, 0.015, 0.035, 0.22));
    const push = white(n, r);
    biquad(push, sr, 'lowpass', 240);
    biquad(push, sr, 'lowpass', 240);
    shape(push, sr, arEnv(0.016, 0.01, 0.045, 0.22));
    normalize([x]);
    normalize([push]);
    return normalize([mixInto(x, push, 0.45)]);
  },
  /** The somersault: a slow air turn, band rising then falling (panned across her at play time). */
  whoosh(sr, r) {
    const d = 0.3 + r() * 0.06;
    const n = len(sr, d + 0.02);
    const lo = 380 + r() * 100;
    const hi = 1000 + r() * 250;
    const x = pink(n, r);
    biquad(x, sr, 'bandpass', (i) => exp(lo, hi, Math.sin((Math.PI * i) / sr / d)), 0.8);
    biquad(x, sr, 'lowpass', 2600);
    shape(x, sr, (t) => (t < d ? Math.sin((Math.PI * t) / d) ** 2 : 0));
    return normalize([x]);
  },
  /** The wings catching air: a soft deep whumpf and the snap of the membrane. Scaled by fall speed. */
  catch(sr, r) {
    const n = len(sr, 0.5);
    const low = white(n, r);
    biquad(low, sr, 'lowpass', (i) => exp(380, 140, (i / sr) * 5), 0.9);
    biquad(low, sr, 'lowpass', 320);
    shape(low, sr, arEnv(0.014, 0.02, 0.09, 0.5));
    const flap = white(n, r);
    biquad(flap, sr, 'bandpass', 700 + r() * 150, 1.2);
    shape(flap, sr, arEnv(0.004, 0, 0.022, 0.12));
    normalize([low]);
    normalize([flap]);
    return normalize([mixInto(low, flap, 0.45)]);
  },
  /** A short tearing gust: a band sweep up and back with a ragged grain on it. */
  dash(sr, r) {
    const d = 0.26;
    const n = len(sr, d);
    const x = white(n, r);
    const up = 0.045;
    biquad(
      x,
      sr,
      'bandpass',
      (i) => (i / sr < up ? exp(520, 1750, i / sr / up) : exp(1750, 800, (i / sr - up) / (d - up))),
      1.0,
    );
    // The tear: amplitude stepping at random every ~3 ms, smoothed.
    let g = 1;
    let target = 1;
    const step = len(sr, 0.003);
    const k = 1 - Math.exp(-1 / (0.0015 * sr));
    for (let i = 0; i < n; i++) {
      if (i % step === 0) target = 0.45 + r() * 0.55;
      g += (target - g) * k;
      x[i] = (x[i] as number) * g;
    }
    biquad(x, sr, 'lowpass', 3400);
    biquad(x, sr, 'lowpass', 4600);
    shape(x, sr, arEnv(0.005, 0.025, 0.06, d));
    const body = white(n, r);
    biquad(body, sr, 'lowpass', 320);
    shape(body, sr, arEnv(0.008, 0.02, 0.05, d));
    normalize([x]);
    normalize([body]);
    return normalize([mixInto(x, body, 0.35)]);
  },
  /** Landing: a puff of air and a few grains of scale-dust. */
  dust(sr, r) {
    const n = len(sr, 0.15);
    const x = white(n, r);
    biquad(x, sr, 'bandpass', 850 + r() * 300, 0.6);
    biquad(x, sr, 'lowpass', 3600);
    shape(x, sr, arEnv(0.003, 0.004, 0.024, 0.15));
    normalize([x]);
    const grains = new Float32Array(n);
    const count = 5 + Math.floor(r() * 5);
    for (let g = 0; g < count; g++)
      modes(
        grains,
        sr,
        [{ f: 1700 + r() * 1300, tau: 0.0018, amp: 0.2 + r() * 0.3 }],
        at(sr, 0.004 + r() * 0.06),
        0.0004,
      );
    normalize([grains]);
    mixInto(x, grains, 0.22);
    biquad(x, sr, 'lowpass', 4500);
    biquad(x, sr, 'lowpass', 6000);
    return normalize([shape(x, sr, arEnv(0.0005, 0, 1e3, 0.15))]);
  },
  /** A hard landing on moss and earth: low, felt, a few inharmonic modes under a muffled thud. */
  thump(sr, r) {
    const n = len(sr, 0.4);
    const x = new Float32Array(n);
    modes(
      x,
      sr,
      [
        { f: 56 + r() * 8, tau: 0.11, amp: 0.7 },
        { f: 101 + r() * 12, tau: 0.065, amp: 0.7 },
        { f: 168 + r() * 18, tau: 0.05, amp: 0.65 },
        { f: 262 + r() * 30, tau: 0.03, amp: 0.38 },
        { f: 415 + r() * 40, tau: 0.018, amp: 0.14 },
      ],
      0,
      0.004,
    );
    const thud = white(n, r);
    biquad(thud, sr, 'lowpass', 280);
    biquad(thud, sr, 'lowpass', 280);
    shape(thud, sr, arEnv(0.003, 0.008, 0.05, 0.4));
    normalize([x]);
    normalize([thud]);
    mixInto(x, thud, 0.6);
    mixInto(x, RECIPES.dust(sr, r, 0)[0] as Float32Array, 0.2);
    return normalize([shape(x, sr, arEnv(0.001, 0, 1e3, 0.4))]);
  },
  /** The same on wood (roots, trunks, branches): a hollow knock. */
  thumpWood(sr, r) {
    const n = len(sr, 0.35);
    const x = new Float32Array(n);
    modes(
      x,
      sr,
      [
        { f: 90 + r() * 10, tau: 0.08, amp: 1 },
        { f: 212 + r() * 20, tau: 0.05, amp: 0.6 },
        { f: 385 + r() * 30, tau: 0.03, amp: 0.35 },
        { f: 690 + r() * 60, tau: 0.016, amp: 0.15 },
      ],
      0,
      0.003,
    );
    normalize([x]);
    mixInto(x, click(sr, r, n, 1300, 0.004), 0.25);
    mixInto(x, RECIPES.dust(sr, r, 0)[0] as Float32Array, 0.2);
    return normalize([x]);
  },
  /** Coming down in the pool: a muffled slap and a drop. */
  splash(sr, r) {
    const n = len(sr, 0.3);
    const x = white(n, r);
    biquad(x, sr, 'bandpass', 800 + r() * 200, 0.7);
    biquad(x, sr, 'lowpass', 2500);
    shape(x, sr, arEnv(0.004, 0.01, 0.04, 0.3));
    normalize([x]);
    mixInto(x, RECIPES.plink(sr, r, 0)[0] as Float32Array, 0.3, at(sr, 0.03));
    return normalize([x]);
  },
  /** A step on wood: the faintest tick. */
  tick(sr, r) {
    const n = len(sr, 0.06);
    const x = new Float32Array(n);
    const f = 1050 + r() * 250;
    modes(
      x,
      sr,
      [
        { f, tau: 0.009, amp: 1 },
        { f: f * 2.13, tau: 0.005, amp: 0.45 },
        { f: f * 3.4, tau: 0.003, amp: 0.2 },
      ],
      0,
      0.0008,
    );
    normalize([x]);
    return normalize([mixInto(x, click(sr, r, n, 2500, 0.002), 0.3)]);
  },
  /** Claws on bark: two to four tiny catches in a dry band. */
  scrape(sr, r) {
    const n = len(sr, 0.06);
    const x = white(n, r);
    biquad(x, sr, 'bandpass', 1500 + r() * 700, 1.6);
    biquad(x, sr, 'lowpass', 4000);
    const hits = 2 + Math.floor(r() * 3);
    const times = Array.from({ length: hits }, () => r() * 0.035);
    shape(x, sr, (t) => {
      let e = 0;
      for (const h of times) if (t >= h) e += Math.exp(-(t - h) / 0.0035);
      const fade = t > 0.05 ? Math.max(0, 1 - (t - 0.05) / 0.01) : 1;
      return Math.min(1, e) * fade * Math.min(1, t / 0.0008);
    });
    // The catches are sharp; keep them dry, not bright.
    biquad(x, sr, 'lowpass', 4200);
    biquad(x, sr, 'lowpass', 5200);
    return normalize([shape(x, sr, arEnv(0.0004, 0, 1e3, 0.06))]);
  },
  /** A drop on a leaf: dull, papery, two soft modes. */
  leaf(sr, r) {
    const n = len(sr, 0.1);
    const x = new Float32Array(n);
    const f = 480 + r() * 260;
    modes(
      x,
      sr,
      [
        { f, tau: 0.016, amp: 1 },
        { f: f * 2.71, tau: 0.009, amp: 0.45 },
      ],
      0,
      0.001,
    );
    normalize([x]);
    const n2 = white(n, r);
    biquad(n2, sr, 'bandpass', 1900 + r() * 500, 1.4);
    shape(n2, sr, arEnv(0.0008, 0, 0.004, 0.04));
    normalize([n2]);
    return normalize([mixInto(x, n2, 0.5)]);
  },
  /** A drop on bark: a small dry tick. */
  bark(sr, r) {
    const n = len(sr, 0.07);
    const x = new Float32Array(n);
    const f = 1400 + r() * 350;
    modes(
      x,
      sr,
      [
        { f, tau: 0.011, amp: 1 },
        { f: f * 2.17, tau: 0.006, amp: 0.45 },
        { f: f * 3.3, tau: 0.0035, amp: 0.2 },
      ],
      0,
      0.0008,
    );
    normalize([x]);
    return normalize([mixInto(x, click(sr, r, n, 3000, 0.0015), 0.35)]);
  },
  /** A drop into the pool: a click, a small resonant plink that bends up a few percent, gone. */
  plink(sr, r) {
    const n = len(sr, 0.22);
    const x = new Float32Array(n);
    const f0 = 1100 + r() * 450;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = f0 * (1 + 0.05 * (1 - Math.exp(-t / 0.02)));
      ph += (2 * Math.PI * f) / sr;
      x[i] = Math.sin(ph) * Math.exp(-t / 0.045) * Math.min(1, t / 0.001);
    }
    modes(x, sr, [{ f: f0 * 2.4, tau: 0.01, amp: 0.25 }], 0, 0.001);
    mixInto(x, click(sr, r, n, 2200, 0.0015), 0.4);
    biquad(x, sr, 'lowpass', 5500);
    return normalize([shape(x, sr, arEnv(0.0005, 0, 1e3, 0.22))]);
  },
  /**
   * The forest's one far voice: two notes, owl-like (B3 then A3: notes of its chord, falling a
   * step), low-index FM with a slow droop and a breath of noise on each onset. Never a cricket.
   */
  voice(sr, r) {
    const n = len(sr, 1.7);
    const x = new Float32Array(n);
    const detune = 1 + (r() - 0.5) * 0.01;
    const notes = [
      { f: PITCH.A3 * (9 / 8) * detune, start: 0, d: 0.42 },
      { f: PITCH.A3 * detune, start: 0.6 + r() * 0.08, d: 0.62 },
    ];
    for (const note of notes) {
      const s0 = at(sr, note.start);
      const env = arEnv(0.075, note.d - 0.25, 0.09, note.d);
      let pc = r() * 6.28;
      let pm = r() * 6.28;
      for (let i = 0; i < len(sr, note.d) && s0 + i < n; i++) {
        const t = i / sr;
        const vib = t > 0.15 ? 1 + 0.003 * Math.sin(2 * Math.PI * 4.6 * t) : 1;
        const f = note.f * (1 - (0.018 * t) / note.d) * vib;
        const e = env(t);
        pm += (2 * Math.PI * f * 1.002) / sr;
        pc += (2 * Math.PI * f) / sr;
        x[s0 + i] = (x[s0 + i] as number) + Math.sin(pc + (0.15 + 0.5 * e) * Math.sin(pm)) * e;
      }
      const br = white(len(sr, note.d), r);
      biquad(br, sr, 'bandpass', note.f * 2, 3);
      shape(br, sr, arEnv(0.03, 0, 0.06, note.d));
      normalize([br], 0.06);
      mixInto(x, br, 1, s0);
    }
    biquad(x, sr, 'lowpass', 1300);
    return normalize([x]);
  },
  /** The Hush's knock: soft and wooden, low-passed (it is under the soil here). */
  knock(sr, r) {
    const n = len(sr, 0.4);
    const x = new Float32Array(n);
    const f = 158 + r() * 14;
    modes(
      x,
      sr,
      [
        { f, tau: 0.085, amp: 1 },
        { f: f * 2.31, tau: 0.045, amp: 0.55 },
        { f: f * 3.86, tau: 0.028, amp: 0.28 },
        { f: f * 6.5, tau: 0.014, amp: 0.1 },
      ],
      0,
      0.003,
    );
    normalize([x]);
    mixInto(x, click(sr, r, n, 900, 0.003), 0.3);
    biquad(x, sr, 'lowpass', 1600);
    return normalize([x]);
  },
  /** The dormant bowl answers at the pitch of the light she carries (A, her first note): faint. */
  lanternNotice(sr, r) {
    const n = len(sr, 4);
    return normalize([bowl(sr, r, n, PITCH.A3 * (1 + (r() - 0.5) * 0.004), 2, 0.6)]);
  },
  /**
   * Kindled: the bowl (D3) is struck, then blooms into the forest's chord, stacked fifths A3 E4 B4
   * and the octave, each a rubbed glass voice entering in turn and placed across the field.
   */
  lanternKindle(sr, r) {
    const d = 9;
    const n = len(sr, d);
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    const strike = bowl(sr, r, n, PITCH.D3, 4, 1.1);
    normalize([strike], 0.55);
    const [sl, sr2] = panned(strike, 0);
    mixInto(L, sl as Float32Array);
    mixInto(R, sr2 as Float32Array);
    const voices = [
      { f: PITCH.A3, t: 0.14, a: 0.5, tau: 2.6, g: 0.5, pan: -0.35 },
      { f: PITCH.E4, t: 0.36, a: 0.55, tau: 2.3, g: 0.38, pan: 0.35 },
      { f: PITCH.B4, t: 0.62, a: 0.65, tau: 2.0, g: 0.24, pan: -0.15 },
      { f: PITCH.D4, t: 0.9, a: 0.8, tau: 2.4, g: 0.2, pan: 0.15 },
    ];
    for (const v of voices) {
      const m = n - at(sr, v.t);
      const x = rubbed(sr, r, m, v.f, swell(v.a, v.tau, m / sr), { breath: 0.9, pure: 0.5 });
      normalize([x], v.g);
      const [l, rr] = panned(x, v.pan);
      mixInto(L, l as Float32Array, 1, at(sr, v.t));
      mixInto(R, rr as Float32Array, 1, at(sr, v.t));
    }
    return normalize([L, R]);
  },
  /** Resting at a lit lantern: a low steady hum that swells and settles. */
  lanternRest(sr, r) {
    const n = len(sr, 4.5);
    const x = rubbed(sr, r, n, PITCH.D3, swell(0.9, 1.3, 4.5), { pure: 0.6 });
    const fifth = rubbed(sr, r, n, PITCH.A3, swell(1.2, 1.1, 4.5), { pure: 0.5 });
    normalize([x]);
    normalize([fifth]);
    return normalize([mixInto(x, fifth, 0.3)]);
  },
  /** Too little light: the rubbing stops on a hollow knock. */
  lanternRefuse(sr, r) {
    const n = len(sr, 0.7);
    const x = new Float32Array(n);
    modes(
      x,
      sr,
      [
        { f: PITCH.D3, tau: 0.11, amp: 1, beat: 1.1 },
        { f: PITCH.D3 * 2.76, tau: 0.05, amp: 0.35 },
        { f: 236 + r() * 20, tau: 0.04, amp: 0.5 },
      ],
      0,
      0.004,
    );
    normalize([x]);
    mixInto(x, click(sr, r, n, 1100, 0.004), 0.2);
    return normalize([shape(x, sr, arEnv(0.001, 0, 1e3, 0.7))]);
  },
  lampNotice(sr, r) {
    const n = len(sr, 2.8);
    return normalize([bowl(sr, r, n, PITCH.A4 * (1 + (r() - 0.5) * 0.004), 1, 0.45)]);
  },
  /** A wayside lamp: one partial struck at D4, a single rubbed answer at A4. */
  lampKindle(sr, r) {
    const d = 6;
    const n = len(sr, d);
    const x = bowl(sr, r, n, PITCH.D4, 1, 0.75);
    normalize([x], 0.6);
    const a = rubbed(sr, r, n - at(sr, 0.25), PITCH.A4, swell(0.45, 1.5, d - 0.25), { pure: 0.5 });
    normalize([a], 0.3);
    mixInto(x, a, 1, at(sr, 0.25));
    return normalize([x]);
  },
  lampRest(sr, r) {
    const n = len(sr, 3);
    return normalize([rubbed(sr, r, n, PITCH.D4, swell(0.6, 0.9, 3), { pure: 0.6 })]);
  },
  lampRefuse(sr, r) {
    const n = len(sr, 0.5);
    const x = new Float32Array(n);
    modes(
      x,
      sr,
      [
        { f: PITCH.D4, tau: 0.07, amp: 1 },
        { f: 410 + r() * 30, tau: 0.03, amp: 0.4 },
      ],
      0,
      0.003,
    );
    normalize([x]);
    mixInto(x, click(sr, r, n, 1500, 0.003), 0.2);
    return normalize([shape(x, sr, arEnv(0.001, 0, 1e3, 0.5))]);
  },
  /**
   * A glint leaves her hands: a small warm glass tone at her light's pitch (A4), its onset rubbed out
   * of noise (soft, never a click and never blown), a faint inharmonic partial, a short ring.
   */
  offerTone(sr, r) {
    const d = 1.1;
    const n = len(sr, d);
    const f = PITCH.A4 * (1 + (r() - 0.5) * 0.003);
    const x = rubbed(sr, r, n, f, swell(0.045, 0.32, d), { breath: 0.8, pure: 0.6, beat: 1.1 });
    return normalize([x]);
  },
  /** One glint leaving her for a rest: a small struck glass bell (A5; pitched by the cue). */
  glintNote(sr, r) {
    const n = len(sr, 0.7);
    const f = PITCH.A4 * 2 * (1 + (r() - 0.5) * 0.003);
    const x = new Float32Array(n);
    modes(
      x,
      sr,
      [
        { f, tau: 0.2, amp: 1, beat: 1.5, ph: r() },
        { f: f * 2.76, tau: 0.06, amp: 0.18 },
        { f: f * 5.4, tau: 0.02, amp: 0.05 },
      ],
      0,
      0.003,
    );
    normalize([x]);
    mixInto(x, click(sr, r, n, 2500, 0.0015), 0.04);
    return normalize([shape(x, sr, arEnv(0.001, 0, 1e3, 0.7))]);
  },
  /** Open hands, nothing in them: a tiny dry flutter (three soft wing grains, no tone). */
  flutter(sr, r) {
    const n = len(sr, 0.16);
    const out = new Float32Array(n);
    for (let k = 0; k < 3; k++) {
      const g = white(len(sr, 0.04), r);
      biquad(g, sr, 'bandpass', 1300 + r() * 500, 1.1);
      shape(g, sr, arEnv(0.004, 0.002, 0.008, 0.04));
      normalize([g], 1 - k * 0.25);
      mixInto(out, g, 1, at(sr, k * (0.032 + r() * 0.01)));
    }
    biquad(out, sr, 'lowpass', 3500);
    return normalize([out]);
  },
  /** A lantern takes a glint toward its price: one bowl partial (A3; the cue climbs it toward D). */
  giftBowl(sr, r) {
    const n = len(sr, 3.2);
    return normalize([bowl(sr, r, n, PITCH.A3 * (1 + (r() - 0.5) * 0.003), 1, 0.45)]);
  },
  /** The heart takes a glint: deeper, D2 and D3 struck together, long. */
  heartGift(sr, r) {
    const n = len(sr, 5);
    const x = bowl(sr, r, n, PITCH.D3 / 2, 2, 0.8);
    const y = bowl(sr, r, n, PITCH.D3, 1, 0.6);
    normalize([x]);
    normalize([y]);
    return normalize([mixInto(x, y, 0.45)]);
  },
  /** A burrback takes a glint: a low exhale through the vowel of an open mouth (aa closing to oo). */
  exhale(sr, r) {
    return normalize([breath(sr, r, 0.95, 0.12, [560, 1050], [380, 820], 0.25)]);
  },
  /** Its ram was cut off: a long settling breath, sinking. */
  settle(sr, r) {
    return normalize([breath(sr, r, 2.4, 0.18, [600, 1100], [320, 760], 0.7)]);
  },
  /** Calmed, it breathes slower and slower (the cue fades it): a soft low out-breath. */
  calmBreath(sr, r) {
    return normalize([breath(sr, r, 1.6, 0.45, [420, 900], [330, 780], 0.45)]);
  },
  /** A burrback notices her: a short in-breath, rising, cut soft. */
  sniff(sr, r) {
    const d = 0.32;
    const n = len(sr, d);
    const x = pink(n, r);
    biquad(x, sr, 'bandpass', (i) => exp(700, 1500 + r() * 200, i / sr / d), 2.2);
    biquad(x, sr, 'lowpass', 3000);
    shape(x, sr, (t) => (t < d ? Math.sin((Math.PI * t) / d) ** 0.7 * (t / d) : 0));
    return normalize([shape(x, sr, arEnv(0.01, 0, 1e3, d))]);
  },
  /** A lampwing notices her: its lamp-hum swells toward her light (A5), with its fast wing tremolo. */
  wingHum(sr, r) {
    const d = 0.9;
    const n = len(sr, d);
    const f = PITCH.A4 * 2 * (1 + (r() - 0.5) * 0.004);
    const x = rubbed(sr, r, n, f, swell(0.42, 0.18, d), { breath: 0.6, pure: 0.6, beat: 2 });
    const rate = 38 + r() * 6;
    shape(x, sr, (t) => 1 - 0.25 * (0.5 + 0.5 * Math.sin(2 * Math.PI * rate * t)));
    return normalize([x]);
  },
  /** A burrback asleep: a slow, soft breath, in and a longer out, low (oo), mostly air. */
  sleepBreath(sr, r) {
    const d = 2.6;
    const n = len(sr, d);
    const x = new Float32Array(n);
    const inb = breath(sr, r, 0.9, 0.35, [330, 760], [380, 820], 0.4);
    const outb = breath(sr, r, 1.5, 0.25, [400, 860], [300, 700], 0.55);
    normalize([inb], 0.55);
    normalize([outb]);
    mixInto(x, inb);
    mixInto(x, outb, 1, at(sr, 1.0 + r() * 0.1));
    biquad(x, sr, 'lowpass', 1600);
    return normalize([x]);
  },
  /** It notices her: a sharp little in-breath, quick up, cut soft. */
  catchBreath(sr, r) {
    const d = 0.2;
    const n = len(sr, d);
    const x = pink(n, r);
    biquad(x, sr, 'bandpass', (i) => exp(900, 1900 + r() * 300, i / sr / 0.12), 2.5);
    biquad(x, sr, 'lowpass', 3200);
    shape(x, sr, (t) => (t < 0.12 ? (t / 0.12) ** 1.5 : Math.exp(-(t - 0.12) / 0.025)));
    return normalize([shape(x, sr, arEnv(0.004, 0, 1e3, d))]);
  },
  /**
   * Her carried chord catching as she is seen: her two glass tones (A4, E5) shiver for half a second,
   * a 9 Hz tremolo and a wobble of +-12 cents, as if the light held its breath.
   */
  chordCatch(sr, r) {
    const d = 0.75;
    const n = len(sr, d);
    const x = new Float32Array(n);
    for (const [f, a] of [
      [PITCH.A4, 1],
      [PITCH.E5, 0.6],
    ] as const) {
      let ph = r() * 6.283;
      const rate = 8 + r() * 2;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const wob = 2 ** ((12 * Math.sin(2 * Math.PI * 5.5 * t) * Math.exp(-t / 0.35)) / 1200);
        ph += (2 * Math.PI * f * wob) / sr;
        const trem = 1 - 0.55 * (0.5 + 0.5 * Math.sin(2 * Math.PI * rate * t)) * Math.exp(-t / 0.4);
        x[i] = (x[i] as number) + Math.sin(ph) * a * trem;
      }
    }
    const air = pink(n, r);
    biquad(air, sr, 'bandpass', PITCH.A4 * 2, 8);
    normalize([air], 0.15);
    mixInto(x, air);
    return normalize([shape(x, sr, arEnv(0.03, 0.12, 0.2, d))]);
  },
  /** A lampwing takes a glint: its glass tone opens and lets go, low and soft. */
  glassSettle(sr, r) {
    const n = len(sr, 1.6);
    const f = PITCH.E4 * 2 * (1 + (r() - 0.5) * 0.004);
    const x = rubbed(sr, r, n, f, swell(0.08, 0.4, 1.6), { breath: 0.7, pure: 0.5, beat: 0.8 });
    return normalize([x]);
  },
};

/** Only glass may ring above the roll-off. */
const GLASS: readonly SoundId[] = [
  'lanternNotice',
  'lanternKindle',
  'lanternRest',
  'lampNotice',
  'lampKindle',
  'lampRest',
  'offerTone',
  'glintNote',
  'wingHum',
  'glassSettle',
  'chordCatch',
];

/** The last pass over every variant: a roll-off above ~7 kHz (but glass), a 2 ms fade to zero, peak 0.9. */
function finish(id: SoundId, sr: number, chs: Float32Array[]): Float32Array[] {
  const out = GLASS.includes(id)
    ? chs
    : chs.map((c) => biquad(biquad(c, sr, 'lowpass', 7000), sr, 'lowpass', 7000));
  const n = out[0]?.length ?? 0;
  const fade = Math.min(n, Math.round(0.002 * sr));
  for (const c of out) for (let i = 0; i < fade; i++) c[n - 1 - i] = (c[n - 1 - i] as number) * (i / fade);
  return normalize(out);
}

/** A seamless stereo noise bed of `s` seconds. */
function loop(
  sr: number,
  seed: number,
  s: number,
  gen: (n: number, r: () => number) => Float32Array,
): Float32Array[] {
  const n = len(sr, s);
  const xf = len(sr, 0.5);
  return [0, 1].map((c) => seamless(gen(n + xf, stream(seed + c * 7919)), n, xf));
}

/**
 * A seeded reverb impulse: decaying stereo noise that darkens as it goes (a forest, not a hall),
 * with a short pre-delay and a soft onset.
 */
function impulse(
  sr: number,
  seed: number,
  s: number,
  pre: number,
  bright: number,
  dark: number,
): Float32Array[] {
  const n = len(sr, s + pre);
  const tau = s / 6.9;
  return [0, 1].map((c) => {
    const r = stream(seed + c * 104729);
    const x = white(n, r);
    biquad(x, sr, 'lowpass', (i) => dark + (bright - dark) * Math.exp(-(i / sr) / (s * 0.15)), 0.7);
    return shape(x, sr, (t) => {
      const u = t - pre;
      if (u < 0) return 0;
      const onset = Math.min(1, u / 0.012);
      const end = u > s * 0.9 ? Math.max(0, 1 - (u - s * 0.9) / (s * 0.1)) : 1;
      return onset * Math.exp(-u / tau) * end;
    });
  });
}

/**
 * Baking in pieces, so the page can spread it over idle callbacks. Each piece fills its part of
 * `out`; `bakeAll` runs them in order. ~100 ms in all at 48 kHz on a laptop.
 */
export function bakeSteps(sr: number, seed: number): { out: Baked; steps: Array<() => void> } {
  const out: Baked = {
    sr,
    sounds: {} as Bank,
    loops: { pink: [], brown: [] },
    ir: { room: [] },
  };
  const steps: Array<() => void> = [
    () => {
      out.loops.pink = loop(sr, seed ^ 0x51ed, 8, pink);
      out.loops.brown = loop(sr, seed ^ 0xb40, 8, brown);
    },
    () => {
      out.ir.room = impulse(sr, seed ^ 0x700, 2.2, 0.012, 4000, 450);
    },
  ];
  for (const id of Object.keys(SOUNDS) as SoundId[]) {
    steps.push(() => {
      out.sounds[id] = bakeSound(id, rateOf(id, sr), seed);
    });
  }
  return { out, steps };
}

export function bakeAll(sr: number, seed: number): Baked {
  const { out, steps } = bakeSteps(sr, seed);
  for (const s of steps) s();
  return out;
}

/** Bakes one sound's variants at `sr` (bakeSteps passes `rateOf`; tests call it directly). */
export function bakeSound(id: SoundId, sr: number, seed: number): Float32Array[][] {
  return Array.from({ length: SOUNDS[id] }, (_, v) =>
    finish(id, sr, RECIPES[id](sr, stream((seed ^ salt(id)) + v * 977), v)),
  );
}
