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
  shallow: 0x35b4c2,
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
  /** Height above the surface the front quad covers, for splash droplets. */
  splashRoom: 64,
  /** Seconds between the small rings that appear on their own. */
  idleRipple: 4.7,
  /** Opacity of the three fish (0 hides them). */
  fish: 1,
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
uniform float uFish;    // opacity of the fish
uniform vec4 uSplash;   // x, start time, strength, -
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
      y += r.z * env * sin((d - front) * 0.2);
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
  if (depth < -3.0) {
    // Above the water: only the droplets a splash throws up (front quad).
    float sAge = t - uSplash.y;
    if (uTime.y < 0.5 || uSplash.z <= 0.0 || sAge < 0.0 || sAge > 0.75) { o = vec4(0.0); return; }
    float acc = 0.0;
    for (int i = 0; i < 14; i++) {
      float fi = float(i);
      float vx = (hash(fi + 1.3) - 0.5) * 210.0;
      float vy = 90.0 + hash(fi + 7.1) * 150.0;
      vec2 dp = vec2(uSplash.x + vx * sAge, s - (vy * sAge - 330.0 * sAge * sAge) * uSplash.z);
      float rad = (2.6 + 2.4 * hash(fi + 3.7)) * (1.0 - sAge * 0.7);
      acc += 1.0 - smoothstep(rad - 1.4, rad, length(vWorld - dp));
    }
    float da = clamp(acc, 0.0, 1.0) * (1.0 - sAge / 0.75);
    o = vec4(uLine * da * 0.85, da * 0.7);
    return;
  }
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
    float refl = exp(-depth / (total * 0.6)) * 0.8;
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
  // Caustics: a net of light crawling over the pool floor.
  float cx1 = sin(x * 0.09 + sin(depth * 0.3 + t * 0.9) * 1.5 + t * 0.8);
  float cx2 = sin(x * 0.05 - depth * 0.25 - t * 0.6 + sin(x * 0.021 + t * 0.3) * 2.0);
  float caustic = pow(1.0 - abs(cx1), 4.0) * pow(1.0 - abs(cx2), 2.0);
  add += uLine * caustic * 0.42 * smoothstep(total - 34.0, total - 4.0, depth) * under;
  // The same light wandering up the two banks.
  float bankGlow = exp(-min(x - uPool.x, uPool.y - x) / 14.0);
  add += uLine * bankGlow * (0.12 + 0.3 * pow(1.0 - abs(sin(depth * 0.2 + t * 1.1)), 4.0)) * under;
  // Small fish: slim dark shapes that hang still, then dart to a new spot. A pale glint on the flank.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float ph = t * (0.21 + fi * 0.045) + fi * 0.37;
    float leg = floor(ph);
    float move = smoothstep(0.0, 0.22, fract(ph));
    vec2 from = vec2(hash(leg + fi * 17.0), hash(leg + fi * 31.0 + 5.0));
    vec2 to = vec2(hash(leg + 1.0 + fi * 17.0), hash(leg + 1.0 + fi * 31.0 + 5.0));
    vec2 q = mix(from, to, move);
    float fx = mix(uPool.x + 34.0, uPool.y - 34.0, q.x);
    float fy = total * (0.42 + 0.34 * q.y) + sin(t * 2.2 + fi) * 0.8;
    float dir = to.x > from.x ? 1.0 : -1.0;
    float lx = (x - fx) * dir;
    float ly = depth - fy + sin(t * 9.0 + lx * 0.5) * 0.35 * (1.0 - move * 0.0);
    float body = (1.0 - smoothstep(0.75, 1.0, length(vec2((lx - 1.0) / 7.5, ly / 2.1))));
    float tail = step(-11.5, lx) * step(lx, -5.5) * (1.0 - smoothstep(0.6, 1.0, abs(ly) / max(0.4, (-lx - 5.0) * 0.52)));
    float fish = clamp(body + tail, 0.0, 1.0) * under * uFish;
    tint = mix(tint, vec3(0.03, 0.1, 0.16), fish);
    a = mix(a, 0.92, fish);
    add += uLine * body * uFish * 0.55 * exp(-pow((ly + 0.9) / 0.7, 2.0)) * smoothstep(-4.0, 3.0, lx);
  }
  // Foam where the water meets the banks.
  float bankD = min(x - uPool.x, uPool.y - x);
  float foam = exp(-bankD / 9.0) * exp(-pow((depth - 1.0) / 2.6, 2.0)) * (0.6 + 0.4 * sin(t * 2.1 + x * 0.7));
  add += uLine * foam * 0.75;
  // Surface line: bright where the swell tilts toward the light, with travelling glints.
  float line = exp(-pow((depth - 0.6) / 1.5, 2.0));
  float glow = exp(-max(depth, 0.0) / 7.0) * under;
  float tilt = 0.55 + clamp(-slope * 1.6, -0.35, 0.6);
  float cell = floor(x / 7.0);
  float tw = hash(cell) * 6.283;
  float glint = pow(max(0.0, sin(t * (1.1 + hash(cell + 3.0)) + tw)), 14.0) * step(0.62, hash(cell + 9.0)) * pow(sin(3.14159 * fract(x / 7.0)), 2.0);
  add += uLine * (line * tilt * 0.8 + glow * 0.12 + line * glint * 1.4);
  // The crown of a landing splash: a bright ring racing outward along the surface.
  float spAge = t - uSplash.y;
  if (uSplash.z > 0.0 && spAge > 0.0 && spAge < 0.9) {
    float sd = abs(x - uSplash.x);
    float crown = exp(-pow((sd - spAge * 130.0) / (7.0 + spAge * 16.0), 2.0)) * (1.0 - spAge / 0.9);
    add += uLine * crown * uSplash.z * (line * 1.6 + glow * 0.5);
  }
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
  private readonly splash = new Float32Array(4);
  private idleBeat = -1;
  private next = 0;
  private wasIn = false;
  private wade = 0;
  private inWater = 0;

  constructor(private readonly pool: PoolShape) {
    const x0 = pool.x0 - WATER.tuck;
    const x1 = pool.x1 + WATER.tuck;
    const y0 = pool.surface - WATER.splashRoom;
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
              uSplash: { value: this.splash, type: 'vec4<f32>' },
              uFish: { value: WATER.fish, type: 'f32' },
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
      this.ripple(player.cx, clock, Math.min(2.4, 1 + Math.abs(player.vy) * 0.1));
      this.wasIn = isIn;
      this.wade = 0;
    }
    for (const e of events) {
      if (e.type === 'spawn') this.ripples.fill(0);
      else if (e.type === 'land' && e.x > p.x0 && e.x < p.x1 && e.y > p.surface) {
        // Landing in the pool: a ring and a burst of droplets, bigger for a harder fall.
        this.ripple(e.x, clock, 1.8);
        this.splash[0] = e.x;
        this.splash[1] = clock;
        this.splash[2] = Math.min(1.5, 0.6 + e.vy / 18);
      }
    }
    // Now and then something rises: a small ring somewhere on the surface.
    const beat = Math.floor(clock / WATER.idleRipple);
    if (beat !== this.idleBeat) {
      if (this.idleBeat >= 0) {
        const h = Math.sin(beat * 91.7) * 43758.5453;
        this.ripple(p.x0 + 30 + (h - Math.floor(h)) * (p.x1 - p.x0 - 60), clock, 1.5);
      }
      this.idleBeat = beat;
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
