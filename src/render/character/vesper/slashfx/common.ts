// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Shared by the slash styles: the laid arc (the blade's path as it is revealed by the cut), a
 * small particle pool, seeded randomness. Deterministic; no allocation per frame.
 */
import type { CutInfo, SlashFrame, StrokeAt } from './types';

export const ARC_N = 72;
const tv = { x: 0, y: 0 };

/** mulberry-ish LCG shared by the styles (never Math.random). */
export class Rand {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  seed(v: number): void {
    this.s = (v ^ 0x9e3779b9) >>> 0;
  }
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 4294967296;
  }
  /** -1..1 */
  sym(): number {
    return this.next() * 2 - 1;
  }
}

/**
 * The cut's path, `ARC_N` samples from where it starts to show to its end. A sample appears when
 * the blade passes it (so the mark grows out of her hand with the blade at its head) and ages from
 * then. The arc is carried with her until a blow lands; then it stays where it struck.
 */
export class Arc {
  /** Unit offsets from the chest (scale by the reach). */
  readonly ux = new Float32Array(ARC_N);
  readonly uy = new Float32Array(ARC_N);
  /** Seconds since each sample was laid. */
  readonly age = new Float32Array(ARC_N);
  /** Samples laid so far, and the head as a fraction 0..1 of the shown arc (-1 = nothing yet). */
  n = 0;
  head = -1;
  /** Seconds since the cut began and since it was complete (frozen in hitstop). */
  t = 0;
  doneT = -1;
  /** The chest the arc hangs from. */
  cx = 0;
  cy = 0;
  pinned = false;
  cut: CutInfo = { dir: 'fwd', step: 1, heavy: false, facing: 1, reach: 110, show: 0.2 };
  /** Where the shown arc starts, as a fraction of the cut. */
  q0 = 0;
  private at: StrokeAt | null = null;

  clear(): void {
    this.n = 0;
    this.head = -1;
    this.t = 0;
    this.doneT = -1;
    this.pinned = false;
    this.at = null;
  }

  begin(cut: CutInfo, at: StrokeAt, q0: number): void {
    this.clear();
    this.cut = cut;
    this.at = at;
    this.q0 = q0;
  }

  /** Lays what the blade passed this frame and ages the rest. Returns the first new sample (or n). */
  frame(f: SlashFrame): number {
    const first = this.n;
    if (!this.at) return first;
    if (!this.pinned) {
      this.cx = f.chestX;
      this.cy = f.chestY;
    }
    if (!f.held) {
      for (let i = 0; i < this.n; i++) this.age[i]! += f.dt;
      if (this.head >= 0) this.t += f.dt;
      if (this.doneT >= 0) this.doneT += f.dt;
    }
    if (f.cutQ >= 0 && this.n < ARC_N) {
      // (The cut eases out: its last few percent take two frames. The mark is whole before that.)
      const h = f.cutQ > 0.9 ? 1 : (f.cutQ - this.q0) / (1 - this.q0);
      if (h > this.head) {
        this.head = Math.min(1, h);
        while (this.n < ARC_N && this.n / (ARC_N - 1) <= this.head + 1e-6) {
          const v = this.n / (ARC_N - 1);
          this.at(this.q0 + (1 - this.q0) * v, tv);
          this.ux[this.n] = tv.x;
          this.uy[this.n] = tv.y;
          this.age[this.n] = 0;
          this.n++;
        }
        if (this.n >= ARC_N && this.doneT < 0) this.doneT = 0;
      }
    }
    return first;
  }

  /** The blow landed: the arc belongs to what it hit from here on. */
  pin(): void {
    this.pinned = true;
  }

  /** World x / y of sample i at `r` x the reach. */
  x(i: number, r: number): number {
    return this.cx + this.ux[i]! * this.cut.reach * r;
  }
  y(i: number, r: number): number {
    return this.cy + this.uy[i]! * this.cut.reach * r;
  }

  /** The sample nearest a world point (for cutting the mark where a blow lands). */
  nearest(x: number, y: number): number {
    let best = 0;
    let bd = 1e12;
    for (let i = 0; i < this.n; i++) {
      const d = (this.x(i, 0.85) - x) ** 2 + (this.y(i, 0.85) - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
}

export interface Bit {
  live: boolean;
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  rot: number;
  spin: number;
  tint: number;
}

/** A fixed pool of small particles; each style moves and draws its own kinds. */
export class Bits {
  readonly list: Bit[] = [];
  private next = 0;
  constructor(readonly cap: number) {
    for (let i = 0; i < cap; i++)
      this.list.push({
        live: false,
        kind: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        age: 0,
        life: 1,
        size: 1,
        rot: 0,
        spin: 0,
        tint: 0,
      });
  }
  clear(): void {
    for (const b of this.list) b.live = false;
  }
  add(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number): Bit {
    const b = this.list[this.next]!;
    this.next = (this.next + 1) % this.cap;
    b.live = true;
    b.kind = kind;
    b.x = x;
    b.y = y;
    b.vx = vx;
    b.vy = vy;
    b.age = 0;
    b.life = life;
    b.size = size;
    b.rot = 0;
    b.spin = 0;
    b.tint = 0;
    return b;
  }
  /** Ages and moves them: `drag` per second, `g` px/s^2 downward. Returns how many live. */
  step(dt: number, drag: number, g: number): number {
    let n = 0;
    if (dt <= 0) {
      for (const b of this.list) if (b.live) n++;
      return n;
    }
    const k = Math.exp(-drag * dt);
    for (const b of this.list) {
      if (!b.live) continue;
      b.age += dt;
      if (b.age >= b.life) {
        b.live = false;
        continue;
      }
      b.vx *= k;
      b.vy = b.vy * k + g * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.spin * dt;
      n++;
    }
    return n;
  }
}

/** Unit tangent of the arc at sample i (the way the blade travels), into `out`. */
export function arcTangent(a: Arc, i: number, out: { x: number; y: number }): void {
  const i0 = Math.max(0, i - 1);
  const i1 = Math.min(a.n - 1, i + 1);
  const tx = a.ux[i1]! - a.ux[i0]!;
  const ty = a.uy[i1]! - a.uy[i0]!;
  const tl = Math.hypot(tx, ty) || 1;
  out.x = tx / tl;
  out.y = ty / tl;
}
