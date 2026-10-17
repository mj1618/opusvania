/**
 * The playfield mask: a small picture (alpha = "something solid at the character's depth is
 * here") of the playfield layers, redrawn every frame by the post stage. Post has no depth
 * buffer; this is what lets a point light land on terrain, plants and platform undersides and
 * not on the fog behind them, and what lets the front light shafts pass behind solid things.
 *
 * It covers the whole visible view (contract.ts ViewSize: left..left + w, top..top + h, any window
 * shape) at MASK_W x MASK_H, so its uv is the view's own 0..1 (what post's filter area and the air
 * layer's `visible` rect are). Rendering a layer here makes it a Pixi render group
 * (renderer.render does that); the picture on screen is unchanged.
 */
import { type Container, Matrix, type Renderer, RenderTexture } from 'pixi.js';
import { SAFE_VIEW, type ViewSize } from '../../contract';

export const MASK_W = 480;
export const MASK_H = 270;

let texture: RenderTexture | null = null;
const m = new Matrix();

export function playfieldMaskTexture(): RenderTexture {
  texture ??= RenderTexture.create({
    width: MASK_W,
    height: MASK_H,
    resolution: 1,
    antialias: false,
    scaleMode: 'linear',
    addressMode: 'clamp-to-edge',
  });
  return texture;
}

/** Draws the layers (already positioned for this frame's camera) into the mask, over the view `v`. */
export function renderPlayfieldMask(
  renderer: Renderer,
  layers: readonly Container[],
  v: ViewSize = SAFE_VIEW,
): void {
  const target = playfieldMaskTexture();
  const kx = MASK_W / v.w;
  const ky = MASK_H / v.h;
  let first = true;
  for (const c of layers) {
    m.set(c.scale.x * kx, 0, 0, c.scale.y * ky, (c.position.x - v.left) * kx, (c.position.y - v.top) * ky);
    renderer.render({ container: c, target, clear: first, clearColor: [0, 0, 0, 0], transform: m });
    first = false;
  }
}

/**
 * The hero matte: the character layer's alpha over the view at full logical resolution
 * (anything coarser bleeds post terms across her outline and softens it), redrawn every frame. Post uses it to
 * keep its own light off the hero: the hero's light is a gain on dark pixels, and without the matte
 * the darkest thing nearest the light, the hero's own body, was lifted most and washed out.
 * It is the view's size (1920x1080 in a 16:9 window); `heroMatteTexture(view)` replaces it when the
 * view changes shape, so whoever binds it (post's pipeline) must rebind then.
 */
let matte: RenderTexture | null = null;

/** The matte for view `v` (a new texture if the view's size changed since the last call). */
export function heroMatteTexture(v?: ViewSize): RenderTexture {
  const w = Math.ceil(v?.w ?? matte?.width ?? SAFE_VIEW.w);
  const h = Math.ceil(v?.h ?? matte?.height ?? SAFE_VIEW.h);
  if (matte && (matte.width !== w || matte.height !== h)) {
    matte.destroy(true);
    matte = null;
  }
  matte ??= RenderTexture.create({
    width: w,
    height: h,
    resolution: 1,
    antialias: false,
    scaleMode: 'linear',
    addressMode: 'clamp-to-edge',
  });
  return matte;
}

export function renderHeroMatte(renderer: Renderer, character: Container, v: ViewSize = SAFE_VIEW): void {
  const target = heroMatteTexture();
  const kx = target.width / v.w;
  const ky = target.height / v.h;
  m.set(
    character.scale.x * kx,
    0,
    0,
    character.scale.y * ky,
    (character.position.x - v.left) * kx,
    (character.position.y - v.top) * ky,
  );
  renderer.render({
    container: character,
    target,
    clear: true,
    clearColor: [0, 0, 0, 0],
    transform: m,
  });
}
