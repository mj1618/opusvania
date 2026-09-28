/**
 * Fixed-timestep accumulator (Glenn Fiedler, "Fix Your Timestep"). Feed it real elapsed time;
 * it says how many sim steps to run and the interpolation alpha for rendering.
 *
 * Vsync snapping (Tyler Glaiel, "How to make your game run at 60fps"): rAF deltas on a 60Hz
 * display jitter around 16.67ms (16.5, 16.9, 17, 16.3...; Firefox/Safari clamp timers to 1ms).
 * Fed raw, the accumulator sometimes crosses a step boundary twice in one frame and zero times in
 * the next, so the game visibly stutters (0/2-step jitter) even though the average is right.
 * So a delta within `snapMs` of a whole number of steps (or half a step, for 120Hz) is treated as
 * exactly that. On a display that is really 59.94Hz or 60.2Hz the sim then runs ~0.3% off wall
 * time, which nobody can see; deltas outside the tolerance (144Hz, 75Hz, dropped frames) pass
 * through unchanged. See memory/loop-timing.md.
 */
export const DEFAULT_SNAP_MS = 0.5;
/** Multiples of the step that deltas snap to: 120Hz, 60Hz, 30Hz, 20Hz, 15Hz. */
const SNAP_MULTIPLES = [0.5, 1, 2, 3, 4];
/** Guards floor() against 0.9999999 when a snapped delta lands exactly on a boundary. */
const EPS = 1e-6;

export class FixedStepLoop {
  private acc = 0;

  constructor(
    readonly stepMs: number = 1000 / 60,
    /** Cap on steps per frame so a long stall (tab hidden, breakpoint) can't spiral. */
    readonly maxSteps: number = 5,
    /** Snap tolerance in ms; 0 disables snapping. */
    readonly snapMs: number = DEFAULT_SNAP_MS,
  ) {}

  /** The delta after vsync snapping. */
  snap(elapsedMs: number): number {
    const dt = Math.max(0, elapsedMs);
    if (this.snapMs <= 0) return dt;
    for (const k of SNAP_MULTIPLES) {
      const target = k * this.stepMs;
      if (Math.abs(dt - target) < this.snapMs) return target;
    }
    return dt;
  }

  /** Adds elapsed wall time and returns the number of whole steps to run now. */
  advance(elapsedMs: number): number {
    this.acc += this.snap(elapsedMs);
    let steps = Math.floor(this.acc / this.stepMs + EPS);
    if (steps > this.maxSteps) {
      steps = this.maxSteps;
      this.acc = 0;
    } else {
      this.acc = Math.max(0, this.acc - steps * this.stepMs);
    }
    return steps;
  }

  /** How far we are between the previous and current sim state, in [0, 1). */
  get alpha(): number {
    return Math.min(this.acc / this.stepMs, 1 - EPS);
  }

  reset(): void {
    this.acc = 0;
  }
}
