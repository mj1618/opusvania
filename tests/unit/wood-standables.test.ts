import { describe, expect, it } from 'vitest';
import { shelfFor, unclaimedStandables } from '../../src/render/scene/lib/wood-claims';
import { ROOMS } from '../../src/scene/index';

describe('wood standables (canopy review r3 #2: the den escape ledges were invisible)', () => {
  it('every solid and one-way ledge she can stand on in a wood room has a painter', () => {
    const missing: string[] = [];
    let n = 0;
    for (const room of Object.values(ROOMS)) {
      if (room.art?.kit !== 'wood') continue;
      n += room.solids.length + room.oneWays.length;
      missing.push(...unclaimedStandables(room));
    }
    expect(n).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });

  it('the den ledges are root shelves hung from its roof', () => {
    const den = ROOMS['cn-den'];
    if (!den) return;
    for (const o of den.oneWays) {
      const sh = shelfFor(den, o);
      expect(sh.wall !== null || sh.ceil !== null).toBe(true);
    }
  });
});
