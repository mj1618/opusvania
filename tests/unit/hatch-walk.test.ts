import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { newSim, type Sim } from './helpers';

/**
 * wood-hatch as the first-timers walked it (2026-10-17, curious and impatient; playtest-reports/...-firsttimer-*):
 * - "a small step blocked my walk until I jumped": S1 met S2 at x 1504 with a 61 px step (the burl); `R120` from
 *   the cocoon stood at x 1484. S1's tail now rises in steps of <= 12 px, so a walker runs onto S2.
 * - "each fall sent me back to the cocoon": a catch put her back on her last *safe* ground (30 frames in a row),
 *   which a player who hops every bend never refreshes: behind the burl on S1 (x 1432 / 1484), after falls from
 *   S2. A fall now puts her back on the last ground she stood on, inset from its lip: on S2.
 */

const W = getRoom('wood-hatch');
const R = ActionBit.right;
const J = ActionBit.jump;
const feet = (s: Sim) => ({
  x: s.state.player.x + s.state.player.w / 2,
  y: s.state.player.y + s.state.player.h,
});
function hold(s: Sim, mask: number, n: number): SimEvent[] {
  const from = s.events.length;
  for (let i = 0; i < n; i++) step(s.state, mask, s.tuning, s.scene, s.events);
  return s.events.slice(from);
}
/** Out of the cocoon at the spawn (a placement ends the hatching silently). */
function hatched(): Sim {
  const s = newSim(W);
  s.place(W.spawn.x, W.spawn.y);
  hold(s, 0, 10);
  return s;
}

describe('wood-hatch, walked', () => {
  it('no step on the branch is a wall: every abutting step up is <= the rolling ground step', () => {
    const solids = W.solids.filter((q) => q.tag !== 'trunk').sort((a, b) => a.x - b.x);
    for (let i = 1; i < solids.length; i++) {
      const a = solids[i - 1];
      const b = solids[i];
      if (!a || !b || a.x + a.w !== b.x) continue;
      expect(a.y - b.y, `step at x ${b.x}`).toBeLessThanOrEqual(12);
    }
  });

  it('holding right from the cocoon she walks onto S2 and on to gap A without a jump', () => {
    const s = hatched();
    let blocked = 0;
    let maxX = 0;
    for (let i = 0; i < 240 && s.state.player.grounded; i++) {
      hold(s, R, 1);
      if (s.state.player.grounded && s.state.player.wallDir === 1) blocked++;
      maxX = Math.max(maxX, feet(s).x);
    }
    expect(blocked).toBe(0);
    expect(maxX).toBeGreaterThan(2000);
  });

  it('a walk-off from S2 into gap A puts her back on S2 in ~1.2 s', () => {
    const s = hatched();
    s.place(1900, 957);
    hold(s, 0, 5);
    let fell = -1;
    let back: { x: number; y: number } | undefined;
    for (let n = 0; n < 300 && !back; n++) {
      const e = hold(s, R, 1);
      if (fell < 0 && e.some((x) => x.type === 'fall')) fell = n;
      back = e.find((x) => x.type === 'fallReturn') as { x: number; y: number } | undefined;
      if (back) expect(n - fell, 'frames from the lip to back on the branch').toBeLessThan(75);
    }
    if (!back) throw new Error('no fall');
    expect(back.x).toBeGreaterThan(1504);
    expect(back.x).toBeLessThan(2048);
  });

  it("the first-timers' hops: no fall puts her back behind the burl, and the hatching is never replayed", () => {
    for (const script of [
      // impatient: R120, then R+J20 R100 R+J20 R60
      [
        [R, 120],
        [R | J, 20],
        [R, 100],
        [R | J, 20],
        [R, 60],
        [0, 60],
      ],
      // curious: R60 R+J20 R60, R+J20 R40 R+J20 R60, R+J25 R30
      [
        [R, 120],
        [R, 60],
        [R | J, 20],
        [R, 60],
        [R | J, 20],
        [R, 40],
        [R | J, 20],
        [R, 60],
        [R | J, 25],
        [R, 30],
        [0, 60],
      ],
    ] as const) {
      const s = hatched();
      const ev: SimEvent[] = [];
      for (const [mask, n] of script) ev.push(...hold(s, mask, n));
      const backs = ev.filter((e) => e.type === 'fallReturn') as { x: number }[];
      for (const b of backs) expect(b.x).toBeGreaterThan(1504);
      expect(ev.some((e) => e.type === 'hatch' || e.type === 'hatchStir')).toBe(false);
      expect(s.state.hatch?.done).toBe(true);
    }
  });
});
