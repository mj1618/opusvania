import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/events';
import { hashState } from '../../src/sim/index';
import { cloneTuning, defaultTuning, SHAPE } from '../../src/sim/tuning';
import { feet, flatScene, newSim } from './helpers';

const FLOOR = 800;
const types = (ev: SimEvent[]) => ev.map((e) => ('kind' in e ? `${e.type}:${e.kind}` : e.type));
/** Highest the feet got above the floor during a script. */
function peak(script: string, scene = flatScene()): number {
  const s = newSim(scene);
  let top = FLOOR;
  for (const tok of script.split(' ')) {
    const m = /^(.*?)(\d+)$/.exec(tok);
    for (let i = 0; i < Number(m?.[2] ?? 1); i++) {
      s.run(`${m?.[1] ?? tok}1`);
      top = Math.min(top, feet(s).y);
    }
  }
  return FLOOR - top;
}

describe('movement controller', () => {
  it('spawns standing, idle and grounded', () => {
    const s = newSim(flatScene());
    s.run('.10');
    const p = s.state.player;
    expect(feet(s)).toEqual({ x: 2000, y: FLOOR });
    expect([p.grounded, p.motion, p.vx, p.vy]).toEqual([true, 'idle', 0, 0]);
    expect(p.motionFrames).toBeGreaterThan(5);
  });

  it('runs up to max speed, then stops; reports run / idle and footsteps', () => {
    const s = newSim(flatScene());
    const ev = s.run('R30');
    expect(s.state.player.vx).toBeCloseTo(defaultTuning.run.maxSpeed);
    expect(s.state.player.motion).toBe('run');
    expect(s.state.player.facing).toBe(1);
    expect(types(ev)).toContain('step');
    s.run('.10');
    expect(s.state.player.vx).toBe(0);
    expect(s.state.player.motion).toBe('idle');
  });

  it('turning on the ground skids and emits turn', () => {
    const s = newSim(flatScene());
    s.run('R30');
    const ev = s.run('L3');
    expect(types(ev)).toEqual(expect.arrayContaining(['skid', 'turn']));
    expect(s.state.player.facing).toBe(-1);
  });

  it('a held jump reaches the shape height; a tap is much lower', () => {
    const full = peak('J40 .40');
    expect(full).toBeGreaterThanOrEqual(SHAPE.jumpHeightPx);
    expect(full).toBeLessThan(SHAPE.jumpHeightPx + 24); // apex hang adds a little
    expect(peak('J2 .60')).toBeLessThan(full / 2);
  });

  it('jump, apex and land events come in order with an impact speed', () => {
    const s = newSim(flatScene());
    const ev = s.run('J40 .40');
    expect(types(ev)).toEqual(['jump:ground', 'apex', 'land']);
    const land = ev.find((e) => e.type === 'land');
    expect(land?.type === 'land' && land.vy).toBeGreaterThan(10);
    expect(s.state.player.grounded).toBe(true);
  });

  it('reports rise then fall, and counts airtime', () => {
    const s = newSim(flatScene());
    s.run('J10');
    expect(s.state.player.motion).toBe('rise');
    expect(s.state.player.contactFrames).toBe(9);
    s.run('.12');
    expect(s.state.player.motion).toBe('fall');
  });

  it('double jumps once per airtime', () => {
    const s = newSim(flatScene());
    const ev = s.run('J30 .1 J20 .1 J20 .60');
    expect(types(ev).filter((t) => t.startsWith('jump'))).toEqual(['jump:ground', 'jump:double']);
    expect(peak('J30 .1 J30 .60')).toBeGreaterThan(SHAPE.jumpHeightPx + 100);
  });

  it('coyote time: a jump just after walking off an edge still works', () => {
    const scene = flatScene({ solids: [{ tag: 'floating', x: 1900, y: 500, w: 200, h: 40 }] });
    const s = newSim(scene);
    s.place(2080, 500);
    // The edge is at 2100: the body (40 wide) leaves it when its left side passes.
    // (R9: the run eases up to speed over 6 frames, so she is 24 px later than an instant start.)
    const ev = s.run('R9 R+J20');
    expect(types(ev)).toEqual(expect.arrayContaining(['fall', 'jump:coyote']));
  });

  it('jump buffer: a press just before landing jumps on landing', () => {
    const s = newSim(flatScene());
    s.run('J30 .1 J20'); // spend the double jump, so the early press cannot be one
    let ev: SimEvent[] = [];
    while (s.state.player.vy <= 0 || feet(s).y < FLOOR - 40) ev = s.run('.1');
    ev = s.run('J8');
    expect(types(ev)).toEqual(expect.arrayContaining(['land', 'jump:buffered']));
  });

  it('dashes a fixed distance on the ground and once in the air', () => {
    const s = newSim(flatScene());
    const x0 = feet(s).x;
    const ev = s.run('X1 .40');
    expect(types(ev)).toEqual(['dashStart', 'dashEnd']);
    const d = defaultTuning.dash;
    expect(feet(s).x - x0).toBeGreaterThanOrEqual(d.speed * d.frames);
    const air = s.run('J20 X1 .16 X1 .60');
    expect(types(air).filter((t) => t === 'dashStart')).toHaveLength(1);
  });

  it('reports dash as the motion from the press frame', () => {
    const s = newSim(flatScene());
    s.run('X1');
    expect(s.state.player.motion).toBe('dash');
    expect(s.state.player.mode).toBe('dash');
  });

  it('wall slide, then wall jump away', () => {
    const scene = flatScene({ solids: [{ tag: 'trunk', x: 2200, y: 0, w: 100, h: 800 }] });
    const s = newSim(scene);
    const ev = s.run('R+J30 R20');
    expect(types(ev)).toContain('wallSlideStart');
    expect(s.state.player.mode).toBe('wallSlide');
    expect(s.state.player.motion).toBe('wallSlide');
    expect(s.state.player.wallDir).toBe(1);
    expect(s.state.player.vy).toBeLessThanOrEqual(defaultTuning.wall.slideMax);
    const jump = s.run('.1 L+J12');
    expect(types(jump)).toEqual(expect.arrayContaining(['wallSlideEnd', 'jump:wall']));
    expect(s.state.player.vx).toBeLessThan(0);
  });

  it('one-way platforms: up through, land on top, Down+Jump drops through', () => {
    const scene = flatScene({ oneWays: [{ tag: 'branch', x: 1900, y: 620, w: 200 }] });
    const s = newSim(scene);
    s.run('J40 .40');
    expect(feet(s).y).toBe(620);
    expect(s.state.player.grounded).toBe(true);
    const ev = s.run('D+J2 D40');
    expect(types(ev)).toContain('dropThrough');
    expect(feet(s).y).toBe(FLOOR);
  });

  it('fast fall is faster than max fall', () => {
    const scene = flatScene({ solids: [{ tag: 'floating', x: 1900, y: 100, w: 200, h: 20 }] });
    const run = (hold: string) => {
      const s = newSim(scene);
      s.place(2090, 100);
      s.run(`R10 ${hold}20`);
      return s.state.player.vy;
    };
    expect(run('.')).toBeCloseTo(defaultTuning.jump.maxFall);
    expect(run('D')).toBeGreaterThan(defaultTuning.jump.maxFall);
  });

  it('head-bump corner correction slides around a ceiling corner', () => {
    const scene = flatScene({ solids: [{ tag: 'floating', x: 2010, y: 600, w: 300, h: 40 }] });
    const s = newSim(scene);
    const ev = s.run('J40');
    expect(types(ev)).toContain('cornerCorrect:head');
    expect(types(ev)).not.toContain('headBump');
  });

  it('scene edges are walls and the floor of the scene is solid', () => {
    const s = newSim(flatScene());
    s.run('L400');
    expect(s.state.player.x).toBe(0);
    s.run('R600');
    expect(s.state.player.x).toBe(4000 - s.state.player.w);
  });

  it('is deterministic and mirror-symmetric', () => {
    const script = 'R20 R+J18 R6 X1 R20 L+J9 .1 L+J14 L30 .20';
    const a = newSim(flatScene());
    const b = newSim(flatScene());
    a.run(script);
    b.run(script);
    expect(hashState(a.state)).toBe(hashState(b.state));
    const m = newSim(flatScene());
    m.run(script.replace(/[LR]/g, (c) => (c === 'L' ? 'R' : 'L')));
    expect(feet(m).x - 2000).toBe(-(feet(a).x - 2000));
    expect(feet(m).y).toBe(feet(a).y);
  });

  it('assists switch off through tuning', () => {
    const t = cloneTuning(defaultTuning);
    t.assists.coyote = false;
    const scene = flatScene({ solids: [{ tag: 'floating', x: 1900, y: 500, w: 200, h: 40 }] });
    const s = newSim(scene, t);
    s.place(2080, 500);
    t.jump.doubleJumps = 0;
    s.place(2080, 500);
    expect(types(s.run('R6 R+J20'))).not.toContain('jump:coyote');
  });
});
