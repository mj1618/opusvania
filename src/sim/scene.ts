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
  /**
   * `false`: its faces give no wall slide and take no wall kick (she falls past them as past open
   * air, and is still stopped by them). `'east'` / `'west'`: only that face is a climb (a trunk
   * whose one flank is a shaft wall and whose other is clean bark). Default: every face is a climb.
   */
  kick?: boolean | 'east' | 'west';
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
  /**
   * Burrback with a `radius`: neither its ram nor a shove takes it out of that range (a guard on a
   * narrow perch: the fight stays where it stands, clear of the perch's ends).
   */
  fenced?: boolean;
  /** Its hit points, if not its kind's (`tuning.<kind>.hp`): the teaching one is weaker. */
  hp?: number;
  /** Lampwing: how far it notices her from (default `tuning.lampwing.noticePx`): one that watches a long lane. */
  sight?: number;
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
  /**
   * The id of a pickup (a great glint) it needs besides its price: until she has gathered that one
   * it will not catch, whatever she carries (it tells her: `lanternRefuse.key`).
   */
  key?: string;
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
  /**
   * `false`: the scene's left and right edges give no wall slide and take no wall kick (they lead
   * nowhere). Default: they are walls like any other.
   */
  edgeKick?: boolean;
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
   * Wayside lamps, in a fixed order (`GameState.goal.lamps`): lesser lanterns, optional. Same data
   * and rules as a lantern (`cost` defaults to `tuning.goal.lampCost`); not counted for the heart.
   */
  lamps?: Lantern[];
  /**
   * The heart of the grove: a point on the ground (feet centre). It wakes when every lantern is
   * lit; walking into it then ends the run (src/sim/goal.ts).
   */
  heart?: { x: number; y: number };
}
