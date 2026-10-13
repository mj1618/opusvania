// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * The smear frame, shared by every slash style: in the one or two frames where the blade crosses
 * most of its arc, it is drawn as a single long tapered shape along that part of the arc (a hair
 * where the frame began, the whole blade where it ends), the way a hand-drawn cut is. Opaque, in
 * the blade's own tones, so it is the blade stretched and not an effect laid over it.
 */
import type { Painter, RGB } from '../paint';
import type { StrokeAt } from './types';

export const SMEAR = {
  /** Samples along the smeared part. */
  n: 20,
  /** How much longer than the blade the smear reaches at its middle. */
  stretch: 0.3,
  /** Px of dusk under it, alpha. */
  duskW: 1.1,
  dusk: 0.6,
} as const;

const DUSK: RGB = [0.07, 0.05, 0.14];
const tv = { x: 0, y: 0 };

/**
 * (sx, sy) = the sword shoulder; `hand` = px from it to the hand, `len` = the blade's length;
 * `q0`..`q1` = the fractions of the cut crossed this frame; `qMin` = where the cut clears her body
 * (nothing before it); `steel` / `edge` = the blade's tones (root, point).
 */
export function drawSmear(
  p: Painter,
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
  const a = Math.max(q0, qMin);
  if (q1 - a < 0.03) return;
  const { px, py, gx, gy, gc } = p;
  const N = SMEAR.n;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      at(a + (q1 - a) * u, tv);
      const l = Math.hypot(tv.x, tv.y) || 1;
      const dx = tv.x / l;
      const dy = tv.y / l;
      // The blade shortens seen end on, as in her hand.
      const see = 0.5 + 0.5 * l;
      const tip = (hand + len * (1 + SMEAR.stretch * Math.sin(Math.PI * u))) * see;
      // A hair at the tail, the whole blade at the head.
      const inner = tip - (tip - hand * see - 3) * u ** 2.8;
      const grow = pass === 0 ? SMEAR.duskW : 0;
      px[i] = sx + dx * (tip + grow);
      py[i] = sy + dy * (tip + grow);
      gx[i] = sx + dx * (inner - grow * Math.min(1, (tip - inner) * 0.5));
      gy[i] = sy + dy * (inner - grow * Math.min(1, (tip - inner) * 0.5));
      const c = pass === 0 ? DUSK : null;
      const w = 0.35 + 0.65 * u;
      gc[i * 3] = c ? c[0]! : steel[0]! + (edge[0]! - steel[0]!) * w;
      gc[i * 3 + 1] = c ? c[1]! : steel[1]! + (edge[1]! - steel[1]!) * w;
      gc[i * 3 + 2] = c ? c[2]! : steel[2]! + (edge[2]! - steel[2]!) * w;
    }
    p.strip(N, pass === 0 ? SMEAR.dusk : 1);
  }
}
