/**
 * The Canopy, round 18 (first-timers ft17a-d; memory/canopy.md v18):
 *  - a shut root door run into with the key already held says "not from here" at once (`shortcutShut` as the push
 *    starts), and every 45 frames held after;
 *  - the giant's juvenile sleeps at its spot until she is down on its floor near it, wakes harmless, so arriving at
 *    either end of the top (the door, the climb's lip) is never a hit.
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

function at(
  room: string,
  x: number,
  y: number,
  abilities: string[] = [],
): { s: GameState; scene: ReturnType<typeof getRoom> } {
  const scene = getRoom(room);
  const s = createState(1, t, scene, [], [], newSave(abilities as never));
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
  each?: (s: GameState) => void,
): void {
  for (let k = 0; k < n; k++) {
    const e: SimEvent[] = [];
    step(s, mask, t, withShortcuts(scene, s.save), e, W);
    out.push(...e);
    each?.(s);
  }
}

describe('the Canopy r18: a shut root door answers a push at once', () => {
  it.each([
    ['elder-door', 400, ActionBit.left],
    ['rot-wall', 2000, ActionBit.right],
  ])('%s: run into it holding the key from afar', (id, x, key) => {
    const { s, scene } = at('cn-well', x, 4928, ['wallJump']);
    const ev: SimEvent[] = [];
    run(s, scene, 0, 10, ev);
    let touched = -1;
    let shut = -1;
    for (let k = 0; k < 120; k++) {
      const e: SimEvent[] = [];
      run(s, scene, key, 1, e);
      const sc = scene.shortcuts?.find((q) => q.id === id);
      if (!sc) throw new Error(id);
      const p = s.player;
      if (touched < 0 && (p.x === sc.x + sc.w || p.x + p.w === sc.x)) touched = k;
      if (shut < 0 && e.some((q) => q.type === 'shortcutShut' && q.id === id)) shut = k;
    }
    expect(touched).toBeGreaterThanOrEqual(0);
    expect(shut).toBe(touched);
    // Held on: again every 45 frames.
    const more: SimEvent[] = [];
    run(s, scene, key, 90, more);
    expect(more.filter((q) => q.type === 'shortcutShut').length).toBe(2);
  });
});

describe('the Canopy r18: a cut into a shut root door meets its face', () => {
  it('a cut facing the elder door from the well gives `slashTerrain` on it', () => {
    const { s, scene } = at('cn-well', 260, 4928, ['wallJump']);
    const ev: SimEvent[] = [];
    run(s, scene, 0, 10, ev);
    run(s, scene, ActionBit.left, 30, ev);
    run(s, scene, 0, 4, ev);
    const cut: SimEvent[] = [];
    run(s, scene, ActionBit.attack, 2, cut);
    run(s, scene, 0, 20, cut);
    const hit = cut.find((q) => q.type === 'slashTerrain') as { x: number; y: number } | undefined;
    expect(hit).toBeTruthy();
    expect(hit?.x ?? 0).toBeLessThanOrEqual(140);
  });
});

// (r21, Matt: "didn't have to deal with a single enemy": the giant's juvenile is awake now and walks a shorter stretch
// of the top's middle. r18's sleep is still the kind's (`asleep`), no longer used here.)
describe("the giant's juvenile (r21): awake, but never a hit on the frame she arrives at either end of the top", () => {
  const hurtBy = (ev: SimEvent[]) =>
    ev.filter((q) => q.type === 'hurt' && JSON.stringify(q).includes('juvenileBurrback'));

  it.each([
    ['in at the door', 3150],
    ['topped out at the lip', 2650],
  ])('%s and standing still: no hit for the first second', (_n, x) => {
    const { s, scene } = at('cn-trunk', x, 384, ['wallJump']);
    const ev: SimEvent[] = [];
    expect(s.enemies.find((e) => e.id === 'juv-t1')?.mode).not.toBe('sleep');
    run(s, scene, 0, 30, ev);
    // (Nothing at all on her arrival: the top's lampwing tells 36 frames first.)
    expect(ev.filter((q) => q.type === 'hurt')).toEqual([]);
    run(s, scene, 0, 30, ev);
    expect(hurtBy(ev)).toEqual([]);
    // It is a fight, not a sleeper: stepping onto its ground she is noticed and met.
    const key = x > 2830 ? ActionBit.left : ActionBit.right;
    const met: SimEvent[] = [];
    for (let k = 0; k < 120 && !met.some((q) => q.type === 'enemyNotice'); k++)
      run(s, scene, key | (k % 40 < 2 ? ActionBit.jump : 0), 1, met);
    expect(
      [...ev, ...met].some((q) => q.type === 'enemyNotice' && JSON.stringify(q).includes('juv-t1')),
    ).toBe(true);
  });

  it('two cuts as it comes kill it before it can touch her', () => {
    const { s, scene } = at('cn-trunk', 3136, 384, ['wallJump']);
    const ev: SimEvent[] = [];
    const juv = () => s.enemies.find((e) => e.id === 'juv-t1');
    let k = 0;
    while (Math.abs((juv()?.x ?? 0) + 19 - (s.player.x + s.player.w / 2)) > 70 && k++ < 400)
      run(s, scene, 0, 1, ev);
    s.player.facing = -1;
    for (let n = 0; n < 6 && juv()?.mode !== 'dead'; n++) {
      run(s, scene, ActionBit.left | ActionBit.attack, 2, ev);
      run(s, scene, 0, 14, ev);
    }
    expect(juv()?.mode).toBe('dead');
    expect(ev.filter((q) => q.type === 'hurt')).toEqual([]);
  });
});
