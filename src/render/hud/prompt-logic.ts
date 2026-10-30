/**
 * The prompts' pure rules (prompts.ts draws them): which lesson needs which ability, and how a cap's strength
 * moves frame to frame. Pure so a test can drive the sim and check what a player would have seen.
 */
import type { AbilityId } from '../../sim/abilities';

export type Lesson = 'glide' | 'kick' | 'offer' | 'fling';

/** The ability a lesson teaches (null: the starting kit; the fling is the Lamp, always hers). */
export const LESSON_NEEDS: Record<Lesson, AbilityId | null> = {
  glide: 'glide',
  kick: 'wallJump',
  offer: null,
  fling: null,
};

/** She owns what the lesson teaches (review r9 #1: the glide's cap showed in the hatch with nothing owned). */
export function owns(abilities: readonly string[], lesson: Lesson): boolean {
  const need = LESSON_NEEDS[lesson];
  return need === null || abilities.includes(need);
}

/**
 * A cap's strength (0..1) after `dt` seconds: up over `fadeIn` s while `on` (0 = full at once), down over `fadeOut`.
 */
export function fadeStep(
  alpha: number,
  on: boolean,
  dt: number,
  time: { fadeIn: number; fadeOut: number },
): number {
  if (on) return time.fadeIn <= 0 ? 1 : Math.min(1, alpha + dt / time.fadeIn);
  return Math.max(0, alpha - dt / time.fadeOut);
}
