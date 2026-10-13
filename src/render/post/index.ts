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
import { MAX_LIGHTS, MAX_RECTS, POST } from './config';
import { PostFilter } from './pipeline';

export { POST } from './config';

function rgb(out: Float32Array, hex: number): void {
  out[0] = ((hex >> 16) & 255) / 255;
  out[1] = ((hex >> 8) & 255) / 255;
  out[2] = (hex & 255) / 255;
}

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
    rgb(u.uShadow, grade.shadowTint);
    u.uShadow[3] = grade.shadowLift;
    rgb(u.uHighlight, grade.highlightTint);
    u.uHighlight[3] = grade.highlightWarmth;
    u.uVignette[0] = vignette.inner;
    u.uVignette[1] = vignette.outer;
    u.uVignette[2] = vignette.strength;
    u.uVignette[3] = vignette.tintAmount;
    rgb(u.uVignetteTint, vignette.tint);
    u.uVignetteTint[3] = grade.saturation;
    u.uGrain[0] = POST.grain;
    // Wrapped so the grain keeps its precision however long the game has been open.
    u.uGrain[1] = renderClock % 64;
    u.uGrain[2] = VIEW_W / VIEW_H;

    // Lights: world px -> view heights. Only those whose reach touches the view are sent.
    const lu = f.lightsU;
    let n = 0;
    for (const l of this.ctx.lights.list) {
      if (n >= MAX_LIGHTS) break;
      if (l.intensity <= 0 || l.radius <= 0) continue;
      const v = worldToView(camera, l.x, l.y);
      const r = l.radius * camera.zoom;
      if (v.x < -r || v.x > VIEW_W + r || v.y < -r || v.y > VIEW_H + r) continue;
      lu.uLights[n * 4] = v.x / VIEW_H;
      lu.uLights[n * 4 + 1] = v.y / VIEW_H;
      lu.uLights[n * 4 + 2] = r / VIEW_H;
      lu.uLights[n * 4 + 3] = l.intensity;
      lu.uLightColors[n * 4] = ((l.color >> 16) & 255) / 255;
      lu.uLightColors[n * 4 + 1] = ((l.color >> 8) & 255) / 255;
      lu.uLightColors[n * 4 + 2] = (l.color & 255) / 255;
      n++;
    }
    lu.uLightCount = n;
    lu.uShape[0] = VIEW_W / VIEW_H;
    lu.uShape[1] = lights.falloff;
    lu.uShape[2] = (lights.feather * camera.zoom) / VIEW_H;
    lu.uShape[3] = (lights.reachAbove * camera.zoom) / VIEW_H;
    u.uLightBack[0] = lights.background;

    // The playfield mask: the collision rects on screen, in view heights.
    let r = 0;
    if (n > 0) {
      const scene = this.ctx.scene;
      const pad = lights.reachAbove * camera.zoom;
      const put = (x: number, y: number, w: number, h: number): void => {
        if (r >= MAX_RECTS) return;
        const a = worldToView(camera, x, y);
        const b = worldToView(camera, x + w, y + h);
        if (b.x < -pad || a.x > VIEW_W + pad || b.y < -pad || a.y > VIEW_H + pad) return;
        lu.uRects[r * 4] = a.x / VIEW_H;
        lu.uRects[r * 4 + 1] = a.y / VIEW_H;
        lu.uRects[r * 4 + 2] = b.x / VIEW_H;
        lu.uRects[r * 4 + 3] = b.y / VIEW_H;
        r++;
      };
      for (const s of scene.solids) put(s.x, s.y, s.w, s.h);
      for (const o of scene.oneWays) put(o.x, o.y, o.w, 18);
    }
    lu.uRectCount = r;
  }
}
