/**
 * Where a hazard return puts her (a fall catch, thorns: memory/level-kit.md, movement-controller.md).
 *
 * `returnPoint`: her last safe ground, moved `room.returnInset` in from the end of the top she fell from.
 * `clearOfThorns`: then, stepping back from that end, the first spot whose natural next move (jump held
 * toward that end, the glide that follows) does not carry her into thorns (impatient first-timer,
 * 2026-10-17: put back 72 px from R6's T3 lip, the jump-glide from there meets the thorn branch every time;
 * from 216 px back it lands on T4). The check is a short run of the real controller on a copy of the
 * state, done once per return.
 *
 * Pure (memory/sim-architecture.md).
 */
import type { SimEvent } from './events';
import { ActionBit } from './input';
import { thornAt } from './kit';
import { solidAt } from './physics/aabb';
import type { MoveParams } from './player/params';
import { createPlayer, updatePlayer } from './player/player';
import type { Scene, SolidRect } from './scene';
import { cloneState, type GameState } from './state';
import type { Tuning } from './tuning';

/**
 * The top a point stands on (`x0`..`x1`): a run of abutting rects whose tops differ by at most
 * `ground.stepUp`, so a rolling top is one top. Null when no rect's top is at `sy` under `sx`.
 */
function topRun(sx: number, sy: number, scene: Scene, step: number): { x0: number; x1: number } | null {
  const solids = scene.solids;
  const at = solids.find((q) => q.y === sy && sx >= q.x && sx < q.x + q.w);
  if (!at) return null;
  const next = (q: SolidRect, dir: 1 | -1): SolidRect | undefined =>
    solids.find(
      (o) =>
        o !== q &&
        o.tag !== 'trunk' &&
        Math.abs(o.y - q.y) <= step &&
        (dir > 0 ? o.x === q.x + q.w : o.x + o.w === q.x),
    );
  let x0 = at.x;
  let x1 = at.x + at.w;
  for (let q = next(at, -1); q; q = next(q, -1)) x0 = q.x;
  for (let q = next(at, 1); q; q = next(q, 1)) x1 = q.x + q.w;
  return { x0, x1 };
}

/** The ground under `x` near height `sy` (a rolling top), else `sy`. */
function groundY(x: number, sy: number, scene: Scene, step: number): number {
  const under = scene.solids.find(
    (q) => q.tag !== 'trunk' && x >= q.x && x < q.x + q.w && Math.abs(q.y - sy) <= 4 * step + 1,
  );
  return under ? under.y : sy;
}

/**
 * Where a caught fall puts her back: her last safe ground, moved `room.returnInset` px in from the end
 * of the top she fell from. She lands on whichever rect of a rolling top is under the new x.
 */
export function returnPoint(sx: number, sy: number, scene: Scene, t: Tuning): { x: number; y: number } {
  const step = Math.max(0, Math.round(t.ground.stepUp));
  const run = topRun(sx, sy, scene, step);
  if (!run) return { x: sx, y: sy };
  const inset = Math.min(Math.round(t.room.returnInset), Math.floor((run.x1 - run.x0) / 2));
  const x = Math.round(Math.max(run.x0 + inset, Math.min(run.x1 - inset, sx)));
  return { x, y: groundY(x, sy, scene, step) };
}

/**
 * A thorn return inside a shut arena (the Canopy r10, review r9 #3: four returns in a row put her back on the Grove's
 * pit floor facing the bed she had walked into): on the top she last stood on, the end farthest from bed `bed`, inset
 * `room.returnInset`, and at least `room.arenaThornPx` from every thorn rect. Null when the top cannot be found.
 */
export function arenaReturn(
  sx: number,
  sy: number,
  bed: { x: number; y: number; w: number; h: number },
  scene: Scene,
  t: Tuning,
): { x: number; y: number } | null {
  // (Her last ground must be the bed's floor: a stale one, far above or below, is not this fight's.)
  if (Math.abs(sy - bed.y) > 192) return null;
  const step = Math.max(0, Math.round(t.ground.stepUp));
  const run = topRun(sx, sy, scene, step);
  if (!run) return null;
  const inset = Math.min(Math.round(t.room.returnInset), Math.floor((run.x1 - run.x0) / 2));
  const bc = bed.x + bed.w / 2;
  const dir = sx < bc ? -1 : 1;
  const w = t.body.width;
  const h = t.body.height;
  const fits = (x: number) => !solidAt(scene, Math.round(x - w / 2), groundY(x, sy, scene, step) - h, w, h);
  // Walk away from the bed along the top until her box stops fitting (a top runs on under walls and behind rotten
  // bark: the Grove's pit floor runs under its west wall into the secret pocket), or the top ends.
  let far = sx;
  for (let x = sx; dir < 0 ? x >= run.x0 + inset : x <= run.x1 - inset; x += dir * 16) {
    if (!fits(x)) break;
    far = x;
  }
  const keep = Math.round(t.room.arenaThornPx);
  // From there back toward the bed until no thorns lie within `keep` of her box.
  for (let x = far; dir < 0 ? x <= sx : x >= sx; x -= dir * 16) {
    const y = groundY(x, sy, scene, step);
    const near = (scene.thorns ?? []).some(
      (r) =>
        x - w / 2 - keep < r.x + r.w && r.x < x + w / 2 + keep && y - 2 * keep < r.y + r.h && r.y < y + keep,
    );
    if (!near) return { x: Math.round(x), y };
  }
  return null;
}

/** Scratch events for the probe (thrown away). */
const PROBE_EVENTS: SimEvent[] = [];

/**
 * Does a jump from feet (x, y), held toward `dir` with jump held (the glide after it), meet thorns within
 * `room.returnProbeFrames`? Run on a copy of `state` with the real controller (lures pull as in play).
 */
function jumpMeetsThorns(
  state: GameState,
  x: number,
  y: number,
  dir: number,
  scene: Scene,
  t: Tuning,
  P: MoveParams,
): boolean {
  const g = cloneState(state);
  g.player = createPlayer(x, y, t, scene);
  g.prevInput = 0;
  const input = (dir > 0 ? ActionBit.right : ActionBit.left) | ActionBit.jump;
  const n = Math.max(0, Math.round(t.room.returnProbeFrames));
  let left = false;
  for (let f = 0; f < n; f++) {
    PROBE_EVENTS.length = 0;
    updatePlayer(g, scene, input, P, t.pods, PROBE_EVENTS);
    g.prevInput = input;
    g.frame++;
    const p = g.player;
    if (thornAt(scene, p) >= 0) return true;
    if (!p.grounded) left = true;
    // Down somewhere (back on the top, or on the far side): that jump is not a trap.
    else if (left) return false;
    if (p.y > scene.height || p.x + p.w < 0 || p.x > scene.width) return false;
  }
  return false;
}

/**
 * The return point (x, y) on its top, moved back from the end nearer her last safe ground (`sx`) in steps
 * of `room.returnProbeStep` until her natural next move from there (a jump held toward that end) does not
 * meet thorns. The first spot that passes; if none on the top does, (x, y) as it was.
 */
export function clearOfThorns(
  state: GameState,
  x: number,
  y: number,
  sx: number,
  scene: Scene,
  t: Tuning,
  P: MoveParams,
): { x: number; y: number } {
  if (!scene.thorns || scene.thorns.length === 0) return { x, y };
  const stepUp = Math.max(0, Math.round(t.ground.stepUp));
  const run = topRun(x, y, scene, stepUp);
  if (!run) return { x, y };
  const dir = sx - run.x0 <= run.x1 - sx ? -1 : 1;
  const inset = Math.min(Math.round(t.room.returnInset), Math.floor((run.x1 - run.x0) / 2));
  const stride = Math.max(8, Math.round(t.room.returnProbeStep));
  for (let cx = x; dir > 0 ? cx >= run.x0 + inset : cx <= run.x1 - inset; cx -= dir * stride) {
    const cy = groundY(cx, y, scene, stepUp);
    // (A top runs on under a wall: the Canopy's well landing, whose floor rect runs west under the mass and a
    // rotten wall. She is never put back inside a solid: the first spot her box does not fit ends the walk.)
    const w = t.body.width;
    if (solidAt(scene, Math.round(cx - w / 2), cy - t.body.height, w, t.body.height)) break;
    if (!jumpMeetsThorns(state, cx, cy, dir, scene, t, P)) return { x: cx, y: cy };
  }
  return { x, y };
}
