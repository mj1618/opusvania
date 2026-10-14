/**
 * The frame's post: the scene is drawn into a render texture, then shown three times: as itself,
 * and as two blooms (a tight one and a wide one) of its bright parts, added; then one grade pass
 * (highlight roll-off, shadow tint, saturation, vignette toward the frame's deep colour, grain).
 */
import {
  BlurFilter,
  Container,
  Filter,
  GlProgram,
  Rectangle,
  type Renderer,
  RenderTexture,
  Sprite,
  UniformGroup,
} from 'pixi.js';
import { FILTER_VERT, VIEW_H, VIEW_W } from './layer';
import { NOISE_GLSL } from './plane';

const BRIGHT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uBright; // threshold, knee, gain, unused
${NOISE_GLSL}
void main() {
  vec4 s = texture(uTexture, vTextureCoord);
  float l = luma(s.rgb);
  float k = smoothstep(uBright.x, uBright.x + uBright.y, l);
  finalColor = vec4(s.rgb * k * uBright.z, 0.0);
}`;

const GRADE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
in vec2 vScreen;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uShadow;   // rgb tint added to the darks, amount
uniform vec4 uDeep;     // rgb the vignette sinks toward, strength
uniform vec4 uTone;     // exposure, saturation, contrast, highlight shoulder
uniform vec4 uGrain;    // amount, time, vignette radius, vignette softness
${NOISE_GLSL}
void main() {
  vec3 c = texture(uTexture, vTextureCoord).rgb * uTone.x;
  // Shoulder: bloom may push past 1; roll it off instead of clipping.
  c = c / (1.0 + max(vec3(0.0), c - 0.75) * uTone.w);
  float l = luma(c);
  c = mix(vec3(l), c, uTone.y);
  c = 0.2 * pow(max(c, 0.0) / 0.2, vec3(uTone.z));
  float dark = 1.0 - smoothstep(0.0, 0.22, l);
  c += uShadow.rgb * dark * uShadow.a;
  vec2 q = vScreen / vec2(${VIEW_W.toFixed(1)}, ${VIEW_H.toFixed(1)}) - 0.5;
  q.x *= 1.25;
  float v = smoothstep(uGrain.z, uGrain.z + uGrain.w, length(q));
  c = mix(c, uDeep.rgb * (0.6 + 0.4 * l), v * uDeep.a);
  float g = hash12(vScreen + fract(uGrain.y * 7.31) * 913.0) - 0.5;
  float mid = 4.0 * l * (1.0 - l);
  c += g * uGrain.x * (0.35 + mid);
  c += (hash12(vScreen * 1.37 + 3.1) - 0.5) / 255.0;
  finalColor = vec4(c, 1.0);
}`;

export interface GradeSpec {
  shadow: number;
  shadowK: number;
  deep: number;
  deepK: number;
  exposure?: number;
  saturation?: number;
  contrast?: number;
  shoulder?: number;
  grain?: number;
  vignette?: number;
  vignetteSoft?: number;
  /** Bloom: threshold, gain (tight), gain (wide). */
  bloom?: readonly [number, number, number];
}

const rgb3 = (hex: number): number[] => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

export class Post {
  readonly rt: RenderTexture;
  readonly display = new Container();
  private readonly gu: {
    uShadow: Float32Array;
    uDeep: Float32Array;
    uTone: Float32Array;
    uGrain: Float32Array;
  };
  private readonly bright: Filter[] = [];

  constructor(private readonly renderer: Renderer) {
    this.rt = RenderTexture.create({
      width: VIEW_W,
      height: VIEW_H,
      resolution: 1,
      antialias: true,
      scaleMode: 'linear',
    });
    const base = new Sprite(this.rt);
    const tight = new Sprite(this.rt);
    const wide = new Sprite(this.rt);
    const mkBright = (gain: number): Filter => {
      const f = new Filter({
        glProgram: GlProgram.from({ vertex: FILTER_VERT, fragment: BRIGHT_FRAG, name: 'wc-bright' }),
        resources: {
          b: new UniformGroup({
            uBright: { value: new Float32Array([0.5, 0.35, gain, 0]), type: 'vec4<f32>' },
          }),
        },
        resolution: 0.5,
        padding: 0,
      });
      this.bright.push(f);
      return f;
    };
    tight.filters = [
      mkBright(0.9),
      new BlurFilter({ strength: 10, quality: 4, resolution: 0.5, padding: 0 }),
    ];
    wide.filters = [
      mkBright(0.7),
      new BlurFilter({ strength: 34, quality: 5, resolution: 0.25, padding: 0 }),
    ];
    tight.blendMode = 'add';
    wide.blendMode = 'add';
    for (const s of [tight, wide]) s.filterArea = new Rectangle(0, 0, VIEW_W, VIEW_H);
    this.display.addChild(base, tight, wide);
    const group = new UniformGroup({
      uShadow: { value: new Float32Array(4), type: 'vec4<f32>' },
      uDeep: { value: new Float32Array(4), type: 'vec4<f32>' },
      uTone: { value: new Float32Array([1, 1, 1, 0.6]), type: 'vec4<f32>' },
      uGrain: { value: new Float32Array([0.03, 0, 0.38, 0.5]), type: 'vec4<f32>' },
    });
    const grade = new Filter({
      glProgram: GlProgram.from({ vertex: FILTER_VERT, fragment: GRADE_FRAG, name: 'wc-grade' }),
      resources: { grade: group },
      resolution: 1,
      padding: 0,
    });
    this.gu = group.uniforms as unknown as Post['gu'];
    this.display.filters = [grade];
    this.display.filterArea = new Rectangle(0, 0, VIEW_W, VIEW_H);
  }

  set(spec: GradeSpec): void {
    const u = this.gu;
    u.uShadow.set([...rgb3(spec.shadow), spec.shadowK]);
    u.uDeep.set([...rgb3(spec.deep), spec.deepK]);
    u.uTone.set([spec.exposure ?? 1, spec.saturation ?? 1, spec.contrast ?? 1, spec.shoulder ?? 0.6]);
    u.uGrain[0] = spec.grain ?? 0.03;
    u.uGrain[2] = spec.vignette ?? 0.36;
    u.uGrain[3] = spec.vignetteSoft ?? 0.5;
    const b = spec.bloom ?? [0.55, 0.9, 0.7];
    const [f0, f1] = this.bright;
    for (const [f, gain] of [
      [f0, b[1]],
      [f1, b[2]],
    ] as const) {
      const bu = (f?.resources.b as { uniforms: { uBright: Float32Array } } | undefined)?.uniforms.uBright;
      if (!bu) continue;
      bu[0] = b[0];
      bu[2] = gain;
    }
  }

  render(scene: Container, t: number): void {
    this.gu.uGrain[1] = t;
    this.renderer.render({ container: scene, target: this.rt, clear: true, clearColor: [0, 0, 0, 1] });
  }
}
