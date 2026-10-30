/**
 * The furniture between fights, measured the same way for the references and the Canopy (review r5 #3): hazard
 * strips and their length, things to hit (breakables), one-way ledges, per screen of air, in hero heights.
 *
 *   npx tsx tools/reference/export-area.ts canopy && npx tsx tools/levels/canopy-furniture.ts
 *
 * Hero scale (review r5 "What the exact reference numbers change"): a distance of theirs is k of ours, k = Wing's
 * height over their hero's (HK 1, the Knight 85 px against Wing 80, taken as a screen for a screen; Silksong 80/139;
 * Nine Sols 80/100); Ori per screen (k 1: its jump is 2.6 bodies, scaling by body would blow its rooms up 2.2x).
 * Per air screen in hero heights = per raw air screen / k (a length over an area). Air = room boxes minus solids.
 *
 * The spread (review r6 #1: the totals met, the area flat): "things" in a room = its enemies, pickups, breakables,
 * levers (our lamps), hazards, one-ways and secret walls, per box screen of that room; how they vary from room to
 * room (CV = sd / mean over the rooms, population sd), the quietest tenth, the rooms under 0.5 a screen, the
 * busiest over the median; and how the hazard length is laid (runs of >= 640 px, hero-scaled, and their share).
 * `--check` holds the Canopy to round 7's bar (CV >= 0.8, >= 6 quiet rooms, the peak >= 5x the median, >= 50% of
 * the hazard length in runs >= 640, hazard in <= 14 rooms, the totals within 10% of v6) and exits 1 if it misses.
 */
import { readFileSync } from 'node:fs';
import type { AreaFile } from '../reference/schema';

const SCREEN = 1920 * 1080;
const REF = 'docs/design/reference-levels';

interface Row {
  name: string;
  k: number;
  file: string;
}

const ROWS: Row[] = [
  { name: 'HK', k: 1, file: `${REF}/hollow-knight/area.json` },
  { name: 'Silksong', k: 80 / 139, file: `${REF}/silksong/area.json` },
  { name: 'Nine Sols', k: 80 / 100, file: `${REF}/nine-sols/area.json` },
  { name: 'Ori', k: 1, file: `${REF}/ori/area.json` },
  { name: 'Canopy', k: 1, file: `${REF}/ours/canopy/area.json` },
];

function bbox(p: number[][]): { w: number; h: number } {
  const xs = p.map((q) => q[0] as number);
  const ys = p.map((q) => q[1] as number);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
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

export function furniture(a: AreaFile, k: number) {
  const box = a.rooms.reduce((s, r) => s + r.rect[2] * r.rect[3], 0);
  const solid = a.terrain.filter((t) => t.kind === 'solid').reduce((s, t) => s + polyArea(t.poly), 0);
  const air = Math.max(0, box - Math.min(box, solid)) / SCREEN;
  const hazards = a.terrain.filter((t) => t.kind === 'hazard').map((t) => bbox(t.poly));
  const length = hazards.reduce((s, b) => s + Math.max(b.w, b.h), 0);
  const lens = hazards.map((b) => Math.max(b.w, b.h)).sort((x, y) => x - y);
  const breakables =
    a.things.filter((t) => t.kind === 'breakable').length +
    a.terrain.filter((t) => t.kind === 'breakable' || t.kind === 'secretWall').length;
  const pods = a.things.filter((t) => t.kind === 'breakable').length;
  const oneWays = a.terrain.filter((t) => t.kind === 'oneway').length;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    airScreens: r1(air),
    airHero: r1(air * k * k),
    hazards: hazards.length,
    hazardPx: Math.round(length),
    hazardMedian: Math.round(lens[Math.floor(lens.length / 2)] ?? 0),
    hazardPerAirHero: Math.round(length / Math.max(1e-9, air) / k),
    breakables,
    things: pods,
    oneWays,
    hitPlusLedgesPerAir: r2((breakables + oneWays) / Math.max(1e-9, air)),
    hitPlusLedgesPerAirHero: r2((breakables + oneWays) / Math.max(1e-9, air * k * k)),
  };
}

const ROOM_THINGS = new Set(['pickup-major', 'pickup-minor', 'breakable', 'lever']);
const ROOM_TERRAIN = new Set(['hazard', 'oneway', 'breakable', 'secretWall']);

/** Things per box screen, room by room (review r6 #1's measure). */
export function roomDensity(
  a: AreaFile,
): Array<{ id: string; screens: number; things: number; density: number }> {
  return a.rooms.map((room) => {
    const things =
      a.enemies.filter((e) => e.roomId === room.id).length +
      a.things.filter((t) => t.roomId === room.id && ROOM_THINGS.has(t.kind)).length +
      a.terrain.filter((t) => t.roomId === room.id && ROOM_TERRAIN.has(t.kind)).length;
    const screens = (room.rect[2] * room.rect[3]) / SCREEN;
    return { id: room.id, screens, things, density: things / screens };
  });
}

export function spread(a: AreaFile, k: number) {
  const d = roomDensity(a).map((r) => r.density);
  const mean = d.reduce((s, x) => s + x, 0) / Math.max(1, d.length);
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, d.length));
  const sorted = [...d].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const lens = a.terrain
    .filter((t) => t.kind === 'hazard')
    .map((t) => bbox(t.poly))
    .map((b) => Math.max(b.w, b.h));
  const total = lens.reduce((s, x) => s + x, 0);
  const long = lens.filter((l) => l * k >= 640);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    densityMean: r2(mean),
    densityMedian: r2(median),
    densityCV: r2(sd / Math.max(1e-9, mean)),
    densityP10: r2(sorted[Math.floor(sorted.length * 0.1)] ?? 0),
    quietRooms: `${d.filter((x) => x < 0.5).length} / ${d.length}`,
    busiestOverMedian: r2((sorted[sorted.length - 1] ?? 0) / Math.max(1e-9, median)),
    longHazardRuns: long.length,
    longHazardShare: r2(long.reduce((s, x) => s + x, 0) / Math.max(1e-9, total)),
    shortHazardRuns: lens.filter((l) => l * k <= 256).length,
    roomsWithHazard: `${new Set(a.terrain.filter((t) => t.kind === 'hazard').map((t) => t.roomId)).size} / ${a.rooms.length}`,
  };
}

/** Round 7's bar for the Canopy (review r6 #1): what misses it. v6's totals: 12,000 px of thorns, 1.77 hit + ledges. */
export function check(a: AreaFile): string[] {
  const f = furniture(a, 1);
  const d = roomDensity(a).map((r) => r.density);
  const s = spread(a, 1);
  const bad: string[] = [];
  if (s.densityCV < 0.8) bad.push(`room density CV ${s.densityCV} < 0.8`);
  if (d.filter((x) => x < 0.5).length < 6) bad.push(`${s.quietRooms} rooms under 0.5 a screen (want >= 6)`);
  if (s.busiestOverMedian < 5) bad.push(`the busiest room is ${s.busiestOverMedian}x the median (want >= 5)`);
  if (s.longHazardShare < 0.5)
    bad.push(`${s.longHazardShare} of the hazard length in runs >= 640 (want >= 0.5)`);
  if (new Set(a.terrain.filter((t) => t.kind === 'hazard').map((t) => t.roomId)).size > 14)
    bad.push(`hazard in ${s.roomsWithHazard} rooms (want <= 14)`);
  if (f.hazardPx < 10800) bad.push(`thorns ${f.hazardPx} px (v6 12,000: want within 10%)`);
  if (f.hitPlusLedgesPerAir < 1.5)
    bad.push(`hit + ledges ${f.hitPlusLedgesPerAir} per air screen (want >= 1.5)`);
  return bad;
}

if (process.argv[1]?.endsWith('canopy-furniture.ts')) {
  const out = ROWS.map((r) => {
    const a = JSON.parse(readFileSync(r.file, 'utf8')) as AreaFile;
    return { name: r.name, ...furniture(a, r.k), ...spread(a, r.k) };
  });
  const keys = Object.keys(out[0] ?? {}).filter((x) => x !== 'name') as Array<keyof (typeof out)[number]>;
  console.log(`| measure | ${out.map((o) => o.name).join(' | ')} |`);
  console.log(`|---|${out.map(() => '---').join('|')}|`);
  for (const key of keys) console.log(`| ${key} | ${out.map((o) => o[key]).join(' | ')} |`);
  const ours = JSON.parse(readFileSync(`${REF}/ours/canopy/area.json`, 'utf8')) as AreaFile;
  if (process.argv.includes('--rooms'))
    for (const r of roomDensity(ours).sort((x, y) => y.density - x.density))
      console.log(
        `  ${r.id.padEnd(16)} ${r.screens.toFixed(1).padStart(5)} screens ${String(r.things).padStart(3)} things ${r.density.toFixed(2)}`,
      );
  if (process.argv.includes('--check')) {
    const bad = check(ours);
    console.log(bad.length ? `round 7's bar missed:\n  ${bad.join('\n  ')}` : "round 7's bar met");
    process.exitCode = bad.length ? 1 : 0;
  }
}
