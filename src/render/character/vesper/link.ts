/**
 * The hand-off between Vesper and the goal renderer (src/render/goal/), which is updated after her
 * each frame. A skin only gets the player and the events, so the goal renderer leaves the goal
 * state and where each lantern's glass hangs here for her acting (she reads them one render frame
 * late), and she leaves the point the light leaves her from: her open palm while she kindles, her
 * chest otherwise. `live` is false while another skin is on: the goal renderer then uses its own point.
 */
import type { GoalState } from '../../../sim/state';

export const vesperLink = {
  live: false,
  /** Where glints leave her and light arrives in her, world px. */
  offerX: 0,
  offerY: 0,
  goal: null as GoalState | null,
  /** The glass of lantern i: x at [i * 2], y at [i * 2 + 1], world px. */
  beads: [] as number[],
  /** The prologue's cues (render/prologue/grove.ts): 0..1 she holds a glint to her face; 0..1 she looks past it; 0..1 she shakes out her wings. */
  cine: { hold: 0, look: 0, shake: 0 },
};
