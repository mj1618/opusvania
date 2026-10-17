import type { SimEvent } from './sim/events';
import { cloneState, createState, type GameState, hashState, placePlayer, step } from './sim/index';
import type { InputFrame } from './sim/input';
import type { Scene } from './sim/scene';
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
 */
export class Game {
  state: GameState;
  /** State before the last step; render interpolates prev -> state. */
  prev: GameState;
  mode: RunMode = 'realtime';
  private scripted: InputFrame[] = [];
  /**
   * Called after every sim step, and after every placement (boot, load, teleport), with the events
   * it produced. Render steps the camera and collects events here. Listeners must not touch the sim.
   */
  readonly afterStep = new Set<(events: readonly SimEvent[]) => void>();

  constructor(
    readonly tuning: Tuning,
    public scene: Scene,
    readonly seed: number,
    private liveInput: () => InputFrame = () => 0,
  ) {
    this.state = createState(seed, tuning, scene);
    this.prev = cloneState(this.state);
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

  /** Restarts the scene: fresh state at the spawn, frame 0, same seed. */
  reset(): void {
    this.scripted = [];
    const events: SimEvent[] = [];
    this.state = createState(this.seed, this.tuning, this.scene, events);
    this.prev = cloneState(this.state);
    for (const fn of this.afterStep) fn(events);
  }

  /**
   * Plays another version of the scene from now on (the prologue runs the Grove without its
   * creatures and glints, then hands over the whole Grove): a fresh state in it, at its spawn.
   */
  useScene(scene: Scene): void {
    this.scene = scene;
    this.reset();
  }

  /** Puts the player at rest with its feet centre at (x, y) in sim px. */
  teleport(x: number, y: number): void {
    const events: SimEvent[] = [];
    placePlayer(this.state, x, y, this.tuning, this.scene, events);
    this.prev = cloneState(this.state);
    for (const fn of this.afterStep) fn(events);
  }

  hash(): string {
    return hashState(this.state);
  }
}
