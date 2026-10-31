/**
 * The Canopy, round 16 (the first ten minutes; first-timer ft15fix was stuck 5 of its 7 minutes):
 *  - The hub's cage hangs at her head: the forward cut a player makes walking up to it lands, standing, from either
 *    side; the Lamp pressed by it is answered ("not like that": `lureRefuse`), never a fling.
 *  - The hub's east bank is a plain step from the floor (the lampoak's limb no longer roofs it).
 *  - A shut root door pushed from the side that does not open it says so (`shortcutShut`); from its own side it opens.
 *  - The fallen giant's bramble bed has wide knuckles.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');
const { right: R, left: L, attack: A, jump: J, lamp: B } = ActionBit;

function at(room: string, x: number, y: number, kit: string[] = []): GameState {
  const scene = getRoom(room);
  const s = createState(1, t, scene, [], kit as never, newSave(kit as never));
  placePlayer(s, x, y, t, withShortcuts(scene, s.save), []);
  s.enemies.length = 0;
  return s;
}
function run(s: GameState, input: number, n = 1, ev: SimEvent[] = []): SimEvent[] {
  for (let k = 0; k < n; k++) {
    const e: SimEvent[] = [];
    step(s, input, t, withShortcuts(getRoom(s.room), s.save), e, W);
    ev.push(...e);
  }
  return ev;
}
const feetX = (s: GameState) => s.player.x + s.player.w / 2;
const feetY = (s: GameState) => s.player.y + s.player.h;

describe("the hub's cage, learnable (r16)", () => {
  const cage = (getRoom('cn-hub').lures ?? []).find((l) => l.id === 'trap-crossing');

  it('hangs at her head over the floor', () => {
    expect(cage?.trap).toBe(true);
    expect(1600 - (cage?.y ?? 0)).toBeLessThanOrEqual(130);
  });

  for (const [x, face] of [
    [6150, R],
    [6230, R],
    [6400, L],
  ] as const)
    it(`three forward cuts standing from ${x} free it`, () => {
      const s = at('cn-hub', x, 1600);
      const ev = run(s, 0, 20);
      run(s, face, 2, ev);
      run(s, 0, 4, ev);
      for (let i = 0; i < 3; i++) {
        run(s, A, 1, ev);
        run(s, 0, 24, ev);
      }
      expect(ev.filter((e) => e.type === 'lureHit' && e.id === 'trap-crossing').length).toBe(2);
      expect(ev.some((e) => e.type === 'lureSnuff' && e.id === 'trap-crossing')).toBe(true);
      expect(s.save.moths).toBe(30);
    });

  it('the Lamp pressed by it says "not like that" and flings nothing', () => {
    const s = at('cn-hub', 6200, 1600);
    const ev = run(s, 0, 20);
    run(s, B, 1, ev);
    run(s, 0, 10, ev);
    const r = ev.filter((e) => e.type === 'lureRefuse');
    expect(r.length).toBe(1);
    expect(r[0]?.type === 'lureRefuse' && r[0].side).toBe(-1);
    expect(ev.some((e) => e.type === 'flingStart')).toBe(false);
  });

  it('far from it, the Lamp is silent', () => {
    const s = at('cn-hub', 5600, 1600);
    const ev = run(s, 0, 20);
    run(s, B, 1, ev);
    run(s, 0, 10, ev);
    expect(ev.some((e) => e.type === 'lureRefuse')).toBe(false);
  });
});

describe("the hub's east bank (r16)", () => {
  it('a running jump from the floor stands her on it, no claws', () => {
    const s = at('cn-hub', 6900, 1600);
    run(s, 0, 20);
    run(s, R, 30);
    run(s, R | J, 20);
    run(s, R, 30);
    expect(feetY(s)).toBe(1344);
    expect(feetX(s)).toBeGreaterThan(7232);
  });
});

describe('a shut root door says so (r16)', () => {
  it("pushed from the well's side: shortcutShut, still shut", () => {
    const s = at('cn-well', 2250, 4928, ['wallJump']);
    const ev = run(s, 0, 20);
    run(s, R, 90, ev);
    const shut = ev.filter((e) => e.type === 'shortcutShut' && e.id === 'rot-wall');
    expect(shut.length).toBeGreaterThanOrEqual(1);
    expect(shut.length).toBeLessThanOrEqual(3);
    expect(s.save.opened).not.toContain('cn-well:rot-wall');
  });
});

describe("the fallen giant's bramble bed (r16)", () => {
  it('its two knuckles are 160 wide, 96 over the floor', () => {
    const ow = getRoom('cn-trunk').oneWays.filter((o) => o.y === 608);
    expect(ow.map((o) => o.w)).toEqual([160, 160]);
  });
});
