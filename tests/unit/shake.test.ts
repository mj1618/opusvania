import { afterEach, describe, expect, it } from 'vitest';
import { CameraKick } from '../../src/render/camera/kick';
import { CameraShake, FEEL, traumaFor, valueNoise } from '../../src/render/camera/shake';
import { cameraTuning } from '../../src/render/camera/tuning';
import type { SimEvent } from '../../src/sim/events';

const hurt = (hp: number) =>
  ({
    type: 'hurt',
    x: 0,
    y: 0,
    dir: 1,
    hp,
    hpMax: 4,
    damage: 1,
    source: { kind: 'burrback', id: 'b' },
    hitX: 0,
    hitY: 0,
    stagger: 12,
    invuln: 70,
    hitstop: 8,
  }) as unknown as SimEvent;
const snuff = {
  type: 'lureSnuff',
  id: 'w',
  kind: 'wick',
  x: 0,
  y: 0,
  moths: 5,
  freed: 5,
  snuffed: 1,
  heal: 1,
} as unknown as SimEvent;
const impact = (power: number) =>
  ({ type: 'impact', x: 0, y: 0, dir: 'fwd', facing: 1, step: 1, power, hits: 1 }) as unknown as SimEvent;

afterEach(() => {
  FEEL.shake = true;
});

describe('screen shake (trauma)', () => {
  it('the budget: her last light, her hurt, the snuff, a kill, the finisher', () => {
    const B = cameraTuning.shake.budget;
    expect(traumaFor([hurt(2)])).toBe(B.hurt);
    expect(traumaFor([hurt(0)])).toBe(B.fade);
    expect(traumaFor([snuff])).toBe(B.snuff);
    // (Every landed blow is felt a little since Matt's play: the attack read as weightless.)
    expect(traumaFor([impact(1)])).toBe(B.hit);
    expect(B.hit).toBeLessThan(B.finisher);
    expect(traumaFor([impact(2)])).toBe(B.finisher);
    expect(B.fade).toBeGreaterThan(B.hurt);
    expect(B.hurt).toBeGreaterThan(B.snuff);
    expect(B.snuff).toBeGreaterThan(B.kill);
    expect(B.kill).toBeGreaterThan(B.clang);
  });

  it('caps at 1, drains at `decay` a second, shakes max x trauma^power at most, the same every time', () => {
    const S = cameraTuning.shake;
    const a = new CameraShake();
    const b = new CameraShake();
    a.update(1 / 60, [hurt(2), hurt(2), snuff]);
    b.update(1 / 60, [hurt(2), hurt(2), snuff]);
    expect(a.trauma).toBeCloseTo(1 - S.decay / 60, 6);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      const before = a.trauma;
      a.update(1 / 60, []);
      b.update(1 / 60, []);
      expect([a.x, a.y]).toEqual([b.x, b.y]);
      peak = Math.max(peak, Math.hypot(a.x, a.y));
      expect(Math.abs(a.x)).toBeLessThanOrEqual(S.max * before ** S.power + 1e-9);
    }
    expect(peak).toBeGreaterThan(2);
    expect(a.trauma).toBeLessThan(0.01);
  });

  it('smooth noise: continuous, in [-1, 1]', () => {
    for (let t = 0; t < 20; t += 0.01) {
      const v = valueNoise(t, 3);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.abs(valueNoise(t + 0.01, 3) - v)).toBeLessThan(0.05);
    }
  });

  it('a placement starts clean', () => {
    const s = new CameraShake();
    s.update(1 / 60, [hurt(2)]);
    s.update(1 / 60, [{ type: 'spawn', x: 0, y: 0 }]);
    expect(s.trauma).toBe(0);
  });

  it('shake off (accessibility): no shake and no kick', () => {
    FEEL.shake = false;
    const s = new CameraShake();
    const k = new CameraKick();
    s.update(1 / 60, [hurt(2)]);
    k.update(0, [impact(2)]);
    expect([s.x, s.y, k.x, k.y]).toEqual([0, 0, 0, 0]);
  });

  it('the kick: 6 a cut, 11 the finisher, a snuff as hard as a killing finisher', () => {
    const K = cameraTuning.kick;
    const k = new CameraKick();
    k.update(0, [impact(1)]);
    expect(Math.abs(k.x)).toBeCloseTo(K.power1, 6);
    k.update(0, [impact(2)]);
    expect(Math.abs(k.x)).toBeCloseTo(K.power2, 6);
    k.update(0, [impact(1), snuff]);
    expect(Math.abs(k.x)).toBeCloseTo(K.power2 * K.kill, 6);
  });
});
