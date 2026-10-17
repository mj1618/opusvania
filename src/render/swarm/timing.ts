/**
 * The swarm's timing for other renderers (memory/swarm.md "Timing API"): pure functions of the
 * seconds since the sim's `hatch` event, so the camera can lean toward the pass and Tatter can watch
 * it without reading the swarm's state. No Pixi, no state.
 */
import type { Room } from '../../scene/room';
import { SWARM } from './config';

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The pass over the moon, in seconds since `hatch`: rises from `in` to `full`, holds to `hold`, gone by
 * `out`. The swarm's head comes into view (frame left) at `SWARM.delay`.
 */
export const SWARM_PASS: Readonly<{ in: number; full: number; hold: number; out: number }> = SWARM.pass;

/** 0..1: how much the river's pass over the moon holds the eye now (a smooth plateau). */
export function swarmPassWeight(sinceHatch: number): number {
  const p = SWARM.pass;
  return smooth(p.in, p.full, sinceHatch) * (1 - smooth(p.hold, p.out, sinceHatch));
}

/**
 * Where the pass is densest: the room's moon, in logical view coordinates (the safe area is
 * 0..1920 x 0..1080; the sky keeps the moon nearly screen-fixed). Null in a room without a moon.
 */
export function swarmPassFocus(room: Room): { x: number; y: number } | null {
  const m = room.art?.moon;
  return m && room.marks?.swarm ? { x: m.x, y: m.y } : null;
}
