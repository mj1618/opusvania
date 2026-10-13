/**
 * What every kind of enemy shares: small integer helpers, the schedule hash (no RNG), geometry.
 * The framework is in `../enemies.ts`; one file per kind next to this one.
 */
import type { SimEvent } from '../events';
import type { Box } from '../player/attack';
import type { EnemySpawn, Scene } from '../scene';
import type { EnemyState, GameState } from '../state';
import type { Tuning } from '../tuning';

export const frames = (n: number, min = 0): number => Math.max(min, Math.round(n));

/** A stable 32-bit mix of two integers (Math.imul is exact on every engine). */
export function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

export function saltOf(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = mix(h, id.charCodeAt(i));
  return h;
}

export function setMode(e: EnemyState, mode: EnemyState['mode'], timer: number): void {
  e.mode = mode;
  e.modeFrames = 0;
  e.timer = timer;
  e.turning = false;
  e.braced = mode === 'windup' || mode === 'charge';
}

/** Squared gap between two boxes (0 when they touch or overlap). */
export function gap2(a: Box, b: Box): number {
  const dx = a.x + a.w < b.x ? b.x - (a.x + a.w) : b.x + b.w < a.x ? a.x - (b.x + b.w) : 0;
  const dy = a.y + a.h < b.y ? b.y - (a.y + a.h) : b.y + b.h < a.y ? a.y - (b.y + b.h) : 0;
  return dx * dx + dy * dy;
}

/** Does the segment (x0, y0) -> (x1, y1) pass through the inside of a solid? (+ - * / only.) */
export function segmentBlocked(scene: Scene, x0: number, y0: number, x1: number, y1: number): boolean {
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

/** What `update` of a kind is told about this step. */
export interface StepInfo {
  state: GameState;
  scene: Scene;
  t: Tuning;
  events: SimEvent[];
  /** She landed or started a slash this step ('' = neither). */
  stir: 'land' | 'slash' | '';
}

/**
 * One kind of enemy. The framework (`../enemies.ts`) owns what they share: the hit (hit points,
 * hitstop, `hurt` / `dead`, events), the glint spill, contact and its exclusions. A kind supplies
 * its numbers and how it moves.
 */
export interface KindRules {
  /** Its box, hit points, stagger, how much of the stagger its touch is harmless, what a touch costs. */
  width(t: Tuning): number;
  height(t: Tuning): number;
  hp(t: Tuning): number;
  hurtFrames(t: Tuning): number;
  hurtSafeFrames(t: Tuning): number;
  contactDamage(t: Tuning): number;
  /** Frames the dead body stays, and the glints it spills (`finisher`: the finisher killed it). */
  deadFrames(t: Tuning): number;
  value(t: Tuning, finisher: boolean): number;
  /** Where the top-left of its box starts, from the scene's `x`, `y`, and the rest of its own state. */
  place(e: EnemyState, spawn: EnemySpawn, t: Tuning): void;
  /**
   * One step (not called while it is `gone` or held by a hitstop; `modeFrames` is already counted).
   * Returns false when its touch cannot hurt this step whatever the shared rules say (a dead body).
   */
  update(e: EnemyState, index: number, info: StepInfo): boolean;
  /**
   * A slash going `dir` hit it: sets its knockback (`knockVx`, `knockVy`) from the slash's
   * `knockback` and returns the size of the shove, px/f (for the events). `side` = the side the
   * blow sends it to (-1 / 1).
   */
  shove(e: EnemyState, dir: 'fwd' | 'up' | 'down', side: number, knockback: number, t: Tuning): number;
  /**
   * A slash going `dir` would hit it, from her body centre at `px`: true = it glances off (no
   * damage, no stagger; the framework fires `enemyBlock` and she is thrown back off it).
   */
  blocks?(e: EnemyState, dir: 'fwd' | 'up' | 'down', px: number, t: Tuning): boolean;
  /**
   * Safe ground (where she re-forms) keeps at least this far from its home, if that is more than
   * `health.safeEnemyPx`: far enough that it does not notice her the moment she is back.
   */
  homeClear?(e: EnemyState, t: Tuning): number;
  /** Once per step, before any enemy of the scene moves (only if the scene has one of this kind). */
  prepare?(info: StepInfo): void;
  /**
   * A lantern was kindled near it, or the run ended (src/sim/goal.ts): it settles for `frames`
   * through its own quiet path. Only called while it is alive and not held or staggered.
   */
  calm?(e: EnemyState, info: StepInfo, frames: number): void;
  /** Its touch can do nothing this step, whatever else holds (it is inside a lit lantern's sanctuary). */
  harmless?(e: EnemyState, info: StepInfo): boolean;
  /**
   * Her body met it and she was hurt (`dir` = the way she is thrown, -1 / 1). Also called, without
   * any hurt, when it meets her while she kindles a lantern: it is turned away.
   */
  touched?(e: EnemyState, info: StepInfo, dir: number): void;
}
