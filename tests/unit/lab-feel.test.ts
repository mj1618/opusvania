import { describe, expect, it } from 'vitest';
import { Game } from '../../src/game';
import { getRoom } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { ActionBit } from '../../src/sim/input';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { fling, UR, untilReach } from './fling-drive';

/**
 * lab-feel, the toy room for the fling (memory/lures.md; docs/design/regions/wood-area1-v3.md): greybox, every
 * ability, every lamp relights by itself. Its stations, measured with the real controller.
 */

const ROOM = getRoom('lab-feel');
const R = ActionBit.right;
const J = ActionBit.jump;
/** The combat floor at the start pushes the lamp stations east by this. */
const D = 3000;

function play() {
  const g = new Game(cloneTuning(defaultTuning), ROOM, 1, () => 0, null);
  g.mode = 'manual';
  const events: SimEvent[] = [];
  g.afterStep.add((ev) => events.push(...ev));
  const run = (m: number, n = 1) => {
    for (let i = 0; i < n; i++) {
      g.queueInput([m]);
      g.stepOnce();
    }
  };
  const feet = () => ({ x: g.state.player.x + g.state.player.w / 2, y: g.state.player.y + g.state.player.h });
  /** Stands at (x, y) of the lamp stations' layout (+ `D`), then runs right to `lip`. */
  const from = (x: number, y: number, lip: number) => {
    g.teleport(x + D, y);
    run(0, 3);
    for (let i = 0; i < 60 && feet().x < lip + D; i++) run(R);
  };
  /** Flings off each of `ids` in turn with its aim (the first off a running jump, the rest in flight, right held). */
  const chain = (links: Array<[string, number]>): string[] => {
    const got: string[] = [];
    for (const [k, [id, aim]] of links.entries()) {
      if (untilReach(g, k === 0 ? R | J : R, id, 150) !== id) break;
      got.push(id);
      fling(g, aim, 4, R, 0);
    }
    for (let i = 0; i < 300 && !g.state.player.grounded; i++) run(R);
    run(0, 5);
    return got;
  };
  return { g, events, run, feet, from, chain };
}
const has = (ev: SimEvent[], type: string) => ev.some((e) => e.type === type);

describe('lab-feel', () => {
  it('greybox, every ability, every lamp relights, a shot per station', () => {
    expect(ROOM.art?.mode).toBe('greybox');
    expect(ROOM.abilities).toBeUndefined();
    for (const l of ROOM.lures ?? []) expect(l.relight, l.id).toBeGreaterThan(0);
    expect(ROOM.shots?.wide.map((s) => s.name)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']);
  });

  it('0: the attack first: a burrback 600 px from spawn on open floor, a juvenile past it, three carriers; no lamp near', () => {
    const kinds = (ROOM.enemies ?? []).filter((e) => e.x < D).map((e) => [e.kind, e.x]);
    expect(kinds).toEqual([
      ['burrback', 900],
      ['juvenileBurrback', 1700],
      ['carrier', 2300],
      ['carrier', 2300],
      ['carrier', 2300],
    ]);
    expect(900 - ROOM.spawn.x).toBe(600);
    for (const l of ROOM.lures ?? []) expect(Math.abs(l.x - 900), l.id).toBeGreaterThan(2000);
    const s = play();
    expect(s.feet().y).toBe(1700);
    s.run(R, 20);
    expect(s.g.state.player.hp).toBe(s.g.state.player.hpMax);
  });

  it('1: one flame over a gap: a running jump falls in; a fling up-right off it clears', () => {
    const j = play();
    j.from(1300, 1700, 1390);
    j.run(R | J, 20);
    for (let i = 0; i < 200 && !j.g.state.player.grounded && !j.g.state.caught; i++) j.run(R | J);
    expect(has(j.events, 'fallCatch') || j.feet().x < D + 2000).toBe(true);
    const s = play();
    s.from(1300, 1700, 1390);
    expect(s.chain([['s1', UR]])).toEqual(['s1']);
    expect(s.feet().y).toBe(1700);
    expect(s.feet().x).toBeGreaterThan(D + 2000);
    expect(s.events.find((e) => e.type === 'lureSnuff')).toMatchObject({ id: 's1', fling: true });
  });

  it('2: a three-flame chain climbs to the ledge; one or two links fall short into the pit (and relight)', () => {
    const s = play();
    s.from(2500, 1700, 2590);
    expect(
      s.chain([
        ['s2-a', UR],
        ['s2-b', UR],
        ['s2-c', UR],
      ]),
    ).toEqual(['s2-a', 's2-b', 's2-c']);
    expect(s.feet().y).toBe(950);
    for (const links of [
      [['s2-a', UR]],
      [
        ['s2-a', UR],
        ['s2-b', UR],
      ],
    ] as Array<Array<[string, number]>>) {
      const m = play();
      m.from(2500, 1700, 2590);
      m.chain(links);
      for (let i = 0; i < 200 && m.g.state.caught; i++) m.run(0);
      expect(has(m.events, 'fallCatch'), `${links.length} links`).toBe(true);
      expect(m.events.filter((e) => e.type === 'lureRelight').length).toBe(links.length);
    }
  });

  it('3: fling, then the wings: a fling alone falls in the gap, with the glide it reaches the far floor', () => {
    const glide = play();
    glide.from(4900, 1700, 4990);
    expect(untilReach(glide.g, R | J, 's3', 60)).toBe('s3');
    fling(glide.g, UR, 4, R | J);
    expect(glide.feet()).toMatchObject({ y: 1800 });
    expect(glide.feet().x).toBeGreaterThan(D + 6500);
    const bare = play();
    bare.from(4900, 1700, 4990);
    expect(bare.chain([['s3', UR]])).toEqual(['s3']);
    expect(has(bare.events, 'fallCatch')).toBe(true);
  });

  it('4: a chain with a hawker over it, up to the high ledge', () => {
    expect(ROOM.enemies?.find((e) => e.id === 's4-hawker')?.kind).toBe('hawker');
    const s = play();
    for (const e of s.g.state.enemies) e.gone = true;
    s.from(6800, 1800, 6900);
    expect(
      s.chain([
        ['s4-a', UR],
        ['s4-b', UR],
        ['s4-c', UR],
      ]),
    ).toEqual(['s4-a', 's4-b', 's4-c']);
    expect(s.feet().y).toBe(1050);
  });

  it('5: over thorns, flat, flat, up-right: across; a short chain meets the thorns and its flames burn again', () => {
    const s = play();
    s.from(8650, 1800, 8690);
    expect(
      s.chain([
        ['s5-a', R],
        ['s5-b', R],
        ['s5-c', UR],
      ]),
    ).toEqual(['s5-a', 's5-b', 's5-c']);
    expect(s.feet()).toMatchObject({ y: 1700 });
    expect(s.feet().x).toBeGreaterThan(D + 9800);
    expect(has(s.events, 'thornHit')).toBe(false);
    expect(s.events.filter((e) => e.type === 'lureSnuff').length).toBe(3);
    const m = play();
    m.from(8650, 1800, 8690);
    m.chain([
      ['s5-a', R],
      ['s5-b', UR],
    ]);
    m.run(0, 60);
    expect(has(m.events, 'thornHit')).toBe(true);
    expect(m.events.filter((e) => e.type === 'lureRelight').length).toBe(2);
    expect(has(m.events, 'lureSnuff')).toBe(false);
  });

  it('6 and 7: a beetle on the floor; the shell under a flame a jump reaches', () => {
    expect(ROOM.enemies?.find((e) => e.id === 's6-beetle')?.kind).toBe('burrback');
    expect(ROOM.enemies?.find((e) => e.id === 's7-shell')?.kind).toBe('oldBurrback');
    const s = play();
    s.from(12100, 1850, 12300);
    expect(untilReach(s.g, R | J, 's7', 60)).toBe('s7');
  });
});
