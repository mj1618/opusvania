/**
 * Droplets in flight (`GameState.shots`, memory/enemies.md "The bombardier"): the bombardier's boiling spray, the
 * game's first projectile (creatures.md §5's `spit` block: the archerfish and Wing's Gust can reuse it).
 *
 *  - Each step a droplet not held falls (`vy += g`) and moves in sub-steps of at most `SUB` px: it splashes on a
 *    solid (or the room's closed edges) and on a one-way it falls onto (`shotSplash on: ground`), is spent on her
 *    (`on: her`: she is hurt, unless she cannot be: then it passes through her), cools after `shotLife` frames or
 *    leaves the room (`on: out`).
 *  - **A slash bats it back** (`slashShots`, from her slash's resolution): any slash area that meets it. It holds with
 *    her for `deflectHitstop`, then flies straight at its owner (`reflectSpeed`, `reflectGravity`); if its owner is
 *    gone, straight back the way it came. A batted droplet never hurts her; it hits the first creature it meets
 *    (`shotHit`): its owner is laid on its back open (`stunBombardier`), any other creature takes the blow as a cut.
 *
 * Pure: + - * / sqrt, round, ceil, min, max. Imported by the step (src/sim/index.ts) and the slash
 * (src/sim/player/player.ts); never by a creature module (they push droplets themselves).
 */
import { enemyRules } from './enemies';
import { stunBombardier } from './enemies/bombardier';
import { frames, setMode } from './enemies/common';
import type { SimEvent } from './events';
import { oneWayUnder, solidAt } from './physics/aabb';
import type { Box } from './player/attack';
import type { EnemyKind, Scene } from './scene';
import type { AttackDir, EnemyState, GameState, ShotState } from './state';
import type { Tuning } from './tuning';

/** The longest move of one sub-step, px. */
const SUB = 6;

/** Kinds a batted droplet passes by (their blows are their own fights' business). */
const PASSES: ReadonlySet<EnemyKind> = new Set<EnemyKind>([
  'web',
  'weaverBoss',
  'gloamweaver',
  'mantis',
  'oldBurrback',
]);

function ownerId(state: GameState, q: ShotState): string {
  return state.enemies[q.owner]?.id ?? '';
}

function splash(
  state: GameState,
  q: ShotState,
  on: 'ground' | 'her' | 'creature' | 'out',
  events: SimEvent[],
): void {
  events.push({
    type: 'shotSplash',
    shot: q.id,
    owner: ownerId(state, q),
    x: Math.round(q.x),
    y: Math.round(q.y),
    vx: q.vx,
    vy: q.vy,
    reflected: q.reflected,
    on,
  });
}

/**
 * Her slash number `seq` (area `box`, going `dir`, she faces `facing`) against every droplet in flight: each one it
 * meets for the first time and that is not already batted is batted back at its owner (`shotDeflect`). Returns how
 * many (they count as hits for her hitstop, recoil and pogo).
 */
export function slashShots(
  state: GameState,
  box: Box,
  seq: number,
  dir: Exclude<AttackDir, 'none'>,
  facing: number,
  t: Tuning,
  events: SimEvent[],
): number {
  const list = state.shots;
  if (!list || list.length === 0) return 0;
  const B = t.bombardier;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (!q || q.reflected || q.hitBy === seq) continue;
    if (q.x + q.r <= box.x || q.x - q.r >= box.x + box.w || q.y + q.r <= box.y || q.y - q.r >= box.y + box.h)
      continue;
    q.hitBy = seq;
    q.reflected = true;
    const o = state.enemies[q.owner];
    let tx: number;
    let ty: number;
    if (o && !o.gone && o.mode !== 'dead') {
      tx = o.x + o.w / 2;
      ty = o.y + o.h / 2;
    } else {
      tx = q.x - q.vx * 40;
      ty = q.y - q.vy * 40;
    }
    const dx = tx - q.x;
    const dy = ty - q.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const s = B.reflectSpeed;
    q.vx = d > 1e-6 ? (dx / d) * s : (facing < 0 ? -1 : 1) * s;
    q.vy = d > 1e-6 ? (dy / d) * s : 0;
    q.g = B.reflectGravity;
    q.hold = frames(B.deflectHitstop);
    q.age = 0;
    n++;
    events.push({
      type: 'shotDeflect',
      shot: q.id,
      owner: ownerId(state, q),
      x: Math.round(q.x),
      y: Math.round(q.y),
      dir,
      facing: facing < 0 ? -1 : 1,
      vx: q.vx,
      vy: q.vy,
      tx: Math.round(tx),
      ty: Math.round(ty),
      hitstop: q.hold,
    });
  }
  return n;
}

/** A batted droplet meets creature `i`: its owner on its back, anyone else a cut's blow. */
function strike(
  state: GameState,
  t: Tuning,
  q: ShotState,
  i: number,
  e: EnemyState,
  events: SimEvent[],
): void {
  const B = t.bombardier;
  const K = enemyRules(e.kind);
  const side = q.vx < 0 ? -1 : 1;
  const dmg = Math.max(1, Math.round(B.reflectDamage));
  const stop = frames(B.reflectHitstop);
  e.calm = 0;
  e.gift = 0;
  e.hitDir = side;
  e.hitPower = dmg;
  e.hitFrame = state.frame;
  e.hp = Math.max(0, e.hp - dmg);
  e.hitstop = stop;
  e.vx = 0;
  e.vy = 0;
  const kill = e.hp <= 0 && !K.undying?.(e);
  const own = q.owner === i && e.kind === 'bombardier';
  let n = 0;
  const knock = t.slash1.knockback;
  if (kill) {
    const kb = K.shove(e, 'fwd', side, knock, t);
    n = frames(K.deadFrames(t), 1);
    setMode(e, 'dead', n);
    events.push({
      type: 'shotHit',
      shot: q.id,
      owner: ownerId(state, q),
      id: e.id,
      kind: e.kind,
      x: e.x + e.w / 2,
      y: e.y + e.h / 2,
      dir: side,
      damage: dmg,
      hpLeft: e.hp,
      hpMax: e.hpMax,
      hitstop: stop,
      stun: false,
      kill: true,
      frames: n,
    });
    events.push({
      type: 'enemyDie',
      id: e.id,
      kind: e.kind,
      x: e.x + e.w / 2,
      y: e.y + e.h / 2,
      facing: e.facing,
      slash: 'fwd',
      dir: side,
      power: dmg,
      hpMax: e.hpMax,
      knockback: kb,
      hitstop: stop,
      frames: n,
      value: 0,
      glintFrames: 0,
      stagger: 0,
    });
  } else {
    let kb = 0;
    if (own) n = stunBombardier(e, t);
    else {
      kb = K.shove(e, 'fwd', side, knock, t);
      n = frames(K.hurtFrames(t), 1);
      if (!K.tough?.(e, 'fwd', t)) setMode(e, 'hurt', n);
    }
    events.push({
      type: 'shotHit',
      shot: q.id,
      owner: ownerId(state, q),
      id: e.id,
      kind: e.kind,
      x: e.x + e.w / 2,
      y: e.y + e.h / 2,
      dir: side,
      damage: dmg,
      hpLeft: e.hp,
      hpMax: e.hpMax,
      hitstop: stop,
      stun: own,
      kill: false,
      frames: n,
    });
    events.push({
      type: 'enemyHit',
      id: e.id,
      kind: e.kind,
      x: e.x + e.w / 2,
      y: e.y + e.h / 2,
      facing: e.facing,
      slash: 'fwd',
      dir: side,
      power: dmg,
      hpLeft: e.hp,
      hpMax: e.hpMax,
      knockback: kb,
      hitstop: stop,
      frames: n,
    });
  }
  const p = state.player;
  p.hitstop = Math.max(p.hitstop, frames(B.reflectHerHitstop));
}

/**
 * Her touch: a droplet meets her (`hurt` decides: true = she was hurt; false = she cannot be, and it passes through).
 * `dir` = the way she is thrown (-1 / 1), `hitX, hitY` where it met her, `owner` = the creature that fired it.
 */
export type ShotHurt = (
  dir: number,
  damage: number,
  owner: EnemyState | undefined,
  hitX: number,
  hitY: number,
) => boolean;

/** One step of droplet `q`. False = it is spent (splashed, cooled, out). */
function stepShot(
  state: GameState,
  scene: Scene,
  t: Tuning,
  q: ShotState,
  hurt: ShotHurt,
  events: SimEvent[],
): boolean {
  if (q.hold > 0) {
    q.hold--;
    return true;
  }
  const B = t.bombardier;
  if (++q.age > Math.max(1, Math.round(B.shotLife))) {
    splash(state, q, 'out', events);
    return false;
  }
  q.vy += q.g;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(q.vx), Math.abs(q.vy)) / SUB));
  const p = state.player;
  const half = Math.max(1, Math.round(q.r * 0.5));
  const hk = q.r * B.hurtK;
  for (let s = 0; s < n; s++) {
    const oy = q.y;
    q.x += q.vx / n;
    q.y += q.vy / n;
    if (q.x < -64 || q.x > scene.width + 64 || q.y > scene.height + 64 || q.y < -600) {
      splash(state, q, 'out', events);
      return false;
    }
    // Terrain: a solid (the room's closed edges too), or a one-way it falls onto.
    const bx = Math.round(q.x) - half;
    const by = Math.round(q.y) - half;
    if (solidAt(scene, bx, by, half * 2, half * 2)) {
      q.x -= q.vx / n / 2;
      q.y -= q.vy / n / 2;
      splash(state, q, 'ground', events);
      return false;
    }
    if (q.vy > 0) {
      const ows = scene.oneWays;
      for (let k = 0; k < ows.length; k++) {
        const o = ows[k];
        if (!o || q.x < o.x || q.x >= o.x + o.w) continue;
        if (oy + half <= o.y && q.y + half >= o.y) {
          q.y = o.y - half;
          splash(state, q, 'ground', events);
          return false;
        }
      }
      // (A one-way exactly under it.)
      if (oneWayUnder(scene, bx, by, half * 2, half * 2)) {
        splash(state, q, 'ground', events);
        return false;
      }
    }
    if (!q.reflected) {
      // Her: a fair hit, a little inside the drawn bead.
      if (
        p.hp > 0 &&
        p.faded === 0 &&
        q.x + hk > p.x &&
        q.x - hk < p.x + p.w &&
        q.y + hk > p.y &&
        q.y - hk < p.y + p.h
      ) {
        const dir = q.vx < 0 ? -1 : q.vx > 0 ? 1 : p.x + p.w / 2 < q.x ? -1 : 1;
        const hx = Math.max(p.x, Math.min(p.x + p.w, q.x));
        const hy = Math.max(p.y, Math.min(p.y + p.h, q.y));
        if (hurt(dir, Math.max(1, Math.round(B.shotDamage)), state.enemies[q.owner], hx, hy)) {
          splash(state, q, 'her', events);
          return false;
        }
      }
    } else {
      // Batted: the first creature it meets.
      const list = state.enemies;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e.gone || e.mode === 'dead' || e.arrive > 0 || PASSES.has(e.kind)) continue;
        if (q.x + q.r <= e.x || q.x - q.r >= e.x + e.w || q.y + q.r <= e.y || q.y - q.r >= e.y + e.h)
          continue;
        strike(state, t, q, i, e, events);
        splash(state, q, 'creature', events);
        return false;
      }
    }
  }
  return true;
}

/**
 * One step of every droplet in flight. Spent ones are removed. A fade's re-form or a fall's return clears them all
 * (nothing in the air is aimed at where she is put back).
 */
export function updateShots(
  state: GameState,
  scene: Scene,
  t: Tuning,
  events: SimEvent[],
  first: number,
  hurt: ShotHurt,
): void {
  if (!state.shots) state.shots = [];
  const list = state.shots;
  if (list.length === 0) return;
  for (let i = first; i < events.length; i++) {
    const ty = events[i]?.type;
    if (ty === 'reform' || ty === 'fallReturn' || ty === 'roomEnter') {
      list.length = 0;
      return;
    }
  }
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (q && stepShot(state, scene, t, q, hurt, events)) list[w++] = q;
  }
  list.length = w;
}
