import type { V2 } from './math';

/** Spring/verlet settings for one secondary-motion chain (coat tail, feather, sack). */
export interface ChainSpec {
  /** Points including the pinned root. */
  n: number;
  /** Segment length (px). */
  seg: number;
  /** px/f^2 added to y each step. */
  gravity: number;
  /** Velocity kept per step (verlet damping). */
  damping: number;
  /** Pull toward the rest shape per step (0 = rope, 1 = rigid). */
  stiffness: number;
  /** Constraint relaxation passes. */
  iterations: number;
}

/**
 * A verlet chain in world px, stepped once per sim step (so clips are deterministic). Point 0 is
 * pinned to an anchor on the body; the rest swing, pulled toward a rest direction (the chain's
 * "shape memory") and held at segment length. `prev*` keep the previous step's points so the draw
 * can interpolate with the render alpha like the body does.
 */
export class Chain {
  readonly x: number[];
  readonly y: number[];
  private readonly ox: number[];
  private readonly oy: number[];
  readonly px: number[];
  readonly py: number[];
  private live = false;

  constructor(readonly spec: ChainSpec) {
    const z = (): number[] => new Array<number>(spec.n).fill(0);
    this.x = z();
    this.y = z();
    this.ox = z();
    this.oy = z();
    this.px = z();
    this.py = z();
  }

  reset(): void {
    this.live = false;
  }

  /** Lays the chain straight along `dir` from the anchor, at rest. */
  private place(a: V2, dir: V2): void {
    const s = this.spec;
    for (let i = 0; i < s.n; i++) {
      const x = a.x + dir.x * s.seg * i;
      const y = a.y + dir.y * s.seg * i;
      this.x[i] = x;
      this.y[i] = y;
      this.ox[i] = x;
      this.oy[i] = y;
      this.px[i] = x;
      this.py[i] = y;
    }
    this.live = true;
  }

  /**
   * One step. `dir` is the unit rest direction (world), `floorY` stops points sinking through the
   * ground she stands on (null in the air), `wind` is an extra per-step push (px/f).
   */
  step(a: V2, dir: V2, floorY: number | null, wind: V2 = { x: 0, y: 0 }, snap = false): void {
    const s = this.spec;
    if (!this.live || snap) {
      this.place(a, dir);
      return;
    }
    for (let i = 0; i < s.n; i++) {
      this.px[i] = this.x[i] as number;
      this.py[i] = this.y[i] as number;
    }
    this.x[0] = a.x;
    this.y[0] = a.y;
    for (let i = 1; i < s.n; i++) {
      const x = this.x[i] as number;
      const y = this.y[i] as number;
      const vx = (x - (this.ox[i] as number)) * s.damping;
      const vy = (y - (this.oy[i] as number)) * s.damping;
      this.ox[i] = x;
      this.oy[i] = y;
      let nx = x + vx + wind.x;
      let ny = y + vy + s.gravity + wind.y;
      // Shape memory: pull toward where this point would hang at rest from its parent.
      const rx = (this.x[i - 1] as number) + dir.x * s.seg;
      const ry = (this.y[i - 1] as number) + dir.y * s.seg;
      nx += (rx - nx) * s.stiffness;
      ny += (ry - ny) * s.stiffness;
      this.x[i] = nx;
      this.y[i] = ny;
    }
    for (let k = 0; k < s.iterations; k++) {
      for (let i = 1; i < s.n; i++) {
        const x0 = this.x[i - 1] as number;
        const y0 = this.y[i - 1] as number;
        let dx = (this.x[i] as number) - x0;
        let dy = (this.y[i] as number) - y0;
        const d = Math.hypot(dx, dy) || 1e-6;
        dx /= d;
        dy /= d;
        // The parent is pinned (i = 1) or already placed this pass: move only the child.
        this.x[i] = x0 + dx * s.seg;
        this.y[i] = y0 + dy * s.seg;
        if (floorY !== null && (this.y[i] as number) > floorY) this.y[i] = floorY;
      }
    }
  }

  /** Interpolated point i (alpha between the previous and current step). */
  at(i: number, alpha: number): V2 {
    const x0 = this.px[i] as number;
    const y0 = this.py[i] as number;
    return { x: x0 + ((this.x[i] as number) - x0) * alpha, y: y0 + ((this.y[i] as number) - y0) * alpha };
  }
}
