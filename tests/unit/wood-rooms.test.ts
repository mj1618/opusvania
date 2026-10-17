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
    expect(placed('wood-glidewalk')).toEqual({ x: 21824, y: 8064, w: 7808, h: 2368 });
    // The oak at the bowl's lowest point, one room from its floor (world y 10048: R6's T4, R8's floor) to the crown.
    expect(placed('wood-hollow')).toEqual({ x: 29632, y: 6208, w: 3840, h: 4208 });
    expect(placed('wood-hawkers')).toEqual({ x: 33472, y: 9024, w: 3840, h: 1392 });
    expect(placed('wood-silk')).toEqual({ x: 37312, y: 7424, w: 3840, h: 2992 });
    // The roots run under the hub, the clearing and the silk hall.
    expect(placed('wood-well')).toEqual({ x: 29632, y: 10416, w: 11264, h: 2240 });
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
      expect((at?.x ?? 0) + (oak?.x ?? 0), id).toBe(32384);
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

describe('R3 wood-wicks: the first lights, one idea per screen', () => {
  it('falling in held right, she lands on L 500+ px outside W1 and is never caught on the drop', () => {
    const s = play('wood-chase');
    s.g.teleport(5600, 896);
    let ev: SimEvent[] = [];
    for (let i = 0; i < 400 && !(s.g.state.room === 'wood-wicks' && s.g.state.player.grounded); i++)
      ev = ev.concat(s.run(R));
    expect(s.g.state.room).toBe('wood-wicks');
    expect(s.feet().y).toBe(960);
    expect(1680 - 240 - s.feet().x).toBeGreaterThanOrEqual(500);
    expect(ev.some((e) => e.type === 'lureCaught')).toBe(false);
    // One framing holds the lesson: L, the dip, W1, M and W2.
    expect((getRoom('wood-wicks').camera?.zones ?? []).map((z) => z.id)).toContain('lesson');
  });

  it("every run-up jump from L's lip toward the stragglers is caught by W1", () => {
    for (let lead = 0; lead <= 120; lead += 12) {
      const s = play('wood-wicks');
      s.g.teleport(1000, 960);
      s.runTo(1552 - 20 - lead);
      const ev = s.run(R | J, 14).concat(s.run(R, 60));
      expect(
        ev.find((e) => e.type === 'lureCaught'),
        `jump ${lead} px before the lip`,
      ).toMatchObject({
        id: 'wick-caught',
      });
    }
  });

  it('beaten free holding right she is thrown onto M; holding nothing, back onto L', () => {
    const s = play('wood-wicks');
    s.g.teleport(1000, 960);
    s.runTo(1500);
    s.run(R | J, 14);
    for (let i = 0; i < 60 && s.g.state.player.lure < 0; i++) s.run(R);
    expect(s.g.state.player.lure).toBeGreaterThanOrEqual(0);
    beatFree(s, R);
    for (let i = 0; i < 200 && !s.g.state.player.grounded; i++) s.run(R);
    expect(s.feet().y).toBe(960);
    expect(s.feet().x).toBeGreaterThan(1808);
    const b = play('wood-wicks');
    b.g.teleport(1000, 960);
    b.runTo(1500);
    b.run(R | J, 14);
    for (let i = 0; i < 60 && b.g.state.player.lure < 0; i++) b.run(R);
    beatFree(b, 0);
    for (let i = 0; i < 200 && !b.g.state.player.grounded; i++) b.run(0);
    expect(b.feet().y).toBe(960);
    expect(b.feet().x).toBeLessThan(1552);
  });

  it('no fork: a miss into the dip (too deep to cross) climbs back to L by a root rung in under 5 s', () => {
    let top = Number.POSITIVE_INFINITY;
    for (const m of [R | J, J]) {
      const s = play('wood-wicks');
      s.g.teleport(1760, 1312);
      s.run(0, 3);
      for (let i = 0; i < 40; i++) {
        s.run(m);
        top = Math.min(top, s.feet().y);
      }
    }
    expect(top).toBeGreaterThan(960);
    // Up onto the root rung (a hop), then a hop west onto L.
    const s = play('wood-wicks');
    s.g.teleport(1600, 1312);
    s.run(0, 3);
    s.run(J, 18);
    for (let i = 0; i < 60 && !s.g.state.player.grounded; i++) s.run(0);
    expect(s.feet().y).toBe(1152);
    s.run(L | J, 18);
    for (let i = 0; i < 60 && !s.g.state.player.grounded; i++) s.run(L);
    expect(s.feet().y).toBe(960);
    expect(s.g.state.frame).toBeLessThan(300);
  });

  it('the knob stops her within reach of W2 (and the drag), a standing cut snuffs it; then M steps down onto N, no hole', () => {
    const s = play('wood-wicks');
    s.g.teleport(1900, 960);
    s.run(R, 90);
    const p = s.g.state.player;
    expect(p.x + p.w).toBe(2256);
    expect(p.grounded).toBe(true);
    s.run(0, 60);
    expect(s.g.state.player.x + s.g.state.player.w).toBe(2256);
    const ev = s.run(A, 1).concat(s.run(0, 30));
    expect(ev.find((e) => e.type === 'lureSnuff')).toMatchObject({ id: 'wick-first' });
    let low = 0;
    s.run(R | J, 14);
    for (let i = 0; i < 120; i++) {
      s.run(R);
      low = Math.max(low, s.feet().y);
    }
    expect(low).toBeLessThanOrEqual(1152);
    expect(s.feet().y).toBe(1152);
  });

  it('W-hi3 by the hanging trunk is out of reach without wall jump (the lock)', () => {
    const s = play('wood-wicks');
    const i = (s.g.scene.lures ?? []).findIndex((l) => l.id === 'wick-high');
    for (const x0 of [1840, 1900, 1960]) {
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

  it("a catch in the chasm from the alcove's ledge puts her on the lip's top, set back from the edge (video r2: a loop)", () => {
    const s = play('wood-glade', ['glide']);
    s.g.teleport(1264, 2048);
    s.run(0, 5);
    for (let i = 0; i < 400 && !has(s.events, 'fallCatch'); i++) s.run(R | (i % 30 < 15 ? J : 0));
    s.run(0, 60);
    expect(has(s.events, 'fallCatch')).toBe(true);
    expect(s.feet()).toEqual({ x: 1100, y: 1664 });
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
  it('W3 hangs over the root step: a standing up-cut from the step snuffs it, its pull never reaches the patrol, and the adult curls up', () => {
    const room = getRoom('wood-burrow');
    const w3 = (room.lures ?? []).find((l) => l.id === 'wick-burr');
    const adult = (room.enemies ?? []).find((e) => e.id === 'burr-first');
    if (!w3 || !adult) throw new Error('no W3 or adult');
    const pull = defaultTuning.lures.kinds.wick.radius;
    // The patrol (feet on F2, 1344) stays out of W3's field.
    expect(1344 - 40 - w3.y).toBeGreaterThan(pull);
    const s = play('wood-burrow');
    s.g.teleport(2520, 1152);
    s.run(0, 10);
    expect(s.g.state.player.lure).toBe(-1);
    const ev = s.run(ActionBit.up | A, 1).concat(s.run(0, 30));
    expect(ev.find((e) => e.type === 'lureSnuff')).toMatchObject({ id: 'wick-burr' });
    expect(s.events.find((e) => e.type === 'enemyDisperse')).toMatchObject({ lure: 'wick-burr' });
  });

  it('no lamp in R3-R5 pulls over a creature patrol; the juvenile has no lamp', () => {
    const pull = defaultTuning.lures.kinds.wick.radius;
    for (const id of ['wood-wicks', 'wood-burrow', 'wood-glade']) {
      const room = getRoom(id);
      for (const e of room.enemies ?? []) {
        const r = 'radius' in e && typeof e.radius === 'number' ? e.radius : 0;
        for (const l of room.lures ?? []) {
          const dx = Math.max(0, Math.abs(l.x - e.x) - r);
          const dy = Math.abs(l.y - (e.y - 30));
          expect(Math.hypot(dx, dy), `${id}: ${l.id} over ${e.id}`).toBeGreaterThan(pull);
        }
      }
    }
    expect((getRoom('wood-burrow').enemies ?? []).find((e) => e.id === 'burr-juv')?.guards).toBeUndefined();
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

  it("the gap (the throw's aim): caught by W-gap off the root step; up-right reaches the high ledge, right alone meets its face; holding nothing, back west", () => {
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
      beatFree(s, ActionBit.up | R);
      for (let i = 0; i < 200 && !s.g.state.player.grounded; i++) s.run(ActionBit.up | R);
      expect([900, 1152], `lead ${lead}`).toContain(s.feet().y);
      expect(s.feet().x, `lead ${lead}`).toBeGreaterThan(3456);
      // Held right alone: the throw meets the high ledge's face and drops her to the slow line.
      const r = play('wood-burrow');
      r.g.teleport(2700 - lead, 1152);
      r.run(0, 3);
      for (let i = 0; i < 40 && r.feet().x < 2800; i++) r.run(R);
      r.run(R | J, 14);
      for (let i = 0; i < 200 && r.g.state.player.lure < 0 && !r.g.state.player.grounded; i++) r.run(R | J);
      beatFree(r, R);
      for (let i = 0; i < 200 && !r.g.state.player.grounded; i++) r.run(R);
      expect(r.feet().y, `right, lead ${lead}`).toBe(1472);
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
    // In W3's pool, by the adult's patrol: lit, it rams her.
    s.g.teleport(2400, 1344);
    for (let i = 0; i < 900 && !has(s.events, 'reform'); i++) s.run(0);
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

  it('the lamp chain to the oak door: caught by C1 off T4, thrown right with wings, caught by C2, thrown up-right onto T5', () => {
    let made = 0;
    for (const lead of [0, 30, 60, 90, 120]) {
      const s = play('wood-glidewalk', ['glide']);
      for (const e of s.g.state.enemies) {
        e.mode = 'dead';
        e.gone = true;
      }
      const w6 = (s.g.scene.lures ?? []).findIndex((l) => l.id === 'wick-ledge');
      s.g.state.lures.hp[w6] = 0;
      s.g.state.lures.out[w6] = 1;
      s.g.teleport(5100, 1984);
      s.run(0, 3);
      for (let i = 0; i < 60 && s.feet().x < 5504 - lead; i++) s.run(R);
      const caught: string[] = [];
      for (let f = 0; f < 600; f++) {
        const p = s.g.state.player;
        if (p.lure >= 0) {
          const id = s.g.scene.lures?.[p.lure]?.id ?? '?';
          if (caught[caught.length - 1] !== id) caught.push(id);
          s.run((id === 'wick-chain2' ? ActionBit.up | R : R) | (f % 10 === 0 ? J : 0));
          continue;
        }
        s.run(R | J);
        if (p.grounded && f > 10) break;
      }
      if (
        caught.join('>') === 'wick-chain1>wick-chain2' &&
        (s.feet().x > 7232 || s.g.state.room === 'wood-hollow')
      )
        made++;
    }
    // Measured: 5 of 5 leads (and 5 of 6 out to 150 px back).
    expect(made).toBeGreaterThanOrEqual(4);
    // A miss lands on the chasm's dark floor (Tatter's way): east, a root step, T5.
    const f = play('wood-glidewalk', ['glide']);
    f.g.teleport(5470, 1920);
    for (let i = 0; i < 120 && !(f.g.state.player.grounded && f.feet().y === 2240); i++) f.run(R);
    expect(f.feet().y).toBe(2240);
    expect(naive(f, () => f.feet().y === 1984 && f.feet().x > 7232, 900)).toBeGreaterThan(0);
  });

  it("T4 forgives: the beetle's patrol starts 300+ past gap 3's lip; a root lip at its far edge (no walk-off into the chasm)", () => {
    const b = (getRoom('wood-glidewalk').enemies ?? []).find((e) => e.id === 'burr-ledge');
    expect((b?.x ?? 0) - ((b && 'radius' in b && b.radius) || 0) - 4672).toBeGreaterThanOrEqual(300);
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
      // (The strong throw plus wings may carry her on over T4 into the chain's chasm: a free catch.)
      const first = ev.find(
        (e) => e.type === 'land' || e.type === 'lureCaught' || e.type === 'fallCatch',
      ) as {
        type: string;
        y?: number;
      };
      expect(
        first?.type === 'lureCaught' ||
          first?.type === 'fallCatch' ||
          first?.y === 1472 ||
          first?.y === 1984 ||
          first?.y === 1920,
        `lead ${lead}`,
      ).toBe(true);
    }
  });

  it('no bark wall on the path any more; the floor panel past T4 opens to W-pocket and she climbs back out', () => {
    expect((getRoom('wood-glidewalk').bark ?? []).map((b) => b.id)).toEqual(['bark-floor']);
    const s = play('wood-glidewalk', ['glide']);
    for (const e of s.g.state.enemies) e.gone = true;
    s.g.teleport(7552, 1984);
    let broke = false;
    for (let k = 0; k < 6 && !broke; k++) {
      let e2 = s.run(J, 6);
      for (let i = 0; i < 40 && !(s.g.state.player.vy > 0 && s.feet().y > 1984 - 40); i++)
        e2 = e2.concat(s.run(0));
      e2 = e2.concat(s.run(D | A, 1), s.run(0, 30));
      broke = has(e2, 'barkBreak');
    }
    expect(broke).toBe(true);
    s.g.teleport(7552, 1984);
    s.run(0, 60);
    expect(s.feet().y).toBe(2176);
    s.g.teleport(7552, 2176);
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
    s.g.teleport(7772, 1984);
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
    s.g.teleport(7650, 1984);
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
    // (Round 4: the oak's glimpse is a long held beat, 300, with the rest inside it: wood-oak.test.ts.)
    expect(glimpse?.hold).toBeLessThanOrEqual(300);
  });

  it('one way on: east along the flat floor to the clearing at floor level, and back west to the glidewalk', () => {
    const s = play('wood-hollow', ['glide']);
    // (Round 5: the trunk's foot has a bark door, Tatter's crack: wood-oak.test.ts. Opened here.)
    s.g.state.save.opened.push('wood-hollow:bark-foot');
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

  it('the root mesh: no drop-through until she has climbed out of the roots, then a shortcut down the column into the den', () => {
    for (let x = 2580; x <= 2924; x += 48) {
      const d = play('wood-hollow', ['glide']);
      d.g.teleport(x, 3840);
      d.run(0, 5);
      const ev = d.run(D, 3).concat(d.run(D | J, 10), d.run(D, 40), d.run(0, 20));
      expect(has(ev, 'dropThrough'), `x ${x}`).toBe(false);
      expect(d.g.state.room, `x ${x}`).toBe('wood-hollow');
    }
    const s = play('wood-hollow', ['glide']);
    s.g.state.save.flags.push('wood-climbout', 'wood-old-burrback-down');
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
    s.g.state.save.flags.push('wood-old-burrback-down');
    s.run(0, 2);
    s.g.teleport(2912, 440);
    climb(s, 1, () => s.g.state.room === 'wood-hollow' && s.feet().y < 3820, 2400, 10);
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
      // (But the trunk's foot, plan r3 "the oak, every visit": standing at the column the view frames it tall;
      // the stone and the sign west of it stay out of every zone.)
      // (And the hollow in the root flare, plan r6 #8: Tatter framed close, east of the sign too.)
      if (z.id === 'trunk-foot' || z.id === 'hollow') expect(z.x, z.id).toBeGreaterThan(2300 + 64);
      else expect(z.y + z.h, z.id).toBeLessThanOrEqual(3840 - 320);
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
    for (const [lead, aim] of [
      [0, ActionBit.up | R],
      [40, ActionBit.up | R],
      [80, ActionBit.up | R],
      [120, ActionBit.up | R],
      [0, R],
      [80, R],
    ] as const) {
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
      beatFree(s, aim);
      for (let i = 0; i < 200 && !s.g.state.player.grounded; i++) s.run(aim);
      expect(has(s.events, 'thornHit'), `lead ${lead}`).toBe(false);
      // On the far ledge's top (video r2: 8 of 9 throws fell into the tunnel's mouth), clear of both its ends.
      expect(s.feet().y, `lead ${lead} aim ${aim}`).toBe(800);
      expect(s.feet().x, `lead ${lead} aim ${aim}`).toBeGreaterThan(3060);
      expect(s.feet().x, `lead ${lead} aim ${aim}`).toBeLessThan(3456);
    }
  });

  it('a miss lands in the pit under the throw, a retry: one jump back onto the near ledge; the tunnel has its own door', () => {
    expect(getRoom('wood-hawkers').thorns ?? []).toEqual([]);
    expect((getRoom('wood-hawkers').camera?.zones ?? []).map((z) => z.id)).toContain('throw');
    const s = play('wood-hawkers', ['glide']);
    for (const e of s.g.state.enemies) {
      e.mode = 'dead';
      e.gone = true;
    }
    const wi = (s.g.scene.lures ?? []).findIndex((l) => l.id === 'wick-throw');
    s.g.state.lures.hp[wi] = 0;
    s.g.state.lures.out[wi] = 1;
    s.g.teleport(2500, 1024);
    s.run(0, 3);
    s.run(R, 40);
    for (let i = 0; i < 120 && !s.g.state.player.grounded; i++) s.run(0);
    expect(s.feet().y).toBe(1248);
    // The retry ramp: a root step (112 up, then 112 to the near ledge).
    let back = -1;
    for (let i = 0; i < 300 && back < 0; i++) {
      s.run(L | (i % 30 < 15 ? J : 0));
      if (s.g.state.player.grounded && s.feet().y === 1024 && s.feet().x < 2560) back = i;
    }
    expect(back).toBeGreaterThan(0);
    expect(back).toBeLessThan(120);
    // The dark way: the root hatch in the near ledge (2208-2368), down + jump, one drop, the tunnel, up past the far ledge.
    const d = play('wood-hawkers', ['glide']);
    for (const e of d.g.state.enemies) {
      e.mode = 'dead';
      e.gone = true;
    }
    d.g.teleport(2256, 1024);
    d.run(0, 3);
    d.run(D | J, 2);
    d.run(0, 60);
    expect(d.feet().y).toBe(1360);
    expect(naive(d, () => d.feet().y === 1024 && d.feet().x > 3456, 900)).toBeGreaterThan(0);
  });

  it('both hawkers fly a rhythm round their lamps: A over the hummocks (taught on safe floor), B over the throw', () => {
    const orbit = (getRoom('wood-hawkers').enemies ?? [])
      .filter((e) => e.kind === 'hawker')
      .map((e) => [e.id, e.orbit]);
    expect(orbit).toEqual([
      ['hawk-first', 'wick-hawk'],
      ['hawk-throw', 'wick-throw'],
    ]);
  });

  it("Tatter's walk ends in the dark way's door (the hatch), where it vanishes", () => {
    const room = getRoom('wood-hawkers');
    const t = (room.marks?.stage?.tatters ?? []).find((m) => m.climb?.vanish);
    const end = t?.climb?.path.at(-1);
    const hatch = (room.oneWays ?? []).find((o) => o.x === 2208 && o.y === 1024);
    expect(hatch).toBeDefined();
    expect(end?.[1]).toBe(1024);
    expect(end?.[0]).toBeGreaterThan(2208);
    expect(end?.[0]).toBeLessThan(2208 + (hatch?.w ?? 0));
  });

  it('the find: the bark in the far ledge hides the moonlit hollow (quick wings); P-dark rests her', () => {
    const s = play('wood-hawkers', ['glide']);
    s.g.teleport(3776, 1024);
    expect(has(s.run(0, 40), 'patchRest')).toBe(true);
    s.g.teleport(3520, 1024);
    s.run(0, 3);
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
    const guards = (room.enemies ?? [])
      .filter((e) => e.guards === 'wick-s3' && e.kind !== 'carrier')
      .map((e) => e.kind);
    expect(guards.sort()).toEqual(['burrback', 'dangler']);
    const s = play('wood-silk', ['glide']);
    s.g.teleport(2740, 2624);
    const ev = s.run(R, 1).concat(s.run(A, 1), s.run(0, 30));
    expect(ev.find((e) => e.type === 'lureSnuff')).toMatchObject({ id: 'wick-s3' });
    const gone = ev.filter((e) => e.type === 'enemyDisperse').map((e) => ('id' in e ? e.id : ''));
    expect(gone).toEqual(expect.arrayContaining(['burr-silk', 'dang-s3']));
  });

  it("the composition's beetle is fenced east of the flame: it never reaches the knob's landing (video r2: it killed 3 runs)", () => {
    const s = play('wood-silk', ['glide']);
    for (const e of s.g.state.enemies) if (e.id !== 'burr-silk') e.gone = true;
    s.g.teleport(2740, 2624);
    let least = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 600; i++) {
      s.run(0);
      least = Math.min(least, s.g.state.enemies.find((e) => e.id === 'burr-silk')?.x ?? least);
    }
    expect(least).toBeGreaterThan(2740 + 200);
    expect(s.events.some((e) => e.type === 'hurt')).toBe(false);
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

describe('R10 wood-well: the root stair, the nest, the den under the oak, the climb-out', () => {
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
  const old = (s: ReturnType<typeof play>) => s.g.state.enemies.find((e) => e.id === 'old-burr');
  /** The old burrback dead (its death sets the flag that drops the plug and opens the glade). */
  function slay(s: ReturnType<typeof play>): SimEvent[] {
    const e = old(s);
    if (!e) throw new Error('no old burrback');
    e.mode = 'dead';
    e.gone = true;
    return s.run(0, 3);
  }

  it('down the root stair into the nest, its bark plug cut, the window beat over the den, and the drop to P-den at its door', () => {
    const s = play('wood-well', ['glide']);
    s.g.teleport(10944, 448);
    stair(s, () => s.feet().x < 6528 && s.g.state.player.grounded && s.feet().y === 1856);
    expect(s.feet().y).toBe(1856);
    for (const e of s.g.state.enemies) if (e.kind === 'dangler') e.gone = true;
    // West through the nest: hop the pockets; caught by a pocket's lamp, beat free west.
    let ju = -1;
    for (let f = 0; f < 1800 && s.feet().x >= 3800; f++) {
      const p = s.g.state.player;
      if (p.lure >= 0) {
        s.run(L | (f % 10 === 0 ? J : 0));
        continue;
      }
      // At the bark plug (the nest's west exit): cut it.
      if (p.grounded && s.feet().x < 4000 && s.feet().y === 1856) {
        s.run(L | (f % 8 === 0 ? A : 0));
        continue;
      }
      if (p.grounded && solidAt(s.g.scene, s.feet().x - 30, s.feet().y - 8, 1, 1) && f > ju + 1) ju = f + 14;
      s.run(L | (f < ju ? J : 0));
    }
    expect(has(s.events, 'barkBreak')).toBe(true);
    expect(s.events.some((e) => e.type === 'fade')).toBe(false);
    expect(s.g.state.save.flags).toContain('wood-window');
    for (let i = 0; i < 120 && !s.g.state.player.grounded; i++) s.run(0);
    expect(s.feet().y).toBe(2112);
    expect(has(s.run(0, 40), 'patchRest')).toBe(true);
    expect(s.g.state.save.patch).toEqual({ room: 'wood-well', id: 'p-den' });
    // A jump (256) back up to the nest: the den's door is not a trap.
    s.run(R | J, 20);
    for (let i = 0; i < 300 && !(s.g.state.player.grounded && s.feet().x > 3900); i++) s.run(R);
    expect(s.feet().y).toBe(1856);
  });

  it("the pogo-wick: walk under the root mass to L1's lip, step off, down-cut the wick: it snuffs, bounces her, and she glides on to L2", () => {
    let made = 0;
    for (const d of [2, 4, 6]) {
      const p = play('wood-well', ['glide']);
      p.g.teleport(10400, 640);
      p.run(0, 3);
      for (let i = 0; i < 200 && p.g.state.player.grounded; i++) p.run(L);
      p.run(L, d);
      p.run(D | A, 1);
      for (let i = 0; i < 200 && !p.g.state.player.grounded && p.g.state.player.lure < 0; i++)
        p.run((p.feet().x < 8700 ? 0 : L) | J);
      const snuffed = p.events.find((e) => e.type === 'lureSnuff');
      if (snuffed && 'id' in snuffed && snuffed.id === 'wick-pogo' && p.feet().y === 896) made++;
    }
    expect(made).toBeGreaterThanOrEqual(2);
    // No jump under the mass, and nothing to stand on above it.
    const j = play('wood-well', ['glide']);
    j.g.teleport(10000, 640);
    let top = 640;
    for (let i = 0; i < 30; i++) {
      j.run(J);
      top = Math.min(top, j.feet().y);
    }
    expect(640 - top).toBeLessThanOrEqual(40);
  });

  it('every stair gap is a jump or a glide from its lip with every lamp out: no snuffed lamp strands her', () => {
    for (const [x0, y0, lip, next] of [
      [10400, 640, 0, 896],
      [8600, 896, 8448, 1040],
      [7600, 1040, 7488, 1152],
    ] as const) {
      for (const glide of [false, true]) {
        const s = play('wood-well', ['glide']);
        s.g.teleport(x0, y0);
        s.run(0, 3);
        for (let i = 0; i < (s.g.scene.lures ?? []).length; i++) {
          s.g.state.lures.hp[i] = 0;
          s.g.state.lures.out[i] = 1;
        }
        for (const e of s.g.state.enemies) {
          e.mode = 'dead';
          e.gone = true;
        }
        if (glide || !lip) for (let i = 0; i < 300 && s.g.state.player.grounded; i++) s.run(L);
        else {
          for (let i = 0; i < 200 && s.feet().x > lip + 20; i++) s.run(L);
          s.run(L | J, 14);
        }
        for (let i = 0; i < 300 && !s.g.state.player.grounded; i++) s.run(L | J);
        expect(has(s.events, 'fallCatch'), `from ${x0} glide ${glide}`).toBe(false);
        expect(s.feet().y, `from ${x0} glide ${glide}`).toBe(next);
      }
    }
  });

  it('a fall in a stair gap returns her to the ledge she fell from, set back from its lip (no catch loop)', () => {
    for (const [x0, back] of [
      [9500, { x: 10000, y: 640 }],
      [8200, { x: 9150, y: 896 }],
      [7260, { x: 7880, y: 1040 }],
    ] as const) {
      const s = play('wood-well', ['glide']);
      for (const e of s.g.state.enemies) e.gone = true;
      s.g.teleport(x0, 1700);
      for (let i = 0; i < 200 && !has(s.events, 'fallReturn'); i++) s.run(0);
      s.run(0, 3);
      expect(s.feet(), `gap at ${x0}`).toEqual(back);
    }
  });

  it('no skip past the den while the old burrback lives: without the claws nothing from its door, the nest or the den floor reaches the column, the road or the nest shaft', () => {
    let highShaft = Number.POSITIVE_INFINITY;
    let highColumn = Number.POSITIVE_INFINITY;
    for (const [x0, y0] of [
      [3664, 1660],
      [3700, 1856],
      [3760, 1856],
      [3744, 2112],
      [2600, 2112],
      [2752, 2112],
      [2900, 2112],
      [2592, 1700],
    ] as const) {
      for (const k of [4, 10, 16, 22]) {
        for (const m of [L | J, R | J, J]) {
          const t = play('wood-well', ['glide']);
          // (The others out of the way; the old burrback stays: a gone one counts as dead and drops the plug.)
          for (const e of t.g.state.enemies) if (e.kind !== 'oldBurrback') e.gone = true;
          t.g.teleport(x0, y0);
          t.run(0, 2);
          for (let i = 0; i < k; i++) t.run(m);
          for (let i = 0; i < 90; i++) {
            t.run((i % 30 < 14 ? J : 0) | (m & (L | R)));
            const f = t.feet();
            if (f.x > 3616 && f.x < 3872) highShaft = Math.min(highShaft, f.y);
            if (f.x > 2560 && f.x < 2944) highColumn = Math.min(highColumn, f.y);
          }
          expect(t.g.state.room, `${x0},${y0}`).toBe('wood-well');
          expect(t.g.state.save.flags, `${x0},${y0}`).not.toContain('wood-old-burrback-down');
        }
      }
    }
    expect(highShaft).toBeGreaterThan(1280);
    expect(highColumn).toBeGreaterThan(1600);
  });

  it('the den: through the door at floor level; she walks under the taproot (88 clear), the old burrback (96 tall) cannot', () => {
    const room = getRoom('wood-well');
    const tap = room.solids.find((q) => q.x === 3200 && q.tag === 'root');
    if (!tap) throw new Error('no taproot');
    const clear = 2112 - (tap.y + tap.h);
    expect(clear).toBeGreaterThan(defaultTuning.body.height);
    expect(clear).toBeLessThan(defaultTuning.oldBurrback.height);
    const s = play('wood-well', ['glide']);
    for (const e of s.g.state.enemies) {
      e.mode = 'dead';
      e.gone = true;
    }
    s.g.teleport(3744, 2112);
    s.run(0, 3);
    for (let i = 0; i < 200 && s.feet().x > 3100; i++) s.run(L);
    expect(s.feet()).toMatchObject({ y: 2112 });
    expect(s.feet().x).toBeLessThanOrEqual(3100);
  });

  it('the plug holds until the old burrback dies; then the claws in the moonlight where it died, and the column is the climb-out', () => {
    const s = play('wood-well', ['glide']);
    s.g.teleport(2608, 1700);
    s.run(0, 3);
    s.run(J, 30);
    expect(s.feet().y).toBeGreaterThan(1600);
    // The glade is the arena's floor and gives nothing while it lives.
    s.g.teleport(2400, 2112);
    s.run(0, 30);
    expect(s.g.state.save.abilities).not.toContain('wallJump');
    const ev = slay(s);
    expect(ev.find((x) => x.type === 'flagSet')).toMatchObject({
      flag: 'wood-old-burrback-down',
      by: 'old-burr',
    });
    expect(ev.find((x) => x.type === 'gateOpen')).toMatchObject({ id: 'plug' });
    s.run(0, 3);
    expect(s.g.state.save.abilities).toContain('wallJump');
    expect(s.events.find((x) => x.type === 'gladeGrant')).toMatchObject({ ability: 'wallJump' });
    // Up the column into the oak.
    const c = play('wood-well', ['glide', 'wallJump']);
    c.g.state.save.flags.push('wood-old-burrback-down');
    c.run(0, 2);
    c.g.teleport(2924, 2112);
    c.run(0, 3);
    climb(c, 1, () => c.feet().y < 720, 900, 10);
    expect(c.feet().y).toBeLessThan(720);
    c.g.teleport(2912, 440);
    c.run(0, 3);
    climb(c, 1, () => c.g.state.room === 'wood-hollow' && c.feet().y < 3820, 900, 10);
    expect(c.g.state.room).toBe('wood-hollow');
  });

  it('the boss knows its den: the taproot span, its crack flag (render shares it), a range that reaches the taproot', () => {
    const room = getRoom('wood-well');
    const e = (room.enemies ?? []).find((q) => q.id === 'old-burr');
    const tap = room.solids.find((q) => q.x === 3200 && q.tag === 'root');
    expect(e && 'taproot' in e ? e.taproot : undefined).toEqual([tap?.x, (tap?.x ?? 0) + (tap?.w ?? 0)]);
    expect(e && 'crack' in e ? e.crack : undefined).toBe('wood-den-cracked');
    expect(room.marks?.stage?.den?.crack).toBe('wood-den-cracked');
    expect((e?.x ?? 0) + (e?.radius ?? 0)).toBeGreaterThan(tap?.x ?? 0);
  });

  it('the carriers: every trail in the roots ends in the nest, and each line has its lamp', () => {
    for (const id of ['wood-glidewalk', 'wood-silk', 'wood-well']) {
      const ants = (getRoom(id).enemies ?? []).filter((e) => e.kind === 'carrier');
      expect(ants.length, id).toBeGreaterThanOrEqual(2);
      for (const a of ants) expect(a.guards, `${id} ${a.id}`).toBeDefined();
    }
  });

  it('W-den hangs high in the den: a jump from the floor under it is caught, a stand is not', () => {
    const s = play('wood-well', ['glide']);
    for (const e of s.g.state.enemies) {
      e.mode = 'dead';
      e.gone = true;
    }
    s.g.teleport(2240, 2112);
    expect(has(s.run(0, 30), 'lureCaught')).toBe(false);
    s.run(J, 20);
    expect(s.events.find((e) => e.type === 'lureCaught')).toMatchObject({ id: 'wick-den' });
  });

  it('a fade in the den re-forms her at P-den by its door, not back at the hub', () => {
    const s = play('wood-hollow', ['glide']);
    s.g.teleport(1280, 3840);
    s.run(0, 40);
    expect(s.g.state.save.patch).toEqual({ room: 'wood-hollow', id: 'p3' });
    s.g.goto('wood-well', 2400, 2112);
    s.g.state.player.faded = 2;
    s.run(0, 3);
    expect(s.g.state.room).toBe('wood-well');
    expect(s.feet()).toEqual({ x: 3744, y: 2112 });
  });

  it('the nest: two lit pockets with a dangler each; no dangler over the stair (its landings are fall-return points); the window holds 3 s', () => {
    const room = getRoom('wood-well');
    const d = (room.enemies ?? []).filter((e) => e.kind === 'dangler');
    expect(d.map((e) => e.guards).sort()).toEqual(['wick-nest-a', 'wick-nest-b']);
    for (const e of d) expect(e.x, e.id).toBeLessThan(6528);
    expect((room.triggers ?? []).find((t) => t.id === 'window')?.hold).toBe(180);
  });

  it('the climb-out: catch ledges up the column, none more than 600 apart; a slip lands on the next one down', () => {
    const room = getRoom('wood-well');
    const ledges = (room.oneWays ?? [])
      .filter((o) => o.x >= 2560 && o.x + o.w <= 2944)
      .sort((a, b) => b.y - a.y);
    const ys = [2112, ...ledges.map((o) => o.y)];
    for (let i = 1; i < ys.length; i++)
      expect((ys[i - 1] ?? 0) - (ys[i] ?? 0), `under ${ys[i]}`).toBeLessThanOrEqual(600);
    expect(ys.at(-1)).toBe(160);
    for (const o of ledges) {
      const s = play('wood-well', ['glide', 'wallJump']);
      s.g.state.save.flags.push('wood-old-burrback-down');
      s.run(0, 2);
      s.g.teleport(o.x + 32, o.y - 150);
      for (let i = 0; i < 120 && !s.g.state.player.grounded; i++) s.run(0);
      expect(s.feet().y, `ledge ${o.y}`).toBe(o.y);
    }
  });
});

describe('the west root road (claws): the nest, over the den, under R6, up through R5', () => {
  /** Wall-jumps up a face held toward `M` (a press every 12 frames) until `done`; her highest feet. */
  function kickUp(s: ReturnType<typeof play>, M: number, done: () => boolean, max = 600): number {
    let best = Number.POSITIVE_INFINITY;
    for (let f = 0; f < max && !done(); f++) {
      s.run((f % 12 < 6 ? J : 0) | M);
      best = Math.min(best, s.feet().y);
    }
    return best;
  }

  it("the nest's shaft: the claws climb it to the road's tunnel; without them a hop onto its first ledge is all", () => {
    const s = play('wood-well', ['glide', 'wallJump']);
    for (const e of s.g.state.enemies) e.gone = true;
    s.g.teleport(3760, 1856);
    s.run(0, 3);
    kickUp(s, L, () => s.feet().y <= 700);
    expect(s.feet().y).toBeLessThanOrEqual(700);
    const n = play('wood-well', ['glide']);
    for (const e of n.g.state.enemies) e.gone = true;
    n.g.teleport(3760, 1856);
    n.run(0, 3);
    expect(kickUp(n, L, () => false, 300)).toBeGreaterThan(1300);
  });

  it('the tunnel runs west over the den and across the column into the root road, to the shaft under R5', () => {
    const s = play('wood-well', ['glide', 'wallJump']);
    s.g.teleport(3400, 700);
    s.run(0, 3);
    let ju = -1;
    for (let f = 0; f < 3000 && s.g.state.room === 'wood-well'; f++) {
      if (s.g.state.player.lure >= 0) {
        s.run(L | (f % 10 === 0 ? J : 0));
        continue;
      }
      if (s.g.state.player.grounded && f > ju + 1 && Math.abs(s.feet().x - 2752) < 280) ju = f + 14;
      s.run(L | (f < ju ? J : 0));
    }
    expect(s.g.state.room).toBe('wood-rootroad');
    for (let f = 0; f < 3000 && s.feet().x > 420; f++) {
      if (s.g.state.player.lure >= 0) {
        s.run(L | (f % 10 === 0 ? J : 0));
        continue;
      }
      s.run(L | (s.g.state.player.grounded && f % 40 < 14 ? J : 0));
    }
    expect(s.feet().x).toBeLessThanOrEqual(420);
  });

  it("R5's root grate: floor from above (the shaft seen through it, a lock in act 1); a drop once the old burrback is down; the claws climb up through it", () => {
    const a = play('wood-glade', ['glide']);
    a.g.teleport(2688, 2176);
    a.run(0, 30);
    expect(a.feet().y).toBe(2176);
    a.run(D, 3);
    a.run(D | J, 10);
    a.run(0, 30);
    expect(a.g.state.room).toBe('wood-glade');
    expect(a.feet().y).toBe(2176);
    const d = play('wood-glade', ['glide']);
    d.g.state.save.flags.push('wood-old-burrback-down');
    d.run(0, 2);
    d.g.teleport(2688, 2176);
    d.run(0, 5);
    d.run(D, 3);
    d.run(D | J, 10);
    for (let i = 0; i < 200 && d.g.state.room === 'wood-glade'; i++) d.run(0);
    expect(d.g.state.room).toBe('wood-rootshaft');
    const s = play('wood-glade', ['glide', 'wallJump']);
    s.g.teleport(2600, 2490);
    kickUp(s, L, () => s.feet().y <= 2176 && s.g.state.player.grounded, 240);
    expect(s.feet().y).toBe(2176);
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
