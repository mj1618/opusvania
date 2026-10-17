/**
 * The hatching, as render sees it (memory/hatch-and-tatter.md): the character renderer writes this
 * every frame from the sim's `state.hatch` and the `hatch` event, before the skin and the cast update;
 * the skin reads it (hidden while she is inside, the birth after the break). Render only.
 */
export const hatchLink = {
  /** She is shut in her cocoon: the hero is not drawn and her light is out. */
  inside: false,
  /**
   * Seconds of render time since she broke out (0 while she is inside; large = there was no break to
   * see: a room without a cocoon, a teleport, a page loaded after it).
   */
  birthT: 9,
  /** The cocoon's hang point (world px), for the skin's emergence. */
  x: 0,
  y: 0,
};
