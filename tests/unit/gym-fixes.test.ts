/** L2 playtest P3 gym notes that were fixed in the L2 fix pass. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HeadlessSim } from '../../src/debug/headless';
import { type TapeFile, tapeSetup } from '../../src/debug/tape';
import { parseInputScript } from '../../src/input/script';
import type { SimEvent } from '../../src/sim/events';

function runEvents(sim: HeadlessSim, script: string): SimEvent[] {
  const all: SimEvent[] = [];
  for (const m of parseInputScript(script)) all.push(...sim.step(m));
  return all;
}

describe('gym fixes (L2 playtest P3)', () => {
  it('gym-01: a full jump from the spawn does not bonk the ceiling', () => {
    const sim = new HeadlessSim({ room: 'gym-01' });
    const evs = runEvents(sim, '.5 J40 .20');
    expect(evs.filter((e) => e.type === 'jump')).toHaveLength(1);
    expect(evs.filter((e) => e.type === 'headBump')).toEqual([]);
  });

  it('gym-09: the golden route ends with a hard landing before the goal', () => {
    const tape = JSON.parse(
      readFileSync(new URL('../replays/gym-09.none.json', import.meta.url), 'utf8'),
    ) as TapeFile;
    const sim = new HeadlessSim(tapeSetup(tape));
    const evs = runEvents(sim, tape.inputs);
    const hard = evs.findIndex((e) => e.type === 'land' && e.hard);
    const goal = evs.findIndex((e) => e.type === 'goal');
    expect(hard).toBeGreaterThanOrEqual(0);
    expect(goal).toBeGreaterThan(hard);
  });
});
