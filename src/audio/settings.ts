import { z } from 'zod';

/** Player audio settings, persisted in localStorage. Every access is wrapped: storage can throw. */

const vol = z.number().min(0).max(1);
export const SettingsSchema = z.object({
  master: vol,
  music: vol,
  sfx: vol,
  ambience: vol,
  ui: vol,
  muted: z.boolean(),
});
export type AudioSettings = z.infer<typeof SettingsSchema>;
export type VolumeKey = Exclude<keyof AudioSettings, 'muted'>;

export const DEFAULT_SETTINGS: AudioSettings = {
  master: 1,
  music: 1,
  sfx: 1,
  ambience: 1,
  ui: 1,
  muted: false,
};
export const SETTINGS_KEY = 'opusvania.audio.v1';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Loads settings; anything missing or invalid falls back to the defaults, field by field. */
export function loadSettings(store: Store | null = defaultStore()): AudioSettings {
  try {
    const raw = store?.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof AudioSettings)[]) {
      const r = SettingsSchema.shape[k].safeParse(obj[k]);
      if (r.success) (out as Record<string, unknown>)[k] = r.data;
    }
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AudioSettings, store: Store | null = defaultStore()): boolean {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(s));
    return !!store;
  } catch {
    return false;
  }
}
