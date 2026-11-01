/**
 * The camera kick: a small render-side shove of the view when a blow lands (the sim's `impact`
 * event). It is an offset added to the view at draw time; the follow camera's own state never sees
 * it, so the camera stays as deterministic as the sim. The view jumps a few px against the cut and
 * comes back on a critically damped spring. No rotation, no zoom, nothing on a miss.
 */
import type { SimEvent } from '../../sim/events';
import { FEEL } from './shake';
import { type CameraTuning, cameraTuning } from './tuning';

function snuffIn(events: readonly SimEvent[]): boolean {
  for (const e of events) if (e.type === 'lureSnuff') return true;
  return false;
}

export class CameraKick {
  /** Offset to add to the view centre, world px. */
  x = 0;
  y = 0;
  /** Zoom factor to multiply the view by (the finisher kill's punch; 1 = none). */
  get zoom(): number {
    return 1 + this.z;
  }
  private vx = 0;
  private vy = 0;
  private z = 0;
  private vz = 0;

  reset(): void {
    this.x = this.y = this.vx = this.vy = this.z = this.vz = 0;
  }

  /** Feed the frame's sim events, then advance `dt` seconds of render time. */
  update(dt: number, events: readonly SimEvent[], ct: CameraTuning = cameraTuning): void {
    const k = ct.kick;
    let struck = false;
    let kill = false;
    let finisher = false;
    let snuff = false;
    for (const e of events) {
      if (e.type === 'enemyDie') kill = true;
      if (e.type === 'lureSnuff') snuff = true;
      if (e.type === 'spawn') this.reset();
      if (e.type === 'hurt') {
        // The blow: the view is shoved the way she is thrown, and down a little.
        this.x = (e.dir >= 0 ? 1 : -1) * k.hurt;
        this.y = 0.35 * k.hurt;
        this.vx = this.vy = 0;
        continue;
      }
      if (e.type !== 'impact') continue;
      if (e.power >= 2) finisher = true;
      const px = e.power >= 2 || snuffIn(events) ? k.power2 : k.power1;
      // Against the cut: forward cuts shove the view back, an up cut down, a down cut up.
      const dx = e.dir === 'fwd' ? -e.facing : 0;
      const dy = e.dir === 'up' ? 1 : e.dir === 'down' ? -1 : 0;
      this.x = dx * px;
      this.y = dy * px * k.vertical;
      this.vx = this.vy = 0;
      struck = true;
    }
    // The blow that kills lands a little harder.
    if (struck && (kill || snuff)) {
      this.x *= k.kill;
      this.y *= k.kill;
      // The finisher that kills punches the view in.
      if (finisher && kill) {
        this.z = k.punch;
        this.vz = 0;
      }
    }
    // Shake off (accessibility): the kick stays home too.
    if (!FEEL.shake) this.reset();
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
    const wz = k.punchOmega;
    const ez = Math.exp(-wz * dt);
    const az = this.vz + wz * this.z;
    this.z = (this.z + az * dt) * ez;
    this.vz = az * ez - wz * this.z;
    if (Math.abs(this.z) < 1e-4 && Math.abs(this.vz) < 1e-3) this.z = this.vz = 0;
    if (
      Math.abs(this.x) < 0.02 &&
      Math.abs(this.y) < 0.02 &&
      Math.abs(this.vx) < 0.5 &&
      Math.abs(this.vy) < 0.5
    ) {
      this.x = this.y = this.vx = this.vy = 0;
    }
  }
}
