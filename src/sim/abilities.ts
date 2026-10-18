/**
 * Abilities she can own (docs/design/core.md §4). The starting kit (run, variable jump, fast fall,
 * the blade, pogo) is always on and not listed here. Owned abilities live in `GameState.save`;
 * `resolveParams` turns off the moves of the ones she does not own, so the controller code never
 * asks. A new ability is one id here plus its move and its gate in `resolveParams`.
 */
/**
 * `kindle` and `gust` are Lanternroot's (docs/design/levels/proto-1.md §3): the Lamp button gives her light to a
 * cold moonwick, and a tap of it is a wingbeat that snuffs at range. They act only in glow rooms (`scene.glow`).
 */
export const ABILITIES = ['glide', 'wallJump', 'doubleJump', 'dash', 'kindle', 'gust'] as const;
export type AbilityId = (typeof ABILITIES)[number];

export function isAbility(id: string): id is AbilityId {
  return (ABILITIES as readonly string[]).includes(id);
}

/** Canonical form: known ids only, no repeats, in `ABILITIES` order (so the state hash is stable). */
export function normalizeAbilities(ids: readonly string[]): AbilityId[] {
  return ABILITIES.filter((a) => ids.includes(a));
}
