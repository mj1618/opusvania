/**
 * Sorrel's flight wings: a moth's, drawn as one would see them from behind and below, delta
 * forewings swept back, hindwings tucked under them, beating fast. Drawn in place of his skin's
 * cape-wings whenever he is in the air (the skin's own spread reads as a butterfly).
 */
import type { Graphics } from 'pixi.js';

const FORE: ReadonlyArray<readonly [number, number]> = [
  [0, -2],
  [20, -12],
  [44, -6],
  [50, 2],
  [34, 14],
  [12, 16],
  [2, 8],
];
const HIND: ReadonlyArray<readonly [number, number]> = [
  [0, 6],
  [16, 12],
  [26, 22],
  [18, 32],
  [6, 26],
];

/** At (x, y) (his back), `beat` in cycles, `open` 0..1. */
export function drawFlightWings(g: Graphics, x: number, y: number, beat: number, open = 1): void {
  if (open <= 0.01) return;
  const ph = beat * 2 * Math.PI;
  const a = -0.35 + 0.75 * Math.sin(ph);
  const k = (0.85 + 0.15 * Math.abs(Math.cos(ph))) * open;
  for (const side of [-1, 1]) {
    const tf = (pts: ReadonlyArray<readonly [number, number]>, sk: number, lag: number): number[] =>
      pts.flatMap(([px, py]) => {
        const c2 = Math.cos(a * lag);
        const s2 = Math.sin(a * lag);
        const rx = px * k * sk;
        return [
          x + side * (rx * c2 - py * s2 * 0.4),
          y + rx * s2 * 0.9 + py * (lag === 1 ? Math.cos(a) : 1) + Math.sin(a) * 2,
        ];
      });
    g.poly(tf(HIND, 0.8, 0.6)).fill({ color: 0x2c1f3e, alpha: 0.95 * open });
    const f = tf(FORE, 0.85, 1);
    g.poly(f).fill({ color: 0x4e3866, alpha: 0.95 * open });
    g.poly(f).stroke({ color: 0xc4b4aa, width: 1.2, alpha: 0.4 * open });
  }
}
