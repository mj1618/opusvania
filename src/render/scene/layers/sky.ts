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
import { SAFE_H, SAFE_W, VIEW_MAX_H, VIEW_MAX_W } from '../../contract';
import type { EnvModule, SceneContext, SceneFrame } from '../index';
import { BG_VERT, noiseTexture, quadGeometry, rgb, ZONES, zoneWeights } from '../lib/bg-bake';
import { WOOD } from '../lib/bg-wood';
import { KEY_LIGHT } from '../lib/look';
import { LOOK } from '../lib/room-look';

export const SKY = {
  // Low key: the sky is a dark amber-brown dusk, and its one bright thing is a small bloom that
  // peaks around luma 180 (230+ is reserved for the hero and bioluminescence).
  top: 0x0b0c0c,
  mid: 0x3d3219,
  low: 0x17140c,
  corner: 0x040506,
  /** Wide amber halo, the warm bloom, and its core. */
  halo: 0x705222,
  warm: 0xba8a40,
  core: 0xe6b866,
  /** Where the bloom sits on screen when the camera is at the anchor height, and how much it parallaxes. */
  glowRestY: 150,
  /** Screen px to the right of where the key enters: keeps the bloom off the high ledge's hero. */
  glowOffsetX: 300,
  glowParallaxX: 0.1,
  glowParallaxY: 0.08,
  coreRadius: 95,
  warmFalloff: 190,
  haloFalloff: 520,
  mist: 0.3,
  rays: 0.25,
  /** The sky is shaded at this fraction of the logical view and stretched. */
  renderScale: 0.25,
  /** Left glade: a deep azure night with a small pale moon glow. */
  left: { top: 0x040a18, mid: 0x1a405e, low: 0x081c2e, moon: 0x9fc4e6, moonX: 470, moonY: 150, moonR: 60 },
  /** Right stand: indigo-violet dusk, with a small rose-gold opening far behind. */
  right: { top: 0x090514, mid: 0x3c1c5a, low: 0x18092c, dusk: 0xe09a70, duskX: 1380, duskY: 300, duskR: 80 },
  /** How much the key bloom dims in the side zones. */
  keyDimL: 0.45,
  keyDimR: 0.88,
  /** At the ending the side zones' dimming of the key bloom eases by this share, over this many sim frames. */
  wake: 0.4,
  wakeFrames: 240,
  /**
   * The wood kit (room-look.ts): no warm bloom; the room's moon (`art.moon`, view px) as a disc with
   * a cool halo (its glow sigma = `glowK` x the disc radius), screen-fixed but for `parallax`; the
   * far warm afterglow (`art.afterglow`) as a low band on the right, `bandHalf` px half height.
   */
  wood: {
    core: 0xf6f9ff,
    glowK: 0.5,
    parallax: 0.02,
    /** Shaded at half the logical view (the Grove's quarter is too coarse for stars and a moon's face). */
    renderScale: 0.5,
    /** The moon's face: darker seas (share of value lost), edge softness (px). */
    maria: 0.07,
    edge: 2.5,
    /** Stars: chance per cell, cell size (view px), peak brightness, how far up the haze lets them go. */
    stars: 0.16,
    starCell: 26,
    starPeak: 0.55,
    band: 0xb8693a,
    bandHalf: 28,
    /** How far the afterglow's band reaches left of its x (view px) before it is gone. */
    bandReach: 420,
    /** Night: top, the band above the haze, low (under the horizon, mostly hidden by the crowns). */
    top: 0x0d182a,
    mid: 0x13233c,
    low: 0x101e34,
    /** The moon's halo colour (falls off with `glowK`), and the cool mist that drifts in the sky. */
    halo: 0x64829f,
    mist: 0x1a2a44,
    /**
     * The pale haze along the far horizon, right behind the walk line: its centre (view y at the
     * reference camera, bg-wood WOOD.refCamY), how far it fades up and down (px), peak mix, colour.
     * It moves with far0 (`horizonParallax`) so it stays on the crowns' line.
     */
    horizonY: 800,
    horizonUp: 230,
    horizonDown: 80,
    horizon: 0.6,
    horizonCol: 0x2e4a68,
    horizonParallax: 0.12,
    /** Thin cloud streaks: amount, and how much the moon silvers the ones near it. */
    clouds: 0.55,
    cloud: 0x1c2e4c,
    cloudLit: 0x8aa6cc,
    /** Cloud drift, view px per second (visible in a second's difference, not a rush). */
    cloudDrift: 16,
  },
} as const;

/**
 * What the sky texture covers, in logical view coordinates: the largest view (contract.ts
 * VIEW_MAX_*) centred on the safe area, 8 px to spare at every edge. Shading that much always (it is
 * a quarter-size texture) means a resize never reallocates it, and its texels fall on the same
 * logical grid as a 16:9-only sky did (336 and 228 are multiples of 1 / renderScale).
 */
export const SKY_RECT = {
  x: (SAFE_W - VIEW_MAX_W) / 2 - 8,
  y: (SAFE_H - VIEW_MAX_H) / 2 - 8,
  w: VIEW_MAX_W + 16,
  h: VIEW_MAX_H + 16,
} as const;

/**
 * The shaded sky: a small texture covering SKY_RECT of the logical view, and the sprite that shows
 * it. far.ts composites the texture itself in its far-pair pass and hides the sprite (one
 * full-screen pass less).
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
  const x = SAFE_W / 2 + SKY.glowOffsetX + (KEY_LIGHT.entryX - cam.x) * SKY.glowParallaxX;
  const y = SKY.glowRestY + (anchorY - cam.y) * SKY.glowParallaxY;
  return {
    x: SAFE_W / 2 + (x - SAFE_W / 2) * cam.zoom,
    y: SAFE_H / 2 + (y - SAFE_H / 2) * cam.zoom,
  };
}

const frag = (): string => `#version 300 es
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
uniform vec4 uDisc;
uniform vec3 uDiscCol;
uniform vec4 uBand;
uniform vec3 uBandCol;
uniform vec4 uHorizon;
uniform vec3 uHorizonCol;
uniform vec4 uCloud;
uniform vec4 uMoonFace;
uniform vec3 uCloudCol;
uniform vec3 uCloudLit;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  // Logical view coordinates (the safe area is 0..${SAFE_W} x 0..${SAFE_H}; SKY_RECT reaches past it).
  vec2 p = vUV * vec2(${SKY_RECT.w}.0, ${SKY_RECT.h}.0) + vec2(${SKY_RECT.x}.0, ${SKY_RECT.y}.0);
  float t = uTimeCam.x;
  float zoom = uTimeCam.z;
  float y = p.y / ${SAFE_H}.0;
  // Zone mood by the playfield x behind each pixel.
  float px = uTimeCam.y + (p.x - ${SAFE_W / 2}.0) / zoom;
  float zl = 1.0 - smoothstep(${ZONES.l0}.0, ${ZONES.l1}.0, px);
  float zr = smoothstep(${ZONES.r0}.0, ${ZONES.r1}.0, px);
  vec3 top = mix(mix(uTop, uTopL, zl), uTopR, zr);
  vec3 midc = mix(mix(uMid, uMidL, zl), uMidR, zr);
  vec3 low = mix(mix(uLow, uLowL, zl), uLowR, zr);
  vec3 col = mix(top, midc, smoothstep(-0.05, 0.6, y));
  col = mix(col, low, smoothstep(0.55, 1.05, y));
  float dx = (p.x - uGlow.x) / (1500.0 * zoom);
  col = mix(col, uCorner, clamp(dx * dx * (1.0 - y * 0.75), 0.0, 0.8));

  vec2 q = (p - vec2(${SAFE_W / 2}.0, ${SAFE_H / 2}.0)) / zoom + vec2(uTimeCam.y * 0.06, 0.0);
  float n = texture(uNoise, q / 1900.0 + vec2(t * 0.0035, t * 0.0006)).r;
  float m = texture(uNoise, q / 700.0 + vec2(-t * 0.006, t * 0.0015)).g;
  float mist = n * 0.65 + m * 0.35;
  col *= 1.0 + uAmt.x * (mist - 0.5) * 1.6;
  col = mix(col, uHalo, clamp((mist - 0.5) * uAmt.x * 0.9, 0.0, 1.0));

  vec2 d = (p - uGlow) / zoom;
  float r = length(d * vec2(1.0, 1.12));
  float breathe = (1.0 + 0.07 * sin(t * 1.15) + 0.03 * sin(t * 0.47 + 1.0)) * uZoneCam.z;
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
  // The wood's moon: a disc over its halo (uDisc: radius, strength), and the far warm afterglow
  // (uBand: x where it starts, y, strength, half height). Both are off in the Grove.
  // The wood's horizon haze (uHorizon: y, reach up, reach down, strength) and thin cloud streaks
  // that the moon silvers near it (uCloud: amount, moon radius); both off in the Grove.
  float hd = p.y - uHorizon.x;
  float hz = exp(-pow(hd / (hd < 0.0 ? uHorizon.y : uHorizon.z), 2.0));
  col = mix(col, uHorizonCol * (0.85 + 0.3 * mist), clamp(hz * uHorizon.w, 0.0, 1.0));
  if (uCloud.x > 0.0) {
    // Stars: one chance per cell, a soft point at a random spot in it, twinkling slowly; the moon's
    // glow and the horizon haze wash them out, clouds hide them.
    vec2 sc = (p + vec2(uTimeCam.y * 0.01, 0.0)) / uMoonFace.w;
    vec2 cell = floor(sc);
    float hs = hash(cell);
    vec2 sp = fract(sc) - (0.2 + 0.6 * vec2(hash(cell + 7.1), hash(cell + 3.3)));
    float star = step(1.0 - uMoonFace.z, hs) * exp(-dot(sp, sp) * uMoonFace.w * uMoonFace.w * 0.22);
    star *= (0.35 + 0.65 * hash(cell + 1.7)) * (0.75 + 0.25 * sin(t * (0.6 + 2.0 * hash(cell + 9.2)) + hs * 40.0));
    star *= smoothstep(0.62, 0.2, y) * smoothstep(uCloud.y * 1.6, uCloud.y * 5.0, rm);
    // Clouds: two scales drifting, edges silvered by the moon near it.
    vec2 cq = q + vec2(t * uCloud.z, 0.0);
    float c1 = texture(uNoise, vec2(cq.x / 2300.0, cq.y / 260.0 + 0.17)).r;
    float c2 = texture(uNoise, vec2(cq.x / 900.0 + 0.4, cq.y / 140.0)).g;
    float c3 = texture(uNoise, vec2(cq.x / 420.0 - t * 0.002, cq.y / 90.0 + 0.6)).b;
    float cv = c1 * 0.7 + c2 * 0.35 + (c3 - 0.5) * 0.18;
    float cl = smoothstep(0.5, 0.8, cv) * smoothstep(0.66, 0.12, y);
    float rimc = smoothstep(0.5, 0.6, cv) - smoothstep(0.62, 0.78, cv);
    float near = exp(-rm / (uCloud.y * 2.6));
    // A clean disc for the swarm to cross: the streaks thin out over it.
    cl *= 1.0 - 0.8 * smoothstep(uCloud.y * 1.25, uCloud.y * 0.9, rm);
    col += vec3(0.75, 0.84, 1.0) * star * uCloud.w * (1.0 - cl);
    col = mix(col, mix(uCloudCol, uCloudLit, near), cl * uCloud.x);
    col += uCloudLit * rimc * near * 0.25 * uCloud.x;
    // The moon's face: soft edge, darker seas, a little limb darkening.
    float rr0 = rm / max(uDisc.x, 1.0);
    float face = smoothstep(uDisc.x + uMoonFace.y, uDisc.x - uMoonFace.y, rm) * uDisc.y;
    vec2 mp = (p - uMoon.xy) / max(uDisc.x, 1.0);
    float sea = smoothstep(0.45, 0.7, texture(uNoise, mp * 0.32 + 0.21).r * 0.7 + texture(uNoise, mp * 0.9 + 0.6).g * 0.3);
    vec3 disc = uDiscCol * (1.0 - uMoonFace.x * sea) * (1.0 - 0.12 * rr0 * rr0);
    col = mix(col, disc, face);
  } else {
    col = mix(col, uDiscCol, smoothstep(uDisc.x + 2.0, uDisc.x - 2.0, rm) * uDisc.y);
  }
  float bx = smoothstep(uBand.x - uDisc.z, uBand.x + 260.0, p.x);
  float by = exp(-pow((p.y - uBand.y) / max(1.0, uBand.w), 2.0));
  col = mix(col, uBandCol, clamp(bx * by * uBand.z, 0.0, 1.0));
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
      uGlow: { value: new Float32Array([SAFE_W / 2, SKY.glowRestY]), type: 'vec2<f32>' },
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
      uDisc: {
        value: new Float32Array([
          LOOK.moon?.r ?? 0,
          LOOK.moon ? 1 : 0,
          LOOK.moon ? SKY.wood.bandReach : 520,
          0,
        ]),
        type: 'vec4<f32>',
      },
      uHorizon: {
        value: new Float32Array(
          LOOK.moon
            ? [SKY.wood.horizonY, SKY.wood.horizonUp, SKY.wood.horizonDown, SKY.wood.horizon]
            : [0, 1, 1, 0],
        ),
        type: 'vec4<f32>',
      },
      uHorizonCol: { value: rgb(SKY.wood.horizonCol), type: 'vec3<f32>' },
      uCloud: {
        value: new Float32Array([
          LOOK.moon ? SKY.wood.clouds : 0,
          LOOK.moon?.r ?? 1,
          SKY.wood.cloudDrift,
          SKY.wood.starPeak,
        ]),
        type: 'vec4<f32>',
      },
      uMoonFace: {
        value: new Float32Array([SKY.wood.maria, SKY.wood.edge, SKY.wood.stars, SKY.wood.starCell]),
        type: 'vec4<f32>',
      },
      uCloudCol: { value: rgb(SKY.wood.cloud), type: 'vec3<f32>' },
      uCloudLit: { value: rgb(SKY.wood.cloudLit), type: 'vec3<f32>' },
      uDiscCol: { value: rgb(SKY.wood.core), type: 'vec3<f32>' },
      uBand: {
        value: new Float32Array(
          LOOK.afterglow
            ? [LOOK.afterglow.x, LOOK.afterglow.y, LOOK.afterglow.strength, SKY.wood.bandHalf]
            : [0, 0, 0, 1],
        ),
        type: 'vec4<f32>',
      },
      uBandCol: { value: rgb(SKY.wood.band), type: 'vec3<f32>' },
    });
    if (LOOK.moon) {
      // The wood: one cool night everywhere (its zones are all "left"), a cool halo and mist.
      const u = this.uniforms.uniforms as Record<string, Float32Array>;
      const W = SKY.wood;
      for (const [k, c] of [
        ['uTop', W.top],
        ['uTopL', W.top],
        ['uMid', W.mid],
        ['uMidL', W.mid],
        ['uLow', W.low],
        ['uLowL', W.low],
        ['uCorner', W.top],
        ['uHalo', W.mist],
        ['uMoonCol', W.halo],
      ] as const)
        u[k]?.set(rgb(c));
    }
    const shader = Shader.from({
      gl: { vertex: BG_VERT, fragment: frag() },
      resources: { uNoise: noiseTexture().source, sky: this.uniforms },
    });
    // Overdraw a little so sub-pixel canvas rounding never shows the clear colour.
    const R = SKY_RECT;
    this.mesh = new Mesh({ geometry: quadGeometry(R.x, R.y, R.w, R.h), shader });
    // The sky is all soft gradients and mostly hidden: shade it small, then stretch it (a full-size
    // pass of this shader was the most expensive thing in the background).
    const k = LOOK.moon ? SKY.wood.renderScale : SKY.renderScale;
    this.renderer = ctx.renderer;
    this.target = RenderTexture.create({
      width: Math.ceil(R.w * k),
      height: Math.ceil(R.h * k),
      resolution: 1,
    });
    this.toTarget = new Matrix(k, 0, 0, k, -R.x * k, -R.y * k);
    const sprite = new Sprite(this.target);
    SKY_OUTPUT.texture = this.target;
    SKY_OUTPUT.sprite = sprite;
    sprite.label = 'sky-glow';
    sprite.position.set(R.x, R.y);
    sprite.setSize(R.w, R.h);
    ctx.layers.sky.addChild(sprite);
    if (import.meta.env.DEV) {
      // Lets tools toggle layers: __bg.layers.get('playfield').visible = false; __game.render().
      const g = globalThis as { __bg?: Record<string, unknown> };
      g.__bg = Object.assign(g.__bg ?? {}, { layers: ctx.layers });
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
      return [SAFE_W / 2 + (sx - SAFE_W / 2) * cam.zoom, SAFE_H / 2 + (sy - SAFE_H / 2) * cam.zoom];
    };
    // The ending (memory/goal.md): the grove wakes, so the key bloom shows a little in the side zones too.
    const goal = frame.sim.goal;
    const e = goal.gathered ? Math.min(1, goal.ending.frames / SKY.wakeFrames) : 0;
    const wake = e * e * (3 - 2 * e) * SKY.wake;
    const dim = 1 - (SKY.keyDimL * z.l + SKY.keyDimR * z.r) * (1 - wake);
    const moon = LOOK.moon;
    if (moon) {
      // The wood: the room's moon, nearly screen-fixed, and no warm bloom at all.
      const k = SKY.wood.parallax / SKY.glowParallaxX;
      const [mx, my] = at(moon.x, moon.y, cam.x + (LOOK.keyEntryX - cam.x) * k);
      (u.uZoneCam as Float32Array).set([1, 0, 0, 0]);
      (u.uMoon as Float32Array).set([mx, my, moon.r * SKY.wood.glowK, 0]);
      (u.uDisc as Float32Array)[0] = moon.r * cam.zoom;
      // The horizon haze and the afterglow ride with the far crowns (far0's parallax).
      const W = SKY.wood;
      const hy = W.horizonY + (WOOD.refCamY - cam.y) * W.horizonParallax;
      (u.uHorizon as Float32Array)[0] = SAFE_H / 2 + (hy - SAFE_H / 2) * cam.zoom;
      const glow = LOOK.afterglow;
      if (glow) {
        const by = glow.y + (WOOD.refCamY - cam.y) * W.horizonParallax;
        (u.uBand as Float32Array)[1] = SAFE_H / 2 + (by - SAFE_H / 2) * cam.zoom;
      }
    } else {
      (u.uZoneCam as Float32Array).set([z.l, z.r, dim * (1 + 0.3 * wake), 0]);
      (u.uMoon as Float32Array).set(at(SKY.left.moonX, SKY.left.moonY, 960));
    }
    (u.uDusk as Float32Array).set(at(SKY.right.duskX, SKY.right.duskY, 4800));
    this.renderer.render({
      container: this.mesh,
      target: this.target,
      clear: false,
      transform: this.toTarget,
    });
  }
}
