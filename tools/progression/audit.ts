/**
 * Gate audit (world-design §3.2 G3/G7/G8; L3 audit item 3). For every gate or lock annotated with
 * `requires`, and every key ability K in it, the gate's target must NOT be reachable:
 *   - G7 (governs pass/fail): with every kit the player can still have in the gate's room when K is
 *     removed from the game (the solver re-run with K stripped from every grant). The bag empties on
 *     room exit (W2), so the kit is abilities only; the room's own palette is in the sim room already.
 *     A `teachGate` (G8) only has to hold against the kits of the room's earliest visit.
 *   - full kit minus K (informational "future-proof" check: every ability in the sim but K).
 *   - G3 (static): a reach gate may not share a room with a pink sound (a pink spring is an
 *     unlimited ladder) unless pink is the key (Levy), and then it must be a teachGate (G8).
 *   - aimed moves (`moves`, e.g. `seize:up`): with the room's own kit and that move forbidden (the
 *     bot prunes any state where it started), the target must stay unreachable. Room kit only: with
 *     more abilities the ability checks above already say whether the gate leaks.
 * For each ability bypass it finds the minimal ability combos (subsets of the bypassing kit), smallest
 * first, with the bot's tape as evidence.
 */
import type { Answer, Oracle } from './oracle';
import type { Solution } from './solver';
import { type Ability, ALL, abil, abilKey, type GateNode, isSubset, type WorldGraph } from './world';

export interface KitCheck {
  /** The key removed: an ability, or an aimed move (`seize:up`) for `room` checks. */
  verb: string;
  /**
   * g7: kits left in the room when the ability is removed from the game; full: every ability but
   * it; room: the room's own kit (what the sim grants there) with the aimed move forbidden.
   */
  basis: 'g7' | 'full' | 'room';
  kit: Ability[];
  answer: Answer;
  status: 'holds' | 'bypassed';
  /** Minimal ability sets (subsets of `kit`) that reach the target, with evidence. */
  bypasses: { abilities: Ability[]; answer: Answer }[];
  combosTried: number;
  /**
   * Aim checks only: the same query with nothing forbidden. A "holds" means little unless this is
   * a yes (the bot, or a committed tape, gets there WITH the aim).
   */
  control?: Answer;
}

export interface GateAudit {
  gate: GateNode;
  palette: string[];
  /** fail: a G7 kit bypasses it or a G3/G8 rule is broken; warn: only the full-kit check bypasses. */
  status: 'pass' | 'warn' | 'fail' | 'error';
  rules: string[];
  notes: string[];
  checks: KitCheck[];
}

export interface AuditOptions {
  budget: number;
  comboBudget: number;
  /** Largest combo size to try (default: all). */
  comboDepth?: number;
  /** Solves the world with abilities stripped from the game (G7). */
  solveWithout: (strip: Ability[]) => Promise<Solution>;
}

function subsetsOfSize<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < items.length; i++) rec(i + 1, [...acc, items[i] as T]);
  };
  rec(0, []);
  return out;
}

/** Maximal (or, for teach gates, minimal) ability sets among solver states in a room. */
function roomKits(sol: Solution, room: string, earliest: boolean): Ability[][] {
  const sets = sol.states.filter((s) => s.room === room).map((s) => s.abilities);
  const out: Ability[][] = [];
  for (const a of sets) {
    const dominated = earliest
      ? sets.some((b) => b !== a && isSubset(b, a) && b.length < a.length)
      : sets.some((b) => b !== a && isSubset(a, b) && b.length > a.length);
    if (!dominated && !out.some((o) => abilKey(o) === abilKey(a))) out.push(a);
  }
  return out;
}

/** Key of a bypass's evidence tape in RunReport.evidence (aim checks are keyed by the move too). */
export function evidenceKey(
  gateId: string,
  c: Pick<KitCheck, 'basis' | 'verb'>,
  abilities: Ability[],
): string {
  return `${gateId}|${abilities.join('+')}${c.basis === 'room' ? `|no:${c.verb}` : ''}`;
}

export async function auditGates(
  graph: WorldGraph,
  oracle: Oracle,
  opts: AuditOptions,
): Promise<GateAudit[]> {
  const gates = Object.values(graph.rooms).flatMap((r) => r.gates);
  const out: GateAudit[] = gates.map((g) => ({
    gate: g,
    palette: graph.rooms[g.room]?.palette ?? [],
    status: g.problem ? 'error' : 'pass',
    rules: [],
    notes: g.problem ? [g.problem] : [],
    checks: [],
  }));
  const live = out.filter((a) => a.status !== 'error');

  // Static palette rules (G3, G8).
  for (const a of live) {
    const g = a.gate;
    if (g.hold !== 'reach' || !a.palette.includes('pink')) continue;
    if (!g.requires.includes('levy'))
      a.rules.push('G3: reach gate in a room with a pink sound (a pink spring is an unlimited ladder)');
    else if (!g.teachGate)
      a.rules.push(
        'G8: a pink spring-climb gate is only legal as a teachGate (it must not guard progression)',
      );
  }

  // G7 kits per key (one stripped solve per key ability, shared by all gates).
  const stripped = new Map<Ability, Solution>();
  for (const k of new Set(live.flatMap((a) => a.gate.requires)))
    stripped.set(k, await opts.solveWithout([k]));

  const checks: { a: GateAudit; c: KitCheck }[] = [];
  for (const a of live) {
    for (const v of a.gate.requires) {
      const sol = stripped.get(v) as Solution;
      const kits = roomKits(sol, a.gate.room, a.gate.teachGate);
      if (kits.length === 0)
        a.notes.push(`${a.gate.room} is unreachable when ${v} is removed from the game (G7 holds trivially)`);
      for (const kit of kits) checks.push({ a, c: mk(v, 'g7', kit) });
      const full = ALL.filter((x) => x !== v);
      if (!kits.some((k) => abilKey(k) === abilKey(full))) checks.push({ a, c: mk(v, 'full', full) });
    }
    for (const m of a.gate.moves)
      checks.push({ a, c: mk(m, 'room', [...(graph.rooms[a.gate.room]?.grant ?? [])]) });
  }
  const answers = await oracle.ask(
    checks.map(({ a, c }) => ({
      room: a.gate.room,
      from: a.gate.from,
      ...(a.gate.prelude ? { prelude: a.gate.prelude } : {}),
      abilities: c.kit,
      target: a.gate.target,
      ...(a.gate.region ? { region: a.gate.region } : {}),
      ...(c.basis === 'room' ? { forbid: [c.verb] } : {}),
      budget: opts.budget,
    })),
  );
  checks.forEach(({ a, c }, i) => {
    c.answer = answers[i] as Answer;
    c.status = c.answer.verdict === 'yes' ? 'bypassed' : 'holds';
    a.checks.push(c);
  });
  const aims = checks.filter(({ c }) => c.basis === 'room' && c.status === 'holds');
  const controls = await oracle.ask(
    aims.map(({ a, c }) => ({
      room: a.gate.room,
      from: a.gate.from,
      ...(a.gate.prelude ? { prelude: a.gate.prelude } : {}),
      abilities: c.kit,
      target: a.gate.target,
      ...(a.gate.region ? { region: a.gate.region } : {}),
      budget: opts.budget,
    })),
  );
  aims.forEach(({ a, c }, i) => {
    c.control = controls[i] as Answer;
    if (c.control.verdict !== 'yes')
      a.notes.push(
        `aim check "${c.verb}" is inconclusive: the target was not reached even with the aim (${c.control.verdict}), so "holds" only means the bot found nothing`,
      );
  });

  // Minimal bypass combos, level by level; every bypassed check shares each level's batch.
  // Aim checks keep the room kit as their evidence (no ability combos to minimise).
  const open = checks.filter(({ c }) => c.status === 'bypassed' && c.basis !== 'room');
  const maxDepth = opts.comboDepth ?? ALL.length;
  for (let k = 0; k <= maxDepth; k++) {
    const batch: { a: GateAudit; c: KitCheck; set: Ability[] }[] = [];
    for (const { a, c } of open) {
      if (k >= c.kit.length) continue;
      for (const set of subsetsOfSize(c.kit, k)) {
        if (c.bypasses.some((b) => isSubset(b.abilities, set))) continue;
        batch.push({ a, c, set: abil(set) });
      }
    }
    if (batch.length === 0) continue;
    const res = await oracle.ask(
      batch.map(({ a, set }) => ({
        room: a.gate.room,
        from: a.gate.from,
        ...(a.gate.prelude ? { prelude: a.gate.prelude } : {}),
        abilities: set,
        target: a.gate.target,
        ...(a.gate.region ? { region: a.gate.region } : {}),
        budget: opts.comboBudget,
      })),
    );
    batch.forEach(({ c, set }, i) => {
      c.combosTried++;
      const ans = res[i] as Answer;
      if (ans.verdict === 'yes' && !c.bypasses.some((b) => isSubset(b.abilities, set)))
        c.bypasses.push({ abilities: set, answer: ans });
    });
  }
  // No smaller combo found in budget: the kit itself is the evidence.
  for (const { c } of checks)
    if (c.status === 'bypassed' && c.bypasses.length === 0)
      c.bypasses.push({ abilities: c.kit, answer: c.answer });

  for (const a of live) {
    if (a.rules.length > 0 || a.checks.some((c) => c.basis !== 'full' && c.status === 'bypassed'))
      a.status = 'fail';
    else if (a.checks.some((c) => c.status === 'bypassed')) a.status = 'warn';
  }
  return out;
}

function mk(verb: string, basis: KitCheck['basis'], kit: Ability[]): KitCheck {
  return {
    verb,
    basis,
    kit,
    answer: { verdict: 'unknown', how: 'bot', ms: 0 },
    status: 'holds',
    bypasses: [],
    combosTried: 0,
  };
}
