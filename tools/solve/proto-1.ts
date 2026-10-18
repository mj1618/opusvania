/**
 * Lanternroot's solver (docs/design/levels/proto-1.md §9, memory/lanternroot.md). `npx tsx tools/solve/proto-1.ts`
 * proves the level in the real sim and prints a report; `--write` also stores the lines it found
 * (tools/solve/proto-1-tapes.json) for the tests to replay; `--locks` runs the skip-hunter too (slow).
 *
 *  - **Edges** (tools/levels/lanternroot-graph.ts): each one is played from its place, with its kit and flags, every
 *    warm lamp but its own spent, moonwicks cold: the explorer (tools/solve/explore.ts) finds a line to its goal, or a
 *    driver (tools/solve/drivers.ts) plays the timed and fought ones (the vault, the Answer, the boss, the ram). The
 *    line is a list of macro names: replayed, it is the edge's proof.
 *  - **Progression**: a breadth-first search over (places reached, abilities, flags, upgrades) by the proven edges and
 *    the exits' arrivals, from the night's spawn with the starting kit. Every place and find must be reached; Kindle
 *    must come before Gust; taking a tool's glade away must leave its locks unreachable.
 *  - **No softlock**: with every warm lamp spent, from every place reached a moon patch is reachable.
 *  - **Fuel**: every moonwick has renewable glow in its chamber (a regrowing pod, or a creature that comes back).
 *  - **Locks** (the skip-hunter): from the places before a tool, without it, the explorer (double jumps, glides,
 *    flings and their chains, pogos, cuts) must never reach what the tool opens.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { getRoom } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';
import { PROTO_WORLD } from '../../src/scene/world';
import { createState, newSave, placePlayer } from '../../src/sim/index';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { ARRIVALS, BASE_KIT, EDGES, LOCKS, type Lock, type LrEdge } from '../levels/lanternroot-graph';
import { DRIVERS } from './drivers';
import {
  airKindleMacros,
  baseMacros,
  cutMacros,
  explore,
  feet,
  flingMacros,
  gustMacros,
  kindleMacro,
  type Macro,
  pathTo,
  play,
  pogoMacros,
} from './explore';

export const TAPES_FILE = 'tools/solve/proto-1-tapes.json';

/** A place of a room (its `marks.places`, or `spawn`). */
export function placeOf(room: Room, id: string): { x: number; y: number } {
  if (id === 'spawn') return room.spawn;
  const p = room.marks?.places?.find((q) => q.id === id);
  if (!p) throw new Error(`no place "${id}" in ${room.id}`);
  return p;
}

/** Every macro the explorer knows, by name (a line is replayed by its names). */
let REGISTRY: Map<string, Macro> | null = null;
export function macro(name: string): Macro {
  if (!REGISTRY) {
    REGISTRY = new Map();
    for (const m of [
      ...baseMacros(),
      ...gustMacros(),
      ...pogoMacros(),
      ...cutMacros(),
      ...flingMacros(),
      kindleMacro(),
      ...airKindleMacros(),
    ])
      REGISTRY.set(m.name, m);
  }
  const m = REGISTRY.get(name);
  if (!m) throw new Error(`no macro "${name}"`);
  return m;
}

export interface Setup {
  room: string;
  at: string;
  kit: string[];
  flags?: string[];
  opened?: string[];
  /** Warm lamps left burning (every other warm lamp of the room is spent). */
  lamps?: string[];
}

/**
 * A standing state for a proof: in `room` at place `at`, owning `kit`, with `flags`; every warm lamp spent but
 * `lamps` and the lamp-held gates (their flags not set), moonwicks as the save keeps them, glow full.
 */
export function setup(
  o: Setup,
  t: Tuning = cloneTuning(defaultTuning),
): { state: GameState; room: Room; t: Tuning } {
  const room = getRoom(o.room);
  const save = newSave(o.kit as never);
  save.flags.push(...(o.flags ?? []));
  save.opened.push(...(o.opened ?? []));
  save.visited.push(room.id);
  const state = createState(1, t, room, [], o.kit, save);
  const at = placeOf(room, o.at);
  placePlayer(state, at.x, at.y, t, withShortcuts(room, state.save), []);
  const list = room.lures ?? [];
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (!l || l.kind === 'moonwick' || l.kind === 'great') continue;
    if (l.sets && !state.save.flags.includes(l.sets)) continue;
    if ((o.lamps ?? []).includes(l.id)) continue;
    state.lures.hp[i] = 0;
    state.lures.out[i] = 1;
  }
  state.player.glow = Math.round(t.glow.max);
  // (Settled where she stands.)
  return { state, room, t };
}

/** Does the state meet goal `to` (a place, a flag, a find)? Exits are judged by the explorer's exits. */
export function meets(room: Room, to: string, s: GameState): boolean {
  if (to.startsWith('flag:')) return s.save.flags.includes(to.slice(5));
  if (to.startsWith('exit:')) return false;
  const f = feet(s);
  if (to.startsWith('find:')) {
    const id = to.slice(5);
    if (s.save.taken.includes(`${room.id}:${id}`)) return true;
    const patch = room.patches?.find((p) => p.id === id);
    if (patch) return Math.abs(f.x - patch.x) < 60 && Math.abs(f.y - patch.y) < 4;
    const sign = room.signs?.find((p) => p.id === id);
    if (sign) return Math.abs(f.x - sign.x) < 90 && f.y <= sign.y + 1 && f.y >= sign.y - 200;
    const trig = room.triggers?.find((p) => p.id === id);
    if (trig) return s.save.flags.includes(trig.sets);
    const glade = room.glades?.find((g) => g.id === id);
    if (glade) return s.save.abilities.includes(glade.ability);
    return false;
  }
  const p = placeOf(room, to);
  return s.player.grounded && Math.abs(f.x - p.x) < 64 && Math.abs(f.y - p.y) < 6;
}

export interface Proof {
  edge: string;
  ok: boolean;
  macros?: string[];
  /** A driver's whole input, run-length (its proof replays it from the driver's start). */
  tape?: number[];
  frames?: number;
  why?: string;
}

/** An edge's id (stable: the tapes are keyed by it). */
export function edgeId(e: LrEdge): string {
  return `${e.room}:${e.from}->${e.to}`;
}

function kitOf(e: LrEdge): string[] {
  return [...new Set([...BASE_KIT, ...(e.needs ?? [])])];
}

/** Finds a line for an `explore` edge (and its way back, for a `both`). */
export function proveEdge(e: LrEdge, back = false): Proof {
  const from = back ? e.to : e.from;
  const to = back ? e.from : e.to;
  const id = back ? `${e.room}:${e.to}->${e.from}` : edgeId(e);
  if (e.proof.startsWith('driver:')) {
    const d = DRIVERS[e.proof.slice(7)];
    if (!d) return { edge: id, ok: false, why: `no driver ${e.proof}` };
    const r = d();
    return {
      edge: id,
      ok: r.ok,
      frames: r.frames,
      ...(r.tape ? { tape: r.tape } : {}),
      ...(r.ok ? {} : { why: r.why }),
    };
  }
  const { state, room, t } = setup({
    room: e.room,
    at: from,
    kit: kitOf(e),
    flags: e.flags ?? [],
    lamps: e.lamps,
  });
  const exit = to.startsWith('exit:') ? to.slice(5) : null;
  const res = explore({
    scene: room,
    tuning: t,
    start: [state],
    world: PROTO_WORLD,
    creatures: e.creatures ?? false,
    maxNodes: e.budget ?? 2500,
    order: e.byTime ? 'time' : 'moves',
    goal: exit ? undefined : (s) => meets(room, to, s),
    ...(exit ? { goalExit: exit } : {}),
  });
  if (exit) {
    const x = res.exits.get(exit);
    if (!x) return { edge: id, ok: false, why: `exit ${exit} not reached (${res.nodes.size} nodes)` };
    const p = pathTo(res, x.from);
    return { edge: id, ok: true, macros: [...p.macros, x.macro], frames: p.tape.length + x.tape.length };
  }
  for (const n of res.nodes.values())
    if (meets(room, to, n.state)) {
      const p = pathTo(res, n);
      return { edge: id, ok: true, macros: p.macros, frames: p.tape.length };
    }
  return {
    edge: id,
    ok: false,
    why: `not reached (${res.nodes.size} nodes${res.truncated ? ', truncated' : ''})`,
  };
}

/** Replays a stored line from its edge's start; true if it meets the goal. */
export function replay(e: LrEdge, macros: string[], back = false): { ok: boolean; frames: number } {
  const from = back ? e.to : e.from;
  const to = back ? e.from : e.to;
  const { state, room, t } = setup({
    room: e.room,
    at: from,
    kit: kitOf(e),
    flags: e.flags ?? [],
    lamps: e.lamps,
  });
  const scene = { ...room, enemies: e.creatures ? room.enemies : [] } as Room;
  let s = state;
  if (!e.creatures) s.enemies = s.enemies.map((q) => ({ ...q, gone: true }));
  let frames = 0;
  const exit = to.startsWith('exit:') ? to.slice(5) : null;
  for (const name of macros) {
    const r = play(s, macro(name), scene, t, Math.round(t.glow.max), PROTO_WORLD);
    frames += r.tape.length;
    if (r.outcome === 'exit') return { ok: exit !== null && r.exit === exit, frames };
    if (r.outcome !== 'stand') return { ok: false, frames };
    // (The lamps the edge names burn again, as in its search.)
    const list = scene.lures ?? [];
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (l && (e.lamps ?? []).includes(l.id)) {
        r.state.lures.hp[i] = Math.max(1, r.state.lures.hp[i] ?? 0);
        r.state.lures.ember[i] = 0;
        r.state.lures.out[i] = 0;
      }
    }
    s = r.state;
  }
  return { ok: exit === null && meets(room, to, s), frames };
}

// --- The progression, symbolically, by the proven edges.

export interface Progress {
  places: Set<string>;
  abilities: string[];
  flags: Set<string>;
  upgrades: Set<string>;
  /** The kit she has when each place is first reached. */
  firstWith: Map<string, string[]>;
}

/** What a find gives (an ability from a glade, an upgrade from a hollow). */
function grants(room: Room, find: string): { ability?: string; upgrade?: string } {
  const g = room.glades?.find((q) => q.id === find);
  if (g) return { ability: g.ability };
  const h = room.hollows?.find((q) => q.id === find);
  if (h) return { upgrade: h.upgrade };
  return {};
}

/**
 * The progression from the night's spawn: edges usable once their needs, flags and upgrades are owned; `without`
 * removes finds (a tool's glade) to show what then stays locked; `spent` drops every edge that flings off warm lamps.
 */
export function progress(
  opts: { without?: string[]; spent?: boolean; start?: string; kit?: string[] } = {},
): Progress {
  const start = opts.start ?? 'lr-night:spawn';
  const places = new Set<string>([start]);
  const abilities = new Set<string>(opts.kit ?? BASE_KIT);
  const flags = new Set<string>();
  const upgrades = new Set<string>();
  const firstWith = new Map<string, string[]>([[start, [...abilities]]]);
  const order: string[] = [];
  const edges: Array<{ room: string; from: string; to: string; e: LrEdge }> = [];
  for (const e of EDGES) {
    if (opts.spent && (e.lamps?.length ?? 0) > 0) continue;
    edges.push({ room: e.room, from: e.from, to: e.to, e });
    if (e.both) edges.push({ room: e.room, from: e.to, to: e.from, e });
  }
  for (;;) {
    let grew = false;
    for (const { room, from, to, e } of edges) {
      if (!places.has(`${room}:${from}`)) continue;
      if (!(e.needs ?? []).every((a) => abilities.has(a))) continue;
      if (!(e.flags ?? []).every((f) => flags.has(f))) continue;
      if (!(e.upgrades ?? []).every((u) => upgrades.has(u))) continue;
      const node = `${room}:${to}`;
      if (!places.has(node)) {
        places.add(node);
        firstWith.set(node, [...abilities]);
        grew = true;
      }
      if (to.startsWith('flag:') && !flags.has(to.slice(5))) {
        flags.add(to.slice(5));
        grew = true;
      }
      if (to.startsWith('find:')) {
        const id = to.slice(5);
        if ((opts.without ?? []).includes(`${room}:${id}`)) continue;
        const g = grants(getRoom(room), id);
        if (g.ability && !abilities.has(g.ability)) {
          abilities.add(g.ability);
          order.push(g.ability);
          grew = true;
        }
        if (g.upgrade && !upgrades.has(g.upgrade)) {
          upgrades.add(g.upgrade);
          grew = true;
        }
        const room0 = getRoom(room);
        const trig = room0.triggers?.find((q) => q.id === id);
        if (trig && !flags.has(trig.sets)) {
          flags.add(trig.sets);
          grew = true;
        }
      }
      if (to.startsWith('exit:')) {
        const arrive = ARRIVALS[`${room}#${to.slice(5)}`];
        if (arrive && !places.has(arrive)) {
          places.add(arrive);
          firstWith.set(arrive, [...abilities]);
          grew = true;
        }
      }
    }
    if (!grew) break;
  }
  return { places, abilities: order, flags, upgrades, firstWith };
}

/** Every place the graph names and every find of the level's rooms (as `room:find:id`): all must be reached. */
export function allTargets(): string[] {
  const out = new Set<string>();
  for (const e of EDGES) {
    if (!e.from.includes(':')) out.add(`${e.room}:${e.from}`);
    if (!e.to.startsWith('flag:') && !e.to.startsWith('exit:')) out.add(`${e.room}:${e.to}`);
  }
  for (const id of ['lr-night', 'lr-hall', 'lr-roots', 'lr-cache']) {
    const r = getRoom(id);
    for (const f of [...(r.hollows ?? []), ...(r.glades ?? []), ...(r.signs ?? []), ...(r.mothStones ?? [])])
      out.add(`${id}:find:${f.id}`);
  }
  return [...out];
}

/** From every place reached, with every lamp spent, a moon patch (`find:<patch>`) is reachable. */
export function softlocks(): string[] {
  const out: string[] = [];
  const all = progress();
  const patches = new Set<string>();
  for (const id of ['lr-night', 'lr-hall', 'lr-roots', 'lr-cache'])
    for (const p of getRoom(id).patches ?? []) patches.add(`${id}:find:${p.id}`);
  for (const place of all.places) {
    if (place.includes(':flag:') || place.includes(':exit:') || place.includes(':find:')) continue;
    const kit = all.firstWith.get(place) ?? BASE_KIT;
    const p = progress({ start: place, kit, spent: true });
    if (![...p.places].some((q) => patches.has(q))) out.push(place);
  }
  return out;
}

/** Every moonwick's chamber (its 1920 px column of the room) holds renewable fuel: a regrowing pod or a respawner. */
export function fuelProblems(): string[] {
  const out: string[] = [];
  for (const id of ['lr-night', 'lr-hall', 'lr-roots', 'lr-cache']) {
    const r = getRoom(id);
    for (const l of r.lures ?? []) {
      if (l.kind !== 'moonwick') continue;
      const c = Math.floor(l.x / 1920);
      const pods = (r.pods ?? []).filter((p) => p.regrow && Math.floor(p.x / 1920) === c);
      const back = (r.enemies ?? []).filter((e) => e.respawn && Math.floor(e.x / 1920) === c);
      if (pods.length + back.length === 0) out.push(`${id}:${l.id}`);
    }
  }
  return out;
}

/** The skip-hunter on one lock: true = held (nothing found). */
export function huntLock(
  k: Lock,
  budget = k.budget ?? 2500,
): { held: boolean; found?: string; nodes: number } {
  const starts = k.from.map(
    (at) => setup({ room: k.room, at, kit: k.kit, flags: k.flags ?? [], lamps: lampsOf(k.room) }).state,
  );
  const base = getRoom(k.room);
  const room = k.strip
    ? ({ ...base, glades: (base.glades ?? []).filter((g) => !k.strip?.includes(g.id)) } as Room)
    : base;
  const t = cloneTuning(defaultTuning);
  const exit = k.goal.startsWith('exit:') ? k.goal.slice(5) : null;
  const res = explore({
    scene: room,
    tuning: t,
    start: starts,
    world: PROTO_WORLD,
    maxNodes: budget,
    order: k.byTime ? 'time' : 'moves',
    goal: exit ? undefined : (s) => meets(room, k.goal, s),
    ...(exit ? { goalExit: exit } : {}),
  });
  if (exit) {
    const x = res.exits.get(exit);
    return x
      ? { held: false, found: [...pathTo(res, x.from).macros, x.macro].join(' > '), nodes: res.nodes.size }
      : { held: true, nodes: res.nodes.size };
  }
  for (const n of res.nodes.values())
    if (meets(room, k.goal, n.state))
      return { held: false, found: pathTo(res, n).macros.join(' > '), nodes: res.nodes.size };
  return { held: true, nodes: res.nodes.size };
}

/** Every warm lamp of a room (a skip hunt has them all, burning for ever: the most anchors). */
function lampsOf(id: string): string[] {
  return (getRoom(id).lures ?? []).filter((l) => l.kind !== 'moonwick').map((l) => l.id);
}

/** The stored lines (edge id -> macro names). */
export function readTapes(): Record<string, string[]> {
  try {
    return JSON.parse(readFileSync(TAPES_FILE, 'utf8')) as Record<string, string[]>;
  } catch {
    return {};
  }
}

if (process.argv[1]?.endsWith('proto-1.ts')) {
  const write = process.argv.includes('--write');
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const lockOnly = process.argv.find((a) => a.startsWith('--lock='))?.slice(7);
  const tapes = readTapes();
  const out: Record<string, string[]> = { ...tapes };
  let bad = 0;
  const edges = !lockOnly || process.argv.includes('--edges');
  for (const e of edges ? EDGES : []) {
    for (const back of e.both ? [false, true] : [false]) {
      const id = back ? `${e.room}:${e.to}->${e.from}` : edgeId(e);
      if (only && !id.includes(only)) continue;
      const t0 = performance.now();
      const r = proveEdge(e, back);
      const ms = Math.round(performance.now() - t0);
      if (r.ok && r.macros) out[id] = r.macros;
      // (A driver's run: its whole input, run-length, under `driver:<name>`.)
      if (r.ok && r.tape) out[e.proof] = [r.tape.join(',')];
      if (!r.ok) bad++;
      console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${id} ${r.frames ?? ''}f ${ms}ms ${r.why ?? ''}`);
    }
  }
  const p = progress();
  const missing = allTargets().filter((x) => !p.places.has(x.replace(':find:', ':find:')));
  console.log(
    `progression: abilities ${p.abilities.join(' > ')}; ${p.places.size} nodes; missing ${missing.join(', ') || 'none'}`,
  );
  console.log(`softlocks: ${softlocks().join(', ') || 'none'}`);
  console.log(`fuel: ${fuelProblems().join(', ') || 'every kindle has renewable fuel'}`);
  if (process.argv.includes('--locks') || lockOnly)
    for (const k of LOCKS) {
      if (lockOnly && k.id !== lockOnly) continue;
      const t0 = performance.now();
      const r = huntLock(k);
      console.log(
        `lock ${r.held ? 'held' : 'SKIP'} ${k.id} (${r.nodes} nodes, ${Math.round(performance.now() - t0)}ms) ${r.found ?? ''}`,
      );
    }
  if (write && edges) {
    writeFileSync(TAPES_FILE, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`wrote ${TAPES_FILE}`);
  }
  if (bad) process.exitCode = 1;
}
