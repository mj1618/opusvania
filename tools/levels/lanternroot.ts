/**
 * Lanternroot, prototype level 1 (docs/design/levels/proto-1.md, memory/lanternroot.md): generates its four rooms
 * (content/rooms/lr-night.json, lr-hall.json, lr-roots.json, lr-cache.json). Run `npx tsx tools/levels/lanternroot.ts`
 * after an edit; the rooms are checked by `parseScene` and played by the solver (tests/unit/proto-1-solve.test.ts).
 *
 * World placement (content/worlds/proto-1.json): the night at (0, 0), the hall under it at (0, 1536), the roots under
 * that at (0, 3072); the cache, through the knot door, off to the east at (7680, 0). Each layer room is 5760 x 1536:
 * three camera chambers of 1920 (A, B, C west to east). Exit spans match on both sides (world.md §5.5).
 *
 * Numbers to lay out by (memory/movement-controller.md "Reach", measured flings): a jump rises 272 and carries ~410;
 * a double jump adds 192 (464 in all); a wall kick climbs any face that takes kicks (one face is enough: so every
 * face that must not be climbed is `kick: false`); a glide covers ~141 px per 64 px of drop. A fling off a flame,
 * held up-right, rises ~237 and is back at the flame's height ~640 px on; held up, it rises ~365; a double jump after
 * it adds ~190. Moonwicks light 420 px: moss within that is solid while one burns.
 */
import { execFileSync } from 'node:child_process';
import { ARRIVALS, EDGES } from './lanternroot-graph';
import { RoomBuilder } from './lib';

const OUT = 'content/rooms';
const W = 5760;
const H = 1536;
const ABIL = ['glide', 'wallJump', 'doubleJump'];
/** Glow pods regrow in a minute (review r1: the meter was full 30 s in); the arena's in 20 s (the fight's fuel). */
const POD_REGROW = 3600;
/** The crown end's top: 560 over the gully's lip (a double jump rises 464: L-a1's fling is the way up). */
const CROWN = 740;
/** The vault's buds burn this long (the route round each wall outruns one: the fan is the way). */
const VAULT_BURN = 300;
/** First Light's bud (M-a3) burns 4 s (its last 2 a gutter): the climb to M-a3b's ledge spends most of it. */
const FIRST_LIGHT_BURN = 240;
const ARENA_REGROW = 1200;

/** A camera chamber: locked to its 1920 x 1536, the slide between chambers 20 frames. */
function chambers(r: RoomBuilder, ids: [string, string, string], y = 0, h = H): void {
  const zones = ids.map((id, i) => ({ id, x: i * 1920, y, w: 1920, h, lock: true, frames: 20 }));
  r.set('camera', { zones });
  for (const z of zones) r.mark('chambers', { id: z.id, x: z.x, y: z.y, w: z.w, h: z.h });
}

function place(r: RoomBuilder, id: string, x: number, y: number, note?: string): void {
  r.mark('places', note ? { id, x, y, note } : { id, x, y });
}

// ---------------------------------------------------------------------------------------------------------------
// lr-night: the moonlit crown (A1), the trunk's back (B1), the root plate (C1). Silver: the wood kit at canopy height.
// ---------------------------------------------------------------------------------------------------------------
function night(): RoomBuilder {
  const r = new RoomBuilder('lr-night', W, H, [620, 1300], {
    title: 'Lanternroot: the crown, the trunk, the plate',
    region: 'lanternroot',
    edgeKick: false,
    abilities: ABIL,
    glow: true,
    senses: 'lamp',
    art: { mode: 'painted', kit: 'lanternroot', band: 'night', seed: 101 },
  });
  // --- A1 the Crown Fall (0..1920). The ridge, the hollow log west, the split, the gully, the crown end.
  r.solid(0, 1300, 1088, 236, 'ground', 'east'); // the ridge (its east face is the split's west wall)
  // The hollow log (H1): its shell over a dark limb; its mouth a rotten-bark seal (3 cuts); its far end cracked to the sky.
  r.solid(0, 1100, 400, 50, 'trunk', false);
  r.add('bark', { id: 'seal-log', x: 340, y: 1150, w: 40, h: 150, kick: false });
  r.add('hollows', { id: 'h1', x: 40, y: 1170, w: 260, h: 130, upgrade: 'longBreath' });
  r.add('signs', { id: 's1', x: 150, y: 1300, rhythm: '.-.-' });
  r.mark('covers', { id: 'cover-log', x: 0, y: 1100, w: 380, h: 200, opens: 'lr-night:seal-log' });
  r.mark('moonholes', { x: 24, y: 1104 });
  r.add('patches', { id: 'p-a1', x: 500, y: 1300 });
  // The night sky is open, but she flies no higher than the room's top (the plate's west wall is sheer to it).
  r.set('ceilingY', 0);
  // The stone and M-a1, cold by the spawn; kindled, moss climbs the crown's dead limbs to the crow's nest.
  r.solid(760, 1236, 80, 64, 'root', false);
  r.moonwick('m-a1', 800, 1186);
  for (const [i, [x, y]] of (
    [
      [860, 1150],
      [680, 1020],
      [840, 890],
      [660, 790],
    ] as const
  ).entries())
    r.add('moonmoss', { id: `moss-nest${i + 1}`, x, y, w: 120, h: 20 });
  // The crow's nest: a hollow in the crown's dead limbs high over the spawn, open only from below (the last step
  // from the moss wants a perfect double jump or a gust hop): no glide or fling from afar can enter it.
  r.solid(420, 280, 260, 40, 'branch', false); // its roof
  r.solid(420, 320, 20, 100, 'branch', false); // west wall
  r.solid(440, 420, 140, 30, 'branch', false); // its floor (the hoard)
  r.solid(680, 280, 24, 200, 'branch', false); // east wall, down past the gap
  r.hoard('g-nest', 450, 340, 120, 70, 20);
  r.pod('pod-nest', 640, 320, POD_REGROW, 'hang');
  // (A pod on the log's back and one on the crown end: what renews on the night's revisits.)
  r.pod('pod-log', 240, 1100, POD_REGROW);
  r.pod('pod-crown', 1760, CROWN, POD_REGROW);
  r.mark('landmarks', { id: 'crows-nest', kind: 'nest', x: 540, y: 380 });
  // The first exchange: a juvenile in the ferns; a glint arc over it; a glow pod in the ferns.
  // (Its range ends 380 px short of the patch: no predator in sight of a re-form.)
  r.enemy({
    id: 'j-a1',
    kind: 'juvenileBurrback',
    x: 1000,
    y: 1300,
    facing: -1,
    senses: 'always',
    radius: 120,
  });
  r.arc('g-a1-', 860, 1060, 1230, 110, 6);
  r.pod('pod-a1', 1040, 1300, POD_REGROW);
  // Glints on the moss's climb to the nest (taken only with M-a1 burning: the night's Kindle revisit).
  r.glints('g-moss-', [
    [920, 1100],
    [740, 970],
    [900, 840],
    [720, 740],
  ]);
  r.mark('calm', { x: 860, y: 1220, w: 220, h: 80 });
  // The split (1088..1344): a drop into the hall; its two walls take kicks (the way back up).
  r.solid(1344, 1300, 64, 236, 'ground', 'west'); // the lip
  r.add('exits', { id: 'split', edge: 's', from: 1088, to: 1344 });
  // The thorn gully and the first warm lamp over it: the first fling lands on the crown end, which stands 560 over
  // the lip (a double jump rises 464: the fling is the only way up; its face takes no kick).
  r.solid(1408, 1460, 256, 76, 'root', false);
  r.add('thorns', { id: 't-gully', x: 1408, y: 1420, w: 256, h: 40 });
  r.lamp('l-a1', 1480, 1020);
  r.add('catches', { id: 'c-gully', x: 1408, y: 1380, w: 256, h: 40 });
  // (Glints along the fling's flight up-right: the first flight collects them.)
  r.glints('g-fling-', [
    [1540, 930],
    [1590, 860],
    [1640, 800],
  ]);
  // A hawker over the crown end, hunting the landing (its kill is the night's first big glow).
  r.enemy({ id: 'h-a1', kind: 'hawker', x: 1880, y: 480, facing: -1, senses: 'always', radius: 160 });
  // --- The trunk: the crown end (1664) and the trunk's back rolling east to the plate (B1).
  const tops: Array<[number, number, number]> = [
    [1664, 1800, CROWN],
    [1800, 1984, 912],
    // (1984..2240: the knot panel)
    [2240, 2432, 896],
    [2432, 2700, 888],
    // (2700..2780: the burl, a rotten-bark lid over a glint pocket)
    [2780, 2880, 884],
    [2880, 3072, 880],
    [3072, 3328, 872],
    [3328, 3584, 868],
    [3584, 3840, 864],
  ];
  for (const [x0, x1, y] of tops) r.solid(x0, y, x1 - x0, H - y, 'trunk', false);
  // The knot: a floor panel of rotten bark on the trunk's back (3 down cuts); under it a shaft down into the hall.
  r.add('bark', { id: 'knot', x: 1984, y: 908, w: 256, h: 40, floor: true, kick: false });
  r.add('exits', { id: 'knot', edge: 's', from: 1984, to: 2240, oneWay: true });
  // The burl: a lid of rotten bark (3 down cuts) over a pocket in the trunk, five glints in it.
  r.add('bark', { id: 'burl', x: 2700, y: 886, w: 80, h: 30, floor: true, kick: false });
  r.solid(2700, 1020, 80, H - 1020, 'trunk', false);
  r.hoard('g-burl-', 2710, 930, 60, 70, 5);
  // --- B1 the Trunk's Back (1920..3840).
  // L-b1c, low over the trunk: an easy fling (it lights the cap: put it out for the Answer).
  r.lamp('l-b1c', 2120, 760);
  r.arc('g-b1-', 2160, 2600, 860, 150, 8);
  r.pod('pod-b1', 2330, 896, POD_REGROW);
  // Juveniles on the trunk's back (fuel, and a reason to look down).
  r.enemy({
    id: 'j-b1a',
    kind: 'juvenileBurrback',
    x: 2560,
    y: 888,
    facing: 1,
    senses: 'always',
    radius: 110,
  });
  r.enemy({
    id: 'j-b1b',
    kind: 'juvenileBurrback',
    x: 2840,
    y: 884,
    facing: -1,
    senses: 'always',
    radius: 50,
  });
  // The sky limb (a Kindle revisit, or L-b1c's fling on a first pass): M-b1 on the trunk lights a moss ladder to a
  // dead limb over the back, eight glints on it.
  r.moonwick('m-b1', 2440, 840);
  for (const [i, [x, y]] of (
    [
      [2520, 760],
      [2380, 650],
      [2520, 550],
      [2400, 450],
    ] as const
  ).entries())
    r.add('moonmoss', { id: `moss-limb${i + 1}`, x, y, w: 110, h: 20 });
  r.solid(2340, 360, 220, 26, 'branch', false);
  r.arc('g-limb-', 2360, 2540, 330, 30, 8);
  // The snapped stub, its thorn faces, the bramble crown on its west shoulder (L-b1a / L-b1b: gust only), the hawker.
  r.solid(3160, 260, 100, 500, 'branch', false);
  r.add('thorns', { id: 't-stub-e', x: 3260, y: 320, w: 30, h: 420 });
  r.add('thorns', { id: 't-bramble', x: 2860, y: 360, w: 300, h: 420 });
  r.lamp('l-b1a', 3030, 500, { sets: 'bramble-a-out' });
  r.lamp('l-b1b', 3030, 630, { sets: 'bramble-b-out' });
  r.enemy({ id: 'h-b1', kind: 'hawker', x: 3100, y: 200, facing: 1, guards: 'l-b1a', radius: 160 });
  // The ember run (optional hard): five warm lamps up the stub's east side; a moon-drop on its broken top.
  r.lamp('l-er1', 3390, 650);
  r.lamp('l-er2', 3400, 380);
  r.lamp('l-er3', 3620, 260);
  r.lamp('l-er4', 3430, 120, { swing: { length: 100, reach: 70, period: 150 } });
  r.lamp('l-er5', 3280, 60);
  r.add('hollows', { id: 'h-er', x: 3160, y: 180, w: 100, h: 80, upgrade: 'moonDrop' });
  r.mark('landmarks', { id: 'ember-run', kind: 'ember-run', x: 3400, y: 400 });
  // The answering cap on the trunk's back, and the sealed knot (the cache door) behind its gate.
  r.add('bells', { id: 'cap', x: 3500, y: 820, rhythm: '-..-', sets: 'answer' });
  r.add('doors', { id: 'cache-door', x: 3720, y: 864, to: 'lr-cache#door' });
  r.add('gates', { id: 'cache-knot', x: 3672, y: 704, w: 96, h: 160, flag: 'answer', kick: false });
  r.mark('landmarks', { id: 'cap', kind: 'bell-cap', x: 3500, y: 868 });
  r.pod('pod-cap', 3620, 864, POD_REGROW);
  // --- C1 the Root Plate (3840..5760): sheer from the west; the chimney up from the hall to the crest.
  const CREST = 300;
  // Sheer from the west, to the top of the sky: the crest is the chimney's (no fling or glide from the trunk).
  r.solid(3840, 0, 160, CREST, 'root', false);
  // The drop west: a chute from the crest's west end out of the plate's face over the trunk. Its lid opens from
  // above (a shortcut down); from the trunk it is a dead end under a shut lid.
  r.solid(3880, 340, 80, 220, 'root', false); // (the chute's inside is 3960..4040)
  r.solid(4040, CREST, 1016, H - CREST, 'root', 'east');
  r.solid(3840, 640, 200, H - 640, 'root', false);
  r.solid(3840, CREST, 40, 260, 'root', false);
  r.solid(3880, CREST, 80, 40, 'root', false);
  r.add('shortcuts', { id: 'crest-lid', x: 3960, y: CREST, w: 80, h: 40, opens: 'n' });
  r.solid(5312, CREST, 448, H - CREST, 'root', 'west');
  r.add('exits', { id: 'chimney', edge: 's', from: 5056, to: 5312 });
  r.add('patches', { id: 'p-c1', x: 4400, y: CREST });
  r.add('signs', { id: 's4', x: 4720, y: CREST, rhythm: '...' });
  r.arc('g-c1-', 4900, 5500, CREST - 40, 120, 7);
  r.add('triggers', { id: 'valley', x: 5560, y: CREST - 200, w: 200, h: 200, sets: 'lanternroot-end' });
  r.mark('landmarks', { id: 'vista', kind: 'vista', x: 5600, y: CREST });
  // Real moonlight (freed moths fly toward it): the log's cracked far end (above), the open sky over the trunk and
  // the crest (the moths stream east at the end).
  r.mark('moonholes', { x: 2700, y: 40 });
  r.mark('moonholes', { x: 5600, y: 120 });
  chambers(r, ['a1', 'b1', 'c1']);
  // Places (the solver's nodes) and routes.
  place(r, 'ridge', 620, 1300);
  place(r, 'log-mouth', 430, 1300);
  place(r, 'nest', 500, 420);
  place(r, 'crown', 1740, CROWN);
  place(r, 'trunk', 2300, 896);
  place(r, 'knot-top', 2112, 908);
  place(r, 'sky-limb', 2450, 360);
  place(r, 'stub-top', 3210, 260);
  place(r, 'cap-side', 3400, 868);
  place(r, 'crest', 4400, CREST);
  return r;
}

// ---------------------------------------------------------------------------------------------------------------
// lr-hall: inside the trunk. The split (A2), the lamp hall hub (B2), the wick gallery (C2). Amber lamplight.
// ---------------------------------------------------------------------------------------------------------------
function hall(): RoomBuilder {
  const r = new RoomBuilder('lr-hall', W, H, [3600, 1300], {
    title: 'Lanternroot: the lamp hall',
    region: 'lanternroot',
    edgeKick: false,
    abilities: ABIL,
    glow: true,
    senses: 'lamp',
    art: { mode: 'painted', kit: 'lanternroot', band: 'hall', seed: 202 },
  });
  const FLOOR = 1300;
  // --- The vault (the trunk's inner bark): no face of it takes a kick, but the split's and the chimney's.
  r.solid(0, 0, 1088, 160, 'trunk', 'east');
  r.solid(1344, 0, 640, 160, 'trunk', 'west'); // to the knot hole (1984)
  r.solid(2240, 0, 2816, 100, 'trunk', false); // to the chimney (5056)
  r.solid(5312, 0, 448, 160, 'trunk', 'west');
  r.add('exits', { id: 'split', edge: 'n', from: 1088, to: 1344 });
  r.add('exits', { id: 'knot', edge: 'n', from: 1984, to: 2240 });
  r.add('exits', { id: 'chimney', edge: 'n', from: 5056, to: 5312 });
  r.mark('moonholes', { x: 1216, y: 0 });
  r.mark('moonholes', { x: 2112, y: 0 });
  // --- The floor: the pit (`hole`, one-way into the roots), the stair, the seal, the thorn tunnel, the shaft.
  r.solid(0, FLOOR, 576, H - FLOOR, 'ground', false);
  r.solid(832, FLOOR, 576, H - FLOOR, 'ground', 'east');
  r.solid(1664, FLOOR, 1280, H - FLOOR, 'ground', 'west'); // to the seal (2944)
  r.solid(3200, FLOOR, 580, H - FLOOR, 'ground', false); // to the tunnel's west mouth (3780)
  r.solid(4736, FLOOR, 1024, H - FLOOR, 'ground', 'west');
  r.add('exits', { id: 'hole', edge: 's', from: 576, to: 832, oneWay: true });
  r.add('exits', { id: 'stair', edge: 's', from: 1408, to: 1664 });
  r.add('exits', { id: 'seal', edge: 's', from: 2944, to: 3200, oneWay: true });
  r.add('exits', { id: 'shaft', edge: 's', from: 4480, to: 4736 });

  // --- A2 the Split (0..1920). Moonlight down the split into amber; the first lamps; the moth-stone shelf.
  // The split's two columns (their inner faces take kicks) and the fungus bracket under them: the way back up.
  // (Faces that take a climb reach down to where she stands: a face that ends over her head is never met.)
  r.solid(1024, 160, 64, 840, 'root', 'east');
  r.solid(1344, 160, 64, 840, 'root', 'west');
  r.oneWay(1100, 1080, 230, 'ledge');
  r.pod('pod-a2a', 1260, 1080, POD_REGROW);
  // Over the pit: a two-lamp chain.
  r.lamp('l-a2a', 640, 1060);
  r.lamp('l-a2b', 860, 920);
  // Up to the moth-stone shelf: a three-lamp chain; a dangler over the stop under its first lamp.
  r.solid(0, 520, 420, 40, 'branch', false);
  r.add('mothStones', { id: 'stone', x: 260, y: 520, area: 'lanternroot' });
  // (Flown in the sim, tools/levels/chain.ts: up, up, up-left onto the shelf; she stops against the trunk's wall.)
  r.lamp('l-a2c', 520, 1040);
  r.lamp('l-a2d', 560, 850);
  r.lamp('l-a2e', 540, 540);
  r.enemy({ id: 'd-a2', kind: 'dangler', x: 230, y: 170, facing: 1, drop: 1100 });
  // The west floor's own life: a pod, a pod under the shelf, and a juvenile that comes once she carries Kindle.
  r.pod('pod-a2c', 200, FLOOR, POD_REGROW);
  r.pod('pod-a2d', 120, 560, POD_REGROW, 'hang');
  r.enemy({
    id: 'j-a2c',
    kind: 'juvenileBurrback',
    x: 380,
    y: FLOOR,
    facing: -1,
    senses: 'always',
    radius: 110,
    wakes: 'kindle',
  });
  // The floor between the pit and the stair: two juveniles (fuel), a glint line.
  r.enemy({ id: 'j-a2a', kind: 'juvenileBurrback', x: 1000, y: FLOOR, facing: 1, senses: 'always' });
  r.enemy({ id: 'j-a2b', kind: 'juvenileBurrback', x: 1300, y: FLOOR, facing: -1, senses: 'always' });
  r.arc('g-a2-', 880, 1360, 1240, 120, 10);
  // The bark pocket (a glint hoard of 12) in a root mound east of the stair.
  r.solid(1700, 1140, 200, 40, 'root', false);
  r.solid(1880, 1180, 20, 120, 'root', false);
  r.add('bark', { id: 'pocket', x: 1700, y: 1180, w: 40, h: 120, kick: false });
  r.hoard('g-pocket', 1750, 1190, 120, 100, 12);
  r.oneWay(1640, 980, 160, 'ledge');
  r.pod('pod-a2b', 1720, 980, POD_REGROW);

  // --- B2 the Lamp Hall: the hub (1920..3840). Rows of warm lamps west; the seal's two buds east, under the loft.
  // The knot drops her in at its west end (1984..2240).
  r.enemy({
    id: 'j-b2a',
    kind: 'juvenileBurrback',
    x: 2440,
    y: FLOOR,
    facing: 1,
    senses: 'always',
    radius: 160,
  });
  r.enemy({
    id: 'j-b2b',
    kind: 'juvenileBurrback',
    x: 2760,
    y: FLOOR,
    facing: -1,
    senses: 'always',
    radius: 130,
  });
  // Puzzle 2, the seal. M-s1 hangs low (a jump reaches it: kindle it in the air, fling off it); M-s2 hangs high
  // over it, out of every double jump's reach and every warm lamp's flight. The only way to M-s2 is a fling off a
  // burning M-s1, and a kindle in that flight; both burning, the seal opens and the pair burns for good: a ladder
  // of two anchors up to the loft.
  r.moonwick('m-s1', 3300, 1010);
  r.moonwick('m-s2', 3440, 560);
  r.add('wickSets', { id: 'seal-set', wicks: ['m-s1', 'm-s2'], sets: 'seal-open' });
  r.add('gates', { id: 'seal', x: 2944, y: FLOOR, w: 256, h: 40, flag: 'seal-open', kick: false });
  // The root curtain: a mass of hanging roots from the vault to 300 over the floor, between the lamp rows and the
  // seal's alcove. No flight off a warm lamp comes round it high enough to meet M-s2.
  r.solid(3000, 100, 48, 900, 'root', false);
  // A dangler under the loft's floor drops on her while she waits under M-s1 in the dark (silver: it holds off).
  r.enemy({ id: 'd-b2', kind: 'dangler', x: 3160, y: 250, facing: -1, drop: 1000, senses: 'always' });
  // The patch in its quiet corner by the tunnel's mouth.
  r.add('patches', { id: 'p-b2', x: 3600, y: FLOOR });
  // H2, the loft: a hollow high in the vault over the seal, behind a root curtain, open only from below at its east
  // end, right over M-s2: a fling off the burning M-s2 carries her up into it. Bright Kindle.
  r.solid(3100, 200, 300, 40, 'branch', false); // its floor
  r.solid(3080, 100, 20, 140, 'branch', false); // west wall
  r.solid(3480, 100, 24, 160, 'branch', false); // east wall, down past the gap (3400..3480)
  // (A mesh across the gap: she rises through it off M-s2 and comes down standing on it, at the loft's door.)
  r.oneWay(3400, 200, 80, 'branch');
  r.add('hollows', { id: 'h2', x: 3120, y: 110, w: 260, h: 90, upgrade: 'brightKindle' });
  r.mark('covers', { id: 'cover-loft', x: 3080, y: 100, w: 424, h: 160, opens: 'lr-hall:h2' });
  r.mark('moonholes', { x: 3300, y: 110 });
  r.pod('pod-b2b', 3330, 240, POD_REGROW, 'hang');
  // The warm lamps, in two rows over the west of the hub (the knot drops her past them): flight paths across the
  // vault to a glint line high under it. None flies near M-s2.
  for (const [i, [x, y]] of (
    [
      [2060, 1060],
      [2340, 1080],
      [2640, 1060],
      [2200, 760],
      [2500, 740],
    ] as const
  ).entries())
    r.lamp(`l-b2${'abcde'[i]}`, x, y);
  r.arc('g-vault-', 2100, 2700, 300, 40, 9);
  r.arc('g-b2-', 2300, 2800, 1240, 100, 8);
  r.pod('pod-b2a', 2560, FLOOR, POD_REGROW);

  // --- C2 the Wick Gallery (3840..5760): the thorn tunnel and its guarded set, the grille lamp, the vault.
  // Puzzle 3, the guarded set. The hub's east wall comes down to 200 over the floor; the tunnel under it runs 700 px
  // over a thorn bed to the shaft's gate. In 200 px no jump climbs and no glide carries 700 (the tunnel probe: a
  // glide crosses 500 at most); a fling off M-c1, at its west mouth, carries 900. M-c2 at the east mouth; the
  // gallery's hawker hunts the landing, out of M-c1's light: kindle M-c2 in the flight or on landing. Both burning,
  // the gate opens (down to the cistern) and the pair burns for good: the tunnel is a fling either way after.
  r.solid(3760, 100, 100, 1000, 'trunk', false);
  r.solid(3860, 1060, 620, 40, 'root', false); // the tunnel's roof: the gallery's west floor over it
  r.solid(3780, 1360, 700, H - 1360, 'root', false);
  r.add('thorns', { id: 't-tunnel', x: 3780, y: 1340, w: 700, h: 20 });
  r.add('gates', { id: 'shaft', x: 4480, y: FLOOR, w: 256, h: 40, flag: 'shaft-open', kick: false });
  // (Open, a root mesh across the shaft: up from the cistern she passes it and lands on it; down is Down + jump.)
  r.oneWay(4480, 1500, 256, 'root');
  r.moonwick('m-c1', 3730, 1240);
  r.moonwick('m-c2', 4560, 1240);
  r.add('wickSets', { id: 'shaft-set', wicks: ['m-c1', 'm-c2'], sets: 'shaft-open' });
  r.enemy({ id: 'h-c2', kind: 'hawker', x: 4630, y: 1120, facing: -1, senses: 'always', radius: 120 });
  // (Glints through the tunnel, at a fling's height: the flight takes them.)
  r.arc('g-tunnel-', 3880, 4400, 1230, 20, 6);
  // The chimney: two columns up to the vault's hole; the silk curtain over it, held by the grille lamp.
  r.solid(4992, 160, 64, 860, 'root', 'east');
  r.solid(5312, 160, 64, 860, 'root', 'west');
  r.oneWay(5070, 1100, 220, 'ledge');
  r.add('gates', { id: 'curtain', x: 5056, y: 100, w: 256, h: 60, flag: 'curtain-open', kick: false });
  // The grille lamp in its thorn crown (220 deep every way: no blade, no fling); its light holds the curtain.
  r.add('thorns', { id: 't-grille', x: 5420, y: 600, w: 340, h: 440 });
  r.lamp('l-grille', 5640, 820, { sets: 'curtain-open' });
  // The vault (puzzle 5) over the tunnel's roof: three cold buds high in the gallery, each pair walled apart but in
  // sight through a window (a gust passes it, she cannot), each burning only `burn`: the route round outruns a wick,
  // so the one behind her is fanned through the window. Its silk drops on the set: a moon-drop.
  r.solid(3860, 640, 240, 30, 'floating', false); // S1
  r.solid(3880, 980, 100, 30, 'floating', false); // a root step up to it from the roof
  r.moonwick('m-g1', 3980, 590, { burn: VAULT_BURN });
  r.solid(4180, 100, 40, 468, 'root', false); // W1, its window 568..632 (a gust at her height passes it, she cannot)
  r.solid(4180, 632, 40, 328, 'root', 'east'); // (to 960: she walks under it on the roof)
  r.solid(4280, 640, 220, 30, 'floating', false); // S2 (the gust spot at its west end, out of M-g2's reach)
  // Under S2 a root lattice: the only way up to it is the hole at W1's foot (no jump from the roof meets M-g2).
  r.solid(4300, 820, 260, 30, 'root', false);
  r.moonwick('m-g2', 4460, 590, { burn: VAULT_BURN });
  r.solid(4560, 100, 40, 468, 'root', false); // W2, its window 568..632 too
  r.solid(4560, 632, 40, 368, 'root', 'east');
  r.solid(4800, 1180, 100, 30, 'floating', false); // L1: a stair of root steps from the gallery floor up to S3
  r.solid(4640, 1010, 100, 30, 'floating', false); // L2
  r.solid(4780, 830, 100, 30, 'floating', false); // L3
  r.solid(4720, 640, 260, 30, 'floating', false); // S3 and the vault's floor
  r.moonwick('m-g3', 4790, 590, { burn: VAULT_BURN });
  r.add('wickSets', { id: 'vault-set', wicks: ['m-g1', 'm-g2', 'm-g3'], sets: 'vault-open' });
  r.solid(4860, 520, 120, 20, 'trunk', false); // its roof
  r.solid(4960, 540, 20, 100, 'trunk', false); // its east wall
  r.add('gates', { id: 'vault', x: 4860, y: 540, w: 20, h: 100, flag: 'vault-open', kick: false });
  r.add('hollows', { id: 'vault-drop', x: 4885, y: 550, w: 70, h: 90, upgrade: 'moonDrop' });
  r.mark('covers', { id: 'cover-vault', x: 4860, y: 520, w: 120, h: 120, opens: 'lr-hall:vault-open' });
  r.mark('moonholes', { x: 5184, y: 0 });
  // The alcove high in the west: a glint hoard behind its bark wall, off S1 or a warm lamp from the roof.
  r.lamp('l-c2a', 4140, 680);
  r.solid(3860, 240, 200, 20, 'trunk', false); // the alcove's roof
  r.solid(3860, 380, 250, 30, 'floating', false); // its floor and the ledge before its wall
  // (A mesh over the gap between the ledge and W1: up through it from S1, she lands on it at the ledge's end.)
  r.oneWay(4110, 380, 70, 'branch');
  r.solid(3860, 260, 20, 120, 'root', false);
  r.add('bark', { id: 'alcove', x: 4040, y: 260, w: 20, h: 120, kick: false });
  r.hoard('g-alcove', 3890, 270, 140, 100, 12);
  // The gallery floor: a juvenile pair; a dangler under S1 over the roof; pods; glints.
  r.enemy({
    id: 'j-c2a',
    kind: 'juvenileBurrback',
    x: 5300,
    y: FLOOR,
    facing: -1,
    senses: 'always',
    radius: 160,
  });
  r.enemy({
    id: 'j-c2b',
    kind: 'juvenileBurrback',
    x: 5560,
    y: FLOOR,
    facing: 1,
    senses: 'always',
    radius: 120,
  });
  r.enemy({ id: 'd-c2', kind: 'dangler', x: 3960, y: 672, facing: -1, drop: 360 });
  r.pod('pod-c2a', 4060, 1060, POD_REGROW);
  r.pod('pod-c2b', 5150, FLOOR, POD_REGROW);
  r.pod('pod-c2c', 3930, 980, POD_REGROW);
  r.pod('pod-c2d', 4380, 640, POD_REGROW);
  r.arc('g-c2-', 5100, 5700, 1240, 140, 10);
  chambers(r, ['a2', 'b2', 'c2']);
  place(r, 'split-foot', 1216, FLOOR);
  place(r, 'west-floor', 300, FLOOR);
  place(r, 'stone-shelf', 260, 520);
  place(r, 'hub', 2500, FLOOR);
  place(r, 'seal-foot', 3300, FLOOR);
  place(r, 'loft', 3250, 200);
  place(r, 'tunnel-w', 3740, FLOOR);
  place(r, 'gallery-w', 4950, FLOOR);
  place(r, 'gallery-e', 5150, FLOOR);
  place(r, 'roof', 4380, 1060);
  place(r, 'alcove', 3960, 380);
  place(r, 'vault-s1', 3980, 640);
  place(r, 'vault-s2', 4460, 640);
  place(r, 'vault-s3', 4760, 640);
  return r;
}

// ---------------------------------------------------------------------------------------------------------------
// lr-roots: under the trunk. The drowned roots (A3), the Gloam (B3), the cistern (C3). Near-black.
// ---------------------------------------------------------------------------------------------------------------
function roots(): RoomBuilder {
  const r = new RoomBuilder('lr-roots', W, H, [440, 1350], {
    title: 'Lanternroot: the black roots',
    region: 'lanternroot',
    edgeKick: false,
    abilities: ABIL,
    glow: true,
    senses: 'lamp',
    art: { mode: 'painted', kit: 'lanternroot', band: 'roots', seed: 303 },
  });
  // --- The ceiling (the trunk's underside) with its openings: the hole and the stair (A3), the seal (B3), the shaft (C3).
  r.solid(0, 0, 576, 240, 'root', false);
  r.solid(832, 0, 576, 240, 'root', 'east');
  r.solid(1664, 0, 1280, 240, 'root', 'west');
  r.solid(3200, 0, 1280, 240, 'root', false);
  r.solid(4736, 0, 1024, 240, 'root', false);
  r.add('exits', { id: 'hole', edge: 'n', from: 576, to: 832 });
  r.add('exits', { id: 'stair', edge: 'n', from: 1408, to: 1664 });
  r.add('exits', { id: 'seal', edge: 'n', from: 2944, to: 3200 });
  r.add('exits', { id: 'shaft', edge: 'n', from: 4480, to: 4736 });

  // --- A3 the Drowned Roots (0..1920). Black water to the shins; the wet walls take no kick.
  const A3F = 1350;
  r.solid(0, A3F, 1920, H - A3F, 'ground', false);
  // The quiet minute: she lands in the black by the hole; nothing lives in the pit until she carries a light. The
  // Kindle hollow under the moon crack (far west) and the patch by it. Taking Kindle wakes the roots: two juveniles
  // come up out of the water between her and First Light's bud (`wakes`), kept 500 px off the patch: the fight
  // that buys the first kindle.
  r.add('glades', { id: 'kindle', x: 120, y: 1150, w: 200, h: 200, ability: 'kindle' });
  r.mark('moonholes', { x: 220, y: 240 });
  r.add('patches', { id: 'p-a3', x: 400, y: A3F });
  r.enemy({
    id: 'j-a3a',
    kind: 'juvenileBurrback',
    x: 1040,
    y: A3F,
    facing: -1,
    senses: 'always',
    radius: 120,
    wakes: 'kindle',
  });
  r.enemy({
    id: 'j-a3b',
    kind: 'juvenileBurrback',
    x: 1300,
    y: A3F,
    facing: 1,
    senses: 'always',
    radius: 110,
    wakes: 'kindle',
  });
  r.pod('pod-a3b', 1000, A3F, POD_REGROW);
  r.pod('pod-a3c', 1240, A3F, POD_REGROW);
  r.add('signs', { id: 's2', x: 1100, y: A3F, rhythm: '--..' });
  // Puzzle 1, First Light: M-a3 at the pit's foot burns 4 s; four moss steps climb the black to the ledge by M-a3b
  // (keep), then three more on to the stair. The clock bites: the fastest line spends most of the burn.
  r.moonwick('m-a3', 1500, 1290, { burn: FIRST_LIGHT_BURN });
  r.solid(1640, 790, 180, 40, 'root', false);
  r.pod('pod-a3d', 1780, 830, POD_REGROW, 'hang');
  r.moonwick('m-a3b', 1730, 740, { keep: true });
  for (const [i, [x, y]] of (
    [
      [1560, 1230],
      [1380, 1120],
      [1560, 1010],
      [1380, 900],
      [1540, 660],
      [1700, 530],
      [1520, 400],
    ] as const
  ).entries())
    r.add('moonmoss', { id: `moss-stair${i + 1}`, x, y, w: 120, h: 20 });
  // A root knot in the stair's mouth, over the last moss step: the way up into the hall (review r1 B6).
  r.solid(1420, 180, 100, 24, 'root', false);
  // (Glints up the stair: taken only on the climb.)
  r.glints('g-stair-', [
    [1440, 1080],
    [1620, 970],
    [1440, 860],
    [1600, 620],
    [1760, 490],
  ]);
  // The flue (a revisit with both tools): a root chimney between the landing and First Light, its moss steps
  // staggered so each overhangs the last (no jump or fling rises past one), lit by M-a3c outside it (kindled from
  // the floor with a double jump). At its top a niche, shut by a silk curtain that a warm lamp's light holds; the
  // lamp is caged in thorns over the flue's top (no blade, no fling): a gust up from the top step puts it out, the
  // silk drops, the niche's moon-drop.
  r.solid(860, 240, 40, 1010, 'root', false); // the flue's west wall (she walks in under it)
  r.solid(1140, 240, 40, 230, 'root', false); // its east wall, over the niche's mouth (470..550)
  r.solid(1140, 550, 40, 700, 'root', false);
  r.moonwick('m-a3c', 1230, 840);
  for (const [i, [x, y]] of (
    [
      [900, 1100],
      [980, 990],
      [900, 880],
      [980, 770],
      [900, 660],
    ] as const
  ).entries())
    r.add('moonmoss', { id: `moss-flue${i + 1}`, x, y, w: 160, h: 20 });
  r.add('moonmoss', { id: 'moss-flue-top', x: 980, y: 550, w: 160, h: 30 });
  r.add('thorns', { id: 't-flue-cage', x: 900, y: 240, w: 240, h: 200 });
  r.lamp('l-flue', 1020, 290, { sets: 'flue-open' });
  r.solid(1180, 440, 140, 30, 'root', false); // the niche: its roof, floor and back
  r.solid(1180, 550, 140, 30, 'root', false);
  r.solid(1300, 470, 20, 80, 'root', false);
  r.add('gates', { id: 'flue-silk', x: 1140, y: 470, w: 40, h: 80, flag: 'flue-open', kick: false });
  r.add('hollows', { id: 'h4', x: 1190, y: 475, w: 100, h: 70, upgrade: 'moonDrop' });
  r.mark('covers', { id: 'cover-flue', x: 1180, y: 440, w: 140, h: 140, opens: 'lr-roots:flue-open' });
  r.solid(1920, 240, 64, 1060, 'root', 'east'); // the wall between the roots and the arena (its arena face climbs)
  r.solid(1920, 1300, 64, 50, 'root', false);

  // --- B3 the Gloam (1984..3776): the arena under the seal. Four ledges with cold wicks; the orb web; the Gloam lamp.
  const BF = 1300;
  r.solid(1984, BF, 1792, H - BF, 'ground', false);
  r.solid(2040, 1060, 200, 30, 'root', false);
  r.moonwick('m-w1', 2140, 1010);
  r.solid(3520, 1060, 200, 30, 'root', false);
  r.moonwick('m-w4', 3620, 1010);
  // Kindled, each low wick lights a moss stair up to the high ledge on its side.
  r.add('moonmoss', { id: 'moss-w1', x: 2240, y: 900, w: 100, h: 20 });
  r.add('moonmoss', { id: 'moss-w2', x: 2340, y: 760, w: 100, h: 20 });
  r.add('moonmoss', { id: 'moss-e1', x: 3420, y: 900, w: 100, h: 20 });
  r.add('moonmoss', { id: 'moss-e2', x: 3320, y: 760, w: 100, h: 20 });
  // The high pair on floating ledges either side of the hub: a fling off one passes the spider at the hub (the
  // throw-cut); both burning together flood the moon-hole.
  r.solid(2440, 610, 160, 30, 'root', false);
  r.moonwick('m-w2', 2520, 560);
  r.solid(3160, 610, 160, 30, 'root', false);
  r.moonwick('m-w3', 3240, 560);
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
  for (const [i, x] of [2300, 2880, 3460].entries())
    r.enemy({
      id: `spider${i + 1}`,
      kind: 'dangler',
      x,
      y: 260,
      facing: 1,
      hp: 1,
      senses: 'always',
      respawn: 240,
      fight: true,
      drop: 900,
    });
  r.pod('pod-b3a', 2500, BF, ARENA_REGROW);
  r.pod('pod-b3b', 3260, BF, ARENA_REGROW);
  r.add('glades', { id: 'gust', x: 2780, y: 1100, w: 200, h: 200, ability: 'gust', when: 'gloam-down' });
  r.mark('moonholes', { x: 2880, y: 240 });
  r.mark('moonholes', { x: 4608, y: 0 });
  // The east door (shut until the Gloamweaver is down) and the arena's lock.
  r.solid(3776, 240, 64, 820, 'root', 'west');
  r.add('gates', { id: 'east-door', x: 3776, y: 1060, w: 64, h: 240, flag: 'gloam-down', kick: false });
  r.set('boss', {
    id: 'gloam',
    kind: 'gloamweaver',
    name: 'The Gloamweaver',
    arena: { x: 1984, y: 300, w: 1792, h: 1000 },
    lock: [{ id: 'seal-lock', x: 2944, y: 240, w: 256, h: 60 }],
    flag: 'gloam-down',
    met: 'gloam-met',
    creature: 'gloamweaver',
    heart: 'gloam-lamp',
    rings: [],
    retryOut: [],
    drops: [2300, 3460, 2880],
    canopy: 300,
    floor: BF,
    hub: { x: 2880, y: 640 },
    orbR: 520,
    wicks: ['m-w1', 'm-w2', 'm-w3', 'm-w4'],
    high: ['m-w2', 'm-w3'],
  });

  // --- C3 the Cistern (3840..5760): still water under the plate; the burrback; the root column; heartwood.
  r.solid(3840, BF, 460, H - BF, 'ground', false);
  r.solid(4300, 1340, 900, H - 1340, 'pool', false);
  r.solid(5200, BF, 560, H - BF, 'ground', false);
  // The root column up to the shaft: kick faces both sides.
  r.solid(4400, 240, 80, 1010, 'root', 'east');
  r.solid(4736, 240, 80, 1010, 'root', 'west');
  r.add('triggers', { id: 'shaft-up', x: 4480, y: 0, w: 256, h: 120, sets: 'shaft-open' });
  r.enemy({ id: 'd-c3a', kind: 'dangler', x: 4300, y: 260, facing: 1, senses: 'always', drop: 1000 });
  r.enemy({ id: 'd-c3b', kind: 'dangler', x: 5000, y: 260, facing: -1, senses: 'always', drop: 1000 });
  // The cistern's west bank: a juvenile pair (fuel by the shaft's foot), glints up the root column.
  r.enemy({ id: 'j-c3a', kind: 'juvenileBurrback', x: 3960, y: BF, facing: 1, senses: 'always', radius: 90 });
  r.enemy({
    id: 'j-c3b',
    kind: 'juvenileBurrback',
    x: 4180,
    y: BF,
    facing: -1,
    senses: 'always',
    radius: 80,
  });
  r.glints('g-column-', [
    [4520, 1100],
    [4700, 900],
    [4520, 700],
    [4700, 500],
    [4520, 330],
  ]);
  // H3 behind the heartwood: a root shelf she stands on, its face heartwood; behind it a dark tunnel.
  // (Its range ends at the heartwood's face: the step-ram reads a range's end, memory/creatures.md.)
  r.enemy({ id: 'b-c3', kind: 'burrback', x: 5320, y: BF, facing: 1, senses: 'always', hp: 3, radius: 134 });
  // (The shelf stops 20 px short of the face: a roof right over a ram's line pulls it up short, as at a doorway.)
  r.solid(5500, 1150, 260, 40, 'root', false);
  r.add('bark', { id: 'heartwood', x: 5480, y: 1190, w: 80, h: 110, heartwood: true, kick: false });
  r.add('hollows', { id: 'h3', x: 5600, y: 1200, w: 140, h: 100, upgrade: 'moonDrop' });
  r.add('signs', { id: 's3', x: 5700, y: BF, rhythm: '-..-' });
  r.mark('covers', { id: 'cover-heart', x: 5560, y: 1150, w: 200, h: 150, opens: 'lr-roots:heartwood' });
  r.mark('landmarks', { id: 'ram-scars', kind: 'ram-scars', x: 5480, y: 1260 });
  r.arc('g-c3-', 3900, 4260, 1240, 100, 8);
  r.pod('pod-c3a', 4100, BF, POD_REGROW);
  r.pod('pod-c3b', 5260, BF, POD_REGROW);
  chambers(r, ['a3', 'b3', 'c3']);
  // The arena's own frame (locked, zoom 1) wins inside it (zones are read in order: it comes first).
  const cam = (r.data as unknown as { camera: { zones: unknown[] } }).camera;
  cam.zones.unshift({ id: 'arena', x: 1984, y: 300, w: 1792, h: 1080, lock: true, frames: 20 });
  place(r, 'pit', 700, A3F);
  place(r, 'kindle-hollow', 220, A3F);
  place(r, 'm-a3b-ledge', 1730, 790);
  place(r, 'flue-top', 1060, 550);
  place(r, 'flue-niche', 1240, 550);
  place(r, 'arena', 2880, BF);
  place(r, 'arena-w1', 2140, 1060);
  place(r, 'arena-w4', 3620, 1060);
  place(r, 'arena-w2', 2520, 610);
  place(r, 'arena-w3', 3240, 610);
  place(r, 'cistern-w', 4000, BF);
  place(r, 'cistern-e', 5300, BF);
  place(r, 'heartwood-top', 5560, 1150);
  return r;
}

// ---------------------------------------------------------------------------------------------------------------
// lr-cache: the firefly's first workshop, behind the knot door. A fling playground of moonwicks; Bright Kindle.
// ---------------------------------------------------------------------------------------------------------------
function cache(): RoomBuilder {
  const r = new RoomBuilder('lr-cache', 1920, 1536, [240, 1300], {
    title: "Lanternroot: the firefly's cache",
    region: 'lanternroot',
    edgeKick: false,
    abilities: ABIL,
    glow: true,
    senses: 'lamp',
    art: { mode: 'painted', kit: 'lanternroot', band: 'cache', seed: 404 },
  });
  r.solid(0, 0, 1920, 200, 'trunk', false);
  r.solid(0, 1300, 1920, 236, 'ground', false);
  r.add('doors', { id: 'door', x: 240, y: 1300, to: 'lr-night#cache-door' });
  // The ring of cold moonwicks round the firefly-lamp (its flash pattern); all lit at once: the set.
  const ring: Array<[number, number]> = [
    [560, 1000],
    [700, 640],
    [960, 500],
    [1220, 640],
    [1360, 1000],
    [960, 1120],
  ];
  for (const [i, [x, y]] of ring.entries()) r.moonwick(`m-ring${i + 1}`, x, y);
  // Glass shelves under the ring's buds (the firefly's): a stand for every kindle, the flights between them free.
  for (const [x, y] of [
    [500, 1060],
    [640, 700],
    [900, 560],
    [1160, 700],
    [1300, 1060],
  ] as const)
    r.solid(x, y, 120, 24, 'floating', false);
  r.add('wickSets', { id: 'ring', wicks: ring.map((_, i) => `m-ring${i + 1}`), sets: 'cache-ring' });
  r.lure({ id: 'firefly-lamp', kind: 'lantern', x: 960, y: 820, moths: 80 });
  r.mark('landmarks', { id: 'firefly-lamp', kind: 'centrepiece', x: 960, y: 820, w: 160, h: 200 });
  r.mark('moonholes', { x: 960, y: 200 });
  // The top shelf: the glow vessel (the Answer's reward: a bigger meter, two more kindles between fights).
  r.solid(1120, 400, 200, 30, 'floating', false);
  r.add('hollows', { id: 'cache-vessel', x: 1130, y: 300, w: 180, h: 100, upgrade: 'glowVessel' });
  r.pod('pod-k1', 400, 1300, POD_REGROW);
  r.pod('pod-k4', 1220, 430, POD_REGROW, 'hang');
  r.pod('pod-k5', 700, 724, POD_REGROW, 'hang');
  r.pod('pod-k2', 1500, 1300, POD_REGROW);
  r.pod('pod-k3', 1700, 1300, POD_REGROW);
  // The firefly's keepers: two danglers over the ring's flights; in the ring's silver they hold off.
  r.enemy({ id: 'd-k1', kind: 'dangler', x: 820, y: 220, facing: 1, senses: 'always', drop: 700 });
  r.enemy({ id: 'd-k2', kind: 'dangler', x: 1100, y: 220, facing: -1, senses: 'always', drop: 700 });
  r.enemy({
    id: 'j-k1',
    kind: 'juvenileBurrback',
    x: 1400,
    y: 1300,
    facing: -1,
    senses: 'always',
    radius: 160,
  });
  r.arc('g-k-', 500, 1420, 1240, 160, 12);
  r.set('camera', { zones: [{ id: 'cache', x: 0, y: 0, w: 1920, h: 1536, lock: true, frames: 20 }] });
  r.mark('chambers', { id: 'cache', x: 0, y: 0, w: 1920, h: 1536 });
  place(r, 'cache-floor', 240, 1300);
  place(r, 'cache-shelf', 1220, 400);
  return r;
}

/** The graph's edges as the room's `routes` (the world check's coarse progression; the solver proves them). */
function routes(r: RoomBuilder): void {
  const id = r.data.id as string;
  const boss = (r.data as { boss?: { id: string; flag: string } }).boss;
  for (const e of EDGES) {
    if (e.room !== id) continue;
    const more: Record<string, unknown> = {};
    if (e.needs) more.needs = e.needs.filter((a) => a !== 'glide' && a !== 'wallJump' && a !== 'doubleJump');
    if (e.flags?.length) more.flags = e.flags;
    if (e.light) more.light = e.light;
    if (e.lamps) more.lamps = e.lamps;
    if (e.upgrades) more.upgrades = e.upgrades;
    // (Finds are two-way for the world check: she walks back out of a hollow.)
    if (!e.both && !e.to.startsWith('find:')) more.oneWay = true;
    if ((more.needs as string[] | undefined)?.length === 0) delete more.needs;
    let to = e.to;
    if (to.startsWith('exit:') || to.startsWith('find:')) to = to.slice(5);
    else if (to.startsWith('flag:')) {
      const f = to.slice(5);
      if (boss && boss.flag === f) {
        to = boss.id;
        delete more.oneWay;
      } else {
        to = e.from;
        more.sets = [f];
      }
    }
    r.route(e.from, to, more);
  }
  // Arrivals: where each opening into this room lands her (its exit node to the place).
  for (const [from, to] of Object.entries(ARRIVALS)) {
    const [room, place] = to.split(':') as [string, string];
    if (room !== id) continue;
    const exit = from.split('#')[1] as string;
    const mine = exit === 'cache-door' ? 'door' : exit === 'door' ? 'cache-door' : exit;
    r.route(mine, place, { oneWay: true });
  }
}

/** Where each chamber's wide shot centres (her play, not the sky). */
const SHOT_Y: Record<string, number> = { a1: 1060, b1: 680, c1: 480, c2: 1080, cache: 860 };

for (const r of [night(), hall(), roots(), cache()]) {
  routes(r);
  r.set('shots', {
    wide: (
      (r.data as { marks?: { chambers?: Array<{ id: string; x: number; w: number }> } }).marks?.chambers ?? []
    ).map((c) => ({ name: c.id, x: c.x + c.w / 2, y: SHOT_Y[c.id] ?? 1000 })),
  });
  r.write(OUT);
}
// (The repo's JSON style: Biome formats what was written.)
execFileSync(
  'npx',
  [
    'biome',
    'format',
    '--write',
    ...['lr-night', 'lr-hall', 'lr-roots', 'lr-cache'].map((id) => `${OUT}/${id}.json`),
  ],
  {
    stdio: 'ignore',
  },
);
