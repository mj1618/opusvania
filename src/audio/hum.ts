import type { HumColourDef } from './data';
import { type AudioEngine, dbToGain } from './engine';
import type { NoiseColour } from './noise';
import { type Point, spatialize } from './spatial';

export type HumStatus = 'humming' | 'carried' | 'flying' | 'stopped';

const OPEN_HZ = 20000;

/**
 * A Tallage sound source: filtered colour noise plus a quiet tonal core with vibrato and a slow
 * amplitude wobble, positioned in the world. The player can `seize` it (pitch-drop + gate + reverb
 * tail, then a muffled "carried" hum) and `levy` it (whoosh to a target, land thud coloured by type).
 *
 *   noise → filter → noiseGain ┐
 *   osc (+vibrato) → toneGain ─┴→ wobble → level → carry LP → dist → pan → sfx bus
 *                                                                     └→ send → reverb
 */
export class HumVoice {
  pos: Point;
  private readonly def: HumColourDef;
  private readonly noise: AudioBufferSourceNode;
  private readonly filter: BiquadFilterNode;
  private readonly osc: OscillatorNode;
  private readonly lfos: OscillatorNode[] = [];
  private readonly level: GainNode;
  private readonly carry: BiquadFilterNode;
  private readonly dist: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly send: GainNode;
  private readonly base: number;
  private state: 'humming' | 'carried' | 'stopped' = 'humming';
  private flightUntil = 0;
  private gainScale = 1;

  constructor(
    private readonly engine: AudioEngine,
    readonly id: string,
    readonly colour: NoiseColour,
    pos: Point,
  ) {
    const ctx = engine.ctx;
    const now = engine.now;
    const hums = engine.data.hums;
    const def = hums.colours[colour];
    this.def = def;
    this.pos = { ...pos };
    this.base = hums.baseGain;

    this.noise = engine.noiseSource(colour, now);
    this.filter = ctx.createBiquadFilter();
    this.filter.type = def.filter.type;
    this.filter.frequency.value = def.filter.freq;
    this.filter.Q.value = def.filter.q;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = def.noiseGain;

    this.osc = ctx.createOscillator();
    this.osc.type = def.tone.wave;
    this.osc.frequency.value = def.tone.freq;
    const toneGain = ctx.createGain();
    toneGain.gain.value = def.tone.gain;
    if (def.tone.vibratoHz > 0 && def.tone.vibratoCents > 0) {
      const vib = ctx.createOscillator();
      vib.frequency.value = def.tone.vibratoHz;
      const vibAmt = ctx.createGain();
      vibAmt.gain.value = def.tone.vibratoCents;
      vib.connect(vibAmt).connect(this.osc.detune);
      this.lfos.push(vib);
    }

    const wobble = ctx.createGain();
    wobble.gain.value = 1 - def.wobble.depth / 2;
    if (def.wobble.hz > 0 && def.wobble.depth > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = def.wobble.hz * (0.85 + engine.rand() * 0.3);
      const amt = ctx.createGain();
      amt.gain.value = def.wobble.depth / 2;
      lfo.connect(amt).connect(wobble.gain);
      this.lfos.push(lfo);
    }

    this.level = ctx.createGain();
    this.level.gain.setValueAtTime(0, now);
    this.level.gain.linearRampToValueAtTime(this.base, now + hums.fadeInSecs);
    this.carry = ctx.createBiquadFilter();
    this.carry.type = 'lowpass';
    this.carry.frequency.value = OPEN_HZ;
    this.dist = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.send = ctx.createGain();
    this.send.gain.value = 0.08;

    this.noise.connect(this.filter).connect(noiseGain).connect(wobble);
    this.osc.connect(toneGain).connect(wobble);
    wobble.connect(this.level).connect(this.carry).connect(this.dist).connect(this.panner);
    this.panner.connect(engine.buses.sfx);
    this.panner.connect(this.send).connect(engine.reverbIn);

    this.osc.start(now);
    for (const l of this.lfos) l.start(now);
    this.applySpatial(now, true);
    engine.trackVoice(1);
  }

  get status(): HumStatus {
    if (this.state === 'stopped') return 'stopped';
    return this.engine.now < this.flightUntil ? 'flying' : this.state;
  }

  get seizable(): boolean {
    return this.def.seizable;
  }

  /** Moves the source. Spatial params follow on the next tick (not while it is in flight). */
  setPosition(p: Point): void {
    this.pos = { ...p };
  }

  /** Fades the voice to `gain` (1 = the colour's base level) over `secs`. */
  fade(gain: number, secs = 0.3): void {
    this.gainScale = gain;
    this.ramp(this.level.gain, this.targetLevel(), secs);
  }

  /** Shifts the hum's pitch (tone, noise rate and filter) by `ratio` over `secs`. */
  pitch(ratio: number, secs = 0.2): void {
    const now = this.engine.now;
    expRamp(this.osc.frequency, this.def.tone.freq * ratio, now, secs);
    expRamp(this.noise.playbackRate, ratio, now, secs);
    expRamp(this.filter.frequency, Math.min(OPEN_HZ, this.def.filter.freq * ratio), now, secs);
  }

  /** Explicit pan override (-1..1); spatial updates resume on the next setPosition/tick. */
  pan(v: number): void {
    this.panner.pan.setTargetAtTime(v, this.engine.now, 0.03);
  }

  /**
   * Seize: a satisfying cut. Transient click, pitch drops, the voice gates shut while the reverb
   * send is opened so a tail rings on, then it comes back as a quiet, muffled "carried" hum at
   * `holder`. Returns false (and plays a refusal crackle) if the colour can't be seized.
   */
  seize(holder?: Point): boolean {
    const e = this.engine;
    const s = e.data.hums.seize;
    if (this.state !== 'humming' || this.status === 'flying') return false;
    if (!this.def.seizable) {
      e.play(s.refuseSound, { x: this.pos.x, y: this.pos.y });
      const now = e.now;
      const g = this.level.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(this.targetLevel(), now);
      g.linearRampToValueAtTime(this.targetLevel() * 0.2, now + 0.03);
      g.linearRampToValueAtTime(this.targetLevel(), now + 0.25);
      return false;
    }
    const now = e.now;
    e.play(s.sound, { x: this.pos.x, y: this.pos.y });

    const drop = s.dropRatio;
    expRamp(this.osc.frequency, this.def.tone.freq * drop, now, s.dropSecs);
    expRamp(this.noise.playbackRate, drop, now, s.dropSecs);
    expRamp(this.filter.frequency, this.def.filter.freq * drop, now, s.dropSecs);

    this.send.gain.cancelScheduledValues(now);
    this.send.gain.setValueAtTime(s.reverbSend, now);

    const gateAt = now + s.gateAtSecs;
    const shut = gateAt + s.gateSecs;
    const g = this.level.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(this.targetLevel(), now);
    g.setValueAtTime(this.targetLevel(), gateAt);
    g.linearRampToValueAtTime(0, shut);

    // Silent while gated: restore pitch, close the carry filter, then fade the carried hum in.
    const back = shut + 0.08;
    this.osc.frequency.setValueAtTime(this.def.tone.freq, back);
    this.noise.playbackRate.setValueAtTime(1, back);
    this.filter.frequency.setValueAtTime(this.def.filter.freq, back);
    this.carry.frequency.setValueAtTime(s.carryLowpassHz, back);
    this.send.gain.setValueAtTime(0.03, back);
    this.state = 'carried';
    g.setValueAtTime(0, back);
    g.linearRampToValueAtTime(this.targetLevel(), back + s.carryFadeSecs);
    if (holder) this.setPosition(holder);
    return true;
  }

  /**
   * Levy: throw the (carried or humming) sound at `target`. A whoosh flies there over `flightSecs`,
   * then the colour's land thud plays. With `rehum` the sound hums again at the target;
   * otherwise it stops. Returns the context time it lands.
   */
  levy(target: Point, opts: { flightSecs?: number; rehum?: boolean } = {}): number {
    const e = this.engine;
    const lv = e.data.hums.levy;
    const now = e.now;
    if (this.state === 'stopped') return now;
    const flight = opts.flightSecs ?? lv.flightSecs;
    const rehum = opts.rehum ?? lv.rehum;
    const land = now + flight;

    e.whoosh(this.colour, this.pos, target, flight, now);
    e.play(this.def.land, { at: land, x: target.x, y: target.y });

    const g = this.level.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(this.currentLevel(), now);
    g.linearRampToValueAtTime(0, now + 0.05);
    this.flightUntil = land;
    this.pos = { ...target };
    if (!rehum) {
      this.stop(0.05, land);
      return land;
    }
    this.state = 'humming';
    this.carry.frequency.setValueAtTime(OPEN_HZ, land);
    this.send.gain.setValueAtTime(0.08, land);
    this.applySpatial(land, true);
    g.setValueAtTime(0, land);
    g.linearRampToValueAtTime(this.targetLevel(), land + lv.rehumFadeSecs);
    return land;
  }

  /**
   * Sim-driven levy, part 1 (L3): the sound leaves Kid's hands. A whoosh starts and the voice is
   * silent and `flying` until `land()` (the sim decides when and where it lands).
   */
  fly(from: Point, towards: Point): void {
    const e = this.engine;
    const now = e.now;
    if (this.state === 'stopped') return;
    e.whoosh(this.colour, from, towards, e.data.hums.levy.flightSecs, now);
    const g = this.level.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(this.currentLevel(), now);
    g.linearRampToValueAtTime(0, now + 0.05);
    this.flightUntil = Number.POSITIVE_INFINITY;
    this.pos = { ...from };
  }

  /**
   * Sim-driven levy, part 2, and every "the sound is back somewhere" case (landed object, pushed
   * home, snatched, absorbed, revoiced): plays the colour's land thud (optional) and hums again at
   * `at`, uncarried.
   */
  land(at: Point, thud = true): void {
    const e = this.engine;
    const now = e.now;
    if (this.state === 'stopped') return;
    if (thud) e.play(this.def.land, { x: at.x, y: at.y });
    this.flightUntil = 0;
    this.pos = { ...at };
    this.state = 'humming';
    this.carry.frequency.setValueAtTime(OPEN_HZ, now);
    this.send.gain.setValueAtTime(0.08, now);
    this.applySpatial(now, true);
    const g = this.level.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(this.targetLevel(), now + e.data.hums.levy.rehumFadeSecs);
  }

  /** Fades out and releases the voice. */
  stop(fadeSecs = 0.1, at = this.engine.now): void {
    if (this.state === 'stopped') return;
    this.state = 'stopped';
    const end = at + fadeSecs;
    const g = this.level.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(at > this.engine.now ? 0 : this.currentLevel(), at);
    g.linearRampToValueAtTime(0, end);
    this.noise.stop(end + 0.02);
    this.osc.stop(end + 0.02);
    for (const l of this.lfos) l.stop(end + 0.02);
    this.osc.onended = () => {
      this.panner.disconnect();
      this.engine.trackVoice(-1);
      this.engine.forgetHum(this);
    };
  }

  /** Engine tick: follows position relative to the listener (skipped while in flight). */
  updateSpatial(): void {
    if (this.state === 'stopped' || this.engine.now < this.flightUntil) return;
    this.applySpatial(this.engine.now, false);
  }

  info(): { id: string; colour: NoiseColour; status: HumStatus; x: number; y: number } {
    return { id: this.id, colour: this.colour, status: this.status, x: this.pos.x, y: this.pos.y };
  }

  private applySpatial(at: number, immediate: boolean): void {
    const sp = spatialize(this.pos, this.engine.listener, this.engine.data.mix.spatial);
    if (immediate) {
      this.dist.gain.setValueAtTime(sp.gain, at);
      this.panner.pan.setValueAtTime(sp.pan, at);
    } else {
      this.dist.gain.setTargetAtTime(sp.gain, at, 0.05);
      this.panner.pan.setTargetAtTime(sp.pan, at, 0.05);
    }
  }

  private targetLevel(): number {
    const carried = this.state === 'carried' ? dbToGain(this.engine.data.hums.seize.carryGainDb) : 1;
    return this.base * this.gainScale * carried;
  }

  private currentLevel(): number {
    return this.level.gain.value;
  }

  private ramp(p: AudioParam, to: number, secs: number): void {
    const now = this.engine.now;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(to, now + Math.max(0.005, secs));
  }
}

function expRamp(p: AudioParam, to: number, at: number, secs: number): void {
  p.cancelScheduledValues(at);
  p.setValueAtTime(Math.max(p.value, 1e-4), at);
  p.exponentialRampToValueAtTime(Math.max(to, 1e-4), at + Math.max(0.005, secs));
}
