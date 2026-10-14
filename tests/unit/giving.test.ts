import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../src/input/script';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, createState, hashState } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { EnemySpawn, Scene } from '../../src/sim/scene';
import { seenLevel, seenScale } from '../../src/sim/seen';
import type { EnemyState } from '../../src/sim/state';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';
import { flatScene, newSim, type Sim } from './helpers';

/**
 * Giving (memory/giving.md): the creatures see the light she carries; she can give it away.
 * Flat test scenes: floor top at y = 800 (her body centre at y = 760).
 */
const G = defaultTuning.giving;
const B = defaultTuning.burrback;
const L = defaultTuning.lampwing;
const FLOOR = 800;
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) =>
  ev.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const burr = (x: number, facing: -1 | 1 = -1, id = `b${x}`): EnemySpawn => ({
  id,
  kind: 'burrback',
  x,
  y: FLOOR,
  facing,
});
const wing = (x: number, y: number, id = `w${x}`): EnemySpawn => ({ id, kind: 'lampwing', x, y, facing: -1 });
const scene = (enemies: EnemySpawn[], more: Partial<Scene> = {}): Scene => ({
  ...flatScene(),
  enemies,
  ...more,
});
const foe = (s: Sim, i = 0) => s.state.enemies[i] as EnemyState;
/** A lampwing that hangs where it is until something happens to it (no drift, no bob). */
function still(): Tuning {
  const t = cloneTuning(defaultTuning);
  Object.assign(t.lampwing, { hoverSpeed: 0, bobSpeed: 0 });
  return t;
}
/** She stands at `x` with `glints` in hand. */
function sim(sc: Scene, glints: number, x: number, t: Tuning = cloneTuning(defaultTuning)): Sim {
  const s = newSim(sc, t);
  s.state.pickups.count = glints;
  s.place(x, FLOOR);
  return s;
}
/** Box gap between her and enemy `i`. */
const gap = (s: Sim, i = 0) => {
  const p = s.state.player;
  const e = foe(s, i);
  return Math.max(e.x - (p.x + p.w), p.x - (e.x + e.w), 0);
};
/** Runs one frame at a time until `until` says so (or `max` frames): returns the frames run. */
function runUntil(s: Sim, script: string, until: (ev: SimEvent[]) => boolean, max = 2000): number {
  const masks = parseInputScript(script);
  for (let f = 0; f < max; f++) {
    const ev = s.run(masks[f % masks.length] === ActionBit.offer ? 'O1' : '.1');
    if (until(ev)) return f + 1;
  }
  return -1;
}

describe('seen: the light she carries', () => {
  it('her level is a step of her wallet (0 = she carries nothing), stored on the player for render every step', () => {
    expect([0, 1, 5, 6, 14, 15, 29, 30, 200].map((n) => seenLevel(n, G))).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
    expect([0, 1, 2, 3, 4].map((l) => seenScale(l, G))).toEqual([0, G.scale1, 1, G.scale3, G.scale4]);
    const s = sim(scene([]), 0, 2000);
    s.run('.1');
    expect([s.state.player.seenLevel, s.state.player.seen]).toEqual([0, 0]);
    s.state.pickups.count = 15;
    s.run('.1');
    expect([s.state.player.seenLevel, s.state.player.seen]).toEqual([3, 0.75]);
  });

  it('a burrback braces at her from further the more she carries; empty-handed, never: it walks right through her, and its touch does nothing', () => {
    const at = (glints: number) => {
      const s = sim(scene([burr(2400)]), glints, 2000);
      let g = -1;
      runUntil(
        s,
        '.',
        (ev) => {
          if (of(ev, 'enemyWindup').length) g = gap(s);
          return g >= 0;
        },
        400,
      );
      return { s, g };
    };
    for (const [glints, level] of [
      [1, 1],
      [6, 2],
      [15, 3],
      [40, 4],
    ] as const) {
      const reach = B.strikePx * seenScale(level, G);
      const { g } = at(glints);
      // (It walks 1.6 px a frame: it braces the first frame she is in reach.)
      expect(g, `${glints} glints`).toBeLessThanOrEqual(reach);
      expect(g, `${glints} glints`).toBeGreaterThan(reach - 3);
    }
    // Empty-handed: no brace, no flinch, not even a lifted head; it walks on through her, harmless.
    const { s } = at(0);
    s.run('.300');
    expect(of(s.events, 'enemyWindup')).toEqual([]);
    expect(of(s.events, 'enemyAware')).toEqual([]);
    expect(of(s.events, 'hurt')).toEqual([]);
    expect(foe(s).x + foe(s).w).toBeLessThan(s.state.player.x);
  });

  it('it becomes aware of her (`aware`, `enemyAware`) further off than it braces, and only when it can see her light', () => {
    for (const [glints, level] of [
      [6, 2],
      [40, 4],
    ] as const) {
      const s = sim(scene([burr(2700)]), glints, 2000);
      let d = -1;
      runUntil(
        s,
        '.',
        (ev) => {
          const a = of(ev, 'enemyAware')[0];
          if (a) d = a.px;
          return d >= 0;
        },
        600,
      );
      const r = B.noticePx * seenScale(level, G);
      expect(d, `${glints}`).toBeLessThanOrEqual(r);
      expect(d, `${glints}`).toBeGreaterThan(r - 3);
      expect(foe(s).aware).toBe(G.awareFrames);
    }
    const s = sim(scene([burr(2700)]), 0, 2000);
    s.run('.600');
    expect(of(s.events, 'enemyAware')).toEqual([]);
  });

  it('cut her empty-handed, it knows her: it braces at her, and its touch hurts', () => {
    const s = sim(scene([burr(2100, -1)]), 0, 2000);
    s.run('A1 .30');
    expect(of(s.events, 'enemyHit')).toHaveLength(1);
    const ev = s.run('.120');
    expect(of(ev, 'enemyWindup').length + of(ev, 'hurt').length).toBeGreaterThan(0);
  });

  it('she lands beside it empty-handed: no flinch; with a glint: the flinch', () => {
    for (const glints of [0, 1]) {
      const s = sim(scene([burr(2300, 1)]), glints, 2170);
      const ev = s.run('J10 .40');
      expect(of(ev, 'enemyAlert').length, `${glints}`).toBe(glints === 0 ? 0 : 1);
    }
  });

  it('a lampwing sees only the light she carries: never empty-handed, and from further the more she carries', () => {
    const notices = (glints: number, dx: number) => {
      const s = sim(scene([wing(2000 + dx, 760)]), glints, 2000, still());
      return of(s.run('.90'), 'enemyNotice').length;
    };
    expect(notices(0, 60)).toBe(0);
    expect([notices(6, L.noticePx - 4), notices(6, L.noticePx + 4)]).toEqual([1, 0]);
    const far = L.noticePx * G.scale4;
    expect([notices(40, Math.floor(far) - 4), notices(40, Math.ceil(far) + 4)]).toEqual([1, 0]);
    // Her light goes out in its dive (she has spent it): it gives up, `dark`.
    const s = sim(scene([wing(2150, 700)]), 1, 2000, still());
    runUntil(s, '.', (ev) => of(ev, 'enemyDive').length > 0, 200);
    s.state.pickups.count = 0;
    const ev = s.run('.3');
    expect(of(ev, 'enemyGiveUp')[0]?.cause).toBe('dark');
  });
});

describe('offer: one glint to what is in reach', () => {
  it('to a braced burrback: it stops and lowers (no ram), stands, then walks calm for `giftCalmFrames`; she walks through it; it costs one glint', () => {
    const s = sim(scene([burr(2300)]), 6, 2000);
    runUntil(s, '.', (ev) => of(ev, 'enemyWindup').length > 0, 400);
    expect(foe(s).mode).toBe('windup');
    const ev = s.run('O1');
    const o = of(ev, 'offer')[0];
    expect(o).toMatchObject({
      target: { kind: 'burrback', id: 'b2300' },
      frames: G.offerFlightFrames,
      wallet: 5,
    });
    expect([s.state.pickups.count, s.state.pickups.spent, s.state.pickups.gifted]).toEqual([5, 1, 1]);
    expect(s.state.player.offering).toBe(G.offerPoseFrames);
    const land = s.run(`.${G.offerFlightFrames}`);
    const g = of(land, 'enemyGift')[0];
    expect(g).toMatchObject({
      id: 'b2300',
      was: 'windup',
      frames: G.giftCalmFrames,
      stand: G.giftStandFrames,
      gifts: 1,
    });
    expect(of(land, 'enemyCharge')).toEqual([]);
    expect([foe(s).mode, foe(s).braced, foe(s).aware]).toEqual(['pause', false, 0]);
    // (Counted down once already: the creatures move after the glint lands, in the same step.)
    expect(foe(s).gift).toBe(G.giftCalmFrames - 1);
    expect(foe(s).calm).toBeGreaterThanOrEqual(G.giftCalmFrames - 1);
    // She walks through it and back, and stands in front of it: nothing, for the whole calm.
    const calm = s.run(`R40 L40 .${G.giftCalmFrames - 100}`);
    expect(of(calm, 'hurt')).toEqual([]);
    expect(of(calm, 'enemyWindup')).toEqual([]);
    // It runs out: she still carries light and stands in front of it: it braces again.
    s.run('.120');
    expect([foe(s).gift, foe(s).calm]).toEqual([0, 0]);
    const e = foe(s);
    s.place(e.facing < 0 ? e.x - 100 : e.x + e.w + 100, FLOOR);
    expect(of(s.run('.60'), 'enemyWindup').length).toBeGreaterThanOrEqual(1);
  });

  it('a cut ends the calm a gift bought (it is roused: it braces at her)', () => {
    const s = sim(scene([burr(2160, -1)]), 6, 2000);
    s.run('.1');
    expect(gap(s)).toBeLessThan(G.offerReachPx - 20);
    s.run(`O1 .${G.offerFlightFrames + 2}`);
    expect(foe(s).gift).toBeGreaterThan(0);
    s.place(foe(s).x - 40, FLOOR);
    s.run('A1 .5');
    expect([foe(s).gift, foe(s).calm]).toEqual([0, 0]);
    expect(foe(s).roused).toBeGreaterThan(0);
  });

  it('to a lampwing in its dive: it gives up (`gift`) and goes home; nothing touches her', () => {
    const s = sim(scene([wing(2150, 700)]), 3, 2000, still());
    runUntil(s, '.', (ev) => of(ev, 'enemyDive').length > 0, 200);
    const ev = s.run(`O1 .${G.offerFlightFrames + 300}`);
    expect(of(ev, 'enemyGift')[0]).toMatchObject({ kind: 'lampwing', was: 'dive' });
    expect(of(ev, 'enemyGiveUp')[0]?.cause).toBe('gift');
    expect(of(ev, 'hurt')).toEqual([]);
    expect(of(ev, 'enemyNotice')).toEqual([]);
  });

  it('empty hands, or nothing in reach: `offerMiss`, nothing spent; one offer every `offerCooldownFrames`', () => {
    const s = sim(scene([burr(3000)]), 0, 2000);
    expect(of(s.run('O1'), 'offerMiss')[0]).toMatchObject({ reason: 'empty', wallet: 0 });
    s.state.pickups.count = 4;
    s.run(`.${G.offerCooldownFrames}`);
    expect(of(s.run('O1'), 'offerMiss')[0]).toMatchObject({ reason: 'none', wallet: 4 });
    expect([s.state.pickups.count, s.state.pickups.spent]).toEqual([4, 0]);
    // Two presses a frame apart: the second waits for the cooldown (buffered), then goes.
    const t = sim(scene([burr(2150), burr(1850, 1)]), 4, 2000);
    const ev = t.run(`O1 .1 O1 .${G.offerCooldownFrames + 2}`);
    expect(of(ev, 'offer')).toHaveLength(2);
    expect(t.state.pickups.count).toBe(2);
  });

  it('cut down while the glint is in flight: it comes back to her', () => {
    // (Its back to her: it does not brace, so the cut lands.)
    const s = sim(scene([burr(2110, 1)]), 3, 2000);
    foe(s).hp = 1;
    const ev = s.run(`O1 A1 .${G.offerFlightFrames + 2}`);
    expect(of(ev, 'enemyDie')).toHaveLength(1);
    expect(of(ev, 'giftReturn')).toHaveLength(1);
    expect(of(ev, 'enemyGift')).toEqual([]);
    expect([s.state.pickups.spent, s.state.pickups.gifted]).toEqual([0, 0]);
  });

  it('to a dormant lantern: a part of its price, kept; given its whole price it catches, wherever she is', () => {
    const sc = scene([], { lanterns: [{ id: 'a', x: 2000, y: FLOOR }] });
    // She stands beside it, not at it (100 px off: in reach, out of its box).
    const s = sim(sc, 5, 2100);
    const ev = s.run(`O1 .${G.offerCooldownFrames} `.repeat(5));
    const gifts = of(ev, 'lanternGift');
    expect(gifts.map((g) => [g.given, g.need])).toEqual([
      [1, 11],
      [2, 10],
      [3, 9],
      [4, 8],
      [5, 7],
    ]);
    expect(s.state.goal.lanterns[0]?.given).toBe(5);
    expect([s.state.pickups.count, s.state.pickups.spent]).toEqual([0, 5]);
    // At it now: it tells her what it still wants (7, not 12).
    s.place(2000, FLOOR);
    const refuse = of(s.run('.20'), 'lanternRefuse')[0];
    expect([refuse?.have, refuse?.need]).toEqual([0, 7]);
    // The rest from beside it again: the last one in, it catches.
    s.state.pickups.count = 7;
    s.place(2100, FLOOR);
    const rest = s.run(`O1 .${G.offerCooldownFrames} `.repeat(7));
    const k = of(rest, 'lanternKindle')[0];
    expect(k).toMatchObject({ id: 'a', cost: 0, away: true });
    expect(s.state.goal.lanterns[0]?.lit).toBe(true);
    expect([s.state.pickups.count, s.state.pickups.spent]).toEqual([0, 12]);
  });

  it('to the heart: into the offering ahead of the ending; it counts at the gather, its tiers too', () => {
    const t = cloneTuning(defaultTuning);
    const sc = scene([], { lanterns: [{ id: 'a', x: 1000, y: FLOOR }], heart: { x: 3000, y: FLOOR } });
    const s = sim(sc, t.goal.offerTier1 + 12, 2900, t);
    const ev = s.run(`O1 .${G.offerCooldownFrames} `.repeat(t.goal.offerTier1));
    expect(
      of(ev, 'heartGift')
        .map((e) => e.given)
        .at(-1),
    ).toBe(t.goal.offerTier1);
    expect([s.state.goal.heartGiven, s.state.pickups.offered, s.state.pickups.count]).toEqual([
      t.goal.offerTier1,
      t.goal.offerTier1,
      12,
    ]);
    // Kindle the lantern with the rest (nothing left in her hands), wait the wake, walk in.
    s.place(1000, FLOOR);
    s.run(`.${t.goal.channelFrames + t.goal.heartWakeFrames}`);
    expect(s.state.pickups.count).toBe(0);
    s.place(3000, FLOOR);
    const end = s.run(`.${t.goal.holdFrames + 5}`);
    const g = of(end, 'gather')[0];
    expect([g?.offered, g?.offerTier]).toEqual([t.goal.offerTier1, 1]);
    expect(of(end, 'heartTier').map((e) => e.tier)).toEqual([1]);
    expect(s.state.goal.grove.flowers).toBe(true);
    // The tally holds: everything gathered = count + spent + lost + offered.
    const w = s.state.pickups;
    expect(w.count + w.spent + w.lost + w.offered).toBe(t.goal.offerTier1 + 12);
  });

  it('the `offer` action is bit 128, `O` in the input DSL; the same inputs give the same state; a clone is independent', () => {
    expect(ActionBit.offer).toBe(128);
    expect(parseInputScript('O2 R+O1')).toEqual([128, 128, 128 | ActionBit.right]);
    const run = () => {
      const s = sim(scene([burr(2300), wing(1700, 700)]), 9, 2000, still());
      s.run('.40 O1 .20 R30 O1 L60 .200');
      return s;
    };
    const a = run();
    const b = run();
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.events).toEqual(b.events);
    const c = cloneState(a.state);
    expect(hashState(c)).toBe(hashState(a.state));
    expect(createState(1, a.tuning, a.scene).version).toBe(20);
  });
});
