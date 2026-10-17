/**
 * A room's scripted camera beats (`room.camera`, src/scene/room.ts), render-side like the kick: an
 * offset added to the view at draw time; the follow camera never sees it.
 *
 *  - `hatchKick`: on the sim's `hatch` event the view is shoved down this many px and comes back on a
 *    critically damped spring (`OMEGA`: settled in ~0.3 s), the burst of the cocoon.
 *  - `lean`: timed in SIM seconds since the `hatch` event (what she does never moves it), the view eases
 *    toward (`x`, `y`) from `from` over `in`, holds `hold`, eases back over `out`: the swarm's pass over
 *    the moon (its timing is the swarm's `SWARM.pass`). A restart, a room restart or a teleport ends it.
 * The fade up from black at boot / restart (`fadeIn`) is room-fade.ts's.
 */
import type { RoomCamera } from '../../scene/room';
import type { SimEvent } from '../../sim/events';

/** The kick's spring, rad/s: back home (to within 5%) in about 0.3 s. */
const OMEGA = 16;

function smoother(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * k * (k * (k * 6 - 15) + 10);
}

/** 0..1: the lean's envelope `t` seconds after the hatch. */
export function leanWeight(lean: NonNullable<RoomCamera['lean']>, t: number): number {
  const up = smoother((t - lean.from) / lean.in);
  const down = smoother((t - lean.from - lean.in - lean.hold) / lean.out);
  return up * (1 - down);
}

export class CameraBeats {
  /** Offset to add to the view centre, world px. */
  x = 0;
  y = 0;
  private ky = 0;
  private kv = 0;
  /** The sim frame of the `hatch` event (null: none seen since the last placement). */
  private hatchFrame: number | null = null;

  constructor(private readonly cfg: RoomCamera = {}) {}

  /** Called after each sim step with its events and the frame after it (stage.ts `afterStep`). */
  onStep(events: readonly SimEvent[], frame: number): void {
    for (const e of events) {
      if (e.type === 'hatch') {
        this.hatchFrame = frame;
        this.ky = this.cfg.hatchKick ?? 0;
        this.kv = 0;
      } else if (e.type === 'spawn' && !events.some((o) => o.type === 'fallReturn')) {
        // A restart, a room restart or a teleport: the beats start over (a fall's return keeps them).
        this.hatchFrame = null;
        this.ky = this.kv = 0;
      }
    }
  }

  /** Advances the kick by `dt` s and sets the offset for sim frame `frame` + `alpha`. */
  update(dt: number, frame: number, alpha: number): void {
    if (dt > 0 && (this.ky !== 0 || this.kv !== 0)) {
      const ex = Math.exp(-OMEGA * dt);
      const a = this.kv + OMEGA * this.ky;
      this.ky = (this.ky + a * dt) * ex;
      this.kv = a * ex - OMEGA * this.ky;
      if (Math.abs(this.ky) < 0.02 && Math.abs(this.kv) < 0.5) this.ky = this.kv = 0;
    }
    const lean = this.cfg.lean;
    const w =
      lean && this.hatchFrame !== null ? leanWeight(lean, (frame - 1 + alpha - this.hatchFrame) / 60) : 0;
    this.x = (lean?.x ?? 0) * w;
    this.y = (lean?.y ?? 0) * w + this.ky;
  }
}
