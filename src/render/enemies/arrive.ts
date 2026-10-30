/**
 * An ambush's creature on its way in (`EnemyState.arrive`, the Canopy r8): the sim slides its box from the arrive
 * point to its spawn at an even speed (it is harmless and out of reach meanwhile). Render draws the same path at
 * an eased pace, by how it comes (lantern/acts.ts `arriveWay`, which also draws the mouth, the mound, the shadow):
 *
 *   drop    falls: slow off the roof, fast at the floor (distance as the square of time);
 *   wall    out of a burrow mouth quickly, a beat to look, then a scurry to its ground;
 *   ground  heaves itself up out of the floor where it digs out, then scurries;
 *   fly     eases in on the wing.
 *
 * A beetle's legs run while it travels (its stride follows the distance), facing the way it goes. The returned
 * state is a copy: the sim's is never touched.
 */
import type { EnemyState } from '../../sim/state';
import { tuning } from '../../sim/tuning';
import type { SimView } from '../contract';
import { arriveWay } from '../lantern/acts';

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Of the way travelled (0..1) at `p` (0..1 of the time), by how it comes. */
function eased(way: string, p: number): { d: number; rise: number } {
  if (way === 'drop') return { d: p * p, rise: 0 };
  if (way === 'wall') {
    // Out of the mouth to 30% in the first quarter, a look, then the rest.
    const a = smooth(p / 0.25) * 0.3;
    const b = smooth((p - 0.45) / 0.55) * 0.7;
    return { d: a + b, rise: 0 };
  }
  if (way === 'ground') {
    // Up out of the floor in the first 35% (where it broke through), then the scurry.
    return { d: smooth((p - 0.35) / 0.65), rise: 1 - smooth(p / 0.35) };
  }
  return { d: smooth(p), rise: 0 };
}

const WAYS = new Map<string, string>();

/** The creature as drawn while it arrives (a copy), or `e` itself when it is not arriving. */
export function arrivalView(e: Readonly<EnemyState>, sim: SimView, beetle: boolean): Readonly<EnemyState> {
  if (!(e.arrive > 0)) return e;
  const n = Math.max(1, Math.round(tuning.enemies.arriveFrames));
  const p = 1 - Math.min(1, e.arrive / n);
  const hx = e.homeX;
  const hy = e.homeY;
  const fx = hx + e.arriveX;
  const fy = hy + e.arriveY;
  const key = `${e.id}:${fx}:${fy}`;
  let way = WAYS.get(key);
  if (!way) {
    way = arriveWay(sim, e.kind, fx, fy, hx, hy, e.w / 2).way;
    WAYS.set(key, way);
  }
  const { d, rise } = eased(way, p);
  const cx = fx + (hx - fx) * d;
  const cy = fy + (hy - fy) * d + rise * e.h * 0.9;
  const dir = hx >= fx ? 1 : -1;
  const out: EnemyState = { ...e, x: Math.round(cx - e.w / 2), y: Math.round(cy - e.h / 2), rx: 0, ry: 0 };
  if (beetle && way !== 'drop') {
    out.facing = dir;
    out.mode = 'walk';
    out.vx = dir * 2;
    out.stride = e.stride + Math.abs(cx - fx);
  }
  return out;
}
