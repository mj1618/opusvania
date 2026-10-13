import { describe, expect, it } from 'vitest';
import { clampAxis, createCamera, lerpCamera, stepCamera } from '../../src/render/camera/index';
import { cameraTuning } from '../../src/render/camera/tuning';
import { VIEW_H, VIEW_W } from '../../src/render/contract';
import { LightRegistry } from '../../src/render/lights';
import { GROVE } from '../../src/scene/index';
import { feet, newSim } from './helpers';

describe('camera', () => {
  it('clamps to the scene and centres spans smaller than the view', () => {
    expect(clampAxis(-50, 0, 4000, VIEW_W)).toBe(0);
    expect(clampAxis(9999, 0, 4000, VIEW_W)).toBe(4000 - VIEW_W);
    expect(clampAxis(100, 0, 1000, VIEW_W)).toBe(-460);
  });

  it('follows a run softly with look-ahead and never leaves the scene', () => {
    const s = newSim();
    const cam = createCamera(s.state, GROVE);
    let maxStep = 0;
    for (let i = 0; i < 900; i++) {
      s.run(i % 90 < 30 ? 'R+J1' : 'R1');
      const x0 = cam.x;
      stepCamera(cam, s.state, GROVE);
      maxStep = Math.max(maxStep, Math.abs(cam.x - x0));
      expect(cam.x).toBeGreaterThanOrEqual(0);
      expect(cam.x).toBeLessThanOrEqual(GROVE.width - VIEW_W);
      expect(cam.y).toBeGreaterThanOrEqual(0);
      expect(cam.y).toBeLessThanOrEqual(GROVE.height - VIEW_H);
      // The player stays well inside the view.
      const sx = feet(s).x - cam.x;
      if (cam.x > 0 && cam.x < GROVE.width - VIEW_W) {
        expect(sx).toBeGreaterThan(VIEW_W * 0.25);
        expect(sx).toBeLessThan(VIEW_W * 0.75);
      }
    }
    expect(maxStep).toBeLessThanOrEqual(30);
    expect(cam.x).toBe(GROVE.width - VIEW_W);
  });

  it('leads in the direction of travel', () => {
    const s = newSim();
    s.place(2400, 1280);
    const cam = createCamera(s.state, GROVE);
    for (let i = 0; i < 120; i++) {
      s.run('L1');
      stepCamera(cam, s.state, GROVE);
    }
    expect(cam.x + VIEW_W / 2).toBeLessThan(feet(s).x);
  });

  it('barely moves when the player jitters left and right', () => {
    const s = newSim();
    s.place(2400, 1280);
    const cam = createCamera(s.state, GROVE);
    for (let i = 0; i < 60; i++) stepCamera(cam, s.state, GROVE);
    const x0 = cam.x;
    let maxAccel = 0;
    let range = 0;
    let v0 = 0;
    for (let i = 0; i < 240; i++) {
      s.run(i % 24 < 12 ? 'L1' : 'R1');
      const before = cam.x;
      stepCamera(cam, s.state, GROVE);
      const v = cam.x - before;
      maxAccel = Math.max(maxAccel, Math.abs(v - v0));
      v0 = v;
      range = Math.max(range, Math.abs(cam.x - x0));
    }
    expect(range).toBeLessThan(120); // about the player's own travel: no look-ahead swing
    expect(maxAccel).toBeLessThan(1.5);
  });

  it('interpolates between sim frames', () => {
    const s = newSim();
    const a = createCamera(s.state, GROVE);
    const b = { ...a, x: a.x + 10, y: a.y + 4 };
    const v = lerpCamera(a, b, 0.5);
    expect(v).toEqual({ x: a.x + 5 + VIEW_W / 2, y: a.y + 2 + VIEW_H / 2, zoom: 1 });
  });
});

describe('light registry', () => {
  it('keeps lights by id', () => {
    const r = new LightRegistry();
    const ember = { x: 1, y: 2, radius: 200, color: 0xffb36b, intensity: 1 };
    r.set('ember', ember);
    r.set('probe', { ...ember, x: 50 });
    expect(r.list).toHaveLength(2);
    ember.x = 9; // lights are live objects
    expect(r.list[0]?.x).toBe(9);
    r.remove('probe');
    expect(r.list).toEqual([ember]);
  });
});
