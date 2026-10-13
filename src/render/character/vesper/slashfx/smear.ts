// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * The smear frame: on the one frame where the blade crosses most of its arc it is drawn along that
 * part of the arc, the way a hand-drawn cut is. Each style has its own:
 *   wedge  (brush)       the blade itself stretched: a hair where the frame began, the whole blade
 *                        where it ends, opaque, in the blade's tones;
 *   streak (ribbon)      a thin stroke of light drawn by the blade's point: an opaque hair with
 *                        light on it, nothing wide;
 *   hair   (scale-dust)  only a hair-line along the point's path (the scales are already tearing off).
 */
import type { Painter, RGB } from '../paint';
import type { SmearKind, StrokeAt } from './types';

export const SMEAR = {
  /** Samples along the smeared part. */
  n: 20,
  /** How much longer than the blade the smear reaches at its middle. */
  stretch: 0.3,
  /** Px of dusk under the wedge, alpha. */
  duskW: 1.1,
  dusk: 0.6,
  /** Half-width px of the streak's core and of the hair-line; the streak's light (half-width, strength). */
  streak: 1.7,
  hair: 0.9,
  light: 6,
  lightK: 0.6,
} as const;

const DUSK: RGB = [0.07, 0.05, 0.14];
const GOLD: RGB = [1, 0.84, 0.52];
const tv = { x: 0, y: 0 };

/**
 * (sx, sy) = the sword shoulder; `hand` = px from it to the hand, `len` = the blade's length;
 * `q0`..`q1` = the fractions of the cut crossed this frame; `qMin` = where the cut clears her body
 * (nothing before it); `steel` / `edge` = the blade's tones (root, point).
 */
export function drawSmear(
  p: Painter,
  kind: SmearKind,
  at: StrokeAt,
  sx: number,
  sy: number,
  hand: number,
  len: number,
  q0: number,
  q1: number,
  qMin: number,
  steel: RGB,
  edge: RGB,
): void {
  let a = Math.max(q0, qMin);
  if (q1 - a < 0.03) return;
  // A line the whole length of the frame's arc sits inside the style's own mark as a second
  // crescent: the thin kinds only streak the last part, just behind the blade.
  if (kind !== 'wedge') a = q1 - (q1 - a) * 0.42;
  const { px, py, gx, gy, gc, pw, pc } = p;
  const N = SMEAR.n;
  const wedge = kind === 'wedge';
  for (let pass = wedge ? 0 : 1; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      at(a + (q1 - a) * u, tv);
      const l = Math.hypot(tv.x, tv.y) || 1;
      const dx = tv.x / l;
      const dy = tv.y / l;
      // The blade shortens seen end on, as in her hand.
      const see = 0.5 + 0.5 * l;
      const tip = (hand + len * (1 + SMEAR.stretch * Math.sin(Math.PI * u))) * see;
      let inner: number;
      let outer = tip;
      if (wedge) {
        // A hair at the tail, the whole blade at the head.
        inner = tip - (tip - hand * see - 3) * u ** 2.8;
      } else {
        // A line drawn by the point: fine at the tail, fullest just behind the blade.
        const hw =
          (kind === 'streak' ? SMEAR.streak : SMEAR.hair) * u ** 0.7 * Math.min(1, (1 - u) / 0.12 + 0.35);
        outer = tip + hw;
        inner = tip - hw;
      }
      const grow = pass === 0 ? SMEAR.duskW : 0;
      px[i] = sx + dx * (outer + grow);
      py[i] = sy + dy * (outer + grow);
      gx[i] = sx + dx * (inner - grow * Math.min(1, (tip - inner) * 0.5));
      gy[i] = sy + dy * (inner - grow * Math.min(1, (tip - inner) * 0.5));
      const c = pass === 0 ? DUSK : null;
      const w = wedge ? 0.35 + 0.65 * u : 1;
      gc[i * 3] = c ? c[0]! : steel[0]! + (edge[0]! - steel[0]!) * w;
      gc[i * 3 + 1] = c ? c[1]! : steel[1]! + (edge[1]! - steel[1]!) * w;
      gc[i * 3 + 2] = c ? c[2]! : steel[2]! + (edge[2]! - steel[2]!) * w;
      if (!wedge) {
        pw[i] = SMEAR.light * (0.3 + 0.7 * u);
        pc[i * 3] = SMEAR.lightK * u;
      }
    }
    p.strip(N, pass === 0 ? SMEAR.dusk : 1);
  }
  if (kind === 'streak') {
    // The light on it (this is the part that blooms). px/py hold the outer edge: near enough the centre.
    p.streak(N, GOLD);
  }
}
