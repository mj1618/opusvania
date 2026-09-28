/**
 * Intended world graph (design intent, e.g. the JSON block in docs/design/world-design.md) and its
 * diff against what the solver finds in the built rooms. Format: memory/progression.md.
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Oracle } from './oracle';
import type { Solution } from './solver';
import { ALL, type Ability, abil, isSubset, type WorldGraph } from './world';

export const INTENDED_FORMAT = 'opusvania-world-graph@1';

const AbilityEnum = z.enum(['wallJump', 'dash', 'doubleJump', 'pogo', 'seize', 'levy']);
const IntendedPickup = z.object({
  id: z.string().min(1),
  grants: z.array(AbilityEnum).min(1),
  /** Abilities needed to get it once in the room. */
  requires: z.array(AbilityEnum).default([]),
});
const IntendedRoom = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  rest: z.boolean().default(false),
  pickups: z.array(IntendedPickup).default([]),
  notes: z.string().optional(),
});
const IntendedEdge = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  /** `door:<char>` or `G`; omitted = any built link from -> to. */
  via: z.string().optional(),
  /** Abilities needed to traverse (all of them); each must hold against the full kit minus it. */
  requires: z.array(AbilityEnum).default([]),
  /** Adds the reverse edge (same `requires` unless `requiresBack`). */
  twoWay: z.boolean().default(false),
  requiresBack: z.array(AbilityEnum).optional(),
  note: z.string().optional(),
});
export const IntendedGraphSchema = z
  .object({
    format: z.literal(INTENDED_FORMAT),
    start: z.string().min(1),
    rooms: z.array(IntendedRoom).min(1),
    edges: z.array(IntendedEdge).default([]),
    /** Pickup ids in intended collection order (sequence-break check). */
    order: z.array(z.string()).default([]),
    /** Sequence breaks that are designed in: `pickup` may be had without `before`. */
    allowedBreaks: z.array(z.object({ pickup: z.string(), before: z.string(), why: z.string().optional() })).default([]),
    /** Room or pickup id that must be reachable (the boss / the end). */
    goal: z.string().optional(),
  })
  .superRefine((g, ctx) => {
    const ids = new Set(g.rooms.map((r) => r.id));
    if (!ids.has(g.start)) ctx.addIssue({ code: 'custom', message: `start "${g.start}" is not a room` });
    for (const e of g.edges)
      for (const end of [e.from, e.to])
        if (!ids.has(end)) ctx.addIssue({ code: 'custom', message: `edge ${e.from} -> ${e.to}: unknown room "${end}"` });
    const pk = new Set(g.rooms.flatMap((r) => r.pickups.map((p) => p.id)));
    for (const o of g.order) if (!pk.has(o)) ctx.addIssue({ code: 'custom', message: `order: unknown pickup "${o}"` });
    if (g.goal && !ids.has(g.goal) && !pk.has(g.goal))
      ctx.addIssue({ code: 'custom', message: `goal "${g.goal}" is neither a room nor a pickup` });
  });
export type IntendedGraph = z.output<typeof IntendedGraphSchema>;

/** Loads a .json file, or the first ```json block in a .md file whose `format` is ours. */
export function loadIntended(path: string): IntendedGraph {
  const text = readFileSync(path, 'utf8');
  if (!path.endsWith('.md')) return IntendedGraphSchema.parse(JSON.parse(text));
  for (const m of text.matchAll(/```json[^\n]*\n([\s\S]*?)```/g)) {
    let v: unknown;
    try {
      v = JSON.parse(m[1] as string);
    } catch {
      continue;
    }
    if (typeof v === 'object' && v !== null && (v as { format?: unknown }).format === INTENDED_FORMAT)
      return IntendedGraphSchema.parse(v);
  }
  throw new Error(`${path}: no \`\`\`json block with "format": "${INTENDED_FORMAT}"`);
}

interface Directed {
  from: string;
  to: string;
  via?: string;
  requires: Ability[];
  label: string;
}

function directed(g: IntendedGraph): Directed[] {
  const out: Directed[] = [];
  for (const e of g.edges) {
    const via = e.via ? ` via ${e.via}` : '';
    out.push({ from: e.from, to: e.to, ...(e.via ? { via: e.via } : {}), requires: abil(e.requires), label: `${e.from} -> ${e.to}${via}` });
    if (e.twoWay)
      out.push({
        from: e.to,
        to: e.from,
        requires: abil(e.requiresBack ?? e.requires),
        label: `${e.to} -> ${e.from} (back)`,
      });
  }
  return out;
}

/** Symbolic solve of the intended graph (world semantics): minimal kits on arrival per room. */
export function solveIntended(g: IntendedGraph): { kits: Record<string, Ability[][]>; pickups: Record<string, Ability[][]> } {
  const edges = directed(g);
  const rooms = new Map(g.rooms.map((r) => [r.id, r]));
  const kits: Record<string, Ability[][]> = {};
  const pickups: Record<string, Ability[][]> = {};
  const add = (bag: Record<string, Ability[][]>, k: string, a: Ability[]) => {
    const list = (bag[k] ??= []);
    if (list.some((x) => isSubset(x, a))) return;
    bag[k] = [...list.filter((x) => !isSubset(a, x)), a];
  };
  const seen = new Set<string>();
  const queue: { room: string; kit: Ability[] }[] = [{ room: g.start, kit: [] }];
  while (queue.length > 0) {
    const { room, kit } = queue.shift() as { room: string; kit: Ability[] };
    add(kits, room, kit);
    // Collect the room's pickups to a fixed point.
    let a = kit;
    for (let changed = true; changed; ) {
      changed = false;
      for (const p of rooms.get(room)?.pickups ?? []) {
        if (!isSubset(p.requires, a)) continue;
        add(pickups, p.id, a);
        if (!isSubset(p.grants, a)) {
          a = abil([...a, ...p.grants]);
          changed = true;
        }
      }
    }
    const key = `${room}|${a.join('+')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const e of edges) if (e.from === room && isSubset(e.requires, a)) queue.push({ room: e.to, kit: a });
  }
  return { kits, pickups };
}

export interface DiffItem {
  level: 'error' | 'warning' | 'info';
  kind:
    | 'not-built'
    | 'not-designed'
    | 'missing-link'
    | 'unplanned-link'
    | 'requirement-bypassed'
    | 'blocked'
    | 'earlier-than-designed'
    | 'harder-than-designed'
    | 'goal-unreachable'
    | 'unreachable-in-design';
  subject: string;
  detail: string;
  tape?: string;
  tapeAbilities?: Ability[];
}

const fmt = (kits: Ability[][] | undefined) =>
  kits && kits.length > 0 ? kits.map((k) => `{${k.join(', ') || 'none'}}`).join(' or ') : 'never';

/**
 * Diffs design intent against the built world: rooms and links on one side only, requirement
 * bypasses (with the full kit minus the required ability), links the built rooms block, and rooms
 * or pickups reachable earlier or later (by kit) than designed.
 */
export async function diffIntended(
  g: IntendedGraph,
  world: WorldGraph,
  built: Solution,
  oracle: Oracle,
  budget: number,
): Promise<DiffItem[]> {
  const out: DiffItem[] = [];
  const designed = new Set(g.rooms.map((r) => r.id));
  for (const r of g.rooms)
    if (!world.rooms[r.id]) out.push({ level: 'info', kind: 'not-built', subject: r.id, detail: 'designed, not built yet' });
  for (const id of Object.keys(world.rooms))
    if (!designed.has(id)) out.push({ level: 'warning', kind: 'not-designed', subject: id, detail: 'built, not in the design' });

  const edges = directed(g);
  const viaMatches = (exitId: string, via?: string) => !via || exitId.endsWith(`/${via === 'G' ? 'G' : via.replace(/^door:/, 'exit:')}`);
  const used = new Set<string>();
  const bypassQs: { e: Directed; exit: string; r: Ability; from: string }[] = [];
  const intendedSol = solveIntended(g);
  for (const e of edges) {
    if (!world.rooms[e.from] || !world.rooms[e.to]) continue;
    const links = world.links.filter((k) => k.from === e.from && k.to === e.to && viaMatches(k.exit, e.via));
    if (links.length === 0) {
      out.push({ level: 'error', kind: 'missing-link', subject: e.label, detail: 'both rooms are built but no door/G links them' });
      continue;
    }
    for (const k of links) {
      used.add(k.exit);
      for (const r of e.requires)
        for (const from of world.rooms[e.from]?.entries ?? []) bypassQs.push({ e, exit: k.exit, r, from });
      // Traversable with the kit the design expects here?
      const want = intendedSol.kits[e.from];
      const got = built.exits[k.exit];
      if (!got?.reached)
        out.push({
          level: 'error',
          kind: 'blocked',
          subject: `${e.label} (${k.exit})`,
          detail: `designed as passable with ${fmt(want)} (+ ${e.requires.join(', ') || 'nothing'}), but the solver never reached ${k.exit} (${got?.why?.verdict ?? 'no'}${got?.why?.budget ? ` in ${got.why.budget} nodes` : ''})`,
        });
    }
  }
  for (const k of world.links)
    if (!used.has(k.exit) && designed.has(k.from) && designed.has(k.to))
      out.push({ level: 'warning', kind: 'unplanned-link', subject: k.exit, detail: `${k.from} -> ${k.to} is built but not in the design` });

  // Requirement bypasses: the exit must be unreachable with the full kit minus each required ability.
  const answers = await oracle.ask(
    bypassQs.map((b) => ({
      room: b.e.from,
      from: b.from,
      abilities: ALL.filter((x) => x !== b.r),
      target: world.rooms[b.e.from]?.exits.find((x) => x.id === b.exit)?.target ?? 'G',
      budget,
    })),
  );
  const reported = new Set<string>();
  bypassQs.forEach((b, i) => {
    const a = answers[i];
    const key = `${b.exit}|${b.r}`;
    if (a?.verdict !== 'yes' || reported.has(key)) return;
    reported.add(key);
    out.push({
      level: 'error',
      kind: 'requirement-bypassed',
      subject: `${b.e.label} (${b.exit})`,
      detail: `designed to need ${b.r}, but reachable from spawn ${b.from} with the full kit minus ${b.r} (tape run with {${(a.tapeAbilities ?? []).join(', ')}})`,
      ...(a.tape ? { tape: a.tape } : {}),
      ...(a.tapeAbilities ? { tapeAbilities: a.tapeAbilities } : {}),
    });
  });

  // Reach by kit: earlier (a built kit no designed kit fits under) or harder (a designed kit with
  // no built kit under it).
  for (const r of g.rooms) {
    if (!world.rooms[r.id]) continue;
    const want = intendedSol.kits[r.id];
    const got = built.rooms[r.id];
    if (!want) {
      out.push({ level: 'warning', kind: 'unreachable-in-design', subject: r.id, detail: 'no designed path reaches this room' });
      continue;
    }
    if (!got?.reached) continue; // reported as unreachable by the solver
    for (const b of got.kits)
      if (!want.some((w) => isSubset(w, b)))
        out.push({
          level: 'warning',
          kind: 'earlier-than-designed',
          subject: r.id,
          detail: `reached with {${b.join(', ') || 'none'}}; designed kits: ${fmt(want)}`,
        });
    for (const w of want)
      if (!got.kits.some((b) => isSubset(b, w)))
        out.push({
          level: 'error',
          kind: 'harder-than-designed',
          subject: r.id,
          detail: `designed reachable with {${w.join(', ') || 'none'}}; built needs ${fmt(got.kits)}`,
        });
  }
  if (g.goal) {
    const ok = built.rooms[g.goal]?.reached || built.pickups[g.goal]?.reached;
    if (!ok) out.push({ level: 'error', kind: 'goal-unreachable', subject: g.goal, detail: 'the goal is not reachable in the built world' });
  }
  return out;
}
