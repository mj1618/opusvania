/**
 * The burrback: a small armoured beetle.
 *
 *  - It walks its platform at a steady pace and turns round at ledges (it never walks off) and at
 *    walls, standing a beat as it turns. Now and then it rests mid-walk, on a fixed schedule from
 *    its id. It has no gravity, does not chase and has no attack: touching it is what hurts.
 *  - It notices her by the light she carries (memory/giving.md): empty-handed she is unseen (no
 *    brace, no flinch); the more she carries, the further off it braces. Once she has cut it, it
 *    knows her whatever she carries. When she lands or starts a slash close by, it flinches (`alert`).
 *  - A glint she gives it (`gift`) calms it: it stops, lowers, stands a moment, then walks on
 *    harmless and braces at nothing until the calm has run out.
 *  - Its ram: she stands in front of it at close range, or cuts it from the front: it braces, shell
 *    forward (`windup`: the tell), then rams a fixed length (`charge`) and stands spent (`recover`).
 *    Braced, a forward cut from its front glances off; from behind or from above it lands in full.
 *    Standing and mashing loses; reading the tell (hop over it, step back) and cutting it spent wins.
 *  - A fight has a second beat: spent, it is winded for about two cuts' worth, then (roused: it has
 *    been cut, or has rammed) it comes round to her and braces again. Each ram tires it: the second
 *    time it stands winded long enough for the whole chain. A ram that ends at a wall stuns it
 *    longer still; a blow that breaks its brace (from behind, from above) leaves it winded at once.
 *  - A hit shoves it along the cut (a fading velocity that stops at walls and at the brink of a
 *    ledge) while it staggers (`hurt`); dead, the body slides on for `enemies.deadFrames`.
 */
import type { SimEvent } from '../events';
import { roundHalfAway, solidAt } from '../physics/aabb';
import { groundSanctuaryDepth } from '../sanctuary';
import type { Scene } from '../scene';
import { seenNow, seenScale } from '../seen';
import type { EnemyState, PlayerState } from '../state';
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
    const next = groundSanctuaryDepth(state, scene, G, nx, nx + e.w, e.y + e.h);
    const holy = next > 0 && next > groundSanctuaryDepth(state, scene, G, e.x, e.x + e.w, e.y + e.h);
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

/**
 * She is on its ground, in front of it, within `px` (box to box) with nothing solid between.
 * `over`: uncurling, it counts her up to `tuckBraceAbovePx` above its ground, and right over it
 * as in front.
 */
function inFront(
  e: EnemyState,
  info: StepInfo,
  px: number,
  facing: number = e.facing,
  over = false,
): boolean {
  const p = info.state.player;
  const B = info.t.burrback;
  const pc = p.x + p.w / 2;
  const ec = e.x + e.w / 2;
  const ahead = (pc - ec) * facing;
  if (over ? ahead < 0 : ahead <= 0) return false;
  const feet = p.y + p.h;
  const bottom = e.y + e.h;
  const above = over ? Math.max(B.strikeAbovePx, B.tuckBraceAbovePx) : B.strikeAbovePx;
  if (feet > bottom + B.strikeBelowPx || feet < bottom - above) return false;
  const gap = facing > 0 ? p.x - (e.x + e.w) : e.x - (p.x + p.w);
  if (gap > px) return false;
  return !segmentBlocked(info.scene, ec, e.y + e.h / 2, pc, e.y + e.h / 2);
}

/** Is there a solid low over her head (within `px` of the ground she stands on)? Then she cannot jump a ram. */
function lowCeiling(scene: Scene, x: number, y: number, w: number, h: number, px: number): boolean {
  const feet = y + h;
  const solids = scene.solids;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (s === undefined || s.x >= x + w || s.x + s.w <= x) continue;
    const under = s.y + s.h;
    if (under <= y && under > feet - px) return true;
  }
  return false;
}

/**
 * Would a step `d` take it in under a low ceiling (a doorway) from open ground? Neither its ram nor
 * a shove does: under there she cannot jump, so it does not brace at her, and a fight that drifted
 * in had no second tell (burr-shaft and the doorway under trunk A). One already under may move.
 */
function roofAhead(e: EnemyState, scene: Scene, d: number, px: number): boolean {
  return lowCeiling(scene, e.x + d, e.y, e.w, e.h, px) && !lowCeiling(scene, e.x, e.y, e.w, e.h, px);
}

/**
 * Braces for its ram if she is where it can reach her and it is ready. Returns true if it did
 * (`windup`, `enemyWindup`). In a fight (`stirred` > 0: it has rammed not long ago; or `roused` >
 * 0: she has cut it) it comes round to her first if she is behind it (`enemyTurn` cause `hit`):
 * the fight's second tell. Roused (cut) it answers wherever she stands, from a little further;
 * otherwise only one who is inside its own range (`radius`): one who lands beside its patch, or
 * stands at the wall beyond it working out the climb, is left alone, as its walk leaves her alone.
 * Once braced the ram runs its length, range or no range. Never at one who has no room to jump
 * (a low ceiling over her).
 */
function brace(e: EnemyState, info: StepInfo, over = false): boolean {
  const B = info.t.burrback;
  const p = info.state.player;
  if (B.strikePx <= 0 || e.strikeCd > 0 || e.calm > 0) return false;
  if (p.hp <= 0 || p.faded > 0 || p.kindling >= 0 || p.kindlingLamp >= 0 || info.state.goal.gathered)
    return false;
  // (Not at one dropping onto it from high above, nor at one in the air right over it, coming down
  // on it: its touch would land with the tell. It braces once she is down.)
  if (dropping(e, p, B)) return false;
  if (!over && !p.grounded && p.x < e.x + e.w && e.x < p.x + p.w) return false;
  const provoked = e.roused > 0;
  // It sees her by the light she carries (memory/giving.md): empty-handed she is unseen; the more she
  // carries, the further off it braces. One she has cut it knows, whatever she carries.
  const seen = seenNow(info.state, info.t);
  if (!provoked && seen === 0) return false;
  const reach = provoked ? B.provokedPx : B.strikePx * seenScale(seen, info.t.giving);
  const front = inFront(e, info, reach, e.facing, over);
  const round = (provoked || e.stirred > 0) && !front && inFront(e, info, reach, -e.facing, over);
  if (!round && !front) return false;
  if (burrback.harmless?.(e, info)) return false;
  if (lowCeiling(info.scene, p.x, p.y, p.w, p.h, B.strikeHeadroomPx)) return false;
  span(e, info.scene, B);
  const inside = p.x + p.w > RANGE_L && p.x < RANGE_R;
  if (!inside && !provoked) return false;
  if (round) {
    e.facing = e.facing > 0 ? -1 : 1;
    info.events.push({
      type: 'enemyTurn',
      id: e.id,
      kind: e.kind,
      x: e.x + e.w / 2,
      y: e.y + e.h / 2,
      dir: e.facing,
      cause: 'hit',
      frames: 0,
    });
  }
  e.chargeLeft = frames(B.chargePx, 1);
  const n = frames(B.windupFrames, 1);
  // (Curled, it uncurls into the brace.)
  e.tuck = 0;
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

/**
 * The ram is over (or a blow broke its brace): it stands winded, open, and will not brace again
 * until that and a short `strikeCooldown` have passed. The first time that is about two cuts' worth
 * (`recoverFrames`); every time after it is tired and stands longer (`recoverTiredFrames`: room for
 * the whole chain); stopped by a wall it is stunned (`recoverWallFrames`).
 */
function spend(
  e: EnemyState,
  info: StepInfo,
  cause: 'spent' | 'wall' | 'ledge' | 'lantern' | 'touch',
  broken = false,
): void {
  const B = info.t.burrback;
  const tired = e.rams > 0;
  const n = frames(
    cause === 'wall' ? B.recoverWallFrames : tired ? B.recoverTiredFrames : B.recoverFrames,
    1,
  );
  const cooldown = frames(B.strikeCooldown);
  setMode(e, 'recover', n);
  e.vx = 0;
  e.rx = 0;
  e.chargeLeft = 0;
  e.strikeCd = n + cooldown;
  e.rams++;
  e.broken = false;
  e.stirred = n + frames(B.rouseFrames);
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
    tired,
    broken,
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
  if (e.fenced) span(e, scene, B);
  while (n !== 0) {
    const nx = e.x + e.facing;
    const next = groundSanctuaryDepth(state, scene, G, nx, nx + e.w, e.y + e.h);
    const holy = next > 0 && next > groundSanctuaryDepth(state, scene, G, e.x, e.x + e.w, e.y + e.h);
    // Fenced, its ram ends where its range does (as at the brink of a ledge).
    const fence = e.fenced && (e.facing < 0 ? nx < RANGE_L : nx + e.w > RANGE_R);
    // (Nor does it run in under a doorway: it pulls up at its mouth, as at a brink.)
    const roof = roofAhead(e, scene, e.facing, B.strikeHeadroomPx);
    const stop = holy ? 3 : fence || roof ? 2 : nudge(e, scene, e.facing, 0);
    if (stop !== 0) {
      spend(e, info, stop === 1 ? 'wall' : stop === 3 ? 'lantern' : 'ledge');
      return;
    }
    e.stride += 1;
    e.chargeLeft -= 1;
    n -= e.facing;
    if (e.chargeLeft <= 0) {
      // A wall a stride ahead: its weight carries it on into it (a stun, not a ram spent short of it).
      const k = wallWithin(e, info, frames(B.chargeCarryPx));
      if (k <= 0) {
        spend(e, info, 'spent');
        return;
      }
      e.chargeLeft = k;
    }
  }
}

/**
 * Steps to the wall straight ahead if it is `px` or less away and nothing else would stop the ram first (a
 * drop, its fence, a doorway, a lit lantern's ground), else 0. Its range is measured (`span`).
 */
function wallWithin(e: EnemyState, info: StepInfo, px: number): number {
  const { scene, state } = info;
  const B = info.t.burrback;
  const G = info.t.goal;
  if (px <= 0) return 0;
  if (e.fenced) span(e, scene, B);
  const x0 = e.x;
  const here = groundSanctuaryDepth(state, scene, G, x0, x0 + e.w, e.y + e.h);
  for (let d = 1; d <= px + 1; d++) {
    const nx = x0 + e.facing * d;
    if (solidAt(scene, nx, e.y, e.w, e.h)) return d;
    const lead = e.facing > 0 ? nx + e.w - 1 : nx;
    if (!floorAt(scene, lead, e.y + e.h)) return 0;
    if (e.fenced && (e.facing < 0 ? nx < RANGE_L : nx + e.w > RANGE_R)) return 0;
    if (lowCeiling(scene, nx, e.y, e.w, e.h, B.strikeHeadroomPx)) return 0;
    if (groundSanctuaryDepth(state, scene, G, nx, nx + e.w, e.y + e.h) > here) return 0;
  }
  return 0;
}

/** She is above its ground (not on it), within `provokedPx` of it sideways (box to box). */
function overhead(e: EnemyState, p: PlayerState, B: Tuning['burrback']): boolean {
  if (p.hp <= 0 || p.faded > 0) return false;
  if (p.y + p.h >= e.y + e.h - B.strikeBelowPx) return false;
  const gap = Math.max(e.x - (p.x + p.w), p.x - (e.x + e.w));
  return gap <= B.provokedPx;
}

/**
 * She is dropping onto it from high above: in the air, falling (not gliding), from more than `dropPx`
 * over its top (the top of this airtime), until she is down.
 */
function dropping(e: EnemyState, p: PlayerState, B: Tuning['burrback']): boolean {
  // (A glider steers where she comes down: not a drop.)
  if (p.grounded || p.gliding || p.vy <= 0 || p.hp <= 0 || p.faded > 0) return false;
  return e.y - (p.airTopY + p.h) >= B.dropPx;
}

/**
 * She drops onto it (`dropping`, and her box within `dropClearPx` of its own sideways): it hurries
 * out from under her, the shorter way that its ground and range allow, at `dropSpeed`. Returns
 * false if she is not dropping onto it. Where neither way is open it stands.
 */
function dodgeDrop(e: EnemyState, info: StepInfo): boolean {
  const { scene, events } = info;
  const B = info.t.burrback;
  const p = info.state.player;
  if (B.dropSpeed <= 0 || !dropping(e, p, B)) return false;
  const c = Math.max(0, B.dropClearPx);
  if (p.x + p.w + c <= e.x || e.x + e.w + c <= p.x) return false;
  span(e, scene, B);
  const lo = Math.max(MIN_X, RANGE_L);
  const hi = Math.min(MAX_X, RANGE_R);
  // Its box's left edge if it clears her to the left / to the right.
  const toL = Math.floor(p.x - c - e.w);
  const toR = Math.ceil(p.x + p.w + c);
  const canL = toL >= lo;
  const canR = toR + e.w <= hi;
  let side = 0;
  if (canL && canR) side = e.x - toL <= toR - e.x ? -1 : 1;
  else if (canL) side = -1;
  else if (canR) side = 1;
  e.knockVx = 0;
  e.teeter = 0;
  if (e.mode !== 'walk') setMode(e, 'walk', 0);
  e.turning = false;
  if (side === 0) {
    e.vx = 0;
    e.rx = 0;
    return true;
  }
  if (side !== e.facing) {
    e.facing = side < 0 ? -1 : 1;
    events.push({
      type: 'enemyTurn',
      id: e.id,
      kind: e.kind,
      x: e.x + e.w / 2,
      y: e.y + e.h / 2,
      dir: e.facing,
      cause: 'drop',
      frames: 0,
    });
  }
  const goal = side < 0 ? toL : toR;
  let n = Math.min(Math.max(1, Math.round(B.dropSpeed)), Math.abs(goal - e.x));
  const x0 = e.x;
  while (n > 0 && nudge(e, scene, side, 0) === 0) {
    e.stride += 1;
    n--;
  }
  e.vx = e.x - x0;
  e.rx = 0;
  return true;
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
  if (e.fenced) span(e, scene, t);
  while (n !== 0) {
    // Fenced, a shove does not take it out of its range either; and none takes it in under a doorway.
    const fence = e.fenced && (d < 0 ? e.x + d < RANGE_L : e.x + d + e.w > RANGE_R);
    const roof = roofAhead(e, scene, d, t.strikeHeadroomPx);
    const stop = fence || roof ? 1 : nudge(e, scene, d, Math.max(0, Math.min(e.w - 1, frames(t.teeterPx))));
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
    e.fenced = spawn.fenced === true && e.radius > 0;
    e.walkLeft = nextWalk(e, t.burrback);
  },

  update(e, _index, info) {
    const { scene, events, stir } = info;
    const B = info.t.burrback;
    const p = info.state.player;
    if (e.alertCd > 0) e.alertCd--;
    if (e.strikeCd > 0) e.strikeCd--;
    if (e.roused > 0) e.roused--;
    if (e.stirred > 0) e.stirred--;
    const free = (e.mode === 'walk' || e.mode === 'pause' || e.mode === 'alert') && e.knockVx === 0;
    // Curled (a down cut landed): it holds until it may brace again, then uncurls, into a brace at
    // her if she is near, over it included (one pogo an exchange).
    if (e.tuck > 1) e.tuck--;
    else if (e.tuck === 1 && e.strikeCd === 0 && e.mode !== 'hurt' && e.mode !== 'recover') {
      if (free && brace(e, info, true)) return true;
      // (Not while she hangs over it out of a brace's reach, on a branch above it or dropping onto
      // it: it stays curled until she is down on its ground, or away.)
      if (B.strikePx <= 0 || !overhead(e, p, B)) e.tuck = 0;
    }
    // She drops onto it from high above: it gets out from under her.
    if (free && e.calm === 0 && dodgeDrop(e, info)) return true;
    // She is in front of it, close: it braces (out of a walk, a rest, a turn or a flinch).
    if (free && brace(e, info)) return true;
    // Round 3 (memory/giving.md): she is near and too dark to be seen, and it is not in a fight with
    // her: it sleeps where it stands (no patrol) until she carries light again, leaves, or cuts it.
    e.dozing = false;
    if (
      B.dozePx > 0 &&
      (e.mode === 'walk' || (e.mode === 'pause' && !e.turning)) &&
      e.knockVx === 0 &&
      e.roused === 0 &&
      e.stirred === 0 &&
      e.tuck === 0 &&
      p.hp > 0 &&
      p.faded === 0 &&
      seenNow(info.state, info.t) === 0
    ) {
      const dx = p.x + p.w / 2 - (e.x + e.w / 2);
      const dy = p.y + p.h / 2 - (e.y + e.h / 2);
      if (dx * dx + dy * dy <= B.dozePx * B.dozePx) {
        e.dozing = true;
        e.vx = 0;
        return true;
      }
    }
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
        // The blow broke its brace (it came from behind or from above): it stands winded.
        if (e.broken) {
          spend(e, info, 'spent', true);
          return false;
        }
        // Still winded from its ram: it stands on, open, until that has passed.
        const winded = e.strikeCd - frames(B.strikeCooldown);
        if (winded > 0) {
          setMode(e, 'recover', winded);
          return false;
        }
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
        brace(e, info);
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
    // (Only at one it can see: empty-handed she lands beside it unnoticed, unless she has cut it.)
    if (
      stir !== '' &&
      e.alertCd === 0 &&
      (e.roused > 0 || seenNow(info.state, info.t) > 0) &&
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
    e.roused = 0;
    e.stirred = 0;
    const turning = e.mode === 'pause' && e.turning;
    setMode(e, 'pause', n);
    e.turning = turning;
    e.vx = 0;
  },

  /**
   * A glint she gave reached it: whatever it was doing (braced, ramming, winded, curled) it stops,
   * lowers and stands `giving.giftStandFrames`, then walks its round again, calm (the framework set
   * `calm` / `gift`: its touch does nothing and it braces at nothing until they run out).
   */
  gift(e, info) {
    const n = frames(info.t.giving.giftStandFrames, 1);
    e.tuck = 0;
    e.chargeLeft = 0;
    e.broken = false;
    e.knockVx = 0;
    e.rx = 0;
    setMode(e, 'pause', n);
    e.vx = 0;
    return n;
  },

  /**
   * It sees her (memory/giving.md): she carries light, her body centre is within `noticePx` of its
   * centre scaled by how much, and nothing solid is between. It lifts its head (render); what it
   * does about her is still the brace's rules (in front, in reach, in its range).
   */
  sees(e, info, seen) {
    if (seen === 0) return false;
    const p = info.state.player;
    if (p.hp <= 0 || p.faded > 0) return false;
    const r = info.t.burrback.noticePx * seenScale(seen, info.t.giving);
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;
    if ((px - ex) * (px - ex) + (py - ey) * (py - ey) > r * r) return false;
    return !segmentBlocked(info.scene, ex, ey, px, py);
  },

  /** Inside a lit lantern's sanctuary (it was there when the lantern caught, or was shoved in): harmless. */
  harmless(e, info) {
    return groundSanctuaryDepth(info.state, info.scene, info.t.goal, e.x, e.x + e.w, e.y + e.h) > 0;
  },

  /** Its touch hurt her (or met her kindling): it is shoved back from her, flinches, and turns away. */
  touched(e, info, dir) {
    if (e.mode === 'dead') return;
    const B = info.t.burrback;
    const away = dir > 0 ? -1 : 1;
    // Its ram hit her: it bounces back off her, turns away and stands spent.
    // Its next ram may not reach her sooner than `rehitGapFrames` after her safety has run out.
    const rehit = frames(info.t.health.invulnFrames + B.rehitGapFrames) - frames(B.windupFrames, 1) - 1;
    if (e.mode === 'windup' || e.mode === 'charge') {
      e.facing = away;
      spend(e, info, 'touch');
      e.strikeCd = Math.max(e.strikeCd, rehit);
      e.knockVx = away * Math.max(0, B.touchRecoil);
      e.teeter = 0;
      e.alertCd = e.timer + frames(B.alertCooldown);
      return;
    }
    const n = frames(B.touchFlinchFrames, 1);
    setMode(e, 'alert', n);
    e.strikeCd = Math.max(e.strikeCd, n + frames(B.strikeCooldown), rehit);
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

  /**
   * Braced, a forward cut from the side it faces glances off its shell; a down cut glances off a
   * braced shell (its top) and off a curled one (she bounces off it: the pogo without the blow).
   */
  blocks(e, dir, px) {
    if (dir === 'down') return e.braced || e.tuck > 0;
    return e.braced && dir === 'fwd' && (px - (e.x + e.w / 2)) * e.facing > 0;
  },

  /** Along a forward cut; an up / down cut pushes it aside, away from her, less hard. */
  shove(e, dir, side, knockback, t) {
    const k = knockback * t.burrback.knockScale;
    const kb = dir === 'fwd' ? k : k * t.burrback.knockVertical;
    // Cut, it is roused: it will come round to her and brace. A blow that lands on a braced one broke its brace.
    e.roused = Math.max(e.roused, frames(t.burrback.rouseFrames));
    e.broken = e.braced;
    // A down cut (a pogo) curls it up: the next ones glance off until it has uncurled.
    if (dir === 'down') e.tuck = Math.max(2, frames(t.burrback.tuckFrames));
    e.knockVx = side * kb;
    e.knockVy = 0;
    e.rx = 0;
    e.teeter = 0;
    return kb;
  },
};
