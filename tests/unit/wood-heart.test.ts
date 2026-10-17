import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { getRoom, WORLD } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';
import { GAME_WORLD } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { ActionBit } from '../../src/sim/input';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import type { World } from '../../src/sim/world';

/**
 * R7b `wood-heart`, the oak's heart, and the crown (docs/design/regions/wood-area1-director.md §5 "Act 4",
 * wood.md A7; memory/rooms.md "R7b"), plus the area-2 stub `wood-canopy` east of the crown. Each claim is
 * measured in the sim. Local coordinates: the hub's shaft comes in at the bottom, x 1152-1536; the rest
 * ledge y 2240; W-ff (1380, 1460) with the thorn band over it on the near (east) face; the knot bridge
 * y 1312; the far face's band 1408-1800; the rim y 576 with the root's knot, P5 and the crown trigger.
 */

const R = ActionBit.right;
const L = ActionBit.left;
const U = ActionBit.up;
const D = ActionBit.down;
const J = ActionBit.jump;
const A = ActionBit.attack;
const has = (ev: SimEvent[], type: string, id?: string) =>
  ev.some((e) => e.type === type && (id === undefined || (e as { id?: string }).id === id));

const HEART = getRoom('wood-heart');
const HEART_AT = WORLD.rooms.find((r) => r.id === 'wood-heart');
const LEDGE_Y = 2240;
const BRIDGE_Y = 1312;
const BAND_TOP = 1408;
const RIM_Y = 576;

/** The game's world: the hub's top exit `n` leads into R7b's `down`; R7b's `e` into the stub. */
function seamWorld(): World {
  return GAME_WORLD;
}

/** A game booted in `room` (R7b by default), every event kept; the glimpse already seen unless `glimpse` is false. */
function play(opts: { room?: string; abilities?: string[]; glimpse?: boolean; world?: World } = {}) {
  const t = cloneTuning(defaultTuning);
  const id = opts.room ?? 'wood-heart';
  const room = (opts.world?.rooms[id]?.scene as Room | undefined) ?? getRoom(id);
  const g = new Game(
    t,
    room,
    1,
    () => 0,
    opts.abilities ?? ['glide', 'wallJump'],
    opts.world ? { world: opts.world } : undefined,
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

/** Beats free of a lure's hold: presses of jump, `dir` held. */
function beatFree(s: Play, dir = 0): SimEvent[] {
  const out: SimEvent[] = [];
  for (let k = 0; k < 8 && s.g.state.player.lure >= 0; k++) out.push(...s.run(dir | J, 1), ...s.run(dir, 9));
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
  s.g.teleport(1350, BRIDGE_Y);
  let ev = s.run(0, 3);
  for (let i = 0; i < 30 && s.g.state.player.grounded; i++) ev = ev.concat(s.run(R));
  return ev.concat(s.run(0, k), s.run(D | A, 1), s.run(D, 6));
}

describe('R7b wood-heart: placement and the seam', () => {
  it('sits on the hub with the shaft carried on, the stub east of the crown at the rim', () => {
    expect([HEART.width, HEART.height]).toEqual([2560, 2816]);
    const down = HEART.exits?.find((e) => e.id === 'down');
    // World x 30144-30528: the hub's shaft (hub-local 2560-2944).
    expect(HEART_AT).toEqual({ id: 'wood-heart', x: 28992, y: 9024 - HEART.height });
    expect(down && [28992 + down.from, 28992 + down.to]).toEqual([30144, 30528]);
    const w = seamWorld();
    expect(w.links['wood-heart#down']).toEqual({ to: 'wood-hollow', exit: 'n' });
    expect(w.links['wood-hollow#n']).toEqual({ to: 'wood-heart', exit: 'down' });
    expect(w.links['wood-heart#e']).toEqual({ to: 'wood-canopy', exit: 'w' });
    expect(getRoom('wood-canopy').title).toMatch(/^STUB/);
  });

  it('the climb up the hub shaft carries on into the heart and up to the rest ledge; without claws it is a lock', () => {
    const w = seamWorld();
    const s = play({ room: 'wood-hollow', world: w });
    s.g.teleport(2900, 1024);
    climb(s, 1, () => s.g.state.room === 'wood-heart' && s.feet().y < 2600, 2400, 14);
    expect(s.g.state.room).toBe('wood-heart');
    // On up the east face; across to the ledge's lip.
    expect(s.feet().x).toBeGreaterThan(1152);
    expect(s.feet().x).toBeLessThan(1536);
    const no = play({ room: 'wood-hollow', world: w, abilities: ['glide'] });
    no.g.teleport(2900, 1024);
    climb(no, 1, () => no.g.state.room !== 'wood-hollow', 600, 14);
    expect(no.g.state.room).toBe('wood-hollow');
  });

  it('a fall down the trunk drops through the seam into the hub and lands on the root mesh', () => {
    const s = play({ world: seamWorld(), glimpse: false });
    s.g.teleport(1344, BRIDGE_Y);
    s.run(0, 3);
    for (let i = 0; i < 20 && s.g.state.player.grounded; i++) s.run(R);
    let ev: SimEvent[] = [];
    for (let i = 0; i < 400 && !(s.g.state.room === 'wood-hollow' && s.g.state.player.grounded); i++)
      ev = ev.concat(s.run(0));
    expect(s.g.state.room).toBe('wood-hollow');
    expect(s.feet().y).toBe(1024);
    expect(has(ev, 'fallCatch')).toBe(false);
  });
});

describe('R7b lower third: the rest ledge, its wick and the dangler', () => {
  it('W-rest is a standing cut from either side of it, and the snuff sends the dangler away', () => {
    for (const [x, dir] of [
      [856, R],
      [1070, L],
    ] as const) {
      const s = play();
      s.g.teleport(x, LEDGE_Y);
      s.run(0, 3);
      s.run(dir, 1);
      const ev = s.run(A, 1).concat(s.run(0, 20));
      expect(has(ev, 'lureSnuff', 'wick-rest'), `from ${x}`).toBe(true);
      expect(has(ev, 'enemyDisperse', 'dang-knot'), `from ${x}`).toBe(true);
    }
  });

  it('standing on the cut spot she is bitten from the knot overhead; stepping back when its thread shows, never', () => {
    const s = play();
    s.g.teleport(1070, LEDGE_Y);
    s.run(L, 1);
    expect(has(s.run(0, 200), 'hurt')).toBe(true);
    for (const x of [856, 1070]) {
      const b = play();
      b.g.teleport(x, LEDGE_Y);
      b.run(0, 1);
      let ev: SimEvent[] = [];
      for (let i = 0; i < 200 && !has(ev, 'enemyWindup', 'dang-knot'); i++) ev = ev.concat(b.run(0));
      expect(has(ev, 'enemyWindup', 'dang-knot'), `notice at ${x}`).toBe(true);
      const away = x < 960 ? L : R;
      // Back off: east toward the lip; west, down the hole at the ledge's back.
      ev = b.run(away, x < 960 ? 16 : 13).concat(b.run(0, 120));
      expect(has(ev, 'hurt'), `step back from ${x}`).toBe(false);
    }
  });
});

describe('R7b middle third: W-ff, the firefly’s glow-cap', () => {
  it('burns only once the glimpse has been seen', () => {
    const before = play({ glimpse: false });
    before.run(0, 2);
    const i = HEART.lures?.findIndex((l) => l.id === 'wick-firefly') ?? -1;
    expect(before.g.state.lures.out[i]).toBeGreaterThan(0);
    const after = play();
    after.run(0, 2);
    expect(after.g.state.lures.out[i]).toBe(0);
  });

  it('the near face leads into it: climbing up from the shaft she is caught', () => {
    const s = play();
    s.g.teleport(1500, 2700);
    climb(s, 1, () => s.g.state.player.lure >= 0 || s.feet().y < 1300);
    expect(s.lureIs('wick-firefly')).toBe(true);
  });

  it('beaten free up-left she is thrown across, over the thorn band, onto the bridge or the band’s top; up-right or nothing, the thorns', () => {
    const caught = (y0: number) => {
      const s = play();
      s.g.teleport(1500, y0);
      climb(s, 1, () => s.g.state.player.lure >= 0 || s.feet().y < 1300);
      expect(s.lureIs('wick-firefly'), `from ${y0}`).toBe(true);
      return s;
    };
    // Eleven starts up the face: eleven places on the orbit at the catch.
    let bridge = 0;
    for (let y0 = 2600; y0 <= 2800; y0 += 20) {
      const s = caught(y0);
      const ev = beatFree(s, U | L).concat(land(s, L, 160));
      expect(has(ev, 'thornHit'), `from ${y0}`).toBe(false);
      expect([BRIDGE_Y, BAND_TOP], `from ${y0}`).toContain(s.feet().y);
      expect(s.feet().x).toBeLessThan(1376);
      if (s.feet().y === BRIDGE_Y) bridge++;
    }
    // Measured: 4 of 11 on the bridge, the rest on the band's top (a jump from the bridge).
    expect(bridge).toBeGreaterThanOrEqual(2);
    for (const dir of [U | R, 0]) {
      const s = caught(2700);
      expect(has(beatFree(s, dir).concat(land(s, dir, 160)), 'thornHit'), `dir ${dir}`).toBe(true);
    }
  });

  it('from the bridge’s tip a walk-off down-cut puts it out and the pogo carries her to the near face over the thorns', () => {
    for (const k of [0, 2, 4, 6]) {
      const s = play();
      const ev = tipCut(s, k);
      expect(has(ev, 'lureSnuff', 'wick-firefly'), `cut at ${k}`).toBe(true);
      const after: SimEvent[] = [];
      for (let i = 0; i < 60 && s.g.state.player.wallDir !== 1; i++) after.push(...s.run(R));
      expect(s.g.state.player.wallDir, `cut at ${k}`).toBe(1);
      expect(s.feet().y, `cut at ${k}`).toBeLessThan(1344);
      expect(has(after, 'thornHit')).toBe(false);
    }
  });

  it('with W-ff out the way is still there: a kick-glide from the near face reaches the band, the band its top, a jump the bridge', () => {
    for (const y of [1740, 1780, 1820]) {
      const s = play({ glimpse: false });
      s.g.teleport(1500, y);
      s.run(R, 8);
      expect(s.g.state.player.wallDir, `on the face at ${y}`).toBe(1);
      let reached = false;
      for (let i = 0; i < 150 && !reached && !s.g.state.player.grounded; i++) {
        s.run(L | J);
        reached = i > 10 && s.g.state.player.wallDir === -1;
      }
      expect(reached, `kick-glide from ${y}`).toBe(true);
      expect(s.feet().y).toBeGreaterThan(BAND_TOP);
      expect(s.feet().y).toBeLessThan(1800 + 40);
      climb(s, -1, () => s.g.state.player.grounded && s.feet().y <= BAND_TOP, 600);
      expect(s.feet().y).toBeLessThanOrEqual(BAND_TOP);
    }
    const b = play();
    b.g.teleport(660, BAND_TOP);
    b.run(0, 3);
    b.run(R | J, 14);
    land(b, R);
    expect(b.feet().y).toBe(BRIDGE_Y);
  });

  it('the dark way: the hole at the ledge’s back, the tunnel and the chimney to the band’s top; no lamp near; slower', () => {
    // From the rest ledge to the bridge, both ways. The hole is behind W-rest: she cuts it first (from the lip side).
    const dark = play();
    dark.g.teleport(1070, LEDGE_Y);
    dark.run(L, 1);
    expect(has(dark.run(A, 1).concat(dark.run(0, 20)), 'lureSnuff', 'wick-rest')).toBe(true);
    let ev: SimEvent[] = [];
    for (let i = 0; i < 120 && dark.feet().y <= LEDGE_Y; i++) ev = ev.concat(dark.run(L));
    ev = ev.concat(land(dark, L));
    expect(dark.feet().y).toBe(2688);
    for (let i = 0; i < 120 && dark.feet().x > 470; i++) ev = ev.concat(dark.run(L));
    ev = ev.concat(climb(dark, -1, () => dark.feet().y <= BAND_TOP - 20 && dark.g.state.player.vy > 0, 1200));
    ev = ev.concat(land(dark, R, 120));
    expect(dark.feet().y).toBe(BAND_TOP);
    expect(has(ev, 'lureCaught')).toBe(false);
    for (let i = 0; i < 60 && dark.feet().x < 690; i++) ev = ev.concat(dark.run(R));
    ev = ev.concat(dark.run(R | J, 14), land(dark, R));
    expect(dark.feet().y).toBe(BRIDGE_Y);
    const light = play();
    light.g.teleport(1070, LEDGE_Y);
    light.run(L, 1);
    light.run(A, 1);
    light.run(0, 20);
    for (let i = 0; i < 60 && light.feet().x < 1150; i++) light.run(R);
    light.run(R | J, 20);
    climb(light, 1, () => light.g.state.player.lure >= 0, 600);
    beatFree(light, U | L);
    land(light, L, 160);
    if (light.feet().y === BAND_TOP) {
      for (let i = 0; i < 60 && light.feet().x < 690; i++) light.run(R);
      light.run(R | J, 14);
      land(light, R);
    }
    expect(light.feet().y).toBe(BRIDGE_Y);
    expect(dark.g.state.frame).toBeGreaterThan(light.g.state.frame + 30);
  });

  it('the bark knot: three cuts from the band’s top, W-knot behind it a standing cut from the doorway', () => {
    const s = play();
    s.g.teleport(420, BAND_TOP);
    s.run(L, 6);
    let ev: SimEvent[] = [];
    for (let k = 0; k < 3; k++) ev = ev.concat(s.run(A, 1), s.run(0, 24));
    expect(has(ev, 'barkBreak', 'bark-knot')).toBe(true);
    for (let i = 0; i < 40 && s.feet().x > 312; i++) s.run(L);
    s.run(0, 4);
    ev = s.run(A, 1).concat(s.run(0, 20));
    expect(has(ev, 'lureSnuff', 'wick-knot')).toBe(true);
    expect(has(ev, 'lureCaught')).toBe(false);
  });
});

describe('R7b upper third: the crown wick and its hawker', () => {
  /** From the bridge (W-ff snuffed on the way) across to the near face over the thorns. */
  function toUpperFace(): Play {
    const s = play();
    tipCut(s, 2);
    for (let i = 0; i < 60 && s.g.state.player.wallDir !== 1; i++) s.run(R);
    return s;
  }

  it('the hawker sees her on the face; the top of the climb is in the crown wick’s grip', () => {
    const s = toUpperFace();
    const ev = climb(
      s,
      1,
      () => s.g.state.player.lure >= 0 || (s.g.state.player.grounded && s.feet().y <= RIM_Y),
      900,
    );
    expect(has(ev, 'enemyAware', 'hawk-crown')).toBe(true);
    expect(s.lureIs('wick-crown')).toBe(true);
  });

  it('caught, it dives at the orbit: left in the grip she is struck; beaten free up-right at once she is thrown onto the rim', () => {
    const held = toUpperFace();
    climb(held, 1, () => held.g.state.player.lure >= 0, 900);
    expect(has(held.run(0, 200), 'hurt')).toBe(true);
    const quick = toUpperFace();
    climb(quick, 1, () => quick.g.state.player.lure >= 0, 900);
    const ev = beatFree(quick, U | R).concat(land(quick, R, 120));
    expect(has(ev, 'hurt')).toBe(false);
    expect(quick.feet().y).toBe(RIM_Y);
    expect(quick.feet().x).toBeGreaterThan(1536);
  });

  it('from the rim’s lip a standing cut puts the crown wick out and the hawker leaves', () => {
    const s = play();
    s.g.teleport(1556, RIM_Y);
    s.run(L, 1);
    s.run(0, 2);
    const ev = s.run(A, 1).concat(s.run(0, 20));
    expect(has(ev, 'lureSnuff', 'wick-crown')).toBe(true);
    expect(has(ev, 'enemyDisperse', 'hawk-crown')).toBe(true);
  });
});

describe('the crown: the root, P5, the cloud, the way on', () => {
  it('the root’s knot bars the rim until it is cut; one cut, and Tatter’s root falls (wood-root-ladder)', () => {
    const s = play();
    s.g.teleport(1556, RIM_Y);
    s.run(0, 3);
    s.run(R, 60);
    expect(s.feet().x).toBeLessThan(1600);
    s.run(R | J, 20);
    land(s, R);
    expect(s.feet().x).toBeLessThan(1600);
    const ev = s.run(A, 1).concat(s.run(0, 10), s.run(R, 30));
    expect(has(ev, 'barkBreak', 'root-knot')).toBe(true);
    expect(s.g.state.save.flags).toContain('wood-root-ladder');
  });

  it('the crown trigger holds the look-out (storyHold 150), she rests at P5, then east along the canopy to area 2', () => {
    const s = play({ world: seamWorld() });
    s.g.state.save.opened.push('wood-heart:root-knot');
    s.g.teleport(1700, RIM_Y);
    s.run(0, 3);
    let ev = s.run(R, 30);
    const hold = ev.find((e) => e.type === 'storyHold') as { frames: number } | undefined;
    expect(hold?.frames).toBe(150);
    ev = ev.concat(s.run(R, 200));
    expect(s.g.state.save.flags).toContain('wood-crown');
    expect(has(ev, 'patchRest')).toBe(true);
    expect(s.g.state.save.patch).toEqual({ room: 'wood-heart', id: 'p5' });
    for (let i = 0; i < 400 && s.g.state.room === 'wood-heart'; i++) s.run(R);
    expect(s.g.state.room).toBe('wood-canopy');
  });

  it('the crown lantern (postgame) never pulls on the way up: every critical-path point is out of its field', () => {
    const lantern = HEART.lures?.find((l) => l.id === 'lantern-crown');
    expect(lantern).toBeDefined();
    const radius = defaultTuning.lures.kinds.lantern.radius;
    // The lines walked: the near face, the bridge, the band's top, the rim to the exit.
    const pts: [number, number][] = [];
    for (let y = RIM_Y; y <= 2816; y += 32) pts.push([1516, y - 40]);
    for (let x = 832; x <= 1376; x += 32) pts.push([x, BRIDGE_Y - 40]);
    for (let x = 384; x <= 704; x += 32) pts.push([x, BAND_TOP - 40]);
    for (let x = 1536; x <= 2560; x += 32) pts.push([x, RIM_Y - 40]);
    const lx = lantern?.x ?? 0;
    const ly = lantern?.y ?? 0;
    for (const [x, y] of pts) expect(Math.hypot(x - lx, y - ly), `${x},${y}`).toBeGreaterThan(radius + 60);
  });
});
