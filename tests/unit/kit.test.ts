import { describe, expect, it } from 'vitest';
import { createCamera, stepCamera } from '../../src/render/camera/index';
import { getRoom, parseScene } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';
import { progression, validateWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import {
  createState,
  cycleSine,
  hashState,
  linkWorld,
  lureAt,
  newSave,
  type Scene,
  step,
  withShortcuts,
} from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { flatScene, newSim, type Sim } from './helpers';

/** The level kit (memory/level-kit.md): thorns, seed-cases, rotten bark, flag gates, swinging lures, camera zones. */

const LAB = getRoom('lab-kit');
const D = ActionBit.down;
const A = ActionBit.attack;
const J = ActionBit.jump;
const R = ActionBit.right;

const feet = (s: Sim) => ({
  x: s.state.player.x + s.state.player.w / 2,
  y: s.state.player.y + s.state.player.h,
});
const of = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

/** Steps one frame with `input`, returning the events of that frame. */
function once(s: Sim, input: number): SimEvent[] {
  const from = s.events.length;
  step(s.state, input, s.tuning, s.scene, s.events);
  return s.events.slice(from);
}

/**
 * Falls (from wherever she is) and down-cuts each time her feet come within `lead` px of `y` while
 * falling, for at most `frames` frames. Returns every event.
 */
function pogoOnto(s: Sim, y: number, frames = 240, lead = 60): SimEvent[] {
  const out: SimEvent[] = [];
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    const p = s.state.player;
    const ready = p.vy > 0 && feet(s).y > y - lead && p.attack === 'none' && p.attackCd === 0;
    const input = ready && prev === 0 ? D | A : D;
    out.push(...once(s, input));
    prev = input & A;
  }
  return out;
}

describe('thorns', () => {
  it('a touch costs one light, holds her, and puts her back on her last safe ground with a moment of safety', () => {
    const s = newSim(LAB);
    s.place(560, 1600);
    s.run('.40');
    expect(s.state.player.safeX).toBe(560);
    const hp = s.state.player.hp;
    const ev: SimEvent[] = [];
    let safe = 0;
    for (let f = 0; f < 60 && of(ev, 'thornHit').length === 0; f++) {
      safe = s.state.player.safeX;
      ev.push(...once(s, R));
    }
    ev.push(...s.run('.40'));
    const hit = of(ev, 'thornHit')[0];
    expect(hit?.id).toBe('bed-a');
    expect(hit?.frames).toBe(defaultTuning.kit.thorns.holdFrames);
    const hurt = of(ev, 'hurt')[0];
    expect(hurt?.source).toEqual({ kind: 'thorns', id: 'bed-a' });
    expect(of(ev, 'fallReturn')[0]?.id).toBe('thorns:bed-a');
    expect(s.state.player.hp).toBe(hp - 1);
    // Back where she stood, safe for a while, and never in the thorns.
    expect(feet(s).x).toBe(safe);
    expect(feet(s).x + 20 + defaultTuning.kit.thorns.safeMargin).toBeLessThanOrEqual(700);
    expect(feet(s).y).toBe(1600);
    expect(s.state.player.invuln).toBeGreaterThan(0);
    expect(s.state.kit.hold).toBe(0);
  });

  it('standing close to a thorn bed is never safe ground', () => {
    const s = newSim(LAB);
    s.place(400, 1600);
    s.run('.40');
    s.place(640, 1600);
    s.run('.60');
    expect(s.state.player.safeX).toBe(400);
  });

  it('the last light taken by thorns is a fade, not a hold', () => {
    const s = newSim(LAB);
    s.place(560, 1600);
    s.state.player.hp = 1;
    const ev = s.run('R40');
    expect(of(ev, 'thornHit')[0]?.frames).toBe(0);
    expect(of(ev, 'fade')).toHaveLength(1);
    expect(s.state.caught).toBeNull();
  });

  it('a down cut on thorns is a pogo: she bounces and is not hurt', () => {
    const s = newSim(LAB);
    s.place(900, 1380);
    const ev = pogoOnto(s, 1564, 40);
    const hit = of(ev, 'slashHit').find((e) => e.target.kind === 'thorns');
    expect(hit?.pogo).toBe(true);
    expect(of(ev, 'thornHit')).toHaveLength(0);
    expect(of(ev, 'hurt')).toHaveLength(0);
    expect(s.state.player.hp).toBe(s.state.player.hpMax);
  });
});

describe('seed-cases', () => {
  it('a down cut bounces her (the pogo, with its refills), and it never breaks', () => {
    const s = newSim(LAB);
    s.place(1892, 1450);
    s.state.player.airDash = 0;
    s.state.player.dj = 0;
    const ev = pogoOnto(s, 1572, 30);
    const hit = of(ev, 'slashHit').find((e) => e.target.kind === 'seedCase');
    expect(hit?.target.id).toBe('seed-1');
    expect(hit?.hitstop).toBe(defaultTuning.enemies.pogoHitstopFrames);
    expect(s.state.player.dj).toBeGreaterThan(0);
    expect(s.state.player.airDash).toBeGreaterThan(0);
    // It bounced her up: she is above where it caught her.
    expect(feet(s).y).toBeLessThan(1572);
  });

  it('crosses the seed-case gap under the roof: hop, pogo, pogo, land', () => {
    const s = newSim(LAB);
    s.place(1660, 1600);
    s.run('.20');
    const ev: SimEvent[] = [];
    let prev = 0;
    for (let f = 0; f < 200 && !(s.state.player.grounded && f > 10); f++) {
      const p = s.state.player;
      const ready = p.vy > 0 && feet(s).y > 1520 && p.attack === 'none' && p.attackCd === 0;
      const input = f < 8 ? R | J : ready && prev === 0 ? R | D | A : R;
      ev.push(...once(s, input));
      prev = input & A;
    }
    const seeds = of(ev, 'slashHit')
      .filter((e) => e.target.kind === 'seedCase')
      .map((e) => e.target.id);
    expect(seeds).toContain('seed-1');
    expect(feet(s).y).toBe(1600);
    expect(feet(s).x).toBeGreaterThan(2340);
  });

  it('a forward cut clangs: held, thrown back, nothing breaks', () => {
    const scene: Scene = { ...flatScene(), seedCases: [{ id: 'sc', x: 2100, y: 770 }] };
    const s = newSim(scene);
    s.place(2040, 800);
    s.run('.5');
    const ev = s.run('A1 .10');
    const clang = of(ev, 'kitClang')[0];
    expect(clang?.id).toBe('sc');
    expect(clang?.hitstop).toBe(defaultTuning.kit.seedCase.clangHitstop);
    expect(of(ev, 'slashHit')).toHaveLength(0);
    expect(feet(s).x).toBeLessThan(2040);
  });
});

describe('rotten bark', () => {
  it('three cuts break a wall for good: the save keeps it and the solid is gone', () => {
    const s = newSim(LAB);
    s.place(2856, 1600);
    s.run('.5');
    const ev = s.run('A1 .30 A1 .30 A1 .30');
    expect(of(ev, 'barkHit').map((e) => e.hpLeft)).toEqual([2, 1]);
    expect(of(ev, 'barkBreak')[0]?.id).toBe('wall-c');
    expect(of(ev, 'slashHit').filter((e) => e.target.kind === 'bark')).toHaveLength(3);
    expect(s.state.save.opened).toContain('lab-kit:wall-c');
    s.run('R60');
    expect(feet(s).x).toBeGreaterThan(2964);
    // Broken stays broken: a new run with this save finds it gone.
    const st = createState(1, s.tuning, LAB, [], undefined, s.state.save);
    expect(st.kit.bark[0]).toBe(0);
    expect(withShortcuts(LAB, st.save).solids.some((q) => q.kit === 'bark' && q.x === 2900)).toBe(false);
  });

  it('before it breaks it is a wall', () => {
    const s = newSim(LAB);
    s.place(2800, 1600);
    s.run('R60');
    expect(feet(s).x).toBeLessThanOrEqual(2880);
  });

  it('a floor panel ignores forward cuts and breaks to pogos; the breaking cut drops her through', () => {
    const s = newSim(LAB);
    s.place(3464, 1600);
    s.run('.5');
    expect(of(s.run('A1 .30'), 'barkHit')).toHaveLength(0);
    s.place(3464, 1440);
    const ev = pogoOnto(s, 1600, 260);
    expect(of(ev, 'barkHit').map((e) => e.hpLeft)).toEqual([2, 1]);
    expect(of(ev, 'barkBreak')[0]?.id).toBe('floor-c');
    // Down in the pocket under it.
    expect(feet(s).y).toBe(1856);
  });
});

describe('flag gates and triggers', () => {
  it('a gate is a wall until its flag is set; a trigger sets it and the gate opens', () => {
    const s = newSim(LAB);
    s.place(4500, 1600);
    s.run('R60');
    expect(feet(s).x).toBeLessThanOrEqual(4680);
    s.place(4100, 1600);
    const ev = s.run('R120');
    expect(of(ev, 'flagSet')[0]).toMatchObject({ flag: 'lab-kit-silk', by: 'plate-d' });
    expect(of(ev, 'gateOpen')[0]?.id).toBe('silk-d');
    expect(s.state.save.flags).toContain('lab-kit-silk');
    expect(feet(s).x).toBeGreaterThan(4764);
  });

  it('a flag set some other way (the boss, the debug API) opens the gate too', () => {
    const s = newSim(LAB);
    s.state.save.flags.push('lab-kit-silk');
    const ev = s.run('.1');
    expect(of(ev, 'gateOpen')[0]?.id).toBe('silk-d');
    expect(withShortcuts(LAB, s.state.save).solids.some((q) => q.kit === 'gate')).toBe(false);
  });

  it('the grate (a shortcut that opens from below) opens to her head from under it, and holds from above', () => {
    const s = newSim(LAB);
    s.place(5392, 900);
    s.run('.20 D20');
    expect(s.state.save.opened).not.toContain('lab-kit:grate-d');
    expect(feet(s).y).toBe(900);
    s.place(5392, 1200);
    const ev = s.run('J12 .30');
    expect(of(ev, 'shortcutOpen')[0]?.id).toBe('grate-d');
  });
});

describe('swinging lures', () => {
  it('the sine is within 0.2% of the real one', () => {
    for (let u = 0; u < 1; u += 0.01)
      expect(Math.abs(cycleSine(u) - Math.sin(2 * Math.PI * u))).toBeLessThan(0.002);
  });

  it('a swinging flame moves along its arc, a pendulum: rest, out to reach (risen), rest, the other side', () => {
    const t = cloneTuning(defaultTuning);
    const l = LAB.lures?.find((q) => q.id === 'swing-lantern');
    if (!l?.swing) throw new Error('no swing-lantern');
    const { length: L, reach = 0, period = 0 } = l.swing;
    const rise = L - Math.sqrt(L * L - reach * reach);
    expect(lureAt(l, 0, t)).toEqual({ x: l.x, y: l.y });
    const q = lureAt(l, period / 4, t);
    expect(q.x).toBeCloseTo(l.x + reach, 6);
    expect(q.y).toBeCloseTo(l.y - rise, 6);
    expect(lureAt(l, period / 2, t).x).toBeCloseTo(l.x, 6);
    expect(lureAt(l, (3 * period) / 4, t).x).toBeCloseTo(l.x - reach, 6);
  });

  it('its core goes with the flame: she is caught where the flame is, not where it hangs at rest', () => {
    const s = newSim(LAB);
    const l = LAB.lures?.find((q) => q.id === 'swing-lantern');
    if (!l?.swing) throw new Error('no swing-lantern');
    const quarter = (l.swing.period ?? 0) / 4;
    s.state.frame = Math.round(quarter);
    const f = lureAt(l, s.state.frame, s.tuning);
    s.place(f.x, f.y + 40);
    const ev = once(s, 0);
    const caught = of(ev, 'lureCaught')[0];
    expect(caught?.id).toBe('swing-lantern');
    expect(caught?.x).toBeCloseTo(f.x, 6);
    expect(Math.abs((caught?.x ?? 0) - l.x)).toBeGreaterThan(200);
  });

  it('a run with swinging lures replays exactly', () => {
    const go = () => {
      const s = newSim(LAB);
      s.place(8800, 1600);
      s.run('R30 R+J20 R40 J1 .1 J1 .1 J1 .20 R30');
      return hashState(s.state);
    };
    expect(go()).toBe(go());
  });
});

describe('camera zones', () => {
  it('inside the arena zone the view eases to the fitting zoom and locks on the arena; outside it eases back', () => {
    const s = newSim(LAB);
    s.place(7552, 1600);
    const cam = createCamera(s.state, LAB);
    // Created inside: it starts settled.
    const fit = Math.min(1920 / 2176, 1080 / 1280);
    expect(cam.zoom).toBeCloseTo(fit, 6);
    for (let i = 0; i < 200; i++) stepCamera(cam, s.state, LAB);
    expect(cam.zone).toBe('arena-e');
    expect(cam.x + cam.vw / cam.zoom / 2).toBeCloseTo(6464 + 2176 / 2, 0);
    expect(cam.y + cam.vh / cam.zoom / 2).toBeCloseTo(384 + 1280 / 2, 0);
    // The whole arena is on screen.
    expect(cam.x).toBeLessThanOrEqual(6464);
    expect(cam.x + cam.vw / cam.zoom).toBeGreaterThanOrEqual(6464 + 2176);
    // Out of it: zoom 1 again, no jump on the way (each frame moves the zoom a little).
    s.place(5800, 1600);
    let last = cam.zoom;
    let biggest = 0;
    for (let i = 0; i < 400; i++) {
      stepCamera(cam, s.state, LAB);
      biggest = Math.max(biggest, Math.abs(cam.zoom - last));
      last = cam.zoom;
    }
    expect(cam.zone).toBe('');
    expect(cam.zoom).toBe(1);
    expect(cam.ox).toBe(0);
    expect(biggest).toBeLessThan(0.01);
  });

  it('a wider window sees more around the locked arena, still centred on it', () => {
    const s = newSim(LAB);
    s.place(7552, 1600);
    const cam = createCamera(s.state, LAB, undefined, 2560, 1080);
    for (let i = 0; i < 100; i++) stepCamera(cam, s.state, LAB);
    expect(cam.x + cam.vw / cam.zoom / 2).toBeCloseTo(7552, 0);
    expect(cam.vw / cam.zoom).toBeGreaterThan(2176);
  });
});

describe('the world check and flag gates', () => {
  const room = (over: Partial<Room> & { id: string }): Room =>
    parseScene({
      width: 1000,
      height: 1000,
      spawn: { x: 200, y: 800 },
      solids: [{ tag: 'ground', x: 0, y: 800, w: 1000, h: 200 }],
      oneWays: [],
      ...over,
    });
  const world = (withTrigger: boolean) =>
    linkWorld('fa', [
      {
        id: 'fa',
        x: 0,
        y: 0,
        placed: true,
        scene: room({
          id: 'fa',
          exits: [{ id: 'e', edge: 'e', from: 544, to: 800 }],
          patches: [{ id: 'pa', x: 400, y: 800 }],
          ...(withTrigger
            ? { triggers: [{ id: 'lever', x: 600, y: 700, w: 64, h: 100, sets: 'fb-open' }] }
            : {}),
        }),
      },
      {
        id: 'fb',
        x: 1000,
        y: 0,
        placed: true,
        scene: room({
          id: 'fb',
          exits: [{ id: 'w', edge: 'w', from: 544, to: 800 }],
          patches: [{ id: 'pb', x: 800, y: 800 }],
          gates: [{ id: 'curtain', x: 500, y: 544, w: 64, h: 256, flag: 'fb-open' }],
          routes: [{ from: 'w', to: 'pb', flags: ['fb-open'] }],
        }),
      },
    ]);

  it('a route that needs a flag is passable once a trigger that sets it is reached', () => {
    expect(progression(world(true)).reached.has('fb:pb')).toBe(true);
    expect(validateWorld(world(true))).toEqual([]);
  });

  it('a flag nothing in the world sets is reported, and what is behind it is not reached', () => {
    const w = world(false);
    expect(progression(w).reached.has('fb:pb')).toBe(false);
    expect(validateWorld(w).some((m) => m.includes('needs flag "fb-open"'))).toBe(true);
  });
});

describe('room data', () => {
  const base = {
    id: 'bad',
    width: 2000,
    height: 1000,
    spawn: { x: 200, y: 800 },
    solids: [{ tag: 'ground', x: 0, y: 800, w: 2000, h: 200 }],
    oneWays: [],
  };
  it('rejects bark or a gate inside a solid, a seed-case in the ground, a lure that swings into a wall, twin ids', () => {
    expect(() => parseScene({ ...base, bark: [{ id: 'b', x: 900, y: 760, w: 64, h: 64 }] })).toThrow(
      /overlaps a solid/,
    );
    expect(() =>
      parseScene({ ...base, gates: [{ id: 'g', x: 900, y: 760, w: 64, h: 64, flag: 'f' }] }),
    ).toThrow(/overlaps a solid/);
    expect(() => parseScene({ ...base, seedCases: [{ id: 's', x: 900, y: 800 }] })).toThrow(/inside a solid/);
    expect(() =>
      parseScene({
        ...base,
        solids: [...base.solids, { tag: 'trunk', x: 1200, y: 0, w: 64, h: 800 }],
        lures: [{ id: 'l', kind: 'wick', x: 1000, y: 500, swing: { length: 300, reach: 200 } }],
      }),
    ).toThrow(/swings into a solid/);
    expect(() =>
      parseScene({
        ...base,
        thorns: [{ id: 'x', x: 900, y: 770, w: 64, h: 30 }],
        seedCases: [{ id: 'x', x: 1200, y: 500 }],
      }),
    ).toThrow(/two things/);
  });

  it('the lab parses and every kit piece in it is where the lab says', () => {
    const s = newSim(LAB);
    expect(s.state.kit.bark).toEqual([3, 3]);
    expect(s.state.kit.gates).toEqual([0]);
    const sv = newSave();
    expect(withShortcuts(LAB, sv).solids.filter((q) => q.kit !== undefined)).toHaveLength(3);
  });
});
