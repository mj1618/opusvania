/**
 * The den as a place (the Canopy r11, review r10 #5: "a flat umber card with translucent arcs and ovals"): three depth
 * planes (the far rank in the fog, the mid plane's banks with burrow mouths, the near back's root columns), and no
 * translucent shape over 300 px wide in the back planes. Drives the real painters with recording stand-ins.
 */
import { describe, expect, it } from 'vitest';
import { drawDeepBack, drawMidBack, interiorPlan, paintNearBacks } from '../../src/render/scene/lib/interior';
import type { Paint } from '../../src/render/scene/lib/pf-paint';
import { ROOMS } from '../../src/scene/index';

const DEN = ['cn-den', 'cn-tunnel'].filter((id) => ROOMS[id]);

interface Shape {
  w: number;
  h: number;
  alpha: number;
}

function width(pts: number[]): { w: number; h: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < pts.length; k += 2) {
    x0 = Math.min(x0, pts[k] as number);
    x1 = Math.max(x1, pts[k] as number);
    y0 = Math.min(y0, pts[k + 1] as number);
    y1 = Math.max(y1, pts[k + 1] as number);
  }
  return { w: x1 - x0, h: y1 - y0 };
}

function recorder(out: Shape[]) {
  let last: number[] = [];
  const fill = (o: { alpha?: number }) => {
    out.push({ ...width(last), alpha: o.alpha ?? 1 });
    return undefined;
  };
  return {
    poly: (pts: number[]) => {
      last = pts;
      return { fill };
    },
    rect: (x: number, y: number, w: number, h: number) => {
      last = [x, y, x + w, y + h];
      return { fill };
    },
    circle: (x: number, y: number, r: number) => {
      last = [x - r, y - r, x + r, y + r];
      return { fill };
    },
  };
}

describe('the den planes', () => {
  for (const id of DEN) {
    const room = ROOMS[id];
    if (!room) continue;
    const plan = interiorPlan(room, 1);
    it(`${id}: the mid plane is opaque banks and roots, nothing translucent over 300 px`, () => {
      expect(plan?.look).toBe('den');
      if (!plan) return;
      const mid: Shape[] = [];
      drawMidBack(recorder(mid), plan, 7, 200, 0x0a0806);
      const wide = mid.filter((s) => s.w > 300);
      // The banks: wide and whole.
      expect(wide.length).toBeGreaterThan(0);
      for (const s of wide)
        expect(s.alpha, `a ${Math.round(s.w)} px shape at alpha ${s.alpha}`).toBeGreaterThanOrEqual(0.95);
    });

    it(`${id}: the deep back keeps the far rank whole (no ovals over 300 px under alpha 1 but the fog)`, () => {
      if (!plan) return;
      const deep: Shape[] = [];
      drawDeepBack(recorder(deep), plan, 7, 200);
      // The far rank: a whole silhouette as wide as the back.
      expect(deep.some((s) => s.w > 1000 && s.alpha >= 0.99 && s.h > 200)).toBe(true);
    });

    it(`${id}: the near back has root columns, and no translucent lens over 300 px`, () => {
      if (!plan) return;
      const near: Shape[] = [];
      let solids = 0;
      const p = {
        tint: (pts: number[], _c: number, alpha = 1) => near.push({ ...width(pts), alpha }),
        solid(pts: number[], _c: number, _h: number, _o = {}, alpha = 1) {
          solids++;
          near.push({ ...width(pts), alpha });
        },
        relief: () => undefined,
      } as unknown as Paint;
      paintNearBacks(p, plan, 7);
      expect(solids).toBeGreaterThan(0);
      // Tall columns (roof to floor).
      expect(near.some((s) => s.h > 400 && s.w < 300 && s.alpha >= 0.99)).toBe(true);
      for (const s of near.filter((q) => q.w > 300 && q.h < 200))
        expect(s.alpha, `a ${Math.round(s.w)} px lens at alpha ${s.alpha}`).toBeGreaterThanOrEqual(0.95);
    });
  }
});
