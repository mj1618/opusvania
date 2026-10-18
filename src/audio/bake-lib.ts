/**
 * The shared pieces of the baked recipes (bake.ts, bake-play.ts): sizes, a pan, the soft click that
 * starts every struck thing, rubbed glass, the struck bowl, a creature's breath. Plain JS (dsp.ts).
 */
import { arEnv, biquad, type Mode, mixInto, modes, normalize, pink, shape, white } from './dsp';

export type Recipe = (sr: number, r: () => number, v: number) => Float32Array[];

export const len = (sr: number, s: number) => Math.max(1, Math.round(s * sr));
export const at = (sr: number, s: number) => Math.round(s * sr);
export const exp = (a: number, b: number, k: number) => a * (b / a) ** Math.min(1, Math.max(0, k));

/** Equal-power pan of a mono signal into two new channels. */
export function panned(x: Float32Array, pan: number): Float32Array[] {
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
export function click(sr: number, r: () => number, n: number, hz: number, tau: number): Float32Array {
  const x = white(n, r);
  biquad(x, sr, 'lowpass', hz);
  return shape(x, sr, arEnv(0.0006, 0, tau, Math.min(n / sr, tau * 8)));
}

/** A rubbed, noise-excited tone: very narrow band-passed noise with a little of its pure partial. */
export function rubbed(
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
export const swell = (a: number, tau: number, end: number) => arEnv(a, 0, tau, end);

/** A struck bowl: inharmonic partials in beating pairs, felt mallet (soft attack, dull highs). */
export function bowl(
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
export function breath(
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
