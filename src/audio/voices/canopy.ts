/**
 * The Canopy's continuous voices (route-canopy.ts `canopyLayers` aims them; engine.ts makes each only where heard):
 * - the earth: the den and the roots' own low rumble, swelling slowly (brown noise, two low-passes);
 * - the river: the swarm passing over the hatch before she breaks out (canopy-moments.md Moment 1: heard before it is
 *   seen): a dense band of wings, two bands each shivering at its own wingbeat, panned across;
 * - the valley: the false lights far below the promise lip, a faint cluster of out-of-tune beating hums;
 * - the flyers: the nearest lampwing's fast hum with its thin glass tone, the nearest hawker's heavier wings.
 */
import type { Baked } from '../bake';
import type { AudioGraph } from '../graph';
import type { Layers } from '../router';
import { LAMP_BEAT, LAMP_HZ } from '../tuning';
import { aim, type Band, band, silent } from './util';

export class EarthVoice {
  private readonly gain: GainNode;

  constructor(graph: AudioGraph, baked: Baked) {
    const ctx = graph.ctx;
    const [bl, br] = baked.loops.brown as [Float32Array, Float32Array];
    this.gain = silent(graph);
    const lo = band(graph, bl, 0.7, [
      ['lowpass', 110, 0.7],
      ['lowpass', 110, 0.7],
      ['highpass', 28, 0.7],
    ]);
    // A second, slightly higher body on the other channel: the rumble is wide, never a point.
    const mid = band(graph, br, 3.9, [
      ['bandpass', 170, 1.2],
      ['lowpass', 300, 0.7],
    ]);
    const l = new StereoPannerNode(ctx, { pan: -0.5 });
    const r = new StereoPannerNode(ctx, { pan: 0.5 });
    lo.out.connect(l).connect(this.gain);
    mid.out
      .connect(new GainNode(ctx, { gain: 0.5 }))
      .connect(r)
      .connect(this.gain);
    this.gain.connect(graph.buses.world.in);
    this.gain.connect(graph.buses.world.far);
  }

  apply(L: Layers, when: number, tau: number): void {
    aim(this.gain.gain, L.earth, when, tau * 8);
  }
}

export class RiverVoice {
  private readonly gain: GainNode;
  private readonly pan: StereoPannerNode;
  private readonly bands: Band[];
  private last = 0;

  constructor(graph: AudioGraph, baked: Baked) {
    const ctx = graph.ctx;
    const [pl, pr] = baked.loops.pink as [Float32Array, Float32Array];
    this.gain = silent(graph);
    this.pan = new StereoPannerNode(ctx);
    this.bands = [];
    // Thousands of wings: two bands, each shivering at its own beat (no single moth is heard), and a low push of air.
    for (const [ch, off, hz, q, beat, g] of [
      [pl, 0.3, 2100, 1.1, 27, 0.7],
      [pr, 2.9, 1300, 0.9, 19, 0.6],
    ] as const) {
      const b = band(graph, ch, off, [
        ['bandpass', hz, q],
        ['lowpass', 5200, 0.7],
      ]);
      const am = new GainNode(ctx, { gain: 0.65 });
      const lfo = new OscillatorNode(ctx, { type: 'triangle', frequency: beat });
      lfo.connect(new GainNode(ctx, { gain: 0.3 })).connect(am.gain);
      lfo.start(0);
      b.out
        .connect(am)
        .connect(new GainNode(ctx, { gain: g }))
        .connect(this.gain);
      this.bands.push(b);
    }
    const push = band(graph, pl, 5.3, [['lowpass', 260, 0.7]]);
    push.out.connect(new GainNode(ctx, { gain: 0.35 })).connect(this.gain);
    this.gain.connect(this.pan).connect(graph.buses.world.in);
    this.pan.connect(graph.buses.world.room);
  }

  apply(L: Layers, when: number, tau: number): void {
    // (A breath of silence at the breakout drops fast; everything else glides. Offline a param's value is not its
    // automated value: keep the last target.)
    aim(this.gain.gain, L.river, when, L.river < 0.3 * this.last ? 0.06 : tau * 4);
    this.last = L.river;
    aim(this.pan.pan, L.riverPan, when, 0.4);
    const [a, b] = this.bands.map((x) => x.filters[0] as BiquadFilterNode);
    if (a) aim(a.frequency, L.riverHz, when, 0.3);
    if (b) aim(b.frequency, L.riverHz * 0.62, when, 0.3);
  }
}

export class ValleyVoice {
  private readonly gain: GainNode;

  constructor(graph: AudioGraph) {
    const ctx = graph.ctx;
    this.gain = silent(graph);
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1400, Q: 0 });
    // A few lamps far below, each two tones a beat apart, out of tune with the forest (and with each other a little).
    for (const [hz, beat, g, pan] of [
      [LAMP_HZ.wick, LAMP_BEAT.wick, 0.5, -0.4],
      [LAMP_HZ.lantern, LAMP_BEAT.lantern, 0.6, 0.3],
      [LAMP_HZ.wick * 1.004, LAMP_BEAT.wick * 1.2, 0.35, 0.55],
      [LAMP_HZ.great, LAMP_BEAT.great, 0.7, -0.1],
    ] as const) {
      const p = new StereoPannerNode(ctx, { pan });
      for (const f of [hz, hz + beat]) {
        const o = new OscillatorNode(ctx, { type: 'sine', frequency: f });
        o.connect(new GainNode(ctx, { gain: g * 0.5 })).connect(p);
        o.start(0);
      }
      p.connect(lp);
    }
    lp.connect(this.gain);
    this.gain.connect(graph.buses.lantern.in);
    this.gain.connect(graph.buses.lantern.far);
  }

  apply(L: Layers, when: number, tau: number): void {
    aim(this.gain.gain, L.valley, when, tau * 10);
  }
}

export class FlyerVoice {
  private readonly wing: GainNode;
  private readonly wingPan: StereoPannerNode;
  private readonly hawk: GainNode;
  private readonly hawkPan: StereoPannerNode;

  constructor(graph: AudioGraph) {
    const ctx = graph.ctx;
    const bus = graph.buses.creatures;
    // A lampwing: a fast thin wing hum (a buzz shivering at its wingbeat) and the faint glass of its lamp.
    this.wing = silent(graph);
    this.wingPan = new StereoPannerNode(ctx);
    const buzz = new OscillatorNode(ctx, { type: 'sawtooth', frequency: 118 });
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1250, Q: 1.4 });
    const am = new GainNode(ctx, { gain: 0.5 });
    const beat = new OscillatorNode(ctx, { type: 'sine', frequency: 31 });
    beat.connect(new GainNode(ctx, { gain: 0.45 })).connect(am.gain);
    buzz.connect(bp).connect(am).connect(this.wing);
    const glass = new OscillatorNode(ctx, { type: 'sine', frequency: LAMP_HZ.wick * 2 });
    glass.connect(new GainNode(ctx, { gain: 0.12 })).connect(this.wing);
    for (const o of [buzz, beat, glass]) o.start(0);
    this.wing.connect(this.wingPan).connect(bus.in);
    this.wingPan.connect(bus.room);
    // A hawker: bigger, slower wings, a low churning drone.
    this.hawk = silent(graph);
    this.hawkPan = new StereoPannerNode(ctx);
    const drone = new OscillatorNode(ctx, { type: 'sawtooth', frequency: 54 });
    const hbp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 420, Q: 0.9 });
    const ham = new GainNode(ctx, { gain: 0.5 });
    const hbeat = new OscillatorNode(ctx, { type: 'sine', frequency: 21 });
    hbeat.connect(new GainNode(ctx, { gain: 0.48 })).connect(ham.gain);
    drone.connect(hbp).connect(ham).connect(this.hawk);
    for (const o of [drone, hbeat]) o.start(0);
    this.hawk.connect(this.hawkPan).connect(bus.in);
    this.hawkPan.connect(bus.room);
  }

  apply(L: Layers, when: number, tau: number): void {
    aim(this.wing.gain, L.lampwing, when, tau * 2);
    aim(this.wingPan.pan, L.lampwingPan, when, 0.1);
    aim(this.hawk.gain, L.hawker, when, tau * 2);
    aim(this.hawkPan.pan, L.hawkerPan, when, 0.1);
  }
}
