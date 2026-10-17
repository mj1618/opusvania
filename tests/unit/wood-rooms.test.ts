import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { getRoom, WORLD } from '../../src/scene/index';
import { GAME_WORLD } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { ActionBit } from '../../src/sim/input';
import { solidAt } from '../../src/sim/physics/aabb';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

/**
 * The wood's area 1 in greybox (docs/design/regions/wood-area1-director.md, the redesign; wood.md A7;
 * memory/rooms.md) and its claims, measured in the sim: R2 wood-chase, R3 wood-wicks, R4 wood-burrow, R5
 * wood-glade, R6 wood-glidewalk, R7 wood-hollow (the hub, the hollow oak), R8 wood-hawkers, R9 wood-silk, R10
 * wood-well. The oak's trunk and crown (R7, merged with the old R7b) are in wood-oak.test.ts.
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

describe('the wood: placement (area 1 redesigned, world px)', () => {
  it('each room sits where world.json puts it, the size it says; R14, R11 and the lantern room are gone', () => {
    expect(placed('wood-chase')).toEqual({ x: 5760, y: 2816, w: 6400, h: 1920 });
    expect(placed('wood-wicks')).toEqual({ x: 11264, y: 4736, w: 3840, h: 2176 });
    expect(placed('wood-glade')).toEqual({ x: 18944, y: 6400, w: 2880, h: 2504 });
    expect(placed('wood-burrow')).toEqual({ x: 15104, y: 4608, w: 4480, h: 1792 });
    expect(placed('wood-glidewalk')).toEqual({ x: 21824, y: 8064, w: 5760, h: 2368 });
    // The oak at the bowl's lowest point, one room from its floor (world y 10048: R6's T4, R8's floor) to the crown.
    expect(placed('wood-hollow')).toEqual({ x: 27584, y: 6208, w: 3840, h: 4208 });
    expect(placed('wood-hawkers')).toEqual({ x: 31424, y: 9024, w: 3840, h: 1392 });
    expect(placed('wood-silk')).toEqual({ x: 35264, y: 7424, w: 3840, h: 2992 });
    // The roots run under the hub, the clearing and the silk hall.
    expect(placed('wood-well')).toEqual({ x: 27584, y: 10416, w: 11264, h: 2240 });
    const ids = WORLD.rooms.map((r) => r.id);
    for (const gone of ['wood-caps', 'wood-climb', 'wood-lantern']) expect(ids).not.toContain(gone);
  });

  it('the exits link the rooms: the floor east, down through the silk hall, the roots west, up through the mesh', () => {
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
    expect(links['wood-hawkers#e']).toEqual({ to: 'wood-silk', exit: 'w' });
    expect(links['wood-silk#panel']).toEqual({ to: 'wood-well', exit: 'shaft' });
    expect(links['wood-well#shaft']).toBeNull();
    expect(links['wood-well#out']).toEqual({ to: 'wood-hollow', exit: 'climb' });
    expect(links['wood-hollow#climb']).toEqual({ to: 'wood-well', exit: 'out' });
  });

  it('every area-1 room places the oak for staging (freed moths fly to it)', () => {
    for (const id of [
      'wood-hatch',
      'wood-chase',
      'wood-wicks',
      'wood-burrow',
      'wood-glade',
      'wood-glidewalk',
      'wood-hollow',
      'wood-hawkers',
      'wood-silk',
      'wood-well',
    ]) {
      const at = WORLD.rooms.find((r) => r.id === id);
      const oak = getRoom(id).marks?.stage?.oak;
      expect(oak, id).toBeDefined();
      expect((at?.x ?? 0) + (oak?.x ?? 0), id).toBe(30336);
    }
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

  it('the vista is a held beat on the lookout (a trigger with hold <= 150)', () => {
    const t = (getRoom('wood-chase').triggers ?? []).find((q) => q.id === 'vista');
    expect(t).toMatchObject({ sets: 'wood-vista' });
    expect(t?.hold).toBeGreaterThan(0);
    expect(t?.hold).toBeLessThanOrEqual(150);
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

  it('holding nothing, the throw sends her back west onto L, at no cost', () => {
    const s = play('wood-wicks');
    s.g.teleport(600, 960);
    s.runTo(1100);
    s.run(R | J, 14);
    for (let i = 0; i < 60 && s.g.state.player.lure < 0; i++) s.run(R);
    expect(s.g.state.player.lure).toBeGreaterThanOrEqual(0);
    for (let k = 0; k < 8 && s.g.state.player.lure >= 0; k++) s.run(J, 1).concat(s.run(0, 9));
    for (let i = 0; i < 200 && !s.g.state.player.grounded; i++) s.run(0);
    expect(s.feet().y).toBe(960);
    expect(s.feet().x).toBeLessThan(1152);
  });

  it('the slow line: the dark dip is too deep to jump out of; its floor runs east under M to the column up onto N', () => {
    let top = Number.POSITIVE_INFINITY;
    for (const m of [L | J, R | J, J]) {
      const s = play('wood-wicks');
      s.g.teleport(1250, 1312);
      s.run(0, 3);
      for (let i = 0; i < 40; i++) {
        s.run(m);
        top = Math.min(top, s.feet().y);
      }
    }
    expect(top).toBeGreaterThan(960);
    const s = play('wood-wicks');
    s.g.teleport(1250, 1312);
    const f = naive(s, () => s.g.state.player.grounded && s.feet().y === 1152 && s.feet().x > 2048, 600);
    expect(f).toBeGreaterThan(0);
  });

  it('the knob stops her (and the drag), and a standing forward cut from there snuffs W2', () => {
    const s = play('wood-wicks');
    s.g.teleport(1600, 960);
    s.run(R, 90);
    const p = s.g.state.player;
    expect(p.x + p.w).toBe(1856);
    expect(p.grounded).toBe(true);
    s.run(0, 60);
    expect(s.g.state.player.x + s.g.state.player.w).toBe(1856);
    const ev = s.run(A, 1).concat(s.run(0, 30));
    expect(ev.find((e) => e.type === 'lureSnuff')).toMatchObject({ id: 'wick-first' });
  });

  it('W-hi3 by the hanging trunk is out of reach without wall jump (the lock)', () => {
    const s = play('wood-wicks');
    const i = (s.g.scene.lures ?? []).findIndex((l) => l.id === 'wick-high');
    for (const x0 of [1440, 1500, 1560]) {
      for (const m of [R | J, J, L | J]) {
        s.g.teleport(x0, 960);
        s.run(0, 3);
        s.run(m, 20);
        s.run(m | A, 1);
        s.run(m | ActionBit.up | A, 1);
        s.run(0, 60);
      }
    }
    expect(s.g.state.lures.hp[i]).toBe(1);
    expect(s.events.some((e) => e.type === 'lureCaught' && e.id === 'wick-high')).toBe(false);
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
    // (Through the broken bark floor: placed in the hole under it.)
    s.g.teleport(4224, 1300);
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
    // (Through the broken bark floor: placed in the hole under it.)
    s.g.teleport(4224, 1300);
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

  it('the alcove under the lip is never a trap: root rungs up a slot bring her back to the glade floor', () => {
    const s = play('wood-glade', ['glide']);
    s.g.teleport(1264, 2048);
    s.run(0, 5);
    for (let k = 0; k < 4 && s.feet().y > 1664; k++) {
      s.run(J, 20);
      for (let i = 0; i < 60 && !s.g.state.player.grounded; i++) s.run(0);
    }
    expect(s.feet().y).toBe(1664);
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

describe('R4 wood-burrow: the blade against things, light means seen, the floor gives way', () => {
  it("W3 hangs 200 over F2: the paper's jump-cut sweep puts it out in 3-5 of 9, never caught; its burrback curls up", () => {
    const { hits, caught } = jumpCuts('wood-burrow', 1984, 1344, []);
    expect(hits).toBeGreaterThanOrEqual(15);
    expect(hits).toBeLessThanOrEqual(25);
    expect(caught).toBe(0);
    const s = play('wood-burrow');
    let out: SimEvent[] = [];
    for (let k = 2; k <= 18 && !has(out, 'lureSnuff'); k += 2) {
      s.g.teleport(1884, 1344);
      s.run(R, 1);
      out = s.run(J, k).concat(s.run(J | A, 1), s.run(J, 30), s.run(0, 30));
    }
    expect(s.events.find((e) => e.type === 'enemyDisperse')).toMatchObject({ lure: 'wick-burr' });
  });

  it('the first creature: a juvenile beetle by the door (no brace) dies to a few cuts; the adult has windup 32', () => {
    const room = getRoom('wood-burrow');
    expect((room.enemies ?? []).find((e) => e.id === 'burr-juv')).toMatchObject({ kind: 'juvenileBurrback' });
    expect((room.enemies ?? []).find((e) => e.id === 'burr-first')).toMatchObject({ windup: 32 });
    const s = play('wood-burrow');
    const juv = () => s.g.state.enemies.find((e) => e.id === 'burr-juv');
    let swings = 0;
    for (let i = 0; i < 600 && juv() && juv()?.mode !== 'dead' && !juv()?.gone; i++) {
      const e = juv();
      if (!e) break;
      const ex = e.x + e.w / 2;
      const fx = s.feet().x;
      if (Math.abs(ex - fx) > 70) s.run(ex > fx ? R : L);
      else {
        s.run((ex > fx ? R : L) | A, 1);
        s.run(0, 18);
        swings++;
      }
    }
    expect(juv()?.mode === 'dead' || juv()?.gone).toBe(true);
    expect(swings).toBeLessThanOrEqual(4);
  });

  it("the gap (the throw's aim): caught by W-gap off the root step, thrown right onto F3; holding nothing, back west", () => {
    for (const lead of [0, 40, 80]) {
      const s = play('wood-burrow');
      s.g.teleport(2700 - lead, 1152);
      s.run(0, 3);
      for (let i = 0; i < 40 && s.feet().x < 2800; i++) s.run(R);
      s.run(R | J, 14);
      for (let i = 0; i < 200 && s.g.state.player.lure < 0 && !s.g.state.player.grounded; i++) s.run(R | J);
      expect(
        s.events.find((e) => e.type === 'lureCaught'),
        `lead ${lead}`,
      ).toMatchObject({ id: 'wick-gap' });
      beatFree(s, R);
      for (let i = 0; i < 200 && !s.g.state.player.grounded; i++) s.run(R);
      expect(s.feet().y, `lead ${lead}`).toBe(1152);
      expect(s.feet().x, `lead ${lead}`).toBeGreaterThan(3440);
    }
    const b = play('wood-burrow');
    b.g.teleport(2700, 1152);
    b.run(0, 3);
    for (let i = 0; i < 40 && b.feet().x < 2800; i++) b.run(R);
    b.run(R | J, 14);
    for (let i = 0; i < 200 && b.g.state.player.lure < 0 && !b.g.state.player.grounded; i++) b.run(R | J);
    beatFree(b, 0);
    for (let i = 0; i < 200 && !b.g.state.player.grounded; i++) b.run(0);
    expect(b.feet().x).toBeLessThan(2816);
  });

  it('the slow line: from the dark floor under the gap, a low tunnel east under F3 and a hatch up onto it', () => {
    const s = play('wood-burrow');
    s.g.teleport(3000, 1472);
    const f = naive(s, () => s.feet().y === 1152 && s.feet().x > 3456, 900);
    expect(f).toBeGreaterThan(0);
  });

  it('a miss climbs back: root steps from the dark floor to the root step', () => {
    const s = play('wood-burrow');
    s.g.teleport(3000, 1472);
    for (let k = 0; k < 2; k++) {
      s.run(L | J, 18);
      for (let i = 0; i < 90 && !s.g.state.player.grounded; i++) s.run(L);
      s.run(0, 2);
    }
    expect(s.feet().y).toBe(1152);
  });

  it('the way down: the bark floor over the hole, each down cut a bounce, breaks and drops her into the glade', () => {
    const s = play('wood-burrow');
    s.g.teleport(3776, 1152);
    expect(has(s.run(0, 40), 'patchRest')).toBe(true);
    s.g.teleport(4224, 1152);
    s.run(0, 3);
    let hits = 0;
    let bounced = 0;
    // A full jump, and a down cut falling ~80 over the floor: each hit bounces her (measured -15.5 px/f).
    s.run(J, 14);
    for (let k = 0; k < 8 && !has(s.events, 'barkBreak'); k++) {
      for (let i = 0; i < 60 && !(s.g.state.player.vy > 0 && s.feet().y > 1152 - 80); i++) s.run(0);
      const ev = s.run(D | A, 1).concat(s.run(0, 2));
      if (has(ev, 'barkHit')) hits++;
      if (s.g.state.player.vy < 0) bounced++;
    }
    expect(has(s.events, 'barkBreak')).toBe(true);
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(bounced).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 300 && s.g.state.room === 'wood-burrow'; i++) s.run(0);
    expect(s.g.state.room).toBe('wood-glade');
  });

  it('a fade before P1 stands her up at the burrow door, not beside the burrback', () => {
    const s = play('wood-burrow');
    s.g.state.player.hp = 1;
    s.g.teleport(1700, 1344);
    for (let i = 0; i < 900 && !has(s.events, 'reform'); i++) s.run(R);
    expect(has(s.events, 'fade')).toBe(true);
    expect(Math.abs(s.feet().x - 300)).toBeLessThanOrEqual(16);
    expect(s.feet().y).toBe(1280);
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

  it('W-hi4 hangs by shelf H, far over F3 and the roof: a lock that reads as one', () => {
    const s = play('wood-burrow');
    const i = (s.g.scene.lures ?? []).findIndex((l) => l.id === 'wick-high');
    for (const x0 of [3500, 3700, 3880]) {
      s.g.teleport(x0, 1152);
      s.run(0, 3);
      s.run(R | J, 20);
      s.run(ActionBit.up | A, 1);
      s.run(0, 60);
    }
    expect(s.g.state.lures.hp[i]).toBe(1);
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

  it('gap 3 (1024, drop 512): W-bend bends a glide or catches it; either way she reaches T4, never the thorns', () => {
    for (const lead of [0, 48, 120]) {
      const j = play('wood-glidewalk', ['glide']);
      j.g.teleport(3300, 1472);
      let ev = jumpGlide(j, 3648, lead, 1);
      for (let i = 0; i < 400 && !(j.g.state.player.grounded && j.feet().x > 4672); i++) {
        if (j.g.state.player.lure >= 0) beatFree(j, R);
        ev = ev.concat(j.run(R | J));
      }
      expect(has(ev, 'thornHit'), `lead ${lead}`).toBe(false);
      expect(j.feet().x, `lead ${lead}`).toBeGreaterThan(4672);
    }
    const w = walkOff(3648, 1472);
    let after: SimEvent[] = [];
    for (let i = 0; i < 400 && !(w.s.g.state.player.grounded && w.s.feet().x > 4672); i++) {
      if (w.s.g.state.player.lure >= 0) beatFree(w.s, R);
      after = after.concat(w.s.run(R | J));
    }
    expect(has(w.ev.concat(after), 'thornHit')).toBe(false);
    expect(w.s.feet().x).toBeGreaterThan(4672);
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

  it('no bark wall on the path any more; the floor panel past T4 opens to W-pocket and she climbs back out', () => {
    expect((getRoom('wood-glidewalk').bark ?? []).map((b) => b.id)).toEqual(['bark-floor']);
    const s = play('wood-glidewalk', ['glide']);
    s.g.teleport(5504, 1984);
    let broke = false;
    for (let k = 0; k < 6 && !broke; k++) {
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

describe('R7 wood-hollow: the oak, its hollow floor (the trunk and crown: wood-oak.test.ts)', () => {
  it('in from the glidewalk at floor level: P3 rests her, the glimpse is a held beat', () => {
    const s = play('wood-glidewalk', ['glide']);
    s.g.teleport(5600, 1984);
    for (let i = 0; i < 200 && s.g.state.room !== 'wood-hollow'; i++) s.run(R);
    expect(s.g.state.room).toBe('wood-hollow');
    for (let i = 0; i < 60 && !s.g.state.player.grounded; i++) s.run(R);
    expect(s.feet().y).toBe(3840);
    s.runTo(1280);
    s.run(0, 60);
    expect(s.feet().y).toBe(3840);
    expect(s.events.some((e) => e.type === 'patchRest')).toBe(true);
    expect(s.events.find((e) => e.type === 'flagSet')).toMatchObject({ flag: 'wood-firefly-glimpse' });
    const glimpse = (getRoom('wood-hollow').triggers ?? []).find((t) => t.id === 'glimpse');
    expect(glimpse?.hold).toBeGreaterThan(0);
    expect(glimpse?.hold).toBeLessThanOrEqual(180);
  });

  it('one way on: east along the flat floor to the clearing at floor level, and back west to the glidewalk', () => {
    const s = play('wood-hollow', ['glide']);
    s.g.teleport(1280, 3840);
    naive(s, () => s.g.state.room !== 'wood-hollow', 900);
    expect(s.g.state.room).toBe('wood-hawkers');
    expect(s.feet().y).toBe(1024);
    const w = play('wood-hollow', ['glide']);
    w.g.teleport(1280, 3840);
    glideOn(w, () => w.g.state.room !== 'wood-hollow', 900, -1);
    expect(w.g.state.room).toBe('wood-glidewalk');
  });

  it('the trunk: its walls slide without claws; with them she climbs the column to the rest ledge', () => {
    const no = play('wood-hollow', ['glide']);
    no.g.teleport(2700, 3840);
    climb(no, -1, () => false, 600, 14);
    expect(no.feet().y).toBeGreaterThan(3840 - 400);
    const s = play('wood-hollow', ['glide', 'wallJump']);
    s.g.teleport(2700, 3840);
    climb(s, -1, () => s.g.state.player.grounded && s.feet().y <= 2240, 1500, 14);
    expect(s.feet().y).toBe(2240);
  });

  it('the root mesh: no drop-through until she has climbed out of the roots, then a shortcut down to P4', () => {
    for (let x = 2580; x <= 2924; x += 48) {
      const d = play('wood-hollow', ['glide']);
      d.g.teleport(x, 3840);
      d.run(0, 5);
      const ev = d.run(D, 3).concat(d.run(D | J, 10), d.run(D, 40), d.run(0, 20));
      expect(has(ev, 'dropThrough'), `x ${x}`).toBe(false);
      expect(d.g.state.room, `x ${x}`).toBe('wood-hollow');
    }
    const s = play('wood-hollow', ['glide']);
    s.g.state.save.flags.push('wood-climbout');
    s.run(0, 3);
    s.g.teleport(2750, 3840);
    s.run(0, 5);
    s.run(D, 2);
    s.run(D | J, 6);
    for (let i = 0; i < 300 && !(s.g.state.room === 'wood-well' && s.g.state.player.grounded); i++) s.run(0);
    expect(s.g.state.room).toBe('wood-well');
    expect(s.feet().y).toBe(2112);
  });

  it('the climb-out comes up through the mesh and lands on it, setting the flag', () => {
    const s = play('wood-well', ['glide', 'wallJump']);
    s.g.teleport(2750, 2112);
    climb(s, 1, () => s.g.state.room === 'wood-hollow' && s.feet().y < 3820, 1800, 10);
    expect(s.g.state.room).toBe('wood-hollow');
    for (let i = 0; i < 120 && !s.g.state.player.grounded; i++) s.run(0);
    expect(s.feet().y).toBe(3840);
    expect(s.g.state.save.flags).toContain('wood-climbout');
  });

  it('the moth-stone and the first firefly sign are read on the hub floor; no camera zone over the hollow floor', () => {
    const a = play('wood-hollow', ['glide']);
    a.g.teleport(1800, 3840);
    expect(a.run(0, 20).find((e) => e.type === 'stoneRead')).toMatchObject({
      id: 'stone-oak',
      area: 'wood-floor',
    });
    const b = play('wood-hollow', ['glide']);
    b.g.teleport(2300, 3840);
    expect(b.run(0, 60).find((e) => e.type === 'signRead')).toMatchObject({ id: 'sign-trunk' });
    const zones = getRoom('wood-hollow').camera?.zones ?? [];
    for (const z of zones) {
      expect(z.fit ?? false, z.id).toBe(false);
      expect(z.y + z.h, z.id).toBeLessThanOrEqual(3840 - 320);
    }
  });
});

describe("R8 wood-hawkers: the hawkers' clearing", () => {
  it("W7 hangs 312 over hummock B: the paper's jump-cut sweep puts it out, and the hawker leaves", () => {
    const { hits, caught } = jumpCuts('wood-hawkers', 1920, 832);
    expect(hits).toBeGreaterThanOrEqual(22);
    expect(caught).toBe(0);
    const s = play('wood-hawkers', ['glide']);
    for (let k = 2; k <= 18 && !has(s.events, 'lureSnuff'); k += 2) {
      s.g.teleport(1920 - 100, 832);
      s.run(R, 1);
      s.run(J, k);
      s.run(J | A, 1);
      s.run(J, 30);
      s.run(0, 30);
    }
    expect(s.events.find((e) => e.type === 'enemyDisperse')).toMatchObject({ lure: 'wick-hawk' });
  });

  it('the decoy wick over hummock A is gone: one lamp, its hawker', () => {
    expect((getRoom('wood-hawkers').lures ?? []).map((l) => l.id)).toEqual(['wick-hawk', 'wick-throw']);
  });

  it('the throw gap: no jump or glide reaches the far ledge; caught by W-throw and thrown up-right, she clears the pit', () => {
    const g = play('wood-hawkers', ['glide']);
    const wi = (g.g.scene.lures ?? []).findIndex((l) => l.id === 'wick-throw');
    g.g.state.lures.hp[wi] = 0;
    g.g.state.lures.out[wi] = 1;
    g.g.teleport(2400, 1024);
    g.run(0, 3);
    g.runTo(2540);
    g.run(R | J, 200);
    expect(g.feet().y === 704 && g.feet().x > 3008).toBe(false);
    for (const lead of [0, 40, 80]) {
      const s = play('wood-hawkers', ['glide']);
      for (const e of s.g.state.enemies) {
        e.mode = 'dead';
        e.gone = true;
      }
      s.g.teleport(2500 - lead, 1024);
      s.run(0, 3);
      for (let i = 0; i < 40 && s.feet().x < 2540; i++) s.run(R);
      s.run(R | J, 14);
      for (let i = 0; i < 200 && s.g.state.player.lure < 0 && !s.g.state.player.grounded; i++) s.run(R | J);
      expect(
        s.events.find((e) => e.type === 'lureCaught'),
        `lead ${lead}`,
      ).toMatchObject({ id: 'wick-throw' });
      beatFree(s, ActionBit.up | R);
      for (let i = 0; i < 200 && !s.g.state.player.grounded; i++) s.run(ActionBit.up | R);
      expect(has(s.events, 'thornHit'), `lead ${lead}`).toBe(false);
      expect(s.feet().x, `lead ${lead}`).toBeGreaterThan(3008);
    }
  });

  it('a miss costs a hop: the pit under the throw has no thorns, and she jumps back onto the near ledge', () => {
    expect(getRoom('wood-hawkers').thorns ?? []).toEqual([]);
    const s = play('wood-hawkers', ['glide']);
    s.g.teleport(2780, 1248);
    s.run(0, 5);
    expect(s.feet().y).toBe(1248);
    s.run(L | J, 20);
    s.run(L, 40);
    expect(s.feet().y).toBe(1024);
    expect(s.feet().x).toBeLessThan(2560);
  });

  it('the slow line: down through the root hatch, the dark tunnel under the gap, up the hatch past the far ledge', () => {
    const s = play('wood-hawkers', ['glide']);
    s.g.teleport(2352, 1024);
    s.run(0, 3);
    s.run(D, 2);
    s.run(D | J, 6);
    s.run(0, 60);
    // (Onto the root step in the shaft, then down into the tunnel.)
    expect(s.feet().y).toBeGreaterThan(1024);
    s.run(D, 2);
    s.run(D | J, 6);
    for (let i = 0; i < 60 && !(s.g.state.player.grounded && s.feet().y === 1360); i++) s.run(0);
    expect(s.feet().y).toBe(1360);
    const f = naive(s, () => s.feet().y === 1024 && s.feet().x > 3456, 900);
    expect(f).toBeGreaterThan(0);
  });

  it('the find: the bark in the far ledge hides the moonlit hollow (quick wings); P-dark rests her', () => {
    const s = play('wood-hawkers', ['glide']);
    s.g.teleport(3520, 1024);
    expect(has(s.run(0, 40), 'patchRest')).toBe(true);
    s.run(L, 10);
    for (let k = 0; k < 4; k++) s.run(L | A, 1).concat(s.run(0, 20));
    expect(has(s.events, 'barkBreak')).toBe(true);
    s.run(L, 60);
    expect(s.events.find((e) => e.type === 'hollowGrant')).toMatchObject({ upgrade: 'quickWings' });
  });

  it('back west from the dark half over the far ledge and a glide down to the near side, to the hub', () => {
    const s = play('wood-hawkers', ['glide']);
    for (const e of s.g.state.enemies) {
      e.mode = 'dead';
      e.gone = true;
    }
    s.g.teleport(3760, 1024);
    glideOn(s, () => s.g.state.room !== 'wood-hawkers', 3000, -1);
    expect(s.g.state.room).toBe('wood-hollow');
  });
});

describe('R9 wood-silk: the silk hall', () => {
  /** The room with its creatures gone (for the geometry). */
  function bare() {
    const s = play('wood-silk', ['glide']);
    for (const e of s.g.state.enemies) {
      e.mode = 'dead';
      e.gone = true;
    }
    return s;
  }

  it('in from the clearing at floor level; the spawn is clear', () => {
    const room = getRoom('wood-silk');
    expect(solidAt(room, room.spawn.x - 20, room.spawn.y - 80, 40, 80)).toBe(false);
    const s = play('wood-hawkers', ['glide']);
    s.g.teleport(3760, 1024);
    for (let i = 0; i < 200 && s.g.state.room !== 'wood-silk'; i++) s.run(R);
    expect(s.g.state.room).toBe('wood-silk');
    expect(s.feet().y).toBe(2624);
  });

  it('the dangler alone: the knob stops her under W-s1, a standing cut snuffs it; standing there lit, the dangler drops', () => {
    const s = bare();
    s.g.teleport(500, 2624);
    s.run(R, 90);
    expect(s.g.state.player.x + s.g.state.player.w).toBe(760);
    const ev = s.run(A, 1).concat(s.run(0, 30));
    expect(ev.find((e) => e.type === 'lureSnuff')).toMatchObject({ id: 'wick-s1' });
    const d = play('wood-silk', ['glide']);
    d.g.teleport(500, 2624);
    d.run(R, 40);
    d.run(0, 60);
    expect(d.events.some((e) => e.type === 'enemyWindup')).toBe(true);
  });

  it('the throw line: caught by W-s2 off the floor and thrown up-right onto the root shelf (beside dang-s2)', () => {
    for (const lead of [0, 40, 80]) {
      const s = bare();
      s.g.teleport(1250 - lead, 2624);
      s.run(0, 3);
      for (let i = 0; i < 40 && s.feet().x < 1290; i++) s.run(R);
      s.run(R | J, 14);
      for (let i = 0; i < 200 && s.g.state.player.lure < 0 && !s.g.state.player.grounded; i++) s.run(R | J);
      expect(
        s.events.find((e) => e.type === 'lureCaught'),
        `lead ${lead}`,
      ).toMatchObject({ id: 'wick-s2' });
      beatFree(s, ActionBit.up | R);
      for (let i = 0; i < 200 && !s.g.state.player.grounded; i++) s.run(ActionBit.up | R);
      expect(s.feet().y, `lead ${lead}`).toBe(2304);
    }
  });

  it('the composition: a beetle in the pool, a dangler over the cut spot, one wick: one snuff sends both off', () => {
    const room = getRoom('wood-silk');
    const guards = (room.enemies ?? []).filter((e) => e.guards === 'wick-s3').map((e) => e.kind);
    expect(guards.sort()).toEqual(['burrback', 'dangler']);
    const s = play('wood-silk', ['glide']);
    s.g.teleport(2740, 2624);
    const ev = s.run(R, 1).concat(s.run(A, 1), s.run(0, 30));
    expect(ev.find((e) => e.type === 'lureSnuff')).toMatchObject({ id: 'wick-s3' });
    expect(ev.filter((e) => e.type === 'enemyDisperse').length).toBe(2);
  });

  it('the dead end: the bark floor breaks to down cuts and drops her into the root stair; the second sign is in the dark half', () => {
    const s = play('wood-silk', ['glide']);
    s.g.teleport(3300, 2624);
    expect(downCut(s, 2624)).toBe(true);
    for (let i = 0; i < 200 && s.g.state.room === 'wood-silk'; i++) s.run(0);
    for (let i = 0; i < 200 && !s.g.state.player.grounded; i++) s.run(0);
    expect(s.g.state.room).toBe('wood-well');
    expect(s.feet().y).toBe(448);
    const g = play('wood-silk', ['glide']);
    g.g.teleport(3650, 2624);
    expect(g.run(0, 60).find((e) => e.type === 'signRead')).toMatchObject({ id: 'sign-silk' });
  });

  it('postgame: W-dj on the hanging ledge is out of reach from the floor and the shelf', () => {
    const s = bare();
    const i = (s.g.scene.lures ?? []).findIndex((l) => l.id === 'wick-dj');
    for (const x0 of [380, 485, 600]) {
      s.g.teleport(x0, 2624);
      s.run(0, 3);
      s.run(J, 20);
      s.run(ActionBit.up | A, 1);
      s.run(0, 60);
    }
    expect(s.g.state.lures.hp[i]).toBe(1);
  });
});

describe('R10 wood-well: the root stair, the old burrback, glade 2, the climb-out', () => {
  /** Down the root stair: walk west, a jump-glide at each edge, a down cut on the pogo-wick; caught, beat free west. */
  function stair(s: ReturnType<typeof play>, done: () => boolean, max = 3000): void {
    let jumpUntil = -1;
    for (let f = 0; f < max && !done(); f++) {
      const p = s.g.state.player;
      if (p.lure >= 0) {
        s.run(L | (f % 10 === 0 ? J : 0));
        continue;
      }
      const ft = s.feet();
      const ahead = solidAt(s.g.scene, ft.x - 12, ft.y, 1, 1);
      if (f > jumpUntil + 1 && p.grounded && (p.wallDir === -1 || !ahead)) jumpUntil = f + 14;
      const pogo = !p.grounded && ft.x > 9560 && ft.x < 9720 && ft.y > 620 && ft.y < 700;
      s.run(pogo ? D | A : L | (f < jumpUntil || !p.grounded ? J : 0));
    }
  }
  /** Down the stair and into the pit. */
  function pit() {
    const s = play('wood-well', ['glide']);
    s.g.teleport(10944, 448);
    stair(s, () => s.feet().x < 5632 && s.g.state.player.grounded);
    return s;
  }
  const old = (s: ReturnType<typeof play>) => s.g.state.enemies.find((e) => e.id === 'old-burr');

  it('down the root stair and the roof hole into the pit: the window beat on the way, the old burrback wakes and never strikes on her landing', () => {
    const s = pit();
    expect(s.feet().y).toBe(2112);
    expect(s.feet().x).toBeGreaterThan(3584);
    expect(s.g.state.save.flags).toContain('wood-window');
    expect(has(s.events, 'enemyWake')).toBe(true);
    expect(s.events.some((e) => e.type === 'hurt')).toBe(false);
  });

  it('the pogo-wick: walk off L1 under its root ceiling, down-cut the wick at once: it snuffs, bounces her, and she glides on to L2', () => {
    for (const d of [2, 4, 6]) {
      const p = play('wood-well', ['glide']);
      p.g.teleport(9800, 640);
      p.run(0, 3);
      for (let i = 0; i < 60 && p.g.state.player.grounded; i++) p.run(L);
      p.run(L, d);
      p.run(D | A, 1);
      for (let i = 0; i < 200 && !p.g.state.player.grounded && p.g.state.player.lure < 0; i++) p.run(L | J);
      expect(
        p.events.find((e) => e.type === 'lureSnuff'),
        `d ${d}`,
      ).toMatchObject({ id: 'wick-pogo' });
      expect(
        p.events.some((e) => e.type === 'slashHit' && e.pogo),
        `d ${d}`,
      ).toBe(true);
      expect(p.feet().y, `d ${d}`).toBe(896);
    }
    // No jump from under the ceiling.
    const j = play('wood-well', ['glide']);
    j.g.teleport(9800, 640);
    let top = 640;
    for (let i = 0; i < 30; i++) {
      j.run(J);
      top = Math.min(top, j.feet().y);
    }
    expect(640 - top).toBeLessThanOrEqual(40);
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

  it('the root gate holds the pit shut until the old burrback dies, then opens for good onto glade 2', () => {
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
    for (let i = 0; i < 200 && s.feet().x > 3200; i++) s.run(L);
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
    expect(out).toBeGreaterThanOrEqual(14);
  });

  it('a fade in the pit re-forms her at P-chute by the pit door (the room re-form point), not back at the hub', () => {
    const s = play('wood-hollow', ['glide']);
    s.g.teleport(1280, 3840);
    s.run(0, 40);
    expect(s.g.state.save.patch).toEqual({ room: 'wood-hollow', id: 'p3' });
    s.g.goto('wood-well', 4200, 2112);
    s.g.state.player.faded = 2;
    s.run(0, 3);
    expect(s.g.state.room).toBe('wood-well');
    expect(s.feet()).toEqual({ x: 6300, y: 1216 });
  });

  it('two lit pockets in the dark stair, each a wick with a dangler over its landing', () => {
    const room = getRoom('wood-well');
    const d = (room.enemies ?? []).filter((e) => e.kind === 'dangler').map((e) => e.guards);
    expect(d.sort()).toEqual(['wick-chute', 'wick-pocket']);
  });
});

describe('the firefly signs', () => {
  it("at the trunk's foot in the hub and in the silk hall's dark half: read by standing still", () => {
    const a = play('wood-hollow', ['glide']);
    a.g.teleport(2300, 3840);
    expect(a.run(0, 60).find((e) => e.type === 'signRead')).toMatchObject({ id: 'sign-trunk' });
    const b = play('wood-silk', ['glide']);
    b.g.teleport(3650, 2624);
    expect(b.run(0, 60).find((e) => e.type === 'signRead')).toMatchObject({ id: 'sign-silk' });
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
