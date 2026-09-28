/** Small pure maths for the rig (render-side: Math.sin/cos are fine here, never in src/sim). */

export interface V2 {
  x: number;
  y: number;
}

export const v = (x: number, y: number): V2 => ({ x, y });
export const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: V2, k: number): V2 => ({ x: a.x * k, y: a.y * k });
export const len = (a: V2): number => Math.hypot(a.x, a.y);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpV = (a: V2, b: V2, t: number): V2 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const clamp01 = (x: number): number => clamp(x, 0, 1);

/** Direction at angle `a` from straight up, leaning toward +x (the rig's "forward"). */
export const upDir = (a: number): V2 => ({ x: Math.sin(a), y: -Math.cos(a) });
export const rot = (p: V2, a: number): V2 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

// Easing (t in 0..1).
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);
export const easeInQuad = (t: number): number => t * t;
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeInOutQuad = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t: number, k = 1.9): number => 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2;
/** 0 -> 1 -> 0 hump. */
export const hump = (t: number): number => Math.sin(Math.PI * clamp01(t));
export const smooth = (t: number): number => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};

/** Quadratic Bezier a -> b with control c. */
export function quad(a: V2, c: V2, b: V2, t0: number): V2 {
  const t = clamp01(t0);
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/**
 * Two-bone IK: the middle joint for a limb rooted at `a` reaching `t` with bone lengths l1, l2.
 * `bend` +1 / -1 picks the side of the a->t line the joint sits on (+1 = clockwise of it, in y-down
 * screen space). An unreachable target straightens the limb toward it. Returns joint and end.
 */
export function ik(a: V2, t: V2, l1: number, l2: number, bend: number): { joint: V2; end: V2 } {
  const dx = t.x - a.x;
  const dy = t.y - a.y;
  const d0 = Math.hypot(dx, dy);
  const reach = l1 + l2 - 0.01;
  const d = clamp(d0, Math.abs(l1 - l2) + 0.01, reach);
  const ux = d0 > 1e-6 ? dx / d0 : 0;
  const uy = d0 > 1e-6 ? dy / d0 : 1;
  const end = { x: a.x + ux * d, y: a.y + uy * d };
  // Law of cosines: distance along a->t to the foot of the joint, then the perpendicular.
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const joint = { x: a.x + ux * along - uy * h * bend, y: a.y + uy * along + ux * h * bend };
  return { joint, end };
}

/** Deterministic hash noise in [0, 1) for render wobble (frame-keyed, no RNG state). */
export function hash01(n: number): number {
  let h = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
