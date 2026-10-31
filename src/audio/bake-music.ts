/**
 * The score's instruments (src/audio/score.ts) and the Canopy's own sounds, baked in plain JS like every one-shot.
 *
 * Instruments are baked as notes: one variant per pitch every `step` semitones over a range, played back repitched
 * by at most half a step (`noteOf`). So a phrase costs a buffer source per note and nothing is synthesised live.
 * - `felt`: Wing's instrument, a felt-hammered string (modal: slightly stretched partials, a struck-at-1/7 comb, a
 *   soft felt roll-off, two strings a fraction of a hertz apart beating, a quiet long aftersound) and a felt thump.
 * - `harp`: plucked strings (harmonic partials, plucked near the end, a soft catch of noise).
 * - `strings`, `trem`, `marc`: a bowed section: five wavetable voices a few cents apart, each with its own
 *   vibrato and bow pressure, through a body (two formant bands over a low-pass) with bow noise. Long (a slow
 *   swell, held, let go), tremolo (stroked ~11 times a second) and marcato (a bitten attack falling to a hold).
 * - `celesta`: struck glass in the forest's tuning (only glass rings above the roll-off).
 * - `glass`: rubbed glass (the forest's chord: noise-excited narrow resonators, a pure partial and the bowl's 2.76),
 *   a slow swell held 6 s: the theme's chords (docs/design/levels/canopy-moments.md §5).
 * - `drum`: a low frame drum (a membrane's inharmonic modes over a falling body), `colLegno`: wood on string.
 * No voice and nothing blown (docs/audio-direction.md: Wing never vocalises; formants belong to things that eat).
 */
import { at, click, exp, len, type Recipe, rubbed } from './bake-lib';
import {
  arEnv,
  biquad,
  brown,
  type Mode,
  mixInto,
  modes,
  normalize,
  pink,
  saturate,
  shape,
  white,
} from './dsp';
import { LAMP_HZ } from './tuning';

/** A baked instrument: MIDI range, semitones between baked notes, and the rate divisor (sr / slow). */
export interface Instrument {
  lo: number;
  hi: number;
  step: number;
  slow: number;
}
export const INSTR = {
  felt: { lo: 30, hi: 90, step: 3, slow: 2 },
  harp: { lo: 38, hi: 89, step: 3, slow: 2 },
  strings: { lo: 36, hi: 84, step: 3, slow: 3 },
  trem: { lo: 33, hi: 81, step: 3, slow: 4 },
  marc: { lo: 26, hi: 59, step: 3, slow: 4 },
  celesta: { lo: 69, hi: 99, step: 3, slow: 2 },
  glass: { lo: 50, hi: 86, step: 3, slow: 4 },
} as const satisfies Record<string, Instrument>;
export type PitchedId = keyof typeof INSTR;

const count = (i: Instrument) => Math.floor((i.hi - i.lo) / i.step) + 1;
/** The MIDI note of variant `k`. */
export const midiOf = (id: PitchedId, k: number): number => INSTR[id].lo + k * INSTR[id].step;
export const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** The variant to play for MIDI note `m` (fractional allowed) and the cents to repitch it by. */
export function noteOf(id: PitchedId, m: number): { variant: number; cents: number } {
  const i = INSTR[id];
  const k = Math.max(0, Math.min(count(i) - 1, Math.round((m - i.lo) / i.step)));
  return { variant: k, cents: (m - (i.lo + k * i.step)) * 100 };
}

export const MUSIC_SOUNDS = {
  felt: count(INSTR.felt),
  harp: count(INSTR.harp),
  strings: count(INSTR.strings),
  trem: count(INSTR.trem),
  marc: count(INSTR.marc),
  celesta: count(INSTR.celesta),
  glass: count(INSTR.glass),
  drum: 4,
  colLegno: 4,
  // The Canopy's world: insects, earth trickling in the den, the firefly, the cages' hooks, the arena gates.
  insect: 6,
  trickle: 4,
  fireflyBlink: 4,
  fireflyKindle: 2,
  clink: 3,
  gateThud: 3,
  gateGroan: 2,
  // The Canopy r14: the Keeper's rage (a roar: it has a mouth), its sweep's tell (claws raked back, a hiss), the
  // escape's roots snapping, rocks landing.
  roar: 2,
  sweepTell: 2,
  rootSnap: 3,
  rockLand: 3,
  // The Canopy r15: the slam's crack opening at its feet and its fronts grinding along the floor, the pull onto a
  // chase's hook, the kin's torn wing trying.
  fissure: 2,
  waveGrit: 4,
  hookPull: 2,
  kinTry: 2,
} as const;
export type MusicSoundId = keyof typeof MUSIC_SOUNDS;

/** Rate divisors (bake.ts `SLOW`): the instruments' long notes have little up high. */
export const MUSIC_SLOW: Partial<Record<MusicSoundId, number>> = {
  felt: INSTR.felt.slow,
  harp: INSTR.harp.slow,
  strings: INSTR.strings.slow,
  trem: INSTR.trem.slow,
  marc: INSTR.marc.slow,
  celesta: INSTR.celesta.slow,
  glass: INSTR.glass.slow,
  drum: 2,
  trickle: 2,
  gateThud: 2,
  gateGroan: 2,
  roar: 2,
  waveGrit: 2,
};
/** Glass rings above the roll-off. */
export const MUSIC_GLASS: readonly MusicSoundId[] = ['celesta', 'glass', 'fireflyBlink'];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** A raised-cosine fade to zero over the last `s` seconds (a damper, a bow lifting). */
function tailOff(x: Float32Array, sr: number, s: number): Float32Array {
  const n = x.length;
  const k = Math.min(n, Math.round(s * sr));
  for (let i = 0; i < k; i++) {
    const j = n - k + i;
    x[j] = (x[j] as number) * (0.5 + 0.5 * Math.cos((Math.PI * i) / k));
  }
  return x;
}

/** Wing's felt-hammered string. */
function felt(sr: number, r: () => number, m: number): Float32Array[] {
  const f0 = mtof(m);
  const d = clamp(6.4 - (m - 30) * 0.07, 2.6, 6.4);
  const n = len(sr, d);
  const x = new Float32Array(n);
  const B = 0.00007 * 2 ** ((m - 48) / 16);
  const T0 = clamp(4.6 * 2 ** (-(m - 45) / 28), 0.9, 5.5);
  const knee = 1500 + f0 * 1.4;
  const top = Math.min(sr * 0.45, 7000);
  const list: Mode[] = [];
  for (let k = 1; k <= 16; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > top) break;
    const comb = Math.abs(Math.sin((Math.PI * k) / 7.3)) + 0.12;
    const amp = comb / k ** 0.85 / (1 + (fk / knee) ** 2);
    const tau = T0 / (1 + 0.42 * (k - 1));
    list.push({ f: fk, tau, amp, ph: r(), ...(k <= 6 ? { beat: 0.08 + r() * 0.3 } : {}) });
    if (k <= 3) list.push({ f: fk * (1 + (r() - 0.5) * 0.0005), tau: tau * 2.6, amp: amp * 0.16, ph: r() });
  }
  modes(x, sr, list, 0, 0.004);
  const thump = white(len(sr, 0.07), r);
  biquad(thump, sr, 'lowpass', 220 + f0 * 0.6);
  biquad(thump, sr, 'lowpass', 220 + f0 * 0.6);
  shape(thump, sr, arEnv(0.002, 0, 0.012, 0.07));
  normalize([x]);
  normalize([thump], 0.12);
  mixInto(x, thump);
  return [tailOff(x, sr, 0.35)];
}

/** A plucked string. */
function harp(sr: number, r: () => number, m: number): Float32Array[] {
  const f0 = mtof(m);
  const d = clamp(4.6 - (m - 38) * 0.055, 1.8, 4.6);
  const n = len(sr, d);
  const x = new Float32Array(n);
  const T0 = clamp(3.4 * 2 ** (-(m - 50) / 24), 0.7, 3.8);
  const top = Math.min(sr * 0.45, 7000);
  const list: Mode[] = [];
  for (let k = 1; k <= 12; k++) {
    const fk = k * f0 * (1 + 0.00002 * k * k);
    if (fk > top) break;
    const amp = (Math.abs(Math.sin(Math.PI * k * 0.19)) + 0.05) / k ** 1.1 / (1 + (fk / 3600) ** 2);
    list.push({
      f: fk,
      tau: T0 / (1 + 0.55 * (k - 1)),
      amp,
      ph: r(),
      ...(k <= 2 ? { beat: 0.05 + r() * 0.12 } : {}),
    });
  }
  modes(x, sr, list, 0, 0.0015);
  normalize([x]);
  const pluck = click(sr, r, len(sr, 0.025), 1800 + f0, 0.003);
  normalize([pluck], 0.1);
  mixInto(x, pluck);
  return [tailOff(x, sr, 0.25)];
}

/** One cycle of a band-limited saw with `k` partials, `size` samples. */
function sawTable(k: number, size: number): Float32Array {
  const t = new Float32Array(size + 1);
  for (let h = 1; h <= k; h++) {
    // A gentle extra roll-off over the top partials (a bowed string, not a synth saw).
    const a = (1 / h) * (h > k * 0.6 ? 1 - (h - k * 0.6) / (k * 0.5) : 1);
    for (let i = 0; i < size; i++) t[i] = (t[i] as number) + a * Math.sin((2 * Math.PI * h * i) / size);
  }
  t[size] = t[0] as number;
  return t;
}

interface Bow {
  /** Amplitude envelope (t s). */
  env: (t: number) => number;
  /** Bow noise level relative to the tone, and its extra at the attack (s). */
  noise: number;
  scratch: number;
  /** Vibrato depth (cents) and when it comes in (s). */
  vib: number;
  vibIn: number;
  /** Tremolo strokes per second (0 none). */
  trem?: number;
  voices?: number;
}

/** A bowed section playing MIDI `m` for `d` s. */
function bowed(sr: number, r: () => number, m: number, d: number, bow: Bow): Float32Array {
  const f0 = mtof(m);
  const n = len(sr, d);
  const size = 2048;
  const k = Math.max(1, Math.min(40, Math.floor(Math.min(sr * 0.45, 7500) / f0)));
  const tab = sawTable(k, size);
  const V = bow.voices ?? 5;
  const x = new Float32Array(n);
  for (let v = 0; v < V; v++) {
    const spread = V > 1 ? (v - (V - 1) / 2) / ((V - 1) / 2) : 0;
    const det = spread * 7 + (r() - 0.5) * 3;
    const rate = 4.6 + r() * 1.3;
    const depth = bow.vib * (0.7 + r() * 0.6);
    const vph = r() * 2 * Math.PI;
    const wob = 0.35 + r() * 0.5;
    const wph = r() * 2 * Math.PI;
    const start = Math.round(r() * 0.03 * sr);
    let ph = r() * size;
    let inc = 0;
    // (Round 13, the strings sounded synthetic: each player now scoops into the note from a little flat, drifts a
    // few cents, and leans on the bow unevenly: slow random pressure, not a sine.)
    const scoop = -(6 + r() * 10);
    let drift = 0;
    let press = 0;
    let pressTo = 0;
    for (let i = start; i < n; i++) {
      const t = i / sr;
      if (((i - start) & 15) === 0) {
        const vibK = clamp((t - bow.vibIn) / 0.7, 0, 1);
        drift += ((r() - 0.5) * 0.9 - drift * 0.002) * 0.25;
        if (((i - start) & 1023) === 0) pressTo = (r() - 0.5) * 0.22;
        press += (pressTo - press) * 0.01;
        const c =
          det +
          scoop * Math.exp(-(t - start / sr) / 0.07) +
          clamp(drift, -4, 4) +
          depth * vibK * Math.sin(2 * Math.PI * rate * t + vph);
        inc = ((f0 * 2 ** (c / 1200)) / sr) * size;
      }
      ph += inc;
      if (ph >= size) ph -= size;
      const j = ph | 0;
      const fr = ph - j;
      const s = (tab[j] as number) + ((tab[j + 1] as number) - (tab[j] as number)) * fr;
      x[i] = (x[i] as number) + s * (1 + press + 0.03 * Math.sin(2 * Math.PI * wob * t + wph));
    }
  }
  // The body: a low-pass that opens a little with pitch, and a wooden box's resonances over it (round 13: two
  // formant bands read as a synth pad). An instrument's body is a comb of uneven peaks, so each note's partials land
  // on different ones: the air mode, the main wood modes, the bridge hill; scaled down for the low register (a
  // section of cellos and basses under violins). Nothing under 55 Hz.
  const lp = biquad(
    biquad(x.slice(), sr, 'lowpass', Math.min(sr * 0.42, 1700 + 2.4 * f0), 0.7),
    sr,
    'lowpass',
    Math.min(sr * 0.42, 3200 + 2 * f0),
    0.6,
  );
  normalize([lp]);
  const scale = m < 48 ? 0.45 : m < 60 ? 0.7 : 1;
  const BODY: Array<[number, number, number]> = [
    [275, 4, 0.3],
    [460, 6, 0.32],
    [540, 7, 0.2],
    [700, 5, 0.16],
    [1050, 6, 0.12],
    [2350, 2.2, 0.16],
    [3100, 3, 0.07],
  ];
  for (const [hz, q, g] of BODY) {
    const b = biquad(x.slice(), sr, 'bandpass', Math.min(sr * 0.42, hz * scale), q);
    normalize([b]);
    mixInto(lp, b, g);
  }
  biquad(lp, sr, 'highpass', 55);
  normalize([lp]);
  // Bow hair on the string: a breathy band that follows the bow, rough at the attack.
  const hair = pink(n, r);
  biquad(hair, sr, 'bandpass', clamp(1600 + f0 * 1.5, 1200, sr * 0.4), 0.9);
  biquad(hair, sr, 'lowpass', Math.min(sr * 0.42, 5000));
  normalize([hair]);
  const trem = bow.trem ?? 0;
  const tph = r();
  const stroke = (t: number) =>
    trem > 0
      ? 0.5 + 0.5 * Math.abs(Math.sin(Math.PI * (trem * t + tph + 0.05 * Math.sin(7.3 * t)))) ** 0.7
      : 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const e = bow.env(t) * stroke(t);
    const sc = bow.scratch > 0 ? Math.exp(-t / bow.scratch) : 0;
    lp[i] = (lp[i] as number) * e + (hair[i] as number) * e * (bow.noise + 0.6 * sc);
  }
  return lp;
}

/** Long: a slow swell, held with a little rise, let go. `d` = 7 s (the score trims it with `dur`). */
function longBow(sr: number, r: () => number, m: number): Float32Array[] {
  const d = 7;
  const a = m < 48 ? 0.75 : 0.55;
  const env = (t: number) => {
    if (t < a) return 0.5 - 0.5 * Math.cos((Math.PI * t) / a);
    if (t < 5.4) return 1 + 0.12 * Math.sin((Math.PI * (t - a)) / (5.4 - a));
    return Math.exp(-(t - 5.4) / 0.45);
  };
  return [tailOff(bowed(sr, r, m, d, { env, noise: 0.05, scratch: 0.06, vib: 9, vibIn: 0.35 }), sr, 0.3)];
}

/** Tremolo: stroked fast, for tension. 4.2 s (a bar and a little). */
function tremBow(sr: number, r: () => number, m: number): Float32Array[] {
  const d = 4.2;
  const env = (t: number) => (t < 0.09 ? t / 0.09 : t < 3.6 ? 1 : Math.exp(-(t - 3.6) / 0.18));
  return [
    tailOff(bowed(sr, r, m, d, { env, noise: 0.09, scratch: 0.04, vib: 4, vibIn: 0.5, trem: 11.5 }), sr, 0.2),
  ];
}

/** Marcato: a bitten attack falling to a hold, then let go. 2.6 s. */
function marcBow(sr: number, r: () => number, m: number): Float32Array[] {
  const d = 2.6;
  const env = (t: number) => {
    if (t < 0.022) return t / 0.022;
    if (t < 1.7) return 0.5 + 0.5 * Math.exp(-(t - 0.022) / 0.22);
    return 0.5 * Math.exp(-(t - 1.7) / 0.28);
  };
  return [tailOff(bowed(sr, r, m, d, { env, noise: 0.08, scratch: 0.05, vib: 5, vibIn: 0.6 }), sr, 0.2)];
}

/** Struck glass in tune: a strong fundamental, a weak inharmonic shimmer, a tine's click. */
function celesta(sr: number, r: () => number, m: number): Float32Array[] {
  const f0 = mtof(m);
  const d = 2.1;
  const n = len(sr, d);
  const x = new Float32Array(n);
  const T = clamp(1.5 * 2 ** (-(m - 76) / 24), 0.5, 2);
  modes(
    x,
    sr,
    [
      { f: f0, tau: T, amp: 1, beat: 0.4 + r() * 0.6, ph: r() },
      { f: f0 * 2.0, tau: T * 0.3, amp: 0.1, ph: r() },
      { f: f0 * 3.98, tau: T * 0.16, amp: 0.13, ph: r() },
      { f: f0 * 9.1, tau: 0.04, amp: 0.05, ph: r() },
    ],
    0,
    0.0012,
  );
  normalize([x]);
  const tine = click(sr, r, len(sr, 0.012), 3800, 0.0015);
  normalize([tine], 0.08);
  mixInto(x, tine);
  return [tailOff(x, sr, 0.2)];
}

/** Rubbed glass: the forest's chord tone, swelling in, held, let go. 7 s (the score trims it with `dur`). */
function glassPad(sr: number, r: () => number, m: number): Float32Array[] {
  const d = 7;
  const env = (t: number) => {
    if (t < 0.9) return 0.5 - 0.5 * Math.cos((Math.PI * t) / 0.9);
    if (t < 5.6) return 1;
    return Math.exp(-(t - 5.6) / 0.4);
  };
  const x = rubbed(sr, r, len(sr, d), mtof(m), env, { breath: 0.8, pure: 0.7, beat: 0.35 + r() * 0.3 });
  return [tailOff(x, sr, 0.3)];
}

const pitched =
  (fn: (sr: number, r: () => number, m: number) => Float32Array[], id: PitchedId): Recipe =>
  (sr, r, v) =>
    fn(sr, r, midiOf(id, v));

export const MUSIC_RECIPES: Record<MusicSoundId, Recipe> = {
  felt: pitched(felt, 'felt'),
  harp: pitched(harp, 'harp'),
  strings: pitched(longBow, 'strings'),
  trem: pitched(tremBow, 'trem'),
  marc: pitched(marcBow, 'marc'),
  celesta: pitched(celesta, 'celesta'),
  glass: pitched(glassPad, 'glass'),
  /** A low frame drum: a body falling 90 -> 50 Hz, a membrane's modes, the beater (soft 0-1, hard 2-3). */
  drum(sr, r, v) {
    const hard = v >= 2;
    const d = 1.7;
    const n = len(sr, d);
    const x = new Float32Array(n);
    const f1 = 50 + r() * 4;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += (2 * Math.PI * exp(hard ? 96 : 84, f1, t / 0.09)) / sr;
      x[i] = Math.sin(ph) * arEnv(0.002, 0.03, hard ? 0.42 : 0.36, d)(t);
    }
    modes(
      x,
      sr,
      [1.59, 2.14, 2.3, 2.65, 2.92].map((k, j) => ({
        f: f1 * k * (1 + (r() - 0.5) * 0.01),
        tau: 0.28 / (1 + j * 0.4),
        amp: [0.34, 0.22, 0.16, 0.1, 0.07][j] as number,
        ph: r(),
      })),
      0,
      0.002,
    );
    const beater = white(len(sr, 0.05), r);
    biquad(beater, sr, 'lowpass', hard ? 1500 : 700);
    shape(beater, sr, arEnv(0.001, 0, 0.008, 0.05));
    normalize([x]);
    normalize([beater], hard ? 0.3 : 0.15);
    mixInto(x, beater);
    for (let i = 0; i < n; i++) x[i] = saturate(x[i] as number, hard ? 1.6 : 1.2);
    return [tailOff(x, sr, 0.2)];
  },
  /** The wood of the bow on the string: a dry knock with the faintest pitch. */
  colLegno(sr, r) {
    const d = 0.16;
    const x = new Float32Array(len(sr, d));
    const f = 1150 + r() * 260;
    modes(
      x,
      sr,
      [
        { f, tau: 0.022, amp: 1, ph: r() },
        { f: f * 2.71, tau: 0.012, amp: 0.45, ph: r() },
        { f: f * 5.15, tau: 0.006, amp: 0.2, ph: r() },
        { f: 196 * (1 + r() * 0.05), tau: 0.05, amp: 0.25, ph: r() },
      ],
      0,
      0.0004,
    );
    normalize([x]);
    mixInto(x, normalize([click(sr, r, len(sr, 0.01), 4000, 0.001)], 0.25)[0] as Float32Array);
    return [x];
  },
  /**
   * Insects far off in the night (a soft chorus, never a cricket at her ear): 0-2 a tree cricket's trill (a pulsed
   * tone ~4 kHz, 28-45 pulses a second), 3-5 a katydid's few dry rasps.
   */
  insect(sr, r, v) {
    if (v < 3) {
      const d = 0.6 + r() * 0.9;
      const n = len(sr, d + 0.05);
      const x = new Float32Array(n);
      const f = 3700 + r() * 900;
      const rate = 28 + r() * 17;
      const duty = 0.45;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const p = (t * rate) % 1;
        const pulse = p < duty ? Math.sin((Math.PI * p) / duty) ** 2 : 0;
        x[i] = Math.sin(2 * Math.PI * f * t + 0.6 * Math.sin(2 * Math.PI * rate * t)) * pulse;
      }
      return [shape(x, sr, arEnv(0.12, d - 0.3, 0.08, d + 0.05))];
    }
    const rasps = 2 + Math.floor(r() * 3);
    const gap = 0.1 + r() * 0.06;
    const n = len(sr, rasps * gap + 0.12);
    const x = new Float32Array(n);
    const f = 4300 + r() * 900;
    for (let k = 0; k < rasps; k++) {
      const g = white(len(sr, 0.05), r);
      biquad(g, sr, 'bandpass', f, 5);
      shape(g, sr, arEnv(0.004, 0.012, 0.012, 0.05));
      mixInto(x, g, 0.7 + 0.3 * r(), at(sr, k * gap));
    }
    return [normalize([x])[0] as Float32Array];
  },
  /** Earth trickling from the den's roof: a run of small grains bunched at the front, a soft patter under. */
  trickle(sr, r) {
    const d = 0.7 + r() * 0.6;
    const n = len(sr, d + 0.1);
    const x = new Float32Array(n);
    const count = 24 + Math.floor(r() * 20);
    for (let g = 0; g < count; g++) {
      const t = d * r() ** 1.8;
      const f = 300 + 1300 * r();
      modes(x, sr, [{ f, tau: 0.008 + 0.01 * r(), amp: 0.3 + 0.7 * r(), ph: r() }], at(sr, t), 0.0004);
    }
    const sand = pink(n, r);
    biquad(sand, sr, 'bandpass', 900, 0.8);
    shape(sand, sr, (t) => (t < d ? (1 - t / d) * 0.6 : 0));
    normalize([x]);
    normalize([sand], 0.25);
    mixInto(x, sand);
    return [shape(x, sr, arEnv(0.004, 0, 1e3, d + 0.1))];
  },
  /**
   * The firefly's voice is its light: a small cold glass ping at the false lights' sharp pitch (it hung them). 0-1
   * short (its call's dots, its blink as it flies), 2-3 long, held with a slow pulse (the call's last note).
   */
  fireflyBlink(sr, r, v) {
    const long = v >= 2;
    const d = long ? 1.8 : 0.9;
    const n = len(sr, d);
    const x = new Float32Array(n);
    const f = LAMP_HZ.wick * 2 * (v % 2 ? 1.5 : 1);
    modes(
      x,
      sr,
      [
        { f, tau: long ? 0.7 : 0.13, amp: 1, beat: 1.3, ph: r() },
        { f: f * 2.76, tau: long ? 0.2 : 0.05, amp: 0.25, ph: r() },
        { f: f * 5.4, tau: 0.03, amp: 0.08, ph: r() },
      ],
      0,
      long ? 0.02 : 0.001,
    );
    if (long) shape(x, sr, (t) => 0.75 + 0.25 * Math.cos(2 * Math.PI * 5 * t));
    return [shape(x, sr, arEnv(0.001, 0, 1e3, d))];
  },
  /** A lamp lit by the firefly: a soft catch of flame rising into the wick's beating tone. */
  fireflyKindle(sr, r) {
    const d = 1.3;
    const n = len(sr, d);
    const air = pink(n, r);
    biquad(air, sr, 'bandpass', (i) => exp(500, 2300, i / sr / 0.18), 1.2);
    shape(air, sr, arEnv(0.02, 0.05, 0.12, d));
    const x = new Float32Array(n);
    modes(x, sr, [{ f: LAMP_HZ.wick, tau: 0.6, amp: 1, beat: 1.3, ph: r() }], at(sr, 0.08), 0.12);
    normalize([air]);
    normalize([x], 0.6);
    mixInto(air, x);
    return [normalize([air])[0] as Float32Array];
  },
  /** A cage hung on its hook: small metal-glass tinks settling. */
  clink(sr, r) {
    const d = 0.7;
    const x = new Float32Array(len(sr, d));
    const hits = 3 + Math.floor(r() * 3);
    let t = 0;
    for (let k = 0; k < hits; k++) {
      const f = 2100 + r() * 1500;
      modes(
        x,
        sr,
        [
          { f, tau: 0.05, amp: 1 - k * 0.15, ph: r() },
          { f: f * 1.53, tau: 0.03, amp: 0.4, ph: r() },
        ],
        at(sr, t),
        0.0005,
      );
      t += 0.05 + r() * 0.1;
    }
    return [normalize([x])[0] as Float32Array];
  },
  /** An arena's root gate slamming down: a heavy wood thud, earth shaken loose after it. */
  gateThud(sr, r) {
    const d = 1.5;
    const n = len(sr, d);
    const x = new Float32Array(n);
    modes(
      x,
      sr,
      [
        { f: 68 + r() * 8, tau: 0.22, amp: 1, ph: r() },
        { f: 112 + r() * 10, tau: 0.14, amp: 0.6, ph: r() },
        { f: 186 + r() * 20, tau: 0.08, amp: 0.4, ph: r() },
        { f: 410 + r() * 40, tau: 0.03, amp: 0.25, ph: r() },
      ],
      0,
      0.003,
    );
    const knock = white(len(sr, 0.12), r);
    biquad(knock, sr, 'lowpass', 420);
    shape(knock, sr, arEnv(0.002, 0.01, 0.03, 0.12));
    normalize([x]);
    normalize([knock], 0.5);
    mixInto(x, knock);
    const debris = new Float32Array(n);
    for (let g = 0; g < 26; g++)
      modes(
        debris,
        sr,
        [{ f: 500 + 1600 * r(), tau: 0.01, amp: 0.3 + 0.7 * r(), ph: r() }],
        at(sr, 0.06 + 1.1 * r() ** 1.5),
        0.0004,
      );
    normalize([debris], 0.22);
    mixInto(x, debris);
    for (let i = 0; i < n; i++) x[i] = saturate(x[i] as number, 1.4);
    return [shape(x, sr, arEnv(0.002, 0, 1e3, d))];
  },
  /** A root gate drawing back: a long low creak of wood under strain, earth sifting. */
  gateGroan(sr, r) {
    const d = 1.8;
    const n = len(sr, d);
    const x = new Float32Array(n);
    let t = 0.01;
    while (t < d - 0.2) {
      const k = t / d;
      const f = 105 * (1 - 0.25 * k) * (0.96 + 0.08 * r());
      modes(
        x,
        sr,
        [
          { f, tau: 0.03, amp: 0.6 + 0.4 * Math.sin(Math.PI * k), ph: r() },
          { f: f * 2.37, tau: 0.018, amp: 0.3, ph: r() },
          { f: f * 4.1, tau: 0.008, amp: 0.12, ph: r() },
        ],
        at(sr, t),
        0.001,
      );
      t += 0.022 + 0.03 * r();
    }
    const sift = pink(n, r);
    biquad(sift, sr, 'bandpass', 800, 0.7);
    shape(sift, sr, (u) => Math.sin((Math.PI * Math.min(u, d)) / d) * 0.3);
    normalize([x]);
    normalize([sift], 0.25);
    mixInto(x, sift);
    return [shape(x, sr, arEnv(0.08, d - 0.5, 0.15, d))];
  },
  /**
   * The Keeper's rage (P1's beat, `keeperRage rear`): it has a mouth, so it roars. A sharp in-breath, then a growl:
   * pink noise through two formants opening (F1 280 -> 520 Hz, F2 700 -> 1150) beaten at ~31 Hz (a throat's
   * roughness), over a sub falling 78 -> 52 Hz, its shell creaking; saturated. ~1.5 s, the last of it the breath out.
   */
  roar(sr, r) {
    const d = 1.55;
    const n = len(sr, d);
    const inb = pink(n, r);
    biquad(inb, sr, 'bandpass', (i) => exp(500, 1300, i / sr / 0.22), 2.5);
    shape(inb, sr, (t) => (t < 0.24 ? (t / 0.24) ** 2 : Math.max(0, 1 - (t - 0.24) / 0.05)));
    const src = pink(n, r);
    const k = (i: number) => Math.min(1, Math.max(0, (i / sr - 0.25) / 0.6));
    const f1 = biquad(src.slice(), sr, 'bandpass', (i) => exp(280, 520, k(i)), 2.2);
    const f2 = biquad(src.slice(), sr, 'bandpass', (i) => exp(700, 1150, k(i)), 3.5);
    normalize([f1]);
    normalize([f2]);
    mixInto(f1, f2, 0.55);
    const rate = 29 + r() * 5;
    const sub = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += (2 * Math.PI * exp(78, 52, (t - 0.25) / 1.1)) / sr;
      // A throat's roughness: the growl beats, unevenly.
      const rough = 0.6 + 0.4 * Math.sin(2 * Math.PI * rate * t + 1.5 * Math.sin(2 * Math.PI * 3.1 * t));
      f1[i] = (f1[i] as number) * rough;
      sub[i] = (Math.sin(ph) + 0.35 * Math.sin(2 * ph + 0.4)) * rough;
    }
    const growlEnv = arEnv(0.12, 0.55, 0.35, d - 0.22);
    shape(f1, sr, (t) => (t < 0.22 ? 0 : growlEnv(t - 0.22)));
    shape(sub, sr, (t) => (t < 0.22 ? 0 : growlEnv(t - 0.22)));
    normalize([sub], 0.7);
    const x = new Float32Array(n);
    mixInto(x, normalize([inb], 0.35)[0] as Float32Array);
    mixInto(x, f1, 0.8);
    mixInto(x, sub, 0.9);
    // Its plates grinding as it rears.
    for (let g = 0; g < 18; g++) {
      const t = 0.3 + 0.9 * r();
      const f = 180 + 260 * r();
      modes(x, sr, [{ f, tau: 0.012, amp: 0.25 * r(), ph: r() }], at(sr, t), 0.001);
    }
    biquad(x, sr, 'lowpass', 3200);
    normalize([x]);
    for (let i = 0; i < n; i++) x[i] = saturate(x[i] as number, 1.6);
    return [normalize([shape(x, sr, arEnv(0.002, 0, 1e3, d))])[0] as Float32Array];
  },
  /**
   * P3's sweep tell (review r13: "unlike eating"): nothing wet and nothing low. Its claws raked back over the stone,
   * scratch after scratch coming faster (110 -> 30 ms apart, each a bright rasp 1.6-4.2 kHz), under a hiss drawn in
   * through its teeth rising (a band 1.8 -> 4.6 kHz) and swelling to the end: danger, held, about to fall. 0.8 s.
   */
  sweepTell(sr, r) {
    const d = 0.8;
    const n = len(sr, d + 0.08);
    const x = new Float32Array(n);
    let t = 0.01;
    while (t < d) {
      const k = t / d;
      const g = white(len(sr, 0.04), r);
      const f = 1600 + 2600 * r() * (0.5 + 0.5 * k);
      biquad(g, sr, 'bandpass', f, 3);
      shape(g, sr, arEnv(0.002, 0.008, 0.01, 0.04));
      mixInto(x, g, (0.35 + 0.65 * k) * (0.7 + 0.3 * r()), at(sr, t));
      t += exp(0.11, 0.03, k) * (0.8 + 0.4 * r());
    }
    const hiss = pink(n, r);
    biquad(hiss, sr, 'bandpass', (i) => exp(1800, 4600, i / sr / d), 2);
    biquad(hiss, sr, 'lowpass', 6500);
    shape(hiss, sr, (tt) => (tt < d ? (tt / d) ** 1.6 : Math.max(0, 1 - (tt - d) / 0.06)));
    normalize([x]);
    normalize([hiss], 0.6);
    mixInto(x, hiss);
    biquad(x, sr, 'lowpass', 6500);
    return [normalize([x])[0] as Float32Array];
  },
  /**
   * A root snapping in the roof (the escape's rock tells and the collapse): a dry crack (a click and a wood body,
   * modes 230 / 540 / 1.1 kHz with a little give), splinters after it, and grit loosening. 0.6 s.
   */
  rootSnap(sr, r) {
    const d = 0.6;
    const n = len(sr, d);
    const x = new Float32Array(n);
    const f = 210 + 60 * r();
    modes(
      x,
      sr,
      [
        { f, tau: 0.05, amp: 1, ph: r() },
        { f: f * 2.37, tau: 0.03, amp: 0.7, ph: r() },
        { f: f * 4.9, tau: 0.012, amp: 0.4, ph: r() },
      ],
      0,
      0.0006,
    );
    const crack = white(len(sr, 0.03), r);
    biquad(crack, sr, 'highpass', 900);
    biquad(crack, sr, 'lowpass', 6000);
    shape(crack, sr, arEnv(0.0005, 0.002, 0.005, 0.03));
    mixInto(x, normalize([crack], 0.9)[0] as Float32Array);
    for (let g = 0; g < 9; g++) {
      const t = 0.02 + 0.2 * r() ** 1.5;
      modes(x, sr, [{ f: 700 + 1800 * r(), tau: 0.006, amp: 0.3 * r(), ph: r() }], at(sr, t), 0.0004);
    }
    const sift = pink(n, r);
    biquad(sift, sr, 'bandpass', 1100, 0.9);
    shape(sift, sr, (t) => Math.max(0, Math.min(1, (t - 0.05) / 0.1)) * Math.exp(-t / 0.25) * 0.25);
    mixInto(x, sift);
    biquad(x, sr, 'lowpass', 6500);
    for (let i = 0; i < n; i++) x[i] = saturate(x[i] as number, 1.3);
    return [normalize([shape(x, sr, arEnv(0.0005, 0, 1e3, d))])[0] as Float32Array];
  },
  /**
   * A rock landing (the escape): stone, not wood or shell. A heavy low body (52-140 Hz), stone knocks (inharmonic
   * 380-1200 Hz, short), a spray of gravel bunched at the front and the dust after it. 1.3 s.
   */
  rockLand(sr, r) {
    const d = 1.3;
    const n = len(sr, d);
    const x = new Float32Array(n);
    modes(x, sr, [
      { f: 52 + r() * 6, tau: 0.16, amp: 1, ph: r() },
      { f: 88 + r() * 8, tau: 0.11, amp: 0.7, ph: r() },
      { f: 141 + r() * 12, tau: 0.06, amp: 0.45, ph: r() },
    ]);
    const knock = new Float32Array(n);
    for (const ratio of [1, 1.58, 2.31, 3.06]) {
      const f = (380 + 120 * r()) * ratio;
      modes(knock, sr, [{ f, tau: 0.018 / Math.sqrt(ratio), amp: 0.5 / ratio ** 0.4, ph: r() }], 0, 0.0005);
    }
    const thumpN = white(len(sr, 0.15), r);
    biquad(thumpN, sr, 'lowpass', 260);
    biquad(thumpN, sr, 'lowpass', 260);
    shape(thumpN, sr, arEnv(0.002, 0.01, 0.04, 0.15));
    const gravel = new Float32Array(n);
    for (let g = 0; g < 46; g++) {
      const t = 0.01 + 0.8 * r() ** 2.2;
      modes(
        gravel,
        sr,
        [{ f: 600 + 2800 * r(), tau: 0.004, amp: 0.3 + 0.7 * r(), ph: r() }],
        at(sr, t),
        0.0003,
      );
    }
    const dust = pink(n, r);
    biquad(dust, sr, 'bandpass', 700, 0.7);
    shape(dust, sr, (t) => Math.min(1, t / 0.05) * Math.exp(-t / 0.45));
    normalize([x]);
    mixInto(x, normalize([knock], 0.55)[0] as Float32Array);
    mixInto(x, normalize([thumpN], 0.8)[0] as Float32Array);
    mixInto(x, normalize([gravel], 0.3)[0] as Float32Array);
    mixInto(x, normalize([dust], 0.18)[0] as Float32Array);
    biquad(x, sr, 'lowpass', 6000);
    for (let i = 0; i < n; i++) x[i] = saturate(x[i] as number, 1.5);
    return [normalize([shape(x, sr, arEnv(0.001, 0, 1e3, d))])[0] as Float32Array];
  },
  /**
   * r15, the slam's wave: the crack opening at its feet before the fronts go (`keeper.waveDelay` 12 frames). Splits in
   * the earth coming faster (45 -> 7 ms apart), each a short knock of stone and grit 300-1500 Hz over a low groan
   * swelling (60-110 Hz), louder to the end, then let go: the fronts' start is its own sound. 0.24 s.
   */
  fissure(sr, r) {
    const d = 0.24;
    const n = len(sr, d + 0.12);
    const x = new Float32Array(n);
    let t = 0.004;
    while (t < d) {
      const k = t / d;
      const g = white(len(sr, 0.03), r);
      biquad(g, sr, 'bandpass', 300 + 1200 * r(), 1.6);
      shape(g, sr, arEnv(0.001, 0.003, 0.008, 0.03));
      mixInto(x, g, (0.25 + 0.75 * k ** 1.3) * (0.6 + 0.4 * r()), at(sr, t));
      modes(x, sr, [{ f: 120 + 180 * r(), tau: 0.02, amp: 0.25 * k, ph: r() }], at(sr, t), 0.0006);
      t += exp(0.045, 0.007, k) * (0.75 + 0.5 * r());
    }
    const groan = brown(n, r);
    biquad(groan, sr, 'lowpass', (i) => exp(60, 160, i / sr / d));
    biquad(groan, sr, 'lowpass', 220);
    shape(groan, sr, (u) => (u < d ? (u / d) ** 1.5 : Math.max(0, 1 - (u - d) / 0.1)));
    normalize([x]);
    normalize([groan], 0.8);
    mixInto(x, groan);
    biquad(x, sr, 'lowpass', 5200);
    for (let i = 0; i < n; i++) x[i] = saturate(x[i] as number, 1.4);
    return [normalize([shape(x, sr, arEnv(0.002, 0, 1e3, d + 0.12))])[0] as Float32Array];
  },
  /**
   * r15: one stretch of a wave's front running along the floor (played every few frames where each front is, so it
   * travels and pans): earth grinding (brown noise through 90-260 Hz), gravel kicked up (6-10 clicks 0.6-2.6 kHz)
   * and a low shove. 0.16 s; the variants overlap into one moving grind.
   */
  waveGrit(sr, r) {
    const d = 0.16;
    const n = len(sr, d);
    const body = brown(n, r);
    biquad(body, sr, 'bandpass', 110 + 120 * r(), 0.9);
    shape(body, sr, arEnv(0.012, 0.02, 0.05, d));
    const x = new Float32Array(n);
    mixInto(x, normalize([body], 0.9)[0] as Float32Array);
    const grit = new Float32Array(n);
    const m = 6 + Math.floor(r() * 5);
    for (let g = 0; g < m; g++)
      modes(
        grit,
        sr,
        [{ f: 600 + 2000 * r(), tau: 0.004, amp: 0.4 + 0.6 * r(), ph: r() }],
        at(sr, 0.005 + 0.1 * r()),
        0.0004,
      );
    mixInto(x, normalize([grit], 0.35)[0] as Float32Array);
    modes(x, sr, [{ f: 62 + 14 * r(), tau: 0.04, amp: 0.5, ph: r() }], 0, 0.006);
    biquad(x, sr, 'lowpass', 4200);
    for (let i = 0; i < n; i++) x[i] = saturate(x[i] as number, 1.3);
    return [normalize([shape(x, sr, arEnv(0.004, 0, 1e3, d))])[0] as Float32Array];
  },
  /**
   * r15, the chase: a press pulls her onto the hook's flame. Air drawn in toward it (a pink band rising 350 Hz ->
   * 2.2 kHz and swelling over 0.26 s), then the catch: her wings snapping open on the flame (a membrane click at
   * 1.5 kHz, a short bright tear) and a low push under it. Unpitched (hers); the score plays the hook's note. 0.5 s.
   */
  hookPull(sr, r) {
    const d = 0.5;
    const pull = 0.24 + 0.04 * r();
    const n = len(sr, d);
    const air = pink(n, r);
    biquad(air, sr, 'bandpass', (i) => exp(350, 2200, i / sr / pull), 1.4);
    shape(air, sr, (u) => (u < pull ? (u / pull) ** 2.2 : Math.exp(-(u - pull) / 0.05)));
    const x = new Float32Array(n);
    mixInto(x, normalize([air], 0.7)[0] as Float32Array);
    const snap = white(len(sr, 0.06), r);
    biquad(snap, sr, 'bandpass', 1500 + 300 * r(), 2.2);
    shape(snap, sr, arEnv(0.0008, 0.004, 0.012, 0.06));
    mixInto(x, normalize([snap], 0.8)[0] as Float32Array, 1, at(sr, pull));
    const tear = pink(len(sr, 0.12), r);
    biquad(tear, sr, 'bandpass', (i) => exp(2600, 900, i / sr / 0.1), 1.2);
    shape(tear, sr, arEnv(0.003, 0.01, 0.03, 0.12));
    mixInto(x, normalize([tear], 0.45)[0] as Float32Array, 1, at(sr, pull + 0.004));
    modes(x, sr, [{ f: 88 + 10 * r(), tau: 0.05, amp: 0.55, ph: r() }], at(sr, pull), 0.004);
    biquad(x, sr, 'lowpass', 6500);
    return [normalize([shape(x, sr, arEnv(0.01, 0, 1e3, d))])[0] as Float32Array];
  },
  /**
   * r15, the kin's sit (`kinBeat try`): its torn wing lifts and trembles and cannot hold. A membrane fluttering
   * unevenly (grains 11 -> 19 a second, each a band 650 -> 1.3 kHz), swelling with the strain, twice catching where it
   * is torn (a gap, then a dry scrape), the last of it already failing. Unpitched (it never vocalises). 1.1 s.
   */
  kinTry(sr, r) {
    const d = 1.1;
    const n = len(sr, d + 0.1);
    const x = new Float32Array(n);
    const catches = [0.5 + 0.08 * r(), 0.8 + 0.06 * r()];
    let t = 0.02;
    while (t < d) {
      const k = t / d;
      const caught = catches.some((c) => t > c && t < c + 0.07);
      if (!caught) {
        const g = pink(len(sr, 0.05), r);
        biquad(g, sr, 'bandpass', exp(650, 1300, k) * (0.85 + 0.3 * r()), 2.4);
        shape(g, sr, arEnv(0.006, 0.006, 0.012, 0.05));
        const swell = k < 0.75 ? 0.3 + 0.7 * (k / 0.75) : 1 - 1.6 * (k - 0.75);
        mixInto(x, g, Math.max(0.05, swell) * (0.45 + 0.55 * r()), at(sr, t));
      }
      t += 1 / exp(11, 19, Math.min(1, k * 1.3)) + 0.012 * (r() - 0.5);
    }
    for (const c of catches) {
      const s = white(len(sr, 0.05), r);
      biquad(s, sr, 'bandpass', 1800 + 900 * r(), 3);
      shape(s, sr, arEnv(0.002, 0.008, 0.012, 0.05));
      mixInto(x, s, 0.5, at(sr, c + 0.07));
    }
    biquad(x, sr, 'lowpass', 4500);
    return [normalize([shape(x, sr, arEnv(0.02, 0, 1e3, d + 0.1))])[0] as Float32Array];
  },
};
