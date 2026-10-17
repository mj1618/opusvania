/**
 * A room's scripted camera beats (`room.camera`, src/scene/room.ts), render-side like the kick: an
 * offset added to the view at draw time; the follow camera never sees it.
 *
 *  - `hatchFrame`: while she is shut in the cocoon (`state.hatch`) the view sits `y` px lower, so the
 *    cocoon under the branch is framed higher (the birth reads); after the `hatch` event it holds `hold`
 *    s, then eases back over `out` s. It yields to the run like the lean.
 *  - `hatchKick`: on the sim's `hatch` event the view is shoved down this many px and comes back on a
 *    critically damped spring (`OMEGA`: settled in ~0.3 s), the burst of the cocoon.
 *  - `lean`: timed in SIM seconds since the `hatch` event, the view eases toward (`x`, `y`) from `from`
 *    over `in`, holds `hold`, eases back over `out`: the swarm's pass over the moon (the swarm's
 *    `SWARM_PASS`). It only holds while she stands or walks slowly: once she runs it yields
 *    (`YIELD_OUT`), so a runner keeps the run's framing, and it comes back if she stops (`YIELD_IN`).
 * A restart, a room restart or a teleport ends them. The fade up from black (`fadeIn`) is room-fade.ts's.
 */
import type { RoomCamera } from '../../scene/room';
import type { SimEvent } from '../../sim/events';
import type { HatchState } from '../../sim/state';

/** The kick's spring, rad/s: back home (to within 5%) in about 0.3 s. */
const OMEGA = 16;
/** Slower than this (px per sim frame) on the ground, or shut in: she is looking, the beats may hold. */
const SLOW_VX = 2.5;
/** Seconds for the beats to give way once she runs, and to come back once she stops. */
const YIELD_OUT = 0.35;
const YIELD_IN = 0.9;

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

/** 0..1: the hatch framing `t` seconds after the hatch (1 before it). */
export function hatchFrameWeight(hf: NonNullable<RoomCamera['hatchFrame']>, t: number): number {
  return 1 - smoother((t - hf.hold) / hf.out);
}

/** What the beats read of the sim each render frame. */
export interface BeatsInput {
  hatch: HatchState | null;
  vx: number;
  grounded: boolean;
}

export class CameraBeats {
  /** Offset to add to the view centre, world px. */
  x = 0;
  y = 0;
  /** 0..1: how much she is standing and looking (the beats hold at 1, give way at 0). */
  still = 1;
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
        this.still = 1;
      }
    }
  }

  /** Advances by `dt` s and sets the offset for sim frame `frame` + `alpha`. */
  update(dt: number, frame: number, alpha: number, s: BeatsInput): void {
    if (dt > 0 && (this.ky !== 0 || this.kv !== 0)) {
      const ex = Math.exp(-OMEGA * dt);
      const a = this.kv + OMEGA * this.ky;
      this.ky = (this.ky + a * dt) * ex;
      this.kv = a * ex - OMEGA * this.ky;
      if (Math.abs(this.ky) < 0.02 && Math.abs(this.kv) < 0.5) this.ky = this.kv = 0;
    }
    const shut = s.hatch !== null && !s.hatch.done;
    const slow = shut || (s.grounded && Math.abs(s.vx) < SLOW_VX);
    if (dt > 0) {
      const rate = dt / (slow ? YIELD_IN : YIELD_OUT);
      this.still = slow ? Math.min(1, this.still + rate) : Math.max(0, this.still - rate);
    }
    const yieldK = smoother(this.still);
    const t = this.hatchFrame !== null ? (frame - 1 + alpha - this.hatchFrame) / 60 : 0;
    const lean = this.cfg.lean;
    const w = lean && this.hatchFrame !== null ? leanWeight(lean, t) * yieldK : 0;
    const hf = this.cfg.hatchFrame;
    // Shut in (or the room's hatching not seen yet, e.g. a teleport ended it: then nothing).
    const h = hf ? (shut ? 1 : this.hatchFrame !== null ? hatchFrameWeight(hf, t) * yieldK : 0) : 0;
    this.x = (lean?.x ?? 0) * w;
    this.y = (lean?.y ?? 0) * w + (hf?.y ?? 0) * h + this.ky;
  }
}
