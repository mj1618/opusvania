/**
 * The Downwood as built, in place-score's layout (docs/design/places/place-score.mjs):
 * `npx tsx tools/levels/downwood-export.ts` writes docs/design/places/1-downwood-built.json and prints the score.
 *
 * It reads only the built world (src/scene: the linked `downwood` world and its rooms), never the design file:
 *  - rooms: each placed room, its world rect in screens (1920 x 1080);
 *  - links: each linked exit pair (`world.links`); one-way when one side's exit is a drop / arrival only; the lock
 *    from the rooms' route claims on that exit (`needs` wallJump = claws, glide; `flags` `seeds:n` = keys:n, the
 *    Weaver's flag = boss); a shortcut where a claim passes a shortcut (`door`): opened from the other room;
 *  - items from what is in each room: glades (`ability:`), hollows (moon-drop = `health`, else `energy`), moonseeds
 *    (`key`), moth-stones (`map`), patches (`bench`), signs (`lore`), Tatter (`npc`), the boss (`boss`), lamps,
 *    glints and pods (`currency`), and the marks the room names as a `challenge`, `landmark` or `goal`;
 *  - abilities in the order the world check finds them.
 * The claims themselves are proven in the real sim by tools/solve/downwood.ts.
 */
import { writeFileSync } from 'node:fs';
// @ts-expect-error: a plain .mjs module without types
import { score } from '../../docs/design/places/place-score.mjs';
import type { Room } from '../../src/scene/room';
import { getWorld, progression } from '../../src/scene/world';
import { WEAVER_DOWN } from './downwood';

const SW = 1920;
const SH = 1080;
const ABILITY: Record<string, string> = {
  wallJump: 'claws',
  glide: 'glide',
  doubleJump: 'doubleJump',
  dash: 'dash',
};

export interface Layout {
  id: string;
  title: string;
  start: string;
  abilities: string[];
  rooms: Array<{ id: string; name: string; x: number; y: number; w: number; h: number; items: string[] }>;
  links: Array<{ a: string; b: string; requires: string | null; oneway: boolean; shortcut: boolean }>;
}

const short = (id: string) => id.replace(/^dw-/, '');

/** What a route claim on an exit says it needs, in place-score's words. */
function requiresOf(room: Room, exit: string): string | null {
  for (const q of room.routes ?? []) {
    if (q.to !== exit && q.from !== exit) continue;
    const need = q.needs?.[0];
    if (need) return ABILITY[need] ?? need;
    const flag = q.flags?.[0];
    if (flag?.startsWith('seeds:')) return `keys:${flag.slice(6)}`;
    if (flag === WEAVER_DOWN) return 'boss';
  }
  return null;
}
function shortcutOf(room: Room, exit: string): boolean {
  return (room.routes ?? []).some((q) => (q.to === exit || q.from === exit) && q.door);
}

function itemsOf(room: Room): string[] {
  const out: string[] = [];
  for (const g of room.glades ?? []) out.push(`ability:${ABILITY[g.ability] ?? g.ability}`);
  for (const h of room.hollows ?? []) out.push(h.upgrade === 'moonDrop' ? 'health' : 'energy');
  for (const _ of room.moonseeds ?? []) out.push('key');
  for (const _ of room.mothStones ?? []) out.push('map');
  for (const _ of room.patches ?? []) out.push('bench');
  if ((room.signs ?? []).length) out.push('lore');
  if (room.marks?.tatter) out.push('npc');
  if (room.boss) out.push('boss');
  const lamps = (room.lures ?? []).filter((l) => l.kind === 'wick' || l.kind === 'lantern').length;
  if (lamps + (room.pickups ?? []).length + (room.pods ?? []).length > 0) out.push('currency');
  for (const l of room.marks?.landmarks ?? [])
    if (l.kind === 'challenge' || l.kind === 'landmark' || l.kind === 'goal') out.push(l.kind);
  return [...new Set(out)];
}

export function exportDownwood(): Layout {
  const w = getWorld('downwood');
  const placed = Object.values(w.rooms).filter((r) => r.placed);
  const rooms = placed.map((r) => ({
    id: short(r.id),
    name: (r.scene as Room).title?.replace(/^The Downwood: /, '') ?? r.id,
    x: r.x / SW,
    y: r.y / SH,
    w: r.scene.width / SW,
    h: r.scene.height / SH,
    items: itemsOf(r.scene as Room),
  }));
  const seen = new Set<string>();
  const links: Layout['links'] = [];
  for (const r of placed) {
    for (const e of r.scene.exits ?? []) {
      const link = w.links[`${r.id}#${e.id}`];
      // Arrival-only (the far side of a drop) is listed from the side she leaves by.
      const other = link ?? null;
      const to =
        other?.to ??
        placed.find((q) =>
          (q.scene.exits ?? []).some(
            (x) => w.links[`${q.id}#${x.id}`]?.to === r.id && w.links[`${q.id}#${x.id}`]?.exit === e.id,
          ),
        )?.id;
      if (!to) continue;
      const pair = [r.id, to].sort().join('|');
      if (seen.has(pair)) continue;
      seen.add(pair);
      const toRoom = w.rooms[to]?.scene as Room;
      const toExit =
        other?.exit ?? (toRoom.exits ?? []).find((x) => w.links[`${to}#${x.id}`]?.to === r.id)?.id ?? '';
      const oneHere = !!e.oneWay;
      const oneThere = !!(toRoom.exits ?? []).find((x) => x.id === toExit)?.oneWay;
      // a = the side she leaves a drop by; the room with the shortcut's door (it opens from the other room).
      let a = r.id;
      let b = to;
      let ea = e.id;
      let eb = toExit;
      if (oneThere || shortcutOf(toRoom, toExit)) {
        a = to;
        b = r.id;
        ea = toExit;
        eb = e.id;
      }
      const ra = w.rooms[a]?.scene as Room;
      const rb = w.rooms[b]?.scene as Room;
      links.push({
        a: short(a),
        b: short(b),
        requires: requiresOf(ra, ea) ?? requiresOf(rb, eb),
        oneway: oneHere || oneThere,
        shortcut: shortcutOf(ra, ea),
      });
    }
  }
  const abilities = progression(w).abilities.map((a) => ABILITY[a] ?? a);
  return {
    id: 'downwood-built',
    title: 'The Downwood, as built',
    start: short(w.start),
    abilities,
    rooms,
    links,
  };
}

if (process.argv[1]?.endsWith('downwood-export.ts')) {
  const L = exportDownwood();
  const file = 'docs/design/places/1-downwood-built.json';
  writeFileSync(file, `${JSON.stringify(L, null, 2)}\n`);
  const { out } = score(L) as { out: Array<{ name: string; ok: boolean; got: unknown; want: string }> };
  const fails = out.filter((c) => !c.ok).length;
  console.log(
    `\n${L.title}  (${file}): ${out.length - fails}/${out.length} pass  (${L.rooms.length} rooms, ${L.links.length} links)`,
  );
  for (const c of out)
    console.log(
      `  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(38)} ${String(c.got).padEnd(28)} want ${c.want}`,
    );
}
