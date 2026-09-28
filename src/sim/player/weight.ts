import type { SimEvent } from '../events';
import { bagBrownCount } from '../sound';
import type { GameState } from '../state';
import type { Tuning } from '../tuning';
import { setProfile } from './player';

export type WeightClass = 'feather' | 'middle' | 'heavy';

/** Weight class from the bag (critique A graft): 0 brown = feather, 1 = middle, 2+ = heavy. */
export function weightOf(state: GameState, t: Tuning): WeightClass {
  const n = bagBrownCount(state.local);
  return n >= t.weight.heavyAt ? 'heavy' : n >= t.weight.middleAt ? 'middle' : 'feather';
}

/**
 * Step 10: derives the class and switches the movement profile (emits profileChange); it applies
 * from the next step. Only where Kid carries the bag (the seize ability), so gym rooms and the
 * debug profile switch keep working.
 */
export function updateWeight(state: GameState, t: Tuning, events: SimEvent[]): void {
  if (!state.player.abilities.seize) return;
  setProfile(state.player, weightOf(state, t), events);
}
