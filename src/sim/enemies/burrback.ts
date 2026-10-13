/**
 * The burrback: a small armoured beetle.
 *
 *  - It walks its platform at a steady pace and turns round at ledges (it never walks off) and at
 *    walls, standing a beat as it turns. Now and then it rests mid-walk, on a fixed schedule from
 *    its id. It has no gravity, does not chase and has no attack: touching it is what hurts.
 *  - It notices her in one way: when she lands or starts a slash close by, it flinches (`alert`).
 *  - A hit shoves it along the cut (a fading velocity that stops at walls and at the brink of a
 *    ledge) while it staggers (`hurt`); dead, the body slides on for `enemies.deadFrames`.
 */
import type { SimEvent } from '../events';
import { roundHalfAway, solidAt } from '../physics/aabb';
import type { Scene } from '../scene';
import type { EnemyState } from '../state';
import type { Tuning } from '../tuning';
import { frames, gap2, type KindRules, mix, setMode } from './common';

/** An integer in [min, max] for the creature's n-th draw of stream k. */
function pick(e: EnemyState, k: number, min: number, max: number): number {
  const lo = frames(Math.min(min, max));
  const hi = frames(Math.max(min, max));
  return lo + (mix(e.salt + k, e.rests) % (hi - lo + 1));
}

/** Frames of walking before its next rest. */
function nextWalk(e: EnemyState, t: Tuning['burrback']): number {
  return Math.max(1, pick(e, 1, t.restEveryMin, t.restEveryMax));
}

/** Is there something to stand on under the 1 px column at `px`, for a body whose feet are at `bottom`? */
function floorAt(scene: Scene, px: number, bottom: number): boolean {
  if (px < 0 || px >= scene.width) return false;
  if (solidAt(scene, px, bottom, 1, 1)) return true;
  const ows = scene.oneWays;
  for (let i = 0; i < ows.length; i++) {
    const o = ows[i];
    if (o !== undefined && o.y === bottom && px >= o.x && px < o.x + o.w) return true;
  }
  return false;
}

/**
 * Tries to move the body 1 px toward `d`. Returns 0 if it moved, 1 if a wall stopped it, 2 if the
 * ground ends (its leading edge, less `overhang` px, would be over nothing).
 */
function nudge(e: EnemyState, scene: Scene, d: number, overhang: number): number {
  const nx = e.x + d;
  if (solidAt(scene, nx, e.y, e.w, e.h)) return 1;
  const lead = d > 0 ? nx + e.w - 1 - overhang : nx + overhang;
  if (!floorAt(scene, lead, e.y + e.h)) return 2;
  e.x = nx;
  return 0;
}

function walk(e: EnemyState, scene: Scene, t: Tuning['burrback'], events: SimEvent[]): void {
  e.teeter = 0;
  e.vx = e.facing * t.speed;
  e.rx += e.vx;
  let n = roundHalfAway(e.rx);
  e.rx -= n;
  while (n !== 0) {
    const stop = nudge(e, scene, e.facing, 0);
    if (stop !== 0) {
      e.rx = 0;
      e.vx = 0;
      e.facing = e.facing > 0 ? -1 : 1;
      const pause = frames(t.turnPauseFrames);
      setMode(e, 'pause', pause);
      e.turning = true;
      events.push({
        type: 'enemyTurn',
        id: e.id,
        kind: e.kind,
        x: e.x + e.w / 2,
        y: e.y + e.h / 2,
        dir: e.facing,
        cause: stop === 1 ? 'wall' : 'ledge',
        frames: pause,
      });
      if (pause === 0) setMode(e, 'walk', 0);
      return;
    }
    e.stride += 1;
    n -= e.facing;
  }
  e.walkLeft--;
  if (e.walkLeft <= 0) {
    setMode(e, 'pause', Math.max(1, pick(e, 2, t.restMin, t.restMax)));
    e.vx = 0;
    e.rests++;
    e.walkLeft = nextWalk(e, t);
  }
}

/** The shove of a hit: a fading velocity that stops at walls and at the brink of a ledge. */
function knock(e: EnemyState, scene: Scene, t: Tuning['burrback']): void {
  e.vx = e.knockVx;
  if (e.knockVx === 0) return;
  const d = e.knockVx > 0 ? 1 : -1;
  e.rx += e.knockVx;
  let n = roundHalfAway(e.rx);
  e.rx -= n;
  while (n !== 0) {
    const stop = nudge(e, scene, d, Math.max(0, Math.min(e.w - 1, frames(t.teeterPx))));
    if (stop !== 0) {
      if (stop === 2) e.teeter = d;
      e.rx = 0;
      e.knockVx = 0;
      return;
    }
    n -= d;
  }
  const decay = Math.max(0, t.knockDecay);
  e.knockVx = e.knockVx > 0 ? Math.max(0, e.knockVx - decay) : Math.min(0, e.knockVx + decay);
}

export const burrback: KindRules = {
  width: (t) => t.burrback.width,
  height: (t) => t.burrback.height,
  hp: (t) => t.burrback.hp,
  hurtFrames: (t) => t.burrback.hurtFrames,
  hurtSafeFrames: (t) => t.burrback.hurtSafeFrames,
  contactDamage: (t) => t.burrback.contactDamage,
  deadFrames: (t) => t.enemies.deadFrames,
  value: (t, finisher) => (finisher ? t.burrback.valueFinisher : t.burrback.value),

  /** The scene's `x`, `y` = its feet centre. */
  place(e, spawn, t) {
    e.x = Math.round(spawn.x - e.w / 2);
    e.y = Math.round(spawn.y) - e.h;
    e.mode = 'walk';
    e.walkLeft = nextWalk(e, t.burrback);
  },

  update(e, _index, info) {
    const { scene, events, stir } = info;
    const B = info.t.burrback;
    const p = info.state.player;
    if (e.alertCd > 0) e.alertCd--;
    if (e.mode === 'walk') walk(e, scene, B, events);
    else if (e.mode === 'pause' || e.mode === 'alert') {
      e.vx = 0;
      if (--e.timer <= 0) setMode(e, 'walk', 0);
    } else if (e.mode === 'hurt') {
      knock(e, scene, B);
      if (--e.timer <= 0) {
        e.knockVx = 0;
        setMode(e, 'walk', 0);
      }
    } else {
      knock(e, scene, B);
      if (--e.timer <= 0) {
        e.gone = true;
        e.vx = 0;
        e.knockVx = 0;
      }
      return false;
    }
    // A flinch: she landed or drew her blade close by.
    if (
      stir !== '' &&
      e.alertCd === 0 &&
      (e.mode === 'walk' || (e.mode === 'pause' && !e.turning)) &&
      gap2(p, e) <= B.alertPx * B.alertPx
    ) {
      const n = frames(B.alertFrames, 1);
      setMode(e, 'alert', n);
      e.vx = 0;
      e.alertCd = n + frames(B.alertCooldown);
      const side = p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1;
      events.push({
        type: 'enemyAlert',
        id: e.id,
        kind: e.kind,
        x: e.x + e.w / 2,
        y: e.y + e.h / 2,
        facing: e.facing,
        dir: side,
        cause: stir,
        frames: n,
      });
    }
    return true;
  },

  /** It stands where it is (a rest, not a turn), then walks on. */
  calm(e, _info, n) {
    if (e.mode === 'pause' && e.timer >= n) return;
    const turning = e.mode === 'pause' && e.turning;
    setMode(e, 'pause', n);
    e.turning = turning;
    e.vx = 0;
  },

  /** Along a forward cut; an up / down cut pushes it aside, away from her, less hard. */
  shove(e, dir, side, knockback, t) {
    const kb = dir === 'fwd' ? knockback : knockback * t.burrback.knockVertical;
    e.knockVx = side * kb;
    e.knockVy = 0;
    e.rx = 0;
    e.teeter = 0;
    return kb;
  },
};
