/**
 * The post pipeline as one Pixi filter on the layer tree. Pixi renders the tree into `input` at
 * canvas resolution; `apply()` then runs:
 *
 *   input ──prefilter──> down[0] ──down──> down[1] ... down[n-1]        (bright parts, ever smaller)
 *   up[n-2] = mix(down[n-2], upsample(down[n-1]))  ...  up[0]           (ever wider glow, added up)
 *   lights  ──────────> light                                           (point lights, small target)
 *   input + up[0] + light ──composite (grade, vignette, grain)──> output
 *
 * The blurs happen in small targets with small kernels (dual filtering), so the glow is wide and
 * smooth with no ghost copies and costs little. Targets have fixed logical sizes, so nothing here
 * depends on the window size: only `input` changes on resize, and Pixi manages that.
 */
import {
  Filter,
  type FilterSystem,
  GlProgram,
  type Renderer,
  type RenderSurface,
  RenderTexture,
  type TEXTURE_FORMATS,
  Texture,
} from 'pixi.js';
import { heroMatteTexture, MASK_H, MASK_W, playfieldMaskTexture } from '../scene/lib/fx-mask';
import { BLOOM_LEVELS, GOAL_LIGHTS, LIGHT_TARGET, MAX_LIGHTS } from './config';
import {
  COMPOSITE_FRAG,
  DOWN_FRAG,
  FINAL_VERT,
  LIGHTS_FRAG,
  MATTE_FRAG,
  PASS_VERT,
  PREFILTER_FRAG,
  UP_FRAG,
} from './shaders';

type Vec = Float32Array;

function passFilter(name: string, fragment: string, resources: Record<string, unknown>): Filter {
  return new Filter({
    glProgram: GlProgram.from({ vertex: PASS_VERT, fragment, name }),
    resources,
    resolution: 1,
    antialias: 'off',
    padding: 0,
  });
}

function target(size: readonly [number, number], format: TEXTURE_FORMATS): RenderTexture {
  return RenderTexture.create({
    width: size[0],
    height: size[1],
    resolution: 1,
    format,
    antialias: false,
    scaleMode: 'linear',
    addressMode: 'clamp-to-edge',
  });
}

export class PostFilter extends Filter {
  /** Uniform values, written by PostStage.update. */
  readonly u: {
    uMix: Vec;
    uTone: Vec;
    uShadow: Vec;
    uHighlight: Vec;
    uVignette: Vec;
    uVignetteTint: Vec;
    uGrain: Vec;
    uLightBack: Vec;
    uHalo: Vec;
    uProtect: Vec;
    uLit: Vec;
    uHero: Vec;
    uHero2: Vec;
    uDeep: Vec;
    uRich: Vec;
    uGoal: Vec;
    uGoalLook: Vec;
    uSep: Vec;
    uSepTint: Vec;
    uSepLook: Vec;
  };
  readonly prefilterU: { uTap: Vec; uCurve: Vec; uSaturation: number; uBoost: number; uHeroSource: number };
  readonly lightsU: {
    uLights: Vec;
    uLightColors: Vec;
    uLightCount: number;
    uDim: number;
    uDirection: number;
    uShape: Vec;
  };
  /** Set by PostStage: bloom knobs that live in per-level uniforms. */
  spread = 0.7;
  radius = 1;

  private readonly down: RenderTexture[];
  private readonly up: RenderTexture[];
  private readonly light: RenderTexture;
  private readonly prefilter: Filter;
  private readonly downF: Filter[] = [];
  private readonly upF: Filter[] = [];
  private readonly lightsF: Filter;
  /** The soft hero matte: 480x270 box of the matte, two levels down, and back up (soft[4] is the result). */
  private readonly soft: RenderTexture[];
  private readonly softF: Filter[] = [];
  /** 0..1: how much of the wider blur level the soft matte carries (set by PostStage). */
  softSpread = 0.6;

  constructor(renderer: Renderer) {
    // Half-float targets keep the wide, faint gradients of the glow free of banding.
    const gl = (renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
    const float =
      !!gl?.getExtension('EXT_color_buffer_float') || !!gl?.getExtension('EXT_color_buffer_half_float');
    const format: TEXTURE_FORMATS = float ? 'rgba16float' : 'rgba8unorm';
    const down = BLOOM_LEVELS.map((s) => target(s, format));
    const up = BLOOM_LEVELS.slice(0, -1).map((s) => target(s, format));
    const light = target(LIGHT_TARGET, format);
    const softSizes: ReadonlyArray<readonly [number, number]> = [
      [480, 270],
      [240, 135],
      [120, 68],
      [240, 135],
      [480, 270],
    ];
    const soft = softSizes.map((s) => target(s, 'rgba8unorm'));

    super({
      glProgram: GlProgram.from({ vertex: FINAL_VERT, fragment: COMPOSITE_FRAG, name: 'post-composite' }),
      resources: {
        uBloom: (up[0] ?? down[0] ?? light).source,
        uLight: light.source,
        uMatte: heroMatteTexture().source,
        // A wide level of the bloom chain: tells a point of light from an area of light.
        uWide: (down[2] ?? down[0] ?? light).source,
        uSoft: (soft[4] as RenderTexture).source,
        postUniforms: {
          uMix: { value: new Float32Array(4), type: 'vec4<f32>' },
          uTone: { value: new Float32Array([1, 0.8, 0, 0.3]), type: 'vec4<f32>' },
          uShadow: { value: new Float32Array(4), type: 'vec4<f32>' },
          uHighlight: { value: new Float32Array([1, 1, 1, 0]), type: 'vec4<f32>' },
          uVignette: { value: new Float32Array([0.5, 1, 0, 0]), type: 'vec4<f32>' },
          uVignetteTint: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
          uGrain: { value: new Float32Array([0, 0, 16 / 9, 0]), type: 'vec4<f32>' },
          uLightBack: { value: new Float32Array([1, 0, 0, 0]), type: 'vec4<f32>' },
          uHalo: { value: new Float32Array([1, 0.8, 0.5, 0]), type: 'vec4<f32>' },
          uProtect: { value: new Float32Array([1, 0.7, 0.6, 0]), type: 'vec4<f32>' },
          uLit: { value: new Float32Array([0.25, 0.4, 0.92, 0]), type: 'vec4<f32>' },
          uHero: { value: new Float32Array([0, 0, 0.3, 0]), type: 'vec4<f32>' },
          uHero2: { value: new Float32Array([0.06, 0.3, 0, 0]), type: 'vec4<f32>' },
          uDeep: { value: new Float32Array([0.2, 0, 0, 0.6]), type: 'vec4<f32>' },
          uRich: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
          uGoal: { value: new Float32Array(GOAL_LIGHTS * 4), type: 'vec4<f32>', size: GOAL_LIGHTS },
          uGoalLook: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
          uSep: { value: new Float32Array([0.09, 0.04, 0, 0]), type: 'vec4<f32>' },
          uSepTint: { value: new Float32Array([1, 1, 1, 0]), type: 'vec4<f32>' },
          uSepLook: { value: new Float32Array([0.3, 0.5, 0, 0]), type: 'vec4<f32>' },
        },
      },
      // Render the tree at the canvas's own resolution and multisampling: nothing goes soft.
      resolution: 'inherit',
      antialias: 'inherit',
      padding: 0,
    });
    this.down = down;
    this.up = up;
    this.light = light;
    this.soft = soft;
    this.u = (this.resources.postUniforms as { uniforms: PostFilter['u'] }).uniforms;

    this.prefilter = passFilter('post-prefilter', PREFILTER_FRAG, {
      uMatte: heroMatteTexture().source,
      prefilterUniforms: {
        uTap: { value: new Float32Array(2), type: 'vec2<f32>' },
        uCurve: { value: new Float32Array(3), type: 'vec3<f32>' },
        uSaturation: { value: 1, type: 'f32' },
        uBoost: { value: 0, type: 'f32' },
        uHeroSource: { value: 0.8, type: 'f32' },
      },
    });
    this.prefilterU = (
      this.prefilter.resources.prefilterUniforms as { uniforms: PostFilter['prefilterU'] }
    ).uniforms;

    for (let i = 1; i < down.length; i++) {
      const src = BLOOM_LEVELS[i - 1] as readonly [number, number];
      this.downF.push(
        passFilter('post-down', DOWN_FRAG, {
          downUniforms: { uTexel: { value: new Float32Array([1 / src[0], 1 / src[1]]), type: 'vec2<f32>' } },
        }),
      );
    }
    // upF[i] writes up[i] from the wider level i + 1 and this level's own down[i].
    for (let i = 0; i < up.length; i++) {
      this.upF.push(
        passFilter('post-up', UP_FRAG, {
          uBase: (down[i] as RenderTexture).source,
          upUniforms: {
            uTexel: { value: new Float32Array(2), type: 'vec2<f32>' },
            uSpread: { value: 0.7, type: 'f32' },
          },
        }),
      );
    }

    const texel = (t: RenderTexture, k = 1) => new Float32Array([k / t.width, k / t.height]);
    const [s0, s1, s2, s3] = soft as [RenderTexture, RenderTexture, RenderTexture, RenderTexture];
    const softUp = (wider: RenderTexture, base: RenderTexture) =>
      passFilter('post-soft-up', UP_FRAG, {
        uBase: base.source,
        upUniforms: {
          uTexel: { value: texel(wider), type: 'vec2<f32>' },
          uSpread: { value: 0.6, type: 'f32' },
        },
      });
    this.softF.push(
      passFilter('post-matte', MATTE_FRAG, {
        uMatte: heroMatteTexture().source,
        matteUniforms: { uTap: { value: texel(heroMatteTexture()), type: 'vec2<f32>' } },
      }),
      passFilter('post-down', DOWN_FRAG, {
        downUniforms: { uTexel: { value: texel(s0), type: 'vec2<f32>' } },
      }),
      passFilter('post-down', DOWN_FRAG, {
        downUniforms: { uTexel: { value: texel(s1), type: 'vec2<f32>' } },
      }),
      softUp(s2, s1),
      softUp(s3, s0),
    );

    this.lightsF = passFilter('post-lights', LIGHTS_FRAG, {
      uMask: playfieldMaskTexture().source,
      lightUniforms: {
        uLights: { value: new Float32Array(MAX_LIGHTS * 4), type: 'vec4<f32>', size: MAX_LIGHTS },
        uLightColors: { value: new Float32Array(MAX_LIGHTS * 4), type: 'vec4<f32>', size: MAX_LIGHTS },
        uLightCount: { value: 0, type: 'i32' },
        uShape: { value: new Float32Array([16 / 9, 1.5, 1.8, 0.1]), type: 'vec4<f32>' },
        uDim: { value: 0.5, type: 'f32' },
        uDirection: { value: 0.5, type: 'f32' },
        uMaskTexel: { value: new Float32Array([1 / MASK_W, 1 / MASK_H]), type: 'vec2<f32>' },
      },
    });
    this.lightsU = (this.lightsF.resources.lightUniforms as { uniforms: PostFilter['lightsU'] }).uniforms;
  }

  override apply(fm: FilterSystem, input: Texture, output: RenderSurface, clear: boolean): void {
    const { down, up } = this;
    const n = down.length;
    const first = down[0] as RenderTexture;

    // Four bilinear taps spread so that together they cover the block of input texels under one
    // output texel (an exact box at 2x and 4x reductions).
    const src = input.source;
    this.prefilterU.uTap[0] = (0.25 * (input.frame.width * src.resolution)) / first.width / src.pixelWidth;
    this.prefilterU.uTap[1] = (0.25 * (input.frame.height * src.resolution)) / first.height / src.pixelHeight;
    fm.applyFilter(this.prefilter, input, first, true);

    for (let i = 1; i < n; i++) {
      fm.applyFilter(
        this.downF[i - 1] as Filter,
        down[i - 1] as RenderTexture,
        down[i] as RenderTexture,
        true,
      );
    }
    for (let i = n - 2; i >= 0; i--) {
      const wider = (i === n - 2 ? down[n - 1] : up[i + 1]) as RenderTexture;
      const f = this.upF[i] as Filter;
      const uu = (f.resources.upUniforms as { uniforms: { uTexel: Vec; uSpread: number } }).uniforms;
      uu.uTexel[0] = this.radius / wider.width;
      uu.uTexel[1] = this.radius / wider.height;
      uu.uSpread = this.spread;
      fm.applyFilter(f, wider, up[i] as RenderTexture, true);
    }

    fm.applyFilter(this.lightsF, first, this.light, true);

    // The soft hero matte (five tiny passes: 480x270 and below).
    const soft = this.soft as [RenderTexture, RenderTexture, RenderTexture, RenderTexture, RenderTexture];
    const sf = this.softF as [Filter, Filter, Filter, Filter, Filter];
    for (const f of [sf[3], sf[4]]) {
      (f.resources.upUniforms as { uniforms: { uSpread: number } }).uniforms.uSpread = this.softSpread;
    }
    fm.applyFilter(sf[0], heroMatteTexture(), soft[0], true);
    fm.applyFilter(sf[1], soft[0], soft[1], true);
    fm.applyFilter(sf[2], soft[1], soft[2], true);
    fm.applyFilter(sf[3], soft[2], soft[3], true);
    fm.applyFilter(sf[4], soft[3], soft[4], true);
    fm.applyFilter(this, input, output, clear);

    // `input` is a pooled texture that Pixi destroys when the canvas is resized, and the filter
    // system's bind group still points at it: unhook it, or every resize logs a warning.
    const group = (fm as unknown as { _globalFilterBindGroup?: { setResource(r: unknown, i: number): void } })
      ._globalFilterBindGroup;
    group?.setResource(Texture.EMPTY.source, 1);
    group?.setResource(Texture.EMPTY.source.style, 2);
  }

  override destroy(): void {
    for (const t of [...this.down, ...this.up, this.light, ...this.soft]) t.destroy(true);
    for (const f of [this.prefilter, ...this.downF, ...this.upF, this.lightsF, ...this.softF]) f.destroy();
    super.destroy();
  }
}
