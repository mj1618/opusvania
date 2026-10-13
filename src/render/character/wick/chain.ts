// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Secondary-motion chains (a copy of ../hooded/chain.ts plus soft body colliders): verlet points with length constraints,
 * pulled toward a rest shape so they hold a designed silhouette at rest but lag, overshoot and
 * settle when the body moves.
 *
 * Two pulls per node, both per fixed sub-step:
 *   global  toward where the node would sit if the chain were rigid in its rest shape (holds the
 *           overall pose, strongest at the root)
 *   local   toward the rest bend relative to the previous segment as it actually is (lets waves
 *           travel down the chain: follow-through)
 * Drag is relative to still air, so a moving body streams its chains behind it.
 *
 * Angles are in the character's "forward frame": degrees from the facing direction toward up
 * (0 = forward, 90 = up, 180 = back, 270 = down). `d` (-1..1, the body's turn factor) mirrors
 * them on screen and passes through 0 mid-turn.
 *
 * Simulated at a fixed 120 Hz with an accumulator; rendered positions are extrapolated by the
 * leftover time so the chain neither lags nor jitters at any refresh rate.
 */
import { wind } from '../../scene/lib/look';

export interface ChainSpec {
  /** Segment lengths (world px); node count = lengths + 1. */
  len: readonly number[];
  /** Rest angle of each segment, forward-frame degrees. */
  rest: readonly number[];
  /** Global-shape stiffness at the first and last node (per sub-step, 0..1). */
  kG: readonly [number, number];
  /** Local-bend stiffness at the first and last node. */
  kL: readonly [number, number];
  /** Velocity kept per sub-step is 1 - drag. */
  drag: number;
  /** Downward acceleration, px/s². */
  gravity: number;
  /** Ambient wind push at the tip, px/s². */
  wind: number;
}

const H = 1 / 120;
const MAX_STEPS = 10;
const DEG = Math.PI / 180;

export class Chain {
  readonly n: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  private readonly ox: Float32Array;
  private readonly oy: Float32Array;
  /** Rendered (extrapolated) positions. */
  readonly rx: Float32Array;
  readonly ry: Float32Array;
  private readonly rest: Float32Array;
  private readonly len: Float32Array;
  private acc = 0;

  // --- Per-frame inputs, set by the owner before `advance`.
  /** Anchor (root node) in world px. */
  ax = 0;
  ay = 0;
  /** Tilt of the root frame: radians the "up" axis leans forward. */
  rot = 0;
  /** Turn factor -1..1. */
  d = 1;
  /** Sideways splay added to every segment direction (screen x). */
  lat = 0;
  /** Added to every rest angle (radians, + = toward up/back... i.e. counter-clockwise in the forward frame). */
  lift = 0;
  /** Extra bend per segment (radians), accumulating down the chain: curls or straightens it. */
  curl = 0;
  /** Scales both stiffnesses (pin a chain back hard in a dash: > 1). */
  stiff = 1;
  /** Nodes are kept above this y (the ground) and on the open side of the wall. */
  floorY = Number.POSITIVE_INFINITY;
  wallX = 0;
  wallSide = 0;
  /** Per-chain wind phase 0..1. */
  phase = 0;
  /**
   * Soft body colliders shared by the owner: (x, y, radius) triples in world px, `colN` of them.
   * Nodes from `colFrom` on are eased out of them (not snapped), so cloth lies on the body
   * instead of passing through it and never jitters against it.
   */
  col: Float32Array | null = null;
  colN = 0;
  colFrom = 2;
  /** Side the cloth prefers to leave a collider by when it is dead centre: screen x sign. */
  colSide = -1;

  private pax = 0;
  private pay = 0;
  private fresh = true;

  constructor(readonly spec: ChainSpec) {
    this.n = spec.len.length + 1;
    const n = this.n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.ox = new Float32Array(n);
    this.oy = new Float32Array(n);
    this.rx = new Float32Array(n);
    this.ry = new Float32Array(n);
    this.rest = new Float32Array(n);
    this.len = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      this.rest[i] = (spec.rest[i - 1] ?? 0) * DEG;
      this.len[i] = spec.len[i - 1] ?? 1;
    }
  }

  /** Next `advance` lays the chain out in its rest shape at the anchor, at rest. */
  reset(): void {
    this.fresh = true;
  }

  /** Unit screen direction of segment i's rest pose. */
  private dirX = 0;
  private dirY = 0;
  private restDir(i: number): void {
    const a = this.rest[i]! + this.lift + this.curl * (i - 1) - this.rot;
    let dx = Math.cos(a) * this.d + this.lat;
    let dy = -Math.sin(a);
    const l = Math.hypot(dx, dy);
    if (l < 1e-3) {
      dx = 0;
      dy = -1;
    } else {
      dx /= l;
      dy /= l;
    }
    this.dirX = dx;
    this.dirY = dy;
  }

  private layout(): void {
    const { x, y, ox, oy, n } = this;
    x[0] = this.ax;
    y[0] = this.ay;
    for (let i = 1; i < n; i++) {
      this.restDir(i);
      x[i] = x[i - 1]! + this.dirX * this.len[i]!;
      y[i] = Math.min(this.floorY, y[i - 1]! + this.dirY * this.len[i]!);
    }
    for (let i = 0; i < n; i++) {
      ox[i] = x[i]!;
      oy[i] = y[i]!;
    }
    this.pax = this.ax;
    this.pay = this.ay;
    this.acc = 0;
  }

  advance(dt: number, clock: number): void {
    if (this.fresh) {
      this.fresh = false;
      this.layout();
    }
    const total = this.acc + dt;
    let steps = Math.floor(total / H + 1e-4);
    if (steps > MAX_STEPS) steps = MAX_STEPS;
    const dax = this.ax - this.pax;
    const day = this.ay - this.pay;
    for (let k = 1; k <= steps; k++) {
      const f = dt > 0 ? Math.min(1, Math.max(0, (k * H - this.acc) / dt)) : 1;
      this.sub(this.pax + dax * f, this.pay + day * f, clock - dt + dt * f);
    }
    this.acc = Math.max(0, Math.min(H, total - steps * H));
    this.pax = this.ax;
    this.pay = this.ay;
    // Extrapolate by the leftover time; the root is always exactly on the anchor.
    const a = this.acc / H;
    const { x, y, ox, oy, rx, ry, n } = this;
    rx[0] = this.ax;
    ry[0] = this.ay;
    for (let i = 1; i < n; i++) {
      rx[i] = x[i]! + (x[i]! - ox[i]!) * a;
      ry[i] = Math.min(this.floorY, y[i]! + (y[i]! - oy[i]!) * a);
    }
  }

  private sub(ax: number, ay: number, clock: number): void {
    const { x, y, ox, oy, n, len, spec } = this;
    const keep = 1 - spec.drag;
    const g = spec.gravity * H * H;
    const last = n - 1;
    x[0] = ax;
    y[0] = ay;
    ox[0] = ax;
    oy[0] = ay;
    // Integrate.
    for (let i = 1; i < n; i++) {
      const t = i / last;
      const vx = (x[i]! - ox[i]!) * keep;
      const vy = (y[i]! - oy[i]!) * keep;
      ox[i] = x[i]!;
      oy[i] = y[i]!;
      const w = wind(x[i]!, clock, this.phase + t * 0.15) * spec.wind * t * H * H;
      x[i]! += vx + w;
      y[i]! += vy + g + w * 0.25;
    }
    // Shape pulls. The global target chain is laid out from the anchor as it goes.
    let gx = ax;
    let gy = ay;
    let pdx = 0;
    let pdy = -1;
    const turn = this.d < -1 ? -1 : this.d > 1 ? 1 : this.d;
    for (let i = 1; i < n; i++) {
      const t = (i - 1) / Math.max(1, last - 1);
      const kG = Math.min(0.9, (spec.kG[0]! + (spec.kG[1]! - spec.kG[0]!) * t) * this.stiff);
      const kL = Math.min(0.9, (spec.kL[0]! + (spec.kL[1]! - spec.kL[0]!) * t) * this.stiff);
      this.restDir(i);
      gx += this.dirX * len[i]!;
      gy += this.dirY * len[i]!;
      let lx: number;
      let ly: number;
      if (i === 1) {
        lx = ax + this.dirX * len[i]!;
        ly = ay + this.dirY * len[i]!;
      } else {
        // Rest bend relative to the previous segment as it really is.
        const bend = -(this.rest[i]! - this.rest[i - 1]! + this.curl) * turn;
        const c = Math.cos(bend);
        const s = Math.sin(bend);
        lx = x[i - 1]! + (pdx * c - pdy * s) * len[i]!;
        ly = y[i - 1]! + (pdx * s + pdy * c) * len[i]!;
      }
      x[i]! += (gx - x[i]!) * kG + (lx - x[i]!) * kL;
      y[i]! += (gy - y[i]!) * kG + (ly - y[i]!) * kL;
      // Length constraint against the parent (the parent is already final this pass).
      let dx = x[i]! - x[i - 1]!;
      let dy = y[i]! - y[i - 1]!;
      const l = Math.hypot(dx, dy) || 1e-4;
      dx /= l;
      dy /= l;
      x[i] = x[i - 1]! + dx * len[i]!;
      y[i] = y[i - 1]! + dy * len[i]!;
      if (y[i]! > this.floorY) y[i] = this.floorY;
      if (this.wallSide !== 0 && (x[i]! - this.wallX) * this.wallSide > 0) x[i] = this.wallX;
      const col = this.col;
      if (col && i >= this.colFrom) {
        for (let c = 0; c < this.colN; c++) {
          const cx = col[c * 3]!;
          const cy = col[c * 3 + 1]!;
          const cr = col[c * 3 + 2]!;
          let ex = x[i]! - cx;
          const ey = y[i]! - cy;
          if (Math.abs(ex) < 0.01) ex = 0.01 * this.colSide;
          const dd = ex * ex + ey * ey;
          if (dd < cr * cr) {
            const dl = Math.sqrt(dd);
            const push = ((cr - dl) / dl) * 0.35;
            x[i]! += ex * push;
            y[i]! += ey * push;
          }
        }
      }
      pdx = dx;
      pdy = dy;
    }
  }
}
