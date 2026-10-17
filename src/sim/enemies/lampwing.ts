/**
 * The lampwing: a small pale moth-wisp of the open air, drawn to her light (memory/enemies.md).
 *
 *  - `hover`: it wanders round its home inside its territory, steering softly toward wander points
 *    drawn from a hash of its id (no RNG), with a slow bob. It never enters a solid, never rises
 *    above the canopy, never dips to the water; one-way branches are open air to it.
 *  - She comes within its sight with a clear line: `curious` (it brakes, turns to her and rises:
 *    the tell), then it commits: `dive`, a swoop along an arc to where she stood when the tell
 *    ended (moving on dodges it; a gliding hero is led). At the bottom it hangs (`stall`): open,
 *    its touch harmless: her opening. Then it climbs to a perch above her (`pursue`) and tells again.
 *  - It gives up (`rest`, then `return` home, noticing nothing until it is there) when she is too far
 *    from its home, out of sight too long, when it has dived often enough, when her light goes out
 *    (she faded, or she carries nothing any more: memory/giving.md), when it has touched her (it
 *    bounces off her first), and when she gives it a glint (`gift`: it settles and goes home).
 *  - It sees only the light she carries: empty-handed she is dark to it; the more she carries, the
 *    further its sight reaches (`seenScale`).
 *  - Its dive is its attack; its touch hurts whenever it is not stalled. Hit, it is batted along the
 *    cut and tumbles (`hurt`), then climbs to try again. Dead, it falls and is gone.
 *
 * No gravity, no ground: it is a point of steering in free air, moved 1 px at a time per axis.
 */
import { roundHalfAway, solidAt } from '../physics/aabb';
import { nearLitLantern } from '../sanctuary';
import type { Scene, SolidRect } from '../scene';
import { seenNow, seenScale } from '../seen';
import type { EnemyState, PlayerState } from '../state';
import type { Tuning } from '../tuning';
import { frames, type KindRules, mix, type StepInfo, segmentBlocked, setMode } from './common';

type L = Tuning['lampwing'];

/** Why a pursuit ended. */
export type GiveUpCause = 'far' | 'lost' | 'tired' | 'dark' | 'touch' | 'calm' | 'gift';

/** May its box be at (x, y)? Solids and the scene's edges, the canopy, the water of a pool. */
export function lampwingBlocked(scene: Scene, x: number, y: number, w: number, h: number, t: L): boolean {
  if (y < (scene.ceilingY ?? 0)) return true;
  if (solidAt(scene, x, y, w, h)) return true;
  const solids = scene.solids;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (s === undefined || s.tag !== 'pool') continue;
    if (x < s.x + s.w && s.x < x + w && y + h > s.y - t.poolDepth - t.poolClear) return true;
  }
  return false;
}

/** Moves it by (vx, vy), 1 px at a time. Returns 1 if x was stopped, 2 if y was, 3 if both. */
function fly(e: EnemyState, scene: Scene, t: L, vx: number, vy: number): number {
  let hit = 0;
  e.rx += vx;
  let n = roundHalfAway(e.rx);
  e.rx -= n;
  let d = n > 0 ? 1 : -1;
  while (n !== 0) {
    if (lampwingBlocked(scene, e.x + d, e.y, e.w, e.h, t)) {
      e.rx = 0;
      hit |= 1;
      break;
    }
    e.x += d;
    n -= d;
  }
  e.ry += vy;
  n = roundHalfAway(e.ry);
  e.ry -= n;
  d = n > 0 ? 1 : -1;
  while (n !== 0) {
    if (lampwingBlocked(scene, e.x, e.y + d, e.w, e.h, t)) {
      e.ry = 0;
      hit |= 2;
      break;
    }
    e.y += d;
    n -= d;
  }
  return hit;
}

/** Its own velocity, moved; an axis that is stopped loses its speed (it slides along what it met). */
function drift(e: EnemyState, scene: Scene, t: L): number {
  const hit = fly(e, scene, t, e.vx, e.vy);
  if ((hit & 1) !== 0) e.vx = 0;
  if ((hit & 2) !== 0) e.vy = 0;
  return hit;
}

/** Turns its velocity toward (dvx, dvy) by at most `accel` px/f². */
function steer(e: EnemyState, dvx: number, dvy: number, accel: number): void {
  let ax = dvx - e.vx;
  let ay = dvy - e.vy;
  const m = Math.sqrt(ax * ax + ay * ay);
  if (m > accel && m > 0) {
    ax = (ax * accel) / m;
    ay = (ay * accel) / m;
  }
  e.vx += ax;
  e.vy += ay;
}

// Scratch for `aim` (no allocation in the step path).
let aimX = 0;
let aimY = 0;
let aimLen = 0;

/**
 * Points `look` at its target and leaves in `aimX, aimY` the velocity that goes there at `speed`
 * (slowing inside `arrive` px, if given) and in `aimLen` the distance.
 */
function aim(e: EnemyState, speed: number, arrive: number): void {
  const dx = e.targetX - (e.x + e.w / 2);
  const dy = e.targetY - (e.y + e.h / 2);
  const len = Math.sqrt(dx * dx + dy * dy);
  aimLen = len;
  if (len <= 0) {
    aimX = 0;
    aimY = 0;
    return;
  }
  e.lookX = dx / len;
  e.lookY = dy / len;
  const sp = arrive > 0 && len < arrive ? (speed * len) / arrive : speed;
  aimX = e.lookX * sp;
  aimY = e.lookY * sp;
}

/** A smooth wave in [-1, 1] over u in [0, 1) made of two parabolas (exact arithmetic: no Math.sin). */
function wave(u: number): number {
  const x = u < 0.5 ? u * 2 : (u - 0.5) * 2;
  const s = 4 * x * (1 - x);
  return u < 0.5 ? s : -s;
}

// Her level of being seen this step (`update` sets it before anything else: memory/giving.md).
let SEEN = 0;

/** Her light: she is whole and carries something (empty-handed she is dark to it). */
const lit = (p: PlayerState): boolean => p.hp > 0 && p.faded === 0 && SEEN > 0;

/** Can it see her (a clear line between the two centres), within `range` px if given? */
function sees(e: EnemyState, p: PlayerState, scene: Scene, range: number): boolean {
  if (!lit(p)) return false;
  const ex = e.x + e.w / 2;
  const ey = e.y + e.h / 2;
  const px = p.x + p.w / 2;
  const py = p.y + p.h / 2;
  if (range > 0 && (px - ex) * (px - ex) + (py - ey) * (py - ey) > range * range) return false;
  return !segmentBlocked(scene, ex, ey, px, py);
}

/** She is within `roostPx` of it, whole, and too dark to be seen (round 4): it roosts. */
function roosts(e: EnemyState, p: PlayerState, t: L): boolean {
  if (SEEN > 0 || p.hp <= 0 || p.faded > 0 || t.roostPx <= 0) return false;
  const dx = p.x + p.w / 2 - (e.x + e.w / 2);
  const dy = p.y + p.h / 2 - (e.y + e.h / 2);
  return dx * dx + dy * dy <= t.roostPx * t.roostPx;
}

/** Is she within its leash (her centre to its home), less `margin` px? */
function inLeash(e: EnemyState, p: PlayerState, t: L, margin = 0): boolean {
  const dx = p.x + p.w / 2 - e.homeX;
  const dy = p.y + p.h / 2 - e.homeY;
  const r = Math.max(0, t.leashPx - margin);
  return dx * dx + dy * dy <= r * r;
}

function face(e: EnemyState, dx: number, dead: number): void {
  if (dx > dead) e.facing = 1;
  else if (dx < -dead) e.facing = -1;
}

/** The next wander point: inside the territory, clear, and in plain view of its home. */
function pickWander(e: EnemyState, scene: Scene, t: L): void {
  const reach = e.radius * 0.8;
  let tx = e.homeX;
  let ty = e.homeY;
  for (let k = 0; k < 8; k++) {
    const n = e.wander++;
    const ox = ((mix(e.salt + 11, n) % 2001) / 1000 - 1) * reach * e.side;
    const oy = ((mix(e.salt + 12, n) % 2001) / 1000 - 1) * reach * 0.6;
    if (ox * ox + oy * oy > reach * reach) continue;
    const x = e.homeX + roundHalfAway(ox);
    const y = e.homeY + roundHalfAway(oy);
    if (lampwingBlocked(scene, Math.round(x - e.w / 2), Math.round(y - e.h / 2), e.w, e.h, t)) continue;
    if (segmentBlocked(scene, e.homeX, e.homeY, x, y)) continue;
    tx = x;
    ty = y;
    break;
  }
  e.targetX = tx;
  e.targetY = ty;
  const lo = frames(Math.min(t.wanderMin, t.wanderMax), 1);
  const hi = frames(Math.max(t.wanderMin, t.wanderMax), 1);
  e.wanderLeft = lo + (mix(e.salt + 13, e.wander) % (hi - lo + 1));
}

function giveUp(e: EnemyState, info: StepInfo, cause: GiveUpCause): void {
  const n = frames(info.t.lampwing.restFrames, 1);
  setMode(e, 'rest', n);
  e.chase = 0;
  e.lost = 0;
  e.dives = 0;
  // She went beyond its reach: for a while it tells only at one well inside it (not at every jump
  // at the edge of it).
  if (cause === 'far') e.noticeCd = frames(info.t.lampwing.retellFrames);
  info.events.push({
    type: 'enemyGiveUp',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    facing: e.facing,
    cause,
    frames: n,
  });
}

/** The solid that stops its box from moving 1 px along x (`ax` = -1 / 1) or y (`ay`). */
function blocker(e: EnemyState, scene: Scene, ax: number, ay: number): SolidRect | undefined {
  const x = e.x + ax;
  const y = e.y + ay;
  for (const s of scene.solids) {
    if (x < s.x + s.w && s.x < x + e.w && y < s.y + s.h && s.y < y + e.h) return s;
  }
  return undefined;
}

/**
 * On the way home and stopped dead by a solid that lies between: aim for the nearer end of the
 * face it is against (just clear of the corner), for at most `DETOUR` frames, then home again.
 */
const DETOUR = 300;
const CLEAR = 6;
const STUCK = 20;
function detour(e: EnemyState, scene: Scene, t: L): void {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const dy = e.homeY > cy ? 1 : -1;
  const dx = e.homeX > cx ? 1 : -1;
  const sy = blocker(e, scene, 0, dy);
  const sx = sy ? undefined : blocker(e, scene, dx, 0);
  let ax = cx;
  let ay = cy;
  let bx = cx;
  let by = cy;
  if (sy) {
    ax = sy.x - e.w / 2 - CLEAR;
    bx = sy.x + sy.w + e.w / 2 + CLEAR;
  } else if (sx) {
    ay = sx.y - e.h / 2 - CLEAR;
    by = sx.y + sx.h + e.h / 2 + CLEAR;
  } else return;
  const free = (x: number, y: number): boolean =>
    !lampwingBlocked(scene, Math.round(x - e.w / 2), Math.round(y - e.h / 2), e.w, e.h, t);
  const da = Math.abs(ax - cx) + Math.abs(ay - cy);
  const db = Math.abs(bx - cx) + Math.abs(by - cy);
  const aOk = free(ax, ay);
  const bOk = free(bx, by);
  if (!aOk && !bOk) return;
  const useA = aOk && (!bOk || da <= db);
  e.targetX = useA ? ax : bx;
  e.targetY = useA ? ay : by;
  e.lost = DETOUR;
  e.chase = 0;
}

/** The tell is over: it commits to a dive at where she is now (led, if she glides). */
function startDive(e: EnemyState, info: StepInfo): void {
  const t = info.t.lampwing;
  const p = info.state.player;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  let tx = p.x + p.w / 2;
  let ty = p.y + p.h / 2;
  const span = (x: number, y: number): number => {
    const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
    const lo = frames(t.diveMinFrames, 1);
    const hi = Math.max(lo, frames(t.diveMaxFrames, 1));
    return Math.max(lo, Math.min(hi, Math.round(d / Math.max(0.1, t.diveSpeed))));
  };
  let n = span(tx, ty);
  // A gliding hero holds her line: it dives at where the glide will have carried her.
  if (p.gliding && t.diveLeadGlide > 0) {
    for (let k = 0; k < 3; k++) {
      tx = p.x + p.w / 2 + p.vx * n * t.diveLeadGlide;
      ty = p.y + p.h / 2 + p.vy * n * t.diveLeadGlide;
      n = span(tx, ty);
    }
  }
  // Never further than its dive is long.
  const dx = tx - cx;
  const dy = ty - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > t.diveMaxPx && d > 0) {
    tx = cx + (dx * t.diveMaxPx) / d;
    ty = cy + (dy * t.diveMaxPx) / d;
    n = span(tx, ty);
  }
  setMode(e, 'dive', n);
  e.span = n;
  e.fromX = cx;
  e.fromY = cy;
  e.targetX = tx;
  e.targetY = ty;
  e.dives++;
  e.rx = 0;
  e.ry = 0;
  aim(e, 0, 0);
  face(e, tx - cx, 0);
  info.events.push({
    type: 'enemyDive',
    id: e.id,
    kind: e.kind,
    x: cx,
    y: cy,
    tx,
    ty,
    dir: e.facing,
    frames: n,
    dive: e.dives,
  });
}

/** Where the dive's arc is after `k` of its frames: a curve from its start that bends down first, eased. */
let arcX = 0;
let arcY = 0;
function arc(e: EnemyState, k: number, bend: number): void {
  const u = Math.max(0, Math.min(1, k / Math.max(1, e.span)));
  const s = u * u * (3 - 2 * u);
  // The bend point: under (or over) its start, at her height, a little toward her.
  const bx = e.fromX + (e.targetX - e.fromX) * (1 - bend);
  const by = e.targetY;
  const a = (1 - s) * (1 - s);
  const b = 2 * (1 - s) * s;
  const c = s * s;
  arcX = a * e.fromX + b * bx + c * e.targetX;
  arcY = a * e.fromY + b * by + c * e.targetY;
}

/** The dive is over (or something stopped it): it hangs where it is, open. */
function stall(e: EnemyState, info: StepInfo, cause: 'done' | 'wall'): void {
  const n = frames(info.t.lampwing.stallFrames, 1);
  setMode(e, 'stall', n);
  e.vx = 0;
  e.vy = 0;
  e.rx = 0;
  e.ry = 0;
  info.events.push({
    type: 'enemyStall',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    dir: e.facing,
    frames: n,
    cause,
  });
}

/** Up to a perch above her, on the side it is on, to tell again. */
function climb(e: EnemyState, info: StepInfo): void {
  const t = info.t.lampwing;
  const p = info.state.player;
  const px = p.x + p.w / 2;
  const py = p.y + p.h / 2;
  const side = e.x + e.w / 2 < px ? -1 : 1;
  setMode(e, 'pursue', 0);
  e.chase = 0;
  e.lost = 0;
  e.targetX = px + side * t.perchSidePx;
  e.targetY = py - t.perchUpPx;
  info.events.push({
    type: 'enemyClimb',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    tx: e.targetX,
    ty: e.targetY,
    dir: e.facing,
  });
}

/** It has noticed her (or is ready to go again): the tell. */
function tell(e: EnemyState, info: StepInfo): void {
  const p = info.state.player;
  const n = frames(info.t.lampwing.curiousFrames, 1);
  setMode(e, 'curious', n);
  e.targetX = p.x + p.w / 2;
  e.targetY = p.y + p.h / 2;
  aim(e, 0, 0);
  face(e, e.targetX - (e.x + e.w / 2), 0);
  info.events.push({
    type: 'enemyNotice',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    dir: e.facing,
    frames: n,
  });
}

export const lampwing: KindRules = {
  width: (t) => t.lampwing.width,
  height: (t) => t.lampwing.height,
  hp: (t) => t.lampwing.hp,
  hurtFrames: (t) => t.lampwing.hurtFrames,
  hurtSafeFrames: (t) => t.lampwing.hurtSafeFrames,
  contactDamage: (t) => t.lampwing.contactDamage,
  deadFrames: (t) => t.lampwing.deadFrames,
  value: (t, finisher) => (finisher ? t.lampwing.valueFinisher : t.lampwing.value),

  /** The scene's `x`, `y` = its home: the centre of its box and of its territory. */
  place(e, spawn, t) {
    e.x = Math.round(spawn.x - e.w / 2);
    e.y = Math.round(spawn.y - e.h / 2);
    e.mode = 'hover';
    e.radius = Math.max(0, spawn.radius ?? t.lampwing.radius);
    e.sight = Math.max(0, spawn.sight ?? 0);
    e.side = e.facing;
    e.targetX = e.x + e.w / 2;
    e.targetY = e.y + e.h / 2;
    // Each beats out of step with the others.
    e.flap = (e.salt % 1000) / 1000;
  },

  /** Its territory plus its sight: on re-forming she is outside what it can notice from anywhere it hovers. */
  homeClear: (e, t) => e.radius + Math.max(t.lampwing.noticePx, e.sight),

  /** Lampwings keep a little apart: a soft push between any two closer than `sepPx`. */
  prepare(info) {
    const list = info.state.enemies;
    const t = info.t.lampwing;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e?.kind === 'lampwing') {
        e.pushX = 0;
        e.pushY = 0;
      }
    }
    if (t.sepPx <= 0) return;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a?.kind !== 'lampwing' || a.mode === 'dead') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b?.kind !== 'lampwing' || b.mode === 'dead') continue;
        const dx = b.x + b.w / 2 - (a.x + a.w / 2);
        const dy = b.y + b.h / 2 - (a.y + a.h / 2);
        const d2 = dx * dx + dy * dy;
        if (d2 >= t.sepPx * t.sepPx) continue;
        const d = Math.sqrt(d2);
        const k = t.sepAccel * (1 - d / t.sepPx);
        // Exactly on top of each other: apart sideways, the earlier one to its own side.
        const ux = d > 0 ? dx / d : -a.side;
        const uy = d > 0 ? dy / d : 0;
        a.pushX -= ux * k;
        a.pushY -= uy * k;
        b.pushX += ux * k;
        b.pushY += uy * k;
      }
    }
  },

  /**
   * Inside a lit lantern's sanctuary its touch does nothing; nor in the first beat of its tell
   * (`noticeSafeFrames`): a hit never lands sooner after the tell than she could have answered it.
   */
  harmless(e, info) {
    const G = info.t.goal;
    if (e.mode === 'curious' && e.modeFrames <= info.t.lampwing.noticeSafeFrames) return true;
    // Stalled at the bottom of its dive it is open; and for a beat as it lifts away. Having given up
    // (it hangs, then flies home) it is no danger either: its dive is its attack, and a body left
    // hanging in the middle of a fight after it has hit her must not hit her again.
    if (e.mode === 'stall' || e.mode === 'rest' || e.mode === 'return') return true;
    if (e.mode === 'pursue' && e.modeFrames <= info.t.lampwing.climbSafeFrames) return true;
    return nearLitLantern(info.state, info.scene, G, e.x + e.w / 2, e.y + e.h / 2);
  },

  /** It is aware of her while it is after her: the tell, the dive, the stall, the climb. */
  sees(e) {
    return e.mode === 'curious' || e.mode === 'dive' || e.mode === 'stall' || e.mode === 'pursue';
  },

  /** A glint she gave reached it: one that has noticed her gives up (`gift`) and goes home; it notices nothing while the calm lasts. */
  gift(e, info) {
    if (e.mode === 'curious' || e.mode === 'pursue' || e.mode === 'dive' || e.mode === 'stall')
      giveUp(e, info, 'gift');
    return 0;
  },

  /** One that has noticed her gives up (`calm`): it rests, flies home and notices nothing on the way. */
  calm(e, info) {
    if (e.mode === 'curious' || e.mode === 'pursue' || e.mode === 'dive' || e.mode === 'stall')
      giveUp(e, info, 'calm');
  },

  update(e, _index, info) {
    const { scene, state } = info;
    const t = info.t.lampwing;
    // The run is over (src/sim/goal.ts): nothing is drawn to her any more.
    const over = state.goal.gathered;
    const p = state.player;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;
    let beat = t.flapHover;
    if (e.noticeCd > 0) e.noticeCd--;
    SEEN = seenNow(state, info.t);
    e.roosting = false;

    if (e.mode === 'dead') {
      if (!e.landed) {
        e.knockVy = Math.min(t.maxFall, e.knockVy + t.gravity);
        e.vx = e.knockVx;
        e.vy = e.knockVy;
        const hit = fly(e, scene, t, e.vx, e.vy);
        if ((hit & 1) !== 0) e.knockVx = 0;
        if ((hit & 2) !== 0) {
          if (e.knockVy > 0) {
            // It has come down on something: it lies there a moment.
            e.landed = true;
            e.knockVx = 0;
            e.timer = Math.min(e.timer, frames(t.landFrames, 1) + 1);
          }
          e.knockVy = 0;
        }
        e.knockVx =
          e.knockVx > 0 ? Math.max(0, e.knockVx - t.knockDecay) : Math.min(0, e.knockVx + t.knockDecay);
      } else {
        e.vx = 0;
        e.vy = 0;
      }
      if (--e.timer <= 0) {
        e.gone = true;
        e.vx = 0;
        e.vy = 0;
        e.knockVx = 0;
        e.knockVy = 0;
      }
      return false;
    }

    if (e.mode === 'hurt') {
      // Batted along the cut, tumbling; the shove fades and stops at solids.
      e.vx = e.knockVx;
      e.vy = e.knockVy;
      const hit = fly(e, scene, t, e.vx, e.vy);
      if ((hit & 1) !== 0) e.knockVx = 0;
      if ((hit & 2) !== 0) e.knockVy = 0;
      const d = Math.max(0, t.knockDecay);
      e.knockVx = e.knockVx > 0 ? Math.max(0, e.knockVx - d) : Math.min(0, e.knockVx + d);
      e.knockVy = e.knockVy > 0 ? Math.max(0, e.knockVy - d) : Math.min(0, e.knockVy + d);
      beat = t.flapHurt;
      if (--e.timer <= 0) {
        e.knockVx = 0;
        e.knockVy = 0;
        e.vx = 0;
        e.vy = 0;
        // Struck, it climbs to come at her again if it can see her; else home (calmed: home).
        if (!over && e.calm === 0 && inLeash(e, p, t) && sees(e, p, scene, 0)) {
          climb(e, info);
        } else {
          setMode(e, 'return', 0);
          e.lost = 0;
          e.chase = 0;
          e.targetX = e.homeX;
          e.targetY = e.homeY;
        }
      }
    } else if (e.mode === 'hover' && roosts(e, p, t)) {
      // Round 4 (giving.md): she is near and too dark to be seen: it roosts, hanging still.
      e.roosting = true;
      steer(e, 0, 0, t.roostBrake);
      e.vx += e.pushX;
      e.vy += e.pushY;
      drift(e, scene, t);
      beat = t.flapRoost;
    } else if (e.mode === 'hover') {
      e.wanderLeft--;
      const dx = e.targetX - (e.x + e.w / 2);
      const dy = e.targetY - (e.y + e.h / 2);
      if (e.wanderLeft <= 0 || dx * dx + dy * dy < 64) pickWander(e, scene, t);
      aim(e, t.hoverSpeed, t.arrivePx);
      const period = frames(t.bobFrames, 2);
      const bob = t.bobSpeed * wave(((state.frame + (e.salt % period)) % period) / period);
      steer(e, aimX, aimY + bob, t.hoverAccel);
      e.vx += e.pushX;
      e.vy += e.pushY;
      drift(e, scene, t);
      face(e, e.vx, 0.2);
      // (The light she carries sets how far it sees her: memory/giving.md.)
      const sight = (e.sight > 0 ? e.sight : t.noticePx) * seenScale(SEEN, info.t.giving);
      // (For a while after she has left its leash once, only one well inside it.)
      const margin = e.noticeCd > 0 ? t.retellMarginPx : 0;
      if (sight > 0 && !over && e.calm === 0 && inLeash(e, p, t, margin) && sees(e, p, scene, sight)) {
        e.dives = 0;
        tell(e, info);
      }
    } else if (e.mode === 'curious') {
      // The tell: it brakes, turns to her and lifts a little.
      if (sees(e, p, scene, 0)) {
        e.targetX = px;
        e.targetY = py;
      }
      aim(e, 0, 0);
      face(e, e.targetX - (e.x + e.w / 2), 0);
      steer(e, 0, -t.curiousRise, t.curiousAccel);
      e.vx += e.pushX;
      e.vy += e.pushY;
      drift(e, scene, t);
      beat = t.flapCurious;
      if (--e.timer <= 0) {
        e.lost = 0;
        // The tell is over: it commits, unless her light is out, she is gone, or a lantern's light is on it.
        const G = info.t.goal;
        if (!lit(p)) giveUp(e, info, 'dark');
        else if (nearLitLantern(state, scene, G, e.x + e.w / 2, e.y + e.h / 2)) giveUp(e, info, 'calm');
        else if (nearLitLantern(state, scene, G, px, py)) giveUp(e, info, 'calm');
        else if (!inLeash(e, p, t)) giveUp(e, info, 'far');
        else startDive(e, info);
      }
    } else if (e.mode === 'dive') {
      // Committed: along the arc to where she was, whatever she does now.
      const k = e.span - e.timer + 1;
      arc(e, k, Math.max(0, Math.min(1, t.diveBend)));
      const cx = e.x + e.w / 2 + e.rx;
      const cy = e.y + e.h / 2 + e.ry;
      e.vx = arcX - cx;
      e.vy = arcY - cy;
      const x0 = e.x;
      const y0 = e.y;
      const hit = fly(e, scene, t, e.vx, e.vy);
      e.vx = e.x - x0;
      e.vy = e.y - y0;
      face(e, e.vx, 0.5);
      beat = t.flapDive;
      const G = info.t.goal;
      if (!lit(p)) giveUp(e, info, 'dark');
      else if (nearLitLantern(state, scene, G, e.x + e.w / 2, e.y + e.h / 2)) giveUp(e, info, 'calm');
      else if (--e.timer <= 0) stall(e, info, 'done');
      else if (hit !== 0 && e.vx === 0 && e.vy === 0) stall(e, info, 'wall');
    } else if (e.mode === 'stall') {
      // It hangs at the bottom of the arc, open: her opening.
      steer(e, 0, 0, t.restBrake);
      e.vx += e.pushX;
      e.vy += e.pushY;
      drift(e, scene, t);
      beat = t.flapStall;
      if (--e.timer <= 0) {
        if (!lit(p)) giveUp(e, info, 'dark');
        else if (!inLeash(e, p, t)) giveUp(e, info, 'far');
        else if (e.dives >= frames(t.maxDives, 1)) giveUp(e, info, 'tired');
        else climb(e, info);
      }
    } else if (e.mode === 'pursue') {
      // The climb to a perch above her, to tell again from there.
      if (sees(e, p, scene, 0)) e.lost = 0;
      else e.lost++;
      e.chase++;
      const G = info.t.goal;
      const cause: GiveUpCause | '' = !lit(p)
        ? 'dark'
        : nearLitLantern(state, scene, G, e.x + e.w / 2, e.y + e.h / 2)
          ? 'calm'
          : !inLeash(e, p, t)
            ? 'far'
            : e.lost >= frames(t.lostFrames, 1)
              ? 'lost'
              : '';
      aim(e, t.pursueSpeed, t.arrivePx);
      const arrived = aimLen < t.arrivePx;
      face(e, px - (e.x + e.w / 2), 2);
      steer(e, aimX, aimY, t.pursueAccel);
      e.vx += e.pushX;
      e.vy += e.pushY;
      const hit = drift(e, scene, t);
      if (cause !== '') giveUp(e, info, cause);
      else if ((arrived || hit !== 0 || e.chase >= frames(t.pursueFrames, 1)) && e.lost === 0) {
        if (e.dives >= frames(t.maxDives, 1)) giveUp(e, info, 'tired');
        else tell(e, info);
      } else if (e.chase >= frames(t.pursueFrames, 1) + frames(t.lostFrames, 1)) giveUp(e, info, 'lost');
    } else if (e.mode === 'rest') {
      steer(e, 0, 0, t.restBrake);
      e.vx += e.pushX;
      e.vy += e.pushY;
      drift(e, scene, t);
      if (--e.timer <= 0) {
        setMode(e, 'return', 0);
        e.lost = 0;
        e.chase = 0;
        e.targetX = e.homeX;
        e.targetY = e.homeY;
      }
    } else {
      // `return`: home, round whatever is in the way. `lost` = frames left of a detour, `chase` = frames stuck.
      if (e.lost > 0) {
        e.lost--;
        aim(e, t.returnSpeed, 0);
        if (aimLen < CLEAR || e.lost === 0) {
          e.lost = 0;
          e.targetX = e.homeX;
          e.targetY = e.homeY;
        }
      } else aim(e, t.returnSpeed, t.arrivePx);
      steer(e, aimX, aimY, t.returnAccel);
      e.vx += e.pushX;
      e.vy += e.pushY;
      const x0 = e.x;
      const y0 = e.y;
      drift(e, scene, t);
      face(e, e.vx, 0.2);
      // Not a pixel of headway for a while: something lies between it and home.
      e.chase = e.x === x0 && e.y === y0 && e.lost === 0 ? e.chase + 1 : 0;
      if (e.chase >= STUCK) detour(e, scene, t);
      const hx = e.homeX - (e.x + e.w / 2);
      const hy = e.homeY - (e.y + e.h / 2);
      if (hx * hx + hy * hy <= t.homePx * t.homePx) {
        setMode(e, 'hover', 0);
        e.lost = 0;
        e.chase = 0;
        pickWander(e, scene, t);
      }
    }

    // The wing beat follows its effort.
    if (
      !e.roosting &&
      e.mode !== 'curious' &&
      e.mode !== 'hurt' &&
      e.mode !== 'dive' &&
      e.mode !== 'stall' &&
      t.pursueSpeed > 0
    ) {
      const sp = Math.min(1, Math.sqrt(e.vx * e.vx + e.vy * e.vy) / t.pursueSpeed);
      beat = t.flapHover + (t.flapPursue - t.flapHover) * sp;
    }
    e.flap += Math.max(0, beat);
    while (e.flap >= 1) e.flap -= 1;
    return true;
  },

  /** Along the cut, whichever way it goes: it is light. */
  shove(e, dir, side, knockback, t) {
    const kb = knockback * t.lampwing.knockScale;
    e.knockVx = dir === 'fwd' ? side * kb : 0;
    e.knockVy = dir === 'up' ? -kb : dir === 'down' ? kb : 0;
    e.rx = 0;
    e.ry = 0;
    // A blow out of nowhere starts a fresh count of dives.
    if (e.mode === 'hover' || e.mode === 'rest' || e.mode === 'return') e.dives = 0;
    return kb;
  },

  /** Its touch hurt her: it bounces off, away from her centre, and has had enough for now. */
  touched(e, info, dir) {
    if (e.mode === 'dead') return;
    const t = info.t.lampwing;
    const p = info.state.player;
    const dx = e.x + e.w / 2 - (p.x + p.w / 2);
    const dy = e.y + e.h / 2 - (p.y + p.h / 2);
    const len = Math.sqrt(dx * dx + dy * dy);
    e.vx = len > 0 ? (dx / len) * t.bounceSpeed : -dir * t.bounceSpeed;
    e.vy = len > 0 ? (dy / len) * t.bounceSpeed : 0;
    e.knockVx = 0;
    e.knockVy = 0;
    giveUp(e, info, 'touch');
  },
};
