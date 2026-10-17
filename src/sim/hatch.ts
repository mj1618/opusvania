import type { SimEvent } from './events';
import type { InputFrame } from './input';
import type { Scene } from './scene';
import type { GameState, HatchState } from './state';
import type { Tuning } from './tuning';

/**
 * The hatching (scene 1, docs/design/scenes/01-hatching-branch.md): a room with `scene.hatch` starts
 * with her shut in her cocoon. Her body already stands at the spawn on the branch, but no input
 * moves her. Presses of any button (a bit of the input that was not held the step before) stir the
 * cocoon, counted from `tuning.hatch.listenFrom` on (the picture is still fading up before that);
 * the `presses`-th breaks it. With no input it stirs on its own and breaks after `autoFrames`.
 * Render (the acting) draws the cocoon from `state.hatch` and these events; she is hidden until `hatch`.
 */

export function createHatch(scene: Scene): HatchState | null {
  return scene.hatch ? { frames: 0, presses: 0, done: false } : null;
}

/**
 * One step of the hatching. Returns true while she is shut in, including the step she breaks out on
 * (the caller gives her no input then: the press that breaks the cocoon is not also a jump).
 * `input` / `prev`: this step's and the last step's input, for presses.
 */
export function updateHatch(
  state: GameState,
  scene: Scene,
  input: InputFrame,
  prev: InputFrame,
  t: Tuning,
  events: SimEvent[],
): boolean {
  const h = state.hatch;
  const at = scene.hatch;
  if (!h || h.done || !at) return false;
  const H = t.hatch;
  const need = Math.max(1, Math.round(H.presses));
  const auto = Math.max(1, Math.round(H.autoFrames));
  h.frames++;
  const press = (input & ~prev) !== 0 && h.frames > H.listenFrom;
  const p = state.player;
  const x = p.x + p.w / 2;
  const y = p.y + p.h;
  if (press) {
    h.presses++;
    events.push({ type: 'hatchStir', x, y, auto: false, presses: h.presses, of: need, frames: h.frames });
  } else if (
    h.frames >= H.autoStirFrom &&
    h.frames < auto &&
    (h.frames - H.autoStirFrom) % Math.max(1, Math.round(H.autoStirEvery)) === 0
  ) {
    events.push({ type: 'hatchStir', x, y, auto: true, presses: h.presses, of: need, frames: h.frames });
  }
  if (h.presses >= need || h.frames >= auto) {
    h.done = true;
    events.push({ type: 'hatch', x, y, cx: at.x, cy: at.y, auto: h.presses < need, frames: h.frames });
  }
  return true;
}
