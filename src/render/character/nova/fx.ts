// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Nova's light and small effects, all in the character's one mesh:
 *   - five light trails (two wrists, two ankles, the star at the tail's tip): ring buffers of
 *     recent positions sampled at 60 Hz, each sample carrying the brightness it was laid down
 *     with, drawn as smoothed additive streaks. Brightness follows how fast the point moves, so a
 *     run leaves soft ribbons and the somersault draws a rosette;
 *   - star-specks: the double-jump burst and a few slow drifting motes;
 *   - soft dust on landings and skids.
 * Deterministic (own LCG, no Math.random).
 */
import { catmull, sat, smoothstep } from '../hooded/math';
import { type Painter, type RGB, rgb } from '../hooded/paint';

const SPECK = 0;
const DUST = 1;
const FLASH = 2;

interface Particle {
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  tw: number;
}

const MAX = 96;
export const GOLD = rgb(0xffd98c);
export const GOLD_HOT = rgb(0xfff4dc);
const GOLD_DEEP = rgb(0xf2a85a);
const DUST_C: RGB = [0.62, 0.78, 0.8];

export const TRAILS = 5;
const TN = 26;
const TSTEP = 1 / 60;
const TLIFE = 0.3;

class Trail {
  readonly x = new Float32Array(TN);
  readonly y = new Float32Array(TN);
  readonly age = new Float32Array(TN);
  readonly k = new Float32Array(TN);
  n = 0;
  acc = 0;
  /** Live head. */
  hx = 0;
  hy = 0;
  hk = 0;
  lx = 0;
  ly = 0;
  fresh = true;
}

export class Fx {
  private readonly ps: Particle[] = [];
  private seed = 0x1b873593;
  private moteAcc = 0;
  private readonly trails: Trail[] = [];

  constructor() {
    for (let i = 0; i < TRAILS; i++) this.trails.push(new Trail());
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  clear(): void {
    this.ps.length = 0;
    this.moteAcc = 0;
    for (const t of this.trails) {
      t.n = 0;
      t.acc = 0;
      t.fresh = true;
    }
  }

  private add(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number): void {
    if (this.ps.length >= MAX) this.ps.shift();
    this.ps.push({ kind, x, y, vx, vy, age: 0, life, size, tw: this.rand() * 6.283 });
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
        0.35 + this.rand() * 0.3,
        4 + this.rand() * 4 + power * 4,
      );
    }
  }

  /** The double jump's beat: a soft flash and a scatter of star-specks thrown outward. */
  burst(x: number, y: number, vx: number, vy: number): void {
    this.add(FLASH, x, y, 0, 0, 0.3, 1);
    const N = 11;
    const a0 = this.rand() * 6.283;
    for (let i = 0; i < N; i++) {
      const a = a0 + (i / N) * 6.283 + (this.rand() - 0.5) * 0.5;
      const sp = 70 + this.rand() * 130;
      this.add(
        SPECK,
        x + Math.cos(a) * 6,
        y + Math.sin(a) * 6,
        Math.cos(a) * sp + vx * 0.35,
        Math.sin(a) * sp + vy * 0.35,
        0.45 + this.rand() * 0.5,
        0.9 + this.rand() * 0.9,
      );
    }
  }

  /** A few specks shed from a point (the star while dashing, the heels on a kick-off). */
  shed(x: number, y: number, vx: number, vy: number, count: number, spread = 40): void {
    for (let i = 0; i < count; i++) {
      this.add(
        SPECK,
        x + (this.rand() - 0.5) * 5,
        y + (this.rand() - 0.5) * 5,
        vx + (this.rand() - 0.5) * spread,
        vy + (this.rand() - 0.5) * spread - 10,
        0.4 + this.rand() * 0.5,
        0.7 + this.rand() * 0.8,
      );
    }
  }

  /** Feed one trail's live point. `k` is the brightness to lay down now (0 = none). */
  trail(i: number, x: number, y: number, k: number): void {
    const t = this.trails[i]!;
    t.hx = x;
    t.hy = y;
    t.hk = k;
  }

  /** Speed of trail point `i` since the last update relative to a body moving at (bvx, bvy), px/s. */
  speed(i: number, x: number, y: number, dt: number, bvx = 0, bvy = 0): number {
    const t = this.trails[i]!;
    if (t.fresh || dt <= 0) return 0;
    return Math.hypot((x - t.lx) / dt - bvx, (y - t.ly) / dt - bvy);
  }

  /**
   * Per frame, after the trails were fed. (cx, cy) is the body centre: motes are born around it,
   * `moteRate` per second.
   */
  update(dt: number, cx: number, cy: number, moteRate: number): void {
    this.moteAcc += moteRate * dt;
    while (this.moteAcc >= 1) {
      this.moteAcc -= 1;
      const a = this.rand() * 6.283;
      const r = 10 + this.rand() * 26;
      this.add(
        SPECK,
        cx + Math.cos(a) * r * 0.8,
        cy + Math.sin(a) * r,
        (this.rand() - 0.5) * 14,
        -4 - this.rand() * 12,
        1.2 + this.rand() * 1.2,
        0.6 + this.rand() * 0.6,
      );
    }
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const q = this.ps[i]!;
      q.age += dt;
      if (q.age >= q.life) {
        this.ps.splice(i, 1);
        continue;
      }
      if (q.kind === SPECK) {
        q.vx *= 1 - Math.min(1, 3.4 * dt);
        q.vy = q.vy * (1 - Math.min(1, 3.4 * dt)) - 9 * dt;
      } else if (q.kind === DUST) {
        q.vx *= 1 - Math.min(1, 5 * dt);
        q.vy = q.vy * (1 - Math.min(1, 4 * dt)) - 10 * dt;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    for (const t of this.trails) {
      if (t.fresh) {
        t.fresh = false;
        t.n = 0;
        t.acc = 0;
      }
      for (let i = 0; i < t.n; i++) t.age[i]! += dt;
      while (t.n > 0 && t.age[t.n - 1]! > TLIFE) t.n--;
      t.acc += dt;
      if (t.acc >= TSTEP) {
        t.acc = Math.min(t.acc - TSTEP, TSTEP);
        const n = Math.min(t.n, TN - 1);
        t.x.copyWithin(1, 0, n);
        t.y.copyWithin(1, 0, n);
        t.age.copyWithin(1, 0, n);
        t.k.copyWithin(1, 0, n);
        t.x[0] = t.hx;
        t.y[0] = t.hy;
        t.age[0] = 0;
        t.k[0] = t.hk;
        t.n = n + 1;
      }
      t.lx = t.hx;
      t.ly = t.hy;
    }
  }

  /** The light trails; drawn behind the body. `w` is the half-width at the head of trail i. */
  drawTrails(p: Painter, widths: readonly number[]): void {
    const SUB = 3;
    for (let ti = 0; ti < TRAILS; ti++) {
      const t = this.trails[ti]!;
      const n = t.n;
      if (n < 3) continue;
      let peak = t.hk;
      for (let i = 0; i < n; i++) if (t.k[i]! > peak) peak = t.k[i]!;
      if (peak < 0.02) continue;
      const w = widths[ti] ?? 1.5;
      // Control points: the live head, then the samples, newest first.
      const cx = (i: number): number => (i <= 0 ? t.hx : t.x[Math.min(n, i) - 1]!);
      const cy = (i: number): number => (i <= 0 ? t.hy : t.y[Math.min(n, i) - 1]!);
      const ca = (i: number): number => (i <= 0 ? 0 : t.age[Math.min(n, i) - 1]!);
      const ck = (i: number): number => (i <= 0 ? t.hk : t.k[Math.min(n, i) - 1]!);
      let m = 0;
      for (let i = 0; i < n; i++) {
        for (let q = 0; q < SUB; q++) {
          const u = q / SUB;
          p.px[m] = catmull(cx(i - 1), cx(i), cx(i + 1), cx(i + 2), u);
          p.py[m] = catmull(cy(i - 1), cy(i), cy(i + 1), cy(i + 2), u);
          const age = ca(i) + (ca(i + 1) - ca(i)) * u;
          const k = ck(i) + (ck(i + 1) - ck(i)) * u;
          const f = sat(1 - age / TLIFE);
          p.pw[m] = w * (0.3 + 0.7 * f);
          // Fades in over the first few px so the band itself stays crisp.
          p.pc[m * 3] = k * f * f * f * smoothstep(0, 2.5, m);
          m++;
        }
      }
      p.px[m] = cx(n);
      p.py[m] = cy(n);
      p.pw[m] = w * 0.3;
      p.pc[m * 3] = 0;
      m++;
      for (let i = 0; i < m; i++) p.pw[i]! *= 3.4;
      p.streak(m, GOLD_DEEP);
      for (let i = 0; i < m; i++) {
        p.pw[i]! /= 3.4;
        p.pc[i * 3]! *= 0.7;
      }
      p.streak(m, GOLD_HOT);
    }
  }

  /** Particles; drawn in front of the body. */
  draw(p: Painter, clock: number): void {
    for (const q of this.ps) {
      const t = q.age / q.life;
      if (q.kind === SPECK) {
        const tw = 0.65 + 0.35 * Math.sin(clock * 9 + q.tw);
        const k = Math.min(1, t * 10) * (1 - t) * (1 - t) * tw;
        p.glow(q.x, q.y, q.size * 4.2, GOLD, 0.34 * k);
        p.glow(q.x, q.y, q.size * 1.25, GOLD_HOT, 0.95 * k);
      } else if (q.kind === DUST) {
        const r = q.size * (0.6 + 1.6 * t);
        p.soft(q.x, q.y, r * 1.3, r, DUST_C, 0.26 * (1 - t) * Math.min(1, t * 8));
      } else {
        const e = 1 - (1 - t) ** 3;
        p.glow(q.x, q.y, 22 + 30 * e, GOLD, 0.3 * (1 - t) ** 2);
        p.glow(q.x, q.y, 10 + 8 * e, GOLD_HOT, 0.35 * (1 - t) ** 3);
      }
    }
  }
}
