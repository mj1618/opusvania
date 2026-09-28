import { describe, expect, it } from 'vitest';
import { ImpactDirector } from '../../src/render/juice/impact';
import { SoundViz } from '../../src/render/juice/soundviz';
import { JUICE } from '../../src/render/juice/tuning';
import type { SimEvent } from '../../src/sim/events';
import type { GameState } from '../../src/sim/index';

/** Just enough state for the juice models (they only read these fields). */
function fakeState(hitstop = 0): GameState {
  return {
    hitstop,
    frame: 0,
    player: { x: 100, y: 100, w: 48, h: 80, vx: 0, vy: 0, facing: 1, state: 'normal' },
    local: { enemies: [], levied: [], sounds: [], sources: [] },
  } as unknown as GameState;
}

const hit: SimEvent = { type: 'hit', cls: 'heavy', move: 'levy', target: 1, dmg: 6, x: 200, y: 120, dir: 1 };
const repo: SimEvent = { type: 'repossess', enemy: 1, x: 200, y: 120 };

function run(d: ImpactDirector, steps: { hs: number; ev: SimEvent[] }[]): string {
  for (const s of steps) d.step(fakeState(s.hs), s.ev, () => 0xffffff);
  return JSON.stringify({ sp: d.sparks, w: d.words, k: [d.kx, d.ky], z: d.zoom, t: d.trauma });
}

describe('combat juice (render-side, deterministic)', () => {
  it('replays identically after reset()', () => {
    const d = new ImpactDirector();
    const seq = [{ hs: 10, ev: [hit] }, ...Array.from({ length: 5 }, () => ({ hs: 9, ev: [] }))];
    const a = run(d, seq);
    d.reset();
    expect(run(d, seq)).toBe(a);
  });

  it('a heavy hit fires sparks, an impact frame, a kick and a zoom punch', () => {
    const d = new ImpactDirector();
    d.step(fakeState(10), [hit], () => 0xe8a23a);
    expect(d.sparks.length).toBeGreaterThan(10);
    expect(d.impactFrames).toBeGreaterThan(0);
    d.step(fakeState(9), [], () => 0);
    expect(d.zoom).toBeGreaterThan(1);
    expect(Math.abs(d.kx)).toBeGreaterThan(0);
  });

  it('slow motion waits for the hitstop, then eases back to 1', () => {
    const d = new ImpactDirector();
    d.step(fakeState(16), [repo], () => 0);
    expect(d.timeScale(16)).toBe(1);
    d.step(fakeState(0), [], () => 0);
    expect(d.timeScale(0)).toBeLessThan(0.5);
    for (let i = 0; i < JUICE.slowmo.repossess.frames + 2; i++) d.step(fakeState(0), [], () => 0);
    expect(d.timeScale(0)).toBe(1);
    expect(d.slow).toBeNull();
  });

  it('a Seize tears a ribbon that lands in the sack, then clears', () => {
    const v = new SoundViz();
    const take: SimEvent = {
      type: 'seizeTake',
      soundId: 1,
      colour: 'pink',
      kind: 'voice',
      owner: 2,
      x: 200,
      y: 120,
    };
    v.step(fakeState(), [take]);
    expect(v.tears.length).toBe(1);
    let popped = false;
    for (let i = 0; i < 40; i++) {
      v.step(fakeState(), []);
      popped ||= v.pops.length > 0;
    }
    expect(popped).toBe(true);
    expect(v.tears.length).toBe(0);
  });
});
