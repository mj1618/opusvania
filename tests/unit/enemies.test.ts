import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../src/input/script';
import { GROVE, parseScene } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { cloneState, createState, hashState, step } from '../../src/sim/index';
import type { EnemySpawn, Pod, Scene } from '../../src/sim/scene';
import type { EnemyState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim } from './helpers';

const H = defaultTuning.health;
const B = defaultTuning.burrback;
const EN = defaultTuning.enemies;
const FLOOR = 800;
const burr = (x: number, facing: -1 | 1 = -1, y = FLOOR, id = `b${x}`): EnemySpawn => ({
  id,
  kind: 'burrback',
  x,
  y,
  facing,
});
const scene = (
  enemies: EnemySpawn[],
  extra: Partial<Pick<Scene, 'solids' | 'oneWays'>> = {},
  pods: Pod[] = [],
): Scene => ({ ...flatScene(extra), enemies, pods });
const foe = (s: Sim, i = 0) => s.state.enemies[i] as EnemyState;
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) =>
  ev.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
/** Runs a script one frame at a time, calling `each` after every step with that step's events. */
function frames(s: Sim, script: string, each: (ev: SimEvent[], f: number) => void): void {
  let f = 0;
  for (const m of parseInputScript(script)) {
    const from = s.events.length;
    step(s.state, m, s.tuning, s.scene, s.events);
    each(s.events.slice(from), f++);
  }
}
/** A burrback that stands still (for tests that measure something else). */
function still() {
  const t = cloneTuning(defaultTuning);
  t.burrback.speed = 0;
  t.burrback.alertPx = 0;
  return t;
}
/** Stands her next to a motionless burrback at 2200 (box 2174-2226), facing it, in reach of a cut. */
function duel(t = still(), at = 2110): Sim {
  const s = newSim(scene([burr(2200)]), t);
  s.place(at, FLOOR);
  return s;
}

describe('burrback: patrol', () => {
  const plat = { tag: 'floating' as const, x: 1000, y: 600, w: 400, h: 48 };

  it('walks its platform, turns at both ledges with a pause, and never leaves it', () => {
    const s = newSim(scene([burr(1200, 1, 600)], { solids: [plat] }));
    const turns: Array<[number, number, string]> = [];
    let minX = 9e9;
    let maxX = -9e9;
    frames(s, '.3000', (ev, f) => {
      const e = foe(s);
      minX = Math.min(minX, e.x);
      maxX = Math.max(maxX, e.x + e.w);
      expect(e.y + e.h).toBe(600);
      for (const t of of(ev, 'enemyTurn')) {
        turns.push([f, t.dir, t.cause]);
        expect(t.frames).toBe(B.turnPauseFrames);
        expect([e.mode, e.turning, e.timer, e.facing, e.vx]).toEqual(['pause', true, 24, t.dir, 0]);
      }
    });
    // Its whole box stays on the platform, and it reaches both ends.
    expect([minX, maxX]).toEqual([1000, 1400]);
    expect(turns.length).toBeGreaterThan(8);
    expect(turns.map((t) => t[1])).toEqual(turns.map((_, i) => (i % 2 === 0 ? -1 : 1)));
    expect(new Set(turns.map((t) => t[2]))).toEqual(new Set(['ledge']));
    // 1.6 px a frame: `stride` is the distance walked, `vx` the speed.
    const e = foe(s);
    expect(B.speed).toBe(1.6);
    expect(e.stride).toBeGreaterThan(3000);
  });

  it('turns at walls and at the scene edge, and walks a one-way branch the same way', () => {
    const walls = [
      { tag: 'ground' as const, x: 1700, y: 700, w: 100, h: 100 },
      { tag: 'ground' as const, x: 2400, y: 700, w: 100, h: 100 },
    ];
    const s = newSim(
      scene([burr(2000, 1), burr(100, -1), burr(3100, 1, 500)], {
        solids: walls,
        oneWays: [{ tag: 'branch', x: 3000, y: 500, w: 300 }],
      }),
    );
    const causes: string[][] = [[], [], []];
    frames(s, '.1500', (ev) => {
      for (const t of of(ev, 'enemyTurn'))
        causes[s.state.enemies.findIndex((e) => e.id === t.id)]?.push(t.cause);
      expect(foe(s, 0).x).toBeGreaterThanOrEqual(1800);
      expect(foe(s, 0).x + B.width).toBeLessThanOrEqual(2400);
      expect(foe(s, 1).x).toBeGreaterThanOrEqual(0);
      expect(foe(s, 2).x).toBeGreaterThanOrEqual(3000);
      expect(foe(s, 2).x + B.width).toBeLessThanOrEqual(3300);
    });
    expect(new Set(causes[0])).toEqual(new Set(['wall']));
    expect(causes[1]?.[0]).toBe('wall');
    expect(new Set(causes[2])).toEqual(new Set(['ledge']));
    expect(causes[2]?.length).toBeGreaterThan(3);
  });

  it('rests now and then on a fixed schedule of its own (no RNG): same every run, different per id', () => {
    const rests = (id: string) => {
      const s = newSim(scene([burr(2000, 1, FLOOR, id)]));
      const rng0 = s.state.rng;
      const out: Array<[number, number]> = [];
      let walked = 0;
      frames(s, '.2400', () => {
        const e = foe(s);
        if (e.mode === 'walk') walked++;
        if (e.mode === 'pause' && e.modeFrames === 0 && !e.turning) {
          out.push([walked, e.timer]);
          walked = 0;
        }
      });
      expect(s.state.rng).toBe(rng0);
      return out;
    };
    const a = rests('a');
    expect(a.length).toBeGreaterThanOrEqual(6);
    for (const [walk, len] of a) {
      expect(walk).toBeGreaterThanOrEqual(B.restEveryMin - 1);
      expect(walk).toBeLessThanOrEqual(B.restEveryMax);
      expect(len).toBeGreaterThanOrEqual(B.restMin);
      expect(len).toBeLessThanOrEqual(B.restMax);
    }
    expect(rests('a')).toEqual(a);
    expect(rests('another')).not.toEqual(a);
  });
});

describe('burrback: the flinch', () => {
  it('she lands or slashes within reach of its senses: it stops for a beat, then carries on', () => {
    const s = newSim(scene([burr(2200)]));
    s.place(2060, FLOOR);
    const ev = s.run('J1 .50');
    const a = of(ev, 'enemyAlert');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      id: 'b2200',
      kind: 'burrback',
      cause: 'land',
      dir: -1,
      facing: -1,
      frames: 18,
    });
    // It fired on the landing frame; 18 frames of standing, then walking again.
    const landed = ev.findIndex((e) => e.type === 'land');
    expect(ev.findIndex((e) => e.type === 'enemyAlert')).toBe(landed + 1);
    const t = cloneTuning(defaultTuning);
    const q = newSim(scene([burr(2200)]), t);
    q.place(2050, FLOOR);
    q.run('L+A1');
    const x = foe(q).x;
    expect([foe(q).mode, foe(q).timer]).toEqual(['alert', B.alertFrames]);
    q.run(`.${B.alertFrames - 1}`);
    expect([foe(q).mode, foe(q).x]).toEqual(['alert', x]);
    q.run('.1');
    expect(foe(q).mode).toBe('walk');
    // Mashing does not hold it there: one flinch per cooldown.
    const m = newSim(scene([burr(2600, 1)]));
    m.place(2500, FLOOR);
    const mash = of(m.run(Array.from({ length: 30 }, () => 'L+A1 L1').join(' ')), 'enemyAlert');
    expect(mash.length).toBeLessThanOrEqual(2);
  });

  it('too far away, nothing', () => {
    const s = newSim(scene([burr(2200, 1)]));
    s.place(1900, FLOOR);
    expect(of(s.run('J1 .50 L+A1 .20'), 'enemyAlert')).toEqual([]);
  });
});

describe('contact: Vesper can be hurt', () => {
  it('touching a burrback costs one light, throws her back and up, and makes her safe for 70 frames', () => {
    const s = newSim(scene([burr(2200)]));
    s.place(2100, FLOOR);
    expect([s.state.player.hp, s.state.player.hpMax, H.max]).toEqual([4, 4, 4]);
    let hurtAt = -1;
    let landAt = -1;
    let x0 = 0;
    frames(s, '.104', (ev, f) => {
      const p = s.state.player;
      const h = of(ev, 'hurt')[0];
      if (h) {
        expect(hurtAt).toBe(-1);
        hurtAt = f;
        x0 = p.x;
        expect(h).toMatchObject({ dir: -1, hp: 3, hpMax: 4, damage: 1, stagger: 12, invuln: 70 });
        expect(h.source).toEqual({ kind: 'burrback', id: 'b2200' });
        expect(h.y).toBe(FLOOR);
        expect([p.vx, p.vy, p.grounded, p.stagger, p.invuln, p.hurtDir, p.hurtSeq]).toEqual([
          -H.hurtVx,
          -H.hurtVy,
          false,
          12,
          70,
          -1,
          1,
        ]);
      }
      if (hurtAt >= 0 && landAt < 0 && of(ev, 'land').length) landAt = f;
      if (hurtAt >= 0) expect(p.invuln).toBe(Math.max(0, 70 - (f - hurtAt)));
    });
    expect(hurtAt).toBeGreaterThan(0);
    // A short hop back: about 55 px and 24 px up, down again 13 frames later.
    expect(landAt - hurtAt).toBe(13);
    expect(x0 - s.state.player.x).toBeGreaterThanOrEqual(50);
    expect(x0 - s.state.player.x).toBeLessThanOrEqual(64);
    expect(s.state.player.hp).toBe(3);
  });

  it('the throw is always away from it, and mirrored', () => {
    for (const side of [-1, 1] as const) {
      const s = newSim(scene([burr(2200)]), still());
      s.place(2200 + side * 40, FLOOR - 200);
      const ev = s.run('.60');
      expect(of(ev, 'hurt')[0]?.dir).toBe(side);
      expect(Math.sign(s.state.player.x + 20 - 2200)).toBe(side);
    }
  });

  it('input is ignored while she is thrown, except that a held direction shapes the tail', () => {
    const run = (script: string) => {
      const s = newSim(scene([burr(2200)]), still());
      s.place(2160, FLOOR);
      const ev = s.run(script);
      return { p: s.state.player, ev };
    };
    const base = run('.1 .9');
    // Jump, dash and attack do nothing for the first nine frames, nor does a direction.
    for (const held of ['J9', 'X9', 'A9', 'R9', 'L9', 'R+J+X+A9']) {
      const r = run(`.1 ${held}`);
      expect([r.p.x, r.p.y, r.p.vx, r.p.vy], held).toEqual([base.p.x, base.p.y, base.p.vx, base.p.vy]);
      expect(r.ev.filter((e) => ['jump', 'dashStart', 'slash'].includes(e.type))).toEqual([]);
    }
    // The last three frames of the stagger listen to left / right only.
    const a = run('.1 .12');
    const toward = run('.1 .9 R3');
    const away = run('.1 .9 L3');
    expect(toward.p.x).toBeGreaterThan(a.p.x);
    expect(away.p.x).toBeLessThan(a.p.x);
    expect(run('.1 .9 J3').p.vy).toBe(a.p.vy);
    // Then she is hers again: a jump pressed on the first free frame is a jump (the double jump).
    const j = run('.1 .12 J1 .3');
    expect(of(j.ev, 'jump')).toHaveLength(1);
  });

  it('she cannot be thrown into a solid or out of the scene', () => {
    const wall = { tag: 'ground' as const, x: 2000, y: 500, w: 100, h: 300 };
    const s = newSim(scene([burr(2200)], { solids: [wall] }), still());
    s.place(2125, FLOOR);
    s.place(2160, FLOOR);
    frames(s, '.40', () => expect(s.state.player.x).toBeGreaterThanOrEqual(2100));
    expect(s.state.player.hp).toBe(3);
    expect(s.state.player.x).toBe(2100);
    const edge = newSim(scene([burr(60, 1)]), still());
    edge.place(40, FLOOR);
    frames(edge, '.40', () => expect(edge.state.player.x).toBeGreaterThanOrEqual(0));
    expect(edge.state.player.hp).toBe(3);
  });

  it('whatever she was doing ends: slash, glide, dash and wall slide, each with its event', () => {
    const t = still();
    const s = newSim(scene([burr(2200)]), t);
    s.place(2100, FLOOR);
    const ev = s.run('R+X1 R12');
    expect(of(ev, 'hurt')).toHaveLength(1);
    expect(ev.map((e) => e.type).filter((n) => n.startsWith('dash'))).toEqual(['dashStart', 'dashEnd']);
    expect(s.state.player.mode).toBe('normal');
    // A glide down onto it.
    const g = newSim(scene([burr(2200)]), t);
    g.place(2200, FLOOR - 300);
    const gev = g.run('J200');
    const kinds = gev.map((e) => (e.type === 'glideEnd' ? `glideEnd:${e.reason}` : e.type));
    expect(kinds).toContain('glideEnd:hurt');
    expect(g.state.player.gliding).toBe(false);
    // A slash that cannot reach it (she is too high for the forward cut), falling onto it.
    const a = newSim(scene([burr(2200)]), t);
    a.place(2200, FLOOR - 60);
    const aev = a.run('U+A1 .20');
    expect(of(aev, 'slashEnd').map((e) => e.reason)).toEqual(['hurt']);
    expect([a.state.player.attack, a.state.player.attackActive, a.state.player.comboStep]).toEqual([
      'none',
      false,
      0,
    ]);
  });

  it('exclusions: while invulnerable, in the first beat of its stagger, and once it is dead', () => {
    // Invulnerable: she stands inside it for 69 more frames untouched; the 70th hurts again.
    const s = newSim(scene([burr(2200)]), still());
    s.place(2200, FLOOR - 40);
    let firstHurtFrame = -1;
    frames(s, '.30', (ev) => {
      if (of(ev, 'hurt').length) firstHurtFrame = s.state.frame - 1;
    });
    expect(firstHurtFrame).toBeGreaterThan(0);
    s.state.player.x = 2180;
    s.state.player.y = FLOOR - 80;
    s.state.player.vx = 0;
    const left = s.state.player.invuln;
    expect(of(s.run(`.${left - 1}`), 'hurt')).toEqual([]);
    expect(s.state.player.invuln).toBe(1);
    const again = of(s.run('.1'), 'hurt');
    expect(again).toHaveLength(1);
    // Hit to hit is exactly `invulnFrames`.
    expect(s.state.frame - 1 - (s.events.findIndex((e) => e.type === 'hurt') >= 0 ? firstHurtFrame : 0)).toBe(
      H.invulnFrames,
    );
    expect(s.state.player.hp).toBe(2);

    // Staggered: a cut at point-blank, then she walks into it. Safe for hitstop + 8 frames, not after.
    const d = duel(still(), 2140);
    d.run('R+A1 .1');
    expect(foe(d).mode).toBe('hurt');
    let hurtAt = -1;
    let hitAt = -1;
    const q = duel(still(), 2140);
    frames(q, 'R+A1 R40', (ev, f) => {
      if (of(ev, 'enemyHit').length) hitAt = f;
      if (of(ev, 'hurt').length && hurtAt < 0) {
        hurtAt = f;
        expect(foe(q).mode).toBe('hurt');
        expect(foe(q).modeFrames).toBeGreaterThanOrEqual(B.hurtSafeFrames);
      }
      const p = q.state.player;
      const e = foe(q);
      const touching = p.x < e.x + e.w && e.x < p.x + p.w;
      if (touching && e.mode === 'hurt' && e.modeFrames < B.hurtSafeFrames) expect(p.hp).toBe(4);
    });
    expect(hitAt).toBe(1);
    expect(hurtAt).toBeGreaterThanOrEqual(hitAt + EN.hitstopFrames + B.hurtSafeFrames);
    expect([B.hurtFrames, B.hurtSafeFrames]).toEqual([14, 8]);

    // Dead: its body is harmless from the killing blow on.
    const k = duel();
    foe(k).hp = 1;
    k.run('R+A1 R60');
    expect([foe(k).mode, foe(k).gone, k.state.player.hp]).toEqual(['dead', true, 4]);
    expect(of(k.events, 'hurt')).toEqual([]);
  });
});

describe('burrback: taking hits', () => {
  it('three hit points: cut, cut, finisher kills it; hitstop 2 / 2 / 3; it is held, shoved, staggered', () => {
    const s = duel();
    const log: string[] = [];
    const stops: number[] = [];
    const xs: number[] = [];
    frames(s, 'A1 .16 A1 .18 A1 .60', (ev, f) => {
      for (const e of ev) {
        if (e.type === 'slashHit') {
          expect(e.target).toEqual({ kind: 'burrback', id: 'b2200' });
          expect([e.x, e.y]).toEqual([foe(s).x + 26, FLOOR - 17]);
          stops.push(e.hitstop);
          expect(s.state.player.hitstop).toBe(e.hitstop);
          expect(foe(s).hitstop).toBe(e.hitstop);
          xs.push(foe(s).x);
        }
        if (e.type === 'enemyHit')
          log.push(`${f} hit p${e.power} hp${e.hpLeft}/${e.hpMax} kb${e.knockback} d${e.dir}`);
        if (e.type === 'enemyDie') log.push(`${f} die p${e.power} v${e.value} kb${e.knockback} d${e.dir}`);
        if (e.type === 'impact') log.push(`${f} impact p${e.power}`);
      }
    });
    expect(log).toEqual([
      '1 hit p1 hp2/3 kb6 d1',
      '1 impact p1',
      '20 hit p1 hp1/3 kb6 d1',
      '20 impact p1',
      '43 die p2 v6 kb11 d1',
      '43 impact p2',
    ]);
    expect(stops).toEqual([2, 2, 3]);
    // The shove: 6 px/f fading by 1 = 21 px for a cut, 66 for the finisher.
    expect((xs[1] as number) - (xs[0] as number)).toBe(21);
    expect(foe(s).x - (xs[2] as number)).toBe(66);
    const e = foe(s);
    expect([e.mode, e.hp, e.gone, e.hitDir, e.hitPower]).toEqual(['dead', 0, true, 1, 2]);
  });

  it('a hit: held for the hitstop, then 14 frames of stagger sliding to a stop, then it walks on', () => {
    const s = duel(cloneTuning(defaultTuning), 2110);
    const modes: string[] = [];
    const xs: number[] = [];
    frames(s, 'A1 .22', () => {
      modes.push(foe(s).mode);
      xs.push(foe(s).x);
    });
    // Hit on frame 1. Held on frames 1-3 (as long as she is), sliding from 4, walking again at 17.
    expect(modes.indexOf('hurt')).toBe(1);
    expect(modes.indexOf('walk', 1)).toBe(1 + EN.hitstopFrames + B.hurtFrames);
    expect(xs.slice(1, 11)).toEqual([0, 0, 0, 6, 11, 15, 18, 20, 21, 21].map((d) => (xs[1] as number) + d));
    expect(foe(s).facing).toBe(-1);
    expect(foe(s).hitFrame).toBe(1);
  });

  it('finisher first, then one cut: dead on the cut, and it spills 4 instead of 6', () => {
    const s = duel();
    // Two cuts into the air behind her, the finisher into it, then a fresh chain's first cut.
    const ev = s.run('L+A1 .16 L+A1 .18 R+A1 .26 R8 A1 .80');
    expect(of(ev, 'enemyHit').map((e) => [e.power, e.hpLeft])).toEqual([[2, 1]]);
    expect(of(ev, 'enemyDie').map((e) => [e.power, e.value, e.stagger])).toEqual([[1, 4, 5]]);
    expect(s.state.pickups.count).toBe(4);
  });

  it('pogo: a down slash bounces her off it, hurts it, and three bounces kill it without her touching it', () => {
    const s = newSim(scene([burr(2200)]), still());
    s.place(2200, FLOOR - 150);
    let bounces = 0;
    frames(s, Array.from({ length: 3 }, () => 'D+A1 .31').join(' '), (ev) => {
      for (const h of of(ev, 'slashHit')) {
        bounces++;
        expect([h.pogo, h.dir]).toEqual([true, 'down']);
        expect(s.state.player.vy).toBe(-defaultTuning.attack.pogoSpeed);
        expect([s.state.player.dj, s.state.player.airDash]).toEqual([1, 1]);
      }
    });
    expect(bounces).toBe(3);
    expect([foe(s).mode, s.state.player.hp]).toEqual(['dead', 4]);
    // From straight above the shove is sideways and half as hard.
    expect(of(s.events, 'enemyHit')[0]?.knockback).toBe(3);
  });

  it('the glints of a kill are counted exactly once, like a pod: first after 16 frames, then a stagger apart', () => {
    const s = duel();
    foe(s).hp = 2;
    const got: number[] = [];
    let die = -1;
    frames(s, 'L+A1 .16 L+A1 .18 R+A1 .200', (ev, f) => {
      if (of(ev, 'enemyDie').length) die = f;
      for (const p of of(ev, 'pickup')) {
        expect(p).toMatchObject({ id: 'b2200', kind: 'glint', value: 1, enemy: true });
        expect(p.pod).toBeUndefined();
        got.push(f - die);
      }
    });
    expect(got).toEqual([16, 19, 22, 25, 28, 31]);
    expect([s.state.pickups.count, s.state.pickups.taken]).toEqual([6, 0]);
    expect([B.value, B.valueFinisher]).toEqual([4, 6]);
  });

  it('the shove stops at walls, and at the brink of a ledge: it teeters, it never falls', () => {
    const plat = { tag: 'floating' as const, x: 2000, y: 600, w: 300, h: 48 };
    const s = newSim(scene([burr(2260, 1, 600)], { solids: [plat] }), still());
    s.place(2180, 600);
    foe(s).hp = 9;
    let teetered = false;
    frames(s, 'A1 .16 A1 .18 A1 .40', () => {
      if (foe(s).teeter === 1 && foe(s).mode === 'hurt') teetered = true;
    });
    expect(teetered).toBe(true);
    const e = foe(s);
    expect(e.y + e.h).toBe(600);
    // At most `teeterPx` of it hangs over the end.
    expect(e.x + e.w).toBe(2300 + B.teeterPx);
    expect(of(s.events, 'enemyHit')).toHaveLength(3);
    // Walking again: its leading edge is over nothing, so it turns round and comes back.
    s.tuning.burrback.speed = B.speed;
    const back = s.run('.80');
    expect(of(back, 'enemyTurn').map((x) => [x.dir, x.cause])).toEqual([[-1, 'ledge']]);
    expect([foe(s).teeter, foe(s).y + foe(s).h]).toEqual([0, 600]);
    expect(foe(s).x + foe(s).w).toBeLessThan(2300);

    const wall = { tag: 'ground' as const, x: 2240, y: 600, w: 100, h: 200 };
    const b = newSim(scene([burr(2200, 1)], { solids: [wall] }), still());
    b.place(2120, FLOOR);
    foe(b).hp = 9;
    b.run('A1 .16 A1 .18 A1 .40');
    expect(foe(b).x + foe(b).w).toBe(2240);
  });

  it('a slash does not reach through solid ground, but does through a one-way branch', () => {
    const plat = { tag: 'floating' as const, x: 2000, y: 640, w: 400, h: 48 };
    const under = newSim(scene([burr(2200, 1, 640)], { solids: [plat] }), still());
    under.place(2200, FLOOR);
    // Standing under it the up slash's area (124 above her centre) covers the creature...
    expect(FLOOR - 40 - defaultTuning.slash1.upReach).toBeLessThan(640);
    const ev = under.run('U+A1 .16 U+A1 .18 U+A1 .30');
    expect(of(ev, 'slash')).toHaveLength(3);
    expect(of(ev, 'slashHit')).toEqual([]);
    expect(foe(under).hp).toBe(3);
    // ...and from above, through the platform, a down slash does nothing to one walking below.
    const over = newSim(scene([burr(2200, 1)], { solids: [{ ...plat, y: 700 }] }), still());
    over.place(2200, 700);
    over.run('J1 .6 D+A1 .30');
    expect(foe(over).hp).toBe(3);
    const branch = newSim(
      scene([burr(2200, 1, 640)], { oneWays: [{ tag: 'branch', x: 2000, y: 640, w: 400 }] }),
      still(),
    );
    branch.place(2200, FLOOR);
    expect(of(branch.run('U+A1 .16'), 'slashHit')).toHaveLength(1);
    expect(foe(branch).hp).toBe(2);
  });

  it('she can simply jump over one: it never blocks the way', () => {
    for (const dir of ['R', 'L'] as const) {
      const s = newSim(scene([burr(2200, dir === 'R' ? -1 : 1)]));
      s.place(dir === 'R' ? 1900 : 2500, FLOOR);
      s.run(`${dir}16 ${dir}+J24 ${dir}40`);
      expect(s.state.player.hp).toBe(4);
      expect(dir === 'R' ? feet(s).x > 2300 : feet(s).x < 2100).toBe(true);
    }
  });
});

describe('fade and re-form', () => {
  const POOL = { tag: 'pool' as const, x: 2600, y: 760, w: 300, h: 40 };

  it('the fourth hit: she fades for 50 frames out of control, then re-forms whole on the last safe ground', () => {
    const s = newSim(scene([burr(2600)], {}, [{ id: 'pod', x: 1700, y: FLOOR - 22, mount: 'sit' }]));
    // Safe ground is made here: 30 frames standing, far from it. Then a pod, for something to keep.
    s.place(1790, FLOOR);
    s.run('L+A1 .60');
    expect(s.state.pods.hp[0]).toBe(0);
    const count = s.state.pickups.count;
    expect(count).toBe(3);
    s.run('R20');
    expect([s.state.player.safeX, s.state.player.safeY]).toEqual([feet(s).x, FLOOR]);
    s.state.player.hp = 1;
    const ev: SimEvent[] = [];
    let fadeAt = -1;
    let reformAt = -1;
    let lay = 0;
    let safe = { x: 0, y: 0 };
    frames(s, 'R+A260', (e, f) => {
      ev.push(...e);
      const p = s.state.player;
      if (of(e, 'fade').length) {
        fadeAt = f;
        safe = { x: p.safeX, y: p.safeY };
      }
      if (of(e, 'reform').length) reformAt = f;
      if (fadeAt >= 0 && reformAt < 0) {
        expect([p.hp, p.invuln]).toEqual([0, 0]);
        expect(p.faded).toBe(H.fadeFrames - (f - fadeAt));
        expect([p.attack, p.mode, p.gliding]).toEqual(['none', 'normal', false]);
        if (f > fadeAt) expect(p.inputX).toBe(0);
        if (p.grounded) lay++;
      }
    });
    expect(fadeAt).toBeGreaterThan(0);
    expect(reformAt - fadeAt).toBe(H.fadeFrames);
    expect(lay).toBeGreaterThan(20);
    const types = ev.map((e) => e.type).filter((t) => ['hurt', 'fade', 'reform', 'spawn'].includes(t));
    expect(types).toEqual(['hurt', 'fade', 'reform', 'spawn']);
    expect(of(ev, 'hurt')[0]).toMatchObject({ hp: 0, stagger: 12, invuln: 0 });
    const r = of(ev, 'reform')[0];
    expect(r).toMatchObject({ x: safe.x, y: safe.y, hp: 4, hpMax: 4, invuln: H.reformInvulnFrames });
    // The safe spot stopped following her 200 px short of the creature (and of where it starts).
    expect(safe.y).toBe(FLOOR);
    expect(safe.x).toBeGreaterThan(1900);
    expect(safe.x).toBeLessThan(2600 - H.safeEnemyPx + 10);
    expect((r?.fromX ?? 0) - safe.x).toBeGreaterThan(50);
    // No jump, dash or slash came out of the held buttons while she lay there.
    const after = ev.slice(
      ev.findIndex((e) => e.type === 'fade'),
      ev.findIndex((e) => e.type === 'reform'),
    );
    expect(after.filter((e) => ['jump', 'slash', 'dashStart', 'glideStart'].includes(e.type))).toEqual([]);
    // Kept: glints and the open pod. Reset: the living enemy, back at its start and whole.
    expect(s.state.pickups.count).toBe(count);
    expect(s.state.pods.hp[0]).toBe(0);
    expect(s.state.player.hp).toBe(4);
    expect(s.state.player.facing).toBe(1);
  });

  it('living enemies go home whole, dead ones stay dead', () => {
    const s = newSim(scene([burr(2200), burr(3000, 1)]), still());
    s.place(2110, FLOOR);
    foe(s, 0).hp = 1;
    s.run('A1 .60');
    expect(foe(s, 0).gone).toBe(true);
    foe(s, 1).hp = 1;
    foe(s, 1).x = 3300;
    s.state.player.hp = 1;
    s.place(3320, FLOOR);
    const ev = s.run('.80');
    expect(of(ev, 'reform')).toHaveLength(1);
    expect([foe(s, 0).mode, foe(s, 0).gone]).toEqual(['dead', true]);
    expect([foe(s, 1).x, foe(s, 1).hp, foe(s, 1).mode, foe(s, 1).facing]).toEqual([3000 - 26, 3, 'walk', 1]);
  });

  it('safe ground: 30 frames in a row on a solid; not the pool, not a branch, not near a living enemy', () => {
    const sc = scene([burr(3600, 1)], {
      solids: [
        POOL,
        { tag: 'ground', x: 3500, y: 700, w: 60, h: 100 },
        { tag: 'ground', x: 3900, y: 700, w: 100, h: 100 },
      ],
      oneWays: [{ tag: 'branch', x: 1400, y: 600, w: 300 }],
    });
    const s = newSim(sc, still());
    const safe = () => [s.state.player.safeX, s.state.player.safeY];
    expect(safe()).toEqual([2000, FLOOR]);
    // 29 frames is not enough; the 30th makes it, and from then on it follows her along the ground.
    s.place(2300, FLOOR);
    s.run('.28');
    expect(safe()).toEqual([2000, FLOOR]);
    s.run('.2');
    expect(safe()).toEqual([2300, FLOOR]);
    s.run('R10');
    expect(safe()).toEqual([feet(s).x, FLOOR]);
    // A jump breaks the count: the spot she left stays.
    const left = feet(s).x;
    s.run('R+J20');
    expect(safe()[0]).toBeGreaterThanOrEqual(left);
    expect(safe()[0]).toBeLessThan(feet(s).x);
    const kept = safe();
    // The pool and a branch never count, however long she stands there.
    s.place(2750, 760);
    s.run('.90');
    expect(s.state.player.grounded).toBe(true);
    expect(safe()).toEqual(kept);
    s.place(1500, 600);
    s.run('.90');
    expect(s.state.player.grounded).toBe(true);
    expect(safe()).toEqual(kept);
    // Within 200 px of a living enemy (or of where it starts): no.
    s.place(3600, 700 - 300);
    s.state.player.invuln = 500;
    s.place(3750, FLOOR);
    s.state.player.invuln = 500;
    s.run('.90');
    expect(safe()).toEqual(kept);
    s.place(3400, FLOOR);
    s.run('.40');
    expect(safe()).toEqual([3400, FLOOR]);
  });

  it('falls back to the scene spawn when the safe spot would be next to an enemy going home', () => {
    const s = newSim(scene([burr(2800, 1)]), still());
    // The enemy has been shoved far from its start; she rests where it started.
    foe(s).x = 3500;
    s.place(2800, FLOOR);
    s.state.player.safeX = 2800;
    s.state.player.safeFrames = 0;
    s.state.player.hp = 1;
    s.place(3520, FLOOR);
    s.state.player.safeX = 2800;
    const ev = s.run('.80');
    expect(of(ev, 'reform')[0]).toMatchObject({ x: 2000, y: FLOOR });
    expect(feet(s)).toEqual({ x: 2000, y: FLOOR });
  });

  it('after re-forming she is safe for 90 frames, passes through enemies, and play goes on', () => {
    const s = newSim(scene([burr(2200)]), still());
    s.state.player.hp = 1;
    s.place(2160, FLOOR);
    s.state.player.attackSeq = 7;
    s.run('.52');
    expect(of(s.events, 'reform')).toHaveLength(1);
    // The slash counter is not reset (a target remembers the last slash that hit it by number).
    expect(s.state.player.attackSeq).toBe(7);
    expect([s.state.player.hp, s.state.player.invuln]).toEqual([4, H.reformInvulnFrames - 2]);
    // Straight through it while the safety lasts.
    s.place(2100, FLOOR);
    s.state.player.invuln = 60;
    s.run('R30');
    expect(feet(s).x).toBeGreaterThan(2300);
    expect(s.state.player.hp).toBe(4);
    // And she can fight.
    s.place(2290, FLOOR);
    s.run('L+A1 .16 L+A1 .18 L+A1 .40');
    expect(foe(s).mode).toBe('dead');
  });
});

describe('enemies: determinism, symmetry, restart', () => {
  const script =
    'R20 A1 R16 A1 .12 R+J20 R10 D+A1 .20 L30 L+A1 .16 A1 .17 A1 R60 R+X1 R20 .40 L+J30 L40 .100 R200 A1 .16 A1 .18 A1 .90';

  it('the same inputs give the same state hash; a clone hashes the same', () => {
    const sc = scene([burr(2300), burr(1500, 1), burr(2900, 1)]);
    const a = newSim(sc);
    const b = newSim(sc);
    a.run(script);
    b.run(script);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(hashState(cloneState(a.state))).toBe(hashState(a.state));
    expect(cloneState(a.state).enemies[0]).not.toBe(a.state.enemies[0]);
    expect(of(a.events, 'hurt').length + of(a.events, 'enemyHit').length).toBeGreaterThan(2);
    expect(a.state.version).toBe(12);
  });

  it('mirror symmetry: a mirrored scene and mirrored inputs give exactly the mirrored fight', () => {
    const W = 4000;
    const a = newSim(scene([burr(2300, -1, FLOOR, 'x'), burr(1500, 1, FLOOR, 'y')]));
    const b = newSim(scene([burr(W - 2300, 1, FLOOR, 'x'), burr(W - 1500, -1, FLOOR, 'y')]));
    const flip = script.replace(/[LR]/g, (c) => (c === 'L' ? 'R' : 'L'));
    const ma = parseInputScript(script);
    const mb = parseInputScript(flip);
    for (let i = 0; i < ma.length; i++) {
      step(a.state, ma[i] as number, a.tuning, a.scene, a.events);
      step(b.state, mb[i] as number, b.tuning, b.scene, b.events);
      const p = a.state.player;
      const q = b.state.player;
      expect([q.x, q.y, q.hp, q.stagger, q.facing], `frame ${i}`).toEqual([
        W - p.x - p.w,
        p.y,
        p.hp,
        p.stagger,
        -p.facing,
      ]);
      for (let k = 0; k < 2; k++) {
        const e = foe(a, k);
        const m = foe(b, k);
        expect([m.x, m.mode, m.hp, m.facing, m.timer], `frame ${i} enemy ${k}`).toEqual([
          W - e.x - e.w,
          e.mode,
          e.hp,
          -e.facing,
          e.timer,
        ]);
      }
    }
    expect(a.state.player.hp).toBeLessThan(4);
  });

  it('a restart brings every enemy back; a teleport keeps them, and her health', () => {
    const s = duel();
    foe(s).hp = 1;
    s.run('A1 .60');
    s.state.player.hp = 2;
    s.place(1000, FLOOR);
    expect([s.state.player.hp, foe(s).mode]).toEqual([2, 'dead']);
    const fresh = createState(1, s.tuning, s.scene);
    expect(fresh.enemies.map((e) => [e.mode, e.hp, e.x, e.gone])).toEqual([['walk', 3, 2174, false]]);
    expect(fresh.player.hp).toBe(4);
  });

  it('with no enemies in the scene nothing changes: no enemy state, no health events', () => {
    const s = newSim(flatScene());
    const ev = s.run(script);
    expect(s.state.enemies).toEqual([]);
    expect(ev.filter((e) => e.type === 'hurt' || e.type.startsWith('enemy'))).toEqual([]);
    expect([s.state.player.hp, s.state.player.invuln, s.state.player.stagger]).toEqual([4, 0, 0]);
  });
});

describe('enemies in the grove', () => {
  // The burrbacks (they come first in the scene's list; the lampwings have lampwing.test.ts).
  const list = (GROVE.enemies ?? []).filter((e) => e.kind === 'burrback');

  it('six burrbacks, validated: on a surface, clear of solids, unique, away from the spawn', () => {
    expect(list.map((e) => e.id)).toEqual([
      'burr-bank',
      'burr-path',
      'burr-rise',
      'burr-ledge',
      'burr-root',
      'burr-far',
    ]);
    for (const e of list) {
      const d = Math.hypot(e.x - GROVE.spawn.x, e.y - GROVE.spawn.y);
      expect(d, e.id).toBeGreaterThan(300);
    }
    // One in each third of the scene; none on the spawn ground or on the pogo row's rise.
    for (const [a, b] of [
      [0, 1920],
      [1920, 3840],
      [3840, 5760],
    ])
      expect(list.some((e) => e.x >= (a as number) && e.x < (b as number))).toBe(true);
    expect(list.some((e) => e.y === 1280 && e.x > 384 && e.x < 1536)).toBe(false);
    expect(list.some((e) => e.y === 1088 && e.x > 4608)).toBe(false);
    const bad = (enemies: unknown[]) => () => parseScene({ ...GROVE, enemies });
    expect(bad([{ ...list[0], id: 'pod-f2' }])).toThrow(/called/);
    expect(bad([{ ...list[0], y: 1000 }])).toThrow(/surface/);
    expect(bad([{ ...list[0], x: 370 }])).toThrow(/surface/);
    expect(bad([{ ...list[1], y: 1300 }])).toThrow(/inside a solid/);
    expect(bad([{ ...list[1], x: 1300 }])).toThrow(/spawn/);
    expect(bad([{ ...list[0], kind: 'dragon' }])).toThrow();
    expect(bad([{ ...list[0], facing: 0 }])).toThrow();
  });

  it('each stays on its own surface for a minute, and none ever comes near the spawn or the pogo row', () => {
    const s = newSim();
    s.state.player.invuln = 1e6;
    const lo = list.map(() => 9e9);
    const hi = list.map(() => -9e9);
    for (let f = 0; f < 3600; f++) {
      step(s.state, 0, s.tuning, s.scene, s.events);
      s.state.enemies.slice(0, list.length).forEach((e, i) => {
        lo[i] = Math.min(lo[i] as number, e.x);
        hi[i] = Math.max(hi[i] as number, e.x + e.w);
        expect(e.y + e.h).toBe(list[i]?.y);
      });
    }
    expect(lo.map((a, i) => [list[i]?.id, a, hi[i]])).toEqual([
      ['burr-bank', 0, 384],
      ['burr-path', 1856, 2560],
      ['burr-rise', 2560, 3200],
      ['burr-ledge', 2816, 3328],
      ['burr-root', 4160, 4608],
      ['burr-far', 5472, 5760],
    ]);
  });
});
