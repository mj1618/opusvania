import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import type { Scene } from '../../src/sim/scene';
import { newSim, type Sim } from './helpers';

/**
 * A creature's `sets` flag (the old burrback's `wood-old-burrback-down`: the den's plug and the claws) fires only
 * on a real death. Sent away any other way (dispersed by an `until` flag or its guarded lamp going out, or simply
 * removed with health left) it never sets it.
 */

const WELL = getRoom('wood-well');
const FLAG = 'wood-old-burrback-down';
function run(s: Sim, n: number): SimEvent[] {
  const from = s.events.length;
  for (let i = 0; i < n; i++) step(s.state, 0, s.tuning, s.scene, s.events);
  return s.events.slice(from);
}
const withOld = (extra: Record<string, unknown>, more: Partial<Scene> = {}): Scene => ({
  ...WELL,
  ...more,
  enemies: (WELL.enemies ?? []).map((e) => (e.id === 'old-burr' ? { ...e, ...extra } : e)),
});
const oldOf = (s: Sim) => {
  const i = (s.scene.enemies ?? []).findIndex((e) => e.id === 'old-burr');
  const e = s.state.enemies[i];
  if (!e) throw new Error('no old burrback');
  return e;
};

describe('`sets` fires only on a real death', () => {
  it('the room still has it on the old burrback', () => {
    expect(WELL.enemies?.find((e) => e.id === 'old-burr')?.sets).toBe(FLAG);
  });

  it('removed with health left (gone, not killed): never set', () => {
    const s = newSim(WELL);
    run(s, 2);
    const e = oldOf(s);
    e.gone = true;
    run(s, 60);
    expect(s.state.save.flags).not.toContain(FLAG);
  });

  it('dispersed by an `until` flag: never set, even after it is gone', () => {
    const s = newSim(withOld({ until: 'send-away' }));
    run(s, 2);
    s.state.save.flags.push('send-away');
    run(s, 600);
    expect(oldOf(s).dispersed).toBe(true);
    expect(s.state.save.flags).not.toContain(FLAG);
  });

  it('dispersed when its guarded lamp goes out: never set', () => {
    const lure = WELL.lures?.[0];
    if (!lure) throw new Error('no lure');
    const s = newSim(withOld({ guards: lure.id }));
    run(s, 2);
    s.state.lures.hp[0] = 0;
    run(s, 600);
    expect(s.state.save.flags).not.toContain(FLAG);
  });

  it('killed: set, once', () => {
    const s = newSim(WELL);
    run(s, 2);
    const e = oldOf(s);
    e.hp = 0;
    e.mode = 'dead';
    e.timer = 30;
    const ev = run(s, 60);
    expect(s.state.save.flags).toContain(FLAG);
    expect(ev.filter((x) => x.type === 'flagSet' && x.flag === FLAG)).toHaveLength(1);
  });
});
