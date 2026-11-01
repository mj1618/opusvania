/**
 * The huntsman (src/sim/enemies/huntsman.ts, memory/enemies.md "The huntsman"): a wall runner. It keeps to its face,
 * tells for a fixed count, lunges across the gap, clings to the wall it reaches or drops and lies open, and a wall-jump
 * climb past it is fair: one who holds still when it tells is never hit, one who climbs on blindly sometimes is.
 */
import { describe, expect, it } from 'vitest';
import { route, snapOf } from '../../src/audio/router';
import type { SimEvent } from '../../src/sim/events';
import { createState, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { EnemySpawn, Lure, OneWay, Scene } from '../../src/sim/scene';
import type { EnemyState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { newSim, type Sim } from './helpers';

const T = defaultTuning;
const H = T.huntsman;
const FLOOR = 1600;
/** The chimney: the west face at x 1000, the east face at 1384 (a 384 px chimney, the Canopy's), floor 1600. */
const WEST = 1000;
const EAST = 1384;

function chimney(enemies: EnemySpawn[], extra: Partial<Scene> = {}): Scene {
  return {
    id: 'test',
    width: 2600,
    height: 1800,
    spawn: { x: 300, y: FLOOR },
    senses: 'lamp',
    solids: [
      { tag: 'ground', x: 0, y: FLOOR, w: 2600, h: 200 },
      { tag: 'trunk', x: 600, y: 300, w: WEST - 600, h: 1300 },
      { tag: 'trunk', x: EAST, y: 300, w: 400, h: 1300 },
    ],
    oneWays: [],
    enemies,
    ...extra,
  } as Scene;
}

const spider = (more: Partial<EnemySpawn> = {}): EnemySpawn =>
  ({
    id: 'h',
    kind: 'huntsman',
    x: WEST,
    y: 1000,
    facing: 1,
    radius: 200,
    senses: 'always',
    ...more,
  }) as EnemySpawn;

/** A root ledge at the east face for her to stand on, level with the spider's home. */
const LEDGE: OneWay = { tag: 'branch', x: 1250, y: 1100, w: EAST - 1250 };

const of = <K extends SimEvent['type']>(ev: SimEvent[], type: K) =>
  ev.filter((e) => e.type === type) as Extract<SimEvent, { type: K }>[];
const hunter = (s: Sim): EnemyState => s.state.enemies[0] as EnemyState;

describe('the huntsman', () => {
  it('keeps to its face: flush on the wall, inside its stretch, bursts and pauses', () => {
    const s = newSim(chimney([spider()]));
    s.place(300, FLOOR);
    const ys: number[] = [];
    let runs = 0;
    for (let k = 0; k < 900; k++) {
      runs += of(s.run('.1'), 'enemyRun').length;
      const e = hunter(s);
      expect(e.x).toBe(WEST);
      expect(e.side).toBe(-1);
      ys.push(e.y + e.h / 2);
    }
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(1000 - 200);
    expect(Math.max(...ys)).toBeLessThanOrEqual(1000 + 200);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(100);
    expect(runs).toBeGreaterThan(5);
  });

  it('its stretch ends where its face does (a lip, the end of the wall)', () => {
    // A face from 900 to 1300 only (the rest of the west wall is set back).
    const s = newSim(
      chimney([spider({ y: 1100, radius: 600 })], {
        solids: [
          { tag: 'ground', x: 0, y: FLOOR, w: 2600, h: 200 },
          { tag: 'trunk', x: 600, y: 900, w: WEST - 600, h: 400 },
          { tag: 'trunk', x: EAST, y: 300, w: 400, h: 1300 },
        ],
      }),
    );
    const e = hunter(s);
    // (Its legs hold a few px past the box's ends: the probes are 6 px in.)
    expect(e.fromY - e.h / 2).toBeGreaterThanOrEqual(900 - 6);
    expect(e.fromY + e.span + e.h / 2).toBeLessThanOrEqual(1300 + 6);
    expect(e.span).toBeLessThan(400);
  });

  it('level with it and in reach, it tells for its fixed count, then lunges; only the lunge hurts', () => {
    const s = newSim(chimney([spider()], { oneWays: [LEDGE] }));
    s.place(1300, LEDGE.y);
    const ev = s.run('.80');
    const w = of(ev, 'enemyWindup')[0];
    expect(w?.frames).toBe(H.tellFrames);
    expect(H.tellFrames).toBeGreaterThanOrEqual(22);
    expect(H.tellFrames).toBeLessThanOrEqual(28);
    const at = (type: string) => ev.findIndex((q) => q.type === type);
    expect(at('enemyCharge')).toBeGreaterThan(at('enemyWindup'));
    expect(at('hurt')).toBeGreaterThan(at('enemyCharge'));
    // The count, in frames: replay and watch the mode.
    const r = newSim(chimney([spider()], { oneWays: [LEDGE] }));
    r.place(1300, LEDGE.y);
    let tellAt = -1;
    let lungeAt = -1;
    for (let k = 0; k < 80; k++) {
      const e2 = r.run('.1');
      if (tellAt < 0 && of(e2, 'enemyWindup').length) tellAt = k;
      if (lungeAt < 0 && of(e2, 'enemyCharge').length) lungeAt = k;
      if (lungeAt < 0) expect(of(e2, 'hurt')).toEqual([]);
    }
    expect(lungeAt - tellAt).toBe(H.tellFrames);
    expect(of(ev, 'hurt')[0]?.source).toEqual({ kind: 'huntsman', id: 'h' });
  });

  it('its lunge clings to the wall it reaches: that face is its home now', () => {
    const s = newSim(chimney([spider()], { oneWays: [LEDGE] }));
    s.place(1300, LEDGE.y);
    s.run(`.${H.tellFrames - 4}`);
    expect(hunter(s).mode).toBe('windup');
    // She drops off the ledge out of its line; it springs across anyway.
    s.place(1300, FLOOR);
    const ev = s.run('.60');
    expect(of(ev, 'enemyStall')[0]?.cause).toBe('wall');
    const e = hunter(s);
    expect(e.side).toBe(1);
    expect(e.x + e.w).toBe(EAST);
    expect(e.facing).toBe(-1);
    expect(['perch', 'pause', 'skitter']).toContain(e.mode);
  });

  it('with no wall in reach it drops, lands on its back and lies open: harmless, three cuts kill it', () => {
    // A wide hall: the east face is far out of the lunge's flight.
    const s = newSim(
      chimney([spider()], {
        solids: [
          { tag: 'ground', x: 0, y: FLOOR, w: 2600, h: 200 },
          { tag: 'trunk', x: 600, y: 300, w: WEST - 600, h: 1300 },
        ],
        oneWays: [{ tag: 'branch', x: 1250, y: 1100, w: 200 }],
      }),
    );
    s.place(1300, 1100);
    s.run(`.${H.tellFrames - 4}`);
    s.place(1700, FLOOR);
    let rec: Extract<SimEvent, { type: 'enemyRecover' }> | undefined;
    for (let k = 0; k < 120 && !rec; k++) rec = of(s.run('.1'), 'enemyRecover')[0];
    expect(rec?.cause).toBe('spent');
    const e = hunter(s);
    expect(e.mode).toBe('recover');
    expect(e.y + e.h).toBe(FLOOR);
    // Its touch does nothing while it lies there.
    s.place(e.x + e.w / 2, FLOOR);
    expect(of(s.run('.20'), 'hurt')).toEqual([]);
    // Three cuts (it is open the whole time).
    s.place(e.x - 30, FLOOR);
    s.state.player.facing = 1;
    const kill = s.run('A1 R8 .14 A1 R8 .14 A1 .30');
    expect(of(kill, 'enemyDie').length).toBe(1);
    expect(of(kill, 'hurt')).toEqual([]);
    // The body lies on its back on the floor until it is gone.
    s.run('.60');
    expect(hunter(s).landed).toBe(true);
    s.run(`.${H.deadFrames}`);
    expect(hunter(s).gone).toBe(true);
  });

  it('a cut that meets the lunge bats it out of the air: it falls and lies open', () => {
    const s = newSim(chimney([spider()], { oneWays: [LEDGE] }));
    s.place(1300, LEDGE.y);
    s.state.player.facing = -1;
    let met = false;
    for (let k = 0; k < 90 && !met; k++) {
      const e = hunter(s);
      const p = s.state.player;
      const gap = p.x - (e.x + e.w);
      const ev = s.run(e.mode === 'charge' && gap < 90 ? 'A1' : '.1');
      met = of(ev, 'slashHit').some((q) => q.target.kind === 'huntsman');
      expect(of(ev, 'hurt')).toEqual([]);
    }
    expect(met).toBe(true);
    const ev = s.run('.80');
    expect(of(ev, 'hurt')).toEqual([]);
    expect(of(ev, 'enemyRecover')[0]?.broken).toBe(true);
    expect(hunter(s).mode).toBe('recover');
  });

  it('hit on its face it scuttles away from her along it', () => {
    const s = newSim(chimney([spider({ y: 1000 })]));
    // Below it on its face, an up cut.
    const e = hunter(s);
    s.place(WEST + 22, FLOOR);
    s.state.player.y = e.y + e.h + 10;
    s.state.player.vy = 0;
    const y0 = e.y;
    const ev = s.run('U1 U+A1 U4 .30');
    expect(of(ev, 'enemyHit').length).toBe(1);
    expect(of(ev, 'enemyRun').length).toBeGreaterThan(0);
    expect(hunter(s).side).toBe(-1);
    expect(hunter(s).y).toBeLessThan(y0 - 40);
  });

  it('a lamp-room huntsman in the dark never tells', () => {
    const s = newSim(chimney([spider({ senses: undefined })], { oneWays: [LEDGE] }));
    s.place(1300, LEDGE.y);
    expect(of(s.run('.240'), 'enemyWindup')).toEqual([]);
    const lit = newSim(
      chimney([spider({ senses: undefined })], {
        oneWays: [LEDGE],
        lures: [{ id: 'w', kind: 'wick', x: 1200, y: 900 } as Lure],
      }),
    );
    lit.place(1300, LEDGE.y);
    expect(of(lit.run('.120'), 'enemyWindup').length).toBe(1);
  });

  it('re-hit gap: one who stands in its line is never hurt twice inside her safety + 10 frames', () => {
    const s = newSim(chimney([spider()], { oneWays: [LEDGE] }));
    s.place(1300, LEDGE.y);
    const hurts: number[] = [];
    for (let k = 0; k < 1200; k++) if (of(s.run('.1'), 'hurt').length) hurts.push(k);
    expect(hurts.length).toBeGreaterThan(1);
    for (let k = 1; k < hurts.length; k++)
      expect((hurts[k] as number) - (hurts[k - 1] as number)).toBeGreaterThanOrEqual(
        T.health.invulnFrames + H.rehitGapFrames,
      );
  });
});

/**
 * A wall-jump climb up the east face of the chimney (a person's plan: kick at every touch after `delay` frames),
 * past a huntsman on the west face. `wary`: when it tells she stops kicking and slides until its lunge is over.
 */
function climb(delay: number, wary: boolean, y = 900) {
  const t = cloneTuning(defaultTuning);
  const sc = chimney([spider({ y, radius: 220 })]);
  const s = createState(1, t, sc, [], ['wallJump'] as never);
  placePlayer(s, EAST - 60, FLOOR, t, sc, []);
  let touch = -1;
  let prev = 0;
  let hits = 0;
  let topped = false;
  for (let f = 0; f < 900 && !topped; f++) {
    const p = s.player;
    const e = s.enemies[0] as EnemyState;
    let m = ActionBit.right;
    if (f < 30) m = 0;
    else if (f < 52) m |= ActionBit.jump;
    else if (!p.grounded && (p.mode === 'wallSlide' || p.wallDir === 1)) {
      if (touch < 0) touch = f;
      const hold = wary && (e.mode === 'windup' || e.mode === 'charge');
      if (f - touch >= delay && !(prev & ActionBit.jump) && !hold) {
        m |= ActionBit.jump;
        touch = -1;
      }
    } else touch = -1;
    const ev: SimEvent[] = [];
    step(s, m, t, sc, ev);
    prev = m;
    hits += of(ev, 'hurt').length;
    topped = p.grounded && p.y + p.h <= 300;
  }
  return { hits, topped };
}

describe('the huntsman on a wall-jump climb (fairness, creatures.md rule 7)', () => {
  it('one who holds still on the wall when it tells is never hit, and still tops the climb', () => {
    for (const d of [0, 6, 10, 16]) {
      const r = climb(d, true);
      expect(r.hits, `delay ${d}`).toBe(0);
      expect(r.topped, `delay ${d}`).toBe(true);
    }
  });

  it('one who climbs on blindly gets through at every pace, at most one hit, and a relaxed one is caught', () => {
    let caught = 0;
    for (const d of [0, 6, 10, 16]) {
      const r = climb(d, false);
      expect(r.topped, `delay ${d}`).toBe(true);
      expect(r.hits, `delay ${d}`).toBeLessThanOrEqual(1);
      caught += r.hits;
    }
    // (It is a fight, not scenery: a blind climber pays some of the time.)
    expect(caught).toBeGreaterThan(0);
  });
});

describe('the huntsman, heard (src/audio/route-play.ts)', () => {
  it('a patter for each burst, a held breath on the tell, a thwip on the lunge', () => {
    const scene = chimney([spider()], { oneWays: [LEDGE] });
    const s = newSim(scene);
    s.place(1300, LEDGE.y);
    const heard = new Set<string>();
    for (let k = 0; k < 240; k++) {
      const ev = s.run('.1');
      const snap = snapOf(s.state, s.scene, s.tuning);
      ev.forEach((e, i) => {
        for (const c of route(e, i, snap, { scene, seed: 1 })) heard.add(c.sound);
      });
    }
    expect([...heard]).toEqual(expect.arrayContaining(['patter', 'huntTell', 'thwip']));
  });
});
