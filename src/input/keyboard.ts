import { ACTIONS, ActionBit, type InputFrame } from '../sim/input';
import type { Bindings } from './bindings';

/**
 * Tracks held keys. A key pressed and released between two samples still reads as held for one
 * sample, so quick taps are never lost at 60Hz.
 */
export class KeyboardSource {
  private held = new Set<string>();
  private tapped = new Set<string>();
  private readonly gameCodes: () => Set<string>;

  constructor(
    private readonly bindings: Bindings,
    target: Window = window,
  ) {
    this.gameCodes = () => new Set(Object.values(this.bindings.keys).flat());
    target.addEventListener('keydown', (e) => {
      // Typing in a text field (e.g. the Tweakpane tuning panel) must not drive the game.
      if (isEditable(e.target)) return;
      // Stop the page scrolling/tabbing on game keys (auto-repeats included).
      if (this.gameCodes().has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.held.add(e.code);
      this.tapped.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
    });
    target.addEventListener('blur', () => {
      this.held.clear();
      this.tapped.clear();
    });
  }

  sample(): InputFrame {
    let mask = 0;
    for (const a of ACTIONS) {
      for (const code of this.bindings.keys[a]) {
        if (this.held.has(code) || this.tapped.has(code)) {
          mask |= ActionBit[a];
          break;
        }
      }
    }
    this.tapped.clear();
    return mask;
  }
}

function isEditable(t: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}
