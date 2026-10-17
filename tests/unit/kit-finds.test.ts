import { describe, expect, it } from 'vitest';
import { getRoom, parseScene } from '../../src/scene/index';
import type { Room } from '../../src/scene/room';
import { validateWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { linkWorld, newSave, type Scene, step, upgradeFlag, withUpgrades } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { defaultTuning } from '../../src/sim/tuning';
import { flatScene, newSim, type Sim } from './helpers';

/** Bounce caps and the finds (memory/level-kit.md): moth-stones, firefly signs, moonlit hollows, upgrades. */

const LAB = getRoom('lab-kit');
const J = ActionBit.jump;
const D = ActionBit.down;
const A = ActionBit.attack;
const R = ActionBit.right;
const of = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const feetY = (s: Sim) => s.state.player.y + s.state.player.h;

function once(s: Sim, input: number): SimEvent[] {
  const from = s.events.length;
  step(s.state, input, s.tuning, s.scene, s.events);
  return s.events.slice(from);
}

/** Stands her on cap `id` and returns the bounce's rise (px above the cap top at the apex) and the events. */
function bounce(id: string, input: number, frames = 90): { rise: number; ev: SimEvent[] } {
  const s = newSim(LAB);
  const c = LAB.caps?.find((q) => q.id === id);
  if (!c) throw new Error(id);
  s.place(c.x + c.w / 2, c.y);
  const ev: SimEvent[] = [];
  let top = c.y;
  for (let f = 0; f < frames; f++) {
    ev.push(...once(s, input));
    top = Math.min(top, feetY(s));
  }
  return { rise: c.y - top, ev };
}

describe('bounce caps', () => {
  const T = defaultTuning.kit.caps;
  for (const tier of ['small', 'mid', 'big'] as const) {
    it(`a ${tier} cap throws her its tier's height (${T.tiers[tier]} px)`, () => {
      const { rise, ev } = bounce(`cap-${tier}`, 0);
      expect(of(ev, 'capBounce')[0]).toMatchObject({ id: `cap-${tier}`, pogo: false, held: false });
      expect(Math.abs(rise - T.tiers[tier])).toBeLessThanOrEqual(12);
    });
  }

  it('jump held as she meets it throws her higher', () => {
    const plain = bounce('cap-mid', 0).rise;
    const held = bounce('cap-mid', J);
    expect(of(held.ev, 'capBounce')[0]?.held).toBe(true);
    expect(held.rise).toBeGreaterThanOrEqual(T.tiers.mid * T.heldScale - 12);
    expect(held.rise).toBeGreaterThan(plain + 50);
  });

  it('works with glide: off the big cap, jump held, the wings open on the way down', () => {
    const { ev } = bounce('cap-big', J, 120);
    expect(of(ev, 'glideStart').length).toBeGreaterThan(0);
  });

  it('a pogo off a cap throws her the cap’s height (held), not the pogo’s', () => {
    const s = newSim(LAB);
    s.place(11040, 1300);
    const ev: SimEvent[] = [];
    let prev = 0;
    let top = Infinity;
    let bounced = false;
    for (let f = 0; f < 60; f++) {
      const p = s.state.player;
      const ready = !bounced && p.vy > 0 && feetY(s) > 1470 && p.attack === 'none' && p.attackCd === 0;
      const input = ready && prev === 0 ? D | A : 0;
      const got = once(s, input);
      ev.push(...got);
      if (!bounced && of(got, 'capBounce').length > 0) {
        bounced = true;
        top = feetY(s);
      }
      if (bounced) top = Math.min(top, feetY(s));
      prev = input & A;
    }
    const b = of(ev, 'capBounce')[0];
    expect(b).toMatchObject({ id: 'cap-mid', pogo: true });
    expect(of(ev, 'slashHit').some((e) => e.target.kind === 'cap')).toBe(true);
    // Much higher than a pogo's 125.
    expect(1536 - top).toBeGreaterThan(400);
  });

  it('the big cap throws her (jump held) high enough to reach the ledge', () => {
    const s = newSim(LAB);
    const c = LAB.caps?.find((q) => q.id === 'cap-big');
    if (!c) throw new Error('cap-big');
    s.place(c.x + c.w / 2, c.y);
    let landed = false;
    // Jump held into the cap (the higher throw), then let go at the top and drift right onto the ledge.
    let up = true;
    for (let f = 0; f < 240 && !landed; f++) {
      if (f > 5 && s.state.player.vy > 0) up = false;
      once(s, up ? R | J : R);
      landed = s.state.player.grounded && feetY(s) === 1000;
    }
    expect(landed).toBe(true);
  });
});

describe('finds', () => {
  it('a moth-stone is read once on touch and remembered by the save', () => {
    const s = newSim(LAB);
    s.place(11860, 1000);
    const ev = s.run('.3');
    expect(of(ev, 'stoneRead')[0]).toMatchObject({ id: 'stone-g', area: 'wood-floor', room: 'lab-kit' });
    expect(s.state.save.taken).toContain('lab-kit:stone-g');
    expect(of(s.run('L10 R10'), 'stoneRead')).toHaveLength(0);
  });

  it('a firefly sign is read by standing still beside it, not by passing', () => {
    const s = newSim(LAB);
    s.place(12050, 1000);
    expect(of(s.run('R30'), 'signRead')).toHaveLength(0);
    s.place(12200, 1000);
    const ev = s.run(`.${defaultTuning.finds.signFrames + 5}`);
    expect(of(ev, 'signRead')[0]).toMatchObject({ id: 'sign-g', flag: 'lab-kit-sign', rhythm: '...-' });
    expect(s.state.save.flags).toContain('lab-kit-sign');
    expect(s.state.save.taken).toContain('lab-kit:sign-g');
  });

  it('a moonlit hollow grants its upgrade once, as a save flag', () => {
    const s = newSim(LAB);
    s.place(13250, 1600);
    const ev = s.run('.2');
    expect(of(ev, 'hollowGrant')[0]).toMatchObject({ id: 'hollow-h', upgrade: 'quickWings' });
    expect(s.state.save.flags).toContain(upgradeFlag('quickWings'));
    expect(of(s.run('.2'), 'hollowGrant')).toHaveLength(0);
  });

  it('upgrades are numbers: none owned = the same tuning; quick wings beats free in two', () => {
    const t = defaultTuning;
    expect(withUpgrades(t, newSave())).toBe(t);
    const sv = newSave();
    sv.flags.push(upgradeFlag('quickWings'), upgradeFlag('keenBlade'));
    const u = withUpgrades(t, sv);
    expect(u.lures.beats).toBe(t.upgrades.quickWings.beats);
    expect(u.lures.flameRadius).toBe(t.lures.flameRadius + t.upgrades.keenBlade.flameRadiusAdd);
    expect(t.lures.beats).toBe(3);

    const caughtThenBeat = (quick: boolean) => {
      const scene: Scene = { ...flatScene(), lures: [{ id: 'w', kind: 'wick', x: 2000, y: 560 }] };
      const s = newSim(scene);
      if (quick) s.state.save.flags.push(upgradeFlag('quickWings'));
      s.place(2000, 470);
      const ev: SimEvent[] = [];
      for (let f = 0; f < 40 && of(ev, 'lureCaught').length === 0; f++) ev.push(...once(s, 0));
      expect(of(ev, 'lureCaught')).toHaveLength(1);
      const after = s.run('J1 .8 J1 .8 J1 .8');
      return of(after, 'lureBeat').findIndex((e) => e.beats === e.of) + 1;
    };
    expect(caughtThenBeat(false)).toBe(3);
    expect(caughtThenBeat(true)).toBe(2);
  });
});

describe('the world check and finds', () => {
  const room = (over: Partial<Room> & { id: string }): Room =>
    parseScene({
      width: 1000,
      height: 1000,
      spawn: { x: 200, y: 800 },
      solids: [{ tag: 'ground', x: 0, y: 800, w: 1000, h: 200 }],
      oneWays: [],
      patches: [{ id: 'p', x: 400, y: 800 }],
      ...over,
    });
  const one = (r: Room) => linkWorld(r.id, [{ id: r.id, x: 0, y: 0, placed: true, scene: r }]);

  it('a moth-stone must draw an area of the world, and an area names placed rooms', () => {
    const w = one(room({ id: 'fs', mothStones: [{ id: 'm', x: 600, y: 800, area: 'nowhere' }] }));
    expect(
      validateWorld(w, [{ id: 'here', rooms: ['fs'] }]).some((m) => m.includes('draws area "nowhere"')),
    ).toBe(true);
    expect(validateWorld(w, [{ id: 'nowhere', rooms: ['fs', 'ghost'] }])).toEqual([
      'area "nowhere" names room "ghost", which is not placed in the world',
    ]);
  });

  it('finds open no way; in a room with routes, a find no route names is reported', () => {
    const w = one(
      room({
        id: 'fr',
        hollows: [{ id: 'h', x: 700, y: 600, w: 100, h: 200, upgrade: 'quickWings' }],
        routes: [{ from: 'spawn', to: 'p' }],
      }),
    );
    expect(validateWorld(w)).toEqual(['find "fr:h" cannot be reached (name it in a route)']);
    const ok = one(
      room({
        id: 'fr',
        hollows: [{ id: 'h', x: 700, y: 600, w: 100, h: 200, upgrade: 'quickWings' }],
        routes: [
          { from: 'spawn', to: 'p' },
          { from: 'p', to: 'g' },
          { from: 'p', to: 'h', needs: ['wallJump'], oneWay: true },
        ],
        glades: [{ id: 'g', x: 300, y: 600, w: 100, h: 200, ability: 'wallJump' }],
      }),
    );
    expect(validateWorld(ok).filter((m) => m.includes('find'))).toEqual([]);
  });

  it('the game world draws every stone into a real area', () => {
    expect(validateWorld().filter((m) => m.includes('area'))).toEqual([]);
  });

  it('rejects a cap inside a solid, a stone in the air, a hollow with no such upgrade', () => {
    const base = {
      id: 'bad',
      width: 2000,
      height: 1000,
      spawn: { x: 200, y: 800 },
      solids: [{ tag: 'ground', x: 0, y: 800, w: 2000, h: 200 }],
      oneWays: [],
    };
    expect(() => parseScene({ ...base, caps: [{ id: 'c', x: 900, y: 780, w: 100, h: 64 }] })).toThrow(
      /overlaps a solid/,
    );
    expect(() => parseScene({ ...base, mothStones: [{ id: 'm', x: 900, y: 500, area: 'a' }] })).toThrow(
      /does not stand on a top/,
    );
    expect(() =>
      parseScene({ ...base, hollows: [{ id: 'h', x: 900, y: 500, w: 100, h: 100, upgrade: 'nope' }] }),
    ).toThrow();
  });
});
