/**
 * Fixed-timestep accumulator (Glenn Fiedler, "Fix Your Timestep"). Feed it real elapsed time;
 * it says how many sim steps to run and the interpolation alpha for rendering.
 */
export class FixedStepLoop {
  private acc = 0;

  constructor(
    readonly stepMs: number = 1000 / 60,
    /** Cap on steps per frame so a long stall (tab hidden, breakpoint) can't spiral. */
    readonly maxSteps: number = 5,
  ) {}

  /** Adds elapsed wall time and returns the number of whole steps to run now. */
  advance(elapsedMs: number): number {
    this.acc += Math.max(0, elapsedMs);
    let steps = Math.floor(this.acc / this.stepMs);
    if (steps > this.maxSteps) {
      steps = this.maxSteps;
      this.acc = 0;
    } else {
      this.acc -= steps * this.stepMs;
    }
    return steps;
  }

  /** How far we are between the previous and current sim state, in [0, 1). */
  get alpha(): number {
    return this.acc / this.stepMs;
  }

  reset(): void {
    this.acc = 0;
  }
}
