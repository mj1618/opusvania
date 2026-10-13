/**
 * Baking and cheap animation for the background layers (sky / far / mid).
 *
 *   bakeLayer()   draws a container of Graphics once into render-texture tiles, then runs the
 *                 "atmosphere" shader over them: form shading and a warm rim from the silhouette's
 *                 alpha (lit toward the key light), painterly mottle, height fog and the light
 *                 well. The result is a handful of static sprites.
 *   FogSheet      a live quad of drifting mist (two scrolling taps of a small noise texture).
 *   SwaySet       hanging vines / moss / canopy fronds from one baked atlas, bent in a vertex shader.
 *   FarPairView   sky + the two farthest layers in one opaque pass.
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
  type Renderer,
  RenderTexture,
  Shader,
  Sprite,
  Texture,
  UniformGroup,
} from 'pixi.js';
import type { LayerRect } from '../layer-tree';
import { mix, prng } from './look';

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

/**
 * The scene's three moods, by playfield x: the cool moonlit glade on the left, the golden light
 * well in the middle, the old dusk-lit stand on the right. Weights blend smoothly between them.
 */
export const ZONES = { l0: 1400, l1: 2500, r0: 3500, r1: 4500 } as const;

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
  /**
   * Sun colour in the left / right zone (moonlit silver-blue, dusk rose-gold). Baked by position, so
   * it needs the layer's parallax to know which playfield x a point sits behind.
   */
  sunColorL?: number;
  sunColorR?: number;
  zoneParallax?: number;
  /**
   * In the side zones the sun colour belongs on edges only (a rim and the leaves by an opening), so
   * clump bodies keep their deep local colour: share of the body tint kept (default 1 = everywhere),
   * share of the lit brightening kept, and extra rim strength there.
   */
  sideBody?: number;
  /** Colour multiplier on the local colours before fog (hue commitment of the layer). */
  tint?: readonly [number, number, number];
  /** A dark lid: the layer is multiplied by `lid` above lidY0 (layer y), fading out by lidY1. */
  lid?: number;
  lidY0?: number;
  lidY1?: number;
  /** Gaussian blur baked into the layer, sigma in layer px (depth of field). */
  blur?: number;
  sideLit?: number;
  sideRim?: number;
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
uniform vec3 uSunL;
uniform vec3 uSunR;
uniform vec3 uZoneMap;
uniform vec3 uSide;
uniform vec3 uTint;
uniform vec3 uLid;
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
  float pxe = uZoneMap.x + (p.x - uZoneMap.x) * uZoneMap.y;
  float zl = (1.0 - smoothstep(${ZONES.l0}.0, ${ZONES.l1}.0, pxe)) * uZoneMap.z;
  float zr = smoothstep(${ZONES.r0}.0, ${ZONES.r1}.0, pxe) * uZoneMap.z;
  float zs = max(zl, zr);
  col *= 1.0 + uShade.a * lit * mix(1.0, uSide.y, zs);
  // Lit foliage turns toward the sun colour at its own brightness (translucent, yellow-green).
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  vec3 sun = mix(mix(uSun.rgb, uSunL, zl), uSunR, zr);
  // Edges open toward the light (the silhouette and the brink of every opening).
  float edge = smoothstep(0.08, 0.55, open);
  float body = mix(1.0, uSide.x + (1.0 - uSide.x) * edge, zs);
  col = mix(col, sun * (0.35 + 1.6 * lum), lit * uSun.a * body);
  col = mix(vec3(dot(col, vec3(0.3, 0.55, 0.15))), col, uGrade.y) * uGrade.x * uTint;
  col *= mix(uLid.z, 1.0, smoothstep(uLid.x, uLid.y, p.y));
  vec2 dw = (p - uWell.xy) / uWell.z;
  float w = exp(-dot(dw, dw));
  float rim = (1.0 - A(vUV + L * uRim.x)) * 0.6 + (1.0 - A(vUV + L * uRim.x * 0.45)) * 0.4;
  // Only edges with a body behind them catch the rim (thin vines and strands must not glow).
  rim *= A(vUV - L * uRim.x * 2.0);
  col += mix(uRimColor, sun, zs) * rim * uRim.y * (0.3 + 0.7 * w + uSide.z * zs * (0.4 + 0.6 * lit));
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

const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform vec2 uStep;
void main() {
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -6; i <= 6; i++) {
    float x = float(i) * 0.5;
    float w = exp(-0.5 * x * x);
    acc += texture(uSrc, vUV + uStep * x) * w;
    wsum += w;
  }
  fragColor = acc / wsum;
}`;

/** One direction of a 13-tap gaussian; `step` is one sigma in uv. */
function blurPass(
  renderer: Renderer,
  src: Texture,
  dst: RenderTexture,
  geometry: MeshGeometry,
  step: number[],
): void {
  const shader = Shader.from({
    gl: { vertex: BG_VERT, fragment: BLUR_FRAG },
    resources: {
      uSrc: src.source,
      blur: new UniformGroup({ uStep: { value: new Float32Array(step), type: 'vec2<f32>' } }),
    },
  });
  const mesh = new Mesh({ geometry, shader });
  renderer.render({ container: mesh, target: dst, clear: true, clearColor: [0, 0, 0, 0] });
  mesh.destroy();
  shader.destroy();
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
  const blur = atm.blur ?? 0;
  const pad = Math.ceil(Math.max(atm.formDist, atm.rimDist) + 4 + blur * 3);
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
            uSunL: { value: rgb(atm.sunColorL ?? atm.sunColor ?? 0xc9d977), type: 'vec3<f32>' },
            uSunR: { value: rgb(atm.sunColorR ?? atm.sunColor ?? 0xc9d977), type: 'vec3<f32>' },
            uTint: { value: new Float32Array(atm.tint ?? [1, 1, 1]), type: 'vec3<f32>' },
            uLid: {
              value: new Float32Array([atm.lidY0 ?? -1e5, atm.lidY1 ?? -1e5 + 1, atm.lid ?? 1]),
              type: 'vec3<f32>',
            },
            uSide: {
              value: new Float32Array([atm.sideBody ?? 1, atm.sideLit ?? 1, atm.sideRim ?? 0]),
              type: 'vec3<f32>',
            },
            uZoneMap: {
              value: new Float32Array([2880, 1 / (atm.zoneParallax ?? 1), atm.zoneParallax ? 1 : 0]),
              type: 'vec3<f32>',
            },
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
      if (blur > 0) {
        // Atmosphere over the whole padded tile, then blur across (padded) and down (cropping).
        const a = RenderTexture.create({ width: rawW, height: rawH, resolution: 1 });
        const b = RenderTexture.create({ width: rawW, height: rawH, resolution: 1 });
        const full = new Mesh({ geometry: quadGeometry(0, 0, rawW, rawH), shader });
        renderer.render({ container: full, target: a, clear: true, clearColor: [0, 0, 0, 0] });
        full.destroy();
        const sigma = blur * scale;
        blurPass(renderer, a, b, quadGeometry(0, 0, rawW, rawH), [sigma / rawW, 0]);
        blurPass(renderer, b, final, mesh.geometry, [0, sigma / rawH]);
        a.destroy(true);
        b.destroy(true);
      } else {
        renderer.render({ container: mesh, target: final, clear: true, clearColor: [0, 0, 0, 0] });
      }
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

const SWAY_VERT = `
in vec2 aPosition;
in vec2 aUV;
in vec4 aSway;
in float aFlutter;
out vec2 vUV;
out float vX;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uSwayT;
// The same travelling wave as wind() in look.ts.
float windAt(float x, float clock, float phase) {
  float t = clock * 0.9 - x * 0.0016 + phase * 6.283;
  float gust = 0.5 + 0.5 * sin(clock * 0.23 - x * 0.0005);
  return sin(t) * (0.35 + 0.45 * gust) + sin(t * 2.7 + 1.3) * 0.14 + sin(t * 5.1) * 0.05;
}
void main() {
  float tt = aSway.w;
  // The tip lags the root: it feels the wind a little later.
  float w = windAt(aSway.x, uSwayT.x - tt * 0.55, aSway.y);
  float quick = aFlutter * sin(uSwayT.x * 3.3 + aSway.y * 40.0 + tt * 3.0) * 0.35;
  vec2 pos = aPosition;
  pos.x += (w + quick) * aSway.z * pow(tt, 1.6);
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(pos, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vX = pos.x;
}`;

const SWAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
in float vX;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec4 uSwayT;
uniform vec3 uTintL;
uniform vec3 uTintR;
void main() {
  vec4 c = texture(uTex, vUV);
  float px = vX + uSwayT.y;
  float zl = 1.0 - smoothstep(${ZONES.l0}.0, ${ZONES.l1}.0, px);
  float zr = smoothstep(${ZONES.r0}.0, ${ZONES.r1}.0, px);
  c.rgb *= mix(vec3(1.0), uTintL, zl) * mix(vec3(1.0), uTintR, zr);
  fragColor = c;
}`;

/**
 * Vines, moss and fronds drawn into one atlas and shown as ONE mesh of narrow strips. The vertex
 * shader bends each strip along its length (top fixed, tip swings furthest and lags) with the same
 * wave as wind(); the fragment shader grades it by zone like the baked layer. No per-frame CPU
 * work beyond two uniforms.
 */
export class SwaySet {
  readonly container = new Container({ label: 'sway' });
  private uniforms: UniformGroup | null = null;

  constructor(
    renderer: Renderer,
    items: readonly SwayItem[],
    scale: number,
    private readonly zone?: ZoneSpec,
  ) {
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
    const per = (n + 1) * 2;
    const pos = new Float32Array(slots.length * per * 2);
    const uvs = new Float32Array(slots.length * per * 2);
    const sway = new Float32Array(slots.length * per * 4);
    const flut = new Float32Array(slots.length * per);
    const idx = new Uint32Array(slots.length * n * 6);
    slots.forEach((sl, k) => {
      const it = sl.item;
      const up = pad + (it.up ?? 0);
      for (let i = 0; i <= n; i++) {
        const v = i / n;
        const ly = -up + sl.h * v;
        const tt = Math.max(0, ly / it.h);
        const ty = (sl.y + sl.h * v) / sheetH;
        for (let side = 0; side < 2; side++) {
          const vi = k * per + i * 2 + side;
          pos.set([it.x + (side === 0 ? -sl.w / 2 : sl.w / 2), it.y + ly], vi * 2);
          uvs.set([(sl.x + side * sl.w) / sheetW, ty], vi * 2);
          sway.set([it.x, it.phase, it.amp * it.h, tt], vi * 4);
          flut[vi] = it.flutter ?? 0;
        }
        if (i < n) {
          const b = k * per + i * 2;
          idx.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], (k * n + i) * 6);
        }
      }
    });
    const geometry = new MeshGeometry({ positions: pos, uvs, indices: idx });
    geometry.addAttribute('aSway', { buffer: sway, format: 'float32x4' });
    geometry.addAttribute('aFlutter', { buffer: flut, format: 'float32' });
    this.uniforms = new UniformGroup({
      uSwayT: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
      uTintL: { value: new Float32Array(zone?.tintL ?? [1, 1, 1]), type: 'vec3<f32>' },
      uTintR: { value: new Float32Array(zone?.tintR ?? [1, 1, 1]), type: 'vec3<f32>' },
    });
    const shader = Shader.from({
      gl: { vertex: SWAY_VERT, fragment: SWAY_FRAG },
      resources: { uTex: rt.source, sway: this.uniforms },
    });
    this.container.addChild(new Mesh({ geometry, shader }));
  }

  update(clock: number, camX: number): void {
    if (!this.uniforms) return;
    const shift = this.zone ? (camX - this.zone.anchorX) * (1 - this.zone.parallax) : 0;
    (this.uniforms.uniforms.uSwayT as Float32Array).set([clock, shift, 0, 0]);
  }
}

// ---------------------------------------------------------------------------------------------
// The two farthest layers and the sky in one pass
// ---------------------------------------------------------------------------------------------

/** GLSL for one layer's mist + wells, with every uniform suffixed (0 = farther layer, 1 = nearer). */
function mistGLSL(k: 0 | 1): string {
  return `
vec4 mist${k}(vec2 p, float zl, float zr, float wisp) {
  vec3 base = mix(mix(uMist${k}, uMistL${k}, zl), uMistR${k}, zr);
  float low = smoothstep(uBand${k}.x, uBand${k}.y, p.y);
  float band = mix(uBand${k}.z, 1.0, low);
  vec2 dw = (p - uWell${k}.xy) / uWell${k}.z;
  float w = exp(-dot(dw, dw));
  float breathe = 1.0 + 0.07 * sin(uTime * 0.37);
  float veil = mix(1.0, wisp * 1.7, uNoiseP${k}.z * (1.0 - 0.75 * low));
  float a0 = uBand${k}.w * band * veil + w * uWell${k}.w * breathe * (0.7 + 0.3 * wisp);
  vec3 acc = mix(base, uWarm${k}, clamp(w * 1.15, 0.0, 1.0)) * a0;
  vec2 dl = (p - uWellL${k}.xy) / uWellL${k}.z;
  float al = exp(-dot(dl, dl)) * uWellL${k}.w * uZone.y * (0.75 + 0.25 * wisp);
  vec2 dr = (p - uWellR${k}.xy) / uWellR${k}.z;
  float ar = exp(-dot(dr, dr)) * uWellR${k}.w * uZone.z * breathe * (0.75 + 0.25 * wisp);
  acc += uWellLCol${k} * al + uWellRCol${k} * ar;
  float a = a0 + al + ar;
  float s = min(a, 0.97) / max(a, 0.0001);
  return vec4(acc * s, a * s);
}`;
}

function mistDecl(k: 0 | 1): string {
  return [
    'vec3 uMist',
    'vec3 uWarm',
    'vec4 uBand',
    'vec4 uWell',
    'vec3 uNoiseP',
    'vec3 uTintL',
    'vec3 uTintR',
  ]
    .concat(['vec3 uMistL', 'vec3 uMistR', 'vec4 uWellL', 'vec3 uWellLCol', 'vec4 uWellR', 'vec3 uWellRCol'])
    .map((d) => `uniform ${d}${k};`)
    .join('\n');
}

const PAIR_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex0;
uniform sampler2D uTex1;
uniform sampler2D uSky;
uniform sampler2D uNoise;
uniform vec4 uRect;
uniform vec4 uRect0;
uniform float uTime;
uniform vec4 uCam;
uniform vec4 uPair;
uniform vec4 uSkyRect;
uniform vec3 uRustle;
uniform vec4 uZone;
${mistDecl(0)}
${mistDecl(1)}
${mistGLSL(0)}
${mistGLSL(1)}
void main() {
  vec2 p1 = uRect.xy + vUV * uRect.zw;
  // The same pixel in the farther layer's coordinates, and in logical view coordinates.
  vec2 p0 = p1 + uCam.xy * (uPair.z - uPair.w);
  vec2 view = (p1 - (uPair.xy + uCam.xy * uPair.w)) * uCam.z + uSkyRect.zw * 0.5 + uSkyRect.xy;
  vec3 sky = texture(uSky, (view - uSkyRect.xy) / uSkyRect.zw).rgb;
  float px = p1.x + uZone.x;
  float zl = 1.0 - smoothstep(${ZONES.l0}.0, ${ZONES.l1}.0, px);
  float zr = smoothstep(${ZONES.r0}.0, ${ZONES.r1}.0, px);
  vec2 uv = vUV;
  float sw = uRustle.x * (1.0 - smoothstep(uRustle.y, uRustle.z, p1.y));
  vec2 rn = vec2(0.0);
  if (sw > 0.0) {
    sw *= smoothstep(0.0, 0.02, vUV.x) * (1.0 - smoothstep(0.98, 1.0, vUV.x));
    vec2 q = p1 * 0.0019 + vec2(uTime * 0.045, uTime * 0.012);
    rn = (texture(uNoise, q).rb - 0.5) * 1.5 * sw;
    uv += rn / uRect.zw;
  }
  vec4 c0 = texture(uTex0, (p0 + rn * 0.6 - uRect0.xy) / uRect0.zw);
  c0.rgb *= mix(vec3(1.0), uTintL0, zl) * mix(vec3(1.0), uTintR0, zr);
  float s0 = uNoiseP0.x;
  vec4 n0 = texture(uNoise, vec2(p0.x * s0 + uTime * uNoiseP0.y, p0.y * s0 * 2.6));
  vec4 m0 = mist0(p0, zl, zr, smoothstep(0.3, 0.85, n0.r * 0.65 + n0.g * 0.5));
  vec4 acc = c0 * (1.0 - m0.a) + m0;
  vec4 c1 = texture(uTex1, uv);
  c1.rgb *= mix(vec3(1.0), uTintL1, zl) * mix(vec3(1.0), uTintR1, zr);
  acc = c1 + acc * (1.0 - c1.a);
  float s1 = uNoiseP1.x;
  float n = texture(uNoise, vec2(p1.x * s1 + uTime * uNoiseP1.y, p1.y * s1 * 2.6)).r;
  float m = texture(uNoise, vec2(p1.x * s1 * 2.3 - uTime * uNoiseP1.y * 1.7, p1.y * s1 * 4.1 + uTime * uNoiseP1.y * 0.4)).g;
  vec4 m1 = mist1(p1, zl, zr, smoothstep(0.3, 0.85, n * 0.65 + m * 0.5));
  acc = acc * (1.0 - m1.a) + m1;
  fragColor = vec4(acc.rgb + sky * (1.0 - acc.a), 1.0);
}`;

export interface PairLayer {
  fog: FogSpec;
  zone: ZoneSpec;
}

/**
 * Sky + the two farthest layers + both their mists in ONE opaque pass (they were three blended
 * full-screen passes). Drawn on the nearer layer's tiles; the farther layer (a single tile) and
 * the quarter-size sky texture are looked up at the matching place for the current camera.
 * Anything that used to sit between those layers has to be drawn after this view.
 */
export class FarPairView {
  readonly container = new Container({ label: 'baked+fog' });
  private readonly uniforms: UniformGroup;

  constructor(
    far0: BakedTile,
    tiles1: readonly BakedTile[],
    l0: PairLayer,
    private readonly l1: PairLayer,
    rustle: RustleSpec,
    sky: { texture: Texture; x: number; y: number; w: number; h: number },
    private readonly anchor: { x: number; y: number },
  ) {
    const well = (z: ZoneWell | undefined): Float32Array =>
      new Float32Array(z ? [z.x, z.y, z.r, z.alpha] : [0, 0, 1, 0]);
    const u: Record<string, { value: unknown; type: string }> = {
      uTime: { value: 0, type: 'f32' },
      uCam: { value: new Float32Array([0, 0, 1, 0]), type: 'vec4<f32>' },
      uPair: {
        value: new Float32Array([anchor.x, anchor.y, l0.zone.parallax, l1.zone.parallax]),
        type: 'vec4<f32>',
      },
      uSkyRect: { value: new Float32Array([sky.x, sky.y, sky.w, sky.h]), type: 'vec4<f32>' },
      uRect0: { value: new Float32Array([far0.x, far0.y, far0.w, far0.h]), type: 'vec4<f32>' },
      uRustle: { value: new Float32Array([rustle.amp, rustle.y0, rustle.y1]), type: 'vec3<f32>' },
      uZone: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
    };
    [l0, l1].forEach(({ fog, zone }, k) => {
      u[`uMist${k}`] = { value: rgb(fog.color), type: 'vec3<f32>' };
      u[`uWarm${k}`] = { value: rgb(fog.warm), type: 'vec3<f32>' };
      u[`uBand${k}`] = {
        value: new Float32Array([fog.yTop, fog.yFull, fog.alphaTop, fog.alpha]),
        type: 'vec4<f32>',
      };
      u[`uWell${k}`] = {
        value: new Float32Array([fog.wellX, fog.wellY, fog.wellR, fog.wellAlpha]),
        type: 'vec4<f32>',
      };
      u[`uNoiseP${k}`] = { value: new Float32Array([fog.scale, fog.speed, fog.wisp]), type: 'vec3<f32>' };
      u[`uTintL${k}`] = { value: new Float32Array(zone.tintL), type: 'vec3<f32>' };
      u[`uTintR${k}`] = { value: new Float32Array(zone.tintR), type: 'vec3<f32>' };
      u[`uMistL${k}`] = { value: rgb(zone.mistL), type: 'vec3<f32>' };
      u[`uMistR${k}`] = { value: rgb(zone.mistR), type: 'vec3<f32>' };
      u[`uWellL${k}`] = { value: well(zone.wellL), type: 'vec4<f32>' };
      u[`uWellLCol${k}`] = { value: rgb(zone.wellL?.color ?? 0), type: 'vec3<f32>' };
      u[`uWellR${k}`] = { value: well(zone.wellR), type: 'vec4<f32>' };
      u[`uWellRCol${k}`] = { value: rgb(zone.wellR?.color ?? 0), type: 'vec3<f32>' };
    });
    this.uniforms = new UniformGroup(u as ConstructorParameters<typeof UniformGroup>[0]);
    for (const t of tiles1) {
      const shader = Shader.from({
        gl: { vertex: BG_VERT, fragment: PAIR_FRAG },
        resources: {
          uTex0: far0.texture.source,
          uTex1: t.texture.source,
          uSky: sky.texture.source,
          uNoise: noiseTexture().source,
          view: this.uniforms,
          tile: new UniformGroup({
            uRect: { value: new Float32Array([t.x, t.y, t.w, t.h]), type: 'vec4<f32>' },
          }),
        },
      });
      const mesh = new Mesh({ geometry: quadGeometry(t.x, t.y, t.w, t.h), shader });
      mesh.blendMode = 'none';
      this.container.addChild(mesh);
    }
  }

  update(clock: number, cam: { x: number; y: number; zoom: number }): void {
    const u = this.uniforms.uniforms;
    u.uTime = clock;
    const z = zoneWeights(cam.x);
    (u.uCam as Float32Array).set([cam.x - this.anchor.x, cam.y - this.anchor.y, cam.zoom, 0]);
    (u.uZone as Float32Array).set([(cam.x - this.anchor.x) * (1 - this.l1.zone.parallax), z.l, z.r, 0]);
  }
}

/** A soft round glow (white), for additive sprites. */
export function glowTexture(_renderer?: Renderer): Texture {
  return softTexture();
}
