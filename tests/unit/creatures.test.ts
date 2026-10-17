/**
 * The lamp-rule creatures (memory/creatures.md): senses by lamp light, lamp-guarders dispersing on a
 * snuff, no drops, the burrback under the new rules, the old burrback, the hawker, grabs into Caught,
 * the orb web and its weaver, and the fairness rules (telegraphs, no unavoidable hit).
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { litAt } from '../../src/sim/enemies/senses';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, step } from '../../src/sim/index';
import type { EnemySpawn, Lure, Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { newSim, type Sim } from './helpers';

const FLOOR = 800;
const T = defaultTuning;

/** A flat lamp room (floor top at 800, 4000 wide) with these creatures and lures. */
function room(enemies: EnemySpawn[], lures: Lure[] = [], extra: Partial<Scene> = {}): Scene {
  return {
    id: 'test',
    width: 4000,
    height: 1000,
    spawn: { x: 200, y: FLOOR },
    senses: 'lamp',
    solids: [{ tag: 'ground', x: 0, y: FLOOR, w: 4000, h: 200 }, ...(extra.solids ?? [])],
    oneWays: [],
    lures,
    enemies,
    ...extra,
  } as Scene;
}

const wick = (id: string, x: number, y: number): Lure => ({ id, kind: 'wick', x, y });
const types = (ev: SimEvent[]) => ev.map((e) => e.type);
const of = <K extends SimEvent['type']>(ev: SimEvent[], type: K) =>
  ev.filter((e) => e.type === type) as Extract<SimEvent, { type: K }>[];

const snuff = (s: Sim, i: number) => {
  s.state.lures.hp[i] = 0;
  s.state.lures.out[i] = s.state.frame + 1;
};
const enemy = (s: Sim, id: string) =>
  s.state.enemies.find((e) => e.id === id) as Sim['state']['enemies'][number];

describe('senses by lamp light', () => {
  it('lit is 1 at a flame, falls to 0 at litScale x its pull radius, and is 0 once it is out', () => {
    const s = newSim(room([], [wick('w', 1000, 400)]));
    const reach = T.lures.kinds.wick.radius * T.senses.litScale;
    expect(litAt(s.state, s.scene, s.tuning, 1000, 400)).toBe(1);
    expect(litAt(s.state, s.scene, s.tuning, 1000 + reach - 1, 400)).toBeGreaterThan(0);
    expect(litAt(s.state, s.scene, s.tuning, 1000 + reach + 1, 400)).toBe(0);
    snuff(s, 0);
    expect(litAt(s.state, s.scene, s.tuning, 1000, 400)).toBe(0);
  });

  it('a lamp-room burrback ignores her in the dark: no notice, no brace, it dozes, and its touch does nothing', () => {
    const s = newSim(room([{ id: 'b', kind: 'burrback', x: 2000, y: FLOOR, facing: -1 }]));
    s.place(1900, FLOOR);
    const ev = s.run('.120');
    expect(types(ev)).not.toContain('enemyAware');
    expect(types(ev)).not.toContain('enemyWindup');
    expect(enemy(s, 'b').dozing).toBe(true);
    // Walk right through it.
    const walk = s.run('R40');
    expect(types(walk)).not.toContain('hurt');
    expect(s.state.player.lit).toBe(0);
  });

  it('in a wick light the same burrback sees her and braces', () => {
    const s = newSim(
      room([{ id: 'b', kind: 'burrback', x: 2000, y: FLOOR, facing: -1 }], [wick('w', 2000, 600)]),
    );
    s.place(1900, FLOOR);
    const ev = s.run('.30');
    expect(s.state.player.lit).toBeGreaterThan(0);
    expect(types(ev)).toContain('enemyAware');
    expect(of(ev, 'enemyWindup')[0]?.frames).toBe(T.burrback.windupFrames);
  });

  it('the test grove keeps the old rule (wallet): a room without `senses` reads the wallet', () => {
    const scene = room(
      [{ id: 'b', kind: 'burrback', x: 2000, y: FLOOR, facing: -1 }],
      [wick('w', 2000, 600)],
    );
    delete (scene as { senses?: string }).senses;
    const s = newSim(scene);
    s.place(1900, FLOOR);
    expect(types(s.run('.30'))).not.toContain('enemyWindup');
    s.state.pickups.count = 6;
    expect(types(s.run('.30'))).toContain('enemyWindup');
    expect(getRoom('test-grove').senses).toBe('wallet');
    expect(getRoom('lab-creatures').senses).toBe('lamp');
  });
});

describe('lamp-guarders disperse on a snuff', () => {
  const scene = () =>
    room(
      [
        { id: 'b', kind: 'burrback', x: 1200, y: FLOOR, facing: 1, guards: 'wb' },
        { id: 'h', kind: 'hawker', x: 2600, y: 450, facing: 1, guards: 'wh' },
      ],
      [wick('wb', 1200, 600), wick('wh', 2600, 560)],
    );

  it('a burrback curls up asleep: harmless, then a cut wakes it for the fight and it sleeps again after', () => {
    const s = newSim(scene());
    s.run('.10');
    snuff(s, 0);
    const ev = s.run('.2');
    expect(of(ev, 'enemyDisperse')[0]).toMatchObject({ id: 'b', how: 'sleep', lure: 'wb', quiet: false });
    const b = enemy(s, 'b');
    expect(b.mode).toBe('sleep');
    // Stand on it: nothing.
    s.place(b.x + b.w / 2, FLOOR);
    expect(types(s.run('.60'))).not.toContain('hurt');
    // Cut it: it wakes (roused) and braces at her.
    s.place(b.x - 30, FLOOR);
    s.state.player.facing = 1;
    const fight = s.run('A1 .60');
    expect(types(fight)).toContain('enemyHit');
    expect(types(fight)).toContain('enemyWindup');
    // Left alone it goes back to sleep once the fight is over.
    s.place(200, FLOOR);
    s.run(`.${T.burrback.rouseFrames + 200}`);
    expect(enemy(s, 'b').mode).toBe('sleep');
  });

  it('a hawker leaves the room and is gone, harmless on the way', () => {
    const s = newSim(scene());
    s.run('.10');
    snuff(s, 1);
    const ev = s.run('.2');
    expect(of(ev, 'enemyDisperse')[0]).toMatchObject({ id: 'h', how: 'leave' });
    expect(enemy(s, 'h').mode).toBe('leave');
    s.run(`.${T.hawker.leaveFrames + 2}`);
    expect(enemy(s, 'h').gone).toBe(true);
  });

  it('a lamp already out when she comes in: they are simply asleep / gone (quiet)', () => {
    const save = newSave([]);
    save.snuffed.push('test:wb', 'test:wh');
    const events: SimEvent[] = [];
    const t = cloneTuning(defaultTuning);
    const sc = scene();
    const state = createState(1, t, sc, events, undefined, save);
    const s = newSim(sc, t);
    s.state = state;
    const ev: SimEvent[] = [];
    for (let i = 0; i < 2; i++) step(state, 0, t, sc, ev);
    expect(of(ev, 'enemyDisperse').every((e) => e.quiet)).toBe(true);
    expect(enemy(s, 'h').gone).toBe(true);
    expect(enemy(s, 'b').mode).toBe('sleep');
  });

  it('kills pay in safety, not loot: a lamp-room creature spills nothing', () => {
    const s = newSim(
      room([{ id: 'b', kind: 'burrback', x: 1200, y: FLOOR, facing: 1, hp: 1 }], [wick('w', 1200, 600)]),
    );
    s.place(1140, FLOOR);
    s.state.player.facing = 1;
    const ev = s.run('A1 .80');
    expect(types(ev)).toContain('enemyDie');
    expect(of(ev, 'enemyDie')[0]?.value).toBe(0);
    expect(types(ev)).not.toContain('pickup');
    expect(s.state.pickups.count).toBe(0);
  });
});

describe('the hawker', () => {
  // Wick `light` lights the floor under its home; it guards `far`, out of the way.
  const scene = () =>
    room(
      [{ id: 'h', kind: 'hawker', x: 2000, y: 460, facing: 1, guards: 'far' }],
      [wick('light', 2000, 560), wick('far', 3700, 200)],
    );

  it('tells for curiousFrames (harmless at first), then a committed dive at where she stood', () => {
    const s = newSim(scene());
    s.place(2050, FLOOR);
    const ev = s.run('.120');
    const notice = ev.findIndex((e) => e.type === 'enemyNotice');
    const dive = ev.findIndex((e) => e.type === 'enemyDive');
    expect(notice).toBeGreaterThanOrEqual(0);
    expect(of(ev, 'enemyNotice')[0]?.frames).toBe(T.hawker.curiousFrames);
    expect(dive).toBeGreaterThan(notice);
  });

  it('its dive does not stop for the dark; it gives up at the bottom if she is dark then', () => {
    const s = newSim(scene());
    s.place(2050, FLOOR);
    let ev: SimEvent[] = [];
    for (let i = 0; i < 200 && !types(ev).includes('enemyDive'); i++) ev = s.run('.1');
    expect(enemy(s, 'h').mode).toBe('dive');
    snuff(s, 0);
    // Out of its way, in the dark.
    s.place(1400, FLOOR);
    const after = s.run('.120');
    const giveUp = of(after, 'enemyGiveUp')[0];
    expect(types(after)).toContain('enemyStall');
    expect(giveUp?.cause).toBe('dark');
    expect(after.findIndex((e) => e.type === 'enemyStall')).toBeLessThan(
      after.findIndex((e) => e.type === 'enemyGiveUp'),
    );
  });
});

describe('the old burrback', () => {
  const pit = (x = 2000) => room([{ id: 'o', kind: 'oldBurrback', x, y: FLOOR, facing: -1 }]);

  it('sleeps until she is down on its ground, then wakes harmless for wakeFrames', () => {
    const s = newSim(pit());
    expect(enemy(s, 'o').mode).toBe('sleep');
    // Dropped right onto it from above: nothing on the way down, nothing during the wake.
    s.place(2000, FLOOR - 300);
    const ev = s.run(`.${T.oldBurrback.wakeFrames + 20}`);
    expect(of(ev, 'enemyWake')[0]?.frames).toBe(T.oldBurrback.wakeFrames);
    const wake = ev.findIndex((e) => e.type === 'enemyWake');
    const hurt = ev.findIndex((e) => e.type === 'hurt');
    expect(hurt === -1 || hurt - wake >= T.oldBurrback.wakeFrames).toBe(true);
  });

  it('feints: brace, the shell drops, the real brace, then a ram of chargePx', () => {
    const s = newSim(pit());
    const o = enemy(s, 'o');
    o.mode = 'walk';
    s.place(o.x - 120, FLOOR);
    const frameOf: Record<string, number> = {};
    for (let f = 0; f < 200; f++) {
      for (const e of s.run('.1')) {
        if (e.type === 'enemyWindup' && frameOf.w1 === undefined) frameOf.w1 = f;
        else if (e.type === 'enemyWindup') frameOf.w2 ??= f;
        if (e.type === 'enemyFeint') frameOf.feint ??= f;
        if (e.type === 'enemyCharge') {
          frameOf.charge ??= f;
          expect(e.px).toBe(T.oldBurrback.chargePx);
        }
      }
    }
    const O = T.oldBurrback;
    const { w1 = -1, feint = -1, w2 = -1, charge = -1 } = frameOf;
    expect(feint - w1).toBe(O.windupFrames);
    expect(w2 - feint).toBe(O.feintFrames);
    expect(charge - w2).toBe(O.feintBraceFrames);
  });

  it('braced, a forward cut clangs even from behind; a pogo lands without breaking the brace; a second pogo in the same brace glances', () => {
    const s = newSim(pit());
    const o = enemy(s, 'o');
    o.mode = 'walk';
    s.place(o.x - 120, FLOOR);
    let ev: SimEvent[] = [];
    for (let i = 0; i < 60 && !types(ev).includes('enemyWindup'); i++) ev = s.run('.1');
    expect(o.braced).toBe(true);
    // Behind it: a forward cut clangs.
    s.place(o.x + o.w + 30, FLOOR);
    s.state.player.facing = -1;
    const clang = s.run('A1 .1');
    expect(of(clang, 'enemyBlock')[0]?.slash).toBe('fwd');
    expect(types(clang)).not.toContain('enemyHit');
    // A pogo from above: it lands (1 hp), the brace holds.
    s.place(o.x + o.w / 2, o.y - 30);
    const pogo = s.run('D+A1 .3');
    expect(of(pogo, 'enemyHit')[0]).toMatchObject({ slash: 'down', hpLeft: T.oldBurrback.hp - 1 });
    expect(['windup', 'feint', 'charge']).toContain(o.mode);
    // Again in the same brace: it glances (she still bounces).
    s.place(o.x + o.w / 2, o.y - 30);
    s.state.player.attackCd = 0;
    const again = s.run('D+A1 .3');
    expect(o.braced).toBe(true);
    expect(of(again, 'enemyBlock')[0]?.slash).toBe('down');
    expect(o.hp).toBe(T.oldBurrback.hp - 1);
  });

  it('walking, its shell glances everything; a ram into a wall stuns it open and cuts land', () => {
    // Near the west wall of the room: it rams west into it.
    const s = newSim(pit(250));
    const o = enemy(s, 'o');
    o.mode = 'walk';
    o.facing = 1;
    s.place(o.x + o.w + 30, FLOOR);
    s.state.player.facing = -1;
    const glance = s.run('A1 .1');
    expect(types(glance)).toContain('enemyBlock');
    // Stand west of it, then step out of the ram's way.
    s.place(o.x - 100, FLOOR);
    let ev: SimEvent[] = [];
    for (let i = 0; i < 120 && !types(ev).includes('enemyCharge'); i++) ev = s.run('.1');
    // Jump over the ram.
    const ram = s.run('R+J14 R10');
    for (let i = 0; i < 80 && !types(ram).includes('enemyRecover'); i++) ram.push(...s.run('.1'));
    const rec = of(ram, 'enemyRecover')[0];
    expect(rec?.cause).toBe('wall');
    expect(rec?.frames).toBe(T.oldBurrback.recoverWallFrames);
    expect(o.stunned).toBe(true);
    s.place(o.x + o.w + 30, FLOOR);
    s.state.player.facing = -1;
    expect(types(s.run('A1 .2'))).toContain('enemyHit');
  });
});

describe('grabs: the orb web and its weaver', () => {
  // A small web on a canopy block: a spine from the canopy (anchored) to the floor (anchored), a
  // side branch at mid height out to a second post. The weaver sits at the top.
  const strands: Array<[number, number, number, number]> = [
    [2000, 300, 2000, 550],
    [2000, 550, 2000, 800],
    [2000, 550, 2300, 550],
    [2300, 550, 2300, 800],
  ];
  const scene = (guard?: string) =>
    room(
      [
        { id: 'web', kind: 'web', x: 2000, y: 550, facing: 1, strands, guards: guard },
        { id: 'wv', kind: 'weaver', x: 2000, y: 300, facing: 1, web: 'web', guards: guard },
      ],
      [wick('w', 2150, 450)],
      {
        solids: [
          { tag: 'ground', x: 0, y: FLOOR, w: 4000, h: 200 },
          { tag: 'trunk', x: 1800, y: 200, w: 600, h: 100 },
        ],
      },
    );

  it('touching a strand is Caught: held where she is until she beats free (grab.beats presses), then thrown with grace', () => {
    const s = newSim(scene());
    s.place(1900, FLOOR);
    const touch = s.run('R20');
    expect(types(touch)).toContain('webTouch');
    expect(types(touch)).toContain('grab');
    const p = s.state.player;
    expect(p.grab).toBe(0);
    const x0 = p.x;
    s.run('R10');
    expect(p.x).toBe(x0);
    const free = s.run('J1 .6 J1 .6 J1 .6 J1 .6');
    expect(of(free, 'grabBeat').length).toBe(T.grab.beats);
    expect(of(free, 'grabFree')[0]).toMatchObject({ how: 'beat', grace: T.grab.graceFrames });
    expect(p.grab).toBe(-1);
  });

  it('the weaver runs to her touch, counts, and bites only if she is still held', () => {
    const s = newSim(scene());
    s.place(1900, FLOOR);
    const ev = s.run('R20 .200');
    const run = of(ev, 'enemyRun')[0];
    expect(run).toBeDefined();
    expect(of(ev, 'enemyWindup')[0]?.frames).toBe(T.weaver.countFrames);
    expect(types(ev)).toContain('enemyBite');
    const hurt = of(ev, 'hurt')[0];
    expect(hurt?.source).toEqual({ kind: 'weaver', id: 'wv' });
    expect(s.state.player.grab).toBe(-1);
  });

  it('fair: caught right where the weaver sits, a player who mashes at once is never bitten', () => {
    for (const y of [380, 450, 550, 650, 760]) {
      const s = newSim(scene());
      // The weaver sits at (2000, 300): put it right beside her touch.
      const wv = enemy(s, 'wv');
      wv.seg = 1;
      wv.segT = Math.max(0, Math.min(1, (y - 550) / 250));
      if (y < 550) {
        wv.seg = 0;
        wv.segT = (y - 300) / 250;
      }
      s.place(1978, y + 40);
      const ev = s.run('R2 J1 .5 J1 .5 J1 .5 J1 .5 J1 .60');
      expect(types(ev)).toContain('grab');
      expect(types(ev)).not.toContain('hurt');
    }
  });

  it('it senses touches, not cuts: a strand cut from outside falls, the weaver stays home; loose strands fall too', () => {
    const s = newSim(scene());
    // Cut the post at 2300 from the floor beside it.
    s.place(2360, FLOOR);
    s.state.player.facing = -1;
    const ev = s.run('A1 .30');
    const cut = of(ev, 'webCut')[0];
    expect(cut?.cut).toBeGreaterThan(0);
    expect(types(ev)).not.toContain('enemyRun');
    expect(enemy(s, 'wv').mode).toBe('sit');
    const web = enemy(s, 'web');
    expect(web.cut[3]).toBe('1');
    // The spine's top already hangs cut; now its lower half: the side branch is joined to nothing anchored.
    web.cut = `1${web.cut.slice(1)}`;
    s.place(1940, FLOOR);
    s.state.player.facing = 1;
    s.state.player.grabGrace = 0;
    const ev2 = s.run('A1 .5');
    expect(of(ev2, 'webCut')[0]?.fell).toBeGreaterThan(0);
    expect(web.cut[2]).toBe('2');
  });

  it('snuffed, the web goes slack (holds nothing, lets go) and the weaver climbs away', () => {
    const s = newSim(scene('w'));
    s.place(1900, FLOOR);
    s.run('R20');
    expect(s.state.player.grab).toBe(0);
    snuff(s, 0);
    const ev = s.run('.3');
    expect(
      of(ev, 'enemyDisperse')
        .map((e) => e.how)
        .sort(),
    ).toEqual(['leave', 'slack']);
    expect(of(ev, 'grabFree')[0]?.how).toBe('gone');
    s.run('.60');
    expect(types(s.run('R30'))).not.toContain('grab');
  });

  it('a blow (thorns, a creature) knocks her out of a grab', () => {
    const s = newSim(scene());
    s.place(1900, FLOOR);
    s.run('R20');
    expect(s.state.player.grab).toBe(0);
    const ev = s.run('.200');
    expect(types(ev)).toContain('hurt');
    expect(of(ev, 'grabFree')[0]?.how).toBe('hurt');
  });
});

describe('fairness: every attack is told, with time to answer', () => {
  it('telegraphs are at least 20 frames, and the weaver count outlasts the fastest beat-free', () => {
    expect(T.burrback.windupFrames).toBeGreaterThanOrEqual(20);
    expect(T.oldBurrback.windupFrames).toBeGreaterThanOrEqual(20);
    expect(T.oldBurrback.feintBraceFrames).toBeGreaterThanOrEqual(20);
    expect(T.hawker.curiousFrames).toBeGreaterThanOrEqual(30);
    expect(T.hawker.noticeSafeFrames).toBeGreaterThanOrEqual(20);
    // Fastest escape: the first beat on the catch frame, then one every beatCd.
    const fastest = (T.grab.beats - 1) * T.lures.beatCd + 1;
    expect(T.weaver.countFrames).toBeGreaterThan(fastest);
  });

  it('the lab room parses: every creature placed, the orb web expanded into strands', () => {
    const r = getRoom('lab-creatures');
    const kinds = (r.enemies ?? []).map((e) => e.kind);
    for (const k of ['burrback', 'hawker', 'web', 'weaver', 'oldBurrback']) expect(kinds).toContain(k);
    const web = r.enemies?.find((e) => e.kind === 'web');
    expect((web?.strands ?? []).length).toBeGreaterThan(40);
  });
});
