import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { feet, hopOnto, newSim, type Sim } from './helpers';

/**
 * The layout's set pieces, flown and walked with the real controller (memory/playfield.md has the
 * map): the bluff in the floor path and the ways off it, the hollow, the far ledge without a
 * guard. If a rect or a glint moves and one of these stops working, the failing case names it.
 */
const S = GROVE.solids;
const ground = S.filter((r) => r.tag === 'ground');
const bluff = ground[3] as (typeof S)[number];
const terrace = ground[4] as (typeof S)[number];
const lanterns = GROVE.lanterns ?? [];
const list = GROVE.pickups ?? [];
const taken = (s: Sim, prefix: string) =>
  list.filter((p, i) => p.id.startsWith(prefix) && s.state.pickups.timers[i] !== 0).length;
const hurts = (ev: SimEvent[]) => ev.filter((e) => e.type === 'hurt').length;
const wait = (s: Sim, n: number) => {
  for (let f = 0; f < n; f++) step(s.state, 0, s.tuning, s.scene, s.events);
};

/** Holds an input until she has been in the air and stands still on something again (or `max` frames). */
function until(s: Sim, input: string, max = 600): number {
  let air = false;
  for (let f = 0; f < max; f++) {
    s.run(`${input}1`);
    if (!s.state.player.grounded) air = true;
    else if (air) return f;
  }
  return -1;
}

describe('the bluff: a rise in the floor path that must be climbed', () => {
  it('is 320 px over the path: a jump falls short, the branch or a double jump gets her up', () => {
    expect([bluff.x, bluff.y, bluff.w]).toEqual([2432, 960, 192]);
    const s = newSim({ ...GROVE, enemies: [] });
    s.place(2300, 1280);
    s.run('R+J60 R30');
    expect(feet(s).y).toBe(1280);
    expect(hopOnto(s, bluff)).toBeGreaterThan(0);
  });

  it('the way home: jump off its west lip and hold; the wings carry her over the burrback and the whole pool to the first lantern', () => {
    const stone = lanterns[0] as { x: number; y: number };
    // Whether she jumps from a standstill at the lip or at the end of a run-up.
    for (const runUp of ['L1', 'L4', 'L14']) {
      const s = newSim({ ...GROVE, enemies: [] });
      s.place(runUp === 'L1' ? bluff.x + 30 : bluff.x + 168, bluff.y);
      s.run(runUp);
      expect(until(s, 'L+J'), runUp).toBeGreaterThan(0);
      // (An early jump can clip the tip of the branch on the way down: still holding, she walks
      // off it and the wings open again.)
      if (feet(s).y !== stone.y) expect(until(s, 'L+J'), runUp).toBeGreaterThan(0);
      // Dry, past the pool's west lip, within a few steps of the lantern.
      expect(feet(s).y, runUp).toBe(stone.y);
      expect(feet(s).x, runUp).toBeLessThan(1536);
      expect(Math.abs(feet(s).x - stone.x), runUp).toBeLessThan(120);
      wait(s, 60);
      // The trail: every glint over the pool, in the one flight.
      expect(taken(s, 'pool-arc-'), runUp).toBe(5);
      expect(s.events.filter((e) => e.type === 'glideStart').length, runUp).toBeGreaterThanOrEqual(1);
    }
    // Without the wings the same inputs drop her on the far bank or in the water.
    const t = cloneTuning(defaultTuning);
    t.assists.glide = false;
    const q = newSim({ ...GROVE, enemies: [] }, t);
    q.place(bluff.x + 168, bluff.y);
    q.run('L14');
    until(q, 'L+J');
    if (feet(q).y === 1024) until(q, 'L+J');
    expect(feet(q).x).toBeGreaterThan(1536);
    expect(taken(q, 'pool-arc-')).toBeLessThan(5);
  });

  it('a jump and a double jump from its top reach F5: a short cut up to the high ledge', () => {
    const f5 = S.filter((r) => r.tag === 'floating')[4];
    if (!f5) throw new Error('no F5');
    const s = newSim({ ...GROVE, enemies: [] });
    s.place(bluff.x + 96, bluff.y);
    expect(hopOnto(s, f5)).toBeGreaterThan(0);
  });

  it('coming down its east side never lands her on the burrback: it keeps 270 px from the foot', () => {
    for (let k = 0; k < 60; k++) {
      for (const input of ['R', 'R+J']) {
        const s = newSim();
        wait(s, k * 37);
        s.place(bluff.x + bluff.w - 40, bluff.y);
        const from = s.events.length;
        // Off the lip (walking or with a held jump) and two beats standing where she came down.
        until(s, input, 200);
        if (feet(s).y === terrace.y) wait(s, 20);
        expect(hurts(s.events.slice(from)), `start ${k * 37}, ${input}`).toBe(0);
      }
    }
  });
});

describe('the hollow: a real dip in the floor', () => {
  const hollow = ground[6] as (typeof S)[number];
  it('running in is harmless and one jump gets her out either way; a jump from the rim clears it', () => {
    expect([hollow.x, hollow.y, hollow.w]).toEqual([3744, 1376, 224]);
    const s = newSim({ ...GROVE, enemies: [] });
    s.place(3600, 1280);
    s.run('R40');
    expect(feet(s).y).toBe(hollow.y);
    wait(s, 40);
    expect(taken(s, 'hollow-')).toBe(3);
    const root = S.find((r) => r.tag === 'root');
    if (!root) throw new Error('no root');
    expect(hopOnto(s, root)).toBeGreaterThan(0);
    s.place(hollow.x + 100, hollow.y);
    expect(hopOnto(s, ground[5] as (typeof S)[number])).toBeGreaterThan(0);
    // From the west rim one held jump lands on the root beyond.
    s.place(3690, 1280);
    s.run('R4');
    until(s, 'R+J');
    expect(feet(s).y).toBe(root.y);
  });
});

describe('the far ledge has no guard', () => {
  it('a full held running jump from F7 lands safe, whenever she sets off (it used to land on a burrback 55 times in 60)', () => {
    const far = S.filter((r) => r.tag === 'ledge')[1];
    if (!far) throw new Error('no far ledge');
    for (let k = 0; k < 60; k++) {
      const s = newSim();
      wait(s, k * 31);
      s.place(5140, 592);
      const from = s.events.length;
      s.run('R16 R+J60 R30 .60');
      expect(feet(s).y, `start ${k * 31}`).toBe(far.y);
      expect(hurts(s.events.slice(from)), `start ${k * 31}`).toBe(0);
    }
  });
});
