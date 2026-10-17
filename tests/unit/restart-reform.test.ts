import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { getRoom } from '../../src/scene/index';
import { GAME_WORLD } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import type { Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { flatScene, newSim, type Sim } from './helpers';

/**
 * Area 1, round 4. (1) In a `reformPatch` room (the oak) a fade re-forms her at the nearest of its own patches
 * at or below where she lay: never above, never past the climb. (2) R in a game: back to the last patch she
 * rested at in this run, everything earned kept, nothing granted or skipped (`Game.restartAtPatch`).
 */

function run(s: Sim, n: number): SimEvent[] {
  const from = s.events.length;
  for (let i = 0; i < n; i++) step(s.state, 0, s.tuning, s.scene, s.events);
  return s.events.slice(from);
}

describe('a reformPatch room re-forms her at its nearest patch at or below her', () => {
  // A column: the floor (1600), the rest ledge (900), the crown (300); she fades on a shelf at 600.
  const oak: Scene = {
    ...flatScene(),
    width: 3000,
    height: 1800,
    senses: 'lamp',
    reformPatch: true,
    reform: { x: 300, y: 1600 },
    solids: [
      { tag: 'ground', x: 0, y: 1600, w: 3000, h: 200 },
      { tag: 'ground', x: 1000, y: 900, w: 600, h: 40 },
      { tag: 'ground', x: 1700, y: 600, w: 400, h: 40 },
      { tag: 'ground', x: 1800, y: 300, w: 400, h: 40 },
    ],
    patches: [
      { id: 'floor', x: 400, y: 1600 },
      { id: 'ledge', x: 1300, y: 900 },
      { id: 'crown', x: 2000, y: 300 },
    ],
  };
  const fadeAt = (x: number, y: number) => {
    const s = newSim(oak);
    s.place(x, y);
    run(s, 5);
    s.state.player.hp = 0;
    s.state.player.faded = 1;
    return run(s, 2).find((e) => e.type === 'reform') as { x: number; y: number } | undefined;
  };

  it('on the shelf under the crown: the rest ledge below, not the nearer crown above', () => {
    expect(fadeAt(1900, 600)).toMatchObject({ x: 1300, y: 900 });
  });

  it('at the crown itself: the crown patch (at her height counts)', () => {
    expect(fadeAt(2000, 300)).toMatchObject({ x: 2000, y: 300 });
  });

  it('on the floor: the floor patch', () => {
    expect(fadeAt(2500, 1600)).toMatchObject({ x: 400, y: 1600 });
  });

  it('below every patch: the room re-form point (the fallback)', () => {
    const s = newSim({ ...oak, patches: [{ id: 'ledge', x: 1300, y: 900 }] });
    s.place(2500, 1600);
    run(s, 5);
    s.state.player.hp = 0;
    s.state.player.faded = 1;
    expect(run(s, 2).find((e) => e.type === 'reform')).toMatchObject({ x: 300, y: 1600 });
  });
});

describe('R in a game: back to the last patch of this run, nothing granted or skipped', () => {
  it('rested at P1, then on: R puts her at P1 with the same abilities, flags and snuffs, no grant', () => {
    const g = new Game(cloneTuning(defaultTuning), getRoom('wood-burrow'), 1, () => 0, [], {
      world: GAME_WORLD,
    });
    g.mode = 'manual';
    const events: SimEvent[] = [];
    g.afterStep.add((ev) => events.push(...ev));
    g.teleport(3776, 1152);
    for (let i = 0; i < 60 && !events.some((e) => e.type === 'patchRest'); i++) {
      g.queueInput([0]);
      g.stepOnce();
    }
    expect(g.state.save.patch).toEqual({ room: 'wood-burrow', id: 'p1' });
    // Elsewhere, with things to keep.
    g.teleport(1000, 1280);
    g.state.save.flags.push('seen-something');
    g.state.save.snuffed.push('wood-burrow:wick-burr');
    const before = structuredClone(g.state.save);
    events.length = 0;
    g.restartAtPatch();
    expect(g.state.room).toBe('wood-burrow');
    const p = g.state.player;
    expect([p.x + p.w / 2, p.y + p.h]).toEqual([3776, 1152]);
    expect(g.state.save.abilities).toEqual(before.abilities);
    expect(g.state.save.flags).toEqual(before.flags);
    expect(g.state.save.snuffed).toEqual(before.snuffed);
    expect(events.some((e) => e.type === 'gladeGrant')).toBe(false);
    expect(events.find((e) => e.type === 'roomEnter')).toMatchObject({ from: 'continue' });
  });

  it('never rested: R goes back to the start of the world, not forward', () => {
    const g = new Game(cloneTuning(defaultTuning), getRoom('wood-burrow'), 1, () => 0, [], {
      world: GAME_WORLD,
    });
    g.state.save.visited.push('wood-burrow');
    g.restartAtPatch();
    expect(g.state.room).toBe(GAME_WORLD.start);
    expect(g.state.save.abilities).toEqual([]);
  });
});
