/**
 * The Canopy r20 (Matt: "I feel like it's very easy"): a fade has stakes (HK's bench and shade), healing costs
 * something (springboards no longer heal), and big things hit for 2.
 */
import { describe, expect, it } from 'vitest';
import { routeCanopy } from '../../src/audio/route-canopy';
import type { AudioSnap } from '../../src/audio/router';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { snuffLure } from '../../src/sim/lures';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { enterRoom, withShortcuts } from '../../src/sim/world';
import { flatScene } from './helpers';

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

describe('a fade re-forms her at the nearest checkpoint in the room she fell in (r21, Matt; was r20 HK bench)', () => {
  it('faded in the giant (no patch there): back at her door into it, whole; every glint lies where she fell', () => {
    const s = at('cn-trunk', 3136, 384);
    s.save.patch = { room: 'cn-hub', id: 'p-crossing' };
    run(s, 0, 40);
    const door = s.entry;
    expect(door).not.toBeNull();
    s.player.x = 2400 - s.player.w / 2;
    s.player.y = 640 - s.player.h;
    s.pickups.count = 7;
    s.player.hp = 1;
    const where = feet(s);
    const ev = fade(s);
    expect(s.room).toBe('cn-trunk');
    expect(Math.abs(feet(s).x - (door?.x ?? 0))).toBeLessThan(8);
    expect(s.player.hp).toBe(s.player.hpMax);
    expect(s.pickups.count).toBe(0);
    expect(s.pickups.shade).toMatchObject({ room: 'cn-trunk', value: 7, left: 7 });
    expect(Math.abs((s.pickups.shade?.x ?? 0) - where.x)).toBeLessThan(40);
    expect(ev.some((e) => e.type === 'glintsDrop' && e.value === 7)).toBe(true);
    // Back where she fell the cluster waits; touched, all seven come back, then `shadeTaken`.
    const back: SimEvent[] = [];
    enterRoom(s, t, W, 'cn-trunk', { kind: 'point', x: where.x, y: where.y }, 'cn-hub', back);
    expect(s.pickups.drops.length).toBe(1);
    run(s, 0, 240, back);
    expect(s.pickups.count).toBe(7);
    expect(s.pickups.shade).toBeNull();
    expect(back.some((e) => e.type === 'shadeTaken' && e.value === 7)).toBe(true);
  });

  it('a second fade before she takes it back loses the first for good', () => {
    const s = at('cn-trunk', 3136, 384);
    run(s, 0, 40);
    s.pickups.count = 5;
    fade(s);
    expect(s.pickups.shade?.room).toBe('cn-trunk');
    s.pickups.count = 2;
    const ev = fade(s);
    expect(ev.some((e) => e.type === 'shadeLost' && e.room === 'cn-trunk' && e.left === 5)).toBe(true);
    expect(s.pickups.shade).toMatchObject({ room: 'cn-trunk', value: 2 });
  });

  it("in a room with patches, the one nearest where she lay, whatever the save holds; the den's is its balcony", () => {
    const well = getRoom('cn-well');
    const landing = well.patches?.find((q) => q.id === 'p-landing');
    const s = at('cn-well', (landing?.x ?? 0) - 300, landing?.y ?? 0);
    s.save.patch = { room: 'cn-hub', id: 'p-crossing' };
    fade(s);
    expect(s.room).toBe('cn-well');
    expect(Math.abs(feet(s).x - (landing?.x ?? 0))).toBeLessThan(8);
    expect(Math.abs(feet(s).y - (landing?.y ?? 0))).toBeLessThan(8);
    const den = getRoom('cn-den');
    const balcony = den.patches?.find((q) => q.id === 'p-den');
    const d = at('cn-den', 1800, 1344);
    fade(d);
    expect(d.room).toBe('cn-den');
    expect(Math.abs(feet(d).x - (balcony?.x ?? 0))).toBeLessThan(8);
    expect(d.player.hp).toBe(d.player.hpMax);
  });

  it('no checkpoint is beside a creature: every Canopy patch and `reform` point is 300 px from every home', () => {
    for (const r of Object.values(W.rooms)) {
      if (!r.placed) continue;
      const sc = r.scene;
      const points = [...(sc.patches ?? []), ...(sc.reform ? [sc.reform] : [])];
      for (const q of points)
        for (const e of sc.enemies ?? []) {
          // (An ambush's creatures are not there until it wakes; a fade re-arms it.)
          const w = (e as { wakes?: string }).wakes;
          if (w && !['wallJump', 'glide', 'dash'].includes(w)) continue;
          // (The Keeper's den: its balcony is the retry, the arena is shut until she drops in.)
          if (e.kind === 'oldBurrback') continue;
          const d = Math.hypot(e.x - q.x, e.y - q.y);
          expect(d, `${r.id}: ${e.id} is ${Math.round(d)} px from a checkpoint`).toBeGreaterThanOrEqual(300);
        }
    }
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

describe('the shade in sound (r20)', () => {
  const snap = {
    frame: 100,
    room: 'cn-trunk',
    hero: { x: 1000, y: 800, vx: 0, vy: 0, grounded: true, facing: 1 },
    lights: [],
  } as unknown as AudioSnap;
  const ctx = { scene: { ...flatScene(), id: 'cn-trunk' }, seed: 1 };
  it('taken back: four notes rising, then her wings; lost: one low note', () => {
    const got = routeCanopy({ type: 'shadeTaken', id: 1, x: 900, y: 800, value: 7 }, 0, snap, ctx);
    const notes = got.filter((c) => c.sound === 'glintNote');
    expect(notes.length).toBe(4);
    for (let k = 1; k < notes.length; k++)
      expect(notes[k]?.cents ?? 0).toBeGreaterThan(notes[k - 1]?.cents ?? 0);
    expect(got.some((c) => c.sound === 'wingOpen')).toBe(true);
    const lost = routeCanopy(
      { type: 'shadeLost', id: 1, room: 'cn-trunk', x: 900, y: 800, left: 5 },
      0,
      snap,
      ctx,
    );
    expect(lost.length).toBe(1);
  });
});

describe('fights built as fights (r20)', () => {
  const live = (s: GameState, ids: string[]) =>
    s.enemies.filter((e) => ids.includes(e.id) && !e.gone && e.mode !== 'dead').length;

  it("the kin's foot: landing on the bower's west floor wakes a burrback, a lampwing and a juvenile", () => {
    const s = at('cn-bower', 2166, 1408);
    const ids = ['burr-kin', 'wing-kin', 'juv-kin'];
    run(s, 0, 10);
    expect(live(s, ids)).toBe(0);
    const ev: SimEvent[] = [];
    for (let k = 0; k < 200 && !s.save.flags.includes('cn-bower-ambush'); k++) run(s, ActionBit.left, 1, ev);
    expect(s.save.flags).toContain('cn-bower-ambush');
    run(s, 0, 120, ev);
    expect(live(s, ids)).toBe(3);
  });

  it("the fork's carriers run from the start (r21); after the firefly's flight a hawker hunts their floor", () => {
    const first = at('cn-fork', 400, 1344);
    run(first, 0, 5);
    expect(live(first, ['ant-f1', 'ant-f2', 'ant-f3'])).toBe(3);
    expect(live(first, ['hawk-fork'])).toBe(0);
    const scene = getRoom('cn-fork');
    const s = createState(1, t, scene, [], CG as never, {
      ...newSave(CG as never),
      flags: ['cn-firefly-gap'],
    });
    s.hatch = null;
    run(s, 0, 5);
    expect(live(s, ['ant-f1', 'ant-f2', 'ant-f3', 'hawk-fork'])).toBe(4);
  });

  it('the upper limbs: a hawker hunts her over the bed from the first limb', () => {
    const s = at('cn-limbs', 1000, 768);
    const ev = run(s, 0, 120);
    expect(ev.some((e) => e.type === 'enemyNotice' && e.id === 'hawk-limbs')).toBe(true);
  });
});
