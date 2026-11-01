/**
 * The Canopy r21 (Matt: "I just went through the first 5 minutes in the game, didn't have to deal with a single enemy,
 * hardly encountered anything"): every screen of the first five minutes has something to deal with; the clearing by
 * the kin's fire stays quiet; the way back up from the root cellar to the fork is a plain jump.
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

function at(room: string, x: number, y: number): GameState {
  const scene = getRoom(room);
  const s = createState(1, t, scene, [], [], newSave([] as never));
  placePlayer(s, x, y, t, withShortcuts(scene, s.save), []);
  s.hatch = null;
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
const ids = (room: string) => (getRoom(room).enemies ?? []).map((e) => e.id);

describe('the first five minutes hold creatures (r21)', () => {
  it('the hatch has two, the hub four groups, the giant its top two awake; the fork its carriers from the start', () => {
    expect(ids('cn-hatch')).toEqual(expect.arrayContaining(['juv-hatch', 'wing-hatch']));
    expect(ids('cn-hub')).toEqual(expect.arrayContaining(['juv-cage', 'wing-door', 'burr-floor', 'ant-m1']));
    const trunk = getRoom('cn-trunk').enemies ?? [];
    expect(trunk.find((e) => e.id === 'juv-t1')).not.toHaveProperty('asleep');
    expect(trunk.map((e) => e.id)).toContain('wing-t1');
    const fork = getRoom('cn-fork').enemies ?? [];
    for (const e of fork.filter((q) => q.kind === 'carrier')) expect(e).not.toHaveProperty('wakes');
  });

  it('the hatch: the first creature is met within ~10 s of walking east from the cocoon', () => {
    const s = at('cn-hatch', 864, 1022);
    const ev: SimEvent[] = [];
    let k = 0;
    while (!ev.some((q) => q.type === 'enemyNotice' && q.id === 'juv-hatch') && k++ < 600)
      run(s, ActionBit.right | (k % 50 < 3 ? ActionBit.jump : 0), 1, ev);
    expect(k).toBeLessThan(600);
  });

  it("the kin's fire is a safe spot: no creature's home within 1,000 px of p-crossing", () => {
    const hub = getRoom('cn-hub');
    const p = hub.patches?.find((q) => q.id === 'p-crossing');
    for (const e of hub.enemies ?? []) {
      const d = Math.hypot(e.x - (p?.x ?? 0), e.y - (p?.y ?? 0));
      expect(d, e.id).toBeGreaterThan(1000);
    }
  });
});

describe('the root cellar: back up to the fork is a plain jump (r21)', () => {
  it('from the step under the hole, a held jump and a step sideways stand her on the fork', () => {
    const s = at('cn-cellar', 480, 96);
    run(s, 0, 10);
    run(s, ActionBit.jump, 16);
    run(s, ActionBit.jump | ActionBit.left, 10);
    run(s, ActionBit.left, 40);
    expect(s.room).toBe('cn-fork');
    expect(s.player.grounded).toBe(true);
  });
});

describe('the cellar to the fork, the way a first-timer tries it (r21)', () => {
  it.each([400, 480, 560])('a straight held jump from under the hole at x %i stands her in the fork', (x) => {
    const s = at('cn-cellar', x, 128);
    run(s, 0, 20);
    run(s, ActionBit.jump, 24);
    run(s, 0, 60);
    expect(s.room).toBe('cn-fork');
    expect(s.player.grounded).toBe(true);
  });

  it('walking west off the fork stair she still drops into the cellar', () => {
    const s = at('cn-fork', 800, 1856);
    run(s, 0, 10);
    let k = 0;
    while (s.room === 'cn-fork' && k++ < 300) run(s, ActionBit.left, 1);
    expect(s.room).toBe('cn-cellar');
  });
});

describe('the first cage answers a cut from where a walk up to it stops (r21)', () => {
  it('standing 124 px off, facing it, a plain cut lands', () => {
    const s = at('cn-hub', 6176, 1600);
    s.enemies.length = 0;
    run(s, ActionBit.right, 1);
    run(s, 0, 6);
    const ev: SimEvent[] = [];
    run(s, ActionBit.attack, 2, ev);
    run(s, 0, 16, ev);
    expect(ev.some((q) => q.type === 'lureHit' && q.id === 'trap-crossing')).toBe(true);
  });
});
