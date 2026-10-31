import { describe, expect, it } from 'vitest';
import { parseInputScript as parse } from '../../src/input/script';
import { GROVE, getRoom, parseScene } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { hashState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { Lure, Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim } from './helpers';

const L = defaultTuning.lures;
const WICK = L.kinds.wick;
const FLOOR = 800;

const withLures = (lures: Lure[], extra: Partial<Pick<Scene, 'solids' | 'oneWays'>> = {}): Scene => ({
  ...flatScene(extra),
  lures,
});
const wick = (x: number, y: number, spin: 1 | -1 = 1, id = `w${x}`): Lure => ({
  id,
  kind: 'wick',
  x,
  y,
  spin,
});
const types = (ev: SimEvent[], prefix = 'lure') =>
  ev.filter((e) => e.type.startsWith(prefix)).map((e) => e.type);
/** Puts her body centre on (x, y), in the air. */
const centreOn = (s: Sim, x: number, y: number) => s.place(x, y + 40);
/** Steps with a fixed mask `n` times; returns the events. */
function hold(s: Sim, mask: number, n: number): SimEvent[] {
  const from = s.events.length;
  for (let i = 0; i < n; i++) step(s.state, mask, s.tuning, s.scene, s.events);
  return s.events.slice(from);
}
/** Where a running jump from x 2000 lands (feet x), and the hash of the run. */
function runJump(scene: Scene, t: Tuning = cloneTuning(defaultTuning)): { x: number; hash: string } {
  const s = newSim(scene, t);
  s.place(1700, FLOOR);
  s.run('R20 R+J24 R60');
  let f = 0;
  while (!s.state.player.grounded && f++ < 200) s.run('R1');
  return { x: feet(s).x, hash: hashState(s.state) };
}

describe('lures: scene data', () => {
  it('validates: kinds, ids, a core clear of solids, inside the room', () => {
    const base = { ...flatScene(), lures: [{ id: 'a', kind: 'wick', x: 1000, y: 500 }] };
    expect(parseScene(base).lures?.[0]?.kind).toBe('wick');
    expect(() => parseScene({ ...base, lures: [{ id: 'a', kind: 'ember', x: 1000, y: 500 }] })).toThrow();
    expect(() => parseScene({ ...base, lures: [{ id: 'a', kind: 'wick', x: 1000, y: 790 }] })).toThrow(
      /core/,
    );
    expect(() =>
      parseScene({
        ...base,
        lures: [
          { id: 'a', kind: 'wick', x: 1000, y: 500 },
          { id: 'a', kind: 'wick', x: 1400, y: 500 },
        ],
      }),
    ).toThrow(/two things/);
  });

  it('the lab room loads: greybox, every ability, its lures', () => {
    const lab = getRoom('lab-lamps');
    expect(lab.art?.mode).toBe('greybox');
    expect(lab.abilities).toBeUndefined();
    expect(lab.lures?.length).toBeGreaterThanOrEqual(10);
    const s = newSim(lab);
    expect(s.state.lures.hp).toEqual(lab.lures?.map((l) => L.kinds[l.kind].hp));
  });

  it('the test grove has none and plays as before', () => {
    const s = newSim(GROVE);
    expect(s.state.lures).toEqual({
      hp: [],
      hitBy: [],
      out: [],
      snuffed: 0,
      freed: 0,
      grace: [],
      ember: [],
      burn: [],
      // (The Canopy r13: cages that fill while she watches, `Lure.fills`.)
      fill: [],
      fillT: [],
    });
    s.run('R60 R+J20 R40');
    expect(s.state.player.pullX).toBe(0);
  });
});

describe("lures: no pull, no catch (Matt's play, 2026-10-18)", () => {
  it('a wick, a lantern or a ring no longer bends a jump: the run is the one with no lamp', () => {
    const none = runJump(flatScene());
    for (const kind of ['wick', 'lantern', 'ring'] as const) {
      const r = runJump(withLures([{ id: 'l', kind, x: 2150, y: 420, spin: -1 }]));
      expect(r.x, kind).toBe(none.x);
    }
  });

  it('standing in a flame, or hanging in it, nothing takes her: no catch, her moves are her own', () => {
    const s = newSim(withLures([wick(2000, FLOOR - 70)]));
    s.place(2000, FLOOR);
    const ev = hold(s, 0, 120);
    expect(feet(s).x).toBe(2000);
    expect(types(ev)).toEqual([]);
    expect(s.state.player.fling).toBe(-1);
  });
});

const B = ActionBit.lamp;
const R = ActionBit.right;
const U = ActionBit.up;
const of = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

describe("lures: the fling (Ori's Bash)", () => {
  it('Lamp near a burning flame stops the moment: she hangs still, aiming, the world slowed, for at most flingFrames', () => {
    const s = newSim(withLures([wick(2000, 500)]));
    centreOn(s, 2000, 560);
    const start = of(hold(s, B, 1), 'flingStart')[0];
    expect(start).toMatchObject({ id: 'w2000', x: 2000, y: 500, frames: L.flingFrames });
    const at = { x: s.state.player.x, y: s.state.player.y };
    const ev = hold(s, B | R, 20);
    expect({ x: s.state.player.x, y: s.state.player.y }).toEqual(at);
    expect(s.state.player.fling).toBe(0);
    expect(of(ev, 'fling')).toEqual([]);
    // Jump, dash and the blade do nothing while she aims (no mashing, nothing to lose).
    hold(s, B | ActionBit.jump | ActionBit.dash | ActionBit.attack, 3);
    expect({ x: s.state.player.x, y: s.state.player.y }).toEqual(at);
    // Held on, it goes by itself at the cap.
    const rest = hold(s, B | R, L.flingFrames);
    expect(of(rest, 'fling')).toHaveLength(1);
    expect(L.flingFrames).toBe(36);
  });

  it('let go, she launches exactly along the held direction (8-way) at flingSpeed, plus flingLift up', () => {
    for (const [aim, ax, ay] of [
      [R, 1, 0],
      [U, 0, -1],
      [U | R, Math.SQRT1_2, -Math.SQRT1_2],
      [ActionBit.down | ActionBit.left, -Math.SQRT1_2, Math.SQRT1_2],
    ] as const) {
      const s = newSim(withLures([wick(2000, 500)]));
      centreOn(s, 2000, 560);
      hold(s, aim | B, 5);
      const f = of(hold(s, aim, 1), 'fling')[0];
      expect(f?.vx, `aim ${aim}`).toBeCloseTo(ax * L.flingSpeed, 6);
      expect(f?.vy, `aim ${aim}`).toBeCloseTo(ay * L.flingSpeed - L.flingLift, 6);
      expect(s.state.player.thrown).toBe(true);
      expect(s.state.player.fling).toBe(-1);
    }
  });

  it('with nothing held, straight out from the flame through her', () => {
    const s = newSim(withLures([wick(2000, 500)]));
    centreOn(s, 1940, 560);
    hold(s, B, 2);
    const f = of(hold(s, 0, 1), 'fling')[0];
    expect(f?.aimX).toBeCloseTo(-Math.SQRT1_2, 1);
    expect(f?.aimY).toBeCloseTo(Math.SQRT1_2, 1);
  });

  it("out of reach (her body centre past the kind's fling radius), or a lamp that is out, Lamp does nothing", () => {
    for (const [kind, r] of [
      ['wick', L.kinds.wick.fling],
      ['lantern', L.kinds.lantern.fling],
    ] as const) {
      const near = newSim(withLures([{ id: 'l', kind, x: 2000, y: 400 }]));
      centreOn(near, 2000 - r + 2, 400);
      expect(of(hold(near, B, 1), 'flingStart'), kind).toHaveLength(1);
      const far = newSim(withLures([{ id: 'l', kind, x: 2000, y: 400 }]));
      centreOn(far, 2000 - r - 4, 400);
      expect(of(hold(far, B, 1), 'flingStart'), kind).toEqual([]);
    }
    expect([L.kinds.wick.fling, L.kinds.lantern.fling, L.kinds.ring.fling]).toEqual([110, 140, 110]);
    const out = newSim(withLures([wick(2000, 500)]));
    out.state.lures.hp[0] = 0;
    centreOn(out, 2000, 560);
    expect(of(hold(out, B, 1), 'flingStart')).toEqual([]);
  });

  it('the launch: throwFrames at launchGravity whatever jump does, then the wings; a held Lamp is no second fling', () => {
    const fly = (mask: number) => {
      const s = newSim(withLures([wick(2000, 500)]));
      centreOn(s, 2000, 560);
      hold(s, U | B, 2);
      hold(s, U | mask, 1);
      hold(s, mask, L.throwFrames - 2);
      return s.state.player.y;
    };
    expect(fly(ActionBit.jump)).toBe(fly(0));
    expect(L.throwFrames).toBe(20);
    expect(L.launchGravity).toBe(0.5);
  });

  it('the flame is used up at launch: it smoulders (lureEmber), out of reach of a second fling', () => {
    const s = newSim(withLures([wick(2000, 500)]));
    centreOn(s, 2000, 560);
    hold(s, U | B, 2);
    const ev = hold(s, U, 1);
    expect(types(ev)).toEqual(['lureEmber']);
    expect(s.state.lures.hp[0]).toBe(0);
    expect(s.state.lures.ember[0]).toBe(1);
    expect(of(hold(s, B, 1), 'flingStart')).toEqual([]);
  });
});

describe("lures: embers, the chain's retry rule (wood-area1-v3)", () => {
  // A ledge, a gap with a catch zone, and the far floor; a wick over the ledge's lip.
  const gap = (): Scene => ({
    ...flatScene(),
    width: 5000,
    height: 1400,
    solids: [
      { tag: 'ground', x: 0, y: 800, w: 1800, h: 200 },
      { tag: 'ground', x: 2300, y: 800, w: 2700, h: 200 },
    ],
    catches: [{ id: 'pit', x: 1800, y: 900, w: 500, h: 500 }],
    lures: [wick(1760, 700)],
  });
  const flung = (aim: number) => {
    const s = newSim(gap());
    s.place(1740, 800);
    hold(s, 0, 20);
    hold(s, aim | B, 3);
    hold(s, aim, 1);
    return s;
  };
  const land = (s: Sim, mask: number) => {
    const ev: SimEvent[] = [];
    for (let i = 0; i < 240 && !(s.state.player.grounded && ev.length > 0); i++) ev.push(...hold(s, mask, 1));
    for (let i = 0; i < 300 && s.state.caught; i++) ev.push(...hold(s, 0, 1));
    return ev.concat(hold(s, 0, 5));
  };

  it('lands safe on the far floor: out for good (lureSnuff by fling, its moths, the save)', () => {
    const s = flung(U | R);
    const ev = land(s, R);
    expect(feet(s).x).toBeGreaterThan(2300);
    expect(feet(s).y).toBe(800);
    expect(of(ev, 'lureSnuff')[0]).toMatchObject({ id: 'w1760', fling: true });
    expect(s.state.lures.ember[0]).toBe(0);
    expect(s.state.lures.hp[0]).toBe(0);
    expect(s.state.lures.freed).toBe(L.kinds.wick.moths);
    expect(s.state.save.snuffed).toContain('test:w1760');
  });

  it('falls into the pit: it burns again (lureRelight), nothing spent', () => {
    const s = flung(R);
    const ev = land(s, 0);
    expect(of(ev, 'fallCatch')).toHaveLength(1);
    expect(of(ev, 'lureRelight')[0]).toMatchObject({ id: 'w1760' });
    expect(of(ev, 'lureSnuff')).toEqual([]);
    expect(s.state.lures.hp[0]).toBe(1);
    expect(s.state.lures.ember[0]).toBe(0);
  });

  it('lands back on the ground the chain left (a miss): it burns again', () => {
    const s = flung(U);
    const ev = land(s, 0);
    expect(feet(s).y).toBe(800);
    expect(feet(s).x).toBeLessThan(1800);
    expect(of(ev, 'lureRelight')).toHaveLength(1);
    expect(s.state.lures.hp[0]).toBe(1);
  });

  it("a toy room's `relight` lamp burns again by itself after that many frames", () => {
    const scene = withLures([{ ...wick(2000, 700), relight: 60 }]);
    const s = newSim(scene);
    s.place(1900, FLOOR);
    hold(s, 0, 2);
    s.place(1990, FLOOR);
    hold(s, ActionBit.attack, 1);
    hold(s, 0, 20);
    expect(s.state.lures.hp[0]).toBe(0);
    const ev = hold(s, 0, 60);
    expect(s.state.lures.hp[0]).toBe(1);
    expect(types(ev)).toContain('lureRelight');
    expect(s.state.save.snuffed).not.toContain('test:w2000');
  });
});

describe('lures: snuff', () => {
  it('a forward cut puts a wick out: hitstop, its moths freed, health back, out for good', () => {
    const s = newSim(withLures([wick(2100, FLOOR - 48)]));
    s.place(2030, FLOOR);
    s.state.player.hp = 2;
    const ev = s.run('A1 .30');
    const snuff = ev.find((e) => e.type === 'lureSnuff');
    expect(snuff?.type === 'lureSnuff' && snuff.moths).toBe(WICK.moths);
    expect(ev.some((e) => e.type === 'slashHit' && e.target.kind === 'lure')).toBe(true);
    expect(s.state.lures.hp[0]).toBe(0);
    expect(s.state.lures.snuffed).toBe(1);
    expect(s.state.lures.freed).toBe(WICK.moths);
    expect(s.state.player.hp).toBe(3);
    // The hitstop was the snuff's.
    const s2 = newSim(withLures([wick(2100, FLOOR - 48)]));
    s2.place(2030, FLOOR);
    s2.run('A1');
    for (let f = 0; f < 4 && s2.state.player.hitstop === 0; f++) s2.run('.1');
    expect(s2.state.player.hitstop).toBeGreaterThanOrEqual(L.snuffHitstop - 2);
  });

  it('a lantern takes two cuts (lureHit, then lureSnuff), one hit per slash', () => {
    const s = newSim(withLures([{ id: 'l', kind: 'lantern', x: 2125, y: FLOOR - 48 }]));
    s.place(2010, FLOOR);
    const one = s.run('A1 .18');
    expect(types(one)).toEqual(['lureHit']);
    const two = s.run('A1 .20');
    expect(types(two)).toEqual(['lureSnuff']);
  });

  it('from below: an up cut on a hop', () => {
    const s = newSim(withLures([wick(2000, FLOOR - 230)]));
    s.place(2000, FLOOR);
    const ev = s.run('J2 U+J+A1 U+J6 .40');
    expect(types(ev)).toContain('lureSnuff');
    expect(types(ev)).not.toContain('lureCaught');
  });

  it('from above: the down cut is a pogo', () => {
    const s = newSim(withLures([wick(2000, 500)]));
    centreOn(s, 2000, 340);
    let snuffed = false;
    let bounced = false;
    for (let f = 0; f < 40 && !snuffed; f++) {
      const ev = s.run(f === 2 ? 'D+A1' : 'D1');
      if (ev.some((e) => e.type === 'lureSnuff')) {
        snuffed = true;
        bounced = s.state.player.vy < 0;
      }
    }
    expect(snuffed).toBe(true);
    expect(bounced).toBe(true);
  });

  it('a lure that is out cannot be flung from, and a jump past it is the plain jump', () => {
    const scene = withLures([wick(2150, 420, -1)]);
    const s = newSim(scene);
    s.state.lures.hp[0] = 0;
    s.place(1700, FLOOR);
    s.run('R20 R+J24 R60');
    const none = newSim(flatScene());
    none.place(1700, FLOOR);
    none.run('R20 R+J24 R60');
    expect(feet(s)).toEqual(feet(none));
    const t = newSim(scene);
    t.state.lures.hp[0] = 0;
    centreOn(t, 2150, 420);
    expect(types(hold(t, ActionBit.lamp, 5))).not.toContain('flingStart');
  });
});

describe('lures: mirror symmetry', () => {
  it('a mirrored field and mirrored input give a mirrored run', () => {
    const W = 4000;
    const a = newSim(withLures([wick(2300, 680, -1), wick(2900, 600, -1, 'b')]));
    const b = newSim(withLures([wick(W - 2300, 680, 1), wick(W - 2900, 600, 1, 'b')]));
    a.place(2240, FLOOR);
    b.place(W - 2240, FLOOR);
    const script = 'B+U+R6 U+R1 R30 B1 .4 R1 R+J60 R30';
    const flip = (t: string) => t.replace(/[LR]/g, (c) => (c === 'L' ? 'R' : 'L'));
    for (const [m, n] of parse(script).map((x, i) => [x, parse(flip(script))[i] ?? 0] as const)) {
      step(a.state, m, a.tuning, a.scene, a.events);
      step(b.state, n, b.tuning, b.scene, b.events);
      expect(feet(b).x).toBe(W - feet(a).x);
      expect(feet(b).y).toBe(feet(a).y);
    }
    expect(types(a.events)).toEqual(types(b.events));
    expect(types(a.events, 'fling')).toContain('fling');
  });
});
