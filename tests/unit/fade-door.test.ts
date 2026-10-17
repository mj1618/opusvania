import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import type { Scene } from '../../src/sim/scene';
import { defaultTuning } from '../../src/sim/tuning';
import { newSim, type Sim } from './helpers';

/**
 * A death costs a walk (feel review round 2, problem 7: "a fade costs about a second and two lights, beside the
 * fight, and creatures keep their wounds"): in a lamp room, with no moon patch to go to and no room `reform`
 * point, a fade re-forms her at her door into the room (`state.entry`, the first ground she stood on), whole,
 * and the creatures are whole again. Hazards stay cheap (hazard-return.test.ts). The test grove and scenes
 * built in code without `senses: 'lamp'` keep the old rule (enemies.test.ts).
 */

const FLOOR = 800;
const H = defaultTuning.health;

const room = (senses: 'lamp' | 'wallet'): Scene => ({
  id: 'fade-door',
  width: 4000,
  height: 1000,
  spawn: { x: 300, y: FLOOR },
  senses,
  solids: [{ tag: 'ground', x: 0, y: FLOOR, w: 4000, h: 200 }],
  oneWays: [],
  enemies: [{ id: 'b', kind: 'burrback', x: 2600, y: FLOOR, facing: -1, senses: 'always' }],
});

function hold(s: Sim, n: number): SimEvent[] {
  const from = s.events.length;
  for (let i = 0; i < n; i++) step(s.state, 0, s.tuning, s.scene, s.events);
  return s.events.slice(from);
}

/** In at the spawn, then beside the burrback on her last light, the burrback wounded. */
function lastLight(senses: 'lamp' | 'wallet'): Sim {
  const s = newSim(room(senses));
  hold(s, 40);
  s.place(2400, FLOOR);
  hold(s, 40);
  const e = s.state.enemies[0];
  if (!e) throw new Error('no burrback');
  e.hp = 1;
  s.state.player.hp = 1;
  s.place(2560, FLOOR);
  return s;
}

describe('a fade re-forms her at her door, whole, and the creatures heal', () => {
  it('lamp room: her door (where she first stood), every light, the burrback whole again', () => {
    const s = lastLight('lamp');
    expect(s.state.entry).toEqual({ x: 300, y: FLOOR });
    const ev = hold(s, 200);
    const reform = ev.find((e) => e.type === 'reform');
    expect(reform).toMatchObject({ x: 300, y: FLOOR, hp: H.max });
    expect(s.state.player.hp).toBe(H.max);
    const e = s.state.enemies[0];
    expect(e?.hp).toBe(e?.hpMax);
    expect(ev.find((x) => x.type === 'enemyReset')).toMatchObject({ id: 'b', healed: (e?.hpMax ?? 0) - 1 });
  });

  it('wallet scene (the test grove rule): 2 lights, its wound kept', () => {
    const s = lastLight('wallet');
    const ev = hold(s, 200);
    const reform = ev.find((e) => e.type === 'reform') as { x: number; hp: number } | undefined;
    expect(reform?.hp).toBe(H.reformHp);
    expect(s.state.enemies[0]?.hp).toBe(1);
  });
});
