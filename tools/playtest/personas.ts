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
import { Mind, type Move, moveKey, type Surface, yAt } from './map';
import type { Obs } from './observe';

const L = ActionBit.left;
const R = ActionBit.right;
const D = ActionBit.down;
const J = ActionBit.jump;
const X = ActionBit.dash;
const A = ActionBit.attack;

export interface Persona {
  readonly name: string;
  /** The input mask for this frame. `scene` is the room she is in now (it changes at a room exit). */
  decide(o: Obs, scene: Scene): number;
  /** What it gave up on, and why (for the report). */
  readonly notes: string[];
  /** Where it decided to go, and when (planning personas). */
  readonly itinerary: Array<{ f: number; why: string; x: number; y: number }>;
  /** It has nothing left it wants to do here (a room with no exit, all of it seen): the run can end. */
  readonly finished?: boolean;
}

export const PERSONAS = ['naive', 'explorer', 'speedrunner', 'cautious'] as const;
export type PersonaName = (typeof PERSONAS)[number];

export function makePersona(name: string, seed = 1): Persona {
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

function dirBit(dir: number): number {
  return dir > 0 ? R : dir < 0 ? L : 0;
}

/**
 * The brief's naive player (tests/unit/rooms.test.ts): hold the way on; jump (held 14 frames) when
 * blocked by a wall or at the edge of a gap. When it makes no headway for 8 s it turns round for 3 s,
 * like a stuck player trying the other way, then holds on again. Mashes jump in the cocoon.
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

  constructor(readonly seed: number) {}

  decide(o: Obs, scene: Scene): number {
    const f = o.frame;
    if (o.shut) return f % 8 < 2 ? J : 0;
    if (o.held) return 0;
    // Caught by a lure: mash jump (beats her free).
    if (o.lured) return dirBit(this.dir) | (f % 6 < 2 ? J : 0);
    // The way on: right, until an exit is in view (then toward it).
    const exit = o.exits[0];
    if (exit && !this.exitSeen) {
      this.exitSeen = true;
      this.dir = exit.point.x >= o.feetX ? 1 : -1;
      this.best = Number.NEGATIVE_INFINITY;
    }
    let dir = this.dir;
    const prog = o.feetX * this.dir;
    if (prog > this.best + 32) {
      this.best = prog;
      this.bestAt = f;
    } else if (f - this.bestAt > 480 && f > this.turnUntil) {
      this.turnUntil = f + 180;
      this.bestAt = f + 180;
      this.notes.push(`f${f}: no headway for 8 s at x ${Math.round(o.feetX)}, turned round for 3 s`);
    }
    if (f < this.turnUntil) dir = -this.dir;
    const p = o.p;
    if (f >= this.jumpUntil + 1 && p.grounded && (p.wallDir === dir || !groundAhead(scene, o, dir, 12)))
      this.jumpUntil = f + 14;
    return dirBit(dir) | (f < this.jumpUntil ? J : 0);
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
}

/** Something to go to. `leave`: on arriving, keep going that way (off an end, into an exit). */
interface Target {
  key: string;
  why: string;
  x: number;
  y: number;
  stand: (s: Surface) => boolean;
  leave?: number;
  /** Also arrived when this is true (a pickup taken, a light seen up close). */
  done?: (o: Obs) => boolean;
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
  private air: Move | null = null;
  private airTo: Surface | null = null;
  private mindNow: Mind | null = null;
  private jumpUntil = -1;
  private lastMask = 0;
  private djUsed = false;
  private moveSince = 0;
  private moveKey = '';
  private readonly tries = new Map<string, number>();
  private readonly given = new Set<string>();
  private readonly visited = new Set<string>();
  private readonly pickupsSeen = new Map<string, { x: number; y: number }>();
  private readonly pickupsGone = new Set<string>();
  private readonly lightsSeen = new Map<string, { x: number; y: number }>();
  private readonly lightsVisited = new Set<string>();
  private readonly exitsSeen = new Map<string, { x: number; y: number; edge: string }>();
  private nextStop = 0;
  private stopUntil = -1;
  private lookUntil = -1;
  private lookedAt = '';
  private waited = 0;
  private targetSince = 0;
  private wayOn = 1;
  private idleSince = -1;
  finished = false;

  constructor(
    readonly name: string,
    seed: number,
    private readonly opt: PlannerOpts,
  ) {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    this.rng = { rng: seedRng(seed ^ h) };
    this.nextStop = this.range(opt.stopEvery);
  }

  private range(r?: [number, number]): number {
    if (!r) return 0;
    return r[0] + rngInt(this.rng, Math.max(1, r[1] - r[0]));
  }

  private mind(o: Obs, scene: Scene): Mind {
    let m = this.minds.get(o.room);
    if (!m || m.scene !== scene) {
      m = new Mind(scene, this.opt.knowsAll);
      this.minds.set(o.room, m);
      this.target = null;
      this.route = null;
    }
    return m;
  }

  decide(o: Obs, scene: Scene): number {
    const mask = this.think(o, scene);
    this.lastMask = mask;
    return mask;
  }

  private think(o: Obs, scene: Scene): number {
    const f = o.frame;
    if (o.shut) return this.hatch(o);
    if (o.held) {
      this.air = null;
      return 0;
    }
    if (o.lured) {
      this.air = null;
      // Caught by a lure: a fighter cuts the flame (it goes out), the rest beat free with jump; a dash frees at once.
      if (this.opt.dash && o.abilities.includes('dash') && !(this.lastMask & X)) return X;
      return f % 6 < 2 ? (this.opt.slash ? A : J) : 0;
    }
    const mind = this.mind(o, scene);
    this.mindNow = mind;
    mind.see(o.solids, o.oneWays, o.abilities, o.tops);
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
    if (p.grounded && this.opt.waitForCreatures) {
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
    return this.fly(o, scene, mind, t) | slash;
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
      (q) => q.kind === 'lures' && !q.out && Math.abs(q.x - o.feetX) < 110 && Math.abs(q.y - cy) < 130,
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
    const cands = this.candidates(o, mind).filter((c) => !this.given.has(c.key));
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
      this.itinerary.push({
        f,
        why: next.why,
        x: Math.round(next.x),
        y: Math.round(next.y),
      });
      this.target = next;
      this.targetSince = f;
      this.route = null;
    }
    return this.target;
  }

  private candidates(o: Obs, mind: Mind): Array<Target & { rank: number }> {
    const out: Array<Target & { rank: number }> = [];
    const exits = [...this.exitsSeen.entries()].map(([id, e]) => this.exitTarget(mind, id, e));
    if (this.opt.pick === 'exit' && exits.length > 0) return exits.map((e) => ({ ...e, rank: 0 }));
    if (this.opt.pick === 'forward' || this.opt.pick === 'exit') {
      if (exits.length > 0) return exits.map((e) => ({ ...e, rank: 0 }));
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
    for (const c of this.frontier(o, mind, false)) out.push({ ...c, rank: c.leave ? 2 : 1 });
    for (const e of exits) out.push({ ...e, rank: 3 });
    return out;
  }

  /** Ground it has seen and not walked (cells of 256 px), and ends with nothing known beyond them. */
  private frontier(o: Obs, mind: Mind, forwardOnly: boolean): Target[] {
    mind.refresh();
    const out: Target[] = [];
    for (const s of mind.surfaces) {
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
          stand: (q) => same(q, s),
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
    return out;
  }

  private exitTarget(mind: Mind, id: string, e: { x: number; y: number; edge: string }): Target {
    const s = mind.standFor(e.x, e.edge === 's' ? e.y - 400 : e.y);
    const dir = e.edge === 'w' ? -1 : e.edge === 'e' ? 1 : s ? (e.x >= (s.x0 + s.x1) / 2 ? 1 : -1) : 1;
    const ex = s ? (dir > 0 ? s.x1 : s.x0) : e.x;
    return {
      key: `exit:${id}`,
      why: `exit ${id}`,
      x: ex - dir * 24,
      y: s ? yAt(s, ex) : e.y,
      stand: (q) => same(q, s),
      leave: dir,
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
    this.notes.push(`f${f}: gave up on ${t.why}: ${why}`);
    this.target = null;
    this.route = null;
  }

  private fly(o: Obs, scene: Scene, mind: Mind, t: Target): number {
    const p = o.p;
    const f = o.frame;
    if (f - this.targetSince > 60 * 45) {
      this.giveUp(t, 'not reached in 45 s', f);
      return 0;
    }
    if (!p.grounded) return this.steerAir(o, t);
    // Landed: did the move in flight work?
    const cur = mind.under(o.feetX, o.feetY);
    if (this.air) {
      const m = this.air;
      this.air = null;
      const ok = same(cur, this.airTo);
      if (!ok) this.failed(m, f, `landed elsewhere (${Math.round(o.feetX)}, ${Math.round(o.feetY)})`, mind);
      this.route = null;
    }
    if (!cur) return this.wander(o, scene);
    if (t.stand(cur)) return this.finish(o, scene, t);
    const version = `${mind.surfaces.length}:${mind.moves.length}:${mind.bad.size}`;
    if (!this.route || this.routeFrom !== cur.id || this.routeVersion !== version) {
      this.route = mind.route(cur.id, t.stand);
      this.routeFrom = cur.id;
      this.routeVersion = version;
      if (!this.route) {
        this.giveUp(t, 'no route on what it has seen', f);
        return this.wander(o, scene);
      }
    }
    const m = this.route[0];
    if (!m) return this.finish(o, scene, t);
    return this.approach(o, scene, mind, m);
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

  /** On the move's surface: go to its launch point, then go. */
  private approach(o: Obs, scene: Scene, mind: Mind, m: Move): number {
    const p = o.p;
    const f = o.frame;
    const k = moveKey(m);
    if (k !== this.moveKey) {
      this.moveKey = k;
      this.moveSince = f;
    } else if (f - this.moveSince > 60 * 8) {
      this.failed(m, f, 'could not get to it in 8 s', mind);
      this.failed(m, f, 'could not get to it in 8 s', mind);
      this.route = null;
      this.moveKey = '';
      return 0;
    }
    if (m.kind === 'through') return f % 4 < 2 ? D | J : D;
    if (m.kind === 'up') {
      const dx = m.launchX - o.feetX;
      if (Math.abs(dx) > 14) return dirBit(Math.sign(dx)) | this.run(o, scene, Math.sign(dx), Math.abs(dx));
      return this.jump(o, m);
    }
    // Distance to the end (negative: her body already hangs over it).
    const d = m.dir > 0 ? m.launchX - o.feetX : o.feetX - m.launchX;
    if (p.wallDir === m.dir && m.kind === 'jump') return dirBit(m.dir) | this.jump(o, m);
    const edgeStop = this.edgeLook(o, m, d);
    if (edgeStop >= 0) return edgeStop;
    if (m.kind === 'walk' || m.kind === 'drop') return dirBit(m.dir);
    if (d <= this.opt.edge + Math.abs(p.vx) * 0.5) return dirBit(m.dir) | this.jump(o, m);
    return dirBit(m.dir) | this.run(o, scene, m.dir, d);
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
    // Creep: walk in pulses near the edge.
    if (this.lookedAt === k && d < 70 && d > this.opt.edge + 2) return f % 6 < 3 ? dirBit(m.dir) : 0;
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

  private jump(o: Obs, m: Move): number {
    const f = o.frame;
    if (this.lastMask & J) return 0; // a press needs a release first
    this.air = m;
    this.airTo = this.mindNow?.surfaces.find((s) => s.id === m.to) ?? null;
    this.djUsed = false;
    // A hop (short hold) for a short gap down: a lower arc lands sooner. Up, or far: the full jump.
    const hop = this.opt.hop && m.kind === 'jump' && m.rise > 16 && m.gap < 260;
    this.jumpUntil = f + (hop ? Math.min(this.opt.hold, 9) : this.opt.hold);
    return J;
  }

  private steerAir(o: Obs, t: Target): number {
    const p = o.p;
    const f = o.frame;
    const m = this.air;
    let mask = 0;
    const to = m ? this.airTo : null;
    if (to && m) {
      const top = yAt(to, Math.max(to.x0, Math.min(to.x1, o.feetX)));
      const inX = o.feetX > to.x0 + 28 && o.feetX < to.x1 - 28;
      if (m.kind === 'up' && o.feetY > top - 4 && !inX) {
        // Rise beside it first, then over it.
        mask |= o.feetY < top + 40 ? dirBit(m.dir) : 0;
      } else if (!inX) mask |= dirBit(o.feetX < to.x0 + 28 ? 1 : -1);
      else {
        const tx = Math.max(to.x0 + 40, Math.min(to.x1 - 40, t.x));
        mask |= Math.abs(tx - o.feetX) > 24 ? dirBit(Math.sign(tx - o.feetX)) : 0;
      }
      const hold = f < this.jumpUntil;
      // Sail on (glide) while short of it; a second jump at the apex when it is still above her.
      const far = !inX && p.vy > 0 && o.abilities.includes('glide');
      if (hold || far) mask |= J;
      if (
        !hold &&
        !this.djUsed &&
        p.vy > -1 &&
        (o.feetY > top - 8 || Math.abs(to.x0 - o.feetX) > 360 || !inX) &&
        o.abilities.includes('doubleJump') &&
        p.dj > 0
      ) {
        if (this.lastMask & J) mask &= ~J;
        else {
          mask |= J;
          this.djUsed = true;
          this.jumpUntil = f + this.opt.hold;
        }
      }
      return mask;
    }
    // Off the end it meant to leave by: keep going that way.
    if (t.leave && (o.feetX - t.x) * t.leave > -16) mask |= dirBit(t.leave);
    // Falling with no plan: steer toward the target.
    else if (Math.abs(t.x - o.feetX) > 24) mask |= dirBit(Math.sign(t.x - o.feetX));
    if (f < this.jumpUntil) mask |= J;
    return mask;
  }

  /** On the target's surface: walk to it; take a hanging pickup with a jump; leave the way it says. */
  private finish(o: Obs, scene: Scene, t: Target): number {
    const p = o.p;
    const f = o.frame;
    const dx = t.x - o.feetX;
    if (t.leave) {
      if ((o.feetX - t.x) * t.leave > -16) {
        // At the end: go on, jumping off it (a player leaps rather than walks into the dark).
        if (f >= this.jumpUntil + 1 && p.grounded && !groundAhead(scene, o, t.leave, this.opt.edge))
          this.jumpUntil = f + this.opt.hold;
        if (p.grounded && p.wallDir === t.leave && f >= this.jumpUntil + 1)
          this.jumpUntil = f + this.opt.hold;
        return dirBit(t.leave) | (f < this.jumpUntil ? J : 0);
      }
      return dirBit(Math.sign(dx)) | this.run(o, scene, Math.sign(dx), Math.abs(dx));
    }
    if (Math.abs(dx) > 20) return dirBit(Math.sign(dx)) | this.run(o, scene, Math.sign(dx), Math.abs(dx));
    // Under it: a pickup or a light above her head wants a jump.
    if (t.y < o.feetY - 60 && !(this.lastMask & J)) {
      this.jumpUntil = f + this.opt.hold;
      return J;
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
