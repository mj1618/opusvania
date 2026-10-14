/**
 * Wind in two bands, driven by render's wind wave (router.ts `layers`): a canopy roar (pink noise
 * in a broad low-mid band, wide: one bed per ear) and leaf hiss sampled at each side of the view,
 * so a wave crossing the screen is heard crossing.
 */
import type { Baked } from '../bake';
import type { AudioGraph } from '../graph';
import type { Layers } from '../router';
import { AUDIO } from '../tuning';
import { aim, type Band, band, silent } from './util';

export class WindVoice {
  private readonly roar: GainNode;
  private readonly hiss: Array<{ g: GainNode; b: Band }>;

  constructor(graph: AudioGraph, baked: Baked) {
    const ctx = graph.ctx;
    const out = graph.buses.world.in;
    const [pl, pr] = baked.loops.pink as [Float32Array, Float32Array];
    const W = AUDIO.wind;
    this.roar = silent(graph);
    const merge = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    [pl, pr].forEach((ch, k) => {
      const b = band(graph, ch, 0.4 + k * 3.1, [
        ['highpass', 90, 0.7],
        ['bandpass', W.roarHz, 0.7],
        ['lowpass', 1400, 0.7],
      ]);
      b.out.connect(merge, 0, k);
    });
    merge.connect(this.roar).connect(out);
    this.roar.connect(graph.buses.world.far);

    this.hiss = [-0.75, 0.75].map((pan, k) => {
      const b = band(graph, k ? pl : pr, 1.7 + k * 2.3, [
        ['bandpass', W.hissHz[0], W.hissQ],
        ['lowpass', 7000, 0.7],
      ]);
      const g = silent(graph);
      const p = new StereoPannerNode(ctx, { pan });
      b.out.connect(g).connect(p).connect(out);
      p.connect(graph.buses.world.room);
      return { g, b };
    });
  }

  apply(L: Layers, when: number, tau: number): void {
    aim(this.roar.gain, L.roar, when, tau * 3);
    this.hiss.forEach(({ g, b }, k) => {
      aim(g.gain, k ? L.hissR : L.hissL, when, tau * 2);
      const f = b.filters[0];
      if (f) aim(f.frequency, L.hissHz * (k ? 1.07 : 1), when, 0.5);
    });
  }
}
