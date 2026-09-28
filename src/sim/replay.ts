import type { SimEvent } from './events';
import { hashState } from './hash';
import { loadRoom, reseed, spawnEnemyAt, step } from './index';
import type { InputFrame } from './input';
import { cloneState, type GameState } from './state';
import { assignTuning, cloneTuning, type Tuning } from './tuning';

/**
 * Something done to the state or tuning outside `step()` while recording (debug `load()`, `seed()`,
 * a Tweakpane edit, a state restore). `at` = number of inputs consumed before it happened; it is
 * applied just before input `at` (or after the last input if `at === inputs.length`).
 */
export type ReplayOp =
  | { at: number; op: 'load'; roomId: string; spawn?: string }
  | { at: number; op: 'seed'; seed: number }
  | { at: number; op: 'tuning'; tuning: Tuning }
  | { at: number; op: 'state'; state: GameState }
  | { at: number; op: 'spawn'; type: string; x: number; y: number };

/**
 * A replay is a starting state (which includes the seed/RNG state), the tuning in force, one
 * input mask per sim step, and any out-of-band ops. Playing it back must reproduce `endHash` exactly.
 */
export interface Replay {
  version: 1;
  start: GameState;
  tuning: Tuning;
  inputs: InputFrame[];
  ops?: ReplayOp[];
  /** Hash of the state after the last input, recorded at stop time. */
  endHash?: string;
}

/** Applies one op. `state` may be replaced (op 'state'), so use the return value. */
export function applyReplayOp(state: GameState, op: ReplayOp, tuning: Tuning, events: SimEvent[]): GameState {
  switch (op.op) {
    case 'load':
      loadRoom(state, op.roomId, op.spawn, tuning, events);
      return state;
    case 'seed':
      reseed(state, op.seed);
      return state;
    case 'tuning':
      assignTuning(tuning, op.tuning);
      return state;
    case 'state':
      return cloneState(op.state);
    case 'spawn':
      spawnEnemyAt(state, op.type, op.x, op.y);
      return state;
  }
}

export class ReplayRecorder {
  private readonly start: GameState;
  private readonly tuning: Tuning;
  private readonly inputs: InputFrame[] = [];
  private readonly ops: ReplayOp[] = [];
  private lastTuningJson: string;

  constructor(start: GameState, tuning: Tuning) {
    this.start = cloneState(start);
    this.tuning = cloneTuning(tuning);
    this.lastTuningJson = JSON.stringify(tuning);
  }

  /** Records a tuning op if `tuning` changed since last seen. Call before anything that reads tuning. */
  syncTuning(tuning: Tuning): void {
    const json = JSON.stringify(tuning);
    if (json === this.lastTuningJson) return;
    this.lastTuningJson = json;
    this.ops.push({ at: this.inputs.length, op: 'tuning', tuning: cloneTuning(tuning) });
  }

  /** Records an out-of-band op (not 'tuning'; use syncTuning) at the current input position. */
  op(o: DistributiveOmit<Exclude<ReplayOp, { op: 'tuning' }>, 'at'>): void {
    const rec = { ...o, at: this.inputs.length } as ReplayOp;
    this.ops.push(rec.op === 'state' ? { ...rec, state: cloneState(rec.state) } : rec);
  }

  push(input: InputFrame): void {
    this.inputs.push(input);
  }

  get length(): number {
    return this.inputs.length;
  }

  finish(end: GameState): Replay {
    const r: Replay = {
      version: 1,
      start: cloneState(this.start),
      tuning: cloneTuning(this.tuning),
      inputs: [...this.inputs],
      endHash: hashState(end),
    };
    if (this.ops.length > 0) r.ops = JSON.parse(JSON.stringify(this.ops)) as ReplayOp[];
    return r;
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface ReplayResult {
  state: GameState;
  hash: string;
  events: SimEvent[];
  /** True if the replay had an endHash and it matched. */
  matches: boolean | undefined;
}

export function runReplay(replay: Replay): ReplayResult {
  let state = cloneState(replay.start);
  const tuning = cloneTuning(replay.tuning);
  const events: SimEvent[] = [];
  const ops = replay.ops ?? [];
  let k = 0;
  for (let i = 0; i <= replay.inputs.length; i++) {
    while (k < ops.length && (ops[k]?.at ?? 0) <= i) {
      const op = ops[k++];
      if (op) state = applyReplayOp(state, op, tuning, events);
    }
    const input = replay.inputs[i];
    if (input !== undefined) step(state, input, tuning, events);
  }
  const hash = hashState(state);
  return { state, hash, events, matches: replay.endHash === undefined ? undefined : replay.endHash === hash };
}
