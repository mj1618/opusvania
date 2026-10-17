import { describe, expect, it } from 'vitest';
import { parseScene } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { Scene } from '../../src/sim/scene';
import { flatScene, newSim, type Sim } from './helpers';

/**
 * A held story beat (feel review round 2, problem 8; journey.md: input held <= 3 s): a trigger with `hold`
 * stops input for that many frames the step it first sets its flag, for the staging (the R2 vista, the hub
 * glimpse) to play with her standing still. Once a save, like the flag.
 */

const R = ActionBit.right;
const J = ActionBit.jump;
const scene = (hold: number): Scene => ({
  ...flatScene(),
  triggers: [{ id: 'vista', x: 2300, y: 600, w: 100, h: 200, sets: 'seen-vista', hold }],
});
function run(s: Sim, mask: number, n: number): SimEvent[] {
  const from = s.events.length;
  for (let i = 0; i < n; i++) step(s.state, mask, s.tuning, s.scene, s.events);
  return s.events.slice(from);
}
const feetX = (s: Sim) => s.state.player.x + s.state.player.w / 2;

describe('a held story beat', () => {
  it('stops her for `hold` frames (she slows to a stand), untouchable, then a held button is not a press', () => {
    const s = newSim(scene(120));
    s.place(2000, 800);
    let ev: SimEvent[] = [];
    for (let i = 0; i < 120 && !ev.some((e) => e.type === 'storyHold'); i++) ev = run(s, R | J, 1);
    expect(ev.find((e) => e.type === 'storyHold')).toMatchObject({ id: 'vista', frames: 120 });
    expect(s.state.player.invuln).toBeGreaterThanOrEqual(120);
    run(s, R | J, 20);
    const x = feetX(s);
    const held = run(s, R | J, 99);
    expect(feetX(s)).toBe(x);
    expect(held.some((e) => e.type === 'jump' || e.type === 'storyHoldEnd')).toBe(false);
    const end = run(s, R | J, 1);
    expect(end.find((e) => e.type === 'storyHoldEnd')).toMatchObject({ id: 'vista' });
    // Then she runs on (the hold of right acts), and the jump held through it is not a jump.
    const after = run(s, R | J, 20);
    expect(feetX(s)).toBeGreaterThan(x);
    expect(after.filter((e) => e.type === 'jump')).toEqual([]);
    // Once a save: walking back through it holds nothing.
    s.place(2000, 800);
    expect(run(s, R, 60).some((e) => e.type === 'storyHold')).toBe(false);
  });

  it('is at most 3 s (180 frames) in room data', () => {
    const base = {
      ...flatScene(),
      triggers: [{ id: 't', x: 100, y: 600, w: 100, h: 200, sets: 'f', hold: 180 }],
    };
    expect(parseScene(base).triggers?.[0]?.hold).toBe(180);
    expect(() => parseScene({ ...base, triggers: [{ ...base.triggers[0], hold: 181 }] })).toThrow();
  });
});
