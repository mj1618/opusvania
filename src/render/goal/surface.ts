/**
 * Warm light on surfaces. The post stage's point lights are a gain that keeps a surface's own hue
 * (a lit teal bank gets paler teal, never warm), so a lantern could not warm the place it stands
 * in. This mesh adds light of its own colour, but only where the playfield mask (scene/lib/fx-mask:
 * the terrain and plants at her depth, redrawn by post) says there is a surface, and in
 * proportion to that surface's colour, so ground, plants and trunks take the light and the air
 * behind them takes none: a pool of warmth, no haze.
 *
 * Quads in world px (the mesh sits in a world layer, behind the hero); each vertex also carries
 * where it is in the view, which is where the mask is sampled.
 */
import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Rectangle, Shader } from 'pixi.js';
import { type CameraView, VIEW_H, VIEW_W } from '../contract';
import { playfieldMaskTexture } from '../scene/lib/fx-mask';

const FLOATS = 8;

const VERT = `#version 300 es
precision highp float;
in vec2 aPosition;
in vec2 aUv;
in vec2 aMask;
in vec2 aData;
out vec2 vUv;
out vec2 vMask;
out vec2 vData;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUv = aUv;
  vMask = aMask;
  vData = aData;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vMask;
in vec2 vData;   // energy, whiteness (0 amber .. 1 golden-white)
out vec4 o;
uniform sampler2D uMask;
uniform vec4 uSurface;  // gain on the surface's own colour, floor, air, -
void main() {
  float r2 = dot(vUv, vUv);
  float f = max(0.0, 1.0 - r2);
  f *= f;
  // The mask is a quarter of the view: five taps hide its steps along leaves and vines.
  vec2 px = vec2(1.0 / 480.0, 1.0 / 270.0) * 0.85;
  vec4 m = texture(uMask, vMask) * 0.36
    + (texture(uMask, vMask + px) + texture(uMask, vMask - px)
    + texture(uMask, vMask + vec2(px.x, -px.y)) + texture(uMask, vMask + vec2(-px.x, px.y))) * 0.16;
  vec3 warm = mix(vec3(1.0, 0.5, 0.16), vec3(1.0, 0.82, 0.54), vData.y);
  // Light times the surface's value (mostly: its own hue would turn amber on teal to khaki), plus a
  // little of the light itself so near-black soil still shows it. A knee keeps pale rock from blowing out.
  float lum = dot(m.rgb, vec3(0.3, 0.55, 0.15));
  vec3 lit = (vec3(lum) * 0.8 + m.rgb * 0.2) * uSurface.x + m.a * uSurface.y;
  lit = lit / (1.0 + 2.2 * max(lit.r, max(lit.g, lit.b)));
  vec3 add = lit * warm * f * vData.x + warm * f * f * uSurface.z * vData.x;
  o = vec4(add, 0.0);
}`;

export class SurfaceLight {
  readonly mesh: Mesh<Geometry, Shader>;
  /** Gain on the surface's own colour, a floor for black soil, and what the bare air takes. */
  readonly uniform = new Float32Array([2.0, 0.035, 0.0, 0]);
  private readonly verts: Float32Array;
  private readonly vbuf: Buffer;
  private n = 0;
  private last = 0;
  private high = 1;

  constructor(readonly maxQuads: number) {
    this.verts = new Float32Array(maxQuads * 4 * FLOATS);
    const indices = new Uint16Array(maxQuads * 6);
    for (let q = 0; q < maxQuads; q++) {
      const v = q * 4;
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    }
    this.vbuf = new Buffer({ data: this.verts, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
    const stride = FLOATS * 4;
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: this.vbuf, format: 'float32x2', stride, offset: 0 },
        aUv: { buffer: this.vbuf, format: 'float32x2', stride, offset: 8 },
        aMask: { buffer: this.vbuf, format: 'float32x2', stride, offset: 16 },
        aData: { buffer: this.vbuf, format: 'float32x2', stride, offset: 24 },
      },
      indexBuffer: new Buffer({ data: indices, usage: BufferUsage.INDEX | BufferUsage.COPY_DST }),
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'goal-surface-light' }),
      resources: {
        uMask: playfieldMaskTexture().source,
        surface: { uSurface: { value: this.uniform, type: 'vec4<f32>' } },
      },
    });
    this.mesh = new Mesh({ geometry, shader });
    this.mesh.label = 'goal-surface-light';
    this.mesh.boundsArea = new Rectangle(-1e6, -1e6, 2e6, 2e6);
  }

  begin(): void {
    this.n = 0;
  }

  /** An ellipse of light centred on (x, y), radii (rx, ry) world px. */
  light(cam: CameraView, x: number, y: number, rx: number, ry: number, e: number, white = 0): void {
    if (this.n >= this.maxQuads || e <= 0.002) return;
    const hw = VIEW_W / 2 / cam.zoom;
    const hh = VIEW_H / 2 / cam.zoom;
    if (Math.abs(x - cam.x) > hw + rx || Math.abs(y - cam.y) > hh + ry) return;
    const v = this.verts;
    let o = this.n++ * 4 * FLOATS;
    for (const [u, w] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const wx = x + u * rx;
      const wy = y + w * ry;
      v[o++] = wx;
      v[o++] = wy;
      v[o++] = u;
      v[o++] = w;
      v[o++] = 0.5 + ((wx - cam.x) * cam.zoom) / VIEW_W;
      v[o++] = 0.5 + ((wy - cam.y) * cam.zoom) / VIEW_H;
      v[o++] = e;
      v[o++] = white;
    }
  }

  end(): void {
    const per = 4 * FLOATS;
    if (this.last > this.n) this.verts.fill(0, this.n * per, this.last * per);
    this.last = this.n;
    this.high = Math.max(this.high, this.n, 1);
    this.vbuf.update(this.high * per * 4);
  }
}
