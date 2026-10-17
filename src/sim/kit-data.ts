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
