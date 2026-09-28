import { ACTIONS, ActionBit, type InputFrame } from '../sim/input';
import { type Bindings, PAD_STICK_DEADZONE } from './bindings';

/** Polls every connected standard-mapping gamepad and ORs them together. */
export class GamepadSource {
  constructor(private readonly bindings: Bindings) {}

  sample(): InputFrame {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return 0;
    let mask = 0;
    for (const pad of navigator.getGamepads()) {
      if (!pad?.connected) continue;
      const buttonsUsable = checkMapping(pad);
      for (const a of ACTIONS) {
        for (const i of this.bindings.pad[a]) {
          if (buttonsUsable && pad.buttons[i]?.pressed) {
            mask |= ActionBit[a];
            break;
          }
        }
      }
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      if (x < -PAD_STICK_DEADZONE) mask |= ActionBit.left;
      if (x > PAD_STICK_DEADZONE) mask |= ActionBit.right;
      if (y < -PAD_STICK_DEADZONE) mask |= ActionBit.up;
      if (y > PAD_STICK_DEADZONE) mask |= ActionBit.down;
    }
    return mask;
  }
}

/*
 * Standard-mapping check. Button indices in DEFAULT_PAD follow the W3C "standard" layout. A pad the
 * browser reports with any other mapping ('' = unknown; e.g. some Switch/DirectInput pads on
 * Firefox or Safari) has arbitrary indices, so its buttons would fire the wrong actions. Such pads
 * only drive movement from the left stick until a remapping UI exists; a warning is logged once
 * per pad and __game.info().gamepads reports it.
 */
export function isStandardPad(pad: Pick<Gamepad, 'mapping'>): boolean {
  return pad.mapping === 'standard';
}

const warnedPads = new Set<string>();

/** True if the pad's buttons can be read with DEFAULT_PAD indices; warns once otherwise. */
function checkMapping(pad: Gamepad): boolean {
  if (isStandardPad(pad)) return true;
  const key = `${pad.index}:${pad.id}`;
  if (!warnedPads.has(key)) {
    warnedPads.add(key);
    console.warn(
      `[input] Gamepad "${pad.id}" reports mapping "${pad.mapping || 'unknown'}", not "standard": buttons are ignored (layout unknown), the left stick still moves.`,
    );
  }
  return false;
}

/** Connected pads and whether their buttons are usable (for __game.info()). */
export function padReport(): { id: string; mapping: string; buttonsUsable: boolean }[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return navigator
    .getGamepads()
    .filter((p): p is Gamepad => !!p?.connected)
    .map((p) => ({ id: p.id, mapping: p.mapping, buttonsUsable: isStandardPad(p) }));
}
