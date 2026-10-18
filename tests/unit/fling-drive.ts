import type { Game } from '../../src/game';
import { ActionBit } from '../../src/sim/input';
import { flingTarget } from '../../src/sim/lures';

/**
 * Drives the lamp's fling in tests (memory/lures.md): which flame is in reach, and a fling along a held aim.
 * Not a test file: the room tests share it.
 */

const B = ActionBit.lamp;

function step(g: Game, mask: number): void {
  g.queueInput([mask]);
  g.stepOnce();
}

/** The id of the burning flame in fling reach right now, or null. */
export function inReach(g: Game): string | null {
  const i = flingTarget(g.state, g.scene, g.tuning);
  return i >= 0 ? (g.scene.lures?.[i]?.id ?? null) : null;
}

/**
 * Runs `mask` (or `mask(frame)`) each frame until flame `id` (any flame, if null) is in reach, up to `max`
 * frames. Returns the id in reach, or null.
 */
export function untilReach(
  g: Game,
  mask: number | ((f: number) => number),
  id: string | null = null,
  max = 200,
): string | null {
  for (let f = 0; f < max; f++) {
    const now = inReach(g);
    if (now && (id === null || now === id)) return now;
    step(g, typeof mask === 'number' ? mask : mask(f));
  }
  const now = inReach(g);
  return now && (id === null || now === id) ? now : null;
}

/**
 * The fling: lamp pressed with `aim` held, held `hold` frames (the world slowed), let go; then `fly` held
 * (default `aim`, without the lamp) until she is on the ground or `max` frames. Returns the frames flown.
 */
export function fling(g: Game, aim: number, hold = 4, fly = aim, max = 300): number {
  step(g, aim | B);
  for (let i = 1; i < hold; i++) step(g, aim | B);
  step(g, aim);
  let f = 0;
  for (; f < max && !g.state.player.grounded; f++) step(g, fly);
  return f;
}

/** Up and right, up and left: the diagonal aims. */
export const UR = ActionBit.up | ActionBit.right;
export const UL = ActionBit.up | ActionBit.left;
