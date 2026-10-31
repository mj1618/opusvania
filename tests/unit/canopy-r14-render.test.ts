/**
 * The Canopy r14, render (memory/canopy-render.md "Round 14"): the line waits for the column, camera zones honour
 * `after` and `lean`, the sweep's tell is read apart from the eat, the escape's rumble builds.
 */
import { describe, expect, it } from 'vitest';
import { escapeRumble } from '../../src/render/camera/shake';
import { zoneAt, zoneLean, zoneZoomFrames } from '../../src/render/camera/zones';
import { sweepRead } from '../../src/render/enemies/keeper-tells';
import { LINE_TIME, LineTimer } from '../../src/render/hud/line-logic';
import { RELEASE } from '../../src/render/lantern/release';
import type { CameraZone } from '../../src/scene/room';

const T = { sweepTell: 42, sweepHitFrames: 10 };
const keeper = (mode: string, modeFrames = 0, timer = 0) => ({
  kind: 'oldBurrback',
  mode,
  modeFrames,
  timer,
});

describe('the line waits for the great release (review r13 #1)', () => {
  it('a line shown with a hold stays down until the hold is over, then shows whole', () => {
    const l = new LineTimer();
    l.show('A new light kindles.');
    l.hold(RELEASE.greatClear);
    let t = 0;
    let firstUp = -1;
    for (; t < RELEASE.greatClear + 3; t += 1 / 60) {
      const a = l.update(1 / 60, false);
      if (a > 0 && firstUp < 0) firstUp = t;
    }
    expect(firstUp).toBeGreaterThanOrEqual(RELEASE.greatClear - 0.05);
    expect(firstUp).toBeLessThan(RELEASE.greatClear + LINE_TIME.in);
  });
});

describe('camera zones (the Canopy r14)', () => {
  const z: CameraZone = {
    id: 'crown-sit',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    zoom: 1.3,
    after: 'cn-kin-sat',
    frames: 120,
  };
  it('`after` keeps a zone off until its flag', () => {
    expect(zoneAt([z], 50, 50, [])).toBeNull();
    expect(zoneAt([z], 50, 50, ['cn-kin-sat'])?.id).toBe('crown-sit');
  });
  it('a lean is read, a staged zone eases its zoom over its frames', () => {
    const l = { ...z, lean: { x: 10, y: 20, k: 0.5 } } as CameraZone;
    expect(zoneLean(l)).toEqual({ x: 10, y: 20, k: 0.5 });
    expect(zoneLean(z)).toBeNull();
    expect(zoneZoomFrames(z, 30, undefined)).toBe(120);
    expect(zoneZoomFrames(null, 30, 20)).toBe(30);
  });
});

describe("the Keeper's sweep is told apart from eating (review r13 #2)", () => {
  it('reads the tell from `boss.sweep` 1 or mode `sweep`, the strike from 2, and nothing from an eat', () => {
    expect(sweepRead({ sweep: 1, tell: 'sweep', tellFrames: 21 }, keeper('sweep'), T).tell).toBeCloseTo(0.5);
    expect(sweepRead({ sweep: 0 }, keeper('sweep', 10, 30), T).tell).toBeCloseTo(0.25);
    expect(sweepRead({ sweep: 2, sweepHit: 5 }, keeper('sweep'), T).strike).toBeCloseTo(0.5);
    const eat = sweepRead({ sweep: 3 }, keeper('eat'), T);
    expect(eat.tell).toBe(-1);
    expect(eat.strike).toBe(-1);
  });
});

describe("the escape's rumble", () => {
  it('is off when it is not running and builds while it runs', () => {
    expect(escapeRumble(false, 600)).toBe(0);
    const a = escapeRumble(true, 0);
    const b = escapeRumble(true, 60 * 30);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });
});
