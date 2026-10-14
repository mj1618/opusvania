/**
 * The part of the director that live play and offline clips share: for each sim step it routes the
 * events and the world's own cues and plays them; for each render frame it aims the continuous
 * layers. With no engine (muted) it still routes, so `__game.audio.cues(n)` works without sound.
 */
import type { SimEvent } from '../sim/events';
import type { AudioEngine } from './engine';
import { type AudioCam, type AudioSnap, ambient, type Cue, layers, type RouteContext, route } from './router';
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
    cues.push(...ambient(snap, cam, this.ctx));
    const kept: Cue[] = [];
    for (const c of cues) {
      const gap = GAP[c.sound];
      const t = snap.frame / 60 + c.delay;
      if (gap !== undefined) {
        const prev = this.lastAt.get(c.sound) ?? -Infinity;
        if (t - prev < gap - 1e-6) continue;
        this.lastAt.set(c.sound, t);
      }
      kept.push(c);
    }
    for (const c of kept) {
      this.recent.push(c);
      if (play && this.engine) this.engine.play(c, when, cam);
    }
    if (this.recent.length > KEEP) this.recent.splice(0, this.recent.length - KEEP);
    return kept;
  }

  /** One render frame: aim the continuous layers (at most every `layerEvery` s of render time). */
  frame(cam: AudioCam, clock: number, when: number, force = false): void {
    if (!this.engine || !this.last) return;
    if (!force && clock - this.lastLayers < AUDIO.layerEvery - 1e-6 && clock >= this.lastLayers) return;
    this.lastLayers = clock;
    this.engine.apply(layers(this.last, cam, clock, this.ctx), when);
  }

  /** A restart: frame numbers begin again, so the rate limits do too. */
  reset(): void {
    this.lastAt.clear();
  }
}
