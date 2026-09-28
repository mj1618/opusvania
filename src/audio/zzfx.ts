/**
 * ZzFX sample generator, vendored and ported to TypeScript (see memory/audio.md for why).
 *
 * ZzFX - Zuper Zmall Zound Zynth, by Frank Force. MIT License.
 * Copyright (c) 2019 Frank Force. https://github.com/KilledByAPixel/ZzFX
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions: The above copyright notice
 * and this permission notice shall be included in all copies or substantial portions of the
 * Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 *
 * Changes from upstream: named parameters instead of a positional array, the sample rate is a
 * parameter (so buffers match the AudioContext rate), the RNG is injected (the `randomness`
 * pitch jitter), output is a Float32Array, and there is no playback code.
 * The algorithm is otherwise upstream's `buildSamples`.
 */

export interface ZzfxParams {
  /** Linear volume scale. */
  volume: number;
  /** Random pitch jitter, as a fraction of frequency (applied once per build). */
  randomness: number;
  /** Base frequency in Hz. */
  frequency: number;
  /** Seconds. */
  attack: number;
  sustain: number;
  release: number;
  /** 0 sin, 1 triangle, 2 saw, 3 tan (square-ish), 4 noise. */
  shape: number;
  /** Power applied to the waveform; >1 thins it, <1 fattens it. */
  shapeCurve: number;
  /** Pitch slide, roughly Hz per 2ms (slide 10 is about +5000 Hz/s at 44.1kHz). */
  slide: number;
  /** Change in slide over time. */
  deltaSlide: number;
  /** Hz added once after `pitchJumpTime` seconds (arpeggio / chirp). */
  pitchJump: number;
  pitchJumpTime: number;
  /** Seconds between resets of pitch/slide (and tremolo period). */
  repeatTime: number;
  /** Noise amount mixed into the phase. */
  noise: number;
  /** Frequency-modulation rate. */
  modulation: number;
  /** Sample-and-hold amount (0..1ish). */
  bitCrush: number;
  /** Echo delay in seconds. */
  delay: number;
  sustainVolume: number;
  decay: number;
  tremolo: number;
  /** Biquad cutoff in Hz: positive is high-pass, negative is low-pass, 0 is off. */
  filter: number;
}

export const ZZFX_DEFAULTS: ZzfxParams = {
  volume: 1,
  randomness: 0.05,
  frequency: 220,
  attack: 0,
  sustain: 0,
  release: 0.1,
  shape: 0,
  shapeCurve: 1,
  slide: 0,
  deltaSlide: 0,
  pitchJump: 0,
  pitchJumpTime: 0,
  repeatTime: 0,
  noise: 0,
  modulation: 0,
  bitCrush: 0,
  delay: 0,
  sustainVolume: 1,
  decay: 0,
  tremolo: 0,
  filter: 0,
};

/** Upstream's global volume (zzfxV). */
export const ZZFX_MASTER = 0.3;

/** Builds one ZzFX sound as mono samples at `sampleRate`. `rand` returns [0, 1). */
export function zzfxBuild(
  partial: Partial<ZzfxParams>,
  sampleRate = 44100,
  rand: () => number = Math.random,
): Float32Array {
  const p = { ...ZZFX_DEFAULTS, ...partial };
  const PI2 = Math.PI * 2;
  const sr = sampleRate;
  const sign = (v: number) => (v < 0 ? -1 : 1);

  let slide = (p.slide * 500 * PI2) / sr / sr;
  const startSlide = slide;
  let frequency = (p.frequency * (1 + p.randomness * 2 * rand() - p.randomness) * PI2) / sr;
  let startFrequency = frequency;

  // Biquad LP/HP filter.
  const quality = 2;
  const w = (PI2 * Math.abs(p.filter) * 2) / sr;
  const cosW = Math.cos(w);
  const alpha = Math.sin(w) / 2 / quality;
  const a0 = 1 + alpha;
  const a1 = (-2 * cosW) / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = (1 + sign(p.filter) * cosW) / 2 / a0;
  const b1 = -(sign(p.filter) + cosW) / a0;
  const b2 = b0;
  let x2 = 0;
  let x1 = 0;
  let y2 = 0;
  let y1 = 0;

  const attack = p.attack * sr + 9; // minimum attack to prevent a pop
  const decay = p.decay * sr;
  const sustain = p.sustain * sr;
  const release = p.release * sr;
  const delay = p.delay * sr;
  const deltaSlide = (p.deltaSlide * 500 * PI2) / sr ** 3;
  const modulation = (p.modulation * PI2) / sr;
  const pitchJump = (p.pitchJump * PI2) / sr;
  const pitchJumpTime = p.pitchJumpTime * sr;
  const repeatTime = (p.repeatTime * sr) | 0;
  const volume = p.volume * ZZFX_MASTER;
  const crushEvery = (p.bitCrush * 100) | 0;

  const length = (attack + decay + sustain + release + delay) | 0;
  const b = new Float32Array(Math.max(0, length));
  let t = 0;
  let tm = 0;
  let j = 1;
  let r = 0;
  let c = 0;
  let s = 0;

  for (let i = 0; i < length; i++) {
    if (!(++c % crushEvery)) {
      const sh = p.shape;
      s =
        sh > 3
          ? Math.sin(t ** 3) // noise
          : sh > 2
            ? Math.max(Math.min(Math.tan(t), 1), -1) // tan
            : sh > 1
              ? 1 - (((((2 * t) / PI2) % 2) + 2) % 2) // saw
              : sh > 0
                ? 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2) // triangle
                : Math.sin(t); // sin

      s =
        (repeatTime ? 1 - p.tremolo + p.tremolo * Math.sin((PI2 * i) / repeatTime) : 1) *
        sign(s) *
        Math.abs(s) ** p.shapeCurve *
        (i < attack
          ? i / attack
          : i < attack + decay
            ? 1 - ((i - attack) / decay) * (1 - p.sustainVolume)
            : i < attack + decay + sustain
              ? p.sustainVolume
              : i < length - delay
                ? ((length - i - delay) / release) * p.sustainVolume
                : 0);

      if (delay) {
        const back = b[(i - delay) | 0] ?? 0;
        s = s / 2 + (delay > i ? 0 : ((i < length - delay ? 1 : (length - i) / delay) * back) / 2 / volume);
      }

      if (p.filter) {
        const x0 = s;
        s = b2 * x2 + b1 * x1 + b0 * x0 - a2 * y2 - a1 * y1;
        x2 = x1;
        x1 = x0;
        y2 = y1;
        y1 = s;
      }
    }

    slide += deltaSlide;
    frequency += slide;
    const f = frequency * Math.cos(modulation * tm++);
    t += f - f * p.noise * (1 - (((Math.sin(i) + 1) * 1e9) % 2));

    if (j && ++j > pitchJumpTime) {
      frequency += pitchJump;
      startFrequency += pitchJump;
      j = 0;
    }

    if (repeatTime && !(++r % repeatTime)) {
      frequency = startFrequency;
      slide = startSlide;
      j = j || 1;
    }

    b[i] = s * volume;
  }
  return b;
}
