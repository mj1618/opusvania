/**
 * The Canopy, round 17 (first-timers ft16a-c: every one fell 6-10 times under the hatch's first flame before pressing
 * the Lamp by it; memory/canopy.md v17):
 *  - the safe first flame (`wick-path`) hangs over the middle of S3: a standing jump under it finds it, a miss lands
 *    back on S3, a fling carries her up onto the crown's limb (S4) or the lip (S5); a running jump from S2 to S3 is never
 *    slowed into the gap by its lesson.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { flingTarget } from '../../src/sim/lures';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');

function at(room: string, x: number, y: number): { s: GameState; scene: ReturnType<typeof getRoom> } {
  const scene = getRoom(room);
  const s = createState(1, t, scene, [], [], newSave([]));
  placePlayer(s, x, y, t, withShortcuts(scene, s.save), []);
  s.hatch = null as never;
  return { s, scene };
}

function run(
  s: GameState,
  scene: ReturnType<typeof getRoom>,
  mask: number,
  n: number,
  out: SimEvent[],
): void {
  for (let k = 0; k < n; k++) {
    const e: SimEvent[] = [];
    step(s, mask, t, withShortcuts(scene, s.save), e, W);
    out.push(...e);
  }
}

const lamp = (scene: ReturnType<typeof getRoom>, id: string) =>
  (scene.lures ?? []).findIndex((l) => l.id === id);
const feetX = (s: GameState) => s.player.x + s.player.w / 2;

describe('the Canopy r17: the safe first flame', () => {
  it('a standing jump under it finds it; a miss lands back on S3', () => {
    const { s, scene } = at('cn-hatch', 2640, 850);
    const ev: SimEvent[] = [];
    run(s, scene, 0, 10, ev);
    expect(s.player.grounded).toBe(true);
    let found = false;
    for (let k = 0; k < 40; k++) {
      run(s, scene, k < 18 ? ActionBit.jump : 0, 1, ev);
      if (flingTarget(s, scene, t) === lamp(scene, 'wick-path')) found = true;
    }
    expect(found).toBe(true);
    let k = 0;
    while (!s.player.grounded && k++ < 400) run(s, scene, 0, 1, ev);
    expect(s.player.grounded).toBe(true);
    expect(feetX(s)).toBeGreaterThan(2304);
    expect(feetX(s)).toBeLessThan(2720);
    expect(ev.some((e) => e.type === 'fallCatch')).toBe(false);
  });

  it.each([
    ['nothing held', 0, 0],
    ['right held', ActionBit.right, ActionBit.right],
    ['up-right held', ActionBit.right | ActionBit.up, ActionBit.right],
  ])('a fling (%s) carries her up onto the crown (S4 / S5)', (_n, aim, fly) => {
    const { s, scene } = at('cn-hatch', 2640, 850);
    const ev: SimEvent[] = [];
    run(s, scene, 0, 10, ev);
    let k = 0;
    while (flingTarget(s, scene, t) < 0 && k++ < 40) run(s, scene, ActionBit.jump, 1, ev);
    expect(flingTarget(s, scene, t)).toBe(lamp(scene, 'wick-path'));
    run(s, scene, ActionBit.lamp | aim, 4, ev);
    run(s, scene, aim, 1, ev);
    expect(ev.some((e) => e.type === 'fling')).toBe(true);
    k = 0;
    do run(s, scene, fly, 1, ev);
    while (!s.player.grounded && k++ < 300);
    // (On S4, the crown's limb, or held up-right on to S5, the lip: safe ground either way.)
    expect(feetX(s)).toBeGreaterThan(2880);
    expect(feetX(s)).toBeLessThan(3520);
    expect(s.player.y + s.player.h).toBeLessThan(900);
    expect(ev.some((e) => e.type === 'fallCatch')).toBe(false);
  });

  it('a running jump from S2 across to S3 lands on S3 (its drift never drops her into the gap)', () => {
    for (const from of [1700, 1800, 1900]) {
      const { s, scene } = at('cn-hatch', from, 930);
      const ev: SimEvent[] = [];
      run(s, scene, 0, 6, ev);
      let jumped = -1;
      let k = 0;
      for (; k < 200; k++) {
        if (jumped < 0 && s.player.grounded && feetX(s) >= 2010) jumped = k;
        run(s, scene, ActionBit.right | (jumped >= 0 && k - jumped < 18 ? ActionBit.jump : 0), 1, ev);
        if (jumped >= 0 && k - jumped > 4 && s.player.grounded) break;
      }
      expect(ev.some((e) => e.type === 'fallCatch')).toBe(false);
      expect(feetX(s)).toBeGreaterThan(2304);
    }
  });
});
