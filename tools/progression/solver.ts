/**
 * Global progression solver. Walks the world graph over states (room, location, abilities), asking
 * the in-room oracle which exits, pickups and Rests each state can reach:
 *   - `world` semantics (Phase 3): abilities persist and only grow. A room's declared `abilities`
 *     are an implicit pickup collected on entry; explicit `pickups` are collected where they stand.
 *   - `gym` semantics (what the sim does today): entering a room SETS the abilities to the room's.
 * Because abilities only grow along a path, the reachable state space is small (one ability set per
 * pickup order). From the explored states it derives: reachable rooms/exits/pickups (and the
 * smallest kits that reach each room) and softlocks (reachable states with no way back to the start
 * room or a Rest). Sequence breaks come from comparing those kits with the design graph
 * (intended.ts#diffDesign).
 */
import type { Answer, Query, Verdict } from './oracle';
import { type Ability, abil, abilKey, isSubset, type RoomNode, type WorldGraph } from './world';

export type Semantics = 'world' | 'gym';
export type Ask = (qs: Query[]) => Promise<Answer[]>;

export interface StateNode {
  id: number;
  room: string;
  /** `spawn:<name>` or `pickup:<id>`. */
  at: string;
  abilities: Ability[];
  parent?: { state: number; via: string };
}

export interface StateEdge {
  from: number;
  to: number;
  via: string;
}

export interface Probe {
  state: number;
  /** Exit, pickup or rest id. */
  node: string;
  kind: 'exit' | 'pickup' | 'rest';
  answer: Answer;
}

export interface Softlock {
  state: number;
  room: string;
  at: string;
  abilities: Ability[];
  path: string[];
  /** Every failed query in its forward closure is a proof (static/exhausted), none "not found in budget". */
  proven: boolean;
}

export interface NodeReach {
  reached: boolean;
  /** Best verdict over all states that asked (yes > unknown > no). */
  verdict: Verdict;
  /**
   * Minimal ability sets with which it was reached: for rooms (and implicit grants), the abilities
   * held when taking the exit into the room; for exits and pickups, the abilities of the state.
   */
  kits: Ability[][];
  /** Evidence for the first yes. */
  evidence?: Answer & { state: number };
  /** Why not (for unreached): the best non-yes answer. */
  why?: Answer;
}

export interface Solution {
  semantics: Semantics;
  states: StateNode[];
  edges: StateEdge[];
  probes: Probe[];
  rooms: Record<string, NodeReach>;
  exits: Record<string, NodeReach>;
  pickups: Record<string, NodeReach>;
  softlocks: Softlock[];
  safeRooms: string[];
  ms: number;
}

export interface SolveOptions {
  semantics: Semantics;
  /** Pickup ids that don't exist for this run (sequence-break analysis). */
  disabled?: ReadonlySet<string>;
  /** Abilities removed from the game (every grant), for G7 "kit without key" (world-design §3.2). */
  strip?: readonly Ability[];
  budget?: number;
}

const RANK: Record<Verdict, number> = { yes: 2, unknown: 1, no: 0 };

/** Adds `kit` to an antichain of minimal sets (drops supersets). */
function addMinimal(kits: Ability[][], kit: Ability[]): void {
  if (kits.some((k) => isSubset(k, kit))) return;
  for (let i = kits.length - 1; i >= 0; i--) if (isSubset(kit, kits[i] as Ability[])) kits.splice(i, 1);
  kits.push(kit);
}

function blank(): NodeReach {
  return { reached: false, verdict: 'no', kits: [] };
}

export async function solve(graph: WorldGraph, ask: Ask, opts: SolveOptions): Promise<Solution> {
  const t0 = performance.now();
  const disabled = opts.disabled ?? new Set<string>();
  const sem = opts.semantics;
  const states: StateNode[] = [];
  const index = new Map<string, number>();
  const edges: StateEdge[] = [];
  const probes: Probe[] = [];
  const rooms: Record<string, NodeReach> = {};
  const exits: Record<string, NodeReach> = {};
  const pickups: Record<string, NodeReach> = {};
  for (const r of Object.values(graph.rooms)) {
    rooms[r.id] = blank();
    for (const x of r.exits) exits[x.id] = blank();
    for (const p of r.pickups) if (!disabled.has(p.id)) pickups[p.id] = blank();
  }

  const strip = opts.strip ?? [];
  const grantsOf = (p: { grants: Ability[] }) => p.grants.filter((a) => !strip.includes(a));
  const implicit = (r: RoomNode) => r.pickups.find((p) => p.implicit && !disabled.has(p.id));
  /** Abilities on arriving in a room. */
  const arrive = (a: Ability[], r: RoomNode): Ability[] => {
    const g = implicit(r);
    if (sem === 'gym') return abil(g ? grantsOf(g) : []);
    return g ? abil([...a, ...grantsOf(g)]) : a;
  };
  const addState = (room: string, at: string, a: Ability[], parent?: StateNode['parent']): number => {
    const key = `${room}|${at}|${abilKey(a)}`;
    // A room's kit = the abilities held when taking the exit into it (before its own grants).
    const before = parent ? (states[parent.state] as StateNode).abilities : [];
    const rr = rooms[room] as NodeReach;
    if (at.startsWith('spawn:')) {
      rr.reached = true;
      rr.verdict = 'yes';
      addMinimal(rr.kits, before);
    }
    const have = index.get(key);
    if (have !== undefined) return have;
    const id = states.length;
    states.push({ id, room, at, abilities: a, ...(parent ? { parent } : {}) });
    index.set(key, id);
    const g = graph.rooms[room];
    const imp = g ? implicit(g) : undefined;
    if (imp && at.startsWith('spawn:')) {
      const pr = pickups[imp.id] as NodeReach;
      pr.reached = true;
      pr.verdict = 'yes';
      addMinimal(pr.kits, before);
    }
    return id;
  };

  const start = graph.rooms[graph.start.room];
  if (!start) throw new Error(`no start room ${graph.start.room}`);
  addState(start.id, `spawn:${graph.start.spawn}`, arrive([], start));

  let frontier = [0];
  while (frontier.length > 0) {
    const qs: Query[] = [];
    const meta: { state: number; node: string; kind: Probe['kind'] }[] = [];
    for (const sid of frontier) {
      const s = states[sid] as StateNode;
      const r = graph.rooms[s.room] as RoomNode;
      const base = queryBase(r, s, opts.budget);
      for (const x of r.exits) {
        qs.push({ ...base, target: x.target });
        meta.push({ state: sid, node: x.id, kind: 'exit' });
      }
      for (const p of r.pickups) {
        if (p.implicit || disabled.has(p.id) || !p.target || s.at === `pickup:${p.id}`) continue;
        qs.push({ ...base, target: p.target });
        meta.push({ state: sid, node: p.id, kind: 'pickup' });
      }
      for (const rest of r.rests) {
        qs.push({ ...base, target: rest.target });
        meta.push({ state: sid, node: rest.id, kind: 'rest' });
      }
    }
    const answers = await ask(qs);
    const next: number[] = [];
    const addStateNew = (room: string, at: string, a: Ability[], via: string, from: number): number => {
      const before = states.length;
      const id = addState(room, at, a, { state: from, via });
      if (states.length > before) next.push(id);
      return id;
    };
    answers.forEach((a, i) => {
      const m = meta[i] as (typeof meta)[number];
      const s = states[m.state] as StateNode;
      probes.push({ ...m, answer: a });
      const bag = m.kind === 'exit' ? exits : m.kind === 'pickup' ? pickups : undefined;
      const nr = bag?.[m.node];
      if (nr && a.verdict === 'yes') {
        nr.reached = true;
        nr.verdict = 'yes';
        addMinimal(nr.kits, s.abilities);
        if (!nr.evidence) nr.evidence = { ...a, state: m.state };
      } else if (nr && !nr.reached) {
        if (!nr.why || RANK[a.verdict] > RANK[nr.why.verdict]) nr.why = a;
        nr.verdict = nr.why.verdict;
      }
      if (a.verdict !== 'yes') return;
      let to: number | undefined;
      if (m.kind === 'exit') {
        const x = graph.rooms[s.room]?.exits.find((e) => e.id === m.node);
        const tr = x ? graph.rooms[x.to] : undefined;
        if (!x || !tr) return;
        to = addStateNew(tr.id, `spawn:${x.toSpawn}`, arrive(s.abilities, tr), m.node, m.state);
      } else if (m.kind === 'pickup') {
        const p = graph.rooms[s.room]?.pickups.find((q) => q.id === m.node);
        if (!p || isSubset(grantsOf(p), s.abilities)) return;
        to = addStateNew(s.room, `pickup:${p.id}`, abil([...s.abilities, ...grantsOf(p)]), m.node, m.state);
      }
      if (to !== undefined) edges.push({ from: m.state, to, via: m.node });
    });
    frontier = next;
  }

  // Softlocks: states that cannot reach a safe state (start room, or a state that can reach a Rest).
  const safe = new Set<number>();
  for (const s of states) if (s.room === graph.start.room) safe.add(s.id);
  for (const p of probes) if (p.kind === 'rest' && p.answer.verdict === 'yes') safe.add(p.state);
  const rev = new Map<number, number[]>();
  for (const e of edges) rev.set(e.to, [...(rev.get(e.to) ?? []), e.from]);
  const coreach = new Set<number>(safe);
  const stack = [...safe];
  while (stack.length > 0) {
    const id = stack.pop() as number;
    for (const p of rev.get(id) ?? [])
      if (!coreach.has(p)) {
        coreach.add(p);
        stack.push(p);
      }
  }
  const fwd = new Map<number, number[]>();
  for (const e of edges) fwd.set(e.from, [...(fwd.get(e.from) ?? []), e.to]);
  const unknownAt = new Set(probes.filter((p) => p.answer.verdict === 'unknown').map((p) => p.state));
  const softlocks: Softlock[] = [];
  for (const s of states) {
    if (coreach.has(s.id)) continue;
    // Proven when nothing in its forward closure was merely "not found in budget".
    const seen = new Set([s.id]);
    const st = [s.id];
    let proven = true;
    while (st.length > 0) {
      const id = st.pop() as number;
      if (unknownAt.has(id)) proven = false;
      for (const n of fwd.get(id) ?? [])
        if (!seen.has(n)) {
          seen.add(n);
          st.push(n);
        }
    }
    softlocks.push({
      state: s.id,
      room: s.room,
      at: s.at,
      abilities: s.abilities,
      path: pathTo(states, s.id),
      proven,
    });
  }
  return {
    semantics: sem,
    states,
    edges,
    probes,
    rooms,
    exits,
    pickups,
    softlocks,
    safeRooms: [...new Set([...safe].map((i) => (states[i] as StateNode).room))].sort(),
    ms: Math.round(performance.now() - t0),
  };
}

function queryBase(r: RoomNode, s: StateNode, budget?: number): Omit<Query, 'target'> {
  const base: Omit<Query, 'target'> = { room: r.id, from: 'default', abilities: s.abilities };
  if (budget !== undefined) base.budget = budget;
  if (s.at.startsWith('spawn:')) base.from = s.at.slice(6);
  else {
    const p = r.pickups.find((q) => `pickup:${q.id}` === s.at);
    if (p?.tx !== undefined && p.ty !== undefined) base.at = { tx: p.tx, ty: p.ty, label: p.id };
  }
  return base;
}

/** The chain of exits/pickups from the start to a state. */
export function pathTo(states: readonly StateNode[], id: number): string[] {
  const out: string[] = [];
  for (let s = states[id]; s?.parent; s = states[s.parent.state]) out.push(s.parent.via);
  return out.reverse();
}
