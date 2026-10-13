/**
 * The sanctuary round a lit lantern (memory/goal.md): creatures keep out of it, and one caught
 * inside is harmless. Wayside lamps count like lanterns. Pure geometry over `state.goal`,
 * `scene.lanterns` and `scene.lamps`; no allocation.
 */
import type { Scene } from './scene';
import type { GameState } from './state';
import type { Tuning } from './tuning';

/** Horizontal gap between the span [x0, x1) and the point x (0 when it is inside). */
const gapX = (x0: number, x1: number, x: number): number => (x < x0 ? x0 - x : x > x1 ? x - x1 : 0);

/** A lit lantern stands on the ground whose top is `bottom` (the feet line of a ground creature). */
function onLevel(ly: number, bottom: number): boolean {
  return ly === bottom;
}

/**
 * A ground creature (box x0..x1, feet at `bottom`): its gap to the nearest lit lantern or lamp on
 * its own ground, or -1 if there is none.
 */
export function groundSanctuaryGap(
  state: GameState,
  scene: Scene,
  x0: number,
  x1: number,
  bottom: number,
): number {
  let best = -1;
  for (let k = 0; k < 2; k++) {
    const list = k === 0 ? scene.lanterns : scene.lamps;
    const lights = k === 0 ? state.goal.lanterns : state.goal.lamps;
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (!l || !lights[i]?.lit || !onLevel(l.y, bottom)) continue;
      const g = gapX(x0, x1, l.x);
      if (best < 0 || g < best) best = g;
    }
  }
  return best;
}

/** Is the point within `px` of the centre of a lit lantern's (or lamp's) box? */
export function nearLitLantern(
  state: GameState,
  scene: Scene,
  G: Tuning['goal'],
  x: number,
  y: number,
  px: number,
): boolean {
  for (let k = 0; k < 2; k++) {
    const list = k === 0 ? scene.lanterns : scene.lamps;
    const lights = k === 0 ? state.goal.lanterns : state.goal.lamps;
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (!l || !lights[i]?.lit) continue;
      const dx = x - l.x;
      const dy = y - (l.y - G.lanternHeight / 2);
      if (dx * dx + dy * dy <= px * px) return true;
    }
  }
  return false;
}
