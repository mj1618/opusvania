// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Wick's light effects, kept few and soft: embers shed by the lantern flame, the ribbon of light
 * the flame leaves when it moves fast, the ring thrown by the double-jump twirl, and a little pale
 * dust on hard landings and skids. All deterministic (own LCG, no Math.random).
 */
import { wind } from '../../scene/lib/look';
import { catmull, sat } from '../hooded/math';
import { type Painter, type RGB, rgb } from '../hooded/paint';

const EMBER = 0;
const DUST = 1;

interface Particle {
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

const MAX = 110;
const WARM = rgb(0xffb86b);
const WARM_DEEP = rgb(0xff8a3a);
const HOT = rgb(0xfff2d0);
const DUST_C: RGB = [0.62, 0.78, 0.8];

const TRAIL = 48;
const TRAIL_LIFE = 0.26;

export class Fx {
  private readonly ps: Particle[] = [];
  private readonly pool: Particle[] = [];
  private seed = 0x2f6e2b1;
  private emberAcc = 0;
  // Flame trail: recent flame positions, newest first, with age and the strength they were laid at.
  private readonly tx = new Float32Array(TRAIL);
  private readonly ty = new Float32Array(TRAIL);
  private readonly ta = new Float32Array(TRAIL);
  private readonly tk = new Float32Array(TRAIL);
  private tn = 0;
  private strength = 0;

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  clear(): void {
    while (this.ps.length) this.pool.push(this.ps.pop()!);
    this.tn = 0;
    this.emberAcc = 0;
    this.strength = 0;
  }

  private add(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number): void {
    let q: Particle;
    if (this.ps.length >= MAX) q = this.ps.shift()!;
    else q = this.pool.pop() ?? { kind, x, y, vx, vy, age: 0, life, size, seed: 0 };
    q.kind = kind;
    q.x = x;
    q.y = y;
    q.vx = vx;
    q.vy = vy;
    q.age = 0;
    q.life = life;
    q.size = size;
    q.seed = this.rand() * 100;
    this.ps.push(q);
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
        -(8 + this.rand() * 24) * (0.5 + power),
        0.4 + this.rand() * 0.3,
        4 + this.rand() * 4 + power * 4,
      );
    }
  }

  /** Double-jump beat: a few embers thrown outward (the lantern itself draws the ring of light). */
  burst(x: number, y: number): void {
    for (let i = 0; i < 7; i++) {
      const a = this.rand() * 6.283;
      const sp = 50 + this.rand() * 90;
      this.add(
        EMBER,
        x + Math.cos(a) * 16,
        y + Math.sin(a) * 16,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        0.5 + this.rand() * 0.5,
        1,
      );
    }
  }

  /**
   * Per frame: the flame is at (x, y) moving at (vx, vy) px/s. `boost` 0..1 (dash, twirl) makes
   * the trail brighter and sheds more embers.
   */
  update(dt: number, clock: number, x: number, y: number, vx: number, vy: number, boost: number): void {
    const speed = Math.hypot(vx, vy);
    const rate = 3.6 + sat(speed / 500) * 9 + boost * 22;
    this.emberAcc += rate * dt;
    while (this.emberAcc >= 1) {
      this.emberAcc -= 1;
      this.add(
        EMBER,
        x + (this.rand() - 0.5) * 3,
        y - 3 + (this.rand() - 0.5) * 3,
        vx * 0.22 + (this.rand() - 0.5) * 16,
        vy * 0.22 - 10 - this.rand() * 14,
        0.9 + this.rand() * 1.3,
        0.85 + this.rand() * 0.7,
      );
    }
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const q = this.ps[i]!;
      q.age += dt;
      if (q.age >= q.life) {
        this.ps.splice(i, 1);
        this.pool.push(q);
        continue;
      }
      if (q.kind === EMBER) {
        const k = 1 - 2.4 * dt;
        q.vx = q.vx * k + (wind(q.x, clock, q.seed) * 26 + Math.sin(clock * 2.3 + q.seed) * 14) * dt;
        q.vy = q.vy * k - 24 * dt;
      } else if (q.kind === DUST) {
        q.vx *= 1 - 5 * dt;
        q.vy = q.vy * (1 - 4 * dt) - 10 * dt;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    // Trail.
    const target = sat((speed - 190) / 420) * 0.75 + boost * 0.6;
    this.strength += (target - this.strength) * (1 - Math.exp(-(target > this.strength ? 16 : 5) * dt));
    for (let i = 0; i < this.tn; i++) this.ta[i]! += dt;
    while (this.tn > 0 && this.ta[this.tn - 1]! > TRAIL_LIFE) this.tn--;
    if (dt > 0) {
      const n = Math.min(this.tn, TRAIL - 1);
      this.tx.copyWithin(1, 0, n);
      this.ty.copyWithin(1, 0, n);
      this.ta.copyWithin(1, 0, n);
      this.tk.copyWithin(1, 0, n);
      this.tx[0] = x;
      this.ty[0] = y;
      this.ta[0] = 0;
      this.tk[0] = this.strength;
      this.tn = n + 1;
    }
  }

  /**
   * The ribbon of light behind the flame; drawn behind the body. The painter's streak has a sharp
   * bright core (it reads as a wire), so the ribbon is built from soft round dabs laid along the
   * Catmull-Rom smoothed path at even spacing: wide and bright at the flame, tapering and fading
   * with age.
   */
  drawTrail(p: Painter): void {
    const n = this.tn;
    if (n < 3) return;
    const SUB = 4;
    // Total length first, to space the dabs evenly whatever the speed.
    let len = 0;
    for (let i = 0; i < n - 1; i++)
      len += Math.hypot(this.tx[i + 1]! - this.tx[i]!, this.ty[i + 1]! - this.ty[i]!);
    if (len < 6) return;
    const floor = Math.max(1.5, len / 105);
    let step = floor;
    let acc = step;
    let lx = this.tx[0]!;
    let ly = this.ty[0]!;
    for (let i = 0; i < n - 1; i++) {
      const i0 = i > 0 ? i - 1 : 0;
      const i3 = i + 2 < n ? i + 2 : n - 1;
      for (let q = 1; q <= SUB; q++) {
        const u = q / SUB;
        const x = catmull(this.tx[i0]!, this.tx[i]!, this.tx[i + 1]!, this.tx[i3]!, u);
        const y = catmull(this.ty[i0]!, this.ty[i]!, this.ty[i + 1]!, this.ty[i3]!, u);
        acc += Math.hypot(x - lx, y - ly);
        lx = x;
        ly = y;
        if (acc < step) continue;
        acc = 0;
        const t = sat((this.ta[i]! + (this.ta[i + 1]! - this.ta[i]!) * u) / TRAIL_LIFE);
        const st = Math.min(1.3, this.tk[i]! + (this.tk[i + 1]! - this.tk[i]!) * u);
        const fade = (1 - t) ** 1.7 * st * Math.min(1, t * 14);
        if (fade < 0.01) continue;
        const r = 1.2 + 5.2 * (1 - t) ** 0.8;
        // Brightness is per dab; neighbours overlap, so scale it by the spacing.
        const k = fade * 0.2 * Math.min(1.8, step / 2.6);
        p.glow(x, y, r * 1.5, WARM_DEEP, k);
        if (t < 0.3) p.glow(x, y, r * 0.6, HOT, k * 0.9 * (1 - t / 0.3));
        // The next dab sits about a third of a radius on, so they always fuse into one ribbon.
        step = Math.max(floor, r * 0.5);
      }
    }
  }

  /** Particles; drawn in front of the body. */
  draw(p: Painter): void {
    for (const q of this.ps) {
      const t = q.age / q.life;
      if (q.kind === EMBER) {
        const k = (1 - t) ** 1.4 * Math.min(1, t * 8) * (0.75 + 0.25 * Math.sin(q.seed + q.age * 9));
        p.glow(q.x, q.y, q.size * 3.4, WARM_DEEP, 0.3 * k);
        p.glow(q.x, q.y, q.size * 1.25, WARM, 0.95 * k);
      } else if (q.kind === DUST) {
        const r = q.size * (0.6 + 1.6 * t);
        p.soft(q.x, q.y, r * 1.3, r, DUST_C, 0.28 * (1 - t) * Math.min(1, t * 8));
      }
    }
  }
}
