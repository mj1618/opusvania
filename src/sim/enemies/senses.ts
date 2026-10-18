/**
 * Senses by lamp light (docs/design/creatures.md §1.3, memory/creatures.md). One shared value, `lit`:
 * how much lure light she is in (0 = dark, up to 1 at a flame's core), from the burning lures' light
 * (`senses.litScale` x a lure's pull radius). A sight hunter in a lamp room sees her only while she is
 * lit; in the dark sleepers doze and roosters roost. It replaces the test grove's wallet-driven `seen`
 * (src/sim/seen.ts) for every creature whose `sense` is `lamp`; the grove keeps the old rule (`wallet`).
 *
 * Pure: + - * / sqrt, min, max.
 */
import { flameAt, lureRowNow } from '../lures';
import type { Scene, SenseMode } from '../scene';
import { seenNow } from '../seen';
import type { EnemyState, GameState } from '../state';
import type { Tuning } from '../tuning';
import type { StepInfo } from './common';

/** `EnemyState.sense` codes. */
export const SENSE_WALLET = 0;
export const SENSE_LAMP = 1;
export const SENSE_ALWAYS = 2;

export function senseCode(mode: SenseMode | undefined): number {
  return mode === 'lamp' ? SENSE_LAMP : mode === 'always' ? SENSE_ALWAYS : SENSE_WALLET;
}

const F = { x: 0, y: 0 };

/** How lit the point (x, y) is by the burning lures (0 .. 1). */
export function litAt(state: GameState, scene: Scene, t: Tuning, x: number, y: number): number {
  const list = scene.lures;
  if (!list) return 0;
  let best = 0;
  const S = t.senses;
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    // (Silver light is not a false light: a moonwick never shows her to a lamp-sighted creature.)
    if (!l || l.kind === 'moonwick' || (state.lures.hp[i] ?? 0) <= 0) continue;
    const K = lureRowNow(state.lures, i, l, t);
    const reach = K.radius * S.litScale;
    flameAt(state.lures, i, l, state.frame, t, F);
    const dx = x - F.x;
    const dy = y - F.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= reach * reach) continue;
    const k = Math.max(0, Math.min(1, (reach - Math.sqrt(d2)) / Math.max(1, reach - K.core)));
    if (k > best) best = k;
  }
  return best;
}

/**
 * How much silver light the point (x, y) is in (Lanternroot, 0 .. 1): from the burning moonwicks, each lighting
 * `moonwick.light` px. Above 0, a hawker or a dangler starts no strike there (src/sim/light.ts `shyAt`).
 */
export function moonlitAt(state: GameState, scene: Scene, t: Tuning, x: number, y: number): number {
  const list = scene.lures;
  if (!list) return 0;
  let best = 0;
  const reach = t.moonwick.light;
  for (let i = 0; i < list.length; i++) {
    const l = list[i];
    if (l?.kind !== 'moonwick' || (state.lures.hp[i] ?? 0) <= 0) continue;
    flameAt(state.lures, i, l, state.frame, t, F);
    const dx = x - F.x;
    const dy = y - F.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= reach * reach) continue;
    const k = (reach - Math.sqrt(d2)) / Math.max(1, reach);
    if (k > best) best = k;
  }
  return Math.min(1, best);
}

/**
 * Silver light makes flyers shy (Lanternroot §3): a hawker or a dangler about to START a strike at her (aimed at
 * `tx`, `ty`) holds off while she, or that point, is in a burning moonwick's light (a strike already under way
 * finishes). True = it holds; the first frame of a hold pushes `enemyShy`.
 */
export function shyOf(e: EnemyState, info: StepInfo, tx: number, ty: number): boolean {
  const { state, scene, t } = info;
  const p = state.player;
  if (p.moonlit <= 0 && moonlitAt(state, scene, t, tx, ty) <= 0) {
    e.shy = 0;
    return false;
  }
  if (e.shy === 0) {
    e.shy = 1;
    info.events.push({ type: 'enemyShy', id: e.id, kind: e.kind, x: e.x + e.w / 2, y: e.y + e.h / 2 });
  }
  return true;
}

/** Her `lit` now (her body centre), 0 while she is down or faded. */
export function litNow(state: GameState, scene: Scene, t: Tuning): number {
  const p = state.player;
  if (p.hp <= 0 || p.faded > 0) return 0;
  return litAt(state, scene, t, p.x + p.w / 2, p.y + p.h / 2);
}

/**
 * Her level of being seen by creature `e` this step, in the old wallet levels (0 = unseen; 2 = the
 * ranges every fight was tuned at): by the light she carries (`wallet`), by lamp light (`lamp`: her
 * `player.lit`, set by `updateEnemies` at the start of the step), or always (`always`).
 */
export function seenBy(e: EnemyState, info: StepInfo): number {
  if (e.sense === SENSE_WALLET) return seenNow(info.state, info.t);
  const p = info.state.player;
  if (p.hp <= 0 || p.faded > 0) return 0;
  if (e.sense === SENSE_ALWAYS) return Math.round(info.t.senses.litLevel);
  return p.lit > 0 ? Math.round(info.t.senses.litLevel) : 0;
}
