import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import type { EnemySpawn, Scene } from '../../src/sim/scene';
import type { EnemyState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim } from './helpers';

/**
 * Burrbacks and edges (memory/enemies.md): they keep off the lips she arrives over, back away
 * from an edge she is under, and one touch is one hit (it recoils and turns away).
 */
const FLOOR = 800;
const B = defaultTuning.burrback;
const H = defaultTuning.health;
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) =>
  ev.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const burr = (x: number, facing: -1 | 1 = -1, y = FLOOR, id = `b${x}`): EnemySpawn => ({
  id,
  kind: 'burrback',
  x,
  y,
  facing,
});
const scene = (enemies: EnemySpawn[], solids: Scene['solids'] = []): Scene => ({
  ...flatScene({ solids }),
  enemies,
});
const foe = (s: Sim, i = 0) => s.state.enemies[i] as EnemyState;
/** Steps n frames with no input; calls `each` after every one. */
function watch(s: Sim, n: number, each: (ev: SimEvent[], f: number) => void): void {
  for (let f = 0; f < n; f++) {
    const from = s.events.length;
    step(s.state, 0, s.tuning, s.scene, s.events);
    each(s.events.slice(from), f);
  }
}
/** A platform 600 wide at y 600 (x 1000-1600), its left end against a wall, its right end a drop. */
const plat = { tag: 'floating' as const, x: 1000, y: 600, w: 600, h: 48 };
const wall = { tag: 'ground' as const, x: 900, y: 400, w: 100, h: 248 };

describe('burrback: lips', () => {
  it('turns 96 px short of a drop, but walks right up to a wall', () => {
    const s = newSim(scene([burr(1300, 1, 600)], [plat, wall]));
    s.place(3000, FLOOR);
    let lo = 9e9;
    let hi = -9e9;
    const causes: string[] = [];
    watch(s, 3000, (ev) => {
      lo = Math.min(lo, foe(s).x);
      hi = Math.max(hi, foe(s).x + foe(s).w);
      for (const t of of(ev, 'enemyTurn')) causes.push(t.cause);
    });
    expect([lo, hi]).toEqual([1000, 1600 - B.lipClear]);
    expect(new Set(causes)).toEqual(new Set(['wall', 'ledge']));
  });

  it('a short platform keeps at least `minPatrol` of walk: the clearance shrinks, evenly', () => {
    // 200 wide, both ends drops: 200 - 52 - 48 = 100 to share: 50 px each end.
    const small = { tag: 'floating' as const, x: 2000, y: 600, w: 200, h: 48 };
    const s = newSim(scene([burr(2100, 1, 600)], [small]));
    s.place(3000, FLOOR);
    let lo = 9e9;
    let hi = -9e9;
    watch(s, 1500, () => {
      lo = Math.min(lo, foe(s).x);
      hi = Math.max(hi, foe(s).x + foe(s).w);
    });
    expect([lo, hi]).toEqual([2050, 2150]);
    // Too short even for that: it still never leaves it.
    const tiny = { tag: 'floating' as const, x: 2000, y: 600, w: 80, h: 48 };
    const t = newSim(scene([burr(2040, 1, 600)], [tiny]));
    t.place(3000, FLOOR);
    watch(t, 600, () => {
      expect(foe(t).x).toBeGreaterThanOrEqual(2000);
      expect(foe(t).x + foe(t).w).toBeLessThanOrEqual(2080);
    });
  });

  it('never rests within 120 px of a lip (a turn-round at 96 is its only stop there)', () => {
    const s = newSim(scene([burr(1300, 1, 600)], [plat, wall]));
    s.place(3000, FLOOR);
    let rests = 0;
    watch(s, 20000, () => {
      const e = foe(s);
      if (e.mode !== 'pause' || e.turning) return;
      rests++;
      expect(1600 - (e.x + e.w)).toBeGreaterThanOrEqual(B.restLipClear);
    });
    expect(rests).toBeGreaterThan(100);
  });

  it('shoved past its turning point (to the brink), it comes back in', () => {
    const s = newSim(scene([burr(1470, 1, 600)], [plat, wall]));
    s.place(1380, 600);
    foe(s).hp = 9;
    s.run('R+A1 .16 A1 .18 A1 .20');
    expect(foe(s).x + foe(s).w).toBeGreaterThan(1600 - B.lipClear);
    s.place(3000, FLOOR);
    s.run('.200');
    expect(foe(s).x + foe(s).w).toBeLessThanOrEqual(1600 - B.lipClear);
  });
});

describe('burrback: wary of an edge she is under', () => {
  it('she is below the lip, within 200 px of it: it turns its back on that edge (cause `wary`) and keeps away', () => {
    const s = newSim(scene([burr(1300, 1, 600)], [plat, wall]));
    // On the floor under the right end of the platform.
    s.place(1650, FLOOR);
    let hi = -9e9;
    const turns: string[] = [];
    watch(s, 2000, (ev) => {
      hi = Math.max(hi, foe(s).x + foe(s).w);
      for (const t of of(ev, 'enemyTurn')) turns.push(`${t.cause}:${t.dir}`);
    });
    // It never comes within `waryReachPx` of that lip again (it started 248 px from it, walking at it).
    expect(turns[0]).toBe('wary:-1');
    expect(hi).toBeLessThanOrEqual(1600 - 248 + 2);
    expect(turns.filter((t) => t === 'wary:-1').length).toBeGreaterThan(2);
    // Not under it (level with it, or far along): it patrols as ever.
    for (const [x, y] of [
      [1650 + B.waryPx + 60, FLOOR],
      [1400, 600],
    ] as const) {
      const n = newSim(scene([burr(1300, 1, 600)], [plat, wall]));
      n.place(x, y);
      n.state.player.invuln = 1e6;
      let far = -9e9;
      watch(n, 600, () => {
        far = Math.max(far, foe(n).x + foe(n).w);
      });
      expect(far, `${x},${y}`).toBe(1600 - B.lipClear);
    }
  });

  it('with nowhere to back away to (a wall behind it, or her under both ends) it stands; it never flip-flops', () => {
    // A ledge against the scene's right edge: lip on the left, wall on the right.
    const ledge = { tag: 'ledge' as const, x: 3700, y: 600, w: 300, h: 48 };
    const s = newSim(scene([burr(3900, -1, 600)], [ledge]));
    s.place(3650, FLOOR);
    let lo = 9e9;
    let turns = 0;
    watch(s, 1200, (ev) => {
      lo = Math.min(lo, foe(s).x);
      turns += of(ev, 'enemyTurn').length;
    });
    // One turn away from the lip, then it waits at the wall.
    expect(turns).toBeLessThanOrEqual(2);
    expect(foe(s).x + foe(s).w).toBe(4000);
    expect(lo).toBeGreaterThanOrEqual(3874 - 4);
    // She leaves: it patrols again.
    s.place(2000, FLOOR);
    watch(s, 400, () => {
      lo = Math.min(lo, foe(s).x);
    });
    expect(lo).toBe(3700 + B.lipClear);
  });
});

describe('burrback: its touch is one hit', () => {
  it('it is shoved back ~40 px, flinches 30 frames and turns away from her', () => {
    const t = cloneTuning(defaultTuning);
    const s = newSim(scene([burr(2200, -1)]), t);
    s.place(2120, FLOOR);
    const ev: SimEvent[] = [];
    let hurtAt = -1;
    let x0 = 0;
    let x1 = 0;
    watch(s, 60, (e, f) => {
      ev.push(...e);
      if (of(e, 'hurt').length) {
        hurtAt = f;
        x0 = foe(s).x;
      }
      // The last frame of the flinch: the shove has long played out, it has not walked yet.
      if (hurtAt >= 0 && f === hurtAt + B.touchFlinchFrames - 1) {
        x1 = foe(s).x;
        expect(foe(s).mode).toBe('alert');
      }
    });
    expect(hurtAt).toBeGreaterThan(0);
    const flinch = of(ev, 'enemyAlert')[0];
    expect(flinch).toMatchObject({ cause: 'touch', frames: B.touchFlinchFrames, facing: 1, dir: -1 });
    expect(ev.indexOf(flinch as SimEvent)).toBe(ev.findIndex((e) => e.type === 'hurt') + 1);
    // 8.5 + 7.5 + ... + 0.5 px.
    expect(x1 - x0).toBeGreaterThanOrEqual(38);
    expect(x1 - x0).toBeLessThanOrEqual(44);
    expect(foe(s).facing).toBe(1);
  });

  it('standing still where it hit her: no second hit until its patrol brings it round again', () => {
    const s = newSim(scene([burr(2200, -1)]));
    s.place(2100, FLOOR);
    const hits: number[] = [];
    watch(s, 900, (e, f) => {
      if (of(e, 'hurt').length) hits.push(f);
    });
    expect(hits).toHaveLength(1);
    expect(s.state.player.hp).toBe(H.max - 1);
    // (Before: a hit every 70 frames, the moment her safety ran out, until she faded.)
    // In the grove, in the middle of burr-path's patrol: one hit a round, hundreds of frames apart.
    const g = newSim();
    g.place(2190, 1280);
    const at: number[] = [];
    watch(g, 800, (e, f) => {
      if (of(e, 'hurt').length) at.push(f);
    });
    // (Its patrol is 312 px now, clear of the bluff's foot: a round is shorter.)
    expect(at.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < at.length; i++)
      expect((at[i] as number) - (at[i - 1] as number)).toBeGreaterThan(180);
  });

  it('the recoil stops at walls and at the brink of a ledge', () => {
    const s = newSim(scene([burr(1540, -1, 600)], [plat, wall]));
    s.place(1500, 600);
    s.run('.40');
    expect(of(s.events, 'hurt')).toHaveLength(1);
    expect(foe(s).x + foe(s).w).toBeLessThanOrEqual(1600 + B.teeterPx);
    expect(foe(s).y + foe(s).h).toBe(600);
  });
});

describe('the grove: no burrback waits where she lands', () => {
  // Where a required jump comes down, by surface: x range and the top it is on.
  const LANDINGS: Array<[string, number, number, number]> = [
    ['out of the pool to the right (x 1856)', 1856, 1952, 1280],
    ['the foot of the bluff, where a walk off its east lip comes down (x 2624)', 2624, 2880, 1152],
    ['the terrace, all of it: every way off the bluff comes down somewhere on it', 2624, 3072, 1152],
    ["the well at trunk A's foot and the shaft floor", 3072, 3744, 1280],
    ['onto the left bank (x 384)', 288, 384, 1088],
    ['onto the high ledge from F5 (x 2816)', 2816, 2912, 448],
    [
      'the far ledge, all of it: the jump from F7 and the summit glide come down anywhere on it',
      5472,
      5760,
      448,
    ],
  ];

  it('over five minutes, with her standing under each lip in turn, no burrback box enters a landing spot', () => {
    for (const under of [undefined, [1800, 1408], [2500, 1280], [450, 1280], [5300, 592]] as const) {
      const s = newSim();
      if (under) s.place(under[0], under[1]);
      s.state.player.invuln = 1e9;
      for (let f = 0; f < 3600; f++) {
        step(s.state, 0, s.tuning, s.scene, s.events);
        for (const e of s.state.enemies) {
          if (e.kind !== 'burrback') continue;
          for (const [name, x0, x1, top] of LANDINGS) {
            if (e.y + e.h !== top) continue;
            expect(e.x >= x1 || e.x + e.w <= x0, `${e.id} at ${e.x} in "${name}" (frame ${f})`).toBe(true);
          }
        }
      }
    }
  });

  it('the pool has no burrback on its left side at all, and every burrback starts inside its patrol', () => {
    const list = (GROVE.enemies ?? []).filter((e) => e.kind === 'burrback');
    expect(list.some((e) => e.y === 1280 && e.x > 384 && e.x < 1536)).toBe(false);
    const s = newSim();
    step(s.state, 0, s.tuning, s.scene, s.events);
    expect(of(s.events, 'enemyTurn')).toHaveLength(0);
    expect(feet(s)).toEqual(GROVE.spawn);
  });
});
