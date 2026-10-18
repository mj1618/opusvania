/**
 * The save slot (memory/save.md): the sim's `save` (src/sim/state.ts `SaveState`) as versioned JSON
 * in localStorage, one slot. Written on every progress event (main.ts), read at boot (Continue).
 * Zod checks what comes back; a chain of `MIGRATIONS` lifts an older slot to the current version, and
 * a slot that cannot be read is set aside (kept under `<key>.bad`), never thrown at the player.
 * No DOM types beyond the `Storage`-like object passed in, so tests run it in Node.
 */
import { z } from 'zod';
import { ABILITIES } from '../sim/abilities';
import { cloneSave, type SaveState } from '../sim/state';

/** The localStorage key of the one slot. */
export const SAVE_KEY = 'lampfall.save';

/** The slot's format version (not the sim state's): bump it and add a migration when `SaveState` changes. */
export const SAVE_VERSION = 1;

const SaveSchema = z
  .object({
    abilities: z.array(z.enum(ABILITIES)),
    snuffed: z.array(z.string()),
    moths: z.number().int().min(0),
    taken: z.array(z.string()),
    flags: z.array(z.string()),
    opened: z.array(z.string()),
    visited: z.array(z.string()),
    seen: z.array(z.string()),
    crossed: z.array(z.string()),
    patch: z.object({ room: z.string(), id: z.string() }).strict().nullable(),
    time: z.number().int().min(0),
  })
  .strict();

const SlotSchema = z.object({ version: z.literal(SAVE_VERSION), save: SaveSchema }).strict();

/** `MIGRATIONS[v]` lifts a slot of version v to v + 1 (raw JSON in, raw JSON out). */
const MIGRATIONS: Record<
  number,
  (slot: { version: number; save: unknown }) => { version: number; save: unknown }
> = {};

/** What `Storage` gives us (localStorage, or a stand-in in tests). */
export interface SlotStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The slot as JSON text. */
export function encodeSave(save: SaveState): string {
  return JSON.stringify({ version: SAVE_VERSION, save });
}

/** Reads slot JSON: the save, migrated to the current version, or null (no slot, or one we cannot read). */
export function decodeSave(text: string | null): SaveState | null {
  if (!text) return null;
  try {
    let slot = JSON.parse(text) as { version: number; save: unknown };
    while (typeof slot?.version === 'number' && slot.version < SAVE_VERSION) {
      const up = MIGRATIONS[slot.version];
      if (!up) return null;
      slot = up(slot);
    }
    const ok = SlotSchema.safeParse(slot);
    return ok.success ? cloneSave(ok.data.save as SaveState) : null;
  } catch {
    return null;
  }
}

/** The stored save, or null. A slot that cannot be read is moved aside to `<key>.bad`. */
export function readSave(store: SlotStore | null): SaveState | null {
  if (!store) return null;
  try {
    const text = store.getItem(SAVE_KEY);
    const save = decodeSave(text);
    if (text && !save) {
      store.setItem(`${SAVE_KEY}.bad`, text);
      store.removeItem(SAVE_KEY);
    }
    return save;
  } catch {
    return null;
  }
}

/** Writes the slot. False if storage refused (private mode, full). */
export function writeSave(store: SlotStore | null, save: SaveState): boolean {
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, encodeSave(save));
    return true;
  } catch {
    return false;
  }
}

/** Empties the slot. */
export function clearSave(store: SlotStore | null): void {
  try {
    store?.removeItem(SAVE_KEY);
  } catch {
    // nothing to clear
  }
}

/** The page's localStorage, or null where there is none (or it throws). */
export function pageStore(): SlotStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The sim events that are progress: each one writes the slot (tech.md §3: nothing earned is lost). */
export const PROGRESS_EVENTS: ReadonlySet<string> = new Set([
  'patchRest',
  'gladeGrant',
  'lureSnuff',
  'shortcutOpen',
  'roomEnter',
  // (Lanternroot: a flag set, a wick kept or a set burned whole, a find, a broken wall.)
  'flagSet',
  'lureKindle',
  'wickSet',
  'hollowGrant',
  'barkBreak',
]);
