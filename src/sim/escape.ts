/**
 * The full escape (the Canopy r14, moment 7 of docs/design/levels/canopy-moments.md; memory/canopy.md v14): after the
 * great release the den's roof gives, and she climbs out ahead of it. `scene.escape` (src/sim/kit-data.ts `Escape`)
 * says where it runs, its checkpoints, its rocks (keyed to her progress) and its collapse front (rising under her at
 * her pace). Room-local state `state.kit.escape`; render and audio read it and the events (src/sim/kit-events.ts).
 *
 * Fair by construction: nothing in it costs a light. A rock or the front holds her a beat (`escapeHit`) and puts her
 * back on the last checkpoint she stood on (`escapeBack`, from the catch in src/sim/index.ts), and every rock past
 * that checkpoint is armed again, so the same escape plays again from there.
 *
 * Pure (memory/sim-architecture.md).
 */
import type { SimEvent } from './events';
import type { Escape, EscapeBox } from './kit-data';
import type { Scene } from './scene';
import type { GameState } from './state';
import type { Tuning } from './tuning';

/** The escape's live state (room-local: rebuilt on every entry). */
export interface EscapeState {
  /** 0 not begun, 1 under way, 2 over (its `sets` is saved). */
  on: number;
  /** Frames since it began (or since the last return). */
  t: number;
  /** The last checkpoint she stood on (index in `scene.escape.checkpoints`). */
  cp: number;
  /** The collapse front: running (`frontOn` 1), its top y. `stand`: the feet y she last stood at (it follows that). */
  frontOn: number;
  front: number;
  stand: number;
  /** The Canopy r15: 1 once her centre has been in the front's `start` box (it waits for that; 1 with no box). */
  go: number;
  /** Per rock: 0 armed, 1 the tell, 2 falling, 3 down; frames in that stage; its bottom y while it falls. */
  rock: number[];
  rockT: number[];
  rockY: number[];
}

export function createEscape(scene: Scene): EscapeState {
  const n = scene.escape?.rocks.length ?? 0;
  return {
    on: 0,
    t: 0,
    cp: 0,
    frontOn: 0,
    front: 0,
    stand: 0,
    go: 0,
    rock: new Array<number>(n).fill(0),
    rockT: new Array<number>(n).fill(0),
    rockY: new Array<number>(n).fill(0),
  };
}

export function cloneEscape(e: EscapeState): EscapeState {
  return { ...e, rock: e.rock.slice(), rockT: e.rockT.slice(), rockY: e.rockY.slice() };
}

function inBox(b: EscapeBox, x: number, y: number): boolean {
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

/** A falling rock's box: `w` square over its bottom `y` at its centre `x`. */
function rockBox(r: { x: number; w: number }, y: number): EscapeBox {
  return { x: r.x - r.w / 2, y: y - r.w, w: r.w, h: r.w };
}

/** Arms every rock that plays after checkpoint `cp` (or a later one) again. */
function rearm(s: EscapeState, E: Escape, cp: number): void {
  for (let i = 0; i < E.rocks.length; i++) {
    const r = E.rocks[i];
    if (!r || r.cp < cp) continue;
    s.rock[i] = 0;
    s.rockT[i] = 0;
    s.rockY[i] = 0;
  }
}

/** The front after a (re)start at checkpoint `cp`: off if the checkpoint is low, else `lag` under it. */
function frontAt(s: EscapeState, E: Escape, cp: number, events: SimEvent[]): void {
  const F = E.front;
  if (!F) return;
  const c = E.checkpoints[cp];
  const on = !!c && c.y <= F.y0 - F.lag;
  if (s.frontOn === 1 && !on)
    events.push({
      type: 'collapseFront',
      id: E.id,
      phase: 'stop',
      y: Math.round(s.front),
      x0: F.x0,
      x1: F.x1,
    });
  if (on && c) {
    const y = Math.min(F.y0, c.y + F.lag);
    if (s.frontOn === 0)
      events.push({ type: 'collapseFront', id: E.id, phase: 'start', y, x0: F.x0, x1: F.x1 });
    s.front = y;
  }
  s.frontOn = on ? 1 : 0;
}

/** Rotten bark `id` comes down for good (`barkBreak` by the escape). */
function shake(state: GameState, scene: Scene, id: string, events: SimEvent[]): void {
  const bark = scene.bark ?? [];
  const i = bark.findIndex((b) => b.id === id);
  const b = bark[i];
  if (!b || (state.kit.bark[i] ?? 0) <= 0) return;
  state.kit.bark[i] = 0;
  const k = `${scene.id}:${b.id}`;
  if (!state.save.opened.includes(k)) state.save.opened.push(k);
  events.push({
    type: 'barkBreak',
    id: b.id,
    x: b.x + b.w / 2,
    y: b.y + b.h / 2,
    w: b.w,
    h: b.h,
    dir: 'down',
    floor: !!b.floor,
    by: 'escape',
  });
}

/** A hazard caught her (`what`: a rock's id, or 'front'): held, then back to the last checkpoint. */
function hit(state: GameState, E: Escape, what: string, t: Tuning, events: SimEvent[]): void {
  const p = state.player;
  const frames = Math.max(1, Math.round(t.kit.escape.hitFrames));
  state.caught = { id: `escape:${what}`, frames: 0 };
  state.kit.hold = frames;
  events.push({
    type: 'escapeHit',
    id: E.id,
    what,
    x: Math.round(p.x + p.w / 2),
    y: Math.round(p.y + p.h),
    frames,
  });
}

/**
 * One step of the escape (src/sim/kit.ts `updateKit`, after her move): it begins, checkpoints mark, rocks tell and
 * fall, the front rises, a hazard that meets her holds her (`state.caught`), and it ends at `end`.
 */
export function updateEscape(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const E = scene.escape;
  if (!E) return;
  const s = state.kit.escape;
  if (s.on === 2) return;
  const flags = state.save.flags;
  if (flags.includes(E.sets)) {
    s.on = 2;
    return;
  }
  if (!flags.includes(E.after)) return;
  const p = state.player;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  const fy = p.y + p.h;
  if (s.on === 0) {
    if (p.faded > 0 || !inBox(E.area, cx, cy)) return;
    s.on = 1;
    s.t = 0;
    s.cp = 0;
    s.stand = fy;
    rearm(s, E, 0);
    events.push({ type: 'escapeStart', id: E.id, x: Math.round(cx), y: Math.round(fy) });
    // (The Canopy r15: the collapse shakes rotten bark on the way down (the clifftop chimney's plug).)
    for (const id of E.breaks ?? []) shake(state, scene, id, events);
  }
  // (Held after a hit, or crossing out: nothing moves.)
  if (state.caught || state.exit || p.faded > 0) return;
  s.t++;
  if (E.end && inBox(E.end, cx, cy)) {
    s.on = 2;
    if (!flags.includes(E.sets)) {
      flags.push(E.sets);
      events.push({ type: 'flagSet', flag: E.sets, by: E.id, x: Math.round(cx), y: Math.round(fy) });
    }
    if (s.frontOn === 1 && E.front)
      events.push({
        type: 'collapseFront',
        id: E.id,
        phase: 'stop',
        y: Math.round(s.front),
        x0: E.front.x0,
        x1: E.front.x1,
      });
    s.frontOn = 0;
    events.push({ type: 'escapeEnd', id: E.id, x: Math.round(cx), y: Math.round(fy) });
    return;
  }
  // Checkpoints: the furthest she has reached (in its rect, landed or passing).
  for (let i = s.cp + 1; i < E.checkpoints.length; i++) {
    const c = E.checkpoints[i];
    if (!c || !inBox(c.at, cx, cy)) continue;
    s.cp = i;
    events.push({ type: 'escapeCheckpoint', id: E.id, cp: i, x: c.x, y: c.y });
  }
  const T = t.kit.escape;
  const safe = p.invuln > 0 || p.hp <= 0;
  // The rocks.
  for (let i = 0; i < E.rocks.length; i++) {
    const r = E.rocks[i];
    if (!r) continue;
    const st = s.rock[i] ?? 0;
    if (st === 0) {
      if (!inBox(r.when, cx, cy)) continue;
      s.rock[i] = 1;
      s.rockT[i] = 0;
      s.rockY[i] = r.y0;
      events.push({ type: 'rockfall', id: r.id, phase: 'tell', x: r.x, y: r.y0, w: r.w, tell: r.tell });
      continue;
    }
    if (st === 1) {
      const n = (s.rockT[i] ?? 0) + 1;
      s.rockT[i] = n;
      if (n < r.tell) continue;
      s.rock[i] = 2;
      s.rockT[i] = 0;
      s.rockY[i] = r.y0 + r.w;
      events.push({ type: 'rockfall', id: r.id, phase: 'fall', x: r.x, y: r.y0, w: r.w, tell: r.tell });
      continue;
    }
    if (st !== 2) continue;
    const n = (s.rockT[i] ?? 0) + 1;
    s.rockT[i] = n;
    const v = Math.min(T.rockMax, T.rockSpeed + T.rockAccel * n);
    const y = Math.min(r.y1, (s.rockY[i] ?? r.y0) + v);
    s.rockY[i] = y;
    const b = rockBox(r, y);
    const k = T.rockInset;
    if (!safe && p.x < b.x + b.w - k && b.x + k < p.x + p.w && p.y < b.y + b.h - k && b.y + k < p.y + p.h) {
      hit(state, E, r.id, t, events);
      return;
    }
    if (y >= r.y1) {
      s.rock[i] = 3;
      events.push({ type: 'rockfall', id: r.id, phase: 'land', x: r.x, y: r.y1, w: r.w, tell: r.tell });
    }
  }
  // The front.
  const F = E.front;
  if (!F) return;
  // (It waits for her at its start box: the chimney's foot, the Canopy r15.)
  if (s.go === 0) {
    if (F.start && !inBox(F.start, cx, cy)) return;
    s.go = 1;
    s.stand = fy;
  }
  // (It follows where she stands, not her jumps: a jump that falls back to her perch never meets it. The Canopy r15:
  // and where she holds a wall, so it climbs a chimney with her.)
  if (p.grounded || p.mode === 'wallSlide' || s.stand === 0) s.stand = fy;
  const sy = s.stand;
  if (s.frontOn === 0) {
    if (sy > F.y0 - F.lag) return;
    s.frontOn = 1;
    s.front = F.y0;
    events.push({ type: 'collapseFront', id: E.id, phase: 'start', y: F.y0, x0: F.x0, x1: F.x1 });
  }
  // (It rises toward `lag` under her feet at most `speed`; within that it creeps closer, never nearer than `near`; it
  // never goes back down: a fall meets it.)
  const target = sy + F.lag;
  const f = s.front > target ? Math.max(target, s.front - F.speed) : Math.max(sy + F.near, s.front - F.creep);
  s.front = Math.max(F.top, Math.min(s.front, f));
  if (!safe && cx >= F.x0 && cx < F.x1 && fy > s.front + T.frontGrace) hit(state, E, 'front', t, events);
}

/**
 * Where an escape hit puts her back (`fallReturn` id `escape:*`): the last checkpoint she stood on. Everything past it
 * plays again: its rocks are armed, the front starts again under it.
 */
export function escapeBack(
  state: GameState,
  scene: Scene,
  events: SimEvent[],
): { x: number; y: number } | null {
  const E = scene.escape;
  if (!E) return null;
  const s = state.kit.escape;
  const c = E.checkpoints[s.cp] ?? E.checkpoints[0];
  if (!c) return null;
  rearm(s, E, s.cp);
  frontAt(s, E, s.cp, events);
  s.stand = c.y;
  s.t = 0;
  events.push({ type: 'escapeStart', id: E.id, x: c.x, y: c.y });
  return { x: c.x, y: c.y };
}
