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

describe("the Canopy r18: the giant's juvenile sleeps between two arrivals", () => {
  const hurtBy = (ev: SimEvent[]) =>
    ev.filter((q) => q.type === 'hurt' && JSON.stringify(q).includes('juvenileBurrback'));

  it.each([
    ['in at the door, running west', 3150, ActionBit.left],
    ['topped out at the lip, running east', 2600, ActionBit.right],
  ])('%s: never a hit', (_n, x, key) => {
    const { s, scene } = at('cn-trunk', x, 384, ['wallJump']);
    const ev: SimEvent[] = [];
    run(s, scene, 0, 2, ev);
    expect(s.enemies.find((e) => e.id === 'juv-t1')?.mode).toBe('sleep');
    // Run straight at it and past it (a jump's worth of hops on the way: a blind first-timer).
    for (let k = 0; k < 160; k++) run(s, scene, key | (k % 40 < 2 ? ActionBit.jump : 0), 1, ev);
    expect(hurtBy(ev)).toEqual([]);
  });

  it('she stands at the door: it sleeps on; she comes down near it: it wakes, harmless, then comes', () => {
    const { s, scene } = at('cn-trunk', 3136, 384, ['wallJump']);
    const ev: SimEvent[] = [];
    run(s, scene, 0, 240, ev);
    expect(s.enemies.find((e) => e.id === 'juv-t1')?.mode).toBe('sleep');
    // Walk to 150 px of it and wait.
    let k = 0;
    const woke: SimEvent[] = [];
    while (s.player.x + s.player.w / 2 > 2990 && k++ < 200) run(s, scene, ActionBit.left, 1, woke);
    run(s, scene, 0, 50, woke);
    expect(woke.some((q) => q.type === 'enemyWake')).toBe(true);
    expect(hurtBy(woke)).toEqual([]);
    const later: SimEvent[] = [];
    run(s, scene, 0, 400, later);
    expect(later.some((q) => q.type === 'enemyNotice')).toBe(true);
    expect(hurtBy(later).length).toBeGreaterThan(0);
  });
});

describe("the Canopy r18: the giant's juvenile sleeps again once she has left its top", () => {
  it('woken, then she drops into the hall and comes back up at the lip: it is asleep again, never a hit', () => {
    const { s, scene } = at('cn-trunk', 3000, 384, ['wallJump']);
    const ev: SimEvent[] = [];
    run(s, scene, 0, 120, ev);
    expect(ev.some((q) => q.type === 'enemyWake')).toBe(true);
    // Down off the lip into the hall (she runs west past it: a jump over it).
    let k = 0;
    while (s.player.y < 600 && k++ < 300)
      run(s, scene, ActionBit.left | (k % 30 < 12 ? ActionBit.jump : 0), 1, ev);
    run(s, scene, 0, 120, ev);
    expect(s.enemies.find((e) => e.id === 'juv-t1')?.mode).toBe('sleep');
    // Back up at the lip (as the claws' climb tops out), and on east.
    placePlayer(s, 2590, 384, t, withShortcuts(scene, s.save), []);
    const back: SimEvent[] = [];
    for (let j = 0; j < 160; j++) run(s, scene, ActionBit.right | (j % 40 < 2 ? ActionBit.jump : 0), 1, back);
    expect(back.filter((q) => q.type === 'hurt' && JSON.stringify(q).includes('juvenileBurrback'))).toEqual(
      [],
    );
  });
});
