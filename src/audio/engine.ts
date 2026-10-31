/**
 * The sounding half: the graph, the continuous voices and the one-shot player, driven by cues and
 * layer targets at explicit context times. Live (index.ts) the time is the context clock plus a
 * little lookahead; offline (offline.ts) it is the frame's time in the clip.
 */
import type { Baked } from './bake';
import { AudioGraph } from './graph';
import type { AudioCam, Cue, Layers } from './router';
import { AUDIO, type BusId } from './tuning';
import { BowlVoice } from './voices/bowl';
import { EarthVoice, FlyerVoice, RiverVoice, ValleyVoice } from './voices/canopy';
import { ChordVoice } from './voices/chord';
import { GlassAirVoice, PoolVoice, SteamVoice } from './voices/forest';
import { LampVoice } from './voices/lamp';
import { OneShots } from './voices/oneshots';
import { aim } from './voices/util';
import { WindVoice } from './voices/wind';
import { WingsVoice } from './voices/wings';

type Voice = { apply(L: Layers, when: number, tau: number): void };

/**
 * Voices only some places need, made the first frame they are asked for (each costs the renderer
 * every frame it exists, sounding or not): her glide's air, the pool, the steam, the violet air, the
 * lantern bowls, the carried-light chord, the lamps' hum.
 */
const LAZY: Array<{ need: (L: Layers) => boolean; make: (g: AudioGraph, b: Baked) => Voice }> = [
  { need: (L) => L.air > 0, make: (g, b) => new WingsVoice(g, b) },
  { need: (L) => L.pool > 1e-5, make: (g, b) => new PoolVoice(g, b) },
  { need: (L) => L.steam > 1e-5, make: (g, b) => new SteamVoice(g, b) },
  { need: (L) => L.glass > 1e-5, make: (g, b) => new GlassAirVoice(g, b) },
  { need: (L) => L.rub > 0 || L.hum > 0, make: (g, b) => new BowlVoice(g, b) },
  { need: (L) => L.chord.some((x) => x > 0), make: (g, b) => new ChordVoice(g, b) },
  { need: (L) => L.lamp > 0 || L.aim > 0, make: (g, b) => new LampVoice(g, b) },
  { need: (L) => L.earth > 1e-5, make: (g, b) => new EarthVoice(g, b) },
  { need: (L) => L.river > 1e-5, make: (g, b) => new RiverVoice(g, b) },
  { need: (L) => L.valley > 1e-5, make: (g) => new ValleyVoice(g) },
  { need: (L) => L.lampwing > 1e-5 || L.hawker > 1e-5, make: (g) => new FlyerVoice(g) },
];

export class AudioEngine {
  readonly graph: AudioGraph;
  private readonly shots: OneShots;
  private readonly voices: Voice[];
  private readonly lazy: Array<Voice | null> = LAZY.map(() => null);
  private muffled = 20000;

  constructor(
    ctx: BaseAudioContext,
    private readonly baked: Baked,
    out?: AudioNode,
  ) {
    this.graph = new AudioGraph(ctx, baked, out);
    this.shots = new OneShots(this.graph, baked);
    this.voices = [new WindVoice(this.graph, baked)];
  }

  play(cue: Cue, when: number, cam: AudioCam): void {
    this.shots.play(cue, when, cam);
  }

  apply(L: Layers, when: number): void {
    // Held moments duck the bed; her hurt closes the mix quickly and opens it slower.
    aim(this.graph.duck.gain, L.duck, when, 0.12);
    aim(this.graph.muffle.frequency, L.muffleHz, when, L.muffleHz < this.muffled ? 0.02 : 0.15);
    // (The last hit's silence is shaped by the score frame by frame: a tail into it, a slow return.)
    aim(this.graph.hush.gain, L.hush, when, 0.05);
    aim(this.graph.scoreTone.frequency, L.scoreHz, when, 0.12);
    this.muffled = L.muffleHz;
    for (const v of this.voices) v.apply(L, when, AUDIO.layerTau);
    LAZY.forEach((z, i) => {
      if (!this.lazy[i] && z.need(L)) this.lazy[i] = z.make(this.graph, this.baked);
      this.lazy[i]?.apply(L, when, AUDIO.layerTau);
    });
  }

  /** Lets go of everything scheduled on a bus from `when` (the score cut short). */
  cut(bus: BusId, when: number): void {
    this.shots.cut(bus, when);
  }

  /** The whole mix up or down (mute, a fade in at start), gliding. */
  fade(to: number, when: number, tau: number): void {
    this.graph.fader.gain.setTargetAtTime(to, when, tau);
  }
}
