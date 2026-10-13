import { describe, expect, it } from 'vitest';
import {
  clampAxis,
  createCamera,
  lerpCamera,
  restOffset,
  stepCamera,
  viewTop,
} from '../../src/render/camera/index';
import { ReformShot, reformSeconds } from '../../src/render/camera/reform';
import { cameraTuning } from '../../src/render/camera/tuning';
import { VIEW_H, VIEW_W } from '../../src/render/contract';
import { LightRegistry } from '../../src/render/lights';
import { GROVE } from '../../src/scene/index';
import { feet, hopOnto, newSim } from './helpers';

describe('camera', () => {
  it('clamps to the scene and centres spans smaller than the view', () => {
    expect(clampAxis(-50, 0, 4000, VIEW_W)).toBe(0);
    expect(clampAxis(9999, 0, 4000, VIEW_W)).toBe(4000 - VIEW_W);
    expect(clampAxis(100, 0, 1000, VIEW_W)).toBe(-460);
  });

  it('follows a run softly with look-ahead and never leaves the scene', () => {
    // (The bluff is taller than a jump: here it is cut down to a hop, so plain running and jumping crosses.)
    const flat = {
      ...GROVE,
      solids: GROVE.solids.map((r) => (r.tag === 'ground' && r.y === 960 ? { ...r, y: 1152, h: 448 } : r)),
    };
    const s = newSim(flat);
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

describe('camera headroom', () => {
  const ct = cameraTuning;
  const summit = { x: 3648, y: 192 };

  it('lets the view rise above the scene top by the headroom over the ceiling, from scene data', () => {
    expect(viewTop({ ...GROVE, ceilingY: -420 })).toBe(-420 - ct.headroom);
    expect(viewTop({ ...GROVE, ceilingY: 0 })).toBe(-ct.headroom);
    expect(viewTop({ ...GROVE, ceilingY: undefined })).toBe(-ct.headroom);
    // A ceiling inside the scene never pulls the view's top below the scene top.
    expect(viewTop({ ...GROVE, ceilingY: 400 })).toBe(0);
  });

  it('frames the summit near the usual anchor under a raised ceiling, and never passes the headroom', () => {
    const scene = { ...GROVE, ceilingY: -420 };
    const s = newSim(scene);
    s.place(summit.x, summit.y);
    const cam = createCamera(s.state, scene);
    // On the summit: sky over her, feet between 60% and 75% of the way down the view.
    expect(cam.y).toBeLessThan(-400);
    const at = (feet(s).y - cam.y) / VIEW_H;
    expect(at).toBeGreaterThan(0.6);
    expect(at).toBeLessThan(0.75);
    // A jump and a double jump there: the view never passes its top, and all of her stays on screen.
    let top = Number.POSITIVE_INFINITY;
    for (const input of ['J1', '.10', 'J1', '.60']) {
      const n = Number(input.slice(1));
      for (let i = 0; i < n; i++) {
        s.run(`${input[0]}1`);
        stepCamera(cam, s.state, scene);
        expect(cam.y).toBeGreaterThanOrEqual(viewTop(scene));
        expect(s.state.player.y - cam.y).toBeGreaterThanOrEqual(ct.headroom - 1);
        top = Math.min(top, s.state.player.y);
      }
    }
    expect(top).toBeLessThan(summit.y - 80 - 100);
  });

  it('keeps the old clamp at the bottom and the sides', () => {
    const scene = { ...GROVE, ceilingY: -420 };
    const s = newSim(scene);
    s.place(5700, 1088);
    const cam = createCamera(s.state, scene);
    expect(cam.x).toBe(scene.width - VIEW_W);
    expect(cam.y).toBeLessThanOrEqual(scene.height - VIEW_H);
  });

  it('does not bob from hop to hop between islands, and settles once she stays', () => {
    const s = newSim();
    const islands = GROVE.solids.filter((r) => r.tag === 'floating');
    const [f3, f4] = [islands[2], islands[3]];
    if (!f3 || !f4) throw new Error('islands moved');
    s.place(f3.x + f3.w / 2, f3.y);
    const cam = createCamera(s.state, GROVE);
    for (let i = 0; i < 90; i++) {
      s.run('.1');
      stepCamera(cam, s.state, GROVE);
    }
    const y0 = cam.y;
    let moved = 0;
    const from = cam.y;
    const hop = (script: string) => {
      for (let i = 0; i < 400; i++) {
        s.run(script);
        stepCamera(cam, s.state, GROVE);
        moved = Math.max(moved, Math.abs(cam.y - from));
        if (s.state.player.grounded && i > 5) break;
      }
    };
    // A jump on the spot, then across to the next island (96 px higher): the view holds.
    hop('J1');
    expect(moved).toBeLessThan(2);
    let frames = 0;
    while (hopOnto(s, f4, 1) !== 0 && frames < 400) {
      frames++; // the pilot one frame at a time, so the camera sees every step
      stepCamera(cam, s.state, GROVE);
      moved = Math.max(moved, Math.abs(cam.y - from));
    }
    expect(frames).toBeLessThan(400);
    expect(moved).toBeLessThan(2);
    expect(cam.y).toBeCloseTo(y0, 0);
    // Staying on the higher island settles the view on her.
    for (let i = 0; i < 200; i++) {
      s.run('.1');
      stepCamera(cam, s.state, GROVE);
    }
    expect(cam.y).toBeCloseTo(f4.y - cameraTuning.anchorY * VIEW_H, 0);
  });
});

describe('camera glide', () => {
  const ct = cameraTuning;

  it('looks further ahead and below her while she glides, and eases back on landing', () => {
    const scene = { ...GROVE, ceilingY: -420 };
    // Off the summit to the right, jump held (the wings open on the way down) or let go (a fall).
    const run = (hold: boolean) => {
      const s = newSim(scene);
      s.place(3648, 192);
      const cam = createCamera(s.state, scene);
      let ahead = Number.NEGATIVE_INFINITY;
      let below = Number.NEGATIVE_INFINITY;
      let glided = 0;
      for (let i = 0; i < 112; i++) {
        s.run(hold || i < 12 ? 'R+J1' : 'R1');
        stepCamera(cam, s.state, scene);
        if (s.state.player.gliding) glided++;
        if (s.state.player.grounded) break;
        // View centre ahead of her; the line the view rests on (feet at the anchor) below her feet.
        ahead = Math.max(ahead, cam.x + VIEW_W / 2 - feet(s).x);
        if (s.state.player.gliding) below = Math.max(below, cam.y + ct.anchorY * VIEW_H - feet(s).y);
      }
      return { ahead, below, glided, cam, s };
    };
    const g = run(true);
    const f = run(false);
    expect(g.glided).toBeGreaterThan(40);
    expect(f.glided).toBe(0);
    expect(g.cam.glide).toBeGreaterThan(0.8);
    // Further ahead than a plain fall gets, inside what the tuning allows; and looking below her feet.
    expect(g.ahead).toBeGreaterThan(f.ahead + 60);
    expect(g.ahead).toBeGreaterThan(120);
    expect(g.ahead).toBeLessThanOrEqual(ct.lookaheadX + ct.glide.extraX);
    expect(g.below).toBeGreaterThan(60);
    expect(g.below).toBeLessThanOrEqual(ct.glide.lookDown);
    // Landed and standing: the glide share runs out and the view comes back to her feet.
    for (let i = 0; i < 400 && !g.s.state.player.grounded; i++) {
      g.s.run('R+J1');
      stepCamera(g.cam, g.s.state, scene);
    }
    for (let i = 0; i < 300; i++) {
      g.s.run('.1');
      stepCamera(g.cam, g.s.state, scene);
    }
    expect(g.cam.glide).toBeLessThan(0.01);
    expect(g.cam.y + ct.anchorY * VIEW_H).toBeCloseTo(feet(g.s).y + g.cam.restY, 0);
  });

  it('leans toward a lantern only when she stands near it', () => {
    const l = GROVE.lanterns?.[0];
    if (!l) throw new Error('no lantern');
    const near = restOffset(l.x - 80, l.y, GROVE);
    expect(near.x).toBeCloseTo(80 * ct.rest.share);
    expect(near.y).toBe(-ct.rest.lift);
    expect(restOffset(l.x - ct.rest.reachX - 1, l.y, GROVE)).toEqual({ x: 0, y: 0 });
    expect(restOffset(l.x, l.y - ct.rest.reachY - 1, GROVE)).toEqual({ x: 0, y: 0 });
  });

  it('holds while she is faded', () => {
    const s = newSim();
    s.place(2400, 1280);
    const cam = createCamera(s.state, GROVE);
    for (let i = 0; i < 40; i++) {
      s.run('R1');
      stepCamera(cam, s.state, GROVE);
    }
    s.state.player.faded = 50;
    let x0 = cam.x;
    let travel = 0;
    for (let i = 0; i < 50; i++) {
      s.state.player.x += 6; // the body is thrown on; the view does not chase it
      stepCamera(cam, s.state, GROVE);
      if (i === 30) x0 = cam.x;
      travel = Math.abs(cam.x - x0);
    }
    expect(travel).toBeLessThan(1);
  });
});

describe('re-form shot', () => {
  const R = cameraTuning.reform;
  const view = (x: number, y: number) => ({ x, y, zoom: 1 });

  it('starts where the view was, never exceeds the pan cap, and decays to zero in time', () => {
    for (const [fx, fy, tx, ty] of [
      [2120, 1040, 1120, 1040],
      [4800, 420, 1120, 1042],
      [960, 1060, 4800, 0],
      [1300, 1040, 1120, 1040],
    ] as const) {
      const shot = new ReformShot();
      const dist = Math.hypot(fx - tx, fy - ty);
      shot.fade(50, dist);
      for (let i = 0; i < 50; i++) shot.update(1 / 60);
      shot.reform(view(fx, fy), view(tx, ty));
      const start = Math.hypot(shot.x, shot.y);
      expect(start).toBeLessThanOrEqual(R.panCap + 1e-6);
      if (dist <= R.panCap) {
        // No cut: the first frame of the pan shows exactly the old view.
        expect(tx + shot.x).toBeCloseTo(fx);
        expect(ty + shot.y).toBeCloseTo(fy);
      }
      const seconds = reformSeconds(dist);
      expect(seconds).toBeLessThanOrEqual(R.secMax);
      let prev = start;
      let maxDip = 0;
      for (let i = 0; i < Math.ceil(seconds * 60) + 1; i++) {
        shot.update(1 / 60);
        const d = Math.hypot(shot.x, shot.y);
        expect(d).toBeLessThanOrEqual(prev + 1e-6); // only ever toward the new spot
        expect(d).toBeLessThanOrEqual(R.panCap);
        prev = d;
        maxDip = Math.max(maxDip, shot.dip);
        expect(shot.dip).toBeLessThanOrEqual(1);
      }
      expect(shot.x).toBe(0);
      expect(shot.y).toBe(0);
      expect(shot.dip).toBe(0);
      // A dip covers a real move; a short one is only an ease.
      if (dist >= R.minDist) expect(maxDip).toBeGreaterThan(R.dip * 0.9);
      else expect(maxDip).toBe(0);
    }
  });

  it('takes longer the further it goes, within its limits', () => {
    expect(reformSeconds(R.minDist)).toBeCloseTo(R.secMin);
    expect(reformSeconds(R.panCap)).toBeCloseTo(R.secMax);
    expect(reformSeconds(99999)).toBeCloseTo(R.secMax);
    expect(reformSeconds(1000)).toBeGreaterThan(reformSeconds(400));
  });

  it('dips on a restart without a pan, and a placement clears everything', () => {
    const shot = new ReformShot();
    shot.restart();
    expect(shot.dip).toBeCloseTo(R.restartDip);
    expect(shot.x).toBe(0);
    for (let i = 0; i < Math.ceil(R.restartSec * 60) + 1; i++) shot.update(1 / 60);
    expect(shot.dip).toBe(0);
    shot.reform(view(3000, 500), view(1000, 900));
    shot.update(1 / 60);
    shot.clear();
    expect([shot.x, shot.y, shot.dip]).toEqual([0, 0, 0]);
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
