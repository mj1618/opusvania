// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Vesper's light effects, all in the character's own mesh: gold wing dust that RISES, light
 * trails drawn by the antenna tips and the wing hem, a soft dust puff on hard landings and skids.
 * Deterministic (own LCG, no Math.random); fixed pools, no allocation per frame.
 */
import { sat, smoothstep } from '../hooded/math';
import { type Painter, type RGB, rgb, type Shade } from './paint';

const MOTE = 0;
const DUST = 1;
/** Wing dust left hanging in the air behind a glide: tiny, slow, sinking a little. */
const SPARK = 2;
/** Struck from a hit: a short, fast line that is gone in a few frames. */
const STREAK = 3;
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

  /**
   * Sparks struck where a cut lands: a few sharp streaks thrown along the cut (dx, dy), a couple
   * back off the surface. `power` 1 or 2.
   */
  sparks(x: number, y: number, dx: number, dy: number, power: number): void {
    const count = 4 + 2 * power;
    const a0 = Math.atan2(dy, dx);
    for (let c = 0; c < count; c++) {
      const back = c >= count - 2;
      const a = a0 + (back ? Math.PI + (this.rand() - 0.5) * 1.5 : (this.rand() - 0.5) * 1.05);
      const sp = (back ? 260 : 430) + this.rand() * (back ? 220 : 420) * (0.8 + 0.2 * power);
      this.add(
        STREAK,
        x,
        y,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        0.065 + this.rand() * 0.04,
        0.8 + this.rand() * 0.5,
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
      } else if (q.kind === STREAK) {
        const k = Math.exp(-11 * dt);
        q.vx *= k;
        q.vy = q.vy * k + 260 * dt;
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
      } else if (q.kind === STREAK) {
        // A line from where it is back along its flight, sharp at the head.
        const k = (1 - t) ** 0.8;
        const len = 0.05 * (0.5 + 0.5 * k);
        for (let i = 0; i < 4; i++) {
          const f = i / 3;
          p.px[i] = q.x - q.vx * len * f;
          p.py[i] = q.y - q.vy * len * f;
          p.pw[i] = q.size * (1 - 0.8 * f) + 0.15;
          p.pc[i * 3] = 1.25 * k * (1 - f);
        }
        p.streak(4, GOLD_HOT);
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

const SLASH_WHITE = rgb(0xfff8e6);
/** The trail runs cool at its tail to warm at the blade. */
const TRAIL_COOL: RGB = [0.8, 0.86, 0.96];
const TRAIL_WARM: RGB = [1, 0.9, 0.68];
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
const TRAIL_SHADE: Shade = {
  c0: SLASH_WHITE,
  c1: SLASH_WHITE,
  rim: 0,
  cool: 0,
  form: 0,
  band: 0.5,
  ember: 0,
  alpha: 1,
};

/** Look of the blade's trail. Brightness is deliberately low: the shape carries it. */
export const TRAIL = {
  /** Seconds a laid sample lasts: a cut, the finisher. */
  life: [0.1, 0.15],
  /** Samples per whole cut (the cut takes ~4 frames: several are laid per frame). */
  perCut: 30,
  /** The solid crescent: its widest as a fraction of the reach (a cut, the finisher), its alpha and tone. */
  width: [0.11, 0.15],
  solid: 0.92,
  tone: 0.84,
  /** The soft haze trailing inside it (additive; its depth is the stroke's `thick`). Keep it faint. */
  haze: 0.16,
  /** The dusk rim: px it stands proud of the crescent, and its alpha. */
  duskW: 1.3,
  dusk: 0.42,
  /** The cut line: a hair-thin flash along the whole arc at peak speed. Seconds, strength, where in the cut. */
  flash: 0.055,
  flashK: 1.5,
  flashAt: 0.2,
  /** The finisher's echo: a second, fainter arc inside the first. Radius, strength, delay (s). */
  echoR: 0.76,
  echoK: 0.5,
  echoDelay: 0.04,
  /**
   * How much of her own movement the laid arc keeps up with (0 = it stays in the world where it
   * was cut, 1 = it is fixed to her). Left in the world, a fall or a glide leaves it behind in two
   * frames and she flies through it.
   */
  follow: 0.9,
} as const;

/** What the trail needs from a stroke (rig.ts `Stroke`). */
export interface TrailStroke {
  reach: number;
  thick: number;
  show: number;
}

const TRAIL_CAP = 72;
const tv = { x: 0, y: 0 };

/**
 * The blade's trail: a ribbon swept by the blade itself. While a cut runs, the owner calls `lay`
 * each frame with her chest and how far the cut has got; the trail asks the rig where the blade's
 * point was at each step between (so it has the stroke's true shape whatever the frame rate), and
 * keeps those samples where they were laid in the world. Tapered to a point at both ends, a
 * hair-thin bright leading edge, a soft translucent body inside it that thins and fades from the
 * tail, cool at the tail to warm at the blade, a thin dusk line outside. The finisher adds an echo.
 */
export class BladeTrail {
  private readonly ox = new Float32Array(TRAIL_CAP);
  private readonly oy = new Float32Array(TRAIL_CAP);
  private readonly dx = new Float32Array(TRAIL_CAP);
  private readonly dy = new Float32Array(TRAIL_CAP);
  private readonly q = new Float32Array(TRAIL_CAP);
  private readonly age = new Float32Array(TRAIL_CAP);
  private readonly th = new Float32Array(TRAIL_CAP);
  private readonly wx = new Float32Array(TRAIL_CAP);
  private readonly wy = new Float32Array(TRAIL_CAP);
  private flashX = 0;
  private pinned = false;
  private flashY = 0;
  private n = 0;
  private st: TrailStroke = { reach: 110, thick: 0.4, show: 0.2 };
  private heavy = false;
  private lastQ = -1;
  private lastX = 0;
  private lastY = 0;
  private flashT = 9;
  private flashN = 0;
  private readonly fx = new Float32Array(24);
  private readonly fy = new Float32Array(24);

  /**
   * The cut struck something: from here the arc stays in the world where it landed (she may be
   * thrown back or bounce away; the cut belongs to what it hit).
   */
  pin(): void {
    if (this.pinned) return;
    const fk = TRAIL.follow;
    for (let i = 0; i < this.n; i++) {
      this.ox[i]! += (this.lastX - this.ox[i]!) * fk;
      this.oy[i]! += (this.lastY - this.oy[i]!) * fk;
    }
    this.pinned = true;
  }

  clear(): void {
    this.n = 0;
    this.pinned = false;
    this.lastQ = -1;
    this.flashT = 9;
  }

  /** A new cut begins: the last trail (nearly gone by now) is dropped. */
  begin(st: TrailStroke, heavy: boolean): void {
    this.clear();
    this.st = st;
    this.heavy = heavy;
  }

  /**
   * The cut has reached `q` (0..1) with her chest at (px, py). `at(q, out)` gives the blade point's
   * unit offset at any fraction of the cut.
   */
  lay(px: number, py: number, q: number, at: (q: number, out: { x: number; y: number }) => void): void {
    if (q <= this.lastQ) return;
    const q0 = this.lastQ < 0 ? 0 : this.lastQ;
    const first = this.lastQ < 0;
    const x0 = first ? px : this.lastX;
    const y0 = first ? py : this.lastY;
    const steps = Math.max(1, Math.ceil((q - q0) * TRAIL.perCut));
    for (let i = first ? 0 : 1; i <= steps && this.n < TRAIL_CAP; i++) {
      const k = i / steps;
      const qq = q0 + (q - q0) * k;
      at(qq, tv);
      const n = this.n++;
      this.ox[n] = x0 + (px - x0) * k;
      this.oy[n] = y0 + (py - y0) * k;
      this.dx[n] = tv.x;
      this.dy[n] = tv.y;
      this.q[n] = qq;
      // Laid part-way through the frame: already that much older.
      this.age[n] = 0;
    }
    // The cut line: the whole arc at once, the instant the blade is at full speed.
    if (q0 < TRAIL.flashAt && q >= TRAIL.flashAt) {
      this.flashT = 0;
      this.flashX = px;
      this.flashY = py;
      this.flashN = this.fx.length;
      for (let i = 0; i < this.flashN; i++) {
        at(this.st.show + (1 - this.st.show) * (i / (this.flashN - 1)), tv);
        this.fx[i] = px + tv.x * this.st.reach * 1.012;
        this.fy[i] = py + tv.y * this.st.reach * 1.012;
      }
    }
    this.lastQ = q;
    this.lastX = px;
    this.lastY = py;
  }

  /** `held`: the sim's hitstop. The cut hangs in the air with her. */
  update(dt: number, held: boolean): void {
    if (held || dt <= 0) return;
    this.flashT += dt;
    for (let i = 0; i < this.n; i++) this.age[i]! += dt;
  }

  get live(): boolean {
    const life = TRAIL.life[this.heavy ? 1 : 0]!;
    return (this.n > 1 && this.age[this.n - 1]! < life + TRAIL.echoDelay) || this.flashT < TRAIL.flash;
  }

  /** (cx, cy) = her chest now: the laid arc is carried along with her (`TRAIL.follow`). */
  draw(p: Painter, cx: number, cy: number): void {
    if (!this.live) return;
    const fk = this.pinned ? 0 : TRAIL.follow;
    const sx = (cx - this.lastX) * fk;
    const sy = (cy - this.lastY) * fk;
    for (let i = 0; i < this.n; i++) {
      this.wx[i] = this.ox[i]! + (this.lastX - this.ox[i]!) * fk + sx;
      this.wy[i] = this.oy[i]! + (this.lastY - this.oy[i]!) * fk + sy;
    }
    if (this.n > 2) {
      this.arc(p, 1, 1, 0);
      if (this.heavy) this.arc(p, TRAIL.echoR, TRAIL.echoK, TRAIL.echoDelay);
    }
    if (this.flashT < TRAIL.flash) {
      const k = 1 - this.flashT / TRAIL.flash;
      const n = this.flashN;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const e = Math.sin(Math.PI * t ** 0.7);
        p.px[i] = this.fx[i]! + (cx - this.flashX) * fk;
        p.py[i] = this.fy[i]! + (cy - this.flashY) * fk;
        p.pw[i] = 0.5 + 0.55 * e;
        p.pc[i * 3] = TRAIL.flashK * k * k * e * (this.heavy ? 1.15 : 1);
      }
      p.streak(n, SLASH_WHITE);
    }
  }

  /** One swept arc at `rk` x the reach, `gain` x the strength, starting `delay` seconds late. */
  private arc(p: Painter, rk: number, gain: number, delay: number): void {
    const { px, py, pw, pc, gx, gy, gc } = p;
    const st = this.st;
    const life = TRAIL.life[this.heavy ? 1 : 0]!;
    const R = st.reach * rk;
    const n = this.n;
    const echo = rk < 1;
    const wide = TRAIL.width[this.heavy ? 1 : 0]! * (echo ? 0.34 : 1);
    const head = this.lastQ >= 1 ? 2 : this.lastQ;
    let any = 0;
    // The haze behind the crescent: outer edge in px/py, inner edge in gx/gy.
    for (let i = 0; i < n; i++) {
      const q = this.q[i]!;
      // The tail goes first.
      const a = this.age[i]! - delay + (1 - q) * life * 0.5;
      const t = sat(a / life);
      const on = a < 0 ? 0 : 1;
      const qv = sat((q - st.show) / (1 - st.show));
      // A crescent: a point at either end, fullest a little past the middle.
      // While the cut is still running the head is a short point at the blade.
      const th = Math.sin(Math.PI * qv ** 1.2) ** 0.9 * sat((head - q) / 0.14 + 0.04) ** 0.7;
      // The echo is only the last part of the arc: a shorter crescent inside the first.
      const fade = on * (1 - t) * (echo ? smoothstep(0.4, 0.66, qv) : 1);
      px[i] = this.wx[i]! + this.dx[i]! * R;
      py[i] = this.wy[i]! + this.dy[i]! * R;
      const w = st.thick * th * (echo ? 0.55 : 1);
      gx[i] = this.wx[i]! + this.dx[i]! * R * (1 - w);
      gy[i] = this.wy[i]! + this.dy[i]! * R * (1 - w);
      const cq = qv * qv;
      gc[i * 3] = TRAIL_COOL[0]! + (TRAIL_WARM[0]! - TRAIL_COOL[0]!) * cq;
      gc[i * 3 + 1] = TRAIL_COOL[1]! + (TRAIL_WARM[1]! - TRAIL_COOL[1]!) * cq;
      gc[i * 3 + 2] = TRAIL_COOL[2]! + (TRAIL_WARM[2]! - TRAIL_COOL[2]!) * cq;
      pw[i] = TRAIL.haze * gain * fade * fade;
      this.th[i] = th * fade ** 0.75;
      any = Math.max(any, fade);
    }
    if (any < 0.01) return;
    p.sweep(n, true);
    // The crescent itself: a solid pale shape whose outer edge is the blade's path. It dies by
    // thinning to a hair from the tail, not by going transparent (a faint alpha shape reads as dark
    // glass through post's hero matte).
    // Only the stretch that has any width is drawn (a zero-width ribbon still leaves a hairline).
    let i0 = 0;
    let i1 = n - 1;
    while (i0 < n && wide * R * this.th[i0]! < 0.5) i0++;
    while (i1 > i0 && wide * R * this.th[i1]! < 0.5) i1--;
    const m = i1 - i0 + 1;
    if (m < 3) return;
    const tone = TRAIL.tone * (echo ? 0.86 : 1);
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < m; k++) {
        const i = i0 + k;
        const ends = Math.min(1, k / 2, (m - 1 - k) / 2);
        const hw = ((wide * R * this.th[i]!) / 2) * ends;
        const grow = pass === 0 ? TRAIL.duskW : 0;
        px[k] = this.wx[i]! + this.dx[i]! * (R - hw);
        py[k] = this.wy[i]! + this.dy[i]! * (R - hw);
        pw[k] = hw + grow * Math.min(1, hw);
        pc[k * 3] = gc[i * 3]! * tone;
        pc[k * 3 + 1] = gc[i * 3 + 1]! * tone;
        pc[k * 3 + 2] = gc[i * 3 + 2]! * tone;
      }
      if (pass === 0) {
        // A thin dusk rim under it: on a bright backdrop the pale shape keeps an outline.
        SLASH_SHADE.alpha = TRAIL.dusk * Math.min(1, any * 2);
        p.ribbon(m, SLASH_SHADE, false, false);
      } else {
        TRAIL_SHADE.alpha = TRAIL.solid * Math.min(1, any * 2.5);
        p.ribbon(m, TRAIL_SHADE, false, false, true);
      }
    }
  }
}

/**
 * The flash where a cut lands: a tiny hot core and a thin star, its long axis along the cut
 * (dx, dy), gone in five frames. `power` 1 or 2.
 */
export function drawImpact(
  p: Painter,
  x: number,
  y: number,
  t: number,
  power: number,
  dx: number,
  dy: number,
): void {
  const life = 0.085;
  if (t < 0 || t > life) return;
  const k = 1 - t / life;
  const big = 1 + 0.45 * (power - 1);
  p.glow(x, y, 4.5 * big, SLASH_WHITE, 0.8 * k);
  const a0 = Math.atan2(dy, dx);
  for (let i = 0; i < 2; i++) {
    const a = a0 + i * (Math.PI / 2);
    const l = (15 + 13 * (1 - k)) * (i === 0 ? 1 : 0.45) * big;
    for (let q = 0; q < 5; q++) {
      const f = q / 4 - 0.5;
      p.px[q] = x + Math.cos(a) * l * 2 * f;
      p.py[q] = y + Math.sin(a) * l * 2 * f;
      p.pw[q] = 1.1 * (1 - Math.abs(f) * 2) + 0.2;
      p.pc[q * 3] = 1.3 * k * (1 - Math.abs(f) * 2);
    }
    p.streak(5, SLASH_WHITE);
  }
}
