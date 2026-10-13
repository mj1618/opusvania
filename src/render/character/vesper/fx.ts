// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Vesper's light effects, all in the character's own mesh: gold wing dust that RISES, light
 * trails drawn by the antenna tips and the wing hem, a soft dust puff on hard landings and skids.
 * Deterministic (own LCG, no Math.random); fixed pools, no allocation per frame.
 */
import { sat } from '../hooded/math';
import { type Painter, type RGB, rgb } from './paint';

const MOTE = 0;
const DUST = 1;
const MAX = 120;
const GOLD = rgb(0xffd98a);
const GOLD_HOT = rgb(0xfff6dc);
const GOLD_DEEP = rgb(0xe9a04a);
const DUST_C: RGB = [0.66, 0.74, 0.78];

interface Particle {
  live: boolean;
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  seed: number;
}

/** A light trail: the recent path of one point. */
export class Trail {
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly a: Float32Array;
  private n = 0;
  /** Brightness 0..1, set by the owner each frame (smoothed here). */
  private k = 0;
  constructor(
    private readonly cap: number,
    private readonly life: number,
    private readonly width: number,
  ) {
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.a = new Float32Array(cap);
  }
  clear(): void {
    this.n = 0;
    this.k = 0;
  }
  push(dt: number, x: number, y: number, k: number): void {
    if (dt <= 0) return;
    this.k += (k - this.k) * (1 - Math.exp(-(k > this.k ? 16 : 5) * dt));
    for (let i = 0; i < this.n; i++) this.a[i]! += dt;
    while (this.n > 0 && this.a[this.n - 1]! > this.life) this.n--;
    const n = Math.min(this.n, this.cap - 1);
    this.x.copyWithin(1, 0, n);
    this.y.copyWithin(1, 0, n);
    this.a.copyWithin(1, 0, n);
    // The stored point is low-passed: a tip's whip should draw a curve, not a zigzag.
    const s = n > 0 ? 1 - Math.exp(-34 * dt) : 1;
    this.x[0] = n > 0 ? this.x[1]! + (x - this.x[1]!) * s : x;
    this.y[0] = n > 0 ? this.y[1]! + (y - this.y[1]!) * s : y;
    this.a[0] = 0;
    this.n = n + 1;
  }
  draw(p: Painter, c: RGB, hot: RGB, gain: number): void {
    const n = this.n;
    if (n < 3 || this.k < 0.02) return;
    for (let i = 0; i < n; i++) {
      const t = sat(this.a[i]! / this.life);
      const a = i > 0 ? i - 1 : i;
      const b = i < n - 1 ? i + 1 : i;
      p.px[i] = (this.x[a]! + 2 * this.x[i]! + this.x[b]!) * 0.25;
      p.py[i] = (this.y[a]! + 2 * this.y[i]! + this.y[b]!) * 0.25;
      p.pw[i] = this.width * (1 - t) + 0.4;
      p.pc[i * 3] = (1 - t) * (1 - t) * gain * this.k * Math.min(1, i / 2);
    }
    p.streak(n, c);
    for (let i = 0; i < n; i++) {
      p.pw[i]! *= 0.38;
      p.pc[i * 3]! *= 1.15;
    }
    p.streak(n, hot);
  }
}

export class Fx {
  private readonly ps: Particle[] = [];
  private seed = 0x2f6e2b1;
  private acc = 0;
  private next = 0;

  constructor() {
    for (let i = 0; i < MAX; i++)
      this.ps.push({ live: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 1, seed: 0 });
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  clear(): void {
    for (const q of this.ps) q.live = false;
    this.acc = 0;
  }

  private add(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number): void {
    const q = this.ps[this.next]!;
    this.next = (this.next + 1) % MAX;
    q.live = true;
    q.kind = kind;
    q.x = x;
    q.y = y;
    q.vx = vx;
    q.vy = vy;
    q.age = 0;
    q.life = life;
    q.size = size;
    q.seed = this.rand() * 6.283;
  }

  /** Dust kicked out along the ground at (x, y). `dir` biases it (-1/0/1), `power` 0..1. */
  dust(x: number, y: number, dir: number, power: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const side = dir !== 0 ? dir : i % 2 === 0 ? 1 : -1;
      const sp = (36 + this.rand() * 80) * (0.5 + power);
      this.add(
        DUST,
        x + side * this.rand() * 8,
        y - 1 - this.rand() * 3,
        side * sp,
        -(6 + this.rand() * 22) * (0.5 + power),
        0.4 + this.rand() * 0.3,
        4 + this.rand() * 4 + power * 4,
      );
    }
  }

  /** One gold mote at (x, y) with a starting velocity; it slows, then rises. */
  mote(x: number, y: number, vx: number, vy: number, life = 1): void {
    this.add(MOTE, x, y, vx, vy, (0.7 + this.rand() * 0.9) * life, 1.1 + this.rand() * 1.2);
  }

  /** The wingbeat's burst: dust thrown from a wing's surface, outward and down, then lifting. */
  burst(x: number, y: number, dx: number, dy: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = this.rand() * 6.283;
      const sp = 30 + this.rand() * 110;
      this.mote(
        x + (this.rand() - 0.5) * 16,
        y + (this.rand() - 0.5) * 16,
        dx * (0.4 + this.rand()) + Math.cos(a) * sp,
        dy * (0.4 + this.rand()) + Math.sin(a) * sp * 0.7,
        1.1,
      );
    }
  }

  /** Continuous shedding: `rate` motes per second from around (x, y) within radius r. */
  shed(dt: number, rate: number, x: number, y: number, r: number, vx: number, vy: number): void {
    this.acc += rate * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      const a = this.rand() * 6.283;
      const rr = Math.sqrt(this.rand()) * r;
      this.mote(
        x + Math.cos(a) * rr,
        y + Math.sin(a) * rr * 1.3,
        vx + (this.rand() - 0.5) * 16,
        vy + (this.rand() - 0.5) * 10,
      );
    }
  }

  update(dt: number, clock: number): void {
    for (const q of this.ps) {
      if (!q.live) continue;
      q.age += dt;
      if (q.age >= q.life) {
        q.live = false;
        continue;
      }
      if (q.kind === MOTE) {
        const k = Math.exp(-3.4 * dt);
        q.vx = q.vx * k + Math.sin(clock * 2.3 + q.seed) * 26 * dt;
        // Buoyant: whatever threw it, it ends up drifting upward.
        q.vy = q.vy * k - 62 * dt;
      } else {
        q.vx *= Math.exp(-5 * dt);
        q.vy = q.vy * Math.exp(-4 * dt) - 10 * dt;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
  }

  draw(p: Painter, clock: number): void {
    for (const q of this.ps) {
      if (!q.live) continue;
      const t = q.age / q.life;
      if (q.kind === MOTE) {
        const tw = 0.7 + 0.3 * Math.sin(clock * 9 + q.seed * 5);
        const k = Math.min(1, t * 10) * (1 - t) ** 1.4 * tw;
        p.glow(q.x, q.y, q.size * 3.0, GOLD_DEEP, 0.24 * k);
        p.glow(q.x, q.y, q.size * 1.0, GOLD_HOT, 0.6 * k);
      } else {
        const r = q.size * (0.6 + 1.6 * t);
        p.soft(q.x, q.y, r * 1.3, r, DUST_C, 0.26 * (1 - t) * Math.min(1, t * 8));
      }
    }
  }
}

export const FX_GOLD = GOLD;
export const FX_GOLD_HOT = GOLD_HOT;
export const FX_GOLD_DEEP = GOLD_DEEP;
