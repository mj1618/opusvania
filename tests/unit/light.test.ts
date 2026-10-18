/**
 * Lanternroot's light rules (src/sim/light.ts, memory/glow.md, docs/design/levels/proto-1.md §3 and §5): glow,
 * mend, kindle and moonwicks, wick sets, moonmoss, silver light's shy flyers, gust, heartwood, bells, glow pods
 * and respawning creatures. Flat scenes; the rooms' own proofs are in tests/unit/proto-1-solve.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/events';
import { createState, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { EnemySpawn, Lure, Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { createLocal, withShortcuts } from '../../src/sim/world';

const FLOOR = 800;
const T = defaultTuning;
const B = ActionBit.lamp;
const R = ActionBit.right;
const L = ActionBit.left;
const D = ActionBit.down;
const J = ActionBit.jump;
const A = ActionBit.attack;

function scene(extra: Partial<Scene> = {}): Scene {
  return {
    id: 'lr-test',
    width: 4000,
    height: 1000,
    spawn: { x: 1000, y: FLOOR },
    senses: 'lamp',
    glow: true,
    oneWays: [],
    ...extra,
    solids: [{ tag: 'ground', x: 0, y: FLOOR, w: 4000, h: 200 }, ...(extra.solids ?? [])],
  } as Scene;
}

const wick = (id: string, x: number, y: number, more: Partial<Lure> = {}): Lure => ({
  id,
  kind: 'moonwick',
  x,
  y,
  ...more,
});

function sim(sc: Scene) {
  const t = cloneTuning(defaultTuning);
  const events: SimEvent[] = [];
  const state = createState(1, t, sc, events);
  const run = (mask: number, n = 1): SimEvent[] => {
    const from = events.length;
    for (let i = 0; i < n; i++) step(state, mask, t, sc, events);
    return events.slice(from);
  };
  const place = (x: number, y: number) => placePlayer(state, x, y, t, sc, events);
  return { state, t, events, run, place, scene: sc };
}
const of = <K extends SimEvent['type']>(ev: SimEvent[], type: K) =>
  ev.filter((e) => e.type === type) as Extract<SimEvent, { type: K }>[];

describe('glow', () => {
  it('a hit pays a pip, a kill a pip more; a glint a spark (saved as taken); all of it is capped at the max', () => {
    const s = sim(
      scene({
        enemies: [{ id: 'j', kind: 'juvenileBurrback', x: 1090, y: FLOOR, facing: -1, hp: 2 }],
        pickups: [{ id: 'g1', kind: 'glint', x: 700, y: FLOOR - 40 }],
        // (A wall at its back: the blow's shove cannot carry it out of reach.)
        solids: [{ tag: 'trunk', x: 1120, y: FLOOR - 200, w: 64, h: 200 }],
      }),
    );
    s.state.player.facing = 1;
    const ev = s.run(A, 1).concat(s.run(0, 24), s.run(A, 1), s.run(0, 30));
    const gains = of(ev, 'glowGain');
    expect(gains.filter((g) => g.from === 'hit').reduce((n, g) => n + g.n, 0)).toBe(2 * T.glow.hit);
    expect(gains.filter((g) => g.from === 'kill').reduce((n, g) => n + g.n, 0)).toBe(T.glow.kill);
    expect(s.state.player.glow).toBe(3 * T.glow.pip);
    s.run(L, 40);
    s.run(0, 30);
    expect(s.state.player.glow).toBe(3 * T.glow.pip + 1);
    expect(s.state.save.taken).toContain('lr-test:g1');
    s.state.player.glow = T.glow.max - 1;
    const local = createLocal(s.scene, s.t, s.state.save, false);
    expect(local.pickups.timers[0]).toBe(-1);
  });

  it('a fade leaves all of it where she lay; walking back brings it home as glow, not into the wallet', () => {
    const s = sim(scene());
    s.state.player.glow = 12;
    s.state.player.hp = 0;
    s.state.player.faded = 1;
    const ev = s.run(0, 1);
    expect(of(ev, 'glintsDrop')[0]?.value).toBe(12);
    expect(s.state.player.glow).toBe(0);
    const drop = s.state.pickups.drops[0];
    expect(drop?.glow).toBe(true);
    s.place(drop?.x ?? 0, FLOOR);
    s.run(0, 120);
    expect(s.state.player.glow).toBe(12);
    expect(s.state.pickups.count).toBe(0);
  });
});

describe('mend', () => {
  it('Lamp held, grounded and still, nothing in reach: one light for its cost when the channel lands', () => {
    const s = sim(scene());
    s.state.player.glow = 12;
    s.state.player.hp = 2;
    const ev = s.run(B, T.glow.mendFrames + 2);
    expect(of(ev, 'mendStart')).toHaveLength(1);
    expect(of(ev, 'mend')).toHaveLength(1);
    expect(s.state.player.hp).toBe(3);
    expect(s.state.player.glow).toBe(12 - T.glow.mendCost);
    // Held on, it mends again; full, it stops.
    s.run(B, T.glow.mendFrames + 2);
    expect(s.state.player.hp).toBe(4);
    expect(s.state.player.glow).toBe(0);
  });

  it('any other input breaks it and nothing is spent; a tap is not a mend', () => {
    const s = sim(scene());
    s.state.player.glow = 6;
    s.state.player.hp = 2;
    s.run(B, 20);
    const ev = s.run(B | R, 30);
    expect(of(ev, 'mendBreak')[0]?.why).toBe('input');
    expect(s.state.player.glow).toBe(6);
    expect(s.state.player.hp).toBe(2);
  });
});

describe('moonwicks', () => {
  it('cold until kindled; a kindle costs glow and burns 12 s, the last 2 a gutter, then it goes cold', () => {
    const s = sim(scene({ lures: [wick('m', 1000, FLOOR - 60)] }));
    expect(s.state.lures.hp[0]).toBe(0);
    s.state.player.glow = 6;
    const ev = s.run(B, 1);
    expect(of(ev, 'lureKindle')[0]?.burn).toBe(T.moonwick.burn);
    expect(s.state.player.glow).toBe(0);
    expect(s.state.lures.hp[0]).toBe(1);
    const burn = s.run(0, T.moonwick.burn + 2);
    expect(of(burn, 'lureGutter')).toHaveLength(1);
    expect(of(burn, 'lureCold')).toHaveLength(1);
    expect(s.state.lures.hp[0]).toBe(0);
  });

  it('too little glow: the bud refuses (one flicker), nothing else', () => {
    const s = sim(scene({ lures: [wick('m', 1000, FLOOR - 60)] }));
    s.state.player.glow = 5;
    const ev = s.run(B, 1);
    expect(of(ev, 'kindleRefuse')).toHaveLength(1);
    expect(s.state.lures.hp[0]).toBe(0);
    expect(s.state.player.glow).toBe(5);
  });

  it('without Kindle a cold bud is nothing to the Lamp button', () => {
    const sc = scene({
      lures: [wick('m', 1000, FLOOR - 60)],
      abilities: ['glide', 'wallJump', 'doubleJump'],
    });
    const s = sim(sc);
    s.state.player.glow = 6;
    const ev = s.run(B, 1);
    expect(of(ev, 'lureKindle')).toHaveLength(0);
    expect(of(ev, 'kindleRefuse')).toHaveLength(0);
  });

  it('a burning one is a fling anchor that never embers: it burns on behind her', () => {
    const s = sim(scene({ lures: [wick('m', 1000, FLOOR - 60)] }));
    s.state.player.glow = 6;
    s.run(B, 1);
    s.run(0, 10);
    // In the air by it: the fling.
    s.run(J, 6);
    const ev = s.run(ActionBit.up | R | B, 1).concat(s.run(ActionBit.up | R | B, 3), s.run(R, 60));
    expect(of(ev, 'fling')).toHaveLength(1);
    expect(of(ev, 'lureEmber')).toHaveLength(0);
    expect(s.state.lures.hp[0]).toBe(1);
  });

  it('the blade passes through it, and its silver light shows her to no lamp-sighted creature', () => {
    const s = sim(scene({ lures: [wick('m', 1040, FLOOR - 50)] }));
    s.state.player.glow = 6;
    s.run(B, 1);
    s.state.player.facing = 1;
    const ev = s.run(A, 1).concat(s.run(0, 20));
    expect(of(ev, 'slashHit')).toHaveLength(0);
    expect(s.state.lures.hp[0]).toBe(1);
    s.run(0, 1);
    expect(s.state.player.lit).toBe(0);
    expect(s.state.player.moonlit).toBeGreaterThan(0);
  });

  it('a keep wick burns for good (saved); a set that burns whole sets its flag and keeps its wicks', () => {
    const sc = scene({
      lures: [
        wick('k', 1000, FLOOR - 60, { keep: true }),
        wick('a', 1600, FLOOR - 60),
        wick('b', 2200, FLOOR - 60),
      ],
      wickSets: [{ id: 'ab', wicks: ['a', 'b'], sets: 'ab-lit' }],
    });
    const s = sim(sc);
    s.state.player.glow = 18;
    s.run(B, 1);
    expect(s.state.lures.burn[0]).toBe(-1);
    expect(s.state.save.opened).toContain('lr-test:k');
    s.run(0, 1);
    s.place(1600, FLOOR);
    s.run(B, 1);
    s.run(0, 1);
    s.place(2200, FLOOR);
    const ev = s.run(B, 1);
    expect(of(ev, 'wickSet')[0]?.flag).toBe('ab-lit');
    expect(s.state.save.flags).toContain('ab-lit');
    s.run(0, T.moonwick.burn + 10);
    expect(s.state.lures.hp.slice()).toEqual([1, 1, 1]);
    const local = createLocal(sc, s.t, s.state.save, false);
    expect(local.lures.hp.slice()).toEqual([1, 1, 1]);
  });
});

describe('moonmoss', () => {
  it('solid only in silver light; a piece that would appear inside her waits until she is clear', () => {
    const sc = scene({
      lures: [wick('m', 1000, FLOOR - 60)],
      moonmoss: [
        { id: 'far', x: 1200, y: 600, w: 128, h: 24 },
        { id: 'on-her', x: 960, y: FLOOR - 60, w: 80, h: 24 },
        { id: 'out', x: 1800, y: 600, w: 128, h: 24 },
      ],
    });
    const s = sim(sc);
    s.state.player.glow = 6;
    const ev = s.run(B, 1).concat(s.run(0, 2));
    expect(of(ev, 'mossOn').map((e) => e.id)).toEqual(['far']);
    expect(s.state.light.moss).toEqual([1, 0, 0]);
    s.place(1300, FLOOR);
    const ev2 = s.run(0, 2);
    expect(of(ev2, 'mossOn').map((e) => e.id)).toEqual(['on-her']);
    // Stand on it: when the light goes, she falls.
    s.place(1260, 600);
    s.run(0, 2);
    expect(s.state.player.grounded).toBe(true);
    expect(s.state.player.y + s.state.player.h).toBe(600);
    s.run(0, T.moonwick.burn);
    expect(s.state.light.moss).toEqual([0, 0, 0]);
    expect(s.state.player.y + s.state.player.h).toBeGreaterThan(600);
  });
});

describe('silver light makes flyers shy', () => {
  it('a dangler over a moonlit stop holds its perch (enemyShy), and drops once the light is gone', () => {
    const lamp: Lure = { id: 'w', kind: 'wick', x: 1900, y: 560 };
    const sc = scene({
      lures: [lamp, wick('m', 2100, FLOOR - 60)],
      enemies: [{ id: 'd', kind: 'dangler', x: 2000, y: 300, facing: 1 } as EnemySpawn],
      solids: [{ tag: 'trunk', x: 1800, y: 240, w: 400, h: 60 }],
    });
    const s = sim(sc);
    s.state.player.glow = 6;
    s.place(2060, FLOOR);
    const ev = s.run(B, 1).concat(s.run(0, 120));
    expect(of(ev, 'enemyShy')).toHaveLength(1);
    expect(of(ev, 'enemyWindup')).toHaveLength(0);
    const ev2 = s.run(0, T.moonwick.burn);
    expect(of(ev2, 'enemyWindup').length).toBeGreaterThan(0);
  });
});

describe('gust', () => {
  it('a tap with nothing in reach puffs along her facing: a warm lamp 300 px off goes out (glow paid), a moonwick is fanned', () => {
    const sc = scene({
      lures: [{ id: 'w', kind: 'wick', x: 1500, y: FLOOR - 40 }, wick('m', 900, FLOOR - 40)],
    });
    const s = sim(sc);
    s.state.player.glow = 6;
    s.place(900, FLOOR);
    // (The bud is in reach: the first press kindles it; out of its reach, wait, then tap.)
    s.run(B, 1);
    s.run(0, 300);
    s.place(1200, FLOOR);
    s.state.player.facing = 1;
    s.run(0, 2);
    const burnBefore = s.state.lures.burn[1] as number;
    const ev = s.run(B, 3).concat(s.run(0, 40));
    expect(of(ev, 'gust')).toHaveLength(1);
    expect(of(ev, 'lureSnuff')[0]?.gust).toBe(true);
    expect(of(ev, 'glowGain').some((g) => g.from === 'snuff')).toBe(true);
    s.run(L, 1);
    s.run(0, 40);
    const ev2 = s.run(L | B, 3).concat(s.run(0, 20));
    expect(of(ev2, 'lureFan')).toHaveLength(1);
    expect(s.state.lures.burn[1]).toBeGreaterThan(burnBefore);
  });

  it('Down + tap in the air is a hop, once an airtime', () => {
    const s = sim({
      ...scene({ height: 3000 }),
      solids: [{ tag: 'ground', x: 0, y: 2800, w: 4000, h: 200 }],
    });
    s.run(0, 4);
    expect(s.state.player.grounded).toBe(false);
    s.run(0, 10);
    expect(s.state.player.vy).toBeGreaterThan(0);
    s.run(D | B, 2);
    s.run(D, 1);
    expect(s.state.player.vy).toBeLessThan(0);
    s.run(0, T.gust.cooldown + 1);
    const vy = s.state.player.vy;
    expect(s.state.player.grounded).toBe(false);
    s.run(D | B, 2);
    s.run(D, 1);
    expect(s.state.player.vy).toBeGreaterThan(vy);
  });
});

describe('heartwood and bells', () => {
  it('the blade clangs off heartwood; it stands', () => {
    const sc = scene({ bark: [{ id: 'h', x: 1060, y: FLOOR - 120, w: 64, h: 120, heartwood: true }] });
    const s = sim(sc);
    s.state.player.facing = 1;
    const ev = s.run(A, 1).concat(s.run(0, 20), s.run(A, 1), s.run(0, 20), s.run(A, 1), s.run(0, 20));
    expect(of(ev, 'kitClang').every((e) => e.kind === 'heartwood')).toBe(true);
    expect(of(ev, 'barkBreak')).toHaveLength(0);
    expect(s.state.kit.bark[0]).toBeGreaterThan(0);
  });

  it('the cap answers the right phrase in the dark: long, short, short, long; a warm lamp near makes it dull', () => {
    const sc = scene({
      bells: [{ id: 'cap', x: 1050, y: FLOOR - 40, rhythm: '-..-', sets: 'answer' }],
      lures: [{ id: 'w', kind: 'wick', x: 1500, y: 500 }],
    });
    const s = sim(sc);
    s.state.player.facing = 1;
    const strike = () => s.run(A, 1);
    const ev = strike().concat(s.run(0, 30));
    expect(of(ev, 'bellDull')).toHaveLength(1);
    s.state.lures.hp[0] = 0;
    const gaps = [50, 20, 20, 50];
    const all = strike();
    for (const g of gaps) {
      all.push(...s.run(0, g - 1));
      all.push(...strike());
    }
    all.push(...s.run(0, 20));
    expect(of(all, 'bellHit').map((e) => e.n)).toEqual([1, 2, 3, 4, 5]);
    expect(of(all, 'bellAnswer')).toHaveLength(1);
    expect(s.state.save.flags).toContain('answer');
  });

  it('a wrong gap starts the count over', () => {
    const sc = scene({ bells: [{ id: 'cap', x: 1050, y: FLOOR - 40, rhythm: '-..-', sets: 'answer' }] });
    const s = sim(sc);
    s.state.player.facing = 1;
    const all = s.run(A, 1);
    for (const g of [50, 50]) {
      all.push(...s.run(0, g - 1));
      all.push(...s.run(A, 1));
    }
    all.push(...s.run(0, 20));
    expect(of(all, 'bellHit').map((e) => e.n)).toEqual([1, 2, 1]);
    expect(s.state.save.flags).not.toContain('answer');
  });
});

describe('glow pods and respawns', () => {
  it('a burst glow pod grows back after its regrow time', () => {
    const sc = scene({ pods: [{ id: 'p', x: 1060, y: FLOOR - 22, mount: 'sit', regrow: 300 }] });
    const s = sim(sc);
    s.state.player.facing = 1;
    s.run(A, 1);
    s.run(0, 60);
    expect(s.state.pods.hp[0]).toBe(0);
    const ev = s.run(0, 320);
    expect(of(ev, 'podRegrow')).toHaveLength(1);
    expect(s.state.pods.hp[0]).toBe(1);
  });

  it('a respawning creature comes back at its spawn', () => {
    const sc = scene({
      enemies: [{ id: 'j', kind: 'juvenileBurrback', x: 1100, y: FLOOR, facing: -1, hp: 1, respawn: 200 }],
    });
    const s = sim(sc);
    s.state.player.facing = 1;
    s.run(A, 1);
    s.run(0, 40);
    expect(s.state.enemies[0]?.mode).toBe('dead');
    s.place(400, FLOOR);
    const ev = s.run(0, 300);
    expect(of(ev, 'enemyRespawn')).toHaveLength(1);
    expect(s.state.enemies[0]?.mode).not.toBe('dead');
  });
});

describe('withShortcuts is unaffected', () => {
  it('a glow room without kit is played as is', () => {
    const sc = scene();
    expect(withShortcuts(sc, createState(1, cloneTuning(T), sc).save)).toBe(sc);
  });
});
