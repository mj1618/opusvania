/**
 * The pool. Two quads share one shader: `back` (behind the character) is the water body with a
 * depth gradient and a fake reflection of the sky; `front` (over the character) is the
 * translucent tint that covers whatever wades in, the bright surface line with glints, the
 * reflection of dynamic lights (the ember), and the rings the character makes. The surface is a
 * sum of slow sines plus up to four travelling ripples, all in the fragment shader.
 */
import { Geometry, Mesh, Shader } from 'pixi.js';
import type { SimEvent } from '../../../sim/events';
import type { PlayerView } from '../../contract';
import type { PointLight } from '../../lights';

export const WATER = {
  shallow: 0x2b8f96,
  deep: 0x0a2746,
  /** Sky as the water mirrors it: at the surface (horizon) and deeper (overhead). */
  skyNear: 0x6fc0bc,
  skyFar: 0x16345a,
  line: 0xd4fbff,
  /** Alpha of the body behind the character, top and bottom. */
  backAlpha: [0.72, 0.94] as const,
  /** Alpha of the tint over the character, top and bottom. */
  frontAlpha: [0.3, 0.62] as const,
  /** Idle swell height in px. */
  swell: 1.1,
  /** Ripple speed px/s, life s, ring width px. */
  rippleSpeed: 64,
  rippleLife: 3.2,
  rippleWidth: 20,
  /** How far the body extends under the banks (hidden by them). */
  tuck: 12,
} as const;

const VERT = `#version 300 es
precision highp float;
in vec2 aPosition;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out vec2 vWorld;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = aPosition;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vWorld;
uniform vec4 uPool;     // x0, x1, surface y, floor y
uniform vec4 uTime;     // clock, front (0/1), swell, -
uniform vec4 uRipple;   // speed, life, width, -
uniform mat4 uRipples;  // per column: x, start time, amplitude, -
uniform mat4 uLights;   // columns 0/2: x, y, radius, intensity; 1/3: rgb
uniform vec4 uPlayer;   // x, half width, in water 0..1, speed
uniform vec4 uAlpha;    // back top, back bottom, front top, front bottom
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSkyNear;
uniform vec3 uSkyFar;
uniform vec3 uLine;
out vec4 o;

float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

float surfaceAt(float x) {
  float t = uTime.x;
  float y = (sin(x * 0.043 + t * 1.25) * 0.5 + sin(x * 0.102 - t * 1.8) * 0.28 + sin(x * 0.019 + t * 0.55) * 0.45) * uTime.z;
  for (int i = 0; i < 4; i++) {
    vec4 r = uRipples[i];
    float age = t - r.y;
    if (r.z > 0.0 && age > 0.0 && age < uRipple.y) {
      float d = abs(x - r.x);
      float front = age * uRipple.x;
      float env = exp(-pow((d - front) / uRipple.z, 2.0)) * (1.0 - age / uRipple.y);
      y += r.z * env * sin((d - front) * 0.34);
    }
  }
  // Still at the banks.
  float edge = smoothstep(uPool.x, uPool.x + 26.0, x) * smoothstep(uPool.y, uPool.y - 26.0, x);
  return y * (0.35 + 0.65 * edge);
}

void main() {
  float x = vWorld.x;
  float t = uTime.x;
  float s = uPool.z + surfaceAt(x);
  float depth = vWorld.y - s;
  float total = uPool.w - uPool.z;
  if (depth < -3.0) { o = vec4(0.0); return; }
  float under = smoothstep(-0.8, 0.8, depth);
  float dn = clamp(depth / total, 0.0, 1.0);
  float slope = surfaceAt(x + 1.5) - surfaceAt(x - 1.5);

  if (uTime.y < 0.5) {
    // Behind the character: the body, and the sky mirrored in its upper part.
    vec3 body = mix(uShallow, uDeep, pow(dn, 0.7));
    float wob = sin(depth * 0.23 + t * 1.6 + x * 0.05) * 3.0 + sin(depth * 0.11 - t * 0.9) * 4.0 + slope * 9.0;
    float bands = 0.5 + 0.5 * sin((x + wob) * 0.052 + sin((x + wob) * 0.017) * 2.0);
    bands = smoothstep(0.25, 0.85, bands);
    vec3 sky = mix(uSkyNear, uSkyFar, smoothstep(0.0, 0.75, dn)) * (0.45 + 0.55 * bands);
    float refl = exp(-depth / (total * 0.5)) * 0.62;
    vec3 c = mix(body, sky, refl);
    float a = mix(uAlpha.x, uAlpha.y, pow(dn, 0.6)) * under;
    o = vec4(c * a, a);
    return;
  }

  // In front of the character.
  vec3 tint = mix(uShallow, uDeep, pow(dn, 0.8));
  float a = mix(uAlpha.z, uAlpha.w, dn) * under;
  vec3 add = vec3(0.0);
  // Soft light bands drifting through the body.
  float ca = sin(x * 0.07 + depth * 0.05 + t * 0.7) * sin(x * 0.031 - depth * 0.09 - t * 0.5);
  add += uShallow * smoothstep(0.55, 1.0, ca) * 0.16 * (1.0 - dn) * under;
  // Surface line: bright where the swell tilts toward the light, with travelling glints.
  float line = exp(-pow((depth - 0.6) / 1.5, 2.0));
  float glow = exp(-max(depth, 0.0) / 7.0) * under;
  float tilt = 0.55 + clamp(-slope * 1.6, -0.35, 0.6);
  float cell = floor(x / 7.0);
  float tw = hash(cell) * 6.283;
  float glint = pow(max(0.0, sin(t * (1.1 + hash(cell + 3.0)) + tw)), 14.0) * step(0.62, hash(cell + 9.0));
  add += uLine * (line * tilt * 0.8 + glow * 0.12 + line * glint * 1.4);
  // Rings where the character stands in it.
  float pd = abs(x - uPlayer.x);
  float ring = exp(-pow((pd - uPlayer.y - 3.0) / 5.0, 2.0)) * uPlayer.z;
  add += uLine * line * ring * (0.9 + 0.5 * sin(t * 6.0 + pd * 0.5));
  // Dynamic lights mirrored in the surface: a wobbling streak under each light.
  for (int i = 0; i < 2; i++) {
    vec4 l = uLights[i * 2];
    vec3 lc = uLights[i * 2 + 1].rgb;
    float above = s - l.y;
    if (l.w > 0.0 && above > -6.0 && abs(x - l.x) < l.z) {
      float h = max(above, 0.0);
      float wx = sin(depth * 0.3 + t * 2.2) * (2.0 + depth * 0.12) + slope * 10.0;
      float wide = 9.0 + h * 0.05 + depth * 0.1;
      float sx = exp(-pow((x - l.x + wx) / wide, 2.0));
      float len = 16.0 + h * 0.22;
      float sy = exp(-pow(max(depth, 0.0) / len, 1.4));
      float near = exp(-h / (l.z * 0.75));
      add += lc * sx * sy * near * l.w * 0.95 * under;
    }
  }
  // Fade out at the banks so the overlay never tints them.
  float bank = smoothstep(uPool.x - 2.0, uPool.x + 5.0, x) * smoothstep(uPool.y + 2.0, uPool.y - 5.0, x);
  o = vec4(tint * a + add, a) * bank;
}`;

function rgb(c: number): Float32Array {
  return new Float32Array([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]);
}

export interface PoolShape {
  x0: number;
  x1: number;
  floor: number;
  surface: number;
}

export class Water {
  readonly back: Mesh<Geometry, Shader>;
  readonly front: Mesh<Geometry, Shader>;
  private readonly timeBack = new Float32Array([0, 0, WATER.swell, 0]);
  private readonly timeFront = new Float32Array([0, 1, WATER.swell, 0]);
  private readonly ripples = new Float32Array(16);
  private readonly lights = new Float32Array(16);
  private readonly player = new Float32Array(4);
  private next = 0;
  private wasIn = false;
  private wade = 0;
  private inWater = 0;

  constructor(private readonly pool: PoolShape) {
    const x0 = pool.x0 - WATER.tuck;
    const x1 = pool.x1 + WATER.tuck;
    const y0 = pool.surface - 10;
    const y1 = pool.floor + 10;
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]), format: 'float32x2' },
      },
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const make = (time: Float32Array): Mesh<Geometry, Shader> =>
      new Mesh({
        geometry,
        shader: Shader.from({
          gl: { vertex: VERT, fragment: FRAG },
          resources: {
            u: {
              uPool: {
                value: new Float32Array([pool.x0, pool.x1, pool.surface, pool.floor]),
                type: 'vec4<f32>',
              },
              uTime: { value: time, type: 'vec4<f32>' },
              uRipple: {
                value: new Float32Array([WATER.rippleSpeed, WATER.rippleLife, WATER.rippleWidth, 0]),
                type: 'vec4<f32>',
              },
              uRipples: { value: this.ripples, type: 'mat4x4<f32>' },
              uLights: { value: this.lights, type: 'mat4x4<f32>' },
              uPlayer: { value: this.player, type: 'vec4<f32>' },
              uAlpha: {
                value: new Float32Array([...WATER.backAlpha, ...WATER.frontAlpha]),
                type: 'vec4<f32>',
              },
              uShallow: { value: rgb(WATER.shallow), type: 'vec3<f32>' },
              uDeep: { value: rgb(WATER.deep), type: 'vec3<f32>' },
              uSkyNear: { value: rgb(WATER.skyNear), type: 'vec3<f32>' },
              uSkyFar: { value: rgb(WATER.skyFar), type: 'vec3<f32>' },
              uLine: { value: rgb(WATER.line), type: 'vec3<f32>' },
            },
          },
        }),
      });
    this.back = make(this.timeBack);
    this.front = make(this.timeFront);
  }

  private ripple(x: number, clock: number, amp: number): void {
    const i = this.next * 4;
    this.ripples[i] = x;
    this.ripples[i + 1] = clock;
    this.ripples[i + 2] = amp;
    this.next = (this.next + 1) % 4;
  }

  update(
    dt: number,
    clock: number,
    player: PlayerView,
    lights: readonly PointLight[],
    events: readonly SimEvent[],
    visible: boolean,
  ): void {
    this.back.visible = visible;
    this.front.visible = visible;
    const p = this.pool;
    const over = player.cx > p.x0 && player.cx < p.x1;
    const isIn = over && player.feetY > p.surface + 3 && player.y < p.surface + 6;
    if (isIn !== this.wasIn) {
      this.ripple(player.cx, clock, Math.min(4.5, 1.6 + Math.abs(player.vy) * 0.25));
      this.wasIn = isIn;
      this.wade = 0;
    }
    for (const e of events) {
      if (e.type === 'spawn') this.ripples.fill(0);
      else if (e.type === 'land' && e.x > p.x0 && e.x < p.x1 && e.y > p.surface) this.ripple(e.x, clock, 3.6);
    }
    if (isIn) {
      this.wade += Math.abs(player.vx) * dt * 60;
      if (this.wade > 46) {
        this.wade = 0;
        this.ripple(player.cx, clock, 1.5);
      }
    }
    this.inWater += ((isIn ? 1 : 0) - this.inWater) * Math.min(1, dt * 9);
    this.timeBack[0] = clock;
    this.timeFront[0] = clock;
    this.player[0] = player.cx;
    this.player[1] = player.w / 2;
    this.player[2] = this.inWater;
    this.player[3] = Math.abs(player.vx);
    this.lights.fill(0);
    let n = 0;
    for (const l of lights) {
      if (n >= 2 || l.intensity <= 0) continue;
      if (l.x < p.x0 - l.radius || l.x > p.x1 + l.radius) continue;
      const i = n * 8;
      this.lights[i] = l.x;
      this.lights[i + 1] = l.y;
      this.lights[i + 2] = l.radius;
      this.lights[i + 3] = l.intensity;
      this.lights[i + 4] = ((l.color >> 16) & 255) / 255;
      this.lights[i + 5] = ((l.color >> 8) & 255) / 255;
      this.lights[i + 6] = (l.color & 255) / 255;
      n++;
    }
  }
}
