/**
 * Noise-colour generators (pure; no Web Audio). The engine turns these into looping AudioBuffers.
 *
 * Tallage's sound classes: brown = heavy/low, pink = balanced/creaky, blue/violet = hissy/light,
 * white = static (unclaimable).
 */
export const NOISE_COLOURS = ['white', 'pink', 'brown', 'blue', 'violet'] as const;
export type NoiseColour = (typeof NOISE_COLOURS)[number];

/** Raw (un-normalised) noise of the given colour. `rand` returns [0, 1). */
function raw(colour: NoiseColour, n: number, rand: () => number): Float32Array {
  const out = new Float32Array(n);
  const white = () => rand() * 2 - 1;
  switch (colour) {
    case 'white':
      for (let i = 0; i < n; i++) out[i] = white();
      return out;
    case 'pink': {
      // Paul Kellet's refined pink filter (-3 dB/octave).
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = white();
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
      }
      return out;
    }
    case 'brown': {
      // Leaky integrator (-6 dB/octave). The leak keeps it from drifting.
      let last = 0;
      for (let i = 0; i < n; i++) {
        last = (last + 0.02 * white()) / 1.02;
        out[i] = last;
      }
      return out;
    }
    case 'blue': {
      // Differentiated pink (+3 dB/octave).
      const pink = raw('pink', n + 1, rand);
      for (let i = 0; i < n; i++) out[i] = (pink[i + 1] ?? 0) - (pink[i] ?? 0);
      return out;
    }
    case 'violet': {
      // Differentiated white (+6 dB/octave).
      let prev = white();
      for (let i = 0; i < n; i++) {
        const w = white();
        out[i] = w - prev;
        prev = w;
      }
      return out;
    }
  }
}

/**
 * Seamlessly looping noise of `length` samples, scaled to the target RMS and hard-limited to ±1.
 * The first `fade` samples are equal-power crossfaded with the samples that follow the loop end,
 * so the loop point is continuous even for brown noise.
 */
export function makeNoise(
  colour: NoiseColour,
  length: number,
  rand: () => number = Math.random,
  { rms = 0.2, fade = 2048 } = {},
): Float32Array {
  const f = Math.min(fade, Math.floor(length / 4));
  const src = raw(colour, length + f, rand);
  const out = src.slice(0, length);
  for (let i = 0; i < f; i++) {
    const w = i / f;
    const a = Math.sin((w * Math.PI) / 2);
    const b = Math.cos((w * Math.PI) / 2);
    out[i] = (src[i] ?? 0) * a + (src[length + i] ?? 0) * b;
  }
  let sum = 0;
  for (let i = 0; i < length; i++) sum += (out[i] ?? 0) ** 2;
  const k = sum > 0 ? rms / Math.sqrt(sum / length) : 0;
  for (let i = 0; i < length; i++) out[i] = Math.max(-1, Math.min(1, (out[i] ?? 0) * k));
  return out;
}

/**
 * Ratio of first-difference energy to signal energy. A cheap spectral-tilt measure:
 * about 2 for white, lower for darker colours, higher for brighter ones.
 */
export function brightness(x: Float32Array): number {
  let e = 0;
  let d = 0;
  for (let i = 1; i < x.length; i++) {
    const a = x[i] ?? 0;
    const b = x[i - 1] ?? 0;
    e += a * a;
    d += (a - b) ** 2;
  }
  return e > 0 ? d / e : 0;
}
