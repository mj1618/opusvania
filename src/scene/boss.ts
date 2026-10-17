import { z } from 'zod';

/**
 * A boss fight's room data (memory/bosses.md): the Zod shape of a room's `boss` block and its checks
 * (`checkBoss`, run by `parseScene`). Sim types: src/sim/boss/data.ts. The block names the room's own
 * lures and creatures by id, so a level builder places those like any others and copies the block.
 */

const int = z.number().int();
const id = z.string().min(1);
const rect = z.object({ x: int, y: int, w: int.positive(), h: int.positive() }).strict();

export const BOSS = z
  .object({
    id,
    kind: z.literal('weaver'),
    name: z.string().min(1),
    arena: rect,
    lock: z.array(z.object({ id, x: int, y: int, w: int.positive(), h: int.positive() }).strict()),
    flag: id,
    met: id,
    creature: id,
    heart: id,
    rings: z.array(id).min(1),
    retryOut: z.array(id),
    web: id.optional(),
    drops: z.array(int).min(1).optional(),
    canopy: int.optional(),
    floor: int.optional(),
    lowered: z.object({ x: int, y: int }).strict().optional(),
    relight: id.optional(),
  })
  .strict()
  .optional();

type Boss = NonNullable<z.infer<typeof BOSS>>;
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface BossRoom {
  id: string;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  solids: Box[];
  lures?: Array<{ id: string; kind: string; x: number; y: number }> | undefined;
  enemies: Array<{ id: string; kind: string; x: number; y: number; strands?: unknown }>;
  boss?: Boss | undefined;
}

/** The room nodes a boss adds (routes may name it; the world check sets its flag once it is reached). */
export function bossNodes(room: { boss?: { id: string } | undefined }): string[] {
  return room.boss ? [room.boss.id] : [];
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * A room's boss: its id unique (`seen`), the arena and doors inside the room, each door touching the
 * arena's edge and clear of the spawn, the lures it names of the right kinds (a `great` heart, `ring`
 * flames), its creature a `weaverBoss` on its heart and its web a `web`, retry husks among its rings.
 * (The walk back's moon patch may be in the room before: the boss door is often a room's exit.)
 */
export function checkBoss(s: BossRoom, seen: Set<string>): void {
  const b = s.boss;
  if (!b) return;
  const where = `Scene "${s.id}": boss "${b.id}"`;
  if (seen.has(b.id)) throw new Error(`Scene "${s.id}": two things are called "${b.id}"`);
  seen.add(b.id);
  const inRoom = (r: Box) => r.x >= 0 && r.y >= 0 && r.x + r.w <= s.width && r.y + r.h <= s.height;
  if (!inRoom(b.arena)) throw new Error(`${where}: its arena leaves the room`);
  for (const d of b.lock) {
    if (seen.has(d.id)) throw new Error(`Scene "${s.id}": two things are called "${d.id}"`);
    seen.add(d.id);
    if (!inRoom(d)) throw new Error(`${where}: door "${d.id}" leaves the room`);
    const grown = { x: b.arena.x - 1, y: b.arena.y - 1, w: b.arena.w + 2, h: b.arena.h + 2 };
    if (!overlaps(d, grown) || overlaps(d, b.arena))
      throw new Error(`${where}: door "${d.id}" must sit on the arena's edge, outside it`);
    const sp = { x: s.spawn.x - 20, y: s.spawn.y - 80, w: 40, h: 80 };
    if (overlaps(d, sp)) throw new Error(`${where}: door "${d.id}" shuts on the spawn`);
  }
  const lure = (lid: string, kinds: string[], what: string) => {
    const l = (s.lures ?? []).find((q) => q.id === lid);
    if (!l) throw new Error(`${where}: its ${what} "${lid}" is no lure of the room`);
    if (!kinds.includes(l.kind))
      throw new Error(`${where}: its ${what} "${lid}" must be a ${kinds.join(' or ')}`);
    return l;
  };
  const heart = lure(b.heart, ['great'], 'heart');
  for (const r of b.rings) lure(r, ['ring'], 'ring flame');
  for (const r of b.retryOut)
    if (!b.rings.includes(r)) throw new Error(`${where}: retry husk "${r}" is not one of its rings`);
  if (b.relight !== undefined) lure(b.relight, ['wick', 'lantern'], 'relit lamp');
  const cr = s.enemies.find((e) => e.id === b.creature);
  if (cr?.kind !== 'weaverBoss')
    throw new Error(`${where}: its creature "${b.creature}" must be a weaverBoss`);
  if (cr.x !== heart.x || cr.y !== heart.y) throw new Error(`${where}: the Weaver starts on its heart`);
  if (b.web !== undefined) {
    const w = s.enemies.find((e) => e.id === b.web);
    if (w?.kind !== 'web') throw new Error(`${where}: its web "${b.web}" is no web of the room`);
  }
  for (const x of b.drops ?? [])
    if (x <= b.arena.x || x >= b.arena.x + b.arena.w)
      throw new Error(`${where}: drop pivot ${x} is outside the arena`);
}
