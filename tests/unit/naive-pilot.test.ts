import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { offerTarget } from '../../src/sim/giving';
import { hashState, lanternBox, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import type { Scene } from '../../src/sim/scene';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';
import { feet, hopOnto, newSim, type Sim } from './helpers';

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
const { jump: J, attack: A, offer: O, left: LEFT, right: RIGHT } = ActionBit;
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
  /** Every time a creature took notice of her: its first tell / brace / flinch, with her box gap and centre distance then, and her wallet. */
  notices: { id: string; kind: string; type: string; gap: number; d: number; wallet: number; f: number }[];
  /** The nearest she came to each creature (box to box), and to each burrback on its own ground (her feet within 60 px of its). */
  closest: Record<string, number>;
  closestOnGround: Record<string, number>;
  /** The first frame she came within 130 px (box to box, on its ground) of each burrback: her wallet then, and whether it was aware of her. */
  firstNear: Record<string, { f: number; wallet: number; aware: boolean }>;
  /** Creatures that slept as she passed (`EnemyState.dozing`, round 3), with the first frame. */
  dozed: Record<string, number>;
  /** Round 4: every creature that slept (burrback `dozing`) or roosted (lampwing `roosting`) while she was dark, and the frame. */
  slept: Record<string, number>;
  /** The first creature she came within 340 px of (centres), and whether it slept then. */
  firstMet: { id: string; f: number; wallet: number; asleep: boolean } | null;
  /** Where she stood at the end (feet). */
  end: { x: number; y: number };
}

/** One naive run. `press` = how long she holds jump down per press; `beat` = frames between presses. */
function naive(
  press: number,
  beat: number,
  o: {
    pods?: 'all' | 'first';
    lamps?: boolean;
    stand?: boolean;
    read?: number;
    /** Giving (memory/giving.md): a burrback in her way is given a glint instead of cut (`offer`), or hopped (`pass`). */
    offer?: boolean;
    /** She lays her light down: holds offer at any dormant light (or the heart) in reach, streaming into it. */
    lay?: boolean;
    /** Round 4: the moths' road: she goes for the ember over F3 first (west, the bank, the islands). */
    emberFirst?: boolean;
    /** Round 4: the curious player: plays as the natural one, and presses offer when it would land on a creature that is aware of her (the V cap). */
    curious?: boolean;
    pass?: boolean;
    /** Another scene (the grove without its glints), a wallet to start with, and when to stop. */
    scene?: Scene;
    wallet?: number;
    until?: (s: Sim) => boolean;
  } = {},
  t: Tuning = cloneTuning(defaultTuning),
  maxFrames = 60 * 150,
): Run {
  const s = newSim(o.scene ?? GROVE, t);
  if (o.wallet !== undefined) s.state.pickups.count = o.wallet;
  const notices: Run['notices'] = [];
  const closest: Record<string, number> = {};
  const closestOnGround: Record<string, number> = {};
  const firstNear: Run['firstNear'] = {};
  const dozed: Run['dozed'] = {};
  const slept: Run['slept'] = {};
  let firstMet: Run['firstMet'] = null;
  /** Frames left of a hop over a burrback (`pass`). */
  let vault = 0;
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
  let fetch = o.emberFirst ? picks.findIndex((q) => q.id === 'great-ember') : -1;
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
  for (let f = 0; f < maxFrames && !s.state.goal.ended && !o.until?.(s); f++) {
    const p = s.state.player;
    const at = feet(s);
    const g = s.state.goal;
    // What happened last step: a light stirred, the heart woke.
    for (; seen < s.events.length; seen++) {
      const e = s.events[seen] as SimEvent;
      if (
        e.type === 'enemyWindup' ||
        e.type === 'enemyNotice' ||
        e.type === 'enemyAware' ||
        (e.type === 'enemyAlert' && e.cause !== 'touch')
      ) {
        const q = s.state.enemies.find((n) => n.id === e.id);
        if (q) {
          const gap = Math.max(q.x - (p.x + p.w), p.x - (q.x + q.w), 0);
          const d = Math.round(Math.hypot(q.x + q.w / 2 - (p.x + p.w / 2), q.y + q.h / 2 - (p.y + p.h / 2)));
          notices.push({ id: e.id, kind: q.kind, type: e.type, gap, d, wallet: s.state.pickups.count, f });
        }
      }
      if (e.type === 'enemyGift') say(`${e.id} given a glint (it was ${e.was}): calm ${e.frames}`);
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
      else if (e.type === 'reform') say(`re-forms at ${e.x},${e.y}`);
      else if (e.type === 'podBurst') say(`${e.id} cut open`);
      else if (e.type === 'enemyDie') say(`${e.id} cut down`);
      else if (e.type === 'gather')
        say(`the heart: ${e.glints} glints, ${e.lanterns} lanterns, ${e.hits} hits`);
      else if (e.type === 'glideStart') say('wings open');
      else if (e.type === 'enemyWindup') {
        say(`${e.id} braces at ${e.x} facing ${e.dir}`);
        braceAt[ix(e.id)] = f + Math.max(0, read);
      } else if (e.type === 'enemyDive') {
        say(`${e.id} dives`);
        diveAt[ix(e.id)] = f + Math.max(0, read);
      } else if (e.type === 'lanternRest' || e.type === 'lampRest') say(`rested at ${e.id}`);
      else if (e.type === 'enemyBlock') say(`her cut glances off ${e.id}`);
      else if (e.type === 'enemyRecover') say(`${e.id} spent (${e.cause}) at ${e.x}`);
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
    // The moths' road (round 4): the ember first, then down off F3's WEST end to the spawn ground, so the
    // first lantern is passed on foot (east off F3 she would glide over it and the pool).
    const stone = g.lanterns[0];
    if (o.emberFirst && fetch < 0 && stone && !stone.lit && at.y < 1200 && at.x > 950 && at.x < 1700 && !home)
      dir = -1;
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
    // (One who gives does not swing her blade beside a creature: a cut that met it would wake it.)
    if (cut && o.offer)
      for (const e of s.state.enemies)
        if (e.mode !== 'dead' && Math.abs(e.x + e.w / 2 - at.x) < 170 && Math.abs(e.y + e.h - at.y) < 120)
          cut = false;
    for (const e of s.state.enemies) {
      const dx = (e.x + e.w / 2 - at.x) * face;
      if (
        read < 0 &&
        !o.offer &&
        !o.pass &&
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
    // --- The curious player: the V cap is up (a press would land on a creature that is aware of her): V.
    if (o.curious && !g.gathered && (prev & O) === 0 && s.state.pickups.count >= 1) {
      const to = p.offerTarget;
      const foe = to ? s.state.enemies.find((e) => e.id === to.id) : undefined;
      if (foe && foe.aware > 0) {
        m |= O;
        cut = false;
      }
    }
    // --- Giving (memory/giving.md): a burrback in her way on her ground is given a glint instead of
    // cut (she walks up into reach, gives, waits for it to land, then walks on past it: calmed, it is
    // harmless); with nothing to give, or told to pass, she hops it.
    if ((o.offer || o.pass) && !acted && !g.gathered) {
      if (vault > 0) {
        vault--;
        m |= J | (face > 0 ? RIGHT : LEFT);
        acted = true;
      } else
        for (const e of s.state.enemies) {
          if (e.kind !== 'burrback' || e.mode === 'dead' || e.gift > 0) continue;
          const dx = (e.x + e.w / 2 - at.x) * face;
          if (Math.abs(e.y + e.h - at.y) > 40 || dx < -30 || dx > 220) continue;
          if (o.offer && s.state.pickups.count > 0) {
            acted = true;
            // (Its glint is on its way: she waits for it to land.)
            if (p.giftTo === 'enemy' && p.giftTimer > 0) break;
            const gap = Math.abs(dx) - e.w / 2 - p.w / 2;
            if (gap > 100) m |= face > 0 ? RIGHT : LEFT;
            else if ((prev & O) === 0 && p.offerCd === 0) m |= O;
            break;
          }
          if (p.grounded && dx > 60 && dx < 170) {
            vault = 17;
            m |= J | (face > 0 ? RIGHT : LEFT);
            acted = true;
          }
          break;
        }
    }
    // Laying light down: a dormant light in reach (and no creature to give to first): hold offer.
    if (o.lay && !g.gathered && s.state.pickups.count > 0 && fetch < 0) {
      const to = offerTarget(s.state, s.scene, s.tuning, true);
      if (to && to.to !== 'heart') m |= O;
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
    const b = s.state.player;
    for (const e of s.state.enemies) {
      if (e.mode === 'dead') continue;
      if (e.dozing && dozed[e.id] === undefined) dozed[e.id] = f;
      if ((e.dozing || e.roosting) && slept[e.id] === undefined) slept[e.id] = f;
      if (!firstMet && Math.hypot(e.x + e.w / 2 - (b.x + b.w / 2), e.y + e.h / 2 - (b.y + b.h / 2)) <= 340)
        firstMet = { id: e.id, f, wallet: s.state.pickups.count, asleep: e.dozing || e.roosting };
      const dx = Math.max(e.x - (b.x + b.w), b.x - (e.x + e.w), 0);
      const dy = Math.max(e.y - (b.y + b.h), b.y - (e.y + e.h), 0);
      const gap = Math.round(Math.hypot(dx, dy));
      closest[e.id] = Math.min(closest[e.id] ?? 1e9, gap);
      if (Math.abs(b.y + b.h - (e.y + e.h)) <= 60) {
        closestOnGround[e.id] = Math.min(closestOnGround[e.id] ?? 1e9, gap);
        if (gap <= 130 && !firstNear[e.id])
          firstNear[e.id] = { f, wallet: s.state.pickups.count, aware: e.aware > 0 };
      }
    }
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
    notices,
    closest,
    closestOnGround,
    firstNear,
    dozed,
    slept,
    firstMet,
    end: feet(s),
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
    expect(cut).toEqual(expect.arrayContaining(['burr-path', 'burr-shaft']));
    // (burr-rise she only wounds: lamp-rise's light no longer stops its ram or takes its brace, so the
    // masher fades there, re-forms at the lamp, and its last ram carries it past her; she walks on.)
    const wounds = r.events.filter((e) => e.type === 'enemyHit' && e.id === 'burr-rise').length;
    expect(wounds).toBeGreaterThanOrEqual(3);
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

  it('a fade in the shaft re-forms her at lamp-trunk by the doorway, lit or dark, not at the first lantern (playtest 6: three walks of 4.3 s)', () => {
    let shaft = 0;
    for (const o of [{}, { lamps: false }, { stand: false }]) {
      const r = naive(5, 9, o);
      const ev = r.events;
      for (let k = 0; k < ev.length; k++) {
        const e = ev[k] as SimEvent;
        if (e.type !== 'fade' || e.x < 3328 || e.x > 3584 || e.y !== 1280) continue;
        const re = ev.slice(k).find((q) => q.type === 'reform');
        expect(re?.type === 'reform' && [re.x, re.y], JSON.stringify(o)).toEqual([3160, 1280]);
        shaft++;
      }
      // (Every re-form is at a light: the nearest one lit, or a lamp she has passed.)
      const at = new Set(lights.map((l) => `${l.x},${l.y}`));
      for (const e of ev)
        if (e.type === 'reform') expect(at.has(`${e.x},${e.y}`), `${e.x},${e.y}`).toBe(true);
    }
    expect(shaft).toBeGreaterThanOrEqual(2);
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
    // Every fight on the road has its second tell (playtest 6: a lit lamp beside the shaft's and the
    // rise's stopped the ram and took the brace, and the fight in the shaft drifted into the doorway,
    // where it does not brace: one tell each). wing-rise joins the last one.
    const tells = (id: string) => r.events.filter((e) => e.type === 'enemyWindup' && e.id === id).length;
    for (const id of ['burr-path', 'burr-shaft', 'burr-rise'])
      expect(tells(id), id).toBeGreaterThanOrEqual(2);
    expect(
      r.events.filter((e) => e.type === 'enemyDive' && e.id === 'wing-rise').length,
    ).toBeGreaterThanOrEqual(1);
    // Playtest 6 (four live runs: `spent`, never `wall`): the shaft's second exchange is a wall stun.
    // Its first ram ends at the doorway's mouth; from there the next one carries into trunk B's bark.
    expect(
      r.events.some((e) => e.type === 'enemyRecover' && e.id === 'burr-shaft' && e.cause === 'wall'),
    ).toBe(true);
    // She bought the two lamps on her road and they did not shorten the fights beside them.
    expect(r.lamps).toBeGreaterThanOrEqual(2);
    expect(r.events.filter((e) => e.type === 'enemyRecover' && e.cause === 'lantern')).toEqual([]);
    expect(r.hits).toBeLessThanOrEqual(3);
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

// --- Giving (memory/giving.md): the creatures see the light she carries; she can give it away.
const BARE: Scene = { ...GROVE, pickups: [], pods: [] };
const pastHeart = (s: Sim) => feet(s).x >= heart.x - 40 && feet(s).y === heart.y;
const PATH = ['burr-path', 'burr-shaft', 'burr-rise'];

describe('giving: carrying light makes her seen; offering is a way through (memory/giving.md)', () => {
  it("the GHOST: carrying nothing (the grove without its glints), she crosses from the spawn to the heart and no creature ever notices her, though she passes every burrback on her road at arm's length", () => {
    for (const [press, beat] of [
      [5, 9],
      [14, 12],
      [45, 9],
    ] as const) {
      const hand = `press ${press}, beat ${beat}`;
      const r = naive(
        press,
        beat,
        { scene: BARE, pass: true, until: pastHeart },
        cloneTuning(defaultTuning),
        60 * 120,
      );
      trace(`ghost, ${hand}`, r);
      if (process.env.NAIVE_TRACE) console.log(JSON.stringify(r.closestOnGround));
      // She got there, untouched, with nothing in her hands the whole way.
      expect(r.end.x, hand).toBeGreaterThanOrEqual(heart.x - 40);
      expect(r.hits, hand).toBe(0);
      expect(
        r.events.filter((e) => e.type === 'pickup'),
        hand,
      ).toEqual([]);
      // Not a tell, not a brace, not a flinch, not a lifted head: unseen by all of them.
      const noticed = r.events.filter(
        (e) =>
          e.type === 'enemyAware' ||
          e.type === 'enemyNotice' ||
          e.type === 'enemyWindup' ||
          (e.type === 'enemyAlert' && e.cause !== 'touch'),
      );
      expect(noticed, hand).toEqual([]);
      // And it was close: every burrback on the road, on its own ground, inside the reach at which
      // one braces at a carrier (`burrback.strikePx`, box to box).
      for (const id of PATH)
        expect(r.closestOnGround[id] ?? 1e9, `${hand}: ${id}`).toBeLessThan(defaultTuning.burrback.strikePx);
      // Round 3: each slept as she came (it stands still: the difference is behaviour, not only a look).
      for (const id of PATH) expect(r.dozed[id], `${hand}: ${id} slept`).toBeGreaterThanOrEqual(0);
    }
  });

  it('the HOARDER: carrying everything she is seen from far: each creature on the road becomes aware of her about half as far again as of one with a handful', () => {
    const hoard = naive(
      5,
      9,
      { scene: BARE, pass: true, wallet: 80, stand: false, lamps: false, until: pastHeart },
      cloneTuning(defaultTuning),
      60 * 120,
    );
    const light = naive(
      5,
      9,
      { scene: BARE, pass: true, wallet: 8, stand: false, lamps: false, until: pastHeart },
      cloneTuning(defaultTuning),
      60 * 120,
    );
    trace('hoarder (80 glints)', hoard);
    trace('a handful (8 glints)', light);
    const firstAware = (r: Run, id: string) => r.notices.find((n) => n.type === 'enemyAware' && n.id === id);
    const G = defaultTuning.giving;
    const B = defaultTuning.burrback;
    const W = defaultTuning.lampwing;
    for (const id of ['burr-shaft', 'burr-rise', 'wing-rise']) {
      const h = firstAware(hoard, id);
      const l = firstAware(light, id);
      if (process.env.NAIVE_TRACE) console.log(id, 'hoarder', h, 'handful', l);
      expect(h, id).toBeDefined();
      expect(l, id).toBeDefined();
      expect(h?.wallet ?? 0, id).toBeGreaterThanOrEqual(G.seen4);
      expect(l?.wallet ?? 0, id).toBeLessThan(G.seen3);
      // Far: past the whole range a handful is seen at, and half as far again.
      const base = id.startsWith('burr') ? B.noticePx : W.noticePx;
      expect(l?.d ?? 0, id).toBeLessThanOrEqual(base);
      expect(h?.d ?? 0, id).toBeGreaterThan(base * 1.3);
      expect((h?.d ?? 0) / (l?.d ?? 1), id).toBeGreaterThan(1.35);
    }
    // The lampwing over the last fight tells (and so dives) from the far side of the rise.
    const tell = hoard.notices.find((n) => n.type === 'enemyNotice' && n.id === 'wing-rise');
    expect(tell?.d ?? 0).toBeGreaterThan(W.noticePx * G.scale3);
  });

  it('the OFFER pilot: the tapper gives each burrback on her road a glint instead of cutting it, and walks past it calmed; she finishes, barely touched, every one of them alive', () => {
    for (const [press, beat] of [
      [5, 9],
      [45, 9],
    ] as const) {
      const hand = `press ${press}, beat ${beat}`;
      const r = naive(press, beat, { offer: true });
      trace(`offer, ${hand}`, r);
      expect(r.ended, hand).toBe(true);
      expect(r.lit, hand).toBe(3);
      for (const id of PATH) {
        const gifts = r.events.filter((e) => e.type === 'enemyGift' && e.id === id);
        expect(gifts.length, `${hand}: ${id}`).toBeGreaterThanOrEqual(1);
      }
      // Not one cut landed on a burrback, and none died.
      const struck = r.events.filter(
        (e) => (e.type === 'enemyHit' || e.type === 'enemyDie') && e.kind === 'burrback',
      );
      expect(struck, hand).toEqual([]);
      // Giving costs: a glint each (the summary says so), and it is cheap next to the masher's lights.
      const gather = r.events.find((e) => e.type === 'gather');
      expect(gather?.type === 'gather' && gather.calmed >= 3 && gather.gifted >= 3, hand).toBe(true);
      expect(r.hits, hand).toBeLessThanOrEqual(2);
      expect(r.fades, hand).toBe(0);
      // What she gave counts in the offering (giving round 2): the giver is not tier 0.
      expect(gather?.type === 'gather' && gather.offerTier >= 1, hand).toBe(true);
      // (The masher on the same road takes more than four hits and fades: the first test above.)
    }
  });

  it('the NATURAL tapper is taught by contrast: the first lantern leaves her one glint, too little to be seen, and burr-path does not see her come; later, carrying, burr-shaft does', () => {
    const r = naive(5, 9);
    const near = r.firstNear['burr-path'];
    expect(near).toBeDefined();
    expect(near?.wallet ?? 99).toBeLessThan(defaultTuning.giving.seen1);
    expect(near?.aware).toBe(false);
    // Round 3: it slept as she came, dark, before she cut it.
    const cutAt = r.events.find((e) => e.type === 'enemyHit' && e.id === 'burr-path');
    expect(r.dozed['burr-path']).toBeGreaterThanOrEqual(0);
    expect(cutAt).toBeDefined();
    // (She cuts what is in her way: it knows her after that. Before her first cut it never saw her.)
    const cut = r.events.findIndex((e) => e.type === 'enemyHit' && e.id === 'burr-path');
    const sawFirst = r.events.findIndex((e) => e.type === 'enemyAware' && e.id === 'burr-path');
    expect(cut).toBeGreaterThan(0);
    expect(sawFirst === -1 || sawFirst > cut).toBe(true);
    expect(
      r.notices.some(
        (n) => n.type === 'enemyAware' && n.id === 'burr-shaft' && n.wallet >= defaultTuning.giving.seen1,
      ),
    ).toBe(true);
  });

  it('the GHOST who lays her light down (no pods; she gives each creature a glint and holds offer at every dormant light she reaches) is never stranded: she finishes', () => {
    const NOPODS: Scene = { ...GROVE, pods: [] };
    for (const [press, beat] of [
      [5, 9],
      [45, 9],
    ] as const) {
      const hand = `press ${press}, beat ${beat}`;
      const r = naive(press, beat, { scene: NOPODS, offer: true, lay: true });
      trace(`ghost laying light down, ${hand}`, r);
      expect(r.ended, hand).toBe(true);
      expect(r.lit, hand).toBe(3);
      expect(
        r.events.some((e) => e.type === 'lanternGift'),
        hand,
      ).toBe(true);
      expect(
        r.events.filter((e) => e.type === 'enemyDie' && e.kind === 'burrback'),
        hand,
      ).toEqual([]);
    }
  });
});

describe("giving round 4: both roads (right first; the moths' road, the ember first)", () => {
  const NOPODS: Scene = { ...GROVE, pods: [] };
  const players = [
    ['natural', {}],
    ['curious', { curious: true }],
    ['giver', { offer: true }],
    ['ghost (no pods, lays light down)', { scene: NOPODS, offer: true, lay: true }],
  ] as const;
  it('natural, curious, giver and ghost finish on both roads; the first creature each road meets sleeps (a burrback dozing, a lampwing roosting) because she is dark', () => {
    for (const emberFirst of [false, true])
      for (const [name, o] of players) {
        const hand = `${emberFirst ? 'ember first' : 'right first'}, ${name}`;
        const r = naive(5, 9, { ...o, emberFirst });
        trace(hand, r);
        expect(r.ended, hand).toBe(true);
        expect(r.lit, hand).toBe(3);
        expect(r.firstMet?.asleep, `${hand}: ${JSON.stringify(r.firstMet)}`).toBe(true);
        expect(r.firstMet?.wallet ?? 99, hand).toBeLessThan(defaultTuning.giving.seen1);
        // The moths' road: the bank's burrback sleeps, and the glade's lampwing roosts over F1.
        if (emberFirst) {
          expect(r.firstMet?.id, hand).toBe('burr-bank');
          expect(r.slept['lamp-glade'], hand).toBeGreaterThanOrEqual(0);
        } else expect(r.firstMet?.id, hand).toBe('burr-path');
      }
  });
});
