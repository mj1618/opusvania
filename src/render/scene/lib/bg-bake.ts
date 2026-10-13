/**
 * Baking and cheap animation for the background layers (sky / far / mid).
 *
 *   bakeLayer()   draws a container of Graphics once into render-texture tiles, then runs the
 *                 "atmosphere" shader over them: form shading and a warm rim from the silhouette's
 *                 alpha (lit toward the key light), painterly mottle, height fog and the light
 *                 well. The result is a handful of static sprites.
 *   FogSheet      a live quad of drifting mist (two scrolling taps of a small noise texture).
 *   SwaySet       hanging vines / moss / canopy fronds as sprites from one baked atlas, rotated by
 *                 wind() each frame.
 *
 * All colours are premultiplied in shaders (Pixi's convention).
 */
import {
  BufferImageSource,
  Container,
  Graphics,
  Matrix,
  Mesh,
  MeshGeometry,
  MeshSimple,
  type Renderer,
  RenderTexture,
  Shader,
  Sprite,
  Texture,
  UniformGroup,
} from 'pixi.js';
import type { LayerRect } from '../layer-tree';
import { mix, prng, wind } from './look';

export const BG_VERT = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

export function rgb(hex: number): Float32Array {
  return new Float32Array([((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]);
}

export function quadGeometry(x: number, y: number, w: number, h: number, uv = [0, 0, 1, 1]): MeshGeometry {
  const [u0 = 0, v0 = 0, u1 = 1, v1 = 1] = uv;
  return new MeshGeometry({
    positions: new Float32Array([x, y, x + w, y, x + w, y + h, x, y + h]),
    uvs: new Float32Array([u0, v0, u1, v0, u1, v1, u0, v1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
}

// ---------------------------------------------------------------------------------------------
// Noise texture: 256x256, tileable, three independent fbm channels in RGB.
// ---------------------------------------------------------------------------------------------

let noiseTex: Texture | null = null;

export function noiseTexture(): Texture {
  if (noiseTex) return noiseTex;
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const r = prng(90210);
  for (let ch = 0; ch < 3; ch++) {
    const acc = new Float32Array(N * N);
    let amp = 0.5;
    for (let o = 0; o < 5; o++) {
      const P = 4 << o;
      const lat = new Float32Array(P * P);
      for (let i = 0; i < lat.length; i++) lat[i] = r();
      const cell = N / P;
      for (let y = 0; y < N; y++) {
        const fy = y / cell;
        const y0 = Math.floor(fy);
        const ty = fy - y0;
        const sy = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < N; x++) {
          const fx = x / cell;
          const x0 = Math.floor(fx);
          const tx = fx - x0;
          const sx = tx * tx * (3 - 2 * tx);
          const x1 = (x0 + 1) % P;
          const y1 = (y0 + 1) % P;
          const a = lat[y0 * P + x0] ?? 0;
          const b = lat[y0 * P + x1] ?? 0;
          const c = lat[y1 * P + x0] ?? 0;
          const d = lat[y1 * P + x1] ?? 0;
          acc[y * N + x] =
            (acc[y * N + x] ?? 0) + amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
        }
      }
      amp *= 0.5;
    }
    for (let i = 0; i < N * N; i++) {
      // The sum has mean ~0.484 and a narrow spread: stretch it to use the whole range.
      const v = ((acc[i] ?? 0) / 0.96875 - 0.5) * 2.4 + 0.5;
      data[i * 4 + ch] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
  }
  for (let i = 0; i < N * N; i++) data[i * 4 + 3] = 255;
  const source = new BufferImageSource({
    resource: data,
    width: N,
    height: N,
    format: 'rgba8unorm',
    scaleMode: 'linear',
    addressMode: 'repeat',
    alphaMode: 'no-premultiply-alpha',
  });
  noiseTex = new Texture({ source });
  return noiseTex;
}

// ---------------------------------------------------------------------------------------------
// Atmosphere bake
// ---------------------------------------------------------------------------------------------

export interface Atmosphere {
  fogColor: number;
  /** Fog mix above fogY0 and below fogY1 (layer y); blends between. */
  fogTop: number;
  fogGround: number;
  fogY0: number;
  fogY1: number;
  /** The light well: where the key light floods this layer. */
  wellX: number;
  wellY: number;
  wellR: number;
  wellColor: number;
  wellStrength: number;
  /** Form shading reach (layer px), lit gain, shadow loss. */
  formDist: number;
  formLit: number;
  formShade: number;
  /** Warm rim on edges facing the key light: width (layer px), colour, strength. */
  rimDist: number;
  rimColor: number;
  rimStrength: number;
  /** Painterly blotches, 0..~0.3. */
  mottle: number;
  /** Light map response: brightening where lit, how far lit foliage shifts to the sun colour. */
  litGain?: number;
  sunMix?: number;
  sunColor?: number;
  /** Multiplier applied in full light-map shadow (cool and dark). */
  shadeTint?: readonly [number, number, number];
  /** Final value gain and saturation of the local colours before fog (1 = unchanged). */
  gain?: number;
  saturation?: number;
}

const ATM_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uRaw;
uniform sampler2D uNoise;
uniform vec4 uRawRect;
uniform vec2 uPx;
uniform vec2 uLight;
uniform vec3 uFogColor;
uniform vec4 uFog;
uniform vec4 uWell;
uniform vec3 uWellColor;
uniform vec4 uForm;
uniform vec3 uRimColor;
uniform vec2 uRim;
uniform vec2 uGrade;
uniform sampler2D uLightMap;
uniform vec4 uLmRect;
uniform vec4 uSun;
uniform vec4 uShade;
float A(vec2 uv) { return texture(uRaw, uv).a; }
void main() {
  vec4 c = texture(uRaw, vUV);
  float a = c.a;
  if (a < 0.004) { fragColor = vec4(0.0); return; }
  vec3 col = c.rgb / a;
  vec2 p = uRawRect.xy + vUV * uRawRect.zw;
  vec2 L = uLight * uPx;
  float open = 0.0;
  float shut = 0.0;
  for (int i = 1; i <= 6; i++) {
    float d = uForm.x * float(i) / 6.0;
    open += 1.0 - A(vUV + L * d);
    shut += 1.0 - A(vUV - L * d);
  }
  open /= 6.0;
  shut /= 6.0;
  float n1 = texture(uNoise, p / 900.0).r;
  float n2 = texture(uNoise, p / 230.0).g;
  float n3 = texture(uNoise, p / 61.0).b;
  col *= 1.0 + uForm.w * ((n1 - 0.5) * 1.3 + (n2 - 0.5) * 0.7 + (n3 - 0.5) * 0.25);
  col *= 1.0 + uForm.y * open - uForm.z * shut * (1.0 - open);
  // Painted light: soft blobs laid down with the shapes (0.5 = neutral).
  float lm = texture(uLightMap, (p - uLmRect.xy) / uLmRect.zw).r;
  float lit = clamp((lm - 0.5) * 2.0, 0.0, 1.0);
  float shd = clamp((0.5 - lm) * 2.0, 0.0, 1.0);
  col = mix(col, col * uShade.rgb, shd);
  col *= 1.0 + uShade.a * lit;
  // Lit foliage turns toward the sun colour at its own brightness (translucent, yellow-green).
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  col = mix(col, uSun.rgb * (0.35 + 1.6 * lum), lit * uSun.a);
  col = mix(vec3(dot(col, vec3(0.3, 0.55, 0.15))), col, uGrade.y) * uGrade.x;
  vec2 dw = (p - uWell.xy) / uWell.z;
  float w = exp(-dot(dw, dw));
  float rim = (1.0 - A(vUV + L * uRim.x)) * 0.6 + (1.0 - A(vUV + L * uRim.x * 0.45)) * 0.4;
  // Only edges with a body behind them catch the rim (thin vines and strands must not glow).
  rim *= A(vUV - L * uRim.x * 2.0);
  col += uRimColor * rim * uRim.y * (0.3 + 0.7 * w);
  float f = mix(uFog.x, uFog.y, smoothstep(uFog.z, uFog.w, p.y));
  col = mix(col, uFogColor, f);
  col = mix(col, uWellColor, w * uWell.w);
  fragColor = vec4(col * a, a);
}`;

function fogAt(atm: Atmosphere, y: number): number {
  const t = Math.max(0, Math.min(1, (y - atm.fogY0) / (atm.fogY1 - atm.fogY0)));
  return atm.fogTop + (atm.fogGround - atm.fogTop) * (t * t * (3 - 2 * t));
}

function grade(color: number, gain: number, sat: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const l = r * 0.3 + g * 0.55 + b * 0.15;
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round((l + (v - l) * sat) * gain)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/** CPU twin of the shader's fog + well tint, for things drawn outside the bake (sway sprites). */
export function atmTone(atm: Atmosphere, color: number, x: number, y: number): number {
  const c = mix(grade(color, atm.gain ?? 1, atm.saturation ?? 1), atm.fogColor, fogAt(atm, y));
  const dx = (x - atm.wellX) / atm.wellR;
  const dy = (y - atm.wellY) / atm.wellR;
  return mix(c, atm.wellColor, Math.exp(-(dx * dx + dy * dy)) * atm.wellStrength);
}

let softTex: Texture | null = null;

/** A soft round blob (white, smooth falloff to nothing at the edge), from a canvas gradient. */
export function softTexture(): Texture {
  if (softTex) return softTex;
  const N = 128;
  const canvas = document.createElement('canvas');
  canvas.width = N;
  canvas.height = N;
  const c2 = canvas.getContext('2d');
  if (c2) {
    const g = c2.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      g.addColorStop(t, `rgba(255,255,255,${(Math.cos(t * Math.PI) * 0.5 + 0.5) ** 1.3})`);
    }
    c2.fillStyle = g;
    c2.fillRect(0, 0, N, N);
  }
  softTex = Texture.from(canvas);
  return softTex;
}

let clearTex: Texture | null = null;
function clearTexture(): Texture {
  if (!clearTex) {
    clearTex = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array([0, 0, 0, 0]),
        width: 1,
        height: 1,
        format: 'rgba8unorm',
      }),
    });
  }
  return clearTex;
}

/** Renders a container of soft sprites (layer coordinates) into one small texture covering `rect`. */
export function bakeSoft(renderer: Renderer, c: Container, rect: LayerRect, scale: number): RenderTexture {
  const rt = RenderTexture.create({
    width: Math.ceil(rect.w * scale),
    height: Math.ceil(rect.h * scale),
    resolution: 1,
  });
  renderer.render({
    container: c,
    target: rt,
    clear: true,
    clearColor: [0, 0, 0, 0],
    transform: new Matrix(scale, 0, 0, scale, -rect.x * scale, -rect.y * scale),
  });
  c.destroy({ children: true });
  return rt;
}

let neutralTex: Texture | null = null;
function neutralTexture(): Texture {
  if (!neutralTex) {
    neutralTex = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array([128, 128, 128, 255]),
        width: 1,
        height: 1,
        format: 'rgba8unorm',
        alphaMode: 'no-premultiply-alpha',
      }),
    });
  }
  return neutralTex;
}

/**
 * Painted light for a layer: soft blobs laid down in the same painter's order as the shapes
 * (`reset` under a new shape, then its shadow and its light). Baked small; the atmosphere shader
 * multiplies the layer by it, so shapes get soft volume without any hard-edged shading polygons.
 */
export class LightMap {
  private readonly c = new Container();
  private add(x: number, y: number, rx: number, ry: number, tint: number, alpha: number): void {
    const s = new Sprite(softTexture());
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.setSize(rx * 2, ry * 2);
    s.tint = tint;
    s.alpha = Math.max(0, Math.min(1, alpha));
    this.c.addChild(s);
  }
  lit(x: number, y: number, rx: number, ry: number, amount: number): void {
    this.add(x, y, rx, ry, 0xffffff, amount);
  }
  shade(x: number, y: number, rx: number, ry: number, amount: number): void {
    this.add(x, y, rx, ry, 0x000000, amount);
  }
  reset(x: number, y: number, rx: number, ry: number, amount = 0.85): void {
    this.add(x, y, rx, ry, 0x808080, amount);
  }
  render(renderer: Renderer, rect: LayerRect, scale: number): RenderTexture {
    const rt = RenderTexture.create({
      width: Math.ceil(rect.w * scale),
      height: Math.ceil(rect.h * scale),
      resolution: 1,
    });
    renderer.render({
      container: this.c,
      target: rt,
      clear: true,
      clearColor: [0.5, 0.5, 0.5, 1],
      transform: new Matrix(scale, 0, 0, scale, -rect.x * scale, -rect.y * scale),
    });
    this.c.destroy({ children: true });
    return rt;
  }
}

export interface BakedTile {
  texture: Texture;
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_TILE_W = 2048;
const MAX_TILE_H = 4096;

/**
 * Bakes `content` (authored in layer coordinates) over `rect` at `scale` texture px per layer px.
 * Returns the tiles (textures + their layer rects) for a LayerView. `content` is not destroyed.
 */
export function bakeLayer(
  renderer: Renderer,
  content: Container,
  rect: LayerRect,
  scale: number,
  atm: Atmosphere,
  light: { x: number; y: number },
  lightMap?: LightMap,
): BakedTile[] {
  const out: BakedTile[] = [];
  const pad = Math.ceil(Math.max(atm.formDist, atm.rimDist) + 4);
  const cols = Math.ceil((rect.w * scale) / MAX_TILE_W);
  const rows = Math.ceil((rect.h * scale) / MAX_TILE_H);
  const tw = rect.w / cols;
  const th = rect.h / rows;
  const noise = noiseTexture();
  const lm = lightMap ? lightMap.render(renderer, rect, Math.max(0.12, scale * 0.25)) : null;
  const st = atm.shadeTint ?? [0.34, 0.46, 0.6];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const tx = rect.x + i * tw;
      const ty = rect.y + j * th;
      const rawW = Math.ceil((tw + pad * 2) * scale);
      const rawH = Math.ceil((th + pad * 2) * scale);
      const raw = RenderTexture.create({ width: rawW, height: rawH, resolution: 1, antialias: true });
      renderer.render({
        container: content,
        target: raw,
        clear: true,
        clearColor: [0, 0, 0, 0],
        transform: new Matrix(scale, 0, 0, scale, -(tx - pad) * scale, -(ty - pad) * scale),
      });
      const W = Math.ceil(tw * scale);
      const H = Math.ceil(th * scale);
      const final = RenderTexture.create({ width: W, height: H, resolution: 1 });
      const u0 = (pad * scale) / rawW;
      const v0 = (pad * scale) / rawH;
      const shader = Shader.from({
        gl: { vertex: BG_VERT, fragment: ATM_FRAG },
        resources: {
          uRaw: raw.source,
          uNoise: noise.source,
          uLightMap: (lm ?? neutralTexture()).source,
          atm: new UniformGroup({
            uLmRect: { value: new Float32Array([rect.x, rect.y, rect.w, rect.h]), type: 'vec4<f32>' },
            uSun: {
              value: new Float32Array([...rgb(atm.sunColor ?? 0xc9d977), atm.sunMix ?? 0.3]),
              type: 'vec4<f32>',
            },
            uShade: { value: new Float32Array([st[0], st[1], st[2], atm.litGain ?? 1.2]), type: 'vec4<f32>' },
            uRawRect: {
              value: new Float32Array([tx - pad, ty - pad, rawW / scale, rawH / scale]),
              type: 'vec4<f32>',
            },
            uPx: { value: new Float32Array([scale / rawW, scale / rawH]), type: 'vec2<f32>' },
            uLight: { value: new Float32Array([light.x, light.y]), type: 'vec2<f32>' },
            uFogColor: { value: rgb(atm.fogColor), type: 'vec3<f32>' },
            uFog: {
              value: new Float32Array([atm.fogTop, atm.fogGround, atm.fogY0, atm.fogY1]),
              type: 'vec4<f32>',
            },
            uWell: {
              value: new Float32Array([atm.wellX, atm.wellY, atm.wellR, atm.wellStrength]),
              type: 'vec4<f32>',
            },
            uWellColor: { value: rgb(atm.wellColor), type: 'vec3<f32>' },
            uForm: {
              value: new Float32Array([atm.formDist, atm.formLit, atm.formShade, atm.mottle]),
              type: 'vec4<f32>',
            },
            uRimColor: { value: rgb(atm.rimColor), type: 'vec3<f32>' },
            uRim: { value: new Float32Array([atm.rimDist, atm.rimStrength]), type: 'vec2<f32>' },
            uGrade: { value: new Float32Array([atm.gain ?? 1, atm.saturation ?? 1]), type: 'vec2<f32>' },
          }),
        },
      });
      const mesh = new Mesh({
        geometry: quadGeometry(0, 0, W, H, [u0, v0, u0 + W / rawW, v0 + H / rawH]),
        shader,
      });
      renderer.render({ container: mesh, target: final, clear: true, clearColor: [0, 0, 0, 0] });
      mesh.destroy();
      shader.destroy();
      raw.destroy(true);
      // A hair of overlap so neighbouring tiles never leave a seam.
      out.push({ texture: final, x: tx, y: ty, w: tw + (i < cols - 1 ? 0.5 : 0), h: th });
    }
  }
  lm?.destroy(true);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Fog sheets
// ---------------------------------------------------------------------------------------------

export interface FogSpec {
  color: number;
  warm: number;
  /** Mist thickens from yTop (alphaTop x alpha) to yFull (alpha). Layer y. */
  yTop: number;
  yFull: number;
  alphaTop: number;
  alpha: number;
  /** Extra haze around the light well. */
  wellX: number;
  wellY: number;
  wellR: number;
  wellAlpha: number;
  /** Noise scale (1 / layer px) and drift speed (noise uv per second). */
  scale: number;
  speed: number;
  /** How much of the mist is wisps rather than an even veil, 0..1. */
  wisp: number;
}

/** Canopy rustle: the baked picture is nudged by drifting noise above `y1`, fading out by `y0`. */
export interface RustleSpec {
  /** Peak displacement in layer px. */
  amp: number;
  /** Full strength above y0 (layer y), none below y1. */
  y0: number;
  y1: number;
}

/**
 * The scene's three moods, by playfield x: the cool moonlit glade on the left, the golden light
 * well in the middle, the old dusk-lit stand on the right. Weights blend smoothly between them.
 */
export const ZONES = { l0: 1400, l1: 2500, r0: 3500, r1: 4500 } as const;

export function zoneWeights(x: number): { l: number; r: number } {
  const st = (a: number, b: number, v: number): number => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return { l: 1 - st(ZONES.l0, ZONES.l1, x), r: st(ZONES.r0, ZONES.r1, x) };
}

export interface ZoneWell {
  x: number;
  y: number;
  r: number;
  alpha: number;
  color: number;
}

/** How a layer takes on the zone moods. Applied live, per pixel, by the playfield x in front of it. */
export interface ZoneSpec {
  parallax: number;
  /** The x where all layers agree (layers.anchor.x). */
  anchorX: number;
  /** Colour multipliers for the layer itself in the left / right zone. */
  tintL: readonly [number, number, number];
  tintR: readonly [number, number, number];
  /** Mist colour in the left / right zone. */
  mistL: number;
  mistR: number;
  /** A haze of light in front of the layer that only shows in its zone (the moon, the dusk gap). */
  wellL?: ZoneWell;
  wellR?: ZoneWell;
}

const VIEW_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex;
uniform sampler2D uNoise;
uniform vec4 uRect;
uniform float uTime;
uniform vec3 uMist;
uniform vec3 uWarm;
uniform vec4 uBand;
uniform vec4 uWell;
uniform vec3 uNoiseP;
uniform vec3 uRustle;
uniform vec4 uZone;
uniform vec3 uTintL;
uniform vec3 uTintR;
uniform vec3 uMistL;
uniform vec3 uMistR;
uniform vec4 uWellL;
uniform vec3 uWellLCol;
uniform vec4 uWellR;
uniform vec3 uWellRCol;
uniform sampler2D uBack;
uniform vec4 uBackRect;
void main() {
  vec2 p = uRect.xy + vUV * uRect.zw;
  vec2 uv = vUV;
  float sw = uRustle.x * (1.0 - smoothstep(uRustle.y, uRustle.z, p.y));
  if (sw > 0.0) {
    // Still at the tile's side edges so neighbouring tiles agree.
    sw *= smoothstep(0.0, 0.02, vUV.x) * (1.0 - smoothstep(0.98, 1.0, vUV.x));
    vec2 q = p * 0.0019 + vec2(uTime * 0.045, uTime * 0.012);
    vec2 n = texture(uNoise, q).rb + texture(uNoise, q * 3.1 + vec2(-uTime * 0.07, 0.3)).gr * 0.5 - 0.75;
    uv += n * sw / uRect.zw;
  }
  vec4 c = texture(uTex, uv);
  // Zone mood by the playfield x this pixel sits behind.
  float px = p.x + uZone.x;
  float zl = 1.0 - smoothstep(${ZONES.l0}.0, ${ZONES.l1}.0, px);
  float zr = smoothstep(${ZONES.r0}.0, ${ZONES.r1}.0, px);
  c.rgb *= mix(vec3(1.0), uTintL, zl) * mix(vec3(1.0), uTintR, zr);
  // Light painted behind the layer (sky seen through the canopy's openings).
  c += texture(uBack, (p - uBackRect.xy) / uBackRect.zw) * (1.0 - c.a);
  vec3 mist = mix(mix(uMist, uMistL, zl), uMistR, zr);
  float s = uNoiseP.x;
  float n = texture(uNoise, vec2(p.x * s + uTime * uNoiseP.y, p.y * s * 2.6)).r;
  float m = texture(uNoise, vec2(p.x * s * 2.3 - uTime * uNoiseP.y * 1.7, p.y * s * 4.1 + uTime * uNoiseP.y * 0.4)).g;
  float wisp = smoothstep(0.3, 0.85, n * 0.65 + m * 0.5);
  float low = smoothstep(uBand.x, uBand.y, p.y);
  float band = mix(uBand.z, 1.0, low);
  vec2 dw = (p - uWell.xy) / uWell.z;
  float w = exp(-dot(dw, dw));
  float breathe = 1.0 + 0.07 * sin(uTime * 0.37);
  float veil = mix(1.0, wisp * 1.7, uNoiseP.z * (1.0 - 0.75 * low));
  float a0 = uBand.w * band * veil + w * uWell.w * breathe * (0.7 + 0.3 * wisp);
  vec3 acc = mix(mist, uWarm, clamp(w * 1.15, 0.0, 1.0)) * a0;
  vec2 dl = (p - uWellL.xy) / uWellL.z;
  float al = exp(-dot(dl, dl)) * uWellL.w * uZone.y * (0.75 + 0.25 * wisp);
  vec2 dr = (p - uWellR.xy) / uWellR.z;
  float ar = exp(-dot(dr, dr)) * uWellR.w * uZone.z * breathe * (0.75 + 0.25 * wisp);
  acc += uWellLCol * al + uWellRCol * ar;
  float a = a0 + al + ar;
  float k = min(a, 0.97) / max(a, 0.0001);
  fragColor = c * (1.0 - a * k) + vec4(acc * k, a * k);
}`;

/**
 * Shows a baked layer with the mist that hangs in front of it, in one pass per tile (a separate
 * full-screen fog quad per layer doubled the fill cost). Also rustles the canopy and grades the
 * layer by zone.
 */
export class LayerView {
  readonly container = new Container({ label: 'baked+fog' });
  private readonly uniforms: UniformGroup;

  constructor(
    tiles: readonly BakedTile[],
    fog: FogSpec,
    rustle: RustleSpec,
    private readonly zone: ZoneSpec,
    back?: { texture: Texture; rect: LayerRect },
  ) {
    const well = (z: ZoneWell | undefined): Float32Array =>
      new Float32Array(z ? [z.x, z.y, z.r, z.alpha] : [0, 0, 1, 0]);
    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uMist: { value: rgb(fog.color), type: 'vec3<f32>' },
      uWarm: { value: rgb(fog.warm), type: 'vec3<f32>' },
      uBand: { value: new Float32Array([fog.yTop, fog.yFull, fog.alphaTop, fog.alpha]), type: 'vec4<f32>' },
      uWell: { value: new Float32Array([fog.wellX, fog.wellY, fog.wellR, fog.wellAlpha]), type: 'vec4<f32>' },
      uNoiseP: { value: new Float32Array([fog.scale, fog.speed, fog.wisp]), type: 'vec3<f32>' },
      uRustle: { value: new Float32Array([rustle.amp, rustle.y0, rustle.y1]), type: 'vec3<f32>' },
      uZone: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
      uTintL: { value: new Float32Array(zone.tintL), type: 'vec3<f32>' },
      uTintR: { value: new Float32Array(zone.tintR), type: 'vec3<f32>' },
      uMistL: { value: rgb(zone.mistL), type: 'vec3<f32>' },
      uMistR: { value: rgb(zone.mistR), type: 'vec3<f32>' },
      uWellL: { value: well(zone.wellL), type: 'vec4<f32>' },
      uWellLCol: { value: rgb(zone.wellL?.color ?? 0), type: 'vec3<f32>' },
      uWellR: { value: well(zone.wellR), type: 'vec4<f32>' },
      uWellRCol: { value: rgb(zone.wellR?.color ?? 0), type: 'vec3<f32>' },
      uBackRect: {
        value: new Float32Array(back ? [back.rect.x, back.rect.y, back.rect.w, back.rect.h] : [0, 0, 1, 1]),
        type: 'vec4<f32>',
      },
    });
    for (const t of tiles) {
      const shader = Shader.from({
        gl: { vertex: BG_VERT, fragment: VIEW_FRAG },
        resources: {
          uTex: t.texture.source,
          uNoise: noiseTexture().source,
          uBack: (back?.texture ?? clearTexture()).source,
          view: this.uniforms,
          tile: new UniformGroup({
            uRect: { value: new Float32Array([t.x, t.y, t.w, t.h]), type: 'vec4<f32>' },
          }),
        },
      });
      this.container.addChild(new Mesh({ geometry: quadGeometry(t.x, t.y, t.w, t.h), shader }));
    }
  }

  update(clock: number, camX: number): void {
    const u = this.uniforms.uniforms;
    u.uTime = clock;
    const z = zoneWeights(camX);
    (u.uZone as Float32Array).set([(camX - this.zone.anchorX) * (1 - this.zone.parallax), z.l, z.r, 0]);
  }
}

// ---------------------------------------------------------------------------------------------
// Sway: things that hang and bend
// ---------------------------------------------------------------------------------------------

/** Something that hangs from (x, y) and swings. `draw` paints it with its top-centre at (0, 0). */
export interface SwayItem {
  x: number;
  y: number;
  /** Bounds of the drawing: [-w/2, w/2] x [-up, h]. */
  w: number;
  h: number;
  up?: number;
  /** Swing in radians at full wind. */
  amp: number;
  phase: number;
  /** Extra quick flutter (canopy fronds), 0..1. */
  flutter?: number;
  draw(g: Graphics): void;
}

const SWAY_SEGMENTS = 6;

/**
 * Vines, moss and fronds drawn into one atlas, each shown as a narrow strip mesh that bends along
 * its length: the top stays put, the tip swings furthest, with a lagging ripple running down it.
 */
export class SwaySet {
  readonly container = new Container({ label: 'sway' });
  private readonly strips: Array<{ m: MeshSimple; item: SwayItem; base: Float32Array }> = [];

  constructor(renderer: Renderer, items: readonly SwayItem[], scale: number) {
    if (items.length === 0) return;
    const pad = 3;
    const maxW = 2048 / scale;
    const order = [...items].sort((a, b) => b.h + (b.up ?? 0) - (a.h + (a.up ?? 0)));
    const sheet = new Container();
    const slots: Array<{ item: SwayItem; x: number; y: number; w: number; h: number }> = [];
    let x = 0;
    let y = 0;
    let rowH = 0;
    let sheetW = 0;
    for (const item of order) {
      const w = item.w + pad * 2;
      const h = item.h + (item.up ?? 0) + pad * 2;
      if (x + w > maxW && x > 0) {
        x = 0;
        y += rowH;
        rowH = 0;
      }
      const g = new Graphics();
      item.draw(g);
      g.position.set(x + w / 2, y + pad + (item.up ?? 0));
      sheet.addChild(g);
      slots.push({ item, x, y, w, h });
      x += w;
      rowH = Math.max(rowH, h);
      sheetW = Math.max(sheetW, x);
    }
    const sheetH = y + rowH;
    const rt = RenderTexture.create({
      width: Math.ceil(sheetW * scale),
      height: Math.ceil(sheetH * scale),
      resolution: 1,
      antialias: true,
    });
    renderer.render({
      container: sheet,
      target: rt,
      clear: true,
      clearColor: [0, 0, 0, 0],
      transform: new Matrix(scale, 0, 0, scale, 0, 0),
    });
    sheet.destroy({ children: true });
    const n = SWAY_SEGMENTS;
    for (const sl of slots) {
      const up = pad + (sl.item.up ?? 0);
      const verts = new Float32Array((n + 1) * 4);
      const uvs = new Float32Array((n + 1) * 4);
      const idx = new Uint32Array(n * 6);
      for (let i = 0; i <= n; i++) {
        const v = i / n;
        const ly = -up + sl.h * v;
        verts.set([-sl.w / 2, ly, sl.w / 2, ly], i * 4);
        const ty = (sl.y + sl.h * v) / sheetH;
        uvs.set([sl.x / sheetW, ty, (sl.x + sl.w) / sheetW, ty], i * 4);
        if (i < n) idx.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2], i * 6);
      }
      const m = new MeshSimple({ texture: rt, vertices: verts.slice(), uvs, indices: idx });
      m.autoUpdate = false;
      m.position.set(sl.item.x, sl.item.y);
      this.container.addChild(m);
      this.strips.push({ m, item: sl.item, base: verts });
    }
  }

  update(clock: number, vis: LayerRect): void {
    const x0 = vis.x - 300;
    const x1 = vis.x + vis.w + 300;
    for (const { m, item, base } of this.strips) {
      const on = item.x > x0 && item.x < x1;
      m.visible = on;
      if (!on) continue;
      const v = m.vertices;
      const fl = item.flutter ?? 0;
      for (let i = 0; i < v.length; i += 2) {
        const by = base[i + 1] ?? 0;
        const t = by <= 0 ? 0 : by / item.h;
        // The tip lags the root: sample the wind a little in the past further down.
        const wv = wind(item.x, clock - t * 0.55, item.phase);
        const quick = fl * Math.sin(clock * 3.3 + item.phase * 40 + t * 3) * 0.35;
        v[i] = (base[i] ?? 0) + (wv + quick) * item.amp * t ** 1.6 * item.h;
      }
      m.geometry.getBuffer('aPosition').update();
    }
  }
}

/** A soft round glow (white), for additive sprites. */
export function glowTexture(_renderer?: Renderer): Texture {
  return softTexture();
}
