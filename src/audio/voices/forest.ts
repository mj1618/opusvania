/**
 * The forest's quiet places: the pool lapping, root steam breathing under the light well (amber),
 * and the glassy air of the violet stand (two chord tones rubbed out of the wind).
 */
import type { Baked } from '../bake';
import type { AudioGraph } from '../graph';
import type { Layers } from '../router';
import { PITCH } from '../tuning';
import { aim, band, silent } from './util';

export class ForestVoice {
  private readonly pool: GainNode;
  private readonly poolPan: StereoPannerNode;
  private readonly steam: GainNode;
  private readonly glass: GainNode;

  constructor(graph: AudioGraph, baked: Baked) {
    const ctx = graph.ctx;
    const out = graph.buses.world.in;
    const [bl, br] = baked.loops.brown as [Float32Array, Float32Array];
    const [pl, pr] = baked.loops.pink as [Float32Array, Float32Array];
    // The pool: low slaps, two bands.
    this.pool = silent(graph);
    this.poolPan = new StereoPannerNode(ctx);
    const lo = band(graph, br, 1.9, [['bandpass', 260, 0.9]]);
    const hi = band(graph, bl, 3.3, [['bandpass', 540, 2]]);
    const hg = new GainNode(ctx, { gain: 0.5 });
    lo.out.connect(this.pool);
    hi.out.connect(hg).connect(this.pool);
    this.pool.connect(this.poolPan).connect(out);
    this.poolPan.connect(graph.buses.world.room);

    this.steam = silent(graph);
    band(graph, pl, 2.7, [
      ['highpass', 2600, 0.7],
      ['lowpass', 6000, 0.7],
    ]).out.connect(this.steam);
    this.steam.connect(out);

    this.glass = silent(graph);
    for (const [f, off] of [
      [PITCH.E5, 0.6],
      [PITCH.B5, 4.4],
    ] as const)
      band(graph, pr, off, [['bandpass', f, 45]]).out.connect(this.glass);
    this.glass.connect(graph.buses.lantern.in);
    this.glass.connect(graph.buses.lantern.far);
  }

  apply(L: Layers, when: number, tau: number): void {
    aim(this.pool.gain, L.pool, when, tau * 3);
    aim(this.poolPan.pan, L.poolPan, when, 0.2);
    aim(this.steam.gain, L.steam, when, tau * 4);
    aim(this.glass.gain, L.glass, when, tau * 6);
  }
}
