/**
 * The Canopy: a first area built to the reference games' numbers (docs/design/levels/first-area.md,
 * docs/design/reference-levels/README.md). Writes content/worlds/canopy-rooms.json and content/worlds/canopy.json:
 *   npx tsx tools/levels/canopy.ts && npx biome format --write content/worlds/canopy*.json
 * Edit this file, never the JSON. Every walk is a wood-kit limb (a run of narrow rolling `branch` rects, one
 * `marks.stretches` entry with a height band) or a tree (`marks.trees`; solid = a wall, a claw climb).
 *
 * World (px, 1 screen = 1920 x 1080):
 *   hatch  (0, 0)         7424 x 2816  the hatching branch (wood-hatch's layout, its drop leads into the Crossing)
 *   canopy (7424, 0)      7424 x 2816  the high canopy over the Crossing and the Lamp Grove (claws in, glide inside)
 *   west   (-1792, 2816)  6144 x 2816  the Thornlimb: down and west to the claws, back along the upper limbs
 *   hub    (4352, 2816)   5120 x 2816  the Crossing: the landing, the save, the seed door
 *   grove  (9472, 2816)   5376 x 2816  the Lamp Grove: the dense clearing, the climb to the canopy
 *   den    (4352, 5632)   5120 x 1856  under the seed door: the old burrback, the way out
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { type Json, RoomBuilder } from './lib';

const OUT_ROOMS = 'content/worlds/canopy-rooms.json';
const OUT_WORLD = 'content/worlds/canopy.json';

/** A wood room: the builder plus limbs and trees as the wood kit paints them. */
class Wood extends RoomBuilder {
  private n = 0;
  constructor(
    id: string,
    title: string,
    w: number,
    h: number,
    spawn: [number, number],
    seed: number,
    more: Json = {},
  ) {
    super(id, w, h, spawn, {
      title,
      region: 'wood',
      edgeKick: false,
      senses: 'lamp',
      abilities: [],
      art: {
        kit: 'wood',
        seed,
        pieces: true,
        moon: { x: 1420, y: 190, r: 88 },
        afterglow: { x: 1500, y: 850, strength: 0.6 },
        moods: [{ x: 0, mood: 'cool' }],
        anchorX: Math.round(w / 2),
        ...((more.art as Json) ?? {}),
      },
    });
    for (const [k, v] of Object.entries(more)) if (k !== 'art') this.set(k, v);
    this.set('marks', { trees: [], stretches: [], covers: [], landmarks: [], places: [] });
    this.set('exits', []);
  }

  /** A tree: `x` its west face, `w` its width, `top`..`bottom`. Solid trees are walls (`kick` for a claw climb). */
  tree(
    id: string,
    x: number,
    w: number,
    top: number,
    bottom: number,
    solid: boolean,
    kick: boolean | 'east' | 'west' = false,
  ): this {
    this.mark('trees', { id, x: x + Math.round(w / 2), w, top, bottom, plane: 'walk', solid });
    if (solid) this.solid(x, Math.max(0, top), w, bottom - Math.max(0, top), 'trunk', kick);
    return this;
  }

  /**
   * A limb from x0 to x1 whose walk top rolls a few px round `top` (steps <= 12: the sim's rolling ground), grown
   * from `parent` (a tree or another limb) at its `grows` root end, ending in `end` at the other.
   */
  limb(
    id: string,
    x0: number,
    x1: number,
    top: number,
    o: {
      parent: string;
      grows: 'east' | 'west';
      end: string;
      h?: number;
      tilt?: number;
      skip?: Array<[number, number]>;
      flat?: Array<[number, number]>;
    },
  ): this {
    const widths = [64, 96, 80, 112, 48, 128, 80, 96];
    const h = o.h ?? 96;
    const tilt = o.tilt ?? 0;
    let x = x0;
    let k = this.n++ * 3;
    let prev = top;
    while (x < x1) {
      let w = Math.min(widths[k % widths.length] as number, x1 - x);
      // Holes are cut exactly: a rect never straddles a skip range's ends.
      for (const [a, b] of o.skip ?? []) {
        if (x < a && x + w > a) w = a - x;
        if (x >= a && x < b) w = Math.min(w, b - x);
      }
      const u = (x - x0) / Math.max(1, x1 - x0);
      const want = Math.round(top + tilt * u + 7 * Math.sin(x / 173 + this.n) + 4 * Math.sin(x / 61));
      const flat = (o.flat ?? []).find(([a, b]) => x + w > a && x < b);
      const y = flat && x > flat[0] ? prev : Math.max(prev - 12, Math.min(prev + 12, want));
      const skipped = (o.skip ?? []).some(([a, b]) => x >= a && x < b);
      if (!skipped && w > 0) this.solid(x, y, w, h, 'branch');
      prev = y;
      x += w;
      k++;
    }
    const root = o.grows === 'east' ? x0 : x1;
    this.mark('stretches', {
      id,
      x0,
      x1,
      parent: o.parent,
      from: [root, top + 20],
      grows: o.grows,
      end: o.end,
      y0: top + Math.min(0, tilt) - 40,
      y1: top + Math.max(0, tilt) + 40,
    });
    return this;
  }

  /** The walk top at x of the limb whose nominal top is `near` (the rolling rect under x), else `near`. */
  top(x: number, near: number, half = 32): number {
    const under = this.data.solids.filter(
      (q) =>
        (q.x as number) < x + half &&
        x - half < (q.x as number) + (q.w as number) &&
        Math.abs((q.y as number) - near) <= 40,
    );
    return under.length ? Math.min(...under.map((q) => q.y as number)) : near;
  }

  /**
   * Level the limb under x for `half` px each side (a creature's spawn wants one top under its whole box), then
   * ease the rects beyond back into the roll, never a step over 12 px. Returns the pad's top.
   */
  pad(x: number, near: number, half: number): number {
    const limb = this.data.solids
      .filter((q) => (q.tag as string) === 'branch' && Math.abs((q.y as number) - near) <= 40)
      .sort((a, b) => (a.x as number) - (b.x as number));
    const i0 = limb.findIndex((q) => (q.x as number) <= x && x < (q.x as number) + (q.w as number));
    if (i0 < 0) return near;
    const y = limb[i0]?.y as number;
    const inPad = (q: Json) => (q.x as number) < x + half && x - half < (q.x as number) + (q.w as number);
    for (const q of limb) if (inPad(q)) q.y = y;
    const ease = (step: 1 | -1) => {
      let prev: Json | undefined;
      for (let i = i0; i >= 0 && i < limb.length; i += step) {
        const q = limb[i] as Json;
        if (prev) {
          const joined =
            step > 0
              ? Math.abs((prev.x as number) + (prev.w as number) - (q.x as number)) < 2
              : Math.abs((q.x as number) + (q.w as number) - (prev.x as number)) < 2;
          if (!joined) break;
          const py = prev.y as number;
          if (!inPad(q)) q.y = Math.max(py - 12, Math.min(py + 12, q.y as number));
        }
        prev = q;
      }
    };
    ease(1);
    ease(-1);
    return y;
  }

  /** Lifts any glint that ended up inside a solid (an arc's foot in a rolling top) clear of it; returns the data. */
  finish(): Json {
    const R = 22;
    const inside = (x: number, y: number) =>
      this.data.solids.some(
        (q) =>
          x + R > (q.x as number) &&
          x - R < (q.x as number) + (q.w as number) &&
          y + R > (q.y as number) &&
          y - R < (q.y as number) + (q.h as number),
      );
    for (const p of this.data.pickups) {
      let guard = 0;
      while (inside(p.x as number, p.y as number) && guard++ < 40) p.y = (p.y as number) - 16;
    }
    return this.data;
  }

  /** A rotten bark wall standing on the limb at x (its foot on the highest top under it). */
  barkWall(id: string, x: number, near: number, w = 64, h = 256): this {
    const top = this.top(x + w / 2, near, w / 2);
    return this.add('bark', { id, x, y: top - h, w, h });
  }

  /** A spot to stand a thing on near x: the centre of the nearest rect (>= 64 wide) no lower than its neighbours. */
  spot(x: number, near: number): [number, number] {
    const rects = this.data.solids
      .filter((q) => Math.abs((q.y as number) - near) <= 40 && (q.tag as string) === 'branch')
      .sort((a, b) => (a.x as number) - (b.x as number));
    let best: [number, number] = [x, near];
    let bestD = Number.POSITIVE_INFINITY;
    rects.forEach((q, i) => {
      const qx = q.x as number;
      const qw = q.w as number;
      const qy = q.y as number;
      const prev = rects[i - 1];
      const next = rects[i + 1];
      const higher = (o: Json | undefined) =>
        o !== undefined && Math.abs((o.x as number) + (o.w as number) - qx) < 2 && (o.y as number) < qy;
      const higherNext =
        next !== undefined && Math.abs(qx + qw - (next.x as number)) < 2 && (next.y as number) < qy;
      if (qw < 64 || higher(prev) || higherNext) return;
      const d = Math.abs(qx + qw / 2 - x);
      if (d < bestD) {
        bestD = d;
        best = [Math.round(qx + qw / 2), qy];
      }
    });
    return best;
  }

  override pod(
    id: string,
    x: number,
    top: number,
    regrow = 1200,
    mount: 'sit' | 'hang' = 'sit',
    hp?: number,
  ): this {
    if (mount === 'hang') return super.pod(id, x, top, regrow, mount, hp);
    const [sx, sy] = this.spot(x, top);
    return super.pod(id, sx, sy, regrow, mount, hp);
  }

  exit(id: string, edge: 'n' | 's' | 'e' | 'w', from: number, to: number, more: Json = {}): this {
    return this.add('exits', { id, edge, from, to, ...more });
  }

  /** A side exit 4 tiles tall standing on a floor at `floor`. */
  side(id: string, edge: 'e' | 'w', floor: number, more: Json = {}): this {
    return this.exit(id, edge, floor - 256, floor, more);
  }

  place(id: string, x: number, y: number, note?: string): this {
    return this.mark('places', note ? { id, x, y, note } : { id, x, y });
  }

  cover(id: string, x: number, y: number, w: number, h: number): this {
    return this.mark('covers', { id, x, y, w, h });
  }

  landmark(id: string, kind: string, x: number, y: number): this {
    return this.mark('landmarks', { id, kind, x, y });
  }

  burrback(id: string, x: number, top: number, facing: 1 | -1, radius: number, more: Json = {}): this {
    return this.enemy({
      id,
      kind: 'burrback',
      x,
      y: this.pad(x, top, 110),
      facing,
      radius,
      senses: 'always',
      ...more,
    });
  }

  juvenile(id: string, x: number, top: number, facing: 1 | -1, radius: number, more: Json = {}): this {
    return this.enemy({
      id,
      kind: 'juvenileBurrback',
      x,
      y: this.pad(x, top, 80),
      facing,
      radius,
      senses: 'always',
      ...more,
    });
  }

  flyer(
    kind: 'lampwing' | 'hawker',
    id: string,
    x: number,
    y: number,
    facing: 1 | -1,
    more: Json = {},
  ): this {
    return this.enemy({ id, kind, x, y, facing, senses: 'always', ...more });
  }

  shotStops(stops: Array<[string, number, number]>): this {
    return this.set('shots', {
      wide: stops.map(([name, x, y]) => ({ name, x, y })),
      closeup: { ground: [stops[0]?.[1] ?? 0, stops[0]?.[2] ?? 0] },
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The hatching branch: wood-hatch's layout as it is (the opening is quiet in every reference), its drop now
// leading into the Crossing.

function hatch(): Json {
  const src = JSON.parse(readFileSync('content/rooms/wood-hatch.json', 'utf8')) as Json;
  return { ...src, id: 'cn-hatch', title: 'The hatching branch', abilities: [] };
}

// ---------------------------------------------------------------------------------------------------------------
// The Crossing (hub). She lands from the hatch's drop on the Fork; the save is under her. West: the Thornlimb.
// East: the Lamp Grove. Seen from the landing and shut: the high west limb (claws, the way back from the
// Thornlimb), the seed door in the root floor (three sockets). Quiet: no creature (Dirtmouth, the Pavilion).

function hub(): Json {
  const r = new Wood('cn-hub', 'The Crossing', 5120, 2816, [2000, 1080], 7101, {
    art: { anchorY: 1300 },
  });
  r.tree('lampoak', 2496, 256, -500, 2816, false);
  r.limb('fork-w', 768, 2496, 1088, { parent: 'lampoak', grows: 'west', end: 'fork', flat: [[1536, 1888]] });
  r.limb('w1', 0, 640, 1152, { parent: 'fork-w', grows: 'west', end: 'tip' });
  r.side('west', 'w', 1152);
  r.limb('fork-e', 2752, 4032, 1216, { parent: 'lampoak', grows: 'east', end: 'knee' });
  r.limb('e1', 4032, 5120, 1312, { parent: 'fork-e', grows: 'east', end: 'tip' });
  r.side('east', 'e', 1312);
  // The high west limb: the Thornlimb's upper way comes back in here and drops onto the Fork (a loop).
  r.limb('hw', 0, 1152, 704, { parent: 'fork-w', grows: 'west', end: 'tip' });
  r.side('west-high', 'w', 704);
  // The root floor under it all, the seed door in it, rungs (twig stubs off the lampoak) back up.
  r.limb('roots-w', 0, 2304, 2368, { parent: 'lampoak', grows: 'west', end: 'tip', h: 160 });
  r.limb('roots-e', 2560, 5120, 2368, { parent: 'lampoak', grows: 'east', end: 'tip', h: 160 });
  r.add('gates', { id: 'seed-door', x: 2304, y: 2368, w: 256, h: 64, flag: 'seeds:3', kick: false });
  r.exit('door', 's', 2304, 2560);
  for (const y of [2176, 1984, 1792, 1600, 1408]) r.oneWay(2528, y, 192, 'branch');
  r.add('patches', { id: 'p-crossing', x: 1700, y: r.top(1700, 1088) });
  // The arrival from the hatch's drop (world 6144-7424 on this room's top).
  r.exit('from-hatch', 'n', 1792, 3072);
  // The canopy's drop lands on the east fork (a shortcut opened by the glide).
  r.exit('from-canopy', 'n', 3648, 3968);
  // Secret: a room at the west end of the root floor behind a rotten bark wall and a root mass (King's Pass's
  // hidden room at the far left; HK's breakable walls are 18 of its 26 secrets).
  r.barkWall('cache-wall', 384, 2368);
  r.cover('cache-cover', 0, 2048, 448, 320);
  r.add('pickups', { id: 'cache-great', kind: 'great', x: 200, y: 2300 });
  r.hoard('cache-', 64, 2240, 280, 80, 6);
  r.pod('pod-cache', 300, 2368, 1200, 'sit', 2);
  // A little to take on the way: arcs over the gaps, pods by the rungs.
  r.arc('gap-', 2440, 2800, 1180, 120, 5);
  r.glints('fork-', [
    [1100, 1040],
    [1240, 1030],
    [1380, 1040],
  ]);
  r.add('catches', { id: 'under-w', x: 0, y: 2600, w: 2304, h: 216 });
  r.add('catches', { id: 'under-e', x: 2560, y: 2600, w: 2560, h: 216 });
  r.landmark('seed-door', 'goal', 2432, 2368);
  r.place('mid', 1700, 1088);
  r.place('roots', 1200, 2368);
  r.place('hw', 600, 704);
  r.shotStops([
    ['landing', 1900, 1088],
    ['east-fork', 3300, 1216],
    ['roots', 2000, 2368],
    ['high', 700, 704],
  ]);
  r.route('mid', 'west');
  r.route('mid', 'east');
  r.route('mid', 'p-crossing');
  r.route('mid', 'from-hatch', { oneWay: true });
  r.route('from-hatch', 'mid', { oneWay: true });
  r.route('from-canopy', 'mid', { oneWay: true });
  r.route('west-high', 'mid', { oneWay: true });
  r.route('mid', 'door', { flags: ['seeds:3'] });
  return r.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// The Thornlimb (west): down and west through a burrback, a rotten bark wall, thorns, a seed on a side stub, to the
// claws in a well between two broken trees at the far, low end (Ori's Sein and Wall Jump). The well can only be
// left with the claws; the climb goes on up the Elder to the upper limbs, which run back east to the Crossing's
// high limb (the first loop). The upper way is woken by the claws: a burrback pair and a lampwing (Ori's three
// Hoppers right after Sein).

function west(): Json {
  const r = new Wood('cn-west', 'The Thornlimb', 6144, 2816, [5800, 1150], 7202, { art: { anchorY: 1500 } });
  r.tree('eastoak', 4608, 192, -500, 2816, false);
  r.limb('l1', 4800, 6144, 1152, { parent: 'eastoak', grows: 'east', end: 'tip' });
  r.side('hub', 'e', 1152);
  r.limb('l2', 3584, 4608, 1344, { parent: 'eastoak', grows: 'west', end: 'fork' });
  r.burrback('burr-l2', 4100, 1344, 1, 380);
  // The seed stub just under the fork's end: a drop off L2 lands on it.
  r.limb('stub', 3200, 3456, 1408, { parent: 'l2', grows: 'west', end: 'tip', h: 64 });
  r.add('moonseeds', { id: 'seed-thorn', x: 3300, y: 1340 });
  r.limb('l3', 2240, 3328, 1568, { parent: 'l2', grows: 'west', end: 'snap' });
  r.barkWall('rot-wall', 2560, 1568);
  r.glints('behind-rot-', [
    [2440, 1520],
    [2360, 1520],
    [2280, 1520],
  ]);
  r.flyer('lampwing', 'wing-l3', 2900, 1250, -1, { radius: 220 });
  r.limb('l4', 1152, 2176, 1792, { parent: 'l3', grows: 'west', end: 'snap', skip: [[1472, 1664]] });
  r.add('bark', { id: 'crawl-floor', x: 1472, y: 1792, w: 192, h: 96, floor: true });
  r.add('thorns', { id: 'thorn-l4', x: 1792, y: 1764, w: 224, h: 28 });
  r.juvenile('juv-l4', 1350, 1792, 1, 160);
  // Secret: the crawlspace under the rotten panel (a hollow with an upgrade), out by the hole again.
  r.limb('crawl', 1216, 1920, 2016, { parent: 'l4', grows: 'west', end: 'tip', h: 64 });
  r.cover('crawl-cover', 1152, 1888, 832, 192);
  r.add('hollows', { id: 'keen-hollow', x: 1280, y: 1904, w: 160, h: 112, upgrade: 'keenBlade' });
  r.hoard('crawl-', 1600, 1950, 260, 50, 5);
  // The claws: a well between the Elder (west) and the Twin (a broken stump), the glade on its floor.
  r.tree('elder', 448, 192, 960, 2816, true, true);
  r.tree('twin', 896, 192, 1856, 2816, true, true);
  r.limb('well-floor', 640, 896, 2304, {
    parent: 'elder',
    grows: 'east',
    end: 'trunk',
    h: 128,
    flat: [[640, 896]],
  });
  r.add('glades', { id: 'glade-claws', x: 660, y: 2080, w: 216, h: 224, ability: 'wallJump' });
  r.add('pickups', { id: 'claw-prize', kind: 'great', x: 768, y: 1980 });
  r.add('patches', { id: 'p-well', x: 768, y: r.top(768, 2304) });
  // Up the Elder to the upper limbs, east along them, back to the Crossing's high limb.
  r.limb('ul', 832, 2560, 960, { parent: 'elder', grows: 'east', end: 'burl' });
  r.limb('ul2', 2560, 4608, 960, { parent: 'ul', grows: 'east', end: 'fork', tilt: -256 });
  r.limb('ul3', 4800, 6144, 704, { parent: 'eastoak', grows: 'east', end: 'tip' });
  r.side('hub-high', 'e', 704);
  r.burrback('burr-ul-1', 1500, 960, 1, 420, { wakes: 'wallJump' });
  r.burrback('burr-ul-2', 2200, 960, -1, 300, { wakes: 'wallJump' });
  r.flyer('lampwing', 'wing-ul', 3600, 560, -1, { radius: 240, wakes: 'wallJump' });
  // Secret: a niche over the upper fork, behind leaves (only with the claws: a kick off the eastoak).
  r.limb('niche', 4864, 5376, 448, { parent: 'eastoak', grows: 'east', end: 'tip', h: 64 });
  r.cover('niche-cover', 4832, 288, 640, 224);
  r.add('pickups', { id: 'niche-great', kind: 'great', x: 5200, y: 390 });
  r.pod('pod-niche', 5000, 448, 1200, 'sit', 2);
  // The way down: glints say "this way" on each drop.
  r.arc('drop-l2-', 4560, 4700, 1250, 60, 3);
  r.glints('l2-', [
    [3900, 1300],
    [3760, 1300],
  ]);
  r.arc('l3l4-', 2150, 2280, 1700, 80, 3);
  r.glints('ul-', [
    [1000, 910],
    [1150, 905],
    [3000, 830],
    [3200, 820],
  ]);
  r.pod('pod-l3', 3000, 1568, 1200, 'sit');
  r.pod('pod-ul', 2700, 912, 1200, 'sit', 2);
  r.add('catches', { id: 'below', x: 1088, y: 2500, w: 5056, h: 316 });
  r.add('catches', { id: 'west-void', x: 0, y: 2500, w: 448, h: 316 });
  r.place('mid', 4000, 1344);
  r.place('well', 768, 2304);
  r.place('upper', 2000, 960);
  r.shotStops([
    ['entry', 5600, 1152],
    ['seed', 3400, 1344],
    ['rot', 2800, 1568],
    ['thorns', 1900, 1792],
    ['well', 768, 2304],
    ['upper', 1800, 960],
    ['upper-east', 5200, 704],
  ]);
  r.route('mid', 'hub');
  r.route('mid', 'seed-thorn');
  r.route('mid', 'well', { oneWay: true });
  r.route('well', 'glade-claws');
  r.route('well', 'p-well');
  r.route('mid', 'keen-hollow');
  r.route('well', 'upper', { needs: ['wallJump'] });
  r.route('upper', 'hub-high');
  r.route('upper', 'mid');
  return r.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// The Lamp Grove (east): the dense clearing, three tiers on the Grovemother and two lesser trees. At grove density
// (a burrback per tier, two lampwings, a dangler over the landing, glints, pods, bark, a cap), a seed at the top,
// and at the east edge the Spire: the claw climb up into the high canopy.

function grove(): Json {
  const r = new Wood('cn-grove', 'The Lamp Grove', 5376, 2816, [200, 1300], 7303, { art: { anchorY: 1250 } });
  r.side('hub', 'w', 1312);
  r.tree('mother', 1792, 320, -500, 2816, false);
  r.tree('lesser', 3456, 224, -500, 2816, false);
  r.tree('spire', 5184, 192, -500, 2816, true, 'west');
  // Up and over: the entry floor, a step, over the Grovemother to the crown, down past the lesser tree to the Spire.
  r.limb('lo-a', 0, 1280, 1312, { parent: 'mother', grows: 'west', end: 'tip', flat: [[448, 768]] });
  r.limb('step-1', 1408, 1792, 1120, { parent: 'mother', grows: 'west', end: 'tip' });
  r.limb('step-2', 2112, 2752, 928, { parent: 'mother', grows: 'east', end: 'fork' });
  r.limb('crown-a', 2880, 3456, 736, { parent: 'step-2', grows: 'east', end: 'trunk' });
  r.limb('down-1', 3680, 4352, 1056, { parent: 'lesser', grows: 'east', end: 'fork' });
  r.limb('down-2', 4480, 5184, 1344, { parent: 'down-1', grows: 'east', end: 'trunk' });
  // The pit under it all: anything that falls lands here, among the most to do. Caps throw her back up.
  r.limb('pit', 1536, 4416, 1600, {
    parent: 'mother',
    grows: 'east',
    end: 'fork',
    skip: [
      [2304, 2432],
      [3264, 3392],
    ],
  });
  r.add('caps', { id: 'cap-west', x: 2304, y: 1600, w: 128, h: 64, tier: 'big' });
  r.add('caps', { id: 'cap-east', x: 3264, y: 1600, w: 128, h: 64, tier: 'mid' });
  r.add('moonseeds', { id: 'seed-grove', x: 3168, y: 640 });
  // Creatures: grove density (2.9 a screen in the test grove; HK's densest rooms 4-5.5) over the pit and crown.
  r.juvenile('juv-lo', 900, 1312, -1, 300);
  r.burrback('burr-step', 2450, 928, 1, 220, { fenced: true });
  r.burrback('burr-pit-w', 1900, 1600, 1, 300);
  r.burrback('burr-pit-e', 3800, 1600, -1, 400);
  r.burrback('burr-down', 4000, 1056, -1, 260, { fenced: true });
  r.flyer('lampwing', 'wing-a', 1700, 820, 1, { radius: 220 });
  r.flyer('lampwing', 'wing-b', 3700, 560, -1, { radius: 220 });
  r.enemy({ id: 'dang-crown', kind: 'dangler', x: 3000, y: 850, facing: 1, senses: 'always' });
  r.flyer('hawker', 'hawk-spire', 4800, 900, -1, { radius: 240 });
  // Lamps, glints on every arc, pods to cut, rotten bark with a hoard behind.
  r.lamp('wick-a', 1900, 940);
  r.lamp('wick-b', 3560, 820);
  r.glints('lo-a-', [
    [300, 1270],
    [420, 1260],
    [540, 1270],
  ]);
  r.arc('s1-', 1290, 1420, 1200, 90, 3);
  r.arc('mother-', 1800, 2100, 1000, 140, 5);
  r.arc('crown-', 2760, 2880, 840, 80, 3);
  r.arc('lesser-', 3460, 3680, 760, 60, 4);
  r.arc('d2-', 4360, 4480, 1180, 60, 3);
  r.glints('pit-', [
    [1700, 1560],
    [2000, 1555],
    [2700, 1560],
    [2850, 1555],
    [3000, 1560],
    [3600, 1555],
    [4100, 1560],
  ]);
  r.pod('pod-step', 2650, 928, 1200, 'sit');
  r.pod('pod-crown', 3350, 736, 1200, 'sit', 2);
  r.pod('pod-pit', 2600, 1600, 1200, 'sit');
  r.pod('pod-down', 5000, 1344, 1200, 'sit');
  r.pod('pod-hang', 4000, 1168, 1200, 'hang');
  r.barkWall('rot-pit', 4224, 1600);
  r.hoard('rot-pit-', 4290, 1500, 120, 70, 4);
  // Secret: a nook in the Grovemother's crown behind its leaves (a jump up off the step's root end).
  r.limb('nook', 1984, 2304, 704, { parent: 'mother', grows: 'east', end: 'tip', h: 64 });
  r.cover('nook-cover', 1920, 544, 448, 192);
  r.add('hollows', { id: 'eyes-hollow', x: 2080, y: 592, w: 160, h: 112, upgrade: 'nightEyes' });
  // The climb: the Spire's west face, from the last limb up out of the top.
  r.exit('canopy', 'n', 4928, 5184);
  r.add('patches', { id: 'p-grove', x: 600, y: r.top(600, 1312) });
  r.add('catches', { id: 'below', x: 0, y: 1900, w: 5184, h: 916 });
  r.place('mid', 700, 1312);
  r.place('top', 3100, 736);
  r.place('pit', 2800, 1600);
  r.shotStops([
    ['entry', 500, 1312],
    ['mother', 1600, 1120],
    ['crown', 3100, 736],
    ['pit', 2800, 1600],
    ['spire', 4900, 1344],
  ]);
  r.route('mid', 'hub');
  r.route('mid', 'p-grove');
  r.route('mid', 'top');
  r.route('mid', 'pit');
  r.route('pit', 'mid');
  r.route('mid', 'seed-grove');
  r.route('mid', 'eyes-hollow');
  r.route('mid', 'canopy', { needs: ['wallJump'] });
  return r.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// The high canopy: in from the Spire's top in the east, west along limbs and two broken trees (claw kicks), up to
// the moonlit crown at the east end, where the glide is (a dead end that pays). The glide crosses the wide gap west
// (a one-way: too wide for anything else) to the far limb with the third seed, which drops into the Crossing.

function canopy(): Json {
  const r = new Wood('cn-canopy', 'The high canopy', 7424, 2816, [7000, 1080], 7404, {
    art: { anchorY: 1100, moon: { x: 1500, y: 200, r: 96 } },
  });
  r.exit('grove', 's', 6976, 7232);
  r.tree('spire', 7232, 192, 1088, 2816, true, 'west');
  r.limb('cl', 5632, 7040, 1088, { parent: 'spire', grows: 'west', end: 'fork' });
  r.limb('t2', 4416, 5440, 1024, { parent: 'cl', grows: 'west', end: 'snap' });
  r.flyer('hawker', 'hawk-cl', 6200, 760, -1, { radius: 280 });
  // A broken tree: a claw climb up its east face from the limb's end to the crown band.
  r.tree('kin-b', 4032, 192, 448, 2816, true, 'east');
  r.limb('crown-1', 4416, 5632, 448, { parent: 'kin-b', grows: 'east', end: 'fork' });
  r.limb('crown-2', 5888, 7040, 384, { parent: 'crown-1', grows: 'east', end: 'tip', flat: [[6144, 6912]] });
  r.enemy({ id: 'dang-t2', kind: 'dangler', x: 4900, y: 570, facing: -1, senses: 'always' });
  r.flyer('lampwing', 'wing-crown', 5000, 220, 1, { radius: 240 });
  r.add('glades', { id: 'glade-glide', x: 6500, y: 160, w: 400, h: 224, ability: 'glide' });
  r.add('patches', { id: 'p-crown', x: 6300, y: r.top(6300, 384) });
  r.landmark('crown', 'landmark', 6700, 384);
  // West of the shaft: the wide gap, the far limb (only on the wing), the seed, the drop into the Crossing.
  r.tree('far', 1536, 224, -500, 2816, false);
  r.limb('far-limb', 896, 1536, 1344, { parent: 'far', grows: 'west', end: 'tip' });
  r.limb('far-lip', 1760, 2560, 1408, { parent: 'far', grows: 'east', end: 'snap' });
  r.add('moonseeds', { id: 'seed-far', x: 1100, y: 1280 });
  r.flyer('hawker', 'hawk-far', 1300, 1000, 1, { radius: 260 });
  r.exit('hub', 's', 576, 896, { oneWay: true });
  // Secret: a ledge in a leaf mass on the glide's line over the gap (a held glide from the crown passes through it).
  r.limb('sky-stub', 2816, 3200, 896, { parent: 'kin-b', grows: 'west', end: 'tip', h: 48 });
  r.cover('sky-cover', 2752, 704, 512, 256);
  r.add('hollows', { id: 'wings-hollow', x: 2900, y: 784, w: 160, h: 112, upgrade: 'quickWings' });
  r.arc('gap-', 2700, 3600, 600, 200, 8);
  r.glints('cl-', [
    [6900, 1040],
    [6700, 1030],
    [6500, 1040],
  ]);
  r.glints('crown-', [
    [4400, 400],
    [4600, 390],
    [4800, 400],
    [5000, 390],
  ]);
  r.pod('pod-t2', 4600, 1024, 1200, 'sit', 2);
  r.pod('pod-far', 1200, 1344, 1200, 'sit');
  r.add('catches', { id: 'below-w', x: 0, y: 2000, w: 576, h: 816 });
  r.add('catches', { id: 'below', x: 896, y: 2000, w: 6080, h: 816 });
  r.place('east', 6400, 1088);
  r.place('crown', 6300, 384);
  r.place('far', 1000, 1344);
  r.shotStops([
    ['arrive', 6900, 1088],
    ['climb', 4500, 1024],
    ['crown', 6300, 384],
    ['gap', 3000, 448],
    ['far', 1100, 1344],
  ]);
  r.route('grove', 'east', { needs: ['wallJump'] });
  r.route('east', 'crown', { needs: ['wallJump'] });
  r.route('crown', 'glade-glide');
  r.route('crown', 'p-crown');
  r.route('crown', 'far', { needs: ['glide'], oneWay: true });
  r.route('far', 'seed-far');
  r.route('far', 'wings-hollow', { needs: ['glide'] });
  r.route('far', 'hub', { oneWay: true });
  return r.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// The den under the seed door: a save, the old burrback's floor, its gate; past it the way on (the area's end).

function den(): Json {
  const r = new Wood('cn-den', 'The burrow under the roots', 5120, 1856, [2432, 900], 7505, {
    art: { anchorY: 1000 },
  });
  r.exit('door', 'n', 2304, 2560);
  r.tree('west-root', 0, 320, -500, 1856, true);
  r.limb('ledge', 1792, 3072, 960, { parent: 'west-root', grows: 'east', end: 'tip', flat: [[2112, 2496]] });
  r.add('patches', { id: 'p-den', x: 2300, y: r.top(2300, 960) });
  r.limb('floor', 320, 4864, 1408, {
    parent: 'west-root',
    grows: 'east',
    end: 'trunk',
    h: 160,
    skip: [[1600, 1792]],
  });
  // A broken stump under the ledge's west end: the claw climb back up to the save.
  r.tree('den-stump', 1600, 192, 960, 1856, true, 'west');
  r.tree('east-root', 4864, 256, -500, 1856, true);
  r.enemy({
    id: 'old-burr',
    kind: 'oldBurrback',
    x: 1400,
    y: r.pad(1400, 1408, 200),
    facing: 1,
    radius: 1500,
    sets: 'cn-den-down',
  });
  r.add('gates', {
    id: 'root-gate',
    x: 4544,
    y: r.top(4608, 1408, 64) - 256,
    w: 128,
    h: 256,
    flag: 'cn-den-down',
    kick: false,
  });
  r.barkWall('den-rot', 640, 1408);
  r.hoard('den-rot-', 400, 1300, 200, 80, 6);
  r.add('triggers', { id: 'way-on', x: 4704, y: 1100, w: 128, h: 280, sets: 'cn-area-end' });
  r.landmark('vista', 'vista', 4760, 1408);
  r.place('top', 2300, 960);
  r.place('floor', 2600, 1408);
  r.shotStops([
    ['ledge', 2300, 960],
    ['floor', 1600, 1408],
    ['gate', 4200, 1408],
  ]);
  r.route('door', 'top', { oneWay: true });
  r.route('top', 'p-den');
  r.route('top', 'floor', { oneWay: true });
  // (The gate opens on the old burrback's death: an enemy's `sets` the world check cannot see, so no flag here.)
  r.route('floor', 'way-on');
  r.route('floor', 'top', { needs: ['wallJump'] });
  return r.finish();
}

export function buildCanopy(): { rooms: Json[]; world: Json } {
  const rooms = [hatch(), canopy(), west(), hub(), grove(), den()];
  // The hatch's drop leads into the Crossing (wood-hatch's exit as it is).
  const world = {
    start: 'cn-hatch',
    rooms: [
      { id: 'cn-hatch', x: 0, y: 0 },
      { id: 'cn-canopy', x: 7424, y: 0 },
      { id: 'cn-west', x: -1792, y: 2816 },
      { id: 'cn-hub', x: 4352, y: 2816 },
      { id: 'cn-grove', x: 9472, y: 2816 },
      { id: 'cn-den', x: 4352, y: 5632 },
    ],
    tests: [],
  };
  return { rooms, world };
}

if (process.argv[1]?.endsWith('canopy.ts')) {
  const { rooms, world } = buildCanopy();
  writeFileSync(OUT_ROOMS, `${JSON.stringify(rooms, null, 1)}\n`);
  writeFileSync(OUT_WORLD, `${JSON.stringify(world, null, 2)}\n`);
  console.log(`wrote ${OUT_ROOMS} (${rooms.length} rooms) and ${OUT_WORLD}`);
}
