import { describe, expect, it } from 'vitest';
import { parseInputScript as parse } from '../../src/input/script';
import { GROVE, getRoom, parseScene } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { createState, hashState, step } from '../../src/sim/index';
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
/** Caught by the lure at (x, y): placed on its flame, one step. */
function caughtBy(s: Sim, x: number, y: number): void {
  centreOn(s, x, y);
  const ev = hold(s, 0, 1);
  expect(types(ev)).toContain('lureCaught');
  expect(s.state.player.lure).toBeGreaterThanOrEqual(0);
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
    expect(s.state.lures).toEqual({ hp: [], hitBy: [], out: [], snuffed: 0, freed: 0 });
    s.run('R60 R+J20 R40');
    expect(s.state.player.pullX).toBe(0);
  });
});

describe('lures: the pull', () => {
  it('bends a jump, the same way every time (a pass under an anticlockwise wick throws her on)', () => {
    const none = runJump(flatScene());
    const scene = withLures([wick(2150, 420, -1)]);
    const a = runJump(scene);
    const b = runJump(scene);
    expect(a.x).toBeGreaterThan(none.x + 60);
    expect(a.hash).toBe(b.hash);
    // The other spin holds her back.
    const cw = runJump(withLures([wick(2150, 420, 1)]));
    expect(cw.x).toBeLessThan(a.x - 60);
  });

  it('keeps its sideways part as momentum (pullX), which outlasts the field', () => {
    const s = newSim(withLures([wick(2150, 420, -1)]));
    s.place(1700, FLOOR);
    let peak = 0;
    for (let f = 0; f < 90; f++) {
      s.run(f >= 20 && f < 44 ? 'R+J1' : 'R1');
      peak = Math.max(peak, s.state.player.pullX);
    }
    expect(peak).toBeGreaterThan(3);
  });

  it('on the ground she can always walk away', () => {
    // A low wick, and her standing anywhere in its field: holding away she leaves it, never caught.
    const lx = 2000;
    const ly = FLOOR - 120;
    for (const dx of [-200, -120, -60, -20, 20, 60, 120, 200]) {
      for (const away of [-1, 1]) {
        if (Math.sign(dx) === -away) continue;
        const s = newSim(withLures([wick(lx, ly, 1)]));
        s.place(lx + dx, FLOOR);
        const x0 = feet(s).x;
        const ev = hold(s, away > 0 ? ActionBit.right : ActionBit.left, 60);
        expect(types(ev)).not.toContain('lureCaught');
        expect((feet(s).x - x0) * away).toBeGreaterThan(300);
      }
    }
  });

  it('only drags her a little on the ground, standing still', () => {
    const s = newSim(withLures([wick(2000, FLOOR - 120, 1)]));
    s.place(2150, FLOOR);
    hold(s, 0, 60);
    const moved = 2150 - feet(s).x;
    expect(moved).toBeGreaterThan(10);
    expect(moved).toBeLessThan(60 * L.groundMax + 1);
    expect(s.state.player.lure).toBe(-1);
  });
});

describe('lures: caught', () => {
  it('circles the flame, moves replaced: 3 presses of jump free her, thrown out with a grace', () => {
    const s = newSim(withLures([wick(2000, 400)]));
    caughtBy(s, 2000, 400);
    // She circles: stays near the flame for a long time with no input.
    hold(s, 0, 120);
    const p = s.state.player;
    expect(p.lure).toBe(0);
    expect(Math.hypot(p.x + 20 - 2000, p.y + 40 - 400)).toBeLessThan(WICK.core);
    // Running does nothing.
    hold(s, ActionBit.right, 30);
    expect(s.state.player.lure).toBe(0);
    const ev = s.run('J1 .7 J1 .7');
    expect(types(ev)).toEqual(['lureBeat', 'lureBeat']);
    expect(s.state.player.lure).toBe(0);
    const out = s.run('J1');
    expect(types(out)).toEqual(['lureBeat', 'lureFree']);
    const free = out.find((e) => e.type === 'lureFree');
    expect(free?.type === 'lureFree' && free.how).toBe('beat');
    expect(s.state.player.lure).toBe(-1);
    expect(s.state.player.lureGraceFrames).toBe(L.graceFrames);
    // The grace: it does not catch her again while it runs.
    expect(types(hold(s, 0, L.graceFrames - 2))).not.toContain('lureCaught');
  });

  it('a mash faster than the beat cooldown still counts every press (and the blade counts)', () => {
    const s = newSim(withLures([wick(2000, 400)]));
    caughtBy(s, 2000, 400);
    const ev = s.run('J1 .1 A1 .1 J1 .30');
    expect(types(ev).filter((t) => t === 'lureBeat')).toHaveLength(3);
    expect(types(ev)).toContain('lureFree');
  });

  it('a held direction bends the throw toward it', () => {
    const throwOf = (mask: number) => {
      const s = newSim(withLures([wick(2000, 400)]));
      caughtBy(s, 2000, 400);
      hold(s, 0, 10);
      const ev = hold(s, ActionBit.jump | mask, 1).concat(
        hold(s, mask, 7),
        hold(s, ActionBit.jump | mask, 1),
      );
      ev.push(...hold(s, mask, 7), ...hold(s, ActionBit.jump | mask, 1));
      const f = ev.find((e) => e.type === 'lureFree');
      if (f?.type !== 'lureFree') throw new Error('not freed');
      return f.vx;
    };
    expect(throwOf(ActionBit.right)).toBeGreaterThan(throwOf(ActionBit.left));
  });

  it('a dash frees her at once (when she owns it); without it, a dash press does nothing', () => {
    const s = newSim(withLures([wick(2000, 400)]));
    caughtBy(s, 2000, 400);
    const ev = s.run('R+X1');
    expect(types(ev, '')).toEqual(expect.arrayContaining(['lureFree', 'dashStart']));
    expect(s.state.player.mode).toBe('dash');
    const n = createState(1, s.tuning, s.scene, [], ['glide']);
    const t = newSim(s.scene);
    t.state.save.abilities = n.save.abilities;
    caughtBy(t, 2000, 400);
    expect(types(t.run('R+X1 .5'))).not.toContain('lureFree');
    expect(t.state.player.lure).toBe(0);
  });

  it('a blow frees her (how: hurt)', () => {
    const scene: Scene = {
      ...withLures([wick(2000, FLOOR - 60)]),
      enemies: [{ id: 'b', kind: 'burrback', x: 2400, y: FLOOR, facing: -1 }],
    };
    const s = newSim(scene);
    s.state.pickups.count = 6;
    caughtBy(s, 2000, FLOOR - 60);
    // Bring the creature to her: place it under the flame.
    const e = s.state.enemies[0];
    if (!e) throw new Error('no enemy');
    e.x = 2000 - e.w / 2;
    let freed: SimEvent | undefined;
    for (let f = 0; f < 120 && !freed; f++) freed = hold(s, 0, 1).find((x) => x.type === 'lureFree');
    expect(freed?.type === 'lureFree' && freed.how).toBe('hurt');
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

  it('a lure that is out neither pulls nor catches', () => {
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
    expect(types(hold(t, 0, 5))).not.toContain('lureCaught');
  });
});

describe('lures: mirror symmetry', () => {
  it('a mirrored field and mirrored input give a mirrored run', () => {
    const W = 4000;
    const a = newSim(withLures([wick(2300, 560, -1)]));
    const b = newSim(withLures([wick(W - 2300, 560, 1)]));
    a.place(2000, FLOOR);
    b.place(W - 2000, FLOOR);
    const script = 'R20 R+J24 R30 J1 .6 J1 .6 J1 R40';
    const flip = (t: string) => t.replace(/[LR]/g, (c) => (c === 'L' ? 'R' : 'L'));
    for (const [m, n] of parse(script).map((x, i) => [x, parse(flip(script))[i] ?? 0] as const)) {
      step(a.state, m, a.tuning, a.scene, a.events);
      step(b.state, n, b.tuning, b.scene, b.events);
      expect(feet(b).x).toBe(W - feet(a).x);
      expect(feet(b).y).toBe(feet(a).y);
    }
    expect(types(a.events)).toEqual(types(b.events));
  });
});
