/**
 * Paths: where a moving thing is on a given sim frame, as a pure function of the frame (no state), so
 * the sim and render agree and a replay is exact. Today one kind, the pendulum (a swinging lantern,
 * memory/level-kit.md); drifters can add theirs here.
 *
 * Pure: + - * / sqrt only (no engine-approximated Math: the sine is Bhaskara's rational form, within
 * 0.2% of the real one, which a pendulum's look never shows).
 */
import type { Swing } from './kit-data';

/** sin(pi * v) for v in [0, 1], Bhaskara I's approximation (exact at 0, 1/2, 1). */
function halfSine(v: number): number {
  const q = v * (1 - v);
  return (16 * q) / (5 - 4 * q);
}

/** sin(2 pi u) for any u (cycles), from `halfSine`. */
export function cycleSine(u: number): number {
  const f = u - Math.floor(u);
  return f < 0.5 ? halfSine(2 * f) : -halfSine(2 * f - 1);
}

/** Defaults for a swing's missing numbers (`tuning.lures.swing`). */
export interface SwingDefaults {
  reach: number;
  period: number;
}

/**
 * The offset (dx, dy) from a pendulum's rest point at `frame` (fractional frames are fine: render
 * passes the interpolated frame). It moves like a pendulum along the arc of its chain: dx = reach x
 * sin(2 pi (frame / period + phase)), dy = how much the arc rises at that dx (0 at rest, up at the ends).
 */
export function swingOffset(
  s: Swing,
  frame: number,
  d: SwingDefaults,
  out: { dx: number; dy: number },
): { dx: number; dy: number } {
  const L = Math.max(1, s.length);
  const reach = Math.min(L * 0.95, Math.max(0, s.reach ?? d.reach));
  const period = Math.max(2, s.period ?? d.period);
  const dx = reach * cycleSine(frame / period + (s.phase ?? 0));
  out.dx = dx;
  out.dy = L - Math.sqrt(L * L - dx * dx);
  return out;
}
