/**
 * Gate audit (L3 design rule: Seize/Levy gates must hold against the full movement kit). For every
 * gate or lock annotated with `requires`, and every ability V in it: the gate's target must NOT be
 * reachable with the full kit minus V. When it is (a bypass), the audit finds the minimal ability
 * combos (without V) that bypass it, smallest first, skipping supersets of known bypasses, each with
 * the bot's tape as evidence.
 */
import type { Answer, Oracle } from './oracle';
import { ALL, type Ability, abil, type GateNode, isSubset, type WorldGraph } from './world';

export interface GateCheck {
  verb: Ability;
  kit: Ability[];
  answer: Answer;
  /** holds: static/exhausted proof, or not found within `answer.budget` nodes. */
  status: 'holds' | 'bypassed';
  /** Minimal ability sets (without `verb`) that reach the target, with evidence. */
  bypasses: { abilities: Ability[]; answer: Answer }[];
  combosTried: number;
}

export interface GateAudit {
  gate: GateNode;
  status: 'pass' | 'fail' | 'error';
  checks: GateCheck[];
}

export interface AuditOptions {
  budget: number;
  comboBudget: number;
  /** Largest combo size to try (default: all). */
  comboDepth?: number;
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

export async function auditGates(graph: WorldGraph, oracle: Oracle, opts: AuditOptions): Promise<GateAudit[]> {
  const gates = Object.values(graph.rooms).flatMap((r) => r.gates);
  const out: GateAudit[] = gates.map((g) => ({ gate: g, status: g.problem ? 'error' : 'pass', checks: [] }));
  const live = out.filter((a) => a.status !== 'error');
  // 1. Full kit minus each required ability (one batch for every gate).
  const first = live.flatMap((a) => a.gate.requires.map((v) => ({ a, v, kit: ALL.filter((x) => x !== v) })));
  const answers = await oracle.ask(
    first.map(({ a, kit }) => ({
      room: a.gate.room,
      from: a.gate.from,
      abilities: kit,
      target: a.gate.target,
      budget: opts.budget,
    })),
  );
  first.forEach(({ a, v, kit }, i) => {
    const ans = answers[i] as Answer;
    const status = ans.verdict === 'yes' ? 'bypassed' : 'holds';
    a.checks.push({ verb: v, kit, answer: ans, status, bypasses: [], combosTried: 0 });
    if (status === 'bypassed') a.status = 'fail';
  });
  // 2. Minimal bypass combos, level by level (all bypassed checks share each level's batch).
  const open = live.flatMap((a) => a.checks.filter((c) => c.status === 'bypassed').map((c) => ({ a, c })));
  const maxDepth = opts.comboDepth ?? ALL.length - 1;
  for (let k = 0; k < ALL.length - 1 && k <= maxDepth; k++) {
    const batch: { a: GateAudit; c: GateCheck; set: Ability[] }[] = [];
    for (const { a, c } of open) {
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
        abilities: set,
        target: a.gate.target,
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
  // The full kit itself is the last resort evidence when no smaller combo was found in budget.
  for (const { c } of open)
    if (c.bypasses.length === 0) c.bypasses.push({ abilities: c.kit, answer: c.answer });
  return out;
}
