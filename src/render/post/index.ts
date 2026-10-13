/**
 * The post stage: bloom, dynamic point lights, colour grade, vignette, grain.
 *
 * THE HOOK
 *   `target` is the container holding the whole layer tree (sky .. air) in logical view units
 *   (VIEW_W x VIEW_H; the stage root above it scales to device pixels). Everything inside it is
 *   post-processed; the debug overlay sits outside and is not.
 *   - `update(dt, clock, camera)` runs once per render frame, after scene and character have
 *     updated and before the frame is presented: it feeds the knobs (config.ts), the clock and the
 *     lights (`ctx.lights.list`, world px -> view) to the pipeline.
 *   - `resize()` runs when the canvas size or resolution changes.
 *
 * HOW IT WORKS
 *   One filter (pipeline.ts) on the layer tree: Pixi draws the tree into a texture at canvas
 *   resolution, the filter derives a multi-scale bloom and a light map from it in small targets,
 *   and one fused pass composites, grades, vignettes and dithers into the canvas. Knobs are in
 *   config.ts (`POST`), live-editable; memory/post-and-air.md has the notes.
 */
import { type Container, type Filter, Rectangle } from 'pixi.js';
import { type CameraView, type RenderContext, VIEW_H, VIEW_W, worldToView } from '../contract';
import { fxDebug } from '../scene/lib/fx-debug';
import { renderPlayfieldMask } from '../scene/lib/fx-mask';
import { zoneColor, zoneMix, zoneWeights } from '../scene/lib/fx-zones';
import { MAX_LIGHTS, POST, ZONE_GRADE } from './config';
import { PostFilter } from './pipeline';

export { POST } from './config';

export class PostStage {
  private filter: PostFilter | null = null;
  private on = false;

  constructor(
    protected readonly ctx: RenderContext,
    /** The layer tree's root. */
    readonly target: Container,
  ) {
    // The tree is far bigger than the view (whole parallax layers): tell Pixi the filter covers
    // exactly the view instead of letting it measure everything every frame.
    target.filterArea = new Rectangle(0, 0, VIEW_W, VIEW_H);
    fxDebug('post', POST);
  }

  setFilters(filters: Filter[] | null): void {
    this.target.filters = filters && filters.length > 0 ? filters : null;
  }

  /**
   * The canvas size or resolution changed. The pipeline's own targets have fixed sizes and Pixi
   * sizes the scene texture per frame, so only a resolution change needs anything: Pixi's filter
   * stack has crashed on pooled textures across a resolution change, so start from a fresh filter.
   */
  resize(): void {
    const res = this.ctx.renderer.resolution;
    if (this.filter && res !== this.builtAt) this.rebuild();
  }

  private builtAt = 0;

  private rebuild(): void {
    this.setFilters(null);
    this.filter?.destroy();
    this.filter = new PostFilter(this.ctx.renderer);
    fxDebug('postFilter', this.filter);
    this.builtAt = this.ctx.renderer.resolution;
    this.on = false;
  }

  update(_dtSeconds: number, renderClock: number, camera: CameraView): void {
    if (!POST.enabled) {
      if (this.on) {
        this.setFilters(null);
        this.on = false;
      }
      return;
    }
    if (!this.filter) this.rebuild();
    const f = this.filter as PostFilter;
    if (!this.on) {
      this.setFilters([f]);
      this.on = true;
    }

    // Multisampling the full-screen scene texture is the single most expensive thing here (over
    // 2 ms at 3840x2160) and invisible once a logical px is about two device px, so it is only on
    // when pixels are big.
    f.antialias = POST.msaa === 'auto' ? (this.ctx.viewScale() >= 1.75 ? 'off' : 'on') : POST.msaa;

    const { bloom, lights, grade, vignette } = POST;
    f.spread = bloom.spread;
    f.radius = bloom.radius;
    const knee = Math.max(bloom.knee, 1e-4);
    f.prefilterU.uCurve[0] = bloom.threshold;
    f.prefilterU.uCurve[1] = knee;
    f.prefilterU.uCurve[2] = 0.25 / knee;
    f.prefilterU.uSaturation = bloom.saturation;
    f.prefilterU.uBoost = bloom.colorBoost;

    const u = f.u;
    u.uMix[0] = bloom.intensity;
    u.uMix[1] = lights.gain;
    u.uMix[2] = lights.haze;
    u.uMix[3] = POST.chroma;
    u.uTone[0] = grade.exposure;
    u.uTone[1] = Math.min(grade.shoulder, 0.999);
    u.uTone[2] = grade.contrast;
    u.uTone[3] = grade.pivot;
    // The grade drifts with the scene's zones as the camera travels.
    const zw = zoneWeights(camera.x);
    const za = ZONE_GRADE.amount;
    const zc = (zone: readonly [number, number, number], base: number, out: Float32Array): void => {
      zoneColor(zone, zw, out);
      for (let i = 0; i < 3; i++) {
        const b = ((base >> (16 - i * 8)) & 255) / 255;
        out[i] = b + ((out[i] as number) - b) * za;
      }
    };
    const zn = (zone: readonly [number, number, number], base: number): number =>
      base + (zoneMix(zone, zw) - base) * za;
    zc(ZONE_GRADE.shadowTint, grade.shadowTint, u.uShadow);
    u.uShadow[3] = zn(ZONE_GRADE.shadowLift, grade.shadowLift);
    zc(ZONE_GRADE.highlightTint, grade.highlightTint, u.uHighlight);
    u.uHighlight[3] = zn(ZONE_GRADE.highlightWarmth, grade.highlightWarmth);
    u.uVignette[0] = vignette.inner;
    u.uVignette[1] = vignette.outer;
    u.uVignette[2] = vignette.strength;
    u.uVignette[3] = vignette.tintAmount;
    zc(ZONE_GRADE.vignetteTint, vignette.tint, u.uVignetteTint);
    u.uVignetteTint[3] = zn(ZONE_GRADE.saturation, grade.saturation);
    u.uGrain[0] = POST.grain;
    // Wrapped so the grain keeps its precision however long the game has been open.
    u.uGrain[1] = renderClock % 64;
    u.uGrain[2] = VIEW_W / VIEW_H;

    // The playfield mask for this frame (the air layer's front shafts read it too).
    renderPlayfieldMask(this.ctx.renderer, this.maskLayers());

    // Lights: world px -> view heights. Only those whose reach touches the view are sent.
    const lu = f.lightsU;
    let n = 0;
    let hr = 0;
    let hg = 0;
    let hb = 0;
    let hw = 0;
    for (const l of this.ctx.lights.list) {
      if (n >= MAX_LIGHTS) break;
      if (l.intensity <= 0 || l.radius <= 0) continue;
      const v = worldToView(camera, l.x, l.y);
      const r = l.radius * lights.reach * camera.zoom;
      const far = r * lights.hazeReach;
      if (v.x < -far || v.x > VIEW_W + far || v.y < -far || v.y > VIEW_H + far) continue;
      const cr = ((l.color >> 16) & 255) / 255;
      const cg = ((l.color >> 8) & 255) / 255;
      const cb = (l.color & 255) / 255;
      lu.uLights[n * 4] = v.x / VIEW_H;
      lu.uLights[n * 4 + 1] = v.y / VIEW_H;
      lu.uLights[n * 4 + 2] = r / VIEW_H;
      lu.uLights[n * 4 + 3] = l.intensity;
      lu.uLightColors[n * 4] = cr;
      lu.uLightColors[n * 4 + 1] = cg;
      lu.uLightColors[n * 4 + 2] = cb;
      hr += cr * l.intensity;
      hg += cg * l.intensity;
      hb += cb * l.intensity;
      hw += l.intensity;
      n++;
    }
    lu.uLightCount = n;
    lu.uShape[0] = VIEW_W / VIEW_H;
    lu.uShape[1] = lights.falloff;
    lu.uShape[2] = lights.hazeReach;
    lu.uShape[3] = lights.background;
    lu.uDim = lights.inBrightPlaces;
    u.uLightBack[0] = bloom.paleCut;
    u.uLightBack[1] = lights.glint;
    u.uLightBack[2] = lights.warm;
    // The halo in the air is one scalar per pixel: it takes the lights' mean colour.
    if (hw > 0) {
      u.uHalo[0] = hr / hw;
      u.uHalo[1] = hg / hw;
      u.uHalo[2] = hb / hw;
    }
  }

  private masked: Container[] | null = null;

  /** The layers that count as "solid at the character's depth". */
  private maskLayers(): Container[] {
    this.masked ??= ['playfield', 'playfieldFront']
      .map((name) => this.target.getChildByLabel(name))
      .filter((c): c is Container => c !== null);
    return this.masked;
  }
}
