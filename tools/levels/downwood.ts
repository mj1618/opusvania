/**
 * The Downwood (docs/design/places/1-downwood.md, memory/downwood.md): generates its 46 rooms into
 * content/worlds/downwood-rooms.json (one array, one import in src/scene/index.ts) and the world file
 * content/worlds/downwood.json. Run `npx tsx tools/levels/downwood.ts` after an edit; never edit the JSON.
 *
 * One engine room per design room: the rects and the links come from docs/design/places/1-downwood.json, so
 * the room graph is the design's by construction. A design screen is 1920 x 1080; a room at screen (x, y)
 * sits at world (1920 x, 1080 y). Every link is an exit pair on the rooms' shared edge (spans equal), at the
 * world coordinate in `AT`. The rooms' insides (floors, ledges, the locks' geometry, the creatures, lamps and
 * finds) are the functions below, one per room, in local px.
 *
 * Numbers to lay out by (memory/movement-controller.md, memory/lanternroot.md): a jump rises 272 and carries
 * ~470 on the flat; she has no double jump or dash here (the Moon Perch and the Lone Limb are later locks).
 * Claws (`wallJump`): any face that takes kicks is a ladder, so every face is `kick: false` unless it is a
 * climb. Glide: a jump + glide carries ~830 px over a gap at the same height, a jump alone 470. A fling off a
 * wick rises up to ~365 and carries ~640: no wick near a lock it could cheat.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { type Json, RoomBuilder } from './lib';

const SW = 1920;
const SH = 1080;
/** Side wall thickness, ceiling thickness, the default floor's thickness. */
const T = 160;
const CEIL = 120;
const FLOOR = 120;
/** The side door's opening height (4 tiles). */
const DOOR = 256;

interface DesignRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  items?: string[];
  note?: string;
}
interface DesignLink {
  a: string;
  b: string;
  requires?: string | null;
  oneway?: boolean;
  shortcut?: boolean;
  note?: string;
}
export const DESIGN = JSON.parse(readFileSync('docs/design/places/1-downwood.json', 'utf8')) as {
  start: string;
  rooms: DesignRoom[];
  links: DesignLink[];
};

/** The engine room id of a design room. */
export const rid = (id: string): string => `dw-${id}`;

/**
 * Where each link's opening is, in world px: a side link's door floor y (its opening is the 256 above it), or
 * `[from, to]` for a taller span (the glide gaps); a top / bottom link's opening x0 and width.
 */
const AT: Record<string, number | [number, number]> = {
  // side links: door floor y (world)
  'hatch|hub': 2040,
  'hatch|lone-limb': 2040,
  'lookout|far-crown': [120, 520],
  'lookout|gorge': [120, 520],
  'hub|scar': 700,
  'hub|windbreak': 1500,
  'windbreak|crown-tip': [1380, 1760],
  'hub|west-boughs': 3120,
  'hub|east-boughs': 4100,
  'west-boughs|westfall': 3120,
  'hub|bark-stair': 3700,
  'hub|map': 960,
  'westfall|owl-hole': 2660,
  'westfall|loft': 3940,
  'westfall|fern-rest': 7440,
  'westfall|floor-west': 6360,
  'westfall|roots-west': 7440,
  'westfall|root-well': 9600,
  'den|ant-road': 8060,
  'east-boughs|chimney': 3700,
  'floor-west|hollow': 6360,
  'hollow|black-pool': 7180,
  'black-pool|spring': 7440,
  'floor-east|chimney': 6360,
  'chimney|sunk-stair': 8520,
  'chimney|gorge-floor': 5280,
  'chimney|rain-ledge': 2860,
  'ant-road|hollow': 8520,
  'roots-east|sunk-stair': 8520,
  'sunk-stair|drowned-hall': 10680,
  'drowned-hall|antechamber': 10220,
  'gorge|far-ledge': 1680,
  'gorge-floor|gorge-shelf': 5280,
  'weaver|valley-mouth': 11700,
};
/** Top / bottom links: opening x0 (world) and width. */
const ATX: Record<string, [number, number]> = {
  'hatch|moonperch': [25600, 256],
  'hatch|cocoon-row': [28040, 300],
  'far-crown|hatch': [27200, 400],
  'chimney|lookout': [33320, 320],
  'windbreak|nest': [12600, 320],
  'crown-tip|owl-hole': [8080, 320],
  'windbreak|west-boughs': [15000, 400],
  'hub|hollow': [19840, 320],
  'hub|vault': [18080, 320],
  'hub|glass-crack': [21760, 320],
  'floor-east|glass-crack': [21520, 320],
  'bark-stair|floor-west': [15920, 320],
  'cocoon-row|east-boughs': [25560, 320],
  'floor-west|bark-floor': [17520, 320],
  'bark-floor|ant-road': [18380, 320],
  'black-pool|floor-east': [25120, 320],
  'black-pool|roots-east': [27000, 320],
  'floor-east|spring': [31320, 320],
  'roots-west|den': [13120, 400],
  'roots-west|ant-road': [16360, 320],
  'den|taproot': [13920, 320],
  'ant-road|carrier-crack': [17560, 320],
  'carrier-crack|antechamber': [18580, 320],
  'roots-east|beetle-burrow': [25600, 320],
  'gorge|gorge-floor': [34760, 7280],
  'hollow|antechamber': [20000, 480],
  'antechamber|weaver': [17880, 480],
};

/** The look of each room: Lanternroot's painter in a band (memory/lanternroot-art.md). */
type Band = 'night' | 'hall' | 'roots' | 'cache';
const BAND: Record<string, Band> = {};
for (const id of [
  'hatch',
  'moonperch',
  'lone-limb',
  'far-crown',
  'lookout',
  'scar',
  'windbreak',
  'nest',
  'map',
  'west-boughs',
  'owl-hole',
  'westfall',
  'loft',
  'cocoon-row',
  'east-boughs',
  'chimney',
  'rain-ledge',
  'crown-tip',
  'gorge',
  'gorge-floor',
  'far-ledge',
  'gorge-shelf',
])
  BAND[id] = 'night';
for (const id of [
  'hub',
  'vault',
  'glass-crack',
  'bark-stair',
  'fern-rest',
  'floor-west',
  'hollow',
  'floor-east',
  'spring',
  'bark-floor',
  'black-pool',
])
  BAND[id] = 'hall';
for (const id of [
  'roots-west',
  'den',
  'taproot',
  'ant-road',
  'carrier-crack',
  'root-well',
  'roots-east',
  'sunk-stair',
  'drowned-hall',
  'beetle-burrow',
])
  BAND[id] = 'roots';
for (const id of ['antechamber', 'weaver', 'valley-mouth']) BAND[id] = 'cache';

/** The kit she has when she first gets to each room (the design's order: claws, then glide): dev boots. */
const KIT: Record<string, string[]> = {};
const STAGE0 =
  'hatch hub cocoon-row west-boughs east-boughs map westfall loft fern-rest floor-west roots-west bark-stair hollow bark-floor den ant-road antechamber taproot carrier-crack'.split(
    ' ',
  );
const STAGE1 =
  'scar windbreak nest chimney owl-hole lookout floor-east sunk-stair gorge-floor rain-ledge glass-crack black-pool spring roots-east drowned-hall beetle-burrow'.split(
    ' ',
  );
for (const r of DESIGN.rooms)
  KIT[r.id] = STAGE0.includes(r.id) ? [] : STAGE1.includes(r.id) ? ['wallJump'] : ['wallJump', 'glide'];

/** Story flags: the old burrback's death (the return wakes on it), the Weaver's. */
export const DEN_DOWN = 'dw-den-down';
export const WEAVER_DOWN = 'dw-weaver-down';
const WAKE = DEN_DOWN;

// ---------------------------------------------------------------------------------------------------------------
// The frame: rooms, exits, shells.
// ---------------------------------------------------------------------------------------------------------------
interface Exit {
  id: string;
  edge: 'n' | 's' | 'e' | 'w';
  from: number;
  to: number;
  oneWay?: boolean;
  at?: number;
  /** The design link and which end of it this room is. */
  link: DesignLink;
  /** For side exits: the door's floor (local y); for top / bottom: the opening (local x0, x1). */
  floor?: number;
}

const DR = new Map(DESIGN.rooms.map((r) => [r.id, r]));
const EXITS = new Map<string, Exit[]>(DESIGN.rooms.map((r) => [r.id, []]));

function key(l: DesignLink): string {
  return `${l.a}|${l.b}`;
}

for (const l of DESIGN.links) {
  const a = DR.get(l.a) as DesignRoom;
  const b = DR.get(l.b) as DesignRoom;
  const k = key(l);
  if (a.x + a.w === b.x || b.x + b.w === a.x) {
    // A side link: the shared vertical edge at world x; a door (or a span) on it.
    const west = a.x < b.x ? a : b;
    const east = west === a ? b : a;
    const at = AT[k];
    if (at === undefined) throw new Error(`no AT for side link ${k}`);
    const [y0, y1] = Array.isArray(at) ? at : [at - DOOR, at];
    for (const [room, edge] of [
      [west, 'e'],
      [east, 'w'],
    ] as const) {
      const oy = room.y * SH;
      const e: Exit = {
        id: room === a ? l.b : l.a,
        edge,
        from: y0 - oy,
        to: y1 - oy,
        link: l,
        floor: y1 - oy,
      };
      if (l.oneway && room === a) e.oneWay = true;
      (EXITS.get(room.id) as Exit[]).push(e);
    }
  } else {
    const upper = a.y < b.y ? a : b;
    const lower = upper === a ? b : a;
    const at = ATX[k];
    if (!at) throw new Error(`no ATX for top/bottom link ${k}`);
    const [x0, w] = at;
    for (const [room, edge] of [
      [upper, 's'],
      [lower, 'n'],
    ] as const) {
      const ox = room.x * SW;
      const e: Exit = { id: room === a ? l.b : l.a, edge, from: x0 - ox, to: x0 + w - ox, link: l };
      if (l.oneway && room === a) e.oneWay = true;
      (EXITS.get(room.id) as Exit[]).push(e);
    }
  }
}

/** A room under construction: the builder, its size, its exits by neighbour. */
class Room {
  readonly r: RoomBuilder;
  readonly W: number;
  readonly H: number;
  readonly d: DesignRoom;
  readonly ex: Map<string, Exit>;
  constructor(d: DesignRoom) {
    this.d = d;
    this.W = d.w * SW;
    this.H = d.h * SH;
    this.ex = new Map((EXITS.get(d.id) as Exit[]).map((e) => [e.id, e]));
    this.r = new RoomBuilder(rid(d.id), this.W, this.H, [this.W / 2, this.H - FLOOR], {
      title: `The Downwood: ${d.name.replace(/^The /, 'the ')}`,
      region: 'downwood',
      edgeKick: false,
      senses: 'lamp',
      abilities: KIT[d.id],
      art: {
        mode: 'painted',
        kit: 'lanternroot',
        band: BAND[d.id] ?? 'night',
        seed: 7000 + DESIGN.rooms.indexOf(d),
      },
    });
  }
  /** The exit to a neighbour (throws if there is none). */
  e(to: string): Exit {
    const x = this.ex.get(to);
    if (!x) throw new Error(`${this.d.id} has no exit to ${to}`);
    return x;
  }
  /** A solid. Faces take no kicks unless `kick` says. */
  s(
    x: number,
    y: number,
    w: number,
    h: number,
    kick: boolean | 'east' | 'west' = false,
    tag = 'ground',
  ): this {
    this.r.solid(Math.round(x), Math.round(y), Math.round(w), Math.round(h), tag as never, kick);
    return this;
  }
  /** A one-way ledge. */
  o(x: number, y: number, w: number, noDrop?: boolean): this {
    this.r.oneWay(Math.round(x), Math.round(y), Math.round(w), 'branch', noDrop);
    return this;
  }
  /** A ladder of one-way rungs from `bottom` up to `top`, every `step` px, `w` wide, swaying ±`sway` in x. */
  ladder(x: number, w: number, top: number, bottom: number, step = 200, sway = 0): this {
    let i = 0;
    for (let y = bottom - step; y >= top - 1; y -= step) {
      this.o(x + (i % 2 === 0 ? 0 : sway), y, w);
      i++;
    }
    if ((bottom - top) % step !== 0) this.o(x, top, w);
    return this;
  }
  add(k: string, v: Json): this {
    this.r.add(k, v);
    return this;
  }
  mark(k: string, v: Json): this {
    this.r.mark(k, v);
    return this;
  }
  spawn(x: number, y: number): this {
    this.r.set('spawn', { x, y });
    return this;
  }
  patch(id: string, x: number, y: number): this {
    return this.add('patches', { id, x, y });
  }
  wick(id: string, x: number, y: number, more: Json = {}): this {
    this.r.lamp(id, x, y, more);
    return this;
  }
  lantern(id: string, x: number, y: number, more: Json = {}): this {
    this.r.lure({ id, kind: 'lantern', x, y, ...more });
    return this;
  }
  enemy(e: Json): this {
    this.r.enemy({ facing: 1, ...e });
    return this;
  }
  seed(id: string, x: number, y: number): this {
    return this.add('moonseeds', { id, x, y });
  }
  hollow(id: string, x: number, floor: number, upgrade: string): this {
    return this.add('hollows', { id, x: x - 80, y: floor - 144, w: 160, h: 144, upgrade });
  }
  sign(id: string, x: number, y: number, rhythm = '.-.'): this {
    return this.add('signs', { id, x, y, rhythm });
  }
  pod(id: string, x: number, top: number, mount: 'sit' | 'hang' = 'sit'): this {
    this.r.pod(id, x, top, 2400, mount);
    return this;
  }
  glints(prefix: string, x0: number, x1: number, y: number, h: number, n: number): this {
    this.r.arc(prefix, x0, x1, y, h, n);
    return this;
  }
  thorns(id: string, x: number, y: number, w: number, h = 40): this {
    return this.add('thorns', { id, x, y, w, h });
  }
  landmark(id: string, kind: string, x: number, y: number): this {
    return this.mark('landmarks', { id, kind, x, y });
  }
}

/**
 * The shell: side walls and (unless `sky`) the ceiling, with every exit's opening cut. Side walls are cut from
 * the door's top to its floor; below the floor the wall goes on down (the sill) unless `noSill` names that exit.
 */
function shell(m: Room, o: { sky?: boolean; noSill?: string[]; wall?: number; ceil?: number } = {}): void {
  const W = m.W;
  const H = m.H;
  const tw = o.wall ?? T;
  for (const side of ['w', 'e'] as const) {
    const x = side === 'w' ? 0 : W - tw;
    const cuts = [...m.ex.values()].filter((e) => e.edge === side).sort((a, b) => a.from - b.from);
    let y = 0;
    for (const c of cuts) {
      if (c.from > y) m.s(x, y, tw, c.from - y, false, 'trunk');
      y = c.to;
      if (o.noSill?.includes(c.id)) y = Math.min(H, c.to + 400);
    }
    if (y < H) m.s(x, y, tw, H - y, false, 'trunk');
  }
  if (!o.sky) {
    const ch = o.ceil ?? CEIL;
    const cuts = [...m.ex.values()].filter((e) => e.edge === 'n').sort((a, b) => a.from - b.from);
    let x = tw;
    for (const c of cuts) {
      if (c.from > x) m.s(x, 0, c.from - x, ch, false, 'trunk');
      x = c.to;
    }
    if (x < W - tw) m.s(x, 0, W - tw - x, ch, false, 'trunk');
  }
}

/** A floor along the bottom from x0 to x1 (top `y`, down to the room's bottom), with the bottom exits cut. */
function floor(m: Room, y: number, x0 = 0, x1 = m.W, tag = 'ground'): void {
  const cuts = [...m.ex.values()].filter((e) => e.edge === 's').sort((a, b) => a.from - b.from);
  let x = x0;
  for (const c of cuts) {
    if (c.to <= x0 || c.from >= x1) continue;
    if (c.from > x) m.s(x, y, c.from - x, m.H - y, false, tag);
    x = Math.max(x, c.to);
  }
  if (x < x1) m.s(x, y, x1 - x, m.H - y, false, tag);
}

/** A ladder of rungs up to a top exit (two-way vertical links): from `bottom` to just under the opening. */
function climbTo(m: Room, to: string, bottom: number, side: 'l' | 'r' = 'l'): void {
  const e = m.e(to);
  const w = 140;
  const x = side === 'l' ? e.from + 10 : e.to - w - 10;
  m.ladder(x, w, 60, bottom, 190, side === 'l' ? 120 : -120);
}

// ---------------------------------------------------------------------------------------------------------------
// The rooms, crown to roots.
// ---------------------------------------------------------------------------------------------------------------
const BUILD: Record<string, (m: Room) => void> = {};

// ===== The Crown =====

BUILD.hatch = (m) => {
  // The Hatching Bough (5760 x 1080): the start. West into the oak's fork; the Moon Perch overhead (double
  // jump: the canopy hole at `at` 160 is past a jump's reach from the high step), the Lone Limb past the
  // snapped gap in a low tunnel (dash: 300 px with 104 px of headroom), the drop to the Cocoon Row under it.
  const F = 960;
  shell(m, {});
  m.s(T, F, 5000 - T, m.H - F, false, 'branch');
  // (the snapped gap 5000..5300 is the drop to the Cocoon Row)
  m.s(5300, F, m.W - 5300, m.H - F, false, 'branch');
  // The low tunnel over the gap: the Lone Limb's way, a dash's height.
  m.s(4700, CEIL, m.W - T - 4700, F - 104 - CEIL, false, 'trunk');
  // The Moon Perch's steps and its hole in the canopy (at 160: a double jump from the high step, never a jump).
  m.o(2300, 780, 220);
  m.o(2580, 600, 200);
  const mp = m.e('moonperch');
  mp.at = 160;
  m.mark('moonholes', { x: (mp.from + mp.to) / 2, y: 0 });
  // The cocoon row and her cocoon; Tatter; the swarm (render: wood-hatch's acting where the kit has it).
  m.spawn(3300, F);
  m.r.data.marks = { ...((m.r.data.marks as Json) ?? {}), tatter: { x: 3620, y: F, facing: -1 } };
  m.landmark('vista', 'landmark', 1400, 600);
  m.landmark('split-oak', 'vista', 400, 500);
  // The first wick and its stragglers, leaves (pods) to cut, glints along the bough.
  m.wick('w-first', 1300, 760);
  m.pod('pod-h1', 2000, F, 'sit');
  m.pod('pod-h2', 3900, CEIL, 'hang');
  m.glints('g-h-', 600, 1100, 900, 60, 5);
  m.glints('g-h2-', 4000, 4600, 900, 40, 5);
  m.sign('sign-hatch', 4400, F, '..-');
};

BUILD.moonperch = (m) => {
  // The Moon Perch (1920 x 1080): over the hatch, a moon-drop in a cage of twigs. Reached by a double jump.
  const e = m.e('hatch');
  floor(m, 1040);
  shell(m, { sky: true });
  m.s(T, 700, 300, 40, false, 'branch');
  m.hollow('h-moonperch', 1200, 1040, 'moonDrop');
  m.spawn(e.to + 120, 1040);
  m.mark('moonholes', { x: 1200, y: 0 });
};

BUILD['lone-limb'] = (m) => {
  // The Lone Limb (1920 x 1080): past the snapped gap, the end of a limb, a hollow (wide throw).
  floor(m, 960);
  shell(m, {});
  m.hollow('h-lone', 1300, 960, 'longBreath');
  m.spawn(400, 960);
};

BUILD.map = (m) => {
  // The Moth-Stone (1920 x 1080): the east tine's end, the stone that draws the wood, the carving.
  floor(m, 960);
  shell(m, { sky: true });
  m.add('mothStones', { id: 'stone', x: 1100, y: 960, area: 'downwood' });
  m.sign('carving', 1600, 960, '.--.');
  m.spawn(400, 960);
  m.landmark('moth-stone', 'landmark', 1100, 800);
};

BUILD['far-crown'] = (m) => {
  // The High Crown (3840 x 1080): the glide's first landing from the Lookout (in from the east, high); its
  // east floor is too low to jump back into that opening. West, the drop home onto the hatch.
  shell(m, { sky: true });
  floor(m, 900, 0, 3840);
  m.s(1700, 760, 900, 140, false, 'branch');
  m.sign('sign-crown', 2100, 760, '-..-');
  m.wick('w-crown', 1500, 560);
  m.enemy({
    id: 'hawk-crown',
    kind: 'hawker',
    x: 1500,
    y: 360,
    facing: 1,
    guards: 'w-crown',
    orbit: 'w-crown',
    radius: 160,
  });
  m.pod('pod-fc', 2400, 760);
  m.glints('g-fc-', 2700, 3500, 860, 80, 6);
  m.spawn(3300, 900);
};

BUILD.lookout = (m) => {
  // The Owl's Lookout (3840 x 1080): the top of the Rain Chimney, the wood's highest point. The chimney comes
  // up through its floor to a lip (a one-way that will not let her back down): GLIDE, a patch, the vista. The
  // only ways off are glides from the two tips, over thorn pits, into openings a jump never reaches.
  const ch = m.e('chimney');
  const P = 520;
  shell(m, { sky: true });
  // The platform, west tip at 700 and east tip at 3100; solid crown under it except the chimney's throat.
  m.s(700, P, ch.from - 700, m.H - P, ch.from - 700 > 0 ? 'east' : false, 'branch');
  m.s(ch.to, P, 3100 - ch.to, m.H - P, 'west', 'branch');
  m.o(ch.from, P, ch.to - ch.from, true);
  // The throat's faces take kicks (the chimney's climb goes on to the lip).
  m.s(ch.from - 40, P + 40, 40, m.H - P - 40, 'east', 'trunk');
  m.s(ch.to, P + 40, 40, m.H - P - 40, 'west', 'trunk');
  // The pits under the tips: thorns (back to the platform).
  m.s(T, 960, 700 - T, m.H - 960, false, 'branch');
  m.thorns('t-west', T, 920, 700 - T);
  m.s(3100, 960, m.W - T - 3100, m.H - 960, false, 'branch');
  m.thorns('t-east', 3100, 920, m.W - T - 3100);
  m.add('glades', { id: 'glade-glide', x: 1500, y: P - 260, w: 500, h: 260, ability: 'glide' });
  m.patch('p-lookout', 2200, P);
  m.spawn(2200, P);
  m.landmark('lookout', 'landmark', 1800, 300);
  m.mark('moonholes', { x: 1750, y: 0 });
};

BUILD.scar = (m) => {
  // The Lightning Scar (1920 x 1080): up the hub's charred west tine. A moonseed, a firefly sign.
  const F = 700;
  shell(m, { sky: true });
  m.s(0, F, m.W - T, m.H - F, false, 'trunk');
  m.seed('seed-scar', 700, F - 120);
  m.sign('sign-scar', 1200, F, '.-..');
  m.spawn(1500, F);
};

BUILD.windbreak = (m) => {
  // The Windbreak (7680 x 1080): wind-snapped crown boughs west of the oak. From the hub's west tine (420)
  // the boughs step down west; the nest's ladder; the drop to the West Boughs; the broken west tip (640),
  // 700 px from the Snapped Crown's opening: a glide, never a jump.
  const nest = m.e('nest');
  const drop = m.e('west-boughs');
  shell(m, { noSill: [] });
  // Pit under the snapped west end (thorns).
  m.s(T, 980, 800 - T, 100, false, 'branch');
  m.thorns('t-snap', T, 940, 800 - T);
  m.s(800, 640, drop.from - 800, m.H - 640, false, 'branch');
  m.s(drop.to, 560, 7300 - drop.to, m.H - 560, false, 'branch');
  m.s(7300, 420, m.W - T - 7300, m.H - 420, false, 'branch');
  // The ladder to the nest.
  climbTo(m, 'nest', 640, 'l');
  void nest;
  // The lantern with its hawker (the crown woke: the firefly hung it while she was below).
  m.lantern('l-wind', 6400, 300, { after: WAKE });
  m.enemy({
    id: 'hawk-wind1',
    kind: 'hawker',
    x: 6400,
    y: 160,
    guards: 'l-wind',
    orbit: 'l-wind',
    wakes: WAKE,
  });
  m.enemy({ id: 'hawk-wind2', kind: 'hawker', x: 5600, y: 220, facing: -1, guards: 'l-wind', wakes: WAKE });
  // A wick chain to fling west along the boughs (ending far from the snapped tip).
  m.wick('w-wb1', 4800, 380);
  m.wick('w-wb2', 4100, 330);
  m.wick('w-wb3', 3400, 380);
  // Bark to cut (a rotten-bark wall across the boughs, a pocket of glints behind).
  m.add('bark', { id: 'bark-wind', x: 2400, y: 400, w: 64, h: 240, kick: false });
  m.glints('g-wb-', 1700, 2300, 600, 40, 5);
  m.pod('pod-wb', 5000, 640);
  m.spawn(7450, 420);
};

BUILD.nest = (m) => {
  // The Hawkers' Nest (3840 x 1080): two hawkers on a rhythm round one lantern over a thorn bowl; a moon-drop
  // behind it.
  const F = 960;
  shell(m, { sky: true });
  floor(m, F, 0, 1700);
  m.s(1700, 1000, 1300, 80, false, 'branch');
  m.thorns('t-bowl', 1700, 960, 1300);
  m.s(3000, F, m.W - 3000, m.H - F, false, 'branch');
  m.o(2000, 760, 240);
  m.o(2560, 760, 240);
  m.lantern('l-nest', 2350, 560);
  m.enemy({ id: 'hawk-n1', kind: 'hawker', x: 2050, y: 380, guards: 'l-nest', orbit: 'l-nest', period: 240 });
  m.enemy({
    id: 'hawk-n2',
    kind: 'hawker',
    x: 2650,
    y: 380,
    facing: -1,
    guards: 'l-nest',
    orbit: 'l-nest',
    period: 240,
  });
  m.hollow('h-nest', 3400, F, 'moonDrop');
  m.landmark('nest', 'challenge', 2350, 700);
  m.spawn(1240, F);
};

BUILD.hub = (m) => {
  // The Split Oak (5760 x 4320), the hub. Rows 0-1 the fork: the west tine (its east face a claw climb to the
  // Windbreak's corridor at 1500 and the Scar on its top at 700), the fork floor at 2040 (the patch), the east
  // tine with branch steps up to the Moth-Stone at 960, the hatch's corridor at 2040. Rows 2-3 the trunk:
  // a drop at the fork's west end to the West Boughs' ledge (3120), the trunk floor at 4100 (the Lampwalk
  // east), the Bark Stair's alcove behind a lintel (3700, a claw climb), rungs on the east side back up to the
  // fork. The floor holds the Heartwood's knot (5 seeds), the grate (the Hollow's shortcut) and the root flap
  // (the Glass Crack's).
  const W = m.W;
  const TF = 4100;
  const FORK = 2040;
  shell(m, { sky: true });
  // West tine: the top (the Scar's sill at 700), the corridor to the Windbreak (1244..1500), down to the fork.
  m.s(T, 700, 1200 - T, 1244 - 700, 'east', 'trunk');
  m.s(T, 1500, 1200 - T, FORK + 160 - 1500, 'east', 'trunk');
  // The fork floor (the crotch), a drop at its west end (1200..1600) and the rungs' hole at its east (4000..4400).
  m.s(1600, FORK, 4000 - 1600, 160, false, 'branch');
  // (The rungs come up through a one-way of root over the east hole: she walks over it from the hatch.)
  m.o(4000, FORK, 400);
  // East tine: over the hatch's corridor (its top the Moth-Stone's sill at 960); the corridor's floor.
  m.s(4400, 960, W - T - 4400, 1784 - 960, false, 'trunk');
  m.s(4400, FORK, W - T - 4400, 160, false, 'branch');
  for (const [i, y] of [1860, 1680, 1500, 1320, 1140].entries()) m.o(i % 2 === 0 ? 4140 : 4220, y, 200);
  // The trunk: thick bark sides (the oak's walls), tunnels through them: the West Boughs (3120), the Bark Stair's
  // alcove (3444..3700, a claw climb up its face, a lintel over its mouth so no drop lands in it), the Lampwalk.
  const TW = 700;
  const TE = 4900;
  const wb = m.e('west-boughs');
  const lw = m.e('east-boughs');
  m.s(T, FORK + 160, TW - T, wb.from - FORK - 160, false, 'trunk');
  m.s(T, wb.to, TW - T, 3444 - wb.to, false, 'trunk');
  m.s(T, 3700, TW - T, TF - 3700, 'east', 'trunk');
  m.s(TW, wb.to, 1400 - TW, 40, false, 'branch');
  m.s(TW, 3380, 1060 - TW, 64, false, 'trunk');
  m.s(TE, FORK + 160, W - T - TE, lw.from - FORK - 160, false, 'trunk');
  floor(m, TF, T, W - T, 'trunk');
  // Rungs up the trunk's east side to the fork's east hole.
  m.ladder(4060, 220, FORK + 200, TF, 200, 120);
  // The floor's three ways down: the knot (a seed gate), the grate, the flap (shortcuts opened from below).
  const vault = m.e('vault');
  const grate = m.e('hollow');
  const flap = m.e('glass-crack');
  m.add('gates', {
    id: 'knot',
    x: vault.from,
    y: TF,
    w: vault.to - vault.from,
    h: 60,
    flag: 'seeds:5',
    kick: false,
  });
  m.add('shortcuts', { id: 'grate', x: grate.from, y: TF, w: grate.to - grate.from, h: 60, opens: 's' });
  m.add('shortcuts', { id: 'flap', x: flap.from, y: TF, w: flap.to - flap.from, h: 60, opens: 's' });
  // (The throats under them take kicks: she climbs up into them from the rooms below.)
  for (const e of [grate, flap]) {
    m.s(e.from - 40, TF + 60, 40, m.H - TF - 60, 'east', 'trunk');
    m.s(e.to, TF + 60, 40, m.H - TF - 60, 'west', 'trunk');
  }
  m.patch('p-hub', 2800, FORK);
  m.wick('w-fork', 2200, 1800);
  m.enemy({ id: 'juv-hub', kind: 'juvenileBurrback', x: 3700, y: FORK, radius: 200, senses: 'always' });
  m.add('seedCases', { id: 'sc-hub1', x: 1500, y: 3000 });
  m.add('seedCases', { id: 'sc-hub2', x: 2400, y: 3600 });
  // After claws: the firefly's lantern in the fork and a hawker hunting it.
  m.lantern('l-fork', 2800, 1500, { after: WAKE });
  m.enemy({
    id: 'hawk-hub',
    kind: 'hawker',
    x: 2800,
    y: 1300,
    guards: 'l-fork',
    orbit: 'l-fork',
    wakes: WAKE,
  });
  m.glints('g-trunk-', 1600, 3400, 3900, 120, 8);
  m.pod('pod-hub', 3200, TF);
  m.landmark('split-oak', 'landmark', 2800, 1000);
  m.mark('moonholes', { x: 2800, y: 0 });
  m.spawn(W - 400, FORK);
};

BUILD['west-boughs'] = (m) => {
  // The West Boughs (5760 x 1080): the first fights, out from the oak; the lip west is the West Fall.
  const F = 960;
  shell(m, {});
  floor(m, F, 0, m.W, 'branch');
  m.enemy({
    id: 'juv-wb',
    kind: 'juvenileBurrback',
    x: 3000,
    y: F,
    facing: -1,
    radius: 500,
    senses: 'always',
  });
  m.s(1500, 700, 500, 40, false, 'branch');
  m.wick('w-gap', 2200, 600);
  m.pod('pod-wb1', 1700, 700);
  m.pod('pod-wb2', 4300, CEIL, 'hang');
  m.glints('g-wbg-', 900, 1400, 900, 60, 5);
  m.enemy({ id: 'dang-wb', kind: 'dangler', x: 2200, y: CEIL + 20, guards: 'w-gap', wakes: WAKE });
  m.spawn(m.W - 400, F);
};

BUILD['owl-hole'] = (m) => {
  // The Owl Hole (1920 x 1080): under the Snapped Crown; a caged lantern of 20 moths, a dangler; east the
  // West Fall's upper wall.
  const F = 960;
  shell(m, {});
  floor(m, F);
  m.s(1500, 500, m.W - T - 1500, F - 500, false, 'trunk');
  m.lantern('l-owl', 900, 600, { moths: 20 });
  m.enemy({ id: 'dang-owl', kind: 'dangler', x: 900, y: CEIL + 20, guards: 'l-owl' });
  m.o(1200, 720, 200);
  m.spawn(600, F);
};

BUILD.westfall = (m) => {
  // The West Fall (1920 x 7560): a drop of seven screens, a fall never a climb from its top. Ledge doors on the
  // way down (the Loft 1780 east, the Fernfloor 4200 east, the Fern Hollow and the Root Tangle 5280), wall
  // wicks and danglers; the Owl Hole up the upper west wall (claws, 500). At the foot (7440) a roofed thorn gap
  // west to the Root Well (a glide), rungs up the east side back to the 5280 doors.
  const W = m.W;
  shell(m, { noSill: ['west-boughs'] });
  // Upper west wall takes kicks (the climb to the Owl Hole).
  m.s(T, 520, 40, 1100, 'east', 'trunk');
  m.s(T, 500, 300, 40, false, 'branch');
  // Ledge doors.
  m.s(W - T - 300, 1780, 300, 40, false, 'branch');
  m.s(W - T - 320, 4200, 320, 40, false, 'branch');
  m.s(T, 5280, 300, 40, false, 'branch');
  m.s(W - T - 300, 5280, 300, 40, false, 'branch');
  // Ledges to stop on: a branch under the lip with a pod and glints, a bark shelf, branches.
  m.o(420, 1300, 320);
  m.pod('pod-lip', 580, 1300);
  m.glints('g-lip-', 900, 1500, 1500, 120, 6);
  m.add('bark', { id: 'bark-fall', x: 700, y: 2600, w: 280, h: 40, floor: true, kick: false });
  m.o(1100, 3300, 260);
  m.o(500, 3800, 240);
  m.o(1000, 4700, 240);
  // Wall wicks (low: none can lift her to the Owl Hole), danglers that wake.
  m.wick('w-fall1', 1300, 3000);
  m.wick('w-fall2', 600, 4000);
  m.wick('w-fall3', 1300, 4900);
  m.wick('w-fall4', 700, 6200);
  m.enemy({ id: 'dang-fall1', kind: 'dangler', x: 1100, y: 3320, guards: 'w-fall1' });
  for (const [i, [x, y, g]] of (
    [
      [500, 3820, 'w-fall2'],
      [1000, 4720, 'w-fall3'],
      [600, 5930, 'w-fall4'],
    ] as const
  ).entries())
    m.enemy({ id: `dang-wake${i + 1}`, kind: 'dangler', x, y, guards: g, wakes: WAKE });
  m.s(400, 5880, 400, 30, false, 'branch');
  // The foot: floor east, the roof over the thorn gap, the Root Well's sill.
  const FT = 7440;
  m.s(960, FT, W - T - 960, m.H - FT, false, 'ground');
  m.s(T, 6980, 1100 - T, 80, false, 'root');
  m.s(T, 7520, 960 - T, m.H - 7520, false, 'ground');
  m.thorns('t-foot', T + 180, 7480, 960 - T - 180);
  m.s(T, FT, 180, 80, false, 'branch');
  // Rungs back up the east side from the foot to the 5280 doors.
  m.ladder(1300, 220, 5480, FT, 200, 160);
  m.pod('pod-fall', 1500, FT);
  m.glints('g-fall-', 1150, 1650, 7380, 100, 4);
  m.spawn(1500, FT);
};

BUILD.loft = (m) => {
  // The Silk Loft (3840 x 2160): off the West Fall, a dangler over a lit wick and a moonseed in the rafters.
  const F = m.H - FLOOR;
  shell(m, {});
  m.s(T, 700, 600, 40, false, 'branch');
  m.s(600, 700, 200, F - 700, false, 'trunk');
  floor(m, F);
  m.o(1100, 1800, 300);
  m.o(1500, 1560, 300);
  m.wick('w-loft', 2100, 1400);
  m.enemy({ id: 'dang-loft', kind: 'dangler', x: 2100, y: CEIL + 20, guards: 'w-loft' });
  m.s(2600, 900, 900, 40, false, 'branch');
  m.seed('seed-loft', 3200, 760);
  m.glints('g-loft-', 2700, 3400, 850, 60, 5);
  m.spawn(400, 700);
};

BUILD['bark-stair'] = (m) => {
  // The Bark Stair (1920 x 2160): from the Fernfloor up its rungs to a landing (1600); a bark face (claws) up to
  // the oak's alcove (460). A wick and seed-cases low.
  const F = 1600;
  shell(m, {});
  // The landing, over the Fernfloor's hole (a shaft down through the trunk, rungs up it).
  const e = m.e('floor-west');
  m.s(T, F, e.from - T, m.H - F, false, 'trunk');
  m.s(e.to, F, m.W - T - e.to, m.H - F, false, 'trunk');
  m.ladder(e.from + 10, 140, F - 10, m.H + 40, 190, 120);
  // The bark face up to the alcove: the west wall takes kicks from the landing to the door.
  m.s(T, 460, 260, 40, false, 'branch');
  m.s(T, 500, 40, F - 500, 'east', 'trunk');
  m.wick('w-bs', 1300, 1400);
  m.add('seedCases', { id: 'sc-bs1', x: 900, y: 1500 });
  m.pod('pod-bs', 1500, F);
  m.spawn(1200, F);
};

BUILD['cocoon-row'] = (m) => {
  // The Cocoon Row (3840 x 1080): under the hatching bough, the empty cocoons of the ones who left; a firefly
  // sign; a wick. Down through the floor to the Lampwalk.
  const F = 960;
  shell(m, {});
  floor(m, F, 0, m.W, 'branch');
  m.sign('sign-cocoons', 2200, F, '-.-');
  m.wick('w-cocoon', 1600, 640);
  m.glints('g-cr-', 2600, 3200, 900, 60, 5);
  m.pod('pod-cr', 3000, CEIL, 'hang');
  m.landmark('cocoons', 'landmark', 2600, 400);
  m.spawn(3200, F);
};

BUILD['east-boughs'] = (m) => {
  // The Lampwalk (9600 x 1080): east from the oak's trunk under the cocoon row; rungs up to it; a fling chain
  // of three wicks, a burrback, a dangler; at the east end the rain-slick wall (claws, 500) to the chimney.
  const F = 860;
  shell(m, {});
  floor(m, F, 0, m.W, 'branch');
  climbTo(m, 'cocoon-row', F, 'l');
  // The rain-slick wall.
  const ch = m.e('chimney');
  m.s(m.W - T - 300, ch.floor as number, 300, F - (ch.floor as number), 'west', 'trunk');
  // The fling chain over a thorn bed (the burrback guards the far end).
  m.s(4600, F - 20, 1600, 20, false, 'branch');
  m.thorns('t-lamp', 4600, F - 60, 1600);
  m.wick('w-lw1', 4400, 560);
  m.wick('w-lw2', 5100, 480);
  m.wick('w-lw3', 5800, 560);
  m.enemy({ id: 'burr-lw', kind: 'burrback', x: 7000, y: F, facing: -1, radius: 400, guards: 'w-lw3' });
  m.enemy({ id: 'dang-lw', kind: 'dangler', x: 5100, y: CEIL + 20, guards: 'w-lw2' });
  // After claws, a new light hung on the Lampwalk.
  m.lantern('l-lamp', 7800, 400, { after: WAKE });
  m.enemy({ id: 'hawk-lw', kind: 'hawker', x: 7800, y: 240, guards: 'l-lamp', orbit: 'l-lamp', wakes: WAKE });
  m.glints('g-lw-', 6400, 7000, 800, 60, 5);
  m.pod('pod-lw', 1200, F);
  m.spawn(800, F);
};

BUILD.chimney = (m) => {
  // The Rain Chimney (1920 x 7560): a hollow trunk on the east edge, a climb (claws) to the Lookout. Doors:
  // the Rain Ledge (1780 W, behind rotten bark), the Lampwalk (2620 W), the Gorge Floor (4200 E), the Brook
  // (5280 W), the Sunk Stair (7440 W, the foot). Wicks to fling up between kicks; rotten bark.
  const W = m.W;
  shell(m, {});
  // Ledges at the doors.
  for (const to of ['rain-ledge', 'east-boughs', 'floor-east']) {
    const e = m.e(to);
    m.s(T, e.floor as number, 260, 40, false, 'branch');
  }
  {
    const e = m.e('gorge-floor');
    m.s(W - T - 260, e.floor as number, 260, 40, false, 'branch');
  }
  // The faces that take kicks: both inner walls, top to bottom (the climb), open at the doors.
  const doorsW = ['rain-ledge', 'east-boughs', 'floor-east', 'sunk-stair'].map((t) => m.e(t));
  let y = CEIL;
  for (const e of doorsW.sort((a, b) => a.from - b.from)) {
    m.s(T, y, 40, e.from - y, 'east', 'trunk');
    y = e.to;
  }
  m.s(T, y, 40, m.H - y, 'east', 'trunk');
  const g = m.e('gorge-floor');
  m.s(W - T - 40, CEIL, 40, g.from - CEIL, 'west', 'trunk');
  m.s(W - T - 40, g.to, 40, m.H - g.to, 'west', 'trunk');
  floor(m, 7440);
  // The rain ledge's bark.
  m.add('bark', { id: 'bark-rain', x: T, y: 1524, w: 60, h: 256, kick: false });
  // Wicks between kicks, ledges to rest on.
  m.wick('w-ch1', 960, 6400);
  m.wick('w-ch2', 960, 5000);
  m.wick('w-ch3', 960, 3400);
  m.wick('w-ch4', 960, 1400);
  m.o(700, 6000, 200);
  m.o(1100, 3900, 200);
  m.o(800, 2200, 200);
  m.add('bark', { id: 'bark-ch', x: 1300, y: 4700, w: 240, h: 40, floor: true, kick: false });
  m.glints('g-ch-', 800, 1200, 7380, 80, 4);
  m.spawn(500, 7440);
};

BUILD['rain-ledge'] = (m) => {
  // The Rain Ledge (1920 x 1080): behind rotten bark half-way up the chimney, a hollow (quick wings).
  const F = 700;
  shell(m, {});
  m.s(T, F, m.W - T, m.H - F, false, 'trunk');
  m.hollow('h-rain', 900, F, 'quickWings');
  m.glints('g-rl-', 1200, 1600, 640, 40, 3);
  m.spawn(1500, F);
};

BUILD['crown-tip'] = (m) => {
  // The Snapped Crown (1920 x 1080): a glide off the Windbreak's broken end into apparently nothing: a
  // moonseed over the drop to the Owl Hole.
  const F = 1000;
  const e = m.e('owl-hole');
  shell(m, {});
  m.s(e.to, F, m.W - e.to, m.H - F, false, 'branch');
  m.s(0, 1040, e.from, 40, false, 'branch');
  m.seed('seed-crown', (e.from + e.to) / 2, 760);
  m.spawn(1400, F);
};

BUILD.gorge = (m) => {
  // The Gorge (7680 x 4320): open air east of the wood, entered only on the wing (in high from the Lookout).
  // Lanterns to fling across, hawkers in the lanes, the Swallows' Ledge on the far wall (1680), the floor below.
  shell(m, { sky: true });
  m.s(T, 520, 600, 3800, false, 'trunk');
  m.s(m.W - T - 300, 1680, 300, 2640, false, 'trunk');
  for (const [i, [x, y]] of (
    [
      [2200, 1300],
      [3300, 1100],
      [4400, 1200],
      [5500, 1100],
      [6400, 1400],
    ] as const
  ).entries())
    m.lantern(`l-g${i + 1}`, x, y);
  m.enemy({ id: 'hawk-g1', kind: 'hawker', x: 3300, y: 900, guards: 'l-g2', orbit: 'l-g2' });
  m.enemy({ id: 'hawk-g2', kind: 'hawker', x: 5500, y: 900, guards: 'l-g4', orbit: 'l-g4' });
  m.glints('g-gorge-', 2400, 6200, 1000, 200, 12);
  m.landmark('waterfall', 'landmark', 6800, 2200);
  m.spawn(400, 520);
};

BUILD['gorge-floor'] = (m) => {
  // The Gorge Floor (7680 x 1080): the waterfall's pool, carriers, a lantern; west the chimney's crack, east
  // the thorn gap to the Thorn Run (700 px: a glide).
  const F = 960;
  const e = m.e('gorge-shelf');
  void e;
  m.s(T, F, 6500 - T, m.H - F, false, 'ground');
  m.s(6500, 1040, 700, 40, false, 'ground');
  m.thorns('t-gf', 6500, 1000, 700);
  m.s(7200, F, m.W - 7200, m.H - F, false, 'ground');
  shell(m, { sky: true });
  m.lantern('l-gf', 3000, 560);
  m.enemy({ id: 'ant-gf1', kind: 'carrier', x: 2400, y: F, trail: [[3600, F]], guards: 'l-gf' });
  m.enemy({ id: 'ant-gf2', kind: 'carrier', x: 2400, y: F, follow: 'ant-gf1', phase: 0.33, guards: 'l-gf' });
  m.enemy({ id: 'ant-gf3', kind: 'carrier', x: 2400, y: F, follow: 'ant-gf1', phase: 0.67, guards: 'l-gf' });
  m.glints('g-gf-', 4400, 5400, 900, 80, 6);
  m.landmark('waterfall', 'landmark', 5000, 500);
  m.spawn(500, F);
};

BUILD['far-ledge'] = (m) => {
  // The Swallows' Ledge (1920 x 1080): only seen mid-glide over the Gorge; a moonseed.
  const F = 600;
  shell(m, { sky: true });
  m.s(0, F, m.W - T, m.H - F, false, 'trunk');
  m.seed('seed-swallow', 1000, F - 100);
  m.spawn(500, F);
};

BUILD['gorge-shelf'] = (m) => {
  // The Thorn Run (1920 x 1080): glide and pogo over thorns: seed-cases over a thorn bed, a swinging wick, a
  // moon-drop at the end.
  const F = 960;
  shell(m, { sky: true });
  m.s(0, F, 400, m.H - F, false, 'ground');
  m.s(400, 1040, 1100, 40, false, 'ground');
  m.thorns('t-run', 400, 1000, 1100);
  m.s(1500, 760, m.W - T - 1500, m.H - 760, false, 'ground');
  m.add('seedCases', { id: 'sc-run1', x: 700, y: 820 });
  m.add('seedCases', { id: 'sc-run2', x: 1000, y: 760 });
  m.add('seedCases', { id: 'sc-run3', x: 1300, y: 700 });
  m.wick('w-run', 1000, 400, { swing: { length: 260, reach: 200, period: 180 } });
  m.hollow('h-run', 1700, 760, 'moonDrop');
  m.landmark('thorn-run', 'challenge', 900, 700);
  m.spawn(200, F);
};

// ===== The Floor =====

BUILD.vault = (m) => {
  // The Heartwood (1920 x 1080): in the oak's heart under the fork, behind the knot of five seeds: a hollow
  // (keen blade) and a moon-drop. Rungs back up.
  const F = 960;
  shell(m, {});
  floor(m, F);
  climbTo(m, 'hub', F, 'l');
  m.hollow('h-keen', 1300, F, 'keenBlade');
  m.hollow('h-heart', 1650, F, 'moonDrop');
  m.spawn(400, F);
};

BUILD['glass-crack'] = (m) => {
  // The Glass Crack (1920 x 1080): a lightning crack in the oak's east flank, climbed from the Brook (claws):
  // a wick inside the glass; at the top the root flap into the hub.
  const lo = m.e('floor-east');
  const hi = m.e('hub');
  shell(m, {});
  // Walls that take kicks from the bottom hole up to the flap's throat.
  m.s(T, CEIL, lo.from - T, m.H - CEIL, false, 'trunk');
  m.s(hi.to + 300, CEIL, m.W - T - hi.to - 300, m.H - CEIL, false, 'trunk');
  m.s(lo.from - 40, CEIL, 40, m.H - CEIL, 'east', 'trunk');
  m.s(hi.to + 260, CEIL, 40, m.H - CEIL, 'west', 'trunk');
  m.o(hi.to + 60, 500, 180);
  m.wick('w-glass', 1000, 620);
  m.spawn(800, 500);
};

BUILD['fern-rest'] = (m) => {
  // The Fern Hollow (1920 x 1080): a quiet dead end off the West Fall: a patch, Tatter, the dark.
  const F = 960;
  shell(m, {});
  floor(m, F);
  m.patch('p-fern', 900, F);
  m.r.data.marks = { ...((m.r.data.marks as Json) ?? {}), tatter: { x: 600, y: F, facing: 1 } };
  m.spawn(900, F);
};

BUILD['floor-west'] = (m) => {
  // The Fernfloor (7680 x 1080): the forest floor west of the oak's roots. A burrback under a lantern, ferns,
  // the rotten-bark floor over the Rotten Floor, rungs up to the Bark Stair, the Hollow's side door east.
  const F = 960;
  shell(m, {});
  floor(m, F, 0, m.W, 'ground');
  // Rungs up into the Bark Stair.
  climbTo(m, 'bark-stair', F, 'l');
  // The rotten-bark floor over the hole to the Rotten Floor (3 down cuts).
  const e = m.e('bark-floor');
  m.add('bark', { id: 'bark-fern', x: e.from, y: F, w: e.to - e.from, h: 60, floor: true, kick: false });
  m.lantern('l-fern', 2600, 560);
  m.enemy({ id: 'burr-fern', kind: 'burrback', x: 2600, y: F, facing: -1, radius: 500, guards: 'l-fern' });
  for (const [i, x] of [1400, 1700, 3400].entries()) m.pod(`pod-ff${i + 1}`, x, F);
  m.glints('g-ff-', 5000, 5600, 900, 60, 5);
  // After claws: carriers marching a trail of fallen moths.
  m.enemy({ id: 'ant-ff1', kind: 'carrier', x: 3400, y: F, trail: [[4600, F]], wakes: WAKE });
  m.enemy({ id: 'ant-ff2', kind: 'carrier', x: 3400, y: F, follow: 'ant-ff1', phase: 0.33, wakes: WAKE });
  m.enemy({ id: 'ant-ff3', kind: 'carrier', x: 3400, y: F, follow: 'ant-ff1', phase: 0.67, wakes: WAKE });
  m.spawn(400, F);
};

BUILD.hollow = (m) => {
  // The Charred Hollow (1920 x 5400): the lightning-glassed inside of the oak. In from the Fernfloor (2040 W)
  // she drops past the Black Pool's door (2860 E) and the Ant Road's ledge (4200 W) to the floor (5280) and the
  // drop to the Seed Door. Rungs from the floor up to the Ant Road's ledge; above it the climb (claws) to the
  // grate under the hub. No wick: nothing lifts her up the glass but the claws.
  const W = m.W;
  shell(m, {});
  // Faces that take kicks above the Ant Road's ledge (the climb).
  const fw = m.e('floor-west');
  const bp = m.e('black-pool');
  const ar = m.e('ant-road');
  m.s(T, CEIL, 40, fw.from - CEIL, 'east', 'trunk');
  m.s(T, fw.to, 40, ar.from - fw.to, 'east', 'trunk');
  m.s(W - T - 40, CEIL, 40, bp.from - CEIL, 'west', 'trunk');
  m.s(W - T - 40, bp.to, 40, 4000 - bp.to, 'west', 'trunk');
  // Ledges at the doors.
  m.s(T, fw.floor as number, 260, 40, false, 'branch');
  m.s(W - T - 260, bp.floor as number, 260, 40, false, 'branch');
  m.s(T, ar.floor as number, 400, 40, false, 'branch');
  // The grate's throat at the top (the hub's floor).
  floor(m, 5280);
  // Rungs from the floor up to the Ant Road's ledge.
  m.ladder(560, 220, (ar.floor as number) + 10, 5280, 200, 200);
  m.landmark('glow', 'landmark', 960, 5000);
  m.glints('g-hol-', 1200, 1600, 5200, 60, 4);
  m.spawn(1400, 5280);
};

BUILD['floor-east'] = (m) => {
  // The Brook (11520 x 1080): east of the roots, a brook under two swinging wicks, a hawker, carriers; the
  // Glass Crack overhead at the west end (claws); holes down to the Black Pool and the Warm Spring.
  const F = 960;
  shell(m, {});
  // The floor, the brook's channel (a catch) the swinging wicks carry her over, the floor on east.
  floor(m, F, 0, 5200, 'ground');
  m.s(5200, 1040, 1800, 40, false, 'ground');
  floor(m, F, 7000, m.W, 'ground');
  m.add('catches', { id: 'c-brook-w', x: 5200, y: 1000, w: 900, h: 40, back: { x: 5100, y: F } });
  m.add('catches', { id: 'c-brook-e', x: 6100, y: 1000, w: 900, h: 40, back: { x: 7100, y: F } });
  m.wick('w-br1', 5700, 500, { swing: { length: 300, reach: 260, period: 200 } });
  m.wick('w-br2', 6500, 500, { swing: { length: 300, reach: 260, period: 200, phase: 0.5 } });
  m.enemy({ id: 'hawk-br', kind: 'hawker', x: 6100, y: 300, guards: 'w-br1' });
  m.lantern('l-brook', 9000, 560);
  m.enemy({ id: 'ant-br1', kind: 'carrier', x: 8400, y: F, trail: [[9600, F]], guards: 'l-brook' });
  m.enemy({
    id: 'ant-br2',
    kind: 'carrier',
    x: 8400,
    y: F,
    follow: 'ant-br1',
    phase: 0.5,
    guards: 'l-brook',
  });
  m.glints('g-br-', 1600, 2600, 900, 80, 7);
  m.pod('pod-br', 3200, F);
  m.spawn(1400, F);
};

BUILD.spring = (m) => {
  // The Warm Spring (1920 x 1080): a patch in the dark under the Brook's east end; west to the Black Pool.
  const F = 960;
  shell(m, {});
  floor(m, F);
  climbTo(m, 'floor-east', F, 'l');
  m.patch('p-spring', 1300, F);
  m.spawn(1300, F);
};

BUILD['bark-floor'] = (m) => {
  // The Rotten Floor (1920 x 1080): under the Fernfloor's bark. Three seed-cases to bounce down-cuts on, a wick,
  // the rotten floor (3 down cuts) to the Ant Road; rungs back up.
  const F = 960;
  shell(m, {});
  floor(m, F);
  const e = m.e('ant-road');
  m.add('bark', { id: 'bark-rot', x: e.from, y: F, w: e.to - e.from, h: 60, floor: true, kick: false });
  climbTo(m, 'floor-west', F, 'l');
  m.add('seedCases', { id: 'sc-rot1', x: 1000, y: 700 });
  m.add('seedCases', { id: 'sc-rot2', x: 1300, y: 600 });
  m.add('seedCases', { id: 'sc-rot3', x: 1600, y: 700 });
  m.wick('w-rot', 1300, 300);
  m.spawn(800, F);
};

BUILD['black-pool'] = (m) => {
  // The Black Pool (9600 x 1080): under the oak's roots, the black water; from the Hollow's door (700) a 900 px
  // gap of water to the east bank (760): a glide. A lantern on a root isle with stragglers, rungs up to the
  // Brook, a hole down to the Drowned Roots, the Warm Spring east.
  const F = 960;
  shell(m, {});
  m.s(T, 700, 300 - T, m.H - 700, false, 'root');
  m.s(300, 1040, 900, 40, false, 'ground');
  m.add('catches', { id: 'c-pool-w', x: 300, y: 1000, w: 450, h: 40, back: { x: 200, y: 700 } });
  m.add('catches', { id: 'c-pool-e', x: 750, y: 1000, w: 450, h: 40, back: { x: 1300, y: 760 } });
  m.s(1200, 760, 800, m.H - 760, false, 'root');
  floor(m, F, 2000, m.W, 'ground');
  climbTo(m, 'floor-east', F, 'l');
  m.s(5000, 700, 400, 260, false, 'root');
  m.lantern('l-isle', 5200, 420, { moths: 18 });
  m.glints('g-bp-', 2400, 3200, 900, 60, 6);
  m.pod('pod-bp', 7000, F);
  m.spawn(2400, F);
};

// ===== The Roots =====

BUILD['roots-west'] = (m) => {
  // The Root Tangle (5760 x 1080): roots to cut, a caged wick, a juvenile, the drop into the old den.
  const F = 960;
  shell(m, {});
  floor(m, F, 0, m.W, 'root');
  m.add('bark', { id: 'bark-tangle', x: 2800, y: 704, w: 64, h: 256, kick: false });
  m.wick('w-cage', 3600, 640);
  m.thorns('t-cage-l', 3440, 520, 40, 260);
  m.thorns('t-cage-r', 3720, 520, 40, 260);
  m.enemy({
    id: 'juv-rt',
    kind: 'juvenileBurrback',
    x: 4300,
    y: F,
    facing: -1,
    radius: 300,
    senses: 'always',
  });
  m.glints('g-rt-', 600, 1200, 900, 60, 5);
  m.pod('pod-rt', 2200, CEIL, 'hang');
  m.spawn(400, F);
};

BUILD.den = (m) => {
  // The Old Den (3840 x 2160): a pit she drops into; the old burrback, its taproot (a hanging root 88 px over
  // the floor), the claws' glade when it dies. Out only by climbing the east wall (claws) to the Ant Road (500).
  // Past the taproot, a strip of rotten floor over the Taproot (a down cut finds it).
  const F = 2040;
  shell(m, {});
  const tp = m.e('taproot');
  floor(m, F, T, m.W - T, 'root');
  m.add('bark', { id: 'bark-crack', x: tp.from, y: F, w: tp.to - tp.from, h: 60, floor: true, kick: false });
  // The ceiling round the drop: thick, sheer.
  m.s(T, CEIL, 1400, 300, false, 'root');
  m.s(2100, CEIL, 1600, 300, false, 'root');
  // The east wall's climb (claws) up to the Ant Road's door.
  const ar = m.e('ant-road');
  m.s(m.W - T - 40, (ar.floor as number) + 40, 40, F - (ar.floor as number) - 40, 'west', 'trunk');
  m.s(m.W - T - 300, ar.floor as number, 300, 40, false, 'branch');
  // The taproot column.
  m.s(2900, 1500, 96, F - 88 - 1500, false, 'root');
  m.enemy({
    id: 'old-burr',
    kind: 'oldBurrback',
    x: 1400,
    y: F,
    facing: 1,
    radius: 1300,
    sets: DEN_DOWN,
    taproot: [2900, 2996],
    crack: 'dw-den-cracked',
  });
  m.add('glades', {
    id: 'glade-claws',
    x: 1000,
    y: F - 256,
    w: 900,
    h: 256,
    ability: 'wallJump',
    when: DEN_DOWN,
  });
  m.landmark('den', 'challenge', 1600, 1700);
  m.mark('moonholes', { x: 1800, y: 0 });
  m.r.set('camera', {
    zones: [{ id: 'den', x: T, y: 400, w: m.W - 2 * T, h: F - 400, lock: true, fit: true }],
  });
  m.spawn(1700, F);
};

BUILD.taproot = (m) => {
  // The Taproot (3840 x 1080): under the den's cracked floor, a hollow (night eyes). Rungs back up.
  const F = 960;
  shell(m, {});
  floor(m, F);
  climbTo(m, 'den', F, 'l');
  m.hollow('h-night', 2600, F, 'nightEyes');
  m.glints('g-tap-', 1200, 2000, 900, 60, 6);
  m.spawn(1000, F);
};

BUILD['ant-road'] = (m) => {
  // The Ant Road (3840 x 1080): carriers on their rail, a trail of moths, a wick; rungs up to the Root Tangle,
  // the den's door up a face (claws, 500) west, the Hollow east, the crack down to the Ant Crack.
  const F = 960;
  shell(m, {});
  floor(m, F, 0, m.W, 'root');
  const den = m.e('den');
  m.s(T, den.floor as number, 300, F - (den.floor as number), 'east', 'root');
  climbTo(m, 'roots-west', F, 'r');
  m.wick('w-ant', 2900, 600);
  m.enemy({ id: 'ant-ar1', kind: 'carrier', x: 1400, y: F, trail: [[2100, F]], guards: 'w-ant' });
  m.enemy({ id: 'ant-ar2', kind: 'carrier', x: 1400, y: F, follow: 'ant-ar1', phase: 0.33, guards: 'w-ant' });
  m.enemy({ id: 'ant-ar3', kind: 'carrier', x: 1400, y: F, follow: 'ant-ar1', phase: 0.67, guards: 'w-ant' });
  m.glints('g-ar-', 1400, 2100, 900, 30, 6);
  m.spawn(3400, F);
};

BUILD['carrier-crack'] = (m) => {
  // The Ant Crack (1920 x 1080): a crawl from the Ant Road down to the Seed Door; twenty stunned moths
  // (glints), carriers going in and out.
  const F = 960;
  shell(m, {});
  floor(m, F);
  climbTo(m, 'ant-road', F, 'l');
  m.r.data.pickups.push(
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `g-moth${i + 1}`,
      kind: 'glint',
      x: 900 + (i % 10) * 60,
      y: 860 - Math.floor(i / 10) * 60,
    })),
  );
  m.enemy({ id: 'ant-cc1', kind: 'carrier', x: 800, y: F, trail: [[1500, F]] });
  m.enemy({ id: 'ant-cc2', kind: 'carrier', x: 800, y: F, follow: 'ant-cc1', phase: 0.5 });
  m.spawn(1700, F);
};

BUILD['root-well'] = (m) => {
  // The Root Well (1920 x 1080): over the thorns at the West Fall's foot (a glide): a moonseed, a dangler on the
  // landing, thorns.
  const F = 960;
  shell(m, {});
  m.s(T, F, 600, m.H - F, false, 'root');
  m.s(700, 1040, 700, 40, false, 'root');
  m.thorns('t-well', 700, 1000, 700);
  m.s(1400, F, m.W - 1400, m.H - F, false, 'root');
  m.o(800, 700, 200);
  m.o(1150, 700, 200);
  m.seed('seed-well', 400, 860);
  m.enemy({ id: 'dang-well', kind: 'dangler', x: 1600, y: CEIL + 20 });
  m.spawn(300, F);
};

BUILD['roots-east'] = (m) => {
  // The Drowned Roots (7680 x 1080): a burrback under a lantern, a swinging wick, four ways (up to the Black
  // Pool, down to the Burrow, east to the Sunk Stair).
  const F = 960;
  shell(m, {});
  floor(m, F, 0, m.W, 'root');
  climbTo(m, 'black-pool', F, 'l');
  m.lantern('l-dr', 5600, 560);
  m.enemy({ id: 'burr-dr', kind: 'burrback', x: 5600, y: F, facing: -1, radius: 450, guards: 'l-dr' });
  m.wick('w-dr', 1800, 360, { swing: { length: 280, reach: 240, period: 220 } });
  m.glints('g-dr-', 6400, 7000, 900, 60, 5);
  m.pod('pod-dr', 1200, F);
  m.spawn(600, F);
};

BUILD['beetle-burrow'] = (m) => {
  // The Burrow (1920 x 1080): a dark hole off the Drowned Roots; a fight in the dark (an adult and three
  // juveniles) round a 30-moth lantern: the cache that crosses the 60-moth milestone.
  const F = 960;
  shell(m, {});
  floor(m, F);
  climbTo(m, 'roots-east', F, 'l');
  m.lantern('l-burrow', 1300, 600, { moths: 30 });
  m.enemy({ id: 'burr-bur', kind: 'burrback', x: 1300, y: F, facing: -1, radius: 380, guards: 'l-burrow' });
  for (const [i, x] of [1000, 1500, 1700].entries())
    m.enemy({
      id: `juv-bur${i + 1}`,
      kind: 'juvenileBurrback',
      x,
      y: F,
      facing: i % 2 ? 1 : -1,
      radius: 200,
      senses: 'always',
    });
  m.landmark('burrow', 'challenge', 1300, 700);
  m.spawn(500, F);
};

BUILD['sunk-stair'] = (m) => {
  // The Sunk Stair (1920 x 3240): a dark rest between two lit rooms: across at the top (the Drowned Roots, the
  // chimney's foot), rungs down to the Drowned Hall.
  shell(m, {});
  const top = m.e('roots-east').floor as number;
  const low = m.e('drowned-hall').floor as number;
  m.s(T, top, 700, 40, false, 'root');
  m.s(1200, top, m.W - T - 1200, 40, false, 'root');
  floor(m, low);
  m.ladder(820, 220, top + 10, low, 200, 160);
  m.glints('g-ss-', 800, 1200, low - 60, 60, 4);
  m.spawn(400, top);
};

BUILD['drowned-hall'] = (m) => {
  // The Drowned Hall (7680 x 1080): danglers over water, a lantern; the west wall (claws) up to the Seed Door's
  // ledge (500).
  const F = 960;
  shell(m, {});
  const ac = m.e('antechamber');
  m.s(T, ac.floor as number, 300, F - (ac.floor as number), 'east', 'root');
  floor(m, F, T + 300, 2200, 'root');
  m.s(2200, 1040, 2400, 40, false, 'ground');
  m.add('catches', { id: 'c-hall-w', x: 2200, y: 1000, w: 1200, h: 40, back: { x: 2100, y: F } });
  m.add('catches', { id: 'c-hall-e', x: 3400, y: 1000, w: 1200, h: 40, back: { x: 4700, y: F } });
  floor(m, F, 4600, m.W, 'root');
  m.o(2700, 800, 260);
  m.o(3300, 760, 260);
  m.o(3900, 800, 260);
  m.enemy({ id: 'dang-dh1', kind: 'dangler', x: 2830, y: CEIL + 20 });
  m.enemy({ id: 'dang-dh2', kind: 'dangler', x: 4030, y: CEIL + 20 });
  m.lantern('l-dh', 5800, 560);
  m.glints('g-dh-', 2700, 4100, 700, 80, 8);
  m.spawn(6800, F);
};

// ===== Under the roots: the Seed Door, the Weaver, the valley =====

BUILD.antechamber = (m) => {
  // The Seed Door (5760 x 1080): the bottom of the oak. A patch; the door in the floor (three moonseeds); the
  // crawl from the Ant Crack, the Hollow's drop, the claw wall's ledge (500) east to the Drowned Hall.
  const F = 960;
  shell(m, {});
  floor(m, F, 0, m.W, 'root');
  const dh = m.e('drowned-hall');
  m.s(m.W - T - 300, dh.floor as number, 300, F - (dh.floor as number), 'west', 'root');
  climbTo(m, 'carrier-crack', F, 'l');
  climbTo(m, 'hollow', F, 'r');
  const door = m.e('weaver');
  m.add('gates', {
    id: 'seed-door',
    x: door.from,
    y: F,
    w: door.to - door.from,
    h: 60,
    flag: 'seeds:3',
    kick: false,
  });
  m.patch('p-seed', 1500, F);
  m.landmark('seed-door', 'landmark', (door.from + door.to) / 2, F - 100);
  m.sign('sign-door', 2200, F, '...');
  m.spawn(1500, F);
};

/** The Weaver's arena: lab-weaver's (content/rooms/lab-weaver.json) moved WX, WY (as the boss rush does). */
const WX = 1600;
const WC = 400;
const WY = WC - 1088;
BUILD.weaver = (m) => {
  // The Weaver's Hollow (5760 x 2160): she drops through the Seed Door into the west corridor (a patch: the
  // fight's checkpoint), the arena (lab-weaver's), the east corridor rises to the Valley Mouth.
  const lab = JSON.parse(readFileSync('content/rooms/lab-weaver.json', 'utf8')) as {
    lures: Array<{ id: string; kind: string; x: number; y: number; spin?: number }>;
    enemies: Array<{
      id: string;
      kind: string;
      x: number;
      y: number;
      facing: number;
      strands?: number[][];
      anchors?: number[][];
    }>;
    oneWays: Array<{ x: number; y: number; w: number }>;
    boss: { drops: number[]; lowered: { x: number; y: number } };
  };
  const F = WC + 1088;
  const C = WC;
  const door = m.e('antechamber');
  shell(m, { ceil: C });
  floor(m, F, T, m.W - T, 'root');
  // The entry shaft's landing.
  m.patch('p-weaver', 1100, F);
  // The arena: its trunks (doors at floor level), columns, branches, lamps, web.
  m.s(WX, C, 128, F - 160 - C, 'east', 'trunk');
  m.s(WX + 2048, C, 128, F - 160 - C, 'west', 'trunk');
  m.s(WX + 576, C, 96, 640, false, 'trunk');
  m.s(WX + 1504, C, 96, 640, false, 'trunk');
  for (const o of lab.oneWays) m.o(o.x + WX, o.y + WY, o.w);
  for (const l of lab.lures) {
    if (l.id === 'wick-relit') continue;
    m.r.lure({ id: l.id, kind: l.kind, x: l.x + WX, y: l.y + WY, ...(l.spin ? { spin: l.spin } : {}) });
  }
  for (const e of lab.enemies) {
    const o: Json = { id: e.id, kind: e.kind, x: e.x + WX, y: e.y + WY, facing: e.facing };
    if (e.strands)
      o.strands = e.strands.map(([a, b, c, d]) => [
        (a as number) + WX,
        (b as number) + WY,
        (c as number) + WX,
        (d as number) + WY,
      ]);
    if (e.anchors) o.anchors = e.anchors.map(([a, b]) => [(a as number) + WX, (b as number) + WY]);
    m.r.enemy(o);
  }
  m.r.set('boss', {
    id: 'the-weaver',
    kind: 'weaver',
    name: 'The Weaver',
    arena: { x: WX + 128, y: C, w: 1920, h: F - C },
    lock: [
      { id: 'door-w', x: WX, y: F - 160, w: 128, h: 160 },
      { id: 'door-e', x: WX + 2048, y: F - 160, w: 128, h: 160 },
    ],
    flag: WEAVER_DOWN,
    met: 'dw-weaver-met',
    creature: 'weaver',
    heart: 'heart',
    rings: ['ring-1', 'ring-2', 'ring-3', 'ring-4', 'ring-5'],
    retryOut: ['ring-1', 'ring-5'],
    web: 'spokes',
    drops: lab.boss.drops.map((x) => x + WX),
    canopy: C,
    floor: F,
    lowered: { x: lab.boss.lowered.x + WX, y: lab.boss.lowered.y + WY },
    checkpoint: 'p-weaver',
  });
  // East: the corridor rises to the valley (a gate on the Weaver's fall as well as the lock).
  const vm = m.e('valley-mouth');
  const vy = vm.floor as number;
  m.s(4500, F - 200, 400, 200, false, 'root');
  m.s(4900, F - 400, 400, 400, false, 'root');
  m.s(5300, vy, m.W - T - 5300, F - vy, false, 'root');
  m.add('gates', { id: 'web-fall', x: 4300, y: C, w: 60, h: F - C, flag: WEAVER_DOWN, kick: false });
  void door;
  m.r.set('camera', {
    zones: [{ id: 'arena', x: WX, y: C, w: 2176, h: F - C, fit: true, lock: true, frames: 20 }],
  });
  m.spawn(1100, F);
};

BUILD['valley-mouth'] = (m) => {
  // The Valley Mouth (3840 x 1080): the way out of the wood; the valley's lamps below. The end of the demo.
  const F = m.e('weaver').floor as number;
  shell(m, { sky: true });
  m.s(0, F, 2400, m.H - F, false, 'root');
  m.s(2400, F + 80, m.W - T - 2400, m.H - F - 80, false, 'root');
  m.add('triggers', { id: 'valley', x: 2600, y: F - 200, w: 600, h: 280, sets: 'dw-valley' });
  m.landmark('valley', 'goal', 3000, 400);
  m.spawn(400, F);
};

// ---------------------------------------------------------------------------------------------------------------
// Routes (the world check's claims, proven by tools/solve/downwood.ts): inside every room each node reaches a
// middle place; a locked link's exit needs its ability, flags or shortcut.
// ---------------------------------------------------------------------------------------------------------------
const ABILITY: Record<string, string> = {
  claws: 'wallJump',
  glide: 'glide',
  doubleJump: 'doubleJump',
  dash: 'dash',
};

function routes(m: Room): void {
  const d = m.r.data as Json & Record<string, unknown>;
  m.mark('places', { id: 'mid', x: (d.spawn as { x: number }).x, y: (d.spawn as { y: number }).y });
  const ids = (k: string) => ((d[k] as Array<{ id: string }> | undefined) ?? []).map((x) => x.id);
  for (const n of [
    'spawn',
    ...ids('patches'),
    ...ids('glades'),
    ...ids('mothStones'),
    ...ids('signs'),
    ...ids('hollows'),
    ...ids('moonseeds'),
    ...ids('triggers'),
  ])
    m.r.route('mid', n);
  const boss = d.boss as { id: string } | undefined;
  if (boss) m.r.route('mid', boss.id);
  for (const e of m.ex.values()) {
    const l = e.link;
    const req = l.requires ?? null;
    const more: Json = {};
    if (req && ABILITY[req]) more.needs = [ABILITY[req]];
    if (req?.startsWith('keys:')) more.flags = [`seeds:${req.slice(5)}`];
    if (req === 'boss') more.flags = [WEAVER_DOWN];
    // A shortcut opened from below (the grate, the flap): the hub's end of it waits for the door.
    if (l.shortcut && l.a === m.d.id) more.door = e.id === 'hollow' ? 'grate' : 'flap';
    // (A shortcut's route runs from its exit: she opens it coming up from below; down it once it is open.)
    if (more.door) m.r.route(e.id, 'mid', more);
    else m.r.route('mid', e.id, more);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Write.
// ---------------------------------------------------------------------------------------------------------------
export function buildAll(): Json[] {
  const out: Json[] = [];
  for (const d of DESIGN.rooms) {
    const m = new Room(d);
    const fn = BUILD[d.id];
    if (!fn) throw new Error(`no builder for ${d.id}`);
    fn(m);
    // Exits (after the room built itself: `at` may have been set).
    for (const e of m.ex.values()) {
      const x: Json = { id: e.id, edge: e.edge, from: e.from, to: e.to };
      if (e.oneWay) x.oneWay = true;
      if (e.at !== undefined) x.at = e.at;
      m.add('exits', x);
    }
    routes(m);
    out.push(m.r.data);
  }
  return out;
}

if (process.argv[1]?.endsWith('levels/downwood.ts')) {
  const rooms = buildAll();
  writeFileSync('content/worlds/downwood-rooms.json', `${JSON.stringify(rooms, null, 2)}\n`);
  console.log(`wrote content/worlds/downwood-rooms.json (${rooms.length} rooms)`);
  writeFileSync(
    'content/worlds/downwood.json',
    `${JSON.stringify(
      {
        start: rid(DESIGN.start),
        rooms: DESIGN.rooms.map((r) => ({ id: rid(r.id), x: r.x * SW, y: r.y * SH })),
        areas: [{ id: 'downwood', rooms: DESIGN.rooms.map((r) => rid(r.id)) }],
        tests: [],
      },
      null,
      2,
    )}\n`,
  );
  console.log('wrote content/worlds/downwood.json');
  // (The repo's JSON style: Biome formats what was written.)
  execFileSync(
    'npx',
    ['biome', 'format', '--write', 'content/worlds/downwood-rooms.json', 'content/worlds/downwood.json'],
    { stdio: 'ignore' },
  );
}
