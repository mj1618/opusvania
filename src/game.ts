import { EventBus, type SimEvent } from './sim/events';
import {
  cloneState,
  createState,
  type GameState,
  hashState,
  loadRoom,
  reseed,
  spawnEnemyAt,
  step,
} from './sim/index';
import type { InputFrame } from './sim/input';
import { type Replay, type ReplayOp, ReplayRecorder } from './sim/replay';
import { assignTuning, type Tuning } from './sim/tuning';

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
  /** Replay being played back: its out-of-band ops, applied as the scripted inputs are consumed. */
  private playback: { ops: ReplayOp[]; next: number; cursor: number } | null = null;
  private pendingEvents: SimEvent[] = [];
  /** Bumps whenever the room changes, so render can rebuild and skip interpolation. */
  roomVersion = 0;
  /**
   * Called after every sim step with that step's events (render steps the camera and juice here,
   * once per sim frame, so they stay deterministic). Listeners must not touch the sim.
   */
  readonly afterStep = new Set<(events: readonly SimEvent[]) => void>();

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
    // Always sample live devices so taps made while scripted/manual don't fire later.
    const live = this.liveInput();
    const input =
      this.scripted.length > 0 ? (this.scripted.shift() ?? 0) : this.mode === 'realtime' ? live : 0;
    this.prev = cloneState(this.state);
    const before = this.state.roomId;
    this.recorder?.syncTuning(this.tuning);
    step(this.state, input, this.tuning, this.pendingEvents);
    if (this.state.roomId !== before) this.roomVersion++;
    this.recorder?.push(input);
    if (this.playback) {
      this.playback.cursor++;
      this.applyPlaybackOps();
    }
    const stepEvents = this.pendingEvents;
    this.flushEvents();
    for (const fn of this.afterStep) fn(stepEvents);
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
    this.playback = null;
  }

  load(roomId: string, spawn?: string): void {
    this.recorder?.syncTuning(this.tuning);
    this.recorder?.op(spawn === undefined ? { op: 'load', roomId } : { op: 'load', roomId, spawn });
    loadRoom(this.state, roomId, spawn, this.tuning, this.pendingEvents);
    this.prev = cloneState(this.state);
    this.roomVersion++;
    this.flushEvents();
  }

  /** Spawns an enemy with its feet at (x, y) (debug; recorded as a replay op). Returns its id. */
  spawn(type: string, x: number, y: number): number {
    this.recorder?.op({ op: 'spawn', type, x, y });
    const id = spawnEnemyAt(this.state, type, x, y);
    this.prev = cloneState(this.state);
    return id;
  }

  /** Reseeds the RNG in place (does not reset the world). */
  reseed(seed: number): void {
    this.recorder?.op({ op: 'seed', seed });
    reseed(this.state, seed);
  }

  /** Replaces the whole state (replay playback, save/load). */
  setState(s: GameState): void {
    this.recorder?.op({ op: 'state', state: s });
    this.state = cloneState(s);
    this.prev = cloneState(s);
    this.roomVersion++;
  }

  hash(): string {
    return hashState(this.state);
  }

  /**
   * Starts playing a replay: loads its start state and tuning (into the live tuning object),
   * replaces queued input with its inputs and applies its ops as they come due. Returns the
   * number of steps it lasts.
   */
  playReplay(r: Replay): number {
    this.clearInput();
    this.setState(r.start);
    assignTuning(this.tuning, r.tuning);
    this.queueInput(r.inputs);
    this.playback = { ops: [...(r.ops ?? [])], next: 0, cursor: 0 };
    this.applyPlaybackOps();
    this.flushEvents();
    return r.inputs.length;
  }

  private applyPlaybackOps(): void {
    const pb = this.playback;
    if (!pb) return;
    while (pb.next < pb.ops.length && (pb.ops[pb.next]?.at ?? 0) <= pb.cursor) {
      const op = pb.ops[pb.next++];
      // Go through the public methods so an active recorder captures the op too.
      if (op?.op === 'load') this.load(op.roomId, op.spawn);
      else if (op?.op === 'seed') this.reseed(op.seed);
      else if (op?.op === 'state') this.setState(op.state);
      else if (op?.op === 'tuning') assignTuning(this.tuning, op.tuning);
      else if (op?.op === 'spawn') this.spawn(op.type, op.x, op.y);
    }
    if (pb.next >= pb.ops.length) this.playback = null;
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
