import type { AudioDirector } from '../audio/index';
import { type RenderOptions, type RenderResult, renderTape } from '../audio/offline';
import type { Cue } from '../audio/router';
import type { BusId } from '../audio/tuning';
import type { Game, RunMode } from '../game';
import { type InputScript, parseInputScript } from '../input/script';
import type { GameApp } from '../render/app';
import { type CameraView, VIEW_H, VIEW_W } from '../render/contract';
import type { PointLight } from '../render/lights';
import type { CameraOverride, RenderStage } from '../render/stage';
import { enemiesAlive } from '../sim/enemies';
import type { SimEvent } from '../sim/events';
import { offerTarget } from '../sim/giving';
import { restPoint } from '../sim/goal';
import { type GameState, goalHolds, heartBox, lampCost, lanternBox, lanternCost } from '../sim/index';
import { pickupsWorth } from '../sim/pickups';
import { podHpMax, podsWorth, podValue } from '../sim/pods';
import type { Scene } from '../sim/scene';
import { markSeen, seenNow, seenScale } from '../sim/seen';
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
  /** Queues scripted input (`R30 R+J12 A1 .5`, A = attack, O = offer, or `right*30 right+jump*12`, src/input/script.ts). Returns frames queued in total. */
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
   * count), and every pod with its state (`closed`, `open`), hit points (`hp` left of `hpMax`), what
   * it is `worth` in all, how much of that has been set loose (`paid`) and the glints still flying.
   */
  pods(): {
    burst: number;
    total: number;
    worth: number;
    list: Array<{
      id: string;
      x: number;
      y: number;
      mount: string;
      state: 'closed' | 'open';
      hp: number;
      hpMax: number;
      worth: number;
      paid: number;
      left: number;
    }>;
  };
  /**
   * Enemies: how many are alive, and each with where it is (`x`, `y` = feet centre; `box` = its
   * collision box), where it started (`home`: the scene's `x`, `y`: a burrback's feet, a lampwing's
   * home centre), its health and what it is doing (`mode`: walk, pause, alert, windup, charge,
   * recover / hover, curious, dive, stall, pursue (the climb), rest, return / hurt, dead; `gone`
   * once the dead body has been removed), its velocity
   * and, for a lampwing, what it is drawn to (`target`). `state().enemies` has the rest.
   */
  enemies(): {
    alive: number;
    total: number;
    list: Array<{
      id: string;
      kind: string;
      x: number;
      y: number;
      box: { x: number; y: number; w: number; h: number };
      home: { x: number; y: number };
      facing: number;
      hp: number;
      hpMax: number;
      mode: string;
      modeFrames: number;
      /** Burrback: shell forward (windup / ram: a front cut glances off), frames until it may brace again. */
      braced: boolean;
      strikeCd: number;
      /** Burrback: times it has stood winded (tired from the second), frames left of being roused (cut) / stirred (rammed). */
      rams: number;
      roused: number;
      stirred: number;
      /** Lampwing: dives made at her since it noticed her. */
      dives: number;
      /** Giving (memory/giving.md): frames left of being aware of her, of a calm, of the calm a gift bought; glints she has given it. */
      aware: number;
      calm: number;
      gift: number;
      gifts: number;
      gone: boolean;
      vx: number;
      vy: number;
      target: { x: number; y: number };
    }>;
  };
  /**
   * Giving (memory/giving.md). `seen` 0..1 / `level` 0-4: how visible the light she carries makes
   * her (`steps` = the wallet thresholds of levels 1-4); `reach` = how far each kind notices her now
   * (`burrback`: brace reach box to box and awareness centre to centre; `lampwing`: its sight, px,
   * unless the scene gives one its own); `target` = what an offer would go to now (null = nothing in
   * reach); `gift` = the glint in flight; `gifted` = glints given to creatures; `heartGiven` = to
   * the heart; `aware` = ids of the creatures aware of her now. With a number: sets the wallet
   * first (for tests: being seen is the wallet).
   */
  giving(wallet?: number): {
    wallet: number;
    seen: number;
    level: number;
    steps: number[];
    reach: { burrback: { brace: number; aware: number }; lampwing: number };
    target: { kind: string; id: string } | null;
    gift: { to: string; index: number; frames: number; x: number; y: number } | null;
    offerCd: number;
    gifted: number;
    heartGiven: number;
    aware: string[];
  };
  /**
   * Her health: `{hp, hpMax, invuln, stagger, faded, safe}` (`safe` = where she would re-form).
   * With a number: sets `hp` to it first (1..hpMax), for tests. 0 is not allowed: take a hit instead.
   */
  health(hp?: number): {
    hp: number;
    hpMax: number;
    invuln: number;
    stagger: number;
    faded: number;
    safe: { x: number; y: number };
  };
  /**
   * The moth-lanterns (memory/goal.md): how many are lit, the wallet, and each with its foot
   * (`x`, `y`), trigger `box`, `cost`, `state` (`dormant`, `channel` = she is kindling it, `lit`),
   * the frames of `channel` (of `of`) and of `rest`, and whether it is where she re-forms.
   */
  lanterns(): {
    lit: number;
    total: number;
    wallet: number;
    spent: number;
    list: Array<{
      id: string;
      x: number;
      y: number;
      box: { x: number; y: number; w: number; h: number };
      cost: number;
      state: 'dormant' | 'channel' | 'lit';
      channel: number;
      of: number;
      rest: number;
      refused: boolean;
      /** The great glint it wants besides its price (`null` = none), and whether she has it. */
      key: string | null;
      keyed: boolean;
      /** Dormant: enough glints are on their way to her; it catches when they land (goal.md). */
      pledged: boolean;
      litFrame: number;
      restPoint: boolean;
      /** She has come near it this run: a wayside lamp she has passed is a re-form point even dark. */
      passed: boolean;
    }>;
  };
  /** The wayside lamps (`scene.lamps`): the same record as `lanterns()`, `lit` of `total` lamps. */
  lamps(): ReturnType<GameDebugApi['lanterns']>;
  /**
   * The goal at a glance: lanterns lit (`lamps`: wayside lamps lit, of how many; `restAt` may be a lamp's id), the wallet (`wallet` carried, `spent`, `gathered` = both),
   * the heart (`x`, `y`, `box`, `awake`, `frames` since it woke, `hinted`), the ending (`gathered`,
   * `held` = no input reaches her, `frames` of `of`, `ended`, the summary) and the run so far
   * (`time` in frames since her first input, `hits`, `kills`).
   */
  goal(): {
    lit: number;
    total: number;
    wallet: number;
    spent: number;
    gathered: number;
    restAt: string | null;
    /** Where she would re-form if she faded now: the light nearest to her (lit, or a lamp she has passed), `null` = safe ground. */
    reformAt: string | null;
    /** She re-formed at `restAt` and has not stepped out of it yet: it will not heal her until she does. */
    restHold: boolean;
    lamps: { lit: number; total: number };
    heart: {
      x: number;
      y: number;
      box: { x: number; y: number; w: number; h: number };
      awake: boolean;
      frames: number;
      hinted: boolean;
      /** Its wake has played (`tuning.goal.heartWakeFrames`): standing in it now ends the run. `waited`: she was there sooner. */
      ready: boolean;
      waited: boolean;
    } | null;
    ending: {
      gathered: boolean;
      held: boolean;
      frames: number;
      of: number;
      ended: boolean;
      glints: number;
      time: number;
      kills: number;
      hits: number;
      /** The offering (memory/goal.md): what she carried into the heart, and the tier (0-3) it reaches. */
      offered: number;
      offerTier: number;
      /** Glints short of the next tier (0 at the top). */
      offerNext: number;
    };
    /** The offering as it goes in during the hold: `given` of `total` so far, tiers passed; and the thresholds. */
    offer: { total: number; given: number; tier: number; tiers: number[] };
    /** What the grove has answered the offering with so far (tier 1 / 2 / 3). */
    grove: { flowers: boolean; paths: boolean; canopy: boolean };
    run: { time: number; hits: number; kills: number; deaths: number };
    /** Glints lying in clusters she dropped when she faded (`lost` = their sum), and the sanctuary radii. */
    lost: number;
    drops: Array<{ id: number; x: number; y: number; value: number; left: number; timer: number }>;
    sanctuary: { burrback: number; lampwing: number; lamp: { burrback: number; lampwing: number } };
  };
  /** Dynamic lights registered this frame (world px). */
  lights(): PointLight[];
  /** Redraws now (after changing something by hand in manual mode). */
  render(): void;
  /** Hero design: no argument lists `{id, skins}`; an id switches to that skin. */
  character(id?: string): { id: string; skins: string[] };
  /**
   * Sound (src/audio, memory/audio.md). Muted by default; `mute(false)` unmutes (in a real page the
   * context starts on the next gesture). `cues(n)`: the last cues routed, muted or not.
   * `record()` starts a tape of every step from now; `render(opts)` plays it offline into a WAV
   * (base64) with level numbers (`npm run clip -- --audio`).
   */
  audio: {
    state(): ReturnType<AudioDirector['state']>;
    mute(on?: boolean): boolean;
    volume(bus?: BusId | 'master', db?: number): Record<string, number>;
    cues(n?: number): Cue[];
    record(on?: boolean): number;
    render(opts?: RenderOptions): Promise<RenderResult>;
  } | null;
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
  audio?: AudioDirector | null;
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

  const lightList = (lamp: boolean): ReturnType<GameDebugApi['lanterns']> => {
    const g = game.state.goal;
    const G = game.tuning.goal;
    const list = (lamp ? game.scene.lamps : game.scene.lanterns) ?? [];
    const lights = lamp ? g.lamps : g.lanterns;
    return {
      lit: lamp ? g.lampsLit : g.lit,
      total: list.length,
      wallet: game.state.pickups.count,
      spent: game.state.pickups.spent,
      list: list.map((l, i) => {
        const s = lights[i];
        return {
          id: l.id,
          x: l.x,
          y: l.y,
          box: lanternBox(l, G),
          cost: lamp ? lampCost(l, G) : lanternCost(l, G),
          state: s?.lit ? 'lit' : (s?.channel ?? 0) > 0 ? 'channel' : 'dormant',
          channel: s?.channel ?? 0,
          of: Math.max(1, Math.round(G.channelFrames)),
          rest: s?.rest ?? 0,
          refused: s?.refused ?? false,
          key: l.key ?? null,
          keyed: s?.keyed ?? true,
          pledged: s?.pledged ?? false,
          litFrame: s?.litFrame ?? -1,
          restPoint: (lamp ? g.restLamp : g.restAt) === i,
          passed: s?.passed ?? false,
        };
      }),
    };
  };

  const au = deps.audio ?? null;
  const api: GameDebugApi = {
    audio: au && {
      state: () => au.state(),
      mute(on = true) {
        au.mute(on);
        return au.muted;
      },
      volume: (bus, db) => au.volume(bus, db),
      cues: (n) => au.cues(n),
      record: (on = true) => au.record(on),
      render: (opts) => renderTape(au.recording(), game.scene, game.seed, opts),
    },
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
          hp: s.hp[i] ?? 0,
          hpMax: podHpMax(p),
          worth: podValue(podHpMax(p), game.tuning.pods),
          paid: s.paid[i] ?? 0,
          left: s.left[i] ?? 0,
        })),
      };
    },
    enemies() {
      const homes = game.scene.enemies ?? [];
      return {
        alive: enemiesAlive(game.state),
        total: game.state.enemies.length,
        list: game.state.enemies.map((e, i) => ({
          id: e.id,
          kind: e.kind,
          x: e.x + e.w / 2,
          y: e.y + e.h,
          box: { x: e.x, y: e.y, w: e.w, h: e.h },
          home: { x: homes[i]?.x ?? 0, y: homes[i]?.y ?? 0 },
          facing: e.facing,
          hp: e.hp,
          hpMax: e.hpMax,
          mode: e.mode,
          modeFrames: e.modeFrames,
          braced: e.braced,
          strikeCd: e.strikeCd,
          rams: e.rams,
          roused: e.roused,
          stirred: e.stirred,
          dives: e.dives,
          aware: e.aware,
          calm: e.calm,
          gift: e.gift,
          gifts: e.gifts,
          gone: e.gone,
          vx: e.vx,
          vy: e.vy,
          target: { x: e.targetX, y: e.targetY },
        })),
      };
    },
    giving(wallet) {
      const st = game.state;
      const t = game.tuning;
      if (wallet !== undefined) {
        if (!(wallet >= 0)) throw new Error('wallet must be 0 or more');
        st.pickups.count = Math.round(wallet);
        markSeen(st, t);
      }
      const p = st.player;
      const level = seenNow(st, t);
      const k = seenScale(level, t.giving);
      const target = offerTarget(st, game.scene, t);
      return {
        wallet: st.pickups.count,
        seen: level / 4,
        level,
        steps: [t.giving.seen1, t.giving.seen2, t.giving.seen3, t.giving.seen4],
        reach: {
          burrback: {
            brace: Math.round(t.burrback.strikePx * k),
            aware: Math.round(t.burrback.noticePx * k),
          },
          lampwing: Math.round(t.lampwing.noticePx * k),
        },
        target: st.pickups.count >= 1 && target ? { kind: target.kind, id: target.id } : null,
        gift:
          p.giftTimer > 0
            ? { to: p.giftTo, index: p.giftIndex, frames: p.giftTimer, x: p.giftX, y: p.giftY }
            : null,
        offerCd: p.offerCd,
        gifted: st.pickups.gifted,
        heartGiven: st.goal.heartGiven,
        aware: st.enemies.filter((e) => e.aware > 0).map((e) => e.id),
      };
    },
    health(hp) {
      const p = game.state.player;
      if (hp !== undefined) {
        if (!(hp >= 1 && hp <= p.hpMax)) throw new Error(`health must be 1..${p.hpMax}`);
        p.hp = Math.round(hp);
      }
      return {
        hp: p.hp,
        hpMax: p.hpMax,
        invuln: p.invuln,
        stagger: p.stagger,
        faded: p.faded,
        safe: { x: p.safeX, y: p.safeY },
      };
    },
    lanterns: () => lightList(false),
    lamps: () => lightList(true),
    goal() {
      const reformAtId = (): string | null => {
        const at = restPoint(game.state, game.scene, game.tuning);
        if (!at) return null;
        return (at.lamp ? game.scene.lamps : game.scene.lanterns)?.[at.i]?.id ?? null;
      };
      const g = game.state.goal;
      const G = game.tuning.goal;
      const w = game.state.pickups;
      const h = game.scene.heart;
      const kills = game.state.enemies.length - enemiesAlive(game.state);
      return {
        lit: g.lit,
        total: game.scene.lanterns?.length ?? 0,
        wallet: w.count,
        spent: w.spent,
        gathered: w.count + w.spent + w.lost + w.offered,
        restAt: game.scene.lamps?.[g.restLamp]?.id ?? game.scene.lanterns?.[g.restAt]?.id ?? null,
        reformAt: reformAtId(),
        restHold: g.restHold,
        lamps: { lit: g.lampsLit, total: game.scene.lamps?.length ?? 0 },
        heart: h ? { x: h.x, y: h.y, box: heartBox(h, G), ...g.heart } : null,
        ending: {
          gathered: g.gathered,
          held: goalHolds(g, G),
          of: Math.max(1, Math.round(G.holdFrames)),
          ended: g.ended,
          ...g.ending,
        },
        offer: { ...g.offer, tiers: [G.offerTier1, G.offerTier2, G.offerTier3] },
        grove: { ...g.grove },
        run: {
          time: g.run.start < 0 ? 0 : game.state.frame - g.run.start,
          hits: g.run.hits,
          kills,
          deaths: g.run.deaths,
        },
        lost: w.lost,
        drops: w.drops.map((d) => ({ ...d })),
        sanctuary: {
          burrback: G.sanctuaryPx,
          lampwing: G.lampSanctuaryPx,
          lamp: { burrback: G.waysidePx, lampwing: G.waysideWingPx },
        },
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
  // The collision overlay draws the enemies' true boxes from the live state.
  stage.overlay.enemies = () => game.state.enemies;
  stage.overlay.ramPx = () => game.tuning.burrback.chargePx;
  // ... and the lanterns' and the heart's trigger boxes.
  stage.overlay.goal = () => {
    const g = game.state.goal;
    const G = game.tuning.goal;
    const h = game.scene.heart;
    return {
      lanterns: [false, true].flatMap((lamp) =>
        ((lamp ? game.scene.lamps : game.scene.lanterns) ?? []).map((l, i) => {
          const s = (lamp ? g.lamps : g.lanterns)[i];
          return {
            box: lanternBox(l, G),
            lit: s?.lit ?? false,
            channel: (s?.channel ?? 0) / Math.max(1, G.channelFrames),
            rest: (s?.rest ?? 0) / Math.max(1, G.restFrames),
            restPoint: (lamp ? g.restLamp : g.restAt) === i,
            lamp,
          };
        }),
      ),
      heart: h ? { box: heartBox(h, G), awake: g.heart.awake, gathered: g.gathered } : null,
      sanctuary: G.sanctuaryPx,
      lampSanctuary: G.lampSanctuaryPx,
      wayside: G.waysidePx,
      waysideWing: G.waysideWingPx,
      drops: game.state.pickups.drops,
    };
  };
  window.__game = api;
  return api;
}
