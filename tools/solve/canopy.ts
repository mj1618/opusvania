/**
 * The Canopy's proofs (v3) (docs/design/levels/first-area.md): `npx tsx tools/solve/canopy.ts [room ...]`. For each
 * claim, the explorer (moves in the real sim, creatures out) from a feet point with a kit must reach what the claim
 * says (exits she leaves by, finds she takes: `room:id` in save.taken, abilities, flags, patches she stands at,
 * `place:<id>` a place of the room's marks she stands at), and
 * each lock must hold: with the kit short of the key, the locked thing must NOT be reached. Lamps spent (traversal
 * never needs one). Glades are left out of a room unless the claim reaches for their ability.
 * Flings (review r6 #4: five fling lines): a claim with `lit` keeps every warm lamp burning (the explorer flings off
 * them, chains and all eight aims, `keepLamps`); and every lock claim in a room with lamps is run a second time lit,
 * so no fling line opens a lock.
 */
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import { createState, newSave, placePlayer } from '../../src/sim/index';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { chimneyMacros, explore, glideClimbMacros } from './explore';

const W = getWorld('canopy');
const t = cloneTuning(defaultTuning);

interface Claim {
  room: string;
  from: [number, number];
  kit: string[];
  /** Exits (ids), finds (`room:id`), abilities, flags, patches (`room:id`) that must be reached. */
  reach: string[];
  /** ...and must not be (a lock). */
  not?: string[];
  flags?: string[];
  /** Rotten bark already broken (`room:id` in save.opened: a plug she cut on the only way here). */
  opened?: string[];
  /** `false`: no cuts at all (a lock that only the blade opens: the giant's wall). */
  cuts?: false;
  /** Search budget (nodes). */
  max?: number;
  /** The room's warm lamps burn (flings on). */
  lit?: boolean;
  /** A lock whose key is the lamp itself (the first fling, r8): not run again lit. */
  lampKey?: boolean;
}

const C = 'wallJump';
const G = 'glide';

const CLAIMS: Claim[] = [
  // The hatching branch (r6): the first dark edge, a pocket under the branch's end, before the drop.
  {
    room: 'cn-hatch',
    from: [4950, 1320],
    kit: [],
    reach: ['drop', 'place:pocket'],
  },
  // (r8, review r7 #1: the first fling. From the crown's east limb no jump reaches the droop's limb; the lamp over
  // the gap does, and a miss is caught and set back on the limb.)
  {
    room: 'cn-hatch',
    from: [3460, 892],
    kit: [],
    reach: ['place:first-near'],
    not: ['place:first-far', 'drop', 'place:pocket'],
    lampKey: true,
  },
  {
    room: 'cn-hatch',
    from: [3460, 892],
    kit: [],
    lit: true,
    reach: ['place:first-far', 'drop', 'place:pocket'],
  },
  // The Crossing (r6: 8,000 wide, the old hub east of x 3520): from the landing the low west and the fork are open;
  // the high limb, the clump's and the block's secrets (claws), the glide shelf and the door (three seeds) are shut.
  {
    room: 'cn-hub',
    from: [6160, 1152],
    kit: [],
    reach: ['trunk', 'fork', 'cn-hub:p-crossing', 'place:clearing'],
    not: ['limbs', 'door', 'cn-hub:stone-heart', 'cn-hub:shard-high', 'cn-hub:shelf-great', 'vent'],
    max: 9000,
  },
  {
    room: 'cn-hub',
    from: [6160, 1152],
    kit: [C],
    reach: ['limbs', 'vent', 'trunk', 'fork', 'cn-hub:stone-heart', 'cn-hub:shard-high', 'place:trader'],
    not: ['door', 'cn-hub:shelf-great'],
    max: 12000,
  },
  // (Back from the upper limbs onto the high block: down to the floor and on; with wings, the glide shelf.)
  {
    room: 'cn-hub',
    from: [600, 576],
    kit: [C],
    reach: ['trunk', 'fork', 'limbs', 'cn-hub:p-crossing'],
    max: 12000,
  },
  { room: 'cn-hub', from: [600, 576], kit: [C, G], reach: ['cn-hub:shelf-great'], max: 12000 },
  { room: 'cn-hub', from: [5920, 1600], kit: [C, G], flags: ['seeds:3'], reach: ['door'] },
  // The fallen giant: in from the hub, through the rotten wall, the seed in the roof, down to the well; no way back
  // up from the low tiers; the rot branch shut until the claws (r5: its wall high in tier 3's east face).
  {
    room: 'cn-trunk',
    from: [2900, 384],
    kit: [],
    reach: ['hub', 'well', 'cn-trunk:seed-giant'],
    not: ['rot'],
  },
  { room: 'cn-trunk', from: [1600, 704], kit: [], reach: ['well'], not: ['hub'] },
  // (The giant's wall is the only way on, and the seed is behind it: no blade, no seed, no way down.)
  {
    room: 'cn-trunk',
    from: [2900, 384],
    kit: [],
    cuts: false,
    reach: ['hub'],
    not: ['well', 'rot', 'cn-trunk:seed-giant'],
  },
  { room: 'cn-trunk', from: [600, 1664], kit: [], reach: ['well'], not: ['hub', 'rot'] },
  // (Back in from the well with the claws: up the tiers to the hall and out to the Crossing.)
  { room: 'cn-trunk', from: [600, 1664], kit: [C], reach: ['well', 'rot', 'place:t2', 'place:t1', 'hub'] },
  // (r7, the fling line: the drop shaft's lamp throws her from tier 2 back up into the wall's chamber and on to tier 1;
  // the hall's way out to the Crossing stays the claws'.)
  { room: 'cn-trunk', from: [800, 1024], kit: [], lit: true, reach: ['place:t1'], not: ['hub', 'rot'] },
  // The well: the bottom is a start (r6): without the claws a pit with the claws in it (the rot hall's door and the
  // Elder's open only from their own side); with them, the one way out is up leg 1 to the mouth's save and stone.
  { room: 'cn-well', from: [1700, 4928], kit: [], reach: ['wallJump'] },
  {
    room: 'cn-well',
    from: [1700, 4928],
    kit: [],
    reach: ['place:notch'],
    not: ['limbs', 'trunk', 'elder', 'rot', 'cn-well:p-well', 'cn-well:stone-west'],
  },
  {
    room: 'cn-well',
    from: [1700, 4928],
    kit: [C],
    reach: [
      'limbs',
      'trunk',
      'cn-well:claw-prize',
      'cn-well:p-well',
      'cn-well:stone-west',
      'cn-well:p-landing',
    ],
    // (The Elder's door and the rot hall's open only from their own side: r5 / r6, the claws point up.)
    not: ['elder', 'rot'],
    max: 9000,
  },
  {
    room: 'cn-well',
    from: [2200, 3200],
    kit: [],
    reach: ['trunk', 'wallJump', 'cn-well:p-well', 'cn-well:stone-west'],
    not: ['rot'],
  },
  // (In from the giant's mouth with the claws: leg 2's chimney, then r9's gallery (the floor west, the terraces, the
  // bough east, the stair) into the hollow, and its door to the limbs.)
  {
    room: 'cn-well',
    from: [2400, 3200],
    kit: [C],
    reach: [
      'limbs',
      'place:mid',
      'place:terrace',
      'place:gallery',
      'place:door',
      'cn-well:stone-west',
      'cn-well:p-hollow',
      'cn-well-ambush',
    ],
    not: ['rot'],
    max: 9000,
  },
  // (r9, review r8 #1: the gallery and the door are walked and jumped, not climbed: from the landing to the limbs
  // with no claws at all.)
  {
    room: 'cn-well',
    from: [1700, 2432],
    kit: [],
    reach: ['place:gallery', 'place:door', 'limbs'],
    max: 9000,
  },
  // (r9, review r8 #1: the ambush pays. The moon shard on the west wall's shelf is the hollow lamp's: no face or jump
  // reaches it, with the claws; lit, an up-left fling from over the ambush floor lands her on it.)
  {
    room: 'cn-well',
    from: [1700, 1152],
    kit: [C],
    reach: ['limbs', 'cn-well:p-hollow', 'place:door'],
    not: ['cn-well:shard-well'],
    lampKey: true,
    max: 9000,
  },
  {
    room: 'cn-well',
    from: [600, 1152],
    kit: [C],
    lit: true,
    reach: ['limbs', 'cn-well:p-hollow', 'cn-well:shard-well'],
    max: 9000,
  },
  // The upper limbs: both ways with the claws, the niche.
  { room: 'cn-limbs', from: [200, 768], kit: [C], reach: ['hub', 'well', 'vent', 'cn-limbs:niche-1'] },
  // (r7, the high line: off the first limb's end onto the first lamp, up off the second into the niche.)
  {
    room: 'cn-limbs',
    from: [200, 768],
    kit: [],
    lit: true,
    reach: ['cn-limbs:niche-1', 'place:niche'],
    max: 9000,
  },
  // (r6: the covered vent from the floor into the hub's chamber, and back up to the high exit.)
  { room: 'cn-limbs', from: [2448, 1280], kit: [C], reach: ['vent', 'hub'] },
  { room: 'cn-limbs', from: [3000, 576], kit: [C], reach: ['well'] },
  // The rot branch: down from the giant, through the rotten walls; the crawl there and back without the claws; the
  // web; the Elder's room (its climb and the plug into the well need the claws).
  {
    room: 'cn-rot',
    from: [1500, 1472],
    kit: [],
    reach: ['well', 'crawl'],
    not: ['trunk'],
  },
  { room: 'cn-crawl', from: [960, 160], kit: [], reach: ['rot', 'webs'] },
  { room: 'cn-crawl', from: [200, 1280], kit: [], reach: ['rot'] },
  { room: 'cn-webs', from: [2300, 1280], kit: [], reach: ['crawl', 'elder'] },
  { room: 'cn-elder', from: [2300, 2496], kit: [], reach: ['webs'], not: ['well', 'cn-elder:drop-elder'] },
  { room: 'cn-elder', from: [2300, 2496], kit: [C], reach: ['webs', 'well', 'cn-elder:drop-elder'] },
  // (In from the well's notch: the plug over the passage, cut from under it, then the chimney to the shard.)
  { room: 'cn-elder', from: [1300, 1152], kit: [C], reach: ['well', 'webs', 'cn-elder:drop-elder'] },
  // The east fork: the hub, the cellar stairs and the moth-stone open; the Grove only with the claws; the sky's
  // shelf only gliding from the face's top.
  {
    room: 'cn-fork',
    from: [400, 1344],
    kit: [],
    reach: ['hub', 'cellar'],
    not: ['grove'],
  },
  { room: 'cn-fork', from: [400, 1344], kit: [C], reach: ['grove'] },
  // The cellar branch: there and back without the claws; the larder needs them; the tunnel's shortcut and the
  // trapdoor open from below only.
  { room: 'cn-cellar', from: [480, 128], kit: [], reach: ['fork', 'galleries'], not: ['tunnel'] },
  { room: 'cn-cellar', from: [900, 1792], kit: [C], reach: ['fork', 'galleries', 'tunnel'] },
  {
    room: 'cn-galleries',
    from: [200, 704],
    kit: [],
    reach: ['cellar', 'cn-galleries:nest-1'],
    not: ['larder'],
  },
  { room: 'cn-galleries', from: [200, 704], kit: [C], reach: ['larder'] },
  { room: 'cn-larder', from: [200, 640], kit: [C], reach: ['galleries', 'cn-larder:drop-larder'] },
  // The Grove: everything with the claws; the crown's seed needs them even inside.
  // (The way east is a root gate that opens as the pit's last creature dies: `cn-grove-clear`.)
  {
    room: 'cn-grove',
    from: [300, 576],
    kit: [C],
    flags: ['cn-grove-clear'],
    reach: [
      'spire',
      'fork',
      'cn-grove:seed-grove',
      'cn-grove:keen-hollow',
      'cn-grove:shard-grove',
      'cn-grove-wave',
    ],
  },
  // (r7: the crown's seed is on the east limb, over the arena: reached once the wave is down and the gates are open.)
  {
    room: 'cn-grove',
    from: [300, 576],
    kit: [C, G],
    reach: ['fork', 'cn-grove:keen-hollow', 'cn-grove-wave'],
    not: ['spire', 'cn-grove:seed-grove'],
  },
  // (Fallen into the pit, the caps throw her back up to the tiers.)
  { room: 'cn-grove', from: [1800, 1600], kit: [C], flags: ['cn-grove-clear'], reach: ['fork', 'spire'] },
  // The arena (r7, review r6 #6: the pit, not the room): in the pit with the wave on, the doors and the two root
  // gates over the pit's openings hold until it is down: the tiers, the crown and the save are out of reach (with
  // the claws, and with the pit's lamps burning: no fling out either).
  {
    room: 'cn-grove',
    from: [1800, 1600],
    kit: [C],
    flags: ['cn-grove-wave'],
    reach: ['place:pit', 'place:east'],
    // (The save is outside the west door: a fade re-arms the arena and she re-forms there.)
    not: [
      'fork',
      'spire',
      'cn-grove:p-grove',
      'cn-grove:seed-grove',
      'cn-grove:keen-hollow',
      'place:crown',
      'place:crown-w',
      'place:mid',
    ],
  },
  // (Cleared, the gates are open: the pit's lamps and the caps are a way back up to the tiers.)
  {
    room: 'cn-grove',
    from: [1800, 1600],
    kit: [],
    lit: true,
    flags: ['cn-grove-wave', 'cn-grove-clear'],
    reach: ['place:mid', 'spire'],
  },
  { room: 'cn-spire', from: [300, 1472], kit: [C], reach: ['grove'] },
  // The Spire: the climb to the bower and the nook; the hollow root behind the foot's wall.
  { room: 'cn-spire', from: [300, 1472], kit: [C], reach: ['bower', 'nook', 'grove', 'hollowroot'] },
  { room: 'cn-spire', from: [300, 1472], kit: [], reach: ['grove', 'hollowroot'], not: ['bower', 'nook'] },
  { room: 'cn-nook', from: [200, 896], kit: [C], reach: ['spire', 'cn-nook:stone-high'] },
  { room: 'cn-hollowroot', from: [200, 416], kit: [C], reach: ['spire', 'cn-hollowroot:wings-hollow'] },
  // The bower: up the kin to the crown, west to the gap; the attic up the east wall.
  {
    room: 'cn-bower',
    from: [3800, 1408],
    kit: [C],
    reach: ['crown', 'gap', 'attic', 'spire', 'cn-bower:p-bower'],
    max: 9000,
  },
  {
    room: 'cn-bower',
    from: [400, 704],
    kit: [C, G],
    reach: ['gap', 'crown', 'spire', 'cn-bower:shard-kin', 'place:chamber'],
  },
  { room: 'cn-crown', from: [1400, 1792], kit: [C], reach: ['bower', 'glide'] },
  { room: 'cn-attic', from: [200, 1184], kit: [], reach: ['bower', 'cn-attic:breath-hollow'] },
  // The gap: without the glide the far limb is out of reach (a fall drops to the fork or climbs back); with it, the
  // seed and the drop into the Crossing.
  {
    room: 'cn-gap',
    from: [4000, 1344],
    kit: [C],
    reach: ['bower', 'fork', 'sky'],
    not: ['hub', 'cn-gap:seed-far'],
  },
  { room: 'cn-gap', from: [4000, 1344], kit: [C, G], reach: ['hub', 'cn-gap:seed-far'] },
  // (r7, the gap's fling line: off the shelf's lip into the roost's mouth, or down the chain to the pod garden; never
  // the far limb, which stays the glide's.)
  {
    room: 'cn-gap',
    from: [4000, 1344],
    kit: [C],
    lit: true,
    reach: ['place:roost', 'cn-gap:roost-1', 'place:floor', 'fork', 'bower'],
    not: ['hub', 'cn-gap:seed-far', 'place:far'],
    max: 9000,
  },
  { room: 'cn-sky', from: [1248, 960], kit: [C], reach: ['gap', 'cn-sky:eyes-hollow'] },
  // Deep: the tunnel (back up the door's shaft with the claws; the pit only with the glide; the shortcut to the
  // cellar from its block), the burrow, the den (the gate opens on the old burrback's death), the way out (the
  // door's ledge only gliding off the cliff; back by the door-oak).
  {
    room: 'cn-tunnel',
    from: [5440, 1856],
    kit: [C, G],
    flags: ['cn-tunnel-clear'],
    reach: ['hub', 'den', 'burrow', 'cellar'],
    max: 9000,
  },
  // (r8, review r7 #7: the den's warning, a gated wave where the glide lands: the root lid over the drop to the den
  // holds until it is cleared; the cellar's shortcut stays open off the block.)
  {
    room: 'cn-tunnel',
    from: [7420, 1856],
    kit: [C, G],
    reach: ['place:east', 'cellar'],
    not: ['den', 'place:low'],
    max: 9000,
  },
  // (r8: the nest, the hall's lower floor: down the shaft by the pile, back up it or round by the burrow.)
  { room: 'cn-tunnel', from: [900, 1856], kit: [], reach: ['nest'], max: 9000 },
  { room: 'cn-burrow', from: [1200, 1216], kit: [C], reach: ['hall', 'tunnel', 'cn-burrow:stone-deep'] },
  {
    room: 'cn-burrow',
    from: [1200, 1216],
    kit: [],
    reach: ['cn-burrow:stone-deep'],
    not: ['hall', 'tunnel'],
  },
  // (r7: the west hall grown under the hub, over its bramble run to the pile at its end and back.)
  {
    room: 'cn-tunnel',
    from: [5440, 1856],
    kit: [C],
    reach: ['hub', 'burrow', 'place:pile', 'cn-tunnel:pile-1'],
    not: ['den', 'cellar'],
    max: 9000,
  },
  { room: 'cn-tunnel', from: [800, 1856], kit: [], reach: ['place:floor'], max: 9000 },
  // (r6: the covered tube over the pit is the clawed way back west, never the way east.)
  { room: 'cn-tunnel', from: [7420, 1856], kit: [C], reach: ['place:tube', 'hub'], max: 9000 },
  { room: 'cn-burrow', from: [4380, 1216], kit: [C], reach: ['tunnel', 'cn-burrow:stone-deep'] },
  // (The balcony's lip reaches the arena floor: v3's bitten corner sealed it, a softlock only the video found.)
  {
    room: 'cn-den',
    from: [300, 512],
    kit: [C, G],
    reach: ['tunnel', 'cn-den:p-den', 'place:floor'],
    not: ['out'],
  },
  { room: 'cn-den', from: [1700, 1344], kit: [C, G], reach: ['place:floor'], not: ['tunnel', 'out'] },
  {
    room: 'cn-den',
    from: [1700, 1344],
    kit: [C, G],
    flags: ['cn-den-down'],
    reach: ['out'],
    not: ['tunnel'],
  },
  {
    room: 'cn-out',
    from: [300, 1344],
    kit: [C, G],
    reach: ['den', 'ledge', 'cn-out:p-out', 'cn-area-end', 'place:restE', 'place:restW'],
    not: ['cn-next'],
    max: 9000,
  },
  // (r6, the exam: no glide from the way in skips leg 1; the plug holds without a cut.)
  {
    room: 'cn-out',
    from: [300, 1344],
    kit: [G],
    reach: ['place:foot'],
    not: ['place:restE', 'cn-out:p-out'],
  },
  {
    room: 'cn-out',
    from: [1400, 1344],
    kit: [C, G],
    cuts: false,
    reach: ['place:foot'],
    not: ['place:restW'],
  },
  {
    room: 'cn-out',
    from: [300, 1344],
    kit: [C],
    reach: ['den', 'ledge', 'cn-out:p-out'],
    not: ['cn-area-end'],
  },
  {
    room: 'cn-out',
    from: [3400, 1088],
    kit: [C, G],
    opened: ['cn-out:out-plug'],
    reach: ['cn-out:p-out', 'den'],
  },
  { room: 'cn-ledge', from: [2400, 768], kit: [C], reach: ['out', 'cn-ledge:ledge-great'] },
];

function startState(c: Claim, room: ReturnType<typeof getRoom>): GameState {
  const save = newSave(c.kit as never);
  save.flags.push(...(c.flags ?? []));
  save.opened.push(...(c.opened ?? []));
  const s = createState(1, t, room, [], c.kit as never, save);
  placePlayer(s, c.from[0], c.from[1], t, withShortcuts(room, s.save), []);
  // A placed player carries the tuning's double jump until she lands, whatever she owns (createPlayer): a free air
  // jump over every lock. A player who walked here has none (memory/canopy.md).
  if (!c.kit.includes('doubleJump')) s.player.dj = 0;
  if (!c.lit)
    (room.lures ?? []).forEach((l, k) => {
      if (l.kind === 'wick' || l.kind === 'lantern') {
        s.lures.hp[k] = 0;
        s.lures.out[k] = 1;
      }
    });
  return s;
}

/**
 * The room in 64 px cells (CANOPY_MAP=1 on a failing claim): `#` solid, `=` one-way, `^` thorns, `B` rotten bark,
 * `G` gate or shortcut, `o` where the explorer stood (feet), `.` air.
 */
function asciiMap(room: ReturnType<typeof getRoom>, states: GameState[]): string {
  const S = 64;
  const W = Math.ceil(room.width / S);
  const H = Math.ceil(room.height / S);
  const g = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
  const paint = (r: { x: number; y: number; w: number; h: number }, c: string) => {
    for (let y = Math.floor(r.y / S); y < Math.ceil((r.y + r.h) / S); y++)
      for (let x = Math.floor(r.x / S); x < Math.ceil((r.x + r.w) / S); x++)
        if (g[y]?.[x] !== undefined) (g[y] as string[])[x] = c;
  };
  const rr = room as unknown as Record<
    string,
    Array<{ x: number; y: number; w: number; h: number }> | undefined
  >;
  for (const q of room.solids) paint(q, '#');
  for (const q of room.oneWays) paint({ ...q, h: 8 }, '=');
  for (const q of rr.thorns ?? []) paint(q, '^');
  for (const q of rr.bark ?? []) paint(q, 'B');
  for (const q of [...(rr.gates ?? []), ...(rr.shortcuts ?? [])]) paint(q, 'G');
  for (const st of states) {
    const fx = Math.floor((st.player.x + st.player.w / 2) / S);
    const fy = Math.floor((st.player.y + st.player.h - 1) / S);
    if (g[fy]?.[fx] !== undefined) (g[fy] as string[])[fx] = 'o';
  }
  return g.map((row, i) => `${String(i * S).padStart(5)} ${row.join('')}`).join('\n');
}

const only = process.argv.slice(2);
let bad = 0;
const t0 = Date.now();
// (Every lock in a room with warm lamps, again with them burning: no fling line opens a lock.)
const hasWick = (id: string) =>
  (getRoom(id).lures ?? []).some((l) => l.kind === 'wick' && !(l as { after?: string }).after);
const runs = CLAIMS.flatMap((c) =>
  c.not?.length && !c.lit && !c.lampKey && hasWick(c.room) ? [c, { ...c, lit: true }] : [c],
);
for (const c of runs) {
  if (only.length && !only.includes(c.room)) continue;
  const full = getRoom(c.room);
  // (Creatures out of the scene itself: a `gone` one the explorer hides can still come back and be pogoed.)
  const room = {
    ...full,
    enemies: [],
    glades: c.reach.some((x) => x === C || x === G) ? full.glades : [],
    // (A lock whose key is the lamp: no lamp at all, it relights.)
    ...(c.lampKey ? { lures: [] } : {}),
  };
  const s = startState(c, room);
  const r = explore({
    scene: room,
    tuning: t,
    start: [s],
    world: W,
    maxNodes: c.max ?? 6000,
    keepLamps: c.lit === true,
    pogo: c.cuts !== false,
    more: [
      ...glideClimbMacros(),
      ...chimneyMacros(c.cuts === false ? [0, 1, 2] : undefined, c.cuts === false ? [''] : undefined),
    ],
    barkHp: true,
  });
  const got = new Set<string>([...r.exits.keys()]);
  const pickIds = (room.pickups ?? []).map((p) => `${c.room}:${p.id}`);
  const patches = (room as { patches?: Array<{ id: string; x: number; y: number }> }).patches ?? [];
  // (`place:<id>`: her feet at a place of the room's marks, within 160 px along and 40 px up or down.)
  const places = (
    (room as { marks?: { places?: Array<{ id: string; x: number; y: number }> } }).marks?.places ?? []
  ).filter((p) => c.reach.concat(c.not ?? []).includes(`place:${p.id}`));
  for (const n of r.nodes.values()) {
    const st = n.state;
    for (const k of st.save.taken) got.add(k);
    for (const a of st.save.abilities) got.add(a);
    for (const f of st.save.flags) got.add(f);
    st.pickups.timers.forEach((v, i) => {
      if (v !== 0) got.add(pickIds[i] as string);
    });
    const fx = st.player.x + st.player.w / 2;
    const fy = st.player.y + st.player.h;
    for (const p of patches)
      if (Math.abs(fx - p.x) < 100 && Math.abs(fy - p.y) < 40) got.add(`${c.room}:${p.id}`);
    for (const p of places) if (Math.abs(fx - p.x) < 160 && Math.abs(fy - p.y) < 40) got.add(`place:${p.id}`);
  }
  const missing = c.reach.filter((x) => !got.has(x));
  const leaked = (c.not ?? []).filter((x) => got.has(x));
  const ok = !missing.length && !leaked.length;
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${c.room} (${c.from.join(', ')}) [${c.kit.join(',') || 'none'}]${c.lit ? ' lit' : ''}: ${r.nodes.size} nodes${r.truncated ? ' (truncated)' : ''}` +
      (missing.length ? `; missing ${missing.join(' ')}` : '') +
      (leaked.length ? `; LEAKS ${leaked.join(' ')}` : ''),
  );
  if (!ok && process.env.CANOPY_MAP)
    console.log(
      asciiMap(
        room,
        [...r.nodes.values()].map((n) => n.state),
      ),
    );
  if (!ok)
    console.log(
      `     reached: ${[...got]
        .filter((x) => !x.startsWith('seeds:'))
        .sort()
        .join(' ')}`,
    );
}
console.log(`${bad ? `${bad} claims fail` : 'all claims hold'} (${Math.round((Date.now() - t0) / 1000)} s)`);
process.exitCode = bad ? 1 : 0;
