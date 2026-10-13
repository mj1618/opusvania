import { describe, expect, it } from 'vitest';
import { GROVE } from '../../src/scene/index';
import type { SimEvent } from '../../src/sim/events';
import { hashState, lampCost, lanternCost, slashBox, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { pickupsWorth } from '../../src/sim/pickups';
import { podsWorth } from '../../src/sim/pods';
import type { EnemyState } from '../../src/sim/state';
import { cloneTuning, defaultTuning, type Tuning } from '../../src/sim/tuning';
import { feet, hopOnto, newSim, type Sim, wallClimb } from './helpers';

/**
 * The first end-to-end proof that the scene can be finished: one playthrough from the spawn with
 * the real controller and real inputs that gathers light, kindles all three lanterns and walks
 * into the woken heart. Every leg is closed-loop on the state (walk until there, cut until it is
 * open, wait until the way is clear), never a list of timings, so tuning changes bend it rather
 * than break it. If a rect, a lantern or the economy moves and the run stops being possible, the
 * failing leg names where.
 *
 * The route, as a first-timer who cuts what is in the way would go: the spawn line -> the pod at the
 * moth-stone's foot (the lantern notices her at 3 of 12; cutting the pod she stands at it, and its ten
 * glints kindle it under her) -> over the pool -> the burrback beyond it -> the branch, the bluff, its
 * pod -> the leap: off the bluff's east lip with jump held, the wings carry her down the glint line to
 * the bark of trunk A; she slides down it into the well at its foot, where the wayside lamp stands (8) -> the doorway under
 * trunk A, the shaft floor (its pod, the great glint at the foot of trunk B, which closes the floor)
 * -> the wall-jump shaft -> trunk A's top (a second lamp) -> trunk B's top, the summit: second lantern -> jump, double jump, glide right over the whole
 * right zone and down onto the far ledge at its lantern (the designed approach): third lantern, the heart wakes -> down to the shrine on the right rise:
 * the heart. If the glide fails, the right route on foot (root, branch, F6, F7) is the fallback.
 * (The road of a player who never glides, down the stair from the summit and up the far bluff's
 * face, is naive-pilot.test.ts.)
 */
const { jump: J, attack: A, left: LEFT, right: RIGHT } = ActionBit;
const bit = (d: number) => (d > 0 ? RIGHT : d < 0 ? LEFT : 0);
const G = defaultTuning.goal;
const S = GROVE.solids;
const lanterns = GROVE.lanterns ?? [];
const lamps = GROVE.lamps ?? [];
const pods = GROVE.pods ?? [];
const foes = GROVE.enemies ?? [];
const of = <T extends SimEvent['type']>(ev: SimEvent[], type: T) =>
  ev.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const tick = (s: Sim, m: number) => step(s.state, m, s.tuning, s.scene, s.events);
const foe = (s: Sim, id: string) => s.state.enemies[foes.findIndex((e) => e.id === id)] as EnemyState;
const rect = (tag: string, n: number) => {
  const r = S.filter((q) => q.tag === tag)[n];
  if (!r) throw new Error(`no ${tag} ${n}`);
  return r;
};

/** Walks along the ground she is on until her feet are within `tol` of x. Frames, or -1. */
function walkTo(s: Sim, x: number, tol = 6, maxFrames = 600): number {
  for (let f = 0; f < maxFrames; f++) {
    const dx = x - feet(s).x;
    if (Math.abs(dx) <= tol && s.state.player.vx === 0 && s.state.player.grounded) return f;
    tick(s, Math.abs(dx) > tol ? bit(dx) : 0);
  }
  return -1;
}

/** Stands still until `done()` (or for `maxFrames`). Frames, or -1. */
function waitFor(s: Sim, done: () => boolean, maxFrames = 600): number {
  for (let f = 0; f < maxFrames; f++) {
    if (done()) return f;
    tick(s, 0);
  }
  return -1;
}

/** Walks up to a sitting pod and cuts until it is open (as the pod pilot does). */
function openPod(s: Sim, id: string, maxFrames = 400): number {
  const i = pods.findIndex((p) => p.id === id);
  const pod = pods[i];
  if (!pod) throw new Error(`no pod ${id}`);
  let prev = 0;
  for (let f = 0; f < maxFrames; f++) {
    if (s.state.pods.hp[i] === 0) return f;
    const dx = pod.x - feet(s).x;
    let m = 0;
    if (Math.abs(dx) > 100) m = bit(dx);
    else if ((prev & A) === 0) m = bit(dx) | A;
    tick(s, m);
    prev = m;
  }
  return -1;
}

/** Keeps a blade's length from a ground enemy and cuts it down (as the burrback pilot does). */
function fightBurr(s: Sim, id: string, maxFrames = 900): number {
  let prev = 0;
  for (let f = 0; f < maxFrames; f++) {
    const e = foe(s, id);
    if (e.mode === 'dead') return f;
    const p = s.state.player;
    const dx = e.x + e.w / 2 - (p.x + p.w / 2);
    const gap = Math.abs(dx) - e.w / 2 - p.w / 2;
    let m = 0;
    if (gap > 78) m = bit(dx);
    else if (gap < 34 && e.mode !== 'hurt') m = bit(-dx);
    else if ((prev & A) === 0) m = (p.facing === Math.sign(dx) ? 0 : bit(dx)) | A;
    tick(s, m);
    prev = m;
  }
  return -1;
}

/** Runs right and jumps the pool from its left lip (the arc the pool glints hang on). */
function leapPool(s: Sim, maxFrames = 300): number {
  const pool = rect('pool', 0);
  let air = false;
  for (let f = 0; f < maxFrames; f++) {
    const p = s.state.player;
    if (air && p.grounded) return f;
    if (!p.grounded) air = true;
    tick(s, RIGHT | (feet(s).x >= pool.x - 40 || air ? J : 0));
  }
  return -1;
}

/** Would a forward cut started now reach a living lampwing (with a little lead: she is flying at it)? */
function lampwingAhead(s: Sim): boolean {
  const p = s.state.player;
  const b = slashBox(p, 'fwd', p.facing, s.tuning, 1);
  for (const e of s.state.enemies) {
    if (e.kind !== 'lampwing' || e.mode === 'dead') continue;
    if (b.x < e.x + e.w + 20 && e.x < b.x + b.w + 20 && b.y - 10 < e.y + e.h && e.y < b.y + b.h + 10)
      return true;
  }
  return false;
}

/**
 * From a height: jump, double jump at the top, then glide toward `aimX` on `r`, cutting any
 * lampwing that comes at her on the way (she flies on through it as it tumbles). Over the spot the
 * wings close and she drops onto it. If she arrives against `r`'s side, below its top: a wall jump
 * off it and up onto it. True if she ends standing on it.
 */
function glideOnto(
  s: Sim,
  r: { x: number; y: number; w: number },
  aimX = r.x + r.w / 2,
  maxFrames = 600,
): boolean {
  let prev = 0;
  let doubled = false;
  let air = false;
  for (let f = 0; f < maxFrames; f++) {
    const p = s.state.player;
    const at = feet(s);
    if (air && p.grounded) break;
    if (!p.grounded) air = true;
    if (p.mode === 'wallSlide' && at.y > r.y && Math.abs(at.x - (r.x + r.w / 2)) < r.w) {
      // Against its side: kick off (the wall jump gives the double jump back), then up and over.
      tick(s, bit(-p.wallDir) | ((prev & J) === 0 ? J : 0));
      if ((prev & J) !== 0) {
        prev = 0;
        continue;
      }
      return hopOnto(s, r, 300) >= 0;
    }
    // Wings closed in time to come down on the spot: she drifts on a little as she drops.
    const over = Math.abs(at.x - aimX) < 40 && at.y <= r.y;
    let m = Math.abs(at.x - aimX) < 12 ? 0 : bit(aimX - at.x);
    if (!air) m |= (prev & J) === 0 ? J : 0;
    else if (!doubled) {
      // Hold through the rise; at the top let go for a frame, then press again.
      if (p.vy < 0) m |= J;
      else if ((prev & J) === 0) {
        m |= J;
        doubled = true;
      }
    } else if (!over) m |= J;
    if (air && p.attackCd === 0 && (prev & A) === 0 && lampwingAhead(s)) m |= A;
    tick(s, m);
    prev = m;
  }
  const at = feet(s);
  return s.state.player.grounded && at.y === r.y && at.x > r.x && at.x < r.x + r.w;
}

/**
 * The leap off the bluff's east lip: a hop with jump held, a run off the lip still holding it. The
 * wings open as she leaves the edge and carry her over the terrace to trunk A's bark; she slides
 * down it into the well at its foot. Frames, or -1.
 */
function leap(s: Sim, maxFrames = 400): number {
  const from = s.events.length;
  for (let f = 0; f < 50; f++) tick(s, J);
  for (let f = 0; f < maxFrames; f++) {
    const p = s.state.player;
    if (p.grounded && feet(s).y === 1280) return of(s.events.slice(from), 'glideStart').length > 0 ? f : -1;
    tick(s, RIGHT | J);
  }
  return -1;
}

/** Walks toward x until the run is gathered. Frames, or -1. */
function walkIntoHeart(s: Sim, x: number, maxFrames = 600): number {
  for (let f = 0; f < maxFrames; f++) {
    if (s.state.goal.gathered) return f;
    tick(s, bit(x - feet(s).x));
  }
  return -1;
}

/** The whole run. Returns the sim and a log of the legs (the frame each was done by, and her wallet then). */
function playthrough(t: Tuning = cloneTuning(defaultTuning)) {
  const s = newSim(GROVE, t);
  const legs: Array<{ leg: string; frame: number; wallet: number; hp: number }> = [];
  const mark = (leg: string, ok: boolean | number) => {
    if (ok === false || ok === -1) throw new Error(`the run stopped at: ${leg} (frame ${s.state.frame})`);
    legs.push({ leg, frame: s.state.frame, wallet: s.state.pickups.count, hp: s.state.player.hp });
  };
  const lit = (i: number) => s.state.goal.lanterns[i]?.lit === true;
  /** To a point on a surface: hop onto the surface if she is not on it, then walk. */
  const walkOrHop = (l: { x: number; y: number }) => {
    if (feet(s).y !== l.y || !s.state.player.grounded) {
      const r = S.find((q) => q.y === l.y && l.x >= q.x && l.x < q.x + q.w);
      if (!r || hopOnto(s, r, 900) < 0) return -1;
    }
    return walkTo(s, l.x, 4);
  };
  const kindle = (i: number, name: string) => {
    const l = lanterns[i];
    if (!l) throw new Error(`no lantern ${i}`);
    // Stand at it until it burns; if something knocks her off it, wait it out and walk back.
    for (let tries = 0; tries < 6 && !lit(i); tries++) {
      mark(`walk to the ${name} lantern`, walkOrHop(l));
      waitFor(s, () => lit(i) || s.state.player.stagger > 0 || s.state.player.faded > 0, 300);
      waitFor(s, () => s.state.player.stagger === 0 && s.state.player.faded === 0, 300);
    }
    mark(`kindle the ${name} lantern`, lit(i));
  };
  const need = (i: number) => lanternCost(lanterns[i] as (typeof lanterns)[number], t.goal);
  /** A wayside lamp on the way: lit if she can spare it (what the lanterns still ask stays in hand). */
  const light = (i: number, name: string) => {
    const l = lamps[i];
    if (!l) throw new Error(`no lamp ${i}`);
    mark(`walk to the ${name} lamp`, walkOrHop(l));
    if (s.state.pickups.count < lampCost(l, t.goal)) return;
    mark(
      `kindle the ${name} lamp`,
      waitFor(s, () => s.state.goal.lamps[i]?.lit === true, 300),
    );
  };

  // --- The left: the spawn line, the pod at the moth-stone's foot, the first lantern.
  mark('walk the spawn line to the pod at the moth-stone', openPod(s, 'pod-stone'));
  // She cut it standing at the lantern: as its glints land the channel starts by itself.
  waitFor(s, () => lit(0) || s.state.pickups.count >= need(0), 120);
  if (s.state.pickups.count < need(0) && !lit(0)) {
    // Still short (a dearer lantern): the shallows, then the arc over the pool and back.
    mark('into the pool', walkTo(s, 1696, 30));
    waitFor(s, () => s.state.pickups.count >= need(0), 60);
    if (s.state.pickups.count < need(0)) {
      mark('out of the pool for the arc', hopOnto(s, rect('ground', 1)) >= 0);
      mark('walk back for a run-up', walkTo(s, 1300, 10));
      mark('leap the pool for its arc', leapPool(s));
      mark('back into the pool', walkTo(s, 1696, 30));
      mark(
        'enough light for the first lantern',
        waitFor(s, () => s.state.pickups.count >= need(0), 120),
      );
    }
  }
  kindle(0, 'moth-stone');

  // --- The centre: over the pool, the path beyond, the bluff, the leap, the trunks, the summit.
  mark('leap the pool', leapPool(s));
  mark('out of the pool if she fell short', hopOnto(s, rect('ground', 2)) >= 0);
  mark('cut down burr-path', fightBurr(s, 'burr-path'));
  // The bluff is taller than a jump: the branch is the step up to it.
  mark('onto the branch', GROVE.oneWays[0] !== undefined && hopOnto(s, GROVE.oneWays[0]) >= 0);
  mark('from the branch onto the bluff', hopOnto(s, rect('ground', 3)) >= 0);
  mark('open pod-rise', openPod(s, 'pod-rise'));
  // The leap: a hop on the spot with jump held, then off the east lip still holding it.
  mark('the leap off the bluff: wings open at the lip', leap(s));
  light(0, 'trunk');
  // Trunk B stands on the floor: the floor ends in the shaft. Its pod, the great glint at trunk B's
  // foot, and then the only way on: up.
  mark('through the doorway under trunk A into the shaft: its pod', openPod(s, 'pod-shaft'));
  mark("to trunk B's foot for the great glint", walkTo(s, 3548, 8));
  mark('back to the middle of the shaft', walkTo(s, 3456, 8));
  mark('wall jumps up the shaft', wallClimb(s, rect('trunk', 0).y, -1) >= 2);
  light(2, 'high');
  mark('onto the summit', hopOnto(s, rect('trunk', 1)) >= 0);
  kindle(1, 'summit');

  // --- The right: the glide, the far ledge, the heart.
  const f7 = rect('floating', 6);
  // (The far bluff: the old far ledge, solid down to the rise now.)
  const far = S.find((q) => q.tag === 'ground' && q.x === 5472) as (typeof S)[number];
  const glided = glideOnto(s, far, (lanterns[2] as { x: number }).x);
  if (!glided) {
    // Knocked out of the air, or short: the right route on foot.
    for (const r of [rect('root', 0), GROVE.oneWays[1], rect('floating', 5), f7])
      mark('the right route on foot', r !== undefined && hopOnto(s, r, 900) >= 0);
    mark('onto the far ledge', hopOnto(s, far) >= 0);
  }
  mark('on the far ledge', feet(s).y === far.y && s.state.player.grounded);
  kindle(2, 'far');

  const heart = GROVE.heart as { x: number; y: number };
  walkTo(s, far.x - 60, 20, 120);
  mark(
    'down to the right rise',
    waitFor(s, () => s.state.player.grounded && feet(s).y === heart.y, 300),
  );
  mark('walk into the heart', walkIntoHeart(s, heart.x));
  mark(
    'the hold',
    waitFor(s, () => s.state.goal.ended, t.goal.holdFrames + 5),
  );
  return { s, legs, glided, ended: s.state.frame };
}

const T = defaultTuning;
const cost = lanterns.reduce((n, l) => n + lanternCost(l, T.goal), 0);
const world = pickupsWorth(GROVE, T.pickups);
const podsAll = podsWorth(GROVE, T.pods);
/** Creatures at their base worth: what the tally's total counts (a finisher's extra is a bonus). */
const kills = foes.reduce((n, e) => n + (e.kind === 'burrback' ? T.burrback.value : T.lampwing.value), 0);

describe('the grove can be finished', () => {
  it('one run from the spawn: three lanterns, the heart, the end', () => {
    const { s, legs, glided, ended } = playthrough();
    const ev = s.events;
    const g = s.state.goal;
    // The first lantern noticed her coming with the spawn line's three; the pod at its foot paid
    // the rest, and it caught without her ever being turned away.
    const notice = of(ev, 'lanternNotice')[0];
    // (It fires 68 px into the run, 260 px out: the spawn line's glints are still flying to her.)
    expect(notice).toMatchObject({ id: 'lantern-stone', need: 12 });
    expect(notice?.have).toBeLessThanOrEqual(3);
    expect(of(ev, 'lanternRefuse')).toHaveLength(0);
    expect(of(ev, 'lanternKindle')[0]?.wallet).toBeLessThanOrEqual(1);
    // The leap landed her by the lamp at trunk A's foot with the line's glints; she lit it, and the
    // one on trunk A's top where the shaft climb sets her down (8 each).
    expect(of(ev, 'lampKindle').map((e) => e.id)).toEqual(['lamp-trunk', 'lamp-high']);
    expect(g.lampsLit).toBe(2);
    // All three, in the order of the route; the heart woke in the step the last one caught.
    const kindled = of(ev, 'lanternKindle');
    expect(kindled.map((e) => e.id)).toEqual(['lantern-stone', 'lantern-crown', 'lantern-far']);
    expect(kindled.map((e) => e.lit)).toEqual([1, 2, 3]);
    expect(types(ev).indexOf('heartWake')).toBe(
      ev.indexOf(kindled[2] as SimEvent) + 1 + calmed(ev, kindled[2]),
    );
    expect(g.lanterns.every((l) => l.lit)).toBe(true);
    // The wallet: everything gathered = what she holds + the 36 spent.
    const gathered = of(ev, 'pickup').reduce((n, e) => n + e.value, 0);
    expect(s.state.pickups.spent).toBe(36 + 16);
    expect(s.state.pickups.count + s.state.pickups.spent).toBe(gathered);
    // The summary is the run: its glints (to the gather), time, kills and hits.
    const gather = of(ev, 'gather')[0];
    if (!gather) throw new Error('no gather');
    const before = ev.slice(0, ev.indexOf(gather));
    // Found + the finisher bonus = everything that reached her; found never passes the total.
    expect(gather.glints + gather.bonus).toBe(of(before, 'pickup').reduce((n, e) => n + e.value, 0));
    expect(gather.glints).toBeLessThanOrEqual(gather.glintsTotal);
    expect(gather.glintsTotal).toBe(world + podsAll + kills);
    expect(gather.lanterns).toBe(3);
    expect(gather.kills).toBe(of(before, 'enemyDie').length);
    expect(gather.hits).toBe(of(before, 'hurt').length);
    expect(gather.kills).toBeGreaterThanOrEqual(1);
    // Her first input is on frame 0, so the time is the frame of the gather; the hold ends 240 steps on.
    expect(gather.time).toBe(ended - G.holdFrames - 1);
    expect(of(ev, 'endHold')).toHaveLength(1);
    expect([g.gathered, g.ended, g.heart.awake]).toEqual([true, true, true]);
    // She stands in the heart, whole or not, and stays there.
    const heart = GROVE.heart as { x: number; y: number };
    expect(Math.abs(feet(s).x - heart.x)).toBeLessThanOrEqual(G.heartWalkPx + 10);
    expect(feet(s).y).toBe(heart.y);
    const x = feet(s).x;
    s.run('R30 J10 A1 L60');
    expect(feet(s).x).toBe(x);
    // The glide leg held (the walk round is only the fallback), and the run is brisk.
    expect(glided).toBe(true);
    expect(gather.time).toBeLessThan(2400);
    expect(legs.length).toBeGreaterThan(20);
    // The trace of the run: `npx vitest run tests/unit/goal-pilot.test.ts --disable-console-intercept`
    // with GOAL_TRACE=1 prints it.
    if (process.env.GOAL_TRACE) {
      const by = { world: 0, pod: 0, enemy: 0 };
      for (const e of of(before, 'pickup')) by[e.pod ? 'pod' : e.enemy ? 'enemy' : 'world'] += e.value;
      console.log(
        legs
          .map(
            (l) =>
              `${String(l.frame).padStart(5)}  wallet ${String(l.wallet).padStart(3)}  hp ${l.hp}  ${l.leg}`,
          )
          .join('\n'),
      );
      console.log(gather, by, hashState(s.state));
    }
  });

  it('is deterministic', () => {
    const a = playthrough();
    const b = playthrough();
    expect(hashState(a.s.state)).toBe(hashState(b.s.state));
    expect(a.s.state.frame).toBe(b.s.state.frame);
  });

  it('is closed-loop: the same pilot finishes under different tuning', () => {
    const variants: Array<[string, (t: Tuning) => void]> = [
      [
        'a slower run',
        (t) => {
          t.run.maxSpeed = 8.4;
        },
      ],
      [
        'a longer channel',
        (t) => {
          t.goal.channelFrames = 75;
        },
      ],
      [
        'dearer lanterns',
        (t) => {
          t.goal.cost = 16;
        },
      ],
      [
        'faster burrbacks',
        (t) => {
          t.burrback.speed = 2.2;
        },
      ],
      [
        'a wider calm and no walk-in',
        (t) => {
          t.goal.calmPx = 2000;
          t.goal.heartWalkPx = 0;
        },
      ],
    ];
    for (const [name, change] of variants) {
      const t = cloneTuning(defaultTuning);
      change(t);
      const { s } = playthrough(t);
      expect(s.state.goal.ended, name).toBe(true);
      expect(s.state.goal.lit, name).toBe(3);
    }
  });
});

describe('economy: what the lanterns ask against what the grove holds', () => {
  it('36 in all: under half of the world glints alone, a fifth of everything', () => {
    expect(cost).toBe(36);
    expect([world, podsAll, kills]).toEqual([96, 62, 31]);
    // A player who never cuts a pod or a creature can still pay for all three.
    expect(world).toBeGreaterThanOrEqual(cost * 2);
    expect(cost / (world + podsAll + kills)).toBeLessThan(0.25);
    expect(cost / (world + podsAll + kills)).toBeGreaterThan(0.15);
  });

  it('the pilot run, which goes straight for the goal, gathers about twice what it spends', () => {
    const { s } = playthrough();
    const gathered = s.state.goal.ending.glints;
    expect(cost / gathered).toBeGreaterThan(0.35);
    expect(cost / gathered).toBeLessThan(0.55);
  });

  it('the first lantern cannot be paid from the spawn line alone, but can from what lies within a screen of it', () => {
    const l = lanterns[0] as (typeof lanterns)[number];
    const near = (px: number) =>
      (GROVE.pickups ?? [])
        .filter((p) => Math.abs(p.x - l.x) <= px && p.y > 900)
        .reduce((n, p) => n + (p.kind === 'great' ? T.pickups.greatValue : 1), 0);
    // On the way from the spawn: the three of the spawn line.
    expect((GROVE.pickups ?? []).filter((p) => p.x > GROVE.spawn.x && p.x < l.x && p.y > 1200)).toHaveLength(
      3,
    );
    // Low glints within 450 px (spawn line, pool arc, pool shallows): one short of the cost.
    expect(near(450)).toBe(11);
    expect(near(450)).toBeLessThan(lanternCost(l, T.goal));
    // Within a screen: enough.
    expect(near(1000)).toBeGreaterThanOrEqual(lanternCost(l, T.goal));
  });
});

const types = (ev: SimEvent[]) => ev.map((e) => e.type);
/** How many `enemyGiveUp` / other events the calm put between a kindle and what follows it. */
function calmed(ev: SimEvent[], k: SimEvent | undefined): number {
  if (!k) return 0;
  let n = 0;
  for (let i = ev.indexOf(k) + 1; i < ev.length && ev[i]?.type === 'enemyGiveUp'; i++) n++;
  return n;
}
