import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { getRoom, WORLD } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';
import { GAME_WORLD } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { ActionBit } from '../../src/sim/input';
import { solidAt } from '../../src/sim/physics/aabb';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

/**
 * The wood's first greybox rooms (docs/design/regions/wood.md draft 2, §3 and §7; memory/rooms.md):
 * R2 wood-chase, R3 wood-wicks, R5 wood-glade, and their claims, measured in the sim. wood-burrow (R4)
 * and wood-glidewalk (R6) are stubs that only join the world until they are built.
 */

const R = ActionBit.right;
const J = ActionBit.jump;
const A = ActionBit.attack;

/** A game in the world, booted in `room` with `abilities`, every event kept. */
function play(room: string, abilities: string[] = []) {
  const t = cloneTuning(defaultTuning);
  const g = new Game(t, getRoom(room), 1, () => 0, abilities, { world: GAME_WORLD });
  g.mode = 'manual';
  const events: SimEvent[] = [];
  g.afterStep.add((ev) => events.push(...ev));
  const run = (mask: number, n = 1): SimEvent[] => {
    const from = events.length;
    for (let i = 0; i < n; i++) {
      g.queueInput([mask]);
      g.stepOnce();
    }
    return events.slice(from);
  };
  const feet = () => ({ x: g.state.player.x + g.state.player.w / 2, y: g.state.player.y + g.state.player.h });
  /** Runs right from where she stands until her feet are `x`, then the rest of `then`. */
  const runTo = (x: number): void => {
    for (let i = 0; i < 600 && feet().x < x; i++) run(R);
  };
  return { g, t, events, run, feet, runTo };
}

/** The world rect of a placed room. */
function placed(id: string) {
  const at = WORLD.rooms.find((r) => r.id === id);
  const room = getRoom(id);
  if (!at) throw new Error(`${id} is not placed`);
  return { x: at.x, y: at.y, w: room.width, h: room.height };
}

/**
 * The naive habit (memory/playtest-harness.md): hold right; jump 14 frames at a wall or at the end of
 * the ground. Returns the frames until `done`, or -1.
 */
function naive(s: ReturnType<typeof play>, done: () => boolean, max = 3600): number {
  let jumpUntil = -1;
  for (let f = 0; f < max; f++) {
    if (done()) return f;
    const p = s.g.state.player;
    const ft = s.feet();
    const ahead = solidAt(s.g.scene, ft.x + 12, ft.y, 1, 1);
    if (f > jumpUntil + 1 && p.grounded && (p.wallDir === 1 || !ahead)) jumpUntil = f + 14;
    s.run(R | (f < jumpUntil ? J : 0));
  }
  return -1;
}

describe('the wood: placement (wood.md §3, world px)', () => {
  it('each room sits where the paper puts it, the size it says', () => {
    expect(placed('wood-chase')).toEqual({ x: 5760, y: 2816, w: 6400, h: 1920 });
    expect(placed('wood-wicks')).toEqual({ x: 11264, y: 4736, w: 3840, h: 2176 });
    expect(placed('wood-glade')).toEqual({ x: 18944, y: 6400, w: 2880, h: 2304 });
    // The stubs hold R4's and R6's places until those rooms are built.
    expect(placed('wood-burrow')).toEqual({ x: 15104, y: 4608, w: 4480, h: 1792 });
    expect(placed('wood-glidewalk')).toEqual({ x: 21824, y: 8064, w: 5760, h: 2368 });
  });

  it('the exits link hatch -> chase -> wicks -> burrow -> glade -> glidewalk, one way where she drops', () => {
    const L = GAME_WORLD.links;
    expect(L['wood-hatch#drop']).toEqual({ to: 'wood-chase', exit: 'n' });
    expect(L['wood-chase#n']).toBeNull();
    expect(L['wood-chase#s']).toEqual({ to: 'wood-wicks', exit: 'n' });
    expect(L['wood-wicks#n']).toBeNull();
    expect(L['wood-wicks#e']).toEqual({ to: 'wood-burrow', exit: 'w' });
    expect(L['wood-burrow#w']).toEqual({ to: 'wood-wicks', exit: 'e' });
    expect(L['wood-burrow#hole']).toEqual({ to: 'wood-glade', exit: 'n' });
    expect(L['wood-glade#e']).toEqual({ to: 'wood-glidewalk', exit: 'w' });
  });
});

describe('R2 wood-chase: the chase, the vista', () => {
  const room = getRoom('wood-chase');

  it('off the hatching branch she lands on bough A, still running', () => {
    const s = play('wood-hatch');
    const drop = getRoom('wood-hatch').marks?.drop ?? { x: 0, y: 0 };
    s.g.teleport(drop.x - 120, drop.y);
    for (let i = 0; i < 400 && s.g.state.room !== 'wood-chase'; i++) s.run(R);
    expect(s.g.state.room).toBe('wood-chase');
    for (let i = 0; i < 200 && !s.g.state.player.grounded; i++) s.run(R);
    expect(s.feet().y).toBe(704);
    expect(s.feet().x).toBeGreaterThan(256);
    expect(s.feet().x).toBeLessThan(2048);
  });

  it('every gap is at most 320 and every step at most 128 (no thorns, no pips)', () => {
    // The walk line: the top of each solid, west to east (B's rolling rects are one bough).
    const tops = room.solids
      .filter((r) => r.tag !== 'trunk')
      .sort((a, b) => a.x - b.x)
      .map((r) => ({ x0: r.x, x1: r.x + r.w, y: r.y }));
    for (let i = 1; i < tops.length; i++) {
      const a = tops[i - 1] as (typeof tops)[number];
      const b = tops[i] as (typeof tops)[number];
      expect(b.x0 - a.x1).toBeLessThanOrEqual(320);
      expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(128);
    }
    expect(room.enemies ?? []).toEqual([]);
    expect(room.lures ?? []).toEqual([]);
  });

  it('the naive habit runs it from A to the drop into wood-wicks in under 30 s', () => {
    const s = play('wood-chase');
    s.g.teleport(700, 704);
    const f = naive(s, () => s.g.state.room === 'wood-wicks');
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(30 * 60);
  });

  it('a jump off the lip lands in the exit: no catch, no way to loop at the vista', () => {
    const s = play('wood-chase');
    s.g.teleport(5300, 896);
    s.runTo(5730);
    const ev = s.run(R | J, 16).concat(s.run(R, 200));
    expect(ev.some((e) => e.type === 'fallCatch')).toBe(false);
    expect(ev.find((e) => e.type === 'roomExit')).toMatchObject({ id: 's', to: 'wood-wicks' });
  });
});

describe('R3 wood-wicks: the first catch, the first snuff', () => {
  it('falling in held right, she slides down the shaft wall and lands on L, outside W1', () => {
    const s = play('wood-chase');
    s.g.teleport(5600, 896);
    let ev: SimEvent[] = [];
    for (let i = 0; i < 400 && !(s.g.state.room === 'wood-wicks' && s.g.state.player.grounded); i++)
      ev = ev.concat(s.run(R));
    expect(s.g.state.room).toBe('wood-wicks');
    expect(s.feet().y).toBe(960);
    expect(s.feet().x).toBeLessThan(1152);
    expect(ev.some((e) => e.type === 'lureCaught')).toBe(false);
  });

  it('every run-up jump across the dip is pulled into W1 and caught', () => {
    for (let lead = 0; lead <= 120; lead += 12) {
      const s = play('wood-wicks');
      s.g.teleport(600, 960);
      s.runTo(1152 - 20 - lead);
      const ev = s.run(R | J, 14).concat(s.run(R, 60));
      expect(
        ev.find((e) => e.type === 'lureCaught'),
        `jump ${lead} px before the lip`,
      ).toMatchObject({
        id: 'wick-caught',
      });
    }
  });

  it('beaten free holding right (3 presses), she lands on M past the dip', () => {
    const s = play('wood-wicks');
    s.g.teleport(600, 960);
    s.runTo(1100);
    s.run(R | J, 14);
    for (let i = 0; i < 60 && s.g.state.player.lure < 0; i++) s.run(R);
    expect(s.g.state.player.lure).toBeGreaterThanOrEqual(0);
    // Mash jump holding right until she is thrown (3 beats: the cocoon's input).
    const ev: SimEvent[] = [];
    for (let k = 0; k < 6 && !ev.some((e) => e.type === 'lureFree'); k++)
      ev.push(...s.run(R | J, 1), ...s.run(R, 8));
    expect(ev.filter((e) => e.type === 'lureBeat').length).toBeGreaterThanOrEqual(2);
    expect(ev.find((e) => e.type === 'lureFree')).toMatchObject({ id: 'wick-caught' });
    for (let i = 0; i < 200 && !s.g.state.player.grounded; i++) s.run(R);
    expect(s.feet().y).toBe(960);
    expect(s.feet().x).toBeGreaterThan(1408);
  });

  it('a walker drops into the dip and hops out on the far side', () => {
    const s = play('wood-wicks');
    s.g.teleport(1100, 960);
    s.run(R, 30);
    expect(s.feet().y).toBe(1120);
    const f = naive(s, () => s.g.state.player.grounded && s.feet().y === 960 && s.feet().x > 1408, 600);
    expect(f).toBeGreaterThan(0);
  });

  it('the knob stops her (and the drag), and a standing forward cut from there snuffs W2', () => {
    const s = play('wood-wicks');
    s.g.teleport(1700, 960);
    s.run(R, 90);
    const p = s.g.state.player;
    expect(p.x + p.w).toBe(1984);
    expect(p.grounded).toBe(true);
    // Let go: the wick's drag cannot push her over the knob.
    s.run(0, 60);
    expect(s.g.state.player.x + s.g.state.player.w).toBe(1984);
    const ev = s.run(A, 1).concat(s.run(0, 30));
    expect(ev.find((e) => e.type === 'lureSnuff')).toMatchObject({ id: 'wick-first' });
  });

  it('the high wick is out of reach without wall jump (the lock)', () => {
    const s = play('wood-wicks');
    const hi = s.g.state.lures;
    s.g.teleport(1520, 960);
    // Jump at the hanging trunk, cut at the top: never near enough.
    s.run(R | J, 20);
    s.run(R | A, 1);
    s.run(R, 60);
    expect(hi.hp[2]).toBe(1);
    expect(s.g.state.player.lure).not.toBe(2);
  });
});

describe('R5 wood-glade: glade 1, the glide lock', () => {
  /** Runs off the lip (or jumps there) and reports where she ends up. */
  function offTheLip(abilities: string[], lead: number, hold: number, glide: boolean) {
    const s = play('wood-glade', abilities);
    s.g.teleport(900, 1664);
    s.runTo(1408 - 20 - lead);
    let ev = hold > 0 ? s.run(R | J, hold) : [];
    ev = ev.concat(s.run(glide ? R | J : R, 240));
    return {
      out: ev.some((e) => e.type === 'roomExit') || (s.g.state.room === 'wood-glade' && s.feet().y === 2176),
      caught: ev.some((e) => e.type === 'fallCatch'),
    };
  }

  it('falling in from the hollow, she lands in the moon shaft: glide is granted, P2 rests her', () => {
    const s = play('wood-burrow');
    s.g.teleport(4000, 1152);
    let ev: SimEvent[] = [];
    // Off the end of F3 into the hole, then hands off: she falls down the hollow.
    for (let i = 0; i < 600 && s.g.state.room !== 'wood-glade'; i++) ev = ev.concat(s.run(R));
    for (let i = 0; i < 300 && !s.g.state.player.grounded; i++) ev = ev.concat(s.run(0));
    expect(s.g.state.room).toBe('wood-glade');
    expect(s.g.state.save.abilities).toContain('glide');
    expect(ev.find((e) => e.type === 'gladeGrant')).toMatchObject({ id: 'glade-glide', ability: 'glide' });
    expect(s.feet().y).toBe(1664);
    expect(s.feet().x).toBeGreaterThan(192);
    expect(s.feet().x).toBeLessThan(576);
    const rest = s.run(0, 40);
    expect(rest.some((e) => e.type === 'patchRest')).toBe(true);
  });

  it('held right all the way down, glide is still granted on the way through the shaft', () => {
    const s = play('wood-burrow');
    s.g.teleport(4000, 1152);
    for (let i = 0; i < 600 && !(s.g.state.room === 'wood-glade' && s.g.state.player.grounded); i++) s.run(R);
    expect(s.g.state.save.abilities).toContain('glide');
    expect(s.feet().y).toBe(1664);
  });

  it('without glide she cannot leave: no jump from any point before the lip, held any length, makes the chasm', () => {
    let tries = 0;
    for (let lead = 0; lead <= 240; lead += 8)
      for (const hold of [0, 4, 8, 14, 24]) {
        const r = offTheLip([], lead, hold, true);
        tries++;
        expect(r.out, `lead ${lead} hold ${hold}`).toBe(false);
        expect(r.caught).toBe(true);
      }
    expect(tries).toBeGreaterThan(100);
  });

  it('with glide, the walk-off glide and the jump-glide both cross (a held jump, no lamp on the line)', () => {
    expect(getRoom('wood-glade').lures ?? []).toEqual([]);
    // Walk-off glide: jump already held from a hop, the wings open at the lip.
    const s = play('wood-glade', ['glide']);
    s.g.teleport(900, 1664);
    s.runTo(1300);
    s.run(R | J, 400);
    expect(s.g.state.room === 'wood-glidewalk' || s.feet().y === 2176).toBe(true);
    // Jump-glides from the last stretch before the lip.
    for (let lead = 0; lead <= 120; lead += 24) {
      const r = offTheLip(['glide'], lead, 14, true);
      expect(r.out, `jump-glide ${lead} px before the lip`).toBe(true);
      expect(r.caught).toBe(false);
    }
  });

  it('the chasm is a catch back to the lip, at no cost', () => {
    const s = play('wood-glade');
    s.g.teleport(1300, 1664);
    const hp = s.g.state.player.hp;
    const ev = s.run(R, 30).concat(s.run(0, 160));
    expect(ev.some((e) => e.type === 'fallCatch')).toBe(true);
    expect(s.g.state.player.hp).toBe(hp);
    expect(s.feet().y).toBe(1664);
  });

  it('the stubs are marked as stubs', () => {
    for (const id of ['wood-burrow', 'wood-glidewalk']) {
      const room: Room = getRoom(id);
      expect(room.title).toMatch(/^STUB/);
    }
  });
});
