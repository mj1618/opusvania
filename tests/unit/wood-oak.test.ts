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
 * rungs at 3264 and 2752); the rest ledge y 2240 (P-ledge, W-rest over the column); W-ff (2788, 1460) over the
 * glow-cap ledge (1800), the thorn band 1404-1544 on the near face; the knot bridge y 1312 (from the band's top
 * to its tip at 2784); the rim y 576 with the root's knot, P5, the finale trigger and the gate.
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
const CAP_LEDGE = 1760;
const BRIDGE = 1312;
const RIM = 576;
const S0 = 2560;
const S1 = 2944;

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
  s.g.teleport(2760, BRIDGE);
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

  it('with the claws the climb from the floor to the crown never leaves the room; without them the walls slide', () => {
    const s = play();
    s.g.teleport(2700, FLOOR);
    // Up the column's west face to the rest ledge (no room change on the way).
    let ev = climb(s, -1, () => s.g.state.player.grounded && s.feet().y <= LEDGE, 1500, 14);
    expect(s.feet().y).toBe(LEDGE);
    // Over to P-ledge's buttress and up the near face into W-ff's grip.
    for (let i = 0; i < 80 && s.feet().x < 2860; i++) ev = ev.concat(s.run(R | (i < 20 ? J : 0)));
    ev = ev.concat(
      land(s, R),
      climb(s, 1, () => s.g.state.player.lure >= 0, 900),
    );
    expect(has(ev, 'roomExit')).toBe(false);
    expect(s.lureIs('wick-firefly')).toBe(true);
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
      [2924, 1200],
      [2924, 1000],
      [2924, 700],
      [2770, BRIDGE + 30],
    ];
    for (const [x, y] of drops) {
      const s = play({ glimpse: false });
      s.g.teleport(x, y);
      s.run(0, 1);
      const y0 = s.feet().y;
      for (let i = 0; i < 300 && !s.g.state.player.grounded; i++) s.run(0);
      expect(s.g.state.player.grounded, `${x},${y}`).toBe(true);
      expect(s.feet().y - y0, `${x},${y} -> ${s.feet().y}`).toBeLessThanOrEqual(620);
    }
  });
});

describe('the hollow at the foot of the oak', () => {
  it('the glimpse is a held beat of 180 at P3, and the firefly hangs its glow-cap where W-ff burns, in the room', () => {
    const glimpse = (OAK.triggers ?? []).find((t) => t.id === 'glimpse');
    expect(glimpse?.hold).toBe(180);
    const path = OAK.marks?.stage?.glimpse?.path ?? [];
    const wff = (OAK.lures ?? []).find((l) => l.id === 'wick-firefly');
    expect(path[path.length - 1]).toEqual([wff?.x, wff?.y]);
    expect(OAK.marks?.tatter?.want).toEqual([wff?.x, wff?.y]);
    const s = play({ glimpse: false });
    s.g.teleport(1500, FLOOR);
    s.run(0, 3);
    const ev = s.run(L, 30);
    expect(ev.find((e) => e.type === 'storyHold')).toMatchObject({ id: 'glimpse', frames: 180 });
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

  it('the glow-cap ledge stands under it out of its pull; a jump up from it is caught', () => {
    for (const x of [2730, 2788, 2846]) {
      const s = play();
      s.g.teleport(x, CAP_LEDGE);
      expect(has(s.run(0, 120), 'lureCaught')).toBe(false);
      expect(s.feet()).toEqual({ x, y: CAP_LEDGE });
      s.run(J, 10);
      for (let i = 0; i < 40 && s.g.state.player.lure < 0; i++) s.run(0);
      expect(s.lureIs('wick-firefly'), `from ${x}`).toBe(true);
    }
  });

  it('beaten free up-left she is thrown over the thorn band onto the knot bridge (>= 90%); straight right, the thorns', () => {
    let bridge = 0;
    let n = 0;
    for (const x of [2730, 2788, 2846]) {
      for (const gap of [6, 9, 12, 15]) {
        for (const wait of [0, 7, 14]) {
          const s = play();
          s.g.teleport(x, CAP_LEDGE);
          s.run(0, 2);
          s.run(J, 10);
          for (let i = 0; i < 40 && s.g.state.player.lure < 0; i++) s.run(0);
          s.run(0, wait);
          const ev = beatFree(s, U | L, gap).concat(land(s, L, 160));
          n++;
          expect(has(ev, 'thornHit'), `x ${x} gap ${gap} wait ${wait}`).toBe(false);
          if (s.feet().y === BRIDGE) bridge++;
        }
      }
    }
    expect(bridge / n).toBeGreaterThanOrEqual(0.9);
    const ur = play();
    ur.g.teleport(2788, CAP_LEDGE);
    ur.run(J, 10);
    for (let i = 0; i < 40 && ur.g.state.player.lure < 0; i++) ur.run(0);
    // Straight across (right): into the thorn band. (Up-right reaches the near face over it.)
    expect(has(beatFree(ur, R).concat(land(ur, R, 160)), 'thornHit')).toBe(true);
  });

  it('from the bridge’s tip a walk-off down-cut puts it out; the pogo carries her over the thorns; a late cut lands on the glow-cap ledge', () => {
    for (const k of [0, 2, 4, 6]) {
      const s = play();
      expect(has(tipCut(s, k), 'lureSnuff', 'wick-firefly'), `cut at ${k}`).toBe(true);
      const after: SimEvent[] = [];
      for (let i = 0; i < 60 && s.g.state.player.wallDir !== 1 && !s.g.state.player.grounded; i++)
        after.push(...s.run(R));
      expect(s.feet().y, `cut at ${k}`).toBeLessThan(1404);
      expect(has(after, 'thornHit')).toBe(false);
    }
    // A miss: no cut at all. She is caught (thrown again) or lands on the glow-cap ledge, never on the thorns.
    const m = play({ glimpse: false });
    m.g.teleport(2760, BRIDGE);
    m.run(0, 3);
    const ev = m.run(R, 8).concat(land(m, 0, 120));
    expect(has(ev, 'thornHit')).toBe(false);
    expect(m.feet().y).toBe(CAP_LEDGE);
  });

  it('with W-ff out, a kick-glide from the near face reaches the far band; the band’s top is the bridge', () => {
    for (const y of [1740, 1780, 1820]) {
      const s = play({ glimpse: false });
      s.g.teleport(2900, y);
      s.run(R, 8);
      expect(s.g.state.player.wallDir, `on the face at ${y}`).toBe(1);
      let reached = false;
      for (let i = 0; i < 150 && !reached && !s.g.state.player.grounded; i++) {
        s.run(L | J);
        reached = i > 10 && s.g.state.player.wallDir === -1;
      }
      expect(reached, `kick-glide from ${y}`).toBe(true);
      climb(s, -1, () => s.g.state.player.grounded && s.feet().y <= BRIDGE, 600);
      expect(s.feet().y).toBe(BRIDGE);
    }
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
    light.g.teleport(2788, CAP_LEDGE);
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

describe('the top of the trunk: the crown wick and its hawker', () => {
  /** From the bridge (W-ff snuffed on the way) across to the near face over the thorns. */
  function toUpperFace(): Play {
    const s = play();
    tipCut(s, 2);
    for (let i = 0; i < 60 && s.g.state.player.wallDir !== 1 && !s.g.state.player.grounded; i++) s.run(R);
    return s;
  }

  it('on a rhythm the hawker swoops through the crown wick’s orbit; the top of the climb is in its grip', () => {
    const r = play();
    r.g.teleport(2780, 912);
    const passes = r
      .run(0, 500)
      .filter((e) => e.type === 'enemyDive' && (e as { id?: string }).id === 'hawk-crown');
    expect(passes.length).toBeGreaterThanOrEqual(2);
    const s = toUpperFace();
    const ev = climb(
      s,
      1,
      () => s.g.state.player.lure >= 0 || (s.g.state.player.grounded && s.feet().y <= RIM),
      900,
    );
    expect(has(ev, 'lureCaught', 'wick-crown')).toBe(true);
  });

  it('caught and beaten free up-right she is thrown onto the rim; caught as it passes, struck down onto a ledge under the orbit', () => {
    const ends = new Set<number>();
    for (let w = 0; w <= 240; w += 20) {
      const q = toUpperFace();
      q.run(R, w);
      climb(q, 1, () => q.g.state.player.lure >= 0, 600);
      beatFree(q, U | R);
      land(q, R, 200);
      ends.add(q.feet().y);
    }
    // Measured: 10 of 13 timings on the rim; the rest struck straight down onto a ledge under the orbit (1080).
    expect(ends.has(RIM)).toBe(true);
    for (const y of ends) expect([RIM, 912, 1080], `ended at ${y}`).toContain(y);
  });

  it('from the rim’s lip a standing cut puts the crown wick out and the hawker leaves', () => {
    const s = play();
    s.g.teleport(2964, RIM);
    s.run(L, 1);
    s.run(0, 2);
    const ev = s.run(A, 1).concat(s.run(0, 20));
    expect(has(ev, 'lureSnuff', 'wick-crown')).toBe(true);
    expect(has(ev, 'enemyDisperse', 'hawk-crown')).toBe(true);
  });
});

describe('the crown: the root, P5, the cloud, the gate', () => {
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

  it('the finale holds her for the whole cloud (540 f), the gate stays shut till it has gone, then east to area 2', () => {
    const s = play();
    s.g.state.save.opened.push('wood-hollow:root-knot');
    s.g.teleport(3240, RIM);
    s.run(0, 3);
    let ev = s.run(R, 30);
    const hold = ev.find((e) => e.type === 'storyHold') as { frames: number } | undefined;
    expect(hold?.frames).toBe(540);
    expect(s.g.state.save.flags).toContain('wood-crown');
    expect(s.g.state.save.flags).not.toContain('wood-crown-gone');
    ev = s.run(R, 520);
    expect(s.g.state.room).toBe('wood-hollow');
    expect(s.g.state.save.flags).not.toContain('wood-crown-gone');
    expect(has(ev, 'patchRest')).toBe(true);
    ev = s.run(R, 40);
    expect(s.g.state.save.flags).toContain('wood-crown-gone');
    for (let i = 0; i < 400 && s.g.state.room === 'wood-hollow'; i++) s.run(R);
    expect(s.g.state.room).toBe('wood-canopy');
    // Before the cloud the gate holds even a runner who skipped the hold (a flag-less save).
    const g = play();
    g.g.teleport(3600, RIM);
    g.run(R, 120);
    expect(g.g.state.room).toBe('wood-hollow');
    expect(g.feet().x).toBeLessThan(3712);
  });

  it('a fade anywhere in the oak re-forms her in the oak: at her patch here, else at P3 (never in R8)', () => {
    // Her patch in R8 (rested there), then a fade high in the trunk: P3.
    const s = play();
    s.g.state.save.patch = { room: 'wood-hawkers', id: 'p-dark' };
    s.g.teleport(2900, 1000);
    s.g.state.player.faded = 2;
    s.run(0, 3);
    expect(s.g.state.room).toBe('wood-hollow');
    expect(s.feet()).toEqual({ x: 1280, y: FLOOR });
    // Rested at P-ledge: there.
    const r = play();
    r.g.state.save.patch = { room: 'wood-hollow', id: 'p-ledge' };
    r.g.teleport(2900, 1000);
    r.g.state.player.faded = 2;
    r.run(0, 3);
    expect(r.feet()).toEqual({ x: 2880, y: LEDGE });
  });

  it('the crown lantern (postgame) never pulls on the way up: every critical-path point is out of its field', () => {
    const lantern = OAK.lures?.find((l) => l.id === 'lantern-crown');
    expect(lantern).toBeDefined();
    const radius = defaultTuning.lures.kinds.lantern.radius;
    const pts: [number, number][] = [];
    for (let y = RIM; y <= FLOOR; y += 32) pts.push([S1 - 20, y - 40], [S0 + 20, y - 40]);
    for (let x = 1792; x <= 2784; x += 32) pts.push([x, BRIDGE - 40]);
    for (let x = S1; x <= 3840; x += 32) pts.push([x, RIM - 40]);
    for (const [x, y] of pts)
      expect(Math.hypot(x - (lantern?.x ?? 0), y - (lantern?.y ?? 0)), `${x},${y}`).toBeGreaterThan(
        radius + 60,
      );
  });
});
