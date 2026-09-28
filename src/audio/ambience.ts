import { type BedDef, bedFor } from './data';
import type { AudioEngine, Ticker } from './engine';

/**
 * Procedural room tone for one room: machinery rumble (low-passed brown noise with a slow swell),
 * crowd murmur (pink noise through vowel-ish band-passes, each swelling at its own rate), a faint
 * steam hiss, and distant clanks scheduled with jitter. Beds crossfade on room change.
 */
export class AmbienceBed implements Ticker {
  private readonly out: GainNode;
  private readonly bed: BedDef;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private nextClank: number;
  private stopped = false;

  constructor(
    private readonly engine: AudioEngine,
    readonly roomId: string,
    fadeInSecs: number,
  ) {
    const ctx = engine.ctx;
    const now = engine.now;
    const bed = bedFor(engine.data.ambience, roomId);
    this.bed = bed;

    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(bed.gain, now + fadeInSecs);
    this.out.connect(engine.buses.ambience);

    // Rumble.
    const r = bed.rumble;
    const rumble = engine.noiseSource(r.colour, now);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = r.lowpassHz;
    const rg = this.swell(r.gain, r.lfoDepth, r.lfoHz);
    rumble.connect(lp).connect(rg).connect(this.out);
    this.sources.push(rumble);

    // Murmur: one noise source split into formant bands. Narrow bands lose energy, so each band's
    // gain is scaled by sqrt(q) to keep `gain` roughly meaning "overall murmur level".
    const m = bed.murmur;
    const murmur = engine.noiseSource(m.colour, now);
    const perBand = (m.gain * Math.sqrt(m.q)) / Math.sqrt(m.formantsHz.length);
    for (const f of m.formantsHz) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = m.q;
      const g = this.swell(perBand, m.lfoDepth, m.lfoHz * (0.6 + engine.rand() * 0.8));
      murmur.connect(bp).connect(g).connect(this.out);
    }
    this.sources.push(murmur);

    // Hiss.
    const h = bed.hiss;
    const hiss = engine.noiseSource(h.colour, now);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = h.highpassHz;
    const hg = ctx.createGain();
    hg.gain.value = h.gain;
    hiss.connect(hp).connect(hg).connect(this.out);
    this.sources.push(hiss);

    this.nextClank = now + bed.clank.everySecs * engine.rand();
    engine.addTicker(this);
  }

  /** A gain node whose level swells between gain*(1-depth) and gain via a sine LFO. */
  private swell(gain: number, depth: number, hz: number): GainNode {
    const ctx = this.engine.ctx;
    const g = ctx.createGain();
    g.gain.value = gain * (1 - depth / 2);
    if (hz > 0 && depth > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = hz;
      const amt = ctx.createGain();
      amt.gain.value = (gain * depth) / 2;
      lfo.connect(amt).connect(g.gain);
      lfo.start(this.engine.now + this.engine.rand() / Math.max(hz, 0.01));
      this.sources.push(lfo);
    }
    return g;
  }

  tick(_now: number, until: number): void {
    if (this.stopped) return;
    const c = this.bed.clank;
    const e = this.engine;
    while (this.nextClank < until) {
      e.play(c.sound, {
        at: this.nextClank,
        volume: c.gain,
        pan: (e.rand() * 2 - 1) * c.panSpread,
        lowpassHz: c.lowpassHz,
        bus: 'ambience',
      });
      this.nextClank += c.everySecs + (e.rand() * 2 - 1) * c.jitterSecs;
    }
  }

  fadeOut(secs: number): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.engine.now;
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + secs);
    for (const s of this.sources) s.stop(now + secs + 0.05);
    this.engine.removeTicker(this);
    const first = this.sources[0];
    if (first) first.onended = () => this.out.disconnect();
  }
}
