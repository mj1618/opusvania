/**
 * The Canopy's set-piece climbs are fair (review r4 #1: they passed only frame-perfect): each passes with a reaction
 * delay of 0, 6, 10 and 16 frames (r8, review r7 #9: a relaxed hand) before every kick, from three start x on its rest, with every thorn strip grown 64 px
 * at both ends; one face alone runs into thorns; a thorn hit puts her back on the rest the climb started from.
 * A plan that takes a reward off the line (review r5 #2: glints over a strip) is a risk: it must pass at 0 and 6
 * with half the margin.
 * The climbs and the player model: tools/levels/climbs.ts.
 * With the creatures in (review r6 #3, `CREATURE_CLIMBS`): r9's leg 2 untouched by the gallery's creatures, the Spire's
 * foot past its hawker at most one hit.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { CLIMBS, type Climb, CREATURE_CLIMBS, DELAYS, MARGIN, runClimb } from '../../tools/levels/climbs';

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

describe("leg 2's strip is off the climb (review r8 #1)", () => {
  it('thorn-w2 lies in the gallery floor, under no climbing face', () => {
    const t = (getRoom('cn-well').thorns ?? []).find((q) => q.id === 'thorn-w2');
    expect(t).toBeDefined();
    // A floor bed (wide, low), not a strip on a face.
    expect(t?.w ?? 0).toBeGreaterThan(t?.h ?? 0);
    expect(t?.y ?? 0).toBeGreaterThan(2432);
  });
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
});
