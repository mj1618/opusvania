import { describe, expect, it } from 'vitest';
import { BEATS, BREATH, COURSE, HATCH, HOLLOW } from '../../src/render/prologue/script';
import { ease, envelope, integrate, Track, window01 } from '../../src/render/prologue/track';

describe('prologue track', () => {
  it('holds before the first key and after the last, and eases between', () => {
    const tr = new Track([
      { t: 1, v: [0, 10] },
      { t: 3, v: [2, 30] },
    ]);
    expect(tr.sample(0)).toEqual([0, 10]);
    expect(tr.sample(5)).toEqual([2, 30]);
    const mid = tr.sample(2);
    expect(mid[0]).toBeCloseTo(1);
    expect(mid[1]).toBeCloseTo(20);
    expect(tr.at(1.2)).toBeLessThan(0.2 * 2);
  });

  it('rejects keys out of order or of different lengths', () => {
    expect(
      () =>
        new Track([
          { t: 2, v: [0] },
          { t: 1, v: [1] },
        ]),
    ).toThrow();
    expect(
      () =>
        new Track([
          { t: 0, v: [0] },
          { t: 1, v: [1, 2] },
        ]),
    ).toThrow();
  });

  it('eases start and end at rest', () => {
    for (const k of ['linear', 'in', 'out', 'inOut'] as const) {
      expect(ease(k, 0)).toBe(0);
      expect(ease(k, 1)).toBe(1);
    }
    expect(ease('hold', 0.99)).toBe(0);
  });

  it('integrates a changing rate without a jump', () => {
    const pts: Array<[number, number]> = [
      [0, 1],
      [2, 1],
      [4, 0.5],
    ];
    expect(integrate(pts, 2)).toBeCloseTo(2);
    expect(integrate(pts, 4)).toBeCloseTo(3.5);
    expect(integrate(pts, 6)).toBeCloseTo(4.5);
    expect(integrate(pts, 3.999)).toBeCloseTo(integrate(pts, 4.001), 2);
  });

  it('windows and envelopes', () => {
    expect(window01(0, 1, 2)).toBe(0);
    expect(window01(3, 1, 2)).toBe(1);
    expect(envelope(5, 0, 1, 4, 6)).toBeGreaterThan(0);
    expect(envelope(7, 0, 1, 4, 6)).toBe(0);
  });

  it('the shot list runs in order and fits the script', () => {
    expect(BEATS.map((b) => b.id)).toEqual(['breath', 'hatch', 'play', 'hollow', 'summit', 'wake']);
    expect(BREATH.fadeOut[1]).toBe(BEATS[0].len);
    expect(BREATH.period).toBe(5);
    expect(HATCH.sorrelSplit).toBeLessThan(HATCH.wingSplit);
    expect(HATCH.follow[1]).toBe(BEATS[1].len);
    expect(HOLLOW.play[1]).toBeLessThan(HOLLOW.hide[1]);
    expect(HOLLOW.hide[1]).toBe(BEATS[3].len);
    expect(COURSE.legs.length).toBeGreaterThan(1);
  });
});
