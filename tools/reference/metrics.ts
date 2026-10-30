/**
 * Measure area.json files (tools/reference/schema.ts) the same way, ours and the reference games', and print one
 * table: npx tsx tools/reference/metrics.ts <area.json> [...] [--md] [--json out.json]
 *
 * "Screen" = 1920 x 1080 of our px. Area screens count the rooms' rects; "cells" are the screen-sized cells of a
 * grid over the rooms (a cell counts if a room covers at least a third of it), so a sparse long hall and a full one
 * are told apart.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { AreaFile } from './schema';

const SW = 1920;
const SH = 1080;

export interface Metrics {
  game: string;
  area: string;
  rooms: number;
  screens: number;
  cells: number;
  critScreens: number;
  /** Rooms on the critical path, and their share of all rooms. */
  critRooms: number;
  critRoomShare: number;
  enemies: number;
  enemiesPerScreen: number;
  meanDifficulty: number;
  kinds: number;
  majors: number;
  minors: number;
  breakables: number;
  saves: number;
  secrets: number;
  hiddenShare: number;
  thingsPerScreen: number;
  emptyCellShare: number;
  longestEmptyRun: number;
  solidShare: number;
  heightScreens: number;
  widthScreens: number;
  hazards: number;
  oneWays: number;
}

function polyArea(p: number[][]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i] as number[];
    const [x2, y2] = p[(i + 1) % p.length] as number[];
    s += (x1 as number) * (y2 as number) - (x2 as number) * (y1 as number);
  }
  return Math.abs(s / 2);
}

export function measure(a: AreaFile): Metrics {
  const roomArea = a.rooms.reduce((s, r) => s + r.rect[2] * r.rect[3], 0);
  const screens = roomArea / (SW * SH);
  const crit = new Set(a.criticalPath);
  const critScreens = a.rooms
    .filter((r) => crit.has(r.id))
    .reduce((s, r) => s + (r.rect[2] * r.rect[3]) / (SW * SH), 0);
  const xs = a.rooms.flatMap((r) => [r.rect[0], r.rect[0] + r.rect[2]]);
  const ys = a.rooms.flatMap((r) => [r.rect[1], r.rect[1] + r.rect[3]]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const nx = Math.ceil((Math.max(...xs) - x0) / SW);
  const ny = Math.ceil((Math.max(...ys) - y0) / SH);
  // Cells: covered by rooms (>= 1/3), and whether anything (thing or enemy) is in them.
  const covered: boolean[] = new Array(nx * ny).fill(false);
  const busy: boolean[] = new Array(nx * ny).fill(false);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const cx0 = x0 + i * SW;
      const cy0 = y0 + j * SH;
      let a2 = 0;
      for (const r of a.rooms) {
        const ox = Math.max(0, Math.min(cx0 + SW, r.rect[0] + r.rect[2]) - Math.max(cx0, r.rect[0]));
        const oy = Math.max(0, Math.min(cy0 + SH, r.rect[1] + r.rect[3]) - Math.max(cy0, r.rect[1]));
        a2 += ox * oy;
      }
      covered[j * nx + i] = a2 >= (SW * SH) / 3;
    }
  const cellOf = (x: number, y: number) => Math.floor((y - y0) / SH) * nx + Math.floor((x - x0) / SW);
  const interesting = [
    ...a.things.filter((t) => t.kind !== 'landmark').map((t) => t.at),
    ...a.enemies.map((e) => e.at),
  ];
  for (const [x, y] of interesting) {
    const c = cellOf(x, y);
    if (c >= 0 && c < busy.length) busy[c] = true;
  }
  const cells = covered.filter(Boolean).length;
  const empty = covered.filter((c, k) => c && !busy[k]).length;
  // Longest run of covered empty cells along a row or a column (a stretch of play with nothing in it).
  let longest = 0;
  for (let j = 0; j < ny; j++) {
    let run = 0;
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      run = covered[k] && !busy[k] ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }
  for (let i = 0; i < nx; i++) {
    let run = 0;
    for (let j = 0; j < ny; j++) {
      const k = j * nx + i;
      run = covered[k] && !busy[k] ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }
  const solidArea = a.terrain.filter((t) => t.kind === 'solid').reduce((s, t) => s + polyArea(t.poly), 0);
  const majors = a.things.filter((t) => t.kind === 'pickup-major').length;
  const minors = a.things.filter((t) => t.kind === 'pickup-minor').length;
  const secrets = a.things.filter((t) => t.hidden).length;
  const thingCount = a.things.filter((t) => t.kind !== 'landmark').length;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    game: a.game,
    area: a.area,
    rooms: a.rooms.length,
    screens: r2(screens),
    cells,
    critScreens: r2(critScreens),
    critRooms: a.rooms.filter((r) => crit.has(r.id)).length,
    critRoomShare: r2(a.rooms.filter((r) => crit.has(r.id)).length / Math.max(1, a.rooms.length)),
    enemies: a.enemies.length,
    enemiesPerScreen: r2(a.enemies.length / screens),
    meanDifficulty: r2(a.enemies.reduce((s, e) => s + e.difficulty, 0) / Math.max(1, a.enemies.length)),
    kinds: new Set(a.enemies.map((e) => e.kind)).size,
    majors,
    minors,
    breakables:
      a.things.filter((t) => t.kind === 'breakable').length +
      a.terrain.filter((t) => t.kind === 'breakable' || t.kind === 'secretWall').length,
    saves: a.things.filter((t) => t.kind === 'save').length,
    secrets,
    hiddenShare: r2(secrets / Math.max(1, thingCount)),
    thingsPerScreen: r2(thingCount / screens),
    emptyCellShare: r2(empty / Math.max(1, cells)),
    longestEmptyRun: longest,
    solidShare: r2(Math.min(1, solidArea / roomArea)),
    heightScreens: r2((Math.max(...ys) - y0) / SH),
    widthScreens: r2((Math.max(...xs) - x0) / SW),
    hazards: a.terrain.filter((t) => t.kind === 'hazard').length,
    oneWays: a.terrain.filter((t) => t.kind === 'oneway').length,
  };
}

if (process.argv[1]?.endsWith('metrics.ts')) {
  const files = process.argv.slice(2).filter((a) => a.endsWith('.json') && !a.startsWith('--'));
  const ji = process.argv.indexOf('--json');
  const all = files
    .filter((f) => f !== process.argv[ji + 1])
    .map((f) => measure(JSON.parse(readFileSync(f, 'utf8')) as AreaFile));
  const keys = Object.keys(all[0] ?? {}) as Array<keyof Metrics>;
  if (process.argv.includes('--md')) {
    console.log(`| metric | ${all.map((m) => `${m.game}: ${m.area}`).join(' | ')} |`);
    console.log(`|---|${all.map(() => '---').join('|')}|`);
    for (const k of keys.slice(2)) console.log(`| ${k} | ${all.map((m) => m[k]).join(' | ')} |`);
  } else
    console.table(
      Object.fromEntries(keys.slice(2).map((k) => [k, Object.fromEntries(all.map((m) => [m.area, m[k]]))])),
    );
  if (ji > 0) writeFileSync(process.argv[ji + 1] as string, `${JSON.stringify(all, null, 1)}\n`);
}
