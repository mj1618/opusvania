/**
 * Playfield terrain baker. The terrain is painted twice with plain vector shapes:
 *   albedo  flat local colour (what it is)
 *   height  R = how far it bulges toward the viewer (0..1), G = moss-ness, B = bark-ness
 * and this module turns the pair into lit, textured tiles: the height is blurred at three scales
 * (fine detail, silhouette bevel, interior depth), a normal comes from its slope, and one shader
 * pass adds the key light (warm rim toward the upper right, cool shadow side), a cast shadow under
 * overhanging lips, darker interiors and a painterly noise per material. All of it runs once at
 * init into render textures (<= 2048 px each); at runtime the terrain is a handful of sprites.
 */
import {
  Container,
  Geometry,
  Matrix,
  Mesh,
  type Renderer,
  RenderTexture,
  Shader,
  Sprite,
  type Texture,
} from 'pixi.js';
import { KEY_LIGHT } from './look';
import { ZONES } from './pf-shape';

export const BAKE = {
  /** World px per tile side. With bake scale 2 a tile is 1024 px + padding while baking. */
  tile: 512,
  /** World px of margin baked around each tile so blurs do not see the tile edge. */
  pad: 112,
  /** Blur sigmas in world px: fine detail, silhouette bevel, interior depth. */
  sigmaFine: 2.2,
  sigmaMid: 8,
  sigmaWide: 34,
  /** Normal strength from the fine and the bevel blur, and from the material noise. */
  bumpFine: 2.6,
  bumpMid: 13,
  bumpNoise: 0.9,
  /** Light: how much the lit side gains, the shadow side loses, and the interior darkens to. */
  key: 1.25,
  spec: 0.16,
  shadow: 0.55,
  interior: 0.5,
  /** Cast shadow: how far toward the light to look (world px) and how dark. */
  castReach: 9,
  cast: 0.55,
  /** Height of the light above the picture plane: lower = harder side light. */
  lightZ: 0.62,
  /** Brushwork: how hard light breaks into planes (0..1), stroke contrast, crevice depth, chip strength. */
  planes: 0.82,
  strokes: 0.42,
  crevice: 7,
  chips: 0.55,
  /** Half width (world px) of the broad beam where the key light lands; see sunAt in pf-shape.ts. */
  beamWidth: 760,
} as const;

const CLEAR: number[] = [0, 0, 0, 0];

const QUAD_VERT = `#version 300 es
precision highp float;
in vec2 aPosition;
in vec2 aUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uUvRect;
uniform vec4 uWorldRect;
out vec2 vUV;
out vec2 vWorld;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = uUvRect.xy + aUV * uUvRect.zw;
  vWorld = uWorldRect.xy + aUV * uWorldRect.zw;
}`;

const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uStep;
out vec4 o;
void main() {
  // 13-tap gaussian, taps half a sigma apart.
  vec4 s = texture(uTex, vUV) * 0.1995;
  s += (texture(uTex, vUV + uStep) + texture(uTex, vUV - uStep)) * 0.1760;
  s += (texture(uTex, vUV + uStep * 2.0) + texture(uTex, vUV - uStep * 2.0)) * 0.1210;
  s += (texture(uTex, vUV + uStep * 3.0) + texture(uTex, vUV - uStep * 3.0)) * 0.0648;
  s += (texture(uTex, vUV + uStep * 4.0) + texture(uTex, vUV - uStep * 4.0)) * 0.0270;
  s += (texture(uTex, vUV + uStep * 5.0) + texture(uTex, vUV - uStep * 5.0)) * 0.0088;
  s += (texture(uTex, vUV + uStep * 6.0) + texture(uTex, vUV - uStep * 6.0)) * 0.0022;
  o = s;
}`;

const LIT_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
in vec2 vWorld;
uniform sampler2D uAlb;
uniform sampler2D uHgt;
uniform sampler2D uFine;
uniform sampler2D uMid;
uniform sampler2D uWide;
uniform vec2 uUvPerWorld;
uniform vec3 uLight;
uniform vec4 uBump;   // fine, mid, noise, -
uniform vec4 uShade;  // key, spec, shadow, interior
uniform vec2 uCast;   // reach (world px), strength
uniform vec4 uBrush;  // plane hardness, stroke contrast, crevice depth, chip strength
uniform vec4 uZone;   // x edges of the cool|warm and warm|deep transitions
uniform vec4 uSun;    // key entry x, y, dx per dy, beam half width
out vec4 o;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s / 0.9375;
}
// Painterly surface per material, 0..1: streaky strata for earth and rock, vertical ridges for
// bark, soft stipple for moss.
float surface(vec2 p, float moss, float bark) {
  float warp = fbm(p * vec2(0.006, 0.011)) * 5.0;
  float e = fbm(vec2(p.x * 0.011 + warp, p.y * 0.04 + warp * 0.6)) * 0.78 + fbm(p * 0.09) * 0.22;
  float r = fbm(vec2(p.x * 0.075 + warp * 1.7, p.y * 0.0065));
  float b = (1.0 - abs(r * 2.0 - 1.0)) * 0.75 + fbm(vec2(p.x * 0.3, p.y * 0.03)) * 0.25;
  float m = fbm(p * 0.33) * 0.6 + fbm(p * 0.07 + 31.0) * 0.4;
  return mix(mix(e, b, bark), m, moss);
}

// A step with a slightly soft riser: hard-edged planes that still survive the bake resolution.
float plane3(float x) {
  return floor(x) + smoothstep(0.38, 0.62, fract(x));
}

void main() {
  vec4 alb = texture(uAlb, vUV);
  vec4 hs = texture(uHgt, vUV);
  // Only what has relief is solid: colour-only washes never paint outside a body.
  float alpha = alb.a * smoothstep(0.0, 0.9, hs.a);
  if (alpha < 0.003) { o = vec4(0.0); return; }
  vec3 base = alb.rgb / alb.a;
  float ha = max(hs.a, 0.001);
  float moss = clamp(hs.g / ha, 0.0, 1.0);
  float bark = clamp(hs.b / ha, 0.0, 1.0);
  vec4 fine = texture(uFine, vUV);
  vec4 mid = texture(uMid, vUV);
  vec4 wide = texture(uWide, vUV);

  // Where the key light lands: a broad beam along its path plus dapples. Everything else is
  // lit by this, so brightness comes from light, not from the paint.
  float beamX = uSun.x + (vWorld.y - uSun.y) * uSun.z;
  float beam = exp(-pow((vWorld.x - beamX) / uSun.w, 2.0));
  // Same dapples as sunAt() in pf-shape.ts: keep the two in step.
  float dp = 0.5 + 0.25 * sin(vWorld.x * 0.0131 + 1.7 * sin(vWorld.y * 0.004))
           + 0.25 * sin(vWorld.x * 0.0057 - vWorld.y * 0.0031 + 2.1);
  float dapple = smoothstep(0.45, 0.8, dp);
  float sun = clamp(beam * 0.65 + dapple * 0.55, 0.0, 1.0);

  // Brush strokes that follow the form: along the silhouette near edges, along the grain inside.
  vec2 d = uUvPerWorld * 1.25;
  vec2 dw = d * 8.0;
  vec2 gW = vec2(texture(uWide, vUV + vec2(dw.x, 0.0)).a - texture(uWide, vUV - vec2(dw.x, 0.0)).a,
                 texture(uWide, vUV + vec2(0.0, dw.y)).a - texture(uWide, vUV - vec2(0.0, dw.y)).a);
  float gl = length(gW);
  vec2 nrm = gl > 0.004 ? gW / gl : vec2(0.0, 1.0);
  vec2 tng = vec2(-nrm.y, nrm.x);
  float form = smoothstep(0.006, 0.05, gl);
  vec2 sp = vec2(dot(vWorld, tng), dot(vWorld, nrm));
  vec2 grain = mix(vec2(vWorld.x * 0.018, vWorld.y * 0.15), vec2(vWorld.y * 0.018, vWorld.x * 0.15), bark);
  float stroke = mix(fbm(grain + 7.0), fbm(vec2(sp.x * 0.02, sp.y * 0.17) + 7.0), form * 0.22 * (1.0 - bark));
  float dab = fbm(vWorld * 0.045 + 19.0);

  vec2 dx = vec2(d.x, 0.0);
  vec2 dy = vec2(0.0, d.y);
  vec2 gF = vec2(texture(uFine, vUV + dx).r - texture(uFine, vUV - dx).r,
                 texture(uFine, vUV + dy).r - texture(uFine, vUV - dy).r);
  vec2 dm = d * 2.0;
  vec2 gM = vec2(texture(uMid, vUV + vec2(dm.x, 0.0)).r - texture(uMid, vUV - vec2(dm.x, 0.0)).r,
                 texture(uMid, vUV + vec2(0.0, dm.y)).r - texture(uMid, vUV - vec2(0.0, dm.y)).r) * 0.5;
  float n0 = surface(vWorld, moss, bark);
  vec2 gN = vec2(surface(vWorld + vec2(1.5, 0.0), moss, bark) - n0,
                 surface(vWorld + vec2(0.0, 1.5), moss, bark) - n0);
  vec2 g = gF * uBump.x + gM * uBump.y + gN * uBump.z;
  vec3 n = normalize(vec3(-g, 1.0));
  float lit = dot(n, uLight);
  float flatLit = uLight.z;
  float key = clamp((lit - flatLit) / (1.0 - flatLit), 0.0, 1.0);
  float shd = clamp((flatLit - lit) / (flatLit + 0.35), 0.0, 1.0);
  // Break the smooth falloff into a few painted planes, the stroke noise deciding the borders.
  // The fine layer keeps to the grain: following the form at this scale draws contour rings.
  float fineStroke = fbm(grain * 2.6 + 23.0);
  key = mix(key, plane3(key * 3.0 + 0.5 + (stroke - 0.5) * 1.3 + (fineStroke - 0.5) * 0.5) / 3.0, uBrush.x);
  shd = mix(shd, plane3(shd * 2.0 + 0.5 + (dab - 0.5) * 1.2 + (fineStroke - 0.5) * 0.4) / 2.0, uBrush.x * 0.9);

  float inside = smoothstep(0.5, 0.97, wide.a);

  // Local colour: strokes in value, dabs in temperature.
  vec3 c = base * (0.7 + 0.22 * n0 + uBrush.y * (stroke - 0.5) + 0.5 * uBrush.y * (fineStroke - 0.5) + 0.2);
  // Crevices: where the fine relief dips below its surroundings, an accent of deep cool dark.
  float crev = clamp((mid.r - fine.r) * uBrush.z, 0.0, 1.0) * (1.0 - moss * 0.6);
  c = mix(c, c * vec3(0.28, 0.36, 0.55), crev);
  float temp = (dab - 0.5) * 2.0;
  c *= mix(vec3(0.86, 1.0, 1.16), vec3(1.14, 1.02, 0.84), clamp(0.5 + temp * 0.6 + (sun - 0.5) * 0.5, 0.0, 1.0));
  float drift = fbm(vWorld * 0.008 + 5.0) - 0.5;
  c *= vec3(1.0 - drift * 0.22, 1.0 + drift * 0.08, 1.0 + drift * 0.3);
  // The scene's three moods: moonlit blue-green, golden, deep emerald and violet.
  float zA = smoothstep(uZone.x, uZone.y, vWorld.x);
  float zB = smoothstep(uZone.z, uZone.w, vWorld.x);
  vec3 zoneTint = mix(mix(vec3(0.84, 1.0, 1.14), vec3(1.13, 1.05, 0.84), zA), vec3(0.9, 0.9, 1.08) * 0.9, zB);
  c *= zoneTint;
  // Moss dims and cools where the light does not reach.
  c *= mix(1.0, mix(0.5, 1.05, sun), moss);
  c = mix(c, c * vec3(0.72, 0.96, 1.2), moss * (1.0 - sun) * 0.55);
  // Interiors sink into shadow; edges keep their colour.
  c *= mix(1.0, uShade.w, inside * (1.0 - moss * 0.7));
  // Shadow side: darker and bluer.
  c *= 1.0 - uShade.z * shd;
  c = mix(c, c * vec3(0.62, 0.86, 1.3), shd * 0.6);
  // Cast shadow from anything standing proud toward the light (moss lips, stones, roots).
  vec2 toLight = uLight.xy / max(length(uLight.xy), 0.001);
  float hHere = mid.r * 0.5 + fine.r * 0.5;
  vec2 cuv = vUV + toLight * uCast.x * uUvPerWorld;
  float hThere = texture(uMid, cuv).r * 0.5 + texture(uFine, cuv).r * 0.5;
  float castS = clamp((hThere - hHere) * 5.0, 0.0, 1.0) * texture(uMid, cuv).a;
  c *= 1.0 - castS * uCast.y;
  // Key light, warm. Things painted low (the back plane) barely catch it.
  vec3 warm = vec3(1.0, 0.84, 0.58);
  float plane = smoothstep(0.24, 0.44, hs.r / ha);
  float reach = mix(0.4, 1.3, sun) * mix(0.3, 1.0, plane);
  float k = key * uShade.x * reach;
  vec3 keyCol = mix(warm, vec3(1.0, 0.93, 0.5), moss);
  c += base * keyCol * k * 1.35 + keyCol * (k * k) * uShade.y * 0.3;
  // A crisp rim right at the silhouette where it faces the light.
  float edge = 1.0 - smoothstep(0.5, 0.82, fine.a);
  float rim = edge * smoothstep(0.12, 0.45, key) * reach;
  c += (base * 1.3 + 0.07) * keyCol * rim * uShade.y * 4.0;
  // Chipped highlights: hard little planes of light on stone and wood where it turns to the key.
  float chip = smoothstep(0.59, 0.66, key + (fineStroke - 0.5) * 0.7 + (dab - 0.5) * 0.3) * (1.0 - moss) * reach;
  c += (base * 0.9 + 0.03) * warm * chip * uBrush.w * (0.4 + 0.6 * edge + 0.5 * crev);
  // Sky bounce on anything facing up, cool.
  float up = clamp(-n.y, 0.0, 1.0);
  c += base * vec3(0.5, 0.8, 1.0) * up * 0.3 * (1.0 - moss * 0.75) * mix(0.4, 1.0, plane);

  // Ragged, brushed edges instead of a clean vector cut.
  float br = fbm(vWorld * 0.21 + 2.0);
  alpha *= smoothstep(0.4 + br * 0.2, 0.48 + br * 0.2, fine.a + 0.02);

  o = vec4(clamp(c, 0.0, 1.0) * alpha, alpha);
}`;

function quadGeometry(): Geometry {
  return new Geometry({
    attributes: {
      aPosition: { buffer: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), format: 'float32x2' },
      aUV: { buffer: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), format: 'float32x2' },
    },
    indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
}

export interface BakeSource {
  /** Flat local colour. */
  albedo: Container;
  /** R height, G moss, B bark. */
  relief: Container;
  /** The world rect of tile (tx, ty) that has anything painted in it, or null if it is empty. */
  tileBounds(tx: number, ty: number): { x0: number; y0: number; x1: number; y1: number } | null;
  width: number;
  height: number;
}

export interface BakeResult {
  layer: Container;
  tiles: number;
  megapixels: number;
  ms: number;
}

/** Bakes the painted terrain into lit tiles at `scale` texture px per world px. */
export function bakeTerrain(renderer: Renderer, src: BakeSource, scale: number): BakeResult {
  const t0 = performance.now();
  const T = BAKE.tile;
  const P = BAKE.pad;
  const padded = T + P * 2;
  const full = Math.ceil(padded * scale);
  const levels = [
    { div: 2, sigma: BAKE.sigmaFine },
    { div: 4, sigma: BAKE.sigmaMid },
    { div: 16, sigma: BAKE.sigmaWide },
  ].map((l) => {
    const size = Math.ceil(full / l.div);
    const mk = (): RenderTexture => RenderTexture.create({ width: size, height: size, resolution: 1 });
    return { ...l, size, a: mk(), b: mk() };
  });
  const rtAlb = RenderTexture.create({ width: full, height: full, resolution: 1, antialias: true });
  const rtHgt = RenderTexture.create({ width: full, height: full, resolution: 1, antialias: true });

  const geo = quadGeometry();
  const unit = new Float32Array([0, 0, 1, 1]);
  const blurUniforms = {
    uStep: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
    uUvRect: { value: unit, type: 'vec4<f32>' },
    uWorldRect: { value: unit, type: 'vec4<f32>' },
  };
  const blurShader = Shader.from({
    gl: { vertex: QUAD_VERT, fragment: BLUR_FRAG },
    resources: { uTex: rtHgt.source, u: blurUniforms },
  });
  const blurMesh = new Mesh({ geometry: geo, shader: blurShader });

  const L = [-KEY_LIGHT.dirX, -KEY_LIGHT.dirY, BAKE.lightZ];
  const ll = Math.hypot(L[0] as number, L[1] as number, L[2] as number);
  const inner = (P * scale) / full;
  const span = (T * scale) / full;
  const litUniforms = {
    uUvRect: { value: new Float32Array([inner, inner, span, span]), type: 'vec4<f32>' },
    uWorldRect: { value: new Float32Array([0, 0, T, T]), type: 'vec4<f32>' },
    uUvPerWorld: { value: new Float32Array([scale / full, scale / full]), type: 'vec2<f32>' },
    uLight: {
      value: new Float32Array([(L[0] as number) / ll, (L[1] as number) / ll, (L[2] as number) / ll]),
      type: 'vec3<f32>',
    },
    uBump: { value: new Float32Array([BAKE.bumpFine, BAKE.bumpMid, BAKE.bumpNoise, 0]), type: 'vec4<f32>' },
    uShade: {
      value: new Float32Array([BAKE.key, BAKE.spec, BAKE.shadow, BAKE.interior]),
      type: 'vec4<f32>',
    },
    uCast: { value: new Float32Array([BAKE.castReach, BAKE.cast]), type: 'vec2<f32>' },
    uBrush: {
      value: new Float32Array([BAKE.planes, BAKE.strokes, BAKE.crevice, BAKE.chips]),
      type: 'vec4<f32>',
    },
    uZone: {
      value: new Float32Array([ZONES.coolEnd, ZONES.warmStart, ZONES.warmEnd, ZONES.deepStart]),
      type: 'vec4<f32>',
    },
    uSun: {
      value: new Float32Array([
        KEY_LIGHT.entryX,
        KEY_LIGHT.entryY,
        KEY_LIGHT.dirX / KEY_LIGHT.dirY,
        BAKE.beamWidth,
      ]),
      type: 'vec4<f32>',
    },
  };
  const litShader = Shader.from({
    gl: { vertex: QUAD_VERT, fragment: LIT_FRAG },
    resources: {
      uAlb: rtAlb.source,
      uHgt: rtHgt.source,
      uFine: (levels[0] as { a: Texture }).a.source,
      uMid: (levels[1] as { a: Texture }).a.source,
      uWide: (levels[2] as { a: Texture }).a.source,
      u: litUniforms,
    },
  });
  const litMesh = new Mesh({ geometry: geo, shader: litShader });

  const layer = new Container({ label: 'pf-terrain' });
  const m = new Matrix();
  let count = 0;
  let pixels = 0;
  const nx = Math.ceil(src.width / T);
  const ny = Math.ceil(src.height / T);
  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      const bb = src.tileBounds(tx, ty);
      if (!bb) continue;
      const wx = tx * T - P;
      const wy = ty * T - P;
      m.set(scale, 0, 0, scale, -wx * scale, -wy * scale);
      renderer.render({ container: src.albedo, target: rtAlb, clear: true, clearColor: CLEAR, transform: m });
      renderer.render({ container: src.relief, target: rtHgt, clear: true, clearColor: CLEAR, transform: m });
      for (const l of levels) {
        const s = scale / l.div;
        m.set(s, 0, 0, s, -wx * s, -wy * s);
        renderer.render({ container: src.relief, target: l.a, clear: true, clearColor: CLEAR, transform: m });
        // Taps half a sigma apart, in uv of this level.
        const step = (l.sigma * s * 0.5) / l.size;
        blurMesh.scale.set(l.size);
        blurShader.resources.uTex = l.a.source;
        blurUniforms.uStep.value[0] = step;
        blurUniforms.uStep.value[1] = 0;
        renderer.render({ container: blurMesh, target: l.b, clear: true, clearColor: CLEAR });
        blurShader.resources.uTex = l.b.source;
        blurUniforms.uStep.value[0] = 0;
        blurUniforms.uStep.value[1] = step;
        renderer.render({ container: blurMesh, target: l.a, clear: true, clearColor: CLEAR });
      }
      // Only the part of the tile that has paint in it becomes a texture.
      const outW = Math.max(2, Math.ceil((bb.x1 - bb.x0) * scale));
      const outH = Math.max(2, Math.ceil((bb.y1 - bb.y0) * scale));
      const w = outW / scale;
      const h = outH / scale;
      const uvr = litUniforms.uUvRect.value;
      uvr[0] = ((bb.x0 - wx) * scale) / full;
      uvr[1] = ((bb.y0 - wy) * scale) / full;
      uvr[2] = outW / full;
      uvr[3] = outH / full;
      const wr = litUniforms.uWorldRect.value;
      wr[0] = bb.x0;
      wr[1] = bb.y0;
      wr[2] = w;
      wr[3] = h;
      litMesh.scale.set(outW, outH);
      const out = RenderTexture.create({ width: outW, height: outH, resolution: 1 });
      renderer.render({ container: litMesh, target: out, clear: true, clearColor: CLEAR });
      const sprite = new Sprite(out);
      sprite.position.set(bb.x0, bb.y0);
      sprite.scale.set(1 / scale);
      layer.addChild(sprite);
      count++;
      pixels += outW * outH;
    }
  }
  blurMesh.destroy();
  litMesh.destroy();
  blurShader.destroy();
  litShader.destroy();
  for (const l of levels) {
    l.a.destroy(true);
    l.b.destroy(true);
  }
  rtAlb.destroy(true);
  rtHgt.destroy(true);
  return {
    layer,
    tiles: count,
    megapixels: pixels / 1e6,
    ms: performance.now() - t0,
  };
}
