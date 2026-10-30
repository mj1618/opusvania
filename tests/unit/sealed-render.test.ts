/**
 * Sealed air drawn as a hollow in the wood (canopy r9b, src/render/scene/lib/sealed.ts): painters see it as mass,
 * the deep backs leave it out, its outline is the union's, and the den's warning's ledges are root knuckles.
 */
import { describe, expect, it } from 'vitest';
import { shelfFamilies, shelfKey } from '../../src/render/scene/lib/families';
import { interiorPlan } from '../../src/render/scene/lib/interior';
import { sealedEdges, sealedGroups, sealedOf, withSealedMass } from '../../src/render/scene/lib/sealed';
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
});
