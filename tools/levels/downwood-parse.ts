/**
 * `npx tsx tools/levels/downwood-parse.ts`: parses every generated Downwood room on its own and prints each room's
 * first problem (src/scene/index.ts throws at the first bad room when it loads, which hides the rest). It loads the
 * scene module with the Downwood's files swapped for empty ones, then puts them back.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOMS = 'content/worlds/downwood-rooms.json';
const WORLD = 'content/worlds/downwood.json';
const rooms = readFileSync(ROOMS, 'utf8');
const world = readFileSync(WORLD, 'utf8');
writeFileSync(ROOMS, '[]\n');
writeFileSync(WORLD, `${JSON.stringify({ start: 'test-grove', rooms: [], tests: [] })}\n`);
let bad = 0;
try {
  const { parseScene } = await import('../../src/scene/index');
  for (const r of JSON.parse(rooms) as Array<{ id: string }>) {
    try {
      parseScene(r);
    } catch (e) {
      bad++;
      console.log(`${r.id}: ${(e as Error).message.replace(/\s+/g, ' ').slice(0, 400)}`);
    }
  }
} finally {
  writeFileSync(ROOMS, rooms);
  writeFileSync(WORLD, world);
}
console.log(bad ? `${bad} rooms with problems` : 'every room parses');
