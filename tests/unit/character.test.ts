import { describe, expect, it } from 'vitest';
import { ik2, ikOut, Spring } from '../../src/render/character/math';

describe('character maths', () => {
  it('spring settles on its target without blowing up at a large dt', () => {
    const s = new Spring(0, 30, 0.5);
    for (let i = 0; i < 200; i++) s.step(1, 0.1);
    expect(s.x).toBeCloseTo(1, 3);
  });

  it('two-bone IK keeps bone lengths and reaches the target', () => {
    ik2(0, 0, 10, 20, 15, 16, 1);
    expect(Math.hypot(ikOut.x, ikOut.y)).toBeCloseTo(15, 3);
    expect(Math.hypot(ikOut.ex - ikOut.x, ikOut.ey - ikOut.y)).toBeCloseTo(16, 3);
    expect(ikOut.ex).toBeCloseTo(10, 3);
    expect(ikOut.ey).toBeCloseTo(20, 3);
  });
});
