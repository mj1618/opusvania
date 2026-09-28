import { EventBus, type SimEvent } from './sim/events';
import { cloneState, createState, type GameState, hashState, loadRoom, reseed, step } from './sim/index';
import type { InputFrame } from './sim/input';
import { type Replay, ReplayRecorder } from './sim/replay';
import type { Tuning } from './sim/tuning';

export type RunMode = 'realtime' | 'manual';

/**
 * Runtime harness around the pure sim: owns the current and previous state (for render
 * interpolation), the event bus, scripted input and the replay recorder. No DOM here either,
 * so it can run headless in Node.
 */
export class Game {
  state: GameState;
  /** State before the last step; render interpolates prev -> state. */
  prev: GameState;
  readonly bus = new EventBus<SimEvent>();
  /** 'manual': only step() calls advance the sim (debug API, tests, clip capture). */
  mode: RunMode = 'realtime';
  private scripted: InputFrame[] = [];
  private recorder: ReplayRecorder | null = null;
  private pendingEvents: SimEvent[] = [];
  /** Bumps whenever the room changes, so render can rebuild and skip interpolation. */
  roomVersion = 0;

  constructor(
    readonly tuning: Tuning,
    opts: { seed: number; roomId?: string; spawn?: string },
    private liveInput: () => InputFrame = () => 0,
  ) {
    this.state = createState(opts, tuning, this.pendingEvents);
    this.prev = cloneState(this.state);
    this.flushEvents();
  }

  /** Runs one sim step. Scripted input wins; otherwise live devices (realtime mode only). */
  stepOnce(): void {
    const input =
      this.scripted.length > 0
        ? (this.scripted.shift() ?? 0)
        : this.mode === 'realtime'
          ? this.liveInput()
          : 0;
    this.prev = cloneState(this.state);
    const before = this.state.roomId;
    step(this.state, input, this.tuning, this.pendingEvents);
    if (this.state.roomId !== before) this.roomVersion++;
    this.recorder?.push(input);
    this.flushEvents();
  }

  steps(n: number): void {
    for (let i = 0; i < n; i++) this.stepOnce();
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

  load(roomId: string, spawn?: string): void {
    loadRoom(this.state, roomId, spawn, this.tuning, this.pendingEvents);
    this.prev = cloneState(this.state);
    this.roomVersion++;
    this.flushEvents();
  }

  /** Reseeds the RNG in place (does not reset the world). */
  reseed(seed: number): void {
    reseed(this.state, seed);
  }

  /** Replaces the whole state (replay playback, save/load). */
  setState(s: GameState): void {
    this.state = cloneState(s);
    this.prev = cloneState(s);
    this.roomVersion++;
  }

  hash(): string {
    return hashState(this.state);
  }

  startRecording(): void {
    this.recorder = new ReplayRecorder(this.state, this.tuning);
  }

  get recording(): boolean {
    return this.recorder !== null;
  }

  stopRecording(): Replay | null {
    const r = this.recorder?.finish(this.state) ?? null;
    this.recorder = null;
    return r;
  }

  private flushEvents(): void {
    if (this.pendingEvents.length === 0) return;
    const evs = this.pendingEvents;
    this.pendingEvents = [];
    this.bus.emitAll(evs);
  }
}
