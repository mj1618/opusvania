import { type Room, Tile, tileAt } from '../world/rooms';

/**
 * Integer AABB physics after Thorson's Actor/Solid model (movement-spec §1.2): positions are
 * integers, fractional movement accumulates in a remainder, and movement is resolved one pixel at
 * a time. Only + - * / and comparisons here, so results are identical on every JS engine.
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

export interface Rect {
  x: number;
  y: number;
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

/** Calls fn for every tile a box overlaps; stops early if fn returns true. */
function anyTile(
  room: Room,
  ts: number,
  x: number,
  y: number,
  w: number,
  h: number,
  fn: (t: number, tx: number, ty: number) => boolean,
): boolean {
  const x0 = Math.floor(x / ts);
  const y0 = Math.floor(y / ts);
  const x1 = Math.floor((x + w - 1) / ts);
  const y1 = Math.floor((y + h - 1) / ts);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (fn(tileAt(room, tx, ty), tx, ty)) return true;
    }
  }
  return false;
}

/** True if a w×h box at integer (x, y) overlaps any solid tile. Hot path: no closures. */
export function solidAt(room: Room, ts: number, x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x / ts);
  const y0 = Math.floor(y / ts);
  const x1 = Math.floor((x + w - 1) / ts);
  const y1 = Math.floor((y + h - 1) / ts);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tileAt(room, tx, ty) === Tile.solid) return true;
    }
  }
  return false;
}

/** @deprecated Phase 0 name; use solidAt. */
export const collidesAt = solidAt;

/**
 * One-way rule (spec §1.3): true if the box's bottom edge (y + h) is exactly at the top of a
 * one-way tile it overlaps horizontally.
 */
export function oneWayUnder(room: Room, ts: number, x: number, y: number, w: number, h: number): boolean {
  const bottom = y + h;
  if (bottom % ts !== 0) return false;
  const ty = bottom / ts;
  const x0 = Math.floor(x / ts);
  const x1 = Math.floor((x + w - 1) / ts);
  for (let tx = x0; tx <= x1; tx++) if (tileAt(room, tx, ty) === Tile.oneWay) return true;
  return false;
}

export function overlaps(a: Rect, bx: number, by: number, bw: number, bh: number): boolean {
  return a.x < bx + bw && bx < a.x + a.w && a.y < by + bh && by < a.y + a.h;
}

export interface HazardDims {
  spikeDepthPx: number;
  spikeInsetPx: number;
  orbSize: number;
}

/** Hitbox of a spike tile: the base half, inset on both sides (spec §1.3). */
export function spikeRect(t: number, tx: number, ty: number, ts: number, d: HazardDims): Rect | null {
  const x = tx * ts;
  const y = ty * ts;
  const dp = d.spikeDepthPx;
  const ins = d.spikeInsetPx;
  switch (t) {
    case Tile.spikeUp:
      return { x: x + ins, y: y + ts - dp, w: ts - 2 * ins, h: dp };
    case Tile.spikeDown:
      return { x: x + ins, y, w: ts - 2 * ins, h: dp };
    case Tile.spikeLeft: // points left: attached to a wall on its right
      return { x: x + ts - dp, y: y + ins, w: dp, h: ts - 2 * ins };
    case Tile.spikeRight:
      return { x, y: y + ins, w: dp, h: ts - 2 * ins };
    default:
      return null;
  }
}

export function orbRect(tx: number, ty: number, ts: number, d: HazardDims): Rect {
  const o = (ts - d.orbSize) / 2;
  return { x: tx * ts + o, y: ty * ts + o, w: d.orbSize, h: d.orbSize };
}

/** True if the box overlaps a spike hitbox. Hot path (every pixel step): no allocation for non-spikes. */
export function hazardAt(room: Room, ts: number, b: Rect, d: HazardDims): boolean {
  const x0 = Math.floor(b.x / ts);
  const y0 = Math.floor(b.y / ts);
  const x1 = Math.floor((b.x + b.w - 1) / ts);
  const y1 = Math.floor((b.y + b.h - 1) / ts);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(room, tx, ty);
      if (t < Tile.spikeUp || t > Tile.spikeRight) continue;
      const r = spikeRect(t, tx, ty, ts, d);
      if (r !== null && overlaps(r, b.x, b.y, b.w, b.h)) return true;
    }
  }
  return false;
}

export type PogoTarget = 'orb' | 'spike';

/** First pogo-able thing (orb, then spike) the rect overlaps. */
export function pogoTargetAt(room: Room, ts: number, b: Rect, d: HazardDims): PogoTarget | null {
  let found: PogoTarget | null = null;
  anyTile(room, ts, b.x, b.y, b.w, b.h, (t, tx, ty) => {
    if (t === Tile.orb && overlaps(orbRect(tx, ty, ts, d), b.x, b.y, b.w, b.h)) {
      found = 'orb';
      return true;
    }
    const r = spikeRect(t, tx, ty, ts, d);
    if (r !== null && overlaps(r, b.x, b.y, b.w, b.h)) found = 'spike';
    return false;
  });
  return found;
}

/** What an Actor collides with. The player's collider knows about one-ways and drop-through. */
export interface Collider {
  /** Would moving the body 1 px along the axis in `dir` be blocked? */
  blockedX(b: Body, dir: number): boolean;
  blockedY(b: Body, dir: number): boolean;
  /** Does the body overlap a hazard where it is now? */
  hazard(b: Body): boolean;
  /**
   * Called when a 1 px step is blocked. May shift the body perpendicular to the move (a corner
   * correction) and return true, after which the step is retried; false stops the move.
   */
  onBlockX?(b: Body, dir: number): boolean;
  onBlockY?(b: Body, dir: number): boolean;
}

export const Move = { ok: 0, blocked: 1, killed: 2 } as const;
export type MoveResult = (typeof Move)[keyof typeof Move];

export function moveX(b: Body, amount: number, col: Collider): MoveResult {
  b.rx += amount;
  let n = roundHalfAway(b.rx);
  if (n === 0) return Move.ok;
  b.rx -= n;
  const dir = n > 0 ? 1 : -1;
  while (n !== 0) {
    if (col.blockedX(b, dir)) {
      const fixed = col.onBlockX?.(b, dir) === true && !col.blockedX(b, dir);
      if (fixed && col.hazard(b)) return Move.killed;
      if (!fixed) {
        b.rx = 0;
        return Move.blocked;
      }
    }
    b.x += dir;
    n -= dir;
    if (col.hazard(b)) return Move.killed;
  }
  return Move.ok;
}

export function moveY(b: Body, amount: number, col: Collider): MoveResult {
  b.ry += amount;
  let n = roundHalfAway(b.ry);
  if (n === 0) return Move.ok;
  b.ry -= n;
  const dir = n > 0 ? 1 : -1;
  while (n !== 0) {
    if (col.blockedY(b, dir)) {
      const fixed = col.onBlockY?.(b, dir) === true && !col.blockedY(b, dir);
      if (fixed && col.hazard(b)) return Move.killed;
      if (!fixed) {
        b.ry = 0;
        return Move.blocked;
      }
    }
    b.y += dir;
    n -= dir;
    if (col.hazard(b)) return Move.killed;
  }
  return Move.ok;
}

/**
 * Moving solids (Thorson's Solid.moveBy with carry and push) are deferred (spec §9). This is the
 * interface they will implement so actors can ask "am I riding this?".
 */
export interface Solid {
  box: Rect;
  remX: number;
  remY: number;
  moveBy(dx: number, dy: number): void;
}
