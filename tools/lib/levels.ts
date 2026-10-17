/**
 * Listening by numbers (agents can't hear): loudness, peaks and spectral balance of a WAV.
 * Integrated loudness, loudness range and true peak come from ffmpeg's EBU R128 meter; the rest
 * is measured here: sample peak, clipped samples, the spectral centroid of the sound (frames above
 * -60 dBFS only, so silence does not pull it down) and the share of energy in the bands that make
 * a mix harsh (2-4 kHz) or hissy (above 9 kHz).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export interface Levels {
  lufs: number;
  lra: number;
  truePeakDb: number;
  peakDb: number;
  clipped: number;
  centroidHz: number;
  /** Share of the energy (0..1) below 150 Hz, 2-4 kHz, 4-9 kHz and above 9 kHz. */
  bands: { low: number; presence: number; high: number; air: number };
  seconds: number;
}

const ffmpegBin = () => (existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg');

/** Reads a 16-bit PCM WAV into float channels. */
export function readWav(path: string): { sr: number; chs: Float32Array[] } {
  const b = readFileSync(path);
  const c = b.readUInt16LE(22);
  const sr = b.readUInt32LE(24);
  let o = 12;
  while (o < b.length - 8 && b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4);
  const n = b.readUInt32LE(o + 4) / (2 * c);
  o += 8;
  const chs = Array.from({ length: c }, () => new Float32Array(n));
  for (let i = 0; i < n; i++)
    for (let k = 0; k < c; k++) (chs[k] as Float32Array)[i] = b.readInt16LE(o + (i * c + k) * 2) / 32768;
  return { sr, chs };
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    const wr = Math.cos(a);
    const wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const p = i + j;
        const q = p + len / 2;
        const tr = (re[q] as number) * cr - (im[q] as number) * ci;
        const ti = (re[q] as number) * ci + (im[q] as number) * cr;
        re[q] = (re[p] as number) - tr;
        im[q] = (im[p] as number) - ti;
        re[p] = (re[p] as number) + tr;
        im[p] = (im[p] as number) + ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Spectral centroid and band shares over the frames that are not silence. */
export function spectrum(chs: Float32Array[], sr: number): Pick<Levels, 'centroidHz' | 'bands'> {
  const N = 4096;
  const mono = new Float64Array(chs[0]?.length ?? 0);
  for (const c of chs)
    for (let i = 0; i < mono.length; i++) mono[i] = (mono[i] as number) + (c[i] as number) / chs.length;
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const bin = sr / N;
  let wsum = 0;
  let fsum = 0;
  const band = { low: 0, presence: 0, high: 0, air: 0 };
  let total = 0;
  for (let s = 0; s + N <= mono.length; s += N / 2) {
    let e = 0;
    for (let i = 0; i < N; i++) e += (mono[s + i] as number) ** 2;
    if (Math.sqrt(e / N) < 0.001) continue;
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (mono[s + i] as number) * (win[i] as number);
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const p = (re[k] as number) ** 2 + (im[k] as number) ** 2;
      const f = k * bin;
      wsum += p;
      fsum += p * f;
      total += p;
      if (f < 150) band.low += p;
      else if (f >= 2000 && f < 4000) band.presence += p;
      else if (f >= 4000 && f < 9000) band.high += p;
      else if (f >= 9000) band.air += p;
    }
  }
  const t = Math.max(1e-30, total);
  return {
    centroidHz: wsum > 0 ? fsum / wsum : 0,
    bands: { low: band.low / t, presence: band.presence / t, high: band.high / t, air: band.air / t },
  };
}

/** Everything in `Levels` for a WAV file. */
export function measure(path: string): Levels {
  const r = spawnSync(
    ffmpegBin(),
    ['-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    {
      encoding: 'utf8',
    },
  );
  const log = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const num = (re: RegExp) => Number(summary.match(re)?.[1] ?? Number.NaN);
  const { sr, chs } = readWav(path);
  let peak = 0;
  let clipped = 0;
  for (const c of chs)
    for (const v of c) {
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
    }
  return {
    lufs: num(/I:\s+(-?[\d.]+) LUFS/),
    lra: num(/LRA:\s+(-?[\d.]+) LU/),
    truePeakDb: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/),
    peakDb: 20 * Math.log10(Math.max(1e-9, peak)),
    clipped,
    ...spectrum(chs, sr),
    seconds: (chs[0]?.length ?? 0) / sr,
  };
}

export function formatLevels(l: Levels): string {
  const pc = (v: number) => `${(v * 100).toFixed(1)}%`;
  return [
    `integrated ${l.lufs.toFixed(1)} LUFS, range ${l.lra.toFixed(1)} LU`,
    `true peak ${l.truePeakDb.toFixed(1)} dBTP, sample peak ${l.peakDb.toFixed(1)} dBFS, clipped samples ${l.clipped}`,
    `spectral centroid ${l.centroidHz.toFixed(0)} Hz; energy <150 Hz ${pc(l.bands.low)}, 2-4 kHz ${pc(l.bands.presence)}, 4-9 kHz ${pc(l.bands.high)}, >9 kHz ${pc(l.bands.air)}`,
  ].join('\n');
}
