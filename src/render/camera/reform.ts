/**
 * Fade and re-form as one composed camera move, render-side (like `kick.ts`: the follow camera's
 * own state snaps to the new spot as before and never sees any of this).
 *
 *  - `fade`: the follow camera holds where she fell (index.ts); here the dark dip comes on over the
 *    last moments of the fade;
 *  - `reform`: instead of a cut, an offset equal to (old view - new view) is added to the view and
 *    eased to zero, so the picture glides from where she fell to where she re-forms, under the dip,
 *    which lifts as she unfolds. The offset is never longer than `panCap`;
 *  - a restart: no pan, a quick dip that lifts.
 *
 * `x`, `y` = offset to add to the view centre (world px); `dip` = strength of the dark overlay, 0..1.
 * No Pixi here: the overlay itself is `dip.ts`.
 */
import type { CameraView } from '../contract';
import { type CameraTuning, cameraTuning } from './tuning';

/** Ease in and out with zero speed at both ends (smootherstep). */
function ease(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * k * (k * (k * 6 - 15) + 10);
}

export function reformSeconds(dist: number, ct: CameraTuning = cameraTuning): number {
  const R = ct.reform;
  if (dist < R.minDist) return R.secNear;
  const k = Math.min(1, (dist - R.minDist) / Math.max(1, R.panCap - R.minDist));
  return R.secMin + (R.secMax - R.secMin) * k;
}

export class ReformShot {
  x = 0;
  y = 0;
  dip = 0;
  private sx = 0;
  private sy = 0;
  /** Seconds into the pan (-1 = none) and its length. */
  private panT = -1;
  private panDur = 0;
  /** Seconds until the dip starts coming on (-1 = not waiting); the depth it goes to. */
  private wait = -1;
  private depth = 0;
  private phase: 'idle' | 'in' | 'pan' | 'out' = 'idle';
  private outT = 0;
  private outDur = 0;
  private outFrom = 0;

  /** A placement (teleport) or anything else that should show the picture plainly, at once. */
  clear(): void {
    this.x = this.y = this.dip = this.sx = this.sy = 0;
    this.panT = this.wait = -1;
    this.phase = 'idle';
  }

  /** She fades for `frames` sim frames and will re-form about `dist` px away. */
  fade(frames: number, dist: number, ct: CameraTuning = cameraTuning): void {
    const R = ct.reform;
    if (dist < R.minDist) return;
    this.depth = dist > R.panCap ? R.dipCut : R.dip;
    this.wait = Math.max(0, frames / 60 - R.dipIn);
    if (this.phase === 'idle') this.phase = 'in';
  }

  /** She re-formed: the follow view went from `from` to `to` in one frame. */
  reform(from: CameraView, to: CameraView, ct: CameraTuning = cameraTuning): void {
    const R = ct.reform;
    let dx = from.x - to.x;
    let dy = from.y - to.y;
    const dist = Math.hypot(dx, dy);
    if (dist > R.panCap) {
      dx *= R.panCap / dist;
      dy *= R.panCap / dist;
    }
    this.sx = this.x = dx;
    this.sy = this.y = dy;
    this.panT = 0;
    this.panDur = reformSeconds(dist, ct);
    this.wait = -1;
    if (dist < R.minDist) {
      // Close by: only the ease. Whatever dip was coming on lifts.
      this.startOut(R.secNear);
    } else {
      this.depth = dist > R.panCap ? R.dipCut : R.dip;
      this.phase = 'pan';
    }
  }

  /** The scene restarted: a cut, covered by a dip that lifts. */
  restart(ct: CameraTuning = cameraTuning): void {
    this.clear();
    this.dip = ct.reform.restartDip;
    this.startOut(ct.reform.restartSec);
  }

  private startOut(seconds: number): void {
    this.phase = this.dip > 0 ? 'out' : 'idle';
    this.outT = 0;
    this.outDur = seconds;
    this.outFrom = this.dip;
  }

  update(dt: number, ct: CameraTuning = cameraTuning): void {
    const R = ct.reform;
    if (dt <= 0) return;
    if (this.panT >= 0) {
      this.panT += dt;
      const k = 1 - ease(this.panT / this.panDur);
      this.x = this.sx * k;
      this.y = this.sy * k;
      if (this.panT >= this.panDur) {
        this.panT = -1;
        this.x = this.y = 0;
      }
    }
    if (this.phase === 'in') {
      if (this.wait > 0) this.wait -= dt;
      else this.dip = Math.min(this.depth, this.dip + (dt / R.dipIn) * this.depth);
    } else if (this.phase === 'pan') {
      // Up to its depth quickly if the fade did not bring it there, hold, then lift by the end of the pan.
      const t = this.panT < 0 ? 1 : this.panT / this.panDur;
      const env = this.depth * (1 - ease((t - R.dipHold) / (1 - R.dipHold)));
      this.dip = Math.min(env, this.dip + (dt / R.dipRise) * this.depth);
      if (this.panT < 0) {
        this.dip = 0;
        this.phase = 'idle';
      }
    } else if (this.phase === 'out') {
      this.outT += dt;
      this.dip = this.outFrom * (1 - ease(this.outT / this.outDur));
      if (this.outT >= this.outDur) {
        this.dip = 0;
        this.phase = 'idle';
      }
    }
  }
}
