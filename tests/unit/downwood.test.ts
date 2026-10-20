import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs module without types
import { score } from '../../docs/design/places/place-score.mjs';
import { getRoom } from '../../src/scene/index';
import { getWorld, progression } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, createState, newSave, placePlayer, step } from '../../src/sim/index';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';
import { DESIGN } from '../../tools/levels/downwood';
import { downwoodProblems } from '../../tools/levels/downwood-check';
import { exportDownwood } from '../../tools/levels/downwood-export';

/**
 * The Downwood (memory/downwood.md): the world check, the built level's place-score, and the moonseeds. The gating
 * in the real sim is the solver's (tools/solve/downwood.ts, slow: run by hand; its last report is
 * tools/solve/downwood-report.json).
 */
describe('the Downwood', () => {
  it('passes the world check (but for the two later locks)', () => {
    expect(downwoodProblems()).toEqual([]);
    expect(progression(getWorld('downwood')).abilities).toEqual(['wallJump', 'glide']);
  });

  it('is the design, room for room and link for link', () => {
    const L = exportDownwood();
    expect(L.rooms.length).toBe(DESIGN.rooms.length);
    expect(L.links.length).toBe(DESIGN.links.length);
    const key = (l: { a: string; b: string }) => [l.a, l.b].sort().join('|');
    const built = new Map(L.links.map((l) => [key(l), l]));
    for (const d of DESIGN.links) {
      const b = built.get(key(d));
      expect(b, key(d)).toBeDefined();
      expect(b?.requires ?? null, key(d)).toBe(d.requires ?? null);
      expect(b?.oneway, key(d)).toBe(!!d.oneway);
      expect(b?.shortcut, key(d)).toBe(!!d.shortcut);
    }
  });

  it('as built, passes place-score', () => {
    const { out } = score(exportDownwood()) as { out: Array<{ name: string; ok: boolean; got: unknown }> };
    expect(out.filter((c) => !c.ok).map((c) => `${c.name}: ${c.got}`)).toEqual([]);
  });

  it('counts moonseeds into the flags a seed door opens on', () => {
    const t = cloneTuning(defaultTuning);
    const room = getRoom('dw-scar');
    const save = newSave(['wallJump']);
    save.flags.push('seed:dw-loft:seed-loft');
    const s = createState(1, t, room, [], ['wallJump'], save);
    const seed = (room.moonseeds ?? [])[0] as { x: number; y: number };
    placePlayer(s, seed.x, seed.y + 40, t, withShortcuts(room, s.save), []);
    const ev: SimEvent[] = [];
    const s2 = cloneState(s);
    step(s2, 0, t, room, ev, getWorld('downwood'));
    expect(s2.save.taken).toContain('dw-scar:seed-scar');
    expect(s2.save.flags).toContain('seeds:2');
    expect(ev.find((e) => e.type === 'seedTaken')).toMatchObject({ count: 2 });
  });
});
