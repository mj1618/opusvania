/**
 * The huntsman (docs/design/levels/reviews/canopy-r22-creatures.md, memory/enemies.md "The huntsman"): a flat,
 * long-legged spider that lives on a bark face. Huntsmen really do hunt moths on tree trunks at night. It turns a
 * wall-jump climb into a fight.
 *
 *  - On its face (`side` = the wall's side of its body, -1 west / 1 east; it faces the gap, `facing` = -side) it
 *    keeps to its stretch (`fromY` .. `fromY + span`, box centre y): quick bursts (`skitter`, `enemyRun`) and
 *    pauses (`pause`), toward her height once it sees her (a sight hunter: `senses`, `guards` as the others).
 *  - She level with it (`levelPx`), in front of it within `reachPx` across the gap, a clear line: the tell
 *    (`windup`, `tellFrames`: it flattens, `enemyWindup`), then the lunge (`charge`, `enemyCharge`): straight across
 *    at her in a flat arc, aimed a little ahead of her motion. Only the lunge hurts (for `lungeFrames`).
 *  - A wall in its flight: it clings there (`perch`, `enemyStall` cause `wall`) and that face is its stretch now.
 *    None: it drops (`fall`), lands flipped and lies open (`recover`, `enemyRecover` cause `spent`), then scrambles
 *    back along the ground (`run`) and up the first wall it meets (`climb`); one it cannot find a wall for leaves.
 *  - Hit on its face it holds (`hurt`), then scuttles away from her along it (`flee`, `evadePx`). Hit in the air
 *    (a deflected lunge) or knocked off by a throw-cut it tumbles (`broken`: no cling) and lands open. Its touch
 *    after it hurt her: it falls off her, and no lunge lands sooner than her safety + `rehitGapFrames`.
 *  - Dead: knocked off along the blow, it falls tumbling, lands on its back and lies there until `deadFrames` end.
 *
 * Spawn: `x` = the face's x (the wall's surface), `y` = the middle of its stretch (box centre), `radius` = half the
 * stretch (default `huntsman.radius`; clamped to the face's real extent), `facing` = the way it faces (into the gap).
 *
 * State it uses (one flat EnemyState): `side`, `facing`, `fromX` (the face's x), `fromY` / `span` (the stretch),
 * `targetX, targetY` (the tell's aim; a burst's goal y), `lookY` (its head along the face: -1 up, 1 down),
 * `knockVx, knockVy` + `rx, ry` (flight), `chargeLeft` (live frames of the lunge left), `landed` (on the ground),
 * `broken` (knocked out of the air: it cannot cling), `walkLeft` (a recover's frames left when a blow came),
 * `rests` (bursts so far: the schedule hash), `pushY` (her vertical speed as it watches her, smoothed), `strikeCd`. Pure: + - * / sqrt, round, min, max, abs.
 */

import { oneWayUnder, solidAt } from '../physics/aabb';
import type { Scene } from '../scene';
import type { EnemyState } from '../state';
import type { Tuning } from '../tuning';
import { frames, heldUnseen, type KindRules, mix, type StepInfo, segmentBlocked, setMode } from './common';
import { seenBy } from './senses';

type H = Tuning['huntsman'];

const cxOf = (e: EnemyState): number => e.x + e.w / 2;
const cyOf = (e: EnemyState): number => e.y + e.h / 2;

/** The wall on side `s` of a box: the column next to it is solid near its top and its bottom. */
function faceBeside(scene: Scene, x: number, y: number, w: number, h: number, s: number): boolean {
  const c = s < 0 ? x - 1 : x + w;
  return solidAt(scene, c, y + 6, 1, 1) && solidAt(scene, c, y + h - 7, 1, 1);
}

/** Its box would fit at height `y` on its face (clear of solids, the face beside it). */
function fits(e: EnemyState, scene: Scene, y: number): boolean {
  return !solidAt(scene, e.x, y, e.w, e.h) && faceBeside(scene, e.x, y, e.w, e.h, e.side);
}

/** Its stretch on the face it clings to: around `cy` (box centre), at most `r` either way, as far as the face goes. */
function stretch(e: EnemyState, scene: Scene, cy: number, r: number): void {
  const y0 = Math.round(cy - e.h / 2);
  let up = 0;
  while (up + 4 <= r && fits(e, scene, y0 - up - 4)) up += 4;
  let down = 0;
  while (down + 4 <= r && fits(e, scene, y0 + down + 4)) down += 4;
  e.fromY = y0 - up + e.h / 2;
  e.span = up + down;
}

/** Puts its box flush on the face at `fromX` on side `side`, box centre y `cy`. */
function onFace(e: EnemyState, cy: number): void {
  e.x = e.side < 0 ? Math.round(e.fromX) : Math.round(e.fromX - e.w);
  e.y = Math.round(cy - e.h / 2);
}

/** A hash in [0, 1) for the `k`th choice of this creature (no RNG in the sim). */
const clampAbs = (v: number, m: number): number => Math.max(-m, Math.min(m, v));

/** The index of the creature being stepped (its spawn: its own face and stretch). */
let IDX = -1;

const roll = (e: EnemyState, k: number): number => mix(e.salt, k) / 4294967296;
const between = (u: number, a: number, b: number): number => frames(a + (b - a) * u, 1);

/** Up or down its face toward box centre `ty` at `speed` px/f; returns false if it could not move (blocked). */
function crawl(e: EnemyState, info: StepInfo, ty: number, speed: number): boolean {
  const cy = cyOf(e);
  const lo = e.fromY;
  const hi = e.fromY + e.span;
  const goal = Math.max(lo, Math.min(hi, ty));
  let n = Math.min(Math.round(speed), Math.round(Math.abs(goal - cy)));
  const s = goal < cy ? -1 : 1;
  let moved = false;
  while (n > 0) {
    if (!fits(e, info.scene, e.y + s)) break;
    e.y += s;
    n--;
    moved = true;
  }
  return moved;
}

/** Clings to the wall on side `s` (a lunge or a scramble met it). False if the face there is no face (a corner). */
function cling(e: EnemyState, info: StepInfo, s: number, home: boolean): boolean {
  const H = info.t.huntsman;
  if (!faceBeside(info.scene, e.x, e.y, e.w, e.h, s)) return false;
  const was = e.side;
  e.side = s;
  const sp = info.scene.enemies?.[IDX];
  const homeFace =
    sp !== undefined && (sp.facing > 0 ? -1 : 1) === s && Math.abs((s < 0 ? e.x : e.x + e.w) - sp.x) <= 4;
  e.fromX = s < 0 ? e.x : e.x + e.w;
  const r = e.radius > 0 ? e.radius : H.radius;
  if (home && homeFace && sp) {
    // Its own face: its own stretch (the climb back up to it is `climb`).
    stretch(e, info.scene, sp.y, r);
    if (e.span < 8) stretch(e, info.scene, cyOf(e), r);
  } else stretch(e, info.scene, cyOf(e), r);
  if (e.span < 16) {
    e.side = was;
    return false;
  }
  e.facing = s < 0 ? 1 : -1;
  e.knockVx = 0;
  e.knockVy = 0;
  e.rx = 0;
  e.ry = 0;
  e.landed = false;
  e.broken = false;
  e.homeX = cxOf(e);
  e.homeY = e.fromY + e.span / 2;
  // (Never a lunge the moment it takes hold: point-blank after a scramble up beside her, say.)
  e.strikeCd = Math.max(e.strikeCd, frames(H.clingFrames + H.tellFrames));
  return true;
}

/**
 * One step of flight (a lunge, a fall, a tumble): gravity `g`, then x and y in 1 px steps. Returns `wall` (it clung
 * to a face it met sideways, if `canCling`), `ground` (it came down on something), `out` (below the room) or `air`.
 */
function fly(e: EnemyState, info: StepInfo, H: H, g: number, drag: number, canCling: boolean) {
  const scene = info.scene;
  e.knockVy = Math.min(H.maxFall, e.knockVy + g);
  e.knockVx *= drag;
  e.rx += e.knockVx;
  let n = Math.round(e.rx);
  e.rx -= n;
  while (n !== 0) {
    const s = n < 0 ? -1 : 1;
    if (solidAt(scene, e.x + s, e.y, e.w, e.h)) {
      if (canCling && cling(e, info, s, false)) return 'wall' as const;
      // A corner, or it may not hold: it glances off.
      e.knockVx = -e.knockVx * 0.25;
      e.rx = 0;
      break;
    }
    e.x += s;
    n -= s;
  }
  e.ry += e.knockVy;
  n = Math.round(e.ry);
  e.ry -= n;
  while (n !== 0) {
    const s = n < 0 ? -1 : 1;
    if (
      solidAt(scene, e.x, e.y + s, e.w, e.h) ||
      (s > 0 && oneWayUnder(scene, e.x, e.y, e.w, e.h) && e.knockVy > 0)
    ) {
      e.ry = 0;
      if (s > 0) {
        e.knockVy = 0;
        e.landed = true;
        return 'ground' as const;
      }
      e.knockVy = 0;
      break;
    }
    e.y += s;
    n -= s;
  }
  if (e.y > scene.height + 120) return 'out' as const;
  return 'air' as const;
}

/** On its back where it came down: open and harmless (`recover`). */
function down(e: EnemyState, info: StepInfo, n: number): void {
  const H = info.t.huntsman;
  e.side = 0;
  e.knockVx = 0;
  e.knockVy = 0;
  e.chargeLeft = 0;
  setMode(e, 'recover', n);
  info.events.push({
    type: 'enemyRecover',
    id: e.id,
    kind: e.kind,
    x: cxOf(e),
    y: cyOf(e),
    dir: e.facing,
    cause: 'spent',
    tired: false,
    broken: e.broken,
    frames: n,
    cooldown: frames(H.cooldownFrames),
  });
}

/** She is in its sight to hunt: seen, within `noticePx`, a clear line. */
function hunts(e: EnemyState, info: StepInfo): boolean {
  if (seenBy(e, info) <= 0) return false;
  const p = info.state.player;
  const dx = p.x + p.w / 2 - cxOf(e);
  const dy = p.y + p.h / 2 - cyOf(e);
  const H = info.t.huntsman;
  if (dx * dx + dy * dy > H.noticePx * H.noticePx) return false;
  return !segmentBlocked(info.scene, cxOf(e), cyOf(e), p.x + p.w / 2, p.y + p.h / 2);
}

/** She is level with it, in front of it within reach across the gap, a clear line: it may tell. */
function inReach(e: EnemyState, info: StepInfo): boolean {
  const H = info.t.huntsman;
  const p = info.state.player;
  if (e.side === 0 || e.strikeCd > 0 || heldUnseen(e, p) || seenBy(e, info) <= 0) return false;
  const pcx = p.x + p.w / 2;
  const pcy = p.y + p.h / 2;
  const f = e.facing;
  if ((pcx - cxOf(e)) * f <= 0) return false;
  const gap = f > 0 ? p.x - (e.x + e.w) : e.x - (p.x + p.w);
  if (gap > H.reachPx) return false;
  // Level with it now, or as she will be by the time it lands on her (her climb, smoothed: `pushY`).
  const ahead = pcy + clampAbs(e.pushY * (H.tellFrames + H.aheadFrames), H.aheadMaxPx);
  if (Math.abs(pcy - cyOf(e)) > H.levelPx && Math.abs(ahead - cyOf(e)) > H.levelPx) return false;
  return !segmentBlocked(info.scene, cxOf(e), cyOf(e), pcx, pcy);
}

function tell(e: EnemyState, info: StepInfo): void {
  const H = info.t.huntsman;
  const p = info.state.player;
  const n = frames(H.tellFrames, 1);
  setMode(e, 'windup', n);
  e.targetX = p.x + p.w / 2;
  e.targetY = p.y + p.h / 2;
  info.events.push({
    type: 'enemyWindup',
    id: e.id,
    kind: e.kind,
    x: cxOf(e),
    y: cyOf(e),
    dir: e.facing,
    frames: n,
    px: Math.round(H.lungeSpeed * H.lungeFrames),
    speed: H.lungeSpeed,
  });
}

/**
 * Off the wall at her: toward where she will be (`lead` of her motion over the flight ahead), never steeper than
 * `lungeSlope` (a spring across, not a leap up the shaft), at `lungeSpeed` px/f in a flat arc (`lungeGravity`).
 */
function lunge(e: EnemyState, info: StepInfo): void {
  const H = info.t.huntsman;
  const p = info.state.player;
  const cx = cxOf(e);
  const cy = cyOf(e);
  const sp = Math.max(1, H.lungeSpeed);
  const ax = p.x + p.w / 2;
  let ay = p.y + p.h / 2;
  // (Two passes: the flight's length from the aim, the aim from the flight's length. Her climb is the smoothed
  // `pushY`: a kick's burst and a slide's stop average out to how fast she is really going up.)
  for (let k = 0; k < 2; k++) {
    const T = Math.min(H.lungeFrames, Math.sqrt((ax - cx) * (ax - cx) + (ay - cy) * (ay - cy)) / sp);
    ay = p.y + p.h / 2 + clampAbs(e.pushY * T * H.lead, H.aheadMaxPx);
  }
  // (The slope is from how far out in front she really is: one who has come in against its own face, under or over
  // it, is not leapt down on: it springs flat across, out of her way.)
  const out = Math.max(0, (ax - cx) * e.facing - e.w / 2);
  let dy = ay - cy;
  // (Down it springs flatter than up: a hit near a climb's foot would throw her off it.)
  const slope = dy > 0 ? H.lungeSlopeDown : H.lungeSlope;
  if (Math.abs(dy) > out * slope) dy = Math.sign(dy) * out * slope;
  const dx = Math.max(out, 24);
  const d = Math.sqrt(dx * dx + dy * dy);
  const T = d / sp;
  e.targetX = cx + dx * e.facing;
  e.targetY = cy + dy;
  e.knockVx = e.facing * (dx / d) * sp;
  // (The arc's sag is put back at the start: it arrives where it aimed.)
  e.knockVy = (dy / d) * sp - 0.5 * H.lungeGravity * Math.min(T, H.lungeFrames);
  e.rx = 0;
  e.ry = 0;
  e.chargeLeft = frames(H.lungeFrames, 1);
  e.side = 0;
  e.landed = false;
  e.broken = false;
  e.strikeCd = frames(H.cooldownFrames) + e.chargeLeft;
  setMode(e, 'charge', 0);
  info.events.push({
    type: 'enemyCharge',
    id: e.id,
    kind: e.kind,
    x: cx,
    y: cy,
    dir: e.facing,
    px: Math.round(sp * e.chargeLeft),
    frames: e.chargeLeft,
  });
}

/** A burst along its face toward `ty` (`speed` px/f, at most `n` frames): `skitter` or `flee`. */
function burst(e: EnemyState, info: StepInfo, mode: 'skitter' | 'flee', ty: number, n: number): void {
  const lo = e.fromY;
  const hi = e.fromY + e.span;
  e.targetY = Math.max(lo, Math.min(hi, ty));
  e.lookY = e.targetY < cyOf(e) ? -1 : 1;
  setMode(e, mode, n);
  info.events.push({
    type: 'enemyRun',
    id: e.id,
    kind: e.kind,
    x: cxOf(e),
    y: cyOf(e),
    tx: cxOf(e),
    ty: Math.round(e.targetY),
    px: Math.round(Math.abs(e.targetY - cyOf(e))),
    frames: n,
  });
}

/** The next thing it does on its face once a pause ends: hunt her height if it sees her, else wander. */
function next(e: EnemyState, info: StepInfo): void {
  const H = info.t.huntsman;
  const k = e.rests++;
  const p = info.state.player;
  const pcy = p.y + p.h / 2;
  if (hunts(e, info)) {
    if (Math.abs(pcy - cyOf(e)) <= H.levelPx * 0.5) {
      e.lookY = pcy < cyOf(e) ? -1 : 1;
      setMode(e, 'pause', between(roll(e, k * 3), H.huntPauseMin, H.huntPauseMax));
      return;
    }
    const n = frames(Math.abs(pcy - cyOf(e)) / Math.max(1, H.burstSpeed) + 1, 1);
    burst(e, info, 'skitter', pcy, Math.min(n, frames(H.burstMax, 1)));
    return;
  }
  const ty = e.fromY + e.span * roll(e, k * 3 + 1);
  burst(e, info, 'skitter', ty, between(roll(e, k * 3 + 2), H.burstMin, H.burstMax));
}

/** Away from her along its face (a blow landed on it there). */
function evade(e: EnemyState, info: StepInfo): void {
  const H = info.t.huntsman;
  const p = info.state.player;
  const cy = cyOf(e);
  let dir = p.y + p.h / 2 < cy ? 1 : -1;
  const room = (d: number) => (d > 0 ? e.fromY + e.span - cy : cy - e.fromY);
  if (room(dir) < H.evadePx * 0.4 && room(-dir) > room(dir)) dir = -dir;
  burst(e, info, 'flee', cy + dir * H.evadePx, frames(H.evadePx / Math.max(1, H.evadeSpeed) + 2, 1));
}

/** Off its face for good (its lamp went out; lost on the ground): it scuttles away and is gone. */
function leave(e: EnemyState): void {
  setMode(e, 'leave', 60);
}

export const huntsman: KindRules = {
  width: (t) => t.huntsman.width,
  height: (t) => t.huntsman.height,
  hp: (t) => t.huntsman.hp,
  hurtFrames: (t) => t.huntsman.hurtFrames,
  hurtSafeFrames: (t) => t.huntsman.hurtSafeFrames,
  contactDamage: (t) => t.huntsman.contactDamage,
  deadFrames: (t) => t.huntsman.deadFrames,
  value: () => 0,

  /** `x` = the face's x, `y` = the middle of its stretch; it faces the gap (`facing`), its wall behind it. */
  place(e, spawn, t) {
    e.side = spawn.facing > 0 ? -1 : 1;
    e.facing = spawn.facing > 0 ? 1 : -1;
    e.fromX = spawn.x;
    e.radius = Math.max(0, spawn.radius ?? t.huntsman.radius);
    e.fromY = spawn.y - e.radius;
    e.span = 2 * e.radius;
    e.lookY = -1;
    onFace(e, spawn.y);
    setMode(e, 'pause', between(roll(e, 999), t.huntsman.pauseMin, t.huntsman.pauseMax));
  },

  /** Its stretch is as far as the face really goes (a ledge, a lip, the face's end). */
  init(e, spawn, scene, t) {
    stretch(e, scene, spawn.y, e.radius > 0 ? e.radius : t.huntsman.radius);
  },

  update(e, index, info) {
    const H = info.t.huntsman;
    IDX = index;
    const x0 = e.x;
    const y0 = e.y;
    let live = false;
    if (e.strikeCd > 0) e.strikeCd--;
    // Her climb as it watches it (her vertical speed, smoothed): where she will be when it lands.
    const p0 = info.state.player;
    e.pushY += (p0.vy - e.pushY) * H.trackK;
    const m = e.mode;
    if (m === 'dead') {
      // Knocked off along the blow: it falls tumbling and lies on its back.
      if (e.side !== 0) {
        e.side = 0;
        e.broken = true;
      }
      if (!e.landed && fly(e, info, H, H.gravity, H.airDrag, false) === 'out') e.gone = true;
      if (e.landed) e.knockVx = 0;
      if (--e.timer <= 0) e.gone = true;
      e.vx = e.x - x0;
      e.vy = e.y - y0;
      return false;
    }
    if (m === 'leave') {
      // (Up its face while the face goes on; on the ground, away along it.)
      if (e.side !== 0) {
        for (let k = Math.round(H.climbSpeed); k > 0 && fits(e, info.scene, e.y - 1); k--) e.y--;
      } else e.x += Math.round(H.runSpeed) * e.facing;
      if (--e.timer <= 0) e.gone = true;
      e.vx = e.x - x0;
      e.vy = e.y - y0;
      return false;
    }
    if (m === 'hurt') {
      if (e.side !== 0) {
        // On its face: it holds the blow, then scuttles away from her.
        e.knockVx = 0;
        e.knockVy = 0;
        if (--e.timer <= 0) evade(e, info);
      } else {
        // In the air or on the ground: it tumbles with the blow (popped up off the ground, `shove`).
        if (!e.landed) {
          const r = fly(e, info, H, H.gravity, H.airDrag, false);
          if (r === 'out') e.gone = true;
        }
        if (--e.timer <= 0) {
          if (e.landed) down(e, info, Math.max(e.walkLeft, frames(H.recoverFrames * 0.4, 1)));
          else setMode(e, 'fall', 0);
          e.walkLeft = 0;
        }
      }
    } else if (m === 'windup') {
      // The tell: it holds still, flattened; then it springs.
      if (--e.timer <= 0) lunge(e, info);
    } else if (m === 'charge' || m === 'fall') {
      const charge = m === 'charge';
      const r = fly(e, info, H, charge ? H.lungeGravity : H.gravity, charge ? 1 : H.airDrag, !e.broken);
      if (charge) {
        live = true;
        if (--e.chargeLeft <= 0) setMode(e, 'fall', 0);
      }
      if (r === 'out') e.gone = true;
      else if (r === 'ground') down(e, info, frames(H.recoverFrames, 1));
      else if (r === 'wall') {
        const n = frames(H.clingFrames, 1);
        setMode(e, 'perch', n);
        info.events.push({
          type: 'enemyStall',
          id: e.id,
          kind: e.kind,
          x: cxOf(e),
          y: cyOf(e),
          dir: e.facing,
          frames: n,
          cause: 'wall',
        });
      }
    } else if (m === 'recover') {
      // On its back, legs kicking: open, harmless. Then it rights itself and scrambles back.
      if (--e.timer <= 0) {
        const home = e.homeX;
        e.facing = home < cxOf(e) ? -1 : 1;
        setMode(e, 'run', frames(H.runFrames, 1));
        info.events.push({
          type: 'enemyRun',
          id: e.id,
          kind: e.kind,
          x: cxOf(e),
          y: cyOf(e),
          tx: Math.round(home),
          ty: Math.round(cyOf(e)),
          px: Math.round(Math.abs(home - cxOf(e))),
          frames: frames(Math.abs(home - cxOf(e)) / Math.max(1, H.runSpeed), 1),
        });
      }
    } else if (m === 'run') {
      // Along the ground to the first wall it meets, the way home; it turns at a brink.
      const scene = info.scene;
      let n = Math.round(H.runSpeed);
      while (n > 0) {
        const s = e.facing;
        if (solidAt(scene, e.x + s, e.y, e.w, e.h)) {
          if (cling(e, info, s, true)) {
            setMode(e, 'climb', 0);
            break;
          }
          e.facing = s < 0 ? 1 : -1;
          break;
        }
        const ground =
          solidAt(scene, e.x + s, e.y + e.h, e.w, 1) || oneWayUnder(scene, e.x + s, e.y, e.w, e.h);
        if (!ground) {
          e.facing = s < 0 ? 1 : -1;
          break;
        }
        e.x += s;
        n--;
      }
      if (e.mode === 'run' && --e.timer <= 0) leave(e);
    } else if (m === 'climb') {
      // Up (or down) its face to its stretch, then it takes up its watch again.
      const cy = cyOf(e);
      const lo = e.fromY;
      const hi = e.fromY + e.span;
      if (cy >= lo && cy <= hi) setMode(e, 'pause', frames(H.huntPauseMax, 1));
      else {
        e.lookY = cy > hi ? -1 : 1;
        const s = cy > hi ? -1 : 1;
        let k = Math.round(H.climbSpeed);
        let moved = false;
        while (k > 0 && fits(e, info.scene, e.y + s)) {
          e.y += s;
          k--;
          moved = true;
        }
        // (Its stretch out of reach along this face: it makes the stretch where it is.)
        if (!moved) {
          stretch(e, info.scene, cyOf(e), e.radius > 0 ? e.radius : H.radius);
          setMode(e, 'pause', frames(H.huntPauseMax, 1));
        }
      }
    } else {
      // On its face: `pause`, `skitter`, `flee`, `perch`.
      if (m !== 'perch' && m !== 'flee' && inReach(e, info)) tell(e, info);
      else if (m === 'skitter' || m === 'flee') {
        const moved = crawl(e, info, e.targetY, m === 'flee' ? H.evadeSpeed : H.burstSpeed);
        const there = Math.abs(cyOf(e) - e.targetY) < 1;
        if (--e.timer <= 0 || there || !moved) {
          const hunting = hunts(e, info);
          const k = e.rests;
          setMode(
            e,
            'pause',
            hunting
              ? between(roll(e, k * 5 + 7), H.huntPauseMin, H.huntPauseMax)
              : between(roll(e, k * 5 + 8), H.pauseMin, H.pauseMax),
          );
          if (hunting) {
            const p = info.state.player;
            e.lookY = p.y + p.h / 2 < cyOf(e) ? -1 : 1;
          }
        }
      } else {
        // (A long wandering pause ends early once it sees her: it hunts.)
        if (m === 'pause' && e.timer > H.huntPauseMax && hunts(e, info)) e.timer = frames(H.huntPauseMax, 1);
        if (--e.timer <= 0) next(e, info);
      }
    }
    e.vx = e.x - x0;
    e.vy = e.y - y0;
    return live;
  },

  /** It is aware of her while it hunts her on its face, tells and lunges. */
  sees(e, info, seen) {
    if (e.mode === 'windup' || e.mode === 'charge') return true;
    if (seen <= 0 || e.side === 0 || e.mode === 'dead') return false;
    return hunts(e, info);
  },

  /** Only the lunge hurts (a careful climber can always pass it on its face). */
  harmless: (e) => e.mode !== 'charge',

  /**
   * A blow: on its face it holds (no shove; it scuttles away after the stagger). Off it (in the air, on the ground,
   * or dying) it goes along the blow, up a little.
   */
  shove(e, _dir, side, knockback, t) {
    const H = t.huntsman;
    if (e.mode === 'recover') e.walkLeft = e.timer;
    else if (e.mode === 'run') e.walkLeft = frames(H.recoverFrames * 0.5, 1);
    // (On the ground it is batted, not flung: the next cut of a chain still reaches it.)
    const ground = e.side === 0 && e.landed;
    if (e.side === 0) {
      e.broken = true;
      e.landed = false;
    }
    e.knockVx = side * knockback * (ground ? H.knockGround : H.knock);
    e.knockVy = -(ground ? H.knockUpGround : H.knockUp);
    e.chargeLeft = 0;
    return Math.abs(e.knockVx);
  },

  /** A throw-cut knocks it off its face whatever it was doing: it tumbles and lands open (the blow lands too). */
  heavy(e) {
    if (e.side !== 0) {
      e.side = 0;
      e.broken = true;
      e.landed = false;
    }
    return false;
  },

  /** Its lunge hurt her: it falls off her (it lands open), and no lunge comes before her safety is over. */
  touched(e, info) {
    const H = info.t.huntsman;
    const n = frames(info.t.health.invulnFrames + H.rehitGapFrames - H.tellFrames);
    e.strikeCd = Math.max(e.strikeCd, n);
    if (e.mode === 'charge') {
      e.chargeLeft = 0;
      e.knockVx = -e.knockVx * 0.3;
      e.knockVy = Math.min(e.knockVy, -2);
      e.broken = true;
      setMode(e, 'fall', 0);
    }
  },

  /** Its lamp went out: it scuttles off up its face (gone at once if it was out when she came in). */
  disperse(e, _info, quiet) {
    if (e.mode !== 'recover' && e.mode !== 'fall' && e.mode !== 'charge') leave(e);
    if (quiet) e.gone = true;
    return 'leave';
  },
};
