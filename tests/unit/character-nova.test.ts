import { describe, expect, it } from 'vitest';
import {
  CYCLE,
  J_COUNT,
  J_HEAD,
  J_HIP,
  J_TOE_A,
  J_TOE_B,
  Rig,
  SPIN_T,
} from '../../src/render/character/nova/rig';
import { Secondary } from '../../src/render/character/nova/secondary';
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
const SPAWN: SimEvent[] = [{ type: 'spawn', x: 1000, y: 1280 }];

/** A rising arc with a double jump at `at`: returns per-frame joints relative to the body. */
function flight(dt: number, at: number, frames: number, vx: number): { rel: Float32Array[]; rig: Rig } {
  const rig = new Rig();
  let cx = 1000;
  let feetY = 1000;
  let vy = -14;
  rig.update(dt, 0, view({ cx, feetY, cy: feetY - 40, grounded: false, motion: 'rise', vx, vy }), SPAWN);
  const rel: Float32Array[] = [];
  const k = dt * 60;
  for (let i = 1; i <= frames; i++) {
    const ev: SimEvent[] = [];
    if (i === at) {
      vy = -13;
      ev.push({ type: 'jump', kind: 'double', x: cx, y: feetY, dir: 1 });
    }
    vy += 0.6 * k;
    cx += vx * k;
    feetY += vy * k;
    const motion = vy < 0 ? 'rise' : 'fall';
    rig.update(dt, i * dt, view({ cx, feetY, cy: feetY - 40, grounded: false, motion, vx, vy }), ev);
    const r = new Float32Array(J_COUNT * 2);
    for (let q = 0; q < J_COUNT; q++) {
      r[q * 2] = (rig.frame.j[q * 2] ?? 0) - cx;
      r[q * 2 + 1] = (rig.frame.j[q * 2 + 1] ?? 0) - feetY;
    }
    rel.push(r);
  }
  return { rel, rig };
}

function maxStep(rel: Float32Array[]): number {
  let m = 0;
  for (let i = 1; i < rel.length; i++) {
    const a = rel[i - 1];
    const b = rel[i];
    if (!a || !b) continue;
    for (let q = 0; q < J_COUNT; q++) {
      m = Math.max(
        m,
        Math.hypot((b[q * 2] ?? 0) - (a[q * 2] ?? 0), (b[q * 2 + 1] ?? 0) - (a[q * 2 + 1] ?? 0)),
      );
    }
  }
  return m;
}

describe('nova: the somersault', () => {
  it('turns one whole turn forward and ends upright', () => {
    const { rig } = flight(DT, 10, 10 + Math.round((SPIN_T + 0.5) / DT), 8);
    expect(rig.spinning).toBe(false);
    expect(rig.spinPhi).toBe(0);
    const head = rig.frame.j[J_HEAD * 2 + 1] ?? 0;
    const hip = rig.frame.j[J_HIP * 2 + 1] ?? 0;
    expect(head).toBeLessThan(hip - 20);
  });

  it('passes through upside-down, in the direction of travel', () => {
    for (const vx of [8, -8]) {
      const rig = new Rig();
      const p = { cx: 1000, feetY: 1000, cy: 960, grounded: false, motion: 'rise', vx, vy: -8 } as const;
      const facing = vx > 0 ? 1 : -1;
      rig.update(DT, 0, view({ ...p, facing }), SPAWN);
      rig.update(DT, DT, view({ ...p, facing }), [
        { type: 'jump', kind: 'double', x: 1000, y: 1000, dir: facing },
      ]);
      let peak = 0;
      for (let i = 2; i < 40; i++) {
        rig.update(DT, i * DT, view({ ...p, facing }), []);
        if (Math.abs(rig.spinPhi) > Math.abs(peak) && Math.abs(rig.spinPhi) < 4) peak = rig.spinPhi;
      }
      // Clockwise on screen (positive) when travelling right.
      expect(Math.sign(peak)).toBe(facing);
      expect(Math.abs(peak)).toBeGreaterThan(Math.PI * 0.9);
    }
  });

  it('never pops: no joint jumps going in, through or out, at 60 and 144 Hz', () => {
    for (const hz of [60, 144]) {
      const dt = 1 / hz;
      const at = Math.round(0.2 / dt);
      const { rel } = flight(dt, at, Math.round(1.2 / dt), 8);
      // The fastest honest motion is a foot on the rim of the spinning tuck: ~25 px radius at
      // ~25 rad/s. Anything well above that per frame would be a pop.
      expect(maxStep(rel) * hz).toBeLessThan(1500);
    }
  });

  it('cut short by a landing, it settles upright without a snap', () => {
    const rig = new Rig();
    const air = { cx: 1000, feetY: 1000, cy: 960, grounded: false, motion: 'rise', vx: 6, vy: -6 } as const;
    rig.update(DT, 0, view(air), SPAWN);
    rig.update(DT, DT, view(air), [{ type: 'jump', kind: 'double', x: 1000, y: 1000, dir: 1 }]);
    for (let i = 2; i < 10; i++) rig.update(DT, i * DT, view(air), []);
    expect(rig.spinning).toBe(true);
    let last = rig.spinPhi;
    let worst = 0;
    for (let i = 10; i < 70; i++) {
      rig.update(DT, i * DT, view({ cx: 1000, feetY: 1000, cy: 960, grounded: true, motion: 'idle' }), []);
      worst = Math.max(worst, Math.abs(rig.spinPhi - last));
      last = rig.spinPhi;
    }
    expect(rig.spinning).toBe(false);
    expect(worst).toBeLessThan(0.7);
  });
});

describe('nova: the run', () => {
  it('a planted foot does not slide, at 60 and 144 Hz', () => {
    for (const hz of [60, 144]) {
      const dt = 1 / hz;
      const rig = new Rig();
      const vx = 9.6;
      let cx = 1000;
      rig.update(dt, 0, view({ cx, vx, motion: 'run' }), SPAWN);
      const slides: number[] = [];
      const last = [Number.NaN, Number.NaN];
      for (let i = 1; i <= 3 * hz; i++) {
        cx += vx * 60 * dt;
        rig.update(dt, i * dt, view({ cx, vx, motion: 'run' }), []);
        if (i < hz) continue;
        for (let side = 0; side < 2; side++) {
          const jt = side === 0 ? J_TOE_A : J_TOE_B;
          const x = rig.frame.j[jt * 2] ?? 0;
          const y = rig.frame.j[jt * 2 + 1] ?? 0;
          const prev = last[side] ?? Number.NaN;
          const down = y > 1280 - 1.2;
          if (down && !Number.isNaN(prev)) slides.push(Math.abs(x - prev));
          last[side] = down ? x : Number.NaN;
        }
      }
      // The body covers 9.6 px a frame at 60 Hz. A planted toe stands still; only the frames of
      // roll-on and roll-off at the ends of each stance may move, and only a little.
      slides.sort((p, q) => p - q);
      expect(slides.length).toBeGreaterThan(12);
      expect(slides[Math.floor(slides.length * 0.25)] ?? 1).toBeLessThan(0.05);
      expect(slides[Math.floor(slides.length * 0.9)] ?? 9).toBeLessThan(2.5);
    }
    expect(CYCLE).toBeGreaterThan(150);
  });
});

describe('nova: chains', () => {
  it('stay finite and attached through a somersault and a teleport', () => {
    const rig = new Rig();
    const sec = new Secondary();
    const air = { cx: 1000, feetY: 1000, cy: 960, grounded: false, motion: 'rise', vx: 8, vy: -8 } as const;
    rig.update(DT, 0, view(air), SPAWN);
    sec.reset();
    sec.update(DT, 0, rig, rig.frame, view(air));
    rig.update(DT, DT, view(air), [{ type: 'jump', kind: 'double', x: 1000, y: 1000, dir: 1 }]);
    for (let i = 2; i < 60; i++) {
      rig.update(DT, i * DT, view(air), []);
      sec.update(DT, i * DT, rig, rig.frame, view(air));
      const n = sec.tail.n - 1;
      expect(Number.isFinite(sec.tail.rx[n])).toBe(true);
      expect(Math.hypot((sec.tail.rx[n] ?? 0) - 1000, (sec.tail.ry[n] ?? 0) - 960)).toBeLessThan(160);
    }
    // A teleport without a spawn event: the rig flags it.
    const far = view({ cx: 3000, feetY: 500, cy: 460 });
    rig.update(DT, 1, far, []);
    expect(rig.sig.spawned).toBe(true);
  });
});
