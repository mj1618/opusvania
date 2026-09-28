import type { Application } from 'pixi.js';
import type { Game } from '../game';
import { type InputScript, parseInputScript } from '../input/script';
import type { GameState } from '../sim/index';
import { type Replay, runReplay } from '../sim/replay';
import type { Tuning } from '../sim/tuning';
import { ROOMS } from '../sim/world/rooms';
import type { HitboxOverlay } from './overlay';
import type { TuningPanel } from './tuning-panel';

/**
 * window.__game: the agent/test-facing debug API. Everything returns plain JSON.
 * Calling step() or pause() switches to manual mode, where the real-time loop stops advancing
 * the sim; resume() goes back to real time.
 */
export interface GameDebugApi {
  /** Advances n sim steps (manual mode), renders, and returns the new state. */
  step(n?: number): GameState;
  state(): GameState;
  hash(): string;
  /** Queues scripted input (see src/input/script.ts). Returns frames queued in total. */
  input(script: InputScript): number;
  clearInput(): void;
  load(roomId: string, spawn?: string): GameState;
  /** No arg: returns the current seed. With n: reseeds the RNG. */
  seed(n?: number): number;
  /** Renders now and returns a PNG data URL of the canvas. scale < 1 downsizes (clip tool). */
  screenshot(scale?: number): string;
  pause(): void;
  resume(): void;
  mode(): 'realtime' | 'manual';
  rooms(): string[];
  /** Renderer and build info, e.g. { renderer: 'webgl', ... }. */
  info(): { renderer: string; mode: 'realtime' | 'manual'; frame: number; recording: boolean };
  tuning: Tuning;
  replay: {
    record(): void;
    stop(): Replay | null;
    /** Loads the replay's start state and queues its inputs; step() through it or resume(). */
    play(r: Replay): number;
    /** Runs the replay headlessly (does not touch the live game). */
    verify(r: Replay): { hash: string; matches: boolean | undefined };
  };
  debug: {
    hitboxes(on?: boolean): boolean;
    tuningPanel(on?: boolean): boolean;
  };
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
}

export function installDebugApi({ game, app, render, overlay, panel }: DebugDeps): GameDebugApi {
  const snapshot = () => JSON.parse(JSON.stringify(game.state)) as GameState;
  const api: GameDebugApi = {
    step(n = 1) {
      game.mode = 'manual';
      game.steps(n);
      render(1);
      return snapshot();
    },
    state: snapshot,
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
    screenshot(scale = 1) {
      render(1);
      const src = app.canvas;
      if (scale === 1) return src.toDataURL('image/png');
      const c = document.createElement('canvas');
      c.width = Math.round(src.width * scale);
      c.height = Math.round(src.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('2d context unavailable');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    },
    pause() {
      game.mode = 'manual';
    },
    resume() {
      game.mode = 'realtime';
    },
    mode: () => game.mode,
    rooms: () => [...ROOMS.keys()],
    info: () => ({
      renderer: app.renderer.name,
      mode: game.mode,
      frame: game.state.frame,
      recording: game.recording,
    }),
    tuning: game.tuning,
    replay: {
      record: () => game.startRecording(),
      stop: () => game.stopRecording(),
      play(r) {
        game.setState(r.start);
        game.clearInput();
        game.queueInput(r.inputs);
        render(1);
        return r.inputs.length;
      },
      verify(r) {
        const res = runReplay(r);
        return { hash: res.hash, matches: res.matches };
      },
    },
    debug: {
      hitboxes: (on) => overlay.toggle(on),
      tuningPanel: (on) => panel.toggle(on),
    },
  };
  window.__game = api;
  return api;
}
