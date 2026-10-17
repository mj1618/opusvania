/**
 * The path's moonlit rim (wood kit): a live strip along every walk top, drawn over the baked bark.
 * It is the brightest, crispest line in the playfield (docs/design/scenes/01-look-target.md: moss rim
 * `#5e8a84`, p90 100-135), and it is never still:
 *
 *   - a fuzzy moss edge (fibres, cushions) instead of a ruled line
 *   - dappled moonlight: a leaf-shadow mask from the canopy above, warped by the shared wind, drifts
 *     along it, so the lit rim shimmers like leaf shade (technique-library: Tunic, Planet of Lana)
 *   - light that remembers her: where her feet touched the moss, its dew holds a little more moon
 *     and lets it go over ~2 s (Flower, Sky)
 *
 * One mesh, one shader; the CPU only writes the clock and her trail. Render only: reads sim state.
 */
import { Buffer, BufferUsage, Container, Geometry, Mesh, Shader } from 'pixi.js';
import type { BranchPlan } from './pf-branch';

export const RIM = {
  /** Lit and leaf-shaded rim colours (before post). */
  lit: 0x7aa69e,
  shade: 0x2b4846,
  /** The crest's brightest band: px under the moss edge, and the soft glow under it. */
  band: 2.2,
  glow: 6,
  /** Moss edge: how far fibres and cushions rise over the walk line, px. */
  fuzz: 4.5,
  /** Share of the rim in leaf shade (0..1) and how fast the dapples drift (px/s along x). */
  shadeShare: 0.4,
  drift: 9,
  /** Her trail: points kept, seconds between them, how long the dew holds the light. */
  trail: 12,
  trailEvery: 0.12,
  trailHold: 2.2,
  /** How much brighter the moss is where she walked (0..1) and its half width, px. */
  trailGain: 0.55,
  trailReach: 26,
} as const;

const STRIDE = 5;

const VERT = `#version 300 es
precision highp float;
in vec2 aPosition;
in vec3 aRim;     // walk line y, end fade, seed
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out vec2 vWorld;
out vec3 vRim;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = aPosition;
  vRim = aRim;
}`;

const c3 = (c: number): string =>
  `vec3(${(((c >> 16) & 255) / 255).toFixed(4)}, ${(((c >> 8) & 255) / 255).toFixed(4)}, ${((c & 255) / 255).toFixed(4)})`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vWorld;
in vec3 vRim;
uniform vec4 uTime;      // clock, -, -, -
uniform vec4 uTrail[${RIM.trail}];  // x, feet y, strength, -
out vec4 o;
float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), u);
}
float hash2(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
}
// Keep identical to wind() in look.ts.
float wind(float x, float clock, float phase) {
  float t = clock * 0.9 - x * 0.0016 + phase * 6.283;
  float gust = 0.5 + 0.5 * sin(clock * 0.23 - x * 0.0005);
  return sin(t) * (0.35 + 0.45 * gust) + sin(t * 2.7 + 1.3) * 0.14 + sin(t * 5.1) * 0.05;
}
void main() {
  float x = vWorld.x;
  float y = vWorld.y;
  float clock = uTime.x;
  // The moss edge: cushions (slow), tufts (medium) and single fibres (fast).
  float edge = vRim.x - ${RIM.fuzz.toFixed(2)} * (0.35 + 0.45 * noise(x * 0.045 + vRim.z) + 0.35 * noise(x * 0.31 + vRim.z * 2.0))
             - 2.2 * pow(noise(x * 1.7 + vRim.z), 6.0);
  float above = edge - y;
  float a = smoothstep(0.9, -0.5, above);
  // Brightest along the edge itself, a soft glow just under it, gone a few px down.
  float d = max(0.0, y - edge);
  float bright = exp(-d / ${RIM.band.toFixed(2)}) * 0.85 + exp(-d / ${RIM.glow.toFixed(2)}) * 0.25;
  // Leaf shade from the canopy above: blobs that drift and sway with the wind.
  float sway = wind(x, clock, 0.0) * 14.0 + wind(x * 0.37, clock * 0.7, 0.3) * 8.0;
  vec2 q = vec2((x + sway - clock * ${RIM.drift.toFixed(2)}) * 0.011, clock * 0.05);
  float leaf = vnoise(q) * 0.65 + vnoise(q * 2.7 + 7.0) * 0.35;
  float lit = smoothstep(${(RIM.shadeShare - 0.1).toFixed(3)}, ${(RIM.shadeShare + 0.12).toFixed(3)}, leaf);
  vec3 col = mix(${c3(RIM.shade)}, ${c3(RIM.lit)}, lit);
  // Light that remembers her: the moss she touched holds a little more of the moon.
  float mem = 0.0;
  for (int i = 0; i < ${RIM.trail}; i++) {
    vec4 t = uTrail[i];
    float dx = (x - t.x) / ${RIM.trailReach.toFixed(1)};
    mem += t.z * exp(-dx * dx) * step(abs(vRim.x - t.y), 24.0);
  }
  mem = min(1.0, mem);
  col = mix(col, ${c3(RIM.lit)} * 1.35, mem * ${RIM.trailGain.toFixed(3)});
  float alpha = a * bright * vRim.y * (0.75 + 0.25 * lit + 0.3 * mem);
  o = vec4(col * alpha, alpha);
}`;

/** The live rim over every walk top of the plan. */
export class Rim {
  readonly container = new Container({ label: 'pf-rim' });
  private readonly time = new Float32Array([0, 0, 0, 0]);
  private readonly trail = new Float32Array(RIM.trail * 4);
  private head = 0;
  private lastT = -1;
  private readonly stamps = new Float32Array(RIM.trail);

  constructor(plan: BranchPlan) {
    const verts: number[] = [];
    const index: number[] = [];
    for (const st of plan.stretches) {
      // Over a free end the rim runs on a little and fades; at a joint it stops flush.
      const freeL = st.west === 'tip' || st.west === 'hook';
      const freeR = st.east === 'fork' || st.east === 'end' || st.east === 'knee';
      const x0 = st.x0 - (freeL ? 10 : st.west === 'trunk' ? 26 : 0);
      const x1 = st.x1 + (freeR ? 10 : 0);
      const seed = (st.x0 * 0.0137) % 50;
      const step = 4;
      const n = Math.ceil((x1 - x0) / step);
      const base = verts.length / STRIDE;
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const fade = Math.min(1, (x - x0) / (freeL ? 24 : 8), (x1 - x) / (freeR ? 24 : 8));
        verts.push(x, st.y - 10, st.y, fade, seed);
        verts.push(x, st.y + 12, st.y, fade, seed);
        if (i > 0) {
          const k = base + i * 2;
          index.push(k - 2, k - 1, k, k - 1, k + 1, k);
        }
      }
    }
    const shader = Shader.from({
      gl: { vertex: VERT, fragment: FRAG },
      resources: {
        u: {
          uTime: { value: this.time, type: 'vec4<f32>' },
          uTrail: { value: this.trail, type: 'vec4<f32>', size: RIM.trail },
        },
      },
    });
    const buf = new Buffer({ data: new Float32Array(verts), usage: BufferUsage.VERTEX });
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: buf, format: 'float32x2', stride: STRIDE * 4, offset: 0 },
        aRim: { buffer: buf, format: 'float32x3', stride: STRIDE * 4, offset: 8 },
      },
      indexBuffer: new Uint32Array(index),
    });
    this.container.addChild(new Mesh({ geometry, shader }));
  }

  /** Render time and her feet (only while she stands on something). */
  update(clock: number, feetX: number, feetY: number, grounded: boolean): void {
    this.time[0] = clock;
    if (grounded && clock - this.lastT >= RIM.trailEvery) {
      this.lastT = clock;
      const i = this.head;
      this.trail[i * 4] = feetX;
      this.trail[i * 4 + 1] = feetY;
      this.stamps[i] = clock;
      this.head = (i + 1) % RIM.trail;
    }
    if (clock < this.lastT) this.lastT = -1;
    for (let i = 0; i < RIM.trail; i++) {
      const age = clock - (this.stamps[i] as number);
      this.trail[i * 4 + 2] =
        this.stamps[i] === 0 || age < 0 ? 0 : Math.max(0, 1 - age / RIM.trailHold) ** 1.5;
    }
  }
}
