/**
 * Enemies (`scene.enemies`). One kind so far: the burrback, a small armoured beetle.
 *
 *  - It walks its platform at a steady pace and turns round at ledges (it never walks off) and at
 *    walls, standing a beat as it turns. Now and then it rests mid-walk, on a fixed schedule from
 *    its id. It has no gravity, does not chase and has no attack: touching it is what hurts.
 *  - It notices her in one way: when she lands or starts a slash close by, it flinches (`alert`).
 *  - A slash takes its `power` from the creature's hit points, holds it for the hitstop, shoves it
 *    along the cut (a fading velocity that stops at walls and at the brink of a ledge) and staggers
 *    it (`hurt`). For the first `hurtSafeFrames` of that its touch is harmless.
 *  - At 0 it dies: the body stays `deadFrames` for the death animation, then is `gone`. It spills
 *    glints into the one collectible counter like a pod does (`pickup` events with `enemy: true`).
 *  - A slash does not reach through solid ground: the line from her body centre to the part of the
 *    creature inside the hit area must be clear of solids (one-way branches do not block).
 *
 * Runs after the player each step: slashes are resolved by the player's update (`slashEnemies`)
 * against where the enemies stood, then they move, then contact is tested (`updateEnemies`).
 */
import type { SimEvent } from './events';
import { roundHalfAway, solidAt } from './physics/aabb';
import type { Box } from './player/attack';
import type { EnemySpawn, Scene } from './scene';
import type { AttackDir, EnemyState, GameState, PlayerState } from './state';
import type { Tuning } from './tuning';

const frames = (n: number, min = 0): number => Math.max(min, Math.round(n));

/** A stable 32-bit mix of two integers (Math.imul is exact on every engine). */
function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

function saltOf(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = mix(h, id.charCodeAt(i));
  return h;
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

export function createEnemy(spawn: EnemySpawn, t: Tuning): EnemyState {
  const b = t.burrback;
  const w = frames(b.width, 2);
  const h = frames(b.height, 2);
  const e: EnemyState = {
    id: spawn.id,
    kind: spawn.kind,
    x: Math.round(spawn.x - w / 2),
    y: Math.round(spawn.y) - h,
    w,
    h,
    rx: 0,
    vx: 0,
    facing: spawn.facing < 0 ? -1 : 1,
    hp: frames(b.hp, 1),
    hpMax: frames(b.hp, 1),
    mode: 'walk',
    modeFrames: 0,
    timer: 0,
    turning: false,
    stride: 0,
    knockVx: 0,
    hitstop: 0,
    hitBy: 0,
    hitDir: 0,
    hitPower: 0,
    hitFrame: -1,
    teeter: 0,
    gone: false,
    alertCd: 0,
    walkLeft: 0,
    rests: 0,
    salt: saltOf(spawn.id),
    spill: 0,
    spillTimer: 0,
    spillGap: 0,
  };
  e.walkLeft = nextWalk(e, b);
  return e;
}

export function createEnemies(scene: Scene, t: Tuning): EnemyState[] {
  return (scene.enemies ?? []).map((s) => createEnemy(s, t));
}

/** Living enemies go back to where they started, whole; dead ones stay dead (their glints still arrive). */
export function resetEnemies(state: GameState, scene: Scene, t: Tuning): void {
  const list = scene.enemies ?? [];
  for (let i = 0; i < list.length; i++) {
    const e = state.enemies[i];
    const s = list[i];
    if (!e || !s || e.mode === 'dead') continue;
    state.enemies[i] = createEnemy(s, t);
  }
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

function setMode(e: EnemyState, mode: EnemyState['mode'], timer: number): void {
  e.mode = mode;
  e.modeFrames = 0;
  e.timer = timer;
  e.turning = false;
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

/** Glints of the dead, one at a time into the collectible count (as pods do). */
function spill(e: EnemyState, state: GameState, comboFrames: number, events: SimEvent[]): void {
  if (e.spill <= 0) return;
  const timer = e.spillTimer - 1;
  if (timer > 0) {
    e.spillTimer = timer;
    return;
  }
  const c = state.pickups;
  const b = state.player;
  e.spill--;
  e.spillTimer = e.spill > 0 ? Math.max(1, e.spillGap) : 0;
  c.combo = c.comboTimer > 0 ? c.combo + 1 : 0;
  c.comboTimer = comboFrames;
  c.count += 1;
  events.push({
    type: 'pickup',
    id: e.id,
    kind: 'glint',
    value: 1,
    x: e.x + e.w / 2,
    y: e.y + e.h / 2,
    px: b.x + (b.w >> 1),
    py: b.y + (b.h >> 1),
    combo: c.combo,
    total: c.count,
    enemy: true,
  });
}

/** Squared gap between two boxes (0 when they touch or overlap). */
function gap2(a: Box, b: Box): number {
  const dx = a.x + a.w < b.x ? b.x - (a.x + a.w) : b.x + b.w < a.x ? a.x - (b.x + b.w) : 0;
  const dy = a.y + a.h < b.y ? b.y - (a.y + a.h) : b.y + b.h < a.y ? a.y - (b.y + b.h) : 0;
  return dx * dx + dy * dy;
}

/**
 * One step for every enemy. `first` = index in `events` of this step's first event (the player's
 * `land` and `slash` are read from there). Returns the index of a living enemy whose body she
 * touches while it can hurt, or -1.
 */
export function updateEnemies(
  state: GameState,
  scene: Scene,
  t: Tuning,
  events: SimEvent[],
  first: number,
): number {
  const list = state.enemies;
  if (list.length === 0) return -1;
  const B = t.burrback;
  const p = state.player;
  let stir: 'land' | 'slash' | '' = '';
  for (let i = first; i < events.length; i++) {
    const ev = events[i];
    if (ev?.type === 'slash') stir = 'slash';
    else if (ev?.type === 'land' && stir === '') stir = 'land';
  }
  let touch = -1;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e) continue;
    spill(e, state, t.pickups.comboFrames, events);
    if (e.gone) continue;
    if (e.hitstop > 0) {
      e.hitstop--;
      e.vx = 0;
      continue;
    }
    e.modeFrames++;
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
      continue;
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
    // Contact: its touch hurts, except for the first beat after it was hit.
    if (touch < 0 && !(e.mode === 'hurt' && e.modeFrames < frames(B.hurtSafeFrames))) {
      if (p.x < e.x + e.w && e.x < p.x + p.w && p.y < e.y + e.h && e.y < p.y + p.h) touch = i;
    }
  }
  return touch;
}

/** Does the segment (x0, y0) -> (x1, y1) pass through the inside of a solid? (+ - * / only.) */
function segmentBlocked(scene: Scene, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const solids = scene.solids;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (s === undefined) continue;
    let t0 = 0;
    let t1 = 1;
    if (dx === 0) {
      if (x0 <= s.x || x0 >= s.x + s.w) continue;
    } else {
      const a = (s.x - x0) / dx;
      const b = (s.x + s.w - x0) / dx;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
      if (t0 >= t1) continue;
    }
    if (dy === 0) {
      if (y0 <= s.y || y0 >= s.y + s.h) continue;
    } else {
      const a = (s.y - y0) / dy;
      const b = (s.y + s.h - y0) / dy;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
      if (t0 >= t1) continue;
    }
    return true;
  }
  return false;
}

/**
 * Applies slash number `seq` (hit area `box`) to every living enemy it overlaps, has not hit yet
 * and can reach. Pushes `slashHit` and `enemyHit` / `enemyDie`; returns how many it hit this step.
 */
export function slashEnemies(
  state: GameState,
  scene: Scene,
  box: Box,
  seq: number,
  dir: Exclude<AttackDir, 'none'>,
  facing: number,
  pogo: boolean,
  step: number,
  power: number,
  knockback: number,
  hitstop: number,
  t: Tuning,
  events: SimEvent[],
): number {
  const list = state.enemies;
  if (list.length === 0) return 0;
  const B = t.burrback;
  const E = t.enemies;
  const b: PlayerState = state.player;
  const px = b.x + (b.w >> 1);
  const py = b.y + (b.h >> 1);
  let hits = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || e.mode === 'dead' || e.hitBy === seq) continue;
    const l = Math.max(box.x, e.x);
    const r = Math.min(box.x + box.w, e.x + e.w);
    const top = Math.max(box.y, e.y);
    const bot = Math.min(box.y + box.h, e.y + e.h);
    if (l >= r || top >= bot) continue;
    if (segmentBlocked(scene, px, py, (l + r) / 2, (top + bot) / 2)) continue;
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    // The shove: along a forward cut; an up / down cut pushes it aside, away from her, less hard.
    const side = dir === 'fwd' ? (facing < 0 ? -1 : 1) : cx < px ? -1 : cx > px ? 1 : facing < 0 ? -1 : 1;
    const kb = dir === 'fwd' ? knockback : knockback * B.knockVertical;
    e.hitBy = seq;
    e.hitDir = side;
    e.hitPower = power;
    e.hitFrame = state.frame;
    e.hp = Math.max(0, e.hp - Math.max(1, Math.round(power)));
    e.knockVx = side * kb;
    // +1: updateEnemies still runs this step, so it is held exactly as long as she is.
    e.hitstop = hitstop > 0 ? hitstop + 1 : 0;
    e.rx = 0;
    e.vx = 0;
    e.teeter = 0;
    hits++;
    events.push({
      type: 'slashHit',
      x: cx,
      y: cy,
      dir,
      facing,
      target: { kind: e.kind, id: e.id },
      px,
      py,
      pogo,
      hitstop,
      step,
      power,
      knockback,
    });
    if (e.hp > 0) {
      const n = frames(B.hurtFrames, 1);
      setMode(e, 'hurt', n);
      events.push({
        type: 'enemyHit',
        id: e.id,
        kind: e.kind,
        x: cx,
        y: cy,
        facing: e.facing,
        slash: dir,
        dir: side,
        power,
        hpLeft: e.hp,
        hpMax: e.hpMax,
        knockback: kb,
        hitstop,
        frames: n,
      });
      continue;
    }
    const n = frames(E.deadFrames, 1);
    setMode(e, 'dead', n);
    const value = frames(power >= 2 ? B.valueFinisher : B.value);
    const glintFrames = frames(E.releaseFrames, 1);
    const stagger = frames(value >= E.bigRelease ? E.releaseStaggerBig : E.releaseStagger, 1);
    e.spill = value;
    e.spillGap = stagger;
    // +1: updateEnemies still runs this step, so the first glint lands exactly `glintFrames` from now.
    e.spillTimer = value > 0 ? glintFrames + 1 : 0;
    events.push({
      type: 'enemyDie',
      id: e.id,
      kind: e.kind,
      x: cx,
      y: cy,
      facing: e.facing,
      slash: dir,
      dir: side,
      power,
      hpMax: e.hpMax,
      knockback: kb,
      hitstop,
      frames: n,
      value,
      glintFrames,
      stagger,
    });
  }
  return hits;
}

/** How many enemies are still alive. */
export function enemiesAlive(state: GameState): number {
  let n = 0;
  for (const e of state.enemies) if (e.mode !== 'dead') n++;
  return n;
}
