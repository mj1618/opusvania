/**
 * The Grove's wave is an arena (review r5 #5): landing in the pit shuts the west door behind her (`gates[].shut`),
 * the wave's beat 1 wakes with it, both doors open as the wave dies, and a fade re-arms the lock-in (the door stands
 * open behind her as she re-forms at the entry's save; HK's arena). src/sim/kit.ts `gateShut` / `rearmArenas`.
 * r7 (review r6 #6): the arena is the pit: two root gates over its openings shut with the door, and its two lamps
 * hang in a jump's fling reach from its floor.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { gateShut, rearmArenas } from '../../src/sim/kit';
import { flingTarget } from '../../src/sim/lures';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const t = cloneTuning(defaultTuning);

describe('the Grove arena', () => {
  it('shuts the west door as she lands in the pit, and a fade re-arms it', () => {
    const scene = getRoom('cn-grove');
    const door = (scene.gates ?? []).find((g) => g.id === 'pit-door');
    expect(door?.shut).toBe('cn-grove-wave');
    const kit = ['wallJump'] as never;
    const s = createState(1, t, scene, [], kit, newSave(kit));
    // Before: open (no wave yet), and beat 1 asleep.
    expect(gateShut(door as never, s.save.flags)).toBe(false);
    placePlayer(s, 1800, 1600, t, withShortcuts(scene, s.save), []);
    const W = getWorld('canopy');
    const events: SimEvent[] = [];
    for (let k = 0; k < 30; k++) step(s, 0, t, scene, events, W);
    expect(s.save.flags).toContain('cn-grove-wave');
    expect(events.some((e) => e.type === 'gateShut' && e.id === 'pit-door')).toBe(true);
    expect(gateShut(door as never, s.save.flags)).toBe(true);
    const i = (scene.gates ?? []).indexOf(door as never);
    expect(s.kit.gates[i]).toBe(0);
    // A fade takes the wave's flag back out: the door opens behind her, the trigger shuts it again.
    rearmArenas(scene, s.save);
    expect(s.save.flags).not.toContain('cn-grove-wave');
    expect(gateShut(door as never, s.save.flags)).toBe(false);
    // Cleared: open for good, whatever the wave flag says.
    s.save.flags.push('cn-grove-wave', 'cn-grove-clear');
    expect(gateShut(door as never, s.save.flags)).toBe(false);
    rearmArenas(scene, s.save);
    expect(s.save.flags).toContain('cn-grove-wave');
  });

  it('shuts the root gates over the pit with the door: the arena is the pit (r7)', () => {
    const scene = getRoom('cn-grove');
    const gates = (scene.gates ?? []).filter((g) => g.id === 'arena-w' || g.id === 'arena-e');
    expect(gates.length).toBe(2);
    const kit = ['wallJump'] as never;
    const s = createState(1, t, scene, [], kit, newSave(kit));
    for (const g of gates) expect(gateShut(g as never, s.save.flags)).toBe(false);
    placePlayer(s, 1900, 1600, t, withShortcuts(scene, s.save), []);
    const W = getWorld('canopy');
    const events: SimEvent[] = [];
    for (let k = 0; k < 30; k++) step(s, 0, t, scene, events, W);
    for (const g of gates) {
      expect(gateShut(g as never, s.save.flags)).toBe(true);
      expect(events.some((e) => e.type === 'gateShut' && e.id === g.id)).toBe(true);
    }
    s.save.flags.push('cn-grove-clear');
    for (const g of gates) expect(gateShut(g as never, s.save.flags)).toBe(false);
  });

  // (r10: the west lamp is a trap now, cut from the floor: canopy-r10.test.ts. The east one is the fling's escape.)
  it("hangs the pit's springboard lamp in a jump's fling reach from its floor (r7)", () => {
    const scene = getRoom('cn-grove');
    const W = getWorld('canopy');
    for (const id of ['wick-b']) {
      const i = (scene.lures ?? []).findIndex((l) => l.id === id);
      const lamp = (scene.lures ?? [])[i] as { x: number; y: number };
      const kit = ['wallJump'] as never;
      const s = createState(1, t, scene, [], kit, newSave(kit));
      placePlayer(s, lamp.x, 1600, t, withShortcuts(scene, s.save), []);
      for (let k = 0; k < 120; k++) step(s, 0, t, scene, [], W);
      let reach = false;
      for (let k = 0; k < 40 && !reach; k++) {
        step(s, ActionBit.jump, t, scene, [], W);
        reach = flingTarget(s, withShortcuts(scene, s.save), t) === i;
      }
      expect(reach, id).toBe(true);
    }
  });
});
