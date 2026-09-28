import type { SimEvent } from '../sim/events';
import { AudioEngine } from './engine';
import type { NoiseColour } from './noise';
import { EventRouter, type RouterState } from './router';
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

/** One video frame of a recorded fight: its time, the camera centre, the step's events and state. */
export interface TrackCue {
  t: number;
  listener: { x: number; y: number };
  events: SimEvent[];
  state: RouterState;
}

/**
 * Renders the game's audio for a recorded run offline (clips with sound: `npm run clip -- --audio`).
 * The real EventRouter and hum voices play the recorded sim events at their video times, with the
 * room ambience and the music director running, so a clip sounds like the game.
 */
export async function renderTrack(
  cues: TrackCue[],
  seconds: number,
  { sampleRate = 48000 } = {},
): Promise<{ wavBase64: string; stats: LevelStats }> {
  const frames = Math.ceil(seconds * sampleRate);
  const ctx = new OfflineAudioContext(2, frames, sampleRate);
  const engine = new AudioEngine(ctx);
  const router = new EventRouter(
    {
      play: (name, opts) => engine.play(name, opts),
      loopGain: (name, g) => engine.loopGain(name, g),
      setRoom: (id) => engine.setRoom(id),
      hums: {
        reset: (list) => {
          for (const h of engine.humInfo()) if (h.id.startsWith('s')) engine.getHum(h.id)?.stop(0.2);
          for (const h of list) engine.hum(h.id, h.colour as NoiseColour, h.pos);
        },
        seize: (id, holder) => void engine.getHum(id)?.seize(holder),
        fly: (id, from, towards) => engine.getHum(id)?.fly(from, towards),
        land: (id, at, thud) => engine.getHum(id)?.land(at, thud),
        setPosition: (id, at) => {
          const h = engine.getHum(id);
          if (h && h.status !== 'carried') h.setPosition(at);
        },
      },
    },
    engine.data.sfx,
  );
  const byFrame = new Map<number, (() => void)[]>();
  const at = (t: number, fn: () => void) => {
    const f = Math.min(frames - QUANTUM, Math.max(0, Math.round((t * sampleRate) / QUANTUM) * QUANTUM));
    const list = byFrame.get(f) ?? [];
    list.push(fn);
    byFrame.set(f, list);
  };
  const first = cues[0];
  at(0, () => {
    if (first) {
      engine.listener = first.listener;
      router.update(first.state);
    }
    const m = engine.data.music;
    if (m.autoStart) engine.music.start(m.startLayer);
  });
  for (const c of cues)
    at(c.t, () => {
      engine.listener = c.listener;
      for (const e of c.events) router.handle(e, c.state.frame, c.state);
      router.update(c.state);
      const p = c.state.player;
      const held = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
      for (const h of engine.humInfo()) if (h.status === 'carried') engine.getHum(h.id)?.setPosition(held);
    });
  for (let t = 0; t < seconds; t += TICK_SECS) at(t, () => engine.tick());
  for (const [f, fns] of [...byFrame].sort((a, b) => a[0] - b[0])) {
    if (f <= 0) {
      for (const fn of fns) fn();
      continue;
    }
    ctx.suspend(f / sampleRate).then(() => {
      for (const fn of fns) fn();
      return ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const channels = [buf.getChannelData(0), buf.getChannelData(1)];
  return { wavBase64: toBase64(encodeWav(channels, sampleRate)), stats: levelStats(channels, sampleRate) };
}
