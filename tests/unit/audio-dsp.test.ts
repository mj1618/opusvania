import { describe, expect, it } from 'vitest';
import { audioData } from '../../src/audio/data';
import { barIndexAt, barSeconds, type Meter, nextBarTime, stepsInWindow } from '../../src/audio/music-clock';
import { brightness, makeNoise, NOISE_COLOURS } from '../../src/audio/noise';
import { spatialGain, spatialize, spatialPan } from '../../src/audio/spatial';
import { encodeWav, levelStats } from '../../src/audio/wav';
import { zzfxBuild } from '../../src/audio/zzfx';

/** Seeded RNG for repeatable noise in tests (audio itself uses Math.random at runtime). */
function lcg(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('music clock (bar quantisation)', () => {
  const m: Meter = { bpm: 120, beatsPerBar: 4, stepsPerBeat: 4 };

  it('computes bar length', () => {
    expect(barSeconds(m)).toBe(2);
  });

  it('quantises to the next bar line', () => {
    expect(nextBarTime(10, 10, m)).toBe(10);
    expect(nextBarTime(10.001, 10, m)).toBe(12);
    expect(nextBarTime(11.99, 10, m)).toBe(12);
    expect(nextBarTime(12, 10, m)).toBe(12);
    expect(nextBarTime(3, 10, m)).toBe(10);
  });

  it('rolls to the following bar when the lead time is too short', () => {
    expect(nextBarTime(11.95, 10, m, 0.1)).toBe(14);
    expect(nextBarTime(11.8, 10, m, 0.1)).toBe(12);
  });

  it('indexes bars, including exactly on a bar line', () => {
    expect(barIndexAt(10, 10, m)).toBe(0);
    expect(barIndexAt(11.99, 10, m)).toBe(0);
    expect(barIndexAt(12, 10, m)).toBe(1);
    expect(barIndexAt(10 + 2 * 7, 10, m)).toBe(7);
    // Floating-point bar lines (92 bpm) still land on the right bar.
    const odd: Meter = { bpm: 92, beatsPerBar: 4, stepsPerBeat: 4 };
    expect(barIndexAt(nextBarTime(5, 0.05, odd), 0.05, odd)).toBe(Math.ceil((5 - 0.05) / barSeconds(odd)));
  });

  it('schedules every step exactly once across arbitrary lookahead windows', () => {
    const origin = 0.37;
    const rand = lcg(7);
    const seen: number[] = [];
    let t = 0;
    while (t < 20) {
      const next = t + 0.01 + rand() * 0.3;
      for (const s of stepsInWindow(t, next, origin, m)) {
        expect(s.time).toBeGreaterThanOrEqual(t - 1e-9);
        expect(s.time).toBeLessThan(next);
        seen.push(s.index);
      }
      t = next;
    }
    const expected = Math.ceil((t - origin) / 0.125 - 1e-9);
    expect(seen).toEqual([...Array(expected).keys()]);
  });
});

describe('spatial', () => {
  const p = audioData().mix.spatial;
  const L = { x: 1000, y: 500 };

  it('is centred and full volume at the listener', () => {
    expect(spatialize(L, L, p)).toEqual({ pan: 0, gain: 1 });
  });

  it('pans left/right and clamps at panMax', () => {
    expect(spatialPan({ x: L.x - 300, y: L.y }, L, p)).toBeLessThan(0);
    expect(spatialPan({ x: L.x + 300, y: L.y }, L, p)).toBeGreaterThan(0);
    expect(spatialPan({ x: L.x + 99999, y: L.y }, L, p)).toBeCloseTo(p.panMax);
  });

  it('attenuates monotonically with distance and is silent past maxDist', () => {
    let last = 1;
    for (let d = 0; d <= p.maxDistPx + 100; d += 50) {
      const g = spatialGain({ x: L.x, y: L.y + d }, L, p);
      expect(g).toBeLessThanOrEqual(last + 1e-12);
      expect(g).toBeGreaterThanOrEqual(0);
      last = g;
    }
    expect(spatialGain({ x: L.x + p.maxDistPx, y: L.y }, L, p)).toBe(0);
  });
});

describe('noise colours', () => {
  const n = 48000;
  const noises = Object.fromEntries(NOISE_COLOURS.map((c) => [c, makeNoise(c, n, lcg(3))]));

  it('orders colours by spectral tilt: brown < pink < white < blue < violet', () => {
    const b = (c: string) => brightness(noises[c] as Float32Array);
    expect(b('brown')).toBeLessThan(b('pink'));
    expect(b('pink')).toBeLessThan(b('white'));
    expect(b('white')).toBeLessThan(b('blue'));
    expect(b('blue')).toBeLessThan(b('violet'));
  });

  it('is normalised to the target RMS and stays within ±1', () => {
    for (const c of NOISE_COLOURS) {
      const x = noises[c] as Float32Array;
      const s = levelStats([x], 48000);
      expect(s.rms).toBeGreaterThan(0.17);
      expect(s.rms).toBeLessThan(0.21);
      expect(s.peak).toBeLessThanOrEqual(1);
    }
  });

  it('loops seamlessly (the wrap step is no bigger than a typical step)', () => {
    for (const c of ['brown', 'pink'] as const) {
      const x = noises[c] as Float32Array;
      let mean = 0;
      for (let i = 1; i < x.length; i++) mean += Math.abs((x[i] ?? 0) - (x[i - 1] ?? 0));
      mean /= x.length - 1;
      const wrap = Math.abs((x[0] ?? 0) - (x[x.length - 1] ?? 0));
      expect(wrap).toBeLessThan(mean * 6);
    }
  });
});

describe('zzfx port', () => {
  it('produces the expected length and is deterministic for a fixed rng', () => {
    const p = { frequency: 440, attack: 0.01, sustain: 0.05, release: 0.1 };
    const a = zzfxBuild(p, 48000, () => 0.5);
    const b = zzfxBuild(p, 48000, () => 0.5);
    expect(a.length).toBe(Math.floor((0.01 + 0.05 + 0.1) * 48000 + 9));
    expect(a).toEqual(b);
  });

  it('a negative filter is a low-pass (darker output)', () => {
    const noise = { shape: 4, frequency: 2000, sustain: 0.2, release: 0.01 };
    const dry = zzfxBuild(noise, 48000, () => 0.5);
    const lp = zzfxBuild({ ...noise, filter: -800 }, 48000, () => 0.5);
    expect(brightness(lp)).toBeLessThan(brightness(dry) * 0.5);
  });

  it('every sfx.json sound renders audible and unclipped samples', () => {
    for (const [name, def] of Object.entries(audioData().sfx.sounds)) {
      const layers = def.layers.map((l) => zzfxBuild(l, 44100, () => 0.5));
      const len = Math.max(...layers.map((l) => l.length));
      const mix = new Float32Array(len);
      for (const l of layers) for (let i = 0; i < l.length; i++) mix[i] = (mix[i] ?? 0) + (l[i] ?? 0);
      const s = levelStats([mix], 44100);
      expect(s.silent, name).toBe(false);
      expect(s.peak, name).toBeLessThan(1);
    }
  });
});

describe('wav + level stats', () => {
  it('encodes a valid 16-bit stereo WAV header', () => {
    const ch = new Float32Array([0, 0.5, -0.5, 1]);
    const wav = encodeWav([ch, ch], 48000);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(wav.length).toBe(44 + 4 * 2 * 2);
    expect(v.getInt16(44 + 4, true)).toBe(Math.round(0.5 * 0x7fff));
  });

  it('reports peak, clipping and silence', () => {
    const s = levelStats([new Float32Array([0, 0.5, -1.2, 0.1])], 48000);
    expect(s.peak).toBeCloseTo(1.2);
    expect(s.clipped).toBe(1);
    expect(s.silent).toBe(false);
    expect(levelStats([new Float32Array(100)], 48000).silent).toBe(true);
  });
});
