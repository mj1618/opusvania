/**
 * Clippings: the bits of grass, leaf and petal a slash sends flying. A fixed pool of little
 * triangles in one mesh; a particle's whole flight (launch point, velocity, spin, birth time) is
 * written into the vertex buffer once when it spawns and the vertex shader does the rest (drag,
 * gravity, tumble, fade), so nothing is updated or allocated per frame.
 */
import { Buffer, BufferUsage, Geometry, Mesh, Shader } from 'pixi.js';

export const CLIPPINGS = {
  pool: 96,
  /** Seconds a clipping lives. */
  life: 0.85,
  gravity: 620,
  /** Velocity lost per second (air drag): they shoot out and then flutter. */
  drag: 3.2,
} as const;

const STRIDE = 14;

const VERT = `#version 300 es
precision highp float;
in vec2 aPosition;   // launch point
in vec2 aVel;
in vec4 aLife;       // birth time, spin, size, shape (0 blade tip, 1 leaf, 2 petal)
in vec4 aColor;
in vec2 aCorner;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uClip;  // clock, life, gravity, drag
out vec4 vColor;
void main() {
  float age = uClip.x - aLife.x;
  float alive = step(0.0, age) * step(age, uClip.y) * step(0.001, aLife.z);
  // Drag: distance travelled is v * (1 - exp(-k t)) / k; gravity eased in as the throw dies.
  float k = uClip.w;
  float s = (1.0 - exp(-k * age)) / k;
  vec2 at = aPosition + aVel * s + vec2(0.0, 0.5 * uClip.z * age * age * (0.35 + 0.3 * aLife.w));
  // Petals and leaves flutter sideways as they fall.
  at.x += sin(age * 9.0 + aLife.y) * 5.0 * aLife.w * smoothstep(0.15, 0.6, age);
  float ang = aLife.y * (1.0 + age * 5.0);
  vec2 c = aCorner * aLife.z * vec2(1.0, mix(1.0, 0.25 + 0.75 * abs(cos(age * 11.0 + aLife.y)), min(1.0, aLife.w)));
  vec2 rc = vec2(c.x * cos(ang) - c.y * sin(ang), c.x * sin(ang) + c.y * cos(ang));
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(at + rc * alive, 1.0)).xy, 0.0, 1.0);
  float fade = 1.0 - smoothstep(uClip.y * 0.65, uClip.y, age);
  vColor = vec4(aColor.rgb, aColor.a * fade * alive);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 o;
void main() {
  o = vec4(vColor.rgb * vColor.a, vColor.a);
}`;

/** Corner offsets per shape: a thin blade tip, a leaf sliver, a rounder petal. */
const SHAPES: ReadonlyArray<readonly number[]> = [
  [-0.22, 0.9, 0.22, 0.9, 0, -1.3],
  [-0.5, 0.2, 0.55, 0.3, 0, -1],
  [-0.6, 0.35, 0.6, 0.35, 0, -0.75],
];

export class Clippings {
  readonly mesh: Mesh<Geometry, Shader>;
  private readonly data: Float32Array;
  private readonly buffer: Buffer;
  private readonly clip = new Float32Array([0, CLIPPINGS.life, CLIPPINGS.gravity, CLIPPINGS.drag]);
  private next = 0;
  private dirty = false;

  constructor() {
    const n = CLIPPINGS.pool;
    this.data = new Float32Array(n * 3 * STRIDE);
    this.buffer = new Buffer({ data: this.data, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
    const index = new Uint32Array(n * 3);
    for (let i = 0; i < n * 3; i++) index[i] = i;
    const stride = STRIDE * 4;
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: this.buffer, format: 'float32x2', stride, offset: 0 },
        aVel: { buffer: this.buffer, format: 'float32x2', stride, offset: 8 },
        aLife: { buffer: this.buffer, format: 'float32x4', stride, offset: 16 },
        aColor: { buffer: this.buffer, format: 'float32x4', stride, offset: 32 },
        aCorner: { buffer: this.buffer, format: 'float32x2', stride, offset: 48 },
      },
      indexBuffer: index,
    });
    this.mesh = new Mesh({
      geometry,
      shader: Shader.from({
        gl: { vertex: VERT, fragment: FRAG },
        resources: { u: { uClip: { value: this.clip, type: 'vec4<f32>' } } },
      }),
    });
  }

  /** Launches one clipping. `shape`: 0 blade tip, 1 leaf, 2 petal. `birth` may be a little in the future. */
  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    birth: number,
    spin: number,
    size: number,
    shape: number,
    color: number,
  ): void {
    const corners = SHAPES[shape] ?? (SHAPES[0] as readonly number[]);
    const base = this.next * 3 * STRIDE;
    for (let k = 0; k < 3; k++) {
      const o = base + k * STRIDE;
      const d = this.data;
      d[o] = x;
      d[o + 1] = y;
      d[o + 2] = vx;
      d[o + 3] = vy;
      d[o + 4] = birth;
      d[o + 5] = spin;
      d[o + 6] = size;
      d[o + 7] = shape;
      const shade = k === 2 ? 1.1 : 0.8;
      d[o + 8] = Math.min(1, (((color >> 16) & 255) / 255) * shade);
      d[o + 9] = Math.min(1, (((color >> 8) & 255) / 255) * shade);
      d[o + 10] = Math.min(1, ((color & 255) / 255) * shade);
      d[o + 11] = 1;
      d[o + 12] = corners[k * 2] as number;
      d[o + 13] = corners[k * 2 + 1] as number;
    }
    this.next = (this.next + 1) % CLIPPINGS.pool;
    this.dirty = true;
  }

  update(clock: number): void {
    this.clip[0] = clock;
    if (this.dirty) {
      this.buffer.update();
      this.dirty = false;
    }
  }

  /** Forget everything in flight (restart, teleport). */
  clear(): void {
    this.data.fill(0);
    this.dirty = true;
  }
}
