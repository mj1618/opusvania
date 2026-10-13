import type { Scene } from '../scene';

/**
 * Integer AABB physics after Thorson's Actor/Solid model: positions are integers, fractional
 * movement accumulates in a remainder, and movement is resolved one pixel at a time. Only + - * /
 * and comparisons here, so results are identical on every JS engine.
 */
export interface Body {
  x: number;
  y: number;
  /** Sub-pixel remainders, always in [-0.5, 0.5]. */
  rx: number;
  ry: number;
  w: number;
  h: number;
}

/**
 * Round half away from zero. Symmetric under negation, which Math.round is not (-2.5 -> -2),
 * so left/right mirrored inputs give exactly mirrored trajectories.
 */
export function roundHalfAway(r: number): number {
  return r < 0 ? -Math.floor(-r + 0.5) : Math.floor(r + 0.5);
}

/**
 * True if a w×h box at integer (x, y) overlaps a solid rect or leaves the scene through its left,
 * right or bottom edge (the top is open). Hot path: no closures, no allocation.
 */
export function solidAt(scene: Scene, x: number, y: number, w: number, h: number): boolean {
  if (x < 0 || x + w > scene.width || y + h > scene.height) return true;
  const solids = scene.solids;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (s !== undefined && x < s.x + s.w && s.x < x + w && y < s.y + s.h && s.y < y + h) return true;
  }
  return false;
}

/** One-way rule: true if the box's bottom edge (y + h) is exactly on a one-way it overlaps in x. */
export function oneWayUnder(scene: Scene, x: number, y: number, w: number, h: number): boolean {
  const bottom = y + h;
  const ows = scene.oneWays;
  for (let i = 0; i < ows.length; i++) {
    const o = ows[i];
    if (o !== undefined && o.y === bottom && x < o.x + o.w && o.x < x + w) return true;
  }
  return false;
}

/** What an Actor collides with. The player's collider knows about one-ways and drop-through. */
export interface Collider {
  /** Would moving the body 1 px along the axis in `dir` be blocked? */
  blockedX(b: Body, dir: number): boolean;
  blockedY(b: Body, dir: number): boolean;
  /**
   * Called when a 1 px step is blocked. May shift the body perpendicular to the move (a corner
   * correction) and return true, after which the step is retried; false stops the move.
   */
  onBlockX?(b: Body, dir: number): boolean;
  onBlockY?(b: Body, dir: number): boolean;
}

/** Moves up to `amount` px along x. Returns true if a solid stopped it. */
export function moveX(b: Body, amount: number, col: Collider): boolean {
  b.rx += amount;
  let n = roundHalfAway(b.rx);
  if (n === 0) return false;
  b.rx -= n;
  const dir = n > 0 ? 1 : -1;
  while (n !== 0) {
    if (col.blockedX(b, dir)) {
      const fixed = col.onBlockX?.(b, dir) === true && !col.blockedX(b, dir);
      if (!fixed) {
        b.rx = 0;
        return true;
      }
    }
    b.x += dir;
    n -= dir;
  }
  return false;
}

/** Moves up to `amount` px along y. Returns true if a solid (or a one-way, falling) stopped it. */
export function moveY(b: Body, amount: number, col: Collider): boolean {
  b.ry += amount;
  let n = roundHalfAway(b.ry);
  if (n === 0) return false;
  b.ry -= n;
  const dir = n > 0 ? 1 : -1;
  while (n !== 0) {
    if (col.blockedY(b, dir)) {
      const fixed = col.onBlockY?.(b, dir) === true && !col.blockedY(b, dir);
      if (!fixed) {
        b.ry = 0;
        return true;
      }
    }
    b.y += dir;
    n -= dir;
  }
  return false;
}
