// biome-ignore-all lint/style/noNonNullAssertion: typed-array maths; indices are in range by construction
/**
 * Vesper's copy of ../hooded/paint.ts with one change: the cool rim wraps the whole silhouette
 * (`coolWrap`), so every edge the warm key does not reach still carries a thin moon-light edge.
 *
 * The painter: one dynamic mesh and one small shader that draw the whole character.
 *
 * Why not Graphics: we want soft form shading, a real rim-light gradient that follows each
 * shape's edge, additive glows and feathered (anti-aliased at any zoom, with or without MSAA)
 * edges, all in one draw call. Every primitive here emits triangles with per-vertex shading data:
 *
 *   core rgba   the body colour at that point (form-shaded per vertex)
 *   rim  rgb+k  the light colour arriving at the nearest edge and how strong it is there
 *   edge        0 inside the shape .. 1 on its silhouette (the shader turns it into the rim band)
 *   cov         coverage: 1 on the shape, 0 one device pixel outside it (the feather)
 *   mode        0 solid, 1 additive glow, 2 additive ghost (afterimage), 3 soft alpha blob
 *
 * Output is premultiplied, so additive (alpha 0) and normal geometry mix in painter's order.
 */
import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Rectangle, Shader } from 'pixi.js';

export type RGB = readonly [number, number, number];

export function rgb(hex: number): RGB {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
}

/** How a solid shape is lit. */
export interface Shade {
  /** Core colour gradient: c0 at the root / top, c1 at the tip / bottom. */
  c0: RGB;
  c1: RGB;
  /** Warm key rim strength (0..1) on edges facing the key light. */
  rim: number;
  /** Cool fill strength on edges facing away from it. */
  cool: number;
  /** Form shading: how much the core brightens toward the light and darkens away from it. */
  form: number;
  /** Width of the rim band as a fraction of the half-width (ribbons) or radius (shapes). */
  band: number;
  /** How strongly the ember (second light) rims this shape. */
  ember?: number;
  alpha?: number;
}

const FLOATS = 13;
const MAX_VERTS = 20000;
const MAX_INDICES = 100000;

const VERT = `#version 300 es
in vec2 aPosition;
in vec4 aCore;
in vec4 aRim;
in vec3 aMisc;
out vec4 vCore;
out vec4 vRim;
out vec3 vMisc;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vCore = aCore;
  vRim = aRim;
  vMisc = aMisc;
}
`;

const FRAG = `#version 300 es
precision highp float;
in vec4 vCore;
in vec4 vRim;
in vec3 vMisc;
out vec4 finalColor;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  float e = clamp(vMisc.x, 0.0, 1.0);
  float cov = clamp(vMisc.y, 0.0, 1.0);
  float mode = vMisc.z;
  if (mode < 0.5) {
    // Solid: a soft falloff across the whole band plus a tighter, brighter line at the edge.
    float t = vRim.a * (0.22 * e * e + 0.78 * smoothstep(0.55, 0.95, e));
    vec3 c = mix(vCore.rgb, vRim.rgb, clamp(t, 0.0, 1.0));
    float a = vCore.a * cov;
    finalColor = vec4(c * a, a);
  } else if (mode < 1.5) {
    // Additive glow: smooth radial falloff, dithered so faint halos do not band.
    float f = 1.0 - e;
    f = f * f * (0.55 + 0.45 * f);
    float n = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
    finalColor = vec4(max(vec3(0.0), vCore.rgb * (vCore.a * f * cov) + n), 0.0);
  } else if (mode < 2.5) {
    // Ghost: an additive afterimage, brighter toward the silhouette.
    float t = 0.75 + 0.25 * e;
    finalColor = vec4(vCore.rgb * (vCore.a * t * cov), 0.0);
  } else {
    // Soft alpha blob (contact shadow, dust).
    float f = 1.0 - e;
    float a = vCore.a * f * f * cov;
    finalColor = vec4(vCore.rgb * a, a);
  }
}
`;

const SOLID = 0;
const GLOW = 1;
const GHOST = 2;
const SOFT = 3;

export class Painter {
  readonly mesh: Mesh<Geometry, Shader>;
  /** Feather width in world px (about one device pixel). */
  fw = 0.5;
  /** Unit vector toward the key light (screen space, y down). */
  lx = 0.42;
  ly = -0.91;
  keyColor: RGB = [1, 0.85, 0.63];
  coolColor: RGB = [0.35, 0.6, 0.85];
  /** 0 = the cool rim only faces the sky fill (upper left); 1 = it rings every edge evenly. */
  coolWrap = 0.5;
  /** Second light (the ember): position, reach, colour, strength. */
  l2x = 0;
  l2y = 0;
  l2r = 1;
  l2k = 0;
  l2c: RGB = [1, 0.7, 0.4];
  /** When set, solid shapes are drawn as additive ghosts of this colour and alpha. */
  ghost: RGB | null = null;
  ghostAlpha = 0;

  /** Scratch polylines for callers: fill px/py/pw (and optionally pc) then call ribbon/shape. */
  readonly px = new Float32Array(256);
  readonly py = new Float32Array(256);
  readonly pw = new Float32Array(256);
  /** Scratch grid for `grid`: positions and core colours, row-major. */
  readonly gx = new Float32Array(512);
  readonly gy = new Float32Array(512);
  readonly gc = new Float32Array(512 * 3);
  /** Optional per-sample core colours (r,g,b triples). */
  readonly pc = new Float32Array(256 * 3);

  private readonly verts = new Float32Array(MAX_VERTS * FLOATS);
  private readonly indices = new Uint16Array(MAX_INDICES);
  private readonly vbuf: Buffer;
  private readonly ibuf: Buffer;
  private nv = 0;
  private ni = 0;
  private lastNi = 0;
  // Rim scratch (set by `light`).
  private rr = 0;
  private rg = 0;
  private rb = 0;
  private rs = 0;
  private fm = 0;

  constructor() {
    this.vbuf = new Buffer({ data: this.verts, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
    this.ibuf = new Buffer({ data: this.indices, usage: BufferUsage.INDEX | BufferUsage.COPY_DST });
    const stride = FLOATS * 4;
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: this.vbuf, format: 'float32x2', stride, offset: 0 },
        aCore: { buffer: this.vbuf, format: 'float32x4', stride, offset: 8 },
        aRim: { buffer: this.vbuf, format: 'float32x4', stride, offset: 24 },
        aMisc: { buffer: this.vbuf, format: 'float32x3', stride, offset: 40 },
      },
      indexBuffer: this.ibuf,
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'vesper-character' }),
      resources: {},
    });
    this.mesh = new Mesh({ geometry, shader });
    this.mesh.label = 'ember';
    // Bounds would otherwise be scanned from the whole vertex buffer.
    this.mesh.boundsArea = new Rectangle(0, 0, 1, 1);
  }

  begin(): void {
    this.nv = 0;
    this.ni = 0;
  }

  /** Uploads what was drawn since `begin`. `cx, cy` centre the mesh's bounds. */
  end(cx: number, cy: number): void {
    // Degenerate triangles for the unused tail of the index buffer.
    if (this.lastNi > this.ni) this.indices.fill(0, this.ni, this.lastNi);
    this.lastNi = this.ni;
    this.vbuf.update(Math.max(1, this.nv) * FLOATS * 4);
    this.ibuf.update();
    const b = this.mesh.boundsArea;
    b.x = cx - 400;
    b.y = cy - 400;
    b.width = 800;
    b.height = 800;
  }

  get vertexCount(): number {
    return this.nv;
  }

  private full(): boolean {
    return this.nv > MAX_VERTS - 512 || this.ni > MAX_INDICES - 2048;
  }

  private vert(
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    a: number,
    rr: number,
    rg: number,
    rb: number,
    rs: number,
    e: number,
    cov: number,
    mode: number,
  ): number {
    const v = this.verts;
    let o = this.nv * FLOATS;
    v[o++] = x;
    v[o++] = y;
    v[o++] = r;
    v[o++] = g;
    v[o++] = b;
    v[o++] = a;
    v[o++] = rr;
    v[o++] = rg;
    v[o++] = rb;
    v[o++] = rs;
    v[o++] = e;
    v[o++] = cov;
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

  /** Light arriving at a silhouette point with outward normal (nx, ny): fills rr/rg/rb/rs and fm. */
  private light(x: number, y: number, nx: number, ny: number, s: Shade): void {
    const ndl = nx * this.lx + ny * this.ly;
    const k = ndl > 0 ? ndl : 0;
    const wKey = s.rim * k * Math.sqrt(k);
    // Cool sky fill from the upper left.
    const ndc = nx * -0.8 + ny * -0.6;
    // ... plus a wrap: some of it on every edge the key light leaves dark (undersides, lower right).
    const wCool =
      s.cool * ((1 - this.coolWrap) * (ndc > 0 ? ndc : 0) + this.coolWrap * (1 - Math.min(1, k * 1.6)));
    let wE = 0;
    const ek = (s.ember ?? 1) * this.l2k;
    if (ek > 0) {
      const ex = this.l2x - x;
      const ey = this.l2y - y;
      const d = Math.hypot(ex, ey) + 1e-3;
      if (d < this.l2r) {
        const att = 1 - d / this.l2r;
        const nde = (nx * ex + ny * ey) / d;
        // Wrap the ember light a little so nearby surfaces glow even at grazing angles.
        wE = ek * att * att * Math.max(0, nde * 0.8 + 0.2);
      }
    }
    const sum = wKey + wCool + wE;
    if (sum > 1e-4) {
      const kc = this.keyColor;
      const cc = this.coolColor;
      const ec = this.l2c;
      this.rr = (wKey * kc[0]! + wCool * cc[0]! + wE * ec[0]!) / sum;
      this.rg = (wKey * kc[1]! + wCool * cc[1]! + wE * ec[1]!) / sum;
      this.rb = (wKey * kc[2]! + wCool * cc[2]! + wE * ec[2]!) / sum;
      this.rs = sum > 1 ? 1 : sum;
    } else {
      this.rr = this.rg = this.rb = this.rs = 0;
    }
    this.fm = 1 + s.form * ndl;
  }

  /**
   * A variable-width stroke along the polyline in px/py (n samples) with half-widths pw. Core
   * colour runs c0 -> c1 along it (or per-sample from pc when `perSample`). `cap0` / `cap1` close
   * the ends with a half-disc; otherwise taper pw to 0 for a point.
   */
  ribbon(n: number, s: Shade, cap0 = false, cap1 = false, perSample = false): void {
    if (n < 2 || this.full()) return;
    const { px, py, pw, pc, fw } = this;
    const ghost = this.ghost;
    const mode = ghost ? GHOST : SOLID;
    const alpha = ghost ? this.ghostAlpha : (s.alpha ?? 1);
    const band = s.band;
    let base = -1;
    let nx0 = 0;
    let ny0 = 0;
    let nx1 = 0;
    let ny1 = 0;
    for (let i = 0; i < n; i++) {
      const i0 = i > 0 ? i - 1 : 0;
      const i1 = i < n - 1 ? i + 1 : n - 1;
      let tx = px[i1]! - px[i0]!;
      let ty = py[i1]! - py[i0]!;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty;
      const ny = tx;
      if (i === 0) {
        nx0 = nx;
        ny0 = ny;
      }
      if (i === n - 1) {
        nx1 = nx;
        ny1 = ny;
      }
      const w = pw[i]!;
      const wi = w * (1 - band);
      const t = i / (n - 1);
      let cr: number;
      let cg: number;
      let cb: number;
      if (ghost) {
        cr = ghost[0]!;
        cg = ghost[1]!;
        cb = ghost[2]!;
      } else if (perSample) {
        cr = pc[i * 3]!;
        cg = pc[i * 3 + 1]!;
        cb = pc[i * 3 + 2]!;
      } else {
        cr = s.c0[0]! + (s.c1[0]! - s.c0[0]!) * t;
        cg = s.c0[1]! + (s.c1[1]! - s.c0[1]!) * t;
        cb = s.c0[2]! + (s.c1[2]! - s.c0[2]!) * t;
      }
      const x = px[i]!;
      const y = py[i]!;
      // Left side (+normal).
      this.light(x + nx * w, y + ny * w, nx, ny, s);
      const fl = ghost ? 1 : this.fm;
      const lr = this.rr;
      const lg = this.rg;
      const lb = this.rb;
      const ls = this.rs;
      const v0 = this.vert(
        x + nx * (w + fw),
        y + ny * (w + fw),
        cr * fl,
        cg * fl,
        cb * fl,
        alpha,
        lr,
        lg,
        lb,
        ls,
        1,
        0,
        mode,
      );
      this.vert(x + nx * w, y + ny * w, cr * fl, cg * fl, cb * fl, alpha, lr, lg, lb, ls, 1, 1, mode);
      this.vert(x + nx * wi, y + ny * wi, cr * fl, cg * fl, cb * fl, alpha, lr, lg, lb, ls, 0, 1, mode);
      // Right side (-normal).
      this.light(x - nx * w, y - ny * w, -nx, -ny, s);
      const fr = ghost ? 1 : this.fm;
      const rr = this.rr;
      const rg = this.rg;
      const rb = this.rb;
      const rs = this.rs;
      this.vert(x - nx * wi, y - ny * wi, cr * fr, cg * fr, cb * fr, alpha, rr, rg, rb, rs, 0, 1, mode);
      this.vert(x - nx * w, y - ny * w, cr * fr, cg * fr, cb * fr, alpha, rr, rg, rb, rs, 1, 1, mode);
      this.vert(
        x - nx * (w + fw),
        y - ny * (w + fw),
        cr * fr,
        cg * fr,
        cb * fr,
        alpha,
        rr,
        rg,
        rb,
        rs,
        1,
        0,
        mode,
      );
      if (base >= 0) {
        for (let c = 0; c < 5; c++) this.quad(base + c, base + c + 1, v0 + c + 1, v0 + c);
      }
      base = v0;
    }
    if (cap0) this.cap(px[0]!, py[0]!, -ny0, nx0, pw[0]!, s, 0, perSample);
    if (cap1) this.cap(px[n - 1]!, py[n - 1]!, ny1, -nx1, pw[n - 1]!, s, 1, perSample);
  }

  /** Half-disc end cap facing direction (dx, dy). */
  private cap(
    x: number,
    y: number,
    dx: number,
    dy: number,
    w: number,
    s: Shade,
    t: number,
    perSample: boolean,
  ): void {
    const ghost = this.ghost;
    const mode = ghost ? GHOST : SOLID;
    const alpha = ghost ? this.ghostAlpha : (s.alpha ?? 1);
    let cr: number;
    let cg: number;
    let cb: number;
    if (ghost) {
      cr = ghost[0]!;
      cg = ghost[1]!;
      cb = ghost[2]!;
    } else if (perSample) {
      const o = t > 0.5 ? this.capColorOffset : 0;
      cr = this.pc[o]!;
      cg = this.pc[o + 1]!;
      cb = this.pc[o + 2]!;
    } else {
      cr = s.c0[0]! + (s.c1[0]! - s.c0[0]!) * t;
      cg = s.c0[1]! + (s.c1[1]! - s.c0[1]!) * t;
      cb = s.c0[2]! + (s.c1[2]! - s.c0[2]!) * t;
    }
    const fw = this.fw;
    const wi = w * (1 - s.band);
    const SEG = 6;
    let prev = -1;
    for (let k = 0; k <= SEG; k++) {
      const a = (k / SEG - 0.5) * Math.PI;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Rotate (dx, dy) by a.
      const nx = dx * ca - dy * sa;
      const ny = dx * sa + dy * ca;
      this.light(x + nx * w, y + ny * w, nx, ny, s);
      const f = ghost ? 1 : this.fm;
      const v0 = this.vert(
        x + nx * wi,
        y + ny * wi,
        cr * f,
        cg * f,
        cb * f,
        alpha,
        this.rr,
        this.rg,
        this.rb,
        this.rs,
        0,
        1,
        mode,
      );
      this.vert(
        x + nx * w,
        y + ny * w,
        cr * f,
        cg * f,
        cb * f,
        alpha,
        this.rr,
        this.rg,
        this.rb,
        this.rs,
        1,
        1,
        mode,
      );
      this.vert(
        x + nx * (w + fw),
        y + ny * (w + fw),
        cr * f,
        cg * f,
        cb * f,
        alpha,
        this.rr,
        this.rg,
        this.rb,
        this.rs,
        1,
        0,
        mode,
      );
      if (prev >= 0) {
        this.quad(prev, prev + 1, v0 + 1, v0);
        this.quad(prev + 1, prev + 2, v0 + 2, v0 + 1);
      }
      prev = v0;
    }
    // Fill the inner half-disc as a fan around the centre.
    const c = this.vert(x, y, cr, cg, cb, alpha, 0, 0, 0, 0, 0, 1, mode);
    const first = prev - SEG * 3;
    for (let k = 0; k < SEG; k++) this.tri(c, first + k * 3, first + (k + 1) * 3);
  }

  /** Offset into pc of the colour used by a per-sample ribbon's end cap. */
  private capColorOffset = 0;

  /** Call before a per-sample `ribbon` with caps: the last sample index. */
  setCapSample(i: number): void {
    this.capColorOffset = i * 3;
  }

  /**
   * A closed, star-convex shape: outline in px/py (n points, either winding), filled as a fan
   * around (cx, cy). Core colour runs c0 -> c1 along the gradient line (gx0, gy0) -> (gx1, gy1).
   */
  shape(n: number, cx: number, cy: number, s: Shade, gx0 = 0, gy0 = 0, gx1 = 0, gy1 = 0): void {
    if (n < 3 || this.full()) return;
    const { px, py, fw } = this;
    const ghost = this.ghost;
    const mode = ghost ? GHOST : SOLID;
    const alpha = ghost ? this.ghostAlpha : (s.alpha ?? 1);
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += px[i]! * py[j]! - px[j]! * py[i]!;
    }
    const orient = area > 0 ? 1 : -1;
    const gdx = gx1 - gx0;
    const gdy = gy1 - gy0;
    const gl = gdx * gdx + gdy * gdy;
    const band = s.band;
    const c0 = s.c0;
    const c1 = s.c1;
    let first = -1;
    let prev = -1;
    for (let i = 0; i < n; i++) {
      const i0 = (i + n - 1) % n;
      const i1 = (i + 1) % n;
      let tx = px[i1]! - px[i0]!;
      let ty = py[i1]! - py[i0]!;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = ty * orient;
      const ny = -tx * orient;
      const x = px[i]!;
      const y = py[i]!;
      const ix = x + (cx - x) * band;
      const iy = y + (cy - y) * band;
      let cr: number;
      let cg: number;
      let cb: number;
      let ir: number;
      let ig: number;
      let ib: number;
      if (ghost) {
        cr = ir = ghost[0]!;
        cg = ig = ghost[1]!;
        cb = ib = ghost[2]!;
        this.rr = this.rg = this.rb = this.rs = 0;
      } else {
        this.light(x, y, nx, ny, s);
        const t = gl > 0 ? sat01(((x - gx0) * gdx + (y - gy0) * gdy) / gl) : 0;
        const ti = gl > 0 ? sat01(((ix - gx0) * gdx + (iy - gy0) * gdy) / gl) : 0;
        const f = this.fm;
        cr = (c0[0]! + (c1[0]! - c0[0]!) * t) * f;
        cg = (c0[1]! + (c1[1]! - c0[1]!) * t) * f;
        cb = (c0[2]! + (c1[2]! - c0[2]!) * t) * f;
        ir = (c0[0]! + (c1[0]! - c0[0]!) * ti) * f;
        ig = (c0[1]! + (c1[1]! - c0[1]!) * ti) * f;
        ib = (c0[2]! + (c1[2]! - c0[2]!) * ti) * f;
      }
      const v0 = this.vert(ix, iy, ir, ig, ib, alpha, this.rr, this.rg, this.rb, this.rs, 0, 1, mode);
      this.vert(x, y, cr, cg, cb, alpha, this.rr, this.rg, this.rb, this.rs, 1, 1, mode);
      this.vert(x + nx * fw, y + ny * fw, cr, cg, cb, alpha, this.rr, this.rg, this.rb, this.rs, 1, 0, mode);
      if (prev >= 0) {
        this.quad(prev, prev + 1, v0 + 1, v0);
        this.quad(prev + 1, prev + 2, v0 + 2, v0 + 1);
      } else first = v0;
      prev = v0;
    }
    this.quad(prev, prev + 1, first + 1, first);
    this.quad(prev + 1, prev + 2, first + 2, first + 1);
    let mr: number;
    let mg: number;
    let mb: number;
    if (ghost) {
      mr = ghost[0]!;
      mg = ghost[1]!;
      mb = ghost[2]!;
    } else {
      const t = gl > 0 ? sat01(((cx - gx0) * gdx + (cy - gy0) * gdy) / gl) : 0;
      mr = c0[0]! + (c1[0]! - c0[0]!) * t;
      mg = c0[1]! + (c1[1]! - c0[1]!) * t;
      mb = c0[2]! + (c1[2]! - c0[2]!) * t;
    }
    const c = this.vert(cx, cy, mr, mg, mb, alpha, 0, 0, 0, 0, 0, 1, mode);
    for (let i = 0; i < n; i++) this.tri(c, first + i * 3, first + ((i + 1) % n) * 3);
  }

  /**
   * A sheet of cloth: a grid of `cols` x `rows` points in gx/gy (row-major, row 0 = the top) with
   * a core colour per point in gc. The two side columns and the bottom row are silhouette edges:
   * they get the rim band (`bandPx` wide at the sides, one row deep at the hem) and the feather.
   * The top row is left raw (it is tucked under something else).
   */
  grid(cols: number, rows: number, s: Shade, bandPx: number): void {
    if (cols < 3 || rows < 3 || this.full()) return;
    const { gx, gy, gc, fw } = this;
    const ghost = this.ghost;
    const mode = ghost ? GHOST : SOLID;
    const alpha = ghost ? this.ghostAlpha : (s.alpha ?? 1);
    const per = cols + 4;
    let prevBase = -1;
    for (let r = 0; r <= rows; r++) {
      // The extra pass (r === rows) is the hem's feather row.
      const hemFeather = r === rows;
      const rr = hemFeather ? rows - 1 : r;
      const hem = rr === rows - 1;
      const base = this.nv;
      for (let k = 0; k < per; k++) {
        // Which grid column this vertex sits on, and what it is.
        const c = k <= 2 ? 0 : k >= per - 3 ? cols - 1 : k - 2;
        const i = rr * cols + c;
        let x = gx[i]!;
        let y = gy[i]!;
        const up = (rr > 0 ? rr - 1 : rr) * cols + c;
        const dn = (rr < rows - 1 ? rr + 1 : rr) * cols + c;
        let tx = gx[dn]! - gx[up]!;
        let ty = gy[dn]! - gy[up]!;
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const sideL = k <= 2;
        const sideR = k >= per - 3;
        let nx = 0;
        let ny = 0;
        let e = 0;
        let cov = 1;
        if (sideL || sideR) {
          // Outward = perpendicular to the edge, away from the neighbouring column.
          const nb = rr * cols + (sideL ? 1 : cols - 2);
          const ix = gx[nb]! - x;
          const iy = gy[nb]! - y;
          nx = -ty;
          ny = tx;
          if (nx * ix + ny * iy > 0) {
            nx = -nx;
            ny = -ny;
          }
          const band = k === 2 || k === per - 3;
          if (band) {
            const il = Math.hypot(ix, iy) || 1;
            const f = Math.min(0.9, bandPx / il);
            x += ix * f;
            y += iy * f;
          } else {
            e = 1;
            if (k === 0 || k === per - 1) {
              x += nx * fw;
              y += ny * fw;
              cov = 0;
            }
          }
        }
        if (hem) {
          // The hem faces along the cloth's own direction.
          if (sideL || sideR) {
            nx = nx * 0.7 + tx * 0.7;
            ny = ny * 0.7 + ty * 0.7;
          } else {
            nx = tx;
            ny = ty;
          }
          e = 1;
          if (hemFeather) {
            x += tx * fw;
            y += ty * fw;
            cov = 0;
          }
        }
        if (ghost) {
          this.vert(x, y, ghost[0], ghost[1], ghost[2], alpha, 0, 0, 0, 0, e, cov, mode);
        } else {
          if (e > 0 || sideL || sideR) this.light(x, y, nx, ny, s);
          else this.rr = this.rg = this.rb = this.rs = 0;
          this.vert(
            x,
            y,
            gc[i * 3]!,
            gc[i * 3 + 1]!,
            gc[i * 3 + 2]!,
            alpha,
            this.rr,
            this.rg,
            this.rb,
            this.rs,
            e,
            cov,
            mode,
          );
        }
      }
      if (prevBase >= 0) {
        for (let k = 0; k < per - 1; k++) this.quad(prevBase + k, prevBase + k + 1, base + k + 1, base + k);
      }
      prevBase = base;
    }
  }

  /** Fills px/py with a rotated ellipse outline and returns the point count. */
  ellipsePath(cx: number, cy: number, rx: number, ry: number, rot = 0, seg = 20): number {
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry;
      this.px[i] = cx + x * cr - y * sr;
      this.py[i] = cy + x * sr + y * cr;
    }
    return seg;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, rot: number, s: Shade, seg = 20): void {
    const n = this.ellipsePath(cx, cy, rx, ry, rot, seg);
    const ux = -Math.sin(rot);
    const uy = Math.cos(rot);
    this.shape(n, cx, cy, s, cx - ux * ry, cy - uy * ry, cx + ux * ry, cy + uy * ry);
  }

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
    if (a <= 0.002 || this.full()) return;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const centre = this.vert(x, y, c[0]!, c[1]!, c[2]!, a, 0, 0, 0, 0, 0, 1, mode);
    for (let i = 0; i < seg; i++) {
      const ang = (i / seg) * Math.PI * 2;
      const ex = Math.cos(ang) * rx;
      const ey = Math.sin(ang) * ry;
      this.vert(x + ex * cr - ey * sr, y + ex * sr + ey * cr, c[0]!, c[1]!, c[2]!, a, 0, 0, 0, 0, 1, 1, mode);
    }
    for (let i = 0; i < seg; i++) this.tri(centre, centre + 1 + i, centre + 1 + ((i + 1) % seg));
  }

  /** Additive radial glow. Skipped while drawing ghosts. */
  glow(x: number, y: number, r: number, c: RGB, intensity: number, ry = r, rot = 0, seg = 24): void {
    if (this.ghost) return;
    this.fan(x, y, r, ry, rot, c, intensity, GLOW, seg);
  }

  /** Soft alpha blob (dark contact shadow, pale dust). */
  soft(x: number, y: number, rx: number, ry: number, c: RGB, alpha: number): void {
    if (this.ghost) return;
    this.fan(x, y, rx, ry, 0, c, alpha, SOFT, 20);
  }

  /** Additive ring of radius r and half-thickness w. */
  ring(x: number, y: number, r: number, w: number, c: RGB, intensity: number, ry = r): void {
    if (this.ghost || intensity <= 0.002 || this.full()) return;
    const SEG = 32;
    const k = ry / r;
    let prev = -1;
    let first = -1;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a) * k;
      const r0 = Math.max(0, r - w);
      const v0 = this.vert(x + ca * r0, y + sa * r0, c[0]!, c[1]!, c[2]!, intensity, 0, 0, 0, 0, 1, 1, GLOW);
      this.vert(x + ca * r, y + sa * r, c[0]!, c[1]!, c[2]!, intensity, 0, 0, 0, 0, 0, 1, GLOW);
      this.vert(x + ca * (r + w), y + sa * (r + w), c[0]!, c[1]!, c[2]!, intensity, 0, 0, 0, 0, 1, 1, GLOW);
      if (prev >= 0) {
        this.quad(prev, prev + 1, v0 + 1, v0);
        this.quad(prev + 1, prev + 2, v0 + 2, v0 + 1);
      } else first = v0;
      prev = v0;
    }
    this.quad(prev, prev + 1, first + 1, first);
    this.quad(prev + 1, prev + 2, first + 2, first + 1);
  }

  /**
   * Additive streak along the polyline in px/py with half-widths pw; brightness per sample from
   * pc[i*3] (only the first of each triple is read), brightest on the centre line.
   */
  streak(n: number, c: RGB): void {
    if (n < 2 || this.ghost || this.full()) return;
    const { px, py, pw, pc } = this;
    let base = -1;
    for (let i = 0; i < n; i++) {
      const i0 = i > 0 ? i - 1 : 0;
      const i1 = i < n - 1 ? i + 1 : n - 1;
      let tx = px[i1]! - px[i0]!;
      let ty = py[i1]! - py[i0]!;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty * pw[i]!;
      const ny = tx * pw[i]!;
      const a = pc[i * 3]!;
      const v0 = this.vert(px[i]! + nx, py[i]! + ny, c[0]!, c[1]!, c[2]!, a, 0, 0, 0, 0, 1, 1, GLOW);
      this.vert(px[i]!, py[i]!, c[0]!, c[1]!, c[2]!, a, 0, 0, 0, 0, 0, 1, GLOW);
      this.vert(px[i]! - nx, py[i]! - ny, c[0]!, c[1]!, c[2]!, a, 0, 0, 0, 0, 1, 1, GLOW);
      if (base >= 0) {
        this.quad(base, base + 1, v0 + 1, v0);
        this.quad(base + 1, base + 2, v0 + 2, v0 + 1);
      }
      base = v0;
    }
  }
}

function sat01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
