import { Pane } from 'tweakpane';
import { AUDIO } from '../audio/tuning';
import { POST } from '../render/post/config';
import { applyShape, assignTuning, cloneTuning, defaultTuning, type Tuning } from '../sim/tuning';

const OPTIONS: Record<string, Record<string, string>> = {
  'jump.releaseMode': { gravity: 'gravity', zero: 'zero' },
};

/** The room selector at the top of the panel. */
export interface RoomChoice {
  /** The room being played. */
  room: string;
  /** Every room id (content/world.json order: the game's rooms, then the test rooms). */
  rooms: readonly string[];
  /** Called with the chosen id (main.ts: `goto`, the save kept). */
  onRoom(id: string): void;
}

/**
 * Tweakpane panel bound to the live tuning object. Hidden by default; toggle with backquote.
 * The Room list at the top switches room (the test grove lives there).
 * Shape edits re-derive the jump constants. "Copy JSON" copies the current values so they can be
 * written back into src/sim/tuning.ts.
 */
export class TuningPanel {
  private readonly pane: Pane;
  private readonly pick = { room: '' };

  constructor(tuning: Tuning, onRespawn: () => void, rooms?: RoomChoice) {
    this.pane = new Pane({ title: 'Tuning  ( ` to hide )' });
    this.pane.hidden = true;
    if (rooms) {
      this.pick.room = rooms.room;
      this.pane
        .addBinding(this.pick, 'room', {
          label: 'Room',
          options: Object.fromEntries(rooms.rooms.map((id) => [id, id])),
        })
        .on('change', (e) => {
          if (e.value !== this.shown) rooms.onRoom(e.value);
        });
      this.shown = rooms.room;
    }
    const root = tuning as unknown as Record<string, Record<string, unknown>>;
    for (const [group, values] of Object.entries(root)) {
      const folder = this.pane.addFolder({ title: group, expanded: group === 'shape' });
      for (const [key, v] of Object.entries(values)) {
        if (typeof v === 'string') folder.addBinding(values, key, { options: OPTIONS[`${group}.${key}`] });
        // No min/max and no step: Tweakpane snaps bound numbers to its range and step grid on
        // refresh, silently rewriting values set from code.
        else if (typeof v === 'boolean' || typeof v === 'number') folder.addBinding(values, key);
        else if (v && typeof v === 'object') {
          // One level of rows inside a group (the lure kinds: `lures.kinds.wick`, ...).
          for (const [row, nums] of Object.entries(v as Record<string, Record<string, unknown>>)) {
            const sub = folder.addFolder({ title: `${key}.${row}`, expanded: false });
            for (const [k, n] of Object.entries(nums)) if (typeof n === 'number') sub.addBinding(nums, k);
          }
        }
      }
      if (group === 'shape')
        folder.on('change', () => {
          applyShape(tuning);
          this.pane.refresh();
        });
    }
    // The post stage's knobs (bloom, lights, grade, vignette): live, not part of the sim tuning.
    const post = this.pane.addFolder({ title: 'post (look)', expanded: false });
    for (const [group, values] of Object.entries(POST as Record<string, unknown>)) {
      if (typeof values === 'boolean' || typeof values === 'number')
        post.addBinding(POST as Record<string, unknown>, group);
      if (typeof values !== 'object' || values === null) continue;
      const folder = post.addFolder({ title: group, expanded: false });
      for (const [key, v] of Object.entries(values)) {
        if (typeof v === 'number')
          folder.addBinding(
            values as Record<string, unknown>,
            key,
            /tint/i.test(key) ? { view: 'color' } : {},
          );
      }
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

  /** Sound: master and per-bus volume (dB), live. `onChange` re-reads them into the mix. */
  addAudio(onChange: () => void): void {
    const f = this.pane.addFolder({ title: 'audio (dB)', expanded: false });
    f.addBinding(AUDIO, 'master');
    for (const k of Object.keys(AUDIO.bus)) f.addBinding(AUDIO.bus, k as keyof typeof AUDIO.bus);
    f.on('change', onChange);
  }

  /** The room the game is in (the list follows her through exits and `goto`). */
  private shown = '';
  setRoom(id: string): void {
    if (id === this.shown) return;
    this.shown = id;
    this.pick.room = id;
    this.pane.refresh();
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
