/**
 * The goal's two camera moves, both render-side offsets added to the view at draw time (like
 * camera/kick.ts: the follow camera's own state never sees them, so it stays as deterministic as
 * the sim):
 *
 *  - the heart wakes (`heartWake`) while she is far away: the view leans a few dozen px toward it
 *    and comes back, eased, so she knows where to look;
 *  - the LAST lantern catches and the heart can share a picture with it (playtest 4: the wake was
 *    under the frame from the far bluff): the view eases to hold both, stays through the wake and
 *    eases back; after that, while she is near the awake heart and it is out of the picture, a soft
 *    pull keeps it just inside the frame so she does not glide away over it;
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

/**
 * Where she is, left by the goal renderer each frame (stage.ts gives this camera no player): the
 * pull toward the awake heart must never push her out of the picture. One frame old, which an
 * eased offset does not notice.
 */
export const camLink = { on: false, x: 0, y: 0 };

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
  /** The last kindle's picture: seconds in (-1 = none), the view it goes to. */
  private shotT = -1;
  private shotX = 0;
  private shotY = 0;
  private shotZoom = 1;
  /** The soft pull toward the awake heart (eased offset). */
  private pullX = 0;
  private pullY = 0;
  private frame = -1;

  /** 0..1: how far the last kindle's picture is in (for tools). */
  get shot(): number {
    const F = GOAL.camera.frame;
    if (this.shotT < 0) return 0;
    const t = this.shotT;
    return smoother(0, F.in, t) * (1 - smoother(F.in + F.hold, F.in + F.hold + F.out, t));
  }

  update(
    dt: number,
    events: readonly SimEvent[],
    goal: GoalState,
    frameAlpha: number,
    grounded: boolean,
    scene: Scene,
    base: CameraView,
  ): void {
    const C = GOAL.camera;
    const F = C.frame;
    const heart = scene.heart;
    let kx = Number.NaN;
    let ky = 0;
    for (const e of events) {
      if (e.type === 'lanternKindle') {
        kx = e.x;
        ky = e.y;
      }
      if (e.type !== 'heartWake') continue;
      const dx = e.x - base.x;
      const dy = e.y - base.y;
      const d = Math.hypot(dx, dy);
      // The lantern that woke it and the heart in one picture, if one picture can hold both.
      if (!Number.isNaN(kx)) {
        const x0 = Math.min(kx, e.x) - F.side;
        const x1 = Math.max(kx, e.x) + F.side;
        const y0 = Math.min(ky - F.above, e.y - F.above);
        const y1 = Math.max(ky, e.y) + F.below;
        const z = Math.min(1, VIEW_W / (x1 - x0), VIEW_H / (y1 - y0));
        if (z >= F.minZoom) {
          this.shotT = 0;
          this.shotX = (x0 + x1) / 2;
          this.shotY = (y0 + y1) / 2;
          this.shotZoom = z;
          this.nudgeT = -1;
          continue;
        }
      }
      // Otherwise a lean toward it. Nothing when the heart is in plain view near the middle already.
      // Not while she is in the air: a lean under a jump throws the landing.
      this.amp = grounded ? Math.min(C.nudge, Math.max(0, (d - 260) * 0.3)) : 0;
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
        const k = smooth(0, 0.34, t) * (1 - smooth(0.55, 1, t));
        nx = this.dirX * this.amp * k;
        ny = this.dirY * this.amp * k;
      }
    }
    // A restart or a state jump: no picture, no pull.
    if (!goal.heart.awake || goal.gathered) this.shotT = -1;
    // The soft pull: while the heart is awake and she is near it but it is out of the picture, the
    // view leans until it is inside by `margin`, never so far that she comes within `keep` of an edge.
    let wx = 0;
    let wy = 0;
    if (heart && goal.heart.awake && !goal.gathered && camLink.on) {
      const P = C.pull;
      const hw0 = VIEW_W / 2 / base.zoom;
      const hh0 = VIEW_H / 2 / base.zoom;
      const hx = heart.x;
      const hy = heart.y - 40;
      if (Math.abs(hx - camLink.x) < P.px && Math.abs(hy - camLink.y) < P.py) {
        const needX =
          Math.max(0, hx + P.margin - (base.x + hw0)) - Math.max(0, base.x - hw0 - (hx - P.margin));
        const needY =
          Math.max(0, hy + P.margin - (base.y + hh0)) - Math.max(0, base.y - hh0 - (hy - P.margin));
        // How far the view may go before she is too near the opposite edge.
        const roomR = Math.max(0, camLink.x - P.keep - (base.x - hw0));
        const roomL = Math.max(0, base.x + hw0 - (camLink.x + P.keep));
        const roomD = Math.max(0, camLink.y - P.keepTop - (base.y - hh0));
        const roomU = Math.max(0, base.y + hh0 - (camLink.y + P.keep));
        wx = Math.max(-roomL, Math.min(roomR, needX));
        wy = Math.max(-roomU, Math.min(roomD, needY));
      }
    }
    const pr = Math.min(1, dt * C.pull.rate);
    this.pullX += (wx - this.pullX) * pr;
    this.pullY += (wy - this.pullY) * pr;
    // The ending follows the sim's hold (so a frozen sim holds the move too), then stays.
    const want =
      goal.gathered && heart ? smooth(0, C.frames, goal.ending.frames + (goal.ended ? 0 : frameAlpha)) : 0;
    this.end = goal.gathered ? want : Math.max(0, this.end - dt * 2.5);
    const k = this.end;
    this.zoom = 1 + C.zoom * k;
    let x = nx + this.pullX * (1 - k) + (heart ? (heart.x - base.x) * C.toward * k : 0);
    let y = ny + this.pullY * (1 - k) - C.rise * k;
    // The last kindle's picture: in, held through the wake, and back.
    if (this.shotT >= 0) {
      this.shotT += dt;
      const s = this.shot;
      if (this.shotT > F.in + F.hold + F.out) this.shotT = -1;
      x += (this.shotX - base.x - x) * s;
      y += (this.shotY - base.y - y) * s;
      this.zoom *= 1 + (this.shotZoom - 1) * s;
    }
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

function smoother(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
