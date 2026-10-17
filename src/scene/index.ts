import { z } from 'zod';
import testGroveJson from '../../content/rooms/test-grove.json' with { type: 'json' };
import woodHatchJson from '../../content/rooms/wood-hatch.json' with { type: 'json' };
import worldJson from '../../content/world.json' with { type: 'json' };
import { ABILITIES } from '../sim/abilities';
import { defaultTuning } from '../sim/tuning';
import type { Room } from './room';

/**
 * The room registry. Each room is one JSON file in content/rooms/<id>.json (sim px, see
 * memory/scene-and-units.md and memory/rooms.md), validated here once at import and shared by the
 * sim, the renderers and the tools. content/world.json says which rooms are the real game and where
 * a new game starts; `test-grove` (the old demo level) is a test bed outside it. No Pixi or DOM in
 * this file, so Node tools and tests can import it. A new room: its JSON file plus one line in `FILES`.
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
    edgeKick: z.boolean().optional(),
    solids: z.array(
      z.object({
        tag: TAG,
        x: int,
        y: int,
        w: int.positive(),
        h: int.positive(),
        kick: z.union([z.boolean(), z.literal('east'), z.literal('west')]).optional(),
      }),
    ),
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
              radius: int.min(40).max(2000).optional(),
              hp: int.min(1).max(12).optional(),
              fenced: z.boolean().optional(),
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
              hp: int.min(1).max(12).optional(),
              sight: int.min(60).max(900).optional(),
            })
            .strict(),
        ]),
      )
      .default([]),
    lanterns: z
      .array(
        z
          .object({
            id: z.string().min(1),
            x: int,
            y: int,
            cost: int.min(0).max(99).optional(),
            key: z.string().min(1).optional(),
          })
          .strict(),
      )
      .default([]),
    lamps: z
      .array(
        z.object({ id: z.string().min(1), x: int, y: int, cost: int.min(0).max(99).optional() }).strict(),
      )
      .default([]),
    heart: z.object({ x: int, y: int }).strict().optional(),
    // --- Rooms (memory/rooms.md).
    title: z.string().optional(),
    region: z.string().optional(),
    abilities: z.array(z.enum(ABILITIES)).optional(),
    exits: z
      .array(
        z
          .object({
            id: z.string().min(1),
            edge: z.enum(['n', 's', 'e', 'w']),
            from: int,
            to: int,
            at: int.optional(),
          })
          .strict(),
      )
      .optional(),
    catches: z
      .array(
        z.object({ id: z.string().min(1), x: int, y: int, w: int.positive(), h: int.positive() }).strict(),
      )
      .optional(),
    hatch: z.object({ x: int, y: int }).strict().optional(),
    art: z
      .object({
        kit: z.enum(['grove', 'wood']),
        seed: int,
        moon: z.object({ x: z.number(), y: z.number(), r: z.number().positive() }).strict().optional(),
        afterglow: z
          .object({ x: z.number(), y: z.number(), strength: z.number().min(0).max(1) })
          .strict()
          .optional(),
        moods: z.array(z.object({ x: int, mood: z.enum(['cool', 'warm', 'deep']) }).strict()).optional(),
        anchorY: int.optional(),
        anchorX: int.optional(),
      })
      .strict()
      .optional(),
    marks: z
      .object({
        cocoons: z
          .array(
            z
              .object({
                id: z.string().min(1),
                x: int,
                y: int,
                len: int.positive(),
                state: z.enum(['split', 'closed']),
              })
              .strict(),
          )
          .optional(),
        tatter: z
          .object({ x: int, y: int, facing: z.union([z.literal(-1), z.literal(1)]) })
          .strict()
          .optional(),
        swarm: z.array(z.tuple([z.number(), z.number()])).optional(),
        promise: z.object({ x0: int, x1: int, y: int }).strict().optional(),
        trees: z
          .array(
            z
              .object({
                id: z.string().min(1),
                x: int,
                w: int.positive(),
                top: int,
                bottom: int,
                plane: z.enum(['walk', 'back']),
                solid: z.boolean().optional(),
              })
              .strict(),
          )
          .optional(),
        stretches: z
          .array(
            z
              .object({
                id: z.string().min(1),
                x0: int,
                x1: int,
                parent: z.string().min(1),
                from: z.tuple([int, int]),
                grows: z.enum(['east', 'west']),
                end: z.enum(['burl', 'knee', 'fork', 'snap', 'trunk', 'tip']),
              })
              .strict(),
          )
          .optional(),
        farBranch: z
          .object({
            points: z.array(z.tuple([z.number(), z.number()])).min(2),
            width: z.number().positive(),
            tipWidth: z.number().positive().optional(),
            tree: z.string().optional(),
          })
          .strict()
          .optional(),
        drop: z.object({ x: int, y: int }).strict().optional(),
        camera: z
          .array(
            z
              .object({
                id: z.string().min(1),
                x: z.number(),
                y: z.number(),
                zoom: z.number().positive().optional(),
                note: z.string().optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict()
      .optional(),
    camera: z
      .object({
        anchorY: z.number().min(0.3).max(0.9).optional(),
        lookaheadX: z.number().min(0).optional(),
        fallLookahead: z.number().min(0).optional(),
        smoothYFall: z.number().positive().optional(),
        smoothYFastFall: z.number().positive().optional(),
        realFallPx: z.number().min(0).optional(),
        targetSmoothY: z.number().min(0).optional(),
        leadFrames: z.number().positive().optional(),
        fadeIn: z.number().min(0).max(10).optional(),
        hatchKick: z.number().min(0).max(40).optional(),
        hatchFrame: z
          .object({ y: z.number(), hold: z.number().min(0), out: z.number().positive() })
          .strict()
          .optional(),
        lean: z
          .object({
            x: z.number(),
            y: z.number(),
            from: z.number().min(0),
            in: z.number().positive(),
            hold: z.number().min(0),
            out: z.number().positive(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    shots: z
      .object({
        wide: z.array(z.object({ name: z.string().min(1), x: int, y: int }).strict()),
        closeup: z
          .object({
            ground: z.tuple([int, int]),
            idle: z.tuple([int, int]).optional(),
            wall: z.tuple([int, int]).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** No lantern stands closer to the spawn point than this (foot to feet). */
export const LANTERN_SPAWN_CLEAR = 300;

/** A wayside lamp keeps this far (foot to foot, on the same ground) from every lantern and other lamp. */
export const LAMP_CLEAR = 160;

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

export function parseScene(json: unknown): Room {
  const s = SceneSchema.parse(json);
  // Exits: open spans along an edge, inside it, not overlapping another on the same edge.
  const exitIds = new Set<string>();
  for (const e of s.exits ?? []) {
    if (exitIds.has(e.id)) throw new Error(`Scene "${s.id}": two exits are called "${e.id}"`);
    exitIds.add(e.id);
    const len = e.edge === 'n' || e.edge === 's' ? s.width : s.height;
    if (e.from < 0 || e.to > len || e.from >= e.to)
      throw new Error(`Scene "${s.id}": exit "${e.id}" is not a span of its edge (0..${len})`);
    for (const o of s.exits ?? [])
      if (o !== e && o.edge === e.edge && o.from < e.to && e.from < o.to)
        throw new Error(`Scene "${s.id}": exits "${e.id}" and "${o.id}" overlap`);
  }
  for (const c of s.catches ?? []) {
    if (exitIds.has(c.id))
      throw new Error(`Scene "${s.id}": an exit and a catch zone are both called "${c.id}"`);
    exitIds.add(c.id);
    if (c.x < 0 || c.y < 0 || c.x + c.w > s.width || c.y + c.h > s.height)
      throw new Error(`Scene "${s.id}": catch zone "${c.id}" leaves the scene bounds`);
    const sp = s.spawn;
    if (sp.x >= c.x && sp.x < c.x + c.w && sp.y - 40 >= c.y && sp.y - 40 < c.y + c.h)
      throw new Error(`Scene "${s.id}": the spawn is inside catch zone "${c.id}"`);
  }
  if (
    s.hatch &&
    (s.hatch.x < 0 || s.hatch.x > s.width || s.hatch.y < (s.ceilingY ?? 0) || s.hatch.y > s.height)
  )
    throw new Error(`Scene "${s.id}": the hatch (the cocoon) is outside the scene`);
  for (const stop of s.shots?.wide ?? []) {
    if (stop.x < 0 || stop.x > s.width || stop.y < (s.ceilingY ?? 0) || stop.y > s.height)
      throw new Error(`Scene "${s.id}": shot stop "${stop.name}" is outside the scene`);
  }
  for (const r of s.solids) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > s.width || r.y + r.h > s.height)
      throw new Error(`Scene "${s.id}": solid at (${r.x}, ${r.y}) leaves the scene bounds`);
  }
  const seen = new Set<string>();
  for (const p of s.pickups) {
    if (seen.has(p.id)) throw new Error(`Scene "${s.id}": two pickups are called "${p.id}"`);
    seen.add(p.id);
    // Under the canopy counts as inside: the air above the scene's top is hers up to `ceilingY`.
    if (p.x <= 0 || p.y <= Math.min(0, (s.ceilingY ?? 0) + 40) || p.x >= s.width || p.y >= s.height)
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
    if (l.key !== undefined && !s.pickups.some((p) => p.id === l.key && p.kind === 'great'))
      throw new Error(
        `Scene "${s.id}": lantern "${l.id}" needs "${l.key}", which is not a great glint of the scene`,
      );
  }
  // Wayside lamps: placed like lanterns, and never crowding one (their trigger boxes stay apart).
  for (const l of s.lamps) {
    if (seen.has(l.id)) throw new Error(`Scene "${s.id}": two things are called "${l.id}"`);
    seen.add(l.id);
    stands(`lamp "${l.id}"`, l, G.lanternWidth, G.lanternHeight);
    const dx = l.x - s.spawn.x;
    const dy = l.y - s.spawn.y;
    if (dx * dx + dy * dy < LANTERN_SPAWN_CLEAR * LANTERN_SPAWN_CLEAR)
      throw new Error(`Scene "${s.id}": lamp "${l.id}" is too close to the spawn point`);
    for (const o of [...s.lanterns, ...s.lamps]) {
      if (o !== l && o.y === l.y && Math.abs(o.x - l.x) < LAMP_CLEAR)
        throw new Error(`Scene "${s.id}": lamp "${l.id}" crowds "${o.id}"`);
    }
  }
  if (s.heart) {
    stands('the heart', s.heart, G.heartWidth, G.heartHeight);
    if (s.lanterns.length === 0) throw new Error(`Scene "${s.id}": a heart needs lanterns to wake it`);
    const hb = { x0: s.heart.x - G.heartWidth / 2, x1: s.heart.x + G.heartWidth / 2 };
    for (const l of [...s.lanterns, ...s.lamps]) {
      if (l.y === s.heart.y && l.x + G.lanternWidth / 2 > hb.x0 && l.x - G.lanternWidth / 2 < hb.x1)
        throw new Error(`Scene "${s.id}": lantern "${l.id}" stands in the heart`);
    }
  }
  return s;
}

const FILES: readonly unknown[] = [woodHatchJson, testGroveJson];

/** Every room, by id. */
export const ROOMS: Readonly<Record<string, Room>> = Object.fromEntries(
  FILES.map((json) => {
    const room = parseScene(json);
    return [room.id, room];
  }),
);

const WorldSchema = z
  .object({
    start: z.string(),
    rooms: z.array(z.object({ id: z.string(), x: int, y: int }).strict()),
    tests: z.array(z.string()),
  })
  .strict();

/**
 * content/world.json: the real game's rooms (world placement in px, for exits and the map later),
 * the room a new game starts in, and the test rooms outside the world.
 */
export const WORLD = WorldSchema.parse(worldJson);
for (const id of [WORLD.start, ...WORLD.rooms.map((r) => r.id), ...WORLD.tests])
  if (!ROOMS[id])
    throw new Error(`content/world.json names room "${id}", which has no file in content/rooms/`);

/** Every room id: the real game's rooms first, then the test rooms. */
export const ROOM_IDS: readonly string[] = [...WORLD.rooms.map((r) => r.id), ...WORLD.tests];

/** The room the page boots into without `?room=`. */
export const DEFAULT_ROOM: string = WORLD.start;

/** A room by id; throws, naming the rooms there are, if there is none. */
export function getRoom(id: string): Room {
  const room = ROOMS[id];
  if (!room) throw new Error(`Unknown room "${id}". Rooms: ${ROOM_IDS.join(', ')}.`);
  return room;
}

/** The test grove (the old demo level): the Grove's tests and pilots run against it. */
export const GROVE: Room = getRoom('test-grove');

/** Scene 1, the hatching branch. */
export const WOOD_HATCH: Room = getRoom('wood-hatch');
