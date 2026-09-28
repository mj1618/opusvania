import type { EventBus, SimEvent } from '../sim/events';
import { audioData, type DuckName, type LayerName, type MuffleKind } from './data';
import { AudioEngine, type PlayOpts } from './engine';
import type { HumStatus } from './hum';
import type { MusicStats } from './music';
import type { NoiseColour } from './noise';
import type { OfflineResult } from './offline';
import { EventRouter, type RoutedEvent, type RouterState } from './router';
import { type AudioSettings, loadSettings, saveSettings, type VolumeKey } from './settings';
import type { Point } from './spatial';

export interface AudioStats {
  /** 'locked' until the first user gesture creates the AudioContext. */
  state: AudioContextState | 'locked';
  time: number;
  sampleRate: number;
  settings: AudioSettings;
  muffle: MuffleKind;
  room: string | null;
  voices: { active: number; hums: number; loops: number; byName: Record<string, number> };
  played: number;
  dropped: number;
  playedByName: Record<string, number>;
  hums: { id: string; colour: NoiseColour; status: HumStatus; x: number; y: number }[];
  music: MusicStats | null;
  /** Last routed sim events (event type -> sound, and whether it actually played). */
  recent: RoutedEvent[];
}

/** `window.__game.audio`. Everything returns plain JSON (render() returns a Promise of JSON). */
export interface AudioDebugApi {
  /** Creates/resumes the AudioContext. Only reaches 'running' inside or after a user gesture. */
  unlock(): Promise<string>;
  stats(): AudioStats;
  play(name: string, opts?: Pick<PlayOpts, 'x' | 'y' | 'volume' | 'pitch' | 'pan'>): boolean;
  sounds(): string[];
  mute(on?: boolean): boolean;
  volume(key: VolumeKey, v?: number): number;
  muffle(kind?: MuffleKind): MuffleKind;
  duck(name?: DuckName): void;
  /** Starts a hum (default position: the player). Returns its id, or null while locked. */
  hum(colour: NoiseColour, x?: number, y?: number, id?: string): string | null;
  /** Seizes a hum into the player's hands. */
  seize(id: string): boolean;
  /** Throws a hum at (x, y). Returns the land time (context seconds). */
  levy(id: string, x: number, y: number): number | null;
  stopHum(id: string): boolean;
  /** No arg: stats. A layer: start/crossfade on the next bar. 'stop': fade out. */
  music(layer?: LayerName | 'stop'): MusicStats | null;
  /** Renders offline scenarios (see src/audio/scenarios.ts) and returns level stats (+ WAV). */
  render(names?: string[], opts?: { wav?: boolean }): Promise<OfflineResult[]>;
  scenarios(): Promise<string[]>;
  /** Renders a recorded run's audio offline (clip --audio): WAV base64 + levels. */
  renderTrack(
    cues: import('./offline').TrackCue[],
    seconds: number,
  ): Promise<{ wavBase64: string; stats: import('./wav').LevelStats }>;
}

export interface AudioSystemDeps {
  bus: EventBus<SimEvent>;
  state: () => RouterState;
  /** Listener position in world pixels (the camera centre). */
  listener: () => Point;
  target?: Window;
}

const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

/**
 * Owns the live AudioContext and wires the engine to the game: routes sim events, updates the
 * listener and schedulers every render frame, unlocks on the first gesture, persists settings.
 * Read-only with respect to the sim.
 */
export class AudioSystem {
  engine: AudioEngine | null = null;
  readonly router: EventRouter;
  readonly debug: AudioDebugApi;
  private ctx: AudioContext | null = null;
  private settings: AudioSettings = loadSettings();
  private readonly target: Window;

  constructor(private readonly deps: AudioSystemDeps) {
    this.target = deps.target ?? window;
    const data = audioData();
    this.router = new EventRouter(
      {
        play: (name, opts) => this.engine?.play(name, opts) ?? false,
        loopGain: (name, g) => this.engine?.loopGain(name, g),
        setRoom: (id) => this.engine?.setRoom(id),
        hums: {
          reset: (list) => {
            const e = this.engine;
            if (!e) return;
            for (const h of e.humInfo()) if (h.id.startsWith('s')) e.getHum(h.id)?.stop(0.2);
            for (const h of list) e.hum(h.id, h.colour as NoiseColour, h.pos);
          },
          seize: (id, holder) => void this.engine?.getHum(id)?.seize(holder),
          fly: (id, from, towards) => this.engine?.getHum(id)?.fly(from, towards),
          land: (id, at, thud) => this.engine?.getHum(id)?.land(at, thud),
          setPosition: (id, at) => {
            const h = this.engine?.getHum(id);
            if (h && h.status !== 'carried') h.setPosition(at);
          },
        },
      },
      data.sfx,
    );
    // Every sim event goes to the router; it ignores types it has no sound for.
    deps.bus.onAny((e) => {
      const s = deps.state();
      this.router.handle(e, s.frame, s);
    });
    for (const g of GESTURES) this.target.addEventListener(g, this.onGesture, { capture: true });
    this.target.document?.addEventListener('visibilitychange', this.onVisibility);
    this.debug = this.makeDebugApi();
  }

  /** Call once per render frame, after stepping the sim. */
  update(): void {
    const e = this.engine;
    if (!e) return;
    e.listener = this.deps.listener();
    const s = this.deps.state();
    this.router.update(s);
    // A seized ("carried") sound travels with the player.
    const held = { x: s.player.x + s.player.w / 2, y: s.player.y + s.player.h / 2 };
    for (const h of e.humInfo()) if (h.status === 'carried') e.getHum(h.id)?.setPosition(held);
    e.tick();
  }

  /** Creates the context on first use. Safe to call repeatedly. */
  ensureEngine(): AudioEngine {
    if (this.engine) return this.engine;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const engine = new AudioEngine(ctx, audioData(), this.settings);
    this.engine = engine;
    engine.listener = this.deps.listener();
    engine.setRoom(this.deps.state().roomId);
    // Hums for the room we're already in (the roomEnter event came before audio unlocked).
    this.router.rehum(this.deps.state());
    const m = engine.data.music;
    if (m.autoStart) engine.music.start(m.startLayer);
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running') {
        for (const g of GESTURES) this.target.removeEventListener(g, this.onGesture, { capture: true });
      }
    });
    return engine;
  }

  private readonly onGesture = (): void => {
    this.ensureEngine();
    void this.ctx?.resume();
  };

  private readonly onVisibility = (): void => {
    if (!this.ctx || this.ctx.state === 'closed') return;
    if (this.target.document.visibilityState === 'hidden') void this.ctx.suspend();
    else void this.ctx.resume();
  };

  private setSettings(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    if (this.engine) {
      this.engine.settings = { ...this.settings };
      this.engine.applySettings();
    }
  }

  private makeDebugApi(): AudioDebugApi {
    const player = (): Point => {
      const p = this.deps.state().player;
      return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    };
    return {
      unlock: async () => {
        this.ensureEngine();
        const ctx = this.ctx;
        if (!ctx) return 'locked';
        await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 500))]);
        return ctx.state;
      },
      stats: () => {
        const e = this.engine;
        return {
          state: this.ctx?.state ?? 'locked',
          time: this.ctx?.currentTime ?? 0,
          sampleRate: this.ctx?.sampleRate ?? 0,
          settings: { ...this.settings },
          muffle: e?.muffleKind ?? 'none',
          room: e?.room ?? null,
          voices: e?.voiceStats() ?? { active: 0, hums: 0, loops: 0, byName: {} },
          played: e?.counters.played ?? 0,
          dropped: e?.counters.dropped ?? 0,
          playedByName: { ...(e?.counters.playedByName ?? {}) },
          hums: e?.humInfo() ?? [],
          music: e?.music.stats() ?? null,
          recent: this.router.log.slice(-8),
        };
      },
      play: (name, opts) => this.ensureEngine().play(name, opts),
      sounds: () => Object.keys(audioData().sfx.sounds),
      mute: (on) => {
        this.setSettings({ muted: on ?? !this.settings.muted });
        return this.settings.muted;
      },
      volume: (key, v) => {
        if (v !== undefined) this.setSettings({ [key]: Math.max(0, Math.min(1, v)) });
        return this.settings[key];
      },
      muffle: (kind) => {
        const e = this.ensureEngine();
        if (kind) e.setMuffle(kind);
        return e.muffleKind;
      },
      duck: (name = 'heavy') => this.ensureEngine().duck(name),
      hum: (colour, x, y, id) => {
        const pos = x !== undefined && y !== undefined ? { x, y } : player();
        return this.ensureEngine().hum(id, colour, pos).id;
      },
      seize: (id) => this.engine?.getHum(id)?.seize(player()) ?? false,
      levy: (id, x, y) => this.engine?.getHum(id)?.levy({ x, y }) ?? null,
      stopHum: (id) => {
        const h = this.engine?.getHum(id);
        h?.stop();
        return !!h;
      },
      music: (layer) => {
        const e = this.ensureEngine();
        if (layer === 'stop') e.music.stop();
        else if (layer) e.music.start(layer);
        return e.music.stats();
      },
      render: async (names, opts) => (await import('./offline')).renderScenarios(names, opts),
      scenarios: async () => (await import('./scenarios')).scenarioNames(),
      renderTrack: async (cues, seconds) => (await import('./offline')).renderTrack(cues, seconds),
    };
  }
}
