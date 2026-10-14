/**
 * Her continuous sound: the near-silent airflow while the wings are open, following her speed and
 * place on screen, released (never cut) when the glide ends.
 */
import type { Baked } from '../bake';
import type { AudioGraph } from '../graph';
import type { Layers } from '../router';
import { AUDIO } from '../tuning';
import { aim, type Band, band, silent } from './util';

export class WingsVoice {
  private readonly gain: GainNode;
  private readonly b: Band;
  private readonly pan: StereoPannerNode;
  private last = 0;

  constructor(graph: AudioGraph, baked: Baked) {
    this.b = band(graph, baked.loops.pink[1] as Float32Array, 4.1, [
      ['bandpass', 600, 0.7],
      ['lowpass', 2400, 0.7],
    ]);
    this.gain = silent(graph);
    this.pan = new StereoPannerNode(graph.ctx);
    this.b.out.connect(this.gain).connect(this.pan).connect(graph.buses.hero.in);
    this.pan.connect(graph.buses.hero.room);
  }

  apply(L: Layers, when: number, tau: number): void {
    // Opening is quick, letting go is slow.
    const release = L.air < this.last;
    aim(this.gain.gain, L.air, when, release ? AUDIO.hero.airRelease / 3 : tau * 2);
    const f = this.b.filters[0];
    if (f) aim(f.frequency, L.airHz, when, 0.15);
    aim(this.pan.pan, L.airPan, when, 0.1);
    this.last = L.air;
  }
}
