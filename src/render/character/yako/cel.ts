// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * The cel painter: one dynamic mesh and one tiny shader that draw Yako as flat, hard-edged shapes,
 * like a frame of hand-drawn animation. No gradients: every primitive is a flat colour with a
 * one-device-pixel feather on its outline (so edges stay anti-aliased inside the post filter, at
 * any zoom). Form is built the cel way, by stacking shapes: base tone, one hard shadow shape, a
 * thin rim (a copy of the shape nudged toward the key light, drawn first), a few ink lines.
 *
 *   paths     M/L/Q/C through a transform stack (like a canvas), then `fill` / `cel`: any simple
 *             polygon, ear-clipped. `mw/lw` add raw world points.
 *   Rib       a Catmull-Rom centreline with a half-width per control point (limbs, tail, cloth),
 *             drawn as quad strips: whole, or any lateral band of it (the hard shadow side).
 *   glow, streak, soft   additive light and soft alpha blobs, in the same draw call.
 *
 * Output is premultiplied, so additive (alpha 0) and normal geometry mix in painter's order.
 */
import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Rectangle, Shader } from 'pixi.js';

export type RGB = readonly [number, number, number];

export function rgb(hex: number): RGB {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

const FLOATS = 8;
const MAX_VERTS = 40000;
const MAX_INDICES = 180000;
const MAX_PATH = 1024;

const VERT = `#version 300 es
in vec2 aPosition;
in vec4 aColor;
in vec2 aMisc;
out vec4 vColor;
out vec2 vMisc;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vColor = aColor;
  vMisc = aMisc;
}
`;

const FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vMisc;
out vec4 finalColor;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  float k = clamp(vMisc.x, 0.0, 1.0);
  float mode = vMisc.y;
  if (mode < 0.5) {
    // Flat cel colour; k is coverage (the feather).
    float a = vColor.a * k;
    finalColor = vec4(vColor.rgb * a, a);
  } else if (mode < 1.5) {
    // Additive light: k is 1 at the core, 0 at the rim. Dithered so faint halos do not band.
    float f = k * k * (0.55 + 0.45 * k);
    float n = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
    finalColor = vec4(max(vec3(0.0), vColor.rgb * (vColor.a * f) + n), 0.0);
  } else {
    // Soft alpha blob (dust).
    float a = vColor.a * k * k;
    finalColor = vec4(vColor.rgb * a, a);
  }
}
`;

const SOLID = 0;
const GLOW = 1;
const SOFT = 2;

const Q_SEG = 6;
const C_SEG = 9;

export class Cel {
  readonly mesh: Mesh<Geometry, Shader>;
  /** Feather width in world px (about one device pixel). */
  fw = 0.5;
  /** Unit vector toward the key light (screen space, y down): where rims sit. */
  lx = Math.SQRT1_2;
  ly = -Math.SQRT1_2;
  /** Every solid colour is multiplied by this (the post stage lifts darks a lot). */
  tone = 0.74;

  /** Result of `pt`. */
  X = 0;
  Y = 0;
  /**
   * Spine bend for the frame being drawn: local points are first rotated about the frame origin by
   * `warp` radians per `warpLen` units above it (so a torso drawn as one rigid shape still curls).
   */
  warp = 0;
  warpLen = 30;

  /** Scratch polyline for `streak`: positions, half-widths, intensities. */
  readonly sx = new Float32Array(128);
  readonly sy = new Float32Array(128);
  readonly sw = new Float32Array(128);
  readonly sa = new Float32Array(128);

  private readonly px = new Float32Array(MAX_PATH);
  private readonly py = new Float32Array(MAX_PATH);
  private n = 0;
  private readonly idx = new Int16Array(MAX_PATH);

  private a = 1;
  private b = 0;
  private c = 0;
  private d = 1;
  private tx = 0;
  private ty = 0;
  private readonly stack = new Float64Array(6 * 16);
  private sp = 0;

  private readonly verts = new Float32Array(MAX_VERTS * FLOATS);
  private readonly indices = new Uint16Array(MAX_INDICES);
  private readonly vbuf: Buffer;
  private readonly ibuf: Buffer;
  private nv = 0;
  private ni = 0;
  private lastNi = 0;

  constructor() {
    this.vbuf = new Buffer({ data: this.verts, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
    this.ibuf = new Buffer({ data: this.indices, usage: BufferUsage.INDEX | BufferUsage.COPY_DST });
    const stride = FLOATS * 4;
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: this.vbuf, format: 'float32x2', stride, offset: 0 },
        aColor: { buffer: this.vbuf, format: 'float32x4', stride, offset: 8 },
        aMisc: { buffer: this.vbuf, format: 'float32x2', stride, offset: 24 },
      },
      indexBuffer: this.ibuf,
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'yako-cel' }),
      resources: {},
    });
    this.mesh = new Mesh({ geometry, shader });
    this.mesh.label = 'yako';
    // Bounds would otherwise be scanned from the whole vertex buffer.
    this.mesh.boundsArea = new Rectangle(0, 0, 1, 1);
  }

  begin(): void {
    this.nv = 0;
    this.ni = 0;
    this.sp = 0;
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.tx = 0;
    this.ty = 0;
    this.warp = 0;
  }

  /** Uploads what was drawn since `begin`. `cx, cy` centre the mesh's bounds. */
  end(cx: number, cy: number): void {
    if (this.lastNi > this.ni) this.indices.fill(0, this.ni, this.lastNi);
    this.lastNi = this.ni;
    this.vbuf.update(Math.max(1, this.nv) * FLOATS * 4);
    this.ibuf.update();
    const b = this.mesh.boundsArea;
    b.x = cx - 500;
    b.y = cy - 500;
    b.width = 1000;
    b.height = 1000;
  }

  get vertexCount(): number {
    return this.nv;
  }

  private full(extraV: number, extraI: number): boolean {
    return this.nv + extraV > MAX_VERTS || this.ni + extraI > MAX_INDICES;
  }

  private vert(x: number, y: number, c: RGB, a: number, k: number, mode: number, tone: number): number {
    const v = this.verts;
    let o = this.nv * FLOATS;
    v[o++] = x;
    v[o++] = y;
    v[o++] = c[0] * tone;
    v[o++] = c[1] * tone;
    v[o++] = c[2] * tone;
    v[o++] = a;
    v[o++] = k;
    v[o] = mode;
    return this.nv++;
  }

  private tri(a: number, b: number, c: number): void {
    const i = this.indices;
    i[this.ni++] = a;
    i[this.ni++] = b;
    i[this.ni++] = c;
  }

  private quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  // --- Transform stack.

  /** Replaces the whole stack with this matrix (x' = a x + c y + tx, y' = b x + d y + ty). */
  base(a: number, b: number, c: number, d: number, tx: number, ty: number): void {
    this.sp = 0;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
  }

  push(x: number, y: number, rot = 0, sx = 1, sy = sx): void {
    const s = this.stack;
    let o = this.sp * 6;
    s[o++] = this.a;
    s[o++] = this.b;
    s[o++] = this.c;
    s[o++] = this.d;
    s[o++] = this.tx;
    s[o] = this.ty;
    this.sp++;
    const { a, b, c, d } = this;
    const co = Math.cos(rot);
    const si = Math.sin(rot);
    const la = co * sx;
    const lb = si * sx;
    const lc = -si * sy;
    const ld = co * sy;
    this.tx = a * x + c * y + this.tx;
    this.ty = b * x + d * y + this.ty;
    this.a = a * la + c * lb;
    this.b = b * la + d * lb;
    this.c = a * lc + c * ld;
    this.d = b * lc + d * ld;
  }

  pop(): void {
    if (this.sp <= 0) return;
    this.sp--;
    const s = this.stack;
    let o = this.sp * 6;
    this.a = s[o++]!;
    this.b = s[o++]!;
    this.c = s[o++]!;
    this.d = s[o++]!;
    this.tx = s[o++]!;
    this.ty = s[o]!;
    this.warp = 0;
  }

  /** Local point -> world, into X/Y. */
  pt(x: number, y: number): void {
    if (this.warp !== 0) {
      const t = -y / this.warpLen;
      const ang = this.warp * (t < 0 ? 0 : t > 1.3 ? 1.3 : t);
      const co = Math.cos(ang);
      const si = Math.sin(ang);
      const wx = x * co - y * si;
      y = x * si + y * co;
      x = wx;
    }
    this.X = this.a * x + this.c * y + this.tx;
    this.Y = this.b * x + this.d * y + this.ty;
  }

  /** True when the current frame is mirrored (facing left). */
  get flipped(): boolean {
    return this.a * this.d - this.b * this.c < 0;
  }

  // --- Paths.

  /** Starts a path with a raw world point. */
  mw(x: number, y: number): this {
    this.n = 0;
    return this.lw(x, y);
  }

  lw(x: number, y: number): this {
    if (this.n < MAX_PATH) {
      this.px[this.n] = x;
      this.py[this.n] = y;
      this.n++;
    }
    return this;
  }

  M(x: number, y: number): this {
    this.pt(x, y);
    return this.mw(this.X, this.Y);
  }

  L(x: number, y: number): this {
    this.pt(x, y);
    return this.lw(this.X, this.Y);
  }

  Q(cx: number, cy: number, x: number, y: number): this {
    const x0 = this.px[this.n - 1]!;
    const y0 = this.py[this.n - 1]!;
    this.pt(cx, cy);
    const x1 = this.X;
    const y1 = this.Y;
    this.pt(x, y);
    const x2 = this.X;
    const y2 = this.Y;
    for (let i = 1; i <= Q_SEG; i++) {
      const t = i / Q_SEG;
      const u = 1 - t;
      this.lw(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
    }
    return this;
  }

  C(ax: number, ay: number, bx: number, by: number, x: number, y: number): this {
    const x0 = this.px[this.n - 1]!;
    const y0 = this.py[this.n - 1]!;
    this.pt(ax, ay);
    const x1 = this.X;
    const y1 = this.Y;
    this.pt(bx, by);
    const x2 = this.X;
    const y2 = this.Y;
    this.pt(x, y);
    const x3 = this.X;
    const y3 = this.Y;
    for (let i = 1; i <= C_SEG; i++) {
      const t = i / C_SEG;
      const u = 1 - t;
      const b0 = u * u * u;
      const b1 = 3 * u * u * t;
      const b2 = 3 * u * t * t;
      const b3 = t * t * t;
      this.lw(b0 * x0 + b1 * x1 + b2 * x2 + b3 * x3, b0 * y0 + b1 * y1 + b2 * y2 + b3 * y3);
    }
    return this;
  }

  /** Fills the current path flat. (ox, oy) nudges it in world px (the rim pass). */
  fill(col: RGB, alpha = 1, ox = 0, oy = 0): void {
    const { px, py, idx, fw } = this;
    // Drop repeated points (and the closing one).
    let n = 0;
    for (let i = 0; i < this.n; i++) {
      if (n > 0 && Math.abs(px[i]! - px[n - 1]!) < 1e-3 && Math.abs(py[i]! - py[n - 1]!) < 1e-3) continue;
      px[n] = px[i]!;
      py[n] = py[i]!;
      n++;
    }
    while (n > 2 && Math.abs(px[0]! - px[n - 1]!) < 1e-3 && Math.abs(py[0]! - py[n - 1]!) < 1e-3) n--;
    this.n = n;
    if (n < 3 || this.full(n * 2, n * 9)) return;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 < n ? i + 1 : 0;
      area += px[i]! * py[j]! - px[j]! * py[i]!;
    }
    if (Math.abs(area) < 1e-6) return;
    const orient = area > 0 ? 1 : -1;
    const tone = this.tone;
    const base = this.nv;
    // Outline: the point itself (covered) and a feather point pushed out along the mitred normal.
    for (let i = 0; i < n; i++) {
      const i0 = i > 0 ? i - 1 : n - 1;
      const i1 = i + 1 < n ? i + 1 : 0;
      let ax = px[i]! - px[i0]!;
      let ay = py[i]! - py[i0]!;
      let bx = px[i1]! - px[i]!;
      let by = py[i1]! - py[i]!;
      const al = Math.hypot(ax, ay) || 1;
      const bl = Math.hypot(bx, by) || 1;
      ax /= al;
      ay /= al;
      bx /= bl;
      by /= bl;
      const n1x = ay * orient;
      const n1y = -ax * orient;
      let nx = n1x + by * orient;
      let ny = n1y - bx * orient;
      const nl = Math.hypot(nx, ny);
      if (nl < 1e-4) {
        nx = n1x;
        ny = n1y;
      } else {
        nx /= nl;
        ny /= nl;
      }
      const cosHalf = nx * n1x + ny * n1y;
      const m = fw / (cosHalf > 0.4 ? cosHalf : 0.4);
      const x = px[i]! + ox;
      const y = py[i]! + oy;
      this.vert(x, y, col, alpha, 1, SOLID, tone);
      this.vert(x + nx * m, y + ny * m, col, alpha, 0, SOLID, tone);
    }
    for (let i = 0; i < n; i++) {
      const j = i + 1 < n ? i + 1 : 0;
      this.quad(base + i * 2, base + i * 2 + 1, base + j * 2 + 1, base + j * 2);
    }
    // Ear clipping.
    for (let i = 0; i < n; i++) idx[i] = i;
    let cnt = n;
    let at = 0;
    let guard = n * n + 8;
    while (cnt > 3 && guard-- > 0) {
      let found = -1;
      for (let k = 0; k < cnt; k++) {
        const i = (at + k) % cnt;
        const ia = idx[i > 0 ? i - 1 : cnt - 1]!;
        const ib = idx[i]!;
        const ic = idx[i + 1 < cnt ? i + 1 : 0]!;
        const ax = px[ia]!;
        const ay = py[ia]!;
        const bx = px[ib]!;
        const by = py[ib]!;
        const cx = px[ic]!;
        const cy = py[ic]!;
        const cross = ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) * orient;
        if (cross <= 1e-7) {
          // Reflex, or flat: a flat corner can go at once.
          if (cross > -1e-7) {
            found = i;
            break;
          }
          continue;
        }
        let ok = true;
        for (let q = 0; q < cnt; q++) {
          const iq = idx[q]!;
          if (iq === ia || iq === ib || iq === ic) continue;
          const qx = px[iq]!;
          const qy = py[iq]!;
          const d1 = ((bx - ax) * (qy - ay) - (by - ay) * (qx - ax)) * orient;
          if (d1 < 1e-7) continue;
          const d2 = ((cx - bx) * (qy - by) - (cy - by) * (qx - bx)) * orient;
          if (d2 < 1e-7) continue;
          const d3 = ((ax - cx) * (qy - cy) - (ay - cy) * (qx - cx)) * orient;
          if (d3 < 1e-7) continue;
          ok = false;
          break;
        }
        if (ok) {
          found = i;
          break;
        }
      }
      if (found < 0) found = at % cnt;
      const ia = idx[found > 0 ? found - 1 : cnt - 1]!;
      const ib = idx[found]!;
      const ic = idx[found + 1 < cnt ? found + 1 : 0]!;
      this.tri(base + ia * 2, base + ib * 2, base + ic * 2);
      for (let q = found; q < cnt - 1; q++) idx[q] = idx[q + 1]!;
      cnt--;
      at = found > 0 ? found - 1 : 0;
    }
    if (cnt === 3) this.tri(base + idx[0]! * 2, base + idx[1]! * 2, base + idx[2]! * 2);
  }

  /** Width of a rim in world px: the authored width, but never thinner than about a device pixel. */
  rimW(w: number): number {
    const min = this.fw * 1.15;
    return w > min ? w : min;
  }

  /** Flat cel shape with an optional rim: a copy nudged toward the key light, laid first. */
  cel(col: RGB, rim: RGB | null = null, rw = 0.6): void {
    if (rim) {
      const w = this.rimW(rw);
      const n = this.n;
      this.fill(rim, 1, this.lx * w, this.ly * w);
      this.n = n;
    }
    this.fill(col);
  }

  /** A filled disc at a local point; `r` in world px. */
  dot(x: number, y: number, r: number, col: RGB, alpha = 1): void {
    this.pt(x, y);
    this.dotw(this.X, this.Y, r, col, alpha);
  }

  dotw(x: number, y: number, r: number, col: RGB, alpha = 1): void {
    const SEG = 10;
    this.n = 0;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      this.lw(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    this.fill(col, alpha);
  }

  /**
   * A quad strip between two polylines of `m` samples (left = lx/ly, right = rx/ry), flat colour,
   * feathered along both sides.
   */
  strip(
    m: number,
    lx: Float32Array,
    ly: Float32Array,
    rx: Float32Array,
    ry: Float32Array,
    col: RGB,
    alpha: number,
    ox: number,
    oy: number,
  ): void {
    if (m < 2 || this.full(m * 4, m * 18)) return;
    const fw = this.fw;
    const tone = this.tone;
    let prev = -1;
    let px = 0;
    let py = -1;
    for (let i = 0; i < m; i++) {
      // Across direction; where the strip pinches to a point, use the path's normal instead.
      let ax = lx[i]! - rx[i]!;
      let ay = ly[i]! - ry[i]!;
      const al = Math.hypot(ax, ay);
      if (al > 1e-3) {
        ax /= al;
        ay /= al;
      } else {
        const i0 = i > 0 ? i - 1 : 0;
        const i1 = i < m - 1 ? i + 1 : m - 1;
        const tx = lx[i1]! + rx[i1]! - lx[i0]! - rx[i0]!;
        const ty = ly[i1]! + ry[i1]! - ly[i0]! - ry[i0]!;
        const tl = Math.hypot(tx, ty);
        if (tl > 1e-3) {
          ax = -ty / tl;
          ay = tx / tl;
          if (ax * px + ay * py < 0) {
            ax = -ax;
            ay = -ay;
          }
        } else {
          ax = px;
          ay = py;
        }
      }
      px = ax;
      py = ay;
      const v0 = this.vert(lx[i]! + ox + ax * fw, ly[i]! + oy + ay * fw, col, alpha, 0, SOLID, tone);
      this.vert(lx[i]! + ox, ly[i]! + oy, col, alpha, 1, SOLID, tone);
      this.vert(rx[i]! + ox, ry[i]! + oy, col, alpha, 1, SOLID, tone);
      this.vert(rx[i]! + ox - ax * fw, ry[i]! + oy - ay * fw, col, alpha, 0, SOLID, tone);
      if (prev >= 0) {
        this.quad(prev, prev + 1, v0 + 1, v0);
        this.quad(prev + 1, prev + 2, v0 + 2, v0 + 1);
        this.quad(prev + 2, prev + 3, v0 + 3, v0 + 2);
      }
      prev = v0;
    }
  }

  // --- Light.

  private fan(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rot: number,
    c: RGB,
    a: number,
    mode: number,
    seg: number,
  ): void {
    if (a <= 0.002 || this.full(seg + 1, seg * 3)) return;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const centre = this.vert(x, y, c, a, 1, mode, 1);
    for (let i = 0; i < seg; i++) {
      const ang = (i / seg) * Math.PI * 2;
      const ex = Math.cos(ang) * rx;
      const ey = Math.sin(ang) * ry;
      this.vert(x + ex * cr - ey * sr, y + ex * sr + ey * cr, c, a, 0, mode, 1);
    }
    for (let i = 0; i < seg; i++) this.tri(centre, centre + 1 + i, centre + 1 + ((i + 1) % seg));
  }

  /** Additive radial glow (world px). */
  glow(x: number, y: number, r: number, c: RGB, intensity: number, ry = r, rot = 0): void {
    this.fan(x, y, r, ry, rot, c, intensity, GLOW, 24);
  }

  /** Soft alpha blob (dust). */
  soft(x: number, y: number, rx: number, ry: number, c: RGB, alpha: number): void {
    this.fan(x, y, rx, ry, 0, c, alpha, SOFT, 18);
  }

  /** Additive streak along sx/sy with half-widths sw and intensities sa, brightest on its centre line. */
  streak(n: number, c: RGB): void {
    if (n < 2 || this.full(n * 3, n * 12)) return;
    const { sx, sy, sw, sa } = this;
    let base = -1;
    for (let i = 0; i < n; i++) {
      const i0 = i > 0 ? i - 1 : 0;
      const i1 = i < n - 1 ? i + 1 : n - 1;
      let tx = sx[i1]! - sx[i0]!;
      let ty = sy[i1]! - sy[i0]!;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty * sw[i]!;
      const ny = tx * sw[i]!;
      const a = sa[i]!;
      const v0 = this.vert(sx[i]! + nx, sy[i]! + ny, c, a, 0, GLOW, 1);
      this.vert(sx[i]!, sy[i]!, c, a, 1, GLOW, 1);
      this.vert(sx[i]! - nx, sy[i]! - ny, c, a, 0, GLOW, 1);
      if (base >= 0) {
        this.quad(base, base + 1, v0 + 1, v0);
        this.quad(base + 1, base + 2, v0 + 2, v0 + 1);
      }
      base = v0;
    }
  }
}

const MAX_CTRL = 24;
const MAX_SAMP = 160;

/**
 * A ribbon in world space: a Catmull-Rom centreline through control points with a half-width at
 * each. `s` runs along it in control-point units (0 .. end), `u` across it (-1 .. 1). Reusable:
 * `clear`, `add` the control points, `build`, then draw bands of it.
 */
export class Rib {
  private readonly cx = new Float32Array(MAX_CTRL);
  private readonly cy = new Float32Array(MAX_CTRL);
  private readonly cw = new Float32Array(MAX_CTRL);
  private nc = 0;
  private readonly x = new Float32Array(MAX_SAMP);
  private readonly y = new Float32Array(MAX_SAMP);
  private readonly nx = new Float32Array(MAX_SAMP);
  private readonly ny = new Float32Array(MAX_SAMP);
  private readonly w = new Float32Array(MAX_SAMP);
  private m = 0;
  private sub = 6;
  /** Highest valid `s`. */
  end = 0;
  /** Result of `at`. */
  X = 0;
  Y = 0;
  private readonly lx = new Float32Array(MAX_SAMP);
  private readonly ly = new Float32Array(MAX_SAMP);
  private readonly rx = new Float32Array(MAX_SAMP);
  private readonly ry = new Float32Array(MAX_SAMP);

  clear(): this {
    this.nc = 0;
    return this;
  }

  /** Adds a control point (world px) with its half-width. */
  add(x: number, y: number, w: number): this {
    if (this.nc < MAX_CTRL) {
      this.cx[this.nc] = x;
      this.cy[this.nc] = y;
      this.cw[this.nc] = w;
      this.nc++;
    }
    return this;
  }

  /** Adds the pen's transform of a local point; the width is scaled by `ws`. */
  addP(p: Cel, x: number, y: number, w: number): this {
    p.pt(x, y);
    return this.add(p.X, p.Y, w);
  }

  build(sub = 6): this {
    const n = this.nc;
    const { cx, cy, cw, x, y, w, nx, ny } = this;
    if (n < 2) {
      this.m = 0;
      this.end = 0;
      return this;
    }
    if ((n - 1) * sub + 1 > MAX_SAMP) sub = Math.max(1, Math.floor((MAX_SAMP - 1) / (n - 1)));
    this.sub = sub;
    let m = 0;
    for (let i = 0; i < n - 1; i++) {
      const i0 = i > 0 ? i - 1 : 0;
      const i2 = i + 1;
      const i3 = i + 2 < n ? i + 2 : n - 1;
      for (let k = 0; k < sub; k++) {
        const f = k / sub;
        x[m] = cr(cx[i0]!, cx[i]!, cx[i2]!, cx[i3]!, f);
        y[m] = cr(cy[i0]!, cy[i]!, cy[i2]!, cy[i3]!, f);
        const ww = cr(cw[i0]!, cw[i]!, cw[i2]!, cw[i3]!, f);
        w[m] = ww > 0 ? ww : 0;
        m++;
      }
    }
    x[m] = cx[n - 1]!;
    y[m] = cy[n - 1]!;
    w[m] = cw[n - 1]!;
    m++;
    for (let i = 0; i < m; i++) {
      const a = i > 0 ? i - 1 : 0;
      const b = i < m - 1 ? i + 1 : m - 1;
      const tx = x[b]! - x[a]!;
      const ty = y[b]! - y[a]!;
      const l = Math.hypot(tx, ty) || 1;
      nx[i] = -ty / l;
      ny[i] = tx / l;
    }
    this.m = m;
    this.end = n - 1;
    return this;
  }

  /** Point at `s` along and `u` across, into X/Y. */
  at(s: number, u: number): void {
    const { x, y, nx, ny, w } = this;
    const last = this.m - 1;
    let f = s * this.sub;
    if (f < 0) f = 0;
    else if (f > last) f = last;
    let i = Math.floor(f);
    if (i > last - 1) i = last - 1;
    if (i < 0) i = 0;
    const k = f - i;
    const ww = (w[i]! + (w[i + 1]! - w[i]!) * k) * u;
    this.X = x[i]! + (x[i + 1]! - x[i]!) * k + (nx[i]! + (nx[i + 1]! - nx[i]!) * k) * ww;
    this.Y = y[i]! + (y[i + 1]! - y[i]!) * k + (ny[i]! + (ny[i + 1]! - ny[i]!) * k) * ww;
  }

  /** +1 if the +u side faces away from the light (lx, ly), else -1: which side the shadow goes. */
  shade(p: Cel): number {
    let d = 0;
    for (let i = 0; i < this.m; i++) d += this.nx[i]! * p.lx + this.ny[i]! * p.ly;
    return d < 0 ? 1 : -1;
  }

  /**
   * Draws the band between lateral positions ua and ub(s) = ub + amp * sin(s * freq + ph), from
   * s0 to s1. (ox, oy) nudges it in world px.
   */
  band(
    p: Cel,
    col: RGB,
    alpha = 1,
    s0 = 0,
    s1 = this.end,
    ua = -1,
    ub = 1,
    amp = 0,
    freq = 0,
    ph = 0,
    ox = 0,
    oy = 0,
  ): void {
    if (this.m < 2 || s1 <= s0) return;
    let steps = Math.ceil((s1 - s0) * this.sub);
    if (steps < 1) steps = 1;
    if (steps > MAX_SAMP - 1) steps = MAX_SAMP - 1;
    for (let k = 0; k <= steps; k++) {
      const s = s0 + ((s1 - s0) * k) / steps;
      this.at(s, ua);
      this.lx[k] = this.X;
      this.ly[k] = this.Y;
      this.at(s, amp !== 0 ? ub + amp * Math.sin(s * freq + ph) : ub);
      this.rx[k] = this.X;
      this.ry[k] = this.Y;
    }
    p.strip(steps + 1, this.lx, this.ly, this.rx, this.ry, col, alpha, ox, oy);
  }

  /**
   * Base tone, optional rim, and one hard shadow band on the side away from the light. The
   * terminator sits at t0 + t1 * sin(s * freq + ph) (0 = the centreline, 1 = no shadow).
   */
  cel(
    p: Cel,
    base: RGB,
    shadow: RGB,
    rim: RGB | null,
    rw: number,
    t0: number,
    t1 = 0,
    freq = 0,
    ph = 0,
    s0 = 0,
    s1 = this.end,
  ): void {
    if (rim) {
      const w = p.rimW(rw);
      this.band(p, rim, 1, s0, s1, -1, 1, 0, 0, 0, p.lx * w, p.ly * w);
    }
    this.band(p, base, 1, s0, s1);
    const sh = this.shade(p);
    this.band(p, shadow, 1, s0, s1, sh, sh * t0, sh * t1, freq, ph);
  }
}

function cr(a: number, b: number, c: number, d: number, k: number): number {
  return (
    0.5 * (2 * b + (c - a) * k + (2 * a - 5 * b + 4 * c - d) * k * k + (3 * b - a - 3 * c + d) * k * k * k)
  );
}
