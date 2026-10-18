/**
 * The dangler (docs/design/creatures.md §2, wood.md rescope item 1, memory/creatures.md): a small spider
 * that drops on silk from a perch over her path. The Weaver's P2 drop made small, so the boss's rhythm
 * is rehearsed half an hour before the fight.
 *
 *  - `sit`: it waits at its perch (`EnemySpawn.x, y` = where its thread is tied, under a ceiling or a
 *    branch). Harmless up there.
 *  - It notices her by sight (a lamp room: only while she is lit), below it, within `noticePx` sideways,
 *    a clear line: `windup` (the tell: the thread is shown to where it will drop, `targetX, targetY`,
 *    `enemyWindup {px: the drop}`), `tellFrames`.
 *  - `drop`: down the thread to the end, accelerating (`dropFrames`): its touch is live. The end is level
 *    with her body when the tell began (clamped to `minDrop` .. `maxDrop`, never into the ground).
 *  - `swing`: one swing toward her (the side she is on as the drop ends) and back (`swingFrames`,
 *    `swingPx`): live.
 *  - `stall`: it hangs open, bobbing (`hangFrames`): harmless, her window (2 hp: cut, cut).
 *  - `climb`: back up its thread (`climbSpeed`): harmless; then `sit` and `cooldownFrames` before the
 *    next tell.
 *  - **Cut its thread** (a slash across the silk above it, any time it hangs): `enemyThreadCut`, it falls
 *    to the ground (`fall`, harmless), lies stunned and open (`recover`, `stunFrames`), then scuttles off
 *    for good (`leave`). A blow on its body is an ordinary hit (it staggers on the thread, then climbs).
 *  - A lamp-guarder (`guards`): its lamp snuffed, it climbs away up its thread and is gone.
 *
 * State it uses: `fromX, fromY` = the thread's tie point; `span` = the thread's length now (render draws
 * the silk from the tie point down to the top of the body); `targetX, targetY` = the drop's end (the
 * tell); `side` = the swing's first way; `broken` = the thread is cut; `strikeCd` = the cooldown.
 * Pure: + - * / sqrt, floor, round, min, max (the swing's sine is src/sim/paths.ts's).
 */

import { cycleSine } from '../paths';
import { solidAt } from '../physics/aabb';
import type { EnemyState } from '../state';
import type { Tuning } from '../tuning';
import { frames, heldUnseen, type KindRules, type StepInfo, segmentBlocked, setMode } from './common';
import { seenBy, shyOf } from './senses';
import { segmentInBox } from './web';

type D = Tuning['dangler'];

/** Puts its box's centre at (cx, cy). */
function at(e: EnemyState, cx: number, cy: number): void {
  e.x = Math.round(cx - e.w / 2);
  e.y = Math.round(cy - e.h / 2);
}

/** The body centre's height at its perch (just under the tie point). */
const perchY = (e: EnemyState): number => e.fromY + e.h / 2 + 4;

/** Keeps `span` = the silk from the tie point to the top of its body. */
function silk(e: EnemyState): void {
  e.span = Math.max(0, e.y - e.fromY);
}

/** How far below the tie point (body centre) it may drop here: down to `maxDrop`, stopping short of the ground. */
function room(e: EnemyState, info: StepInfo, want: number): number {
  const D = info.t.dangler;
  let end = Math.max(D.minDrop, Math.min(e.radius > 0 ? e.radius : D.maxDrop, want));
  // Clear down to the end? Stop a little above whatever it would meet.
  for (let y = perchY(e); y <= e.fromY + end; y += 8) {
    if (solidAt(info.scene, Math.round(e.fromX - e.w / 2), Math.round(y + e.h / 2), e.w, 1)) {
      end = Math.max(e.h, y - e.fromY - 8);
      break;
    }
  }
  return end;
}

/** She is in its sight: seen (lit, in a lamp room), below it, within `noticePx` sideways, a clear line. */
function sees(e: EnemyState, info: StepInfo): boolean {
  const p = info.state.player;
  if (seenBy(e, info) <= 0) return false;
  const px = p.x + p.w / 2;
  const py = p.y + p.h / 2;
  const D = info.t.dangler;
  if (Math.abs(px - e.fromX) > D.noticePx) return false;
  if (py < e.fromY + D.minDrop * 0.5 || py > e.fromY + (e.radius > 0 ? e.radius : D.maxDrop) + p.h)
    return false;
  return !segmentBlocked(info.scene, e.fromX, perchY(e), px, py);
}

function tell(e: EnemyState, info: StepInfo): void {
  const D = info.t.dangler;
  const p = info.state.player;
  const drop = room(e, info, p.y + p.h / 2 - e.fromY);
  const n = frames(D.tellFrames, 1);
  setMode(e, 'windup', n);
  e.targetX = e.fromX;
  e.targetY = e.fromY + drop;
  const px = p.x + p.w / 2;
  e.side = px < e.fromX ? -1 : 1;
  e.facing = e.side < 0 ? -1 : 1;
  info.events.push({
    type: 'enemyWindup',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    dir: e.facing,
    frames: n,
    px: Math.round(drop),
    speed: 0,
  });
}

function climb(e: EnemyState): void {
  setMode(e, 'climb', 0);
}

/** Its thread is cut: it falls (harmless), then lies stunned. */
function cut(e: EnemyState, info: StepInfo): void {
  e.broken = true;
  e.knockVy = 0;
  e.ry = 0;
  setMode(e, 'fall', 0);
  info.events.push({
    type: 'enemyThreadCut',
    id: e.id,
    kind: e.kind,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    fromX: e.fromX,
    fromY: e.fromY,
  });
}

/** Falls under gravity until something stops it. Returns true when it has landed. */
function fall(e: EnemyState, info: StepInfo, D: D): boolean {
  e.knockVy = Math.min(D.maxFall, e.knockVy + D.gravity);
  e.ry += e.knockVy;
  let n = Math.round(e.ry);
  e.ry -= n;
  while (n > 0) {
    if (solidAt(info.scene, e.x, e.y + 1, e.w, e.h) || e.y + e.h >= info.scene.height) {
      e.ry = 0;
      e.vy = 0;
      return true;
    }
    e.y++;
    n--;
  }
  e.vy = e.knockVy;
  return false;
}

export const dangler: KindRules = {
  width: (t) => t.dangler.width,
  height: (t) => t.dangler.height,
  hp: (t) => t.dangler.hp,
  hurtFrames: (t) => t.dangler.hurtFrames,
  hurtSafeFrames: (t) => t.dangler.hurtSafeFrames,
  contactDamage: (t) => t.dangler.contactDamage,
  deadFrames: (t) => t.dangler.deadFrames,
  value: (t, finisher) => (finisher ? t.dangler.valueFinisher : t.dangler.value),

  /** `x`, `y` = where its thread is tied (under a ceiling or a branch); it waits just below. */
  place(e, spawn) {
    e.radius = Math.max(0, spawn.drop ?? 0);
    e.fromX = spawn.x;
    e.fromY = spawn.y;
    e.mode = 'sit';
    at(e, e.fromX, perchY(e));
    silk(e);
  },

  update(e, _index, info) {
    const D = info.t.dangler;
    const x0 = e.x;
    const y0 = e.y;
    let live = false;
    if (e.strikeCd > 0) e.strikeCd--;
    if (e.mode === 'dead') {
      // Off its silk: it drops, and is gone.
      if (!e.landed && fall(e, info, D)) e.landed = true;
      if (--e.timer <= 0) e.gone = true;
      return false;
    }
    if (e.mode === 'leave') {
      // Away for good: up its thread if it has one, else off along the ground.
      if (!e.broken) {
        e.y -= Math.round(D.leaveSpeed);
        silk(e);
      } else e.x += Math.round(D.leaveSpeed) * (e.facing < 0 ? -1 : 1);
      if (--e.timer <= 0 || (!e.broken && e.y <= e.fromY - e.h)) e.gone = true;
      e.vx = e.x - x0;
      e.vy = e.y - y0;
      return false;
    }
    if (e.mode === 'fall') {
      if (fall(e, info, D)) setMode(e, 'recover', frames(D.stunFrames, 1));
      e.vx = 0;
      return false;
    }
    if (e.mode === 'recover') {
      // Stunned on the ground where it fell: open, harmless. Then it scuttles off.
      e.vx = 0;
      e.vy = 0;
      if (--e.timer <= 0) setMode(e, 'leave', frames(D.leaveFrames, 1));
      return false;
    }
    if (e.mode === 'hurt') {
      // Struck on its thread: it sways, then climbs.
      if (--e.timer <= 0) climb(e);
      e.vx = 0;
      e.vy = 0;
      return true;
    }
    if (e.mode === 'sit') {
      at(e, e.fromX, perchY(e));
      // (Round 5: never over a fall's return: put back on safe ground, she has `returnCalmFrames` first.)
      for (let i = info.first; i < info.events.length; i++)
        if (info.events[i]?.type === 'fallReturn')
          e.strikeCd = Math.max(e.strikeCd, frames(D.returnCalmFrames));
      // It hunts the stop (wood-area1-director.md): it drops once she has stood still in its sight for
      // `stopFrames` (on the spot she stands on to cut the flame); one running through is let pass.
      // (`lost` counts those frames.)
      const p = info.state.player;
      const still = p.grounded && Math.abs(p.vx) <= D.stillVx && sees(e, info);
      e.lost = still ? e.lost + 1 : 0;
      // (A landing under it is a stop too: round 4.)
      if (D.landStop && info.stir === 'land' && p.grounded && sees(e, info))
        e.lost = Math.max(e.lost, D.stopFrames);
      // (Not on one held helpless by a lamp who never saw it coming: round 4.)
      if (
        e.strikeCd === 0 &&
        !heldUnseen(e, p) &&
        (D.stopFrames > 0 ? e.lost >= D.stopFrames : sees(e, info)) &&
        // (Silver light, Lanternroot: it holds its perch over a moonlit stop.)
        !shyOf(e, info, p.x + p.w / 2, p.y + p.h / 2)
      ) {
        e.lost = 0;
        tell(e, info);
      }
    } else if (e.mode === 'windup') {
      if (--e.timer <= 0) setMode(e, 'drop', frames(D.dropFrames, 1));
    } else if (e.mode === 'drop') {
      // Down the thread, accelerating (t²): its touch is live.
      const n = frames(D.dropFrames, 1);
      const k = Math.min(1, (n - e.timer + 1) / n);
      at(e, e.fromX, perchY(e) + (e.targetY - perchY(e)) * k * k);
      live = true;
      if (--e.timer <= 0) {
        // It swings toward where she is now (she may have run under it during the drop).
        const p = info.state.player;
        const px = p.x + p.w / 2;
        if (px !== e.fromX) e.side = px < e.fromX ? -1 : 1;
        setMode(e, 'swing', frames(D.swingFrames, 1));
      }
    } else if (e.mode === 'swing') {
      // One swing toward her side and back to the bottom of the thread: live.
      const n = frames(D.swingFrames, 1);
      const u = Math.min(1, (n - e.timer + 1) / n);
      const len = Math.max(1, e.targetY - e.fromY);
      const off = Math.min(D.swingPx, len * 0.9) * cycleSine(u) * e.side;
      at(e, e.fromX + off, e.fromY + Math.sqrt(Math.max(0, len * len - off * off)));
      live = true;
      if (--e.timer <= 0) setMode(e, 'stall', frames(D.hangFrames, 1));
    } else if (e.mode === 'stall') {
      // It hangs open, bobbing on the silk: her window.
      const n = frames(D.hangFrames, 1);
      const u = (n - e.timer) / Math.max(1, D.bobFrames);
      at(e, e.fromX, e.targetY + D.bobPx * cycleSine(u));
      if (--e.timer <= 0) climb(e);
    } else if (e.mode === 'climb') {
      const y = e.y + e.h / 2 - D.climbSpeed;
      if (y <= perchY(e)) {
        at(e, e.fromX, perchY(e));
        setMode(e, 'sit', 0);
        e.strikeCd = frames(D.cooldownFrames);
      } else at(e, e.fromX, y);
    }
    silk(e);
    e.vx = e.x - x0;
    e.vy = e.y - y0;
    return live;
  },

  /** It is aware of her from its tell to the end of its swing. */
  sees(e) {
    return e.mode === 'windup' || e.mode === 'drop' || e.mode === 'swing';
  },

  /**
   * A cut across its silk (the thread above its body, while it hangs) cuts the thread: it falls. A blow
   * on its body is the shared hit (-1 = not taken here).
   */
  slashed(e, _index, info, box) {
    const hanging =
      e.mode === 'drop' ||
      e.mode === 'swing' ||
      e.mode === 'stall' ||
      e.mode === 'climb' ||
      e.mode === 'hurt';
    const body = box.x < e.x + e.w && e.x < box.x + box.w && box.y < e.y + e.h && e.y < box.y + box.h;
    if (body || !hanging || e.broken) return -1;
    const top: [number, number, number, number] = [e.fromX, e.fromY, e.x + e.w / 2, e.y];
    if (!segmentInBox(top, box.x, box.y, box.x + box.w, box.y + box.h)) return -1;
    cut(e, info);
    return 0;
  },

  /** A throw-cut parts its silk wherever it lands (hanging): it falls, and lies stunned. */
  heavy(e, info) {
    const hanging =
      e.mode === 'drop' ||
      e.mode === 'swing' ||
      e.mode === 'stall' ||
      e.mode === 'climb' ||
      e.mode === 'windup' ||
      e.mode === 'sit';
    if (!hanging || e.broken) return false;
    cut(e, info);
    return true;
  },

  /** Its lamp went out: it climbs away up its thread for good (gone at once if it was out when she came in). */
  disperse(e, info, quiet) {
    if (e.mode !== 'fall' && e.mode !== 'recover') setMode(e, 'leave', frames(info.t.dangler.leaveFrames, 1));
    if (quiet) e.gone = true;
    return 'leave';
  },

  /** On its silk a blow does not move it. */
  shove(e) {
    e.knockVx = 0;
    e.knockVy = 0;
    return 0;
  },

  /** Only its drop and its swing hurt. */
  harmless: (e) => e.mode !== 'drop' && e.mode !== 'swing',
};
