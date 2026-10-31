/**
 * The clouds of moths round every burning lamp (proto-1 §8: "moths by the hundred"): one instanced quad per
 * moth, its whole flight a pure function of its seeds and the render clock (GPU), so hundreds cost nothing on
 * the CPU. Two meshes share the geometry: the far half of each loop behind the lamps (`goal`), the near half
 * in front of her (`air`). A moth near its flame is lit cream and gold; out at the edge of the cloud it is a
 * dark cut-out against the halo, the way moths at a porch light read.
 *
 * Each lamp's slot holds its flame (x, y), how full its cloud is (0..1: put out, the cloud scatters and thins
 * in a breath; relit, it gathers back slowly) and its size. Render only: Lamps fills the slots from the sim.
 */
import {
  Buffer,
  BufferUsage,
  type Container,
  Geometry,
  GlProgram,
  Mesh,
  Shader,
  UniformGroup,
} from 'pixi.js';
import { hash01 } from './config';

/** Lamps one cloud set can hold (uniform slots). */
export const MOTH_SLOTS = 64;

export const MOTHS = {
  /** Moths per lamp size (px of the lamp's body): count = per * size, clamped. */
  per: 1.4,
  min: 18,
  max: 130,
  /** Loop radius as multiples of the lamp's size: the dense core and the ragged reach. */
  r0: 1.1,
  r1: 3.6,
  /** Half wingspan, px. */
  size: [5, 9.5] as const,
  /** Wingbeats per second. */
  beat: [9, 16] as const,
  /** Seconds the cloud takes to scatter when its lamp goes out, and to gather back once relit. */
  out: 0.35,
  in: 3.5,
  /** Colours: lit (close to the flame), dark (out at the edge), the hot edge of a wing right by it. */
  lit: [1.0, 0.8, 0.52] as const,
  dark: [0.14, 0.09, 0.06] as const,
  hot: [1.0, 0.96, 0.84] as const,
} as const;

const VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPosition;
in vec4 aA;   // lamp slot, loop radius (lamp sizes), ellipse ratio, angular speed (signed)
in vec4 aB;   // phase, size 0..1, seed, seed
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uLamp[${MOTH_SLOTS}];   // flame x, y, level 0..1, lamp size px
uniform vec4 uKeep[${MOTH_SLOTS}];   // x: the share of its moths still there (the Keeper's cage thins as they go)
uniform vec4 uClock;                // t, side (-1 far half, +1 near half), size min, size max
uniform vec4 uBeat;                 // beat min, max, unused, unused
out vec2 vLocal;
out vec3 vLook;   // light 0..1, flap 0..1, alpha
const float TAU = 6.2831853;
void main(void) {
  vec4 L = uLamp[int(aA.x)];
  float level = L.z;
  float t = uClock.x;
  float s = L.w;
  // Scattered: the loop opens and drifts up as the cloud thins.
  float spread = 1.0 + 2.2 * (1.0 - level);
  float r = aA.y * s * spread;
  float a = aB.x * TAU + t * aA.w;
  // The loop breathes and wanders: no two moths on a clean ellipse.
  float br = 1.0 + 0.18 * sin(t * (0.7 + aB.z) + aB.w * TAU) + 0.1 * sin(t * 2.3 + aB.z * 9.0);
  vec2 p = vec2(cos(a), sin(a) * aA.z) * r * br;
  p += vec2(sin(t * 3.1 + aB.w * 40.0), sin(t * 2.3 + aB.z * 30.0)) * 5.0;
  p.y -= s * 0.25 + (1.0 - level) * 60.0;
  float side = sin(a);
  // Which half of the loop this mesh draws: the far half behind the lamp, the near half in front.
  float here = uClock.y < 0.0 ? step(side, 0.0) : step(0.0, side);
  float d = length(p) / max(s, 1.0);
  float light = clamp((1.3 - d * 0.3) * (0.75 + 0.35 * fract(aB.z * 3.7)), 0.0, 1.0);
  float alpha = here * smoothstep(0.02, 0.3, level) * (uClock.y < 0.0 ? 0.75 : 1.0)
    * step(fract(aB.z * 13.7), uKeep[int(aA.x)].x);
  float unit = mix(uClock.z, uClock.w, aB.y) * (uClock.y < 0.0 ? 0.85 : 1.0);
  float hz = mix(uBeat.x, uBeat.y, fract(aB.z * 7.3));
  float flap = abs(sin(t * hz * TAU * 0.5 + aB.w * TAU));
  // Heading along the loop (the way it flies), tilted with the wander.
  float dir = sign(aA.w);
  vec2 vel = vec2(-sin(a), cos(a) * aA.z) * dir;
  float tilt = clamp(vel.x, -1.0, 1.0) * 0.45 + 0.2 * sin(t * 1.3 + aB.z * 20.0);
  vec2 fwd = vec2(cos(tilt), sin(tilt));
  vec2 up = vec2(-fwd.y, fwd.x);
  vec2 local = aPosition * vec2(1.2, 1.2);
  vec2 world = L.xy + p + (fwd * local.x - up * local.y) * unit;
  vLocal = local;
  vLook = vec3(light, flap, alpha);
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = alpha > 0.002 ? vec4((mvp * vec3(world, 1.0)).xy, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vLook;
out vec4 o;
uniform vec3 uLit;
uniform vec3 uDark;
uniform vec3 uHot;
float sdE(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }
void main(void) {
  // Seen from behind / above: the body upright, two pairs of wings that open and close with the beat (flap 1 =
  // spread flat, 0.2 = held up, seen edge-on). Fore wings broad and swept, hind wings rounder below.
  float f = mix(0.2, 1.0, vLook.y);
  vec2 p = vLocal;
  vec2 q = vec2(abs(p.x), p.y);
  vec2 fa = q - vec2(0.42 * f, 0.14);
  float c = 0.94;
  float sn = -0.34;
  float fore = sdE(vec2(c * fa.x - sn * fa.y, sn * fa.x + c * fa.y), vec2(0.46 * f + 0.04, 0.3));
  float hind = sdE(q - vec2(0.3 * f, -0.2), vec2(0.3 * f + 0.04, 0.22));
  float body = sdE(p - vec2(0.0, -0.02), vec2(0.075, 0.36));
  float d = min(min(fore, hind), body);
  float fw = max(fwidth(d), 1e-4);
  float a = smoothstep(fw, -fw, d) * vLook.z;
  if (a < 0.003) discard;
  vec3 col = mix(uDark, uLit, vLook.x * vLook.x);
  // Right by the flame the wing edge burns pale; the body stays dark.
  col = mix(col, uHot, smoothstep(0.7, 1.0, vLook.x) * smoothstep(-0.1, 0.0, d) * 0.7);
  col = mix(col, uDark * 1.4, step(body, min(fore, hind)) * 0.6);
  o = vec4(col * a, a);
}
`;

export interface MothLamp {
  x: number;
  y: number;
  size: number;
  /** How many moths (0 = none: moonwicks). */
  count: number;
}

/** Hundreds of moths round the lamps, two meshes (behind / in front). */
export class MothClouds {
  private readonly lamps = new Float32Array(MOTH_SLOTS * 4);
  private readonly keeps = new Float32Array(MOTH_SLOTS * 4).fill(1.0001);
  private readonly clock = new Float32Array(4);
  private readonly group: UniformGroup;
  private readonly groupFront: UniformGroup;
  private readonly back: Mesh<Geometry, Shader> | null = null;
  private readonly front: Mesh<Geometry, Shader> | null = null;
  private readonly level: number[] = [];

  constructor(lamps: readonly MothLamp[], seed: number) {
    const rows: number[][] = [];
    lamps.slice(0, MOTH_SLOTS).forEach((l, slot) => {
      const n = l.count;
      for (let k = 0; k < n; k++) {
        const h = (s: string): number => hash01(s, seed + slot * 997 + k);
        // Dense near the flame, a ragged reach (most moths in the core).
        const u = h('r') ** 1.7;
        const r = MOTHS.r0 + (MOTHS.r1 - MOTHS.r0) * u;
        const speed = (0.5 + 1.3 * h('w')) * (h('d') < 0.5 ? -1 : 1) * Math.sqrt(MOTHS.r0 / r) * 1.6;
        rows.push([slot, r, 0.35 + 0.55 * h('e'), speed, h('p'), h('s'), h('a'), h('b')]);
      }
      this.lamps[slot * 4] = l.x;
      this.lamps[slot * 4 + 1] = l.y;
      this.lamps[slot * 4 + 2] = 0;
      this.lamps[slot * 4 + 3] = l.size;
      this.level.push(-1);
    });
    const mk = (side: number): UniformGroup =>
      new UniformGroup({
        uLamp: { value: this.lamps, type: 'vec4<f32>', size: MOTH_SLOTS },
        uKeep: { value: this.keeps, type: 'vec4<f32>', size: MOTH_SLOTS },
        uClock: { value: side < 0 ? this.clock : new Float32Array(4), type: 'vec4<f32>' },
        uBeat: { value: new Float32Array([MOTHS.beat[0], MOTHS.beat[1], 0, 0]), type: 'vec4<f32>' },
        uLit: { value: new Float32Array(MOTHS.lit), type: 'vec3<f32>' },
        uDark: { value: new Float32Array(MOTHS.dark), type: 'vec3<f32>' },
        uHot: { value: new Float32Array(MOTHS.hot), type: 'vec3<f32>' },
      });
    this.group = mk(-1);
    this.groupFront = mk(1);
    if (!rows.length) return;
    const a = new Float32Array(rows.length * 4);
    const b = new Float32Array(rows.length * 4);
    rows.forEach((r, i) => {
      a.set(r.slice(0, 4), i * 4);
      b.set(r.slice(4, 8), i * 4);
    });
    const geometry = new Geometry({
      attributes: {
        aPosition: {
          buffer: new Buffer({
            data: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            usage: BufferUsage.VERTEX,
          }),
          format: 'float32x2',
        },
        aA: {
          buffer: new Buffer({ data: a, usage: BufferUsage.VERTEX }),
          format: 'float32x4',
          instance: true,
        },
        aB: {
          buffer: new Buffer({ data: b, usage: BufferUsage.VERTEX }),
          format: 'float32x4',
          instance: true,
        },
      },
      indexBuffer: new Buffer({ data: new Uint32Array([0, 1, 2, 0, 2, 3]), usage: BufferUsage.INDEX }),
      instanceCount: rows.length,
    });
    const program = GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'lr-moths' });
    this.back = new Mesh({
      geometry,
      shader: new Shader({ glProgram: program, resources: { m: this.group } }),
    });
    this.front = new Mesh({
      geometry,
      shader: new Shader({ glProgram: program, resources: { m: this.groupFront } }),
    });
    this.back.label = 'lr-moths-back';
    this.front.label = 'lr-moths-front';
  }

  /** Puts the two meshes in their layers: `back` behind the lamps, `front` over her. */
  attach(back: Container, front: Container, backIndex = 0): void {
    if (this.back) back.addChildAt(this.back, Math.min(backIndex, back.children.length));
    if (this.front) front.addChild(this.front);
  }

  /** A lamp's flame this frame and whether it burns. */
  set(slot: number, x: number, y: number, burning: boolean, dt: number): void {
    if (slot >= MOTH_SLOTS) return;
    const want = burning ? 1 : 0;
    let lv = this.level[slot] ?? -1;
    if (lv < 0) lv = want;
    else if (want > lv) lv = Math.min(1, lv + dt / MOTHS.in);
    else lv = Math.max(0, lv - dt / MOTHS.out);
    this.level[slot] = lv;
    const i = slot * 4;
    this.lamps[i] = x;
    this.lamps[i + 1] = y;
    this.lamps[i + 2] = lv * lv * (3 - 2 * lv);
  }

  /** The share of a lamp's moths still there (0..1; the rest are not drawn): the Keeper's cage, eaten and saved. */
  keep(slot: number, k: number): void {
    if (slot < MOTH_SLOTS) this.keeps[slot * 4] = k >= 1 ? 1.0001 : k;
  }

  update(clock: number): void {
    this.clock.set([clock, -1, MOTHS.size[0], MOTHS.size[1]]);
    (this.groupFront.uniforms.uClock as Float32Array).set([clock, 1, MOTHS.size[0], MOTHS.size[1]]);
    this.group.update();
    this.groupFront.update();
  }

  destroy(): void {
    const geo = this.back?.geometry;
    this.back?.destroy();
    this.front?.destroy();
    geo?.destroy(true);
  }
}

/** How many moths a lamp of this size gets. */
export function mothCount(size: number, scale = 1): number {
  return Math.round(Math.max(MOTHS.min, Math.min(MOTHS.max, MOTHS.per * size * scale)));
}
