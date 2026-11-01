/**
 * Bakes a static painted plane (thousands of small marks: the heartwood's grain, rings, stipple) into one texture
 * once, so the frame pays for one sprite instead of the geometry (canopy r19: the giant's inside). Multisampled,
 * then resolved into a plain texture; the Graphics is freed. The sprite's texture is freed with the room
 * (render/lifecycle.ts `destroyTree`).
 */
import { Graphics, Matrix, type Renderer, RenderTexture, Sprite } from 'pixi.js';

export interface PlaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Texture px per layer px at most, and the longest side a plane's texture may have. */
export const BAKE_PLANE = { maxSide: 3072 };

/** Draws with `draw` into a texture covering `rect` at `scale` (capped by `BAKE_PLANE.maxSide`); returns its sprite. */
export function bakePlane(
  renderer: Renderer,
  rect: PlaneRect,
  scale: number,
  draw: (g: Graphics) => void,
  label: string,
): Sprite {
  const k = Math.min(scale, BAKE_PLANE.maxSide / Math.max(rect.w, rect.h));
  const w = Math.max(1, Math.ceil(rect.w * k));
  const h = Math.max(1, Math.ceil(rect.h * k));
  const g = new Graphics();
  draw(g);
  const raw = RenderTexture.create({ width: w, height: h, resolution: 1, antialias: true });
  renderer.render({
    container: g,
    target: raw,
    clear: true,
    clearColor: [0, 0, 0, 0],
    transform: new Matrix(k, 0, 0, k, -rect.x * k, -rect.y * k),
  });
  g.destroy({ context: true });
  const out = RenderTexture.create({ width: w, height: h, resolution: 1, scaleMode: 'linear' });
  const copy = new Sprite(raw);
  renderer.render({ container: copy, target: out, clear: true, clearColor: [0, 0, 0, 0] });
  copy.destroy();
  raw.destroy(true);
  const s = new Sprite(out);
  s.label = label;
  s.position.set(rect.x, rect.y);
  s.scale.set(rect.w / w, rect.h / h);
  return s;
}
