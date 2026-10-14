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
out vec2 vTexel;
out vec4 vClamp;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vTexel = uInputSize.zw;
  vClamp = uInputClamp;
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
in vec2 vTexel;
in vec4 vClamp;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uFog;      // rgb, base amount
uniform vec4 uFogRamp;  // y0, y1, amount added at y0, at y1
uniform vec4 uAmb;      // rgb multiply, saturation
uniform vec4 uMot;      // mottle amount, scale px, seed, light response
uniform vec4 uFog2;     // rgb, unused: the fog colour right of the split
uniform vec4 uAmb2;     // rgb multiply, saturation: right of the split
uniform vec4 uSplit;    // x where the left look ends, x where the right look is whole, unused, on (0/1)
uniform vec4 uEdge;     // radius px, fog at the silhouette edge, core darkening, edge lift
uniform vec4 uRim;      // rgb, amount (the key rim)
uniform vec4 uRimDir;   // toward the key (unit, y down), rim width px, rim from point lights
uniform vec4 uBrush;    // amount, stroke length px, stroke angle (rad), stroke width px
uniform vec4 uL[${MAX_LIGHTS}];   // x, y, radius, intensity
uniform vec4 uLC[${MAX_LIGHTS}];  // rgb, scatter
${NOISE_GLSL}
float aAt(vec2 offPx) {
  return texture(uTexture, clamp(vTextureCoord + offPx * vTexel, vClamp.xy, vClamp.zw)).a;
}
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
  // How near the silhouette's edge this pixel is (0 deep inside .. ~1 at the rim).
  float e = 0.0;
  if (uEdge.x > 0.0) {
    float r = uEdge.x;
    float hole = 0.0;
    for (int i = 0; i < 8; i++) {
      float an = float(i) * 0.7854 + 0.39;
      vec2 d = vec2(cos(an), sin(an));
      hole += 1.0 - aAt(d * r);
      hole += 1.0 - aAt(d * r * 0.45);
    }
    e = smoothstep(0.0, 0.55, hole / 16.0);
    c *= 1.0 - uEdge.z * (1.0 - e);
    c *= 1.0 + uEdge.w * e;
  }
  vec3 mul = vec3(0.0);
  vec3 add = vec3(0.0);
  vec3 rimAdd = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    vec4 L = uL[i];
    if (L.w <= 0.0) continue;
    vec2 toL = L.xy - vScreen;
    float dist = length(toL);
    float d = dist / L.z;
    float f = clamp(1.0 - d, 0.0, 1.0);
    f = f * f;
    mul += uLC[i].rgb * L.w * f;
    add += uLC[i].rgb * L.w * f * f * uLC[i].a;
    if (uRimDir.w > 0.0 && f > 0.0) {
      vec2 dir = toL / max(dist, 1.0);
      float open = 1.0 - aAt(dir * uRimDir.z);
      rimAdd += uLC[i].rgb * L.w * sqrt(f) * open;
    }
  }
  c = c * (1.0 + mul * uMot.w * 2.2) + add * uMot.w;
  c += rimAdd * uRimDir.w * uMot.w;
  if (uRim.a > 0.0) {
    float open = 1.0 - aAt(uRimDir.xy * uRimDir.z);
    float open2 = 1.0 - aAt(uRimDir.xy * uRimDir.z * 2.5);
    c += uRim.rgb * uRim.a * (open * 0.75 + open2 * 0.25);
  }
  float n = fbm3(vScreen / uMot.y + uMot.z) - 0.5;
  float n2 = vnoise(vScreen / (uMot.y * 0.16) + uMot.z * 1.7) - 0.5;
  c *= 1.0 + uMot.x * (n * 1.5 + n2 * 0.45);
  if (uBrush.x > 0.0) {
    // Strokes: noise stretched along a direction that itself wanders, so it reads as dabs of paint.
    float wob = (fbm3(vScreen / 380.0 + uMot.z * 3.1) - 0.5) * 1.6;
    float an = uBrush.z + wob;
    vec2 dir = vec2(cos(an), sin(an));
    vec2 q = vec2(dot(vScreen, dir) / uBrush.y, dot(vScreen, vec2(-dir.y, dir.x)) / uBrush.w);
    float st = vnoise(q + uMot.z * 5.0) * 0.65 + vnoise(q * 2.3 + 7.0) * 0.35 - 0.5;
    c *= 1.0 + uBrush.x * st * 2.0;
  }
  float fk = uFog.a + mix(uFogRamp.z, uFogRamp.w, smoothstep(uFogRamp.x, uFogRamp.y, vScreen.y));
  fk += uEdge.y * e;
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
  /** Silhouette edges: sample radius px, extra fog at the edge, core darkening, edge lift. */
  edge?: readonly [number, number, number, number];
  /** Rim of the key light on edges facing `rimDir`: colour, amount. */
  rim?: number;
  rimK?: number;
  /** Toward the key light (screen, y down). */
  rimDir?: readonly [number, number];
  /** Rim width px. */
  rimW?: number;
  /** Rim from the scene's point lights on edges facing them. */
  rimLights?: number;
  /** Brush strokes in value: amount, stroke length px, angle rad, width px. */
  brush?: readonly [number, number, number, number];
  /** Paint (Kuwahara) radius px after the atmosphere: flattens noise into dabs; 0 = off. */
  paint?: number;
  /** A second look right of a vertical split: fog and ambient blend from `split[0]` to `split[1]` (screen x). */
  split?: { x0: number; x1: number; fog: number; amb?: number; sat?: number };
}

const rgb3 = (hex: number): [number, number, number] => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

const norm2 = (v: readonly [number, number]): [number, number] => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

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
      uEdge: { value: new Float32Array(spec.edge ?? [0, 0, 0, 0]), type: 'vec4<f32>' },
      uRim: { value: new Float32Array([...rgb3(spec.rim ?? 0xffffff), spec.rimK ?? 0]), type: 'vec4<f32>' },
      uRimDir: {
        value: new Float32Array([...norm2(spec.rimDir ?? [0.4, -0.9]), spec.rimW ?? 3, spec.rimLights ?? 0]),
        type: 'vec4<f32>',
      },
      uBrush: { value: new Float32Array(spec.brush ?? [0, 40, 0, 6]), type: 'vec4<f32>' },
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
    if (spec.paint && spec.paint > 0) filters.push(new PaintFilter(spec.paint));
    if (spec.blur && spec.blur > 0)
      filters.push(new BlurFilter({ strength: spec.blur, quality: 4, resolution: 1, padding: 0 }));
    this.view.filters = filters;
    this.view.filterArea = new Rectangle(0, 0, VIEW_W, VIEW_H);
  }
}

const PAINT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
in vec2 vTexel;
in vec4 vClamp;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uPaint; // radius px
vec4 at(vec2 o) { return texture(uTexture, clamp(vTextureCoord + o * vTexel, vClamp.xy, vClamp.zw)); }
void main() {
  // Kuwahara over four overlapping quadrants: each pixel takes the mean of its calmest quadrant,
  // so noise settles into flat dabs while edges stay where they are.
  vec4 c0 = at(vec2(0.0));
  if (c0.a <= 0.002) { finalColor = vec4(0.0); return; }
  int R = int(uPaint.x);
  vec4 m[4];
  vec3 s2[4];
  for (int k = 0; k < 4; k++) { m[k] = vec4(0.0); s2[k] = vec3(0.0); }
  for (int j = 0; j <= 6; j++) {
    if (j > R) break;
    for (int i = 0; i <= 6; i++) {
      if (i > R) break;
      vec2 o = vec2(float(i), float(j));
      vec4 a = at(vec2(-o.x, -o.y));
      vec4 b = at(vec2(o.x, -o.y));
      vec4 cc = at(vec2(-o.x, o.y));
      vec4 d = at(vec2(o.x, o.y));
      m[0] += a; s2[0] += a.rgb * a.rgb;
      m[1] += b; s2[1] += b.rgb * b.rgb;
      m[2] += cc; s2[2] += cc.rgb * cc.rgb;
      m[3] += d; s2[3] += d.rgb * d.rgb;
    }
  }
  float n = float((R + 1) * (R + 1));
  float best = 1e9;
  vec4 outC = c0;
  for (int k = 0; k < 4; k++) {
    vec4 mu = m[k] / n;
    vec3 v = abs(s2[k] / n - mu.rgb * mu.rgb);
    float sg = v.r + v.g + v.b;
    if (sg < best) { best = sg; outC = mu; }
  }
  // Keep the silhouette: alpha from the pixel itself, colour from the calm quadrant.
  outC.rgb = outC.a > 0.002 ? outC.rgb / outC.a * c0.a : c0.rgb;
  finalColor = vec4(outC.rgb, c0.a);
}`;

/** Kuwahara "paint": noise inside shapes flattens into dabs, edges kept. */
export class PaintFilter extends Filter {
  constructor(radius: number) {
    super({
      glProgram: GlProgram.from({ vertex: FILTER_VERT, fragment: PAINT_FRAG, name: 'wc-paint' }),
      resources: {
        paint: new UniformGroup({
          uPaint: { value: new Float32Array([Math.min(6, Math.round(radius)), 0, 0, 0]), type: 'vec4<f32>' },
        }),
      },
      resolution: 1,
      padding: 0,
    });
  }
}
