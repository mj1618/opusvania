import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { hashState, lanternBox, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';
import { feet, hopOnto, newSim } from './helpers';

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
 * Since playtest 4 the creatures push back (the burrback's ram: memory/enemies.md) and these two
 * still fight the only way they know, standing and cutting: they are the MASHERS of the ram's
 * design, so they are hit, and must still finish without fading (the reader, who takes no hit, is
 * piloted in burrback-ram.test.ts).
 *
 * Since playtest 5 the second lantern wants the ember that hangs over F3 (above the first lantern:
 * memory/goal.md). Told so at the summit (`lanternRefuse.key`), she turns round and goes for it the
 * only way she knows, back along the floor, the same reactions mirrored; from the bank the islands
 * are steps toward a light she can see (the one part of the run that is aimed, not reacted: the
 * route pilot's hops). Then east again, the road she has already walked. And the fights now have a
 * second beat: these two, who stand and cut, pay two lights a burrback and FADE on the road; the
 * wayside lamps they bought are where they re-form, and they finish all the same.
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
const picks = GROVE.pickups ?? [];
const islands = GROVE.solids.filter((r) => r.tag === 'floating').slice(0, 3);
const bank = GROVE.solids[0] as (typeof GROVE.solids)[number];

interface Run {
  ended: boolean;
  frames: number;
  hits: number;
  fades: number;
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
  o: { pods?: 'all' | 'first'; lamps?: boolean; stand?: boolean; read?: number } = {},
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
  /** The ember a lantern has asked for (index into the scene's pickups), while she is fetching it. */
  let fetch = -1;
  // The careful player (`read` = her reaction, frames): what she has seen begin and when she can answer it.
  const read = o.read ?? -1;
  const braceAt = s.state.enemies.map(() => -1);
  const diveAt = s.state.enemies.map(() => -1);
  let hop = 0;
  let hopDir = 0;
  let dodge = 0;
  let dodgeDir = 0;
  let wasBlocked = false;
  const ix = (id: string) => s.state.enemies.findIndex((e) => e.id === id);
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
        // One who never stops at a light is told as she passes: the notice carries what it wants too.
        if (e.type === 'lanternNotice' && e.key && o.stand === false) {
          const key = e.key.id;
          if (fetch < 0) say(`${e.id} wants ${key} (in passing): she turns back for it`);
          fetch = picks.findIndex((q) => q.id === key);
        }
      } else if (e.type === 'lanternKindle' || e.type === 'lampKindle')
        say(`${e.id} lit (${e.lit} of ${e.total})`);
      else if (e.type === 'lanternRefuse' && e.key) {
        const key = e.key.id;
        if (fetch < 0) say(`${e.id} wants ${key}: she turns back for it`);
        fetch = picks.findIndex((q) => q.id === key);
      } else if (e.type === 'lanternKey') {
        say(`${e.key} is hers: back to ${e.id}`);
        fetch = -1;
        const k = lights.findIndex((l) => l.id === e.id);
        if (k >= 0) given[k] = 0;
      } else if (e.type === 'lanternRefuse' || e.type === 'lampRefuse')
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
      else if (e.type === 'enemyWindup') {
        say(`${e.id} braces`);
        braceAt[ix(e.id)] = f + Math.max(0, read);
      } else if (e.type === 'enemyDive') {
        say(`${e.id} dives`);
        diveAt[ix(e.id)] = f + Math.max(0, read);
      } else if (e.type === 'lanternRest' || e.type === 'lampRest') say(`rested at ${e.id}`);
      else if (e.type === 'enemyBlock') say(`her cut glances off ${e.id}`);
      else if (e.type === 'enemyRecover') say(`${e.id} spent (${e.cause})`);
      else if (e.type === 'enemyHit') say(`${e.id} cut: ${e.hpLeft} left`);
      else if (e.type === 'enemyNotice') say(`${e.id} has seen her`);
    }
    let m = 0;
    let dir = home ? Math.sign(heart.x - at.x) : 1;
    /** She is on her way to a light that stirred, or standing at it. */
    let tending = false;
    // Fetching the ember: west along the floor as she came (the same reactions, mirrored); once on
    // the bank, up the islands toward it (the route pilot's hops), and onto it.
    const ember = fetch >= 0 ? picks[fetch] : undefined;
    if (ember && (s.state.pickups.timers[fetch] ?? 0) === 0) {
      dir = -1;
      const top = islands[islands.length - 1] as (typeof islands)[number];
      if (at.y <= top.y && at.x > top.x - 60 && at.x < top.x + top.w + 60)
        dir = Math.abs(ember.x - at.x) <= 8 ? 0 : Math.sign(ember.x - at.x);
      else if (p.grounded && at.y === bank.y && at.x < bank.x + bank.w - 40) {
        let ok = true;
        for (const r of islands) ok = ok && hopOnto(s, r) >= 0;
        if (ok) say('up the islands, on F3');
        prev = 0;
        continue;
      }
    } else if (ember) dir = 0;
    // A light that stirred: up to it, and stand a moment.
    // (One that stands on the ground she is on, within a few steps: nothing she has to work out.)
    for (let k = 0; k < lights.length; k++) {
      const l = lights[k] as (typeof lights)[number];
      const st = l.lamp ? g.lamps[l.i] : g.lanterns[l.i];
      if ((l.lamp && o.lamps === false) || o.stand === false || fetch >= 0) continue;
      if (!stirred[k] || !st || st.lit || !p.grounded || at.y !== l.y || Math.abs(at.x - l.x) > 320) continue;
      // She gives it two seconds; if it shows its price instead (and nothing is on its way), she goes on.
      if ((st.refused && !st.pledged) || (given[k] as number) > 120) continue;
      const b = lanternBox(l, t.goal);
      if (p.x < b.x + b.w && b.x < p.x + p.w) given[k] = (given[k] as number) + 1;
      dir = Math.abs(at.x - l.x) <= 12 ? 0 : Math.sign(l.x - at.x);
      tending = true;
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
      if (
        read < 0 &&
        e.mode !== 'dead' &&
        e.kind === 'burrback' &&
        dx > 0 &&
        dx < 120 &&
        Math.abs(e.y + e.h - at.y) < 40
      )
        cut = true;
    }
    // --- The careful player reads what is in front of her (her reaction: `read` frames).
    let acted = false;
    if (read >= 0 && !g.gathered) {
      // Hurt, with a lit light on the ground she stands on a few steps away and nothing on her: rest there.
      const foe = s.state.enemies.find(
        (e) =>
          e.mode !== 'dead' &&
          Math.abs(e.x + e.w / 2 - at.x) < 300 &&
          Math.abs(e.y + e.h - at.y) < 200 &&
          (e.kind === 'burrback'
            ? e.roused > 0 || e.stirred > 0 || e.braced
            : e.mode !== 'hover' && e.mode !== 'return'),
      );
      if (!foe && p.hp < p.hpMax && p.grounded && !g.restHold) {
        const k = lights.findIndex((l) => {
          const st = l.lamp ? g.lamps[l.i] : g.lanterns[l.i];
          return st?.lit === true && l.y === at.y && Math.abs(l.x - at.x) < 420;
        });
        const l = k >= 0 ? lights[k] : undefined;
        if (l) {
          dir = Math.abs(at.x - l.x) <= 10 ? 0 : Math.sign(l.x - at.x);
          m |= dir > 0 ? RIGHT : dir < 0 ? LEFT : 0;
          acted = true;
        }
      }
      // A lampwing's dive is at where she stood: step out of it (and on), once she has seen it start.
      for (let i = 0; i < s.state.enemies.length && !acted; i++) {
        const e = s.state.enemies[i] as (typeof s.state.enemies)[number];
        if (e.kind !== 'lampwing') continue;
        const ex = e.x + e.w / 2;
        if (
          e.mode === 'dive' &&
          f >= (diveAt[i] as number) &&
          Math.abs(e.targetX - at.x) < 90 &&
          dodge === 0
        ) {
          dodge = 16;
          dodgeDir = dir !== 0 ? dir : at.x >= ex ? 1 : -1;
        }
        // Hanging at the bottom of its arc beside her: her opening.
        const dx = ex - at.x;
        if (
          e.mode === 'stall' &&
          p.grounded &&
          Math.abs(dx) < 105 &&
          Math.abs(e.y + e.h / 2 - (at.y - 40)) < 50
        ) {
          if ((prev & A) === 0 && p.attackCd === 0) m |= A;
          if (p.facing !== Math.sign(dx) && dx !== 0) m |= dx > 0 ? RIGHT : LEFT;
          acted = true;
        }
      }
      if (!acted && dodge > 0) {
        dodge--;
        m |= dodgeDir > 0 ? RIGHT : LEFT;
        acted = true;
      }
      // A burrback on her ground: keep a blade's length, cut it while it is open; when it braces,
      // wait her reaction out, hop it, turn and cut it winded.
      let best = -1;
      for (let i = 0; i < s.state.enemies.length && !acted; i++) {
        const e = s.state.enemies[i] as (typeof s.state.enemies)[number];
        if (e.kind !== 'burrback' || e.mode === 'dead') continue;
        const dx = e.x + e.w / 2 - at.x;
        const engaged = e.roused > 0 || e.stirred > 0 || e.braced;
        // (On her ground; in a fight she may be in the air over it. A light she is tending comes first.)
        if (Math.abs(e.y + e.h - at.y) > (engaged ? 230 : 60) || (tending && !engaged)) continue;
        // In her way, or already fighting her.
        if (Math.abs(dx) < (engaged ? 460 : 190) && (engaged || dx * (dir || p.facing) > 0)) {
          if (best < 0 || Math.abs(dx) < Math.abs((s.state.enemies[best]?.x ?? 0) + 26 - at.x)) best = i;
        }
      }
      if (best >= 0 && !acted) {
        const e = s.state.enemies[best] as (typeof s.state.enemies)[number];
        const dx = e.x + e.w / 2 - at.x;
        const gap = Math.abs(dx) - e.w / 2 - p.w / 2;
        const side = dx >= 0 ? 1 : -1;
        acted = true;
        if (hop > 0) {
          m |= J | (hopDir > 0 ? RIGHT : LEFT);
          hop--;
        } else if (e.braced) {
          const ready = f >= (braceAt[best] as number);
          const facingHer = (at.x - (e.x + e.w / 2)) * e.facing > 0;
          if (!p.grounded) m |= dx * hopDir > -30 ? (hopDir > 0 ? RIGHT : LEFT) : 0;
          else if (ready && facingHer && gap < 150 && (prev & J) === 0) {
            hop = 9;
            hopDir = side;
            m |= J | (side > 0 ? RIGHT : LEFT);
          }
          // (Behind it, braced: its back is open.)
          else if (!facingHer && gap < 75 && (prev & A) === 0 && p.attackCd === 0)
            m |= A | (p.facing !== side ? (side > 0 ? RIGHT : LEFT) : 0);
        } else if (!p.grounded)
          m |= dx * hopDir > -30 ? (hopDir > 0 ? RIGHT : LEFT) : side > 0 ? RIGHT : LEFT;
        else if (gap > 72) m |= side > 0 ? RIGHT : LEFT;
        else {
          if (p.facing !== side) m |= side > 0 ? RIGHT : LEFT;
          if ((prev & A) === 0 && p.attackCd === 0) m |= A;
        }
      }
    }
    if (acted) {
      // (Her hands are busy: no wall presses meanwhile.)
    } else if (cut && p.grounded) {
      if ((prev & A) === 0) m |= A;
      if (p.facing !== face) m |= face > 0 ? RIGHT : LEFT;
    } else m |= dir > 0 ? RIGHT : dir < 0 ? LEFT : 0;
    // Blocked, or sliding: jump.
    // (On her way down to the lit heart she lets a wall she brushes go by.)
    const down = home && heart.y > at.y;
    const blocked =
      dir !== 0 && !down && ((p.grounded && p.wallDir === dir && p.vx === 0) || p.mode === 'wallSlide');
    // (The careful player's first press at a wall she has just met comes a reaction later.)
    if (read > 0 && blocked && !wasBlocked && wait === 0 && jumpLeft === 0) wait = read;
    wasBlocked = blocked;
    if (acted) {
      jumpLeft = 0;
    } else if (jumpLeft > 0) {
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
    fades: s.state.goal.run.deaths,
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
  it('the tapper (90 ms presses, holds right): three lanterns in order with the ember fetched between, then the heart; no wings; she mashes, so she fades on the road, and still finishes', () => {
    const r = naive(5, 9);
    trace('tapper', r);
    expect(r.ended).toBe(true);
    const lit = r.events
      .filter((e) => e.type === 'lanternKindle')
      .map((e) => (e.type === 'lanternKindle' ? e.id : ''));
    expect(lit).toEqual(['lantern-stone', 'lantern-crown', 'lantern-far']);
    // The crown asked for the ember before it caught, and she had it when she came back.
    const order = r.events
      .filter((e) => e.type === 'lanternRefuse' || e.type === 'lanternKey' || e.type === 'lanternKindle')
      .map((e) => `${e.type}:${'id' in e ? e.id : ''}`);
    expect(order.indexOf('lanternRefuse:lantern-crown')).toBeGreaterThan(0);
    expect(order.indexOf('lanternKey:lantern-crown')).toBeGreaterThan(
      order.indexOf('lanternRefuse:lantern-crown'),
    );
    expect(order.indexOf('lanternKindle:lantern-crown')).toBeGreaterThan(
      order.indexOf('lanternKey:lantern-crown'),
    );
    // She met the creatures on her road and cut at them: the floor's before the bluff, the shaft's
    // (playtest 5: on the main line now), the rise's before the heart.
    const met = new Set(
      r.events.filter((e) => e.type === 'enemyWindup').map((e) => (e.type === 'enemyWindup' ? e.id : '')),
    );
    for (const id of ['burr-path', 'burr-shaft', 'burr-rise']) expect(met.has(id), id).toBe(true);
    const cut = r.events.filter((e) => e.type === 'enemyDie').map((e) => (e.type === 'enemyDie' ? e.id : ''));
    expect(cut).toEqual(expect.arrayContaining(['burr-path', 'burr-rise']));
    // Mashing costs two lights a burrback now: more hits than she has lights, so she fades (and
    // re-forms at a light she lit, with a third of her wallet to pick up again).
    expect(r.hits).toBeGreaterThan(4);
    expect(r.fades).toBeGreaterThanOrEqual(1);
    expect(r.glides).toBe(0);
    expect(r.frames).toBeLessThan(60 * 120);
  });

  it('the holder (holds jump three quarters of a second): the same road, and the wings open by accident on the way', () => {
    const r = naive(45, 9);
    trace('holder', r);
    expect(r.ended).toBe(true);
    const lit = r.events
      .filter((e) => e.type === 'lanternKindle')
      .map((e) => (e.type === 'lanternKindle' ? e.id : ''));
    expect(lit).toEqual(['lantern-stone', 'lantern-crown', 'lantern-far']);
    expect(r.glides).toBeGreaterThan(0);
    expect(r.frames).toBeLessThan(60 * 150);
  });

  it('a tapper who never stops for a light still lights all three (playtest 4: 0 lanterns in two minutes) and no lamp by accident', () => {
    for (const [press, beat] of [
      [5, 9],
      [4, 6],
      [8, 4],
    ] as const) {
      const r = naive(press, beat, { stand: false });
      trace(`never stands, press ${press}, beat ${beat}`, r);
      const hand = `press ${press}, beat ${beat}`;
      expect(r.ended, hand).toBe(true);
      expect(r.lit, hand).toBe(3);
      // Lamps want her to stand still at them: she never does, so none is bought.
      expect(r.lamps, hand).toBe(0);
    }
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

  it('the careful first-timer (an 18-frame reaction: reads the brace, hops the ram, cuts it winded; steps out of a dive; rests at her lights)', () => {
    const r = naive(14, 12, { read: 18 });
    trace('careful first-timer, reaction 18', r);
    expect(r.ended).toBe(true);
    expect(r.lit).toBe(3);
    const died = r.events.filter((e) => e.type === 'enemyDie');
    const cut = died.map((e) => (e.type === 'enemyDie' ? e.id : ''));
    expect(cut).toEqual(expect.arrayContaining(['burr-path', 'burr-shaft', 'burr-rise']));
    // Reading pays: the three on the road cost her at most one light each, and no fade.
    const byBurr = (id: string) => r.events.filter((e) => e.type === 'hurt' && e.source.id === id).length;
    for (const id of ['burr-path', 'burr-shaft', 'burr-rise']) expect(byBurr(id), id).toBeLessThanOrEqual(1);
    expect(r.fades).toBe(0);
    // The open-ground fight has its second tell. (The other two stand beside a wayside lamp: lit, its
    // light stops their ram and takes their brace where she has shoved them into it, so they end sooner.)
    const tells = (id: string) => r.events.filter((e) => e.type === 'enemyWindup' && e.id === id).length;
    expect(tells('burr-path')).toBeGreaterThanOrEqual(2);
    expect(tells('burr-path') + tells('burr-shaft') + tells('burr-rise')).toBeGreaterThanOrEqual(4);
    // A kill by the finisher happens on the road.
    const fin = died.filter((e) => e.type === 'enemyDie' && e.kind === 'burrback' && e.power >= 2).length;
    expect(fin).toBeGreaterThanOrEqual(1);
    expect(r.frames).toBeGreaterThan(60 * 45);
    if (process.env.NAIVE_TRACE)
      console.log(`careful: ${(r.frames / 60).toFixed(1)} s, ${r.hits} hits, ${r.fades} fades`);
    // Other reactions (15 and 20 frames) finish too.
    for (const read of [15, 20]) {
      const q = naive(14, 12, { read });
      trace(`careful, reaction ${read}`, q);
      expect(q.ended, `reaction ${read}`).toBe(true);
      expect(q.fades, `reaction ${read}`).toBeLessThanOrEqual(1);
    }
  });
});
