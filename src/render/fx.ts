/**
 * Placeholder juice (movement-spec §5): squash & stretch, dust, landing impact, wall-slide
 * particles, dash afterimages. Pure TS (no Pixi): it is stepped once per sim frame from sim state
 * and events and only produces draw data, so it is deterministic in clips and never touches the sim.
 * Randomness comes from a render-side seeded RNG, never the sim RNG.
 */
import type { SimEvent } from '../sim/events';
import type { GameState } from '../sim/index';
import { tuning } from '../sim/tuning';

/** A dust burst: `n` particles, horizontal speed `speed` x [0.3, 1], sizes in [size0, size1]. */
export interface PuffSpec {
  n: number;
  speed: number;
  up: number;
  size0: number;
  size1: number;
  life: number;
  gravity: number;
  drag: number;
}

const puff = (
  n: number,
  speed: number,
  up: number,
  size0: number,
  size1: number,
  life: number,
): PuffSpec => ({
  n,
  speed,
  up,
  size0,
  size1,
  life,
  gravity: 0.04,
  drag: 0.9,
});

/**
 * Juice constants. Amplitudes were raised ~2.5x after the L2 playtest (landing dust read as two
 * specks, the death burst as one blob): see docs/reports/L2-playtest.md.
 */
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
  /** Takeoff dust (ground/coyote/buffered jumps) and the wall-jump kick puff. */
  jumpDust: puff(6, 3, 2.5, 8, 16, 22),
  wallJumpDust: puff(7, 4, 1.5, 8, 16, 22),
  /** Landings: soft (vy < maxFall / 2), big, and the extra layer on a `hard` landing. */
  landDust: puff(5, 6, 1.5, 8, 14, 22),
  landDustBig: puff(10, 12.5, 2.5, 10, 22, 26),
  hardLandDust: { ...puff(12, 17.5, 4, 14, 26, 34), drag: 0.88 },
  /** Hard landing: horizontal streaks along the floor (count, speed, length range). */
  hardLandStreaks: { n: 2, speed: 16, len0: 26, len1: 40, life: 16 },
  skidDust: puff(4, 4, 1.5, 6, 12, 22),
  headBumpDust: puff(4, 2.5, -1, 6, 12, 22),
  doubleJumpRing: { n: 8, speed: 7, life: 18, size: 9 },
  pogoRing: { n: 10, speed: 8, life: 18, size: 9 },
  dashStreaks: { n: 6, speed0: 4, speed1: 9, len0: 14, len1: 30, life: 14 },
  /** Death: radial burst, a white flash on the body, a hold, then the pop (burst spawns). */
  deathBurst: { n: 24, speed0: 6, speed1: 10, size0: 8, size1: 16, gravity: 0.3, drag: 0.95, life: 40 },
  deathFlashFrames: 2,
  deathHoldFrames: 6,
  /** Body scale at the end of the hold (it swells, then pops into the burst). */
  deathPopScale: 1.35,
  /** Full-screen white flash alpha on death, fading over deathScreenFlashFrames. */
  deathScreenFlash: 0.35,
  deathScreenFlashFrames: 8,
  /** Wall slide: a chip every N frames, drifting down the wall. */
  wallDustEvery: 2,
  wallDust: { size0: 6, size1: 9, vy0: 0.5, vy1: 1.5, vx0: 0.3, vx1: 1, gravity: 0.05, drag: 0.94, life: 20 },
  afterimageEvery: 3,
  afterimageLife: 12,
  rngSeed: 1234,
} as const;

/** The body at the moment of death, drawn flashing/swelling for `deathHoldFrames`. */
export interface DeathPop {
  x: number;
  y: number;
  w: number;
  h: number;
  age: number;
}

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
  /** Active death flash/pop (null when none). */
  death: DeathPop | null = null;
  /** Full-screen white flash alpha (0..1), drawn by the screen layer. */
  screenFlash = 0;
  private rng: number = fxTuning.rngSeed;
  private frame = 0;

  reset(): void {
    this.sx = 1;
    this.sy = 1;
    this.particles = [];
    this.afterimages = [];
    this.death = null;
    this.screenFlash = 0;
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

  private puff(x: number, y: number, spec: PuffSpec, color: number = FX_COLORS.dust): void {
    for (let i = 0; i < spec.n; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      this.particles.push({
        x: x + this.range(-8, 8),
        y: y - this.range(0, 6),
        vx: dir * this.range(0.3, 1) * spec.speed,
        vy: -this.range(0.2, 1) * spec.up,
        gravity: spec.gravity,
        drag: spec.drag,
        age: 0,
        life: spec.life,
        size: this.range(spec.size0, spec.size1),
        color,
        shape: 'square',
      });
    }
  }

  private streaks(
    x: number,
    y: number,
    n: number,
    vx: (i: number) => number,
    len: () => number,
    life: number,
    color: number,
  ): void {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x,
        y,
        vx: vx(i),
        vy: 0,
        gravity: 0,
        drag: 0.85,
        age: 0,
        life,
        size: len(),
        color,
        shape: 'streak',
      });
    }
  }

  private burst(x: number, y: number): void {
    const b = fxTuning.deathBurst;
    for (let i = 0; i < b.n; i++) {
      const a = RING[Math.floor((i * RING.length) / b.n)] ?? [1, 0];
      const sp = this.range(b.speed0, b.speed1);
      this.particles.push({
        x,
        y,
        vx: a[0] * sp,
        vy: a[1] * sp - 2,
        gravity: b.gravity,
        drag: b.drag,
        age: 0,
        life: b.life,
        size: this.range(b.size0, b.size1),
        color: FX_COLORS.death,
        shape: 'square',
      });
    }
  }

  private ring(
    x: number,
    y: number,
    spec: { n: number; speed: number; life: number; size: number },
    color: number,
  ): void {
    for (let i = 0; i < spec.n; i++) {
      // Angles from a small table (no trig needed for a placeholder ring).
      const a = RING[Math.floor((i * RING.length) / spec.n)] ?? [1, 0];
      this.particles.push({
        x,
        y,
        vx: a[0] * spec.speed,
        vy: a[1] * spec.speed * 0.6,
        gravity: 0,
        drag: 0.86,
        age: 0,
        life: spec.life,
        size: spec.size,
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
    const T = fxTuning;
    for (const e of events) {
      switch (e.type) {
        case 'jump':
          if (e.kind === 'double') {
            this.squash(T.airJumpSquash);
            this.ring(e.x, e.y, T.doubleJumpRing, FX_COLORS.ring);
          } else if (e.kind === 'wall') {
            this.squash(T.airJumpSquash);
            this.puff(e.x - e.dir * 20, e.y - 40, T.wallJumpDust, FX_COLORS.wall);
          } else {
            this.squash(T.jumpSquash);
            this.puff(e.x, e.y, T.jumpDust);
          }
          break;
        case 'land': {
          const k = Math.min(Math.max(e.vy, 0) / fastMax, 1);
          const [lx = 1, ly = 1] = T.landSquash;
          this.sx = 1 + (lx - 1) * k;
          this.sy = 1 + (ly - 1) * k;
          this.puff(e.x, e.y, e.vy >= maxFall / 2 ? T.landDustBig : T.landDust);
          if (e.hard) {
            this.puff(e.x, e.y, T.hardLandDust, FX_COLORS.hardDust);
            const st = T.hardLandStreaks;
            this.streaks(
              e.x,
              e.y - 4,
              st.n,
              (i) => (i % 2 === 0 ? 1 : -1) * st.speed,
              () => this.range(st.len0, st.len1),
              st.life,
              FX_COLORS.hardDust,
            );
          }
          break;
        }
        case 'skid':
          this.puff(e.x, e.y, T.skidDust);
          break;
        case 'dashStart': {
          this.squash(T.dashSquash);
          const ds = T.dashStreaks;
          for (let i = 0; i < ds.n; i++) {
            this.streaks(
              e.x,
              e.y - this.range(10, 70),
              1,
              () => -e.dir * this.range(ds.speed0, ds.speed1),
              () => this.range(ds.len0, ds.len1),
              ds.life,
              FX_COLORS.dash,
            );
          }
          break;
        }
        case 'headBump':
          this.squash(T.headBumpSquash);
          this.puff(e.x, e.y, T.headBumpDust);
          break;
        case 'pogo':
          this.squash(T.jumpSquash);
          this.ring(e.x, e.y + 20, T.pogoRing, FX_COLORS.pogo);
          break;
        case 'death':
          this.death = { x: p.x, y: p.y, w: p.w, h: p.h, age: 0 };
          this.screenFlash = T.deathScreenFlash;
          break;
        case 'roomEnter':
        case 'respawn':
          this.sx = 1;
          this.sy = 1;
          this.afterimages = [];
          this.death = null;
          break;
        default:
          break;
      }
    }

    // Death: hold the flashing body, then pop into the burst.
    const d = this.death;
    if (d) {
      if (d.age === T.deathHoldFrames) {
        this.burst(d.x + d.w / 2, d.y + d.h / 2);
        this.death = null;
      } else d.age++;
    }
    if (this.screenFlash > 0)
      this.screenFlash = Math.max(0, this.screenFlash - T.deathScreenFlash / T.deathScreenFlashFrames);

    // Continuous effects.
    if (p.state === 'wallSlide' && this.frame % T.wallDustEvery === 0) {
      const wd = T.wallDust;
      const cx = p.wallDir > 0 ? p.x + p.w : p.x;
      this.particles.push({
        x: cx,
        y: p.y + this.range(10, 30),
        vx: -p.wallDir * this.range(wd.vx0, wd.vx1),
        vy: this.range(wd.vy0, wd.vy1),
        gravity: wd.gravity,
        drag: wd.drag,
        age: 0,
        life: wd.life,
        size: this.range(wd.size0, wd.size1),
        color: FX_COLORS.wall,
        shape: 'square',
      });
    }
    if (p.state === 'dash' && this.frame % T.afterimageEvery === 0) {
      this.afterimages.push({ x: p.x, y: p.y, w: p.w, h: p.h, facing: p.facing, age: 0 });
    }
    if (p.vy > maxFall + 0.5 && p.state === 'normal') {
      this.sx = Math.min(this.sx, T.fastFallStretch[0]);
      this.sy = Math.max(this.sy, T.fastFallStretch[1]);
    }

    // Advance.
    const r = T.squashRecover;
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
    this.afterimages = this.afterimages.filter((a) => a.age < T.afterimageLife);
  }
}

/** 16 unit vectors around a circle (render code, so trig is fine here). */
const RING: Array<[number, number]> = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * 2 * Math.PI;
  return [Math.cos(a), Math.sin(a)];
});
