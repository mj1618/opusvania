import { describe, expect, it } from 'vitest';
import { J_COUNT, J_HAND, J_HOOK, J_TOE, Rig, S_GANG } from '../../src/render/character/wick/rig';
import { Secondary } from '../../src/render/character/wick/secondary';
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

describe('wick rig', () => {
  it('plants the stance foot: no sliding while running at any frame rate', () => {
    for (const hz of [60, 144]) {
      const rig = new Rig();
      const dt = 1 / hz;
      let cx = 1000;
      rig.update(dt, 0, view({ cx }), [{ type: 'spawn', x: cx, y: 1280 }]);
      const slides: number[] = [];
      const last = [Number.NaN, Number.NaN];
      for (let i = 0; i < hz * 3; i++) {
        cx += 9.6 * 60 * dt;
        rig.update(dt, i * dt, view({ cx, vx: 9.6, motion: 'run', inputX: 1 }), []);
        if (i < hz) continue;
        for (let side = 0; side < 2; side++) {
          const x = rig.frame.j[(J_TOE + side) * 2] ?? 0;
          const y = rig.frame.j[(J_TOE + side) * 2 + 1] ?? 0;
          const prev = last[side] ?? Number.NaN;
          const down = y > 1280 - 0.8;
          if (down && !Number.isNaN(prev)) slides.push(Math.abs(x - prev));
          last[side] = down ? x : Number.NaN;
        }
      }
      // The body covers 9.6 px a frame at 60 Hz. A planted toe stands still; only the touch-down frame
      // and the roll-off at the end of each stance may move.
      slides.sort((a, b) => a - b);
      expect(slides.length).toBeGreaterThan(12);
      expect(slides[Math.floor(slides.length * 0.5)] ?? 1).toBeLessThan(0.3);
      expect(slides[Math.floor(slides.length * 0.7)] ?? 9).toBeLessThan(1);
    }
  });

  it('turns the glaive over the head, never through the ground, on a grounded turn-around', () => {
    const rig = new Rig();
    let clock = 0;
    rig.update(DT, clock, view({}), [{ type: 'spawn', x: 1000, y: 1280 }]);
    let cx = 1000;
    for (let i = 0; i < 60; i++) {
      cx += 9.6;
      clock += DT;
      rig.update(DT, clock, view({ cx, vx: 9.6, motion: 'run', inputX: 1 }), []);
    }
    for (let i = 0; i < 40; i++) {
      cx -= 9.6;
      clock += DT;
      rig.update(DT, clock, view({ cx, vx: -9.6, motion: 'run', inputX: -1, facing: -1 }), []);
      // sin of the screen angle < 0 means the blade is above the butt.
      expect(Math.sin(rig.frame.s[S_GANG] ?? 0)).toBeLessThan(0.2);
    }
  });

  it('stays finite and close to the body through a teleport, a turn, a double jump and a dash', () => {
    const rig = new Rig();
    const sec = new Secondary();
    let clock = 0;
    const run = (p: PlayerView, ev: SimEvent[] = []): void => {
      rig.update(DT, clock, p, ev);
      if (rig.sig.spawned) sec.reset();
      sec.update(DT, clock, rig, rig.frame, p);
      clock += DT;
      for (let i = 0; i < J_COUNT * 2; i++) expect(Number.isFinite(rig.frame.j[i])).toBe(true);
      // The hand never lets go of the shaft, so the hook stays within the glaive's length of it.
      const hx = rig.frame.j[(J_HAND + 1) * 2] ?? 0;
      const hy = rig.frame.j[(J_HAND + 1) * 2 + 1] ?? 0;
      expect(
        Math.hypot((rig.frame.j[J_HOOK * 2] ?? 0) - hx, (rig.frame.j[J_HOOK * 2 + 1] ?? 0) - hy),
      ).toBeLessThan(60);
      for (const c of sec.all) {
        for (let i = 0; i < c.n; i++) {
          expect(Math.abs((c.rx[i] ?? 0) - p.cx)).toBeLessThan(150);
          expect(Math.abs((c.ry[i] ?? 0) - p.cy)).toBeLessThan(150);
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
    for (let i = 0; i < 44; i++) {
      y += vy;
      vy += 0.9;
      const ev: SimEvent[] =
        i === 0
          ? [{ type: 'jump', kind: 'ground', x: 3800, y: 480, dir: -1 }]
          : i === 20
            ? [{ type: 'jump', kind: 'double', x: 3800, y, dir: -1 }]
            : [];
      if (i === 20) vy = -18;
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
        ev,
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
