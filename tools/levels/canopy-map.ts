/**
 * `npx tsx tools/levels/canopy-map.ts <room> [cell]`: a room of the generated Canopy in ASCII (default 64 px cells):
 * `#` solid (`k` a face refusing the claws), `=` one-way, `^` thorns, `B` rotten bark, `G` gate / shortcut,
 * `e` creature, `*` great / hollow / seed / stone, `L` lamp, `P` patch, `.` air. For laying out climbs.
 */
import { readFileSync } from 'node:fs';

type R = { x: number; y: number; w: number; h: number; kick?: unknown };
const rooms = JSON.parse(readFileSync('content/worlds/canopy-rooms.json', 'utf8')) as Array<
  Record<string, unknown>
>;
const id = process.argv[2] ?? '';
const S = Number(process.argv[3] ?? 64);
const room = rooms.find((r) => r.id === id || r.id === `cn-${id}`);
if (!room) throw new Error(`no room ${id}`);
const W = Math.ceil((room.width as number) / S);
const H = Math.ceil((room.height as number) / S);
const g = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
const paint = (r: R, c: string) => {
  for (let y = Math.floor(r.y / S); y < Math.ceil((r.y + r.h) / S); y++)
    for (let x = Math.floor(r.x / S); x < Math.ceil((r.x + r.w) / S); x++)
      if (g[y]?.[x] !== undefined) (g[y] as string[])[x] = c;
};
const pt = (x: number, y: number, c: string) => {
  const row = g[Math.floor((y - 1) / S)];
  if (row && row[Math.floor(x / S)] !== undefined) row[Math.floor(x / S)] = c;
};
const list = (k: string) => (room[k] as R[] | undefined) ?? [];
for (const q of list('solids')) paint(q, q.kick === false ? 'k' : '#');
for (const q of list('oneWays')) paint({ ...q, h: 8 }, '=');
for (const q of list('thorns')) paint(q, '^');
for (const q of list('bark')) paint(q, 'B');
for (const q of [...list('gates'), ...list('shortcuts')]) paint(q, 'G');
for (const q of list('enemies')) pt(q.x, q.y, 'e');
for (const q of [...list('hollows')]) pt(q.x + q.w / 2, q.y + q.h, '*');
for (const q of [...list('mothStones'), ...list('moonseeds')]) pt(q.x, q.y, '*');
for (const q of list('pickups') as Array<R & { kind?: string }>) if (q.kind === 'great') pt(q.x, q.y, '*');
for (const q of list('lures')) pt(q.x, q.y, 'L');
for (const q of list('patches')) pt(q.x, q.y, 'P');
const head = `      ${Array.from({ length: W }, (_, i) => (i % 4 === 0 ? String((i * S) / 64).padEnd(4) : '')).join('')}`;
console.log(`${room.id} ${room.width} x ${room.height} (cell ${S}; header in 64 px units)`);
console.log(head);
console.log(g.map((row, i) => `${String(i * S).padStart(5)} ${row.join('')}`).join('\n'));
