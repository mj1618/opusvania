import { describe, expect, it } from 'vitest';
import { rngFloat, rngInt, seedRng } from '../../src/sim/rng';

describe('seeded rng', () => {
  it('is deterministic for a seed', () => {
    const a = { rng: seedRng(42) };
    const b = { rng: seedRng(42) };
    const xs = Array.from({ length: 100 }, () => rngFloat(a));
    const ys = Array.from({ length: 100 }, () => rngFloat(b));
    expect(xs).toEqual(ys);
  });

  it('differs across seeds, including small adjacent seeds', () => {
    expect(rngFloat({ rng: seedRng(0) })).not.toEqual(rngFloat({ rng: seedRng(1) }));
    expect(rngFloat({ rng: seedRng(1) })).not.toEqual(rngFloat({ rng: seedRng(2) }));
  });

  it('stays in range and is roughly uniform', () => {
    const h = { rng: seedRng(7) };
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 10000; i++) {
      const f = rngFloat(h);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      buckets[Math.floor(f * 10)]++;
    }
    for (const b of buckets) expect(b).toBeGreaterThan(850);
    for (let i = 0; i < 1000; i++) {
      const n = rngInt(h, 3);
      expect([0, 1, 2]).toContain(n);
    }
  });

  it('keeps state as a uint32 so it serialises exactly', () => {
    const h = { rng: seedRng(123) };
    for (let i = 0; i < 50; i++) rngFloat(h);
    expect(Number.isInteger(h.rng)).toBe(true);
    expect(h.rng).toBeGreaterThanOrEqual(0);
    expect(h.rng).toBeLessThan(2 ** 32);
  });
});
