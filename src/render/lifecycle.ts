/**
 * Render lifecycle (memory/world.md "Render lifecycle"): rooms are built and torn down as she moves
 * between them, so everything a room's renderers made must be freed when it goes.
 *
 * `destroyTree(root)` frees a display tree and the GPU resources hanging off it: every Graphics with
 * its context (Pixi v8 keeps a Graphics' tessellated geometry cached in the renderer until the context
 * itself is destroyed: the ~700 MB heap of the grove), every Mesh's geometry and shader, the textures
 * of sprites and meshes and the textures a shader samples, and filters. Textures shared between
 * rooms (module-level caches: a noise texture, the soft blob) are registered with `shareTexture` and
 * survive, as do Pixi's built-in white and empty textures. Text releases its own texture.
 */
import {
  type Container,
  Filter,
  Geometry,
  Mesh,
  Shader,
  Sprite,
  Texture,
  TextureSource,
  TilingSprite,
} from 'pixi.js';

const SHARED = new WeakSet<TextureSource>();

/** Marks a texture as shared between rooms (a module-level cache): `destroyTree` never frees it. */
export function shareTexture<T extends Texture>(t: T): T {
  SHARED.add(t.source);
  return t;
}

function keep(src: TextureSource): boolean {
  return SHARED.has(src) || src === Texture.WHITE.source || src === Texture.EMPTY.source;
}

/** Destroys `root`, its children, and the GPU resources they own (see the file comment). */
export function destroyTree(root: Container): void {
  if (root.destroyed) return;
  const geometries = new Set<Geometry>();
  const shaders = new Set<Shader>();
  const sources = new Set<TextureSource>();
  const filters = new Set<Filter>();
  const visit = (c: Container): void => {
    if (c.destroyed) return;
    if (c instanceof Mesh) {
      if (c.geometry instanceof Geometry) geometries.add(c.geometry);
      if (c.shader instanceof Shader) {
        shaders.add(c.shader);
        // (`shader.resources` is an accessor whose properties do not enumerate: read the bind groups.)
        for (const group of Object.values(c.shader.groups ?? {})) {
          for (const r of Object.values((group as { resources?: Record<string, unknown> }).resources ?? {}))
            if (r instanceof TextureSource) sources.add(r);
            else if (r instanceof Texture) sources.add(r.source);
        }
      }
      if (c.texture) sources.add(c.texture.source);
    } else if (c instanceof Sprite || c instanceof TilingSprite) {
      if (c.texture) sources.add(c.texture.source);
    }
    const f = c.filters;
    if (Array.isArray(f)) for (const x of f) filters.add(x);
    else if (f instanceof Filter) filters.add(f);
    for (const ch of c.children) visit(ch);
  };
  visit(root);
  root.destroy({ children: true, context: true });
  // (`destroy(true)`: a geometry keeps its GPU buffers otherwise.)
  for (const g of geometries) g.destroy(true);
  for (const s of shaders) s.destroy();
  for (const f of filters) f.destroy();
  for (const s of sources) if (!keep(s) && !s.destroyed) s.destroy();
}
