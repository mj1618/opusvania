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
      for (const a of ACTIONS) {
        for (const i of this.bindings.pad[a]) {
          if (pad.buttons[i]?.pressed) {
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
