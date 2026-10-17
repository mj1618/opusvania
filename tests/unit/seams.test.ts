import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { GAME_WORLD } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { ActionBit } from '../../src/sim/input';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { groundBelow } from '../../src/sim/world';

/**
 * Seam hysteresis (area 1 video r4 #7: after the finale a casual run crossed the crown/canopy seam 190 times in
 * 3.5 min, each a fade). After she comes in through an opening it is shut behind her for `room.seamLockFrames`:
 * holding toward and away from any seam of the world, the room never changes twice within a second.
 */

const R = ActionBit.right;
const L = ActionBit.left;
const J = ActionBit.jump;
const U = ActionBit.up;
const LOCK = defaultTuning.room.seamLockFrames;

/** Every two-way edge seam: `room#exit` whose neighbour links back. */
function seams(): Array<{ room: string; exit: string }> {
  const out: Array<{ room: string; exit: string }> = [];
  for (const [key, link] of Object.entries(GAME_WORLD.links)) {
    if (!link) continue;
    const back = GAME_WORLD.links[`${link.to}#${link.exit}`];
    if (!back) continue;
    const [room, exit] = key.split('#') as [string, string];
    out.push({ room, exit });
  }
  return out;
}

/** Room changes (`roomEnter` frames) over `frames` steps of the input `at(f)`, from her standing at (x, y). */
function flips(room: string, x: number, y: number, at: (f: number) => number, frames: number): number[] {
  const start = GAME_WORLD.rooms[room]?.scene;
  if (!start) throw new Error(`no room ${room}`);
  const g = new Game(cloneTuning(defaultTuning), start, 1, () => 0, ['glide', 'wallJump'], {
    world: GAME_WORLD,
  });
  g.mode = 'manual';
  const when: number[] = [];
  let f = 0;
  g.afterStep.add((ev: readonly SimEvent[]) => {
    if (ev.some((e) => e.type === 'roomEnter')) when.push(f);
  });
  g.teleport(x, y);
  for (; f < frames; f++) {
    g.queueInput([at(f)]);
    g.stepOnce();
  }
  return when;
}

describe('seam hysteresis on every seam of the world', () => {
  const list = seams();
  it('there are seams to test', () => {
    expect(list.length).toBeGreaterThan(5);
  });

  for (const { room, exit } of list) {
    it(`${room}#${exit}: toward and away, never two room changes within ${LOCK} frames`, () => {
      const scene = GAME_WORLD.rooms[room]?.scene;
      const e = scene?.exits?.find((q) => q.id === exit);
      if (!scene || !e) throw new Error('no exit');
      let x: number;
      let y: number;
      let toward: number;
      let away: number;
      if (e.edge === 'e' || e.edge === 'w') {
        x = e.edge === 'e' ? scene.width - 40 : 40;
        const g = groundBelow(scene, x, e.from);
        if (g === null || g > e.to + 4) return; // (an opening in mid-air: no standing start beside it)
        y = g;
        toward = e.edge === 'e' ? R : L;
        away = e.edge === 'e' ? L : R;
      } else {
        x = Math.round((e.from + e.to) / 2);
        const g = groundBelow(scene, x, e.edge === 'n' ? 0 : scene.height - 400);
        if (g === null) return;
        y = g;
        toward = e.edge === 'n' ? J | U : 0;
        away = e.edge === 'n' ? 0 : J;
      }
      // Jittery hands: toward, then back and forth every 20 frames, for 10 s.
      const when = flips(
        room,
        x,
        y,
        (f) => (f < 30 ? toward : Math.floor((f - 30) / 20) % 2 ? toward : away),
        600,
      );
      for (let i = 1; i < when.length; i++)
        expect((when[i] as number) - (when[i - 1] as number)).toBeGreaterThan(LOCK - 1);
    });
  }
});
