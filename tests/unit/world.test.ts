import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { getRoom, WOOD_HATCH } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';
import { GAME_WORLD, progression, validateWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import {
  continueState,
  createState,
  hashState,
  linkWorld,
  newSave,
  type World,
  type WorldRoom,
} from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

const R = ActionBit.right;
const L = ActionBit.left;
const U = ActionBit.up;
const J = ActionBit.jump;

/** A game in the world, booted in `room` with `abilities`, every event kept. */
function play(room: string, abilities: string[] | null = null) {
  const t = cloneTuning(defaultTuning);
  const g = new Game(t, getRoom(room), 1, () => 0, abilities, { world: GAME_WORLD });
  g.mode = 'manual';
  const events: SimEvent[] = [];
  g.afterStep.add((ev) => events.push(...ev));
  return {
    g,
    t,
    events,
    /** Steps `n` frames of `mask`; returns this run's events. */
    run(mask: number, n = 1): SimEvent[] {
      const from = events.length;
      for (let i = 0; i < n; i++) {
        g.queueInput([mask]);
        g.stepOnce();
      }
      return events.slice(from);
    },
    /** Steps `mask` until `pred` holds (at most `max` frames); returns the events. */
    until(mask: number, pred: () => boolean, max = 600): SimEvent[] {
      const from = events.length;
      for (let i = 0; i < max && !pred(); i++) {
        g.queueInput([mask]);
        g.stepOnce();
      }
      expect(pred()).toBe(true);
      return events.slice(from);
    },
  };
}

describe('the world check', () => {
  it('the shipped world is sound: mirrors, no overlaps, connected, every room and glade reachable, no softlock', () => {
    expect(validateWorld()).toEqual([]);
    const p = progression(GAME_WORLD);
    expect(p.abilities).toEqual(['glide']);
    for (const id of ['wood-hatch', 'lab-world-a', 'lab-world-b', 'lab-world-c'])
      expect([...p.reached].some((n) => n.startsWith(`${id}:`))).toBe(true);
  });

  it('exits link where the neighbours meet; a one-way drop is arrival only on the far side', () => {
    expect(GAME_WORLD.links['wood-hatch#drop']).toEqual({ to: 'lab-world-a', exit: 'n' });
    expect(GAME_WORLD.links['lab-world-a#n']).toBeNull();
    expect(GAME_WORLD.links['lab-world-a#e-up']).toEqual({ to: 'lab-world-b', exit: 'w' });
    expect(GAME_WORLD.links['lab-world-b#w']).toEqual({ to: 'lab-world-a', exit: 'e-up' });
    expect(GAME_WORLD.links['lab-world-b#hole']).toEqual({ to: 'lab-world-c', exit: 'n' });
    expect(GAME_WORLD.links['lab-world-c#n']).toBeNull();
    // Test rooms are outside the world: no links.
    expect(Object.keys(GAME_WORLD.links).some((k) => k.startsWith('test-grove'))).toBe(false);
  });

  /** A tiny world of boxes: `a` at 0,0 and `b` beside it, with the exits given. */
  function boxes(
    extra: Partial<Room>[] = [],
    at: Array<[number, number]> = [
      [0, 0],
      [1000, 0],
    ],
  ): World {
    const base = (id: string, i: number): Room => ({
      id,
      width: 1000,
      height: 800,
      spawn: { x: 500, y: 700 },
      solids: [{ tag: 'ground', x: 0, y: 700, w: 1000, h: 100 }],
      oneWays: [],
      ...extra[i],
    });
    const rooms: WorldRoom[] = at.map(([x, y], i) => ({
      id: String.fromCharCode(97 + i),
      x,
      y,
      placed: true,
      scene: base(String.fromCharCode(97 + i), i),
    }));
    return linkWorld('a', rooms);
  }

  it('finds a missing mirror, a span that does not match, an overlap, and a room nothing reaches', () => {
    const e = (id: string, edge: 'n' | 's' | 'e' | 'w', from: number, to: number) => ({ id, edge, from, to });
    expect(validateWorld(boxes([{ exits: [e('x', 'e', 444, 700)] }, {}]))).toContain(
      'exit "a#x" (e) has no mirror exit in a neighbouring room',
    );
    const mismatch = validateWorld(
      boxes([{ exits: [e('x', 'e', 444, 700)] }, { exits: [e('y', 'w', 500, 700)] }]),
    );
    expect(mismatch.some((m) => m.includes('spans 444..700 but its mirror "b#y" spans 500..700'))).toBe(true);
    expect(
      validateWorld(
        boxes(
          [{}, {}],
          [
            [0, 0],
            [900, 0],
          ],
        ),
      ),
    ).toContain('rooms "a" and "b" overlap in the world');
    expect(validateWorld(boxes([{}, {}]))).toContain('room "b" is not connected to the rest of the world');
  });

  it('an ability gate holds until a glade on the way gives it; a glade behind its own gate is a problem', () => {
    const e = (id: string, edge: 'n' | 's' | 'e' | 'w', from: number, to: number) => ({ id, edge, from, to });
    const gate = {
      routes: [{ from: 'spawn', to: 'x', needs: ['glide' as const] }],
      exits: [e('x', 'e', 444, 700)],
    };
    const shut = boxes([gate, { exits: [e('y', 'w', 444, 700)] }]);
    expect(validateWorld(shut)).toContain(
      'room "b" cannot be reached from the start with the abilities found on the way',
    );
    const glade = { id: 'g', x: 100, y: 500, w: 100, h: 200, ability: 'glide' as const };
    const open = boxes([
      { ...gate, glades: [glade], routes: [...gate.routes, { from: 'spawn', to: 'g' }] },
      { exits: [e('y', 'w', 444, 700)] },
    ]);
    expect(validateWorld(open)).toEqual([]);
    const behind = boxes([
      { ...gate, glades: [glade], routes: [...gate.routes, { from: 'x', to: 'g' }] },
      { exits: [e('y', 'w', 444, 700)] },
    ]);
    expect(validateWorld(behind)).toContain('glade "a:g" (glide) cannot be reached');
  });

  it('a one-way drop into a room with no way to a moon patch is a softlock', () => {
    const e = (id: string, edge: 'n' | 's' | 'e' | 'w', from: number, to: number, oneWay?: boolean) => ({
      id,
      edge,
      from,
      to,
      oneWay,
    });
    const w = boxes([
      { exits: [e('x', 'e', 444, 700, true)], patches: [{ id: 'p', x: 300, y: 700 }] },
      { exits: [e('y', 'w', 444, 700)] },
    ]);
    expect(validateWorld(w).some((m) => m.startsWith('softlock: from "b:'))).toBe(true);
  });
});

describe('crossing between rooms', () => {
  it('the hatching branch drops into the lab: the room changes in the sim, her fall carries on, the save goes with her', () => {
    const s = play('wood-hatch', ['glide']);
    const drop = WOOD_HATCH.marks?.drop ?? { x: 0, y: 0 };
    s.g.teleport(drop.x - 120, drop.y);
    const ev = s.until(R, () => s.g.state.room === 'lab-world-a', 400);
    const out = ev.find((e) => e.type === 'roomExit');
    expect(out).toMatchObject({
      id: 'drop',
      edge: 's',
      to: 'lab-world-a',
      frames: s.t.room.transitionFrames,
    });
    const i = ev.findIndex((e) => e.type === 'roomEnter');
    expect(ev[i]).toMatchObject({ room: 'lab-world-a', from: 'wood-hatch#drop' });
    expect(ev[i + 1]?.type).toBe('spawn');
    const p = s.g.state.player;
    // Still falling, inside the top of the room, over the arrival opening.
    expect(p.vy).toBeGreaterThan(5);
    expect(p.y + p.h / 2).toBeGreaterThanOrEqual(s.t.room.entryInset - 1);
    expect(p.x).toBeGreaterThanOrEqual(384);
    expect(s.g.scene.id).toBe('lab-world-a');
    expect(s.g.state.save.abilities).toEqual(['glide']);
    expect(s.g.state.save.visited).toEqual(['wood-hatch', 'lab-world-a']);
    expect(s.g.state.save.crossed).toEqual(['wood-hatch:drop', 'lab-world-a:n']);
    expect(s.g.state.hatch).toBeNull();
    // She lands on the upper floor.
    s.until(0, () => s.g.state.player.grounded, 200);
    expect(s.g.state.player.y + s.g.state.player.h).toBe(1152);
  });

  it('a run through a side exit keeps its speed; the way back works', () => {
    const s = play('lab-world-a');
    s.g.teleport(2000, 1152);
    s.run(R, 40);
    const vx = s.g.state.player.vx;
    expect(vx).toBeCloseTo(s.t.run.maxSpeed, 5);
    const ev = s.until(R, () => s.g.state.room === 'lab-world-b', 200);
    expect(ev.find((e) => e.type === 'roomEnter')).toMatchObject({
      room: 'lab-world-b',
      from: 'lab-world-a#e-up',
    });
    expect(s.g.state.player.vx).toBeCloseTo(vx, 5);
    expect(s.g.state.player.y + s.g.state.player.h).toBe(1152);
    // And back west: she comes in just inside the opening, at full speed.
    s.run(R, 20);
    s.until(L, () => s.g.state.room === 'lab-world-a', 200);
    const p = s.g.state.player;
    expect(p.x + p.w / 2).toBe(2560 - s.t.room.entryInset);
    expect(p.vx).toBeCloseTo(-s.t.run.maxSpeed, 5);
  });

  it('the same inputs across three rooms give the same hash', () => {
    const run = () => {
      const s = play('lab-world-a');
      s.g.teleport(2000, 1152);
      s.run(R, 200);
      s.run(R | J, 20);
      s.run(R, 200);
      return { room: s.g.state.room, hash: s.g.hash() };
    };
    const a = run();
    // A -> B by the side exit, then down B's hole into C.
    expect(a.room).toBe('lab-world-c');
    expect(run()).toEqual(a);
  });
});

describe('moon patches, glades, shortcuts, the re-form', () => {
  it('standing still in a patch rests her: whole, saved, her re-form point; once per stay', () => {
    const s = play('lab-world-a');
    s.g.state.player.hp = 1;
    s.g.teleport(1408, 1152);
    const ev = s.run(0, s.t.patch.restFrames + 5);
    expect(ev.filter((e) => e.type === 'patchRest')).toEqual([
      { type: 'patchRest', id: 'p1', room: 'lab-world-a', x: 1408, y: 1152, hp: s.g.state.player.hpMax },
    ]);
    expect(s.g.state.player.hp).toBe(s.g.state.player.hpMax);
    expect(s.g.state.save.patch).toEqual({ room: 'lab-world-a', id: 'p1' });
    expect(s.run(0, 100).some((e) => e.type === 'patchRest')).toBe(false);
    // Step out and back, and press up: at once.
    s.run(R, 20);
    s.run(L, 20);
    s.run(0, 1);
    expect(s.run(U, 1).some((e) => e.type === 'patchRest')).toBe(true);
  });

  it('a glade gives its ability once', () => {
    const s = play('lab-world-c');
    expect(s.g.state.save.abilities).toEqual([]);
    const ev = s.until(L, () => s.g.state.save.abilities.includes('glide'), 120);
    expect(ev.filter((e) => e.type === 'gladeGrant')).toMatchObject([
      { id: 'glade-glide', ability: 'glide' },
    ]);
    expect(s.g.state.save.taken).toEqual(['lab-world-c:glade-glide']);
    s.run(R, 40);
    expect(s.run(L, 40).some((e) => e.type === 'gladeGrant')).toBe(false);
  });

  it('running in from A at full speed she meets the gate: the dip never carries her through a wall of the next room', () => {
    const s = play('lab-world-a');
    s.g.teleport(2200, 2560);
    s.until(R, () => s.g.state.room === 'lab-world-c', 200);
    s.run(R, 60);
    const p = s.g.state.player;
    expect(p.x + p.w).toBe(96);
    expect(s.g.state.save.opened).toEqual([]);
  });

  it('the gate is a wall from the west; pushed from the east it opens for good', () => {
    const s = play('lab-world-c');
    s.g.teleport(40, 1024);
    s.run(R, 60);
    // Stopped by its west face.
    expect(s.g.state.player.x + s.g.state.player.w).toBe(96);
    expect(s.g.state.save.opened).toEqual([]);
    s.g.teleport(400, 1024);
    const ev = s.until(L, () => s.g.state.save.opened.length > 0, 120);
    expect(ev.find((e) => e.type === 'shortcutOpen')).toMatchObject({ id: 'gate' });
    expect(s.g.state.save.opened).toEqual(['lab-world-c:gate']);
    // Now she walks through it and out into A's lower hall.
    s.until(L, () => s.g.state.room === 'lab-world-a', 200);
    expect(s.g.state.player.y + s.g.state.player.h).toBe(2560);
  });

  it('a fade re-forms her at the patch she last rested at, in another room, keeping everything earned', () => {
    const s = play('lab-world-a');
    s.g.teleport(1408, 1152);
    s.run(0, s.t.patch.restFrames + 2);
    expect(s.g.state.save.patch).toEqual({ room: 'lab-world-a', id: 'p1' });
    s.g.goto('lab-world-c', 1980, 640);
    s.run(0, 5);
    expect(s.g.state.save.abilities).toEqual(['glide']);
    s.g.teleport(220, 1024);
    s.g.state.player.hp = 1;
    // Light in her hands, or the creature does not see her (memory/giving.md).
    s.g.state.pickups.count = 6;
    // Walk into the burrback until the blow fades her, then wait out the fade.
    const ev = s.until(R, () => s.g.state.room === 'lab-world-a', 900);
    const i = ev.findIndex((e) => e.type === 'roomEnter');
    expect(ev.some((e) => e.type === 'fade')).toBe(true);
    expect(ev[i]).toMatchObject({ room: 'lab-world-a', from: 'reform' });
    expect(ev.slice(i).some((e) => e.type === 'reform')).toBe(true);
    const p = s.g.state.player;
    expect([p.x + p.w / 2, p.y + p.h]).toEqual([1408, 1152]);
    expect(p.hp).toBe(p.hpMax);
    expect(s.g.state.save.abilities).toEqual(['glide']);
    expect(s.g.state.save.taken).toEqual(['lab-world-c:glade-glide']);
    // No rest event at once (she re-formed in it), and the room is A's own.
    expect(s.run(0, 60).some((e) => e.type === 'patchRest')).toBe(false);
    expect(s.g.scene.id).toBe('lab-world-a');
  });

  it('a lure put out stays out when she comes back, and the moths count once', () => {
    const s = play('lab-world-b');
    const t = s.t;
    s.g.state.save.snuffed.push('lab-world-b:b-wick');
    s.g.goto('lab-world-a', 1000, 1152);
    s.g.goto('lab-world-b', 500, 1152);
    expect(s.g.state.lures.hp).toEqual([0]);
    expect(createState(1, t, getRoom('lab-world-b')).lures.hp).toEqual([1]);
  });
});

describe('save and continue', () => {
  it('continue starts at the patch with the save; a fresh save starts at the world start', () => {
    const t = cloneTuning(defaultTuning);
    const save = newSave(['glide']);
    save.visited.push('wood-hatch', 'lab-world-a');
    save.patch = { room: 'lab-world-a', id: 'p1' };
    const ev: SimEvent[] = [];
    const st = continueState(1, t, GAME_WORLD, save, ev);
    expect(st.room).toBe('lab-world-a');
    expect([st.player.x + st.player.w / 2, st.player.y + st.player.h]).toEqual([1408, 1152]);
    expect(st.save.abilities).toEqual(['glide']);
    expect(ev.map((e) => e.type)).toEqual(['roomEnter', 'spawn']);
    const fresh = continueState(1, t, GAME_WORLD, newSave([]));
    expect(fresh.room).toBe('wood-hatch');
    expect(fresh.hatch).not.toBeNull();
    // Deterministic: the same save gives the same state.
    expect(hashState(continueState(1, t, GAME_WORLD, save))).toBe(hashState(st));
  });
});

describe('the save slot', () => {
  it('round-trips, sets aside what it cannot read, and refuses a save of another shape', async () => {
    const { decodeSave, encodeSave, readSave, writeSave, SAVE_KEY } = await import('../../src/save/storage');
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    const save = newSave(['glide']);
    save.visited.push('lab-world-a');
    save.patch = { room: 'lab-world-a', id: 'p1' };
    expect(writeSave(store, save)).toBe(true);
    expect(readSave(store)).toEqual(save);
    expect(decodeSave(encodeSave(save))).toEqual(save);
    expect(decodeSave('{"version":1,"save":{"abilities":["fly"]}}')).toBeNull();
    mem.set(SAVE_KEY, 'not json');
    expect(readSave(store)).toBeNull();
    expect(mem.get(`${SAVE_KEY}.bad`)).toBe('not json');
    expect(mem.has(SAVE_KEY)).toBe(false);
  });
});
