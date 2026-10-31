/**
 * The opening's camera (the Canopy r12, docs/design/levels/canopy-moments.md moment 1; `marks.stage.open`): shut in her
 * cocoon the view is close on it (`zooms[0]`, 1.5), and each press that splits it more (`state.hatch.presses`) widens
 * it one step (1.25, 1.0): each press shows more sky. The breakout lets go to the full frame. Zoomed in, the view
 * leans toward the cocoon (`room.hatch`), so it stays where it was on screen while the frame closes round it.
 *
 * Pure of the sim but for what it reads (the hatch state); render time eases it. Composed in stage.ts with the other
 * beats (zoom multiplies, x / y add).
 */
import type { Room } from '../../scene/room';
import type { HatchState } from '../../sim/state';
import type { CameraView } from '../contract';
import { CAMERA_OPEN } from './tuning';

export class OpenCamera {
  x = 0;
  y = 0;
  zoom = 1;
  private readonly zooms: readonly number[] | null;
  private readonly at: { x: number; y: number } | null;
  private z = -1;
  private zv = 0;

  constructor(room: Room) {
    const open = (room.marks?.stage as { open?: { zooms?: number[] } } | undefined)?.open;
    this.zooms = open?.zooms?.length ? open.zooms : null;
    this.at = room.hatch ? { x: room.hatch.x, y: room.hatch.y - CAMERA_OPEN.above } : null;
  }

  /** Advances by `dt` s with the hatch's state and the follow view, and sets the offset and zoom. */
  update(dt: number, hatch: HatchState | null, follow: CameraView): void {
    if (!this.zooms || !this.at || !hatch) {
      this.x = this.y = 0;
      this.zoom = 1;
      this.z = -1;
      return;
    }
    const want = hatch.done ? 1 : (this.zooms[Math.min(hatch.presses, this.zooms.length - 1)] as number);
    // A fresh opening snaps to its close frame; later steps ease (a press: quick; the breakout: a longer let-go).
    if (this.z < 0 || (!hatch.done && hatch.presses === 0 && hatch.frames < 2)) {
      this.z = want;
      this.zv = 0;
    } else if (dt > 0) {
      const T = hatch.done ? CAMERA_OPEN.out : CAMERA_OPEN.step;
      // A critically damped spring toward the step's zoom.
      const w = 2 / T;
      const x = w * dt;
      const ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const ch = this.z - want;
      const tmp = (this.zv + w * ch) * dt;
      this.zv = (this.zv - w * tmp) * ex;
      this.z = want + (ch + tmp) * ex;
    }
    this.zoom = this.z;
    // Zoomed in, keep the cocoon where it is: the view slides toward it by the share the zoom took away.
    const k = 1 - 1 / Math.max(1, this.z);
    this.x = (this.at.x - follow.x) * k;
    this.y = (this.at.y - follow.y) * k;
  }
}
