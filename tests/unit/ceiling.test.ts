import { describe, expect, it } from 'vitest';
import { parseInputScript } from '../../src/input/script';
import { GROVE } from '../../src/scene/index';
import { step } from '../../src/sim/index';
import type { Scene } from '../../src/sim/scene';
import { defaultTuning } from '../../src/sim/tuning';
import { feet, flatScene, newSim, type Sim } from './helpers';

/** The canopy: a soft ceiling at the scene's `ceilingY`, so she never leaves the top of the picture. */
const CEIL = 500;
const withCeiling = (extra: Partial<Scene> = {}): Scene => ({ ...flatScene(), ceilingY: CEIL, ...extra });
/** Runs a script; returns the smallest y her box top reached and the events. */
function climb(s: Sim, script: string) {
  let top = 9e9;
  const from = s.events.length;
  const xs: number[] = [];
  const vxs: number[] = [];
  for (const m of parseInputScript(script)) {
    step(s.state, m, s.tuning, s.scene, s.events);
    top = Math.min(top, s.state.player.y);
    xs.push(s.state.player.x);
    vxs.push(s.state.player.vx);
  }
  return { top, ev: s.events.slice(from), xs, vxs };
}

describe('the canopy ceiling', () => {
  it('the grove has one at the top of the scene; scenes without `ceilingY` are open', () => {
    expect(GROVE.ceilingY).toBe(0);
    const open = newSim(flatScene());
    open.place(2000, 800);
    expect(climb(open, 'J28 .1 J40').top).toBeLessThan(CEIL - 100);
  });

  it('jump, double jump, wall jump and pogo all ease to a stop under it: never above, no head bump', () => {
    // A jump and a double jump from the floor (her head starts 220 px under the ceiling).
    const s = newSim(withCeiling());
    s.place(2000, 800);
    const a = climb(s, 'J28 .1 J40');
    expect(a.top).toBe(CEIL);
    expect(a.ev.filter((e) => e.type === 'headBump')).toEqual([]);
    expect(a.ev.filter((e) => e.type === 'jump').map((e) => (e.type === 'jump' ? e.kind : ''))).toEqual([
      'ground',
      'double',
    ]);
    // A soft stop: she slows over the last stretch (never more than half the gap in one frame).
    const t = newSim(withCeiling());
    t.place(2000, 800);
    let prevY = t.state.player.y;
    for (const m of parseInputScript('J30')) {
      step(t.state, m, t.tuning, t.scene, t.events);
      const y = t.state.player.y;
      if (y < prevY)
        expect(prevY - y).toBeLessThanOrEqual(Math.ceil((prevY - CEIL) * defaultTuning.ceiling.rate) + 1);
      expect(y).toBeGreaterThanOrEqual(CEIL);
      prevY = y;
    }
    // A wall-jump shaft that runs up through the ceiling.
    const shaft = withCeiling({
      solids: [
        ...flatScene().solids,
        { tag: 'trunk', x: 1800, y: 0, w: 100, h: 700 },
        { tag: 'trunk', x: 2100, y: 0, w: 100, h: 700 },
      ],
    });
    const w = newSim(shaft);
    w.place(2000, 800);
    const b = climb(w, Array.from({ length: 8 }, () => 'R+J30 R6 L+J30 L6').join(' '));
    expect(b.ev.filter((e) => e.type === 'jump' && e.kind === 'wall').length).toBeGreaterThan(4);
    expect(b.top).toBeGreaterThanOrEqual(CEIL);
    expect(b.top).toBeLessThan(CEIL + 12);
    expect(b.ev.filter((e) => e.type === 'headBump')).toEqual([]);
    // A pogo off a pod just under it.
    const p = newSim(
      withCeiling({
        pods: [{ id: 'pod', x: 2000, y: 640, mount: 'hang' }],
        oneWays: [{ tag: 'branch', x: 1900, y: 600, w: 200 }],
      }),
    );
    p.place(2000, 600);
    const c = climb(p, 'J6 D+A1 .40');
    expect(c.ev.some((e) => e.type === 'slashHit' && e.pogo)).toBe(true);
    expect(c.top).toBeGreaterThanOrEqual(CEIL);
    expect(c.top).toBeLessThan(CEIL + 12);
  });

  it('sideways motion is untouched, and the glide still opens under it', () => {
    const a = newSim(withCeiling());
    const b = newSim(flatScene());
    a.place(2000, 800);
    b.place(2000, 800);
    // Taps, so no glide: the capped flight falls sooner but x and vx match frame for frame.
    const script = 'R10 R+J14 R16 R+J10 R12 R+X1 R20';
    const ca = climb(a, script);
    const cb = climb(b, script);
    expect(ca.top).toBeGreaterThanOrEqual(CEIL);
    expect(ca.top).toBeLessThan(CEIL + 12);
    expect(cb.top).toBeLessThan(CEIL);
    expect(ca.xs).toEqual(cb.xs);
    expect(ca.vxs).toEqual(cb.vxs);
    expect(ca.ev.some((e) => e.type === 'dashStart')).toBe(true);
    // Held after the double jump, the wings open as she comes off the ceiling, and carry her on.
    const g = newSim(withCeiling());
    g.place(2000, 800);
    const cg = climb(g, 'R+J28 R1 R+J60');
    expect(cg.top).toBe(CEIL);
    expect(cg.ev.some((e) => e.type === 'glideStart')).toBe(true);
  });

  it('in the grove: from the summit (trunk B) nothing takes the top of her box above the scene', () => {
    for (const script of ['J28 .1 J60', 'R+J28 R1 R+J200', 'L+J20 L1 L+J10 L+X1 L+J200', 'J10 .1 J60']) {
      const s = newSim();
      s.place(3648, 192);
      const r = climb(s, script);
      expect(r.top, script).toBeGreaterThanOrEqual(0);
      expect(r.ev.filter((e) => e.type === 'headBump')).toEqual([]);
    }
    // A full jump from the highest standing point still has 112 px of rise before the stop.
    const s = newSim();
    s.place(3648, 192);
    expect(feet(s).y - 80).toBe(112);
    expect(climb(s, 'J40').top).toBe(0);
  });
});
