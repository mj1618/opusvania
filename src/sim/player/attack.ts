import type { AttackDir } from '../state';
import type { Tuning } from '../tuning';

/** An axis-aligned box in sim px (top-left, size). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A combo step's tuning group: `slash1`, `slash2` or `slash3` (anything else reads as step 1). */
export function slashTuning(t: Tuning, step: number): Tuning['slash1'] {
  return step === 3 ? t.slash3 : step === 2 ? t.slash2 : t.slash1;
}

/**
 * The thorn slash's hit area for a body box, a slash direction, the side she faced when it started
 * and the combo step (1-3; `player.attackStep`). Pure geometry from the tuning: the sim tests
 * targets against it on every active frame, and render / the debug overlay can call it to draw the
 * arc in the same place.
 *
 *  - fwd:  from `attack.fwdBack` behind the body centre to the step's `fwdReach` ahead of it, the
 *          step's `fwdHeight` tall, centred `attack.fwdRaise` above the body centre.
 *  - up:   the step's `upWidth` wide, centred on the body, from the body centre up its `upReach`.
 *  - down: `attack.downWidth` wide, `attack.downReach` down from the body centre, the same for
 *          every step (a down slash is never a finisher).
 */
export function slashBox(
  body: Box,
  dir: Exclude<AttackDir, 'none'>,
  facing: number,
  t: Tuning,
  step = 1,
): Box {
  const a = t.attack;
  const s = slashTuning(t, step);
  const cx = body.x + body.w / 2;
  const cy = body.y + body.h / 2;
  if (dir === 'up') return { x: cx - s.upWidth / 2, y: cy - s.upReach, w: s.upWidth, h: s.upReach };
  if (dir === 'down') return { x: cx - a.downWidth / 2, y: cy, w: a.downWidth, h: a.downReach };
  return {
    x: facing > 0 ? cx - a.fwdBack : cx - s.fwdReach,
    y: cy - a.fwdRaise - s.fwdHeight / 2,
    w: s.fwdReach + a.fwdBack,
    h: s.fwdHeight,
  };
}
