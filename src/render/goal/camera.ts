/**
 * The goal's two camera moves, both render-side offsets added to the view at draw time (like
 * camera/kick.ts: the follow camera's own state never sees them, so it stays as deterministic as
 * the sim):
 *
 *  - the heart wakes (`heartWake`) while she is far away: the view leans a few dozen px toward it
 *    and comes back, eased, so she knows where to look;
 *  - the ending (`gather`): the view eases in a few percent and drifts up and toward the heart, and
 *    stays there until the restart.
 *
 * Offsets are held inside the scene, so a view resting against an edge never shows past it.
 */
import type { SimEvent } from '../../sim/events';
import type { Scene } from '../../sim/scene';
import type { GoalState } from '../../sim/state';
import { type CameraView, VIEW_H, VIEW_W } from '../contract';
import { GOAL } from './config';
import { smooth } from './logic';

export class GoalCamera {
  /** Offset to add to the view centre (world px) and factor on its zoom. */
  x = 0;
  y = 0;
  zoom = 1;
  private nudgeT = -1;
  private dirX = 0;
  private dirY = 0;
  private amp = 0;
  /** 0..1: how far the ending's move has come (eased toward the sim's hold). */
  private end = 0;

  update(
    dt: number,
    events: readonly SimEvent[],
    goal: GoalState,
    frameAlpha: number,
    scene: Scene,
    base: CameraView,
  ): void {
    const C = GOAL.camera;
    const heart = scene.heart;
    for (const e of events) {
      if (e.type !== 'heartWake') continue;
      const dx = e.x - base.x;
      const dy = e.y - base.y;
      const d = Math.hypot(dx, dy);
      // Nothing when the heart is in plain view near the middle already.
      this.amp = Math.min(C.nudge, Math.max(0, (d - 260) * 0.14));
      this.dirX = d > 0 ? dx / d : 0;
      this.dirY = d > 0 ? dy / d : 0;
      this.nudgeT = 0;
    }
    let nx = 0;
    let ny = 0;
    if (this.nudgeT >= 0) {
      this.nudgeT += dt;
      const t = this.nudgeT / C.seconds;
      if (t >= 1) this.nudgeT = -1;
      else {
        const k = smooth(0, 0.3, t) * (1 - smooth(0.52, 1, t));
        nx = this.dirX * this.amp * k;
        ny = this.dirY * this.amp * k;
      }
    }
    // The ending follows the sim's hold (so a frozen sim holds the move too), then stays.
    const want =
      goal.gathered && heart ? smooth(0, C.frames, goal.ending.frames + (goal.ended ? 0 : frameAlpha)) : 0;
    this.end = goal.gathered ? want : Math.max(0, this.end - dt * 2.5);
    const k = this.end;
    this.zoom = 1 + C.zoom * k;
    let x = nx + (heart ? (heart.x - base.x) * C.toward * k : 0);
    let y = ny - C.rise * k;
    // Keep the view inside the scene wherever the base view was inside it.
    const hw = VIEW_W / 2 / (base.zoom * this.zoom);
    const hh = VIEW_H / 2 / (base.zoom * this.zoom);
    if (base.x + x > scene.width - hw) x = Math.max(Math.min(x, 0), scene.width - hw - base.x);
    if (base.x + x < hw) x = Math.min(Math.max(x, 0), hw - base.x);
    if (base.y + y > scene.height - hh) y = Math.max(Math.min(y, 0), scene.height - hh - base.y);
    if (base.y + y < hh) y = Math.min(Math.max(y, 0), hh - base.y);
    this.x = x;
    this.y = y;
  }
}
