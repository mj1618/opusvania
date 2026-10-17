import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { getRoom, WORLD } from '../../src/scene/index';
import { GAME_WORLD } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { ActionBit } from '../../src/sim/input';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';

/**
 * The oak (`wood-hollow`): the hollow at its foot, the trunk and the crown in one room (area 1 plan r3 item 3,
 * director doc "Round 3 revisions" 1; memory/rooms.md "The oak"), and the area-2 stub `wood-canopy` east of the
 * crown. Each claim is measured in the sim. Room coordinates: the floor y 3840; the column x 2560-2944 (catch
 * rungs at 3264 and 2752); the rest ledge y 2240 (P-ledge on its buttress, W-rest); the floor under W-ff (1776)
 * and W-ff (2620, 1460) out of the near face's reach, the thorn band 1404-1544 above where the face holds; the
 * knot bridge y 1312 (from the band's top to its tip over W-ff); the upper rung (1000) under the crown wick
 * (2560, 720), off the climb; the rim y 576 with the root's knot, P5, the finale trigger and the gate (round 4).
 */

const R = ActionBit.right;
const L = ActionBit.left;
const U = ActionBit.up;
const D = ActionBit.down;
const J = ActionBit.jump;
const A = ActionBit.attack;
const has = (ev: SimEvent[], type: string, id?: string) =>
  ev.some((e) => e.type === type && (id === undefined || (e as { id?: string }).id === id));

const OAK = getRoom('wood-hollow');
const FLOOR = 3840;
const LEDGE = 2240;
const MID = 1776;
const WFF = { x: 2620, y: 1460 };
const BRIDGE = 1312;
const RIM = 576;

/** A game in the world booted in `room` (the oak by default), every event kept; the glimpse seen unless `glimpse` is false. */
function play(opts: { room?: string; abilities?: string[]; glimpse?: boolean } = {}) {
  const t = cloneTuning(defaultTuning);
  const g = new Game(
    t,
    getRoom(opts.room ?? 'wood-hollow'),
    1,
    () => 0,
    opts.abilities ?? ['glide', 'wallJump'],
    {
      world: GAME_WORLD,
    },
  );
  g.mode = 'manual';
  if (opts.glimpse !== false) g.state.save.flags.push('wood-firefly-glimpse');
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
  const lureIs = (id: string) => g.state.player.lure >= 0 && g.scene.lures?.[g.state.player.lure]?.id === id;
  return { g, t, events, run, feet, lureIs };
}
type Play = ReturnType<typeof play>;

/** The one-wall climb (wood-rooms.test.ts): press each time she slides on the wall in `dir`. */
function climb(s: Play, dir: number, until: () => boolean, max = 900, rise = 0): SimEvent[] {
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

/** Beats free of a lure's hold: presses of jump, `dir` held, `gap` frames apart. */
function beatFree(s: Play, dir = 0, gap = 9): SimEvent[] {
  const out: SimEvent[] = [];
  for (let k = 0; k < 8 && s.g.state.player.lure >= 0; k++)
    out.push(...s.run(dir | J, 1), ...s.run(dir, gap));
  return out;
}

/** Runs `mask` until she stands on ground (or `max` frames). */
function land(s: Play, mask = 0, max = 240): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < max && !(s.g.state.player.grounded && out.length > 0); i++) out.push(...s.run(mask));
  return out;
}

/** From the bridge's tip: walk off east and down-cut after `k` frames (the pogo snuff of W-ff). */
function tipCut(s: Play, k: number): SimEvent[] {
  s.g.teleport(2600, BRIDGE);
  let ev = s.run(0, 3);
  for (let i = 0; i < 30 && s.g.state.player.grounded; i++) ev = ev.concat(s.run(R));
  return ev.concat(s.run(0, k), s.run(D | A, 1), s.run(D, 6));
}

describe('the oak: one room from the roots to the crown', () => {
  it('replaces the hub and wood-heart: placed at the bowl, the column at world x 32192-32576, its doors linked', () => {
    expect(WORLD.rooms.find((r) => r.id === 'wood-hollow')).toEqual({ id: 'wood-hollow', x: 29632, y: 6208 });
    expect([OAK.width, OAK.height]).toEqual([3840, 4208]);
    expect(WORLD.rooms.map((r) => r.id)).not.toContain('wood-heart');
    // The floor is world y 10048 (R6's T4, R8's floor), as the hub's was.
    expect(6208 + FLOOR).toBe(10048);
    const links = GAME_WORLD.links;
    expect(links['wood-glidewalk#e']).toEqual({ to: 'wood-hollow', exit: 'w' });
    expect(links['wood-hollow#e']).toEqual({ to: 'wood-hawkers', exit: 'w' });
    expect(links['wood-hollow#climb']).toEqual({ to: 'wood-well', exit: 'out' });
    expect(links['wood-hollow#canopy']).toEqual({ to: 'wood-canopy', exit: 'w' });
    expect(OAK.exits?.some((e) => e.edge === 'n')).toBe(false);
    expect(OAK.marks?.stage?.oak?.x).toBe(2752);
    expect(getRoom('wood-canopy').title).toMatch(/^STUB/);
  });

  it('with the claws the climb from the floor to the rest ledge and up the near face never leaves the room', () => {
    const s = play();
    s.g.teleport(2700, FLOOR);
    // Up the column's west face to the rest ledge (no room change on the way).
    let ev = climb(s, -1, () => s.g.state.player.grounded && s.feet().y <= LEDGE, 1500, 14);
    expect(s.feet().y).toBe(LEDGE);
    // Over to P-ledge's buttress and up the near face onto the floor under W-ff.
    for (let i = 0; i < 80 && s.feet().x < 2860; i++) ev = ev.concat(s.run(R | (i < 20 ? J : 0)));
    ev = ev.concat(
      land(s, R),
      climb(s, 1, () => s.g.state.player.grounded && s.feet().y === MID, 900),
    );
    expect(has(ev, 'roomExit')).toBe(false);
    expect(s.feet().y).toBe(MID);
    const no = play({ abilities: ['glide'] });
    no.g.teleport(2700, FLOOR);
    climb(no, 1, () => false, 600, 14);
    expect(no.feet().y).toBeGreaterThan(FLOOR - 400);
  });

  it('a fall never costs more than ~600 px: from the faces and the bridge she lands on a rung, a ledge or the floor', () => {
    const drops: [number, number][] = [
      [2580, 3700],
      [2580, 3200],
      [2580, 2700],
      [2790, 3700],
      [2790, 3000],
      [2790, 2400],
      [2924, 2100],
      [2924, 1700],
      [2400, 1700],
      [2200, 1350],
      [2500, 1350],
      [2924, 1200],
      [2924, 1000],
      [2924, 700],
      [2300, 900],
      [2000, 900],
    ];
    for (const [x, y] of drops) {
      const s = play({ glimpse: false });
      s.g.teleport(x, y);
      s.run(0, 1);
      const y0 = s.feet().y;
      for (let i = 0; i < 300 && !s.g.state.player.grounded; i++) s.run(0);
      expect(s.g.state.player.grounded, `${x},${y}`).toBe(true);
      expect(s.feet().y - y0, `${x},${y} -> ${s.feet().y}`).toBeLessThanOrEqual(600);
    }
  });
});

describe('the hollow at the foot of the oak', () => {
  it('the first visit is lived: a glimpse of 180 at P3, then Tatter’s crack at the trunk’s foot is the way east', () => {
    const glimpse = (OAK.triggers ?? []).find((t) => t.id === 'glimpse');
    expect(glimpse?.hold).toBe(180);
    const path = OAK.marks?.stage?.glimpse?.path ?? [];
    expect(path[path.length - 1]).toEqual([WFF.x, WFF.y]);
    // In from the west door, held right: the glimpse (and the rest in it), then the bark at the trunk's foot stops
    // her; three cuts; the hollow inside: night eyes, W-foot; out east under the flare's roof.
    const s = play({ glimpse: false, abilities: ['glide'] });
    s.g.teleport(60, FLOOR);
    const ev: SimEvent[] = [];
    for (let f = 0; f < 3600 && s.g.state.room === 'wood-hollow'; f++) {
      const p = s.g.state.player;
      const pressed = p.wallDir === 1 && p.grounded;
      if (s.feet().x > 3150 && s.feet().x < 3250 && (s.g.state.lures.hp[4] ?? 0) > 0 && p.grounded) {
        // In the hollow, under W-foot: a standing up-cut.
        ev.push(...s.run(U | A, 1), ...s.run(0, 10));
        continue;
      }
      ev.push(...s.run(R | (pressed && f % 20 === 0 ? A : 0)));
    }
    expect(ev.find((e) => e.type === 'storyHold')).toMatchObject({ id: 'glimpse', frames: 180 });
    expect(has(ev, 'patchRest')).toBe(true);
    expect(has(ev, 'barkBreak', 'bark-foot')).toBe(true);
    expect(ev.find((e) => e.type === 'hollowGrant')).toMatchObject({ upgrade: 'nightEyes' });
    expect(s.g.state.save.flags).toContain('wood-oak-hollow');
    expect(has(ev, 'lureSnuff', 'wick-foot')).toBe(true);
    expect(has(ev, 'lureCaught')).toBe(false);
    expect(s.g.state.room).toBe('wood-hawkers');
    // No held beat in the oak's first visit is over 4 s.
    for (const t of OAK.triggers ?? [])
      if (t.id !== 'crown') expect(t.hold ?? 0, t.id).toBeLessThanOrEqual(240);
  });

  it('the bark is the only way east before the claws: the flare’s roof can’t be reached from under the trunk', () => {
    const s = play({ abilities: ['glide'] });
    s.g.teleport(2900, FLOOR);
    s.run(0, 3);
    for (let i = 0; i < 4; i++) {
      s.run(R | J, 20);
      s.run(R, 20);
    }
    expect(s.feet().x).toBeLessThan(3008);
  });
});

describe('the rest ledge: P-ledge, W-rest and the dangler', () => {
  it('P-ledge rests her out of W-rest’s light: the dangler never drops on a rester', () => {
    const s = play();
    s.g.teleport(2880, LEDGE);
    const ev = s.run(0, 300);
    expect(has(ev, 'patchRest')).toBe(true);
    expect(s.g.state.save.patch).toEqual({ room: 'wood-hollow', id: 'p-ledge' });
    expect(has(ev, 'hurt')).toBe(false);
    expect(has(ev, 'enemyWindup', 'dang-knot')).toBe(false);
  });

  it('W-rest is a standing cut from either side, and the snuff sends the dangler away', () => {
    for (const [x, dir] of [
      [2274, R],
      [2486, L],
    ] as const) {
      const s = play();
      s.g.teleport(x, LEDGE);
      s.run(0, 3);
      s.run(dir, 1);
      const ev = s.run(A, 1).concat(s.run(0, 20));
      expect(has(ev, 'lureSnuff', 'wick-rest'), `from ${x}`).toBe(true);
      expect(has(ev, 'enemyDisperse', 'dang-knot'), `from ${x}`).toBe(true);
    }
  });

  it('standing at the cut spot she is bitten from overhead; stepping back when its thread shows, never', () => {
    const s = play();
    s.g.teleport(2486, LEDGE);
    s.run(L, 1);
    expect(has(s.run(0, 200), 'hurt')).toBe(true);
    for (const [x, away] of [
      [2274, L],
      [2486, R],
    ] as const) {
      const b = play();
      b.g.teleport(x, LEDGE);
      b.run(0, 1);
      let ev: SimEvent[] = [];
      for (let i = 0; i < 200 && !has(ev, 'enemyWindup', 'dang-knot'); i++) ev = ev.concat(b.run(0));
      expect(has(ev, 'enemyWindup', 'dang-knot'), `notice at ${x}`).toBe(true);
      ev = b.run(away, 16).concat(b.run(0, 120));
      expect(has(ev, 'hurt'), `step back from ${x}`).toBe(false);
    }
  });
});

describe('the middle of the trunk: W-ff, the firefly’s glow-cap', () => {
  it('burns only once the glimpse has been seen', () => {
    const i = OAK.lures?.findIndex((l) => l.id === 'wick-firefly') ?? -1;
    const before = play({ glimpse: false });
    before.run(0, 2);
    expect(before.g.state.lures.out[i]).toBeGreaterThan(0);
    const after = play();
    after.run(0, 2);
    expect(after.g.state.lures.out[i]).toBe(0);
  });

  it('climbing the near face never enters its pull: a held-right climber from P-ledge ends on the floor under it', () => {
    let floor = 0;
    for (const delay of [0, 2, 4, 6, 8, 10, 12, 14]) {
      for (const press of [4, 7, 12]) {
        const s = play();
        s.g.teleport(2880, LEDGE);
        s.run(0, 2);
        let slide = 0;
        let pr = 0;
        const ev: SimEvent[] = [];
        for (let f = 0; f < 600; f++) {
          const p = s.g.state.player;
          slide = p.wallDir === 1 && !p.grounded ? slide + 1 : 0;
          if ((p.grounded && f > 2 && s.feet().y > 2000) || slide === delay + 1) pr = press;
          ev.push(...s.run(R | (pr > 0 ? J : 0)));
          pr--;
          if (s.g.state.player.grounded && s.feet().y === MID) break;
        }
        expect(has(ev, 'lureCaught'), `delay ${delay} press ${press}`).toBe(false);
        expect(has(ev, 'thornHit'), `delay ${delay} press ${press}`).toBe(false);
        if (s.feet().y === MID) floor++;
      }
    }
    // Measured: 16 of 24 press rhythms reach the floor (the rest are still climbing at 10 s), none caught, no thorns.
    expect(floor).toBeGreaterThanOrEqual(12);
  });

  it('the thorn band (60 px, round 6) is out of reach of a jump from the floor under W-ff, held into the face', () => {
    for (const x of [2860, 2900, 2924]) {
      for (const hold of [6, 12, 20]) {
        const s = play({ glimpse: false });
        s.g.teleport(x, MID);
        s.run(0, 2);
        const ev = s.run(R | J, hold).concat(s.run(R, 60));
        expect(has(ev, 'thornHit'), `x ${x} hold ${hold}`).toBe(false);
      }
    }
  });

  it('the floor under it stands out of its pull; a hop up from it is caught; beaten free up-left she lands on the bridge', () => {
    let bridge = 0;
    let n = 0;
    for (const x of [2560, 2620, 2680]) {
      const s = play();
      s.g.teleport(x, MID);
      expect(has(s.run(0, 120), 'lureCaught')).toBe(false);
      expect(s.feet()).toEqual({ x, y: MID });
      for (const gap of [6, 9, 12, 15]) {
        for (const wait of [0, 7, 14]) {
          const q = play();
          q.g.teleport(x, MID);
          q.run(0, 2);
          q.run(J, 10);
          for (let i = 0; i < 40 && q.g.state.player.lure < 0; i++) q.run(0);
          expect(q.lureIs('wick-firefly'), `hop from ${x}`).toBe(true);
          q.run(0, wait);
          const ev = beatFree(q, U | L, gap).concat(land(q, L, 160));
          n++;
          expect(has(ev, 'thornHit')).toBe(false);
          if (q.feet().y === BRIDGE) bridge++;
        }
      }
    }
    // Measured: 36 of 36.
    expect(bridge / n).toBeGreaterThanOrEqual(0.9);
  });

  it('from the bridge’s tip a walk-off down-cut puts it out and the pogo carries her to the foothold over the thorns', () => {
    for (const k of [0, 2, 4]) {
      const s = play();
      expect(has(tipCut(s, k), 'lureSnuff', 'wick-firefly'), `cut at ${k}`).toBe(true);
      const after: SimEvent[] = [];
      for (let i = 0; i < 90 && s.g.state.player.wallDir !== 1 && !s.g.state.player.grounded; i++)
        after.push(...s.run(R));
      expect(s.feet(), `cut at ${k}`).toEqual({ x: 2890, y: 1248 });
      expect(has(after, 'thornHit')).toBe(false);
    }
    // A miss (no cut): caught again (another throw) or onto the floor under it, never the thorns.
    const m = play({ glimpse: false });
    m.g.teleport(2600, BRIDGE);
    m.run(0, 3);
    const ev = m.run(R, 8).concat(land(m, 0, 120));
    expect(has(ev, 'thornHit')).toBe(false);
    expect(m.feet().y).toBe(MID);
  });

  it('with W-ff out the way is still there: from the floor under it, the far band climbs to the bridge', () => {
    const s = play({ glimpse: false });
    s.g.teleport(2300, MID);
    s.run(0, 3);
    for (let i = 0; i < 80 && s.g.state.player.wallDir !== -1; i++) s.run(L);
    climb(s, -1, () => s.g.state.player.grounded && s.feet().y <= BRIDGE, 900, 10);
    expect(s.feet().y).toBe(BRIDGE);
  });

  it('the dark way: the hole at the ledge’s back, the tunnel and the chimney to the bridge; no lamp near; slower', () => {
    const dark = play();
    dark.g.teleport(2220, LEDGE);
    dark.run(0, 3);
    let ev: SimEvent[] = [];
    for (let i = 0; i < 120 && dark.feet().y <= LEDGE; i++) ev = ev.concat(dark.run(L));
    ev = ev.concat(land(dark, L));
    expect(dark.feet().y).toBe(2688);
    for (let i = 0; i < 120 && dark.feet().x > 1880; i++) ev = ev.concat(dark.run(L));
    ev = ev.concat(climb(dark, -1, () => dark.feet().y <= BRIDGE - 20 && dark.g.state.player.vy > 0, 1200));
    ev = ev.concat(land(dark, R, 120));
    expect(dark.feet().y).toBe(BRIDGE);
    expect(has(ev, 'lureCaught')).toBe(false);
    const darkFrames = dark.g.state.frame;
    // The light way from the same ledge: across to the glow-cap ledge's foot of the near face, up, caught, thrown.
    const light = play();
    light.g.teleport(WFF.x, MID);
    light.run(J, 10);
    for (let i = 0; i < 40 && light.g.state.player.lure < 0; i++) light.run(0);
    beatFree(light, U | L);
    land(light, L, 160);
    expect(light.feet().y).toBe(BRIDGE);
    expect(darkFrames).toBeGreaterThan(light.g.state.frame + 60);
  });

  it('the bark knot: three cuts from the bridge’s west end, W-knot behind it a standing cut from the doorway', () => {
    const s = play();
    s.g.teleport(1830, BRIDGE);
    s.run(L, 6);
    let ev: SimEvent[] = [];
    for (let k = 0; k < 3; k++) ev = ev.concat(s.run(A, 1), s.run(0, 24));
    expect(has(ev, 'barkBreak', 'bark-knot')).toBe(true);
    for (let i = 0; i < 40 && s.feet().x > 1720; i++) s.run(L);
    s.run(0, 4);
    ev = s.run(A, 1).concat(s.run(0, 20));
    expect(has(ev, 'lureSnuff', 'wick-knot')).toBe(true);
    expect(has(ev, 'lureCaught')).toBe(false);
  });
});

describe('the top of the trunk: the near face to the rim, footholds up it', () => {
  it('from the shelf over the thorns the near face climbs to the rim, with no lamp’s grip and no hawker on the way', () => {
    const s = play();
    s.g.teleport(2900, 1248);
    s.run(0, 3);
    const ev = climb(s, 1, () => s.g.state.player.grounded && s.feet().y <= RIM, 900);
    expect(s.feet().y).toBe(RIM);
    expect(has(ev, 'lureCaught')).toBe(false);
    expect(has(ev, 'hurt')).toBe(false);
  });

  it('footholds against the face (1048, 800) make the last climb a stair of plain jumps to the rim', () => {
    const s = play();
    s.g.teleport(2904, 1248);
    s.run(0, 3);
    for (const y of [1048, 800, RIM]) {
      s.run(J | (y === RIM ? R : 0), 20);
      land(s, y === RIM ? R : 0, 120);
      expect(s.feet().y).toBe(y);
    }
  });
});

describe('the crown: the root, the crown wick, P5, the finale', () => {
  it('the root’s knot bars the rim until it is cut; one cut, and Tatter’s root falls (wood-root-ladder)', () => {
    const s = play();
    s.g.teleport(2964, RIM);
    s.run(0, 3);
    for (const e of s.g.state.enemies) e.gone = true;
    s.run(R, 60);
    expect(s.feet().x).toBeLessThan(3136);
    s.run(R | J, 20);
    land(s, R);
    expect(s.feet().x).toBeLessThan(3136);
    const ev = s.run(A, 1).concat(s.run(0, 10), s.run(R, 30));
    expect(has(ev, 'barkBreak', 'root-knot')).toBe(true);
    expect(s.g.state.save.flags).toContain('wood-root-ladder');
  });

  it('on the rim past the root: the crown wick is a standing cut and its hawker leaves; its rhythm passes over the rim', () => {
    const r = play();
    r.g.state.save.opened.push('wood-hollow:root-knot');
    r.g.teleport(3100, RIM);
    const passes = r
      .run(0, 500)
      .filter((e) => e.type === 'enemyDive' && (e as { id?: string }).id === 'hawk-crown');
    expect(passes.length).toBeGreaterThanOrEqual(2);
    const s = play();
    s.g.state.save.opened.push('wood-hollow:root-knot');
    s.g.teleport(3164, RIM);
    s.run(R, 1);
    s.run(0, 2);
    const ev = s.run(A, 1).concat(s.run(0, 20));
    expect(has(ev, 'lureSnuff', 'wick-crown')).toBe(true);
    expect(has(ev, 'enemyDisperse', 'hawk-crown')).toBe(true);
  });

  it('the finale holds her for the whole cloud (540 f), then east to area 2; no way to the exit but through it', () => {
    const crown = (OAK.triggers ?? []).find((t) => t.id === 'crown');
    // The rim's full height: no jump carries her over it to the exit.
    expect(crown && [crown.y, crown.y + crown.h]).toEqual([0, RIM]);
    const s = play();
    s.g.state.save.opened.push('wood-hollow:root-knot');
    s.g.teleport(3320, RIM);
    s.run(0, 3);
    let ev = s.run(R, 30);
    const hold = ev.find((e) => e.type === 'storyHold') as { frames: number } | undefined;
    expect(hold?.frames).toBe(540);
    expect(s.g.state.save.flags).toContain('wood-crown');
    ev = s.run(R, 520);
    expect(s.g.state.room).toBe('wood-hollow');
    expect(has(ev, 'patchRest')).toBe(true);
    ev = s.run(R, 40);
    expect(s.g.state.save.flags).toContain('wood-crown-gone');
    for (let i = 0; i < 400 && s.g.state.room === 'wood-hollow'; i++) s.run(R);
    expect(s.g.state.room).toBe('wood-canopy');
  });

  it('a fade in the oak re-forms her at its nearest patch at or below her: P-ledge above the ledge, P3 below (never R8)', () => {
    const at = (x: number, y: number, patch?: { room: string; id: string }) => {
      const s = play();
      if (patch) s.g.state.save.patch = patch;
      s.g.teleport(x, y);
      s.g.state.player.faded = 2;
      s.run(0, 3);
      return { room: s.g.state.room, feet: s.feet() };
    };
    expect(at(2900, 1000, { room: 'wood-hawkers', id: 'p-dark' })).toEqual({
      room: 'wood-hollow',
      feet: { x: 2880, y: LEDGE },
    });
    expect(at(2400, BRIDGE)).toEqual({ room: 'wood-hollow', feet: { x: 2880, y: LEDGE } });
    expect(at(2700, 3000, { room: 'wood-hawkers', id: 'p-dark' })).toEqual({
      room: 'wood-hollow',
      feet: { x: 1280, y: FLOOR },
    });
  });

  it('no postgame lantern in the oak (round 4: one in view of the rim drew players off it): the lamps are the climb’s', () => {
    expect((OAK.lures ?? []).map((l) => l.id).sort()).toEqual([
      'wick-crown',
      'wick-firefly',
      'wick-foot',
      'wick-knot',
      'wick-rest',
    ]);
  });
});
