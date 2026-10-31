import { z } from 'zod';
import { defaultTuning } from '../sim/tuning';
import { UPGRADE_IDS } from '../sim/upgrades';

/**
 * The level kit's room data (memory/level-kit.md): the Zod shapes `parseScene` (src/scene/index.ts)
 * spreads into the room schema, and the placement rules it runs (`checkKit`). Sim side: src/sim/kit.ts,
 * src/sim/paths.ts; render: src/render/greybox/kit.ts, src/render/camera/zones.ts.
 */

const int = z.number().int();
const id = z.string().min(1);
const rect = { id, x: int, y: int, w: int.positive(), h: int.positive() };
const kick = z.union([z.boolean(), z.literal('east'), z.literal('west')]).optional();

/** Fields of a room: thorns, seed-cases, rotten bark, flag gates, triggers. */
export const KIT_FIELDS = {
  thorns: z.array(z.object(rect).strict()).optional(),
  seedCases: z.array(z.object({ id, x: int, y: int }).strict()).optional(),
  bark: z
    .array(
      z
        .object({
          ...rect,
          floor: z.boolean().optional(),
          hp: int.min(1).max(9).optional(),
          kick,
          // Lanternroot: heartwood, not rotten (the blade clangs; only a burrback's ram breaks it).
          heartwood: z.boolean().optional(),
        })
        .strict(),
    )
    .optional(),
  gates: z.array(z.object({ ...rect, flag: id, shut: id.optional(), kick }).strict()).optional(),
  triggers: z
    .array(
      z
        .object({
          ...rect,
          sets: id,
          hold: int.min(1).max(600).optional(),
          finale: z.boolean().optional(),
          endSets: id.optional(),
          rearm: z.boolean().optional(),
        })
        .strict()
        // journey.md's rule: a held beat is at most 3 s, except the one marked `finale`.
        .refine((tr) => (tr.hold ?? 0) <= 180 || tr.finale === true, {
          message: 'a hold over 180 frames must be the finale',
        }),
    )
    .optional(),
  caps: z
    .array(
      z
        .object({
          ...rect,
          tier: z.enum(['small', 'mid', 'big']).optional(),
          height: int.min(64).max(2000).optional(),
          kick,
        })
        .strict(),
    )
    .optional(),
  // --- The firefly's passes and the freed moths' roosts (the Canopy r10, src/sim/firefly.ts).
  fireflies: z
    .array(
      z
        .object({
          id,
          trigger: z.object({ x: int, y: int, w: int.positive(), h: int.positive() }).strict().optional(),
          flag: id,
          path: z.array(z.tuple([int, int])).min(2),
          frames: int.min(30).max(1200),
          relights: z.array(id).optional(),
          // The Canopy r11: started by her first fling off one of these lamps, or by a story flag; a stop that hangs
          // a cage (`sets` lights an `after` lamp), a held beat on its start, a camera hook for render.
          onFling: z.array(id).optional(),
          onFlag: id.optional(),
          hang: z
            .object({ point: int.min(0), frames: int.min(1).max(600), sets: id.optional() })
            .strict()
            .optional(),
          hold: int.min(1).max(180).optional(),
          look: z
            .object({
              x: int,
              y: int,
              zoom: z.number().positive().optional(),
              from: int.min(0),
              to: int.min(1),
            })
            .strict()
            .optional(),
          chase: z
            .object({
              lead: z.tuple([int.min(0), int.min(1)]),
              kindles: z.array(id),
              waits: z.array(int.min(0)),
              end: z.tuple([int, int]),
              needs: id.optional(),
              rests: z.array(id).optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
    )
    .optional(),
  sits: z
    .array(
      z
        .object({
          id,
          x: int,
          y: int,
          r: int.positive(),
          frames: int.min(1).max(600),
          when: id.optional(),
          sets: id,
        })
        .strict(),
    )
    .optional(),
  roosts: z.array(z.object({ ...rect, lure: id, leaves: id.optional() }).strict()).optional(),
  // --- The Canopy r14, moment 7: the full escape (src/sim/escape.ts).
  escape: z
    .object({
      id,
      after: id,
      sets: id,
      area: z.object({ x: int, y: int, w: int.positive(), h: int.positive() }).strict(),
      end: z.object({ x: int, y: int, w: int.positive(), h: int.positive() }).strict().optional(),
      next: id.optional(),
      breaks: z.array(id).optional(),
      path: z.array(z.tuple([int, int])).min(2),
      checkpoints: z
        .array(
          z
            .object({
              id,
              x: int,
              y: int,
              at: z.object({ x: int, y: int, w: int.positive(), h: int.positive() }).strict(),
            })
            .strict(),
        )
        .min(1),
      rocks: z.array(
        z
          .object({
            id,
            x: int,
            w: int.positive(),
            y0: int,
            y1: int,
            when: z.object({ x: int, y: int, w: int.positive(), h: int.positive() }).strict(),
            tell: int.min(1).max(240),
            cp: int.min(0),
          })
          .strict(),
      ),
      front: z
        .object({
          x0: int,
          x1: int,
          y0: int,
          top: int,
          lag: int.positive(),
          near: int.positive(),
          speed: z.number().positive(),
          creep: z.number().min(0),
          start: z.object({ x: int, y: int, w: int.positive(), h: int.positive() }).strict().optional(),
        })
        .strict()
        .optional(),
    })
    .strict()
    .optional(),
  // --- The Canopy r15 (src/sim/quiet.ts): quiet moments on a story flag (the vista).
  quiet: z
    .array(
      z
        .object({
          id,
          flag: id,
          frames: int.min(1).max(1200),
          air: z.object({ x: int, y: int, w: int.positive(), h: int.positive() }).strict().optional(),
        })
        .strict(),
    )
    .optional(),
  // --- Finds (src/sim/finds.ts).
  mothStones: z.array(z.object({ id, x: int, y: int, area: id }).strict()).optional(),
  signs: z
    .array(
      z
        .object({
          id,
          x: int,
          y: int,
          flag: id.optional(),
          rhythm: z
            .string()
            .regex(/^[.-]+$/)
            .optional(),
        })
        .strict(),
    )
    .optional(),
  hollows: z.array(z.object({ ...rect, upgrade: z.enum(UPGRADE_IDS) }).strict()).optional(),
  moonseeds: z.array(z.object({ id, x: int, y: int }).strict()).optional(),
  // --- Lanternroot's light pieces (src/sim/light.ts, memory/glow.md).
  moonmoss: z.array(z.object({ ...rect, oneWay: z.boolean().optional() }).strict()).optional(),
  wickSets: z.array(z.object({ id, wicks: z.array(id).min(2), sets: id }).strict()).optional(),
  bells: z
    .array(
      z
        .object({
          id,
          x: int,
          y: int,
          rhythm: z.string().regex(/^[.-]+$/),
          sets: id,
          dark: z.boolean().optional(),
        })
        .strict(),
    )
    .optional(),
};

/** A lure's `swing` (src/sim/paths.ts). */
export const SWING = z
  .object({
    length: int.min(64).max(2000),
    reach: int.min(0).max(1200).optional(),
    period: int.min(30).max(1200).optional(),
    phase: z.number().min(0).max(1).optional(),
  })
  .strict()
  .optional();

/**
 * `camera.zones` (render-only, src/render/camera/zones.ts): while her body centre is inside the rect the
 * view eases to `zoom` (or, with `fit`, the zoom that puts the whole frame inside the 16:9 safe area of
 * every window) and keeps inside `bounds` (with `lock`, the zone's own rect: a view at least that big
 * centres on it).
 */
export const CAMERA_ZONES = z
  .array(
    z
      .object({
        ...rect,
        zoom: z.number().min(0.5).max(2).optional(),
        fit: z.boolean().optional(),
        lock: z.boolean().optional(),
        bounds: z.object({ x: int, y: int, w: int.positive(), h: int.positive() }).strict().optional(),
        /** Only until this story flag is saved (the den's close frame lets go once the beetle is down). */
        until: z.string().min(1).optional(),
        /** Only once this story flag is saved (the Canopy r13: the crown's sit with the kin, `crown-sit`). */
        after: z.string().min(1).optional(),
        /**
         * The Canopy r14: the view's centre leans `k` (0..1) of the way from her to (`x`, `y`) (the den's `den-end`: the
         * fallen cage after the kill; the crown's `crown-sit`: the pair and the moon). Render's camera reads it.
         */
        lean: z
          .object({ x: int, y: int, k: z.number().min(0).max(1) })
          .strict()
          .optional(),
        /**
         * The Canopy r15 (review r14 #1): the view's centre sits this many px under her (the escape: the collapse front
         * in the frame's lower part, 200-260 px under her feet). Render's camera reads it.
         */
        below: int.min(0).max(600).optional(),
        /** Frames the view takes to slide into this zone (Lanternroot's chambers: 20; default the camera's own). */
        frames: int.min(1).max(120).optional(),
      })
      .strict(),
  )
  .optional();

/** A route claim's `flags`: story flags that must be set to pass (the world check, src/scene/world.ts). */
export const ROUTE_FLAGS = z.array(id).optional();

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface KitRoom {
  id: string;
  width: number;
  height: number;
  ceilingY?: number | undefined;
  spawn: { x: number; y: number };
  solids: Box[];
  thorns?: Array<Box & { id: string }> | undefined;
  seedCases?: Array<{ id: string; x: number; y: number }> | undefined;
  bark?: Array<Box & { id: string }> | undefined;
  gates?: Array<Box & { id: string; flag: string }> | undefined;
  triggers?:
    | Array<
        Box & {
          id: string;
          sets: string;
          hold?: number | undefined;
          finale?: boolean | undefined;
          endSets?: string | undefined;
        }
      >
    | undefined;
  caps?: Array<Box & { id: string }> | undefined;
  mothStones?: Array<{ id: string; x: number; y: number }> | undefined;
  signs?: Array<{ id: string; x: number; y: number }> | undefined;
  hollows?: Array<Box & { id: string }> | undefined;
  moonseeds?: Array<{ id: string; x: number; y: number }> | undefined;
  moonmoss?: Array<Box & { id: string }> | undefined;
  wickSets?: Array<{ id: string; wicks: string[]; sets: string }> | undefined;
  bells?: Array<{ id: string; x: number; y: number }> | undefined;
  lures?:
    | Array<{
        id: string;
        kind: 'wick' | 'lantern' | 'ring' | 'great' | 'moonwick';
        keep?: boolean | undefined;
        x: number;
        y: number;
        swing?: { length: number; reach?: number | undefined; period?: number | undefined } | undefined;
      }>
    | undefined;
  camera?: { zones?: Array<Box & { id: string; bounds?: Box | undefined }> | undefined } | undefined;
}

const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The kit's placement rules; `seen` = every id of the room so far (kit ids join it). Throws on a problem. */
export function checkKit(s: KitRoom, seen: Set<string>): void {
  const bad = (msg: string) => {
    throw new Error(`Scene "${s.id}": ${msg}`);
  };
  const named = (x: { id: string }) => {
    if (seen.has(x.id)) bad(`two things are called "${x.id}"`);
    seen.add(x.id);
  };
  const inside = (what: string, r: Box) => {
    if (r.x < 0 || r.y < Math.min(0, s.ceilingY ?? 0) || r.x + r.w > s.width || r.y + r.h > s.height)
      bad(`${what} leaves the scene bounds`);
  };
  // Her body at the spawn (40 x 80 over the feet point).
  const B = defaultTuning.body;
  const spawn = { x: s.spawn.x - B.width / 2, y: s.spawn.y - B.height, w: B.width, h: B.height };
  for (const r of s.thorns ?? []) {
    named(r);
    inside(`thorns "${r.id}"`, r);
    if (hits(r, spawn)) bad(`thorns "${r.id}" touch the spawn`);
  }
  const half = Math.round(defaultTuning.kit.seedCase.size) >> 1;
  for (const c of s.seedCases ?? []) {
    named(c);
    const box = { x: c.x - half, y: c.y - half, w: 2 * half, h: 2 * half };
    inside(`seed-case "${c.id}"`, box);
    if (s.solids.some((q) => hits(q, box))) bad(`seed-case "${c.id}" is inside a solid`);
  }
  for (const b of s.bark ?? []) {
    named(b);
    inside(`bark "${b.id}"`, b);
    if (s.solids.some((q) => hits(q, b))) bad(`bark "${b.id}" overlaps a solid (it is its own solid)`);
    if (hits(b, spawn)) bad(`bark "${b.id}" covers the spawn`);
  }
  for (const g of s.gates ?? []) {
    named(g);
    inside(`gate "${g.id}"`, g);
    if (s.solids.some((q) => hits(q, g))) bad(`gate "${g.id}" overlaps a solid (it is its own solid)`);
    if (hits(g, spawn)) bad(`gate "${g.id}" covers the spawn`);
  }
  for (const t of s.triggers ?? []) {
    named(t);
    inside(`trigger "${t.id}"`, t);
  }
  for (const c of s.caps ?? []) {
    named(c);
    inside(`cap "${c.id}"`, c);
    if (s.solids.some((q) => hits(q, c))) bad(`cap "${c.id}" overlaps a solid (it is its own solid)`);
    if (hits(c, spawn)) bad(`cap "${c.id}" covers the spawn`);
  }
  // Finds: a stone and a sign stand on a top (a solid's or a cap's); a hollow is a rect in the room.
  const tops = [...s.solids, ...(s.caps ?? []), ...(s.bark ?? [])];
  const onTop = (what: string, p: { id: string; x: number; y: number }) => {
    if (!tops.some((q) => q.y === p.y && p.x >= q.x && p.x < q.x + q.w))
      bad(`${what} "${p.id}" does not stand on a top`);
  };
  for (const m of s.mothStones ?? []) {
    named(m);
    onTop('moth-stone', m);
  }
  for (const g of s.signs ?? []) {
    named(g);
    onTop('firefly sign', g);
  }
  for (const h of s.hollows ?? []) {
    named(h);
    inside(`hollow "${h.id}"`, h);
  }
  // A swinging lure: its pivot inside the room and the core clear of solids along the whole arc.
  const L = defaultTuning.lures;
  for (const l of s.lures ?? []) {
    if (!l.swing) continue;
    const len = l.swing.length;
    const reach = Math.min(len * 0.95, l.swing.reach ?? L.swing.reach);
    if (l.y - len < Math.min(0, s.ceilingY ?? 0)) bad(`lure "${l.id}" hangs from above the room`);
    const c = L.kinds[l.kind].core;
    for (let k = -4; k <= 4; k++) {
      const dx = (reach * k) / 4;
      const fx = l.x + dx;
      const fy = l.y - (len - Math.sqrt(len * len - dx * dx));
      const core = { x: fx - c, y: fy - c, w: 2 * c, h: 2 * c };
      if (fx - c < 0 || fx + c > s.width) bad(`lure "${l.id}" swings out of the room`);
      if (s.solids.some((q) => hits(q, core))) bad(`lure "${l.id}" swings into a solid`);
    }
  }
  // Lanternroot: moss inside the room and clear of solids (it is its own solid); sets of the room's moonwicks;
  // bells in the room; `keep` only on a moonwick.
  for (const m of s.moonmoss ?? []) {
    named(m);
    inside(`moonmoss "${m.id}"`, m);
    if (s.solids.some((q) => hits(q, m))) bad(`moonmoss "${m.id}" overlaps a solid`);
  }
  for (const w of s.wickSets ?? []) {
    named(w);
    for (const id of w.wicks)
      if (!(s.lures ?? []).some((l) => l.id === id && l.kind === 'moonwick'))
        bad(`wick set "${w.id}" names "${id}", which is no moonwick of the room`);
  }
  for (const b of s.bells ?? []) {
    named(b);
    if (b.x < 0 || b.x > s.width || b.y < 0 || b.y > s.height) bad(`bell "${b.id}" is outside the scene`);
  }
  for (const l of s.lures ?? [])
    if (l.keep && l.kind !== 'moonwick') bad(`lure "${l.id}" keeps, but is no moonwick`);
  for (const z of s.camera?.zones ?? []) {
    inside(`camera zone "${z.id}"`, z);
    if (z.bounds) inside(`camera zone "${z.id}"'s bounds`, z.bounds);
  }
}

/**
 * The kit's things a route claim can name: triggers (they are where flags come from) and finds (a route
 * can say what reaching one takes; finds never open a way: src/scene/world.ts).
 */
export function kitNodes(s: {
  triggers?: Array<{ id: string }> | undefined;
  mothStones?: Array<{ id: string }> | undefined;
  signs?: Array<{ id: string }> | undefined;
  hollows?: Array<{ id: string }> | undefined;
  moonseeds?: Array<{ id: string }> | undefined;
}): string[] {
  return [...(s.triggers ?? []).map((t) => t.id), ...findIds(s)];
}

/** The ids of a room's finds: its moth-stones, firefly signs, moonlit hollows and moonseeds. */
export function findIds(s: {
  mothStones?: Array<{ id: string }> | undefined;
  signs?: Array<{ id: string }> | undefined;
  hollows?: Array<{ id: string }> | undefined;
  moonseeds?: Array<{ id: string }> | undefined;
}): string[] {
  return [...(s.mothStones ?? []), ...(s.signs ?? []), ...(s.hollows ?? []), ...(s.moonseeds ?? [])].map(
    (f) => f.id,
  );
}
