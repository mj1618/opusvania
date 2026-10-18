/**
 * The firefly's false lights (docs/design/look-and-sound.md §6): the nearest burning lamp hums, a perfectly
 * steady tone a little sharp of the forest (tuning.ts `LAMP_HZ`), beating against its own second tone, with
 * a thin rubbed edge; its low-pass opens as she nears. The swarm circling it is a flutter of wings panned
 * round with the orbit. The fling's held moment is a filtered swell under it (an octave down, a band
 * rising with the aim). All oscillators and two noise bands: cheap, and made only where a lamp is heard.
 */
import type { Baked } from '../bake';
import type { AudioGraph } from '../graph';
import type { Layers } from '../router';
import { LAMP_HZ } from '../tuning';
import { aim, type Band, band, silent } from './util';

export class LampVoice {
  private readonly gain: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly pan: StereoPannerNode;
  private readonly tones: OscillatorNode[];
  private readonly edge: Band;
  private readonly flutter: GainNode;
  private readonly flutterPan: StereoPannerNode;
  private readonly aimGain: GainNode;
  private readonly aimBand: Band;
  private readonly aimLow: OscillatorNode;

  constructor(graph: AudioGraph, baked: Baked) {
    const ctx = graph.ctx;
    const bus = graph.buses.lantern;
    const [pl, pr] = baked.loops.pink as [Float32Array, Float32Array];
    const f = LAMP_HZ.wick;

    // The hum: two tones a beat apart, two faint upper partials, a rubbed edge of narrow noise.
    const mix = new GainNode(ctx);
    this.tones = [
      [f, 0.55],
      [f + 1.3, 0.55],
      [f * 2.003, 0.16],
      [f * 3.01, 0.05],
    ].map(([hz, g]) => {
      const o = new OscillatorNode(ctx, { type: 'sine', frequency: hz as number });
      o.connect(new GainNode(ctx, { gain: g as number })).connect(mix);
      o.start(0);
      return o;
    });
    this.edge = band(graph, pl, 3.7, [
      ['bandpass', f, 60],
      ['bandpass', f, 60],
    ]);
    this.edge.out.connect(new GainNode(ctx, { gain: 0.3 })).connect(mix);
    this.lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 800, Q: 0 });
    this.gain = silent(graph);
    this.pan = new StereoPannerNode(ctx);
    mix.connect(this.lp).connect(this.gain).connect(this.pan).connect(bus.in);
    this.pan.connect(bus.room);

    // The swarm's flutter: a wing band, its level shivering at a wingbeat, panned round with the orbit.
    const wings = band(graph, pr, 1.1, [
      ['bandpass', 2300, 1.5],
      ['lowpass', 5000, 0.7],
    ]);
    const am = new GainNode(ctx, { gain: 0.5 });
    const amLfo = new OscillatorNode(ctx, { type: 'sine', frequency: 23 });
    amLfo.connect(new GainNode(ctx, { gain: 0.45 })).connect(am.gain);
    amLfo.start(0);
    this.flutter = silent(graph);
    this.flutterPan = new StereoPannerNode(ctx);
    const orbit = new OscillatorNode(ctx, { type: 'sine', frequency: 0.55 });
    orbit.connect(new GainNode(ctx, { gain: 0.5 })).connect(this.flutterPan.pan);
    orbit.start(0);
    wings.out.connect(am).connect(this.flutter).connect(this.flutterPan).connect(bus.in);
    this.flutterPan.connect(bus.room);

    // The held fling: a band of air rising with the aim and a tone an octave under the hum.
    this.aimBand = band(graph, pl, 6.1, [['bandpass', f / 2, 6]]);
    this.aimLow = new OscillatorNode(ctx, { type: 'sine', frequency: f / 2 });
    this.aimLow.start(0);
    this.aimGain = silent(graph);
    this.aimBand.out.connect(this.aimGain);
    this.aimLow.connect(new GainNode(ctx, { gain: 0.6 })).connect(this.aimGain);
    this.aimGain.connect(bus.in);
    this.aimGain.connect(bus.room);
  }

  apply(L: Layers, when: number, tau: number): void {
    aim(this.gain.gain, L.lamp, when, tau * 3);
    aim(this.lp.frequency, L.lampLp, when, tau * 3);
    aim(this.pan.pan, L.lampPan, when, 0.15);
    // A new lamp's pitch is set at once (a lamp never glides: it is exact).
    const hz = [L.lampHz, L.lampHz + L.lampBeat, L.lampHz * 2.003, L.lampHz * 3.01];
    this.tones.forEach((o, k) => {
      aim(o.frequency, hz[k] as number, when, 0.01);
    });
    for (const fl of this.edge.filters) aim(fl.frequency, L.lampHz, when, 0.01);
    aim(this.flutter.gain, L.flutter, when, tau * 3);
    aim(this.flutterPan.pan, L.lampPan, when, 0.2);
    // The swell comes in quickly with the snap and lets go fast on the launch.
    aim(this.aimGain.gain, L.aim, when, L.aim > 0 ? 0.08 : 0.05);
    for (const fl of this.aimBand.filters) aim(fl.frequency, L.aimHz, when, 0.05);
    aim(this.aimLow.frequency, L.lampHz / 2, when, 0.01);
  }
}
