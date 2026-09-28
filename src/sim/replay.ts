import type { SimEvent } from './events';
import { hashState } from './hash';
import { step } from './index';
import type { InputFrame } from './input';
import { cloneState, type GameState } from './state';
import { cloneTuning, type Tuning } from './tuning';

/**
 * A replay is a starting state (which includes the seed/RNG state), the tuning in force, and one
 * input mask per sim step. Playing it back must reproduce `endHash` exactly.
 */
export interface Replay {
  version: 1;
  start: GameState;
  tuning: Tuning;
  inputs: InputFrame[];
  /** Hash of the state after the last input, recorded at stop time. */
  endHash?: string;
}

export class ReplayRecorder {
  private readonly start: GameState;
  private readonly tuning: Tuning;
  private readonly inputs: InputFrame[] = [];

  constructor(start: GameState, tuning: Tuning) {
    this.start = cloneState(start);
    this.tuning = cloneTuning(tuning);
  }

  push(input: InputFrame): void {
    this.inputs.push(input);
  }

  get length(): number {
    return this.inputs.length;
  }

  finish(end: GameState): Replay {
    return {
      version: 1,
      start: cloneState(this.start),
      tuning: cloneTuning(this.tuning),
      inputs: [...this.inputs],
      endHash: hashState(end),
    };
  }
}

export interface ReplayResult {
  state: GameState;
  hash: string;
  events: SimEvent[];
  /** True if the replay had an endHash and it matched. */
  matches: boolean | undefined;
}

export function runReplay(replay: Replay): ReplayResult {
  const state = cloneState(replay.start);
  const events: SimEvent[] = [];
  for (const input of replay.inputs) step(state, input, replay.tuning, events);
  const hash = hashState(state);
  return { state, hash, events, matches: replay.endHash === undefined ? undefined : replay.endHash === hash };
}
