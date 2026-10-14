/**
 * The sanctuary round a lit lantern (memory/goal.md): creatures keep out of it, and one caught
 * inside is harmless. A lit wayside lamp has one too, but a small one, and only while she is AT
 * the lamp (her box in its trigger box): it covers the spot she stands on and no more (`waysidePx`,
 * `waysideWingPx`), so a lamp beside a fight is a rest point and not a wall inside the fight: with
 * her away from it creatures walk, ram and brace through its light as if it were dark. Pure
 * geometry over `state.goal`, `state.player`, `scene.lanterns` and `scene.lamps`; no allocation.
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

/** Is her box in the trigger box of the light whose foot is (lx, ly)? (On the ground or in a hop on the spot.) */
function herAt(state: GameState, G: Tuning['goal'], lx: number, ly: number): boolean {
  const p = state.player;
  const half = G.lanternWidth / 2;
  return p.x < lx + half && lx - half < p.x + p.w && p.y < ly && ly - G.lanternHeight < p.y + p.h;
}

/**
 * A ground creature (box x0..x1, feet at `bottom`): how deep it stands in the sanctuary of a lit
 * lantern on its own ground, or of a lit lamp there that she is at (px inside its edge, the deepest
 * of them), 0 if it is in none.
 */
export function groundSanctuaryDepth(
  state: GameState,
  scene: Scene,
  G: Tuning['goal'],
  x0: number,
  x1: number,
  bottom: number,
): number {
  let best = 0;
  for (let k = 0; k < 2; k++) {
    const list = k === 0 ? scene.lanterns : scene.lamps;
    const lights = k === 0 ? state.goal.lanterns : state.goal.lamps;
    const reach = k === 0 ? G.sanctuaryPx : G.waysidePx;
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (!l || !lights[i]?.lit || !onLevel(l.y, bottom)) continue;
      if (k === 1 && !herAt(state, G, l.x, l.y)) continue;
      const d = reach - gapX(x0, x1, l.x);
      if (d > best) best = d;
    }
  }
  return best;
}

/**
 * Is the point inside a lit light's circle for flyers: within `lampSanctuaryPx` of the centre of a
 * lit lantern's box, or `waysideWingPx` of a lit lamp's that she is at?
 */
export function nearLitLantern(
  state: GameState,
  scene: Scene,
  G: Tuning['goal'],
  x: number,
  y: number,
): boolean {
  for (let k = 0; k < 2; k++) {
    const list = k === 0 ? scene.lanterns : scene.lamps;
    const lights = k === 0 ? state.goal.lanterns : state.goal.lamps;
    const px = k === 0 ? G.lampSanctuaryPx : G.waysideWingPx;
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (!l || !lights[i]?.lit) continue;
      if (k === 1 && !herAt(state, G, l.x, l.y)) continue;
      const dx = x - l.x;
      const dy = y - (l.y - G.lanternHeight / 2);
      if (dx * dx + dy * dy <= px * px) return true;
    }
  }
  return false;
}
