/**
 * L2 playtest P1 (juice under-sold): hard landings must shake visibly, landing dust must spread
 * about two bodies wide, and death must flash, hold and pop. Render-side juice is pure TS.
 */
import { describe, expect, it } from 'vitest';
import { createCamera, stepCamera } from '../../src/render/camera/index';
import { cameraTuning as ct } from '../../src/render/camera/tuning';
import { fxTuning, Juice } from '../../src/render/fx';
import type { SimEvent } from '../../src/sim/events';
import { createState } from '../../src/sim/index';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { getRoom } from '../../src/sim/world/rooms';

const tuning = cloneTuning(defaultTuning);
const BODY_W = tuning.body.width;

function fresh() {
  const s = createState({ seed: 1, roomId: 'gym-01' }, tuning);
  return { s, juice: new Juice(), cam: createCamera(s, getRoom('gym-01')) };
}

const x0 = 500;
const hardLand: SimEvent = { type: 'land', x: x0, y: 1000, vy: tuning.jump.maxFall, fallPx: 600, hard: true };

describe('juice amplitudes (L2 playtest P1)', () => {
  it('a hard landing shakes the camera by at least 6 px', () => {
    const { s, cam } = fresh();
    stepCamera(cam, s, getRoom('gym-01'), [hardLand]);
    const amp = ct.shakeMaxPx * (cam.trauma + ct.traumaDecay) ** 2;
    expect(amp).toBeGreaterThanOrEqual(6);
  });

  it('death shakes the camera by at least 12 px', () => {
    const { s, cam } = fresh();
    stepCamera(cam, s, getRoom('gym-01'), [{ type: 'death', x: 0, y: 0 }]);
    expect(ct.shakeMaxPx * (cam.trauma + ct.traumaDecay) ** 2).toBeGreaterThanOrEqual(12);
  });

  it('hard-landing dust spreads at least two bodies wide each side, with 20+ particles', () => {
    const { s, juice } = fresh();
    juice.step(s, [hardLand]);
    expect(juice.particles.length).toBeGreaterThanOrEqual(20);
    let reach = 0;
    for (let i = 0; i < 30; i++) {
      juice.step(s, []);
      for (const q of juice.particles) reach = Math.max(reach, Math.abs(q.x - x0));
    }
    expect(reach).toBeGreaterThanOrEqual(2 * BODY_W + 40);
  });

  it('death: white flash, hold, then a 24-particle pop and a screen flash', () => {
    const { s, juice } = fresh();
    juice.step(s, [{ type: 'death', x: 0, y: 0 }]);
    expect(juice.death).not.toBeNull();
    expect(juice.screenFlash).toBeGreaterThan(0);
    expect(juice.particles.length).toBe(0);
    for (let i = 0; i < fxTuning.deathHoldFrames; i++) juice.step(s, []);
    expect(juice.death).toBeNull();
    expect(juice.particles.length).toBe(fxTuning.deathBurst.n);
    for (let i = 0; i < fxTuning.deathScreenFlashFrames; i++) juice.step(s, []);
    expect(juice.screenFlash).toBe(0);
  });
});
