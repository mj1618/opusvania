import type { Graphics } from 'pixi.js';
import { rngFor } from './outline';

/** A render particle: a square spark, an expanding ring, or a soft dust puff. */
export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: number;
  kind: 'square' | 'ring' | 'puff';
  /** Ring end radius (rings), gravity (others). */
  r1: number;
  gravity: number;
}

/**
 * A small deterministic particle set for the combat feedback layer: stepped once per sim step
 * (frozen during hitstop by the caller), randomness from `rngFor(step, salt)`, never Math.random.
 */
export class SparkSet {
  list: Spark[] = [];
  private n = 0;

  constructor(private readonly salt: number) {}

  clear(): void {
    this.list = [];
    this.n = 0;
  }

  /** A per-step RNG (call once per step before spawning). */
  rng(): () => number {
    this.n++;
    return rngFor(this.n, this.salt);
  }

  ring(x: number, y: number, color: number, r1 = 58, life = 14, width = 5): void {
    this.list.push({ x, y, vx: 0, vy: 0, age: 0, life, size: width, color, kind: 'ring', r1, gravity: 0 });
  }

  burst(
    rnd: () => number,
    x: number,
    y: number,
    n: number,
    color: number,
    o: {
      speed?: number;
      size?: number;
      life?: number;
      spread?: number;
      dir?: number;
      up?: number;
      gravity?: number;
      kind?: 'square' | 'puff';
    } = {},
  ): void {
    const sp0 = o.speed ?? 7;
    for (let i = 0; i < n; i++) {
      const base = o.dir ?? 0;
      const a =
        o.spread === undefined ? (i / n) * Math.PI * 2 + rnd() * 0.4 : base + (rnd() - 0.5) * o.spread;
      const sp = sp0 * (0.5 + rnd() * 0.7);
      this.list.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (o.up ?? 0),
        age: 0,
        life: (o.life ?? 16) + Math.floor(rnd() * 6),
        size: (o.size ?? 6) * (0.7 + rnd() * 0.6),
        color,
        kind: o.kind ?? 'square',
        r1: 0,
        gravity: o.gravity ?? 0.35,
      });
    }
  }

  step(): void {
    for (const p of this.list) {
      p.age++;
      if (p.kind === 'ring') continue;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= p.kind === 'puff' ? 0.85 : 0.9;
      p.vy = p.vy * (p.kind === 'puff' ? 0.85 : 0.9) + p.gravity;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  draw(g: Graphics, glow?: Graphics): void {
    for (const p of this.list) {
      const t = p.age / p.life;
      if (p.kind === 'ring') {
        const r = 10 + t * p.r1;
        g.circle(p.x, p.y, r).stroke({ width: p.size * (1 - t) + 1, color: p.color, alpha: 1 - t });
        glow
          ?.circle(p.x, p.y, r)
          .stroke({ width: p.size * (1 - t) + 1, color: p.color, alpha: (1 - t) * 0.6 });
      } else if (p.kind === 'puff') {
        const r = p.size * (0.6 + t * 0.9);
        g.circle(p.x, p.y, r).fill({ color: p.color, alpha: 0.75 * (1 - t) });
      } else {
        const s = p.size * (1 - t * 0.5);
        g.rect(p.x - s / 2, p.y - s / 2, s, s).fill({ color: p.color, alpha: 1 - t });
        glow?.rect(p.x - s / 2, p.y - s / 2, s, s).fill({ color: p.color, alpha: (1 - t) * 0.5 });
      }
    }
  }
}
