import type { Action } from '../sim/input';

/**
 * Default device bindings. Keyboard uses KeyboardEvent.code (layout-independent).
 * Gamepad uses the W3C "standard" mapping button indices.
 */
export type KeyBindings = Record<Action, string[]>;
export type PadBindings = Record<Action, number[]>;

export const DEFAULT_KEYS: KeyBindings = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyZ', 'KeyK'],
  dash: ['KeyX', 'KeyL', 'ShiftLeft', 'ShiftRight'],
  attack: ['KeyC', 'KeyJ'],
  // Offer (give a glint, the test grove's only): F as the usual "use" key.
  offer: ['KeyF'],
  // Lamp (the fling): V beside the C of the cut on the left hand, I over J on the right.
  lamp: ['KeyV', 'KeyI'],
};

export const DEFAULT_PAD: PadBindings = {
  left: [14],
  right: [15],
  up: [12],
  down: [13],
  jump: [0], // A / Cross
  dash: [5, 7], // RB, RT
  attack: [2], // X / Square
  offer: [1], // B / Circle (the test grove's only)
  lamp: [3, 4], // Y / Triangle, LB
};

/** Stick: a 0.25 radial deadzone, then an axis counts as a direction past 0.5. */
export const PAD_STICK_RADIAL_DEADZONE = 0.25;
export const PAD_STICK_AXIS_THRESHOLD = 0.5;

export interface Bindings {
  keys: KeyBindings;
  pad: PadBindings;
}

export function defaultBindings(): Bindings {
  return { keys: structuredClone(DEFAULT_KEYS), pad: structuredClone(DEFAULT_PAD) };
}

/**
 * Remapping stub: replaces the keys for one action. A remapping UI and persistence
 * (localStorage) come later; nothing else needs to change because sources read `bindings` live.
 */
export function remapKey(bindings: Bindings, action: Action, codes: string[]): void {
  bindings.keys[action] = [...codes];
}

export function remapPad(bindings: Bindings, action: Action, buttons: number[]): void {
  bindings.pad[action] = [...buttons];
}
