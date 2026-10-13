/**
 * The burrback: a small armoured beetle.
 *
 *  - It walks its platform at a steady pace and turns round at ledges (it never walks off) and at
 *    walls, standing a beat as it turns. Now and then it rests mid-walk, on a fixed schedule from
 *    its id. It has no gravity, does not chase and has no attack: touching it is what hurts.
 *  - It notices her in one way: when she lands or starts a slash close by, it flinches (`alert`).
 *  - Its ram: she stands in front of it at close range, or cuts it from the front: it braces, shell
 *    forward (`windup`: the tell), then rams a fixed length (`charge`) and stands spent (`recover`).
 *    Braced, a forward cut from its front glances off; from behind or from above it lands in full.
 *    Standing and mashing loses; reading the tell (hop over it, step back) and cutting it spent wins.
 *  - A hit shoves it along the cut (a fading velocity that stops at walls and at the brink of a
 *    ledge) while it staggers (`hurt`); dead, the body slides on for `enemies.deadFrames`.
 */
import type { SimEvent } from '../events';
import { roundHalfAway, solidAt } from '../physics/aabb';
import { groundSanctuaryGap } from '../sanctuary';
import type { Scene } from '../scene';
import type { EnemyState } from '../state';
import type { Tuning } from '../tuning';
import { frames, gap2, type KindRules, mix, type StepInfo, segmentBlocked, setMode } from './common';

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
// Its range (`radius` in the scene, 0 = none): the box stays between these.
let RANGE_L = 0;
let RANGE_R = 0;

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
  // A range of its own: it keeps within `radius` of where it started (box centre), wherever the
  // ground would let it go.
  if (e.radius > 0) {
    RANGE_L = Math.floor(e.homeX - e.radius - e.w / 2);
    RANGE_R = Math.ceil(e.homeX + e.radius + e.w / 2);
  } else {
    RANGE_L = 0;
    RANGE_R = scene.width;
  }
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
    // The end of its own range: as good as a wall (back in from beyond it is never refused).
    const leash = e.facing < 0 ? nx < RANGE_L : nx + e.w > RANGE_R;
    const stop = holy ? 3 : lip ? 2 : leash ? 1 : nudge(e, scene, e.facing, 0);
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

/** She is on its ground, in front of it, within `px` (box to box) with nothing solid between. */
function inFront(e: EnemyState, info: StepInfo, px: number): boolean {
  const p = info.state.player;
  const B = info.t.burrback;
  const pc = p.x + p.w / 2;
  const ec = e.x + e.w / 2;
  if ((pc - ec) * e.facing <= 0) return false;
  const feet = p.y + p.h;
  const bottom = e.y + e.h;
  if (feet > bottom + B.strikeBelowPx || feet < bottom - B.strikeAbovePx) return false;
  const gap = e.facing > 0 ? p.x - (e.x + e.w) : e.x - (p.x + p.w);
  if (gap > px) return false;
  return !segmentBlocked(info.scene, ec, e.y + e.h / 2, pc, e.y + e.h / 2);
}

/** Is there a solid low over her head (within `px` of the ground she stands on)? Then she cannot jump a ram. */
function lowCeiling(scene: Scene, p: { x: number; y: number; w: number; h: number }, px: number): boolean {
  const feet = p.y + p.h;
  const solids = scene.solids;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (s === undefined || s.x >= p.x + p.w || s.x + s.w <= p.x) continue;
    const under = s.y + s.h;
    if (under <= p.y && under > feet - px) return true;
  }
  return false;
}

/**
 * Braces for its ram if she is where it can reach her and it is ready. Returns true if it did
 * (`windup`, `enemyWindup`). `provoked`: she has just cut it. Unprovoked it braces only at one who
 * has come into its own range (`radius`): one who lands beside its patch and stands there is left
 * alone, as its walk leaves her alone. Provoked it answers wherever she stands, from a little
 * further (cutting it from just outside its range is not free). Once braced the ram runs its
 * length, range or no range. Never at one who has no room to jump (a low ceiling over her).
 */
function brace(e: EnemyState, info: StepInfo, provoked = false): boolean {
  const B = info.t.burrback;
  const p = info.state.player;
  if (B.strikePx <= 0 || e.strikeCd > 0 || e.calm > 0) return false;
  if (p.hp <= 0 || p.faded > 0 || p.kindling >= 0 || p.kindlingLamp >= 0 || info.state.goal.gathered)
    return false;
  if (!inFront(e, info, provoked ? B.provokedPx : B.strikePx)) return false;
  if (burrback.harmless?.(e, info)) return false;
  if (lowCeiling(info.scene, p, B.strikeHeadroomPx)) return false;
  span(e, info.scene, B);
  const inside = p.x + p.w > RANGE_L && p.x < RANGE_R;
  if (!inside && !provoked) return false;
  e.chargeLeft = frames(B.chargePx, 1);
  const n = frames(B.windupFrames, 1);
  setMode(e, 'windup', n);
  e.vx = 0;
  e.knockVx = 0;
  e.rx = 0;
  e.teeter = 0;
  info.events.push({
    type: 'enemyWindup',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    dir: e.facing,
    frames: n,
    px: e.chargeLeft,
    speed: B.chargeSpeed,
  });
  return true;
}

/** The ram is over: it stands spent, open, and will not brace again for a while. */
function spend(e: EnemyState, info: StepInfo, cause: 'spent' | 'wall' | 'ledge' | 'lantern' | 'touch'): void {
  const B = info.t.burrback;
  const n = frames(B.recoverFrames, 1);
  const cooldown = frames(B.strikeCooldown);
  setMode(e, 'recover', n);
  e.vx = 0;
  e.rx = 0;
  e.chargeLeft = 0;
  e.strikeCd = n + cooldown;
  info.events.push({
    type: 'enemyRecover',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    dir: e.facing,
    cause,
    frames: n,
    cooldown,
  });
}

/** One step of the ram: straight on at `chargeSpeed` until its length is run or something stops it. */
function charge(e: EnemyState, info: StepInfo): void {
  const { scene, state } = info;
  const B = info.t.burrback;
  const G = info.t.goal;
  e.vx = e.facing * B.chargeSpeed;
  e.rx += e.vx;
  let n = roundHalfAway(e.rx);
  e.rx -= n;
  while (n !== 0) {
    const nx = e.x + e.facing;
    const gap = groundSanctuaryGap(state, scene, e.x, e.x + e.w, e.y + e.h);
    const next = gap < 0 ? -1 : groundSanctuaryGap(state, scene, nx, nx + e.w, e.y + e.h);
    const holy = next >= 0 && next < G.sanctuaryPx && next < gap;
    const stop = holy ? 3 : nudge(e, scene, e.facing, 0);
    if (stop !== 0) {
      spend(e, info, stop === 1 ? 'wall' : stop === 3 ? 'lantern' : 'ledge');
      return;
    }
    e.stride += 1;
    e.chargeLeft -= 1;
    n -= e.facing;
    if (e.chargeLeft <= 0) {
      spend(e, info, 'spent');
      return;
    }
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
  // Shying from a lantern's light or from an edge she is under is a longer beat than meeting a wall.
  const pause = frames(cause === 'lantern' || cause === 'wary' ? t.turnPauseShyFrames : t.turnPauseFrames);
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
    e.radius = Math.max(0, spawn.radius ?? 0);
    e.walkLeft = nextWalk(e, t.burrback);
  },

  update(e, _index, info) {
    const { scene, events, stir } = info;
    const B = info.t.burrback;
    const p = info.state.player;
    if (e.alertCd > 0) e.alertCd--;
    if (e.strikeCd > 0) e.strikeCd--;
    // She is in front of it, close: it braces (out of a walk, a rest, a turn or a flinch).
    if ((e.mode === 'walk' || e.mode === 'pause' || e.mode === 'alert') && e.knockVx === 0 && brace(e, info))
      return true;
    if (e.mode === 'windup') {
      e.vx = 0;
      if (--e.timer <= 0) {
        const left = e.chargeLeft;
        setMode(e, 'charge', 0);
        e.chargeLeft = left;
        e.rx = 0;
        events.push({
          type: 'enemyCharge',
          id: e.id,
          kind: e.kind,
          x: e.x + e.w / 2,
          y: e.y + e.h / 2,
          dir: e.facing,
          px: e.chargeLeft,
          frames: Math.ceil(e.chargeLeft / Math.max(0.1, B.chargeSpeed)),
        });
      }
      return true;
    }
    if (e.mode === 'charge') {
      charge(e, info);
      return true;
    }
    if (e.mode === 'recover') {
      // (A bounce off her plays out inside it.)
      if (e.knockVx !== 0) knock(e, scene, B);
      else e.vx = 0;
      if (--e.timer <= 0) {
        e.knockVx = 0;
        setMode(e, 'walk', 0);
        return true;
      }
      // Spent, its touch does nothing: this is her opening.
      return false;
    }
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
        // Cut from behind: it comes round to her (at once, no beat), and braces if she is still there.
        const pc = p.x + p.w / 2;
        const ec = e.x + e.w / 2;
        const side = pc < ec ? -1 : 1;
        const near = Math.abs(pc - ec) <= B.turnOnHitPx && Math.abs(p.y + p.h - (e.y + e.h)) <= B.turnOnHitPx;
        if (B.strikePx > 0 && near && pc !== ec && side !== e.facing && p.hp > 0 && p.faded === 0) {
          e.facing = side;
          events.push({
            type: 'enemyTurn',
            id: e.id,
            kind: e.kind,
            x: ec,
            y: e.y + e.h / 2,
            dir: e.facing,
            cause: 'hit',
            frames: 0,
          });
        }
        brace(e, info, true);
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
    e.chargeLeft = 0;
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
    // Its ram hit her: it bounces back off her, turns away and stands spent.
    if (e.mode === 'windup' || e.mode === 'charge') {
      e.facing = away;
      spend(e, info, 'touch');
      e.knockVx = away * Math.max(0, B.touchRecoil);
      e.teeter = 0;
      e.alertCd = e.timer + frames(B.alertCooldown);
      return;
    }
    const n = frames(B.touchFlinchFrames, 1);
    setMode(e, 'alert', n);
    e.strikeCd = Math.max(e.strikeCd, n + frames(B.strikeCooldown));
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

  /** Braced, a forward cut from the side it faces glances off its shell. */
  blocks(e, dir, px) {
    return e.braced && dir === 'fwd' && (px - (e.x + e.w / 2)) * e.facing > 0;
  },

  /** Along a forward cut; an up / down cut pushes it aside, away from her, less hard. */
  shove(e, dir, side, knockback, t) {
    const k = knockback * t.burrback.knockScale;
    const kb = dir === 'fwd' ? k : k * t.burrback.knockVertical;
    e.knockVx = side * kb;
    e.knockVy = 0;
    e.rx = 0;
    e.teeter = 0;
    return kb;
  },
};
