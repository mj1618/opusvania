import { z } from 'zod';
import brGloamJson from '../../content/rooms/br-gloam.json' with { type: 'json' };
import brHubJson from '../../content/rooms/br-hub.json' with { type: 'json' };
import brMantisJson from '../../content/rooms/br-mantis.json' with { type: 'json' };
import brWeaverJson from '../../content/rooms/br-weaver.json' with { type: 'json' };
import labCreaturesJson from '../../content/rooms/lab-creatures.json' with { type: 'json' };
import labFeelJson from '../../content/rooms/lab-feel.json' with { type: 'json' };
import labKitJson from '../../content/rooms/lab-kit.json' with { type: 'json' };
import labLampsJson from '../../content/rooms/lab-lamps.json' with { type: 'json' };
import labWeaverJson from '../../content/rooms/lab-weaver.json' with { type: 'json' };
import labWorldAJson from '../../content/rooms/lab-world-a.json' with { type: 'json' };
import labWorldBJson from '../../content/rooms/lab-world-b.json' with { type: 'json' };
import labWorldCJson from '../../content/rooms/lab-world-c.json' with { type: 'json' };
import lrCacheJson from '../../content/rooms/lr-cache.json' with { type: 'json' };
import lrHallJson from '../../content/rooms/lr-hall.json' with { type: 'json' };
import lrNightJson from '../../content/rooms/lr-night.json' with { type: 'json' };
import lrRootsJson from '../../content/rooms/lr-roots.json' with { type: 'json' };
import testGroveJson from '../../content/rooms/test-grove.json' with { type: 'json' };
import woodBurrowJson from '../../content/rooms/wood-burrow.json' with { type: 'json' };
import woodCanopyJson from '../../content/rooms/wood-canopy.json' with { type: 'json' };
import woodChaseJson from '../../content/rooms/wood-chase.json' with { type: 'json' };
import woodGladeJson from '../../content/rooms/wood-glade.json' with { type: 'json' };
import woodGlidewalkJson from '../../content/rooms/wood-glidewalk.json' with { type: 'json' };
import woodHatchJson from '../../content/rooms/wood-hatch.json' with { type: 'json' };
import woodHawkersJson from '../../content/rooms/wood-hawkers.json' with { type: 'json' };
import woodHollowJson from '../../content/rooms/wood-hollow.json' with { type: 'json' };
import woodRootroadJson from '../../content/rooms/wood-rootroad.json' with { type: 'json' };
import woodRootshaftJson from '../../content/rooms/wood-rootshaft.json' with { type: 'json' };
import woodSilkJson from '../../content/rooms/wood-silk.json' with { type: 'json' };
import woodWellJson from '../../content/rooms/wood-well.json' with { type: 'json' };
import woodWicksJson from '../../content/rooms/wood-wicks.json' with { type: 'json' };
import worldJson from '../../content/world.json' with { type: 'json' };
import bossrushJson from '../../content/worlds/demo-bossrush.json' with { type: 'json' };
import downwoodJson from '../../content/worlds/downwood.json' with { type: 'json' };
import downwoodRoomsJson from '../../content/worlds/downwood-rooms.json' with { type: 'json' };
import proto1Json from '../../content/worlds/proto-1.json' with { type: 'json' };
import { ABILITIES } from '../sim/abilities';
import { defaultTuning } from '../sim/tuning';
import { UPGRADE_IDS } from '../sim/upgrades';
import { BOSS, bossNodes, checkBoss } from './boss';
import { checkCreatures, ENEMIES, SENSES } from './creatures';
import { CAMERA_ZONES, checkKit, KIT_FIELDS, kitNodes, ROUTE_FLAGS, SWING } from './kit';
import type { Room } from './room';
import { StageSchema } from './stage';

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
    oneWays: z.array(
      z.object({
        tag: TAG,
        x: int,
        y: int,
        w: int.positive(),
        noDrop: z.union([z.boolean(), z.string().min(1)]).optional(),
      }),
    ),
    pickups: z
      .array(
        z
          .object({
            id: z.string().min(1),
            kind: z.enum(['glint', 'great']),
            x: int,
            y: int,
          })
          .strict(),
      )
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
            // A glow pod (Lanternroot): its bud grows back this many frames after it bursts.
            regrow: int.min(60).max(7200).optional(),
          })
          .strict(),
      )
      .default([]),
    // Creatures (src/scene/creatures.ts, memory/creatures.md): how they notice her, and who they are.
    senses: SENSES,
    enemies: ENEMIES,
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
        z
          .object({
            id: z.string().min(1),
            x: int,
            y: int,
            cost: int.min(0).max(99).optional(),
          })
          .strict(),
      )
      .default([]),
    heart: z.object({ x: int, y: int }).strict().optional(),
    lures: z
      .array(
        z
          .object({
            id: z.string().min(1),
            kind: z.enum(['wick', 'lantern', 'ring', 'great', 'moonwick']),
            x: int,
            y: int,
            spin: z.union([z.literal(-1), z.literal(1)]).optional(),
            swing: SWING,
            after: z.string().min(1).optional(),
            relight: int.min(30).max(3600).optional(),
            // Lanternroot: a moonwick that burns for good once kindled; a lamp whose going out sets a flag.
            keep: z.boolean().optional(),
            lit: z.boolean().optional(),
            sets: z.string().min(1).optional(),
            moths: int.min(0).max(500).optional(),
            burn: int.min(60).max(3600).optional(),
          })
          .strict(),
      )
      .optional(),
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
            oneWay: z.boolean().optional(),
          })
          .strict(),
      )
      .optional(),
    catches: z
      .array(
        z
          .object({
            id: z.string().min(1),
            x: int,
            y: int,
            w: int.positive(),
            h: int.positive(),
            glideAssist: int.min(1).max(9).optional(),
            back: z.object({ x: int, y: int }).strict().optional(),
          })
          .strict(),
      )
      .optional(),
    hatch: z.object({ x: int, y: int }).strict().optional(),
    reform: z.object({ x: int, y: int }).strict().optional(),
    reformPatch: z.boolean().optional(),
    // --- The world (memory/world.md): moon patches, glades, doors, shortcuts, route claims.
    patches: z.array(z.object({ id: z.string().min(1), x: int, y: int }).strict()).optional(),
    glades: z
      .array(
        z
          .object({
            id: z.string().min(1),
            x: int,
            y: int,
            w: int.positive(),
            h: int.positive(),
            ability: z.enum(ABILITIES),
            when: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
    doors: z
      .array(
        z
          .object({
            id: z.string().min(1),
            x: int,
            y: int,
            to: z.string().regex(/^[^#]+#[^#]+$/),
          })
          .strict(),
      )
      .optional(),
    shortcuts: z
      .array(
        z
          .object({
            id: z.string().min(1),
            x: int,
            y: int,
            w: int.positive(),
            h: int.positive(),
            opens: z.enum(['n', 's', 'e', 'w']),
          })
          .strict(),
      )
      .optional(),
    routes: z
      .array(
        z
          .object({
            from: z.string().min(1),
            to: z.string().min(1),
            needs: z.array(z.enum(ABILITIES)).optional(),
            oneWay: z.boolean().optional(),
            door: z.string().min(1).optional(),
            flags: ROUTE_FLAGS,
            // Lanternroot's solver: wicks the way needs burning, lamps it spends, upgrades it needs.
            light: z.array(z.string().min(1)).optional(),
            lamps: z.array(z.string().min(1)).optional(),
            upgrades: z.array(z.enum(UPGRADE_IDS)).optional(),
            // Story flags this way sets (a puzzle solved on it: a set burned, a cap answered).
            sets: z.array(z.string().min(1)).optional(),
          })
          .strict(),
      )
      .optional(),
    // --- The level kit (src/scene/kit.ts, memory/level-kit.md).
    ...KIT_FIELDS,
    // --- Lanternroot's light economy (src/sim/light.ts, memory/glow.md): glow, mend, kindle, gust.
    glow: z.boolean().optional(),
    // --- A boss fight (src/scene/boss.ts, memory/bosses.md).
    boss: BOSS,
    art: z
      .object({
        // `greybox`: flat shapes and labels instead of the painted layers (src/render/greybox, memory/greybox.md).
        mode: z.enum(['painted', 'greybox']).optional(),
        labels: z.boolean().optional(),
        kit: z.enum(['grove', 'wood', 'lanternroot']).optional(),
        // Lanternroot's layer (render: room-look.ts): the night crown, the lamp hall, the black roots, the cache.
        band: z.enum(['night', 'hall', 'roots', 'cache']).optional(),
        seed: int.optional(),
        moon: z.object({ x: z.number(), y: z.number(), r: z.number().positive() }).strict().optional(),
        afterglow: z
          .object({
            x: z.number(),
            y: z.number(),
            strength: z.number().min(0).max(1),
          })
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
          .object({
            x: int,
            y: int,
            facing: z.union([z.literal(-1), z.literal(1)]),
            want: z.tuple([int, int]).optional(),
            when: z.string().min(1).optional(),
            until: z.string().min(1).optional(),
          })
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
        notes: z.array(z.object({ x: int, y: int, text: z.string().min(1) }).strict()).optional(),
        // Lanternroot (render and tools; src/scene/room.ts `RoomMarks`).
        covers: z
          .array(
            z
              .object({
                id: z.string().min(1),
                x: int,
                y: int,
                w: int.positive(),
                h: int.positive(),
                opens: z.string().min(1).optional(),
              })
              .strict(),
          )
          .optional(),
        calm: z.array(z.object({ x: int, y: int, w: int.positive(), h: int.positive() }).strict()).optional(),
        landmarks: z
          .array(
            z
              .object({
                id: z.string().min(1),
                kind: z.string().min(1),
                x: int,
                y: int,
                w: int.positive().optional(),
                h: int.positive().optional(),
              })
              .strict(),
          )
          .optional(),
        moonholes: z.array(z.object({ x: int, y: int }).strict()).optional(),
        places: z
          .array(z.object({ id: z.string().min(1), x: int, y: int, note: z.string().optional() }).strict())
          .optional(),
        chambers: z
          .array(
            z
              .object({ id: z.string().min(1), x: int, y: int, w: int.positive(), h: int.positive() })
              .strict(),
          )
          .optional(),
        stage: StageSchema.optional(),
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
          .object({
            y: z.number(),
            hold: z.number().min(0),
            out: z.number().positive(),
          })
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
        zones: CAMERA_ZONES,
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

export {
  ENEMY_SPAWN_CLEAR,
  LAMPWING_PRIZE_CLEAR,
  LAMPWING_SPAWN_CLEAR,
} from './creatures';

/** A hanging pod's stem: the underside or branch it hangs from is at most this far above its top. */
export const POD_HANG_MAX = 160;

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
  // Creatures (src/scene/creatures.ts): placement per kind, lamps they guard, webs and weavers.
  checkCreatures(s, seen);
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
    const hb = {
      x0: s.heart.x - G.heartWidth / 2,
      x1: s.heart.x + G.heartWidth / 2,
    };
    for (const l of [...s.lanterns, ...s.lamps]) {
      if (l.y === s.heart.y && l.x + G.lanternWidth / 2 > hb.x0 && l.x - G.lanternWidth / 2 < hb.x1)
        throw new Error(`Scene "${s.id}": lantern "${l.id}" stands in the heart`);
    }
  }
  // Lures: the flame in open air (its core clear of solids), inside the room, ids unique.
  const L = defaultTuning.lures;
  for (const l of s.lures ?? []) {
    if (seen.has(l.id)) throw new Error(`Scene "${s.id}": two things are called "${l.id}"`);
    seen.add(l.id);
    const c = L.kinds[l.kind].core;
    if (l.x - c < 0 || l.x + c > s.width || l.y - c < (s.ceilingY ?? 0) || l.y + c > s.height)
      throw new Error(`Scene "${s.id}": lure "${l.id}" is outside the scene`);
    if (s.solids.some((q) => l.x + c > q.x && l.x - c < q.x + q.w && l.y + c > q.y && l.y - c < q.y + q.h))
      throw new Error(`Scene "${s.id}": lure "${l.id}" has a solid inside its core`);
  }
  // The world's things (memory/world.md): ids unique among everything in the room.
  const P = defaultTuning.patch;
  for (const pt of s.patches ?? []) {
    if (seen.has(pt.id) || exitIds.has(pt.id))
      throw new Error(`Scene "${s.id}": two things are called "${pt.id}"`);
    seen.add(pt.id);
    stands(`moon patch "${pt.id}"`, pt, P.width, P.height);
  }
  for (const g of s.glades ?? []) {
    if (seen.has(g.id) || exitIds.has(g.id))
      throw new Error(`Scene "${s.id}": two things are called "${g.id}"`);
    seen.add(g.id);
    if (g.x < 0 || g.y < (s.ceilingY ?? 0) || g.x + g.w > s.width || g.y + g.h > s.height)
      throw new Error(`Scene "${s.id}": glade "${g.id}" leaves the scene bounds`);
  }
  const D = defaultTuning.room;
  for (const d of s.doors ?? []) {
    if (seen.has(d.id) || exitIds.has(d.id))
      throw new Error(`Scene "${s.id}": two things are called "${d.id}"`);
    seen.add(d.id);
    stands(`door "${d.id}"`, d, D.doorWidth, D.doorHeight);
  }
  for (const c of s.shortcuts ?? []) {
    if (seen.has(c.id) || exitIds.has(c.id))
      throw new Error(`Scene "${s.id}": two things are called "${c.id}"`);
    seen.add(c.id);
    if (c.x < 0 || c.y < 0 || c.x + c.w > s.width || c.y + c.h > s.height)
      throw new Error(`Scene "${s.id}": shortcut "${c.id}" leaves the scene bounds`);
  }
  checkKit(s, seen);
  checkBoss(s, seen);
  // Route claims name things of this room ('spawn' too); `door` names a shortcut.
  const nodes = new Set<string>([
    'spawn',
    ...(s.exits ?? []).map((e) => e.id),
    ...(s.doors ?? []).map((d) => d.id),
    ...(s.patches ?? []).map((p) => p.id),
    ...(s.glades ?? []).map((g) => g.id),
    ...kitNodes(s),
    ...bossNodes(s),
    // (Lanternroot: the solver's places.)
    ...(s.marks?.places ?? []).map((p) => p.id),
  ]);
  for (const r of s.routes ?? []) {
    for (const end of [r.from, r.to])
      if (!nodes.has(end))
        throw new Error(
          `Scene "${s.id}": a route names "${end}", which is no exit, door, patch or glade of the room`,
        );
    if (r.door !== undefined && !(s.shortcuts ?? []).some((c) => c.id === r.door))
      throw new Error(`Scene "${s.id}": a route passes "${r.door}", which is no shortcut of the room`);
  }
  if (s.art && s.art.mode !== 'greybox' && (s.art.kit === undefined || s.art.seed === undefined))
    throw new Error(`Scene "${s.id}": a painted room's art needs a kit and a seed`);
  return s;
}

const FILES: readonly unknown[] = [
  woodHatchJson,
  woodChaseJson,
  woodWicksJson,
  woodBurrowJson,
  woodGladeJson,
  woodGlidewalkJson,
  woodHollowJson,
  woodCanopyJson,
  woodHawkersJson,
  woodSilkJson,
  woodWellJson,
  woodRootshaftJson,
  woodRootroadJson,
  labWorldAJson,
  labWorldBJson,
  labWorldCJson,
  testGroveJson,
  labLampsJson,
  labFeelJson,
  labKitJson,
  labCreaturesJson,
  labWeaverJson,
  // Lanternroot (docs/design/levels/proto-1.md): its own world, content/worlds/proto-1.json.
  lrNightJson,
  lrHallJson,
  lrRootsJson,
  lrCacheJson,
  // The boss rush demo (docs/design/demos/bossrush.md): its own world, content/worlds/demo-bossrush.json.
  brHubJson,
  brWeaverJson,
  brGloamJson,
  brMantisJson,
  // The Downwood (docs/design/places/1-downwood.md, memory/downwood.md): its own world, content/worlds/downwood.json;
  // its 46 rooms are one generated file (tools/levels/downwood.ts).
  ...(downwoodRoomsJson as unknown[]),
];

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
    // Areas (world.md §2.2): which placed rooms each area holds (a moth-stone draws its area: memory/level-kit.md).
    areas: z.array(z.object({ id: z.string().min(1), rooms: z.array(z.string()) }).strict()).default([]),
  })
  .strict();

/**
 * content/world.json: the real game's rooms (world placement in px: exits link where neighbours'
 * openings meet, the map draws from it; memory/world.md), the room a new game starts in, and the
 * test rooms outside the world. The linked world and its check: src/scene/world.ts.
 */
export const WORLD = WorldSchema.parse(worldJson);
for (const id of [WORLD.start, ...WORLD.rooms.map((r) => r.id), ...WORLD.tests])
  if (!ROOMS[id])
    throw new Error(`content/world.json names room "${id}", which has no file in content/rooms/`);

/** A world file: content/world.json (the game) or one of content/worlds/<id>.json (a prototype level's own). */
export type WorldFile = z.infer<typeof WorldSchema>;

/**
 * Every world, by id: `game` (content/world.json) and the prototype levels' own worlds (content/worlds/<id>.json,
 * booted with `?world=<id>`: memory/lanternroot.md). Each is linked and checked on its own.
 */
export const WORLD_FILES: Readonly<Record<string, WorldFile>> = {
  game: WORLD,
  'proto-1': WorldSchema.parse(proto1Json),
  'demo-bossrush': WorldSchema.parse(bossrushJson),
  downwood: WorldSchema.parse(downwoodJson),
};
for (const [wid, w] of Object.entries(WORLD_FILES))
  for (const id of [w.start, ...w.rooms.map((r) => r.id), ...w.tests])
    if (!ROOMS[id]) throw new Error(`world "${wid}" names room "${id}", which has no file in content/rooms/`);

/** The world a room belongs to (the first world file that places it), else `game`. */
export function worldIdOf(room: string): string {
  for (const [wid, w] of Object.entries(WORLD_FILES)) if (w.rooms.some((r) => r.id === room)) return wid;
  return 'game';
}

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
