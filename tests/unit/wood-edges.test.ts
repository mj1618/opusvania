/**
 * The wood's mass edges (canopy review r5 #4): every free face and underside is a chain of lobes, so no painted mass
 * outline runs straight for more than 300 px (the reviewer's Sobel check on the chimney and hub shots, made a test
 * on the geometry the painter draws). Claw faces keep their lobes within 24 px of the collision (canopy r7: +-12 still
 * read as a ruler at play distance; past 24 her hold on the wall stops reading).
 */
import { describe, expect, it } from 'vitest';
import { EDGE } from '../../src/render/scene/lib/pf-edge';
import { massEdgeLines } from '../../src/render/scene/lib/pf-mass';
import { ROOMS } from '../../src/scene/index';

const woodRooms = Object.values(ROOMS).filter((r) => r.art?.kit === 'wood' && r.id.startsWith('cn-'));

/** The longest stretch (px along the edge) over which the edge's offset stays within `tol` px. */
function longestStraight(pts: number[], vertical: boolean, tol = 3): number {
  const n = pts.length / 2;
  let best = 0;
  let i = 0;
  for (let j = 0; j < n; j++) {
    for (;;) {
      let lo = Number.POSITIVE_INFINITY;
      let hi = Number.NEGATIVE_INFINITY;
      for (let k = i; k <= j; k++) {
        const o = pts[k * 2 + (vertical ? 0 : 1)] as number;
        lo = Math.min(lo, o);
        hi = Math.max(hi, o);
      }
      if (hi - lo <= tol || i >= j) break;
      i++;
    }
    const len = Math.abs(
      (pts[j * 2 + (vertical ? 1 : 0)] as number) - (pts[i * 2 + (vertical ? 1 : 0)] as number),
    );
    best = Math.max(best, len);
  }
  return best;
}

describe('wood mass edges', () => {
  it('finds the Canopy rooms', () => {
    expect(woodRooms.length).toBeGreaterThan(10);
  });

  it('no painted mass outline runs straight for more than 300 px', () => {
    const bad: string[] = [];
    for (const room of woodRooms) {
      for (const e of massEdgeLines(room)) {
        if (e.b - e.a <= 300) continue;
        const run = longestStraight(e.pts, e.kind === 'face');
        if (run > 300)
          bad.push(`${room.id} ${e.kind} at ${e.key} [${e.a}, ${e.b}]: straight for ${Math.round(run)} px`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('claw faces stay within 24 px of the collision', () => {
    expect(EDGE.claw.notch).toBeGreaterThanOrEqual(-24);
    expect(EDGE.claw.peak[1]).toBeLessThanOrEqual(24);
    for (const room of woodRooms) {
      for (const e of massEdgeLines(room)) {
        if (e.kind !== 'face') continue;
        const solid = room.solids.find(
          (s) => (s.x === e.key || s.x + s.w === e.key) && s.y <= e.a + 1 && s.y + s.h >= e.a + 1,
        );
        if (!solid || (solid as { kick?: unknown }).kick === false) continue;
        for (let k = 0; k < e.pts.length; k += 2)
          expect(Math.abs((e.pts[k] as number) - e.key)).toBeLessThanOrEqual(24.01);
      }
    }
  });

  it('undersides never rise above the collision', () => {
    for (const room of woodRooms)
      for (const e of massEdgeLines(room))
        if (e.kind === 'under')
          for (let k = 1; k < e.pts.length; k += 2)
            expect(e.pts[k] as number).toBeGreaterThanOrEqual(e.key - 0.01);
  });
});
