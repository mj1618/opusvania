import { parseInputScript } from '../../src/input/script';
import type { SimEvent } from '../../src/sim/events';
import { createState, type GameState, step } from '../../src/sim/index';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';

export function newGame(opts: { seed?: number; roomId?: string; spawn?: string } = {}, t?: Tuning) {
  const tuning = t ?? cloneTuning(defaultTuning);
  const events: SimEvent[] = [];
  const state = createState({ seed: opts.seed ?? 1, roomId: opts.roomId, spawn: opts.spawn }, tuning, events);
  return { state, tuning, events };
}

export function run(state: GameState, tuning: Tuning, script: string, events: SimEvent[] = []): SimEvent[] {
  for (const input of parseInputScript(script)) step(state, input, tuning, events);
  return events;
}
