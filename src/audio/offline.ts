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
  /** Buses left out (the A/B take without the bed: ['world']). */
  mute?: BusId[];
  /**
   * A window of a long tape (a whole route, tools/playtest/route-video.ts --audio): only steps [from, to) sound,
   * counted in sim steps since the recording began, each at its own 1/60 s (a frame of two steps is two times).
   * Steps before `from` run the conductor silently, so the score, the rate limits and the creatures' memory are as
   * they would be, and windows that overlap agree there.
   */
  from?: number;
  to?: number;
  /** The scene of a room the tape passes through (materials, pools, lure kinds): else `scene` throughout. */
  sceneOf?: (room: string) => Scene | undefined;
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
  const windowed = opts.from !== undefined || opts.to !== undefined;
  const steps = windowed ? tape.reduce((n, fr) => n + fr.steps.length, 0) : 0;
  const from = Math.max(0, Math.min(opts.from ?? 0, steps));
  const to = Math.max(from, Math.min(opts.to ?? steps, steps));
  const seconds = offset + (windowed ? to - from : tape.length) / 60 + (opts.tail ?? 0);
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
  const enter = (room: string | undefined) => {
    if (opts.sceneOf && room && room !== conductor.ctx.scene.id)
      conductor.ctx.scene = opts.sceneOf(room) ?? conductor.ctx.scene;
  };
  if (windowed) {
    let j = 0;
    let first = true;
    for (const fr of tape) {
      if (j >= to) break;
      if (fr.prime) conductor.prime(fr.prime);
      let t = -1;
      for (const s of fr.steps) {
        if (j >= to) break;
        enter(s.snap.room);
        const play = j >= from;
        t = offset + (j - from) / 60;
        for (const c of conductor.step(s.events, s.snap, fr.cam, Math.max(0, t), play))
          if (play) cues[c.sound] = (cues[c.sound] ?? 0) + 1;
        j++;
      }
      if (t >= offset) {
        conductor.frame(fr.cam, fr.clock, t, first);
        first = false;
      }
    }
  } else
    tape.forEach((fr, k) => {
      const t = offset + k / 60;
      if (fr.prime) conductor.prime(fr.prime);
      for (const s of fr.steps) {
        enter(s.snap.room);
        for (const c of conductor.step(s.events, s.snap, fr.cam, t)) cues[c.sound] = (cues[c.sound] ?? 0) + 1;
      }
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
