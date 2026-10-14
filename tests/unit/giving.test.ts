import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../src/input/script';
import { GROVE } from '../../src/scene/index';
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
    // (One glint is too small a light to be seen: giving round 2.)
    expect([0, 1, 2, 5, 6, 14, 15, 44, 45, 200].map((n) => seenLevel(n, G))).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
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
      [2, 1],
      [6, 2],
      [15, 3],
      [50, 4],
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
      [50, 4],
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

  it('she lands beside it empty-handed (or with one glint): no flinch; with two: the flinch', () => {
    for (const glints of [0, 1, 2]) {
      const s = sim(scene([burr(2300, 1)]), glints, 2170);
      const ev = s.run('J10 .40');
      expect(of(ev, 'enemyAlert').length, `${glints}`).toBe(glints < G.seen1 ? 0 : 1);
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
    expect([notices(50, Math.floor(far) - 4), notices(50, Math.ceil(far) + 4)]).toEqual([1, 0]);
    // Her light goes out in its dive (she has spent it): it gives up, `dark`.
    const s = sim(scene([wing(2150, 700)]), 2, 2000, still());
    runUntil(s, '.', (ev) => of(ev, 'enemyDive').length > 0, 200);
    s.state.pickups.count = 0;
    const ev = s.run('.3');
    expect(of(ev, 'enemyGiveUp')[0]?.cause).toBe('dark');
  });
});

describe('offer: one glint to what is in reach', () => {
  it('to a braced burrback: it stops and lowers (no ram), stands, then walks calm while she stays on its ground; she walks through it; it costs one glint', () => {
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
    // She walks through it and back, and stays on its ground: nothing, long past the countdown (its
    // warmth fades: `gift` runs down to 1 and holds there while she is near).
    const calm = s.run(`R40 L40 .${G.giftCalmFrames * 2}`);
    expect(of(calm, 'hurt')).toEqual([]);
    expect(of(calm, 'enemyWindup')).toEqual([]);
    expect(foe(s).gift).toBe(1);
    // She leaves its ground: the calm ends. Back with light, in front of it: it braces again.
    s.place(2000 + G.giftStayPx + 400, FLOOR);
    s.run('.3');
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

  it('to a dormant lantern: a part of its price, kept; promised, it catches the step her wallet covers the rest, wherever she is', () => {
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
    // Promised (giving round 2): far off, the step her wallet covers the rest, it catches without her
    // (as a pledge does): laying light down never strands her.
    s.place(3500, FLOOR);
    s.state.pickups.count = 6;
    expect(of(s.run('.5'), 'lanternKindle')).toEqual([]);
    s.state.pickups.count = 7;
    const k = of(s.run('.1'), 'lanternKindle')[0];
    expect(k).toMatchObject({ id: 'a', cost: 7, away: true });
    expect(s.state.goal.lanterns[0]?.lit).toBe(true);
    expect([s.state.pickups.count, s.state.pickups.spent]).toEqual([0, 12]);
    // A lamp waits for her (optional spending): given part, it does not take the rest from afar.
    const m = sim(scene([], { lamps: [{ id: 'm', x: 2000, y: FLOOR }] }), 1, 2100);
    m.run(`O1 .${G.offerLightFlightFrames + 2}`);
    expect(m.state.goal.lamps[0]?.given).toBe(1);
    m.place(3500, FLOOR);
    m.state.pickups.count = 20;
    m.run('.10');
    expect(m.state.goal.lamps[0]?.lit).toBe(false);
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

describe('giving round 2 (playtest-giving)', () => {
  it('a lampwing gift is landable: lamp-glade staged as in the playtest (wallet 8 at 760, 960): a press anywhere in its tell or the first 15 frames of its dive stops it, untouched', () => {
    /** Steps until its tell (`enemyNotice`), then `k` more, presses offer, and plays 120 frames on. */
    const run = (k: number) => {
      const s = newSim(GROVE);
      s.place(760, 960);
      s.state.pickups.count = 8;
      let tell = -1;
      for (let f = 0; f < 60 && tell < 0; f++)
        if (of(s.run('.1'), 'enemyNotice').some((e) => e.id === 'lamp-glade')) tell = f;
      expect(tell).toBeGreaterThanOrEqual(0);
      if (k > 0) s.run(`.${k}`);
      const ev = s.run('O1 .120');
      return {
        hurt: of(ev, 'hurt').filter((e) => e.source.id === 'lamp-glade').length,
        gift: of(ev, 'enemyGift').find((e) => e.id === 'lamp-glade'),
        offer: of(ev, 'offer')[0],
      };
    };
    const tell = defaultTuning.lampwing.curiousFrames;
    // Unanswered: its dive reaches her 24 frames in.
    const none = newSim(GROVE);
    none.place(760, 960);
    none.state.pickups.count = 8;
    expect(of(none.run('.120'), 'hurt').some((e) => e.source.id === 'lamp-glade')).toBe(true);
    for (let k = 0; k <= tell + 15; k++) {
      const r = run(k);
      expect(r.gift, `press ${k} frames after the tell began`).toBeDefined();
      expect(r.hurt, `press ${k} frames after the tell began`).toBe(0);
      // (In its tell and its dive the glint flies in `offerWingFlightFrames`.)
      expect(r.offer?.frames, `${k}`).toBe(G.offerWingFlightFrames);
    }
  });

  it('HOLDING offer streams glints into a light (one every `offerStreamFrames` after `offerStreamDelayFrames`) and the light catches; a creature takes one per press however long it is held', () => {
    const sc = scene([], { lamps: [{ id: 'm', x: 2000, y: FLOOR }] });
    const s = sim(sc, 10, 2100);
    const ev = s.run('O120 .20');
    const gifts = of(ev, 'lampGift');
    expect(gifts.length).toBe(defaultTuning.goal.lampCost);
    expect(s.state.goal.lamps[0]?.lit).toBe(true);
    expect(s.state.pickups.count).toBe(10 - defaultTuning.goal.lampCost);
    const at = of(ev, 'offer').map((e) => e.seq);
    expect(at.length).toBe(defaultTuning.goal.lampCost);
    // A steady stream: after the first (the press) and the lead, one every `offerStreamFrames`.
    const frames: number[] = [];
    const t = sim(sc, 10, 2100);
    for (let f = 0; f < 80; f++) if (of(t.run('O1'), 'offer').length) frames.push(f);
    expect(frames[0]).toBe(0);
    expect(frames[1]).toBe(G.offerStreamDelayFrames);
    for (let k = 2; k < frames.length; k++)
      expect((frames[k] ?? 0) - (frames[k - 1] ?? 0)).toBe(G.offerStreamFrames);
    // A creature in reach: held for two seconds, it takes one glint.
    const c = sim(scene([burr(2150, 1)]), 10, 2000);
    const cv = c.run('O120');
    expect(of(cv, 'offer').length).toBe(1);
    expect(c.state.pickups.count).toBe(9);
  });

  it('a cut aimed at a pod passes over a creature she has calmed: it is not hit, not roused', () => {
    const sc = scene([burr(2080, 1)], { pods: [{ id: 'p', x: 2070, y: FLOOR - 22, mount: 'sit' }] });
    const s = sim(sc, 4, 2000);
    s.run(`O1 .${G.offerFlightFrames + 2}`);
    expect(foe(s).gift).toBeGreaterThan(0);
    const ev = s.run('A1 .30');
    expect(of(ev, 'podHit').length + of(ev, 'podBurst').length).toBe(1);
    expect(of(ev, 'enemyHit')).toEqual([]);
    expect([foe(s).roused, foe(s).gift > 0, foe(s).hp]).toEqual([0, true, foe(s).hpMax]);
    // With no pod in reach, a cut lands on it (and ends its calm).
    s.run('.40');
    s.place(foe(s).x - 30, FLOOR);
    const again = s.run('A1 .10');
    expect(of(again, 'enemyHit').length).toBe(1);
    expect(foe(s).gift).toBe(0);
  });

  it("what she gave creatures by hand counts in the heart's offering and its tier", () => {
    const t = cloneTuning(defaultTuning);
    const sc = scene([burr(1800, 1), burr(2300, -1, 'b2'), burr(2700, -1, 'b3')], {
      lanterns: [{ id: 'a', x: 1000, y: FLOOR }],
      heart: { x: 3600, y: FLOOR },
    });
    const s = sim(sc, 12 + 3, 1000, t);
    s.run(`.${t.goal.channelFrames + 2}`);
    expect(s.state.goal.lit).toBe(1);
    for (const e of s.state.enemies) {
      s.place(e.x + e.w / 2 - 100, FLOOR);
      s.run(`O1 .${G.offerFlightFrames + 2}`);
    }
    expect(s.state.pickups.gifted).toBe(3);
    // A tier's worth in hand at the heart: with the three given, she passes the first tier.
    s.state.pickups.count = t.goal.offerTier1 - 3;
    s.place(3600, FLOOR);
    const end = s.run(`.${t.goal.heartWakeFrames + t.goal.holdFrames + 15}`);
    const g = of(end, 'gather')[0];
    expect([g?.offered, g?.offerTier, g?.gifted, g?.calmed]).toEqual([t.goal.offerTier1, 1, 3, 3]);
    expect(of(end, 'heartTier').map((e) => e.tier)).toEqual([1]);
  });
});
