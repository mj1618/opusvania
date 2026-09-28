import { describe, expect, it } from 'vitest';
import ambience from '../../content/audio/ambience.json';
import hums from '../../content/audio/hums.json';
import mix from '../../content/audio/mix.json';
import music from '../../content/audio/music.json';
import sfx from '../../content/audio/sfx.json';
import { audioData, bedFor, parseAudioData, parsePattern } from '../../src/audio/data';
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY, saveSettings } from '../../src/audio/settings';

const raw = () => JSON.parse(JSON.stringify({ sfx, mix, hums, ambience, music }));

describe('content/audio validation', () => {
  it('parses the shipped data', () => {
    const d = audioData();
    expect(Object.keys(d.sfx.sounds)).toEqual(
      expect.arrayContaining([
        'jump',
        'landSoft',
        'landHard',
        'footstep',
        'dash',
        'wallJump',
        'hurt',
        'hit',
        'uiMove',
      ]),
    );
    expect(d.sfx.sounds.jump?.bus).toBe('sfx');
    expect(d.sfx.sounds.uiMove?.bus).toBe('ui');
    // Defaults are filled in.
    expect(d.sfx.sounds.dash?.maxVoices).toBeGreaterThan(0);
    expect(d.music.layers.full[0]?.steps.length).toBe(32);
  });

  it('matches beds by id, then room family, then default', () => {
    const a = audioData().ambience;
    expect(bedFor(a, 'hub')).toBe(a.rooms.hub);
    expect(bedFor(a, 'gym-05')).toBe(a.rooms.gym);
    expect(bedFor(a, 'nowhere')).toBe(a.default);
  });

  it('rejects an event bound to an unknown sound', () => {
    const r = raw();
    r.sfx.events.simple.dashStart = 'nope';
    expect(() => parseAudioData(r)).toThrow(/unknown sound.*nope/);
  });

  it('rejects unknown ZzFX params (typos)', () => {
    const r = raw();
    r.sfx.sounds.jump.layers[0].frequncy = 300;
    expect(() => parseAudioData(r)).toThrow();
  });

  it('rejects a hum colour whose land sound is missing', () => {
    const r = raw();
    r.hums.colours.brown.land = 'missing';
    expect(() => parseAudioData(r)).toThrow(/missing/);
  });

  it('rejects a music pattern that is not a whole number of bars', () => {
    const r = raw();
    r.music.layers.sparse[0].pattern = '0 . . .';
    expect(() => parseAudioData(r)).toThrow(/multiple of 16/);
  });

  it('rejects out-of-range values', () => {
    const r = raw();
    r.mix.spatial.panMax = 2;
    expect(() => parseAudioData(r)).toThrow();
  });
});

describe('parsePattern', () => {
  it('parses rests, hits, notes and chords', () => {
    expect(parsePattern(' .  x 0 -2 0+3+7 12 ')).toEqual([null, [0], [0], [-2], [0, 3, 7], [12]]);
  });

  it('throws on bad tokens', () => {
    expect(() => parsePattern('0 y')).toThrow(/bad pattern token "y"/);
    expect(() => parsePattern('0++3')).toThrow();
  });
});

describe('settings persistence', () => {
  const store = (init: Record<string, string> = {}) => {
    const m = new Map(Object.entries(init));
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      m,
    };
  };

  it('round-trips', () => {
    const s = store();
    expect(saveSettings({ ...DEFAULT_SETTINGS, music: 0.25, muted: true }, s)).toBe(true);
    expect(loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, music: 0.25, muted: true });
  });

  it('keeps valid fields and defaults the rest', () => {
    const s = store({ [SETTINGS_KEY]: JSON.stringify({ sfx: 0.5, music: 7, muted: 'yes' }) });
    expect(loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, sfx: 0.5 });
  });

  it('survives corrupt JSON, missing storage and throwing storage', () => {
    expect(loadSettings(store({ [SETTINGS_KEY]: '{nope' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, throwing)).toBe(false);
  });
});
