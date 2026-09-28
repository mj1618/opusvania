import { isSolidTile, type Room } from '../world/rooms';

/**
 * Integer AABB vs tile collision, Celeste "Actor" style: positions are integers, fractional
 * movement accumulates in a remainder, and movement is resolved one pixel at a time.
 * Placeholder for Phase 0; Phase 1 grows this into Actor/Solid with one-ways etc.
 */
export interface Body {
  x: number;
  y: number;
  /** Sub-pixel remainders, always in (-0.5, 0.5]. */
  rx: number;
  ry: number;
  w: number;
  h: number;
}

/** True if a w×h box at integer (x, y) overlaps any solid tile. */
export function collidesAt(
  room: Room,
  tileSize: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const x0 = Math.floor(x / tileSize);
  const y0 = Math.floor(y / tileSize);
  const x1 = Math.floor((x + w - 1) / tileSize);
  const y1 = Math.floor((y + h - 1) / tileSize);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (isSolidTile(room, tx, ty)) return true;
    }
  }
  return false;
}

/** Moves along x by `amount` px (may be fractional). Returns true if blocked by a solid. */
export function moveX(body: Body, amount: number, room: Room, tileSize: number): boolean {
  body.rx += amount;
  let move = Math.round(body.rx);
  if (move === 0) return false;
  body.rx -= move;
  const sign = Math.sign(move);
  while (move !== 0) {
    if (collidesAt(room, tileSize, body.x + sign, body.y, body.w, body.h)) {
      body.rx = 0;
      return true;
    }
    body.x += sign;
    move -= sign;
  }
  return false;
}

/** Moves along y by `amount` px (may be fractional). Returns true if blocked by a solid. */
export function moveY(body: Body, amount: number, room: Room, tileSize: number): boolean {
  body.ry += amount;
  let move = Math.round(body.ry);
  if (move === 0) return false;
  body.ry -= move;
  const sign = Math.sign(move);
  while (move !== 0) {
    if (collidesAt(room, tileSize, body.x, body.y + sign, body.w, body.h)) {
      body.ry = 0;
      return true;
    }
    body.y += sign;
    move -= sign;
  }
  return false;
}
