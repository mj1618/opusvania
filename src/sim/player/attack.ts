import type { AttackDir } from '../state';
import type { Tuning } from '../tuning';

/** An axis-aligned box in sim px (top-left, size). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The thorn slash's hit area for a body box, a slash direction and the side she faced when it
 * started. Pure geometry from `tuning.attack`: the sim tests targets against it on every active
 * frame, and render / the debug overlay can call it to draw the arc in the same place.
 *
 *  - fwd:  from a little behind the body centre to `fwdReach` ahead of it, `fwdHeight` tall, centred
 *          `fwdRaise` above the body centre.
 *  - up:   `vertWidth` wide, centred on the body, from the body centre up `upReach`.
 *  - down: the same below, `downReach` down from the body centre.
 */
export function slashBox(
  body: Box,
  dir: Exclude<AttackDir, 'none'>,
  facing: number,
  a: Tuning['attack'],
): Box {
  const cx = body.x + body.w / 2;
  const cy = body.y + body.h / 2;
  if (dir === 'up') return { x: cx - a.vertWidth / 2, y: cy - a.upReach, w: a.vertWidth, h: a.upReach };
  if (dir === 'down') return { x: cx - a.vertWidth / 2, y: cy, w: a.vertWidth, h: a.downReach };
  const w = a.fwdReach + a.fwdBack;
  return {
    x: facing > 0 ? cx - a.fwdBack : cx - a.fwdReach,
    y: cy - a.fwdRaise - a.fwdHeight / 2,
    w,
    h: a.fwdHeight,
  };
}
