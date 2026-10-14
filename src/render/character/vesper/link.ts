/**
 * The hand-off between Vesper and the goal renderer (src/render/goal/), which is updated after her
 * each frame. A skin only gets the player and the events, so the goal renderer leaves the goal
 * state and where each lantern's glass hangs here for her acting (she reads them one render frame
 * late), and she leaves the point the light leaves her from: her open palm while she kindles, her
 * chest otherwise. `live` is false while another skin is on: the goal renderer then uses its own point.
 */
import type { GoalState } from '../../../sim/state';

/**
 * Acting cues for a staged scene (the prologue), each 0..1: `hold` a glint up to the face (no
 * mouth: it can only be held); `look` past it, out ahead; `shake` the wings out like a cape;
 * `fold` a wing folded over something beside (another moth, a case, a held glint); `huddle` down in
 * the cold, wings stuck shut, shivering, eyes dim; `tap` a wingtip touched to another's; `lookUp`
 * the head lifted to something high.
 */
export interface CineCues {
  hold: number;
  look: number;
  shake: number;
  fold: number;
  huddle: number;
  tap: number;
  lookUp: number;
}

export function newCues(): CineCues {
  return { hold: 0, look: 0, shake: 0, fold: 0, huddle: 0, tap: 0, lookUp: 0 };
}

export const vesperLink = {
  live: false,
  /** Where glints leave her and light arrives in her, world px. */
  offerX: 0,
  offerY: 0,
  goal: null as GoalState | null,
  /** The glass of lantern i: x at [i * 2], y at [i * 2 + 1], world px. */
  beads: [] as number[],
  /** The prologue's cues for the player's own skin (render/prologue): see `CineCues`. */
  cine: newCues(),
};
