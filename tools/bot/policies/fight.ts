/**
 * The two Pit policies (combat-spec §6.4): `jabOnly` never seizes or levies; `signature` prefers
 * the Catch / Return to sender / Repossess loop. Both are the same competent fighter otherwise:
 * a 12-step reaction delay (see common.ts), they dodge a telegraphed attack by jumping it and read
 * each telegraph correctly 95% of the time (seeded, decided once per attack instance).
 */
import type { Enemy } from '../../../src/sim/state';
import {
  alive as aliveSeen,
  B,
  type Ctx,
  dirTo,
  gap,
  lr,
  type Policy,
  predict,
  press,
  threatEta,
} from './common';

/** Enemies as the policy believes they are now: the delayed snapshot, extrapolated. */
function alive(s: Ctx['seen'], c?: Ctx): Enemy[] {
  const list = aliveSeen(s);
  return c ? list.map((e) => predict(c, e)) : list;
}

const JAB_GAP = 52; // jab reaches 68 px past Kid's front; hurtboxes are inset 4-8 px
const SEIZE_GAP = 44; // seize reaches 52 px past Kid's front
const KEEP_GAP = 14; // closer than this and bodies touch (contact damage)
const DODGE_ETA = 18; // jump when an attack is this many frames from reaching Kid

function isDowned(e: Enemy): boolean {
  return e.state === 'DOWN' || e.state === 'COUNT';
}

/** Decides once per attack instance whether this read goes right (95%). */
function readsRight(c: Ctx, e: Enemy, what: string): boolean {
  const start = c.seen.frame - e.stateFrame;
  const key = `${what}:${e.id}:${e.state === 'ACTIVE' ? start - 1000 : start}`;
  if (!(key in c.mem)) c.mem[key] = c.rand() < 0.95 ? 1 : 0;
  return c.mem[key] === 1;
}

/**
 * Jump attacks that are about to reach Kid, drifting back toward where the attacker came from
 * (so she doesn't land on it). Holds the jump for full height until the dodge is over.
 */
function dodge(c: Ctx): number | null {
  const p = c.now.player;
  if ((c.mem.dodgeUntil ?? 0) > c.frame) {
    if (p.grounded && c.frame > (c.mem.dodgeFrom ?? 0) + 2) c.mem.dodgeUntil = 0;
    else {
      // A second attack arriving while airborne: Slip through it (i-frames on dash frames 1-10).
      for (const e of aliveSeen(c.seen)) {
        const eta = threatEta(c, e);
        if (eta !== null && eta <= 3 && p.abilities.dash && p.airDash > 0 && p.dashCd === 0)
          return B.jump | lr(-e.facing) | press(c, B.dash);
      }
      return B.jump | steerClear(c);
    }
  }
  for (const e of aliveSeen(c.seen)) {
    const eta = threatEta(c, e);
    if (eta === null || eta > DODGE_ETA || !p.grounded) continue;
    if (!readsRight(c, e, 'dodge')) continue;
    // Too late to jump clear of a tall charger: Slip through it instead.
    if (eta <= 4 && e.h > 64 && p.abilities.dash && p.dashCd === 0) return lr(-e.facing) | press(c, B.dash);
    c.mem.dodgeUntil = c.frame + 60;
    c.mem.dodgeFrom = c.frame;
    return press(c, B.jump);
  }
  return null;
}

const HARMLESS = new Set(['DOWN', 'COUNT', 'STAGGER', 'ABSORB', 'RISE']);

const WALL_L = 64;
const WALL_R = 27 * 64;

/**
 * Horizontal input that keeps Kid's body off enemy bodies (contact damage): away from the nearest
 * dangerous body, but never into a wall (then past it, toward the open side).
 */
function steerClear(c: Ctx, margin = KEEP_GAP + 12): number {
  let near: Enemy | undefined;
  let nearG = margin;
  for (const e of alive(c.seen, c)) {
    if (HARMLESS.has(e.state)) continue;
    const g = gap(c.now, e);
    if (g < nearG) {
      near = e;
      nearG = g;
    }
  }
  if (!near) return 0;
  const away = -dirTo(c.now, near);
  const p = c.now.player;
  const room = away > 0 ? WALL_R - (p.x + p.w) : p.x - WALL_L;
  return lr(room < 96 ? -away : away);
}

/**
 * Pinned against a body (or cornered between bodies and a wall): Slip out through the open side
 * (dash i-frames), or jump out if the Slip is on cooldown.
 */
function unpin(c: Ctx): number | null {
  const p = c.now.player;
  if (p.iframes > 20) return null;
  for (const e of alive(c.seen, c)) {
    // Attacks are the dodge's job; this is for bodies Kid is stuck against.
    if (HARMLESS.has(e.state) || e.state === 'TELEGRAPH' || e.state === 'ACTIVE' || gap(c.now, e) > -4)
      continue;
    const roomR = WALL_R - (p.x + p.w);
    const roomL = p.x - WALL_L;
    const dir = roomR > roomL ? 1 : -1;
    if (p.abilities.dash && p.dashCd === 0) return lr(dir) | press(c, B.dash);
    return lr(dir) | (p.grounded ? press(c, B.jump) : B.jump);
  }
  return null;
}

/** Walk to a comfortable striking distance of `e` and face it. */
function approach(c: Ctx, e: Enemy, want: number): number {
  const drop = dropToward(c, e);
  if (drop !== null) return drop;
  const clear = steerClear(c, KEEP_GAP);
  if (clear !== 0) return clear;
  const g = gap(c.now, e);
  const d = dirTo(c.now, e);
  if (g > want) return lr(d);
  if (g < KEEP_GAP) return lr(-d);
  return 0;
}

function nearest(c: Ctx, pred: (e: Enemy) => boolean): Enemy | undefined {
  let best: Enemy | undefined;
  let bestG = Infinity;
  for (const e of alive(c.seen, c)) {
    if (!pred(e)) continue;
    const g = gap(c.now, e);
    if (g < bestG) {
      best = e;
      bestG = g;
    }
  }
  return best;
}

/** On a one-way platform above the target: drop through (Down+Jump). */
function dropToward(c: Ctx, e: Enemy): number | null {
  const p = c.now.player;
  if (!p.grounded || p.y + p.h >= e.y + e.h - 8) return null;
  return B.down | press(c, B.jump);
}

function jabAt(c: Ctx, e: Enemy): number {
  const drop = dropToward(c, e);
  if (drop !== null) return drop;
  // Other bodies first: never stand in contact with anything.
  const clear = steerClear(c, KEEP_GAP);
  if (clear !== 0) return clear;
  const move = approach(c, e, JAB_GAP - 12);
  const p = c.now.player;
  if (p.grounded && gap(c.now, e) <= JAB_GAP && !p.move) return lr(dirTo(c.now, e)) | press(c, B.attack);
  return move;
}

function afterClear(c: Ctx): number | null {
  if (!c.seen.local.clear) return null;
  return B.right | (c.now.player.grounded && c.frame % 40 === 0 ? press(c, B.jump) : 0);
}

export const jabOnly: Policy = (c) => {
  const done = afterClear(c);
  if (done !== null) return done;
  const esc = unpin(c);
  if (esc !== null) return esc;
  const d = dodge(c);
  if (d !== null) return d;
  const target = nearest(c, (e) => !isDowned(e));
  if (!target) {
    // Everything left is down for the Count (punches are fouls): keep clear and wait.
    const any = nearest(c, () => true);
    return any && gap(c.now, any) < 120 ? lr(-dirTo(c.now, any)) : 0;
  }
  return jabAt(c, target);
};

/** Point-blank forward levy: both on the floor, target right in front (the throw spawns overlapping it). */
function canThrowAt(c: Ctx, e: Enemy): boolean {
  const p = c.now.player;
  return p.grounded && e.grounded && gap(c.now, e) <= 56 && gap(c.now, e) >= 0;
}

/** A voice in the bag whose owner is still fighting: throw it back (Return to sender). */
function returnTarget(c: Ctx): Enemy | undefined {
  const L = c.now.local;
  const newest = L.sounds.find((s) => s.id === L.bag[L.bag.length - 1]);
  if (!newest) return undefined;
  for (const e of alive(c.seen, c)) if (e.source === newest.owner && !isDowned(e)) return e;
  return undefined;
}

export const signature: Policy = (c) => {
  const done = afterClear(c);
  if (done !== null) return done;
  const p = c.now.player;
  const busy = p.move !== null;
  const esc = unpin(c);
  if (esc !== null) return esc;
  // 1. Repossess anything down for the Count.
  const down = nearest(c, isDowned);
  if (down) {
    const d = dodge(c);
    if (d !== null) return d;
    if (gap(c.now, down) <= SEIZE_GAP && Math.abs(down.kb) < 2 && !busy)
      return lr(dirTo(c.now, down)) | press(c, B.seize);
    return approach(c, down, SEIZE_GAP - 12);
  }
  // 2. Catch a telegraph in reach (steal the attack).
  for (const e of alive(c.seen, c)) {
    if (e.state !== 'TELEGRAPH') continue;
    const age = c.now.frame - c.seen.frame;
    const left = e.timer - e.stateFrame - age;
    if (left >= 6 && gap(c.now, e) <= SEIZE_GAP + 30 && !busy && readsRight(c, e, 'catch'))
      return lr(dirTo(c.now, e)) | press(c, B.seize);
  }
  const d = dodge(c);
  if (d !== null) return d;
  // 3. Return to sender: throw the newest voice back at its owner.
  const back = returnTarget(c);
  if (back) {
    if (canThrowAt(c, back) && !busy) return lr(dirTo(c.now, back)) | press(c, B.levy);
    return approach(c, back, 40);
  }
  // 4. Anything else in the bag is ammunition: levy it at the nearest enemy.
  const target = nearest(c, () => true);
  if (!target) return 0;
  if (c.now.local.bag.length > 0) {
    if (canThrowAt(c, target) && !busy) return lr(dirTo(c.now, target)) | press(c, B.levy);
    return approach(c, target, 40);
  }
  // 5. Seize an open enemy (recovering, staggered, launched or rattled by a jab).
  const src = c.seen.local.sources.find((s) => s.id === target.source);
  const armed = src ? !src.ghost : false;
  const open =
    target.state === 'RECOVERY' ||
    target.state === 'STAGGER' ||
    target.state === 'LAUNCHED' ||
    target.rattled > 12;
  if (armed && open && target.grounded) {
    if (gap(c.now, target) <= SEIZE_GAP && !busy) return lr(dirTo(c.now, target)) | press(c, B.seize);
    return approach(c, target, SEIZE_GAP - 12);
  }
  // 6. Otherwise jab to open it up.
  return jabAt(c, target);
};

export const POLICIES: Record<string, Policy> = { signature, jabOnly };
