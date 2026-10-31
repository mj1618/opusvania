import type { AudioDirector } from '../audio/index';
import { type RenderOptions, type RenderResult, renderTape } from '../audio/offline';
import type { Cue } from '../audio/router';
import type { BusId } from '../audio/tuning';
import type { Game, RunMode } from '../game';
import { type InputScript, parseInputScript } from '../input/script';
import type { GameApp } from '../render/app';
import { FEEL, setShake } from '../render/camera/shake';
import { type CameraView, SAFE_H, SAFE_W, type ViewSize } from '../render/contract';
import { GREYBOX } from '../render/greybox/index';
import type { PointLight } from '../render/lights';
import { POST } from '../render/post/config';
import type { CameraOverride, RenderStage } from '../render/stage';
import { clearSave, readSave, type SlotStore } from '../save/storage';
import { ROOM_IDS, ROOMS } from '../scene/index';
import type { Room } from '../scene/room';
import { ABILITIES, type AbilityId, isAbility } from '../sim/abilities';
import { bossRules, jumpBoss } from '../sim/boss/index';
import { enemiesAlive } from '../sim/enemies';
import type { SimEvent } from '../sim/events';
import { offerTarget } from '../sim/giving';
import { restPoint } from '../sim/goal';
import { type GameState, goalHolds, heartBox, lampCost, lanternBox, lanternCost } from '../sim/index';
import { barkHpMax, capHeight } from '../sim/kit';
import { flameAt, flingTarget, lureHpMax, lureRowNow } from '../sim/lures';
import { pickupsWorth } from '../sim/pickups';
import { podHpMax, podsWorth, podValue } from '../sim/pods';
import { markSeen, seenNow, seenScale } from '../sim/seen';
import type { Tuning } from '../sim/tuning';
import { isUpgrade, UPGRADE_IDS, upgradeFlag, upgradesOwned, withUpgrades } from '../sim/upgrades';
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
  /**
   * A new game in the room (default the current one; another id switches room in place): fresh state
   * at its spawn, frame 0, a fresh save (abilities granted with `grant` / `?abilities` are kept).
   */
  load(roomId?: string): GameState;
  /** The current room's id. With an id: `goto(id)` (she goes there, the save kept). */
  room(id?: string): string;
  /**
   * The world (memory/world.md): its start, every room with its world placement and size (`placed`
   * false for the test rooms), and where each exit and door leads (`null`: arrival only).
   */
  world(): {
    start: string;
    rooms: Array<{
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      placed: boolean;
      region?: string;
    }>;
    links: Record<string, { to: string; exit: string } | null>;
    doors: Record<string, { to: string; exit: string }>;
  };
  /**
   * What she has earned (`state().save`, memory/save.md) and the slot: `stored` = the save in
   * localStorage now (null: none), `autosave` = whether this page writes it (a page booted without
   * `?room=`).
   */
  save(): { save: GameState['save']; stored: GameState['save'] | null; autosave: boolean };
  /**
   * She goes to room `id` with her feet at (x, y) (default its spawn), at rest, keeping the save (the
   * renderers rebuild for it). The current room: a teleport. Returns the state.
   */
  goto(id: string, x?: number, y?: number): GameState;
  /** Empties the save slot (the game in the page goes on; `load()` or `?fresh` for a new one). */
  clearSave(): void;
  /** The map overlay (Tab) open or closed; no argument toggles. Redraws. */
  map(on?: boolean): boolean;
  /** Every room id: the real game's rooms (content/world.json), then the test rooms. */
  rooms(): string[];
  /** What she owns (`state().save.abilities`) and every ability there is. */
  abilities(): { owned: AbilityId[]; all: AbilityId[] };
  /** She owns these too from the next step on (`'all'` = everything); a restart keeps them. Returns what she owns. */
  grant(...ids: string[]): AbilityId[];
  /** She no longer owns these (`'all'` = none). Returns what she owns. */
  revoke(...ids: string[]): AbilityId[];
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
  /** The room's data (content/rooms/<id>.json, validated; the sim's part and the render-only fields). */
  scene(): Room;
  /**
   * Mode, frame, view and canvas sizes, GPU. `view` is the logical view now (any window shape:
   * contract.ts ViewSize, memory/view-size.md); `safe` the 16:9 safe area inside it.
   */
  info(): {
    mode: RunMode;
    frame: number;
    clock: number;
    scene: { id: string; width: number; height: number };
    view: ViewSize;
    safe: { x: number; y: number; w: number; h: number };
    canvas: { w: number; h: number; resolution: number };
    gpu: string;
  };
  /** Stable hash of the sim state. */
  hash(): string;
  /** The live tuning object's values. */
  tuning(): Tuning;
  /** Sets one dotted path (`'run.maxSpeed', 12`) or merges a partial. Returns the tuning. */
  /**
   * Lanternroot's glow (memory/glow.md): no argument returns `{glow, max}`; a number sets what she carries (clamped
   * to the meter). Render and sound read `player.glow`.
   */
  glow(n?: number): { glow: number; max: number };
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
   * Lures, the story's lamps (memory/lures.md): how many are out, the moths freed, the fling she is aiming
   * (`fling`: the lure's id, frames aimed of `of`, the aim, the predicted arc; null = none), the one in reach
   * of a fling now (`reach`), her launch momentum `pullX`, and every lure with its kind's numbers (`fling` =
   * its reach), `hp` left of `hpMax` and `state` (`burning` | `out`).
   */
  lures(): {
    snuffed: number;
    freed: number;
    total: number;
    fling: { id: string; frames: number; of: number; aimX: number; aimY: number; arc: number[] } | null;
    reach: string | null;
    pullX: number;
    list: Array<{
      id: string;
      kind: string;
      x: number;
      y: number;
      spin: number;
      state: 'burning' | 'out';
      hp: number;
      hpMax: number;
      radius: number;
      core: number;
      fling: number;
      moths: number;
      outFrame: number | null;
    }>;
  };
  /**
   * The level kit (memory/level-kit.md): thorns, seed-cases, rotten bark (`hp` cuts left of `hpMax`;
   * `broken` once the save has it), gates (`open` once their flag is set), triggers (`set`), the save's
   * story flags, and `hold` (frames of a thorn's hold under way, 0 = none).
   */
  kit(): {
    thorns: Array<{ id: string; x: number; y: number; w: number; h: number }>;
    seedCases: Array<{ id: string; x: number; y: number }>;
    bark: Array<{
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      floor: boolean;
      hp: number;
      hpMax: number;
      broken: boolean;
    }>;
    gates: Array<{ id: string; flag: string; open: boolean }>;
    triggers: Array<{ id: string; sets: string; set: boolean }>;
    flags: string[];
    hold: number;
  };
  /**
   * Story flags (memory/level-kit.md): `flag()` lists the save's; `flag(name)` sets one, `flag(name,
   * false)` clears it. Gates follow from the next step (`gateOpen` when one opens). Returns the flags.
   */
  flag(name?: string, on?: boolean): string[];
  /**
   * Finds (memory/level-kit.md): the room's moth-stones (`read`), firefly signs (`read`, the flag and
   * rhythm), moonlit hollows (`taken`, the upgrade), the areas drawn on the map, the upgrades she owns,
   * and bounce caps with the rise each gives.
   */
  finds(): {
    stones: Array<{ id: string; x: number; y: number; area: string; read: boolean }>;
    signs: Array<{ id: string; x: number; y: number; flag: string; rhythm: string; read: boolean }>;
    hollows: Array<{ id: string; upgrade: string; taken: boolean }>;
    caps: Array<{ id: string; x: number; y: number; w: number; tier: string; height: number }>;
    areas: string[];
    upgrades: string[];
  };
  /** Upgrades: `upgrade()` lists hers; `upgrade(id)` grants one (`UPGRADE_IDS`: `quickWings`, `keenBlade`, `nightEyes`, `longBreath`, `sharpWings`), `upgrade(id, false)` takes it away. */
  upgrade(id?: string, on?: boolean): string[];
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
      /** Lamp rules (memory/creatures.md): how it notices her, the lure it guards, gave up when that went out. */
      sense: 'wallet' | 'lamp' | 'always';
      guards: string | null;
      dispersed: boolean;
      /** Old burrback: its shell open after a wall stun; braces made this exchange (the first is the feint). */
      stunned: boolean;
      feints: number;
    }>;
  };
  /**
   * The lamp-rule creatures (memory/creatures.md): `lit` = how lit she is (0 dark .. 1 at a flame:
   * what a lamp room's sight hunters see her by), `grab` = what holds her (a web; `beats` of `of`),
   * `webs` = each web's strands (`intact`, `cut`, `fell`), slack once its lamp is out, and its last touch.
   */
  /**
   * The room's boss fight (memory/bosses.md), null without one: its stage (`wait` / `intro` / `fight` /
   * `shift` / `end` / `down`), phase (1-based, with its name), the doors (`locked`), `retry`, the fight's
   * clock (`time`, `phaseTime` frames), its creature (mode, box centre, hp of this phase, open / stunned),
   * the tell now showing (`attack`, frames left, the floor span `x0..x1`, `safeX`), its thread, the heart
   * (where it is now, its row and radius, hp, guarded) and the ring flames. `boss({phase: n})` first sets
   * the fight up as phase n begins (debug: the doors seal, earlier phases are done).
   */
  /**
   * The boss rush (`?world=demo-bossrush`, memory/bossrush.md): `rush(n)` puts her at boss n's door (1 the Weaver,
   * 2 the Gloamweaver, 3 the Mantis; 0 the hub) with what the bosses before it would have taught her (their flags
   * set, the dash, the Moonstep), at full health. Returns the room's id.
   */
  rush(n: number): string;
  boss(set?: { phase?: number }): {
    id: string;
    name: string;
    move: string;
    stage: string;
    phase: number;
    phaseName: string;
    locked: boolean;
    retry: boolean;
    attempt: number;
    time: number;
    phaseTime: number;
    creature: {
      mode: string;
      x: number;
      y: number;
      hp: number;
      hpMax: number;
      facing: number;
      open: boolean;
      stunned: boolean;
      gone: boolean;
    } | null;
    tell: { attack: string; frames: number; x0: number; x1: number; safeX: number } | null;
    thread: { x0: number; y0: number; side: number; drop: number } | null;
    heart: { x: number; y: number; row: string; radius: number; hp: number; shield: boolean };
    rings: Array<{ id: string; burning: boolean }>;
    flags: { met: boolean; down: boolean };
  } | null;
  creatures(): {
    lit: number;
    grab: { id: string; x: number; y: number; beats: number; of: number; frames: number } | null;
    grace: number;
    webs: Array<{
      id: string;
      strands: number;
      intact: number;
      cut: number;
      fell: number;
      slack: boolean;
      touch: { x: number; y: number; strand: number } | null;
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
   * (base64) with level numbers (`npm run clip -- --audio`); `from` / `to` render a window of a long tape
   * (steps since `record()`; tools/playtest/route-video.ts --audio).
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
    /** Post-processing on/off (no argument toggles); redraws. */
    post(on?: boolean): boolean;
    /**
     * What the GPU holds (the leak test, memory/world.md): textures uploaded and their size in MB
     * (width x height x 4 bytes, mips and MSAA not counted), GPU buffers, and how many times the
     * room's renderers have been built.
     */
    gpu(list?: boolean): {
      textures: number;
      textureMB: number;
      buffers: number;
      builds: number;
      /** With `list`: every texture `[uid, w, h, kind, label]`. */
      list?: Array<[number, number, number, string, string]>;
    };
    /** Greybox rooms: the marker labels and notes on/off (no argument toggles; also the G key); redraws. */
    labels(on?: boolean): boolean;
    /**
     * Screen shake and the camera kick on/off (the accessibility toggle, memory/feel.md; no argument
     * toggles). Remembered in localStorage; `?shake=off` / `?noshake` at boot.
     */
    shake(on?: boolean): boolean;
    /**
     * The canvas's clear colour (what an uncovered pixel shows: the letterbox past the widest or
     * tallest view); no argument reads it. Redraws. The coverage e2e sets a loud one.
     */
    clearColor(rgb?: number): number;
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
  /** The save slot and whether this page writes it (memory/save.md). */
  store?: SlotStore | null;
  autosave?: boolean;
  /** The map overlay (Tab). */
  map?: { toggle(on?: boolean): void; open(): boolean };
}): GameDebugApi {
  const { game, ga, stage, panel } = deps;
  const store = deps.store ?? null;
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
      render: (opts) =>
        renderTape(au.recording(), game.scene, game.seed, {
          sceneOf: (id) => game.world?.rooms[id]?.scene ?? (id === game.scene.id ? game.scene : undefined),
          ...opts,
        }),
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
    load(roomId) {
      if (roomId !== undefined && !ROOMS[roomId])
        throw new Error(`Unknown room "${roomId}". Rooms: ${ROOM_IDS.join(', ')}.`);
      game.reset(roomId);
      redraw();
      return snapshot();
    },
    room(id) {
      if (id !== undefined && id !== game.scene.id) api.goto(id);
      return game.scene.id;
    },
    world() {
      const w = game.world;
      if (!w) return { start: game.scene.id, rooms: [], links: {}, doors: {} };
      return JSON.parse(
        JSON.stringify({
          start: w.start,
          rooms: Object.values(w.rooms).map((r) => ({
            id: r.id,
            x: r.x,
            y: r.y,
            w: r.scene.width,
            h: r.scene.height,
            placed: r.placed,
            region: (r.scene as Room).region,
          })),
          links: w.links,
          doors: w.doors,
        }),
      );
    },
    save() {
      return {
        save: JSON.parse(JSON.stringify(game.state.save)),
        stored: readSave(store),
        autosave: deps.autosave ?? false,
      };
    },
    goto(id, x, y) {
      if (!ROOMS[id]) throw new Error(`Unknown room "${id}". Rooms: ${ROOM_IDS.join(', ')}.`);
      game.goto(id, x, y);
      redraw();
      return snapshot();
    },
    clearSave() {
      clearSave(store);
    },
    map(on) {
      deps.map?.toggle(on);
      redraw();
      return deps.map?.open() ?? false;
    },
    rooms: () => [...ROOM_IDS],
    abilities: () => ({ owned: game.abilities, all: [...ABILITIES] }),
    grant(...ids) {
      const add = ids.includes('all') ? [...ABILITIES] : ids;
      const bad = add.filter((a) => !isAbility(a));
      if (bad.length)
        throw new Error(`Unknown ability "${bad.join(', ')}". Abilities: ${ABILITIES.join(', ')}.`);
      // (No redraw: nothing on screen shows what she owns, and a redraw would move render springs.)
      return game.setAbilities([...game.abilities, ...add]);
    },
    revoke(...ids) {
      const bad = ids.filter((a) => a !== 'all' && !isAbility(a));
      if (bad.length)
        throw new Error(`Unknown ability "${bad.join(', ')}". Abilities: ${ABILITIES.join(', ')}.`);
      return game.setAbilities(ids.includes('all') ? [] : game.abilities.filter((a) => !ids.includes(a)));
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
    scene: () => JSON.parse(JSON.stringify(game.scene)) as Room,
    info() {
      const gl = (ga.app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        mode: game.mode,
        frame: game.state.frame,
        clock: stage.clock,
        scene: { id: game.scene.id, width: game.scene.width, height: game.scene.height },
        view: { ...ga.view() },
        safe: { x: 0, y: 0, w: SAFE_W, h: SAFE_H },
        canvas: { w: ga.app.canvas.width, h: ga.app.canvas.height, resolution: ga.app.renderer.resolution },
        gpu: String((ext && gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) ?? 'unknown'),
      };
    },
    hash: () => game.hash(),
    tuning: () => JSON.parse(JSON.stringify(game.tuning)) as Tuning,
    glow(n) {
      const t = withUpgrades(game.tuning, game.state.save);
      const max = Math.max(0, Math.round(t.glow.max));
      if (n !== undefined) {
        game.state.player.glow = Math.max(0, Math.min(max, Math.round(n)));
        redraw();
      }
      return { glow: game.state.player.glow, max };
    },
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
    kit() {
      const sc = game.scene;
      const k = game.state.kit;
      const sv = game.state.save;
      return {
        thorns: (sc.thorns ?? []).map((r) => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h })),
        seedCases: (sc.seedCases ?? []).map((c) => ({ id: c.id, x: c.x, y: c.y })),
        bark: (sc.bark ?? []).map((b, i) => ({
          id: b.id,
          x: b.x,
          y: b.y,
          w: b.w,
          h: b.h,
          floor: b.floor === true,
          hp: k.bark[i] ?? 0,
          hpMax: barkHpMax(b, game.tuning),
          broken: sv.opened.includes(`${sc.id}:${b.id}`),
        })),
        gates: (sc.gates ?? []).map((g) => ({ id: g.id, flag: g.flag, open: sv.flags.includes(g.flag) })),
        triggers: (sc.triggers ?? []).map((t) => ({
          id: t.id,
          sets: t.sets,
          set: sv.flags.includes(t.sets),
        })),
        flags: sv.flags.slice(),
        hold: k.hold,
      };
    },
    finds() {
      const sc = game.scene;
      const sv = game.state.save;
      const read = (id: string) => sv.taken.includes(`${sc.id}:${id}`);
      const areas = new Set<string>();
      for (const r of Object.values(game.world?.rooms ?? {}))
        for (const m of r.scene.mothStones ?? []) if (sv.taken.includes(`${r.id}:${m.id}`)) areas.add(m.area);
      return {
        stones: (sc.mothStones ?? []).map((m) => ({
          id: m.id,
          x: m.x,
          y: m.y,
          area: m.area,
          read: read(m.id),
        })),
        signs: (sc.signs ?? []).map((s) => ({
          id: s.id,
          x: s.x,
          y: s.y,
          flag: s.flag ?? '',
          rhythm: s.rhythm ?? '',
          read: read(s.id),
        })),
        hollows: (sc.hollows ?? []).map((h) => ({ id: h.id, upgrade: h.upgrade, taken: read(h.id) })),
        caps: (sc.caps ?? []).map((c) => ({
          id: c.id,
          x: c.x,
          y: c.y,
          w: c.w,
          tier: c.tier ?? 'small',
          height: capHeight(c, game.tuning, false),
        })),
        areas: [...areas],
        upgrades: upgradesOwned(sv),
      };
    },
    upgrade(id, on = true) {
      const sv = game.state.save;
      if (id !== undefined) {
        if (!isUpgrade(id)) throw new Error(`upgrade: no upgrade "${id}" (${UPGRADE_IDS.join(', ')})`);
        const f = upgradeFlag(id);
        const at = sv.flags.indexOf(f);
        if (on && at < 0) sv.flags.push(f);
        if (!on && at >= 0) sv.flags.splice(at, 1);
      }
      return upgradesOwned(sv);
    },
    flag(name, on = true) {
      const flags = game.state.save.flags;
      if (name !== undefined) {
        const at = flags.indexOf(name);
        if (on && at < 0) flags.push(name);
        if (!on && at >= 0) flags.splice(at, 1);
      }
      return flags.slice();
    },
    lures() {
      const s = game.state.lures;
      const p = game.state.player;
      const list = game.scene.lures ?? [];
      const aimed = list[p.fling];
      const near = flingTarget(game.state, game.scene, game.tuning);
      return {
        snuffed: s.snuffed,
        freed: s.freed,
        total: list.length,
        fling: aimed
          ? {
              id: aimed.id,
              frames: p.flingFrames,
              of: Math.round(game.tuning.lures.flingFrames),
              aimX: p.lureAimX,
              aimY: p.lureAimY,
              arc: p.lureArc.slice(),
            }
          : null,
        reach: near >= 0 ? (list[near]?.id ?? null) : null,
        pullX: p.pullX,
        list: list.map((l, i) => {
          const K = lureRowNow(s, i, l, game.tuning);
          const hp = s.hp[i] ?? 0;
          const at = flameAt(s, i, l, Math.max(0, game.state.frame - 1), game.tuning);
          return {
            id: l.id,
            kind: l.kind,
            x: at.x,
            y: at.y,
            spin: l.spin ?? 1,
            state: hp > 0 ? ('burning' as const) : ('out' as const),
            hp,
            hpMax: lureHpMax(l, game.tuning),
            radius: K.radius,
            core: K.core,
            fling: K.fling,
            moths: K.moths,
            outFrame: (s.out[i] ?? 0) > 0 ? (s.out[i] as number) - 1 : null,
          };
        }),
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
          sense: e.sense === 1 ? 'lamp' : e.sense === 2 ? 'always' : 'wallet',
          guards: homes[i]?.guards ?? null,
          dispersed: e.dispersed,
          stunned: e.stunned,
          feints: e.feints,
        })),
      };
    },
    rush(n) {
      const order: Array<[string, string, (s: GameState['save']) => void]> = [
        ['br-weaver', 'br-weaver-down', (s) => s.abilities.includes('dash') || s.abilities.push('dash')],
        [
          'br-gloam',
          'br-gloam-down',
          (s) => s.flags.includes('upgrade:moonstep') || s.flags.push('upgrade:moonstep'),
        ],
        ['br-mantis', 'br-mantis-down', () => {}],
      ];
      const save = game.state.save;
      const k = Math.max(0, Math.min(3, Math.round(n)));
      for (let i = 0; i < k - 1; i++) {
        const [, flag, grant] = order[i] as (typeof order)[number];
        if (!save.flags.includes(flag)) save.flags.push(flag);
        grant(save);
      }
      game.setAbilities([...save.abilities]);
      const room = k === 0 ? 'br-hub' : (order[k - 1] as (typeof order)[number])[0];
      const r = ROOMS[room];
      if (!r) throw new Error(`rush: no room "${room}"`);
      const patch = r.patches?.find((p) => p.id === 'p-gate');
      game.goto(room, patch ? patch.x : r.spawn.x, patch ? patch.y : r.spawn.y);
      game.state.player.hp = game.state.player.hpMax;
      redraw();
      return room;
    },
    boss(set) {
      const spec = game.scene.boss;
      if (!spec || !game.state.boss) return null;
      if (set?.phase !== undefined) {
        const events: SimEvent[] = [];
        jumpBoss(game.state, game.scene, game.tuning, set.phase, events);
        for (const fn of game.afterStep) fn(events);
        redraw();
      }
      const st = game.state;
      const b = st.boss as NonNullable<GameState['boss']>;
      const e = st.enemies.find((x) => x.id === spec.creature);
      const lures = game.scene.lures ?? [];
      const hi = lures.findIndex((l) => l.id === spec.heart);
      const hl = lures[hi];
      const hf = hl ? flameAt(st.lures, hi, hl, Math.max(0, st.frame - 1), game.tuning) : { x: 0, y: 0 };
      // (Each boss's own phase table: the Weaver's ring, the Gloamweaver's hunt.)
      const names = bossRules(spec.kind).phases.map((p) => p.name);
      return {
        id: b.id,
        name: spec.name,
        move: b.move,
        stage: b.stage,
        phase: b.phase,
        phaseName: names[b.phase - 1] ?? '',
        locked: b.locked,
        retry: b.retry,
        attempt: b.attempt,
        time: b.time,
        phaseTime: b.phaseTime,
        creature: e
          ? {
              mode: e.mode,
              x: e.x + e.w / 2,
              y: e.y + e.h / 2,
              hp: e.hp,
              hpMax: e.hpMax,
              facing: e.facing,
              open: e.mode === 'recover',
              stunned: e.stunned,
              gone: e.gone,
            }
          : null,
        tell: b.tell
          ? { attack: b.tell, frames: b.tellFrames, x0: b.tellX0, x1: b.tellX1, safeX: b.safeX }
          : null,
        thread: b.thread ? { x0: b.pivotX, y0: b.pivotY, side: b.side, drop: b.drop } : null,
        heart: {
          x: hf.x,
          y: hf.y,
          row: st.lures.live?.row[hi] || (hl?.kind ?? ''),
          radius: hl ? lureRowNow(st.lures, hi, hl, game.tuning).radius : 0,
          hp: st.lures.hp[hi] ?? 0,
          shield: (st.lures.live?.shield[hi] ?? 0) > 0,
        },
        rings: spec.rings.map((id) => ({
          id,
          burning: (st.lures.hp[lures.findIndex((l) => l.id === id)] ?? 0) > 0,
        })),
        flags: { met: st.save.flags.includes(spec.met), down: st.save.flags.includes(spec.flag) },
      };
    },
    creatures() {
      const st = game.state;
      const p = st.player;
      const holder = p.grab >= 0 ? st.enemies[p.grab] : undefined;
      const count = (e: { cut: string }, c: string) => e.cut.split('').filter((x) => x === c).length;
      return {
        lit: p.lit,
        grab: holder
          ? {
              id: holder.id,
              x: p.grabX,
              y: p.grabY,
              beats: p.lureBeats,
              of: game.tuning.grab.beats,
              frames: p.lureFrames,
            }
          : null,
        grace: p.grabGrace,
        webs: st.enemies
          .filter((e) => e.kind === 'web')
          .map((e) => ({
            id: e.id,
            strands: e.cut.length,
            intact: count(e, '0'),
            cut: count(e, '1'),
            fell: count(e, '2'),
            slack: e.dispersed,
            touch: e.seg >= 0 ? { x: e.targetX, y: e.targetY, strand: e.seg } : null,
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
      post(on) {
        POST.enabled = on ?? !POST.enabled;
        redraw();
        return POST.enabled;
      },
      labels(on) {
        GREYBOX.labels = on ?? !GREYBOX.labels;
        redraw();
        return GREYBOX.labels;
      },
      shake: (on) => setShake(on ?? !FEEL.shake),
      gpu(list) {
        type Src = {
          uid: number;
          pixelWidth: number;
          pixelHeight: number;
          label?: string;
          resource?: unknown;
        };
        const r = ga.app.renderer as unknown as {
          texture: { managedTextures: Array<Src | null> };
          buffer: { _managedBuffers?: { items: Record<string, unknown> } };
        };
        const tex = r.texture.managedTextures.filter((t) => t !== null && t !== undefined);
        const bytes = tex.reduce((a, t) => a + (t?.pixelWidth ?? 0) * (t?.pixelHeight ?? 0) * 4, 0);
        return {
          textures: tex.length,
          textureMB: Math.round(bytes / 1e5) / 10,
          buffers: Object.values(r.buffer._managedBuffers?.items ?? {}).filter(
            (b) => b !== null && b !== undefined,
          ).length,
          builds: stage.builds,
          list: list
            ? tex.map((t) => [
                t?.uid ?? 0,
                t?.pixelWidth ?? 0,
                t?.pixelHeight ?? 0,
                (t?.resource as { constructor?: { name?: string } } | undefined)?.constructor?.name ?? 'rt',
                t?.label ?? '',
              ])
            : undefined,
        };
      },
      clearColor(rgb) {
        const bg = ga.app.renderer.background;
        if (rgb !== undefined) {
          bg.color = rgb;
          redraw();
        }
        return bg.color.toNumber();
      },
    },
  };
  // The collision overlay draws the enemies' true boxes from the live state.
  stage.overlay.opened = () => game.state.save.opened;
  stage.overlay.enemies = () => game.state.enemies;
  stage.overlay.lures = () => game.state.lures.hp;
  stage.overlay.frame = () => game.state.frame;
  stage.overlay.kit = () => ({ kit: game.state.kit, flags: game.state.save.flags });
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
