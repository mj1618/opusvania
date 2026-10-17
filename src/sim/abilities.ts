/**
 * Abilities she can own (docs/design/core.md §4). The starting kit (run, variable jump, fast fall,
 * the blade, pogo) is always on and not listed here. Owned abilities live in `GameState.save`;
 * `resolveParams` turns off the moves of the ones she does not own, so the controller code never
 * asks. A new ability is one id here plus its move and its gate in `resolveParams`.
 */
export const ABILITIES = ['glide', 'wallJump', 'doubleJump', 'dash'] as const;
export type AbilityId = (typeof ABILITIES)[number];

export function isAbility(id: string): id is AbilityId {
  return (ABILITIES as readonly string[]).includes(id);
}

/** Canonical form: known ids only, no repeats, in `ABILITIES` order (so the state hash is stable). */
export function normalizeAbilities(ids: readonly string[]): AbilityId[] {
  return ABILITIES.filter((a) => ids.includes(a));
}
