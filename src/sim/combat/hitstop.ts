import type { HitClass, SimEvent } from '../events';
import type { GameState } from '../state';
import type { Tuning } from '../tuning';

/**
 * Global hitstop (combat-spec §2): requests made during a step are max-merged (never summed) and
 * applied at step 9, capped at combat.hitstopCap, with one `hitstop` event. During the freeze
 * nothing moves and no timers run; presses are latched (src/sim/index.ts).
 *
 * The request accumulator is per-step scratch (reset by beginHitstopStep), not state.
 */
const req = { frames: 0, cls: 'light' as HitClass };

export function beginHitstopStep(): void {
  req.frames = 0;
  req.cls = 'light';
}

export function hitstopFrames(cls: HitClass, t: Tuning): number {
  const c = t.combat;
  switch (cls) {
    case 'light':
      return c.hitstopLight;
    case 'medium':
      return c.hitstopMedium;
    case 'heavy':
      return c.hitstopHeavy;
    case 'seizeTake':
      return c.hitstopSeizeTake;
    case 'catch':
      return c.hitstopCatch;
    case 'repossess':
      return c.hitstopRepossess;
    case 'hurt':
      return c.hitstopHurt;
  }
}

export function requestHitstop(cls: HitClass, t: Tuning): void {
  const f = hitstopFrames(cls, t);
  if (f > req.frames) {
    req.frames = f;
    req.cls = cls;
  }
}

/** Step 9: apply the max of this step's requests and emit one event. */
export function applyHitstop(state: GameState, t: Tuning, events: SimEvent[]): void {
  if (req.frames <= 0) return;
  const f = Math.min(t.combat.hitstopCap, req.frames);
  state.hitstop = Math.min(t.combat.hitstopCap, Math.max(state.hitstop, f));
  events.push({ type: 'hitstop', frames: f, cls: req.cls });
}
