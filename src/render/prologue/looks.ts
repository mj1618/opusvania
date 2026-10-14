/**
 * The two siblings must never be confused (the pass 2 blind viewer could not tell them apart). Same
 * skin, different people: Sorrel lighter and warmer, a little bigger, his wings always half open;
 * Wing darker, smaller, her wings held shut round her (her flaw: she hides). Used in the Grove and on
 * the summit; at the hand-over she eases back to the game's own look.
 */
import { ColorMatrixFilter } from 'pixi.js';

export const LOOK = {
  sorrel: { scale: 1.12, wings: 0.85 },
  wing: { scale: 0.9, wings: -0.75 },
} as const;

/** Sorrel: lighter, a warmer rose-plum. */
export function sorrelFilter(): ColorMatrixFilter {
  const f = new ColorMatrixFilter();
  f.resolution = 'inherit';
  f.brightness(1.3, false);
  f.hue(-14, true);
  f.saturate(-0.12, true);
  return f;
}

/** Wing: darker, deeper. `k` 0..1 how much (eased off at the hand-over). */
export function wingFilter(k = 1): ColorMatrixFilter {
  const f = new ColorMatrixFilter();
  f.resolution = 'inherit';
  setWingLook(f, k);
  return f;
}

export function setWingLook(f: ColorMatrixFilter, k: number): void {
  f.brightness(1 - 0.24 * k, false);
  f.saturate(0.1 * k, true);
}
