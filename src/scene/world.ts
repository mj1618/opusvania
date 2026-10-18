/**
 * The world (memory/world.md): content/world.json's placed rooms linked into the sim's `World`
 * (exits found from placement, src/sim/world.ts), and the world check that `npm run check` runs
 * (tests/unit/world.test.ts). No Pixi or DOM: Node tools and tests import it.
 *
 * The check, from cheap to symbolic:
 *  - every placed room's exits have a mirror (the neighbour's exit on the same world line, the same
 *    span exactly: standard spans line up without editing neighbours); one-way only on one side;
 *  - no two placed rooms overlap; door targets exist;
 *  - the room graph is connected;
 *  - progression: from the start, with the abilities glades give as they are reached (and the
 *    shortcuts opened from their open side), every placed room and glade is reachable, and from every
 *    reachable place a moon patch can be reached (no softlock). Rooms say what needs what in
 *    `routes` (src/scene/room.ts); a room without them is open inside. Story flags work like
 *    abilities: a route can need `flags` (a flag gate, memory/level-kit.md), and a trigger reached
 *    sets its flag (a boss reached sets its `flag`); a flag nothing in the world sets is reported.
 */
import type { AbilityId } from '../sim/abilities';
import { exitSegment, linkWorld, mirrorOf, type World, type WorldRoom } from '../sim/world';
import { bossNodes } from './boss';
import { ROOMS, WORLD, WORLD_FILES, type WorldFile } from './index';
import { findIds, kitNodes } from './kit';
import type { Room } from './room';

/** Every room (the file's placed ones with their world position; the rest at 0, 0, unplaced). */
function worldRooms(file: WorldFile = WORLD): WorldRoom[] {
  const placed = new Map(file.rooms.map((r) => [r.id, r]));
  return Object.values(ROOMS).map((scene) => {
    const at = placed.get(scene.id);
    return { id: scene.id, x: at?.x ?? 0, y: at?.y ?? 0, placed: at !== undefined, scene };
  });
}

/** The game's world, linked. */
export const GAME_WORLD: World = linkWorld(WORLD.start, worldRooms());

/** Every world by id (`game` and the prototype levels': src/scene/index.ts `WORLD_FILES`), linked. */
export const WORLDS: Readonly<Record<string, World>> = Object.fromEntries(
  Object.entries(WORLD_FILES).map(([id, f]) => [
    id,
    id === 'game' ? GAME_WORLD : linkWorld(f.start, worldRooms(f)),
  ]),
);

/** Lanternroot's world (docs/design/levels/proto-1.md): `?world=proto-1`. */
export const PROTO_WORLD: World = WORLDS['proto-1'] as World;

/** A world by id; throws, naming the worlds there are, if there is none. */
export function getWorld(id: string): World {
  const w = WORLDS[id];
  if (!w) throw new Error(`Unknown world "${id}". Worlds: ${Object.keys(WORLDS).join(', ')}.`);
  return w;
}

/** The areas of a world (its file's `areas`). */
export function areasOf(world: World): Area[] {
  for (const [id, w] of Object.entries(WORLDS)) if (w === world) return WORLD_FILES[id]?.areas ?? [];
  return [];
}

/** The same world with every room passed through `fn` (`?nopickups` strips the rooms; links stay). */
export function mapWorld(world: World, fn: (room: Room) => Room): World {
  const rooms: Record<string, WorldRoom> = {};
  for (const [id, r] of Object.entries(world.rooms)) rooms[id] = { ...r, scene: fn(r.scene as Room) };
  return { ...world, rooms };
}

/** A story flag in the progression's owned set (next to the abilities). */
function flagKey(flag: string): string {
  return `flag:${flag}`;
}

/** Triggers reached set their flags (in `owned`), and so does a boss reached (it can be beaten: its `flag`). True if one was new. */
function setFlags(world: World, reached: ReadonlySet<Node>, owned: Set<string>): boolean {
  let grew = false;
  for (const r of Object.values(world.rooms)) {
    if (!r.placed) continue;
    // A route that sets flags (a puzzle on the way: `routes[].sets`), from a node reached with what it needs.
    for (const q of (r.scene as Room).routes ?? []) {
      if (!q.sets || !reached.has(`${r.id}:${q.from}`)) continue;
      if (!(q.needs ?? []).every((a) => owned.has(a)) || !(q.flags ?? []).every((f) => owned.has(flagKey(f))))
        continue;
      for (const f of q.sets)
        if (!owned.has(flagKey(f))) {
          owned.add(flagKey(f));
          grew = true;
        }
    }
    for (const t of r.scene.triggers ?? []) {
      if (!reached.has(`${r.id}:${t.id}`) || owned.has(flagKey(t.sets))) continue;
      owned.add(flagKey(t.sets));
      grew = true;
    }
    const boss = r.scene.boss;
    if (boss && reached.has(`${r.id}:${boss.id}`) && !owned.has(flagKey(boss.flag))) {
      owned.add(flagKey(boss.flag));
      grew = true;
    }
  }
  return grew;
}

/** A node of the progression graph: `room:thing`. */
type Node = string;
interface Edge {
  to: Node;
  needs: readonly AbilityId[];
  /** Story flags that must be set (`routes[].flags`). */
  flags: readonly string[];
  /** A shortcut that must be open to pass (`room:shortcut`), or null. */
  door: string | null;
}

/** The things of a room that are nodes: exits, doors, patches, glades and the spawn. */
function nodesOf(room: Room): string[] {
  return [
    'spawn',
    ...(room.exits ?? []).map((e) => e.id),
    ...(room.doors ?? []).map((d) => d.id),
    ...(room.patches ?? []).map((p) => p.id),
    ...(room.glades ?? []).map((g) => g.id),
    ...kitNodes(room),
    ...bossNodes(room),
    ...(room.marks?.places ?? []).map((p) => p.id),
  ];
}

/** The progression graph: routes inside rooms (or all-to-all), exit links, door links. */
function graph(world: World): {
  edges: Map<Node, Edge[]>;
  /** `room:shortcut` -> the node it is opened from. */
  openers: Map<string, Node>;
} {
  const edges = new Map<Node, Edge[]>();
  const openers = new Map<string, Node>();
  const add = (from: Node, e: Edge) => {
    const list = edges.get(from) ?? [];
    list.push(e);
    edges.set(from, list);
  };
  for (const r of Object.values(world.rooms)) {
    if (!r.placed) continue;
    const room = r.scene as Room;
    const ids = nodesOf(room);
    for (const id of ids) edges.set(`${r.id}:${id}`, edges.get(`${r.id}:${id}`) ?? []);
    if (room.routes) {
      for (const q of room.routes) {
        const a = `${r.id}:${q.from}`;
        const b = `${r.id}:${q.to}`;
        const needs = q.needs ?? [];
        const flags = q.flags ?? [];
        const door = q.door ? `${r.id}:${q.door}` : null;
        if (door) openers.set(door, a);
        add(a, { to: b, needs, flags, door: null });
        if (!q.oneWay) add(b, { to: a, needs, flags, door });
      }
    } else {
      for (const a of ids)
        for (const b of ids)
          if (a !== b) add(`${r.id}:${a}`, { to: `${r.id}:${b}`, needs: [], flags: [], door: null });
    }
    for (const e of room.exits ?? []) {
      const link = world.links[`${r.id}#${e.id}`];
      if (link) add(`${r.id}:${e.id}`, { to: `${link.to}:${link.exit}`, needs: [], flags: [], door: null });
    }
    for (const d of room.doors ?? []) {
      const link = world.doors[`${r.id}#${d.id}`];
      if (link) add(`${r.id}:${d.id}`, { to: `${link.to}:${link.exit}`, needs: [], flags: [], door: null });
    }
  }
  return { edges, openers };
}

/** Breadth-first from `start` with `abilities` owned (and story flags set: the same set) and `open` shortcuts open. */
function reach(
  edges: Map<Node, Edge[]>,
  start: Node,
  abilities: ReadonlySet<string>,
  open: ReadonlySet<string>,
): Set<Node> {
  const seen = new Set<Node>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const n = queue.shift() as Node;
    for (const e of edges.get(n) ?? []) {
      if (seen.has(e.to)) continue;
      if (e.door && !open.has(e.door)) continue;
      if (!e.needs.every((a) => abilities.has(a))) continue;
      if (!e.flags.every((f) => abilities.has(flagKey(f)))) continue;
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  return seen;
}

export interface Progression {
  /** Every node reachable from the start, at the end (all glades taken, shortcuts opened). */
  reached: Set<Node>;
  /** The abilities in the order the glades give them on the way. */
  abilities: AbilityId[];
  /** The abilities (and story flags, as `flag:<name>`) she has when each node first becomes reachable. */
  firstWith: Map<Node, AbilityId[]>;
}

/** The symbolic progression: grow abilities and open shortcuts until nothing more is reachable. */
export function progression(world: World): Progression {
  const { edges, openers } = graph(world);
  const startRoom = world.rooms[world.start];
  const start = `${world.start}:spawn`;
  const owned = new Set<string>(startRoom?.scene.abilities ?? []);
  const order: AbilityId[] = [];
  const open = new Set<string>();
  const firstWith = new Map<Node, AbilityId[]>();
  for (;;) {
    const reached = reach(edges, start, owned, open);
    for (const n of reached) if (!firstWith.has(n)) firstWith.set(n, [...owned] as AbilityId[]);
    let grew = false;
    for (const r of Object.values(world.rooms)) {
      for (const g of r.scene.glades ?? []) {
        if (reached.has(`${r.id}:${g.id}`) && !owned.has(g.ability)) {
          owned.add(g.ability);
          order.push(g.ability);
          grew = true;
        }
      }
    }
    if (setFlags(world, reached, owned)) grew = true;
    for (const [door, from] of openers) {
      if (reached.has(from) && !open.has(door)) {
        open.add(door);
        grew = true;
      }
    }
    if (!grew) return { reached, abilities: order, firstWith };
  }
}

/** Problems with the world (empty = good). `world` defaults to the game's. */
/** An area of the world (content/world.json `areas`): the placed rooms it holds. */
export interface Area {
  id: string;
  rooms: string[];
}

/**
 * Problems with the world (empty = good). `world` defaults to the game's, `areas` to world.json's for it (none
 * for another world). A moth-stone draws its area: memory/level-kit.md.
 */
export function validateWorld(world: World = GAME_WORLD, areas: readonly Area[] = areasOf(world)): string[] {
  const out: string[] = [];
  const placed = Object.values(world.rooms).filter((r) => r.placed);
  if (!world.rooms[world.start]?.placed)
    out.push(`the start room "${world.start}" is not placed in the world`);
  // Overlaps.
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i] as WorldRoom;
      const b = placed[j] as WorldRoom;
      if (
        a.x < b.x + b.scene.width &&
        b.x < a.x + a.scene.width &&
        a.y < b.y + b.scene.height &&
        b.y < a.y + a.scene.height
      )
        out.push(`rooms "${a.id}" and "${b.id}" overlap in the world`);
    }
  }
  // Mirrors.
  for (const r of placed) {
    for (const e of r.scene.exits ?? []) {
      const m = mirrorOf(placed, r, e);
      const seg = exitSegment(r, e);
      if (!m) {
        out.push(`exit "${r.id}#${e.id}" (${e.edge}) has no mirror exit in a neighbouring room`);
        continue;
      }
      const g = exitSegment(m.room, m.exit);
      if (g.a !== seg.a || g.b !== seg.b)
        out.push(
          `exit "${r.id}#${e.id}" spans ${seg.a}..${seg.b} but its mirror "${m.room.id}#${m.exit.id}" spans ${g.a}..${g.b} (world px)`,
        );
      if (e.oneWay && m.exit.oneWay)
        out.push(
          `exits "${r.id}#${e.id}" and "${m.room.id}#${m.exit.id}" are both one-way: nothing can cross`,
        );
    }
    for (const d of r.scene.doors ?? []) {
      if (!world.doors[`${r.id}#${d.id}`])
        out.push(`door "${r.id}#${d.id}" leads to "${d.to}", which is no door`);
    }
  }
  // The room graph is connected (either way along links).
  const adj = new Map<string, Set<string>>(placed.map((r) => [r.id, new Set<string>()]));
  for (const [key, link] of Object.entries(world.links)) {
    if (!link) continue;
    const from = key.split('#')[0] as string;
    adj.get(from)?.add(link.to);
    adj.get(link.to)?.add(from);
  }
  for (const [key, link] of Object.entries(world.doors)) {
    const from = key.split('#')[0] as string;
    adj.get(from)?.add(link.to);
    adj.get(link.to)?.add(from);
  }
  if (placed.length > 0) {
    const seen = new Set<string>([world.start]);
    const queue = [world.start];
    while (queue.length > 0) {
      for (const n of adj.get(queue.shift() as string) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    for (const r of placed)
      if (!seen.has(r.id)) out.push(`room "${r.id}" is not connected to the rest of the world`);
  }
  // Flag gates: every flag a route needs is set by some trigger in the world.
  const sources = new Set(
    placed.flatMap((r) => [
      ...(r.scene.triggers ?? []).map((t) => t.sets),
      ...(r.scene.boss ? [r.scene.boss.flag] : []),
      ...((r.scene as Room).routes ?? []).flatMap((q) => q.sets ?? []),
    ]),
  );
  for (const r of placed)
    for (const q of (r.scene as Room).routes ?? [])
      for (const f of q.flags ?? [])
        if (!sources.has(f))
          out.push(
            `route "${r.id}:${q.from}" -> "${q.to}" needs flag "${f}", which nothing in the world sets`,
          );
  // Areas: real placed rooms, each in one area; every moth-stone names an area.
  const inArea = new Map<string, string>();
  for (const a of areas)
    for (const id of a.rooms) {
      if (!world.rooms[id]?.placed)
        out.push(`area "${a.id}" names room "${id}", which is not placed in the world`);
      const was = inArea.get(id);
      if (was) out.push(`room "${id}" is in two areas ("${was}", "${a.id}")`);
      inArea.set(id, a.id);
    }
  for (const r of placed)
    for (const m of r.scene.mothStones ?? [])
      if (!areas.some((a) => a.id === m.area))
        out.push(`moth-stone "${r.id}:${m.id}" draws area "${m.area}", which is no area of the world`);
  // Progression.
  const prog = progression(world);
  const { edges } = graph(world);
  for (const r of placed) {
    if (!nodesOf(r.scene as Room).some((n) => prog.reached.has(`${r.id}:${n}`)))
      out.push(`room "${r.id}" cannot be reached from the start with the abilities found on the way`);
    for (const g of r.scene.glades ?? [])
      if (!prog.reached.has(`${r.id}:${g.id}`))
        out.push(`glade "${r.id}:${g.id}" (${g.ability}) cannot be reached`);
    // Finds open no way (they are never abilities), but each must be reachable: in a room with routes, a
    // route has to name it.
    for (const f of findIds(r.scene))
      if (!prog.reached.has(`${r.id}:${f}`))
        out.push(`find "${r.id}:${f}" cannot be reached (name it in a route)`);
  }
  // No softlock: from every place reachable, a moon patch is reachable with what she had when she got there.
  const patches = new Set(placed.flatMap((r) => (r.scene.patches ?? []).map((p) => `${r.id}:${p.id}`)));
  const { openers } = graph(world);
  if (patches.size > 0) {
    for (const n of prog.reached) {
      const owned = new Set<string>(prog.firstWith.get(n) ?? []);
      // Glades on the way count: grow from n the same way as from the start.
      let open = new Set<string>();
      for (;;) {
        const got = reach(edges, n, owned, open);
        let grew = false;
        for (const r of placed) {
          for (const g of r.scene.glades ?? []) {
            if (!got.has(`${r.id}:${g.id}`) || owned.has(g.ability)) continue;
            owned.add(g.ability);
            grew = true;
          }
        }
        if (setFlags(world, got, owned)) grew = true;
        const nextOpen = new Set(open);
        for (const [door, from] of openers) if (got.has(from)) nextOpen.add(door);
        if (nextOpen.size > open.size) {
          open = nextOpen;
          grew = true;
        }
        if (!grew) {
          if (![...got].some((x) => patches.has(x)))
            out.push(`softlock: from "${n}" no moon patch can be reached`);
          break;
        }
      }
    }
  }
  return out;
}
