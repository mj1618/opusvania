import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, createState, hashState, step } from '../../src/sim/index';
import { dropGlints } from '../../src/sim/pickups';
import type { EnemySpawn, Lantern, Scene } from '../../src/sim/scene';
import type { EnemyState } from '../../src/sim/state';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim, waking } from './helpers';

// These rule tests were written before the heart's wake had a length: here it is ready the step
// after it wakes (vitest gives each test file its own copy of the module). The wait has its own tests.
defaultTuning.goal.heartWakeFrames = 0;
// (Nor did the woken heart keep its surroundings calm: these scenes have one lantern and fade her beside it.)
defaultTuning.goal.heartCalmPx = 0;

/**
 * What the first playtest asked of the goal (memory/goal.md, memory/enemies.md): kindling and lit
 * lanterns are safe (calm, the channel, the sanctuary), a refusal needs her to stand there, a fade
 * costs (2 lights, a third of the wallet left where she fell), the ending carries a tally.
 * Flat test scene: floor top at 800, 4000 wide.
 */
const FLOOR = 800;
const G = defaultTuning.goal;
const H = defaultTuning.health;
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) =>
  ev.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const X = 2400;
const one: Lantern[] = [{ id: 'a', x: X, y: FLOOR }];
const burr = (x: number, facing: -1 | 1 = -1, id = `b${x}`): EnemySpawn => ({
  id,
  kind: 'burrback',
  x,
  y: FLOOR,
  facing,
});
const wing = (x: number, y: number, radius = 60): EnemySpawn => ({
  id: `w${x}`,
  kind: 'lampwing',
  x,
  y,
  facing: -1,
  radius,
});
const scene = (enemies: EnemySpawn[] = [], lanterns: Lantern[] = one): Scene => ({
  ...flatScene(),
  lanterns,
  heart: { x: 3600, y: FLOOR },
  enemies,
});
// (`waking`: the burrbacks here walk round her lights while she stands there spent; giving round 3.)
function sim(sc: Scene, glints = 0, at?: number, t: Tuning = waking()): Sim {
  const s = newSim(sc, t);
  s.state.pickups.count = glints;
  if (at !== undefined) s.place(at, FLOOR);
  return s;
}
const foe = (s: Sim, i = 0) => s.state.enemies[i] as EnemyState;
/** Lights lantern 0 by standing at it. */
function light(s: Sim): void {
  s.state.pickups.count += G.cost;
  s.place(X, FLOOR);
  s.run(`.${G.channelFrames}`);
  expect(s.state.goal.lanterns[0]?.lit).toBe(true);
  // ... and waits out the calm the kindling brought, so what follows is not owed to it.
  s.run(`.${G.calmFrames}`);
}
/** Her last light goes out on enemy `i` (she is put on top of it). Returns the events up to just after the re-form. */
function fadeOn(s: Sim, i = 0): SimEvent[] {
  const e = foe(s, i);
  s.state.player.hp = 1;
  s.state.player.invuln = 0;
  s.place(e.x + e.w / 2, FLOOR);
  return s.run(`.${H.fadeFrames + 2}`);
}

describe('calm: a calmed creature cannot hurt her', () => {
  it('kindling sets `calm` on every living creature in range; its touch does nothing until it runs out', () => {
    const s = sim(scene([burr(X + 500, 1, 'near'), burr(X - 1500, 1, 'far')]), 12, X);
    s.run(`.${G.channelFrames}`);
    expect([foe(s, 0).calm, foe(s, 1).calm]).toEqual([G.calmFrames, 0]);
    // She walks over and stands inside it for the rest of the calm: nothing.
    s.place(foe(s, 0).x + 26, FLOOR);
    const ev = s.run(`.${G.calmFrames - 1}`);
    expect(of(ev, 'hurt')).toHaveLength(0);
    expect(foe(s, 0).calm).toBe(1);
    // The calm ends (it is outside the sanctuary here): its touch counts again (for one it can see:
    // the kindling took all she had, and empty-handed she slips past it: memory/giving.md).
    s.state.pickups.count = 2;
    expect(of(s.run('.3'), 'hurt')).toHaveLength(1);
  });

  it('a staggered creature keeps its tumble but is calmed too', () => {
    const s = sim(scene([burr(X + 300)]), 12, X);
    foe(s).mode = 'hurt';
    foe(s).timer = 40;
    s.run(`.${G.channelFrames}`);
    expect([foe(s).mode, foe(s).calm]).toEqual(['hurt', G.calmFrames]);
  });

  it('the playtest case: a burrback on top of her as the lantern catches never hurts her again there', () => {
    // It stands inside her at the lantern (the first frame it could still hurt is spent by her safety).
    const t = waking();
    const s = sim(scene([burr(X + 20, 1)]), 12, X, t);
    s.state.player.invuln = 2;
    const ev = s.run('.600');
    expect(of(ev, 'lanternKindle')).toHaveLength(1);
    expect(of(ev, 'hurt')).toHaveLength(0);
    expect(s.state.player.hp).toBe(4);
    // It ends up outside the sanctuary and stays there.
    expect(foe(s).x - X).toBeGreaterThanOrEqual(G.sanctuaryPx);
  });
});

describe('sanctuary: a lit lantern keeps creatures out', () => {
  it('a burrback turns round 110 px short of a lit lantern (cause `lantern`); a dormant one it walks through', () => {
    const dormant = sim(scene([burr(X + 400)]));
    let lo = 9e9;
    for (let f = 0; f < 600; f++) {
      step(dormant.state, 0, dormant.tuning, dormant.scene, dormant.events);
      lo = Math.min(lo, foe(dormant).x);
    }
    expect(lo).toBeLessThan(X - 200);

    const s = sim(scene([burr(X + 400), burr(X - 600, 1, 'left')]));
    light(s);
    s.place(1000, FLOOR);
    s.state.player.invuln = 1e6;
    const ev: SimEvent[] = [];
    let near = 9e9;
    for (let f = 0; f < 3000; f++) {
      const from = s.events.length;
      step(s.state, 0, s.tuning, s.scene, s.events);
      ev.push(...s.events.slice(from));
      for (const e of s.state.enemies) near = Math.min(near, e.x > X ? e.x - X : X - (e.x + e.w));
    }
    expect(near).toBe(G.sanctuaryPx);
    const turns = of(ev, 'enemyTurn').filter((e) => e.cause === 'lantern');
    expect(turns.length).toBeGreaterThanOrEqual(2);
    // Shying from the light is a longer beat than turning at a wall (36 against 24 frames).
    for (const t of turns) expect(t.frames).toBe(defaultTuning.burrback.turnPauseShyFrames);
    expect(defaultTuning.burrback.turnPauseShyFrames).toBeGreaterThan(defaultTuning.burrback.turnPauseFrames);
    expect(new Set(turns.map((e) => e.id))).toEqual(new Set([`b${X + 400}`, 'left']));
  });

  it('one caught inside is harmless and walks out; a lantern on another level does not concern it', () => {
    const s = sim(scene([burr(X + 60, -1)]));
    light(s);
    // (`light` waited out the calm: it is the sanctuary that keeps her safe now.)
    s.state.player.invuln = 0;
    s.place(foe(s).x + 26, FLOOR);
    const ev = s.run('.200');
    expect(of(ev, 'hurt')).toHaveLength(0);
    expect(foe(s).x - X).toBeGreaterThanOrEqual(G.sanctuaryPx);
    // A lantern up on a platform: the burrback under it walks on.
    const plat = { tag: 'floating' as const, x: 2300, y: 500, w: 200, h: 48 };
    const up: Scene = {
      ...flatScene({ solids: [plat] }),
      lanterns: [{ id: 'up', x: X, y: 500 }],
      enemies: [burr(X + 300)],
    };
    const u = sim(up);
    (u.state.goal.lanterns[0] as { lit: boolean }).lit = true;
    let lo = 9e9;
    for (let f = 0; f < 500; f++) {
      step(u.state, 0, u.tuning, u.scene, u.events);
      lo = Math.min(lo, foe(u).x);
    }
    expect(lo).toBeLessThan(X - 100);
  });

  it('a lampwing gives up 160 px from a lit lantern (and will not dive at one who stands in its light) and cannot hurt inside that; at a dormant one it reaches her', () => {
    const run = (lit: boolean) => {
      // (Some light in her hands, or it would not see her at all: memory/giving.md.)
      const s = sim(scene([wing(X + 330, FLOOR - 160)]), 6);
      if (lit) light(s);
      // Out to where it notices her, then back to the lantern with it in tow.
      s.place(X + 200, FLOOR);
      s.run('.50');
      expect(foe(s).mode).toBe('dive');
      s.place(X, FLOOR);
      const ev = s.run('.400');
      return { s, ev };
    };
    const lit = run(true);
    expect(of(lit.ev, 'hurt')).toHaveLength(0);
    const up = of(lit.ev, 'enemyGiveUp');
    expect(up[0]?.cause).toBe('calm');
    // Where it gave up: at the edge, 160 px from the lantern's centre (give or take a frame's drift).
    const d = Math.hypot((up[0]?.x ?? 0) - X, (up[0]?.y ?? 0) - (FLOOR - G.lanternHeight / 2));
    // (Or sooner: it does not start a dive at one who stands in the light.)
    expect(d).toBeGreaterThan(G.lampSanctuaryPx - 6);
    expect(lit.s.state.player.hp).toBe(4);
    const dark = run(false);
    expect(of(dark.ev, 'hurt')).toHaveLength(1);
  });

  it('dormant lanterns stay dangerous: standing at one without the light for it, a burrback walks into her', () => {
    const s = sim(scene([burr(X + 80)]), 3, X);
    const ev = s.run('.60');
    expect(of(ev, 'hurt')).toHaveLength(1);
  });
});

describe('refusal: only once she has stood there', () => {
  it('a run through the box says nothing; standing still for 12 frames does, with how long to show the price', () => {
    const s = sim(scene(), 3, X - 300);
    expect(of(s.run('R80'), 'lanternRefuse')).toHaveLength(0);
    expect(s.state.goal.lanterns[0]?.refused).toBe(false);
    s.place(X, FLOOR);
    expect(of(s.run(`.${G.refuseFrames - 1}`), 'lanternRefuse')).toHaveLength(0);
    expect(s.state.goal.lanterns[0]?.short).toBe(G.refuseFrames - 1);
    const ev = s.run('.1');
    expect(of(ev, 'lanternRefuse')).toEqual([
      { type: 'lanternRefuse', id: 'a', x: X, y: FLOOR, have: 3, need: 12, show: G.refuseShowFrames },
    ]);
    expect(of(s.run('.200'), 'lanternRefuse')).toHaveLength(0);
  });

  it('pacing to and fro inside the box is not standing; neither is landing and running on', () => {
    const s = sim(scene(), 3, X);
    expect(of(s.run('R3 L6 R6 L6 R6 L6 R6 L6 R3'), 'lanternRefuse')).toHaveLength(0);
    s.place(X - 60, FLOOR);
    expect(of(s.run('R+J8 R40'), 'lanternRefuse')).toHaveLength(0);
    // Stopping there is.
    s.place(X - 100, FLOOR);
    const ev = s.run('R9 .30');
    expect(Math.abs(feet(s).x - X)).toBeLessThan(44);
    expect(of(ev, 'lanternRefuse')).toHaveLength(1);
  });
});

describe('a fade costs', () => {
  it('she re-forms with 2 of 4 lights and leaves a third of her wallet (rounded down) where she lay', () => {
    const s = sim(scene([burr(3000)]), 10, 2000);
    s.run('.40');
    const ev = fadeOn(s);
    const order = ev.map((e) => e.type).filter((t) => ['fade', 'glintsDrop', 'reform', 'spawn'].includes(t));
    expect(order).toEqual(['fade', 'glintsDrop', 'reform', 'spawn']);
    const drop = of(ev, 'glintsDrop')[0];
    const re = of(ev, 'reform')[0];
    expect(drop).toEqual({ type: 'glintsDrop', id: 1, x: re?.fromX, y: FLOOR - 40, value: 3, wallet: 7 });
    expect(re).toMatchObject({ hp: 2, hpMax: 4 });
    const p = s.state.pickups;
    expect([p.count, p.lost, p.spent, p.dropSeq]).toEqual([7, 3, 0, 1]);
    expect(p.drops).toEqual([{ id: 1, x: drop?.x, y: FLOOR - 40, value: 3, left: 3, timer: 0 }]);
    expect([s.state.player.hp, s.state.goal.run.deaths]).toEqual([H.reformHp, 1]);
  });

  it('the cluster waits; touching it brings the glints back one by one as pickups with `drop`', () => {
    const s = sim(scene([burr(3000)]), 10, 2000);
    s.run('.40');
    const drop = of(fadeOn(s), 'glintsDrop')[0];
    if (!drop) throw new Error('nothing dropped');
    // It lies there as long as she stays away.
    s.run('.300');
    expect(s.state.pickups.drops).toHaveLength(1);
    // (The burrback is back at its start, 3000: she comes at the cluster from the other side.)
    s.place(drop.x - 300, FLOOR);
    s.state.player.invuln = 1e6;
    const ev = s.run('R40 .40');
    const wake = of(ev, 'dropWake');
    expect(wake).toEqual([
      { type: 'dropWake', id: 1, x: drop.x, y: drop.y, value: 3, frames: 18, stagger: 3 },
    ]);
    const back = of(ev, 'pickup');
    expect(back.map((e) => [e.id, e.drop, e.value, e.total, e.x, e.y])).toEqual([
      ['drop-1', true, 1, 8, drop.x, drop.y],
      ['drop-1', true, 1, 9, drop.x, drop.y],
      ['drop-1', true, 1, 10, drop.x, drop.y],
    ]);
    expect(back.map((e) => e.combo)).toEqual([0, 1, 2]);
    // First 18 frames after the touch, then 3 apart.
    const at = (e: SimEvent) => ev.indexOf(e);
    expect(at(back[0] as SimEvent)).toBeGreaterThan(at(wake[0] as SimEvent));
    const p = s.state.pickups;
    expect([p.count, p.lost, p.drops]).toEqual([10, 0, []]);
    // Wake distance: the pickups' own (84 px from her body).
    expect(defaultTuning.pickups.wakePx).toBe(84);
  });

  it('a second fade before she is back adds a cluster: nothing is ever deleted', () => {
    const s = sim(scene([burr(3000), burr(1000, 1)]), 30, 2000);
    s.run('.40');
    const a = of(fadeOn(s, 0), 'glintsDrop')[0];
    s.run('.100');
    const b = of(fadeOn(s, 1), 'glintsDrop')[0];
    expect([a?.value, a?.wallet, b?.id, b?.value, b?.wallet]).toEqual([10, 20, 2, 6, 14]);
    const p = s.state.pickups;
    expect([p.count, p.lost, p.drops.length]).toEqual([14, 16, 2]);
    expect(Math.abs((a?.x ?? 0) - (b?.x ?? 0))).toBeGreaterThan(500);
    // Both come back.
    s.state.player.invuln = 1e6;
    for (const d of [a, b]) {
      s.place(d?.x ?? 0, FLOOR);
      s.state.player.invuln = 1e6;
      s.run('.80');
    }
    expect([p.count, p.lost, p.drops]).toEqual([30, 0, []]);
    expect(s.state.goal.run.deaths).toBe(2);
  });

  it('with fewer than three glints nothing is left behind; the share and the lights are tuning', () => {
    const s = sim(scene([burr(3000)]), 2, 2000);
    const ev = fadeOn(s);
    expect(of(ev, 'glintsDrop')).toHaveLength(0);
    expect([s.state.pickups.count, s.state.pickups.lost, s.state.pickups.drops]).toEqual([2, 0, []]);
    const t = cloneTuning(defaultTuning);
    t.health.fadeDrop = 0.5;
    t.health.reformHp = 3;
    const u = sim(scene([burr(3000)]), 9, 2000, t);
    const d = of(fadeOn(u), 'glintsDrop')[0];
    expect([d?.value, d?.wallet, u.state.player.hp]).toEqual([4, 5, 3]);
    t.health.fadeDrop = 0;
    const z = sim(scene([burr(3000)]), 9, 2000, t);
    expect(of(fadeOn(z), 'glintsDrop')).toHaveLength(0);
  });

  it('a body that lay in the air is settled: the cluster rests on what is under it', () => {
    const s = sim(scene(), 9, 2000);
    s.state.player.y = 300;
    const ev: SimEvent[] = [];
    dropGlints(s.state, s.scene, H.fadeDrop, ev);
    expect(of(ev, 'glintsDrop')[0]).toMatchObject({ x: 2000, y: FLOOR - 40, value: 3 });
  });

  it('at a lit lantern she re-forms at 2; the rest makes her whole once she has left it and come back', () => {
    const s = sim(scene([burr(3300)]), 9);
    light(s);
    const ev = fadeOn(s);
    expect(of(ev, 'reform')[0]).toMatchObject({ x: X, y: FLOOR, hp: 2 });
    // Not where she re-formed (it would be a free heal without a step): out of it and back.
    expect(of(s.run(`.${G.restFrames * 3}`), 'lanternRest')).toEqual([]);
    s.run('R14 .8 L14 .8');
    const rest = s.run(`.${G.restFrames}`);
    expect(of(rest, 'lanternRest')[0]).toMatchObject({ healed: 2, hp: 4 });
    // The lantern, what she spent and the cluster are all kept through it.
    // (And the rest cost a glint a light: rest = give, memory/giving.md.)
    expect([s.state.goal.lit, s.state.pickups.spent, s.state.pickups.lost]).toEqual([1, 14, 3]);
  });

  it('clusters are state: cloned, hashed, kept by a teleport, gone on a restart; the summary counts them as gathered', () => {
    const s = sim(scene([burr(3300)]), 9);
    light(s);
    fadeOn(s);
    const c = cloneState(s.state);
    expect(hashState(c)).toBe(hashState(s.state));
    expect(c.pickups.drops).not.toBe(s.state.pickups.drops);
    expect(c.pickups.drops[0]).not.toBe(s.state.pickups.drops[0]);
    (c.pickups.drops[0] as { left: number }).left = 1;
    expect(hashState(c)).not.toBe(hashState(s.state));
    s.place(2000, FLOOR);
    expect(s.state.pickups.drops).toHaveLength(1);
    // Straight to the heart (one lantern in this scene): 9 + 12 gathered, 3 of them still lying out there.
    s.place(3600, FLOOR);
    const g = of(s.run('.3'), 'gather')[0];
    expect([g?.glints, g?.deaths, s.state.pickups.count, s.state.pickups.lost]).toEqual([21, 1, 6, 3]);
    const fresh = createState(1, s.tuning, s.scene);
    expect([fresh.pickups.drops, fresh.pickups.lost, fresh.pickups.dropSeq, fresh.goal.run.deaths]).toEqual([
      [],
      0,
      0,
      0,
    ]);
  });
});

describe('the tally in the summary', () => {
  it('gather carries what there was to find and what she found', () => {
    const sc: Scene = {
      ...scene([burr(2290), burr(900, 1), wing(600, 500)]),
      pickups: [
        { id: 'g', kind: 'glint', x: 2100, y: 760 },
        { id: 'big', kind: 'great', x: 3300, y: 760 },
        { id: 'big2', kind: 'great', x: 300, y: 760 },
      ],
      pods: [
        { id: 'p1', x: 3100, y: FLOOR - 22, mount: 'sit' },
        { id: 'p2', x: 200, y: FLOOR - 22, mount: 'sit', hp: 3 },
      ],
    };
    const s = sim(sc, 12);
    // One kill (not by the finisher: 4 glints), one pod, one glint, one great glint.
    s.place(2200, FLOOR);
    foe(s, 0).hp = 1;
    // (It has braced at her by the time the cut lands: the test's kill is from behind its shell.)
    s.tuning.burrback.strikePx = 0;
    s.run('R+A1 .60');
    expect(foe(s, 0).mode).toBe('dead');
    s.place(3010, FLOOR);
    s.run('R+A1 .40');
    s.place(3300, FLOOR);
    s.run('.80');
    s.place(X, FLOOR);
    s.run(`.${G.channelFrames}`);
    s.place(3600, FLOOR);
    const g = of(s.run('.3'), 'gather')[0];
    const T = defaultTuning;
    expect(g).toMatchObject({
      glintsTotal:
        1 +
        2 * T.pickups.greatValue +
        T.pods.value1 +
        T.pods.value3 +
        // Creatures at their base worth: a finisher's extra is the bonus, outside the total.
        2 * T.burrback.value +
        T.lampwing.value,
      bonus: 0,
      pods: 1,
      podsTotal: 2,
      greats: 1,
      greatsTotal: 2,
      kills: 1,
      enemiesTotal: 3,
      deaths: 0,
    });
    expect(g?.glints).toBe(s.state.pickups.count + s.state.pickups.spent);
    // What she still carries is the offering (it goes into the heart during the hold).
    expect([g?.offered, g?.offerTier]).toEqual([s.state.pickups.count, 0]);
    expect(s.state.goal.ending).toMatchObject({
      pods: 1,
      podsTotal: 2,
      greats: 1,
      greatsTotal: 2,
      enemiesTotal: 3,
      deaths: 0,
      glintsTotal: g?.glintsTotal,
    });
  });
});
