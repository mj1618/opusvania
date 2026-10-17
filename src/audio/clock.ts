/**
 * The Hush's one slow, exact clock, from the sim frame alone (pure: render can later make root
 * steam and veins breathe in time with it).
 */
import { HUSH } from './tuning';

export interface HushPhase {
  /** 0..1 through one pulse; the swell peaks (and the knock falls) at 0. */
  pulse: number;
  /** Which pulse this is (alternates the knock left, right). */
  beat: number;
  /** The swell of the two beating tones, 0..1 (cos^2: no envelope to click). */
  swell: number;
  /** 0..1 through one breath: 0..0.5 in, 0.5..1 out. */
  breath: number;
  /** How loud the breath is now, 0..1: one swell in, one out. */
  air: number;
  /** 0 = oo, 1 = aa: in-breath opens, out-breath closes. */
  vowel: number;
}

/** Sim frames per second (the sim runs at a fixed 60 Hz). */
export const FPS = 60;
export const PULSE_FRAMES = Math.round(HUSH.pulseS * FPS);
export const BREATH_FRAMES = Math.round(HUSH.breathS * FPS);

export function hushPhase(frame: number): HushPhase {
  const f = Math.max(0, frame);
  const beat = Math.floor(f / PULSE_FRAMES);
  const pulse = (f % PULSE_FRAMES) / PULSE_FRAMES;
  const swell = Math.cos(Math.PI * pulse) ** 2;
  const breath = (f % BREATH_FRAMES) / BREATH_FRAMES;
  const half = (breath * 2) % 1;
  const air = Math.sin(Math.PI * half) ** 1.5;
  const vowel = breath < 0.5 ? half : 1 - half;
  return { pulse, beat, swell, breath, air, vowel };
}

/** Is this frame the top of a swell (where the knock falls)? */
export function isKnock(frame: number): boolean {
  return frame > 0 && frame % PULSE_FRAMES === 0;
}
