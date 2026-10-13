/**
 * Small fliers: butterflies over the flower drifts of the light well, moths circling glow plants.
 * One tiny mesh; each insect is two triangles (its wings) and the vertex shader does everything:
 * a wandering path round its home, a fast wing beat, a pause now and then with wings folded.
 */
import { Geometry, Mesh, Shader } from 'pixi.js';
import { PALETTE } from './look';

export const FLUTTER = {
  /** Wing length in px, butterflies and moths. */
  wing: [9, 5] as const,
  /** How far they roam from home, px (x, y). */
  roam: [46, 26] as const,
  butterfly: [0xffb84a, 0xfff1dc, 0xff9a7a, 0xf2d24a] as const,
} as const;

const VERT = `#version 300 es
precision highp float;
in vec2 aPosition;   // home
in vec4 aWing;       // corner x (-1 left wing, +1 right), corner y, seed, size
in vec4 aColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uFly;   // clock, roam x, roam y, -
out vec4 vColor;
void main() {
  float s = aWing.z;
  float t = uFly.x * (0.55 + s * 0.4) + s * 40.0;
  // Rest: for part of each cycle the insect settles and only fans its wings slowly.
  float cyc = fract(t * 0.07 + s);
  float rest = smoothstep(0.62, 0.7, cyc) * (1.0 - smoothstep(0.92, 1.0, cyc));
  vec2 path = vec2(sin(t * 0.9 + s * 6.0) + 0.45 * sin(t * 2.3 + s * 11.0),
                   cos(t * 1.2 + s * 4.0) * 0.8 + 0.35 * sin(t * 3.1 + s * 9.0));
  vec2 at = aPosition + path * uFly.yz * (1.0 - rest * 0.85) + vec2(0.0, rest * uFly.z * 0.9);
  float beat = mix(abs(sin(uFly.x * (17.0 + s * 9.0) + s * 20.0)), 0.25 + 0.2 * sin(uFly.x * 2.0 + s), rest);
  vec2 wing = vec2(aWing.x * (0.2 + 0.8 * beat), aWing.y) * aWing.w;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(at + wing, 1.0)).xy, 0.0, 1.0);
  vColor = aColor;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 o;
void main() {
  o = vec4(vColor.rgb * vColor.a, vColor.a);
}`;

/** `homes`: [x, y, variant] per insect. Butterflies are warm; moths pale cyan (0) or violet (1). */
export class Flutter {
  readonly mesh: Mesh<Geometry, Shader>;
  private readonly fly = new Float32Array([0, FLUTTER.roam[0], FLUTTER.roam[1], 0]);

  constructor(butterflies: number[][], moths: number[][]) {
    const pos: number[] = [];
    const wing: number[] = [];
    const col: number[] = [];
    const index: number[] = [];
    const add = (x: number, y: number, seed: number, size: number, c: number, a: number): void => {
      const base = pos.length / 2;
      // Body point, then upper and lower tip of each wing.
      for (const [cx, cy] of [
        [0, 0],
        [-1, -1],
        [-0.75, 0.75],
        [1, -1],
        [0.75, 0.75],
      ] as const) {
        pos.push(x, y);
        wing.push(cx, cy, seed, size);
        const k = cx === 0 ? 0.35 : cy > 0 ? 0.8 : 1;
        col.push((((c >> 16) & 255) / 255) * k, (((c >> 8) & 255) / 255) * k, ((c & 255) / 255) * k, a);
      }
      index.push(base, base + 1, base + 2, base, base + 3, base + 4);
    };
    butterflies.forEach((h, i) => {
      const c = FLUTTER.butterfly[i % FLUTTER.butterfly.length] as number;
      add(h[0] as number, h[1] as number, (h[2] as number) + i * 0.137, FLUTTER.wing[0], c, 0.95);
    });
    moths.forEach((h, i) => {
      const c = (h[2] as number) > 0.5 ? PALETTE.glowViolet : PALETTE.glowCyan;
      add(h[0] as number, h[1] as number, ((i * 0.618) % 1) + 0.05, FLUTTER.wing[1], c, 0.8);
    });
    if (index.length === 0) {
      // Keep the mesh valid even with nothing to draw.
      pos.push(0, 0, 0, 0, 0, 0);
      wing.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      col.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      index.push(0, 1, 2);
    }
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: new Float32Array(pos), format: 'float32x2' },
        aWing: { buffer: new Float32Array(wing), format: 'float32x4' },
        aColor: { buffer: new Float32Array(col), format: 'float32x4' },
      },
      indexBuffer: new Uint32Array(index),
    });
    this.mesh = new Mesh({
      geometry,
      shader: Shader.from({
        gl: { vertex: VERT, fragment: FRAG },
        resources: { u: { uFly: { value: this.fly, type: 'vec4<f32>' } } },
      }),
    });
  }

  update(clock: number): void {
    this.fly[0] = clock;
  }
}
