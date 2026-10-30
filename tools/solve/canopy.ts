/**
 * The Canopy's proofs (docs/design/levels/first-area.md): `npx tsx tools/solve/canopy.ts`. For each claim, the
 * explorer (Lanternroot's solver: moves in the real sim, creatures out) from a feet point with a kit must reach
 * what the claim says (exits she leaves by, finds she touches), and each lock must hold: with the kit short of the
 * key, the locked thing must NOT be reached. Lamps spent (traversal never needs one).
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
  /** Exits (ids) and finds (`room:id` in save.taken, or ability ids) that must be reached. */
  reach: string[];
  /** ...and must not be (a lock). */
  not?: string[];
  flags?: string[];
}

const CLAIMS: Claim[] = [
  // The Crossing: from the landing, both ways open; the high limb, the canopy hole and the door shut.
  { room: 'cn-hub', from: [1900, 1088], kit: [], reach: ['west', 'east'], not: ['west-high', 'door'] },
  { room: 'cn-hub', from: [600, 704], kit: ['wallJump'], reach: ['west', 'east', 'west-high'] },
  { room: 'cn-hub', from: [2000, 2368], kit: [], reach: ['west', 'east'], not: ['door'] },
  { room: 'cn-hub', from: [1900, 1088], kit: ['wallJump', 'glide'], flags: ['seeds:3'], reach: ['door'] },
  { room: 'cn-hub', from: [1900, 1088], kit: [], reach: ['cn-hub:cache-great'] },
  // The Thornlimb: in from the hub, down to the claws; the way back up only with them.
  {
    room: 'cn-west',
    from: [5800, 1152],
    kit: [],
    reach: ['hub', 'cn-west:seed-thorn', 'wallJump', 'hub-high'],
  },
  // (The glade left out: without the claws the upper way stays shut.)
  { room: 'cn-west', from: [5800, 1152], kit: [], reach: ['hub', 'cn-west:seed-thorn'], not: ['hub-high'] },
  { room: 'cn-west', from: [5800, 1152], kit: [], reach: ['cn-west:keen-hollow'] },
  { room: 'cn-west', from: [768, 2304], kit: [], reach: [], not: ['hub', 'hub-high'] },
  {
    room: 'cn-west',
    from: [768, 2304],
    kit: ['wallJump'],
    reach: ['hub-high', 'hub', 'cn-west:claw-prize', 'cn-west:niche-great'],
  },
  // The Lamp Grove: everything but the canopy without claws; the canopy with.
  {
    room: 'cn-grove',
    from: [500, 1312],
    kit: [],
    reach: ['hub', 'cn-grove:seed-grove', 'cn-grove:eyes-hollow'],
    not: ['canopy'],
  },
  { room: 'cn-grove', from: [2800, 1600], kit: [], reach: ['hub'] },
  { room: 'cn-grove', from: [500, 1312], kit: ['wallJump'], reach: ['canopy'] },
  // The high canopy: up the Spire's top to the crown and the glide; the far limb only on the wing.
  {
    room: 'cn-canopy',
    from: [7328, 1088],
    kit: ['wallJump'],
    reach: ['glide', 'grove'],
    not: ['hub', 'cn-canopy:seed-far'],
  },
  {
    room: 'cn-canopy',
    from: [6300, 384],
    kit: ['wallJump', 'glide'],
    reach: ['hub', 'cn-canopy:seed-far', 'cn-canopy:wings-hollow'],
  },
  // The den: down from the door, the save, the floor, back up with claws; the way on behind the gate.
  {
    room: 'cn-den',
    from: [2300, 960],
    kit: ['wallJump', 'glide'],
    flags: ['cn-den-down'],
    reach: ['cn-den:p-den'],
  },
];

function startState(c: Claim): GameState {
  const room = {
    ...getRoom(c.room),
    glades: c.reach.some((r) => r === 'wallJump' || r === 'glide') ? getRoom(c.room).glades : [],
  };
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

let bad = 0;
for (const c of CLAIMS) {
  const full = getRoom(c.room);
  const room = { ...full, glades: c.reach.some((x) => x === 'wallJump' || x === 'glide') ? full.glades : [] };
  const s = startState(c);
  const r = explore({
    scene: room,
    tuning: t,
    start: [s],
    world: W,
    maxNodes: 6000,
    keepLamps: false,
    more: glideClimbMacros(),
  });
  const got = new Set<string>([...r.exits.keys()]);
  const pickIds = (room.pickups ?? []).map((p) => `${c.room}:${p.id}`);
  const hollows = (room as { hollows?: Array<{ id: string; upgrade: string }> }).hollows ?? [];
  const patches = (room as { patches?: Array<{ id: string; x: number; y: number }> }).patches ?? [];
  for (const n of r.nodes.values()) {
    const st = n.state;
    for (const k of st.save.taken) got.add(k);
    for (const a of st.save.abilities) got.add(a);
    st.pickups.timers.forEach((v, i) => {
      if (v !== 0) got.add(pickIds[i] as string);
    });
    for (const h of hollows)
      if ((st.save as unknown as { upgrades?: string[] }).upgrades?.includes(h.upgrade))
        got.add(`${c.room}:${h.id}`);
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
  if (!ok) console.log(`     reached: ${[...got].sort().join(' ')}`);
}
console.log(bad ? `${bad} claims fail` : 'all claims hold');
process.exitCode = bad ? 1 : 0;
