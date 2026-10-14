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
import { ForestVoice } from './voices/forest';
import { HushVoice } from './voices/hush';
import { OneShots } from './voices/oneshots';
import { WindVoice } from './voices/wind';
import { WingsVoice } from './voices/wings';

export class AudioEngine {
  readonly graph: AudioGraph;
  private readonly shots: OneShots;
  private readonly voices: Array<{ apply(L: Layers, when: number, tau: number): void }>;

  constructor(ctx: BaseAudioContext, baked: Baked, out?: AudioNode) {
    this.graph = new AudioGraph(ctx, baked, out);
    this.shots = new OneShots(this.graph, baked);
    this.voices = [
      new WindVoice(this.graph, baked),
      new HushVoice(this.graph, baked),
      new WingsVoice(this.graph, baked),
      new BowlVoice(this.graph, baked),
      new ForestVoice(this.graph, baked),
      new ChordVoice(this.graph, baked),
    ];
  }

  play(cue: Cue, when: number, cam: AudioCam): void {
    this.shots.play(cue, when, cam);
  }

  apply(L: Layers, when: number): void {
    for (const v of this.voices) v.apply(L, when, AUDIO.layerTau);
  }

  /** The whole mix up or down (the prologue's silence, a fade in at start), gliding. */
  fade(to: number, when: number, tau: number): void {
    this.graph.fader.gain.setTargetAtTime(to, when, tau);
  }
}
