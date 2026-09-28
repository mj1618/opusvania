import type { InputFrame } from '../sim/input';
import { type Bindings, defaultBindings } from './bindings';
import { GamepadSource } from './gamepad';
import { KeyboardSource } from './keyboard';

/** Combines all devices into one InputFrame. Call sample() exactly once per sim step. */
export class InputSampler {
  readonly bindings: Bindings;
  private readonly keyboard: KeyboardSource;
  private readonly gamepad: GamepadSource;

  constructor(bindings: Bindings = defaultBindings()) {
    this.bindings = bindings;
    this.keyboard = new KeyboardSource(bindings);
    this.gamepad = new GamepadSource(bindings);
  }

  sample(): InputFrame {
    return this.keyboard.sample() | this.gamepad.sample();
  }

  /** Drops pending taps. Call while the sim isn't consuming live input, so they don't fire later. */
  flush(): void {
    this.keyboard.sample();
  }
}
