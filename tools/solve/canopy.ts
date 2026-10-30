/**
 * The Canopy v2's proofs (docs/design/levels/first-area.md): `npx tsx tools/solve/canopy.ts [room ...]`. For each
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
  // The Crossing: from the landing the low west and the fork are open, and the two secrets; the high limb (claws)
  // and the door (three seeds) are shut.
  {
    room: 'cn-hub',
    from: [2000, 1152],
    kit: [],
    reach: ['trunk', 'fork', 'cn-hub:p-crossing', 'cn-hub:stone-heart', 'cn-hub:bank-great'],
    not: ['limbs', 'door'],
  },
  { room: 'cn-hub', from: [2000, 1152], kit: [C], reach: ['limbs', 'trunk', 'fork'], not: ['door'] },
  { room: 'cn-hub', from: [1700, 1536], kit: [C, G], flags: ['seeds:3'], reach: ['door'] },
  // The fallen giant: in from the hub, the seed in the roof, down to the well; the rot panel; no way back up from
  // the low tiers.
  {
    room: 'cn-trunk',
    from: [2900, 384],
    kit: [],
    reach: ['hub', 'well', 'rot', 'cn-trunk:seed-giant'],
  },
  { room: 'cn-trunk', from: [600, 1664], kit: [], reach: ['well'], not: ['hub', 'rot'] },
  // The well: without the claws the bottom is a pit (out only east to the rot hall); with them, everything.
  {
    room: 'cn-well',
    from: [900, 4160],
    kit: [],
    reach: ['rot', 'cn-well:p-well'],
    not: ['limbs', 'trunk', 'elder'],
  },
  {
    room: 'cn-well',
    from: [900, 4160],
    kit: [C],
    reach: ['limbs', 'trunk', 'elder', 'rot', 'cn-well:claw-prize'],
  },
  { room: 'cn-well', from: [1600, 2816], kit: [], reach: ['trunk', 'rot', 'wallJump'] },
  // The upper limbs: both ways with the claws, the niche.
  { room: 'cn-limbs', from: [200, 768], kit: [C], reach: ['hub', 'well', 'cn-limbs:stone-west'] },
  { room: 'cn-limbs', from: [3000, 576], kit: [C], reach: ['well'] },
  // The rot hall: down from the giant, through the rotten wall to the well; the crawlspace and the cache.
  {
    room: 'cn-rot',
    from: [1440, 1088],
    kit: [],
    reach: ['well', 'crawl', 'cn-rot:cache-great'],
    not: ['trunk'],
  },
  { room: 'cn-crawl', from: [352, 160], kit: [], reach: ['rot', 'cn-crawl:drop-crawl'] },
  { room: 'cn-elder', from: [1000, 640], kit: [C], reach: ['well', 'cn-elder:drop-elder'] },
  // The east fork: the hub, the cellar and the moth-stone open; the Grove only with the claws.
  {
    room: 'cn-fork',
    from: [400, 1280],
    kit: [],
    reach: ['hub', 'cellar', 'cn-fork:stone-east'],
    not: ['grove'],
  },
  { room: 'cn-fork', from: [400, 1280], kit: [C], reach: ['grove'] },
  { room: 'cn-cellar', from: [480, 128], kit: [], reach: ['fork', 'cn-cellar:drop-cellar'] },
  // The Grove: everything with the claws; the crown's seed needs them even inside.
  {
    room: 'cn-grove',
    from: [300, 576],
    kit: [C],
    reach: ['spire', 'fork', 'hollowroot', 'cn-grove:seed-grove', 'cn-grove:keen-hollow'],
  },
  // (Fallen into the west pit, the caps throw her back up to the tiers.)
  { room: 'cn-grove', from: [2000, 1600], kit: [C], reach: ['fork', 'spire'] },
  { room: 'cn-hollowroot', from: [600, 832], kit: [C], reach: ['grove', 'cn-hollowroot:wings-hollow'] },
  // The Spire: the climb to the bower and the nook in the trunk.
  { room: 'cn-spire', from: [200, 1728], kit: [C], reach: ['bower', 'nook', 'grove'] },
  { room: 'cn-spire', from: [200, 1728], kit: [], reach: ['grove'], not: ['bower', 'nook'] },
  { room: 'cn-nook', from: [200, 640], kit: [C], reach: ['spire', 'cn-nook:stone-high'] },
  // The bower: up the kin column to the crown, west to the gap; the attic up the east wall.
  { room: 'cn-bower', from: [4250, 1536], kit: [C], reach: ['crown', 'gap', 'attic', 'spire'] },
  { room: 'cn-bower', from: [600, 960], kit: [C, G], reach: ['gap', 'crown', 'spire', 'cn-bower:kin-great'] },
  { room: 'cn-crown', from: [1150, 1792], kit: [C], reach: ['bower', 'glide', 'cn-crown:p-crown'] },
  { room: 'cn-attic', from: [1000, 832], kit: [C], reach: ['bower', 'cn-attic:breath-hollow'] },
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
  { room: 'cn-sky', from: [900, 960], kit: [C], reach: ['gap', 'cn-sky:eyes-hollow'] },
  // Deep: the tunnel (back up the door's shaft with the claws), the burrow, the den (the gate opens on the old
  // burrback's death), the way out.
  { room: 'cn-tunnel', from: [830, 1856], kit: [C, G], reach: ['hub', 'den', 'burrow'] },
  { room: 'cn-burrow', from: [544, 800], kit: [C], reach: ['tunnel', 'cn-burrow:stone-deep'] },
  {
    room: 'cn-den',
    from: [300, 832],
    kit: [C, G],
    reach: ['tunnel', 'cn-den:p-den'],
    not: ['out'],
  },
  {
    room: 'cn-den',
    from: [1600, 1280],
    kit: [C, G],
    flags: ['cn-den-down'],
    reach: ['out'],
    not: ['tunnel'],
  },
  {
    room: 'cn-out',
    from: [300, 2432],
    kit: [C, G],
    reach: ['den', 'ledge', 'cn-out:p-out', 'cn-area-end'],
    not: ['cn-next'],
  },
  { room: 'cn-ledge', from: [200, 448], kit: [C], reach: ['out', 'cn-ledge:ledge-great'] },
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
