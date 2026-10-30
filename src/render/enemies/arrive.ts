/**
 * An ambush's creature on its way in (`EnemyState.arrive`, the Canopy r8): the sim slides its box from the arrive
 * point to its spawn at an even speed (it is harmless and out of reach meanwhile). Render draws the same path at
 * an eased pace, by how it comes (lantern/acts.ts `arriveWay`, which also draws the mouth, the mound, the shadow):
 *
 *   drop    falls: slow off the roof, fast at the floor (distance as the square of time);
 *   wall    out of a burrow mouth quickly, a beat to look, then a scurry to its ground;
 *   ground  heaves itself up out of the floor where it digs out, then scurries;
 *   fly     eases in on the wing;
 *   mouth   out of a way on's passage along its floor, up the step to its ground if it stands higher, then a scurry.
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

/** The edge, toward `fx`, of the solid under a creature at home (hx, hy centre, h tall): where it climbs up. */
function stepX(sim: SimView, hx: number, hy: number, h: number, fx: number): number {
  const foot = hy + h / 2;
  const under = sim.scene.solids.find((r) => hx >= r.x && hx <= r.x + r.w && Math.abs(r.y - foot) < 24);
  if (!under) return hx;
  return fx > hx ? under.x + under.w : under.x;
}

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
  let cx = fx + (hx - fx) * d;
  let cy = fy + (hy - fy) * d + rise * e.h * 0.9;
  if (way === 'mouth' && hy < fy - 8) {
    // Along the passage floor to the foot of the step its ground stands on, a hop up it, then on.
    const step = stepX(sim, hx, hy, e.h, fx);
    const total = Math.abs(step - fx) + (fy - hy) + Math.abs(hx - step);
    const s = smooth(p) * total;
    const a = Math.abs(step - fx);
    const b = a + (fy - hy);
    const dir = hx >= fx ? 1 : -1;
    if (s < a) {
      cx = fx + dir * s;
      cy = fy;
    } else if (s < b) {
      const t = (s - a) / (fy - hy);
      cx = step + dir * t * 30;
      cy = fy - (fy - hy) * t - Math.sin(Math.PI * t) * 24;
    } else {
      cx = step + dir * 30 + (hx - step - dir * 30) * ((s - b) / Math.max(1, total - b));
      cy = hy;
    }
  }
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
