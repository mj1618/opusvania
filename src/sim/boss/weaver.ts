/**
 * The Weaver, the wood's boss (docs/design/regions/wood.md §6, memory/bosses.md): an orb-weaver round the
 * wood's great lamp. One exam a phase:
 *
 *  - **P1, the ring (glide).** It sits on the heart. She snuffs the ring flames (a spoke from the heart
 *    to each: touching one is a gentle Caught); each snuff drops its spoke and gives 1 health back.
 *    Caught in the heart's core, its eyes count (`biteCount`) and it bites (1) and she is thrown out.
 *    The last ring: the spokes fall, it climbs into the canopy.
 *  - **P2, the drops (read the arc, move).** From the canopy over each pivot in turn it drops on a
 *    thread and swings half the arena: the tell draws the whole arc, it drops to the end away from the
 *    safe side, swings to the other end and back to the bottom, then hangs winded (open). Cut its thread
 *    and it falls stunned for longer. `p2Hp` blows end it.
 *  - **P3, the floor (pogo).** It hunts the floor: lunge tell (rears, flashes quickening), the lunge,
 *    then it lies winded abdomen up: only a pogo lands, one a window. Then it skitters to the trunk away
 *    from her, climbs it and drops back on a short thread (the landing shown first). `p3Hp` pogos and it
 *    flees for good; the heart lowers, unguarded.
 *  - **P4, the heart.** Three cuts (a pogo on the flame counts) and the great lamp goes out: defeat.
 *
 * The creature is `scene.enemies` kind `weaverBoss` (this file's `weaverBoss` KindRules: the shared hit,
 * contact and events), driven by the fight's state (`state.boss`, src/sim/boss/index.ts).
 * Pure: + - * / sqrt floor round min max abs (the swing's sine is Bhaskara's, src/sim/paths.ts).
 */
import type { KindRules, StepInfo } from '../enemies/common';
import { frames, setMode } from '../enemies/common';
import { flameAt, lureHpMax } from '../lures';
import { cycleSine } from '../paths';
import { type Box, slashBox } from '../player/attack';
import type { EnemyState, GameState } from '../state';
import type { Tuning } from '../tuning';
import {
  type BossCtx,
  type BossRules,
  defeat,
  enemyIndex,
  finish,
  lureIndex,
  setPhase,
  shift,
  startCues,
} from './core';

type T = Tuning['weaverBoss'];

const F = { x: 0, y: 0 };

/** The spider's box centre. */
function cx(e: EnemyState): number {
  return e.x + e.w / 2;
}
function cy(e: EnemyState): number {
  return e.y + e.h / 2;
}

/** Puts its box centre at (x, y). */
function put(e: EnemyState, x: number, y: number): void {
  e.x = Math.round(x - e.w / 2);
  e.y = Math.round(y - e.h / 2);
}

/** The fight's creature (null if the room has none). */
function creature(c: BossCtx): EnemyState | null {
  return c.state.enemies[enemyIndex(c.scene, c.spec.creature)] ?? null;
}

/** The heart's flame now. */
function heartAt(c: BossCtx): { x: number; y: number } {
  const i = lureIndex(c.scene, c.spec.heart);
  const l = c.scene.lures?.[i];
  if (!l) return { x: 0, y: 0 };
  return flameAt(c.state.lures, i, l, c.state.frame, c.t, { x: 0, y: 0 });
}

/** The arena's floor span (x) and the floor's and canopy's y. */
function ground(c: BossCtx): { x0: number; x1: number; floor: number; canopy: number } {
  const a = c.spec.arena;
  return {
    x0: a.x,
    x1: a.x + a.w,
    floor: c.spec.floor ?? a.y + a.h,
    canopy: c.spec.canopy ?? a.y,
  };
}

/** The strand of the web from the heart to ring `ring` (index into the web's strands; -1 none). */
function spokeOf(c: BossCtx, ring: string): number {
  const wi = enemyIndex(c.scene, c.spec.web);
  const strands = c.scene.enemies?.[wi]?.strands ?? [];
  const l = c.scene.lures?.[lureIndex(c.scene, ring)];
  if (!l) return -1;
  for (let i = 0; i < strands.length; i++) {
    const s = strands[i];
    if (!s) continue;
    const near = (x: number, y: number) => Math.abs(x - l.x) <= 2 && Math.abs(y - l.y) <= 2;
    if (near(s[0], s[1]) || near(s[2], s[3])) return i;
  }
  return -1;
}

/** Strand `i` of the web falls (cut char '2'). */
function dropSpoke(c: BossCtx, i: number): void {
  const web = c.state.enemies[enemyIndex(c.scene, c.spec.web)];
  if (!web || i < 0 || i >= web.cut.length) return;
  web.cut = `${web.cut.slice(0, i)}2${web.cut.slice(i + 1)}`;
}

/** Every strand of the web falls (and it lets go of her). */
function dropWeb(c: BossCtx): void {
  const web = c.state.enemies[enemyIndex(c.scene, c.spec.web)];
  if (!web) return;
  web.cut = '2'.repeat(web.cut.length);
}

/** Ring flames still burning. */
function ringsLeft(c: BossCtx): number {
  let n = 0;
  for (const id of c.spec.rings) if ((c.state.lures.hp[lureIndex(c.scene, id)] ?? 0) > 0) n++;
  return n;
}

/** The creature back as it starts (on the heart, sitting), with `hp`. */
function resetCreature(e: EnemyState, c: BossCtx, hp: number): void {
  const h = heartAt(c);
  put(e, h.x, h.y);
  setMode(e, 'sit', 0);
  e.hp = hp;
  e.hpMax = hp;
  e.gone = false;
  e.vx = 0;
  e.vy = 0;
  e.rx = 0;
  e.ry = 0;
  e.knockVx = 0;
  e.knockVy = 0;
  e.hitstop = 0;
  e.pogoed = false;
  e.stunned = false;
  e.facing = 1;
  e.aware = 0;
  e.calm = 0;
  e.span = 1;
}

/**
 * Starts a tell: `attack` live in `n` frames, its danger along the floor `x0..x1`, and the floor place
 * nearest her that it never reaches (`safeX`). `bossTell` and the shared `enemyWindup`.
 */
function tell(
  c: BossCtx,
  e: EnemyState,
  attack: 'swing' | 'lunge' | 'drop' | 'bite',
  n: number,
  x0: number,
  x1: number,
): void {
  const b = c.boss;
  const g = ground(c);
  b.tell = attack;
  b.tellFrames = n;
  b.tellX0 = Math.round(Math.max(g.x0, x0));
  b.tellX1 = Math.round(Math.min(g.x1, x1));
  // The floor point nearest her that is clear of the danger by a body and a margin.
  const p = c.state.player;
  const px = p.x + p.w / 2;
  const margin = 40;
  let safe = -1;
  let best = Infinity;
  const lo = g.x0 + 40;
  const hi = g.x1 - 40;
  for (let x = lo; x <= hi; x += 16) {
    if (x > x0 - margin && x < x1 + margin) continue;
    const d = Math.abs(x - px);
    if (d < best) {
      best = d;
      safe = x;
    }
  }
  b.safeX = attack === 'bite' ? -1 : safe;
  c.events.push({
    type: 'bossTell',
    id: b.id,
    x: cx(e),
    y: cy(e),
    attack,
    frames: n,
    x0: b.tellX0,
    x1: b.tellX1,
    safeX: b.safeX,
    px: b.pivotX,
    py: b.pivotY,
    len: b.len,
    reach: b.reach,
    side: b.side,
    dir: b.dir,
  });
  c.events.push({
    type: 'enemyWindup',
    id: e.id,
    kind: e.kind,
    x: cx(e),
    y: cy(e),
    dir: e.facing,
    frames: n,
    px: Math.round(Math.abs(x1 - x0)),
    speed: 0,
  });
}

/** The tell is over: the attack is live (`bossAttack`). */
function attack(c: BossCtx, e: EnemyState, n: number): void {
  const b = c.boss;
  c.events.push({
    type: 'bossAttack',
    id: b.id,
    x: cx(e),
    y: cy(e),
    attack: b.tell as 'swing' | 'lunge' | 'drop' | 'bite',
    frames: n,
  });
}

/** It lies open (winded or stunned) for `n` frames. */
function open(c: BossCtx, e: EnemyState, n: number, stunned: boolean): void {
  setMode(e, 'recover', n);
  e.stunned = stunned;
  e.pogoed = false;
  c.boss.tell = '';
  c.events.push({
    type: 'bossOpen',
    id: c.boss.id,
    x: cx(e),
    y: cy(e),
    how: stunned ? 'stunned' : 'winded',
    frames: n,
  });
}

// --- P2: the thread.

/** Where the swing puts it after `u` cycles (0.25 = the east end for side 1, 0.75 the other, 1 the bottom). */
function swingAt(c: BossCtx, u: number, out: { x: number; y: number }): { x: number; y: number } {
  const b = c.boss;
  const dx = b.side * b.reach * cycleSine(u);
  out.x = b.pivotX + dx;
  out.y = b.pivotY + Math.sqrt(Math.max(0, b.len * b.len - dx * dx));
  return out;
}

/** P2: the next drop's thread and its tell. */
function beginDrop(c: BossCtx, e: EnemyState): void {
  const b = c.boss;
  const W = c.t.weaverBoss;
  const g = ground(c);
  const drops = c.spec.drops ?? [(g.x0 + g.x1) / 2];
  const px = drops[b.drop % drops.length] as number;
  b.pivotX = px;
  b.pivotY = g.canopy;
  b.len = W.threadPx;
  // The whole swing stays inside the arena (a side pivot swings less: it never passes through a trunk).
  const room = Math.min(px - g.x0, g.x1 - px) - e.w / 2;
  b.reach = Math.max(120, Math.min(W.swingReach, W.threadPx * 0.95, room));
  b.thread = true;
  // It drops to the end away from the safe side: a side pivot's end toward the open arena; over the
  // middle, the end away from her (the drop never lands on her).
  const her = c.state.player.x + c.state.player.w / 2;
  if (px - b.reach < g.x0) b.side = 1;
  else if (px + b.reach > g.x1) b.side = -1;
  else b.side = her < px ? 1 : -1;
  put(e, px, g.canopy + e.h / 2);
  e.facing = b.side > 0 ? 1 : -1;
  const n = frames(W.tellFrames, 1);
  setMode(e, 'windup', n);
  tell(c, e, 'swing', n + frames(W.dropFrames, 1), px - b.reach - e.w / 2, px + b.reach + e.w / 2);
}

/** Its thread is cut (or P2 ends under it): it falls. */
function fall(c: BossCtx, e: EnemyState): void {
  c.boss.thread = false;
  c.boss.tell = '';
  setMode(e, 'fall', 0);
  e.knockVy = 0;
  e.ry = 0;
}

/** Falls toward the floor; true once it is on it. */
function falling(c: BossCtx, e: EnemyState, W: T): boolean {
  const g = ground(c);
  e.knockVy = Math.min(W.fallMax, e.knockVy + W.fallGravity);
  e.ry += e.knockVy;
  const n = Math.round(e.ry);
  e.ry -= n;
  e.y += n;
  if (e.y + e.h >= g.floor) {
    e.y = g.floor - e.h;
    e.knockVy = 0;
    e.ry = 0;
    return true;
  }
  return false;
}

/** P2: one step of the spider. Returns true when its touch is live. */
function stepP2(c: BossCtx, e: EnemyState, W: T): boolean {
  const b = c.boss;
  const g = ground(c);
  if (e.mode === 'perch') {
    // Along the canopy to the next pivot, then the tell.
    const drops = c.spec.drops ?? [(g.x0 + g.x1) / 2];
    const px = drops[b.drop % drops.length] as number;
    const x = cx(e);
    const step = Math.max(1, Math.abs(px - x) / Math.max(1, e.timer));
    put(e, x + Math.max(-step, Math.min(step, px - x)), g.canopy + e.h / 2);
    if (--e.timer <= 0) beginDrop(c, e);
    return false;
  }
  if (e.mode === 'windup') {
    b.tellFrames = Math.max(0, b.tellFrames - 1);
    if (--e.timer <= 0) {
      setMode(e, 'dive', frames(W.dropFrames, 1));
      attack(c, e, frames(W.dropFrames, 1) + frames(W.swingFrames, 1));
    }
    return false;
  }
  if (e.mode === 'dive') {
    // Down the thread to its end: accelerating (t²).
    const n = frames(W.dropFrames, 1);
    const k = 1 - (e.timer - 1) / n;
    swingAt(c, 0.25, F);
    const ease = k * k;
    put(e, b.pivotX + (F.x - b.pivotX) * ease, b.pivotY + e.h / 2 + (F.y - b.pivotY - e.h / 2) * ease);
    b.tellFrames = Math.max(0, b.tellFrames - 1);
    if (--e.timer <= 0) setMode(e, 'swing', frames(W.swingFrames, 1));
    return true;
  }
  if (e.mode === 'swing') {
    // Three quarters of a period: end to end and back to the bottom.
    const n = frames(W.swingFrames, 1);
    const k = 1 - (e.timer - 1) / n;
    swingAt(c, 0.25 + 0.75 * k, F);
    put(e, F.x, F.y);
    if (--e.timer <= 0) {
      put(e, b.pivotX, b.pivotY + b.len);
      open(c, e, frames(W.windedFrames, 1), false);
    }
    return true;
  }
  if (e.mode === 'recover') {
    if (--e.timer <= 0) {
      setMode(e, 'climb', frames(W.climbFrames, 1));
      e.stunned = false;
      b.thread = true;
      b.pivotX = cx(e);
    }
    return false;
  }
  if (e.mode === 'fall') {
    if (falling(c, e, W)) open(c, e, frames(W.stunFrames, 1), true);
    return false;
  }
  if (e.mode === 'climb') {
    // Up its thread to the canopy.
    const top = g.canopy + e.h / 2;
    const y = cy(e);
    const step = Math.max(1, (y - top) / Math.max(1, e.timer));
    put(e, cx(e), Math.max(top, y - step));
    if (--e.timer <= 0) {
      b.thread = false;
      b.drop++;
      setMode(e, 'perch', frames(W.perchFrames, 1));
    }
    return false;
  }
  return false;
}

// --- P3: the floor.

/** P3: the lunge's tell. */
function beginLunge(c: BossCtx, e: EnemyState, W: T): void {
  const b = c.boss;
  const g = ground(c);
  const her = c.state.player.x + c.state.player.w / 2;
  b.dir = her < cx(e) ? -1 : 1;
  e.facing = b.dir > 0 ? 1 : -1;
  const run = Math.max(W.lungePx, Math.min(W.lungeMax, Math.abs(her - cx(e)) + W.lungeOver));
  const end = Math.max(g.x0 + e.w / 2, Math.min(g.x1 - e.w / 2, cx(e) + b.dir * run));
  const n = frames(W.lungeTell, 1);
  setMode(e, 'windup', n);
  e.chargeLeft = Math.abs(end - cx(e));
  tell(c, e, 'lunge', n, Math.min(cx(e), end) - e.w / 2, Math.max(cx(e), end) + e.w / 2);
}

/** P3: the drop's tell, from its perch on a trunk to where it lands. */
function beginDropBack(c: BossCtx, e: EnemyState, W: T): void {
  const b = c.boss;
  const g = ground(c);
  const her = c.state.player.x + c.state.player.w / 2;
  b.landX = Math.round(Math.max(g.x0 + W.dropNear, Math.min(g.x1 - W.dropNear, her)));
  b.pivotX = cx(e);
  b.pivotY = cy(e);
  b.thread = true;
  e.facing = b.landX < cx(e) ? -1 : 1;
  const n = frames(W.dropTell, 1);
  setMode(e, 'windup', n);
  tell(c, e, 'drop', n, b.landX - e.w / 2 - 24, b.landX + e.w / 2 + 24);
}

/** P3's drop: `dropLand` frames, plus one for every `dropAcross` px it swings across. */
function dropFrames(b: NonNullable<GameState['boss']>, W: T): number {
  return frames(W.dropLand + Math.abs(b.landX - b.pivotX) / Math.max(1, W.dropAcross), 1);
}

/** P3: one step of the spider. Returns true when its touch is live. */
function stepP3(c: BossCtx, e: EnemyState, W: T): boolean {
  const b = c.boss;
  const g = ground(c);
  const p = c.state.player;
  const her = p.x + p.w / 2;
  if (e.mode === 'hunt') {
    e.facing = her < cx(e) ? -1 : 1;
    if (--e.timer <= 0) beginLunge(c, e, W);
    return true;
  }
  if (e.mode === 'windup' && b.tell === 'lunge') {
    b.tellFrames = Math.max(0, b.tellFrames - 1);
    if (--e.timer <= 0) {
      setMode(e, 'charge', 0);
      attack(c, e, Math.ceil(e.chargeLeft / Math.max(1, W.lungeSpeed)));
    }
    return true;
  }
  if (e.mode === 'charge') {
    const step = Math.min(W.lungeSpeed, e.chargeLeft);
    put(e, cx(e) + b.dir * step, cy(e));
    e.chargeLeft -= step;
    if (e.chargeLeft <= 0) open(c, e, frames(W.lungeWinded, 1), false);
    return true;
  }
  if (e.mode === 'recover') {
    // Abdomen up: one pogo and it rights itself and runs.
    if (e.pogoed || --e.timer <= 0) {
      if (e.pogoed) {
        setMode(e, 'skitter', 0);
        // To the trunk away from her.
        b.dir = her < cx(e) ? 1 : -1;
        e.facing = b.dir > 0 ? 1 : -1;
      } else setMode(e, 'hunt', frames(W.huntFrames, 1));
      e.pogoed = false;
      e.stunned = false;
    }
    return false;
  }
  if (e.mode === 'skitter') {
    const wall = b.dir > 0 ? g.x1 - e.w / 2 : g.x0 + e.w / 2;
    const x = cx(e);
    const step = Math.min(W.skitterSpeed, Math.abs(wall - x));
    put(e, x + b.dir * step, g.floor - e.h / 2);
    if (Math.abs(wall - cx(e)) < 1) setMode(e, 'climb', 0);
    return false;
  }
  if (e.mode === 'climb') {
    const y = cy(e);
    const top = W.perchY;
    put(e, cx(e), Math.max(top, y - W.climbSpeed));
    if (cy(e) <= top) beginDropBack(c, e, W);
    return false;
  }
  if (e.mode === 'windup' && b.tell === 'drop') {
    b.tellFrames = Math.max(0, b.tellFrames - 1);
    if (--e.timer <= 0) {
      const n = dropFrames(b, W);
      setMode(e, 'dive', n);
      e.chargeLeft = n;
      attack(c, e, n);
    }
    return false;
  }
  if (e.mode === 'dive') {
    // On its short thread from the trunk to the landing: across, falling faster (t²).
    const n = Math.max(1, e.chargeLeft);
    const k = 1 - (e.timer - 1) / n;
    const y1 = g.floor - e.h / 2;
    put(e, b.pivotX + (b.landX - b.pivotX) * k, b.pivotY + (y1 - b.pivotY) * k * k);
    if (--e.timer <= 0) {
      put(e, b.landX, y1);
      b.thread = false;
      b.tell = '';
      setMode(e, 'hunt', frames(W.huntFrames, 1));
    }
    return true;
  }
  if (e.mode === 'fall') {
    if (falling(c, e, W)) setMode(e, 'hunt', frames(W.huntFrames, 1));
    return false;
  }
  return false;
}

// --- The phase table, cues and the fight.

export const weaverRules: BossRules = {
  phases: [
    { name: 'the ring', exam: 'glide' },
    { name: 'the drops', exam: 'read the arc, move' },
    { name: 'the floor', exam: 'pogo' },
    { name: 'the heart', exam: 'snuff' },
  ],

  cues: (t) => t.weaverBoss.cues,

  init(c, retry, down) {
    const { state, scene, spec } = c;
    const L = state.lures;
    const hi = lureIndex(scene, spec.heart);
    const live = L.live;
    // Its flames: burning (unless beaten), the heart guarded, at home, pulling by its first row.
    for (const id of [spec.heart, ...spec.rings]) {
      const i = lureIndex(scene, id);
      const l = scene.lures?.[i];
      if (!l) continue;
      L.hp[i] = down ? 0 : lureHpMax(l, c.t);
      L.out[i] = down ? 1 : 0;
      L.hitBy[i] = 0;
    }
    if (live && hi >= 0) {
      live.row[hi] = '';
      live.dx[hi] = 0;
      live.dy[hi] = 0;
      live.shield[hi] = down ? 0 : 1;
    }
    if (retry) {
      for (const id of spec.retryOut) {
        const i = lureIndex(scene, id);
        if (i < 0) continue;
        L.hp[i] = 0;
        L.out[i] = 1;
      }
    }
    L.snuffed = L.out.filter((o) => o > 0).length;
    // The spokes: whole, except to a ring that is a husk.
    const web = state.enemies[enemyIndex(scene, spec.web)];
    if (web) {
      web.cut = '0'.repeat(web.cut.length);
      web.dispersed = false;
      web.gone = false;
      for (const id of spec.rings) if ((L.hp[lureIndex(scene, id)] ?? 0) <= 0) dropSpoke(c, spokeOf(c, id));
      if (down) dropWeb(c);
    }
    // The firefly's lamp: a husk until the boss is beaten.
    const ri = lureIndex(scene, spec.relight);
    if (ri >= 0 && !down) {
      L.hp[ri] = 0;
      L.out[ri] = 1;
    }
    const e = creature(c);
    if (e) {
      resetCreature(e, c, frames(c.t.weaverBoss.p2Hp, 1));
      if (down) {
        e.gone = true;
        setMode(e, 'flee', 0);
      }
    }
  },

  update(c) {
    const { state, scene, spec, boss } = c;
    const e = creature(c);
    const L = state.lures;
    // A ring went out this step: its spoke falls with it.
    for (const id of spec.rings) {
      const i = lureIndex(scene, id);
      if (i >= 0 && L.out[i] === state.frame + 1) {
        dropSpoke(c, spokeOf(c, id));
        const l = scene.lures?.[i];
        c.events.push({
          type: 'bossRing',
          id: boss.id,
          x: l?.x ?? 0,
          y: l?.y ?? 0,
          ring: id,
          left: ringsLeft(c),
        });
      }
    }
    if (boss.stage !== 'fight') {
      if (boss.stage === 'shift' && boss.phase === 3) lowerHeart(c);
      return;
    }
    if (boss.phase === 1 && ringsLeft(c) === 0) {
      dropWeb(c);
      if (e) {
        setMode(e, 'climb', frames(c.t.weaverBoss.climbFrames * 2, 1));
        boss.thread = true;
        boss.pivotX = cx(e);
        boss.pivotY = ground(c).canopy;
      }
      shift(c, 'p1end');
    } else if (boss.phase === 2 && e && e.hp <= 0) {
      if (e.mode !== 'recover' || !e.stunned) fall(c, e);
      shift(c, 'p2end');
    } else if (boss.phase === 3 && e && e.hp <= 0) {
      shift(c, 'p3end');
    } else if (boss.phase === 4) {
      const hi = lureIndex(scene, spec.heart);
      if ((L.hp[hi] ?? 0) <= 0) defeat(c);
    }
  },

  jump(c, n) {
    const { state, scene, spec } = c;
    const L = state.lures;
    const e = creature(c);
    const hi = lureIndex(scene, spec.heart);
    if (n >= 2) {
      for (const id of spec.rings) {
        const i = lureIndex(scene, id);
        if (i >= 0) {
          L.hp[i] = 0;
          L.out[i] = 1;
        }
      }
      dropWeb(c);
      if (e) put(e, cx(e), ground(c).canopy + e.h / 2);
    }
    if (n === 1) setPhase(c, 1);
    else if (n === 2) this.cue(c, 'p1end', 'next');
    else if (n === 3) {
      this.cue(c, 'p2end', 'flare');
      this.cue(c, 'p2end', 'next');
    } else if (n >= 4) {
      if (L.live && hi >= 0) {
        L.live.row[hi] = 'greatWide';
        const l = scene.lures?.[hi];
        if (l && spec.lowered) {
          L.live.dx[hi] = spec.lowered.x - l.x;
          L.live.dy[hi] = spec.lowered.y - l.y;
          c.boss.heartDy = L.live.dy[hi] as number;
        }
      }
      if (e) {
        e.gone = true;
        setMode(e, 'flee', 0);
      }
      this.cue(c, 'p3end', 'next');
    }
  },

  cue(c, set, cue) {
    const { state, scene, spec } = c;
    const e = creature(c);
    const W = c.t.weaverBoss;
    const L = state.lures;
    const hi = lureIndex(scene, spec.heart);
    if (set === 'intro' && cue === 'start') setPhase(c, 1);
    else if (set === 'p1end' && cue === 'next') {
      setPhase(c, 2);
      c.boss.drop = 0;
      if (e) {
        e.hp = frames(W.p2Hp, 1);
        e.hpMax = e.hp;
        e.span = 2;
        setMode(e, 'perch', frames(W.perchFrames, 1));
      }
    } else if (set === 'p2end' && cue === 'flare') {
      if (L.live && hi >= 0) L.live.row[hi] = 'greatWide';
    } else if (set === 'p2end' && cue === 'next') {
      setPhase(c, 3);
      if (e) {
        e.hp = frames(W.p3Hp, 1);
        e.hpMax = e.hp;
        e.span = 3;
        e.stunned = false;
        put(e, cx(e), ground(c).floor - e.h / 2);
        setMode(e, 'hunt', frames(W.huntFrames, 1));
      }
    } else if (set === 'p3end' && cue === 'flee') {
      if (e) setMode(e, 'flee', 0);
    } else if (set === 'p3end' && cue === 'next') {
      setPhase(c, 4);
      if (L.live && hi >= 0) L.live.shield[hi] = 0;
    } else if (set === 'defeat' && cue === 'relight') {
      const ri = lureIndex(scene, spec.relight);
      const l = scene.lures?.[ri];
      if (l) {
        L.hp[ri] = lureHpMax(l, c.t);
        L.out[ri] = 0;
        c.events.push({ type: 'bossRelight', id: c.boss.id, x: l.x, y: l.y, lure: l.id });
      }
    } else if (set === 'defeat' && cue === 'done') finish(c);
  },
};

/** P3's end: the heart lowers to `spec.lowered` over `lowerFrames` from the `lower` cue (ease in-out). */
function lowerHeart(c: BossCtx): void {
  const { scene, spec, state, boss } = c;
  const live = state.lures.live;
  const hi = lureIndex(scene, spec.heart);
  const l = scene.lures?.[hi];
  if (!live || !l || !spec.lowered || boss.cueSet !== 'p3end') return;
  const from = c.t.weaverBoss.cues.p3end.lower;
  const n = Math.max(1, c.t.weaverBoss.lowerFrames);
  const k = Math.max(0, Math.min(1, (boss.cueFrames - from) / n));
  const s = k * k * (3 - 2 * k);
  live.dx[hi] = (spec.lowered.x - l.x) * s;
  live.dy[hi] = (spec.lowered.y - l.y) * s;
  boss.heartDy = live.dy[hi] as number;
}

// --- The creature.

/** Its thread (pivot to its back) meets her slash's area this frame: it is cut. */
function threadCut(
  state: GameState,
  b: NonNullable<GameState['boss']>,
  e: EnemyState,
  t: Tuning,
): Box | null {
  const p = state.player;
  if (!b.thread || p.attack === 'none' || !p.attackActive) return null;
  const box = slashBox(p, p.attack, p.attackFacing, t, p.attackStep);
  const x0 = b.pivotX;
  const y0 = b.pivotY;
  const x1 = cx(e);
  const y1 = e.y;
  // Liang-Barsky against the box.
  const dx = x1 - x0;
  const dy = y1 - y0;
  let u0 = 0;
  let u1 = 1;
  const ps = [-dx, dx, -dy, dy];
  const qs = [x0 - box.x, box.x + box.w - x0, y0 - box.y, box.y + box.h - y0];
  for (let k = 0; k < 4; k++) {
    const pk = ps[k] as number;
    const qk = qs[k] as number;
    if (pk === 0) {
      if (qk < 0) return null;
      continue;
    }
    const r = qk / pk;
    if (pk < 0) {
      if (r > u1) return null;
      if (r > u0) u0 = r;
    } else {
      if (r < u0) return null;
      if (r < u1) u1 = r;
    }
  }
  return u0 <= u1 ? box : null;
}

/** The fight's context for the creature's own update (null outside a fight of this room). */
function fightOf(info: StepInfo): BossCtx | null {
  const { state, scene } = info;
  const spec = scene.boss;
  const boss = state.boss;
  if (!spec || !boss || spec.kind !== 'weaver') return null;
  return { rules: weaverRules, state, scene, spec, boss, t: info.t, events: info.events };
}

export const weaverBoss: KindRules = {
  width: (t) => t.weaverBoss.width,
  height: (t) => t.weaverBoss.height,
  hp: (t) => t.weaverBoss.p2Hp,
  hurtFrames: (t) => t.weaverBoss.hurtFrames,
  hurtSafeFrames: (t) => t.weaverBoss.hurtSafeFrames,
  contactDamage: (t) => t.weaverBoss.contactDamage,
  deadFrames: (t) => t.weaverBoss.deadFrames,
  value: () => 0,

  /** `x`, `y` = where it sits (the heart's flame). */
  place(e, spawn) {
    e.x = Math.round(spawn.x - e.w / 2);
    e.y = Math.round(spawn.y - e.h / 2);
    e.mode = 'sit';
  },

  update(e, _index, info) {
    const c = fightOf(info);
    if (!c) return false;
    const W = info.t.weaverBoss;
    const b = c.boss;
    const p = info.state.player;
    if (e.mode === 'flee') {
      const top = ground(c).canopy - e.h;
      put(e, cx(e), cy(e) - W.fleeSpeed);
      if (e.y <= top) e.gone = true;
      return false;
    }
    if (b.stage === 'down') {
      e.gone = true;
      return false;
    }
    const x0 = e.x;
    const y0 = e.y;
    let live = false;
    // Its thread meets her blade (P2 hanging on it, P3's short drop is too quick to cut).
    if (b.phase === 2 && (e.mode === 'swing' || e.mode === 'recover') && !e.stunned) {
      const box = threadCut(info.state, b, e, info.t);
      if (box) {
        info.events.push({
          type: 'bossThreadCut',
          id: b.id,
          x: Math.round(box.x + box.w / 2),
          y: Math.round(box.y + box.h / 2),
        });
        fall(c, e);
      }
    }
    if (b.stage === 'wait' || b.stage === 'intro' || (b.stage === 'fight' && b.phase === 1)) {
      // On the heart. In P1, caught in the heart's core: it counts and bites.
      const h = heartAt(c);
      put(e, h.x, h.y);
      const held = p.lure === lureIndex(c.scene, c.spec.heart) && b.stage === 'fight';
      if (e.mode === 'sit' || e.mode === 'hurt') {
        if (held) {
          const n = frames(W.biteCount, 1);
          setMode(e, 'windup', n);
          e.facing = p.x + p.w / 2 < h.x ? -1 : 1;
          tell(c, e, 'bite', n, h.x - e.w / 2, h.x + e.w / 2);
        }
      } else if (e.mode === 'windup') {
        b.tellFrames = Math.max(0, b.tellFrames - 1);
        if (!held) {
          setMode(e, 'sit', 0);
          b.tell = '';
        } else if (--e.timer <= 0) {
          setMode(e, 'bite', frames(W.biteFrames, 1));
          attack(c, e, frames(W.biteFrames, 1));
          info.events.push({
            type: 'enemyBite',
            id: e.id,
            kind: e.kind,
            x: cx(e),
            y: cy(e),
            hit: true,
            frames: frames(W.biteFrames, 1),
          });
        }
      } else if (e.mode === 'bite') {
        live = true;
        if (--e.timer <= 0) {
          setMode(e, 'sit', 0);
          b.tell = '';
        }
      } else setMode(e, 'sit', 0);
    } else if (b.stage === 'shift' && b.phase === 1) {
      // The ring is out: up into the canopy along its line (harmless).
      const top = ground(c).canopy + e.h / 2;
      const step = Math.max(2, (cy(e) - top) / Math.max(1, e.timer));
      put(e, cx(e), Math.max(top, cy(e) - step));
      if (e.timer > 0) e.timer--;
      if (cy(e) <= top) {
        b.thread = false;
        setMode(e, 'perch', 0);
      }
    } else if (b.phase === 2 && (b.stage === 'fight' || e.mode === 'fall' || e.mode === 'recover')) {
      if (b.stage === 'fight') live = stepP2(c, e, W);
      else if (e.mode === 'fall' && falling(c, e, W)) open(c, e, frames(W.stunFrames, 1), true);
    } else if (b.phase === 3 && b.stage === 'fight') live = stepP3(c, e, W);
    e.vx = e.x - x0;
    e.vy = e.y - y0;
    return live;
  },

  /** It is aware of her the whole fight. */
  sees(_e, info) {
    const b = info.state.boss;
    return !!b && (b.stage === 'fight' || b.stage === 'intro');
  },

  /**
   * What lands: in P1 nothing (it sits on the heart: the blade glances), in P2 only while it hangs
   * open or falls, in P3 only a pogo while it lies winded (once a window); every other blow glances.
   */
  blocks(e, dir) {
    if (e.mode === 'fall') return false;
    if (e.mode !== 'recover') return true;
    // P3 (`span` holds the phase): abdomen up, only a pogo lands, one a window.
    if (e.span === 3) return dir !== 'down' || e.pogoed;
    return false;
  },

  /** A blow never knocks it about; a pogo on its abdomen (P3) is noted (it rights itself and runs). */
  shove(e, dir) {
    e.knockVx = 0;
    if (dir === 'down' && e.mode === 'recover' && e.span === 3) e.pogoed = true;
    return 0;
  },

  /** No stagger: its fight decides what a blow does. */
  tough: () => true,
  undying: () => true,

  /** Harmless unless an attack is live (the bite, the drop and swing, the lunge, P3's drop, standing in its way on the floor). */
  harmless(e, info) {
    const b = info.state.boss;
    if (b?.stage !== 'fight') return true;
    if (e.mode === 'bite' || e.mode === 'dive' || e.mode === 'swing' || e.mode === 'charge') return false;
    if (b.phase === 3 && (e.mode === 'hunt' || (e.mode === 'windup' && b.tell === 'lunge'))) return false;
    return true;
  },
};

/** For tests and tools: start cue set `set` now (debug jumps). */
export function weaverCue(c: BossCtx, set: string): void {
  startCues(c, set);
}
