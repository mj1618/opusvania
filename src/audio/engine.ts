/**
 * The sounding half: the graph, the continuous voices and the one-shot player, driven by cues and
 * layer targets at explicit context times. Live (index.ts) the time is the context clock plus a
 * little lookahead; offline (offline.ts) it is the frame's time in the clip.
 */
import type { Baked } from './bake';
import { AudioGraph } from './graph';
import type { AudioCam, Cue, Layers } from './router';
import { AUDIO } from './tuning';
import { BowlVoice } from './voices/bowl';
import { ChordVoice } from './voices/chord';
import { GlassAirVoice, PoolVoice, SteamVoice } from './voices/forest';
import { HushVoice } from './voices/hush';
import { OneShots } from './voices/oneshots';
import { PrologueVoice } from './voices/prologue';
import { WindVoice } from './voices/wind';
import { WingsVoice } from './voices/wings';

type Voice = { apply(L: Layers, when: number, tau: number): void };

/**
 * Voices only some places need, made the first frame they are asked for (each costs the renderer
 * every frame it exists, sounding or not): her glide's air, the pool, the steam, the violet air, the
 * lantern bowls, the carried-light chord, the prologue's.
 */
const LAZY: Array<{ need: (L: Layers) => boolean; make: (g: AudioGraph, b: Baked) => Voice }> = [
  { need: (L) => L.air > 0, make: (g, b) => new WingsVoice(g, b) },
  { need: (L) => L.pool > 1e-5, make: (g, b) => new PoolVoice(g, b) },
  { need: (L) => L.steam > 1e-5, make: (g, b) => new SteamVoice(g, b) },
  { need: (L) => L.glass > 1e-5, make: (g, b) => new GlassAirVoice(g, b) },
  { need: (L) => L.rub > 0 || L.hum > 0, make: (g, b) => new BowlVoice(g, b) },
  { need: (L) => L.chord.some((x) => x > 0), make: (g, b) => new ChordVoice(g, b) },
  { need: (L) => L.maker > 0 || L.light > 0 || L.lamp > 0, make: (g, b) => new PrologueVoice(g, b) },
];

export class AudioEngine {
  readonly graph: AudioGraph;
  private readonly shots: OneShots;
  private readonly voices: Voice[];
  private readonly lazy: Array<Voice | null> = LAZY.map(() => null);

  constructor(
    ctx: BaseAudioContext,
    private readonly baked: Baked,
    out?: AudioNode,
  ) {
    this.graph = new AudioGraph(ctx, baked, out);
    this.shots = new OneShots(this.graph, baked);
    this.voices = [new WindVoice(this.graph, baked), new HushVoice(this.graph, baked)];
  }

  play(cue: Cue, when: number, cam: AudioCam): void {
    this.shots.play(cue, when, cam);
  }

  apply(L: Layers, when: number): void {
    for (const v of this.voices) v.apply(L, when, AUDIO.layerTau);
    LAZY.forEach((z, i) => {
      if (!this.lazy[i] && z.need(L)) this.lazy[i] = z.make(this.graph, this.baked);
      this.lazy[i]?.apply(L, when, AUDIO.layerTau);
    });
  }

  /** The whole mix up or down (the prologue's silence, a fade in at start), gliding. */
  fade(to: number, when: number, tau: number): void {
    this.graph.fader.gain.setTargetAtTime(to, when, tau);
  }
}
