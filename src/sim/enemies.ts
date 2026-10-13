/**
 * Enemies (`scene.enemies`): a small framework and one module per kind (`enemies/burrback.ts`, a
 * ground beetle; `enemies/lampwing.ts`, a flyer). Rules: memory/enemies.md.
 *
 * Shared, here:
 *  - A slash takes its `power` from the creature's hit points, holds it for the hitstop, shoves it
 *    (the kind says how) and staggers it (`hurt`). For the first `hurtSafeFrames` of that its touch
 *    is harmless.
 *  - At 0 it dies (`dead`); the kind moves the body until it is `gone`. It spills glints into the
 *    one collectible counter like a pod does (`pickup` events with `enemy: true`).
 *  - A slash does not reach through solid ground: the line from her body centre to the part of the
 *    creature inside the hit area must be clear of solids (one-way branches do not block).
 *  - Contact: a living enemy whose box overlaps hers hurts her (`step` applies it).
 *
 * Per kind (`KindRules`): its box and numbers, how it moves and what it notices, how a blow shoves
 * it, what it does when it has touched her.
 *
 * Runs after the player each step: slashes are resolved by the player's update (`slashEnemies`)
 * against where the enemies stood, then they move, then contact is tested (`updateEnemies`).
 */
import { burrback } from './enemies/burrback';
import { frames, type KindRules, type StepInfo, saltOf, segmentBlocked, setMode } from './enemies/common';
import { lampwing } from './enemies/lampwing';
import type { SimEvent } from './events';
import type { Box } from './player/attack';
import type { EnemyKind, EnemySpawn, Scene } from './scene';
import type { AttackDir, EnemyState, GameState, PlayerState } from './state';
import type { Tuning } from './tuning';

const KINDS: Record<EnemyKind, KindRules> = { burrback, lampwing };
const KIND_LIST: EnemyKind[] = ['burrback', 'lampwing'];

/** The rules of a kind (its box, numbers and behaviour). */
export function enemyRules(kind: EnemyKind): KindRules {
  return KINDS[kind];
}

export function createEnemy(spawn: EnemySpawn, t: Tuning): EnemyState {
  const K = KINDS[spawn.kind];
  const w = frames(K.width(t), 2);
  const h = frames(K.height(t), 2);
  const hp = frames(K.hp(t), 1);
  const e: EnemyState = {
    id: spawn.id,
    kind: spawn.kind,
    x: 0,
    y: 0,
    w,
    h,
    rx: 0,
    ry: 0,
    vx: 0,
    vy: 0,
    facing: spawn.facing < 0 ? -1 : 1,
    hp,
    hpMax: hp,
    mode: 'walk',
    modeFrames: 0,
    timer: 0,
    homeX: 0,
    homeY: 0,
    turning: false,
    stride: 0,
    knockVx: 0,
    knockVy: 0,
    hitstop: 0,
    hitBy: 0,
    hitDir: 0,
    hitPower: 0,
    hitFrame: -1,
    teeter: 0,
    gone: false,
    targetX: 0,
    targetY: 0,
    lookX: 0,
    lookY: 0,
    flap: 0,
    landed: false,
    alertCd: 0,
    walkLeft: 0,
    rests: 0,
    salt: saltOf(spawn.id),
    radius: 0,
    chase: 0,
    lost: 0,
    wander: 0,
    wanderLeft: 0,
    side: 0,
    pushX: 0,
    pushY: 0,
    calm: 0,
    spill: 0,
    spillTimer: 0,
    spillGap: 0,
  };
  K.place(e, spawn, t);
  e.homeX = e.x + e.w / 2;
  e.homeY = e.y + e.h / 2;
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

// One reused record per step (no allocation in the step path).
const INFO: StepInfo = {
  state: undefined as unknown as GameState,
  scene: undefined as unknown as Scene,
  t: undefined as unknown as Tuning,
  events: [],
  stir: '',
};

function info(state: GameState, scene: Scene, t: Tuning, events: SimEvent[]): StepInfo {
  INFO.state = state;
  INFO.scene = scene;
  INFO.t = t;
  INFO.events = events;
  INFO.stir = '';
  return INFO;
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
  const p = state.player;
  const I = info(state, scene, t, events);
  for (let i = first; i < events.length; i++) {
    const ev = events[i];
    if (ev?.type === 'slash') I.stir = 'slash';
    else if (ev?.type === 'land' && I.stir === '') I.stir = 'land';
  }
  for (let k = 0; k < KIND_LIST.length; k++) {
    const kind = KIND_LIST[k] as EnemyKind;
    const prepare = KINDS[kind].prepare;
    if (prepare === undefined) continue;
    for (let i = 0; i < list.length; i++) {
      if (list[i]?.kind === kind) {
        prepare(I);
        break;
      }
    }
  }
  let touch = -1;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e) continue;
    spill(e, state, t.pickups.comboFrames, events);
    if (e.gone) continue;
    if (e.calm > 0) e.calm--;
    if (e.hitstop > 0) {
      e.hitstop--;
      e.vx = 0;
      e.vy = 0;
      continue;
    }
    e.modeFrames++;
    const K = KINDS[e.kind];
    if (!K.update(e, i, I)) continue;
    // Contact: its touch hurts, except for the first beat after it was hit, while it is calmed,
    // and inside a lit lantern's sanctuary.
    if (
      touch < 0 &&
      e.calm === 0 &&
      !(e.mode === 'hurt' && e.modeFrames < frames(K.hurtSafeFrames(t))) &&
      !K.harmless?.(e, I)
    ) {
      if (p.x < e.x + e.w && e.x < p.x + p.w && p.y < e.y + e.h && e.y < p.y + p.h) touch = i;
    }
  }
  return touch;
}

/**
 * How far safe ground must be from this enemy's home: `px` (the shared distance), or more if its
 * kind asks for it (a lampwing: beyond its territory and its sight).
 */
export function homeClear(e: EnemyState, px: number, t: Tuning): number {
  const own = KINDS[e.kind].homeClear;
  return own === undefined ? px : Math.max(px, own(e, t));
}

/** What the touch of enemy `i` costs her. */
export function contactDamage(state: GameState, i: number, t: Tuning): number {
  const e = state.enemies[i];
  return e ? KINDS[e.kind].contactDamage(t) : 0;
}

/** Enemy `i` touched her and she was hurt (thrown toward `dir`): its own reaction, if its kind has one. */
export function enemyTouched(
  state: GameState,
  scene: Scene,
  i: number,
  dir: number,
  t: Tuning,
  events: SimEvent[],
): void {
  const e = state.enemies[i];
  if (!e) return;
  KINDS[e.kind].touched?.(e, info(state, scene, t, events), dir);
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
    const K = KINDS[e.kind];
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    // The side the blow sends it to: along a forward cut; for an up / down cut, away from her.
    const side = dir === 'fwd' ? (facing < 0 ? -1 : 1) : cx < px ? -1 : cx > px ? 1 : facing < 0 ? -1 : 1;
    const kb = K.shove(e, dir, side, knockback, t);
    e.hitBy = seq;
    e.hitDir = side;
    e.hitPower = power;
    e.hitFrame = state.frame;
    e.hp = Math.max(0, e.hp - Math.max(1, Math.round(power)));
    // +1: updateEnemies still runs this step, so it is held exactly as long as she is.
    e.hitstop = hitstop > 0 ? hitstop + 1 : 0;
    e.vx = 0;
    e.vy = 0;
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
      const n = frames(K.hurtFrames(t), 1);
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
    const n = frames(K.deadFrames(t), 1);
    setMode(e, 'dead', n);
    const value = frames(K.value(t, power >= 2));
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

/**
 * Settles every living enemy within `px` of the point (centre of its box, or its home; `px` < 0 =
 * every one in the scene) for `n` frames, each by its kind's own quiet path (`KindRules.calm`).
 * While it lasts their touch does nothing (`calm`). One that is staggered or held by a hit keeps
 * its tumble (but is calmed too).
 */
export function calmEnemies(
  state: GameState,
  scene: Scene,
  t: Tuning,
  events: SimEvent[],
  x: number,
  y: number,
  px: number,
  n: number,
): void {
  const list = state.enemies;
  if (list.length === 0 || n <= 0) return;
  const I = info(state, scene, t, events);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || e.gone || e.mode === 'dead') continue;
    if (px >= 0) {
      const dx = e.x + e.w / 2 - x;
      const dy = e.y + e.h / 2 - y;
      const hx = e.homeX - x;
      const hy = e.homeY - y;
      if (dx * dx + dy * dy > px * px && hx * hx + hy * hy > px * px) continue;
    }
    // Calmed, its touch does nothing; one that is staggered or held keeps its tumble.
    e.calm = Math.max(e.calm, n);
    if (e.mode === 'hurt' || e.hitstop > 0) continue;
    KINDS[e.kind].calm?.(e, I, n);
  }
}

/** How many enemies are still alive. */
export function enemiesAlive(state: GameState): number {
  let n = 0;
  for (const e of state.enemies) if (e.mode !== 'dead') n++;
  return n;
}
