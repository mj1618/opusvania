/**
 * Plain-JS DSP for baking one-shots into sample arrays (bake.ts). No Web Audio here, so it runs in
 * Vitest and in an idle callback alike. Everything random comes from a seeded stream: the same seed
 * always bakes the same samples.
 */

/** mulberry32: a float in [0, 1) per call. */
export function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A stateless hash of a few integers to [0, 1): the generative parts key their dice by sim frame
 * and salt with this, so a tape always gives the same audio whatever was routed before it.
 */
export function hash01(...keys: number[]): number {
  let h = 0x811c9dc5;
  for (const k of keys) {
    h = Math.imul(h ^ (k | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** A string to a 32-bit salt for hash01. */
export function salt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const dbToGain = (db: number): number => 10 ** (db / 20);
export const centsToRatio = (c: number): number => 2 ** (c / 1200);

/** White noise in [-1, 1). */
export function white(n: number, r: () => number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

/** Pink-ish noise (Paul Kellet's economy filter), about unit RMS / 4. */
export function pink(n: number, r: () => number): Float32Array {
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
  return out;
}

/** Brown noise: leaky integrated white, DC-blocked. */
export function brown(n: number, r: () => number): Float32Array {
  const out = new Float32Array(n);
  let b = 0;
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < n; i++) {
    b = (b + 0.02 * (r() * 2 - 1)) * 0.997;
    // One-pole DC blocker.
    const y = b - prevIn + 0.9995 * prevOut;
    prevIn = b;
    prevOut = y;
    out[i] = y * 3.5;
  }
  return out;
}

export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass';

/**
 * RBJ biquad over `x` in place. `f` and `q` may be numbers or functions of the sample index
 * (coefficients are then recomputed every 16 samples: a sweep).
 */
export function biquad(
  x: Float32Array,
  sr: number,
  kind: BiquadKind,
  f: number | ((i: number) => number),
  q: number | ((i: number) => number) = Math.SQRT1_2,
): Float32Array {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let a1 = 0;
  let a2 = 0;
  const coeffs = (i: number) => {
    const fc = Math.min(sr * 0.45, Math.max(10, typeof f === 'number' ? f : f(i)));
    const qq = Math.max(0.05, typeof q === 'number' ? q : q(i));
    const w = (2 * Math.PI * fc) / sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * qq);
    const a0 = 1 + alpha;
    if (kind === 'lowpass') {
      b0 = (1 - cw) / 2 / a0;
      b1 = (1 - cw) / a0;
      b2 = b0;
    } else if (kind === 'highpass') {
      b0 = (1 + cw) / 2 / a0;
      b1 = -(1 + cw) / a0;
      b2 = b0;
    } else {
      // Constant 0 dB peak gain.
      b0 = alpha / a0;
      b1 = 0;
      b2 = -alpha / a0;
    }
    a1 = (-2 * cw) / a0;
    a2 = (1 - alpha) / a0;
  };
  const varying = typeof f !== 'number' || typeof q !== 'number';
  coeffs(0);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (varying && (i & 15) === 0) coeffs(i);
    const xi = x[i] as number;
    const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

/** Multiplies `x` by env(t seconds) in place. */
export function shape(x: Float32Array, sr: number, env: (t: number) => number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] = (x[i] as number) * env(i / sr);
  return x;
}

/**
 * The usual envelope: a raised-cosine attack of `a` s, a hold of `h` s, then an exponential decay
 * with time constant `tau`, and a short raised-cosine tail to exactly zero at `len` s (no click).
 */
export function arEnv(a: number, h: number, tau: number, len: number): (t: number) => number {
  const tail = Math.min(0.03, len * 0.2);
  return (t) => {
    if (t >= len) return 0;
    let v: number;
    if (t < a) v = 0.5 - 0.5 * Math.cos((Math.PI * t) / a);
    else if (t < a + h) v = 1;
    else v = Math.exp(-(t - a - h) / tau);
    if (t > len - tail) v *= 0.5 + 0.5 * Math.cos((Math.PI * (t - (len - tail))) / tail);
    return v;
  };
}

/** One mode of a struck resonator: frequency, decay time constant (s), amplitude, and beat partner. */
export interface Mode {
  f: number;
  tau: number;
  amp: number;
  /** A second mode this many Hz above, at the same amplitude: the slow warble of a bowl. */
  beat?: number;
  /** Phase 0..1. */
  ph?: number;
}

/**
 * A modal resonator bank added into `out` from sample `at`: each mode a decaying sinusoid computed
 * by complex rotation (cheap, exact). `attack` s of raised-cosine onset so even a strike has no
 * click: noise in the attack comes from the recipe, not from a step.
 */
export function modes(
  out: Float32Array,
  sr: number,
  list: readonly Mode[],
  at = 0,
  attack = 0.002,
): Float32Array {
  const na = Math.max(1, Math.round(attack * sr));
  for (const m of list) {
    for (const f of m.beat ? [m.f, m.f + m.beat] : [m.f]) {
      if (f >= sr * 0.45) continue;
      const w = (2 * Math.PI * f) / sr;
      const dec = Math.exp(-1 / (m.tau * sr));
      const cr = Math.cos(w) * dec;
      const ci = Math.sin(w) * dec;
      const ph = (m.ph ?? 0) * 2 * Math.PI;
      let re = Math.cos(ph) * m.amp * (m.beat ? 0.5 : 1);
      let im = Math.sin(ph) * m.amp * (m.beat ? 0.5 : 1);
      const end = Math.min(out.length, at + Math.ceil(m.tau * sr * 9));
      for (let i = at; i < end; i++) {
        const k = i - at;
        const e = k < na ? 0.5 - 0.5 * Math.cos((Math.PI * k) / na) : 1;
        out[i] = (out[i] as number) + im * e;
        const nr = re * cr - im * ci;
        im = re * ci + im * cr;
        re = nr;
      }
    }
  }
  return out;
}

/** out += src * g, from `at`. */
export function mixInto(out: Float32Array, src: Float32Array, g = 1, at = 0): Float32Array {
  const n = Math.min(src.length, out.length - at);
  for (let i = 0; i < n; i++) out[at + i] = (out[at + i] as number) + (src[i] as number) * g;
  return out;
}

export function peak(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i] as number));
  return p;
}

export function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] as number) ** 2;
  return Math.sqrt(s / Math.max(1, x.length));
}

/** Scales channels together so their joint peak is `to`. */
export function normalize(chs: Float32Array[], to = 0.9): Float32Array[] {
  const p = Math.max(1e-9, ...chs.map(peak));
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] = ((c[i] as number) / p) * to;
  return chs;
}

/** Fades a loop's end into its start so it repeats with no seam: returns `len` samples from len + xf. */
export function seamless(x: Float32Array, len: number, xf: number): Float32Array {
  const out = x.slice(0, len);
  for (let i = 0; i < xf; i++) {
    const t = i / xf;
    // Equal-power crossfade of the overhang onto the head.
    out[i] =
      (x[len + i] as number) * Math.cos((t * Math.PI) / 2) + (out[i] as number) * Math.sin((t * Math.PI) / 2);
  }
  return out;
}

/** Soft saturation: tanh with a little asymmetry for even harmonics. */
export function saturate(v: number, drive: number): number {
  return Math.tanh(drive * v + 0.15 * drive * v * v) / Math.tanh(drive);
}
