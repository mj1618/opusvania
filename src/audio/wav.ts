/** WAV encoding and plain level numbers for offline renders (no loudness here: tools use ffmpeg's EBU R128). */

/** 16-bit PCM WAV of the given channels (clipped to -1..1). */
export function encodeWav(chs: Float32Array[], sr: number): Uint8Array {
  const n = chs[0]?.length ?? 0;
  const c = chs.length;
  const data = n * c * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, c, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * c * 2, true);
  v.setUint16(32, c * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let k = 0; k < c; k++) {
      const s = Math.max(-1, Math.min(1, chs[k]?.[i] ?? 0));
      v.setInt16(o, Math.round(s * 32767), true);
      o += 2;
    }
  return new Uint8Array(buf);
}

export interface LevelStats {
  /** Sample peak, dBFS. */
  peakDb: number;
  /** RMS over the whole render, dBFS. */
  rmsDb: number;
  /** Samples at or past full scale. */
  clipped: number;
}

export function levelStats(chs: Float32Array[]): LevelStats {
  let p = 0;
  let s = 0;
  let n = 0;
  let clipped = 0;
  for (const c of chs)
    for (let i = 0; i < c.length; i++) {
      const v = Math.abs(c[i] as number);
      if (v > p) p = v;
      if (v >= 0.999) clipped++;
      s += v * v;
      n++;
    }
  const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -200);
  return { peakDb: db(p), rmsDb: db(Math.sqrt(s / Math.max(1, n))), clipped };
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
