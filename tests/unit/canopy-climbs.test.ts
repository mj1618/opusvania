/**
 * The Canopy's set-piece climbs are fair (review r4 #1: they passed only frame-perfect): each passes with a reaction
 * delay of 0, 6 and 10 frames before every kick, from three start x on its rest, with every thorn strip grown 64 px
 * at both ends; one face alone runs into thorns; a thorn hit puts her back on the rest the climb started from.
 * A plan that takes a reward off the line (review r5 #2: glints over a strip) is a risk: it must pass at 0 and 6
 * with half the margin.
 * The climbs and the player model: tools/levels/climbs.ts.
 * With the creatures in (review r6 #3): the well's leg 3b and its lampwing are a choice, not a toll (`CREATURE_CLIMBS`).
 */
import { describe, expect, it } from 'vitest';
import {
  CLIMBS,
  type Climb,
  CREATURE_CLIMBS,
  DELAYS,
  MARGIN,
  restSafe,
  runClimb,
} from '../../tools/levels/climbs';

describe('the Canopy climbs are fair', () => {
  for (const c of CLIMBS)
    it(`${c.id}: ${c.note}`, () => {
      const bad: string[] = [];
      for (const plan of c.plans)
        for (const [i, x] of c.xs.entries())
          for (const d of plan.delays ?? DELAYS) {
            const r = runClimb(c, plan, x, d, plan.margin ?? MARGIN, plan.jumpAt?.[i]);
            if (!r.pass) bad.push(`${plan.name} x${x} delay ${d}: ${r.end} [${r.touches.join(' ')}]`);
          }
      for (const plan of c.fails ?? [])
        for (const [i, x] of c.xs.entries())
          for (const d of DELAYS) {
            const r = runClimb(c, plan, x, d, 0, plan.jumpAt?.[i]);
            if (r.pass) bad.push(`${plan.name} x${x} delay ${d} passed: one face must not be a ladder`);
            // A thorn costs one rest at most: she is back on the rest she climbed from.
            if (r.back && r.back.y !== c.y)
              bad.push(`${plan.name} x${x}: a thorn put her back at ${r.back.y}`);
          }
      expect(bad).toEqual([]);
    }, 60_000);
});

describe('the Canopy climbs with their creatures in', () => {
  for (const cc of CREATURE_CLIMBS)
    it(`${cc.climb}: ${cc.plan.name}`, () => {
      const c = CLIMBS.find((q) => q.id === cc.climb) as Climb;
      const ok = c.xs.filter((x, i) =>
        cc.delays.every((d) => {
          const r = runClimb(c, cc.plan, x, d, 0, cc.plan.jumpAt?.[i], { creatures: true });
          return r.pass && (r.hits ?? 0) <= cc.maxHits;
        }),
      );
      expect(ok.length).toBeGreaterThanOrEqual(cc.of);
    }, 60_000);
  it('well-3b: the mid rest is a rest (10 s on it with the lampwing in, no hit)', () => {
    const c = CLIMBS.find((q) => q.id === 'well-3b') as Climb;
    for (const x of c.xs) expect(restSafe(c, x), `x ${x}`).toBe(0);
  }, 60_000);
});
