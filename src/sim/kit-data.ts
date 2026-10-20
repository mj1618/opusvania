/**
 * The level kit's scene data (memory/level-kit.md): generic pieces any room can use. Types only; the
 * JSON is validated by src/scene/kit.ts and played by src/sim/kit.ts (thorns, seed-cases, rotten bark,
 * flag gates, triggers) and src/sim/paths.ts (a swinging lantern's path). Every piece has an `id`,
 * unique in its room (ids are forever: `room:id` in the save).
 */

/** A rect of thorns (a hazard, not a solid): touching it costs `kit.thorns.damage` and puts her back on her last safe ground. A down cut on it is a pogo. */
export interface Thorns {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A hard seed-case: a static, never-breaking slash target at its centre (`x`, `y`), not a solid. A down cut bounces her (the pogo); a forward or up cut clangs. */
export interface SeedCase {
  id: string;
  x: number;
  y: number;
}

/**
 * Rotten bark: a solid that breaks for good after `hp` cuts (default `kit.bark.hp`); the save keeps
 * `room:id` in `opened`. `floor`: a floor panel, broken only by down cuts (pogos). `kick` as on a solid.
 */
export interface Bark {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor?: boolean;
  hp?: number;
  kick?: boolean | 'east' | 'west';
  /**
   * Heartwood (Lanternroot puzzle 4): not rotten, so the blade clangs off it (`kitClang` kind `heartwood`);
   * only a burrback's ram into its face breaks it (`barkBreak {by: 'ram'}`).
   */
  heartwood?: boolean;
}

/** A gate: a solid while the save has not got `flag` in `flags` (the silk curtain that falls with the boss). */
export interface FlagGate {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  flag: string;
  kick?: boolean | 'east' | 'west';
}

/** A trigger: her box centre inside sets `sets` in the save's flags, once (a story beat, a lever, a lab plate). */
export interface FlagTrigger {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sets: string;
  /**
   * A held story beat (journey.md: input held <= 3 s): the step it sets its flag (once a save), no input
   * reaches her for `hold` frames (at most `kit.storyHoldMax`): she slows to a stand while the staging plays.
   * `storyHold` / `storyHoldEnd`; she cannot be hurt meanwhile.
   */
  hold?: number;
  /** The one beat that may hold longer (`kit.finaleHoldMax`): the finale's cloud, ~9 s (area 1 plan r3). */
  finale?: boolean;
  /** A flag set when the hold ends (the finale's east gate opens on the cloud's lift). */
  endSets?: string;
}

/**
 * A pendulum path (src/sim/paths.ts): the thing hangs `length` px under a pivot over its rest point
 * and swings `reach` px to each side, one full swing (there and back) every `period` frames, starting
 * `phase` (0..1) of the way into it. Missing numbers come from `tuning.lures.swing`.
 */
export interface Swing {
  length: number;
  reach?: number;
  period?: number;
  phase?: number;
}

/**
 * A bounce cap: a mushroom cap, a solid whose top throws her up when she lands on it (or pogos off
 * it). `tier` names a row of `kit.caps.tiers` (the height she is thrown, px); `height` overrides it.
 */
export interface BounceCap {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tier?: 'small' | 'mid' | 'big';
  height?: number;
  kick?: boolean | 'east' | 'west';
}

/**
 * The area's moth-stone (core.md §6): `x`, `y` = its foot on the ground. Touching it draws `area` (an
 * id of `world.json` `areas`) on the map, unvisited rooms faint, with its count of unseen lamps.
 */
export interface MothStone {
  id: string;
  x: number;
  y: number;
  area: string;
}

/**
 * A firefly sign (lore): `x`, `y` = its foot. Standing still beside it reads it once: the save keeps
 * `room:id` in `taken` and sets `flag` if given; `rhythm` is its flash pattern for render (`.` short,
 * `-` long).
 */
export interface FireflySign {
  id: string;
  x: number;
  y: number;
  flag?: string;
  rhythm?: string;
}

/**
 * A moonlit hollow: a hidden rect of moonlight; her body centre inside grants `upgrade` once (an id of
 * `UPGRADES`, src/sim/upgrades.ts: the save gets the flag `upgrade:<id>`).
 */
export interface Hollow {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  upgrade: string;
}

/**
 * A moonseed (the Downwood, memory/downwood.md): a key. `x`, `y` = its centre in the air. Her box touching it takes
 * it once ever (`taken` keeps `room:id`); the save then has the flags `seeds:1` .. `seeds:<n>` for the n she holds,
 * so a door that wants three is a gate on `seeds:3`.
 */
export interface Moonseed {
  id: string;
  x: number;
  y: number;
}
