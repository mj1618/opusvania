/**
 * The bombardier (canopy-r22-creatures.md, docs/design/creatures.md §2, memory/enemies.md "The bombardier"): a squat
 * ground beetle perched on a ledge or a floor, HK's Aspid slot. Real bombardier beetles fire a boiling spray from the
 * tip of the abdomen, which they can swing over the back to aim; this one lobs it.
 *
 *  - `sit`: perched, watching. It sees her by sight (lamp rules: `seenBy`; a clear line from its turret; within
 *    `sightPx` sideways, `sightUpPx` / `sightDownPx`). She is behind it: it turns round first (`turning`,
 *    `turnFrames`; `enemyTurn cause hunt`), every cut from behind landing freely meanwhile.
 *  - Far: `rear` (the tell, `tellFrames`, `enemyWindup {px: the distance}`): the abdomen tips up over its back and
 *    glows hot, counting down. Then `spit`: a burst of `burst` droplets `burstGap` apart, each lobbed on an arc to
 *    pass through where she is (her vx x `leadFrames` ahead, capped), the second short of her and the third past her
 *    (`spreadPx`). A droplet is `GameState.shots` (src/sim/shots.ts): it hurts her on touch and splashes on ground.
 *  - Close, in front (`conePx` from its front edge): `windup` (a quick tell, `coneTellFrames`) then `spray`: a hot
 *    cone `coneReach` x `coneH` in front for `sprayFrames` (it hurts her through the framework's `waveHit`). From
 *    the front a forward cut lands but does not stagger it then (`tough`): the answer is from behind or above (a pogo
 *    on its back works, `stompable`).
 *  - After either: `pause` (`pauseFrames`), then `sit` with `cooldownFrames` before the next tell.
 *  - **A slash bats a droplet back** (src/sim/shots.ts `slashShots`): it flies straight at its owner; one that hits it
 *    lays it on its back, open (`recover`, `stunFrames`: harmless, every cut lands and none stands it up), then a
 *    harmless get-up (`wake`).
 *  - `hurt`: the shared stagger, a small shove that keeps it on its ledge. `dead`: launched along the blow, it falls
 *    and lies on its back (`landed`) until `gone`.
 *  - Fair: no tell for `enterCalmFrames` after it is made (a room entry, a re-form) or `returnCalmFrames` after a
 *    fall's return, none on one held helpless who never saw it (`heldUnseen`).
 *  - A lamp-guarder (`guards`): its lamp snuffed, it folds up asleep (`sleep`, harmless).
 *
 * State it uses: `strikeCd` (frames until it may tell again), `turning` + `walkLeft` (the turn), `rams` (droplets
 * fired this burst), `targetX, targetY` (its aim: her body centre at the tell), `knockVx, knockVy` + `rx, ry` (the
 * shove, the death's flight), `landed` (the body lies on something), `waveHit` (the spray met her this step).
 * Pure: + - * / sqrt, floor, round, ceil, min, max.
 */

import { oneWayUnder, solidAt } from '../physics/aabb';
import type { Scene } from '../scene';
import type { EnemyState, GameState, ShotState } from '../state';
import type { Tuning } from '../tuning';
import { frames, heldUnseen, type KindRules, type StepInfo, segmentBlocked, setMode } from './common';
import { seenBy } from './senses';

type B = Tuning['bombardier'];

const cx = (e: EnemyState): number => e.x + e.w / 2;
const cy = (e: EnemyState): number => e.y + e.h / 2;

/** Where its droplets leave: the turret's tip, over its back. */
export function muzzleOf(e: EnemyState, t: Tuning): { x: number; y: number } {
  const B = t.bombardier;
  return { x: cx(e) - (e.facing < 0 ? -1 : 1) * B.muzzleBack, y: e.y - B.muzzleUp };
}

/** Ground under the column at `x` just below its feet (a solid or a one-way). */
function groundAt(scene: Scene, x: number, e: EnemyState): boolean {
  return solidAt(scene, x, e.y + e.h, 1, 1) || oneWayUnder(scene, x, e.y, 1, e.h);
}

/** Its box at `x` would stand on something under both its quarter points and clear of solids. */
function standsAt(scene: Scene, x: number, e: EnemyState): boolean {
  if (solidAt(scene, x, e.y, e.w, e.h)) return false;
  const q = Math.round(e.w / 4);
  return groundAt(scene, x + q, e) && groundAt(scene, x + e.w - q, e);
}

/** She is in its sight: seen (lamp rules), inside its sight box, a clear line from its turret to her centre. */
function canSee(e: EnemyState, info: StepInfo): boolean {
  if (seenBy(e, info) <= 0) return false;
  const B = info.t.bombardier;
  const p = info.state.player;
  const px = p.x + p.w / 2;
  const py = p.y + p.h / 2;
  const dx = px - cx(e);
  const dy = py - cy(e);
  if (Math.abs(dx) > B.sightPx || dy < -B.sightUpPx || dy > B.sightDownPx) return false;
  const m = muzzleOf(e, info.t);
  if (!segmentBlocked(info.scene, m.x, m.y, px, py) || !segmentBlocked(info.scene, cx(e), e.y, px, py))
    return true;
  // (A mortar sees over a lip: on a ledge over her floor, a clear lob to her counts as sight.)
  return lobFor(info.scene, B, m.x, m.y, px, py) !== null;
}

/** She is in front of it, close: within `conePx` of its front edge, and level with it (the spray's reach). */
function inCone(e: EnemyState, info: StepInfo): boolean {
  const B = info.t.bombardier;
  const p = info.state.player;
  const f = e.facing < 0 ? -1 : 1;
  const gap = f > 0 ? p.x - (e.x + e.w) : e.x - (p.x + p.w);
  if (gap > B.conePx || gap < -e.w / 2) return false;
  const dy = p.y + p.h / 2 - cy(e);
  return dy >= -B.coneUpPx && dy <= B.coneDownPx;
}

/** The spray's hot cone in front of it now (grows over its first frames): x, y, w, h. */
export function coneBox(e: EnemyState, t: Tuning): { x: number; y: number; w: number; h: number } {
  const B = t.bombardier;
  const n = frames(B.sprayFrames, 1);
  const into = e.mode === 'spray' ? Math.min(1, (n - e.timer + 1) / Math.max(1, Math.min(6, n))) : 0;
  const reach = Math.round(B.coneReach * into);
  const h = Math.round(B.coneH * (0.5 + 0.5 * into));
  const f = e.facing < 0 ? -1 : 1;
  const x = f > 0 ? e.x + e.w - 6 : e.x + 6 - reach;
  return { x, y: Math.round(cy(e) - 6 - h / 2), w: reach, h };
}

function windup(e: EnemyState, info: StepInfo, mode: 'rear' | 'windup', n: number): void {
  const p = info.state.player;
  setMode(e, mode, n);
  e.targetX = Math.round(p.x + p.w / 2);
  e.targetY = Math.round(p.y + p.h / 2);
  const dx = e.targetX - cx(e);
  const dy = e.targetY - cy(e);
  info.events.push({
    type: 'enemyWindup',
    id: e.id,
    kind: e.kind,
    x: cx(e),
    y: cy(e),
    dir: e.facing,
    frames: n,
    px: Math.round(Math.sqrt(dx * dx + dy * dy)),
    speed: 0,
  });
}

/**
 * The ballistic start velocity (exact for the sim's `vy += g; y += vy` step) that carries a droplet from (x0, y0)
 * through (x1, y1) in `n` frames under gravity `g`.
 */
export function lobVelocity(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  n: number,
  g: number,
): { vx: number; vy: number } {
  const T = Math.max(1, n);
  return { vx: (x1 - x0) / T, vy: (y1 - y0 - (g * T * (T + 1)) / 2) / T };
}

/** Its flight time to a mark `dist` px away. */
export function flightFrames(B: B, dist: number): number {
  return Math.round(Math.max(B.flightMin, Math.min(B.flightMax, B.flightBase + B.flightPerPx * dist)));
}

/** Flight-time choices for a lob, as fractions of its usual time: the usual arc first, then flatter, then higher. */
const ARCS = [1, 0.78, 0.6, 1.25];

/**
 * A lob from (x0, y0) through (x1, y1) whose path is clear of solids up to its mark (sampled every 3 frames), trying
 * the usual flight time first, then flatter and higher arcs (under a branch it throws flat, over a lip it throws high).
 * Null when none is clear: it holds its tell (no droplets into cover).
 */
export function lobFor(
  scene: Scene,
  B: B,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { vx: number; vy: number; T: number } | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const base = flightFrames(B, Math.sqrt(dx * dx + dy * dy));
  for (let k = 0; k < ARCS.length; k++) {
    const T = Math.max(8, Math.round(base * (ARCS[k] as number)));
    const v = lobVelocity(x0, y0, x1, y1, T, B.shotGravity);
    let x = x0;
    let y = y0;
    let vy = v.vy;
    let px = x;
    let py = y;
    let clear = true;
    // (Short of the mark by a few frames: it is aimed at her body, which may stand by a wall.)
    for (let f = 1; f <= T - 3 && clear; f++) {
      vy += B.shotGravity;
      x += v.vx;
      y += vy;
      if (f % 3 === 0 || f === T - 3) {
        if (segmentBlocked(scene, px, py, x, y)) clear = false;
        px = x;
        py = y;
      }
    }
    if (clear) return { vx: v.vx, vy: v.vy, T };
  }
  return null;
}

/** Droplet `n` of the burst: lobbed at her (lead, then short, then past), pushed onto `state.shots`. */
function fire(e: EnemyState, index: number, info: StepInfo, n: number): void {
  const B = info.t.bombardier;
  const p = info.state.player;
  const m = muzzleOf(e, info.t);
  const lead = Math.max(-B.leadMaxPx, Math.min(B.leadMaxPx, p.vx * B.leadFrames));
  let tx = p.x + p.w / 2 + lead;
  const away = tx < m.x ? -1 : 1;
  // 0: at her; 1: short of her; 2: past her; then wider each pair.
  const off = n === 0 ? 0 : n % 2 === 1 ? -B.spreadPx * Math.ceil(n / 2) : B.spreadPx * (n / 2);
  tx += away * off;
  const ty = p.y + p.h / 2;
  const dx = tx - m.x;
  const dy = ty - m.y;
  // (A clear arc if there is one; else the usual one, and it splashes on whatever is in the way.)
  const T0 = flightFrames(B, Math.sqrt(dx * dx + dy * dy));
  const lob = lobFor(info.scene, B, m.x, m.y, tx, ty);
  const T = lob ? lob.T : T0;
  const v = lob ?? lobVelocity(m.x, m.y, tx, ty, T, B.shotGravity);
  const shot: ShotState = {
    id: info.state.frame * 256 + (index & 255),
    owner: index,
    x: m.x,
    y: m.y,
    vx: v.vx,
    vy: v.vy,
    g: B.shotGravity,
    r: B.shotRadius,
    age: 0,
    hold: 0,
    reflected: false,
    hitBy: -1,
  };
  if (!info.state.shots) info.state.shots = [];
  info.state.shots.push(shot);
  info.events.push({
    type: 'shotFire',
    shot: shot.id,
    owner: e.id,
    kind: e.kind,
    x: m.x,
    y: m.y,
    vx: v.vx,
    vy: v.vy,
    tx: Math.round(tx),
    ty: Math.round(ty),
    flight: T,
    n,
    of: Math.max(1, Math.round(B.burst)),
  });
}

/** It moves by `knockVx` (the shove) one px at a time, never off its ledge nor into a wall; the shove fades. */
function slide(e: EnemyState, scene: Scene, B: B): void {
  e.rx += e.knockVx;
  let n = Math.round(e.rx);
  e.rx -= n;
  const d = n < 0 ? -1 : 1;
  while (n !== 0) {
    if (!standsAt(scene, e.x + d, e)) {
      e.knockVx = 0;
      e.rx = 0;
      break;
    }
    e.x += d;
    n -= d;
  }
  e.knockVx *= B.shoveDecay;
  if (Math.abs(e.knockVx) < 0.05) e.knockVx = 0;
}

/** The dead body's flight: launched along the blow, under gravity, until it lies on something. */
function tumble(e: EnemyState, scene: Scene, B: B): void {
  if (e.landed) return;
  e.knockVy = Math.min(14, e.knockVy + B.deathGravity);
  e.rx += e.knockVx;
  let n = Math.round(e.rx);
  e.rx -= n;
  const d = n < 0 ? -1 : 1;
  while (n !== 0) {
    if (solidAt(scene, e.x + d, e.y, e.w, e.h)) {
      e.knockVx = -e.knockVx * 0.3;
      e.rx = 0;
      break;
    }
    e.x += d;
    n -= d;
  }
  e.ry += e.knockVy;
  let m = Math.round(e.ry);
  e.ry -= m;
  const u = m < 0 ? -1 : 1;
  while (m !== 0) {
    const down = u > 0;
    if (
      solidAt(scene, e.x, e.y + u, e.w, e.h) ||
      (down && oneWayUnder(scene, e.x + Math.round(e.w / 4), e.y, Math.round(e.w / 2), e.h))
    ) {
      if (down) {
        e.landed = true;
        e.knockVx = 0;
      }
      e.knockVy = 0;
      e.ry = 0;
      break;
    }
    e.y += u;
    m -= u;
  }
  if (e.y > scene.height + 200) e.gone = true;
}

/** Back on its perch, watching, the next tell `cd` frames off at the earliest. */
function settle(e: EnemyState, cd: number): void {
  setMode(e, e.dispersed ? 'sleep' : 'sit', 0);
  e.strikeCd = Math.max(e.strikeCd, frames(cd));
}

/** Its own batted droplet hit it (src/sim/shots.ts): on its back, open. */
export function stunBombardier(e: EnemyState, t: Tuning): number {
  const n = frames(t.bombardier.stunFrames, 1);
  setMode(e, 'recover', n);
  e.knockVx = 0;
  e.rams = 0;
  return n;
}

function step(e: EnemyState, index: number, info: StepInfo): boolean {
  const B = info.t.bombardier;
  const { state, scene } = info;
  const p = state.player;
  e.waveHit = false;
  if (e.strikeCd > 0) e.strikeCd--;
  const x0 = e.x;
  const y0 = e.y;
  const done = (live: boolean): boolean => {
    e.vx = e.x - x0;
    e.vy = e.y - y0;
    return live;
  };
  if (e.mode === 'dead') {
    // Launched along the blow (the first step after the killing hold), then it falls and lies on its back.
    if (e.modeFrames === 1) {
      const side = e.hitDir < 0 ? -1 : 1;
      e.knockVx = side * B.deathLaunchVx;
      e.knockVy = -B.deathLaunchVy;
      e.rx = 0;
      e.ry = 0;
      e.landed = false;
    }
    tumble(e, scene, B);
    if (--e.timer <= 0) e.gone = true;
    return done(false);
  }
  if (e.mode === 'sleep') return done(false);
  // (Round 5's rule: never a shot over a fall's return.)
  for (let i = info.first; i < info.events.length; i++)
    if (info.events[i]?.type === 'fallReturn') e.strikeCd = Math.max(e.strikeCd, frames(B.returnCalmFrames));
  if (e.mode === 'recover') {
    // On its back, open: harmless; then the get-up.
    if (--e.timer <= 0) setMode(e, 'wake', frames(B.wakeFrames, 1));
    return done(false);
  }
  if (e.mode === 'wake') {
    if (--e.timer <= 0) settle(e, B.cooldownFrames * 0.5);
    return done(false);
  }
  if (e.mode === 'hurt') {
    slide(e, scene, B);
    if (--e.timer <= 0) settle(e, B.pauseFrames);
    return done(true);
  }
  if (e.knockVx !== 0) slide(e, scene, B);
  if (e.mode === 'rear') {
    if (--e.timer <= 0) {
      setMode(e, 'spit', 0);
      e.rams = 0;
    }
  } else if (e.mode === 'spit') {
    const gap = frames(B.burstGap, 1);
    const of = Math.max(1, Math.round(B.burst));
    if ((e.modeFrames - 1) % gap === 0 && e.rams < of) {
      fire(e, index, info, e.rams);
      e.rams++;
    }
    if (e.rams >= of && e.modeFrames > (of - 1) * gap + 1) setMode(e, 'pause', frames(B.pauseFrames, 1));
  } else if (e.mode === 'windup') {
    if (--e.timer <= 0) {
      const n = frames(B.sprayFrames, 1);
      setMode(e, 'spray', n);
      info.events.push({
        type: 'enemySpray',
        id: e.id,
        kind: e.kind,
        x: cx(e),
        y: cy(e),
        dir: e.facing,
        reach: Math.round(B.coneReach),
        frames: n,
      });
    }
  } else if (e.mode === 'spray') {
    const c = coneBox(e, info.t);
    if (p.hp > 0 && p.faded === 0 && p.x < c.x + c.w && c.x < p.x + p.w && p.y < c.y + c.h && c.y < p.y + p.h)
      e.waveHit = true;
    if (--e.timer <= 0) setMode(e, 'pause', frames(B.pauseFrames, 1));
  } else if (e.mode === 'pause') {
    if (--e.timer <= 0) settle(e, B.cooldownFrames);
  } else {
    // `sit` (and anything else it is left in).
    if (e.mode !== 'sit') setMode(e, 'sit', 0);
    if (canSee(e, info)) {
      const px = p.x + p.w / 2;
      const side = px < cx(e) ? -1 : 1;
      if (side !== e.facing) {
        if (!e.turning) {
          e.turning = true;
          e.walkLeft = frames(B.turnFrames, 1);
          info.events.push({
            type: 'enemyTurn',
            id: e.id,
            kind: e.kind,
            x: cx(e),
            y: cy(e),
            dir: side,
            cause: 'hunt',
            frames: e.walkLeft,
          });
        } else if (--e.walkLeft <= 0) {
          e.turning = false;
          e.facing = side;
        }
      } else {
        e.turning = false;
        if (e.strikeCd === 0 && !heldUnseen(e, p)) {
          if (inCone(e, info)) windup(e, info, 'windup', frames(B.coneTellFrames, 1));
          else {
            // (Only with a clear arc to her: no burst into the branch she stands under.)
            const m = muzzleOf(e, info.t);
            if (lobFor(scene, B, m.x, m.y, p.x + p.w / 2, p.y + p.h / 2))
              windup(e, info, 'rear', frames(B.tellFrames, 1));
            // (Looked again a little later, not every step.)
            else e.strikeCd = 6;
          }
        }
      }
    } else e.turning = false;
  }
  return done(true);
}

export const bombardier: KindRules = {
  width: (t) => t.bombardier.width,
  height: (t) => t.bombardier.height,
  hp: (t) => t.bombardier.hp,
  hurtFrames: (t) => t.bombardier.hurtFrames,
  hurtSafeFrames: (t) => t.bombardier.hurtSafeFrames,
  contactDamage: (t) => t.bombardier.contactDamage,
  deadFrames: (t) => t.bombardier.deadFrames,
  value: (t, finisher) => (finisher ? t.bombardier.valueFinisher : t.bombardier.value),

  /** `x`, `y` = its feet centre, on a surface; `facing` = the way it watches at first. */
  place(e, spawn, t) {
    e.x = Math.round(spawn.x - e.w / 2);
    e.y = Math.round(spawn.y - e.h);
    e.mode = 'sit';
    // Never a shot on arrival (creatures.md rule 7): it is made as she comes in, and again as she re-forms.
    e.strikeCd = frames(t.bombardier.enterCalmFrames);
  },

  update: step,

  /** Aware of her while it tells or fires, and while it watches her from its perch. */
  sees(e, info) {
    if (e.mode === 'rear' || e.mode === 'spit' || e.mode === 'windup' || e.mode === 'spray') return true;
    return e.mode === 'sit' && canSee(e, info);
  },

  /** A small shove along the blow (it keeps to its ledge: `slide`). */
  shove(e, dir, side, knockback, t) {
    const k = t.bombardier.shoveK * knockback * (dir === 'fwd' ? 1 : 0.5);
    e.knockVx = side * k;
    e.knockVy = 0;
    return Math.abs(e.knockVx);
  },

  /**
   * Blows that land without a stagger: on its back (every cut lands, none stands it up) and, from the front, a
   * forward cut into its spray or the spray's tell (it sprays on: from behind or above).
   */
  tough(e, dir) {
    if (e.mode === 'recover') return true;
    return dir === 'fwd' && (e.mode === 'windup' || e.mode === 'spray') && e.hitDir === -e.facing;
  },

  /** Coming down on its back in a down slash is a pogo. */
  stompable: (e) => e.mode !== 'spray' && e.mode !== 'windup',

  /** Its touch does nothing on its back, getting up, or asleep. */
  harmless: (e) => e.mode === 'recover' || e.mode === 'wake' || e.mode === 'sleep',

  /** Safe ground (her re-form) keeps beyond the spray and a step. */
  homeClear: (_e, t) => t.bombardier.conePx + t.bombardier.coneReach + 120,

  /** A lantern kindled near it, or the run ended: it settles on its perch. */
  calm(e, _info, n) {
    settle(e, n);
  },

  /** Its lamp went out: it folds up asleep. */
  disperse(e) {
    setMode(e, 'sleep', 0);
    return 'sleep';
  },
};

/** For tests and tools: every live droplet a creature of index `owner` has in flight. */
export function shotsOf(state: GameState, owner: number): ShotState[] {
  return (state.shots ?? []).filter((q) => q.owner === owner);
}
