/**
 * The sim's input contract. One InputFrame (a bitmask of held actions) is consumed per sim step.
 * Devices (src/input) produce it; replays store it. Edge detection ("pressed this frame") and
 * input buffering are derived inside the sim from the previous frame's mask, so they replay exactly.
 */
export const ACTIONS = [
  'left',
  'right',
  'up',
  'down',
  'jump',
  'dash',
  'attack',
  'special',
  'map',
  'pause',
] as const;

export type Action = (typeof ACTIONS)[number];
export type InputFrame = number;

export const ActionBit: Record<Action, number> = Object.fromEntries(
  ACTIONS.map((a, i) => [a, 1 << i]),
) as Record<Action, number>;

export function maskOf(actions: readonly Action[]): InputFrame {
  let m = 0;
  for (const a of actions) m |= ActionBit[a];
  return m;
}

export function actionsOf(mask: InputFrame): Action[] {
  return ACTIONS.filter((a) => (mask & ActionBit[a]) !== 0);
}

export function isHeld(mask: InputFrame, a: Action): boolean {
  return (mask & ActionBit[a]) !== 0;
}

export function wasPressed(mask: InputFrame, prev: InputFrame, a: Action): boolean {
  const b = ActionBit[a];
  return (mask & b) !== 0 && (prev & b) === 0;
}

export function wasReleased(mask: InputFrame, prev: InputFrame, a: Action): boolean {
  const b = ActionBit[a];
  return (mask & b) === 0 && (prev & b) !== 0;
}

/** Horizontal axis from left/right: -1, 0 or 1 (both held = 0). */
export function axisX(mask: InputFrame): number {
  return (isHeld(mask, 'right') ? 1 : 0) - (isHeld(mask, 'left') ? 1 : 0);
}

/**
 * Input buffer counter: set to `frames` when triggered, otherwise counts down to 0.
 * `buffer > 0` means the action is still "live" (e.g. jump pressed just before landing).
 */
export function tickBuffer(buffer: number, triggered: boolean, frames: number): number {
  if (triggered) return frames;
  return buffer > 0 ? buffer - 1 : 0;
}
