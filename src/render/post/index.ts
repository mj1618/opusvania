/**
 * The post stage: bloom, dynamic point lights, colour grade, vignette, grain.
 *
 * THE HOOK
 *   `target` is the container holding the whole layer tree (sky .. air) in logical view units
 *   (the stage root above it scales to device pixels). The filter covers the whole visible view
 *   (`ctx.view()`: any window shape, the 16:9 safe area at 0..SAFE_W x 0..SAFE_H inside it).
 *   Everything inside it is post-processed; the debug overlay sits outside and is not.
 *   - `update(dt, clock, camera)` runs once per render frame, after scene and character have
 *     updated and before the frame is presented: it feeds the knobs (config.ts), the clock and the
 *     lights (`ctx.lights.list`, world px -> view) to the pipeline.
 *   - `resize()` runs when the canvas size or resolution changes (a new view shape rebuilds the
 *     filter: its targets are sized to the view's shape).
 *
 * HOW IT WORKS
 *   One filter (pipeline.ts) on the layer tree: Pixi draws the tree into a texture at canvas
 *   resolution, the filter derives a multi-scale bloom and a light map from it in small targets,
 *   and one fused pass composites, grades, vignettes and dithers into the canvas. Knobs are in
 *   config.ts (`POST`), live-editable; memory/post-and-air.md has the notes.
 */
import { type Container, type Filter, Rectangle } from 'pixi.js';
import { type CameraView, type RenderContext, SAFE_H, SAFE_W, type ViewSize, worldToView } from '../contract';
import type { PointLight } from '../lights';
import { fxDebug } from '../scene/lib/fx-debug';
import { renderHeroMatte, renderPlayfieldMask } from '../scene/lib/fx-mask';
import { zoneColor, zoneMix, zoneWeights } from '../scene/lib/fx-zones';
import { isGroveKit, isInterior, isLantern, LOOK } from '../scene/lib/room-look';
import {
  GOAL_LIGHTS,
  LANTERN_GRADE,
  LANTERN_POST,
  MAX_LIGHTS,
  POST,
  WOOD_GRADE,
  WOOD_POST,
  ZONE_GRADE,
  type ZoneGrade,
} from './config';

/** The kit's overrides of the global post knobs: the wood's, or Lanternroot's inside the giant. */
function kitPost(): typeof WOOD_POST {
  return isInterior() ? LANTERN_POST : WOOD_POST;
}

/** The kit's grade table. */
function kitGrade(): ZoneGrade {
  if (isGroveKit()) return ZONE_GRADE;
  const band = LOOK.band;
  return band === 'hall' || band === 'roots' || band === 'cache' ? LANTERN_GRADE[band] : WOOD_GRADE;
}

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
    target.filterArea = new Rectangle();
    this.fitArea(ctx.view());
    fxDebug('post', POST);
    fxDebug('zoneGrade', ZONE_GRADE);
  }

  /** Frees the filter and its targets (the room is going). */
  destroy(): void {
    this.setFilters(null);
    this.filter?.destroy();
    this.filter = null;
    this.on = false;
  }

  setFilters(filters: Filter[] | null): void {
    this.target.filters = filters && filters.length > 0 ? filters : null;
  }

  /**
   * The canvas size or resolution changed. Pixi sizes the scene texture per frame; the pipeline's
   * own targets follow the view's shape, so a new shape needs a new filter. So does a resolution
   * change: Pixi's filter stack has crashed on pooled textures across one.
   */
  resize(): void {
    const v = this.ctx.view();
    this.fitArea(v);
    if (this.filter && this.stale(v)) this.rebuild();
  }

  private builtAt = 0;
  private builtW = 0;
  private builtH = 0;

  private stale(v: ViewSize): boolean {
    return this.ctx.renderer.resolution !== this.builtAt || v.w !== this.builtW || v.h !== this.builtH;
  }

  /** The filter covers the visible view exactly. */
  private fitArea(v: ViewSize): void {
    const a = this.target.filterArea as Rectangle;
    a.x = v.left;
    a.y = v.top;
    a.width = v.w;
    a.height = v.h;
  }

  private rebuild(): void {
    const v = this.ctx.view();
    this.setFilters(null);
    this.filter?.destroy();
    this.filter = new PostFilter(this.ctx.renderer, v);
    fxDebug('postFilter', this.filter);
    this.builtAt = this.ctx.renderer.resolution;
    this.builtW = v.w;
    this.builtH = v.h;
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
    const view = this.ctx.view();
    this.fitArea(view);
    if (!this.filter || this.stale(view)) this.rebuild();
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
    f.prefilterU.uHeroSource = lights.heroBloomSource;

    const u = f.u;
    u.uMix[0] = isGroveKit() ? bloom.intensity : kitPost().bloom;
    u.uMix[1] = lights.gain;
    u.uMix[2] = lights.haze;
    u.uMix[3] = POST.chroma;
    // The grade drifts with the scene's zones as the camera travels.
    const zw = zoneWeights(camera.x);
    const ZG: ZoneGrade = kitGrade();
    const za = ZG.amount;
    const zc = (zone: readonly [number, number, number], base: number, out: Float32Array): void => {
      zoneColor(zone, zw, out);
      for (let i = 0; i < 3; i++) {
        const b = ((base >> (16 - i * 8)) & 255) / 255;
        out[i] = b + ((out[i] as number) - b) * za;
      }
    };
    const zn = (zone: readonly [number, number, number], base: number): number =>
      base + (zoneMix(zone, zw) - base) * za;
    u.uTone[0] = zn(ZG.exposure, grade.exposure);
    u.uTone[1] = Math.min(isGroveKit() ? grade.shoulder : kitPost().shoulder, 0.999);
    u.uTone[2] = zn(ZG.contrast, grade.contrast);
    u.uTone[3] = zn(ZG.pivot, grade.pivot);
    zc(ZG.shadowTint, grade.shadowTint, u.uShadow);
    u.uShadow[3] = zn(ZG.shadowLift, grade.shadowLift);
    zc(ZG.highlightTint, grade.highlightTint, u.uHighlight);
    u.uHighlight[3] = zn(ZG.highlightWarmth, grade.highlightWarmth);
    u.uVignette[0] = vignette.inner;
    u.uVignette[1] = vignette.outer;
    u.uVignette[2] = isGroveKit() ? vignette.strength : kitPost().vignette;
    u.uVignette[3] = vignette.tintAmount;
    u.uSepLook[2] = vignette.lightKeep;
    u.uSepLook[3] = vignette.lightFrom;
    zc(ZG.vignetteTint, vignette.tint, u.uVignetteTint);
    u.uVignetteTint[3] = zn(ZG.saturation, grade.saturation);
    u.uDeep[0] = Math.max(grade.toe, 1e-3);
    u.uDeep[1] = zn(ZG.toeDepth, grade.toeDepth);
    u.uDeep[2] = grade.spark;
    u.uDeep[3] = grade.sparkWhite;
    zc(ZG.richTint, 0xffffff, u.uRich);
    u.uRich[3] = zn(ZG.richSaturation, 1);
    u.uGrain[0] = POST.grain;
    // Wrapped so the grain keeps its precision however long the game has been open.
    u.uGrain[1] = renderClock % 64;
    // The vignette's ellipse is the 16:9 one stretched over the view (it closes any frame alike).
    u.uGrain[2] = SAFE_W / SAFE_H;
    u.uGrain[3] = grade.midLift;

    // The playfield mask for this frame (the air layer's front shafts read it too).
    // It is soft and low-res, so every other frame is enough, unless the camera jumped.
    const jumped = Math.abs(camera.x - this.maskAt.x) + Math.abs(camera.y - this.maskAt.y) > 120;
    if ((this.frames++ & 1) === 0 || jumped || camera.zoom !== this.maskAt.zoom) {
      renderPlayfieldMask(this.ctx.renderer, this.maskLayers(), view);
      this.maskAt = { x: camera.x, y: camera.y, zoom: camera.zoom };
    }

    const character = this.target.getChildByLabel('character');
    if (character) renderHeroMatte(this.ctx.renderer, character, view);
    u.uProtect[0] = lights.heroProtect;
    u.uProtect[1] = lights.cap;
    u.uProtect[2] = lights.heroBloomCut;
    u.uProtect[3] = Number(POST.debugMatte);
    const sep = POST.separation;
    f.softSpread = sep.spread;
    u.uLit[3] = sep.gain;
    u.uSep[0] = sep.pivot;
    u.uSep[1] = Math.max(sep.width, 1e-3);
    u.uSep[2] = sep.lift;
    u.uSepLook[0] = sep.liftEnd[0];
    u.uSepLook[1] = sep.liftEnd[1];
    u.uSep[3] = sep.darken;
    zoneColor(sep.tint, zw, u.uSepTint);
    const sepLuma =
      0.2126 * (u.uSepTint[0] as number) +
      0.7152 * (u.uSepTint[1] as number) +
      0.0722 * (u.uSepTint[2] as number);
    for (let i = 0; i < 3; i++) u.uSepTint[i] = (u.uSepTint[i] as number) / Math.max(sepLuma, 1e-3);
    u.uSepTint[3] = sep.desaturate;
    u.uGoalLook[0] = lights.goalCap;
    u.uGoalLook[1] = lights.goalPocket;
    u.uGoalLook[2] = lights.goalTint;
    // Lanternroot: what already glows brighter than the lit-surface cap (a lamp's paper, a moonwick's glass)
    // is not pulled down to it by its own light (0 elsewhere: the grove and the wood unchanged).
    u.uGoalLook[3] = isLantern() ? 1 : 0;

    // Lights: world px -> safe-area heights (1080 logical px) from the view's top-left. Only those
    // whose reach touches the view are sent.
    const H = SAFE_H;
    const vx0 = view.left;
    const vy0 = view.top;
    const lu = f.lightsU;
    let n = 0;
    let hr = 0;
    let hg = 0;
    let hb = 0;
    let hw = 0;
    // Who gets a slot: the ember and the goal's lights always, the others nearest the view first.
    const reg = this.ctx.lights;
    const goal = this.goalSet;
    goal.clear();
    for (const id of lights.goalIds) {
      const l = reg.get(id);
      if (l) goal.add(l);
    }
    const ember0 = reg.get('ember');
    const picked = this.picked;
    picked.length = 0;
    for (const l of reg.list) {
      if (l.intensity <= 0 || l.radius <= 0) continue;
      const v = worldToView(camera, l.x, l.y);
      const far = l.radius * lights.reach * camera.zoom * lights.hazeReach;
      if (v.x < vx0 - far || v.x > vx0 + view.w + far || v.y < vy0 - far || v.y > vy0 + view.h + far)
        continue;
      const first = l === ember0 || goal.has(l);
      picked.push({ l, key: first ? -1 : Math.hypot(v.x - SAFE_W / 2, v.y - SAFE_H / 2) });
    }
    if (picked.length > MAX_LIGHTS) picked.sort((a, b) => a.key - b.key);
    u.uGoal.fill(0);
    let gn = 0;
    for (const { l: src } of picked) {
      if (n >= MAX_LIGHTS) break;
      const isGoal = goal.has(src);
      const v = worldToView(camera, src.x, src.y);
      const r = src.radius * lights.reach * camera.zoom;
      const l = { color: src.color, intensity: src.intensity * (isGoal ? lights.goalBoost : 1) };
      if (isGoal && gn < GOAL_LIGHTS) {
        u.uGoal[gn * 4] = (v.x - vx0) / H;
        u.uGoal[gn * 4 + 1] = (v.y - vy0) / H;
        u.uGoal[gn * 4 + 2] = r / H;
        u.uGoal[gn * 4 + 3] = Math.min(1, src.intensity);
        gn++;
      }
      const cr = ((l.color >> 16) & 255) / 255;
      const cg = ((l.color >> 8) & 255) / 255;
      const cb = (l.color & 255) / 255;
      lu.uLights[n * 4] = (v.x - vx0) / H;
      lu.uLights[n * 4 + 1] = (v.y - vy0) / H;
      lu.uLights[n * 4 + 2] = r / H;
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
    lu.uDirection = lights.direction;

    // The hero's pocket, centred a little above the ember (which hangs low, at a tail or lantern).
    const ember = this.ctx.lights.get('ember');
    const hero = POST.hero;
    if (ember) {
      const v = worldToView(camera, ember.x, ember.y - 14);
      u.uHero[0] = (v.x - vx0) / H;
      u.uHero[1] = (v.y - vy0) / H;
    }
    u.uHero[2] = (hero.radius * camera.zoom) / H;
    u.uHero[3] = ember ? hero.darken * zoneMix(ZG.heroPocket, zw) : 0;
    u.uHero2[0] = (hero.inner * camera.zoom) / H;
    u.uHero2[1] = hero.desaturate;
    u.uHero2[2] = hero.ceiling;
    u.uHero2[3] = ember ? hero.pull : 0;
    lu.uShape[0] = view.w / view.h;
    lu.uShape[1] = lights.falloff;
    lu.uShape[2] = lights.hazeReach;
    lu.uShape[3] = lights.background;
    lu.uDim = lights.inBrightPlaces;
    u.uLightBack[0] = isGroveKit() ? bloom.paleCut : kitPost().paleCut;
    const sceneH = this.ctx.scene.height;
    const high = Math.min(1, Math.max(0, (sceneH - SAFE_H / 2 - camera.y) / Math.max(1, sceneH - SAFE_H)));
    u.uLightBack[3] = bloom.wrap + (bloom.wrapHigh - bloom.wrap) * high;
    u.uLightBack[1] = lights.glint;
    u.uLightBack[2] = lights.warm;
    u.uLit[0] = lights.tint;
    u.uLit[1] = lights.chroma;
    u.uLit[2] = lights.channelCap;
    // The halo in the air is one scalar per pixel: it takes the lights' mean colour.
    if (hw > 0) {
      u.uHalo[0] = hr / hw;
      u.uHalo[1] = hg / hw;
      u.uHalo[2] = hb / hw;
    }
  }

  private readonly goalSet = new Set<PointLight>();
  private readonly picked: Array<{ l: PointLight; key: number }> = [];
  private masked: Container[] | null = null;
  private frames = 0;
  private maskAt = { x: Number.NaN, y: 0, zoom: 1 };

  /** The layers that count as "solid at the character's depth". */
  private maskLayers(): Container[] {
    this.masked ??= ['playfield']
      .map((name) => this.target.getChildByLabel(name))
      .filter((c): c is Container => c !== null);
    return this.masked;
  }
}
