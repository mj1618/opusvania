import { describe, expect, it } from 'vitest';
import { bezier, clockText, Path, priceArc, streamCount } from '../../src/render/goal/logic';

describe('goal render logic', () => {
  it('streams the whole cost out of her before the lamp catches, never more', () => {
    expect(streamCount(0, 30, 12)).toBe(0);
    expect(streamCount(1, 30, 12)).toBe(1);
    let last = 0;
    for (let f = 1; f < 30; f++) {
      const n = streamCount(f, 30, 12);
      expect(n).toBeGreaterThanOrEqual(last);
      expect(n - last).toBeLessThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(12);
      last = n;
    }
    expect(streamCount(22, 30, 12)).toBe(12);
    expect(streamCount(29, 30, 12)).toBe(12);
    expect(streamCount(10, 30, 0)).toBe(0);
    // A long channel and a dear lantern still end on the cost.
    expect(streamCount(74, 75, 16)).toBe(16);
  });

  it('writes the run time as m:ss', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(59)).toBe('0:00');
    expect(clockText(60 * 9)).toBe('0:09');
    expect(clockText(60 * 75 + 30)).toBe('1:15');
    expect(clockText(60 * 600)).toBe('10:00');
  });

  it('lays the price out as an arc centred over the lantern', () => {
    const arc = priceArc(12, 64, 12.5, 150);
    expect(arc).toHaveLength(12);
    for (let i = 0; i < 6; i++) {
      const a = arc[i] as [number, number];
      const b = arc[11 - i] as [number, number];
      expect(a[0]).toBeCloseTo(-b[0], 6);
      expect(a[1]).toBeCloseTo(b[1], 6);
      expect(a[1]).toBeLessThan(0);
    }
    expect(priceArc(1, 64, 12.5, 150)[0]?.[0]).toBeCloseTo(0, 6);
    expect(priceArc(0, 64, 12.5, 150)).toHaveLength(0);
    // Many stars close up rather than run round the lantern.
    const wide = priceArc(24, 64, 12.5, 150);
    expect(Math.min(...wide.map((p) => p[1]))).toBeCloseTo(-64, 0);
    expect(Math.max(...wide.map((p) => p[1]))).toBeLessThan(0);
  });

  it('samples a path by distance', () => {
    const p = new Path();
    p.add(0, 0);
    p.add(10, 0);
    p.add(10, 30);
    const out = [0, 0, 0, 0];
    p.sample(0.25, out);
    expect(out).toEqual([10, 0, 1, 0]);
    p.sample(0.625, out);
    expect(out[0]).toBeCloseTo(10);
    expect(out[1]).toBeCloseTo(15);
    expect(out[3]).toBeCloseTo(1);
    p.sample(2, out);
    expect(out[1]).toBeCloseTo(30);
    const b = new Path();
    bezier(b, [0, 0, 0, 10, 10, 10, 10, 0], 8);
    bezier(b, [10, 0, 10, -10, 20, -10, 20, 0], 8);
    expect(b.xs).toHaveLength(17);
    expect(b.length).toBeGreaterThan(20);
  });
});
