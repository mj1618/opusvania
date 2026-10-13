/**
 * Sky glow (screen space): light seen through a forest. One full-screen shader: a vertical
 * indigo -> misty teal -> deep teal gradient with darker upper corners, a large warm bloom where
 * the key light enters (it tracks KEY_LIGHT.entryX with a little parallax, so it stays above the
 * shafts as the camera moves), slow drifting mist, and faint distant rays along the key direction.
 */
import {
  Matrix,
  Mesh,
  type MeshGeometry,
  type Renderer,
  RenderTexture,
  Shader,
  Sprite,
  UniformGroup,
} from 'pixi.js';
import { VIEW_H, VIEW_W } from '../../contract';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import { BG_VERT, noiseTexture, quadGeometry, rgb, ZONES, zoneWeights } from '../lib/bg-bake';
import { KEY_LIGHT, PALETTE } from '../lib/look';

export const SKY = {
  top: 0x13284a,
  mid: 0x86d2c2,
  low: 0x1d5f6b,
  corner: 0x0a1a36,
  /** Wide green-gold halo, the warm bloom, and its core. */
  halo: 0xbfe6b4,
  warm: PALETTE.keyWarm,
  core: 0xfff4d8,
  /** Where the bloom sits on screen when the camera is at the anchor height, and how much it parallaxes. */
  glowRestY: 170,
  glowParallaxX: 0.1,
  glowParallaxY: 0.08,
  coreRadius: 200,
  warmFalloff: 520,
  haloFalloff: 1350,
  mist: 0.3,
  rays: 0.3,
  /** The sky is shaded at this fraction of the logical view and stretched. */
  renderScale: 0.25,
  /** Left glade: a bluer moonlit sky with a pale moon glow. */
  left: { top: 0x0e1f52, mid: 0x7fb4e0, low: 0x1b4f7c, moon: 0xdcefff, moonX: 470, moonY: 150, moonR: 150 },
  /** Right stand: dusk violet, with a small rose-gold opening far behind. */
  right: { top: 0x1c1a48, mid: 0x9a8cc4, low: 0x2b3a6a, dusk: 0xffbfa0, duskX: 1380, duskY: 300, duskR: 130 },
  /** How much the key bloom dims in the side zones. */
  keyDimL: 0.45,
  keyDimR: 0.55,
} as const;

/**
 * The shaded sky: a small texture covering x -8..VIEW_W+8, y -8..VIEW_H+8 of the logical view, and
 * the sprite that shows it. far.ts composites the texture itself in its far-pair pass and hides
 * the sprite (one full-screen pass less).
 */
export const SKY_OUTPUT: { texture: RenderTexture | null; sprite: Sprite | null } = {
  texture: null,
  sprite: null,
};

/** Bloom centre in logical view coordinates for a camera (shared with far.ts for its light well). */
export function skyGlowAt(
  cam: { x: number; y: number; zoom: number },
  anchorY: number,
): { x: number; y: number } {
  const x = VIEW_W / 2 + (KEY_LIGHT.entryX - cam.x) * SKY.glowParallaxX;
  const y = SKY.glowRestY + (anchorY - cam.y) * SKY.glowParallaxY;
  return {
    x: VIEW_W / 2 + (x - VIEW_W / 2) * cam.zoom,
    y: VIEW_H / 2 + (y - VIEW_H / 2) * cam.zoom,
  };
}

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uNoise;
uniform vec2 uGlow;
uniform vec2 uDir;
uniform vec4 uTimeCam;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uLow;
uniform vec3 uCorner;
uniform vec3 uHalo;
uniform vec3 uWarm;
uniform vec3 uCore;
uniform vec4 uGlowP;
uniform vec2 uAmt;
uniform vec4 uZoneCam;
uniform vec3 uTopL;
uniform vec3 uMidL;
uniform vec3 uLowL;
uniform vec3 uTopR;
uniform vec3 uMidR;
uniform vec3 uLowR;
uniform vec4 uMoon;
uniform vec3 uMoonCol;
uniform vec4 uDusk;
uniform vec3 uDuskCol;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = vUV * vec2(${VIEW_W + 16}.0, ${VIEW_H + 16}.0) - 8.0;
  float t = uTimeCam.x;
  float zoom = uTimeCam.z;
  float y = p.y / ${VIEW_H}.0;
  // Zone mood by the playfield x behind each pixel.
  float px = uTimeCam.y + (p.x - ${VIEW_W / 2}.0) / zoom;
  float zl = 1.0 - smoothstep(${ZONES.l0}.0, ${ZONES.l1}.0, px);
  float zr = smoothstep(${ZONES.r0}.0, ${ZONES.r1}.0, px);
  vec3 top = mix(mix(uTop, uTopL, zl), uTopR, zr);
  vec3 midc = mix(mix(uMid, uMidL, zl), uMidR, zr);
  vec3 low = mix(mix(uLow, uLowL, zl), uLowR, zr);
  vec3 col = mix(top, midc, smoothstep(-0.05, 0.6, y));
  col = mix(col, low, smoothstep(0.55, 1.05, y));
  float dx = (p.x - uGlow.x) / (1500.0 * zoom);
  col = mix(col, uCorner, clamp(dx * dx * (1.0 - y * 0.75), 0.0, 0.8));

  vec2 q = (p - vec2(${VIEW_W / 2}.0, ${VIEW_H / 2}.0)) / zoom + vec2(uTimeCam.y * 0.06, 0.0);
  float n = texture(uNoise, q / 1900.0 + vec2(t * 0.0035, t * 0.0006)).r;
  float m = texture(uNoise, q / 700.0 + vec2(-t * 0.006, t * 0.0015)).g;
  float mist = n * 0.65 + m * 0.35;
  col *= 1.0 + uAmt.x * (mist - 0.5) * 1.6;
  col = mix(col, uHalo, clamp((mist - 0.5) * uAmt.x * 0.9, 0.0, 1.0));

  vec2 d = (p - uGlow) / zoom;
  float r = length(d * vec2(1.0, 1.12));
  float breathe = (1.0 + 0.06 * sin(t * 0.31) + 0.03 * sin(t * 0.83 + 1.0)) * uZoneCam.z;
  float along = dot(d, uDir);
  float across = dot(d, vec2(-uDir.y, uDir.x));
  float ray = texture(uNoise, vec2(across / 520.0 + t * 0.002, along / 9000.0 + 0.31)).b;
  ray = smoothstep(0.42, 0.85, ray) * smoothstep(-150.0, 250.0, along) * exp(-r / 1000.0);
  float g1 = exp(-r * r / (2.0 * uGlowP.x * uGlowP.x));
  float g2 = exp(-r / uGlowP.y);
  float g3 = exp(-r / uGlowP.z);
  col = mix(col, uHalo, clamp(g3 * 0.62 * breathe, 0.0, 1.0));
  col = mix(col, uWarm, clamp((g2 * 0.8 + ray * uAmt.y) * breathe, 0.0, 1.0));
  col = mix(col, uCore, clamp(g1 * 0.92 * breathe, 0.0, 1.0));
  // The moon over the glade and the dusk gap behind the old stand fade in with their zones.
  float rm = length((p - uMoon.xy) / zoom);
  float mg = (exp(-rm * rm / (2.0 * uMoon.z * uMoon.z)) * 0.9 + exp(-rm / (uMoon.z * 3.2)) * 0.45) * uZoneCam.x;
  col = mix(col, uMoonCol, clamp(mg, 0.0, 1.0));
  float rd = length((p - uDusk.xy) / zoom * vec2(1.0, 1.25));
  float dg = (exp(-rd * rd / (2.0 * uDusk.z * uDusk.z)) * 0.9 + exp(-rd / (uDusk.z * 3.0)) * 0.5) * uZoneCam.y;
  col = mix(col, uDuskCol, clamp(dg * (1.0 + 0.05 * sin(t * 0.4)), 0.0, 1.0));
  col += (hash(gl_FragCoord.xy + fract(t) * 61.0) - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}`;

export class SkyLayer implements EnvModule {
  private uniforms!: UniformGroup;
  private mesh!: Mesh<MeshGeometry, Shader>;
  private renderer!: Renderer;
  private target!: RenderTexture;
  private toTarget!: Matrix;
  private anchorY = 0;

  init(ctx: SceneContext): void {
    this.anchorY = ctx.layers.anchor.y;
    this.uniforms = new UniformGroup({
      uGlow: { value: new Float32Array([VIEW_W / 2, SKY.glowRestY]), type: 'vec2<f32>' },
      uDir: { value: new Float32Array([KEY_LIGHT.dirX, KEY_LIGHT.dirY]), type: 'vec2<f32>' },
      uTimeCam: { value: new Float32Array([0, 0, 1, 0]), type: 'vec4<f32>' },
      uTop: { value: rgb(SKY.top), type: 'vec3<f32>' },
      uMid: { value: rgb(SKY.mid), type: 'vec3<f32>' },
      uLow: { value: rgb(SKY.low), type: 'vec3<f32>' },
      uCorner: { value: rgb(SKY.corner), type: 'vec3<f32>' },
      uHalo: { value: rgb(SKY.halo), type: 'vec3<f32>' },
      uWarm: { value: rgb(SKY.warm), type: 'vec3<f32>' },
      uCore: { value: rgb(SKY.core), type: 'vec3<f32>' },
      uGlowP: {
        value: new Float32Array([SKY.coreRadius, SKY.warmFalloff, SKY.haloFalloff, 0]),
        type: 'vec4<f32>',
      },
      uAmt: { value: new Float32Array([SKY.mist, SKY.rays]), type: 'vec2<f32>' },
      uZoneCam: { value: new Float32Array([0, 0, 1, 0]), type: 'vec4<f32>' },
      uTopL: { value: rgb(SKY.left.top), type: 'vec3<f32>' },
      uMidL: { value: rgb(SKY.left.mid), type: 'vec3<f32>' },
      uLowL: { value: rgb(SKY.left.low), type: 'vec3<f32>' },
      uTopR: { value: rgb(SKY.right.top), type: 'vec3<f32>' },
      uMidR: { value: rgb(SKY.right.mid), type: 'vec3<f32>' },
      uLowR: { value: rgb(SKY.right.low), type: 'vec3<f32>' },
      uMoon: {
        value: new Float32Array([SKY.left.moonX, SKY.left.moonY, SKY.left.moonR, 0]),
        type: 'vec4<f32>',
      },
      uMoonCol: { value: rgb(SKY.left.moon), type: 'vec3<f32>' },
      uDusk: {
        value: new Float32Array([SKY.right.duskX, SKY.right.duskY, SKY.right.duskR, 0]),
        type: 'vec4<f32>',
      },
      uDuskCol: { value: rgb(SKY.right.dusk), type: 'vec3<f32>' },
    });
    const shader = Shader.from({
      gl: { vertex: BG_VERT, fragment: FRAG },
      resources: { uNoise: noiseTexture().source, sky: this.uniforms },
    });
    // Overdraw a little so sub-pixel canvas rounding never shows the clear colour.
    this.mesh = new Mesh({ geometry: quadGeometry(-8, -8, VIEW_W + 16, VIEW_H + 16), shader });
    // The sky is all soft gradients and mostly hidden: shade it small, then stretch it (a full-size
    // pass of this shader was the most expensive thing in the background).
    const k = SKY.renderScale;
    this.renderer = ctx.renderer;
    this.target = RenderTexture.create({
      width: Math.ceil((VIEW_W + 16) * k),
      height: Math.ceil((VIEW_H + 16) * k),
      resolution: 1,
    });
    this.toTarget = new Matrix(k, 0, 0, k, 8 * k, 8 * k);
    const sprite = new Sprite(this.target);
    SKY_OUTPUT.texture = this.target;
    SKY_OUTPUT.sprite = sprite;
    sprite.label = 'sky-glow';
    sprite.position.set(-8, -8);
    sprite.setSize(VIEW_W + 16, VIEW_H + 16);
    ctx.layers.sky.addChild(sprite);
    if (import.meta.env.DEV) {
      // Lets tools toggle layers: __bg.layers.get('playfield').visible = false; __game.render().
      (globalThis as { __bg?: unknown }).__bg = { layers: ctx.layers };
    }
  }

  update(frame: SceneFrame): void {
    const u = this.uniforms.uniforms;
    const g = skyGlowAt(frame.camera, this.anchorY);
    (u.uGlow as Float32Array).set([g.x, g.y]);
    (u.uTimeCam as Float32Array).set([frame.clock, frame.camera.x, frame.camera.zoom, 0]);
    // The side lights sit at a fixed place in the sky and drift a little with the camera.
    const cam = frame.camera;
    const z = zoneWeights(cam.x);
    const at = (x: number, y: number, homeX: number): [number, number] => {
      const sx = x + (homeX - cam.x) * SKY.glowParallaxX;
      const sy = y + (this.anchorY - cam.y) * SKY.glowParallaxY;
      return [VIEW_W / 2 + (sx - VIEW_W / 2) * cam.zoom, VIEW_H / 2 + (sy - VIEW_H / 2) * cam.zoom];
    };
    (u.uZoneCam as Float32Array).set([z.l, z.r, 1 - SKY.keyDimL * z.l - SKY.keyDimR * z.r, 0]);
    (u.uMoon as Float32Array).set(at(SKY.left.moonX, SKY.left.moonY, 960));
    (u.uDusk as Float32Array).set(at(SKY.right.duskX, SKY.right.duskY, 4800));
    this.renderer.render({
      container: this.mesh,
      target: this.target,
      clear: false,
      transform: this.toTarget,
    });
  }
}
