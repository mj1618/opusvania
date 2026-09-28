import { Pane } from 'tweakpane';
import { cloneTuning, defaultTuning, type Tuning } from '../sim/tuning';

/** Values that can't change live without breaking things (they need a rebuild or respawn). */
const READONLY = new Set(['world.tileSize']);

/**
 * Tweakpane panel bound to the live tuning object. Hidden by default; toggle with backquote.
 * "Copy JSON" copies the current values so they can be written back into src/sim/tuning.ts.
 */
export class TuningPanel {
  private readonly pane: Pane;

  constructor(tuning: Tuning, onRespawn: () => void) {
    this.pane = new Pane({ title: 'Tuning  ( ` to hide )' });
    this.pane.hidden = true;
    const root = tuning as unknown as Record<string, Record<string, number>>;
    for (const [group, values] of Object.entries(root)) {
      const folder = this.pane.addFolder({ title: group });
      for (const [key, v] of Object.entries(values)) {
        const readonly = READONLY.has(`${group}.${key}`);
        folder.addBinding(values, key, {
          readonly,
          min: 0,
          max: Math.max(1, Math.abs(v) * 4),
          step: Number.isInteger(v) ? 1 : 0.01,
        });
      }
    }
    this.pane.addButton({ title: 'Respawn (applies size changes)' }).on('click', onRespawn);
    this.pane.addButton({ title: 'Copy JSON' }).on('click', () => {
      void navigator.clipboard?.writeText(JSON.stringify(tuning, null, 2));
    });
    this.pane.addButton({ title: 'Reset to defaults' }).on('click', () => {
      const d = cloneTuning(defaultTuning) as unknown as Record<string, Record<string, number>>;
      for (const group of Object.keys(root)) Object.assign(root[group] ?? {}, d[group]);
      this.pane.refresh();
    });
  }

  /** Re-reads the tuning object (after it was changed from code, e.g. replay playback). */
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
