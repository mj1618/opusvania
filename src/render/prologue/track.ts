/**
 * The keyframed track every cinematic move in the prologue runs on: a list of keys, each a time in
 * seconds and a few numbers (a camera's x, y, zoom; a fade's alpha), eased from the key before. Two
 * keys with the same values are a hold. Pure (no Pixi, no clock of its own): `sample(t)` is the
 * same for the same `t`, so a capture at a given second is the same picture every time.
 */

export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'hold';

export interface Key {
  /** Seconds on the prologue's clock. */
  t: number;
  /** The values at this key. Every key of a track has the same length. */
  v: readonly number[];
  /** How the move INTO this key eases (from the key before). Default: inOut. */
  ease?: Ease;
}

export function ease(kind: Ease, x: number): number {
  const u = x < 0 ? 0 : x > 1 ? 1 : x;
  switch (kind) {
    case 'linear':
      return u;
    case 'in':
      return u * u * u;
    case 'out':
      return 1 - (1 - u) ** 3;
    case 'hold':
      return u >= 1 ? 1 : 0;
    default:
      // Smootherstep: no velocity at either end, so a pan starts and settles like a hand-held head.
      return u * u * u * (u * (u * 6 - 15) + 10);
  }
}

export class Track {
  private readonly keys: readonly Key[];
  private readonly out: number[];

  constructor(keys: readonly Key[]) {
    if (keys.length === 0) throw new Error('a track needs at least one key');
    const n = keys[0]?.v.length ?? 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!k || k.v.length !== n) throw new Error(`key ${i} has ${k?.v.length} values, expected ${n}`);
      const prev = keys[i - 1];
      if (prev && k.t < prev.t)
        throw new Error(`key ${i} at ${k.t} s comes before key ${i - 1} at ${prev.t} s`);
    }
    this.keys = keys;
    this.out = new Array(n).fill(0);
  }

  get start(): number {
    return this.keys[0]?.t ?? 0;
  }

  get end(): number {
    return this.keys[this.keys.length - 1]?.t ?? 0;
  }

  /** The values at time `t` (held before the first key and after the last). The array is reused. */
  sample(t: number): readonly number[] {
    const ks = this.keys;
    const out = this.out;
    let i = 0;
    while (i < ks.length && (ks[i]?.t ?? 0) <= t) i++;
    const a = ks[Math.max(0, i - 1)];
    const b = ks[Math.min(ks.length - 1, i)];
    if (!a || !b) return out;
    if (i === 0 || i >= ks.length || b.t <= a.t) {
      const k = i === 0 ? b : a;
      for (let j = 0; j < out.length; j++) out[j] = k.v[j] ?? 0;
      return out;
    }
    const e = ease(b.ease ?? 'inOut', (t - a.t) / (b.t - a.t));
    for (let j = 0; j < out.length; j++) {
      const va = a.v[j] ?? 0;
      out[j] = va + ((b.v[j] ?? 0) - va) * e;
    }
    return out;
  }

  /** The first value at time `t`: for one-number tracks (a fade). */
  at(t: number): number {
    return this.sample(t)[0] ?? 0;
  }
}

/**
 * The integral from the first point to `t` of a piecewise-linear rate given as points
 * `[t, rate]` (the rate holds before the first and after the last). A breath whose period changes
 * smoothly is `sin(2 pi * integrate(freqPoints, t))`: no jump in its phase where the rate changes.
 */
export function integrate(points: ReadonlyArray<readonly [number, number]>, t: number): number {
  const first = points[0];
  if (!first) return 0;
  if (t <= first[0]) return (t - first[0]) * first[1];
  let s = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) break;
    const [t0, r0] = a;
    const [t1, r1] = b;
    if (t <= t1) {
      const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
      const r = r0 + (r1 - r0) * u;
      return s + ((r0 + r) / 2) * (t - t0);
    }
    s += ((r0 + r1) / 2) * (t1 - t0);
  }
  const last = points[points.length - 1];
  return last ? s + (t - last[0]) * last[1] : s;
}

/** 0 before `a`, 1 after `b`, smooth between. */
export function window01(t: number, a: number, b: number): number {
  if (b <= a) return t >= b ? 1 : 0;
  return ease('inOut', (t - a) / (b - a));
}

/** 0..1..0: rises over [a, b], holds, falls over [c, d]. */
export function envelope(t: number, a: number, b: number, c: number, d: number): number {
  return window01(t, a, b) * (1 - window01(t, c, d));
}
