import { defaultTuning } from '../tuning';
import { isSlopeTile, SLOPE_FIRST, SLOPE_SHAPES, Tile } from '../world/room-schema';
import { type Room, tileAt } from '../world/rooms';

/**
 * Floor slopes (north star §3.2, level-toolchain §3.3): integer heightfield tiles at 1:4, 1:2
 * and 1:1. Only an actor's FEET collide with them, sampled at its two middle columns
 * (`x + (w-1)>>1` and `x + w>>1`; the higher surface wins), so a left/right mirrored run is exactly
 * mirrored (the L tables are the reversed R tables). Boxes (walls, heads, side probes) never see a
 * slope. The solid tile at a slope's high end is a "shin" tile: its top `shinPx` rows are floor for
 * the feet only (plus a landing edge for a box falling onto its top), so the uphill corner of a body
 * walking up the slope may overlap it.
 *
 * Every function here is a no-op unless `room.slopes`, so rectilinear rooms (and their golden tapes)
 * behave exactly as before. Integer table lookups only; allocation-free (hot path).
 */

const TS = defaultTuning.world.tileSize;

/**
 * TOP[(t - SLOPE_FIRST) * TS + i] = first solid row (px from the tile's top) of pixel column i.
 * R: height(i) = floor((k*TS + i) / run) + 1 (1 px at the low corner, TS at the high one); L is R
 * reversed, so mirrored tiles are mirrored tables.
 */
const TOP = new Int16Array(SLOPE_SHAPES.length * TS);
for (const s of SLOPE_SHAPES) {
  const o = (s.tile - SLOPE_FIRST) * TS;
  for (let i = 0; i < TS; i++) {
    const col = s.dir > 0 ? i : TS - 1 - i;
    const h = Math.floor((s.k * TS + col) / s.run) + 1;
    TOP[o + i] = TS - h;
  }
}

/** First solid row (px from the tile top) of column `i` of slope tile `t`. */
export function slopeTop(t: number, i: number): number {
  return TOP[(t - SLOPE_FIRST) * TS + i] as number;
}

/**
 * Is pixel (px, py) floor for the feet? Slope tiles below their surface, shin and solid tiles.
 * (Solid is included so a surface search from a slope onto flat ground sees the flat.)
 */
export function floorPx(room: Room, px: number, py: number): boolean {
  const tx = Math.floor(px / TS);
  const ty = Math.floor(py / TS);
  const t = tileAt(room, tx, ty);
  if (t === Tile.solid || t === Tile.shin) return true;
  if (t < SLOPE_FIRST || t > Tile.slopeL1) return false;
  return py - ty * TS >= (TOP[(t - SLOPE_FIRST) * TS + (px - tx * TS)] as number);
}

/** Is pixel (px, py) in a slope or shin tile's floor (not plain solid)? For "was on a slope" tests. */
export function slopeFloorPx(room: Room, px: number, py: number): boolean {
  const tx = Math.floor(px / TS);
  const ty = Math.floor(py / TS);
  const t = tileAt(room, tx, ty);
  if (t === Tile.shin) return true;
  if (!isSlopeTile(t)) return false;
  return py - ty * TS >= (TOP[(t - SLOPE_FIRST) * TS + (px - tx * TS)] as number);
}

/** Would a body with its top-left at (x, y) have its feet (bottom row) inside slope floor? */
export function feetEmbedded(room: Room, x: number, y: number, w: number, h: number): boolean {
  if (!room.slopes) return false;
  const py = y + h - 1;
  return floorPx(room, x + ((w - 1) >> 1), py) || floorPx(room, x + (w >> 1), py);
}

/**
 * Standing on slope ground (or a shin top) if the body were at (x, y): the row under the feet is
 * floor at a middle column. A shin's top band is feet-only (no landing edge for the box), so a
 * body walking down from a crest follows the surface instead of hanging on its corner; the lint
 * keeps shins away from open air, where a falling corner could otherwise sink into the band.
 */
export function slopeGround(room: Room, x: number, y: number, w: number, h: number): boolean {
  if (!room.slopes) return false;
  const py = y + h;
  return floorPx(room, x + ((w - 1) >> 1), py) || floorPx(room, x + (w >> 1), py);
}

/** Was the body standing on a slope or shin (not plain flat solid)? Gates ground stick. */
export function onSlopeGround(room: Room, x: number, y: number, w: number, h: number): boolean {
  if (!room.slopes) return false;
  const py = y + h;
  return slopeFloorPx(room, x + ((w - 1) >> 1), py) || slopeFloorPx(room, x + (w >> 1), py);
}

/**
 * Lowest y (smallest lift) that clears the feet, searching up to `maxLift` px; -1 if none. Used by
 * the uphill step and by placing bodies (spawns, respawns) on slopes.
 */
export function liftOut(room: Room, x: number, y: number, w: number, h: number, maxLift: number): number {
  for (let k = 0; k <= maxLift; k++) if (!feetEmbedded(room, x, y - k, w, h)) return k;
  return -1;
}

/**
 * Walker ledge detection on slopes: is there floor ahead at column px within `drop` px under the
 * feet row (a downhill slope drops away from a walker's leading edge)?
 */
export function floorAheadOnSlope(room: Room, px: number, feetY: number, drop: number): boolean {
  if (!room.slopes) return false;
  for (let d = 0; d <= drop; d++) if (floorPx(room, px, feetY + d)) return true;
  return false;
}
