import { Pane } from 'tweakpane';
import {
  applyPreset,
  applyShape,
  cloneTuning,
  defaultTuning,
  PRESET_NAMES,
  type PresetName,
  type Tuning,
  VALUE_GROUPS,
} from '../sim/tuning';

/** Values that can't change live without breaking things (they need a rebuild or respawn). */
const READONLY = new Set(['world.tileSize', 'world.minRoomW', 'world.minRoomH']);
const OPTIONS: Record<string, Record<string, string>> = {
  'jump.releaseMode': { gravity: 'gravity', zero: 'zero' },
};

export interface TuningPanelHooks {
  onRespawn(): void;
  /** Switch the player's movement profile. */
  onProfile(name: string): void;
  profiles(): string[];
  currentProfile(): string;
}

/**
 * Tweakpane panel bound to the live tuning object. Hidden by default; toggle with backquote.
 * Presets and assists switch live; shape edits re-derive the jump constants. "Copy JSON" copies
 * the current values so they can be written back into src/sim/tuning.ts.
 *
 * Blind A/B (spec §3.3): pick two presets for slots 1 and 2; the B key swaps between them and the
 * HUD only shows the slot number (the mapping is logged to the console for later reveal).
 */
export class TuningPanel {
  private readonly pane: Pane;
  readonly ab = { slot1: 'opus' as PresetName, slot2: 'celeste' as PresetName, active: 0 };
  readonly ui = { preset: 'opus' as PresetName, profile: 'base' };

  constructor(
    private readonly tuning: Tuning,
    private readonly hooks: TuningPanelHooks,
  ) {
    this.pane = new Pane({ title: 'Tuning  ( ` to hide )' });
    this.pane.hidden = true;
    const presetOpts = Object.fromEntries(PRESET_NAMES.map((n) => [n, n]));

    const top = this.pane.addFolder({ title: 'presets & profile' });
    top
      .addBinding(this.ui, 'preset', { options: presetOpts })
      .on('change', (ev) => this.applyPreset(ev.value as PresetName));
    top.addBinding(this.ab, 'slot1', { label: 'A/B slot 1', options: presetOpts });
    top.addBinding(this.ab, 'slot2', { label: 'A/B slot 2', options: presetOpts });
    const profOpts = () => Object.fromEntries(['base', ...hooks.profiles()].map((n) => [n, n]));
    top
      .addBinding(this.ui, 'profile', { label: 'player profile', options: profOpts() })
      .on('change', (ev) => hooks.onProfile(ev.value));

    const root = tuning as unknown as Record<string, Record<string, unknown>>;
    for (const group of VALUE_GROUPS) {
      const values = root[group];
      if (!values) continue;
      const folder = this.pane.addFolder({
        title: group,
        expanded: group === 'assists' || group === 'shape',
      });
      for (const [key, v] of Object.entries(values)) {
        const path = `${group}.${key}`;
        const readonly = READONLY.has(path);
        if (typeof v === 'boolean') folder.addBinding(values, key, { readonly });
        else if (typeof v === 'string')
          folder.addBinding(values, key, { options: OPTIONS[path] ?? { [v]: v } });
        else if (typeof v === 'number')
          // No min/max and no step: Tweakpane snaps bound values to its range and step grid on
          // refresh, silently rewriting presets (hk's 999 accelerations) and values set from
          // code (__game.setTuning('jump.gravity', 1234) read back as 1233.9967).
          folder.addBinding(values, key, { readonly });
      }
      if (group === 'shape')
        folder.on('change', () => {
          applyShape(tuning);
          this.pane.refresh();
        });
    }
    this.pane.addButton({ title: 'Respawn (applies size changes)' }).on('click', () => hooks.onRespawn());
    this.pane.addButton({ title: 'Copy JSON' }).on('click', () => {
      void navigator.clipboard?.writeText(JSON.stringify(tuning, null, 2));
    });
    this.pane.addButton({ title: 'Reset to defaults' }).on('click', () => {
      const d = cloneTuning(defaultTuning) as unknown as Record<string, Record<string, unknown>>;
      for (const group of Object.keys(root)) Object.assign(root[group] ?? {}, d[group]);
      this.ui.preset = 'opus';
      this.pane.refresh();
    });
  }

  applyPreset(name: PresetName): void {
    applyPreset(this.tuning, name);
    this.ui.preset = name;
    this.pane.refresh();
  }

  /** Blind A/B: swap to the other slot. Returns the slot number now active (1 or 2). */
  swapAB(): number {
    this.ab.active = this.ab.active === 1 ? 2 : 1;
    const name = this.ab.active === 1 ? this.ab.slot1 : this.ab.slot2;
    applyPreset(this.tuning, name);
    this.ui.preset = name;
    // Logged for the later reveal; the HUD only shows the slot number.
    console.info(`[A/B] slot ${this.ab.active} = ${name}`);
    this.pane.refresh();
    return this.ab.active;
  }

  /** Re-reads the tuning object (after it was changed from code, e.g. replay playback). */
  refresh(): void {
    this.ui.profile = this.hooks.currentProfile();
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
