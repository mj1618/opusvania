/**
 * Light data and the pure maths shared by the GPU light map and CPU sampling (particles, tests).
 */
import type { RenderClock } from './clock';
import { noise1 } from './color';

export const LIGHT_SCALE = 2;

export interface Light {
  /** World px (centre). */
  x: number;
  y: number;
  /** Falloff radius, px. */
  radius: number;
  color: number;
  /** 1 = a lamp; the map saturates at LIGHT_SCALE. */
  intensity: number;
  /** 0..1, keyed to the render clock (sim frame), so deterministic. */
  flicker?: number;
  /** Decorrelates flicker between lights. */
  seed?: number;
}

/** Called once per drawn frame; push lights (world px) for this frame. Must not touch the sim. */
export type LightProvider = (out: Light[], clock: RenderClock) => void;

/** Light falloff at d = distance / radius: smooth, inverse-square-ish, exactly 0 at the radius. */
export function falloff(d: number): number {
  if (d >= 1) return 0;
  return (1 - d * d) ** 2 * (0.35 + 0.65 / (1 + 12 * d * d));
}

export function flickerFactor(l: Light, t: number): number {
  const f = l.flicker ?? 0;
  if (f <= 0) return 1;
  const s = l.seed ?? 0;
  const n = 0.6 * noise1(t * 0.07, s) + 0.4 * noise1(t * 0.29, s + 3);
  // Rare deep gutters on strongly flickering lights.
  const gutter = f > 0.5 && noise1(t * 0.021, s + 9) > 0.82 ? 0.45 : 1;
  return (1 - f * 0.55 * n) * gutter;
}
