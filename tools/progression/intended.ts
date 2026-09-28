/**
 * Intended world graph = the machine-readable graph in docs/design/world-design.md §4.8 (format and
 * token grammar there; our extensions and interpretations in memory/progression.md). Two jobs:
 *   1. Validate the design on its own (symbolic solve over abilities × flags × fever): every
 *      non-stub room reachable, goals reachable, no softlocks (every state can reach a Corner),
 *      teachGate edges never guard a grant, G3 palettes of reach edges at every fever level, what the
 *      sanctioned breaks change, and the G7 plan (the kits each reach gate must fail against).
 *   2. Diff it against the built rooms: rooms and links on one side only, requirements the built
 *      rooms fail to enforce (G7 kits from the built world, bot evidence), and rooms reached with a
 *      smaller or larger kit than designed.
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Oracle } from './oracle';
import type { Solution } from './solver';
import { type Ability, ALL, abil, isSubset, type WorldGraph } from './world';

const DesignRoom = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    purpose: z.array(z.string()).default([]),
    corner: z.boolean().default(false),
    palette: z.array(z.string()).default([]),
    enemies: z.array(z.string()).default([]),
    /** Tokens collected on entering: `ability:x`, `flag:x`, `fever:N`, `item:x`. */
    grants: z.array(z.string()).default([]),
    stub: z.boolean().default(false),
    optional: z.boolean().default(false),
    secret: z.boolean().default(false),
    /** v2: a sub-area of another room (e.g. a Corner alcove), not a separate room. */
    zoneOf: z.string().optional(),
    boss: z.string().optional(),
    /** Per-fever overrides; `palette` replaces the room's palette from that fever up. */
    fever: z
      .record(z.string(), z.object({ palette: z.array(z.string()).optional() }).passthrough())
      .default({}),
  })
  .passthrough();

const DesignEdge = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    dir: z.enum(['both', 'oneway']).default('both'),
    /** AND-list: `ability:x`, `flag:x`, `fever>=N`, `local:<colour>`, `weight:<class>`, `trick:x`. */
    requires: z.array(z.string()).default([]),
    hold: z.enum(['sealed', 'reach']).default('sealed'),
    gate: z.unknown().optional(),
    opens: z.string().optional(),
    sanctionedBreak: z.boolean().default(false),
    teachGate: z.boolean().default(false),
    obsoleteAfter: z.string().optional(),
    soft: z.union([z.boolean(), z.string()]).optional(),
    /** v2: the reach gate's geometric proof (tiles), checked against the §3.1 reach table. */
    proof: z
      .object({
        reqTiles: z.number().optional(),
        kitWithoutKeyTiles: z.number().optional(),
        keyKitTiles: z.number().optional(),
        axis: z.enum(['height', 'gap']).optional(),
      })
      .passthrough()
      .optional(),
    /** Extension: the built exit for from -> to (`door:<char>` or `G`); `viaBack` for to -> from. */
    via: z.string().optional(),
    viaBack: z.string().optional(),
  })
  .passthrough();

export const DesignGraphSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    slice: z.string().optional(),
    abilities: z.array(z.string()).default([]),
    start: z.object({
      room: z.string().min(1),
      abilities: z.array(z.string()).default([]),
      fever: z.number().int().default(0),
    }),
    goals: z.array(z.string()).default([]),
    rooms: z.array(DesignRoom).min(1),
    edges: z.array(DesignEdge).default([]),
    /**
     * Extension: how design abilities map to sim abilities (default: slip -> dash, ropeSkip ->
     * doubleJump, ropes -> wallJump, seize, levy; sim names map to themselves), and sim abilities the
     * design treats as always on (default pogo: the down-jab is part of the jab kit).
     */
    sim: z
      .object({
        abilities: z.record(z.string(), z.string()).default({}),
        base: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .passthrough()
  .superRefine((g, ctx) => {
    const ids = new Set(g.rooms.map((r) => r.id));
    if (!ids.has(g.start.room))
      ctx.addIssue({ code: 'custom', message: `start room "${g.start.room}" is not in rooms` });
    const seen = new Set<string>();
    for (const e of g.edges) {
      if (seen.has(e.id)) ctx.addIssue({ code: 'custom', message: `edge id "${e.id}" is used twice` });
      seen.add(e.id);
      for (const end of [e.from, e.to])
        if (!ids.has(end)) ctx.addIssue({ code: 'custom', message: `edge ${e.id}: unknown room "${end}"` });
      for (const t of e.requires)
        if (!/^(ability|flag|local|weight|trick):[\w:.-]+$|^fever>=\d+$/.test(t))
          ctx.addIssue({ code: 'custom', message: `edge ${e.id}: unknown requirement token "${t}"` });
    }
  });
export type DesignGraph = z.output<typeof DesignGraphSchema>;
type DRoom = DesignGraph['rooms'][number];
type DEdge = DesignGraph['edges'][number];

/** Loads a .json file, or the first ```json block of a .md file that looks like a design graph. */
export function loadDesign(path: string): DesignGraph {
  const text = readFileSync(path, 'utf8');
  if (!path.endsWith('.md')) return DesignGraphSchema.parse(JSON.parse(text));
  for (const m of text.matchAll(/```json[^\n]*\n([\s\S]*?)```/g)) {
    let v: unknown;
    try {
      v = JSON.parse(m[1] as string);
    } catch {
      continue;
    }
    const o = v as { version?: unknown; rooms?: unknown; edges?: unknown };
    if (o && (o.version === 1 || o.version === 2) && Array.isArray(o.rooms) && Array.isArray(o.edges))
      return DesignGraphSchema.parse(v);
  }
  throw new Error(`${path}: no \`\`\`json block with version 1 or 2, rooms and edges`);
}

const DEFAULT_SIM: Record<string, Ability> = { slip: 'dash', ropeSkip: 'doubleJump', ropes: 'wallJump' };

/** Design ability -> sim ability (undefined = not in the sim yet, so not testable). */
export function simAbility(g: DesignGraph, name: string): Ability | undefined {
  const m = g.sim?.abilities[name] ?? DEFAULT_SIM[name] ?? name;
  return (ALL as readonly string[]).includes(m) ? (m as Ability) : undefined;
}
export function simBase(g: DesignGraph): Ability[] {
  return abil((g.sim?.base ?? ['pogo']).filter((a): a is Ability => (ALL as readonly string[]).includes(a)));
}

// ---------------------------------------------------------------------------------------------
// Symbolic solve.

export interface DState {
  id: number;
  room: string;
  abilities: string[];
  flags: string[];
  fever: number;
  parent?: { state: number; via: string };
}

export interface DesignSolve {
  states: DState[];
  edges: { from: number; to: number; via: string }[];
  /** Minimal (abilities, flags, fever) states per room, as labels. */
  reached: Set<string>;
  /** Tokens granted somewhere reachable (ability:x, flag:x, item:x, fever:N). */
  grants: Map<string, DState>;
  usedEdges: Set<string>;
  softlocks: DState[];
}

export interface DesignSolveOptions {
  /** Include sanctionedBreak edges and their `trick:` tokens. */
  breaks: boolean;
  /** Abilities removed from the game (G7). */
  strip?: string[];
  /** Edge ids that don't exist. */
  without?: string[];
  /** Edge ids whose `requires` are ignored (teachGate check: what if the gate leaked?). */
  free?: string[];
}

/** `kind:value` split at the first colon (flag ids contain colons: `flag:boss:grindstone`). */
function token(t: string): [string, string] {
  const i = t.indexOf(':');
  return i < 0 ? [t, ''] : [t.slice(0, i), t.slice(i + 1)];
}

/** The palette a reach gate is measured against: the gate's own `roomPalette` / `approachPalette`
 * when the design gives one (the gated span can be a sound-free segment), else the from-room's. */
function gatePalette(e: DEdge, r: DRoom | undefined, fever: number): string[] {
  const gate = (e.gate ?? {}) as { roomPalette?: unknown; approachPalette?: unknown };
  const own = Array.isArray(gate.roomPalette)
    ? gate.roomPalette
    : Array.isArray(gate.approachPalette)
      ? gate.approachPalette
      : undefined;
  return own ? (own as string[]) : paletteAt(r, fever);
}

function paletteAt(r: DRoom | undefined, fever: number): string[] {
  if (!r) return [];
  let p = r.palette;
  for (const k of Object.keys(r.fever)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n <= fever)
    .sort((a, b) => a - b)) {
    const o = r.fever[String(k)]?.palette;
    if (o) p = o;
  }
  return p;
}

const isSafe = (r: DRoom | undefined) => !!r && (r.corner || r.purpose.includes('rest') || r.stub);

export function solveDesign(g: DesignGraph, opts: DesignSolveOptions): DesignSolve {
  const rooms = new Map(g.rooms.map((r) => [r.id, r]));
  const strip = new Set(opts.strip ?? []);
  const without = new Set(opts.without ?? []);
  const free = new Set(opts.free ?? []);
  const states: DState[] = [];
  const index = new Map<string, number>();
  const edges: DesignSolve['edges'] = [];
  const grants = new Map<string, DState>();
  const usedEdges = new Set<string>();
  const reached = new Set<string>();
  const directed: { e: DEdge; from: string; to: string; back: boolean }[] = [];
  for (const e of g.edges) {
    if (without.has(e.id) || (e.sanctionedBreak && !opts.breaks)) continue;
    directed.push({ e, from: e.from, to: e.to, back: false });
    if (e.dir === 'both') directed.push({ e, from: e.to, to: e.from, back: true });
  }
  const enter = (
    room: string,
    ab: string[],
    fl: string[],
    fever: number,
    parent?: DState['parent'],
  ): number => {
    const r = rooms.get(room);
    const a = new Set(ab);
    const f = new Set(fl);
    let fv = fever;
    for (const t of r?.grants ?? []) {
      const [kind, val] = token(t);
      if (kind === 'ability' && !strip.has(val)) a.add(val);
      else if (kind === 'flag') f.add(val);
      else if (kind === 'fever') fv = Math.max(fv, Number(val));
    }
    const s = { room, abilities: [...a].sort(), flags: [...f].sort(), fever: fv };
    const key = `${room}|${s.abilities.join('+')}|${s.flags.join('+')}|${fv}`;
    reached.add(room);
    const have = index.get(key);
    if (have !== undefined) return have;
    const id = states.length;
    const st: DState = { id, ...s, ...(parent ? { parent } : {}) };
    states.push(st);
    index.set(key, id);
    for (const t of r?.grants ?? []) {
      const [kind, val] = token(t);
      if (kind === 'ability' && strip.has(val)) continue;
      if (!grants.has(t)) grants.set(t, st);
    }
    return id;
  };
  const ok = (s: DState, d: (typeof directed)[number]): boolean => {
    const palettes = new Set([
      ...paletteAt(rooms.get(d.from), s.fever),
      ...(d.back ? paletteAt(rooms.get(d.to), s.fever) : []),
    ]);
    if (free.has(d.e.id)) return true;
    for (const t of d.e.requires) {
      if (t.startsWith('fever>=')) {
        if (s.fever < Number(t.slice(7))) return false;
        continue;
      }
      const [kind, val] = token(t);
      if (kind === 'ability' && !s.abilities.includes(val)) return false;
      if (kind === 'flag' && !s.flags.includes(val)) return false;
      if (kind === 'local' && !palettes.has(val)) return false;
      if (kind === 'weight' && val !== 'feather' && !palettes.has('brown')) return false;
      if (kind === 'trick' && !(opts.breaks && d.e.sanctionedBreak)) return false;
    }
    return true;
  };
  const start = g.start;
  enter(
    start.room,
    start.abilities.filter((a) => !strip.has(a)),
    [],
    start.fever,
  );
  for (let i = 0; i < states.length; i++) {
    const s = states[i] as DState;
    for (const d of directed) {
      if (d.from !== s.room || !ok(s, d)) continue;
      const flags = d.e.opens && !d.back ? [...s.flags, d.e.opens.replace(/^flag:/, '')] : s.flags;
      const to = enter(d.to, s.abilities, flags, s.fever, {
        state: s.id,
        via: d.back ? `${d.e.id}(back)` : d.e.id,
      });
      usedEdges.add(d.e.id);
      edges.push({ from: s.id, to, via: d.e.id });
    }
  }
  // Softlocks: states that can't reach a safe state (a Corner/rest, or a stub = future content).
  const rev = new Map<number, number[]>();
  for (const e of edges) rev.set(e.to, [...(rev.get(e.to) ?? []), e.from]);
  const co = new Set(states.filter((s) => isSafe(rooms.get(s.room))).map((s) => s.id));
  const stack = [...co];
  while (stack.length > 0) {
    const id = stack.pop() as number;
    for (const p of rev.get(id) ?? [])
      if (!co.has(p)) {
        co.add(p);
        stack.push(p);
      }
  }
  return { states, edges, reached, grants, usedEdges, softlocks: states.filter((s) => !co.has(s.id)) };
}

export function designPath(sol: DesignSolve, id: number): string[] {
  const out: string[] = [];
  for (let s = sol.states[id]; s?.parent; s = sol.states[s.parent.state]) out.push(s.parent.via);
  return out.reverse();
}

const label = (s: Pick<DState, 'abilities' | 'flags' | 'fever'>) =>
  `{${[...s.abilities, ...s.flags.map((f) => `flag:${f}`), ...(s.fever ? [`fever ${s.fever}`] : [])].join(', ') || 'none'}}`;

/** a's kit is within b's (abilities, flags and fever). */
const leq = (a: DState, b: DState) =>
  a.fever <= b.fever &&
  a.abilities.every((x) => b.abilities.includes(x)) &&
  a.flags.every((x) => b.flags.includes(x));

/** Minimal / maximal states of a room (by abilities ∪ flags ∪ fever). */
function roomStates(sol: DesignSolve, room: string, which: 'min' | 'max'): DState[] {
  const all = sol.states.filter((s) => s.room === room);
  return all.filter(
    (a) => !all.some((b) => b !== a && (which === 'min' ? leq(b, a) && !leq(a, b) : leq(a, b) && !leq(b, a))),
  );
}

const REACH = JSON.parse(readFileSync(new URL('./reach-table.json', import.meta.url), 'utf8')) as {
  height: Record<'base' | 'ropeSkip' | 'ledgePop' | 'pinkChainAboveApex' | 'brownHop' | 'violetHop', number>;
  gap: Record<'base' | 'slip' | 'ropeSkip' | 'slipRopeSkip' | 'pinkDrift' | 'brownHop' | 'violetHop', number>;
  margin: number;
  cornerMaxRoomsBetween: number;
  bossDoorMaxRoomsFromCorner: number;
};

const fmtPal = (p: string[]) => `{${p.join(', ') || 'none'}}`;

/**
 * Best height or gap (tiles, feather) for design abilities plus a room palette, from the §3.1 table.
 * Off the Ropes adds nothing: G6 keeps humming facings out of any gate it doesn't key.
 */
export function reachTiles(abilities: string[], palette: string[], axis: 'height' | 'gap'): number {
  const has = (a: string) => abilities.includes(a);
  // A sound only moves you once it's seized and levied (springs, recoil hops).
  const n = (c: string) => (has('seize') && has('levy') ? palette.filter((x) => x === c).length : 0);
  let t: number;
  if (axis === 'height') {
    const H = REACH.height;
    t = has('ropeSkip') ? H.ropeSkip : H.base;
    if (n('pink') > 0) t = t - H.ledgePop + H.pinkChainAboveApex;
    t += n('brown') * H.brownHop + n('violet') * H.violetHop;
  } else {
    const G = REACH.gap;
    t =
      has('slip') && has('ropeSkip')
        ? G.slipRopeSkip
        : has('slip')
          ? G.slip
          : has('ropeSkip')
            ? G.ropeSkip
            : G.base;
    if (n('pink') > 0) t += G.pinkDrift;
    t += n('brown') * G.brownHop + n('violet') * G.violetHop;
  }
  return Math.round(t * 100) / 100;
}

/**
 * Corner spacing (§4.8 check 8): on each goal's critical path at most N rooms between Corners (zones
 * aren't rooms; a Corner zone resets the count), and every boss door at most M rooms from a Corner.
 */
function cornerSpacing(g: DesignGraph, intended: DesignSolve): DesignFinding[] {
  const out: DesignFinding[] = [];
  const rooms = new Map(g.rooms.map((r) => [r.id, r]));
  const corner = (id: string) => isSafe(rooms.get(id)) && !rooms.get(id)?.stub;
  for (const goal of g.goals) {
    const st = intended.grants.get(goal);
    if (!st) continue;
    const seq = [g.start.room];
    for (const via of designPath(intended, st.id)) {
      const e = g.edges.find((x) => x.id === via.replace('(back)', ''));
      if (e) seq.push(via.endsWith('(back)') ? e.from : e.to);
    }
    let run = 0;
    let worst = 0;
    let where = '';
    for (const id of seq) {
      if (corner(id)) run = 0;
      else if (!rooms.get(id)?.zoneOf) run++;
      if (run > worst) {
        worst = run;
        where = id;
      }
    }
    if (worst > REACH.cornerMaxRoomsBetween)
      out.push({
        level: 'error',
        check: 'Corner spacing',
        subject: goal,
        detail: `${worst} rooms without a Corner (up to ${where}) on the critical path ${seq.join(' > ')}`,
      });
  }
  // Boss doors: every room you enter a boss room from is within M rooms of a Corner (undirected).
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
  }
  const dist = (from: string) => {
    const seen = new Map([[from, 0]]);
    const q = [from];
    while (q.length > 0) {
      const id = q.shift() as string;
      if (corner(id)) return seen.get(id) as number;
      for (const n of adj.get(id) ?? [])
        if (!seen.has(n)) {
          seen.set(n, (seen.get(id) as number) + 1);
          q.push(n);
        }
    }
    return Number.POSITIVE_INFINITY;
  };
  for (const b of g.rooms.filter((r) => r.boss || r.purpose.includes('boss')))
    for (const e of g.edges.filter((x) => x.to === b.id || (x.dir === 'both' && x.from === b.id))) {
      const door = e.to === b.id ? e.from : e.to;
      if (rooms.get(door)?.stub) continue;
      const d = dist(door);
      if (d > REACH.bossDoorMaxRoomsFromCorner)
        out.push({
          level: 'error',
          check: 'Corner spacing',
          subject: `${b.id} door (${e.id} from ${door})`,
          detail: `${d} rooms from the nearest Corner (max ${REACH.bossDoorMaxRoomsFromCorner})`,
        });
    }
  return out;
}

export interface DesignFinding {
  level: 'error' | 'warning' | 'info';
  check: string;
  subject: string;
  detail: string;
}

export interface G7Plan {
  edge: string;
  from: string;
  to: string;
  key: string;
  teachGate: boolean;
  /** Kits (abilities, flags, fever) the gate must fail against, and the gate room's palette for each. */
  kits: { kit: string; abilities: string[]; palette: string[] }[];
  /** Sim abilities for the kits (unmodelled design abilities dropped), when every key maps. */
  simKits?: Ability[][];
}

export interface DesignReport {
  rooms: number;
  edges: number;
  reachable: string[];
  unreachable: string[];
  onlyWithBreaks: string[];
  findings: DesignFinding[];
  g7: G7Plan[];
  breaks: { edge: string; detail: string }[];
  ms: number;
}

/** Validates the design graph by itself (world-design §4.8 "validator.checks"). */
export function checkDesign(g: DesignGraph): DesignReport {
  const t0 = performance.now();
  const findings: DesignFinding[] = [];
  const intended = solveDesign(g, { breaks: false });
  const withBreaks = solveDesign(g, { breaks: true });
  const rooms = g.rooms.filter((r) => !r.stub);
  const unreachable = rooms.filter((r) => !intended.reached.has(r.id)).map((r) => r.id);
  const onlyWithBreaks = unreachable.filter((id) => withBreaks.reached.has(id));
  // Abilities no room grants and the start lacks: rooms behind them are future returns, not bugs.
  const granted = new Set([
    ...g.start.abilities,
    ...g.rooms.flatMap((r) => r.grants.filter((t) => t.startsWith('ability:')).map((t) => t.slice(8))),
  ]);
  for (const id of unreachable) {
    const future = g.edges
      .filter((e) => e.to === id || (e.dir === 'both' && e.from === id))
      .flatMap((e) => e.requires.filter((t) => t.startsWith('ability:') && !granted.has(t.slice(8))));
    findings.push({
      level:
        onlyWithBreaks.includes(id) || future.length > 0 ? (future.length > 0 ? 'info' : 'warning') : 'error',
      check: 'every non-stub room reachable from start',
      subject: id,
      detail: onlyWithBreaks.includes(id)
        ? 'reachable only through a sanctioned break'
        : future.length > 0
          ? `behind ${[...new Set(future)].join(', ')}, which nothing in this graph grants (a later return)`
          : 'unreachable',
    });
  }
  // Goals, with and without the sanctioned breaks.
  for (const [name, sol] of [
    ['intended', intended],
    ['with breaks', withBreaks],
  ] as const)
    for (const goal of g.goals) {
      const got = sol.grants.has(goal) || (goal.startsWith('room:') && sol.reached.has(goal.slice(5)));
      if (!got)
        findings.push({
          level: 'error',
          check: 'goals reachable',
          subject: goal,
          detail: `${name}: not granted on any reachable path`,
        });
    }
  findings.push(...cornerSpacing(g, intended));
  // Softlocks (with and without breaks: a breaker can strand themselves too).
  for (const [name, sol] of [
    ['intended', intended],
    ['with breaks', withBreaks],
  ] as const) {
    for (const s of sol.softlocks)
      findings.push({
        level: 'error',
        check: 'every reachable state can reach a Corner',
        subject: `${s.room} ${label(s)}`,
        detail: `${name}: no way back to a Corner; path ${designPath(sol, s.id).join(' > ') || '(start)'}`,
      });
  }
  // teachGate edges never guard a grant (G8): a teach gate only holds against the kit of its first
  // visit, so if it leaked (its requirements ignored) no grant may come with a smaller kit.
  const grantRooms = (t: string) => g.rooms.filter((r) => r.grants.includes(t)).map((r) => r.id);
  for (const e of g.edges.filter((x) => x.teachGate)) {
    const leak = solveDesign(g, { breaks: true, free: [e.id] });
    for (const t of new Set(g.rooms.flatMap((r) => r.grants))) {
      if (t.startsWith('item:')) continue;
      for (const room of grantRooms(t)) {
        const before = roomStates(withBreaks, room, 'min');
        const earlier = roomStates(leak, room, 'min').filter((s) => !before.some((b) => leq(b, s)));
        if (earlier.length > 0)
          findings.push({
            level: 'error',
            check: 'teachGate edges never guard a grant',
            subject: e.id,
            detail: `if ${e.id} leaked, ${t} (${room}) could be had with ${earlier.map(label).join(' or ')}`,
          });
      }
    }
    if (e.sanctionedBreak)
      findings.push({
        level: 'warning',
        check: 'G8',
        subject: e.id,
        detail: 'a teachGate is also a sanctioned break',
      });
  }
  // Reach edges: G3 palette arithmetic + G2 margin against the §3.1 table (with the edge's `proof`),
  // at every fever level the room is reached at, and the G7 plan (kits the bot must fail with).
  const g7: G7Plan[] = [];
  const roomById = new Map(g.rooms.map((r) => [r.id, r]));
  for (const e of g.edges) {
    if (e.hold !== 'reach') continue;
    const keys = e.requires.filter((t) => t.startsWith('ability:')).map((t) => t.slice(8));
    const keyColours = e.requires.filter((t) => t.startsWith('local:')).map((t) => t.slice(6));
    const plans: { key: string; states: DState[]; palette: (s: DState) => string[] }[] = [];
    const obsolete = (states: DState[]) => {
      const ob = e.obsoleteAfter?.replace(/^ability:/, '');
      return ob ? states.filter((s) => !s.abilities.includes(ob)) : states;
    };
    for (const k of keys) {
      const sol = solveDesign(g, { breaks: true, strip: [k] });
      plans.push({
        key: k,
        states: obsolete(roomStates(sol, e.from, e.teachGate ? 'min' : 'max')),
        palette: (s) => gatePalette(e, roomById.get(e.from), s.fever),
      });
    }
    // A palette key (`local:<colour>`) without an ability key: kit-without-key = that colour removed.
    if (keys.length === 0 && keyColours.length > 0)
      for (const c of keyColours)
        plans.push({
          key: `local:${c}`,
          states: obsolete(roomStates(withBreaks, e.from, e.teachGate ? 'min' : 'max')),
          palette: (s) => gatePalette(e, roomById.get(e.from), s.fever).filter((x) => x !== c),
        });
    for (const p of plans) {
      const kits = p.states.map((s) => ({ kit: label(s), abilities: s.abilities, palette: p.palette(s) }));
      const plan: G7Plan = { edge: e.id, from: e.from, to: e.to, key: p.key, teachGate: e.teachGate, kits };
      if (simAbility(g, p.key) || p.key.startsWith('local:'))
        plan.simKits = kits.map((x) =>
          abil([...simBase(g), ...x.abilities.map((a) => simAbility(g, a)).filter((a): a is Ability => !!a)]),
        );
      if (!e.sanctionedBreak) g7.push(plan);
      if (kits.length === 0 && !e.sanctionedBreak)
        findings.push({
          level: 'info',
          check: 'G7',
          subject: e.id,
          detail: `${e.from} is unreachable without ${p.key}`,
        });
      // Palette arithmetic (G2/G3/G7 proof).
      const req = e.proof?.reqTiles;
      const axis = e.proof?.axis ?? 'height';
      for (const k of kits) {
        const est = reachTiles(k.abilities, k.palette, axis);
        if (req === undefined) {
          if (k.palette.includes('pink') && !keyColours.includes('pink'))
            findings.push({
              level: e.sanctionedBreak ? 'info' : 'error',
              check: 'G3 palette',
              subject: e.id,
              detail: `reach gate without a proof in a room with pink (a floor spring alone is 7 tiles); kit ${k.kit} + ${fmtPal(k.palette)}`,
            });
          continue;
        }
        if (req < est + REACH.margin && !e.sanctionedBreak)
          findings.push({
            level: 'error',
            check: 'G2/G7 proof',
            subject: e.id,
            detail: `${axis} ${req} tiles < kit-without-${p.key} ${k.kit} + palette ${fmtPal(k.palette)} = ${est} + ${REACH.margin} margin (§3.1 table)`,
          });
        const claimed = e.proof?.kitWithoutKeyTiles;
        if (claimed !== undefined && est > claimed + 0.01 && !e.sanctionedBreak)
          findings.push({
            level: 'warning',
            check: 'G7 proof',
            subject: e.id,
            detail: `proof says kit-without-key reaches ${claimed} tiles; the §3.1 table gives ${est} for ${k.kit} + ${e.from}'s palette ${fmtPal(k.palette)} (if the gated span is sound-free or in ${e.to}, say so with gate.approachPalette)`,
          });
      }
    }
    if (plans.length === 0 && !e.sanctionedBreak)
      findings.push({
        level: 'info',
        check: 'G7',
        subject: e.id,
        detail: 'reach edge keyed by flag/fever/weight only: the bot proof needs the built room',
      });
  }
  // What each sanctioned break changes: rooms and grants it reaches with a smaller kit.
  const breaks: DesignReport['breaks'] = [];
  for (const e of g.edges.filter((x) => x.sanctionedBreak)) {
    const without = solveDesign(g, { breaks: true, without: [e.id] });
    const earlier: string[] = [];
    for (const r of g.rooms) {
      const a = roomStates(withBreaks, r.id, 'min').map(label);
      const b = new Set(roomStates(without, r.id, 'min').map(label));
      const newKits = a.filter((k) => !b.has(k));
      if (newKits.length > 0 && withBreaks.reached.has(r.id))
        earlier.push(`${r.id} with ${newKits.join(' or ')}`);
    }
    breaks.push({
      edge: e.id,
      detail: earlier.length ? `adds: ${earlier.join('; ')}` : 'changes nothing (reachable anyway)',
    });
  }
  return {
    rooms: g.rooms.length,
    edges: g.edges.length,
    reachable: rooms.filter((r) => intended.reached.has(r.id)).map((r) => r.id),
    unreachable,
    onlyWithBreaks,
    findings,
    g7,
    breaks,
    ms: Math.round(performance.now() - t0),
  };
}

// ---------------------------------------------------------------------------------------------
// Diff against the built world.

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
    | 'untestable'
    | 'goal-unreachable';
  subject: string;
  detail: string;
  tape?: string;
  tapeAbilities?: Ability[];
}

const fmtKits = (kits: Ability[][] | undefined) =>
  kits && kits.length > 0 ? kits.map((k) => `{${k.join(', ') || 'none'}}`).join(' or ') : 'never';

export interface DiffOptions {
  budget: number;
  /** Built-world solve with abilities stripped from the game (G7 kits), memoised by the caller. */
  solveWithout: (strip: Ability[]) => Promise<Solution>;
}

export async function diffDesign(
  g: DesignGraph,
  world: WorldGraph,
  built: Solution,
  oracle: Oracle,
  opts: DiffOptions,
): Promise<DiffItem[]> {
  const out: DiffItem[] = [];
  const designed = new Set(g.rooms.map((r) => r.id));
  const builtIds = Object.keys(world.rooms);
  const overlap = builtIds.filter((id) => designed.has(id));
  const notBuilt = g.rooms.filter((r) => !world.rooms[r.id] && !r.stub && !r.zoneOf).map((r) => r.id);
  if (notBuilt.length)
    out.push({
      level: 'info',
      kind: 'not-built',
      subject: `${notBuilt.length} rooms`,
      detail: notBuilt.join(', '),
    });
  const notDesigned = builtIds.filter((id) => !designed.has(id));
  if (notDesigned.length)
    out.push({
      level: overlap.length === 0 ? 'info' : 'warning',
      kind: 'not-designed',
      subject: `${notDesigned.length} rooms`,
      detail: `built but not in the design: ${notDesigned.join(', ')}`,
    });
  if (overlap.length === 0) return out;

  // Goals in the built world: an ability some state holds, or a room reached.
  for (const goal of g.goals) {
    const [kind, val] = token(goal);
    const sim = kind === 'ability' ? simAbility(g, val) : undefined;
    const ok =
      kind === 'ability' && sim
        ? built.states.some((s) => s.abilities.includes(sim))
        : kind === 'room'
          ? built.rooms[val]?.reached === true
          : undefined;
    if (ok === false)
      out.push({
        level: 'error',
        kind: 'goal-unreachable',
        subject: goal,
        detail: 'not reached in the built world',
      });
  }

  const exitMatch = (exitId: string, via?: string) =>
    !via || exitId.endsWith(`/${via === 'G' ? 'G' : via.replace(/^door:/, 'exit:')}`);
  const used = new Set<string>();
  const g7: { e: DEdge; exit: string; k: Ability; kit: Ability[]; from: string }[] = [];
  const toSim = (list: string[]) => list.map((a) => simAbility(g, a)).filter((a): a is Ability => !!a);
  for (const e of g.edges) {
    const dirs = [{ from: e.from, to: e.to, via: e.via, back: false }];
    if (e.dir === 'both') dirs.push({ from: e.to, to: e.from, via: e.viaBack, back: true });
    for (const d of dirs) {
      if (!world.rooms[d.from] || !world.rooms[d.to]) continue;
      const links = world.links.filter((k) => k.from === d.from && k.to === d.to && exitMatch(k.exit, d.via));
      const name = `${e.id} ${d.from} -> ${d.to}${d.back ? ' (back)' : ''}`;
      if (links.length === 0) {
        out.push({
          level: d.back ? 'warning' : 'error',
          kind: 'missing-link',
          subject: name,
          detail: 'both rooms are built but no door/G links them',
        });
        continue;
      }
      for (const k of links) {
        used.add(k.exit);
        if (!built.exits[k.exit]?.reached)
          out.push({
            level: 'error',
            kind: 'blocked',
            subject: `${name} (${k.exit})`,
            detail: `the solver never reached ${k.exit} (${built.exits[k.exit]?.why?.verdict ?? 'no'})`,
          });
        // G7 applies to every gate with an ability key (sealed ones usually get a static proof).
        if (d.back || e.sanctionedBreak) continue;
        const keys = e.requires.filter((t) => t.startsWith('ability:')).map((t) => t.slice(8));
        for (const key of keys) {
          const k2 = simAbility(g, key);
          if (!k2) {
            out.push({
              level: 'info',
              kind: 'untestable',
              subject: name,
              detail: `key ${key} is not in the sim yet`,
            });
            continue;
          }
          const sol = await opts.solveWithout([k2]);
          const all = sol.states.filter((s) => s.room === d.from).map((s) => s.abilities);
          const kits = all.filter(
            (a, i) => !all.some((b, j) => j !== i && isSubset(a, b) && (b.length > a.length || j < i)),
          );
          for (const kit of kits)
            for (const from of world.rooms[d.from]?.entries ?? [])
              g7.push({ e, exit: k.exit, k: k2, kit, from });
        }
      }
    }
  }
  for (const k of world.links)
    if (!used.has(k.exit) && designed.has(k.from) && designed.has(k.to))
      out.push({
        level: 'warning',
        kind: 'unplanned-link',
        subject: k.exit,
        detail: `${k.from} -> ${k.to} is built but not in the design`,
      });

  const answers = await oracle.ask(
    g7.map((b) => ({
      room: world.rooms[b.exit.split('/')[0] as string]?.id ?? '',
      from: b.from,
      abilities: b.kit,
      target: world.rooms[b.exit.split('/')[0] as string]?.exits.find((x) => x.id === b.exit)?.target ?? 'G',
      budget: opts.budget,
    })),
  );
  const reported = new Set<string>();
  g7.forEach((b, i) => {
    const a = answers[i];
    const key = `${b.exit}|${b.k}`;
    if (a?.verdict !== 'yes' || reported.has(key)) return;
    reported.add(key);
    out.push({
      level: 'error',
      kind: 'requirement-bypassed',
      subject: `${b.e.id} (${b.exit})`,
      detail: `designed to need ${b.k} (G7), but reachable without it with kit {${b.kit.join(', ')}} (tape run with {${(a.tapeAbilities ?? []).join(', ')}})`,
      ...(a.tape ? { tape: a.tape } : {}),
      ...(a.tapeAbilities ? { tapeAbilities: a.tapeAbilities } : {}),
    });
  });

  // Reach by kit (sim abilities). Earlier than every designed kit, sanctioned breaks included, is an
  // unlisted sequence break; needing more than the intended (no-break) kit means the build is harder.
  const base = simBase(g);
  const arrivalKits = (sol: DesignSolve, id: string) =>
    roomStates(sol, id, 'min').map((s) => {
      // The kit on arrival, before the room's own grants: the parent state's abilities.
      const p = s.parent ? sol.states[s.parent.state] : undefined;
      return abil([...base, ...toSim(p ? p.abilities : g.start.abilities)]);
    });
  const intended = solveDesign(g, { breaks: false });
  const withBreaks = solveDesign(g, { breaks: true });
  for (const id of overlap) {
    const want = arrivalKits(intended, id);
    const allowed = arrivalKits(withBreaks, id);
    const got = built.rooms[id];
    if (!got?.reached || allowed.length === 0) continue;
    for (const b of got.kits)
      if (!allowed.some((w) => isSubset(w, abil([...b, ...base]))))
        out.push({
          level: 'error',
          kind: 'earlier-than-designed',
          subject: id,
          detail: `sequence break: reached with {${b.join(', ') || 'none'}}; designed kits (with sanctioned breaks): ${fmtKits(allowed)}`,
        });
    for (const w of want)
      if (!got.kits.some((b) => isSubset(b, w)))
        out.push({
          level: 'error',
          kind: 'harder-than-designed',
          subject: id,
          detail: `designed reachable with {${w.join(', ') || 'none'}}; built needs ${fmtKits(got.kits)}`,
        });
  }
  return out;
}
