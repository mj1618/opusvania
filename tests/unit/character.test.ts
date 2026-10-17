import { describe, expect, it } from 'vitest';
import { Chain } from '../../src/render/character/hooded/chain';
import { ik2, ikOut, Spring } from '../../src/render/character/hooded/math';
import { J_COUNT, J_TOE_A, J_TOE_B, Rig } from '../../src/render/character/hooded/rig';
import { Secondary } from '../../src/render/character/hooded/secondary';
import type { PlayerView } from '../../src/render/contract';
import type { SimEvent } from '../../src/sim/events';

function view(over: Partial<PlayerView>): PlayerView {
  const base = {
    x: 0,
    y: 0,
    w: 40,
    h: 80,
    vx: 0,
    vy: 0,
    facing: 1,
    mode: 'normal',
    modeFrames: 0,
    motion: 'idle',
    motionFrames: 0,
    grounded: true,
    contactFrames: 100,
    wallDir: 0,
    inputX: 0,
    skid: false,
    dashDir: 1,
    dashTimer: 0,
    freeze: 0,
    cx: 1000,
    cy: 1240,
    feetY: 1280,
  };
  return { ...base, ...over } as unknown as PlayerView;
}

const DT = 1 / 60;

describe('character maths', () => {
  it('spring settles on its target without blowing up at a large dt', () => {
    const s = new Spring(0, 30, 0.5);
    for (let i = 0; i < 200; i++) s.step(1, 0.1);
    expect(s.x).toBeCloseTo(1, 3);
  });

  it('two-bone IK keeps bone lengths and reaches the target', () => {
    ik2(0, 0, 10, 20, 15, 16, 1);
    expect(Math.hypot(ikOut.x, ikOut.y)).toBeCloseTo(15, 3);
    expect(Math.hypot(ikOut.ex - ikOut.x, ikOut.ey - ikOut.y)).toBeCloseTo(16, 3);
    expect(ikOut.ex).toBeCloseTo(10, 3);
    expect(ikOut.ey).toBeCloseTo(20, 3);
  });
});

describe('chains', () => {
  const spec = {
    len: [8, 8, 8, 8],
    rest: [250, 260, 268, 270],
    kG: [0.2, 0.02],
    kL: [0.3, 0.1],
    drag: 0.08,
    gravity: 1300,
    wind: 0,
  } as const;

  it('comes to rest without jitter', () => {
    const c = new Chain(spec);
    c.ax = 100;
    c.ay = 100;
    for (let i = 0; i < 600; i++) c.advance(DT, i * DT);
    const x0 = c.rx[4] ?? 0;
    const y0 = c.ry[4] ?? 0;
    for (let i = 600; i < 660; i++) c.advance(DT, i * DT);
    expect(Math.abs((c.rx[4] ?? 0) - x0)).toBeLessThan(0.01);
    expect(Math.abs((c.ry[4] ?? 0) - y0)).toBeLessThan(0.01);
  });

  it('keeps its segment lengths when the anchor is dragged fast', () => {
    const c = new Chain(spec);
    for (let i = 0; i < 120; i++) {
      c.ax = i * 24;
      c.ay = 100;
      c.advance(DT, i * DT);
    }
    for (let i = 1; i < c.n; i++) {
      const l = Math.hypot((c.x[i] ?? 0) - (c.x[i - 1] ?? 0), (c.y[i] ?? 0) - (c.y[i - 1] ?? 0));
      expect(l).toBeCloseTo(8, 2);
    }
  });
});

describe('rig', () => {
  it('plants the stance foot: no sliding while running at any frame rate', () => {
    for (const hz of [60, 144]) {
      const rig = new Rig();
      const dt = 1 / hz;
      let cx = 1000;
      const spawn: SimEvent[] = [{ type: 'spawn', x: cx, y: 1280 }];
      rig.update(dt, 0, view({ cx }), spawn);
      const slides: number[] = [];
      const last = [Number.NaN, Number.NaN];
      for (let i = 0; i < hz * 3; i++) {
        cx += 9.6 * 60 * dt;
        rig.update(dt, i * dt, view({ cx, vx: 9.6, motion: 'run', inputX: 1 }), []);
        if (i < hz) continue;
        for (let side = 0; side < 2; side++) {
          const j = side === 0 ? J_TOE_A : J_TOE_B;
          const x = rig.frame.j[j * 2] ?? 0;
          const y = rig.frame.j[j * 2 + 1] ?? 0;
          const prev = last[side] ?? Number.NaN;
          const down = y > 1280 - 1.2;
          if (down && !Number.isNaN(prev)) slides.push(Math.abs(x - prev));
          last[side] = down ? x : Number.NaN;
        }
      }
      // The body covers 9.6 px a frame at 60 Hz. A planted toe must stand still; only the frames
      // of roll-off at the end of each stance may move, and only a little.
      slides.sort((a, b) => a - b);
      expect(slides.length).toBeGreaterThan(20);
      expect(slides[Math.floor(slides.length * 0.25)] ?? 1).toBeLessThan(0.05);
    }
  });

  it('stays finite and close to the body through a teleport, a turn, a jump and a dash', () => {
    const rig = new Rig();
    const sec = new Secondary();
    let clock = 0;
    const run = (p: PlayerView, ev: SimEvent[] = []): void => {
      rig.update(DT, clock, p, ev);
      if (rig.sig.spawned) sec.reset();
      sec.update(DT, clock, rig, rig.frame, p);
      clock += DT;
      for (let i = 0; i < J_COUNT * 2; i++) expect(Number.isFinite(rig.frame.j[i])).toBe(true);
      for (const c of sec.all) {
        for (let i = 0; i < c.n; i++) {
          expect(Math.abs((c.rx[i] ?? 0) - p.cx)).toBeLessThan(140);
          expect(Math.abs((c.ry[i] ?? 0) - p.cy)).toBeLessThan(140);
        }
      }
    };
    run(view({}), [{ type: 'spawn', x: 1000, y: 1280 }]);
    for (let i = 0; i < 30; i++) run(view({}));
    // Teleport far away without a spawn event: the rig must notice and reset.
    for (let i = 0; i < 10; i++) run(view({ cx: 4000, cy: 440, feetY: 480 }));
    for (let i = 0; i < 20; i++)
      run(view({ cx: 4000 - i * 9.6, cy: 440, feetY: 480, facing: -1, vx: -9.6, motion: 'run' }));
    let y = 480;
    let vy = -21;
    const jump: SimEvent[] = [{ type: 'jump', kind: 'ground', x: 3800, y: 480, dir: -1 }];
    for (let i = 0; i < 40; i++) {
      y += vy;
      vy += 0.9;
      run(
        view({
          cx: 3800,
          cy: y - 40,
          feetY: y,
          grounded: false,
          vy,
          motion: vy < 0 ? 'rise' : 'fall',
          facing: -1,
        }),
        i === 0 ? jump : [],
      );
    }
    for (let i = 0; i < 12; i++)
      run(
        view({
          cx: 3800 + i * 24,
          cy: y - 40,
          feetY: y,
          grounded: false,
          vx: 24,
          mode: 'dash',
          motion: 'dash',
        }),
      );
  });
});
