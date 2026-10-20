// Checks a room-level area layout (docs/design/places/<name>.json) against the reference-map rules
// (docs/design/reference-maps/README.md). Each check prints PASS or FAIL with the measured number and the target.
// Usage: node docs/design/places/place-score.mjs <file.json> [...]
//
// Layout shape:
// {
//   "id": "...", "title": "...", "start": "<room id>",
//   "abilities": ["claws", "glide", ...],            // the order they are found in
//   "rooms": [{ "id": "r1", "name": "...", "x": 0, "y": 0, "w": 1, "h": 1,   // screens (1 = one 16:9 screen)
//               "items": ["ability:claws" | "health" | "energy" | "key" | "map" | "bench" | "npc" | "challenge"
//                         | "lore" | "currency" | "boss" | "landmark" | "goal"],
//               "note": "what's here" }],
//   "links": [{ "a": "r1", "b": "r2", "requires": "claws" | "keys:3" | "boss" | null,
//               "oneway": false, "shortcut": false, "note": "" }]
// }
// A link with "requires" is a lock until the player has it. "oneway": a → b only. "shortcut": opened from the far
// side (b) only: before that it counts as a lock seen from a.
import { readFileSync } from 'node:fs';

const PAY = new Set(['ability', 'health', 'energy', 'key', 'map', 'bench', 'npc', 'challenge', 'boss', 'goal']);

export function score(L) {
  const rooms = new Map(L.rooms.map((r) => [r.id, r]));
  const out = [];
  const check = (name, ok, got, want) => out.push({ name, ok, got, want });
  const kinds = (r) => (r.items ?? []).map((i) => i.split(':')[0]);
  const abilityRoom = new Map(
    L.rooms.flatMap((r) => (r.items ?? []).filter((i) => i.startsWith('ability:')).map((i) => [i.slice(8), r.id])),
  );
  const keyRooms = L.rooms.filter((r) => kinds(r).includes('key')).map((r) => r.id);
  const bossRoom = L.rooms.find((r) => kinds(r).includes('boss'))?.id;

  // undirected degree, for dead ends and the hub
  const deg = new Map(L.rooms.map((r) => [r.id, new Set()]));
  for (const l of L.links) {
    if (!deg.has(l.a) || !deg.has(l.b)) throw new Error(`link ${l.a}-${l.b}: unknown room`);
    deg.get(l.a).add(l.b);
    deg.get(l.b).add(l.a);
  }

  // movement under a state (abilities held, keys held, boss beaten, shortcuts opened)
  const can = (l, st) => {
    const req = l.requires;
    if (!req) return true;
    if (req.startsWith('keys:')) return st.keys >= Number(req.slice(5));
    if (req === 'boss') return st.boss;
    return st.has.has(req);
  };
  const steps = (id, st) => {
    const out = [];
    for (const l of L.links) {
      if (!can(l, st)) continue;
      if (l.a === id && !(l.shortcut && !st.opened.has(l))) out.push([l.b, l]);
      if (l.b === id && !l.oneway) out.push([l.a, l]);
    }
    return out;
  };
  const bfs = (from, st) => {
    const prev = new Map([[from, null]]);
    const q = [from];
    while (q.length) {
      const c = q.shift();
      for (const [n, l] of steps(c, st)) {
        if (l.shortcut && n === l.a) st.opened.add(l); // walked through from the far side: open for good
        if (!prev.has(n)) (prev.set(n, c), q.push(n));
      }
    }
    return prev;
  };
  const pathTo = (prev, to) => {
    const p = [];
    for (let c = to; c != null; c = prev.get(c)) p.unshift(c);
    return p;
  };

  // the main path: start → each ability in order (collecting the keys needed on the way) → the boss
  const st = { has: new Set(), keys: 0, boss: false, opened: new Set() };
  const reachAtStart = bfs(L.start, { ...st, opened: new Set() });
  const main = [L.start];
  const reachSizes = [reachAtStart.size];
  let here = L.start;
  const goals = [...L.abilities.map((a) => abilityRoom.get(a)), bossRoom].filter(Boolean);
  let stuck = null;
  for (const goal of goals) {
    let prev = bfs(here, st);
    // fetch keys while the goal is out of reach
    while (!prev.has(goal)) {
      const k = keyRooms.find((r) => prev.has(r) && !st.gotKeys?.has(r));
      if (!k) break;
      main.push(...pathTo(prev, k).slice(1));
      st.gotKeys ??= new Set();
      st.gotKeys.add(k);
      st.keys++;
      here = k;
      prev = bfs(here, st);
    }
    if (!prev.has(goal)) {
      stuck = goal;
      break;
    }
    main.push(...pathTo(prev, goal).slice(1));
    here = goal;
    const ab = [...abilityRoom].find(([, r]) => r === goal)?.[0];
    if (ab) st.has.add(ab);
    if (goal === bossRoom) st.boss = true;
    reachSizes.push(bfs(L.start, st).size);
  }
  const mainSet = new Set(main);
  const n = L.rooms.length;

  check('everything reachable in order', !stuck, stuck ? `stuck before ${stuck}` : 'ok', 'abilities then boss');
  check('rooms in the area', n >= 28 && n <= 50, n, '28–50');
  check('main path share', mainSet.size / n <= 0.4, `${Math.round((mainSet.size / n) * 100)}%`, '≤ 40%');

  const dead = L.rooms.filter((r) => deg.get(r.id).size === 1);
  const unpaid = dead.filter((r) => !kinds(r).some((k) => PAY.has(k)));
  check('dead ends', dead.length / n >= 0.15 && dead.length / n <= 0.35, `${dead.length} (${Math.round((dead.length / n) * 100)}%)`, '15–35% of rooms');
  check('every dead end pays', unpaid.length === 0, unpaid.map((r) => r.id).join(', ') || 'all pay', 'none unpaid');

  // locks seen at the start: links leaving the start-reachable set
  const locked0 = L.links.filter((l) => (reachAtStart.has(l.a) !== reachAtStart.has(l.b)) && (reachAtStart.has(l.a) || (!l.oneway && reachAtStart.has(l.b))));
  check('locks seen before the first ability', locked0.length >= reachAtStart.size / 3, `${locked0.length} for ${reachAtStart.size} reachable rooms`, '≥ 1 per 3 reachable');
  const early = new Set([L.start, ...deg.get(L.start)]);
  const earlyLocks = new Set(L.links.filter((l) => l.requires && (early.has(l.a) || early.has(l.b))).map((l) => l.requires));
  check('two kinds of lock in the first rooms', earlyLocks.size >= 2, [...earlyLocks].join(', ') || 'none', '≥ 2 kinds');

  // the hub
  const hub = [...deg].sort((a, b) => b[1].size - a[1].size)[0][0];
  const hubHops = pathTo(bfs(L.start, { has: new Set(L.abilities), keys: 99, boss: true, opened: new Set() }), hub).length - 1;
  let passes = 0;
  for (let i = 0; i < main.length; i++) if (main[i] === hub && main[i - 1] !== hub) passes++;
  check('hub size', deg.get(hub).size >= 5, `${rooms.get(hub).name}: ${deg.get(hub).size} ways`, '≥ 5');
  check('hub near the start', hubHops <= 3, `${hubHops} rooms`, '≤ 3');
  check('hub crossed on the main path', passes >= 4, `${passes}×`, '≥ 4');

  // loops and growth
  const loops = L.links.length - n + 1;
  check('loops', loops >= n / 10, loops, `≥ ${Math.ceil(n / 10)} (one per 10 rooms)`);
  check('first ability opens the world', (reachSizes[1] ?? 0) >= 1.6 * reachSizes[0], `${reachSizes[0]} → ${reachSizes[1] ?? '?'} rooms`, '≥ 1.6×');

  // abilities at work
  for (const ab of L.abilities) {
    const uses = L.links.filter((l) => l.requires === ab);
    const r = abilityRoom.get(ab);
    const near = bfs(r, { has: new Set(L.abilities), keys: 99, boss: true, opened: new Set() });
    const within3 = uses.some((l) => {
      const d = Math.min(pathTo(near, l.a).length, pathTo(near, l.b).length) - 1;
      return d >= 0 && d <= 3;
    });
    check(`${ab}: opens ≥ 5 things`, uses.length >= 5, uses.length, '≥ 5 locks');
    check(`${ab}: a lock within 3 rooms`, within3, within3 ? 'yes' : 'no', 'yes');
  }
  check('required finds off the path', L.links.some((l) => l.requires?.startsWith('keys:') && main.some((m) => m === l.a || m === l.b)), keyRooms.length ? `${keyRooms.length} keys` : 'none', 'a keys door on the main path');

  // sizes
  const area = (r) => r.w * r.h;
  const areas = L.rooms.map(area).sort((a, b) => a - b);
  const median = areas[Math.floor(areas.length / 2)];
  const pockets = L.rooms.filter((r) => r.w <= 1 && r.h <= 1).length;
  const shafts = L.rooms.filter((r) => r.h >= 2.5 && r.h >= r.w).length;
  const halls = L.rooms.filter((r) => r.w >= 2.5 && r.h < 2).length;
  check('pockets (1×1)', pockets / n >= 0.2, `${pockets} (${Math.round((pockets / n) * 100)}%)`, '≥ 20%');
  check('tall shafts', shafts >= 2, shafts, '≥ 2');
  check('long halls', halls / n >= 0.15, `${halls}`, '≥ 15%');
  check('biggest space vs median', areas.at(-1) / median >= 6, (areas.at(-1) / median).toFixed(1), '≥ 6×');
  const same = L.links.filter((l) => {
    const a = rooms.get(l.a), b = rooms.get(l.b);
    return a.w === b.w && a.h === b.h && area(a) > 1;
  }).length;
  check('neighbours differ in shape', same <= L.links.length * 0.15, same, '≤ 15% of links');

  // rest
  const benches = L.rooms.filter((r) => kinds(r).includes('bench')).map((r) => r.id);
  const all = { has: new Set(L.abilities), keys: 99, boss: true, opened: new Set() };
  const far = Math.max(...L.rooms.map((r) => Math.min(...benches.map((b) => pathTo(bfs(b, all), r.id).length - 1).filter((d) => d >= 0))));
  check('a bench within 4 rooms of everywhere', far <= 4, far, '≤ 4');
  const bossBench = bossRoom ? Math.min(...benches.map((b) => pathTo(bfs(b, all), bossRoom).length - 1).filter((d) => d >= 0)) : 99;
  check('a bench just before the boss', bossBench <= 2, bossBench, '≤ 2 rooms');

  // finds
  const finds = L.rooms.filter((r) => kinds(r).length > 0).length;
  check('rooms with a find', finds / n >= 0.5, `${Math.round((finds / n) * 100)}%`, '≥ 50%');
  return { out, main, hub, mainSet };
}

if (process.argv[1]?.endsWith('place-score.mjs')) {
  for (const f of process.argv.slice(2)) {
    const L = JSON.parse(readFileSync(f, 'utf8'));
    const { out } = score(L);
    const fails = out.filter((c) => !c.ok).length;
    console.log(`\n${L.title}  (${f}): ${out.length - fails}/${out.length} pass`);
    for (const c of out) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(38)} ${String(c.got).padEnd(28)} want ${c.want}`);
  }
}
