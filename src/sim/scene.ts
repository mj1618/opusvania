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

export interface Scene {
  id: string;
  /** Scene size in sim px. The edges and the bottom are solid; the top is open. */
  width: number;
  height: number;
  /** Where the player's feet (bottom-centre of the collision box) start. */
  spawn: { x: number; y: number };
  solids: SolidRect[];
  oneWays: OneWay[];
}
