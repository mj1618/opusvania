import type { Room } from './scene/room';
import { type AbilityId, normalizeAbilities } from './sim/abilities';
import type { SimEvent } from './sim/events';
import {
  cloneSave,
  cloneState,
  continueState,
  createState,
  type GameState,
  gotoRoom,
  hashState,
  placePlayer,
  type SaveState,
  step,
  type World,
} from './sim/index';
import type { InputFrame } from './sim/input';
import type { Tuning } from './sim/tuning';

/**
 * 'realtime': the loop steps the sim from wall time and live input.
 * 'frozen':   the sim stands still; render time keeps running (look at the scene animating).
 * 'manual':   nothing advances except through Game.stepOnce (debug API, tests, shots, clips).
 */
export type RunMode = 'realtime' | 'frozen' | 'manual';

export interface GameOptions {
  /**
   * The world (memory/world.md): exits lead to neighbours, a fade re-forms her at her last moon patch
   * in any room, `goto` works. Null (tests on one scene): an exit restarts the room.
   */
  world?: World | null;
  /** Continue from this save (at its moon patch, or the world's start); needs `world`. */
  save?: SaveState | null;
}

/**
 * Runtime harness around the pure sim: owns the current and previous state (for render
 * interpolation) and scripted input. No DOM here, so it also runs headless in Node.
 *
 * `scene` is the room being played (any `Scene` is a `Room`: the render-only fields are optional). It
 * changes when she goes into another room (`state.room`): read it again after every step.
 */
export class Game {
  state: GameState;
  /** State before the last step; render interpolates prev -> state. */
  prev: GameState;
  mode: RunMode = 'realtime';
  /** The room being played: `world.rooms[state.room]`, or the scene given (no world / a test room). */
  scene: Room;
  readonly world: World | null;
  private scripted: InputFrame[] = [];
  /**
   * The abilities a restart gives her when they are not the room's own starting kit: set by
   * `?abilities=` and by `setAbilities` (debug), so a restart keeps what was granted. null = the room's kit.
   */
  private kit: AbilityId[] | null;
  /**
   * Called after every sim step, and after every placement (boot, load, teleport, goto), with the
   * events it produced. Render steps the camera and collects events here. Listeners must not touch the sim.
   */
  readonly afterStep = new Set<(events: readonly SimEvent[]) => void>();
  /** The events of the boot itself (a Continue's `roomEnter`), for whoever listens first. */
  readonly bootEvents: SimEvent[] = [];

  constructor(
    readonly tuning: Tuning,
    scene: Room,
    readonly seed: number,
    private liveInput: () => InputFrame = () => 0,
    abilities: readonly string[] | null = null,
    opts: GameOptions = {},
  ) {
    this.kit = abilities ? normalizeAbilities(abilities) : null;
    this.world = opts.world ?? null;
    this.scene = scene;
    if (opts.save && this.world) {
      this.state = continueState(seed, tuning, this.world, opts.save, this.bootEvents);
      if (this.kit) this.state.save.abilities = this.kit.slice();
      this.scene = this.roomScene(this.state.room);
    } else {
      this.state = this.fresh([]);
    }
    this.prev = cloneState(this.state);
  }

  private fresh(events: SimEvent[]): GameState {
    return createState(this.seed, this.tuning, this.scene, events, this.kit ?? undefined);
  }

  /** The scene of room `id`: the world's, or the one being played if the world does not have it. */
  private roomScene(id: string): Room {
    const r = this.world?.rooms[id];
    if (r) return r.scene as Room;
    if (id === this.scene.id) return this.scene;
    throw new Error(`No room "${id}" in this game's world`);
  }

  /** Runs one sim step. Scripted input wins; otherwise live devices (realtime mode only). */
  stepOnce(): void {
    // Always sample live devices so taps made while scripted/manual don't fire later.
    const live = this.liveInput();
    const input =
      this.scripted.length > 0 ? (this.scripted.shift() ?? 0) : this.mode === 'realtime' ? live : 0;
    this.prev = cloneState(this.state);
    const events: SimEvent[] = [];
    step(this.state, input, this.tuning, this.scene, events, this.world ?? undefined);
    // Another room: play its scene from now on.
    if (this.state.room !== this.scene.id) this.scene = this.roomScene(this.state.room);
    // The room changed or started again, or she was put back after a fall, inside the step: nothing to interpolate from.
    if (events.some((e) => e.type === 'roomEnter' || e.type === 'fallReturn'))
      this.prev = cloneState(this.state);
    for (const fn of this.afterStep) fn(events);
  }

  queueInput(frames: InputFrame[]): void {
    // A loop, not push(...frames): a long replay (a 36-minute run is ~130k frames) overflows the call stack.
    for (const f of frames) this.scripted.push(f);
  }

  get queuedInput(): number {
    return this.scripted.length;
  }

  clearInput(): void {
    this.scripted = [];
  }

  /**
   * Restarts: a new game in the room (`roomId`, default the current one) at its spawn, frame 0, same
   * seed, a fresh save (the room's kit, or the abilities granted with `setAbilities` / `?abilities`).
   * Its events are `roomEnter {from: 'load'}` then `spawn`, so render restarts every room beat (the
   * swarm waits for the hatch again) even when the frame count did not go back (a paused page at 0).
   */
  reset(roomId?: string): void {
    this.scripted = [];
    if (roomId !== undefined && roomId !== this.scene.id) this.scene = this.roomScene(roomId);
    const s = this.scene.spawn;
    const events: SimEvent[] = [{ type: 'roomEnter', room: this.scene.id, from: 'load', x: s.x, y: s.y }];
    this.state = this.fresh(events);
    this.prev = cloneState(this.state);
    for (const fn of this.afterStep) fn(events);
  }

  /**
   * R in a game (memory/save.md): back to the moon patch she last rested at **in this run**, everything she
   * has earned kept (this game's own save, not what storage holds: a slot another session wrote sent a
   * first-timer forward with an ability she never found). Nothing is granted or skipped. Without a world
   * (a test page), a fresh restart.
   */
  restartAtPatch(): void {
    if (this.world) this.continueFrom(this.state.save);
    else this.reset();
  }

  /**
   * Continue from `save` (memory/save.md): at its moon patch (the world's start if she never rested),
   * with everything it holds. Needs the world.
   */
  continueFrom(save: SaveState): void {
    if (!this.world) throw new Error('continueFrom needs a world');
    this.scripted = [];
    const events: SimEvent[] = [];
    this.state = continueState(this.seed, this.tuning, this.world, cloneSave(save), events);
    this.scene = this.roomScene(this.state.room);
    this.prev = cloneState(this.state);
    for (const fn of this.afterStep) fn(events);
  }

  /**
   * Puts her in room `id` with her feet at (x, y) (default: its spawn), at rest, keeping the save
   * (`__game.goto`). The same room: a teleport. Needs the world for another room.
   */
  goto(id: string, x?: number, y?: number): void {
    if (id === this.scene.id) {
      this.teleport(x ?? this.scene.spawn.x, y ?? this.scene.spawn.y);
      return;
    }
    if (!this.world?.rooms[id]) throw new Error(`No room "${id}" in this game's world`);
    const to = this.world.rooms[id].scene;
    const events: SimEvent[] = [];
    gotoRoom(this.state, this.tuning, this.world, id, x ?? to.spawn.x, y ?? to.spawn.y, 'goto', events);
    this.scene = this.roomScene(this.state.room);
    this.prev = cloneState(this.state);
    for (const fn of this.afterStep) fn(events);
  }

  /** Puts the player at rest with its feet centre at (x, y) in sim px. */
  teleport(x: number, y: number): void {
    const events: SimEvent[] = [];
    placePlayer(this.state, x, y, this.tuning, this.scene, events);
    this.prev = cloneState(this.state);
    for (const fn of this.afterStep) fn(events);
  }

  /** What she owns now (`state.save.abilities`). */
  get abilities(): AbilityId[] {
    return this.state.save.abilities.slice();
  }

  /**
   * Debug: she owns exactly `ids` from the next step on (unknown ids are dropped), and a restart
   * keeps them. Like a teleport, a harness edit of the state, never something the sim does itself.
   */
  setAbilities(ids: readonly string[]): AbilityId[] {
    const kit = normalizeAbilities(ids);
    this.kit = kit;
    this.state.save.abilities = kit.slice();
    this.prev.save.abilities = kit.slice();
    return kit.slice();
  }

  hash(): string {
    return hashState(this.state);
  }
}
