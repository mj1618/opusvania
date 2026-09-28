/**
 * In-room trap probes (one-way drops inside a room). The solver only asks "from the entry, which
 * exits?", so a pit you can fall into and never leave is invisible to it. For every room state the
 * solver reached whose entry can reach an exit, and every ledge (a standable run of tiles, statically
 * reachable), ask: from the ledge, can the player get back to the entry spawn or reach any exit? If not,
 * and the ledge IS reachable from the entry, it's a trap (proven when every escape query is a proof,
 * suspected when some were only "not found in budget"). Rooms start fresh at the ledge (sources home,
 * plates up): an approximation of the room state the player would really have there.
 */
import type { Answer, Oracle, Query } from './oracle';
import type { Solution } from './solver';
import { type Ability, abilKey, blockers, flood, layout, type WorldGraph } from './world';

export interface Ledge {
  room: string;
  x0: number;
  x1: number;
  ty: number;
}

export interface Trap {
  room: string;
  ledge: string;
  abilities: Ability[];
  entry: string;
  proven: boolean;
  /** Evidence that the ledge is reachable from the entry. */
  reach: Answer;
}

export interface ProbeReport {
  probed: number;
  escaped: number;
  unreachable: number;
  traps: Trap[];
  ms: number;
}

const ledgeName = (l: Ledge) => `x${l.x0}-${l.x1},y${l.ty}`;

/** Standable runs: two free tiles (the 40×80 body) over solid / one-way ground, no hazards. */
export function ledges(roomId: string): Ledge[] {
  const l = layout(roomId);
  const block = blockers(l, [], true); // sources and gates count as solid (they are, by default)
  const free = (x: number, y: number) => {
    const c = l.classAt(x, y);
    return (c === 'empty' || c === 'orb') && !block[y * l.width + x];
  };
  const ground = (x: number, y: number) => {
    const c = l.classAt(x, y);
    return c === 'solid' || c === 'oneWay' || block[y * l.width + x] === 1;
  };
  const out: Ledge[] = [];
  for (let ty = 1; ty < l.height - 1; ty++) {
    let run = -1;
    for (let tx = 0; tx <= l.width; tx++) {
      const ok = tx < l.width && free(tx, ty) && free(tx, ty - 1) && ground(tx, ty + 1);
      if (ok && run < 0) run = tx;
      if (!ok && run >= 0) {
        out.push({ room: roomId, x0: run, x1: tx - 1, ty });
        run = -1;
      }
    }
  }
  return out;
}

export async function probeTraps(
  world: WorldGraph,
  sol: Solution,
  oracle: Oracle,
  budget: number,
): Promise<ProbeReport> {
  const t0 = performance.now();
  // One probe set per (room, entry, abilities) whose entry reached an exit.
  const escapedFrom = new Set(
    sol.probes.filter((p) => p.kind === 'exit' && p.answer.verdict === 'yes').map((p) => p.state),
  );
  const jobs: { room: string; entry: string; abilities: Ability[]; ledge: Ledge }[] = [];
  const seen = new Set<string>();
  for (const s of sol.states) {
    if (!s.at.startsWith('spawn:') || !escapedFrom.has(s.id)) continue;
    const entry = s.at.slice(6);
    const key = `${s.room}|${entry}|${abilKey(s.abilities)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const l = layout(s.room);
    const sp = l.spawns[entry];
    if (!sp) continue;
    const reach = flood(l, blockers(l, s.abilities), sp.tx, sp.ty);
    for (const lg of ledges(s.room)) {
      if (lg.ty === sp.ty && sp.tx >= lg.x0 && sp.tx <= lg.x1) continue; // the spawn's own ledge
      let any = false;
      for (let x = lg.x0; x <= lg.x1 && !any; x++) any = reach[lg.ty * l.width + x] === 1;
      if (any) jobs.push({ room: s.room, entry, abilities: s.abilities, ledge: lg });
    }
  }
  const at = (j: (typeof jobs)[number]) => {
    const mid = Math.floor((j.ledge.x0 + j.ledge.x1) / 2);
    return { tx: mid, ty: j.ledge.ty, label: `${j.room}/ledge:${ledgeName(j.ledge)}` };
  };
  const base = (j: (typeof jobs)[number]): Omit<Query, 'target'> => ({
    room: j.room,
    from: j.entry,
    at: at(j),
    abilities: j.abilities,
    budget,
  });
  // Round 1: back to the entry spawn. Round 2: any exit. Round 3: is the ledge reachable at all?
  const r1 = await oracle.ask(jobs.map((j) => ({ ...base(j), target: `spawn:${j.entry}` })));
  const left: { j: (typeof jobs)[number]; failed: Answer[] }[] = [];
  jobs.forEach((j, i) => {
    const a = r1[i] as Answer;
    if (a.verdict !== 'yes') left.push({ j, failed: [a] });
  });
  const r2q = left.flatMap(({ j }) =>
    (world.rooms[j.room]?.exits ?? []).map((x) => ({ ...base(j), target: x.target })),
  );
  const r2 = await oracle.ask(r2q);
  let k = 0;
  const stuck: typeof left = [];
  for (const item of left) {
    const n = world.rooms[item.j.room]?.exits.length ?? 0;
    const answers = r2.slice(k, k + n);
    k += n;
    if (answers.some((a) => a.verdict === 'yes')) continue;
    item.failed.push(...answers);
    stuck.push(item);
  }
  const r3 = await oracle.ask(
    stuck.map(({ j }) => {
      const ts = layout(j.room).tileSize;
      return {
        room: j.room,
        from: j.entry,
        abilities: j.abilities,
        target: `rect:${j.ledge.x0 * ts},${j.ledge.ty * ts},${(j.ledge.x1 - j.ledge.x0 + 1) * ts},${ts}`,
        budget,
      };
    }),
  );
  const traps: Trap[] = [];
  let unreachable = 0;
  stuck.forEach(({ j, failed }, i) => {
    const reach = r3[i] as Answer;
    if (reach.verdict !== 'yes') {
      unreachable++;
      return;
    }
    traps.push({
      room: j.room,
      ledge: ledgeName(j.ledge),
      abilities: j.abilities,
      entry: j.entry,
      proven: failed.every((a) => a.verdict === 'no'),
      reach,
    });
  });
  return {
    probed: jobs.length,
    escaped: jobs.length - stuck.length,
    unreachable,
    traps,
    ms: Math.round(performance.now() - t0),
  };
}
