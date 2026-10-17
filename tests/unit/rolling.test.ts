import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/events';
import { createState, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { Scene, SolidRect } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

const R = ActionBit.right;
const L = ActionBit.left;
const J = ActionBit.jump;

/**
 * Rolling ground (tuning.ground): a run of 64 px rects from x 600 whose tops rise and fall by up to
 * `step` px from one to the next (a hill and a dip), on a 4000 px scene with a floor at 900.
 */
function rolling(stepPx: number, gapAt?: number): Scene {
  const solids: SolidRect[] = [];
  let y = 800;
  const pattern = [0, -1, -1, -1, -1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, -1, -1, -1, -1];
  for (let i = 0; i < 40; i++) {
    const x = 600 + i * 64;
    if (gapAt !== undefined && x >= gapAt && x < gapAt + 192) continue;
    y += (pattern[i % pattern.length] as number) * stepPx;
    solids.push({ tag: 'branch', x, y, w: 64, h: 1000 - y });
  }
  return {
    id: 'roll',
    width: 4000,
    height: 1000,
    spawn: { x: 640, y: solids[0]?.y ?? 800 },
    solids,
    oneWays: [],
  };
}

function run(scene: Scene, start: { x: number; y: number }, script: Array<[number, number]>) {
  const t = cloneTuning(defaultTuning);
  const events: SimEvent[] = [];
  const s = createState(1, t, { ...scene, spawn: start }, events);
  const log: Array<{ x: number; grounded: boolean; vx: number }> = [];
  for (const [mask, n] of script)
    for (let i = 0; i < n; i++) {
      step(s, mask, t, scene, events);
      log.push({ x: s.player.x, grounded: s.player.grounded, vx: s.player.vx });
    }
  return { s, events, log, t };
}

describe('rolling ground: step-up and ground snap', () => {
  const scene = rolling(12);
  const top = (x: number): number => scene.solids.find((q) => x >= q.x && x < q.x + q.w)?.y ?? 0;

  it('at full speed right over a hill and a dip of 12 px steps: grounded every frame, speed kept, no events', () => {
    const r = run(scene, { x: 640, y: top(640) }, [[R, 200]]);
    expect(r.log.every((f) => f.grounded)).toBe(true);
    const max = r.t.run.maxSpeed;
    expect(r.log.slice(40).every((f) => Math.abs(f.vx - max) < 1e-9)).toBe(true);
    const kinds = new Set(r.events.map((e) => e.type));
    for (const k of ['fall', 'land', 'jump', 'headBump', 'cornerCorrect'] as const)
      expect(kinds.has(k)).toBe(false);
    expect(r.s.player.x).toBeGreaterThan(2000);
  });

  it('the same running left', () => {
    const r = run(scene, { x: 2900, y: top(2900) }, [[L, 200]]);
    expect(r.log.every((f) => f.grounded)).toBe(true);
    expect(r.log.slice(40).every((f) => Math.abs(f.vx + r.t.run.maxSpeed) < 1e-9)).toBe(true);
    expect(r.events.some((e) => e.type === 'fall' || e.type === 'land')).toBe(false);
  });

  it('jumps still take off and land normally on it', () => {
    const r = run(scene, { x: 640, y: top(640) }, [
      [R, 40],
      [R | J, 14],
      [R, 60],
    ]);
    const kinds = r.events.map((e) => e.type);
    expect(kinds).toContain('jump');
    expect(kinds).toContain('land');
    expect(kinds).not.toContain('fall');
    expect(r.log.some((f) => !f.grounded)).toBe(true);
  });

  it('a 21 px ledge is a wall again (step-up 20 since area 1 r5), a 13 px drop a fall (snap 12)', () => {
    const hi = run(rolling(21), { x: 640, y: 800 }, [[R, 60]]);
    expect(hi.s.player.vx).toBe(0);
    // Index 5 (x 920) is the hill's top: east of it every rect steps down 13 px.
    const lo = run(rolling(13), { x: 940, y: rolling(13).solids.find((q) => q.x === 920)?.y ?? 0 }, [
      [R, 40],
    ]);
    expect(lo.events.some((e) => e.type === 'fall')).toBe(true);
  });

  it('at a gap edge she falls as before: no snap across a gap, coyote as usual', () => {
    const g = rolling(8, 1240);
    const start = g.solids[0] as SolidRect;
    const r = run(g, { x: 640, y: start.y }, [[R, 70]]);
    const fall = r.events.find((e) => e.type === 'fall');
    expect(fall).toBeDefined();
    expect(fall?.x).toBeGreaterThan(1240 - 40);
    expect(fall?.x).toBeLessThan(1240 + 40);
  });

  it('switched off (stepUp 0, snapDown 0) the 8 px steps stop and drop her again', () => {
    const g = rolling(8);
    const t = cloneTuning(defaultTuning);
    t.ground.stepUp = 0;
    t.ground.snapDown = 0;
    const events: SimEvent[] = [];
    const s = createState(1, t, g, events);
    for (let i = 0; i < 120; i++) step(s, R, t, g, events);
    // The first rise blocks her.
    expect(s.player.x).toBeLessThan(800);
  });
});
