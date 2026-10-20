// Scores each level skeleton (docs/design/skeletons/<n>-<slug>.json) against the layout rules the reference maps
// teach (docs/design/reference-maps/README.md). Places are the skeleton's regions, so the numbers are coarser than
// room counts in the references: read them as directions, not grades.
// Usage: node docs/design/skeletons/score.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const pct = (n) => `${Math.round(n * 100)}%`;

const rows = [];
for (const f of readdirSync(dir).filter((f) => /^\d+-.*\.json$/.test(f)).sort()) {
  const sk = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const regions = sk.regions;
  const ids = regions.map((r) => r.id);
  const adj = new Map(ids.map((id) => [id, new Set()]));
  const pairs = new Set();
  for (const l of sk.links) {
    if (!adj.has(l.from) || !adj.has(l.to) || l.from === l.to) continue;
    adj.get(l.from).add(l.to);
    adj.get(l.to).add(l.from);
    pairs.add([l.from, l.to].sort().join('|'));
  }
  // components, for the loop count (links - places + components)
  const seen = new Set();
  let comps = 0;
  for (const id of ids) {
    if (seen.has(id)) continue;
    comps++;
    const q = [id];
    seen.add(id);
    while (q.length) for (const n of adj.get(q.pop())) if (!seen.has(n)) (seen.add(n), q.push(n));
  }
  const loops = pairs.size - ids.length + comps;
  const regionAt = (x, y) => regions.find((r) => inside(r, x, y))?.id;
  const runRegions = sk.run.map((p) => regionAt(p.x, p.y)).filter(Boolean);
  const onPath = new Set(runRegions);
  const start = runRegions[0];
  // the hub: the best-connected place
  const hub = [...ids].sort((a, b) => adj.get(b).size - adj.get(a).size)[0];
  const hops = new Map([[start, 0]]);
  const q = [start];
  while (q.length) {
    const c = q.shift();
    for (const n of adj.get(c)) if (!hops.has(n)) (hops.set(n, hops.get(c) + 1), q.push(n));
  }
  let passes = 0;
  for (let i = 0; i < runRegions.length; i++) if (runRegions[i] === hub && runRegions[i - 1] !== hub) passes++;
  // dead ends, and whether each pays
  const pays = (id) => {
    const r = regions.find((x) => x.id === id);
    return (
      sk.abilities.some((a) => a.region === id) ||
      sk.boss?.region === id ||
      sk.secrets.some((s) => inside(r, s.x, s.y))
    );
  };
  const deadEnds = ids.filter((id) => adj.get(id).size === 1);
  const gates = sk.links.filter((l) => l.kind === 'gate' || l.kind === 'secret').length;
  const open = sk.links.filter((l) => l.kind === 'open' || l.kind === 'oneway').length;
  // sizes
  const areas = regions.map((r) => r.w * r.h).sort((a, b) => a - b);
  const median = areas[Math.floor(areas.length / 2)];
  const kind = (r) =>
    r.w <= 1 && r.h <= 1 ? 'pocket' : r.h >= 2.5 && r.h >= r.w ? 'shaft' : r.w >= 2.5 && r.h < 2 ? 'hall' : r.w >= 2 && r.h >= 2 ? 'big' : 'medium';
  const mix = {};
  for (const r of regions) mix[kind(r)] = (mix[kind(r)] ?? 0) + 1;
  rows.push({
    skeleton: sk.title,
    places: ids.length,
    screens: areas.reduce((a, b) => a + b, 0),
    'main path': pct(onPath.size / ids.length),
    loops,
    'dead ends (pay)': `${deadEnds.length} (${deadEnds.filter(pays).length})`,
    'locks : open': `${gates} : ${open}`,
    hub: `${regions.find((r) => r.id === hub).name} · ${adj.get(hub).size} ways · ${hops.get(hub) ?? '?'} from start · passed ${passes}×`,
    sizes: Object.entries(mix)
      .map(([k, v]) => `${v} ${k}`)
      .join(', '),
    'biggest / median': (areas.at(-1) / median).toFixed(1),
  });
}
for (const r of rows) {
  console.log(`\n${r.skeleton}`);
  for (const [k, v] of Object.entries(r)) if (k !== 'skeleton') console.log(`  ${k.padEnd(17)} ${v}`);
}
