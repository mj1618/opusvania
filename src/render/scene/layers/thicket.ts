/**
 * The near-mid ground of an open wood room (canopy r19; the painters and why: lib/thicket.ts): two ranks of moss
 * banks behind every long low floor, in their own layers (`thicketFar` 0.8, `thicketNear` 0.9), each bank baked
 * once into a sprite. Placed so a bank stands behind the floor where the camera looks at it: a floor point at world
 * x lands at layer x `anchor + (x - anchor) * parallax`, the same for y about the camera that frames her there.
 * Only in the rooms `THICKET.rooms` names. Static: nothing per frame.
 */
import type { EnvModule, SceneContext } from '../index';
import { bakePlane } from '../lib/bake-plane';
import { exposedSides, type MassRect } from '../lib/pf-mass';
import { drawBank, THICKET } from '../lib/thicket';

/** How far above a floor the camera centre sits when she stands on it (px; the feet line at ~0.62 of the view). */
const CAM_ABOVE = 130;
/** A bank runs this far past its floor's ends (px), easing into the ground beyond. */
const OVERRUN = 260;

export class ThicketLayer implements EnvModule {
  init(ctx: SceneContext): void {
    const room = ctx.scene;
    if (!THICKET.rooms.includes(room.id)) return;
    const A = ctx.layers.anchor;
    const masses = room.solids.filter((s) => s.tag === 'root' || s.tag === 'ground') as MassRect[];
    const runs: Array<[number, number, number]> = [];
    for (const m of masses)
      for (const [x0, x1] of exposedSides(m, masses, room.width, room.height).top)
        if (x1 - x0 >= THICKET.minRun && m.y >= room.height * THICKET.minY) runs.push([x0, x1, m.y]);
    THICKET.ranks.forEach((R, k) => {
      const layer = ctx.layers.get(k ? 'thicketNear' : 'thicketFar');
      const p = R.parallax;
      for (const [x0, x1, y] of runs) {
        const cy = y - CAM_ABOVE - R.rise;
        const lx0 = A.x + (x0 - OVERRUN - A.x) * p;
        const lx1 = A.x + (x1 + OVERRUN - A.x) * p;
        const ly = A.y + (cy - A.y) * p + (y - R.rise - cy);
        const rect = {
          x: lx0 - 40,
          y: ly - R.h[1] - 220,
          w: lx1 - lx0 + 80,
          h: R.h[1] + 220 + THICKET.depth,
        };
        layer.addChild(
          bakePlane(
            ctx.renderer,
            rect,
            R.scale,
            (g) => drawBank(g, lx0, lx1, ly, k as 0 | 1, Math.round(x0 + y)),
            `thicket-${k}`,
          ),
        );
      }
    });
  }

  update(): void {}
}
