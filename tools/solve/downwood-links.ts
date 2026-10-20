/**
 * `npx tsx tools/solve/downwood-links.ts`: reads the solver's report (tools/solve/downwood-report.json, written by
 * `downwood.ts --write`) and checks every link of the built layout (tools/levels/downwood-export.ts), each way it
 * claims, against what the real-sim search crossed:
 *  - passable: crossed (lamps spent) at the first stage whose kit meets the link's `requires`;
 *  - locked: not crossed (lamps kept: the superset) at any stage before that;
 *  - one-way: never crossed back, at any stage (lamps kept).
 * Prints one line per problem and a summary; also every dead end entered and every find reached.
 */
import { readFileSync } from 'node:fs';
import { exportDownwood } from '../levels/downwood-export';
import { STAGES } from './downwood';

type Report = Record<string, { rooms: string[]; crossed: string[]; finds: string[] }>;
const report = JSON.parse(readFileSync('tools/solve/downwood-report.json', 'utf8')) as Report;
const L = exportDownwood();
const dw = (id: string) => `dw-${id}`;

/** The first stage whose kit meets a requirement (place-score's words). */
function stageFor(req: string | null): number {
  return STAGES.findIndex((st) => {
    if (!req) return true;
    if (req.startsWith('keys:')) return st.keys >= Number(req.slice(5));
    if (req === 'boss') return st.boss;
    return st.has.includes(req);
  });
}

const crossed = (stage: string, lamps: 'spent' | 'kept', room: string, to: string) =>
  report[`${stage}-${lamps}`]?.crossed.includes(`${dw(room)}#${to}`) ?? false;

const problems: string[] = [];
let ok = 0;
for (const l of L.links) {
  const k = stageFor(l.requires);
  const st = STAGES[k];
  if (!st) {
    problems.push(`${l.a} -> ${l.b}: no stage has "${l.requires}"`);
    continue;
  }
  const ways: Array<[string, string, boolean]> = [[l.a, l.b, true]];
  // (A shortcut's far side opens it: she goes b -> a first; a -> b once it is open, in the same stage.)
  ways.push([l.b, l.a, !l.oneway]);
  for (const [from, to, claimed] of ways) {
    if (!claimed) {
      const leak = STAGES.find((s) => crossed(s.id, 'kept', from, to));
      if (leak) problems.push(`${from} -> ${to}: one-way, but crossed back (${leak.id}, lamps kept)`);
      else ok++;
      continue;
    }
    if (!crossed(st.id, 'spent', from, to))
      problems.push(`${from} -> ${to} (${l.requires ?? 'open'}): not crossed at ${st.id} with lamps spent`);
    else ok++;
    for (const early of STAGES.slice(0, k))
      if (crossed(early.id, 'kept', from, to))
        problems.push(`${from} -> ${to} (${l.requires}): lock leaks, crossed at ${early.id} (lamps kept)`);
  }
}
// Dead ends entered, finds reached (the last stages, lamps spent).
const finds = new Set([
  ...(report['s3-spent']?.finds ?? []),
  ...(report['later-dj-spent']?.finds ?? []),
  ...(report['later-dash-spent']?.finds ?? []),
]);
const rooms = new Set([
  ...(report['s3-spent']?.rooms ?? []),
  ...(report['later-dj-spent']?.rooms ?? []),
  ...(report['later-dash-spent']?.rooms ?? []),
]);
const deg = new Map<string, number>();
for (const l of L.links) {
  deg.set(l.a, (deg.get(l.a) ?? 0) + 1);
  deg.set(l.b, (deg.get(l.b) ?? 0) + 1);
}
const dead = L.rooms.filter((r) => deg.get(r.id) === 1).map((r) => r.id);
for (const d of dead) if (!rooms.has(dw(d))) problems.push(`dead end ${d} never entered`);
console.log(
  `${ok} link-ways proven; dead ends entered: ${dead.filter((d) => rooms.has(dw(d))).length} of ${dead.length}`,
);
console.log(`finds reached: ${finds.size}`);
for (const p of problems) console.log(`  PROBLEM ${p}`);
console.log(problems.length ? `${problems.length} problems` : 'every link holds and passes as claimed');
