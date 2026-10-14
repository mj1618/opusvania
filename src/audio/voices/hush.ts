/**
 * The Hush, under the soil: its breath (brown noise through two formant band-passes gliding oo to
 * aa, too low and soft to read as a voice) and its pulse (D2 with two soft-saturated partials, so a
 * laptop hears 110-330 Hz and the ear fills in the fundamental). The swell comes from the clock
 * (clock.ts) as a gain, so it can never click. The bus's own low-pass is the soil; a lit lantern
 * near her pushes it down (router.ts `layers`).
 */
import type { Baked } from '../bake';
import { saturate } from '../dsp';
import type { AudioGraph } from '../graph';
import type { Layers } from '../router';
import { HUSH } from '../tuning';
import { aim, type Band, band, silent } from './util';

export class HushVoice {
  private readonly breath: GainNode;
  private readonly f1: Band;
  private readonly f2: Band;
  private readonly pulse: GainNode;
  private readonly soil: AudioParam;

  constructor(graph: AudioGraph, baked: Baked) {
    const ctx = graph.ctx;
    const out = graph.buses.hush.in;
    this.soil = graph.buses.hush.filter.frequency;
    const brown = baked.loops.brown[0] as Float32Array;
    this.f1 = band(graph, brown, 5.3, [['bandpass', HUSH.oo[0], 4]]);
    this.f2 = band(graph, brown, 2.1, [['bandpass', HUSH.oo[1], 6]]);
    const f2g = new GainNode(ctx, { gain: 0.4 });
    this.breath = silent(graph);
    this.f1.out.connect(this.breath);
    this.f2.out.connect(f2g).connect(this.breath);
    this.breath.connect(out);
    this.breath.connect(graph.buses.hush.far);

    // The pulse: D2 and two slightly detuned partials, gently saturated, low-passed (unit-ish RMS).
    const sum = new GainNode(ctx, { gain: 0.75 });
    const partials: Array<[number, number]> = [
      [HUSH.toneHz, 1],
      [HUSH.toneHz * 2 * 1.0021, 0.32],
      [HUSH.toneHz * 3 * 0.9987, 0.12],
    ];
    for (const [f, a] of partials) {
      const o = new OscillatorNode(ctx, { type: 'sine', frequency: f });
      const g = new GainNode(ctx, { gain: a });
      o.connect(g).connect(sum);
      o.start(0);
    }
    const curve = new Float32Array(1025);
    for (let i = 0; i < curve.length; i++) curve[i] = saturate(i / 512 - 1, 1.8);
    const shaper = new WaveShaperNode(ctx, { curve, oversample: 'none' });
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 330, Q: 0 });
    const trim = new GainNode(ctx, { gain: 1.6 });
    this.pulse = silent(graph);
    sum.connect(shaper).connect(lp).connect(trim).connect(this.pulse).connect(out);
    this.pulse.connect(graph.buses.hush.room);
  }

  apply(L: Layers, when: number, tau: number): void {
    aim(this.breath.gain, L.breath, when, tau * 4);
    aim(this.f1.filters[0]?.frequency as AudioParam, L.f1, when, 0.3);
    aim(this.f2.filters[0]?.frequency as AudioParam, L.f2, when, 0.3);
    aim(this.pulse.gain, L.pulse, when, tau * 2);
    aim(this.soil, L.soilHz, when, 0.4);
  }
}
