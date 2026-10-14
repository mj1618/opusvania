/**
 * Lantern bowls, continuous: the rubbed rim that swells while she kindles (narrow band-passed noise
 * with its pure partial and a slow warble under it), and the faint steady hum of a lit one near her.
 */
import type { Baked } from '../bake';
import type { AudioGraph } from '../graph';
import type { Layers } from '../router';
import { PITCH } from '../tuning';
import { aim, type Band, band, silent } from './util';

class Rubbed {
  readonly gain: GainNode;
  readonly pan: StereoPannerNode;
  private readonly b: Band;
  private readonly oscs: OscillatorNode[];

  constructor(graph: AudioGraph, noise: Float32Array, offset: number, q: number, pure: number) {
    const ctx = graph.ctx;
    this.b = band(graph, noise, offset, [
      ['bandpass', PITCH.D3, q],
      ['bandpass', PITCH.D3, q],
    ]);
    this.gain = silent(graph);
    this.pan = new StereoPannerNode(ctx);
    const breath = new GainNode(ctx, { gain: 0.6 });
    this.b.out.connect(breath).connect(this.gain);
    // The rim's own partial and a slow warble beside it.
    this.oscs = [1, 1.0045].map((r) => {
      const o = new OscillatorNode(ctx, { type: 'sine', frequency: PITCH.D3 * r });
      const g = new GainNode(ctx, { gain: pure * 0.7 });
      o.connect(g).connect(this.gain);
      o.start(0);
      return o;
    });
    this.gain.connect(this.pan).connect(graph.buses.lantern.in);
    this.pan.connect(graph.buses.lantern.room);
  }

  set(g: number, hz: number, pan: number, when: number, tau: number): void {
    aim(this.gain.gain, g, when, tau);
    for (const f of this.b.filters) aim(f.frequency, hz, when, 0.02);
    this.oscs.forEach((o, i) => {
      aim(o.frequency, hz * (i ? 1.0045 : 1), when, 0.02);
    });
    aim(this.pan.pan, pan, when, 0.1);
  }
}

export class BowlVoice {
  private readonly rub: Rubbed;
  private readonly hum: Rubbed;

  constructor(graph: AudioGraph, baked: Baked) {
    this.rub = new Rubbed(graph, baked.loops.pink[0] as Float32Array, 5.2, 40, 0.5);
    this.hum = new Rubbed(graph, baked.loops.pink[1] as Float32Array, 6.6, 70, 0.6);
  }

  apply(L: Layers, when: number, tau: number): void {
    // The rubbing swells with the channel and lets go over a quarter second when it stops.
    this.rub.set(L.rub, L.rubHz, L.rubPan, when, L.rub > 0 ? tau : 0.08);
    this.hum.set(L.hum, L.humHz, L.humPan, when, 0.5);
  }
}
