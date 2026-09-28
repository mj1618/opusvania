import type { HitClass, SimEvent } from '../events';
import type { GameState } from '../state';
import type { Tuning } from '../tuning';

/**
 * Global hitstop (combat-spec §2): requests made during a step are max-merged (never summed) and
 * applied at step 9, capped at combat.hitstopCap, with one `hitstop` event. During the freeze
 * nothing moves and no timers run; presses are latched (src/sim/index.ts).
 *
 * The request lives in `state.hitstopReq` (L3 audit #4: no module-level scratch). It is cleared at
 * the start of every non-frozen step and after it is applied, so a request made outside a step
 * (a debug spawn, a test) can't leak into a later step.
 */
export function beginHitstopStep(state: GameState): void {
  state.hitstopReq.frames = 0;
  state.hitstopReq.cls = 'light';
}

const KEY: Record<HitClass, keyof Tuning['combat']> = {
  light: 'hitstopLight',
  medium: 'hitstopMedium',
  heavy: 'hitstopHeavy',
  seizeTake: 'hitstopSeizeTake',
  catch: 'hitstopCatch',
  counter: 'hitstopCounter',
  repossess: 'hitstopRepossess',
  hurt: 'hitstopHurt',
};

export function hitstopFrames(cls: HitClass, t: Tuning): number {
  return t.combat[KEY[cls]] as number;
}

/** Asks for a freeze of `cls`'s length this step (the step keeps the max). */
export function requestHitstop(state: GameState, cls: HitClass, t: Tuning): void {
  const f = hitstopFrames(cls, t);
  const r = state.hitstopReq;
  if (f > r.frames) {
    r.frames = f;
    r.cls = cls;
  }
}

/** Step 9: apply the max of this step's requests and emit one event. */
export function applyHitstop(state: GameState, t: Tuning, events: SimEvent[]): void {
  const r = state.hitstopReq;
  if (r.frames <= 0) return;
  const f = Math.min(t.combat.hitstopCap, r.frames);
  state.hitstop = Math.min(t.combat.hitstopCap, Math.max(state.hitstop, f));
  events.push({ type: 'hitstop', frames: f, cls: r.cls });
  r.frames = 0;
  r.cls = 'light';
}
