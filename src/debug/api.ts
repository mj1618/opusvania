import type { Application } from 'pixi.js';
import type { AudioDebugApi } from '../audio/index';
import type { Game } from '../game';
import { padReport } from '../input/gamepad';
import { formatInputScript, type InputScript, maskLabel, parseInputScript } from '../input/script';
import type { CameraState } from '../render/camera/index';
import type { WorldRenderer } from '../render/world';
import type { GameState } from '../sim/index';
import { BASE_PROFILE } from '../sim/player/params';
import { type Replay, runReplay } from '../sim/replay';
import { assignTuning, PRESET_NAMES, type PresetName, type Tuning } from '../sim/tuning';
import type { Abilities } from '../sim/world/rooms';
import { type BuildMeta, buildMeta, explainMismatch } from './build-info';
import { EventLog } from './event-log';
import {
  formatTrace,
  HeadlessSim,
  type LoggedEvent,
  runScenario,
  type Scenario,
  type ScenarioResult,
  type TraceFrame,
} from './headless';
import type { HitboxOverlay } from './overlay';
import {
  type AssistSet,
  cloneState,
  diffInto,
  getAssists,
  mergeInto,
  type PlayerView,
  playerView,
  presetNames,
  presetTuning,
  type Rect,
  roomIds,
  roomTargets,
  setAssists,
  setPath,
} from './sim-adapter';
import { checkTape, type TapeCheck, type TapeFile, tapeSetup, withGolden } from './tape';
import { TrailOverlay } from './trail';
import type { TuningPanel } from './tuning-panel';

/**
 * window.__game: the agent/test-facing debug API. Everything returns plain JSON.
 * Calling step() or pause() switches to manual mode, where the real-time loop stops advancing
 * the sim; resume() goes back to real time. Documented in memory/debug-api.md.
 */
/** L3 combat summary added to state() (brief §1.1): Kid's Chin, bag colours, weight, hitstop, i-frames. */
export interface CombatView {
  chin: number;
  bag: string[];
  weight: string;
  hitstop: number;
  iframes: number;
}

/** state() = the sim state plus read-only L3 conveniences (restore() strips them). */
export type StateView = GameState & {
  combat: CombatView;
  enemies: GameState['local']['enemies'];
  sounds: GameState['local']['sounds'];
};

/** A drawn thing in canvas px (render.rects(), for the E readability checks). */
export interface RenderRect {
  id: number;
  kind: string;
  colour: string;
  status: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GameDebugApi {
  /** Advances n sim steps (manual mode), renders, and returns the new state. */
  step(n?: number): GameState;
  state(): StateView;
  /** Spawns an enemy (`barker`, `grinder`) with its feet at world (x, y); a replay op. Returns its id. */
  spawn(type: string, x: number, y: number): number;
  /** Render-side queries. */
  render: {
    /** Canvas-px rects of every source, levied object, enemy and bag HUD slot as last drawn. */
    rects(): RenderRect[];
  };
  hash(): string;
  /** Queues scripted input (spec DSL `R30 R+J12 .5` or `right*30`, see src/input/script.ts). Returns frames queued in total. */
  input(script: InputScript): number;
  clearInput(): void;
  load(roomId: string, spawn?: string): GameState;
  /** No arg: returns the current seed. With n: reseeds the RNG. */
  seed(n?: number): number;
  /** Renders now and returns a PNG data URL. `label: true` burns in the frame number. */
  screenshot(scale?: number, opts?: { label?: string | boolean }): string;
  pause(): void;
  resume(): void;
  mode(): 'realtime' | 'manual';
  rooms(): string[];
  info(): {
    renderer: string;
    mode: 'realtime' | 'manual';
    frame: number;
    recording: boolean;
    build: BuildMeta;
    preset: string;
    gamepads: ReturnType<typeof padReport>;
  };
  tuning: Tuning;

  // --- L2 tooling additions -------------------------------------------------------------
  /** Normalised player (px/frame velocities, state name, wall/dash/double-jump flags). */
  view(): PlayerView;
  /** Steps n frames (optionally queueing `script` first) and returns one entry per frame. */
  trace(n: number, script?: InputScript): TraceFrame[];
  /** Same as trace() but as a fixed-width text table. */
  traceText(n: number, script?: InputScript): string;
  /** Last n logged events `{f, e: {type, kind, raw}}` (ring buffer of 2000). */
  events(n?: number): LoggedEvent[];
  /** Last n events as readable lines: `f123 jump:ground x=.. y=..`. */
  eventLog(n?: number): string;
  /** Events from the most recent step. */
  lastEvents(): LoggedEvent[];
  /** Plain-JSON copy of the sim state (alias: snapshot). */
  save(): GameState;
  snapshot(): GameState;
  /** Replaces the sim state (recorded as a replay op). */
  restore(s: GameState): GameState;
  /** Deep-merges a partial into the live tuning, or sets one dotted path. Returns the tuning. */
  setTuning(partial: Record<string, unknown> | string, value?: unknown): Tuning;
  /** Resets tuning to the current preset's values. */
  resetTuning(): Tuning;
  /** No arg: current preset and the names available. With a name: applies it (keeps profiles). */
  preset(name?: string): { current: string; names: string[] };
  /** Reads, or sets some of, the assist toggles (tuning.assists). */
  assists(set?: AssistSet): AssistSet;
  /** Player ability flags; with an argument, overrides some (recorded as a state op in replays). */
  abilities(set?: Partial<Abilities>): Abilities;
  /** Player movement profile ('base' or a tuning.profiles key); with an argument, switches it. */
  profile(name?: string): string;
  /** Camera state (render-side, pre-shake view top-left in x/y). */
  camera(): CameraState;
  /** The player position as last drawn (interpolated), for end-to-end latency probes. */
  renderState(): { x: number; y: number; frame: number };
  /** Named targets in the current room (goals, spawns) as px rects. */
  targets(): Record<string, Rect>;
  /** Runs a scenario headlessly in this page (does not touch the live game). */
  headless(sc: Scenario): Omit<ScenarioResult, 'final'> & { hash: string; player: PlayerView };
  tape: {
    /** Starts recording a tape from the current state. */
    record(): void;
    /** Stops and returns the tape (with goldens from this build). */
    stop(opts?: { name?: string; expect?: TapeFile['expect']; notes?: string }): TapeFile | null;
    /** Runs the tape headlessly here and checks it (cross-runtime check). */
    check(t: TapeFile): Omit<TapeCheck, 'run'> & { hash: string; hashes: string[]; steps: number };
    /** Loads the tape's start into the live game and queues its inputs. Returns its length. */
    play(t: TapeFile): number;
  };
  replay: {
    record(): void;
    stop(): (Replay & { meta: BuildMeta }) | null;
    /**
     * Loads the replay's start state and tuning (overwrites live tuning), queues its inputs and
     * applies its ops as they come due; step() through it or resume(). Returns its length in steps.
     */
    play(r: Replay): number;
    /** Runs the replay headlessly (does not touch the live game). */
    verify(r: Replay & { meta?: BuildMeta }): {
      hash: string;
      matches: boolean | undefined;
      message?: string;
    };
  };
  debug: {
    hitboxes(on?: boolean): boolean;
    tuningPanel(on?: boolean): boolean;
    /** Motion-trail overlay for clips: ghosts every `every` frames for `length` frames + event markers. */
    trail(on?: boolean, opts?: { length?: number; every?: number }): boolean;
  };
  /** Audio helpers: play, mute, stats, hums, music, offline render (see memory/audio.md). */
  audio: AudioDebugApi;
}

declare global {
  interface Window {
    __game: GameDebugApi;
  }
}

export interface DebugDeps {
  game: Game;
  app: Application;
  /** Draws the scene at the given interpolation alpha. */
  render(alpha: number): void;
  overlay: HitboxOverlay;
  panel: TuningPanel;
  renderer: WorldRenderer;
  /** Latest drawn player position (main updates it every render). */
  drawn: { x: number; y: number; frame: number };
  audio: AudioDebugApi;
}

export function installDebugApi({
  game,
  app,
  render,
  overlay,
  panel,
  renderer,
  drawn,
  audio,
}: DebugDeps): GameDebugApi {
  const snapshot = () => cloneState(game.state);
  const stateView = (): StateView => {
    const s = cloneState(game.state);
    const L = s.local;
    return {
      ...s,
      combat: {
        chin: s.player.chin,
        bag: L.bag.map((id) => L.sounds.find((x) => x.id === id)?.colour ?? '?'),
        weight: s.player.profile,
        hitstop: s.hitstop,
        iframes: s.player.iframes,
      },
      enemies: L.enemies,
      sounds: L.sounds,
    };
  };
  const stripView = (s: GameState): GameState => {
    const { combat: _c, enemies: _e, sounds: _s, ...rest } = s as StateView;
    return rest as GameState;
  };
  const log = new EventLog(game);
  const trail = new TrailOverlay(game, log);
  overlay.g.parent?.addChild(trail.container);
  overlay.extras.push(trail);
  let tapeRec: { preset: string; tuning: Tuning } | null = null;
  const tuningObj = game.tuning as unknown as Record<string, unknown>;

  const trace = (n: number, script?: InputScript): TraceFrame[] => {
    if (!Number.isInteger(n) || n < 0)
      throw new Error(`trace(n): n must be a non-negative integer, got ${n}`);
    game.mode = 'manual';
    if (script !== undefined) game.queueInput(parseInputScript(script));
    const out: TraceFrame[] = [];
    const off = log.onStep(({ f, input, events }) => {
      out.push({
        f,
        in: input === undefined ? '?' : maskLabel(input),
        p: playerView(game.state),
        ev: events.map((l) => l.e),
      });
    });
    try {
      game.steps(n);
    } finally {
      off();
    }
    render(1);
    return JSON.parse(JSON.stringify(out)) as TraceFrame[];
  };

  const applyTuning = (t: Tuning) => {
    assignTuning(game.tuning, t);
    panel.refresh();
  };

  const api: GameDebugApi = {
    step(n = 1) {
      if (!Number.isInteger(n) || n < 0)
        throw new Error(`step(n): n must be a non-negative integer, got ${n}`);
      game.mode = 'manual';
      game.steps(n);
      render(1);
      return snapshot();
    },
    state: stateView,
    spawn(type, x, y) {
      const id = game.spawn(type, x, y);
      render(1);
      return id;
    },
    render: {
      rects: () => renderer.rects(),
    },
    hash: () => game.hash(),
    input(script) {
      game.queueInput(parseInputScript(script));
      return game.queuedInput;
    },
    clearInput: () => game.clearInput(),
    load(roomId, spawn) {
      game.load(roomId, spawn);
      render(1);
      return snapshot();
    },
    seed(n) {
      if (n !== undefined) game.reseed(n);
      return game.state.seed;
    },
    screenshot(scale = 1, opts = {}) {
      render(1);
      const src = app.canvas;
      const label = opts.label === true ? `f${game.state.frame}` : opts.label || '';
      if (scale === 1 && !label) return src.toDataURL('image/png');
      const c = document.createElement('canvas');
      c.width = Math.round(src.width * scale);
      c.height = Math.round(src.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('2d context unavailable');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, c.width, c.height);
      if (label) {
        const px = Math.max(12, Math.round(c.height * 0.045));
        ctx.font = `bold ${px}px monospace`;
        const w = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, w + px, px * 1.5);
        ctx.fillStyle = '#ffe14c';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, px / 2, px * 0.78);
      }
      return c.toDataURL('image/png');
    },
    pause() {
      game.mode = 'manual';
    },
    resume() {
      game.mode = 'realtime';
    },
    mode: () => game.mode,
    rooms: () => roomIds(),
    info: () => ({
      renderer: app.renderer.name,
      mode: game.mode,
      frame: game.state.frame,
      recording: game.recording,
      build: buildMeta(game.state.version),
      preset: panel.ui.preset,
      gamepads: padReport(),
    }),
    tuning: game.tuning,

    view: () => playerView(game.state),
    trace,
    traceText: (n, script) => formatTrace(trace(n, script)),
    events: (n) => log.recent(n),
    eventLog: (n) => log.text(n),
    lastEvents: () => JSON.parse(JSON.stringify(log.last)) as LoggedEvent[],
    save: snapshot,
    snapshot,
    restore(s) {
      game.setState(stripView(s));
      render(1);
      return snapshot();
    },
    setTuning(partial, value) {
      if (typeof partial === 'string') setPath(tuningObj, partial, value);
      else mergeInto(tuningObj, partial);
      panel.refresh();
      return game.tuning;
    },
    resetTuning() {
      panel.applyPreset(panel.ui.preset);
      return game.tuning;
    },
    preset(name) {
      if (name !== undefined) {
        if (!(PRESET_NAMES as string[]).includes(name))
          throw new Error(`Unknown preset "${name}". Known: ${PRESET_NAMES.join(', ')}`);
        panel.applyPreset(name as PresetName);
      }
      return { current: panel.ui.preset, names: presetNames() };
    },
    assists(set) {
      if (set) {
        const bad = setAssists(game.tuning, set);
        if (bad.length > 0) throw new Error(`Unknown assist(s): ${bad.join(', ')}`);
        panel.refresh();
      }
      return getAssists(game.tuning);
    },
    abilities(set) {
      if (set) {
        const s = cloneState(game.state);
        Object.assign(s.player.abilities, set);
        game.setState(s);
      }
      return { ...game.state.player.abilities };
    },
    profile(name) {
      if (name !== undefined) {
        if (name !== BASE_PROFILE && !(name in game.tuning.profiles))
          throw new Error(`Unknown profile "${name}". Known: base, ${Object.keys(game.tuning.profiles)}`);
        const s = cloneState(game.state);
        s.player.profile = name;
        game.setState(s);
      }
      return game.state.player.profile;
    },
    camera: () => JSON.parse(JSON.stringify(renderer.camera)) as CameraState,
    renderState: () => ({ ...drawn }),
    targets: () => roomTargets(game.state.roomId),
    headless(sc) {
      const { final, ...rest } = runScenario(sc);
      return JSON.parse(JSON.stringify({ ...rest, hash: final.hash, player: final.player }));
    },
    tape: {
      record() {
        tapeRec = { preset: panel.ui.preset, tuning: JSON.parse(JSON.stringify(game.tuning)) as Tuning };
        game.startRecording();
      },
      stop(opts = {}) {
        const r = game.stopRecording();
        const rec = tapeRec;
        tapeRec = null;
        if (!r || !rec) return null;
        if ((r.ops ?? []).length > 0)
          throw new Error(
            `tape.stop(): ${r.ops?.map((o) => o.op).join(', ')} happened while recording; a tape can't express that. Use replay.record()/stop() instead, or record again without load/seed/tuning changes.`,
          );
        const base = presetTuning(rec.preset);
        const diff = diffInto(base, rec.tuning) as Record<string, unknown> | undefined;
        const t: TapeFile = {
          kind: 'tape',
          name: opts.name ?? `browser-${r.start.roomId}-f${r.start.frame}`,
          source: 'browser',
          start: r.start,
          seed: r.start.seed,
          preset: rec.preset,
          inputs: formatInputScript(r.inputs),
          expect: opts.expect ?? {},
        };
        if (diff) t.tuning = diff;
        if (opts.notes) t.notes = opts.notes;
        return JSON.parse(JSON.stringify(withGolden(t))) as TapeFile;
      },
      check(t) {
        const { run, ...rest } = checkTape(t);
        return JSON.parse(JSON.stringify({ ...rest, hash: run.hash, hashes: run.hashes, steps: run.steps }));
      },
      play(t) {
        const sim = new HeadlessSim(tapeSetup(t));
        game.clearInput();
        applyTuning(sim.tuning);
        game.setState(sim.state);
        const inputs = parseInputScript(t.inputs);
        game.queueInput(inputs);
        render(1);
        return inputs.length;
      },
    },
    replay: {
      record: () => game.startRecording(),
      stop: () => {
        const r = game.stopRecording();
        return r ? { ...r, meta: buildMeta(r.start.version) } : null;
      },
      play(r) {
        const n = game.playReplay(r);
        panel.refresh();
        render(1);
        return n;
      },
      verify(r) {
        const res = runReplay(r);
        if (res.matches === false)
          return { hash: res.hash, matches: false, message: explainMismatch(r.meta) };
        return { hash: res.hash, matches: res.matches };
      },
    },
    debug: {
      hitboxes: (on) => overlay.toggle(on),
      tuningPanel: (on) => panel.toggle(on),
      trail: (on, opts) => trail.toggle(on, opts),
    },
    audio,
  };
  window.__game = api;
  return api;
}
