import { describe, expect, it } from 'vitest';
import { getRoom, parseScene } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { Lure, Scene } from '../../src/sim/scene';
import { defaultTuning } from '../../src/sim/tuning';
import { flatScene, newSim, type Sim } from './helpers';

/**
 * Area 1 plan, round 3 (docs/design/regions/reviews/area1-plan-r3.md), the sim's part: the honest throw arc
 * (every lure kind, a hawker about), the glide-lip assist, the finale's long hold, re-forming in the room
 * (`reformPatch`, the oak), and what a fall catch tells render for a fade instead of a black cut.
 */

const R = ActionBit.right;
const L = ActionBit.left;
const U = ActionBit.up;
const J = ActionBit.jump;
const LT = defaultTuning.lures;
function run(s: Sim, mask: number, n: number): SimEvent[] {
  const from = s.events.length;
  for (let i = 0; i < n; i++) step(s.state, mask, s.tuning, s.scene, s.events);
  return s.events.slice(from);
}
const centre = (s: Sim) => [
  Math.round(s.state.player.x + s.state.player.w / 2),
  Math.round(s.state.player.y + s.state.player.h / 2),
];

/**
 * Caught (already), two beats holding `aim`, `delay` more frames held, then the last beat: the flight must be
 * the arc shown the step before, point for point, and land on its last point. Returns whether a blow came.
 */
function arcIsTheThrow(s: Sim, aim: number, delay: number): { hurt: boolean; compared: number } {
  run(s, aim | J, 1);
  run(s, aim, 6);
  run(s, aim | J, 1);
  run(s, aim, delay);
  if (s.state.player.lure < 0) return { hurt: true, compared: 0 };
  const arc = s.state.player.lureArc.slice();
  expect(arc.length).toBeGreaterThanOrEqual(2);
  const got: number[] = [];
  const ev: SimEvent[] = [];
  for (let f = 0; f < LT.arcFrames; f++) {
    ev.push(...run(s, f === 0 ? aim | J : aim, 1));
    const p = s.state.player;
    const done = f > 0 && (p.grounded || p.lure >= 0 || p.hp <= 0);
    if (f % LT.arcEvery === 0 || done) got.push(...centre(s));
    if (done) break;
  }
  const hurt = ev.some((e) => e.type === 'hurt');
  if (!hurt) expect(got, `aim ${aim} delay ${delay}`).toEqual(arc);
  return { hurt, compared: hurt ? 0 : got.length };
}

const room = (lure: Lure, extra: Partial<Scene> = {}): Scene => ({ ...flatScene(), lures: [lure], ...extra });

describe('the throw arc is the throw', () => {
  for (const [kind, y] of [
    ['wick', 520],
    ['lantern', 520],
    ['ring', 520],
    ['great', 600],
  ] as const) {
    it(`${kind}: every aim, every beat timing, lands on the arc's last point`, () => {
      for (const aim of [R, U | R, L, U, 0]) {
        for (const delay of [0, 2, 5, 9]) {
          const s = newSim(room({ id: 'l', kind, x: 2000, y }));
          s.place(2000, y + 40);
          for (let i = 0; i < 8 && s.state.player.lure < 0; i++) run(s, 0, 1);
          expect(s.state.player.lure).toBe(0);
          expect(arcIsTheThrow(s, aim, delay).compared).toBeGreaterThan(0);
        }
      }
    });
  }

  it('a swinging lure (lab-kit): the arc follows the flame as it swings', () => {
    const lab = getRoom('lab-kit');
    const l = lab.lures?.find((q) => q.id === 'swing-lantern');
    if (!l) throw new Error('no swing-lantern');
    for (const aim of [R, U | L]) {
      for (const delay of [0, 4]) {
        const s = newSim(lab);
        s.place(l.x, l.y + 40);
        for (let i = 0; i < 60 && s.state.player.lure < 0; i++) run(s, 0, 1);
        if (s.state.player.lure < 0) continue;
        expect(arcIsTheThrow(s, aim, delay).compared).toBeGreaterThan(0);
      }
    }
  });

  it('a hawker about: with no blow the throw is the arc; a strike while caught frees her and the arc is gone', () => {
    const scene = room(
      { id: 'wh', kind: 'wick', x: 2000, y: 520 },
      { senses: 'lamp', enemies: [{ id: 'h', kind: 'hawker', x: 2200, y: 300, facing: -1, guards: 'wh' }] },
    );
    let compared = 0;
    for (const delay of [0, 3, 6, 9, 14, 20]) {
      const s = newSim(scene);
      s.place(2000, 560);
      for (let i = 0; i < 8 && s.state.player.lure < 0; i++) run(s, 0, 1);
      compared += arcIsTheThrow(s, U | R, delay).compared;
    }
    expect(compared).toBeGreaterThan(0);
    // Caught and left there: a strike frees her (`lureFree` how hurt), and with it the arc goes.
    const s = newSim(scene);
    s.place(2000, 560);
    let freed: SimEvent | undefined;
    for (let i = 0; i < 600 && !freed; i++) freed = run(s, 0, 1).find((e) => e.type === 'lureFree');
    if (freed?.type === 'lureFree' && freed.how === 'hurt') expect(s.state.player.lureArc).toEqual([]);
  });
});

describe('the glide-lip assist', () => {
  const lip: Scene = {
    ...flatScene(),
    width: 5000,
    height: 1800,
    solids: [
      { tag: 'ground', x: 0, y: 800, w: 2000, h: 200 },
      { tag: 'ground', x: 2800, y: 1250, w: 2200, h: 200 },
    ],
    catches: [{ id: 'chasm', x: 2000, y: 1400, w: 800, h: 400, glideAssist: 2 }],
  };
  /** One walk-off from the lip holding right only (no jump): caught, or where she landed. */
  function walkOff(s: Sim): string {
    s.place(1800, 800);
    run(s, 0, 30);
    for (let i = 0; i < 300; i++) {
      const ev = run(s, R, 1);
      if (ev.some((e) => e.type === 'fallCatch')) return 'caught';
      const p = s.state.player;
      if (p.grounded && p.y + p.h > 800) return `landed ${p.y + p.h}`;
    }
    return 'other';
  }
  it('after 2 catches at the zone, the next walk-off opens the wings by itself and carries her across', () => {
    const s = newSim(lip);
    s.state.save.abilities = ['glide'];
    const tries = [walkOff(s), walkOff(s), walkOff(s), walkOff(s)];
    expect(tries).toEqual(['caught', 'caught', 'landed 1250', 'landed 1250']);
  });

  it('without the marker nothing changes: walk-offs keep being caught', () => {
    const s = newSim({ ...lip, catches: [{ id: 'chasm', x: 2000, y: 1400, w: 800, h: 400 }] });
    s.state.save.abilities = ['glide'];
    expect([walkOff(s), walkOff(s), walkOff(s)]).toEqual(['caught', 'caught', 'caught']);
  });
});

describe('the finale holds longer; ordinary beats keep the 3 s rule', () => {
  it('a trigger marked finale may hold 540 frames and sets its endSets flag when it ends', () => {
    const scene: Scene = {
      ...flatScene(),
      triggers: [
        {
          id: 'cloud',
          x: 2300,
          y: 600,
          w: 100,
          h: 200,
          sets: 'cloud',
          hold: 540,
          finale: true,
          endSets: 'east-open',
        },
      ],
    };
    const s = newSim(scene);
    s.place(2350, 800);
    const start = run(s, 0, 1);
    expect(start.find((e) => e.type === 'storyHold')).toMatchObject({ frames: 540 });
    expect(s.state.save.flags).not.toContain('east-open');
    const ev = run(s, R, 540);
    expect(ev.find((e) => e.type === 'storyHoldEnd')).toBeDefined();
    expect(s.state.save.flags).toContain('east-open');
  });

  it('room data: a hold over 180 must be the finale', () => {
    const base = {
      ...flatScene(),
      triggers: [{ id: 't', x: 100, y: 600, w: 100, h: 200, sets: 'f', hold: 540 }],
    };
    expect(() => parseScene(base)).toThrow(/finale/);
    expect(
      parseScene({ ...base, triggers: [{ ...base.triggers[0], finale: true }] }).triggers?.[0]?.hold,
    ).toBe(540);
  });
});

describe('a room that keeps its fades (reformPatch: the oak)', () => {
  it('a fade re-forms her at its moon patch nearest to where she lay, whole, whatever patch the save holds', () => {
    const scene: Scene = {
      ...flatScene(),
      senses: 'lamp',
      reformPatch: true,
      patches: [
        { id: 'low', x: 600, y: 800 },
        { id: 'high', x: 3400, y: 800 },
      ],
    };
    const s = newSim(scene);
    s.state.save.patch = { room: 'elsewhere', id: 'p' };
    s.place(3000, 800);
    run(s, 0, 5);
    s.state.player.hp = 0;
    s.state.player.faded = 1;
    const ev = run(s, 0, 2);
    expect(ev.find((e) => e.type === 'reform')).toMatchObject({ x: 3400, y: 800 });
    expect(s.state.player.hp).toBe(s.state.player.hpMax);
  });
});

describe('a fall catch tells render enough for a fade, not a black cut', () => {
  it('fallReturn carries where she was (fromX, fromY) and where she is put (x, y); fallCatch the hold', () => {
    const scene: Scene = {
      ...flatScene(),
      width: 5000,
      height: 1600,
      solids: [{ tag: 'ground', x: 0, y: 800, w: 2000, h: 200 }],
      catches: [{ id: 'pit', x: 2000, y: 1300, w: 3000, h: 300 }],
    };
    const s = newSim(scene);
    s.place(1800, 800);
    run(s, 0, 30);
    const ev = run(s, R, 200);
    const c = ev.find((e) => e.type === 'fallCatch');
    const r = ev.find((e) => e.type === 'fallReturn');
    expect(c).toMatchObject({ id: 'pit', frames: defaultTuning.room.catchFrames });
    expect(r?.type === 'fallReturn' && r.fromY).toBeGreaterThan(1300);
    expect(r).toMatchObject({ y: 800, fadeIn: defaultTuning.room.returnFadeIn });
  });
});
