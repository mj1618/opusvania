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
 *    `routes` (src/scene/room.ts); a room without them is open inside.
 */
import type { AbilityId } from '../sim/abilities';
import { exitSegment, linkWorld, mirrorOf, type World, type WorldRoom } from '../sim/world';
import { ROOMS, WORLD } from './index';
import type { Room } from './room';

/** Every room (placed ones with their world position; test rooms at 0, 0, unplaced). */
function worldRooms(): WorldRoom[] {
  const placed = new Map(WORLD.rooms.map((r) => [r.id, r]));
  return Object.values(ROOMS).map((scene) => {
    const at = placed.get(scene.id);
    return { id: scene.id, x: at?.x ?? 0, y: at?.y ?? 0, placed: at !== undefined, scene };
  });
}

/** The game's world, linked. */
export const GAME_WORLD: World = linkWorld(WORLD.start, worldRooms());

/** The same world with every room passed through `fn` (`?nopickups` strips the rooms; links stay). */
export function mapWorld(world: World, fn: (room: Room) => Room): World {
  const rooms: Record<string, WorldRoom> = {};
  for (const [id, r] of Object.entries(world.rooms)) rooms[id] = { ...r, scene: fn(r.scene as Room) };
  return { ...world, rooms };
}

/** A node of the progression graph: `room:thing`. */
type Node = string;
interface Edge {
  to: Node;
  needs: readonly AbilityId[];
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
        const door = q.door ? `${r.id}:${q.door}` : null;
        if (door) openers.set(door, a);
        add(a, { to: b, needs, door: null });
        if (!q.oneWay) add(b, { to: a, needs, door });
      }
    } else {
      for (const a of ids)
        for (const b of ids) if (a !== b) add(`${r.id}:${a}`, { to: `${r.id}:${b}`, needs: [], door: null });
    }
    for (const e of room.exits ?? []) {
      const link = world.links[`${r.id}#${e.id}`];
      if (link) add(`${r.id}:${e.id}`, { to: `${link.to}:${link.exit}`, needs: [], door: null });
    }
    for (const d of room.doors ?? []) {
      const link = world.doors[`${r.id}#${d.id}`];
      if (link) add(`${r.id}:${d.id}`, { to: `${link.to}:${link.exit}`, needs: [], door: null });
    }
  }
  return { edges, openers };
}

/** Breadth-first from `start` with `abilities` owned and `open` shortcuts open. */
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
  /** The abilities she has when each node first becomes reachable. */
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
export function validateWorld(world: World = GAME_WORLD): string[] {
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
  // Progression.
  const prog = progression(world);
  const { edges } = graph(world);
  for (const r of placed) {
    if (!nodesOf(r.scene as Room).some((n) => prog.reached.has(`${r.id}:${n}`)))
      out.push(`room "${r.id}" cannot be reached from the start with the abilities found on the way`);
    for (const g of r.scene.glades ?? [])
      if (!prog.reached.has(`${r.id}:${g.id}`))
        out.push(`glade "${r.id}:${g.id}" (${g.ability}) cannot be reached`);
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
