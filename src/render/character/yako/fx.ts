// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Yako's light and small accents, drawn in the character mesh, few and soft: ember motes shed by
 * the tail tip and the charm (left behind in the world, so they string out when he moves), a
 * flowing streak of light from the tail tip and a thin one from the eye when he moves fast, a
 * burst on the double jump, soft dust on hard landings and skids. Deterministic (own LCG).
 */
import { catmull, sat } from '../hooded/math';
import { type Cel, type RGB, rgb } from './cel';

const MOTE = 0;
const DUST = 1;
const SPARK = 2;
const FLASH = 3;

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
const EMBER = rgb(0xff8a3a);
const EMBER_HOT = rgb(0xfff1c0);
const EMBER_DEEP = rgb(0xff6a22);
const AMBER = rgb(0xffb52e);
const DUST_C: RGB = [0.6, 0.76, 0.78];

const TRAIL = 44;
const TRAIL_LIFE = 0.2;

class Trail {
  readonly x = new Float32Array(TRAIL);
  readonly y = new Float32Array(TRAIL);
  readonly a = new Float32Array(TRAIL);
  n = 0;

  clear(): void {
    this.n = 0;
  }

  push(dt: number, x: number, y: number, life: number): void {
    for (let i = 0; i < this.n; i++) this.a[i]! += dt;
    while (this.n > 0 && this.a[this.n - 1]! > life) this.n--;
    if (dt <= 0) return;
    const n = Math.min(this.n, TRAIL - 1);
    this.x.copyWithin(1, 0, n);
    this.y.copyWithin(1, 0, n);
    this.a.copyWithin(1, 0, n);
    this.x[0] = x;
    this.y[0] = y;
    this.a[0] = 0;
    this.n = n + 1;
  }

  /** Fills the painter's streak scratch (a Catmull-Rom curve, two samples per point); returns the count. */
  lay(p: Cel, life: number, w: number, k: number): number {
    const n = this.n;
    if (n < 3) return 0;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const i0 = i > 0 ? i - 1 : 0;
      const i2 = i < n - 1 ? i + 1 : i;
      const i3 = i < n - 2 ? i + 2 : n - 1;
      for (let h = 0; h < 2; h++) {
        if (h === 1 && i === n - 1) break;
        const f = h * 0.5;
        const age = this.a[i]! + (this.a[i2]! - this.a[i]!) * f;
        const t = sat(age / life);
        p.sx[m] = catmull(this.x[i0]!, this.x[i]!, this.x[i2]!, this.x[i3]!, f);
        p.sy[m] = catmull(this.y[i0]!, this.y[i]!, this.y[i2]!, this.y[i3]!, f);
        p.sw[m] = w * (1 - t) ** 1.3 + 0.4;
        p.sa[m] = (1 - t) * (1 - t) * k * Math.min(1, m / 4);
        m++;
      }
    }
    return m;
  }
}

export class Fx {
  private readonly ps: Particle[] = [];
  private seed = 0x9e3779b9;
  private moteAcc = 0;
  private charmAcc = 0;
  private readonly tip = new Trail();
  private readonly eye = new Trail();
  private readonly sash = new Trail();
  private trailK = 0;
  private tipLife = TRAIL_LIFE;

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  clear(): void {
    this.ps.length = 0;
    this.tip.clear();
    this.eye.clear();
    this.sash.clear();
    this.moteAcc = 0;
    this.charmAcc = 0;
    this.trailK = 0;
  }

  private add(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number): void {
    if (this.ps.length >= MAX) this.ps.shift();
    this.ps.push({ kind, x, y, vx, vy, age: 0, life, size, seed: this.rand() });
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

  /** A puff where a foot scrapes down a wall. */
  scrape(x: number, y: number, away: number): void {
    this.add(
      DUST,
      x,
      y,
      away * (10 + this.rand() * 18),
      6 + this.rand() * 14,
      0.3 + this.rand() * 0.2,
      2.2 + this.rand() * 1.6,
    );
  }

  /** Double-jump beat: a soft bloom of light and a scatter of embers along the tail's sweep. */
  burst(x: number, y: number, tx: number, ty: number): void {
    this.add(FLASH, x, y, 0, 0, 0.42, 1);
    for (let i = 0; i < 9; i++) {
      const a = this.rand() * 6.283;
      const sp = 30 + this.rand() * 90;
      const k = this.rand();
      this.add(
        SPARK,
        x + (tx - x) * k,
        y + (ty - y) * k,
        Math.cos(a) * sp,
        Math.sin(a) * sp + 30,
        0.4 + this.rand() * 0.5,
        1 + this.rand() * 0.9,
      );
    }
  }

  private mote(x: number, y: number, vx: number, vy: number): void {
    this.add(
      MOTE,
      x + (this.rand() - 0.5) * 5,
      y + (this.rand() - 0.5) * 5,
      vx + (this.rand() - 0.5) * 16,
      vy - 6 - this.rand() * 12,
      0.9 + this.rand() * 1.1,
      0.75 + this.rand() * 0.75,
    );
  }

  /**
   * Per frame. Tail tip, eye and sash knot in world px; (vx, vy) the body's velocity in px/s;
   * `flow` 0..1+ how strongly light should stream (speed, dash, flourish).
   */
  update(
    dt: number,
    tipX: number,
    tipY: number,
    eyeX: number,
    eyeY: number,
    knotX: number,
    knotY: number,
    charmX: number,
    charmY: number,
    vx: number,
    vy: number,
    flow: number,
    ring: number,
  ): void {
    this.tipLife = TRAIL_LIFE + 0.2 * ring;
    this.trailK += (flow - this.trailK) * (1 - Math.exp(-dt * (flow > this.trailK ? 14 : 5)));
    this.moteAcc += (2.4 + 16 * sat(flow)) * dt;
    while (this.moteAcc >= 1) {
      this.moteAcc -= 1;
      this.mote(tipX, tipY, vx * 0.12, vy * 0.12);
    }
    this.charmAcc += (0.9 + 3 * sat(flow)) * dt;
    while (this.charmAcc >= 1) {
      this.charmAcc -= 1;
      this.mote(charmX, charmY, vx * 0.1, vy * 0.1);
    }
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const q = this.ps[i]!;
      q.age += dt;
      if (q.age >= q.life) {
        this.ps.splice(i, 1);
        continue;
      }
      if (q.kind === MOTE) {
        q.vx *= 1 - 1.8 * dt;
        q.vy = q.vy * (1 - 1.8 * dt) - 9 * dt;
        q.x += Math.sin(q.age * 3.1 + q.seed * 40) * 5 * dt;
      } else if (q.kind === SPARK) {
        q.vx *= 1 - 3 * dt;
        q.vy = q.vy * (1 - 3 * dt) - 30 * dt;
      } else if (q.kind === DUST) {
        q.vx *= 1 - 5 * dt;
        q.vy = q.vy * (1 - 4 * dt) - 10 * dt;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    this.tip.push(dt, tipX, tipY, this.tipLife);
    this.eye.push(dt, eyeX, eyeY, 0.14);
    this.sash.push(dt, knotX, knotY, 0.2);
  }

  /** The streaks; drawn behind the body. */
  drawTrail(p: Cel): void {
    const k = Math.min(1.4, this.trailK);
    if (k < 0.02) return;
    let n = this.sash.lay(p, 0.2, 3.2, 0.2 * k);
    if (n >= 3) p.streak(n, EMBER_DEEP);
    n = this.tip.lay(p, this.tipLife, 6, 0.34 * k);
    if (n >= 3) {
      p.streak(n, EMBER_DEEP);
      for (let i = 0; i < n; i++) {
        p.sw[i]! *= 0.42;
        p.sa[i]! *= 0.8;
      }
      p.streak(n, EMBER_HOT);
    }
  }

  /** Particles and the eye's streak; drawn in front of the body. */
  draw(p: Cel): void {
    const k = Math.min(1.4, this.trailK);
    if (k > 0.05) {
      const n = this.eye.lay(p, 0.14, 1.1, 0.5 * k);
      if (n >= 3) p.streak(n, AMBER);
    }
    for (const q of this.ps) {
      const t = q.age / q.life;
      if (q.kind === MOTE) {
        const a = Math.sin(Math.PI * t) ** 1.4 * (0.75 + 0.25 * Math.sin(q.age * 9 + q.seed * 30));
        const r = q.size * (1 - 0.45 * t);
        p.glow(q.x, q.y, r * 4.2, EMBER, 0.22 * a);
        p.glow(q.x, q.y, r * 1.5, EMBER_HOT, 0.95 * a);
      } else if (q.kind === SPARK) {
        const a = (1 - t) * (1 - t);
        p.glow(q.x, q.y, q.size * 4, EMBER, 0.4 * a);
        p.glow(q.x, q.y, q.size * 1.4, EMBER_HOT, a);
      } else if (q.kind === DUST) {
        const r = q.size * (0.6 + 1.6 * t);
        p.soft(q.x, q.y, r * 1.3, r, DUST_C, 0.26 * (1 - t) * Math.min(1, t * 8));
      } else {
        const e = 1 - (1 - t) ** 3;
        p.glow(q.x, q.y, 26 + 44 * e, EMBER, 0.34 * (1 - t) ** 2);
        p.glow(q.x, q.y, 10 + 16 * e, EMBER_HOT, 0.3 * (1 - t) ** 3);
      }
    }
  }
}
