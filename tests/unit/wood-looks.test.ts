/**
 * The wood's insides (canopy review r4 #4, #6): the Canopy's rooms take their look by region, an enclosed room is
 * graded as its place, and nothing in a deep back is a ruled band (straight-edged bands crossing straight grain read as
 * a checker; a back's edge in open air never stays a ruled line).
 */
import { describe, expect, it } from 'vitest';
import { backMask, drawDeepBack, interiorPlan, lookOf } from '../../src/render/scene/lib/interior';
import { gradeLookOf } from '../../src/render/scene/lib/looks';
import { ROOMS } from '../../src/scene/index';

const room = (id: string) => {
  const r = ROOMS[id];
  if (!r) throw new Error(`no room ${id}`);
  return r;
};

describe('wood looks', () => {
  it('assigns the Canopy looks by region', () => {
    const want: Record<string, string> = {
      'cn-trunk': 'heartwood',
      'cn-rot': 'heartwood',
      'cn-crawl': 'heartwood',
      'cn-webs': 'heartwood',
      'cn-well': 'shaft',
      'cn-elder': 'shaft',
      'cn-cellar': 'nest',
      'cn-galleries': 'nest',
      'cn-larder': 'nest',
      'cn-nook': 'canopy',
      'cn-hollowroot': 'canopy',
      'cn-ledge': 'canopy',
      'cn-bower': 'canopy',
      'cn-tunnel': 'den',
      'cn-burrow': 'nest',
      'cn-den': 'den',
    };
    for (const [id, look] of Object.entries(want)) if (ROOMS[id]) expect(lookOf(room(id)), id).toBe(look);
  });

  it('grades only enclosed rooms as their place', () => {
    if (ROOMS['cn-trunk']) expect(gradeLookOf(room('cn-trunk'))).toBe('heartwood');
    if (ROOMS['cn-out']) expect(gradeLookOf(room('cn-out'))).toBeNull();
    if (ROOMS['cn-hub']) expect(gradeLookOf(room('cn-hub'))).toBeNull();
  });

  it('draws no ruled bands in a deep back (one base rect per back, everything else wavers)', () => {
    for (const r of Object.values(ROOMS)) {
      if (!r.id.startsWith('cn-')) continue;
      const plan = interiorPlan(r, 1);
      if (!plan) continue;
      let rects = 0;
      const fill = { fill: () => fill };
      drawDeepBack(
        {
          poly: () => fill,
          rect: () => {
            rects++;
            return fill;
          },
          circle: () => fill,
        },
        plan,
        1,
        300,
      );
      expect(rects, r.id).toBe(plan.backs.length);
    }
  });

  it("tears a back's edge where it meets open air, even when part of that edge is under mass", () => {
    for (const r of Object.values(ROOMS)) {
      if (!r.id.startsWith('cn-')) continue;
      const plan = interiorPlan(r, 1);
      if (!plan) continue;
      const masks = backMask(plan, 1);
      plan.backs.forEach((b, i) => {
        const e = plan.edges[i];
        if (!e?.n || !e.at) return;
        // Where the air over the top edge is fully open, the mask's top there is drawn well in.
        const pts = masks[i] as number[];
        for (let x = b.x + 200; x < b.x + b.w - 200; x += 200) {
          if (e.at('n', x) < 1) continue;
          let top = Infinity;
          for (let k = 0; k < pts.length; k += 2)
            if (Math.abs((pts[k] as number) - x) < 12) top = Math.min(top, pts[k + 1] as number);
          expect(top - b.y, `${r.id} back ${i} x ${x}`).toBeGreaterThan(100);
        }
      });
    }
  });
});
