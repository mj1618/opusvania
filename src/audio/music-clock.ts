/**
 * Bar/beat maths for the music director (pure). Times are AudioContext seconds; `origin` is the
 * context time of bar 0, beat 0.
 */

export interface Meter {
  bpm: number;
  beatsPerBar: number;
  /** Sequencer steps per beat (4 = sixteenth notes). */
  stepsPerBeat: number;
}

export const beatSeconds = (m: Meter): number => 60 / m.bpm;
export const barSeconds = (m: Meter): number => beatSeconds(m) * m.beatsPerBar;
export const stepSeconds = (m: Meter): number => beatSeconds(m) / m.stepsPerBeat;
export const stepsPerBar = (m: Meter): number => m.beatsPerBar * m.stepsPerBeat;

/** Fractional bar position at time t (negative before the origin). */
export function barPosition(t: number, origin: number, m: Meter): number {
  return (t - origin) / barSeconds(m);
}

/** Index of the bar that contains time t. */
export function barIndexAt(t: number, origin: number, m: Meter): number {
  return Math.floor(barPosition(t, origin, m) + 1e-9);
}

/**
 * Time of the first bar line at or after `now + minLead`. `minLead` stops a change from landing
 * on a bar line that is too close to schedule cleanly (it rolls to the next bar instead).
 */
export function nextBarTime(now: number, origin: number, m: Meter, minLead = 0): number {
  const bar = barSeconds(m);
  const target = now + minLead;
  if (target <= origin) return origin;
  const k = Math.ceil((target - origin) / bar - 1e-9);
  return origin + k * bar;
}

/**
 * Sequencer steps whose start time falls in [from, to). Returns absolute step indices (from the
 * origin) with their times. The lookahead scheduler calls this with a moving window, and because
 * the window is half-open no step is scheduled twice or skipped.
 */
export function stepsInWindow(
  from: number,
  to: number,
  origin: number,
  m: Meter,
): { index: number; time: number }[] {
  const dt = stepSeconds(m);
  const out: { index: number; time: number }[] = [];
  let i = Math.max(0, Math.ceil((from - origin) / dt - 1e-9));
  for (let t = origin + i * dt; t < to - 1e-9; i++, t = origin + i * dt) out.push({ index: i, time: t });
  return out;
}
