// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Ember's own small effects, drawn in the character layer, kept few and soft: dust on a hard
 * landing / skid / dash start, a thin ring on the double jump, and a few motes and a faint trail
 * from the ember while dashing. All deterministic (own LCG, no Math.random).
 */
import { PALETTE } from '../scene/lib/look';
import { sat } from './math';
import { type Painter, type RGB, rgb } from './paint';

const SPARK = 0;
const DUST = 1;
const RING = 3;

interface Particle {
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  rot: number;
  vr: number;
}

const MAX = 96;
const EMBER = rgb(PALETTE.ember);
const EMBER_HOT = rgb(0xfff2c8);
const EMBER_DEEP = rgb(0xff7a2a);
const DUST_C: RGB = [0.62, 0.78, 0.8];
const RING_C = rgb(0xffd9a0);

const TRAIL = 40;

export class Fx {
  private readonly ps: Particle[] = [];
  private seed = 0x9e3779b9;
  private sparkAcc = 0;
  // Ember trail: recent ember positions with their age.
  private readonly tx = new Float32Array(TRAIL);
  private readonly ty = new Float32Array(TRAIL);
  private readonly ta = new Float32Array(TRAIL);
  private tn = 0;

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  clear(): void {
    this.ps.length = 0;
    this.tn = 0;
    this.sparkAcc = 0;
  }

  private add(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number): void {
    if (this.ps.length >= MAX) this.ps.shift();
    this.ps.push({
      kind,
      x,
      y,
      vx,
      vy,
      age: 0,
      life,
      size,
      rot: this.rand() * 6.28,
      vr: (this.rand() - 0.5) * 14,
    });
  }

  /** Dust kicked out along the ground at (x, y). `dir` biases it (-1/0/1), `power` 0..1. */
  dust(x: number, y: number, dir: number, power: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const side = dir !== 0 ? dir : i % 2 === 0 ? 1 : -1;
      const sp = (40 + this.rand() * 90) * (0.5 + power);
      this.add(
        DUST,
        x + side * this.rand() * 8,
        y - 1 - this.rand() * 3,
        side * sp,
        -(8 + this.rand() * 26) * (0.5 + power),
        0.35 + this.rand() * 0.3,
        4 + this.rand() * 4 + power * 4,
      );
    }
  }

  /** Double-jump beat: a thin ring and a few motes. */
  burst(x: number, y: number): void {
    this.add(RING, x, y, 0, 0, 0.36, 1);
    for (let i = 0; i < 4; i++) {
      const a = this.rand() * 6.283;
      const sp = 60 + this.rand() * 120;
      this.add(SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.3 + this.rand() * 0.3, 1.6 + this.rand());
    }
  }

  sparks(x: number, y: number, vx: number, vy: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.add(
        SPARK,
        x + (this.rand() - 0.5) * 4,
        y + (this.rand() - 0.5) * 4,
        vx + (this.rand() - 0.5) * 50,
        vy + (this.rand() - 0.5) * 50 - 14,
        0.3 + this.rand() * 0.45,
        1.3 + this.rand() * 1.1,
      );
    }
  }

  /** Per frame: the ember is at (ex, ey) moving at (evx, evy) px/s; `boost` is the dash weight. */
  update(dt: number, ex: number, ey: number, evx: number, evy: number, boost: number): void {
    const rate = boost * 16;
    this.sparkAcc += rate * dt;
    while (this.sparkAcc >= 1) {
      this.sparkAcc -= 1;
      this.sparks(ex, ey, evx * 0.25, evy * 0.25, 1);
    }
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const q = this.ps[i]!;
      if (!q) continue;
      q.age += dt;
      if (q.age >= q.life) {
        this.ps.splice(i, 1);
        continue;
      }
      if (q.kind === SPARK) {
        q.vx *= 1 - 3.2 * dt;
        q.vy = q.vy * (1 - 3.2 * dt) - 36 * dt;
      } else if (q.kind === DUST) {
        q.vx *= 1 - 5 * dt;
        q.vy = q.vy * (1 - 4 * dt) - 10 * dt;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    // Trail: newest first.
    for (let i = 0; i < this.tn; i++) this.ta[i]! += dt;
    while (this.tn > 0 && this.ta[this.tn - 1]! > 0.3) this.tn--;
    if (dt > 0) {
      const n = Math.min(this.tn, TRAIL - 1);
      this.tx.copyWithin(1, 0, n);
      this.ty.copyWithin(1, 0, n);
      this.ta.copyWithin(1, 0, n);
      this.tx[0] = ex;
      this.ty[0] = ey;
      this.ta[0] = 0;
      this.tn = n + 1;
    }
    this.trailK = boost * 0.7;
  }

  private trailK = 0;

  /** The ember's trail; drawn behind the body. */
  drawTrail(p: Painter): void {
    const n = this.tn;
    if (n < 3 || this.trailK < 0.02) return;
    for (let i = 0; i < n; i++) {
      const t = sat(this.ta[i]! / 0.3);
      // Smooth the path a little: the tail tip whips about.
      const a = i > 0 ? i - 1 : i;
      const b = i < n - 1 ? i + 1 : i;
      p.px[i] = (this.tx[a]! + 2 * this.tx[i]! + this.tx[b]!) * 0.25;
      p.py[i] = (this.ty[a]! + 2 * this.ty[i]! + this.ty[b]!) * 0.25;
      p.pw[i] = 4 * (1 - t) + 0.5;
      p.pc[i * 3] = (1 - t) * (1 - t) * 0.3 * Math.min(1.3, this.trailK) * Math.min(1, i / 2);
    }
    p.streak(n, EMBER_DEEP);
    for (let i = 0; i < n; i++) {
      p.pw[i]! *= 0.4;
      p.pc[i * 3]! *= 1.1;
    }
    p.streak(n, EMBER_HOT);
  }

  /** Particles; drawn in front of the body. */
  draw(p: Painter): void {
    for (const q of this.ps) {
      const t = q.age / q.life;
      if (q.kind === SPARK) {
        const k = (1 - t) * (1 - t);
        p.glow(q.x, q.y, q.size * 3.2, EMBER, 0.5 * k);
        p.glow(q.x, q.y, q.size * 1.1, EMBER_HOT, 0.9 * k);
      } else if (q.kind === DUST) {
        const r = q.size * (0.6 + 1.6 * t);
        p.soft(q.x, q.y, r * 1.3, r, DUST_C, 0.3 * (1 - t) * Math.min(1, t * 8));
      } else if (q.kind === RING) {
        const e = 1 - (1 - t) ** 3;
        p.ring(
          q.x,
          q.y,
          8 + 44 * e,
          2.5 + 5 * (1 - t),
          RING_C,
          0.55 * (1 - t) * (1 - t),
          (8 + 44 * e) * 0.55,
        );
        p.glow(q.x, q.y, 34 + 20 * e, RING_C, 0.35 * (1 - t) ** 3);
      }
    }
  }
}
