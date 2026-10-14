/**
 * The Mouth's one shared rhythm. Everything it owns (root, pods, the mountain, steam) swells and
 * settles on this curve, in step: a slow in-breath and a longer out-breath.
 */
export const BREATH_PERIOD = 6.4;

/** 0 (out) .. 1 (full) at render time `t` (seconds). */
export function breath(t: number): number {
  const ph = (((t / BREATH_PERIOD) % 1) + 1) % 1;
  // In for 40% of the cycle, out for 60%.
  const x = ph < 0.4 ? ph / 0.4 : 1 - (ph - 0.4) / 0.6;
  return x * x * (3 - 2 * x);
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
