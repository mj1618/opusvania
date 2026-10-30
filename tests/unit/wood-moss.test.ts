/**
 * What grows on the walk tops (canopy review r7 #6: "one lime moss frosting, the same thickness, on every top in every
 * room"): one family per look, none shared; every top of the Canopy covered over 40-85% of its length in runs with
 * breaks, the coverage spread over that range across the area, each run 10-60 px thick.
 */
import { describe, expect, it } from 'vitest';
import type { Look } from '../../src/render/scene/lib/looks';
import { massTops } from '../../src/render/scene/lib/pf-mass';
import { GROWTH, growthCover, growthRuns, TOP_FAMILY, topFamilyOf } from '../../src/render/scene/lib/top-growth';
import { ROOMS } from '../../src/scene/index';

const canopy = Object.values(ROOMS).filter((r) => r.art?.kit === 'wood' && r.id.startsWith('cn-'));

describe('wood top growth', () => {
  it('gives each look its own family', () => {
    const looks = Object.keys(TOP_FAMILY) as Look[];
    expect(new Set(looks.map((l) => TOP_FAMILY[l])).size).toBe(looks.length);
  });

  it('shows at least four families across the Canopy', () => {
    expect(new Set(canopy.map((r) => topFamilyOf(r))).size).toBeGreaterThanOrEqual(4);
  });

  it('covers 40-85% of every top, in runs 10-60 px thick, the coverage spread across the area', () => {
    const covers: number[] = [];
    const bad: string[] = [];
    for (const room of canopy) {
      const fam = topFamilyOf(room);
      for (const t of massTops(room)) {
        if (t.b - t.a < 320) continue;
        const runs = growthRuns(t.a, t.b, t.key + t.a, fam);
        const c = growthCover(runs, t.a, t.b);
        covers.push(c);
        if (c < 0.4 || c > 0.85) bad.push(`${room.id} top ${t.a}-${t.b}@${t.key}: ${Math.round(c * 100)}%`);
        if (runs.length > 1 && runs.some((q, i) => i > 0 && q.a - (runs[i - 1]?.b ?? 0) < 1))
          bad.push(`${room.id} top ${t.a}-${t.b}: runs without a break`);
        for (const q of runs)
          if (q.th < 10 || q.th > 60 || q.th < GROWTH[fam].th[0] - 0.01 || q.th > GROWTH[fam].th[1] + 0.01)
            bad.push(`${room.id} top ${t.a}: run ${Math.round(q.th)} px thick`);
      }
    }
    expect(bad).toEqual([]);
    expect(covers.length).toBeGreaterThan(40);
    expect(Math.min(...covers)).toBeLessThan(0.5);
    expect(Math.max(...covers)).toBeGreaterThan(0.75);
  });
});
