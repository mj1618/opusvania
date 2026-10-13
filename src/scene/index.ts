import { z } from 'zod';
import groveJson from '../../content/scene/grove.json' with { type: 'json' };
import type { Scene } from '../sim/scene';

/**
 * The one scene. Collision data lives in content/scene/grove.json (sim px, see
 * memory/scene-and-units.md); it is validated here once at import and shared by the sim, the
 * renderers and the tools. No Pixi or DOM in this file, so Node tools and tests can import it.
 */

/** One "tile": the grid the scene is laid out on. Only a layout convention, the sim has no tiles. */
export const TILE = 64;

const TAG = z.enum(['ground', 'pool', 'ledge', 'trunk', 'floating', 'root', 'branch']);
const int = z.number().int();

const SceneSchema = z
  .object({
    id: z.string(),
    width: int.positive(),
    height: int.positive(),
    spawn: z.object({ x: int, y: int }),
    solids: z.array(z.object({ tag: TAG, x: int, y: int, w: int.positive(), h: int.positive() })),
    oneWays: z.array(z.object({ tag: TAG, x: int, y: int, w: int.positive() })),
  })
  .strict();

export function parseScene(json: unknown): Scene {
  const s = SceneSchema.parse(json);
  for (const r of s.solids) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > s.width || r.y + r.h > s.height)
      throw new Error(`Scene "${s.id}": solid at (${r.x}, ${r.y}) leaves the scene bounds`);
  }
  return s;
}

export const GROVE: Scene = parseScene(groveJson);
