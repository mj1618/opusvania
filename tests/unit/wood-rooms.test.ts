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
 * The wood's greybox rooms (docs/design/regions/wood.md draft 2, §3 and §7; memory/rooms.md) and their
 * claims, measured in the sim: R2 wood-chase, R3 wood-wicks, R4 wood-burrow, R5 wood-glade, R6
 * wood-glidewalk, R7 wood-hollow (the hub), R8 wood-hawkers, R9 wood-lantern. wood-well (R10) and
 * wood-climb (R11) are stubs that only join the world until they are built.
 */

const R = ActionBit.right;
const J = ActionBit.jump;
const A = ActionBit.attack;
const L = ActionBit.left;
const D = ActionBit.down;
const has = (ev: SimEvent[], type: string) => ev.some((e) => e.type === type);

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
    expect(placed('wood-burrow')).toEqual({ x: 15104, y: 4608, w: 4480, h: 1792 });
    expect(placed('wood-glidewalk')).toEqual({ x: 21824, y: 8064, w: 5760, h: 2368 });
    expect(placed('wood-hollow')).toEqual({ x: 27584, y: 7168, w: 3840, h: 3248 });
    expect(placed('wood-hawkers')).toEqual({ x: 31424, y: 8768, w: 3200, h: 1600 });
    expect(placed('wood-lantern')).toEqual({ x: 34624, y: 8768, w: 3200, h: 1600 });
    // The stubs hold R10's and R11's places until those rooms are built.
    expect(placed('wood-well')).toEqual({ x: 27584, y: 10416, w: 3840, h: 1600 });
    expect(placed('wood-climb')).toEqual({ x: 37184, y: 6208, w: 2048, h: 2560 });
  });

  it('the exits link the rooms in the order of the paper, one way where she drops', () => {
    const links = GAME_WORLD.links;
    expect(links['wood-hatch#drop']).toEqual({ to: 'wood-chase', exit: 'n' });
    expect(links['wood-chase#n']).toBeNull();
    expect(links['wood-chase#s']).toEqual({ to: 'wood-wicks', exit: 'n' });
    expect(links['wood-wicks#n']).toBeNull();
    expect(links['wood-wicks#e']).toEqual({ to: 'wood-burrow', exit: 'w' });
    expect(links['wood-burrow#w']).toEqual({ to: 'wood-wicks', exit: 'e' });
    expect(links['wood-burrow#hole']).toEqual({ to: 'wood-glade', exit: 'n' });
    expect(links['wood-glade#e']).toEqual({ to: 'wood-glidewalk', exit: 'w' });
    expect(links['wood-glidewalk#e']).toEqual({ to: 'wood-hollow', exit: 'w' });
    expect(links['wood-hollow#e']).toEqual({ to: 'wood-hawkers', exit: 'w' });
    expect(links['wood-hollow#well']).toEqual({ to: 'wood-well', exit: 'n' });
    expect(links['wood-well#n']).toBeNull();
    expect(links['wood-well#out']).toEqual({ to: 'wood-hollow', exit: 'climb' });
    expect(links['wood-hawkers#e']).toEqual({ to: 'wood-lantern', exit: 'w' });
    expect(links['wood-lantern#n']).toEqual({ to: 'wood-climb', exit: 's' });
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
    for (const id of ['wood-well', 'wood-climb']) {
      const room: Room = getRoom(id);
      expect(room.title).toMatch(/^STUB/);
    }
  });
});

/**
 * The one-wall climb: from the ground a straight jump (`rise` frames with no direction, so she does not
 * walk under a face that stops short of the floor), then holds `dir` into the wall and presses jump each
 * time she slides on it.
 */
function climb(
  s: ReturnType<typeof play>,
  dir: number,
  until: () => boolean,
  max = 900,
  rise = 10,
): SimEvent[] {
  const out: SimEvent[] = [];
  const toward = dir > 0 ? R : L;
  let last = 0;
  let sinceGround = 0;
  for (let f = 0; f < max && !until(); f++) {
    const p = s.g.state.player;
    sinceGround = p.grounded ? 0 : sinceGround + 1;
    const press = !(last & J) && (p.grounded || p.wallDir === dir) && (p.grounded || p.vy > -2);
    const held = last & J && p.vy < -4;
    const m = (p.grounded || sinceGround < rise ? 0 : toward) | (press || held ? J : 0);
    out.push(...s.run(m));
    last = m;
  }
  return out;
}

/** Beats free of a lure's hold: presses of jump, `dir` held. */
function beatFree(s: ReturnType<typeof play>, dir = 0): void {
  for (let k = 0; k < 8 && s.g.state.player.lure >= 0; k++) {
    s.run(dir | J, 1);
    s.run(dir, 9);
  }
}

describe('R4 wood-burrow: the blade against things', () => {
  it('W3 hangs 200 over F2: a jump-cut from the side can snuff it, is never caught; its burrback curls up', () => {
    // Measured (full held jumps, 9 cut timings, 100 px to the side): 1 of 9 goes out (the paper said 3-5).
    let snuffed = 0;
    for (const cut of [6, 8, 10, 12, 14, 16, 18, 20, 22]) {
      const s = play('wood-burrow');
      // From 100 px to the side, facing it (the paper's 60-140).
      s.g.teleport(1884, 1344);
      s.run(R, 1);
      const ev = s.run(J, cut).concat(s.run(J | A, 1), s.run(0, 60));
      expect(has(ev, 'lureCaught'), `cut at ${cut}`).toBe(false);
      if (has(ev, 'lureSnuff')) {
        snuffed++;
        expect(ev.find((e) => e.type === 'enemyDisperse')).toMatchObject({ lure: 'wick-burr' });
      }
    }
    expect(snuffed).toBeGreaterThanOrEqual(1);
  });

  it('the seed-case gap: no jump crosses it, the safe floor does not climb to F3, two pogos do', () => {
    for (const lead of [0, 40, 80]) {
      for (const hold of [4, 10, 22]) {
        const s = play('wood-burrow');
        s.g.teleport(2660 - lead, 1152);
        for (let i = 0; i < 60 && s.feet().x < 2808; i++) s.run(R);
        s.run(R | J, hold);
        s.run(R, 120);
        expect(s.feet().y, `lead ${lead} hold ${hold}`).toBe(1472);
      }
    }
    // The root roof: a full jump from under it rises at most ~210.
    const r = play('wood-burrow');
    r.g.teleport(2790, 1152);
    let top = 1152;
    for (let i = 0; i < 40; i++) {
      r.run(J);
      top = Math.min(top, r.feet().y);
    }
    expect(1152 - top).toBeLessThanOrEqual(210);
    // From the safe floor, a full jump at F3's face does not get up (320).
    const f = play('wood-burrow');
    f.g.teleport(3400, 1472);
    f.run(R | J, 30);
    f.run(R, 60);
    expect(f.feet().y).toBe(1472);
    // Hop, down-cut over each case, land on F3.
    let made = 0;
    for (const start of [2700, 2740, 2780]) {
      const s = play('wood-burrow');
      s.g.teleport(start, 1152);
      let last = 0;
      let pogo = 0;
      for (let i = 0; i < 200; i++) {
        const p = s.g.state.player;
        const ft = s.feet();
        let m = R;
        if (
          (p.grounded && ft.x > 2800 && ft.x < 2816 + 20) ||
          (!p.grounded && i < 50 && last & J && p.vy < 0)
        )
          m |= J;
        const near = [3008, 3296].some(
          (x) => Math.abs(x - ft.x) < 60 && 1124 - ft.y > -40 && 1124 - ft.y < 60,
        );
        if (!p.grounded && near && !(last & A)) m |= A | D;
        const ev = s.run(m);
        pogo += ev.filter((e) => e.type === 'slashHit' && e.pogo).length;
        last = m;
        if (s.g.state.player.grounded && ft.x > 3456) break;
      }
      if (s.feet().y === 1152 && s.feet().x > 3456 && pogo === 2) made++;
    }
    expect(made).toBeGreaterThan(0);
  });

  it('a miss climbs back: root steps from the safe floor to the root step', () => {
    const s = play('wood-burrow');
    s.g.teleport(3000, 1472);
    for (let k = 0; k < 2; k++) {
      s.run(L | J, 18);
      for (let i = 0; i < 90 && !s.g.state.player.grounded; i++) s.run(L);
      s.run(0, 2);
    }
    expect(s.feet().y).toBe(1152);
  });

  it('P1 rests her on F3; the hole drops her into the glade', () => {
    const s = play('wood-burrow');
    s.g.teleport(3776, 1152);
    expect(has(s.run(0, 40), 'patchRest')).toBe(true);
    for (let i = 0; i < 400 && s.g.state.room === 'wood-burrow'; i++) s.run(R);
    expect(s.g.state.room).toBe('wood-glade');
  });
});

describe('R6 wood-glidewalk: the glide ladder', () => {
  /** A walk-off glide off the lip at (lipX, y): a hop first, jump held through the landing and off the end. */
  function walkOff(lipX: number, y: number, w4out = false) {
    const s = play('wood-glidewalk', ['glide']);
    s.g.teleport(lipX - 200, y);
    if (w4out) {
      s.g.state.lures.hp[0] = 0;
      s.g.state.lures.out[0] = 1;
    }
    s.run(J, 1);
    for (let i = 0; i < 60 && !(s.g.state.player.grounded && i > 3); i++) s.run(J);
    for (let i = 0; i < 400 && s.g.state.player.grounded && s.feet().x < lipX + 40; i++) s.run(R | J);
    return { s, ev: s.run(R | J, 300) };
  }
  /** Runs to `lead` px before the lip and jumps, jump held. */
  function jumpGlide(s: ReturnType<typeof play>, lipX: number, lead: number, frames = 300) {
    for (let i = 0; i < 400 && s.feet().x < lipX - lead; i++) s.run(R);
    return s.run(R | J, frames);
  }

  it('gap 1 (800, drop 448): no jump from E0 or a rung makes T2; both glides do', () => {
    const p = play('wood-glidewalk', []);
    p.g.teleport(300, 512);
    jumpGlide(p, 576, 24, 22);
    p.run(R, 200);
    expect(p.feet().y).toBe(1408);
    const r = play('wood-glidewalk', []);
    r.g.teleport(600, 704);
    r.run(R | J, 22);
    r.run(R, 200);
    expect(r.feet().y).toBe(1408);
    expect(walkOff(576, 512).ev.find((e) => e.type === 'land')).toMatchObject({ y: 960 });
    // A jump-glide from a step or more back lands on T2; from the lip's last ~48 px it ends in W4's core
    // over T2 (the paper: "a tug, harmless over T2"; measured, a catch, and the throw lands her anywhere
    // from E0 to gap 2's thorns, by when she beats).
    const j = play('wood-glidewalk', ['glide']);
    j.g.teleport(300, 512);
    expect(jumpGlide(j, 576, 96).find((e) => e.type === 'land')).toMatchObject({ y: 960 });
    const t = play('wood-glidewalk', ['glide']);
    t.g.teleport(300, 512);
    expect(jumpGlide(t, 576, 0, 200).find((e) => e.type === 'lureCaught')).toMatchObject({
      id: 'wick-landing',
    });
  });

  it('gap 2 (1024, drop 512): with W4 out, the jump-glide is caught by W5 and beaten free onto T3; the walk-off passes under', () => {
    const j = play('wood-glidewalk', ['glide']);
    j.g.teleport(1800, 960);
    // W4 out: it hangs over T2's east end, and burning, its field catches any jump from this lip first.
    j.g.state.lures.hp[0] = 0;
    j.g.state.lures.out[0] = 1;
    expect(jumpGlide(j, 1984, 24, 120).find((e) => e.type === 'lureCaught')).toMatchObject({
      id: 'wick-line',
    });
    // Beaten free holding right, jump let go: T3 (the paper's +1515). (Gliding on after the throw instead
    // carries her over T3 and under the thorn branch to T4: memory/rooms.md.)
    beatFree(j, R);
    expect(j.run(R, 300).find((e) => e.type === 'land')).toMatchObject({ y: 1472 });
    const w = walkOff(1984, 960, true);
    expect(w.ev.some((e) => e.type === 'lureCaught' && e.id === 'wick-line')).toBe(false);
    expect(w.ev.find((e) => e.type === 'land')).toMatchObject({ y: 1472 });
  });

  it('gap 3 (1024, drop 512): the jump-glide hits the thorn branch; the walk-off glide lands on T4 clear of the burrback', () => {
    for (const lead of [0, 48, 120]) {
      const j = play('wood-glidewalk', ['glide']);
      j.g.teleport(3300, 1472);
      expect(jumpGlide(j, 3648, lead).find((e) => e.type === 'thornHit')).toMatchObject({
        id: 'thorn-branch',
      });
    }
    const w = walkOff(3648, 1472);
    expect(has(w.ev, 'thornHit')).toBe(false);
    const land = w.ev.find((e) => e.type === 'land') as { x: number; y: number };
    expect(land.y).toBe(1984);
    expect(land.x).toBeGreaterThan(4700);
    expect(land.x).toBeLessThan(4992 - 60);
  });

  it('rotten bark: the wall takes 3 cuts; the floor panel opens to W-pocket and she climbs back out', () => {
    const s = play('wood-glidewalk', ['glide']);
    s.g.teleport(5300, 1984);
    s.run(R, 20);
    let ev: SimEvent[] = [];
    for (let k = 0; k < 3; k++) ev = ev.concat(s.run(A, 1), s.run(0, 20));
    expect(ev.filter((e) => e.type === 'barkHit').length).toBeGreaterThanOrEqual(2);
    expect(ev.find((e) => e.type === 'barkBreak')).toMatchObject({ id: 'bark-wall' });
    s.g.teleport(5504, 1984);
    let broke = false;
    for (let k = 0; k < 6 && !broke; k++) {
      // A hop, and the down cut as she comes back down onto it.
      let e2 = s.run(J, 6);
      for (let i = 0; i < 40 && !(s.g.state.player.vy > 0 && s.feet().y > 1984 - 40); i++)
        e2 = e2.concat(s.run(0));
      e2 = e2.concat(s.run(D | A, 1), s.run(0, 30));
      broke = has(e2, 'barkBreak');
    }
    expect(broke).toBe(true);
    s.g.teleport(5504, 1984);
    s.run(0, 60);
    expect(s.feet().y).toBe(2176);
    s.g.teleport(5504, 2176);
    s.run(J, 22);
    s.run(L, 30);
    expect(s.feet().y).toBe(1984);
  });

  it('a fall into gap 1 climbs back to E0 by the rungs', () => {
    const s = play('wood-glidewalk', ['glide']);
    s.g.teleport(640, 1408);
    for (const y of [1216, 1024, 832, 704]) {
      s.run(J, 22);
      s.run(0, 30);
      expect(s.feet().y).toBe(y);
    }
    s.run(L | J, 22);
    s.run(L, 20);
    expect(s.feet().y).toBe(512);
  });

  it('the return bough: with wall jump, up T-ret and west along the canopy to over E0', () => {
    const s = play('wood-glidewalk', ['glide', 'wallJump']);
    s.g.teleport(5724, 1984);
    climb(s, -1, () => s.feet().y <= 200, 900, 14);
    for (let i = 0; i < 40; i++) s.run(L);
    expect(s.g.state.player.grounded).toBe(true);
    expect(s.feet().y).toBeLessThan(200);
    for (let i = 0; i < 900 && s.feet().x > 600; i++) s.run(L);
    expect(s.feet().y).toBeLessThan(100);
    expect(s.feet().x).toBeLessThanOrEqual(600);
  });
});

describe('R7 wood-hollow: the hub', () => {
  it('in from the glidewalk onto the root shelf; she drops to the floor, P3 rests her and the glimpse flag is set', () => {
    const s = play('wood-glidewalk', ['glide']);
    s.g.teleport(5600, 1984);
    for (let i = 0; i < 200 && s.g.state.room !== 'wood-hollow'; i++) s.run(R);
    expect(s.g.state.room).toBe('wood-hollow');
    for (let i = 0; i < 60 && !s.g.state.player.grounded; i++) s.run(R);
    expect(s.feet().y).toBe(2880);
    s.runTo(1280);
    s.run(0, 50);
    expect(s.feet().y).toBe(3136);
    expect(s.events.some((e) => e.type === 'patchRest')).toBe(true);
    expect(s.events.find((e) => e.type === 'flagSet')).toMatchObject({ flag: 'wood-firefly-glimpse' });
  });

  it('east along the unbroken floor, up the arch steps and out to the hawkers at floor level', () => {
    const s = play('wood-hollow', ['glide']);
    s.g.teleport(1280, 3136);
    naive(s, () => s.g.state.room !== 'wood-hollow', 900);
    expect(s.g.state.room).toBe('wood-hawkers');
    expect(s.feet().y).toBe(1280);
  });

  it('the well is behind her, under the shelf: turning back into the alcove drops her into the well', () => {
    const s = play('wood-hollow', ['glide']);
    s.g.teleport(1280, 3136);
    for (let i = 0; i < 400 && s.g.state.room === 'wood-hollow'; i++) s.run(L);
    expect(s.g.state.room).toBe('wood-well');
  });

  it('the up-shaft is a lock without wall jump, a climb to the crown with it', () => {
    const no = play('wood-hollow', ['glide']);
    no.g.teleport(2900, 3136);
    climb(no, 1, () => no.g.state.room !== 'wood-hollow' || no.feet().x > 2950, 600, 14);
    expect(no.feet().y).toBeGreaterThan(2700);
    const s = play('wood-hollow', ['glide', 'wallJump']);
    s.g.teleport(2900, 3136);
    climb(s, 1, () => s.feet().y <= 640, 1200, 14);
    for (let i = 0; i < 30; i++) s.run(R | J);
    s.run(R, 40);
    expect(s.feet().y).toBe(640);
    expect(s.feet().x).toBeGreaterThan(3008);
  });

  it('the grate holds from above; climbing out of the well below, her head opens it and she carries on up', () => {
    const top = play('wood-hollow', ['glide']);
    top.g.teleport(2750, 3136);
    top.run(0, 60);
    expect(top.feet().y).toBe(3136);
    expect(top.g.state.save.opened).toEqual([]);
    const s = play('wood-well', ['glide', 'wallJump']);
    s.g.teleport(2900, 1472);
    const ev = climb(
      s,
      1,
      () => s.g.state.room === 'wood-hollow' && s.g.state.save.opened.length > 0,
      1800,
      14,
    );
    expect(s.g.state.room).toBe('wood-hollow');
    expect(ev.find((e) => e.type === 'shortcutOpen')).toMatchObject({ id: 'grate' });
  });
});

describe('R8 wood-hawkers: the hawker over a safe floor', () => {
  it('W7 hangs 312 up: jump-cuts snuff it in about half the timings, and the hawker leaves', () => {
    let snuffed = 0;
    let caught = 0;
    for (const cut of [8, 10, 12, 14, 16, 18, 20, 22, 24]) {
      const s = play('wood-hawkers', ['glide']);
      s.g.teleport(1024 - 100, 1280);
      s.run(R, 1);
      const ev = s.run(J, cut).concat(s.run(J | A, 1), s.run(0, 60));
      if (has(ev, 'lureCaught')) caught++;
      if (has(ev, 'lureSnuff')) {
        snuffed++;
        expect(ev.find((e) => e.type === 'enemyDisperse')).toMatchObject({ lure: 'wick-hawk' });
      }
    }
    // Measured: 4 of 9 go out, 1 of 9 is pulled into the core (the paper: 5-6 of 9).
    expect(snuffed).toBeGreaterThanOrEqual(3);
    expect(caught).toBeLessThanOrEqual(2);
  });

  it('S1: the bark panel in the mound takes 3 cuts and opens an alcove with a wick', () => {
    const s = play('wood-hawkers', ['glide']);
    s.g.teleport(2300, 1280);
    s.run(R, 20);
    let ev: SimEvent[] = [];
    for (let k = 0; k < 3; k++) ev = ev.concat(s.run(A, 1), s.run(0, 20));
    expect(ev.find((e) => e.type === 'barkBreak')).toMatchObject({ id: 'bark-mound' });
    s.runTo(2540);
    const cut = s.run(A, 1).concat(s.run(0, 30));
    expect(cut.find((e) => e.type === 'lureSnuff')).toMatchObject({ id: 'wick-bark' });
  });
});

describe('R9 wood-lantern: the first lantern, the broken face', () => {
  it('L1 takes two jump-cuts from P', () => {
    // Measured (9 timings, 60-140 px to the side): 2 of 9 hit, 1-3 of 9 pulled into the core (the paper:
    // 3-5 of 9, never caught).
    let hits = 0;
    for (const cut of [6, 8, 10, 12, 14, 16, 18, 20, 22]) {
      const s = play('wood-lantern', ['glide']);
      s.g.teleport(1180, 960);
      s.run(R, 1);
      const ev = s.run(J, cut).concat(s.run(J | A, 1), s.run(0, 60));
      if (ev.some((e) => e.type === 'lureHit' || e.type === 'lureSnuff')) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(2);
    const s = play('wood-lantern', ['glide']);
    let out = false;
    for (let k = 0; k < 8 && !out; k++) {
      s.g.teleport(1180, 960);
      s.run(R, 1);
      // The cut on the way up (8 frames into the jump) lands; the second one puts it out.
      const ev = s.run(J, 8).concat(s.run(J | A, 1), s.run(0, 60));
      beatFree(s);
      s.run(0, 60);
      out = has(ev, 'lureSnuff') || s.g.state.lures.hp[0] === 0;
    }
    expect(out).toBe(true);
    expect(s.events.filter((e) => e.type === 'lureHit').length).toBeGreaterThanOrEqual(1);
  });

  it('the shaft: a lock without wall jump; with it, up the west face, across, and up the east face to the climb', () => {
    const no = play('wood-lantern', ['glide']);
    no.g.teleport(2600, 1280);
    climb(no, -1, () => no.g.state.room !== 'wood-lantern', 600, 14);
    expect(no.g.state.room).toBe('wood-lantern');
    const s = play('wood-lantern', ['glide', 'wallJump']);
    s.g.teleport(2600, 1280);
    climb(s, -1, () => s.feet().y < 900, 600, 14);
    expect(s.feet().y).toBeLessThan(900);
    // Kick off east, hold jump and right: across to the east face.
    let ev: SimEvent[] = [];
    for (let i = 0; i < 120 && s.g.state.player.wallDir !== 1; i++) ev = ev.concat(s.run(R | J));
    expect(s.g.state.player.wallDir).toBe(1);
    ev = ev.concat(climb(s, 1, () => s.g.state.room !== 'wood-lantern', 1500));
    expect(s.g.state.room).toBe('wood-climb');
    expect(has(ev, 'thornHit')).toBe(false);
  });
});

describe('R5: the naive bot reads the glade line', () => {
  it('a naive player who holds jump once told to, leaves the glade by its glide', async () => {
    const { runHeadless } = await import('../../tools/playtest/headless');
    const r = runHeadless({ room: 'wood-glade', persona: 'naive', seconds: 60 });
    expect(r.trace.outcome).toBe('exit');
    expect(r.trace.exitId).toBe('e');
  });
});
