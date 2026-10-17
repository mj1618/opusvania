/**
 * Offline renders for clips with sound (`npm run clip -- --audio`): a tape recorded while the clip
 * stepped the game (index.ts `record`) is played through the same conductor and engine into an
 * OfflineAudioContext, at the clip's frame times. One tape always renders the same audio.
 */
import type { Scene } from '../sim/scene';
import { bakeAll } from './bake';
import { Conductor } from './conductor';
import { AudioEngine } from './engine';
import type { TapeFrame } from './index';
import type { BusId } from './tuning';
import { encodeWav, type LevelStats, levelStats, toBase64 } from './wav';

export interface RenderOptions {
  /** Seconds of the tape's first frame in the clip (the clip's frame 1 is 1/60 s in). */
  offset?: number;
  /** Extra seconds after the last frame (tails). */
  tail?: number;
  sampleRate?: number;
  /** Buses left out (the A/B take without the Hush: ['hush']). */
  mute?: BusId[];
}

export interface RenderResult {
  wavBase64: string;
  stats: LevelStats;
  seconds: number;
  /** Wall-clock ms: baking, and rendering. */
  bakeMs: number;
  renderMs: number;
  /** Cues played, by sound. */
  cues: Record<string, number>;
}

export async function renderTape(
  tape: TapeFrame[],
  scene: Scene,
  seed: number,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  const sr = opts.sampleRate ?? 48000;
  const offset = opts.offset ?? 1 / 60;
  const seconds = offset + tape.length / 60 + (opts.tail ?? 0);
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const t0 = performance.now();
  const baked = bakeAll(sr, seed);
  const bakeMs = performance.now() - t0;
  const engine = new AudioEngine(ctx, baked);
  for (const b of opts.mute ?? []) engine.graph.off.add(b);
  engine.graph.setVolumes(0);
  // In over the first half second, out over the last quarter.
  engine.fade(1, 0, 0.15);
  engine.fade(0, Math.max(0, seconds - 0.4), 0.08);
  const conductor = new Conductor({ scene, seed }, engine);
  const cues: Record<string, number> = {};
  tape.forEach((fr, k) => {
    const t = offset + k / 60;
    if (fr.prime) conductor.prime(fr.prime);
    for (const s of fr.steps)
      for (const c of conductor.step(s.events, s.snap, fr.cam, t)) cues[c.sound] = (cues[c.sound] ?? 0) + 1;
    conductor.frame(fr.cam, fr.clock, t, k === 0);
  });
  const t1 = performance.now();
  const buf = await ctx.startRendering();
  const renderMs = performance.now() - t1;
  const chs = [buf.getChannelData(0), buf.getChannelData(1)];
  return {
    wavBase64: toBase64(encodeWav(chs, sr)),
    stats: levelStats(chs),
    seconds,
    bakeMs,
    renderMs,
    cues,
  };
}
