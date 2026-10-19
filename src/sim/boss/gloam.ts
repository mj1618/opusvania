/**
 * The Gloamweaver, Lanternroot's mini-boss (docs/design/levels/proto-1.md §6, memory/bosses.md): an orb-weaver in
 * the dark under the lamp hall, its great lamp (the Gloam lamp) at the web's hub. Built on the Weaver's framework
 * (src/sim/boss/index.ts: lock, phase table, cues, retry, defeat) and its P2 drops. One exam a phase:
 *
 *  - **P1, the hunt (kindle to expose; bait it into silver).** It hunts on its orb in the dark, toward the sector
 *    over her, and never walks into silver light. On a clock it lunges at her: a tell aimed where she stands, a
 *    straight run to the floor, a rest, a climb back. Shielded: the blade glances. Kindle an arena moonwick within
 *    `exposePx` of it (or when it is cornered between lights), or let its lunge run into silver light, and it
 *    falls, exposed: open on the floor for `openFrames` (at most `exposeCuts` cuts), then it climbs back. `p1Hp`
 *    cuts end the phase (`retryP1Hp` on a retry).
 *  - **P2, the drops (read the arc; light is a shield).** The Weaver's drops: a tell that draws the arc, the drop,
 *    the swing end to end, then it hangs winded. Its swing stops at the edge of any silver light. A cut through its
 *    thread drops it stunned. `p2Hp` cuts.
 *  - **P3, the Gloam lamp (flinging off moonwicks, a set).** It wraps the lamp at the hub, 660 px over the floor.
 *    Light the high pair (`spec.high`) together and the moon-hole floods: it drops exposed. Or throw-cut it off the
 *    lamp (`throwsToFall`). On the floor `p3Hp` cuts and the lamp dies with it: defeat.
 *
 * Its creature is `scene.enemies` kind `gloamweaver` (this file's `gloamweaver` KindRules). Spiderlings are the
 * room's own danglers with `fight` and `respawn` (src/sim/light.ts): fuel inside the fight.
 * Pure: + - * / sqrt floor round min max abs (the swing's sine is Bhaskara's, src/sim/paths.ts).
 */
import type { KindRules, StepInfo } from '../enemies/common';
import { frames, setMode } from '../enemies/common';
import { moonlitAt } from '../enemies/senses';
import { wickBurn } from '../light-state';
import { flameAt, lureHpMax } from '../lures';
import { cycleSine } from '../paths';
import type { EnemyState } from '../state';
import type { Tuning } from '../tuning';
import { type BossCtx, type BossRules, defeat, enemyIndex, finish, lureIndex, setPhase, shift } from './core';
import { threadCut } from './weaver';

type G = Tuning['gloam'];

const F = { x: 0, y: 0 };

function cx(e: EnemyState): number {
  return e.x + e.w / 2;
}
function cy(e: EnemyState): number {
  return e.y + e.h / 2;
}
function put(e: EnemyState, x: number, y: number): void {
  e.x = Math.round(x - e.w / 2);
  e.y = Math.round(y - e.h / 2);
}

function creature(c: BossCtx): EnemyState | null {
  return c.state.enemies[enemyIndex(c.scene, c.spec.creature)] ?? null;
}

/** The arena's floor span and its floor's and canopy's y. */
function ground(c: BossCtx): { x0: number; x1: number; floor: number; canopy: number } {
  const a = c.spec.arena;
  return { x0: a.x, x1: a.x + a.w, floor: c.spec.floor ?? a.y + a.h, canopy: c.spec.canopy ?? a.y };
}

function hub(c: BossCtx): { x: number; y: number } {
  const h = c.spec.hub;
  if (h) return h;
  const a = c.spec.arena;
  return { x: a.x + a.w / 2, y: a.y + a.h / 3 };
}

/** The radius it hunts on round the hub. */
function orbR(c: BossCtx): number {
  return Math.max(64, (c.spec.orbR ?? 400) * c.t.gloam.orbShare);
}

/** Its place on the orb for the unit vector (ux, uy). */
function orbAt(c: BossCtx, ux: number, uy: number, out: { x: number; y: number }): { x: number; y: number } {
  const h = hub(c);
  const r = orbR(c);
  out.x = h.x + ux * r;
  out.y = h.y + uy * r;
  return out;
}

/** Is the point in silver light (a burning moonwick's)? */
function silver(c: BossCtx, x: number, y: number): boolean {
  return moonlitAt(c.state, c.scene, c.t, x, y) > 0;
}

/** Rotates the unit vector by a small step `d` (radians-ish, sign = way round) and renormalises: no trig. */
function turned(ux: number, uy: number, d: number): { x: number; y: number } {
  const x = ux - d * uy;
  const y = uy + d * ux;
  const m = Math.sqrt(x * x + y * y) || 1;
  return { x: x / m, y: y / m };
}

/** It lies open (`recover`, stunned) on the floor for `n` frames. */
function open(c: BossCtx, e: EnemyState, n: number, how: 'winded' | 'stunned'): void {
  setMode(e, 'recover', n);
  e.stunned = true;
  // (`taken` holds its hit points as the window opened: cuts in this window = taken - hp.)
  e.taken = e.hp;
  c.boss.tell = '';
  c.events.push({ type: 'bossOpen', id: c.boss.id, x: cx(e), y: cy(e), how, frames: n });
}

/** It lets go and falls to the floor. */
function drop(c: BossCtx, e: EnemyState): void {
  c.boss.move = '';
  c.boss.thread = false;
  c.boss.tell = '';
  setMode(e, 'fall', 0);
  e.knockVy = 0;
  e.ry = 0;
}

/** Falls toward the floor; true once it is on it. */
function falling(c: BossCtx, e: EnemyState, W: G): boolean {
  const g = ground(c);
  e.knockVy = Math.min(W.fallMax, e.knockVy + W.fallGravity);
  e.ry += e.knockVy;
  const n = Math.round(e.ry);
  e.ry -= n;
  e.y += n;
  if (e.y + e.h >= g.floor) {
    e.y = g.floor - e.h;
    e.knockVy = 0;
    e.ry = 0;
    return true;
  }
  return false;
}

/** Climbs straight toward (x, y) at `speed`; true once there. */
function climbTo(e: EnemyState, x: number, y: number, speed: number): boolean {
  const dx = x - cx(e);
  const dy = y - cy(e);
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= speed) {
    put(e, x, y);
    return true;
  }
  put(e, cx(e) + (dx / d) * speed, cy(e) + (dy / d) * speed);
  return false;
}

/** A tell (`bossTell` + `enemyWindup`): the swing over `x0..x1`. */
function tell(c: BossCtx, e: EnemyState, n: number, x0: number, x1: number): void {
  const b = c.boss;
  const g = ground(c);
  b.tell = 'swing';
  b.tellFrames = n;
  b.tellX0 = Math.round(Math.max(g.x0, x0));
  b.tellX1 = Math.round(Math.min(g.x1, x1));
  const p = c.state.player;
  const px = p.x + p.w / 2;
  let safe = -1;
  let best = Number.POSITIVE_INFINITY;
  for (let x = g.x0 + 40; x <= g.x1 - 40; x += 16) {
    if (x > x0 - 40 && x < x1 + 40) continue;
    if (Math.abs(x - px) < best) {
      best = Math.abs(x - px);
      safe = x;
    }
  }
  b.safeX = safe;
  c.events.push({
    type: 'bossTell',
    id: b.id,
    x: cx(e),
    y: cy(e),
    attack: 'swing',
    frames: n,
    x0: b.tellX0,
    x1: b.tellX1,
    safeX: b.safeX,
    px: b.pivotX,
    py: b.pivotY,
    len: b.len,
    reach: b.reach,
    side: b.side,
    dir: b.dir,
  });
  c.events.push({
    type: 'enemyWindup',
    id: e.id,
    kind: e.kind,
    x: cx(e),
    y: cy(e),
    dir: e.facing,
    frames: n,
    px: Math.round(Math.abs(x1 - x0)),
    speed: 0,
  });
}

// --- P1: find it.

/** P1 on the orb: round toward the sector over her, never into silver; cornered = both ways lit. */
function hunt(c: BossCtx, e: EnemyState, W: G): { cornered: boolean } {
  const b = c.boss;
  const h = hub(c);
  const p = c.state.player;
  let tx = p.x + p.w / 2 - h.x;
  let ty = p.y + p.h / 2 - h.y;
  const tm = Math.sqrt(tx * tx + ty * ty) || 1;
  tx /= tm;
  ty /= tm;
  const d = W.huntSpeed / orbR(c);
  const a = turned(b.ux, b.uy, d);
  const z = turned(b.ux, b.uy, -d);
  const litA = silver(c, orbAt(c, a.x, a.y, F).x, F.y);
  const litZ = silver(c, orbAt(c, z.x, z.y, F).x, F.y);
  // Which way round is toward her (the cross product's sign), unless it is there already.
  const cross = b.ux * ty - b.uy * tx;
  const dot = b.ux * tx + b.uy * ty;
  // (Back on its orb inside silver light, after a dazzle: it climbs out of the light the higher way first. In
  // Lanternroot the wick would gutter; the boss rush's burn for good, and it sat there for ever.)
  if (silver(c, cx(e), cy(e))) {
    const up = a.y < z.y ? a : z;
    b.ux = up.x;
    b.uy = up.y;
  } else if (dot < 0.999) {
    const want = cross >= 0 ? a : z;
    const lit = cross >= 0 ? litA : litZ;
    if (!lit) {
      b.ux = want.x;
      b.uy = want.y;
    }
  }
  orbAt(c, b.ux, b.uy, F);
  put(e, F.x, F.y);
  e.facing = tx < 0 ? -1 : 1;
  return { cornered: litA && litZ };
}

/**
 * A kindle of one of the arena's wicks this step, within `exposePx` of it (or with it cornered): exposed. (A wick
 * kindled this step burns its whole `moonwick.burn` still: the light rules count it down at the step's end.)
 */
function kindledNear(c: BossCtx, e: EnemyState, W: G, cornered: boolean): boolean {
  const L = c.state.lures;
  for (const id of c.spec.wicks ?? []) {
    const i = lureIndex(c.scene, id);
    const l = c.scene.lures?.[i];
    if (!l || (L.hp[i] ?? 0) <= 0 || L.burn[i] !== wickBurn(l, c.t)) continue;
    flameAt(L, i, l, c.state.frame, c.t, F);
    const dx = F.x - cx(e);
    const dy = F.y - cy(e);
    if (cornered || dx * dx + dy * dy <= W.exposePx * W.exposePx) return true;
  }
  return false;
}

/**
 * P1's lunge: the tell, aimed at her as she stands now. It will run from where it hangs through that point on to
 * the floor (`pivotX`, `pivotY`: where it lands), so stepping off the line is the dodge.
 */
function beginLunge(c: BossCtx, e: EnemyState, W: G): void {
  const b = c.boss;
  const g = ground(c);
  const p = c.state.player;
  const x0 = cx(e);
  const y0 = cy(e);
  const dx = p.x + p.w / 2 - x0;
  // (Always down at her: never a run up its own web.)
  const dy = Math.max(60, p.y + p.h / 2 - y0);
  const fy = g.floor - e.h / 2;
  const k = (fy - y0) / dy;
  const half = e.w / 2;
  b.pivotX = Math.round(Math.max(g.x0 + half, Math.min(g.x1 - half, x0 + dx * k)));
  b.pivotY = Math.round(fy);
  b.len = Math.round(Math.sqrt((b.pivotX - x0) * (b.pivotX - x0) + (fy - y0) * (fy - y0)));
  b.dir = b.pivotX >= x0 ? 1 : -1;
  const n = frames(W.lungeTell, 1);
  setMode(e, 'windup', n);
  e.facing = b.dir > 0 ? 1 : -1;
  b.tell = 'lunge';
  b.tellFrames = n;
  b.tellX0 = Math.round(b.pivotX - e.w);
  b.tellX1 = Math.round(b.pivotX + e.w);
  b.safeX = -1;
  c.events.push({
    type: 'bossTell',
    id: b.id,
    x: Math.round(x0),
    y: Math.round(y0),
    attack: 'lunge',
    frames: n,
    x0: b.tellX0,
    x1: b.tellX1,
    safeX: -1,
    px: b.pivotX,
    py: b.pivotY,
    len: b.len,
    reach: 0,
    side: b.dir,
    dir: b.dir,
  });
  c.events.push({
    type: 'enemyWindup',
    id: e.id,
    kind: e.kind,
    x: Math.round(x0),
    y: Math.round(y0),
    dir: b.dir,
    frames: n,
    px: b.len,
    speed: Math.round(W.lungeSpeed),
  });
}

/** Back onto its orb at the point nearest where it is (its place round the hub follows it). */
function backToOrb(c: BossCtx, e: EnemyState): void {
  const h = hub(c);
  const dx = cx(e) - h.x;
  const dy = cy(e) - h.y;
  const m = Math.sqrt(dx * dx + dy * dy);
  if (m > 1) {
    c.boss.ux = dx / m;
    c.boss.uy = dy / m;
  }
  setMode(e, 'climb', 0);
}

function stepP1(c: BossCtx, e: EnemyState, W: G): void {
  const b = c.boss;
  // A kindle near it, wherever it is on its web or the floor (not while it lies open or falls): exposed.
  const onWeb = e.mode === 'hunt' || e.mode === 'sit' || e.mode === 'windup' || e.mode === 'climb';
  if (e.mode === 'hunt' || e.mode === 'sit') {
    if (e.mode === 'sit') setMode(e, 'hunt', 0);
    const { cornered } = hunt(c, e, W);
    if (kindledNear(c, e, W, cornered)) {
      b.exposed++;
      drop(c, e);
      return;
    }
    // On its clock it comes for her (not out of silver: it never stands in it, and never lunges from it).
    if (--b.lunge <= 0 && !silver(c, cx(e), cy(e))) {
      b.lunge = frames(W.lungeEvery, 1);
      beginLunge(c, e, W);
    }
    return;
  }
  if ((onWeb || e.mode === 'dive' || e.mode === 'stall') && kindledNear(c, e, W, false)) {
    b.exposed++;
    drop(c, e);
    return;
  }
  if (e.mode === 'windup') {
    b.tellFrames = Math.max(0, b.tellFrames - 1);
    if (--e.timer <= 0) {
      b.tell = '';
      setMode(e, 'dive', 0);
      c.events.push({
        type: 'bossAttack',
        id: b.id,
        x: cx(e),
        y: cy(e),
        attack: 'lunge',
        frames: Math.max(1, Math.round(b.len / Math.max(1, W.lungeSpeed))),
      });
    }
    return;
  }
  if (e.mode === 'dive') {
    // The run: a lunge into silver light is dazzled (it falls, exposed); at the floor it rests, then climbs back.
    const x0 = e.x;
    const y0 = e.y;
    const there = climbTo(e, b.pivotX, b.pivotY, W.lungeSpeed);
    if (silver(c, cx(e), cy(e))) {
      e.x = x0;
      e.y = y0;
      b.exposed++;
      c.events.push({
        type: 'bossCue',
        id: b.id,
        x: cx(e),
        y: cy(e),
        set: 'p1',
        cue: 'dazzled',
        frame: b.phaseTime,
      });
      drop(c, e);
      return;
    }
    if (there) {
      // (The boss rush: no one kindles there, so the rest after a lunge is its window.)
      if (c.spec.rush) {
        open(c, e, frames(W.rushOpen, 1), 'winded');
        b.move = 'rest';
      } else setMode(e, 'stall', frames(W.lungeRest, 1));
    }
    return;
  }
  if (e.mode === 'stall') {
    if (--e.timer <= 0) backToOrb(c, e);
    return;
  }
  if (e.mode === 'fall') {
    if (falling(c, e, W)) open(c, e, frames(W.openFrames, 1), 'stunned');
    return;
  }
  if (e.mode === 'recover') {
    const cuts = e.taken - e.hp;
    if (--e.timer <= 0 || cuts >= (b.move === 'rest' ? W.rushCuts : W.exposeCuts)) {
      b.move = '';
      e.stunned = false;
      backToOrb(c, e);
    }
    return;
  }
  if (e.mode === 'climb') {
    orbAt(c, b.ux, b.uy, F);
    if (climbTo(e, F.x, F.y, W.climbSpeed)) setMode(e, 'hunt', 0);
  }
}

// --- P2: the drops (the Weaver's, the swing clipped by silver light).

function swingAt(c: BossCtx, u: number, out: { x: number; y: number }): { x: number; y: number } {
  const b = c.boss;
  const dx = b.side * b.reach * cycleSine(u);
  out.x = b.pivotX + dx;
  out.y = b.pivotY + Math.sqrt(Math.max(0, b.len * b.len - dx * dx));
  return out;
}

function beginDrop(c: BossCtx, e: EnemyState, W: G): void {
  const b = c.boss;
  const g = ground(c);
  const drops = c.spec.drops ?? [(g.x0 + g.x1) / 2];
  const px = drops[b.drop % drops.length] as number;
  b.pivotX = px;
  b.pivotY = g.canopy;
  b.len = W.threadPx;
  const room = Math.min(px - g.x0, g.x1 - px) - e.w / 2;
  b.reach = Math.max(120, Math.min(W.swingReach, W.threadPx * 0.95, room));
  b.thread = true;
  const her = c.state.player.x + c.state.player.w / 2;
  if (px - b.reach < g.x0) b.side = 1;
  else if (px + b.reach > g.x1) b.side = -1;
  else b.side = her < px ? 1 : -1;
  put(e, px, g.canopy + e.h / 2);
  e.facing = b.side > 0 ? 1 : -1;
  const n = frames(W.tellFrames, 1);
  setMode(e, 'windup', n);
  tell(c, e, n + frames(W.dropFrames, 1), px - b.reach - e.w / 2, px + b.reach + e.w / 2);
}

/** P2: one step. True while its touch is live. */
function stepP2(c: BossCtx, e: EnemyState, W: G): boolean {
  const b = c.boss;
  const g = ground(c);
  if (e.mode === 'perch') {
    const drops = c.spec.drops ?? [(g.x0 + g.x1) / 2];
    const px = drops[b.drop % drops.length] as number;
    const x = cx(e);
    const step = Math.max(1, Math.abs(px - x) / Math.max(1, e.timer));
    put(e, x + Math.max(-step, Math.min(step, px - x)), g.canopy + e.h / 2);
    if (--e.timer <= 0) beginDrop(c, e, W);
    return false;
  }
  if (e.mode === 'windup') {
    b.tellFrames = Math.max(0, b.tellFrames - 1);
    if (--e.timer <= 0) {
      setMode(e, 'dive', frames(W.dropFrames, 1));
      c.events.push({
        type: 'bossAttack',
        id: b.id,
        x: cx(e),
        y: cy(e),
        attack: 'swing',
        frames: frames(W.dropFrames, 1) + frames(W.swingFrames, 1),
      });
    }
    return false;
  }
  if (e.mode === 'dive' || e.mode === 'swing') {
    // Down the thread, then the swing: three quarters of a period, stopped at the edge of silver light.
    let nx: number;
    let ny: number;
    if (e.mode === 'dive') {
      const n = frames(W.dropFrames, 1);
      const k = 1 - (e.timer - 1) / n;
      swingAt(c, 0.25, F);
      const ease = k * k;
      nx = b.pivotX + (F.x - b.pivotX) * ease;
      ny = b.pivotY + e.h / 2 + (F.y - b.pivotY - e.h / 2) * ease;
    } else {
      const n = frames(W.swingFrames, 1);
      const k = 1 - (e.timer - 1) / n;
      swingAt(c, 0.25 + 0.75 * k, F);
      nx = F.x;
      ny = F.y;
    }
    // (The boss rush's wicks burn for good: there the swing runs whole, or it would always hang out of reach.)
    if (!c.spec.rush && silver(c, nx, ny)) {
      // (The light is a wall to it: it stops short, hanging, winded.)
      open(c, e, frames(W.windedFrames, 1), 'winded');
      return false;
    }
    put(e, nx, ny);
    if (--e.timer <= 0) {
      if (e.mode === 'dive') setMode(e, 'swing', frames(W.swingFrames, 1));
      else open(c, e, frames(W.windedFrames, 1), 'winded');
    }
    return true;
  }
  if (e.mode === 'recover') {
    if (--e.timer <= 0) {
      e.stunned = false;
      // (Fallen to the floor: back up to the canopy; hanging: up its thread.)
      setMode(e, 'climb', frames(W.climbFrames, 1));
      b.thread = true;
      b.pivotX = cx(e);
    }
    return false;
  }
  if (e.mode === 'fall') {
    if (falling(c, e, W)) open(c, e, frames(W.stunFrames, 1), 'stunned');
    return false;
  }
  if (e.mode === 'climb') {
    const top = g.canopy + e.h / 2;
    const y = cy(e);
    const step = Math.max(1, (y - top) / Math.max(1, e.timer));
    put(e, cx(e), Math.max(top, y - step));
    if (--e.timer <= 0) {
      b.thread = false;
      b.drop++;
      setMode(e, 'perch', frames(W.perchFrames, 1));
    }
  }
  return false;
}

// --- P3: the Gloam lamp.

/** Are all of the high pair burning? */
function highLit(c: BossCtx): boolean {
  const high = c.spec.high ?? [];
  if (high.length === 0) return false;
  for (const id of high) if ((c.state.lures.hp[lureIndex(c.scene, id)] ?? 0) <= 0) return false;
  return true;
}

function stepP3(c: BossCtx, e: EnemyState, W: G): void {
  const b = c.boss;
  const h = hub(c);
  if (e.mode === 'climb') {
    if (climbTo(e, h.x, h.y, W.climbSpeed)) setMode(e, 'perch', 0);
    return;
  }
  if (e.mode === 'perch') {
    put(e, h.x, h.y);
    // The moon-hole floods (the high pair together): it cannot hold the lamp in the moonlight.
    if (highLit(c) || b.throws >= Math.max(1, Math.round(W.throwsToFall))) {
      c.events.push({
        type: 'bossCue',
        id: b.id,
        x: h.x,
        y: h.y,
        set: 'p3',
        cue: highLit(c) ? 'moonhole' : 'thrown',
        frame: b.phaseTime,
      });
      b.throws = 0;
      drop(c, e);
    }
    return;
  }
  if (e.mode === 'fall') {
    if (falling(c, e, W)) open(c, e, frames(W.p3OpenFrames, 1), 'stunned');
    return;
  }
  if (e.mode === 'recover') {
    if (e.hp <= 0) return;
    if (--e.timer <= 0) {
      e.stunned = false;
      setMode(e, 'climb', 0);
    }
  }
}

// --- The phase table, cues and the fight.

export const gloamRules: BossRules = {
  phases: [
    { name: 'the hunt', exam: 'kindle to expose; bait it into silver' },
    { name: 'the drops', exam: 'read the arc; light is a shield' },
    { name: 'the Gloam lamp', exam: 'flinging off moonwicks, a set' },
  ],

  cues: (t) => t.gloam.cues,

  init(c, retry, down) {
    const { state, scene, spec } = c;
    const L = state.lures;
    const hi = lureIndex(scene, spec.heart);
    const l = scene.lures?.[hi];
    if (l && hi >= 0) {
      L.hp[hi] = down ? 0 : lureHpMax(l, c.t);
      L.out[hi] = down ? 1 : 0;
      if (L.live) {
        L.live.row[hi] = 'gloam';
        L.live.shield[hi] = 1;
      }
    }
    L.snuffed = L.out.filter((o) => o > 0).length;
    // Its web holds nothing (the player keeps control): it is the spider's road and the arena's picture.
    const e = creature(c);
    if (!e) return;
    const W = c.t.gloam;
    e.hp = frames(retry ? W.retryP1Hp : W.p1Hp, 1);
    e.hpMax = e.hp;
    e.gone = down;
    e.stunned = false;
    e.span = 1;
    // (It waits on the west of its orb, in the dark.)
    c.boss.ux = -1;
    c.boss.uy = 0;
    orbAt(c, -1, 0, F);
    put(e, F.x, F.y);
    setMode(e, down ? 'dead' : 'sit', 0);
  },

  update(c) {
    const { boss } = c;
    const e = creature(c);
    if (!e || boss.stage !== 'fight') return;
    if (boss.phase === 1 && e.hp <= 0 && e.mode !== 'climb') {
      e.stunned = false;
      setMode(e, 'climb', 0);
      shift(c, 'p1end');
    } else if (boss.phase === 2 && e.hp <= 0) {
      if (e.mode !== 'recover' || !e.stunned) drop(c, e);
      shift(c, 'p2end');
    } else if (boss.phase === 3 && e.hp <= 0) {
      const hi = lureIndex(c.scene, c.spec.heart);
      if (hi >= 0) {
        c.state.lures.hp[hi] = 0;
        c.state.lures.out[hi] = c.state.frame + 1;
      }
      setMode(e, 'dead', frames(c.t.gloam.deadFrames, 1));
      defeat(c);
    }
  },

  jump(c, n) {
    const e = creature(c);
    const W = c.t.gloam;
    if (n <= 1) {
      setPhase(c, 1);
      c.boss.lunge = frames(W.lungeFirst, 1);
      if (e) setMode(e, 'hunt', 0);
      return;
    }
    if (n === 2) {
      this.cue(c, 'p1end', 'next');
      return;
    }
    this.cue(c, 'p2end', 'next');
    if (e) {
      put(e, hub(c).x, hub(c).y);
      setMode(e, 'perch', 0);
      e.hp = frames(W.p3Hp, 1);
    }
  },

  cue(c, set, cue) {
    const e = creature(c);
    const W = c.t.gloam;
    if (set === 'intro' && cue === 'start') {
      setPhase(c, 1);
      c.boss.lunge = frames(W.lungeFirst, 1);
      if (e) setMode(e, 'hunt', 0);
    } else if (set === 'p1end' && cue === 'next') {
      setPhase(c, 2);
      c.boss.drop = 0;
      if (e) {
        e.hp = frames(W.p2Hp, 1);
        e.hpMax = e.hp;
        e.span = 2;
        e.stunned = false;
        put(e, cx(e), ground(c).canopy + e.h / 2);
        setMode(e, 'perch', frames(W.perchFrames, 1));
      }
    } else if (set === 'p2end' && cue === 'next') {
      setPhase(c, 3);
      c.boss.throws = 0;
      c.boss.lunge = frames(W.rushP3Every / 2, 1);
      if (e) {
        e.hp = frames(c.spec.rush ? W.rushP3Hp : W.p3Hp, 1);
        e.hpMax = e.hp;
        e.span = 3;
        e.stunned = false;
        setMode(e, 'climb', 0);
      }
    } else if (set === 'defeat' && cue === 'done') {
      if (e) e.gone = true;
      finish(c);
    }
  },
};

/** The fight's context for the creature's own update (null outside a Gloamweaver fight of this room). */
function fightOf(info: StepInfo): BossCtx | null {
  const { state, scene } = info;
  const spec = scene.boss;
  const boss = state.boss;
  if (!spec || !boss || spec.kind !== 'gloamweaver') return null;
  return { rules: gloamRules, state, scene, spec, boss, t: info.t, events: info.events };
}

export const gloamweaver: KindRules = {
  width: (t) => t.gloam.width,
  height: (t) => t.gloam.height,
  hp: (t) => t.gloam.p1Hp,
  hurtFrames: (t) => t.gloam.hurtFrames,
  hurtSafeFrames: (t) => t.gloam.hurtSafeFrames,
  contactDamage: (t) => t.gloam.contactDamage,
  deadFrames: (t) => t.gloam.deadFrames,
  value: () => 0,

  place(e, spawn) {
    e.x = Math.round(spawn.x - e.w / 2);
    e.y = Math.round(spawn.y - e.h / 2);
    e.mode = 'sit';
  },

  update(e, _index, info) {
    const c = fightOf(info);
    if (!c) return false;
    const b = c.boss;
    if (b.stage === 'down' || e.mode === 'dead') return false;
    if (b.stage !== 'fight' && b.stage !== 'shift') {
      // (Before the lock, and in the intro: it waits on its orb.)
      if (b.stage === 'wait' || b.stage === 'intro') {
        orbAt(c, b.ux, b.uy, F);
        put(e, F.x, F.y);
      }
      return false;
    }
    const W = info.t.gloam;
    const x0 = e.x;
    const y0 = e.y;
    let live = false;
    if (b.stage === 'shift') {
      // Between phases nothing attacks: P1's end climbs to the canopy, P2's end falls and lies.
      const g = ground(c);
      if (b.phase === 1 && e.mode === 'climb') climbTo(e, cx(e), g.canopy + e.h / 2, W.climbSpeed);
      else if (e.mode === 'fall' && falling(c, e, W)) setMode(e, 'recover', 0);
    } else if (b.phase === 1) stepP1(c, e, c.spec.rush ? { ...W, lungeEvery: W.rushEvery } : W);
    else if (b.phase === 2) {
      // A cut through its thread while it hangs (the Weaver's rule): it falls, and lies stunned.
      if (
        (e.mode === 'swing' || (e.mode === 'recover' && !e.stunned)) &&
        threadCut(info.state, b, e, info.t)
      ) {
        info.events.push({ type: 'bossThreadCut', id: b.id, x: cx(e), y: e.y });
        drop(c, e);
      } else live = stepP2(c, e, W);
    } else if (b.phase === 3 && c.spec.rush)
      // (The boss rush: P3 hunts again, quicker, and its lamp dies with it.)
      stepP1(c, e, { ...W, lungeEvery: W.rushP3Every, lungeTell: W.rushP3Tell });
    else if (b.phase === 3) stepP3(c, e, W);
    e.vx = e.x - x0;
    e.vy = e.y - y0;
    // (A thread cut in P2: her blade across the line from the pivot to its back while it hangs.)
    return live;
  },

  sees(_e, info) {
    const b = info.state.boss;
    return !!b && (b.stage === 'fight' || b.stage === 'intro');
  },

  /** Shielded in the dark: every blow glances unless it lies open (exposed, winded, falling). */
  blocks(e) {
    return !(e.mode === 'fall' || e.mode === 'recover');
  },

  shove(e) {
    e.knockVx = 0;
    return 0;
  },

  tough: () => true,
  undying: () => true,

  /** A throw-cut on it while it wraps the lamp (P3) counts toward knocking it off. */
  heavy(e, info) {
    const c = fightOf(info);
    if (c?.boss.phase !== 3 || e.mode !== 'perch') return false;
    c.boss.throws++;
    c.events.push({
      type: 'bossCue',
      id: c.boss.id,
      x: cx(e),
      y: cy(e),
      set: 'p3',
      cue: 'throwCut',
      frame: c.boss.throws,
    });
    return true;
  },

  /** Its touch is live only in P1's lunge and P2's drop and swing. */
  harmless(e, info) {
    const b = info.state.boss;
    if (b?.stage !== 'fight') return true;
    if (b.phase === 1 || (b.phase === 3 && info.scene.boss?.rush)) return e.mode !== 'dive';
    return !(b.phase === 2 && (e.mode === 'dive' || e.mode === 'swing'));
  },
};

/** The Gloam lamp's flame now (for tools and tests). */
export function gloamLamp(c: BossCtx): { x: number; y: number } {
  const i = lureIndex(c.scene, c.spec.heart);
  const l = c.scene.lures?.[i];
  if (!l) return { x: 0, y: 0 };
  return flameAt(c.state.lures, i, l, c.state.frame, c.t, { x: 0, y: 0 });
}
