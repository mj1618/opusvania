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
  Rectangle,
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
): BakedTile[] {
  const out: BakedTile[] = [];
  const pad = Math.ceil(Math.max(atm.formDist, atm.rimDist) + 4);
  const cols = Math.ceil((rect.w * scale) / MAX_TILE_W);
  const rows = Math.ceil((rect.h * scale) / MAX_TILE_H);
  const tw = rect.w / cols;
  const th = rect.h / rows;
  const noise = noiseTexture();
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
          atm: new UniformGroup({
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
  float a = uBand.w * band * veil + w * uWell.w * breathe * (0.7 + 0.3 * wisp);
  a = clamp(a, 0.0, 0.97);
  vec3 fog = mix(uMist, uWarm, clamp(w * 1.15, 0.0, 1.0));
  fragColor = c * (1.0 - a) + vec4(fog * a, a);
}`;

/**
 * Shows a baked layer with the mist that hangs in front of it, in one pass per tile (a separate
 * full-screen fog quad per layer doubled the fill cost). Also rustles the canopy.
 */
export class LayerView {
  readonly container = new Container({ label: 'baked+fog' });
  private readonly uniforms: UniformGroup;

  constructor(tiles: readonly BakedTile[], fog: FogSpec, rustle: RustleSpec) {
    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uMist: { value: rgb(fog.color), type: 'vec3<f32>' },
      uWarm: { value: rgb(fog.warm), type: 'vec3<f32>' },
      uBand: { value: new Float32Array([fog.yTop, fog.yFull, fog.alphaTop, fog.alpha]), type: 'vec4<f32>' },
      uWell: { value: new Float32Array([fog.wellX, fog.wellY, fog.wellR, fog.wellAlpha]), type: 'vec4<f32>' },
      uNoiseP: { value: new Float32Array([fog.scale, fog.speed, fog.wisp]), type: 'vec3<f32>' },
      uRustle: { value: new Float32Array([rustle.amp, rustle.y0, rustle.y1]), type: 'vec3<f32>' },
    });
    for (const t of tiles) {
      const shader = Shader.from({
        gl: { vertex: BG_VERT, fragment: VIEW_FRAG },
        resources: {
          uTex: t.texture.source,
          uNoise: noiseTexture().source,
          view: this.uniforms,
          tile: new UniformGroup({
            uRect: { value: new Float32Array([t.x, t.y, t.w, t.h]), type: 'vec4<f32>' },
          }),
        },
      });
      this.container.addChild(new Mesh({ geometry: quadGeometry(t.x, t.y, t.w, t.h), shader }));
    }
  }

  update(clock: number): void {
    this.uniforms.uniforms.uTime = clock;
  }
}

// ---------------------------------------------------------------------------------------------
// Sway sprites
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
  draw(g: Graphics): void;
}

export class SwaySet {
  readonly container = new Container({ label: 'sway' });
  private readonly sprites: Array<{ s: Sprite; item: SwayItem }> = [];

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
    for (const sl of slots) {
      const tex = new Texture({
        source: rt.source,
        frame: new Rectangle(
          Math.floor(sl.x * scale),
          Math.floor(sl.y * scale),
          Math.floor(sl.w * scale),
          Math.floor(sl.h * scale),
        ),
      });
      const s = new Sprite(tex);
      s.anchor.set(0.5, (pad + (sl.item.up ?? 0)) / sl.h);
      s.scale.set(1 / scale);
      s.position.set(sl.item.x, sl.item.y);
      this.container.addChild(s);
      this.sprites.push({ s, item: sl.item });
    }
  }

  update(clock: number, vis: LayerRect): void {
    const x0 = vis.x - 200;
    const x1 = vis.x + vis.w + 200;
    for (const { s, item } of this.sprites) {
      const on = item.x > x0 && item.x < x1;
      s.visible = on;
      if (on) s.rotation = wind(item.x, clock, item.phase) * item.amp;
    }
  }
}

/** A soft round glow (white, premultiplied), for additive sprites. */
export function glowTexture(renderer: Renderer): Texture {
  const g = new Graphics();
  const R = 32;
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    g.circle(R, R, R * (1 - t)).fill({ color: 0xffffff, alpha: 0.012 + 0.11 * t * t });
  }
  const tex = renderer.generateTexture({
    target: g,
    frame: new Rectangle(0, 0, R * 2, R * 2),
    resolution: 2,
    antialias: true,
  });
  g.destroy();
  return tex;
}
