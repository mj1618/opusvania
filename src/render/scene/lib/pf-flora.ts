/**
 * The live plant meshes. Every blade, frond, cap and vine in the playfield is a few triangles in
 * a handful of big static meshes (chunked along x for culling); a vertex shader does all the
 * motion: wind (the shared travelling wave), bending away from the character and the landing
 * shiver (from the bend field, pf-field.ts), and glow plants brightening. Nothing is rebuilt per
 * frame: the CPU only updates two uniforms and the field texture.
 *
 * A vertex carries: rest position, its plant's base (where the field is sampled and what stays
 * put), a bend weight h (0 at the base, 1 at the tip), phase, wind and bend amplitudes in px, a
 * droop factor (tips dip as they lean; negative for hanging things), a glow factor and a colour.
 * Halo quads (soft additive discs around glow things) use the same layout plus a corner.
 */
import { Buffer, BufferUsage, Container, Geometry, Mesh, Shader, type Texture } from 'pixi.js';
import { mix } from './look';
import { FIELD_DECODE } from './pf-field';

const STRIDE = 16;

const VERT = `#version 300 es
precision highp float;
in vec2 aPosition;
in vec4 aBase;   // base x, base y, bend weight, phase
in vec4 aSway;   // wind px, bend px, droop, glow
in vec4 aColor;
in vec2 aCorner;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform sampler2D uField;
uniform vec4 uFieldRect;
uniform vec4 uTime;   // clock, glow gain, halo gain, -
out vec4 vColor;
out vec2 vCorner;
${FIELD_DECODE}
// Keep identical to wind() in look.ts.
float wind(float x, float clock, float phase) {
  float t = clock * 0.9 - x * 0.0016 + phase * 6.283;
  float gust = 0.5 + 0.5 * sin(clock * 0.23 - x * 0.0005);
  return sin(t) * (0.35 + 0.45 * gust) + sin(t * 2.7 + 1.3) * 0.14 + sin(t * 5.1) * 0.05;
}
void main() {
  vec4 f = texture(uField, (aBase.xy - uFieldRect.xy) * uFieldRect.zw);
  float bend = fieldBend(f.r);
  float h = aBase.z;
  float k = h * sqrt(h);
  float dx = (wind(aBase.x, uTime.x, aBase.w) * aSway.x + bend * aSway.y) * k;
  vec2 pos = aPosition + vec2(dx, abs(dx) * aSway.z * h);
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(pos, 1.0)).xy, 0.0, 1.0);
  float breath = 0.5 + 0.5 * sin(uTime.x * 1.25 + aBase.w * 6.283 + aBase.x * 0.01);
  float glow = aSway.w * (0.12 * breath + f.g * uTime.y);
  vColor = vec4(aColor.rgb * (1.0 + glow) + aColor.rgb * glow * 0.4, aColor.a);
  vCorner = aCorner;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vCorner;
out vec4 o;
void main() {
  o = vec4(min(vColor.rgb, vec3(1.0)) * vColor.a, vColor.a);
}`;

const HALO_VERT = VERT.replace(
  'float glow = aSway.w * (0.12 * breath + f.g * uTime.y);',
  'float glow = aSway.w * (0.25 * breath + f.g * uTime.z) - 0.25;',
).replace(
  'vColor = vec4(aColor.rgb * (1.0 + glow) + aColor.rgb * glow * 0.4, aColor.a);',
  'vColor = vec4(aColor.rgb, aColor.a * (1.0 + glow));',
);

const HALO_FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vCorner;
out vec4 o;
void main() {
  float r2 = dot(vCorner, vCorner);
  float a = max(0.0, exp(-r2 * 3.2) - 0.0408) * vColor.a;
  o = vec4(vColor.rgb * a, a);
}`;

interface Chunk {
  verts: number[];
  index: number[];
}

/** Collects plant triangles into x-chunked vertex buffers. */
export class FloraBuilder {
  private readonly chunks: Chunk[] = [];
  private cur: Chunk;
  private bx = 0;
  private by = 0;
  private reach = 1;
  private phase = 0;
  private windPx = 0;
  private bendPx = 0;
  private droop = 0;
  /** Glow factor for the vertices added next (0 = ordinary plant matter). */
  glow = 0;
  /** If set, every vertex gets this bend weight instead of one from its distance to the base. */
  fixedH: number | null = null;

  constructor(
    private readonly chunkW: number,
    width: number,
  ) {
    for (let i = 0; i < Math.ceil(width / chunkW); i++) this.chunks.push({ verts: [], index: [] });
    this.cur = this.chunks[0] as Chunk;
  }

  /**
   * Starts a plant rooted at (x, y). `reach` is the distance from the base at which the bend
   * weight reaches 1; `wind` and `bend` are tip displacements in px; `droop` > 0 dips the tip as
   * it leans (upright things), < 0 lifts it (hanging things).
   */
  plant(x: number, y: number, reach: number, phase: number, wind: number, bend: number, droop = 0.3): void {
    const i = Math.min(this.chunks.length - 1, Math.max(0, Math.floor(x / this.chunkW)));
    this.cur = this.chunks[i] as Chunk;
    this.bx = x;
    this.by = y;
    this.reach = Math.max(1, reach);
    this.phase = phase;
    this.windPx = wind;
    this.bendPx = bend;
    this.droop = droop;
    this.glow = 0;
    this.fixedH = null;
  }

  /** Adds a vertex, returns its index. */
  v(x: number, y: number, color: number, alpha = 1, cx = 0, cy = 0): number {
    const c = this.cur;
    const h = this.fixedH ?? Math.min(1, Math.hypot(x - this.bx, y - this.by) / this.reach);
    c.verts.push(
      x,
      y,
      this.bx,
      this.by,
      h,
      this.phase,
      this.windPx,
      this.bendPx,
      this.droop,
      this.glow,
      ((color >> 16) & 255) / 255,
      ((color >> 8) & 255) / 255,
      (color & 255) / 255,
      alpha,
      cx,
      cy,
    );
    return c.verts.length / STRIDE - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.cur.index.push(a, b, c);
  }

  /**
   * A tapered strip along a centre line (flat xy list). `w(t)` full width; `colL`/`colR` colours
   * at t for the left and right edge (looking along the line), so one side can catch the light.
   */
  strip(
    line: number[],
    w: (t: number) => number,
    colL: (t: number) => number,
    colR: (t: number) => number = colL,
    alpha = 1,
  ): void {
    const n = line.length / 2;
    let pl = -1;
    let pr = -1;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      let dx = (line[b * 2] as number) - (line[a * 2] as number);
      let dy = (line[b * 2 + 1] as number) - (line[a * 2 + 1] as number);
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const t = i / (n - 1);
      const hw = w(t) / 2;
      const x = line[i * 2] as number;
      const y = line[i * 2 + 1] as number;
      if (i === n - 1 && hw < 0.35) {
        const tip = this.v(x, y, mix(colL(t), colR(t), 0.5), alpha);
        if (pl >= 0) this.tri(pl, pr, tip);
        return;
      }
      const l = this.v(x + dy * hw, y - dx * hw, colL(t), alpha);
      const r = this.v(x - dy * hw, y + dx * hw, colR(t), alpha);
      if (pl >= 0) {
        this.tri(pl, pr, l);
        this.tri(pr, r, l);
      }
      pl = l;
      pr = r;
    }
  }

  /**
   * A leaf: a pointed lens from (x, y) along `angle`, `len` long and `wid` wide, split down the
   * midrib into a `colA` half (left of the direction of growth) and a `colB` half, shading from
   * the base colour `colBase` at the stem. `bow` curves it.
   */
  leaf(
    x: number,
    y: number,
    angle: number,
    len: number,
    wid: number,
    colBase: number,
    colA: number,
    colB: number,
    bow = 0,
    alpha = 1,
    seg = 4,
  ): void {
    const cs = Math.cos(angle);
    const sn = Math.sin(angle);
    let pc = this.v(x, y, colBase, alpha);
    let pa = pc;
    let pb = pc;
    for (let i = 1; i <= seg; i++) {
      const t = i / seg;
      const along = len * t;
      const side = bow * len * Math.sin(Math.PI * t * 0.5) ** 2;
      const cxp = x + cs * along - sn * side;
      const cyp = y + sn * along + cs * side;
      const hw = (wid / 2) * Math.sin(Math.PI * t ** 0.75) * (1 - t * 0.15);
      const k = Math.min(1, t * 1.6);
      const c = this.v(cxp, cyp, mix(colBase, mix(colA, colB, 0.5), k), alpha);
      if (i === seg) {
        this.tri(pa, pc, c);
        this.tri(pc, pb, c);
        return;
      }
      const a = this.v(cxp + sn * hw, cyp - cs * hw, mix(colBase, colA, k), alpha);
      const b = this.v(cxp - sn * hw, cyp + cs * hw, mix(colBase, colB, k), alpha);
      if (i === 1) {
        this.tri(pc, a, c);
        this.tri(pc, c, b);
      } else {
        this.tri(pa, a, c);
        this.tri(pa, c, pc);
        this.tri(pc, c, b);
        this.tri(pc, b, pb);
      }
      pa = a;
      pb = b;
      pc = c;
    }
  }

  /** A filled ellipse sector fan (a0..a1 radians), centre colour to rim colour. */
  fan(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    a0: number,
    a1: number,
    colC: number,
    colRim: (a: number) => number,
    alpha = 1,
    seg = 8,
    rimAlpha = alpha,
  ): void {
    const c = this.v(cx, cy, colC, alpha);
    let prev = -1;
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      const p = this.v(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, colRim(a), rimAlpha);
      if (prev >= 0) this.tri(c, prev, p);
      prev = p;
    }
  }

  /** A soft additive disc (goes in the halo builder). All four corners move as the centre does. */
  halo(cx: number, cy: number, radius: number, color: number, alpha: number, glow = 1): void {
    const keepH = this.fixedH;
    const keepG = this.glow;
    this.fixedH = keepH ?? Math.min(1, Math.hypot(cx - this.bx, cy - this.by) / this.reach);
    this.glow = glow;
    const a = this.v(cx - radius, cy - radius, color, alpha, -1, -1);
    const b = this.v(cx + radius, cy - radius, color, alpha, 1, -1);
    const c = this.v(cx + radius, cy + radius, color, alpha, 1, 1);
    const d = this.v(cx - radius, cy + radius, color, alpha, -1, 1);
    this.tri(a, b, c);
    this.tri(a, c, d);
    this.fixedH = keepH;
    this.glow = keepG;
  }

  /** Copies the current plant's base and motion into another builder (for its halo). */
  sync(other: FloraBuilder): void {
    other.plant(this.bx, this.by, this.reach, this.phase, this.windPx, this.bendPx, this.droop);
  }

  get vertexCount(): number {
    let n = 0;
    for (const c of this.chunks) n += c.verts.length / STRIDE;
    return n;
  }

  /** Builds the meshes. `halo` picks the additive soft-disc shader. */
  build(field: Texture, fieldRect: number[], halo: boolean): FloraMesh {
    return new FloraMesh(this.chunks, this.chunkW, field, fieldRect, halo);
  }
}

export class FloraMesh {
  readonly container = new Container();
  private readonly meshes: Array<{ mesh: Mesh<Geometry, Shader>; x0: number; x1: number }> = [];
  private readonly time = new Float32Array([0, 1.6, 1.4, 0]);

  constructor(chunks: Chunk[], chunkW: number, field: Texture, fieldRect: number[], halo: boolean) {
    const shader = Shader.from({
      gl: { vertex: halo ? HALO_VERT : VERT, fragment: halo ? HALO_FRAG : FRAG },
      resources: {
        uField: field.source,
        u: {
          uFieldRect: { value: new Float32Array(fieldRect), type: 'vec4<f32>' },
          uTime: { value: this.time, type: 'vec4<f32>' },
        },
      },
    });
    chunks.forEach((c, i) => {
      if (c.index.length === 0) return;
      const buf = new Buffer({ data: new Float32Array(c.verts), usage: BufferUsage.VERTEX });
      const geometry = new Geometry({
        attributes: {
          aPosition: { buffer: buf, format: 'float32x2', stride: STRIDE * 4, offset: 0 },
          aBase: { buffer: buf, format: 'float32x4', stride: STRIDE * 4, offset: 8 },
          aSway: { buffer: buf, format: 'float32x4', stride: STRIDE * 4, offset: 24 },
          aColor: { buffer: buf, format: 'float32x4', stride: STRIDE * 4, offset: 40 },
          aCorner: { buffer: buf, format: 'float32x2', stride: STRIDE * 4, offset: 56 },
        },
        indexBuffer: new Uint32Array(c.index),
      });
      const mesh = new Mesh({ geometry, shader });
      if (halo) mesh.blendMode = 'add';
      this.container.addChild(mesh);
      this.meshes.push({ mesh, x0: i * chunkW, x1: (i + 1) * chunkW });
    });
  }

  /** `glowGain` / `haloGain`: how much the field's excitement brightens glow things. */
  update(
    clock: number,
    viewX0: number,
    viewX1: number,
    glowGain: number,
    haloGain: number,
    margin = 160,
  ): void {
    this.time[0] = clock;
    this.time[1] = glowGain;
    this.time[2] = haloGain;
    for (const m of this.meshes) m.mesh.visible = m.x1 > viewX0 - margin && m.x0 < viewX1 + margin;
  }
}
