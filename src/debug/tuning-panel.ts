import { Pane } from 'tweakpane';
import { applyShape, assignTuning, cloneTuning, defaultTuning, type Tuning } from '../sim/tuning';

const OPTIONS: Record<string, Record<string, string>> = {
  'jump.releaseMode': { gravity: 'gravity', zero: 'zero' },
};

/**
 * Tweakpane panel bound to the live tuning object. Hidden by default; toggle with backquote.
 * Shape edits re-derive the jump constants. "Copy JSON" copies the current values so they can be
 * written back into src/sim/tuning.ts.
 */
export class TuningPanel {
  private readonly pane: Pane;

  constructor(tuning: Tuning, onRespawn: () => void) {
    this.pane = new Pane({ title: 'Tuning  ( ` to hide )' });
    this.pane.hidden = true;
    const root = tuning as unknown as Record<string, Record<string, unknown>>;
    for (const [group, values] of Object.entries(root)) {
      const folder = this.pane.addFolder({ title: group, expanded: group === 'shape' });
      for (const [key, v] of Object.entries(values)) {
        if (typeof v === 'string') folder.addBinding(values, key, { options: OPTIONS[`${group}.${key}`] });
        // No min/max and no step: Tweakpane snaps bound numbers to its range and step grid on
        // refresh, silently rewriting values set from code.
        else if (typeof v === 'boolean' || typeof v === 'number') folder.addBinding(values, key);
      }
      if (group === 'shape')
        folder.on('change', () => {
          applyShape(tuning);
          this.pane.refresh();
        });
    }
    this.pane.addButton({ title: 'Respawn (applies body size)' }).on('click', onRespawn);
    this.pane.addButton({ title: 'Copy JSON' }).on('click', () => {
      void navigator.clipboard?.writeText(JSON.stringify(tuning, null, 2));
    });
    this.pane.addButton({ title: 'Reset to defaults' }).on('click', () => {
      assignTuning(tuning, cloneTuning(defaultTuning));
      this.pane.refresh();
    });
  }

  /** Re-reads the tuning object (after it was changed from code). */
  refresh(): void {
    this.pane.refresh();
  }

  get visible(): boolean {
    return !this.pane.hidden;
  }

  toggle(on = !this.visible): boolean {
    this.pane.hidden = !on;
    return on;
  }
}
