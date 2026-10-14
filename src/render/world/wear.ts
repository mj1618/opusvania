/**
 * Wear on human things: rust coming through paint, condensation on glass, rain streaks. Painted
 * into a Graphics so the plane's filter (light, mottle, brush, paint) treats them like everything else.
 */
import type { Graphics } from 'pixi.js';
import { blob } from './paint';

/** A patch of rust through paint: bare rust, a darker pit, chalky paint loss round it, a run below. */
export function rust(
  rng: () => number,
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  run = 0.7,
): void {
  g.poly(blob(rng, x, y, w, h, 0.45, 14).flat()).fill(rng() < 0.5 ? 0x4a2418 : 0x6a3420);
  g.poly(blob(rng, x, y + h * 0.3, w * 0.6, h * 0.5, 0.4, 10).flat()).fill({ color: 0x2a140e, alpha: 0.7 });
  g.poly(blob(rng, x, y - h * 0.2, w * 1.5, h * 1.6, 0.5, 14).flat()).fill({ color: 0x8a9a94, alpha: 0.1 });
  if (rng() < run) {
    const rx = x + (rng() - 0.5) * w;
    const len = 10 + rng() * (30 + h * 4);
    g.poly([rx - 2, y + h * 0.6, rx + 2.5, y + h * 0.6, rx + 0.8, y + h * 0.6 + len]).fill({
      color: 0x7a3a20,
      alpha: 0.75,
    });
  }
}

/** Rust streaks running down a vertical member from y0, `n` of them across [x0, x1]. */
export function streaks(
  rng: () => number,
  g: Graphics,
  x0: number,
  x1: number,
  y0: number,
  len: [number, number],
  n: number,
  alpha = 0.35,
): void {
  for (let i = 0; i < n; i++) {
    const x = x0 + rng() * (x1 - x0);
    const l = len[0] + rng() * (len[1] - len[0]);
    const w = 1 + rng() * 2.5;
    g.poly([x - w, y0, x + w, y0, x + w * 0.3, y0 + l]).fill({
      color: rng() < 0.6 ? 0x6a3420 : 0x8a4a2a,
      alpha,
    });
  }
}

/** Condensation: beads denser and bigger toward y1, some running into clear trails. */
export function beads(
  rng: () => number,
  g: Graphics,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  n: number,
  rMax: number,
  trails = 0.15,
): void {
  for (let i = 0; i < n; i++) {
    const k = rng() ** 0.6;
    const x = x0 + rng() * (x1 - x0);
    const y = y0 + k * (y1 - y0);
    const r = 1 + rMax * k * rng() ** 1.5;
    g.circle(x, y, r).fill({ color: 0x0c0c1c, alpha: 0.28 });
    g.circle(x - r * 0.3, y - r * 0.35, r * 0.4).fill({ color: 0xe0e4ff, alpha: 0.5 });
    g.circle(x + r * 0.25, y + r * 0.4, r * 0.3).fill({ color: 0xc0a0c0, alpha: 0.25 });
    if (r > rMax * 0.7 && rng() < trails) {
      const len = 20 + rng() * 90;
      g.rect(x - r * 0.5, y, r, len).fill({ color: 0x8a86b0, alpha: 0.12 });
      g.circle(x, y + len, r * 0.7).fill({ color: 0xe0e4ff, alpha: 0.3 });
    }
  }
}
