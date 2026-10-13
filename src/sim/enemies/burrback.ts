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
import { groundSanctuaryGap } from '../sanctuary';
import type { Scene } from '../scene';
import type { EnemyState } from '../state';
import type { Tuning } from '../tuning';
import { frames, gap2, type KindRules, mix, type StepInfo, setMode } from './common';

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

// Its ground this step (`span`): the box may be between MIN_X and MAX_X; an end is a lip if the
// ground stops there in a drop (not at a wall or the scene's edge).
let MIN_X = 0;
let MAX_X = 0;
let LIP_L = false;
let LIP_R = false;
let EDGE_L = 0;
let EDGE_R = 0;

/**
 * Measures the ground it stands on: how far it runs each way before a wall or a drop, and from
 * that the stretch it patrols (`lipClear` short of every drop, but never less than `minPatrol`).
 */
function span(e: EnemyState, scene: Scene, t: Tuning['burrback']): void {
  const bottom = e.y + e.h;
  // The nearest walls (anything solid at body height), or the scene's edges.
  let wallL = 0;
  let wallR = scene.width;
  const solids = scene.solids;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (s === undefined || s.y >= bottom || s.y + s.h <= e.y) continue;
    if (s.x + s.w <= e.x + e.w && s.x + s.w > wallL) wallL = s.x + s.w;
    if (s.x >= e.x && s.x < wallR) wallR = s.x;
  }
  // The floor under it, grown sideways over every top at its feet.
  let x0 = e.x;
  let x1 = e.x + e.w;
  const ows = scene.oneWays;
  for (let pass = 0; pass < 8; pass++) {
    let grown = false;
    for (let i = 0; i < solids.length; i++) {
      const s = solids[i];
      if (s === undefined || s.y !== bottom || s.x > x1 || s.x + s.w < x0) continue;
      if (s.x < x0) {
        x0 = s.x;
        grown = true;
      }
      if (s.x + s.w > x1) {
        x1 = s.x + s.w;
        grown = true;
      }
    }
    for (let i = 0; i < ows.length; i++) {
      const o = ows[i];
      if (o === undefined || o.y !== bottom || o.x > x1 || o.x + o.w < x0) continue;
      if (o.x < x0) {
        x0 = o.x;
        grown = true;
      }
      if (o.x + o.w > x1) {
        x1 = o.x + o.w;
        grown = true;
      }
    }
    if (!grown) break;
  }
  LIP_L = x0 > wallL;
  LIP_R = x1 < wallR;
  EDGE_L = Math.max(x0, wallL);
  EDGE_R = Math.min(x1, wallR);
  const lips = (LIP_L ? 1 : 0) + (LIP_R ? 1 : 0);
  const room = EDGE_R - EDGE_L - e.w - Math.max(0, t.minPatrol);
  const clear = lips === 0 ? 0 : Math.max(0, Math.min(frames(t.lipClear), Math.floor(room / lips)));
  MIN_X = EDGE_L + (LIP_L ? clear : 0);
  MAX_X = EDGE_R - (LIP_R ? clear : 0);
}

/**
 * She is below it, near one of its lips: the side (-1 / 1) of the lip it keeps away from, 0 = none
 * (or 2 = both). Only inside `waryReachPx` of that lip.
 */
function wary(
  e: EnemyState,
  p: { x: number; y: number; w: number; h: number },
  t: Tuning['burrback'],
): number {
  if (p.y + p.h <= e.y + e.h + t.waryBelowPx) return 0;
  const pc = p.x + p.w / 2;
  const l = LIP_L && Math.abs(pc - EDGE_L) <= t.waryPx && e.x - EDGE_L <= t.waryReachPx;
  const r = LIP_R && Math.abs(pc - EDGE_R) <= t.waryPx && EDGE_R - (e.x + e.w) <= t.waryReachPx;
  return l && r ? 2 : l ? -1 : r ? 1 : 0;
}

function walk(e: EnemyState, info: StepInfo): void {
  const { scene, events, state } = info;
  const t = info.t.burrback;
  const G = info.t.goal;
  span(e, scene, t);
  const shy = wary(e, state.player, t);
  // Facing an edge she is under: it turns its back on it (or stands, if she is under both).
  if (shy === 2 || shy === e.facing) {
    e.vx = 0;
    if (shy === 2) {
      setMode(e, 'pause', frames(t.waryStandFrames, 1));
      return;
    }
    turn(e, t, events, 'wary');
    return;
  }
  e.teeter = 0;
  e.vx = e.facing * t.speed;
  e.rx += e.vx;
  let n = roundHalfAway(e.rx);
  // (A remainder left by a shove the other way must never count as steps.)
  if (n * e.facing < 0) n = 0;
  e.rx -= n;
  while (n !== 0) {
    const nx = e.x + e.facing;
    // Short of a drop: outward past the patrol's end is refused (back in from beyond it is not).
    const lip = e.facing < 0 ? LIP_L && nx < MIN_X : LIP_R && nx + e.w > MAX_X;
    // A lit lantern's sanctuary ahead: it does not go nearer.
    const gap = groundSanctuaryGap(state, scene, e.x, e.x + e.w, e.y + e.h);
    const next = gap < 0 ? -1 : groundSanctuaryGap(state, scene, nx, nx + e.w, e.y + e.h);
    const holy = next >= 0 && next < G.sanctuaryPx && next < gap;
    const stop = holy ? 3 : lip ? 2 : nudge(e, scene, e.facing, 0);
    if (stop !== 0) {
      e.rx = 0;
      e.vx = 0;
      // Turning round would mean walking at an edge she is under: it stands instead.
      if (shy === -e.facing) {
        setMode(e, 'pause', frames(t.waryStandFrames, 1));
        return;
      }
      turn(e, t, events, stop === 1 ? 'wall' : stop === 3 ? 'lantern' : 'ledge');
      return;
    }
    e.stride += 1;
    n -= e.facing;
  }
  e.walkLeft--;
  if (e.walkLeft <= 0) {
    // Never a rest near a lip: it walks on until it is clear of it.
    const r = frames(t.restLipClear);
    if ((LIP_L && e.x - EDGE_L < r) || (LIP_R && EDGE_R - (e.x + e.w) < r)) return;
    setMode(e, 'pause', Math.max(1, pick(e, 2, t.restMin, t.restMax)));
    e.vx = 0;
    e.rests++;
    e.walkLeft = nextWalk(e, t);
  }
}

/** Turns round where it stands: `facing` flips at once, it stands a beat, then walks back. */
function turn(
  e: EnemyState,
  t: Tuning['burrback'],
  events: SimEvent[],
  cause: 'ledge' | 'wall' | 'lantern' | 'wary',
): void {
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
    cause,
    frames: pause,
  });
  if (pause === 0) setMode(e, 'walk', 0);
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
    if (e.mode === 'walk') walk(e, info);
    else if (e.mode === 'pause' || e.mode === 'alert') {
      // A recoil from her touch plays out inside the flinch.
      if (e.mode === 'alert' && e.knockVx !== 0) knock(e, scene, B);
      else e.vx = 0;
      if (--e.timer <= 0) {
        e.knockVx = 0;
        setMode(e, 'walk', 0);
      }
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

  /** Inside a lit lantern's sanctuary (it was there when the lantern caught, or was shoved in): harmless. */
  harmless(e, info) {
    const gap = groundSanctuaryGap(info.state, info.scene, e.x, e.x + e.w, e.y + e.h);
    return gap >= 0 && gap < info.t.goal.sanctuaryPx;
  },

  /** Its touch hurt her (or met her kindling): it is shoved back from her, flinches, and turns away. */
  touched(e, info, dir) {
    if (e.mode === 'dead') return;
    const B = info.t.burrback;
    const away = dir > 0 ? -1 : 1;
    const n = frames(B.touchFlinchFrames, 1);
    setMode(e, 'alert', n);
    e.knockVx = away * Math.max(0, B.touchRecoil);
    e.rx = 0;
    e.vx = 0;
    e.teeter = 0;
    e.facing = away;
    e.alertCd = n + frames(B.alertCooldown);
    info.events.push({
      type: 'enemyAlert',
      id: e.id,
      kind: e.kind,
      x: e.x + e.w / 2,
      y: e.y + e.h / 2,
      facing: e.facing,
      dir: -away,
      cause: 'touch',
      frames: n,
    });
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
