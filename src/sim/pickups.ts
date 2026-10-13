/**
 * Collectibles: glints of light that hang in the scene (`scene.pickups`).
 *
 * The rule, all in integers and frames:
 *  - A waiting pickup wakes when it is within `wakePx` of the player's collision box (distance to
 *    the nearest point of the box). From then on it is hers: it is collected exactly `frames`
 *    steps later wherever she is by then. Render uses that time for the flight.
 *  - Pickups that wake close together go in one after another: each is collected at least
 *    `staggerFrames` after the one before, nearest first, so a cluster plays like a scale.
 *  - `combo` counts up through a run of pickups that are less than `comboFrames` apart.
 *
 * The scene's list is static; the state holds one timer per pickup (see PickupsState).
 */
import type { SimEvent } from './events';
import type { Scene } from './scene';
import type { GameState, PickupsState } from './state';
import type { Tuning } from './tuning';

export const PICKUP_WAITING = 0;
export const PICKUP_TAKEN = -1;

export function createPickups(scene: Scene): PickupsState {
  const n = scene.pickups?.length ?? 0;
  const timers: number[] = [];
  for (let i = 0; i < n; i++) timers.push(PICKUP_WAITING);
  return {
    timers,
    count: 0,
    spent: 0,
    lost: 0,
    drops: [],
    dropSeq: 0,
    taken: 0,
    combo: 0,
    comboTimer: 0,
    gate: 0,
  };
}

/** Total value of every pickup in the scene. */
export function pickupsWorth(scene: Scene, t: Tuning['pickups']): number {
  let sum = 0;
  for (const p of scene.pickups ?? []) sum += p.kind === 'great' ? t.greatValue : 1;
  return sum;
}

export function updatePickups(
  state: GameState,
  scene: Scene,
  t: Tuning['pickups'],
  events: SimEvent[],
): void {
  const list = scene.pickups;
  if (!list || list.length === 0) return;
  const s = state.pickups;
  const timers = s.timers;
  const b = state.player;
  const right = b.x + b.w;
  const bottom = b.y + b.h;

  if (s.gate > 0) s.gate--;
  if (s.comboTimer > 0) s.comboTimer--;

  // Those already on their way: count down, collect at zero.
  for (let i = 0; i < list.length; i++) {
    const left = timers[i] as number;
    if (left <= 0) continue;
    if (left > 1) {
      timers[i] = left - 1;
      continue;
    }
    const p = list[i];
    if (!p) continue;
    timers[i] = PICKUP_TAKEN;
    const value = p.kind === 'great' ? t.greatValue : 1;
    s.combo = s.comboTimer > 0 ? s.combo + 1 : 0;
    s.comboTimer = t.comboFrames;
    s.count += value;
    s.taken++;
    events.push({
      type: 'pickup',
      id: p.id,
      kind: p.kind,
      value,
      x: p.x,
      y: p.y,
      px: b.x + (b.w >> 1),
      py: b.y + (b.h >> 1),
      combo: s.combo,
      total: s.count,
    });
  }

  // Wake the ones in reach, nearest first (ties: scene order), each queued behind the last.
  for (;;) {
    let best = -1;
    let bestD = 0;
    for (let i = 0; i < list.length; i++) {
      if (timers[i] !== PICKUP_WAITING) continue;
      const p = list[i];
      if (!p) continue;
      const dx = p.x < b.x ? b.x - p.x : p.x > right ? p.x - right : 0;
      const dy = p.y < b.y ? b.y - p.y : p.y > bottom ? p.y - bottom : 0;
      const r = p.kind === 'great' ? t.greatWakePx : t.wakePx;
      const d = dx * dx + dy * dy;
      if (d > r * r) continue;
      if (best < 0 || d < bestD) {
        best = i;
        bestD = d;
      }
    }
    if (best < 0) break;
    const p = list[best];
    if (!p) break;
    const own = Math.max(1, Math.round(p.kind === 'great' ? t.greatFrames : t.flightFrames));
    const frames = Math.max(own, s.gate + Math.max(0, Math.round(t.staggerFrames)));
    timers[best] = frames;
    s.gate = frames;
    events.push({ type: 'pickupWake', id: p.id, kind: p.kind, x: p.x, y: p.y, frames });
  }
}

/**
 * The cost of a fade: a share of her wallet (`fadeDrop`, rounded down) is left as a cluster where
 * her body lies, settled onto whatever is under it. Called as she re-forms, before she is moved.
 */
export function dropGlints(state: GameState, scene: Scene, share: number, events: SimEvent[]): void {
  const s = state.pickups;
  const value = Math.max(0, Math.min(s.count, Math.floor(s.count * share + 1e-6)));
  if (value <= 0) return;
  const b = state.player;
  let y = b.y;
  for (let i = 0; i < scene.height && !rests(scene, b.x, y, b.w, b.h); i++) y++;
  const drop = { id: ++s.dropSeq, x: b.x + (b.w >> 1), y: y + (b.h >> 1), value, left: value, timer: 0 };
  s.count -= value;
  s.lost += value;
  s.drops.push(drop);
  events.push({ type: 'glintsDrop', id: drop.id, x: drop.x, y: drop.y, value, wallet: s.count });
}

/** Does a box at (x, y) rest on something (a solid, a one-way, the scene's floor)? */
function rests(scene: Scene, x: number, y: number, w: number, h: number): boolean {
  const bottom = y + h;
  if (bottom >= scene.height) return true;
  for (const q of scene.solids) if (q.y === bottom && x < q.x + q.w && q.x < x + w) return true;
  for (const q of scene.oneWays) if (q.y === bottom && x < q.x + q.w && q.x < x + w) return true;
  return false;
}

/**
 * Dropped clusters: one she touches (within `wakePx` of her body, while she is whole enough to
 * walk) comes back to her a glint at a time, as `pickup` events with `drop: true`.
 */
export function updateDrops(state: GameState, t: Tuning['pickups'], events: SimEvent[]): void {
  const s = state.pickups;
  if (s.drops.length === 0) return;
  const b = state.player;
  const alive = b.hp > 0 && b.faded === 0;
  for (let i = 0; i < s.drops.length; i++) {
    const d = s.drops[i];
    if (!d) continue;
    if (d.timer === 0) {
      if (!alive) continue;
      const dx = d.x < b.x ? b.x - d.x : d.x > b.x + b.w ? d.x - (b.x + b.w) : 0;
      const dy = d.y < b.y ? b.y - d.y : d.y > b.y + b.h ? d.y - (b.y + b.h) : 0;
      if (dx * dx + dy * dy > t.wakePx * t.wakePx) continue;
      d.timer = Math.max(1, Math.round(t.dropFrames));
      events.push({
        type: 'dropWake',
        id: d.id,
        x: d.x,
        y: d.y,
        value: d.left,
        frames: d.timer,
        stagger: Math.max(1, Math.round(t.dropStagger)),
      });
      continue;
    }
    if (--d.timer > 0) continue;
    d.left--;
    s.count++;
    s.lost--;
    s.combo = s.comboTimer > 0 ? s.combo + 1 : 0;
    s.comboTimer = t.comboFrames;
    events.push({
      type: 'pickup',
      id: `drop-${d.id}`,
      kind: 'glint',
      value: 1,
      x: d.x,
      y: d.y,
      px: b.x + (b.w >> 1),
      py: b.y + (b.h >> 1),
      combo: s.combo,
      total: s.count,
      drop: true,
    });
    if (d.left > 0) d.timer = Math.max(1, Math.round(t.dropStagger));
    else {
      s.drops.splice(i, 1);
      i--;
    }
  }
}
