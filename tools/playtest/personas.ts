/**
 * Persona bots. Each one turns what a player sees (observe.ts) and what it remembers (map.ts) into
 * one input mask a frame. The same code drives a headless run (headless.ts) and a live run in the
 * page with real keys (live.ts). Pure and deterministic: a persona's own randomness is a seeded RNG.
 *
 *   naive        holds the way on, jumps at walls and gap edges, never explores.
 *   explorer     goes to every pickup, light, side path and dangling end it has seen, then the exit.
 *   speedrunner  knows the room: the shortest route to the exit, jumps from the last pixel, dashes.
 *   cautious     heads on, but stops often, looks over every edge and jumps late; waits out creatures.
 *
 * Adding one: write a `Persona` (or configure `Planner`) and add it to `PERSONAS`.
 */

import { ActionBit } from '../../src/sim/input';
import { solidAt } from '../../src/sim/physics/aabb';
import { rngInt, seedRng } from '../../src/sim/rng';
import type { Scene } from '../../src/sim/scene';
import type { World } from '../../src/sim/world';
import { chooseTactic, fightTactics, foe } from './fight';
import {
  type Candidate,
  capChain,
  capClimbLine,
  chooseLine,
  climbLine,
  dirBit,
  type Goal,
  type Hands,
  type Line,
  leapLines,
  linesFor,
  nearSurface,
  onCap,
  onSurface,
  type SimCtx,
} from './lines';
import { Mind, type Move, moveKey, type Surface, topUnder, yAt } from './map';
import type { Obs } from './observe';

const D = ActionBit.down;
const J = ActionBit.jump;
const X = ActionBit.dash;
const A = ActionBit.attack;

export interface Persona {
  readonly name: string;
  /**
   * The input mask for this frame. `scene` is the room she is in now (it changes at a room exit); `ctx`
   * the sim as it stands, for the planners' look-ahead (lines.ts).
   */
  decide(o: Obs, scene: Scene, ctx: SimCtx): number;
  /** What it gave up on, and why (for the report). */
  readonly notes: string[];
  /** Where it decided to go, and when (planning personas). */
  readonly itinerary: Array<{ f: number; why: string; x: number; y: number }>;
  /** It has nothing left it wants to do here (a room with no exit, all of it seen): the run can end. */
  readonly finished?: boolean;
}

export const PERSONAS = ['naive', 'explorer', 'speedrunner', 'cautious'] as const;
export type PersonaName = (typeof PERSONAS)[number];

export interface PersonaWorld {
  world?: World;
  /** The room a speedrunner heads for (default: the placed room furthest from the start). */
  goal?: string;
  /** A chunk of rooms to cover: the speedrunner heads for the nearest it has not been in. */
  goals?: string[];
}

/** The placed room the most link hops from the start (the end of the region as built). */
export function furthestRoom(world: World): string {
  const hops = new Map<string, number>([[world.start, 0]]);
  const queue = [world.start];
  while (queue.length) {
    const r = queue.shift() as string;
    for (const [k, v] of Object.entries(world.links)) {
      if (!v || !k.startsWith(`${r}#`) || hops.has(v.to)) continue;
      hops.set(v.to, (hops.get(r) ?? 0) + 1);
      queue.push(v.to);
    }
  }
  return [...hops.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? world.start;
}

export function makePersona(name: string, seed = 1, w: PersonaWorld = {}): Persona {
  const world = w.world;
  const goal = w.goal ?? (world ? furthestRoom(world) : undefined);
  const known = {
    ...(world ? { world } : {}),
    ...(goal ? { goal } : {}),
    ...(w.goals ? { goals: w.goals } : {}),
  };
  switch (name) {
    case 'naive':
      return new Naive(seed);
    case 'explorer':
      return new Planner('explorer', seed, {
        knowsAll: false,
        edge: 10,
        hold: 18,
        dash: false,
        hatchAfter: 120,
        pick: 'explore',
        slash: true,
        turnBack: true,
      });
    case 'speedrunner':
      return new Planner('speedrunner', seed, {
        knowsAll: true,
        edge: 3,
        hold: 22,
        hop: true,
        dash: true,
        hatchAfter: 0,
        pick: 'exit',
        slash: true,
        turnBack: true,
        ...known,
      });
    case 'cautious':
      return new Planner('cautious', seed, {
        knowsAll: false,
        edge: 2,
        hold: 16,
        dash: false,
        hatchAfter: -1,
        pick: 'forward',
        slash: false,
        edgeLook: [30, 75],
        stopEvery: [110, 260],
        stopFor: [25, 80],
        waitForCreatures: 420,
        turnBack: true,
      });
    default:
      throw new Error(`Unknown persona "${name}". Personas: ${PERSONAS.join(', ')}`);
  }
}

/** Is there ground `ahead` px past her leading edge, within a rolling step below her feet? */
export function groundAhead(scene: Scene, o: Obs, dir: number, ahead: number): boolean {
  const p = o.p;
  const x = dir > 0 ? p.x + p.w + ahead : p.x - ahead - 1;
  return solidAt(scene, x, p.y + p.h, 1, 16);
}

/**
 * The pogo every persona knows (it is a verb from the start): falling onto a seed-case, a down cut. One
 * press (a rising edge after `last`), when the case is under her feet and close.
 */
function pogoPress(o: Obs, scene: Scene, last: number): number {
  const p = o.p;
  if (p.grounded || last & A) return 0;
  // Within the down cut's reach (120 from her body centre: the case's top within ~60 under her feet).
  const half = 28;
  const hit = (scene.seedCases ?? []).some(
    (q) => Math.abs(q.x - o.feetX) < 60 && q.y - half - o.feetY > -12 && q.y - half - o.feetY < 60,
  );
  return hit ? A | D : 0;
}

/**
 * Rotten bark in the way (wood.md: the secret language, taught on the path in R6): pressed against a
 * standing bark wall she faces, a cut. Broken bark is open air, so she is never pressed against it.
 */
function barkPress(o: Obs, scene: Scene, last: number): number {
  const p = o.p;
  if (last & A) return 0;
  const edge = p.facing > 0 ? p.x + p.w : p.x;
  const hit = (scene.bark ?? []).some((b) => {
    if (b.floor) return false;
    const face = p.facing > 0 ? b.x : b.x + b.w;
    return Math.abs(edge - face) <= 4 && p.y < b.y + b.h && p.y + p.h > b.y;
  });
  return hit ? A : 0;
}

/**
 * The brief's naive player (tests/unit/rooms.test.ts): hold the way on; jump (held 14 frames) when
 * blocked by a wall or at the edge of a gap. When it makes no headway for 8 s it turns round for 3 s,
 * like a stuck player trying the other way, then holds on again. Mashes jump in the cocoon. Once it owns
 * glide (the glade's line told it to hold jump), a gap jump is held from then on: later edges are walked
 * off gliding.
 */
class Naive implements Persona {
  readonly name = 'naive';
  readonly notes: string[] = [];
  readonly itinerary: Persona['itinerary'] = [];
  private dir = 1;
  private jumpUntil = -1;
  private best = Number.NEGATIVE_INFINITY;
  private bestAt = 0;
  private turnUntil = -1;
  private exitSeen = false;
  private last = 0;
  /** A glider holding jump from her last gap jump on. */
  private holding = false;
  /** Turn-rounds in this room (two at the same lock: it turns back for good). */
  private turns = 0;
  /** Where it last jumped at a wall. */
  private wallX = -1000;
  /** Turn-rounds in this room, all told (a lock here: try what the floor offers). */
  private turnedHere = 0;
  /** Falls from an edge (`room:x/64`): an odd count means "jump from it next time". */
  private readonly fellAt = new Map<string, number>();
  private lastEdge = '';
  private catching = false;
  private room = '';

  constructor(readonly seed: number) {}

  decide(o: Obs, scene: Scene, ctx?: SimCtx): number {
    const f = o.frame;
    if (o.shut) return f % 8 < 2 ? J : 0;
    if (o.held) {
      // Fell into a catch: remember the edge it set out from (it tries the other way there next time).
      if (ctx?.state.caught && this.lastEdge && !this.catching) {
        this.fellAt.set(this.lastEdge, (this.fellAt.get(this.lastEdge) ?? 0) + 1);
        this.catching = true;
      }
      return 0;
    }
    this.catching = false;
    // Caught by a lure: mash jump (beats her free).
    if (o.lured) return dirBit(this.dir) | (f % 6 < 2 ? J : 0);
    // Stuck in this room once already and standing on rotten bark: hop and cut down at it (the panel gives).
    const opened = ctx?.state.save.opened ?? [];
    const panel = (scene.bark ?? []).find(
      (b) =>
        b.floor &&
        !opened.includes(`${scene.id}:${b.id}`) &&
        o.feetX > b.x + 8 &&
        o.feetX < b.x + b.w - 8 &&
        Math.abs(o.feetY - b.y) < 140,
    );
    if (panel && this.turns + this.turnedHere > 0) {
      const m = o.p.grounded ? (this.last & J ? 0 : J) : o.p.vy > 0 && !(this.last & A) ? A | D : 0;
      this.last = m;
      return m;
    }
    // The way on: right, until an exit is in view (then toward it).
    const exit = o.exits[0];
    if (exit && !this.exitSeen) {
      this.exitSeen = true;
      this.dir = exit.point.x >= o.feetX ? 1 : -1;
      this.best = Number.NEGATIVE_INFINITY;
    }
    let dir = this.dir;
    // Headway is per room (x starts again at each room's west edge).
    if (o.room !== this.room) {
      // Walked out of the room while turned round: that is the way on now.
      if (f < this.turnUntil && this.room !== '') {
        this.dir = -this.dir;
        this.turnUntil = -1;
        this.notes.push(`f${f}: turned back out of ${this.room}: going on this way`);
      }
      this.room = o.room;
      this.turns = 0;
      this.turnedHere = 0;
      this.best = Number.NEGATIVE_INFINITY;
      this.bestAt = f;
    }
    const prog = o.feetX * this.dir;
    if (prog > this.best + 32) {
      this.best = prog;
      this.bestAt = f;
    } else if (f - this.bestAt > 480 && f > this.turnUntil) {
      this.turnUntil = f + 180;
      this.bestAt = f + 180;
      this.turns++;
      this.turnedHere++;
      this.notes.push(`f${f}: no headway for 8 s at x ${Math.round(o.feetX)}, turned round for 3 s`);
      // Stuck at the same lock again: the way on is the other way (back to the drop it passed).
      if (this.turns >= 2) {
        this.dir = -this.dir;
        this.turns = 0;
        this.turnUntil = -1;
        this.best = Number.NEGATIVE_INFINITY;
        this.notes.push(`f${f}: a lock this way: the way on is back the other way now`);
      }
    }
    if (f < this.turnUntil) dir = -this.dir;
    const p = o.p;
    // A gap that is a way out (a south exit under it: the green opening, the moths going in) is walked into.
    const ahead = o.feetX + dir * 40;
    const hole = (scene.exits ?? []).some((e) => e.edge === 's' && ahead >= e.from && ahead <= e.to);
    const wall = p.grounded && p.wallDir === dir;
    const gap = p.grounded && !groundAhead(scene, o, dir, 12) && !hole;
    // Once a glade has shown its line ("Hold jump to glide") it takes it at its word: a jump at a gap is
    // held, through the landing and on (so the next edge is walked off with the wings open: a walk-off
    // glide); it lets go for one frame only to press again at a wall. Before that: 14-frame jumps.
    const glider = o.abilities.includes('glide');
    // An edge it fell from walking off (a catch below it): next time, a jump from it (held: the wings).
    if (gap) this.lastEdge = `${o.room}:${Math.round(o.feetX / 64)}`;
    const fellHere = gap && (this.fellAt.get(this.lastEdge) ?? 0) % 2 === 1;
    let jump: boolean;
    if (f >= this.jumpUntil + 1 && (wall || (gap && (!(glider && this.holding) || fellHere)))) {
      // The brief's 14 frames; at the same wall again, a full jump (a step a short hop does not clear).
      const again = wall && Math.abs(o.feetX - this.wallX) < 16;
      if (wall) this.wallX = o.feetX;
      this.jumpUntil = f + (again ? 22 : 14);
      if (glider && !wall) this.holding = true;
    }
    if (glider && this.holding) jump = !((wall || fellHere) && this.last & J && f >= this.jumpUntil - 13);
    else jump = f < this.jumpUntil;
    // A creature right in front: a cut (anyone who has the button presses it).
    const front = o.enemies.some(
      (e) =>
        Math.abs(e.x - o.feetX) < 110 &&
        Math.abs(e.y - o.feetY) < 100 &&
        Math.sign(e.x - o.feetX) === p.facing,
    );
    const cut = front && !(this.last & A) ? A : 0;
    const mask =
      dirBit(dir) | (jump ? J : 0) | pogoPress(o, scene, this.last) | barkPress(o, scene, this.last) | cut;
    this.last = mask;
    return mask;
  }
}

interface PlannerOpts {
  knowsAll: boolean;
  /** Jump this many px before the end of a surface (small = late, long jumps; and a risk of walking off). */
  edge: number;
  /** Frames the jump button is held (variable jump: 18+ is a full one). */
  hold: number;
  /** Short hops across short gaps down (a speedrunner's lower, quicker arcs). */
  hop?: boolean;
  dash: boolean;
  /** Frames after the cocoon starts listening before it presses out (-1: waits for it to break alone). */
  hatchAfter: number;
  pick: 'explore' | 'exit' | 'forward';
  /** Taps attack at a creature close in front. */
  slash: boolean;
  /** Stops this many frames (range) at an edge before a jump or a drop. */
  edgeLook?: [number, number];
  /** Stops now and then: every [a, b] frames for [c, d] frames. */
  stopEvery?: [number, number];
  stopFor?: [number, number];
  /** Stands still while a creature within this many px faces her (up to 4 s). */
  waitForCreatures?: number;
  /** Out of things to do in a room: back out by an exit (a region run goes on), rather than stop. */
  turnBack?: boolean;
  /** The world, and the room it heads for (a speedrunner's knowledge of the route). */
  world?: World;
  goal?: string;
  /** Rooms to cover (a region run's chunk): it heads for the nearest it has not been in. */
  goals?: string[];
}

/** Something to go to. `leave`: on arriving, keep going that way (off an end, into an exit). */
interface Target {
  key: string;
  why: string;
  x: number;
  y: number;
  stand: (s: Surface) => boolean;
  leave?: number;
  /** Walk off the end (a hole in the floor that is an exit), rather than leap off it. */
  drop?: boolean;
  /** Also arrived when this is true (a pickup taken, a light seen up close). */
  done?: (o: Obs) => boolean;
  /** Up a run of bounce caps from this one, into what it cannot see yet. */
  caps?: { x: number; y: number; w: number };
  /** An exit under a floor it must open: cut the bark panel from above, or drop through the one-way. */
  cover?: 'bark' | 'oneway';
  /** Up this face into what it cannot see yet (it owns wall jump); `exit`: out through the top. */
  climb?: { faceX: number; w: number; exit?: boolean };
}

/** A planner's memory of one room. */
interface RoomMemory {
  tries: Map<string, number>;
  given: Set<string>;
  visited: Set<string>;
  pickupsSeen: Map<string, { x: number; y: number }>;
  pickupsGone: Set<string>;
  lightsSeen: Map<string, { x: number; y: number }>;
  lightsVisited: Set<string>;
  exitsSeen: Map<string, { x: number; y: number; edge: string }>;
  /** Given up for want of a route on what it had seen: tried again once it sees more. */
  noRoute: Set<string>;
  /** Exits it has left by (`exit:id`), how often; and the one it came in by last. */
  taken: Map<string, number>;
  arrival: string;
  lastTurn: number;
}

/** The id of the exit whose opening is nearest a point (feet), or null in a room with none. */
function nearestExit(scene: Scene, x: number, y: number): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const e of scene.exits ?? []) {
    const along = e.edge === 'n' || e.edge === 's' ? x : y;
    const off = Math.max(0, e.from - along, along - e.to);
    const across =
      e.edge === 'n' ? y : e.edge === 's' ? scene.height - y : e.edge === 'w' ? x : scene.width - x;
    const d = off + Math.max(0, across);
    if (d < bestD) {
      bestD = d;
      best = e.id;
    }
  }
  return best;
}

function roomMemory(): RoomMemory {
  return {
    tries: new Map(),
    given: new Set(),
    visited: new Set(),
    pickupsSeen: new Map(),
    pickupsGone: new Set(),
    lightsSeen: new Map(),
    lightsVisited: new Set(),
    exitsSeen: new Map(),
    noRoute: new Set(),
    taken: new Map(),
    arrival: '',
    lastTurn: -1000,
  };
}

/** A persona that plans routes on its map (explorer, speedrunner, cautious). */
class Planner implements Persona {
  readonly notes: string[] = [];
  readonly itinerary: Persona['itinerary'] = [];
  private readonly rng: { rng: number };
  private minds = new Map<string, Mind>();
  private target: Target | null = null;
  private route: Move[] | null = null;
  private routeFrom = -1;
  private routeVersion = '';
  /** The line under way (lines.ts): a move of the route, or a climb into the unknown. */
  private active: {
    line: Line;
    name: string;
    k: number;
    goal: Goal;
    from: Surface | null;
    move: Move | null;
    target: Target | null;
    left: boolean;
    hits0: number;
    foreseenHits: number;
    /** The room it set out in (a climb out of it goes on into the next). */
    room: string;
  } | null = null;
  /** Lines chosen (for the report) and how many candidates were played ahead in all. */
  readonly chosen: Array<{ f: number; line: string; frames: number; hits: number; caught: number }> = [];
  linesTried = 0;
  private jumpUntil = -1;
  private lastMask = 0;
  /**
   * What it remembers, one record per room: ids (exits, lights, pickups) and cells repeat from room to
   * room (every room has an `n` or an `e`), so a given-up `exit:e` in one room must not shut the next one's.
   */
  private readonly memory = new Map<string, RoomMemory>();
  private room = '';
  private mem: RoomMemory = roomMemory();
  private get tries() {
    return this.mem.tries;
  }
  private get given() {
    return this.mem.given;
  }
  private get visited() {
    return this.mem.visited;
  }
  private get pickupsSeen() {
    return this.mem.pickupsSeen;
  }
  private get pickupsGone() {
    return this.mem.pickupsGone;
  }
  private get lightsSeen() {
    return this.mem.lightsSeen;
  }
  private get lightsVisited() {
    return this.mem.lightsVisited;
  }
  private get exitsSeen() {
    return this.mem.exitsSeen;
  }
  private nextStop = 0;
  private stopUntil = -1;
  private lookUntil = -1;
  private lookedAt = '';
  private waited = 0;
  private targetSince = 0;
  private wayOn = 1;
  private idleSince = -1;
  /** The fight under way (fight.ts). */
  private fighting: {
    i: number;
    id: string;
    room: string;
    since: number;
    line: Line | null;
    k: number;
    name: string;
    hp: number;
    hurt: number;
    tactics: Map<string, number>;
  } | null = null;
  private ignoreFoesUntil = 0;
  private airClimbAt = -1000;
  private kit = '';
  /** Jumps made at a target from under it (a lamp out of reach is given up after a few). */
  private readonly jumpsAt = new Map<string, number>();
  private hops: Map<string, number> | null = null;
  private goal: string | undefined;
  private frameNow = 0;
  /** Exits (`room#exit`) it could not take, and rooms it has been in. */
  private readonly blocked = new Set<string>();
  private readonly roomsBeen = new Set<string>();
  /** `room/target` keys no line was found for (not tried again by a turn back). */
  private readonly noLine = new Set<string>();
  finished = false;

  constructor(
    readonly name: string,
    seed: number,
    private readonly opt: PlannerOpts,
  ) {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    this.rng = { rng: seedRng(seed ^ h) };
    this.goal = opt.goal;
    this.nextStop = this.range(opt.stopEvery);
  }

  private range(r?: [number, number]): number {
    if (!r) return 0;
    return r[0] + rngInt(this.rng, Math.max(1, r[1] - r[0]));
  }

  private mind(o: Obs, scene: Scene): Mind {
    let mem = this.memory.get(o.room);
    if (!mem) {
      mem = roomMemory();
      this.memory.set(o.room, mem);
    }
    this.mem = mem;
    if (o.room !== this.room) {
      // The way it left the last room.
      const last = this.memory.get(this.room);
      if (last && this.target?.key.startsWith('exit:'))
        last.taken.set(this.target.key, (last.taken.get(this.target.key) ?? 0) + 1);
      this.target = null;
      // Just came in: the opening she came through is not the way on (two planners used to bounce
      // between two rooms' facing exits). It stays known; she can still leave by it later on foot.
      if (this.room !== '') {
        const back = nearestExit(scene, o.feetX, o.feetY);
        if (back) {
          mem.given.add(`exit:${back}`);
          mem.arrival = `exit:${back}`;
        }
        // The way on: away from the side she came in by (in from the east: west).
        const ex = (scene.exits ?? []).find((q) => q.id === back);
        this.wayOn = ex?.edge === 'e' ? -1 : ex?.edge === 'w' ? 1 : o.feetX > scene.width / 2 ? -1 : 1;
      }
      this.room = o.room;
      // A climb out through the top goes on into this room; anything else stops at the crossing.
      if (this.active?.goal.kind !== 'exit' && this.active?.goal.kind !== 'rise') this.active = null;
    }
    let m = this.minds.get(o.room);
    if (!m || m.scene !== scene) {
      m = new Mind(scene, this.opt.knowsAll);
      this.minds.set(o.room, m);
      this.target = null;
      this.route = null;
    }
    return m;
  }

  decide(o: Obs, scene: Scene, ctx: SimCtx): number {
    const mask = this.think(o, scene, ctx);
    this.lastMask = mask;
    return mask;
  }

  private think(o: Obs, scene: Scene, ctx: SimCtx): number {
    const f = o.frame;
    this.frameNow = f;
    // A new ability: every way it gave up on may go now (the shaft, the far ledge).
    const kit = o.abilities.join(',');
    if (kit !== this.kit) {
      if (this.kit !== '') this.notes.push(`f${f}: now owns ${kit}: tries again what it gave up on`);
      this.kit = kit;
      for (const m of this.memory.values()) {
        const arrival = m.given.has(m.arrival) ? m.arrival : '';
        m.given.clear();
        if (arrival) m.given.add(arrival);
        m.noRoute.clear();
        m.tries.clear();
      }
      for (const m of this.minds.values()) m.bad.clear();
      this.noLine.clear();
      this.blocked.clear();
      this.hops = null;
      this.target = null;
      this.route = null;
    }
    if (!this.roomsBeen.has(o.room)) {
      this.roomsBeen.add(o.room);
      this.hops = null;
    }
    if (o.shut) return this.hatch(o);
    const mind = this.mind(o, scene);
    // A line under way plays to its end (it handles a catch itself).
    if (this.active) {
      mind.see(o.solids, o.oneWays, o.abilities, o.tops, o.view, ctx.state.save);
      this.remember(o, mind);
      return this.runLine(o, ctx, mind, scene);
    }
    if (o.held) {
      // A leap off an end (or a walk to a target) that ends in a fall catch, thorns or a fade: not that way again.
      const t = this.target;
      if (t && (ctx.state.caught || o.p.faded > 0) && !this.given.has(t.key))
        this.giveUp(t, ctx.state.caught ? 'it fell (caught) going there' : 'she faded going there', f);
      return 0;
    }
    if (o.lured) {
      // Caught by a lure: a fighter cuts the flame (it goes out), the rest beat free with jump; a dash frees at once.
      if (this.opt.dash && o.abilities.includes('dash') && !(this.lastMask & X)) return X;
      return f % 6 < 2 ? (this.opt.slash ? A : J) : 0;
    }
    // Something new seen: targets given up for want of a route get another look.
    if (mind.see(o.solids, o.oneWays, o.abilities, o.tops, o.view, ctx.state.save)) {
      for (const k of this.mem.noRoute) this.given.delete(k);
      this.mem.noRoute.clear();
    }
    this.remember(o, mind);
    const p = o.p;

    // Cautious habits: stop now and then; wait while a creature faces her.
    if (p.grounded && this.opt.stopEvery) {
      if (f >= this.nextStop && f >= this.stopUntil) {
        this.stopUntil = f + this.range(this.opt.stopFor);
        this.nextStop = this.stopUntil + this.range(this.opt.stopEvery);
      }
      if (f < this.stopUntil) return 0;
    }
    if (p.grounded && this.opt.waitForCreatures && foe(ctx.state, 300, 200) < 0) {
      const near = o.enemies.find(
        (e) =>
          Math.abs(e.x - o.feetX) < (this.opt.waitForCreatures ?? 0) && Math.sign(o.feetX - e.x) === e.facing,
      );
      if (near && this.waited < 240) {
        this.waited++;
        return 0;
      }
      if (!near) this.waited = 0;
    }

    // A creature close by: fight it by look-ahead (or slip past it, if that comes out best).
    // (Once in a fight it stays in it until the creature is well away: no flicker at the edge of range.)
    const fi =
      f >= this.ignoreFoesUntil ? foe(ctx.state, this.fighting ? 700 : 420, this.fighting ? 400 : 260) : -1;
    if (fi >= 0) return this.fightBeat(o, ctx, scene, fi);
    if (this.fighting) {
      const fz = this.fighting;
      const e = ctx.state.enemies.find((q) => q.id === fz.id);
      const end = !e || e.mode === 'dead' || e.gone ? 'it is down' : 'it is behind her';
      const tactics = [...fz.tactics.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`);
      this.notes.push(
        `f${f}: the fight with ${fz.id} over after ${((f - fz.since) / 60).toFixed(1)} s (${end}; ${o.p.hurtSeq - fz.hurt} hit(s) taken): ${tactics.join(', ')}`,
      );
      this.fighting = null;
    }

    const slash = this.opt.slash ? this.slash(o) : 0;
    const t = this.pickTarget(o, mind);
    if (!t) {
      // Nothing left to go to for 5 s: done with this room.
      if (this.idleSince < 0) this.idleSince = f;
      else if (f - this.idleSince > 300 && !this.finished) {
        this.finished = true;
        this.notes.push(`f${f}: nothing left to go to here`);
      }
      return this.wander(o, scene) | slash;
    }
    this.idleSince = -1;
    const m = this.fly(o, scene, mind, t, ctx);
    // A line just started plays alone (the look-ahead played exactly these buttons).
    return this.active ? m : m | slash | barkPress(o, scene, this.lastMask);
  }

  /** One beat of a fight: replay the chosen tactic for a few frames, then look again. */
  private fightBeat(o: Obs, ctx: SimCtx, scene: Scene, i: number): number {
    const f = o.frame;
    const e = ctx.state.enemies[i];
    const id = e?.id ?? '?';
    let fz = this.fighting;
    if (!fz || fz.i !== i || fz.room !== o.room) {
      fz = {
        i,
        id,
        room: o.room,
        since: f,
        line: null,
        k: 0,
        name: '',
        hp: e?.hp ?? 0,
        hurt: o.p.hurtSeq,
        tactics: new Map(),
      };
      this.fighting = fz;
      this.notes.push(`f${f}: a fight with ${id} (${e?.kind})`);
    }
    // Long and nothing happening either way: leave it be for a while (it will not come, or cannot be reached).
    if (f - fz.since > 1800 && (e?.hp ?? 0) === fz.hp && o.p.hurtSeq === fz.hurt) {
      this.ignoreFoesUntil = f + 600;
      this.notes.push(`f${f}: let ${id} be (30 s, nothing dealt or taken)`);
      this.fighting = null;
      return 0;
    }
    if (!fz.line || fz.k >= 20) {
      const toward = this.target ? Math.sign(this.target.x - o.feetX) || this.wayOn : this.wayOn;
      const pick = chooseTactic(ctx, scene, fightTactics(scene, i, toward), i, fz.name);
      if (!pick) return 0;
      fz.line = pick.cand.make();
      fz.k = 0;
      fz.name = pick.cand.name;
      fz.tactics.set(fz.name, (fz.tactics.get(fz.name) ?? 0) + 1);
    }
    return fz.line.act(ctx.state, fz.k++, this.lastMask);
  }

  private hatch(o: Obs): number {
    const f = o.frame;
    if (this.opt.hatchAfter < 0) return 0;
    // The cocoon listens from tuning.hatch.listenFrom (150): presses before that are spent.
    if (f < 150 + this.opt.hatchAfter) return 0;
    if (f % 6 === 0) {
      return J;
    }
    return 0;
  }

  private remember(o: Obs, mind: Mind): void {
    const p = o.p;
    if (p.grounded) {
      this.visited.add(cellKey(o.feetX, o.feetY));
      for (const [id, l] of this.lightsSeen)
        if (Math.abs(l.x - o.feetX) < 64 && Math.abs(l.y - o.feetY) < 96) this.lightsVisited.add(id);
    }
    // A lure hangs in the air (no standing at it): once it is out, it is done with.
    for (const l of o.lights) if (l.kind === 'lures' && l.out) this.lightsVisited.add(l.id);
    const seenNow = new Set(o.pickups.map((q) => q.id));
    for (const q of o.pickups) this.pickupsSeen.set(q.id, { x: q.x, y: q.y });
    // A pickup it saw that is in view and not there any more was taken.
    for (const [id, q] of this.pickupsSeen)
      if (
        !seenNow.has(id) &&
        q.x > o.view.x + 64 &&
        q.x < o.view.x + o.view.w - 64 &&
        q.y > o.view.y + 64 &&
        q.y < o.view.y + o.view.h - 64
      )
        this.pickupsGone.add(id);
    for (const l of o.lights) if (!this.lightsSeen.has(l.id)) this.lightsSeen.set(l.id, { x: l.x, y: l.y });
    for (const e of o.exits)
      if (!this.exitsSeen.has(e.id)) this.exitsSeen.set(e.id, { ...e.point, edge: e.edge });
    if (this.opt.knowsAll)
      for (const e of mind.scene.exits ?? [])
        if (!this.exitsSeen.has(e.id)) {
          const mid = (e.from + e.to) / 2;
          const pt =
            e.edge === 's'
              ? { x: mid, y: e.at ?? mind.scene.height }
              : e.edge === 'n'
                ? { x: mid, y: e.at ?? 0 }
                : e.edge === 'e'
                  ? { x: e.at ?? mind.scene.width, y: mid }
                  : { x: e.at ?? 0, y: mid };
          this.exitsSeen.set(e.id, { ...pt, edge: e.edge });
        }
  }

  /**
   * Taps attack when a creature, or a lure's flame, is close in front (one tap, then a gap); up or down
   * at a flame above or below her.
   */
  private slash(o: Obs): number {
    if (this.lastMask & A) return 0;
    const p = o.p;
    const cy = p.y + p.h / 2;
    const e = o.enemies.find((q) => Math.abs(q.x - o.feetX) < 150 && Math.abs(q.y - o.feetY) < 140);
    if (e) return (Math.sign(e.x - o.feetX) || p.facing) === p.facing ? A : 0;
    // Silk just ahead of her (memory/creatures.md): cut it before walking into it.
    const fx = o.feetX + p.facing * 70;
    if (o.strands.some((q) => crosses(q, fx - 55, cy - 50, fx + 55, cy + 40))) return A;
    const l = o.lights.find(
      (q) => q.kind === 'lures' && !q.out && Math.abs(q.x - o.feetX) < 150 && Math.abs(q.y - cy) < 150,
    );
    if (!l) return 0;
    if (l.y < cy - 70 && Math.abs(l.x - o.feetX) < 60) return A | ActionBit.up;
    if (l.y > cy + 70 && Math.abs(l.x - o.feetX) < 60 && !p.grounded) return A | D;
    return (Math.sign(l.x - o.feetX) || p.facing) === p.facing ? A : 0;
  }

  // ---- What to go to.

  private pickTarget(o: Obs, mind: Mind): Target | null {
    const f = o.frame;
    const t = this.target;
    if (t && !this.given.has(t.key) && !(t.done?.(o) ?? false)) {
      // Re-choose now and then (something better may have come into view), not every frame.
      if (f - this.targetSince < 90 || this.opt.pick === 'exit') return t;
    }
    if (t && (t.done?.(o) ?? false)) this.given.add(t.key);
    let cands = this.candidates(o, mind).filter((c) => !this.given.has(c.key));
    if (cands.length === 0) {
      const dbg = (globalThis as { __ptDebug?: (s: string) => void }).__ptDebug;
      if (dbg)
        dbg(
          `f${f} no candidates; all: ${this.candidates(o, mind)
            .map((c) => c.key)
            .join(' ')}; given ${[...this.given].join(' ')}`,
        );
      cands = this.turnBack(o, mind, f);
    }
    if (cands.length === 0) {
      this.target = null;
      return null;
    }
    // Nearest first (path cost would be better; straight distance with a height penalty is enough here).
    const here = o.p.grounded ? mind.under(o.feetX, o.feetY) : null;
    const score = (c: Target & { rank: number }) =>
      c.rank * 100000 +
      Math.abs(c.x - o.feetX) +
      Math.abs(c.y - o.feetY) * 1.5 -
      (here && c.stand(here) ? 3000 : 0);
    cands.sort((a, b) => score(a) - score(b));
    const next = cands[0] ?? null;
    if (next && next.key !== t?.key) {
      this.itinerary.push({ f, why: next.why, x: Math.round(next.x), y: Math.round(next.y) });
      this.target = next;
      this.targetSince = f;
      this.route = null;
    }
    return this.target;
  }

  /**
   * Nothing left here: turn back. The exit it has left by least (not the one it just came in by, unless
   * there is no other) gets another go; a dead end sends it back the way it came (a region run goes on).
   */
  private turnBack(o: Obs, mind: Mind, f: number): Array<Target & { rank: number }> {
    if (!this.opt.turnBack) return [];
    const keys = [...this.exitsSeen.keys()].map((id) => `exit:${id}`);
    const usable = keys.filter((k) => !this.mem.noRoute.has(k) && !this.noLine.has(`${o.room}/${k}`));
    const pool = usable.filter((k) => k !== this.mem.arrival);
    const pick = (pool.length ? pool : usable).sort(
      (a, b) => (this.mem.taken.get(a) ?? 0) - (this.mem.taken.get(b) ?? 0),
    )[0];
    if (!pick || f - this.mem.lastTurn < 120) return [];
    this.mem.lastTurn = f;
    this.given.delete(pick);
    this.notes.push(`f${f}: nothing new here: back out by ${pick}`);
    const id = pick.slice(5);
    const e = this.exitsSeen.get(id);
    const t = e ? this.exitTarget(mind, id, e, o.feetX) : null;
    return t ? [{ ...t, rank: 0 }] : [];
  }

  /**
   * World hops from where an exit leads to the goal room (the speedrunner knows the world). Exits it
   * could not take are left out; when the goal cannot be reached any more from here, it heads for the
   * nearest room it has not been in instead.
   */
  private hopsToGoal(room: string, exitId: string): number {
    const w = this.opt.world;
    if (!w || !this.goal) return 0;
    const usable = (k: string) => !this.blocked.has(k);
    const bfs = (from: string, forward: boolean): Map<string, number> => {
      const adj = new Map<string, string[]>();
      for (const [k, v] of Object.entries(w.links)) {
        if (!v || !usable(k)) continue;
        const a = k.slice(0, k.indexOf('#'));
        const [x, y] = forward ? [a, v.to] : [v.to, a];
        adj.set(x, [...(adj.get(x) ?? []), y]);
      }
      const hops = new Map<string, number>([[from, 0]]);
      const queue = [from];
      while (queue.length) {
        const r = queue.shift() as string;
        for (const q of adj.get(r) ?? [])
          if (!hops.has(q)) {
            hops.set(q, (hops.get(r) ?? 0) + 1);
            queue.push(q);
          }
      }
      return hops;
    };
    if (!this.hops) {
      // A chunk to cover (`goals`): the nearest of its rooms not yet been in.
      const todo = (this.opt.goals ?? []).filter((r) => !this.roomsBeen.has(r));
      if (todo.length) {
        const from = bfs(room, true);
        const near = todo
          .filter((r) => from.has(r))
          .sort((a, b) => (from.get(a) ?? 0) - (from.get(b) ?? 0))[0];
        if (near) this.goal = near;
      }
      this.hops = bfs(this.goal ?? room, false);
      if (!this.hops.has(room)) {
        const ahead = [...bfs(room, true).entries()]
          .filter(([r]) => !this.roomsBeen.has(r))
          .sort((a, b) => a[1] - b[1]);
        const next = ahead[0]?.[0];
        if (next && next !== this.goal) {
          this.notes.push(
            `f${this.frameNow}: ${this.goal} cannot be reached from ${room}: heading for ${next}`,
          );
          this.goal = next;
          this.hops = bfs(next, false);
        }
      }
    }
    const k = `${room}#${exitId}`;
    const link = w.links[k];
    if (!link || !usable(k)) return 1000;
    return this.hops.get(link.to) ?? 1000;
  }

  private candidates(o: Obs, mind: Mind): Array<Target & { rank: number }> {
    const out: Array<Target & { rank: number }> = [];
    // Exits it gave up on (the arrival opening among them) leave the forward frontier open.
    const exits = [...this.exitsSeen.entries()]
      .map(([id, e]) => this.exitTarget(mind, id, e, o.feetX))
      .filter((e): e is Target => !!e && !this.given.has(e.key));
    // A one-way drop is a turn back on purpose (the hub's well): every other way first.
    const oneWay = (key: string) =>
      (mind.scene.exits ?? []).some((q) => `exit:${q.id}` === key && q.oneWay === true);
    if (this.opt.pick === 'exit' && exits.length > 0)
      return exits.map((e) => ({ ...e, rank: this.hopsToGoal(o.room, e.key.slice(5)) }));
    // No exit it can take (a gate that a fight opens, a lock): the room itself, the way on first.
    if (this.opt.pick === 'exit')
      return [
        ...this.frontier(o, mind, true).map((c) => ({ ...c, rank: 1 })),
        ...this.frontier(o, mind, false).map((c) => ({ ...c, rank: 2 })),
      ];
    if (this.opt.pick === 'forward') {
      // Forward: a way through before a one-way drop; a way up it can see (caps, a climb) counts as a way
      // through (the hub's cap wall to R14).
      const ups = this.frontier(o, mind, true).filter((c) => c.caps || c.climb);
      if (exits.length > 0)
        return [
          ...exits.map((e) => ({ ...e, rank: oneWay(e.key) ? 1 : 0 })),
          ...ups.map((c) => ({ ...c, rank: 0 })),
        ];
      return this.frontier(o, mind, true).map((c) => ({ ...c, rank: 1 }));
    }
    // Explorer: pickups, lights, unwalked ground, then dangling ends, then exits.
    for (const [id, q] of this.pickupsSeen) {
      if (this.pickupsGone.has(id)) continue;
      out.push({
        key: `pickup:${id}`,
        why: `pickup ${id}`,
        x: q.x,
        y: q.y,
        rank: 0,
        stand: standUnder(mind, q.x, q.y),
        done: () => this.pickupsGone.has(id),
      });
    }
    for (const [id, l] of this.lightsSeen) {
      if (this.lightsVisited.has(id)) continue;
      out.push({
        key: `light:${id}`,
        why: `light ${id}`,
        x: l.x,
        y: l.y,
        rank: 0,
        stand: standUnder(mind, l.x, l.y - 8),
        done: () => this.lightsVisited.has(id),
      });
    }
    for (const c of this.frontier(o, mind, false))
      out.push({ ...c, rank: c.leave || c.caps || c.climb ? 2 : 1 });
    for (const e of exits) out.push({ ...e, rank: oneWay(e.key) ? 4 : 3 });
    return out;
  }

  /** Ground it has seen and not walked (cells of 256 px), and ends with nothing known beyond them. */
  private frontier(o: Obs, mind: Mind, forwardOnly: boolean): Target[] {
    mind.refresh();
    const out: Target[] = [];
    for (const s of mind.surfaces) {
      if (s.cap) continue;
      for (let x = s.x0 + 64; x < s.x1 - 32; x += CELL) {
        const y = yAt(s, x);
        const key = cellKey(x, y);
        if (this.visited.has(key)) continue;
        if (forwardOnly && (x - o.feetX) * this.wayOn < 0) continue;
        out.push({
          key: `cell:${key}`,
          why: `unwalked ground at ${Math.round(x)}`,
          x,
          y,
          stand: (q) => standsAt(q, x, y),
          done: () => this.visited.has(key),
        });
      }
      for (const dir of [-1, 1]) {
        const ex = dir > 0 ? s.x1 : s.x0;
        const onward = mind.moves.some(
          (m) => m.from === s.id && m.dir === dir && m.kind !== 'up' && Math.abs(m.launchX - ex) < 4,
        );
        if (onward) continue;
        // Against a known wall or the room's side: not an end.
        const ey = yAt(s, ex);
        if (dir > 0 ? ex >= mind.scene.width - 8 : ex <= 8) continue;
        if (solidAt(mind.scene, dir > 0 ? ex + 2 : ex - 3, ey - 64, 1, 32)) continue;
        if (forwardOnly && dir !== this.wayOn) continue;
        // The lip of a hole that is an exit is the exit's business, not a leap into the unknown.
        if (
          (mind.scene.exits ?? []).some(
            (q) => q.edge === 's' && ex + dir * 40 >= q.from - 8 && ex + dir * 40 <= q.to + 8,
          )
        )
          continue;
        out.push({
          key: `end:${Math.round(ex)},${Math.round(ey)}`,
          why: `a dangling end at ${Math.round(ex)}, ${Math.round(ey)}`,
          x: ex - dir * 24,
          y: ey,
          stand: (q) => same(q, s),
          leave: dir,
        });
      }
    }
    // Bounce caps it can get onto, rising out of sight: up them, into what it cannot see yet.
    for (const k of mind.kitStanding()) {
      if (k.kind !== 'cap' || k.y > o.view.y + o.view.h || k.y < o.view.y - 64) continue;
      const cx = k.x + k.w / 2;
      const floor = mind.surfaces
        .filter(
          (q) =>
            !q.cap &&
            q.x0 - 260 < k.x + k.w &&
            q.x1 + 260 > k.x &&
            yAt(q, Math.max(q.x0, Math.min(q.x1, cx))) - k.y < 250,
        )
        .sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - cx) - Math.abs((b.x0 + b.x1) / 2 - cx))[0];
      if (!floor) continue;
      const sx = Math.max(floor.x0 + 24, Math.min(floor.x1 - 24, cx));
      const fy = yAt(floor, sx);
      out.push({
        key: `caps:${k.x},${k.y}`,
        why: `up the caps from ${Math.round(k.x)}, ${Math.round(k.y)}`,
        x: sx,
        y: fy,
        stand: (q) => standsAt(q, sx, fy),
        caps: { x: k.x, y: k.y, w: k.w },
      });
    }
    // Faces rising out of sight (she owns the wall jump): up them, into what she cannot see yet.
    if (mind.climber)
      for (const fc of mind.faces()) {
        if (fc.x <= 0 || fc.x >= mind.scene.width) continue;
        const sx = fc.x - fc.w * 26;
        const floor = mind.surfaces
          .filter(
            (q) => sx >= q.x0 - 8 && sx <= q.x1 + 8 && fc.y0 < yAt(q, sx) - 64 && fc.y1 >= yAt(q, sx) - 400,
          )
          .sort((a, b) => yAt(b, sx) - yAt(a, sx))[0];
        if (!floor) continue;
        const fy = yAt(floor, sx);
        if (fy - fc.y0 < 500 || fc.y0 > o.view.y + 64) continue;
        out.push({
          key: `climb:${Math.round(fc.x)},${fc.w}`,
          why: `up the face at ${Math.round(fc.x)}`,
          x: sx,
          y: fy,
          stand: (q) => standsAt(q, sx, fy),
          climb: { faceX: fc.x, w: fc.w },
        });
      }
    return out;
  }

  private exitTarget(
    mind: Mind,
    id: string,
    e: { x: number; y: number; edge: string },
    from: number,
  ): Target | null {
    mind.refresh();
    // A way out at the top (a shaft): up a face under it, if she owns the wall jump.
    if (e.edge === 'n' && mind.climber) {
      const span = (mind.scene.exits ?? []).find((q) => q.id === id);
      const faces = mind
        .faces()
        .filter(
          (fc) => span && fc.x >= span.from - 8 && fc.x <= span.to + 8 && fc.x > 0 && fc.x < mind.scene.width,
        )
        .sort((a, b) => b.y1 - a.y1);
      for (const fc of faces) {
        const sx = fc.x - fc.w * 26;
        // A floor beside the face that the face rises from (it may start a jump above her head).
        const floor = mind.surfaces
          .filter((q) => {
            if (sx < q.x0 - 8 || sx > q.x1 + 8) return false;
            const y = yAt(q, sx);
            return fc.y0 < y - 64 && fc.y1 >= y - 400;
          })
          .sort((a, b) => yAt(b, sx) - yAt(a, sx))[0];
        if (!floor) continue;
        return {
          key: `exit:${id}`,
          why: `exit ${id} (up the shaft)`,
          x: sx,
          y: yAt(floor, sx),
          stand: (q) => standsAt(q, sx, yAt(floor, sx)),
          climb: { faceX: fc.x, w: fc.w, exit: true },
        };
      }
    }
    // A hole in a floor (a south exit): stand on a floor that ends at its edge, however deep the shaft.
    const span = e.edge === 's' ? (mind.scene.exits ?? []).find((q) => q.id === id) : undefined;
    if (span) {
      // Something over the hole: a shut gate or shortcut (no way, for now: blocked for the route), a rotten
      // bark floor panel (stand on it and cut it open from above), or a one-way mesh (stand on it, drop through).
      const covers = (r: { x: number; w: number }) =>
        Math.min(r.x + r.w, span.to) - Math.max(r.x, span.from) >= (span.to - span.from) / 2;
      const kit = mind
        .kitStanding()
        .filter((k) => k.kind !== 'cap' && covers(k) && k.y + k.h >= (span.at ?? mind.scene.height) - 900);
      // A one-way mesh over the hole is a floor to stand on (the hub's grate over R10's climb-out): dropping
      // through it is possible, but it is not the way on (it skips the pit: a sequence break, reported).
      const meshOver = mind.surfaces.some(
        (q) => q.oneWay && Math.min(q.x1, span.to) - Math.max(q.x0, span.from) >= (span.to - span.from) / 2,
      );
      if (kit.some((k) => k.kind !== 'bark') || meshOver) {
        this.blocked.add(`${this.room}#${id}`);
        return null;
      }
      const bark = kit.sort((a, b) => a.y - b.y)[0];
      const mesh = mind.surfaces.find(
        (q) => q.oneWay && Math.min(q.x1, span.to) - Math.max(q.x0, span.from) >= (span.to - span.from) / 2,
      );
      if (bark || mesh) {
        const cx = bark ? bark.x + bark.w / 2 : (span.from + span.to) / 2;
        const cy = bark ? bark.y : (mesh?.pieces[0]?.y ?? 0);
        const on = bark ? mind.under(cx, cy) : (mesh ?? null);
        if (!on) return null;
        return {
          key: `exit:${id}`,
          why: `exit ${id} (${bark ? 'through the bark floor' : 'down through the mesh'})`,
          x: cx,
          y: cy,
          stand: (q) => standsAt(q, cx, cy),
          cover: bark ? 'bark' : 'oneway',
        };
      }
    }
    // The lip on her side of it.
    const lip = span
      ? mind.surfaces
          .filter((q) => Math.abs(q.x1 - span.from) <= 48 || Math.abs(q.x0 - span.to) <= 48)
          .sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - from) - Math.abs((b.x0 + b.x1) / 2 - from))[0]
      : undefined;
    const s = lip ?? mind.standFor(e.x, e.edge === 's' ? e.y - 400 : e.y);
    const dir = e.edge === 'w' ? -1 : e.edge === 'e' ? 1 : s ? (e.x >= (s.x0 + s.x1) / 2 ? 1 : -1) : 1;
    const ex = s ? (dir > 0 ? s.x1 : s.x0) : e.x;
    return {
      key: `exit:${id}`,
      why: `exit ${id}`,
      x: ex - dir * 24,
      y: s ? yAt(s, ex) : e.y,
      stand: (q) => same(q, s),
      leave: dir,
      ...(lip ? { drop: true } : {}),
    };
  }

  /** Nothing to go to: hold the way on, jumping at walls and gaps (the naive habit). */
  private wander(o: Obs, scene: Scene): number {
    const p = o.p;
    const f = o.frame;
    if (
      f >= this.jumpUntil + 1 &&
      p.grounded &&
      (p.wallDir === this.wayOn || !groundAhead(scene, o, this.wayOn, this.opt.edge))
    )
      this.jumpUntil = f + this.opt.hold;
    return dirBit(this.wayOn) | (f < this.jumpUntil ? J : 0);
  }

  // ---- Getting there.

  private giveUp(t: Target, why: string, f: number): void {
    if (this.given.has(t.key)) return;
    this.given.add(t.key);
    if (t.key.startsWith('exit:')) {
      this.blocked.add(`${this.room}#${t.key.slice(5)}`);
      this.hops = null;
    }
    if (why.startsWith('no route')) this.mem.noRoute.add(t.key);
    this.notes.push(`f${f}: gave up on ${t.why}: ${why}`);
    this.target = null;
    this.route = null;
  }

  private hands(): Hands {
    return { edge: this.opt.edge, hold: this.opt.hold, dash: this.opt.dash, cut: this.opt.slash };
  }

  /** Waits a line may start with: none, or (a creature in view) a beat or two to let it pass. */
  private waits(o: Obs): number[] {
    return o.enemies.length > 0 || o.lights.some((l) => l.kind === 'lures' && !l.out) ? [0, 40, 90] : [0];
  }

  /** Plays the line under way; ends it (and judges it) when she lands, fails or runs out of time. */
  private runLine(o: Obs, ctx: SimCtx, mind: Mind, scene: Scene): number {
    const a = this.active;
    if (!a) return 0;
    const f = o.frame;
    const p = o.p;
    const end = (ok: boolean, why: string): void => {
      this.active = null;
      this.route = null;
      // A leap or a climb into the unknown that worked has done its job: on from wherever she is now.
      if (ok && a.target) {
        this.given.add(a.target.key);
        if (this.target?.key === a.target.key) this.target = null;
      }
      if (a.move) {
        if (ok) this.tries.delete(moveKey(a.move));
        else this.failed(a.move, f, why, mind);
      } else if (!ok && a.target) this.giveUp(a.target, why, f);
      if (!ok && a.target?.leave === undefined)
        this.notes.push(`f${f}: ${a.name} did not go as foreseen (${why})`);
    };
    if (o.held && (a.goal.kind === 'exit' || (a.goal.kind === 'rise' && a.goal.through)) && ctx.state.exit) {
      // Out of a room with no world beyond (a test room): that was the way out.
      if (!ctx.world) {
        end(true, 'out');
        return 0;
      }
      return a.line.act(ctx.state, a.k++, this.lastMask);
    }
    if (o.held) {
      if (ctx.state.exit && a.goal.kind !== 'surface') end(true, 'out by an exit');
      else end(false, ctx.state.caught ? 'caught (a fall or thorns)' : 'held');
      return 0;
    }
    if (o.p.hurtSeq > a.hits0 + a.foreseenHits) {
      // A hit the look-ahead did not see coming (a live run's timing): remember the move as risky.
      a.hits0 = o.p.hurtSeq;
      if (a.move) this.failed(a.move, f, 'a hit it did not foresee', mind);
    }
    if (
      p.grounded &&
      !o.lured &&
      (a.goal.kind === 'exit' || (a.goal.kind === 'rise' && a.goal.through && o.room !== a.room))
    ) {
      if (o.room !== a.room && p.contactFrames >= 6 && o.feetY < scene.height - 32) {
        end(true, 'through');
        return 0;
      }
    } else if (p.grounded && !o.lured && !onCap(ctx.state, scene)) {
      const goal = a.goal;
      if (goal.kind === 'surface' && onSurface(ctx.state, goal.surface)) {
        end(true, 'landed');
        return 0;
      }
      if (goal.kind === 'rise' && o.feetY <= goal.fromY - goal.rise) {
        end(true, 'rose');
        return 0;
      }
      const home =
        nearSurface(ctx.state, a.from) || (goal.kind === 'surface' && nearSurface(ctx.state, goal.surface));
      // As the look-ahead judges it (lines.ts `simulate`): a leap is done on any other ground, a climb
      // into the unknown goes on from a ledge on the way, a move must land on its surface.
      if (a.left && !home && goal.kind === 'leap') {
        end(true, 'landed');
        return 0;
      }
      if (a.left && !home && goal.kind === 'surface') {
        end(false, `landed elsewhere (${Math.round(o.feetX)}, ${Math.round(o.feetY)})`);
        return 0;
      }
    } else a.left = true;
    if (a.k >= a.line.max) {
      end(false, 'too long');
      return 0;
    }
    return a.line.act(ctx.state, a.k++, this.lastMask);
  }

  /** Looks ahead over the candidate lines for a move (or a climb into the unknown) and starts the best. */
  private startLine(
    o: Obs,
    ctx: SimCtx,
    scene: Scene,
    mind: Mind,
    from: Surface | null,
    goal: Goal,
    cands: Candidate[],
    move: Move | null,
    target: Target | null,
  ): number {
    const f = o.frame;
    const c = chooseLine(ctx, scene, cands, from, goal);
    this.linesTried += c.tried;
    if (!c.cand) {
      const what = move ? `a ${move.kind} at x ${Math.round(move.launchX)}` : (target?.why ?? 'a climb');
      this.notes.push(`f${f}: no line for ${what} (${c.tried} tried: ${c.fails || 'none'})`);
      if (move) {
        mind.bad.add(moveKey(move));
        this.route = null;
      } else if (target) {
        this.noLine.add(`${o.room}/${target.key}`);
        this.giveUp(target, 'no line works', f);
      }
      return 0;
    }
    const line = c.cand.make();
    this.active = {
      line,
      name: c.cand.name,
      k: 0,
      goal,
      from,
      move,
      target,
      left: false,
      hits0: o.p.hurtSeq,
      foreseenHits: c.outcome.hits,
      room: o.room,
    };
    this.chosen.push({
      f,
      line: c.cand.name,
      frames: c.outcome.frames,
      hits: c.outcome.hits,
      caught: c.outcome.caught,
    });
    if (c.outcome.hits > 0)
      this.notes.push(
        `f${f}: took ${c.cand.name} knowing it costs ${c.outcome.hits} hit(s): no clean line (${c.fails})`,
      );
    return this.runLine(o, ctx, mind, scene);
  }

  private fly(o: Obs, scene: Scene, mind: Mind, t: Target, ctx: SimCtx): number {
    const p = o.p;
    const f = o.frame;
    if (f - this.targetSince > 60 * 45) {
      this.giveUp(t, 'not reached in 45 s', f);
      return 0;
    }
    if (!p.grounded && mind.climber && (p.vy < -2 || p.mode === 'wallSlide') && f - this.airClimbAt > 30) {
      // Carried up into a room (the climb-out through the grate) or rising beside a wall: climb on, onto
      // the first ground at or above here, if a face near her makes that work.
      this.airClimbAt = f;
      const cands: Candidate[] = [];
      for (const fc of mind.faces()) {
        if (Math.abs(fc.x - o.feetX) > 400 || fc.y1 < o.feetY - 400 || fc.y0 > o.feetY) continue;
        const n = `climb on (face at ${Math.round(fc.x)})`;
        cands.push({
          name: n,
          make: () =>
            climbLine(
              n,
              scene,
              { kind: 'rise', fromY: o.feetY, rise: 0 },
              fc.x,
              { faceX: fc.x, w: fc.w, wait: 0 },
              this.hands(),
              600,
            ),
        });
      }
      if (cands.length) {
        const c = chooseLine(ctx, scene, cands, null, { kind: 'rise', fromY: o.feetY, rise: 0 });
        if (c.cand) {
          this.active = {
            line: c.cand.make(),
            name: c.cand.name,
            k: 0,
            goal: { kind: 'rise', fromY: o.feetY, rise: 0 },
            from: null,
            move: null,
            target: null,
            left: true,
            hits0: o.p.hurtSeq,
            foreseenHits: c.outcome.hits,
            room: o.room,
          };
          this.chosen.push({
            f,
            line: c.cand.name,
            frames: c.outcome.frames,
            hits: c.outcome.hits,
            caught: c.outcome.caught,
          });
          return this.runLine(o, ctx, mind, scene);
        }
      }
    }
    if (!p.grounded && t.cover) {
      // Over the panel: a down cut on the way down (it breaks after a few); through the mesh: keep falling.
      if (t.cover === 'bark') return p.vy > 0 && !(this.lastMask & A) ? A | D : 0;
      return D;
    }
    if (!p.grounded) {
      // Falling with no line (thrown, or off an end it leaves by): steer toward the target, wings open.
      let m = 0;
      if (t.leave && (o.feetX - t.x) * t.leave > -16) m |= dirBit(t.leave);
      else if (Math.abs(t.x - o.feetX) > 24) m |= dirBit(Math.sign(t.x - o.feetX));
      if (f < this.jumpUntil || (p.vy > 2 && o.abilities.includes('glide') && !t.drop)) m |= J;
      return m | pogoPress(o, scene, this.lastMask);
    }
    const cur =
      mind.under(o.feetX, o.feetY) ?? mind.under(o.feetX - 19, o.feetY) ?? mind.under(o.feetX + 19, o.feetY);
    if (!cur) return this.wander(o, scene);
    if (t.stand(cur)) return this.finish(o, scene, mind, t, ctx, cur);
    const version = `${mind.surfaces.length}:${mind.moves.length}:${mind.bad.size}`;
    if (!this.route || this.routeFrom !== cur.id || this.routeVersion !== version) {
      this.route = mind.route(cur.id, t.stand);
      this.routeFrom = cur.id;
      this.routeVersion = version;
      if (!this.route) {
        const dbg = (globalThis as { __ptDebug?: (s: string) => void }).__ptDebug;
        if (dbg)
          dbg(
            `f${f} no route from ${cur.x0}-${cur.x1}@${cur.pieces[0]?.y} to ${t.why}; surfaces ${mind.surfaces.map((q) => `${q.x0}-${q.x1}@${q.pieces[0]?.y}${q.oneWay ? 'o' : ''}`).join(' ')}`,
          );
        this.giveUp(t, 'no route on what it has seen', f);
        // Stand and think (the next target comes next frame): wandering on walked her off ledges she had climbed.
        return 0;
      }
    }
    const m = this.route[0];
    if (!m) return this.finish(o, scene, mind, t, ctx, cur);
    const to = mind.surfaces.find((q) => q.id === m.to);
    if (!to) {
      this.route = null;
      return 0;
    }
    // Far from where the move starts: walk there (the look-ahead is for the move itself).
    const d = m.launchX - o.feetX;
    if (Math.abs(d) > 560) return dirBit(Math.sign(d)) | this.run(o, scene, Math.sign(d), Math.abs(d));
    // Cautious: go to the lip and look before a jump or a drop.
    if (m.kind !== 'up' && m.kind !== 'climb' && m.kind !== 'through') {
      const toEdge = m.dir > 0 ? m.launchX - o.feetX : o.feetX - m.launchX;
      const look = this.edgeLook(o, m, toEdge);
      if (look >= 0) return look;
    }
    let tx = Math.max(to.x0 + 40, Math.min(to.x1 - 40, t.x));
    let cands = linesFor(m, cur, to, tx, scene, o.abilities, this.hands(), {
      waits: this.waits(o),
      faces: mind.faces(),
    });
    // Onto a bounce cap: the move goes on off it (and off the caps after it) to the first real ground.
    if (to.cap) {
      const caps: Surface[] = [to];
      let final: Surface | undefined;
      for (const b of this.route.slice(1)) {
        if (b.kind !== 'bounce') break;
        const q = mind.surfaces.find((z) => z.id === b.to);
        if (!q) break;
        if (q.cap) caps.push(q);
        else {
          final = q;
          break;
        }
      }
      if (!final) {
        this.route = null;
        mind.bad.add(moveKey(m));
        return 0;
      }
      const fin = final;
      tx = Math.max(fin.x0 + 40, Math.min(fin.x1 - 40, t.x));
      cands = cands.map((c) => capChain(c, caps, fin, tx));
      return this.startLine(o, ctx, scene, mind, cur, { kind: 'surface', surface: fin }, cands, m, null);
    }
    return this.startLine(o, ctx, scene, mind, cur, { kind: 'surface', surface: to }, cands, m, null);
  }

  private failed(m: Move, f: number, why: string, mind: Mind): void {
    const k = moveKey(m);
    const n = (this.tries.get(k) ?? 0) + 1;
    this.tries.set(k, n);
    if (n >= 2) {
      mind.bad.add(k);
      this.notes.push(`f${f}: dropped a ${m.kind} at x ${Math.round(m.launchX)} after ${n} misses (${why})`);
    }
  }

  /** Cautious: stop and look before an edge; then creep (taps) to the last pixels. */
  private edgeLook(o: Obs, m: Move, d: number): number {
    if (!this.opt.edgeLook) return -1;
    const f = o.frame;
    const k = moveKey(m);
    if (d < 70 && this.lookedAt !== k) {
      this.lookedAt = k;
      this.lookUntil = f + this.range(this.opt.edgeLook);
    }
    if (f < this.lookUntil) return 0;
    // Creep up to the lip in pulses, then go.
    if (this.lookedAt !== k && d >= 70) return f % 6 < 3 ? dirBit(m.dir) : 0;
    return -1;
  }

  /** Dash on a long clear run (speedrunner). */
  private run(o: Obs, scene: Scene, dir: number, d: number): number {
    if (!this.opt.dash || !o.abilities.includes('dash')) return 0;
    if (
      d > 420 &&
      o.p.grounded &&
      o.p.dashCd === 0 &&
      groundAhead(scene, o, dir, 300) &&
      !(this.lastMask & X)
    )
      return X;
    return 0;
  }

  /** On the target's surface: walk to it; take a hanging pickup with a jump; leave the way it says; climb on. */
  private finish(o: Obs, scene: Scene, mind: Mind, t: Target, ctx: SimCtx, cur: Surface): number {
    const p = o.p;
    const f = o.frame;
    const dx = t.x - o.feetX;
    if (t.caps) {
      // Through when she stands on ground above the first cap (the shelf she set out from does not count).
      const c = t.caps;
      const goal: Goal = { kind: 'rise', fromY: c.y, rise: 8 };
      const n = 'up the bounce caps';
      return this.startLine(
        o,
        ctx,
        scene,
        mind,
        cur,
        goal,
        [{ name: n, make: () => capClimbLine(n, scene, c, this.hands()) }],
        null,
        t,
      );
    }
    if (t.cover) {
      // Over the panel or the mesh, then: down through the mesh (down + jump), or hop and cut down at the bark.
      if (p.grounded && Math.abs(dx) > 24) return dirBit(Math.sign(dx));
      if (t.cover === 'oneway') return f % 4 < 2 ? D | J : D;
      if (p.grounded) return this.lastMask & J ? 0 : J;
      return p.vy > 0 && !(this.lastMask & A) ? A | D : 0;
    }
    if (t.climb) {
      // Up a face into what it cannot see yet: the look-ahead only keeps her off thorns and slick bark.
      const c = t.climb;
      if (Math.abs(c.faceX - c.w * 26 - o.feetX) > 40 && p.wallDir !== c.w)
        return dirBit(Math.sign(c.faceX - c.w * 26 - o.feetX));
      const goal: Goal = c.exit
        ? { kind: 'exit', id: t.key.slice(5), room: o.room }
        : { kind: 'rise', fromY: o.feetY, rise: 240, through: true };
      const next = (r: string) => ctx.world?.rooms[r]?.scene;
      const faces = mind.faces();
      const cands: Candidate[] = [];
      for (const wait of [0]) {
        const n = 'wall climb into the unknown';
        cands.push({
          name: n,
          make: () =>
            climbLine(n, scene, goal, c.faceX, { faceX: c.faceX, w: c.w, wait, next }, this.hands(), 1200),
        });
        // Out through the top into the next room: the last kick must fall just under the seam.
        if (c.exit)
          for (const kickDelay of [3, 6, 9, 12, 15, 18, 21])
            cands.push({
              name: `${n} (kicks ${kickDelay}f late)`,
              make: () =>
                climbLine(
                  n,
                  scene,
                  goal,
                  c.faceX,
                  { faceX: c.faceX, w: c.w, wait, next, kickDelay },
                  this.hands(),
                  1200,
                ),
            });
        for (const fc of faces) {
          const gap = (fc.x - c.faceX) * -c.w;
          if (fc.w !== -c.w || gap < 120 || gap > 900) continue;
          for (const up of [200, 360, 520, 680, 840]) {
            const across = { x: fc.x, atY: o.feetY - up };
            const nm = `climb, kick-glide across at ${up} up`;
            cands.push({
              name: nm,
              make: () =>
                climbLine(
                  nm,
                  scene,
                  goal,
                  c.faceX,
                  { faceX: c.faceX, w: c.w, across, wait, next },
                  this.hands(),
                  1200,
                ),
            });
          }
        }
      }
      return this.startLine(o, ctx, scene, mind, cur, goal, cands, null, t);
    }
    if (t.leave) {
      if ((o.feetX - t.x) * t.leave > -16) {
        // Cautious: a look over the lip first.
        if (this.opt.edgeLook && this.lookedAt !== t.key) {
          this.lookedAt = t.key;
          this.lookUntil = f + this.range(this.opt.edgeLook) + 30;
        }
        if (f < this.lookUntil) return 0;
        // A dangling end: a leap into what it cannot see, but not into the thorns it can (the look-ahead).
        if (t.key.startsWith('end:')) {
          const ex = t.x + t.leave * 24;
          const cands = leapLines(ex, t.leave, scene, o.abilities, this.hands(), this.waits(o));
          return this.startLine(o, ctx, scene, mind, cur, { kind: 'leap' }, cands, null, t);
        }
        // At the end: go on, jumping off it (a player leaps rather than walks into the dark).
        if (
          !t.drop &&
          f >= this.jumpUntil + 1 &&
          p.grounded &&
          !groundAhead(scene, o, t.leave, this.opt.edge)
        )
          this.jumpUntil = f + this.opt.hold;
        if (p.grounded && p.wallDir === t.leave && f >= this.jumpUntil + 1)
          this.jumpUntil = f + this.opt.hold;
        return dirBit(t.leave) | (f < this.jumpUntil ? J : 0);
      }
      return dirBit(Math.sign(dx)) | this.run(o, scene, Math.sign(dx), Math.abs(dx));
    }
    // As near under it as this ground goes (a lamp hangs off the end of a ledge: a jump-cut from its end).
    const sx = Math.max(cur.x0 + 20, Math.min(cur.x1 - 20, t.x));
    const sdx = sx - o.feetX;
    if (Math.abs(sdx) > 20) return dirBit(Math.sign(sdx)) | this.run(o, scene, Math.sign(sdx), Math.abs(sdx));
    // Under it: a pickup or a light above her head wants a jump (toward it, if it hangs off to the side).
    if (t.y < o.feetY - 60 && !(this.lastMask & J)) {
      const n = (this.jumpsAt.get(t.key) ?? 0) + 1;
      this.jumpsAt.set(t.key, n);
      if (n > 4) {
        this.giveUp(t, 'out of reach of a jump from here', f);
        return 0;
      }
      this.jumpUntil = f + this.opt.hold;
      return J | (Math.abs(dx) > 40 ? dirBit(Math.sign(dx)) : 0);
    }
    if (f < this.jumpUntil) return J;
    // Standing at it: done.
    this.given.add(t.key);
    this.target = null;
    return 0;
  }
}

const CELL = 256;
function cellKey(x: number, y: number): string {
  return `${Math.floor(x / CELL)},${Math.round(y / 64)}`;
}

/**
 * Does she stand on `q` at (x, y)? Targets on a point, not on a surface captured once: surfaces are rebuilt
 * and grow (a bark panel seen joins the floor beside it) as more of the room is seen.
 */
export function standsAt(q: Surface, x: number, y: number): boolean {
  if (x < q.x0 - 8 || x > q.x1 + 8) return false;
  return Math.abs(topUnder(q, Math.max(q.x0, Math.min(q.x1, x))) - y) <= 8;
}

/** Surfaces are rebuilt (new ids) as more of the room is seen: compare them by geometry. */
export function same(a: Surface | null | undefined, b: Surface | null | undefined): boolean {
  return !!a && !!b && Math.abs(a.x0 - b.x0) < 2 && Math.abs(a.x1 - b.x1) < 2 && a.oneWay === b.oneWay;
}

function standUnder(mind: Mind, x: number, y: number): (s: Surface) => boolean {
  return (q) => same(mind.standFor(x, y), q);
}

/** Does strand `q` pass through the box? (Sampled: a dozen points along it are plenty for a bot's eye.) */
function crosses(
  q: [number, number, number, number],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  for (let k = 0; k <= 12; k++) {
    const x = q[0] + ((q[2] - q[0]) * k) / 12;
    const y = q[1] + ((q[3] - q[1]) * k) / 12;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
  }
  return false;
}
