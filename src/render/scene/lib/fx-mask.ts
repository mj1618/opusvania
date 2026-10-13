/**
 * The playfield mask: a small picture (alpha = "something solid at the character's depth is
 * here") of the playfield layers, redrawn every frame by the post stage. Post has no depth
 * buffer; this is what lets a point light land on terrain, plants and platform undersides and
 * not on the fog behind them, and what lets the front light shafts pass behind solid things.
 *
 * It covers the view (0..VIEW_W x 0..VIEW_H) at MASK_W x MASK_H. Rendering a layer here makes it
 * a Pixi render group (renderer.render does that); the picture on screen is unchanged.
 */
import { type Container, Matrix, type Renderer, RenderTexture } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../../contract';

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

/** Draws the layers (already positioned for this frame's camera) into the mask. */
export function renderPlayfieldMask(renderer: Renderer, layers: readonly Container[]): void {
  const target = playfieldMaskTexture();
  const k = MASK_W / VIEW_W;
  let first = true;
  for (const c of layers) {
    m.set(
      c.scale.x * k,
      0,
      0,
      c.scale.y * (MASK_H / VIEW_H),
      c.position.x * k,
      c.position.y * (MASK_H / VIEW_H),
    );
    renderer.render({ container: c, target, clear: first, clearColor: [0, 0, 0, 0], transform: m });
    first = false;
  }
}
