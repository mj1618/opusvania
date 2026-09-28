import { type InstrumentDef, LAYERS, type LayerName, type PatternStep } from './data';
import type { AudioEngine, Ticker } from './engine';
import { barIndexAt, beatSeconds, type Meter, nextBarTime, stepsInWindow } from './music-clock';

export const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

export interface MusicStats {
  playing: boolean;
  layer: LayerName;
  /** Context time the last requested layer change lands (a bar line), or null. */
  switchAt: number | null;
  bar: number;
  bpm: number;
  notes: number;
}

/**
 * Music director stub. Both layers are always sequenced against the AudioContext clock with a
 * lookahead window; a layer request crossfades the layer gains starting exactly on the next bar
 * line. The loop itself is a placeholder to prove the scheduling, not a composition.
 */
export class MusicDirector implements Ticker {
  private readonly out: GainNode;
  private readonly layerGain: Record<LayerName, GainNode>;
  private origin: number | null = null;
  private scheduledUntil = 0;
  private layer: LayerName;
  private switchAt: number | null = null;
  private notes = 0;

  constructor(private readonly engine: AudioEngine) {
    const ctx = engine.ctx;
    this.out = ctx.createGain();
    this.out.connect(engine.buses.music);
    this.layer = engine.data.music.startLayer;
    const lg = {} as Record<LayerName, GainNode>;
    for (const l of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      lg[l] = g;
    }
    this.layerGain = lg;
  }

  get meter(): Meter {
    const m = this.engine.data.music;
    return { bpm: m.bpm, beatsPerBar: m.beatsPerBar, stepsPerBeat: m.stepsPerBeat };
  }

  get playing(): boolean {
    return this.origin !== null;
  }

  start(layer: LayerName = this.layer, at = this.engine.now + 0.05): void {
    if (this.origin !== null) {
      this.request(layer);
      return;
    }
    this.origin = at;
    this.scheduledUntil = at;
    this.layer = layer;
    this.switchAt = null;
    const now = this.engine.now;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(1, now);
    for (const l of LAYERS) {
      this.layerGain[l].gain.cancelScheduledValues(now);
      this.layerGain[l].gain.setValueAtTime(l === layer ? 1 : 0, now);
    }
    this.engine.addTicker(this);
  }

  stop(fadeSecs = 1): void {
    if (this.origin === null) return;
    const now = this.engine.now;
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fadeSecs);
    this.origin = null;
    this.switchAt = null;
    this.engine.removeTicker(this);
  }

  /** Crossfades to `layer`, starting on the next bar line. Returns that bar's context time. */
  request(layer: LayerName): number | null {
    if (this.origin === null) {
      this.layer = layer;
      return null;
    }
    if (layer === this.layer) return this.switchAt;
    const m = this.engine.data.music;
    const at = nextBarTime(this.engine.now, this.origin, this.meter, m.minLeadSecs);
    const end = at + m.crossfadeBeats * beatSeconds(this.meter);
    for (const l of LAYERS) {
      const g = this.layerGain[l].gain;
      g.cancelScheduledValues(at);
      g.setValueAtTime(l === layer ? 0 : 1, at);
      g.linearRampToValueAtTime(l === layer ? 1 : 0, end);
    }
    this.layer = layer;
    this.switchAt = at;
    return at;
  }

  tick(_now: number, until: number): void {
    if (this.origin === null || until <= this.scheduledUntil) return;
    const m = this.engine.data.music;
    for (const { index, time } of stepsInWindow(this.scheduledUntil, until, this.origin, this.meter)) {
      for (const l of LAYERS) {
        for (const track of m.layers[l]) {
          const step = track.steps[index % track.steps.length];
          const inst = m.instruments[track.instrument];
          if (step && inst) this.note(inst, step, time, this.layerGain[l]);
        }
      }
    }
    this.scheduledUntil = until;
  }

  stats(): MusicStats {
    const now = this.engine.now;
    return {
      playing: this.playing,
      layer: this.layer,
      switchAt: this.switchAt !== null && this.switchAt > now ? this.switchAt : null,
      bar: this.origin === null ? -1 : barIndexAt(now, this.origin, this.meter),
      bpm: this.meter.bpm,
      notes: this.notes,
    };
  }

  private note(inst: InstrumentDef, step: NonNullable<PatternStep>, t: number, dest: AudioNode): void {
    const ctx = this.engine.ctx;
    const env = ctx.createGain();
    env.connect(dest);
    let end: number;
    const srcs: AudioScheduledSourceNode[] = [];
    if (inst.kind === 'tone') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = inst.lowpassHz;
      lp.connect(env);
      const root = this.engine.data.music.rootMidi + 12 * inst.octave;
      for (const semi of step) {
        const detunes = inst.detuneCents > 0 ? [-inst.detuneCents, inst.detuneCents] : [0];
        for (const d of detunes) {
          const o = ctx.createOscillator();
          o.type = inst.wave;
          o.frequency.value = midiToHz(root + semi);
          o.detune.value = d;
          o.connect(lp);
          srcs.push(o);
        }
      }
      const peak = inst.gain / Math.sqrt(srcs.length);
      end = t + inst.attackSecs + inst.releaseSecs;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + inst.attackSecs + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
    } else if (inst.kind === 'noise') {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = inst.highpassHz;
      hp.connect(env);
      const s = ctx.createBufferSource();
      s.buffer = this.engine.noiseBuffer('white');
      s.loop = true;
      s.connect(hp);
      srcs.push(s);
      end = t + inst.attackSecs + inst.releaseSecs;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(inst.gain, t + inst.attackSecs + 0.001);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
    } else {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(inst.startHz, t);
      o.frequency.exponentialRampToValueAtTime(inst.endHz, t + inst.releaseSecs * 0.5);
      o.connect(env);
      srcs.push(o);
      end = t + inst.releaseSecs;
      env.gain.setValueAtTime(inst.gain, t);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
    }
    for (const s of srcs) {
      if (s instanceof AudioBufferSourceNode) s.start(t, this.engine.rand() * 2);
      else s.start(t);
      s.stop(end + 0.02);
    }
    const last = srcs[srcs.length - 1];
    if (last) last.onended = () => env.disconnect();
    this.notes++;
  }
}
