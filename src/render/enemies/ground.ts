/**
 * Where render-side debris meets the room (hitfx.ts droplets, flung.ts bodies): the scene's static solids and
 * one-ways, read only. Kit solids that come and go (bark, gates) are not in it: a droplet may land on the air
 * where a broken panel stood, which nobody will see. No Pixi, no sim state: plain boxes.
 */
import type { Scene } from '../../sim/scene';

/** What a moving point met this step: `top` (landed on a surface at `y`), `wall` (a face at `x`, `nx` its normal), or none. */
export interface Contact {
  kind: 'none' | 'top' | 'wall' | 'ceiling';
  x: number;
  y: number;
  nx: number;
}

export const NO_CONTACT: Contact = { kind: 'none', x: 0, y: 0, nx: 0 };

/**
 * A point moved from (x0, y0) to (x1, y1): the first thing it went into, judged by where it came from (above a
 * solid's top = landed; beside it = a wall; under it = a ceiling). One-ways only catch it falling through their line.
 */
export function sweepPoint(
  scene: Scene,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  out: Contact,
): Contact {
  out.kind = 'none';
  for (const s of scene.solids) {
    if (x1 < s.x || x1 > s.x + s.w || y1 < s.y || y1 > s.y + s.h) continue;
    if (y0 <= s.y + 0.5) {
      out.kind = 'top';
      out.x = x1;
      out.y = s.y;
    } else if (y0 >= s.y + s.h - 0.5) {
      out.kind = 'ceiling';
      out.x = x1;
      out.y = s.y + s.h;
    } else {
      out.kind = 'wall';
      out.nx = x0 < s.x + s.w / 2 ? -1 : 1;
      out.x = out.nx < 0 ? s.x : s.x + s.w;
      out.y = y1;
    }
    return out;
  }
  if (y1 > y0) {
    for (const o of scene.oneWays) {
      if (x1 < o.x || x1 > o.x + o.w || y0 > o.y || y1 < o.y) continue;
      out.kind = 'top';
      out.x = x1;
      out.y = o.y;
      return out;
    }
  }
  return out;
}

/** The nearest surface top at or below `y` under column `x` (a solid's or a one-way's), or the room's floor. */
export function groundBelow(scene: Scene, x: number, y: number): number {
  let best = scene.height;
  for (const s of scene.solids) if (x >= s.x && x <= s.x + s.w && s.y >= y && s.y < best) best = s.y;
  for (const o of scene.oneWays) if (x >= o.x && x <= o.x + o.w && o.y >= y && o.y < best) best = o.y;
  return best;
}

/** True if the point is inside a solid. */
export function inSolid(scene: Scene, x: number, y: number): boolean {
  for (const s of scene.solids) if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) return true;
  return false;
}
