import { ACTIONS, ActionBit, type InputFrame } from '../sim/input';
import { type Bindings, PAD_STICK_AXIS_THRESHOLD, PAD_STICK_RADIAL_DEADZONE } from './bindings';

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
      if (Math.hypot(x, y) < PAD_STICK_RADIAL_DEADZONE) continue;
      const th = PAD_STICK_AXIS_THRESHOLD;
      if (x < -th) mask |= ActionBit.left;
      if (x > th) mask |= ActionBit.right;
      if (y < -th) mask |= ActionBit.up;
      if (y > th) mask |= ActionBit.down;
    }
    return mask;
  }
}
