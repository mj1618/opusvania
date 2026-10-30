/**
 * The Canopy's set-piece climbs are fair (review r4 #1: they passed only frame-perfect): each passes with a reaction
 * delay of 0, 6 and 10 frames before every kick, from three start x on its rest, with every thorn strip grown 64 px
 * at both ends; one face alone runs into thorns; a thorn hit puts her back on the rest the climb started from.
 * The climbs and the player model: tools/levels/climbs.ts.
 */
import { describe, expect, it } from 'vitest';
import { CLIMBS, DELAYS, MARGIN, runClimb } from '../../tools/levels/climbs';

describe('the Canopy climbs are fair', () => {
  for (const c of CLIMBS)
    it(`${c.id}: ${c.note}`, () => {
      const bad: string[] = [];
      for (const plan of c.plans)
        for (const [i, x] of c.xs.entries())
          for (const d of DELAYS) {
            const r = runClimb(c, plan, x, d, MARGIN, plan.jumpAt?.[i]);
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
