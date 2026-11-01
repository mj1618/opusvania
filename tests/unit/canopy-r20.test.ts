/**
 * The Canopy r20 (Matt: "I feel like it's very easy"): a fade has stakes (HK's bench and shade), healing costs
 * something (springboards no longer heal), and big things hit for 2.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { snuffLure } from '../../src/sim/lures';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { enterRoom, withShortcuts } from '../../src/sim/world';

const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');
const CG = ['wallJump', 'glide'];

function at(room: string, x: number, y: number): GameState {
  const scene = getRoom(room);
  const s = createState(1, t, scene, [], CG as never, newSave(CG as never));
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
/** She fades where she stands (the last frame of the fade). */
function fade(s: GameState, ev: SimEvent[] = []): SimEvent[] {
  s.player.hp = 0;
  s.player.faded = 1;
  return run(s, 0, 1, ev);
}
const feet = (s: GameState) => ({ x: s.player.x + s.player.w / 2, y: s.player.y + s.player.h });

describe('a fade re-forms her at the last patch she rested at, in any room (r20, HK bench)', () => {
  it('faded in the giant, rested last at the Crossing: back at p-crossing, whole; every glint lies in the giant', () => {
    const s = at('cn-trunk', 2400, 640);
    s.save.patch = { room: 'cn-hub', id: 'p-crossing' };
    s.pickups.count = 7;
    s.player.hp = 1;
    const where = feet(s);
    const ev = fade(s);
    expect(s.room).toBe('cn-hub');
    const p = getRoom('cn-hub').patches?.find((q) => q.id === 'p-crossing');
    expect(Math.abs(feet(s).x - (p?.x ?? 0))).toBeLessThan(8);
    expect(s.player.hp).toBe(s.player.hpMax);
    expect(s.pickups.count).toBe(0);
    expect(s.pickups.shade).toMatchObject({ room: 'cn-trunk', value: 7, left: 7 });
    expect(Math.abs((s.pickups.shade?.x ?? 0) - where.x)).toBeLessThan(40);
    expect(ev.some((e) => e.type === 'glintsDrop' && e.value === 7)).toBe(true);
    // Back in the giant the cluster lies where she fell; touched, all seven come back, then `shadeTaken`.
    const back: SimEvent[] = [];
    enterRoom(s, t, W, 'cn-trunk', { kind: 'point', x: where.x, y: where.y }, 'cn-hub', back);
    expect(s.pickups.drops.length).toBe(1);
    run(s, 0, 240, back);
    expect(s.pickups.count).toBe(7);
    expect(s.pickups.shade).toBeNull();
    expect(back.some((e) => e.type === 'shadeTaken' && e.value === 7)).toBe(true);
  });

  it('a second fade before she takes it back loses the first for good', () => {
    const s = at('cn-trunk', 2400, 640);
    s.save.patch = { room: 'cn-hub', id: 'p-crossing' };
    s.pickups.count = 5;
    fade(s);
    expect(s.pickups.shade?.room).toBe('cn-trunk');
    s.pickups.count = 2;
    const ev = fade(s);
    expect(ev.some((e) => e.type === 'shadeLost' && e.room === 'cn-trunk' && e.left === 5)).toBe(true);
    expect(s.pickups.shade).toMatchObject({ room: 'cn-hub', value: 2 });
  });

  it('with no patch rested at yet, back at the hatch', () => {
    const s = at('cn-trunk', 2400, 640);
    s.save.patch = null;
    fade(s);
    expect(s.room).toBe(W.start);
    const sp = getRoom(W.start).spawn;
    expect(Math.abs(feet(s).x - sp.x)).toBeLessThan(8);
    expect(s.player.hp).toBe(s.player.hpMax);
  });

  it("a pass over a plain patch marks nothing; the den's balcony (`retry`) and the warning (`mark`) do", () => {
    const hub = at('cn-hub', 3000, 1600);
    hub.enemies.length = 0;
    const ev = run(hub, ActionBit.left, 60);
    expect(ev.some((e) => e.type === 'patchMark')).toBe(false);
    expect(hub.save.patch).toBeNull();
    const den = getRoom('cn-den');
    const p = den.patches?.find((q) => q.id === 'p-den');
    expect(p?.retry).toBe(true);
    const s = at('cn-den', (p?.x ?? 0) + 200, p?.y ?? 0);
    s.save.flags.push('cn-tunnel-clear');
    const ev2: SimEvent[] = [];
    for (let k = 0; k < 40 && s.save.patch === null; k++) run(s, ActionBit.left, 1, ev2);
    expect(s.save.patch).toEqual({ room: 'cn-den', id: 'p-den' });
  });
});

describe('healing costs something (r20)', () => {
  it('a springboard put out heals nothing; a cage cut open heals 1', () => {
    const hub = getRoom('cn-hub');
    const s = at('cn-hub', 3000, 1600);
    const ix = (hub.lures ?? []).findIndex((l) => !!l.relight && !l.trap);
    const trap = (hub.lures ?? []).findIndex((l) => !!l.trap);
    expect(ix).toBeGreaterThanOrEqual(0);
    expect(trap).toBeGreaterThanOrEqual(0);
    s.player.hp = 2;
    const ev: SimEvent[] = [];
    snuffLure(s, withShortcuts(hub, s.save), ix, t, ev, 1, 'fwd');
    expect(s.player.hp).toBe(2);
    snuffLure(s, withShortcuts(hub, s.save), trap, t, ev, 1, 'fwd');
    expect(s.player.hp).toBe(3);
  });

  it('every Canopy room is a bench room, and big things hit for 2', () => {
    for (const r of Object.values(W.rooms)) if (r.placed) expect(r.scene.bench, r.id).toBe(true);
    expect(t.oldBurrback.contactDamage).toBe(2);
    expect(t.juvenileBurrback.contactDamage).toBe(1);
    expect(t.lures.healOnRelight).toBe(0);
  });
});
