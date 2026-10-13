/**
 * The lampwing: a small pale moth-wisp of the open air, drawn to her light (memory/enemies.md).
 *
 *  - `hover`: it wanders round its home inside its territory, steering softly toward wander points
 *    drawn from a hash of its id (no RNG), with a slow bob. It never enters a solid, never rises
 *    above the canopy, never dips to the water; one-way branches are open air to it.
 *  - She comes within `noticePx` with a clear line: `curious` (it brakes, turns to her and rises:
 *    the tell), then `pursue`: it drifts after her, slower than she walks, with limited
 *    acceleration, so it arcs and overshoots and she can step round it.
 *  - It gives up (`rest`, then `return` home, noticing nothing until it is there) when she is too far
 *    from its home, out of sight too long, when it has chased long enough, when her light goes out,
 *    and when it has touched her (it bounces off her first).
 *  - No attack: its touch is what hurts. Hit, it is batted along the cut and tumbles (`hurt`), then
 *    goes for her again. Dead, it falls (the only time gravity touches it) and is gone.
 *
 * No gravity, no ground: it is a point of steering in free air, moved 1 px at a time per axis.
 */
import { roundHalfAway, solidAt } from '../physics/aabb';
import type { Scene, SolidRect } from '../scene';
import type { EnemyState, PlayerState } from '../state';
import type { Tuning } from '../tuning';
import { frames, type KindRules, mix, type StepInfo, segmentBlocked, setMode } from './common';

type L = Tuning['lampwing'];

/** Why a pursuit ended. */
export type GiveUpCause = 'far' | 'lost' | 'tired' | 'dark' | 'touch' | 'calm';

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

const lit = (p: PlayerState): boolean => p.hp > 0 && p.faded === 0;

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

/** Is she within its leash (her centre to its home)? */
function inLeash(e: EnemyState, p: PlayerState, t: L): boolean {
  const dx = p.x + p.w / 2 - e.homeX;
  const dy = p.y + p.h / 2 - e.homeY;
  return dx * dx + dy * dy <= t.leashPx * t.leashPx;
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
    e.side = e.facing;
    e.targetX = e.x + e.w / 2;
    e.targetY = e.y + e.h / 2;
    // Each beats out of step with the others.
    e.flap = (e.salt % 1000) / 1000;
  },

  /** Its territory plus its sight: on re-forming she is outside what it can notice from anywhere it hovers. */
  homeClear: (e, t) => e.radius + t.lampwing.noticePx,

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

  /** One that has noticed her gives up (`calm`): it rests, flies home and notices nothing on the way. */
  calm(e, info) {
    if (e.mode === 'curious' || e.mode === 'pursue') giveUp(e, info, 'calm');
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
        // Struck, it goes for her at once if it can see her; else home.
        if (!over && inLeash(e, p, t) && sees(e, p, scene, 0)) {
          setMode(e, 'pursue', 0);
          e.lost = 0;
          e.targetX = px;
          e.targetY = py;
        } else {
          setMode(e, 'return', 0);
          e.lost = 0;
          e.chase = 0;
          e.targetX = e.homeX;
          e.targetY = e.homeY;
        }
      }
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
      if (t.noticePx > 0 && !over && inLeash(e, p, t) && sees(e, p, scene, t.noticePx)) {
        const n = frames(t.curiousFrames, 1);
        setMode(e, 'curious', n);
        e.targetX = px;
        e.targetY = py;
        aim(e, 0, 0);
        face(e, px - (e.x + e.w / 2), 0);
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
        setMode(e, 'pursue', 0);
        e.chase = 0;
        e.lost = 0;
      }
    } else if (e.mode === 'pursue') {
      if (sees(e, p, scene, 0)) {
        e.targetX = px;
        e.targetY = py;
        e.lost = 0;
      } else e.lost++;
      e.chase++;
      const cause: GiveUpCause | '' = !lit(p)
        ? 'dark'
        : !inLeash(e, p, t)
          ? 'far'
          : e.lost >= frames(t.lostFrames, 1)
            ? 'lost'
            : e.chase >= frames(t.pursueFrames, 1)
              ? 'tired'
              : '';
      // Out of sight it goes to where it last saw her, and waits there.
      aim(e, t.pursueSpeed, e.lost > 0 ? t.arrivePx : 0);
      face(e, e.targetX - (e.x + e.w / 2), 2);
      steer(e, aimX, aimY, t.pursueAccel);
      e.vx += e.pushX;
      e.vy += e.pushY;
      drift(e, scene, t);
      if (cause !== '') giveUp(e, info, cause);
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
    if (e.mode !== 'curious' && e.mode !== 'hurt' && t.pursueSpeed > 0) {
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
    // A blow out of nowhere starts a fresh pursuit; one in the middle of a chase does not extend it.
    if (e.mode !== 'pursue' && e.mode !== 'hurt') e.chase = 0;
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
