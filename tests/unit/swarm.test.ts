import { describe, expect, it } from 'vitest';
import { SWARM } from '../../src/render/swarm/config';
import {
  blendFormations,
  crossFromPolyline,
  FORMATIONS,
  feedAt,
  PATH_POINTS,
  RiverBehaviour,
  timeTable,
} from '../../src/render/swarm/paths';
import { SWARM_PASS, swarmPassWeight } from '../../src/render/swarm/timing';

describe('swarm paths (memory/swarm.md)', () => {
  it('every formation has the same number of points, west to east', () => {
    for (const f of Object.values(FORMATIONS) as (readonly (readonly number[])[])[]) {
      expect(f.length).toBe(PATH_POINTS);
      const xs = f.map((p) => p[0] as number);
      for (let i = 1; i < xs.length; i++) expect(xs[i] as number).toBeGreaterThan(xs[i - 1] as number);
    }
  });

  it('the time table runs 0..1 and never goes back', () => {
    const t = timeTable(blendFormations({ pass: 0.5, lead: 0.5 }));
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeCloseTo(1);
    for (let i = 1; i < t.length; i++) expect(t[i] as number).toBeGreaterThan(t[i - 1] as number);
  });

  it('the feed fills, thins to the tail, and dries up after the release', () => {
    expect(feedAt(-SWARM.feed.headStart - 0.1, 1e6, 0.3)).toBe(0);
    expect(feedAt(3, 1e6, 0.3)).toBeCloseTo(1);
    expect(feedAt(40, 1e6, 0.3)).toBeCloseTo(0.3);
    expect(feedAt(40, 30, 0.3)).toBe(0);
  });
});

describe('the river behaviour', () => {
  const step = (r: RiverBehaviour, camX: number, heroX: number, n = 60) => {
    let p = r.update({ dt: 1 / 60, camX, camY: 800, heroX });
    for (let i = 1; i < n; i++) p = r.update({ dt: 1 / 60, camX, camY: 800, heroX });
    return p;
  };

  it('keeps leaving when she stands still, and never comes back for her', () => {
    const r = new RiverBehaviour(2184, { x: 3700, y: 860 });
    r.start(12, 960, 800);
    const a = step(r, 960, 900, 120);
    const b = step(r, 960, 900, 120);
    expect(b.fx).toBeGreaterThan(a.fx + SWARM.follow.drift * 1.5);
    const c = step(r, 600, 560, 120);
    expect(c.fx).toBeGreaterThanOrEqual(b.fx);
  });

  it('keeps pace with a running camera (no lag), then lets go at the promise gap', () => {
    const r = new RiverBehaviour(2184, { x: 3700, y: 860 });
    r.start(8, 960, 800);
    let p = step(r, 960, 900, 30);
    let x = 960;
    for (let i = 0; i < 90; i++) {
      x += 9;
      p = r.update({ dt: 1 / 60, camX: x, camY: 800, heroX: x - 100 });
    }
    expect(Math.abs(p.fx - x)).toBeLessThan(40);
    expect(p.releaseTau).toBeGreaterThan(1e5);
    p = step(r, 2400, 2300, 10);
    expect(p.releaseTau).toBeLessThan(1e5);
    p = step(r, 2400, 2300, 600);
    expect(Math.abs(p.fx - 3700)).toBeLessThan(60);
  });

  it('the pass over the moon plays out even if she runs straight off (rides with the camera)', () => {
    const r = new RiverBehaviour(2184, { x: 3700, y: 860 });
    r.start(-SWARM.delay, 960, 800);
    let x = 960;
    let p = r.update({ dt: 1 / 60, camX: x, camY: 800, heroX: x });
    for (let i = 0; i < 60 * (SWARM.pass.out - 1); i++) {
      x += 9.6;
      p = r.update({ dt: 1 / 60, camX: x, camY: 800, heroX: x });
      if (r.sinceHatch > SWARM.pass.full && r.sinceHatch < SWARM.pass.hold)
        expect(Math.abs(p.fx - x)).toBeLessThan(2);
    }
    expect(p.releaseTau).toBeGreaterThan(1e5);
    for (let i = 0; i < 120; i++) p = r.update({ dt: 1 / 60, camX: x, camY: 800, heroX: x });
    expect(p.releaseTau).toBeLessThan(1e5);
  });

  it('the timing API: a plateau over the pass, nothing before or after', () => {
    expect(swarmPassWeight(0)).toBe(0);
    expect(swarmPassWeight((SWARM_PASS.full + SWARM_PASS.hold) / 2)).toBe(1);
    expect(swarmPassWeight(SWARM_PASS.out + 0.1)).toBe(0);
  });

  it('the crossing follows the room polyline', () => {
    const f = crossFromPolyline(
      [
        [0, 500],
        [10000, 500],
      ],
      { x: 3700, y: 860 },
    );
    for (const p of f) expect(p[1]).toBe(-360);
  });

  it('finishes once the last moth has crossed', () => {
    const r = new RiverBehaviour(2184, { x: 3700, y: 860 });
    r.start(8, 2400, 800);
    step(r, 2400, 2300, 60 * 30);
    expect(r.running).toBe(false);
  });
});
