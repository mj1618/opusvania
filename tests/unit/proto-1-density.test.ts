/**
 * Lanternroot's density lint (tools/levels/density.ts, docs/design/levels/proto-1.md §4, review r1 §2): from the
 * standing spots of every chamber, at least 3 kinds of thing in view and 2 within 600 px, on the first visit and on
 * a revisit (glints taken, warm lamps spent, bark broken, hollows found; creatures and pods back). Signs, exits,
 * doors and gates are not kinds. The quiet places (§4) are left out.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { density } from '../../tools/levels/density';

const FIRST = 0.8;
const REVISIT = 0.7;

describe('Lanternroot: dense on the first pass and on a revisit', () => {
  for (const id of ['lr-night', 'lr-hall', 'lr-roots', 'lr-cache']) {
    it(id, () => {
      const room = getRoom(id);
      for (const c of density(room, false))
        expect(c.pass, `${c.chamber} first visit`).toBeGreaterThanOrEqual(FIRST);
      for (const c of density(room, true))
        expect(c.pass, `${c.chamber} revisit`).toBeGreaterThanOrEqual(REVISIT);
    });
  }

  it('signs, exits, doors and gates are not kinds', () => {
    const room = getRoom('lr-night');
    // (A sign alone in an empty chamber would make nothing dense: the lint has no kind for it.)
    const bare = {
      ...room,
      enemies: [],
      pickups: [],
      pods: [],
      bark: [],
      lures: [],
      hollows: [],
      bells: [],
      marks: { ...room.marks, covers: [] },
    };
    for (const c of density(bare as typeof room, false)) if (c.spots > c.quiet) expect(c.pass).toBe(0);
  });
});
