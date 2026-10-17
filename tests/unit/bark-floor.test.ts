import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { newSim, type Sim } from './helpers';

/**
 * Average first-timer r3: 150 attempts at R4's bark floor. On the ground ↓ + attack was a forward cut and
 * only a down-cut from the air, within ~80 px, reached a floor panel. Now standing on or beside one, ↓ +
 * attack cuts the floor (each cut a `barkHit` with the cuts left, then `barkBreak`), and a pogo still does.
 * And the test grove's offer is off in lamp rooms (the first-timer's O key made `offerMiss` events).
 */

const LAB = getRoom('lab-kit'); // floor-c: 3400-3528, top 1600, 3 cuts
const D = ActionBit.down;
const A = ActionBit.attack;
const of = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
function run(s: Sim, mask: number, n: number): SimEvent[] {
  const from = s.events.length;
  for (let i = 0; i < n; i++) step(s.state, mask, s.tuning, s.scene, s.events);
  return s.events.slice(from);
}
/** ↓ + attack pressed afresh `n` times, a cut's cooldown apart. */
function downCuts(s: Sim, n: number): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < n; i++) ev.push(...run(s, D | A, 1), ...run(s, D, 24));
  return ev;
}

describe('a bark floor panel breaks to the cuts a player tries', () => {
  it('standing on it: ↓ + attack is a down-cut at the floor; three cuts, each a barkHit, break it and she drops', () => {
    const s = newSim(LAB);
    s.place(3464, 1600);
    run(s, 0, 5);
    const ev = downCuts(s, 3);
    expect(of(ev, 'slash').map((e) => e.dir)).toEqual(['down', 'down', 'down']);
    expect(of(ev, 'barkHit').map((e) => [e.id, e.hpLeft, e.hpMax, e.floor])).toEqual([
      ['floor-c', 2, 3, true],
      ['floor-c', 1, 3, true],
    ]);
    expect(of(ev, 'barkBreak')[0]?.id).toBe('floor-c');
    // Through it, into the pocket below (its wick may catch her on the way).
    run(s, 0, 30);
    expect(s.state.player.y + s.state.player.h).toBeGreaterThan(1700);
  });

  it('standing beside it (her side within ~30 px of its edge) reaches it too', () => {
    const s = newSim(LAB);
    s.place(3400 - 40, 1600);
    run(s, 0, 5);
    expect(of(downCuts(s, 1), 'barkHit')).toHaveLength(1);
  });

  it('away from any floor panel, ↓ + attack on the ground is the forward cut as before', () => {
    const s = newSim(LAB);
    s.place(3200, 1600);
    run(s, 0, 5);
    const ev = downCuts(s, 1);
    expect(of(ev, 'slash').map((e) => e.dir)).toEqual(['fwd']);
    expect(of(ev, 'barkHit')).toEqual([]);
  });

  it('a pogo onto it still cuts it (and bounces her)', () => {
    const s = newSim(LAB);
    s.place(3464, 1600);
    run(s, 0, 5);
    run(s, ActionBit.jump, 20);
    let ev: SimEvent[] = [];
    let pressed = false;
    for (let i = 0; i < 80 && of(ev, 'barkHit').length === 0; i++) {
      const p = s.state.player;
      // (Down is held only with the press: held while falling it is the fast fall.)
      const near = !pressed && p.vy > 0 && p.y + p.h > 1600 - 90;
      if (near) pressed = true;
      ev = ev.concat(run(s, near ? D | A : 0, 1));
    }
    expect(of(ev, 'barkHit')[0]).toMatchObject({ id: 'floor-c', hpLeft: 2 });
    expect(s.state.player.vy).toBeLessThan(0);
  });
});

describe('giving is the test grove’s', () => {
  it('in a lamp room the offer key does nothing (no offer, no offerMiss, no target)', () => {
    const s = newSim(getRoom('wood-burrow'));
    s.place(1000, 1280);
    run(s, 0, 5);
    const ev = run(s, ActionBit.offer, 1).concat(run(s, 0, 5), run(s, ActionBit.offer, 1), run(s, 0, 5));
    expect(ev.filter((e) => e.type === 'offer' || e.type === 'offerMiss')).toEqual([]);
    expect(s.state.player.offerTarget).toBeNull();
  });
});
