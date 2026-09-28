/** WAV encoding and level statistics for offline renders (pure; runs in the browser and Node). */

export interface LevelStats {
  /** Max absolute sample value over all channels (1.0 = 0 dBFS). */
  peak: number;
  peakDb: number;
  /** RMS over the whole clip, all channels. */
  rms: number;
  rmsDb: number;
  /** Loudest RMS over any 50ms window (a rough loudness proxy that ignores silence). */
  maxWindowRmsDb: number;
  /** Samples at or beyond ±0.999. */
  clipped: number;
  /** Peak below -60 dBFS. */
  silent: boolean;
}

export const toDb = (v: number): number => (v > 0 ? 20 * Math.log10(v) : Number.NEGATIVE_INFINITY);

export function levelStats(channels: Float32Array[], sampleRate: number): LevelStats {
  let peak = 0;
  let sum = 0;
  let n = 0;
  let clipped = 0;
  const win = Math.max(1, Math.round(sampleRate * 0.05));
  const len = channels[0]?.length ?? 0;
  let maxWin = 0;
  for (let start = 0; start < len; start += win) {
    let ws = 0;
    let wn = 0;
    for (const ch of channels) {
      const end = Math.min(len, start + win);
      for (let i = start; i < end; i++) {
        const v = ch[i] ?? 0;
        const a = Math.abs(v);
        if (a > peak) peak = a;
        if (a >= 0.999) clipped++;
        ws += v * v;
        wn++;
      }
    }
    sum += ws;
    n += wn;
    if (wn > 0) maxWin = Math.max(maxWin, Math.sqrt(ws / wn));
  }
  const rms = n > 0 ? Math.sqrt(sum / n) : 0;
  return {
    peak,
    peakDb: toDb(peak),
    rms,
    rmsDb: toDb(rms),
    maxWindowRmsDb: toDb(maxWin),
    clipped,
    silent: peak < 0.001,
  };
}

/** 16-bit PCM WAV of interleaved channels. Samples are clamped to ±1. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const nch = channels.length;
  const len = channels[0]?.length ?? 0;
  const dataBytes = len * nch * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nch * 2, true);
  v.setUint16(32, nch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (const ch of channels) {
      const s = Math.max(-1, Math.min(1, ch[i] ?? 0));
      v.setInt16(o, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}
