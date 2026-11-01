/**
 * The hit-feel layer's pure parts (canopy r22, memory/feel.md "Hit juice"): which ichor a kind bleeds, the
 * render-side hash, where debris meets the room, and the flung body of light fodder.
 */
import { describe, expect, it } from 'vitest';
import { CameraKick } from '../../src/render/camera/kick';
import { cameraTuning } from '../../src/render/camera/tuning';
import { FLUNG, FlungBody } from '../../src/render/enemies/flung';
import { type Contact, groundBelow, sweepPoint } from '../../src/render/enemies/ground';
import { hash01, ichorFamily } from '../../src/render/enemies/hitfx';
import type { SimEvent } from '../../src/sim/events';
import type { Scene } from '../../src/sim/scene';

const room = {
  width: 2000,
  height: 1000,
  solids: [
    { x: 0, y: 600, w: 2000, h: 400, tag: 'ground' },
    { x: 900, y: 300, w: 100, h: 300, tag: 'ground' },
  ],
  oneWays: [{ x: 300, y: 450, w: 200, tag: 'ground' }],
} as unknown as Scene;

describe('hit juice', () => {
  it('bleeds by family, matched by name so new kinds land right', () => {
    expect(ichorFamily('burrback')).toBe('amber');
    expect(ichorFamily('juvenileBurrback')).toBe('amber');
    expect(ichorFamily('bombardier')).toBe('amber');
    expect(ichorFamily('carrier')).toBe('ant');
    expect(ichorFamily('jumpingSpider')).toBe('spider');
    expect(ichorFamily('huntsman')).toBe('spider');
    expect(ichorFamily('dangler')).toBe('spider');
    expect(ichorFamily('lampwing')).toBe('dust');
    expect(ichorFamily('hawker')).toBe('dust');
  });

  it('hashes the same every time, spread over [0, 1)', () => {
    expect(hash01(12, 3)).toBe(hash01(12, 3));
    const xs = Array.from({ length: 200 }, (_, i) => hash01(77, i));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeGreaterThan(0.4);
  });

  it('a falling drop lands on a top, one going sideways meets a wall, a one-way only catches a fall', () => {
    const c: Contact = { kind: 'none', x: 0, y: 0, nx: 0 };
    expect(sweepPoint(room, 100, 590, 104, 606, c).kind).toBe('top');
    expect(c.y).toBe(600);
    expect(sweepPoint(room, 890, 400, 905, 402, c).kind).toBe('wall');
    expect(c.x).toBe(900);
    expect(c.nx).toBe(-1);
    expect(sweepPoint(room, 400, 440, 400, 455, c).kind).toBe('top');
    expect(c.y).toBe(450);
    expect(sweepPoint(room, 400, 460, 400, 445, c).kind).toBe('none');
    expect(groundBelow(room, 400, 300)).toBe(450);
    expect(groundBelow(room, 950, 0)).toBe(300);
  });

  it('a flung body flies along the blow, bounces, lies on its back, then fades and is gone', () => {
    const b = new FlungBody();
    b.launch(200, 600, 'fwd', 1, 1);
    let maxUp = 0;
    let bounces = 0;
    for (let f = 0; f < 60 * 6 && b.alive; f++) {
      b.step(1 / 60, room);
      maxUp = Math.max(maxUp, 600 - b.y);
      if (b.thud > FLUNG.rest) bounces++;
      expect(b.y).toBeLessThanOrEqual(600);
    }
    expect(b.x).toBeGreaterThan(260);
    expect(b.x).toBeLessThan(900);
    expect(maxUp).toBeGreaterThan(20);
    expect(bounces).toBeGreaterThanOrEqual(1);
    expect(b.alive).toBe(false);
    // On its back when it came to rest.
    const r = new FlungBody();
    r.launch(200, 600, 'fwd', -1, 2);
    for (let f = 0; f < 60 * 2.5; f++) r.step(1 / 60, room);
    expect(r.down).toBe(true);
    expect(Math.abs(Math.cos(r.ang) + 1)).toBeLessThan(0.05);
    expect(r.alpha).toBe(1);
  });

  it('the finisher that kills punches the view in and lets it back out; a cut that kills does not', () => {
    const impact = (power: number) =>
      ({
        type: 'impact',
        x: 0,
        y: 0,
        dir: 'fwd',
        facing: 1,
        step: power >= 2 ? 3 : 1,
        power,
        hits: 1,
      }) as SimEvent;
    const die = { type: 'enemyDie' } as SimEvent;
    const k = new CameraKick();
    k.update(0, [impact(2), die]);
    expect(k.zoom).toBeCloseTo(1 + cameraTuning.kick.punch);
    for (let f = 0; f < 30; f++) k.update(1 / 60, []);
    expect(k.zoom).toBeLessThan(1.002);
    const c = new CameraKick();
    c.update(0, [impact(1), die]);
    expect(c.zoom).toBe(1);
  });
});
