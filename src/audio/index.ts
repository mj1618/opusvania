/**
 * The audio director: built in main.ts beside RenderStage, under the same contract. It reads sim
 * events and state after each step (`game.afterStep`) and the camera after each render frame
 * (`stage.afterUpdate`), never changes the sim, and render never imports it.
 *
 * MUTED BY DEFAULT: no AudioContext exists until the player presses M (kept in localStorage) or
 * the URL has `?audio` (`?audio=0` forces it off). The context is made in that key press, or in the
 * first key or pointer press after unmuting (browsers allow no sooner); the sounds are baked over a few idle callbacks, then the mix fades
 * in. Muted, the director still routes cues (`__game.audio.cues(n)`) and can record a tape for an
 * offline clip (offline.ts), so tests and clips need no sound. In `manual` and `frozen` modes the
 * context is suspended.
 */
import type { Game } from '../game';
import type { SimEvent } from '../sim/events';
import { bakeSteps } from './bake';
import { Conductor } from './conductor';
import { AudioEngine } from './engine';
import { type AudioCam, type AudioSnap, type Cue, snapOf } from './router';
import { AUDIO, type BusId } from './tuning';

/** One render frame of a recording: the camera, render clock and the sim steps since the last. */
export interface TapeFrame {
  clock: number;
  cam: AudioCam;
  steps: Array<{ events: SimEvent[]; snap: AudioSnap }>;
}

const STORE_KEY = 'wing.audio';

function stored(): boolean | null {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return v === null ? null : v === 'on';
  } catch {
    return null;
  }
}

function store(on: boolean): void {
  try {
    localStorage.setItem(STORE_KEY, on ? 'on' : 'off');
  } catch {
    // Private windows: the choice lasts the session.
  }
}

export class AudioDirector {
  muted: boolean;
  /** Called when muted flips (the key legend shows it). */
  onChange: ((muted: boolean) => void) | null = null;
  readonly conductor: Conductor;
  private ctx: AudioContext | null = null;
  private engine: AudioEngine | null = null;
  private cam: AudioCam = { x: 0, y: 0, zoom: 1 };
  private quiet = false;
  private tape: TapeFrame[] | null = null;
  private pending: TapeFrame['steps'] = [];
  private faded = 0;
  private suspending = false;

  constructor(
    private readonly game: Game,
    params: URLSearchParams = new URLSearchParams(),
  ) {
    const url = params.get('audio');
    this.muted = url !== null ? url === '0' : !(stored() ?? false);
    this.conductor = new Conductor({ scene: game.scene, seed: game.seed });
    game.afterStep.add((events) => this.onStep(events));
    // Unmuted (a remembered choice, or a review URL), the context still waits for the first gesture.
  }

  /** Listens for the first gesture, which may make or resume the context. */
  install(target: Window = window): void {
    const gesture = () => {
      if (!this.muted) this.wake();
    };
    target.addEventListener('keydown', gesture);
    target.addEventListener('pointerdown', gesture);
  }

  /** M: flips mute. Call from a key handler: it is the gesture that may create the context. */
  toggle(): boolean {
    this.mute(!this.muted);
    store(!this.muted);
    return this.muted;
  }

  mute(on: boolean): void {
    if (this.muted === on) return;
    this.muted = on;
    if (!on) this.wake();
    this.onChange?.(on);
  }

  /** Makes the context (once) and resumes it if it should run. */
  private wake(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.bake(this.ctx);
    }
    if (this.ctx.state === 'suspended' && this.game.mode === 'realtime') void this.ctx.resume();
  }

  /** Bakes the sounds over idle callbacks, then builds the graph and fades the mix in. */
  private bake(ctx: AudioContext): void {
    const { out, steps } = bakeSteps(ctx.sampleRate, this.game.seed);
    const idle: (fn: () => void) => void =
      typeof requestIdleCallback === 'function'
        ? (fn) => requestIdleCallback(fn, { timeout: 200 })
        : (fn) => setTimeout(fn, 0);
    let i = 0;
    const next = () => {
      const t0 = performance.now();
      while (i < steps.length && performance.now() - t0 < 12) steps[i++]?.();
      if (i < steps.length) return idle(next);
      this.engine = new AudioEngine(ctx, out);
      this.conductor.engine = this.engine;
      this.engine.graph.setVolumes(ctx.currentTime);
      this.faded = 0;
    };
    idle(next);
  }

  private when(): number {
    return (this.ctx?.currentTime ?? 0) + AUDIO.lookahead;
  }

  private get audible(): boolean {
    return !!this.engine && !this.muted && !this.quiet && this.ctx?.state === 'running';
  }

  private onStep(events: readonly SimEvent[]): void {
    const g = this.game;
    const snap = snapOf(g.state, g.scene, g.tuning.goal.channelFrames, g.tuning.giving.giftCalmFrames);
    // The prologue plays another version of the scene, then hands over the whole Grove.
    this.conductor.ctx.scene = g.scene;
    // A restart begins the frame count again.
    if (snap.frame === 0) this.conductor.reset();
    this.conductor.step(events, snap, this.cam, this.when(), this.audible);
    if (this.tape) this.pending.push({ events: events.map((e) => ({ ...e })), snap });
  }

  /**
   * After each render frame: the camera (view centre and zoom) and the render clock. `quiet` holds
   * the mix silent (the prologue has its own silence).
   */
  update(clock: number, cam: AudioCam, quiet = false): void {
    this.cam = { x: cam.x, y: cam.y, zoom: cam.zoom };
    this.quiet = quiet;
    if (this.tape) {
      this.tape.push({ clock, cam: this.cam, steps: this.pending });
      this.pending = [];
    }
    const ctx = this.ctx;
    const engine = this.engine;
    if (!ctx || !engine) return;
    const run = !this.muted && this.game.mode === 'realtime';
    if (run && ctx.state === 'suspended') void ctx.resume();
    const target = run && !quiet ? 1 : 0;
    if (target !== this.faded) {
      engine.fade(target, ctx.currentTime, target ? 0.5 : 0.08);
      this.faded = target;
    }
    // Faded out: let the fade finish, then stop the clock (nothing costs anything muted).
    if (!run && ctx.state === 'running' && !this.suspending) {
      this.suspending = true;
      setTimeout(() => {
        this.suspending = false;
        if (this.muted || this.game.mode !== 'realtime') void ctx.suspend();
      }, 300);
    }
    if (ctx.state === 'running') this.conductor.frame(this.cam, clock, this.when());
  }

  /** Records every step and frame from now (for an offline clip); false stops and drops it. */
  record(on = true): number {
    this.tape = on ? [] : null;
    this.pending = [];
    return 0;
  }

  /** The recording so far. */
  recording(): TapeFrame[] {
    return this.tape ?? [];
  }

  /** Sets a bus or the master volume (dB) and returns the levels. */
  volume(bus?: BusId | 'master', db?: number): Record<string, number> {
    if (bus && db !== undefined) {
      if (bus === 'master') AUDIO.master = db;
      else if (bus in AUDIO.bus) AUDIO.bus[bus] = db;
      else throw new Error(`Unknown bus "${bus}"`);
      this.applyVolumes();
    }
    return { master: AUDIO.master, ...AUDIO.bus };
  }

  /** Re-reads the volumes from tuning (Tweakpane edits). */
  applyVolumes(): void {
    if (this.engine && this.ctx) this.engine.graph.setVolumes(this.ctx.currentTime);
  }

  /** The last n cues routed (muted or not), newest last. */
  cues(n = 20): Cue[] {
    return this.conductor.recent.slice(-n).map((c) => ({ ...c }));
  }

  state(): { muted: boolean; context: string; ready: boolean; sampleRate: number; recording: number } {
    return {
      muted: this.muted,
      context: this.ctx ? this.ctx.state : 'none',
      ready: !!this.engine,
      sampleRate: this.ctx?.sampleRate ?? 0,
      recording: this.tape?.length ?? -1,
    };
  }
}
