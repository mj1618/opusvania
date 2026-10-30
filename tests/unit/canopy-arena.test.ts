/**
 * The Grove's wave is an arena (review r5 #5): landing in the pit shuts the west door behind her (`gates[].shut`),
 * the wave's beat 1 wakes with it, both doors open as the wave dies, and a fade re-arms the lock-in (the door stands
 * open behind her as she re-forms at the entry's save; HK's arena). src/sim/kit.ts `gateShut` / `rearmArenas`.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { gateShut, rearmArenas } from '../../src/sim/kit';
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
});
