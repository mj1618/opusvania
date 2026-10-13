import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { hashState, lanternBox, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';
import { feet, newSim } from './helpers';

/**
 * The naive players of playtest 3, as pilots. Neither knows the scene. Both do the same few things,
 * all of them reactions to what is in front of her:
 *
 *  - hold right;
 *  - blocked by a wall, or sliding down one: press jump (again and again, a beat apart);
 *  - a pod or a creature in the way: stop and cut it;
 *  - a lantern or a lamp that stirs as she comes by: walk up to it and stand there a moment
 *    (it catches, or it shows its price and she goes on);
 *  - the heart lighting up (the last lantern caught): go to it.
 *
 * The TAPPER's presses are 90 ms (5 frames). She never opens the wings and a ground jump of hers
 * is 136 px. The HOLDER keeps the button down through the rise and on (three quarters of a second), so the
 * wings open by accident on every drop.
 *
 * What makes the lanterns the critical path (the layout, memory/scene-and-units.md): trunk B
 * stands on the floor, so the floor ends inside the shaft and the only way on is up, to the second
 * lantern on its top; from there the bough, the catch branch and the right branch are a stair down
 * to the right rise without a jump; past the heart the far bluff stands in the way with the third
 * lantern on its top. Every wall on the way is climbed the same way: jump at it, and again.
 *
 * `NAIVE_TRACE=1 npx vitest run tests/unit/naive-pilot.test.ts --disable-console-intercept` prints
 * the timelines.
 */
const { jump: J, attack: A, left: LEFT, right: RIGHT } = ActionBit;
const lights = [
  ...(GROVE.lanterns ?? []).map((l, i) => ({ ...l, lamp: false, i })),
  ...(GROVE.lamps ?? []).map((l, i) => ({ ...l, lamp: true, i })),
];
const pods = GROVE.pods ?? [];
const heart = GROVE.heart as { x: number; y: number };

interface Run {
  ended: boolean;
  frames: number;
  hits: number;
  timeline: string[];
  events: SimEvent[];
  hash: string;
  glides: number;
  lit: number;
  lamps: number;
  wallet: number;
  found: number;
}

/** One naive run. `press` = how long she holds jump down per press; `beat` = frames between presses. */
function naive(
  press: number,
  beat: number,
  o: { pods?: 'all' | 'first'; lamps?: boolean } = {},
  t: Tuning = cloneTuning(defaultTuning),
  maxFrames = 60 * 150,
): Run {
  const s = newSim(GROVE, t);
  const timeline: string[] = [];
  const say = (what: string) =>
    timeline.push(
      `${(s.state.frame / 60).toFixed(1).padStart(6)} s  ${String(feet(s).x).padStart(4)},${String(feet(s).y).padStart(4)}  wallet ${String(s.state.pickups.count).padStart(2)}  hp ${s.state.player.hp}  ${what}`,
    );
  let jumpLeft = 0;
  let wait = 0;
  let prev = 0;
  /** Lights that have stirred as she came by, and how long she has stood at each. */
  const stirred = lights.map(() => false);
  const given = lights.map(() => 0);
  let seen = 0;
  let home = false;
  for (let f = 0; f < maxFrames && !s.state.goal.ended; f++) {
    const p = s.state.player;
    const at = feet(s);
    const g = s.state.goal;
    // What happened last step: a light stirred, the heart woke.
    for (; seen < s.events.length; seen++) {
      const e = s.events[seen] as SimEvent;
      if (e.type === 'lanternNotice' || e.type === 'lampNotice') {
        const k = lights.findIndex((l) => l.id === e.id);
        if (k >= 0) stirred[k] = true;
      } else if (e.type === 'lanternKindle' || e.type === 'lampKindle')
        say(`${e.id} lit (${e.lit} of ${e.total})`);
      else if (e.type === 'lanternRefuse' || e.type === 'lampRefuse')
        say(`${e.id} refuses: ${e.have} of ${e.need}`);
      else if (e.type === 'heartWake') {
        say('the heart wakes');
        home = true;
      } else if (e.type === 'heartSleep') say(`at the heart, asleep (${e.lit} of ${e.total})`);
      else if (e.type === 'hurt') say(`hit by ${e.source.id}`);
      else if (e.type === 'fade') say('fades');
      else if (e.type === 'podBurst') say(`${e.id} cut open`);
      else if (e.type === 'enemyDie') say(`${e.id} cut down`);
      else if (e.type === 'gather')
        say(`the heart: ${e.glints} glints, ${e.lanterns} lanterns, ${e.hits} hits`);
      else if (e.type === 'glideStart') say('wings open');
    }
    let m = 0;
    let dir = home ? Math.sign(heart.x - at.x) : 1;
    // A light that stirred: up to it, and stand a moment.
    // (One that stands on the ground she is on, within a few steps: nothing she has to work out.)
    for (let k = 0; k < lights.length; k++) {
      const l = lights[k] as (typeof lights)[number];
      const st = l.lamp ? g.lamps[l.i] : g.lanterns[l.i];
      if (l.lamp && o.lamps === false) continue;
      if (!stirred[k] || !st || st.lit || !p.grounded || at.y !== l.y || Math.abs(at.x - l.x) > 320) continue;
      // She gives it two seconds; if it shows its price instead (and nothing is on its way), she goes on.
      if ((st.refused && !st.pledged) || (given[k] as number) > 120) continue;
      const b = lanternBox(l, t.goal);
      if (p.x < b.x + b.w && b.x < p.x + p.w) given[k] = (given[k] as number) + 1;
      dir = Math.abs(at.x - l.x) <= 12 ? 0 : Math.sign(l.x - at.x);
      break;
    }
    // In the way, at her height, within a blade's length ahead: a closed pod or a living creature.
    let cut = false;
    const face = dir !== 0 ? dir : p.facing;
    for (let i = 0; i < pods.length && !cut; i++) {
      const q = pods[i] as (typeof pods)[number];
      const dx = (q.x - at.x) * face;
      if (o.pods === 'first' && q.id !== 'pod-stone') continue;
      if ((s.state.pods.hp[i] ?? 0) > 0 && dx > -10 && dx < 96 && Math.abs(q.y - (at.y - 40)) < 60)
        cut = true;
    }
    for (const e of s.state.enemies) {
      const dx = (e.x + e.w / 2 - at.x) * face;
      if (e.mode !== 'dead' && e.kind === 'burrback' && dx > 0 && dx < 120 && Math.abs(e.y + e.h - at.y) < 40)
        cut = true;
    }
    if (cut && p.grounded) {
      if ((prev & A) === 0) m |= A;
      if (p.facing !== face) m |= face > 0 ? RIGHT : LEFT;
    } else m |= dir > 0 ? RIGHT : dir < 0 ? LEFT : 0;
    // Blocked, or sliding: jump.
    // (On her way down to the lit heart she lets a wall she brushes go by.)
    const down = home && heart.y > at.y;
    const blocked =
      dir !== 0 && !down && ((p.grounded && p.wallDir === dir && p.vx === 0) || p.mode === 'wallSlide');
    if (jumpLeft > 0) {
      m |= J;
      jumpLeft--;
    } else if (wait > 0) wait--;
    else if (blocked && !cut) {
      m |= J;
      jumpLeft = press - 1;
      wait = beat;
    }
    step(s.state, m, s.tuning, s.scene, s.events);
    prev = m;
  }
  say(s.state.goal.ended ? 'the end' : 'GAVE UP HERE');
  const ev = s.events;
  return {
    ended: s.state.goal.ended,
    frames: s.state.goal.ending.time,
    hits: s.state.goal.run.hits,
    timeline,
    events: ev,
    hash: hashState(s.state),
    glides: ev.filter((e) => e.type === 'glideStart').length,
    lit: s.state.goal.lit,
    lamps: s.state.goal.lampsLit,
    wallet: s.state.pickups.count,
    found: s.state.goal.ending.glints,
  };
}

const trace = (name: string, r: Run) => {
  if (process.env.NAIVE_TRACE) console.log(`--- ${name}\n${r.timeline.join('\n')}`);
};

describe('naive players finish the grove: the lanterns are the critical path', () => {
  it('the tapper (90 ms presses, holds right): three lanterns in order, then the heart; no wings; at most 2 hits', () => {
    const r = naive(5, 9);
    trace('tapper', r);
    expect(r.ended).toBe(true);
    const lit = r.events
      .filter((e) => e.type === 'lanternKindle')
      .map((e) => (e.type === 'lanternKindle' ? e.id : ''));
    expect(lit).toEqual(['lantern-stone', 'lantern-crown', 'lantern-far']);
    expect(r.hits).toBeLessThanOrEqual(2);
    expect(r.glides).toBe(0);
    expect(r.frames).toBeLessThan(60 * 90);
    expect(r.events.some((e) => e.type === 'fade')).toBe(false);
  });

  it('the holder (holds jump three quarters of a second): the same, and the wings open by accident on the way', () => {
    const r = naive(45, 9);
    trace('holder', r);
    expect(r.ended).toBe(true);
    const lit = r.events
      .filter((e) => e.type === 'lanternKindle')
      .map((e) => (e.type === 'lanternKindle' ? e.id : ''));
    expect(lit).toEqual(['lantern-stone', 'lantern-crown', 'lantern-far']);
    expect(r.hits).toBeLessThanOrEqual(2);
    expect(r.glides).toBeGreaterThan(0);
    expect(r.frames).toBeLessThan(60 * 90);
    expect(r.events.some((e) => e.type === 'fade')).toBe(false);
  });

  it('other hands finish too: slower and quicker beats, a 4-frame tap, a full hold', () => {
    for (const [press, beat] of [
      [4, 6],
      [5, 14],
      [6, 20],
      [8, 4],
      [14, 12],
      [22, 9],
      [45, 6],
    ] as const) {
      const r = naive(press, beat);
      trace(`press ${press}, beat ${beat}`, r);
      expect(r.ended, `press ${press}, beat ${beat}`).toBe(true);
      expect(r.lit, `press ${press}, beat ${beat}`).toBe(3);
    }
  });

  it('the economy carries her whatever she skips: only the first pod cut (and every lamp bought), or no lamp at all', () => {
    for (const o of [
      { pods: 'first' as const },
      { lamps: false },
      { pods: 'first' as const, lamps: false },
    ]) {
      for (const press of [5, 45]) {
        const r = naive(press, 9, o);
        trace(`press ${press}, ${JSON.stringify(o)}`, r);
        expect(r.ended, `press ${press}, ${JSON.stringify(o)}`).toBe(true);
      }
    }
  });

  it('is deterministic', () => {
    expect(naive(5, 9).hash).toBe(naive(5, 9).hash);
  });
});
