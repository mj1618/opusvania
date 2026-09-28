import { oneWayUnder, solidAt } from '../physics/aabb';
import type { GameState } from '../state';
import type { Room } from './rooms';

/**
 * Dynamic solids (L3 brief §2.6). Room tiles are immutable and shared; armed humming objects,
 * materialised slabs and closed gates are solid through this flat scratch list instead. It is a
 * pure function of the state, rebuilt at the start of every step (and after a room load), never
 * persisted, and allocation-free. Entries: x, y, w, h, id (id lets an entity skip itself).
 *
 * Module-level scratch is safe for determinism because every reader runs inside the step that
 * rebuilt it (tools that branch states just step them; each step rebuilds first).
 */
const STRIDE = 5;
let cap = 64;
let data = new Int32Array(cap * STRIDE);
let count = 0;

function push(x: number, y: number, w: number, h: number, id: number): void {
  if (count >= cap) {
    const next = new Int32Array(cap * 2 * STRIDE);
    next.set(data);
    data = next;
    cap *= 2;
  }
  const o = count * STRIDE;
  data[o] = x;
  data[o + 1] = y;
  data[o + 2] = w;
  data[o + 3] = h;
  data[o + 4] = id;
  count++;
}

/** Rebuilds the dynamic solid list from state (step 3 of the per-step order). */
export function rebuildSolids(state: GameState, ts: number): void {
  count = 0;
  const L = state.local;
  for (const s of L.sources)
    if (s.kind === 'object' && s.solidWhenArmed && !s.ghost) push(s.x, s.y, s.w, s.h, s.id);
  for (const l of L.levied) if (l.solid) push(l.x, l.y, l.w, l.h, l.id);
  for (const g of L.gates) {
    if (g.open) continue;
    for (let i = 0; i < g.tiles.length; i += 2)
      push((g.tiles[i] as number) * ts, (g.tiles[i + 1] as number) * ts, ts, ts, 0);
  }
}

/** Does a w×h box at (x, y) overlap a dynamic solid (other than entity `exclude`)? Hot path. */
export function dynSolidAt(x: number, y: number, w: number, h: number, exclude = -1): boolean {
  for (let i = 0, o = 0; i < count; i++, o += STRIDE) {
    if (data[o + 4] === exclude) continue;
    const rx = data[o] as number;
    const ry = data[o + 1] as number;
    if (x < rx + (data[o + 2] as number) && rx < x + w && y < ry + (data[o + 3] as number) && ry < y + h)
      return true;
  }
  return false;
}

/** Tiles or dynamic solids. What every actor collides with. */
export function solidAny(room: Room, ts: number, x: number, y: number, w: number, h: number): boolean {
  return solidAt(room, ts, x, y, w, h) || dynSolidAt(x, y, w, h);
}

/** Standing on something (tile, one-way or dynamic solid) if the box were at (x, y). */
export function groundAny(
  room: Room,
  ts: number,
  x: number,
  y: number,
  w: number,
  h: number,
  exclude = -1,
): boolean {
  return (
    solidAt(room, ts, x, y + 1, w, h) ||
    dynSolidAt(x, y + 1, w, h, exclude) ||
    oneWayUnder(room, ts, x, y, w, h)
  );
}

/** Number of dynamic solids (tests, debug). */
export function dynSolidCount(): number {
  return count;
}
