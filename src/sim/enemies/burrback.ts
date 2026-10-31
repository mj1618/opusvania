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
import { seenScale } from '../seen';
import type { EnemyState, PlayerState } from '../state';
import type { Tuning } from '../tuning';
import {
  frames,
  gap2,
  heldUnseen,
  type KindRules,
  mix,
  type StepInfo,
  segmentBlocked,
  setMode,
} from './common';
import { seenBy } from './senses';

/** The numbers of this burrback: the plain one's, or the old burrback's (a variant row, tuning.ts). */
type Row = Tuning['burrback'];
function rowOf(t: Tuning, e: EnemyState): Row {
  return e.kind === 'oldBurrback'
    ? t.oldBurrback
    : e.kind === 'juvenileBurrback'
      ? t.juvenileBurrback
      : t.burrback;
}

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
  const t = rowOf(info.t, e);
  const G = info.t.goal;
  span(e, scene, t);
  // (The Keeper blind in P2's dark: it goes for where it saw her last, slowly, and sniffs there.)
  if (e.keep > 0 && e.blind > 0) {
    seek(e, info, t);
    return;
  }
  // The old burrback hunts its den: it comes round to her when she is on its ground behind it.
  if (t.hunt && seenBy(e, info) > 0) {
    const p = state.player;
    const pc = p.x + p.w / 2;
    const ec = e.x + e.w / 2;
    const side = pc < ec ? -1 : 1;
    const level = Math.abs(p.y + p.h - (e.y + e.h)) <= t.provokedPx;
    if (level && side !== e.facing && Math.abs(pc - ec) > e.w) {
      e.vx = 0;
      turn(e, t, events, 'hunt');
      return;
    }
  }
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
  // (Hunting, it closes the distance quickly: no 8 s waddle across its den. It never walks into her: it
  // stops a step short and braces when it may.)
  if (t.hunt && seenBy(e, info) > 0) {
    const p = state.player;
    const level = Math.abs(p.y + p.h - (e.y + e.h)) <= t.provokedPx;
    const gap = e.facing > 0 ? p.x - (e.x + e.w) : e.x - (p.x + p.w);
    // Too close to brace at (or she is inside it): it backs away from her, turned to face her.
    const dxc = p.x + p.w / 2 - (e.x + e.w / 2);
    if (level && t.strikeMinPx > 0 && Math.abs(dxc) - (p.w + e.w) / 2 < t.strikeMinPx) {
      const back = dxc < 0 ? 1 : -1;
      e.facing = back > 0 ? -1 : 1;
      e.vx = back * t.speed;
      let n = Math.max(1, Math.round(t.speed));
      while (n-- > 0 && nudge(e, scene, back, 0) === 0) e.stride += 1;
      e.rx = 0;
      return;
    }
    if (level && gap > -p.w && gap <= t.huntStopPx) {
      e.vx = 0;
      e.rx = 0;
      return;
    }
    const far = Math.abs(p.x + p.w / 2 - (e.x + e.w / 2)) > t.huntFarPx;
    if (t.huntSpeed > 0 && far && level) e.vx = e.facing * t.huntSpeed;
  }
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
  const B = rowOf(info.t, e);
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
  const B = rowOf(info.t, e);
  const p = info.state.player;
  if (B.strikePx <= 0 || e.strikeCd > 0 || e.calm > 0 || heldUnseen(e, p)) return false;
  if (p.hp <= 0 || p.faded > 0 || p.kindling >= 0 || p.kindlingLamp >= 0 || info.state.goal.gathered)
    return false;
  // (The Keeper: going for a moth it braces at nothing; in P2's dark it cannot see her to brace at.)
  if (e.keep > 0 && (e.feedX >= 0 || e.blind > 0)) return false;
  // (Not at one dropping onto it from high above, nor at one in the air right over it, coming down
  // on it: its touch would land with the tell. It braces once she is down.)
  if (dropping(e, p, B)) return false;
  if (!over && !p.grounded && p.x < e.x + e.w && e.x < p.x + p.w) return false;
  const provoked = e.roused > 0;
  // It sees her by the light she carries (memory/giving.md): empty-handed she is unseen; the more she
  // carries, the further off it braces. One she has cut it knows, whatever she carries.
  const seen = seenBy(e, info);
  if (!provoked && seen === 0) return false;
  const reach = provoked ? B.provokedPx : B.strikePx * seenScale(seen, info.t.giving);
  const front = inFront(e, info, reach, e.facing, over);
  const round = (provoked || e.stirred > 0) && !front && inFront(e, info, reach, -e.facing, over);
  if (!round && !front) return false;
  // (Too close to answer: the old burrback backs off first (`walk`), then braces from `strikeMinPx`.)
  if (B.strikeMinPx > 0) {
    const pc = p.x + p.w / 2;
    const gap = Math.abs(pc - (e.x + e.w / 2)) - (p.w + e.w) / 2;
    // (With no room behind it to back into, it braces where it is.)
    span(e, info.scene, B);
    const behind = pc < e.x + e.w / 2 ? MAX_X - (e.x + e.w) : e.x - MIN_X;
    if (gap < B.strikeMinPx && behind > 8) return false;
  }
  if (sheltered(e, info)) return false;
  // (The old burrback braces at her under a ledge too (`braceUnderRoof`): its ram pulls up at the ledge's mouth, open.)
  if (!B.braceUnderRoof && lowCeiling(info.scene, p.x, p.y, p.w, p.h, B.strikeHeadroomPx)) return false;
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
  startBrace(e, info, B);
  return true;
}

/** The brace begins (`windup`, `enemyWindup`): facing as it is. */
function startBrace(e: EnemyState, info: StepInfo, B: Row, tell = -1, px = -1): void {
  // (The Keeper's P3 rams are its own, the Canopy r13: shorter.)
  const p3Px = e.keep > 0 ? info.t.keeper.p3ChargePx : B.p3ChargePx;
  e.chargeLeft = frames(px >= 0 ? px : e.phase === 3 ? p3Px : B.chargePx, 1);
  let n = tell >= 0 ? frames(tell, 1) : tellFrames(e, B);
  // (The Canopy r15, review r14 #6: the Keeper's first fast ram after its rage beat is told longer: a bridge.)
  const bridge = tell < 0 && bridged(e, info);
  if (bridge) n = frames(n * info.t.keeper.bridgeTell, 1);
  // (Round 6: braced closer than `strikeMinPx` (no room behind it to back off), the tell is longer by what the
  // ram would have taken to cover the difference: never less time to answer than from `strikeMinPx`.)
  if (B.strikeMinPx > 0 && tell < 0) {
    const p = info.state.player;
    const gap = Math.abs(p.x + p.w / 2 - (e.x + e.w / 2)) - (p.w + e.w) / 2;
    if (gap < B.strikeMinPx) n += frames((B.strikeMinPx - Math.max(0, gap)) / Math.max(1, B.chargeSpeed));
  }
  // (Curled, it uncurls into the brace.)
  e.tuck = 0;
  // (A fresh exchange: the old burrback's feint comes first, one pogo a brace, its shell shut.)
  e.feints = 0;
  e.pogoed = false;
  e.stunned = false;
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
    speed:
      e.rams < B.firstTellRams
        ? B.chargeSpeed * B.firstRamSpeedMult
        : bridge
          ? B.chargeSpeed * info.t.keeper.bridgeSpeed
          : B.chargeSpeed,
  });
}

/** The Keeper's bridge (the Canopy r15): its first fast ram after the rage beat (`boss.bridge` 1, P1). */
function bridged(e: EnemyState, info: StepInfo): boolean {
  return (
    e.keep > 0 && e.phase <= 1 && info.state.boss?.bridge === 1 && e.rams >= info.t.oldBurrback.firstTellRams
  );
}

/**
 * Round 5 (area1-plan-r5 §6d: "the beetle rule clicks only at the boss"): she stands on a step just past
 * the end of its range, the step's face a wall at its body height, her feet 24..`stepRamPx` over its floor
 * and within `strikePx` of the face: it braces at her anyway and rams the face. A wall stops it: in a lamp
 * room it flips belly-up (`wallFlip`), and she sees the belly before she has to use it (R4's root step).
 */
function stepBrace(e: EnemyState, info: StepInfo, B: Row): boolean {
  const p = info.state.player;
  if (B.stepRamPx <= 0 || B.strikePx <= 0 || e.sense === 0 || e.strikeCd > 0 || e.calm > 0) return false;
  if (p.hp <= 0 || p.faded > 0 || !p.grounded || heldUnseen(e, p) || p.kindling >= 0 || p.kindlingLamp >= 0)
    return false;
  if (e.roused === 0 && seenBy(e, info) === 0) return false;
  const rise = e.y + e.h - (p.y + p.h);
  if (rise < 24 || rise > B.stepRamPx) return false;
  span(e, info.scene, B);
  const side = p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1;
  const face = side > 0 ? RANGE_R : RANGE_L;
  // (The range ends at a wall on her side: the step's face.)
  if (!solidAt(info.scene, side > 0 ? face : face - 1, e.y, 1, e.h - 2)) return false;
  const past = side > 0 ? p.x - face : face - (p.x + p.w);
  if (past < -p.w / 2 || past > B.strikePx) return false;
  // (Not from point blank either: room for a ram that reaches the face.)
  if ((side > 0 ? face - (e.x + e.w) : e.x - face) < 24) return false;
  if (e.facing !== side) {
    e.facing = side;
    info.events.push({
      type: 'enemyTurn',
      id: e.id,
      kind: e.kind,
      x: e.x + e.w / 2,
      y: e.y + e.h / 2,
      dir: e.facing,
      cause: 'hunt',
      frames: 0,
    });
  }
  e.stunned = false;
  startBrace(e, info, B);
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
  const B = rowOf(info.t, e);
  const tired = e.rams > 0;
  // (A ram that hit her is no opening: the old burrback stops, turns and goes back to brace.)
  const touch = cause === 'touch' && B.touchRecoverFrames > 0;
  const n = frames(
    touch
      ? B.touchRecoverFrames
      : cause === 'wall'
        ? B.recoverWallFrames
        : tired
          ? B.recoverTiredFrames
          : B.recoverFrames,
    1,
  );
  const cooldown = frames(B.strikeCooldown);
  setMode(e, 'recover', n);
  e.vx = 0;
  e.rx = 0;
  e.chargeLeft = 0;
  // (The old burrback: winded, its shell is open (`openWinded`: after any ram; else only a wall stun).)
  // Only a ram that missed her or met a wall lays it open: the window is earned (feel review r2).
  // (Round 5: in a lamp room any ram that meets a wall flips it belly-up, open: `wallFlip`.)
  e.stunned =
    (B.pogoShell && !touch && (cause === 'wall' || B.openWinded)) ||
    (cause === 'wall' && B.wallFlip && e.sense !== 0);
  e.taken = 0;
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
  if (e.phase === 3) desperate(e, info, B, cause);
  // (Phases 1-2: a missed ram opens it for `missOpenHits` cuts, a wall (or a flip) for `openHits`.)
  else if (e.phase > 0) e.streak = cause === 'wall' ? B.openHits : B.missOpenHits;
}

/**
 * Phase 3's ram is over (round 5): into the taproot it is stunned long (`enemyTaproot`; the second time for
 * good: her last cut); into a wall, the usual stun; otherwise it turns and rams again at once, `p3Streak`
 * in a row, then rests (shut).
 */
function desperate(e: EnemyState, info: StepInfo, B: Row, cause: string): void {
  if (cause === 'wall') {
    e.streak = 0;
    const front = e.facing > 0 ? e.x + e.w : e.x;
    if (e.targetX >= 0 && front >= e.targetX - 8 && front <= e.targetY + 8) {
      e.taps++;
      const n = frames(e.taps >= 2 ? B.lastStunFrames : B.taprootFrames, 1);
      e.timer = n;
      e.stunned = true;
      e.strikeCd = n + frames(B.strikeCooldown);
      info.events.push({
        type: 'enemyTaproot',
        id: e.id,
        kind: e.kind,
        x: front,
        y: e.y + e.h / 2,
        n: e.taps,
        frames: n,
      });
    }
    return;
  }
  e.stunned = false;
  // (A ram that hit her ends the run of rams: it rests, as after the last. So does one that ended under a
  // ledge: no ram after ram into a corner.)
  const roofed = lowCeiling(info.scene, e.x, e.y, e.w, e.h, B.strikeHeadroomPx);
  // (The Keeper's come in pairs, the Canopy r13.)
  const run = e.keep > 0 ? info.t.keeper.p3Streak : B.p3Streak;
  e.streak = cause === 'touch' || roofed ? run : e.streak + 1;
  if (e.streak < run) {
    e.timer = 1;
    e.strikeCd = 1;
  } else {
    e.streak = 0;
    e.timer = frames(B.p3RestFrames, 1);
    e.strikeCd = e.timer + 1;
    // (The Keeper, the Canopy r13: after its pair it stands winded, open: the pair's answer.)
    if (e.keep > 0) {
      e.stunned = true;
      e.taken = 0;
      e.timer = frames(info.t.keeper.p3PairRest, 1);
      e.strikeCd = e.timer + 1;
    }
  }
}

/** The cuts an open window takes: `openHits`, phase 3's `p3OpenHits`, none at all after the second taproot. */
function openHitsOf(e: EnemyState, B: Row): number {
  if (e.phase === 3) return e.taps >= 2 ? 0 : B.p3OpenHits;
  return e.phase > 0 && e.streak > 0 ? e.streak : B.openHits;
}

/**
 * The slam (round 5, anti-camp; the big one at phase 2): `enemySlam`; she stands on a ledge (any top over
 * its den floor) within `slamReachPx`: she is shaken off it, toward it.
 */
function slam(e: EnemyState, info: StepInfo, B: Row, big: boolean, wave = false): void {
  const p = info.state.player;
  const cx = e.x + e.w / 2;
  const pc = p.x + p.w / 2;
  const past = refuge(e, p);
  // (Not while she aims a fling: the moment is hers.)
  const shook =
    p.hp > 0 &&
    p.faded === 0 &&
    p.fling < 0 &&
    (p.y + p.h < e.fromY - B.campRisePx ||
      past ||
      lowCeiling(info.scene, p.x, p.y, p.w, p.h, B.strikeHeadroomPx)) &&
    Math.abs(pc - cx) <= B.slamReachPx;
  if (shook) {
    // (Toward the middle of its den (its home), off the ledge and out from under it; from past the taproot,
    // back under it to its side, harder.)
    const d = past ? (cx < pc ? -1 : 1) : e.homeX < pc ? -1 : 1;
    p.kickX = d * (past ? B.slamRefugeKick : B.slamKick);
    // (Along the floor from past the root: lifted, she would meet its underside.)
    if (!past) {
      p.vy = -B.slamLift;
      p.grounded = false;
    }
  }
  e.camp = 0;
  // (She is down off her ledge: a beat to find her feet before it may brace.)
  e.strikeCd = Math.max(e.strikeCd, frames(B.slamCalmFrames));
  // (A slam told by its rear sends a wave along its floor: round 6.)
  if (wave && B.slamWaveSpeed > 0) {
    // (The Canopy r15, review r14 #2: the Keeper's wave starts `waveDelay` frames after the slam: a crack opens at
    // its feet first, so the front is seen running before it arrives.)
    const delay = e.keep > 0 ? frames(info.t.keeper.waveDelay) : 0;
    e.waveX = cx;
    if (delay > 0) e.waveWait = delay;
    else e.wave = 1;
    if (e.keep > 0)
      info.events.push({
        type: 'keeperWave',
        id: e.id,
        phase: 'slam',
        x: Math.round(cx),
        y: Math.round(e.fromY),
        x0: Math.round(cx - B.slamReachPx),
        x1: Math.round(cx + B.slamReachPx),
        frames: delay,
        speed: B.slamWaveSpeed,
      });
  }
  info.events.push({
    type: 'enemySlam',
    id: e.id,
    kind: e.kind,
    x: cx,
    y: e.fromY,
    big,
    shook,
    px: B.slamReachPx,
  });
}

/**
 * The Canopy r15 (review r14 #2: 6 of 8 hits were the wave, most at the fallen cage with its rear behind her): in P3
 * the Keeper never rears for its rotation's slam within `cageSlamPx` of her while she is within `cageNearPx` of the
 * cage (it rams instead).
 */
function cageClose(e: EnemyState, info: StepInfo): boolean {
  const b = info.state.boss;
  if (e.keep === 0 || e.phase !== 3 || !b) return false;
  const K = info.t.keeper;
  const p = info.state.player;
  const pc = p.x + p.w / 2;
  return Math.abs(pc - b.cageX) <= K.cageNearPx && Math.abs(pc - (e.x + e.w / 2)) < K.cageSlamPx;
}

/** She is past the taproot from it (the strip it cannot reach: the root stops a body 96 tall, not hers). */
function refuge(e: EnemyState, p: { x: number; w: number }): boolean {
  if (e.targetX < 0) return false;
  const cx = e.x + e.w / 2;
  return cx < e.targetX ? p.x >= e.targetY : p.x + p.w <= e.targetX;
}

/** A phase begins (`enemyPhase`): 2 = a big slam, then it curls and rolls; 3 = a beat, then the desperate rams. */
function toPhase(e: EnemyState, info: StepInfo, B: Row, n: number): void {
  e.phase = n;
  e.taps = 0;
  e.streak = 0;
  e.stunned = false;
  e.taken = 0;
  e.knockVx = 0;
  e.vx = 0;
  e.rx = 0;
  info.events.push({
    type: 'enemyPhase',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    phase: n,
  });
  if (n === 3) douse(e, info);
  if (n === 2) {
    slam(e, info, B, true);
    // (The plug first cracks: the spawn's `crack` flag (staging's), else `<id>:rolled`. A retry skips the long
    // beat: the save has the flag already.)
    const key = info.scene.enemies?.find((q) => q.id === e.id)?.crack ?? `${e.id}:rolled`;
    const flags = info.state.save.flags;
    const retry = flags.includes(key);
    if (!retry) {
      flags.push(key);
      info.events.push({ type: 'flagSet', flag: key, by: e.id, x: e.x + e.w / 2, y: e.y + e.h / 2 });
    }
    setMode(e, 'curl', frames(retry ? B.transRetryFrames : B.transFrames, 1));
  } else setMode(e, 'curl', frames(B.recurlFrames, 1));
}

/**
 * Phase 3 plants it: the lamp its spawn names (`snuffs`) goes out (`lureSnuff`, no moths, no heal), so the den
 * darkens for the last phase. Room-local: a retry finds the lamp burning again.
 */
function douse(e: EnemyState, info: StepInfo): void {
  const id = info.scene.enemies?.find((q) => q.id === e.id)?.snuffs;
  const lures = info.scene.lures ?? [];
  const i = id ? lures.findIndex((l) => l.id === id) : -1;
  const l = lures[i];
  const L = info.state.lures;
  if (!l || (L.hp[i] ?? 0) <= 0) return;
  L.hp[i] = 0;
  L.out[i] = info.state.frame + 1;
  L.snuffed++;
  info.events.push({
    type: 'lureSnuff',
    id: l.id,
    kind: l.kind,
    x: l.x,
    y: l.y,
    dir: 'down',
    moths: 0,
    freed: L.freed,
    snuffed: L.snuffed,
    heal: 0,
    side: 0,
  });
}

/** Curled, it rolls at her (`enemyRoll`). */
function startRoll(e: EnemyState, info: StepInfo, B: Row): void {
  const p = info.state.player;
  e.facing = p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1;
  // (Against a wall (she is over it, on a ledge in the corner): it rolls out, the other way.)
  if (solidAt(info.scene, e.facing > 0 ? e.x + e.w : e.x - 1, e.y, 1, e.h - 2))
    e.facing = e.facing > 0 ? -1 : 1;
  setMode(e, 'roll', 0);
  e.ramSpeed = B.rollSpeed;
  // (`taps` counts this roll's wall bounces in phase 2.)
  e.taps = 0;
  e.rx = 0;
  info.events.push({
    type: 'enemyRoll',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    dir: e.facing,
    speed: e.ramSpeed,
  });
}

/** Out of its roll (a pogo, her thrown body, a throw-cut): belly-up, open, as after a wall (`enemyUnroll`). */
function unroll(e: EnemyState, info: StepInfo, how: 'pogo' | 'thrown' | 'heavy' | 'tired'): void {
  info.events.push({ type: 'enemyUnroll', id: e.id, kind: e.kind, x: e.x + e.w / 2, y: e.y + e.h / 2, how });
  e.ramSpeed = 0;
  e.vx = 0;
  // (However it ends, it lies open as after a wall: long enough to cross its den to it.)
  spend(e, info, 'wall');
  e.stunned = true;
}

/** One step of the roll: across its den, bouncing off walls (and brinks), faster each time. Its touch is live. */
function roll(e: EnemyState, info: StepInfo, B: Row): boolean {
  const p = info.state.player;
  for (let i = info.first; i < info.events.length; i++) {
    const ev = info.events[i];
    if (ev?.type === 'enemyBlock' && ev.id === e.id && ev.slash === 'down') {
      unroll(e, info, 'pogo');
      return false;
    }
  }
  // (Curled, it is a ball `rollTouchPx` across at its feet's middle: a jump clears it.)
  const top = e.y + e.h - B.rollTouchPx;
  const bx = e.x + e.w / 2 - B.rollTouchPx / 2;
  const over = p.x < bx + B.rollTouchPx && bx < p.x + p.w && p.y < e.y + e.h && top < p.y + p.h;
  if (over && p.thrown && p.lureThrow > 0) {
    unroll(e, info, 'thrown');
    p.vy = -info.t.attack.pogoSpeed;
    return false;
  }
  // (Coming down on top of the ball (her feet over its top a step ago): a pogo, slash or not.)
  if (over && !p.grounded && p.vy > 0 && p.y + p.h - p.vy <= top + info.t.enemies.stompPx) {
    unroll(e, info, 'pogo');
    p.vy = -info.t.attack.pogoSpeed;
    return false;
  }
  e.vx = e.facing * e.ramSpeed;
  e.rx += e.vx;
  let n = roundHalfAway(e.rx);
  e.rx -= n;
  while (n !== 0) {
    const d = n > 0 ? 1 : -1;
    // (A ledge's mouth turns it as a wall does: under an escape ledge she is never rolled over.)
    if (roofAhead(e, info.scene, d, B.strikeHeadroomPx) || nudge(e, info.scene, d, 0) !== 0) {
      e.facing = d > 0 ? -1 : 1;
      e.rx = 0;
      e.ramSpeed = Math.min(B.rollMax, e.ramSpeed + B.rollAccel);
      info.events.push({
        type: 'enemyBounce',
        id: e.id,
        kind: e.kind,
        x: d > 0 ? e.x + e.w : e.x,
        y: e.y + e.h / 2,
        dir: e.facing,
        speed: e.ramSpeed,
      });
      // (Anti-camp in the roll: the wall it meets shakes her off her ledge.)
      if (e.camp >= frames(B.campFrames)) slam(e, info, B, false);
      // (No standoff: after `rollTireBounces` walls it rolls itself dizzy and lies open, briefly.)
      if (++e.taps >= B.rollTireBounces) {
        e.taps = 0;
        unroll(e, info, 'tired');
        return false;
      }
      break;
    }
    n -= d;
  }
  return true;
}

/**
 * The Keeper's phase `n` begins (src/sim/boss/keeper.ts, the Canopy r12): 2 = the big slam (the cage's root tears),
 * a beat curled, then it hunts by the swinging light; 3 = the den's lamp out (`snuffs`), a beat, the desperate rams.
 */
export function keeperPhase(e: EnemyState, info: StepInfo, n: number): void {
  const B = rowOf(info.t, e);
  e.feedX = -1;
  e.blind = 0;
  e.seekX = -1;
  e.tuck = 0;
  e.braced = false;
  e.chargeLeft = 0;
  e.hitstop = 0;
  if (e.mode === 'dead') return;
  e.stunned = false;
  toPhase(e, info, B, n);
}

/**
 * The Keeper rams on its boss's word (the Canopy r13): P2's lunge when the light finds her, P3's turn on her for a cut
 * on its cage. Facing `dir`, a `tell`-frame brace, then a ram of `px` (the usual `enemyWindup` / `enemyCharge`).
 */
export function keeperRam(e: EnemyState, info: StepInfo, dir: number, tell: number, px: number): void {
  const B = rowOf(info.t, e);
  e.feedX = -1;
  e.seekX = -1;
  e.stunned = false;
  e.knockVx = 0;
  e.strikeCd = 0;
  if (dir !== e.facing) {
    e.facing = dir < 0 ? -1 : 1;
    info.events.push({
      type: 'enemyTurn',
      id: e.id,
      kind: e.kind,
      x: e.x + e.w / 2,
      y: e.y + e.h / 2,
      dir: e.facing,
      cause: 'hunt',
      frames: 0,
    });
  }
  startBrace(e, info, B, tell, px);
}

/**
 * The Keeper blind (P2's dark, the Canopy r12): it walks slowly to `seekX` (where it saw her last, or where a blow
 * came from), sniffs there (`pause`), then patrols.
 */
function seek(e: EnemyState, info: StepInfo, t: Row): void {
  const K = info.t.keeper;
  if (e.seekX < 0) {
    // (Nothing to go for: it patrols its den, turning at walls.)
    e.vx = e.facing * t.speed;
    stepAlong(e, info, t, e.facing, t.speed);
    return;
  }
  const cx = e.x + e.w / 2;
  const d = e.seekX - cx;
  if (Math.abs(d) <= K.seekStopPx) {
    e.seekX = -1;
    e.vx = 0;
    setMode(e, 'pause', frames(K.sniffFrames, 1));
    e.turning = false;
    return;
  }
  const dir = d < 0 ? -1 : 1;
  if (dir !== e.facing) {
    e.facing = dir;
    info.events.push({
      type: 'enemyTurn',
      id: e.id,
      kind: e.kind,
      x: cx,
      y: e.y + e.h / 2,
      dir,
      cause: 'hunt',
      frames: 0,
    });
  }
  stepAlong(e, info, t, dir, K.seekSpeed);
}

/** Moves it `speed` px/f along its floor toward `dir` (sub-pixel carried), turning at a wall or a brink. */
function stepAlong(e: EnemyState, info: StepInfo, t: Row, dir: number, speed: number): void {
  e.rx += dir * speed;
  let n = roundHalfAway(e.rx);
  e.rx -= n;
  const x0 = e.x;
  while (n !== 0) {
    const stop = nudge(e, info.scene, dir, 0);
    if (stop !== 0) {
      e.rx = 0;
      e.vx = 0;
      turn(e, t, info.events, 'wall');
      return;
    }
    e.stride += 1;
    n -= dir;
  }
  e.vx = e.x - x0;
}

/**
 * The Keeper goes for a moth (`feed`, the Canopy r12): it hurries to `feedX` at its hunt speed, braces at nothing,
 * and waits there for its boss to say it eats (`eat`: head down, open). Returns false (its body is harmless).
 */
function feed(e: EnemyState, info: StepInfo, t: Row): boolean {
  const K = info.t.keeper;
  if (e.feedX < 0) {
    setMode(e, 'walk', 0);
    e.vx = 0;
    return false;
  }
  const cx = e.x + e.w / 2;
  const d = e.feedX - cx;
  if (Math.abs(d) <= K.feedStopPx) {
    e.vx = 0;
    e.rx = 0;
    return false;
  }
  const dir = d < 0 ? -1 : 1;
  if (dir !== e.facing) {
    e.facing = dir;
    info.events.push({
      type: 'enemyTurn',
      id: e.id,
      kind: e.kind,
      x: cx,
      y: e.y + e.h / 2,
      dir,
      cause: 'hunt',
      frames: 0,
    });
  }
  const speed = Math.min(K.feedSpeed, Math.abs(d) - K.feedStopPx + 1);
  e.rx += dir * speed;
  let n = roundHalfAway(e.rx);
  e.rx -= n;
  const x0 = e.x;
  while (n !== 0 && nudge(e, info.scene, dir, 0) === 0) {
    e.stride += 1;
    n -= dir;
  }
  if (n !== 0) e.rx = 0;
  e.vx = e.x - x0;
  void t;
  return false;
}

/**
 * The slam's floor wave runs out each way; a front that crosses her feet on its floor hurts her. (The Canopy r15: every
 * step whatever its mode: in the Keeper's feed, eat and sweep the fronts stood still on the floor and ran on after,
 * from beside her feet: review r14 #2's "the wave began at her feet". The Keeper's start `waveDelay` after the slam.)
 */
function waveStep(e: EnemyState, info: StepInfo, B: Row): void {
  const p = info.state.player;
  e.waveHit = false;
  if (e.waveWait > 0 && --e.waveWait === 0) e.wave = 1;
  if (e.wave <= 0) return;
  const was = e.wave;
  e.wave += B.slamWaveSpeed;
  const onFloor = p.grounded && p.hp > 0 && p.faded === 0 && Math.abs(p.y + p.h - e.fromY) <= 2;
  const l0 = e.waveX - e.wave;
  const l1 = e.waveX - was;
  const r0 = e.waveX + was;
  const r1 = e.waveX + e.wave;
  if (onFloor && ((p.x < l1 && p.x + p.w > l0) || (p.x < r1 && p.x + p.w > r0))) e.waveHit = true;
  if (e.wave >= B.slamReachPx) e.wave = 0;
}

/**
 * The old burrback's boss phases (round 5), each step before its ordinary rules: the camp count, the phase
 * changes, the rear and slam, the curl, the roll. Returns what `update` returns, or null to go on with the
 * ordinary rules (phase 1 and 3's brace and ram, every stagger and open window).
 */
function phaseStep(e: EnemyState, info: StepInfo, B: Row): boolean | null {
  const p = info.state.player;
  const cx = e.x + e.w / 2;
  // (Up off its floor, on a ledge or hopping about one, or tucked under one: the count runs; only her feet
  // on its open floor end it.)
  const near = p.hp > 0 && p.faded === 0 && Math.abs(p.x + p.w / 2 - cx) <= B.slamReachPx;
  // (Under a ledge counts in the roll only: its rams stop at a ledge's mouth, open, and that is a window.
  // Past the taproot, where it cannot follow, counts always.)
  const up =
    near &&
    (p.y + p.h < e.fromY - B.campRisePx ||
      refuge(e, p) ||
      (e.phase === 2 && p.grounded && lowCeiling(info.scene, p.x, p.y, p.w, p.h, B.strikeHeadroomPx)));
  if (up) e.camp++;
  else if (p.grounded || p.hp <= 0 || p.faded > 0) e.camp = 0;
  if (e.mode === 'hurt' || e.mode === 'dead') return null;
  // (The Keeper's phases are its boss's: src/sim/boss/keeper.ts calls `keeperPhase`.)
  if (e.keep > 0) {
    // (no change here)
  } else if (e.phase === 1 && e.hp <= Math.floor(e.hpMax * B.p2At)) {
    toPhase(e, info, B, 2);
    return false;
  }
  if (e.keep === 0 && e.phase === 2 && e.hp <= Math.floor(e.hpMax * B.p3At)) {
    toPhase(e, info, B, 3);
    return false;
  }
  if (e.mode === 'rear') {
    e.vx = 0;
    if (--e.timer <= 0) {
      slam(e, info, B, false, true);
      setMode(e, 'walk', 0);
    }
    return false;
  }
  if (e.mode === 'curl') {
    e.vx = 0;
    if (--e.timer <= 0) {
      if (e.phase === 2 && e.keep === 0) startRoll(e, info, B);
      else setMode(e, 'walk', 0);
    }
    return false;
  }
  if (e.mode === 'roll') return roll(e, info, B);
  const free = (e.mode === 'walk' || e.mode === 'pause' || e.mode === 'alert') && e.knockVx === 0;
  if (free && e.phase === 2 && e.keep === 0) {
    setMode(e, 'curl', frames(B.recurlFrames, 1));
    return false;
  }
  // (Round 6: in phases 1 and 3, every `slamEveryRams` rams it rears and slams anyway: the wave is a move.)
  const rotation =
    B.slamEveryRams > 0 &&
    e.phase !== 2 &&
    e.strikeCd === 0 &&
    e.rams - e.slams >= B.slamEveryRams &&
    Math.abs(p.y + p.h - e.fromY) <= 2 &&
    !cageClose(e, info);
  if (free && (e.camp >= frames(B.campFrames) || rotation)) {
    e.slams = e.rams;
    const n = frames(B.rearFrames, 1);
    setMode(e, 'rear', n);
    e.camp = 0;
    info.events.push({ type: 'enemyRear', id: e.id, kind: e.kind, x: cx, y: e.y + e.h / 2, frames: n });
    return false;
  }
  return null;
}

/**
 * The ram's speed for one who is in the air in front of it as it starts (she jumped during the tell): fast
 * enough that its whole body passes under her before her feet could come down to its top (counted with the
 * jump let go: the shortest fall), at most `ramUnderMax`; and the ram long enough to carry it past her.
 * 0 when she is on the ground (the ordinary ram: she jumps it as it comes).
 */
/** Its brace's tell, frames. (The first rams of a fight are told longer (area1-plan-r3 #8): `firstTellRams` of them, x `firstTellMult`.) */
/** Open on its back (the old burrback), or inside a lit lantern's sanctuary: it can do her no harm, nor brace. */
function sheltered(e: EnemyState, info: StepInfo): boolean {
  // (Open on its back, staggered by her cuts included, the old burrback's touch does nothing.)
  if (e.stunned) return true;
  return groundSanctuaryDepth(info.state, info.scene, info.t.goal, e.x, e.x + e.w, e.y + e.h) > 0;
}

function tellFrames(e: EnemyState, B: Row): number {
  if (e.phase === 3) return frames(B.p3TellFrames, 1);
  const base = e.span > 0 ? e.span : B.windupFrames;
  return frames(e.rams < B.firstTellRams ? base * B.firstTellMult : base, 1);
}

/** She has jumped (rising, her feet over its top) in front of it, within its ram's reach, not away from it. */
function lunges(e: EnemyState, info: StepInfo): boolean {
  const p = info.state.player;
  if (p.grounded || p.vy >= 0 || p.hp <= 0 || p.faded > 0) return false;
  const pc = p.x + p.w / 2;
  const ec = e.x + e.w / 2;
  if ((pc - ec) * e.facing <= 0) return false;
  if ((p.vx + p.pullX) * e.facing > 0.5) return false;
  const gap = e.facing > 0 ? p.x - (e.x + e.w) : e.x - (p.x + p.w);
  // (Once her feet are over its top: a ram set off sooner would meet her still rising out of its way.)
  return gap <= e.chargeLeft && p.y + p.h <= e.y && p.y + p.h > e.y - e.h;
}

function underJump(e: EnemyState, info: StepInfo, B: Row): number {
  const p = info.state.player;
  if (p.grounded || p.hp <= 0 || p.faded > 0) return 0;
  const pc = p.x + p.w / 2;
  const ec = e.x + e.w / 2;
  if ((pc - ec) * e.facing <= 0) return 0;
  // (Jumping away from it, she is leaving its reach: the ordinary ram, never one stretched to chase her.)
  if ((p.vx + p.pullX) * e.facing > 0.5) return 0;
  const J = info.t.jump;
  // Frames until her feet would be down at its top.
  let y = p.y + p.h;
  let vy = p.vy;
  let k = 0;
  while (k < 120 && (vy < 0 || y < e.y)) {
    vy = Math.min(J.maxFall, vy + J.gravity * (vy < 0 ? J.releaseMult : J.fallMult));
    y += vy;
    k++;
  }
  // Its front to past her far side, plus its own length.
  const gap = e.facing > 0 ? p.x - (e.x + e.w) : e.x - (p.x + p.w);
  const pass = Math.max(0, gap) + e.w + p.w;
  e.chargeLeft = Math.max(e.chargeLeft, Math.ceil(pass + B.underExtraPx));
  return Math.max(B.chargeSpeed, Math.min(B.ramUnderMax, pass / Math.max(1, k - 1)));
}

/** One step of the ram: straight on at `chargeSpeed` until its length is run or something stops it. */
function charge(e: EnemyState, info: StepInfo): void {
  const { scene, state } = info;
  const B = rowOf(info.t, e);
  const G = info.t.goal;
  e.vx = e.facing * (e.ramSpeed || B.chargeSpeed);
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
  const B = rowOf(info.t, e);
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
 * The old burrback asleep in its den wakes: she is whole and down on its ground (grounded, her feet
 * within `strikeAbovePx` of its own), within `wakePx` sideways, with a clear line.
 */
function wakes(e: EnemyState, info: StepInfo, B: Row): boolean {
  const p = info.state.player;
  if (p.hp <= 0 || p.faded > 0 || !p.grounded || B.wakePx <= 0) return false;
  const pc = p.x + p.w / 2;
  const ec = e.x + e.w / 2;
  if (Math.abs(pc - ec) > B.wakePx) return false;
  if (Math.abs(p.y + p.h - (e.y + e.h)) > B.strikeAbovePx) return false;
  return !segmentBlocked(info.scene, ec, e.y + e.h / 2, pc, p.y + p.h / 2);
}

/**
 * She drops onto it (`dropping`, and her box within `dropClearPx` of its own sideways): it hurries
 * out from under her, the shorter way that its ground and range allow, at `dropSpeed`. Returns
 * false if she is not dropping onto it. Where neither way is open it stands.
 */
function dodgeDrop(e: EnemyState, info: StepInfo): boolean {
  const { scene, events } = info;
  const B = rowOf(info.t, e);
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
  // (Both ways open: away from where she is heading, so it never runs to where she will land; else the shorter.)
  if (canL && canR) side = Math.abs(p.vx) > 1 ? (p.vx > 0 ? -1 : 1) : e.x - toL <= toR - e.x ? -1 : 1;
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
  cause: 'ledge' | 'wall' | 'lantern' | 'wary' | 'hunt',
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
    e.walkLeft = nextWalk(e, rowOf(t, e));
    // (A placement may give its brace a longer tell: R4's teaching one. Kept in `span`, unused by crawlers.)
    e.span = Math.max(0, spawn.windup ?? 0);
    // (Round 5, the old burrback: its den floor (feet) and the taproot's x span, -1 = none.)
    e.fromY = Math.round(spawn.y);
    e.targetX = spawn.taproot ? spawn.taproot[0] : -1;
    e.targetY = spawn.taproot ? spawn.taproot[1] : -1;
    // (The old burrback sleeps in its den until she comes down to it.)
    if (rowOf(t, e).asleep) {
      e.mode = 'sleep';
      e.dozing = true;
    }
  },

  /**
   * Its lamp went out (memory/creatures.md): whatever it was doing (braced, ramming, winded, curled)
   * it curls up and sleeps where it stands. Cut, it wakes for the fight (roused), then sleeps again.
   */
  disperse(e) {
    e.tuck = 0;
    e.chargeLeft = 0;
    e.roused = 0;
    e.stirred = 0;
    e.broken = false;
    e.knockVx = 0;
    e.rx = 0;
    e.vx = 0;
    setMode(e, 'sleep', 0);
    e.dozing = true;
    return 'sleep';
  },

  update(e, _index, info) {
    const { scene, events, stir } = info;
    const B = rowOf(info.t, e);
    const p = info.state.player;
    if (e.alertCd > 0) e.alertCd--;
    if (e.strikeCd > 0) e.strikeCd--;
    if (e.roused > 0) e.roused--;
    if (e.stirred > 0) e.stirred--;
    if (e.phase > 0) waveStep(e, info, B);
    const free = (e.mode === 'walk' || e.mode === 'pause' || e.mode === 'alert') && e.knockVx === 0;
    // (Round 4, the pit: only its ram hurts; otherwise its body shoulders her out, never pins her.
    // Not while it lies open: she may stand in it and cut.)
    if (
      B.bodyHarmless &&
      B.risePush > 0 &&
      p.fling < 0 &&
      !e.stunned &&
      (free || e.mode === 'recover' || e.mode === 'hurt' || e.mode === 'windup') &&
      p.x < e.x + e.w &&
      e.x < p.x + p.w &&
      p.y < e.y + e.h &&
      e.y < p.y + p.h &&
      p.y + p.h > e.y + info.t.enemies.stompPx
    ) {
      const away = p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1;
      if (p.kickX * away < B.risePush) p.kickX = away * B.risePush;
    }
    // Asleep (memory/creatures.md): its lamp went out, or an old burrback in its den before she comes
    // down. Curled where it lies, harmless. The old one wakes when she is down near it.
    if (e.mode === 'sleep') {
      e.vx = 0;
      e.dozing = true;
      if (B.asleep && !e.dispersed && wakes(e, info, B)) {
        const n = frames(B.wakeFrames, 1);
        setMode(e, 'wake', n);
        e.dozing = false;
        // (It rises facing the way it slept, and turns to her for the wake's last `wakeTurnFrames`: r11.)
        if (B.wakeTurnFrames <= 0) e.facing = p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1;
        // (Round 6: its gentle first rams are for her very first try only; a later wake rams at full speed.)
        if (B.firstTellRams > 0) {
          const key = `${e.id}:fought`;
          const flags = info.state.save.flags;
          if (flags.includes(key)) e.rams = Math.max(e.rams, B.firstTellRams);
          else flags.push(key);
        }
        events.push({
          type: 'enemyWake',
          id: e.id,
          kind: e.kind,
          x: e.x + e.w / 2,
          y: e.y + e.h / 2,
          dir: e.facing,
          frames: n,
        });
      }
      return false;
    }
    // Waking: the rim to its hunt colour, uncurling. Harmless; it never strikes on her landing.
    if (e.mode === 'wake') {
      e.vx = 0;
      // (Getting up, the old burrback shoulders her out of its body: she is never inside it when it is live.)
      if (
        B.risePush > 0 &&
        p.fling < 0 &&
        p.x < e.x + e.w &&
        e.x < p.x + p.w &&
        p.y < e.y + e.h &&
        e.y < p.y + p.h
      ) {
        const away = p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1;
        if (p.kickX * away < B.risePush) p.kickX = away * B.risePush;
      }
      // (The turn: the wake's last `wakeTurnFrames`, toward her; `enemyTurn` for render.)
      if (B.wakeTurnFrames > 0 && e.timer === frames(B.wakeTurnFrames, 1) + 1) {
        const to = p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1;
        if (to !== e.facing) {
          e.facing = to;
          events.push({
            type: 'enemyTurn',
            id: e.id,
            kind: e.kind,
            x: e.x + e.w / 2,
            y: e.y + e.h / 2,
            dir: to,
            cause: 'wake',
            frames: frames(B.wakeTurnFrames, 1),
          });
        }
      }
      if (--e.timer <= 0) setMode(e, 'walk', 0);
      return false;
    }
    // (The Keeper, the Canopy r12: going for a moth, and head down over it, open: its boss says when.)
    if (e.mode === 'feed') return feed(e, info, B);
    // (The Canopy r14: P3's sweep tell, reared with its claws up: it stands; its boss ends it.)
    if (e.mode === 'sweep') {
      e.vx = 0;
      if (e.knockVx !== 0) knock(e, scene, B);
      return false;
    }
    if (e.mode === 'eat') {
      e.vx = 0;
      if (e.knockVx !== 0) knock(e, scene, B);
      if (--e.timer <= 0) {
        e.knockVx = 0;
        e.stunned = false;
        setMode(e, 'wake', frames(B.riseFrames, 1));
      }
      return false;
    }
    // (Round 5: the old burrback's boss phases: the slam, the roll, the taproot.)
    if (e.phase > 0) {
      const r = phaseStep(e, info, B);
      if (r !== null) return r;
    }
    // Dispersed and out of any fight: back to sleep.
    if (e.dispersed && free && e.roused === 0 && e.stirred === 0 && e.tuck === 0) {
      setMode(e, 'sleep', 0);
      e.vx = 0;
      e.dozing = true;
      return false;
    }
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
    // (On the step past its range: it rams the step's face, round 5.)
    if (free && stepBrace(e, info, B)) return true;
    // The director's beetle hunts landings (wood-area1-director.md): she lands in its light, on its ground,
    // within `landHuntPx`: it turns to her at once (and walks at her: its brace comes as she is in front).
    // (Lamp rooms only: the test grove's tuned fights are left as they were.)
    if (free && stir === 'land' && B.landHuntPx > 0 && e.sense !== 0 && e.calm === 0 && seenBy(e, info) > 0) {
      const pc = p.x + p.w / 2;
      const ec = e.x + e.w / 2;
      const side = pc < ec ? -1 : 1;
      const level = Math.abs(p.y + p.h - (e.y + e.h)) <= B.strikeAbovePx;
      if (level && Math.abs(pc - ec) <= B.landHuntPx && side !== e.facing) {
        e.facing = side;
        if (e.mode !== 'walk') setMode(e, 'walk', 0);
        events.push({
          type: 'enemyTurn',
          id: e.id,
          kind: e.kind,
          x: ec,
          y: e.y + e.h / 2,
          dir: side,
          cause: 'hunt',
          frames: 0,
        });
      }
    }
    // A gentle tell (the juvenile): the first time it sees her it stops and turns to her (`noticeFrames`).
    if (
      free &&
      B.noticeFrames > 0 &&
      e.aware === 0 &&
      e.mode !== 'alert' &&
      burrback.sees?.(e, info, seenBy(e, info))
    ) {
      const pc = p.x + p.w / 2;
      const ec = e.x + e.w / 2;
      e.facing = pc < ec ? -1 : 1;
      const n = frames(B.noticeFrames, 1);
      setMode(e, 'alert', n);
      e.vx = 0;
      events.push({
        type: 'enemyNotice',
        id: e.id,
        kind: e.kind,
        x: ec,
        y: e.y + e.h / 2,
        dir: e.facing,
        frames: n,
      });
      return true;
    }
    // Round 3 (memory/giving.md): she is near and too dark to be seen, and it is not in a fight with
    // her: it sleeps where it stands (no patrol) until she carries light again, leaves, or cuts it.
    e.dozing = false;
    if (
      B.dozePx > 0 &&
      // (Mid-turn too, round 4: it lies down the step she comes within `dozePx`, never at 100 px.)
      (e.mode === 'walk' || e.mode === 'pause') &&
      e.knockVx === 0 &&
      e.roused === 0 &&
      e.stirred === 0 &&
      e.tuck === 0 &&
      p.hp > 0 &&
      p.faded === 0 &&
      seenBy(e, info) === 0
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
      // (Round 4: she jumps in its tell, in front of it and not away: it rams now, under her jump.)
      if (B.lungeOnJump && e.timer > 1 && tellFrames(e, B) - e.timer >= B.lungeAfterFrames && lunges(e, info))
        e.timer = 1;
      // (A first mini-boss feints only from its second health third: the first third teaches the plain ram.)
      if (--e.timer <= 0 && B.feintFrames > 0 && e.feints === 0 && e.hp <= e.hpMax * B.feintFrom) {
        // The old burrback's feint: the first brace was a lie. Its shell drops, then it braces again.
        e.feints = 1;
        const n = frames(B.feintFrames, 1);
        const left = e.chargeLeft;
        setMode(e, 'feint', n);
        e.chargeLeft = left;
        events.push({
          type: 'enemyFeint',
          id: e.id,
          kind: e.kind,
          x: e.x + e.w / 2,
          y: e.y + e.h / 2,
          dir: e.facing,
          frames: n,
        });
      } else if (e.timer <= 0) {
        const left = e.chargeLeft;
        setMode(e, 'charge', 0);
        e.chargeLeft = left;
        e.rx = 0;
        // She jumped in the tell and is up in the air in front of it: the ram passes under the jump
        // in progress (human-like r1: a quick reaction must never land in the ram).
        e.ramSpeed = B.ramUnderJump ? underJump(e, info, B) : 0;
        // (Round 4: the first rams of a try are slower too: a late jump still clears them.)
        if (e.ramSpeed === 0 && e.rams < B.firstTellRams) e.ramSpeed = B.chargeSpeed * B.firstRamSpeedMult;
        // (The Canopy r15: the Keeper's bridge ram, slower.)
        if (e.ramSpeed === 0 && bridged(e, info)) e.ramSpeed = B.chargeSpeed * info.t.keeper.bridgeSpeed;
        // (Phase 3: desperate, fast.)
        if (e.phase === 3) e.ramSpeed = Math.max(e.ramSpeed, B.p3ChargeSpeed);
        events.push({
          type: 'enemyCharge',
          id: e.id,
          kind: e.kind,
          x: e.x + e.w / 2,
          y: e.y + e.h / 2,
          dir: e.facing,
          px: e.chargeLeft,
          frames: Math.ceil(e.chargeLeft / Math.max(0.1, e.ramSpeed || B.chargeSpeed)),
        });
      }
      return true;
    }
    if (e.mode === 'feint') {
      // Shell down, the touch still live. Then the real brace, at her: it comes round if she went behind.
      e.vx = 0;
      if (--e.timer <= 0) {
        e.feints = 2;
        e.pogoed = false;
        const pc = p.x + p.w / 2;
        const ec = e.x + e.w / 2;
        const side = pc < ec ? -1 : 1;
        if (pc !== ec && side !== e.facing && p.hp > 0 && p.faded === 0) {
          e.facing = side;
          events.push({
            type: 'enemyTurn',
            id: e.id,
            kind: e.kind,
            x: ec,
            y: e.y + e.h / 2,
            dir: side,
            cause: 'hit',
            frames: 0,
          });
        }
        const n = frames(B.feintBraceFrames, 1);
        e.chargeLeft = frames(B.chargePx, 1);
        setMode(e, 'windup', n);
        events.push({
          type: 'enemyWindup',
          id: e.id,
          kind: e.kind,
          x: ec,
          y: e.y + e.h / 2,
          dir: e.facing,
          frames: n,
          px: e.chargeLeft,
          speed: B.chargeSpeed,
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
        // (Open on its back, the old burrback gets up first: a harmless beat, then it may brace. Its touch
        // never lands the moment its window closes on one still cutting it.)
        if (e.stunned && B.riseFrames > 0) {
          e.stunned = false;
          setMode(e, 'wake', frames(B.riseFrames, 1));
          return false;
        }
        e.stunned = false;
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
        // (The old burrback's open window is over (its time, or `openHits` cuts): it gets up, harmless.)
        if (e.stunned && B.riseFrames > 0) {
          e.stunned = false;
          e.strikeCd = Math.max(e.strikeCd, frames(B.riseFrames));
          setMode(e, 'wake', frames(B.riseFrames, 1));
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
      (e.roused > 0 || seenBy(e, info) > 0) &&
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
    const r = rowOf(info.t, e).noticePx * seenScale(seen, info.t.giving);
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;
    if ((px - ex) * (px - ex) + (py - ey) * (py - ey) > r * r) return false;
    return !segmentBlocked(info.scene, ex, ey, px, py);
  },

  /** Inside a lit lantern's sanctuary (it was there when the lantern caught, or was shoved in): harmless. */
  harmless(e, info) {
    // (Round 4: only its ram hurts (`bodyHarmless`); the body shoulders her out instead.)
    if (rowOf(info.t, e).bodyHarmless && e.mode !== 'charge' && e.mode !== 'feint' && e.mode !== 'roll')
      return true;
    return sheltered(e, info);
  },

  /** Its touch hurt her (or met her kindling): it is shoved back from her, flinches, and turns away. */
  touched(e, info, dir) {
    if (e.mode === 'dead') return;
    // (Its slam's wave reached her: nothing of its own to answer.)
    if (e.waveHit) return;
    // (Rolling, it hit her: it stops, curled and shut, `rollRestFrames` (no ball back at her every second), then
    // rolls at her again.)
    if (e.mode === 'roll') {
      e.facing = dir > 0 ? -1 : 1;
      e.rx = 0;
      e.vx = 0;
      setMode(e, 'curl', frames(rowOf(info.t, e).rollRestFrames, 1));
      return;
    }
    const B = rowOf(info.t, e);
    const away = dir > 0 ? -1 : 1;
    // Its ram hit her: it bounces back off her, turns away and stands spent.
    // Its next ram may not reach her sooner than `rehitGapFrames` after her safety has run out.
    const rehit =
      frames(info.t.health.invulnFrames + B.rehitGapFrames) -
      frames(e.span > 0 ? e.span : B.windupFrames, 1) -
      1;
    if (e.mode === 'windup' || e.mode === 'charge') {
      e.facing = away;
      spend(e, info, 'touch');
      // (Round 4: no ram after ram while she is down: `touchRestFrames` before it may brace again.)
      e.strikeCd = Math.max(e.strikeCd, rehit, e.timer + frames(B.touchRestFrames));
      e.knockVx = away * Math.max(0, B.touchRecoil);
      e.teeter = 0;
      e.alertCd = e.timer + frames(B.alertCooldown);
      return;
    }
    const n = frames(B.touchFlinchFrames, 1);
    setMode(e, 'alert', n);
    if (B.touchCalmFrames > 0) e.calm = Math.max(e.calm, frames(B.touchCalmFrames));
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
  blocks(e, dir, px, t) {
    if (rowOf(t, e).pogoShell) {
      // The old burrback: braced, only a pogo lands (one a brace); a wall stun opens the shell; any
      // other time everything glances (a down cut still bounces her).
      // (The Keeper, the Canopy r13: at its phase's gate every blow glances; in P2's light it shrugs off every cut
      // but its eat's: only the dark lets her hurt it.)
      if (e.keep > 0 && e.gate > 0 && e.hp <= e.gate) return true;
      // (r14: reared for its sweep, claws up: not an opening.)
      if (e.keep > 0 && e.mode === 'sweep') return true;
      if (e.keep > 0 && e.phase === 2 && e.blind === 0 && e.mode !== 'eat') return true;
      if (e.stunned) return false;
      // (The Keeper blind in P2's dark: a cut from behind it lands.)
      if (e.keep > 0 && e.blind > 0 && dir !== 'down' && (px - (e.x + e.w / 2)) * e.facing < 0) return false;
      if (dir === 'down') return !e.braced || e.pogoed;
      return true;
    }
    if (dir === 'down') return e.braced || e.tuck > 0;
    return e.braced && dir === 'fwd' && (px - (e.x + e.w / 2)) * e.facing > 0;
  },

  /** Along a forward cut; an up / down cut pushes it aside, away from her, less hard. */
  /**
   * Its touch is the dome that is drawn (`domeContact`: the old burrback): her box must reach below the
   * shell's curve at the nearest x of her span, not just the box's empty top corners.
   */
  touches(e, p, t) {
    const B = rowOf(t, e);
    // (First-timer r6: "it hurt to touch from behind". The ram and the ball hurt only from their front half: one
    // behind it as it goes, or landing behind it, is let be.)
    if (B.bodyHarmless && (e.mode === 'charge' || e.mode === 'roll')) {
      if ((p.x + p.w / 2 - (e.x + e.w / 2)) * e.facing < 0) return false;
    }
    // (Rolling: the ball, a circle `rollTouchPx` across at its feet's middle.)
    if (e.mode === 'roll') {
      const r = B.rollTouchPx / 2;
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h - r;
      const nx = Math.max(p.x, Math.min(p.x + p.w, cx)) - cx;
      const ny = Math.max(p.y, Math.min(p.y + p.h, cy)) - cy;
      return nx * nx + ny * ny < r * r;
    }
    if (!B.domeContact) return true;
    const H = e.h * B.domeHeight;
    const sy = H * B.domeShoulder;
    const cx = e.x + e.w / 2;
    // The nearest x of her box to its middle, as a share of its half width.
    const nx = Math.max(p.x, Math.min(p.x + p.w, cx));
    const u = Math.min(1, Math.abs(nx - cx) / (e.w / 2));
    const top = e.y + (e.h - H) + sy * (1 - Math.sqrt(1 - u * u));
    return p.y + p.h > top;
  },

  /**
   * A throw-cut (round 5): braced (or curled), it is flipped belly-up from any side, open as after a wall
   * (`recoverWallFrames`); the blow lands.
   */
  heavy(e, info) {
    if (e.mode === 'dead' || e.mode === 'sleep') return false;
    if (e.mode === 'roll') {
      unroll(e, info, 'heavy');
      return false;
    }
    if (
      e.braced ||
      e.mode === 'feint' ||
      e.tuck > 0 ||
      e.mode === 'walk' ||
      e.mode === 'alert' ||
      e.mode === 'pause'
    ) {
      spend(e, info, 'wall');
      e.stunned = true;
    }
    return false;
  },

  /** Her down slash on its back is always a pogo (the framework's stomp). */
  stompable: () => true,

  /**
   * Coming down on its top bounces her (`landBounce`: the old burrback, round 4), not while it lies open (she
   * may land in it and cut).
   */
  bouncy: (e, t) => rowOf(t, e).landBounce && !e.stunned && e.mode !== 'roll',

  /** The old burrback's braced shell takes a pogo without a stagger: it rams on under her. */
  tough: (e, dir, t) => rowOf(t, e).pogoShell && e.braced && dir === 'down',

  shove(e, dir, side, knockback, t) {
    const B = rowOf(t, e);
    if (B.pogoShell && e.braced) {
      // A pogo on the old burrback's braced shell: it counts, the brace holds, the next pogo glances.
      e.pogoed = true;
      e.roused = Math.max(e.roused, frames(B.rouseFrames));
      e.broken = false;
      return 0;
    }
    // Open, it takes `openHits` cuts at most, then the window closes as its stagger ends.
    if (B.pogoShell && e.stunned && openHitsOf(e, B) > 0 && ++e.taken >= openHitsOf(e, B))
      e.strikeCd = Math.min(e.strikeCd, frames(B.strikeCooldown));
    const k = knockback * rowOf(t, e).knockScale;
    const kb = dir === 'fwd' ? k : k * rowOf(t, e).knockVertical;
    // Cut, it is roused: it will come round to her and brace. A blow that lands on a braced one broke its brace.
    e.roused = Math.max(e.roused, frames(rowOf(t, e).rouseFrames));
    e.broken = e.braced;
    // A down cut (a pogo) curls it up: the next ones glance off until it has uncurled.
    if (dir === 'down' && !B.pogoShell) e.tuck = Math.max(2, frames(rowOf(t, e).tuckFrames));
    e.knockVx = side * kb;
    e.knockVy = 0;
    e.rx = 0;
    e.teeter = 0;
    return kb;
  },
};

/**
 * The old burrback (wood.md §6, R10's mini-boss): the burrback's rules on its own row
 * (`tuning.oldBurrback`): bigger, 10 hp, a feint (two braces, then a 260 px ram), a shell only a pogo
 * opens while braced (a wall stun opens it to every cut), asleep in its den until she comes down,
 * hunting her whatever the light (`sense` `always`).
 */
export const oldBurrback: KindRules = {
  ...burrback,
  width: (t) => t.oldBurrback.width,
  height: (t) => t.oldBurrback.height,
  hp: (t) => t.oldBurrback.hp,
  hurtFrames: (t) => t.oldBurrback.hurtFrames,
  hurtSafeFrames: (t) => t.oldBurrback.hurtSafeFrames,
  contactDamage: (t) => t.oldBurrback.contactDamage,
  value: (t, finisher) => (finisher ? t.oldBurrback.valueFinisher : t.oldBurrback.value),
  // Its death is a beat: a long hold on the killing blow, the body lying, a story hold.
  deadFrames: (t) => t.oldBurrback.deadFrames || t.enemies.deadFrames,
  killHold: (t) => t.oldBurrback.killHitstopFrames,
  deathHold: (t) => t.oldBurrback.deathHoldFrames,
};

/**
 * The juvenile beetle (wood-area1-director.md, R4: "the crawlid slot"): the first creature she meets. The
 * burrback's rules on its own row (`tuning.juvenileBurrback`): small, 2 hp, no brace and no ram, a gentle tell
 * (it stops and turns to her the first time it sees her), then it walks at her; its touch is the danger.
 */
export const juvenileBurrback: KindRules = {
  ...burrback,
  width: (t) => t.juvenileBurrback.width,
  height: (t) => t.juvenileBurrback.height,
  hp: (t) => t.juvenileBurrback.hp,
  hurtFrames: (t) => t.juvenileBurrback.hurtFrames,
  hurtSafeFrames: (t) => t.juvenileBurrback.hurtSafeFrames,
  contactDamage: (t) => t.juvenileBurrback.contactDamage,
  value: (t, finisher) => (finisher ? t.juvenileBurrback.valueFinisher : t.juvenileBurrback.value),
};
