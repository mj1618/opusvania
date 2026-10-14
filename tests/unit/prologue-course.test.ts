import { describe, expect, it } from 'vitest';
import { Guide } from '../../src/prologue/guide';
import { COURSE } from '../../src/render/prologue/script';
import { GROVE } from '../../src/scene/index';
import { tuning } from '../../src/sim/tuning';

/** The prologue's course (Sorrel's recorded clips) still lands where the director waits for her. */
describe('prologue course', () => {
  const scene = { ...GROVE, enemies: [], pickups: [], pods: [] };
  const run = (x: number, y: number, clip: string): Guide => {
    const g = new Guide(tuning, scene, 1);
    g.place(x, y);
    g.play(clip);
    for (let i = 0; i < 600 && !g.idle; i++) g.step();
    for (let i = 0; i < 30; i++) g.step();
    return g;
  };

  it('each leg ends on its mark', () => {
    let from: { x: number; y: number } = COURSE.start;
    for (const leg of COURSE.legs) {
      const g = run(from.x, from.y, leg.clip);
      expect(g.state.player.grounded, leg.id).toBe(true);
      expect(g.y, leg.id).toBe(leg.mark.y);
      expect(Math.abs(g.x - leg.mark.x), leg.id).toBeLessThan(40);
      from = leg.mark;
    }
  });

  it('the dive off F4 glides down to the pool lip', () => {
    const last = COURSE.legs[COURSE.legs.length - 1]?.mark ?? COURSE.start;
    const g = run(last.x, last.y, COURSE.dive.clip);
    expect(g.y).toBe(1280);
    expect(Math.abs(g.x - COURSE.nose.x)).toBeLessThan(120);
  });
});
