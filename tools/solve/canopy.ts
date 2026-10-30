/**
 * The Canopy's proofs (v3) (docs/design/levels/first-area.md): `npx tsx tools/solve/canopy.ts [room ...]`. For each
 * claim, the explorer (moves in the real sim, creatures out) from a feet point with a kit must reach what the claim
 * says (exits she leaves by, finds she takes: `room:id` in save.taken, abilities, flags, patches she stands at), and
 * each lock must hold: with the kit short of the key, the locked thing must NOT be reached. Lamps spent (traversal
 * never needs one). Glades are left out of a room unless the claim reaches for their ability.
 */
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import { createState, newSave, placePlayer } from '../../src/sim/index';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { explore, glideClimbMacros } from './explore';

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
  /** Search budget (nodes). */
  max?: number;
}

const C = 'wallJump';
const G = 'glide';

const CLAIMS: Claim[] = [
  // The Crossing: from the landing the low west and the fork are open, and the bank's secret; the high limb (claws)
  // and the door (three seeds) are shut.
  {
    room: 'cn-hub',
    from: [2640, 1152],
    kit: [],
    reach: ['trunk', 'fork', 'cn-hub:p-crossing', 'cn-hub:stone-heart', 'cn-hub:bank-great'],
    not: ['limbs', 'door'],
  },
  { room: 'cn-hub', from: [2640, 1152], kit: [C], reach: ['limbs', 'trunk', 'fork'], not: ['door'] },
  { room: 'cn-hub', from: [2400, 1600], kit: [C, G], flags: ['seeds:3'], reach: ['door'] },
  // The fallen giant: in from the hub, through the rotten wall, the seed in the roof, down to the well; the rot
  // panel; no way back up from the low tiers.
  { room: 'cn-trunk', from: [2900, 384], kit: [], reach: ['hub', 'well', 'rot', 'cn-trunk:seed-giant'] },
  { room: 'cn-trunk', from: [1600, 704], kit: [], reach: ['well'], not: ['hub'] },
  { room: 'cn-trunk', from: [600, 1664], kit: [], reach: ['well'], not: ['hub', 'rot'] },
  // The well: without the claws the bottom is a pit (out only east to the rot hall); with them, everything.
  {
    room: 'cn-well',
    from: [1700, 4928],
    kit: [],
    reach: ['rot', 'cn-well:p-well'],
    not: ['limbs', 'trunk', 'elder'],
  },
  {
    room: 'cn-well',
    from: [1700, 4928],
    kit: [C],
    reach: ['limbs', 'trunk', 'elder', 'rot', 'cn-well:claw-prize'],
    max: 9000,
  },
  { room: 'cn-well', from: [2200, 3200], kit: [], reach: ['trunk', 'rot', 'wallJump'] },
  // The upper limbs: both ways with the claws, the niche.
  { room: 'cn-limbs', from: [200, 768], kit: [C], reach: ['hub', 'well', 'cn-limbs:stone-west'] },
  { room: 'cn-limbs', from: [3000, 576], kit: [C], reach: ['well'] },
  // The rot branch: down from the giant, through the rotten walls; the crawl there and back without the claws; the
  // web; the Elder's room (its climb and the plug into the well need the claws).
  {
    room: 'cn-rot',
    from: [1500, 1472],
    kit: [],
    reach: ['well', 'crawl', 'cn-rot:cache-great'],
    not: ['trunk'],
  },
  { room: 'cn-crawl', from: [960, 160], kit: [], reach: ['rot', 'webs'] },
  { room: 'cn-crawl', from: [200, 1280], kit: [], reach: ['rot'] },
  { room: 'cn-webs', from: [2300, 1280], kit: [], reach: ['crawl', 'elder'] },
  { room: 'cn-elder', from: [2300, 2496], kit: [], reach: ['webs'], not: ['well', 'cn-elder:drop-elder'] },
  { room: 'cn-elder', from: [2300, 2496], kit: [C], reach: ['webs', 'well', 'cn-elder:drop-elder'] },
  { room: 'cn-elder', from: [640, 1216], kit: [C], reach: ['well', 'cn-elder:drop-elder'] },
  // The east fork: the hub, the cellar stairs and the moth-stone open; the Grove only with the claws; the sky's
  // shelf only gliding from the face's top.
  {
    room: 'cn-fork',
    from: [400, 1344],
    kit: [],
    reach: ['hub', 'cellar', 'cn-fork:stone-east'],
    not: ['grove', 'cn-fork:shelf-great'],
  },
  { room: 'cn-fork', from: [400, 1344], kit: [C], reach: ['grove'], not: ['cn-fork:shelf-great'] },
  { room: 'cn-fork', from: [3000, 576], kit: [C, G], reach: ['cn-fork:shelf-great'] },
  // The cellar branch: there and back without the claws; the larder needs them; the tunnel's shortcut and the
  // trapdoor open from below only.
  { room: 'cn-cellar', from: [480, 128], kit: [], reach: ['fork', 'galleries'], not: ['tunnel'] },
  { room: 'cn-cellar', from: [900, 1792], kit: [C], reach: ['fork', 'galleries', 'tunnel'] },
  {
    room: 'cn-galleries',
    from: [200, 704],
    kit: [],
    reach: ['cellar', 'cn-galleries:nest-great'],
    not: ['larder'],
  },
  { room: 'cn-galleries', from: [200, 704], kit: [C], reach: ['larder'] },
  { room: 'cn-larder', from: [200, 640], kit: [C], reach: ['galleries', 'cn-larder:drop-larder'] },
  // The Grove: everything with the claws; the crown's seed needs them even inside.
  {
    room: 'cn-grove',
    from: [300, 576],
    kit: [C],
    reach: ['spire', 'fork', 'cn-grove:seed-grove', 'cn-grove:keen-hollow', 'cn-grove:pit-great'],
  },
  // (Fallen into the pit, the caps throw her back up to the tiers.)
  { room: 'cn-grove', from: [1800, 1600], kit: [C], reach: ['fork', 'spire'] },
  // The Spire: the climb to the bower and the nook; the hollow root behind the foot's wall.
  { room: 'cn-spire', from: [300, 1472], kit: [C], reach: ['bower', 'nook', 'grove', 'hollowroot'] },
  { room: 'cn-spire', from: [300, 1472], kit: [], reach: ['grove', 'hollowroot'], not: ['bower', 'nook'] },
  { room: 'cn-nook', from: [200, 896], kit: [C], reach: ['spire', 'cn-nook:stone-high'] },
  { room: 'cn-hollowroot', from: [200, 416], kit: [C], reach: ['spire', 'cn-hollowroot:wings-hollow'] },
  // The bower: up the kin to the crown, west to the gap; the attic up the east wall.
  { room: 'cn-bower', from: [3800, 1408], kit: [C], reach: ['crown', 'gap', 'attic', 'spire'], max: 9000 },
  { room: 'cn-bower', from: [400, 704], kit: [C, G], reach: ['gap', 'crown', 'spire', 'cn-bower:kin-great'] },
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
  { room: 'cn-sky', from: [1248, 960], kit: [C], reach: ['gap', 'cn-sky:eyes-hollow'] },
  // Deep: the tunnel (back up the door's shaft with the claws; the pit only with the glide; the shortcut to the
  // cellar from its block), the burrow, the den (the gate opens on the old burrback's death), the way out (the
  // door's ledge only gliding off the cliff; back by the door-oak).
  {
    room: 'cn-tunnel',
    from: [1920, 1856],
    kit: [C, G],
    reach: ['hub', 'den', 'burrow', 'cellar'],
    max: 9000,
  },
  { room: 'cn-tunnel', from: [1920, 1856], kit: [C], reach: ['hub', 'burrow'], not: ['den', 'cellar'] },
  { room: 'cn-burrow', from: [860, 1216], kit: [C], reach: ['tunnel', 'cn-burrow:stone-deep'] },
  { room: 'cn-den', from: [300, 512], kit: [C, G], reach: ['tunnel', 'cn-den:p-den'], not: ['out'] },
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
    reach: ['den', 'ledge', 'cn-out:p-out', 'cn-area-end'],
    not: ['cn-next'],
    max: 9000,
  },
  {
    room: 'cn-out',
    from: [300, 1344],
    kit: [C],
    reach: ['den', 'ledge', 'cn-out:p-out'],
    not: ['cn-area-end'],
  },
  { room: 'cn-out', from: [3400, 1088], kit: [C, G], reach: ['cn-out:p-out', 'den'] },
  { room: 'cn-ledge', from: [2400, 768], kit: [C], reach: ['out', 'cn-ledge:ledge-great'] },
];

function startState(c: Claim, room: ReturnType<typeof getRoom>): GameState {
  const save = newSave(c.kit as never);
  save.flags.push(...(c.flags ?? []));
  const s = createState(1, t, room, [], c.kit as never, save);
  placePlayer(s, c.from[0], c.from[1], t, withShortcuts(room, s.save), []);
  // A placed player carries the tuning's double jump until she lands, whatever she owns (createPlayer): a free air
  // jump over every lock. A player who walked here has none (memory/canopy.md).
  if (!c.kit.includes('doubleJump')) s.player.dj = 0;
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
for (const c of CLAIMS) {
  if (only.length && !only.includes(c.room)) continue;
  const full = getRoom(c.room);
  // (Creatures out of the scene itself: a `gone` one the explorer hides can still come back and be pogoed.)
  const room = { ...full, enemies: [], glades: c.reach.some((x) => x === C || x === G) ? full.glades : [] };
  const s = startState(c, room);
  const r = explore({
    scene: room,
    tuning: t,
    start: [s],
    world: W,
    maxNodes: c.max ?? 6000,
    keepLamps: false,
    more: glideClimbMacros(),
  });
  const got = new Set<string>([...r.exits.keys()]);
  const pickIds = (room.pickups ?? []).map((p) => `${c.room}:${p.id}`);
  const patches = (room as { patches?: Array<{ id: string; x: number; y: number }> }).patches ?? [];
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
  }
  const missing = c.reach.filter((x) => !got.has(x));
  const leaked = (c.not ?? []).filter((x) => got.has(x));
  const ok = !missing.length && !leaked.length;
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${c.room} (${c.from.join(', ')}) [${c.kit.join(',') || 'none'}]: ${r.nodes.size} nodes${r.truncated ? ' (truncated)' : ''}` +
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
