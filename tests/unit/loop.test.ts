import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../../src/loop';
import { clampCamera } from '../../src/render/camera';

describe('fixed step loop', () => {
  it('runs one step per 1/60s regardless of frame pacing', () => {
    const loop = new FixedStepLoop(1000 / 60);
    let steps = 0;
    for (let i = 0; i < 144; i++) steps += loop.advance(1000 / 144); // 1s at 144Hz
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(60);
    const slow = new FixedStepLoop(1000 / 60);
    let s2 = 0;
    for (let i = 0; i < 30; i++) s2 += slow.advance(1000 / 30); // 1s at 30Hz
    expect(s2).toBe(60);
  });

  it('exposes alpha in [0,1) and clamps huge stalls', () => {
    const loop = new FixedStepLoop(10, 5);
    expect(loop.advance(25)).toBe(2);
    expect(loop.alpha).toBeCloseTo(0.5);
    expect(loop.advance(10_000)).toBe(5);
    expect(loop.alpha).toBe(0);
  });
});

describe('camera', () => {
  it('clamps to room bounds', () => {
    expect(clampCamera(0, 0, 4000, 3000)).toEqual({ x: 0, y: 0 });
    expect(clampCamera(4000, 3000, 4000, 3000)).toEqual({ x: 4000 - 1920, y: 3000 - 1080 });
    expect(clampCamera(2000, 1500, 4000, 3000)).toEqual({ x: 2000 - 960, y: 1500 - 540 });
  });

  it('centres rooms smaller than the view', () => {
    expect(clampCamera(100, 100, 1000, 500)).toEqual({ x: -460, y: -290 });
  });
});
