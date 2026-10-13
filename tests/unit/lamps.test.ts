import { describe, expect, it } from 'vitest';
import { GROVE, LAMP_CLEAR, parseScene } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, hashState, lampCost, lanternCost, step } from '../../src/sim/index';
import type { EnemySpawn, Lantern, Scene } from '../../src/sim/scene';
import { defaultTuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim } from './helpers';

/**
 * Two things added after playtest 2 (memory/goal.md): a dormant lantern NOTICES her as she comes
 * near (`lanternNotice`, so the picture can answer a player who never stops at it), and wayside
 * lamps (`scene.lamps`): lesser lanterns that follow the lantern rules, cost less, have their own
 * events and do not count toward the heart. Flat test scene (floor top 800) unless it says the grove.
 */
const FLOOR = 800;
const G = defaultTuning.goal;
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) =>
  ev.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const names = (ev: SimEvent[], prefix: string) =>
  ev.map((e) => e.type).filter((t) => t.startsWith(prefix) && !t.endsWith('Channel'));

const LANTERN_X = 2600;
const LAMP_X = 1400;
const lantern: Lantern = { id: 'a', x: LANTERN_X, y: FLOOR };
const lamp: Lantern = { id: 'w', x: LAMP_X, y: FLOOR };
const burr = (x: number, facing: -1 | 1 = 1): EnemySpawn => ({
  id: `burr-${x}`,
  kind: 'burrback',
  x,
  y: FLOOR,
  facing,
});
function scene(o: { enemies?: EnemySpawn[]; lamps?: Lantern[]; lanterns?: Lantern[] } = {}): Scene {
  return {
    ...flatScene(),
    lanterns: o.lanterns ?? [lantern],
    lamps: o.lamps ?? [lamp],
    heart: { x: 3600, y: FLOOR },
    enemies: o.enemies ?? [],
    pickups: [],
  };
}
function sim(sc: Scene, glints: number, at?: number): Sim {
  const s = newSim(sc);
  s.state.pickups.count = glints;
  if (at !== undefined) s.place(at, FLOOR);
  return s;
}

/** Frames of standing at a lamp until it is lit: the beat of intent, then the channel. */
const LAMP_FRAMES = G.lampStillFrames + G.channelFrames;

describe('a dormant lantern notices her', () => {
  it('once, as her body comes within 260 px, however fast she passes: with what she carries and what it takes', () => {
    const s = sim(scene(), 5, LANTERN_X - 600);
    const ev = s.run('R120');
    // She ran straight through and on: no refusal (she never stood), one notice.
    expect(feet(s).x).toBeGreaterThan(LANTERN_X + 300);
    expect(names(ev, 'lantern')).toEqual(['lanternNotice']);
    const n = of(ev, 'lanternNotice')[0];
    expect(n).toEqual({ type: 'lanternNotice', id: 'a', x: LANTERN_X, y: FLOOR, have: 5, need: 12 });
    // It fired the step she crossed the line, not before.
    const k = s.events.indexOf(n as SimEvent);
    const q = sim(scene(), 5, LANTERN_X - 600);
    let f = 0;
    while (of(q.events, 'lanternNotice').length === 0) {
      step(q.state, 2, q.tuning, q.scene, q.events);
      f++;
    }
    expect(k).toBeGreaterThan(0);
    const dx = LANTERN_X - feet(q).x;
    expect(dx).toBeLessThanOrEqual(G.noticePx);
    expect(dx).toBeGreaterThan(G.noticePx - 12);
    expect(f).toBeGreaterThan(20);
  });

  it('again only after she has been 420 px away: pacing about near it is one approach', () => {
    const s = sim(scene(), 0, LANTERN_X - 200);
    // Placed inside the range: noticed on the first step.
    expect(names(s.run('.1'), 'lantern')).toEqual(['lanternNotice']);
    // To and fro within 400 px: nothing more.
    expect(names(s.run('L20 R60 L40 .30'), 'lanternNotice')).toEqual([]);
    expect(Math.abs(feet(s).x - LANTERN_X)).toBeLessThan(G.noticeLeavePx);
    // Well away and back: once more.
    s.run('L80');
    expect(LANTERN_X - feet(s).x).toBeGreaterThan(G.noticeLeavePx);
    expect(s.state.goal.lanterns[0]?.noticed).toBe(false);
    expect(names(s.run('R80'), 'lanternNotice')).toEqual(['lanternNotice']);
  });

  it('measures to the middle of its box, up and down as well: passing far under or over it says nothing', () => {
    // A ledge 400 px over the lantern's ground: she runs its length, right over the lantern.
    const s = sim(
      { ...scene(), solids: [...flatScene().solids, { tag: 'ledge', x: 2000, y: 400, w: 1200, h: 40 }] },
      0,
      LANTERN_X - 500,
    );
    s.place(LANTERN_X - 500, 400);
    expect(names(s.run('R110'), 'lanternNotice')).toEqual([]);
    expect(feet(s)).toEqual({ x: feet(s).x, y: 400 });
    expect(feet(s).x).toBeGreaterThan(LANTERN_X + 200);
  });

  it('a lit lantern, the ending and a staggered or faded hero: nothing', () => {
    const s = sim(scene(), 12, LANTERN_X);
    s.run(`.${G.channelFrames}`);
    expect(s.state.goal.lanterns[0]?.lit).toBe(true);
    s.place(LANTERN_X - 600, FLOOR);
    expect(names(s.run('R120'), 'lanternNotice')).toEqual([]);
    const f = sim(scene(), 0, LANTERN_X - 100);
    f.state.player.stagger = 5;
    expect(names(f.run('.3'), 'lanternNotice')).toEqual([]);
    // Once she is in control again it does.
    expect(names(f.run('.10'), 'lanternNotice')).toEqual(['lanternNotice']);
  });

  it('changes nothing in the sim but its own flag, and is deterministic', () => {
    const a = sim(scene(), 3, LANTERN_X - 600);
    const b = sim(scene({ lanterns: [] }), 3, LANTERN_X - 600);
    a.run('R120 L60 .20');
    b.run('R120 L60 .20');
    expect(a.state.player).toEqual(b.state.player);
    expect(a.state.pickups).toEqual(b.state.pickups);
    const c = sim(scene(), 3, LANTERN_X - 600);
    c.run('R120 L60 .20');
    expect(hashState(c.state)).toBe(hashState(a.state));
  });
});

describe('wayside lamps', () => {
  it('cost 8 by default (or their own), kindle like a lantern, under their own event names', () => {
    expect(lampCost(lamp, G)).toBe(8);
    expect(lampCost({ ...lamp, cost: 5 }, G)).toBe(5);
    expect(lanternCost(lantern, G)).toBe(12);
    const s = sim(scene(), 10, LAMP_X);
    // A lamp wants intent: 20 frames of standing still at it before its channel starts.
    const wait = s.run(`.${G.lampStillFrames - 1}`);
    expect(of(wait, 'lampChannel')).toHaveLength(0);
    expect(s.state.goal.lamps[0]).toMatchObject({ still: G.lampStillFrames - 1, channel: 0 });
    const ev = [...wait, ...s.run(`.${G.channelFrames + 1}`)];
    expect(of(ev, 'lampChannel')).toHaveLength(G.channelFrames - 1);
    expect(names(ev, 'lamp')).toEqual(['lampNotice', 'lampKindle']);
    expect(names(ev, 'lantern')).toEqual([]);
    expect(of(ev, 'lampKindle')[0]).toEqual({
      type: 'lampKindle',
      id: 'w',
      x: LAMP_X,
      y: FLOOR,
      cost: 8,
      wallet: 2,
      lit: 1,
      total: 1,
      pledged: false,
      away: false,
    });
    expect([s.state.pickups.count, s.state.pickups.spent]).toEqual([2, 8]);
    expect(s.state.goal.lamps[0]).toMatchObject({ lit: true, channel: 0 });
    expect([s.state.goal.lampsLit, s.state.goal.restLamp, s.state.goal.restAt]).toEqual([1, 0, -1]);
    // Her pose flag for a lamp is its own; the lantern's never moved.
    const mid = sim(scene(), 10, LAMP_X);
    mid.run(`.${G.lampStillFrames + 5}`);
    expect([mid.state.player.kindling, mid.state.player.kindlingLamp]).toEqual([-1, 0]);
  });

  it('a lamp wants intent: only standing still at it starts it (playtest 4: two kindled by accident, 8 glints each)', () => {
    // Running through it, landing on it and running on, standing pressed against something with a
    // direction held, cutting on it: nothing starts, however long.
    for (const script of [
      'L10 R60',
      '.10 R1 .10 L1 .10 R1 .10',
      '.10 A1 .10 A1 .10 A1 .10',
      'R1 L1 R1 L1 R1 L1 R1 L1 R1 L1 R1 L1',
    ]) {
      const s = sim(scene(), 10, LAMP_X);
      const ev = s.run(script);
      expect(of(ev, 'lampChannel'), script).toHaveLength(0);
      expect(s.state.goal.lamps[0]?.lit, script).toBe(false);
      expect(s.state.pickups.count, script).toBe(10);
    }
    // The wait starts over each time; then 20 still frames and the channel runs.
    const s = sim(scene(), 10, LAMP_X);
    s.run('.15 R1 L1');
    const ev = s.run(`.${LAMP_FRAMES + 4}`);
    expect(of(ev, 'lampKindle')).toHaveLength(1);
    // A lantern has no such wait: the same visit lights it on the 30th frame.
    const q = sim(scene(), 12, LANTERN_X);
    expect(of(q.run(`.${G.channelFrames}`), 'lanternKindle')).toHaveLength(1);
    // Nor does a pledge take a lamp she only ran through while a pod's glints were in the air.
    expect(G.lampStillFrames).toBe(20);
  });

  it('do not count toward the heart: a lit lamp wakes nothing, the lantern alone does', () => {
    const s = sim(scene(), 30, LAMP_X);
    const ev = s.run(`.${LAMP_FRAMES}`);
    expect(of(ev, 'heartWake')).toHaveLength(0);
    expect([s.state.goal.lit, s.state.goal.heart.awake]).toEqual([0, false]);
    s.place(LANTERN_X, FLOOR);
    const ev2 = s.run(`.${G.channelFrames}`);
    expect(of(ev2, 'lanternKindle')[0]).toMatchObject({ lit: 1, total: 1 });
    expect(of(ev2, 'heartWake')).toHaveLength(1);
    // The heart never waits for a lamp.
    const q = sim(scene(), 12, LANTERN_X);
    expect(of(q.run(`.${G.channelFrames}`), 'heartWake')).toHaveLength(1);
    expect(q.state.goal.lampsLit).toBe(0);
  });

  it('refuse, cancel and notice as a lantern does', () => {
    const s = sim(scene(), 7, LAMP_X);
    const ev = s.run('.40');
    expect(names(ev, 'lamp')).toEqual(['lampNotice', 'lampRefuse']);
    expect(of(ev, 'lampRefuse')[0]).toMatchObject({ id: 'w', have: 7, need: 8, show: G.refuseShowFrames });
    // Once started it runs on along its leash like a lantern's; beyond it, it breaks.
    const c = sim(scene(), 8, LAMP_X);
    c.run(`.${G.lampStillFrames + 4}`);
    const left = c.run('R2 R+X1 R14');
    expect(of(left, 'lampCancel')[0]).toMatchObject({ id: 'w', reason: 'leave' });
    expect(of(left, 'lampCancel')[0]?.frames).toBeGreaterThanOrEqual(10);
    expect(c.state.pickups.count).toBe(8);
    // A cut does not break it (it only puts off the start).
    const a = sim(scene(), 8, LAMP_X);
    a.run(`.${G.lampStillFrames + 4}`);
    const cut = a.run('A1 .30');
    expect(of(cut, 'lampCancel')).toHaveLength(0);
    expect(of(cut, 'lampKindle')).toHaveLength(1);
  });

  it('a lit lamp is a rest point and the re-form point, until she stands at another light', () => {
    const s = sim(scene(), 60, LAMP_X);
    s.state.player.hp = 2;
    const ev = s.run(`.${LAMP_FRAMES + G.restFrames}`);
    expect(names(ev, 'lamp')).toEqual(['lampNotice', 'lampKindle', 'lampRest']);
    expect(of(ev, 'lampRest')[0]).toMatchObject({ id: 'w', healed: 2, hp: 4 });
    // A fade far away: she re-forms at the lamp.
    s.place(3000, FLOOR);
    s.state.player.hp = 0;
    s.state.player.faded = 2;
    s.run('.3');
    expect(feet(s)).toEqual({ x: LAMP_X, y: FLOOR });
    // Then the lantern: the rest point moves there, and back when she stands at the lamp again.
    s.place(LANTERN_X, FLOOR);
    s.run(`.${G.channelFrames}`);
    expect([s.state.goal.restAt, s.state.goal.restLamp]).toEqual([0, -1]);
    s.place(LAMP_X, FLOOR);
    s.run('.2');
    expect([s.state.goal.restAt, s.state.goal.restLamp]).toEqual([-1, 0]);
  });

  it('nothing can hurt her while she kindles one, and it calms the creatures round it', () => {
    const s = sim(scene({ enemies: [burr(LAMP_X - 70, 1)] }), 8, LAMP_X);
    // (The walking creature: with the ram on it would hit her in the 20 frames before the channel.)
    s.tuning.burrback.strikePx = 0;
    const walker = s.state.enemies[0];
    if (walker) walker.x -= 40;
    const ev = s.run(`.${LAMP_FRAMES}`);
    expect(of(ev, 'hurt')).toHaveLength(0);
    expect(of(ev, 'lampKindle')).toHaveLength(1);
    expect(s.state.enemies[0]?.calm).toBeGreaterThan(0);
    expect(s.state.player.hp).toBe(4);
  });

  it('a lit lamp is a sanctuary: a burrback on its ground turns 110 px short of it, for good', () => {
    const lit = sim(scene({ enemies: [burr(LAMP_X - 500, 1)] }), 8, LAMP_X);
    lit.run(`.${LAMP_FRAMES}`);
    lit.place(3400, FLOOR);
    const from = lit.events.length;
    let nearest = 9e9;
    for (let f = 0; f < 1500; f++) {
      step(lit.state, 0, lit.tuning, lit.scene, lit.events);
      const e = lit.state.enemies[0];
      if (e) nearest = Math.min(nearest, LAMP_X - (e.x + e.w));
    }
    expect(nearest).toBeGreaterThanOrEqual(G.sanctuaryPx);
    expect(nearest).toBeLessThan(G.sanctuaryPx + 4);
    const turns = of(lit.events.slice(from), 'enemyTurn').filter((e) => e.cause === 'lantern');
    expect(turns.length).toBeGreaterThanOrEqual(1);
    // Dormant, the same creature walks straight through it.
    const dark = sim(scene({ enemies: [burr(LAMP_X - 500, 1)] }), 0, 3400);
    let past = false;
    for (let f = 0; f < 1500; f++) {
      step(dark.state, 0, dark.tuning, dark.scene, dark.events);
      if ((dark.state.enemies[0]?.x ?? 0) > LAMP_X) past = true;
    }
    expect(past).toBe(true);
  });

  it('the ending tallies them; a clone copies them; a scene without lamps has none', () => {
    const s = sim(scene(), 40, LAMP_X);
    s.run(`.${LAMP_FRAMES}`);
    const c = cloneState(s.state);
    expect(c.goal.lamps).toEqual(s.state.goal.lamps);
    expect(c.goal.lamps).not.toBe(s.state.goal.lamps);
    expect(hashState(c)).toBe(hashState(s.state));
    s.place(LANTERN_X, FLOOR);
    s.run(`.${G.channelFrames}`);
    s.place(3600, FLOOR);
    const g = of(s.run('.3'), 'gather')[0];
    expect([g?.lamps, g?.lampsTotal, g?.lanterns]).toEqual([1, 1, 1]);
    expect([s.state.goal.ending.lamps, s.state.goal.ending.lampsTotal]).toEqual([1, 1]);
    const bare = newSim(flatScene());
    expect([bare.state.goal.lamps, bare.state.goal.lampsLit, bare.state.goal.restLamp]).toEqual([[], 0, -1]);
  });

  it('are validated like lanterns: on solid ground, clear of the spawn, the heart and each other', () => {
    const bad = (lamps: unknown[]) => () => parseScene({ ...GROVE, lamps });
    const first = (GROVE.lamps ?? [])[0] as Lantern;
    expect(bad([{ ...first, y: first.y - 40 }])).toThrow(/solid ground/);
    expect(bad([{ ...first, x: GROVE.spawn.x + 100, y: GROVE.spawn.y }])).toThrow(/spawn/);
    expect(bad([{ ...first, id: 'lantern-stone' }])).toThrow(/called/);
    expect(bad([{ ...first, x: 1448 - LAMP_CLEAR + 20, y: 1280 }])).toThrow(/crowds|spawn/);
    expect(bad([first, { ...first, id: 'other', x: first.x + 60 }])).toThrow(/crowds/);
    expect(bad([{ ...first, x: 5212, y: 1088 }])).toThrow(/heart/);
    expect(bad([{ ...first, cost: 200 }])).toThrow();
    expect(() => parseScene({ ...GROVE, lamps: [] })).not.toThrow();
  });
});
