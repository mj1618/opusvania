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

  // rAF deltas on a 60Hz display: jitter of up to ±0.45ms around 16.67 (deterministic pattern).
  const jitter = Array.from({ length: 600 }, (_, i) => 1000 / 60 + (((i * 37) % 19) - 9) * 0.05);

  it('snaps near-60Hz frame times so every frame runs exactly one step (no 0/2 jitter)', () => {
    const loop = new FixedStepLoop(1000 / 60);
    loop.advance(7.3); // arbitrary phase
    const counts = jitter.map((dt) => loop.advance(dt));
    expect(new Set(counts)).toEqual(new Set([1]));
  });

  it('without snapping the same jitter produces 0- and 2-step frames', () => {
    const loop = new FixedStepLoop(1000 / 60, 5, 0);
    loop.advance(16.5); // phase near a step boundary, where jitter bites
    const counts = jitter.map((dt) => loop.advance(dt));
    expect(counts).toContain(0);
    expect(counts).toContain(2);
  });

  it('snaps 30Hz and 120Hz frames, leaves 144Hz and long stalls alone', () => {
    const loop = new FixedStepLoop(1000 / 60);
    expect(loop.snap(33.1)).toBeCloseTo(2000 / 60, 9);
    expect(loop.snap(8.5)).toBeCloseTo(500 / 60, 9);
    expect(loop.snap(1000 / 144)).toBe(1000 / 144);
    expect(loop.snap(250)).toBe(250);
    let steps = 0;
    for (let i = 0; i < 120; i++) steps += loop.advance(i % 2 === 0 ? 8.2 : 8.5); // 120Hz, 1s
    expect(steps).toBe(60);
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
