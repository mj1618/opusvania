/**
 * Progress in a room (memory/world.md, memory/save.md): moon patches (rest, save, re-form point),
 * glades (an ability, once), shortcuts (open from one side), and what she has seen (the map). Each
 * writes to `state.save` and pushes the event the autosave and render listen for.
 *
 * Pure: plain data, + - * / floor round min max abs.
 */
import { normalizeAbilities } from './abilities';
import type { SimEvent } from './events';
import { ActionBit, type InputFrame, wasPressed } from './input';
import type { MoonPatch, Scene } from './scene';
import type { GameState } from './state';
import type { Tuning } from './tuning';
import { remember } from './world';

/** The patch box: `patch.width` wide, `patch.height` tall over its foot. */
export function patchBox(p: MoonPatch, t: Tuning): { x: number; y: number; w: number; h: number } {
  const w = Math.round(t.patch.width);
  const h = Math.round(t.patch.height);
  return { x: p.x - (w >> 1), y: p.y - h, w, h };
}

/** Index of the patch her feet stand in (grounded), -1 if none. */
function patchUnder(state: GameState, scene: Scene, t: Tuning): number {
  const list = scene.patches;
  if (!list) return -1;
  const p = state.player;
  if (!p.grounded) return -1;
  const fx = p.x + p.w / 2;
  const fy = p.y + p.h;
  for (let i = 0; i < list.length; i++) {
    // (A `mark` patch is a re-form point only: never a rest.)
    if ((list[i] as MoonPatch).mark) continue;
    const b = patchBox(list[i] as MoonPatch, t);
    if (fx >= b.x && fx < b.x + b.w && fy > b.y && fy <= b.y + b.h + 1) return i;
  }
  return -1;
}

/** Index of the patch her feet centre is inside (grounded or not), -1 if none. */
function patchThrough(state: GameState, scene: Scene, t: Tuning): number {
  const list = scene.patches;
  if (!list) return -1;
  const p = state.player;
  const fx = p.x + p.w / 2;
  const fy = p.y + p.h;
  for (let i = 0; i < list.length; i++) {
    const q = list[i] as MoonPatch;
    const b = q.area ?? patchBox(q, t);
    if (fx >= b.x && fx < b.x + b.w && fy > b.y && fy <= b.y + b.h + 1) return i;
  }
  return -1;
}

/** She rests at patch `i`: whole again, saved, her re-form point. */
export function restAt(state: GameState, scene: Scene, i: number, events: SimEvent[]): void {
  const patch = scene.patches?.[i];
  if (!patch) return;
  const p = state.player;
  p.hp = p.hpMax;
  state.save.patch = { room: scene.id, id: patch.id };
  state.rest = { at: i, frames: state.rest.at === i ? state.rest.frames : 0, done: true };
  events.push({ type: 'patchRest', id: patch.id, room: scene.id, x: patch.x, y: patch.y, hp: p.hp });
  // A map station (the Canopy r9): the map is shown, and the stones she carries are hung (one more each return).
  if (patch.map) events.push({ type: 'mapStation', id: patch.id, room: scene.id, x: patch.x, y: patch.y });
  const hangs = patch.hangs ?? [];
  for (const h of hangs) {
    if (!state.save.taken.includes(h.stone) || !remember(state.save.flags, h.flag)) continue;
    const hung = hangs.filter((q) => state.save.flags.includes(q.flag)).length;
    events.push({
      type: 'stoneHung',
      id: patch.id,
      stone: h.stone,
      flag: h.flag,
      hung,
      x: patch.x,
      y: patch.y,
    });
  }
}

/**
 * Moon patches: standing in one, grounded, still (no direction held) for `patch.restFrames`, or a press
 * of up in it, rests her once per stay (she steps out and back to rest again).
 */
export function updatePatches(
  state: GameState,
  scene: Scene,
  input: InputFrame,
  prev: InputFrame,
  t: Tuning,
  events: SimEvent[],
): void {
  const i = state.player.faded > 0 || state.player.hp <= 0 ? -1 : patchUnder(state, scene, t);
  // Passing through one (review r7 #4: a runner crossed the hollow's save and faded in the ambush two legs back) makes
  // it her re-form point, saved, without a rest: no health. In the air too (a hop over it counts).
  if (t.patch.markOnPass && state.player.faded === 0 && state.player.hp > 0) {
    const k = patchThrough(state, scene, t);
    const q = scene.patches?.[k];
    const cur = state.save.patch;
    // (A bench room, the Canopy r20: HK's bench is a stop. Only a `mark` patch or a boss's `retry` counts on a pass.)
    const passes = !scene.bench || q?.mark === true || q?.retry === true;
    if (q && (cur?.room !== scene.id || cur.id !== q.id)) {
      if (passes) {
        state.save.patch = { room: scene.id, id: q.id };
        events.push({ type: 'patchMark', id: q.id, room: scene.id, x: q.x, y: q.y });
      }
      // A map station opens the map on her first pass too (the Canopy r10, review r9 #9: it fired only on a rest, and
      // a runner never stopped); then on each rest. The save remembers the pass (`map:room:id` in flags). (In a bench
      // room the pass still opens it once, but marks nothing.)
      if (q.map && remember(state.save.flags, `map:${scene.id}:${q.id}`))
        events.push({ type: 'mapStation', id: q.id, room: scene.id, x: q.x, y: q.y });
    }
  }
  const r = state.rest;
  if (i !== r.at) {
    r.at = i;
    r.frames = 0;
    r.done = false;
  }
  if (i < 0) return;
  const still = state.player.inputX === 0 && state.player.vx === 0;
  r.frames = still ? r.frames + 1 : 0;
  if (r.done) return;
  if (r.frames >= Math.max(1, Math.round(t.patch.restFrames)) || wasPressed(input, prev, 'up'))
    restAt(state, scene, i, events);
}

/** Glades: her box centre inside one she has not taken gives its ability, once ever. */
export function updateGlades(state: GameState, scene: Scene, events: SimEvent[]): void {
  const list = scene.glades;
  if (!list) return;
  const p = state.player;
  if (p.faded > 0) return;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  for (const g of list) {
    if (cx < g.x || cx >= g.x + g.w || cy < g.y || cy >= g.y + g.h) continue;
    if (g.when && !state.save.flags.includes(g.when)) continue;
    if (!remember(state.save.taken, `${scene.id}:${g.id}`)) continue;
    state.save.abilities = normalizeAbilities([...state.save.abilities, g.ability]);
    events.push({ type: 'gladeGrant', id: g.id, ability: g.ability, x: g.x + g.w / 2, y: g.y + g.h });
  }
}

/**
 * Shortcuts: her box touching a closed one's face on its `opens` side opens it for good. `scene` is
 * the room's own scene (the shortcuts are listed there; the solids she collides with come from
 * `withShortcuts`).
 */
export function updateShortcuts(
  state: GameState,
  scene: Scene,
  events: SimEvent[],
  live: InputFrame = 0,
  prev: InputFrame = 0,
): void {
  const list = scene.shortcuts;
  if (!list) return;
  const p = state.player;
  if (p.faded > 0) return;
  let pushing = false;
  for (const sc of list) {
    const key = `${scene.id}:${sc.id}`;
    if (state.save.opened.includes(key)) continue;
    const alongX = p.x < sc.x + sc.w && sc.x < p.x + p.w;
    const alongY = p.y < sc.y + sc.h && sc.y < p.y + p.h;
    // (The Canopy r16, first-timer ft15fix: "gates on both sides of the well floor that won't open". Pushed from the
    // side that does not open it, it says so: `shortcutShut` as the push starts, and every 45 frames held.)
    if (alongY && (sc.opens === 'w' || sc.opens === 'e')) {
      const fromEast = p.x === sc.x + sc.w;
      const fromWest = p.x + p.w === sc.x;
      const wrong = sc.opens === 'w' ? fromEast : fromWest;
      const bit = fromEast ? ActionBit.left : ActionBit.right;
      // (r18, ft17a: run into it with the key already held, the first knock waited for a frame divisible by 45, and
      // a cut in between reset the run: "pushed into it: nothing at all". The push's own count now.)
      const push = wrong && (live & bit) !== 0;
      if (push) pushing = true;
      const k = state.kit.shutPush;
      if (push && ((prev & bit) === 0 || k === 0 || k % 45 === 0))
        events.push({
          type: 'shortcutShut',
          id: sc.id,
          x: sc.x + sc.w / 2,
          y: Math.max(sc.y, Math.min(sc.y + sc.h, p.y + p.h / 2)),
          side: fromEast ? 1 : -1,
        });
    }
    const touch =
      sc.opens === 'w'
        ? alongY && p.x + p.w === sc.x
        : sc.opens === 'e'
          ? alongY && p.x === sc.x + sc.w
          : sc.opens === 'n'
            ? alongX && p.y + p.h === sc.y
            : alongX && p.y === sc.y + sc.h;
    if (!touch) continue;
    state.save.opened.push(key);
    events.push({ type: 'shortcutOpen', id: sc.id, x: sc.x + sc.w / 2, y: sc.y + sc.h / 2 });
  }
  state.kit.shutPush = pushing ? state.kit.shutPush + 1 : 0;
}

/** One thing of the room to note as seen if it is in view of her (`map.seeX` x `map.seeY` from her centre). */
function see(state: GameState, room: string, id: string, x: number, y: number, t: Tuning): void {
  const p = state.player;
  const dx = x - (p.x + p.w / 2);
  const dy = y - (p.y + p.h / 2);
  if (Math.abs(dx) <= t.map.seeX && Math.abs(dy) <= t.map.seeY) remember(state.save.seen, `${room}:${id}`);
}

/** The map's memory: every `map.seeEvery` frames, lures, exits, doors, patches and glades in view are seen. */
export function updateSeen(state: GameState, scene: Scene, t: Tuning): void {
  const every = Math.max(1, Math.round(t.map.seeEvery));
  if (state.frame % every !== 0) return;
  const room = scene.id;
  for (const l of scene.lures ?? []) see(state, room, l.id, l.x, l.y, t);
  for (const p of scene.patches ?? []) see(state, room, p.id, p.x, p.y, t);
  for (const g of scene.glades ?? []) see(state, room, g.id, g.x + g.w / 2, g.y + g.h / 2, t);
  for (const d of scene.doors ?? []) see(state, room, d.id, d.x, d.y, t);
  for (const e of scene.exits ?? []) {
    const mid = (e.from + e.to) / 2;
    const ns = e.edge === 'n' || e.edge === 's';
    const at = e.at ?? (e.edge === 's' ? scene.height : e.edge === 'e' ? scene.width : 0);
    see(state, room, e.id, ns ? mid : at, ns ? at : mid, t);
  }
}
