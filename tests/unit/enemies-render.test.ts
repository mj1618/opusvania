import { describe, expect, it } from 'vitest';
import { BURR } from '../../src/render/enemies/config';
import { foot, footAt, LEG_ROW, LEG_SIDE, legPhase, planted } from '../../src/render/enemies/gait';

const g = BURR.gait;

describe('burrback gait', () => {
  it('a planted foot does not slide: its world position is constant through the stance', () => {
    for (const facing of [1, -1]) {
      for (let leg = 0; leg < 6; leg++) {
        let anchor = Number.NaN;
        let checked = 0;
        // Walk 4 cycles in sub-pixel steps; the body is at facing * dist.
        for (let dist = 0; dist < g.cycle * 4; dist += 0.2) {
          footAt(dist, leg, g);
          const world = facing * dist + facing * foot.along;
          if (!foot.down) {
            anchor = Number.NaN;
            continue;
          }
          if (Number.isNaN(anchor)) anchor = world;
          expect(Math.abs(world - anchor)).toBeLessThan(1e-6);
          expect(foot.lift).toBe(0);
          checked++;
        }
        expect(checked).toBeGreaterThan(100);
      }
    }
  });

  it('the swing starts where the stance ended and lands where the next begins', () => {
    const reach = g.stance * g.cycle;
    for (let leg = 0; leg < 6; leg++) {
      let prev = Number.NaN;
      for (let dist = 0; dist < g.cycle * 3; dist += 0.05) {
        footAt(dist, leg, g);
        expect(Math.abs(foot.along)).toBeLessThanOrEqual(reach / 2 + 1e-6);
        expect(foot.lift).toBeGreaterThanOrEqual(0);
        expect(foot.lift).toBeLessThanOrEqual(g.lift + 1e-6);
        // No jump anywhere in the cycle (0.05 px of travel never moves a foot more than ~0.2 px).
        if (!Number.isNaN(prev)) expect(Math.abs(foot.along - prev)).toBeLessThan(0.25);
        prev = foot.along;
      }
    }
  });

  it('is a tripod: at least three feet down at all times, and each set is front + rear of one side with the middle of the other', () => {
    for (let dist = 0; dist < g.cycle * 3; dist += 0.1) expect(planted(dist, g)).toBeGreaterThanOrEqual(3);
    const near = (i: number) => Math.abs(legPhase(0, i, g) - 0.5) > 0.25;
    const setA = [0, 1, 2, 3, 4, 5].filter(near);
    expect(setA.length).toBe(3);
    const sides = setA.map((i) => LEG_SIDE[i]);
    const rows = setA.map((i) => LEG_ROW[i]).sort();
    expect(rows).toEqual([0, 1, 2]);
    // Two on one side, one (the middle) on the other.
    const sum = sides.reduce((a, b) => (a ?? 0) + (b ?? 0), 0);
    expect(Math.abs(sum ?? 0)).toBe(1);
    const odd = setA.find((i) => LEG_SIDE[i] === -Math.sign(sum ?? 0));
    expect(LEG_ROW[odd ?? 0]).toBe(1);
  });
});
