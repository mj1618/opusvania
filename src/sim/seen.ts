/**
 * Being seen (memory/giving.md): the creatures notice her by the light she carries. A level from
 * her wallet (`pickups.count`) in steps; each level scales how far a creature notices her from.
 * Types only besides the arithmetic, so every enemy module can read it.
 */
import type { GameState } from './state';
import type { Tuning } from './tuning';

/** Her level of being seen for a wallet of `count`: 0 (unseen) to 4. */
export function seenLevel(count: number, G: Tuning['giving']): number {
  return count >= G.seen4 ? 4 : count >= G.seen3 ? 3 : count >= G.seen2 ? 2 : count >= G.seen1 ? 1 : 0;
}

/** The share of a creature's own notice range at level `level` (0 at level 0: unseen). */
export function seenScale(level: number, G: Tuning['giving']): number {
  return level >= 4 ? G.scale4 : level === 3 ? G.scale3 : level === 2 ? G.scale2 : level === 1 ? G.scale1 : 0;
}

/** Her level now (from the wallet as it stands), 0 while she is down or faded. */
export function seenNow(state: GameState, t: Tuning): number {
  const p = state.player;
  if (p.hp <= 0 || p.faded > 0) return 0;
  return seenLevel(state.pickups.count, t.giving);
}

/** Stores her level for render (`player.seen`, `player.seenLevel`). End of every step. */
export function markSeen(state: GameState, t: Tuning): void {
  const p = state.player;
  p.seenLevel = seenNow(state, t);
  p.seen = p.seenLevel / 4;
}
