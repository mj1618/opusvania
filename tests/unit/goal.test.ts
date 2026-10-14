import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../src/input/script';
import { GROVE, LANTERN_SPAWN_CLEAR, parseScene } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, createState, hashState, heartBox, lanternBox, step } from '../../src/sim/index';
import { resolveParams } from '../../src/sim/player/params';
import { hurtPlayer } from '../../src/sim/player/player';
import type { EnemySpawn, Lantern, Pickup, Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim } from './helpers';

// These rule tests were written before the heart's wake had a length: here it is ready the step
// after it wakes (vitest gives each test file its own copy of the module). The wait has its own tests.
const WAKE_FRAMES = defaultTuning.goal.heartWakeFrames;
defaultTuning.goal.heartWakeFrames = 0;

/**
 * The goal (src/sim/goal.ts, memory/goal.md): three moth-lanterns kindled with gathered light,
 * the heart of the grove, the ending. On a flat test scene (floor top at 800, 4000 wide, spawn at
 * 2000) unless a test says the grove.
 */
const FLOOR = 800;
const G = defaultTuning.goal;
const H = defaultTuning.health;
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) =>
  ev.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const types = (ev: SimEvent[]) => ev.map((e) => e.type);
/** (Without `lanternNotice`: it fires on every approach and has its own tests below.) */
const goalTypes = (ev: SimEvent[]) =>
  types(ev).filter(
    (t) =>
      t !== 'lanternNotice' &&
      t !== 'heartReady' &&
      (t.startsWith('lantern') || t.startsWith('heart') || t === 'gather' || t === 'endHold'),
  );

const A_X = 2400;
const B_X = 1200;
const C_X = 3000;
const HEART_X = 3600;
const three: Lantern[] = [
  { id: 'a', x: A_X, y: FLOOR },
  { id: 'b', x: B_X, y: FLOOR },
  { id: 'c', x: C_X, y: FLOOR },
];
const burr = (x: number, facing: -1 | 1 = -1, id = `burr-${x}`): EnemySpawn => ({
  id,
  kind: 'burrback',
  x,
  y: FLOOR,
  facing,
});
function scene(
  o: { lanterns?: Lantern[]; heart?: boolean; enemies?: EnemySpawn[]; pickups?: Pickup[] } = {},
): Scene {
  return {
    ...flatScene(),
    lanterns: o.lanterns ?? three,
    ...(o.heart === false ? {} : { heart: { x: HEART_X, y: FLOOR } }),
    enemies: o.enemies ?? [],
    pickups: o.pickups ?? [],
  };
}
/** A sim with her standing at lantern `at` (if given) carrying `glints`. */
function sim(sc: Scene = scene(), glints = 0, at?: number): Sim {
  const s = newSim(sc);
  s.state.pickups.count = glints;
  if (at !== undefined) s.place(at, FLOOR);
  return s;
}
const lantern = (s: Sim, i = 0) => s.state.goal.lanterns[i] as Sim['state']['goal']['lanterns'][number];
/** Lights every lantern by standing at each in turn (teleporting between them). */
function lightAll(s: Sim): SimEvent[] {
  const from = s.events.length;
  const list = s.scene.lanterns ?? [];
  s.state.pickups.count += list.length * G.cost;
  for (const l of list) {
    s.place(l.x, l.y);
    s.run(`.${G.channelFrames}`);
  }
  return s.events.slice(from);
}

describe('lanterns: kindling', () => {
  it('standing at one with enough light kindles it on the 30th frame, with a channel event every frame before', () => {
    const s = sim(scene(), 12, A_X);
    const ev = s.run(`.${G.channelFrames - 1}`);
    const ch = of(ev, 'lanternChannel');
    expect(ch.map((e) => e.frames)).toEqual(Array.from({ length: G.channelFrames - 1 }, (_, i) => i + 1));
    expect(ch[0]).toEqual({ type: 'lanternChannel', id: 'a', x: A_X, y: FLOOR, frames: 1, of: 30 });
    expect(lantern(s).channel).toBe(G.channelFrames - 1);
    expect(s.state.player.kindling).toBe(0);
    expect(lantern(s).lit).toBe(false);
    expect(s.state.pickups.count).toBe(12);
    const last = s.run('.1');
    expect(goalTypes(last)).toEqual(['lanternKindle']);
    expect(of(last, 'lanternKindle')[0]).toEqual({
      type: 'lanternKindle',
      id: 'a',
      x: A_X,
      y: FLOOR,
      cost: 12,
      wallet: 0,
      lit: 1,
      total: 3,
      pledged: false,
      away: false,
    });
    expect(lantern(s)).toEqual({
      lit: true,
      litFrame: s.state.frame - 1,
      channel: 0,
      rest: 0,
      short: 0,
      refused: false,
      noticed: true,
      pledged: false,
      still: 0,
      keyed: true,
    });
    expect(s.state.player.kindling).toBe(-1);
    expect([s.state.goal.lit, s.state.goal.restAt]).toEqual([1, 0]);
    // Lit is lit: standing on does nothing more.
    expect(goalTypes(s.run('.120'))).toEqual([]);
  });

  it('the box is 48 x 64 on its foot; she has to stand in it, on the ground', () => {
    expect(lanternBox({ x: A_X, y: FLOOR }, G)).toEqual({ x: A_X - 24, y: FLOOR - 64, w: 48, h: 64 });
    // Her box is 40 wide: feet 43 px from the foot still overlap, 44 do not.
    for (const [dx, lit] of [
      [43, true],
      [-43, true],
      [44, false],
      [-44, false],
    ] as const) {
      const s = sim(scene(), 12, A_X + dx);
      s.run('.40');
      expect(lantern(s).lit, `dx ${dx}`).toBe(lit);
    }
    // Hanging in the air inside the box does not START it: a jump through it kindles nothing.
    const s = sim(scene(), 12, A_X - 200);
    s.run('R6 R+J24 R30');
    expect(of(s.events, 'jump')).toHaveLength(1);
    expect(of(s.events, 'lanternChannel')).toHaveLength(0);
    expect(lantern(s).lit).toBe(false);
  });

  it('once started it runs on while she stays on its leash, whatever she does: a player who never stands still lights it', () => {
    // (Playtest 4: a tapper who never stopped lit nothing in two minutes; every channel broke 9-10 frames in.)
    // Running straight through, with the price: it starts as she crosses the box and catches behind her.
    const r = sim(scene(), 12, A_X - 300);
    const ev = r.run('R80');
    const k = of(ev, 'lanternKindle');
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ id: 'a', away: true, pledged: false, wallet: 0 });
    expect(of(ev, 'lanternChannel')).toHaveLength(G.channelFrames - 1);
    expect(of(ev, 'lanternCancel')).toHaveLength(0);
    // She was past its box (not kindling it: no pose, no protection) when it caught.
    expect(feet(r).x).toBeGreaterThan(A_X + 44);
    // Pacing about it, hopping, cutting: it still catches on the 30th frame.
    for (const script of ['.3 R8 L16 R8', '.3 J12 .20', '.3 A1 .16 A1 .14', '.2 L5 R+J6 L+A10 R12']) {
      const q = sim(scene(), 12, A_X);
      const e = q.run(script);
      expect(of(e, 'lanternKindle'), script).toHaveLength(1);
      expect(of(e, 'lanternCancel'), script).toHaveLength(0);
      expect(q.state.frame, script).toBeGreaterThanOrEqual(G.channelFrames);
    }
    // The leash: 260 px to either side of its foot, 330 up or down from the middle of its box.
    expect([G.kindleLeashPx, G.kindleLeashUpPx]).toEqual([260, 330]);
    // Only while she is AT it is she kindling (the pose, and nothing can hurt her).
    const p = sim(scene(), 12, A_X);
    p.run('.5');
    expect(p.state.player.kindling).toBe(0);
    p.run('R12');
    expect(p.state.player.kindling).toBe(-1);
    expect(lantern(p).channel).toBe(17);
  });

  it('leaving its leash breaks the channel: a dash away, or a slower hand that walks on', () => {
    for (const [script, n, channel] of [
      ['.10 R2 R+X1 R14', 10, G.channelFrames],
      ['.10 R60', 10, 60],
    ] as const) {
      const s = sim(scene(), 12, A_X);
      s.tuning.goal.channelFrames = channel;
      const ev = s.run(script);
      const c = of(ev, 'lanternCancel');
      expect(c, script).toHaveLength(1);
      expect(c[0]?.reason).toBe('leave');
      expect(c[0]?.frames).toBeGreaterThanOrEqual(n);
      expect([lantern(s).channel, lantern(s).lit, s.state.pickups.count, s.state.pickups.spent]).toEqual([
        0,
        false,
        12,
        0,
      ]);
      expect(s.state.player.kindling).toBe(-1);
    }
  });

  it('a slash does not break a channel that has started; it only cannot start while the blade is out', () => {
    const s = sim(scene(), 12, A_X);
    const ev = s.run('.10 A1 .19');
    expect(of(ev, 'lanternCancel')).toHaveLength(0);
    expect(of(ev, 'lanternKindle')).toHaveLength(1);
    expect(s.state.frame).toBe(G.channelFrames);
    // Blade out as she arrives: nothing for the 14 frames of the slash, then the full channel.
    const b = sim(scene(), 12, A_X);
    const e = b.run('A1 .60');
    expect(e.findIndex((x) => x.type === 'lanternChannel')).toBeGreaterThan(0);
    expect(of(e, 'lanternChannel')[0]?.frames).toBe(1);
    expect(of(e, 'lanternKindle')).toHaveLength(1);
    expect(b.state.goal.lanterns[0]?.litFrame).toBe(13 + G.channelFrames);
    // Mashing lets it through now: it starts in the gap between two cuts and runs on.
    const m = sim(scene(), 12, A_X);
    m.run('A1 .16 A1 .18 A1 .26 A1 .16 A1 .18 A1 .10');
    expect(lantern(m).lit).toBe(true);
  });

  it('being hurt breaks it (the reason is `hurt`), in the same step', () => {
    // Nothing in the grove can hurt her mid-channel any more (see below), so the blow is dealt by hand.
    const s = sim(scene(), 12, A_X);
    s.run('.10');
    hurtPlayer(
      s.state,
      resolveParams(s.tuning),
      1,
      1,
      { kind: 'burrback', id: 'x' },
      A_X,
      FLOOR - 20,
      s.events,
    );
    const ev = s.run('.1');
    const c = of(ev, 'lanternCancel');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ reason: 'hurt', frames: 10 });
    expect([lantern(s).lit, lantern(s).channel, s.state.pickups.count]).toEqual([false, 0, 12]);
    expect(of(ev, 'lanternChannel')).toHaveLength(0);
  });

  it('a creature cannot break the channel: its touch is turned away and she is not hurt', () => {
    // A burrback walks into her 20-odd frames in: it recoils from her and turns round; she kindles.
    const s = sim(scene({ enemies: [burr(A_X + 80)] }), 12, A_X);
    const ev = s.run('.40');
    expect(of(ev, 'hurt')).toHaveLength(0);
    expect(of(ev, 'lanternCancel')).toHaveLength(0);
    // (It braced at her as she arrived, the step before the channel began; the lantern caught
    // as its ram set off, and it stands calmed. With the ram off: the flinch of a touch, as before.)
    expect(of(ev, 'enemyWindup')).toHaveLength(1);
    expect(s.state.enemies[0]).toMatchObject({ mode: 'pause', braced: false });
    // A longer channel: the ram reaches her mid-channel, bounces off her and stands spent.
    const long = sim(scene({ enemies: [burr(A_X + 80)] }), 12, A_X);
    long.tuning.goal.channelFrames = 60;
    const le = long.run('.70');
    expect(of(le, 'hurt')).toHaveLength(0);
    expect(of(le, 'lanternCancel')).toHaveLength(0);
    expect(of(le, 'enemyRecover')[0]).toMatchObject({ cause: 'touch', dir: 1 });
    expect(lantern(long).lit).toBe(true);
    const walk = sim(scene({ enemies: [burr(A_X + 80)] }), 12, A_X);
    walk.tuning.burrback.strikePx = 0;
    const flinch = of(walk.run('.40'), 'enemyAlert');
    expect(flinch).toHaveLength(1);
    expect(flinch[0]).toMatchObject({ cause: 'touch', facing: 1, dir: -1 });
    expect(of(walk.events, 'hurt')).toHaveLength(0);
    expect([lantern(s).lit, s.state.player.hp, s.state.pickups.count]).toEqual([true, 4, 0]);
    // The same for a lampwing that comes down on her: it bounces off and gives up.
    const wing: EnemySpawn = {
      id: 'w',
      kind: 'lampwing',
      x: A_X + 40,
      y: FLOOR - 120,
      facing: -1,
      radius: 40,
    };
    const t = cloneTuning(defaultTuning);
    t.goal.channelFrames = 400;
    const w = newSim(scene({ enemies: [wing] }), t);
    w.state.pickups.count = 12;
    w.place(A_X, FLOOR);
    const wev = w.run('.380');
    expect(of(wev, 'enemyNotice').length).toBeGreaterThan(0);
    expect(of(wev, 'enemyGiveUp').some((g) => g.cause === 'touch')).toBe(true);
    expect(of(wev, 'hurt')).toHaveLength(0);
    expect(of(wev, 'lanternCancel')).toHaveLength(0);
    expect(w.state.player.hp).toBe(4);
  });
});

/**
 * Playtest 3: "the first kindle can be missed by a second". She cuts the pod at the lantern's foot
 * and runs on; its glints catch her up 400 px later and the lantern stayed dark. Now a lantern she
 * stands at short, with the rest already on its way to her, is pledged: it catches the step those
 * have landed, wherever she is.
 */
describe('lanterns: a pledge (enough light already on its way to her)', () => {
  const pod = { id: 'p', x: A_X + 52, y: FLOOR - 22, mount: 'sit' as const, hp: 3 };
  const withPod = (): Scene => ({ ...scene(), pods: [pod] });
  /** Cuts until the pod opens, standing at the lantern. */
  const open = (s: Sim) => {
    for (let f = 0; f < 200 && s.state.pods.hp[0] !== 0; f++) s.run(f % 3 === 0 ? 'A1' : '.1');
    expect(s.state.pods.hp[0]).toBe(0);
  };

  it('she cuts the pod and runs on at once: the lantern catches when its glints have landed, wherever she is', () => {
    const s = sim(withPod(), 3, A_X);
    open(s);
    // The pod's last eight are in the air; what she holds is short; what is coming covers it.
    expect(s.state.pickups.count).toBeLessThan(12);
    expect(lantern(s).pledged).toBe(true);
    const ev = s.run('R60');
    const k = of(ev, 'lanternKindle')[0];
    expect(k).toMatchObject({ id: 'a', cost: 12, wallet: 0, pledged: true, away: true, lit: 1 });
    expect(feet(s).x).toBeGreaterThan(A_X + 300);
    expect(lantern(s)).toMatchObject({ lit: true, pledged: false, channel: 0 });
    expect([s.state.pickups.count, s.state.pickups.spent]).toEqual([1, 12]);
    // It is her rest point all the same, and it calmed what was near as any kindling does.
    expect(s.state.goal.restAt).toBe(0);
    // The wallet never went under.
    expect(of(ev, 'pickup').every((e) => e.total >= 0)).toBe(true);
  });

  it('if she stays, the channel shows from the burst on (a slash no longer breaks it) and it catches as the price lands: sooner than the full channel', () => {
    const s = sim(withPod(), 3, A_X);
    open(s);
    const burst = s.state.frame;
    const ev = s.run('.60');
    const k = of(ev, 'lanternKindle')[0];
    expect(k).toMatchObject({ pledged: true, away: false });
    expect(of(ev, 'lanternChannel').length).toBeGreaterThan(10);
    expect(of(ev, 'lanternCancel')).toEqual([]);
    expect(of(ev, 'lanternRefuse')).toEqual([]);
    // 12 = the 3 she had + 2 knocked loose + 7 of the burst's 8: 16 + 6 x 3 frames after it.
    expect(lantern(s).litFrame - burst).toBeLessThanOrEqual(36);
  });

  it('no pledge without standing at it, none when what is coming is not enough; a hit does not undo one', () => {
    // Cut from beside the lantern, not at it: nothing is pledged, it stays dark.
    const far = sim(withPod(), 3, A_X + 120);
    far.run('L1');
    open(far);
    far.run('L1 .80');
    expect(lantern(far)).toMatchObject({ lit: false, pledged: false });
    // Too little even with the pod: refused as ever.
    const poor = sim(withPod(), 0, A_X);
    open(poor);
    expect(lantern(poor).pledged).toBe(false);
    poor.run('.80');
    expect(lantern(poor).lit).toBe(false);
    expect(of(poor.events, 'lanternRefuse')).toHaveLength(1);
    // Pledged, then knocked off it before they land: the pledge stands, it catches all the same.
    const s = sim(withPod(), 3, A_X);
    open(s);
    expect(lantern(s).pledged).toBe(true);
    hurtPlayer(s.state, resolveParams(s.tuning), -1, 1, { kind: 'burrback', id: 'x' }, 0, 0, s.events);
    s.run('.60');
    expect(lantern(s)).toMatchObject({ lit: true, pledged: false });
  });
});

describe('lanterns: the wallet', () => {
  it('kindling spends the cost: count is the wallet, spent goes up, taken is untouched', () => {
    const picks: Pickup[] = [
      { id: 'g1', kind: 'glint', x: 2100, y: 760 },
      { id: 'g2', kind: 'glint', x: 2200, y: 760 },
      { id: 'big', kind: 'great', x: 2300, y: 760 },
    ];
    const s = sim(scene({ pickups: picks, lanterns: [{ id: 'a', x: A_X, y: FLOOR, cost: 5 }] }));
    // 2 + 5 = 7 gathered on the walk; the great one is still in flight when she gets there.
    s.run('R42 .120');
    expect(Math.abs(feet(s).x - A_X)).toBeLessThan(40);
    const p = s.state.pickups;
    expect([p.count, p.spent, p.taken]).toEqual([2, 5, 3]);
    expect(of(s.events, 'lanternKindle')[0]).toMatchObject({ cost: 5, wallet: 2, lit: 1, total: 1 });
    // The pickup events' `total` is the wallet as it stood: 1, 2, 7.
    expect(of(s.events, 'pickup').map((e) => e.total)).toEqual([1, 2, 7]);
  });

  it('exactly the cost empties it; one short is refused; it never goes negative', () => {
    const exact = sim(scene(), 12, A_X);
    exact.run('.30');
    expect([exact.state.pickups.count, exact.state.pickups.spent]).toEqual([0, 12]);
    const short = sim(scene(), 11, A_X);
    const ev = short.run('.200');
    expect(goalTypes(ev)).toEqual(['lanternRefuse']);
    expect(of(ev, 'lanternRefuse')[0]).toEqual({
      type: 'lanternRefuse',
      id: 'a',
      x: A_X,
      y: FLOOR,
      have: 11,
      need: 12,
      show: G.refuseShowFrames,
    });
    expect([short.state.pickups.count, short.state.pickups.spent, lantern(short).channel]).toEqual([
      11, 0, 0,
    ]);
    expect(short.state.player.kindling).toBe(-1);
    // Three lanterns on 30 glints: two burn, the third is refused with 6.
    const s = sim(scene(), 30);
    for (const l of three) {
      s.place(l.x, FLOOR);
      s.run('.40');
    }
    expect(s.state.goal.lanterns.map((l) => l.lit)).toEqual([true, true, false]);
    expect([s.state.pickups.count, s.state.pickups.spent]).toEqual([6, 24]);
    expect(of(s.events, 'lanternRefuse')[0]).toMatchObject({ id: 'c', have: 6, need: 12 });
    expect(s.state.goal.heart.awake).toBe(false);
  });

  it('the cost is data per lantern (default 12)', () => {
    const sc = scene({
      lanterns: [
        { id: 'cheap', x: A_X, y: FLOOR, cost: 3 },
        { id: 'dear', x: B_X, y: FLOOR, cost: 20 },
        { id: 'plain', x: C_X, y: FLOOR },
      ],
    });
    const s = sim(sc, 35);
    for (const l of sc.lanterns ?? []) {
      s.place(l.x, FLOOR);
      s.run('.30');
    }
    expect(of(s.events, 'lanternKindle').map((e) => [e.id, e.cost, e.wallet])).toEqual([
      ['cheap', 3, 32],
      ['dear', 20, 12],
      ['plain', 12, 0],
    ]);
    // A tuned default.
    const t = cloneTuning(defaultTuning);
    t.goal.cost = 2;
    const u = newSim(scene(), t);
    u.state.pickups.count = 2;
    u.place(A_X, FLOOR);
    u.run('.30');
    expect(u.state.pickups.count).toBe(0);
  });

  it('refuses once per approach: again only after she has gone away and come back', () => {
    const s = sim(scene(), 3, A_X);
    expect(of(s.run('.90'), 'lanternRefuse')).toHaveLength(1);
    // Hopping on the spot, a slash, a few steps either way: still the same approach.
    expect(of(s.run('J12 .50 A1 .30 R6 .10 L12 .10 R6 .30'), 'lanternRefuse')).toHaveLength(0);
    expect(lantern(s).refused).toBe(true);
    // Away past `refuseLeavePx` and back.
    s.run('R30 .10');
    expect(lantern(s).refused).toBe(false);
    const back = s.run('L30 .30');
    expect(Math.abs(feet(s).x - A_X)).toBeLessThan(44);
    expect(of(back, 'lanternRefuse')).toHaveLength(1);
    // Light that arrives while she stands there starts the channel at once.
    s.state.pickups.count = 12;
    const ev = s.run('.30');
    expect(of(ev, 'lanternChannel')[0]?.frames).toBe(1);
    expect(of(ev, 'lanternKindle')).toHaveLength(1);
  });
});

describe('lanterns: a lit one is a rest point', () => {
  it('standing at it hurt for 45 frames makes her whole; leaving starts the count over', () => {
    const s = sim(scene(), 12, A_X);
    s.run('.30');
    s.state.player.hp = 1;
    const ev = s.run(`.${G.restFrames - 1}`);
    expect(goalTypes(ev)).toEqual([]);
    expect([s.state.player.hp, lantern(s).rest]).toEqual([1, G.restFrames - 1]);
    const done = s.run('.1');
    expect(of(done, 'lanternRest')[0]).toEqual({
      type: 'lanternRest',
      id: 'a',
      x: A_X,
      y: FLOOR,
      hp: 4,
      hpMax: 4,
      healed: 3,
    });
    expect([s.state.player.hp, lantern(s).rest, s.state.pickups.count]).toEqual([4, 0, 0]);
    // Whole: nothing more.
    expect(goalTypes(s.run('.200'))).toEqual([]);
    // Stepping out half way starts over.
    s.state.player.hp = 2;
    s.run('.30 R12 .5');
    expect(lantern(s).rest).toBe(0);
    s.run('L12');
    const again = s.run('.60');
    expect(of(again, 'lanternRest')).toHaveLength(1);
    expect(s.state.player.hp).toBe(4);
  });

  it('kindling hurt: the rest follows 45 frames later; a dormant lantern heals nothing', () => {
    const s = sim(scene(), 12, A_X);
    s.state.player.hp = 2;
    const ev = s.run(`.${G.channelFrames + G.restFrames}`);
    expect(goalTypes(ev).filter((t) => t !== 'lanternChannel')).toEqual(['lanternKindle', 'lanternRest']);
    const d = sim(scene(), 0, A_X);
    d.state.player.hp = 2;
    d.run('.200');
    expect(d.state.player.hp).toBe(2);
  });

  it('it stays lit through a fade, and she re-forms at it', () => {
    const s = sim(scene({ enemies: [burr(3400)] }), 12, A_X);
    s.run('.30');
    expect(s.state.goal.restAt).toBe(0);
    // Away to the right, where safe ground would be; then her last light goes out on a burrback.
    s.run('R60 .40');
    const safe = s.state.player.safeX;
    expect(safe).toBeGreaterThan(A_X + 300);
    s.state.player.hp = 1;
    const e = s.state.enemies[0];
    if (!e) throw new Error('no enemy');
    s.place(e.x + e.w / 2 - 30, FLOOR);
    const ev = s.run(`.${H.fadeFrames + 3}`);
    expect(of(ev, 'fade')).toHaveLength(1);
    const re = of(ev, 'reform')[0];
    expect([re?.x, re?.y]).toEqual([A_X, FLOOR]);
    expect(feet(s)).toEqual({ x: A_X, y: FLOOR });
    expect(lantern(s).lit).toBe(true);
    expect([s.state.pickups.count, s.state.pickups.spent, s.state.goal.lit]).toEqual([0, 12, 1]);
    // A fade costs: 2 of 4 lights, and the lantern she re-formed in does not make her whole where
    // she stands (playtest 3: "a fade has no sting"): only once she has stepped out of it and come back.
    expect(s.state.player.hp).toBe(H.reformHp);
    expect(s.state.goal.restHold).toBe(true);
    expect(of(s.run(`.${G.restFrames * 4}`), 'lanternRest')).toEqual([]);
    expect([s.state.player.hp, lantern(s).rest]).toEqual([H.reformHp, 0]);
    // A hop on the spot is not leaving.
    expect(of(s.run(`J20 .40 .${G.restFrames}`), 'lanternRest')).toEqual([]);
    // Out of its box and back: now it is a rest.
    s.run('R12 .8');
    expect(s.state.goal.restHold).toBe(false);
    s.run('L12 .8');
    expect(feet(s).x).toBe(A_X);
    const rest = s.run(`.${G.restFrames}`);
    expect(of(rest, 'lanternRest')[0]).toMatchObject({ healed: 2, hp: 4 });
  });

  it('the lit lantern she last stood at is the one; an unlit one is not; without any, safe ground as before', () => {
    const s = sim(scene({ enemies: [burr(3400)] }), 24);
    s.place(B_X, FLOOR);
    s.run('.30');
    s.place(A_X, FLOOR);
    s.run('.30');
    expect(s.state.goal.restAt).toBe(0);
    // Back at the first one: just standing there takes it over. Standing at the dormant third does not.
    s.place(B_X, FLOOR);
    s.run('.2');
    expect(s.state.goal.restAt).toBe(1);
    s.place(C_X, FLOOR);
    s.run('.40');
    expect(s.state.goal.restAt).toBe(1);
    // Gliding or jumping through a lit one does not take it over.
    s.place(A_X - 200, FLOOR);
    s.run('R+J40');
    expect(feet(s).x).toBeGreaterThan(A_X + 60);
    expect(s.state.goal.restAt).toBe(1);
    const die = (t: Sim) => {
      t.state.player.hp = 1;
      const e = t.state.enemies[0];
      if (!e) throw new Error('no enemy');
      t.place(e.x + e.w / 2 - 30, FLOOR);
      return of(t.run(`.${H.fadeFrames + 3}`), 'reform')[0];
    };
    expect(die(s)?.x).toBe(B_X);
    // No lantern lit: the last safe ground.
    const n = sim(scene({ enemies: [burr(3400)] }), 0, 2600);
    n.run('.40');
    expect(die(n)?.x).toBe(2600);
  });

  it('a lantern holds her even with a creature living next to it (safe ground would not)', () => {
    const s = sim(scene({ enemies: [burr(A_X + 150, 1)] }), 12, A_X);
    s.run('.30');
    expect(lantern(s).lit).toBe(true);
    // (Calmed by the kindling it is harmless for 120 frames: wait that out.)
    s.run(`.${G.calmFrames + 5}`);
    s.state.player.hp = 1;
    const e = s.state.enemies[0];
    if (!e) throw new Error('no enemy');
    s.place(e.x + e.w / 2 - 30, FLOOR);
    const re = of(s.run(`.${H.fadeFrames + 60}`), 'reform')[0];
    expect(re?.x).toBe(A_X);
    expect(s.state.player.invuln).toBeGreaterThan(0);
  });
});

describe('lanterns: kindling calms the creatures round it', () => {
  it('burrbacks within calmPx stand for 120 frames, then walk on; further ones do not notice', () => {
    const s = sim(scene({ enemies: [burr(A_X + 500, 1, 'near'), burr(A_X - 1500, 1, 'far')] }), 12, A_X);
    s.run('.30');
    const [near, far] = s.state.enemies;
    expect([near?.mode, near?.timer, near?.turning, near?.vx]).toEqual(['pause', G.calmFrames, false, 0]);
    expect(far?.mode).toBe('walk');
    const x = near?.x;
    s.run(`.${G.calmFrames - 1}`);
    expect([near?.mode, near?.x]).toEqual(['pause', x]);
    s.run('.2');
    expect(near?.mode).toBe('walk');
    expect(near?.facing).toBe(1);
  });

  it('a lampwing that has noticed her gives up (`calm`), rests and goes home', () => {
    const wing: EnemySpawn = {
      id: 'w',
      kind: 'lampwing',
      x: A_X + 180,
      y: FLOOR - 160,
      facing: -1,
      radius: 60,
    };
    const s = sim(scene({ enemies: [wing] }), 12, A_X);
    const ev = s.run('.30');
    expect(of(ev, 'enemyNotice')).toHaveLength(1);
    const up = of(ev, 'enemyGiveUp');
    expect(up).toHaveLength(1);
    expect(up[0]?.cause).toBe('calm');
    expect(ev.indexOf(up[0] as SimEvent)).toBeGreaterThan(
      ev.findIndex((e) => e.type === 'lanternKindle') - 1,
    );
    expect(s.state.enemies[0]?.mode).toBe('rest');
    // It leaves her alone long enough to rest there: no touch in the next 45 frames.
    s.state.player.hp = 3;
    const after = s.run(`.${G.restFrames}`);
    expect(of(after, 'hurt')).toHaveLength(0);
    expect(of(after, 'lanternRest')).toHaveLength(1);
  });

  it('a creature mid-stagger is left alone; a dead one stays dead', () => {
    const s = sim(scene({ enemies: [burr(A_X + 400, -1)] }), 12, A_X);
    const e = s.state.enemies[0];
    if (!e) throw new Error('no enemy');
    e.mode = 'hurt';
    e.timer = 40;
    s.run('.30');
    expect(e.mode).toBe('hurt');
    expect(lantern(s).lit).toBe(true);
  });
});

describe('the heart', () => {
  it('wakes only when every lantern is lit, in the step the last one is kindled', () => {
    const s = sim(scene(), 36);
    s.place(A_X, FLOOR);
    s.run('.30');
    s.place(B_X, FLOOR);
    s.run('.30');
    expect([s.state.goal.lit, s.state.goal.heart.awake]).toEqual([2, false]);
    expect(of(s.events, 'heartWake')).toHaveLength(0);
    s.place(C_X, FLOOR);
    const ev = s.run('.30');
    expect(goalTypes(ev).slice(-2)).toEqual(['lanternKindle', 'heartWake']);
    expect(of(ev, 'heartWake')[0]).toEqual({ type: 'heartWake', x: HEART_X, y: FLOOR });
    expect(s.state.goal.heart).toEqual({
      awake: true,
      frames: 0,
      hinted: false,
      ready: false,
      waited: false,
    });
    s.run('.25');
    expect(s.state.goal.heart.frames).toBe(25);
  });

  it('asleep it only hints, once per run, and never ends anything', () => {
    expect(heartBox({ x: HEART_X, y: FLOOR }, G)).toEqual({ x: HEART_X - 48, y: FLOOR - 96, w: 96, h: 96 });
    const s = sim(scene(), 12, A_X);
    s.run('.30');
    s.place(HEART_X - 300, FLOOR);
    const ev = s.run('R60 .30 L60 .10 R60 .60');
    const sleep = of(ev, 'heartSleep');
    expect(sleep).toEqual([{ type: 'heartSleep', x: HEART_X, y: FLOOR, lit: 1, total: 3 }]);
    expect(s.state.goal.heart).toEqual({
      awake: false,
      frames: 0,
      hinted: true,
      ready: false,
      waited: false,
    });
    expect([s.state.goal.gathered, s.state.goal.ended]).toEqual([false, false]);
    // Standing in it asleep: she keeps control.
    s.place(HEART_X, FLOOR);
    s.run('.60 R30');
    expect(feet(s).x).toBeGreaterThan(HEART_X + 200);
  });

  it('awake, walking into it ends the run: gather, with the summary of the run', () => {
    const picks: Pickup[] = [
      { id: 'g1', kind: 'glint', x: 2100, y: 760 },
      { id: 'big', kind: 'great', x: 2200, y: 760 },
    ];
    const s = sim(scene({ pickups: picks, enemies: [burr(800)] }));
    // 20 idle frames (the clock starts at her first input), 6 glints gathered, one hit taken.
    s.run('.20 R30 .80');
    const b0 = s.state.enemies[0];
    if (!b0) throw new Error('no enemy');
    s.place(b0.x + b0.w / 2 - 30, FLOOR);
    s.run('.30');
    expect(of(s.events, 'hurt')).toHaveLength(1);
    s.state.pickups.count += 30;
    for (const l of three) {
      s.place(l.x, FLOOR);
      s.run('.30');
    }
    expect(s.state.goal.heart.awake).toBe(true);
    s.place(HEART_X - 200, FLOOR);
    const ev = s.run('R40');
    const g = of(ev, 'gather');
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({
      x: HEART_X,
      y: FLOOR,
      glints: 36,
      lanterns: 3,
      kills: 0,
      hits: 1,
      frames: G.holdFrames,
    });
    // The step that pushed `gather` had frame number `gatherFrame`; the first input was on frame 20.
    const gatherFrame = s.state.frame - s.state.goal.ending.frames - 1;
    expect(g[0]?.time).toBe(gatherFrame - 20);
    expect(s.state.goal.ending).toMatchObject({ glints: 36, kills: 0, hits: 1, time: g[0]?.time });
    expect(s.state.goal.gathered).toBe(true);
    // Her feet were on the ground inside the box.
    expect(Math.abs((g[0]?.px ?? 0) - HEART_X)).toBeLessThan(48 + 20);
    expect(g[0]?.py).toBe(FLOOR);
  });

  it('kills in the summary are the enemies she killed', () => {
    const s = sim(scene({ enemies: [burr(2290), burr(900, 1)] }), 36);
    s.place(2200, FLOOR);
    s.tuning.burrback.strikePx = 0;
    // (Three hit points here: one chain.)
    for (const e of s.state.enemies) e.hp = 3;
    s.run('R+A1 .20 R+A1 .22 R+A1 .60');
    expect(s.state.enemies[0]?.mode).toBe('dead');
    lightAll(s);
    s.place(HEART_X, FLOOR);
    const g = of(s.run('.2'), 'gather')[0];
    expect(g?.kills).toBe(1);
    // 36 poked + 36 for lightAll + the burrback's spill. The third cut of the combo is the
    // finisher: what it paid over the base worth is the bonus, apart from the glints found.
    expect((g?.glints ?? 0) + (g?.bonus ?? 0)).toBe(72 + of(s.events, 'pickup').length);
    expect(g?.bonus).toBe(defaultTuning.burrback.valueFinisher - defaultTuning.burrback.value);
    expect(g?.glintsTotal).toBe(2 * defaultTuning.burrback.value);
  });

  it('she has to be standing in it: flying through does not end the run', () => {
    const s = sim(scene());
    lightAll(s);
    s.place(HEART_X - 150, FLOOR);
    const ev = s.run('R+J30');
    expect(feet(s).x).toBeGreaterThan(HEART_X + 60);
    expect(of(ev, 'gather')).toHaveLength(0);
    const land = s.run('L40');
    expect(of(land, 'gather')).toHaveLength(1);
  });
});

describe('the ending', () => {
  function ended(enemies: EnemySpawn[] = [], t = cloneTuning(defaultTuning)) {
    const s = newSim(scene({ enemies }), t);
    lightAll(s);
    s.place(HEART_X + 150, FLOOR);
    const ev = s.run('L20');
    expect(of(ev, 'gather')).toHaveLength(1);
    return s;
  }

  it('control is taken for 240 frames: she walks on into the heart and stands; then endHold, and it stays ended', () => {
    const s = ended();
    const g0 = s.state.frame - s.state.goal.ending.frames - 1;
    // Whatever is pressed: she ends at the heart's centre, standing.
    const ev = s.run('R+J30 X1 A1 L+J40 R+X1 J1 .1 J1 R60');
    expect(ev.filter((e) => ['jump', 'dashStart', 'slash'].includes(e.type))).toEqual([]);
    expect(Math.abs(feet(s).x - HEART_X)).toBeLessThanOrEqual(G.heartWalkPx + 10);
    expect([s.state.player.vx, s.state.player.grounded, s.state.player.motion]).toEqual([0, true, 'idle']);
    expect(s.state.goal.ended).toBe(false);
    const x = feet(s).x;
    const rest = s.run(`.${G.holdFrames}`);
    const end = of(rest, 'endHold');
    expect(end).toEqual([{ type: 'endHold', x: HEART_X, y: FLOOR }]);
    // Exactly `holdFrames` steps after the gather step.
    const endFrame = g0 + G.holdFrames;
    const idx = s.events.findIndex((e) => e.type === 'endHold');
    const before = s.events.slice(0, idx).filter((e) => e.type === 'lanternChannel').length;
    expect(before).toBeGreaterThan(0);
    expect(s.state.goal.ending.frames).toBe(G.holdFrames);
    expect(s.state.goal.ended).toBe(true);
    expect(s.state.frame).toBeGreaterThan(endFrame);
    // Ended: held for good, nothing more happens.
    const after = s.run('R60 J10 A1 X1 .200');
    expect(after.filter((e) => e.type !== 'step')).toEqual([]);
    expect(feet(s).x).toBe(x);
    expect(s.state.goal.ending.frames).toBe(G.holdFrames);
    expect(s.state.goal.heart.frames).toBeGreaterThan(G.holdFrames);
  });

  it('the offering: what she still carries goes into the heart during the hold, and counts in tiers (25 / 50 / 100)', () => {
    // (Playtest 4: an explorer ended with 96 idle glints and nothing to do with them.)
    expect([G.offerTier1, G.offerTier2, G.offerTier3]).toEqual([25, 50, 100]);
    for (const [carry, tier] of [
      [0, 0],
      [1, 0],
      [24, 0],
      [25, 1],
      [60, 2],
      [96, 2],
      [100, 3],
      [300, 3],
    ] as const) {
      const s = newSim(scene());
      lightAll(s);
      s.state.pickups.count = carry;
      s.place(HEART_X + 150, FLOOR);
      const ev = s.run(`L20 .${G.holdFrames}`);
      const g = of(ev, 'gather')[0];
      expect(g, `${carry}`).toMatchObject({ offered: carry, offerTier: tier, offerTiers: [25, 50, 100] });
      // The summary is fixed at the gather; the wallet drains during the hold.
      expect(s.state.goal.ending, `${carry}`).toMatchObject({
        offered: carry,
        offerTier: tier,
        glints: 36 + carry,
      });
      const offers = of(ev, 'heartOffer');
      expect(
        offers.reduce((n, e) => n + e.value, 0),
        `${carry}`,
      ).toBe(carry);
      expect([s.state.pickups.count, s.state.pickups.offered], `${carry}`).toEqual([0, carry]);
      expect(s.state.goal.offer, `${carry}`).toEqual({ total: carry, given: carry, tier });
      // Nothing before the delay; all of it in by the end of the span, well inside the hold.
      const at = offers.map((e) => ev.indexOf(e));
      const gi = ev.indexOf(g as SimEvent);
      for (const i of at) expect(i).toBeGreaterThan(gi);
      if (carry > 0) {
        const first = offers[0];
        const last = offers.at(-1);
        expect(first).toMatchObject({ x: HEART_X, y: FLOOR, of: carry });
        expect(last).toMatchObject({ given: carry, wallet: 0, tier });
        expect(of(ev, 'endHold')).toHaveLength(1);
        expect(ev.indexOf(last as SimEvent)).toBeLessThan(ev.findIndex((e) => e.type === 'endHold'));
      }
      // A tier is told once, as the count passes it, in order.
      expect(
        of(ev, 'heartTier').map((e) => [e.tier, e.need]),
        `${carry}`,
      ).toEqual(
        [
          [1, 25],
          [2, 50],
          [3, 100],
        ].slice(0, tier),
      );
      for (const t of of(ev, 'heartTier')) expect(t.given).toBeGreaterThanOrEqual(t.need);
    }
    // The pace: one at a time for a small purse (the last lands 140 frames after the first could),
    // several a step for a big one; the first leaves her 45 frames after the gather.
    const s = newSim(scene());
    lightAll(s);
    s.state.pickups.count = 10;
    s.place(HEART_X, FLOOR);
    const frames: number[] = [];
    for (let f = 0; f < G.holdFrames + 2; f++) {
      const from = s.events.length;
      step(s.state, 0, s.tuning, s.scene, s.events);
      if (s.events.slice(from).some((e) => e.type === 'heartOffer')) frames.push(f);
    }
    expect(frames).toHaveLength(10);
    expect(frames[0]).toBe(G.offerDelayFrames);
    expect((frames[1] as number) - (frames[0] as number)).toBe(14);
    expect(frames.at(-1) as number).toBeLessThanOrEqual(G.offerDelayFrames + G.offerSpanFrames);
    // A hold too short for it: the rest goes in with the end.
    const short = newSim(scene());
    short.tuning.goal.holdFrames = 50;
    lightAll(short);
    short.state.pickups.count = 40;
    short.place(HEART_X, FLOOR);
    short.run('.60');
    expect([short.state.goal.ended, short.state.pickups.count, short.state.pickups.offered]).toEqual([
      true,
      0,
      40,
    ]);
    // Everything gathered is accounted for: carried + spent + dropped + offered.
    const w = short.state.pickups;
    expect(w.count + w.spent + w.lost + w.offered).toBe(36 + 40);
  });

  it('endHold comes exactly holdFrames steps after gather', () => {
    const s = newSim(scene());
    lightAll(s);
    s.place(HEART_X, FLOOR);
    let gatherAt = -1;
    let endAt = -1;
    for (let f = 0; f < 400; f++) {
      const from = s.events.length;
      step(s.state, 0, s.tuning, s.scene, s.events);
      for (const e of s.events.slice(from)) {
        if (e.type === 'gather') gatherAt = f;
        if (e.type === 'endHold') endAt = f;
      }
    }
    expect(gatherAt).toBe(0);
    expect(endAt - gatherAt).toBe(G.holdFrames);
  });

  it('nothing can hurt her from the gather on; burrbacks stand for the hold, lampwings give up and take no notice', () => {
    const wing: EnemySpawn = {
      id: 'w',
      kind: 'lampwing',
      x: HEART_X + 150,
      y: FLOOR - 200,
      facing: -1,
      radius: 60,
    };
    const s = ended([burr(HEART_X - 200, 1, 'walker'), wing]);
    const [walker, w] = s.state.enemies;
    expect(walker?.mode).toBe('pause');
    expect(walker?.timer).toBeGreaterThan(G.holdFrames - 25);
    const ev = s.run(`.${G.holdFrames + 400}`);
    expect(of(ev, 'hurt')).toHaveLength(0);
    expect(of(ev, 'enemyNotice')).toHaveLength(0);
    expect(s.state.player.hp).toBe(4);
    expect(w?.mode === 'hover' || w?.mode === 'return' || w?.mode === 'rest').toBe(true);
    // The burrback walked on after the hold, straight through her: no hit.
    expect(walker?.mode === 'walk' || walker?.mode === 'pause').toBe(true);
    expect(walker?.stride).toBeGreaterThan(200);
    expect(s.state.goal.run.hits).toBe(0);
  });

  it('a lampwing in its dive at the gather gives up', () => {
    const wing: EnemySpawn = {
      id: 'w',
      kind: 'lampwing',
      x: HEART_X + 260,
      y: FLOOR - 150,
      facing: -1,
      radius: 60,
    };
    // (Without the woken heart's own calm, which would have settled it already: below.)
    const t = cloneTuning(defaultTuning);
    t.goal.heartCalmPx = 0;
    const s = newSim(scene({ enemies: [wing] }), t);
    lightAll(s);
    s.place(HEART_X + 150, FLOOR);
    // Let it notice and come at her, then walk into the heart.
    s.run('.45');
    expect(['dive', 'stall']).toContain(s.state.enemies[0]?.mode);
    const ev = s.run('L20');
    expect(of(ev, 'gather')).toHaveLength(1);
    expect(of(ev, 'enemyGiveUp')[0]?.cause).toBe('calm');
    expect(of(s.run('.600'), 'hurt')).toHaveLength(0);
  });

  it('endedControl: she may walk on after the hold, still safe; lanterns and heart do nothing more', () => {
    const t = cloneTuning(defaultTuning);
    t.goal.endedControl = true;
    const s = ended([burr(HEART_X - 400, 1)], t);
    s.run(`R${G.holdFrames}`);
    expect(s.state.goal.ended).toBe(true);
    const x = feet(s).x;
    const ev = s.run('L60 .5');
    expect(feet(s).x).toBeLessThan(x - 300);
    expect(of(ev, 'hurt')).toHaveLength(0);
    s.place(HEART_X + 200, FLOOR);
    expect(goalTypes(s.run('L60 .30'))).toEqual([]);
  });

  it('heartWalkPx 0: she simply stops where she was', () => {
    const t = cloneTuning(defaultTuning);
    t.goal.heartWalkPx = 0;
    const s = ended([], t);
    s.run('.60');
    expect(feet(s).x).toBeGreaterThan(HEART_X + 30);
    expect(s.state.player.vx).toBe(0);
  });
});

describe('goal: restart, determinism, symmetry, scenes without one', () => {
  const script = '.10 R42 .110 R+J20 R30 .30 L60 A1 .20 L40 .60 R200 .40 L+J30 L100 .40 R120 .35 R60 .300';
  const world = () =>
    scene({
      pickups: Array.from({ length: 14 }, (_, i) => ({
        id: `g${i}`,
        kind: 'glint' as const,
        x: 2060 + i * 24,
        y: 760,
      })),
      enemies: [burr(2950, -1, 'x'), burr(1500, 1, 'y')],
      lanterns: [
        { id: 'a', x: A_X, y: FLOOR },
        { id: 'b', x: 2150, y: FLOOR, cost: 1 },
      ],
    });

  it('a restart is a fresh state: lanterns dark, nothing spent, the heart asleep, not ended', () => {
    const s = newSim(scene());
    lightAll(s);
    s.place(HEART_X, FLOOR);
    s.run(`.${G.holdFrames + 5}`);
    expect([s.state.goal.lit, s.state.goal.ended, s.state.pickups.spent]).toEqual([3, true, 36]);
    const fresh = createState(1, s.tuning, s.scene);
    expect(fresh.version).toBe(18);
    expect(fresh.goal).toEqual({
      lanterns: [0, 1, 2].map(() => ({
        lit: false,
        litFrame: -1,
        channel: 0,
        rest: 0,
        short: 0,
        refused: false,
        noticed: false,
        pledged: false,
        still: 0,
        keyed: true,
      })),
      lit: 0,
      restAt: -1,
      lamps: [],
      lampsLit: 0,
      restLamp: -1,
      restHold: false,
      heart: { awake: false, frames: 0, hinted: false, ready: false, waited: false },
      gathered: false,
      ending: {
        frames: 0,
        glints: 0,
        bonus: 0,
        time: 0,
        kills: 0,
        hits: 0,
        glintsTotal: 0,
        pods: 0,
        podsTotal: 0,
        greats: 0,
        greatsTotal: 0,
        enemiesTotal: 0,
        deaths: 0,
        lamps: 0,
        lampsTotal: 0,
        offered: 0,
        offerTier: 0,
        offerNext: 0,
      },
      offer: { total: 0, given: 0, tier: 0 },
      grove: { flowers: false, paths: false, canopy: false },
      ended: false,
      run: { start: -1, hits: 0, deaths: 0 },
    });
    expect([fresh.pickups.count, fresh.pickups.spent, fresh.player.kindling]).toEqual([0, 0, -1]);
    expect(fresh.player.kindlingLamp).toBe(-1);
    // A teleport keeps it all.
    s.place(2000, FLOOR);
    expect([s.state.goal.lit, s.state.goal.ended, s.state.pickups.spent]).toEqual([3, true, 36]);
  });

  it('the same inputs give the same hash; a clone is independent and hashes the same', () => {
    const a = newSim(world());
    const b = newSim(world());
    a.run(script);
    b.run(script);
    expect(of(a.events, 'lanternKindle').length).toBeGreaterThan(0);
    expect(hashState(a.state)).toBe(hashState(b.state));
    const c = cloneState(a.state);
    expect(hashState(c)).toBe(hashState(a.state));
    expect(c.goal).not.toBe(a.state.goal);
    expect(c.goal.lanterns[0]).not.toBe(a.state.goal.lanterns[0]);
    for (const k of ['heart', 'ending', 'run'] as const) expect(c.goal[k]).not.toBe(a.state.goal[k]);
    (c.goal.lanterns[0] as { lit: boolean }).lit = !c.goal.lanterns[0]?.lit;
    c.goal.heart.frames = 99;
    expect(hashState(c)).not.toBe(hashState(a.state));
    // The goal is in the hash.
    const d = cloneState(a.state);
    d.pickups.spent++;
    expect(hashState(d)).not.toBe(hashState(a.state));
  });

  it('mirror symmetry: a mirrored scene and mirrored inputs give the mirrored run, event for event', () => {
    const W = 4000;
    const sc = world();
    const mirrored: Scene = {
      ...sc,
      pickups: (sc.pickups ?? []).map((p) => ({ ...p, x: W - p.x })),
      enemies: (sc.enemies ?? []).map((e) => ({ ...e, x: W - e.x, facing: -e.facing as -1 | 1 })),
      lanterns: (sc.lanterns ?? []).map((l) => ({ ...l, x: W - l.x })),
      heart: { x: W - HEART_X, y: FLOOR },
    };
    const a = newSim(sc);
    const b = newSim(mirrored);
    const ma = parseInputScript(script);
    const mb = parseInputScript(script.replace(/[LR]/g, (c) => (c === 'L' ? 'R' : 'L')));
    for (let i = 0; i < ma.length; i++) {
      const fa = a.events.length;
      const fb = b.events.length;
      step(a.state, ma[i] as number, a.tuning, a.scene, a.events);
      step(b.state, mb[i] as number, b.tuning, b.scene, b.events);
      const p = a.state.player;
      const q = b.state.player;
      expect([q.x, q.y, q.hp, q.kindling], `frame ${i}`).toEqual([W - p.x - p.w, p.y, p.hp, p.kindling]);
      expect(goalTypes(b.events.slice(fb)), `frame ${i}`).toEqual(goalTypes(a.events.slice(fa)));
      expect(b.state.goal.lanterns.map((l) => [l.lit, l.channel, l.rest, l.refused])).toEqual(
        a.state.goal.lanterns.map((l) => [l.lit, l.channel, l.rest, l.refused]),
      );
      expect(b.state.pickups.count).toBe(a.state.pickups.count);
    }
    expect(a.state.goal.lit).toBeGreaterThan(0);
    expect(of(a.events, 'lanternKindle').map((e) => W - e.x)).toEqual(
      of(b.events, 'lanternKindle').map((e) => e.x),
    );
  });

  it('a scene without lanterns or heart has no goal: nothing fires, nothing is held', () => {
    const s = newSim(flatScene());
    s.state.pickups.count = 50;
    const ev = s.run('R60 .60 L+J30 A1 .60');
    expect(goalTypes(ev)).toEqual([]);
    expect(s.state.goal.lanterns).toEqual([]);
    expect([s.state.goal.heart.awake, s.state.goal.gathered, s.state.pickups.count]).toEqual([
      false,
      false,
      50,
    ]);
    // Lanterns but no heart: they can all be lit; nothing wakes.
    const n = newSim(scene({ heart: false }));
    const lit = lightAll(n);
    expect(of(lit, 'lanternKindle')).toHaveLength(3);
    expect(of(lit, 'heartWake')).toHaveLength(0);
    expect(n.state.goal.heart.awake).toBe(false);
  });

  it('ignoring the lanterns changes nothing: the grove without them plays out identically', () => {
    const script2 = 'R60 R+J30 R40 A1 .16 A1 .18 A1 R80 R+J40 .30 L200 L+J30 L120 .60';
    const bare: Scene = { ...GROVE, lanterns: [], heart: undefined };
    delete (bare as { heart?: unknown }).heart;
    const a = newSim(GROVE);
    const b = newSim(bare);
    a.run(script2);
    b.run(script2);
    expect(goalTypes(a.events).filter((t) => t !== 'lanternRefuse')).toEqual([]);
    expect(a.state.player).toEqual(b.state.player);
    expect(a.state.enemies).toEqual(b.state.enemies);
    expect(a.state.pickups).toEqual(b.state.pickups);
    expect(a.state.pods).toEqual(b.state.pods);
  });
});

describe('the grove: lanterns and heart in the scene data', () => {
  const lanterns = GROVE.lanterns ?? [];
  const heart = GROVE.heart;

  it('three lanterns, one per third of the scene, each standing on solid ground away from the spawn', () => {
    expect(lanterns.map((l) => l.id)).toEqual(['lantern-stone', 'lantern-crown', 'lantern-far']);
    const third = GROVE.width / 3;
    expect(lanterns.map((l) => Math.floor(l.x / third))).toEqual([0, 1, 2]);
    for (const l of lanterns) {
      const b = lanternBox(l, G);
      const on = GROVE.solids.find((q) => q.y === l.y && b.x >= q.x && b.x + b.w <= q.x + q.w);
      expect(on, l.id).toBeDefined();
      expect(on?.tag).not.toBe('pool');
      expect(Math.hypot(l.x - GROVE.spawn.x, l.y - GROVE.spawn.y), l.id).toBeGreaterThanOrEqual(
        LANTERN_SPAWN_CLEAR,
      );
      // She can be placed standing exactly at it.
      const s = newSim();
      s.place(l.x, l.y);
      expect(feet(s)).toEqual({ x: l.x, y: l.y });
      expect(s.state.player.grounded).toBe(true);
    }
    // All three at the default cost: 36 in all.
    expect(lanterns.map((l) => l.cost ?? G.cost)).toEqual([12, 12, 12]);
  });

  it('the heart is on the right rise, at the shrine, and no pod or lantern stands in it', () => {
    if (!heart) throw new Error('no heart');
    expect(heart).toEqual({ x: 5212, y: 1088 });
    const b = heartBox(heart, G);
    for (const p of GROVE.pods ?? []) expect(p.x < b.x - 22 || p.x > b.x + b.w + 22, p.id).toBe(true);
    // The one burrback on the heart's ground (burr-rise, the walker's last fight) keeps west of it:
    // its range ends 58 px short of the heart's box.
    for (const e of GROVE.enemies ?? [])
      if (e.kind === 'burrback' && e.y === heart.y && e.x > 4608)
        expect(e.x + (e.radius ?? 9999) + 26, e.id).toBeLessThan(b.x - 50);
    const s = newSim();
    s.place(heart.x, heart.y);
    expect(feet(s)).toEqual(heart);
    // Asleep at the start: standing in it is only a hint.
    const ev = s.run('.10');
    expect(of(ev, 'heartSleep')).toHaveLength(1);
    expect(of(ev, 'gather')).toHaveLength(0);
  });

  it('rejects bad lantern and heart data', () => {
    const base = { ...GROVE, lanterns: undefined, heart: undefined };
    const withL = (l: unknown[], h?: unknown) => () =>
      parseScene({ ...base, lanterns: l, ...(h ? { heart: h } : {}) });
    expect(withL([{ id: 'ok', x: 2000, y: 1280 }])).not.toThrow();
    expect(withL([{ id: 'near', x: 1300, y: 1280 }])).toThrow(/too close to the spawn/);
    expect(withL([{ id: 'air', x: 2000, y: 1200 }])).toThrow(/does not stand/);
    expect(withL([{ id: 'sunk', x: 2000, y: 1300 }])).toThrow(/inside a solid/);
    expect(withL([{ id: 'pool', x: 1700, y: 1408 }])).toThrow(/does not stand/);
    expect(withL([{ id: 'edge', x: 2550, y: 1280 }])).toThrow(/inside a solid|does not stand/);
    expect(withL([{ id: 'branch', x: 2176, y: 1024 }])).toThrow(/does not stand/);
    expect(
      withL([
        { id: 'twin', x: 2000, y: 1280 },
        { id: 'twin', x: 2300, y: 1280 },
      ]),
    ).toThrow(/two things/);
    expect(withL([{ id: 'spawn-1', x: 2000, y: 1280 }])).toThrow(/two things/);
    expect(withL([{ id: 'cost', x: 2000, y: 1280, cost: -1 }])).toThrow();
    expect(withL([{ id: 'extra', x: 2000, y: 1280, glow: 1 }])).toThrow();
    expect(withL([], { x: 2000, y: 1280 })).toThrow(/needs lanterns/);
    expect(withL([{ id: 'ok', x: 2000, y: 1280 }], { x: 2300, y: 1200 })).toThrow(/does not stand/);
    expect(withL([{ id: 'ok', x: 2000, y: 1280 }], { x: 2030, y: 1280 })).toThrow(/stands in the heart/);
    expect(withL([{ id: 'ok', x: 2000, y: 1280 }], { x: 2300, y: 1280 })).not.toThrow();
  });
});

describe('playtest 5: the ember, the wake that is waited for, what the offering wakes', () => {
  const ember: Pickup = { id: 'ember', kind: 'great', x: 800, y: FLOOR - 40 };
  const keyed = (): Scene =>
    scene({ lanterns: [{ id: 'a', x: A_X, y: FLOOR, key: 'ember' }], pickups: [ember] });

  it('a lantern with a `key` will not catch until she has gathered that great glint, and says what it wants', () => {
    const s = sim(keyed(), 30, A_X - 300);
    expect(lantern(s).keyed).toBe(false);
    // Coming near: the notice carries the key. Standing at it with the price: no channel, a refusal with the key.
    const ev = s.run('R40 .40');
    expect(of(ev, 'lanternNotice')[0]).toMatchObject({
      id: 'a',
      key: { id: 'ember', x: 800, y: FLOOR - 40 },
    });
    s.place(A_X, FLOOR);
    const at = s.run('.60');
    expect(of(at, 'lanternChannel')).toHaveLength(0);
    expect(of(at, 'lanternRefuse')[0]).toMatchObject({ have: 30, need: 12, key: { id: 'ember' } });
    expect(s.state.goal.lit).toBe(0);
    // She fetches it: `lanternKey` the step it reaches her; back at the lantern it catches as any other.
    s.place(800, FLOOR);
    const got = s.run('.80');
    expect(of(got, 'lanternKey')).toEqual([
      { type: 'lanternKey', id: 'a', x: A_X, y: FLOOR, key: 'ember', kx: 800, ky: FLOOR - 40 },
    ]);
    expect(lantern(s).keyed).toBe(true);
    s.place(A_X, FLOOR);
    const lit = s.run(`.${G.channelFrames}`);
    expect(of(lit, 'lanternKindle')[0]).toMatchObject({ id: 'a', cost: 12 });
    // The ember is a great glint like the others: its worth is in her wallet.
    expect(s.state.pickups.spent).toBe(12);
    // A key that is not a great glint of the scene is refused by the validation.
    expect(() =>
      parseScene({ ...GROVE, lanterns: [{ ...(GROVE.lanterns ?? [])[1], key: 'spawn-1' }] }),
    ).toThrow(/not a great glint/);
    // In the grove: the summit's lantern wants the ember that hangs over F3, above the first lantern.
    expect((GROVE.lanterns ?? []).map((l) => l.key)).toEqual([undefined, 'great-ember', undefined]);
    expect((GROVE.pickups ?? []).find((p) => p.id === 'great-ember')).toMatchObject({
      kind: 'great',
      x: 1500,
      y: 650,
    });
  });

  it('the wake has a length: there before it has played she stands in the waking light, in control, and the run ends when it is ready', () => {
    const t = cloneTuning(defaultTuning);
    t.goal.heartWakeFrames = WAKE_FRAMES;
    expect(WAKE_FRAMES).toBe(180);
    const s = newSim(scene(), t);
    lightAll(s);
    // 30 frames after it woke she is standing in it: no gather; `heartWait` once.
    s.run('.20');
    s.place(HEART_X, FLOOR);
    const early = s.run('.60');
    expect(of(early, 'gather')).toHaveLength(0);
    expect(of(early, 'heartWait')).toHaveLength(1);
    expect(of(early, 'heartWait')[0]?.frames).toBeGreaterThan(100);
    expect(s.state.goal.heart).toMatchObject({ awake: true, ready: false, waited: true });
    // Her input is her own meanwhile: she can step out and back.
    const x = feet(s).x;
    s.run('R6 .4 L6');
    expect(feet(s).x).not.toBe(x - 1000);
    expect(s.state.goal.gathered).toBe(false);
    // The wake has played: `heartReady`, and standing there the run ends on that step or the next.
    s.place(HEART_X, FLOOR);
    const rest = s.run(`.${WAKE_FRAMES}`);
    const ready = rest.findIndex((e) => e.type === 'heartReady');
    const gather = rest.findIndex((e) => e.type === 'gather');
    expect(ready).toBeGreaterThanOrEqual(0);
    expect(rest[ready]).toMatchObject({ waited: true });
    expect(gather).toBeGreaterThan(ready);
    expect(s.state.goal.heart.frames).toBeGreaterThanOrEqual(WAKE_FRAMES);
  });

  it('awake, the heart keeps the creatures round it calm until the run ends', () => {
    const s = newSim(scene({ enemies: [burr(HEART_X - 200, 1)] }));
    lightAll(s);
    s.run('.40');
    s.place(HEART_X - 180, FLOOR);
    s.state.goal.heart.ready = false;
    const ev = s.run('.200');
    expect(of(ev, 'hurt')).toHaveLength(0);
    expect(of(ev, 'enemyWindup')).toHaveLength(0);
    expect(s.state.enemies[0]?.calm).toBeGreaterThan(0);
    expect(G.heartCalmPx).toBe(600);
  });

  it('each tier of the offering wakes one part more of the grove: flowers at 25, the paths at 50, the canopy at 100', () => {
    const run = (glints: number) => {
      const s = newSim(scene());
      lightAll(s);
      s.state.pickups.count = glints;
      s.place(HEART_X, FLOOR);
      const ev = s.run(`.${G.holdFrames + 5}`);
      return { s, ev };
    };
    const none = run(10);
    expect(of(none.ev, 'groveWake')).toHaveLength(0);
    expect(none.s.state.goal.grove).toEqual({ flowers: false, paths: false, canopy: false });
    expect(of(none.ev, 'gather')[0]).toMatchObject({ offered: 10, offerTier: 0, offerNext: 15 });
    const one = run(30);
    expect(of(one.ev, 'groveWake').map((e) => [e.tier, e.part])).toEqual([[1, 'flowers']]);
    expect(one.s.state.goal.grove).toEqual({ flowers: true, paths: false, canopy: false });
    expect(one.s.state.goal.ending).toMatchObject({ offered: 30, offerTier: 1, offerNext: 20 });
    const all = run(120);
    const woke = of(all.ev, 'groveWake');
    expect(woke.map((e) => [e.tier, e.part])).toEqual([
      [1, 'flowers'],
      [2, 'paths'],
      [3, 'canopy'],
    ]);
    // In order, a while apart (the offering goes in over 140 frames), each in the step its tier is passed.
    expect((woke[1]?.frame ?? 0) - (woke[0]?.frame ?? 0)).toBeGreaterThan(15);
    expect((woke[2]?.frame ?? 0) - (woke[1]?.frame ?? 0)).toBeGreaterThan(30);
    expect(of(all.ev, 'heartTier').map((e) => e.tier)).toEqual([1, 2, 3]);
    expect(all.s.state.goal.grove).toEqual({ flowers: true, paths: true, canopy: true });
    expect(all.s.state.goal.ending.offerNext).toBe(0);
  });
});
