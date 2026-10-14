/**
 * The part of the director that live play and offline clips share: for each sim step it routes the
 * events and the world's own cues and plays them; for each render frame it aims the continuous
 * layers. With no engine (muted) it still routes, so `__game.audio.cues(n)` works without sound.
 */
import type { SimEvent } from '../sim/events';
import { dbToGain } from './dsp';
import type { AudioEngine } from './engine';
import { type ProMix, type ProView, proCues, proMix } from './prologue';
import {
  type AudioCam,
  type AudioSnap,
  ambient,
  type Cue,
  type Layers,
  layers,
  type RouteContext,
  route,
} from './router';
import { AUDIO } from './tuning';

const KEEP = 256;

/** Rate limits per sound family (s): wingbeats never closer than 80 ms. */
const GAP: Partial<Record<Cue['sound'], number>> = { wing: AUDIO.hero.wingGapS, dust: 0.06, scrape: 0.04 };

export class Conductor {
  /** The last cues routed, newest last. */
  readonly recent: Cue[] = [];
  private last: AudioSnap | null = null;
  private lastLayers = -Infinity;
  private lastAt = new Map<string, number>();
  /** The prologue as last seen, and how it bends the layers (null: the game proper). */
  private pro: ProView | null = null;
  private mix: ProMix | null = null;

  constructor(
    readonly ctx: RouteContext,
    public engine: AudioEngine | null = null,
  ) {}

  /** One sim step: its events and the state after it, played at context time `when`. */
  step(events: readonly SimEvent[], snap: AudioSnap, cam: AudioCam, when: number, play = true): Cue[] {
    this.last = snap;
    const cues: Cue[] = [];
    events.forEach((e, i) => {
      cues.push(...route(e, i, snap, this.ctx));
    });
    cues.push(...ambient(snap, cam, this.ctx, this.mix));
    const kept: Cue[] = [];
    for (const c of cues) {
      // In the prologue the lanterns are dark set pieces: they neither notice nor refuse her.
      if (this.mix && c.bus === 'lantern') continue;
      const gap = GAP[c.sound];
      const t = snap.frame / 60 + c.delay;
      if (gap !== undefined) {
        const prev = this.lastAt.get(c.sound) ?? -Infinity;
        if (t - prev < gap - 1e-6) continue;
        this.lastAt.set(c.sound, t);
      }
      kept.push(c);
    }
    this.emit(kept, cam, when, play);
    return kept;
  }

  /** The state to sound before any sim step has run (the prologue's breath runs with the sim stopped). */
  prime(snap: AudioSnap): void {
    if (!this.last) this.last = snap;
  }

  private emit(cues: Cue[], cam: AudioCam, when: number, play: boolean): void {
    for (const c of cues) {
      this.recent.push(c);
      if (play && this.engine) this.engine.play(c, when, cam);
    }
    if (this.recent.length > KEEP) this.recent.splice(0, this.recent.length - KEEP);
  }

  /** One render frame of the prologue (or null once it is over): its cues now, its mix for the layers. */
  prologue(view: ProView | null, cam: AudioCam, when: number, play = true): Cue[] {
    const v = view && !view.done ? view : null;
    const cues = v ? proCues(this.pro, v, cam, this.ctx) : [];
    this.emit(cues, cam, when, play);
    this.pro = v;
    this.mix = v ? proMix(v) : null;
    return cues;
  }

  /** One render frame: aim the continuous layers (at most every `layerEvery` s of render time). */
  frame(cam: AudioCam, clock: number, when: number, force = false): void {
    if (!this.engine || !this.last) return;
    if (!force && clock - this.lastLayers < AUDIO.layerEvery - 1e-6 && clock >= this.lastLayers) return;
    this.lastLayers = clock;
    const m = this.mix;
    const snap = m?.hushFrame != null ? { ...this.last, frame: m.hushFrame } : this.last;
    const L = layers(snap, cam, clock, this.ctx);
    if (m) bend(L, m);
    this.engine.apply(L, when);
  }

  /** The mix the prologue asks for now (null in the game proper). */
  get proMix(): ProMix | null {
    return this.mix;
  }

  /** A restart: frame numbers begin again, so the rate limits do too. */
  reset(): void {
    this.lastAt.clear();
  }
}

/** The prologue's bend on the game's layers: the bed, the Hush (held, nearer, drier) and its own tones. */
export function bend(L: Layers, m: ProMix): void {
  L.roar *= m.bed;
  L.hissL *= m.bed;
  L.hissR *= m.bed;
  L.pool *= m.bed;
  L.steam *= m.bed;
  L.glass *= m.bed;
  L.breath *= m.hush;
  L.pulse *= m.pulse * Math.min(1, m.hush);
  if (m.hold) {
    // Holding its breath: no swell, no vowel, just a held low air.
    L.breath = dbToGain(AUDIO.hush.breathDb) * 0.3 * m.hush;
    L.f1 = 360;
    L.f2 = 900;
  }
  if (m.soilHz !== null) L.soilHz = m.soilHz;
  L.maker = m.maker;
  L.light = Math.max(m.light, m.glint);
  L.lamp = m.lamp;
}
