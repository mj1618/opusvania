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
    ceilingY: int.optional(),
    solids: z.array(z.object({ tag: TAG, x: int, y: int, w: int.positive(), h: int.positive() })),
    oneWays: z.array(z.object({ tag: TAG, x: int, y: int, w: int.positive() })),
    pickups: z
      .array(z.object({ id: z.string().min(1), kind: z.enum(['glint', 'great']), x: int, y: int }).strict())
      .default([]),
    pods: z
      .array(
        z
          .object({
            id: z.string().min(1),
            x: int,
            y: int,
            mount: z.enum(['sit', 'hang']),
            hp: int.min(1).max(3).optional(),
          })
          .strict(),
      )
      .default([]),
    enemies: z
      .array(
        z.discriminatedUnion('kind', [
          z
            .object({
              id: z.string().min(1),
              kind: z.literal('burrback'),
              x: int,
              y: int,
              facing: z.union([z.literal(-1), z.literal(1)]),
            })
            .strict(),
          z
            .object({
              id: z.string().min(1),
              kind: z.literal('lampwing'),
              x: int,
              y: int,
              facing: z.union([z.literal(-1), z.literal(1)]),
              radius: int.min(0).max(400).optional(),
            })
            .strict(),
        ]),
      )
      .default([]),
    lanterns: z
      .array(
        z.object({ id: z.string().min(1), x: int, y: int, cost: int.min(0).max(99).optional() }).strict(),
      )
      .default([]),
    heart: z.object({ x: int, y: int }).strict().optional(),
  })
  .strict();

/** No lantern stands closer to the spawn point than this (foot to feet). */
export const LANTERN_SPAWN_CLEAR = 300;

/** No enemy starts closer to the spawn point than this (feet to feet). */
export const ENEMY_SPAWN_CLEAR = 300;

/** No lampwing's home is closer to the spawn point than this (home to feet). */
export const LAMPWING_SPAWN_CLEAR = 350;

/**
 * A lampwing's territory keeps this far from every lumen pod and great glint (edge of the territory
 * to the thing's centre), so collecting one never means standing where a hovering lampwing drifts.
 */
export const LAMPWING_PRIZE_CLEAR = 100;

/** A hanging pod's stem: the underside or branch it hangs from is at most this far above its top. */
export const POD_HANG_MAX = 160;

type Parsed = z.infer<typeof SceneSchema>;

/**
 * A lampwing's home (`x`, `y` = the centre of its box): in open air (a box of twice its size is
 * clear of solids, under the canopy, inside the scene, not over a pool's water), away from the
 * spawn, and its territory clear of pods and great glints.
 */
function checkLampwing(s: Parsed, e: Parsed['enemies'][number]): void {
  const L = defaultTuning.lampwing;
  const w = L.width;
  const h = L.height;
  const radius = (e.kind === 'lampwing' ? e.radius : undefined) ?? L.radius;
  const top = s.ceilingY ?? 0;
  if (e.x - w < 0 || e.x + w > s.width || e.y - h < top || e.y + h > s.height)
    throw new Error(`Scene "${s.id}": enemy "${e.id}" is outside the scene`);
  if (s.solids.some((q) => e.x + w > q.x && e.x - w < q.x + q.w && e.y + h > q.y && e.y - h < q.y + q.h))
    throw new Error(`Scene "${s.id}": enemy "${e.id}" is inside a solid (a lampwing needs open air)`);
  const dx = e.x - s.spawn.x;
  const dy = e.y - s.spawn.y;
  if (dx * dx + dy * dy < LAMPWING_SPAWN_CLEAR * LAMPWING_SPAWN_CLEAR)
    throw new Error(`Scene "${s.id}": enemy "${e.id}" is too close to the spawn point`);
  const near = radius + LAMPWING_PRIZE_CLEAR;
  const prizes = [...s.pods, ...s.pickups.filter((p) => p.kind === 'great')];
  for (const p of prizes) {
    if ((p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y) < near * near)
      throw new Error(`Scene "${s.id}": enemy "${e.id}" hovers too close to "${p.id}"`);
  }
}

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
  // Enemies. A burrback: feet centre on a surface, the whole box supported and clear, away from the
  // spawn. A lampwing: its home in open air (see `checkLampwing`).
  const bw = defaultTuning.burrback.width;
  const bh = defaultTuning.burrback.height;
  for (const e of s.enemies) {
    if (seen.has(e.id)) throw new Error(`Scene "${s.id}": two things are called "${e.id}"`);
    seen.add(e.id);
    if (e.kind === 'lampwing') {
      checkLampwing(s, e);
      continue;
    }
    const x0 = e.x - bw / 2;
    const x1 = e.x + bw / 2;
    if (x0 < 0 || x1 > s.width || e.y - bh < 0 || e.y > s.height)
      throw new Error(`Scene "${s.id}": enemy "${e.id}" is outside the scene`);
    if (s.solids.some((q) => x1 > q.x && x0 < q.x + q.w && e.y > q.y && e.y - bh < q.y + q.h))
      throw new Error(`Scene "${s.id}": enemy "${e.id}" is inside a solid`);
    const under = (x: number) =>
      [...s.solids, ...s.oneWays].some((q) => q.y === e.y && x >= q.x && x < q.x + q.w);
    if (!under(x0) || !under(x1 - 1))
      throw new Error(`Scene "${s.id}": enemy "${e.id}" does not stand on a surface`);
    const dx = e.x - s.spawn.x;
    const dy = e.y - s.spawn.y;
    if (dx * dx + dy * dy < ENEMY_SPAWN_CLEAR * ENEMY_SPAWN_CLEAR)
      throw new Error(`Scene "${s.id}": enemy "${e.id}" is too close to the spawn point`);
  }
  // Lanterns and the heart: a point on solid ground that is not the pool, the whole trigger box
  // supported and clear of solids. Lanterns keep away from the spawn; the heart needs lanterns.
  const G = defaultTuning.goal;
  const stands = (what: string, p: { x: number; y: number }, w: number, h: number): void => {
    const x0 = p.x - w / 2;
    const x1 = p.x + w / 2;
    if (x0 < 0 || x1 > s.width || p.y - h < (s.ceilingY ?? 0) || p.y > s.height)
      throw new Error(`Scene "${s.id}": ${what} is outside the scene`);
    if (s.solids.some((q) => x1 > q.x && x0 < q.x + q.w && p.y > q.y && p.y - h < q.y + q.h))
      throw new Error(`Scene "${s.id}": ${what} is inside a solid`);
    const under = (x: number) =>
      s.solids.some((q) => q.tag !== 'pool' && q.y === p.y && x >= q.x && x < q.x + q.w);
    if (!under(x0) || !under(x1 - 1))
      throw new Error(`Scene "${s.id}": ${what} does not stand on solid ground`);
  };
  for (const l of s.lanterns) {
    if (seen.has(l.id)) throw new Error(`Scene "${s.id}": two things are called "${l.id}"`);
    seen.add(l.id);
    stands(`lantern "${l.id}"`, l, G.lanternWidth, G.lanternHeight);
    const dx = l.x - s.spawn.x;
    const dy = l.y - s.spawn.y;
    if (dx * dx + dy * dy < LANTERN_SPAWN_CLEAR * LANTERN_SPAWN_CLEAR)
      throw new Error(`Scene "${s.id}": lantern "${l.id}" is too close to the spawn point`);
  }
  if (s.heart) {
    stands('the heart', s.heart, G.heartWidth, G.heartHeight);
    if (s.lanterns.length === 0) throw new Error(`Scene "${s.id}": a heart needs lanterns to wake it`);
    const hb = { x0: s.heart.x - G.heartWidth / 2, x1: s.heart.x + G.heartWidth / 2 };
    for (const l of s.lanterns) {
      if (l.y === s.heart.y && l.x + G.lanternWidth / 2 > hb.x0 && l.x - G.lanternWidth / 2 < hb.x1)
        throw new Error(`Scene "${s.id}": lantern "${l.id}" stands in the heart`);
    }
  }
  return s;
}

export const GROVE: Scene = parseScene(groveJson);
