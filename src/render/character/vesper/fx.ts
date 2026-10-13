// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Vesper's light effects, all in the character's own mesh: gold wing dust that RISES, light
 * trails drawn by the antenna tips and the wing hem, a soft dust puff on hard landings and skids.
 * Deterministic (own LCG, no Math.random); fixed pools, no allocation per frame.
 */
import { sat } from '../hooded/math';
import { type Painter, type RGB, rgb, type Shade } from './paint';

const MOTE = 0;
const DUST = 1;
/** Wing dust left hanging in the air behind a glide: tiny, slow, sinking a little. */
const SPARK = 2;
const MAX = 260;
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
    /** > 0: a silk ribbon. The laid path drifts into a slow wave of this many px as it ages. */
    private readonly silk = 0,
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
  draw(p: Painter, c: RGB, hot: RGB, gain: number, clock = 0): void {
    const n = this.n;
    if (n < 3 || this.k < 0.02) return;
    for (let i = 0; i < n; i++) {
      const t = sat(this.a[i]! / this.life);
      const a = i > 0 ? i - 1 : i;
      const b = i < n - 1 ? i + 1 : i;
      p.px[i] = (this.x[a]! + 2 * this.x[i]! + this.x[b]!) * 0.25;
      p.py[i] = (this.y[a]! + 2 * this.y[i]! + this.y[b]!) * 0.25;
      if (this.silk > 0) {
        // Silk: it billows as it is left behind, sinks a little, and thins to a thread.
        const age = this.a[i]!;
        const wv = Math.sin(age * 8.5 - clock * 2.2 + this.x[i]! * 0.011) * this.silk * t;
        p.px[i]! += wv * 0.35;
        p.py[i]! += wv + 14 * t * t;
        p.pw[i] = this.width * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) ** 0.7 * (1 - 0.6 * t) + 0.3;
        p.pc[i * 3] = (1 - t) ** 1.5 * gain * this.k * Math.min(1, i / 3);
      } else {
        p.pw[i] = this.width * (1 - t) + 0.4;
        p.pc[i * 3] = (1 - t) * (1 - t) * gain * this.k * Math.min(1, i / 2);
      }
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
  private acc2 = 0;
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
    this.acc2 = 0;
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

  /**
   * The glide's dust trail: `rate` sparks per second, each from one of the `n` points in `pts`
   * (x, y pairs: wing tips and hem). They keep a little of her velocity (`vx`, `vy` px/s) and
   * then hang where they were shed, so the trail is drawn by her path.
   */
  trail(dt: number, rate: number, pts: Float32Array, n: number, vx: number, vy: number): void {
    this.acc2 += rate * dt;
    while (this.acc2 >= 1) {
      this.acc2 -= 1;
      const i = Math.min(n - 1, Math.floor(this.rand() * n));
      const life = 1.2 + this.rand() * 1.5;
      this.add(
        SPARK,
        pts[i * 2]! + (this.rand() - 0.5) * 5,
        pts[i * 2 + 1]! + (this.rand() - 0.5) * 5,
        vx * 0.12 + (this.rand() - 0.5) * 14,
        vy * 0.12 + (this.rand() - 0.5) * 10,
        life,
        1.15 + this.rand() * 1.5,
      );
    }
  }

  /** A soft puff of the same sparks from the points in `pts` (a wing beat, the catch). */
  puff(pts: Float32Array, n: number, count: number, vx: number, vy: number): void {
    for (let c = 0; c < count; c++) {
      const i = Math.min(n - 1, Math.floor(this.rand() * n));
      const a = this.rand() * 6.283;
      const sp = 14 + this.rand() * 46;
      this.add(
        SPARK,
        pts[i * 2]! + (this.rand() - 0.5) * 8,
        pts[i * 2 + 1]! + (this.rand() - 0.5) * 8,
        vx * 0.15 + Math.cos(a) * sp,
        vy * 0.15 + Math.abs(Math.sin(a)) * sp + 22,
        1.1 + this.rand() * 1.3,
        1.1 + this.rand() * 1.5,
      );
    }
  }

  /** Sparks struck where a cut lands: a tight fan along (dx, dy) and its mirror. */
  sparks(x: number, y: number, dx: number, dy: number, count: number): void {
    for (let c = 0; c < count; c++) {
      const a = Math.atan2(dy, dx) + (this.rand() - 0.5) * 2.4;
      const sp = 90 + this.rand() * 260;
      this.add(
        SPARK,
        x,
        y,
        Math.cos(a) * sp,
        Math.sin(a) * sp - 30,
        0.25 + this.rand() * 0.35,
        0.9 + this.rand() * 1.1,
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
      } else if (q.kind === SPARK) {
        // They hang where they were shed and drift: a slow sway, the faintest sinking.
        const k = Math.exp(-2.6 * dt);
        q.vx = q.vx * k + Math.sin(clock * 1.7 + q.seed) * 13 * dt;
        q.vy = q.vy * k + (6 + 5 * Math.sin(clock * 1.1 + q.seed * 3)) * dt;
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
      } else if (q.kind === SPARK) {
        // Each twinkles on its own time and dies out as a point.
        const tw = 0.55 + 0.45 * Math.sin(clock * 11 + q.seed * 7);
        const k = Math.min(1, t * 14) * (1 - t) ** 1.2 * tw;
        p.glow(q.x, q.y, q.size * 3.8, GOLD_DEEP, 0.4 * k, q.size * 3.8, 0, 10);
        p.glow(q.x, q.y, q.size * 1.2, GOLD_HOT, 1.1 * k, q.size * 1.2, 0, 8);
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

const SLASH_WHITE = rgb(0xfffdf4);
const SLASH_PALE = rgb(0xffeec2);
const SLASH_SHADE: Shade = {
  c0: rgb(0x1a1230),
  c1: rgb(0x1a1230),
  rim: 0,
  cool: 0,
  form: 0,
  band: 0.95,
  ember: 0,
  alpha: 0.3,
};

/**
 * The slash: a crescent of pale light about (cx, cy), swept from angle a0 to a1 (forward-frame
 * radians; `sgn` mirrors it for the facing). The crescent is a fixed shape in her frame: the cut
 * reveals it from its start to the blade (`head` 0..1), then it thins away from the start (`tail`)
 * and fades. A crisp bright leading edge on the outside, a soft body inside it.
 */
export function drawSlash(
  p: Painter,
  cx: number,
  cy: number,
  sgn: number,
  a0: number,
  a1: number,
  t: number,
  reach: number,
  swing: number,
  ySquash: number,
): void {
  const life = swing + 0.05;
  if (t < 0 || t > life) return;
  const u = Math.min(1, t / swing);
  const head = 1 - (1 - u) ** 3;
  const tail = sat((t - swing * 0.55) / (life - swing * 0.55)) ** 1.3;
  const fade = 1 - sat((t - swing) / (life - swing)) ** 2;
  const N = 26;
  const { px, py, pw, pc } = p;
  for (let pass = -1; pass < 3; pass++) {
    let n = 0;
    for (let i = 0; i < N; i++) {
      const q = i / (N - 1);
      if (q > head + 0.02) break;
      const a = a0 + (a1 - a0) * q;
      // Thickest two thirds of the way along; a point at either end.
      const th = 46 * Math.sin(Math.PI * q ** 0.8) ** 0.85 * (0.55 + 0.45 * q);
      // The reach swells a little through the middle of the cut: a blade's path, not a compass arc.
      const r = reach * (0.86 + 0.14 * Math.sin(Math.PI * q));
      const off = pass < 0 ? th * 0.2 + 3 : pass === 0 ? th * 0.5 : pass === 1 ? th * 0.2 : 1.2;
      const hw =
        pass < 0 ? th * 0.12 + 1.2 : pass === 0 ? th * 0.5 : pass === 1 ? th * 0.22 : 1.3 + th * 0.05;
      const rr = r - off;
      px[n] = cx + Math.cos(a) * rr * sgn;
      py[n] = cy - Math.sin(a) * rr * ySquash;
      pw[n] = hw + 0.2;
      const lead = sat((q - tail) / 0.22) * sat((head + 0.02 - q) / 0.06 + 0.35);
      const gain = pass === 0 ? 0.4 : pass === 1 ? 0.85 : 2.1;
      pc[n * 3] = gain * fade * lead * (0.6 + 0.4 * (q / Math.max(0.2, head)) ** 2);
      n++;
    }
    if (pass < 0) {
      // A soft dusk under-edge: against a bright backdrop the pale crescent still has a shape.
      for (let i = 0; i < n; i++) pw[i]! *= Math.min(1, pc[i * 3]! * 3);
      SLASH_SHADE.alpha = 0.3 * fade;
      if (n > 2) p.ribbon(n, SLASH_SHADE, false, false);
    } else p.streak(n, pass === 0 ? GOLD : pass === 1 ? SLASH_PALE : SLASH_WHITE);
  }
}

/** The flash where a cut lands: a hot core and a thin four-point star, gone in a few frames. */
export function drawImpact(p: Painter, x: number, y: number, t: number): void {
  if (t < 0 || t > 0.13) return;
  const k = 1 - t / 0.13;
  p.glow(x, y, 14 + 12 * (1 - k), GOLD, 0.35 * k * k);
  p.glow(x, y, 5, SLASH_WHITE, 1.0 * k);
  for (let i = 0; i < 2; i++) {
    const a = 0.5 + i * (Math.PI / 2);
    const l = (13 + 12 * (1 - k)) * (i === 0 ? 1 : 0.6);
    for (let q = 0; q < 5; q++) {
      const f = q / 4 - 0.5;
      p.px[q] = x + Math.cos(a) * l * 2 * f;
      p.py[q] = y + Math.sin(a) * l * 2 * f;
      p.pw[q] = 1.4 * (1 - Math.abs(f) * 2) + 0.2;
      p.pc[q * 3] = k * (1 - Math.abs(f) * 2);
    }
    p.streak(5, SLASH_WHITE);
  }
}
