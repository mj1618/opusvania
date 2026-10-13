/**
 * The camera kick: a small render-side shove of the view when a blow lands (the sim's `impact`
 * event). It is an offset added to the view at draw time; the follow camera's own state never sees
 * it, so the camera stays as deterministic as the sim. The view jumps a few px against the cut and
 * comes back on a critically damped spring. No rotation, no zoom, nothing on a miss.
 */
import type { SimEvent } from '../../sim/events';
import { type CameraTuning, cameraTuning } from './tuning';

export class CameraKick {
  /** Offset to add to the view centre, world px. */
  x = 0;
  y = 0;
  private vx = 0;
  private vy = 0;

  reset(): void {
    this.x = this.y = this.vx = this.vy = 0;
  }

  /** Feed the frame's sim events, then advance `dt` seconds of render time. */
  update(dt: number, events: readonly SimEvent[], ct: CameraTuning = cameraTuning): void {
    const k = ct.kick;
    for (const e of events) {
      if (e.type === 'spawn') this.reset();
      if (e.type !== 'impact') continue;
      const px = e.power >= 2 ? k.power2 : k.power1;
      // Against the cut: forward cuts shove the view back, an up cut down, a down cut up.
      const dx = e.dir === 'fwd' ? -e.facing : 0;
      const dy = e.dir === 'up' ? 1 : e.dir === 'down' ? -1 : 0;
      this.x = dx * px;
      this.y = dy * px * k.vertical;
      this.vx = this.vy = 0;
    }
    if (dt <= 0) return;
    // Critically damped: x(t) = (x0 + (v0 + w x0) t) e^(-w t), exact for any dt.
    const w = k.omega;
    const ex = Math.exp(-w * dt);
    const ax = this.vx + w * this.x;
    const ay = this.vy + w * this.y;
    this.x = (this.x + ax * dt) * ex;
    this.y = (this.y + ay * dt) * ex;
    this.vx = ax * ex - w * this.x;
    this.vy = ay * ex - w * this.y;
    if (
      Math.abs(this.x) < 0.02 &&
      Math.abs(this.y) < 0.02 &&
      Math.abs(this.vx) < 0.5 &&
      Math.abs(this.vy) < 0.5
    )
      this.reset();
  }
}
