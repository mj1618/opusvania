/** Small pure math helpers for the character rig: easing, springs, 2-bone IK, clock noise. */

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function sat(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = sat((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach: the fraction of the gap closed after `dt` seconds. */
export function approach(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export function easeOutCubic(t: number): number {
  const u = 1 - sat(t);
  return 1 - u * u * u;
}

export function easeInOut(t: number): number {
  const u = sat(t);
  return u * u * (3 - 2 * u);
}

/** A bell: 0 at t <= 0 and t >= 1, 1 in the middle. */
export function bell(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  const s = Math.sin(Math.PI * t);
  return s * s;
}

/**
 * A damped spring integrated implicitly, so it is stable at any dt. `zeta` 1 = critically damped
 * (no overshoot), < 1 overshoots. `omega` is the angular frequency in rad/s (bigger = faster).
 */
export class Spring {
  x: number;
  v = 0;
  constructor(
    x = 0,
    public omega = 20,
    public zeta = 1,
  ) {
    this.x = x;
  }

  step(target: number, dt: number): number {
    const f = 1 + 2 * dt * this.zeta * this.omega;
    const oo = this.omega * this.omega;
    const hoo = dt * oo;
    const hhoo = dt * hoo;
    const inv = 1 / (f + hhoo);
    const x = (f * this.x + dt * this.v + hhoo * target) * inv;
    this.v = (this.v + hoo * (target - this.x)) * inv;
    this.x = x;
    return x;
  }

  snap(x: number): void {
    this.x = x;
    this.v = 0;
  }
}

/** Deterministic hash of an integer to 0..1. */
export function hash1(n: number): number {
  let h = (n | 0) * 374761393;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1D value noise in -1..1, period-free, deterministic in `t`. */
export function noise1(t: number, seed = 0): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i + seed * 7919);
  const b = hash1(i + 1 + seed * 7919);
  return (a + (b - a) * u) * 2 - 1;
}

/**
 * An occasional pulse driven by the clock: time is cut into slots of `period` seconds, each slot
 * fires once (with probability `chance`) at a hashed offset, and the pulse lasts `len` seconds.
 * Returns 0 when idle, else the progress 0..1 through the pulse. Deterministic: no Math.random.
 */
export function pulse(clock: number, period: number, len: number, seed: number, chance = 1): number {
  const slot = Math.floor(clock / period);
  if (hash1(slot * 31 + seed * 1013) > chance) return 0;
  const start = slot * period + hash1(slot * 17 + seed * 2027) * Math.max(0, period - len);
  const t = (clock - start) / len;
  return t > 0 && t < 1 ? t : 0;
}

/** Result slot for `ik2` (reused to avoid allocation). */
export const ikOut = { x: 0, y: 0, ex: 0, ey: 0 };

/**
 * Two-bone IK in the plane. Root (ax, ay), target (tx, ty), bone lengths l1, l2. `bend` in
 * -1..1 picks the side of the root->target line the middle joint goes to and how far (so a limb
 * can straighten continuously as it turns edge-on). Bones may stretch by up to `stretch` (0.2 =
 * 20%) to reach a far target; beyond that the end stops short. Writes the middle joint to
 * ikOut.x/y and the reached end to ikOut.ex/ey.
 */
export function ik2(
  ax: number,
  ay: number,
  tx: number,
  ty: number,
  l1: number,
  l2: number,
  bend: number,
  stretch = 0.2,
): void {
  let dx = tx - ax;
  let dy = ty - ay;
  let dist = Math.hypot(dx, dy);
  if (dist < 1e-4) {
    dx = 0;
    dy = 1;
    dist = 1e-4;
  }
  const ux = dx / dist;
  const uy = dy / dist;
  const reach = l1 + l2;
  let s = 1;
  if (dist > reach * 0.995) s = Math.min(1 + stretch, dist / (reach * 0.995));
  const a = l1 * s;
  const b = l2 * s;
  const dd = Math.min(dist, (a + b) * 0.999);
  const along = (a * a - b * b + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  ikOut.x = ax + ux * along - uy * h * bend;
  ikOut.y = ay + uy * along + ux * h * bend;
  ikOut.ex = ax + ux * dd;
  ikOut.ey = ay + uy * dd;
}

/** Catmull-Rom interpolation of four values. */
export function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Cubic Hermite between p0 and p1 with tangents m0, m1 (per unit t). */
export function hermite(p0: number, m0: number, p1: number, m1: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
}
