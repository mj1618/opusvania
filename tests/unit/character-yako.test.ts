import { describe, expect, it } from 'vitest';
import { Chain } from '../../src/render/character/yako/chain';
import { CYCLE, J_AN_F, J_AN_N, J_COUNT, Rig, STANCE } from '../../src/render/character/yako/rig';
import { Secondary } from '../../src/render/character/yako/secondary';
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

const NONE: readonly SimEvent[] = [];
const SPEED = 9.6;

/** Runs right at full speed for `frames` at `hz`, returning both ankles' world x per frame and the phase. */
function run(hz: number, frames: number): { n: number[]; f: number[]; ph: number[]; rig: Rig } {
  const rig = new Rig();
  const dt = 1 / hz;
  let cx = 1000;
  const n: number[] = [];
  const f: number[] = [];
  const ph: number[] = [];
  rig.update(dt, 0, view({ cx }), [{ type: 'spawn', x: cx, y: 1280 }]);
  for (let i = 1; i <= frames; i++) {
    cx += (SPEED * 60) / hz;
    rig.update(dt, i * dt, view({ cx, vx: SPEED, motion: 'run', inputX: 1 }), NONE);
    rig.wj(J_AN_N);
    n.push(rig.X);
    rig.wj(J_AN_F);
    f.push(rig.X);
    ph.push(rig.phase);
  }
  return { n, f, ph, rig };
}

describe('yako rig', () => {
  for (const hz of [60, 144]) {
    it(`planted feet do not slide in the run at ${hz} Hz`, () => {
      const { n, f, ph } = run(hz, hz * 8);
      let checked = 0;
      // After the start has blended in: while a foot is in the flat middle of its stance, its
      // ankle stays put in the world.
      for (let i = hz * 2; i < n.length; i++) {
        const a = ph[i] ?? 0;
        const b = ph[i - 1] ?? 0;
        if (a > 0.035 && a < STANCE * 0.6 && b > 0.035 && b < a) {
          expect(Math.abs((n[i] ?? 0) - (n[i - 1] ?? 0))).toBeLessThan(1);
          checked++;
        }
        const a2 = (a + 0.5) % 1;
        const b2 = (b + 0.5) % 1;
        if (a2 > 0.035 && a2 < STANCE * 0.6 && b2 > 0.035 && b2 < a2) {
          expect(Math.abs((f[i] ?? 0) - (f[i - 1] ?? 0))).toBeLessThan(1);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(4);
    });
  }

  it('advances the run phase with distance, one cycle per CYCLE px', () => {
    const { ph } = run(60, 25);
    const d = ((ph[24] ?? 0) - (ph[0] ?? 0) + 1) % 1;
    expect(d).toBeCloseTo(((24 * SPEED) / CYCLE) % 1, 3);
  });

  it('keeps every joint finite and near the body through a turn, a dash and a teleport', () => {
    const rig = new Rig();
    const sec = new Secondary();
    const dt = 1 / 60;
    let cx = 1000;
    const check = (): void => {
      for (let i = 0; i < J_COUNT; i++) {
        rig.wj(i);
        expect(Number.isFinite(rig.X) && Number.isFinite(rig.Y)).toBe(true);
        expect(Math.abs(rig.X - cx)).toBeLessThan(80);
      }
      for (const c of sec.all)
        for (let i = 0; i < c.n; i++) {
          expect(Number.isFinite(c.rx[i]) && Number.isFinite(c.ry[i])).toBe(true);
          expect(Math.hypot((c.rx[i] ?? 0) - cx, (c.ry[i] ?? 0) - 1240)).toBeLessThan(140);
        }
    };
    const step = (i: number, p: PlayerView, ev: readonly SimEvent[] = NONE): void => {
      rig.update(dt, i * dt, p, ev);
      if (rig.sig.spawned) sec.reset();
      sec.update(dt, i * dt, rig, p);
      check();
    };
    let i = 0;
    step(i++, view({ cx }), [{ type: 'spawn', x: cx, y: 1280 }]);
    for (let k = 0; k < 30; k++) {
      cx += SPEED;
      step(i++, view({ cx, vx: SPEED, motion: 'run' }));
    }
    for (let k = 0; k < 30; k++) {
      cx -= SPEED;
      const ev: SimEvent[] = k === 0 ? [{ type: 'turn', x: cx, y: 1280, dir: -1, grounded: true }] : [];
      step(i++, view({ cx, vx: -SPEED, facing: -1, motion: 'run' }), ev);
    }
    for (let k = 0; k < 12; k++) {
      cx -= 24;
      step(i++, view({ cx, vx: -24, facing: -1, motion: 'dash', mode: 'dash', dashDir: -1 }));
    }
    // A teleport with no spawn event: everything must snap, not stretch across the map.
    cx += 3000;
    step(i++, view({ cx, facing: -1 }));
    for (let k = 0; k < 20; k++) step(i++, view({ cx, facing: -1 }));
  });
});

describe('yako chain', () => {
  it('stays stable when stiffened far past 1', () => {
    const c = new Chain({
      len: [6, 6, 6, 6],
      rest: [240, 220, 200, 180],
      kG: [0.3, 0.02],
      kL: [0.3, 0.13],
      drag: 0.03,
      gravity: 400,
      wind: 0,
    });
    c.stiff = 6;
    c.ax = 100;
    c.ay = 100;
    for (let i = 0; i < 120; i++) c.advance(1 / 60, i / 60);
    const x0 = c.rx[4] ?? 0;
    const y0 = c.ry[4] ?? 0;
    c.advance(1 / 60, 2);
    expect(Math.hypot((c.rx[4] ?? 0) - x0, (c.ry[4] ?? 0) - y0)).toBeLessThan(0.05);
  });
});
