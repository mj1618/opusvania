/**
 * The firefly's passes and the freed moths' roosts (the Canopy r10, review r9 #2; memory/canopy.md "The premise").
 *
 *  - **A pass** (`scene.fireflies`): the story's firefly is "a light that flees and relights lamps behind her" (Kuro's
 *    first pass in Ori). Her box centre in a pass's `trigger`, on the ground (she lands there), the first time (its
 *    `flag` not saved) saves the flag and starts it: the firefly flies the `path` at a steady speed over `frames` (`state.kit.firefly`: which pass,
 *    frames in, where it is now). Each lamp of `relights` it passes within `kit.firefly.relightPx` of while that lamp
 *    is out (not smouldering behind a chain) burns again. No control is taken from her; nothing it does hurts.
 *  - **Roosts** (`scene.roosts`): where the moths of a freed trap lamp (`room:id` in `save.snuffed`) gather in this
 *    room. `roostsLit` says which; render draws them settled.
 *
 * Pure: + - * / sqrt, min, max (memory/sim-architecture.md).
 */
import type { SimEvent } from './events';
import type { FireflyPass, Roost } from './kit-data';
import { flameAt, lureHpMax } from './lures';
import type { Scene } from './scene';
import type { GameState, SaveState } from './state';
import type { Tuning } from './tuning';

/** The firefly in this room now (room-local, `state.kit.firefly`): `pass` -1 = none flying. */
export interface FireflyState {
  /** Index in `scene.fireflies` of the pass under way, -1 = none. */
  pass: number;
  /** Frames into it. */
  frame: number;
  /** Where it is now (world px, the light's centre). */
  x: number;
  y: number;
}

export function createFirefly(): FireflyState {
  return { pass: -1, frame: 0, x: 0, y: 0 };
}

/** The point `d` px along `path` (into `out`). */
function along(
  path: ReadonlyArray<readonly [number, number]>,
  d: number,
  out: { x: number; y: number },
): void {
  let left = d;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as readonly [number, number];
    const b = path[i] as readonly [number, number];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (left <= len || i === path.length - 1) {
      const k = len > 0 ? Math.min(1, left / len) : 1;
      out.x = a[0] + dx * k;
      out.y = a[1] + dy * k;
      return;
    }
    left -= len;
  }
  const last = path[path.length - 1] as readonly [number, number];
  out.x = last[0];
  out.y = last[1];
}

/** A path's length, px. */
export function pathLength(path: ReadonlyArray<readonly [number, number]>): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as readonly [number, number];
    const b = path[i] as readonly [number, number];
    n += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
  }
  return n;
}

const AT = { x: 0, y: 0 };
const FL = { x: 0, y: 0 };

/** Where pass `f` is `frame` frames in (into `out`): render may call it with an interpolated frame. */
export function fireflyAt(f: FireflyPass, frame: number, out: { x: number; y: number } = { x: 0, y: 0 }) {
  const k = Math.max(0, Math.min(1, frame / Math.max(1, f.frames)));
  along(f.path, pathLength(f.path) * k, out);
  return out;
}

/** Starts a pass when she enters its trigger, moves the one under way, relights the lamps it passes. */
export function updateFireflies(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): void {
  const list = scene.fireflies;
  if (!list || list.length === 0) return;
  const ff = state.kit.firefly;
  const p = state.player;
  if (ff.pass < 0 && p.faded === 0 && p.grounded) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    for (let i = 0; i < list.length; i++) {
      const f = list[i] as FireflyPass;
      const r = f.trigger;
      if (cx < r.x || cx >= r.x + r.w || cy < r.y || cy >= r.y + r.h) continue;
      if (state.save.flags.includes(f.flag)) continue;
      state.save.flags.push(f.flag);
      ff.pass = i;
      ff.frame = 0;
      fireflyAt(f, 0, AT);
      ff.x = AT.x;
      ff.y = AT.y;
      events.push({ type: 'fireflyStart', id: f.id, x: AT.x, y: AT.y, frames: f.frames });
      events.push({ type: 'flagSet', flag: f.flag, by: f.id, x: AT.x, y: AT.y });
      break;
    }
  }
  if (ff.pass < 0) return;
  const f = list[ff.pass];
  if (!f) {
    ff.pass = -1;
    return;
  }
  ff.frame++;
  fireflyAt(f, ff.frame, AT);
  ff.x = AT.x;
  ff.y = AT.y;
  const lures = scene.lures ?? [];
  const R = t.kit.firefly.relightPx;
  for (const id of f.relights ?? []) {
    const i = lures.findIndex((l) => l.id === id);
    const l = lures[i];
    if (!l || l.trap) continue;
    const s = state.lures;
    if ((s.hp[i] ?? 0) > 0 || s.ember[i]) continue;
    const fl = flameAt(s, i, l, state.frame, t, FL);
    if ((fl.x - AT.x) * (fl.x - AT.x) + (fl.y - AT.y) * (fl.y - AT.y) > R * R) continue;
    s.hp[i] = lureHpMax(l, t);
    s.out[i] = 0;
    events.push({ type: 'lureRelight', id: l.id, x: fl.x, y: fl.y, by: 'firefly' });
    events.push({ type: 'fireflyRelight', id: f.id, lure: l.id, x: fl.x, y: fl.y });
  }
  if (ff.frame >= f.frames) {
    events.push({ type: 'fireflyEnd', id: f.id, x: AT.x, y: AT.y });
    ff.pass = -1;
    ff.frame = 0;
  }
}

/** Is roost `r` lit (its trap lamp freed)? */
export function roostLit(r: Roost, save: SaveState): boolean {
  return save.snuffed.includes(r.lure);
}

/** The roosts of this room whose trap lamps she has freed, in the room's order (render draws a settled cloud on each). */
export function roostsLit(scene: Scene, save: SaveState): Roost[] {
  return (scene.roosts ?? []).filter((r) => roostLit(r, save));
}
