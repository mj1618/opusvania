/**
 * The boss rush demo (docs/design/demos/bossrush.md, memory/bossrush.md): generates its four rooms
 * (content/rooms/br-hub.json, br-weaver.json, br-gloam.json, br-mantis.json). Run
 * `npx tsx tools/levels/bossrush.ts` after an edit; never edit the JSON by hand.
 *
 * World `content/worlds/demo-bossrush.json` (boot `?world=demo-bossrush&fresh`): a moonlit hub with three doors, and
 * one room per boss: a short corridor (one 1920 chamber: the door back, a moon patch by the arena) and the arena.
 * The rooms link by doors only. Painted in the Lanternroot kit: the hub at night, the Weaver in the warm hall, the
 * Gloamweaver in the black roots, the Mantis in the firefly's cache under the brightest lamp.
 *
 * The arenas are the tested ones moved: the Weaver's is lab-weaver's (content/rooms/lab-weaver.json, moved by
 * WX, WY), the Gloamweaver's is lr-roots' B3 at its own coordinates.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { RoomBuilder } from './lib';

const OUT = 'content/rooms';
const H = 1536;
/** The start kit (a win adds the dash, then the Moonstep). */
const KIT = ['glide', 'wallJump', 'doubleJump'];

/** A camera chamber locked to 1920 x 1536 at `x`. */
function chamber(
  id: string,
  x: number,
): { id: string; x: number; y: number; w: number; h: number; lock: boolean; frames: number } {
  return { id, x, y: 0, w: 1920, h: H, lock: true, frames: 20 };
}

/** The corridor before an arena (0..1920): the door back to the hub, a moon patch by the arena's door. */
function corridor(r: RoomBuilder, floor: number, ceil: number, hubDoor: string): void {
  r.solid(0, 0, 1920, ceil, 'root', false);
  r.solid(0, floor, 1920, H - floor, 'ground', false);
  r.solid(0, ceil, 64, floor - ceil, 'root', false);
  r.add('doors', { id: 'from-hub', x: 240, y: floor, to: `br-hub#${hubDoor}` });
  r.add('patches', { id: 'p-gate', x: 1640, y: floor });
}

// ---------------------------------------------------------------------------------------------------------------
// br-hub: a moonlit clearing on the giant's crown. The Weaver's door on the floor, the Gloamweaver's on the dais,
// the Mantis's on the high ledge: each opens as the one before it falls (the ladder: dash, then Moonstep).
// ---------------------------------------------------------------------------------------------------------------
function hub(): RoomBuilder {
  const F = 1300;
  const r = new RoomBuilder('br-hub', 1920, H, [760, F], {
    title: 'Boss rush: the moonlit clearing',
    region: 'bossrush',
    edgeKick: false,
    // (No giving here: the test grove's offer and its rings of being seen stay out of the fights.)
    senses: 'lamp',
    abilities: KIT,
    art: { mode: 'painted', kit: 'lanternroot', band: 'night', seed: 501 },
  });
  r.set('ceilingY', 0);
  r.solid(0, F, 1920, H - F, 'ground', false);
  r.solid(0, 0, 64, F, 'trunk', false);
  r.solid(1856, 0, 64, F, 'trunk', 'west');
  // The dais (the Gloamweaver's door) and the high ledge (the Mantis's), climbed from the dais.
  r.solid(1040, 1140, 340, F - 1140, 'root', false);
  r.solid(1560, 900, 296, 60, 'root', false);
  r.add('patches', { id: 'p-hub', x: 760, y: F });
  r.add('doors', { id: 'to-weaver', x: 360, y: F, to: 'br-weaver#from-hub' });
  r.add('doors', { id: 'to-gloam', x: 1210, y: 1140, to: 'br-gloam#from-hub' });
  r.add('doors', { id: 'to-mantis', x: 1730, y: 900, to: 'br-mantis#from-hub' });
  // Shut until the boss before falls (silk across the arch).
  r.add('gates', { id: 'gate-gloam', x: 1162, y: 980, w: 96, h: 160, flag: 'br-weaver-down', kick: false });
  r.add('gates', { id: 'gate-mantis', x: 1682, y: 740, w: 96, h: 160, flag: 'br-gloam-down', kick: false });
  // Three cold-lit moonwicks by the doors (silver: the way is open).
  r.moonwick('w-weaver', 470, F - 50, { lit: true });
  r.moonwick('w-gloam', 1320, 1090, { lit: true });
  r.moonwick('w-mantis', 1620, 850, { lit: true });
  r.mark('landmarks', { id: 'vista', kind: 'vista', x: 960, y: 700 });
  r.set('camera', { zones: [{ id: 'hub', x: 0, y: 0, w: 1920, h: H, lock: true, frames: 20 }] });
  return r;
}

// ---------------------------------------------------------------------------------------------------------------
// br-weaver: the warm hall. lab-weaver's arena (the rings, the spokes, the columns, the branches) moved WX, WY;
// its door in the west trunk at floor level, from the corridor.
// ---------------------------------------------------------------------------------------------------------------
const WX = 1920;
const WY = 240 - 1088;

interface Lab {
  lures: Array<{ id: string; kind: string; x: number; y: number; spin?: number }>;
  enemies: Array<{
    id: string;
    kind: string;
    x: number;
    y: number;
    facing: number;
    strands?: [number, number, number, number][];
    anchors?: [number, number][];
  }>;
  oneWays: Array<{ tag: string; x: number; y: number; w: number }>;
  boss: { drops: number[]; canopy: number; floor: number; lowered: { x: number; y: number } };
}

function weaver(): RoomBuilder {
  const lab = JSON.parse(readFileSync('content/rooms/lab-weaver.json', 'utf8')) as Lab;
  const F = 2176 + WY; // 1328
  const C = 1088 + WY; // 240
  const r = new RoomBuilder('br-weaver', 4096, H, [240, F], {
    title: 'Boss rush: the Weaver',
    region: 'bossrush',
    edgeKick: false,
    // (No giving here: the test grove's offer and its rings of being seen stay out of the fights.)
    senses: 'lamp',
    abilities: KIT,
    art: { mode: 'painted', kit: 'lanternroot', band: 'hall', seed: 502 },
  });
  corridor(r, F, C, 'to-weaver');
  r.lamp('l-c1', 700, 620);
  r.lamp('l-c2', 1180, 760);
  // The arena (lab x 0..2176): its trunks, columns and branches.
  r.solid(1920, 0, 4096 - 1920, C, 'root', false);
  r.solid(1920, F, 4096 - 1920, H - F, 'ground', false);
  r.solid(WX, C, 128, F - 160 - C, 'trunk', 'east');
  r.solid(WX + 2048, C, 128, F - C, 'trunk', 'west');
  r.solid(WX + 576, C, 96, 640, 'trunk');
  r.solid(WX + 1504, C, 96, 640, 'trunk');
  for (const o of lab.oneWays) r.oneWay(o.x + WX, o.y + WY, o.w, 'branch');
  for (const l of lab.lures) {
    if (l.id === 'wick-relit') continue;
    r.lure({ id: l.id, kind: l.kind, x: l.x + WX, y: l.y + WY, ...(l.spin ? { spin: l.spin } : {}) });
  }
  for (const e of lab.enemies) {
    const o: Record<string, unknown> = { id: e.id, kind: e.kind, x: e.x + WX, y: e.y + WY, facing: e.facing };
    if (e.strands) o.strands = e.strands.map(([a, b, c, d]) => [a + WX, b + WY, c + WX, d + WY]);
    if (e.anchors) o.anchors = e.anchors.map(([a, b]) => [a + WX, b + WY]);
    r.enemy(o);
  }
  r.set('boss', {
    id: 'the-weaver',
    kind: 'weaver',
    name: 'The Weaver',
    arena: { x: WX + 128, y: C, w: 1920, h: F - C },
    lock: [{ id: 'door-w', x: WX, y: F - 160, w: 128, h: 160 }],
    flag: 'br-weaver-down',
    met: 'br-weaver-met',
    creature: 'weaver',
    heart: 'heart',
    rings: ['ring-1', 'ring-2', 'ring-3', 'ring-4', 'ring-5'],
    retryOut: ['ring-1', 'ring-5'],
    web: 'spokes',
    drops: lab.boss.drops.map((x) => x + WX),
    canopy: C,
    floor: F,
    lowered: { x: lab.boss.lowered.x + WX, y: lab.boss.lowered.y + WY },
    checkpoint: 'p-gate',
    grant: { ability: 'dash', text: 'The Weaver’s silk: you can dash. Press X or Shift.' },
  });
  r.set('camera', {
    zones: [
      { id: 'arena', x: WX, y: C, w: 4096 - WX, h: 1216, fit: true, lock: true, frames: 20 },
      chamber('corridor', 0),
    ],
  });
  return r;
}

// ---------------------------------------------------------------------------------------------------------------
// br-gloam: the black roots. lr-roots' B3 at its own coordinates, entered from the west at floor level. The low
// pair of moonwicks burn for good (bait its lunge into their silver); the high ledges stay dark perches.
// ---------------------------------------------------------------------------------------------------------------
function gloam(): RoomBuilder {
  const F = 1300;
  const r = new RoomBuilder('br-gloam', 3840, H, [240, F], {
    title: 'Boss rush: the Gloamweaver',
    region: 'bossrush',
    edgeKick: false,
    // (No giving here: the test grove's offer and its rings of being seen stay out of the fights.)
    senses: 'lamp',
    abilities: [...KIT, 'dash'],
    art: { mode: 'painted', kit: 'lanternroot', band: 'roots', seed: 503 },
  });
  corridor(r, F, 240, 'to-gloam');
  r.solid(1920, 0, 1920, 240, 'root', false);
  r.solid(1920, F, 1920, H - F, 'ground', false);
  r.solid(1920, 240, 64, 820, 'root', 'east');
  r.solid(3776, 240, 64, F - 240, 'root', 'west');
  r.solid(2040, 1060, 200, 30, 'root', false);
  r.moonwick('m-w1', 2140, 1010, { lit: true });
  r.solid(3520, 1060, 200, 30, 'root', false);
  r.moonwick('m-w4', 3620, 1010, { lit: true });
  r.solid(2440, 610, 160, 30, 'root', false);
  r.solid(3160, 610, 160, 30, 'root', false);
  r.lure({ id: 'gloam-lamp', kind: 'great', x: 2880, y: 640 });
  r.enemy({
    id: 'orb',
    kind: 'web',
    x: 2880,
    y: 640,
    facing: 1,
    grab: false,
    orb: { r: 520, spokes: 12, rings: 4 },
  });
  r.enemy({ id: 'gloamweaver', kind: 'gloamweaver', x: 2880, y: 640, facing: 1 });
  r.mark('moonholes', { x: 2880, y: 240 });
  r.set('boss', {
    id: 'gloam',
    kind: 'gloamweaver',
    name: 'The Gloamweaver',
    arena: { x: 1984, y: 300, w: 1792, h: F - 300 },
    lock: [{ id: 'door-w', x: 1920, y: 1060, w: 64, h: 240 }],
    flag: 'br-gloam-down',
    met: 'br-gloam-met',
    creature: 'gloamweaver',
    heart: 'gloam-lamp',
    rings: [],
    retryOut: [],
    drops: [2300, 3460, 2880],
    canopy: 300,
    floor: F,
    hub: { x: 2880, y: 640 },
    orbR: 520,
    wicks: ['m-w1', 'm-w4'],
    high: [],
    rush: true,
    checkpoint: 'p-gate',
    grant: { upgrade: 'moonstep', text: 'Moonstep: your dash passes through blows unharmed.' },
  });
  r.set('camera', {
    zones: [
      { id: 'arena', x: 1984, y: 300, w: 1792, h: 1080, lock: true, frames: 20 },
      chamber('corridor', 0),
      chamber('b', 1920),
    ],
  });
  return r;
}

// ---------------------------------------------------------------------------------------------------------------
// br-mantis: the firefly's cache, under the brightest lamp. A flat floor between two climbable walls, two hung
// shelves to break a strike's line. The Mantis waits at the east end.
// ---------------------------------------------------------------------------------------------------------------
function mantis(): RoomBuilder {
  const F = 1300;
  const r = new RoomBuilder('br-mantis', 3840, H, [240, F], {
    title: 'Boss rush: the Mantis',
    region: 'bossrush',
    edgeKick: false,
    // (No giving here: the test grove's offer and its rings of being seen stay out of the fights.)
    senses: 'lamp',
    abilities: [...KIT, 'dash'],
    art: { mode: 'painted', kit: 'lanternroot', band: 'cache', seed: 504 },
  });
  corridor(r, F, 200, 'to-mantis');
  r.lamp('l-c1', 900, 520);
  r.solid(1920, 0, 1920, 200, 'trunk', false);
  r.solid(1920, F, 1920, H - F, 'ground', false);
  r.solid(1920, 200, 64, 860, 'trunk', 'east');
  r.solid(3776, 200, 64, F - 200, 'trunk', 'west');
  r.oneWay(2220, 1000, 260, 'branch');
  r.oneWay(3280, 1000, 260, 'branch');
  r.lure({ id: 'firefly-lamp', kind: 'great', x: 2880, y: 520 });
  r.mark('landmarks', { id: 'centrepiece', kind: 'centrepiece', x: 2880, y: 560 });
  r.enemy({ id: 'mantis', kind: 'mantis', x: 3420, y: F, facing: -1 });
  r.set('boss', {
    id: 'the-mantis',
    kind: 'mantis',
    name: 'The Mantis',
    arena: { x: 1984, y: 200, w: 1792, h: F - 200 },
    lock: [{ id: 'door-w', x: 1920, y: 1060, w: 64, h: 240 }],
    flag: 'br-mantis-down',
    met: 'br-mantis-met',
    creature: 'mantis',
    heart: 'firefly-lamp',
    rings: [],
    retryOut: [],
    floor: F,
    checkpoint: 'p-gate',
    grant: { text: 'The brightest lamp is out. Its moths are free.' },
  });
  r.set('camera', {
    zones: [
      { id: 'arena', x: 1920, y: 290, w: 1920, h: 1080, lock: true, frames: 20 },
      chamber('corridor', 0),
    ],
  });
  return r;
}

for (const r of [hub(), weaver(), gloam(), mantis()]) r.write(OUT);
writeFileSync(
  'content/worlds/demo-bossrush.json',
  `${JSON.stringify(
    {
      start: 'br-hub',
      rooms: [
        { id: 'br-hub', x: 0, y: 0 },
        { id: 'br-weaver', x: 2400, y: 0 },
        { id: 'br-gloam', x: 7000, y: 0 },
        { id: 'br-mantis', x: 11200, y: 0 },
      ],
      areas: [{ id: 'bossrush', rooms: ['br-hub', 'br-weaver', 'br-gloam', 'br-mantis'] }],
      tests: [],
    },
    null,
    2,
  )}\n`,
);
console.log('wrote content/worlds/demo-bossrush.json');
