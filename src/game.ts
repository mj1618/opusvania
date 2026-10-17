import type { Room } from './scene/room';
import { type AbilityId, normalizeAbilities } from './sim/abilities';
import type { SimEvent } from './sim/events';
import { cloneState, createState, type GameState, hashState, placePlayer, step } from './sim/index';
import type { InputFrame } from './sim/input';
import type { Tuning } from './sim/tuning';

/**
 * 'realtime': the loop steps the sim from wall time and live input.
 * 'frozen':   the sim stands still; render time keeps running (look at the scene animating).
 * 'manual':   nothing advances except through Game.stepOnce (debug API, tests, shots, clips).
 */
export type RunMode = 'realtime' | 'frozen' | 'manual';

/**
 * Runtime harness around the pure sim: owns the current and previous state (for render
 * interpolation) and scripted input. No DOM here, so it also runs headless in Node.
 *
 * `scene` is the room being played (any `Scene` is a `Room`: the render-only fields are optional).
 */
export class Game {
  state: GameState;
  /** State before the last step; render interpolates prev -> state. */
  prev: GameState;
  mode: RunMode = 'realtime';
  private scripted: InputFrame[] = [];
  /**
   * The abilities a restart gives her when they are not the room's own starting kit: set by
   * `?abilities=` and by `setAbilities` (debug), so a restart keeps what was granted. null = the room's kit.
   */
  private kit: AbilityId[] | null;
  /**
   * Called after every sim step, and after every placement (boot, load, teleport), with the events
   * it produced. Render steps the camera and collects events here. Listeners must not touch the sim.
   */
  readonly afterStep = new Set<(events: readonly SimEvent[]) => void>();

  constructor(
    readonly tuning: Tuning,
    readonly scene: Room,
    readonly seed: number,
    private liveInput: () => InputFrame = () => 0,
    abilities: readonly string[] | null = null,
  ) {
    this.kit = abilities ? normalizeAbilities(abilities) : null;
    this.state = this.fresh([]);
    this.prev = cloneState(this.state);
  }

  private fresh(events: SimEvent[]): GameState {
    return createState(this.seed, this.tuning, this.scene, events, this.kit ?? undefined);
  }

  /** Runs one sim step. Scripted input wins; otherwise live devices (realtime mode only). */
  stepOnce(): void {
    // Always sample live devices so taps made while scripted/manual don't fire later.
    const live = this.liveInput();
    const input =
      this.scripted.length > 0 ? (this.scripted.shift() ?? 0) : this.mode === 'realtime' ? live : 0;
    this.prev = cloneState(this.state);
    const events: SimEvent[] = [];
    step(this.state, input, this.tuning, this.scene, events);
    // The room started again, or she was put back after a fall, inside the step: nothing to interpolate from.
    if (events.some((e) => e.type === 'roomEnter' || e.type === 'fallReturn'))
      this.prev = cloneState(this.state);
    for (const fn of this.afterStep) fn(events);
  }

  queueInput(frames: InputFrame[]): void {
    this.scripted.push(...frames);
  }

  get queuedInput(): number {
    return this.scripted.length;
  }

  clearInput(): void {
    this.scripted = [];
  }

  /**
   * Restarts the room: fresh state at the spawn, frame 0, same seed (and the same granted abilities).
   * Its events are `roomEnter {from: 'load'}` then `spawn`, so render restarts every room beat (the
   * swarm waits for the hatch again) even when the frame count did not go back (a paused page at 0).
   */
  reset(): void {
    this.scripted = [];
    const s = this.scene.spawn;
    const events: SimEvent[] = [{ type: 'roomEnter', room: this.scene.id, from: 'load', x: s.x, y: s.y }];
    this.state = this.fresh(events);
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
