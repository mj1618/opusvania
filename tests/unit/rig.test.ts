import { describe, expect, test } from 'vitest';
import { Chain } from '../../src/render/rig/chain';
import { BODY, CHAINS } from '../../src/render/rig/look';
import { ik, type V2 } from '../../src/render/rig/math';
import { followPose, movePhase, newMem, targetPose } from '../../src/render/rig/pose';
import { solve } from '../../src/render/rig/skeleton';
import { boxAt } from '../../src/sim/combat/boxes';
import { MOVES } from '../../src/sim/player/moves';
import type { MoveState, PlayerState } from '../../src/sim/state';

function player(move: MoveState | null, extra: Partial<PlayerState> = {}): PlayerState {
  return {
    x: 0,
    y: 0,
    w: 40,
    h: 80,
    vx: 0,
    vy: 0,
    facing: 1,
    state: 'normal',
    grounded: true,
    skid: false,
    freeze: 0,
    dashTimer: 0,
    down: null,
    move,
    ...extra,
  } as PlayerState;
}

function move(id: string, frame: number, dir: 'fwd' | 'up' | 'down' = 'fwd'): MoveState {
  return { id, frame, dir, facing: 1, outcome: 'none', hitList: [], len: 0, counter: false, soundId: 0 };
}

/** The rig's reach rule: the far end of the move's hitbox, in rig space (feet centre origin). */
function reachFor(m: MoveState): V2 {
  const d = MOVES[m.id];
  const b = d?.hitboxes[m.dir] ?? d?.hitboxes.fwd;
  if (!b) return { x: 30, y: -50 };
  const r = boxAt(0, 0, 40, 1, b);
  const g = BODY.gloveR;
  if (m.dir === 'up') return { x: r.x + r.w / 2 + 6 - 20, y: r.y + g - 80 };
  if (m.dir === 'down') return { x: r.x + r.w / 2 + 4 - 20, y: r.y + r.h - g - 80 };
  return { x: r.x + r.w - g - 20, y: r.y + r.h / 2 - 80 };
}

describe('rig maths', () => {
  test('two-bone IK keeps bone lengths and reaches reachable targets', () => {
    const a = { x: 0, y: 0 };
    const t = { x: 14, y: 9 };
    const { joint, end } = ik(a, t, 12, 12, 1);
    expect(Math.hypot(joint.x - a.x, joint.y - a.y)).toBeCloseTo(12, 5);
    expect(Math.hypot(end.x - joint.x, end.y - joint.y)).toBeCloseTo(12, 5);
    expect(end.x).toBeCloseTo(14, 5);
    expect(end.y).toBeCloseTo(9, 5);
  });

  test('an unreachable target straightens the limb toward it', () => {
    const { end } = ik({ x: 0, y: 0 }, { x: 100, y: 0 }, 12, 12, 1);
    expect(end.x).toBeCloseTo(24, 1);
    expect(end.y).toBeCloseTo(0, 5);
  });

  test('verlet chains are deterministic', () => {
    const run = () => {
      const c = new Chain(CHAINS.tail);
      for (let i = 0; i < 60; i++) c.step({ x: i * 7, y: 100 - (i % 9) }, { x: -0.4, y: 0.9 }, 120);
      return [...c.x, ...c.y];
    };
    expect(run()).toEqual(run());
  });
});

describe('rig poses', () => {
  test('targetPose is a pure function of state and memory', () => {
    const p = player(null, { vx: 6.2 });
    const m = newMem();
    m.frame = 77;
    m.runDist = 431;
    const a = targetPose({ p, mem: m, maxRun: 9.6, maxFall: 21 }, reachFor);
    const b = targetPose({ p, mem: { ...m }, maxRun: 9.6, maxFall: 21 }, reachFor);
    expect(a).toEqual(b);
  });

  // Honesty (brief: "visuals must stay honest to collision"): on every hot frame the striking
  // glove is inside its hitbox (± a glove radius); the smear covers the rest of the box.
  for (const id of ['jab', 'cross', 'uppercut', 'overhand']) {
    test(`${id}: the glove is in the hitbox on its active frames`, () => {
      const d = MOVES[id];
      if (!d) throw new Error(id);
      const dir = d.hitboxes.up ? 'up' : d.hitboxes.down ? 'down' : 'fwd';
      const b = d.hitboxes[dir];
      if (!b) throw new Error(id);
      const box = boxAt(-20, -80, 40, 1, b);
      const g = BODY.gloveR + 1;
      const rear = id === 'cross' || id === 'uppercut';
      let pose = targetPose(
        { p: player(move(id, 1, dir)), mem: newMem(), maxRun: 9.6, maxFall: 21 },
        reachFor,
      ).pose;
      for (let f = 1; f <= d.startup + d.active; f++) {
        const m = move(id, f, dir);
        const r = targetPose({ p: player(m), mem: newMem(), maxRun: 9.6, maxFall: 21 }, reachFor);
        pose = followPose(pose, r.pose, r.rate, r.snap);
        if (movePhase(m).stage !== 'active') continue;
        const j = solve(pose);
        const h = rear ? j.haB : j.haF;
        expect(h.x, `${id} f${f} x`).toBeGreaterThanOrEqual(box.x - g);
        expect(h.x, `${id} f${f} x`).toBeLessThanOrEqual(box.x + box.w + g);
        expect(h.y, `${id} f${f} y`).toBeGreaterThanOrEqual(box.y - g);
        expect(h.y, `${id} f${f} y`).toBeLessThanOrEqual(box.y + box.h + g);
      }
    });
  }

  test('the body stays (nearly) inside the 40x80 box while idle and running', () => {
    for (const vx of [0, 4, 9.6]) {
      for (let f = 0; f < 60; f += 3) {
        const m = newMem();
        m.frame = f;
        m.runDist = f * vx;
        const { pose } = targetPose({ p: player(null, { vx }), mem: m, maxRun: 9.6, maxFall: 21 }, reachFor);
        const j = solve(pose);
        for (const q of [j.hip, j.neck, j.head])
          expect(Math.abs(q.x), `core vx ${vx} f${f}`).toBeLessThanOrEqual(20);
        // A full-speed stride may poke a boot a few px past the box ("slightly exceed").
        for (const q of [j.hip, j.neck, j.head, j.anF, j.anB, j.knF, j.knB]) {
          expect(Math.abs(q.x), `vx ${vx} f${f}`).toBeLessThanOrEqual(26);
          expect(q.y).toBeGreaterThanOrEqual(-82);
          expect(q.y).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
