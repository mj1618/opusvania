/**
 * Lines: how a planning persona carries out one move of its route (a gap, a drop, a climb), and the
 * look-ahead that picks one. A line is a small closed-loop controller (state in, buttons out). Before a
 * move, the persona builds the candidate lines its hands know (plain jump, hop, jump-glide, walk-off
 * glide, double jump, wall climb, kick-glide across to the other face, a wait for a creature) and plays
 * each forward in a copy of the sim (`simulate`): the one that lands on the target soonest, with the
 * fewest hits and catches, is the one it plays for real. Thorns, a lure's pull, a creature's dive and a
 * kick:false face all show up in the look-ahead, so the line is chosen round them (or, if no clean line
 * exists, through a lure's catch and throw on purpose).
 *
 * The look-ahead sees the whole sim (the room past the view, a creature's timers): it stands for a
 * player's judgement of a jump they can see, and it is only used for a move between surfaces the
 * persona already knows (or, for a climb into the unknown, only to keep her off thorns). Pure: Node and
 * the page.
 */
import type { SimEvent } from '../../src/sim/events';
import { cloneState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { kickableAt, solidAt } from '../../src/sim/physics/aabb';
import type { Scene } from '../../src/sim/scene';
import type { GameState } from '../../src/sim/state';
import type { Tuning } from '../../src/sim/tuning';
import type { World } from '../../src/sim/world';
import { type Face, facesOf, type Move, type Surface, topUnder } from './map';

const L = ActionBit.left;
const R = ActionBit.right;
const D = ActionBit.down;
const J = ActionBit.jump;
const X = ActionBit.dash;
const A = ActionBit.attack;

export function dirBit(dir: number): number {
  return dir > 0 ? R : dir < 0 ? L : 0;
}

/** What a persona may use to look ahead: the sim as it stands (a copy is stepped, never this one). */
export interface SimCtx {
  state: GameState;
  tuning: Tuning;
  /** The world (rooms linked by their exits): a look-ahead that crosses an exit goes on in the next room. */
  world?: World;
}

/** A controller for one move. `act` is called once a frame, `k` = frames since the line started. */
export interface Line {
  readonly name: string;
  /** Frames after which the line has failed. */
  readonly max: number;
  act(s: GameState, k: number, prev: number): number;
}

/** Where a line must end. */
export type Goal =
  | { kind: 'surface'; surface: Surface }
  /** Any ground at least `rise` px above where she started (a climb into what she cannot see yet), or an exit. */
  | { kind: 'rise'; fromY: number; rise: number; through?: boolean }
  /** Off an end into what it cannot see: down on any ground but the start (or through an exit). */
  | { kind: 'leap' }
  /** Out through exit `id` of room `room`, and down on ground in the room it leads to (a climb out of a shaft). */
  | { kind: 'exit'; id: string; room: string };

export interface Outcome {
  ok: boolean;
  frames: number;
  hits: number;
  caught: number;
  why: string;
  x: number;
  y: number;
}

function feet(s: GameState): { x: number; y: number } {
  const p = s.player;
  return { x: p.x + p.w / 2, y: p.y + p.h };
}

/** Standing on `surf` (the same rule as the map's `surfaceAt`). */
export function onSurface(s: GameState, surf: Surface): boolean {
  const p = s.player;
  if (!p.grounded) return false;
  const f = feet(s);
  // Feet over it (not just her box's edge on its end: abutting surfaces at one height would both count).
  const m = Math.min(8, (surf.x1 - surf.x0) / 4);
  if (f.x < surf.x0 + m || f.x > surf.x1 - m) return false;
  return Math.abs(topUnder(surf, f.x) - f.y) <= 6;
}

/** Down at the height of `surf`, just past one of its ends at most (the floor under a cut wall, a lip's last pixels). */
export function nearSurface(s: GameState, surf: Surface | null, slack = 96): boolean {
  if (!surf) return false;
  const f = feet(s);
  if (f.x < surf.x0 - slack || f.x > surf.x1 + slack) return false;
  return Math.abs(topUnder(surf, Math.max(surf.x0, Math.min(surf.x1, f.x))) - f.y) <= 12;
}

/** Down on a bounce cap's top (a touch, not a landing: it throws her up the next frame). */
export function onCap(s: GameState, scene: Scene): boolean {
  const f = feet(s);
  return (scene.caps ?? []).some((c) => f.x > c.x - 24 && f.x < c.x + c.w + 24 && Math.abs(f.y - c.y) <= 6);
}

function caughtNow(s: GameState): boolean {
  const p = s.player as unknown as { lure?: number; grab?: number };
  return (p.lure ?? -1) >= 0 || (p.grab ?? -1) >= 0;
}

/** Plays `line` in a copy of the sim from `ctx.state`; `start` is the surface she sets out from. */
export function simulate(ctx: SimCtx, scene: Scene, line: Line, start: Surface | null, goal: Goal): Outcome {
  const s = cloneState(ctx.state);
  const ev: SimEvent[] = [];
  let prev = s.prevInput;
  let hits = 0;
  let caught = 0;
  let left = false;
  // A climb out through the top (an exit, or a climb into the unknown that comes out of the room) goes on
  // in the next room: it is through once she stands there.
  const world = goal.kind === 'exit' || goal.kind === 'rise' ? ctx.world : undefined;
  const room0 = ctx.state.room;
  for (let k = 0; k < line.max; k++) {
    const mask = line.act(s, k, prev);
    prev = mask;
    ev.length = 0;
    const sc = world ? (world.rooms[s.room]?.scene ?? scene) : scene;
    step(s, mask, ctx.tuning, sc, ev, world);
    const f = feet(s);
    for (const e of ev) {
      if (e.type === 'hurt') hits++;
      if ((e.type as string) === 'lureCaught' || (e.type as string) === 'grab') caught++;
      if (e.type === 'fallCatch' || e.type === 'fade' || (e.type as string) === 'thornHold')
        return { ok: false, frames: k, hits, caught, why: e.type, x: f.x, y: f.y };
      // No world to cross into (a test room): out by the exit is the end of it.
      if (e.type === 'roomExit' && goal.kind === 'exit' && !world)
        return { ok: e.id === goal.id, frames: k, hits, caught, why: `exit ${e.id}`, x: f.x, y: f.y };
      if (e.type === 'roomExit' && goal.kind === 'exit') {
        if (e.id !== goal.id || s.room !== goal.room)
          return { ok: false, frames: k, hits, caught, why: `exit ${e.id}`, x: f.x, y: f.y };
        continue;
      }
      if (e.type === 'roomExit') {
        // Out by an exit: fine for a climb into the unknown (on into the next room, with a world), never
        // for a leap, never by a one-way drop by chance.
        const oneWay = (sc.exits ?? []).some((q) => q.id === e.id && q.oneWay === true);
        const ok = goal.kind === 'rise' && !!goal.through && !oneWay;
        if (ok && world) continue;
        return { ok, frames: k, hits, caught, why: `exit ${e.id}`, x: f.x, y: f.y };
      }
    }
    if (s.caught) return { ok: false, frames: k, hits, caught, why: 'held', x: f.x, y: f.y };
    const p = s.player;
    if (!p.grounded) left = true;
    if (p.grounded && !caughtNow(s) && !onCap(s, sc)) {
      if (goal.kind === 'exit') {
        // Through: standing in the next room, not just set down at its seam.
        const h = world?.rooms[s.room]?.scene.height ?? Number.POSITIVE_INFINITY;
        if (s.room !== goal.room && !s.exit && p.contactFrames >= 6 && f.y < h - 32)
          return { ok: true, frames: k, hits, caught, why: 'through', x: f.x, y: f.y };
        if (s.room !== goal.room) continue;
        continue;
      }
      if (goal.kind === 'surface' && onSurface(s, goal.surface))
        return { ok: true, frames: k, hits, caught, why: 'landed', x: f.x, y: f.y };
      if (goal.kind === 'rise' && s.room !== room0) {
        const h = world?.rooms[s.room]?.scene.height ?? Number.POSITIVE_INFINITY;
        if (!s.exit && p.contactFrames >= 6 && f.y < h - 32)
          return { ok: true, frames: k, hits, caught, why: 'through', x: f.x, y: f.y };
        continue;
      }
      if (goal.kind === 'rise' && f.y <= goal.fromY - goal.rise)
        return { ok: true, frames: k, hits, caught, why: 'rose', x: f.x, y: f.y };
      // Down somewhere else after setting out: not this line (unless any ground will do).
      const home = nearSurface(s, start) || (goal.kind === 'surface' && nearSurface(s, goal.surface));
      if (left && !home && goal.kind === 'leap')
        return { ok: true, frames: k, hits, caught, why: 'landed', x: f.x, y: f.y };
      if (left && !home && goal.kind === 'surface')
        return { ok: false, frames: k, hits, caught, why: 'landed elsewhere', x: f.x, y: f.y };
    }
  }
  const f = feet(s);
  return { ok: false, frames: line.max, hits, caught, why: 'too long', x: f.x, y: f.y };
}

/** How a persona weighs a line (lower is better). */
export function score(o: Outcome, wait = 0): number {
  return o.frames + wait + 600 * o.hits + 240 * o.caught;
}

// ---- The pieces lines are made of.

/** Seed-case right under her feet, within the down cut's reach (the pogo). */
function pogoUnder(s: GameState, scene: Scene, ahead = 0): boolean {
  const p = s.player;
  if (p.grounded) return false;
  const f0 = feet(s);
  const f = { x: f0.x + p.vx * ahead, y: f0.y + p.vy * ahead };
  return (scene.seedCases ?? []).some(
    (q) => Math.abs(q.x - f.x) < 60 && q.y - 28 - f.y > -12 && q.y - 28 - f.y < 60,
  );
}

/** Pressed against standing rotten bark she faces: a cut. */
function barkAhead(s: GameState, scene: Scene): boolean {
  const p = s.player;
  const edge = p.facing > 0 ? p.x + p.w : p.x;
  return (scene.bark ?? []).some((b) => {
    if (b.floor) return false;
    const face = p.facing > 0 ? b.x : b.x + b.w;
    return Math.abs(edge - face) <= 4 && p.y < b.y + b.h && p.y + p.h > b.y;
  });
}

/** Caught by a lure or a web: cut (a fighter: the flame goes out) or beat free with jump. */
function caughtMask(k: number, cut: boolean): number {
  return k % 6 < 2 ? (cut ? A : J) : 0;
}

const U = ActionBit.up;
/** The eight ways the stick can hold (the throw goes exactly along the one held). */
const AIMS = [R, R | U, U, L | U, L, L | D, D, R | D];

/** Where a throw should take her: a point, and the surface to land on when there is one. */
export interface ThrowGoal {
  x: number;
  y: number;
  surface?: Surface | null;
}

/**
 * How good the throw's drawn arc (`player.lureArc`, body-centre points) is for `goal` (lower is better): landing on
 * the goal's surface near its x is best; else the distance from where the arc ends; through thorns, never.
 */
export function arcScore(arc: readonly number[], scene: Scene, goal: ThrowGoal, halfH: number): number {
  const n = arc.length >> 1;
  if (n < 2) return Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const x = arc[2 * i] ?? 0;
    const y = arc[2 * i + 1] ?? 0;
    if (
      (scene.thorns ?? []).some(
        (t) => x > t.x - 16 && x < t.x + t.w + 16 && y + halfH > t.y - 8 && y < t.y + t.h,
      )
    )
      return 1e6;
  }
  const lx = arc[2 * n - 2] ?? 0;
  const ly = (arc[2 * n - 1] ?? 0) + halfH;
  const g = goal.surface;
  if (g && lx > g.x0 + 8 && lx < g.x1 - 8 && Math.abs(ly - topUnder(g, lx)) < 48)
    return Math.abs(lx - goal.x) * 0.1;
  return Math.hypot(lx - goal.x, ly - goal.y) + (g ? 400 : 0);
}

/**
 * Caught by a lamp, beating free with the throw aimed: the stick swept over the ways toward the goal (each held
 * `per` frames, its drawn arc read: what a player sees), the beats given meanwhile, the last one when the arc held
 * is as good as the best seen (or the orbit has gone round once). `per` 1 for a bot, ~3 for a person.
 */
export class Aim {
  private order: number[] = [];
  private readonly scores = new Map<number, number>();
  private since = -1;
  private k0 = 0;

  constructor(
    private readonly goal: () => ThrowGoal | null,
    private readonly per = 1,
  ) {}

  act(s: GameState, scene: Scene, k: number, prev: number): number {
    const p = s.player;
    const g = this.goal();
    if (!g) return k % 6 < 2 ? J : 0;
    if (this.since < 0) {
      this.since = k;
      this.k0 = k;
      const a = Math.atan2(-(g.y - (p.y + p.h / 2)), g.x - (p.x + p.w / 2));
      const ang = (m: number) =>
        Math.atan2((m & U ? 1 : 0) - (m & D ? 1 : 0), (m & R ? 1 : 0) - (m & L ? 1 : 0));
      const off = (m: number) => Math.abs(Math.atan2(Math.sin(ang(m) - a), Math.cos(ang(m) - a)));
      // The ways within 100 degrees of the goal, nearest first (a person does not try away from it).
      this.order = AIMS.filter((m) => off(m) <= 1.75).sort((x, y) => off(x) - off(y));
    }
    // The arc drawn now is for what was held last step.
    const held = (s.prevInput as number) & (L | R | U | D);
    const sc = arcScore(p.lureArc, scene, g, p.h / 2);
    if (held) this.scores.set(held, Math.min(sc, this.scores.get(held) ?? Number.POSITIVE_INFINITY));
    const i = Math.floor((k - this.k0) / this.per);
    const of = s.save.flags.includes('upgrade:quickWings') ? 2 : 3;
    const last = p.lureBeats >= of - 1;
    const beat = !(prev & J) && p.lureCd === 0;
    if (i < this.order.length) {
      // Sweeping: hold the next way; give the beats before the last.
      const m = this.order[i] ?? 0;
      return m | (!last && beat ? J : 0);
    }
    let best = this.order[0] ?? 0;
    for (const [m, v] of this.scores) if (v < (this.scores.get(best) ?? Number.POSITIVE_INFINITY)) best = m;
    const bestScore = this.scores.get(best) ?? Number.POSITIVE_INFINITY;
    if (!last) return best | (beat ? J : 0);
    // The last beat: when the arc held is about the best seen, or after an orbit's wait.
    const good = held === best && sc <= bestScore + 40;
    return best | (beat && (good || k - this.since > 60) ? J : 0);
  }

  /** Free again: the next catch sweeps afresh. */
  reset(): void {
    this.since = -1;
    this.scores.clear();
  }
}

/** Steering in the air onto `to`, toward `tx` once over it (no `to`: on toward `tx`). */
function steer(s: GameState, to: Surface | null, tx: number, rising: { dir: number } | null): number {
  const f = feet(s);
  if (!to) return Math.abs(tx - f.x) > 24 ? dirBit(Math.sign(tx - f.x)) : 0;
  const top = topUnder(to, Math.max(to.x0, Math.min(to.x1, f.x)));
  const inX = f.x > to.x0 + 28 && f.x < to.x1 - 28;
  if (rising && f.y > top - 4 && !inX) return f.y < top + 40 ? dirBit(rising.dir) : 0;
  if (!inX) return dirBit(f.x < to.x0 + 28 ? 1 : -1);
  const x = Math.max(to.x0 + 40, Math.min(to.x1 - 40, tx));
  return Math.abs(x - f.x) > 24 ? dirBit(Math.sign(x - f.x)) : 0;
}

export interface Hands {
  /** Jump this many px before the end (persona's own habit). */
  edge: number;
  /** Frames of a full jump hold. */
  hold: number;
  /** Dashes on long clear runs. */
  dash: boolean;
  /** Caught: cut the flame (true) or beat free with jump. */
  cut: boolean;
  /** Frames each way of the stick is held while reading the throw's arc (1 a bot; a person ~3). */
  aimPer?: number;
  /**
   * Frames a person presses ahead of what they see (their own delay, learnt): edges and pogos are judged where
   * she will be that many frames on. 0 for the bots.
   */
  anticipate?: number;
}

export interface JumpParams {
  /** Into this lamp's flame (steered at it until caught; the throw is then aimed at `to`). */
  lure?: { x: number; y: number };
  /** With `lure`: a down cut on the flame as she comes down onto it (snuffed, a pogo bounce), not caught. */
  lureCut?: boolean;
  launchX: number;
  dir: number;
  /** Press this many px before the launch point (0 for an `up`: at the spot). */
  edge: number;
  hold: number;
  /** Keep jump held through the fall (the wings open below the launch height). */
  glide: boolean;
  /** A second jump at the apex. */
  dj: boolean;
  /** Walk off the end instead of jumping (with jump held when `glide`). */
  walkOff: boolean;
  /** Stand still this many frames first (let a creature pass, let the camera show the way). */
  wait: number;
  pogo: boolean;
  /** An `up` move: rise beside the target first, then over it. */
  up: boolean;
  /** A drop through a one-way. */
  through: boolean;
  /** Stop at the launch point first and jump from a stand (a narrow step, a short hop). */
  brake?: boolean;
}

/** A jump, hop, walk-off, glide or drop onto `to` (null: a leap on toward `tx`). */
export function jumpLine(
  name: string,
  scene: Scene,
  to: Surface | null,
  tx: number,
  q: JumpParams,
  hands: Hands,
  max = 420,
): Line {
  let launched = false;
  let start = 0;
  let djUsed = false;
  let y0 = 0;
  let thrownBy = false;
  let cutDone = false;
  // Caught by a lamp on the way: the throw aimed at where the line goes.
  const aim = new Aim(
    () => ({
      x: to ? Math.max(to.x0 + 40, Math.min(to.x1 - 40, tx)) : tx,
      y: to ? topUnder(to, Math.max(to.x0 + 40, Math.min(to.x1 - 40, tx))) : y0,
      surface: to,
    }),
    hands.aimPer ?? 1,
  );
  return {
    name,
    max,
    act(s, k, prev) {
      const p = s.player;
      if (k === 0) y0 = feet(s).y;
      if (p.lure >= 0) {
        thrownBy = true;
        return aim.act(s, scene, k, prev);
      }
      aim.reset();
      if (caughtNow(s)) return caughtMask(k, hands.cut);
      if (k < q.wait) return 0;
      if (q.through) return k % 4 < 2 ? D | J : D;
      const f = feet(s);
      if (p.grounded && barkAhead(s, scene) && !(prev & A)) return A;
      // Down again on the way (a bump, a short hop): set out again from here.
      if (launched && p.grounded && k - start > 6) launched = false;
      if (!launched) {
        if (p.grounded) {
          if (q.up) {
            const dx = q.launchX - f.x;
            if (Math.abs(dx) > 14) return dirBit(Math.sign(dx));
            if (prev & J) return 0;
            launched = true;
            start = k;
            return J | dirBit(q.dir);
          }
          const d = q.dir > 0 ? q.launchX - f.x : f.x - q.launchX;
          // A walk-off glide: jump already held from a glide before is kept (a fresh press here would jump).
          if (q.walkOff) return dirBit(q.dir) | (q.glide && prev & J ? J : 0);
          if (q.brake && d <= q.edge + 40 && Math.abs(p.vx) > 0.5) return 0;
          // (Taps of two frames: a one-frame tap through a person's hands does not move her.)
          if (q.brake && d > q.edge + 4 && d <= q.edge + 40) return k % 4 < 2 ? dirBit(q.dir) : 0;
          // (A standing hop goes from where she has stopped, close enough: a person does not inch to the pixel.)
          const settled = !!q.brake && d <= q.edge + 28 && Math.abs(p.vx) <= 0.5;
          if (
            d <= q.edge + Math.abs(p.vx) * (0.5 + (hands.anticipate ?? 0)) ||
            p.wallDir === q.dir ||
            settled
          ) {
            if (prev & J) return dirBit(q.dir);
            launched = true;
            start = k;
            return dirBit(q.dir) | J;
          }
          let m = dirBit(q.dir);
          if (hands.dash && d > 420 && p.dashCd === 0 && !(prev & X) && s.save.abilities.includes('dash'))
            if (solidAt(scene, q.dir > 0 ? p.x + p.w + 300 : p.x - 301, p.y + p.h, 1, 16)) m |= X;
          return m;
        }
        // In the air before the press: walked off (or ran off a frame early: coyote frames take the jump).
        if (q.walkOff) {
          launched = true;
          start = k;
        } else if (p.contactFrames <= 4 && !(prev & J)) {
          launched = true;
          start = k;
          return dirBit(q.dir) | J;
        } else launched = true;
      }
      let m =
        q.lure && !thrownBy && !cutDone
          ? Math.abs(q.lure.x - f.x) > 12
            ? dirBit(Math.sign(q.lure.x - f.x))
            : 0
          : steer(s, to, tx, q.up ? { dir: q.dir } : null);
      if (q.lure && q.lureCut && !cutDone && !p.grounded) {
        // The flame under her, inside the down cut's reach: cut down on it (the bounce carries her on).
        const below = q.lure.y - (p.y + p.h / 2);
        if (below > 10 && below < 110 && Math.abs(q.lure.x - f.x) < 50 && p.vy > 0 && !(prev & A)) {
          cutDone = true;
          return m | A | D;
        }
      }
      const hold = !q.walkOff && k - start < (q.pogo ? 4 : q.hold);
      // Wings: held through the fall; after a walk-off, pressed once the coyote frames are past (a press
      // inside them is a jump).
      const wings = q.glide && (q.walkOff ? prev & J || p.contactFrames >= 8 : p.vy > 0);
      if (hold || wings) m |= J;
      if (q.dj && !djUsed && !hold && p.vy > -1 && p.dj > 0) {
        if (prev & J) m &= ~J;
        else {
          m |= J;
          djUsed = true;
          start = k;
        }
      }
      if (q.pogo && pogoUnder(s, scene, hands.anticipate ?? 0) && !(prev & A)) m |= A | D;
      return m;
    },
  };
}

/** Is the face at x kickable at height y (the sim's own test, a box beside it)? */
function kickable(scene: Scene, x: number, w: number, y: number): boolean {
  // The solid is on her `w` side of the face: test a sliver just inside it.
  return kickableAt(scene, w > 0 ? x : x - 2, y - 96, 2, 96);
}

export interface ClimbParams {
  /** The face she climbs first and the way she holds into it. */
  faceX: number;
  w: number;
  /** Across to the face opposite (x) once her feet are above `atY`: a kick away with the wings open. */
  across?: { x: number; atY: number };
  wait: number;
  /** The scene of a room she is carried into (an exit at the top of the shaft): climb on there. */
  next?: (room: string) => Scene | undefined;
  /** Slide this many frames on the wall before each kick (shifts where the kicks fall: the last one under a seam). */
  kickDelay?: number;
}

/**
 * A wall climb (memory/movement-controller.md: one wall is enough): hold into the face, press jump each
 * time she slides; she is thrown out ~145 px and comes back ~230 px higher. `across`: at a height, kick
 * away from it and glide (jump held) to the opposite face, then climb that one. Over the top of the target,
 * onto it.
 */
export function climbLine(
  name: string,
  scene: Scene,
  goal: Goal,
  tx: number,
  q: ClimbParams,
  hands: Hands,
  max = 900,
): Line {
  let w = q.w;
  let faceX = q.faceX;
  let crossing = false;
  let crossed = false;
  let tapUntil = -1;
  let touched = false;
  const aim = new Aim(
    () =>
      goal.kind === 'surface'
        ? {
            x: Math.max(goal.surface.x0 + 40, Math.min(goal.surface.x1 - 40, tx)),
            y: topUnder(goal.surface, tx),
            surface: goal.surface,
          }
        : { x: tx, y: goal.kind === 'rise' ? goal.fromY - goal.rise : 0 },
    hands.aimPer ?? 1,
  );
  let room0 = '';
  let slideSince = -1;
  let nextRoom = '';
  let nextScene: Scene | null = null;
  return {
    name,
    max,
    act(s, k, prev) {
      const p = s.player;
      if (s.player.lure >= 0) return aim.act(s, scene, k, prev);
      aim.reset();
      if (caughtNow(s)) return caughtMask(k, hands.cut);
      if (k < q.wait) return 0;
      const f = feet(s);
      // Carried into the next room (a shaft that goes on): climb the nearest face there, onto ground.
      if (room0 === '') room0 = s.room;
      if (s.room !== room0 && q.next) {
        if (s.exit) return dirBit(w);
        if (nextRoom !== s.room) {
          nextRoom = s.room;
          const sc = q.next(s.room);
          const near = sc
            ? facesOf(
                sc,
                sc.solids.map((_, i) => i),
              ).filter((fc) => fc.y0 < f.y && fc.y1 > f.y - 300)
            : [];
          near.sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x));
          const fc = near[0];
          if (fc) {
            faceX = fc.x;
            w = fc.w;
            touched = true;
            nextScene = sc ?? null;
          }
        }
        if (p.grounded) return 0;
        const onW =
          p.mode === 'wallSlide' || (p.wallDir === w && !!nextScene && kickable(nextScene, faceX, w, f.y));
        let m = dirBit(w);
        if (k < tapUntil) m |= J;
        else if (onW && !(prev & J)) {
          tapUntil = k + 4;
          m |= J;
        } else if (p.vy > -1 && !onW) m = dirBit(-w) | (p.vy > 0 ? J : 0);
        return m;
      }
      const topY =
        goal.kind === 'surface'
          ? topUnder(goal.surface, Math.max(goal.surface.x0, Math.min(goal.surface.x1, f.x)))
          : -1e9;
      // Above the target's top: onto it.
      if (goal.kind === 'surface' && !p.grounded && f.y < topY - 12) {
        const m = steer(s, goal.surface, tx, null);
        return m | (p.vy > 0 && s.save.abilities.includes('glide') ? J : 0);
      }
      if (p.grounded) {
        if (barkAhead(s, scene) && !(prev & A)) return A;
        const standX = faceX - w * 26;
        const dx = standX - f.x;
        if (p.wallDir === w || Math.abs(dx) < 10) {
          if (prev & J) return dirBit(w);
          // A full jump straight up: the face may start above her head (a trunk over open floor).
          tapUntil = k + 22;
          touched = false;
          return J | (p.wallDir === w ? dirBit(w) : 0);
        }
        return dirBit(Math.sign(dx));
      }
      if (crossing) {
        // Kicked away: wings open, toward the other face; on it, climb it.
        if (p.wallDir === -w || p.mode === 'wallSlide') {
          crossing = false;
          crossed = true;
          w = -w;
          faceX = q.across?.x ?? faceX;
        } else return dirBit(-w) | J;
      }
      const onWall = p.mode === 'wallSlide' || (p.wallDir === w && kickable(scene, faceX, w, f.y));
      if (q.across && !crossed && onWall && f.y < q.across.atY && !(prev & J)) {
        crossing = true;
        return dirBit(-w) | J;
      }
      if (onWall) {
        touched = true;
        if (slideSince < 0) slideSince = k;
      } else slideSince = -1;
      const slid = slideSince >= 0 && k - slideSince >= (q.kickDelay ?? 0);
      // Rising to the face: into it only where it is kickable (or at the top of the jump).
      let m = touched || kickable(scene, faceX, w, f.y) || p.vy > -3 ? dirBit(w) : 0;
      if (k < tapUntil) m |= J;
      else if (onWall && slid && !(prev & J)) {
        tapUntil = k + 4;
        m |= J;
      }
      return m;
    },
  };
}

/** A rotten plug overhead (bark lying across a chimney): within an up cut's reach of her head. */
function plugAbove(s: GameState, scene: Scene): boolean {
  const p = s.player;
  return (scene.bark ?? []).some(
    (b) =>
      !b.floor &&
      b.w > b.h &&
      p.x < b.x + b.w &&
      p.x + p.w > b.x &&
      p.y >= b.y + b.h &&
      p.y - (b.y + b.h) < 120,
  );
}

export interface ZigParams {
  /** The face she jumps at first and the way she holds into it. */
  faceX: number;
  w: number;
  /** Kicks on that face before she starts kicking across (0: across at once). */
  n: number;
  /** Frames she first jumps away (out from under a lip, then back to a face that starts over her head). */
  away: number;
  wait: number;
}

/**
 * Up a chimney by kicks across (the Canopy r4, review r3 #1: thorns on alternate faces, so one face is not a
 * ladder): a full jump at the face, then at every wall touch a kick, after the first `n` holding away from the wall
 * she kicks off (toward the opposite face). A rotten plug overhead: up cuts through it. The explorer's `zig` macros
 * (tools/solve/explore.ts) with a person's stand point.
 */
export function zigLine(
  name: string,
  scene: Scene,
  goal: Goal,
  tx: number,
  q: ZigParams,
  hands: Hands,
  max = 1200,
): Line {
  let h = q.w;
  let kicks = 0;
  let started = -1;
  let tapUntil = -1;
  return {
    name,
    max,
    act(s, k, prev) {
      const p = s.player;
      if (caughtNow(s)) return caughtMask(k, hands.cut);
      if (k < q.wait) return 0;
      const f = feet(s);
      if (goal.kind === 'surface' && !p.grounded) {
        const topY = topUnder(goal.surface, Math.max(goal.surface.x0, Math.min(goal.surface.x1, f.x)));
        if (f.y < topY - 12)
          return steer(s, goal.surface, tx, null) | (p.vy > 0 && s.save.abilities.includes('glide') ? J : 0);
      }
      if (p.grounded) {
        if (started >= 0 && k - started > 20) {
          // Down again (a kick missed): start over from the stand point.
          h = q.w;
          kicks = 0;
          started = -1;
        }
        if (started < 0) {
          const standX = q.away ? q.faceX + q.w * 30 : q.faceX - q.w * 170;
          const dx = standX - f.x;
          if (Math.abs(dx) > 12) return dirBit(Math.sign(dx));
          started = k;
          tapUntil = k + 20;
          return J | dirBit(q.away ? -h : h);
        }
      }
      if (started < 0) return 0;
      let m = dirBit(k - started < q.away ? -h : h);
      if (k < tapUntil) m |= J;
      else if (k - started >= q.away && (p.mode === 'wallSlide' || p.wallDir === h) && !(prev & J)) {
        kicks++;
        if (kicks > q.n) h = -h;
        m = dirBit(h) | J;
        tapUntil = k + 4;
      }
      if (plugAbove(s, scene)) m |= U | (k % 12 < 2 ? A : 0);
      return m;
    },
  };
}

/** Chimney candidates up `faceX` (held `w`): only where an opposite face stands 200-700 px across. */
export function zigCandidates(
  scene: Scene,
  goal: Goal,
  tx: number,
  faceX: number,
  w: number,
  faces: readonly Face[],
  hands: Hands,
  wait = 0,
): Candidate[] {
  const opp = faces.find((fc) => fc.w === -w && (fc.x - faceX) * -w >= 200 && (fc.x - faceX) * -w <= 700);
  if (!opp) return [];
  const out: Candidate[] = [];
  // (Thorns on alternate faces work for one phase only: which face she jumps at first. A person tries both.)
  for (const [n, away] of [
    [0, 0],
    [1, 0],
    [0, 12],
    [2, 0],
  ] as const)
    for (const [fx, fw] of [
      [faceX, w],
      [opp.x, -w],
    ] as const) {
      const nm = `kick up the chimney (${fw === w ? 'this' : 'the far'} face first, ${n} on it${away ? ', out from under the lip' : ''})`;
      out.push({
        name: nm,
        make: () => zigLine(nm, scene, goal, tx, { faceX: fx, w: fw, n, away, wait }, hands),
      });
    }
  return out;
}

/** A candidate line: a fresh controller each time (one plays ahead, another for real). */
export interface Candidate {
  name: string;
  make: () => Line;
}

/** Candidate lines for a move, in the persona's order of preference. */
export function linesFor(
  m: Move,
  from: Surface,
  to: Surface,
  tx: number,
  scene: Scene,
  abilities: readonly string[],
  hands: Hands,
  opts: { waits: number[]; faces: Face[] },
): Candidate[] {
  const glide = abilities.includes('glide');
  const dj = abilities.includes('doubleJump');
  const out: Candidate[] = [];
  const base: JumpParams = {
    launchX: m.launchX,
    dir: m.dir,
    edge: hands.edge,
    hold: hands.hold,
    glide: false,
    dj: false,
    walkOff: false,
    wait: 0,
    pogo: !!m.pogo,
    up: false,
    through: false,
  };
  for (const wait of opts.waits) {
    const add = (name: string, q: Partial<JumpParams>, max?: number) => {
      const n = `${name}${wait ? ` after ${wait}f` : ''}`;
      out.push({ name: n, make: () => jumpLine(n, scene, to, tx, { ...base, ...q, wait }, hands, max) });
    };
    switch (m.kind) {
      case 'through':
        add('drop through', { through: true });
        break;
      case 'cut':
        add('cut through the bark', { walkOff: true }, 600);
        break;
      case 'walk':
      case 'drop':
        add('walk off', { walkOff: true });
        if (glide) add('walk-off glide', { walkOff: true, glide: true });
        add('hop off', { edge: hands.edge, hold: 6 });
        // A long way down: the wings, from a jump too (over a hazard a walk-off would sink into).
        if (glide && m.rise > 128)
          for (const h of [hands.hold, 10, 5])
            add(`jump-glide off (${h}f)`, { edge: hands.edge, hold: h, glide: true });
        break;
      case 'up':
        add('jump up', { up: true, edge: 0 });
        if (dj) add('jump up + double', { up: true, edge: 0, dj: true });
        break;
      case 'jump': {
        if (m.pogo) {
          add('pogo hop', { pogo: true });
          break;
        }
        // Into the lamp, then thrown (aimed) across: first, as the only way over this gap.
        if (m.lure) {
          for (const e of [hands.edge, 60, 140])
            add(`jump into the lamp (${e} px)`, { edge: e, lure: m.lure });
          add('walk off into the lamp', { walkOff: true, lure: m.lure });
          add('walk off, cut down on the lamp', { walkOff: true, lure: m.lure, lureCut: true, glide });
          add('hop, cut down on the lamp', { edge: hands.edge, hold: 6, lure: m.lure, lureCut: true, glide });
        }
        const edges = [hands.edge, 40, 110];
        const holds = [hands.hold, 10, 5];
        if (m.gap < 220)
          for (const h of [5, 9, 14]) add(`standing hop (${h}f)`, { brake: true, edge: 8, hold: h });
        for (const e of edges)
          for (const h of holds) {
            add(`jump (${e} px, ${h}f)`, { edge: e, hold: h });
            if (glide) add(`jump-glide (${e} px, ${h}f)`, { edge: e, hold: h, glide: true });
            if (dj) add(`jump + double (${e} px)`, { edge: e, hold: h, dj: true, glide });
          }
        if (m.rise > 0) {
          add('walk off', { walkOff: true });
          if (glide) add('walk-off glide', { walkOff: true, glide: true });
        }
        break;
      }
      case 'climb': {
        const goal: Goal = { kind: 'surface', surface: to };
        const faceX = m.faceX ?? m.launchX + m.dir * 26;
        const n = `wall climb${wait ? ` after ${wait}f` : ''}`;
        out.push({ name: n, make: () => climbLine(n, scene, goal, tx, { faceX, w: m.dir, wait }, hands) });
        out.push(...zigCandidates(scene, goal, tx, faceX, m.dir, opts.faces, hands, wait));
        // Across to an opposite face at a few heights (a broken face: slick or thorny higher up).
        const yA = topUnder(from, m.launchX);
        for (const fc of opts.faces) {
          if (fc.w !== -m.dir) continue;
          const gap = (fc.x - faceX) * -m.dir;
          if (gap < 120 || gap > 900) continue;
          if (fc.y0 > yA || fc.y1 < topUnder(to, tx) - 200) continue;
          for (const up of [200, 360, 520, 680, 840]) {
            const n = `climb, kick-glide across at ${up} up${wait ? ` after ${wait}f` : ''}`;
            const across = { x: fc.x, atY: yA - up };
            out.push({
              name: n,
              make: () => climbLine(n, scene, goal, tx, { faceX, w: m.dir, across, wait }, hands),
            });
          }
        }
        break;
      }
    }
  }
  return out;
}

/** Candidate leaps off an end into what it cannot see (toward `dir`): walk off, hop, jump, with the wings if owned. */
export function leapLines(
  launchX: number,
  dir: number,
  scene: Scene,
  abilities: readonly string[],
  hands: Hands,
  waits: number[],
): Candidate[] {
  const glide = abilities.includes('glide');
  const out: Candidate[] = [];
  const tx = launchX + dir * 4000;
  const base: JumpParams = {
    launchX,
    dir,
    edge: hands.edge,
    hold: hands.hold,
    glide: false,
    dj: false,
    walkOff: false,
    wait: 0,
    pogo: false,
    up: false,
    through: false,
  };
  for (const wait of waits) {
    const add = (name: string, q: Partial<JumpParams>) => {
      const n = `${name}${wait ? ` after ${wait}f` : ''}`;
      out.push({ name: n, make: () => jumpLine(n, scene, null, tx, { ...base, ...q, wait }, hands, 600) });
    };
    add('leap: walk off', { walkOff: true });
    add('leap: hop', { hold: 6 });
    add('leap: jump', {});
    if (glide) {
      add('leap: walk-off glide', { walkOff: true, glide: true });
      add('leap: jump-glide', { glide: true });
    }
  }
  return out;
}

export interface Choice {
  /** The best line that works; null when none of `tried` does. */
  cand: Candidate | null;
  outcome: Outcome;
  tried: number;
  /** Why the others failed, most common first (for the notes). */
  fails: string;
}

/** Plays every candidate ahead and returns the best that works (`cand` null: none does). */
export function chooseLine(
  ctx: SimCtx,
  scene: Scene,
  cands: readonly Candidate[],
  start: Surface | null,
  goal: Goal,
): Choice {
  let best: Choice | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const why = new Map<string, number>();
  for (const cand of cands) {
    const o = simulate(ctx, scene, cand.make(), start, goal);
    const dbg = (globalThis as { __ptDebug?: (s: string) => void }).__ptDebug;
    if (dbg)
      dbg(
        `f${ctx.state.frame} ${cand.name}: ${o.ok ? 'ok' : o.why} ${o.frames}f at ${Math.round(o.x)},${Math.round(o.y)} goal ${goal.kind === 'surface' ? `${goal.surface.x0}-${goal.surface.x1}@${goal.surface.pieces[0]?.y}` : 'rise'}`,
      );
    if (!o.ok) {
      why.set(o.why, (why.get(o.why) ?? 0) + 1);
      continue;
    }
    // A leap into the unknown: the farther on (and the higher) it comes down, the better (a glide over the
    // gap rather than a drop into what is under it).
    const p0 = ctx.state.player;
    const on =
      goal.kind === 'leap' ? Math.abs(o.x - (p0.x + p0.w / 2)) * 1.5 - (o.y - (p0.y + p0.h)) * 0.5 : 0;
    const sc = score(o) - on;
    if (sc < bestScore) {
      bestScore = sc;
      best = { cand, outcome: o, tried: cands.length, fails: '' };
    }
  }
  const fails = [...why.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${k}`)
    .join(', ');
  if (best) {
    best.fails = fails;
    return best;
  }
  const none: Outcome = { ok: false, frames: 0, hits: 0, caught: 0, why: fails, x: 0, y: 0 };
  return { cand: null, outcome: none, tried: cands.length, fails };
}

/**
 * A move onto a bounce cap that goes on off it (and off the caps after it) to `final`: the candidate's own
 * line takes her onto the first cap; jump is held as she meets each cap (the held bounce); after each bounce
 * she steers to the next cap, then onto `final` (wings open on the way down).
 */
export function capChain(cand: Candidate, caps: readonly Surface[], final: Surface, tx: number): Candidate {
  const name = `${cand.name}, off ${caps.length} cap(s)`;
  return {
    name,
    make: () => {
      const inner = cand.make();
      let i = 0;
      return {
        name,
        max: inner.max + 300 * caps.length,
        act(s, k, prev) {
          const p = s.player;
          const f = feet(s);
          const cap = caps[i];
          // Off cap i: on to the next.
          if (cap) {
            const top = cap.pieces[0]?.y ?? 0;
            const over = f.x > cap.x0 - 8 && f.x < cap.x1 + 8;
            if (over && Math.abs(f.y - top) < 40 && p.vy < -4) i++;
          }
          const next = caps[i];
          if (i === 0) {
            // Still on the way to the first cap: its own line, with jump held as she comes down onto it.
            let m = inner.act(s, k, prev);
            if (next && !p.grounded && p.vy > 0 && f.x > next.x0 - 40 && f.x < next.x1 + 40) m |= J;
            return m;
          }
          if (next) {
            const cx = (next.x0 + next.x1) / 2;
            let m = Math.abs(cx - f.x) > 10 ? dirBit(Math.sign(cx - f.x)) : 0;
            if (p.vy > 0) m |= J;
            return m;
          }
          let m = steer(s, final, tx, null);
          if (p.vy > 2 && s.save.abilities.includes('glide')) m |= J;
          return m;
        },
      };
    },
  };
}

/**
 * Up a run of bounce caps into what she cannot see yet (the hub's bracket caps): onto `first` from where
 * she stands (a jump if it is above her), then after each bounce on to the nearest cap below her within
 * reach (jump held as she meets it), until she comes down on ground. The look-ahead says if it goes.
 */
export function capClimbLine(
  name: string,
  scene: Scene,
  first: { x: number; y: number; w: number },
  hands: Hands,
  max = 900,
): Line {
  let last = -1;
  let jumpUntil = -1;
  return {
    name,
    max,
    act(s, k, prev) {
      const p = s.player;
      if (caughtNow(s)) return caughtMask(k, hands.cut);
      const f = feet(s);
      const caps = scene.caps ?? [];
      const cx = first.x + first.w / 2;
      if (p.grounded && !onCap(s, scene)) {
        // On the ground: under the first cap's side, then a full jump onto it (or walk off onto it).
        const dx = cx - f.x;
        if (first.y < f.y - 16) {
          // From beside it, not under it (the head would hit its underside): 50 px off its near end.
          let side = f.x >= cx ? 1 : -1;
          // Not out of the room (a cap by the door): the other side.
          if ((side < 0 && first.x - 50 < 30) || (side > 0 && first.x + first.w + 50 > scene.width - 30))
            side = -side;
          const spot = side > 0 ? first.x + first.w + 50 : first.x - 50;
          if (Math.abs(spot - f.x) > 12) return dirBit(Math.sign(spot - f.x));
          if (prev & J) return 0;
          jumpUntil = k + 22;
          return J;
        }
        return dirBit(Math.sign(dx));
      }
      // Off a cap just now: remember which (the next is another).
      caps.forEach((c, i) => {
        if (f.x > c.x - 8 && f.x < c.x + c.w + 8 && Math.abs(f.y - c.y) < 40 && p.vy < -4) last = i;
      });
      // The next: the nearest cap under her (or level) she can still come down on.
      let best = -1;
      let bd = Number.POSITIVE_INFINITY;
      // Caps she can still come down on: not above what is left of her rise, not too far below.
      const rise = p.vy < 0 ? (p.vy * p.vy) / 2.4 : 0;
      caps.forEach((c, i) => {
        if (i === last && caps.length > 1) return;
        if (c.y < f.y - rise - 8 || c.y > f.y + 700) return;
        const d = Math.abs(c.x + c.w / 2 - f.x) + Math.max(0, c.y - f.y) * 0.3;
        if (d < bd && Math.abs(c.x + c.w / 2 - f.x) < 760) {
          bd = d;
          best = i;
        }
      });
      const target =
        best >= 0 ? caps[best] : last < 0 ? (first as { x: number; y: number; w: number }) : null;
      let m = 0;
      // Rising beside a cap still above her feet: straight up until over its top, then onto it.
      const rising =
        last < 0 &&
        target &&
        target.y < f.y + 4 &&
        p.vy < 0 &&
        (f.x < target.x - 8 || f.x > target.x + target.w + 8);
      if (target && !rising) {
        const tcx = target.x + target.w / 2;
        if (Math.abs(tcx - f.x) > 10) m |= dirBit(Math.sign(tcx - f.x));
      }
      if (k < jumpUntil || p.vy > 0) m |= J;
      return m;
    },
  };
}
