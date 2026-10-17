import { z } from 'zod';
import { defaultTuning } from '../sim/tuning';

/**
 * Creatures in room JSON (memory/creatures.md, memory/enemies.md): the `enemies` schema (a union on
 * `kind`), the room's `senses`, and the placement checks. An orb web may be authored as an `orb`
 * (hub, radius, spokes, rings, frame lines to what is near), expanded here into plain `strands` so the
 * sim only ever sees segments. No Pixi or DOM: Node tools import it through src/scene/index.ts.
 */

const int = z.number().int();
const facing = z.union([z.literal(-1), z.literal(1)]);
const senses = z.enum(['wallet', 'lamp', 'always']).optional();
/** The lure a lamp-guarder guards (creatures.md §1.2): its lamp snuffed, it disperses. */
const guards = z.string().min(1).optional();
const strand = z.tuple([z.number(), z.number(), z.number(), z.number()]);

/**
 * An orb (wood.md R12): `spokes` from the hub out to radius `r` (`ry` for an oval), `rings` rings
 * between them, and from each spoke's rim end a frame line on along the spoke to the first solid (or
 * the room's edge) within `frame` px: the anchors. `gaps`: sectors (degrees, 0 = east, 90 = down) with
 * no silk (a slack sector already cut). `start`: the first spoke's angle.
 */
const ORB = z
  .object({
    r: int.min(64).max(1600),
    ry: int.min(64).max(1600).optional(),
    spokes: int.min(3).max(32),
    rings: int.min(1).max(12),
    frame: int.min(0).max(2000).optional(),
    start: z.number().optional(),
    gaps: z.array(z.tuple([z.number(), z.number()])).optional(),
  })
  .strict();

const base = {
  id: z.string().min(1),
  x: int,
  y: int,
  facing,
  hp: int.min(1).max(12).optional(),
  guards,
  senses,
  /** A story flag set when it dies (src/sim/kit.ts: the old burrback's root gate). */
  sets: z.string().min(1).optional(),
};

export const ENEMIES = z
  .array(
    z.discriminatedUnion('kind', [
      z
        .object({
          ...base,
          kind: z.literal('burrback'),
          radius: int.min(40).max(2000).optional(),
          windup: int.min(20).max(60).optional(),
          fenced: z.boolean().optional(),
        })
        .strict(),
      z
        .object({
          ...base,
          kind: z.literal('oldBurrback'),
          radius: int.min(40).max(4000).optional(),
          fenced: z.boolean().optional(),
        })
        .strict(),
      z
        .object({
          ...base,
          kind: z.literal('juvenileBurrback'),
          radius: int.min(40).max(2000).optional(),
          fenced: z.boolean().optional(),
        })
        .strict(),
      z
        .object({
          ...base,
          kind: z.literal('lampwing'),
          radius: int.min(0).max(400).optional(),
          sight: int.min(60).max(900).optional(),
        })
        .strict(),
      z
        .object({
          ...base,
          kind: z.literal('hawker'),
          radius: int.min(0).max(400).optional(),
          sight: int.min(60).max(900).optional(),
          orbit: z.string().min(1).optional(),
          period: int.min(90).max(900).optional(),
        })
        .strict(),
      z
        .object({
          ...base,
          kind: z.literal('web'),
          strands: z.array(strand).optional(),
          orb: ORB.optional(),
          anchors: z.array(z.tuple([z.number(), z.number()])).optional(),
        })
        .strict(),
      z
        .object({
          ...base,
          kind: z.literal('weaver'),
          web: z.string().min(1),
        })
        .strict(),
      // The Weaver boss (memory/bosses.md): its fight is the room's `boss` block (src/scene/boss.ts).
      z.object({ ...base, kind: z.literal('weaverBoss') }).strict(),
      // The dangler (memory/creatures.md): `x`, `y` = where its thread is tied; `drop` = its longest drop.
      z.object({ ...base, kind: z.literal('dangler'), drop: int.min(80).max(1200).optional() }).strict(),
    ]),
  )
  .default([]);

/** How the room's creatures notice her: by lamp light unless the room says otherwise (the test grove: `wallet`). */
export const SENSES = z.enum(['wallet', 'lamp']).default('lamp');

/** No enemy starts closer to the spawn point than this (feet to feet). */
export const ENEMY_SPAWN_CLEAR = 300;

/** No lampwing's home is closer to the spawn point than this (home to feet). */
export const LAMPWING_SPAWN_CLEAR = 350;

/**
 * A lampwing's territory keeps this far from every lumen pod and great glint (edge of the territory
 * to the thing's centre), so collecting one never means standing where a hovering lampwing drifts.
 */
export const LAMPWING_PRIZE_CLEAR = 100;

type Rect = { x: number; y: number; w: number; h: number };
type Enemy = z.infer<typeof ENEMIES>[number];
/** What the checks read of a parsed room. */
interface RoomLike {
  id: string;
  width: number;
  height: number;
  ceilingY?: number;
  spawn: { x: number; y: number };
  solids: Rect[];
  oneWays: Array<{ x: number; y: number; w: number }>;
  pods: Array<{ id: string; x: number; y: number }>;
  pickups: Array<{ id: string; kind: string; x: number; y: number }>;
  lures?: Array<{ id: string }>;
  enemies: Enemy[];
}

/** How far along the ray from (x, y) toward (ux, uy) (a unit vector) the first solid or room edge is, up to `max`. */
function rayHit(s: RoomLike, x: number, y: number, ux: number, uy: number, max: number): number {
  let best = max;
  // The room's edges.
  if (ux > 0) best = Math.min(best, (s.width - x) / ux);
  if (ux < 0) best = Math.min(best, -x / ux);
  if (uy > 0) best = Math.min(best, (s.height - y) / uy);
  if (uy < 0) best = Math.min(best, -y / uy);
  for (const r of s.solids) {
    let t0 = 0;
    let t1 = best;
    const axes: Array<[number, number, number, number]> = [
      [x, ux, r.x, r.x + r.w],
      [y, uy, r.y, r.y + r.h],
    ];
    let ok = true;
    for (const [o, d, lo, hi] of axes) {
      if (d === 0) {
        if (o < lo || o > hi) ok = false;
        continue;
      }
      const a = (lo - o) / d;
      const b = (hi - o) / d;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (ok && t0 <= t1 && t0 < best) best = t0;
  }
  return best;
}

const inGap = (deg: number, gaps: ReadonlyArray<[number, number]>): boolean => {
  const a = ((deg % 360) + 360) % 360;
  for (const [g0, g1] of gaps) {
    const lo = ((g0 % 360) + 360) % 360;
    const hi = ((g1 % 360) + 360) % 360;
    if (lo <= hi ? a >= lo && a <= hi : a >= lo || a <= hi) return true;
  }
  return false;
};

/** The strands of an orb web at (x, y) in room `s` (rounded to the pixel; spokes split at each ring). */
export function orbStrands(
  s: RoomLike,
  x: number,
  y: number,
  orb: z.infer<typeof ORB>,
): Array<[number, number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  const n = orb.spokes;
  const rx = orb.r;
  const ry = orb.ry ?? orb.r;
  const gaps = orb.gaps ?? [];
  const start = orb.start ?? 0;
  const pts: Array<Array<[number, number]>> = [];
  for (let k = 0; k < n; k++) {
    const deg = start + (360 * k) / n;
    const a = (deg * Math.PI) / 180;
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    const row: Array<[number, number]> = [[x, y]];
    for (let j = 1; j <= orb.rings; j++) {
      const f = j / orb.rings;
      row.push([Math.round(x + cx * rx * f), Math.round(y + cy * ry * f)]);
    }
    pts.push(row);
    if (inGap(deg, gaps)) continue;
    for (let j = 0; j < orb.rings; j++) {
      const p = row[j] as [number, number];
      const q = row[j + 1] as [number, number];
      out.push([p[0], p[1], q[0], q[1]]);
    }
    // The frame line: from the rim on to whatever it can be tied to.
    const rim = row[orb.rings] as [number, number];
    const ux = cx * rx;
    const uy = cy * ry;
    const ul = Math.sqrt(ux * ux + uy * uy);
    const dist = rayHit(s, rim[0], rim[1], ux / ul, uy / ul, orb.frame ?? 0);
    if ((orb.frame ?? 0) > 0 && dist < (orb.frame ?? 0))
      out.push([
        rim[0],
        rim[1],
        Math.round(rim[0] + (ux / ul) * dist),
        Math.round(rim[1] + (uy / ul) * dist),
      ]);
  }
  // The rings: each spoke's point to the next spoke's, unless either lies in a gap.
  for (let k = 0; k < n; k++) {
    const d0 = start + (360 * k) / n;
    const d1 = start + (360 * (k + 1)) / n;
    if (inGap(d0, gaps) || inGap(d1, gaps) || inGap((d0 + d1) / 2, gaps)) continue;
    const r0 = pts[k] as Array<[number, number]>;
    const r1 = pts[(k + 1) % n] as Array<[number, number]>;
    for (let j = 1; j <= orb.rings; j++) {
      const p = r0[j] as [number, number];
      const q = r1[j] as [number, number];
      out.push([p[0], p[1], q[0], q[1]]);
    }
  }
  return out;
}

/**
 * A lampwing's or hawker's home (`x`, `y` = the centre of its box): in open air (a box of twice its
 * size is clear of solids, under the canopy, inside the scene), away from the spawn, and its
 * territory clear of pods and great glints.
 */
function checkFlyer(s: RoomLike, e: Enemy): void {
  const L = e.kind === 'hawker' ? defaultTuning.hawker : defaultTuning.lampwing;
  const w = L.width;
  const h = L.height;
  const radius = (e.kind === 'lampwing' || e.kind === 'hawker' ? e.radius : undefined) ?? L.radius;
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

/** A crawler (burrback, old burrback): feet centre on a surface, the whole box supported and clear, away from the spawn. */
function checkCrawler(s: RoomLike, e: Enemy): void {
  const B =
    e.kind === 'oldBurrback'
      ? defaultTuning.oldBurrback
      : e.kind === 'juvenileBurrback'
        ? defaultTuning.juvenileBurrback
        : defaultTuning.burrback;
  const bw = B.width;
  const bh = B.height;
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

/**
 * A dangler's tie point: inside the room, in open air (its perch box clear of solids), with something
 * to tie to within 48 px above it (a solid's underside, a one-way branch, or the room's top), away from
 * the spawn sideways (never a drop on her as she arrives).
 */
function checkDangler(s: RoomLike, e: Enemy): void {
  const D = defaultTuning.dangler;
  if (e.x < D.width || e.x > s.width - D.width || e.y < 0 || e.y + D.height + 8 > s.height)
    throw new Error(`Scene "${s.id}": dangler "${e.id}" is outside the scene`);
  const x0 = e.x - D.width / 2;
  const x1 = e.x + D.width / 2;
  const y0 = e.y + 2;
  const y1 = e.y + D.height + 6;
  if (s.solids.some((q) => x1 > q.x && x0 < q.x + q.w && y1 > q.y && y0 < q.y + q.h))
    throw new Error(`Scene "${s.id}": dangler "${e.id}" hangs inside a solid`);
  const tied =
    e.y <= 48 ||
    s.solids.some((q) => e.x >= q.x && e.x <= q.x + q.w && q.y + q.h <= e.y + 2 && q.y + q.h >= e.y - 48) ||
    s.oneWays.some((q) => e.x >= q.x && e.x <= q.x + q.w && q.y <= e.y + 2 && q.y >= e.y - 48);
  if (!tied) throw new Error(`Scene "${s.id}": dangler "${e.id}" has nothing above it to tie its thread to`);
  if (Math.abs(e.x - s.spawn.x) < ENEMY_SPAWN_CLEAR && e.y < s.spawn.y)
    throw new Error(`Scene "${s.id}": dangler "${e.id}" hangs over the spawn point`);
}

/**
 * Every creature of a parsed room: unique ids (`seen`, shared with pickups and pods), placement per
 * kind, `guards` names a lure of the room, a web's strands inside the room and clear of the spawn
 * (an `orb` is expanded into `strands` here), a weaver names a web and sits on it.
 */
export function checkCreatures(s: RoomLike, seen: Set<string>): void {
  const lures = new Set((s.lures ?? []).map((l) => l.id));
  for (const e of s.enemies) {
    if (seen.has(e.id)) throw new Error(`Scene "${s.id}": two things are called "${e.id}"`);
    seen.add(e.id);
    if (e.kind === 'hawker' && e.orbit !== undefined && !lures.has(e.orbit))
      throw new Error(
        `Scene "${s.id}": hawker "${e.id}" hunts the orbit of "${e.orbit}", which is no lure of the room`,
      );
    if (e.guards !== undefined && !lures.has(e.guards))
      throw new Error(`Scene "${s.id}": enemy "${e.id}" guards "${e.guards}", which is no lure of the room`);
    if (e.kind === 'lampwing' || e.kind === 'hawker') checkFlyer(s, e);
    else if (e.kind === 'burrback' || e.kind === 'oldBurrback' || e.kind === 'juvenileBurrback')
      checkCrawler(s, e);
    else if (e.kind === 'dangler') checkDangler(s, e);
    else if (e.kind === 'web') {
      const strands = [...(e.strands ?? []), ...(e.orb ? orbStrands(s, e.x, e.y, e.orb) : [])];
      if (strands.length === 0) throw new Error(`Scene "${s.id}": web "${e.id}" has no strands`);
      e.strands = strands;
      e.orb = undefined;
      const top = Math.min(0, s.ceilingY ?? 0);
      const body = defaultTuning.body;
      const sp = { x: s.spawn.x - body.width / 2 - 40, y: s.spawn.y - body.height - 40 };
      for (const q of strands) {
        if (
          Math.min(q[0], q[2]) < 0 ||
          Math.max(q[0], q[2]) > s.width ||
          Math.min(q[1], q[3]) < top ||
          Math.max(q[1], q[3]) > s.height
        )
          throw new Error(`Scene "${s.id}": web "${e.id}" has a strand outside the scene`);
        const x0 = Math.min(q[0], q[2]);
        const x1 = Math.max(q[0], q[2]);
        const y0 = Math.min(q[1], q[3]);
        const y1 = Math.max(q[1], q[3]);
        if (x1 > sp.x && x0 < sp.x + body.width + 80 && y1 > sp.y && y0 < sp.y + body.height + 80)
          throw new Error(`Scene "${s.id}": web "${e.id}" has a strand at the spawn point`);
      }
    }
  }
  for (const e of s.enemies) {
    if (e.kind !== 'weaver') continue;
    const w = s.enemies.find((o) => o.id === e.web);
    if (w?.kind !== 'web')
      throw new Error(`Scene "${s.id}": weaver "${e.id}" names "${e.web}", which is no web of the room`);
    let near = Infinity;
    for (const q of w.strands ?? []) {
      const dx = q[2] - q[0];
      const dy = q[3] - q[1];
      const l2 = dx * dx + dy * dy;
      const u = l2 > 0 ? Math.max(0, Math.min(1, ((e.x - q[0]) * dx + (e.y - q[1]) * dy) / l2)) : 0;
      const px = q[0] + dx * u - e.x;
      const py = q[1] + dy * u - e.y;
      near = Math.min(near, px * px + py * py);
    }
    if (near > 64 * 64) throw new Error(`Scene "${s.id}": weaver "${e.id}" does not sit on its web`);
  }
}
