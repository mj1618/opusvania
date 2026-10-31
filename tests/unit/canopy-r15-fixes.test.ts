/**
 * The Canopy, round 15's fixes (before Matt's play; memory/canopy.md "v15 fixes"):
 *  - Never wedged in a gate: she is pushed clear of any gate standing over her box, however she came there (a room
 *    entered through a door still shut: a test boot of the den walked west into the tunnel inside its shut lid).
 *  - A real game never has the den without `cn-tunnel-clear` (the lid is its only way in, the flag is never taken
 *    back), so only a test boot could reach that state.
 *  - The map draws a gate as the sim stands it (`gateShut`: an arena door is open until its `shut` flag).
 */
import { describe, expect, it } from 'vitest';
import { gateStanding } from '../../src/render/map/paint';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { gateShut, rearmArenas } from '../../src/sim/kit';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');

function at(room: string, x: number, y: number, flags: string[] = []): GameState {
  const scene = getRoom(room);
  const save = newSave(['wallJump', 'glide'] as never);
  save.flags.push(...flags);
  const s = createState(1, t, scene, [], ['wallJump', 'glide'] as never, save);
  placePlayer(s, x, y, t, withShortcuts(scene, s.save), []);
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
const overlaps = (s: GameState, g: { x: number; y: number; w: number; h: number }) => {
  const p = s.player;
  return p.x < g.x + g.w && g.x < p.x + p.w && p.y < g.y + g.h && g.y < p.y + p.h;
};

describe('never wedged inside a gate (r15 fixes)', () => {
  const lid = (getRoom('cn-tunnel').gates ?? []).find((g) => g.id === 'den-lid');
  it('walking out of the den into the tunnel with its lid shut puts her beside the lid, free to move', () => {
    expect(lid).toBeDefined();
    if (!lid) return;
    const s = at('cn-den', 200, 320);
    s.enemies.length = 0;
    const ev = run(s, ActionBit.left, 90);
    expect(s.room).toBe('cn-tunnel');
    expect(s.save.flags.includes('cn-tunnel-clear')).toBe(false);
    expect(overlaps(s, lid)).toBe(false);
    expect(ev.some((e) => e.type === 'gatePush' && e.id === 'den-lid')).toBe(true);
    const x0 = s.player.x;
    run(s, ActionBit.left, 30);
    expect(s.player.x).toBeLessThan(x0 - 60);
    run(s, ActionBit.right, 60);
    expect(s.room).toBe('cn-tunnel');
    expect(overlaps(s, lid)).toBe(false);
  });
  it('put inside any standing gate she is moved clear on the next step', () => {
    for (const room of ['cn-den', 'cn-tunnel', 'cn-grove', 'cn-out']) {
      const scene = getRoom(room);
      for (const g of scene.gates ?? []) {
        if (g.shut !== undefined || g.h < 64) continue;
        const s = at(room, g.x + g.w / 2, g.y + g.h - 4);
        s.enemies.length = 0;
        if (!gateShut(g, s.save.flags)) continue;
        run(s, 0, 2);
        expect(overlaps(s, g), `${room}:${g.id}`).toBe(false);
      }
    }
  });
  it('a real game never has the den without cn-tunnel-clear: the lid is its only way in, and it stays open', () => {
    expect(lid).toBeDefined();
    if (!lid) return;
    // Every link into the den: the tunnel's (through the lid) and the way out's (the breach, shut until the collapse).
    const into = Object.entries(W.links).filter(([, v]) => v?.to === 'cn-den');
    const from = into.map(([k]) => k.split('#')[0]).sort();
    expect(from).toEqual(['cn-out', 'cn-tunnel']);
    const breach = (getRoom('cn-den').gates ?? []).find((g) => g.id === 'den-breach');
    expect(breach?.flag).toBe('cn-den-collapse');
    // The lid covers the tunnel's whole opening to the den.
    const ex = (getRoom('cn-tunnel').exits ?? []).find((e) => e.id === 'den');
    expect(
      ex && lid.y <= ex.from && lid.y + lid.h >= ex.to && lid.x + lid.w === getRoom('cn-tunnel').width,
    ).toBe(true);
    // A fade, a crossing or a restart re-arms the tunnel's ambush but never takes back the flag that opens the lid.
    const save = newSave([] as never);
    save.flags.push('cn-tunnel-wave', 'cn-tunnel-beat2', 'cn-tunnel-clear');
    rearmArenas(getRoom('cn-tunnel'), save);
    expect(save.flags.includes('cn-tunnel-clear')).toBe(true);
  });
});

describe('the map draws gates as the sim stands them (r15 fixes)', () => {
  it('the den: the breach shut until the collapse, open after; the rubble open until the collapse', () => {
    const den = getRoom('cn-den');
    for (const flags of [[], ['cn-den-collapse'], ['cn-den-collapse', 'cn-den-rubble-gone']])
      for (const g of den.gates ?? [])
        expect(gateStanding(g, flags), `${g.id} ${flags}`).toBe(gateShut(g, flags));
    const breach = (den.gates ?? []).find((g) => g.id === 'den-breach');
    expect(breach && gateStanding(breach, ['cn-den-collapse'])).toBe(false);
  });
});
