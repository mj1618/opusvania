import { describe, expect, it } from 'vitest';
import { GROVE, parseScene } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, hashState } from '../../src/sim/index';
import { pickupsWorth } from '../../src/sim/pickups';
import type { Pickup, Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { flatScene, newSim } from './helpers';

const T = defaultTuning.pickups;
type Wake = Extract<SimEvent, { type: 'pickupWake' }>;
type Take = Extract<SimEvent, { type: 'pickup' }>;
const wakes = (ev: SimEvent[]) => ev.filter((e): e is Wake => e.type === 'pickupWake');
const takes = (ev: SimEvent[]) => ev.filter((e): e is Take => e.type === 'pickup');

/** Flat floor at y = 800, player spawns at x = 2000 (box 1980..2020 x 720..800). */
function scene(pickups: Pickup[]): Scene {
  return { ...flatScene(), pickups };
}
const glint = (id: string, x: number, y = 760): Pickup => ({ id, kind: 'glint', x, y });

describe('pickups (sim rule)', () => {
  it('a glint out of reach waits; in reach it wakes and is collected exactly flightFrames later', () => {
    const far = newSim(scene([glint('a', 2020 + T.wakePx + 1)]));
    expect(far.run('.60')).toEqual([]);
    expect(far.state.pickups.timers).toEqual([0]);

    const s = newSim(scene([glint('a', 2020 + T.wakePx)]));
    const first = s.run('.1');
    expect(wakes(first)).toEqual([
      { type: 'pickupWake', id: 'a', kind: 'glint', x: 2020 + T.wakePx, y: 760, frames: T.flightFrames },
    ]);
    expect(s.state.pickups.timers[0]).toBe(T.flightFrames);
    expect(takes(s.run(`.${T.flightFrames - 1}`))).toEqual([]);
    const got = takes(s.run('.1'));
    expect(got).toEqual([
      {
        type: 'pickup',
        id: 'a',
        kind: 'glint',
        value: 1,
        x: 2020 + T.wakePx,
        y: 760,
        px: 2000,
        py: 760,
        combo: 0,
        total: 1,
      },
    ]);
    expect(s.state.pickups).toMatchObject({ timers: [-1], count: 1, taken: 1 });
    // Taken once, never again.
    expect(s.run('.120')).toEqual([]);
  });

  it('once woken it is hers even if she runs away', () => {
    const s = newSim(scene([glint('a', 2020 + T.wakePx)]));
    const ev = s.run(`.1 L${T.flightFrames + 2}`);
    expect(takes(ev)).toHaveLength(1);
    // The event says where she is now, not where the glint hung.
    expect(takes(ev)[0]?.px).toBeLessThan(1960);
  });

  it('a cluster goes in one by one, nearest first, with a rising combo', () => {
    const s = newSim(
      scene([glint('far', 2070), glint('near', 2030), glint('mid', 2050), glint('left', 1940)]),
    );
    const ev = s.run('.60');
    expect(wakes(ev).map((e) => e.id)).toEqual(['near', 'mid', 'left', 'far']);
    expect(wakes(ev).map((e) => e.frames)).toEqual(
      [0, 1, 2, 3].map((i) => T.flightFrames + i * T.staggerFrames),
    );
    const got = takes(ev);
    expect(got.map((e) => e.id)).toEqual(['near', 'mid', 'left', 'far']);
    expect(got.map((e) => e.combo)).toEqual([0, 1, 2, 3]);
    expect(got.map((e) => e.total)).toEqual([1, 2, 3, 4]);
  });

  it('the combo lapses after comboFrames without a pickup', () => {
    const s = newSim(scene([glint('a', 2030), glint('b', 2700)]));
    s.run('.40');
    s.run('R30 .80');
    expect(s.state.pickups.taken).toBe(1);
    const ev = s.run('R60');
    expect(takes(ev).map((e) => e.combo)).toEqual([0]);
  });

  it('a great glint wants a closer approach, takes longer and is worth more', () => {
    const x = 2020 + T.greatWakePx + 1;
    const s = newSim(scene([{ id: 'g', kind: 'great', x, y: 760 }]));
    expect(s.run('.30')).toEqual([]);
    const ev = s.run(`R1 .${T.greatFrames + 2}`);
    expect(wakes(ev)[0]?.frames).toBe(T.greatFrames);
    expect(takes(ev)[0]).toMatchObject({ kind: 'great', value: T.greatValue, total: T.greatValue });
    expect(pickupsWorth(s.scene, T)).toBe(T.greatValue);
  });

  it('is deterministic, hashes, clones, and a fresh state has everything back', () => {
    const run = () => {
      const s = newSim();
      s.run('R60 R+J30 R60 L40 .30');
      return s;
    };
    const a = run();
    const b = run();
    expect(a.state.pickups.taken).toBeGreaterThan(0);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.events).toEqual(b.events);
    // A clone does not share the timers.
    const c = cloneState(a.state);
    c.pickups.timers[0] = 99;
    expect(a.state.pickups.timers[0]).not.toBe(99);
    // Collecting changes the hash.
    const fresh = newSim();
    expect(hashState(fresh.state)).not.toBe(hashState(a.state));
    // Restart = a new state: nothing taken. Teleport keeps what was gathered.
    expect(fresh.state.pickups).toEqual({
      timers: (GROVE.pickups ?? []).map(() => 0),
      count: 0,
      spent: 0,
      offered: 0,
      lost: 0,
      bonus: 0,
      drops: [],
      dropSeq: 0,
      taken: 0,
      combo: 0,
      comboTimer: 0,
      gate: 0,
    });
    const before = a.state.pickups.count;
    a.place(3000, 448);
    expect(a.state.pickups.count).toBe(before);
  });

  it('a scene without pickups is fine', () => {
    const s = newSim(flatScene());
    expect(s.run('R30')).not.toContainEqual(expect.objectContaining({ type: 'pickup' }));
    expect(s.state.pickups.timers).toEqual([]);
  });
});

describe('the grove pickups', () => {
  const list = GROVE.pickups ?? [];
  const body = defaultTuning.body;
  const J = defaultTuning.shape;

  it('about sixty glints and a handful of great ones, ids unique', () => {
    const greats = list.filter((p) => p.kind === 'great');
    expect(list.length - greats.length).toBeGreaterThanOrEqual(40);
    expect(list.length - greats.length).toBeLessThanOrEqual(68);
    expect(greats.length).toBeGreaterThanOrEqual(4);
    expect(greats.length).toBeLessThanOrEqual(6);
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
  });

  it('rejects pickups that are outside the scene, inside a solid, or share an id', () => {
    const base = { ...GROVE, pickups: [] as Pickup[] };
    expect(() => parseScene({ ...base, pickups: [glint('a', -5, 100)] })).toThrow(/outside/);
    expect(() => parseScene({ ...base, pickups: [glint('a', 100, 1300)] })).toThrow(/inside a solid/);
    expect(() => parseScene({ ...base, pickups: [glint('a', 1000, 1200), glint('a', 1100, 1200)] })).toThrow(
      /two pickups/,
    );
    expect(() => parseScene({ ...base, pickups: [{ id: 'a', kind: 'coin', x: 1000, y: 1200 }] })).toThrow();
  });

  it('every one is reachable in principle: in free space and within jump reach of somewhere to stand', () => {
    const tops = [...GROVE.solids, ...GROVE.oneWays];
    // The most a jump plus a double jump lifts the top of the box above a floor, plus the reach.
    const rise = J.jumpHeightPx + J.doubleJumpHeightPx + body.height;
    for (const p of list) {
      // The line over the right zone hangs on the summit glide, out of any jump's reach on purpose
      // (pickups-pilot.test.ts flies it).
      if (p.id.startsWith('sky-') || p.id === 'great-sky') continue;
      const reach = p.kind === 'great' ? T.greatWakePx : T.wakePx;
      const ok = tops.some((r) => {
        const dx = p.x < r.x ? r.x - p.x : p.x > r.x + r.w ? p.x - (r.x + r.w) : 0;
        const up = r.y - p.y;
        // Above the floor by no more than a double jump reaches, or below it by a short drop;
        // sideways no further than a jump carries.
        return up <= rise + reach - 8 && up >= -200 && dx <= 320;
      });
      expect(ok, `pickup ${p.id} at ${p.x},${p.y}`).toBe(true);
      // Room for the body somewhere within reach of it (not sealed in rock).
      expect(
        GROVE.solids.some(
          (r) => p.x >= r.x - 4 && p.x <= r.x + r.w + 4 && p.y >= r.y - 4 && p.y <= r.y + r.h + 4,
        ),
        `pickup ${p.id} touches a solid`,
      ).toBe(false);
    }
  });

  it('running right from the spawn and jumping the pool gathers the first line and the arc', () => {
    const s = newSim();
    const ev = s.run('R36 R+J30 R40 .30');
    const ids = takes(ev).map((e) => e.id);
    expect(ids.slice(0, 3)).toEqual(['spawn-1', 'spawn-2', 'spawn-3']);
    expect(ids.filter((id) => id.startsWith('pool-arc')).length).toBeGreaterThanOrEqual(4);
    // A line plays as a run: each a few frames after the last, the combo climbing.
    expect(takes(ev).map((e) => e.combo)).toEqual(ids.map((_, i) => i));
  });

  it('the tuning has the numbers the rule needs', () => {
    const t = cloneTuning(defaultTuning);
    expect(t.pickups.wakePx).toBeGreaterThan(t.pickups.greatWakePx);
    expect(t.pickups.greatFrames).toBeGreaterThan(t.pickups.flightFrames);
  });
});
