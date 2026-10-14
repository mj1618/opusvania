/**
 * A depth plane. Shapes in it are drawn in their own (albedo-ish) colours; the plane's filter then
 * does what a painter does to a whole plane at once:
 *
 *   ambient   multiply by the plane's light colour and pull saturation
 *   lights    up to MAX_LIGHTS screen-space point lights brighten what is near them (multiply) and
 *             lay a little scattered colour over it (add): the lamp lights the wall beside it,
 *             Umber lights the root at her feet
 *   mottle    two scales of noise in value: no flat CG fills
 *   fog       mix toward the fog colour by a base amount plus a vertical ramp (thicker low down)
 *   blur      depth of field (optional, after the rest)
 *
 * Transparent pixels stay transparent: atmosphere BETWEEN planes is drawn by fog planes.
 */
import { BlurFilter, Container, Filter, GlProgram, Rectangle, UniformGroup } from 'pixi.js';
import { NOISE_GLSL } from './plane';

export const VIEW_W = 1920;
export const VIEW_H = 1080;
export const MAX_LIGHTS = 8;

/** A light in screen px. `scatter` = how much colour it adds on top of what it multiplies. */
export interface SceneLight {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  scatter: number;
}

export const FILTER_VERT = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vScreen;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  vScreen = position;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}`;

const ATMOS_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
in vec2 vScreen;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uFog;      // rgb, base amount
uniform vec4 uFogRamp;  // y0, y1, amount added at y0, at y1
uniform vec4 uAmb;      // rgb multiply, saturation
uniform vec4 uMot;      // mottle amount, scale px, seed, light response
uniform vec4 uFog2;     // rgb, unused: the fog colour right of the split
uniform vec4 uAmb2;     // rgb multiply, saturation: right of the split
uniform vec4 uSplit;    // x where the left look ends, x where the right look is whole, unused, on (0/1)
uniform vec4 uL[${MAX_LIGHTS}];   // x, y, radius, intensity
uniform vec4 uLC[${MAX_LIGHTS}];  // rgb, scatter
${NOISE_GLSL}
void main() {
  vec4 s = texture(uTexture, vTextureCoord);
  if (s.a <= 0.002) { finalColor = vec4(0.0); return; }
  vec3 c = s.rgb / s.a;
  float sx = uSplit.w > 0.5 ? smoothstep(uSplit.x, uSplit.y, vScreen.x) : 0.0;
  vec4 amb = mix(uAmb, uAmb2, sx);
  vec3 fogC = mix(uFog.rgb, uFog2.rgb, sx);
  c *= amb.rgb;
  float l = luma(c);
  c = mix(vec3(l), c, amb.a);
  vec3 mul = vec3(0.0);
  vec3 add = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    vec4 L = uL[i];
    if (L.w <= 0.0) continue;
    float d = length(vScreen - L.xy) / L.z;
    float f = clamp(1.0 - d, 0.0, 1.0);
    f = f * f;
    mul += uLC[i].rgb * L.w * f;
    add += uLC[i].rgb * L.w * f * f * uLC[i].a;
  }
  c = c * (1.0 + mul * uMot.w * 2.2) + add * uMot.w;
  float n = fbm3(vScreen / uMot.y + uMot.z) - 0.5;
  float n2 = vnoise(vScreen / (uMot.y * 0.16) + uMot.z * 1.7) - 0.5;
  c *= 1.0 + uMot.x * (n * 1.5 + n2 * 0.45);
  float fk = uFog.a + mix(uFogRamp.z, uFogRamp.w, smoothstep(uFogRamp.x, uFogRamp.y, vScreen.y));
  c = mix(c, fogC, clamp(fk, 0.0, 1.0));
  finalColor = vec4(max(c, 0.0) * s.a, s.a);
}`;

export interface AtmosSpec {
  fog: number;
  /** Base fog amount 0..1. */
  fogK: number;
  /** Extra fog: `ramp[2]` at screen y `ramp[0]` easing to `ramp[3]` at `ramp[1]`. */
  ramp?: readonly [number, number, number, number];
  amb?: number;
  sat?: number;
  mottle?: number;
  mottleScale?: number;
  /** How strongly the scene lights touch this plane (0 = not at all). */
  lit?: number;
  /** Depth-of-field blur strength (0 = sharp). */
  blur?: number;
  seed?: number;
  /** A second look right of a vertical split: fog and ambient blend from `split[0]` to `split[1]` (screen x). */
  split?: { x0: number; x1: number; fog: number; amb?: number; sat?: number };
}

const rgb3 = (hex: number): [number, number, number] => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

export class AtmosFilter extends Filter {
  private readonly au: { uL: Float32Array; uLC: Float32Array; uFog: Float32Array };

  constructor(spec: AtmosSpec) {
    const fog = rgb3(spec.fog);
    const amb = rgb3(spec.amb ?? 0xffffff);
    const ramp = spec.ramp ?? [0, 1, 0, 0];
    const group = new UniformGroup({
      uFog: { value: new Float32Array([...fog, spec.fogK]), type: 'vec4<f32>' },
      uFogRamp: { value: new Float32Array(ramp), type: 'vec4<f32>' },
      uAmb: { value: new Float32Array([...amb, spec.sat ?? 1]), type: 'vec4<f32>' },
      uMot: {
        value: new Float32Array([
          spec.mottle ?? 0.12,
          spec.mottleScale ?? 220,
          spec.seed ?? 0,
          spec.lit ?? 1,
        ]),
        type: 'vec4<f32>',
      },
      uFog2: { value: new Float32Array([...rgb3(spec.split?.fog ?? spec.fog), 0]), type: 'vec4<f32>' },
      uAmb2: {
        value: new Float32Array([
          ...rgb3(spec.split?.amb ?? spec.amb ?? 0xffffff),
          spec.split?.sat ?? spec.sat ?? 1,
        ]),
        type: 'vec4<f32>',
      },
      uSplit: {
        value: new Float32Array([spec.split?.x0 ?? 0, spec.split?.x1 ?? 1, 0, spec.split ? 1 : 0]),
        type: 'vec4<f32>',
      },
      uL: { value: new Float32Array(MAX_LIGHTS * 4), type: 'vec4<f32>', size: MAX_LIGHTS },
      uLC: { value: new Float32Array(MAX_LIGHTS * 4), type: 'vec4<f32>', size: MAX_LIGHTS },
    });
    super({
      glProgram: GlProgram.from({ vertex: FILTER_VERT, fragment: ATMOS_FRAG, name: 'wc-atmos' }),
      resources: { atmos: group },
      resolution: 1,
      antialias: 'inherit',
      padding: 0,
    });
    this.au = group.uniforms as unknown as AtmosFilter['au'];
  }

  setLights(lights: readonly SceneLight[]): void {
    const L = this.au.uL;
    const C = this.au.uLC;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = lights[i];
      if (!l) {
        L[i * 4 + 3] = 0;
        continue;
      }
      L[i * 4] = l.x;
      L[i * 4 + 1] = l.y;
      L[i * 4 + 2] = l.radius;
      L[i * 4 + 3] = l.intensity;
      const c = rgb3(l.color);
      C[i * 4] = c[0];
      C[i * 4 + 1] = c[1];
      C[i * 4 + 2] = c[2];
      C[i * 4 + 3] = l.scatter;
    }
  }
}

/** A depth plane: add shapes to `view`; `atmos` gets the scene lights every frame. */
export class Plane {
  readonly view = new Container();
  readonly atmos: AtmosFilter;

  constructor(
    readonly name: string,
    spec: AtmosSpec,
  ) {
    this.view.label = name;
    this.atmos = new AtmosFilter(spec);
    const filters: Filter[] = [this.atmos];
    if (spec.blur && spec.blur > 0)
      filters.push(new BlurFilter({ strength: spec.blur, quality: 4, resolution: 1, padding: 0 }));
    this.view.filters = filters;
    this.view.filterArea = new Rectangle(0, 0, VIEW_W, VIEW_H);
  }
}
