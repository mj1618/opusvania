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
 * wood-glidewalk, R7 wood-hollow (the hub), R8 wood-hawkers, R9 wood-lantern, R10 wood-well (round 1 of
 * the quality iteration: docs/design/regions/reviews/chunk1-plan-r1.md). wood-climb (R11) is a stub.
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

/** The naive habit with a glide: a jump at an edge or a wall is held while she is in the air. */
function glideOn(s: ReturnType<typeof play>, done: () => boolean, max = 3600, dir = 1): number {
  let jumpUntil = -1;
  const M = dir > 0 ? R : L;
  for (let f = 0; f < max; f++) {
    if (done()) return f;
    const p = s.g.state.player;
    const ft = s.feet();
    const ahead = solidAt(s.g.scene, ft.x + 12 * dir, ft.y, 1, 1);
    if (f > jumpUntil + 1 && p.grounded && (p.wallDir === dir || !ahead)) jumpUntil = f + 14;
    s.run(M | (f < jumpUntil || !p.grounded ? J : 0));
  }
  return -1;
}

/** A hop and a down cut as she comes back onto the floor at `floorY`, until a bark panel breaks. */
function downCut(s: ReturnType<typeof play>, floorY: number, tries = 6): boolean {
  for (let k = 0; k < tries; k++) {
    let ev = s.run(J, 6);
    for (let i = 0; i < 40 && !(s.g.state.player.vy > 0 && s.feet().y > floorY - 40); i++)
      ev = ev.concat(s.run(0));
    ev = ev.concat(s.run(D | A, 1), s.run(0, 30));
    if (has(ev, 'barkBreak')) return true;
  }
  return false;
}

describe('the wood: placement (wood.md §3, world px)', () => {
  it('each room sits where the paper puts it, the size it says', () => {
    expect(placed('wood-chase')).toEqual({ x: 5760, y: 2816, w: 6400, h: 1920 });
    expect(placed('wood-wicks')).toEqual({ x: 11264, y: 4736, w: 3840, h: 2176 });
    expect(placed('wood-glade')).toEqual({ x: 18944, y: 6400, w: 2880, h: 2504 });
    expect(placed('wood-burrow')).toEqual({ x: 15104, y: 4608, w: 4480, h: 1792 });
    expect(placed('wood-glidewalk')).toEqual({ x: 21824, y: 8064, w: 5760, h: 2368 });
    expect(placed('wood-hollow')).toEqual({ x: 27584, y: 7168, w: 3840, h: 3248 });
    expect(placed('wood-hawkers')).toEqual({ x: 31424, y: 7424, w: 3840, h: 2752 });
    expect(placed('wood-lantern')).toEqual({ x: 35264, y: 7424, w: 3840, h: 2992 });
    // The well runs under the hub, the hawkers and the lantern room: in at the lantern room's foot.
    expect(placed('wood-well')).toEqual({ x: 27584, y: 10416, w: 11264, h: 2240 });
    // The stub holds R11's place until it is built.
    expect(placed('wood-climb')).toEqual({ x: 38336, y: 4864, w: 2048, h: 2560 });
    // R14, the cap stair: north-west of the hub, over the glidewalk's east end.
    expect(placed('wood-caps')).toEqual({ x: 23744, y: 5376, w: 3840, h: 2688 });
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
    // Round 1: the loop (the lantern room's floor drops into the well, the climb-out comes up in the hub)
    // and the canopy line east from the crown.
    expect(links['wood-lantern#panel']).toEqual({ to: 'wood-well', exit: 'shaft' });
    expect(links['wood-well#shaft']).toBeNull();
    expect(links['wood-hollow#e-high']).toEqual({ to: 'wood-hawkers', exit: 'w-high' });
    expect(links['wood-hawkers#e-high']).toEqual({ to: 'wood-lantern', exit: 'w-high' });
    // The cap stair: up from the hub's west wall, down onto the glidewalk's return bough.
    expect(links['wood-hollow#nw']).toEqual({ to: 'wood-caps', exit: 'e' });
    expect(links['wood-caps#s']).toEqual({ to: 'wood-glidewalk', exit: 'n-bough' });
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

  it('the walk line: gaps of at most 128, steps up of at most 128, real drops of about 320', () => {
    // The walk line: the top of each solid, west to east (the fallen trunk's rects are one log; the
    // west wall's pieces, kick false, are not on it).
    const tops = room.solids
      .filter((r) => r.kick !== false)
      .sort((a, b) => a.x - b.x)
      .map((r) => ({ x0: r.x, x1: r.x + r.w, y: r.y }));
    let drops = 0;
    for (let i = 1; i < tops.length; i++) {
      const a = tops[i - 1] as (typeof tops)[number];
      const b = tops[i] as (typeof tops)[number];
      expect(b.x0 - a.x1).toBeLessThanOrEqual(128);
      expect(a.y - b.y).toBeLessThanOrEqual(128);
      expect(b.y - a.y).toBeLessThanOrEqual(336);
      if (b.y - a.y >= 256) drops++;
    }
    expect(drops).toBe(2);
    expect(room.enemies ?? []).toEqual([]);
    expect((room.lures ?? []).map((l) => l.id)).toEqual(['wick-cave']);
  });

  it('the fallen trunk: she runs its back and both real drops without a catch', () => {
    const s = play('wood-chase');
    s.g.teleport(1500, 704);
    for (let i = 0; i < 900 && s.feet().x < 5000; i++) s.run(R);
    expect(s.feet().y).toBe(1600);
    expect(has(s.events, 'fallCatch')).toBe(false);
  });

  it('the first lamp, a find behind her landing: W-cave, a standing up-cut from under it (never pulled in)', () => {
    const s = play('wood-chase');
    s.g.teleport(160, 704);
    s.run(0, 10);
    const ev = s.run(ActionBit.up | A, 1).concat(s.run(0, 40));
    expect(ev.find((e) => e.type === 'lureSnuff')).toMatchObject({ id: 'wick-cave' });
    expect(has(s.events, 'lureCaught')).toBe(false);
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
    s.g.teleport(5300, 1600);
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
    // The only lamp is W-alcove, under the lip, below every line out.
    expect((getRoom('wood-glade').lures ?? []).every((l) => l.y > 1856)).toBe(true);
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

  it('a find under the lip: walk off, turn back, glide into the alcove to W-alcove', () => {
    const s = play('wood-glade', ['glide']);
    s.g.teleport(1380, 1664);
    for (let i = 0; i < 30 && s.g.state.player.grounded; i++) s.run(R);
    for (let i = 0; i < 60 && s.feet().y < 1880; i++) s.run(0);
    s.run(L | J, 60);
    s.run(L, 20);
    expect(s.feet().x).toBeLessThan(1408);
    expect(s.feet().y).toBeGreaterThan(1856);
    expect(s.events.some((e) => e.type === 'lureCaught' || e.type === 'fallCatch')).toBe(true);
    expect(s.events.find((e) => e.type === 'lureCaught')).toMatchObject({ id: 'wick-alcove' });
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
    for (const id of ['wood-climb']) {
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

/**
 * The paper's jump-cut sweep (wood.md "Measured reach"): 60-140 px to the side facing the flame, jump held,
 * a forward cut in the rise (frames 2-18), jump still held after it. Returns hits and catches of 45.
 */
function jumpCuts(room: string, fx: number, floorY: number, abilities: string[] = ['glide']) {
  let hits = 0;
  let caught = 0;
  for (const off of [60, 80, 100, 120, 140]) {
    for (let k = 2; k <= 18; k += 2) {
      const s = play(room, abilities);
      s.g.teleport(fx - off, floorY);
      s.run(R, 1);
      const ev = s.run(J, k).concat(s.run(J | A, 1), s.run(J, 30), s.run(0, 30));
      if (ev.some((e) => e.type === 'lureHit' || e.type === 'lureSnuff')) hits++;
      if (has(ev, 'lureCaught')) caught++;
    }
  }
  return { hits, caught };
}

describe('R4 wood-burrow: the blade against things', () => {
  it("W3 hangs 200 over F2: the paper's jump-cut sweep puts it out in 3-5 of 9, never caught; its burrback curls up", () => {
    const { hits, caught } = jumpCuts('wood-burrow', 1984, 1344, []);
    // Measured: 17 of 45 (3.4 of 9).
    expect(hits).toBeGreaterThanOrEqual(15);
    expect(hits).toBeLessThanOrEqual(25);
    expect(caught).toBe(0);
    const s = play('wood-burrow');
    s.g.teleport(1884, 1344);
    s.run(R, 1);
    let out: SimEvent[] = [];
    for (let k = 2; k <= 18 && !has(out, 'lureSnuff'); k += 2) {
      s.g.teleport(1884, 1344);
      s.run(R, 1);
      out = s.run(J, k).concat(s.run(J | A, 1), s.run(J, 30), s.run(0, 30));
    }
    expect(s.events.find((e) => e.type === 'enemyDisperse')).toMatchObject({ lure: 'wick-burr' });
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

  it('a fade before P1 stands her up at the burrow door, not beside the burrback', () => {
    const s = play('wood-burrow');
    s.g.state.player.hp = 1;
    s.g.teleport(1700, 1344);
    // Into W3's light and the burrback's ram until the blow fades her.
    for (let i = 0; i < 900 && !has(s.events, 'reform'); i++) s.run(R);
    expect(has(s.events, 'fade')).toBe(true);
    expect(Math.abs(s.feet().x - 300)).toBeLessThanOrEqual(16);
    expect(s.feet().y).toBe(1280);
  });

  it('seed-0: a seed-case over F1 (safe floor): a hop and a down cut bounce her in place', () => {
    const s = play('wood-burrow');
    s.g.teleport(1000, 1280);
    s.run(J, 10);
    for (let i = 0; i < 40 && !(s.g.state.player.vy > 0 && s.feet().y > 1180); i++) s.run(0);
    const ev = s.run(D | A, 1).concat(s.run(0, 3));
    expect(ev.find((e) => e.type === 'slashHit')).toMatchObject({ pogo: true });
    expect(s.g.state.player.vy).toBeLessThan(-10);
    s.run(0, 80);
    expect(s.feet().y).toBe(1280);
    expect(Math.abs(s.feet().x - 1000)).toBeLessThan(40);
  });

  it('a find by the door: the bark floor panel opens a pocket with W-pocket, and she hops back out', () => {
    const s = play('wood-burrow');
    s.g.teleport(432, 1280);
    let broke = false;
    for (let k = 0; k < 6 && !broke; k++) {
      let e2 = s.run(J, 6);
      for (let i = 0; i < 40 && !(s.g.state.player.vy > 0 && s.feet().y > 1240); i++)
        e2 = e2.concat(s.run(0));
      e2 = e2.concat(s.run(D | A, 1), s.run(0, 30));
      broke = has(e2, 'barkBreak');
    }
    expect(broke).toBe(true);
    s.g.teleport(476, 1472);
    s.run(0, 5);
    const ev = s.run(R, 1).concat(s.run(A, 1), s.run(0, 30));
    expect(ev.find((e) => e.type === 'lureSnuff')).toMatchObject({ id: 'wick-pocket' });
    s.g.teleport(420, 1472);
    s.run(J, 22);
    s.run(L, 30);
    expect(s.feet().y).toBe(1280);
  });
});

describe('R6 wood-glidewalk: the glide ladder', () => {
  /** A walk-off glide off the lip at (lipX, y): a hop first, jump held through the landing and off the end. */
  function walkOff(lipX: number, y: number, w4out = false, back = 200) {
    const s = play('wood-glidewalk', ['glide']);
    // A short drop onto the floor with jump held (as a glide lands): jump is held, no hop (a hop under W4
    // is pulled into it).
    s.g.teleport(lipX - back, y - 40);
    if (w4out) {
      s.g.state.lures.hp[0] = 0;
      s.g.state.lures.out[0] = 1;
    }
    s.run(J, 1);
    for (let i = 0; i < 60 && !s.g.state.player.grounded; i++) s.run(J);
    for (let i = 0; i < 400 && s.g.state.player.grounded && s.feet().x < lipX + 40; i++) s.run(R | J);
    // (The landing beyond the lip: lower than where she walked off.)
    const ev = s.run(R | J, 300).filter((e) => e.type !== 'land' || e.y > y);
    return { s, ev };
  }
  /** Runs to `lead` px before the lip and jumps, jump held. */
  function jumpGlide(s: ReturnType<typeof play>, lipX: number, lead: number, frames = 300) {
    for (let i = 0; i < 400 && s.feet().x < lipX - lead; i++) s.run(R);
    return s.run(R | J, frames);
  }

  it('gap 1 (800, drop 448): no jump from E0 or a rung makes T2; both glides do, and W4 never catches one', () => {
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
    // W4 hangs 320 over T2 (the paper's 200 put it on the jump-glide's end): a long glide passes under.
    for (const lead of [0, 24, 48, 72, 96, 120]) {
      const j = play('wood-glidewalk', ['glide']);
      j.g.teleport(300, 512);
      const ev = jumpGlide(j, 576, lead);
      expect(has(ev, 'lureCaught'), `lead ${lead}`).toBe(false);
      expect(
        ev.find((e) => e.type === 'land'),
        `lead ${lead}`,
      ).toMatchObject({ y: 960 });
    }
    const { hits, caught } = jumpCuts('wood-glidewalk', 1800, 960);
    expect(hits).toBeGreaterThanOrEqual(15);
    expect(caught).toBe(0);
  });

  it('gap 2 (1024, drop 512): the jump-glide from the lip is caught by W5 and beaten free onto T3; the walk-off passes under', () => {
    for (const lead of [0, 24, 48]) {
      const j = play('wood-glidewalk', ['glide']);
      j.g.teleport(1800, 960);
      expect(
        jumpGlide(j, 1984, lead, 120).find((e) => e.type === 'lureCaught'),
        `lead ${lead}`,
      ).toMatchObject({
        id: 'wick-line',
      });
    }
    // Beaten free holding right, jump let go: T3 (the paper's +1515) in most beat timings, gap 2's thorns
    // in the rest (measured 5 of 8 and 3 of 8); never past T3.
    let t3 = 0;
    for (const lead of [0, 8, 16, 24, 32, 40, 48, 56]) {
      const j = play('wood-glidewalk', ['glide']);
      j.g.teleport(1800, 960);
      jumpGlide(j, 1984, lead, 4);
      for (let i = 0; i < 200 && j.g.state.player.lure < 0 && !j.g.state.player.grounded; i++) j.run(R | J);
      if (j.g.state.player.lure < 0) continue;
      beatFree(j, R);
      const first = j.run(R, 300).find((e) => e.type === 'land' || e.type === 'thornHit') as { y: number };
      expect(first.y).toBeLessThan(1984);
      if (first.y === 1472) t3++;
    }
    expect(t3).toBeGreaterThanOrEqual(4);
    // The walk-off line from gap 1 on: landed on T2 with jump held, she walks on and off T2's lip with the
    // wings open, under W5, onto T3 (W4 never catches a walker; a hop under it does).
    const w = walkOff(576, 512);
    const lands = w.ev
      .concat(w.s.run(R | J, 300))
      .filter((e) => e.type === 'land' || e.type === 'lureCaught');
    expect(lands.map((e) => (e.type === 'land' ? e.y : e.id)).slice(0, 2)).toEqual([960, 1472]);
  });

  it("gap 3 (1024, drop 512): the thorn branch sits over the jump's apex, so the jump-glide and the walk-off glide both cross", () => {
    // Round 1 (the impatient first-timer: "hold jump to glide" teaches the jump-glide, and the branch sat on it).
    for (const lead of [0, 48, 120]) {
      const j = play('wood-glidewalk', ['glide']);
      j.g.teleport(3300, 1472);
      const ev = jumpGlide(j, 3648, lead);
      expect(has(ev, 'thornHit'), `lead ${lead}`).toBe(false);
      expect(j.feet().x, `lead ${lead}`).toBeGreaterThan(4672);
    }
    const w = walkOff(3648, 1472);
    expect(has(w.ev, 'thornHit')).toBe(false);
    const land = w.ev.find((e) => e.type === 'land') as { x: number; y: number };
    expect(land.y).toBe(1984);
    expect(land.x).toBeGreaterThan(4700);
    expect(land.x).toBeLessThan(4992 - 60);
  });

  it("gliding on after W5's throw lands on T3 or T4, never in gap 3's thorns", () => {
    for (const lead of [0, 8, 16, 24, 32, 40, 48, 56]) {
      const j = play('wood-glidewalk', ['glide']);
      j.g.teleport(1800, 960);
      jumpGlide(j, 1984, lead, 4);
      for (let i = 0; i < 200 && j.g.state.player.lure < 0 && !j.g.state.player.grounded; i++) j.run(R | J);
      if (j.g.state.player.lure < 0) continue;
      beatFree(j, R);
      const ev = j.run(R | J, 300);
      expect(has(ev, 'thornHit'), `lead ${lead}`).toBe(false);
      const first = ev.find((e) => e.type === 'land' || e.type === 'lureCaught') as {
        type: string;
        y?: number;
      };
      expect(first?.type === 'lureCaught' || first?.y === 1472 || first?.y === 1984, `lead ${lead}`).toBe(
        true,
      );
    }
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

  it("the roof over E0's lip caps a jump (the walk-off, taught); P-t3 rests her on T3", () => {
    const s = play('wood-glidewalk', ['glide']);
    s.g.teleport(540, 512);
    let top = 512;
    for (let i = 0; i < 40; i++) {
      s.run(J);
      top = Math.min(top, s.feet().y);
    }
    expect(512 - top).toBeLessThanOrEqual(120);
    const t = play('wood-glidewalk', ['glide']);
    t.g.teleport(3200, 1472);
    expect(has(t.run(0, 40), 'patchRest')).toBe(true);
    expect(t.g.state.save.patch).toEqual({ room: 'wood-glidewalk', id: 'p-t3' });
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
    // W-ff (the firefly's glow-cap) is not there before the glimpse...
    const ff = (s.g.scene.lures ?? []).findIndex((l) => l.id === 'wick-firefly');
    s.run(0, 1);
    expect(s.g.state.lures.hp[ff]).toBe(0);
    s.runTo(1280);
    s.run(0, 50);
    expect(s.feet().y).toBe(3136);
    expect(s.events.some((e) => e.type === 'patchRest')).toBe(true);
    expect(s.events.find((e) => e.type === 'flagSet')).toMatchObject({ flag: 'wood-firefly-glimpse' });
    // ...and burns once it is set.
    expect(s.g.state.lures.hp[ff]).toBeGreaterThan(0);
  });

  it('east along the unbroken floor, up the arch steps and out to the hawkers at floor level', () => {
    const s = play('wood-hollow', ['glide']);
    s.g.teleport(1280, 3136);
    naive(s, () => s.g.state.room !== 'wood-hollow', 900);
    expect(s.g.state.room).toBe('wood-hawkers');
    expect(s.feet().y).toBe(2624);
  });

  it('the well is behind her, under the shelf: a lid until she has climbed out of the well, then the shortcut down', () => {
    const s = play('wood-hollow', ['glide']);
    s.g.teleport(700, 3136);
    for (let i = 0; i < 300 && s.g.state.room === 'wood-hollow'; i++) s.run(L);
    expect(s.g.state.room).toBe('wood-hollow');
    expect(s.feet().y).toBe(3136);
    const o = play('wood-hollow', ['glide']);
    o.g.state.save.flags.push('wood-climbout');
    o.run(0, 3);
    o.g.teleport(700, 3136);
    for (let i = 0; i < 300 && o.g.state.room === 'wood-hollow'; i++)
      o.run(L | (o.g.state.player.grounded && o.g.state.player.wallDir === -1 ? J : 0));
    for (let i = 0; i < 300 && !o.g.state.player.grounded; i++) o.run(0);
    expect(o.g.state.room).toBe('wood-well');
    expect(o.feet().y).toBe(2112);
    expect(o.feet().x).toBeLessThan(640);
  });

  it('the canopy line: from the crown east over the hawkers and the lantern room to its shaft window', () => {
    const s = play('wood-hollow', ['glide', 'wallJump']);
    s.g.teleport(3500, 640);
    const f = glideOn(s, () => s.g.state.room === 'wood-lantern' && s.feet().x > 2600, 3000);
    expect(f).toBeGreaterThan(0);
    expect(s.feet().y).toBeLessThanOrEqual(704);
    expect(has(s.events, 'fallCatch')).toBe(false);
  });

  it('camera zones frame the hub: a rest frame at P3, a tall frame up the shaft', () => {
    const z = getRoom('wood-hollow').camera?.zones ?? [];
    expect(z.map((q) => q.id).sort()).toEqual(['look-up', 'rest']);
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

  it('the root mesh over the climb holds from above and refuses drop-through (noDrop); the climb-out comes up through it and lands', () => {
    const top = play('wood-hollow', ['glide']);
    top.g.teleport(2750, 3136);
    top.run(0, 60);
    expect(top.feet().y).toBe(3136);
    // No sequence break (eff24e3): down + jump on the mesh does not drop her through to R10's climb-out and
    // glade 2 (wall jump without the old burrback). Every spot on it, pressed afresh or held.
    for (let x = 2580; x <= 2924; x += 24) {
      const d = play('wood-hollow', ['glide']);
      d.g.teleport(x, 3136);
      d.run(0, 5);
      const ev = d.run(D, 3).concat(d.run(D | J, 10), d.run(D, 40), d.run(0, 20));
      expect(has(ev, 'dropThrough'), `x ${x}`).toBe(false);
      expect(d.g.state.room, `x ${x}`).toBe('wood-hollow');
      expect(d.feet().y, `x ${x}`).toBeLessThanOrEqual(3136);
    }
    // (A plain one-way still drops: the high root by NW.)
    const o = play('wood-hollow', ['glide']);
    o.g.teleport(200, 832);
    o.run(0, 5);
    expect(has(o.run(D | J, 10), 'dropThrough')).toBe(true);
    // A jump across the shaft's foot lands on the mesh, not in the well.
    top.g.teleport(2400, 3136);
    top.run(R | J, 20);
    top.run(R, 30);
    expect(top.g.state.room).toBe('wood-hollow');
    const s = play('wood-well', ['glide', 'wallJump']);
    s.g.teleport(2750, 2112);
    // The same kicks carry on past the room's edge (the floor's faces): once over the mesh she lets go and lands.
    climb(s, 1, () => s.g.state.room === 'wood-hollow' && s.feet().y < 3100, 1800, 10);
    expect(s.g.state.room).toBe('wood-hollow');
    for (let i = 0; i < 120 && !s.g.state.player.grounded; i++) s.run(0);
    expect(s.feet().y).toBe(3136);
    // The climb-out sets the flag that lifts the well's lid.
    expect(s.g.state.save.flags).toContain('wood-climbout');
  });
});

describe('R8 wood-hawkers: the hawker over the hummocks, the canopy line', () => {
  it("W7 hangs 312 over hummock B: the paper's jump-cut sweep puts it out, and the hawker leaves", () => {
    const { hits, caught } = jumpCuts('wood-hawkers', 1920, 2432);
    // Measured: 30 of 45 (6.0 of 9), none caught.
    expect(hits).toBeGreaterThanOrEqual(22);
    expect(caught).toBe(0);
    const s = play('wood-hawkers', ['glide']);
    for (let k = 2; k <= 18 && !has(s.events, 'lureSnuff'); k += 2) {
      s.g.teleport(1920 - 100, 2432);
      s.run(R, 1);
      s.run(J, k);
      s.run(J | A, 1);
      s.run(J, 30);
      s.run(0, 30);
    }
    expect(s.events.find((e) => e.type === 'enemyDisperse')).toMatchObject({ lure: 'wick-hawk' });
  });

  it('the hawker engages: lit on hummock A, seen and dived on before she can reach W7 (1.5 s or more)', () => {
    const s = play('wood-hawkers', ['glide']);
    s.g.teleport(300, 2624);
    let lit = -1;
    let onB = -1;
    let jumpUntil = -1;
    for (let f = 0; f < 900 && onB < 0; f++) {
      const p = s.g.state.player;
      if (lit < 0 && p.lit > 0) lit = f;
      if (p.grounded && s.feet().x > 1760 && s.feet().y === 2432) onB = f;
      const ft = s.feet();
      const ahead = solidAt(s.g.scene, ft.x + 12, ft.y, 1, 1);
      if (f > jumpUntil + 1 && p.grounded && (p.wallDir === 1 || !ahead)) jumpUntil = f + 14;
      s.run(R | (f < jumpUntil ? J : 0));
    }
    // Measured: lit at 84, noticed at 93, hit at 165, on hummock B at 194.
    expect(onB - lit).toBeGreaterThanOrEqual(90);
    expect(has(s.events, 'enemyNotice')).toBe(true);
    expect(has(s.events, 'enemyDive')).toBe(true);
  });

  it('S1: the bark panel in the mound takes 3 cuts and opens a cavity with a wick', () => {
    const s = play('wood-hawkers', ['glide']);
    s.g.teleport(2560, 2624);
    s.run(R, 20);
    let ev: SimEvent[] = [];
    for (let k = 0; k < 3; k++) ev = ev.concat(s.run(A, 1), s.run(0, 20));
    expect(ev.find((e) => e.type === 'barkBreak')).toMatchObject({ id: 'bark-mound' });
    s.runTo(2860);
    const cut = s.run(A, 1).concat(s.run(0, 30));
    expect(cut.find((e) => e.type === 'lureSnuff')).toMatchObject({ id: 'wick-bark' });
  });

  it('going west from the dark half, the naive habit hops the mound (wick-bark out of its way) and reaches the hub', () => {
    const s = play('wood-hawkers', ['glide']);
    s.g.teleport(3500, 2624);
    // (The route, with W7 already out and its hawker gone. With it live the naive habit takes 4 hits stuck at
    // x ~1492 under its dives and fades; it only got through before because a fade re-formed her close by.
    // Since a fade re-forms her at her door (feel review round 2, problem 7) she meets it the same way again.)
    const hawk = (s.g.scene.lures ?? []).findIndex((l) => l.id === 'wick-hawk');
    s.g.state.lures.hp[hawk] = 0;
    s.g.state.lures.out[hawk] = 1;
    let jumpUntil = -1;
    let f = 0;
    for (; f < 3000 && s.g.state.room === 'wood-hawkers'; f++) {
      const p = s.g.state.player;
      const ft = s.feet();
      const ahead = solidAt(s.g.scene, ft.x - 12, ft.y, 1, 1);
      if (f > jumpUntil + 1 && p.grounded && (p.wallDir === -1 || !ahead)) jumpUntil = f + 14;
      s.run(L | (f < jumpUntil ? J : 0));
      if (f === 600) expect(s.feet().x).toBeLessThan(2600);
    }
    expect(s.g.state.room).toBe('wood-hollow');
    expect(s.events.some((e) => e.type === 'lureCaught' && e.id === 'wick-bark')).toBe(false);
  });

  it('P-dark rests her in the dark half', () => {
    const s = play('wood-hawkers', ['glide']);
    s.g.teleport(3520, 2624);
    expect(has(s.run(0, 40), 'patchRest')).toBe(true);
  });
});

describe('R9 wood-lantern: the first lantern, the broken face, the way down', () => {
  it('the west door and the spawn are clear (the hanging ledge is tied to the canopy, not the floor)', () => {
    const room = getRoom('wood-lantern');
    expect(solidAt(room, room.spawn.x - 20, room.spawn.y - 80, 40, 80)).toBe(false);
    const s = play('wood-hawkers', ['glide']);
    s.g.teleport(3700, 2624);
    for (let i = 0; i < 300 && !(s.g.state.room === 'wood-lantern' && s.feet().x > 1000); i++) s.run(R);
    expect(s.g.state.room).toBe('wood-lantern');
    expect(s.feet().x).toBeGreaterThan(1000);
  });

  it('L1 takes two jump-cuts from P (its guards gone): never caught', () => {
    let hits = 0;
    let caught = 0;
    for (const off of [60, 80, 100, 120, 140]) {
      for (let k = 2; k <= 18; k += 2) {
        const s = play('wood-lantern', ['glide']);
        for (const e of s.g.state.enemies) {
          e.mode = 'dead';
          e.gone = true;
        }
        s.g.teleport(1280 - off, 2304);
        s.run(R, 1);
        const ev = s.run(J, k).concat(s.run(J | A, 1), s.run(J, 30), s.run(0, 30));
        if (ev.some((e) => e.type === 'lureHit' || e.type === 'lureSnuff')) hits++;
        if (has(ev, 'lureCaught')) caught++;
      }
    }
    // Measured: 20 of 45 (4.0 of 9).
    expect(hits).toBeGreaterThanOrEqual(15);
    expect(caught).toBe(0);
  });

  it("the burrback stays on P (fenced short of its ends); the dangler hangs over P's east end", () => {
    const s = play('wood-lantern', ['glide']);
    const b = s.g.state.enemies.find((e) => e.id === 'burr-lantern');
    if (!b) throw new Error('no burrback');
    s.g.teleport(1040, 2304);
    let x0 = b.x;
    let x1 = b.x;
    for (let i = 0; i < 600; i++) {
      s.run(i % 40 < 20 ? R : L);
      x0 = Math.min(x0, b.x);
      x1 = Math.max(x1, b.x + b.w);
    }
    expect(x0).toBeGreaterThanOrEqual(1024);
    expect(x1).toBeLessThanOrEqual(1536);
    expect(b.y + b.h).toBe(2304);
  });

  it('the shaft: a lock without wall jump; with it, up the west face, across, and up the east face to the climb', () => {
    const no = play('wood-lantern', ['glide']);
    no.g.teleport(3150, 2624);
    climb(no, -1, () => no.g.state.room !== 'wood-lantern', 600, 14);
    expect(no.g.state.room).toBe('wood-lantern');
    const s = play('wood-lantern', ['glide', 'wallJump']);
    s.g.teleport(3150, 2624);
    climb(s, -1, () => s.feet().y < 2000, 600, 14);
    expect(s.feet().y).toBeLessThan(2000);
    // Kick off east, hold jump and right: across to the east face.
    let ev: SimEvent[] = [];
    for (let i = 0; i < 120 && s.g.state.player.wallDir !== 1; i++) ev = ev.concat(s.run(R | J));
    expect(s.g.state.player.wallDir).toBe(1);
    ev = ev.concat(climb(s, 1, () => s.g.state.room !== 'wood-lantern', 1500));
    expect(s.g.state.room).toBe('wood-climb');
    expect(has(ev, 'thornHit')).toBe(false);
  });

  it("the way down: the bark floor at the shaft's foot breaks to down cuts and drops her onto the chute's patch", () => {
    const s = play('wood-lantern', ['glide']);
    s.g.teleport(3300, 2624);
    expect(downCut(s, 2624)).toBe(true);
    for (let i = 0; i < 200 && s.g.state.room === 'wood-lantern'; i++) s.run(0);
    for (let i = 0; i < 200 && !s.g.state.player.grounded; i++) s.run(0);
    expect(s.g.state.room).toBe('wood-well');
    expect(s.feet().y).toBe(448);
    expect(has(s.run(0, 40), 'patchRest')).toBe(true);
  });
});

describe('R10 wood-well: the chute, the old burrback, glade 2, the climb-out', () => {
  /** Down the chute (a jump-glide at each edge) into the pit. */
  function pit() {
    const s = play('wood-well', ['glide']);
    s.g.teleport(10944, 448);
    glideOn(s, () => s.feet().x < 5632 && s.g.state.player.grounded, 3000, -1);
    return s;
  }
  const old = (s: ReturnType<typeof play>) => s.g.state.enemies.find((e) => e.id === 'old-burr');

  it('down the chute (jump-glides, no catch) and the roof hole into the pit: the old burrback wakes and never strikes on her landing', () => {
    const s = pit();
    expect(s.feet().y).toBe(2112);
    expect(s.feet().x).toBeGreaterThan(3584);
    expect(has(s.events, 'fallCatch')).toBe(false);
    expect(has(s.events, 'enemyWake')).toBe(true);
    expect(s.events.some((e) => e.type === 'hurt')).toBe(false);
  });

  it('no skip: the pit is sealed to the roof; no jump or glide from the pit floor gets west of the gate while the old burrback lives', () => {
    let least = Number.POSITIVE_INFINITY;
    let highest = Number.POSITIVE_INFINITY;
    for (const x0 of [3640, 3800, 4200, 5000, 5500]) {
      for (const k of [2, 6, 10, 14, 18, 24]) {
        for (const m of [L | J, R | J, J]) {
          const t = play('wood-well', ['glide', 'wallJump']);
          t.g.teleport(x0, 2112);
          for (let i = 0; i < k; i++) {
            t.run(m);
            highest = Math.min(highest, t.feet().y);
          }
          for (let i = 0; i < 120; i++) {
            t.run(L | J);
            least = Math.min(least, t.feet().x);
            highest = Math.min(highest, t.feet().y);
          }
        }
      }
    }
    expect(least).toBeGreaterThan(3584);
    expect(highest).toBeGreaterThan(1344);
  });

  it('the root gate holds the pit shut until the old burrback dies, then opens for good', () => {
    const s = pit();
    s.g.teleport(3700, 2112);
    s.run(L | J, 30);
    s.run(L, 60);
    expect(s.feet().x).toBeGreaterThan(3584);
    expect(s.g.state.save.abilities).not.toContain('wallJump');
    const e = old(s);
    if (!e) throw new Error('no old burrback');
    e.mode = 'dead';
    e.gone = true;
    const ev = s.run(0, 3);
    expect(ev.find((x) => x.type === 'flagSet')).toMatchObject({
      flag: 'wood-old-burrback-down',
      by: 'old-burr',
    });
    expect(ev.find((x) => x.type === 'gateOpen')).toMatchObject({ id: 'root-gate' });
    for (let i = 0; i < 200 && s.feet().x > 3300; i++) s.run(L);
    expect(s.feet().x).toBeLessThan(3300);
    expect(s.g.state.save.abilities).toContain('wallJump');
    expect(s.events.find((x) => x.type === 'gladeGrant')).toMatchObject({ ability: 'wallJump' });
  });

  it('W8 is out of reach in the fight, and a gimme from the root ledge behind the gate', () => {
    for (const x0 of [3620, 3660, 3700]) {
      for (const k of [6, 10, 14, 18]) {
        const s = play('wood-well', ['glide']);
        s.g.teleport(x0, 2112);
        s.run(L, 1);
        expect(has(s.run(L | J, k).concat(s.run(J | A, 1), s.run(J, 30)), 'lureSnuff')).toBe(false);
      }
    }
    let out = 0;
    for (const off of [60, 80, 100]) {
      for (let k = 2; k <= 18; k += 2) {
        const t = play('wood-well', ['glide']);
        t.g.state.save.flags.push('wood-old-burrback-down');
        t.run(0, 2);
        t.g.teleport(3392 - off, 1888);
        t.run(R, 1);
        if (has(t.run(J, k).concat(t.run(J | A, 1), t.run(J, 30)), 'lureSnuff')) out++;
      }
    }
    // Measured: 18 of 27.
    expect(out).toBeGreaterThanOrEqual(14);
  });

  it("a fade in the pit re-forms her at the chute's patch (the room's re-form point), not back at the hub", () => {
    const s = play('wood-hollow', ['glide']);
    s.g.teleport(1280, 3136);
    s.run(0, 40);
    expect(s.g.state.save.patch).toEqual({ room: 'wood-hollow', id: 'p3' });
    s.g.goto('wood-well', 4200, 2112);
    s.g.state.player.hp = 1;
    for (let i = 0; i < 1800 && !has(s.events, 'fade'); i++) s.run(i % 60 < 30 ? R : L);
    expect(has(s.events, 'fade')).toBe(true);
    for (let i = 0; i < 300 && !has(s.events, 'reform'); i++) s.run(0);
    s.run(0, 2);
    expect(s.g.state.room).toBe('wood-well');
    expect(s.feet()).toEqual({ x: 10944, y: 448 });
  });

  it('the dangler over the chute hangs from the room top over L2, lit by W-chute', () => {
    const room = getRoom('wood-well');
    const d = (room.enemies ?? []).find((e) => e.id === 'dang-chute');
    expect(d).toMatchObject({ kind: 'dangler', guards: 'wick-chute' });
    expect((d?.x ?? 0) > 8320 && (d?.x ?? 0) < 9088).toBe(true);
  });
});

describe('R14 wood-caps: the cap stair (and the hub climb to it)', () => {
  /**
   * The cap stair as a player climbs it: on the ground, walk to the next cap (`ground[k]`, k = bounces so far) and
   * hop onto it when it blocks her; thrown by a cap, hold jump and steer for the next step (`air[k]`).
   */
  function climbCaps(
    s: ReturnType<typeof play>,
    air: number[],
    ground: number[],
    done: () => boolean,
    max = 900,
  ) {
    let thrown = false;
    let seen = 0;
    for (let i = 0; i < max && !done(); i++) {
      const k = s.events.filter((e) => e.type === 'capBounce').length;
      if (k > seen) thrown = true;
      seen = k;
      const f = s.feet();
      const p = s.g.state.player;
      if (p.grounded && !thrown) {
        const cx = ground[Math.min(k, ground.length - 1)] as number;
        const dir = f.x < cx ? 1 : -1;
        s.run((dir > 0 ? R : L) | (p.wallDir === dir ? J : 0));
        continue;
      }
      if (p.grounded) thrown = false;
      const tx = (thrown ? air : ground)[Math.min(k, (thrown ? air : ground).length - 1)] as number;
      s.run(J | (Math.abs(f.x - tx) > 16 ? (f.x < tx ? R : L) : 0));
    }
  }

  it('the hub: from the root shelf a jump onto bracket cap B1, then B2, B3 and up through the root to R14', () => {
    const s = play('wood-hollow', ['glide']);
    s.g.teleport(300, 2880);
    s.run(0, 5);
    for (let i = 0; i < 60 && !has(s.events, 'capBounce'); i++) s.run(L | J);
    expect(s.events.find((e) => e.type === 'capBounce')).toMatchObject({ id: 'cap-b1' });
    climbCaps(s, [576, 576, 128, 160, 0], [576, 576, 128, 0, 0], () => s.g.state.room !== 'wood-hollow');
    expect(s.g.state.room).toBe('wood-caps');
    expect(s.events.filter((e) => e.type === 'capBounce').length).toBe(3);
    // The main path is not bounced: in from the glidewalk and on east along the floor.
    const r = play('wood-hollow', ['glide']);
    r.g.teleport(60, 2880);
    naive(r, () => r.g.state.room !== 'wood-hollow', 900);
    expect(r.g.state.room).toBe('wood-hawkers');
    expect(has(r.events, 'capBounce')).toBe(false);
  });

  it('up the stair: four caps (mid, mid, big, big) to the top, the moth-stone read; no lamp catches a bounce', () => {
    const s = play('wood-caps', ['glide']);
    s.g.teleport(2600, 2624);
    climbCaps(
      s,
      [2000, 1500, 960, 448],
      [2320, 1872, 1232, 720],
      () => s.events.filter((e) => e.type === 'capBounce').length >= 4,
    );
    // Off cap-4: let go of jump and steer for the stone.
    for (let i = 0; i < 300 && !has(s.events, 'stoneRead'); i++)
      s.run(s.feet().x > 460 ? L : s.feet().x < 436 ? R : 0);
    expect(s.events.find((e) => e.type === 'stoneRead')).toMatchObject({
      id: 'stone-wood',
      area: 'wood-floor',
    });
    expect(s.events.filter((e) => e.type === 'capBounce').length).toBe(4);
    expect(has(s.events, 'lureCaught')).toBe(false);
  });

  it('the secret: rotten bark in step 3 opens the moonlit hollow (quick wings)', () => {
    const s = play('wood-caps', ['glide']);
    s.g.teleport(1120, 1792);
    s.run(L, 10);
    for (let k = 0; k < 4; k++) s.run(A, 1).concat(s.run(0, 20));
    expect(has(s.events, 'barkBreak')).toBe(true);
    s.run(L, 60);
    expect(s.events.find((e) => e.type === 'hollowGrant')).toMatchObject({ upgrade: 'quickWings' });
    expect(s.g.state.save.flags).toContain('upgrade:quickWings');
  });

  it("the top: cut the hanging root (Tatter's ladder flag), drop down the chute onto the glidewalk's return bough", () => {
    const s = play('wood-caps', ['glide']);
    s.g.teleport(300, 640);
    s.run(L, 10);
    for (let k = 0; k < 4; k++) s.run(A, 1).concat(s.run(0, 20));
    for (let i = 0; i < 400 && s.g.state.room === 'wood-caps'; i++) s.run(L);
    for (let i = 0; i < 200 && !s.g.state.player.grounded; i++) s.run(0);
    expect(s.g.state.save.flags).toContain('wood-root-ladder');
    expect(s.g.state.room).toBe('wood-glidewalk');
    expect(s.feet().y).toBeLessThan(200);
  });

  it('the danglers: one alone over the floor by the door, one over the cap landing on step 2, each lit by its lamp', () => {
    const room = getRoom('wood-caps');
    const d = (room.enemies ?? []).filter((e) => e.kind === 'dangler').map((e) => e.guards);
    expect(d).toEqual(['wick-c1', 'wick-c2']);
  });
});

describe('the firefly signs', () => {
  it('under R6 gap 1 and in R8 dark half: read by standing still', () => {
    const a = play('wood-glidewalk', ['glide']);
    a.g.teleport(1100, 1408);
    expect(a.run(0, 60).find((e) => e.type === 'signRead')).toMatchObject({ id: 'sign-gap1' });
    const b = play('wood-hawkers', ['glide']);
    b.g.teleport(3250, 2624);
    expect(b.run(0, 60).find((e) => e.type === 'signRead')).toMatchObject({ id: 'sign-dark' });
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
