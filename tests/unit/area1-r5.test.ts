import { describe, expect, it } from 'vitest';
import { getRoom, parseScene } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { mothMilestone, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { Scene } from '../../src/sim/scene';
import { defaultTuning } from '../../src/sim/tuning';
import { isUpgrade, upgradeFlag, upgradesOwned } from '../../src/sim/upgrades';
import { flatScene, newSim, type Sim } from './helpers';

/**
 * Area 1 plan, round 5 (docs/design/regions/reviews/area1-plan-r5.md), the sim's part: the throw-cut, the
 * night eyes upgrade, the first health milestone at 60 moths, the step-up on tiny ledges.
 */

const R = ActionBit.right;
const A = ActionBit.attack;
const AT = defaultTuning.attack;
function run(s: Sim, mask: number, n: number): SimEvent[] {
  const from = s.events.length;
  for (let i = 0; i < n; i++) step(s.state, mask, s.tuning, s.scene, s.events);
  return s.events.slice(from);
}
const of = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

/** Flung right from the wick at (2000, 500): the fling's launch is running after this. */
function thrown(extra: Partial<Scene> = {}): Sim {
  const s = newSim({ ...flatScene(), lures: [{ id: 'w', kind: 'wick', x: 2000, y: 500 }], ...extra });
  s.place(2000, 540);
  run(s, R | ActionBit.lamp, 1);
  const ev = run(s, R, 1);
  expect(ev.some((e) => e.type === 'fling')).toBe(true);
  run(s, R, 1);
  return s;
}

describe('the throw-cut: a cut in a fling’s launch is heavy', () => {
  it('a slash in the launch: slash.heavy, a throwCut event, player.attackHeavy', () => {
    const s = thrown();
    const ev = run(s, R | A, 1);
    expect(of(ev, 'slash')[0]?.heavy).toBe(true);
    expect(of(ev, 'throwCut')[0]).toMatchObject({ dir: 'fwd', seq: s.state.player.attackSeq });
    expect(s.state.player.attackHeavy).toBe(true);
  });

  it('after the launch, or without a throw, a slash is ordinary', () => {
    const s = thrown();
    run(s, R, defaultTuning.lures.throwFrames);
    const ev = run(s, R | A, 1);
    expect(of(ev, 'slash')[0]?.heavy).toBe(false);
    expect(of(ev, 'throwCut')).toEqual([]);
    const t = newSim(flatScene());
    t.place(2000, 800);
    expect(of(run(t, A, 1), 'slash')[0]?.heavy).toBe(false);
  });

  it('it hits throwCutPower x as hard and holds longer: a lantern (2 cuts) goes out on one throw-cut', () => {
    // A lantern ahead on the fling's line.
    const s = thrown({
      lures: [
        { id: 'w', kind: 'wick', x: 2000, y: 500 },
        { id: 'big', kind: 'lantern', x: 2260, y: 470 },
      ],
    });
    const ev: SimEvent[] = [];
    let swung = false;
    for (let i = 0; i < 18 && !ev.some((e) => e.type === 'lureSnuff' || e.type === 'lureHit'); i++) {
      const p = s.state.player;
      const near = !swung && p.x + p.w / 2 > 2260 - 120;
      if (near) swung = true;
      ev.push(...run(s, near ? R | A : R, 1));
    }
    expect(swung).toBe(true);
    expect(of(ev, 'lureSnuff').map((e) => e.id)).toEqual(['big']);
    expect(AT.throwCutPower).toBe(3);
  });
});

describe('the first health milestone at 60 moths', () => {
  it('mothMilestone gives the HUD its "x / 60"', () => {
    expect(mothMilestone(defaultTuning, 40)).toEqual({ lights: 0, prev: 0, next: 60 });
    expect(mothMilestone(defaultTuning, 61)).toEqual({ lights: 1, prev: 60, next: 350 });
    expect(defaultTuning.health.mothMilestones[0]).toBe(60);
  });

  it('crossing 60 with a snuff: healthUp, one more light, and it is filled', () => {
    const s = newSim({ ...flatScene(), lures: [{ id: 'w', kind: 'wick', x: 2100, y: 752 }] });
    s.state.save.moths = 58;
    s.place(2030, 800);
    run(s, 0, 2);
    s.state.player.hp = 2;
    const ev = run(s, A, 1).concat(run(s, 0, 20));
    const up = of(ev, 'healthUp')[0];
    expect(up).toMatchObject({
      hpMax: defaultTuning.health.max + 1,
      moths: 58 + defaultTuning.lures.kinds.wick.moths,
      milestone: 60,
    });
    expect(s.state.player.hpMax).toBe(defaultTuning.health.max + 1);
    // The snuff's own heal (1) and the milestone's (1).
    expect(s.state.player.hp).toBe(4);
    // A placed player keeps the earned light (no second event).
    s.place(2400, 800);
    expect(of(run(s, 0, 2), 'healthUp')).toEqual([]);
    expect(s.state.player.hpMax).toBe(defaultTuning.health.max + 1);
  });
});

describe('night eyes', () => {
  it('is an upgrade a hollow can give (the map reads it); it changes no number', () => {
    expect(isUpgrade('nightEyes')).toBe(true);
    expect(upgradesOwned({ flags: [upgradeFlag('nightEyes')] })).toEqual(['nightEyes']);
    const room = {
      ...flatScene(),
      hollows: [{ id: 'h', x: 1000, y: 600, w: 200, h: 200, upgrade: 'nightEyes' }],
    };
    expect(parseScene(room).hollows?.[0]?.upgrade).toBe('nightEyes');
  });
});

describe('tiny steps never stop a walk', () => {
  const ledge = (h: number): Scene => ({
    ...flatScene(),
    solids: [
      { tag: 'ground', x: 0, y: 800, w: 2200, h: 200 },
      { tag: 'ground', x: 2200, y: 800 - h, w: 1800, h: 200 + h },
    ],
  });
  it(`a ledge up to ${defaultTuning.ground.stepUp} px is walked onto; one higher is a wall`, () => {
    for (const h of [8, 16, defaultTuning.ground.stepUp]) {
      const s = newSim(ledge(h));
      s.place(2000, 800);
      run(s, R, 60);
      expect(s.state.player.x, `${h}`).toBeGreaterThan(2300);
    }
    const s = newSim(ledge(defaultTuning.ground.stepUp + 1));
    s.place(2000, 800);
    run(s, R, 60);
    expect(s.state.player.x + s.state.player.w).toBe(2200);
  });

  it('the knobs that stop her for a standing snuff (R3, R9: 24 px roots) stay walls', () => {
    for (const [id, x] of [
      ['wood-wicks', 2256],
      ['wood-silk', 760],
    ] as const) {
      const knob = getRoom(id).solids.find((q) => q.x === x && q.h <= 32);
      if (knob) expect(knob.h, id).toBeGreaterThan(defaultTuning.ground.stepUp);
    }
  });
});
