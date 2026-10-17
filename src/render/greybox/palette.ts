/**
 * The greybox palette (memory/greybox.md). Few values, picked for reading play, not for mood: a dark
 * blue-grey room light enough that Wing's dark body still separates from it, solids a step lighter
 * with a bright walkable top, warm only for lures (the one thing that is light in the story).
 */
export const GB = {
  /** Background: top and bottom of the view's vertical gradient. */
  skyTop: 0x2e3542,
  skyBottom: 0x1c2029,
  /** The world grid (every `gridPx`), barely there: it lets speed read on a flat background. */
  grid: 0x8a96ad,
  gridAlpha: 0.06,
  gridPx: 256,
  /** Solids: fill, the walkable top edge (`topPx` thick), faces that take no kick. */
  solid: 0x434b5a,
  solidTop: 0xc6d1e6,
  topPx: 4,
  noKick: 0x2b303a,
  /** One-way branches. */
  oneWay: 0xaab5ca,
  /** Hazards (the `pool` tag) and catch zones (a fall that costs nothing). */
  hazard: 0xd8434b,
  catchZone: 0xd8434b,
  /** Exits, rest points (lanterns / lamps), the spawn, the heart. */
  exit: 0x5fd38a,
  rest: 0x5cc8e0,
  spawn: 0x8a96ad,
  heart: 0xa77fe0,
  /** Lures: the flame, its core ring, its pull field, a husk once it is out. */
  flame: 0xffc45a,
  flameHot: 0xfff0c0,
  core: 0xff9a3c,
  field: 0xffb347,
  husk: 0x6b7385,
  /** Freed moths. */
  moth: 0xe8ecf6,
  /** Labels and notes. */
  label: 0xc9d3e6,
  note: 0x9aa6bd,
} as const;
