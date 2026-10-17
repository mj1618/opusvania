/**
 * Pure helpers of the goal's look (no Pixi, no DOM): shared by the world renderer and the HUD and
 * covered by tests/unit/goal-render.test.ts.
 */

export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How many of the `cost` glints have left her after `frames` of an `of`-frame channel: they stream
 * out evenly and are all on their way by `by` of the channel, so the last reach the glass as it
 * catches. 0 before the channel starts; never more than `cost`.
 */
export function streamCount(frames: number, of: number, cost: number, by = 0.72): number {
  if (frames <= 0 || cost <= 0) return 0;
  const span = Math.max(1, of * by);
  return Math.min(cost, Math.ceil((cost * frames) / span));
}

/** Sim frames as m:ss (the ending's summary). */
export function clockText(frames: number): string {
  const s = Math.max(0, Math.floor(frames / 60));
  const sec = s % 60;
  return `${Math.floor(s / 60)}:${sec < 10 ? '0' : ''}${sec}`;
}

/**
 * Where the `n` stars of a price stand: an arc over the lantern, centred above it. Returns x, y
 * offsets from the arc's centre (y up is negative), left to right.
 */
export function priceArc(
  n: number,
  radius: number,
  pitchDeg: number,
  spanDeg: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (n <= 0) return out;
  const span = Math.min(spanDeg, (n - 1) * pitchDeg);
  for (let i = 0; i < n; i++) {
    const a = ((-90 - span / 2 + (n > 1 ? (span * i) / (n - 1) : 0)) * Math.PI) / 180;
    out.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return out;
}

/** A polyline with its running length, sampled by distance: the path light takes up a lantern. */
export class Path {
  readonly xs: number[] = [];
  readonly ys: number[] = [];
  readonly at: number[] = [];
  length = 0;

  add(x: number, y: number): void {
    const n = this.xs.length;
    if (n > 0) this.length += Math.hypot(x - (this.xs[n - 1] as number), y - (this.ys[n - 1] as number));
    this.xs.push(x);
    this.ys.push(y);
    this.at.push(this.length);
  }

  /** Point and unit tangent at `t` (0 = start .. 1 = end) written to `out` as [x, y, tx, ty]. */
  sample(t: number, out: number[]): void {
    const n = this.xs.length;
    if (n < 2) {
      out[0] = this.xs[0] ?? 0;
      out[1] = this.ys[0] ?? 0;
      out[2] = 0;
      out[3] = -1;
      return;
    }
    const d = Math.min(1, Math.max(0, t)) * this.length;
    let i = 1;
    while (i < n - 1 && (this.at[i] as number) < d) i++;
    const x0 = this.xs[i - 1] as number;
    const y0 = this.ys[i - 1] as number;
    const x1 = this.xs[i] as number;
    const y1 = this.ys[i] as number;
    const seg = (this.at[i] as number) - (this.at[i - 1] as number) || 1;
    const k = (d - (this.at[i - 1] as number)) / seg;
    out[0] = x0 + (x1 - x0) * k;
    out[1] = y0 + (y1 - y0) * k;
    out[2] = (x1 - x0) / seg;
    out[3] = (y1 - y0) / seg;
  }
}

/** Cubic Bezier points appended to a path (skipping the first when the path already ends there). */
export function bezier(
  path: Path,
  p: readonly [number, number, number, number, number, number, number, number],
  steps: number,
): void {
  for (let i = path.xs.length === 0 ? 0 : 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    path.add(a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]);
  }
}

/**
 * A sleeper's breath, 0..1: in over `inhale` of the period (eased), then a long ease out and a rest.
 * `t` in periods.
 */
export function sleepBreath(t: number, inhale: number): number {
  const ph = t - Math.floor(t);
  if (ph < inhale) return smooth(0, inhale, ph);
  return 1 - smooth(inhale, Math.min(1, inhale + (1 - inhale) * 0.8), ph);
}
