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

if (process.argv[1]?.endsWith('canopy-furniture.ts')) {
  const out = ROWS.map((r) => ({
    name: r.name,
    ...furniture(JSON.parse(readFileSync(r.file, 'utf8')) as AreaFile, r.k),
  }));
  const keys = Object.keys(out[0] ?? {}).filter((x) => x !== 'name') as Array<keyof (typeof out)[number]>;
  console.log(`| measure | ${out.map((o) => o.name).join(' | ')} |`);
  console.log(`|---|${out.map(() => '---').join('|')}|`);
  for (const key of keys) console.log(`| ${key} | ${out.map((o) => o[key]).join(' | ')} |`);
}
