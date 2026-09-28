/**
 * Placeholder juice (movement-spec §5): squash & stretch, dust, landing impact, wall-slide
 * particles, dash afterimages. Pure TS (no Pixi): it is stepped once per sim frame from sim state
 * and events and only produces draw data, so it is deterministic in clips and never touches the sim.
 * Randomness comes from a render-side seeded RNG, never the sim RNG.
 */
import type { SimEvent } from '../sim/events';
import type { GameState } from '../sim/index';
import { tuning } from '../sim/tuning';

export const fxTuning = {
  /** Scale recovers toward 1 by this much per frame. */
  squashRecover: 0.03,
  jumpSquash: [0.7, 1.3],
  airJumpSquash: [0.75, 1.25],
  /** Landing squash at full impact (vy >= fastFallMax); scales with impact speed. */
  landSquash: [1.5, 0.55],
  dashSquash: [1.35, 0.75],
  fastFallStretch: [0.8, 1.2],
  headBumpSquash: [1.15, 0.85],
  dustLife: 22,
  afterimageEvery: 3,
  afterimageLife: 12,
  wallDustEvery: 4,
  rngSeed: 1234,
} as const;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  age: number;
  life: number;
  size: number;
  color: number;
  shape: 'square' | 'streak' | 'ring';
}

export interface Afterimage {
  x: number;
  y: number;
  w: number;
  h: number;
  facing: number;
  age: number;
}

export const FX_COLORS = {
  dust: 0xc9c2b0,
  hardDust: 0xe6dcc4,
  wall: 0xa9b3c9,
  dash: 0x8fd3ff,
  death: 0xff5a6e,
  pogo: 0xffd84a,
  ring: 0xf2f0e6,
};

export class Juice {
  sx = 1;
  sy = 1;
  particles: Particle[] = [];
  afterimages: Afterimage[] = [];
  private rng: number = fxTuning.rngSeed;
  private frame = 0;

  reset(): void {
    this.sx = 1;
    this.sy = 1;
    this.particles = [];
    this.afterimages = [];
  }

  private rand(): number {
    // mulberry32 (render RNG).
    this.rng = (this.rng + 0x6d2b79f5) >>> 0;
    let t = this.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private range(a: number, b: number): number {
    return a + this.rand() * (b - a);
  }

  private squash(s: readonly number[]): void {
    this.sx = s[0] ?? 1;
    this.sy = s[1] ?? 1;
  }

  private puff(
    x: number,
    y: number,
    n: number,
    opts: Partial<Particle> & { spread?: number; up?: number; speed?: number } = {},
  ): void {
    const spread = opts.spread ?? 1;
    const speed = opts.speed ?? 3;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      this.particles.push({
        x: x + this.range(-8, 8),
        y: y - this.range(0, 6),
        vx: dir * this.range(0.3, 1) * speed * spread,
        vy: -this.range(0.2, 1) * (opts.up ?? 1.5),
        gravity: opts.gravity ?? 0.04,
        drag: opts.drag ?? 0.9,
        age: 0,
        life: opts.life ?? fxTuning.dustLife,
        size: opts.size ?? this.range(6, 12),
        color: opts.color ?? FX_COLORS.dust,
        shape: opts.shape ?? 'square',
      });
    }
  }

  private ring(x: number, y: number, n: number, color: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      // Angles from a small table (no trig needed for a placeholder ring).
      const a = RING[Math.floor((i * RING.length) / n)] ?? [1, 0];
      this.particles.push({
        x,
        y,
        vx: a[0] * speed,
        vy: a[1] * speed * 0.6,
        gravity: 0,
        drag: 0.86,
        age: 0,
        life: 18,
        size: 7,
        color,
        shape: 'square',
      });
    }
  }

  /** One sim frame: react to events, then advance particles and scale. */
  step(s: GameState, events: readonly SimEvent[]): void {
    this.frame++;
    const p = s.player;
    const maxFall = tuning.jump.maxFall;
    const fastMax = tuning.jump.fastFallMax;
    for (const e of events) {
      switch (e.type) {
        case 'jump':
          if (e.kind === 'double') {
            this.squash(fxTuning.airJumpSquash);
            this.ring(e.x, e.y, 6, FX_COLORS.ring, 5);
          } else if (e.kind === 'wall') {
            this.squash(fxTuning.airJumpSquash);
            this.puff(e.x - e.dir * 20, e.y - 40, 5, { color: FX_COLORS.wall, speed: 2 });
          } else {
            this.squash(fxTuning.jumpSquash);
            this.puff(e.x, e.y, 4, { up: 2.5, speed: 2 });
          }
          break;
        case 'land': {
          const k = Math.min(Math.max(e.vy, 0) / fastMax, 1);
          const [lx = 1, ly = 1] = fxTuning.landSquash;
          this.sx = 1 + (lx - 1) * k;
          this.sy = 1 + (ly - 1) * k;
          const big = e.vy >= maxFall / 2;
          this.puff(e.x, e.y, big ? 8 : 3, { speed: big ? 5 : 2.5 });
          if (e.hard) this.puff(e.x, e.y, 10, { speed: 7, size: 14, color: FX_COLORS.hardDust, life: 30 });
          break;
        }
        case 'skid':
          this.puff(e.x, e.y, 3, { speed: 2 });
          break;
        case 'dashStart':
          this.squash(fxTuning.dashSquash);
          for (let i = 0; i < 6; i++) {
            this.particles.push({
              x: e.x,
              y: e.y - this.range(10, 70),
              vx: -e.dir * this.range(4, 9),
              vy: 0,
              gravity: 0,
              drag: 0.85,
              age: 0,
              life: 14,
              size: this.range(14, 30),
              color: FX_COLORS.dash,
              shape: 'streak',
            });
          }
          break;
        case 'headBump':
          this.squash(fxTuning.headBumpSquash);
          this.puff(e.x, e.y, 3, { up: -1, speed: 1.5 });
          break;
        case 'pogo':
          this.squash(fxTuning.jumpSquash);
          this.ring(e.x, e.y + 20, 8, FX_COLORS.pogo, 6);
          break;
        case 'death':
          for (let i = 0; i < 16; i++) {
            const a = RING[i % RING.length] ?? [1, 0];
            const sp = this.range(4, 10);
            this.particles.push({
              x: e.x,
              y: e.y,
              vx: a[0] * sp,
              vy: a[1] * sp - 2,
              gravity: 0.3,
              drag: 0.95,
              age: 0,
              life: 40,
              size: this.range(6, 12),
              color: FX_COLORS.death,
              shape: 'square',
            });
          }
          break;
        case 'roomEnter':
        case 'respawn':
          this.sx = 1;
          this.sy = 1;
          this.afterimages = [];
          break;
        default:
          break;
      }
    }

    // Continuous effects.
    if (p.state === 'wallSlide' && this.frame % fxTuning.wallDustEvery === 0) {
      const cx = p.wallDir > 0 ? p.x + p.w : p.x;
      this.particles.push({
        x: cx,
        y: p.y + this.range(10, 30),
        vx: -p.wallDir * this.range(0.5, 1.5),
        vy: -this.range(0.5, 1.5),
        gravity: 0.02,
        drag: 0.92,
        age: 0,
        life: 18,
        size: this.range(4, 8),
        color: FX_COLORS.wall,
        shape: 'square',
      });
    }
    if (p.state === 'dash' && this.frame % fxTuning.afterimageEvery === 0) {
      this.afterimages.push({ x: p.x, y: p.y, w: p.w, h: p.h, facing: p.facing, age: 0 });
    }
    if (p.vy > maxFall + 0.5 && p.state === 'normal') {
      this.sx = Math.min(this.sx, fxTuning.fastFallStretch[0]);
      this.sy = Math.max(this.sy, fxTuning.fastFallStretch[1]);
    }

    // Advance.
    const r = fxTuning.squashRecover;
    this.sx = this.sx > 1 ? Math.max(1, this.sx - r) : Math.min(1, this.sx + r);
    this.sy = this.sy > 1 ? Math.max(1, this.sy - r) : Math.min(1, this.sy + r);
    for (const q of this.particles) {
      q.x += q.vx;
      q.y += q.vy;
      q.vx *= q.drag;
      q.vy = q.vy * q.drag + q.gravity;
      q.age++;
    }
    this.particles = this.particles.filter((q) => q.age < q.life);
    for (const a of this.afterimages) a.age++;
    this.afterimages = this.afterimages.filter((a) => a.age < fxTuning.afterimageLife);
  }
}

/** 16 unit vectors around a circle (render code, so trig is fine here). */
const RING: Array<[number, number]> = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * 2 * Math.PI;
  return [Math.cos(a), Math.sin(a)];
});
