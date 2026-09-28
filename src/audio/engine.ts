import { AmbienceBed } from './ambience';
import {
  type AudioData,
  audioData,
  BUSES,
  type BusName,
  type DuckName,
  type MuffleKind,
  type SoundDef,
} from './data';
import { HumVoice } from './hum';
import { MusicDirector } from './music';
import { makeNoise, type NoiseColour } from './noise';
import { type AudioSettings, DEFAULT_SETTINGS } from './settings';
import { type Point, spatialize } from './spatial';
import { zzfxBuild } from './zzfx';

export interface PlayOpts {
  /** Context time to start at (default: now). */
  at?: number;
  /** World position; if given, the sound is panned and attenuated relative to the listener. */
  x?: number;
  y?: number;
  /** Linear volume multiplier. */
  volume?: number;
  /** Playback-rate multiplier (before random variation). */
  pitch?: number;
  /** Explicit pan (-1..1); overrides the spatial pan. */
  pan?: number;
  /** Optional low-pass cutoff (distance/muffle colouring). */
  lowpassHz?: number;
  bus?: BusName;
  /** Skip random pitch/volume variation (offline level checks). */
  exact?: boolean;
}

export interface LoopHandle {
  setGain(g: number, tau?: number): void;
  stop(fadeSecs?: number): void;
}

export const dbToGain = (db: number): number => 10 ** (db / 20);

/** Something that wants scheduling every tick with a lookahead window [now, until). */
export interface Ticker {
  tick(now: number, until: number): void;
}

/**
 * The Web Audio graph and voice management. Works on any BaseAudioContext, so the same code runs
 * live (AudioContext) and offline (OfflineAudioContext, see offline.ts). Never touches the sim or
 * the DOM; randomness is Math.random (audio is outside the deterministic sim).
 *
 *   buses.sfx/ui/ambience ─┐
 *   buses.music → duck ────┼→ master → muffle (low-pass) → limiter → destination
 *   reverbIn → convolver ──┘
 */
export class AudioEngine {
  readonly data: AudioData;
  readonly buses: Record<BusName, GainNode>;
  /** Send here for reverb (seize tails). */
  readonly reverbIn: GainNode;
  listener: Point = { x: 0, y: 0 };
  rand: () => number = Math.random;
  settings: AudioSettings;
  muffleKind: MuffleKind = 'none';
  readonly music: MusicDirector;

  private readonly master: GainNode;
  private readonly muffle: BiquadFilterNode;
  private readonly musicDuck: GainNode;
  private readonly sfxCache = new Map<string, AudioBuffer>();
  private readonly noiseCache = new Map<NoiseColour, AudioBuffer>();
  private readonly lastPlayed = new Map<string, number>();
  private readonly activeByName = new Map<string, number>();
  private readonly tickers = new Set<Ticker>();
  private readonly hums = new Map<string, HumVoice>();
  private readonly loops = new Map<string, LoopHandle>();
  private bed: AmbienceBed | null = null;
  private bedRoom: string | null = null;
  private activeVoices = 0;
  private humSeq = 0;
  readonly counters = { played: 0, dropped: 0, playedByName: {} as Record<string, number> };

  constructor(
    readonly ctx: BaseAudioContext,
    data: AudioData = audioData(),
    settings: AudioSettings = DEFAULT_SETTINGS,
  ) {
    this.data = data;
    this.settings = { ...settings };
    const mix = data.mix;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = mix.limiter.thresholdDb;
    limiter.knee.value = mix.limiter.kneeDb;
    limiter.ratio.value = mix.limiter.ratio;
    limiter.attack.value = mix.limiter.attackSecs;
    limiter.release.value = mix.limiter.releaseSecs;
    limiter.connect(ctx.destination);

    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = mix.muffle.none;
    this.muffle.Q.value = 0.5;
    this.muffle.connect(limiter);

    this.master = ctx.createGain();
    this.master.connect(this.muffle);

    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.master);

    const buses = {} as Record<BusName, GainNode>;
    for (const b of BUSES) {
      const g = ctx.createGain();
      g.connect(b === 'music' ? this.musicDuck : this.master);
      buses[b] = g;
    }
    this.buses = buses;

    const convolver = ctx.createConvolver();
    convolver.buffer = this.impulse(mix.reverb.seconds, mix.reverb.decay);
    const ret = ctx.createGain();
    ret.gain.value = mix.reverb.returnGain;
    this.reverbIn = ctx.createGain();
    this.reverbIn.connect(convolver).connect(ret).connect(buses.sfx);

    this.applySettings(0);
    this.music = new MusicDirector(this);
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  // ---- mixer ---------------------------------------------------------------------------------

  applySettings(tau = 0.02): void {
    const s = this.settings;
    const set = (p: AudioParam, v: number) => {
      if (tau > 0) p.setTargetAtTime(v, this.now, tau);
      else p.value = v;
    };
    set(this.master.gain, s.muted ? 0 : s.master * this.data.mix.buses.master);
    for (const b of BUSES) set(this.buses[b].gain, s[b] * this.data.mix.buses[b]);
  }

  /** Ducks the music bus (big hits). Overlapping ducks restart the envelope from where it is. */
  duck(name: DuckName, at = this.now): void {
    const d = this.data.mix.duck[name];
    const g = this.musicDuck.gain;
    const t = Math.max(at, this.now);
    const target = dbToGain(-d.depthDb);
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.min(g.value, 1), t);
    g.linearRampToValueAtTime(target, t + d.attackSecs);
    g.setValueAtTime(target, t + d.attackSecs + d.holdSecs);
    g.linearRampToValueAtTime(1, t + d.attackSecs + d.holdSecs + d.releaseSecs);
  }

  /** Master low-pass for pause/underwater. */
  setMuffle(kind: MuffleKind): void {
    this.muffleKind = kind;
    const m = this.data.mix.muffle;
    this.muffle.frequency.setTargetAtTime(m[kind], this.now, m.tauSecs);
  }

  // ---- buffers -------------------------------------------------------------------------------

  /** Mixed ZzFX layers for a sound, built once at the context rate with no pitch jitter. */
  sfxBuffer(name: string, def: SoundDef): AudioBuffer {
    let buf = this.sfxCache.get(name);
    if (!buf) {
      const sr = this.ctx.sampleRate;
      const layers = def.layers.map((l) => zzfxBuild(l, sr, () => 0.5));
      const len = Math.max(1, ...layers.map((l) => l.length));
      buf = this.ctx.createBuffer(1, len, sr);
      const out = buf.getChannelData(0);
      for (const l of layers) for (let i = 0; i < l.length; i++) out[i] = (out[i] ?? 0) + (l[i] ?? 0);
      this.sfxCache.set(name, buf);
    }
    return buf;
  }

  /** A seamlessly looping mono noise buffer of the given colour. */
  noiseBuffer(colour: NoiseColour): AudioBuffer {
    let buf = this.noiseCache.get(colour);
    if (!buf) {
      const sr = this.ctx.sampleRate;
      const n = Math.round(this.data.mix.noiseSeconds * sr);
      buf = this.ctx.createBuffer(1, n, sr);
      buf.getChannelData(0).set(makeNoise(colour, n, this.rand));
      this.noiseCache.set(colour, buf);
    }
    return buf;
  }

  /** Looping noise source starting at a random offset (so voices of one colour decorrelate). */
  noiseSource(colour: NoiseColour, at = this.now): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(colour);
    src.loop = true;
    src.start(at, this.rand() * this.data.mix.noiseSeconds);
    return src;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const n = Math.round(seconds * sr);
    const buf = this.ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (this.rand() * 2 - 1) * (1 - i / n) ** decay;
    }
    return buf;
  }

  // ---- one-shots -----------------------------------------------------------------------------

  hasSound(name: string): boolean {
    return name in this.data.sfx.sounds;
  }

  /** Plays a sound from sfx.json. Returns false if it was unknown, rate-limited or over budget. */
  play(name: string, o: PlayOpts = {}): boolean {
    const def = this.data.sfx.sounds[name];
    if (!def) {
      this.counters.dropped++;
      return false;
    }
    const at = Math.max(o.at ?? this.now, this.now);
    const last = this.lastPlayed.get(name);
    const active = this.activeByName.get(name) ?? 0;
    if (
      (last !== undefined && Math.abs(at - last) < def.cooldown) ||
      active >= def.maxVoices ||
      this.activeVoices >= this.data.mix.maxVoices
    ) {
      this.counters.dropped++;
      return false;
    }
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.sfxBuffer(name, def);
    const v = o.exact ? 0 : this.rand() * 2 - 1;
    const w = o.exact ? 0 : this.rand() * 2 - 1;
    src.playbackRate.value = (o.pitch ?? 1) * 2 ** ((v * def.pitchVar) / 12);

    let gain = (o.volume ?? 1) * dbToGain(w * def.volVarDb);
    let pan = o.pan ?? 0;
    if (o.x !== undefined && o.y !== undefined) {
      const sp = spatialize({ x: o.x, y: o.y }, this.listener, this.data.mix.spatial);
      gain *= sp.gain;
      if (o.pan === undefined) pan = sp.pan;
    }
    if (gain <= 0.0005) {
      this.counters.dropped++;
      return false;
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    let head: AudioNode = src;
    if (o.lowpassHz) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lowpassHz;
      head = head.connect(lp);
    }
    head.connect(g);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.buses[o.bus ?? def.bus]);

    src.start(at);
    this.lastPlayed.set(name, at);
    this.activeByName.set(name, active + 1);
    this.activeVoices++;
    src.onended = () => {
      src.disconnect();
      p.disconnect();
      this.activeByName.set(name, (this.activeByName.get(name) ?? 1) - 1);
      this.activeVoices--;
    };
    if (def.duck) this.duck(def.duck, at);
    this.counters.played++;
    this.counters.playedByName[name] = (this.counters.playedByName[name] ?? 0) + 1;
    return true;
  }

  /**
   * A named noise loop from sfx.json `loops` (e.g. wall-slide). Gain 0 stops it; >0 starts it if
   * needed and ramps the level.
   */
  loopGain(name: string, gain: number): void {
    const existing = this.loops.get(name);
    if (gain <= 0) {
      if (existing) {
        existing.stop(0.06);
        this.loops.delete(name);
      }
      return;
    }
    if (existing) {
      existing.setGain(gain);
      return;
    }
    const def = this.data.sfx.loops[name];
    if (!def) return;
    const ctx = this.ctx;
    const src = this.noiseSource(def.colour);
    const f = ctx.createBiquadFilter();
    f.type = def.filter.type;
    f.frequency.value = def.filter.freq;
    f.Q.value = def.filter.q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.buses[def.bus]);
    this.activeVoices++;
    const handle: LoopHandle = {
      setGain: (v, tau = 0.03) => g.gain.setTargetAtTime(v * def.gain, this.now, tau),
      stop: (fade = 0.06) => {
        g.gain.setTargetAtTime(0, this.now, fade / 3);
        src.stop(this.now + fade * 2);
        src.onended = () => {
          g.disconnect();
          this.activeVoices--;
        };
      },
    };
    handle.setGain(gain, 0.02);
    this.loops.set(name, handle);
  }

  // ---- hums (Tallage sound sources) ----------------------------------------------------------

  /** Starts a hum voice for a world sound source. Re-using a sourceId replaces the old voice. */
  hum(sourceId: string | undefined, colour: NoiseColour, pos: Point): HumVoice {
    const id = sourceId ?? `hum${++this.humSeq}`;
    this.hums.get(id)?.stop();
    const v = new HumVoice(this, id, colour, pos);
    this.hums.set(id, v);
    return v;
  }

  getHum(id: string): HumVoice | undefined {
    return this.hums.get(id);
  }

  humInfo(): ReturnType<HumVoice['info']>[] {
    return [...this.hums.values()].map((h) => h.info());
  }

  /** Called by HumVoice when it has fully stopped. */
  forgetHum(v: HumVoice): void {
    if (this.hums.get(v.id) === v) this.hums.delete(v.id);
  }

  /**
   * A thrown-sound whoosh: noise of the given colour through a rising band-pass, panned from
   * `from` to `to` over `secs`.
   */
  whoosh(colour: NoiseColour, from: Point, to: Point, secs: number, at = this.now): void {
    const ctx = this.ctx;
    const hc = this.data.hums.colours[colour];
    const src = this.noiseSource(colour, at);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(hc.whoosh.fromHz, at);
    bp.frequency.exponentialRampToValueAtTime(hc.whoosh.toHz, at + secs * 0.7);
    bp.frequency.exponentialRampToValueAtTime(hc.whoosh.fromHz, at + secs);
    const g = ctx.createGain();
    const peak = this.data.hums.levy.whooshGain * 2.5;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + secs * 0.65);
    g.gain.exponentialRampToValueAtTime(0.0001, at + secs);
    const p = ctx.createStereoPanner();
    const sp = this.data.mix.spatial;
    const a = spatialize(from, this.listener, sp);
    const b = spatialize(to, this.listener, sp);
    p.pan.setValueAtTime(a.pan, at);
    p.pan.linearRampToValueAtTime(b.pan, at + secs);
    const dist = ctx.createGain();
    dist.gain.setValueAtTime(Math.max(a.gain, 0.0001), at);
    dist.gain.linearRampToValueAtTime(Math.max(b.gain, 0.0001), at + secs);
    src.connect(bp).connect(g).connect(dist).connect(p).connect(this.buses.sfx);
    src.stop(at + secs + 0.05);
    this.activeVoices++;
    src.onended = () => {
      p.disconnect();
      this.activeVoices--;
    };
  }

  // ---- ambience ------------------------------------------------------------------------------

  /** Crossfades the ambience bed to the room's parameters (no-op if already there). */
  setRoom(roomId: string): void {
    if (this.bedRoom === roomId) return;
    const fade = this.data.ambience.fadeSecs;
    this.bed?.fadeOut(fade);
    this.bed = new AmbienceBed(this, roomId, fade);
    this.bedRoom = roomId;
  }

  get room(): string | null {
    return this.bedRoom;
  }

  // ---- scheduling ----------------------------------------------------------------------------

  addTicker(t: Ticker): void {
    this.tickers.add(t);
  }

  removeTicker(t: Ticker): void {
    this.tickers.delete(t);
  }

  /** Runs schedulers (music, ambience) over the lookahead window and updates spatial voices. */
  tick(): void {
    const now = this.now;
    const until = now + this.data.mix.lookaheadSecs;
    for (const t of this.tickers) t.tick(now, until);
    for (const h of this.hums.values()) h.updateSpatial();
  }

  voiceStats(): { active: number; hums: number; loops: number; byName: Record<string, number> } {
    const byName: Record<string, number> = {};
    for (const [k, v] of this.activeByName) if (v > 0) byName[k] = v;
    return { active: this.activeVoices, hums: this.hums.size, loops: this.loops.size, byName };
  }

  /** Internal: voice accounting for long-lived voices (hums, beds). */
  trackVoice(delta: number): void {
    this.activeVoices += delta;
  }
}
