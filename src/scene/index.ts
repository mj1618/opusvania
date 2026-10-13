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
    pickups: z
      .array(z.object({ id: z.string().min(1), kind: z.enum(['glint', 'great']), x: int, y: int }).strict())
      .default([]),
  })
  .strict();

export function parseScene(json: unknown): Scene {
  const s = SceneSchema.parse(json);
  for (const r of s.solids) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > s.width || r.y + r.h > s.height)
      throw new Error(`Scene "${s.id}": solid at (${r.x}, ${r.y}) leaves the scene bounds`);
  }
  const seen = new Set<string>();
  for (const p of s.pickups) {
    if (seen.has(p.id)) throw new Error(`Scene "${s.id}": two pickups are called "${p.id}"`);
    seen.add(p.id);
    if (p.x <= 0 || p.y <= 0 || p.x >= s.width || p.y >= s.height)
      throw new Error(`Scene "${s.id}": pickup "${p.id}" is outside the scene`);
    if (s.solids.some((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h))
      throw new Error(`Scene "${s.id}": pickup "${p.id}" is inside a solid`);
  }
  return s;
}

export const GROVE: Scene = parseScene(groveJson);
