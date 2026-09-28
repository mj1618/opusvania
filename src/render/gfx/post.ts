/**
 * Post-processing, written as our own GLSL filters instead of pixi-filters (no new dependency):
 * - BloomPass: selective bloom on the emissive layer only, blurred at 1/4 and 1/8 resolution.
 * - PostFilter: one full-screen pass doing light haze, exposure, colour grade (3x3 matrix + lift +
 *   contrast), vignette, film grain (seeded by the sim frame) and chromatic aberration (on hits).
 * One fused pass is cheaper than chaining four filters, and every input is a uniform we control.
 */
import {
  BlurFilter,
  Container,
  Filter,
  type FilterSystem,
  GlProgram,
  Matrix,
  type Renderer,
  type RenderSurface,
  RenderTexture,
  Sprite,
  type Texture,
  UniformGroup,
} from 'pixi.js';
import { VIEW_H, VIEW_W } from '../camera/index';
import { hexToRgb } from './color';
import { LIGHT_SCALE, LIGHTMAP_VERTEX, type LightSystem } from './lighting';

/**
 * Selective bloom on the emissive layer, done at low resolution: the layer is rendered into a
 * quarter-res and an eighth-res target, each blurred there (cheap, and wide without the ghosting
 * a big full-res kernel gives), and shown scaled up with additive blending over the sharp layer.
 */
export class BloomPass {
  /** Add these to the scene right after the sharp emissive layer. */
  readonly view = new Container({ label: 'bloom' });
  private readonly levels: Array<{
    div: number;
    raw: RenderTexture;
    out: RenderTexture;
    rawSprite: Sprite;
    blur: BlurFilter;
    shown: Sprite;
  }>;
  private readonly m = new Matrix();

  constructor(
    private readonly renderer: Renderer,
    private readonly source: Container,
  ) {
    source.isRenderGroup = true;
    this.levels = [4, 8].map((div) => {
      const size = { width: Math.ceil(VIEW_W / div), height: Math.ceil(VIEW_H / div), antialias: false };
      const raw = RenderTexture.create(size);
      const out = RenderTexture.create(size);
      const rawSprite = new Sprite(raw);
      const blur = new BlurFilter({ strength: 4, quality: 3, kernelSize: 9 });
      rawSprite.filters = [blur];
      const shown = new Sprite(out);
      shown.scale.set(div);
      shown.blendMode = 'add';
      this.view.addChild(shown);
      return { div, raw, out, rawSprite, blur, shown };
    });
    this.configure(1, 1, 3);
  }

  /** `tight`/`wide`: brightness of the two glows; `quality`: blur passes. */
  configure(tight: number, wide: number, quality: number): void {
    const [a, b] = this.levels;
    if (a) {
      a.shown.alpha = Math.min(1, tight);
      a.blur.quality = quality;
      a.blur.strength = 3;
    }
    if (b) {
      b.shown.alpha = Math.min(1, wide);
      b.blur.quality = quality;
      b.blur.strength = 5;
    }
  }

  set enabled(on: boolean) {
    this.view.visible = on;
  }

  get enabled(): boolean {
    return this.view.visible;
  }

  /** Renders the glow targets for a camera top-left (camX, camY). Call before app.render(). */
  render(camX: number, camY: number): void {
    if (!this.view.visible) return;
    for (const l of this.levels) {
      const k = 1 / l.div;
      this.m.set(k, 0, 0, k, -camX * k, -camY * k);
      this.renderer.render({ container: this.source, target: l.raw, clear: true, transform: this.m });
      this.renderer.render({ container: l.rawSprite, target: l.out, clear: true });
    }
  }

  destroy(): void {
    for (const l of this.levels) {
      l.raw.destroy(true);
      l.out.destroy(true);
      l.rawSprite.destroy();
    }
    this.view.destroy({ children: true });
  }
}

const POST_FRAGMENT = `
in vec2 vTextureCoord;
in vec2 vLightUv;
in vec2 vScreen;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uLightTexture;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;

uniform mat3 uGrade;
uniform vec3 uLift;
uniform float uContrast;
uniform float uExposure;
uniform vec4 uVignette;      // strength, inner, outer, aspect
uniform vec3 uVignetteColor;
uniform float uGrain;
uniform float uSeed;
uniform float uAberration;   // px at the screen edge
uniform float uHaze;
uniform float uAmbient;      // ambient level (decoded), subtracted before haze
uniform float uLightScale;
uniform vec4 uImpact;        // impact frame amount, drama (slow-mo) desaturation, unused, unused
uniform vec3 uImpactColor;

float hash12(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main(void)
{
    vec2 uv = vTextureCoord;
    vec3 col;
    if (uAberration > 0.0) {
        vec2 d = vScreen - 0.5;
        vec2 off = d * length(d) * 2.0 * uAberration * uInputSize.zw;
        col.r = texture(uTexture, clamp(uv + off, uInputClamp.xy, uInputClamp.zw)).r;
        col.g = texture(uTexture, uv).g;
        col.b = texture(uTexture, clamp(uv - off, uInputClamp.xy, uInputClamp.zw)).b;
    } else {
        col = texture(uTexture, uv).rgb;
    }

    // Light scattering in smoky air: light above ambient adds a soft glow over everything.
    vec3 L = texture(uLightTexture, vLightUv).rgb * uLightScale;
    col += max(L - vec3(uAmbient), 0.0) * uHaze;

    col *= uExposure;
    col = uGrade * col + uLift;
    col = (col - 0.5) * uContrast + 0.5;

    // Anime impact frame: the lit scene flips to a two-tone negative (bright shapes go ink-black on
    // a field of the hit's colour) for a frame or two on the biggest hits.
    if (uImpact.x > 0.0) {
        float l0 = dot(clamp(col, 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722));
        float bw = smoothstep(0.16, 0.3, l0);
        vec3 neg = mix(uImpactColor, vec3(0.03, 0.02, 0.05), bw);
        col = mix(col, neg, uImpact.x);
    }
    // Slow-motion drama: drain the colour a little and crush the blacks.
    if (uImpact.y > 0.0) {
        float l1 = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(col, vec3(l1), uImpact.y * 0.55);
        col = (col - 0.5) * (1.0 + uImpact.y * 0.25) + 0.5;
    }

    vec2 v = (vScreen - 0.5) * vec2(uVignette.w, 1.0);
    float vig = smoothstep(uVignette.y, uVignette.z, length(v));
    col = mix(col, uVignetteColor, vig * uVignette.x);

    // Grain: strongest in the mid-tones, fixed per sim frame.
    float n = hash12(floor(vScreen * vec2(${VIEW_W / 2}.0, ${VIEW_H / 2}.0)) + uSeed * 1.618) - 0.5;
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col += n * uGrain * (0.35 + 0.65 * (1.0 - abs(lum * 2.0 - 1.0)));

    finalColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export interface GradeSettings {
  saturation: number;
  contrast: number;
  exposure: number;
  /** Multiplies after saturation (per-channel gain). */
  gain: number;
  /** Added in shadows. */
  lift: number;
  vignette: number;
  vignetteColor: number;
  grain: number;
  haze: number;
}

export class PostFilter extends Filter {
  constructor(private readonly lights: LightSystem) {
    super({
      glProgram: GlProgram.from({ vertex: LIGHTMAP_VERTEX, fragment: POST_FRAGMENT, name: 'opus-post' }),
      resources: {
        postUniforms: new UniformGroup({
          uLightMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
          uGrade: { value: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), type: 'mat3x3<f32>' },
          uLift: { value: new Float32Array(3), type: 'vec3<f32>' },
          uContrast: { value: 1, type: 'f32' },
          uExposure: { value: 1, type: 'f32' },
          uVignette: { value: new Float32Array([0.5, 0.35, 0.95, VIEW_W / VIEW_H]), type: 'vec4<f32>' },
          uVignetteColor: { value: new Float32Array(3), type: 'vec3<f32>' },
          uGrain: { value: 0.04, type: 'f32' },
          uSeed: { value: 0, type: 'f32' },
          uAberration: { value: 0, type: 'f32' },
          uHaze: { value: 0.3, type: 'f32' },
          uAmbient: { value: 0.6, type: 'f32' },
          uLightScale: { value: LIGHT_SCALE, type: 'f32' },
          uImpact: { value: new Float32Array(4), type: 'vec4<f32>' },
          uImpactColor: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
        }),
        uLightTexture: lights.texture.source,
      },
    });
    lights.onTexture.add((rt) => {
      this.resources.uLightTexture = rt.source;
    });
  }

  private get u(): Record<string, unknown> & {
    uGrade: Float32Array;
    uLift: Float32Array;
    uVignette: Float32Array;
    uVignetteColor: Float32Array;
    uLightMatrix: Matrix;
    uImpact: Float32Array;
    uImpactColor: Float32Array;
  } {
    return this.resources.postUniforms.uniforms;
  }

  setGrade(g: GradeSettings): void {
    const u = this.u;
    // Saturation matrix (Rec. 709 luma), then per-channel gain. Column-major for GLSL.
    const s = g.saturation;
    const lr = 0.2126 * (1 - s);
    const lg = 0.7152 * (1 - s);
    const lb = 0.0722 * (1 - s);
    const [gr, gg, gb] = hexToRgb(g.gain);
    const rows = [
      [lr + s, lg, lb],
      [lr, lg + s, lb],
      [lr, lg, lb + s],
    ];
    const gain = [gr, gg, gb];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) u.uGrade[c * 3 + r] = (rows[r]?.[c] ?? 0) * (gain[r] ?? 1);
    u.uLift.set(hexToRgb(g.lift));
    u.uContrast = g.contrast;
    u.uExposure = g.exposure;
    u.uVignette[0] = g.vignette;
    u.uVignetteColor.set(hexToRgb(g.vignetteColor));
    u.uGrain = g.grain;
    u.uHaze = g.haze;
  }

  setFrame(seed: number, aberrationPx: number, ambientLevel: number, grainOn: boolean, grain: number): void {
    const u = this.u;
    u.uSeed = seed % 997;
    u.uAberration = aberrationPx;
    u.uAmbient = ambientLevel;
    u.uGrain = grainOn ? grain : 0;
  }

  /** Impact frame (0..1) in `color`, and slow-motion drama (0..1). */
  setImpact(amount: number, color: number, drama: number): void {
    const u = this.u;
    u.uImpact[0] = amount;
    u.uImpact[1] = drama;
    u.uImpactColor.set(hexToRgb(color));
  }

  override apply(fm: FilterSystem, input: Texture, output: RenderSurface, clear: boolean): void {
    fm.calculateSpriteMatrix(this.u.uLightMatrix, this.lights.screenSprite);
    this.resources.uLightTexture = this.lights.texture.source;
    fm.applyFilter(this, input, output, clear);
  }
}
