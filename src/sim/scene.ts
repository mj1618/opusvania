/**
 * The one scene's collision data, as the sim sees it: plain axis-aligned rects in sim px. This is
 * types only; the data lives in content/scene/grove.json and is validated by src/scene/index.ts.
 * The scene is static, so it is not part of GameState.
 */

/** Semantic tag for the environment artists (how to skin the rect); the sim ignores it. */
export type SceneTag = 'ground' | 'pool' | 'ledge' | 'trunk' | 'floating' | 'root' | 'branch';

/** A solid box: blocks from every side. */
export interface SolidRect {
  x: number;
  y: number;
  w: number;
  h: number;
  tag: SceneTag;
}

/** A one-way platform: a line at `y` that only blocks a body falling onto it. Down+Jump drops through. */
export interface OneWay {
  x: number;
  y: number;
  w: number;
  tag: SceneTag;
}

/** `glint`: a drop of light worth 1. `great`: a rare one cradled in a bud, worth more. */
export type PickupKind = 'glint' | 'great';

/** Something to gather: a point in sim px (the centre of the light). */
export interface Pickup {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
}

/**
 * A lumen pod: a seed-pod of light the slash can burst (src/sim/pods.ts). `x`, `y` is its centre.
 * `sit`: it rests on a surface just below it. `hang`: it hangs from an underside or a branch above.
 */
export type PodMount = 'sit' | 'hang';
export interface Pod {
  id: string;
  x: number;
  y: number;
  mount: PodMount;
  /** Toughness: hit points, 1 (default) to 3. A hit takes its `power` (1, or 2 for the finisher). */
  hp?: number;
}

/**
 * The kinds of enemy (src/sim/enemies.ts). `burrback`: a small armoured beetle that walks its
 * platform. `lampwing`: a small pale moth-wisp that hovers in the open air and drifts after her light.
 */
export type EnemyKind = 'burrback' | 'lampwing';

/**
 * Where an enemy starts. Burrback: `x`, `y` = its feet centre, on a surface; `facing` = the way it
 * sets off; `radius` = how far from its start (box centre) it walks, where its ground would let it
 * go further (default: the whole of its ground). Lampwing: `x`, `y` = its home, the centre of its box and of its territory, in open
 * air; `radius` = how far from home it wanders (default `tuning.lampwing.radius`); `facing` = the
 * way it looks at first (its wander path is mirrored with it).
 */
export interface EnemySpawn {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  facing: -1 | 1;
  radius?: number;
}

/**
 * A moth-lantern (src/sim/goal.ts): dormant until she kindles it with the light she carries.
 * `x`, `y` = its foot, on a surface (like the spawn: a feet-centre point); she kindles it standing
 * there. `cost` = the glints it takes (default `tuning.goal.cost`).
 */
export interface Lantern {
  id: string;
  x: number;
  y: number;
  cost?: number;
}

export interface Scene {
  id: string;
  /** Scene size in sim px. The edges and the bottom are solid; the top is open. */
  width: number;
  height: number;
  /** Where the player's feet (bottom-centre of the collision box) start. */
  spawn: { x: number; y: number };
  /**
   * The canopy: a soft ceiling for the player (the top of her box cannot rise above this y; she
   * eases to a stop under it: `tuning.ceiling`). Absent = the top is open all the way.
   */
  ceilingY?: number;
  solids: SolidRect[];
  oneWays: OneWay[];
  /** Collectibles, in a fixed order: `GameState.pickups.timers` is indexed like this array. */
  pickups?: Pickup[];
  /** Breakables, in a fixed order: the arrays of `GameState.pods` are indexed like this one. */
  pods?: Pod[];
  /** Enemies, in a fixed order: `GameState.enemies` is indexed like this array. */
  enemies?: EnemySpawn[];
  /** Moth-lanterns, in a fixed order: `GameState.goal.lanterns` is indexed like this array. */
  lanterns?: Lantern[];
  /**
   * The heart of the grove: a point on the ground (feet centre). It wakes when every lantern is
   * lit; walking into it then ends the run (src/sim/goal.ts).
   */
  heart?: { x: number; y: number };
}
