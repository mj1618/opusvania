import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import { step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { podsWorth } from '../../src/sim/pods';
import type { Pod } from '../../src/sim/scene';
import { defaultTuning } from '../../src/sim/tuning';
import { feet, hopOnto, newSim, type Sim } from './helpers';

/**
 * Proof that every lumen pod in the grove can be burst with the real controller and real inputs.
 *
 * Each pod has a station: feet on a surface the route pilots in scene.test.ts prove reachable.
 * From there a simple pilot walks up to a sitting pod and slashes forward, or walks under a hanging
 * one, jumps and slashes up when it comes into reach. The row on the right rise is also crossed as
 * one pogo chain. If you move a rect or a pod and one becomes unreachable, this names it.
 */
const { jump: J, attack: A, up: U, down: D } = ActionBit;
const bit = (d: number) => (d > 0 ? ActionBit.right : d < 0 ? ActionBit.left : 0);
const pods = GROVE.pods ?? [];
const T = defaultTuning;
const R = T.pods.radius;

/** Goes for pod `i` from wherever the player stands. Returns frames taken, or -1. */
function burst(s: Sim, i: number, maxFrames = 300): number {
  const p = pods[i] as Pod;
  let prev = 0;
  for (let f = 0; f < maxFrames; f++) {
    if (s.state.pods.hp[i] === 0) return f;
    const b = s.state.player;
    const dx = p.x - (b.x + b.w / 2);
    const cy = b.y + b.h / 2;
    const fresh = (prev & A) === 0;
    let m = 0;
    if (p.mount === 'sit') {
      // Walk to within reach, facing it, then slash forward.
      if (Math.abs(dx) > 100) m = bit(dx);
      else if (fresh) m = bit(dx) | A;
    } else {
      if (Math.abs(dx) > 8) m = bit(dx);
      const inReach = cy - T.slash1.upReach < p.y + R && Math.abs(dx) < T.slash1.upWidth / 2;
      if (inReach && fresh) m |= U | A;
      else if (b.grounded) m |= Math.abs(dx) <= 8 && (prev & J) === 0 ? J : 0;
      else if (b.vy < 0) m |= J;
    }
    step(s.state, m, s.tuning, s.scene, s.events);
    prev = m;
  }
  return -1;
}

/** Stations: feet positions on reachable surfaces, by pod id. */
const STATIONS: Record<string, [x: number, y: number]> = {
  'pod-path-1': [700, 1280],
  'pod-f2': [1300, 1280],
  'pod-f3': [1400, 704],
  'pod-path-2': [1880, 1280],
  'pod-branch-l': [2400, 1280],
  'pod-rise': [2470, 960],
  'pod-ledge': [2900, 448],
  'pod-branch-r': [4300, 1280],
  'pod-f6': [4700, 1088],
  'pod-row-1': [4900, 1088],
  'pod-row-2': [5200, 1088],
  'pod-row-3': [5500, 1088],
};

describe('every pod in the grove can be burst', () => {
  it('each from its station, with a forward or an up slash', () => {
    const s = newSim();
    for (let i = 0; i < pods.length; i++) {
      const p = pods[i] as Pod;
      const st = STATIONS[p.id];
      if (!st) throw new Error(`no station for ${p.id}`);
      s.place(st[0], st[1]);
      expect(feet(s), `station of ${p.id} is not standing ground`).toEqual({ x: st[0], y: st[1] });
      expect(s.state.player.grounded).toBe(true);
      expect(burst(s, i), p.id).toBeGreaterThan(0);
    }
    expect(s.state.pods.burst).toBe(pods.length);
    s.run('.60');
    expect(s.state.pickups.count).toBeGreaterThanOrEqual(podsWorth(GROVE, T.pods));
  });

  it('the stations on platforms are reached by the route pilot', () => {
    const s = newSim();
    const f = GROVE.solids.filter((r) => r.tag === 'floating');
    const ledge = GROVE.solids.find((r) => r.tag === 'ledge');
    for (const r of [GROVE.solids[0], f[0], f[1], f[2]]) expect(hopOnto(s, r as never)).toBeGreaterThan(0);
    expect(
      burst(
        s,
        pods.findIndex((p) => p.id === 'pod-f3'),
      ),
    ).toBeGreaterThan(0);
    for (const r of [f[3], f[4], ledge]) expect(hopOnto(s, r as never)).toBeGreaterThan(0);
    expect(
      burst(
        s,
        pods.findIndex((p) => p.id === 'pod-ledge'),
      ),
    ).toBeGreaterThan(0);
  });

  it('the row on the right rise is one pogo chain: three bounces, never touching the ground', () => {
    const row = pods.map((p, i) => [p, i] as const).filter(([p]) => p.id.startsWith('pod-row-'));
    expect(row).toHaveLength(3);
    const s = newSim();
    s.place(4700, 1088);
    let prev = 0;
    let k = 0;
    let touched = false;
    let air = false;
    for (let f = 0; f < 400 && k < 3; f++) {
      const b = s.state.player;
      const [p, i] = row[k] as (typeof row)[number];
      const dx = p.x - (b.x + b.w / 2);
      // Steer to stay over the next pod; one jump to get going, then only Down + slash.
      let m = Math.abs(dx) > 30 ? bit(dx) : 0;
      if (b.grounded && !air) m |= dx < 300 && (prev & J) === 0 ? J : 0;
      else if (b.attackSeq === 0 && b.vy < 0) m |= J;
      if (!b.grounded) air = true;
      else if (air) touched = true;
      const low = feet(s).y > 1088 - 150 && b.vy > 0;
      if (air && low && Math.abs(dx) < 60 && (prev & A) === 0) m |= D | A;
      step(s.state, m, s.tuning, s.scene, s.events);
      if (s.state.pods.hp[i] === 0) k++;
      prev = m;
    }
    expect(k).toBe(3);
    expect(touched).toBe(false);
    expect(s.state.player.dj).toBe(1);
  });
});
