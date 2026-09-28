import { AudioEngine } from './engine';
import { buildScenarios, type Scenario } from './scenarios';
import { encodeWav, type LevelStats, levelStats } from './wav';

/**
 * Renders scenarios faster than real time with OfflineAudioContext (browser only). Timed actions
 * and the engine's scheduler tick run inside `ctx.suspend(t)` callbacks, so the engine sees
 * `currentTime` advance exactly as it would live. Used by tools/audio-render.ts and the e2e test.
 */

export interface OfflineResult {
  name: string;
  seconds: number;
  sampleRate: number;
  stats: LevelStats;
  /** 16-bit stereo WAV, base64 (only when requested). */
  wavBase64?: string;
}

const QUANTUM = 128;
const TICK_SECS = 0.05;

export async function renderScenario(
  sc: Scenario,
  { sampleRate = 48000, wav = false } = {},
): Promise<OfflineResult> {
  const frames = Math.ceil(sc.seconds * sampleRate);
  const ctx = new OfflineAudioContext(2, frames, sampleRate);
  const engine = new AudioEngine(ctx);

  // suspend() times must be distinct render-quantum boundaries after 0.
  const byFrame = new Map<number, ((e: AudioEngine) => void)[]>();
  const at = (t: number, fn: (e: AudioEngine) => void) => {
    const f = Math.min(frames - QUANTUM, Math.round((t * sampleRate) / QUANTUM) * QUANTUM);
    const list = byFrame.get(f) ?? [];
    list.push(fn);
    byFrame.set(f, list);
  };
  for (const [t, run] of sc.actions) at(t, run);
  for (let t = 0; t < sc.seconds; t += TICK_SECS) at(t, (e) => e.tick());

  for (const [f, fns] of [...byFrame].sort((a, b) => a[0] - b[0])) {
    if (f <= 0) {
      for (const fn of fns) fn(engine);
      continue;
    }
    ctx.suspend(f / sampleRate).then(() => {
      for (const fn of fns) fn(engine);
      return ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const channels = [buf.getChannelData(0), buf.getChannelData(1)];
  return {
    name: sc.name,
    seconds: sc.seconds,
    sampleRate,
    stats: levelStats(channels, sampleRate),
    wavBase64: wav ? toBase64(encodeWav(channels, sampleRate)) : undefined,
  };
}

/** Renders scenarios by name (all if `names` is empty; a trailing '/' or '*' matches a prefix). */
export async function renderScenarios(
  names: string[] = [],
  opts: { wav?: boolean } = {},
): Promise<OfflineResult[]> {
  const all = buildScenarios();
  const match = (n: string) =>
    names.length === 0 ||
    names.some((q) => (q.endsWith('*') || q.endsWith('/') ? n.startsWith(q.replace(/\*$/, '')) : n === q));
  const out: OfflineResult[] = [];
  for (const sc of all.filter((s) => match(s.name))) out.push(await renderScenario(sc, opts));
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
