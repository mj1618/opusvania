/**
 * Shared GLSL and the full-rect shader plane every frame paints its big soft things with (sky,
 * the far mountain, fog sheets, light cones). A plane is a Mesh quad with its own fragment body:
 *
 *   vec4 paint()   returns PREMULTIPLIED colour. In scope: vPx (px inside the plane, origin top
 *                  left), vUV (0..1), uT = (time s, breath 0..1, plane w, plane h), uP[i] params.
 *
 * Breath is the world's one shared rhythm (`breath()` in ../lib/time.ts): everything the Mouth owns
 * swells with it.
 */
import { Geometry, GlProgram, Mesh, Shader, UniformGroup } from 'pixi.js';

/** Value noise, fbm, ridges. Hash is sin-free (stable across GPUs). */
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s / 0.97;
}
float fbm3(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.07 + vec2(5.3, 11.7);
    a *= 0.5;
  }
  return s / 0.875;
}
vec3 srgb(vec3 c) { return c; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

export const MESH_VERT = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec2 vPx;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uT;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vPx = aUV * uT.zw;
}`;

export interface PlaneUniforms {
  uT: Float32Array;
  uP: Float32Array;
}

/** Number of vec4 params every plane gets (`uP[0..PARAMS-1]`). */
export const PARAMS = 16;

export class ShaderPlane {
  readonly mesh: Mesh<Geometry, Shader>;
  readonly u: PlaneUniforms;

  constructor(name: string, x: number, y: number, w: number, h: number, body: string) {
    const geometry = new Geometry({
      attributes: {
        aPosition: new Float32Array([x, y, x + w, y, x + w, y + h, x, y + h]),
        aUV: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      },
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const fragment = `#version 300 es
precision highp float;
in vec2 vUV;
in vec2 vPx;
out vec4 finalColor;
uniform vec4 uT;
uniform vec4 uP[${PARAMS}];
${NOISE_GLSL}
${body}
void main() { finalColor = paint(); }
`;
    const group = new UniformGroup({
      uT: { value: new Float32Array([0, 0, w, h]), type: 'vec4<f32>' },
      uP: { value: new Float32Array(PARAMS * 4), type: 'vec4<f32>', size: PARAMS },
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex: `#version 300 es\n${MESH_VERT}`, fragment, name: `wc-${name}` }),
      resources: { plane: group },
    });
    this.mesh = new Mesh({ geometry, shader });
    this.mesh.label = name;
    this.u = group.uniforms as unknown as PlaneUniforms;
  }

  /** Set param `i` (a vec4). */
  p(i: number, x: number, y = 0, z = 0, w = 0): this {
    const a = this.u.uP;
    a[i * 4] = x;
    a[i * 4 + 1] = y;
    a[i * 4 + 2] = z;
    a[i * 4 + 3] = w;
    return this;
  }

  /** Set param `i` to a colour (0xRRGGBB) plus a fourth number. */
  c(i: number, hex: number, w = 0): this {
    return this.p(i, ((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, w);
  }

  tick(t: number, breath: number): void {
    this.u.uT[0] = t;
    this.u.uT[1] = breath;
  }
}
