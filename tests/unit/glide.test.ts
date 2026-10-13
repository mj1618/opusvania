import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { hashState } from '../../src/sim/index';
import type { Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim } from './helpers';

const G = defaultTuning.glide;
const MAX_FALL = defaultTuning.jump.maxFall;
const names = (ev: SimEvent[]) =>
  ev.map((e) =>
    e.type === 'glideEnd' ? `glideEnd:${e.reason}` : 'kind' in e ? `${e.type}:${e.kind}` : e.type,
  );
const glides = (ev: SimEvent[]) => names(ev).filter((n) => n.startsWith('glide'));

/** A cliff: a platform top at y 200 ending at x 2100, the floor `drop` px below it. */
function cliff(drop: number, extra: Scene['solids'] = []): Scene {
  return {
    id: 'cliff',
    width: 12000,
    height: 400 + drop,
    spawn: { x: 2000, y: 200 },
    solids: [
      { tag: 'ground', x: 0, y: 200 + drop, w: 12000, h: 200 },
      { tag: 'floating', x: 0, y: 200, w: 2100, h: 40 },
      ...extra,
    ],
    oneWays: [],
  };
}

/** Off the cliff with the double jump spent, falling at max speed, nothing held. */
function falling(drop = 3400, extra: Scene['solids'] = []): Sim {
  const s = newSim(cliff(drop, extra));
  s.place(2090, 200);
  s.run('R+J2 R4 R+J2 .90');
  expect(s.state.player.dj).toBe(0);
  expect(s.state.player.vy).toBeCloseTo(MAX_FALL);
  return s;
}

/** Runs a script a frame at a time until she lands; returns the distance travelled and the frames. */
function untilLanding(s: Sim, script: string): { dx: number; frames: number; events: SimEvent[] } {
  const x0 = feet(s).x;
  const events: SimEvent[] = [];
  let frames = 0;
  let air = false;
  for (const tok of script.split(' ')) {
    const m = /^(.*?)(\d+)$/.exec(tok);
    for (let i = 0; i < Number(m?.[2] ?? 1); i++) {
      events.push(...s.run(`${m?.[1] ?? tok}1`));
      frames++;
      if (!s.state.player.grounded) air = true;
      else if (air) return { dx: feet(s).x - x0, frames, events };
    }
  }
  throw new Error('never landed');
}

describe('wing glide', () => {
  it('a held jump on the flat never glides: ordinary jumps are exactly as before', () => {
    const off = cloneTuning(defaultTuning);
    off.assists.glide = false;
    for (const script of ['J40 .40', 'R+J80', 'R20 R+J30 R40', 'J60 .1 J12 .60']) {
      const a = newSim(flatScene());
      const b = newSim(flatScene(), off);
      const ev = a.run(script);
      b.run(script);
      expect(glides(ev), script).toEqual([]);
      expect(a.state.player, script).toEqual(b.state.player);
    }
  });

  it('does not start while rising; a double jump held starts it once she is falling', () => {
    const s = newSim(flatScene());
    s.run('J28 .1');
    const press = s.run('J1');
    expect(names(press)).toEqual(['jump:double']); // the press is the double jump, not a glide
    let ev: SimEvent[] = [];
    while (s.state.player.vy <= 0) {
      expect(s.state.player.gliding).toBe(false);
      expect(s.state.player.motion).toBe('rise');
      ev = s.run('J1');
    }
    while (!s.state.player.gliding) ev = s.run('J1');
    const start = ev.find((e) => e.type === 'glideStart');
    // Entry speed is just past the threshold: the wings open within a frame or two of the apex.
    expect(start?.type === 'glideStart' && start.vy).toBeGreaterThan(G.minVy);
    expect(start?.type === 'glideStart' && start.vy).toBeLessThan(G.minVy + 1.5);
    expect(s.state.player.motion).toBe('glide');
    expect(s.state.player.mode).toBe('normal');
    expect(s.state.player.motionFrames).toBe(0);
    s.run('J5');
    expect(s.state.player.motionFrames).toBe(5);
  });

  it('with the double jump spent, press-and-hold while falling glides on that frame', () => {
    const s = falling();
    const ev = s.run('J1');
    expect(names(ev)).toEqual(['glideStart']);
    const start = ev[0];
    expect(start?.type === 'glideStart' && start.vy).toBeCloseTo(MAX_FALL);
    expect(s.state.player.gliding).toBe(true);
  });

  it('the catch: fall speed converges to the glide speed smoothly, never as a wall', () => {
    const s = falling();
    const vy: number[] = [];
    for (let i = 0; i < 30; i++) {
      s.run('J1');
      vy.push(s.state.player.vy);
    }
    for (let i = 1; i < vy.length; i++) expect(vy[i]).toBeLessThanOrEqual(vy[i - 1] as number);
    // A catch you can see: the first frame keeps most of the speed, and it takes 8-12 frames.
    expect(vy[0]).toBeGreaterThan(MAX_FALL * 0.65);
    expect(vy[3]).toBeGreaterThan(G.fallSpeed * 1.5);
    const settled = vy.indexOf(G.fallSpeed);
    expect(settled).toBeGreaterThanOrEqual(7);
    expect(settled).toBeLessThanOrEqual(11);
    expect(vy[29]).toBe(G.fallSpeed);
    expect(G.fallSpeed / MAX_FALL).toBeGreaterThan(0.2);
    expect(G.fallSpeed / MAX_FALL).toBeLessThan(0.25);
  });

  it('release ends it, pressing again resumes it, as often as she likes', () => {
    const s = falling();
    const ev = s.run('J10 .6 J10 .1 J10 .3');
    expect(glides(ev)).toEqual([
      'glideStart',
      'glideEnd:release',
      'glideStart',
      'glideEnd:release',
      'glideStart',
      'glideEnd:release',
    ]);
    expect(s.state.player.motion).toBe('fall');
    // Released: she falls under normal gravity again.
    s.run('.40');
    expect(s.state.player.vy).toBeCloseTo(MAX_FALL);
  });

  it('a dash cancels it; holding jump after the dash resumes it', () => {
    const s = falling();
    s.run('J12');
    const ev = s.run('J+X1 J40');
    expect(names(ev)).toEqual(['glideEnd:dash', 'dashStart', 'dashEnd', 'glideStart']);
    expect(s.state.player.gliding).toBe(true);
    expect(s.state.player.vy).toBe(G.fallSpeed);
  });

  it('holding into a wall still wall-slides (the slide wins)', () => {
    const s = falling(3400, [{ tag: 'trunk', x: 2600, y: 0, w: 100, h: 3400 }]);
    const ev = s.run('R+J80');
    const n = names(ev);
    expect(n.indexOf('glideEnd:wall')).toBeGreaterThan(n.indexOf('glideStart'));
    expect(n.indexOf('wallSlideStart')).toBe(n.indexOf('glideEnd:wall') + 1);
    expect(s.state.player.mode).toBe('wallSlide');
    expect(s.state.player.gliding).toBe(false);
    expect(glides(ev)).toHaveLength(2);
    // Wall jump off it, keep holding: the glide comes back once she is falling.
    const after = s.run('.1 L+J70');
    expect(names(after)).toEqual(expect.arrayContaining(['jump:wall', 'glideStart']));
  });

  it('Down cancels it and wins while held (fast fall)', () => {
    const s = falling();
    s.run('J20');
    const ev = s.run('D+J30');
    expect(glides(ev)).toEqual(['glideEnd:fastfall']);
    expect(s.state.player.vy).toBeGreaterThan(MAX_FALL);
    expect(glides(s.run('J1'))).toEqual(['glideStart']); // Down let go, jump still held
  });

  it('lands softly, on solids and on one-way platforms, with glideEnd before land', () => {
    const s = falling(2600);
    const { events } = untilLanding(s, 'J900');
    expect(names(events)).toEqual(['glideStart', 'glideEnd:land', 'land']);
    const land = events.find((e) => e.type === 'land');
    expect(land?.type === 'land' && land.vy).toBe(G.fallSpeed);
    expect(land?.type === 'land' && land.hard).toBe(false);
    expect(s.state.player.gliding).toBe(false);
    expect(s.state.player.motion).toBe('idle');

    const scene = { ...cliff(3400), oneWays: [{ tag: 'branch' as const, x: 2000, y: 3000, w: 600 }] };
    const o = newSim(scene);
    o.place(2090, 200);
    o.run('R+J2 R4 R+J2 .60');
    untilLanding(o, 'J900');
    expect(feet(o).y).toBe(3000);
  });

  it('a hold carried from a ground jump glides only once she is below the launch height', () => {
    const s = newSim(cliff(1200));
    s.place(2090, 200);
    const launchY = s.state.player.y;
    let ev: SimEvent[] = [];
    for (let i = 0; i < 200 && !s.state.player.gliding; i++) {
      ev = s.run('R+J1');
      if (!s.state.player.gliding)
        expect(s.state.player.y <= launchY + G.carriedDropPx + MAX_FALL).toBe(true);
    }
    expect(names(ev)).toContain('glideStart');
    expect(s.state.player.y).toBeGreaterThanOrEqual(launchY + G.carriedDropPx);
    expect(s.state.player.dj).toBe(1); // glide first, double jump still in hand
    // ...so she can let go, double jump and glide again.
    const more = s.run('R1 R+J40');
    expect(names(more)).toEqual(['glideEnd:release', 'jump:double', 'apex', 'glideStart']);
  });

  it('a jump still held after landing glides as soon as she walks off an edge', () => {
    const s = newSim(cliff(1200));
    s.place(1300, 200);
    const ev = s.run('R+J110');
    const n = names(ev).filter((e) => e !== 'step');
    expect(n).toEqual(['jump:ground', 'apex', 'land', 'fall', 'glideStart']);
    const start = ev.find((e) => e.type === 'glideStart');
    expect(start?.type === 'glideStart' && start.vy).toBeLessThan(G.minVy + 1.5);
  });

  it('a short hop then a new press is a double jump, not a glide', () => {
    const s = newSim(flatScene());
    const ev = s.run('J4 .8 J1');
    expect(s.state.player.vy).toBeLessThan(0);
    expect(names(ev).filter((n) => n !== 'apex')).toEqual(['jump:ground', 'jump:double']);
  });

  it('jump buffering wins near the ground: a late press becomes a buffered jump, not a glide', () => {
    const s = newSim(flatScene());
    s.run('J30 .1 J20'); // spend the double jump
    while (s.state.player.vy <= 0 || feet(s).y < 800 - 40) s.run('.1');
    const ev = s.run('J8');
    expect(glides(ev)).toEqual([]);
    expect(names(ev)).toEqual(expect.arrayContaining(['land', 'jump:buffered']));
  });

  it('coyote jumps are untouched by a held jump', () => {
    const s = newSim(cliff(1200));
    s.place(2080, 200);
    // (R9: from a standstill the run takes 6 frames to reach full speed, 24 px later than at once.)
    const ev = s.run('R9 R+J20');
    expect(names(ev)).toEqual(['fall', 'jump:coyote']);
  });

  it('steers gently: a little faster than a run, and a turn takes its time', () => {
    const s = falling();
    s.run('R+J60');
    expect(s.state.player.vx).toBeCloseTo(defaultTuning.run.maxSpeed * G.speedMult);
    let frames = 0;
    while (s.state.player.vx > -defaultTuning.run.maxSpeed) {
      const before = s.state.player.vx;
      s.run('L+J1');
      expect(before - s.state.player.vx).toBeLessThanOrEqual(G.turn + 1e-9);
      frames++;
    }
    expect(frames).toBeGreaterThan(12);
    expect(frames).toBeLessThan(30);
    expect(s.state.player.facing).toBe(-1);
  });

  it('reach: gliding roughly doubles a double jump on the flat and scales with height', () => {
    const run = (drop: number, script: string) => {
      const s = newSim(cliff(drop));
      s.place(2076, 200);
      return untilLanding(s, script).dx;
    };
    const jumps = 'R+J28 R1 R+J22 R900';
    const glide = 'R+J28 R1 R+J900';
    // Numbers are in memory/movement-controller.md: keep them in step with this.
    const table = [0, 192, 384, 640, 832].map((d) => [d, run(d, jumps), run(d, glide)]);
    for (const [, a, b] of table) expect(b as number).toBeGreaterThan((a as number) * 1.9);
    expect(table[0]?.[1]).toBeGreaterThan(700);
    expect(table[0]?.[2]).toBeGreaterThan(1500);
    expect(table[0]?.[2]).toBeLessThan(1700);
    expect(table[4]?.[2]).toBeGreaterThan(3300);
    expect(table[4]?.[2]).toBeLessThan(3600);
  });

  it('is deterministic and mirror-symmetric', () => {
    const script = 'R+J2 R4 R+J2 R30 R+J20 L+J25 .3 L+J10 L+J+X1 L+J30 D+J6 R+J40 R60';
    const a = falling();
    const b = falling();
    const ev = a.run(script);
    b.run(script);
    expect(glides(ev).length).toBeGreaterThanOrEqual(6);
    expect(hashState(a.state)).toBe(hashState(b.state));
    const flip = (t: string) => t.replace(/[LR]/g, (c) => (c === 'L' ? 'R' : 'L'));
    const p = newSim(flatScene());
    const m = newSim(flatScene());
    const air = 'R+J28 R1 R+J60 .2 L+J40 L+J+X1 L+J80';
    p.run(air);
    m.run(flip(air));
    expect(feet(m).x - 2000).toBe(-(feet(p).x - 2000));
    expect(feet(m).y).toBe(feet(p).y);
  });

  it('switches off through tuning', () => {
    const t = cloneTuning(defaultTuning);
    t.assists.glide = false;
    const s = newSim(cliff(3400), t);
    s.place(2090, 200);
    expect(glides(s.run('R+J2 R4 R+J2 .60 J60'))).toEqual([]);
  });

  it('in the grove: the summit to the far ledge in one flight, and into the pool safely', () => {
    // The canopy (scene `ceilingY`, 420 px over the scene's top) leaves room for the whole jump and
    // double jump on the summit, so the flight from trunk B reaches the far ledge again (with the
    // ceiling at y 0 it came down on F7, one hop short): the designed way to the third lantern.
    const s = newSim();
    s.place(3684, 192);
    const flight = untilLanding(s, 'R+J28 R1 R+J900');
    expect(feet(s).y).toBe(448);
    expect(feet(s).x).toBeGreaterThan(5472);
    expect(feet(s).x).toBeLessThan(5760);
    // (Held to the end she sails over the ledge, 160 px up at its lip, to the scene's wall and
    // slides down it onto the ledge's far end; closing the wings over the lip lands her there.)
    expect(glides(flight.events).at(-1)).toMatch(/glideEnd:(land|wall)/);
    // Well over the two lampwings on the way: the first never notices her; the second (its home is
    // in reach of the far lantern, so its giving up at a lit lantern can be seen) looks up as she
    // passes 200 px over it and sets off after her, far too slow to touch her in the air.
    expect(flight.events.filter((e) => e.type === 'hurt')).toEqual([]);
    expect(
      flight.events
        .filter((e) => e.type === 'enemyNotice')
        .map((e) => (e.type === 'enemyNotice' ? e.id : '')),
    ).toEqual(['lamp-glide-2']);

    const pool = GROVE.solids.find((r) => r.tag === 'pool');
    if (!pool) throw new Error('no pool');
    s.place(pool.x + pool.w / 2, 900);
    const dive = names(untilLanding(s, 'J900').events).filter(
      (n) => !n.startsWith('pickup') && !n.startsWith('enemy'),
    );
    expect(dive).toEqual(['jump:double', 'apex', 'glideStart', 'glideEnd:land', 'land']);
    expect(feet(s)).toEqual({ x: feet(s).x, y: pool.y });
    expect(feet(s).x).toBeGreaterThan(pool.x);
    expect(feet(s).x).toBeLessThan(pool.x + pool.w);
    // Nothing she can reach by gliding is outside the scene.
    for (const [x, y, d] of [
      [3648, 192, 'L'],
      [5500, 448, 'L'],
      [2840, 448, 'L'],
      [3648, 192, 'R'],
    ] as const) {
      s.place(x, y);
      untilLanding(s, `${d}+J28 ${d}1 ${d}+J60 ${d}+J+X1 ${d}+J1500`);
      const p = s.state.player;
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(GROVE.width);
      expect(p.grounded).toBe(true);
    }
  });
});
