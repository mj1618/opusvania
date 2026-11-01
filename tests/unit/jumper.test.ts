/**
 * The jumping spider (`kind: 'jumper'`, src/sim/enemies/jumper.ts, memory/enemies.md "The jumper"): the tell, the
 * pounce that always lands on ground, the punish on a miss, the hop back from a cut on the ground, the knock-down
 * from a cut in the air, the distance it keeps, its death throw, and the re-hit gap.
 */
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/events';
import { solidAt } from '../../src/sim/physics/aabb';
import type { EnemySpawn, Lure, Scene } from '../../src/sim/scene';
import type { EnemyState } from '../../src/sim/state';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';
import { newSim, type Sim } from './helpers';

const FLOOR = 800;
const T = defaultTuning;
const J = T.jumper;

/** A flat lamp room, a wick over the fight (she is lit) unless `dark`. */
function room(enemies: EnemySpawn[], extra: Partial<Scene> = {}, dark = false): Scene {
  const lures: Lure[] = dark ? [] : [{ id: 'w', kind: 'wick', x: 1850, y: 560 }];
  return {
    id: 'test',
    width: 4000,
    height: 1000,
    spawn: { x: 200, y: FLOOR },
    senses: 'lamp',
    solids: extra.solids ?? [{ tag: 'ground', x: 0, y: FLOOR, w: 4000, h: 200 }],
    oneWays: [],
    lures,
    enemies,
    ...extra,
  } as Scene;
}

const spider = (x = 2000, y = FLOOR): EnemySpawn => ({ id: 'j', kind: 'jumper', x, y, facing: -1 });
const of = <K extends SimEvent['type']>(ev: SimEvent[], type: K) =>
  ev.filter((e) => e.type === type) as Extract<SimEvent, { type: K }>[];
const jumperOf = (s: Sim): EnemyState => s.state.enemies[0] as EnemyState;
const cx = (s: Sim) => s.state.player.x + s.state.player.w / 2;
const ecx = (e: EnemyState) => e.x + e.w / 2;

/** Steps one frame at a time (input from `pick`) until `until` holds, at most `max`. Returns all events. */
function drive(
  s: Sim,
  max: number,
  pick: (f: number) => string,
  until: (ev: SimEvent[]) => boolean,
): SimEvent[] {
  const all: SimEvent[] = [];
  for (let f = 0; f < max; f++) {
    const ev = s.run(`${pick(f)}1`);
    all.push(...ev);
    if (until(ev)) break;
  }
  return all;
}

/** Its box stands on ground: a top under it, no solid in it. */
function onGround(s: Sim, e: EnemyState): boolean {
  const sc = s.scene;
  const feet = e.y + e.h;
  const top = (x: number) =>
    solidAt(sc, x, feet, 1, 1) || sc.oneWays.some((o) => o.y === feet && x >= o.x && x < o.x + o.w);
  return !solidAt(sc, e.x, e.y, e.w, e.h) && top(e.x + 1) && top(e.x + e.w - 2) && feet < sc.height;
}

describe('the jumping spider', () => {
  it('in the dark it never notices her and its touch does nothing', () => {
    const s = newSim(room([spider()], {}, true));
    s.place(1800, FLOOR);
    const ev = s.run('.200 R40 .60');
    expect(of(ev, 'enemyNotice')).toHaveLength(0);
    expect(of(ev, 'enemyWindup')).toHaveLength(0);
    expect(of(ev, 'hurt')).toHaveLength(0);
  });

  it('lit, it locks on, then tells for exactly windupFrames before the pounce', () => {
    const s = newSim(room([spider()]));
    s.place(1740, FLOOR);
    const ev: Array<{ f: number; e: SimEvent }> = [];
    for (let f = 0; f < 200; f++) for (const e of s.run('.1')) ev.push({ f, e });
    const notice = ev.find((q) => q.e.type === 'enemyNotice');
    const tell = ev.find((q) => q.e.type === 'enemyWindup');
    const leap = ev.find((q) => q.e.type === 'enemyCharge');
    expect(notice?.e).toMatchObject({ frames: J.noticeFrames });
    expect(tell?.e).toMatchObject({ frames: J.windupFrames });
    // (Its eyes lock on first: the first tell is no sooner than the notice's beat.)
    expect((tell?.f ?? 0) - (notice?.f ?? 0)).toBeGreaterThanOrEqual(J.noticeFrames);
    expect((leap?.f ?? 0) - (tell?.f ?? 0)).toBe(J.windupFrames);
    expect(J.windupFrames).toBeGreaterThanOrEqual(24);
    expect(J.windupFrames).toBeLessThanOrEqual(30);
  });

  it('leaps up onto the ledge she stands on, and lands on its top', () => {
    const solids: Scene['solids'] = [
      { tag: 'ground', x: 0, y: FLOOR, w: 4000, h: 200 },
      { tag: 'ground', x: 1500, y: 620, w: 260, h: 40 },
    ];
    const s = newSim(room([spider(1980)], { solids }));
    s.place(1660, 620);
    const ev = drive(
      s,
      400,
      () => '.',
      (e) => e.some((q) => q.type === 'enemyLand'),
    );
    const land = of(ev, 'enemyLand')[0];
    expect(land).toMatchObject({ cause: 'pounce', y: 620 });
    expect(onGround(s, jumperOf(s))).toBe(true);
  });

  it('never lands down a pit: every pounce at a hopper over the gap comes down on ground', () => {
    // Floor | pit (a catch zone) | floor. She hops back and forth over the gap's west lip.
    const solids: Scene['solids'] = [
      { tag: 'ground', x: 0, y: FLOOR, w: 1700, h: 200 },
      { tag: 'ground', x: 1900, y: FLOOR, w: 2100, h: 200 },
    ];
    const s = newSim(
      room([spider(2160)], { solids, catches: [{ id: 'pit', x: 1700, y: 900, w: 200, h: 100 }] }),
    );
    s.place(1600, FLOOR);
    let lands = 0;
    for (let f = 0; f < 2400; f++) {
      s.state.player.hp = 4;
      const ph = f % 160;
      const ev = s.run(
        ph < 20 ? 'R+J1' : ph < 40 ? 'R1' : ph < 80 ? '.1' : ph < 100 ? 'L+J1' : ph < 120 ? 'L1' : '.1',
      );
      for (const q of of(ev, 'enemyLand')) {
        lands++;
        const e = jumperOf(s);
        expect(e.x + e.w <= 1700 || e.x >= 1900, `${q.cause} at ${q.x}`).toBe(true);
        expect(onGround(s, e), `${q.cause} at ${q.x}, ${e.y + e.h}`).toBe(true);
      }
      expect(jumperOf(s).gone).toBe(false);
    }
    expect(lands).toBeGreaterThanOrEqual(2);
  });

  it('a missed pounce leaves it open on landing, harmless, and the punish lands', () => {
    const s = newSim(room([spider()]));
    s.place(1740, FLOOR);
    // Wait for the leap, then step aside (away from it) out of the arc.
    drive(
      s,
      300,
      () => '.',
      (e) => e.some((q) => q.type === 'enemyCharge'),
    );
    const ev = drive(
      s,
      80,
      (f) => (f < 16 ? 'L' : '.'),
      (e) => e.some((q) => q.type === 'enemyLand'),
    );
    const land = of(ev, 'enemyLand')[0];
    expect(land).toMatchObject({ cause: 'pounce', hit: false, frames: J.recoverFrames });
    expect(of(ev, 'hurt')).toHaveLength(0);
    const e = jumperOf(s);
    expect(e.mode).toBe('recover');
    // Run in and cut it while it lies open.
    const punish = drive(
      s,
      J.recoverFrames,
      (f) => {
        const d = ecx(e) - cx(s);
        s.state.player.facing = d < 0 ? -1 : 1;
        if (Math.abs(d) > 70) return d < 0 ? 'L' : 'R';
        return f % 14 === 0 ? 'A' : '.';
      },
      () => e.mode !== 'recover' && e.mode !== 'hurt',
    );
    expect(of(punish, 'enemyHit').length).toBeGreaterThanOrEqual(1);
    expect(of(punish, 'hurt')).toHaveLength(0);
  });

  it('cut on the ground it flinches and hops back out of reach', () => {
    const t: Tuning = cloneTuning(defaultTuning);
    const s = newSim(room([spider()]), t);
    s.place(1740, FLOOR);
    s.run('.20');
    const e = jumperOf(s);
    expect(e.mode === 'hunt' || e.mode === 'skitter').toBe(true);
    // In reach, facing it, before it is ready: one cut.
    e.strikeCd = 200;
    e.alertCd = 200;
    s.place(ecx(e) - 60, FLOOR);
    s.state.player.facing = 1;
    const ev = drive(
      s,
      60,
      (f) => (f === 0 ? 'A' : '.'),
      (q) => q.some((x) => x.type === 'enemyHop'),
    );
    expect(of(ev, 'enemyHit')).toHaveLength(1);
    const hop = of(ev, 'enemyHop')[0];
    expect(hop).toMatchObject({ why: 'back', dir: 1 });
    expect(e.mode).toBe('back');
    s.run(`.${J.backFrames + 2}`);
    expect(Math.abs(ecx(e) - cx(s))).toBeGreaterThan(150);
    expect(onGround(s, e)).toBe(true);
  });

  it('cornered against a wall, the hop goes over her instead', () => {
    const solids: Scene['solids'] = [
      { tag: 'ground', x: 0, y: FLOOR, w: 4000, h: 200 },
      { tag: 'ground', x: 2040, y: 0, w: 200, h: 800 },
    ];
    const s = newSim(room([spider(2010)], { solids }));
    s.place(1700, FLOOR);
    s.run('.20');
    const e = jumperOf(s);
    e.strikeCd = 200;
    e.alertCd = 200;
    // (Its back to the wall.)
    s.run(`.${J.hopFrames + J.hopGapFrames + 2}`);
    e.x = 2040 - e.w - 4;
    s.place(ecx(e) - 60, FLOOR);
    s.state.player.facing = 1;
    const ev = drive(
      s,
      60,
      (f) => (f === 0 ? 'A' : '.'),
      (q) => q.some((x) => x.type === 'enemyHop'),
    );
    expect(of(ev, 'enemyHop')[0]).toMatchObject({ why: 'over', dir: -1 });
    const after = s.run(`.${J.overFrames + 2}`);
    expect(of(after, 'hurt')).toHaveLength(0);
    expect(ecx(e)).toBeLessThan(cx(s));
  });

  it('cut out of the air, it is knocked down and lies open (stunned)', () => {
    const s = newSim(room([spider()]));
    s.place(1740, FLOOR);
    s.state.player.facing = 1;
    drive(
      s,
      300,
      () => '.',
      (e) => e.some((q) => q.type === 'enemyCharge'),
    );
    const e = jumperOf(s);
    let swung = false;
    const ev = drive(
      s,
      120,
      () => {
        if (!swung && e.mode === 'charge' && ecx(e) - cx(s) < 120) {
          swung = true;
          return 'A';
        }
        return '.';
      },
      (q) => q.some((x) => x.type === 'enemyLand'),
    );
    expect(of(ev, 'enemyHit')).toHaveLength(1);
    expect(of(ev, 'hurt')).toHaveLength(0);
    expect(of(ev, 'enemyLand')[0]).toMatchObject({ cause: 'fall', frames: J.stunFrames });
    expect(e.mode).toBe('recover');
    expect(e.stunned).toBe(true);
  });

  it('keeps its distance in step-hops when it is not ready to pounce', () => {
    const t: Tuning = cloneTuning(defaultTuning);
    t.jumper.pounceMaxPx = 0;
    t.jumper.rushPx = 0;
    const s = newSim(room([spider()]), t);
    s.place(1880, FLOOR);
    const ev = s.run('.150');
    expect(of(ev, 'enemyHop').filter((h) => h.why === 'step').length).toBeGreaterThan(1);
    const d = Math.abs(ecx(jumperOf(s)) - cx(s));
    expect(d).toBeGreaterThanOrEqual(J.keepMinPx);
    expect(d).toBeLessThanOrEqual(J.keepMaxPx + J.hopPx);
  });

  it('dies thrown along the blow, comes down on the ground and lies there, then is gone', () => {
    const s = newSim(room([spider()]));
    s.place(1740, FLOOR);
    s.run('.40');
    const e = jumperOf(s);
    e.hp = 1;
    e.strikeCd = 200;
    e.alertCd = 200;
    s.place(ecx(e) - 60, FLOOR);
    s.state.player.facing = 1;
    const x0 = ecx(e);
    const ev = s.run('A1 .30');
    expect(of(ev, 'enemyDie')).toHaveLength(1);
    expect(e.mode).toBe('dead');
    expect(ecx(e)).toBeGreaterThan(x0 + 30);
    expect(e.landed).toBe(true);
    expect(onGround(s, e)).toBe(true);
    s.run(`.${J.deadFrames}`);
    expect(e.gone).toBe(true);
  });

  it('fair: no attack hurts her within invuln + the re-hit gap of the last one, and each is told first', () => {
    for (const style of ['stand', 'masher', 'walker'] as const) {
      const s = newSim(room([spider()]));
      s.place(1740, FLOOR);
      let lastHurt = -1e9;
      let lastTell = -1e9;
      let hurts = 0;
      for (let f = 0; f < 3000; f++) {
        s.state.player.hp = 4;
        const e = jumperOf(s);
        if (e.mode === 'dead' || e.gone) break;
        // (Kept alive: the fight goes on.)
        e.hp = 3;
        const d = ecx(e) - cx(s);
        let input = '.';
        if (style === 'masher') {
          s.state.player.facing = d < 0 ? -1 : 1;
          input = Math.abs(d) > 60 ? (d < 0 ? 'L' : 'R') : f % 10 === 0 ? 'A' : '.';
        } else if (style === 'walker') input = f % 300 < 150 ? 'L' : 'R';
        const ev = s.run(`${input}1`);
        if (ev.some((q) => q.type === 'enemyWindup')) lastTell = f;
        if (ev.some((q) => q.type === 'hurt')) {
          hurts++;
          expect(f - lastHurt).toBeGreaterThanOrEqual(T.health.invulnFrames + J.rehitGapFrames);
          // (Hurt by a pounce or its touch: either way it told within the last pounce's reach of time.)
          lastHurt = f;
        }
      }
      expect(hurts, style).toBeGreaterThan(0);
      expect(lastTell).toBeGreaterThan(0);
    }
  });
});
