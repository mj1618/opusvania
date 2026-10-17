/**
 * The prologue's continuous tones: the maker's one warm, slightly out-of-tune low FM note (the only
 * human-made timbre), the small light's own tone (rubbed glass at her pitch, A4; later her glint), and
 * the lamp's coral hum swelling toward her pitch (A5, with a lampwing's fast tremolo).
 */
import type { Baked } from '../bake';
import type { AudioGraph } from '../graph';
import type { Layers } from '../router';
import { PITCH } from '../tuning';
import { Rubbed } from './bowl';
import { aim, silent } from './util';

export class PrologueVoice {
  private readonly maker: GainNode;
  private readonly light: Rubbed;
  private readonly lamp: Rubbed;

  constructor(graph: AudioGraph, baked: Baked) {
    const ctx = graph.ctx;
    // The maker: a sine carrier at D3, 18 cents flat, frequency-modulated at a 1.003 ratio, low-passed.
    const f = PITCH.D3 * 2 ** (-18 / 1200);
    const car = new OscillatorNode(ctx, { type: 'sine', frequency: f });
    const mod = new OscillatorNode(ctx, { type: 'sine', frequency: f * 1.003 });
    const depth = new GainNode(ctx, { gain: f * 0.8 });
    mod.connect(depth).connect(car.frequency);
    const second = new OscillatorNode(ctx, { type: 'sine', frequency: f * 2.004 });
    const sg = new GainNode(ctx, { gain: 0.18 });
    second.connect(sg);
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 900, Q: 0 });
    const trim = new GainNode(ctx, { gain: 1.3 });
    this.maker = silent(graph);
    car.connect(lp);
    sg.connect(lp);
    lp.connect(trim).connect(this.maker).connect(graph.buses.score.in);
    this.maker.connect(graph.buses.score.room);
    for (const o of [car, mod, second]) o.start(0);

    const [pl, pr] = baked.loops.pink as [Float32Array, Float32Array];
    this.light = new Rubbed(graph, pl, 2.2, 60, 0.6, 'score');
    this.lamp = new Rubbed(graph, pr, 3.9, 50, 0.55, 'score');
    // The lamp's tremolo: a fast exact wing hum on its gain.
    const lfo = new OscillatorNode(ctx, { type: 'sine', frequency: 38 });
    const lg = new GainNode(ctx, { gain: 0 });
    lfo.connect(lg).connect(this.lamp.gain.gain);
    lfo.start(0);
    this.lampDepth = lg;
  }

  private readonly lampDepth: GainNode;

  apply(L: Layers, when: number): void {
    aim(this.maker.gain, L.maker, when, 0.25);
    this.light.set(L.light, PITCH.A4, 0, when, 0.06);
    // The hum stops dead (a 15 ms release), never a click.
    this.lamp.set(L.lamp, PITCH.A4 * 2, 0.15, when, L.lamp > 0 ? 0.4 : 0.015);
    aim(this.lampDepth.gain, L.lamp * 0.2, when, 0.05);
  }
}
