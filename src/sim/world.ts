/**
 * The world: rooms placed in world px, and the links between them (memory/world.md,
 * docs/design/tech.md §2). Exits are never wired by hand: an exit on a room's edge leads to the
 * neighbour whose mirror exit lies on the same world line and overlaps it (a `s` exit meets the room
 * below's `n` exit). A one-way exit (a drop) links out only; its mirror is arrival only. Doors
 * (`scene.doors`) name their target `room#door`.
 *
 * `enterRoom` is the pure room swap the sim runs at the end of an exit's hold: the player keeps her
 * body, speed and timers (moved by the two rooms' world offset and put just inside the mirror exit),
 * the save goes on, and everything that belongs to the room is rebuilt from the new scene and the save.
 *
 * Pure: plain data, + - * / floor round min max abs.
 */
import { createBoss } from './boss/index';
import { createEnemies } from './enemies';
import type { SimEvent } from './events';
import { createGoal } from './goal';
import { createHatch } from './hatch';
import { createKit, kitSolids, rearmArenas } from './kit';
import { createLight, initTaken, initWicks } from './light';
import { createLures } from './lures';
import { solidAt } from './physics/aabb';
import { createPickups, placeShade } from './pickups';
import { createPlayer, keepOffer } from './player/player';
import { createPods } from './pods';
import type { RoomExit, Scene, SolidRect } from './scene';
import type { GameState, RoomLocal, SaveState } from './state';
import type { Tuning } from './tuning';

/** A room in the world: its scene, and where its top-left corner sits in world px. */
export interface WorldRoom {
  id: string;
  x: number;
  y: number;
  /** In the world graph (content/world.json `rooms`); false for the test rooms (no links, no map). */
  placed: boolean;
  scene: Scene;
}

/** Where an exit (or door) leads: the room and the exit (door) she comes out of there. */
export interface ExitLink {
  to: string;
  exit: string;
}

export interface World {
  /** The room a new game starts in. */
  start: string;
  rooms: Readonly<Record<string, WorldRoom>>;
  /**
   * `room#exit` -> where it leads; `null` = arrival only (the other side is a one-way drop: crossing
   * it does nothing). An exit with no entry here has no neighbour: the room restarts (the fallback).
   */
  links: Readonly<Record<string, ExitLink | null>>;
  /** `room#door` -> the door it leads to (only doors whose target exists). */
  doors: Readonly<Record<string, ExitLink>>;
}

/** An exit's opening in world px: the line it lies on (y for n / s, x for e / w) and its span along it. */
export interface ExitSegment {
  edge: RoomExit['edge'];
  line: number;
  a: number;
  b: number;
}

const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' } as const;

export function exitSegment(r: { x: number; y: number; scene: Scene }, e: RoomExit): ExitSegment {
  const s = r.scene;
  if (e.edge === 'n') return { edge: 'n', line: r.y, a: r.x + e.from, b: r.x + e.to };
  if (e.edge === 's') return { edge: 's', line: r.y + s.height, a: r.x + e.from, b: r.x + e.to };
  if (e.edge === 'w') return { edge: 'w', line: r.x, a: r.y + e.from, b: r.y + e.to };
  return { edge: 'e', line: r.x + s.width, a: r.y + e.from, b: r.y + e.to };
}

/**
 * The exit that mirrors `e` of room `r`: on the opposite edge of a placed room, on the same world
 * line, overlapping it (the most overlap wins). Null if there is none.
 */
export function mirrorOf(
  rooms: readonly WorldRoom[],
  r: WorldRoom,
  e: RoomExit,
): { room: WorldRoom; exit: RoomExit; overlap: number } | null {
  const seg = exitSegment(r, e);
  let best: { room: WorldRoom; exit: RoomExit; overlap: number } | null = null;
  for (const o of rooms) {
    if (o === r || !o.placed) continue;
    for (const f of o.scene.exits ?? []) {
      if (f.edge !== OPPOSITE[e.edge]) continue;
      const g = exitSegment(o, f);
      if (g.line !== seg.line) continue;
      const overlap = Math.min(seg.b, g.b) - Math.max(seg.a, g.a);
      if (overlap > 0 && (best === null || overlap > best.overlap)) best = { room: o, exit: f, overlap };
    }
  }
  return best;
}

/** Builds the world: links every placed room's exits to their mirrors and resolves door targets. */
export function linkWorld(start: string, rooms: readonly WorldRoom[]): World {
  const byId: Record<string, WorldRoom> = {};
  for (const r of rooms) byId[r.id] = r;
  const links: Record<string, ExitLink | null> = {};
  const doors: Record<string, ExitLink> = {};
  for (const r of rooms) {
    if (r.placed) {
      for (const e of r.scene.exits ?? []) {
        const m = mirrorOf(rooms, r, e);
        if (!m) continue;
        // A one-way exit leads out; the side it drops into is arrival only.
        links[`${r.id}#${e.id}`] = m.exit.oneWay && !e.oneWay ? null : { to: m.room.id, exit: m.exit.id };
      }
    }
    for (const d of r.scene.doors ?? []) {
      const [to, door] = d.to.split('#');
      if (to && door && byId[to]?.scene.doors?.some((x) => x.id === door))
        doors[`${r.id}#${d.id}`] = { to, exit: door };
    }
  }
  return { start, rooms: byId, links, doors };
}

/**
 * The scene as the sim plays it: the room's solids plus every shortcut not yet opened (memory/world.md)
 * and the level kit's standing solids, rotten bark not broken and gates still shut (src/sim/kit.ts).
 * The same object comes back while nothing changes (cached per scene), and the scene itself when the
 * room has nothing closed.
 */
const SHORTCUT_SCENES = new WeakMap<Scene, { key: string; scene: Scene }>();
export function withShortcuts(scene: Scene, save: SaveState): Scene {
  const list = scene.shortcuts ?? [];
  const hasKit = (scene.bark?.length ?? 0) + (scene.gates?.length ?? 0) > 0;
  if (list.length === 0 && !hasKit) return scene;
  let key = '';
  for (const sc of list) if (!save.opened.includes(`${scene.id}:${sc.id}`)) key += `${sc.id}|`;
  const kit = hasKit ? kitSolids(scene, save) : null;
  if (kit) key += `#${kit.key}`;
  if (key === '' || key === '#') return scene;
  const hit = SHORTCUT_SCENES.get(scene);
  if (hit && hit.key === key) return hit.scene;
  const shut: SolidRect[] = list
    .filter((sc) => !save.opened.includes(`${scene.id}:${sc.id}`))
    .map((sc) => ({ x: sc.x, y: sc.y, w: sc.w, h: sc.h, tag: 'ledge' }));
  const eff: Scene = { ...scene, solids: [...scene.solids, ...shut, ...(kit?.solids ?? [])] };
  SHORTCUT_SCENES.set(scene, { key, scene: eff });
  return eff;
}

/** Adds `id` to a save list once. True if it was new. */
export function remember(list: string[], id: string): boolean {
  if (list.includes(id)) return false;
  list.push(id);
  return true;
}

/**
 * Everything that belongs to the room, fresh from the scene and the save: lures she put out stay out
 * (`save.snuffed`); creatures, pickups and the rest start over. `fresh`: she has never been in this
 * room (the hatching only plays then).
 */
export function createLocal(scene: Scene, t: Tuning, save: SaveState, fresh: boolean): RoomLocal {
  const lures = createLures(scene, t, save.snuffed);
  // (Lanternroot's moonwicks: cold, but for those the save keeps burning.)
  initWicks(lures, scene, save);
  const enemies = createEnemies(scene, t);
  const pickups = createPickups(scene);
  initTaken({ pickups }, scene, save);
  return {
    pickups,
    pods: createPods(scene),
    lures,
    enemies,
    goal: createGoal(scene),
    exit: null,
    caught: null,
    hatch: fresh ? createHatch(scene) : null,
    rest: { at: -1, frames: 0, done: false },
    kit: createKit(scene, t, save),
    // The room's boss (memory/bosses.md): beaten for good, a retry, or a first meeting; it sets up its own lures and creature.
    boss: createBoss(scene, t, { lures, enemies, save }),
    entry: null,
    seam: null,
    light: createLight(scene, save),
  };
}

/** The top of the first ground under (x, y) (solid or one-way), or null. */
export function groundBelow(scene: Scene, x: number, y: number): number | null {
  let best: number | null = null;
  for (const s of scene.solids)
    if (s.tag !== 'pool' && x >= s.x && x < s.x + s.w && s.y >= y && (best === null || s.y < best))
      best = s.y;
  for (const o of scene.oneWays)
    if (x >= o.x && x < o.x + o.w && o.y >= y && (best === null || o.y < best)) best = o.y;
  return best;
}

/** How she comes in: by an edge (her body moved by `dx, dy` into the new room's px, through `exit`), or placed at a point. */
export type Entry =
  | { kind: 'edge'; dx: number; dy: number; exit: RoomExit }
  | { kind: 'point'; x: number; y: number };

/**
 * She enters room `to` (memory/world.md). By an edge she keeps her body, speed and timers: moved by the
 * rooms' offset, put `room.entryInset` px inside the mirror exit and inside its span, lifted out of
 * any solid. At a point (a door, a re-form, Continue, goto) she stands there at rest. Her last
 * safe ground becomes the ground under where she came in (the room's spawn if there is none). The room's
 * own state is rebuilt from the scene and the save; the save remembers the visit.
 * Pushes `roomEnter {room, from}` then `spawn`.
 */
export function enterRoom(
  state: GameState,
  t: Tuning,
  world: World,
  to: string,
  entry: Entry,
  from: string,
  events: SimEvent[],
): void {
  const room = world.rooms[to];
  if (!room) throw new Error(`enterRoom: no room "${to}"`);
  const scene = withShortcuts(room.scene, state.save);
  const old = state.player;
  const fresh = createPlayer(
    entry.kind === 'point' ? entry.x : scene.spawn.x,
    entry.kind === 'point' ? entry.y : scene.spawn.y,
    t,
    scene,
  );
  if (entry.kind === 'edge') {
    const p = old;
    p.x += entry.dx;
    p.y += entry.dy;
    p.airTopY += entry.dy;
    p.launchY += entry.dy;
    p.dropY += entry.dy;
    const e = entry.exit;
    const inset = Math.max(0, Math.round(t.room.entryInset));
    const hw = p.w / 2;
    const hh = p.h / 2;
    // On the crossing axis she comes in exactly `entryInset` inside the opening, whatever the hold
    // carried her past the old room's edge (that was in the old room's geometry: it could have taken
    // her through a wall of this one). Along the opening she keeps her place, inside its span.
    if (e.edge === 'n' || e.edge === 's') {
      p.y = Math.round(e.edge === 'n' ? inset - hh : scene.height - inset - hh);
      p.x = Math.max(e.from, Math.min(e.to - p.w, p.x));
    } else {
      p.x = Math.round(e.edge === 'w' ? inset - hw : scene.width - inset - hw);
      p.y = Math.max(e.from, Math.min(e.to - p.h, p.y));
    }
    // Floors that do not quite line up: lift her out of the ground rather than leave her in it.
    for (let k = 0; k <= 96; k++) {
      if (!solidAt(scene, p.x, p.y - k, p.w, p.h)) {
        p.y -= k;
        break;
      }
    }
  } else {
    fresh.hp = old.hp > 0 ? Math.min(old.hp, fresh.hpMax) : fresh.hpMax;
    fresh.attackSeq = old.attackSeq;
    fresh.hurtSeq = old.hurtSeq;
    fresh.facing = old.facing;
    fresh.glow = old.glow;
    keepOffer(fresh, old);
    state.player = fresh;
  }
  const p = state.player;
  // What belonged to the old room: a lure's hold, a lantern she kindled, a glint in flight to something there.
  p.lure = fresh.lure;
  p.grab = -1;
  p.grabGrace = 0;
  p.lureGrace = fresh.lureGrace;
  p.lureGraceFrames = 0;
  p.lureThrow = 0;
  p.lureCore = 0;
  p.pullX = 0;
  p.kindling = -1;
  p.kindlingLamp = -1;
  p.giftTo = '';
  p.giftTimer = 0;
  p.giftIndex = fresh.giftIndex;
  p.offerTarget = null;
  const fx = p.x + p.w / 2;
  const fy = p.y + p.h;
  const ground = groundBelow(scene, fx, fy - 1);
  p.safeX = ground === null ? scene.spawn.x : fx;
  p.safeY = ground === null ? scene.spawn.y : ground;
  p.groundX = p.safeX;
  p.groundY = p.safeY;
  p.safeFrames = 0;
  const firstVisit = !state.save.visited.includes(to);
  remember(state.save.visited, to);
  state.room = to;
  // (An ambush left unfinished plays again from its arrival: `rearm` triggers, review r7 #2.)
  rearmArenas(scene, state.save);
  // (The Canopy r19: the glints she carries are hers, not the room's. Every first-timer saw the count "drop from 5 to
  // 0" at a door: a new room's pickups started the wallet over.)
  const carried = state.pickups?.count ?? 0;
  // (The Canopy r20: and what she left where she last faded, wherever that was.)
  const shade = state.pickups?.shade ?? null;
  Object.assign(state, createLocal(scene, t, state.save, firstVisit));
  state.pickups.count = carried;
  state.pickups.shade = shade;
  placeShade(state, to);
  // Seam hysteresis: the opening she came in by stays shut behind her for a moment (src/sim/index.ts).
  if (entry.kind === 'edge') state.seam = { exit: entry.exit.id, frames: 0 };
  state.prevInput = entry.kind === 'edge' ? state.prevInput : 0;
  events.push({ type: 'roomEnter', room: to, from, x: fx, y: fy });
  events.push({ type: 'spawn', x: fx, y: fy });
}
