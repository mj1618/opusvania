import { z } from 'zod';
import groveJson from '../../content/scene/grove.json' with { type: 'json' };
import type { Scene } from '../sim/scene';
import { defaultTuning } from '../sim/tuning';

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
    pods: z
      .array(z.object({ id: z.string().min(1), x: int, y: int, mount: z.enum(['sit', 'hang']) }).strict())
      .default([]),
  })
  .strict();

/** A hanging pod's stem: the underside or branch it hangs from is at most this far above its top. */
export const POD_HANG_MAX = 160;

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
  // Lumen pods: a box of 2 x radius that sits exactly on a top, or hangs under an underside / branch.
  const r = defaultTuning.pods.radius;
  for (const p of s.pods) {
    if (seen.has(p.id)) throw new Error(`Scene "${s.id}": two pickups or pods are called "${p.id}"`);
    seen.add(p.id);
    if (p.x - r < 0 || p.y - r < 0 || p.x + r > s.width || p.y + r > s.height)
      throw new Error(`Scene "${s.id}": pod "${p.id}" is outside the scene`);
    if (s.solids.some((q) => p.x + r > q.x && p.x - r < q.x + q.w && p.y + r > q.y && p.y - r < q.y + q.h))
      throw new Error(`Scene "${s.id}": pod "${p.id}" is inside a solid`);
    const over = (q: { x: number; w: number }) => p.x >= q.x && p.x <= q.x + q.w;
    const ok =
      p.mount === 'sit'
        ? [...s.solids, ...s.oneWays].some((q) => over(q) && q.y === p.y + r)
        : [...s.solids.map((q) => ({ x: q.x, w: q.w, y: q.y + q.h })), ...s.oneWays].some(
            (q) => over(q) && q.y <= p.y - r && q.y >= p.y - r - POD_HANG_MAX,
          );
    if (!ok)
      throw new Error(
        `Scene "${s.id}": pod "${p.id}" has nothing to ${p.mount === 'sit' ? 'sit on' : 'hang from'}`,
      );
  }
  return s;
}

export const GROVE: Scene = parseScene(groveJson);
