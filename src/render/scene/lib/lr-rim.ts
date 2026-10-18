/**
 * Lanternroot's live rim (the wood's pf-rim.ts, in each band's light): a fuzzy bright edge along every walk
 * top and shelf, the highest local contrast in the playfield (art direction: the path must always read).
 * Night: the moon's silver on moss, dappled by leaf shade. Hall: lamplight on a fungus skin, flickering
 * slowly with the flames. Roots: a thin wet glint that wanders like light off water. Cache: amber, calm.
 * Her steps leave the edge a little brighter for ~2 s. One mesh, one shader; the CPU writes the clock and
 * her trail. Render only.
 */
import { Buffer, BufferUsage, Container, Geometry, Mesh, Shader } from 'pixi.js';
import type { LanternPlan } from './lr-terrain';
import type { LanternBand } from './room-look';

export const LR_RIM = {
  /** Lit and shaded rim colours per band (before post). */
  colors: {
    night: { lit: 0x7aa69e, shade: 0x2b4846 },
    hall: { lit: 0xd9a868, shade: 0x5a3c22 },
    roots: { lit: 0x86c0c4, shade: 0x2a4a50 },
    cache: { lit: 0xd29a5e, shade: 0x553823 },
  } as Record<LanternBand, { lit: number; shade: number }>,
  /** Brightness per band (the roots' wet glint is thinner). */
  gain: { night: 1, hall: 0.95, roots: 1.15, cache: 0.9 } as Record<LanternBand, number>,
  band: 2.2,
  glow: 6,
  fuzz: 4.5,
  shadeShare: 0.4,
  drift: 9,
  trail: 12,
  trailEvery: 0.12,
  trailHold: 2.2,
  trailGain: 0.55,
  trailReach: 26,
} as const;

const STRIDE = 6;
const VERT = `#version 300 es
precision highp float;
in vec2 aPosition;
in vec4 aRim;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out vec2 vWorld;
out vec4 vRim;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = aPosition;
  vRim = aRim;
}`;

const c3 = (c: number): string =>
  `vec3(${(((c >> 16) & 255) / 255).toFixed(4)}, ${(((c >> 8) & 255) / 255).toFixed(4)}, ${((c & 255) / 255).toFixed(4)})`;

function frag(band: LanternBand): string {
  const R = LR_RIM;
  const C = R.colors[band];
  // How the light moves along the edge: leaf shade (night), slow flame flicker (hall, cache), water glints (roots).
  const shade =
    band === 'night'
      ? `float sway = wind(x, clock, 0.0) * 14.0 + wind(x * 0.37, clock * 0.7, 0.3) * 8.0;
  vec2 q = vec2((x + sway - clock * ${R.drift.toFixed(2)}) * 0.011, clock * 0.05);
  float leaf = vnoise(q) * 0.65 + vnoise(q * 2.7 + 7.0) * 0.35;
  float lit = smoothstep(${(R.shadeShare - 0.1).toFixed(3)}, ${(R.shadeShare + 0.12).toFixed(3)}, leaf);`
      : band === 'roots'
        ? `vec2 q = vec2(x * 0.02 + clock * 0.35, clock * 0.6);
  float leaf = vnoise(q) * 0.6 + vnoise(q * 3.1 + 4.0) * 0.4;
  float lit = 0.25 + 0.75 * pow(smoothstep(0.45, 0.85, leaf), 2.0);`
        : `vec2 q = vec2(x * 0.004, clock * 0.9);
  float leaf = vnoise(q) * 0.7 + vnoise(q * 2.3 + 3.0) * 0.3;
  float lit = 0.62 + 0.38 * smoothstep(0.25, 0.8, leaf);`;
  return `#version 300 es
precision highp float;
in vec2 vWorld;
in vec4 vRim;
uniform vec4 uTime;
uniform vec4 uTrail[${R.trail}];
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
  float edge = vRim.x - ${R.fuzz.toFixed(2)} * (0.35 + 0.45 * noise(x * 0.045 + vRim.z) + 0.35 * noise(x * 0.31 + vRim.z * 2.0))
             - 2.2 * pow(noise(x * 1.7 + vRim.z), 6.0);
  float above = edge - y;
  float a = smoothstep(0.9, -0.5, above);
  float d = max(0.0, y - edge);
  float bright = exp(-d / ${R.band.toFixed(2)}) * 0.85 + exp(-d / ${R.glow.toFixed(2)}) * 0.25;
  ${shade}
  vec3 col = mix(${c3(C.shade)}, ${c3(C.lit)}, lit);
  float mem = 0.0;
  for (int i = 0; i < ${R.trail}; i++) {
    vec4 t = uTrail[i];
    float dx = (x - t.x) / ${R.trailReach.toFixed(1)};
    mem += t.z * exp(-dx * dx) * step(abs(vRim.x - t.y), 24.0);
  }
  mem = min(1.0, mem);
  col = mix(col, ${c3(C.lit)} * 1.35, mem * ${R.trailGain.toFixed(3)});
  float alpha = a * bright * vRim.y * vRim.w * (0.75 + 0.25 * lit + 0.3 * mem) * ${R.gain[band].toFixed(3)};
  o = vec4(col * alpha, alpha);
}`;
}

/** The live rim over every top and shelf of a Lanternroot room. */
export class LanternRim {
  readonly container = new Container({ label: 'lr-rim' });
  private readonly time = new Float32Array([0, 0, 0, 0]);
  private readonly trail = new Float32Array(LR_RIM.trail * 4);
  private head = 0;
  private lastT = -1;
  private readonly stamps = new Float32Array(LR_RIM.trail);

  constructor(plan: LanternPlan) {
    const verts: number[] = [];
    const index: number[] = [];
    const add = (
      x0: number,
      x1: number,
      top: (x: number) => number,
      seed: number,
      glowAt: (x: number) => number,
    ): void => {
      const step = 4;
      const n = Math.max(1, Math.ceil((x1 - x0) / step));
      const base = verts.length / STRIDE;
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const fade = Math.min(1, (x - x0) / 6, (x1 - x) / 6);
        const y = top(x) - 1;
        const glow = glowAt(x);
        verts.push(x, y - 12, y, fade, seed, glow);
        verts.push(x, y + 12, y, fade, seed, glow);
        if (i > 0) {
          const k = base + i * 2;
          index.push(k - 2, k - 1, k, k - 1, k + 1, k);
        }
      }
    };
    for (const run of plan.tops) {
      if (run.x1 - run.x0 < 8) continue;
      const seed = (run.x0 * 0.0137) % 50;
      add(
        run.x0,
        run.x1,
        (x) => plan.topAt(run, x),
        seed,
        (x) => Math.max(0.45, 0.85 + 0.25 * Math.sin(x * 0.011 + seed * 3.1) * Math.sin(x * 0.0043 + seed)),
      );
    }
    for (const o of plan.shelves) {
      const seed = (o.x * 0.0137) % 50;
      add(
        o.x - 2,
        o.x + o.w + 2,
        () => o.y,
        seed,
        () => 0.9,
      );
    }
    if (index.length === 0) return;
    const shader = Shader.from({
      gl: { vertex: VERT, fragment: frag(plan.band) },
      resources: {
        u: {
          uTime: { value: this.time, type: 'vec4<f32>' },
          uTrail: { value: this.trail, type: 'vec4<f32>', size: LR_RIM.trail },
        },
      },
    });
    const buf = new Buffer({ data: new Float32Array(verts), usage: BufferUsage.VERTEX });
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: buf, format: 'float32x2', stride: STRIDE * 4, offset: 0 },
        aRim: { buffer: buf, format: 'float32x4', stride: STRIDE * 4, offset: 8 },
      },
      indexBuffer: new Uint32Array(index),
    });
    this.container.addChild(new Mesh({ geometry, shader }));
  }

  update(clock: number, feetX: number, feetY: number, grounded: boolean): void {
    this.time[0] = clock;
    if (grounded && clock - this.lastT >= LR_RIM.trailEvery) {
      this.lastT = clock;
      const i = this.head;
      this.trail[i * 4] = feetX;
      this.trail[i * 4 + 1] = feetY;
      this.stamps[i] = clock;
      this.head = (i + 1) % LR_RIM.trail;
    }
    if (clock < this.lastT) this.lastT = -1;
    for (let i = 0; i < LR_RIM.trail; i++) {
      const age = clock - (this.stamps[i] as number);
      this.trail[i * 4 + 2] =
        this.stamps[i] === 0 || age < 0 ? 0 : Math.max(0, 1 - age / LR_RIM.trailHold) ** 1.5;
    }
  }
}
