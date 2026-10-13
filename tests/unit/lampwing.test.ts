import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../src/input/script';
import { GROVE, LAMPWING_PRIZE_CLEAR, LAMPWING_SPAWN_CLEAR, parseScene } from '../../src/scene/index';
import { lampwingBlocked } from '../../src/sim/enemies/lampwing';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, hashState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { EnemySpawn, Scene, SolidRect } from '../../src/sim/scene';
import type { EnemyState } from '../../src/sim/state';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim } from './helpers';

/**
 * The lampwing, the first flyer (memory/enemies.md). Flat test scenes: floor top at y = 800, so
 * she stands with her body centre at y = 760.
 */
const H = defaultTuning.health;
const L = defaultTuning.lampwing;
const EN = defaultTuning.enemies;
const FLOOR = 800;
const lamp = (x: number, y: number, facing: -1 | 1 = 1, id = `l${x}`, radius?: number): EnemySpawn => ({
  id,
  kind: 'lampwing',
  x,
  y,
  facing,
  ...(radius === undefined ? {} : { radius }),
});
const burr = (x: number, facing: -1 | 1 = -1): EnemySpawn => ({
  id: `b${x}`,
  kind: 'burrback',
  x,
  y: FLOOR,
  facing,
});
const scene = (enemies: EnemySpawn[], extra: Partial<Pick<Scene, 'solids' | 'oneWays'>> = {}): Scene => ({
  ...flatScene(extra),
  enemies,
});
const foe = (s: Sim, i = 0) => s.state.enemies[i] as EnemyState;
const mid = (e: EnemyState) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });
const her = (s: Sim) => ({ x: s.state.player.x + 20, y: s.state.player.y + 40 });
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) =>
  ev.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const overlap = (s: Sim, e: EnemyState) => {
  const p = s.state.player;
  return p.x < e.x + e.w && e.x < p.x + p.w && p.y < e.y + e.h && e.y < p.y + p.h;
};
/** Runs a script one frame at a time, calling `each` after every step with that step's events. */
function frames(s: Sim, script: string, each: (ev: SimEvent[], f: number) => void): void {
  let f = 0;
  for (const m of parseInputScript(script)) {
    const from = s.events.length;
    step(s.state, m, s.tuning, s.scene, s.events);
    each(s.events.slice(from), f++);
  }
}
/** A lampwing that hangs where it is until something happens to it: no drift, no bob. */
function calm(over: Partial<Tuning['lampwing']> = {}): Tuning {
  const t = cloneTuning(defaultTuning);
  Object.assign(t.lampwing, { hoverSpeed: 0, bobSpeed: 0 }, over);
  return t;
}
/** As `calm`, and blind: it never notices her (a hit still provokes it). */
const blind = (over: Partial<Tuning['lampwing']> = {}) => calm({ noticePx: 0, ...over });
/** She stands on the floor facing a blind lampwing hanging at chest height at 2200, in reach of a cut. */
function duel(t = blind(), at = 2110): Sim {
  const s = newSim(scene([lamp(2200, 760)]), t);
  s.place(at, FLOOR);
  return s;
}
const inSolid = (sc: Scene, e: EnemyState) =>
  sc.solids.some((r) => e.x < r.x + r.w && r.x < e.x + e.w && e.y < r.y + r.h && r.y < e.y + e.h);

describe('lampwing: hovering', () => {
  const pillar: SolidRect = { tag: 'trunk', x: 2050, y: 430, w: 60, h: 200 };

  it('wanders inside its territory for a minute, never in a solid, on a path of its own (no RNG)', () => {
    const path = (id: string, facing: -1 | 1 = 1) => {
      const sc = scene([lamp(2000, 500, facing, id)], { solids: [pillar] });
      const s = newSim(sc);
      s.place(300, FLOOR);
      const rng0 = s.state.rng;
      const out: number[] = [];
      let far = 0;
      let fast = 0;
      const seen = new Set<string>();
      frames(s, '.3600', (ev) => {
        const e = foe(s);
        const c = mid(e);
        far = Math.max(far, Math.hypot(c.x - 2000, c.y - 500));
        fast = Math.max(fast, Math.hypot(e.vx, e.vy));
        expect(inSolid(sc, e)).toBe(false);
        expect(e.mode).toBe('hover');
        expect(ev.filter((x) => x.type.startsWith('enemy'))).toEqual([]);
        seen.add(`${e.targetX},${e.targetY}`);
        out.push(c.x, c.y);
      });
      // Inside its radius (wander points lie within 80% of it), slow, and it does get about.
      expect(far).toBeLessThanOrEqual(L.radius);
      expect(far).toBeGreaterThan(60);
      expect(fast).toBeLessThan(L.hoverSpeed + L.bobSpeed + 0.05);
      expect(seen.size).toBeGreaterThan(12);
      expect(s.state.rng).toBe(rng0);
      const e = foe(s);
      expect([e.homeX, e.homeY, e.radius, e.hp, e.hpMax, e.w, e.h]).toEqual([2000, 500, 120, 2, 2, 36, 30]);
      return out;
    };
    const a = path('a');
    expect(path('a')).toEqual(a);
    expect(path('another')).not.toEqual(a);
  });

  it('its wander is mirrored with its `facing`; the scene may give its own radius', () => {
    const run = (facing: -1 | 1, radius?: number) => {
      const s = newSim(scene([lamp(2000, 500, facing, 'm', radius)]));
      s.place(300, FLOOR);
      const out: number[][] = [];
      let far = 0;
      frames(s, '.1500', () => {
        const c = mid(foe(s));
        far = Math.max(far, Math.hypot(c.x - 2000, c.y - 500));
        out.push([c.x - 2000, c.y, foe(s).facing]);
      });
      return { out, far };
    };
    const a = run(1);
    expect(run(-1).out).toEqual(a.out.map(([x, y, f]) => [0 - (x as number), y, 0 - (f as number)]));
    const small = run(1, 40);
    expect(small.far).toBeLessThanOrEqual(40);
    expect(small.far).toBeGreaterThan(15);
  });

  it('the wing beat is the sim’s: `flap` runs 0..1, slow in a hover, quick in the tell, faster in pursuit', () => {
    const s = newSim(scene([lamp(2000, 600)]), calm());
    s.place(300, FLOOR);
    const rate = (n: number) => {
      let beats = 0;
      let last = foe(s).flap;
      frames(s, `.${n}`, () => {
        const f = foe(s).flap;
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThan(1);
        beats += f < last ? f + 1 - last : f - last;
        last = f;
      });
      return beats / n;
    };
    expect(rate(100)).toBeCloseTo(L.flapHover, 5);
    s.place(1850, FLOOR);
    expect(rate(30)).toBeCloseTo(L.flapCurious, 2);
    s.run('.40');
    expect(foe(s).mode).toBe('pursue');
    expect(rate(20)).toBeCloseTo(L.flapPursue, 2);
  });
});

describe('lampwing: noticing her', () => {
  it('needs her within 260 px AND in plain view; then a 30-frame tell (it turns to her and rises), then pursuit', () => {
    // Too far (340 px), for as long as she likes.
    let s = newSim(scene([lamp(2000, 600)]), calm());
    s.place(1700, FLOOR);
    expect(of(s.run('.200'), 'enemyNotice')).toEqual([]);
    expect(foe(s).mode).toBe('hover');

    // Near enough (219 px) but behind a wall: nothing. One-way branches do not hide her.
    const wall: SolidRect = { tag: 'trunk', x: 1900, y: 500, w: 40, h: 300 };
    s = newSim(scene([lamp(2000, 600)], { solids: [wall] }), calm());
    s.place(1850, FLOOR);
    expect(of(s.run('.200'), 'enemyNotice')).toEqual([]);
    s = newSim(scene([lamp(2000, 600)], { oneWays: [{ tag: 'branch', x: 1700, y: 680, w: 400 }] }), calm());
    s.place(1850, FLOOR);
    expect(of(s.run('.1'), 'enemyNotice').length).toBe(1);

    // In range, in view.
    s = newSim(scene([lamp(2000, 600)]), calm());
    s.place(1850, FLOOR);
    const modes: string[] = [];
    const ys: number[] = [];
    frames(s, '.40', (ev, f) => {
      const e = foe(s);
      modes.push(e.mode);
      ys.push(e.y);
      for (const n of of(ev, 'enemyNotice')) {
        expect(f).toBe(0);
        expect(n).toEqual({
          type: 'enemyNotice',
          id: 'l2000',
          kind: 'lampwing',
          x: 2000,
          y: 600,
          dir: -1,
          frames: 30,
        });
        expect([e.mode, e.timer, e.modeFrames, e.facing]).toEqual(['curious', 30, 0, -1]);
      }
      if (e.mode === 'curious') {
        // What it is drawn to: her body centre; `look` is the unit vector to it.
        expect([e.targetX, e.targetY]).toEqual([1850, 760]);
        expect(Math.hypot(e.lookX, e.lookY)).toBeCloseTo(1, 9);
        expect(e.lookX).toBeLessThan(0);
        expect(e.lookY).toBeGreaterThan(0);
      }
    });
    expect(modes.indexOf('curious')).toBe(0);
    expect(modes.indexOf('pursue')).toBe(L.curiousFrames);
    expect([L.noticePx, L.curiousFrames]).toEqual([260, 30]);
    // The tell: it lifts about 13 px before it comes.
    expect((ys[0] as number) - (ys[29] as number)).toBeGreaterThanOrEqual(10);
    expect((ys[0] as number) - (ys[29] as number)).toBeLessThanOrEqual(16);
  });

  it('does not notice her when she is faded, or beyond its leash from home', () => {
    const s = newSim(scene([lamp(2000, 600)]), calm({ leashPx: 150 }));
    s.place(1850, FLOOR);
    expect(of(s.run('.60'), 'enemyNotice')).toEqual([]);
  });
});

describe('lampwing: pursuit', () => {
  it('drifts after her at no more than 2.2 px/f, turning by no more than 0.075 px/f²', () => {
    const s = newSim(scene([lamp(2000, 600)]), calm());
    s.place(1850, FLOOR);
    s.state.player.invuln = 1e6;
    let top = 0;
    let turn = 0;
    let pv = { x: 0, y: 0 };
    let n = 0;
    // She runs back and forth under it, so it has to keep turning.
    frames(s, '.40 L14 R28 L28 R28 L28 R28 L14 .60', () => {
      const e = foe(s);
      if (e.mode === 'pursue' && e.modeFrames > 0) {
        top = Math.max(top, Math.hypot(e.vx, e.vy));
        turn = Math.max(turn, Math.hypot(e.vx - pv.x, e.vy - pv.y));
        n++;
      }
      pv = { x: e.vx, y: e.vy };
    });
    expect(n).toBeGreaterThan(200);
    expect(top).toBeLessThanOrEqual(L.pursueSpeed + 1e-9);
    expect(top).toBeGreaterThan(L.pursueSpeed - 0.01);
    expect(turn).toBeLessThanOrEqual(L.pursueAccel + 1e-9);
    expect([L.pursueSpeed, L.pursueAccel]).toEqual([2.2, 0.075]);
    expect(L.pursueSpeed).toBeLessThan(defaultTuning.run.maxSpeed / 4);
  });

  it('standing still she is reached in about two seconds; walking away she is never caught', () => {
    // 205 px away: the tell (30), then about 90 frames of drifting to her.
    let s = newSim(scene([lamp(2000, 620)]), calm());
    s.place(1850, FLOOR);
    let hurtAt = -1;
    frames(s, '.200', (ev, f) => {
      if (hurtAt < 0 && of(ev, 'hurt').length) hurtAt = f;
    });
    expect(hurtAt).toBeGreaterThan(105);
    expect(hurtAt).toBeLessThan(135);

    // The same, but she walks off as it starts toward her: the gap only grows.
    s = newSim(scene([lamp(2000, 620)]), calm());
    s.place(1850, FLOOR);
    s.run('.40');
    expect(foe(s).mode).toBe('pursue');
    let gap = Math.hypot(mid(foe(s)).x - her(s).x, mid(foe(s)).y - her(s).y);
    frames(s, 'L30', () => {
      const g = Math.hypot(mid(foe(s)).x - her(s).x, mid(foe(s)).y - her(s).y);
      expect(g).toBeGreaterThan(gap);
      gap = g;
    });
    expect(s.state.player.hp).toBe(4);
  });

  it('a gliding hero: flying into it costs a light; one cut and she flies on through it; passing 130 px over it, nothing', () => {
    // Open sky, 3000 px deep. She steps off at 1150 and glides right: 10.56 px/f along, sinking 4.8.
    const sky = (y: number): Scene => ({
      id: 'sky',
      width: 6000,
      height: 3000,
      spawn: { x: 300, y: 2800 },
      solids: [{ tag: 'ground', x: 0, y: 2800, w: 6000, h: 200 }],
      oneWays: [],
      enemies: [lamp(2700, y, -1, 'a', 20)],
    });
    const fly = (y: number, cut: boolean) => {
      const s = newSim(sky(y));
      s.place(1700, 1150);
      let hurtAt = -1;
      let prev = false;
      let near = 9e9;
      let speed = 0;
      for (let f = 0; f < 170; f++) {
        const e = foe(s);
        const p = s.state.player;
        const dx = mid(e).x - her(s).x;
        const dy = mid(e).y - her(s).y;
        near = Math.min(near, Math.hypot(dx, dy));
        const a: boolean =
          cut && !prev && p.attackCd === 0 && e.hp === 2 && dx > 40 && dx < 150 && Math.abs(dy) < 45;
        const from = s.events.length;
        step(
          s.state,
          ActionBit.right | ActionBit.jump | (a ? ActionBit.attack : 0),
          s.tuning,
          s.scene,
          s.events,
        );
        prev = a;
        if (p.gliding) speed = Math.max(speed, Math.hypot(p.vx, p.vy));
        if (hurtAt < 0 && of(s.events.slice(from), 'hurt').length) hurtAt = f;
      }
      return { hurtAt, hp: foe(s).hp, near, speed, gliding: s.state.player.gliding, mode: foe(s).mode };
    };
    // Straight at it, no answer: it has only begun its tell when she arrives.
    const into = fly(1250, false);
    expect(into.hurtAt).toBeGreaterThan(80);
    expect(into.speed).toBeGreaterThan(11.5);
    // The answer: a cut on the way in. It tumbles, harmless, and she is through before it rights itself.
    const through = fly(1250, true);
    expect([through.hurtAt, through.hp, through.gliding]).toEqual([-1, 1, true]);
    expect(through.near).toBeLessThan(30);
    // Her line 130 px above its home: it sees her, lifts, turns after her, and never gets near.
    const over = fly(1380, false);
    expect(over.hurtAt).toBe(-1);
    expect(over.near).toBeGreaterThan(90);
    expect(['curious', 'pursue', 'rest']).toContain(over.mode);
  });

  it('out of sight it goes to where it last saw her', () => {
    const wall: SolidRect = { tag: 'trunk', x: 1650, y: 300, w: 60, h: 500 };
    const s = newSim(scene([lamp(2000, 600)], { solids: [wall] }), calm());
    s.place(1850, FLOOR);
    s.run('.40');
    s.place(1560, FLOOR);
    s.run('.60');
    const e = foe(s);
    expect([e.mode, e.targetX, e.targetY, e.lost]).toEqual(['pursue', 1850, 760, 60]);
  });
});

describe('lampwing: giving up', () => {
  const start = (t = calm(), extra: Partial<Pick<Scene, 'solids' | 'oneWays'>> = {}) => {
    const s = newSim(scene([lamp(2000, 600)], extra), t);
    s.place(1850, FLOOR);
    s.run('.40');
    expect(foe(s).mode).toBe('pursue');
    return s;
  };
  const gaveUp = (s: Sim, script: string) => {
    let at = -1;
    let cause = '';
    frames(s, script, (ev, f) => {
      for (const g of of(ev, 'enemyGiveUp')) {
        at = f;
        cause = g.cause;
        expect(g).toMatchObject({ id: 'l2000', kind: 'lampwing', frames: L.restFrames });
        expect([g.x, g.y]).toEqual([mid(foe(s)).x, mid(foe(s)).y]);
        expect([foe(s).mode, foe(s).timer]).toEqual(['rest', 60]);
      }
    });
    return { at, cause };
  };

  it('far: she gets more than 520 px from its home', () => {
    const s = start();
    let dist = 0;
    let at = -1;
    frames(s, 'L80', (ev, f) => {
      if (at < 0 && of(ev, 'enemyGiveUp').length) {
        at = f;
        expect(of(ev, 'enemyGiveUp')[0]?.cause).toBe('far');
        dist = Math.hypot(her(s).x - 2000, her(s).y - 600);
      }
    });
    expect(at).toBeGreaterThan(0);
    expect(dist).toBeGreaterThan(L.leashPx);
    expect(dist).toBeLessThan(L.leashPx + 12);
  });

  it('lost: it has not seen her for 90 frames', () => {
    const wall: SolidRect = { tag: 'trunk', x: 1650, y: 300, w: 60, h: 500 };
    const s = start(calm(), { solids: [wall] });
    s.place(1560, FLOOR);
    expect(gaveUp(s, '.120')).toEqual({ at: L.lostFrames - 1, cause: 'lost' });
  });

  it('tired: six seconds of pursuit and it has had enough, even on top of her', () => {
    const s = start();
    s.state.player.invuln = 1e6;
    // (`start` ran 40 frames: the 30 of the tell and the first 10 of the chase.)
    expect(gaveUp(s, '.400')).toEqual({ at: L.pursueFrames - 10, cause: 'tired' });
    expect(L.pursueFrames).toBe(360);
    expect(s.state.player.hp).toBe(4);
  });

  it('dark: her light goes out', () => {
    const s = newSim(scene([lamp(2000, 600), burr(1900, -1)]), calm());
    s.place(1850, FLOOR);
    s.state.player.hp = 1;
    const ev = s.run('.40');
    // The burrback walks into her: her last light. The lampwing, still coming, loses interest.
    expect(of(ev, 'hurt').map((h) => [h.source.kind, h.hp])).toEqual([['burrback', 0]]);
    expect(of(ev, 'enemyGiveUp').map((g) => g.cause)).toEqual(['dark']);
  });

  it('then: it hangs 60 frames, flies home, and notices nothing until it is there', () => {
    const s = start();
    expect(gaveUp(s, 'L80').cause).toBe('far');
    // She comes straight back and stands under it.
    s.place(1900, FLOOR);
    s.state.player.invuln = 1e6;
    const modes: string[] = [];
    let noticed = -1;
    let home = -1;
    frames(s, '.400', (ev, f) => {
      const e = foe(s);
      if (modes.at(-1) !== e.mode) modes.push(e.mode);
      if (home < 0 && e.mode === 'hover') home = f;
      if (noticed < 0 && of(ev, 'enemyNotice').length) noticed = f;
      if (e.mode === 'return') expect([e.targetX, e.targetY]).toEqual([2000, 600]);
    });
    expect(modes.slice(0, 4)).toEqual(['rest', 'return', 'hover', 'curious']);
    // Home = within 24 px of it; only then can it notice again (the frame after it is back).
    expect(home).toBeGreaterThan(30);
    expect(noticed).toBe(home + 1);
    const t = cloneTuning(defaultTuning);
    expect([t.lampwing.restFrames, t.lampwing.homePx, t.lampwing.returnSpeed]).toEqual([60, 24, 1.8]);
  });

  it('on its way home it goes round a platform that is in the way', () => {
    const plat: SolidRect = { tag: 'floating', x: 1860, y: 560, w: 280, h: 40 };
    const wall: SolidRect = { tag: 'trunk', x: 2600, y: 300, w: 60, h: 300 };
    const sc = scene([lamp(2000, 500, 1, 'a'), lamp(2800, 450, 1, 'b')], { solids: [plat, wall] });
    const s = newSim(sc, calm());
    s.place(300, FLOOR);
    // Put one right under the platform's middle and one behind the wall, both heading home.
    const a = foe(s, 0);
    const b = foe(s, 1);
    Object.assign(a, { x: 2000 - 18, y: 700, mode: 'return', targetX: a.homeX, targetY: a.homeY });
    Object.assign(b, { x: 2500 - 18, y: 450 - 15, mode: 'return', targetX: b.homeX, targetY: b.homeY });
    const back = [-1, -1];
    frames(s, '.900', (_, f) => {
      for (const k of [0, 1]) {
        const e = foe(s, k);
        expect(inSolid(sc, e)).toBe(false);
        if (back[k] === -1 && e.mode === 'hover') back[k] = f;
      }
    });
    expect(back[0]).toBeGreaterThan(100);
    expect(back[0]).toBeLessThan(500);
    expect(back[1]).toBeGreaterThan(100);
    expect(back[1]).toBeLessThan(500);
  });
});

describe('lampwing: contact', () => {
  it('its touch costs one light with the burrback’s rules, and it bounces off her and backs away', () => {
    const s = duel(blind(), 2100);
    let at = -1;
    frames(s, 'R20', (ev, f) => {
      const h = of(ev, 'hurt')[0];
      if (!h) return;
      at = f;
      expect(h).toMatchObject({ dir: -1, hp: 3, hpMax: 4, damage: 1, stagger: 12, invuln: 70 });
      expect(h.source).toEqual({ kind: 'lampwing', id: 'l2200' });
      const p = s.state.player;
      expect([p.vx, p.vy, p.stagger, p.invuln, p.hurtDir]).toEqual([-H.hurtVx, -H.hurtVy, 12, 70, -1]);
      // Its own recoil: thrown away from her centre at 5 px/f, and it has had enough (`rest`).
      const e = foe(s);
      expect(of(ev, 'enemyGiveUp').map((g) => [g.cause, g.frames])).toEqual([['touch', 60]]);
      expect([e.mode, e.timer]).toEqual(['rest', 60]);
      expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(L.bounceSpeed, 9);
      expect(e.vx).toBeGreaterThan(4.9);
    });
    expect(at).toBeGreaterThan(0);
    // It does not sit inside her: the two part at once, and it comes to rest a body's width off.
    const x0 = mid(foe(s)).x;
    frames(s, '.30', () => expect(overlap(s, foe(s))).toBe(false));
    expect(mid(foe(s)).x - x0).toBeGreaterThan(30);
    expect(Math.hypot(foe(s).vx, foe(s).vy)).toBe(0);
    expect(s.state.player.grounded).toBe(true);
  });

  it('the throw is away from it, mirrored; from straight above it lifts off upward', () => {
    const s = duel(blind(), 2300);
    let n = 0;
    frames(s, 'L20', (ev) => {
      for (const h of of(ev, 'hurt')) {
        n++;
        expect([h.dir, s.state.player.vx, s.state.player.vy]).toEqual([1, H.hurtVx, -H.hurtVy]);
        expect(foe(s).vx).toBeLessThan(-4.9);
      }
    });
    expect(n).toBe(1);
    // It hangs over her head and she jumps into it: it goes up, she is thrown as ever.
    const t = newSim(scene([lamp(2000, 640)]), blind());
    t.place(2000, FLOOR);
    n = 0;
    frames(t, 'J12', (ev) => {
      for (const h of of(ev, 'hurt')) {
        n++;
        expect(t.state.player.vy).toBe(-H.hurtVy);
        expect(foe(t).vy).toBeLessThan(-4.9);
        expect(h.hp).toBe(3);
      }
    });
    expect(n).toBe(1);
  });

  it('exclusions: while she is invulnerable, through its whole tumble, and once it is dead', () => {
    // Invulnerable: she walks through it; it does not even bounce.
    let s = duel(blind(), 2100);
    s.state.player.invuln = 40;
    let met = 0;
    // (R15: three frames more than before, for the eased start of the run.)
    frames(s, 'R15', (ev) => {
      if (overlap(s, foe(s))) met++;
      expect(of(ev, 'hurt')).toEqual([]);
    });
    expect(met).toBeGreaterThanOrEqual(4);
    expect([foe(s).mode, mid(foe(s)).x]).toEqual(['hover', 2200]);

    // She cuts it and walks on into it: harmless for the hitstop and all 16 frames of its tumble
    // (a burrback: only the first 8). The moment it rights itself, its touch counts again.
    s = duel();
    let touched = 0;
    let hurtAt = -1;
    frames(s, 'A1 R30', (ev, f) => {
      const e = foe(s);
      if (e.mode === 'hurt' && overlap(s, e)) touched++;
      if (hurtAt < 0 && of(ev, 'hurt').length) hurtAt = f;
    });
    expect(touched).toBeGreaterThanOrEqual(6);
    expect(hurtAt).toBe(1 + EN.hitstopFrames + L.hurtFrames);
    expect([L.hurtFrames, L.hurtSafeFrames]).toEqual([16, 16]);

    // Dead: the falling body is nothing to her.
    s = duel();
    foe(s).hp = 1;
    const ev = s.run('A1 R40');
    expect(of(ev, 'enemyDie').length).toBe(1);
    expect(of(ev, 'hurt')).toEqual([]);
  });
});

describe('lampwing: taking hits', () => {
  it('two hit points: cut, cut kills it; hitstop 2 / 2; held, batted 32 px along the cut, tumbling 16 frames', () => {
    const s = duel();
    const log: string[] = [];
    const xs: number[] = [];
    const modes: string[] = [];
    frames(s, 'A1 .16 A1 .60', (ev, f) => {
      const e = foe(s);
      xs.push(mid(e).x);
      modes.push(e.mode);
      for (const x of ev) {
        if (x.type === 'slashHit') {
          expect(x.target).toEqual({ kind: 'lampwing', id: 'l2200' });
          expect([x.x, x.y]).toEqual([mid(e).x, mid(e).y]);
          expect([s.state.player.hitstop, e.hitstop]).toEqual([x.hitstop, x.hitstop]);
          log.push(`${f} stop${x.hitstop}`);
        }
        if (x.type === 'enemyHit')
          log.push(
            `${f} hit p${x.power} hp${x.hpLeft}/${x.hpMax} kb${x.knockback.toFixed(2)} d${x.dir} f${x.frames}`,
          );
        if (x.type === 'enemyDie') log.push(`${f} die p${x.power} v${x.value} st${x.stagger} f${x.frames}`);
        if (x.type === 'impact') log.push(`${f} impact p${x.power}`);
      }
    });
    expect(log).toEqual([
      '1 stop2',
      '1 hit p1 hp1/2 kb6.60 d1 f16',
      '1 impact p1',
      '20 stop2',
      '20 die p1 v3 st5 f40',
      '20 impact p1',
    ]);
    // Hit on frame 1, held on 1-3, then the shove: 6.6 px/f fading 0.75 a frame = 32 px in 9 frames
    // (a burrback goes 21). Its stagger ends 16 frames after the hold; struck, it then goes for her.
    expect(xs.slice(1, 14).map((x) => x - 2200)).toEqual([0, 0, 0, 7, 12, 18, 22, 26, 28, 30, 32, 32, 32]);
    expect(modes.indexOf('hurt')).toBe(1);
    expect(modes.indexOf('pursue')).toBe(1 + EN.hitstopFrames + L.hurtFrames);
    const e = foe(s);
    expect([e.mode, e.hp, e.gone, e.hitDir, e.hitPower, e.hitFrame]).toEqual(['dead', 0, true, 1, 1, 20]);
    expect(s.state.player.hp).toBe(4);
  });

  it('the finisher kills it outright (hitstop 3) and it spills 5 instead of 3', () => {
    const s = duel();
    // Two cuts into the air behind her, the finisher into it.
    const ev = s.run('L+A1 .16 L+A1 .18 R+A1 .90');
    expect(of(ev, 'enemyHit')).toEqual([]);
    expect(of(ev, 'slashHit').map((h) => [h.step, h.power, h.hitstop])).toEqual([[3, 2, 3]]);
    const die = of(ev, 'enemyDie')[0];
    expect(die).toMatchObject({
      kind: 'lampwing',
      power: 2,
      value: 5,
      glintFrames: 16,
      stagger: 5,
      frames: 40,
    });
    expect(die?.knockback).toBeCloseTo(12.1, 9);
    expect(s.state.pickups.count).toBe(5);
    expect([L.value, L.valueFinisher, L.hp]).toEqual([3, 5, 2]);
  });

  it('pogo: a down slash bounces her off it exactly like a pod, refills dash and double jump, and hurts it: two bounces kill', () => {
    const s = newSim(scene([lamp(2200, 600)]), blind());
    s.place(2200, 540);
    s.state.player.dj = 0;
    s.state.player.airDash = 0;
    let bounces = 0;
    const ys: number[] = [];
    frames(s, 'D+A1 .31 D+A1 .60', (ev) => {
      for (const h of of(ev, 'slashHit')) {
        bounces++;
        expect([h.pogo, h.dir, h.power]).toEqual([true, 'down', 1]);
        expect(s.state.player.vy).toBe(-defaultTuning.attack.pogoSpeed);
        expect([s.state.player.dj, s.state.player.airDash]).toEqual([1, 1]);
        ys.push(mid(foe(s)).y);
        s.state.player.dj = 0;
        s.state.player.airDash = 0;
      }
    });
    expect(bounces).toBe(2);
    expect([foe(s).mode, s.state.player.hp]).toEqual(['dead', 4]);
    // Batted straight down 32 px by the first; it had drifted back up a little by the second.
    expect(ys[0]).toBe(600);
    expect(ys[1]).toBeGreaterThan(615);
    expect(of(s.events, 'enemyHit')[0]).toMatchObject({ slash: 'down', hpLeft: 1 });
    expect([foe(s).knockVx, mid(foe(s)).x]).toEqual([0, 2200]);
  });

  it('a pogo chain: two lampwings in a row carry her across a gap she could not otherwise cross that high', () => {
    const two = () => scene([lamp(2200, 600, 1, 'a'), lamp(2480, 600, 1, 'b')]);
    const s = newSim(two(), blind());
    s.place(2200, 540);
    const hits: string[] = [];
    const tops: number[] = [];
    let y0 = 0;
    frames(s, 'R+D+A1 R31 R+D+A1 R34', (ev) => {
      for (const h of of(ev, 'slashHit')) {
        hits.push(`${h.target.id}:${h.pogo}`);
        y0 = her(s).y;
        expect([s.state.player.dj, s.state.player.airDash]).toEqual([1, 1]);
      }
      if (of(ev, 'apex').length) tops.push(y0 - her(s).y);
    });
    expect(hits).toEqual(['a:true', 'b:true']);
    // Each bounce is the pod's: about 125 px up. 68 frames on she is as high as she began, 560 px along.
    expect(tops.every((d) => d > 118 && d < 130)).toBe(true);
    expect(her(s).x - 2200).toBeGreaterThan(540);
    expect(her(s).y).toBeLessThan(540);
    expect([s.state.player.hp, foe(s, 0).hp, foe(s, 1).hp]).toEqual([4, 1, 1]);
    // Without them she would be 600 px lower by now (on the floor).
    const q = newSim(scene([]), blind());
    q.place(2200, 540);
    q.run('R+D+A1 R31 R+D+A1 R34');
    expect(q.state.player.grounded).toBe(true);
  });

  it('the shove follows the cut (forward, up, down) and stops at solids', () => {
    // Forward into a wall 12 px behind it.
    let s = newSim(
      scene([lamp(2200, 760)], { solids: [{ tag: 'trunk', x: 2230, y: 600, w: 40, h: 200 }] }),
      blind(),
    );
    s.place(2110, FLOOR);
    s.run('A1 .14');
    expect([foe(s).mode, mid(foe(s)).x, mid(foe(s)).y, foe(s).knockVx]).toEqual(['hurt', 2212, 760, 0]);
    // An up cut sends it up, into a slab 10 px over it.
    s = newSim(
      scene([lamp(2200, 680)], { solids: [{ tag: 'floating', x: 2100, y: 615, w: 200, h: 40 }] }),
      blind(),
    );
    s.place(2200, FLOOR);
    const ev = s.run('U+A1 .14');
    expect(of(ev, 'enemyHit')[0]).toMatchObject({ slash: 'up' });
    expect([mid(foe(s)).x, mid(foe(s)).y, foe(s).knockVy]).toEqual([2200, 670, 0]);
    // Free air: 32 px up.
    s = newSim(scene([lamp(2200, 680)]), blind());
    s.place(2200, FLOOR);
    s.run('U+A1 .14');
    expect([mid(foe(s)).x, mid(foe(s)).y]).toEqual([2200, 648]);
    // A down cut onto the floor 10 px under it.
    s = newSim(scene([lamp(2200, 775)]), blind());
    s.place(2200, 700);
    s.run('D+A1 .14');
    expect([foe(s).hp, mid(foe(s)).y, foe(s).y + foe(s).h]).toEqual([1, 785, FLOOR]);
  });

  it('a slash does not reach it through solid ground', () => {
    const s = newSim(
      scene([lamp(2200, 640)], { solids: [{ tag: 'floating', x: 2100, y: 670, w: 200, h: 40 }] }),
      blind(),
    );
    s.place(2200, FLOOR);
    expect(of(s.run('U+A1 .20'), 'slashHit')).toEqual([]);
    expect(foe(s).hp).toBe(2);
  });
});

describe('lampwing: death', () => {
  it('the body falls with gravity (only now), for at most 40 frames, and is gone', () => {
    const s = newSim(scene([lamp(2200, 300)]), blind());
    foe(s).hp = 1;
    s.place(2200, 240);
    const ys: number[] = [];
    let goneAt = -1;
    frames(s, 'D+A1 .60', (_, f) => {
      const e = foe(s);
      if (e.mode === 'dead' && !e.gone) ys.push(mid(e).y);
      if (goneAt < 0 && e.gone) goneAt = f;
    });
    // Killed on frame 1, held 2 more, then 40 frames of falling: 0.45 px/f², capped at 9 px/f.
    expect(goneAt).toBe(1 + EN.hitstopFrames + L.deadFrames);
    const drop = (ys.at(-1) as number) - 300;
    expect(drop).toBeGreaterThan(280);
    expect(drop).toBeLessThan(L.maxFall * L.deadFrames);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1] as number);
    const e = foe(s);
    expect([e.landed, e.vx, e.vy, e.knockVx, e.knockVy]).toEqual([false, 0, 0, 0, 0]);
    expect(e.y + e.h).toBeLessThan(FLOOR);
  });

  it('if it lands first it lies 6 frames and is gone; a one-way branch does not catch it', () => {
    const sc = scene([lamp(2200, 700)], { oneWays: [{ tag: 'branch', x: 2100, y: 740, w: 200 }] });
    const s = newSim(sc, blind());
    foe(s).hp = 1;
    s.place(2200, 640);
    let landAt = -1;
    let goneAt = -1;
    frames(s, 'D+A1 .60', (_, f) => {
      const e = foe(s);
      if (landAt < 0 && e.landed) landAt = f;
      if (goneAt < 0 && e.gone) goneAt = f;
    });
    expect(foe(s).y + foe(s).h).toBe(FLOOR);
    expect(landAt).toBeGreaterThan(3);
    expect(goneAt - landAt).toBe(L.landFrames);
    expect(goneAt).toBeLessThan(1 + EN.hitstopFrames + L.deadFrames);
  });

  it('its glints are counted exactly once through the burrback’s queue: first after 16 frames, then 5 apart', () => {
    const s = duel();
    foe(s).hp = 1;
    const got: number[] = [];
    let die = -1;
    frames(s, 'A1 .120', (ev, f) => {
      const e = foe(s);
      if (of(ev, 'enemyDie').length) {
        die = f;
        // The fields the pickup renderer flies them from: owed, frames to the next, the gap.
        expect([e.spill, e.spillTimer, e.spillGap]).toEqual([3, 16, 5]);
      }
      for (const p of of(ev, 'pickup')) {
        expect(p).toMatchObject({ id: 'l2200', kind: 'glint', value: 1, enemy: true });
        expect(p.pod).toBeUndefined();
        expect([p.x, p.y]).toEqual([mid(e).x, mid(e).y]);
        got.push(f - die);
      }
    });
    expect(got).toEqual([16, 21, 26]);
    expect([s.state.pickups.count, s.state.pickups.taken]).toEqual([3, 0]);
    expect([foe(s).spill, foe(s).spillTimer, foe(s).gone]).toEqual([0, 0, true]);
  });
});

describe('lampwing: where it will not go', () => {
  it('two lampwings do not stack: a soft push keeps them apart, hovering and on top of her', () => {
    const s = newSim(scene([lamp(2000, 600, 1, 'a'), lamp(2004, 600, 1, 'b')]));
    s.place(300, FLOOR);
    let near = 9e9;
    frames(s, '.900', (_, f) => {
      if (f > 120)
        near = Math.min(
          near,
          Math.hypot(mid(foe(s, 0)).x - mid(foe(s, 1)).x, mid(foe(s, 0)).y - mid(foe(s, 1)).y),
        );
    });
    expect(near).toBeGreaterThan(24);
    // Both come for her (she cannot be hurt here, so they stay on her): still two bodies, not one.
    s.place(1900, FLOOR);
    s.state.player.invuln = 1e6;
    near = 9e9;
    let both = 0;
    frames(s, '.380', (_, f) => {
      const a = foe(s, 0);
      const b = foe(s, 1);
      if (a.mode !== 'pursue' || b.mode !== 'pursue' || f < 200) return;
      both++;
      near = Math.min(near, Math.hypot(mid(a).x - mid(b).x, mid(a).y - mid(b).y));
    });
    expect(both).toBeGreaterThan(100);
    expect(near).toBeGreaterThan(20);
    // A burrback and a lampwing ignore each other.
    const q = newSim(scene([lamp(2000, 783), burr(2100, -1)]), blind());
    q.place(300, FLOOR);
    q.run('.200');
    expect([foe(q).mode, mid(foe(q)).x, foe(q, 1).mode, foe(q, 1).x < 1900]).toEqual([
      'hover',
      2000,
      'walk',
      true,
    ]);
  });

  it('never above the canopy, never down to the water of a pool, whatever she does', () => {
    const pool: Scene = {
      id: 'pool',
      width: 3000,
      height: 1000,
      spawn: { x: 300, y: 600 },
      ceilingY: 0,
      solids: [
        { tag: 'ground', x: 0, y: 600, w: 1000, h: 400 },
        { tag: 'pool', x: 1000, y: 728, w: 400, h: 272 },
        { tag: 'ground', x: 1400, y: 600, w: 1600, h: 400 },
      ],
      oneWays: [],
      enemies: [lamp(1200, 500, 1, 'low'), lamp(2200, 40, 1, 'high')],
    };
    const s = newSim(pool);
    // She wades in the pool, then stands on a ledge of air right under the canopy.
    s.place(1200, 728);
    s.state.player.invuln = 1e6;
    const water = 728 - L.poolDepth;
    let low = 0;
    let high = 9e9;
    frames(s, '.500', () => {
      const e = foe(s, 0);
      low = Math.max(low, e.y + e.h);
      high = Math.min(high, foe(s, 1).y);
      expect(lampwingBlocked(pool, e.x, e.y, e.w, e.h, L)).toBe(false);
    });
    expect(of(s.events, 'enemyNotice').map((n) => n.id)).toContain('low');
    expect(low).toBe(water - L.poolClear);
    expect(high).toBeGreaterThanOrEqual(0);
    // An up cut under the canopy cannot bat it out of the scene.
    const e = foe(s, 1);
    Object.assign(e, { x: 2200 - 18, y: 6, mode: 'hover', vx: 0, vy: 0 });
    s.place(2200, 130);
    s.state.player.invuln = 1e6;
    const ev = s.run('U+A1 .14');
    expect(of(ev, 'enemyHit').length).toBe(1);
    expect(foe(s, 1).y).toBe(0);
  });
});

describe('lampwing: fade and re-form, restart', () => {
  it('when she re-forms the living ones are home with full hp; the dead stay dead', () => {
    const s = newSim(
      scene([lamp(2000, 620, 1, 'a'), lamp(2600, 760, 1, 'b'), lamp(2060, 620, 1, 'c')]),
      calm(),
    );
    // Safe ground well away from them first.
    s.place(600, FLOOR);
    s.run('.40');
    expect(s.state.player.safeX).toBe(600);
    s.place(2510, FLOOR);
    foe(s, 1).hp = 1;
    s.run('A1 .60');
    expect(foe(s, 1).mode).toBe('dead');
    s.place(1850, FLOOR);
    s.state.player.hp = 1;
    foe(s, 2).hp = 1;
    const ev = s.run('.260');
    expect(of(ev, 'hurt').map((h) => h.hp)).toEqual([0]);
    expect(of(ev, 'fade').length).toBe(1);
    expect(of(ev, 'reform').length).toBe(1);
    expect(
      of(ev, 'enemyGiveUp')
        .map((g) => g.cause)
        .sort(),
    ).toEqual(['dark', 'touch']);
    // She re-formed on safe ground away from them: they hang at home, untouched since (the two
    // homes are 60 px apart, so they have nudged each other a little).
    const re = of(ev, 'reform')[0];
    expect(Math.abs((re?.x ?? 0) - 2510)).toBeLessThan(12);
    for (const k of [0, 2]) {
      const e = foe(s, k);
      expect([e.mode, e.hp, e.homeX, e.homeY, e.chase]).toEqual(['hover', 2, k === 0 ? 2000 : 2060, 620, 0]);
      expect(Math.hypot(mid(e).x - e.homeX, mid(e).y - e.homeY)).toBeLessThan(16);
    }
    expect([foe(s, 1).mode, foe(s, 1).gone]).toEqual(['dead', true]);
    // A fade costs: she is back with 2 of 4.
    expect(s.state.player.hp).toBe(2);
  });

  it('safe ground keeps outside a living lampwing’s territory and sight (radius + 260 px from its home)', () => {
    const sc = scene([lamp(2000, 620)]);
    let s = newSim(sc, calm());
    const safeAt = (x: number, fresh = true) => {
      if (fresh) s = newSim(sc, calm());
      s.place(x, FLOOR);
      s.run('.40');
      return s.state.player.safeX === x;
    };
    // Its home is 140 px above the floor: 380 px from it is 353 px along the floor.
    expect([safeAt(1500), safeAt(2050), safeAt(1700), safeAt(1660), safeAt(1640)]).toEqual([
      true,
      false,
      false,
      false,
      true,
    ]);
    // Dead, it no longer counts.
    Object.assign(foe(s), { mode: 'dead', gone: true });
    expect(safeAt(2050, false)).toBe(true);
  });
});

describe('lampwing: determinism and symmetry', () => {
  const script =
    '.30 R20 A1 R16 A1 .12 R+J20 R10 D+A1 .20 L30 L+A1 .16 A1 .17 A1 R60 R+X1 R20 .40 L+J30 L40 U+A1 .100 R120 A1 .16 A1 .18 A1 .120 L+J24 L1 L+J60 .90';
  const cast = (W = 0) => {
    const m = (x: number) => (W ? W - x : x);
    const f = (d: -1 | 1): -1 | 1 => (W ? (d > 0 ? -1 : 1) : d);
    return scene([
      lamp(m(2250), 640, f(1), 'p'),
      lamp(m(1700), 600, f(-1), 'q'),
      lamp(m(1760), 590, f(1), 'r'),
      { ...burr(m(2500), f(-1)), id: 'b' },
    ]);
  };

  it('the same inputs give the same state hash; a clone hashes the same; plain JSON throughout', () => {
    const a = newSim(cast());
    const b = newSim(cast());
    a.run(script);
    b.run(script);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(hashState(cloneState(a.state))).toBe(hashState(a.state));
    expect(JSON.parse(JSON.stringify(a.state))).toEqual(a.state);
    const kinds = new Set(a.events.map((e) => e.type));
    for (const k of ['enemyNotice', 'enemyGiveUp', 'enemyHit', 'hurt'])
      expect(kinds.has(k as never), k).toBe(true);
  });

  it('mirror symmetry: a mirrored scene and mirrored inputs give exactly the mirrored fight', () => {
    const W = 4000;
    const a = newSim(cast());
    const b = newSim(cast(W));
    const flip = script.replace(/[LR]/g, (c) => (c === 'L' ? 'R' : 'L'));
    const ma = parseInputScript(script);
    const mb = parseInputScript(flip);
    for (let i = 0; i < ma.length; i++) {
      step(a.state, ma[i] as number, a.tuning, a.scene, a.events);
      step(b.state, mb[i] as number, b.tuning, b.scene, b.events);
      const p = a.state.player;
      const q = b.state.player;
      expect([q.x, q.y, q.hp, q.stagger], `frame ${i}`).toEqual([W - p.x - p.w, p.y, p.hp, p.stagger]);
      for (let k = 0; k < 4; k++) {
        const e = foe(a, k);
        const m = foe(b, k);
        expect([m.x, m.y, m.mode, m.hp, m.facing, m.timer, m.vy, m.flap], `frame ${i} enemy ${k}`).toEqual([
          W - e.x - e.w,
          e.y,
          e.mode,
          e.hp,
          -e.facing,
          e.timer,
          e.vy,
          e.flap,
        ]);
        expect(m.vx + e.vx, `frame ${i} enemy ${k} vx`).toBe(0);
      }
    }
    expect(a.state.player.hp).toBeLessThan(4);
  });

  it('a restart brings them back', () => {
    const s = duel();
    foe(s).hp = 1;
    s.run('A1 .60');
    expect(foe(s).gone).toBe(true);
    const fresh = newSim(s.scene, s.tuning);
    expect(fresh.state.enemies.map((e) => [e.kind, e.mode, e.hp, e.x, e.y, e.gone])).toEqual([
      ['lampwing', 'hover', 2, 2182, 745, false],
    ]);
  });
});

describe('lampwings in the grove', () => {
  const list = (GROVE.enemies ?? []).filter((e) => e.kind === 'lampwing');
  const first = (GROVE.enemies ?? []).length - list.length;

  it('five, after the burrbacks; validated: open air, under the canopy, away from the spawn and from every pod and great glint', () => {
    expect(list.map((e) => [e.id, e.x, e.y, e.radius])).toEqual([
      ['lamp-glade', 800, 690, 100],
      ['lamp-f3', 1290, 480, 80],
      ['lamp-ledge', 2700, 150, 90],
      ['lamp-glide-1', 4400, 270, 60],
      ['lamp-glide-2', 4900, 250, 60],
    ]);
    expect((GROVE.enemies ?? []).slice(0, first).every((e) => e.kind === 'burrback')).toBe(true);
    const prizes = [...(GROVE.pods ?? []), ...(GROVE.pickups ?? []).filter((p) => p.kind === 'great')];
    for (const e of list) {
      expect(Math.hypot(e.x - GROVE.spawn.x, e.y - GROVE.spawn.y), e.id).toBeGreaterThanOrEqual(
        LAMPWING_SPAWN_CLEAR,
      );
      for (const p of prizes)
        expect(Math.hypot(e.x - p.x, e.y - p.y), `${e.id} / ${p.id}`).toBeGreaterThanOrEqual(
          (e.radius ?? L.radius) + LAMPWING_PRIZE_CLEAR,
        );
    }
    expect(LAMPWING_SPAWN_CLEAR).toBe(350);
    // One in each third of the scene.
    for (const [a, b] of [
      [0, 1920],
      [1920, 3840],
      [3840, 5760],
    ])
      expect(list.some((e) => e.x >= (a as number) && e.x < (b as number))).toBe(true);
    const bad = (e: unknown) => () => parseScene({ ...GROVE, enemies: [e] });
    const one = list[0] as EnemySpawn;
    expect(bad({ ...one, id: 'pod-f2' })).toThrow(/called/);
    expect(bad({ ...one, y: 970 })).toThrow(/open air/);
    // (Above the canopy, which is now 420 px over the scene's top.)
    expect(bad({ ...one, y: -410 })).toThrow(/outside/);
    expect(bad({ ...one, x: 1120, y: 1000 })).toThrow(/spawn/);
    expect(bad({ ...one, x: 1136, y: 760 })).toThrow(/too close to "pod-f2"/);
    expect(bad({ ...one, x: 1984, y: 900 })).toThrow(/too close to "great-hang"/);
    expect(bad({ ...one, radius: -1 })).toThrow();
    expect(bad({ ...one, facing: 0 })).toThrow();
    // (A burrback may have a range of its own, but not one shorter than its body.)
    expect(bad({ ...(GROVE.enemies ?? [])[0], radius: 5 })).toThrow();
    expect(bad({ ...(GROVE.enemies ?? [])[0], radius: 90 })).not.toThrow();
    expect(bad(one)).not.toThrow();
  });

  it('left alone for a minute each keeps to its territory, clear of every solid, under the canopy; none notices her at the spawn', () => {
    const s = newSim();
    const far = list.map(() => 0);
    frames(s, '.3600', (ev) => {
      expect(ev.filter((e) => e.type === 'enemyNotice')).toEqual([]);
      list.forEach((h, i) => {
        const e = foe(s, first + i);
        far[i] = Math.max(far[i] as number, Math.hypot(mid(e).x - h.x, mid(e).y - h.y));
        expect(inSolid(GROVE, e), h.id).toBe(false);
        expect(e.y, h.id).toBeGreaterThanOrEqual(0);
        expect(e.mode).toBe('hover');
      });
    });
    list.forEach((h, i) => {
      expect(far[i], h.id).toBeLessThanOrEqual(h.radius ?? L.radius);
      expect(far[i], h.id).toBeGreaterThan(20);
    });
    expect(feet(s)).toEqual(GROVE.spawn);
    expect(s.state.player.hp).toBe(4);
  });
});
