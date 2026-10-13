/**
 * The post stage: bloom, colour grade, vignette, grain. Currently the identity (nothing applied).
 *
 * THE HOOK
 *   `target` is the container holding the whole layer tree (sky .. air) in logical view units
 *   (VIEW_W x VIEW_H; the stage root above it scales to device pixels). Everything inside it is
 *   post-processed; the debug overlay sits outside and is not.
 *   - Simplest: put Pixi filters on it with `setFilters([...])` (pass null to remove; an empty
 *     array leaves a filter effect behind).
 *   - `update(dt, clock, camera)` runs once per render frame, after scene and character have
 *     updated and before the frame is presented: feed uniforms here (time for grain, light
 *     positions from `ctx.lights.list` via worldToView() for glow, zoom from the camera).
 *   - `resize()` runs when the canvas size or resolution changes: rebuild render targets here.
 *     `ctx.viewScale()` is device px per logical unit; `ctx.renderer` is the Pixi renderer.
 *   Screenshots (npm run shots) capture the presented canvas, so whatever this stage does is in them.
 */
import type { Container, Filter } from 'pixi.js';
import type { CameraView, RenderContext } from '../contract';

export class PostStage {
  constructor(
    protected readonly ctx: RenderContext,
    /** The layer tree's root. */
    readonly target: Container,
  ) {}

  setFilters(filters: Filter[] | null): void {
    this.target.filters = filters && filters.length > 0 ? filters : null;
  }

  resize(): void {}

  update(_dtSeconds: number, _renderClock: number, _camera: CameraView): void {}
}
