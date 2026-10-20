import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { getRoom } from '../../src/scene/index';
import { getWorld, validateWorld } from '../../src/scene/world';
import { jumpBoss } from '../../src/sim/boss/index';
import type { SimEvent } from '../../src/sim/events';
import { newSave } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { runRush } from '../../tools/playtest/rush-bot';

/** The boss rush demo (memory/bossrush.md): its world, its fights winnable, its ladder of rewards. */

describe('the boss rush', () => {
  it('its world links and checks clean', () => {
    expect(validateWorld(getWorld('demo-bossrush'))).toEqual([]);
  });

  it('the Gloamweaver (rush mode) is won by a bot that reads its tells, and teaches the Moonstep', () => {
    const r = runRush('br-gloam', { react: 18, seconds: 300 });
    expect(r.won).toBe(true);
    expect(r.save?.flags).toContain('br-gloam-down');
    expect(r.save?.flags).toContain('upgrade:moonstep');
    // (The lock made the door's patch her re-form point.)
    expect(r.save?.patch).toEqual({ room: 'br-gloam', id: 'p-gate' });
  });

  it('the Mantis is won by a bot that reads its tells, with the Moonstep and without', () => {
    const a = runRush('br-mantis', { react: 18, seconds: 400 });
    expect(a.won).toBe(true);
    expect(a.save?.flags).toContain('br-mantis-down');
    const b = runRush('br-mantis', { react: 30, seconds: 400, moonstep: false });
    expect(b.won).toBe(true);
  });

  it('the Weaver, beaten, teaches the dash', () => {
    const room = getRoom('br-weaver');
    const save = newSave(room.abilities ?? []);
    // (A save starts her at its patch: the door's, in the Weaver's room.)
    save.patch = { room: room.id, id: 'p-gate' };
    const g = new Game(cloneTuning(defaultTuning), room, 1, () => 0, null, {
      world: getWorld('demo-bossrush'),
      save,
    });
    g.mode = 'manual';
    expect(g.state.save.abilities).not.toContain('dash');
    const events: SimEvent[] = [];
    g.afterStep.add((ev) => {
      for (const e of ev) events.push(e);
    });
    g.queueInput([0]);
    g.stepOnce();
    jumpBoss(g.state, g.scene, g.tuning, 4, events);
    expect(g.state.boss?.phase).toBe(4);
    // P4: the heart lowered and unguarded; put it out.
    const hi = (room.lures ?? []).findIndex((l) => l.id === room.boss?.heart);
    g.state.lures.hp[hi] = 0;
    g.state.lures.out[hi] = g.state.frame + 1;
    for (let i = 0; i < 5; i++) {
      g.queueInput([0]);
      g.stepOnce();
    }
    expect(g.state.save.flags).toContain('br-weaver-down');
    expect(g.state.save.abilities).toContain('dash');
    expect(events.some((e) => e.type === 'bossGrant')).toBe(true);
  });
});
