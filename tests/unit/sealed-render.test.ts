/**
 * Sealed air drawn as a hollow in the wood (canopy r9b, src/render/scene/lib/sealed.ts): painters see it as mass,
 * the deep backs leave it out, its outline is the union's, and the den's warning's ledges are root knuckles.
 */
import { describe, expect, it } from 'vitest';
import { shelfFamilies, shelfKey } from '../../src/render/scene/lib/families';
import { interiorPlan } from '../../src/render/scene/lib/interior';
import {
  hollowCavities,
  type SealedRect,
  sealedEdges,
  sealedGroups,
  sealedOf,
  withSealedMass,
} from '../../src/render/scene/lib/sealed';
import { ROOMS } from '../../src/scene/index';

const sealedRooms = Object.values(ROOMS).filter((r) => sealedOf(r).length > 0);

describe('sealed air, render side', () => {
  it('some Canopy rooms have sealed air', () => {
    expect(sealedRooms.length).toBeGreaterThan(5);
  });

  it('is mass to the painters, appended after the real solids (indices kept), the room itself untouched', () => {
    for (const room of sealedRooms) {
      const n = room.solids.length;
      const p = withSealedMass(room);
      expect(p.solids.length).toBe(n + sealedOf(room).length);
      expect(p.solids.slice(0, n)).toEqual(room.solids);
      expect(room.solids.length).toBe(n);
      expect(withSealedMass(p)).toBe(p);
      for (const s of p.solids.slice(n)) expect(['root', 'ground']).toContain(s.tag);
    }
  });

  it('draws no deep back over sealed air (the parallax backs drew displaced ruled rectangles)', () => {
    for (const room of sealedRooms) {
      const plan = interiorPlan(withSealedMass(room), 1);
      for (const b of plan?.backs ?? [])
        for (const s of sealedOf(room))
          expect(
            b.x === s.x && b.y === s.y && b.w === s.w && b.h === s.h,
            `${room.id} back ${JSON.stringify(b)}`,
          ).toBe(false);
    }
  });

  it('outlines a group by its union: no lip where two rects meet', () => {
    const group = [
      { x: 0, y: 0, w: 400, h: 200 },
      { x: 400, y: 0, w: 200, h: 400 },
    ];
    expect(sealedGroups(group)).toHaveLength(1);
    const edges = sealedEdges(group);
    // The shared side x = 400 (y 0-200) is inside the union: no edge runs along it.
    for (const e of edges)
      if (e.v === 400 && (e.side === 'e' || e.side === 'w')) expect(e.a).toBeGreaterThanOrEqual(192);
    const len = edges.reduce((a, e) => a + e.b - e.a, 0);
    // The union's perimeter: 2 x (600 + 400).
    expect(Math.abs(len - 2000)).toBeLessThan(40);
  });

  it("the den's warning's ledges are root knuckles", () => {
    const fam = shelfFamilies();
    const tunnel = ROOMS['cn-tunnel'];
    if (!tunnel) return;
    const arena = tunnel.oneWays
      .map((o, i) => ({ o, f: fam.get(shelfKey('cn-tunnel', i)) }))
      .filter(({ o }) => o.x > 7000);
    expect(arena.length).toBeGreaterThan(0);
    for (const { f } of arena) expect(f).toBe('hump');
  });

  // Review r9 #5: hollows are pockets, not panels (windows, cabinets, picture frames).
  /** The longest run of an outline whose points all lie within 3 px of its chord, px. */
  const longestStraight = (pts: number[]): number => {
    const n = pts.length / 2;
    let best = 0;
    for (let i = 0; i < n; i++) {
      const ax = pts[i * 2] as number;
      const ay = pts[i * 2 + 1] as number;
      for (let k = 2; k < n; k++) {
        const j = (i + k) % n;
        const bx = pts[j * 2] as number;
        const by = pts[j * 2 + 1] as number;
        const L = Math.hypot(bx - ax, by - ay);
        let ok = true;
        for (let q = 1; q < k && ok; q++) {
          const m = (i + q) % n;
          const d = Math.abs(
            (bx - ax) * (ay - (pts[m * 2 + 1] as number)) - (ax - (pts[m * 2] as number)) * (by - ay),
          );
          if (d / Math.max(L, 1) > 3) ok = false;
        }
        if (!ok) break;
        best = Math.max(best, L);
      }
    }
    return best;
  };
  /** Distance from (x, y) inside the union to its outside, px (sampled). */
  const toEdge = (group: readonly SealedRect[], x: number, y: number): number => {
    const inside = (px: number, py: number) =>
      group.some((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
    for (let d = 0; d < 400; d += 4)
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2;
        if (!inside(x + Math.cos(t) * d, y + Math.sin(t) * d)) return d;
      }
    return 400;
  };

  it('pockets, not panels: no straight run over 200 px, and the outline >= 80 px from the mass over 70% of it', () => {
    let checked = 0;
    for (const room of sealedRooms)
      sealedGroups(sealedOf(room)).forEach((group, gi) => {
        for (const cv of hollowCavities(group, gi * 977 + 1)) {
          const straight = longestStraight(cv.pts);
          expect(
            straight,
            `${room.id} group ${gi}: a straight run of ${straight.toFixed(0)} px`,
          ).toBeLessThanOrEqual(200);
          // (Groups too thin for an 80 px inset on both sides are inset by 30% of their width.)
          const thin = group.every((r) => Math.min(r.w, r.h) < (2 * 80) / 0.3);
          if (thin) continue;
          const n = cv.pts.length / 2;
          let far = 0;
          for (let i = 0; i < n; i++)
            if (toEdge(group, cv.pts[i * 2] as number, cv.pts[i * 2 + 1] as number) >= 76) far++;
          expect(far / n, `${room.id} group ${gi}`).toBeGreaterThanOrEqual(0.7);
          checked++;
        }
      });
    expect(checked).toBeGreaterThan(3);
  });

  it('a long hollow is 2-4 pockets with wood between them', () => {
    const cav = hollowCavities([{ x: 0, y: 0, w: 2400, h: 600 }], 7);
    expect(cav.length).toBeGreaterThanOrEqual(2);
    expect(cav.length).toBeLessThanOrEqual(4);
    const xs = cav.map((c) => [
      Math.min(...c.pts.filter((_, j) => j % 2 === 0)),
      Math.max(...c.pts.filter((_, j) => j % 2 === 0)),
    ]);
    xs.sort((a, b) => (a[0] as number) - (b[0] as number));
    for (let i = 1; i < xs.length; i++)
      expect((xs[i]?.[0] as number) - (xs[i - 1]?.[1] as number)).toBeGreaterThan(20);
  });
});
