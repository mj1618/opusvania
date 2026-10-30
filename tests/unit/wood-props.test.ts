/**
 * The wood's stock props (canopy review r5 #6: the same stump-cone in seven rooms, the same talon in five): burls and
 * hanging clumps are drawn from four families each, never one twice in a room, none in more than three Canopy rooms.
 * The contact-sheet check made a test: the family is the silhouette.
 */
import { describe, expect, it } from 'vitest';
import { propFamilies, propKey, roomTapers } from '../../src/render/scene/lib/pf-mass';
import { ROOMS } from '../../src/scene/index';

const canopy = Object.values(ROOMS).filter((r) => r.art?.kit === 'wood' && r.id.startsWith('cn-'));

describe('wood props', () => {
  it('gives every taper a family, none twice in a room, none in more than three rooms', () => {
    const fam = propFamilies();
    const rooms = new Map<string, Set<string>>();
    for (const room of canopy) {
      const seen = new Set<string>();
      for (const t of roomTapers(room)) {
        const f = fam.get(propKey(room.id, t.up, t.x, t.y));
        expect(f, `${room.id} taper at ${t.x}, ${t.y}`).toBeDefined();
        const k = `${t.up ? 'burl' : 'hang'}:${f}`;
        expect(seen.has(k), `${room.id} has two ${k}`).toBe(false);
        seen.add(k);
        if (!rooms.has(k)) rooms.set(k, new Set());
        rooms.get(k)?.add(room.id);
      }
    }
    for (const [k, set] of rooms) expect(set.size, `${k} in ${[...set].join(', ')}`).toBeLessThanOrEqual(3);
  });

  it('never paints a claw face over 400 px as a taper (the fork face)', () => {
    for (const room of canopy)
      for (const t of roomTapers(room)) {
        const tiers = room.solids.filter(
          (s) =>
            (s.tag === 'root' || s.tag === 'ground') &&
            s.x >= t.x &&
            s.x + s.w <= t.x + t.w &&
            s.y >= t.y &&
            s.y + s.h <= t.y + t.h,
        );
        for (const side of [0, 1]) {
          const xs = new Map<number, number>();
          for (const s of tiers) {
            if ((s as { kick?: unknown }).kick === false) continue;
            const x = side ? s.x + s.w : s.x;
            xs.set(x, (xs.get(x) ?? 0) + s.h);
          }
          for (const [, h] of xs) expect(h, `${room.id} taper at ${t.x}, ${t.y}`).toBeLessThanOrEqual(400);
        }
      }
  });
});
