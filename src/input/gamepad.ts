import { ACTIONS, ActionBit, type InputFrame } from '../sim/input';
import { type Bindings, PAD_STICK_DEADZONE } from './bindings';

/**
 * Button indices in DEFAULT_PAD follow the W3C "standard" gamepad layout. A pad the browser
 * reports with any other mapping ('' = unknown) has arbitrary button indices (e.g. some
 * Switch/DirectInput pads on Firefox or Safari), so reading buttons would fire the wrong actions.
 * Those pads only drive movement from the left stick until a remapping UI exists; a warning is
 * logged once per pad and __game.info().gamepads reports it.
 */
export function isStandardPad(pad: Pick<Gamepad, 'mapping'>): boolean {
  return pad.mapping === 'standard';
}

const warned = new Set<string>();

function warnOnce(pad: Gamepad): void {
  const key = `${pad.index}:${pad.id}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(
    `[input] Gamepad "${pad.id}" reports mapping "${pad.mapping || 'unknown'}", not "standard": buttons are ignored (layout unknown), left stick still moves.`,
  );
}

function connectedPads(): Gamepad[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return navigator.getGamepads().filter((p): p is Gamepad => !!p?.connected);
}

/** Connected pads and whether their buttons are usable (for __game.info()). */
export function padReport(): { id: string; mapping: string; buttonsUsable: boolean }[] {
  return connectedPads().map((p) => ({ id: p.id, mapping: p.mapping, buttonsUsable: isStandardPad(p) }));
}

/** Polls every connected gamepad and ORs them together. */
export class GamepadSource {
  constructor(private readonly bindings: Bindings) {}

  sample(): InputFrame {
    let mask = 0;
    for (const pad of connectedPads()) {
      if (isStandardPad(pad)) {
        for (const a of ACTIONS) {
          for (const i of this.bindings.pad[a]) {
            if (pad.buttons[i]?.pressed) {
              mask |= ActionBit[a];
              break;
            }
          }
        }
      } else warnOnce(pad);
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
