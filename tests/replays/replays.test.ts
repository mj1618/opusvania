/**
 * Golden replay harness (movement-spec §7.3), run by `npm run check`. Every tests/replays/*.json
 * is either a tape (`kind: "tape"`: room + DSL inputs + behavioural expectations + goldens) or a
 * raw replay dump from `__game.replay.stop()`. See memory/replays-and-tapes.md.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMeta, explainMismatch } from '../../src/debug/build-info';
import { registerTestRoom } from '../../src/debug/sim-adapter';
import { checkTape, isTapeFile, makeTape, type TapeFile } from '../../src/debug/tape';
import { type Replay, runReplay } from '../../src/sim/replay';

const DIR = import.meta.dirname;
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

describe('golden replays (tests/replays/*.json)', () => {
  it('build info is injected', () => {
    expect(buildMeta().sim).toMatch(/^[0-9a-f]{10}$/);
  });

  for (const f of files) {
    it(f, () => {
      const data = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as unknown;
      if (isTapeFile(data)) {
        const c = checkTape(data);
        for (const n of c.notes) console.warn(`[${f}] ${n}`);
        expect(c.failures, `${f}: ${c.failures.join('\n')}`).toEqual([]);
      } else {
        const r = data as Replay & { meta?: Parameters<typeof explainMismatch>[0] };
        const res = runReplay(r);
        expect(res.matches, `${f}: ${explainMismatch(r.meta)}`).not.toBe(false);
      }
    });
  }
});

describe('tape harness self-test', () => {
  const room = registerTestRoom('replay-selftest', [
    '##############################',
    ...Array.from({ length: 11 }, () => '#............................#'),
    '#.........#####..............#',
    '#............................#',
    '#............................#',
    '#.P..........................#',
    '##############################',
  ]);
  const inputs = '.10 R40 R+J16 R30 .20 L10';
  const make = (): TapeFile =>
    makeTape('selftest', { room, seed: 3 }, inputs, { target: 'tile:5,15', maxFrames: 200, maxDeaths: 0 });

  it('a fresh tape passes behaviourally and matches its goldens', () => {
    const c = checkTape(make());
    expect(c.failures).toEqual([]);
    expect(c.golden).toBe('match');
    expect(c.run.reachedAt).toBeGreaterThan(0);
  });

  it('a tuning change marks goldens stale instead of failing', () => {
    const t = make();
    // An extra key the sim ignores: behaviour is identical, but the tuning hash differs.
    const c = checkTape({ ...t, tuning: { world: { staleMarker: 1 } } });
    expect(c.golden).toBe('stale');
    expect(c.ok).toBe(true);
  });

  it('a hash change on the same tuning fails, explaining the build difference', () => {
    const t = make();
    const golden = t.golden;
    if (!golden) throw new Error('no golden');
    const older = {
      ...t,
      golden: { ...golden, hash: 'deadbeef', build: { ...golden.build, sim: '0000000000', sha: 'abc' } },
    };
    const c = checkTape(older);
    expect(c.ok).toBe(false);
    expect(c.failures.join()).toMatch(/older build/);
    const same = { ...t, golden: { ...golden, hash: 'deadbeef' } };
    expect(checkTape(same).failures.join()).toMatch(/SAME sim build/);
  });

  it('behavioural failures are reported (target, maxFrames, asserts)', () => {
    const t = make();
    const c = checkTape({
      ...t,
      golden: undefined,
      expect: {
        target: 'tile:27,1',
        assert: [
          { path: 'grounded', eq: false },
          { frame: 5, path: 'x', min: 99999 },
        ],
      },
    });
    expect(c.failures.length).toBe(3);
  });
});
