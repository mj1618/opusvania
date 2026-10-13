import type { Game, RunMode } from '../game';
import { type InputScript, parseInputScript } from '../input/script';
import type { GameApp } from '../render/app';
import { type CameraView, VIEW_H, VIEW_W } from '../render/contract';
import type { PointLight } from '../render/lights';
import type { CameraOverride, RenderStage } from '../render/stage';
import type { SimEvent } from '../sim/events';
import type { GameState } from '../sim/index';
import { pickupsWorth } from '../sim/pickups';
import { podsWorth } from '../sim/pods';
import type { Scene } from '../sim/scene';
import type { Tuning } from '../sim/tuning';
import type { TuningPanel } from './tuning-panel';

/**
 * window.__game: the agent/test-facing debug API. Everything returns plain JSON. Documented in
 * memory/debug-api.md; keep the two in step.
 *
 * Time model: 'realtime' (normal play), 'frozen' (sim stopped, render time running: the scene
 * keeps animating) and 'manual' (nothing moves except through step()/tick(), so results are
 * reproducible). step(), tick() and pause() switch to manual; freeze() to frozen; resume() back.
 */
export interface GameDebugApi {
  /** Advances n sim steps (and n/60 s of render time), draws, returns the new state. -> manual. */
  step(n?: number): GameState;
  /** Advances render time only by n frames of 1/60 s (sim untouched), draws. -> manual. */
  tick(n?: number): number;
  /** Plain-JSON copy of the sim state (src/sim/state.ts). */
  state(): GameState;
  /** Queues scripted input (`R30 R+J12 A1 .5`, A = attack, or `right*30 right+jump*12`, src/input/script.ts). Returns frames queued in total. */
  input(script: InputScript): number;
  /** Drops queued input. */
  clearInput(): void;
  /** Restarts the scene (fresh state at the spawn, frame 0). The id is accepted for compatibility; there is one scene. */
  load(sceneId?: string): GameState;
  /** Puts the player at rest with its feet centre at (x, y) sim px (lifted out of solids). Snaps the camera. */
  teleport(x: number, y: number): GameState;
  /**
   * Camera. No argument: the view as last drawn `{x, y, zoom}` (centre, world px) plus the follow
   * camera's own view and the active override. With an object: overrides it (`{x, y, zoom}`, any
   * subset; `{on: 'player', zoom: 4}` tracks the player). With null: back to the follow camera.
   */
  cam(o?: CameraOverride | null): {
    x: number;
    y: number;
    zoom: number;
    follow: CameraView;
    override: CameraOverride | null;
  };
  /** Stops the sim; render time keeps running (wind, glow, particles keep animating). */
  freeze(on?: boolean): RunMode;
  /** Stops everything (manual mode). */
  pause(): RunMode;
  /** Back to real time. */
  resume(): RunMode;
  /** Sim events of the most recent step() call (all its steps), or of the last n logged steps. */
  events(n?: number): Array<SimEvent & { f: number }>;
  /** The scene data (content/scene/grove.json, validated). */
  scene(): Scene;
  /** Mode, frame, view and canvas sizes, GPU. */
  info(): {
    mode: RunMode;
    frame: number;
    clock: number;
    scene: { id: string; width: number; height: number };
    view: { w: number; h: number };
    canvas: { w: number; h: number; resolution: number };
    gpu: string;
  };
  /** Stable hash of the sim state. */
  hash(): string;
  /** The live tuning object's values. */
  tuning(): Tuning;
  /** Sets one dotted path (`'run.maxSpeed', 12`) or merges a partial. Returns the tuning. */
  setTuning(pathOrPartial: string | Record<string, Record<string, unknown>>, value?: unknown): Tuning;
  /**
   * Collectibles: the count so far, what the whole scene is worth, and every pickup with its
   * state (`waiting`, `flying` = woken and on its way, `taken`).
   */
  pickups(): {
    count: number;
    taken: number;
    worth: number;
    list: Array<{ id: string; kind: string; x: number; y: number; state: 'waiting' | 'flying' | 'taken' }>;
  };
  /**
   * Lumen pods: how many have burst, what they are all worth (their glints go into the pickups
   * count), and every pod with its state (`closed`, `open`) and the glints still flying to her.
   */
  pods(): {
    burst: number;
    total: number;
    worth: number;
    list: Array<{ id: string; x: number; y: number; mount: string; state: 'closed' | 'open'; left: number }>;
  };
  /** Dynamic lights registered this frame (world px). */
  lights(): PointLight[];
  /** Redraws now (after changing something by hand in manual mode). */
  render(): void;
  /** Hero design: no argument lists `{id, skins}`; an id switches to that skin. */
  character(id?: string): { id: string; skins: string[] };
  debug: {
    /** Collision overlay on/off (no argument toggles). */
    hitboxes(on?: boolean): boolean;
    /** Tuning panel on/off. */
    panel(on?: boolean): boolean;
  };
}

declare global {
  interface Window {
    __game: GameDebugApi;
  }
}

const LOG_MAX = 2000;

export function installDebugApi(deps: {
  game: Game;
  ga: GameApp;
  stage: RenderStage;
  panel: TuningPanel;
}): GameDebugApi {
  const { game, ga, stage, panel } = deps;
  const log: Array<SimEvent & { f: number }> = [];
  let lastCall = 0;
  game.afterStep.add((events) => {
    for (const e of events) log.push({ ...e, f: game.state.frame });
    if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
  });
  const snapshot = (): GameState => JSON.parse(JSON.stringify(game.state)) as GameState;
  const redraw = (): void => {
    stage.update(0, 1);
    stage.present();
  };

  const api: GameDebugApi = {
    step(n = 1) {
      game.mode = 'manual';
      lastCall = log.length;
      for (let i = 0; i < n; i++) {
        game.stepOnce();
        stage.update(1 / 60, 1);
      }
      if (n <= 0) stage.update(0, 1);
      stage.present();
      return snapshot();
    },
    tick(n = 1) {
      game.mode = 'manual';
      for (let i = 0; i < n; i++) stage.update(1 / 60, 1);
      stage.present();
      return stage.clock;
    },
    state: snapshot,
    input(script) {
      game.queueInput(parseInputScript(script));
      return game.queuedInput;
    },
    clearInput() {
      game.clearInput();
    },
    load(sceneId) {
      if (sceneId !== undefined && sceneId !== game.scene.id)
        throw new Error(`Unknown scene "${sceneId}". There is one scene: "${game.scene.id}".`);
      game.reset();
      redraw();
      return snapshot();
    },
    teleport(x, y) {
      game.teleport(x, y);
      redraw();
      return snapshot();
    },
    cam(o) {
      if (o !== undefined) {
        stage.override = o;
        redraw();
      }
      return { ...stage.view, follow: stage.followView, override: stage.override };
    },
    freeze(on = true) {
      game.mode = on ? 'frozen' : 'realtime';
      return game.mode;
    },
    pause() {
      game.mode = 'manual';
      return game.mode;
    },
    resume() {
      game.mode = 'realtime';
      return game.mode;
    },
    events(n) {
      if (n === undefined) return log.slice(lastCall);
      const from = game.state.frame - n;
      return log.filter((e) => e.f > from);
    },
    scene: () => JSON.parse(JSON.stringify(game.scene)) as Scene,
    info() {
      const gl = (ga.app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        mode: game.mode,
        frame: game.state.frame,
        clock: stage.clock,
        scene: { id: game.scene.id, width: game.scene.width, height: game.scene.height },
        view: { w: VIEW_W, h: VIEW_H },
        canvas: { w: ga.app.canvas.width, h: ga.app.canvas.height, resolution: ga.app.renderer.resolution },
        gpu: String((ext && gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) ?? 'unknown'),
      };
    },
    hash: () => game.hash(),
    tuning: () => JSON.parse(JSON.stringify(game.tuning)) as Tuning,
    setTuning(pathOrPartial, value) {
      const root = game.tuning as unknown as Record<string, Record<string, unknown>>;
      if (typeof pathOrPartial === 'string') {
        const [g = '', k = ''] = pathOrPartial.split('.');
        const grp = root[g];
        if (!grp || !(k in grp)) throw new Error(`Unknown tuning path "${pathOrPartial}"`);
        grp[k] = value;
      } else {
        for (const [g, values] of Object.entries(pathOrPartial)) {
          const grp = root[g];
          if (!grp) throw new Error(`Unknown tuning group "${g}"`);
          for (const k of Object.keys(values))
            if (!(k in grp)) throw new Error(`Unknown tuning path "${g}.${k}"`);
          Object.assign(grp, values);
        }
      }
      panel.refresh();
      return api.tuning();
    },
    pickups() {
      const s = game.state.pickups;
      return {
        count: s.count,
        taken: s.taken,
        worth: pickupsWorth(game.scene, game.tuning.pickups),
        list: (game.scene.pickups ?? []).map((p, i) => {
          const t = s.timers[i] ?? 0;
          return { ...p, state: t < 0 ? 'taken' : t > 0 ? 'flying' : 'waiting' };
        }),
      };
    },
    pods() {
      const s = game.state.pods;
      const list = game.scene.pods ?? [];
      return {
        burst: s.burst,
        total: list.length,
        worth: podsWorth(game.scene, game.tuning.pods),
        list: list.map((p, i) => ({
          ...p,
          state: (s.hp[i] ?? 0) > 0 ? 'closed' : 'open',
          left: s.left[i] ?? 0,
        })),
      };
    },
    lights: () => stage.lights.list.map((l) => ({ ...l })),
    render: redraw,
    character(id) {
      if (id !== undefined) {
        stage.character.select(id);
        redraw();
      }
      return { id: stage.character.id, skins: stage.character.skins.map((k) => k.id) };
    },
    debug: {
      hitboxes(on) {
        const v = stage.overlay.toggle(on);
        redraw();
        return v;
      },
      panel: (on) => panel.toggle(on),
    },
  };
  window.__game = api;
  return api;
}
