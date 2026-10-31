/**
 * The Canopy, round 14 (review canopy-r13.md; memory/canopy.md v14):
 *  - The kill's payoff (#1): the carcass rolls clear of the fallen cage; `den-end` leans to it.
 *  - The Keeper's honest tells (#2, #3, #7): the sweep reared and not open; P1's beat before the fast rams; the gate
 *    as state; a cut that meets it never counts on the cage; beaten, it is gone on a later visit.
 *  - The full escape (moment 7): rebuilt in r15 (canopy-r15.test.ts).
 *  - The chase (#5): an on-reach press holds to the nest; a fall puts her back at her last hook.
 *  - The sit (#4): `crown-sit` pushes in.
 *  - Audio's bug: a dark chase hook never sends `lureRelight`.
 */
import { describe, expect, it } from 'vitest';
import { getRoom } from '../../src/scene/index';
import { getWorld } from '../../src/scene/world';
import type { SimEvent } from '../../src/sim/events';
import { createState, newSave, placePlayer, step } from '../../src/sim/index';
import { ActionBit } from '../../src/sim/input';
import { flingTarget } from '../../src/sim/lures';
import type { GameState } from '../../src/sim/state';
import { cloneTuning, defaultTuning } from '../../src/sim/tuning';
import { withShortcuts } from '../../src/sim/world';

const t = cloneTuning(defaultTuning);
const W = getWorld('canopy');
const CG = ['wallJump', 'glide'];

function at(room: string, x: number, y: number, kit: string[] = CG, flags: string[] = []): GameState {
  const scene = getRoom(room);
  const save = newSave(kit as never);
  save.flags.push(...flags);
  const s = createState(1, t, scene, [], kit as never, save);
  placePlayer(s, x, y, t, withShortcuts(scene, s.save), []);
  s.player.dj = 0;
  return s;
}
function run(s: GameState, input: number, n = 1, ev: SimEvent[] = []): SimEvent[] {
  for (let k = 0; k < n; k++) {
    const e: SimEvent[] = [];
    step(s, input, t, withShortcuts(getRoom(s.room), s.save), e, W);
    ev.push(...e);
  }
  return ev;
}
const { jump: J, right: R, left: L, up: U, down: D, attack: A, lamp: B } = ActionBit;
type Of<K extends SimEvent['type']> = Extract<SimEvent, { type: K }>;
const den = getRoom('cn-den');
const cageIx = (den.lures ?? []).findIndex((l) => l.id === 'trap-den');
const burr = (s: GameState) => s.enemies.find((e) => e.id === 'old-burr') as GameState['enemies'][number];

function fight(x = 1000): GameState {
  const s = at('cn-den', x, 1344);
  run(s, 0, 100);
  return s;
}
/** On to P3 (its gates opened by hand). */
function toP3(s: GameState): void {
  if (s.boss) s.boss.drops = t.keeper.p1Drops;
  burr(s).hp = t.keeper.p2Hp;
  run(s, 0, 200);
  if (s.boss) s.boss.phaseTime = t.keeper.p2MinFrames + 1;
  burr(s).hp = t.keeper.p3Hp;
  run(s, 0, 200);
}

describe("the Keeper's honest tells (r14, review r13 #2, #3, #7)", () => {
  it("P3's sweep tell is reared and not open (a cut glances: `sweep`), then the claws, then it eats, open", () => {
    const s = fight();
    toP3(s);
    expect(s.boss?.phase).toBe(3);
    const ev: SimEvent[] = [];
    for (let f = 0; f < 1500 && !ev.some((q) => q.type === 'keeperSweepTell'); f++) {
      s.player.invuln = 30;
      placePlayer(s, 700, 1344, t, withShortcuts(den, s.save), []);
      run(s, 0, 1, ev);
    }
    const tell = ev.find((q) => q.type === 'keeperSweepTell') as Of<'keeperSweepTell'>;
    expect(tell?.frames).toBe(t.keeper.sweepTell);
    const e = burr(s);
    expect(e.mode).toBe('sweep');
    expect(e.stunned).toBe(false);
    expect(s.boss?.sweep).toBe(1);
    expect(s.boss?.tell).toBe('sweep');
    expect((s.boss?.tellX1 ?? 0) - (s.boss?.tellX0 ?? 0)).toBe(2 * t.keeper.sweepHitPx);
    // A cut on it in the tell (from behind, out of the claws' line) glances.
    const g: SimEvent[] = [];
    const side = e.facing > 0 ? e.x - 20 : e.x + e.w + 20;
    placePlayer(s, side, 1344, t, withShortcuts(den, s.save), []);
    s.player.invuln = 60;
    run(s, e.facing > 0 ? R : L, 1, g);
    run(s, A, 1, g);
    run(s, 0, 8, g);
    expect(g.some((q) => q.type === 'keeperGlance' && q.why === 'sweep')).toBe(true);
    expect(g.some((q) => q.type === 'enemyHit' && q.id === 'old-burr')).toBe(false);
    // The claws, then it eats, open.
    const ev2: SimEvent[] = [];
    for (let f = 0; f < 120 && !ev2.some((q) => q.type === 'keeperEat'); f++) {
      s.player.invuln = 30;
      placePlayer(s, 500, 1344, t, withShortcuts(den, s.save), []);
      run(s, 0, 1, ev2);
    }
    const iSweep = ev2.findIndex((q) => q.type === 'keeperSweep');
    const iEat = ev2.findIndex((q) => q.type === 'keeperEat');
    expect(iSweep).toBeGreaterThanOrEqual(0);
    expect(iEat).toBeGreaterThan(iSweep);
    expect((ev2[iEat] as Of<'keeperEat'>).sweep).toBe(true);
    expect(burr(s).mode).toBe('eat');
    expect(burr(s).stunned).toBe(true);
  });

  it("P1's beat: slow rams until its first moth is gone, then it rears and slams (no wave), and its rams are fast", () => {
    const s = fight(1000);
    const ev: SimEvent[] = [];
    for (let f = 0; f < 2400 && !ev.some((q) => q.type === 'keeperRage' && q.phase === 'slam'); f++) {
      s.player.invuln = 60;
      run(s, 0, 1, ev);
    }
    const rear = ev.findIndex((q) => q.type === 'keeperRage' && q.phase === 'rear');
    const slam = ev.findIndex((q) => q.type === 'keeperRage' && q.phase === 'slam');
    expect(rear).toBeGreaterThanOrEqual(0);
    expect(slam).toBeGreaterThan(rear);
    // Never before its first moth has gone (eaten or caught).
    const moth = ev.findIndex((q) => q.type === 'mothEaten' || q.type === 'mothSaved');
    expect(moth).toBeGreaterThanOrEqual(0);
    expect(rear).toBeGreaterThan(moth);
    // Every ram before it is a slow one (the long tell); no wave from the beat's slam.
    for (const q of ev.slice(0, rear))
      if (q.type === 'enemyWindup') expect(q.speed).toBeLessThan(t.oldBurrback.chargeSpeed);
    expect(burr(s).wave).toBe(0);
    expect(s.boss?.angry).toBe(2);
    // After it, its rams are the fast ones (r15, review r14 #6: the first of them a bridge, told longer, slower).
    const ev2: SimEvent[] = [];
    for (let f = 0; f < 3600 && ev2.filter((q) => q.type === 'enemyWindup').length < 2; f++) {
      s.player.invuln = 60;
      run(s, 0, 1, ev2);
    }
    const [w, w2] = ev2.filter((q) => q.type === 'enemyWindup') as Of<'enemyWindup'>[];
    expect(w?.speed).toBeCloseTo(t.oldBurrback.chargeSpeed * t.keeper.bridgeSpeed);
    expect(w2?.speed).toBe(t.oldBurrback.chargeSpeed);
    expect(w?.frames ?? 0).toBeGreaterThan(w2?.frames ?? 0);
  });

  it('at its gate: `keeperGate` on (why `moths` in P1), `boss.gated`; off once the gate lets go', () => {
    const s = fight(1000);
    const ev: SimEvent[] = [];
    burr(s).hp = t.keeper.p2Hp;
    run(s, 0, 2, ev);
    const on = ev.find((q) => q.type === 'keeperGate') as Of<'keeperGate'>;
    expect(on?.on).toBe(true);
    expect(on?.why).toBe('moths');
    expect(s.boss?.gated).toBe(1);
    if (s.boss) s.boss.drops = t.keeper.p1Drops;
    const ev2 = run(s, 0, 2);
    expect(ev2.some((q) => q.type === 'keeperGate' && !q.on)).toBe(true);
  });

  it('a cut that meets the Keeper is its own: never a cut on the cage beside it', () => {
    const s = fight();
    toP3(s);
    const live = s.lures.live;
    if (live) live.free[cageIx] = 1;
    const cx = s.boss?.cageX ?? 0;
    const e = burr(s);
    // It stands over the cage, open (its eat): she cuts up at the cage from inside its box.
    e.x = Math.round(cx - e.w / 2);
    const ev: SimEvent[] = [];
    for (let n = 0; n < 4; n++) {
      e.x = Math.round(cx - e.w / 2);
      e.stunned = true;
      s.player.invuln = 60;
      placePlayer(s, cx, 1344, t, withShortcuts(den, s.save), []);
      run(s, U | A, 1, ev);
      run(s, U, 20, ev);
    }
    expect(ev.some((q) => q.type === 'cageRelease')).toBe(false);
    expect(
      ev.some((q) => q.type === 'slashHit' && q.target.kind === 'lure' && q.target.id === 'trap-den'),
    ).toBe(false);
  });
});

describe("the kill's payoff (r14, review r13 #1)", () => {
  it('the death roll carries the carcass clear of the fallen cage; `den-end` leans to the cage until the release', () => {
    const s = fight();
    toP3(s);
    if (s.boss) s.boss.sweeps = t.keeper.p3Sweeps;
    const e = burr(s);
    const cx = s.boss?.cageX ?? 0;
    // Down beside the cage.
    e.x = Math.round(cx + 40 - e.w / 2);
    e.hp = 1;
    e.stunned = true;
    const ev: SimEvent[] = [];
    for (let n = 0; n < 12 && !ev.some((q) => q.type === 'keeperRoll'); n++) {
      e.stunned = true;
      s.player.invuln = 60;
      placePlayer(s, e.x + e.w + 30, 1344, t, withShortcuts(den, s.save), []);
      run(s, L, 1, ev);
      run(s, A, 1, ev);
      run(s, 0, 20, ev);
    }
    const roll = ev.find((q) => q.type === 'keeperRoll') as Of<'keeperRoll'>;
    expect(roll).toBeDefined();
    expect(Math.abs(roll.toX - cx)).toBeGreaterThanOrEqual(t.keeper.rollClearPx);
    run(s, 0, t.keeper.rollFrames + 5);
    expect(Math.abs(e.x + e.w / 2 - roll.toX)).toBeLessThanOrEqual(1);
    const zones = den.camera?.zones ?? [];
    expect(zones.map((z) => z.id).slice(0, 3)).toEqual(['arena', 'den-end', 'escape']);
    expect(zones[0]?.until).toBe('cn-den-down');
    const end = zones[1];
    expect(end?.until).toBe('cn-den-freed');
    expect(end?.lean?.x).toBe(s.boss?.cageX);
    expect(end?.zoom).toBeGreaterThan(1);
  });

  it('beaten on an earlier visit, it is not there (a re-entry found it awake)', () => {
    const s = at('cn-den', 1600, 1344, CG, ['cn-den-met', 'cn-den-fed', 'cn-den-down']);
    run(s, 0, 120);
    expect(burr(s).gone).toBe(true);
    expect(s.boss?.stage).toBe('down');
  });
});

// (The full escape's tests moved to canopy-r15.test.ts: r15 rebuilt it low and east, then the clifftop's chimney.)

// --- The chase.
const gap = getRoom('cn-gap');
const ix = (id: string) => (gap.lures ?? []).findIndex((l) => l.id === id);

/** In reach of the hook she is at: the Lamp with `aim`, let go; then holding its side until `next` is in reach. */
function flingOn(s: GameState, aim: number, next: string, ev: SimEvent[]): boolean {
  for (let i = 0; i < 4; i++) run(s, aim | B, 1, ev);
  run(s, aim, 1, ev);
  for (let k = 0; k < 160; k++) {
    if (next && flingTarget(s, withShortcuts(gap, s.save), t) === ix(next)) return true;
    run(s, aim & (L | R), 1, ev);
    if (s.player.grounded && k > 4) return next === '';
  }
  return false;
}

describe('the chase holds (r14, review r13 #5)', () => {
  it('pressed the instant each hook is in reach, the S holds to the nest; the firefly dives only as she flies in', () => {
    const s = at('cn-gap', 4300, 1344);
    const ev: SimEvent[] = [];
    run(s, L, 40, ev);
    run(s, 0, 40, ev);
    for (let k = 0; k < 120 && Math.abs(s.player.x + s.player.w / 2 - 4150) > 12; k++)
      run(s, s.player.x + s.player.w / 2 < 4150 ? R : L, 1, ev);
    let n = 0;
    while (flingTarget(s, withShortcuts(gap, s.save), t) !== ix('hook-1') && n++ < 40) run(s, J, 1, ev);
    const plan: Array<[number, string]> = [
      [U, 'hook-2'],
      [U, 'hook-3'],
      [L, 'hook-4'],
      [D | L, 'hook-5'],
      [D | R, 'hook-6'],
      [D | L, 'hook-7'],
      [L, ''],
    ];
    for (const [aim, next] of plan) expect(flingOn(s, aim, next, ev)).toBe(true);
    run(s, 0, 20, ev);
    // In the pocket (the roost's shelf).
    expect(s.player.y + s.player.h).toBe(1216);
    const nest = ev.findIndex((q) => q.type === 'fireflyChase' && q.phase === 'nest');
    expect(nest).toBeGreaterThan(ev.findIndex((q) => q.type === 'fling' && q.id === 'hook-7'));
    expect(ev.some((q) => q.type === 'fireflyChase' && q.phase === 'back')).toBe(false);
  });

  it('a fall in the chase puts her back at her last hook, drifting in its reach; a press there flings', () => {
    const s = at('cn-gap', 4300, 1344);
    const ev: SimEvent[] = [];
    run(s, L, 40, ev);
    run(s, 0, 40, ev);
    for (let k = 0; k < 120 && Math.abs(s.player.x + s.player.w / 2 - 4150) > 12; k++)
      run(s, s.player.x + s.player.w / 2 < 4150 ? R : L, 1, ev);
    let n = 0;
    while (flingTarget(s, withShortcuts(gap, s.save), t) !== ix('hook-1') && n++ < 40) run(s, J, 1, ev);
    for (const [aim, next] of [
      [U, 'hook-2'],
      [U, 'hook-3'],
      [L, 'hook-4'],
      [D | L, 'hook-5'],
    ] as Array<[number, string]>)
      expect(flingOn(s, aim, next, ev)).toBe(true);
    // Off hook-5 the wrong way (down-left): she falls short and lands on the shelf: a fall.
    flingOn(s, D | L, '', ev);
    const ev2: SimEvent[] = [];
    for (let f = 0; f < 120 && !ev2.some((q) => q.type === 'fallReturn'); f++) run(s, 0, 1, ev2);
    const back = ev2.find((q) => q.type === 'fireflyChase' && q.phase === 'back') as Of<'fireflyChase'>;
    expect(back?.lure).toBe('hook-5');
    const h5 = gap.lures?.[ix('hook-5')];
    expect(Math.abs(s.player.x + s.player.w / 2 - (h5?.x ?? 0))).toBeLessThanOrEqual(2);
    expect(s.player.grounded).toBe(false);
    expect(s.lures.hp[ix('hook-5')]).toBeGreaterThan(0);
    // It drifts there (the lesson's slow fall) long enough for a press after the fade-in.
    run(s, 0, t.room.returnFadeIn + 10);
    expect(s.player.lessonK).toBeGreaterThan(0.5);
    expect(flingTarget(s, withShortcuts(gap, s.save), t)).toBe(ix('hook-5'));
    expect(flingOn(s, D | R, 'hook-6', ev2)).toBe(true);
  });
});

describe('the chase is flown, not skipped (r14, first-timer ft14chase)', () => {
  it('gliding low off the shelf into the roost does not send the firefly to its nest: it waits at a stop', () => {
    const s = at('cn-gap', 4300, 1344);
    const ev: SimEvent[] = [];
    run(s, L, 40, ev);
    run(s, 0, 40, ev);
    expect(ev.some((q) => q.type === 'fireflyChase' && q.phase === 'start')).toBe(true);
    // (As the first-timer did: off the shelf's west lip, wings open, into the hanging roots' pocket.)
    for (let k = 0; k < 120 && s.player.x + s.player.w / 2 > 3500; k++) run(s, L, 1, ev);
    run(s, L | J, 80, ev);
    for (let k = 0; k < 200 && !s.player.grounded; k++) run(s, L | J, 1, ev);
    run(s, 0, 600, ev);
    expect(s.player.y + s.player.h).toBe(1216);
    expect(ev.some((q) => q.type === 'fireflyChase' && q.phase === 'nest')).toBe(false);
    expect(s.kit.firefly.beat).toBe(3);
    // Out by the roost's shaft and back in: it perches at its start again, its lit hooks lit, and bolts once she is
    // back on the shelf (it never ends unflown by the nest).
    const lit = (gap.lures ?? []).filter(
      (l, i) => l.id.startsWith('hook-') && (s.lures.hp[i] ?? 0) > 0,
    ).length;
    const s2 = at('cn-gap', 3040, 1216, CG, [...s.save.flags]);
    const ev2 = run(s2, 0, 300);
    expect(s2.kit.firefly.beat).toBe(0);
    expect(ev2.some((q) => q.type === 'fireflyChase' && q.phase === 'nest')).toBe(false);
    expect(
      (gap.lures ?? []).filter((l, i) => l.id.startsWith('hook-') && (s2.lures.hp[i] ?? 0) > 0).length,
    ).toBe(lit);
    placePlayer(s2, 3900, 1344, t, withShortcuts(gap, s2.save), []);
    const ev3 = run(s2, 0, 60);
    expect(ev3.some((q) => q.type === 'fireflyChase' && q.phase === 'start')).toBe(true);
  });
});

describe('moonlight for two pushes in (r14, review r13 #4)', () => {
  it('`crown-sit` after the kin sits: 1.3 over 2 s, leaning to the moon', () => {
    const z = getRoom('cn-crown').camera?.zones?.find((q) => q.id === 'crown-sit');
    expect(z?.after).toBe('cn-kin-sat');
    expect(z?.zoom).toBe(1.3);
    expect(z?.frames).toBe(120);
    expect(z?.lean?.k).toBeGreaterThan(0);
  });
});

describe("a dark hook never relights (audio's bug, r14)", () => {
  it('the gap with the firefly perched: no `lureRelight` for a hook it has not kindled', () => {
    const s = at('cn-gap', 4300, 1344);
    const ev = run(s, 0, 300);
    const dark = ev.filter((q) => q.type === 'lureRelight' && q.id.startsWith('hook-') && q.id !== 'hook-1');
    expect(dark.length).toBe(0);
    // (Before the fix: ~5 a frame.) And over the whole run, every relight is of a lit-able hook, at most once a frame.
    expect(ev.filter((q) => q.type === 'lureRelight').length).toBeLessThan(10);
  });
});
